import struct

ISCSI_VERSION = 0x00

OPCODE_NOP_OUT = 0x00
OPCODE_SCSI_CMD = 0x01
OPCODE_SCSI_TASK_REQ = 0x02
OPCODE_LOGIN_REQ = 0x03
OPCODE_TEXT_REQ = 0x04
OPCODE_SCSI_DATA_OUT = 0x05
OPCODE_LOGOUT_REQ = 0x06
OPCODE_SNACK_REQ = 0x10

OPCODE_NOP_IN = 0x20
OPCODE_SCSI_RSP = 0x21
OPCODE_SCSI_TASK_RSP = 0x22
OPCODE_LOGIN_RSP = 0x23
OPCODE_TEXT_RSP = 0x24
OPCODE_SCSI_DATA_IN = 0x25
OPCODE_LOGOUT_RSP = 0x26
OPCODE_R2T = 0x31
OPCODE_ASYNC_MSG = 0x32
OPCODE_REJECT = 0x3f

LOGIN_STG_SEC_NEG = 0
LOGIN_STG_OP_NEG = 1
LOGIN_STG_FULL_FEATURE = 3

LOGIN_FLAG_TRANSIT = 0x80
LOGIN_FLAG_CONTINUE = 0x40
LOGIN_FLAG_CURRENT_STG_MASK = 0x0c
LOGIN_FLAG_NEXT_STG_MASK = 0x03

STATUS_GOOD = 0x00

class ISCSIPDU:
    def __init__(self, data=None):
        self.opcode = 0
        self.flags = 0
        self.data_segment_len = 0
        self.lun = 0
        self.initiator_task_tag = 0
        self.data = b''
        self.header_digest = 0
        self.data_digest = 0
        
        if data:
            self.parse(data)
    
    def parse(self, data):
        if len(data) < 48:
            raise ValueError("PDU too short")
        
        byte0 = data[0]
        self.opcode = byte0 & 0x3f
        self.flags = data[1]
        
        self.data_segment_len = struct.unpack('>I', data[4:8])[0] & 0x00ffffff
        
        self.lun = struct.unpack('>Q', data[8:16])[0]
        self.initiator_task_tag = struct.unpack('>I', data[16:20])[0]
        
        header_size = 48
        total_len = header_size + self.data_segment_len
        if len(data) >= total_len:
            self.data = data[header_size:header_size + self.data_segment_len]
    
    def build_header(self):
        header = bytearray(48)
        header[0] = self.opcode & 0x3f
        header[1] = self.flags
        header[4:8] = struct.pack('>I', self.data_segment_len & 0x00ffffff)
        header[8:16] = struct.pack('>Q', self.lun)
        header[16:20] = struct.pack('>I', self.initiator_task_tag)
        return bytes(header)
    
    def to_bytes(self):
        header = self.build_header()
        return header + self.data

def build_login_response(itt, ttt, stage_flags, data):
    pdu = ISCSIPDU()
    pdu.opcode = OPCODE_LOGIN_RSP
    pdu.flags = stage_flags
    pdu.initiator_task_tag = itt
    
    header = bytearray(48)
    header[0] = OPCODE_LOGIN_RSP
    header[1] = stage_flags
    header[4:8] = struct.pack('>I', len(data) & 0x00ffffff)
    header[8:16] = struct.pack('>Q', 0)
    header[16:20] = struct.pack('>I', itt)
    header[20:24] = struct.pack('>I', ttt)
    header[36:40] = struct.pack('>I', STATUS_GOOD)
    
    return bytes(header) + data

def build_scsi_response(itt, status, data=b'', residual=0):
    pdu = ISCSIPDU()
    pdu.opcode = OPCODE_SCSI_RSP
    pdu.initiator_task_tag = itt
    
    header = bytearray(48)
    header[0] = OPCODE_SCSI_RSP
    header[1] = 0
    header[3] = status
    header[4:8] = struct.pack('>I', len(data) & 0x00ffffff)
    header[16:20] = struct.pack('>I', itt)
    header[36:40] = struct.pack('>I', residual)
    
    return bytes(header) + data

def build_data_in(itt, data, offset=0, flags=0):
    header = bytearray(48)
    header[0] = OPCODE_SCSI_DATA_IN
    header[1] = flags
    header[4:8] = struct.pack('>I', len(data) & 0x00ffffff)
    header[16:20] = struct.pack('>I', itt)
    header[32:36] = struct.pack('>I', offset)
    
    return bytes(header) + data

def build_r2t(itt, ttt, offset, desired_len):
    header = bytearray(48)
    header[0] = OPCODE_R2T
    header[4:8] = struct.pack('>I', 0)
    header[16:20] = struct.pack('>I', itt)
    header[20:24] = struct.pack('>I', ttt)
    header[32:36] = struct.pack('>I', offset)
    header[36:40] = struct.pack('>I', desired_len)
    
    return bytes(header)

def build_nop_in(itt, data=b''):
    header = bytearray(48)
    header[0] = OPCODE_NOP_IN
    header[4:8] = struct.pack('>I', len(data) & 0x00ffffff)
    header[16:20] = struct.pack('>I', itt)
    return bytes(header) + data

def build_logout_response(itt, response=0):
    header = bytearray(48)
    header[0] = OPCODE_LOGOUT_RSP
    header[4:8] = struct.pack('>I', 0)
    header[16:20] = struct.pack('>I', itt)
    header[36:40] = struct.pack('>I', response)
    return bytes(header)
