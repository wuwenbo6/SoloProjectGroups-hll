from typing import Optional, List, Tuple, Callable, Any
from dataclasses import dataclass
import logging
from enum import Enum

from .port import Port, PortType
from .mac_table import MacTable
from .mirror import MirrorEngine, MirrorDirection, MirrorResult, MirrorMetadata
from .packet_handler import PacketInfo

logger = logging.getLogger(__name__)


class PipelineAction(str, Enum):
    FORWARD = 'forward'
    DROP = 'drop'
    FLOOD = 'flood'
    MIRROR = 'mirror'


@dataclass
class PipelineResult:
    action: PipelineAction
    out_ports: List[int]
    mirror_ports: List[int]
    mirror_metadata: List[MirrorMetadata]
    mirror_dropped: bool
    mac_learned: bool
    packet_info: PacketInfo
    drop_reason: Optional[str] = None


class ForwardingPipeline:
    def __init__(self, mac_table: MacTable, mirror_engine: MirrorEngine):
        self.mac_table = mac_table
        self.mirror_engine = mirror_engine
        self._callbacks: List[Callable[[PipelineResult], None]] = []

    def add_callback(self, callback: Callable[[PipelineResult], None]) -> None:
        self._callbacks.append(callback)

    def remove_callback(self, callback: Callable[[PipelineResult], None]) -> None:
        if callback in self._callbacks:
            self._callbacks.remove(callback)

    def _notify_callbacks(self, result: PipelineResult) -> None:
        for callback in self._callbacks:
            try:
                callback(result)
            except Exception as e:
                logger.error(f"Error in pipeline callback: {e}")

    def process_ingress(self, packet_bytes: bytes, in_port: Port, 
                        packet_info: PacketInfo) -> PipelineResult:
        logger.debug(f"Ingress pipeline: packet from port {in_port.id}")

        mirror_ports = []
        mirror_metadata: List[MirrorMetadata] = []
        mirror_dropped = False
        mac_learned = False

        mirror_result: MirrorResult = self.mirror_engine.process_mirror(
            packet_size=len(packet_bytes),
            source_port=in_port.id,
            direction=MirrorDirection.INGRESS,
            original_timestamp=packet_info.timestamp,
            packet_info=packet_info
        )
        mirror_ports = mirror_result.monitor_ports
        mirror_metadata = mirror_result.metadata
        mirror_dropped = mirror_result.dropped

        if mirror_ports:
            logger.debug(f"Ingress mirror to ports: {mirror_ports}")
        if mirror_dropped:
            logger.debug(f"Some mirror traffic dropped due to rate limit")

        eth = packet_info.ethernet
        if eth:
            src_mac = eth.get('srcMac', '')
            dst_mac = eth.get('dstMac', '')

            if src_mac:
                mac_learned = self.mac_table.learn(src_mac, in_port.id)
                if mac_learned:
                    logger.info(f"MAC learned: {src_mac} -> port {in_port.id}")

            out_port_id = self.mac_table.lookup(dst_mac)
            
            if out_port_id is not None:
                action = PipelineAction.FORWARD
                out_ports = [out_port_id]
                logger.debug(f"Forwarding to port {out_port_id} (MAC hit)")
            else:
                action = PipelineAction.FLOOD
                out_ports = []
                logger.debug(f"Flooding (MAC miss for {dst_mac})")
        else:
            action = PipelineAction.DROP
            out_ports = []
            drop_reason = "Invalid Ethernet header"
            logger.warning(f"Dropping packet: {drop_reason}")
            result = PipelineResult(
                action=action,
                out_ports=out_ports,
                mirror_ports=mirror_ports,
                mirror_metadata=mirror_metadata,
                mirror_dropped=mirror_dropped,
                mac_learned=mac_learned,
                packet_info=packet_info,
                drop_reason=drop_reason
            )
            self._notify_callbacks(result)
            return result

        packet_info.dest_port = out_ports[0] if out_ports else None

        result = PipelineResult(
            action=action,
            out_ports=out_ports,
            mirror_ports=mirror_ports,
            mirror_metadata=mirror_metadata,
            mirror_dropped=mirror_dropped,
            mac_learned=mac_learned,
            packet_info=packet_info
        )

        self._notify_callbacks(result)
        return result

    def process_egress(self, packet_bytes: bytes, out_port: Port,
                       packet_info: PacketInfo) -> Optional[bytes]:
        logger.debug(f"Egress pipeline: packet to port {out_port.id}")

        if out_port.status != 'up':
            logger.warning(f"Port {out_port.id} is down, dropping packet")
            return None

        if self.mirror_engine.has_mirror_rule(out_port.id, MirrorDirection.EGRESS):
            egress_mirror_ports = self.mirror_engine.get_monitor_ports(
                out_port.id, MirrorDirection.EGRESS
            )
            logger.debug(f"Egress mirror to ports: {egress_mirror_ports}")
            for _ in egress_mirror_ports:
                self.mirror_engine.increment_mirrored()

        return packet_bytes

    def get_flood_ports(self, exclude_port_id: int, ports: List[Port]) -> List[int]:
        return [
            port.id for port in ports
            if port.id != exclude_port_id 
            and port.type == PortType.NORMAL
            and port.status == 'up'
        ]
