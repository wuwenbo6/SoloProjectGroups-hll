from typing import List, Optional, Dict, Callable, Any
from dataclasses import dataclass, field
import time
import logging
import asyncio
from collections import deque

from .port import Port, PortType, PortStatus
from .mac_table import MacTable
from .mirror import MirrorEngine, MirrorDirection, MirrorRule, MirrorMatch
from .pipeline import ForwardingPipeline, PipelineResult, PipelineAction
from .packet_handler import PacketHandler, PacketInfo, MirrorPacketMetadata

logger = logging.getLogger(__name__)


@dataclass
class SwitchStatus:
    running: bool = False
    start_time: Optional[float] = None
    total_rx_packets: int = 0
    total_tx_packets: int = 0
    total_mirror_packets: int = 0

    def to_dict(self) -> Dict[str, Any]:
        uptime = int(time.time() - self.start_time) if self.start_time and self.running else 0
        return {
            'running': self.running,
            'uptime': uptime,
            'totalRxPackets': self.total_rx_packets,
            'totalTxPackets': self.total_tx_packets,
            'totalMirrorPackets': self.total_mirror_packets,
            'macTableSize': 0,
        }


class VirtualSwitch:
    def __init__(self, name: str = "p4-switch"):
        self.name = name
        self._ports: Dict[int, Port] = {}
        self._next_port_id = 1

        self.mac_table = MacTable(aging_time=300)
        self.mirror_engine = MirrorEngine()
        self.pipeline = ForwardingPipeline(self.mac_table, self.mirror_engine)
        self.packet_handler = PacketHandler()

        self.status = SwitchStatus()
        self._packet_buffer: deque = deque(maxlen=1000)
        self._original_packets: deque = deque(maxlen=500)
        self._mirror_packets: deque = deque(maxlen=500)

        self._packet_callbacks: List[Callable[[PacketInfo], None]] = []
        self._log_callbacks: List[Callable[[Dict[str, Any]], None]] = []
        self._mac_update_callbacks: List[Callable[[Dict[str, Any]], None]] = []
        self._port_update_callbacks: List[Callable[[Dict[str, Any]], None]] = []
        self._status_callbacks: List[Callable[[Dict[str, Any]], None]] = []

        self._init_default_ports()
        self._setup_pipeline_callbacks()

    def _init_default_ports(self) -> None:
        for i in range(1, 5):
            self.add_port(f"port-{i}", PortType.NORMAL)
        self.add_port("monitor-1", PortType.MONITOR)

    def _setup_pipeline_callbacks(self) -> None:
        def on_pipeline_result(result: PipelineResult):
            if result.mac_learned:
                self._notify_mac_update({
                    'macAddress': result.packet_info.ethernet.get('srcMac', ''),
                    'portId': result.packet_info.source_port,
                    'timestamp': time.time(),
                    'age': 300
                })

        self.pipeline.add_callback(on_pipeline_result)

    def add_port(self, name: str, port_type: PortType = PortType.NORMAL,
                 mac_address: Optional[str] = None) -> Port:
        port_id = self._next_port_id
        self._next_port_id += 1

        port = Port(
            id=port_id,
            name=name,
            type=port_type,
            status=PortStatus.UP,
            mac_address=mac_address
        )
        self._ports[port_id] = port
        self._log('info', f"Port {port_id} ({name}) added as {port_type.value}")
        self._notify_port_update(port.to_dict())
        return port

    def remove_port(self, port_id: int) -> bool:
        if port_id in self._ports:
            del self._ports[port_id]
            self._log('info', f"Port {port_id} removed")
            return True
        return False

    def get_port(self, port_id: int) -> Optional[Port]:
        return self._ports.get(port_id)

    def get_all_ports(self) -> List[Port]:
        return list(self._ports.values())

    def set_port_status(self, port_id: int, status: PortStatus) -> Optional[Port]:
        port = self._ports.get(port_id)
        if port:
            port.set_status(status)
            self._log('info', f"Port {port_id} status changed to {status.value}")
            self._notify_port_update(port.to_dict())
        return port

    def add_mirror_rule(self, source_port: int, monitor_port: int,
                        direction: MirrorDirection = MirrorDirection.INGRESS,
                        match: Optional[MirrorMatch] = None) -> Optional[MirrorRule]:
        if source_port not in self._ports or monitor_port not in self._ports:
            self._log('error', f"Invalid ports for mirror rule: {source_port} -> {monitor_port}")
            return None

        monitor_port_obj = self._ports[monitor_port]
        if monitor_port_obj.type != PortType.MONITOR:
            self._log('warning', f"Port {monitor_port} is not a monitor port")

        rule = self.mirror_engine.add_rule(source_port, monitor_port, direction, match)
        match_desc = f" with match: {match.to_dict()}" if match and not match.is_empty() else ""
        self._log('info', f"Mirror rule added: port {source_port} -> {monitor_port} ({direction.value}){match_desc}")
        return rule

    def remove_mirror_rule(self, rule_id: int) -> bool:
        result = self.mirror_engine.remove_rule(rule_id)
        if result:
            self._log('info', f"Mirror rule {rule_id} removed")
        return result

    def get_mirror_rules(self) -> List[MirrorRule]:
        return self.mirror_engine.get_all_rules()

    def send_packet(self, packet_bytes: bytes, in_port_id: int) -> Optional[PipelineResult]:
        if not self.status.running:
            self._log('warning', "Switch is not running")
            return None

        in_port = self._ports.get(in_port_id)
        if not in_port:
            self._log('error', f"Port {in_port_id} not found")
            return None

        if in_port.status != PortStatus.UP:
            self._log('warning', f"Port {in_port_id} is down")
            return None

        in_port.increment_rx()
        self.status.total_rx_packets += 1

        packet_info = self.packet_handler.parse_packet(
            packet_bytes, in_port_id, 'original'
        )

        self._original_packets.append(packet_info)
        self._packet_buffer.append(packet_info)
        self._notify_packet(packet_info)

        result = self.pipeline.process_ingress(packet_bytes, in_port, packet_info)

        if result.mirror_ports and result.mirror_metadata:
            for monitor_port_id, mirror_meta in zip(result.mirror_ports, result.mirror_metadata):
                mirror_info = self.packet_handler.parse_packet(
                    packet_bytes, monitor_port_id, 'mirror',
                    mirror_source_port=in_port_id
                )
                mirror_info.dest_port = monitor_port_id
                mirror_info.mirror_metadata = MirrorPacketMetadata(
                    original_source_port=mirror_meta.original_source_port,
                    original_timestamp=mirror_meta.original_timestamp,
                    mirror_timestamp=mirror_meta.mirror_timestamp,
                    mirror_rule_id=mirror_meta.mirror_rule_id,
                    packet_size=mirror_meta.packet_size
                )
                self._mirror_packets.append(mirror_info)
                self._packet_buffer.append(mirror_info)
                self._notify_packet(mirror_info)

                monitor_port = self._ports.get(monitor_port_id)
                if monitor_port and monitor_port.status == PortStatus.UP:
                    monitor_port.increment_tx()
                    self.status.total_tx_packets += 1
                    self.status.total_mirror_packets += 1

        if result.mirror_dropped:
            self._log('warning', 'Some mirror packets dropped due to rate limit')

        if result.action == PipelineAction.FORWARD and result.out_ports:
            for out_port_id in result.out_ports:
                out_port = self._ports.get(out_port_id)
                if out_port:
                    egress_result = self.pipeline.process_egress(
                        packet_bytes, out_port, packet_info
                    )
                    if egress_result is not None:
                        out_port.increment_tx()
                        self.status.total_tx_packets += 1
                        self._log('debug', f"Packet forwarded to port {out_port_id}")

        elif result.action == PipelineAction.FLOOD:
            flood_ports = self.pipeline.get_flood_ports(
                in_port_id, self.get_all_ports()
            )
            for out_port_id in flood_ports:
                out_port = self._ports.get(out_port_id)
                if out_port:
                    egress_result = self.pipeline.process_egress(
                        packet_bytes, out_port, packet_info
                    )
                    if egress_result is not None:
                        out_port.increment_tx()
                        self.status.total_tx_packets += 1
            self._log('debug', f"Packet flooded to {len(flood_ports)} ports")

        elif result.action == PipelineAction.DROP:
            self._log('debug', f"Packet dropped: {result.drop_reason}")

        self._notify_status(self.get_status())
        return result

    def send_test_packet(self, src_mac: str, dst_mac: str,
                         src_ip: str, dst_ip: str,
                         src_port: int, dst_port: int,
                         in_port_id: int, protocol: str = 'tcp',
                         payload: str = '') -> Optional[PipelineResult]:
        packet_bytes = self.packet_handler.create_test_packet(
            src_mac, dst_mac, src_ip, dst_ip,
            src_port, dst_port, protocol, payload
        )
        return self.send_packet(packet_bytes, in_port_id)

    def start(self) -> None:
        if not self.status.running:
            self.status.running = True
            self.status.start_time = time.time()
            self._log('info', f"Virtual switch '{self.name}' started")
            self._notify_status(self.get_status())

    def stop(self) -> None:
        if self.status.running:
            self.status.running = False
            self._log('info', f"Virtual switch '{self.name}' stopped")
            self._notify_status(self.get_status())

    def reset(self) -> None:
        self.mac_table.clear()
        self.status.total_rx_packets = 0
        self.status.total_tx_packets = 0
        self.status.total_mirror_packets = 0
        self._packet_buffer.clear()
        self._original_packets.clear()
        self._mirror_packets.clear()
        for port in self._ports.values():
            port.rx_packets = 0
            port.tx_packets = 0
        self._log('info', "Switch statistics reset")
        self._notify_status(self.get_status())

    def get_status(self) -> Dict[str, Any]:
        status = self.status.to_dict()
        status['macTableSize'] = self.mac_table.size()
        status['name'] = self.name
        return status

    def get_packets(self, packet_type: Optional[str] = None, 
                    limit: int = 100) -> List[PacketInfo]:
        if packet_type == 'original':
            packets = list(self._original_packets)
        elif packet_type == 'mirror':
            packets = list(self._mirror_packets)
        else:
            packets = list(self._packet_buffer)

        return packets[-limit:] if limit > 0 else packets

    def clear_mac_table(self) -> None:
        self.mac_table.clear()
        self._log('info', "MAC table cleared")

    def set_mirror_rate_limit(self, rate_mbps: float) -> None:
        self.mirror_engine.set_rate_limit(rate_mbps)
        self._log('info', f"Mirror rate limit set to {rate_mbps} Mbps")

    def get_mirror_engine_stats(self) -> dict:
        return self.mirror_engine.get_engine_stats()

    def reset_mirror_stats(self) -> None:
        self.mirror_engine.reset_stats()
        self._log('info', "Mirror statistics reset")

    def get_detailed_mirror_stats(self, include_entries: bool = True, limit: int = 1000) -> dict:
        return self.mirror_engine.get_detailed_stats(include_entries=include_entries, limit=limit).to_dict()

    def export_mirror_stats_json(self, include_entries: bool = True, limit: int = 1000) -> str:
        return self.mirror_engine.export_stats_json(include_entries=include_entries, limit=limit)

    def export_mirror_stats_csv(self, include_entries: bool = True, limit: int = 1000) -> str:
        return self.mirror_engine.export_stats_csv(include_entries=include_entries, limit=limit)

    def _log(self, level: str, message: str) -> None:
        log_entry = {
            'timestamp': time.time(),
            'level': level,
            'message': message,
            'module': 'VirtualSwitch'
        }
        getattr(logger, level)(message)
        self._notify_log(log_entry)

    def on_packet(self, callback: Callable[[PacketInfo], None]) -> None:
        self._packet_callbacks.append(callback)

    def on_log(self, callback: Callable[[Dict[str, Any]], None]) -> None:
        self._log_callbacks.append(callback)

    def on_mac_update(self, callback: Callable[[Dict[str, Any]], None]) -> None:
        self._mac_update_callbacks.append(callback)

    def on_port_update(self, callback: Callable[[Dict[str, Any]], None]) -> None:
        self._port_update_callbacks.append(callback)

    def on_status(self, callback: Callable[[Dict[str, Any]], None]) -> None:
        self._status_callbacks.append(callback)

    def _notify_packet(self, packet: PacketInfo) -> None:
        for callback in self._packet_callbacks:
            try:
                callback(packet.to_dict())
            except Exception as e:
                logger.error(f"Error in packet callback: {e}")

    def _notify_log(self, log: Dict[str, Any]) -> None:
        for callback in self._log_callbacks:
            try:
                callback(log)
            except Exception as e:
                logger.error(f"Error in log callback: {e}")

    def _notify_mac_update(self, entry: Dict[str, Any]) -> None:
        for callback in self._mac_update_callbacks:
            try:
                callback(entry)
            except Exception as e:
                logger.error(f"Error in MAC update callback: {e}")

    def _notify_port_update(self, port: Dict[str, Any]) -> None:
        for callback in self._port_update_callbacks:
            try:
                callback(port)
            except Exception as e:
                logger.error(f"Error in port update callback: {e}")

    def _notify_status(self, status: Dict[str, Any]) -> None:
        for callback in self._status_callbacks:
            try:
                callback(status)
            except Exception as e:
                logger.error(f"Error in status callback: {e}")
