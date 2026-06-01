#!/usr/bin/env python3
"""
测试基于匹配字段的镜像和统计导出功能
"""
import sys
sys.path.insert(0, '../backend')

from p4_simulator import VirtualSwitch, MirrorDirection, MirrorMatch


def test_match_by_protocol():
    print("\n" + "=" * 60)
    print("测试 1: 按协议匹配（只镜像 HTTP 流量）")
    print("=" * 60)

    sw = VirtualSwitch('test-http-match')
    sw.start()

    http_match = MirrorMatch(protocol='tcp', dst_port=80)
    sw.add_mirror_rule(1, 5, MirrorDirection.INGRESS, http_match)

    print("\n  已添加镜像规则: Port 1 -> Port 5, 匹配 TCP/80 (HTTP)")

    # 发送 HTTP 流量（应该被镜像）
    print("\n  发送 HTTP 流量 (TCP/80)...")
    result1 = sw.send_test_packet(
        src_mac='00:11:22:33:44:01',
        dst_mac='aa:bb:cc:dd:ee:01',
        src_ip='192.168.1.10',
        dst_ip='192.168.1.20',
        src_port=12345,
        dst_port=80,
        in_port_id=1,
        protocol='tcp',
        payload='GET / HTTP/1.1'
    )
    print(f"    镜像端口: {result1.mirror_ports}")
    if result1.mirror_ports:
        print("    ✅ HTTP 流量已正确镜像")
    else:
        print("    ❌ HTTP 流量未被镜像")

    # 发送 HTTPS 流量（不应该被镜像）
    print("\n  发送 HTTPS 流量 (TCP/443)...")
    result2 = sw.send_test_packet(
        src_mac='00:11:22:33:44:02',
        dst_mac='aa:bb:cc:dd:ee:02',
        src_ip='192.168.1.10',
        dst_ip='192.168.1.21',
        src_port=12346,
        dst_port=443,
        in_port_id=1,
        protocol='tcp',
        payload='TLS Client Hello'
    )
    print(f"    镜像端口: {result2.mirror_ports}")
    if not result2.mirror_ports:
        print("    ✅ HTTPS 流量已正确过滤（未镜像）")
    else:
        print("    ❌ HTTPS 流量被错误镜像")

    # 发送 DNS 流量（不应该被镜像）
    print("\n  发送 DNS 流量 (UDP/53)...")
    result3 = sw.send_test_packet(
        src_mac='00:11:22:33:44:03',
        dst_mac='aa:bb:cc:dd:ee:03',
        src_ip='192.168.1.10',
        dst_ip='8.8.8.8',
        src_port=54321,
        dst_port=53,
        in_port_id=1,
        protocol='udp',
        payload='DNS Query'
    )
    print(f"    镜像端口: {result3.mirror_ports}")
    if not result3.mirror_ports:
        print("    ✅ DNS 流量已正确过滤（未镜像）")
    else:
        print("    ❌ DNS 流量被错误镜像")

    sw.stop()
    return bool(result1.mirror_ports) and not bool(result2.mirror_ports) and not bool(result3.mirror_ports)


def test_match_by_ip():
    print("\n" + "=" * 60)
    print("测试 2: 按 IP 地址匹配")
    print("=" * 60)

    sw = VirtualSwitch('test-ip-match')
    sw.start()

    ip_match = MirrorMatch(dst_ip='192.168.1.100')
    sw.add_mirror_rule(1, 5, MirrorDirection.INGRESS, ip_match)

    print("\n  已添加镜像规则: Port 1 -> Port 5, 匹配目的 IP = 192.168.1.100")

    # 发送到匹配 IP 的流量
    print("\n  发送到 192.168.1.100 的流量...")
    result1 = sw.send_test_packet(
        src_mac='00:11:22:33:44:01',
        dst_mac='aa:bb:cc:dd:ee:01',
        src_ip='192.168.1.10',
        dst_ip='192.168.1.100',
        src_port=12345,
        dst_port=80,
        in_port_id=1,
        protocol='tcp',
        payload='Matched IP'
    )
    if result1.mirror_ports:
        print("    ✅ 目的 IP 匹配的流量已正确镜像")
    else:
        print("    ❌ 目的 IP 匹配的流量未被镜像")

    # 发送到其他 IP 的流量
    print("\n  发送到 192.168.1.200 的流量...")
    result2 = sw.send_test_packet(
        src_mac='00:11:22:33:44:02',
        dst_mac='aa:bb:cc:dd:ee:02',
        src_ip='192.168.1.10',
        dst_ip='192.168.1.200',
        src_port=12346,
        dst_port=80,
        in_port_id=1,
        protocol='tcp',
        payload='Not matched IP'
    )
    if not result2.mirror_ports:
        print("    ✅ 目的 IP 不匹配的流量已正确过滤")
    else:
        print("    ❌ 目的 IP 不匹配的流量被错误镜像")

    sw.stop()
    return bool(result1.mirror_ports) and not bool(result2.mirror_ports)


def test_stats_export():
    print("\n" + "=" * 60)
    print("测试 3: 镜像统计导出")
    print("=" * 60)

    sw = VirtualSwitch('test-stats-export')
    sw.start()

    http_match = MirrorMatch(protocol='tcp', dst_port=80)
    https_match = MirrorMatch(protocol='tcp', dst_port=443)
    dns_match = MirrorMatch(protocol='udp', dst_port=53)

    sw.add_mirror_rule(1, 5, MirrorDirection.INGRESS, http_match)
    sw.add_mirror_rule(2, 5, MirrorDirection.INGRESS, https_match)
    sw.add_mirror_rule(3, 5, MirrorDirection.INGRESS, dns_match)

    print("\n  已添加 3 条镜像规则:")
    print("    - 规则 1: Port 1 -> Port 5, TCP/80 (HTTP)")
    print("    - 规则 2: Port 2 -> Port 5, TCP/443 (HTTPS)")
    print("    - 规则 3: Port 3 -> Port 5, UDP/53 (DNS)")

    # 发送一些流量
    print("\n  发送测试流量...")
    for i in range(5):
        sw.send_test_packet(
            src_mac=f'00:11:22:33:44:{i:02x}',
            dst_mac='aa:bb:cc:dd:ee:01',
            src_ip=f'192.168.1.{10+i}',
            dst_ip='192.168.1.100',
            src_port=12345+i,
            dst_port=80,
            in_port_id=1,
            protocol='tcp',
            payload=f'HTTP packet {i+1}'
        )

    for i in range(3):
        sw.send_test_packet(
            src_mac=f'00:11:22:33:44:{10+i:02x}',
            dst_mac='aa:bb:cc:dd:ee:02',
            src_ip=f'192.168.1.{20+i}',
            dst_ip='192.168.1.200',
            src_port=54321+i,
            dst_port=443,
            in_port_id=2,
            protocol='tcp',
            payload=f'HTTPS packet {i+1}'
        )

    for i in range(2):
        sw.send_test_packet(
            src_mac=f'00:11:22:33:44:{20+i:02x}',
            dst_mac='aa:bb:cc:dd:ee:03',
            src_ip=f'192.168.1.{30+i}',
            dst_ip='8.8.8.8',
            src_port=55555+i,
            dst_port=53,
            in_port_id=3,
            protocol='udp',
            payload=f'DNS query {i+1}'
        )

    # 获取统计信息
    stats = sw.get_detailed_mirror_stats(include_entries=True, limit=100)
    print(f"\n  统计信息:")
    print(f"    总镜像包数: {stats['totalMirroredPackets']}")
    print(f"    总镜像字节: {stats['totalMirroredBytes']}")
    print(f"    按规则统计:")
    for rule_id, data in stats['byRule'].items():
        print(f"      规则 {rule_id}: {data['packets']} 包, {data['bytes']} 字节")
    print(f"    按协议统计: {stats['byProtocol']}")
    print(f"    按源端口统计: {stats['bySourcePort']}")
    print(f"    详细记录数: {len(stats['entries'])}")

    # 导出 JSON
    json_export = sw.export_mirror_stats_json(include_entries=False)
    print(f"\n  JSON 导出长度: {len(json_export)} 字符")

    # 导出 CSV
    csv_export = sw.export_mirror_stats_csv(include_entries=True)
    print(f"  CSV 导出长度: {len(csv_export)} 字符")

    # 验证统计数据
    test_pass = (
        stats['totalMirroredPackets'] == 10 and
        stats['byRule'].get('1', {}).get('packets', 0) == 5 and
        stats['byRule'].get('2', {}).get('packets', 0) == 3 and
        stats['byRule'].get('3', {}).get('packets', 0) == 2 and
        len(json_export) > 0 and
        len(csv_export) > 0
    )

    if test_pass:
        print("\n  ✅ 统计导出功能正常！")
    else:
        print("\n  ❌ 统计数据不正确")

    sw.stop()
    return test_pass


def test_multiple_match_conditions():
    print("\n" + "=" * 60)
    print("测试 4: 多条件组合匹配")
    print("=" * 60)

    sw = VirtualSwitch('test-multi-match')
    sw.start()

    # 匹配来自特定 IP 的 HTTP 流量
    multi_match = MirrorMatch(
        protocol='tcp',
        dst_port=80,
        src_ip='192.168.1.50'
    )
    sw.add_mirror_rule(1, 5, MirrorDirection.INGRESS, multi_match)

    print("\n  已添加镜像规则: Port 1 -> Port 5")
    print("  匹配条件: TCP/80 且 源 IP = 192.168.1.50")

    # 完全匹配
    print("\n  发送完全匹配的流量 (源IP=192.168.1.50, TCP/80)...")
    result1 = sw.send_test_packet(
        src_mac='00:11:22:33:44:01',
        dst_mac='aa:bb:cc:dd:ee:01',
        src_ip='192.168.1.50',
        dst_ip='192.168.1.100',
        src_port=12345,
        dst_port=80,
        in_port_id=1,
        protocol='tcp',
        payload='Full match'
    )
    if result1.mirror_ports:
        print("    ✅ 完全匹配的流量已正确镜像")
    else:
        print("    ❌ 完全匹配的流量未被镜像")

    # 只匹配端口，不匹配 IP
    print("\n  发送部分匹配的流量 (源IP=192.168.1.60, TCP/80)...")
    result2 = sw.send_test_packet(
        src_mac='00:11:22:33:44:02',
        dst_mac='aa:bb:cc:dd:ee:02',
        src_ip='192.168.1.60',
        dst_ip='192.168.1.100',
        src_port=12346,
        dst_port=80,
        in_port_id=1,
        protocol='tcp',
        payload='Partial match (IP wrong)'
    )
    if not result2.mirror_ports:
        print("    ✅ IP 不匹配的流量已正确过滤")
    else:
        print("    ❌ IP 不匹配的流量被错误镜像")

    # 只匹配 IP，不匹配端口
    print("\n  发送部分匹配的流量 (源IP=192.168.1.50, TCP/443)...")
    result3 = sw.send_test_packet(
        src_mac='00:11:22:33:44:03',
        dst_mac='aa:bb:cc:dd:ee:03',
        src_ip='192.168.1.50',
        dst_ip='192.168.1.100',
        src_port=12347,
        dst_port=443,
        in_port_id=1,
        protocol='tcp',
        payload='Partial match (port wrong)'
    )
    if not result3.mirror_ports:
        print("    ✅ 端口不匹配的流量已正确过滤")
    else:
        print("    ❌ 端口不匹配的流量被错误镜像")

    sw.stop()
    return bool(result1.mirror_ports) and not bool(result2.mirror_ports) and not bool(result3.mirror_ports)


def main():
    print("\n" + "╔" + "═" * 58 + "╗")
    print("║" + " " * 8 + "匹配字段镜像和统计导出功能测试" + " " * 22 + "║")
    print("╚" + "═" * 58 + "╝")

    results = []
    results.append(('按协议匹配', test_match_by_protocol()))
    results.append(('按 IP 匹配', test_match_by_ip()))
    results.append(('统计导出', test_stats_export()))
    results.append(('多条件组合匹配', test_multiple_match_conditions()))

    print("\n" + "=" * 60)
    print("测试结果汇总:")
    print("=" * 60)
    all_pass = True
    for name, passed in results:
        status = "✅ 通过" if passed else "❌ 失败"
        print(f"  {name}: {status}")
        if not passed:
            all_pass = False

    print("\n" + "=" * 60)
    if all_pass:
        print("✅ 所有测试通过！")
    else:
        print("❌ 部分测试失败")
    print("=" * 60)


if __name__ == '__main__':
    main()
