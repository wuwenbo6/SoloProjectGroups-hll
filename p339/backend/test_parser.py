#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ima_parser import (
    parse_ima_data,
    generate_test_ima_data,
    parse_atm_header,
    parse_atm_cell,
    calculate_hec,
    check_link_degradation,
    check_member_failure,
    calculate_loss_rate,
    calculate_bandwidth,
    generate_frame_structure_diagram,
    generate_frame_structure_json,
    ATM_CELL_SIZE,
    IMA_FRAME_CELL_COUNT,
    AlertConfig,
    LinkStatus,
    AlertType,
    AlertSeverity,
    LinkStatistics,
    FrameStructure,
    build_atm_header
)


def test_hec_calculation():
    """Test HEC calculation"""
    print("=== 测试 HEC 计算 ===")
    test_header = bytes([0x00, 0x01, 0x00, 0x10])
    hec = calculate_hec(test_header)
    print(f"测试头部: {test_header.hex()}")
    print(f"计算HEC: 0x{hec:02X}")
    assert isinstance(hec, int) and 0 <= hec <= 255
    print("✅ HEC 计算测试通过\n")


def test_atm_header_parsing():
    """Test ATM header parsing"""
    print("=== 测试 ATM 头部解析 ===")
    header_bytes = build_atm_header(gfc=0, vpi=0, vci=16, pt=4, clp=0)
    header = parse_atm_header(header_bytes)
    print(f"GFC: {header.gfc}")
    print(f"VPI: {header.vpi}")
    print(f"VCI: {header.vci}")
    print(f"PT: {header.pt}")
    print(f"CLP: {header.clp}")
    print(f"HEC: 0x{header.hec:02X}")
    print(f"是OAM: {header.is_oam()}")
    assert header.vpi == 0
    assert header.vci == 16
    assert header.pt == 4
    assert header.is_oam() == True
    print("✅ ATM 头部解析测试通过\n")


def test_atm_cell_parsing():
    """Test ATM cell parsing"""
    print("=== 测试 ATM 信元解析 ===")
    cell = generate_test_ima_data(num_frames=1, num_links=1)[:ATM_CELL_SIZE]
    parsed_cell = parse_atm_cell(cell, 0)
    print(f"信元大小: {len(cell)} 字节")
    print(f"VPI: {parsed_cell.header.vpi}")
    print(f"VCI: {parsed_cell.header.vci}")
    print(f"是ICP信元: {parsed_cell.is_icp_cell()}")
    assert parsed_cell is not None
    assert parsed_cell.is_icp_cell() == True
    print("✅ ATM 信元解析测试通过\n")


def test_ima_parsing_without_loss():
    """Test IMA parsing without cell loss"""
    print("=== 测试 IMA 解析 (无丢失) ===")
    data = generate_test_ima_data(num_frames=5, num_links=2, simulate_loss=False)
    result = parse_ima_data(data)

    print(f"总信元数: {result.total_cells}")
    print(f"丢失信元数: {result.total_lost_cells}")
    print(f"链路数: {len(result.link_stats)}")
    print(f"IMA帧数: {len(result.frames)}")
    print(f"重组分组数: {len(result.reassembled_packets)}")

    for link_id, stat in result.link_stats.items():
        print(f"  链路 {link_id}: 总信元={stat.total_cells}, 丢失={stat.lost_cells}, 丢失率={stat.lost_cells/stat.total_cells*100:.4f}%")

    assert result.total_lost_cells == 0, "无丢失模式下不应有信元丢失"
    assert len(result.link_stats) == 2
    assert len(result.frames) == 10
    print("✅ IMA 解析测试 (无丢失) 通过\n")


def test_ima_parsing_with_loss():
    """Test IMA parsing with simulated cell loss"""
    print("=== 测试 IMA 解析 (模拟丢失) ===")
    data = generate_test_ima_data(num_frames=5, num_links=2, simulate_loss=True)
    result = parse_ima_data(data)

    print(f"总信元数: {result.total_cells}")
    print(f"丢失信元数: {result.total_lost_cells}")
    print(f"总丢失率: {result.total_lost_cells / result.total_cells * 100:.4f}%")

    for link_id, stat in result.link_stats.items():
        print(f"  链路 {link_id}: 总信元={stat.total_cells}, 丢失={stat.lost_cells}, 丢失率={stat.lost_cells/stat.total_cells*100:.4f}%")

    assert result.total_lost_cells > 0, "模拟丢失模式下应有信元丢失"
    print("✅ IMA 解析测试 (模拟丢失) 通过\n")


def test_packet_reassembly():
    """Test packet reassembly"""
    print("=== 测试分组重组 ===")
    data = generate_test_ima_data(num_frames=3, num_links=2)
    result = parse_ima_data(data)

    print(f"重组分组数: {len(result.reassembled_packets)}")
    for i, packet in enumerate(result.reassembled_packets[:3]):
        print(f"  分组 {i}: VPI={packet.vpi}, VCI={packet.vci}, 数据长度={len(packet.data)} 字节, 信元数={packet.cell_count}")
        print(f"    数据预览: {packet.data[:32].hex()}")

    assert len(result.reassembled_packets) > 0
    print("✅ 分组重组测试通过\n")


def test_icp_cell_extraction():
    """Test ICP cell extraction and link ID parsing"""
    print("=== 测试 ICP 信元提取与链路ID解析 ===")
    data = generate_test_ima_data(num_frames=3, num_links=3)
    result = parse_ima_data(data)

    print(f"检测到的链路ID: {list(result.link_stats.keys())}")
    print(f"ICP信元总数: {sum(stat.icp_cells for stat in result.link_stats.values())}")

    for link_id, stat in result.link_stats.items():
        print(f"  链路 {link_id}: ICP信元={stat.icp_cells}, 数据信元={stat.data_cells}, 填充信元={stat.filler_cells}")

    assert len(result.link_stats) == 3
    assert all(stat.icp_cells == 3 for stat in result.link_stats.values())
    print("✅ ICP 信元提取测试通过\n")


def test_edge_cases():
    """Test edge cases"""
    print("=== 测试边界情况 ===")

    empty_result = parse_ima_data(b'')
    print(f"空数据解析: 总信元={empty_result.total_cells}")
    assert empty_result.total_cells == 0

    partial_cell = b'\x00' * 50
    partial_result = parse_ima_data(partial_cell)
    print(f"不完整信元解析: 总信元={partial_result.total_cells}")
    assert partial_result.total_cells == 0

    single_cell = generate_test_ima_data(num_frames=1, num_links=1)[:ATM_CELL_SIZE]
    single_result = parse_ima_data(single_cell)
    print(f"单个信元解析: 总信元={single_result.total_cells}, ICP信元={sum(s.icp_cells for s in single_result.link_stats.values())}")
    assert single_result.total_cells == 1

    print("✅ 边界情况测试通过\n")


def test_loss_rate_calculation():
    """Test loss rate calculation"""
    print("=== 测试丢失率计算 ===")
    stat = LinkStatistics(link_id=0)
    stat.total_cells = 1000
    stat.lost_cells = 10

    loss_rate = calculate_loss_rate(stat)
    print(f"丢失率: {loss_rate:.4f}% (预期: 1.0%)")
    assert abs(loss_rate - 1.0) < 0.001

    stat.lost_cells = 0
    loss_rate = calculate_loss_rate(stat)
    print(f"无丢失率: {loss_rate:.4f}% (预期: 0.0%)")
    assert loss_rate == 0.0

    stat.total_cells = 0
    loss_rate = calculate_loss_rate(stat)
    print(f"空统计丢失率: {loss_rate:.4f}% (预期: 0.0%)")
    assert loss_rate == 0.0

    print("✅ 丢失率计算测试通过\n")


def test_link_degradation_detection():
    """Test link degradation detection with 1% threshold"""
    print("=== 测试链路降级检测 (阈值 1%) ===")
    config = AlertConfig(loss_rate_threshold=1.0, consecutive_degraded_threshold=1)
    alerts = []

    stat = LinkStatistics(link_id=0)
    stat.total_cells = 1000
    stat.lost_cells = 5

    check_link_degradation(stat, config, alerts)
    print(f"丢失率 0.5%: 状态={stat.status.value}, 告警数={len(alerts)}")
    assert stat.status == LinkStatus.NORMAL
    assert len(alerts) == 0

    stat.lost_cells = 20
    check_link_degradation(stat, config, alerts)
    print(f"丢失率 2.0%: 状态={stat.status.value}, 告警数={len(alerts)}")
    assert stat.status == LinkStatus.DEGRADED
    assert len(alerts) == 2

    degradation_alert = next(a for a in alerts if a.alert_type == AlertType.LINK_DEGRADED)
    assert degradation_alert.severity == AlertSeverity.WARNING

    loss_alert = next(a for a in alerts if a.alert_type == AlertType.CELL_LOSS_HIGH)
    assert loss_alert.severity == AlertSeverity.ERROR

    print("✅ 链路降级检测测试通过\n")


def test_link_restoration():
    """Test link restoration after degradation"""
    print("=== 测试链路恢复 ===")
    config = AlertConfig(loss_rate_threshold=1.0, consecutive_degraded_threshold=1)
    alerts = []

    stat = LinkStatistics(link_id=0)
    stat.total_cells = 1000
    stat.lost_cells = 20
    stat.status = LinkStatus.DEGRADED

    check_link_degradation(stat, config, alerts)
    assert stat.status == LinkStatus.DEGRADED
    initial_alert_count = len(alerts)

    stat.lost_cells = 5
    check_link_degradation(stat, config, alerts)
    print(f"丢失率从2%降到0.5%: 状态={stat.status.value}, 新告警数={len(alerts) - initial_alert_count}")
    assert stat.status == LinkStatus.NORMAL

    restore_alert = next(a for a in alerts if a.alert_type == AlertType.LINK_RESTORED)
    assert restore_alert.severity == AlertSeverity.INFO

    print("✅ 链路恢复测试通过\n")


def test_member_failure_detection():
    """Test member link failure detection"""
    print("=== 测试成员失效检测 ===")
    config = AlertConfig(missing_frames_threshold=3)
    alerts = []

    stat = LinkStatistics(link_id=0)
    stat.expected_sequence = 5

    check_member_failure(stat, config, alerts, 5)
    print(f"正常接收帧5: 连续缺失={stat.consecutive_missing_count}, 状态={stat.status.value}")
    assert stat.consecutive_missing_count == 0
    assert stat.status == LinkStatus.UNKNOWN

    stat.expected_sequence = 6
    check_member_failure(stat, config, alerts, 9)
    print(f"接收帧9 (缺失3帧): 连续缺失={stat.consecutive_missing_count}, 状态={stat.status.value}")
    assert stat.consecutive_missing_count == 3
    assert stat.status == LinkStatus.FAILED
    assert len(alerts) >= 2

    failure_alert = next(a for a in alerts if a.alert_type == AlertType.LINK_FAILED)
    assert failure_alert.severity == AlertSeverity.CRITICAL

    missing_alert = next(a for a in alerts if a.alert_type == AlertType.MEMBER_MISSING)
    assert missing_alert.severity == AlertSeverity.CRITICAL

    print("✅ 成员失效检测测试通过\n")


def test_member_restoration():
    """Test member link restoration after failure"""
    print("=== 测试成员恢复 ===")
    config = AlertConfig(missing_frames_threshold=3)
    alerts = []

    stat = LinkStatistics(link_id=0)
    stat.status = LinkStatus.FAILED
    stat.consecutive_missing_count = 3
    stat.expected_sequence = 10

    check_member_failure(stat, config, alerts, 10)
    print(f"恢复接收帧10: 状态={stat.status.value}, 连续缺失={stat.consecutive_missing_count}")
    assert stat.status == LinkStatus.NORMAL
    assert stat.consecutive_missing_count == 0

    restore_alert = next(a for a in alerts if a.alert_type == AlertType.MEMBER_RESTORED)
    assert restore_alert.severity == AlertSeverity.INFO

    print("✅ 成员恢复测试通过\n")


def test_alert_generation_in_parsing():
    """Test alert generation during full parsing with high loss"""
    print("=== 测试解析过程中告警生成 ===")

    config = AlertConfig(loss_rate_threshold=1.0, consecutive_degraded_threshold=1)
    data = generate_test_ima_data(num_frames=10, num_links=2, simulate_loss=True)
    result = parse_ima_data(data, config)

    overall_loss_rate = (result.total_lost_cells / result.total_cells * 100) if result.total_cells > 0 else 0
    print(f"总信元: {result.total_cells}, 丢失: {result.total_lost_cells}, 丢失率: {overall_loss_rate:.4f}%")
    print(f"告警数量: {len(result.alerts)}")
    print(f"整体状态: {result.overall_status.value}")
    print(f"活跃链路: {result.active_links}")
    print(f"降级链路: {result.degraded_links}")
    print(f"失效链路: {result.failed_links}")

    for i, alert in enumerate(result.alerts[:5]):
        print(f"  告警 {i+1}: {alert.alert_type.value}, 严重程度={alert.severity.value}, 链路={alert.link_id}")
        print(f"    {alert.message}")

    assert len(result.alerts) > 0
    assert result.overall_status in [LinkStatus.DEGRADED, LinkStatus.FAILED]

    print("✅ 告警生成测试通过\n")


def test_overall_status_update():
    """Test overall system status update"""
    print("=== 测试整体状态更新 ===")

    config = AlertConfig(loss_rate_threshold=1.0, consecutive_degraded_threshold=1)

    data_normal = generate_test_ima_data(num_frames=3, num_links=2, simulate_loss=False)
    result_normal = parse_ima_data(data_normal, config)
    print(f"无丢失场景: 整体状态={result_normal.overall_status.value}")
    assert result_normal.overall_status == LinkStatus.NORMAL
    assert len(result_normal.degraded_links) == 0
    assert len(result_normal.failed_links) == 0

    data_loss = generate_test_ima_data(num_frames=10, num_links=2, simulate_loss=True)
    result_loss = parse_ima_data(data_loss, config)
    print(f"有丢失场景: 整体状态={result_loss.overall_status.value}")
    assert result_loss.overall_status in [LinkStatus.DEGRADED, LinkStatus.FAILED]

    print("✅ 整体状态更新测试通过\n")


def test_bandwidth_calculation():
    """Test bandwidth calculation based on effective cell rate"""
    print("=== 测试带宽计算 ===")
    config = AlertConfig()
    data = generate_test_ima_data(num_frames=5, num_links=2, simulate_loss=False)
    result = parse_ima_data(data, config)

    for link_id, stat in result.link_stats.items():
        bw = stat.bandwidth
        print(f"链路 {link_id}:")
        print(f"  有效信元率: {bw.effective_cell_rate:.2f} cells/s")
        print(f"  理论最大带宽: {bw.theoretical_max_bandwidth_mbps:.2f} Mbps")
        print(f"  实际带宽: {bw.actual_bandwidth_mbps:.2f} Mbps")
        print(f"  带宽利用率: {bw.bandwidth_utilization:.2f}%")
        print(f"  有效净荷速率: {bw.effective_payload_rate_mbps:.2f} Mbps")
        print(f"  传输效率: {bw.efficiency:.2f}%")
        print(f"  数据字节: {bw.total_data_bytes}, 开销字节: {bw.total_overhead_bytes}")

        assert bw.effective_cell_rate > 0
        assert bw.theoretical_max_bandwidth_mbps > 0
        assert bw.actual_bandwidth_mbps > 0
        assert bw.efficiency > 0

    print("✅ 带宽计算测试通过\n")


def test_frame_structure_analysis():
    """Test frame structure analysis and diagram generation"""
    print("=== 测试帧结构分析 ===")
    config = AlertConfig()
    data = generate_test_ima_data(num_frames=3, num_links=2, simulate_loss=False)
    result = parse_ima_data(data, config)

    for frame in result.frames[:2]:
        structure = FrameStructure(
            frame_number=frame.frame_number,
            link_id=frame.link_id
        )

        structure.total_cell_count = IMA_FRAME_CELL_COUNT
        for i in range(IMA_FRAME_CELL_COUNT):
            if i == 0:
                structure.structure.append('ICP')
            elif i % 10 == 0:
                structure.structure.append('FILL')
                structure.filler_cell_count += 1
            else:
                structure.structure.append('DATA')
                structure.data_cell_count += 1

        diagram = generate_frame_structure_diagram(structure)
        print(f"帧 {frame.frame_number} (链路 {frame.link_id}) 结构图:")
        print(diagram)
        print()

        json_struct = generate_frame_structure_json(structure)
        assert json_struct['frame_number'] == frame.frame_number
        assert json_struct['link_id'] == frame.link_id
        assert json_struct['total_cell_count'] == IMA_FRAME_CELL_COUNT
        assert 'data_ratio' in json_struct
        assert 'filler_ratio' in json_struct

    print("✅ 帧结构分析测试通过\n")


def run_all_tests():
    """Run all tests"""
    print("🚀 开始运行 IMA 解析器测试\n")

    tests = [
        test_hec_calculation,
        test_atm_header_parsing,
        test_atm_cell_parsing,
        test_ima_parsing_without_loss,
        test_ima_parsing_with_loss,
        test_packet_reassembly,
        test_icp_cell_extraction,
        test_edge_cases,
        test_loss_rate_calculation,
        test_link_degradation_detection,
        test_link_restoration,
        test_member_failure_detection,
        test_member_restoration,
        test_alert_generation_in_parsing,
        test_overall_status_update,
        test_bandwidth_calculation,
        test_frame_structure_analysis
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            print(f"❌ {test.__name__} 失败: {e}\n")
            failed += 1
        except Exception as e:
            print(f"❌ {test.__name__} 异常: {e}\n")
            failed += 1

    print(f"📊 测试结果: {passed} 通过, {failed} 失败")

    if failed > 0:
        sys.exit(1)
    else:
        print("\n🎉 所有测试通过!")
        sys.exit(0)


if __name__ == '__main__':
    run_all_tests()
