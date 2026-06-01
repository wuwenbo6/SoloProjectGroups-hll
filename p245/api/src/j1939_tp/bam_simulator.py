"""BAM广播模式模拟器"""

import asyncio
import random
import time
from typing import Callable, Optional
from dataclasses import dataclass

from .constants import (
    PGN_TP_CM, PGN_TP_DT, GLOBAL_ADDRESS,
    MODE_BAM, STATE_IDLE, STATE_TRANSMITTING, STATE_COMPLETE, STATE_ABORTED,
    EVENT_BAM_ANNOUNCE, EVENT_FRAME_SENT, EVENT_FRAME_LOST,
    EVENT_FRAME_RECEIVED, EVENT_REASSEMBLY_PROGRESS,
    EVENT_SIMULATION_COMPLETE, EVENT_STATE_CHANGE, EVENT_SEQUENCE_ERROR,
    MAX_TP_MESSAGE_SIZE, MIN_TP_MESSAGE_SIZE
)
from .frames import (
    build_bam_announce, build_dt_frame, build_j1939_id,
    split_message, parse_tp_dt
)


@dataclass
class BamConfig:
    """BAM模拟配置"""
    message_size: int = 100
    source_address: int = 0x01
    packet_loss_rate: float = 0.0
    frame_interval: float = 0.05
    out_of_order_rate: float = 0.0
    pgn: int = 0xF004  # 示例PGN (Proprietary B)


class BamSimulator:
    """
    BAM广播模式模拟器
    模拟发送端发送BAM公告帧，然后逐帧广播数据
    同时模拟接收端接收和重组消息
    """

    def __init__(self, can_bus=None):
        self.can_bus = can_bus
        self.config: Optional[BamConfig] = None
        self.state = STATE_IDLE
        self.original_message: bytes = b""
        self.message_chunks: list[bytes] = []
        self.received_packets: dict[int, bytes] = {}
        self.lost_sequences: set[int] = set()
        self.total_packets: int = 0
        self.expected_sequence: int = 1
        self.sequence_errors: list[dict] = []
        self.event_callback: Optional[Callable[[str, dict], None]] = None
        self.simulation_task: Optional[asyncio.Task] = None
        self._stop_event = asyncio.Event()

    def set_event_callback(self, callback: Callable[[str, dict], None]):
        """设置事件回调"""
        self.event_callback = callback

    def _emit_event(self, event_type: str, payload: dict):
        """发送事件"""
        payload["timestamp"] = time.time() * 1000
        payload["mode"] = MODE_BAM
        if self.event_callback:
            self.event_callback(event_type, payload)

    def _change_state(self, new_state: str, details: str = ""):
        """改变状态"""
        old_state = self.state
        self.state = new_state
        self._emit_event(EVENT_STATE_CHANGE, {
            "from": old_state,
            "to": new_state,
            "details": details
        })

    def configure(self, config: BamConfig):
        """配置模拟参数"""
        if config.message_size < MIN_TP_MESSAGE_SIZE:
            raise ValueError(f"消息大小至少为{MIN_TP_MESSAGE_SIZE}字节")
        if config.message_size > MAX_TP_MESSAGE_SIZE:
            raise ValueError(f"消息大小不能超过{MAX_TP_MESSAGE_SIZE}字节")

        self.config = config
        self.original_message = bytes([i % 256 for i in range(config.message_size)])
        self.message_chunks = split_message(self.original_message)
        self.total_packets = len(self.message_chunks)
        self.received_packets = {}
        self.lost_sequences = set()
        self.state = STATE_IDLE

    async def start_simulation(self):
        """开始模拟"""
        if self.state != STATE_IDLE:
            raise RuntimeError("模拟已在运行中")
        if not self.config:
            raise RuntimeError("请先配置模拟参数")

        self._stop_event.clear()
        self.simulation_task = asyncio.create_task(self._run_simulation())

    async def stop_simulation(self):
        """停止模拟"""
        if self.simulation_task and not self.simulation_task.done():
            self._stop_event.set()
            try:
                await asyncio.wait_for(self.simulation_task, timeout=1.0)
            except asyncio.TimeoutError:
                self.simulation_task.cancel()
                try:
                    await self.simulation_task
                except asyncio.CancelledError:
                    pass
        self.state = STATE_IDLE

    def reset(self):
        """重置模拟器"""
        self.config = None
        self.original_message = b""
        self.message_chunks = []
        self.received_packets = {}
        self.lost_sequences = set()
        self.total_packets = 0
        self.expected_sequence = 1
        self.sequence_errors = []
        self.state = STATE_IDLE

    def _should_drop_packet(self) -> bool:
        """根据丢包率决定是否丢包"""
        if not self.config:
            return False
        return random.random() < self.config.packet_loss_rate

    def _validate_sequence(self, received_seq: int) -> bool:
        """
        验证序列号是否正确（从1开始，严格递增）
        返回 True 如果序列号正确，False 如果有错误
        """
        is_valid = received_seq == self.expected_sequence

        if not is_valid:
            error = {
                "expected": self.expected_sequence,
                "received": received_seq,
                "timestamp": time.time() * 1000
            }
            self.sequence_errors.append(error)
            self._emit_event(EVENT_SEQUENCE_ERROR, error)
        else:
            self.expected_sequence += 1

        return is_valid

    def _simulate_out_of_order(self, sequence_list: list[int]) -> list[int]:
        """
        模拟乱序接收（交换相邻帧的位置）
        """
        if not self.config or self.config.out_of_order_rate <= 0:
            return sequence_list

        result = sequence_list.copy()
        i = 0
        while i < len(result) - 1:
            if random.random() < self.config.out_of_order_rate:
                result[i], result[i + 1] = result[i + 1], result[i]
                i += 2
            else:
                i += 1
        return result

    async def _run_simulation(self):
        """运行BAM模拟流程"""
        try:
            assert self.config is not None
            self._change_state(STATE_TRANSMITTING, "开始BAM广播")

            bam_frame = build_bam_announce(
                len(self.original_message),
                self.total_packets,
                self.config.pgn
            )
            bam_id = build_j1939_id(
                priority=6,
                pgn=PGN_TP_CM | GLOBAL_ADDRESS,
                source_address=self.config.source_address
            )
            self._emit_event(EVENT_BAM_ANNOUNCE, {
                "can_id": bam_id,
                "pgn": PGN_TP_CM,
                "source_address": self.config.source_address,
                "destination_address": GLOBAL_ADDRESS,
                "data": list(bam_frame),
                "message_size": len(self.original_message),
                "total_packets": self.total_packets,
                "target_pgn": self.config.pgn
            })

            if self.can_bus:
                self.can_bus.send(bam_id, list(bam_frame), extended=True)

            await asyncio.sleep(self.config.frame_interval)
            if self._stop_event.is_set():
                return

            sequence_order = list(range(1, self.total_packets + 1))
            if self.config.out_of_order_rate > 0:
                sequence_order = self._simulate_out_of_order(sequence_order)

            for seq in sequence_order:
                if self._stop_event.is_set():
                    break

                chunk = self.message_chunks[seq - 1]
                dt_frame = build_dt_frame(seq, chunk)
                dt_id = build_j1939_id(
                    priority=6,
                    pgn=PGN_TP_DT | GLOBAL_ADDRESS,
                    source_address=self.config.source_address
                )

                if self.can_bus:
                    self.can_bus.send(dt_id, list(dt_frame), extended=True)

                is_lost = self._should_drop_packet()

                frame_payload = {
                    "can_id": dt_id,
                    "pgn": PGN_TP_DT,
                    "source_address": self.config.source_address,
                    "destination_address": GLOBAL_ADDRESS,
                    "sequence_number": seq,
                    "data": list(dt_frame),
                    "payload_data": list(chunk),
                    "total_packets": self.total_packets,
                    "is_retransmit": False,
                    "is_lost": is_lost,
                    "is_out_of_order": seq != (len(self.received_packets) + len(self.lost_sequences) + 1),
                    "expected_sequence": self.expected_sequence
                }

                if is_lost:
                    self.lost_sequences.add(seq)
                    self._emit_event(EVENT_FRAME_LOST, frame_payload)
                else:
                    is_valid_seq = self._validate_sequence(seq)
                    frame_payload["sequence_valid"] = is_valid_seq
                    self.received_packets[seq] = chunk
                    self._emit_event(EVENT_FRAME_SENT, frame_payload)
                    self._emit_event(EVENT_FRAME_RECEIVED, frame_payload)

                self._emit_progress()

                await asyncio.sleep(self.config.frame_interval)

            if self._stop_event.is_set():
                return

            self._emit_event(EVENT_SIMULATION_COMPLETE, {
                "total_packets": self.total_packets,
                "received_count": len(self.received_packets),
                "lost_count": len(self.lost_sequences),
                "lost_sequences": sorted(list(self.lost_sequences)),
                "sequence_error_count": len(self.sequence_errors),
                "sequence_errors": self.sequence_errors,
                "reassembled_complete": len(self.lost_sequences) == 0,
                "original_message": list(self.original_message),
                "reassembled_message": list(self._reassemble_message())
            })

            self._change_state(STATE_COMPLETE, f"BAM传输完成，接收{len(self.received_packets)}/{self.total_packets}帧")

        except Exception as e:
            self._emit_event("error", {"code": "simulation_error", "message": str(e)})
            raise

    def _reassemble_message(self) -> bytes:
        """重组消息"""
        result = bytearray()
        for seq in range(1, self.total_packets + 1):
            if seq in self.received_packets:
                result.extend(self.received_packets[seq])
            else:
                result.extend([0x00] * 7)
        return bytes(result[:len(self.original_message)])

    def _emit_progress(self):
        """发送重组进度事件"""
        missing = [seq for seq in range(1, self.total_packets + 1)
                   if seq not in self.received_packets]
        complete = len(self.received_packets) == self.total_packets

        self._emit_event(EVENT_REASSEMBLY_PROGRESS, {
            "message_id": f"msg_{int(time.time())}",
            "total_packets": self.total_packets,
            "received_packets": len(self.received_packets),
            "missing_sequences": missing,
            "complete": complete,
            "reassembled_data": list(self._reassemble_message()) if complete else None
        })
