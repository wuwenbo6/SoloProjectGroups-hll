import struct
import json
from typing import List, Dict, Any, Optional, Tuple
import os
from collections import defaultdict


class TcpStream:
    def __init__(self):
        self.buffer = b''
        self.next_seq = None
        self.packets = []


class FallbackPcapParser:
    def __init__(self):
        self.GLOBAL_HEADER_SIZE = 24
        self.PACKET_HEADER_SIZE = 16
        self.tcp_streams = defaultdict(TcpStream)
        self.all_packets_data = []

    def parse_pcap(self, pcap_path: str) -> List[Dict[str, Any]]:
        packets = []
        try:
            with open(pcap_path, 'rb') as f:
                data = f.read()

            if len(data) < self.GLOBAL_HEADER_SIZE:
                return [{'error': 'Invalid PCAP file: too short'}]

            magic = data[:4]
            if magic == b'\xd4\xc3\xb2\xa1':
                endian = '<'
                nano = False
            elif magic == b'\xa1\xb2\xc3\xd4':
                endian = '>'
                nano = False
            elif magic == b'\x4d\x3c\xb2\xa1':
                endian = '<'
                nano = True
            elif magic == b'\xa1\xb2\x3c\x4d':
                endian = '>'
                nano = True
            else:
                return [{'error': 'Invalid PCAP file format'}]

            offset = self.GLOBAL_HEADER_SIZE
            packet_num = 0
            raw_packets = []

            while offset + self.PACKET_HEADER_SIZE <= len(data):
                packet_num += 1
                ts_sec, ts_usec, incl_len, orig_len = struct.unpack(
                    endian + 'IIII', data[offset:offset + self.PACKET_HEADER_SIZE]
                )
                offset += self.PACKET_HEADER_SIZE

                if offset + incl_len > len(data):
                    break

                packet_data = data[offset:offset + incl_len]
                offset += incl_len

                raw_packets.append({
                    'num': packet_num,
                    'ts_sec': ts_sec,
                    'ts_usec': ts_usec,
                    'data': packet_data
                })

            packets = self._process_packets_with_reassembly(raw_packets)

        except Exception as e:
            return [{'error': f'Parse error: {str(e)}'}]

        return packets

    def _process_packets_with_reassembly(self, raw_packets: List[Dict]) -> List[Dict[str, Any]]:
        parsed_packets = []

        for pkt in raw_packets:
            parsed = self._parse_single_packet(pkt['data'], pkt['num'], pkt['ts_sec'], pkt['ts_usec'])
            parsed_packets.append(parsed)

            if parsed.get('protocol') == 'TCP' or parsed.get('protocol') == 'Modbus':
                self._try_parse_reassembled_modbus(parsed, pkt['data'])

        return parsed_packets

    def _parse_single_packet(self, raw_data: bytes, packet_num: int, ts_sec: int, ts_usec: int) -> Dict[str, Any]:
        result = {
            'packet_number': packet_num,
            'timestamp': f'{ts_sec}.{ts_usec:06d}',
            'length': len(raw_data),
            'layers': [],
            'src_ip': '',
            'dst_ip': '',
            'protocol': '',
            'reassembled': False
        }

        offset = 0

        eth_layer = self._parse_eth(raw_data[offset:])
        if eth_layer:
            result['layers'].append(eth_layer)
            offset += 14

            if offset + 20 <= len(raw_data):
                ip_layer = self._parse_ip(raw_data[offset:])
                if ip_layer:
                    result['layers'].append(ip_layer)
                    result['src_ip'] = ip_layer.get('src', '')
                    result['dst_ip'] = ip_layer.get('dst', '')
                    ihl = ip_layer.get('ihl', 5)
                    ip_total_len = ip_layer.get('total_length', len(raw_data) - offset)
                    offset += ihl * 4

                    protocol = ip_layer.get('protocol', '')
                    if protocol == '6' and offset + 20 <= len(raw_data):
                        tcp_layer, tcp_payload = self._parse_tcp_full(raw_data[offset:])
                        if tcp_layer:
                            result['layers'].append(tcp_layer)
                            data_offset = tcp_layer.get('data_offset', 5)
                            offset += data_offset * 4
                            result['protocol'] = 'TCP'

                            if tcp_payload:
                                stream_key = self._get_stream_key(
                                    result['src_ip'],
                                    tcp_layer['src_port'],
                                    result['dst_ip'],
                                    tcp_layer['dst_port']
                                )

                                seq = tcp_layer['seq']
                                stream = self.tcp_streams[stream_key]

                                if stream.next_seq is None or seq == stream.next_seq:
                                    stream.buffer += tcp_payload
                                    stream.next_seq = seq + len(tcp_payload)

                                    modbus_layer, consumed = self._parse_modbus_from_stream(stream.buffer)
                                    if modbus_layer:
                                        result['layers'].append(modbus_layer)
                                        result['protocol'] = 'Modbus'
                                        result['reassembled'] = len(stream.buffer) > len(tcp_payload)
                                        stream.buffer = stream.buffer[consumed:]
                    elif protocol == '17':
                        result['protocol'] = 'UDP'

        return result

    def _get_stream_key(self, src_ip: str, src_port: int, dst_ip: str, dst_port: int) -> Tuple:
        return (src_ip, src_port, dst_ip, dst_port)

    def _try_parse_reassembled_modbus(self, parsed: Dict, raw_data: bytes):
        pass

    def _parse_eth(self, data: bytes) -> Optional[Dict[str, Any]]:
        if len(data) < 14:
            return None

        dst_mac = ':'.join(f'{b:02x}' for b in data[0:6])
        src_mac = ':'.join(f'{b:02x}' for b in data[6:12])
        eth_type = struct.unpack('>H', data[12:14])[0]

        return {
            'name': 'eth',
            'fields': [
                {'name': 'dst', 'display_name': 'Destination MAC', 'value': dst_mac},
                {'name': 'src', 'display_name': 'Source MAC', 'value': src_mac},
                {'name': 'type', 'display_name': 'Type', 'value': f'0x{eth_type:04x} (IPv4)' if eth_type == 0x0800 else f'0x{eth_type:04x}'}
            ]
        }

    def _parse_ip(self, data: bytes) -> Optional[Dict[str, Any]]:
        if len(data) < 20:
            return None

        version_ihl = data[0]
        version = version_ihl >> 4
        ihl = version_ihl & 0x0F

        if version != 4:
            return None

        total_length = struct.unpack('>H', data[2:4])[0]
        identification = struct.unpack('>H', data[4:6])[0]
        ttl = data[8]
        protocol = data[9]
        checksum = struct.unpack('>H', data[10:12])[0]
        src_ip = '.'.join(str(b) for b in data[12:16])
        dst_ip = '.'.join(str(b) for b in data[16:20])

        proto_map = {1: 'ICMP', 6: 'TCP', 17: 'UDP'}

        return {
            'name': 'ip',
            'ihl': ihl,
            'src': src_ip,
            'dst': dst_ip,
            'protocol': str(protocol),
            'total_length': total_length,
            'fields': [
                {'name': 'version', 'display_name': 'Version', 'value': f'{version} (IPv4)'},
                {'name': 'ihl', 'display_name': 'Header Length', 'value': f'{ihl * 4} bytes'},
                {'name': 'tos', 'display_name': 'Type of Service', 'value': f'0x{data[1]:02x}'},
                {'name': 'len', 'display_name': 'Total Length', 'value': f'{total_length} bytes'},
                {'name': 'id', 'display_name': 'Identification', 'value': f'0x{identification:04x}'},
                {'name': 'ttl', 'display_name': 'TTL', 'value': str(ttl)},
                {'name': 'proto', 'display_name': 'Protocol', 'value': f'{proto_map.get(protocol, str(protocol))} ({protocol})'},
                {'name': 'checksum', 'display_name': 'Checksum', 'value': f'0x{checksum:04x}'},
                {'name': 'src', 'display_name': 'Source IP', 'value': src_ip},
                {'name': 'dst', 'display_name': 'Destination IP', 'value': dst_ip}
            ]
        }

    def _parse_tcp_full(self, data: bytes) -> Tuple[Optional[Dict[str, Any]], bytes]:
        if len(data) < 20:
            return None, b''

        src_port = struct.unpack('>H', data[0:2])[0]
        dst_port = struct.unpack('>H', data[2:4])[0]
        seq_num = struct.unpack('>I', data[4:8])[0]
        ack_num = struct.unpack('>I', data[8:12])[0]
        data_offset = (data[12] >> 4) & 0x0F
        flags = data[13]
        window_size = struct.unpack('>H', data[14:16])[0]
        checksum = struct.unpack('>H', data[16:18])[0]

        flag_list = []
        if flags & 0x20: flag_list.append('URG')
        if flags & 0x10: flag_list.append('ACK')
        if flags & 0x08: flag_list.append('PSH')
        if flags & 0x04: flag_list.append('RST')
        if flags & 0x02: flag_list.append('SYN')
        if flags & 0x01: flag_list.append('FIN')

        header_len = data_offset * 4
        payload = data[header_len:] if len(data) > header_len else b''

        result = {
            'name': 'tcp',
            'src_port': src_port,
            'dst_port': dst_port,
            'seq': seq_num,
            'ack': ack_num,
            'data_offset': data_offset,
            'payload_len': len(payload),
            'fields': [
                {'name': 'srcport', 'display_name': 'Source Port', 'value': f'{src_port}'},
                {'name': 'dstport', 'display_name': 'Destination Port', 'value': f'{dst_port}'},
                {'name': 'seq', 'display_name': 'Sequence Number', 'value': f'{seq_num}'},
                {'name': 'ack', 'display_name': 'Acknowledgment Number', 'value': f'{ack_num}'},
                {'name': 'hdr_len', 'display_name': 'Header Length', 'value': f'{header_len} bytes'},
                {'name': 'flags', 'display_name': 'Flags', 'value': f'0x{flags:02x} ({",".join(flag_list)})'},
                {'name': 'window', 'display_name': 'Window Size', 'value': f'{window_size}'},
                {'name': 'checksum', 'display_name': 'Checksum', 'value': f'0x{checksum:04x}'},
                {'name': 'payload_len', 'display_name': 'Payload Length', 'value': f'{len(payload)} bytes'}
            ]
        }

        return result, payload

    def _parse_tcp(self, data: bytes) -> Optional[Dict[str, Any]]:
        result, _ = self._parse_tcp_full(data)
        return result

    def _parse_modbus_from_stream(self, buffer: bytes) -> Tuple[Optional[Dict[str, Any]], int]:
        while len(buffer) >= 7:
            transaction_id = struct.unpack('>H', buffer[0:2])[0]
            protocol_id = struct.unpack('>H', buffer[2:4])[0]
            length = struct.unpack('>H', buffer[4:6])[0]
            unit_id = buffer[6]

            if protocol_id != 0:
                return None, 0

            total_packet_len = 6 + length

            if len(buffer) < total_packet_len:
                return None, 0

            modbus_data = buffer[:total_packet_len]
            result = self._parse_modbus_full(modbus_data)

            if result:
                return result, total_packet_len

            return None, 0

        return None, 0

    def _parse_modbus_full(self, data: bytes) -> Optional[Dict[str, Any]]:
        if len(data) < 7:
            return None

        transaction_id = struct.unpack('>H', data[0:2])[0]
        protocol_id = struct.unpack('>H', data[2:4])[0]
        length = struct.unpack('>H', data[4:6])[0]
        unit_id = data[6]

        fields = [
            {'name': 'trans_id', 'display_name': 'Transaction Identifier',
             'value': f'0x{transaction_id:04x} ({transaction_id})'},
            {'name': 'proto_id', 'display_name': 'Protocol Identifier',
             'value': f'0x{protocol_id:04x} ({protocol_id} - Modbus)'},
            {'name': 'len', 'display_name': 'Length',
             'value': f'{length} bytes (following bytes)'},
            {'name': 'unit_id', 'display_name': 'Unit Identifier',
             'value': f'{unit_id} (0x{unit_id:02x})'}
        ]

        if len(data) >= 8:
            function_code = data[7]
            is_exception = (function_code & 0x80) != 0
            actual_fc = function_code & 0x7F

            fc_names = {
                0x01: 'Read Coils',
                0x02: 'Read Discrete Inputs',
                0x03: 'Read Holding Registers',
                0x04: 'Read Input Registers',
                0x05: 'Write Single Coil',
                0x06: 'Write Single Register',
                0x0F: 'Write Multiple Coils',
                0x10: 'Write Multiple Registers',
                0x41: 'Custom Read Sensor Data',
                0x42: 'Custom Write Configuration',
                0x43: 'Custom Firmware Update',
                0x44: 'Custom Device Status Query',
                0x45: 'Custom Alarm Acknowledge'
            }

            fc_name = fc_names.get(actual_fc, f'Reserved/Unknown')
            exception_note = ' (Exception Response)' if is_exception else ''
            fields.append({
                'name': 'func_code',
                'display_name': 'Function Code',
                'value': f'0x{function_code:02x} - {fc_name}{exception_note}'
            })

            if is_exception and len(data) >= 9:
                exception_code = data[8]
                exception_names = {
                    0x01: 'Illegal Function',
                    0x02: 'Illegal Data Address',
                    0x03: 'Illegal Data Value',
                    0x04: 'Slave Device Failure',
                    0x05: 'Acknowledge',
                    0x06: 'Slave Device Busy',
                    0x08: 'Memory Parity Error'
                }
                exc_name = exception_names.get(exception_code, 'Unknown')
                fields.append({
                    'name': 'exception_code',
                    'display_name': 'Exception Code',
                    'value': f'{exception_code} (0x{exception_code:02x}) - {exc_name}'
                })
            elif not is_exception:
                payload_start = 8
                payload_end = min(len(data), 6 + length)
                payload = data[payload_start:payload_end]

                if payload:
                    fields.append({
                        'name': 'payload_bytes',
                        'display_name': 'Payload (hex)',
                        'value': payload.hex()
                    })

                    fields.extend(self._parse_modbus_payload(actual_fc, payload))

        return {
            'name': 'modbus_ext',
            'fields': fields
        }

    def _parse_modbus_payload(self, function_code: int, payload: bytes) -> List[Dict[str, Any]]:
        fields = []

        if function_code in [0x01, 0x02, 0x03, 0x04]:
            if len(payload) >= 1:
                byte_count = payload[0]
                fields.append({
                    'name': 'byte_count',
                    'display_name': 'Byte Count',
                    'value': f'{byte_count}'
                })

                register_data = payload[1:]
                if register_data:
                    fields.append({
                        'name': 'data',
                        'display_name': 'Data',
                        'value': f'0x{register_data.hex()}'
                    })

                    if function_code in [0x03, 0x04]:
                        num_registers = len(register_data) // 2
                        for i in range(num_registers):
                            reg_val = struct.unpack('>H', register_data[i*2:i*2+2])[0]
                            fields.append({
                                'name': f'register_{i}',
                                'display_name': f'Register {i}',
                                'value': f'0x{reg_val:04x} ({reg_val})'
                            })

        elif function_code in [0x05, 0x06]:
            if len(payload) >= 4:
                output_addr = struct.unpack('>H', payload[0:2])[0]
                output_val = struct.unpack('>H', payload[2:4])[0]
                fields.append({
                    'name': 'output_addr',
                    'display_name': 'Output Address',
                    'value': f'0x{output_addr:04x} ({output_addr})'
                })
                if function_code == 0x05:
                    status = 'ON' if output_val == 0xFF00 else 'OFF'
                    fields.append({
                        'name': 'output_value',
                        'display_name': 'Output Value',
                        'value': f'0x{output_val:04x} ({status})'
                    })
                else:
                    fields.append({
                        'name': 'register_value',
                        'display_name': 'Register Value',
                        'value': f'0x{output_val:04x} ({output_val})'
                    })

        elif function_code in [0x0F, 0x10]:
            if len(payload) >= 4:
                start_addr = struct.unpack('>H', payload[0:2])[0]
                quantity = struct.unpack('>H', payload[2:4])[0]
                fields.append({
                    'name': 'starting_address',
                    'display_name': 'Starting Address',
                    'value': f'0x{start_addr:04x} ({start_addr})'
                })
                fields.append({
                    'name': 'quantity_of_registers',
                    'display_name': 'Quantity',
                    'value': f'{quantity}'
                })

        elif function_code == 0x41:
            offset = 0
            if len(payload) >= offset + 2:
                sensor_id = struct.unpack('>H', payload[offset:offset+2])[0]
                fields.append({
                    'name': 'sensor_id',
                    'display_name': 'Sensor ID',
                    'value': f'0x{sensor_id:04x} ({sensor_id})'
                })
                offset += 2

            if len(payload) >= offset + 1:
                sensor_type = payload[offset]
                type_names = {1: 'Temperature', 2: 'Pressure', 3: 'Humidity', 4: 'Flow'}
                type_name = type_names.get(sensor_type, 'Unknown')
                fields.append({
                    'name': 'sensor_type',
                    'display_name': 'Sensor Type',
                    'value': f'{sensor_type} ({type_name})'
                })
                offset += 1

            if len(payload) >= offset + 4:
                timestamp = struct.unpack('>I', payload[offset:offset+4])[0]
                fields.append({
                    'name': 'timestamp',
                    'display_name': 'Timestamp',
                    'value': f'{timestamp}'
                })
                offset += 4

            if len(payload) >= offset + 4:
                sensor_value = struct.unpack('>f', payload[offset:offset+4])[0]
                fields.append({
                    'name': 'sensor_value',
                    'display_name': 'Sensor Value (float)',
                    'value': f'{sensor_value:.4f}'
                })

        elif function_code == 0x42:
            offset = 0
            if len(payload) >= offset + 2:
                config_key = struct.unpack('>H', payload[offset:offset+2])[0]
                fields.append({
                    'name': 'config_key',
                    'display_name': 'Config Key',
                    'value': f'0x{config_key:04x}'
                })
                offset += 2

            if len(payload) >= offset + 4:
                config_value = struct.unpack('>I', payload[offset:offset+4])[0]
                fields.append({
                    'name': 'config_value',
                    'display_name': 'Config Value',
                    'value': f'0x{config_value:08x} ({config_value})'
                })

        elif function_code == 0x43:
            if len(payload) >= 16:
                try:
                    fw_ver = payload[:16].decode('ascii', errors='replace').rstrip('\x00')
                    fields.append({
                        'name': 'firmware_version',
                        'display_name': 'Firmware Version',
                        'value': fw_ver
                    })
                except:
                    pass

        elif function_code == 0x44:
            if len(payload) >= 1:
                status = payload[0]
                status_names = {0: 'Idle', 1: 'Running', 2: 'Error', 3: 'Maintenance'}
                status_name = status_names.get(status, 'Unknown')
                fields.append({
                    'name': 'device_status',
                    'display_name': 'Device Status',
                    'value': f'0x{status:02x} ({status_name})'
                })

        elif function_code == 0x45:
            if len(payload) >= 2:
                alarm_id = struct.unpack('>H', payload[0:2])[0]
                fields.append({
                    'name': 'alarm_id',
                    'display_name': 'Alarm ID',
                    'value': f'0x{alarm_id:04x} ({alarm_id})'
                })

        return fields

    def _parse_modbus(self, data: bytes) -> Optional[Dict[str, Any]]:
        return self._parse_modbus_full(data)
