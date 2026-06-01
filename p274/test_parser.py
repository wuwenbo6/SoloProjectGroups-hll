#!/usr/bin/env python3
from hiperlan2_parser import HIPERLAN2Frame, create_test_frame, FrameType, parse_hiperlan2_frame, compute_crc32, analyze_retransmissions, write_pcap, frames_to_pcap_bytes
import json
import os
import struct


def test_unicast_frame():
    print("=" * 60)
    print("测试 1: 单播帧 (Unicast)")
    print("=" * 60)
    
    frame_data = create_test_frame(FrameType.UNICAST, seq_num=42)
    parsed = parse_hiperlan2_frame(frame_data)
    
    print(f"帧类型: {parsed['frame_type']}")
    print(f"序列号: {parsed['sequence_number']}")
    print(f"源 MAC: {parsed['mac_header']['source_mac']}")
    print(f"目的 MAC: {parsed['mac_header']['destination_mac']}")
    print(f"负载长度: {parsed['payload']['length']} 字节")
    print(f"FCS: {parsed.get('fcs')}")
    print(f"FCS (计算): {parsed.get('fcs_computed')}")
    print(f"FCS 校验: {'通过' if parsed.get('fcs_valid') else '未通过'}")
    print()


def test_multicast_frame():
    print("=" * 60)
    print("测试 2: 多播帧 (Multicast)")
    print("=" * 60)
    
    frame_data = create_test_frame(FrameType.MULTICAST, seq_num=100)
    parsed = parse_hiperlan2_frame(frame_data)
    
    print(f"帧类型: {parsed['frame_type']}")
    print(f"序列号: {parsed['sequence_number']}")
    print(f"源 MAC: {parsed['mac_header']['source_mac']}")
    print(f"目的 MAC: {parsed['mac_header']['destination_mac']}")
    print(f"FCS 校验: {'通过' if parsed.get('fcs_valid') else '未通过'}")
    print()


def test_broadcast_frame():
    print("=" * 60)
    print("测试 3: 广播帧 (Broadcast)")
    print("=" * 60)
    
    frame_data = create_test_frame(FrameType.BROADCAST, seq_num=255)
    parsed = parse_hiperlan2_frame(frame_data)
    
    print(f"帧类型: {parsed['frame_type']}")
    print(f"序列号: {parsed['sequence_number']}")
    print(f"源 MAC: {parsed['mac_header']['source_mac']}")
    print(f"目的 MAC: {parsed['mac_header']['destination_mac']}")
    print(f"FCS 校验: {'通过' if parsed.get('fcs_valid') else '未通过'}")
    print()


def test_full_parsed():
    print("=" * 60)
    print("测试 4: 完整解析结果")
    print("=" * 60)
    
    frame_data = create_test_frame(FrameType.UNICAST, seq_num=7)
    parsed = parse_hiperlan2_frame(frame_data)
    
    print("MAC 报头:")
    print(json.dumps(parsed['mac_header'], indent=2, ensure_ascii=False))
    print()
    
    print("控制字段:")
    print(json.dumps(parsed['control_field'], indent=2, ensure_ascii=False))
    print()
    
    print("负载:")
    print(f"  长度: {parsed['payload']['length']}")
    print(f"  Hex: {parsed['payload']['hex_dump'][:40]}...")
    print(f"  ASCII: {parsed['payload']['ascii']}")
    print()
    
    print("FCS:")
    print(f"  帧内 FCS: {parsed.get('fcs')}")
    print(f"  计算 FCS: {parsed.get('fcs_computed')}")
    print(f"  校验结果: {'通过' if parsed.get('fcs_valid') else '未通过'}")
    print()


def test_summary():
    print("=" * 60)
    print("测试 5: 摘要信息")
    print("=" * 60)
    
    frame_data = create_test_frame(FrameType.UNICAST, seq_num=99)
    frame = HIPERLAN2Frame(frame_data)
    summary = frame.get_summary()
    
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    print()


def test_crc32_direct():
    print("=" * 60)
    print("测试 6: CRC-32 直接验证 (多项式 0x04C11DB7)")
    print("=" * 60)
    
    test_data = b"\x00\x01\x02\x03"
    crc = compute_crc32(test_data)
    print(f"数据: {test_data.hex()}")
    print(f"CRC-32: 0x{crc:08X}")
    
    frame = create_test_frame(FrameType.UNICAST, seq_num=10)
    frame_without_fcs = frame[:-4]
    fcs_bytes = frame[-4:]
    fcs_val = struct.unpack("<I", fcs_bytes)[0]
    computed = compute_crc32(frame_without_fcs)
    
    print(f"测试帧无FCS部分 CRC: 0x{computed:08X}")
    print(f"测试帧内嵌 FCS: 0x{fcs_val:08X}")
    print(f"匹配: {computed == fcs_val}")
    print()


def test_fcs_tamper():
    print("=" * 60)
    print("测试 7: FCS 篡改检测")
    print("=" * 60)
    
    frame_data = create_test_frame(FrameType.UNICAST, seq_num=5)
    tampered = bytearray(frame_data)
    tampered[-5] ^= 0xFF
    
    parsed = parse_hiperlan2_frame(bytes(tampered))
    print(f"原始帧 FCS 校验: 通过")
    print(f"篡改帧 FCS 校验: {'通过' if parsed.get('fcs_valid') else '未通过'}")
    print(f"篡改帧 FCS: {parsed.get('fcs')}")
    print(f"篡改帧计算 FCS: {parsed.get('fcs_computed')}")
    print()


def test_sort_by_sequence():
    print("=" * 60)
    print("测试 8: 序列号排序")
    print("=" * 60)
    
    frames = []
    for seq in [42, 7, 255, 1, 100]:
        fd = create_test_frame(FrameType.UNICAST, seq_num=seq)
        frames.append(parse_hiperlan2_frame(fd))
    
    frames_sorted = sorted(frames, key=lambda f: f.get('sequence_number', 0))
    
    print("排序前序列号: ", [f['sequence_number'] for f in frames])
    print("排序后序列号: ", [f['sequence_number'] for f in frames_sorted])
    print()


def test_retry_frame():
    print("=" * 60)
    print("测试 9: 重传帧 (Retry Flag)")
    print("=" * 60)
    
    frame_normal = create_test_frame(FrameType.UNICAST, seq_num=10, retry=False)
    frame_retry = create_test_frame(FrameType.UNICAST, seq_num=10, retry=True)
    
    parsed_normal = parse_hiperlan2_frame(frame_normal)
    parsed_retry = parse_hiperlan2_frame(frame_retry)
    
    print(f"正常帧 Retry 标志: {parsed_normal['control_field']['retry']}")
    print(f"重传帧 Retry 标志: {parsed_retry['control_field']['retry']}")
    print(f"正常帧 FCS 校验: {'通过' if parsed_normal.get('fcs_valid') else '未通过'}")
    print(f"重传帧 FCS 校验: {'通过' if parsed_retry.get('fcs_valid') else '未通过'}")
    print()


def test_retransmission_analysis():
    print("=" * 60)
    print("测试 10: 重传统计分析")
    print("=" * 60)
    
    frames_data = []
    frames_data.append({'parsed': parse_hiperlan2_frame(create_test_frame(FrameType.UNICAST, seq_num=1, retry=False))})
    frames_data.append({'parsed': parse_hiperlan2_frame(create_test_frame(FrameType.UNICAST, seq_num=2, retry=False))})
    frames_data.append({'parsed': parse_hiperlan2_frame(create_test_frame(FrameType.UNICAST, seq_num=2, retry=True))})
    frames_data.append({'parsed': parse_hiperlan2_frame(create_test_frame(FrameType.UNICAST, seq_num=3, retry=False))})
    frames_data.append({'parsed': parse_hiperlan2_frame(create_test_frame(FrameType.UNICAST, seq_num=2, retry=False))})
    
    stats = analyze_retransmissions(frames_data)
    
    print(f"总帧数: {stats['total_frames']}")
    print(f"Retry 标志计数: {stats['retry_flag_count']}")
    print(f"重复序列号计数: {stats['duplicate_seq_count']}")
    print(f"重传率: {stats['retransmission_rate']}%")
    print()
    print(f"Retry 详情: {json.dumps(stats['retry_details'], indent=2)}")
    print(f"重复详情: {json.dumps(stats['duplicate_details'], indent=2)}")
    print()


def test_pcap_export():
    print("=" * 60)
    print("测试 11: PCAP 导出")
    print("=" * 60)
    
    import time
    current_time = int(time.time() * 1000)
    
    frames = []
    for seq in [1, 2, 3]:
        fd = create_test_frame(FrameType.UNICAST, seq_num=seq)
        frames.append({
            'hex_data': fd.hex(),
            'timestamp': current_time + seq * 1000
        })
    
    pcap_bytes = frames_to_pcap_bytes(frames)
    
    print(f"生成 PCAP 数据长度: {len(pcap_bytes)} 字节")
    print(f"PCAP 魔数: 0x{pcap_bytes[0:4].hex()} (期望: 0xa1b2c3d4)")
    
    test_file = '/tmp/test_hiperlan2.pcap'
    success = write_pcap(test_file, frames)
    file_size = os.path.getsize(test_file) if success else 0
    print(f"写入文件: {success}, 大小: {file_size} 字节")
    
    if success:
        os.remove(test_file)
        print(f"测试文件已删除")
    print()


if __name__ == "__main__":
    test_unicast_frame()
    test_multicast_frame()
    test_broadcast_frame()
    test_full_parsed()
    test_summary()
    test_crc32_direct()
    test_fcs_tamper()
    test_sort_by_sequence()
    test_retry_frame()
    test_retransmission_analysis()
    test_pcap_export()
    
    print("=" * 60)
    print("所有测试完成!")
    print("=" * 60)
