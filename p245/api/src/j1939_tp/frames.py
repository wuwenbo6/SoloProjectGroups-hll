"""J1939 TP协议帧构造与解析工具"""

from .constants import (
    PGN_TP_CM, PGN_TP_DT,
    CTRL_BAM, CTRL_RTS, CTRL_CTS, CTRL_ACK, CTRL_ABORT,
    GLOBAL_ADDRESS, DT_DATA_SIZE
)


def build_bam_announce(message_size: int, num_packets: int, pgn: int) -> bytearray:
    """
    构建BAM公告帧
    Byte 0: Control Byte = 16 (BAM)
    Byte 1-2: Total Message Size (little-endian)
    Byte 3: Total Number of Packets
    Byte 4: Reserved (0xFF)
    Byte 5-7: PGN (little-endian, 3 bytes)
    """
    data = bytearray(8)
    data[0] = CTRL_BAM
    data[1] = message_size & 0xFF
    data[2] = (message_size >> 8) & 0xFF
    data[3] = num_packets & 0xFF
    data[4] = 0xFF  # Reserved
    data[5] = pgn & 0xFF
    data[6] = (pgn >> 8) & 0xFF
    data[7] = (pgn >> 16) & 0xFF
    return data


def build_rts(message_size: int, num_packets: int, window_size: int, pgn: int) -> bytearray:
    """
    构建RTS帧（Request To Send）
    Byte 0: Control Byte = 16 (RTS)
    Byte 1-2: Total Message Size (little-endian)
    Byte 3: Total Number of Packets
    Byte 4: Number of Packets That Can Be Sent
    Byte 5-7: PGN (little-endian, 3 bytes)
    """
    data = bytearray(8)
    data[0] = CTRL_RTS
    data[1] = message_size & 0xFF
    data[2] = (message_size >> 8) & 0xFF
    data[3] = num_packets & 0xFF
    data[4] = window_size & 0xFF
    data[5] = pgn & 0xFF
    data[6] = (pgn >> 8) & 0xFF
    data[7] = (pgn >> 16) & 0xFF
    return data


def build_cts(num_packets: int, next_seq: int, pgn: int) -> bytearray:
    """
    构建CTS帧（Clear To Send）
    Byte 0: Control Byte = 17 (CTS)
    Byte 1: Number of Packets Allowed To Send
    Byte 2: Next Packet To Be Sent (sequence number)
    Byte 3-4: Reserved (0xFF)
    Byte 5-7: PGN (little-endian, 3 bytes)
    """
    data = bytearray(8)
    data[0] = CTRL_CTS
    data[1] = num_packets & 0xFF
    data[2] = next_seq & 0xFF
    data[3] = 0xFF
    data[4] = 0xFF
    data[5] = pgn & 0xFF
    data[6] = (pgn >> 8) & 0xFF
    data[7] = (pgn >> 16) & 0xFF
    return data


def build_eom_ack(message_size: int, num_packets: int, pgn: int) -> bytearray:
    """
    构建EndOfMsgAck帧
    Byte 0: Control Byte = 19 (Ack)
    Byte 1-2: Total Message Size (little-endian)
    Byte 3: Total Number of Packets
    Byte 4: Reserved (0xFF)
    Byte 5-7: PGN (little-endian, 3 bytes)
    """
    data = bytearray(8)
    data[0] = CTRL_ACK
    data[1] = message_size & 0xFF
    data[2] = (message_size >> 8) & 0xFF
    data[3] = num_packets & 0xFF
    data[4] = 0xFF
    data[5] = pgn & 0xFF
    data[6] = (pgn >> 8) & 0xFF
    data[7] = (pgn >> 16) & 0xFF
    return data


def build_abort(reason: int, pgn: int) -> bytearray:
    """
    构建Abort帧
    Byte 0: Control Byte = 255 (Abort)
    Byte 1: Abort Reason
    Byte 2-4: Reserved (0xFF)
    Byte 5-7: PGN (little-endian, 3 bytes)
    """
    data = bytearray(8)
    data[0] = CTRL_ABORT
    data[1] = reason & 0xFF
    data[2] = 0xFF
    data[3] = 0xFF
    data[4] = 0xFF
    data[5] = pgn & 0xFF
    data[6] = (pgn >> 8) & 0xFF
    data[7] = (pgn >> 16) & 0xFF
    return data


def build_dt_frame(sequence: int, data_chunk: bytes) -> bytearray:
    """
    构建DT数据传输帧
    Byte 0: Sequence Number (1-255)
    Byte 1-7: Data (7 bytes, padded with 0xFF if less)
    """
    data = bytearray(8)
    data[0] = sequence & 0xFF
    chunk_len = min(len(data_chunk), DT_DATA_SIZE)
    data[1:1 + chunk_len] = data_chunk[:chunk_len]
    for i in range(1 + chunk_len, 8):
        data[i] = 0xFF  # Pad with 0xFF
    return data


def build_j1939_id(priority: int, pgn: int, source_address: int) -> int:
    """
    构建29位J1939扩展ID
    Bits 28-26: Priority (0-7)
    Bits 25-24: Reserved (EDP, DP)
    Bits 23-8:  PGN (16 bits for PDU Format, 8 bits for PDU Specific)
    Bits 7-0:   Source Address
    """
    priority = priority & 0x07
    pgn = pgn & 0x3FFFF
    source_address = source_address & 0xFF
    return (priority << 26) | (pgn << 8) | source_address


def extract_destination_from_pgn(pgn: int) -> int:
    """从PGN中提取目标地址（PDU1格式时）"""
    pdu_format = (pgn >> 8) & 0xFF
    if pdu_format < 240:  # PDU1: destination specific
        return pgn & 0xFF
    return GLOBAL_ADDRESS  # PDU2: group function / broadcast


def create_pgn(pdu_format: int, pdu_specific: int, dp: int = 0, edp: int = 0) -> int:
    """创建PGN"""
    pdu_format = pdu_format & 0xFF
    pdu_specific = pdu_specific & 0xFF
    dp = dp & 0x01
    edp = edp & 0x01
    return (edp << 17) | (dp << 16) | (pdu_format << 8) | pdu_specific


def parse_tp_cm(data: bytes) -> dict:
    """解析TP.CM帧"""
    if len(data) < 8:
        return {}
    control_byte = data[0]
    pgn = data[5] | (data[6] << 8) | (data[7] << 16)

    result = {
        "control_byte": control_byte,
        "pgn": pgn
    }

    if control_byte in (CTRL_BAM, CTRL_RTS):
        result["message_size"] = data[1] | (data[2] << 8)
        result["num_packets"] = data[3]
        if control_byte == CTRL_RTS:
            result["window_size"] = data[4]
    elif control_byte == CTRL_CTS:
        result["packets_allowed"] = data[1]
        result["next_sequence"] = data[2]
    elif control_byte == CTRL_ACK:
        result["message_size"] = data[1] | (data[2] << 8)
        result["num_packets"] = data[3]
    elif control_byte == CTRL_ABORT:
        result["abort_reason"] = data[1]

    return result


def parse_tp_dt(data: bytes) -> dict:
    """解析TP.DT帧"""
    if len(data) < 8:
        return {}
    return {
        "sequence": data[0],
        "payload": bytes(data[1:8])
    }


def split_message(message: bytes) -> list[bytes]:
    """
    将大消息拆分为7字节的块
    """
    chunks = []
    for i in range(0, len(message), DT_DATA_SIZE):
        chunk = message[i:i + DT_DATA_SIZE]
        chunks.append(chunk)
    return chunks
