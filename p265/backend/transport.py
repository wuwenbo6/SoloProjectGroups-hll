import struct
from typing import Tuple, Optional
from enum import Enum


class TransportType(Enum):
    ABRIDGED = "abridged"
    INTERMEDIATE = "intermediate"
    PADDED_INTERMEDIATE = "padded_intermediate"
    FULL = "full"
    HTTP = "http"


class TransportParser:
    @staticmethod
    def detect_transport_type(data: bytes) -> TransportType:
        if len(data) < 4:
            raise ValueError("Data too short to detect transport type")

        if data[:4] == b"POST" or data[:3] == b"GET":
            return TransportType.HTTP

        if data[0] == 0xef:
            return TransportType.ABRIDGED

        if data[:4] == b"\xee\xee\xee\xee":
            return TransportType.INTERMEDIATE

        if data[:4] == b"\xdd\xdd\xdd\xdd":
            return TransportType.PADDED_INTERMEDIATE

        return TransportType.FULL

    @staticmethod
    def parse_tcp_abridged(data: bytes) -> bytes:
        if data[0] != 0xef:
            raise ValueError("Not abridged transport")

        payload = data[1:]
        result = b""
        offset = 0

        while offset < len(payload):
            if offset >= len(payload):
                break

            length_byte = payload[offset]
            offset += 1

            if length_byte < 127:
                length = length_byte * 4
            else:
                if offset + 3 >= len(payload):
                    break
                length = int.from_bytes(payload[offset:offset + 3], "little") * 4
                offset += 3

            if offset + length > len(payload):
                break

            result += payload[offset:offset + length]
            offset += length

        return result

    @staticmethod
    def parse_tcp_intermediate(data: bytes, padded: bool = False) -> bytes:
        header = b"\xdd\xdd\xdd\xdd" if padded else b"\xee\xee\xee\xee"
        if data[:4] != header:
            raise ValueError("Not intermediate transport")

        payload = data[4:]
        result = b""
        offset = 0

        while offset + 4 <= len(payload):
            length = int.from_bytes(payload[offset:offset + 4], "little")
            offset += 4

            if offset + length > len(payload):
                break

            result += payload[offset:offset + length]
            offset += length

            if padded:
                padding = (4 - (length % 4)) % 4
                offset += padding

        return result

    @staticmethod
    def parse_tcp_full(data: bytes) -> bytes:
        result = b""
        offset = 0

        while offset + 12 <= len(data):
            length = int.from_bytes(data[offset:offset + 4], "little")
            seq = int.from_bytes(data[offset + 4:offset + 8], "little")
            checksum = int.from_bytes(data[offset + 8:offset + 12], "little")
            offset += 12

            body_length = length - 12
            if offset + body_length > len(data):
                break

            body = data[offset:offset + body_length]
            offset += body_length

            import hashlib
            calculated_checksum = int.from_bytes(
                hashlib.sha256(data[offset - 12:offset - 4] + body).digest()[:4],
                "little"
            )

            if calculated_checksum != checksum:
                pass

            result += body

        return result

    @staticmethod
    def parse_http(data: bytes) -> Tuple[bytes, Optional[dict]]:
        try:
            header_end = data.find(b"\r\n\r\n")
            if header_end == -1:
                header_end = data.find(b"\n\n")
                if header_end == -1:
                    return data, {}

            headers_raw = data[:header_end].decode("utf-8", errors="replace")
            body = data[header_end + (4 if b"\r\n\r\n" in data else 2):]

            headers = {}
            lines = headers_raw.split("\n")
            for line in lines[1:]:
                if ":" in line:
                    key, value = line.split(":", 1)
                    headers[key.strip().lower()] = value.strip()

            content_length = headers.get("content-length")
            if content_length:
                try:
                    body = body[:int(content_length)]
                except ValueError:
                    pass

            return body, headers
        except Exception:
            return data, {}

    def parse(self, data: bytes, transport_type: Optional[TransportType] = None) -> bytes:
        if transport_type is None:
            transport_type = self.detect_transport_type(data)

        if transport_type == TransportType.ABRIDGED:
            return self.parse_tcp_abridged(data)
        elif transport_type == TransportType.INTERMEDIATE:
            return self.parse_tcp_intermediate(data, padded=False)
        elif transport_type == TransportType.PADDED_INTERMEDIATE:
            return self.parse_tcp_intermediate(data, padded=True)
        elif transport_type == TransportType.FULL:
            return self.parse_tcp_full(data)
        elif transport_type == TransportType.HTTP:
            body, _ = self.parse_http(data)
            return body

        raise ValueError(f"Unknown transport type: {transport_type}")

    @staticmethod
    def parse_auth_key_id(packet: bytes) -> int:
        if len(packet) < 8:
            raise ValueError("Packet too short for auth_key_id")
        return int.from_bytes(packet[:8], "little")

    @staticmethod
    def parse_message_key(packet: bytes) -> bytes:
        if len(packet) < 24:
            raise ValueError("Packet too short for message_key")
        return packet[8:24]

    @staticmethod
    def split_packet(packet: bytes) -> Tuple[int, bytes, bytes]:
        if len(packet) < 24:
            raise ValueError("Packet too short")

        auth_key_id = int.from_bytes(packet[:8], "little")
        message_key = packet[8:24]
        encrypted_data = packet[24:]

        return auth_key_id, message_key, encrypted_data
