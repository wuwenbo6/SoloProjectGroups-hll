from __future__ import annotations
import struct


def compute_checksum(data: bytes) -> str:
    return f"{sum(data) & 0xFF:02x}"


def encode_packet(payload: str) -> bytes:
    data = payload.encode("ascii")
    checksum = compute_checksum(data)
    return b"$" + data + b"#" + checksum.encode("ascii")


def decode_packet(raw: bytes) -> str | None:
    if len(raw) < 4:
        return None
    if raw[0:1] != b"$":
        return None
    hash_pos = raw.find(b"#")
    if hash_pos == -1:
        return None
    payload = raw[1:hash_pos]
    received_cksum = raw[hash_pos + 1 : hash_pos + 3].decode("ascii")
    expected_cksum = compute_checksum(payload)
    if received_cksum != expected_cksum:
        return None
    return payload.decode("ascii")


def read_packet_from_stream(data: bytes) -> tuple[str | None, bytes]:
    start = data.find(b"$")
    if start == -1:
        return None, b""
    data = data[start:]
    hash_pos = data.find(b"#")
    if hash_pos == -1:
        return None, data
    if len(data) < hash_pos + 3:
        return None, data
    raw = data[: hash_pos + 3]
    remaining = data[hash_pos + 3 :]
    payload = decode_packet(raw)
    return payload, remaining


ACK_ENABLED = True


def make_ack() -> bytes:
    return b"+"


def make_nack() -> bytes:
    return b"-"


def hex_to_bytes(hex_str: str) -> bytes:
    return bytes.fromhex(hex_str)


def bytes_to_hex(data: bytes) -> str:
    return data.hex()


def encode_regs_x86_64(regs: dict[str, int]) -> str:
    order = [
        "rax", "rbx", "rcx", "rdx",
        "rsi", "rdi", "rbp", "rsp",
        "r8", "r9", "r10", "r11",
        "r12", "r13", "r14", "r15",
        "rip", "eflags", "cs", "ss",
        "ds", "es", "fs", "gs",
    ]
    result = ""
    for name in order:
        val = regs.get(name, 0)
        result += struct.pack("<Q", val & 0xFFFFFFFFFFFFFFFF).hex()
    return result


def decode_regs_x86_64(hex_str: str) -> dict[str, int]:
    order = [
        "rax", "rbx", "rcx", "rdx",
        "rsi", "rdi", "rbp", "rsp",
        "r8", "r9", "r10", "r11",
        "r12", "r13", "r14", "r15",
        "rip", "eflags", "cs", "ss",
        "ds", "es", "fs", "gs",
    ]
    regs = {}
    for i, name in enumerate(order):
        offset = i * 16
        if offset + 16 > len(hex_str):
            break
        chunk = hex_str[offset : offset + 16]
        regs[name] = struct.unpack("<Q", bytes.fromhex(chunk))[0]
    return regs


REGISTER_INFO_X86_64 = [
    {"name": "rax", "bitsize": 64, "offset": 0, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers", "gcc": 0, "dwarf": 0},
    {"name": "rbx", "bitsize": 64, "offset": 8, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers", "gcc": 3, "dwarf": 3},
    {"name": "rcx", "bitsize": 64, "offset": 16, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers", "gcc": 2, "dwarf": 2},
    {"name": "rdx", "bitsize": 64, "offset": 24, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers", "gcc": 1, "dwarf": 1},
    {"name": "rsi", "bitsize": 64, "offset": 32, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers", "gcc": 4, "dwarf": 4},
    {"name": "rdi", "bitsize": 64, "offset": 40, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers", "gcc": 5, "dwarf": 5},
    {"name": "rbp", "bitsize": 64, "offset": 48, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers", "gcc": 6, "dwarf": 6},
    {"name": "rsp", "bitsize": 64, "offset": 56, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers", "gcc": 7, "dwarf": 7},
    {"name": "r8",  "bitsize": 64, "offset": 64, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers", "gcc": 8, "dwarf": 8},
    {"name": "r9",  "bitsize": 64, "offset": 72, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers", "gcc": 9, "dwarf": 9},
    {"name": "r10", "bitsize": 64, "offset": 80, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers", "gcc": 10, "dwarf": 10},
    {"name": "r11", "bitsize": 64, "offset": 88, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers", "gcc": 11, "dwarf": 11},
    {"name": "r12", "bitsize": 64, "offset": 96, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers", "gcc": 12, "dwarf": 12},
    {"name": "r13", "bitsize": 64, "offset": 104, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers", "gcc": 13, "dwarf": 13},
    {"name": "r14", "bitsize": 64, "offset": 112, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers", "gcc": 14, "dwarf": 14},
    {"name": "r15", "bitsize": 64, "offset": 120, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers", "gcc": 15, "dwarf": 15},
    {"name": "rip", "bitsize": 64, "offset": 128, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers", "gcc": 16, "dwarf": 16},
    {"name": "eflags", "bitsize": 32, "offset": 136, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers", "gcc": 17, "dwarf": 17},
    {"name": "cs", "bitsize": 32, "offset": 140, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers"},
    {"name": "ss", "bitsize": 32, "offset": 144, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers"},
    {"name": "ds", "bitsize": 32, "offset": 148, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers"},
    {"name": "es", "bitsize": 32, "offset": 152, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers"},
    {"name": "fs", "bitsize": 32, "offset": 156, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers"},
    {"name": "gs", "bitsize": 32, "offset": 160, "encoding": "uint", "format": "hex",
     "set": "General Purpose Registers"},
]
