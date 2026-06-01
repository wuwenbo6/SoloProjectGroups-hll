from enum import IntEnum
from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass


class DTAPMessageType(IntEnum):
    SETUP = 0x05
    CONNECT = 0x07
    CONNECT_ACKNOWLEDGE = 0x0F
    RELEASE = 0x4D
    RELEASE_COMPLETE = 0x5A
    ALERTING = 0x01
    CALL_PROCEEDING = 0x02
    PROGRESS = 0x03
    DISCONNECT = 0x45
    FACILITY = 0x62
    INFORMATION = 0x7D
    LOCATION_UPDATING_REQUEST = 0x08
    LOCATION_UPDATING_ACCEPT = 0x09
    LOCATION_UPDATING_REJECT = 0x0A
    AUTHENTICATION_REQUEST = 0x12
    AUTHENTICATION_RESPONSE = 0x13
    AUTHENTICATION_REJECT = 0x14
    IDENTITY_REQUEST = 0x18
    IDENTITY_RESPONSE = 0x19
    TMSI_REALLOCATION_COMMAND = 0x1A
    TMSI_REALLOCATION_COMPLETE = 0x1B
    CM_SERVICE_REQUEST = 0x15
    CM_SERVICE_ACCEPT = 0x16
    CM_SERVICE_REJECT = 0x17
    PAGING = 0x21
    PAGING_RESPONSE = 0x22
    SYSTEM_INFORMATION_TYPE_1 = 0x1D
    SYSTEM_INFORMATION_TYPE_2 = 0x1E
    SYSTEM_INFORMATION_TYPE_3 = 0x1F
    SYSTEM_INFORMATION_TYPE_4 = 0x20


class IEIType(IntEnum):
    BEARER_CAPABILITY = 0x04
    CAUSE = 0x08
    CALL_STATE = 0x14
    SIGNAL = 0x34
    FACILITY = 0x1C
    PROGRESS_INDICATOR = 0x1E
    NETWORK_FACILITY = 0x30
    CLAMP = 0x01
    PARTIAL_RECORD_TYPE = 0x17
    START_TIME = 0xA0
    STOP_TIME = 0xA1
    CONNECTED_NUMBER = 0x4C
    CALLING_PARTY_BCD_NUMBER = 0x5C
    CALLED_PARTY_BCD_NUMBER = 0x5E
    FACILITY_REJECT = 0x61
    REDIRECTING_NUMBER = 0x76
    ORIGINAL_CALLED_NUMBER = 0x74
    USER_USER = 0x7E
    FACILITY_DATA = 0x1D
    NETWORK_SPECIFIC_FACILITY = 0x31
    AUTHENTICATION_PARAMETER_RAND = 0x21
    AUTHENTICATION_PARAMETER_SRES = 0x22
    AUTHENTICATION_PARAMETER_KC = 0x23
    CIPHER_MODE_SETTING = 0x27
    CIPHER_KEY_SEQUENCE_NUMBER = 0x28
    LOCATION_AREA_IDENTIFICATION = 0x13
    MOBILE_IDENTITY = 0x17
    LOCATION_UPDATING_TYPE = 0x08
    MOBILE_STATION_CLASSMARK_1 = 0x29
    MOBILE_STATION_CLASSMARK_2 = 0x1F
    MOBILE_STATION_CLASSMARK_3 = 0x20
    IDENTITY_TYPE = 0x10
    IMEISV = 0x24
    CELL_IDENTIFIER = 0x0A
    CHANNEL_NEEDED = 0x02
    MOBILE_IDENTITY_2 = 0x18
    PRIORITY = 0x16
    LIST_OF_PAGING_GROUPS = 0x19
    DOWNLINK_DTX_FLAG = 0x26
    MOBILE_STATION_FEATURES = 0x37
    PS_INTER_RAT_HO_SUPPORT = 0x38
    NETWORK_FEATURE_SUPPORT = 0x39
    MS_NETWORK_FEATURE_SUPPORT = 0x3A
    ADDITIONAL_UPDATE_TYPE = 0x3B
    DRX_PARAMETER = 0x2C
    CELL_SEL_INDICATION = 0x2D
    LSA_PARAMETERS = 0x3C
    MULTIMODE_MS_CAPABILITY = 0x3D
    TMSI_STATUS = 0x1B
    MS_CLASSMARK_2_PREFERRED = 0x2E
    ADDITIONAL_MS_RADIO_CAPABILITY_1 = 0x32
    ADDITIONAL_MS_RADIO_CAPABILITY_2 = 0x33
    SUPPORTED_CODEC_LIST = 0x40
    PACKET_DOMAIN_INDICATOR = 0x3E
    NETWORK_CONTROLLED_CELL_RESELECTION = 0x3F
    GPRS_SUSPENSION_REQUEST = 0x36
    READY_TIMER = 0x35
    INTERRAT_HO_OUT_INDICATION = 0x39
    CS_TO_PS_HANDOVER_COMMAND = 0x3C
    EMM_CAUSE = 0x4A


class ASN1TagType(IntEnum):
    EOC = 0x00
    BOOLEAN = 0x01
    INTEGER = 0x02
    BIT_STRING = 0x03
    OCTET_STRING = 0x04
    NULL = 0x05
    OBJECT_IDENTIFIER = 0x06
    OBJECT_DESCRIPTOR = 0x07
    EXTERNAL = 0x08
    REAL = 0x09
    ENUMERATED = 0x0A
    EMBEDDED_PDV = 0x0B
    UTF8_STRING = 0x0C
    RELATIVE_OID = 0x0D
    SEQUENCE = 0x10
    SET = 0x11
    NUMERIC_STRING = 0x12
    PRINTABLE_STRING = 0x13
    T61_STRING = 0x14
    VIDEOTEX_STRING = 0x15
    IA5_STRING = 0x16
    UTCTime = 0x17
    GeneralizedTime = 0x18
    GRAPHIC_STRING = 0x19
    VISIBLE_STRING = 0x1A
    GENERAL_STRING = 0x1B
    UNIVERSAL_STRING = 0x1C
    CHARACTER_STRING = 0x1D
    BMP_STRING = 0x1E
    CONSTRUCTED = 0x20
    CONTEXT_SPECIFIC = 0x80


@dataclass
class CallInformation:
    call_id: str
    calling_number: Optional[str] = None
    called_number: Optional[str] = None
    connected_number: Optional[str] = None
    bearer_capability: Optional[str] = None
    setup_time: Optional[float] = None
    connect_time: Optional[float] = None
    release_time: Optional[float] = None
    state: str = "IDLE"
    messages: List[Dict[str, Any]] = None


@dataclass
class LocationUpdateInformation:
    update_id: str
    imsi: Optional[str] = None
    imei: Optional[str] = None
    tmsi: Optional[str] = None
    old_lai: Optional[str] = None
    new_lai: Optional[str] = None
    location_updating_type: Optional[str] = None
    ciphering: Optional[bool] = None
    authentication: Optional[bool] = None
    state: str = "IDLE"
    start_time: Optional[float] = None
    complete_time: Optional[float] = None
    messages: List[Dict[str, Any]] = None


class DTAPParser:
    def __init__(self):
        self.cc_message_types = {
            0x01: "Alerting",
            0x02: "Call Proceeding",
            0x03: "Progress",
            0x05: "Setup",
            0x07: "Connect",
            0x08: "Setup Acknowledge",
            0x0F: "Connect Acknowledge",
            0x20: "Emergency Setup",
            0x21: "Congestion Control",
            0x22: "Information",
            0x23: "Notify",
            0x24: "Hold",
            0x25: "Hold Acknowledge",
            0x26: "Hold Reject",
            0x27: "Retrieve",
            0x28: "Retrieve Acknowledge",
            0x29: "Retrieve Reject",
            0x2F: "User Information",
            0x45: "Disconnect",
            0x46: "Release",
            0x4D: "Release Complete",
            0x5A: "Status",
            0x5B: "Status Enquiry",
            0x62: "Facility",
            0x63: "Register",
            0x7D: "Facility Reject",
            0x7E: "Reset B-Loop",
            0x7F: "Reset B-Loop Acknowledge",
        }

        self.mm_message_types = {
            0x08: "Location Updating Request",
            0x09: "Location Updating Accept",
            0x0A: "Location Updating Reject",
            0x12: "Authentication Request",
            0x13: "Authentication Response",
            0x14: "Authentication Reject",
            0x15: "CM Service Request",
            0x16: "CM Service Accept",
            0x17: "CM Service Reject",
            0x18: "Identity Request",
            0x19: "Identity Response",
            0x1A: "TMSI Reallocation Command",
            0x1B: "TMSI Reallocation Complete",
            0x21: "Paging",
            0x22: "Paging Response",
            0x1D: "System Information Type 1",
            0x1E: "System Information Type 2",
            0x1F: "System Information Type 3",
            0x20: "System Information Type 4",
        }

        self.message_types = {**self.cc_message_types, **self.mm_message_types}

        self.protocol_discriminators = {
            0x03: "Call Control",
            0x04: "Mobility Management",
            0x05: "Session Management",
            0x06: "GPRS Mobility Management",
            0x08: "Short Message Service",
        }

        self.asn1_tag_names = {e.value: e.name for e in ASN1TagType}
        self.component_types = {
            0: "Invoke",
            1: "ReturnResult",
            2: "ReturnError",
            3: "Reject",
        }

    def parse_dtap_message(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 3:
            raise ValueError("Data too short for DTAP message")

        result = {
            'raw': data.hex().upper(),
            'protocol_discriminator': data[0] & 0x0F,
            'protocol_discriminator_name': self.protocol_discriminators.get(
                data[0] & 0x0F, f'Unknown ({data[0] & 0x0F:02X})'
            ),
            'skip_indicator': (data[0] >> 4) & 0x0F,
        }

        ptr = 1

        if result['protocol_discriminator'] == 0x03:
            result['transaction_identifier'] = (data[1] >> 4) & 0x0F
            result['ti_flag'] = (data[1] >> 7) & 0x01
            ptr += 1

        result['message_type'] = data[ptr]
        if result['protocol_discriminator'] == 0x04:
            msg_type_name = self.mm_message_types.get(data[ptr])
            if msg_type_name is None:
                msg_type_name = self.message_types.get(data[ptr], f'Unknown ({data[ptr]:02X})')
        else:
            msg_type_name = self.cc_message_types.get(data[ptr])
            if msg_type_name is None:
                msg_type_name = self.message_types.get(data[ptr], f'Unknown ({data[ptr]:02X})')
        result['message_type_name'] = msg_type_name
        ptr += 1

        result['information_elements'] = []
        result['information_elements_parsed'] = {}

        ies = self.parse_tlv_list(data[ptr:])
        result['information_elements'] = ies

        for ie in ies:
            ie_key = ie.get('iei_name', f'IE_0x{ie.get("iei", 0):02X}')
            result['information_elements_parsed'][ie_key] = ie.get('parsed', {})

        return result

    def parse_tlv_list(self, data: bytes) -> List[Dict[str, Any]]:
        result = []
        ptr = 0

        while ptr < len(data):
            if data[ptr] == 0x00:
                ptr += 1
                continue

            ie, bytes_consumed = self.parse_single_tlv(data[ptr:])
            result.append(ie)
            ptr += bytes_consumed

        return result

    def parse_single_tlv(self, data: bytes) -> Tuple[Dict[str, Any], int]:
        if len(data) < 1:
            return {'error': 'Empty TLV'}, 0

        iei = data[0]
        ptr = 1

        ie_length, length_bytes = self.parse_tlv_length(iei, data[ptr:])
        ptr += length_bytes

        ie_data = data[ptr:ptr + ie_length] if ptr + ie_length <= len(data) else data[ptr:]
        actual_length = len(ie_data)
        ptr += actual_length

        ie_info = {
            'iei': iei,
            'iei_name': IEIType(iei).name if iei in IEIType.__members__.values() else f'Unknown (0x{iei:02X})',
            'length': actual_length,
            'data': ie_data.hex().upper(),
        }

        parsed_ie = self.parse_information_element_value(iei, ie_data)
        if parsed_ie:
            ie_info['parsed'] = parsed_ie

        return ie_info, ptr

    def parse_tlv_length(self, iei: int, data: bytes) -> Tuple[int, int]:
        if iei & 0x80:
            if len(data) < 1:
                return 0, 0
            return data[0], 1
        else:
            type_4_ies = {0x04, 0x1C, 0x1D, 0x1E, 0x34, 0x4C, 0x5C, 0x5E, 0x74, 0x76, 0x7E}
            type_3_ies = {0x08}
            
            if iei in type_4_ies:
                if len(data) < 1:
                    return 0, 0
                return data[0], 1
            elif (iei & 0x0F) in type_3_ies or iei in type_3_ies:
                if len(data) < 1:
                    return 0, 0
                return data[0], 1
            else:
                return 1, 0

    def parse_information_element_value(self, iei: int, data: bytes) -> Optional[Dict[str, Any]]:
        try:
            if iei in [IEIType.CALLING_PARTY_BCD_NUMBER, IEIType.CALLED_PARTY_BCD_NUMBER,
                      IEIType.CONNECTED_NUMBER, IEIType.REDIRECTING_NUMBER,
                      IEIType.ORIGINAL_CALLED_NUMBER]:
                return self._parse_bcd_number(data)
            elif iei == IEIType.BEARER_CAPABILITY:
                return self._parse_bearer_capability(data)
            elif iei == IEIType.CAUSE:
                return self._parse_cause(data)
            elif iei == IEIType.CALL_STATE:
                return self._parse_call_state(data)
            elif iei == IEIType.PROGRESS_INDICATOR:
                return self._parse_progress_indicator(data)
            elif iei == IEIType.SIGNAL:
                return self._parse_signal(data)
            elif iei in [IEIType.FACILITY, IEIType.FACILITY_DATA]:
                return self._parse_facility_ie(data)
            elif iei == IEIType.USER_USER:
                return self._parse_user_user(data)
            elif iei in [IEIType.START_TIME, IEIType.STOP_TIME]:
                return self._parse_time(data)
            elif iei == IEIType.NETWORK_SPECIFIC_FACILITY:
                return self._parse_network_facility(data)
            elif iei in [IEIType.AUTHENTICATION_PARAMETER_RAND,
                         IEIType.AUTHENTICATION_PARAMETER_SRES,
                         IEIType.AUTHENTICATION_PARAMETER_KC]:
                return {'value': data.hex().upper(), 'length': len(data)}
            elif iei == IEIType.CIPHER_MODE_SETTING:
                return self._parse_cipher_mode_setting(data)
            elif iei == IEIType.CIPHER_KEY_SEQUENCE_NUMBER:
                return {'key_sequence_number': data[0] & 0x07} if len(data) > 0 else None
            elif iei == IEIType.LOCATION_AREA_IDENTIFICATION:
                return self._parse_location_area_identification(data)
            elif iei in [IEIType.MOBILE_IDENTITY, IEIType.MOBILE_IDENTITY_2]:
                return self._parse_mobile_identity(data)
            elif iei in [IEIType.MOBILE_STATION_CLASSMARK_1,
                         IEIType.MOBILE_STATION_CLASSMARK_2,
                         IEIType.MOBILE_STATION_CLASSMARK_3]:
                return self._parse_ms_classmark(data, iei)
            elif iei == IEIType.IDENTITY_TYPE:
                return self._parse_identity_type(data)
            elif iei == IEIType.IMEISV:
                return self._parse_imeisv(data)
            elif iei == IEIType.CELL_IDENTIFIER:
                return self._parse_cell_identifier(data)
            elif iei == IEIType.CHANNEL_NEEDED:
                return self._parse_channel_needed(data)
            elif iei == IEIType.DRX_PARAMETER:
                return self._parse_drx_parameter(data)
            elif iei == IEIType.TMSI_STATUS:
                return self._parse_tmsi_status(data)
            elif iei == IEIType.PRIORITY:
                return self._parse_priority(data)
            elif iei == IEIType.MOBILE_STATION_FEATURES:
                return self._parse_ms_features(data)
            elif iei == IEIType.ADDITIONAL_UPDATE_TYPE:
                return self._parse_additional_update_type(data)
            else:
                return self._try_parse_as_nested_tlv(data)
        except Exception as e:
            return {'raw': data.hex().upper(), 'parse_error': str(e)}

    def _try_parse_as_nested_tlv(self, data: bytes) -> Optional[Dict[str, Any]]:
        if len(data) < 2:
            return {'raw': data.hex().upper()}

        try:
            nested_ies = self.parse_tlv_list(data)
            if len(nested_ies) > 0:
                all_valid = all('iei_name' in ie and not ie.get('iei_name', '').startswith('Unknown') for ie in nested_ies)
                if all_valid or len(nested_ies) > 1:
                    return {
                        'nested': True,
                        'children': nested_ies,
                        'child_count': len(nested_ies)
                    }
        except Exception:
            pass

        return {'raw': data.hex().upper()}

    def _parse_facility_ie(self, data: bytes) -> Dict[str, Any]:
        result = {
            'raw': data.hex().upper(),
            'length': len(data),
        }

        try:
            asn1_result = self.parse_asn1(data, max_depth=10)
            if asn1_result:
                result['asn1_parsed'] = asn1_result

                components = self._extract_facility_components(asn1_result)
                if components:
                    result['components'] = components

        except Exception as e:
            result['parse_error'] = str(e)

        return result

    def parse_asn1(self, data: bytes, max_depth: int = 10, current_depth: int = 0) -> Optional[Dict[str, Any]]:
        if current_depth >= max_depth or len(data) < 2:
            return None

        try:
            tag_byte = data[0]
            ptr = 1

            tag_class = (tag_byte >> 6) & 0x03
            constructed = (tag_byte >> 5) & 0x01
            tag_number = tag_byte & 0x1F

            if tag_number == 0x1F:
                tag_number = 0
                while True:
                    if ptr >= len(data):
                        break
                    octet = data[ptr]
                    ptr += 1
                    tag_number = (tag_number << 7) | (octet & 0x7F)
                    if not (octet & 0x80):
                        break

            length, length_bytes = self._parse_asn1_length(data[ptr:])
            ptr += length_bytes

            content = data[ptr:ptr + length] if ptr + length <= len(data) else data[ptr:]
            actual_content_length = len(content)
            ptr += actual_content_length

            result = {
                'tag_byte': tag_byte,
                'tag_class': tag_class,
                'tag_class_name': ['Universal', 'Application', 'Context-Specific', 'Private'][tag_class],
                'constructed': constructed == 1,
                'tag_number': tag_number,
                'tag_name': self._get_asn1_tag_name(tag_class, tag_number),
                'length': actual_content_length,
                'content_hex': content.hex().upper(),
            }

            if constructed == 1 and len(content) > 0 and current_depth < max_depth - 1:
                children = []
                child_ptr = 0
                max_iterations = len(content) * 2
                iterations = 0
                while child_ptr < len(content) and iterations < max_iterations:
                    iterations += 1
                    child = self.parse_asn1(content[child_ptr:], max_depth, current_depth + 1)
                    if child:
                        children.append(child)
                        child_len = child.get('_total_length', 0)
                        if child_len <= 0:
                            child_len = max(1, len(content) - child_ptr)
                        child_ptr += child_len
                    else:
                        break

                if children:
                    result['children'] = children
                    result['child_count'] = len(children)
            elif constructed == 0 and len(content) > 0:
                result['value'] = self._decode_asn1_primitive(tag_number, content)

            result['_total_length'] = max(2, ptr)

            return result
        except Exception as e:
            return {'error': f'ASN.1 parse error: {str(e)}', 'raw': data.hex().upper()}

    def _parse_asn1_length(self, data: bytes) -> Tuple[int, int]:
        if len(data) < 1:
            return 0, 0

        first_byte = data[0]
        if first_byte & 0x80 == 0:
            return first_byte, 1
        else:
            num_bytes = first_byte & 0x7F
            if num_bytes == 0 or num_bytes > 4 or len(data) < num_bytes + 1:
                return len(data) - 1, 1

            length = 0
            for i in range(num_bytes):
                length = (length << 8) | data[1 + i]
            return length, 1 + num_bytes

    def _get_asn1_tag_name(self, tag_class: int, tag_number: int) -> str:
        if tag_class == 0:
            return self.asn1_tag_names.get(tag_number, f'Unknown (0x{tag_number:02X})')
        elif tag_class == 2:
            component_type = tag_number & 0x1F
            if component_type in self.component_types:
                return f'[{tag_number}] {self.component_types[component_type]}'
            return f'[{tag_number}] Context-Specific'
        else:
            return f'[{tag_number}] Class-{tag_class}'

    def _decode_asn1_primitive(self, tag_number: int, data: bytes) -> Any:
        if tag_number == ASN1TagType.BOOLEAN:
            return data[0] != 0 if len(data) > 0 else None
        elif tag_number == ASN1TagType.INTEGER:
            value = 0
            for byte in data:
                value = (value << 8) | byte
            if len(data) > 0 and data[0] & 0x80:
                value -= 1 << (8 * len(data))
            return value
        elif tag_number in [ASN1TagType.OCTET_STRING, ASN1TagType.BIT_STRING]:
            return {'hex': data.hex().upper(), 'length': len(data)}
        elif tag_number in [ASN1TagType.UTF8_STRING, ASN1TagType.PRINTABLE_STRING,
                             ASN1TagType.IA5_STRING, ASN1TagType.NUMERIC_STRING,
                             ASN1TagType.VISIBLE_STRING]:
            try:
                return data.decode('utf-8', errors='replace')
            except Exception:
                return data.hex().upper()
        elif tag_number == ASN1TagType.NULL:
            return None
        elif tag_number == ASN1TagType.OBJECT_IDENTIFIER:
            return self._decode_oid(data)
        else:
            return {'hex': data.hex().upper(), 'length': len(data)}

    def _decode_oid(self, data: bytes) -> str:
        if len(data) < 1:
            return ''

        oid_parts = []
        first_byte = data[0]
        oid_parts.append(str(first_byte // 40))
        oid_parts.append(str(first_byte % 40))

        value = 0
        for byte in data[1:]:
            value = (value << 7) | (byte & 0x7F)
            if not (byte & 0x80):
                oid_parts.append(str(value))
                value = 0

        if value != 0:
            oid_parts.append(str(value))

        return '.'.join(oid_parts)

    def _extract_facility_components(self, asn1_result: Dict[str, Any]) -> List[Dict[str, Any]]:
        components = []

        if 'children' not in asn1_result:
            return components

        for child in asn1_result.get('children', []):
            tag_num = child.get('tag_number', 0)
            tag_class = child.get('tag_class', 0)

            if tag_class == 2:
                component_type = tag_num & 0x1F
                component_name = self.component_types.get(component_type, f'Unknown (0x{component_type:02X})')

                component_info = {
                    'component_type': component_type,
                    'component_name': component_name,
                    'raw': child.get('content_hex', ''),
                }

                if 'children' in child and child['children']:
                    component_info['parameters'] = self._parse_component_parameters(child['children'])

                components.append(component_info)

        return components

    def _parse_component_parameters(self, children: List[Dict[str, Any]]) -> Dict[str, Any]:
        params = {}

        for i, child in enumerate(children):
            if child.get('tag_class') == 2:
                tag_num = child.get('tag_number', 0)
                key = f'param_{tag_num}'

                if 'children' in child:
                    params[key] = self._parse_component_parameters(child['children'])
                elif 'value' in child:
                    params[key] = child['value']
                else:
                    params[key] = child.get('content_hex', '')
            elif 'value' in child:
                params[f'param_{i}'] = child['value']
            else:
                params[f'param_{i}'] = child.get('content_hex', '')

        return params

    def _parse_bcd_number(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 2:
            return {'error': 'Number data too short'}

        ext = (data[0] >> 7) & 0x01
        numbering_plan = (data[0] >> 4) & 0x07
        number_type = data[0] & 0x0F

        numbering_plans = {
            0: "Unknown",
            1: "ISDN/telephony",
            3: "Data",
            4: "Telex",
            5: "SMS",
            6: "Radio",
            7: "Reserved",
        }

        number_types = {
            0: "Unknown",
            1: "International",
            2: "National",
            3: "Network specific",
            4: "Subscriber",
            5: "Alphanumeric",
            6: "Abbreviated",
        }

        digits = self._decode_bcd_digits(data[1:])

        return {
            'extension': ext,
            'numbering_plan': numbering_plan,
            'numbering_plan_name': numbering_plans.get(numbering_plan, 'Unknown'),
            'number_type': number_type,
            'number_type_name': number_types.get(number_type, 'Unknown'),
            'digits': digits,
        }

    def _decode_bcd_digits(self, data: bytes) -> str:
        digits = []
        for byte in data:
            low_nibble = byte & 0x0F
            high_nibble = (byte >> 4) & 0x0F

            if low_nibble == 0x0F:
                break
            digits.append(str(low_nibble))

            if high_nibble == 0x0F:
                break
            digits.append(str(high_nibble))

        return ''.join(digits)

    def _parse_bearer_capability(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 1:
            return {'error': 'Bearer capability data too short'}

        coding_standard = (data[0] >> 5) & 0x03
        info_transfer_cap = data[0] & 0x1F

        coding_standards = {
            0: "CCITT standardized",
            1: "ISO/IEC standard",
            2: "National standard",
            3: "Network specific",
        }

        transfer_caps = {
            0: "Speech",
            8: "Unrestricted digital information",
            9: "Restricted digital information",
            16: "3.1 kHz audio",
            17: "Unrestricted digital information with tones/announcements",
        }

        result = {
            'coding_standard': coding_standard,
            'coding_standard_name': coding_standards.get(coding_standard, 'Unknown'),
            'information_transfer_capability': info_transfer_cap,
            'information_transfer_capability_name': transfer_caps.get(info_transfer_cap, 'Unknown'),
        }

        if len(data) >= 2:
            transfer_mode = (data[1] >> 5) & 0x03
            transfer_rate = data[1] & 0x1F

            transfer_modes = {
                0: "Circuit mode",
                1: "Packet mode",
            }

            result['transfer_mode'] = transfer_mode
            result['transfer_mode_name'] = transfer_modes.get(transfer_mode, 'Unknown')
            result['transfer_rate'] = transfer_rate

        if len(data) >= 3:
            result['layer1_identifier'] = data[2] & 0x7F

        return result

    def _parse_cause(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 2:
            return {'error': 'Cause data too short'}

        coding_standard = (data[0] >> 6) & 0x03
        location = data[0] & 0x0F
        cause_value = data[1] & 0x7F

        causes = {
            1: "Unassigned (unallocated) number",
            3: "No route to destination",
            6: "Channel unacceptable",
            16: "Normal call clearing",
            17: "User busy",
            18: "No user responding",
            19: "User alerting, no answer",
            21: "Call rejected",
            22: "Number changed",
            27: "Destination out of order",
            28: "Invalid number format (address incomplete)",
            31: "Normal, unspecified",
            34: "No circuit/channel available",
            41: "Temporary failure",
            42: "Switching equipment congestion",
            44: "Requested circuit/channel not available",
            47: "Resource unavailable, unspecified",
            57: "Bearer capability not authorized",
            58: "Bearer capability not presently available",
            65: "Service/option not available",
            69: "Requested facility not subscribed",
            88: "Incompatible destination",
            95: "Invalid message, unspecified",
            96: "Mandatory information element missing",
            97: "Message type non-existent or not implemented",
            99: "Information element non-existent or not implemented",
            100: "Invalid information element contents",
            101: "Message not compatible with call state",
            111: "Protocol error, unspecified",
            127: "Interworking, unspecified",
        }

        result = {
            'coding_standard': coding_standard,
            'location': location,
            'cause_value': cause_value,
            'cause_name': causes.get(cause_value, 'Unknown'),
        }

        if len(data) > 2:
            diag_ies = self.parse_tlv_list(data[2:])
            if diag_ies:
                result['diagnostics'] = diag_ies

        return result

    def _parse_call_state(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 1:
            return {'error': 'Call state data too short'}

        call_states = {
            0: "Null state",
            1: "Call initiated",
            2: "Overlap sending",
            3: "Outgoing call proceeding",
            4: "Call delivered",
            6: "Call present",
            7: "Call received",
            8: "Connect request",
            9: "Incoming call proceeding",
            10: "Active",
            11: "Disconnect request",
            12: "Disconnect indication",
            14: "Release request",
            15: "Call abort",
            19: "Overlap receiving",
        }

        return {
            'call_state': data[0] & 0x1F,
            'call_state_name': call_states.get(data[0] & 0x1F, 'Unknown'),
        }

    def _parse_progress_indicator(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 2:
            return {'error': 'Progress indicator data too short'}

        coding_standard = (data[0] >> 6) & 0x03
        location = data[0] & 0x0F
        progress_desc = data[1]

        descriptions = {
            1: "Call is not end-to-end ISDN; further call progress information may be available in-band",
            2: "Destination address is non-ISDN",
            3: "Origination address is non-ISDN",
            4: "Call has returned to the ISDN",
            5: "Interworking has occurred and has resulted in a telecommunications service change",
            8: "In-band information or appropriate pattern now available",
        }

        return {
            'coding_standard': coding_standard,
            'location': location,
            'progress_description': progress_desc,
            'progress_description_name': descriptions.get(progress_desc, 'Unknown'),
        }

    def _parse_signal(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 1:
            return {'error': 'Signal data too short'}

        signals = {
            0: "Dial tone on",
            1: "Ring back tone on",
            2: "Intercept tone on",
            3: "Network congestion tone on",
            4: "Busy tone on",
            5: "Confirm tone on",
            6: "Answer tone on",
            7: "Call waiting tone on",
            32: "Dial tone off",
            33: "Ring back tone off",
            34: "Intercept tone off",
            35: "Network congestion tone off",
            36: "Busy tone off",
            37: "Confirm tone off",
            38: "Answer tone off",
            39: "Call waiting tone off",
            63: "Alerting off",
        }

        return {
            'signal_value': data[0],
            'signal_name': signals.get(data[0], 'Unknown'),
        }

    def _parse_user_user(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 1:
            return {'error': 'User-User data too short'}

        protocol_discriminator = data[0] & 0x0F
        user_info = data[1:] if len(data) > 1 else b''

        pd_names = {
            0: "User-to-user information",
            1: "Reserved for public network",
            2: "X.213/ISO 8348-add.1",
            3: "Reserved for packet data",
            4: "X.200/X.220 ISO protocol",
            5: "Reserved for national use",
            6: "Reserved for national use",
            7: "User-to-user information layer 3",
            9: "Internet Protocol (IP)",
            10: "Point-to-Point Protocol (PPP)",
        }

        result = {
            'protocol_discriminator': protocol_discriminator,
            'protocol_discriminator_name': pd_names.get(protocol_discriminator, 'Unknown'),
            'user_data': user_info.hex().upper(),
            'user_data_length': len(user_info),
        }

        try:
            decoded = user_info.decode('utf-8', errors='replace')
            if any(c.isprintable() for c in decoded):
                result['user_data_text'] = decoded
        except Exception:
            pass

        return result

    def _parse_time(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 7:
            return {'error': 'Time data too short'}

        year = self._decode_bcd_digits(data[0:1])
        month = self._decode_bcd_digits(data[1:2])
        day = self._decode_bcd_digits(data[2:3])
        hour = self._decode_bcd_digits(data[3:4])
        minute = self._decode_bcd_digits(data[4:5])
        second = self._decode_bcd_digits(data[5:6])
        timezone = data[6] & 0x7F
        timezone_dir = '+' if (data[6] & 0x80) == 0 else '-'

        return {
            'year': f'20{year}',
            'month': month,
            'day': day,
            'hour': hour,
            'minute': minute,
            'second': second,
            'timezone': f'{timezone_dir}{timezone}',
            'formatted': f'20{year}-{month}-{day} {hour}:{minute}:{second} {timezone_dir}{timezone}',
        }

    def _parse_network_facility(self, data: bytes) -> Dict[str, Any]:
        result = {
            'raw': data.hex().upper(),
            'length': len(data),
        }

        try:
            nested = self.parse_tlv_list(data)
            if nested:
                result['nested_ies'] = nested
        except Exception as e:
            result['parse_error'] = str(e)

        return result

    def _parse_cipher_mode_setting(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 1:
            return {'error': 'Cipher mode setting data too short'}

        algorithm = (data[0] >> 3) & 0x07
        modes = {
            0: "No ciphering",
            1: "A5/1",
            2: "A5/2",
            3: "A5/3",
            4: "A5/4",
            5: "A5/5",
            6: "A5/6",
            7: "A5/7",
        }

        return {
            'algorithm': algorithm,
            'algorithm_name': modes.get(algorithm, 'Unknown'),
            'raw_value': data[0],
        }

    def _parse_location_area_identification(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 5:
            return {'error': 'LAI data too short'}

        mcc_digits = []
        mcc_digits.append(data[0] & 0x0F)
        mcc_digits.append((data[0] >> 4) & 0x0F)
        mcc_digits.append(data[1] & 0x0F)
        mcc = ''.join(str(d) for d in mcc_digits if d != 0xF)

        mnc_digits = []
        mnc_digits.append((data[1] >> 4) & 0x0F)
        mnc_digits.append(data[2] & 0x0F)
        mnc_digits.append((data[2] >> 4) & 0x0F)
        mnc = ''.join(str(d) for d in mnc_digits if d != 0xF)

        lac = (data[3] << 8) | data[4]

        return {
            'mcc': mcc,
            'mnc': mnc,
            'lac': lac,
            'lac_hex': f'{lac:04X}',
            'full': f'{mcc}-{mnc}-{lac:04X}',
        }

    def _parse_mobile_identity(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 1:
            return {'error': 'Mobile identity data too short'}

        type_of_identity = (data[0] >> 5) & 0x07
        odd_even = (data[0] >> 4) & 0x01

        identity_types = {
            0: "No Identity",
            1: "IMSI",
            2: "IMEI",
            3: "IMEISV",
            4: "TMSI",
            5: "TMSI/P-TMSI",
        }

        result = {
            'type_of_identity': type_of_identity,
            'type_of_identity_name': identity_types.get(type_of_identity, 'Unknown'),
            'odd_even': odd_even,
            'raw': data.hex().upper(),
        }

        if type_of_identity == 1:
            digits = []
            for i in range(1, len(data)):
                digits.append(data[i] & 0x0F)
                digits.append((data[i] >> 4) & 0x0F)
            imsi_digits = []
            for d in digits:
                if d == 0xF:
                    break
                imsi_digits.append(str(d))
            result['imsi'] = ''.join(imsi_digits)

        elif type_of_identity in [2, 3]:
            digits = []
            for i in range(1, len(data)):
                digits.append(data[i] & 0x0F)
                digits.append((data[i] >> 4) & 0x0F)
            imei_digits = []
            for d in digits:
                if d == 0xF and type_of_identity == 2:
                    break
                if len(imei_digits) >= (15 if type_of_identity == 2 else 16):
                    break
                imei_digits.append(str(d))
            result['imei' if type_of_identity == 2 else 'imeisv'] = ''.join(imei_digits)

        elif type_of_identity in [4, 5]:
            if len(data) >= 5:
                tmsi = (data[1] << 24) | (data[2] << 16) | (data[3] << 8) | data[4]
                result['tmsi'] = f'{tmsi:08X}'

        return result

    def _parse_ms_classmark(self, data: bytes, iei: int) -> Dict[str, Any]:
        if len(data) < 1:
            return {'error': 'Classmark data too short'}

        result = {
            'raw': data.hex().upper(),
            'classmark_type': 'Classmark 1' if iei == 0x29 else ('Classmark 2' if iei == 0x1F else 'Classmark 3'),
        }

        if iei == 0x29:
            result['rf_power_capability'] = data[0] & 0x07
            result['power_capability_db'] = {0: '39 dBm', 1: '37 dBm', 2: '35 dBm', 3: '33 dBm',
                                              4: '29 dBm', 5: '27 dBm', 6: '23 dBm', 7: '?'}[result['rf_power_capability']]
            if len(data) >= 2:
                result['a5_1'] = (data[1] >> 7) & 0x01
                result['a5_2'] = (data[1] >> 6) & 0x01
                result['a5_3'] = (data[1] >> 5) & 0x01
                result['a5_4'] = (data[1] >> 4) & 0x01
                result['a5_5'] = (data[1] >> 3) & 0x01
                result['a5_6'] = (data[1] >> 2) & 0x01
                result['a5_7'] = (data[1] >> 1) & 0x01
                result['classmark_3_supported'] = data[1] & 0x01

        elif iei == 0x1F:
            if len(data) >= 2:
                result['revision_level'] = (data[1] >> 6) & 0x03
                result['es_ind'] = (data[1] >> 5) & 0x01
                result['a5_1'] = (data[1] >> 4) & 0x01
                result['rf_power_capability'] = data[1] & 0x07
            if len(data) >= 3:
                result['p_s_r'] = (data[2] >> 7) & 0x01
                result['ss_screaming_ind'] = (data[2] >> 6) & 0x01
                result['sm_capability'] = (data[2] >> 5) & 0x01
                result['vbs'] = (data[2] >> 4) & 0x01
                result['vgcs'] = (data[2] >> 3) & 0x01
                result['fc'] = (data[2] >> 2) & 0x01
                result['cm3'] = (data[2] >> 1) & 0x01
                result['lcsva'] = data[2] & 0x01
            if len(data) >= 4:
                result['a5_2'] = (data[3] >> 7) & 0x01
                result['a5_3'] = (data[3] >> 6) & 0x01
                result['a5_4'] = (data[3] >> 5) & 0x01
                result['a5_5'] = (data[3] >> 4) & 0x01
                result['a5_6'] = (data[3] >> 3) & 0x01
                result['a5_7'] = (data[3] >> 2) & 0x01

        return result

    def _parse_identity_type(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 1:
            return {'error': 'Identity type data too short'}

        identity_type = data[0] & 0x0F
        identity_types = {
            0: "IMSI",
            1: "IMEI",
            2: "IMEISV",
            3: "TMSI",
            4: "TMSI/P-TMSI",
        }

        return {
            'identity_type': identity_type,
            'identity_type_name': identity_types.get(identity_type, 'Unknown'),
            'raw_value': data[0],
        }

    def _parse_imeisv(self, data: bytes) -> Dict[str, Any]:
        digits = []
        for i in range(len(data)):
            digits.append(data[i] & 0x0F)
            digits.append((data[i] >> 4) & 0x0F)

        imeisv_digits = []
        for d in digits:
            if d == 0xF:
                break
            if len(imeisv_digits) >= 16:
                break
            imeisv_digits.append(str(d))

        return {
            'imeisv': ''.join(imeisv_digits),
            'raw': data.hex().upper(),
        }

    def _parse_cell_identifier(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 2:
            return {'error': 'Cell ID data too short'}

        cell_id = (data[0] << 8) | data[1]
        return {
            'cell_id': cell_id,
            'cell_id_hex': f'{cell_id:04X}',
        }

    def _parse_channel_needed(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 1:
            return {'error': 'Channel needed data too short'}

        channel = data[0] & 0x03
        channels = {
            0: "Any channel",
            1: "SDCCH",
            2: "TCH/F",
            3: "TCH/H",
        }

        return {
            'channel': channel,
            'channel_name': channels.get(channel, 'Unknown'),
            'raw_value': data[0],
        }

    def _parse_drx_parameter(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 1:
            return {'error': 'DRX parameter data too short'}

        non_drx_timer = data[0] & 0x07
        split_pg_cycle = (data[0] >> 3) & 0x01
        cnl_flag = (data[0] >> 4) & 0x01
        tmsi_presence = (data[0] >> 5) & 0x01
        drx_cycle_length = (data[0] >> 6) & 0x03

        non_drx_timers = {0: "2 sec", 1: "4 sec", 2: "8 sec", 3: "16 sec",
                          4: "32 sec", 5: "64 sec", 6: "64 sec", 7: "64 sec"}
        drx_cycles = {0: "6", 1: "9", 2: "12", 3: "16"}

        return {
            'non_drx_timer': non_drx_timer,
            'non_drx_timer_name': non_drx_timers.get(non_drx_timer, 'Unknown'),
            'split_pg_cycle': split_pg_cycle,
            'cnl_flag': cnl_flag,
            'tmsi_presence': tmsi_presence,
            'drx_cycle_length': drx_cycle_length,
            'drx_cycle_length_name': drx_cycles.get(drx_cycle_length, 'Unknown'),
            'raw_value': data[0],
        }

    def _parse_tmsi_status(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 1:
            return {'error': 'TMSI status data too short'}

        tmsi_status = data[0] & 0x01
        return {
            'tmsi_status': tmsi_status,
            'tmsi_status_name': 'TMSI present' if tmsi_status == 1 else 'No TMSI present',
            'raw_value': data[0],
        }

    def _parse_priority(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 1:
            return {'error': 'Priority data too short'}

        priority = data[0] & 0x0F
        priorities = {
            0: "Level 1",
            1: "Level 2",
            2: "Level 3",
            3: "Level 4",
        }

        return {
            'priority': priority,
            'priority_name': priorities.get(priority, 'Unknown'),
            'raw_value': data[0],
        }

    def _parse_ms_features(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 1:
            return {'error': 'MS features data too short'}

        result = {
            'raw': data.hex().upper(),
        }

        if len(data) >= 1:
            result['var_ind'] = (data[0] >> 7) & 0x01
            result['ps_inter_rat_ho'] = (data[0] >> 6) & 0x01
            result['geran_iu_mode'] = (data[0] >> 5) & 0x01
            result['ms_cr_utra'] = (data[0] >> 4) & 0x01
            result['cs_over_ps'] = (data[0] >> 3) & 0x01
            result['emc'] = (data[0] >> 2) & 0x01
            result['msc'] = (data[0] >> 1) & 0x01
            result['ms_ra'] = data[0] & 0x01

        return result

    def _parse_additional_update_type(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 1:
            return {'error': 'Additional update type data too short'}

        update_type = data[0] & 0x07
        follow_on_request = (data[0] >> 3) & 0x01
        double_transmission = (data[0] >> 4) & 0x01

        update_types = {
            0: "Normal",
            1: "SGSN Context Request",
            2: "Combined IMSI Attach",
            3: "Periodic",
        }

        return {
            'update_type': update_type,
            'update_type_name': update_types.get(update_type, 'Unknown'),
            'follow_on_request': follow_on_request,
            'double_transmission': double_transmission,
            'raw_value': data[0],
        }

    def _parse_location_updating_type(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 1:
            return {'error': 'Location updating type data too short'}

        update_type = data[0] & 0x07
        follow_on_request = (data[0] >> 3) & 0x01
        ciphering = (data[0] >> 5) & 0x01

        update_types = {
            0: "Normal Location Updating",
            1: "IMSI Attach",
            2: "IMSI Detach",
            3: "Periodic Updating",
        }

        return {
            'update_type': update_type,
            'update_type_name': update_types.get(update_type, 'Unknown'),
            'follow_on_request': follow_on_request,
            'ciphering_required': ciphering,
            'raw_value': data[0],
        }

