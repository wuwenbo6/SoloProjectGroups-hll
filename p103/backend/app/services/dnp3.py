import struct
import random
import socket
import time
from dataclasses import dataclass
from typing import List, Dict, Any, Optional, Tuple
from enum import Enum


class DNP3FunctionCode(Enum):
    CONFIRM = 0x00
    READ = 0x01
    WRITE = 0x02
    SELECT = 0x03
    OPERATE = 0x04
    DIRECT_OPERATE = 0x05
    DIRECT_OPERATE_NR = 0x06
    IMMED_FREEZE = 0x07
    IMMED_FREEZE_NR = 0x08
    FREEZE_CLEAR = 0x09
    FREEZE_CLEAR_NR = 0x0A
    FREEZE_AT_TIME = 0x0B
    FREEZE_AT_TIME_NR = 0x0C
    COLD_RESTART = 0x0D
    WARM_RESTART = 0x0E
    INITIALIZE_DATA = 0x0F
    INITIALIZE_APPLICATION = 0x10
    START_APPLICATION = 0x11
    STOP_APPLICATION = 0x12
    SAVE_CONFIGURATION = 0x13
    ENABLE_UNSOLICITED = 0x14
    DISABLE_UNSOLICITED = 0x15
    ASSIGN_CLASS = 0x16
    DELAY_MEASUREMENT = 0x17
    RECORD_CURRENT_TIME = 0x18
    OPEN_FILE = 0x19
    CLOSE_FILE = 0x1A
    DELETE_FILE = 0x1B
    GET_FILE_INFO = 0x1C
    AUTHENTICATE_FILE = 0x1D
    ABORT_FILE = 0x1E
    ACTIVATE_CONFIG = 0x1F
    AUTHENTICATE_REQ = 0x20
    AUTHENTICATE_RESP = 0x21
    REQUEST_LINK_STATUS = 0x09


class DNP3ObjectType(Enum):
    BINARY_INPUT = 1
    BINARY_INPUT_EVENT = 2
    BINARY_OUTPUT = 10
    BINARY_OUTPUT_EVENT = 11
    COUNTER = 20
    COUNTER_EVENT = 21
    ANALOG_INPUT = 30
    ANALOG_INPUT_EVENT = 32
    ANALOG_OUTPUT = 40
    ANALOG_OUTPUT_EVENT = 42
    TIME_AND_DATE = 50
    CLASS_DATA = 60
    DEVICE_ATTRIBUTES = 0


@dataclass
class DNP3Packet:
    hex_data: str
    function_code: int
    function_name: str
    description: str
    strategy: str
    object_type: Optional[int] = None


class DNP3Mutator:
    def __init__(self, source_address: int = 1, destination_address: int = 1024):
        self.source_address = source_address
        self.destination_address = destination_address
        self._packet_count = 0

    def _calculate_crc(self, data: bytes) -> int:
        crc = 0x0000
        for byte in data:
            crc ^= byte
            for _ in range(8):
                if crc & 0x0001:
                    crc = (crc >> 1) ^ 0xA001
                else:
                    crc >>= 1
        return crc

    def _build_dnp3_header(self, function_code: int, is_master: bool = True,
                          fir: bool = True, fin: bool = True,
                          con: bool = False, uns: bool = False,
                          seq: int = 0) -> bytes:
        start_bytes = b'\x05\x64'
        
        control = 0
        if is_master:
            control |= 0x40
        if fir:
            control |= 0x80
        if fin:
            control |= 0x40
        if con:
            control |= 0x20
        if uns:
            control |= 0x10
        control |= (seq & 0x0F)
        
        length = 11
        
        destination = struct.pack('<H', self.destination_address)
        source = struct.pack('<H', self.source_address)
        crc_data = struct.pack('B', control) + struct.pack('B', length) + destination + source
        crc = struct.pack('<H', self._calculate_crc(crc_data))
        
        header = start_bytes + crc_data + crc
        
        return header

    def _build_application_header(self, function_code: int, fir: bool = True, fin: bool = True,
                                  con: bool = False, uns: bool = False, seq: int = 0) -> bytes:
        control = 0
        if fir:
            control |= 0x80
        if fin:
            control |= 0x40
        if con:
            control |= 0x20
        if uns:
            control |= 0x10
        control |= (seq & 0x0F)
        
        return struct.pack('BB', control, function_code)

    def _bytes_to_hex(self, data: bytes) -> str:
        return ' '.join(f'{b:02X}' for b in data)

    def get_available_strategies(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": "dnp3_invalid_function_code",
                "name": "无效功能码",
                "description": "发送未定义的DNP3功能码",
                "category": "协议异常",
                "protocol": "dnp3"
            },
            {
                "id": "dnp3_invalid_object_type",
                "name": "无效对象类型",
                "description": "使用未定义的数据对象类型",
                "category": "数据异常",
                "protocol": "dnp3"
            },
            {
                "id": "dnp3_address_out_of_range",
                "name": "地址越界",
                "description": "访问超出范围的数据点地址",
                "category": "地址异常",
                "protocol": "dnp3"
            },
            {
                "id": "dnp3_invalid_length",
                "name": "长度字段异常",
                "description": "报文长度字段与实际数据不匹配",
                "category": "格式异常",
                "protocol": "dnp3"
            },
            {
                "id": "dnp3_crc_corrupt",
                "name": "CRC损坏",
                "description": "故意损坏CRC校验值",
                "category": "格式异常",
                "protocol": "dnp3"
            },
            {
                "id": "dnp3_header_corrupt",
                "name": "数据链路头损坏",
                "description": "损坏数据链路层头部字段",
                "category": "格式异常",
                "protocol": "dnp3"
            },
            {
                "id": "dnp3_oversized_packet",
                "name": "超大报文",
                "description": "发送超过最大长度限制的报文",
                "category": "格式异常",
                "protocol": "dnp3"
            },
            {
                "id": "dnp3_packet_truncation",
                "name": "报文截断",
                "description": "发送不完整的DNP3报文",
                "category": "格式异常",
                "protocol": "dnp3"
            },
            {
                "id": "dnp3_sequence_abuse",
                "name": "序列号滥用",
                "description": "使用重复/越界序列号",
                "category": "协议异常",
                "protocol": "dnp3"
            },
            {
                "id": "dnp3_unsolicited_flood",
                "name": "主动上报洪水",
                "description": "模拟大量主动上报报文",
                "category": "时序攻击",
                "protocol": "dnp3"
            },
            {
                "id": "dnp3_malformed_data",
                "name": "数据畸形",
                "description": "发送畸形的对象数据",
                "category": "数据异常",
                "protocol": "dnp3"
            },
            {
                "id": "dnp3_fuzzing_random",
                "name": "完全随机",
                "description": "完全随机生成DNP3报文",
                "category": "随机测试",
                "protocol": "dnp3"
            },
        ]

    def generate_read_packet(self, object_type: int = 30, variation: int = 1,
                             start_index: int = 0, count: int = 10) -> DNP3Packet:
        header = self._build_dnp3_header(DNP3FunctionCode.READ.value)
        app_header = self._build_application_header(DNP3FunctionCode.READ.value)
        
        objects = struct.pack('BBB', object_type, variation, 0x06)
        objects += struct.pack('<HH', start_index, start_index + count - 1)
        
        packet = header + app_header + objects
        
        return DNP3Packet(
            hex_data=self._bytes_to_hex(packet),
            function_code=DNP3FunctionCode.READ.value,
            function_name="READ",
            description=f"读取对象类型{object_type} 变化{variation} 索引{start_index}-{start_index+count-1}",
            strategy="dnp3_read",
            object_type=object_type
        )

    def mutate_invalid_function_code(self) -> DNP3Packet:
        invalid_fcs = [
            0x00, 0x22, 0x2F, 0x30, 0x3F, 0x40, 0x7F, 0x80, 0xFF,
            0x1A, 0x2B, 0x3C, 0x4D, 0x5E, 0x6F
        ]
        fc = random.choice(invalid_fcs)
        
        header = self._build_dnp3_header(fc)
        app_header = self._build_application_header(fc)
        packet = header + app_header
        
        return DNP3Packet(
            hex_data=self._bytes_to_hex(packet),
            function_code=fc,
            function_name=f"UNKNOWN(0x{fc:02X})",
            description=f"无效功能码 0x{fc:02X}",
            strategy="dnp3_invalid_function_code"
        )

    def mutate_invalid_object_type(self) -> DNP3Packet:
        invalid_types = [0, 15, 25, 45, 55, 100, 200, 250, 255]
        obj_type = random.choice(invalid_types)
        
        header = self._build_dnp3_header(DNP3FunctionCode.READ.value)
        app_header = self._build_application_header(DNP3FunctionCode.READ.value)
        objects = struct.pack('BBB', obj_type, random.randint(0, 10), 0x06)
        objects += struct.pack('<HH', 0, 10)
        
        packet = header + app_header + objects
        
        return DNP3Packet(
            hex_data=self._bytes_to_hex(packet),
            function_code=DNP3FunctionCode.READ.value,
            function_name="READ",
            description=f"无效对象类型 {obj_type}",
            strategy="dnp3_invalid_object_type",
            object_type=obj_type
        )

    def mutate_address_out_of_range(self) -> DNP3Packet:
        invalid_ranges = [
            (0xFF00, 0xFFFF),
            (0x10000, 0x100FF),
            (65000, 70000),
            (0, 65535),
        ]
        start, end = random.choice(invalid_ranges)
        
        header = self._build_dnp3_header(DNP3FunctionCode.READ.value)
        app_header = self._build_application_header(DNP3FunctionCode.READ.value)
        objects = struct.pack('BBB', 30, 1, 0x06)
        objects += struct.pack('<HH', start, min(end, 65535))
        
        packet = header + app_header + objects
        
        return DNP3Packet(
            hex_data=self._bytes_to_hex(packet),
            function_code=DNP3FunctionCode.READ.value,
            function_name="READ",
            description=f"地址越界 {start}-{min(end, 65535)}",
            strategy="dnp3_address_out_of_range",
            object_type=30
        )

    def mutate_invalid_length(self) -> DNP3Packet:
        header = self._build_dnp3_header(DNP3FunctionCode.READ.value)
        app_header = self._build_application_header(DNP3FunctionCode.READ.value)
        
        length_pos = 2
        wrong_length = random.choice([1, 5, 255, 250, 100])
        header_list = list(header)
        header_list[length_pos] = wrong_length
        header = bytes(header_list)
        
        packet = header + app_header
        
        return DNP3Packet(
            hex_data=self._bytes_to_hex(packet),
            function_code=DNP3FunctionCode.READ.value,
            function_name="READ",
            description=f"长度字段异常 (声明:{wrong_length})",
            strategy="dnp3_invalid_length"
        )

    def mutate_crc_corrupt(self) -> DNP3Packet:
        header = self._build_dnp3_header(DNP3FunctionCode.READ.value)
        app_header = self._build_application_header(DNP3FunctionCode.READ.value)
        
        header_list = list(header)
        header_list[-2] ^= 0xFF
        header_list[-1] ^= 0xFF
        header = bytes(header_list)
        
        packet = header + app_header
        
        return DNP3Packet(
            hex_data=self._bytes_to_hex(packet),
            function_code=DNP3FunctionCode.READ.value,
            function_name="READ",
            description="CRC校验值损坏",
            strategy="dnp3_crc_corrupt"
        )

    def mutate_header_corrupt(self) -> DNP3Packet:
        header = self._build_dnp3_header(DNP3FunctionCode.READ.value)
        
        corrupt_type = random.choice(['start', 'control', 'dest', 'src'])
        header_list = list(header)
        
        if corrupt_type == 'start':
            header_list[0] = random.randint(0, 255)
            header_list[1] = random.randint(0, 255)
        elif corrupt_type == 'control':
            header_list[2] = random.randint(0, 255)
        elif corrupt_type == 'dest':
            header_list[4] ^= 0xFF
            header_list[5] ^= 0xFF
        else:
            header_list[6] ^= 0xFF
            header_list[7] ^= 0xFF
        
        header = bytes(header_list)
        app_header = self._build_application_header(DNP3FunctionCode.READ.value)
        packet = header + app_header
        
        return DNP3Packet(
            hex_data=self._bytes_to_hex(packet),
            function_code=DNP3FunctionCode.READ.value,
            function_name="READ",
            description=f"数据链路头损坏 ({corrupt_type})",
            strategy="dnp3_header_corrupt"
        )

    def mutate_oversized_packet(self) -> DNP3Packet:
        header = self._build_dnp3_header(DNP3FunctionCode.READ.value)
        app_header = self._build_application_header(DNP3FunctionCode.READ.value)
        
        extra_data = bytes([random.randint(0, 255) for _ in range(random.randint(300, 1000))])
        packet = header + app_header + extra_data
        
        return DNP3Packet(
            hex_data=self._bytes_to_hex(packet),
            function_code=DNP3FunctionCode.READ.value,
            function_name="READ",
            description=f"超大报文 ({len(packet)}字节)",
            strategy="dnp3_oversized_packet"
        )

    def mutate_packet_truncation(self) -> DNP3Packet:
        header = self._build_dnp3_header(DNP3FunctionCode.READ.value)
        app_header = self._build_application_header(DNP3FunctionCode.READ.value)
        objects = struct.pack('BBB', 30, 1, 0x06) + struct.pack('<HH', 0, 10)
        
        full_packet = header + app_header + objects
        truncate_len = random.randint(3, len(full_packet) - 1)
        truncated = full_packet[:truncate_len]
        
        return DNP3Packet(
            hex_data=self._bytes_to_hex(truncated),
            function_code=DNP3FunctionCode.READ.value,
            function_name="READ",
            description=f"报文截断 ({truncate_len}/{len(full_packet)}字节)",
            strategy="dnp3_packet_truncation"
        )

    def mutate_sequence_abuse(self) -> DNP3Packet:
        seq_type = random.choice(['max', 'zero', 'repeat', 'jump'])
        
        if seq_type == 'max':
            seq = 0x0F
        elif seq_type == 'zero':
            seq = 0
        elif seq_type == 'repeat':
            seq = self._packet_count % 16
        else:
            seq = random.randint(0, 15)
        
        header = self._build_dnp3_header(DNP3FunctionCode.READ.value, seq=seq)
        app_header = self._build_application_header(DNP3FunctionCode.READ.value, seq=seq)
        packet = header + app_header
        
        self._packet_count += 1
        
        return DNP3Packet(
            hex_data=self._bytes_to_hex(packet),
            function_code=DNP3FunctionCode.READ.value,
            function_name="READ",
            description=f"序列号异常 ({seq_type}: {seq})",
            strategy="dnp3_sequence_abuse"
        )

    def mutate_unsolicited_flood(self) -> DNP3Packet:
        header = self._build_dnp3_header(DNP3FunctionCode.READ.value, is_master=False, uns=True)
        app_header = self._build_application_header(
            DNP3FunctionCode.READ.value, uns=True
        )
        
        object_count = random.randint(50, 200)
        objects = b''
        for i in range(object_count):
            objects += struct.pack('BB', 2, 1)
            objects += struct.pack('B', 0x07)
            objects += struct.pack('<H', i)
            objects += bytes([random.randint(0, 1)])
        
        packet = header + app_header + objects
        
        return DNP3Packet(
            hex_data=self._bytes_to_hex(packet),
            function_code=DNP3FunctionCode.READ.value,
            function_name="UNSOLICITED",
            description=f"主动上报洪水 ({object_count}个对象)",
            strategy="dnp3_unsolicited_flood"
        )

    def mutate_malformed_data(self) -> DNP3Packet:
        header = self._build_dnp3_header(DNP3FunctionCode.WRITE.value)
        app_header = self._build_application_header(DNP3FunctionCode.WRITE.value)
        
        data_type = random.choice(['zeros', 'ones', 'pattern', 'random', 'boundary'])
        if data_type == 'zeros':
            data = b'\x00' * random.randint(10, 100)
        elif data_type == 'ones':
            data = b'\xFF' * random.randint(10, 100)
        elif data_type == 'pattern':
            data = b'\xAA\x55' * random.randint(5, 50)
        elif data_type == 'boundary':
            data = b'\x7F\xFF\x80\x00' * random.randint(5, 50)
        else:
            data = bytes([random.randint(0, 255) for _ in range(random.randint(10, 100))])
        
        packet = header + app_header + data
        
        return DNP3Packet(
            hex_data=self._bytes_to_hex(packet),
            function_code=DNP3FunctionCode.WRITE.value,
            function_name="WRITE",
            description=f"畸形数据 ({data_type}, {len(data)}字节)",
            strategy="dnp3_malformed_data"
        )

    def mutate_fuzzing_random(self) -> DNP3Packet:
        packet_len = random.randint(10, 500)
        random_data = bytes([random.randint(0, 255) for _ in range(packet_len)])
        
        return DNP3Packet(
            hex_data=self._bytes_to_hex(random_data),
            function_code=0x00,
            function_name="RANDOM",
            description=f"完全随机报文 ({packet_len}字节)",
            strategy="dnp3_fuzzing_random"
        )

    def generate_mutation(self, strategy_id: Optional[str] = None) -> DNP3Packet:
        strategies = {
            "dnp3_invalid_function_code": self.mutate_invalid_function_code,
            "dnp3_invalid_object_type": self.mutate_invalid_object_type,
            "dnp3_address_out_of_range": self.mutate_address_out_of_range,
            "dnp3_invalid_length": self.mutate_invalid_length,
            "dnp3_crc_corrupt": self.mutate_crc_corrupt,
            "dnp3_header_corrupt": self.mutate_header_corrupt,
            "dnp3_oversized_packet": self.mutate_oversized_packet,
            "dnp3_packet_truncation": self.mutate_packet_truncation,
            "dnp3_sequence_abuse": self.mutate_sequence_abuse,
            "dnp3_unsolicited_flood": self.mutate_unsolicited_flood,
            "dnp3_malformed_data": self.mutate_malformed_data,
            "dnp3_fuzzing_random": self.mutate_fuzzing_random,
        }
        
        if strategy_id and strategy_id in strategies:
            return strategies[strategy_id]()
        
        chosen_strategy = random.choice(list(strategies.keys()))
        return strategies[chosen_strategy]()


class DNP3HealthMonitor:
    def __init__(self, ip_address: str, port: int = 20000, timeout: int = 5000):
        self.ip_address = ip_address
        self.port = port
        self.timeout = timeout / 1000.0
        self._consecutive_failures = 0
        self._failure_threshold = 3

    def check_tcp_connection(self) -> Tuple[bool, str]:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(self.timeout)
            result = sock.connect_ex((self.ip_address, self.port))
            sock.close()
            
            if result == 0:
                self._consecutive_failures = 0
                return True, "TCP连接正常"
            else:
                self._consecutive_failures += 1
                return False, f"TCP连接失败 (错误码: {result})"
        except Exception as e:
            self._consecutive_failures += 1
            return False, f"TCP连接异常: {str(e)}"

    def check_dnp3_protocol(self) -> Tuple[bool, str]:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(self.timeout)
            sock.connect((self.ip_address, self.port))
            
            mutator = DNP3Mutator()
            test_packet = mutator.generate_read_packet(object_type=30, variation=1, start_index=0, count=1)
            packet_bytes = bytes.fromhex(test_packet.hex_data.replace(' ', ''))
            
            sock.send(packet_bytes)
            response = sock.recv(1024)
            sock.close()
            
            if len(response) >= 5 and response[:2] == b'\x05\x64':
                self._consecutive_failures = 0
                return True, f"DNP3协议正常 (响应{len(response)}字节)"
            else:
                self._consecutive_failures += 1
                return False, f"无效响应 ({len(response)}字节)"
                
        except socket.timeout:
            self._consecutive_failures += 1
            return False, "DNP3请求超时"
        except Exception as e:
            self._consecutive_failures += 1
            return False, f"DNP3检测异常: {str(e)}"

    def is_crash_detected(self) -> Tuple[bool, str]:
        tcp_ok, tcp_msg = self.check_tcp_connection()
        if not tcp_ok:
            if self._consecutive_failures >= self._failure_threshold:
                return True, f"TCP连接失败 - {tcp_msg}"
            return False, tcp_msg
        
        dnp3_ok, dnp3_msg = self.check_dnp3_protocol()
        if not dnp3_ok:
            if self._consecutive_failures >= self._failure_threshold:
                return True, f"DNP3协议无响应 - {dnp3_msg}"
            return False, dnp3_msg
        
        return False, "设备正常"
