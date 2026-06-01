"""多接收节点广播模拟器"""

import asyncio
import random
import time
from typing import Callable, Optional, List, Dict
from dataclasses import dataclass, field

from .constants import (
    PGN_TP_CM, PGN_TP_DT, GLOBAL_ADDRESS,
    MODE_BAM, STATE_IDLE, STATE_TRANSMITTING, STATE_COMPLETE, STATE_ABORTED,
    EVENT_BAM_ANNOUNCE, EVENT_FRAME_SENT, EVENT_FRAME_LOST,
    EVENT_FRAME_RECEIVED, EVENT_REASSEMBLY_PROGRESS,
    EVENT_SIMULATION_COMPLETE, EVENT_STATE_CHANGE, EVENT_SEQUENCE_ERROR,
    EVENT_NODE_RECEIVE, EVENT_NODE_PROGRESS,
    MAX_TP_MESSAGE_SIZE, MIN_TP_MESSAGE_SIZE
)
from .frames import (
    build_bam_announce, build_dt_frame, build_j1939_id,
    split_message, parse_tp_dt
)


@dataclass
class ReceiverNode:
    """接收节点"""
    node_id: int
    name: str
    address: int
    packet_loss_rate: float = 0.0
    out_of_order_rate: float = 0.0

    # 运行时状态
    received_packets: Dict[int, bytes] = field(default_factory=dict)
    lost_sequences: set = field(default_factory=set)
    expected_sequence: int = 1
    sequence_errors: List[dict] = field(default_factory=list)
    is_complete: bool = False


@dataclass
class MultiNodeBamConfig:
    """多节点BAM模拟配置"""
    message_size: int = 100
    source_address: int = 0x01
    frame_interval: float = 0.05
    out_of_order_rate: float = 0.0
    pgn: int = 0xF004
    receiver_nodes: List[ReceiverNode] = field(default_factory=list)

    @classmethod
    def create_default_nodes(cls, count: int = 3) -> List[ReceiverNode]:
        """创建默认接收节点"""
        nodes = []
        names = ["节点A", "节点B", "节点C", "节点D", "节点E"]
        for i in range(count):
            nodes.append(ReceiverNode(
                node_id=i,
                name=names[i] if i < len(names) else f"节点{i + 1}",
                address=0x10 + i,
                packet_loss_rate=0.0,
                out_of_order_rate=0.0
            ))
        return nodes


class MultiNodeBamSimulator:
    """
    多接收节点BAM广播模拟器
    模拟发送端广播消息，多个接收节点独立接收和重组
    """

    def __init__(self, can_bus=None):
        self.can_bus = can_bus
        self.config: Optional[MultiNodeBamConfig] = None
        self.state = STATE_IDLE
        self.original_message: bytes = b""
        self.message_chunks: List[bytes] = []
        self.total_packets: int = 0
        self.nodes: List[ReceiverNode] = []
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
        payload["multi_node"] = True
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

    def configure(self, config: MultiNodeBamConfig):
        """配置模拟参数"""
        if config.message_size < MIN_TP_MESSAGE_SIZE:
            raise ValueError(f"消息大小至少为{MIN_TP_MESSAGE_SIZE}字节")
        if config.message_size > MAX_TP_MESSAGE_SIZE:
            raise ValueError(f"消息大小不能超过{MAX_TP_MESSAGE_SIZE}字节")
        if not config.receiver_nodes:
            raise ValueError("至少需要配置一个接收节点")

        self.config = config
        self.original_message = bytes([i % 256 for i in range(config.message_size)])
        self.message_chunks = split_message(self.original_message)
        self.total_packets = len(self.message_chunks)
        self.nodes = []
        for node_config in config.receiver_nodes:
            self.nodes.append(ReceiverNode(
                node_id=node_config.node_id,
                name=node_config.name,
                address=node_config.address,
                packet_loss_rate=node_config.packet_loss_rate,
                out_of_order_rate=node_config.out_of_order_rate
            ))
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
        self.total_packets = 0
        self.nodes = []
        self.state = STATE_IDLE

    def _should_drop_packet_for_node(self, node: ReceiverNode) -> bool:
        """根据节点丢包率决定是否丢包"""
        return random.random() < node.packet_loss_rate

    def _validate_sequence_for_node(self, node: ReceiverNode, received_seq: int) -> bool:
        """为指定节点验证序列号"""
        is_valid = received_seq == node.expected_sequence

        if not is_valid:
            error = {
                "node_id": node.node_id,
                "node_name": node.name,
                "expected": node.expected_sequence,
                "received": received_seq,
                "timestamp": time.time() * 1000
            }
            node.sequence_errors.append(error)
            self._emit_event(EVENT_SEQUENCE_ERROR, error)
        else:
            node.expected_sequence += 1

        return is_valid

    def _get_node_sequence_order(self, node: ReceiverNode) -> List[int]:
        """获取节点的接收顺序（考虑乱序）"""
        sequence_order = list(range(1, self.total_packets + 1))

        if node.out_of_order_rate <= 0:
            return sequence_order

        result = sequence_order.copy()
        i = 0
        while i < len(result) - 1:
            if random.random() < node.out_of_order_rate:
                result[i], result[i + 1] = result[i + 1], result[i]
                i += 2
            else:
                i += 1
        return result

    def _reassemble_message_for_node(self, node: ReceiverNode) -> bytes:
        """为指定节点重组消息"""
        result = bytearray()
        for seq in range(1, self.total_packets + 1):
            if seq in node.received_packets:
                result.extend(node.received_packets[seq])
            else:
                result.extend([0x00] * 7)
        return bytes(result[:len(self.original_message)])

    def _emit_node_progress(self, node: ReceiverNode):
        """发送节点进度事件"""
        missing = [seq for seq in range(1, self.total_packets + 1)
                   if seq not in node.received_packets]
        complete = len(node.received_packets) == self.total_packets
        node.is_complete = complete

        self._emit_event(EVENT_NODE_PROGRESS, {
            "node_id": node.node_id,
            "node_name": node.name,
            "node_address": node.address,
            "total_packets": self.total_packets,
            "received_packets": len(node.received_packets),
            "missing_sequences": missing,
            "lost_sequences": sorted(list(node.lost_sequences)),
            "sequence_error_count": len(node.sequence_errors),
            "complete": complete,
            "reassembled_data": list(self._reassemble_message_for_node(node)) if complete else None
        })

    async def _run_simulation(self):
        """运行多节点BAM模拟流程"""
        try:
            assert self.config is not None
            self._change_state(STATE_TRANSMITTING, f"开始多节点BAM广播，{len(self.nodes)}个接收节点")

            # 发送BAM公告帧
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
                "target_pgn": self.config.pgn,
                "node_count": len(self.nodes),
                "nodes": [{"id": n.node_id, "name": n.name, "address": n.address} for n in self.nodes]
            })

            if self.can_bus:
                self.can_bus.send(bam_id, list(bam_frame), extended=True)

            await asyncio.sleep(self.config.frame_interval)
            if self._stop_event.is_set():
                return

            # 为每个节点生成接收顺序
            node_sequences = {}
            for node in self.nodes:
                node_sequences[node.node_id] = self._get_node_sequence_order(node)

            # 发送数据帧（按发送顺序）
            for send_seq in range(1, self.total_packets + 1):
                if self._stop_event.is_set():
                    break

                chunk = self.message_chunks[send_seq - 1]
                dt_frame = build_dt_frame(send_seq, chunk)
                dt_id = build_j1939_id(
                    priority=6,
                    pgn=PGN_TP_DT | GLOBAL_ADDRESS,
                    source_address=self.config.source_address
                )

                if self.can_bus:
                    self.can_bus.send(dt_id, list(dt_frame), extended=True)

                # 发送帧发送事件
                self._emit_event(EVENT_FRAME_SENT, {
                    "can_id": dt_id,
                    "pgn": PGN_TP_DT,
                    "source_address": self.config.source_address,
                    "destination_address": GLOBAL_ADDRESS,
                    "sequence_number": send_seq,
                    "data": list(dt_frame),
                    "payload_data": list(chunk),
                    "total_packets": self.total_packets,
                    "is_retransmit": False
                })

                await asyncio.sleep(self.config.frame_interval / 2)

                # 模拟每个节点的接收
                for node in self.nodes:
                    if self._stop_event.is_set():
                        break

                    node_seq_pos = node_sequences[node.node_id].index(send_seq)
                    actual_recv_seq = node_sequences[node.node_id][node_seq_pos]

                    is_lost = self._should_drop_packet_for_node(node)

                    frame_payload = {
                        "node_id": node.node_id,
                        "node_name": node.name,
                        "node_address": node.address,
                        "can_id": dt_id,
                        "pgn": PGN_TP_DT,
                        "source_address": self.config.source_address,
                        "destination_address": node.address,
                        "sequence_number": actual_recv_seq,
                        "data": list(dt_frame),
                        "payload_data": list(chunk),
                        "total_packets": self.total_packets,
                        "is_lost": is_lost
                    }

                    if is_lost:
                        node.lost_sequences.add(actual_recv_seq)
                        frame_payload["is_lost"] = True
                        self._emit_event(EVENT_FRAME_LOST, frame_payload)
                    else:
                        is_valid_seq = self._validate_sequence_for_node(node, actual_recv_seq)
                        frame_payload["sequence_valid"] = is_valid_seq
                        node.received_packets[actual_recv_seq] = chunk
                        self._emit_event(EVENT_NODE_RECEIVE, frame_payload)

                    self._emit_node_progress(node)

                await asyncio.sleep(self.config.frame_interval / 2)

            if self._stop_event.is_set():
                return

            # 发送完成事件
            node_results = []
            for node in self.nodes:
                node_results.append({
                    "node_id": node.node_id,
                    "node_name": node.name,
                    "node_address": node.address,
                    "total_packets": self.total_packets,
                    "received_count": len(node.received_packets),
                    "lost_count": len(node.lost_sequences),
                    "lost_sequences": sorted(list(node.lost_sequences)),
                    "sequence_error_count": len(node.sequence_errors),
                    "sequence_errors": node.sequence_errors,
                    "reassembled_complete": node.is_complete,
                    "reassembled_message": list(self._reassemble_message_for_node(node))
                })

            self._emit_event(EVENT_SIMULATION_COMPLETE, {
                "total_packets": self.total_packets,
                "node_count": len(self.nodes),
                "node_results": node_results,
                "original_message": list(self.original_message),
                "multi_node": True
            })

            complete_nodes = sum(1 for n in self.nodes if n.is_complete)
            self._change_state(STATE_COMPLETE,
                              f"多节点BAM传输完成，{complete_nodes}/{len(self.nodes)}个节点完整接收")

        except Exception as e:
            self._emit_event("error", {"code": "simulation_error", "message": str(e)})
            raise
