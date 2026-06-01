from __future__ import annotations

import struct
import random
import time
import os
import gzip
import bz2

BLUEFS_LOG_MAGIC = 0x424C5545
BLUEFS_LOG_VERSION = 1
BLOCK_SIZE = 4096

OP_NONE = 1
OP_ALLOC = 2
OP_DEALLOC = 3
OP_DIR_CREATE = 4
OP_DIR_LINK = 5
OP_DIR_UNLINK = 6
OP_FILE_CREATE = 7
OP_FILE_LINK = 8
OP_FILE_UNLINK = 9
OP_FILE_UPDATE = 10

HEADER_FORMAT = "<QII"
ENTRY_FIXED_FORMAT = "<IQQI"
PATH_LEN_FORMAT = "<I"
TIMESTAMP_FORMAT = "<Q"

DIRS = [
    "dir_meta",
    "dir_data",
    "dir_wal",
    "dir_slow",
    "dir_cache",
    "dir_journal",
    "dir_omap",
    "dir_snap",
]

FILE_PREFIXES = [
    "meta",
    "data",
    "wal",
    "omap",
    "snap",
    "cache",
    "journal",
    "bluefs",
]

DEVICES = [0, 1, 2]

ALLOC_SIZES = [
    4096,
    8192,
    16384,
    32768,
    65536,
    131072,
    262144,
    524288,
    1048576,
    2097152,
    4194304,
]


def _pack_header() -> bytes:
    return struct.pack(HEADER_FORMAT, BLUEFS_LOG_MAGIC, BLUEFS_LOG_VERSION, BLOCK_SIZE)


def _pack_entry(op_type: int, offset: int, length: int, device: int, file_path: str, timestamp: int) -> bytes:
    path_bytes = file_path.encode("utf-8")
    parts = [
        struct.pack(ENTRY_FIXED_FORMAT, op_type, offset, length, device),
        struct.pack(PATH_LEN_FORMAT, len(path_bytes)),
        path_bytes,
        struct.pack(TIMESTAMP_FORMAT, timestamp),
    ]
    return b"".join(parts)


def generate_sample_log(output_path: str | None = None, include_ref_count: bool = True) -> str:
    if output_path is None:
        output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sample_bluefs.bin")

    random.seed(42)
    base_ts = int(time.time() * 1_000_000)
    data = bytearray()
    data.extend(_pack_header())

    next_offsets: dict[int, int] = {0: 0x10000, 1: 0x20000, 2: 0x30000}
    pending_allocs: list[tuple[int, int, int, str, int]] = []
    leak_allocs: list[tuple[int, int, int, str, int]] = []
    ref_counted_allocs: list[tuple[int, int, int, str, int]] = []
    dir_set: set[str] = set()
    file_set: set[str] = set()

    op_count = 0
    target_ops = 200

    for d in DIRS[:5]:
        dir_set.add(d)
        ts = base_ts + op_count * 1000
        data.extend(_pack_entry(OP_DIR_CREATE, 0, 0, 0, d, ts))
        op_count += 1

    for _ in range(8):
        prefix = random.choice(FILE_PREFIXES)
        suffix = random.randint(1, 99)
        fname = f"{prefix}_{suffix}.db"
        fpath = f"{random.choice(list(dir_set))}/{fname}"
        if fpath not in file_set:
            file_set.add(fpath)
            ts = base_ts + op_count * 1000
            data.extend(_pack_entry(OP_FILE_CREATE, 0, 0, random.choice(DEVICES), fpath, ts))
            op_count += 1

    while op_count < target_ops:
        ts = base_ts + op_count * 1000
        roll = random.random()

        if roll < 0.40:
            device = random.choice(DEVICES)
            size = random.choice(ALLOC_SIZES)
            offset = next_offsets[device]
            next_offsets[device] += size
            fpath = random.choice(list(file_set)) if file_set else "dir_meta/unknown.db"
            data.extend(_pack_entry(OP_ALLOC, offset, size, device, fpath, ts))
            is_leak = random.random() < 0.20
            has_ref_count = include_ref_count and random.random() < 0.15
            if is_leak:
                leak_allocs.append((device, offset, size, fpath, ts))
                if has_ref_count:
                    ref_counted_allocs.append((device, offset, size, fpath, ts))
            else:
                pending_allocs.append((device, offset, size, fpath, ts))
            op_count += 1

        elif roll < 0.50 and include_ref_count and pending_allocs:
            idx = random.randint(0, len(pending_allocs) - 1)
            dev, off, sz, fp, _ = pending_allocs[idx]
            data.extend(_pack_entry(OP_ALLOC, off, sz, dev, fp, ts))
            ref_counted_allocs.append((dev, off, sz, fp, ts))
            op_count += 1

        elif roll < 0.70 and pending_allocs:
            idx = random.randint(0, len(pending_allocs) - 1)
            dev, off, sz, fp, _ = pending_allocs.pop(idx)
            partial = random.random() < 0.15
            dealloc_size = sz // 2 if partial else sz
            data.extend(_pack_entry(OP_DEALLOC, off, dealloc_size, dev, fp, ts))
            op_count += 1

        elif roll < 0.75:
            dname = f"dir_extra_{random.randint(100, 999)}"
            if dname not in dir_set:
                dir_set.add(dname)
                data.extend(_pack_entry(OP_DIR_CREATE, 0, 0, 0, dname, ts))
                op_count += 1

        elif roll < 0.80 and dir_set:
            d1 = random.choice(list(dir_set))
            d2 = random.choice(list(dir_set))
            if d1 != d2:
                data.extend(_pack_entry(OP_DIR_LINK, 0, 0, 0, f"{d1}->{d2}", ts))
                op_count += 1

        elif roll < 0.85 and file_set:
            prefix = random.choice(FILE_PREFIXES)
            suffix = random.randint(100, 999)
            fname = f"{prefix}_{suffix}.db"
            fpath = f"{random.choice(list(dir_set))}/{fname}"
            file_set.add(fpath)
            data.extend(_pack_entry(OP_FILE_CREATE, 0, 0, random.choice(DEVICES), fpath, ts))
            op_count += 1

        elif roll < 0.90 and file_set:
            fpath = random.choice(list(file_set))
            data.extend(_pack_entry(OP_FILE_UPDATE, 0, 0, random.choice(DEVICES), fpath, ts))
            op_count += 1

        elif roll < 0.95 and file_set:
            fpath = random.choice(list(file_set))
            data.extend(_pack_entry(OP_FILE_LINK, 0, 0, random.choice(DEVICES), fpath, ts))
            op_count += 1

        else:
            data.extend(_pack_entry(OP_NONE, 0, 0, 0, "", ts))
            op_count += 1

    with open(output_path, "wb") as f:
        f.write(bytes(data))

    return output_path


def generate_compressed_sample(base_dir: str | None = None) -> dict[str, str]:
    if base_dir is None:
        base_dir = os.path.dirname(os.path.abspath(__file__))

    base_path = os.path.join(base_dir, "sample_bluefs")
    paths = {}

    bin_path = f"{base_path}.bin"
    generate_sample_log(bin_path, include_ref_count=True)
    paths["bin"] = bin_path

    with open(bin_path, "rb") as f:
        raw_data = f.read()

    gz_path = f"{base_path}.bin.gz"
    with gzip.open(gz_path, "wb") as f:
        f.write(raw_data)
    paths["gz"] = gz_path

    bz2_path = f"{base_path}.bin.bz2"
    with bz2.open(bz2_path, "wb") as f:
        f.write(raw_data)
    paths["bz2"] = bz2_path

    return paths


if __name__ == "__main__":
    path = generate_sample_log()
    print(f"Generated sample BlueFS log: {path}")

    compressed = generate_compressed_sample()
    print(f"Generated compressed samples: {list(compressed.values())}")
