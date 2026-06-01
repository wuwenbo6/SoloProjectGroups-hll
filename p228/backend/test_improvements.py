#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cli.parser import parse_hex_temperature, parse_ses_temperature
from cli import SesCli

def test_hex_temperature_parsing():
    print("=" * 70)
    print("测试 1: SES规范16进制温度解析")
    print("=" * 70)
    
    test_cases = [
        ("0x1a00", 26.0, "26.0°C (整数温度)"),
        ("1a00h", 26.0, "26.0°C (带h后缀)"),
        ("1A00", 26.0, "26.0°C (大写,无前缀)"),
        ("0x1a80", 26.5, "26.5°C (包含小数部分 0x80/256 = 0.5)"),
        ("0x1a40", 26.25, "26.25°C (0x40/256 = 0.25)"),
        ("0x0028", 0.15625, "0.15625°C (低字节小数)"),
        ("0x1b00", 27.0, "27.0°C"),
        ("0x28", 40.0, "40.0°C (单字节格式)"),
        ("28h", 40.0, "40.0°C (单字节带h后缀)"),
        ("0x00", 0.0, "0.0°C (零值)"),
        ("0xff20", -0.875, "-0.875°C (负温度, 两字节补码)"),
        ("0xfe00", -2.0, "-2.0°C (负温度)"),
        ("invalid", None, "无效值 - 返回None"),
        ("0xGHIJ", None, "非16进制字符 - 返回None"),
    ]
    
    passed = 0
    failed = 0
    
    for hex_str, expected, description in test_cases:
        result = parse_hex_temperature(hex_str)
        
        status = "✓" if result == expected else "✗"
        if result == expected:
            passed += 1
            color = "\033[92m"
        else:
            failed += 1
            color = "\033[91m"
        
        print(f"{color}{status} {hex_str:12s} -> {result!r:>10} (expected: {expected!r}) - {description}\033[0m")
    
    print(f"\n总计: {passed} 通过, {failed} 失败")
    return failed == 0


def test_ses_temperature_output_parsing():
    print("\n" + "=" * 70)
    print("测试 2: sg_ses 温度输出解析（包含16进制）")
    print("=" * 70)
    
    mock_output_with_hex = """
Diagnostic page, code: 0x1, Enclosure Status
  Temperature sensor, element index: 0
    Descriptor: Inlet Temperature
    Current temperature: 0x1a80
    Warning threshold: 0x2d00
    Critical threshold: 0x3700

  Temperature sensor, element index: 1
    Descriptor: Exhaust Temperature
    Current temp: 1c40h
    Warning: 2d00h
    Critical: 3700h

  Temperature sensor, element index: 2
    Descriptor: CPU Temp
    Current reading: 28.5 C
    Hex value: 0x1c80

  Temperature sensor, element index: 3
    Descriptor: HBA Temp
    Raw hex: 1b00h
    Warning temp: 45 C
    Critical temp: 55 C
"""
    
    sensors = parse_ses_temperature(mock_output_with_hex)
    
    print(f"解析到 {len(sensors)} 个温度传感器:\n")
    for sensor in sensors:
        temp = sensor['current']
        warning = sensor['warning']
        critical = sensor['critical']
        print(f"  {sensor['name']}:")
        print(f"    当前: {temp}°C")
        if warning:
            print(f"    告警: {warning}°C")
        if critical:
            print(f"    临界: {critical}°C")
        print()
    
    expected_temps = [26.5, 28.25, 28.5, 27.0]
    all_match = True
    for i, sensor in enumerate(sensors):
        if i < len(expected_temps) and sensor['current'] != expected_temps[i]:
            print(f"  ✗ 传感器 {i} 温度不匹配: {sensor['current']} != {expected_temps[i]}")
            all_match = False
    
    if all_match and len(sensors) == 4:
        print("✓ 所有温度值解析正确！")
        return True
    else:
        print("✗ 部分值解析不正确")
        return False


def test_hex_page_parsing():
    print("\n" + "=" * 70)
    print("测试 3: SES诊断页原始16进制数据解析")
    print("=" * 70)
    
    mock_hex_page = """
Diagnostic Page 0x00 - Enclosure Status
00 01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f
1a 00 1c 40 1b 80 28 00 19 00 1e 20 00 00 00 00

  0x1a00 = Inlet: 26.0°C
  0x1c40 = Exhaust: 28.25°C
  0x1b80 = CPU: 27.5°C
  0x2800 = HBA: 40.0°C
"""
    
    sensors = parse_ses_temperature(mock_hex_page)
    
    print(f"解析到 {len(sensors)} 个温度传感器:\n")
    for sensor in sensors:
        print(f"  {sensor['name']}: {sensor['current']}°C")
    
    expected_temps = [26.0, 28.25, 27.5, 40.0]
    all_match = True
    for i, sensor in enumerate(sensors[:4]):
        if i < len(expected_temps) and abs(sensor['current'] - expected_temps[i]) > 0.01:
            print(f"  ✗ 传感器 {i} 温度不匹配: {sensor['current']} != {expected_temps[i]}")
            all_match = False
    
    if all_match and len(sensors) >= 4:
        print("\n✓ 原始16进制诊断页解析正确！")
        return True
    else:
        print("\n✗ 部分值解析不正确")
        return False


def test_led_control_with_enumeration():
    print("\n" + "=" * 70)
    print("测试 4: LED控制前枚举槽位 (模拟模式)")
    print("=" * 70)
    
    cli = SesCli('/dev/sg1', simulation_mode=True)
    
    print(f"设备: {cli.device}")
    print(f"模拟模式: {cli.is_simulation_mode}")
    
    slots = cli.get_slot_status()
    print(f"\n枚举到 {len(slots)} 个槽位:")
    for slot in slots[:5]:
        present = "在线" if slot['present'] else "空闲"
        print(f"  槽位 {slot['slot']:2d}: {present}, device={slot.get('device', 'N/A')}")
    
    print("\n" + "-" * 50)
    print("LED控制测试:")
    
    test_slot = 3
    print(f"\n测试槽位 {test_slot}:")
    slot_before = cli.get_single_slot(test_slot)
    print(f"  设置前: locate={slot_before['locate']}, fault={slot_before['fault']}, active={slot_before['active']}")
    
    result = cli.set_led(test_slot, 'locate', 'on')
    print(f"  设置 locate=on: {'成功' if result else '失败'}")
    
    slot_after = cli.get_single_slot(test_slot)
    print(f"  设置后: locate={slot_after['locate']}, fault={slot_after['fault']}, active={slot_after['active']}")
    
    result = cli.set_led(test_slot, 'locate', 'off')
    print(f"  设置 locate=off: {'成功' if result else '失败'}")
    
    slot_final = cli.get_single_slot(test_slot)
    print(f"  最终状态: locate={slot_final['locate']}")
    
    print("\n" + "-" * 50)
    print("无效槽位测试:")
    invalid_slot = 999
    result = cli.set_led(invalid_slot, 'locate', 'on')
    print(f"  控制槽位 {invalid_slot}: {'被拒绝 (正确)' if not result else '失败 (错误)'}")
    
    if slot_after['locate'] == True and slot_final['locate'] == False and not result:
        print("\n✓ LED控制逻辑正确！")
        return True
    else:
        print("\n✗ LED控制逻辑有问题")
        return False


def test_mixed_temperature_formats():
    print("\n" + "=" * 70)
    print("测试 5: 混合格式温度解析")
    print("=" * 70)
    
    mixed_output = """
  Temperature sensor, element index: 0
    Descriptor: Inlet
    Current temperature: 26.5 C
    Hex: 0x1a80

  Temperature sensor, element index: 1
    Descriptor: Exhaust
    Current temp: 1c40h

  Temperature sensor, element index: 2
    Descriptor: CPU
    Reading: 30°C

  Temperature sensor, element index: 3
    Descriptor: HBA
    value: 0x1f00
"""
    
    sensors = parse_ses_temperature(mixed_output)
    
    print(f"解析到 {len(sensors)} 个传感器:\n")
    for sensor in sensors:
        print(f"  {sensor['name']}: {sensor['current']}°C")
    
    expected = [26.5, 28.25, 30.0, 31.0]
    all_ok = len(sensors) == 4
    for i, s in enumerate(sensors):
        if abs(s['current'] - expected[i]) > 0.01:
            print(f"✗ {s['name']}: {s['current']} != {expected[i]}")
            all_ok = False
    
    if all_ok:
        print("\n✓ 混合格式解析全部正确！")
    return all_ok


def main():
    print("\033[95m" + "=" * 70)
    print("   SAS Backplane CLI 改进功能测试")
    print("   1. LED控制前枚举槽位，使用--index匹配")
    print("   2. 温度解析按SES规范16进制转10进制")
    print("=" * 70 + "\033[0m")
    
    results = []
    
    results.append(test_hex_temperature_parsing())
    results.append(test_ses_temperature_output_parsing())
    results.append(test_hex_page_parsing())
    results.append(test_led_control_with_enumeration())
    results.append(test_mixed_temperature_formats())
    
    print("\n" + "=" * 70)
    print("测试总结")
    print("=" * 70)
    
    passed = sum(results)
    total = len(results)
    
    print(f"\n总共 {total} 个测试，通过 {passed} 个，失败 {total - passed} 个")
    
    if all(results):
        print("\n\033[92m" + "✓ 所有测试通过！改进功能工作正常。" + "\033[0m")
        print("""
改进说明：
1. LED控制：现在会先调用 get_slot_status() 枚举所有槽位，
   验证目标槽位存在后，使用匹配的槽位号通过 --index 参数控制。
   同时增加了详细的日志记录。

2. 温度解析：实现了 parse_hex_temperature() 函数，
   严格按照 SES 规范解析 16 进制温度值：
   - 1字节格式：直接返回整数温度
   - 2字节格式：高字节整数部分 + 低字节/256 小数部分
   - 支持带符号的两字节补码表示负温度
   - 支持多种 16 进制格式：0x前缀、h后缀、裸16进制
        """)
    else:
        print("\n\033[91m" + "✗ 部分测试失败，请检查代码。" + "\033[0m")
    
    return 0 if all(results) else 1


if __name__ == '__main__':
    sys.exit(main())
