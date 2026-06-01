from dataclasses import dataclass, field
from typing import Optional, Any
from enum import IntEnum


class ROSCTR(IntEnum):
    JOB_REQUEST = 1
    ACK_DATA = 2
    ACK_ALARM = 3
    USER_DATA = 7


class FunctionCode(IntEnum):
    SETUP_COMMUNICATION = 0xF0
    READ_VAR = 0x04
    WRITE_VAR = 0x05
    START = 0x28
    STOP = 0x29
    START_DOWNLOAD = 0x1A
    DOWNLOAD = 0x1B
    DOWNLOAD_ENDED = 0x1C
    START_UPLOAD = 0x1D
    UPLOAD = 0x1E
    END_UPLOAD = 0x1F
    DELETE_BLOCK = 0x2A
    PLC_STATUS = 0x04
    LIST_BLOCK_TYPES = 0x01
    LIST_BLOCKS = 0x02
    READ_SZL = 0x01


class AreaType(IntEnum):
    PE = 0x81
    PA = 0x82
    MK = 0x83
    DB = 0x84
    CT = 0x1C
    TM = 0x1D


class TransportSize(IntEnum):
    BIT = 0x01
    BYTE = 0x02
    CHAR = 0x03
    WORD = 0x04
    INT = 0x05
    DWORD = 0x06
    DINT = 0x07
    REAL = 0x08
    COUNTER = 0x1C
    TIMER = 0x1D


AREA_TYPE_NAMES = {
    0x81: "PE (Input)",
    0x82: "PA (Output)",
    0x83: "MK (Marker)",
    0x84: "DB (Data Block)",
    0x1C: "CT (Counter)",
    0x1D: "TM (Timer)",
}

TRANSPORT_SIZE_NAMES = {
    0x01: "BIT",
    0x02: "BYTE",
    0x03: "CHAR",
    0x04: "WORD",
    0x05: "INT",
    0x06: "DWORD",
    0x07: "DINT",
    0x08: "REAL",
    0x1C: "COUNTER",
    0x1D: "TIMER",
}

ROSCTR_NAMES = {
    1: "Job Request",
    2: "Ack Data",
    3: "Ack Alarm",
    7: "User Data",
}

FUNCTION_CODE_NAMES = {
    0xF0: "Setup Communication",
    0x04: "Read Variable",
    0x05: "Write Variable",
    0x28: "Start PLC",
    0x29: "Stop PLC",
    0x1A: "Start Download",
    0x1B: "Download",
    0x1C: "Download Ended",
    0x1D: "Start Upload",
    0x1E: "Upload",
    0x1F: "End Upload",
    0x2A: "Delete Block",
}

COTP_PDU_TYPE_NAMES = {
    0xE0: "Connection Request (CR)",
    0xD0: "Connection Confirm (CC)",
    0x80: "Disconnect Request (DR)",
    0xC0: "Disconnect Confirm (DC)",
    0xF0: "Data (DT)",
    0x50: "Expedited Data (ED)",
    0x70: "Expedited Data Acknowledge (EA)",
}


@dataclass
class TPKTHeader:
    version: int
    reserved: int
    length: int
    offset: int = 0
    header_length: int = 4
    raw_bytes: str = ""


@dataclass
class COTPHeader:
    length: int
    pdu_type: int
    pdu_type_name: str = ""
    dst_ref: int = 0
    src_ref: int = 0
    class_option: int = 0
    offset: int = 0
    header_length: int = 0
    raw_bytes: str = ""
    params: dict = field(default_factory=dict)


@dataclass
class S7CommHeader:
    protocol_id: int
    msg_type: int
    reserved: int
    pdu_ref: int
    param_length: int
    data_length: int
    function_code: int
    msg_type_name: str = ""
    function_code_name: str = ""
    offset: int = 0
    header_length: int = 10
    raw_bytes: str = ""


@dataclass
class ReadItem:
    area: int
    type: int
    db_number: int
    offset: int
    length: int
    area_name: str = ""
    type_name: str = ""
    bit_offset: int = 0


@dataclass
class WriteItem:
    area: int
    type: int
    db_number: int
    offset: int
    length: int
    area_name: str = ""
    type_name: str = ""
    bit_offset: int = 0
    data: bytes = b""
    data_hex: str = ""


@dataclass
class S7CommParameters:
    setup_comm: Optional[dict] = None
    read_items: list = field(default_factory=list)
    write_items: list = field(default_factory=list)
    raw_bytes: str = ""


@dataclass
class S7CommData:
    items: list = field(default_factory=list)
    raw_bytes: str = ""
    error_code: int = 0
    error_name: str = ""


@dataclass
class ParseResult:
    tpkt: Optional[TPKTHeader] = None
    cotp: Optional[COTPHeader] = None
    s7comm: Optional[S7CommHeader] = None
    parameters: Optional[S7CommParameters] = None
    data: Optional[S7CommData] = None
    total_length: int = 0
    protocol_headers_length: int = 0
    iso_tsap_header_length: int = 0
    s7_header_length: int = 0
    raw_hex: str = ""
    error: Optional[str] = None


S7_ERROR_CODES = {
    0x00: "No error",
    0x01: "Hardware error",
    0x03: "Accessing the object not allowed",
    0x05: "Invalid address",
    0x06: "Data type not supported",
    0x07: "Data type inconsistent",
    0x0A: "Object does not exist",
    0x01FF: "Multiple errors",
    0x0510: "Item not available",
    0x6102: "Syntax error",
    0x8104: "Operation not permitted on DB",
    0x8204: "DB is read-only",
    0x8304: "DB is write-protected",
    0x8404: "DB does not exist",
    0x8504: "Access error",
}


def hex_to_bytes(hex_str: str) -> bytes:
    cleaned = hex_str.replace(" ", "").replace("0x", "").replace("\n", "").replace("\r", "")
    if len(cleaned) % 2 != 0:
        cleaned = "0" + cleaned
    return bytes.fromhex(cleaned)


def bytes_to_hex_display(data: bytes) -> str:
    return " ".join(f"{b:02x}" for b in data)


def parse_tpkt(data: bytes, offset: int = 0) -> Optional[TPKTHeader]:
    if len(data) < offset + 4:
        return None
    version = data[offset]
    reserved = data[offset + 1]
    length = (data[offset + 2] << 8) | data[offset + 3]
    if version != 3:
        return None
    return TPKTHeader(
        version=version,
        reserved=reserved,
        length=length,
        offset=offset,
        raw_bytes=bytes_to_hex_display(data[offset:offset + 4]),
    )


def parse_cotp(data: bytes, offset: int = 0) -> Optional[COTPHeader]:
    if len(data) < offset + 1:
        return None
    length = data[offset]
    if len(data) < offset + 1 + length:
        return None
    pdu_type = data[offset + 1]
    pdu_type_name = COTP_PDU_TYPE_NAMES.get(pdu_type, f"Unknown (0x{pdu_type:02x})")

    result = COTPHeader(
        length=length,
        pdu_type=pdu_type,
        pdu_type_name=pdu_type_name,
        offset=offset,
        header_length=1 + length,
        raw_bytes=bytes_to_hex_display(data[offset:offset + 1 + length]),
    )

    if pdu_type == 0xE0:
        if len(data) >= offset + 7:
            result.dst_ref = (data[offset + 2] << 8) | data[offset + 3]
            result.src_ref = (data[offset + 4] << 8) | data[offset + 5]
            result.class_option = data[offset + 6]
            result.params = {
                "dst_ref": result.dst_ref,
                "src_ref": result.src_ref,
                "class_option": result.class_option,
            }
            if length > 6 and len(data) >= offset + 1 + length:
                param_start = offset + 7
                param_data = data[param_start:offset + 1 + length]
                parsed_params = []
                i = 0
                while i < len(param_data):
                    param_code = param_data[i]
                    if i + 1 < len(param_data):
                        param_len = param_data[i + 1]
                        param_val = param_data[i + 2:i + 2 + param_len] if i + 2 + param_len <= len(param_data) else b""
                        parsed_params.append({
                            "code": f"0x{param_code:02x}",
                            "length": param_len,
                            "value": bytes_to_hex_display(param_val) if param_val else "",
                        })
                        i += 2 + param_len
                    else:
                        break
                result.params["tpdu_params"] = parsed_params
    elif pdu_type == 0xD0:
        if len(data) >= offset + 7:
            result.dst_ref = (data[offset + 2] << 8) | data[offset + 3]
            result.src_ref = (data[offset + 4] << 8) | data[offset + 5]
            result.class_option = data[offset + 6]
            result.params = {
                "dst_ref": result.dst_ref,
                "src_ref": result.src_ref,
                "class_option": result.class_option,
            }
    elif pdu_type == 0xF0:
        if len(data) >= offset + 2:
            result.params = {
                "tpdu_number": data[offset + 2] & 0x7F,
                "last_data_unit": bool(data[offset + 2] & 0x80),
            }

    return result


def parse_s7comm_header(data: bytes, offset: int = 0) -> Optional[S7CommHeader]:
    if len(data) < offset + 10:
        return None
    protocol_id = data[offset]
    msg_type = data[offset + 1]
    reserved = (data[offset + 2] << 8) | data[offset + 3]
    pdu_ref = (data[offset + 4] << 8) | data[offset + 5]
    param_length = (data[offset + 6] << 8) | data[offset + 7]
    data_length = (data[offset + 8] << 8) | data[offset + 9]
    function_code = data[offset + 10] if len(data) > offset + 10 and param_length > 0 else 0

    msg_type_name = ROSCTR_NAMES.get(msg_type, f"Unknown (0x{msg_type:02x})")
    function_code_name = FUNCTION_CODE_NAMES.get(function_code, f"Unknown (0x{function_code:02x})")

    return S7CommHeader(
        protocol_id=protocol_id,
        msg_type=msg_type,
        msg_type_name=msg_type_name,
        reserved=reserved,
        pdu_ref=pdu_ref,
        param_length=param_length,
        data_length=data_length,
        function_code=function_code,
        function_code_name=function_code_name,
        offset=offset,
        raw_bytes=bytes_to_hex_display(data[offset:offset + 10]),
    )


def parse_read_parameters(data: bytes, offset: int, length: int) -> list:
    items = []
    if len(data) < offset + 1:
        return items
    item_count = data[offset]
    pos = offset + 1

    for _ in range(item_count):
        if len(data) < pos + 2:
            break
        item_spec = data[pos]
        spec_length = data[pos + 1]
        item_total = 2 + spec_length
        if len(data) < pos + item_total:
            break
        if item_spec != 0x12:
            pos += item_total
            continue
        syntax_id = data[pos + 2]
        transport_size = data[pos + 3]
        length_val = (data[pos + 4] << 8) | data[pos + 5]
        db_number = (data[pos + 6] << 8) | data[pos + 7]
        area = data[pos + 8]
        area_offset = (data[pos + 9] << 16) | (data[pos + 10] << 8) | data[pos + 11]
        bit_offset = area_offset & 0x07
        byte_offset = area_offset >> 3

        items.append(ReadItem(
            area=area,
            area_name=AREA_TYPE_NAMES.get(area, f"Unknown (0x{area:02x})"),
            type=transport_size,
            type_name=TRANSPORT_SIZE_NAMES.get(transport_size, f"Unknown (0x{transport_size:02x})"),
            db_number=db_number,
            offset=byte_offset,
            bit_offset=bit_offset,
            length=length_val,
        ))
        pos += item_total

    return items


def parse_write_parameters(data: bytes, offset: int, length: int) -> list:
    items = []
    if len(data) < offset + 1:
        return items
    item_count = data[offset]
    pos = offset + 1

    for _ in range(item_count):
        if len(data) < pos + 2:
            break
        item_spec = data[pos]
        spec_length = data[pos + 1]
        item_total = 2 + spec_length
        if len(data) < pos + item_total:
            break
        if item_spec != 0x12:
            pos += item_total
            continue
        syntax_id = data[pos + 2]
        transport_size = data[pos + 3]
        length_val = (data[pos + 4] << 8) | data[pos + 5]
        db_number = (data[pos + 6] << 8) | data[pos + 7]
        area = data[pos + 8]
        area_offset = (data[pos + 9] << 16) | (data[pos + 10] << 8) | data[pos + 11]
        bit_offset = area_offset & 0x07
        byte_offset = area_offset >> 3

        items.append(WriteItem(
            area=area,
            area_name=AREA_TYPE_NAMES.get(area, f"Unknown (0x{area:02x})"),
            type=transport_size,
            type_name=TRANSPORT_SIZE_NAMES.get(transport_size, f"Unknown (0x{transport_size:02x})"),
            db_number=db_number,
            offset=byte_offset,
            bit_offset=bit_offset,
            length=length_val,
            data=b"",
            data_hex="",
        ))
        pos += item_total

    return items


def parse_setup_comm_parameters(data: bytes, offset: int, length: int) -> Optional[dict]:
    if len(data) < offset + 8:
        return None
    reserved = data[offset]
    max_amq_calling = (data[offset + 1] << 8) | data[offset + 2]
    max_amq_called = (data[offset + 3] << 8) | data[offset + 4]
    pdu_size = (data[offset + 5] << 8) | data[offset + 6]

    return {
        "reserved": reserved,
        "max_amq_calling": max_amq_calling,
        "max_amq_called": max_amq_called,
        "pdu_size": pdu_size,
    }


def parse_data_item(data: bytes, pos: int, index: int) -> tuple[Optional[dict], int]:
    if len(data) < pos + 4:
        return None, pos

    return_code = data[pos]
    transport_size = data[pos + 1]
    data_length_bits = (data[pos + 2] << 8) | data[pos + 3]
    data_length_bytes = (data_length_bits + 7) // 8
    item_data = data[pos + 4:pos + 4 + data_length_bytes] if len(data) >= pos + 4 + data_length_bytes else b""

    item = {
        "index": index,
        "return_code": return_code,
        "return_code_name": "Success" if return_code == 0xFF else f"Error (0x{return_code:02x})",
        "transport_size": transport_size,
        "transport_size_name": TRANSPORT_SIZE_NAMES.get(transport_size, f"Unknown (0x{transport_size:02x})"),
        "data_length": data_length_bytes,
        "data_length_bits": data_length_bits,
        "data": bytes_to_hex_display(item_data),
        "data_values": list(item_data),
    }

    next_pos = pos + 4 + data_length_bytes
    if data_length_bytes % 2 != 0:
        next_pos += 1

    return item, next_pos


def parse_write_data_item(data: bytes, pos: int, index: int) -> tuple[Optional[dict], int]:
    if len(data) < pos + 4:
        return None, pos

    return_code = data[pos]
    transport_size = data[pos + 1]
    data_length_bits = (data[pos + 2] << 8) | data[pos + 3]
    data_length_bytes = (data_length_bits + 7) // 8
    item_data = data[pos + 4:pos + 4 + data_length_bytes] if len(data) >= pos + 4 + data_length_bytes else b""

    if return_code == 0x00:
        return_code_name = "Write Request"
    elif return_code == 0xFF:
        return_code_name = "Success"
    else:
        return_code_name = f"Error (0x{return_code:02x})"

    item = {
        "index": index,
        "return_code": return_code,
        "return_code_name": return_code_name,
        "transport_size": transport_size,
        "transport_size_name": TRANSPORT_SIZE_NAMES.get(transport_size, f"Unknown (0x{transport_size:02x})"),
        "data_length": data_length_bytes,
        "data_length_bits": data_length_bits,
        "data": bytes_to_hex_display(item_data),
        "data_values": list(item_data),
        "raw_bytes": bytes_to_hex_display(data[pos:pos + 4 + data_length_bytes]),
    }

    next_pos = pos + 4 + data_length_bytes
    if data_length_bytes % 2 != 0:
        next_pos += 1

    return item, next_pos


def parse_s7comm_data(data: bytes, offset: int, length: int, function_code: int, msg_type: int, write_items: Optional[list] = None) -> S7CommData:
    result = S7CommData()

    if length == 0 or len(data) < offset:
        return result

    result.raw_bytes = bytes_to_hex_display(data[offset:offset + length])

    if msg_type == ROSCTR.ACK_DATA and function_code in (FunctionCode.READ_VAR, FunctionCode.WRITE_VAR):
        if len(data) < offset + 1:
            return result
        result.error_code = data[offset]
        error_key = result.error_code
        if error_key in S7_ERROR_CODES:
            result.error_name = S7_ERROR_CODES[error_key]
        else:
            error_key_full = (result.error_code << 8) | (data[offset + 1] if len(data) > offset + 1 else 0)
            result.error_name = S7_ERROR_CODES.get(error_key_full, f"Unknown (0x{result.error_code:02x})")

    if msg_type == ROSCTR.ACK_DATA and function_code == FunctionCode.READ_VAR:
        if len(data) < offset + 2:
            return result
        item_count = data[offset + 1]
        pos = offset + 2

        for i in range(item_count):
            item, pos = parse_data_item(data, pos, i)
            if item is None:
                break
            result.items.append(item)

    elif msg_type == ROSCTR.ACK_DATA and function_code == FunctionCode.WRITE_VAR:
        if len(data) < offset + 2 or length < 2:
            return result
        item_count = data[offset + 1]
        pos = offset + 2

        for i in range(item_count):
            if len(data) < pos + 1 or pos >= offset + length:
                break
            return_code = data[pos]
            result.items.append({
                "index": i,
                "return_code": return_code,
                "return_code_name": "Success" if return_code == 0xFF else f"Error (0x{return_code:02x})",
            })
            pos += 1

    elif msg_type == ROSCTR.JOB_REQUEST and function_code == FunctionCode.WRITE_VAR:
        if len(data) < offset + 1:
            return result

        pos = offset
        item_index = 0

        while pos < offset + length:
            remaining = offset + length - pos
            if remaining < 4:
                break

            item, pos = parse_write_data_item(data, pos, item_index)
            if item is None:
                break
            result.items.append(item)

            if write_items is not None and item_index < len(write_items):
                write_item = write_items[item_index]
                write_item.data = bytes(item["data_values"])
                write_item.data_hex = item["data"]

            item_index += 1

    return result


def parse_s7comm(hex_str: str, include_tpkt: bool = True) -> ParseResult:
    try:
        data = hex_to_bytes(hex_str)
    except ValueError as e:
        return ParseResult(error=f"Invalid hex string: {str(e)}", raw_hex=hex_str)

    result = ParseResult(total_length=len(data), raw_hex=bytes_to_hex_display(data))

    if len(data) == 0:
        result.error = "Empty data"
        return result

    offset = 0

    if include_tpkt:
        tpkt = parse_tpkt(data, offset)
        if tpkt is None:
            include_tpkt = False
        else:
            result.tpkt = tpkt
            offset += 4

    if include_tpkt:
        cotp = parse_cotp(data, offset)
        if cotp is not None:
            result.cotp = cotp
            offset += 1 + cotp.length
        else:
            result.error = "Failed to parse COTP header"
            return result

    s7comm = parse_s7comm_header(data, offset)
    if s7comm is None:
        result.error = "Failed to parse S7comm header"
        return result
    result.s7comm = s7comm

    iso_tsap_len = 0
    if result.tpkt is not None:
        iso_tsap_len += result.tpkt.header_length
    if result.cotp is not None:
        iso_tsap_len += result.cotp.header_length

    result.iso_tsap_header_length = iso_tsap_len
    result.s7_header_length = s7comm.header_length
    result.protocol_headers_length = iso_tsap_len + s7comm.header_length

    param_offset = offset + 10
    param_length = s7comm.param_length
    data_offset = param_offset + param_length
    data_length = s7comm.data_length

    params = S7CommParameters()
    if param_length > 0:
        params.raw_bytes = bytes_to_hex_display(data[param_offset:param_offset + param_length])

        fc = s7comm.function_code
        param_data_offset = param_offset + 1
        param_data_length = param_length - 1

        if fc == FunctionCode.SETUP_COMMUNICATION:
            params.setup_comm = parse_setup_comm_parameters(data, param_data_offset, param_data_length)
        elif fc == FunctionCode.READ_VAR:
            params.read_items = parse_read_parameters(data, param_data_offset, param_data_length)
        elif fc == FunctionCode.WRITE_VAR:
            params.write_items = parse_write_parameters(data, param_data_offset, param_data_length)

    result.parameters = params

    if data_length > 0 and data_offset + data_length <= len(data):
        result.data = parse_s7comm_data(
            data, data_offset, data_length,
            s7comm.function_code, s7comm.msg_type,
            write_items=params.write_items if params.write_items else None
        )
    else:
        result.data = S7CommData()

    return result


def build_s7comm_read_packet(
    db_number: int = 1,
    area: int = 0x84,
    offset: int = 0,
    transport_size: int = 0x02,
    length: int = 1,
) -> bytes:
    cotp = bytes([0x02, 0xF0, 0x80])

    param_bytes = bytes([
        0x04,
        0x01,
        0x12,
        0x0A,
        0x10,
        transport_size,
        (length >> 8) & 0xFF, length & 0xFF,
        (db_number >> 8) & 0xFF, db_number & 0xFF,
        area,
        (offset >> 16) & 0xFF, (offset >> 8) & 0xFF, offset & 0xFF,
    ])
    param_length = len(param_bytes)

    s7_header = bytes([
        0x32,
        0x01,
        0x00, 0x00,
        0x00, 0x01,
        (param_length >> 8) & 0xFF, param_length & 0xFF,
        0x00, 0x00,
    ])

    payload = cotp + s7_header + param_bytes
    total_length = 4 + len(payload)
    tpkt = bytes([0x03, 0x00, (total_length >> 8) & 0xFF, total_length & 0xFF])

    return tpkt + payload


def build_s7comm_write_packet(
    db_number: int = 1,
    area: int = 0x84,
    offset: int = 0,
    transport_size: int = 0x02,
    length: int = 1,
    write_data: bytes = b"\x00",
) -> bytes:
    cotp = bytes([0x02, 0xF0, 0x80])

    param_bytes = bytes([
        0x05,
        0x01,
        0x12,
        0x0A,
        0x10,
        transport_size,
        (length >> 8) & 0xFF, length & 0xFF,
        (db_number >> 8) & 0xFF, db_number & 0xFF,
        area,
        (offset >> 16) & 0xFF, (offset >> 8) & 0xFF, offset & 0xFF,
    ])
    param_length = len(param_bytes)

    data_item_header = bytes([
        0x00,
        transport_size,
        ((length * 8) >> 8) & 0xFF, (length * 8) & 0xFF,
    ])
    padded_data = write_data
    if len(padded_data) % 2 != 0:
        padded_data += b"\x00"
    data_section = data_item_header + padded_data
    data_length = len(data_section)

    s7_header = bytes([
        0x32,
        0x01,
        0x00, 0x00,
        0x00, 0x01,
        (param_length >> 8) & 0xFF, param_length & 0xFF,
        (data_length >> 8) & 0xFF, data_length & 0xFF,
    ])

    payload = cotp + s7_header + param_bytes + data_section
    total_length = 4 + len(payload)
    tpkt = bytes([0x03, 0x00, (total_length >> 8) & 0xFF, total_length & 0xFF])

    return tpkt + payload


def build_s7comm_setup_packet() -> bytes:
    cotp_cr = bytes([
        0x11,
        0xE0,
        0x00, 0x00,
        0x00, 0x01,
        0x00,
        0xC1, 0x02, 0x01, 0x00,
        0xC2, 0x02, 0x01, 0x02,
        0xC0, 0x01, 0x09,
    ])
    tpkt = bytes([0x03, 0x00, 0x00, 0x00])
    total_length = 4 + len(cotp_cr)
    tpkt = bytes([0x03, 0x00, (total_length >> 8) & 0xFF, total_length & 0xFF])

    return tpkt + cotp_cr


def build_s7comm_setup_comm_packet() -> bytes:
    cotp = bytes([0x02, 0xF0, 0x80])

    param_bytes = bytes([
        0xF0,
        0x00,
        0x00, 0x01,
        0x00, 0x01,
        0x03, 0xC0,
    ])
    param_length = len(param_bytes)

    s7_header = bytes([
        0x32,
        0x01,
        0x00, 0x00,
        0x00, 0x01,
        (param_length >> 8) & 0xFF, param_length & 0xFF,
        0x00, 0x00,
    ])

    payload = cotp + s7_header + param_bytes
    total_length = 4 + len(payload)
    tpkt = bytes([0x03, 0x00, (total_length >> 8) & 0xFF, total_length & 0xFF])

    return tpkt + payload
