#!/usr/bin/env python3
"""
P4模拟器测试流量生成脚本
用于生成测试数据包验证MAC学习和镜像功能
"""

import sys
import time
import random
import argparse
from typing import List, Tuple

try:
    from scapy.all import Ether, IP, TCP, UDP, ICMP, Raw, sendp
except ImportError:
    print("Error: Scapy is required. Install with: pip install scapy")
    sys.exit(1)

sys.path.insert(0, '../backend')

from p4_simulator import VirtualSwitch, PacketHandler


def generate_mac(index: int) -> str:
    return f"00:11:22:33:44:{index:02x}"


def generate_ip(index: int) -> str:
    return f"192.168.1.{10 + index}"


def test_mac_learning(switch: VirtualSwitch, num_packets: int = 10):
    print("\n" + "=" * 60)
    print("测试 1: MAC 地址学习")
    print("=" * 60)

    for i in range(num_packets):
        src_mac = generate_mac(i % 5)
        dst_mac = generate_mac((i + 1) % 5)
        src_ip = generate_ip(i % 5)
        dst_ip = generate_ip((i + 1) % 5)
        src_port = random.randint(1024, 65535)
        dst_port = random.choice([80, 443, 22, 53, 8080])
        in_port = (i % 4) + 1

        protocols = ['tcp', 'udp', 'icmp']
        protocol = random.choice(protocols)

        print(f"  发送包 {i+1}: {src_mac} -> {dst_mac} (Port {in_port}, {protocol.upper()})")

        result = switch.send_test_packet(
            src_mac=src_mac,
            dst_mac=dst_mac,
            src_ip=src_ip,
            dst_ip=dst_ip,
            src_port=src_port,
            dst_port=dst_port,
            in_port_id=in_port,
            protocol=protocol,
            payload=f"Test packet {i+1}"
        )

        if result:
            print(f"    动作: {result.action.value}, 输出端口: {result.out_ports}, "
                  f"镜像端口: {result.mirror_ports}, MAC学习: {result.mac_learned}")

        time.sleep(0.1)

    print(f"\n  MAC表大小: {switch.mac_table.size()}")
    for entry in switch.mac_table.get_all_entries():
        print(f"    {entry.mac_address} -> Port {entry.port_id}")


def test_mirroring(switch: VirtualSwitch, num_packets: int = 5):
    print("\n" + "=" * 60)
    print("测试 2: Ingress Clone 镜像功能")
    print("=" * 60)

    print(f"\n  当前镜像规则: {len(switch.get_mirror_rules())} 条")
    for rule in switch.get_mirror_rules():
        print(f"    规则 {rule.id}: Port {rule.source_port} -> Port {rule.monitor_port} ({rule.direction.value})")

    for i in range(num_packets):
        src_mac = generate_mac(i)
        dst_mac = "aa:bb:cc:dd:ee:ff"
        src_ip = generate_ip(i)
        dst_ip = "192.168.1.100"
        src_port = 12345 + i
        dst_port = 80

        print(f"\n  发送包 {i+1} 到 Port 1 (配置了镜像规则):")
        print(f"    {src_ip}:{src_port} -> {dst_ip}:{dst_port}")

        result = switch.send_test_packet(
            src_mac=src_mac,
            dst_mac=dst_mac,
            src_ip=src_ip,
            dst_ip=dst_ip,
            src_port=src_port,
            dst_port=dst_port,
            in_port_id=1,
            protocol='tcp',
            payload=f"Mirror test packet {i+1}"
        )

        if result and result.mirror_ports:
            print(f"    ✅ 镜像成功! 复制到端口: {result.mirror_ports}")
        else:
            print(f"    ❌ 未镜像")

        time.sleep(0.2)

    status = switch.get_status()
    print(f"\n  统计: 接收 {status['totalRxPackets']}, "
          f"转发 {status['totalTxPackets']}, "
          f"镜像 {status['totalMirrorPackets']}")


def test_flooding(switch: VirtualSwitch):
    print("\n" + "=" * 60)
    print("测试 3: 未知目的MAC广播 (Flooding)")
    print("=" * 60)

    switch.clear_mac_table()
    print("\n  已清空MAC表")

    unknown_mac = "ff:ee:dd:cc:bb:aa"
    src_mac = "00:11:22:33:44:55"

    print(f"\n  发送包: {src_mac} -> {unknown_mac} (未知目的MAC)")

    result = switch.send_test_packet(
        src_mac=src_mac,
        dst_mac=unknown_mac,
        src_ip="192.168.1.10",
        dst_ip="192.168.1.20",
        src_port=54321,
        dst_port=443,
        in_port_id=1,
        protocol='tcp',
        payload="Flooding test"
    )

    if result:
        print(f"    动作: {result.action.value}")
        if result.action.value == 'flood':
            print("    ✅ 正确: 广播到所有端口")
        else:
            print(f"    ❌ 错误: 预期 flood, 实际 {result.action.value}")


def test_forwarding_after_learning(switch: VirtualSwitch):
    print("\n" + "=" * 60)
    print("测试 4: MAC学习后的精准转发")
    print("=" * 60)

    switch.clear_mac_table()
    print("\n  已清空MAC表")

    print("\n  第一步: 从 Port 2 发送包，学习 MAC 地址")
    result1 = switch.send_test_packet(
        src_mac="aa:bb:cc:dd:ee:ff",
        dst_mac="00:11:22:33:44:55",
        src_ip="192.168.1.20",
        dst_ip="192.168.1.10",
        src_port=9999,
        dst_port=80,
        in_port_id=2,
        protocol='tcp',
        payload="Learning phase"
    )

    if result1 and result1.mac_learned:
        print(f"    ✅ 学习到 MAC: aa:bb:cc:dd:ee:ff -> Port 2")

    print("\n  第二步: 从 Port 1 发送到已学习的 MAC")
    result2 = switch.send_test_packet(
        src_mac="00:11:22:33:44:55",
        dst_mac="aa:bb:cc:dd:ee:ff",
        src_ip="192.168.1.10",
        dst_ip="192.168.1.20",
        src_port=80,
        dst_port=9999,
        in_port_id=1,
        protocol='tcp',
        payload="Forwarding phase"
    )

    if result2:
        print(f"    动作: {result2.action.value}, 输出端口: {result2.out_ports}")
        if result2.action.value == 'forward' and result2.out_ports == [2]:
            print("    ✅ 正确: 精准转发到 Port 2")
        else:
            print(f"    ❌ 错误: 预期 forward 到 Port 2")


def run_all_tests():
    parser = argparse.ArgumentParser(description='P4模拟器测试脚本')
    parser.add_argument('--packets', type=int, default=10, help='MAC学习测试的数据包数量')
    parser.add_argument('--delay', type=float, default=0.1, help='数据包发送间隔(秒)')
    args = parser.parse_args()

    print("\n" + "╔" + "═" * 58 + "╗")
    print("║" + " " * 15 + "P4 模拟器功能测试" + " " * 25 + "║")
    print("╚" + "═" * 58 + "╝")

    switch = VirtualSwitch("test-switch")
    switch.start()

    switch.add_mirror_rule(1, 5)
    switch.add_mirror_rule(2, 5)

    print(f"\n交换机名称: {switch.name}")
    print(f"端口数量: {len(switch.get_all_ports())}")
    for port in switch.get_all_ports():
        print(f"  Port {port.id}: {port.name} ({port.type.value}, {port.status.value})")

    try:
        test_mac_learning(switch, args.packets)
        test_mirroring(switch, 5)
        test_flooding(switch)
        test_forwarding_after_learning(switch)

        print("\n" + "=" * 60)
        print("测试完成!")
        print("=" * 60)

        status = switch.get_status()
        print(f"\n最终统计:")
        print(f"  运行时间: {status['uptime']}s")
        print(f"  接收包数: {status['totalRxPackets']}")
        print(f"  转发包数: {status['totalTxPackets']}")
        print(f"  镜像包数: {status['totalMirrorPackets']}")
        print(f"  MAC表项: {status['macTableSize']}")

    except KeyboardInterrupt:
        print("\n\n测试被用户中断")
    finally:
        switch.stop()
        print("\n交换机已停止")


if __name__ == '__main__':
    run_all_tests()
