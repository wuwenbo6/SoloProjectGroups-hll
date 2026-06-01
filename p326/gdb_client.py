from __future__ import annotations
import asyncio
import struct
import logging
from rsp_protocol import (
    encode_packet, read_packet_from_stream,
    make_ack, decode_regs_x86_64, bytes_to_hex, hex_to_bytes,
    REGISTER_INFO_X86_64,
)

logger = logging.getLogger(__name__)


class GDBClient:
    def __init__(self, host: str = "127.0.0.1", port: int = 1234):
        self.host = host
        self.port = port
        self._reader: asyncio.StreamReader | None = None
        self._writer: asyncio.StreamWriter | None = None
        self._buf = b""
        self._no_ack = False

    async def connect(self):
        self._reader, self._writer = await asyncio.open_connection(
            self.host, self.port
        )
        logger.info(f"Connected to {self.host}:{self.port}")

    async def close(self):
        if self._writer:
            self._writer.close()
            await self._writer.wait_closed()

    async def send_command(self, cmd: str) -> str:
        pkt = encode_packet(cmd)
        self._writer.write(pkt)
        await self._writer.drain()

        while True:
            payload, self._buf = read_packet_from_stream(self._buf)
            if payload is not None:
                if not self._no_ack:
                    self._writer.write(make_ack())
                    await self._writer.drain()
                return payload

            data = await self._reader.read(4096)
            if not data:
                raise ConnectionError("Server closed connection")

            if not self._no_ack:
                ack_data = data.lstrip(b"+")
                if ack_data:
                    self._buf += ack_data
                else:
                    self._buf += data
            else:
                self._buf += data

    async def query_supported(self) -> str:
        return await self.send_command("qSupported")

    async def query_register_info(self, reg_num: int) -> str:
        return await self.send_command(f"qRegisterInfo{reg_num:x}")

    async def query_stop_reason(self) -> str:
        return await self.send_command("?")

    async def read_registers(self) -> dict[str, int]:
        hex_data = await self.send_command("g")
        return decode_regs_x86_64(hex_data)

    async def write_registers(self, regs_hex: str) -> str:
        return await self.send_command(f"G{regs_hex}")

    async def read_register(self, reg_num: int) -> int:
        resp = await self.send_command(f"p{reg_num:x}")
        if resp.startswith("E"):
            raise ValueError(f"Error reading register {reg_num}")
        val_bytes = bytes.fromhex(resp)
        if len(val_bytes) == 8:
            return struct.unpack("<Q", val_bytes)[0]
        elif len(val_bytes) == 4:
            return struct.unpack("<I", val_bytes)[0]
        return 0

    async def write_register(self, reg_num: int, value: int) -> str:
        return await self.send_command(f"P{reg_num:x}={value:x}")

    async def read_memory(self, addr: int, length: int) -> bytes:
        resp = await self.send_command(f"m{addr:x},{length:x}")
        if resp.startswith("E"):
            raise ValueError(f"Error reading memory at 0x{addr:x}")
        return bytes.fromhex(resp)

    async def write_memory(self, addr: int, data: bytes) -> str:
        hex_data = data.hex()
        return await self.send_command(f"M{addr:x},{len(data):x}:{hex_data}")

    async def step(self) -> str:
        return await self.send_command("s")

    async def continue_exec(self) -> str:
        return await self.send_command("c")

    async def add_breakpoint(self, addr: int) -> str:
        return await self.send_command(f"Z0,{addr:x},1")

    async def remove_breakpoint(self, addr: int) -> str:
        return await self.send_command(f"z0,{addr:x},1")

    async def vfile_open(self, path: str, flags: int = 0, mode: int = 0o644) -> int:
        path_hex = path.encode("utf-8").hex()
        resp = await self.send_command(f"vFile:open:{path_hex},{flags:x},{mode:x}")
        if resp.startswith("F-1"):
            err = int(resp.split(",")[1])
            raise IOError(f"vFile open failed, errno={err}")
        return int(resp[1:])

    async def vfile_close(self, fd: int) -> int:
        resp = await self.send_command(f"vFile:close:{fd:x}")
        if resp.startswith("F-1"):
            err = int(resp.split(",")[1])
            raise IOError(f"vFile close failed, errno={err}")
        return int(resp[1:])

    async def vfile_pread(self, fd: int, count: int, offset: int) -> bytes:
        resp = await self.send_command(f"vFile:pread:{fd:x},{count:x},{offset:x}")
        if resp.startswith("F-1"):
            err = int(resp.split(",")[1])
            raise IOError(f"vFile pread failed, errno={err}")
        parts = resp.split(";", 1)
        nread = int(parts[0][1:])
        if len(parts) < 2:
            return b""
        return bytes.fromhex(parts[1])[:nread]

    async def vfile_pwrite(self, fd: int, offset: int, data: bytes) -> int:
        resp = await self.send_command(f"vFile:pwrite:{fd:x},{offset:x},{data.hex()}")
        if resp.startswith("F-1"):
            err = int(resp.split(",")[1])
            raise IOError(f"vFile pwrite failed, errno={err}")
        return int(resp[1:])

    async def vfile_unlink(self, path: str) -> int:
        path_hex = path.encode("utf-8").hex()
        resp = await self.send_command(f"vFile:unlink:{path_hex}")
        if resp.startswith("F-1"):
            err = int(resp.split(",")[1])
            raise IOError(f"vFile unlink failed, errno={err}")
        return int(resp[1:])

    async def vfile_stat(self, path: str) -> dict:
        path_hex = path.encode("utf-8").hex()
        resp = await self.send_command(f"vFile:stat:{path_hex}")
        if resp.startswith("F-1"):
            err = int(resp.split(",")[1])
            raise IOError(f"vFile stat failed, errno={err}")
        parts = resp.split(";", 1)
        if len(parts) < 2:
            return {}
        data = bytes.fromhex(parts[1])
        return self._decode_stat(data)

    async def vfile_fstat(self, fd: int) -> dict:
        resp = await self.send_command(f"vFile:fstat:{fd:x}")
        if resp.startswith("F-1"):
            err = int(resp.split(",")[1])
            raise IOError(f"vFile fstat failed, errno={err}")
        parts = resp.split(";", 1)
        if len(parts) < 2:
            return {}
        data = bytes.fromhex(parts[1])
        return self._decode_stat(data)

    def _decode_stat(self, data: bytes) -> dict:
        import struct
        if len(data) < 88:
            return {}
        fields = struct.unpack("<QQQqQQQQqqq", data[:88])
        return {
            "st_dev": fields[0],
            "st_ino": fields[1],
            "st_mode": fields[2],
            "st_nlink": fields[3],
            "st_uid": fields[4],
            "st_gid": fields[5],
            "st_rdev": fields[6],
            "st_size": fields[7],
            "st_blksize": fields[8],
            "st_blocks": fields[9],
            "st_atime": fields[10],
        }

    async def export_debug_log(self) -> str:
        resp = await self.send_command("qXfer:traceframe-info:write:log")
        try:
            return bytes.fromhex(resp).decode("utf-8")
        except ValueError:
            return resp

    async def save_debug_log(self, local_path: str):
        content = await self.export_debug_log()
        with open(local_path, "w", encoding="utf-8") as f:
            f.write(content)
        return len(content)

    def _format_regs(self, regs: dict[str, int]) -> str:
        lines = []
        gp = ["rax", "rbx", "rcx", "rdx", "rsi", "rdi", "rbp", "rsp"]
        ext = ["r8", "r9", "r10", "r11", "r12", "r13", "r14", "r15"]
        row1 = "  ".join(f"{n}=0x{regs.get(n,0):016X}" for n in gp[:4])
        row2 = "  ".join(f"{n}=0x{regs.get(n,0):016X}" for n in gp[4:8])
        row3 = "  ".join(f"{n}=0x{regs.get(n,0):016X}" for n in ext[:4])
        row4 = "  ".join(f"{n}=0x{regs.get(n,0):016X}" for n in ext[4:8])
        rip = f"rip=0x{regs.get('rip',0):016X}"
        flags = f"eflags=0x{regs.get('eflags',0):08X}"
        lines.append(row1)
        lines.append(row2)
        lines.append(row3)
        lines.append(row4)
        lines.append(f"{rip}  {flags}")
        return "\n".join(lines)


async def interactive_session(host: str, port: int):
    client = GDBClient(host, port)
    await client.connect()

    print("=== GDB RSP Client - Interactive Debug Session ===")
    print("Commands: regs, step, continue, bp <addr>, rmbp <addr>, mem <addr> <len>,")
    print("          reginfo, vopen, vclose, vread, vwrite, vstat, vlist,")
    print("          savelog <path>, quit, help")
    print()

    try:
        resp = await client.query_supported()
        print(f"[qSupported] {resp}")

        resp = await client.query_stop_reason()
        print(f"[Stop reason] {resp}")

        while True:
            try:
                cmd = input("(gdb-rsp) ").strip()
            except EOFError:
                break

            if not cmd:
                continue

            parts = cmd.split()
            verb = parts[0].lower()

            if verb == "quit" or verb == "q":
                break
            elif verb == "help" or verb == "h":
                print("Available commands:")
                print("  regs            - Show all registers")
                print("  step / s        - Single step")
                print("  continue / c    - Continue execution")
                print("  bp <addr>       - Set breakpoint (e.g., bp 400000)")
                print("  rmbp <addr>     - Remove breakpoint")
                print("  mem <addr> <n>  - Read n bytes from memory")
                print("  reginfo         - Query register info")
                print("  vopen <path>    - Open remote file (creates if not exists)")
                print("  vclose <fd>     - Close remote file descriptor")
                print("  vread <fd> <n>  - Read n bytes from fd at offset 0")
                print("  vwrite <fd> <text> - Write text to fd at offset 0")
                print("  vstat <path>    - Stat a remote file")
                print("  vlist           - List open file descriptors")
                print("  savelog <path>  - Export and save debug log to local file")
                print("  quit            - Exit")
            elif verb == "regs":
                regs = await client.read_registers()
                print(client._format_regs(regs))
            elif verb in ("step", "s"):
                resp = await client.step()
                print(f"[Step] {resp}")
                regs = await client.read_registers()
                print(f"  rip=0x{regs.get('rip',0):016X}")
            elif verb in ("continue", "c"):
                resp = await client.continue_exec()
                print(f"[Continue] {resp}")
                regs = await client.read_registers()
                print(f"  rip=0x{regs.get('rip',0):016X}")
            elif verb in ("bp", "break"):
                if len(parts) < 2:
                    print("Usage: bp <addr>  (e.g., bp 400000)")
                    continue
                try:
                    addr = int(parts[1], 16) if parts[1].startswith("0x") or len(parts[1]) > 5 else int(parts[1], 0)
                    resp = await client.add_breakpoint(addr)
                    print(f"[Breakpoint] Set at 0x{addr:X} -> {resp}")
                except ValueError:
                    print("Invalid address")
            elif verb in ("rmbp", "delete"):
                if len(parts) < 2:
                    print("Usage: rmbp <addr>")
                    continue
                try:
                    addr = int(parts[1], 16) if parts[1].startswith("0x") or len(parts[1]) > 5 else int(parts[1], 0)
                    resp = await client.remove_breakpoint(addr)
                    print(f"[Breakpoint] Removed at 0x{addr:X} -> {resp}")
                except ValueError:
                    print("Invalid address")
            elif verb in ("mem", "memory", "x"):
                if len(parts) < 3:
                    print("Usage: mem <addr> <length>")
                    continue
                try:
                    addr = int(parts[1], 16) if parts[1].startswith("0x") or len(parts[1]) > 5 else int(parts[1], 0)
                    length = int(parts[2], 0)
                    data = await client.read_memory(addr, length)
                    hex_str = " ".join(f"{b:02X}" for b in data)
                    print(f"[Memory 0x{addr:X}+{length}] {hex_str}")
                except (ValueError, Exception) as e:
                    print(f"Error: {e}")
            elif verb == "reginfo":
                for i in range(24):
                    resp = await client.query_register_info(i)
                    print(f"  reg{i}: {resp}")
            elif verb == "vopen":
                if len(parts) < 2:
                    print("Usage: vopen <path>")
                    continue
                path = parts[1]
                flags = 0o102  # O_CREAT | O_RDWR
                try:
                    fd = await client.vfile_open(path, flags=flags)
                    print(f"[vFile] Opened {path}, fd={fd}")
                except Exception as e:
                    print(f"Error: {e}")
            elif verb == "vclose":
                if len(parts) < 2:
                    print("Usage: vclose <fd>")
                    continue
                try:
                    fd = int(parts[1])
                    await client.vfile_close(fd)
                    print(f"[vFile] Closed fd={fd}")
                except Exception as e:
                    print(f"Error: {e}")
            elif verb == "vread":
                if len(parts) < 3:
                    print("Usage: vread <fd> <count>")
                    continue
                try:
                    fd = int(parts[1])
                    count = int(parts[2])
                    data = await client.vfile_pread(fd, count, 0)
                    text = data.decode("utf-8", errors="replace")
                    hex_str = " ".join(f"{b:02X}" for b in data)
                    print(f"[vFile] fd={fd} read {len(data)} bytes:")
                    print(f"  hex: {hex_str}")
                    print(f"  text: {text}")
                except Exception as e:
                    print(f"Error: {e}")
            elif verb == "vwrite":
                if len(parts) < 3:
                    print("Usage: vwrite <fd> <text>")
                    continue
                try:
                    fd = int(parts[1])
                    text = " ".join(parts[2:])
                    data = text.encode("utf-8")
                    n = await client.vfile_pwrite(fd, 0, data)
                    print(f"[vFile] fd={fd} wrote {n} bytes")
                except Exception as e:
                    print(f"Error: {e}")
            elif verb == "vstat":
                if len(parts) < 2:
                    print("Usage: vstat <path>")
                    continue
                path = parts[1]
                try:
                    st = await client.vfile_stat(path)
                    print(f"[vFile] stat {path}:")
                    print(f"  size:  {st.get('st_size', 0)} bytes")
                    print(f"  mode:  0o{st.get('st_mode', 0):o}")
                    print(f"  uid:   {st.get('st_uid', 0)}")
                    print(f"  gid:   {st.get('st_gid', 0)}")
                except Exception as e:
                    print(f"Error: {e}")
            elif verb == "vlist":
                print("Open file descriptors are tracked server-side.")
                print("Use vstat to check if a file exists.")
            elif verb == "savelog":
                if len(parts) < 2:
                    print("Usage: savelog <local_path>")
                    continue
                path = parts[1]
                try:
                    n = await client.save_debug_log(path)
                    print(f"[Debug Log] Saved {n} bytes to {path}")
                except Exception as e:
                    print(f"Error: {e}")
            else:
                print(f"Unknown command: {verb}. Type 'help' for commands.")

    except ConnectionError as e:
        print(f"Connection lost: {e}")
    finally:
        await client.close()
        print("Disconnected.")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="GDB RSP Client")
    parser.add_argument("--host", default="127.0.0.1", help="Server host")
    parser.add_argument("--port", type=int, default=1234, help="Server port")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.WARNING,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    asyncio.run(interactive_session(args.host, args.port))


if __name__ == "__main__":
    main()
