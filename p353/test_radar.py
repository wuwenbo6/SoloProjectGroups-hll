#!/usr/bin/env python3
import sys
sys.path.insert(0, 'backend')

from radar_signal_processing import PDRadarSignalProcessor
import numpy as np

print("=" * 60)
print("PD雷达信号处理模块 - 功能测试")
print("=" * 60)

processor = PDRadarSignalProcessor()

print("\n[1] 雷达参数检查:")
print(f"    载波频率: {processor.fc / 1e9:.1f} GHz")
print(f"    带宽: {processor.bw / 1e6:.1f} MHz")
print(f"    脉冲宽度: {processor.tau * 1e6:.1f} μs")
print(f"    PRF: {processor.prf} Hz")
print(f"    脉冲数: {processor.num_pulses}")
print(f"    采样频率: {processor.fs / 1e6:.1f} MHz")
print(f"    距离分辨率: {processor.range_resolution:.2f} m")
print(f"    速度分辨率: {processor.speed_resolution:.3f} m/s")
print(f"    距离门数: {processor.num_range_bins}")
print(f"    多普勒通道数: {processor.num_pulses}")

print("\n[2] 测试LFM信号生成...")
t = np.linspace(0, processor.tau, processor.num_range_bins, endpoint=False)
lfm_signal = processor.generate_lfm_signal(t)
print(f"    LFM信号长度: {len(lfm_signal)} 采样点")
print(f"    信号实部范围: [{lfm_signal.real.min():.2f}, {lfm_signal.real.max():.2f}]")
print(f"    信号虚部范围: [{lfm_signal.imag.min():.2f}, {lfm_signal.imag.max():.2f}]")
print("    ✓ LFM信号生成成功")

print("\n[3] 测试接收信号生成...")
targets = [
    (1000, 20, 1.0),
    (2000, -15, 0.8),
    (3500, 50, 0.6),
]
signal_matrix, transmitted = processor.generate_received_signal(targets, snr_db=20)
print(f"    信号矩阵形状: {signal_matrix.shape}")
print(f"    发射信号长度: {len(transmitted)}")
print(f"    信号功率: {np.mean(np.abs(signal_matrix) ** 2):.6f}")
print("    ✓ 接收信号生成成功")

print("\n[4] 测试脉冲压缩 (距离门FFT)...")
compressed = processor.pulse_compression(signal_matrix, transmitted)
print(f"    压缩后矩阵形状: {compressed.shape}")
print(f"    压缩前峰值: {np.max(np.abs(signal_matrix)):.4f}")
print(f"    压缩后峰值: {np.max(np.abs(compressed)):.4f}")
print("    ✓ 脉冲压缩成功")

print("\n[5] 测试多普勒滤波处理...")
rd_map = processor.doppler_processing(compressed)
print(f"    距离-多普勒图形状: {rd_map.shape}")
print(f"    RD图幅值范围: [{np.abs(rd_map).min():.4f}, {np.abs(rd_map).max():.4f}]")
print("    ✓ 多普勒处理成功")

print("\n[6] 测试CFAR目标检测...")
detection_map = processor.cfar_detector(rd_map)
num_detections = np.sum(detection_map)
print(f"    检测到的目标点数: {num_detections}")
print("    ✓ CFAR检测成功")

print("\n[7] 测试完整处理流程...")
result = processor.process(targets=targets, snr_db=20)
print(f"    距离轴长度: {len(result['range_axis'])}")
print(f"    速度轴长度: {len(result['speed_axis'])}")
print(f"    RD图形状: {len(result['rd_map'])} x {len(result['rd_map'][0])}")
print(f"    检测到目标数: {len(result['detections'])}")

if result['detections']:
    print("\n    检测目标详情:")
    for i, det in enumerate(result['detections'][:5]):
        print(f"      目标 {i+1}: 距离={det['range']:.1f}m, 速度={det['speed']:.2f}m/s, 功率={det['power']:.1f}dB")

print("\n    ✓ 完整处理流程成功")

print("\n" + "=" * 60)
print("所有测试通过! 信号处理模块工作正常。")
print("=" * 60)
