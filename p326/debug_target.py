from __future__ import annotations
import struct
import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

BASE_ADDR = 0x00400000
MEMORY_SIZE = 0x10000

DEMO_PROGRAM = [
    ("mov rax, 1",        0x48, 0xC7, 0xC0, 0x01, 0x00, 0x00, 0x00),
    ("mov rbx, 2",        0x48, 0xC7, 0xC3, 0x02, 0x00, 0x00, 0x00),
    ("add rax, rbx",      0x48, 0x01, 0xD8),
    ("mov rcx, rax",      0x48, 0x89, 0xC1),
    ("sub rcx, 1",        0x48, 0x83, 0xE9, 0x01),
    ("cmp rax, 5",        0x48, 0x83, 0xF8, 0x05),
    ("jne 0x00400000",    0x75, 0xEE),
    ("nop",               0x90),
    ("hlt",               0xF4),
]

INSTR_SIZE = [len(instr[1:]) for instr in DEMO_PROGRAM]
INSTR_ADDR = []
addr = BASE_ADDR
for size in INSTR_SIZE:
    INSTR_ADDR.append(addr)
    addr += size


@dataclass
class Breakpoint:
    addr: int
    kind: str = "software"
    original_bytes: bytes = b""
    is_inserted: bool = False


@dataclass
class OpenFile:
    fd: int
    path: str
    flags: int
    mode: int
    offset: int = 0
    content: bytearray = field(default_factory=bytearray)
    is_open: bool = True


@dataclass
class FileStat:
    st_dev: int = 0
    st_ino: int = 0
    st_mode: int = 0
    st_nlink: int = 1
    st_uid: int = 1000
    st_gid: int = 1000
    st_rdev: int = 0
    st_size: int = 0
    st_blksize: int = 4096
    st_blocks: int = 0
    st_atime: int = 0
    st_mtime: int = 0
    st_ctime: int = 0


class VirtualFileSystem:
    O_RDONLY = 0
    O_WRONLY = 1
    O_RDWR = 2
    O_CREAT = 0o100
    O_EXCL = 0o200
    O_TRUNC = 0o1000
    O_APPEND = 0o2000

    ENOENT = 2
    EBADF = 9
    EEXIST = 17
    EINVAL = 22
    EISDIR = 21

    def __init__(self):
        self.files: dict[str, bytearray] = {}
        self.open_files: dict[int, OpenFile] = {}
        self._next_fd = 3

    def open(self, path: str, flags: int, mode: int) -> tuple[int, int]:
        path = self._normalize_path(path)
        exists = path in self.files

        if (flags & self.O_CREAT) and not exists:
            self.files[path] = bytearray()
        elif not exists:
            return -1, self.ENOENT

        if (flags & self.O_EXCL) and (flags & self.O_CREAT) and exists:
            return -1, self.EEXIST

        fd = self._next_fd
        self._next_fd += 1

        content = self.files[path]
        if flags & self.O_TRUNC:
            content = bytearray()
            self.files[path] = content

        offset = 0
        if flags & self.O_APPEND:
            offset = len(content)

        self.open_files[fd] = OpenFile(
            fd=fd, path=path, flags=flags, mode=mode,
            offset=offset, content=content, is_open=True
        )
        return fd, 0

    def close(self, fd: int) -> tuple[int, int]:
        if fd not in self.open_files:
            return -1, self.EBADF
        of = self.open_files[fd]
        of.is_open = False
        self.files[of.path] = of.content
        del self.open_files[fd]
        return 0, 0

    def pread(self, fd: int, count: int, offset: int) -> tuple[bytes, int]:
        if fd not in self.open_files:
            return b"", self.EBADF
        of = self.open_files[fd]
        if not of.is_open:
            return b"", self.EBADF
        if offset >= len(of.content):
            return b"", 0
        end = min(offset + count, len(of.content))
        data = bytes(of.content[offset:end])
        return data, 0

    def pwrite(self, fd: int, offset: int, data: bytes) -> tuple[int, int]:
        if fd not in self.open_files:
            return -1, self.EBADF
        of = self.open_files[fd]
        if not of.is_open:
            return -1, self.EBADF
        if (of.flags & 0x3) == self.O_RDONLY:
            return -1, self.EINVAL

        content = of.content
        if offset + len(data) > len(content):
            content.extend(b"\x00" * (offset + len(data) - len(content)))
        for i, b in enumerate(data):
            content[offset + i] = b
        return len(data), 0

    def unlink(self, path: str) -> tuple[int, int]:
        path = self._normalize_path(path)
        if path not in self.files:
            return -1, self.ENOENT
        del self.files[path]
        return 0, 0

    def stat(self, path: str) -> tuple[FileStat | None, int]:
        path = self._normalize_path(path)
        if path not in self.files:
            return None, self.ENOENT
        st = FileStat()
        st.st_mode = 0o100644
        st.st_size = len(self.files[path])
        st.st_blocks = (st.st_size + 511) // 512
        return st, 0

    def fstat(self, fd: int) -> tuple[FileStat | None, int]:
        if fd not in self.open_files:
            return None, self.EBADF
        of = self.open_files[fd]
        st = FileStat()
        st.st_mode = 0o100644
        st.st_size = len(of.content)
        st.st_blocks = (st.st_size + 511) // 512
        return st, 0

    def _normalize_path(self, path: str) -> str:
        if not path.startswith("/"):
            path = "/" + path
        while "//" in path:
            path = path.replace("//", "/")
        if len(path) > 1 and path.endswith("/"):
            path = path[:-1]
        return path


class DebugTarget:
    def __init__(self):
        self.regs = {
            "rax": 0, "rbx": 0, "rcx": 0, "rdx": 0,
            "rsi": 0, "rdi": 0, "rbp": 0, "rsp": 0x7FFFFFF0,
            "r8": 0, "r9": 0, "r10": 0, "r11": 0,
            "r12": 0, "r13": 0, "r14": 0, "r15": 0,
            "rip": BASE_ADDR, "eflags": 0x202,
            "cs": 0, "ss": 0, "ds": 0, "es": 0, "fs": 0, "gs": 0,
        }
        self.memory: dict[int, int] = {}
        self.breakpoints: dict[int, Breakpoint] = {}
        self.running = False
        self.halted = False
        self.last_signal = 5
        self.vfs = VirtualFileSystem()
        self.debug_log: list[str] = []
        self._load_demo_program()

    def log(self, message: str):
        entry = f"[debug] {message}"
        self.debug_log.append(entry)
        logger.debug(entry)

    def export_debug_log(self) -> str:
        header = [
            "=== GDB RSP Debug Log ===",
            f"Total entries: {len(self.debug_log)}",
            "",
        ]
        return "\n".join(header + self.debug_log)

    def snapshot_registers(self) -> str:
        lines = ["Registers snapshot:"]
        for name, val in self.regs.items():
            lines.append(f"  {name:8s} = 0x{val:016X}")
        return "\n".join(lines)

    def snapshot_memory(self, addr: int, length: int) -> str:
        data = self.read_memory(addr, length)
        lines = [f"Memory 0x{addr:X}+{length}:"]
        for i in range(0, len(data), 16):
            chunk = data[i:i+16]
            hex_part = " ".join(f"{b:02X}" for b in chunk)
            ascii_part = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
            lines.append(f"  0x{addr+i:08X}: {hex_part:<48s} {ascii_part}")
        return "\n".join(lines)

    def _load_demo_program(self):
        offset = 0
        for mnemonic, *opcode_bytes in DEMO_PROGRAM:
            for b in opcode_bytes:
                self.memory[BASE_ADDR + offset] = b
                offset += 1

    def read_memory(self, addr: int, length: int) -> bytes:
        return bytes(self.memory.get(addr + i, 0xFF) for i in range(length))

    def write_memory(self, addr: int, data: bytes):
        for i, b in enumerate(data):
            self.memory[addr + i] = b

    def add_breakpoint(self, addr: int, kind: str = "software") -> bool:
        if addr in self.breakpoints:
            return True
        original = self.read_memory(addr, 1)
        bp = Breakpoint(addr=addr, kind=kind, original_bytes=original)
        self.breakpoints[addr] = bp
        self._insert_breakpoint(bp)
        logger.info(f"Breakpoint added at 0x{addr:08X}")
        return True

    def remove_breakpoint(self, addr: int, kind: str = "software") -> bool:
        if addr not in self.breakpoints:
            return False
        bp = self.breakpoints[addr]
        self._remove_breakpoint(bp)
        del self.breakpoints[addr]
        logger.info(f"Breakpoint removed at 0x{addr:08X}")
        return True

    def _insert_breakpoint(self, bp: Breakpoint):
        if bp.is_inserted:
            return
        bp.original_bytes = self.read_memory(bp.addr, 1)
        self.write_memory(bp.addr, b"\xCC")
        bp.is_inserted = True

    def _remove_breakpoint(self, bp: Breakpoint):
        if not bp.is_inserted:
            return
        if bp.original_bytes:
            self.write_memory(bp.addr, bp.original_bytes)
        bp.is_inserted = False

    def _find_instr_index(self, addr: int) -> int | None:
        for i, a in enumerate(INSTR_ADDR):
            if a == addr:
                return i
        return None

    def step(self) -> int:
        if self.halted:
            return 5

        idx = self._find_instr_index(self.regs["rip"])
        if idx is None:
            self.last_signal = 5
            return self.last_signal

        mnemonic = DEMO_PROGRAM[idx][0]
        self.log(f"Step: 0x{self.regs['rip']:08X}: {mnemonic}")
        self.log(self.snapshot_registers())

        self._execute_instruction(idx, mnemonic)

        if idx + 1 < len(DEMO_PROGRAM):
            next_addr = INSTR_ADDR[idx + 1]
            if mnemonic == "jne 0x00400000":
                if not (self.regs["eflags"] & 0x40):
                    self.regs["rip"] = BASE_ADDR
                else:
                    self.regs["rip"] = next_addr
            else:
                self.regs["rip"] = next_addr
        else:
            self.halted = True

        if self.regs["rip"] in self.breakpoints:
            bp = self.breakpoints[self.regs["rip"]]
            self._remove_breakpoint(bp)
            self.last_signal = 5
            logger.info(f"Hit breakpoint at 0x{self.regs['rip']:08X}")
            return self.last_signal

        self.last_signal = 5
        return self.last_signal

    def continue_execution(self) -> int:
        if self.halted:
            return 5

        for _ in range(1000):
            sig = self.step()
            if self.halted:
                break
            if self.regs["rip"] in self.breakpoints:
                break
        return self.last_signal

    def _execute_instruction(self, idx: int, mnemonic: str):
        if mnemonic == "mov rcx, rax":
            self.regs["rcx"] = self.regs["rax"]
        elif mnemonic == "add rax, rbx":
            self.regs["rax"] = (self.regs["rax"] + self.regs["rbx"]) & 0xFFFFFFFFFFFFFFFF
            self._update_flags_arithmetic(self.regs["rax"])
        elif mnemonic.startswith("mov rax,"):
            val = int(mnemonic.split(",")[1].strip(), 0)
            self.regs["rax"] = val
        elif mnemonic.startswith("mov rbx,"):
            val = int(mnemonic.split(",")[1].strip(), 0)
            self.regs["rbx"] = val
        elif mnemonic.startswith("mov rcx,"):
            val = int(mnemonic.split(",")[1].strip(), 0)
            self.regs["rcx"] = val
        elif mnemonic.startswith("sub rcx,"):
            val = int(mnemonic.split(",")[1].strip(), 0)
            self.regs["rcx"] = (self.regs["rcx"] - val) & 0xFFFFFFFFFFFFFFFF
            self._update_flags_arithmetic(self.regs["rcx"])
        elif mnemonic.startswith("cmp rax,"):
            val = int(mnemonic.split(",")[1].strip(), 0)
            result = (self.regs["rax"] - val) & 0xFFFFFFFFFFFFFFFF
            self._update_flags_arithmetic(result)
            if self.regs["rax"] == val:
                self.regs["eflags"] |= 0x40
            else:
                self.regs["eflags"] &= ~0x40
        elif mnemonic.startswith("jne"):
            pass
        elif mnemonic == "nop":
            pass
        elif mnemonic == "hlt":
            self.halted = True

    def _update_flags_arithmetic(self, result: int):
        self.regs["eflags"] &= ~0x80  # clear SF
        self.regs["eflags"] &= ~0x04  # clear OF
        if result & (1 << 63):
            self.regs["eflags"] |= 0x80

    def get_regs_hex(self) -> str:
        from rsp_protocol import encode_regs_x86_64
        return encode_regs_x86_64(self.regs)

    def set_regs_from_hex(self, hex_str: str):
        from rsp_protocol import decode_regs_x86_64
        decoded = decode_regs_x86_64(hex_str)
        self.regs.update(decoded)

    def disassemble_at(self, addr: int, count: int = 5) -> list[str]:
        idx = self._find_instr_index(addr)
        if idx is None:
            for i, a in enumerate(INSTR_ADDR):
                if a > addr:
                    idx = i
                    break
        if idx is None:
            return []

        lines = []
        for i in range(idx, min(idx + count, len(DEMO_PROGRAM))):
            a = INSTR_ADDR[i]
            m = DEMO_PROGRAM[i][0]
            lines.append(f"0x{a:08X}:  {m}")
        return lines
