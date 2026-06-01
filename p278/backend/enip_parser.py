import struct
import json
import csv
from enum import IntEnum
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple
from io import StringIO


class CommandCode(IntEnum):
    NOP = 0x0000
    LIST_SERVICES = 0x0004
    LIST_IDENTITY = 0x0063
    LIST_INTERFACES = 0x0064
    REGISTER_SESSION = 0x0065
    UNREGISTER_SESSION = 0x0066
    SEND_RR_DATA = 0x006F
    SEND_UNIT_DATA = 0x0070


class CIPServiceCode(IntEnum):
    GET_ATTRIBUTE_ALL = 0x01
    GET_ATTRIBUTE_SINGLE = 0x0E
    SET_ATTRIBUTE_SINGLE = 0x10
    READ_TAG = 0x4C
    WRITE_TAG = 0x4D
    READ_TAG_FRAGMENTED = 0x52
    WRITE_TAG_FRAGMENTED = 0x53
    MULTIPLE_SERVICE_PACKET = 0x0A


class CIPDataType(IntEnum):
    BOOL = 0xC1
    SINT = 0xC2
    INT = 0xC3
    DINT = 0xC4
    LINT = 0xC5
    USINT = 0xC6
    UINT = 0xC7
    UDINT = 0xC8
    ULINT = 0xC9
    REAL = 0xCA
    LREAL = 0xCB
    STRING = 0xD0
    BYTE = 0xD1
    WORD = 0xD2
    DWORD = 0xD3
    LWORD = 0xD4


@dataclass
class ENIPHeader:
    command: int
    length: int
    session_handle: int
    status: int
    sender_context: bytes
    options: int

    @classmethod
    def parse(cls, data: bytes) -> 'ENIPHeader':
        if len(data) < 24:
            raise ValueError(f"ENIP header too short: {len(data)} bytes")
        
        command, length, session_handle, status = struct.unpack('<HHII', data[:12])
        sender_context = data[12:20]
        options, = struct.unpack('<I', data[20:24])
        
        return cls(
            command=command,
            length=length,
            session_handle=session_handle,
            status=status,
            sender_context=sender_context,
            options=options
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            'command': self.command,
            'command_name': CommandCode(self.command).name if self.command in CommandCode._value2member_map_ else f'UNKNOWN_0x{self.command:04X}',
            'length': self.length,
            'session_handle': f'0x{self.session_handle:08X}',
            'status': self.status,
            'sender_context': self.sender_context.hex(),
            'options': self.options
        }


@dataclass
class CIPPathSegment:
    segment_type: str
    value: Any

    def to_dict(self) -> Dict[str, Any]:
        return {
            'segment_type': self.segment_type,
            'value': self.value
        }


@dataclass
class CIPMessage:
    service: int
    path_length: int
    path_segments: List[CIPPathSegment]
    data: bytes
    response: bool = False
    status: int = 0

    @classmethod
    def parse(cls, data: bytes, response: bool = False) -> 'CIPMessage':
        offset = 0
        
        if response:
            service, status, path_length = struct.unpack('<BBB', data[offset:offset+3])
            offset += 3
            service &= 0x7F
        else:
            service, path_length = struct.unpack('<BB', data[offset:offset+2])
            offset += 2
            status = 0

        path_bytes = path_length * 2
        path_segments = cls._parse_path(data[offset:offset+path_bytes])
        offset += path_bytes

        return cls(
            service=service,
            path_length=path_length,
            path_segments=path_segments,
            data=data[offset:],
            response=response,
            status=status
        )

    @staticmethod
    def _parse_path(path_data: bytes) -> List[CIPPathSegment]:
        segments = []
        
        LOGICAL_SEGMENT_MAP = {
            0x20: ('Class ID', 1),
            0x21: ('Instance ID', 1),
            0x22: ('Member ID', 1),
            0x23: ('Point', 1),
            0x24: ('Attribute ID', 1),
            0x25: ('Special', 1),
            0x26: ('Class ID', 2),
            0x27: ('Instance ID', 2),
            0x28: ('Member ID', 2),
            0x29: ('Point', 2),
            0x2A: ('Attribute ID', 2),
            0x2B: ('Special', 2),
            0x2C: ('Class ID', 4),
            0x2D: ('Instance ID', 4),
            0x2E: ('Member ID', 4),
            0x2F: ('Point', 4),
            0x30: ('Attribute ID', 4),
            0x31: ('Special', 4),
        }
        
        def parse_segment(offset: int) -> int:
            if offset >= len(path_data):
                return offset
            
            segment_byte = path_data[offset]
            
            if segment_byte == 0x00:
                return offset + 1
            
            segment_type = (segment_byte >> 5) & 0x07
            
            if segment_byte in LOGICAL_SEGMENT_MAP:
                logical_name, value_len = LOGICAL_SEGMENT_MAP[segment_byte]
                
                if offset + 1 + value_len > len(path_data):
                    return offset
                
                value_data = path_data[offset+1:offset+1+value_len]
                
                if value_len == 1:
                    value = value_data[0]
                elif value_len == 2:
                    value, = struct.unpack('>H', value_data)
                elif value_len == 4:
                    value, = struct.unpack('>I', value_data)
                else:
                    value = value_data.hex()
                
                segments.append(CIPPathSegment(
                    segment_type=f'Logical: {logical_name} ({value_len*8}-bit, BE)',
                    value=value
                ))
                
                new_offset = offset + 1 + value_len
                
            elif segment_type == 1:
                data_len = segment_byte & 0x1F
                if offset + 1 + data_len > len(path_data):
                    return offset
                
                name_bytes = path_data[offset+1:offset+1+data_len]
                try:
                    value = name_bytes.decode('ascii')
                except:
                    value = name_bytes.hex()
                
                new_offset = offset + 1 + data_len
                if data_len % 2 == 1:
                    new_offset += 1
                
                segments.append(CIPPathSegment(
                    segment_type='Data: ANSI Symbol',
                    value=value
                ))
                
            elif segment_type == 2:
                port = segment_byte & 0x1F
                if port == 0x1F:
                    if offset + 2 >= len(path_data):
                        return offset
                    port = path_data[offset + 1]
                    new_offset = offset + 2
                else:
                    new_offset = offset + 1
                
                link_addr_len = 0
                if new_offset < len(path_data):
                    link_addr_len = path_data[new_offset]
                    new_offset += 1
                
                if new_offset + link_addr_len > len(path_data):
                    return offset
                
                link_addr = path_data[new_offset:new_offset+link_addr_len]
                new_offset += link_addr_len
                
                if link_addr_len % 2 == 1:
                    new_offset += 1
                
                segments.append(CIPPathSegment(
                    segment_type='Port Segment',
                    value={'port': port, 'link_address': link_addr.hex()}
                ))
                
            elif segment_type == 3:
                data_len = segment_byte & 0x1F
                new_offset = offset + 1
                if new_offset + data_len > len(path_data):
                    return offset
                
                value_bytes = path_data[new_offset:new_offset+data_len]
                new_offset += data_len
                if data_len % 2 == 1:
                    new_offset += 1
                
                segments.append(CIPPathSegment(
                    segment_type='Data: Simple',
                    value=value_bytes.hex()
                ))
                
            elif segment_type == 4:
                data_len = segment_byte & 0x1F
                new_offset = offset + 1
                if new_offset + data_len > len(path_data):
                    return offset
                
                name_bytes = path_data[new_offset:new_offset+data_len]
                try:
                    value = name_bytes.decode('ascii')
                except:
                    value = name_bytes.hex()
                new_offset += data_len
                if data_len % 2 == 1:
                    new_offset += 1
                
                segments.append(CIPPathSegment(
                    segment_type='Data: Symbol',
                    value=value
                ))
                
            else:
                logical_type = (segment_byte >> 2) & 0x07
                format = segment_byte & 0x03
                
                if format == 0:
                    if offset + 1 >= len(path_data):
                        return offset
                    value = path_data[offset + 1]
                    new_offset = offset + 2
                elif format == 1:
                    if offset + 3 >= len(path_data):
                        return offset
                    value, = struct.unpack('>H', path_data[offset+1:offset+3])
                    new_offset = offset + 3
                else:
                    if offset + 5 >= len(path_data):
                        return offset
                    value, = struct.unpack('>I', path_data[offset+1:offset+5])
                    new_offset = offset + 5
                
                logical_names = ['Class ID', 'Instance ID', 'Member ID', 'Point', 'Attribute ID', 'Special', 'Reserved', 'Extended']
                segments.append(CIPPathSegment(
                    segment_type=f'Logical: {logical_names[logical_type]} ({(format+1)*8}-bit, BE)',
                    value=value
                ))
            
            return parse_segment(new_offset)
        
        parse_segment(0)
        return segments

    def to_dict(self) -> Dict[str, Any]:
        service_name = CIPServiceCode(self.service).name if self.service in CIPServiceCode._value2member_map_ else f'UNKNOWN_0x{self.service:02X}'
        
        return {
            'service': self.service,
            'service_name': service_name,
            'is_response': self.response,
            'status': self.status,
            'path_length': self.path_length,
            'path_segments': [seg.to_dict() for seg in self.path_segments],
            'data_hex': self.data.hex(),
            'data_length': len(self.data)
        }


@dataclass
class ENIPPacket:
    header: ENIPHeader
    cip_message: Optional[CIPMessage] = None
    raw_data: bytes = field(default=b'')

    @classmethod
    def parse(cls, data: bytes) -> 'ENIPPacket':
        header = ENIPHeader.parse(data)
        cip_message = None
        
        if header.command in [CommandCode.SEND_RR_DATA, CommandCode.SEND_UNIT_DATA]:
            encapsulation_data = data[24:24+header.length]
            
            if len(encapsulation_data) > 6:
                interface_handle, timeout = struct.unpack('<IH', encapsulation_data[:6])
                if len(encapsulation_data) > 8:
                    item_count, = struct.unpack('<H', encapsulation_data[6:8])
                    
                    item_offset = 8
                    for _ in range(item_count):
                        if item_offset + 4 > len(encapsulation_data):
                            break
                        
                        type_id, length = struct.unpack('<HH', encapsulation_data[item_offset:item_offset+4])
                        item_offset += 4
                        
                        if item_offset + length > len(encapsulation_data):
                            break
                        
                        item_data = encapsulation_data[item_offset:item_offset+length]
                        item_offset += length
                        
                        if type_id == 0xB1:
                            cip_message = CIPMessage.parse(item_data, response=header.command == CommandCode.SEND_RR_DATA)
                        elif type_id == 0xB2:
                            pass
        
        return cls(
            header=header,
            cip_message=cip_message,
            raw_data=data
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            'header': self.header.to_dict(),
            'cip_message': self.cip_message.to_dict() if self.cip_message else None,
            'raw_data_hex': self.raw_data.hex()
        }


def parse_enip_packet(data: bytes) -> Dict[str, Any]:
    try:
        packet = ENIPPacket.parse(data)
        return {
            'success': True,
            'packet': packet.to_dict()
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'raw_data_hex': data.hex()
        }


def build_read_tag_request(tag_name: str, data_type: int = CIPDataType.DINT) -> bytes:
    tag_bytes = tag_name.encode('ascii')
    tag_len = len(tag_bytes)
    
    path_segments = []
    
    path_segments.append(bytes([0x91, tag_len]) + tag_bytes)
    if tag_len % 2 == 1:
        path_segments.append(bytes([0x00]))
    
    path_data = b''.join(path_segments)
    path_length = len(path_data) // 2
    
    cip_service = bytes([CIPServiceCode.READ_TAG, path_length])
    cip_service += path_data
    
    num_elements = 1
    cip_service += struct.pack('<H', num_elements)
    
    return cip_service


def build_write_tag_request(tag_name: str, value: Any, data_type: int = CIPDataType.DINT) -> bytes:
    tag_bytes = tag_name.encode('ascii')
    tag_len = len(tag_bytes)
    
    path_segments = []
    
    path_segments.append(bytes([0x91, tag_len]) + tag_bytes)
    if tag_len % 2 == 1:
        path_segments.append(bytes([0x00]))
    
    path_data = b''.join(path_segments)
    path_length = len(path_data) // 2
    
    cip_service = bytes([CIPServiceCode.WRITE_TAG, path_length])
    cip_service += path_data
    
    cip_service += struct.pack('<H', data_type)
    cip_service += struct.pack('<H', 1)
    
    if data_type == CIPDataType.DINT:
        cip_service += struct.pack('<i', int(value))
    elif data_type == CIPDataType.INT:
        cip_service += struct.pack('<h', int(value))
    elif data_type == CIPDataType.REAL:
        cip_service += struct.pack('<f', float(value))
    elif data_type == CIPDataType.BOOL:
        cip_service += struct.pack('<?', bool(value))
    else:
        cip_service += struct.pack('<i', int(value))
    
    return cip_service


def decode_tag_data(data: bytes, data_type: int = CIPDataType.DINT) -> Any:
    try:
        if len(data) < 2:
            return None
        
        type_code, num_elements = struct.unpack('<HH', data[:4])
        
        if type_code == CIPDataType.DINT and len(data) >= 8:
            return struct.unpack('<i', data[4:8])[0]
        elif type_code == CIPDataType.INT and len(data) >= 6:
            return struct.unpack('<h', data[4:6])[0]
        elif type_code == CIPDataType.REAL and len(data) >= 8:
            return struct.unpack('<f', data[4:8])[0]
        elif type_code == CIPDataType.BOOL and len(data) >= 5:
            return struct.unpack('<?', data[4:5])[0]
        elif type_code == CIPDataType.UINT and len(data) >= 6:
            return struct.unpack('<H', data[4:6])[0]
        elif type_code == CIPDataType.UDINT and len(data) >= 8:
            return struct.unpack('<I', data[4:8])[0]
        else:
            return data[4:].hex()
    except Exception as e:
        return f"Decode error: {str(e)}"


@dataclass
class TagDefinition:
    name: str
    data_type: int
    data_type_name: str
    instance_id: int = 0
    array_dimensions: List[int] = field(default_factory=list)
    description: str = ""
    current_value: Any = None
    read_only: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            'name': self.name,
            'data_type': self.data_type,
            'data_type_name': self.data_type_name,
            'instance_id': self.instance_id,
            'array_dimensions': self.array_dimensions,
            'description': self.description,
            'current_value': self.current_value,
            'read_only': self.read_only
        }


@dataclass
class ExplicitMessageRequest:
    service_code: int
    path: List[Tuple[int, int]]
    data: bytes = field(default=b'')
    path_segments: List[CIPPathSegment] = field(default_factory=list)

    def to_bytes(self) -> bytes:
        request_data = bytearray()
        
        request_data.append(self.service_code & 0xFF)
        
        path_bytes = bytearray()
        for seg in self.path_segments:
            if seg.segment_type.startswith('Logical'):
                if isinstance(seg.value, int):
                    if seg.value <= 0xFF:
                        path_bytes.append(0x20)
                        path_bytes.append(seg.value & 0xFF)
                    elif seg.value <= 0xFFFF:
                        path_bytes.append(0x26)
                        path_bytes.extend(struct.pack('>H', seg.value))
                    else:
                        path_bytes.append(0x2C)
                        path_bytes.extend(struct.pack('>I', seg.value))
            elif 'Symbol' in seg.segment_type or 'ANSI' in seg.segment_type:
                name_str = str(seg.value)
                name_bytes = name_str.encode('ascii')
                name_len = len(name_bytes)
                path_bytes.append(0x91 | (name_len & 0x1F))
                path_bytes.extend(name_bytes)
                if name_len % 2 == 1:
                    path_bytes.append(0x00)
        
        path_length = len(path_bytes) // 2
        request_data.append(path_length)
        request_data.extend(path_bytes)
        request_data.extend(self.data)
        
        return bytes(request_data)


class TagDatabase:
    def __init__(self):
        self.tags: Dict[str, TagDefinition] = {}

    def add_tag(self, tag: TagDefinition):
        self.tags[tag.name] = tag

    def add_tags(self, tags: List[TagDefinition]):
        for tag in tags:
            self.add_tag(tag)

    def get_tag(self, name: str) -> Optional[TagDefinition]:
        return self.tags.get(name)

    def remove_tag(self, name: str):
        if name in self.tags:
            del self.tags[name]

    def list_tags(self) -> List[str]:
        return list(self.tags.keys())

    def filter_by_type(self, data_type: int) -> List[TagDefinition]:
        return [tag for tag in self.tags.values() if tag.data_type == data_type]

    def to_dict(self) -> List[Dict[str, Any]]:
        return [tag.to_dict() for tag in self.tags.values()]

    def from_dict(self, data: List[Dict[str, Any]]):
        self.tags.clear()
        for item in data:
            tag = TagDefinition(
                name=item['name'],
                data_type=item['data_type'],
                data_type_name=item.get('data_type_name', ''),
                instance_id=item.get('instance_id', 0),
                array_dimensions=item.get('array_dimensions', []),
                description=item.get('description', ''),
                current_value=item.get('current_value', None),
                read_only=item.get('read_only', False)
            )
            self.add_tag(tag)

    def export_json(self, filepath: Optional[str] = None) -> str:
        data = self.to_dict()
        json_str = json.dumps(data, indent=2, ensure_ascii=False)
        
        if filepath:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(json_str)
        
        return json_str

    def import_json(self, filepath: str):
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        self.from_dict(data)

    def export_csv(self, filepath: Optional[str] = None) -> str:
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(['Name', 'Data Type', 'Data Type Name', 'Instance ID', 
                        'Array Dimensions', 'Description', 'Current Value', 'Read Only'])
        
        for tag in self.tags.values():
            writer.writerow([
                tag.name,
                f'0x{tag.data_type:02X}',
                tag.data_type_name,
                tag.instance_id,
                str(tag.array_dimensions),
                tag.description,
                tag.current_value,
                tag.read_only
            ])
        
        csv_str = output.getvalue()
        
        if filepath:
            with open(filepath, 'w', newline='', encoding='utf-8') as f:
                f.write(csv_str)
        
        return csv_str

    def import_csv(self, filepath: str):
        with open(filepath, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                data_type = int(row['Data Type'], 16) if row['Data Type'].startswith('0x') else int(row['Data Type'])
                tag = TagDefinition(
                    name=row['Name'],
                    data_type=data_type,
                    data_type_name=row.get('Data Type Name', ''),
                    instance_id=int(row.get('Instance ID', '0')),
                    array_dimensions=eval(row.get('Array Dimensions', '[]')) if row.get('Array Dimensions') else [],
                    description=row.get('Description', ''),
                    current_value=row.get('Current Value', None),
                    read_only=row.get('Read Only', 'False').lower() == 'true'
                )
                self.add_tag(tag)


def create_default_tag_database() -> TagDatabase:
    db = TagDatabase()
    
    default_tags = [
        TagDefinition(
            name='ControllerTags.TestDINT',
            data_type=CIPDataType.DINT,
            data_type_name='DINT',
            instance_id=1,
            description='32位整数测试标签',
            current_value=0
        ),
        TagDefinition(
            name='ControllerTags.TestINT',
            data_type=CIPDataType.INT,
            data_type_name='INT',
            instance_id=2,
            description='16位整数测试标签',
            current_value=0
        ),
        TagDefinition(
            name='ControllerTags.TestREAL',
            data_type=CIPDataType.REAL,
            data_type_name='REAL',
            instance_id=3,
            description='32位浮点数测试标签',
            current_value=0.0
        ),
        TagDefinition(
            name='ControllerTags.TestBOOL',
            data_type=CIPDataType.BOOL,
            data_type_name='BOOL',
            instance_id=4,
            description='布尔值测试标签',
            current_value=False
        ),
        TagDefinition(
            name='ControllerTags.TestUINT',
            data_type=CIPDataType.UINT,
            data_type_name='UINT',
            instance_id=5,
            description='16位无符号整数测试标签',
            current_value=0
        ),
        TagDefinition(
            name='ControllerTags.TestUDINT',
            data_type=CIPDataType.UDINT,
            data_type_name='UDINT',
            instance_id=6,
            description='32位无符号整数测试标签',
            current_value=0
        ),
        TagDefinition(
            name='Program:MainProgram.Counter',
            data_type=CIPDataType.DINT,
            data_type_name='DINT',
            instance_id=100,
            description='计数器',
            current_value=0
        ),
        TagDefinition(
            name='Program:MainProgram.Status',
            data_type=CIPDataType.DINT,
            data_type_name='DINT',
            instance_id=101,
            description='状态字',
            current_value=0
        ),
        TagDefinition(
            name='Program:MainProgram.SetPoint',
            data_type=CIPDataType.REAL,
            data_type_name='REAL',
            instance_id=102,
            description='设定值',
            current_value=0.0
        ),
        TagDefinition(
            name='Program:MainProgram.MotorRun',
            data_type=CIPDataType.BOOL,
            data_type_name='BOOL',
            instance_id=103,
            description='电机运行信号',
            current_value=False
        ),
        TagDefinition(
            name='InputModule.Input00',
            data_type=CIPDataType.BOOL,
            data_type_name='BOOL',
            instance_id=200,
            description='输入点00',
            read_only=True,
            current_value=False
        ),
        TagDefinition(
            name='InputModule.Input01',
            data_type=CIPDataType.BOOL,
            data_type_name='BOOL',
            instance_id=201,
            description='输入点01',
            read_only=True,
            current_value=False
        ),
        TagDefinition(
            name='OutputModule.Output00',
            data_type=CIPDataType.BOOL,
            data_type_name='BOOL',
            instance_id=300,
            description='输出点00',
            current_value=False
        ),
        TagDefinition(
            name='OutputModule.Output01',
            data_type=CIPDataType.BOOL,
            data_type_name='BOOL',
            instance_id=301,
            description='输出点01',
            current_value=False
        ),
        TagDefinition(
            name='AnalogModule.AI00',
            data_type=CIPDataType.INT,
            data_type_name='INT',
            instance_id=400,
            description='模拟量输入通道0',
            read_only=True,
            current_value=0
        ),
        TagDefinition(
            name='AnalogModule.AO00',
            data_type=CIPDataType.INT,
            data_type_name='INT',
            instance_id=500,
            description='模拟量输出通道0',
            current_value=0
        )
    ]
    
    db.add_tags(default_tags)
    return db


def build_explicit_message(
    service_code: int,
    class_id: int,
    instance_id: int,
    attribute_id: Optional[int] = None,
    data: bytes = b''
) -> bytes:
    path_segments = [
        CIPPathSegment(segment_type='Logical: Class ID (8-bit, BE)', value=class_id),
        CIPPathSegment(segment_type='Logical: Instance ID (8-bit, BE)', value=instance_id)
    ]
    
    if attribute_id is not None:
        path_segments.append(
            CIPPathSegment(segment_type='Logical: Attribute ID (8-bit, BE)', value=attribute_id)
        )
    
    request = ExplicitMessageRequest(
        service_code=service_code,
        path=[(class_id, instance_id)],
        data=data,
        path_segments=path_segments
    )
    
    return request.to_bytes()


def send_explicit_message(
    socket_obj: Any,
    session_handle: int,
    sender_context: bytes,
    cip_data: bytes
) -> Tuple[bytes, Dict[str, Any]]:
    command = 0x006F
    
    address_item = struct.pack('<HH', 0x00, 0x00)
    data_item = struct.pack('<HH', 0xB1, len(cip_data)) + cip_data
    
    common_packet = struct.pack('<H', 2) + address_item + data_item
    
    interface_handle = 0
    timeout = 10
    
    encapsulation_data = struct.pack('<IH', interface_handle, timeout) + common_packet
    
    packet = struct.pack(
        '<HHII8sI',
        command,
        len(encapsulation_data),
        session_handle,
        0,
        sender_context,
        0
    ) + encapsulation_data
    
    socket_obj.send(packet)
    
    header_bytes = socket_obj.recv(24)
    if len(header_bytes) < 24:
        raise ValueError("Response too short")
    
    _, length, _, _, _, _ = struct.unpack('<HHII8sI', header_bytes)
    response_data = socket_obj.recv(length)
    
    full_response = header_bytes + response_data
    parsed = parse_enip_packet(full_response)
    
    return full_response, parsed
