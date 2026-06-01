import pyshark
import json
import os
from typing import List, Dict, Any


class PcapParser:
    def __init__(self, lua_script_path: str = None):
        self.lua_script_path = lua_script_path

    def parse_pcap(self, pcap_path: str, custom_proto: str = None) -> List[Dict[str, Any]]:
        packets = []
        display_filter = f'{custom_proto}' if custom_proto else None

        cap = pyshark.FileCapture(
            pcap_path,
            display_filter=display_filter,
            use_json=True,
            include_raw=True
        )

        for i, packet in enumerate(cap):
            packet_data = self._extract_packet_info(packet, i + 1)
            packets.append(packet_data)

        cap.close()
        return packets

    def _extract_packet_info(self, packet, packet_num: int) -> Dict[str, Any]:
        result = {
            'packet_number': packet_num,
            'timestamp': str(packet.sniff_time) if hasattr(packet, 'sniff_time') else '',
            'length': int(packet.length) if hasattr(packet, 'length') else 0,
            'layers': [],
            'src_ip': '',
            'dst_ip': '',
            'protocol': ''
        }

        if 'IP' in packet:
            result['src_ip'] = packet.ip.src
            result['dst_ip'] = packet.ip.dst

        if hasattr(packet, 'highest_layer'):
            result['protocol'] = packet.highest_layer

        for layer in packet.layers:
            layer_data = self._parse_layer(layer)
            if layer_data:
                result['layers'].append(layer_data)

        return result

    def _parse_layer(self, layer) -> Dict[str, Any]:
        layer_name = layer._layer_name if hasattr(layer, '_layer_name') else str(layer)
        layer_data = {
            'name': layer_name,
            'fields': []
        }

        try:
            for field_name in layer.field_names:
                try:
                    field_value = getattr(layer, field_name)
                    field_display = layer.get_field(field_name).showname if hasattr(layer.get_field(field_name), 'showname') else field_name
                    
                    layer_data['fields'].append({
                        'name': field_name,
                        'display_name': field_display,
                        'value': str(field_value),
                        'raw': layer.get_field(field_name).raw if hasattr(layer.get_field(field_name), 'raw') else None
                    })
                except Exception:
                    continue
        except Exception:
            pass

        return layer_data

    def parse_modbus_packet(self, raw_bytes: bytes) -> Dict[str, Any]:
        if len(raw_bytes) < 7:
            return {'error': 'Packet too short'}

        result = {
            'transaction_id': raw_bytes[0:2].hex(),
            'protocol_id': raw_bytes[2:4].hex(),
            'length': int.from_bytes(raw_bytes[4:6], 'big'),
            'unit_id': raw_bytes[6],
            'function_code': raw_bytes[7] if len(raw_bytes) > 7 else 0,
            'fields': []
        }

        fc = result['function_code']
        is_exception = fc & 0x80 != 0

        if is_exception:
            result['exception'] = True
            result['exception_code'] = raw_bytes[8] if len(raw_bytes) > 8 else 0
            return result

        payload = raw_bytes[8:]
        result['payload'] = payload.hex()

        if fc in [0x01, 0x02, 0x03, 0x04]:
            if len(payload) >= 1:
                byte_count = payload[0]
                result['fields'].append({'name': 'Byte Count', 'value': byte_count})
                data = payload[1:1 + byte_count]
                result['fields'].append({'name': 'Data', 'value': data.hex()})

        elif fc in [0x05, 0x06]:
            if len(payload) >= 4:
                result['fields'].append({'name': 'Address', 'value': payload[0:2].hex()})
                result['fields'].append({'name': 'Value', 'value': payload[2:4].hex()})

        elif fc in [0x0F, 0x10]:
            if len(payload) >= 4:
                result['fields'].append({'name': 'Start Address', 'value': payload[0:2].hex()})
                result['fields'].append({'name': 'Quantity', 'value': int.from_bytes(payload[2:4], 'big')})

        elif fc == 0x41:
            offset = 0
            if len(payload) >= offset + 2:
                result['fields'].append({'name': 'Sensor ID', 'value': payload[offset:offset + 2].hex()})
                offset += 2
            if len(payload) >= offset + 1:
                result['fields'].append({'name': 'Sensor Type', 'value': payload[offset]})
                offset += 1
            if len(payload) >= offset + 4:
                result['fields'].append({'name': 'Timestamp', 'value': int.from_bytes(payload[offset:offset + 4], 'big')})
                offset += 4

        return result
