#!/usr/bin/env python3

from pcie_ats_simulator import PCIeSimulator, InvalidateType, ATSTransactionStatus
import time


def test_pasid_address_spaces():
    print("=" * 70)
    print("测试 1: PASID 进程私有地址空间")
    print("=" * 70)
    
    simulator = PCIeSimulator(system_page_size=0x1000, pasid_enabled=True)
    simulator.initialize_demo_mappings()
    
    device = simulator.create_device("GPU_PASID")
    
    print("\n系统 PASID 上下文:")
    contexts = simulator.root_complex.get_pasid_contexts()
    for pasid, ctx in contexts.items():
        print(f"  PASID {pasid}: {ctx.process_name}, 映射数: {len(ctx.mappings)}")
    
    print("\n--- 测试全局地址空间 (无 PASID) ---")
    result = device.ats_translate(0x10000000)
    if result:
        print(f"✓ 全局映射: IOVA 0x10000000 -> HPA {hex(result)}")
    else:
        print(f"✗ 全局映射失败")
    
    print("\n--- 测试 PASID 1 (Process_A) ---")
    result_pasid1 = device.ats_translate(0x10000000, pasid=1)
    if result_pasid1:
        print(f"✓ PASID 1 映射: IOVA 0x10000000 -> HPA {hex(result_pasid1)}")
    else:
        print(f"✗ PASID 1 映射失败")
    
    print("\n--- 测试 PASID 2 (Process_B) ---")
    result_pasid2 = device.ats_translate(0x10000000, pasid=2)
    if result_pasid2:
        print(f"✓ PASID 2 映射: IOVA 0x10000000 -> HPA {hex(result_pasid2)}")
    else:
        print(f"✗ PASID 2 映射失败")
    
    print("\n--- 验证地址空间隔离 ---")
    if result != result_pasid1 and result_pasid1 != result_pasid2:
        print("✓ 地址空间隔离正常: 相同IOVA在不同PASID下映射到不同HPA")
        print(f"  全局: {hex(result)}")
        print(f"  PASID 1: {hex(result_pasid1)}")
        print(f"  PASID 2: {hex(result_pasid2)}")
    else:
        print("✗ 地址空间隔离有问题")
    
    print("\n--- 测试不存在的 PASID ---")
    result_invalid = device.ats_translate(0x10000000, pasid=999)
    if result_invalid is None:
        history = device.get_request_history(1)
        print(f"✗ 无效PASID请求失败 (预期行为): {history[-1].get('reason', 'Unknown')}")
    else:
        print("✗ 无效PASID请求不应成功")


def test_translation_stats():
    print("\n" + "=" * 70)
    print("测试 2: 转换统计功能")
    print("=" * 70)
    
    simulator = PCIeSimulator(system_page_size=0x1000, pasid_enabled=True)
    simulator.initialize_demo_mappings()
    
    device = simulator.create_device("StatsTest")
    
    print("\n--- 生成流量以收集统计 ---")
    print("执行 15 次翻译请求 (5次全局, 5次PASID 1, 5次PASID 2)...")
    
    for i in range(5):
        device.ats_translate(0x10000000 + i * 0x100)
        device.ats_translate(0x10000000 + i * 0x100, pasid=1)
        device.ats_translate(0x10000000 + i * 0x100, pasid=2)
    
    print("\n--- 全局统计 ---")
    stats = simulator.get_stats()
    global_stats = stats['global']
    for key, value in global_stats.items():
        print(f"  {key}: {value}")
    
    print("\n--- 设备统计 ---")
    device_stats = stats['by_device']['StatsTest']
    for key, value in device_stats.items():
        print(f"  {key}: {value}")
    
    print("\n--- PASID 统计 ---")
    for pasid, pasid_stats in stats['by_pasid'].items():
        print(f"  PASID {pasid}:")
        print(f"    总请求: {pasid_stats['total_requests']}")
        print(f"    命中率: {pasid_stats['hit_rate']}%")
        print(f"    成功率: {pasid_stats['success_rate']}%")


def test_stats_export():
    print("\n" + "=" * 70)
    print("测试 3: 统计导出功能")
    print("=" * 70)
    
    simulator = PCIeSimulator(system_page_size=0x1000, pasid_enabled=True)
    simulator.initialize_demo_mappings()
    
    device = simulator.create_device("ExportTest")
    device.ats_translate(0x10000000)
    device.ats_translate(0x10000000, pasid=1)
    device.ats_translate(0x10000000, pasid=2)
    
    print("\n--- 导出 JSON 格式 ---")
    json_export = simulator.export_stats("json")
    print("JSON 导出成功 (前300字符):")
    print(json_export[:300] + "...")
    
    print("\n--- 导出 CSV 格式 ---")
    csv_export = simulator.export_stats("csv")
    print("CSV 导出成功:")
    print(csv_export)


def test_pasid_invalidate():
    print("\n" + "=" * 70)
    print("测试 4: PASID 缓存失效")
    print("=" * 70)
    
    simulator = PCIeSimulator(system_page_size=0x1000, pasid_enabled=True)
    simulator.initialize_demo_mappings()
    
    device = simulator.create_device("InvalidateTest")
    
    print("\n--- 填充缓存 (全局和PASID) ---")
    device.ats_translate(0x10000000)
    device.ats_translate(0x10000000, pasid=1)
    device.ats_translate(0x10000000, pasid=2)
    device.ats_translate(0x20000000, pasid=1)
    
    print(f"缓存条目数: {len(device.get_atc_cache())}")
    for key, entry in device.get_atc_cache().items():
        print(f"  IOVA {hex(key[0])}, PASID {key[1]} -> HPA {hex(entry.hpa)}")
    
    print("\n--- 发送 PASID 1 失效 ---")
    msg_id = simulator.broadcast_invalidate("pasid", target_pasid=1)
    print(f"失效消息ID: {msg_id}")
    
    print(f"失效后缓存条目数: {len(device.get_atc_cache())}")
    for key, entry in device.get_atc_cache().items():
        print(f"  IOVA {hex(key[0])}, PASID {key[1]} -> HPA {hex(entry.hpa)}")
    
    pasid1_entries = [k for k in device.get_atc_cache().keys() if k[1] == 1]
    pasid2_entries = [k for k in device.get_atc_cache().keys() if k[1] == 2]
    global_entries = [k for k in device.get_atc_cache().keys() if k[1] is None]
    
    if len(pasid1_entries) == 0 and len(pasid2_entries) == 1 and len(global_entries) == 1:
        print("✓ PASID 失效正常: 仅清除指定PASID的缓存")
    else:
        print("✗ PASID 失效异常")


def test_page_size_with_pasid():
    print("\n" + "=" * 70)
    print("测试 5: PASID 下的页大小校验")
    print("=" * 70)
    
    simulator = PCIeSimulator(system_page_size=0x1000, pasid_enabled=True)
    simulator.initialize_demo_mappings()
    
    device = simulator.create_device("PageTest")
    
    print("\n--- PASID 1 正常页大小请求 ---")
    result = device.ats_translate(0x10000000, pasid=1, page_size=0x1000)
    if result:
        print(f"✓ PASID 1, 4K页: IOVA 0x10000000 -> HPA {hex(result)}")
    
    print("\n--- PASID 1 错误页大小请求 (不同IOVA，避免缓存) ---")
    result = device.ats_translate(0x10001000, pasid=1, page_size=0x200000)
    if result is None:
        history = device.get_request_history(1)
        print(f"✗ 页大小不匹配请求失败 (预期): {history[-1].get('reason')}")
    
    print("\n--- 查看统计 ---")
    stats = simulator.get_stats()
    print(f"  页大小不匹配次数: {stats['by_pasid'][1]['page_size_mismatch']}")
    print(f"  PASID 1 总请求: {stats['by_pasid'][1]['total_requests']}")
    print(f"  PASID 1 成功率: {stats['by_pasid'][1]['success_rate']}%")


if __name__ == "__main__":
    test_pasid_address_spaces()
    test_translation_stats()
    test_stats_export()
    test_pasid_invalidate()
    test_page_size_with_pasid()
    
    print("\n" + "=" * 70)
    print("所有测试完成!")
    print("=" * 70)
