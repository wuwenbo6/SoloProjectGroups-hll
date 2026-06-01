"""
RTCP XR (RFC 3611) 报文解析器

严格按照 RFC 3611 Section 4 定义解析各 Report Block 类型：
- BT=1: Loss RLE Report Block
- BT=2: Duplicate RLE Report Block
- BT=3: Packet Receipt Times Report Block
- BT=6: Statistics Summary Report Block
- BT=7: VoIP Metrics Report Block

VoIP Metrics Block (BT=7) 格式见 RFC 3611 Section 4.7:
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|     BT=7      | res | type  |         block length          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        SSRC of source                        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|   loss rate   | discard rate  |  burst density | gap density  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|         burst duration        |          gap duration         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|        round trip delay       |       end system delay        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| signal level  |  noise level  |     RERL      |     Gmin      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|   R factor    |  ext. R fact. |   MOS-LQ      |   MOS-CQ      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  RX config    |    reserved   |      jitter buffer nominal   |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|      jitter buffer maximum    |      jitter buffer abs. max  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
"""

import struct


BLOCK_TYPE_NAMES = {
    1: "Loss RLE",
    2: "Duplicate RLE",
    3: "Packet Receipt Times",
    4: "Receiver Reference Time",
    5: "DLRR",
    6: "Statistics Summary",
    7: "VoIP Metrics",
}

PLC_TYPE_NAMES = {
    0: "Unknown",
    1: "Standard (silence)",
    2: "Custom algorithm",
    3: "ITU-T G.711 Appendix I",
    4: "Frame repetition",
    5: "Pitch waveform replication",
    6: "ITU-T G.722 Appendix II",
}


def _parse_voip_metrics_block(data: bytes, offset: int, block_length: int, block_reserved: int = 0) -> dict:
    """
    Parse VoIP Metrics Report Block (BT=7) per RFC 3611 Section 4.7
    """
    if block_length < 8:
        return {"error": "VoIP Metrics block too short, expected length >= 8"}

    fmt = ">I BB BB HH HH bb BB BB BB BB HHH"
    size = struct.calcsize(fmt)
    if offset + size > len(data):
        return {"error": "VoIP Metrics block truncated"}

    plc_type = block_reserved & 0x1F
    plc_reserved = (block_reserved >> 5) & 0x07

    (
        ssrc_source,
        loss_rate_byte,
        discard_rate_byte,
        burst_density_byte,
        gap_density_byte,
        burst_duration,
        gap_duration,
        round_trip_delay,
        end_system_delay,
        signal_level,
        noise_level,
        rerl,
        gmin,
        r_factor_byte,
        ext_r_factor_byte,
        mos_lq_byte,
        mos_cq_byte,
        rx_config_byte,
        reserved,
        jb_nominal,
        jb_maximum,
        jb_absolute_max,
    ) = struct.unpack_from(fmt, data, offset)

    loss_rate = round(loss_rate_byte / 256.0 * 100, 2)
    discard_rate = round(discard_rate_byte / 256.0 * 100, 2)
    burst_density = round(burst_density_byte / 256.0 * 100, 2)
    gap_density = round(gap_density_byte / 256.0 * 100, 2)

    if mos_lq_byte == 0 or mos_lq_byte == 255:
        mos_lq = 0.0
    elif mos_lq_byte >= 127:
        mos_lq = None
    else:
        mos_lq = round(mos_lq_byte / 10.0, 1)

    if mos_cq_byte == 0 or mos_cq_byte == 255:
        mos_cq = 0.0
    elif mos_cq_byte >= 127:
        mos_cq = None
    else:
        mos_cq = round(mos_cq_byte / 10.0, 1)

    if r_factor_byte == 127 or r_factor_byte == 255:
        r_factor = None
    else:
        r_factor = r_factor_byte

    if ext_r_factor_byte == 127 or ext_r_factor_byte == 255:
        ext_r_factor = None
    else:
        ext_r_factor = ext_r_factor_byte

    return {
        "block_type": 7,
        "block_type_name": "VoIP Metrics",
        "fields": {
            "ssrc_source": ssrc_source,
            "plc_type": plc_type,
            "plc_type_name": PLC_TYPE_NAMES.get(plc_type, f"Unknown ({plc_type})"),
            "plc_reserved": plc_reserved,
            "loss_rate": loss_rate,
            "discard_rate": discard_rate,
            "burst_density": burst_density,
            "gap_density": gap_density,
            "burst_duration_ms": burst_duration,
            "gap_duration_ms": gap_duration,
            "round_trip_delay_ms": round_trip_delay,
            "end_system_delay_ms": end_system_delay,
            "signal_level_dbm0": signal_level,
            "noise_level_dbm0": noise_level,
            "rerl_db": rerl,
            "gmin_ms": gmin,
            "r_factor": r_factor,
            "ext_r_factor": ext_r_factor,
            "mos_lq": mos_lq,
            "mos_cq": mos_cq,
            "rx_config": rx_config_byte,
            "reserved": reserved,
            "jitter_buffer_nominal_delay_ms": jb_nominal,
            "jitter_buffer_maximum_delay_ms": jb_maximum,
            "jitter_buffer_absolute_maximum_delay_ms": jb_absolute_max,
        },
    }


def _parse_loss_rle_block(data: bytes, offset: int, block_length: int) -> dict:
    """Parse Loss RLE Report Block (BT=1) per RFC 3611 Section 4.1"""
    fmt = ">I I I"
    size = struct.calcsize(fmt)
    if offset + size > len(data):
        return {"error": "Loss RLE block truncated"}
    ssrc_source, lost_packets, dup_packets = struct.unpack_from(fmt, data, offset)

    rle_data = []
    rle_offset = offset + size
    end_offset = offset + block_length * 4
    while rle_offset + 2 <= end_offset:
        run_type = struct.unpack_from(">H", data, rle_offset)[0] >> 15
        run_length = struct.unpack_from(">H", data, rle_offset)[0] & 0x7FFF
        rle_data.append({"type": run_type, "length": run_length})
        rle_offset += 2

    return {
        "block_type": 1,
        "block_type_name": "Loss RLE",
        "fields": {
            "ssrc_source": ssrc_source,
            "lost_packets": lost_packets,
            "dup_packets": dup_packets,
            "rle_entries": rle_data,
        },
    }


def _parse_duplicate_rle_block(data: bytes, offset: int, block_length: int) -> dict:
    """Parse Duplicate RLE Report Block (BT=2) per RFC 3611 Section 4.2"""
    fmt = ">I I I"
    size = struct.calcsize(fmt)
    if offset + size > len(data):
        return {"error": "Duplicate RLE block truncated"}
    ssrc_source, dup_packets, reserved = struct.unpack_from(fmt, data, offset)
    return {
        "block_type": 2,
        "block_type_name": "Duplicate RLE",
        "fields": {
            "ssrc_source": ssrc_source,
            "dup_packets": dup_packets,
            "reserved": reserved,
        },
    }


def _parse_packet_receipt_times_block(data: bytes, offset: int, block_length: int) -> dict:
    """Parse Packet Receipt Times Report Block (BT=3) per RFC 3611 Section 4.3"""
    fmt = ">I"
    size = struct.calcsize(fmt)
    if offset + size > len(data):
        return {"error": "Packet Receipt Times block truncated"}
    ssrc_source = struct.unpack_from(fmt, data, offset)[0]
    receipt_times = []
    t_offset = offset + 4
    while t_offset + 4 <= len(data) and t_offset < offset + block_length * 4:
        receipt_times.append(struct.unpack_from(">I", data, t_offset)[0])
        t_offset += 4
    return {
        "block_type": 3,
        "block_type_name": "Packet Receipt Times",
        "fields": {
            "ssrc_source": ssrc_source,
            "receipt_times": receipt_times,
        },
    }


def _parse_statistics_summary_block(data: bytes, offset: int, block_length: int) -> dict:
    """Parse Statistics Summary Report Block (BT=6) per RFC 3611 Section 4.6"""
    fmt = ">I BB BB HH"
    size = struct.calcsize(fmt)
    if offset + size > len(data):
        return {"error": "Statistics Summary block truncated"}
    (
        ssrc_source,
        lost_packets_hi,
        lost_packets_lo,
        dup_packets_hi,
        dup_packets_lo,
        min_jitter,
        max_jitter,
    ) = struct.unpack_from(fmt, data, offset)
    lost_packets = (lost_packets_hi << 8) | lost_packets_lo
    dup_packets = (dup_packets_hi << 8) | dup_packets_lo

    mean_jitter = 0
    if offset + size + 2 <= len(data):
        mean_jitter = struct.unpack_from(">H", data, offset + size)[0]

    return {
        "block_type": 6,
        "block_type_name": "Statistics Summary",
        "fields": {
            "ssrc_source": ssrc_source,
            "lost_packets": lost_packets,
            "dup_packets": dup_packets,
            "min_jitter": min_jitter,
            "max_jitter": max_jitter,
            "mean_jitter": mean_jitter,
        },
    }


_BLOCK_PARSERS = {
    1: _parse_loss_rle_block,
    2: _parse_duplicate_rle_block,
    3: _parse_packet_receipt_times_block,
    6: _parse_statistics_summary_block,
}


def parse_rtcp_xr(data: bytes) -> dict:
    """
    Parse RTCP Extended Report (XR) packet per RFC 3611.
    
    Args:
        data: bytes of the RTCP XR packet
    
    Returns:
        dict with parsed fields including report_blocks
    """
    if len(data) < 8:
        return {"error": "Packet too short for RTCP header"}

    byte0, pt, length, ssrc = struct.unpack_from(">BBH I", data, 0)
    version = (byte0 >> 6) & 0x03
    padding = (byte0 >> 5) & 0x01

    if version != 2:
        return {"error": f"Invalid RTCP version: {version}, expected 2"}
    if pt != 207:
        return {"error": f"Invalid payload type: {pt}, expected 207 (XR)"}

    total_bytes = (length + 1) * 4
    if len(data) < total_bytes:
        return {"error": f"Packet truncated: expected {total_bytes} bytes, got {len(data)}"}

    result = {
        "version": version,
        "padding": padding,
        "payload_type": pt,
        "length": length,
        "length_bytes": total_bytes,
        "ssrc": ssrc,
        "report_blocks": [],
    }

    offset = 8
    end = total_bytes

    while offset + 4 <= end:
        bt = data[offset]
        type_specific = data[offset + 1]
        block_length = struct.unpack_from(">H", data, offset + 2)[0]
        block_data_start = offset + 4
        block_data_bytes = block_length * 4

        if bt == 7:
            block_result = _parse_voip_metrics_block(
                data, block_data_start, block_length, type_specific
            )
        elif bt in _BLOCK_PARSERS:
            block_result = _BLOCK_PARSERS[bt](data, block_data_start, block_length)
        else:
            block_result = {
                "block_type": bt,
                "block_type_name": BLOCK_TYPE_NAMES.get(bt, f"Unknown (BT={bt})"),
                "fields": {
                    "type_specific": type_specific,
                    "block_length": block_length,
                    "raw_data": data[block_data_start:block_data_start + block_data_bytes].hex(),
                },
            }

        block_result["block_header"] = {
            "block_type": bt,
            "type_specific": type_specific,
            "block_length": block_length,
            "block_bytes": block_data_bytes + 4,
        }

        result["report_blocks"].append(block_result)
        offset = block_data_start + block_data_bytes

    voip = None
    for b in result["report_blocks"]:
        if b.get("block_type") == 7:
            voip = b.get("fields", {})
            break

    if voip:
        result["loss_rate"] = voip.get("loss_rate", 0) or 0
        result["discard_rate"] = voip.get("discard_rate", 0) or 0
        result["jitter_buffer_delay"] = voip.get("jitter_buffer_nominal_delay_ms", 0) or 0
        result["mos_lq"] = voip.get("mos_lq", 0) or 0
        result["mos_cq"] = voip.get("mos_cq", 0) or 0
        result["r_factor"] = voip.get("r_factor", 0) or 0
    else:
        result["loss_rate"] = 0
        result["discard_rate"] = 0
        result["jitter_buffer_delay"] = 0
        result["mos_lq"] = 0
        result["mos_cq"] = 0
        result["r_factor"] = 0

    return result
