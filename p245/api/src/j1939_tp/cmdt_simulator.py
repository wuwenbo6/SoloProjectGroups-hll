"""CMDT点对点模式模拟器（带RTS/CTS握手与重传机制）"""

import asyncio
import random
import time
from typing import Callable, Optional
from dataclasses import dataclass

from .constants import (
    PGN_TP_CM, PGN_TP_DT,
    MODE_CMDT,
    STATE_IDLE, STATE_WAITING_CTS, STATE_TRANSMITTING,
    STATE_RETRANSMITTING, STATE_WAITING_ACK, STATE_COMPLETE, STATE_ABORTED,
    EVENT_RTS_SENT, EVENT_RTS_RETRY, EVENT_RTS_TIMEOUT, EVENT_CTS_SENT,
    EVENT_FRAME_SENT, EVENT_FRAME_RECEIVED,
    EVENT_FRAME_LOST, EVENT_FRAME_RETRANSMIT, EVENT_EOM_ACK,
    EVENT_REASSEMBLY_PROGRESS, EVENT_SIMULATION_COMPLETE, EVENT_STATE_CHANGE,
    MAX_TP_MESSAGE_SIZE, MIN_TP_MESSAGE_SIZE,
    RTS_TIMEOUT, MAX_RTS_RETRIES
)
from .frames import (
    build_rts, build_cts, build_eom_ack, build_dt_frame, build_j1939_id,
    split_message, parse_tp_cm, parse_tp_dt
)


@dataclass
class CmdtConfig:
    """CMDT模拟配置"""
    message_size: int = 100
    source_address: int = 0x01
    destination_address: int = 0x02
    packet_loss_rate: float = 0.0
    frame_interval: float = 0.03
    cts_window_size: int = 255
    cts_timeout: float = 1.0
    cts_loss_rate: float = 0.0
    max_rts_retries: int = 3
    pgn: int = 0xF004  # 示例PGN (Proprietary B)


class CmdtSimulator:
    """
    CMDT点对点模式模拟器
    模拟发送端与接收端之间的RTS/CTS握手、数据传输、丢包重传、EndOfMsgAck确认
    """

    def __init__(self, can_bus=None):
        self.can_bus = can_bus
        self.config: Optional[CmdtConfig] = None
        self.state = STATE_IDLE
        self.original_message: bytes = b""
        self.message_chunks: list[bytes] = []
        self.received_packets: dict[int, bytes] = {}
        self.lost_sequences: set[int] = set()
        self.total_packets: int = 0
        self.event_callback: Optional[Callable[[str, dict], None]] = None
        self.simulation_task: Optional[asyncio.Task] = None
        self._stop_event = asyncio.Event()

    def set_event_callback(self, callback: Callable[[str, dict], None]):
        """设置事件回调"""
        self.event_callback = callback

    def _emit_event(self, event_type: str, payload: dict):
        """发送事件"""
        payload["timestamp"] = time.time() * 1000
        payload["mode"] = MODE_CMDT
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

    def configure(self, config: CmdtConfig):
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
        self.state = STATE_IDLE

    def _should_drop_packet(self) -> bool:
        """根据丢包率决定是否丢包"""
        if not self.config:
            return False
        return random.random() < self.config.packet_loss_rate

    def _should_drop_cts(self) -> bool:
        """根据CTS丢包率决定是否丢包"""
        if not self.config:
            return False
        return random.random() < self.config.cts_loss_rate

    async def _send_rts_and_wait_cts(self) -> bool:
        """
        发送RTS并等待CTS，支持超时重试
        返回 True 如果收到有效的CTS，False 如果超时重试次数耗尽
        """
        assert self.config is not None

        rts_retries = 0
        max_retries = self.config.max_rts_retries

        while rts_retries <= max_retries:
            if self._stop_event.is_set():
                return False

            rts_frame = build_rts(
                len(self.original_message),
                self.total_packets,
                min(self.config.cts_window_size, self.total_packets),
                self.config.pgn
            )
            rts_id = build_j1939_id(
                priority=6,
                pgn=PGN_TP_CM | self.config.destination_address,
                source_address=self.config.source_address
            )

            if rts_retries == 0:
                self._emit_event(EVENT_RTS_SENT, {
                    "can_id": rts_id,
                    "pgn": PGN_TP_CM,
                    "source_address": self.config.source_address,
                    "destination_address": self.config.destination_address,
                    "data": list(rts_frame),
                    "message_size": len(self.original_message),
                    "total_packets": self.total_packets,
                    "window_size": self.config.cts_window_size,
                    "target_pgn": self.config.pgn,
                    "retry_count": rts_retries
                })
            else:
                self._emit_event(EVENT_RTS_RETRY, {
                    "can_id": rts_id,
                    "pgn": PGN_TP_CM,
                    "source_address": self.config.source_address,
                    "destination_address": self.config.destination_address,
                    "data": list(rts_frame),
                    "message_size": len(self.original_message),
                    "total_packets": self.total_packets,
                    "window_size": self.config.cts_window_size,
                    "target_pgn": self.config.pgn,
                    "retry_count": rts_retries,
                    "max_retries": max_retries
                })

            if self.can_bus:
                self.can_bus.send(rts_id, list(rts_frame), extended=True)

            try:
                cts_received = await asyncio.wait_for(
                    self._wait_for_cts(),
                    timeout=self.config.cts_timeout
                )
                if cts_received:
                    return True
                else:
                    rts_retries += 1
                    self._emit_event(EVENT_RTS_TIMEOUT, {
                        "retry_count": rts_retries,
                        "max_retries": max_retries,
                        "timeout": self.config.cts_timeout,
                        "timestamp": time.time() * 1000
                    })
                    self._change_state(
                        STATE_WAITING_CTS,
                        f"CTS丢失（{rts_retries}/{max_retries}），重试中..."
                    )
                    continue
            except asyncio.TimeoutError:
                rts_retries += 1
                self._emit_event(EVENT_RTS_TIMEOUT, {
                    "retry_count": rts_retries,
                    "max_retries": max_retries,
                    "timeout": self.config.cts_timeout,
                    "timestamp": time.time() * 1000
                })
                self._change_state(
                    STATE_WAITING_CTS,
                    f"RTS超时（{rts_retries}/{max_retries}），重试中..."
                )
                continue

        self._change_state(STATE_ABORTED, "RTS重试次数耗尽，连接中止")
        return False

    async def _wait_for_cts(self) -> bool:
        """
        模拟等待CTS
        返回 True 如果收到CTS，False 如果CTS丢失
        """
        assert self.config is not None

        await asyncio.sleep(self.config.frame_interval * 2)

        if self._stop_event.is_set():
            return False

        if self._should_drop_cts():
            return False

        cts_frame = build_cts(self.total_packets, 1, self.config.pgn)
        cts_id = build_j1939_id(
            priority=6,
            pgn=PGN_TP_CM | self.config.source_address,
            source_address=self.config.destination_address
        )
        self._emit_event(EVENT_CTS_SENT, {
            "can_id": cts_id,
            "pgn": PGN_TP_CM,
            "source_address": self.config.destination_address,
            "destination_address": self.config.source_address,
            "data": list(cts_frame),
            "packets_allowed": self.total_packets,
            "next_sequence": 1,
            "target_pgn": self.config.pgn
        })

        if self.can_bus:
            self.can_bus.send(cts_id, list(cts_frame), extended=True)

        return True

    async def _run_simulation(self):
        """运行CMDT模拟流程"""
        try:
            assert self.config is not None
            self._change_state(STATE_WAITING_CTS, "发送RTS，等待CTS")

            cts_success = await self._send_rts_and_wait_cts()
            if not cts_success:
                return

            if self._stop_event.is_set():
                return

            self._change_state(STATE_TRANSMITTING, "开始数据传输")
            await asyncio.sleep(self.config.frame_interval)

            window_size = min(self.config.cts_window_size, self.total_packets)
            current_base = 1
            max_retries = 3

            while current_base <= self.total_packets:
                if self._stop_event.is_set():
                    return

                retry_count = 0
                while retry_count < max_retries:
                    if self._stop_event.is_set():
                        return

                    window_end = min(current_base + window_size - 1, self.total_packets)
                    await self._transmit_window(current_base, window_end)

                    missing_in_window = [
                        seq for seq in range(current_base, window_end + 1)
                        if seq not in self.received_packets
                    ]

                    if not missing_in_window:
                        break

                    retry_count += 1
                    self._change_state(
                        STATE_RETRANSMITTING,
                        f"窗口 {current_base}-{window_end} 丢包 {len(missing_in_window)} 帧，第 {retry_count} 次重传"
                    )

                    cts_retry = build_cts(
                        len(missing_in_window),
                        missing_in_window[0],
                        self.config.pgn
                    )
                    cts_retry_id = build_j1939_id(
                        priority=6,
                        pgn=PGN_TP_CM | self.config.source_address,
                        source_address=self.config.destination_address
                    )
                    self._emit_event(EVENT_CTS_SENT, {
                        "can_id": cts_retry_id,
                        "pgn": PGN_TP_CM,
                        "source_address": self.config.destination_address,
                        "destination_address": self.config.source_address,
                        "data": list(cts_retry),
                        "packets_allowed": len(missing_in_window),
                        "next_sequence": missing_in_window[0],
                        "target_pgn": self.config.pgn,
                        "is_retry": True
                    })

                    if self.can_bus:
                        self.can_bus.send(cts_retry_id, list(cts_retry), extended=True)

                    await asyncio.sleep(self.config.frame_interval)

                    for seq in missing_in_window:
                        if self._stop_event.is_set():
                            break
                        await self._retransmit_frame(seq)
                        await asyncio.sleep(self.config.frame_interval)

                    self._change_state(STATE_TRANSMITTING, f"窗口 {current_base}-{window_end} 重传完成")

                if retry_count >= max_retries:
                    self._change_state(STATE_ABORTED, f"窗口 {current_base}-{window_end} 重传次数超限")
                    return

                current_base += window_size

            if self._stop_event.is_set():
                return

            self._change_state(STATE_WAITING_ACK, "数据传输完成，等待EndOfMsgAck")

            eom_ack_frame = build_eom_ack(
                len(self.original_message),
                self.total_packets,
                self.config.pgn
            )
            eom_ack_id = build_j1939_id(
                priority=6,
                pgn=PGN_TP_CM | self.config.source_address,
                source_address=self.config.destination_address
            )
            self._emit_event(EVENT_EOM_ACK, {
                "can_id": eom_ack_id,
                "pgn": PGN_TP_CM,
                "source_address": self.config.destination_address,
                "destination_address": self.config.source_address,
                "data": list(eom_ack_frame),
                "message_size": len(self.original_message),
                "total_packets": self.total_packets,
                "target_pgn": self.config.pgn
            })

            if self.can_bus:
                self.can_bus.send(eom_ack_id, list(eom_ack_frame), extended=True)

            await asyncio.sleep(self.config.frame_interval)

            self._emit_event(EVENT_SIMULATION_COMPLETE, {
                "total_packets": self.total_packets,
                "received_count": len(self.received_packets),
                "lost_count": len(self.lost_sequences),
                "lost_sequences": sorted(list(self.lost_sequences)),
                "reassembled_complete": len(self.received_packets) == self.total_packets,
                "original_message": list(self.original_message),
                "reassembled_message": list(self._reassemble_message())
            })

            self._change_state(STATE_COMPLETE, "CMDT传输完成，消息已确认")

        except Exception as e:
            self._emit_event("error", {"code": "simulation_error", "message": str(e)})
            raise

    async def _transmit_window(self, start: int, end: int):
        """传输一个窗口内的所有帧"""
        assert self.config is not None

        for seq in range(start, end + 1):
            if self._stop_event.is_set():
                return

            if seq in self.received_packets:
                continue

            chunk = self.message_chunks[seq - 1]
            dt_frame = build_dt_frame(seq, chunk)
            dt_id = build_j1939_id(
                priority=6,
                pgn=PGN_TP_DT | self.config.destination_address,
                source_address=self.config.source_address
            )

            if self.can_bus:
                self.can_bus.send(dt_id, list(dt_frame), extended=True)

            is_lost = self._should_drop_packet()

            frame_payload = {
                "can_id": dt_id,
                "pgn": PGN_TP_DT,
                "source_address": self.config.source_address,
                "destination_address": self.config.destination_address,
                "sequence_number": seq,
                "data": list(dt_frame),
                "payload_data": list(chunk),
                "total_packets": self.total_packets,
                "is_retransmit": False,
                "is_lost": is_lost
            }

            if is_lost:
                self.lost_sequences.add(seq)
                self._emit_event(EVENT_FRAME_LOST, frame_payload)
            else:
                self.received_packets[seq] = chunk
                self._emit_event(EVENT_FRAME_SENT, frame_payload)
                self._emit_event(EVENT_FRAME_RECEIVED, frame_payload)

            self._emit_progress()
            await asyncio.sleep(self.config.frame_interval)

    async def _retransmit_frame(self, seq: int):
        """重传单个帧"""
        assert self.config is not None

        chunk = self.message_chunks[seq - 1]
        dt_frame = build_dt_frame(seq, chunk)
        dt_id = build_j1939_id(
            priority=6,
            pgn=PGN_TP_DT | self.config.destination_address,
            source_address=self.config.source_address
        )

        if self.can_bus:
            self.can_bus.send(dt_id, list(dt_frame), extended=True)

        is_lost = self._should_drop_packet()

        frame_payload = {
            "can_id": dt_id,
            "pgn": PGN_TP_DT,
            "source_address": self.config.source_address,
            "destination_address": self.config.destination_address,
            "sequence_number": seq,
            "data": list(dt_frame),
            "payload_data": list(chunk),
            "total_packets": self.total_packets,
            "is_retransmit": True,
            "is_lost": is_lost
        }

        if is_lost:
            self._emit_event(EVENT_FRAME_LOST, frame_payload)
        else:
            if seq in self.lost_sequences:
                self.lost_sequences.discard(seq)
            self.received_packets[seq] = chunk
            self._emit_event(EVENT_FRAME_RETRANSMIT, frame_payload)
            self._emit_event(EVENT_FRAME_RECEIVED, frame_payload)

        self._emit_progress()

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
