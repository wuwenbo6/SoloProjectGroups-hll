from __future__ import annotations
import asyncio
import logging
from rsp_protocol import (
    encode_packet, read_packet_from_stream,
    make_ack, make_nack, bytes_to_hex, hex_to_bytes,
    REGISTER_INFO_X86_64,
)
from debug_target import DebugTarget, BASE_ADDR

logger = logging.getLogger(__name__)


class RSPServer:
    def __init__(self, host: str = "127.0.0.1", port: int = 1234):
        self.host = host
        self.port = port
        self.target = DebugTarget()
        self.ack_mode = True
        self._client_writer: asyncio.StreamWriter | None = None
        self._no_ack_mode = False

    async def start(self):
        server = await asyncio.start_server(
            self._handle_client, self.host, self.port
        )
        addrs = ", ".join(str(s.getsockname()) for s in server.sockets)
        logger.info(f"RSP Server listening on {addrs}")
        async with server:
            await server.serve_forever()

    async def _handle_client(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ):
        self._client_writer = writer
        peer = writer.get_extra_info("peername")
        logger.info(f"Client connected from {peer}")
        self.target = DebugTarget()
        buf = b""

        try:
            while True:
                data = await reader.read(4096)
                if not data:
                    break
                buf += data

                while buf:
                    if buf[0:1] in (b"+", b"-"):
                        if buf[0:1] == b"-":
                            logger.warning("Client sent NACK, re-sending last response")
                        buf = buf[1:]
                        continue

                    payload, remaining = read_packet_from_stream(buf)
                    if payload is None:
                        break
                    buf = remaining

                    if self.ack_mode and not self._no_ack_mode:
                        writer.write(make_ack())
                        await writer.drain()

                    response = self._process_command(payload)
                    if response is not None:
                        pkt = encode_packet(response)
                        writer.write(pkt)
                        await writer.drain()

        except (ConnectionResetError, BrokenPipeError):
            logger.info("Client disconnected abruptly")
        except Exception as e:
            logger.error(f"Error handling client: {e}")
        finally:
            writer.close()
            logger.info("Client disconnected")

    def _process_command(self, payload: str) -> str | None:
        logger.debug(f"Received: {payload}")

        if payload == "qSupported" or payload.startswith("qSupported:"):
            return self._handle_qsupported(payload)
        elif payload.startswith("qRegisterInfo"):
            return self._handle_qregisterinfo(payload)
        elif payload == "?":
            return self._handle_query_stop_reason()
        elif payload == "g":
            return self._handle_read_registers()
        elif payload == "G":
            return self._handle_write_registers(payload)
        elif payload.startswith("p"):
            return self._handle_read_register(payload)
        elif payload.startswith("P"):
            return self._handle_write_register(payload)
        elif payload.startswith("m"):
            return self._handle_read_memory(payload)
        elif payload.startswith("M"):
            return self._handle_write_memory(payload)
        elif payload == "s":
            return self._handle_step()
        elif payload.startswith("s"):
            return self._handle_step_addr(payload)
        elif payload == "c":
            return self._handle_continue()
        elif payload.startswith("c"):
            return self._handle_continue_addr(payload)
        elif payload.startswith("Z0"):
            return self._handle_add_breakpoint(payload)
        elif payload.startswith("z0"):
            return self._handle_remove_breakpoint(payload)
        elif payload.startswith("Z1"):
            return self._handle_add_hardware_breakpoint(payload)
        elif payload.startswith("z1"):
            return self._handle_remove_hardware_breakpoint(payload)
        elif payload == "qfThreadInfo":
            return "m01"
        elif payload == "qsThreadInfo":
            return "l"
        elif payload.startswith("qThreadExtraInfo"):
            return "4d61696e20546872656164"
        elif payload == "qC":
            return "QC01"
        elif payload == "qAttached":
            return "1"
        elif payload == "Hg0" or payload == "Hg-1":
            return "OK"
        elif payload == "Hc0" or payload == "Hc-1":
            return "OK"
        elif payload == "k":
            return None
        elif payload == "D":
            return "OK"
        elif payload == "qOffsets":
            return "Text=0;Data=0;Bss=0"
        elif payload.startswith("qSymbol"):
            return "OK"
        elif payload == "qTStatus":
            return ""
        elif payload.startswith("qXfer:features:read"):
            return self._handle_xfer_features(payload)
        elif payload == "vCont?":
            return "vCont;s;c"
        elif payload.startswith("vCont"):
            return self._handle_vcont(payload)
        elif payload.startswith("vFile:"):
            return self._handle_vfile(payload)
        elif payload.startswith("qXfer:traceframe-info:read"):
            return self._handle_xfer_traceframe(payload)
        elif payload == "qXfer:traceframe-info:write:log":
            return self._handle_export_log(payload)
        else:
            logger.warning(f"Unsupported command: {payload}")
            return ""

    def _handle_qsupported(self, payload: str) -> str:
        features = [
            "PacketSize=4000",
            "QStartNoAckMode+",
            "qRegisterInfo+",
            "qXfer:features:read+",
            "vContSupported+",
            "NoAckSupported+",
            "vFile:setfs+",
            "vFile:open+",
            "vFile:close+",
            "vFile:pread+",
            "vFile:pwrite+",
            "vFile:unlink+",
            "vFile:stat+",
            "vFile:fstat+",
        ]
        if "QStartNoAckMode+" in payload:
            self._no_ack_mode_pending = True
        return ";".join(features)

    def _handle_qregisterinfo(self, payload: str) -> str:
        try:
            reg_num = int(payload[len("qRegisterInfo"):], 16)
        except ValueError:
            return "E01"

        if reg_num >= len(REGISTER_INFO_X86_64):
            return "E45"

        reg = REGISTER_INFO_X86_64[reg_num]
        parts = [
            f"name:{reg['name']}",
            f"bitsize:{reg['bitsize']}",
            f"offset:{reg['offset']}",
            f"encoding:{reg['encoding']}",
            f"format:{reg['format']}",
            f"set:{reg['set']}",
        ]
        if "gcc" in reg:
            parts.append(f"gcc:{reg['gcc']}")
        if "dwarf" in reg:
            parts.append(f"dwarf:{reg['dwarf']}")
        return ";".join(parts) + ";"

    def _handle_query_stop_reason(self) -> str:
        return f"T{self.target.last_signal:02x}thread:01;"

    def _handle_read_registers(self) -> str:
        return self.target.get_regs_hex()

    def _handle_write_registers(self, payload: str) -> str:
        hex_data = payload[1:]
        self.target.set_regs_from_hex(hex_data)
        return "OK"

    def _handle_read_register(self, payload: str) -> str:
        try:
            reg_num = int(payload[1:], 16)
        except ValueError:
            return "E01"

        if reg_num >= len(REGISTER_INFO_X86_64):
            return "E45"

        reg_name = REGISTER_INFO_X86_64[reg_num]["name"]
        val = self.target.regs.get(reg_name, 0)
        bitsize = REGISTER_INFO_X86_64[reg_num]["bitsize"]
        byte_size = bitsize // 8

        import struct
        if byte_size == 8:
            return struct.pack("<Q", val & 0xFFFFFFFFFFFFFFFF).hex()
        elif byte_size == 4:
            return struct.pack("<I", val & 0xFFFFFFFF).hex()
        return "E01"

    def _handle_write_register(self, payload: str) -> str:
        parts = payload[1:].split("=")
        if len(parts) != 2:
            return "E01"
        try:
            reg_num = int(parts[0], 16)
            val = int(parts[1], 16)
        except ValueError:
            return "E01"

        if reg_num >= len(REGISTER_INFO_X86_64):
            return "E45"

        reg_name = REGISTER_INFO_X86_64[reg_num]["name"]
        self.target.regs[reg_name] = val
        return "OK"

    def _handle_read_memory(self, payload: str) -> str:
        parts = payload[1:].split(",")
        if len(parts) != 2:
            return "E01"
        try:
            addr = int(parts[0], 16)
            length = int(parts[1], 16)
        except ValueError:
            return "E01"

        data = self.target.read_memory(addr, length)
        return bytes_to_hex(data)

    def _handle_write_memory(self, payload: str) -> str:
        parts = payload[1:].split(":")
        if len(parts) != 2:
            return "E01"
        addr_len = parts[0].split(",")
        if len(addr_len) != 2:
            return "E01"
        try:
            addr = int(addr_len[0], 16)
            length = int(addr_len[1], 16)
            data = hex_to_bytes(parts[1])
        except ValueError:
            return "E01"

        self.target.write_memory(addr, data)
        return "OK"

    def _handle_step(self) -> str:
        sig = self.target.step()
        return f"T{sig:02x}thread:01;"

    def _handle_step_addr(self, payload: str) -> str:
        try:
            addr = int(payload[1:], 16)
            self.target.regs["rip"] = addr
        except ValueError:
            pass
        sig = self.target.step()
        return f"T{sig:02x}thread:01;"

    def _handle_continue(self) -> str:
        sig = self.target.continue_execution()
        return f"T{sig:02x}thread:01;"

    def _handle_continue_addr(self, payload: str) -> str:
        try:
            addr = int(payload[1:], 16)
            self.target.regs["rip"] = addr
        except ValueError:
            pass
        sig = self.target.continue_execution()
        return f"T{sig:02x}thread:01;"

    def _handle_add_breakpoint(self, payload: str) -> str:
        parts = payload.split(",")
        if len(parts) != 3:
            return "E01"
        try:
            addr = int(parts[1], 16)
            kind = int(parts[2], 16)
        except ValueError:
            return "E01"

        ok = self.target.add_breakpoint(addr, "software")
        return "OK" if ok else "E01"

    def _handle_remove_breakpoint(self, payload: str) -> str:
        parts = payload.split(",")
        if len(parts) != 3:
            return "E01"
        try:
            addr = int(parts[1], 16)
            kind = int(parts[2], 16)
        except ValueError:
            return "E01"

        ok = self.target.remove_breakpoint(addr, "software")
        return "OK" if ok else "E01"

    def _handle_add_hardware_breakpoint(self, payload: str) -> str:
        parts = payload.split(",")
        if len(parts) != 3:
            return "E01"
        try:
            addr = int(parts[1], 16)
        except ValueError:
            return "E01"
        ok = self.target.add_breakpoint(addr, "hardware")
        return "OK" if ok else "E01"

    def _handle_remove_hardware_breakpoint(self, payload: str) -> str:
        parts = payload.split(",")
        if len(parts) != 3:
            return "E01"
        try:
            addr = int(parts[1], 16)
        except ValueError:
            return "E01"
        ok = self.target.remove_breakpoint(addr, "hardware")
        return "OK" if ok else "E01"

    def _handle_vcont(self, payload: str) -> str:
        actions = payload[len("vCont;"):].split(";")
        sig = 5
        for action in actions:
            if action.startswith("s"):
                if ":" in action:
                    try:
                        addr = int(action.split(":")[1], 16)
                        self.target.regs["rip"] = addr
                    except (ValueError, IndexError):
                        pass
                sig = self.target.step()
                break
            elif action.startswith("c"):
                if ":" in action:
                    try:
                        addr = int(action.split(":")[1], 16)
                        self.target.regs["rip"] = addr
                    except (ValueError, IndexError):
                        pass
                sig = self.target.continue_execution()
                break
        return f"T{sig:02x}thread:01;"

    def _handle_xfer_features(self, payload: str) -> str:
        if "target.xml" in payload:
            return self._get_target_xml()
        return ""

    def _get_target_xml(self) -> str:
        xml = '<?xml version="1.0"?>\n'
        xml += '<!DOCTYPE target SYSTEM "gdb-target.dtd">\n'
        xml += '<target version="1.0">\n'
        xml += '  <architecture>i386:x86-64</architecture>\n'
        xml += '  <feature name="org.gnu.gdb.i386.core">\n'
        for reg in REGISTER_INFO_X86_64:
            xml += f'    <reg name="{reg["name"]}" bitsize="{reg["bitsize"]}" '
            xml += f'type="uint{reg["bitsize"]}" regnum="{reg["offset"]//8}"/>\n'
        xml += '  </feature>\n'
        xml += '</target>'
        return xml

    def _handle_vfile(self, payload: str) -> str:
        from debug_target import FileStat
        vfs = self.target.vfs
        cmd = payload[6:]

        if cmd.startswith("setfs:"):
            return "F0"
        elif cmd.startswith("open:"):
            params = cmd[5:]
            parts = params.rsplit(",", 2)
            if len(parts) != 3:
                return "F-1,22"
            path, flags_str, mode_str = parts
            try:
                path = bytes.fromhex(path).decode("utf-8", errors="replace")
                flags = int(flags_str, 16)
                mode = int(mode_str, 16)
            except ValueError:
                return "F-1,22"
            self.target.log(f"vFile:open: {path} flags=0x{flags:x} mode=0o{mode:o}")
            fd, err = vfs.open(path, flags, mode)
            if fd < 0:
                return f"F-1,{err}"
            return f"F{fd}"
        elif cmd.startswith("close:"):
            try:
                fd = int(cmd[6:], 16)
            except ValueError:
                return "F-1,22"
            self.target.log(f"vFile:close: fd={fd}")
            ret, err = vfs.close(fd)
            if ret < 0:
                return f"F-1,{err}"
            return f"F{ret}"
        elif cmd.startswith("pread:"):
            params = cmd[6:]
            parts = params.split(",", 2)
            if len(parts) != 3:
                return "F-1,22"
            try:
                fd = int(parts[0], 16)
                count = int(parts[1], 16)
                offset = int(parts[2], 16)
            except ValueError:
                return "F-1,22"
            self.target.log(f"vFile:pread: fd={fd} count={count} offset=0x{offset:x}")
            data, err = vfs.pread(fd, count, offset)
            if err != 0:
                return f"F-1,{err}"
            return f"F{len(data)};{data.hex()}"
        elif cmd.startswith("pwrite:"):
            params = cmd[7:]
            parts = params.split(",", 2)
            if len(parts) != 3:
                return "F-1,22"
            try:
                fd = int(parts[0], 16)
                offset = int(parts[1], 16)
                data = bytes.fromhex(parts[2])
            except ValueError:
                return "F-1,22"
            self.target.log(f"vFile:pwrite: fd={fd} offset=0x{offset:x} len={len(data)}")
            ret, err = vfs.pwrite(fd, offset, data)
            if ret < 0:
                return f"F-1,{err}"
            return f"F{ret}"
        elif cmd.startswith("unlink:"):
            try:
                path_hex = cmd[7:]
                path = bytes.fromhex(path_hex).decode("utf-8", errors="replace")
            except ValueError:
                return "F-1,22"
            self.target.log(f"vFile:unlink: {path}")
            ret, err = vfs.unlink(path)
            if ret < 0:
                return f"F-1,{err}"
            return f"F{ret}"
        elif cmd.startswith("stat:"):
            try:
                path_hex = cmd[5:]
                path = bytes.fromhex(path_hex).decode("utf-8", errors="replace")
            except ValueError:
                return "F-1,22"
            self.target.log(f"vFile:stat: {path}")
            st, err = vfs.stat(path)
            if st is None:
                return f"F-1,{err}"
            return self._encode_stat(st)
        elif cmd.startswith("fstat:"):
            try:
                fd = int(cmd[6:], 16)
            except ValueError:
                return "F-1,22"
            self.target.log(f"vFile:fstat: fd={fd}")
            st, err = vfs.fstat(fd)
            if st is None:
                return f"F-1,{err}"
            return self._encode_stat(st)
        else:
            self.target.log(f"vFile: unsupported: {cmd}")
            return "F-1,22"

    def _encode_stat(self, st) -> str:
        import struct
        data = struct.pack(
            "<QQQqQQQQqqq",
            st.st_dev, st.st_ino, st.st_mode, st.st_nlink,
            st.st_uid, st.st_gid, st.st_rdev, st.st_size,
            st.st_blksize, st.st_blocks, st.st_atime,
        )
        return f"F0;{data.hex()}"

    def _handle_xfer_traceframe(self, payload: str) -> str:
        parts = payload.split(":")
        if len(parts) < 4:
            return ""
        try:
            offset = int(parts[3].split(",")[0], 16)
            length = int(parts[3].split(",")[1], 16)
        except (ValueError, IndexError):
            return ""

        log_content = self.target.export_debug_log()
        reg_snapshot = self.target.snapshot_registers()
        mem_snapshot = self.target.snapshot_memory(BASE_ADDR, 64)

        full_content = (
            "=== GDB RSP Debug Export ===\n"
            f"Current PC: 0x{self.target.regs.get('rip', 0):08X}\n"
            f"Breakpoints: {len(self.target.breakpoints)}\n"
            f"Halted: {self.target.halted}\n\n"
            + reg_snapshot + "\n\n"
            + mem_snapshot + "\n\n"
            + log_content
        )

        total_len = len(full_content)
        if offset >= total_len:
            return "l"
        end = min(offset + length, total_len)
        chunk = full_content[offset:end]
        prefix = "m" if end < total_len else "l"
        return prefix + chunk.encode("utf-8").hex()

    def _handle_export_log(self, payload: str) -> str:
        log_content = self.target.export_debug_log()
        reg_snapshot = self.target.snapshot_registers()
        mem_snapshot = self.target.snapshot_memory(BASE_ADDR, 64)

        full_content = (
            "=== GDB RSP Debug Export ===\n"
            f"Current PC: 0x{self.target.regs.get('rip', 0):08X}\n"
            f"Breakpoints: {len(self.target.breakpoints)}\n"
            f"Halted: {self.target.halted}\n\n"
            + reg_snapshot + "\n\n"
            + mem_snapshot + "\n\n"
            + log_content
        )

        return full_content.encode("utf-8").hex()


def main():
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )
    server = RSPServer(host="127.0.0.1", port=1234)
    try:
        asyncio.run(server.start())
    except KeyboardInterrupt:
        logger.info("Server shutting down")


if __name__ == "__main__":
    main()
