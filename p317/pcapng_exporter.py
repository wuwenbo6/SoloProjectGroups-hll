import struct
import time
from typing import List, Optional
from dataclasses import dataclass
from ecpri_parser import EcpriFrame


@dataclass
class PcapngExporter:
    frames: List[EcpriFrame]
    
    @staticmethod
    def _build_block(block_type: int, data: bytes) -> bytes:
        block_total_len = 12 + len(data) + (4 - len(data) % 4) % 4
        data_padded = data + b'\x00' * ((4 - len(data) % 4) % 4)
        
        return (
            struct.pack('<I', block_type)
            + struct.pack('<I', block_total_len)
            + data_padded
            + struct.pack('<I', block_total_len)
        )
    
    @staticmethod
    def _build_section_header_block() -> bytes:
        byte_order_magic = 0x1A2B3C4D
        version_major = 1
        version_minor = 0
        section_len = -1
        
        data = (
            struct.pack('<I', byte_order_magic)
            + struct.pack('<H', version_major)
            + struct.pack('<H', version_minor)
            + struct.pack('<q', section_len)
        )
        
        return PcapngExporter._build_block(0x0A0D0D0A, data)
    
    @staticmethod
    def _build_interface_description_block(link_type: int = 1) -> bytes:
        snap_len = 65535
        
        data = (
            struct.pack('<H', link_type)
            + struct.pack('<H', 0)
            + struct.pack('<I', snap_len)
        )
        
        return PcapngExporter._build_block(0x00000001, data)
    
    @staticmethod
    def _build_ethernet_frame(ecpri_data: bytes) -> bytes:
        dst_mac = b'\x00\x11\x22\x33\x44\x55'
        src_mac = b'\x66\x77\x88\x99\xAA\xBB'
        ethertype = struct.pack('!H', 0xAEFE)
        
        return dst_mac + src_mac + ethertype + ecpri_data
    
    @staticmethod
    def _build_enhanced_packet_block(
        frame: EcpriFrame,
        interface_id: int = 0
    ) -> bytes:
        raw_data = bytes([0x10, frame.message_type]) + struct.pack('!H', frame.payload_size) + frame.payload
        ethernet_frame = PcapngExporter._build_ethernet_frame(raw_data)
        
        timestamp = int(frame.timestamp * 1e6)
        timestamp_high = (timestamp >> 32) & 0xFFFFFFFF
        timestamp_low = timestamp & 0xFFFFFFFF
        
        captured_len = len(ethernet_frame)
        original_len = len(ethernet_frame)
        
        data = (
            struct.pack('<I', interface_id)
            + struct.pack('<I', timestamp_high)
            + struct.pack('<I', timestamp_low)
            + struct.pack('<I', captured_len)
            + struct.pack('<I', original_len)
            + ethernet_frame
        )
        
        return PcapngExporter._build_block(0x00000006, data)
    
    def export(self, filename: Optional[str] = None) -> bytes:
        result = bytearray()
        
        result += self._build_section_header_block()
        result += self._build_interface_description_block()
        
        for frame in self.frames:
            result += self._build_enhanced_packet_block(frame)
        
        result_bytes = bytes(result)
        
        if filename:
            with open(filename, 'wb') as f:
                f.write(result_bytes)
        
        return result_bytes
    
    def export_to_bytes(self) -> bytes:
        return self.export()
