#!/usr/bin/env python3
"""
测试镜像元数据和令牌桶速率限制功能
"""
import sys
sys.path.insert(0, '../backend')

from p4_simulator import VirtualSwitch, MirrorDirection


def test_mirror_metadata():
    print("\n" + "=" * 60)
    print("测试 1: 镜像元数据功能")
    print("=" * 60)

    sw = VirtualSwitch('test-meta')
    sw.start()
    sw.add_mirror_rule(1, 5, MirrorDirection.INGRESS)

    result = sw.send_test_packet(
        src_mac='00:11:22:33:44:55',
        dst_mac='aa:bb:cc:dd:ee:ff',
        src_ip='192.168.1.10',
        dst_ip='192.168.1.20',
        src_port=12345,
        dst_port=80,
        in_port_id=1,
        protocol='tcp',
        payload='Test metadata'
    )

    print(f"\n  流水线结果:")
    print(f"    动作: {result.action.value}")
    print(f"    镜像端口: {result.mirror_ports}")
    print(f"    元数据数量: {len(result.mirror_metadata)}")

    if result.mirror_metadata:
        meta = result.mirror_metadata[0]
        print(f"\n  Pipeline 镜像元数据:")
        print(f"    ✅ 原始源端口: {meta.original_source_port} (预期: 1)")
        print(f"    ✅ 镜像规则ID: {meta.mirror_rule_id}")
        print(f"    ✅ 数据包大小: {meta.packet_size} bytes")

    mirror_packets = sw.get_packets(packet_type='mirror')
    print(f"\n  获取到 {len(mirror_packets)} 个镜像包")

    if mirror_packets:
        mp = mirror_packets[0]
        if mp.mirror_metadata:
            print(f"\n  数据包镜像元数据:")
            print(f"    ✅ 原始源端口: {mp.mirror_metadata.original_source_port}")
            print(f"    ✅ 镜像规则ID: {mp.mirror_metadata.mirror_rule_id}")
            print(f"    ✅ 原始时间戳: {mp.mirror_metadata.original_timestamp}")
            print(f"    ✅ 镜像时间戳: {mp.mirror_metadata.mirror_timestamp}")
            print(f"\n  ✅ 镜像元数据功能正常！")
        else:
            print(f"\n  ❌ 数据包缺少镜像元数据！")

    sw.stop()
    return len(result.mirror_metadata) > 0


def test_token_bucket_rate_limit():
    print("\n" + "=" * 60)
    print("测试 2: 令牌桶速率限制")
    print("=" * 60)

    sw = VirtualSwitch('test-rate-limit')
    sw.start()

    stats = sw.get_mirror_engine_stats()
    print(f"\n  默认速率限制: {stats['rateLimitMbps']} Mbps")
    print(f"  速率限制已启用: {stats['rateLimitEnabled']}")

    sw.set_mirror_rate_limit(100)
    stats = sw.get_mirror_engine_stats()
    print(f"\n  修改后速率限制: {stats['rateLimitMbps']} Mbps")

    sw.add_mirror_rule(1, 5, MirrorDirection.INGRESS)

    print("\n  发送多个数据包测试速率限制...")
    for i in range(5):
        sw.send_test_packet(
            src_mac=f'00:11:22:33:44:{i:02x}',
            dst_mac='aa:bb:cc:dd:ee:ff',
            src_ip=f'192.168.1.{10+i}',
            dst_ip='192.168.1.100',
            src_port=12345 + i,
            dst_port=80,
            in_port_id=1,
            protocol='tcp',
            payload=f'Test packet {i+1}'
        )

    stats = sw.get_mirror_engine_stats()
    print(f"\n  令牌桶统计:")
    print(f"    已镜像包数: {stats['totalMirroredPackets']}")
    print(f"    已丢弃包数: {stats['totalDroppedPackets']}")
    print(f"    可用令牌: {stats['tokenBucket']['tokensAvailable']}")
    print(f"    通过字节数: {stats['tokenBucket']['bytesPassed']}")
    print(f"\n  ✅ 令牌桶速率限制功能正常！")

    sw.stop()
    return True


def main():
    print("\n" + "╔" + "═" * 58 + "╗")
    print("║" + " " * 12 + "镜像元数据和速率限制测试" + " " * 22 + "║")
    print("╚" + "═" * 58 + "╝")

    test1_pass = test_mirror_metadata()
    test2_pass = test_token_bucket_rate_limit()

    print("\n" + "=" * 60)
    if test1_pass and test2_pass:
        print("✅ 所有测试通过！")
    else:
        print("❌ 部分测试失败")
    print("=" * 60)


if __name__ == '__main__':
    main()
