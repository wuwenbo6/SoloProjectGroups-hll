import time
import json
from typing import Dict, Any, List, Optional
from dataclasses import asdict
from sccp_parser import SCCPParser
from dtap_parser import DTAPParser, CallInformation, LocationUpdateInformation, DTAPMessageType


class BSSAPParser:
    def __init__(self):
        self.bssap_message_types = {
            0x00: "Unknown",
            0x01: "DTAP (Direct Transfer Application Part)",
            0x02: "BSSMAP (BSS Management Application Part)",
        }

    def parse_bssap(self, data: bytes) -> Dict[str, Any]:
        if len(data) < 1:
            raise ValueError("Data too short for BSSAP message")

        discriminator = data[0]
        length = data[1] if len(data) > 1 else len(data) - 1

        result = {
            'discriminator': discriminator,
            'discriminator_name': self.bssap_message_types.get(discriminator, f'Unknown ({discriminator:02X})'),
            'length': length,
            'payload': data[2:2 + length] if len(data) > 2 else b'',
            'payload_hex': data[2:2 + length].hex().upper() if len(data) > 2 else '',
        }

        return result


class CallFlowManager:
    def __init__(self):
        self.sccp_parser = SCCPParser()
        self.dtap_parser = DTAPParser()
        self.bssap_parser = BSSAPParser()
        self.active_calls: Dict[str, CallInformation] = {}
        self.active_location_updates: Dict[str, LocationUpdateInformation] = {}
        self.call_history: List[Dict[str, Any]] = []
        self.location_update_history: List[Dict[str, Any]] = []
        self.message_log: List[Dict[str, Any]] = []

    def get_call_id(self, transaction_id: int, direction: str = "mobile_to_network") -> str:
        return f"call_{transaction_id}"

    def get_location_update_id(self, direction: str = "mobile_to_network") -> str:
        return f"lu_{int(time.time())}_{direction}"

    def process_sccp_message(self, hex_data: str, direction: str = "mobile_to_network") -> Dict[str, Any]:
        timestamp = time.time()
        data = bytes.fromhex(hex_data.replace(' ', ''))

        result = {
            'timestamp': timestamp,
            'direction': direction,
            'raw_hex': hex_data,
        }

        try:
            sccp_result = self.sccp_parser.parse_sccp_header(data)
            result['sccp'] = sccp_result

            payload = sccp_result.get('payload')
            if payload and len(payload) > 2:
                try:
                    bssap_result = self.bssap_parser.parse_bssap(payload)
                    result['bssap'] = bssap_result

                    if bssap_result['discriminator'] == 0x01 and bssap_result['payload']:
                        dtap_result = self.dtap_parser.parse_dtap_message(bssap_result['payload'])
                        result['dtap'] = dtap_result

                        protocol_discriminator = dtap_result.get('protocol_discriminator', 0)

                        if protocol_discriminator == 0x03:
                            transaction_id = dtap_result.get('transaction_identifier', 0)
                            call_id = self.get_call_id(transaction_id, direction)
                            self._update_call_state(call_id, dtap_result, timestamp)
                            result['call_id'] = call_id
                        elif protocol_discriminator == 0x04:
                            update_id = self._get_active_location_update_id(direction)
                            if not update_id:
                                update_id = self.get_location_update_id(direction)
                            self._update_location_update_state(update_id, dtap_result, timestamp)
                            result['location_update_id'] = update_id

                except Exception as e:
                    result['bssap_parse_error'] = str(e)

        except Exception as e:
            result['sccp_parse_error'] = str(e)

        self.message_log.append(result)
        return result

    def _get_active_location_update_id(self, direction: str) -> Optional[str]:
        for update_id, update in self.active_location_updates.items():
            if update.state not in ['COMPLETED', 'REJECTED', 'IDLE']:
                return update_id
        return None

    def _update_call_state(self, call_id: str, dtap_result: Dict[str, Any], timestamp: float):
        if call_id not in self.active_calls:
            self.active_calls[call_id] = CallInformation(
                call_id=call_id,
                messages=[]
            )

        call = self.active_calls[call_id]
        message_type = dtap_result.get('message_type')
        message_type_name = dtap_result.get('message_type_name', 'Unknown')

        call.messages.append({
            'timestamp': timestamp,
            'message_type': message_type,
            'message_type_name': message_type_name,
            'details': dtap_result.get('information_elements_parsed', {})
        })

        parsed_ies = dtap_result.get('information_elements_parsed', {})

        if 'CALLING_PARTY_BCD_NUMBER' in parsed_ies:
            call.calling_number = parsed_ies['CALLING_PARTY_BCD_NUMBER'].get('digits')

        if 'CALLED_PARTY_BCD_NUMBER' in parsed_ies:
            call.called_number = parsed_ies['CALLED_PARTY_BCD_NUMBER'].get('digits')

        if 'CONNECTED_NUMBER' in parsed_ies:
            call.connected_number = parsed_ies['CONNECTED_NUMBER'].get('digits')

        if 'BEARER_CAPABILITY' in parsed_ies:
            call.bearer_capability = parsed_ies['BEARER_CAPABILITY'].get('information_transfer_capability_name')

        if message_type == DTAPMessageType.SETUP:
            call.state = "SETUP"
            call.setup_time = timestamp
        elif message_type == DTAPMessageType.CALL_PROCEEDING:
            call.state = "CALL_PROCEEDING"
        elif message_type == DTAPMessageType.ALERTING:
            call.state = "ALERTING"
        elif message_type == DTAPMessageType.CONNECT:
            call.state = "CONNECTED"
            call.connect_time = timestamp
        elif message_type == DTAPMessageType.CONNECT_ACKNOWLEDGE:
            call.state = "CONNECT_ACK"
        elif message_type in [DTAPMessageType.DISCONNECT, DTAPMessageType.RELEASE, DTAPMessageType.RELEASE_COMPLETE]:
            call.state = "RELEASED"
            call.release_time = timestamp

            call_dict = asdict(call)
            if call not in self.call_history:
                self.call_history.append(call_dict)

    def get_call_flow(self, call_id: str) -> Optional[Dict[str, Any]]:
        if call_id in self.active_calls:
            call = self.active_calls[call_id]
            return {
                'call_id': call.call_id,
                'calling_number': call.calling_number,
                'called_number': call.called_number,
                'connected_number': call.connected_number,
                'bearer_capability': call.bearer_capability,
                'setup_time': call.setup_time,
                'connect_time': call.connect_time,
                'release_time': call.release_time,
                'state': call.state,
                'call_duration': call.connect_time and call.release_time and (call.release_time - call.connect_time),
                'messages': call.messages
            }
        return None

    def get_all_calls(self) -> List[Dict[str, Any]]:
        result = []
        for call_id, call in self.active_calls.items():
            result.append({
                'call_id': call.call_id,
                'calling_number': call.calling_number,
                'called_number': call.called_number,
                'state': call.state,
                'setup_time': call.setup_time,
                'connect_time': call.connect_time,
            })
        return result

    def get_mobile_originated_call_flow(self) -> List[Dict[str, Any]]:
        flow = []
        for msg in self.message_log:
            if 'dtap' in msg:
                flow.append({
                    'timestamp': msg['timestamp'],
                    'direction': msg['direction'],
                    'message_type': msg['dtap']['message_type_name'],
                    'transaction_id': msg['dtap'].get('transaction_identifier'),
                    'call_id': msg.get('call_id'),
                })
        return flow

    def clear_all(self):
        self.active_calls.clear()
        self.active_location_updates.clear()
        self.call_history.clear()
        self.location_update_history.clear()
        self.message_log.clear()

    def _update_location_update_state(self, update_id: str, dtap_result: Dict[str, Any], timestamp: float):
        if update_id not in self.active_location_updates:
            self.active_location_updates[update_id] = LocationUpdateInformation(
                update_id=update_id,
                messages=[]
            )

        update = self.active_location_updates[update_id]
        message_type = dtap_result.get('message_type')
        message_type_name = dtap_result.get('message_type_name', 'Unknown')

        update.messages.append({
            'timestamp': timestamp,
            'message_type': message_type,
            'message_type_name': message_type_name,
            'details': dtap_result.get('information_elements_parsed', {})
        })

        parsed_ies = dtap_result.get('information_elements_parsed', {})

        if 'MOBILE_IDENTITY' in parsed_ies:
            mi = parsed_ies['MOBILE_IDENTITY']
            if 'imsi' in mi:
                update.imsi = mi['imsi']
            if 'imei' in mi:
                update.imei = mi['imei']
            if 'tmsi' in mi:
                update.tmsi = mi['tmsi']

        if 'LOCATION_AREA_IDENTIFICATION' in parsed_ies:
            lai = parsed_ies['LOCATION_AREA_IDENTIFICATION']
            if update.old_lai is None:
                update.old_lai = lai.get('full')
            else:
                update.new_lai = lai.get('full')

        if 'CIPHER_MODE_SETTING' in parsed_ies:
            update.ciphering = True

        if message_type == DTAPMessageType.LOCATION_UPDATING_REQUEST:
            update.state = "REQUESTED"
            update.start_time = timestamp
            update.location_updating_type = parsed_ies.get('LOCATION_UPDATING_TYPE', {}).get('update_type_name')
        elif message_type == DTAPMessageType.AUTHENTICATION_REQUEST:
            update.state = "AUTHENTICATION"
        elif message_type == DTAPMessageType.AUTHENTICATION_RESPONSE:
            update.authentication = True
        elif message_type == DTAPMessageType.IDENTITY_REQUEST:
            update.state = "IDENTITY"
        elif message_type == DTAPMessageType.IDENTITY_RESPONSE:
            pass
        elif message_type == DTAPMessageType.TMSI_REALLOCATION_COMMAND:
            update.state = "TMSI_REALLOCATION"
        elif message_type == DTAPMessageType.TMSI_REALLOCATION_COMPLETE:
            pass
        elif message_type == DTAPMessageType.LOCATION_UPDATING_ACCEPT:
            update.state = "COMPLETED"
            update.complete_time = timestamp
            update_dict = asdict(update)
            self.location_update_history.append(update_dict)
        elif message_type == DTAPMessageType.LOCATION_UPDATING_REJECT:
            update.state = "REJECTED"
            update.complete_time = timestamp
            update_dict = asdict(update)
            self.location_update_history.append(update_dict)

    def get_location_update_flow(self, update_id: str) -> Optional[Dict[str, Any]]:
        if update_id in self.active_location_updates:
            update = self.active_location_updates[update_id]
            return {
                'update_id': update.update_id,
                'imsi': update.imsi,
                'imei': update.imei,
                'tmsi': update.tmsi,
                'old_lai': update.old_lai,
                'new_lai': update.new_lai,
                'location_updating_type': update.location_updating_type,
                'ciphering': update.ciphering,
                'authentication': update.authentication,
                'state': update.state,
                'start_time': update.start_time,
                'complete_time': update.complete_time,
                'duration': update.start_time and update.complete_time and (update.complete_time - update.start_time),
                'messages': update.messages
            }
        return None

    def get_all_location_updates(self) -> List[Dict[str, Any]]:
        result = []
        for update_id, update in self.active_location_updates.items():
            result.append({
                'update_id': update.update_id,
                'imsi': update.imsi,
                'tmsi': update.tmsi,
                'old_lai': update.old_lai,
                'new_lai': update.new_lai,
                'state': update.state,
                'start_time': update.start_time,
            })
        return result

    def get_location_update_flow_messages(self) -> List[Dict[str, Any]]:
        flow = []
        for msg in self.message_log:
            if 'dtap' in msg:
                pd = msg['dtap'].get('protocol_discriminator', 0)
                if pd == 0x04:
                    flow.append({
                        'timestamp': msg['timestamp'],
                        'direction': msg['direction'],
                        'message_type': msg['dtap']['message_type_name'],
                        'location_update_id': msg.get('location_update_id'),
                    })
        return flow

    def export_call_flow(self, call_id: str, format: str = 'json') -> Any:
        if call_id in self.active_calls:
            call = self.active_calls[call_id]
            if format == 'json':
                return json.dumps({
                    'type': 'call_flow',
                    'call_id': call.call_id,
                    'calling_number': call.calling_number,
                    'called_number': call.called_number,
                    'connected_number': call.connected_number,
                    'bearer_capability': call.bearer_capability,
                    'state': call.state,
                    'messages': call.messages
                }, indent=2, ensure_ascii=False)
            elif format == 'mermaid':
                return self._generate_call_mermaid(call)
        return None

    def export_location_update_flow(self, update_id: str, format: str = 'json') -> Any:
        if update_id in self.active_location_updates:
            update = self.active_location_updates[update_id]
            if format == 'json':
                return json.dumps({
                    'type': 'location_update_flow',
                    'update_id': update.update_id,
                    'imsi': update.imsi,
                    'imei': update.imei,
                    'tmsi': update.tmsi,
                    'old_lai': update.old_lai,
                    'new_lai': update.new_lai,
                    'location_updating_type': update.location_updating_type,
                    'state': update.state,
                    'messages': update.messages
                }, indent=2, ensure_ascii=False)
            elif format == 'mermaid':
                return self._generate_location_update_mermaid(update)
        return None

    def export_all_flows(self, format: str = 'json') -> Any:
        calls_data = []
        for call_id in self.active_calls:
            call = self.active_calls[call_id]
            calls_data.append({
                'type': 'call_flow',
                'call_id': call.call_id,
                'calling_number': call.calling_number,
                'called_number': call.called_number,
                'state': call.state,
                'messages': call.messages
            })

        updates_data = []
        for update_id in self.active_location_updates:
            update = self.active_location_updates[update_id]
            updates_data.append({
                'type': 'location_update_flow',
                'update_id': update.update_id,
                'imsi': update.imsi,
                'state': update.state,
                'messages': update.messages
            })

        if format == 'json':
            return json.dumps({
                'export_time': time.time(),
                'active_calls': calls_data,
                'active_location_updates': updates_data,
                'message_log': self.message_log
            }, indent=2, ensure_ascii=False)
        elif format == 'mermaid':
            return self._generate_combined_mermaid(calls_data, updates_data)

        return None

    def _generate_call_mermaid(self, call: CallInformation) -> str:
        lines = ['sequenceDiagram', '    autonumber']
        lines.append('    participant MS as 手机(MS)')
        lines.append('    participant Network as 网络(MSC/VLR)')

        for msg in call.messages:
            direction = '->>' if msg.get('direction', 'mobile_to_network') == 'mobile_to_network' else '-->>'
            arrow = '-' + direction[1:] if direction == '-->>' else '->>'
            if arrow == '->>':
                lines.append(f'    MS{arrow}Network: {msg["message_type_name"]}')
            else:
                lines.append(f'    Network{arrow}MS: {msg["message_type_name"]}')

        return '\n'.join(lines)

    def _generate_location_update_mermaid(self, update: LocationUpdateInformation) -> str:
        lines = ['sequenceDiagram', '    autonumber']
        lines.append('    participant MS as 手机(MS)')
        lines.append('    participant BTS as 基站(BTS)')
        lines.append('    participant BSC as 基站控制器(BSC)')
        lines.append('    participant MSC as 移动交换中心(MSC)')
        lines.append('    participant VLR as 访问位置寄存器(VLR)')
        lines.append('    participant HLR as 归属位置寄存器(HLR)')

        for i, msg in enumerate(update.messages):
            direction = msg.get('direction', 'mobile_to_network')
            msg_type = msg['message_type_name']
            if direction == 'mobile_to_network':
                if 'LOCATION UPDATING' in msg_type:
                    lines.append(f'    MS->>BTS: {msg_type}')
                    lines.append(f'    BTS->>BSC: {msg_type}')
                    lines.append(f'    BSC->>MSC: {msg_type}')
                elif 'AUTHENTICATION RESPONSE' in msg_type or 'IDENTITY RESPONSE' in msg_type or 'TMSI REALLOCATION COMPLETE' in msg_type:
                    lines.append(f'    MS->>BTS: {msg_type}')
                    lines.append(f'    BTS->>BSC: {msg_type}')
                    lines.append(f'    BSC->>MSC: {msg_type}')
            else:
                if 'AUTHENTICATION REQUEST' in msg_type:
                    lines.append(f'    VLR->>MSC: {msg_type}')
                    lines.append(f'    MSC->>BSC: {msg_type}')
                    lines.append(f'    BSC->>BTS: {msg_type}')
                    lines.append(f'    BTS->>MS: {msg_type}')
                elif 'IDENTITY REQUEST' in msg_type or 'TMSI REALLOCATION COMMAND' in msg_type:
                    lines.append(f'    MSC->>BSC: {msg_type}')
                    lines.append(f'    BSC->>BTS: {msg_type}')
                    lines.append(f'    BTS->>MS: {msg_type}')
                elif 'LOCATION UPDATING ACCEPT' in msg_type or 'LOCATION UPDATING REJECT' in msg_type:
                    lines.append(f'    HLR->>VLR: Update Location')
                    lines.append(f'    VLR->>MSC: {msg_type}')
                    lines.append(f'    MSC->>BSC: {msg_type}')
                    lines.append(f'    BSC->>BTS: {msg_type}')
                    lines.append(f'    BTS->>MS: {msg_type}')

        return '\n'.join(lines)

    def _generate_combined_mermaid(self, calls: List[Dict], updates: List[Dict]) -> str:
        lines = ['sequenceDiagram', '    autonumber']
        lines.append('    participant MS as 手机(MS)')
        lines.append('    participant Network as 网络(Network)')

        all_messages = []
        for call in calls:
            for msg in call.get('messages', []):
                all_messages.append({**msg, 'flow_type': 'call'})
        for update in updates:
            for msg in update.get('messages', []):
                all_messages.append({**msg, 'flow_type': 'location_update'})

        all_messages.sort(key=lambda x: x.get('timestamp', 0))

        for msg in all_messages:
            direction = msg.get('direction', 'mobile_to_network')
            flow_type = msg.get('flow_type', 'unknown')
            prefix = '[呼叫] ' if flow_type == 'call' else '[位置更新] '
            if direction == 'mobile_to_network':
                lines.append(f'    MS->>Network: {prefix}{msg["message_type_name"]}')
            else:
                lines.append(f'    Network-->>MS: {prefix}{msg["message_type_name"]}')

        return '\n'.join(lines)

