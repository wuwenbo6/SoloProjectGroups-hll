#!/usr/bin/env python3
from soundwire_parser import SoundWireParser

def build_frame(cmd_byte, ext_byte=None, params=None):
    frame = [0x1E, cmd_byte]
    if ext_byte is not None:
        frame.append(ext_byte)
    if params:
        frame.extend(params)
    parity = SoundWireParser.calculate_parity(frame)
    frame.append(parity)
    return frame

frames = []

# 1. SSC_Bus_Reset (广播): cmd=0x8F (type=0x8, addr=0xF)
frames.extend(build_frame(0x8F))

# 2. SSC_Bus_Reset (广播)
frames.extend(build_frame(0x8F))

# 3. SSC_Wake (广播): cmd=0x1F (type=0x1, addr=0xF)
frames.extend(build_frame(0x1F))

# 4. SSC_Enumerate (广播): cmd=0xAF (type=0xA, addr=0xF), param=0xA5
frames.extend(build_frame(0xAF, params=[0xA5]))

# 5. SSC_Enumerate_ACK (设备11): cmd=0xBB (type=0xB, addr=0xB), ext=0x22 (group=2, dev=2), param=0x46
frames.extend(build_frame(0xBB, ext_byte=0x22, params=[0x46]))

# 6. SSC_Write (设备0x22): cmd=0x32 (type=0x3, addr=0x2), ext=0x22, reg=0x4000, data=0x00
frames.extend(build_frame(0x32, ext_byte=0x22, params=[0x40, 0x00, 0x00]))

# 7. SSC_Write (设备0x22): cmd=0x32, ext=0x22, reg=0x4001, data=0x01
frames.extend(build_frame(0x32, ext_byte=0x22, params=[0x40, 0x01, 0x01]))

# 8. SSC_Read (设备0x22): cmd=0x22, ext=0x22, reg=0x4000
frames.extend(build_frame(0x22, ext_byte=0x22, params=[0x40, 0x00]))

# 9. SSC_Read_ACK (设备0x22): cmd=0x42, ext=0x22, reg=0x4000, data=0x00
frames.extend(build_frame(0x42, ext_byte=0x22, params=[0x40, 0x00, 0x00]))

# 10. SSC_Ping (设备0x22): cmd=0x12, ext=0x22
frames.extend(build_frame(0x12, ext_byte=0x22))

# 生成CSV
with open('test_data_crc_correct.csv', 'w', newline='') as f:
    f.write('Time,Data\n')
    t = 0.0
    for b in frames:
        f.write(f'{t:.6f},0x{b:02X}\n')
        t += 0.000001

print(f'生成 test_data_crc_correct.csv, 共 {len(frames)} 字节')
print()

# 验证
parser = SoundWireParser()
result = parser.parse_csv('test_data_crc_correct.csv')
stats = parser.get_statistics()
print(f'解析结果: 命令={stats["total_commands"]}, 校验错误={stats["parity_errors"]}')
print()

for i, cmd in enumerate(parser.get_parsed_commands()):
    print(f'{i+1}. {cmd["cmd_name"]}: parity_err={cmd["parity_error"]}, crc_err={cmd["crc_error"]}')
    if cmd['parity'] is not None:
        print(f'   收到=0x{cmd["parity"]:02X}, 计算奇偶=0x{cmd["parity_calculated"]:02X}, CRC=0x{cmd["crc_calculated"]:02X}')
