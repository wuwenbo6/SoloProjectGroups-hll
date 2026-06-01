from enum import Enum
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Any
import uuid
import time
import csv
import io
import json

from .token_bucket import TokenBucket, TokenBucketStats
from .packet_handler import PacketInfo


class MirrorDirection(str, Enum):
    INGRESS = 'ingress'
    EGRESS = 'egress'
    BOTH = 'both'


@dataclass
class MirrorMatch:
    protocol: Optional[str] = None
    src_port: Optional[int] = None
    dst_port: Optional[int] = None
    src_ip: Optional[str] = None
    dst_ip: Optional[str] = None
    src_mac: Optional[str] = None
    dst_mac: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            'protocol': self.protocol,
            'srcPort': self.src_port,
            'dstPort': self.dst_port,
            'srcIp': self.src_ip,
            'dstIp': self.dst_ip,
            'srcMac': self.src_mac,
            'dstMac': self.dst_mac,
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'MirrorMatch':
        return cls(
            protocol=data.get('protocol'),
            src_port=data.get('srcPort'),
            dst_port=data.get('dstPort'),
            src_ip=data.get('srcIp'),
            dst_ip=data.get('dstIp'),
            src_mac=data.get('srcMac'),
            dst_mac=data.get('dstMac'),
        )

    def matches(self, packet_info: PacketInfo) -> bool:
        if self.protocol and packet_info.transport:
            if packet_info.transport.get('protocol') != self.protocol.lower():
                return False

        if self.src_port and packet_info.transport:
            if packet_info.transport.get('srcPort') != self.src_port:
                return False

        if self.dst_port and packet_info.transport:
            if packet_info.transport.get('dstPort') != self.dst_port:
                return False

        if self.src_ip and packet_info.ip:
            if packet_info.ip.get('srcIp') != self.src_ip:
                return False

        if self.dst_ip and packet_info.ip:
            if packet_info.ip.get('dstIp') != self.dst_ip:
                return False

        if self.src_mac and packet_info.ethernet:
            if packet_info.ethernet.get('srcMac') != self.src_mac:
                return False

        if self.dst_mac and packet_info.ethernet:
            if packet_info.ethernet.get('dstMac') != self.dst_mac:
                return False

        return True

    def is_empty(self) -> bool:
        return all(v is None for v in [
            self.protocol, self.src_port, self.dst_port,
            self.src_ip, self.dst_ip, self.src_mac, self.dst_mac
        ])


@dataclass
class MirrorMetadata:
    original_source_port: int
    original_timestamp: float
    mirror_timestamp: float
    mirror_rule_id: int
    packet_size: int


@dataclass
class MirrorRule:
    id: int
    source_port: int
    monitor_port: int
    direction: MirrorDirection = MirrorDirection.INGRESS
    enabled: bool = True
    match: MirrorMatch = field(default_factory=MirrorMatch)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'sourcePort': self.source_port,
            'monitorPort': self.monitor_port,
            'direction': self.direction.value,
            'enabled': self.enabled,
            'match': self.match.to_dict(),
        }

    def should_mirror(self, direction: MirrorDirection) -> bool:
        if not self.enabled:
            return False
        if self.direction == MirrorDirection.BOTH:
            return True
        return self.direction == direction

    def matches_packet(self, packet_info: PacketInfo) -> bool:
        if self.match.is_empty():
            return True
        return self.match.matches(packet_info)


@dataclass
class MirrorStatsEntry:
    timestamp: float
    rule_id: int
    source_port: int
    monitor_port: int
    protocol: Optional[str]
    src_ip: Optional[str]
    dst_ip: Optional[str]
    src_port: Optional[int]
    dst_port: Optional[int]
    packet_size: int
    original_source_port: int


@dataclass
class MirrorStatsSummary:
    total_mirrored_packets: int
    total_dropped_packets: int
    total_mirrored_bytes: int
    total_dropped_bytes: int
    by_rule: Dict[int, Dict[str, int]]
    by_protocol: Dict[str, int]
    by_source_port: Dict[int, int]
    entries: List[MirrorStatsEntry] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            'totalMirroredPackets': self.total_mirrored_packets,
            'totalDroppedPackets': self.total_dropped_packets,
            'totalMirroredBytes': self.total_mirrored_bytes,
            'totalDroppedBytes': self.total_dropped_bytes,
            'byRule': {str(k): v for k, v in self.by_rule.items()},
            'byProtocol': self.by_protocol,
            'bySourcePort': {str(k): v for k, v in self.by_source_port.items()},
            'entries': [
                {
                    'timestamp': e.timestamp,
                    'ruleId': e.rule_id,
                    'sourcePort': e.source_port,
                    'monitorPort': e.monitor_port,
                    'protocol': e.protocol,
                    'srcIp': e.src_ip,
                    'dstIp': e.dst_ip,
                    'srcPort': e.src_port,
                    'dstPort': e.dst_port,
                    'packetSize': e.packet_size,
                    'originalSourcePort': e.original_source_port,
                }
                for e in self.entries
            ]
        }


class MirrorResult:
    def __init__(self, mirrored: bool, dropped: bool = False, 
                 monitor_ports: Optional[List[int]] = None,
                 metadata: Optional[List[MirrorMetadata]] = None):
        self.mirrored = mirrored
        self.dropped = dropped
        self.monitor_ports = monitor_ports or []
        self.metadata = metadata or []


class MirrorEngine:
    def __init__(self, rate_limit_mbps: float = 10.0, max_stats_entries: int = 10000):
        self._rules: Dict[int, MirrorRule] = {}
        self._next_id = 1
        self._total_mirrored_packets = 0
        self._total_dropped_packets = 0
        self._total_mirrored_bytes = 0
        self._total_dropped_bytes = 0
        self._token_bucket = TokenBucket(rate_mbps=rate_limit_mbps)
        self._rate_limit_enabled = True
        self._max_stats_entries = max_stats_entries
        self._stats_entries: List[MirrorStatsEntry] = []
        self._by_rule_stats: Dict[int, Dict[str, int]] = {}
        self._by_protocol_stats: Dict[str, int] = {}
        self._by_source_port_stats: Dict[int, int] = {}

    def add_rule(self, source_port: int, monitor_port: int, 
                 direction: MirrorDirection = MirrorDirection.INGRESS,
                 match: Optional[MirrorMatch] = None) -> MirrorRule:
        rule_id = self._next_id
        self._next_id += 1
        rule = MirrorRule(
            id=rule_id,
            source_port=source_port,
            monitor_port=monitor_port,
            direction=direction,
            enabled=True,
            match=match or MirrorMatch()
        )
        self._rules[rule_id] = rule
        self._by_rule_stats[rule_id] = {'packets': 0, 'bytes': 0}
        return rule

    def remove_rule(self, rule_id: int) -> bool:
        if rule_id in self._rules:
            del self._rules[rule_id]
            return True
        return False

    def get_rule(self, rule_id: int) -> Optional[MirrorRule]:
        return self._rules.get(rule_id)

    def get_all_rules(self) -> List[MirrorRule]:
        return list(self._rules.values())

    def get_rules_for_port(self, port_id: int, direction: MirrorDirection) -> List[MirrorRule]:
        return [
            rule for rule in self._rules.values()
            if rule.source_port == port_id and rule.should_mirror(direction)
        ]

    def has_mirror_rule(self, port_id: int, direction: MirrorDirection) -> bool:
        return any(
            rule.source_port == port_id and rule.should_mirror(direction)
            for rule in self._rules.values()
        )

    def get_monitor_ports(self, source_port: int, direction: MirrorDirection) -> List[int]:
        return [
            rule.monitor_port
            for rule in self.get_rules_for_port(source_port, direction)
        ]

    def process_mirror(self, packet_size: int, source_port: int, 
                       direction: MirrorDirection,
                       original_timestamp: float,
                       packet_info: Optional[PacketInfo] = None) -> MirrorResult:
        rules = self.get_rules_for_port(source_port, direction)
        if not rules:
            return MirrorResult(mirrored=False)

        monitor_ports = []
        metadata_list = []
        dropped = False

        for rule in rules:
            if packet_info and not rule.matches_packet(packet_info):
                continue

            if self._rate_limit_enabled:
                if not self._token_bucket.consume(packet_size):
                    dropped = True
                    self._total_dropped_packets += 1
                    self._total_dropped_bytes += packet_size
                    continue

            monitor_ports.append(rule.monitor_port)
            metadata = MirrorMetadata(
                original_source_port=source_port,
                original_timestamp=original_timestamp,
                mirror_timestamp=time.time(),
                mirror_rule_id=rule.id,
                packet_size=packet_size
            )
            metadata_list.append(metadata)
            self._total_mirrored_packets += 1
            self._total_mirrored_bytes += packet_size

            if rule.id in self._by_rule_stats:
                self._by_rule_stats[rule.id]['packets'] += 1
                self._by_rule_stats[rule.id]['bytes'] += packet_size

            if packet_info and packet_info.transport:
                proto = packet_info.transport.get('protocol', 'unknown')
                self._by_protocol_stats[proto] = self._by_protocol_stats.get(proto, 0) + 1

            self._by_source_port_stats[source_port] = self._by_source_port_stats.get(source_port, 0) + 1

            if packet_info:
                stats_entry = MirrorStatsEntry(
                    timestamp=time.time(),
                    rule_id=rule.id,
                    source_port=source_port,
                    monitor_port=rule.monitor_port,
                    protocol=packet_info.transport.get('protocol') if packet_info.transport else None,
                    src_ip=packet_info.ip.get('srcIp') if packet_info.ip else None,
                    dst_ip=packet_info.ip.get('dstIp') if packet_info.ip else None,
                    src_port=packet_info.transport.get('srcPort') if packet_info.transport else None,
                    dst_port=packet_info.transport.get('dstPort') if packet_info.transport else None,
                    packet_size=packet_size,
                    original_source_port=source_port
                )
                self._stats_entries.append(stats_entry)
                if len(self._stats_entries) > self._max_stats_entries:
                    self._stats_entries = self._stats_entries[-self._max_stats_entries:]

        return MirrorResult(
            mirrored=len(monitor_ports) > 0,
            dropped=dropped,
            monitor_ports=monitor_ports,
            metadata=metadata_list
        )

    def toggle_rule(self, rule_id: int) -> Optional[MirrorRule]:
        rule = self._rules.get(rule_id)
        if rule:
            rule.enabled = not rule.enabled
            return rule
        return None

    def clear_all_rules(self) -> None:
        self._rules.clear()

    def increment_mirrored(self) -> None:
        self._total_mirrored_packets += 1

    def get_total_mirrored(self) -> int:
        return self._total_mirrored_packets

    def get_total_dropped(self) -> int:
        return self._total_dropped_packets

    def set_rate_limit(self, rate_mbps: float) -> None:
        self._token_bucket.set_rate(rate_mbps)

    def get_rate_limit(self) -> float:
        return self._token_bucket.rate_mbps

    def enable_rate_limit(self) -> None:
        self._rate_limit_enabled = True

    def disable_rate_limit(self) -> None:
        self._rate_limit_enabled = False

    def is_rate_limit_enabled(self) -> bool:
        return self._rate_limit_enabled

    def get_token_bucket_stats(self) -> TokenBucketStats:
        return self._token_bucket.get_stats()

    def reset_stats(self) -> None:
        self._total_mirrored_packets = 0
        self._total_dropped_packets = 0
        self._total_mirrored_bytes = 0
        self._total_dropped_bytes = 0
        self._stats_entries.clear()
        self._by_rule_stats = {rule_id: {'packets': 0, 'bytes': 0} for rule_id in self._rules}
        self._by_protocol_stats.clear()
        self._by_source_port_stats.clear()
        self._token_bucket.reset()

    def to_dict(self) -> List[dict]:
        return [rule.to_dict() for rule in self.get_all_rules()]

    def get_engine_stats(self) -> dict:
        bucket_stats = self.get_token_bucket_stats()
        return {
            'totalMirroredPackets': self._total_mirrored_packets,
            'totalDroppedPackets': self._total_dropped_packets,
            'totalMirroredBytes': self._total_mirrored_bytes,
            'totalDroppedBytes': self._total_dropped_bytes,
            'rateLimitMbps': self._token_bucket.rate_mbps,
            'rateLimitEnabled': self._rate_limit_enabled,
            'tokenBucket': {
                'tokensAvailable': bucket_stats.total_tokens_available,
                'packetsPassed': bucket_stats.total_packets_passed,
                'packetsDropped': bucket_stats.total_packets_dropped,
                'bytesPassed': bucket_stats.total_bytes_passed,
                'bytesDropped': bucket_stats.total_bytes_dropped
            }
        }

    def get_detailed_stats(self, include_entries: bool = True, 
                           limit: int = 1000) -> MirrorStatsSummary:
        entries = self._stats_entries[-limit:] if include_entries else []
        return MirrorStatsSummary(
            total_mirrored_packets=self._total_mirrored_packets,
            total_dropped_packets=self._total_dropped_packets,
            total_mirrored_bytes=self._total_mirrored_bytes,
            total_dropped_bytes=self._total_dropped_bytes,
            by_rule=dict(self._by_rule_stats),
            by_protocol=dict(self._by_protocol_stats),
            by_source_port=dict(self._by_source_port_stats),
            entries=entries
        )

    def export_stats_json(self, include_entries: bool = True, limit: int = 1000) -> str:
        stats = self.get_detailed_stats(include_entries=include_entries, limit=limit)
        return json.dumps(stats.to_dict(), indent=2)

    def export_stats_csv(self, include_entries: bool = True, limit: int = 1000) -> str:
        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow(['Total Mirrored Packets', self._total_mirrored_packets])
        writer.writerow(['Total Dropped Packets', self._total_dropped_packets])
        writer.writerow(['Total Mirrored Bytes', self._total_mirrored_bytes])
        writer.writerow(['Total Dropped Bytes', self._total_dropped_bytes])
        writer.writerow([])

        writer.writerow(['By Rule'])
        writer.writerow(['Rule ID', 'Packets', 'Bytes'])
        for rule_id, data in self._by_rule_stats.items():
            writer.writerow([rule_id, data['packets'], data['bytes']])
        writer.writerow([])

        writer.writerow(['By Protocol'])
        writer.writerow(['Protocol', 'Packets'])
        for proto, count in self._by_protocol_stats.items():
            writer.writerow([proto, count])
        writer.writerow([])

        writer.writerow(['By Source Port'])
        writer.writerow(['Source Port', 'Packets'])
        for port, count in self._by_source_port_stats.items():
            writer.writerow([port, count])

        if include_entries and self._stats_entries:
            writer.writerow([])
            writer.writerow(['Detailed Entries (last {} records)'.format(min(limit, len(self._stats_entries)))])
            writer.writerow([
                'Timestamp', 'Rule ID', 'Source Port', 'Monitor Port',
                'Protocol', 'Src IP', 'Dst IP', 'Src Port', 'Dst Port',
                'Packet Size', 'Original Source Port'
            ])
            for entry in self._stats_entries[-limit:]:
                writer.writerow([
                    time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(entry.timestamp)),
                    entry.rule_id,
                    entry.source_port,
                    entry.monitor_port,
                    entry.protocol or '',
                    entry.src_ip or '',
                    entry.dst_ip or '',
                    entry.src_port or '',
                    entry.dst_port or '',
                    entry.packet_size,
                    entry.original_source_port
                ])

        return output.getvalue()
