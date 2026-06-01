from __future__ import annotations

import gzip
import bz2
import tarfile
import os
import io
import csv
import json
import time
import datetime
from dataclasses import dataclass, field
from typing import Any


@dataclass
class AllocRecord:
    seq: int
    offset: int
    length: int
    device: int
    file_path: str
    timestamp: int
    ref_count: int = 1


@dataclass
class LeakResult:
    alloc_map: dict[tuple[int, int], AllocRecord] = field(default_factory=dict)
    logs: list[dict] = field(default_factory=list)
    leaks: list[dict] = field(default_factory=list)
    overview: dict[str, Any] = field(default_factory=dict)
    trend: list[dict] = field(default_factory=list)
    summary: dict[str, Any] = field(default_factory=dict)


def detect_leaks(log_entries: list[dict]) -> LeakResult:
    result = LeakResult()
    alloc_map: dict[tuple[int, int], AllocRecord] = {}
    total_alloc = 0
    total_dealloc = 0
    alloc_count = 0
    dealloc_count = 0
    ref_count_increments = 0
    cumulative_alloc = 0
    cumulative_dealloc = 0
    trend_data: list[dict] = []

    for entry in log_entries:
        op_type = entry["op_type"]
        device = entry["device"]
        offset = entry["offset"]
        length = entry["length"]
        file_path = entry["file_path"]
        timestamp = entry["timestamp"]
        seq = entry["seq"]

        if op_type == 2:
            key = (device, offset)
            if key in alloc_map:
                alloc_map[key].ref_count += 1
                ref_count_increments += 1
            else:
                alloc_map[key] = AllocRecord(
                    seq=seq,
                    offset=offset,
                    length=length,
                    device=device,
                    file_path=file_path,
                    timestamp=timestamp,
                    ref_count=1,
                )
            total_alloc += length
            alloc_count += 1
            cumulative_alloc += length

        elif op_type == 3:
            key = (device, offset)
            if key in alloc_map:
                record = alloc_map[key]
                record.ref_count -= 1
                if record.ref_count <= 0:
                    if length >= record.length:
                        total_dealloc += record.length
                        del alloc_map[key]
                    else:
                        total_dealloc += length
                        new_offset = record.offset + length
                        new_length = record.length - length
                        new_key = (device, new_offset)
                        alloc_map[new_key] = AllocRecord(
                            seq=record.seq,
                            offset=new_offset,
                            length=new_length,
                            device=record.device,
                            file_path=record.file_path,
                            timestamp=record.timestamp,
                            ref_count=1,
                        )
                        del alloc_map[key]
                else:
                    total_dealloc += min(length, record.length)
                dealloc_count += 1
                cumulative_dealloc += length

        leak_size = sum(r.length for r in alloc_map.values() if r.ref_count > 0)
        trend_data.append(
            {
                "seq": seq,
                "allocated": cumulative_alloc,
                "freed": cumulative_dealloc,
                "leaked": leak_size,
            }
        )

    leak_list: list[dict] = []
    total_leak_size = 0
    for idx, (key, record) in enumerate(alloc_map.items()):
        if record.ref_count > 0:
            total_leak_size += record.length
            leak_list.append(
                {
                    "id": idx + 1,
                    "offset": record.offset,
                    "length": record.length,
                    "device": record.device,
                    "file_path": record.file_path,
                    "allocated_at_seq": record.seq,
                    "allocated_at_timestamp": record.timestamp,
                    "ref_count": record.ref_count,
                }
            )

    leak_list.sort(key=lambda x: (x["ref_count"], x["length"]), reverse=True)

    device_summary: dict[str, dict[str, Any]] = {}
    for leak in leak_list:
        dev = str(leak["device"])
        if dev not in device_summary:
            device_summary[dev] = {"count": 0, "total_size": 0, "total_refs": 0}
        device_summary[dev]["count"] += 1
        device_summary[dev]["total_size"] += leak["length"]
        device_summary[dev]["total_refs"] += leak["ref_count"]

    file_summary: dict[str, dict[str, Any]] = {}
    for leak in leak_list:
        fp = leak["file_path"]
        if fp not in file_summary:
            file_summary[fp] = {"count": 0, "total_size": 0, "total_refs": 0}
        file_summary[fp]["count"] += 1
        file_summary[fp]["total_size"] += leak["length"]
        file_summary[fp]["total_refs"] += leak["ref_count"]

    overview = {
        "total_operations": len(log_entries),
        "allocation_count": alloc_count,
        "deallocation_count": dealloc_count,
        "ref_count_increments": ref_count_increments,
        "total_allocated": total_alloc,
        "total_freed": total_dealloc,
        "leaked_blocks": len(leak_list),
        "leaked_size": total_leak_size,
    }

    summary = {
        "by_device": device_summary,
        "by_file": file_summary,
    }

    result.alloc_map = alloc_map
    result.logs = log_entries
    result.leaks = leak_list
    result.overview = overview
    result.trend = trend_data
    result.summary = summary
    return result


def read_compressed_log(file_path: str) -> bytes:
    _, ext = os.path.splitext(file_path.lower())

    if ext in (".gz", ".gzip"):
        with gzip.open(file_path, "rb") as f:
            return f.read()
    elif ext in (".bz2", ".bzip2"):
        with bz2.open(file_path, "rb") as f:
            return f.read()
    elif ext in (".tar", ".tgz", ".tar.gz", ".tar.bz2"):
        return _read_tar_archive(file_path)
    else:
        with open(file_path, "rb") as f:
            return f.read()


def _read_tar_archive(file_path: str) -> bytes:
    combined_data = bytearray()
    mode = "r:"
    if file_path.endswith(".gz") or file_path.endswith(".tgz"):
        mode = "r:gz"
    elif file_path.endswith(".bz2"):
        mode = "r:bz2"

    with tarfile.open(file_path, mode) as tar:
        for member in tar.getmembers():
            if member.isfile():
                f = tar.extractfile(member)
                if f:
                    content = f.read()
                    if _looks_like_bluefs_log(content):
                        combined_data.extend(content)

    return bytes(combined_data)


def _looks_like_bluefs_log(data: bytes) -> bool:
    if len(data) < 16:
        return False
    import struct
    magic = struct.unpack("<Q", data[:8])[0]
    return magic == 0x424C5545


def read_log_from_bytes(data: bytes) -> bytes:
    if data[:2] == b"\x1f\x8b":
        return gzip.decompress(data)
    if data[:3] == b"BZh":
        return bz2.decompress(data)
    return data


def paginate(items: list, page: int = 1, per_page: int = 50) -> dict:
    total = len(items)
    start = (page - 1) * per_page
    end = start + per_page
    return {
        "items": items[start:end],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page if per_page > 0 else 0,
    }


def filter_logs(logs: list[dict], op_type: str = "all") -> list[dict]:
    if op_type == "all":
        return logs
    try:
        type_num = int(op_type)
        return [log for log in logs if log["op_type"] == type_num]
    except ValueError:
        return [log for log in logs if log["op_name"] == op_type]


def sort_leaks(leaks: list[dict], sort_by: str = "size", order: str = "desc") -> list[dict]:
    reverse = order == "desc"
    key_map = {
        "size": "length",
        "offset": "offset",
        "device": "device",
        "file_path": "file_path",
        "timestamp": "timestamp",
        "ref_count": "ref_count",
    }
    key = key_map.get(sort_by, "length")
    return sorted(leaks, key=lambda x: x.get(key, 0), reverse=reverse)


def generate_fix_script(leaks: list[dict], script_type: str = "ceph") -> dict:
    dealloc_ops = []
    total_size = 0

    for leak in leaks:
        device = leak["device"]
        offset = leak["offset"]
        length = leak["length"]
        ref_count = leak["ref_count"]

        for _ in range(ref_count):
            dealloc_ops.append(
                {
                    "op_type": 3,
                    "op_name": "DEALLOC",
                    "device": device,
                    "offset": offset,
                    "length": length,
                    "file_path": leak["file_path"],
                    "leak_id": leak["id"],
                }
            )
            total_size += length

    if script_type == "ceph":
        script_lines = [
            "#!/bin/bash",
            "# BlueFS 泄漏自动修复脚本",
            f"# 总计修复 {len(dealloc_ops)} 个操作，释放 {total_size} 字节",
            "#",
            "# 警告：请在执行前备份数据！",
            "# 此脚本会向 BlueFS 日志追加 DEALLOC 操作",
            "#",
            "set -e",
            "",
            'echo "开始修复 BlueFS 元数据泄漏..."',
            f'echo "待释放块数: {len(leaks)}"',
            f'echo "待释放空间: {total_size} bytes"',
            "",
        ]

        for op in dealloc_ops:
            device_name = f"device-{op['device']}"
            script_lines.append(
                f"# 释放 {op['file_path']} @ 0x{op['offset']:X} ({op['length']} bytes)"
            )
            script_lines.append(
                'echo "DEALLOC: device={d} offset=0x{o:X} length={l}"'.format(
                    d=op["device"], o=op["offset"], l=op["length"]
                )
            )
            script_lines.append(
                "ceph-bluestore-tool --path=/var/lib/ceph/osd/ceph-*/ bluefs-dealloc "
                "--device={d} --offset=0x{o:X} --length={l} || true".format(
                    d=op["device"], o=op["offset"], l=op["length"]
                )
            )
            script_lines.append("")

        script_lines.append('echo "修复完成，请重启 OSD 使更改生效"')
        script_content = "\n".join(script_lines)

    elif script_type == "binary":
        import struct
        from bluefs_parser import (
            ENTRY_FIXED_FORMAT,
            PATH_LEN_FORMAT,
            TIMESTAMP_FORMAT,
        )

        bin_data = bytearray()
        ts = int(time.time() * 1_000_000)

        for op in dealloc_ops:
            path_bytes = op["file_path"].encode("utf-8")
            bin_data.extend(
                struct.pack(ENTRY_FIXED_FORMAT, 3, op["offset"], op["length"], op["device"])
            )
            bin_data.extend(struct.pack(PATH_LEN_FORMAT, len(path_bytes)))
            bin_data.extend(path_bytes)
            bin_data.extend(struct.pack(TIMESTAMP_FORMAT, ts))
            ts += 1

        script_content = bin_data.hex()

    else:
        script_content = ""

    return {
        "dealloc_operations": dealloc_ops,
        "operation_count": len(dealloc_ops),
        "block_count": len(leaks),
        "total_size": total_size,
        "script_content": script_content,
        "script_type": script_type,
    }


def export_leak_report(leaks: list[dict], overview: dict, summary: dict, format: str = "json") -> dict:
    if format == "json":
        report = {
            "report_generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "overview": overview,
            "summary": summary,
            "leaks": leaks,
        }
        return {
            "content": json.dumps(report, indent=2),
            "filename": f"bluefs_leak_report_{time.strftime('%Y%m%d_%H%M%S')}.json",
            "content_type": "application/json",
        }

    elif format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow(["# BlueFS 泄漏检测报告"])
        writer.writerow(["# 生成时间", time.strftime("%Y-%m-%d %H:%M:%S")])
        writer.writerow([])

        writer.writerow(["# 概览统计"])
        for k, v in overview.items():
            writer.writerow([k, v])
        writer.writerow([])

        writer.writerow(["# 按设备汇总"])
        writer.writerow(["设备", "泄漏块数", "总大小", "总引用数"])
        for dev, info in summary["by_device"].items():
            writer.writerow([dev, info["count"], info["total_size"], info["total_refs"]])
        writer.writerow([])

        writer.writerow(["# 按文件汇总"])
        writer.writerow(["文件路径", "泄漏块数", "总大小", "总引用数"])
        for fp, info in summary["by_file"].items():
            writer.writerow([fp, info["count"], info["total_size"], info["total_refs"]])
        writer.writerow([])

        writer.writerow(["# 泄漏块详情"])
        writer.writerow(
            ["ID", "偏移(HEX)", "大小", "引用计数", "设备", "文件路径", "分配序列号", "分配时间"]
        )
        for leak in leaks:
            writer.writerow(
                [
                    leak["id"],
                    f"0x{leak['offset']:X}",
                    leak["length"],
                    leak["ref_count"],
                    leak["device"],
                    leak["file_path"],
                    leak["allocated_at_seq"],
                    datetime.datetime.fromtimestamp(
                        leak["allocated_at_timestamp"] / 1_000_000
                    ).strftime("%Y-%m-%d %H:%M:%S.%f"),
                ]
            )

        return {
            "content": output.getvalue(),
            "filename": f"bluefs_leak_report_{time.strftime('%Y%m%d_%H%M%S')}.csv",
            "content_type": "text/csv; charset=utf-8",
        }

    else:
        raise ValueError(f"Unsupported format: {format}")

