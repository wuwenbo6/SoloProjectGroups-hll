import struct
from dataclasses import dataclass, field
from typing import List, Dict, Optional

MESSAGE_TYPES = {
    0x01: 'ALERTING',
    0x02: 'CALL PROCEEDING',
    0x03: 'PROGRESS',
    0x05: 'SETUP',
    0x07: 'CONNECT',
    0x08: 'SETUP ACKNOWLEDGE',
    0x09: 'CONNECT ACKNOWLEDGE',
    0x0D: 'USER INFORMATION',
    0x0F: 'CONNECT ACKNOWLEDGE',
    0x20: 'HOLD',
    0x21: 'HOLD ACKNOWLEDGE',
    0x22: 'HOLD REJECT',
    0x24: 'RETRIEVE',
    0x25: 'RETRIEVE ACKNOWLEDGE',
    0x26: 'RETRIEVE REJECT',
    0x27: 'SUSPEND',
    0x28: 'SUSPEND ACKNOWLEDGE',
    0x29: 'SUSPEND REJECT',
    0x2A: 'RESUME',
    0x2B: 'RESUME ACKNOWLEDGE',
    0x2C: 'RESUME REJECT',
    0x2D: 'CONGESTION CONTROL',
    0x30: 'INFORMATION',
    0x31: 'NOTIFY',
    0x32: 'STATUS ENQUIRY',
    0x33: 'STATUS',
    0x3A: 'FACILITY',
    0x3C: 'REGISTER',
    0x3D: 'REGISTER ACKNOWLEDGE',
    0x3E: 'REGISTER REJECT',
    0x45: 'DISCONNECT',
    0x46: 'RELEASE',
    0x4A: 'RELEASE COMPLETE',
    0x50: 'SEGMENT',
    0x51: 'FACILITY ACKNOWLEDGE',
    0x52: 'FACILITY REJECT',
    0x53: 'NOTIFY ACKNOWLEDGE',
    0x54: 'STATUS ACKNOWLEDGE',
    0x55: 'INFORMATION ACKNOWLEDGE',
    0x56: 'USER INFORMATION ACKNOWLEDGE',
    0x57: 'CONGESTION CONTROL ACKNOWLEDGE',
    0x58: 'SEGMENT ACKNOWLEDGE',
    0x59: 'REGISTER COMPLETE',
    0x5A: 'RELEASE COMPLETE',
    0x5B: 'DISCONNECT ACKNOWLEDGE',
    0x60: 'KEYPAD FACILITY',
    0x61: 'KEYPAD FACILITY ACKNOWLEDGE',
    0x7C: 'ESCAPE FOR EXTENSION',
}

IE_TYPES = {
    0x04: 'Bearer Capability',
    0x08: 'Cause',
    0x0C: 'Call Identity',
    0x10: 'Channel Identification',
    0x14: 'Facility',
    0x18: 'Progress Indicator',
    0x1C: 'Network Specific Facility',
    0x1E: 'Notification Indicator',
    0x20: 'Display',
    0x28: 'Date/Time',
    0x2C: 'Keypad Facility',
    0x34: 'User-user',
    0x3C: 'Connect Sub-address',
    0x40: 'Called Party Number',
    0x44: 'Called Party Sub-address',
    0x48: 'Calling Party Number',
    0x4C: 'Calling Party Sub-address',
    0x50: 'Redirecting Number',
    0x54: 'Redirecting Sub-address',
    0x58: 'Low Layer Compatibility',
    0x5C: 'High Layer Compatibility',
    0x60: 'Echo Control Information',
    0x70: 'Calling Party Category',
    0x71: 'Transit Network Selection',
    0x72: 'Restart Indicator',
    0x73: 'Information Rate',
    0x74: 'End-to-End Transit Delay',
    0x75: 'Transit Delay Selection and Indication',
    0x76: 'Packet Layer Binary Parameters',
    0x77: 'Packet Size',
    0x78: 'Window Size',
    0x79: 'Priority',
    0x7A: 'Cause',
    0x7B: 'Link Identification',
    0x7C: 'Feature Activation',
    0x7D: 'Feature Indication',
    0x7E: 'Service Profile Identification',
    0x7F: 'Extension',
}

CAUSE_VALUES = {
    0x01: 'Unassigned (unallocated) number',
    0x02: 'No route to specified transit network',
    0x03: 'No route to destination',
    0x06: 'Channel unacceptable',
    0x07: 'Call awarded and being delivered in an established channel',
    0x08: 'Pre-emption',
    0x09: 'Pre-emption - circuit reserved for reuse',
    0x10: 'Normal call clearing',
    0x11: 'User busy',
    0x12: 'No user responding',
    0x13: 'No answer from user (user alerted)',
    0x14: 'Subscriber absent',
    0x15: 'Call rejected',
    0x16: 'Number changed',
    0x17: 'Non-selected user clearing',
    0x19: 'Destination out of order',
    0x1A: 'Invalid number format (address incomplete)',
    0x1B: 'Facility rejected',
    0x1C: 'Response to STATUS ENQUIRY',
    0x1E: 'Normal, unspecified',
    0x22: 'No circuit/channel available',
    0x23: 'No user responding',
    0x25: 'Maintenance action required',
    0x26: 'Pre-emption',
    0x29: 'Temporary failure',
    0x2A: 'Switching equipment congestion',
    0x2B: 'Access information discarded',
    0x2C: 'Requested circuit/channel not available',
    0x2E: 'Resources unavailable, unspecified',
    0x2F: 'Quality of service unavailable',
    0x31: 'Requested facility not subscribed',
    0x32: 'Outgoing calls barred within CUG',
    0x33: 'Incoming calls barred within CUG',
    0x35: 'Bearer capability not authorised',
    0x39: 'Bearer capability not presently available',
    0x3E: 'Service or option not available, unspecified',
    0x41: 'Bearer capability not implemented',
    0x42: 'Channel type not implemented',
    0x45: 'Facility not implemented',
    0x46: 'Only restricted digital information bearer capability is available',
    0x4E: 'Service or option not implemented, unspecified',
    0x51: 'Invalid call reference value',
    0x52: 'Identified channel does not exist',
    0x53: 'Call identity in use',
    0x54: 'No call suspended',
    0x55: 'Call having the requested call identity has been cleared',
    0x56: 'User not member of CUG',
    0x58: 'Incompatible destination',
    0x59: 'Non-existent CUG',
    0x5B: 'Invalid transit network selection',
    0x5D: 'Invalid message, unspecified',
    0x5E: 'Mandatory information element is missing',
    0x5F: 'Message type non-existent or not implemented',
    0x60: 'Message type not compatible with call state',
    0x61: 'Information element non-existent or not implemented',
    0x62: 'Invalid information element contents',
    0x63: 'Message not compatible with call state',
    0x64: 'Recovery on timer expiry',
    0x6F: 'Protocol error, unspecified',
    0x7F: 'Internetworking, unspecified',
}

BEARER_CAPABILITY_CODING_STANDARDS = {
    0x0: 'ITU-T standardized coding',
    0x1: 'ISO/IEC standard',
    0x2: 'National standard',
    0x3: 'Standard identified by the information transfer attribute',
}

BEARER_CAPABILITY_ITC = {
    0x0: 'Speech',
    0x1: 'Unrestricted digital information',
    0x2: 'Restricted digital information',
    0x3: '3.1 kHz audio',
    0x4: 'Unrestricted digital information with tones/announcements',
    0x5: 'Video',
    0x7: 'Alternate speech/data',
    0x8: 'Alternate video/data',
}

NUMBERING_PLAN = {
    0x0: 'Unknown',
    0x1: 'ISDN/telephony numbering plan (E.164/E.163)',
    0x2: 'Data numbering plan (X.121)',
    0x3: 'Telex numbering plan (F.69)',
    0x4: 'National numbering plan',
    0x5: 'Private numbering plan',
    0x8: 'Numbering plan for international use, according to ITU-T recommendation E.214',
}

NATURE_OF_ADDRESS = {
    0x0: 'Unknown',
    0x1: 'International number',
    0x2: 'National number',
    0x3: 'Network specific number',
    0x4: 'Subscriber number',
    0x5: 'Reserved',
    0x6: 'Abbreviated number',
    0x7: 'Reserved for extension',
}


@dataclass
class InformationElement:
    ie_type: int
    ie_name: str
    length: int
    data: bytes
    decoded_data: Dict = field(default_factory=dict)


@dataclass
class Q931Message:
    protocol_discriminator: int
    call_reference_length: int
    call_reference_value: int
    call_reference_flag: int
    message_type: int
    message_name: str
    information_elements: List[InformationElement]
    raw_data: bytes
    called_party_number: Optional[str] = None
    bearer_capability: Optional[Dict] = None
    cause_value: Optional[Dict] = None


def decode_number(data: bytes, length: int) -> str:
    number = ''
    for i in range(length):
        byte = data[i]
        low_nibble = byte & 0x0F
        high_nibble = (byte >> 4) & 0x0F
        number += str(low_nibble)
        if high_nibble != 0x0F:
            number += str(high_nibble)
    return number


def decode_called_party_number(ie: InformationElement) -> Dict:
    result = {}
    data = ie.data
    
    ext1 = (data[0] >> 7) & 0x01
    nature_of_address = (data[0] >> 3) & 0x07
    result['nature_of_address'] = NATURE_OF_ADDRESS.get(nature_of_address, f'Unknown ({nature_of_address})')
    
    numbering_plan = data[0] & 0x07
    result['numbering_plan'] = NUMBERING_PLAN.get(numbering_plan, f'Unknown ({numbering_plan})')
    
    number_bytes = data[1:]
    number = decode_number(number_bytes, len(number_bytes))
    result['number'] = number
    
    return result


def decode_bearer_capability(ie: InformationElement) -> Dict:
    result = {}
    data = ie.data
    
    if len(data) < 1:
        return result
    
    ext1 = (data[0] >> 7) & 0x01
    coding_standard = (data[0] >> 5) & 0x03
    itc = data[0] & 0x1F
    
    result['coding_standard'] = BEARER_CAPABILITY_CODING_STANDARDS.get(coding_standard, f'Unknown ({coding_standard})')
    result['information_transfer_capability'] = BEARER_CAPABILITY_ITC.get(itc, f'Unknown ({itc})')
    
    if len(data) >= 2:
        ext2 = (data[1] >> 7) & 0x01
        transfer_mode = (data[1] >> 4) & 0x07
        transfer_rate = data[1] & 0x0F
        
        result['transfer_mode'] = 'Circuit mode' if transfer_mode == 0 else 'Packet mode' if transfer_mode == 2 else 'Unknown'
        
        rates = {
            0x0: 'Packet mode',
            0x1: '64 kbit/s',
            0x2: '2x64 kbit/s',
            0x4: '384 kbit/s',
            0x5: '1536 kbit/s',
            0x6: '1920 kbit/s',
            0x7: 'Multirate',
            0x8: '56 kbit/s',
            0x9: '64 kbit/s preferred',
            0xA: '2x64 kbit/s preferred',
            0xB: '384 kbit/s preferred',
            0xC: '1536 kbit/s preferred',
            0xD: '1920 kbit/s preferred',
            0xF: 'Multirate preferred',
        }
        result['transfer_rate'] = rates.get(transfer_rate, f'Unknown ({transfer_rate})')
    
    if len(data) >= 3:
        ext3 = (data[2] >> 7) & 0x01
        layer1_ident = data[2] & 0x7F
        protocols = {
            0x01: 'G.711 u-law',
            0x02: 'G.711 A-law',
            0x03: 'G.721 ADPCM',
            0x06: 'T.30 group 3 fax',
            0x08: 'H.221/H.242 rate adaption',
            0x09: 'H.221/H.243 rate adaption',
            0x0A: 'Non-standard rate adaption',
            0x11: 'V.120 rate adaption',
            0x12: 'V.110 rate adaption',
            0x14: 'PPP',
        }
        result['layer1_protocol'] = protocols.get(layer1_ident, f'Unknown ({layer1_ident})')
    
    return result


def decode_cause(ie: InformationElement) -> Dict:
    result = {}
    data = ie.data
    
    if len(data) < 2:
        return result
    
    result['raw_bytes'] = data.hex()
    result['length'] = len(data)
    
    ext1 = (data[0] >> 7) & 0x01
    coding_standard = (data[0] >> 5) & 0x03
    spare = (data[0] >> 4) & 0x01
    location = data[0] & 0x0F
    
    locations = {
        0x0: 'User',
        0x1: 'Private network serving the local user',
        0x2: 'Public network serving the local user',
        0x3: 'Transit network',
        0x4: 'Public network serving the remote user',
        0x5: 'Private network serving the remote user',
        0x6: 'International network',
        0x7: 'Network beyond interworking point',
    }
    result['extension_1'] = ext1
    result['coding_standard_code'] = coding_standard
    result['coding_standard'] = BEARER_CAPABILITY_CODING_STANDARDS.get(coding_standard, f'Unknown ({coding_standard})')
    result['spare'] = spare
    result['location_code'] = location
    result['location'] = locations.get(location, f'Unknown ({location})')
    
    ext2 = (data[1] >> 7) & 0x01
    cause_value = data[1] & 0x7F
    result['extension_2'] = ext2
    result['cause_value'] = cause_value
    result['cause_description'] = CAUSE_VALUES.get(cause_value, f'Unknown ({cause_value})')
    
    if len(data) > 2:
        diagnostics_data = data[2:]
        result['diagnostics_length'] = len(diagnostics_data)
        result['diagnostics_hex'] = diagnostics_data.hex()
        
        try:
            diag_str = diagnostics_data.decode('ascii', errors='replace')
            if all(c.isprintable() or c.isspace() for c in diag_str):
                result['diagnostics_ascii'] = diag_str
        except:
            pass
        
        sub_fields = {}
        diag_offset = 0
        while diag_offset < len(diagnostics_data):
            byte = diagnostics_data[diag_offset]
            diag_offset += 1
            
            if byte & 0x80:
                break
        
        if sub_fields:
            result['diagnostics_subfields'] = sub_fields
    
    recommendation = []
    if cause_value in [0x10, 0x11, 0x12, 0x13, 0x15, 0x19, 0x1A, 0x1C, 0x1E]:
        recommendation.append('Retry the call')
    if cause_value in [0x22, 0x29, 0x2A, 0x2B, 0x2C, 0x2E, 0x2F, 0x3E, 0x5D, 0x5F, 0x60, 0x61, 0x62, 0x63, 0x6F]:
        recommendation.append('Congestion - try again later')
    if cause_value in [0x01, 0x03, 0x16, 0x1A]:
        recommendation.append('Check the destination number')
    if recommendation:
        result['recommendation'] = '; '.join(recommendation)
    
    return result


def decode_display(ie: InformationElement) -> Dict:
    result = {}
    data = ie.data
    
    result['raw_bytes'] = data.hex()
    result['length'] = len(data)
    
    if len(data) < 1:
        return result
    
    coding_scheme = data[0] & 0x0F
    coding_schemes = {
        0x0: 'GSM 7-bit default alphabet',
        0x1: '8-bit data',
        0x2: 'UCS2 (16-bit)',
        0x3: 'Reserved',
        0x4: 'Reserved',
        0x5: 'Reserved',
        0x6: 'Reserved',
        0x7: 'Reserved',
    }
    result['coding_scheme_code'] = coding_scheme
    result['coding_scheme'] = coding_schemes.get(coding_scheme, f'Unknown ({coding_scheme})')
    
    if len(data) > 1:
        text_data = data[1:]
        result['text_length_bytes'] = len(text_data)
        
        if coding_scheme == 0x0:
            try:
                text = ''
                for byte in text_data:
                    if 0x20 <= byte <= 0x7E:
                        text += chr(byte)
                    else:
                        text += '?'
                result['text'] = text
            except:
                result['text_hex'] = text_data.hex()
        elif coding_scheme == 0x2:
            try:
                if len(text_data) % 2 == 0:
                    text = text_data.decode('utf-16-be', errors='replace')
                    result['text'] = text
                else:
                    result['text_hex'] = text_data.hex()
            except:
                result['text_hex'] = text_data.hex()
        else:
            try:
                text = text_data.decode('ascii', errors='replace')
                result['text'] = text
            except:
                result['text_hex'] = text_data.hex()
        
        if 'text' in result and result['text']:
            result['display_text'] = result['text']
        elif 'text_hex' in result:
            result['display_text'] = f'[Hex: {result["text_hex"]}]'
    
    return result


def decode_progress_indicator(ie: InformationElement) -> Dict:
    result = {}
    data = ie.data
    
    if len(data) < 2:
        return result
    
    result['raw_bytes'] = data.hex()
    
    ext1 = (data[0] >> 7) & 0x01
    coding_standard = (data[0] >> 5) & 0x03
    spare = (data[0] >> 4) & 0x01
    location = data[0] & 0x0F
    
    result['coding_standard'] = BEARER_CAPABILITY_CODING_STANDARDS.get(coding_standard, f'Unknown ({coding_standard})')
    result['location'] = location
    
    ext2 = (data[1] >> 7) & 0x01
    progress_desc = data[1] & 0x7F
    
    progress_descriptions = {
        0x01: 'Call is not end-to-end ISDN; further call progress information may be available in-band',
        0x02: 'Destination address is non-ISDN',
        0x03: 'Origination address is non-ISDN',
        0x04: 'Call has returned to the ISDN',
        0x05: 'In-band information or an appropriate pattern is now available',
        0x06: 'Interworking has occurred and has resulted in a telecommunications service change',
        0x07: 'Suspend/resume: call suspended and retained',
        0x08: 'Call is not end-to-end ISDN and is proceeding through additional network',
    }
    result['progress_description_code'] = progress_desc
    result['progress_description'] = progress_descriptions.get(progress_desc, f'Unknown ({progress_desc})')
    
    return result


def decode_keypad_facility(ie: InformationElement) -> Dict:
    result = {}
    data = ie.data
    
    result['raw_bytes'] = data.hex()
    result['length'] = len(data)
    
    digits = []
    for byte in data:
        digit1 = byte & 0x0F
        digit2 = (byte >> 4) & 0x0F
        
        digit_map = {
            0x0: '0', 0x1: '1', 0x2: '2', 0x3: '3', 0x4: '4',
            0x5: '5', 0x6: '6', 0x7: '7', 0x8: '8', 0x9: '9',
            0xA: '*', 0xB: '#', 0xC: 'a', 0xD: 'b', 0xE: 'c',
        }
        
        digits.append(digit_map.get(digit1, f'?{digit1}?'))
        if digit2 != 0xF:
            digits.append(digit_map.get(digit2, f'?{digit2}?'))
    
    result['digits'] = ''.join(digits)
    
    return result


FACILITY_COMPONENTS = {
    0x00: 'Null',
    0x01: 'Calling name presentation restriction',
    0x02: 'Calling name presentation allowed',
    0x03: 'Connected name presentation restriction',
    0x04: 'Connected name presentation allowed',
    0x05: 'Called name',
    0x06: 'Connected name',
    0x07: 'Calling name',
    0x08: 'Original called name',
    0x09: 'Redirecting name',
    0x0A: 'Call transfer alerting',
    0x0B: 'Call transfer active',
    0x0C: 'Conference alerting',
    0x0D: 'Conference active',
    0x0E: 'Explicit call transfer',
    0x0F: 'Explicit call transfer invocation',
    0x10: 'Call hold',
    0x11: 'Call hold acknowledge',
    0x12: 'Call hold reject',
    0x13: 'Call retrieve',
    0x14: 'Call retrieve acknowledge',
    0x15: 'Call retrieve reject',
    0x16: 'Transfer alerting',
    0x17: 'Transfer active',
    0x18: 'Three-party service',
    0x19: 'Three-party service acknowledge',
    0x1A: 'Three-party service reject',
    0x1B: 'Call waiting',
    0x1C: 'Call diversion information',
    0x1D: 'User-to-user service',
    0x1E: 'Closed user group',
    0x1F: 'Reverse charging',
    0x20: 'Advice of charge',
    0x21: 'Advice of charge charging information',
    0x22: 'Advice of charge at end of call',
    0x23: 'Advice of charge during call',
    0x24: 'Malicious call identification',
    0x25: 'User-to-user indication',
    0x26: 'Flexible alerting',
    0x27: 'Do not disturb',
    0x28: 'Calling line identification presentation',
    0x29: 'Calling line identification restriction',
    0x2A: 'Connected line identification presentation',
    0x2B: 'Connected line identification restriction',
    0x2C: 'Called line identification presentation',
    0x2D: 'Called line identification restriction',
    0x2E: 'Redirecting line identification presentation',
    0x2F: 'Redirecting line identification restriction',
    0x30: 'Subaddressing',
    0x31: 'Multiple subscriber number',
    0x32: 'Message waiting indication',
    0x33: 'Terminal portability',
    0x34: 'Terminal mobility',
    0x35: 'Personal mobility',
    0x36: 'Service profile identification',
    0x37: 'Automatic callback',
    0x38: 'Automatic recall',
    0x39: 'Call completion to busy subscriber',
    0x3A: 'Multi-level precedence and preemption',
    0x3B: 'Unstructured supplementary service data',
    0x3C: 'List services',
    0x3D: 'Service identity',
    0x3E: 'Feature activation',
    0x3F: 'Feature deactivation',
    0x40: 'Feature invocation',
    0x41: 'Feature indication',
    0x42: 'Charge advice',
    0x43: 'Hold',
    0x44: 'Retrieve',
    0x45: 'Hold acknowledge',
    0x46: 'Hold reject',
    0x47: 'Retrieve acknowledge',
    0x48: 'Retrieve reject',
    0x49: 'Forwarding information',
    0x4A: 'Service change',
    0x4B: 'Generic digit',
    0x4C: 'Generic number',
    0x4D: 'Generic name',
    0x4E: 'Generic address',
    0x4F: 'Generic notification',
}


def decode_generic_name(data: bytes) -> Dict:
    result = {}
    if len(data) < 1:
        return result
    
    ext = (data[0] >> 7) & 0x01
    type_of_name = (data[0] >> 3) & 0x0F
    spare = (data[0] >> 2) & 0x01
    name_length = data[0] & 0x03
    
    name_types = {
        0x00: 'Unknown',
        0x01: 'Reserved for network specific use',
        0x02: 'Reserved for international use',
        0x03: 'Reserved for national use',
        0x04: 'Reserved for private network use',
        0x05: 'Called name',
        0x06: 'Connected name',
        0x07: 'Calling name',
        0x08: 'Original called name',
        0x09: 'Redirecting name',
    }
    
    result['extension'] = ext
    result['type_of_name_code'] = type_of_name
    result['type_of_name'] = name_types.get(type_of_name, f'Unknown ({type_of_name})')
    result['spare'] = spare
    result['name_length'] = name_length
    
    if len(data) > 1:
        char_set = (data[1] >> 4) & 0x0F
        spare2 = data[1] & 0x0F
        
        char_sets = {
            0x00: 'GSM 7 bit default alphabet',
            0x01: '8 bit data',
            0x02: 'UCS2 (16 bit)',
        }
        
        result['character_set_code'] = char_set
        result['character_set'] = char_sets.get(char_set, f'Unknown ({char_set})')
        result['spare2'] = spare2
        
        if len(data) > 2:
            name_bytes = data[2:]
            try:
                if char_set == 0x02 and len(name_bytes) % 2 == 0:
                    name = name_bytes.decode('utf-16-be', errors='replace')
                else:
                    name = name_bytes.decode('ascii', errors='replace')
                result['name'] = name
            except:
                result['name_hex'] = name_bytes.hex()
    
    return result


def decode_generic_number(data: bytes) -> Dict:
    result = {}
    if len(data) < 3:
        return result
    
    ext = (data[0] >> 7) & 0x01
    number_type = (data[0] >> 2) & 0x1F
    odd_even = (data[0] >> 1) & 0x01
    nature_of_address = (data[1] >> 3) & 0x07
    numbering_plan = data[1] & 0x07
    presentation_ind = (data[2] >> 6) & 0x03
    screening_ind = data[2] & 0x03
    
    number_types = {
        0x00: 'Reserved',
        0x01: 'Additional called number',
        0x02: 'Additional connected number',
        0x03: 'Additional calling number',
        0x04: 'Additional original called number',
        0x05: 'Additional redirecting number',
        0x06: 'Generic number',
        0x07: 'Generic calling party number',
    }
    
    result['extension'] = ext
    result['number_type_code'] = number_type
    result['number_type'] = number_types.get(number_type, f'Unknown ({number_type})')
    result['odd_even_flag'] = 'Odd' if odd_even else 'Even'
    result['nature_of_address'] = NATURE_OF_ADDRESS.get(nature_of_address, f'Unknown ({nature_of_address})')
    result['numbering_plan'] = NUMBERING_PLAN.get(numbering_plan, f'Unknown ({numbering_plan})')
    result['presentation_indicator'] = {
        0x0: 'Presentation allowed',
        0x1: 'Presentation restricted',
        0x2: 'Number not available due to interworking',
        0x3: 'Reserved',
    }.get(presentation_ind, f'Unknown ({presentation_ind})')
    result['screening_indicator'] = {
        0x0: 'User provided, not screened',
        0x1: 'User provided, verified and passed',
        0x2: 'User provided, verified and failed',
        0x3: 'Network provided',
    }.get(screening_ind, f'Unknown ({screening_ind})')
    
    if len(data) > 3:
        number_bytes = data[3:]
        number = decode_number(number_bytes, len(number_bytes))
        result['number'] = number
    
    return result


def decode_forwarding_info(data: bytes) -> Dict:
    result = {}
    if len(data) < 1:
        return result
    
    result['raw_bytes'] = data.hex()
    
    offset = 0
    while offset < len(data):
        if offset + 2 > len(data):
            break
        
        info_type = data[offset]
        offset += 1
        info_len = data[offset]
        offset += 1
        
        if offset + info_len > len(data):
            break
        
        info_data = data[offset:offset + info_len]
        offset += info_len
        
        info_types = {
            0x00: 'Forwarding unconditional',
            0x01: 'Forwarding on busy',
            0x02: 'Forwarding on no reply',
            0x03: 'Forwarding on not reachable',
            0x04: 'Forwarding deflection',
            0x05: 'Forwarding immediate',
        }
        
        info_result = {
            'type_code': info_type,
            'type': info_types.get(info_type, f'Unknown ({info_type})'),
            'length': info_len,
            'data_hex': info_data.hex()
        }
        
        if info_len >= 3:
            nature = info_data[0] & 0x7F
            numbering = info_data[1] & 0x0F
            info_result['nature_of_address'] = NATURE_OF_ADDRESS.get(nature, f'Unknown ({nature})')
            info_result['numbering_plan'] = NUMBERING_PLAN.get(numbering, f'Unknown ({numbering})')
            if info_len > 2:
                number = decode_number(info_data[2:], len(info_data) - 2)
                info_result['forwarded_number'] = number
        
        result.setdefault('forwarding_entries', []).append(info_result)
    
    return result


def decode_call_diversion_info(data: bytes) -> Dict:
    result = {}
    if len(data) < 3:
        return result
    
    result['raw_bytes'] = data.hex()
    
    reason = data[0] & 0x7F
    reasons = {
        0x00: 'Unknown',
        0x01: 'User busy',
        0x02: 'No reply',
        0x03: 'Unconditional',
        0x04: 'Deflection',
        0x05: 'Not reachable',
        0x06: 'Mobile subscriber not reachable',
    }
    
    ext2 = (data[1] >> 7) & 0x01
    nature = (data[1] >> 3) & 0x07
    numbering = data[1] & 0x07
    
    result['diversion_reason_code'] = reason
    result['diversion_reason'] = reasons.get(reason, f'Unknown ({reason})')
    result['nature_of_address'] = NATURE_OF_ADDRESS.get(nature, f'Unknown ({nature})')
    result['numbering_plan'] = NUMBERING_PLAN.get(numbering, f'Unknown ({numbering})')
    
    if len(data) > 2:
        number_bytes = data[2:]
        number = decode_number(number_bytes, len(number_bytes))
        result['diverted_to_number'] = number
    
    return result


def decode_supplementary_service(data: bytes) -> Dict:
    result = {}
    result['raw_bytes'] = data.hex()
    
    if len(data) < 2:
        return result
    
    service_code = data[0] & 0x7F
    service_codes = {
        0x00: 'Hold',
        0x01: 'Retrieve',
        0x02: 'Call transfer',
        0x03: 'Three-party',
        0x04: 'Conference',
        0x05: 'Call waiting',
        0x06: 'Call forwarding unconditional',
        0x07: 'Call forwarding on busy',
        0x08: 'Call forwarding on no reply',
        0x09: 'Call forwarding on not reachable',
        0x0A: 'Explicit call transfer',
        0x0B: 'Call diversion',
        0x0C: 'Closed user group',
        0x0D: 'Reverse charging',
        0x0E: 'Advice of charge',
        0x0F: 'Malicious call identification',
        0x10: 'Calling line identification presentation',
        0x11: 'Calling line identification restriction',
        0x12: 'Connected line identification presentation',
        0x13: 'Connected line identification restriction',
    }
    
    result['service_code'] = service_code
    result['service_name'] = service_codes.get(service_code, f'Unknown ({service_code})')
    
    invoke_id = data[1]
    result['invoke_id'] = invoke_id
    
    if len(data) > 2:
        result['parameters_hex'] = data[2:].hex()
    
    return result


def decode_generic_digit(data: bytes) -> Dict:
    result = {}
    result['raw_bytes'] = data.hex()
    
    if len(data) < 1:
        return result
    
    ext = (data[0] >> 7) & 0x01
    mode = (data[0] >> 4) & 0x07
    type_of_digit = data[0] & 0x0F
    
    modes = {
        0x00: 'Dual tone multifrequency (DTMF)',
        0x01: 'Pulse',
        0x02: 'MF',
    }
    
    digit_types = {
        0x00: 'Account code',
        0x01: 'Authorization code',
        0x02: 'Personal identification number (PIN)',
        0x03: 'Generic digit',
    }
    
    result['extension'] = ext
    result['mode_code'] = mode
    result['mode'] = modes.get(mode, f'Unknown ({mode})')
    result['type_of_digit_code'] = type_of_digit
    result['type_of_digit'] = digit_types.get(type_of_digit, f'Unknown ({type_of_digit})')
    
    if len(data) > 1:
        digits = decode_keypad_digit(data[1:])
        result['digits'] = digits
    
    return result


def decode_keypad_digit(data: bytes) -> str:
    digits = []
    for byte in data:
        digit1 = byte & 0x0F
        digit2 = (byte >> 4) & 0x0F
        
        digit_map = {
            0x0: '0', 0x1: '1', 0x2: '2', 0x3: '3', 0x4: '4',
            0x5: '5', 0x6: '6', 0x7: '7', 0x8: '8', 0x9: '9',
            0xA: '*', 0xB: '#', 0xC: 'a', 0xD: 'b', 0xE: 'c',
            0xF: '',
        }
        
        digits.append(digit_map.get(digit1, f'?{digit1}?'))
        if digit2 != 0xF:
            digits.append(digit_map.get(digit2, f'?{digit2}?'))
    
    return ''.join(digits)


def decode_ie_component(component_type: int, data: bytes) -> Dict:
    result = {
        'component_type': f'0x{component_type:02X}',
        'component_name': FACILITY_COMPONENTS.get(component_type, f'Unknown ({component_type:02X})'),
        'raw_bytes': data.hex(),
        'length': len(data)
    }
    
    if component_type in [0x05, 0x06, 0x07, 0x08, 0x09, 0x4D]:
        result.update(decode_generic_name(data))
    elif component_type in [0x4C]:
        result.update(decode_generic_number(data))
    elif component_type in [0x49]:
        result.update(decode_forwarding_info(data))
    elif component_type in [0x1C]:
        result.update(decode_call_diversion_info(data))
    elif component_type in [0x3B, 0x40, 0x41]:
        result.update(decode_supplementary_service(data))
    elif component_type in [0x4B]:
        result.update(decode_generic_digit(data))
    
    return result


def decode_facility(ie: InformationElement, depth: int = 0) -> Dict:
    result = {}
    data = ie.data
    
    result['raw_bytes'] = data.hex()
    result['length'] = len(data)
    
    if len(data) < 1:
        return result
    
    try:
        components = []
        offset = 0
        
        while offset < len(data) and depth < 5:
            if offset + 1 >= len(data):
                break
            
            component_type = data[offset]
            offset += 1
            
            if offset >= len(data):
                break
            
            length = data[offset]
            offset += 1
            
            if offset + length > len(data):
                length = len(data) - offset
            
            component_data = data[offset:offset + length]
            offset += length
            
            try:
                decoded_component = decode_ie_component(component_type, component_data)
                components.append(decoded_component)
            except Exception as e:
                components.append({
                    'component_type': f'0x{component_type:02X}',
                    'component_name': FACILITY_COMPONENTS.get(component_type, f'Unknown ({component_type:02X})'),
                    'raw_bytes': component_data.hex(),
                    'length': length,
                    'parse_error': str(e)
                })
            
            try:
                nested_ies = []
                sub_offset = 0
                while sub_offset < len(component_data) and depth < 4:
                    sub_ie, new_sub_offset = decode_information_element(component_data, sub_offset, depth + 1)
                    if sub_ie is None:
                        break
                    nested_ies.append({
                        'ie_type': f'0x{sub_ie.ie_type:02X}',
                        'ie_name': sub_ie.ie_name,
                        'length': sub_ie.length,
                        'data_hex': sub_ie.data.hex(),
                        'decoded_data': sub_ie.decoded_data
                    })
                    sub_offset = new_sub_offset
                
                if nested_ies and components:
                    components[-1]['nested_ies'] = nested_ies
            except:
                pass
        
        if components:
            result['components'] = components
            result['component_count'] = len(components)
        
        component_types = [c.get('component_name') for c in components]
        if component_types:
            result['component_types'] = component_types
    
    except Exception as e:
        result['parse_error'] = str(e)
    
    return result


def decode_calling_party_number(ie: InformationElement) -> Dict:
    result = {}
    data = ie.data
    
    if len(data) < 2:
        return result
    
    result['raw_bytes'] = data.hex()
    
    ext1 = (data[0] >> 7) & 0x01
    nature_of_address = (data[0] >> 3) & 0x07
    numbering_plan = data[0] & 0x07
    
    result['nature_of_address'] = NATURE_OF_ADDRESS.get(nature_of_address, f'Unknown ({nature_of_address})')
    result['numbering_plan'] = NUMBERING_PLAN.get(numbering_plan, f'Unknown ({numbering_plan})')
    
    presentation_ind = (data[1] >> 6) & 0x03
    screening_ind = data[1] & 0x03
    
    presentation_indicators = {
        0x0: 'Presentation allowed',
        0x1: 'Presentation restricted',
        0x2: 'Number not available due to interworking',
        0x3: 'Reserved',
    }
    screening_indicators = {
        0x0: 'User provided, not screened',
        0x1: 'User provided, verified and passed',
        0x2: 'User provided, verified and failed',
        0x3: 'Network provided',
    }
    result['presentation_indicator'] = presentation_indicators.get(presentation_ind, f'Unknown ({presentation_ind})')
    result['screening_indicator'] = screening_indicators.get(screening_ind, f'Unknown ({screening_ind})')
    
    if len(data) > 2:
        number_bytes = data[2:]
        number = decode_number(number_bytes, len(number_bytes))
        result['number'] = number
    
    return result


def decode_information_element(data: bytes, offset: int, depth: int = 0) -> (InformationElement, int):
    if offset >= len(data):
        return None, offset
    
    if depth > 5:
        return None, offset
    
    ie_type = data[offset]
    offset += 1
    
    if offset >= len(data):
        return None, offset
    
    length = data[offset]
    offset += 1
    
    if offset + length > len(data):
        length = len(data) - offset
    
    ie_data = data[offset:offset + length]
    offset += length
    
    ie_name = IE_TYPES.get(ie_type, f'Unknown IE ({ie_type:02X})')
    
    ie = InformationElement(
        ie_type=ie_type,
        ie_name=ie_name,
        length=length,
        data=ie_data,
        decoded_data={}
    )
    
    if ie_type == 0x40:
        ie.decoded_data = decode_called_party_number(ie)
    elif ie_type == 0x48:
        ie.decoded_data = decode_calling_party_number(ie)
    elif ie_type == 0x04:
        ie.decoded_data = decode_bearer_capability(ie)
    elif ie_type == 0x08 or ie_type == 0x7A:
        ie.decoded_data = decode_cause(ie)
    elif ie_type == 0x20:
        ie.decoded_data = decode_display(ie)
    elif ie_type == 0x18:
        ie.decoded_data = decode_progress_indicator(ie)
    elif ie_type == 0x2C or ie_type == 0x60:
        ie.decoded_data = decode_keypad_facility(ie)
    elif ie_type == 0x14:
        ie.decoded_data = decode_facility(ie, depth + 1)
    
    return ie, offset


def decode_facility(ie: InformationElement, depth: int = 0) -> Dict:
    result = {}
    data = ie.data
    
    result['raw_bytes'] = data.hex()
    result['length'] = len(data)
    
    if len(data) < 1:
        return result
    
    try:
        nested_ies = []
        offset = 0
        while offset < len(data):
            sub_ie, new_offset = decode_information_element(data, offset, depth + 1)
            if sub_ie is None:
                break
            nested_ies.append({
                'ie_type': f'0x{sub_ie.ie_type:02X}',
                'ie_name': sub_ie.ie_name,
                'length': sub_ie.length,
                'data_hex': sub_ie.data.hex(),
                'decoded_data': sub_ie.decoded_data
            })
            offset = new_offset
        
        if nested_ies:
            result['nested_ies'] = nested_ies
    except Exception as e:
        result['parse_error'] = str(e)
    
    return result


def decode_all_ies_recursive(message: Q931Message) -> Dict:
    result = {
        'all_ies': [],
        'summary': {
            'total_ies': 0,
            'decoded_ies': 0,
            'nested_ies': 0
        },
        'extracted_fields': {}
    }
    
    def process_ie(ie, parent_path=''):
        path = f"{parent_path}/{ie.ie_name}" if parent_path else ie.ie_name
        
        ie_info = {
            'path': path,
            'ie_type': f'0x{ie.ie_type:02X}',
            'ie_name': ie.ie_name,
            'length': ie.length,
            'data_hex': ie.data.hex(),
            'decoded_data': ie.decoded_data,
            'has_subfields': len(ie.decoded_data) > 0
        }
        
        result['all_ies'].append(ie_info)
        result['summary']['total_ies'] += 1
        
        if ie.decoded_data:
            result['summary']['decoded_ies'] += 1
        
        if ie.ie_type == 0x40 and 'number' in ie.decoded_data:
            result['extracted_fields']['called_party_number'] = ie.decoded_data['number']
        elif ie.ie_type == 0x48 and 'number' in ie.decoded_data:
            result['extracted_fields']['calling_party_number'] = ie.decoded_data['number']
        elif ie.ie_type == 0x04:
            result['extracted_fields']['bearer_capability'] = ie.decoded_data
        elif ie.ie_type in [0x08, 0x7A]:
            result['extracted_fields']['cause'] = ie.decoded_data
        elif ie.ie_type == 0x20 and 'display_text' in ie.decoded_data:
            result['extracted_fields']['display_text'] = ie.decoded_data['display_text']
        
        if 'nested_ies' in ie.decoded_data:
            result['summary']['nested_ies'] += len(ie.decoded_data['nested_ies'])
    
    for ie in message.information_elements:
        process_ie(ie)
    
    return result


def decode_q931_message(hex_data: str) -> Q931Message:
    raw_data = bytes.fromhex(hex_data.strip().replace(' ', '').replace(':', ''))
    
    if len(raw_data) < 3:
        raise ValueError('Invalid Q.931 message: too short')
    
    protocol_discriminator = raw_data[0]
    call_reference_length = raw_data[1]
    
    if call_reference_length == 0 or 2 + call_reference_length > len(raw_data):
        raise ValueError('Invalid Q.931 message: invalid call reference length')
    
    flag_byte = raw_data[2]
    call_reference_flag = (flag_byte >> 7) & 0x01
    call_reference_value = flag_byte & 0x7F
    
    if call_reference_length > 1:
        for i in range(3, 2 + call_reference_length):
            call_reference_value = (call_reference_value << 8) | raw_data[i]
    
    message_type_offset = 2 + call_reference_length
    if message_type_offset >= len(raw_data):
        raise ValueError('Invalid Q.931 message: missing message type')
    
    message_type = raw_data[message_type_offset]
    message_name = MESSAGE_TYPES.get(message_type, f'Unknown ({message_type:02X})')
    
    offset = message_type_offset + 1
    information_elements = []
    
    while offset < len(raw_data):
        ie, new_offset = decode_information_element(raw_data, offset)
        if ie is None:
            break
        information_elements.append(ie)
        offset = new_offset
    
    called_party_number = None
    bearer_capability = None
    cause_value = None
    
    for ie in information_elements:
        if ie.ie_type == 0x40 and 'number' in ie.decoded_data:
            called_party_number = ie.decoded_data['number']
        elif ie.ie_type == 0x04:
            bearer_capability = ie.decoded_data
        elif (ie.ie_type == 0x08 or ie.ie_type == 0x7A) and 'cause_value' in ie.decoded_data:
            cause_value = ie.decoded_data
    
    return Q931Message(
        protocol_discriminator=protocol_discriminator,
        call_reference_length=call_reference_length,
        call_reference_value=call_reference_value,
        call_reference_flag=call_reference_flag,
        message_type=message_type,
        message_name=message_name,
        information_elements=information_elements,
        raw_data=raw_data,
        called_party_number=called_party_number,
        bearer_capability=bearer_capability,
        cause_value=cause_value,
    )


def message_to_dict(msg: Q931Message) -> Dict:
    recursive_parse = decode_all_ies_recursive(msg)
    
    return {
        'protocol_discriminator': msg.protocol_discriminator,
        'call_reference_length': msg.call_reference_length,
        'call_reference_value': msg.call_reference_value,
        'call_reference_flag': msg.call_reference_flag,
        'message_type': f'0x{msg.message_type:02X}',
        'message_name': msg.message_name,
        'called_party_number': msg.called_party_number,
        'bearer_capability': msg.bearer_capability,
        'cause_value': msg.cause_value,
        'raw_hex': msg.raw_data.hex(),
        'recursive_parse': recursive_parse,
        'extracted_fields': recursive_parse.get('extracted_fields', {}),
        'information_elements': [
            {
                'ie_type': f'0x{ie.ie_type:02X}',
                'ie_name': ie.ie_name,
                'length': ie.length,
                'data_hex': ie.data.hex(),
                'decoded_data': ie.decoded_data,
                'has_decoded_data': len(ie.decoded_data) > 0
            }
            for ie in msg.information_elements
        ]
    }
