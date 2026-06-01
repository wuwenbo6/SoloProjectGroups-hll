import re


def calculate_fix_checksum(raw_message: str) -> str:
    """
    计算 FIX 消息的 CheckSum (Tag 10)
    算法：消息中除 CheckSum 字段外所有字符的 ASCII 码之和，对 256 取模，格式化为 3 位数字
    """
    msg_without_checksum = re.sub(r'\x0110=\d{3}\x01$', '', raw_message)
    if not msg_without_checksum.endswith('\x01'):
        msg_without_checksum += '\x01'

    total = sum(ord(c) for c in msg_without_checksum)
    return f"{total % 256:03d}"


def verify_fix_checksum(raw_message: str) -> tuple[bool, str]:
    """
    校验 FIX 消息的 CheckSum
    返回 (是否有效, 计算出的 CheckSum)
    """
    match = re.search(r'\x0110=(\d{3})\x01$', raw_message)
    if not match:
        return False, ""

    received_checksum = match.group(1)
    calculated_checksum = calculate_fix_checksum(raw_message)

    return received_checksum == calculated_checksum, calculated_checksum


def append_fix_checksum(raw_message: str) -> str:
    """
    为 FIX 消息追加正确的 CheckSum 字段
    注意：raw_message 应该以 \x01 结尾，且不应包含 Tag 10
    """
    if not raw_message.endswith('\x01'):
        raw_message += '\x01'
    checksum = calculate_fix_checksum(raw_message)
    return f"{raw_message}10={checksum}\x01"


def extract_field(raw_message: str, tag: str) -> str:
    """从 FIX 消息中提取指定字段的值"""
    match = re.search(rf'{tag}=([^\x01]+)\x01', raw_message)
    return match.group(1) if match else ""


def get_message_length(raw_message: str) -> int:
    """计算 FIX 消息 BodyLength (Tag 9)：从 MsgType (Tag 35) 开始到 CheckSum (Tag 10) 前的字节数"""
    msg_no_checksum = re.sub(r'\x0110=\d{3}\x01$', '', raw_message)
    match = re.search(r'\x0135=', msg_no_checksum)
    if not match:
        return 0
    body_start = match.start() + 1
    body = msg_no_checksum[body_start:]
    return len(body)


def update_body_length(raw_message: str) -> str:
    """更新 FIX 消息的 BodyLength (Tag 9)"""
    parts = re.split(r'(\x01)', raw_message, maxsplit=2)
    if len(parts) < 4:
        return raw_message

    header_parts = re.split(r'(\x01)', raw_message, maxsplit=2)
    rest = header_parts[2]

    msg_no_checksum = re.sub(r'\x0110=\d{3}\x01$', '', '\x01' + rest)
    match = re.search(r'\x0135=', msg_no_checksum)
    if match:
        body_start = match.start() + 1
        body = msg_no_checksum[body_start:]
        body_length = len(body)
        raw_message = re.sub(r'9=\d+', f'9={body_length}', raw_message, count=1)

    return raw_message
