#!/usr/bin/env python3
import struct
import os
import sys
import socket


def create_pcap(filename):
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

    def build_tcp(src_port, dst_port, seq, ack, payload, flags=0x18):
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
        ip_header = struct.pack('>BBHHHBBH4s4s',
            (4 << 4) | 5,
            0,
            20 + len(payload),
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

    test_cases = [
        {
            'name': 'Read Holding Registers Request',
            'modbus': build_modbus_tcp(0x0001, 0x0000, 1, 0x03, bytes([0x00, 0x00, 0x00, 0x0A])),
            'src_ip': '192.168.1.100',
            'dst_ip': '192.168.1.1'
        },
        {
            'name': 'Read Holding Registers Response',
            'modbus': build_modbus_tcp(0x0001, 0x0000, 1, 0x03, bytes([0x14, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x14])),
            'src_ip': '192.168.1.1',
            'dst_ip': '192.168.1.100'
        },
        {
            'name': 'Custom Read Sensor Data Request',
            'modbus': build_modbus_tcp(0x0002, 0x0000, 1, 0x41, bytes([0x00, 0x01])),
            'src_ip': '192.168.1.100',
            'dst_ip': '192.168.1.1'
        },
        {
            'name': 'Custom Read Sensor Data Response',
            'modbus': build_modbus_tcp(0x0002, 0x0000, 1, 0x41, bytes([0x00, 0x01, 0x01, 0x66, 0x45, 0x32, 0x10, 0x41, 0x41, 0xF5, 0xC3])),
            'src_ip': '192.168.1.1',
            'dst_ip': '192.168.1.100'
        },
        {
            'name': 'Custom Write Configuration Request',
            'modbus': build_modbus_tcp(0x0003, 0x0000, 1, 0x42, bytes([0x00, 0x10, 0x00, 0x00, 0x00, 0x64])),
            'src_ip': '192.168.1.100',
            'dst_ip': '192.168.1.1'
        },
        {
            'name': 'Custom Device Status Response',
            'modbus': build_modbus_tcp(0x0004, 0x0000, 1, 0x44, bytes([0x01])),
            'src_ip': '192.168.1.1',
            'dst_ip': '192.168.1.100'
        },
        {
            'name': 'Custom Alarm Acknowledge',
            'modbus': build_modbus_tcp(0x0005, 0x0000, 1, 0x45, bytes([0x00, 0xFF])),
            'src_ip': '192.168.1.100',
            'dst_ip': '192.168.1.1'
        },
        {
            'name': 'Write Single Register Request',
            'modbus': build_modbus_tcp(0x0006, 0x0000, 2, 0x06, bytes([0x00, 0x10, 0x01, 0x00])),
            'src_ip': '192.168.1.100',
            'dst_ip': '192.168.1.2'
        },
        {
            'name': 'Read Coils Request',
            'modbus': build_modbus_tcp(0x0007, 0x0000, 2, 0x01, bytes([0x00, 0x00, 0x00, 0x08])),
            'src_ip': '192.168.1.100',
            'dst_ip': '192.168.1.2'
        },
        {
            'name': 'Exception Response',
            'modbus': build_modbus_tcp(0x0008, 0x0000, 1, 0x83, bytes([0x02])),
            'src_ip': '192.168.1.1',
            'dst_ip': '192.168.1.100'
        },
    ]

    import time
    base_time = int(time.time())

    for i, tc in enumerate(test_cases):
        modbus_data = tc['modbus']
        tcp = build_tcp(49152 + i, 502, 1000 + i, 2000 + i, modbus_data)
        ip = build_ip(tc['src_ip'], tc['dst_ip'], 6, tcp)
        eth = build_eth('001122334455', 'aabbccddeeff', 0x0800, ip)

        ts_sec = base_time + i
        ts_usec = i * 100000
        incl_len = len(eth)
        orig_len = incl_len

        pkt_header = struct.pack('<IIII', ts_sec, ts_usec, incl_len, orig_len)
        packets.append((pkt_header, eth))

    os.makedirs(os.path.dirname(filename), exist_ok=True)

    with open(filename, 'wb') as f:
        f.write(GLOBAL_HEADER)
        for hdr, data in packets:
            f.write(hdr)
            f.write(data)

    print(f"✅ 测试 PCAP 文件已创建: {filename}")
    print(f"📦 共 {len(packets)} 个数据包")
    print("\n数据包内容:")
    for i, tc in enumerate(test_cases):
        print(f"  {i+1}. {tc['name']} ({tc['src_ip']} -> {tc['dst_ip']})")


if __name__ == '__main__':
    output_file = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'uploads',
        'modbus_test.pcap'
    )

    if len(sys.argv) > 1:
        output_file = sys.argv[1]

    create_pcap(output_file)
