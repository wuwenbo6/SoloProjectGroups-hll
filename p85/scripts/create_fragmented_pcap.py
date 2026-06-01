#!/usr/bin/env python3
import struct
import os
import sys
import socket
import time


def create_pcap_with_tcp_fragments(filename):
    GLOBAL_HEADER = struct.pack('<IHHIIII',
        0xa1b2c3d4,
        2,
        4,
        0,
        0,
        65535,
        1
    )

    packets = []

    def build_modbus_tcp(tid, pid, uid, fc, payload):
        mbap = struct.pack('>HHHB', tid, pid, 2 + len(payload), uid)
        return mbap + bytes([fc]) + payload

    def build_tcp(src_port, dst_port, seq, ack, payload, flags=0x10):
        tcp_header = struct.pack('>HHIIBBHHH',
            src_port, dst_port, seq, ack,
            (5 << 4),
            flags,
            8192,
            0,
            0
        )
        return tcp_header + payload

    def build_ip(src_ip, dst_ip, protocol, payload):
        total_len = 20 + len(payload)
        ip_header = struct.pack('>BBHHHBBH4s4s',
            (4 << 4) | 5,
            0,
            total_len,
            0,
            0,
            64,
            protocol,
            0,
            socket.inet_aton(src_ip),
            socket.inet_aton(dst_ip)
        )
        return ip_header + payload

    def build_eth(src_mac, dst_mac, eth_type, payload):
        eth_header = struct.pack('>6s6sH',
            bytes.fromhex(dst_mac),
            bytes.fromhex(src_mac),
            eth_type
        )
        return eth_header + payload

    def add_packet(eth_data, ts_sec, ts_usec):
        incl_len = len(eth_data)
        orig_len = incl_len
        pkt_header = struct.pack('<IIII', ts_sec, ts_usec, incl_len, orig_len)
        packets.append((pkt_header, eth_data))

    base_time = int(time.time())

    modbus_full = build_modbus_tcp(
        0x0001, 0x0000, 1, 0x41,
        bytes([0x00, 0x01, 0x01, 0x66, 0x45, 0x32, 0x10, 0x41, 0x41, 0xF5, 0xC3])
    )
    print(f"完整Modbus包长度: {len(modbus_full)} 字节")
    print(f"完整Modbus数据: {modbus_full.hex()}")

    frag1 = modbus_full[:6]
    frag2 = modbus_full[6:]
    print(f"分段1 (前6字节 MBAP头): {frag1.hex()}")
    print(f"分段2 (剩余数据): {frag2.hex()}")

    seq_start = 1000

    tcp1 = build_tcp(49152, 502, seq_start, 2000, frag1, flags=0x10)
    ip1 = build_ip('192.168.1.100', '192.168.1.1', 6, tcp1)
    eth1 = build_eth('001122334455', 'aabbccddeeff', 0x0800, ip1)
    add_packet(eth1, base_time, 100000)
    print(f"数据包1: TCP seq={seq_start}, payload len={len(frag1)}")

    tcp2 = build_tcp(49152, 502, seq_start + len(frag1), 2000, frag2, flags=0x18)
    ip2 = build_ip('192.168.1.100', '192.168.1.1', 6, tcp2)
    eth2 = build_eth('001122334455', 'aabbccddeeff', 0x0800, ip2)
    add_packet(eth2, base_time, 200000)
    print(f"数据包2: TCP seq={seq_start + len(frag1)}, payload len={len(frag2)}")

    modbus2 = build_modbus_tcp(0x0002, 0x0000, 1, 0x03, bytes([0x00, 0x00, 0x00, 0x0A]))
    tcp3 = build_tcp(49152, 502, seq_start + len(modbus_full), 2000, modbus2, flags=0x18)
    ip3 = build_ip('192.168.1.100', '192.168.1.1', 6, tcp3)
    eth3 = build_eth('001122334455', 'aabbccddeeff', 0x0800, ip3)
    add_packet(eth3, base_time, 300000)
    print(f"数据包3: TCP seq={seq_start + len(modbus_full)}, payload len={len(modbus2)} (完整Modbus包)")

    response = build_modbus_tcp(0x0002, 0x0000, 1, 0x03, bytes([0x14] + list(range(1, 21))))
    tcp4 = build_tcp(502, 49152, 3000, seq_start + len(modbus_full) + len(modbus2), response, flags=0x18)
    ip4 = build_ip('192.168.1.1', '192.168.1.100', 6, tcp4)
    eth4 = build_eth('aabbccddeeff', '001122334455', 0x0800, ip4)
    add_packet(eth4, base_time, 400000)
    print(f"数据包4: 响应包, payload len={len(response)}")

    os.makedirs(os.path.dirname(filename), exist_ok=True)

    with open(filename, 'wb') as f:
        f.write(GLOBAL_HEADER)
        for hdr, data in packets:
            f.write(hdr)
            f.write(data)

    print(f"\n✅ TCP分段测试 PCAP 文件已创建: {filename}")
    print(f"📦 共 {len(packets)} 个数据包")
    print(f"🔍 预期: 解析器应重组数据包1+2为一个完整的Modbus包")


if __name__ == '__main__':
    output_file = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'uploads',
        'modbus_fragmented_test.pcap'
    )

    if len(sys.argv) > 1:
        output_file = sys.argv[1]

    create_pcap_with_tcp_fragments(output_file)
