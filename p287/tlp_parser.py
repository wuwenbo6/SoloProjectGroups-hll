import struct
import csv
import io
from typing import List, Dict, Any, Optional, Tuple
from collections import deque


def _crc32c_table() -> List[int]:
    poly = 0x82F63B78
    table = []
    for i in range(256):
        crc = i
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ poly
            else:
                crc >>= 1
        table.append(crc)
    return table


_CRC32C_TABLE = _crc32c_table()


def crc32c(data: bytes, init: int = 0xFFFFFFFF) -> int:
    crc = init
    for byte in data:
        crc = _CRC32C_TABLE[(crc ^ byte) & 0xFF] ^ (crc >> 8)
    return crc ^ 0xFFFFFFFF


class TLPParser:
    FMT_TYPES = {
        (0b000, 0b00000): "Memory Read Request",
        (0b000, 0b00001): "Memory Read Lock Request",
        (0b010, 0b00000): "Memory Read Request (4DW header)",
        (0b001, 0b00000): "Memory Write Request",
        (0b011, 0b00000): "Memory Write Request (4DW header)",
        (0b000, 0b00010): "I/O Read Request",
        (0b001, 0b00010): "I/O Write Request",
        (0b000, 0b00100): "Configuration Read Type 0",
        (0b001, 0b00100): "Configuration Write Type 0",
        (0b000, 0b00101): "Configuration Read Type 1",
        (0b001, 0b00101): "Configuration Write Type 1",
        (0b000, 0b00110): "Message Request",
        (0b001, 0b00110): "Message Request (with data)",
        (0b010, 0b01010): "Completion",
        (0b100, 0b01010): "Completion (with data)",
        (0b101, 0b01010): "Completion for Locked Read",
    }

    FMT_NAMES = {
        0b000: "3DW header, no data",
        0b001: "3DW header, with data",
        0b010: "4DW header, no data",
        0b011: "4DW header, with data",
        0b100: "TLP Prefix",
    }

    TYPE_NAMES = {
        0b00000: "Memory Read/Write",
        0b00001: "Memory Read Lock",
        0b00010: "I/O Read/Write",
        0b00100: "Configuration Type 0",
        0b00101: "Configuration Type 1",
        0b00110: "Message",
        0b01010: "Completion",
    }

    def __init__(self):
        self.packets: List[Dict[str, Any]] = []

    def parse_file(self, filepath: str) -> List[Dict[str, Any]]:
        self.packets = []
        
        with open(filepath, 'rb') as f:
            data = f.read()
        
        offset = 0
        packet_index = 0
        
        while offset < len(data):
            if offset + 4 > len(data):
                break
            
            first_dw = struct.unpack('>I', data[offset:offset + 4])[0]
            
            fmt = (first_dw >> 29) & 0x7
            type_field = (first_dw >> 24) & 0x1F
            td = (first_dw >> 15) & 0x1
            has_data = fmt in [0b001, 0b011, 0b100, 0b101]
            is_4dw_header = fmt in [0b010, 0b011, 0b110, 0b111]
            
            header_size = 16 if is_4dw_header else 12
            
            length = first_dw & 0x3FF
            
            total_size = header_size + (length * 4 if has_data else 0)
            if td:
                total_size += 4
            total_size = (total_size + 3) & ~3
            
            if offset + total_size > len(data):
                total_size = len(data) - offset
            
            packet_data = data[offset:offset + total_size]
            
            packet = self._parse_packet(packet_data, packet_index)
            if packet:
                self.packets.append(packet)
                packet_index += 1
            
            offset += max(total_size, 4)
        
        return self.packets

    def _parse_packet(self, data: bytes, index: int) -> Optional[Dict[str, Any]]:
        if len(data) < 4:
            return None
        
        first_dw = struct.unpack('>I', data[0:4])[0]
        second_dw = struct.unpack('>I', data[4:8])[0] if len(data) >= 8 else 0
        third_dw = struct.unpack('>I', data[8:12])[0] if len(data) >= 12 else 0
        fourth_dw = struct.unpack('>I', data[12:16])[0] if len(data) >= 16 else 0
        
        fmt = (first_dw >> 29) & 0x7
        type_field = (first_dw >> 24) & 0x1F
        tc = (first_dw >> 20) & 0x7
        td = (first_dw >> 15) & 0x1
        ep = (first_dw >> 14) & 0x1
        attr = ((first_dw >> 12) & 0xC) | ((first_dw >> 16) & 0x3)
        length = first_dw & 0x3FF
        
        is_4dw_header = fmt in [0b010, 0b011, 0b110, 0b111]
        has_data = fmt in [0b001, 0b011, 0b100, 0b101]
        
        tlp_type = self.FMT_TYPES.get((fmt, type_field), "Unknown")
        
        ecrc_value = None
        ecrc_hex = None
        ecrc_valid = None
        digest_size = 4 if td else 0
        
        if td and len(data) >= 4:
            ecrc_value = struct.unpack('<I', data[-4:])[0]
            ecrc_hex = f"0x{ecrc_value:08X}"
            payload_for_crc = data[:-4]
            computed_crc = crc32c(payload_for_crc)
            ecrc_valid = (computed_crc == ecrc_value)
        
        header_size = 16 if is_4dw_header else 12
        data_end = len(data) - digest_size
        
        packet = {
            "index": index,
            "raw_hex": data.hex(' ').upper(),
            "fmt": fmt,
            "fmt_name": self.FMT_NAMES.get(fmt, "Reserved"),
            "type": type_field,
            "type_name": self.TYPE_NAMES.get(type_field, "Reserved"),
            "tlp_type": tlp_type,
            "tc": tc,
            "td": td,
            "ep": ep,
            "attr": attr,
            "length": length,
            "length_bytes": length * 4,
            "category": self._get_category(type_field),
        }
        
        if td:
            packet["ecrc_hex"] = ecrc_hex
            packet["ecrc_valid"] = ecrc_valid
        
        if type_field in [0b00000, 0b00001]:
            packet.update(self._parse_memory_request(second_dw, third_dw, fourth_dw, is_4dw_header))
        elif type_field == 0b01010:
            packet.update(self._parse_completion(data, is_4dw_header))
        elif type_field in [0b00100, 0b00101]:
            packet.update(self._parse_config_request(second_dw, third_dw, type_field))
        elif type_field == 0b00010:
            packet.update(self._parse_io_request(second_dw, third_dw))
        
        if has_data and data_end > header_size:
            packet["payload_hex"] = data[header_size:data_end].hex(' ').upper()
            packet["payload_size"] = data_end - header_size
        
        return packet

    def _parse_memory_request(self, second_dw: int, third_dw: int, fourth_dw: int, is_4dw: bool) -> Dict[str, Any]:
        requester_id = (second_dw >> 16) & 0xFFFF
        tag = (second_dw >> 8) & 0xFF
        last_be = (second_dw >> 4) & 0xF
        first_be = second_dw & 0xF
        
        if is_4dw:
            address = (fourth_dw << 32) | third_dw
        else:
            address = third_dw
        
        return {
            "requester_id": requester_id,
            "requester_id_hex": f"{requester_id:04X}",
            "bus_number": (requester_id >> 8) & 0xFF,
            "device_number": (requester_id >> 3) & 0x1F,
            "function_number": requester_id & 0x7,
            "tag": tag,
            "last_be": last_be,
            "first_be": first_be,
            "address": address,
            "address_hex": f"0x{address:08X}" if not is_4dw else f"0x{address:016X}",
        }

    def _parse_completion(self, data: bytes, is_4dw: bool) -> Dict[str, Any]:
        completer_id = struct.unpack('<H', data[4:6])[0] if len(data) >= 6 else 0
        
        status_byte = data[6] if len(data) >= 7 else 0
        status = (status_byte >> 5) & 0x7
        bcm = (status_byte >> 4) & 0x1
        byte_count_high = status_byte & 0xF
        
        byte_count_low = data[7] if len(data) >= 8 else 0
        byte_count = (byte_count_high << 8) | byte_count_low
        
        requester_id = struct.unpack('<H', data[8:10])[0] if len(data) >= 10 else 0
        
        tag = data[10] if len(data) >= 11 else 0
        
        lower_address = data[11] & 0x7F if len(data) >= 12 else 0
        
        status_names = {
            0b000: "Successful Completion (SC)",
            0b001: "Unsupported Request (UR)",
            0b010: "Configuration Request Retry Status (CRS)",
            0b100: "Completer Abort (CA)",
        }
        
        return {
            "completer_id": completer_id,
            "completer_id_hex": f"{completer_id:04X}",
            "completer_bus": (completer_id >> 8) & 0xFF,
            "completer_device": (completer_id >> 3) & 0x1F,
            "completer_function": completer_id & 0x7,
            "status": status,
            "status_name": status_names.get(status, "Reserved"),
            "bcm": bcm,
            "byte_count": byte_count,
            "requester_id": requester_id,
            "requester_id_hex": f"{requester_id:04X}",
            "tag": tag,
            "lower_address": lower_address,
        }

    def _parse_config_request(self, second_dw: int, third_dw: int, type_field: int) -> Dict[str, Any]:
        requester_id = (second_dw >> 16) & 0xFFFF
        tag = (second_dw >> 8) & 0xFF
        last_be = (second_dw >> 4) & 0xF
        first_be = second_dw & 0xF
        
        if type_field == 0b00101:
            target_bus = (third_dw >> 24) & 0xFF
            target_device = (third_dw >> 19) & 0x1F
            target_func = (third_dw >> 16) & 0x7
            register_number = (third_dw >> 2) & 0x3FF
        else:
            target_bus = 0
            target_device = 0
            target_func = 0
            register_number = (third_dw >> 2) & 0x3FF
        
        return {
            "requester_id": requester_id,
            "requester_id_hex": f"{requester_id:04X}",
            "tag": tag,
            "last_be": last_be,
            "first_be": first_be,
            "target_bus": target_bus,
            "target_device": target_device,
            "target_func": target_func,
            "register_number": register_number,
            "register_hex": f"0x{register_number * 4:03X}",
        }

    def _parse_io_request(self, second_dw: int, third_dw: int) -> Dict[str, Any]:
        requester_id = (second_dw >> 16) & 0xFFFF
        tag = (second_dw >> 8) & 0xFF
        last_be = (second_dw >> 4) & 0xF
        first_be = second_dw & 0xF
        address = third_dw & 0xFFFFFFFC
        
        return {
            "requester_id": requester_id,
            "requester_id_hex": f"{requester_id:04X}",
            "tag": tag,
            "last_be": last_be,
            "first_be": first_be,
            "address": address,
            "address_hex": f"0x{address:08X}",
        }

    def _get_category(self, type_field: int) -> str:
        if type_field in [0b00000, 0b00001]:
            return "Memory"
        elif type_field == 0b01010:
            return "Completion"
        elif type_field in [0b00100, 0b00101]:
            return "Configuration"
        elif type_field == 0b00010:
            return "I/O"
        elif type_field == 0b00110:
            return "Message"
        else:
            return "Other"

    def get_packets(self) -> List[Dict[str, Any]]:
        return self.packets

    def get_packet(self, index: int) -> Optional[Dict[str, Any]]:
        if 0 <= index < len(self.packets):
            return self.packets[index]
        return None

    def get_statistics(self) -> Dict[str, Any]:
        if not self.packets:
            return {"total": 0, "by_category": {}, "by_type": {}}
        
        by_category = {}
        by_type = {}
        
        for packet in self.packets:
            cat = packet.get("category", "Other")
            by_category[cat] = by_category.get(cat, 0) + 1
            
            t = packet.get("tlp_type", "Unknown")
            by_type[t] = by_type.get(t, 0) + 1
        
        return {
            "total": len(self.packets),
            "by_category": by_category,
            "by_type": by_type,
        }

    def generate_sample_data(self, count: int = 20) -> List[Dict[str, Any]]:
        import random
        
        self.packets = []
        
        sample_types = [
            (0b000, 0b00000, "Memory Read Request"),
            (0b001, 0b00000, "Memory Write Request"),
            (0b100, 0b01010, "Completion (with data)"),
            (0b010, 0b01010, "Completion"),
            (0b000, 0b00100, "Configuration Read Type 0"),
            (0b001, 0b00100, "Configuration Write Type 0"),
        ]
        
        for i in range(count):
            fmt, type_field, tlp_type = random.choice(sample_types)
            is_memory = type_field == 0b00000
            is_completion = type_field == 0b01010
            is_config = type_field in [0b00100, 0b00101]
            
            td = random.choice([0, 0, 0, 1])
            ep = 0
            
            packet = {
                "index": i,
                "fmt": fmt,
                "fmt_name": self.FMT_NAMES.get(fmt, "Reserved"),
                "type": type_field,
                "type_name": self.TYPE_NAMES.get(type_field, "Reserved"),
                "tlp_type": tlp_type,
                "tc": random.randint(0, 7),
                "td": td,
                "ep": ep,
                "attr": random.randint(0, 3),
                "length": random.randint(1, 64),
                "length_bytes": random.randint(4, 256),
                "category": self._get_category(type_field),
                "raw_hex": " ".join([f"{random.randint(0, 255):02X}" for _ in range(16 + random.randint(0, 64))]),
            }
            
            if td:
                ecrc_val = random.randint(0, 0xFFFFFFFF)
                packet["ecrc_hex"] = f"0x{ecrc_val:08X}"
                packet["ecrc_valid"] = random.choice([True, False])
            
            if is_memory:
                packet.update({
                    "requester_id": random.randint(0, 0xFFFF),
                    "requester_id_hex": f"{random.randint(0, 0xFFFF):04X}",
                    "bus_number": random.randint(0, 255),
                    "device_number": random.randint(0, 31),
                    "function_number": random.randint(0, 7),
                    "tag": random.randint(0, 255),
                    "address": random.randint(0, 0xFFFFFFFF),
                    "address_hex": f"0x{random.randint(0, 0xFFFFFFFF):08X}",
                })
            
            if is_completion:
                completer_id = random.randint(0, 0xFFFF)
                packet.update({
                    "completer_id": completer_id,
                    "completer_id_hex": f"{completer_id:04X}",
                    "completer_bus": (completer_id >> 8) & 0xFF,
                    "completer_device": (completer_id >> 3) & 0x1F,
                    "completer_function": completer_id & 0x7,
                    "status": random.choice([0, 1, 4]),
                    "status_name": random.choice(["Successful Completion (SC)", "Unsupported Request (UR)", "Completer Abort (CA)"]),
                    "byte_count": random.randint(1, 1024),
                    "requester_id": random.randint(0, 0xFFFF),
                    "requester_id_hex": f"{random.randint(0, 0xFFFF):04X}",
                    "tag": random.randint(0, 255),
                    "lower_address": random.randint(0, 127),
                })
            
            if is_config:
                packet.update({
                    "requester_id": random.randint(0, 0xFFFF),
                    "requester_id_hex": f"{random.randint(0, 0xFFFF):04X}",
                    "tag": random.randint(0, 255),
                    "register_number": random.randint(0, 255),
                    "register_hex": f"0x{random.randint(0, 1020):03X}",
                })
            
            self.packets.append(packet)
        
        return self.packets

    def export_csv(self) -> str:
        output = io.StringIO()
        writer = csv.writer(output)
        
        writer.writerow([
            'Index', 'TLP Type', 'Category', 'Fmt', 'Type', 
            'Requester ID', 'Completer ID', 'Bus', 'Device', 'Function',
            'Address/Register', 'Tag', 'Length (DW)', 'Length (Bytes)',
            'TC', 'TD', 'EP', 'Attr', 'Status', 'Byte Count',
            'Payload Data', 'ECRC', 'ECRC Valid'
        ])
        
        for packet in self.packets:
            req_id = packet.get('requester_id_hex', '')
            comp_id = packet.get('completer_id_hex', '')
            bus = packet.get('bus_number', packet.get('completer_bus', ''))
            dev = packet.get('device_number', packet.get('completer_device', ''))
            func = packet.get('function_number', packet.get('completer_function', ''))
            addr = packet.get('address_hex', packet.get('register_hex', ''))
            status = packet.get('status_name', '')
            byte_count = packet.get('byte_count', '')
            payload = packet.get('payload_hex', '')
            ecrc = packet.get('ecrc_hex', '')
            ecrc_valid = packet.get('ecrc_valid', '')
            
            writer.writerow([
                packet['index'],
                packet['tlp_type'],
                packet['category'],
                packet['fmt'],
                packet['type'],
                req_id,
                comp_id,
                bus,
                dev,
                func,
                addr,
                packet.get('tag', ''),
                packet['length'],
                packet['length_bytes'],
                packet['tc'],
                packet['td'],
                packet['ep'],
                packet['attr'],
                status,
                byte_count,
                payload,
                ecrc,
                ecrc_valid
            ])
        
        return output.getvalue()


class TLPReplayEngine:
    def __init__(self):
        self.packets: List[Dict[str, Any]] = []
        self.current_index: int = -1
        self.is_playing: bool = False
        self.playback_speed: float = 1.0
        self.replay_buffer: deque = deque(maxlen=2048)
        self.ack_sequence: int = 0
        self.next_sequence: int = 0
        self.replay_timer: int = 0
        self.retry_count: int = 0
        self.max_retries: int = 3
        self.events: List[Dict[str, Any]] = []
        self.completion_pairs: Dict[int, int] = {}
        self.pending_requests: Dict[int, Dict[str, Any]] = {}

    def load_packets(self, packets: List[Dict[str, Any]]):
        self.packets = packets
        self.reset()
        self._build_completion_pairs()

    def _build_completion_pairs(self):
        requests = {}
        for i, packet in enumerate(self.packets):
            if packet['category'] in ['Memory', 'Configuration', 'I/O'] and packet.get('tag') is not None:
                key = (packet.get('requester_id', 0), packet.get('tag', 0))
                requests[key] = i
            elif packet['category'] == 'Completion' and packet.get('tag') is not None:
                key = (packet.get('requester_id', 0), packet.get('tag', 0))
                if key in requests:
                    req_idx = requests[key]
                    self.completion_pairs[req_idx] = i
                    self.completion_pairs[i] = req_idx

    def reset(self):
        self.current_index = -1
        self.is_playing = False
        self.replay_buffer.clear()
        self.ack_sequence = 0
        self.next_sequence = 0
        self.replay_timer = 0
        self.retry_count = 0
        self.events = []
        self.pending_requests = {}

    def step(self) -> Optional[Dict[str, Any]]:
        if self.current_index + 1 >= len(self.packets):
            return None
        
        self.current_index += 1
        packet = self.packets[self.current_index]
        self._process_packet(packet)
        return packet

    def step_back(self) -> Optional[Dict[str, Any]]:
        if self.current_index <= 0:
            return None
        
        self.current_index -= 1
        return self.packets[self.current_index]

    def go_to(self, index: int) -> Optional[Dict[str, Any]]:
        if 0 <= index < len(self.packets):
            self.current_index = index
            self._rebuild_state(index)
            return self.packets[index]
        return None

    def _rebuild_state(self, up_to_index: int):
        self.replay_buffer.clear()
        self.ack_sequence = 0
        self.next_sequence = 0
        self.pending_requests = {}
        self.events = []
        
        for i in range(min(up_to_index + 1, len(self.packets))):
            self._process_packet(self.packets[i], add_event=False)

    def _process_packet(self, packet: Dict[str, Any], add_event: bool = True):
        seq = self.next_sequence
        self.next_sequence += 1
        
        if packet['category'] != 'Completion':
            self.replay_buffer.append((seq, packet))
            if packet.get('tag') is not None:
                self.pending_requests[packet.get('tag', 0)] = {
                    'sequence': seq,
                    'packet': packet,
                    'timestamp': self.current_index
                }
        
        if packet['category'] == 'Completion':
            tag = packet.get('tag', 0)
            if tag in self.pending_requests:
                self.ack_sequence = max(self.ack_sequence, self.pending_requests[tag]['sequence'] + 1)
                del self.pending_requests[tag]
                if add_event:
                    self.events.append({
                        'type': 'ACK',
                        'tag': tag,
                        'sequence': self.ack_sequence,
                        'packet_index': self.current_index
                    })

    def simulate_replay_timeout(self) -> Dict[str, Any]:
        self.retry_count += 1
        self.events.append({
            'type': 'REPLAY_TIMEOUT',
            'retry_count': self.retry_count,
            'packet_index': self.current_index
        })
        return {
            'event': 'REPLAY_TIMEOUT',
            'retry_count': self.retry_count,
            'retransmit_count': len(self.replay_buffer)
        }

    def simulate_nak(self, nak_sequence: int) -> Dict[str, Any]:
        self.events.append({
            'type': 'NAK',
            'nak_sequence': nak_sequence,
            'packet_index': self.current_index
        })
        retransmit = []
        for seq, pkt in self.replay_buffer:
            if seq >= nak_sequence:
                retransmit.append(pkt)
        return {
            'event': 'NAK',
            'nak_sequence': nak_sequence,
            'retransmit_packets': retransmit
        }

    def get_status(self) -> Dict[str, Any]:
        return {
            'current_index': self.current_index,
            'total_packets': len(self.packets),
            'is_playing': self.is_playing,
            'playback_speed': self.playback_speed,
            'ack_sequence': self.ack_sequence,
            'next_sequence': self.next_sequence,
            'replay_buffer_size': len(self.replay_buffer),
            'pending_requests': len(self.pending_requests),
            'retry_count': self.retry_count,
            'recent_events': self.events[-10:],
            'progress': (self.current_index + 1) / len(self.packets) if self.packets else 0
        }

    def get_memory_transactions(self) -> List[Dict[str, Any]]:
        transactions = []
        for i, packet in enumerate(self.packets):
            if packet['category'] == 'Memory' and packet.get('address') is not None:
                transaction = {
                    'index': i,
                    'type': packet['tlp_type'],
                    'address': packet.get('address_hex', ''),
                    'data': packet.get('payload_hex', ''),
                    'length': packet['length_bytes'],
                    'requester': packet.get('requester_id_hex', ''),
                    'tag': packet.get('tag', 0),
                    'completed': i in self.completion_pairs
                }
                if i in self.completion_pairs:
                    comp_idx = self.completion_pairs[i]
                    if comp_idx < len(self.packets):
                        comp = self.packets[comp_idx]
                        transaction['completion_status'] = comp.get('status_name', '')
                        transaction['completion_data'] = comp.get('payload_hex', '')
                transactions.append(transaction)
        return transactions
