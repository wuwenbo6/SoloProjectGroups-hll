import struct

SCSI_OP_INQUIRY = 0x12
SCSI_OP_READ_CAPACITY_10 = 0x25
SCSI_OP_READ_10 = 0x28
SCSI_OP_WRITE_10 = 0x2a
SCSI_OP_TEST_UNIT_READY = 0x00
SCSI_OP_REQUEST_SENSE = 0x03
SCSI_OP_REPORT_LUNS = 0xa0
SCSI_OP_MODE_SENSE_6 = 0x1a
SCSI_OP_MODE_SENSE_10 = 0x5a

SCSI_STATUS_GOOD = 0x00
SCSI_STATUS_CHECK_CONDITION = 0x02

SCSI_SENSE_KEY_NO_SENSE = 0x00
SCSI_SENSE_KEY_NOT_READY = 0x02
SCSI_SENSE_KEY_ILLEGAL_REQUEST = 0x05
SCSI_SENSE_KEY_UNIT_ATTENTION = 0x06

class SCSIHandler:
    def __init__(self, lun_manager, target_name='iqn.2024-01.example:target'):
        self.lun_manager = lun_manager
        self.target_name = target_name
    
    def handle_command(self, lun_id, cdb):
        opcode = cdb[0]
        
        handlers = {
            SCSI_OP_TEST_UNIT_READY: self._handle_test_unit_ready,
            SCSI_OP_INQUIRY: self._handle_inquiry,
            SCSI_OP_READ_CAPACITY_10: self._handle_read_capacity_10,
            SCSI_OP_READ_10: self._handle_read_10,
            SCSI_OP_WRITE_10: self._handle_write_10,
            SCSI_OP_REQUEST_SENSE: self._handle_request_sense,
            SCSI_OP_REPORT_LUNS: self._handle_report_luns,
            SCSI_OP_MODE_SENSE_6: self._handle_mode_sense_6,
            SCSI_OP_MODE_SENSE_10: self._handle_mode_sense_10,
        }
        
        handler = handlers.get(opcode, self._handle_unknown)
        return handler(lun_id, cdb)
    
    def _handle_test_unit_ready(self, lun_id, cdb):
        return SCSI_STATUS_GOOD, b''
    
    def _handle_inquiry(self, lun_id, cdb):
        evpd = cdb[1] & 0x01
        page_code = cdb[2]
        alloc_len = struct.unpack('>H', cdb[3:5])[0]
        
        if evpd == 0:
            data = self._build_standard_inquiry(lun_id)
        elif page_code == 0x00:
            data = self._build_supported_pages()
        elif page_code == 0x80:
            data = self._build_unit_serial_number(lun_id)
        elif page_code == 0x83:
            data = self._build_device_identification(lun_id)
        else:
            return SCSI_STATUS_CHECK_CONDITION, self._build_sense_data(
                SCSI_SENSE_KEY_ILLEGAL_REQUEST, 0x24, 0x00)
        
        if len(data) > alloc_len:
            data = data[:alloc_len]
        
        return SCSI_STATUS_GOOD, data
    
    def _build_standard_inquiry(self, lun_id):
        lun = self.lun_manager.get_lun(lun_id)
        if lun:
            peripheral_type = 0x00
        else:
            peripheral_type = 0x1f
        
        data = bytearray(96)
        data[0] = peripheral_type
        data[1] = 0x00
        data[2] = 0x05
        data[3] = 0x02
        data[4] = 91
        
        vendor = 'PYSCSI  '
        product = f'VDISK-LUN{lun_id:03d}    '
        revision = '1.0 '
        
        data[8:16] = vendor.encode('ascii')
        data[16:32] = product.encode('ascii')
        data[32:36] = revision.encode('ascii')
        
        vendor_specific = f'LUN{lun_id:04d}-{self.target_name[-16:]}'
        vendor_specific_bytes = vendor_specific.encode('ascii')[:20]
        data[36:36 + len(vendor_specific_bytes)] = vendor_specific_bytes
        
        data[56] = 0x00
        data[57] = 0x00
        data[58] = 0x00
        data[59] = 0x00
        
        version_descriptors = b'\x04\x00\x30\x00\x00\x00\x00\x00'
        data[60:68] = version_descriptors
        
        return bytes(data)
    
    def _build_supported_pages(self):
        data = bytearray(6)
        data[1] = 0x00
        data[3] = 2
        data[4] = 0x80
        data[5] = 0x83
        return bytes(data)
    
    def _build_unit_serial_number(self, lun_id):
        serial = f'LUN-{lun_id:04d}-{self.target_name[-12:]}'
        data = bytearray(4 + len(serial))
        data[1] = 0x80
        data[3] = len(serial)
        data[4:] = serial.encode('ascii')
        return bytes(data)
    
    def _build_device_identification(self, lun_id):
        designator = f'{self.target_name}:LUN{lun_id}'.encode('ascii')
        data = bytearray(4 + 4 + len(designator))
        data[3] = 4 + len(designator)
        data[4] = 0x03
        data[5] = 0x00
        data[6] = 0x00
        data[7] = len(designator)
        data[8:] = designator
        return bytes(data)
    
    def _handle_read_capacity_10(self, lun_id, cdb):
        lun = self.lun_manager.get_lun(lun_id)
        if not lun:
            return SCSI_STATUS_CHECK_CONDITION, self._build_sense_data(
                SCSI_SENSE_KEY_NOT_READY, 0x04, 0x03)
        
        block_size = 512
        total_bytes = lun.get_size()
        last_lba = (total_bytes // block_size) - 1
        
        data = struct.pack('>II', last_lba, block_size)
        return SCSI_STATUS_GOOD, data
    
    def _handle_read_10(self, lun_id, cdb):
        lun = self.lun_manager.get_lun(lun_id)
        if not lun:
            return SCSI_STATUS_CHECK_CONDITION, self._build_sense_data(
                SCSI_SENSE_KEY_NOT_READY, 0x04, 0x03)
        
        lba = struct.unpack('>I', cdb[2:6])[0]
        transfer_length = struct.unpack('>H', cdb[7:9])[0]
        
        if transfer_length == 0:
            transfer_length = 0x10000
        
        block_size = 512
        total_blocks = lun.get_size() // block_size
        
        if lba >= total_blocks:
            return SCSI_STATUS_CHECK_CONDITION, self._build_sense_data(
                SCSI_SENSE_KEY_ILLEGAL_REQUEST, 0x21, 0x00)
        
        if lba + transfer_length > total_blocks:
            transfer_length = total_blocks - lba
        
        offset = lba * block_size
        length = transfer_length * block_size
        
        try:
            data = lun.read(offset, length)
            if len(data) < length:
                data += b'\x00' * (length - len(data))
            return SCSI_STATUS_GOOD, data
        except Exception as e:
            return SCSI_STATUS_CHECK_CONDITION, self._build_sense_data(
                SCSI_SENSE_KEY_ILLEGAL_REQUEST, 0x05, 0x00)
    
    def _handle_write_10(self, lun_id, cdb):
        lun = self.lun_manager.get_lun(lun_id)
        if not lun:
            return SCSI_STATUS_CHECK_CONDITION, self._build_sense_data(
                SCSI_SENSE_KEY_NOT_READY, 0x04, 0x03)
        
        lba = struct.unpack('>I', cdb[2:6])[0]
        transfer_length = struct.unpack('>H', cdb[7:9])[0]
        
        if transfer_length == 0:
            transfer_length = 0x10000
        
        block_size = 512
        total_blocks = lun.get_size() // block_size
        
        if lba >= total_blocks:
            return SCSI_STATUS_CHECK_CONDITION, self._build_sense_data(
                SCSI_SENSE_KEY_ILLEGAL_REQUEST, 0x21, 0x00)
        
        if lba + transfer_length > total_blocks:
            transfer_length = total_blocks - lba
        
        return SCSI_STATUS_GOOD, b''
    
    def _handle_request_sense(self, lun_id, cdb):
        data = self._build_sense_data(SCSI_SENSE_KEY_NO_SENSE, 0x00, 0x00)
        alloc_len = cdb[4]
        if len(data) > alloc_len:
            data = data[:alloc_len]
        return SCSI_STATUS_GOOD, data
    
    def _build_sense_data(self, sense_key, asc, ascq):
        data = bytearray(18)
        data[0] = 0x70
        data[2] = sense_key
        data[7] = 10
        data[12] = asc
        data[13] = ascq
        return bytes(data)
    
    def _handle_report_luns(self, lun_id, cdb):
        select_report = cdb[2]
        alloc_len = struct.unpack('>I', cdb[6:10])[0]
        
        luns = self.lun_manager.list_luns()
        
        lun_list_len = len(luns) * 8
        data = bytearray(8 + lun_list_len)
        data[0:4] = struct.pack('>I', lun_list_len)
        
        for i, lun_id in enumerate(luns):
            offset = 8 + i * 8
            data[offset] = (lun_id >> 8) & 0xff
            data[offset + 1] = lun_id & 0xff
        
        if len(data) > alloc_len:
            data = data[:alloc_len]
        
        return SCSI_STATUS_GOOD, data
    
    def _handle_mode_sense_6(self, lun_id, cdb):
        data = bytearray(4)
        data[0] = 3
        data[1] = 0
        data[2] = 0
        data[3] = 0
        return SCSI_STATUS_GOOD, data
    
    def _handle_mode_sense_10(self, lun_id, cdb):
        data = bytearray(8)
        data[0:2] = struct.pack('>H', 6)
        data[2] = 0
        data[3] = 0
        return SCSI_STATUS_GOOD, data
    
    def _handle_unknown(self, lun_id, cdb):
        return SCSI_STATUS_CHECK_CONDITION, self._build_sense_data(
            SCSI_SENSE_KEY_ILLEGAL_REQUEST, 0x20, 0x00)
