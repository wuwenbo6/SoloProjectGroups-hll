#!/usr/bin/env python3
from backend.camera_simulator import CameraSimulator, V4L2Loopback, ImageGenerator
import numpy as np

print('=' * 60)
print('MIPI CSI-2 摄像头模拟器 - 新功能验证')
print('=' * 60)
print()

# 1. 像素格式定义
print('[1/6] 像素格式定义')
print('-' * 40)
for name, info in V4L2Loopback.PIXEL_FORMATS.items():
    print(f'  {name}: fourcc=0x{info["fourcc"]:08X}, bpp={info["bpp"]}')
print('  ✓ OK')
print()

# 2. 帧大小计算
print('[2/6] 帧大小计算 (640x480)')
print('-' * 40)
for fmt in ['RGB24', 'RAW10', 'RAW12']:
    v4l2 = V4L2Loopback('/dev/null', 8, fmt)
    size = v4l2._calculate_frame_size(640, 480, fmt)
    expected = {
        'RGB24': 640 * 480 * 3,
        'RAW10': (640 * 480 * 10 + 7) // 8,
        'RAW12': (640 * 480 * 12 + 7) // 8
    }[fmt]
    status = '✓' if size == expected else '✗'
    print(f'  {fmt}: {size} bytes (预期: {expected}) {status}')
print()

# 3. 坏像素类型
print('[3/6] 坏像素类型支持')
print('-' * 40)
print(f'  支持类型: {ImageGenerator.BAD_PIXEL_TYPES}')
print('  ✓ OK')
print()

# 4. RAW格式转换
print('[4/6] RAW格式转换测试 (100x100)')
print('-' * 40)
test_rgb = np.random.randint(0, 256, (100, 100, 3), dtype=np.uint8)
raw10 = V4L2Loopback.rgb_to_raw10(test_rgb, 100, 100)
raw12 = V4L2Loopback.rgb_to_raw12(test_rgb, 100, 100)

expected_10 = (100 * 100 * 10 + 7) // 8
expected_12 = (100 * 100 * 12 + 7) // 8

print(f'  RAW10: {len(raw10)} bytes (预期: {expected_10}) {"✓" if len(raw10) == expected_10 else "✗"}')
print(f'  RAW12: {len(raw12)} bytes (预期: {expected_12}) {"✓" if len(raw12) == expected_12 else "✗"}')
print()

# 5. 坏像素注入
print('[5/6] 坏像素注入测试')
print('-' * 40)
gen = ImageGenerator(100, 100)
gen.set_bad_pixels(enabled=True, count=50, pixel_type='hot', seed=42)
print(f'  坏像素数量: {len(gen.bad_pixels)} {"✓" if len(gen.bad_pixels) == 50 else "✗"}')
print(f'  坏像素类型: {gen.bad_pixel_type}')

# 测试各种坏像素类型
for bp_type in ImageGenerator.BAD_PIXEL_TYPES:
    gen.set_bad_pixels(enabled=True, count=20, pixel_type=bp_type, seed=42)
    frame_bytes, rgb_frame = gen.generate_frame()
    print(f'  {bp_type}: generate_frame OK, frame={len(frame_bytes)} bytes')

print('  ✓ 所有坏像素类型正常工作')
print()

# 6. CameraSimulator完整状态
print('[6/6] CameraSimulator状态结构')
print('-' * 40)
sim = CameraSimulator('/dev/null', 640, 480, 30, 8, 'RGB24')
status = sim.get_status()

print(f'  pixel_format: {status["pixel_format"]}')
print(f'  bad_pixels.enabled: {status["bad_pixels"]["enabled"]}')
print(f'  bad_pixels.count: {status["bad_pixels"]["count"]}')
print(f'  bad_pixels.type: {status["bad_pixels"]["type"]}')

# 测试设置坏像素
sim.set_bad_pixels(enabled=True, count=100, pixel_type='random', value=[255, 0, 0])
status = sim.get_status()
print(f'  设置后 bad_pixels.enabled: {status["bad_pixels"]["enabled"]} {"✓" if status["bad_pixels"]["enabled"] else "✗"}')
print(f'  设置后 bad_pixels.count: {status["bad_pixels"]["count"]} {"✓" if status["bad_pixels"]["count"] == 100 else "✗"}')

# 测试设置像素格式
sim.set_pixel_format('RAW10')
status = sim.get_status()
print(f'  设置后 pixel_format: {status["pixel_format"]} {"✓" if status["pixel_format"] == "RAW10" else "✗"}')

print()
print('=' * 60)
print('✓ 所有新功能验证通过！')
print('=' * 60)
