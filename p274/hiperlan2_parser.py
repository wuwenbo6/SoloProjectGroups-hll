#!/usr/bin/env python3
import struct
from typing import Dict, Any, Optional, List
from enum import Enum


CRC32_POLY = 0x04C11DB7
CRC32_INIT = 0xFFFF


def _build_crc32_table() -> List[int]:
    table = []
    for i in range(256):
        crc = i << 24
        for _ in range(8):
            if crc & 0x80000000:
                crc = ((crc << 1) ^ CRC32_POLY) & 0xFFFFFFFF
            else:
                crc = (crc << 1) & 0xFFFFFFFF
        table.append(crc)
    return table


_CRC32_TABLE = _build_crc32_table()


def compute_crc32(data: bytes, init: int = CRC32_INIT) -> int:
    crc = init
    for byte in data:
        index = ((crc >> 24) ^ byte) & 0xFF
        crc = ((crc << 8) ^ _CRC32_TABLE[index]) & 0xFFFFFFFF
    return crc


class FrameType(Enum):
    UNICAST = "unicast"
    MULTICAST = "multicast"
    BROADCAST = "broadcast"


class HIPERLAN2Frame:
    BROADCAST_MAC = "FF:FF:FF:FF:FF:FF"
    MULTICAST_PREFIX = "01:00:5E"

    def __init__(self, raw_bytes: bytes):
        self.raw_bytes = raw_bytes
        self.parsed = self._parse_frame()

    def _parse_mac_address(self, bytes_data: bytes) -> str:
        return ":".join(f"{b:02X}" for b in bytes_data)

    def _is_broadcast(self, mac: str) -> bool:
        return mac == self.BROADCAST_MAC

    def _is_multicast(self, mac: str) -> bool:
        return mac.startswith(self.MULTICAST_PREFIX) or (int(mac.split(":")[0], 16) & 0x01) == 1

    def _get_frame_type(self, dest_mac: str) -> FrameType:
        if self._is_broadcast(dest_mac):
            return FrameType.BROADCAST
        elif self._is_multicast(dest_mac):
            return FrameType.MULTICAST
        else:
            return FrameType.UNICAST

    def _parse_frame(self) -> Dict[str, Any]:
        result = {
            "raw_length": len(self.raw_bytes),
            "mac_header": {},
            "control_field": {},
            "payload": {},
            "frame_type": None,
            "sequence_number": None
        }

        if len(self.raw_bytes) < 24:
            result["error"] = "Frame too short, minimum 24 bytes required"
            return result

        try:
            frame_control = struct.unpack("<H", self.raw_bytes[0:2])[0]
            duration_id = struct.unpack("<H", self.raw_bytes[2:4])[0]
            addr1 = self.raw_bytes[4:10]
            addr2 = self.raw_bytes[10:16]
            addr3 = self.raw_bytes[16:22]
            seq_ctrl = struct.unpack("<H", self.raw_bytes[22:24])[0]

            dest_mac = self._parse_mac_address(addr1)
            src_mac = self._parse_mac_address(addr2)
            bssid = self._parse_mac_address(addr3)

            sequence_number = (seq_ctrl >> 4) & 0x0FFF
            fragment_number = seq_ctrl & 0x000F

            frame_type = self._get_frame_type(dest_mac)

            protocol_version = (frame_control >> 0) & 0x0003
            type_field = (frame_control >> 2) & 0x0003
            subtype = (frame_control >> 4) & 0x000F
            to_ds = (frame_control >> 8) & 0x0001
            from_ds = (frame_control >> 9) & 0x0001
            more_frag = (frame_control >> 10) & 0x0001
            retry = (frame_control >> 11) & 0x0001
            power_mgmt = (frame_control >> 12) & 0x0001
            more_data = (frame_control >> 13) & 0x0001
            protected = (frame_control >> 14) & 0x0001
            order = (frame_control >> 15) & 0x0001

            payload_start = 24
            fcs_data = self.raw_bytes[:payload_start]
            payload = self.raw_bytes[payload_start:]
            fcs = None
            fcs_valid = None
            if len(payload) >= 4:
                fcs = struct.unpack("<I", payload[-4:])[0]
                payload = payload[:-4]
                computed_crc = compute_crc32(fcs_data + payload)
                fcs_valid = (computed_crc == fcs)

            result["mac_header"] = {
                "destination_mac": dest_mac,
                "source_mac": src_mac,
                "bssid": bssid,
                "duration_id": duration_id
            }

            result["control_field"] = {
                "protocol_version": protocol_version,
                "type": type_field,
                "subtype": subtype,
                "to_ds": bool(to_ds),
                "from_ds": bool(from_ds),
                "more_fragments": bool(more_frag),
                "retry": bool(retry),
                "power_management": bool(power_mgmt),
                "more_data": bool(more_data),
                "protected": bool(protected),
                "order": bool(order)
            }

            result["payload"] = {
                "length": len(payload),
                "hex_dump": payload.hex(),
                "ascii": self._bytes_to_ascii(payload)
            }

            if fcs is not None:
                result["fcs"] = f"0x{fcs:08X}"
                result["fcs_computed"] = f"0x{compute_crc32(fcs_data + payload):08X}"
                result["fcs_valid"] = fcs_valid

            result["frame_type"] = frame_type.value
            result["sequence_number"] = sequence_number
            result["fragment_number"] = fragment_number
            result["type_description"] = self._get_type_description(type_field, subtype)

        except Exception as e:
            result["error"] = f"Parse error: {str(e)}"

        return result

    def _bytes_to_ascii(self, data: bytes) -> str:
        try:
            return ''.join(chr(b) if 32 <= b < 127 else '.' for b in data)
        except:
            return ""

    def _get_type_description(self, type_val: int, subtype_val: int) -> str:
        types = {
            0: "Management",
            1: "Control",
            2: "Data",
            3: "Extension"
        }
        return types.get(type_val, f"Reserved ({type_val})")

    def get_summary(self) -> Dict[str, Any]:
        return {
            "frame_type": self.parsed.get("frame_type"),
            "sequence_number": self.parsed.get("sequence_number"),
            "source_mac": self.parsed.get("mac_header", {}).get("source_mac"),
            "destination_mac": self.parsed.get("mac_header", {}).get("destination_mac"),
            "payload_length": self.parsed.get("payload", {}).get("length", 0)
        }

    def get_full_parsed(self) -> Dict[str, Any]:
        return self.parsed


def parse_hiperlan2_frame(raw_bytes: bytes) -> Dict[str, Any]:
    frame = HIPERLAN2Frame(raw_bytes)
    return frame.get_full_parsed()


def create_test_frame(frame_type: FrameType = FrameType.UNICAST, seq_num: int = 1, retry: bool = False) -> bytes:
    frame_control = 0x0008
    if retry:
        frame_control |= (1 << 11)
    duration = 0x0000

    if frame_type == FrameType.BROADCAST:
        dest_mac = bytes.fromhex("FFFFFFFFFFFF")
    elif frame_type == FrameType.MULTICAST:
        dest_mac = bytes.fromhex("01005E000001")
    else:
        dest_mac = bytes.fromhex("001122334455")

    src_mac = bytes.fromhex("AABBCCDDEEFF")
    bssid = bytes.fromhex("001122AABBCC")
    seq_ctrl = (seq_num << 4) & 0xFFFF

    payload = b"Hello HIPERLAN/2 World!"

    frame = struct.pack("<H", frame_control)
    frame += struct.pack("<H", duration)
    frame += dest_mac
    frame += src_mac
    frame += bssid
    frame += struct.pack("<H", seq_ctrl)
    frame += payload

    fcs_value = compute_crc32(frame)
    frame += struct.pack("<I", fcs_value)

    return frame


def analyze_retransmissions(frames: List[Dict[str, Any]]) -> Dict[str, Any]:
    stats = {
        "total_frames": len(frames),
        "retry_flag_count": 0,
        "duplicate_seq_count": 0,
        "retransmission_rate": 0.0,
        "retry_details": [],
        "duplicate_details": []
    }

    seq_tracker = {}

    for idx, frame in enumerate(frames):
        parsed = frame.get('parsed', frame)
        seq_num = parsed.get('sequence_number', 0)
        src_mac = parsed.get('mac_header', {}).get('source_mac', '')
        dest_mac = parsed.get('mac_header', {}).get('destination_mac', '')
        retry_flag = parsed.get('control_field', {}).get('retry', False)

        key = f"{src_mac}_{dest_mac}_{seq_num}"

        if retry_flag:
            stats["retry_flag_count"] += 1
            stats["retry_details"].append({
                "index": idx,
                "sequence_number": seq_num,
                "source_mac": src_mac,
                "destination_mac": dest_mac
            })

        if key in seq_tracker:
            stats["duplicate_seq_count"] += 1
            stats["duplicate_details"].append({
                "index": idx,
                "sequence_number": seq_num,
                "source_mac": src_mac,
                "destination_mac": dest_mac,
                "first_seen_at": seq_tracker[key]
            })
        else:
            seq_tracker[key] = idx

    if stats["total_frames"] > 0:
        stats["retransmission_rate"] = round(
            (stats["retry_flag_count"] + stats["duplicate_seq_count"]) / stats["total_frames"] * 100, 2
        )

    return stats


def write_pcap(filename: str, frames: List[Dict[str, Any]], link_type: int = 105) -> bool:
    PCAP_GLOBAL_HEADER = struct.pack(
        "<IHHIIII",
        0xA1B2C3D4,
        2,
        4,
        0,
        0,
        65535,
        link_type
    )

    try:
        with open(filename, 'wb') as f:
            f.write(PCAP_GLOBAL_HEADER)

            for frame in frames:
                hex_data = frame.get('hex_data', '')
                if not hex_data and 'raw_bytes' in frame:
                    raw_data = frame['raw_bytes']
                elif hex_data:
                    raw_data = bytes.fromhex(hex_data.replace(' ', '').replace(':', ''))
                else:
                    continue

                ts_sec = int(frame.get('timestamp', 0) / 1000)
                ts_usec = int((frame.get('timestamp', 0) % 1000) * 1000)
                incl_len = len(raw_data)
                orig_len = len(raw_data)

                pcap_header = struct.pack(
                    "<IIII",
                    ts_sec,
                    ts_usec,
                    incl_len,
                    orig_len
                )

                f.write(pcap_header)
                f.write(raw_data)

        return True
    except Exception as e:
        print(f"PCAP write error: {e}")
        return False


def frames_to_pcap_bytes(frames: List[Dict[str, Any]], link_type: int = 105) -> bytes:
    PCAP_GLOBAL_HEADER = struct.pack(
        "<IHHIIII",
        0xA1B2C3D4,
        2,
        4,
        0,
        0,
        65535,
        link_type
    )

    result = bytearray(PCAP_GLOBAL_HEADER)

    import time
    current_time = int(time.time() * 1000)

    for frame in frames:
        hex_data = frame.get('hex_data', '')
        if not hex_data and 'raw_bytes' in frame:
            raw_data = frame['raw_bytes']
        elif hex_data:
            raw_data = bytes.fromhex(hex_data.replace(' ', '').replace(':', ''))
        else:
            continue

        ts_ms = frame.get('timestamp', current_time)
        ts_sec = int(ts_ms / 1000)
        ts_usec = int((ts_ms % 1000) * 1000)
        incl_len = len(raw_data)
        orig_len = len(raw_data)

        pcap_header = struct.pack(
            "<IIII",
            ts_sec,
            ts_usec,
            incl_len,
            orig_len
        )

        result.extend(pcap_header)
        result.extend(raw_data)

    return bytes(result)
