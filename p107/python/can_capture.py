import time
import random
import threading
from queue import Queue
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Tuple


@dataclass
class CANMessage:
    timestamp: float
    can_id: int
    data: List[int]
    dlc: int
    is_extended: bool = False
    is_j1939: bool = False
    pgn: int = 0
    source_address: int = 0
    destination_address: int = 0


@dataclass
class J1939TPReassembly:
    pgn: int
    source_address: int
    destination_address: int
    total_size: int
    data: List[int] = field(default_factory=list)
    expected_packets: int = 0
    received_packets: set = field(default_factory=set)
    last_activity: float = 0.0
    is_broadcast: bool = False


class CANCapture:
    def __init__(self, use_virtual: bool = True, channel: str = 'PCAN_USBBUS1', enable_j1939: bool = True):
        self.use_virtual = use_virtual
        self.channel = channel
        self.enable_j1939 = enable_j1939
        self.message_queue = Queue()
        self.is_running = False
        self.capture_thread = None
        self.bus = None
        self._j1939_sessions: Dict[Tuple[int, int, int], J1939TPReassembly] = {}
        self._j1939_cleanup_interval = 5.0
        self._last_j1939_cleanup = 0.0
        self._epoch_start = 0.0

    def start(self):
        if self.is_running:
            return
        self.is_running = True
        self.message_queue.queue.clear()
        self._j1939_sessions.clear()
        self._epoch_start = time.perf_counter()
        
        if self.use_virtual:
            self.capture_thread = threading.Thread(target=self._virtual_capture_loop, daemon=True)
        else:
            self.capture_thread = threading.Thread(target=self._pcan_capture_loop, daemon=True)
        self.capture_thread.start()

    def _get_high_precision_timestamp(self) -> float:
        return time.perf_counter() - self._epoch_start

    def stop(self):
        self.is_running = False
        if self.capture_thread:
            self.capture_thread.join(timeout=2.0)
        if self.bus:
            self.bus.shutdown()
            self.bus = None

    def get_messages(self, max_count: int = 10000) -> List[dict]:
        messages = []
        count = 0
        while not self.message_queue.empty() and count < max_count:
            msg = self.message_queue.get()
            messages.append({
                'timestamp': msg.timestamp,
                'can_id': msg.can_id,
                'data': msg.data,
                'dlc': msg.dlc,
                'is_extended': msg.is_extended,
                'is_j1939': getattr(msg, 'is_j1939', False),
                'pgn': getattr(msg, 'pgn', 0),
                'source_address': getattr(msg, 'source_address', 0),
                'destination_address': getattr(msg, 'destination_address', 0)
            })
            count += 1
        return messages

    def _process_j1939_message(self, can_id: int, data: List[int], timestamp: float) -> Optional[CANMessage]:
        if not self.enable_j1939:
            return None
        
        if (can_id & 0x80000000) == 0:
            return None
        
        pdu_format = (can_id >> 16) & 0xFF
        pdu_specific = (can_id >> 8) & 0xFF
        source_address = can_id & 0xFF
        
        if pdu_format < 240:
            pgn = (pdu_format << 8) | pdu_specific
            destination_address = pdu_specific
        else:
            pgn = pdu_format << 8
            destination_address = 0xFF
        
        if pgn == 0xEC00:
            return self._handle_tp_cm(data, source_address, destination_address, timestamp)
        elif pgn == 0xEB00:
            return self._handle_tp_dt(data, source_address, destination_address, timestamp)
        else:
            return CANMessage(
                timestamp=timestamp,
                can_id=can_id,
                data=data,
                dlc=len(data),
                is_extended=True,
                is_j1939=True,
                pgn=pgn,
                source_address=source_address,
                destination_address=destination_address
            )
    
    def _handle_tp_cm(self, data: List[int], source_address: int, 
                      destination_address: int, timestamp: float) -> Optional[CANMessage]:
        if len(data) < 8:
            return None
        
        control_byte = data[0]
        
        if control_byte == 16:
            total_size = data[1] | (data[2] << 8)
            num_packets = data[3]
            pgn = data[5] | (data[6] << 8) | (data[7] << 16)
            
            session_key = (pgn, source_address, destination_address)
            self._j1939_sessions[session_key] = J1939TPReassembly(
                pgn=pgn,
                source_address=source_address,
                destination_address=destination_address,
                total_size=total_size,
                expected_packets=num_packets,
                last_activity=timestamp,
                is_broadcast=(destination_address == 0xFF)
            )
        
        elif control_byte == 19:
            pgn = data[5] | (data[6] << 8) | (data[7] << 16)
            session_key = (pgn, source_address, destination_address)
            if session_key in self._j1939_sessions:
                del self._j1939_sessions[session_key]
        
        return None
    
    def _handle_tp_dt(self, data: List[int], source_address: int,
                      destination_address: int, timestamp: float) -> Optional[CANMessage]:
        if len(data) < 8:
            return None
        
        sequence_number = data[0]
        packet_data = data[1:8]
        
        for session_key, session in list(self._j1939_sessions.items()):
            pgn, sa, da = session_key
            if sa == source_address and (da == destination_address or session.is_broadcast):
                if sequence_number not in session.received_packets:
                    session.data.extend(packet_data)
                    session.received_packets.add(sequence_number)
                    session.last_activity = timestamp
                
                if len(session.received_packets) >= session.expected_packets:
                    full_data = session.data[:session.total_size]
                    del self._j1939_sessions[session_key]
                    
                    can_id = (0x80000000 | (pgn << 8) | source_address)
                    return CANMessage(
                        timestamp=timestamp,
                        can_id=can_id,
                        data=full_data,
                        dlc=len(full_data),
                        is_extended=True,
                        is_j1939=True,
                        pgn=pgn,
                        source_address=source_address,
                        destination_address=da
                    )
        
        return None
    
    def _cleanup_j1939_sessions(self, current_time: float):
        if current_time - self._last_j1939_cleanup < self._j1939_cleanup_interval:
            return
        
        self._last_j1939_cleanup = current_time
        timeout = 10.0
        
        expired_keys = []
        for key, session in self._j1939_sessions.items():
            if current_time - session.last_activity > timeout:
                expired_keys.append(key)
        
        for key in expired_keys:
            del self._j1939_sessions[key]

    def _virtual_capture_loop(self):
        known_ids = [0x100, 0x200, 0x300, 0x400, 0x500]
        
        while self.is_running:
            current_time = self._get_high_precision_timestamp()
            
            for can_id in known_ids:
                if random.random() < 0.3:
                    data = self._generate_virtual_data(can_id, current_time)
                    msg = CANMessage(
                        timestamp=current_time,
                        can_id=can_id,
                        data=data,
                        dlc=len(data)
                    )
                    self.message_queue.put(msg)
            
            if random.random() < 0.1:
                can_id = random.randint(0x600, 0x7FF)
                data = [random.randint(0, 255) for _ in range(random.randint(4, 8))]
                msg = CANMessage(
                    timestamp=current_time,
                    can_id=can_id,
                    data=data,
                    dlc=len(data)
                )
                self.message_queue.put(msg)
            
            if random.random() < 0.05 and self.enable_j1939:
                j1939_msgs = self._generate_virtual_j1939(current_time)
                for msg in j1939_msgs:
                    if msg.is_extended:
                        reassembled = self._process_j1939_message(
                            msg.can_id, msg.data, msg.timestamp
                        )
                        if reassembled:
                            self.message_queue.put(reassembled)
                    self.message_queue.put(msg)
            
            self._cleanup_j1939_sessions(current_time)
            
            time.sleep(0.005)
    
    def _generate_virtual_j1939(self, timestamp: float) -> List[CANMessage]:
        messages = []
        
        if not hasattr(self, '_j1939_tx_state'):
            self._j1939_tx_state = None
        
        if self._j1939_tx_state is None and random.random() < 0.3:
            large_data_size = random.randint(20, 50)
            self._j1939_tx_state = {
                'data': [random.randint(0, 255) for _ in range(large_data_size)],
                'packet_index': 0,
                'total_packets': (large_data_size + 6) // 7,
                'phase': 'RTS',
                'pgn': 0xFF01,
                'source_addr': 0x20,
                'dest_addr': 0xFF,
                'data_size': large_data_size
            }
            
            state = self._j1939_tx_state
            can_id = 0x80EC00FF | state['source_addr']
            data = [
                16,
                state['data_size'] & 0xFF,
                (state['data_size'] >> 8) & 0xFF,
                state['total_packets'],
                0xFF,
                state['pgn'] & 0xFF,
                (state['pgn'] >> 8) & 0xFF,
                (state['pgn'] >> 16) & 0xFF
            ]
            messages.append(CANMessage(
                timestamp=timestamp,
                can_id=can_id,
                data=data,
                dlc=8,
                is_extended=True,
                is_j1939=True
            ))
            return messages
        
        if self._j1939_tx_state and self._j1939_tx_state['phase'] == 'RTS':
            self._j1939_tx_state['phase'] = 'DATA'
        
        if self._j1939_tx_state and self._j1939_tx_state['phase'] == 'DATA':
            state = self._j1939_tx_state
            if state['packet_index'] < state['total_packets']:
                can_id = 0x80EB00FF | state['source_addr']
                start_byte = state['packet_index'] * 7
                packet_data = state['data'][start_byte:start_byte + 7]
                while len(packet_data) < 7:
                    packet_data.append(0xFF)
                
                data = [state['packet_index'] + 1] + packet_data
                messages.append(CANMessage(
                    timestamp=timestamp,
                    can_id=can_id,
                    data=data,
                    dlc=8,
                    is_extended=True,
                    is_j1939=True
                ))
                
                state['packet_index'] += 1
                if state['packet_index'] >= state['total_packets']:
                    self._j1939_tx_state = None
        
        return messages

    def _generate_virtual_data(self, can_id: int, timestamp: float) -> List[int]:
        data = [0] * 8
        
        if can_id == 0x100:
            speed = int(50 + 30 * abs(hash(timestamp) % 100) / 100)
            data[0] = (speed >> 8) & 0xFF
            data[1] = speed & 0xFF
            
            rpm = int(1000 + 500 * abs(hash(timestamp * 2) % 100) / 100)
            data[2] = (rpm >> 8) & 0xFF
            data[3] = rpm & 0xFF
        
        elif can_id == 0x200:
            temp = int(80 + 20 * abs(hash(timestamp * 0.5) % 100) / 100)
            data[0] = temp
            
            pressure = int(2500 + 500 * abs(hash(timestamp * 1.5) % 100) / 100)
            data[2] = (pressure >> 8) & 0xFF
            data[3] = pressure & 0xFF
        
        elif can_id == 0x300:
            throttle = int(50 * abs(hash(timestamp * 0.8) % 100) / 100)
            data[0] = throttle
            
            brake = int(30 * abs(hash(timestamp * 1.2) % 100) / 100)
            data[1] = brake
        
        elif can_id == 0x400:
            voltage = int(12000 + 200 * abs(hash(timestamp * 0.3) % 100) / 100)
            data[0] = (voltage >> 8) & 0xFF
            data[1] = voltage & 0xFF
            
            current = int(50 + 20 * abs(hash(timestamp * 0.7) % 100) / 100)
            data[2] = current
        
        elif can_id == 0x500:
            flags = 0
            if hash(timestamp) % 2 == 0:
                flags |= 0x01
            if hash(timestamp * 2) % 3 == 0:
                flags |= 0x02
            data[0] = flags
            
            counter = int(timestamp * 10) & 0xFF
            data[1] = counter
        
        return data

    def _pcan_capture_loop(self):
        try:
            import can
            self.bus = can.interface.Bus(channel=self.channel, interface='pcan')
            
            while self.is_running:
                msg = self.bus.recv(timeout=0.1)
                if msg:
                    current_time = self._get_high_precision_timestamp()
                    data = list(msg.data)
                    
                    if msg.is_extended_id and self.enable_j1939:
                        j1939_msg = self._process_j1939_message(
                            msg.arbitration_id, data, current_time
                        )
                        if j1939_msg:
                            self.message_queue.put(j1939_msg)
                    
                    can_msg = CANMessage(
                        timestamp=current_time,
                        can_id=msg.arbitration_id,
                        data=data,
                        dlc=msg.dlc,
                        is_extended=msg.is_extended_id
                    )
                    self.message_queue.put(can_msg)
                    
                    self._cleanup_j1939_sessions(current_time)
        except Exception as e:
            print(f"PCAN capture error: {e}")
            self.is_running = False


if __name__ == '__main__':
    capture = CANCapture(use_virtual=True)
    capture.start()
    time.sleep(2)
    capture.stop()
    
    messages = capture.get_messages()
    print(f"Captured {len(messages)} messages")
    for msg in messages[:5]:
        print(f"ID: 0x{msg['can_id']:03X}, Data: {msg['data']}")
