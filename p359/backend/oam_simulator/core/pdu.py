from enum import Enum
from dataclasses import dataclass, field
from typing import Optional, Any, Dict, List
import struct
import uuid
import time


class PDUType(Enum):
    INFORMATION = 0x00
    EVENT_NOTIFICATION = 0x01
    VARIABLE_REQUEST = 0x02
    VARIABLE_RESPONSE = 0x03
    LOOPBACK_CONTROL = 0x04


class OAMPDUType(str, Enum):
    DISCOVERY = "discovery"
    INFORMATION = "information"
    EVENT = "event"
    VARIABLE_REQUEST = "variable_request"
    VARIABLE_RESPONSE = "variable_response"
    LOOPBACK_CONTROL = "loopback_control"


class EventTypeCode(Enum):
    ERRORED_SYMBOL_PERIOD = 0x0001
    ERRORED_FRAME = 0x0002
    ERRORED_FRAME_PERIOD = 0x0003
    ERRORED_FRAME_SECONDS = 0x0004
    ERRORED_SECONDS_SUMMARY = 0x0005
    CRITICAL_EVENT = 0xFF00
    DYING_GASP = 0xFF01


class DyingGaspCause(Enum):
    UNKNOWN = 0x00
    POWER_FAILURE = 0x01
    OVERHEATING = 0x02
    WATCHDOG_RESET = 0x03
    FAN_FAILURE = 0x04
    POWER_SUPPLY_FAILURE = 0x05
    HARDWARE_FAILURE = 0x06
    SOFTWARE_CRASH = 0x07


class LoopbackMode(Enum):
    NONE = 0x00
    LOCAL_LOOPBACK = 0x01
    REMOTE_LOOPBACK = 0x02


class FrameType(Enum):
    OAM = 0x8809
    DATA = 0x0800


SLOW_PROTOCOL_TYPE = 0x8809
OAM_SUBTYPE = 0x03


@dataclass
class OAMPDU:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: float = field(default_factory=time.time)
    source_mac: str = "00:00:00:00:00:00"
    dest_mac: str = "01:80:C2:00:00:02"
    code: int = 0x00
    flags: int = 0x0000
    type: int = 0x00
    payload: Dict[str, Any] = field(default_factory=dict)
    pdu_type: OAMPDUType = OAMPDUType.INFORMATION

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "source_mac": self.source_mac,
            "dest_mac": self.dest_mac,
            "code": self.code,
            "flags": self.flags,
            "type": self.type,
            "payload": self.payload,
            "pdu_type": self.pdu_type.value,
        }


class PDUEncoder:
    @staticmethod
    def _mac_to_bytes(mac: str) -> bytes:
        return bytes.fromhex(mac.replace(":", ""))

    @staticmethod
    def _bytes_to_mac(data: bytes) -> str:
        return ":".join(f"{b:02X}" for b in data)

    @classmethod
    def encode(cls, pdu: OAMPDU) -> bytes:
        dest_bytes = cls._mac_to_bytes(pdu.dest_mac)
        src_bytes = cls._mac_to_bytes(pdu.source_mac)

        frame = bytearray()
        frame.extend(dest_bytes)
        frame.extend(src_bytes)
        frame.extend(struct.pack(">H", SLOW_PROTOCOL_TYPE))
        frame.append(OAM_SUBTYPE)

        flags_high = (pdu.flags >> 8) & 0xFF
        flags_low = pdu.flags & 0xFF
        frame.append(flags_high)
        frame.append(flags_low)

        frame.append(pdu.code)

        payload_bytes = cls._encode_payload(pdu)
        frame.extend(payload_bytes)

        fcs = cls._calculate_fcs(bytes(frame))
        frame.extend(struct.pack(">I", fcs))

        return bytes(frame)

    @classmethod
    def _encode_payload(cls, pdu: OAMPDU) -> bytes:
        payload = bytearray()

        if pdu.pdu_type == OAMPDUType.DISCOVERY:
            payload.extend(struct.pack(">H", pdu.payload.get("revision", 0)))
            payload.extend(struct.pack(">I", pdu.payload.get("oui", 0x00120F)))
            payload.append(pdu.payload.get("type", 0x01))
            payload.append(pdu.payload.get("mode", 0x01))
            payload.append(pdu.payload.get("mux_action", 0x00))
            payload.append(pdu.payload.get("parser_action", 0x00))
            payload.extend(struct.pack(">I", pdu.payload.get("oam_config", 0x00000001)))
            payload.extend(struct.pack(">I", pdu.payload.get("oam_pdu_config", 0x00000001)))
        elif pdu.pdu_type == OAMPDUType.INFORMATION:
            info_type = pdu.payload.get("info_type", 0x01)
            info_length = pdu.payload.get("info_length", 16)
            payload.append(info_type)
            payload.append(info_length)
            payload.extend(struct.pack(">H", pdu.payload.get("revision", 0)))
            payload.extend(struct.pack(">I", pdu.payload.get("oui", 0x00120F)))
            payload.append(pdu.payload.get("type", 0x01))
            payload.append(pdu.payload.get("mode", 0x01))
            payload.append(pdu.payload.get("mux_action", 0x00))
            payload.append(pdu.payload.get("parser_action", 0x00))
            payload.extend(struct.pack(">I", pdu.payload.get("oam_config", 0x00000001)))
            payload.extend(struct.pack(">I", pdu.payload.get("oam_pdu_config", 0x00000001)))

        return bytes(payload)

    @staticmethod
    def _calculate_fcs(data: bytes) -> int:
        crc = 0xFFFFFFFF
        for byte in data:
            crc ^= byte
            for _ in range(8):
                if crc & 1:
                    crc = (crc >> 1) ^ 0xEDB88320
                else:
                    crc >>= 1
        return ~crc & 0xFFFFFFFF


class PDUDecoder:
    @staticmethod
    def _mac_to_bytes(mac: str) -> bytes:
        return bytes.fromhex(mac.replace(":", ""))

    @staticmethod
    def _bytes_to_mac(data: bytes) -> str:
        return ":".join(f"{b:02X}" for b in data)

    @classmethod
    def decode(cls, data: bytes) -> Optional[OAMPDU]:
        if len(data) < 22:
            return None

        dest_mac = cls._bytes_to_mac(data[0:6])
        src_mac = cls._bytes_to_mac(data[6:12])
        eth_type = struct.unpack(">H", data[12:14])[0]

        if eth_type != SLOW_PROTOCOL_TYPE:
            return None

        subtype = data[14]
        if subtype != OAM_SUBTYPE:
            return None

        flags = (data[15] << 8) | data[16]
        code = data[17]

        payload_data = data[18:-4] if len(data) > 22 else b""
        payload = cls._decode_payload(code, payload_data)

        pdu_type = cls._get_pdu_type(code)

        return OAMPDU(
            source_mac=src_mac,
            dest_mac=dest_mac,
            code=code,
            flags=flags,
            type=code,
            payload=payload,
            pdu_type=pdu_type,
        )

    @classmethod
    def _decode_payload(cls, code: int, data: bytes) -> Dict[str, Any]:
        payload: Dict[str, Any] = {}

        if code == PDUType.INFORMATION.value and len(data) >= 2:
            info_type = data[0]
            info_length = data[1]
            payload["info_type"] = info_type
            payload["info_length"] = info_length

            if len(data) >= 18 and info_type == 0x01:
                payload["revision"] = struct.unpack(">H", data[2:4])[0]
                payload["oui"] = struct.unpack(">I", b"\x00" + data[4:7])[0]
                payload["type"] = data[7]
                payload["mode"] = data[8]
                payload["mux_action"] = data[9]
                payload["parser_action"] = data[10]
                payload["oam_config"] = struct.unpack(">I", data[11:15])[0]
                payload["oam_pdu_config"] = struct.unpack(">I", data[15:19])[0]
        elif code == PDUType.EVENT_NOTIFICATION.value and len(data) >= 4:
            payload["sequence"] = struct.unpack(">H", data[0:2])[0]
            payload["event_type"] = struct.unpack(">H", data[2:4])[0]

        return payload

    @staticmethod
    def _get_pdu_type(code: int) -> OAMPDUType:
        type_map = {
            PDUType.INFORMATION.value: OAMPDUType.INFORMATION,
            PDUType.EVENT_NOTIFICATION.value: OAMPDUType.EVENT,
            PDUType.VARIABLE_REQUEST.value: OAMPDUType.VARIABLE_REQUEST,
            PDUType.VARIABLE_RESPONSE.value: OAMPDUType.VARIABLE_RESPONSE,
        }
        return type_map.get(code, OAMPDUType.INFORMATION)


def create_discovery_pdu(
    source_mac: str,
    dest_mac: str = "01:80:C2:00:00:02",
    mode: str = "active",
) -> OAMPDU:
    mode_value = 0x01 if mode == "active" else 0x02
    return OAMPDU(
        source_mac=source_mac,
        dest_mac=dest_mac,
        code=PDUType.INFORMATION.value,
        flags=0x0000,
        type=PDUType.INFORMATION.value,
        pdu_type=OAMPDUType.DISCOVERY,
        payload={
            "revision": 0,
            "oui": 0x00120F,
            "type": 0x01,
            "mode": mode_value,
            "mux_action": 0x00,
            "parser_action": 0x00,
            "oam_config": 0x00000001,
            "oam_pdu_config": 0x00000001,
        },
    )


def create_information_pdu(
    source_mac: str,
    dest_mac: str = "01:80:C2:00:00:02",
    mode: str = "active",
) -> OAMPDU:
    mode_value = 0x01 if mode == "active" else 0x02
    return OAMPDU(
        source_mac=source_mac,
        dest_mac=dest_mac,
        code=PDUType.INFORMATION.value,
        flags=0x0000,
        type=PDUType.INFORMATION.value,
        pdu_type=OAMPDUType.INFORMATION,
        payload={
            "info_type": 0x01,
            "info_length": 16,
            "revision": 0,
            "oui": 0x00120F,
            "type": 0x01,
            "mode": mode_value,
            "mux_action": 0x00,
            "parser_action": 0x00,
            "oam_config": 0x00000001,
            "oam_pdu_config": 0x00000001,
        },
    )


@dataclass
class TLV:
    type: int
    length: int
    value: bytes

    def encode(self) -> bytes:
        return bytes([self.type, self.length]) + self.value

    @classmethod
    def decode(cls, data: bytes, offset: int = 0) -> "TLV":
        tlv_type = data[offset]
        tlv_length = data[offset + 1]
        tlv_value = data[offset + 2 : offset + 2 + tlv_length]
        return cls(type=tlv_type, length=tlv_length, value=tlv_value)


class TLVType(Enum):
    END_OF_TLV_MARKER = 0x00
    ORGANIZATION_SPECIFIC = 0x01
    CAUSE = 0x02
    LOCAL_REMOTE = 0x03
    SYMBOL_PERIOD = 0x04
    FRAME = 0x05
    FRAME_PERIOD = 0x06
    FRAME_SECONDS = 0x07
    SECONDS_SUMMARY = 0x08


class CriticalEventCause(Enum):
    UNKNOWN = 0x00
    POWER_OFF = 0x01
    RESET = 0x02
    GENERIC_HARDWARE_ERROR = 0x03
    GENERIC_SOFTWARE_ERROR = 0x04
    PORT_STATE_CHANGE = 0x05
    CONFIGURATION_CHANGE = 0x06


def create_cause_tlv(cause: CriticalEventCause, cause_text: str = "") -> TLV:
    cause_bytes = bytes([cause.value])
    cause_text_bytes = cause_text.encode("utf-8")[:253]
    value = cause_bytes + cause_text_bytes
    return TLV(type=TLVType.CAUSE.value, length=len(value), value=value)


def create_event_pdu(
    source_mac: str,
    dest_mac: str = "01:80:C2:00:00:02",
    sequence: int = 0,
    event_type: EventTypeCode = EventTypeCode.ERRORED_FRAME,
    tlvs: Optional[List[TLV]] = None,
) -> OAMPDU:
    payload = {
        "sequence": sequence,
        "event_type": event_type.value,
        "tlvs": [],
    }

    if tlvs:
        payload["tlvs"] = [
            {"type": tlv.type, "length": tlv.length, "value": tlv.value.hex()}
            for tlv in tlvs
        ]

    return OAMPDU(
        source_mac=source_mac,
        dest_mac=dest_mac,
        code=PDUType.EVENT_NOTIFICATION.value,
        flags=0x0000,
        type=PDUType.EVENT_NOTIFICATION.value,
        pdu_type=OAMPDUType.EVENT,
        payload=payload,
    )


def create_critical_event_pdu(
    source_mac: str,
    dest_mac: str = "01:80:C2:00:00:02",
    sequence: int = 0,
    cause: CriticalEventCause = CriticalEventCause.UNKNOWN,
    cause_text: str = "",
) -> OAMPDU:
    cause_tlv = create_cause_tlv(cause, cause_text)
    end_tlv = TLV(type=TLVType.END_OF_TLV_MARKER.value, length=0, value=b"")
    return create_event_pdu(
        source_mac=source_mac,
        dest_mac=dest_mac,
        sequence=sequence,
        event_type=EventTypeCode.CRITICAL_EVENT,
        tlvs=[cause_tlv, end_tlv],
    )


def create_loopback_control_pdu(
    source_mac: str,
    dest_mac: str = "01:80:C2:00:00:02",
    loopback_mode: LoopbackMode = LoopbackMode.NONE,
) -> OAMPDU:
    return OAMPDU(
        source_mac=source_mac,
        dest_mac=dest_mac,
        code=PDUType.LOOPBACK_CONTROL.value,
        flags=0x0000,
        type=PDUType.LOOPBACK_CONTROL.value,
        pdu_type=OAMPDUType.LOOPBACK_CONTROL,
        payload={
            "loopback_mode": loopback_mode.value,
        },
    )


def create_dying_gasp_pdu(
    source_mac: str,
    dest_mac: str = "01:80:C2:00:00:02",
    sequence: int = 0,
    cause: DyingGaspCause = DyingGaspCause.UNKNOWN,
    cause_text: str = "",
) -> OAMPDU:
    cause_tlv = TLV(
        type=TLVType.CAUSE.value,
        length=1 + len(cause_text.encode("utf-8")[:253]),
        value=bytes([cause.value]) + cause_text.encode("utf-8")[:253],
    )
    end_tlv = TLV(type=TLVType.END_OF_TLV_MARKER.value, length=0, value=b"")
    return create_event_pdu(
        source_mac=source_mac,
        dest_mac=dest_mac,
        sequence=sequence,
        event_type=EventTypeCode.DYING_GASP,
        tlvs=[cause_tlv, end_tlv],
    )


def is_oam_frame(data: bytes) -> bool:
    if len(data) < 14:
        return False
    eth_type = struct.unpack(">H", data[12:14])[0]
    return eth_type == SLOW_PROTOCOL_TYPE


def pdu_to_hex(pdu: OAMPDU) -> str:
    encoded = PDUEncoder.encode(pdu)
    return " ".join(f"{b:02X}" for b in encoded)


def pdu_to_data_dict(pdu: OAMPDU, direction: str = "sent") -> Dict[str, Any]:
    return {
        "id": pdu.id,
        "timestamp": pdu.timestamp,
        "direction": direction,
        "type": pdu.pdu_type.value,
        "source_mac": pdu.source_mac,
        "dest_mac": pdu.dest_mac,
        "fields": {
            "code": pdu.code,
            "flags": pdu.flags,
            "type": pdu.type,
            "payload": pdu.payload,
        },
        "raw_hex": pdu_to_hex(pdu),
    }
