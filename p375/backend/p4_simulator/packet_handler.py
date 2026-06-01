from dataclasses import dataclass, field
from typing import Optional, Dict, Any
import uuid
import time
import binascii

try:
    from scapy.all import Ether, IP, IPv6, TCP, UDP, ICMP, Raw
    ICMPv6 = None
    try:
        from scapy.all import ICMPv6
    except ImportError:
        try:
            from scapy.layers.inet6 import ICMPv6EchoReply as ICMPv6
        except ImportError:
            pass
except ImportError:
    raise ImportError("Scapy is required. Install with: pip install scapy")


@dataclass
class MirrorPacketMetadata:
    original_source_port: int
    original_timestamp: float
    mirror_timestamp: float
    mirror_rule_id: int
    packet_size: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            'originalSourcePort': self.original_source_port,
            'originalTimestamp': self.original_timestamp,
            'mirrorTimestamp': self.mirror_timestamp,
            'mirrorRuleId': self.mirror_rule_id,
            'packetSize': self.packet_size,
        }


@dataclass
class PacketInfo:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: float = field(default_factory=time.time)
    type: str = 'original'
    source_port: int = 0
    dest_port: Optional[int] = None
    mirror_source_port: Optional[int] = None
    mirror_metadata: Optional[MirrorPacketMetadata] = None
    ethernet: Dict[str, Any] = field(default_factory=dict)
    ip: Optional[Dict[str, Any]] = None
    transport: Optional[Dict[str, Any]] = None
    payload: str = ''
    hex_dump: str = ''
    size: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'timestamp': self.timestamp,
            'type': self.type,
            'sourcePort': self.source_port,
            'destPort': self.dest_port,
            'mirrorSourcePort': self.mirror_source_port,
            'mirrorMetadata': self.mirror_metadata.to_dict() if self.mirror_metadata else None,
            'ethernet': self.ethernet,
            'ip': self.ip,
            'transport': self.transport,
            'payload': self.payload,
            'hexDump': self.hex_dump,
            'size': self.size,
        }


class PacketHandler:
    @staticmethod
    def parse_packet(packet_bytes: bytes, source_port: int, 
                     packet_type: str = 'original',
                     mirror_source_port: Optional[int] = None) -> PacketInfo:
        info = PacketInfo(
            type=packet_type,
            source_port=source_port,
            mirror_source_port=mirror_source_port,
            size=len(packet_bytes)
        )

        info.hex_dump = binascii.hexlify(packet_bytes).decode('ascii')

        try:
            pkt = Ether(packet_bytes)
        except:
            info.payload = info.hex_dump
            return info

        info.ethernet = {
            'srcMac': pkt.src,
            'dstMac': pkt.dst,
            'etherType': pkt.type,
        }

        if IP in pkt:
            ip_pkt = pkt[IP]
            info.ip = {
                'version': 4,
                'srcIp': ip_pkt.src,
                'dstIp': ip_pkt.dst,
                'protocol': ip_pkt.proto,
                'ttl': ip_pkt.ttl,
            }

            if TCP in pkt:
                tcp_pkt = pkt[TCP]
                flags = []
                if tcp_pkt.flags.S:
                    flags.append('SYN')
                if tcp_pkt.flags.A:
                    flags.append('ACK')
                if tcp_pkt.flags.F:
                    flags.append('FIN')
                if tcp_pkt.flags.R:
                    flags.append('RST')
                if tcp_pkt.flags.P:
                    flags.append('PSH')
                if tcp_pkt.flags.U:
                    flags.append('URG')
                
                info.transport = {
                    'protocol': 'tcp',
                    'srcPort': tcp_pkt.sport,
                    'dstPort': tcp_pkt.dport,
                    'flags': flags,
                }
            elif UDP in pkt:
                udp_pkt = pkt[UDP]
                info.transport = {
                    'protocol': 'udp',
                    'srcPort': udp_pkt.sport,
                    'dstPort': udp_pkt.dport,
                }
            elif ICMP in pkt:
                icmp_pkt = pkt[ICMP]
                info.transport = {
                    'protocol': 'icmp',
                    'type': icmp_pkt.type,
                    'code': icmp_pkt.code,
                }
        elif IPv6 in pkt:
            ip6_pkt = pkt[IPv6]
            info.ip = {
                'version': 6,
                'srcIp': ip6_pkt.src,
                'dstIp': ip6_pkt.dst,
                'protocol': ip6_pkt.nh,
                'ttl': ip6_pkt.hlim,
            }

            if ICMPv6 is not None and ICMPv6 in pkt:
                icmp6_pkt = pkt[ICMPv6]
                info.transport = {
                    'protocol': 'icmp',
                    'type': icmp6_pkt.type,
                    'code': icmp6_pkt.code,
                }

        if Raw in pkt:
            raw_data = bytes(pkt[Raw].load)
            try:
                info.payload = raw_data.decode('utf-8', errors='replace')
            except:
                info.payload = binascii.hexlify(raw_data).decode('ascii')
        else:
            info.payload = info.hex_dump

        return info

    @staticmethod
    def create_test_packet(src_mac: str, dst_mac: str, 
                           src_ip: str, dst_ip: str,
                           src_port: int, dst_port: int,
                           protocol: str = 'tcp',
                           payload: str = '') -> bytes:
        eth = Ether(src=src_mac, dst=dst_mac)
        ip = IP(src=src_ip, dst=dst_ip)
        
        if protocol.lower() == 'tcp':
            transport = TCP(sport=src_port, dport=dst_port, flags='S')
        elif protocol.lower() == 'udp':
            transport = UDP(sport=src_port, dport=dst_port)
        elif protocol.lower() == 'icmp':
            transport = ICMP()
        else:
            transport = TCP(sport=src_port, dport=dst_port)
        
        if payload:
            pkt = eth / ip / transport / Raw(load=payload.encode())
        else:
            pkt = eth / ip / transport
        
        return bytes(pkt)

    @staticmethod
    def format_hex_dump(data: bytes, width: int = 16) -> str:
        lines = []
        for i in range(0, len(data), width):
            hex_part = ' '.join(f'{b:02x}' for b in data[i:i+width])
            ascii_part = ''.join(chr(b) if 32 <= b < 127 else '.' for b in data[i:i+width])
            lines.append(f'{i:04x}  {hex_part:<{width*3}}  {ascii_part}')
        return '\n'.join(lines)
