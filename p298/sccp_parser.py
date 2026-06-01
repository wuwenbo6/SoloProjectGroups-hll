import struct
from enum import IntEnum
from typing import Optional, Dict, Any


class SCCPMessageType(IntEnum):
    UDT = 0x09
    UDTS = 0x0A
    XUDT = 0x11
    XUDTS = 0x12
    CR = 0x01
    CC = 0x02
    CREF = 0x03
    DT1 = 0x06
    DT2 = 0x10
    AK = 0x0E
    UD = 0x08


class SCCPPartyType(IntEnum):
    SCCP_PARTY_UNKNOWN = 0
    SCCP_PARTY_NATIONAL = 2
    SCCP_PARTY_INTERNATIONAL = 3


class SCCPParser:
    def __init__(self):
        self.message_types = {
            0x01: "Connection Request (CR)",
            0x02: "Connection Confirm (CC)",
            0x03: "Connection Refused (CREF)",
            0x04: "Released (RLSD)",
            0x05: "Release Complete (RLC)",
            0x06: "Data Form 1 (DT1)",
            0x07: "Data Form 2 (DT2)",
            0x08: "Unit Data (UD)",
            0x09: "Unit Data Service (UDT)",
            0x0A: "Unit Data Service Acknowledge (UDTS)",
            0x0B: "Escape (ES)",
            0x0C: "Reset (RSR)",
            0x0D: "Reset Confirmation (RSC)",
            0x0E: "Acknowledge (AK)",
            0x0F: "Protocol Data Unit Error (ERR)",
            0x10: "Inactivity Test (IT)",
            0x11: "Extended Unit Data (XUDT)",
            0x12: "Extended Unit Data Service (XUDTS)",
        }

    def parse_hex_string(self, hex_string: str) -> bytes:
        return bytes.fromhex(hex_string.replace(' ', ''))

    def parse_sccp_header(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 2:
            raise ValueError("Data too short for SCCP header")

        msg_type = data[0]
        ptr = 1

        result = {
            'message_type': msg_type,
            'message_type_name': self.message_types.get(msg_type, f'Unknown ({msg_type:02X})'),
            'raw_header': data[:3].hex().upper(),
        }

        if msg_type in [SCCPMessageType.UDT, SCCPMessageType.UD]:
            ptr = self._parse_udt_header(data, ptr, result)
        elif msg_type in [SCCPMessageType.CR, SCCPMessageType.CC]:
            ptr = self._parse_connection_header(data, ptr, result)
        elif msg_type == SCCPMessageType.DT1:
            ptr = self._parse_dt1_header(data, ptr, result)

        result['payload'] = data[ptr:]
        result['payload_hex'] = data[ptr:].hex().upper()

        return result

    def _parse_udt_header(self, data: bytes, ptr: int, result: Dict[str, Any]) -> int:
        result['protocol_class'] = data[ptr] & 0x0F
        result['return_option'] = (data[ptr] >> 4) & 0x01
        ptr += 1

        called_party_length = data[ptr]
        ptr += 1
        result['called_party'] = self._parse_called_party(data[ptr:ptr + called_party_length])
        ptr += called_party_length

        calling_party_length = data[ptr]
        ptr += 1
        result['calling_party'] = self._parse_calling_party(data[ptr:ptr + calling_party_length])
        ptr += calling_party_length

        return ptr

    def _parse_connection_header(self, data: bytes, ptr: int, result: Dict[str, Any]) -> int:
        result['destination_local_reference'] = int.from_bytes(data[ptr:ptr + 3], 'little')
        ptr += 3
        result['source_local_reference'] = int.from_bytes(data[ptr:ptr + 3], 'little')
        ptr += 3
        result['protocol_class'] = data[ptr]
        ptr += 1

        called_party_length = data[ptr]
        ptr += 1
        if called_party_length > 0:
            result['called_party'] = self._parse_called_party(data[ptr:ptr + called_party_length])
            ptr += called_party_length

        calling_party_length = data[ptr]
        ptr += 1
        if calling_party_length > 0:
            result['calling_party'] = self._parse_calling_party(data[ptr:ptr + calling_party_length])
            ptr += calling_party_length

        return ptr

    def _parse_dt1_header(self, data: bytes, ptr: int, result: Dict[str, Any]) -> int:
        result['destination_local_reference'] = int.from_bytes(data[ptr:ptr + 3], 'little')
        ptr += 3
        result['segmenting'] = (data[ptr] >> 7) & 0x01
        result['more_data'] = (data[ptr] >> 6) & 0x01
        result['sequence_number'] = data[ptr] & 0x3F
        ptr += 1

        return ptr

    def _parse_called_party(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 1:
            return {'error': 'empty'}

        result = {
            'raw': data.hex().upper(),
            'address_indicator': data[0],
        }

        ai = data[0]
        result['routing_on_ssn'] = (ai >> 6) & 0x01
        result['global_title_indicator'] = (ai >> 2) & 0x0F
        result['ssn_present'] = ai & 0x01
        result['point_code_present'] = (ai >> 1) & 0x01

        ptr = 1

        if result['point_code_present'] and ptr + 2 <= len(data):
            result['point_code'] = int.from_bytes(data[ptr:ptr + 2], 'little')
            ptr += 2

        if result['ssn_present'] and ptr < len(data):
            result['subsystem_number'] = data[ptr]
            ptr += 1

        if result['global_title_indicator'] != 0 and ptr < len(data):
            gti = result['global_title_indicator']
            if gti == 4:
                result['global_title'] = self._parse_global_title_4(data[ptr:])
            elif gti == 2:
                result['global_title'] = self._parse_global_title_2(data[ptr:])

        return result

    def _parse_calling_party(self, data: bytes) -> Dict[str, Any]:
        return self._parse_called_party(data)

    def _parse_global_title_4(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 3:
            return {'error': 'GT data too short'}

        result = {
            'translation_type': data[0],
            'numbering_plan': (data[1] >> 4) & 0x0F,
            'encoding_scheme': data[1] & 0x0F,
            'nature_of_address': data[2],
        }

        addr_len = data[3] if len(data) > 3 else 0
        if addr_len > 0 and len(data) > 4:
            addr_bytes = data[4:4 + addr_len]
            result['address_digits'] = self._decode_bcd_number(addr_bytes)

        return result

    def _parse_global_title_2(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 2:
            return {'error': 'GT data too short'}

        result = {
            'translation_type': data[0],
        }

        addr_len = data[1] if len(data) > 1 else 0
        if addr_len > 0 and len(data) > 2:
            addr_bytes = data[2:2 + addr_len]
            result['address_digits'] = self._decode_bcd_number(addr_bytes)

        return result

    def _decode_bcd_number(self, data: bytes) -> str:
        digits = []
        for byte in data:
            low_nibble = byte & 0x0F
            high_nibble = (byte >> 4) & 0x0F

            digits.append(str(low_nibble))
            if high_nibble != 0x0F:
                digits.append(str(high_nibble))

        return ''.join(digits)

    def extract_bssap_payload(self, sccp_data: Dict[str, Any]) -> Optional[bytes]:
        payload = sccp_data.get('payload')
        if not payload or len(payload) < 2:
            return None

        if payload[0] == 0x01:
            return payload

        return None
