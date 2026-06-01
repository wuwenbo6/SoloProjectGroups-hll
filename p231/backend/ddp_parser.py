import struct
from datetime import datetime, timezone

DDP_PROTOCOL_TYPES = {
    1: "RTMP",
    2: "NBP",
    3: "ATP",
    4: "AEP",
    5: "RTMPRequest",
    6: "ZIP",
    7: "ADSP",
    8: "UNKNOWN_8",
    9: "UNKNOWN_9",
    10: "UNKNOWN_10",
    11: "UNKNOWN_11",
    12: "UNKNOWN_12",
    13: "DDP",
    14: "UNKNOWN_14",
    15: "UNKNOWN_15",
    16: "UNKNOWN_16",
    17: "UNKNOWN_17",
    18: "UNKNOWN_18",
    19: "UNKNOWN_19",
    20: "UNKNOWN_20",
    21: "UNKNOWN_21",
    22: "UNKNOWN_22",
    23: "UNKNOWN_23",
    24: "UNKNOWN_24",
    25: "UNKNOWN_25",
    26: "UNKNOWN_26",
    27: "UNKNOWN_27",
    28: "UNKNOWN_28",
    29: "UNKNOWN_29",
    30: "UNKNOWN_30",
    31: "UNKNOWN_31",
}

SOCKET_NAMES = {
    0: "RTMP",
    1: "NIS",
    2: "Echo",
    4: "ZIP",
    6: "ADSP",
    72: "PPC",
    254: "Any",
}

SHORT_DDP_HEADER_LEN = 5
EXTENDED_DDP_HEADER_LEN = 13
ETHERTYPE_APPLETALK = 0x809B
ETHERTYPE_AARP = 0x80F3

AARP_OPCODES = {
    1: "Request",
    2: "Response",
    3: "Probe",
}

AARP_HARDWARE_TYPES = {
    1: "Ethernet",
    2: "Token Ring",
}

AARP_PROTOCOL_TYPES = {
    1: "AppleTalk",
}

NBP_FUNCTIONS = {
    1: "BRRq",
    2: "LkUp",
    3: "LkUp-Reply",
    4: "FwdRq",
    5: "FwdRq-Reply",
}

NBP_DEVICE_TYPES = {
    "LaserWriter": "激光打印机",
    "Macintosh": "Mac 电脑",
    "AppleShare": "文件服务器",
    "AFPServer": "AppleTalk 文件服务器",
    "FastTalk": "通信服务",
    "PowerTalk": "邮件服务",
    "AppleShareIP": "IP 服务器",
    "LaserWriter 8": "激光打印机 v8",
    "Desktop Printer": "桌面打印机",
    "Personal LaserWriter": "个人激光打印机",
    "Color StyleWriter": "彩色喷墨打印机",
    "StyleWriter": "喷墨打印机",
    "ImageWriter": "点阵打印机",
}


def _protocol_name(proto_type):
    return DDP_PROTOCOL_TYPES.get(proto_type, f"UNKNOWN_{proto_type}")


def _socket_name(socket_num):
    return SOCKET_NAMES.get(socket_num, str(socket_num))


def parse_ddp_header(raw_bytes):
    if not raw_bytes or len(raw_bytes) < SHORT_DDP_HEADER_LEN:
        return None

    first_byte = raw_bytes[0]
    is_extended = bool(first_byte & 0x80) and not (first_byte & 0x40)

    if not is_extended:
        return _parse_short_ddp(raw_bytes)
    return _parse_extended_ddp(raw_bytes)


def _parse_short_ddp(data):
    if len(data) < SHORT_DDP_HEADER_LEN:
        return None

    length = data[0] & 0x3F
    proto_type = data[1]
    dst_socket = data[2]
    src_socket = data[3]
    node_id = data[4]

    return {
        "format": "short",
        "length": length,
        "protocol_type": proto_type,
        "protocol_name": _protocol_name(proto_type),
        "dst_net": 0,
        "src_net": 0,
        "dst_node": node_id,
        "src_node": node_id,
        "dst_socket": dst_socket,
        "src_socket": src_socket,
        "dst_socket_name": _socket_name(dst_socket),
        "src_socket_name": _socket_name(src_socket),
        "hop_count": 0,
        "payload_offset": SHORT_DDP_HEADER_LEN,
    }


def _parse_extended_ddp(data):
    if len(data) < EXTENDED_DDP_HEADER_LEN:
        return None

    hop_count = data[0] & 0x1F
    datagram_length = struct.unpack("!H", data[0:2])[0] & 0x3FF
    dst_net = struct.unpack("!H", data[4:6])[0]
    src_net = struct.unpack("!H", data[6:8])[0]
    dst_node = data[8]
    src_node = data[9]
    dst_socket = data[10]
    src_socket = data[11]
    proto_type = data[12]

    return {
        "format": "extended",
        "hop_count": hop_count,
        "datagram_length": datagram_length,
        "checksum": 0,
        "dst_net": dst_net,
        "src_net": src_net,
        "dst_node": dst_node,
        "src_node": src_node,
        "dst_socket": dst_socket,
        "src_socket": src_socket,
        "dst_socket_name": _socket_name(dst_socket),
        "src_socket_name": _socket_name(src_socket),
        "protocol_type": proto_type,
        "protocol_name": _protocol_name(proto_type),
        "payload_offset": EXTENDED_DDP_HEADER_LEN,
    }


def parse_rtmp_tuples(payload):
    routes = []
    offset = 0

    if not payload or len(payload) < 3:
        return routes

    while offset + 3 <= len(payload):
        network_number = struct.unpack("!H", payload[offset:offset + 2])[0]
        offset += 2

        if offset >= len(payload):
            break

        distance_byte = payload[offset]
        offset += 1

        hop_count = (distance_byte & 0x0F) + 1

        if network_number == 0:
            continue

        routes.append({
            "network": network_number,
            "hop_count": hop_count,
        })

        if distance_byte & 0x80:
            if offset + 2 <= len(payload):
                _range_end = struct.unpack("!H", payload[offset:offset + 2])[0]
                offset += 2

    return routes


def build_packet_entry(ddp_info, raw_payload, packet_length):
    if ddp_info is None:
        return None

    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "format": ddp_info["format"],
        "src_net": ddp_info["src_net"],
        "src_node": ddp_info["src_node"],
        "src_socket": ddp_info["src_socket"],
        "src_socket_name": ddp_info.get("src_socket_name", ""),
        "dst_net": ddp_info["dst_net"],
        "dst_node": ddp_info["dst_node"],
        "dst_socket": ddp_info["dst_socket"],
        "dst_socket_name": ddp_info.get("dst_socket_name", ""),
        "protocol_type": ddp_info["protocol_type"],
        "protocol_name": ddp_info["protocol_name"],
        "hop_count": ddp_info.get("hop_count", 0),
        "length": packet_length,
    }

    if ddp_info["protocol_type"] == 1 and raw_payload:
        rtmp_routes = parse_rtmp_tuples(raw_payload)
        if rtmp_routes:
            entry["rtmp_routes"] = rtmp_routes

    if ddp_info["protocol_type"] == 2 and raw_payload:
        nbp_info = parse_nbp_packet(raw_payload)
        if nbp_info:
            entry["nbp_info"] = nbp_info

    return entry


def _format_mac(mac_bytes):
    return ":".join(f"{b:02x}" for b in mac_bytes)


def parse_aarp_packet(raw_bytes):
    if not raw_bytes or len(raw_bytes) < 8:
        return None

    hw_type = struct.unpack("!H", raw_bytes[0:2])[0]
    proto_type = struct.unpack("!H", raw_bytes[2:4])[0]
    hw_addr_len = raw_bytes[4]
    proto_addr_len = raw_bytes[5]
    opcode = struct.unpack("!H", raw_bytes[6:8])[0]

    expected_len = 8 + 2 * hw_addr_len + 2 * proto_addr_len
    if len(raw_bytes) < expected_len:
        return None

    offset = 8
    src_hw = raw_bytes[offset:offset + hw_addr_len]
    offset += hw_addr_len

    src_proto = raw_bytes[offset:offset + proto_addr_len]
    offset += proto_addr_len

    dst_hw = raw_bytes[offset:offset + hw_addr_len] if offset + hw_addr_len <= len(raw_bytes) else b""
    offset += hw_addr_len

    dst_proto = raw_bytes[offset:offset + proto_addr_len] if offset + proto_addr_len <= len(raw_bytes) else b""

    result = {
        "hardware_type": hw_type,
        "hardware_type_name": AARP_HARDWARE_TYPES.get(hw_type, f"Unknown({hw_type})"),
        "protocol_type": proto_type,
        "protocol_type_name": AARP_PROTOCOL_TYPES.get(proto_type, f"Unknown({proto_type})"),
        "hardware_addr_len": hw_addr_len,
        "protocol_addr_len": proto_addr_len,
        "opcode": opcode,
        "opcode_name": AARP_OPCODES.get(opcode, f"Unknown({opcode})"),
    }

    if hw_addr_len == 6:
        result["src_mac"] = _format_mac(src_hw)
        if dst_hw:
            result["dst_mac"] = _format_mac(dst_hw)
        else:
            result["dst_mac"] = "ff:ff:ff:ff:ff:ff"

    if proto_addr_len >= 3:
        src_net = struct.unpack("!H", src_proto[0:2])[0]
        src_node = src_proto[2]
        result["src_atalk_net"] = src_net
        result["src_atalk_node"] = src_node
        result["src_atalk_addr"] = f"{src_net}.{src_node}"

        if len(dst_proto) >= 3:
            dst_net = struct.unpack("!H", dst_proto[0:2])[0]
            dst_node = dst_proto[2]
            result["dst_atalk_net"] = dst_net
            result["dst_atalk_node"] = dst_node
            result["dst_atalk_addr"] = f"{dst_net}.{dst_node}"

    return result


def _parse_pascal_string(data, offset):
    if offset >= len(data):
        return None, offset
    length = data[offset]
    offset += 1
    if length == 0:
        return "", offset
    if offset + length > len(data):
        return None, offset
    try:
        s = data[offset:offset + length].decode("mac_roman")
    except UnicodeDecodeError:
        s = data[offset:offset + length].hex()
    return s, offset + length


def parse_nbp_packet(payload):
    if not payload or len(payload) < 3:
        return None

    control_byte = payload[0]
    function_code = (control_byte >> 6) & 0x03
    tuple_count = control_byte & 0x3F

    if function_code + 1 not in NBP_FUNCTIONS:
        return None

    nbp_id = struct.unpack("!H", payload[1:3])[0]
    offset = 3

    entries = []
    for _ in range(min(tuple_count, 16)):
        if offset + 5 > len(payload):
            break

        enumerator = payload[offset]
        offset += 1

        atalk_net = struct.unpack("!H", payload[offset:offset + 2])[0]
        atalk_node = payload[offset + 2]
        offset += 3

        atalk_socket = payload[offset]
        offset += 1

        object_name, offset = _parse_pascal_string(payload, offset)
        if object_name is None:
            break

        type_name, offset = _parse_pascal_string(payload, offset)
        if type_name is None:
            break

        zone_name, offset = _parse_pascal_string(payload, offset)
        if zone_name is None:
            zone_name = "*"

        full_name = f"{object_name}:{type_name}@{zone_name}"
        device_type_cn = NBP_DEVICE_TYPES.get(type_name, type_name)

        entries.append({
            "enumerator": enumerator,
            "atalk_net": atalk_net,
            "atalk_node": atalk_node,
            "atalk_socket": atalk_socket,
            "atalk_addr": f"{atalk_net}.{atalk_node}",
            "object_name": object_name,
            "type_name": type_name,
            "zone_name": zone_name,
            "full_name": full_name,
            "device_type_cn": device_type_cn,
        })

    if not entries:
        return None

    return {
        "function": function_code + 1,
        "function_name": NBP_FUNCTIONS[function_code + 1],
        "nbp_id": nbp_id,
        "tuple_count": tuple_count,
        "entries": entries,
    }
