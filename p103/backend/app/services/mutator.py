import random
import struct
from typing import List, Dict, Any, Tuple, Optional
from dataclasses import dataclass


@dataclass
class MutatedPacket:
    hex_data: str
    function_code: int
    description: str
    strategy: str


class ModbusMutator:
    STANDARD_FUNCTION_CODES = {
        0x01: "Read Coils",
        0x02: "Read Discrete Inputs",
        0x03: "Read Holding Registers",
        0x04: "Read Input Registers",
        0x05: "Write Single Coil",
        0x06: "Write Single Register",
        0x0F: "Write Multiple Coils",
        0x10: "Write Multiple Registers",
    }

    def __init__(self, slave_id: int = 1):
        self.slave_id = slave_id
        self.transaction_id = 0

    def _generate_transaction_id(self) -> int:
        self.transaction_id = (self.transaction_id + 1) % 0x10000
        return self.transaction_id

    def _build_modbus_tcp(self, pdu: bytes) -> bytes:
        tid = self._generate_transaction_id()
        mbap = struct.pack('>HHH', tid, 0, len(pdu))
        return mbap + pdu

    def _bytes_to_hex(self, data: bytes) -> str:
        return ' '.join(f'{b:02X}' for b in data)

    def get_available_strategies(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": "invalid_function_code",
                "name": "无效功能码",
                "description": "发送未定义的功能码测试设备容错能力",
                "category": "协议异常"
            },
            {
                "id": "subfunction_code_invalid",
                "name": "子功能码异常",
                "description": "诊断功能码使用无效子功能码",
                "category": "协议异常"
            },
            {
                "id": "address_out_of_range",
                "name": "地址越界",
                "description": "访问超出设备范围的寄存器/线圈地址",
                "category": "地址异常"
            },
            {
                "id": "invalid_data_length",
                "name": "数据长度异常",
                "description": "发送与功能码不匹配的数据长度",
                "category": "格式异常"
            },
            {
                "id": "malformed_data",
                "name": "数据畸形",
                "description": "发送随机或边界值数据",
                "category": "数据异常"
            },
            {
                "id": "byte_order_flip",
                "name": "字节序翻转",
                "description": "翻转字节序测试大小端处理",
                "category": "数据异常"
            },
            {
                "id": "invalid_slave_id",
                "name": "从站ID异常",
                "description": "使用无效或广播从站ID",
                "category": "地址异常"
            },
            {
                "id": "packet_truncation",
                "name": "报文截断",
                "description": "发送不完整的Modbus报文",
                "category": "格式异常"
            },
            {
                "id": "oversized_packet",
                "name": "超大报文",
                "description": "发送超过最大长度限制的报文",
                "category": "格式异常"
            },
            {
                "id": "mbap_header_corrupt",
                "name": "MBAP头损坏",
                "description": "损坏MBAP头字段测试解析器",
                "category": "格式异常"
            },
            {
                "id": "protocol_id_invalid",
                "name": "协议ID异常",
                "description": "使用非0协议ID",
                "category": "协议异常"
            },
            {
                "id": "length_field_invalid",
                "name": "长度字段异常",
                "description": "MBAP长度字段与实际PDU不匹配",
                "category": "格式异常"
            },
            {
                "id": "transaction_id_abuse",
                "name": "事务ID异常",
                "description": "使用重复/越界/特殊事务ID",
                "category": "协议异常"
            },
            {
                "id": "diagnostic_fuzzing",
                "name": "诊断功能模糊",
                "description": "功能码08子功能码边界测试",
                "category": "协议异常"
            },
            {
                "id": "fifo_overflow",
                "name": "FIFO溢出测试",
                "description": "快速连续发送报文测试缓冲区",
                "category": "时序攻击"
            },
            {
                "id": "null_byte_injection",
                "name": "空字节注入",
                "description": "在报文中插入空字节",
                "category": "注入攻击"
            },
            {
                "id": "fuzzing_random",
                "name": "完全随机",
                "description": "完全随机生成报文内容",
                "category": "随机测试"
            },
            {
                "id": "bit_flip",
                "name": "位翻转攻击",
                "description": "随机翻转报文中的特定位",
                "category": "注入攻击"
            },
            {
                "id": "magic_value_injection",
                "name": "魔法值注入",
                "description": "注入经典漏洞触发值",
                "category": "注入攻击"
            }
        ]

    def mutate_invalid_function_code(self) -> MutatedPacket:
        invalid_codes = [0x00, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E,
                         0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x7F, 0xFF]
        fc = random.choice(invalid_codes)
        address = random.randint(0, 100)
        quantity = random.randint(1, 10)
        
        pdu = struct.pack('>BBHH', self.slave_id, fc, address, quantity)
        packet = self._build_modbus_tcp(pdu)
        
        return MutatedPacket(
            hex_data=self._bytes_to_hex(packet),
            function_code=fc,
            description=f"无效功能码 0x{fc:02X}",
            strategy="invalid_function_code"
        )

    def mutate_address_out_of_range(self) -> MutatedPacket:
        fc = random.choice([0x01, 0x02, 0x03, 0x04, 0x05, 0x06])
        extreme_addresses = [
            0xFFFF, 0xFFFE, 0x8000, 0x7FFF, 0x0000,
            0x10000, 0x20000, 0xFFFFF
        ]
        address = random.choice(extreme_addresses)
        quantity = random.randint(1, 125)
        
        if fc in [0x05, 0x06]:
            value = random.randint(0, 0xFFFF)
            pdu = struct.pack('>BBHH', self.slave_id, fc, address, value)
        else:
            pdu = struct.pack('>BBHH', self.slave_id, fc, address, quantity)
        
        packet = self._build_modbus_tcp(pdu)
        
        return MutatedPacket(
            hex_data=self._bytes_to_hex(packet),
            function_code=fc,
            description=f"地址越界 0x{address:04X}",
            strategy="address_out_of_range"
        )

    def mutate_invalid_data_length(self) -> MutatedPacket:
        fc = random.choice([0x01, 0x02, 0x03, 0x04, 0x0F, 0x10])
        address = random.randint(0, 100)
        
        if fc in [0x0F, 0x10]:
            quantity = random.randint(1, 100)
            byte_count = random.choice([0, 1, 250, 253, 254, 255])
            data = bytes([random.randint(0, 255) for _ in range(byte_count)])
            pdu = struct.pack(f'>BBHHB', self.slave_id, fc, address, quantity, byte_count) + data
        else:
            pdu = struct.pack('>BBH', self.slave_id, fc, address)
        
        packet = self._build_modbus_tcp(pdu)
        
        return MutatedPacket(
            hex_data=self._bytes_to_hex(packet),
            function_code=fc,
            description="数据长度异常",
            strategy="invalid_data_length"
        )

    def mutate_malformed_data(self) -> MutatedPacket:
        fc = random.choice(list(self.STANDARD_FUNCTION_CODES.keys()))
        address = random.randint(0, 100)
        
        boundary_values = [
            0x0000, 0x0001, 0x7FFF, 0x8000, 0xFFFF,
            0xDEAD, 0xBEEF, 0xCAFE, 0xAAAA, 0x5555
        ]
        
        if fc in [0x01, 0x02, 0x03, 0x04]:
            quantity = random.choice(boundary_values)
            pdu = struct.pack('>BBHH', self.slave_id, fc, address, quantity)
        elif fc in [0x05, 0x06]:
            value = random.choice(boundary_values)
            pdu = struct.pack('>BBHH', self.slave_id, fc, address, value)
        else:
            quantity = random.randint(1, 10)
            values = [random.choice(boundary_values) for _ in range(quantity)]
            byte_count = quantity * 2
            pdu = struct.pack(f'>BBHHB{quantity}H', self.slave_id, fc, address, quantity, byte_count, *values)
        
        packet = self._build_modbus_tcp(pdu)
        
        return MutatedPacket(
            hex_data=self._bytes_to_hex(packet),
            function_code=fc,
            description="边界/畸形数据测试",
            strategy="malformed_data"
        )

    def mutate_invalid_slave_id(self) -> MutatedPacket:
        invalid_slave_ids = [0, 248, 249, 250, 251, 252, 253, 254, 255]
        sid = random.choice(invalid_slave_ids)
        fc = random.choice(list(self.STANDARD_FUNCTION_CODES.keys()))
        address = random.randint(0, 100)
        quantity = random.randint(1, 10)
        
        pdu = struct.pack('>BBHH', sid, fc, address, quantity)
        packet = self._build_modbus_tcp(pdu)
        
        return MutatedPacket(
            hex_data=self._bytes_to_hex(packet),
            function_code=fc,
            description=f"无效从站ID {sid}",
            strategy="invalid_slave_id"
        )

    def mutate_packet_truncation(self) -> MutatedPacket:
        fc = random.choice(list(self.STANDARD_FUNCTION_CODES.keys()))
        address = random.randint(0, 100)
        quantity = random.randint(1, 10)
        
        full_pdu = struct.pack('>BBHH', self.slave_id, fc, address, quantity)
        truncate_len = random.randint(1, len(full_pdu) - 1)
        truncated_pdu = full_pdu[:truncate_len]
        
        packet = self._build_modbus_tcp(truncated_pdu)
        
        return MutatedPacket(
            hex_data=self._bytes_to_hex(packet),
            function_code=fc,
            description=f"截断报文 (长度: {len(packet)}字节)",
            strategy="packet_truncation"
        )

    def mutate_oversized_packet(self) -> MutatedPacket:
        fc = random.choice([0x0F, 0x10])
        address = random.randint(0, 100)
        quantity = random.randint(200, 500)
        byte_count = min(250, quantity * 2)
        data = bytes([random.randint(0, 255) for _ in range(byte_count)])
        
        pdu = struct.pack(f'>BBHHB', self.slave_id, fc, address, quantity, byte_count) + data
        packet = self._build_modbus_tcp(pdu)
        
        return MutatedPacket(
            hex_data=self._bytes_to_hex(packet),
            function_code=fc,
            description=f"超大报文 (数量: {quantity})",
            strategy="oversized_packet"
        )

    def mutate_fuzzing_random(self) -> MutatedPacket:
        packet_len = random.randint(8, 256)
        random_data = bytes([random.randint(0, 255) for _ in range(packet_len)])
        
        return MutatedPacket(
            hex_data=self._bytes_to_hex(random_data),
            function_code=0x00,
            description=f"完全随机报文 (长度: {packet_len}字节)",
            strategy="fuzzing_random"
        )

    def mutate_subfunction_code_invalid(self) -> MutatedPacket:
        fc = 0x08
        invalid_subfunctions = [0x0001, 0x0002, 0x0003, 0x0005, 0x0006, 
                                 0x0010, 0x00FF, 0x0100, 0xFFFF, 0xDEAD]
        subfunc = random.choice(invalid_subfunctions)
        data = random.randint(0, 0xFFFF)
        
        pdu = struct.pack('>BBHH', self.slave_id, fc, subfunc, data)
        packet = self._build_modbus_tcp(pdu)
        
        return MutatedPacket(
            hex_data=self._bytes_to_hex(packet),
            function_code=fc,
            description=f"诊断功能码08无效子功能 0x{subfunc:04X}",
            strategy="subfunction_code_invalid"
        )

    def mutate_byte_order_flip(self) -> MutatedPacket:
        fc = random.choice([0x03, 0x06, 0x10])
        address = random.randint(0, 100)
        
        if fc == 0x03:
            quantity = random.randint(1, 10)
            pdu = struct.pack('>BBHH', self.slave_id, fc, address, quantity)
            flipped_pdu = bytes([b for b in pdu[::-1]])
        elif fc == 0x06:
            value = random.randint(0, 0xFFFF)
            value_bytes = struct.pack('>H', value)
            flipped_value = struct.unpack('<H', value_bytes)[0]
            pdu = struct.pack('>BBHH', self.slave_id, fc, address, flipped_value)
            flipped_pdu = pdu
        else:
            quantity = random.randint(1, 5)
            values = [random.randint(0, 0xFFFF) for _ in range(quantity)]
            pdu = struct.pack(f'>BBHHB{quantity}H', self.slave_id, fc, address, quantity, quantity*2, *values)
            flipped_pdu = pdu
        
        packet = self._build_modbus_tcp(flipped_pdu)
        
        return MutatedPacket(
            hex_data=self._bytes_to_hex(packet),
            function_code=fc,
            description="字节序翻转测试",
            strategy="byte_order_flip"
        )

    def mutate_mbap_header_corrupt(self) -> MutatedPacket:
        fc = random.choice(list(self.STANDARD_FUNCTION_CODES.keys()))
        address = random.randint(0, 100)
        quantity = random.randint(1, 10)
        pdu = struct.pack('>BBHH', self.slave_id, fc, address, quantity)
        
        corrupt_type = random.choice(['tid', 'pid', 'length', 'all'])
        
        if corrupt_type == 'tid':
            tid = random.choice([0xFFFF, 0x0000, 0xDEAD, 0xBEEF])
            mbap = struct.pack('>HHH', tid, 0, len(pdu))
        elif corrupt_type == 'pid':
            pid = random.choice([1, 2, 5, 0xFFFF])
            mbap = struct.pack('>HHH', self._generate_transaction_id(), pid, len(pdu))
        elif corrupt_type == 'length':
            mbap = struct.pack('>HHH', self._generate_transaction_id(), 0, random.randint(1, 5))
        else:
            mbap = struct.pack('>HHH', random.randint(0, 0xFFFF), 
                               random.randint(0, 0xFFFF), 
                               random.randint(1, 255))
        
        packet = mbap + pdu
        
        return MutatedPacket(
            hex_data=self._bytes_to_hex(packet),
            function_code=fc,
            description=f"MBAP头损坏 ({corrupt_type})",
            strategy="mbap_header_corrupt"
        )

    def mutate_protocol_id_invalid(self) -> MutatedPacket:
        fc = random.choice(list(self.STANDARD_FUNCTION_CODES.keys()))
        address = random.randint(0, 100)
        quantity = random.randint(1, 10)
        pdu = struct.pack('>BBHH', self.slave_id, fc, address, quantity)
        
        invalid_pids = [1, 2, 3, 5, 10, 0x0100, 0xFFFF, 0x5A5A]
        pid = random.choice(invalid_pids)
        mbap = struct.pack('>HHH', self._generate_transaction_id(), pid, len(pdu))
        packet = mbap + pdu
        
        return MutatedPacket(
            hex_data=self._bytes_to_hex(packet),
            function_code=fc,
            description=f"无效协议ID 0x{pid:04X}",
            strategy="protocol_id_invalid"
        )

    def mutate_length_field_invalid(self) -> MutatedPacket:
        fc = random.choice(list(self.STANDARD_FUNCTION_CODES.keys()))
        address = random.randint(0, 100)
        quantity = random.randint(1, 10)
        pdu = struct.pack('>BBHH', self.slave_id, fc, address, quantity)
        
        wrong_length = random.choice([len(pdu) + 10, len(pdu) - 2, 1, 255, 0])
        mbap = struct.pack('>HHH', self._generate_transaction_id(), 0, max(1, wrong_length))
        packet = mbap + pdu
        
        return MutatedPacket(
            hex_data=self._bytes_to_hex(packet),
            function_code=fc,
            description=f"长度字段异常 (声明:{wrong_length}, 实际:{len(pdu)})",
            strategy="length_field_invalid"
        )

    def mutate_transaction_id_abuse(self) -> MutatedPacket:
        fc = random.choice(list(self.STANDARD_FUNCTION_CODES.keys()))
        address = random.randint(0, 100)
        quantity = random.randint(1, 10)
        pdu = struct.pack('>BBHH', self.slave_id, fc, address, quantity)
        
        abuse_type = random.choice(['repeat', 'max', 'zero', 'special'])
        if abuse_type == 'repeat':
            tid = 0x0001
        elif abuse_type == 'max':
            tid = 0xFFFF
        elif abuse_type == 'zero':
            tid = 0x0000
        else:
            tid = random.choice([0xDEAD, 0xBEEF, 0xCAFE, 0xAAAA, 0x5555])
        
        mbap = struct.pack('>HHH', tid, 0, len(pdu))
        packet = mbap + pdu
        
        return MutatedPacket(
            hex_data=self._bytes_to_hex(packet),
            function_code=fc,
            description=f"事务ID异常 ({abuse_type}: 0x{tid:04X})",
            strategy="transaction_id_abuse"
        )

    def mutate_diagnostic_fuzzing(self) -> MutatedPacket:
        fc = 0x08
        valid_subfunctions = [0x0000, 0x0001, 0x0002, 0x0003, 0x0004, 
                              0x000A, 0x000B, 0x000C, 0x000D, 0x000E, 0x000F]
        subfunc = random.choice(valid_subfunctions)
        
        boundary_data = [0x0000, 0x0001, 0x00FF, 0x0100, 0x7FFF, 
                         0x8000, 0xFFFE, 0xFFFF, 0xAAAA, 0x5555]
        data = random.choice(boundary_data)
        
        pdu = struct.pack('>BBHH', self.slave_id, fc, subfunc, data)
        packet = self._build_modbus_tcp(pdu)
        
        return MutatedPacket(
            hex_data=self._bytes_to_hex(packet),
            function_code=fc,
            description=f"诊断功能码边界测试 (子功能:0x{subfunc:04X}, 数据:0x{data:04X})",
            strategy="diagnostic_fuzzing"
        )

    def mutate_fifo_overflow(self) -> MutatedPacket:
        fc = 0x03
        address = 0
        quantity = 1
        pdu = struct.pack('>BBHH', self.slave_id, fc, address, quantity)
        
        packet = self._build_modbus_tcp(pdu)
        
        return MutatedPacket(
            hex_data=self._bytes_to_hex(packet),
            function_code=fc,
            description="FIFO溢出测试报文（用于快速连续发送）",
            strategy="fifo_overflow"
        )

    def mutate_null_byte_injection(self) -> MutatedPacket:
        fc = random.choice(list(self.STANDARD_FUNCTION_CODES.keys()))
        address = random.randint(0, 100)
        quantity = random.randint(1, 10)
        pdu = struct.pack('>BBHH', self.slave_id, fc, address, quantity)
        
        inject_pos = random.randint(0, len(pdu))
        null_count = random.randint(1, 5)
        injected_pdu = pdu[:inject_pos] + b'\x00' * null_count + pdu[inject_pos:]
        
        packet = self._build_modbus_tcp(injected_pdu)
        
        return MutatedPacket(
            hex_data=self._bytes_to_hex(packet),
            function_code=fc,
            description=f"空字节注入 (位置:{inject_pos}, 数量:{null_count})",
            strategy="null_byte_injection"
        )

    def mutate_bit_flip(self) -> MutatedPacket:
        fc = random.choice(list(self.STANDARD_FUNCTION_CODES.keys()))
        address = random.randint(0, 100)
        quantity = random.randint(1, 10)
        pdu = struct.pack('>BBHH', self.slave_id, fc, address, quantity)
        
        pdu_list = list(pdu)
        flip_count = random.randint(1, 4)
        for _ in range(flip_count):
            byte_idx = random.randint(0, len(pdu_list) - 1)
            bit_idx = random.randint(0, 7)
            pdu_list[byte_idx] ^= (1 << bit_idx)
        
        flipped_pdu = bytes(pdu_list)
        packet = self._build_modbus_tcp(flipped_pdu)
        
        return MutatedPacket(
            hex_data=self._bytes_to_hex(packet),
            function_code=fc,
            description=f"位翻转攻击 (翻转{flip_count}位)",
            strategy="bit_flip"
        )

    def mutate_magic_value_injection(self) -> MutatedPacket:
        magic_values = [
            b'\x00' * 8,
            b'\xFF' * 8,
            b'\x41' * 8,
            b'\x42' * 8,
            b'DEADBEEF',
            b'\x0D\x0A\x0D\x0A',
            b'\x7FELF',
            b'<!DOCTYP',
            b'AAAAAAA',
            b'%n%n%n%n',
            b'%s%s%s%s',
            b'../etc/passwd',
        ]
        
        magic = random.choice(magic_values)
        fc = random.choice(list(self.STANDARD_FUNCTION_CODES.keys()))
        
        pdu = struct.pack('>BB', self.slave_id, fc) + magic[:8]
        packet = self._build_modbus_tcp(pdu)
        
        return MutatedPacket(
            hex_data=self._bytes_to_hex(packet),
            function_code=fc,
            description=f"魔法值注入 ({len(magic)}字节)",
            strategy="magic_value_injection"
        )

    def generate_mutation(self, strategy_id: Optional[str] = None) -> MutatedPacket:
        strategies = {
            "invalid_function_code": self.mutate_invalid_function_code,
            "subfunction_code_invalid": self.mutate_subfunction_code_invalid,
            "address_out_of_range": self.mutate_address_out_of_range,
            "invalid_data_length": self.mutate_invalid_data_length,
            "malformed_data": self.mutate_malformed_data,
            "byte_order_flip": self.mutate_byte_order_flip,
            "invalid_slave_id": self.mutate_invalid_slave_id,
            "packet_truncation": self.mutate_packet_truncation,
            "oversized_packet": self.mutate_oversized_packet,
            "mbap_header_corrupt": self.mutate_mbap_header_corrupt,
            "protocol_id_invalid": self.mutate_protocol_id_invalid,
            "length_field_invalid": self.mutate_length_field_invalid,
            "transaction_id_abuse": self.mutate_transaction_id_abuse,
            "diagnostic_fuzzing": self.mutate_diagnostic_fuzzing,
            "fifo_overflow": self.mutate_fifo_overflow,
            "null_byte_injection": self.mutate_null_byte_injection,
            "fuzzing_random": self.mutate_fuzzing_random,
            "bit_flip": self.mutate_bit_flip,
            "magic_value_injection": self.mutate_magic_value_injection,
        }
        
        if strategy_id and strategy_id in strategies:
            return strategies[strategy_id]()
        
        chosen_strategy = random.choice(list(strategies.keys()))
        return strategies[chosen_strategy]()

    def generate_mutations(self, count: int, strategy_ids: Optional[List[str]] = None) -> List[MutatedPacket]:
        mutations = []
        for _ in range(count):
            if strategy_ids:
                strategy = random.choice(strategy_ids)
                mutations.append(self.generate_mutation(strategy))
            else:
                mutations.append(self.generate_mutation())
        return mutations
