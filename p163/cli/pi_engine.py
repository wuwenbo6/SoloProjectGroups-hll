#!/usr/bin/env python3
"""
SCSI T10 PI (Protection Information) Engine
Implements DIF (Data Integrity Field) with Guard Tag + Application Tag + Reference Tag

Features:
- T10 CRC (0x8BB3 polynomial) for Guard Tag
- mmap support for large files
- Block-by-block verification (512 bytes per sector)
"""

import struct
import os
import mmap
from dataclasses import dataclass
from typing import List, Dict, Iterator, Tuple

SECTOR_SIZE = 512
DIF_SIZE = 8
GUARD_TAG_SIZE = 2
APP_TAG_SIZE = 2
REF_TAG_SIZE = 4
TOTAL_BLOCK_SIZE = SECTOR_SIZE + DIF_SIZE

MMAP_THRESHOLD = 100 * 1024 * 1024
MMAP_CHUNK_SIZE = 64 * 1024 * 1024

try:
    PAGE_SIZE = os.sysconf('SC_PAGE_SIZE')
except (ValueError, AttributeError, OSError):
    PAGE_SIZE = 4096


@dataclass
class DIFBlock:
    guard_tag: int = 0
    app_tag: int = 0
    ref_tag: int = 0

    def pack(self) -> bytes:
        return struct.pack('>HHI', self.guard_tag, self.app_tag, self.ref_tag)

    @classmethod
    def unpack(cls, data: bytes) -> 'DIFBlock':
        guard, app, ref = struct.unpack('>HHI', data)
        return cls(guard_tag=guard, app_tag=app, ref_tag=ref)


@dataclass
class PIContext:
    app_tag: int = 0x0000
    ref_tag_mode: str = 'lba'
    guard_type: str = 'crc16'


class SCSIPIError(Exception):
    pass


class GuardTagMismatchError(SCSIPIError):
    def __init__(self, sector: int, expected: int, actual: int):
        self.sector = sector
        self.expected = expected
        self.actual = actual
        super().__init__(f"Guard tag mismatch at sector {sector}: expected 0x{expected:04X}, got 0x{actual:04X}")


class RefTagMismatchError(SCSIPIError):
    def __init__(self, sector: int, expected: int, actual: int):
        self.sector = sector
        self.expected = expected
        self.actual = actual
        super().__init__(f"Reference tag mismatch at sector {sector}: expected 0x{expected:08X}, got 0x{actual:08X}")


def _build_crc_table(poly: int) -> List[int]:
    table = []
    for i in range(256):
        crc = i << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ poly) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
        table.append(crc)
    return table


T10_CRC_POLY = 0x8BB3
CRC_TABLE = _build_crc_table(T10_CRC_POLY)


def crc16_t10dif(data: bytes, init_crc: int = 0xFFFF) -> int:
    """
    Calculate CRC16 as defined by SCSI T10 DIF standard.
    Polynomial: 0x8BB3 (T10 PI standard)
    Initial value: 0xFFFF
    """
    crc = init_crc
    for byte in data:
        crc = CRC_TABLE[(crc >> 8) ^ byte] ^ (crc << 8)
        crc &= 0xFFFF
    return crc


def crc16_t10dif_slow(data: bytes) -> int:
    """
    Slow reference implementation for verification.
    """
    crc = 0xFFFF
    for byte in data:
        crc ^= (byte << 8)
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ T10_CRC_POLY) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc


def calculate_guard_tag(data: bytes, guard_type: str = 'crc16') -> int:
    if guard_type == 'crc16':
        return crc16_t10dif(data)
    else:
        raise ValueError(f"Unsupported guard type: {guard_type}")


def generate_dif(sector_data: bytes, sector_index: int, context: PIContext) -> DIFBlock:
    if len(sector_data) != SECTOR_SIZE:
        raise ValueError(f"Sector data must be {SECTOR_SIZE} bytes, got {len(sector_data)}")

    guard_tag = calculate_guard_tag(sector_data, context.guard_type)

    if context.ref_tag_mode == 'lba':
        ref_tag = sector_index
    elif context.ref_tag_mode == 'incremental':
        ref_tag = sector_index + 1
    elif context.ref_tag_mode == 'fixed':
        ref_tag = 0xFFFFFFFF
    else:
        raise ValueError(f"Unsupported ref tag mode: {context.ref_tag_mode}")

    return DIFBlock(guard_tag=guard_tag, app_tag=context.app_tag, ref_tag=ref_tag)


def verify_dif(sector_data: bytes, dif: DIFBlock, sector_index: int, context: PIContext) -> List[SCSIPIError]:
    errors = []

    expected_guard = calculate_guard_tag(sector_data, context.guard_type)
    if expected_guard != dif.guard_tag:
        errors.append(GuardTagMismatchError(sector_index, expected_guard, dif.guard_tag))

    if context.ref_tag_mode == 'lba':
        expected_ref = sector_index
        if expected_ref != dif.ref_tag:
            errors.append(RefTagMismatchError(sector_index, expected_ref, dif.ref_tag))
    elif context.ref_tag_mode == 'incremental':
        expected_ref = sector_index + 1
        if expected_ref != dif.ref_tag:
            errors.append(RefTagMismatchError(sector_index, expected_ref, dif.ref_tag))

    return errors


def _iter_sectors_streaming(file_path: str, block_size: int = TOTAL_BLOCK_SIZE) -> Iterator[Tuple[int, bytes, bytes]]:
    with open(file_path, 'rb') as f:
        sector_index = 0
        while True:
            block = f.read(block_size)
            if not block:
                break
            if len(block) != block_size:
                raise SCSIPIError(f"Incomplete block at sector {sector_index}: expected {block_size} bytes, got {len(block)}")
            sector_data = block[:SECTOR_SIZE]
            dif_data = block[SECTOR_SIZE:]
            yield sector_index, sector_data, dif_data
            sector_index += 1


def _iter_sectors_mmap(file_path: str, block_size: int = TOTAL_BLOCK_SIZE) -> Iterator[Tuple[int, bytes, bytes]]:
    file_size = os.path.getsize(file_path)

    if file_size % block_size != 0:
        raise SCSIPIError(f"File size {file_size} is not aligned to {block_size} byte blocks")

    num_sectors = file_size // block_size

    with open(file_path, 'rb') as f:
        pos = 0
        while pos < file_size:
            mmap_offset = (pos // PAGE_SIZE) * PAGE_SIZE
            mmap_skip = pos - mmap_offset
            remaining = file_size - pos

            mmap_len = min(MMAP_CHUNK_SIZE, remaining + mmap_skip)
            mmap_len = mmap_len - (mmap_len % PAGE_SIZE)
            if mmap_len < mmap_skip + block_size:
                mmap_len = min(MMAP_CHUNK_SIZE, remaining + mmap_skip)
                mmap_len = mmap_len - (mmap_len % PAGE_SIZE)
                if mmap_len < mmap_skip + block_size:
                    mmap_len = (mmap_skip // PAGE_SIZE + 1) * PAGE_SIZE

            actual_len = min(mmap_len, file_size - mmap_offset)
            if actual_len <= 0:
                break

            with mmap.mmap(f.fileno(), length=actual_len, offset=mmap_offset, access=mmap.ACCESS_READ) as mm:
                data_end = actual_len - mmap_skip
                data_end = data_end - (data_end % block_size)
                i = mmap_skip
                while i < mmap_skip + data_end:
                    sector_index = (mmap_offset + i) // block_size
                    block_data = mm[i:i + block_size]
                    sector_data = block_data[:SECTOR_SIZE]
                    dif_data = block_data[SECTOR_SIZE:]
                    yield sector_index, sector_data, dif_data
                    i += block_size

            pos = mmap_offset + mmap_skip + data_end


def iter_protected_sectors(file_path: str, use_mmap: bool = None) -> Iterator[Tuple[int, bytes, DIFBlock]]:
    file_size = os.path.getsize(file_path)

    if use_mmap is None:
        use_mmap = file_size >= MMAP_THRESHOLD

    if use_mmap:
        iterator = _iter_sectors_mmap(file_path)
    else:
        iterator = _iter_sectors_streaming(file_path)

    for sector_index, sector_data, dif_data in iterator:
        dif = DIFBlock.unpack(dif_data)
        yield sector_index, sector_data, dif


def write_with_pi(input_file: str, output_file: str, context: PIContext, use_mmap: bool = None) -> Dict:
    total_size = os.path.getsize(input_file)
    num_sectors = (total_size + SECTOR_SIZE - 1) // SECTOR_SIZE

    if use_mmap is None:
        use_mmap = total_size >= MMAP_THRESHOLD

    with open(output_file, 'wb') as out_f:
        if use_mmap and total_size > 0:
            with open(input_file, 'rb') as in_f:
                pos = 0
                while pos < total_size:
                    mmap_offset = (pos // PAGE_SIZE) * PAGE_SIZE
                    mmap_skip = pos - mmap_offset
                    remaining = total_size - pos

                    mmap_len = min(MMAP_CHUNK_SIZE, remaining + mmap_skip)
                    mmap_len = mmap_len - (mmap_len % PAGE_SIZE)
                    if mmap_len < mmap_skip + SECTOR_SIZE:
                        mmap_len = (mmap_skip // PAGE_SIZE + 1) * PAGE_SIZE

                    actual_len = min(mmap_len, total_size - mmap_offset)
                    if actual_len <= 0:
                        break

                    with mmap.mmap(in_f.fileno(), length=actual_len, offset=mmap_offset, access=mmap.ACCESS_READ) as mm:
                        chunk_data = bytes(mm[mmap_skip:actual_len])

                    sector_start = (mmap_offset + mmap_skip) // SECTOR_SIZE
                    chunk_len = actual_len - mmap_skip
                    full_sectors = chunk_len // SECTOR_SIZE
                    for i in range(full_sectors):
                        sector_data = chunk_data[i * SECTOR_SIZE:(i + 1) * SECTOR_SIZE]
                        actual_sector = sector_start + i
                        dif = generate_dif(sector_data, actual_sector, context)
                        out_f.write(sector_data)
                        out_f.write(dif.pack())

                    remainder = chunk_len % SECTOR_SIZE
                    if remainder > 0:
                        last_sector_data = chunk_data[-remainder:]
                        padded_data = last_sector_data.ljust(SECTOR_SIZE, b'\x00')
                        actual_sector = sector_start + full_sectors
                        dif = generate_dif(padded_data, actual_sector, context)
                        out_f.write(padded_data)
                        out_f.write(dif.pack())

                    pos = mmap_offset + actual_len
        else:
            with open(input_file, 'rb') as in_f:
                data = in_f.read()

            padded_data = data.ljust(num_sectors * SECTOR_SIZE, b'\x00')

            for i in range(num_sectors):
                sector_data = padded_data[i * SECTOR_SIZE:(i + 1) * SECTOR_SIZE]
                dif = generate_dif(sector_data, i, context)
                out_f.write(sector_data)
                out_f.write(dif.pack())

    return {
        'original_size': total_size,
        'padded_size': num_sectors * SECTOR_SIZE,
        'num_sectors': num_sectors,
        'output_size': num_sectors * TOTAL_BLOCK_SIZE,
        'app_tag': f"0x{context.app_tag:04X}",
        'guard_type': context.guard_type,
        'ref_tag_mode': context.ref_tag_mode,
        'used_mmap': use_mmap
    }


def read_with_pi(input_file: str, output_file: str, context: PIContext, verify: bool = True, use_mmap: bool = None) -> Dict:
    if not os.path.exists(input_file):
        raise FileNotFoundError(f"File not found: {input_file}")

    file_size = os.path.getsize(input_file)
    if file_size % TOTAL_BLOCK_SIZE != 0:
        raise SCSIPIError(f"File size {file_size} is not aligned to {TOTAL_BLOCK_SIZE} byte blocks")

    num_sectors = file_size // TOTAL_BLOCK_SIZE
    all_errors = []
    sectors_verified = 0

    with open(output_file, 'wb') as out_f:
        for sector_index, sector_data, dif in iter_protected_sectors(input_file, use_mmap=use_mmap):
            out_f.write(sector_data)

            if verify:
                errors = verify_dif(sector_data, dif, sector_index, context)
                all_errors.extend(errors)
                sectors_verified += 1

    return {
        'num_sectors': num_sectors,
        'sectors_verified': sectors_verified if verify else 0,
        'original_size': num_sectors * SECTOR_SIZE,
        'errors': len(all_errors),
        'error_details': [str(e) for e in all_errors],
        'verification_passed': len(all_errors) == 0,
        'used_mmap': use_mmap if use_mmap is not None else (file_size >= MMAP_THRESHOLD)
    }


def verify_file(input_file: str, context: PIContext, use_mmap: bool = None,
                 max_errors: int = None, collect_blocks: bool = True) -> Dict:
    if not os.path.exists(input_file):
        raise FileNotFoundError(f"File not found: {input_file}")

    file_size = os.path.getsize(input_file)
    if file_size % TOTAL_BLOCK_SIZE != 0:
        raise SCSIPIError(f"File size {file_size} is not aligned to {TOTAL_BLOCK_SIZE} byte blocks")

    num_sectors = file_size // TOTAL_BLOCK_SIZE
    all_errors = []
    corrupted_blocks = []
    verified_blocks = []
    sectors_verified = 0

    for sector_index, sector_data, dif in iter_protected_sectors(input_file, use_mmap=use_mmap):
        errors = verify_dif(sector_data, dif, sector_index, context)
        sectors_verified += 1

        if errors:
            all_errors.extend(errors)
            if collect_blocks:
                corrupted_blocks.append({
                    'sector': sector_index,
                    'offset': sector_index * TOTAL_BLOCK_SIZE,
                    'expected_guard': f"0x{errors[0].expected:04X}" if isinstance(errors[0], GuardTagMismatchError) else None,
                    'actual_guard': f"0x{dif.guard_tag:04X}",
                    'expected_ref': f"0x{errors[0].expected:08X}" if isinstance(errors[0], RefTagMismatchError) else None,
                    'actual_ref': f"0x{dif.ref_tag:08X}",
                    'app_tag': f"0x{dif.app_tag:04X}",
                    'error_types': [type(e).__name__ for e in errors],
                    'error_messages': [str(e) for e in errors]
                })
        else:
            if collect_blocks:
                verified_blocks.append({
                    'sector': sector_index,
                    'guard_tag': f"0x{dif.guard_tag:04X}",
                    'app_tag': f"0x{dif.app_tag:04X}",
                    'ref_tag': f"0x{dif.ref_tag:08X}"
                })

        if max_errors is not None and len(all_errors) >= max_errors:
            break

    return {
        'num_sectors': num_sectors,
        'sectors_verified': sectors_verified,
        'sectors_corrupted': len(corrupted_blocks),
        'sectors_intact': sectors_verified - len(corrupted_blocks),
        'total_size': file_size,
        'data_size': num_sectors * SECTOR_SIZE,
        'dif_size': num_sectors * DIF_SIZE,
        'errors': len(all_errors),
        'error_details': [str(e) for e in all_errors],
        'corrupted_blocks': corrupted_blocks if collect_blocks else [],
        'verified_blocks': verified_blocks if collect_blocks else [],
        'verification_passed': len(all_errors) == 0,
        'used_mmap': use_mmap if use_mmap is not None else (file_size >= MMAP_THRESHOLD)
    }


def generate_report(input_file: str, context: PIContext, output_file: str = None,
                     use_mmap: bool = None, include_intact: bool = False) -> Dict:
    verify_result = verify_file(input_file, context, use_mmap=use_mmap, collect_blocks=True)

    report = {
        'file_path': os.path.abspath(input_file),
        'file_size': verify_result['total_size'],
        'total_sectors': verify_result['num_sectors'],
        'sectors_verified': verify_result['sectors_verified'],
        'sectors_corrupted': verify_result['sectors_corrupted'],
        'sectors_intact': verify_result['sectors_intact'],
        'verification_passed': verify_result['verification_passed'],
        'context': {
            'app_tag': f"0x{context.app_tag:04X}",
            'guard_type': context.guard_type,
            'ref_tag_mode': context.ref_tag_mode
        },
        'corrupted_blocks': verify_result['corrupted_blocks'],
        'intact_blocks': verify_result['verified_blocks'] if include_intact else [],
        'summary': {
            'total_errors': verify_result['errors'],
            'error_details': verify_result['error_details']
        }
    }

    if output_file:
        import json
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)

    return report


def inject_error(input_file: str, output_file: str, sector_index: int,
                  error_type: str = 'data', byte_offset: int = 0,
                  flip_mask: int = None) -> Dict:
    if not os.path.exists(input_file):
        raise FileNotFoundError(f"File not found: {input_file}")

    file_size = os.path.getsize(input_file)
    if file_size % TOTAL_BLOCK_SIZE != 0:
        raise SCSIPIError(f"File size {file_size} is not aligned to {TOTAL_BLOCK_SIZE} byte blocks")

    num_sectors = file_size // TOTAL_BLOCK_SIZE
    if sector_index >= num_sectors:
        raise ValueError(f"Sector index {sector_index} out of range (0-{num_sectors-1})")

    use_mmap = file_size >= MMAP_THRESHOLD

    if flip_mask is None:
        flip_mask = 0xFF

    if use_mmap:
        import shutil
        shutil.copy2(input_file, output_file)

        with open(output_file, 'r+b') as f:
            with mmap.mmap(f.fileno(), length=0, access=mmap.ACCESS_WRITE) as mm:
                if error_type == 'data':
                    if byte_offset >= SECTOR_SIZE:
                        raise ValueError(f"Byte offset {byte_offset} out of range (0-{SECTOR_SIZE-1})")
                    pos = sector_index * TOTAL_BLOCK_SIZE + byte_offset
                    mm[pos] ^= flip_mask
                elif error_type == 'guard':
                    pos = sector_index * TOTAL_BLOCK_SIZE + SECTOR_SIZE + byte_offset
                    if byte_offset >= GUARD_TAG_SIZE:
                        raise ValueError(f"Guard tag byte offset {byte_offset} out of range (0-{GUARD_TAG_SIZE-1})")
                    mm[pos] ^= flip_mask
                elif error_type == 'ref':
                    pos = sector_index * TOTAL_BLOCK_SIZE + SECTOR_SIZE + GUARD_TAG_SIZE + APP_TAG_SIZE + byte_offset
                    if byte_offset >= REF_TAG_SIZE:
                        raise ValueError(f"Ref tag byte offset {byte_offset} out of range (0-{REF_TAG_SIZE-1})")
                    mm[pos] ^= flip_mask
                elif error_type == 'app':
                    pos = sector_index * TOTAL_BLOCK_SIZE + SECTOR_SIZE + GUARD_TAG_SIZE + byte_offset
                    if byte_offset >= APP_TAG_SIZE:
                        raise ValueError(f"App tag byte offset {byte_offset} out of range (0-{APP_TAG_SIZE-1})")
                    mm[pos] ^= flip_mask
                else:
                    raise ValueError(f"Unsupported error type: {error_type}")
    else:
        with open(input_file, 'rb') as f:
            data = bytearray(f.read())

        if error_type == 'data':
            if byte_offset >= SECTOR_SIZE:
                raise ValueError(f"Byte offset {byte_offset} out of range (0-{SECTOR_SIZE-1})")
            pos = sector_index * TOTAL_BLOCK_SIZE + byte_offset
            data[pos] ^= flip_mask
        elif error_type == 'guard':
            if byte_offset >= GUARD_TAG_SIZE:
                raise ValueError(f"Guard tag byte offset {byte_offset} out of range (0-{GUARD_TAG_SIZE-1})")
            pos = sector_index * TOTAL_BLOCK_SIZE + SECTOR_SIZE + byte_offset
            data[pos] ^= flip_mask
        elif error_type == 'ref':
            if byte_offset >= REF_TAG_SIZE:
                raise ValueError(f"Ref tag byte offset {byte_offset} out of range (0-{REF_TAG_SIZE-1})")
            pos = sector_index * TOTAL_BLOCK_SIZE + SECTOR_SIZE + GUARD_TAG_SIZE + APP_TAG_SIZE + byte_offset
            data[pos] ^= flip_mask
        elif error_type == 'app':
            if byte_offset >= APP_TAG_SIZE:
                raise ValueError(f"App tag byte offset {byte_offset} out of range (0-{APP_TAG_SIZE-1})")
            pos = sector_index * TOTAL_BLOCK_SIZE + SECTOR_SIZE + GUARD_TAG_SIZE + byte_offset
            data[pos] ^= flip_mask
        else:
            raise ValueError(f"Unsupported error type: {error_type}")

        with open(output_file, 'wb') as f:
            f.write(data)

    return {
        'sector_index': sector_index,
        'error_type': error_type,
        'byte_offset': byte_offset,
        'flip_mask': f"0x{flip_mask:02X}",
        'total_sectors': num_sectors,
        'used_mmap': use_mmap
    }


def inject_errors_batch(input_file: str, output_file: str,
                         error_specs: List[Dict]) -> Dict:
    if not os.path.exists(input_file):
        raise FileNotFoundError(f"File not found: {input_file}")

    file_size = os.path.getsize(input_file)
    if file_size % TOTAL_BLOCK_SIZE != 0:
        raise SCSIPIError(f"File size {file_size} is not aligned to {TOTAL_BLOCK_SIZE} byte blocks")

    num_sectors = file_size // TOTAL_BLOCK_SIZE
    use_mmap = file_size >= MMAP_THRESHOLD

    import shutil
    shutil.copy2(input_file, output_file)

    injected = []

    if use_mmap:
        with open(output_file, 'r+b') as f:
            with mmap.mmap(f.fileno(), length=0, access=mmap.ACCESS_WRITE) as mm:
                for spec in error_specs:
                    sector = spec.get('sector', 0)
                    error_type = spec.get('error_type', 'data')
                    byte_offset = spec.get('byte_offset', 0)
                    flip_mask = spec.get('flip_mask', 0xFF)

                    if sector >= num_sectors:
                        continue

                    if error_type == 'data':
                        if byte_offset < SECTOR_SIZE:
                            pos = sector * TOTAL_BLOCK_SIZE + byte_offset
                            mm[pos] ^= flip_mask
                    elif error_type == 'guard':
                        if byte_offset < GUARD_TAG_SIZE:
                            pos = sector * TOTAL_BLOCK_SIZE + SECTOR_SIZE + byte_offset
                            mm[pos] ^= flip_mask
                    elif error_type == 'ref':
                        if byte_offset < REF_TAG_SIZE:
                            pos = sector * TOTAL_BLOCK_SIZE + SECTOR_SIZE + GUARD_TAG_SIZE + APP_TAG_SIZE + byte_offset
                            mm[pos] ^= flip_mask
                    elif error_type == 'app':
                        if byte_offset < APP_TAG_SIZE:
                            pos = sector * TOTAL_BLOCK_SIZE + SECTOR_SIZE + GUARD_TAG_SIZE + byte_offset
                            mm[pos] ^= flip_mask

                    injected.append({
                        'sector': sector,
                        'error_type': error_type,
                        'byte_offset': byte_offset
                    })
    else:
        with open(output_file, 'rb') as f:
            data = bytearray(f.read())

        for spec in error_specs:
            sector = spec.get('sector', 0)
            error_type = spec.get('error_type', 'data')
            byte_offset = spec.get('byte_offset', 0)
            flip_mask = spec.get('flip_mask', 0xFF)

            if sector >= num_sectors:
                continue

            if error_type == 'data':
                if byte_offset < SECTOR_SIZE:
                    pos = sector * TOTAL_BLOCK_SIZE + byte_offset
                    data[pos] ^= flip_mask
            elif error_type == 'guard':
                if byte_offset < GUARD_TAG_SIZE:
                    pos = sector * TOTAL_BLOCK_SIZE + SECTOR_SIZE + byte_offset
                    data[pos] ^= flip_mask
            elif error_type == 'ref':
                if byte_offset < REF_TAG_SIZE:
                    pos = sector * TOTAL_BLOCK_SIZE + SECTOR_SIZE + GUARD_TAG_SIZE + APP_TAG_SIZE + byte_offset
                    data[pos] ^= flip_mask
            elif error_type == 'app':
                if byte_offset < APP_TAG_SIZE:
                    pos = sector * TOTAL_BLOCK_SIZE + SECTOR_SIZE + GUARD_TAG_SIZE + byte_offset
                    data[pos] ^= flip_mask

            injected.append({
                'sector': sector,
                'error_type': error_type,
                'byte_offset': byte_offset
            })

        with open(output_file, 'wb') as f:
            f.write(data)

    return {
        'total_sectors': num_sectors,
        'errors_injected': len(injected),
        'injected_errors': injected,
        'used_mmap': use_mmap
    }


def get_dif_info(input_file: str, use_mmap: bool = None, limit: int = None) -> List[Dict]:
    if not os.path.exists(input_file):
        raise FileNotFoundError(f"File not found: {input_file}")

    file_size = os.path.getsize(input_file)
    if file_size % TOTAL_BLOCK_SIZE != 0:
        raise SCSIPIError(f"File size {file_size} is not aligned to {TOTAL_BLOCK_SIZE} byte blocks")

    dif_info = []

    for sector_index, sector_data, dif in iter_protected_sectors(input_file, use_mmap=use_mmap):
        if limit is not None and sector_index >= limit:
            break
        dif_info.append({
            'sector': sector_index,
            'guard_tag': f"0x{dif.guard_tag:04X}",
            'app_tag': f"0x{dif.app_tag:04X}",
            'ref_tag': f"0x{dif.ref_tag:08X}"
        })

    return dif_info
