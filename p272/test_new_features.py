#!/usr/bin/env python3
from soundwire_parser import SoundWireParser
import random

random.seed(42)

print("=" * 60)
print("测试 SoundWire 解析器新功能")
print("=" * 60)
print()

# 测试1: 正常解析
print("1. 正常解析（无错误注入）")
parser = SoundWireParser()
result = parser.parse_csv('test_data_extended.csv')
stats = parser.get_statistics()
print(f"   命令总数:     {stats['total_commands']}")
print(f"   校验错误:     {stats['parity_errors']}")
print(f"   注入错误:     {stats['injected_errors']}")
print()

# 测试2: 错误注入
print("2. 错误注入测试（50% 错误率）")
parser2 = SoundWireParser()
random.seed(42)
parser2.enable_error_injection(0.5)
result2 = parser2.parse_csv('test_data_extended.csv')
stats2 = parser2.get_statistics()
print(f"   命令总数:     {stats2['total_commands']}")
print(f"   校验错误:     {stats2['parity_errors']}")
print(f"   注入错误:     {stats2['injected_errors']}")
print()

# 打印CRC错误详情
print("   CRC错误详情 (前3个):")
for i, err in enumerate(parser2.get_crc_errors()[:3]):
    print(f"   {i+1}. {err['cmd_name']} ({err['device_name']})")
    print(f"      收到: {err['received_parity']}, 奇偶: {err['calculated_parity']}, CRC: {err['calculated_crc']}")
    print(f"      注入: {err['error_injected']}")
print()

# 测试3: 导出CSV
print("3. CSV导出功能")
csv_cmd = parser.export_commands_to_csv()
csv_reg = parser.export_register_ops_to_csv()
print(f"   命令CSV行数:   {len(csv_cmd.splitlines())}")
print(f"   寄存器CSV行数: {len(csv_reg.splitlines())}")
print()

# 打印CSV表头
print("   命令CSV表头:")
print(f"   {csv_cmd.splitlines()[0]}")
print()
print("   寄存器CSV表头:")
print(f"   {csv_reg.splitlines()[0]}")
print()

# 测试4: 命令校验详情
print("4. 命令校验详情 (前3个):")
for i, cmd in enumerate(parser2.get_parsed_commands()[:3]):
    print(f"   {i+1}. {cmd['cmd_name']}")
    print(f"      广播: {cmd['is_broadcast']}, 注入: {cmd['error_injected']}")
    print(f"      奇偶错误: {cmd['parity_error']}, CRC错误: {cmd['crc_error']}")
    if cmd['parity'] is not None:
        print(f"      收到: 0x{cmd['parity']:02X}, 计算奇偶: 0x{cmd['parity_calculated']:02X}, CRC: 0x{cmd['crc_calculated']:02X}")
print()

# 测试5: 保存CSV到文件
print("5. 保存CSV文件")
parser2.export_commands_to_csv('exported_commands.csv')
parser2.export_register_ops_to_csv('exported_register_ops.csv')
print("   已保存: exported_commands.csv")
print("   已保存: exported_register_ops.csv")
print()

print("=" * 60)
print("测试完成!")
print("=" * 60)
