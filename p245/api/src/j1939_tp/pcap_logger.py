"""PCAP日志导出模块"""

import struct
import time
import os
from dataclasses import dataclass, field
from typing import Optional, List


@dataclass
class CanFrameLog:
    """CAN帧日志条目"""
    timestamp: float
    can_id: int
    data: bytes
    extended: bool = True
    is_rx: bool = False  # True=接收, False=发送


@dataclass
class PcapLogger:
    """PCAP日志记录器"""
    logs: List[CanFrameLog] = field(default_factory=list)
    start_time: Optional[float] = None

    def __post_init__(self):
        self.start_time = time.time()

    def reset(self):
        """重置日志"""
        self.logs = []
        self.start_time = time.time()

    def log_frame(self, can_id: int, data: bytes, extended: bool = True, is_rx: bool = False):
        """记录一个CAN帧"""
        self.logs.append(CanFrameLog(
            timestamp=time.time(),
            can_id=can_id,
            data=data,
            extended=extended,
            is_rx=is_rx
        ))

    def _build_socketcan_header(self, frame: CanFrameLog) -> bytes:
        """构建SocketCAN帧头"""
        can_id = frame.can_id
        if frame.extended:
            can_id |= 0x80000000  # 设置扩展帧标志
        if not frame.is_rx:
            can_id |= 0x40000000  # 设置发送标志

        data_len = len(frame.data)
        header = struct.pack("<I", can_id)
        header += struct.pack("<B", data_len)  # 数据长度
        header += struct.pack("<B", 0)  # 填充
        header += struct.pack("<H", 8)  # 保留

        return header + bytes(frame.data) + b'\x00' * (8 - data_len)

    def build_pcap(self) -> bytes:
        """构建PCAP文件内容"""
        pcap_content = bytearray()

        # PCAP全局头
        # magic: 0xa1b2c3d4 (microseconds)
        # version_major: 2
        # version_minor: 4
        # thiszone: 0
        # sigfigs: 0
        # snaplen: 65535
        # network: 113 (SocketCAN)
        global_header = struct.pack(
            "<IhhIIII",
            0xa1b2c3d4,
            2,
            4,
            0,
            0,
            65535,
            113  # DLT_CAN_SOCKETCAN
        )
        pcap_content.extend(global_header)

        # 每个帧
        for frame in self.logs:
            # 分组头
            ts_sec = int(frame.timestamp)
            ts_usec = int((frame.timestamp - ts_sec) * 1_000_000)
            packet_data = self._build_socketcan_header(frame)
            packet_len = len(packet_data)

            pkt_header = struct.pack(
                "<IIII",
                ts_sec,
                ts_usec,
                packet_len,
                packet_len
            )
            pcap_content.extend(pkt_header)
            pcap_content.extend(packet_data)

        return bytes(pcap_content)

    def save_to_file(self, filepath: str) -> str:
        """保存PCAP到文件"""
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        pcap_data = self.build_pcap()
        with open(filepath, 'wb') as f:
            f.write(pcap_data)
        return filepath

    def get_frame_count(self) -> int:
        """获取已记录帧数"""
        return len(self.logs)
