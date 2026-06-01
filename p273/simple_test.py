#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import time
import json
from monitor import FlowMonitor
import config


def simulate_meter_chain_traffic():
    monitor = FlowMonitor(max_history=60)

    received_data = []

    def callback(data):
        received_data.append(data)
        update_num = len(received_data)

        print(f"\n=== Update {update_num} ===")
        print(f"Time: {time.strftime('%H:%M:%S')}")
        print(f"Rate: {data['current_rate_mbps']:.2f} Mbps")
        print(f"Remark Rate: {data['current_remark_rate']:.2f} pkts/s")
        print(f"Drop Rate: {data['current_drop_rate']:.2f} pkts/s")
        print(f"Total Remarked: {data['total_remarked_packets']} ({data['packet_remark_percentage']:.1f}%)")
        print(f"Total Dropped: {data['total_dropped_packets']} ({data['packet_loss_percentage']:.1f}%)")
        print(f"Threshold Exceeded: {data['threshold_exceeded']}")
        print(f"Burst Exceeded: {data['burst_exceeded']}")

        for mid, ms in data.get('meter_stats', {}).items():
            print(f"  Meter {mid}: remarked={ms.get('remarked_packets',0)}, dropped={ms.get('dropped_packets',0)}")

    monitor.set_data_callback(callback)

    meter_chain = config.METER_CHAIN
    print(f"\n========== 多级 Meter 链测试 ==========")
    for i, m in enumerate(meter_chain):
        bands_str = ', '.join(
            f"{b['type'].upper()}@{b['rate']}kbps" +
            (f" DSCP->{b.get('prec_level',0)}" if b['type'] == 'remark' else '')
            for b in m['bands']
        )
        print(f"  Level {i+1}: Meter {m['meter_id']} (Table {m['table_id']}) - {m['name']}: {bands_str}")
    print(f"========================================")

    total_packets = 0
    total_bytes = 0
    per_meter_remarked = {m['meter_id']: 0 for m in meter_chain}
    per_meter_dropped = {m['meter_id']: 0 for m in meter_chain}
    interval = config.MONITOR_INTERVAL

    phases = [
        ('阶段1: 速率 < 最低阈值 (正常转发)', 200000, 10, {1: 0, 2: 0, 3: 0}),
        ('阶段2: 超过Level-1阈值 (DSCP AF11降级)', 600000, 10, {1: 0.3, 2: 0, 3: 0}),
        ('阶段3: 超过Level-2阈值 (DSCP BE降级)', 1100000, 10, {1: 0.2, 2: 0.25, 3: 0}),
        ('阶段4: 超过Level-3阈值 (丢包)', 2000000, 10, {1: 0.15, 2: 0.2, 3: 0.15}),
        ('阶段5: 速率恢复正常', 300000, 5, {1: 0, 2: 0, 3: 0}),
    ]

    drop_thresholds = {}
    for m in meter_chain:
        for b in m['bands']:
            if b['type'] == 'drop':
                drop_thresholds[m['meter_id']] = b['rate'] * 1000

    for phase_name, rate_bps, iterations, remark_ratios in phases:
        print(f"\n=== {phase_name} ===")

        for i in range(iterations):
            bytes_in_interval = int(rate_bps * interval / 8)
            packets_in_interval = int(bytes_in_interval / 1000)

            total_packets += packets_in_interval
            total_bytes += bytes_in_interval

            for m in meter_chain:
                mid = m['meter_id']
                remark_ratio = remark_ratios.get(mid, 0)
                drop_ratio = 0
                drop_thresh = drop_thresholds.get(mid)
                if drop_thresh is not None and rate_bps > drop_thresh:
                    drop_ratio = 0.15

                if remark_ratio > 0:
                    per_meter_remarked[mid] += int(packets_in_interval * remark_ratio)
                if drop_ratio > 0:
                    per_meter_dropped[mid] += int(packets_in_interval * drop_ratio)

            meter_stats = {}
            for m in meter_chain:
                mid = m['meter_id']
                meter_stats[mid] = {
                    'meter_id': mid,
                    'name': m['name'],
                    'bands': m['bands'],
                    'band_stats': [],
                    'remarked_packets': per_meter_remarked[mid],
                    'remarked_bytes': per_meter_remarked[mid] * 1000,
                    'dropped_packets': per_meter_dropped[mid],
                    'dropped_bytes': per_meter_dropped[mid] * 1000,
                }

            data = {
                'timestamp': time.time(),
                'flows': {
                    'eth_type=2048': {
                        'byte_count': total_bytes,
                        'packet_count': total_packets,
                        'last_byte_count': total_bytes - bytes_in_interval,
                        'last_packet_count': total_packets - packets_in_interval,
                        'last_update': time.time() - interval,
                        'rate_bps': rate_bps
                    }
                },
                'meter_chain': meter_chain,
                'meter_stats': meter_stats,
                'flow_entries': [],
            }

            monitor.process_data(data)
            time.sleep(0.05)

    print("\n=== 测试完成 ===")
    summary = monitor.get_summary()
    print(f"\nFinal Summary:")
    print(f"  Current Rate: {summary['current_rate_mbps']:.2f} Mbps")
    print(f"  Total Packets: {summary['total_packets']}")
    print(f"  Total Remarked: {summary['total_remarked_packets']} ({summary['packet_remark_percentage']:.1f}%)")
    print(f"  Total Dropped: {summary['total_dropped_packets']} ({summary['packet_loss_percentage']:.1f}%)")
    print(f"  Threshold Exceeded Count: {summary['threshold_exceeded_count']}")
    print(f"  Burst Exceeded Count: {summary['burst_exceeded_count']}")

    print(f"\n=== JSON 导出测试 ===")
    json_data = monitor.export_json()
    parsed = json.loads(json_data)
    print(f"  Export Time: {parsed['export_time']}")
    print(f"  Summary Keys: {list(parsed['summary'].keys())}")
    print(f"  Meter Chain Levels: {len(parsed['meter_chain_config'])}")
    print(f"  Meter Stats Count: {len(parsed['meter_stats'])}")
    print(f"  Flow Entries: {len(parsed['flow_entries'])}")
    print(f"  Rate History Length: {len(parsed['history']['rate_history'])}")
    print(f"  Remark History Length: {len(parsed['history']['remark_history'])}")
    print(f"  Drop History Length: {len(parsed['history']['drop_history'])}")
    print(f"  JSON Size: {len(json_data)} bytes")

    print(f"\n=== 功能验证 ===")
    checks = [
        ('多级Meter链统计', summary['total_remarked_packets'] > 0),
        ('丢包统计', summary['total_dropped_packets'] > 0),
        ('超限检测', summary['threshold_exceeded_count'] >= 1),
        ('最高阈值超限', summary['burst_exceeded_count'] >= 1),
        ('降级百分比', 0 < summary['packet_remark_percentage'] < 100),
        ('丢包百分比', 0 < summary['packet_loss_percentage'] < 100),
        ('JSON导出-概要', 'current_rate_mbps' in parsed['summary']),
        ('JSON导出-Meter配置', len(parsed['meter_chain_config']) == 3),
        ('JSON导出-Meter统计', len(parsed['meter_stats']) == 3),
        ('JSON导出-历史数据', len(parsed['history']['rate_history']) > 0),
        ('JSON导出-流表条目', 'flow_entries' in parsed),
    ]

    all_passed = True
    for name, passed in checks:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"  {name}: {status}")
        if not passed:
            all_passed = False

    if all_passed:
        print("\n=== 多级Meter链 + JSON导出: OK ===")
    else:
        print("\n=== 部分测试未通过 ===")

    return all_passed


if __name__ == '__main__':
    print("Testing Multi-Level Meter Chain + JSON Export ...")
    success = simulate_meter_chain_traffic()
    sys.exit(0 if success else 1)
