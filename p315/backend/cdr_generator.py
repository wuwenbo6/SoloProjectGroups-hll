from dataclasses import dataclass, field
from typing import List, Dict, Optional
from datetime import datetime
import json
import csv
import io
from q931_decoder import decode_q931_message, Q931Message, decode_all_ies_recursive


@dataclass
class CDRRecord:
    cdr_id: str
    call_id: str
    calling_party: Optional[str] = None
    called_party: Optional[str] = None
    start_time: Optional[str] = None
    setup_time: Optional[str] = None
    alerting_time: Optional[str] = None
    connect_time: Optional[str] = None
    disconnect_time: Optional[str] = None
    release_time: Optional[str] = None
    end_time: Optional[str] = None
    call_duration_seconds: Optional[int] = None
    setup_duration_seconds: Optional[int] = None
    alerting_duration_seconds: Optional[int] = None
    bearer_capability: Optional[Dict] = None
    cause_value: Optional[int] = None
    cause_description: Optional[str] = None
    cause_location: Optional[str] = None
    cause_coding_standard: Optional[str] = None
    call_status: Optional[str] = None
    termination_reason: Optional[str] = None
    message_count: int = 0
    message_flow: List[Dict] = field(default_factory=list)
    extracted_fields: Dict = field(default_factory=dict)
    display_texts: List[str] = field(default_factory=list)
    calling_party_display: Optional[str] = None
    called_party_display: Optional[str] = None
    diversion_info: List[Dict] = field(default_factory=list)
    forwarding_info: List[Dict] = field(default_factory=list)
    facility_components: List[Dict] = field(default_factory=list)
    supplementary_services: List[Dict] = field(default_factory=list)
    raw_messages: List[Dict] = field(default_factory=list)
    additional_info: Dict = field(default_factory=dict)


def parse_time(timestamp_str: str) -> Optional[datetime]:
    try:
        if ' ' in timestamp_str:
            date_part, time_part = timestamp_str.split(' ')
            full_str = f"{date_part} {time_part}"
            return datetime.strptime(full_str, "%Y-%m-%d %H:%M:%S.%f")
        else:
            return datetime.strptime(timestamp_str, "%H:%M:%S.%f")
    except:
        try:
            return datetime.strptime(timestamp_str, "%H:%M:%S.%f")
        except:
            return None


def calculate_duration(start: Optional[datetime], end: Optional[datetime]) -> Optional[int]:
    if start and end:
        delta = end - start
        return int(delta.total_seconds())
    return None


def generate_cdr(call_flow_data: Dict) -> CDRRecord:
    call_id = call_flow_data.get('id', 'unknown')
    cdr_id = f"CDR-{call_id}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    
    cdr = CDRRecord(
        cdr_id=cdr_id,
        call_id=call_id,
        calling_party=call_flow_data.get('calling_party'),
        called_party=call_flow_data.get('called_party'),
        start_time=call_flow_data.get('start_time'),
    )
    
    setup_time = None
    alerting_time = None
    connect_time = None
    disconnect_time = None
    release_time = None
    end_time = None
    
    call_status = 'UNKNOWN'
    messages = call_flow_data.get('messages', [])
    cdr.message_count = len(messages)
    
    for msg_data in messages:
        try:
            hex_data = msg_data.get('hex_data', '')
            timestamp = msg_data.get('timestamp', '')
            direction = msg_data.get('direction', '')
            
            message = decode_q931_message(hex_data)
            recursive_result = decode_all_ies_recursive(message)
            
            msg_dict = {
                'timestamp': timestamp,
                'direction': direction,
                'message_type': message.message_name,
                'message_type_code': f'0x{message.message_type:02X}',
                'call_reference': f'0x{message.call_reference_value:X}',
                'raw_hex': message.raw_data.hex(),
                'extracted_fields': recursive_result.get('extracted_fields', {}),
                'information_elements': [
                    {
                        'ie_type': f'0x{ie.ie_type:02X}',
                        'ie_name': ie.ie_name,
                        'length': ie.length,
                        'decoded_data': ie.decoded_data
                    }
                    for ie in message.information_elements
                ]
            }
            
            cdr.message_flow.append(msg_dict)
            cdr.raw_messages.append({
                'timestamp': timestamp,
                'direction': direction,
                'hex_data': hex_data
            })
            
            extracted = recursive_result.get('extracted_fields', {})
            
            if extracted.get('called_party_number'):
                if not cdr.called_party:
                    cdr.called_party = extracted['called_party_number']
                cdr.extracted_fields['called_party_number'] = extracted['called_party_number']
            
            if extracted.get('calling_party_number'):
                if not cdr.calling_party:
                    cdr.calling_party = extracted['calling_party_number']
                cdr.extracted_fields['calling_party_number'] = extracted['calling_party_number']
            
            if extracted.get('bearer_capability'):
                cdr.bearer_capability = extracted['bearer_capability']
                cdr.extracted_fields['bearer_capability'] = extracted['bearer_capability']
            
            if extracted.get('cause'):
                cause = extracted['cause']
                
                is_network_side = direction == 'Network -> UE'
                is_disconnect = message.message_name == 'DISCONNECT'
                
                should_update = False
                if cdr.cause_value is None:
                    should_update = True
                elif is_network_side and not (cdr.cause_location and 'Private network serving the local user' in cdr.cause_location):
                    should_update = True
                elif is_disconnect:
                    should_update = True
                elif is_network_side and message.message_name == 'RELEASE':
                    should_update = True
                
                if should_update:
                    cdr.cause_value = cause.get('cause_value')
                    cdr.cause_description = cause.get('cause_description')
                    cdr.cause_location = cause.get('location')
                    cdr.cause_coding_standard = cause.get('coding_standard')
                    cdr.extracted_fields['cause'] = cause
            
            if extracted.get('display_text'):
                cdr.display_texts.append(extracted['display_text'])
                if not cdr.calling_party_display:
                    cdr.calling_party_display = extracted['display_text']
                cdr.extracted_fields['display_text'] = extracted['display_text']
            
            for ie in message.information_elements:
                if ie.ie_type == 0x14 and 'components' in ie.decoded_data:
                    cdr.facility_components.extend(ie.decoded_data['components'])
                    for comp in ie.decoded_data['components']:
                        if 'service_name' in comp:
                            cdr.supplementary_services.append({
                                'timestamp': timestamp,
                                'service': comp.get('service_name'),
                                'invoke_id': comp.get('invoke_id'),
                                'parameters': comp.get('parameters_hex', '')
                            })
                
                if ie.ie_type == 0x1C and 'diversion_reason' in ie.decoded_data:
                    cdr.diversion_info.append({
                        'timestamp': timestamp,
                        'reason': ie.decoded_data.get('diversion_reason'),
                        'diverted_to': ie.decoded_data.get('diverted_to_number', '')
                    })
                
                if ie.ie_type == 0x49 and 'forwarding_entries' in ie.decoded_data:
                    cdr.forwarding_info.append({
                        'timestamp': timestamp,
                        'entries': ie.decoded_data.get('forwarding_entries', [])
                    })
            
            msg_time = parse_time(timestamp)
            
            if message.message_name == 'SETUP':
                setup_time = msg_time
                call_status = 'SETUP'
            elif message.message_name == 'CALL PROCEEDING':
                call_status = 'PROCEEDING'
            elif message.message_name == 'ALERTING':
                alerting_time = msg_time
                call_status = 'ALERTING'
            elif message.message_name == 'CONNECT':
                connect_time = msg_time
                call_status = 'CONNECTED'
            elif message.message_name == 'CONNECT ACKNOWLEDGE':
                call_status = 'ACTIVE'
            elif message.message_name == 'DISCONNECT':
                disconnect_time = msg_time
                call_status = 'DISCONNECTING'
            elif message.message_name == 'RELEASE':
                release_time = msg_time
                call_status = 'RELEASING'
            elif message.message_name == 'RELEASE COMPLETE':
                end_time = msg_time
                call_status = 'RELEASED'
            
        except Exception as e:
            cdr.message_flow.append({
                'timestamp': msg_data.get('timestamp', ''),
                'direction': msg_data.get('direction', ''),
                'message_type': 'DECODE_ERROR',
                'error': str(e),
                'raw_hex': msg_data.get('hex_data', '')
            })
    
    cdr.setup_time = setup_time.strftime('%H:%M:%S.%f') if setup_time else None
    cdr.alerting_time = alerting_time.strftime('%H:%M:%S.%f') if alerting_time else None
    cdr.connect_time = connect_time.strftime('%H:%M:%S.%f') if connect_time else None
    cdr.disconnect_time = disconnect_time.strftime('%H:%M:%S.%f') if disconnect_time else None
    cdr.release_time = release_time.strftime('%H:%M:%S.%f') if release_time else None
    cdr.end_time = end_time.strftime('%H:%M:%S.%f') if end_time else None
    
    cdr.call_duration_seconds = calculate_duration(connect_time, disconnect_time)
    cdr.setup_duration_seconds = calculate_duration(setup_time, alerting_time)
    cdr.alerting_duration_seconds = calculate_duration(alerting_time, connect_time)
    
    cdr.call_status = call_status
    
    if cdr.cause_value is not None:
        if cdr.cause_value == 16:
            cdr.termination_reason = 'Normal call clearing'
        elif cdr.cause_value == 17:
            cdr.termination_reason = 'User busy'
        elif cdr.cause_value == 19:
            cdr.termination_reason = 'No answer from user'
        elif cdr.cause_value == 18:
            cdr.termination_reason = 'No user responding'
        else:
            cdr.termination_reason = cdr.cause_description
    
    cdr.additional_info = {
        'total_messages': len(messages),
        'decoded_messages_success': len([m for m in cdr.message_flow if m.get('message_type') != 'DECODE_ERROR']),
        'decoded_messages_failed': len([m for m in cdr.message_flow if m.get('message_type') == 'DECODE_ERROR']),
        'facility_component_count': len(cdr.facility_components),
        'diversion_count': len(cdr.diversion_info),
        'forwarding_count': len(cdr.forwarding_info),
        'supplementary_service_count': len(cdr.supplementary_services),
        'display_text_count': len(cdr.display_texts)
    }
    
    return cdr


def cdr_to_dict(cdr: CDRRecord) -> Dict:
    return {
        'cdr_id': cdr.cdr_id,
        'call_id': cdr.call_id,
        'calling_party': cdr.calling_party,
        'called_party': cdr.called_party,
        'start_time': cdr.start_time,
        'setup_time': cdr.setup_time,
        'alerting_time': cdr.alerting_time,
        'connect_time': cdr.connect_time,
        'disconnect_time': cdr.disconnect_time,
        'release_time': cdr.release_time,
        'end_time': cdr.end_time,
        'call_duration_seconds': cdr.call_duration_seconds,
        'setup_duration_seconds': cdr.setup_duration_seconds,
        'alerting_duration_seconds': cdr.alerting_duration_seconds,
        'bearer_capability': cdr.bearer_capability,
        'cause_value': cdr.cause_value,
        'cause_description': cdr.cause_description,
        'cause_location': cdr.cause_location,
        'cause_coding_standard': cdr.cause_coding_standard,
        'call_status': cdr.call_status,
        'termination_reason': cdr.termination_reason,
        'message_count': cdr.message_count,
        'calling_party_display': cdr.calling_party_display,
        'called_party_display': cdr.called_party_display,
        'display_texts': cdr.display_texts,
        'diversion_info': cdr.diversion_info,
        'forwarding_info': cdr.forwarding_info,
        'facility_components': cdr.facility_components,
        'supplementary_services': cdr.supplementary_services,
        'extracted_fields': cdr.extracted_fields,
        'additional_info': cdr.additional_info,
        'message_flow': cdr.message_flow,
        'raw_messages': cdr.raw_messages,
        'generated_at': datetime.now().isoformat()
    }


def cdr_to_csv(cdr: CDRRecord) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    
    headers = [
        'CDR ID', 'Call ID', 'Calling Party', 'Called Party',
        'Start Time', 'Setup Time', 'Alerting Time', 'Connect Time',
        'Disconnect Time', 'Release Time', 'End Time',
        'Call Duration (s)', 'Setup Duration (s)', 'Alerting Duration (s)',
        'Bearer Capability', 'Cause Value', 'Cause Description',
        'Cause Location', 'Cause Coding Standard',
        'Call Status', 'Termination Reason',
        'Message Count', 'Calling Display', 'Called Display',
        'Diversion Info', 'Forwarding Info',
        'Supplementary Services', 'Generated At'
    ]
    writer.writerow(headers)
    
    bearer_str = ''
    if cdr.bearer_capability:
        bearer_str = cdr.bearer_capability.get('information_transfer_capability', '')
        if cdr.bearer_capability.get('transfer_rate'):
            bearer_str += f" ({cdr.bearer_capability['transfer_rate']})"
    
    diversion_str = '; '.join([
        f"{d.get('reason', '')} -> {d.get('diverted_to', '')}"
        for d in cdr.diversion_info
    ]) if cdr.diversion_info else ''
    
    forwarding_str = '; '.join([
        f"{len(f.get('entries', []))} entries"
        for f in cdr.forwarding_info
    ]) if cdr.forwarding_info else ''
    
    ss_str = '; '.join([
        f"{s.get('service', '')}"
        for s in cdr.supplementary_services
    ]) if cdr.supplementary_services else ''
    
    row = [
        cdr.cdr_id,
        cdr.call_id,
        cdr.calling_party or '',
        cdr.called_party or '',
        cdr.start_time or '',
        cdr.setup_time or '',
        cdr.alerting_time or '',
        cdr.connect_time or '',
        cdr.disconnect_time or '',
        cdr.release_time or '',
        cdr.end_time or '',
        cdr.call_duration_seconds or '',
        cdr.setup_duration_seconds or '',
        cdr.alerting_duration_seconds or '',
        bearer_str,
        cdr.cause_value or '',
        cdr.cause_description or '',
        cdr.cause_location or '',
        cdr.cause_coding_standard or '',
        cdr.call_status or '',
        cdr.termination_reason or '',
        cdr.message_count,
        cdr.calling_party_display or '',
        cdr.called_party_display or '',
        diversion_str,
        forwarding_str,
        ss_str,
        datetime.now().isoformat()
    ]
    writer.writerow(row)
    
    output.write('\n\n=== Message Flow ===\n')
    output.write('Timestamp,Direction,Message Type,Extracted Info\n')
    for msg in cdr.message_flow:
        extracted = msg.get('extracted_fields', {})
        extracted_str = ' | '.join([
            f"{k}: {v}" for k, v in extracted.items()
            if k in ['called_party_number', 'bearer_capability', 'cause', 'display_text']
        ])
        writer = csv.writer(output)
        writer.writerow([
            msg.get('timestamp', ''),
            msg.get('direction', ''),
            msg.get('message_type', ''),
            extracted_str
        ])
    
    return output.getvalue()


def cdr_to_json(cdr: CDRRecord, pretty: bool = True) -> str:
    data = cdr_to_dict(cdr)
    if pretty:
        return json.dumps(data, indent=2, ensure_ascii=False)
    return json.dumps(data, ensure_ascii=False)


def cdr_to_text(cdr: CDRRecord) -> str:
    lines = []
    lines.append('=' * 80)
    lines.append('CALL DETAIL RECORD (CDR)')
    lines.append('=' * 80)
    lines.append('')
    lines.append(f"CDR ID:              {cdr.cdr_id}")
    lines.append(f"Call ID:             {cdr.call_id}")
    lines.append(f"Generated At:        {datetime.now().isoformat()}")
    lines.append('')
    lines.append('--- Call Parties ---')
    lines.append(f"Calling Party:       {cdr.calling_party or 'N/A'}")
    lines.append(f"Called Party:        {cdr.called_party or 'N/A'}")
    if cdr.calling_party_display:
        lines.append(f"Calling Display:     {cdr.calling_party_display}")
    if cdr.called_party_display:
        lines.append(f"Called Display:      {cdr.called_party_display}")
    lines.append('')
    lines.append('--- Timing ---')
    lines.append(f"Start Time:          {cdr.start_time or 'N/A'}")
    lines.append(f"Setup Time:          {cdr.setup_time or 'N/A'}")
    lines.append(f"Alerting Time:       {cdr.alerting_time or 'N/A'}")
    lines.append(f"Connect Time:        {cdr.connect_time or 'N/A'}")
    lines.append(f"Disconnect Time:     {cdr.disconnect_time or 'N/A'}")
    lines.append(f"Release Time:        {cdr.release_time or 'N/A'}")
    lines.append(f"End Time:            {cdr.end_time or 'N/A'}")
    lines.append('')
    lines.append('--- Durations ---')
    if cdr.setup_duration_seconds is not None:
        lines.append(f"Setup Duration:      {cdr.setup_duration_seconds} seconds")
    if cdr.alerting_duration_seconds is not None:
        lines.append(f"Alerting Duration:   {cdr.alerting_duration_seconds} seconds")
    if cdr.call_duration_seconds is not None:
        lines.append(f"Call Duration:       {cdr.call_duration_seconds} seconds")
    lines.append('')
    lines.append('--- Call Info ---')
    lines.append(f"Call Status:         {cdr.call_status or 'N/A'}")
    if cdr.bearer_capability:
        lines.append(f"Bearer Capability:   {cdr.bearer_capability.get('information_transfer_capability', 'N/A')}")
        if cdr.bearer_capability.get('transfer_rate'):
            lines.append(f"Transfer Rate:       {cdr.bearer_capability['transfer_rate']}")
    lines.append(f"Message Count:       {cdr.message_count}")
    lines.append('')
    lines.append('--- Termination ---')
    if cdr.cause_value is not None:
        lines.append(f"Cause Value:         {cdr.cause_value}")
        lines.append(f"Cause Description:   {cdr.cause_description or 'N/A'}")
        lines.append(f"Cause Location:      {cdr.cause_location or 'N/A'}")
        lines.append(f"Coding Standard:     {cdr.cause_coding_standard or 'N/A'}")
    if cdr.termination_reason:
        lines.append(f"Termination Reason:  {cdr.termination_reason}")
    lines.append('')
    if cdr.diversion_info:
        lines.append('--- Diversion Info ---')
        for div in cdr.diversion_info:
            lines.append(f"  {div.get('reason', 'N/A')} -> {div.get('diverted_to', 'N/A')}")
        lines.append('')
    if cdr.forwarding_info:
        lines.append('--- Forwarding Info ---')
        for fwd in cdr.forwarding_info:
            for entry in fwd.get('entries', []):
                lines.append(f"  {entry.get('type', 'N/A')}: {entry.get('forwarded_number', 'N/A')}")
        lines.append('')
    if cdr.supplementary_services:
        lines.append('--- Supplementary Services ---')
        for ss in cdr.supplementary_services:
            lines.append(f"  {ss.get('timestamp', '')}: {ss.get('service', 'N/A')}")
        lines.append('')
    lines.append('--- Message Flow ---')
    for i, msg in enumerate(cdr.message_flow, 1):
        extracted = msg.get('extracted_fields', {})
        extracted_parts = []
        if extracted.get('called_party_number'):
            extracted_parts.append(f"Called: {extracted['called_party_number']}")
        if extracted.get('cause'):
            extracted_parts.append(f"Cause: {extracted['cause'].get('cause_description', 'N/A')}")
        if extracted.get('display_text'):
            extracted_parts.append(f"Display: {extracted['display_text']}")
        extracted_str = f" [{'; '.join(extracted_parts)}]" if extracted_parts else ''
        lines.append(f"  {i:2d}. [{msg.get('timestamp', '')}] {msg.get('direction', ''):15} {msg.get('message_type', '')}{extracted_str}")
    lines.append('')
    lines.append('=' * 80)
    
    return '\n'.join(lines)


def generate_cdr_summary(cdr: CDRRecord) -> Dict:
    return {
        'cdr_id': cdr.cdr_id,
        'call_id': cdr.call_id,
        'calling_party': cdr.calling_party,
        'called_party': cdr.called_party,
        'call_status': cdr.call_status,
        'termination_reason': cdr.termination_reason,
        'cause_value': cdr.cause_value,
        'cause_description': cdr.cause_description,
        'call_duration_seconds': cdr.call_duration_seconds,
        'message_count': cdr.message_count,
        'start_time': cdr.start_time,
        'end_time': cdr.end_time,
        'has_diversion': len(cdr.diversion_info) > 0,
        'has_forwarding': len(cdr.forwarding_info) > 0,
        'has_supplementary_services': len(cdr.supplementary_services) > 0,
        'display_texts': cdr.display_texts
    }
