from __future__ import annotations

import struct
from dataclasses import dataclass

BLUEFS_LOG_MAGIC = 0x424C5545
BLUEFS_LOG_VERSION = 1

OP_TYPES = {
    1: "NONE",
    2: "ALLOC",
    3: "DEALLOC",
    4: "DIR_CREATE",
    5: "DIR_LINK",
    6: "DIR_UNLINK",
    7: "FILE_CREATE",
    8: "FILE_LINK",
    9: "FILE_UNLINK",
    10: "FILE_UPDATE",
}

HEADER_FORMAT = "<QII"
HEADER_SIZE = struct.calcsize(HEADER_FORMAT)

ENTRY_FIXED_FORMAT = "<IQQI"
ENTRY_FIXED_SIZE = struct.calcsize(ENTRY_FIXED_FORMAT)

PATH_LEN_FORMAT = "<I"
PATH_LEN_SIZE = struct.calcsize(PATH_LEN_FORMAT)

TIMESTAMP_FORMAT = "<Q"
TIMESTAMP_SIZE = struct.calcsize(TIMESTAMP_FORMAT)


@dataclass
class BlueFSLogHeader:
    magic: int
    version: int
    block_size: int


@dataclass
class BlueFSLogEntry:
    seq: int
    op_type: int
    op_name: str
    offset: int
    length: int
    device: int
    file_path: str
    timestamp: int


def parse_header(data: bytes) -> BlueFSLogHeader:
    if len(data) < HEADER_SIZE:
        raise ValueError(f"Invalid header size: {len(data)}, expected at least {HEADER_SIZE}")
    magic, version, block_size = struct.unpack(HEADER_FORMAT, data[:HEADER_SIZE])
    if magic != BLUEFS_LOG_MAGIC:
        raise ValueError(f"Invalid magic number: 0x{magic:08X}, expected 0x{BLUEFS_LOG_MAGIC:08X}")
    if version != BLUEFS_LOG_VERSION:
        raise ValueError(f"Unsupported version: {version}, expected {BLUEFS_LOG_VERSION}")
    return BlueFSLogHeader(magic=magic, version=version, block_size=block_size)


def parse_log(data: bytes) -> list[dict]:
    header = parse_header(data)
    entries: list[dict] = []
    offset = HEADER_SIZE
    seq = 0

    while offset < len(data):
        if offset + ENTRY_FIXED_SIZE > len(data):
            break

        op_type, log_offset, length, device_id = struct.unpack(
            ENTRY_FIXED_FORMAT, data[offset : offset + ENTRY_FIXED_SIZE]
        )
        offset += ENTRY_FIXED_SIZE

        if offset + PATH_LEN_SIZE > len(data):
            break

        path_len = struct.unpack(PATH_LEN_FORMAT, data[offset : offset + PATH_LEN_SIZE])[0]
        offset += PATH_LEN_SIZE

        if offset + path_len > len(data):
            break

        file_path = data[offset : offset + path_len].decode("utf-8", errors="replace")
        offset += path_len

        if offset + TIMESTAMP_SIZE > len(data):
            break

        timestamp = struct.unpack(TIMESTAMP_FORMAT, data[offset : offset + TIMESTAMP_SIZE])[0]
        offset += TIMESTAMP_SIZE

        op_name = OP_TYPES.get(op_type, f"UNKNOWN({op_type})")

        entries.append(
            {
                "seq": seq,
                "op_type": op_type,
                "op_name": op_name,
                "offset": log_offset,
                "length": length,
                "device": device_id,
                "file_path": file_path,
                "timestamp": timestamp,
            }
        )
        seq += 1

    return entries
