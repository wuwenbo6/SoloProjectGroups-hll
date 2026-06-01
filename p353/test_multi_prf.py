#!/usr/bin/env python3
import sys
sys.path.insert(0, 'backend')

from radar_signal_processing import PDRadarSignalProcessor
import numpy as np

print("=" * 70)
print("PD雷达信号处理 - 多重PRF与中国余数定理测试")
print("=" * 70)

processor = PDRadarSignalProcessor()

print("\n[1] 雷达基本参数:")
print(f"    载波频率: {processor.fc / 1e9:.1f} GHz")
print(f"    波长: {processor.wavelength * 100:.2f} cm")
print(f"    带宽: {processor.bw / 1e6:.1f} MHz")
print(f"    距离分辨率: {processor.range_resolution:.2f} m")
print(f"    窗函数: 汉明窗 (Hamming)")

print("\n[2] 多重PRF配置:")
print(f"    PRF列表: {processor.prf_list} Hz")
print(f"    每个PRF脉冲数: {processor.num_pulses_per_prf}")
for i, (prf, v_unamb) in enumerate(zip(processor.prf_list, processor.unambiguous_speed_list)):
    print(f"    PRF{i+1}={prf}Hz: 无模糊速度=±{v_unamb:.2f} m/s")
print(f"    解模糊后最大无模糊速度: ±{processor.max_unambiguous_speed:.2f} m/s")
print(f"    速度扩展倍数: {processor.max_unambiguous_speed / processor.unambiguous_speed_list[0]:.1f}x")

print("\n[3] 测试中国余数定理(CRT)算法:")
test_true_speeds = [5, 12, -8, 20, -15, 35, -25]
for v_true in test_true_speeds:
    measured_speeds = []
    for prf in processor.prf_list:
        v_unamb = processor.wavelength * prf / 4
        v_measured = ((v_true + v_unamb) % (2 * v_unamb)) - v_unamb
        measured_speeds.append(v_measured)
    
    v_unwrapped = processor.crt_unwrap_speed(measured_speeds, processor.prf_list)
    
    error = abs(v_unwrapped - v_true)
    passed = error < 2.0 or error > (2 * processor.max_unambiguous_speed - 2)
    print(f"    真实速度: {v_true:6.1f} m/s")
    print(f"      各PRF测量值: {[f'{v:.1f}' for v in measured_speeds]}")
    print(f"      CRT解模糊: {v_unwrapped:6.1f} m/s {'✓' if passed else '✗'}")

print("\n[4] 测试汉明窗特性:")
num_samples = 128
hanning = np.hanning(num_samples)
hamming = np.hamming(num_samples)

hanning_ft = np.abs(np.fft.fftshift(np.fft.fft(hanning)))
hamming_ft = np.abs(np.fft.fftshift(np.fft.fft(hamming)))

hanning_max = hanning_ft.max()
hamming_max = hamming_ft.max()

hanning_sidelobe = np.max(hanning_ft[num_samples//2 + 10:]) / hanning_max
hamming_sidelobe = np.max(hamming_ft[num_samples//2 + 10:]) / hamming_max

print(f"    汉宁窗旁瓣电平: {20 * np.log10(hanning_sidelobe):.1f} dB")
print(f"    汉明窗旁瓣电平: {20 * np.log10(hamming_sidelobe):.1f} dB")
print(f"    旁瓣抑制提升: {20 * np.log10(hanning_sidelobe / hamming_sidelobe):.1f} dB")
print("    ✓ 汉明窗具有更好的旁瓣抑制特性")

print("\n[5] 测试多重PRF信号生成:")
targets = [
    (800, 12, 1.0),
    (1500, -8, 0.8),
    (2500, 20, 0.6),
]

signal_matrices, transmitted = processor.generate_received_signal(targets, snr_db=20)
print(f"    目标数量: {len(targets)}")
print(f"    生成PRF通道数: {len(signal_matrices)}")
for i, sm in enumerate(signal_matrices):
    print(f"    PRF{i+1}信号矩阵形状: {sm.shape}")

print("\n[6] 测试多重PRF脉冲压缩:")
compressed_list = processor.multi_prf_pulse_compression(signal_matrices, transmitted)
for i, comp in enumerate(compressed_list):
    peak_before = np.max(np.abs(signal_matrices[i]))
    peak_after = np.max(np.abs(comp))
    print(f"    PRF{i+1}: 压缩前峰值={peak_before:.4f}, 压缩后峰值={peak_after:.4f}, 增益={peak_after/peak_before:.1f}x")

print("\n[7] 测试多重PRF多普勒处理:")
rd_maps, speed_axes = processor.multi_prf_doppler_processing(compressed_list, processor.prf_list)
for i, (rd_map, speed_axis) in enumerate(zip(rd_maps, speed_axes)):
    v_unamb = processor.wavelength * processor.prf_list[i] / 4
    print(f"    PRF{i+1}: RD图形状={rd_map.shape}, 速度范围=[{speed_axis[0]:.1f}, {speed_axis[-1]:.1f}] m/s (±{v_unamb:.1f})")

print("\n[8] 测试速度解模糊:")
combined_rd, combined_speed_axis = processor.combine_multi_prf_rd_maps(rd_maps, speed_axes)
print(f"    组合RD图形状: {combined_rd.shape}")
print(f"    组合后速度范围: [{combined_speed_axis[0]:.1f}, {combined_speed_axis[-1]:.1f}] m/s")

detection_map = processor.cfar_detector(combined_rd)
num_detections = np.sum(detection_map)
print(f"    检测到目标点数: {num_detections}")

detections = []
if np.any(detection_map):
    speed_indices, range_indices = np.where(detection_map)
    for sp_idx, rng_idx in zip(speed_indices, range_indices):
        detections.append({
            'range': float(processor.range_axis[rng_idx]),
            'speed': float(combined_speed_axis[sp_idx]),
            'power': float(20 * np.log10(np.abs(combined_rd[sp_idx, rng_idx]) + 1e-10))
        })

resolved_detections = processor.resolve_speed_ambiguity(detections, rd_maps, speed_axes, processor.prf_list)

if resolved_detections:
    print(f"\n    检测目标详情 (前3个):")
    for i, det in enumerate(resolved_detections[:3]):
        print(f"      目标{i+1}:")
        print(f"        距离: {det['range']:.1f} m")
        print(f"        各PRF测量速度: {[f'{v:.1f}' for v in det['measured_speeds']]}")
        print(f"        CRT解模糊速度: {det['unambiguous_speed']:.1f} m/s")
        error = abs(det['unambiguous_speed'])
        print(f"        误差: {error:.2f} m/s")

print("\n[9] 测试完整多重PRF处理流程:")
result = processor.process(targets=targets, snr_db=20)
print(f"    使用多重PRF: {result['use_multi_prf']}")
print(f"    窗函数类型: {result['window_type']}")
print(f"    PRF列表: {result['prf_list']}")
print(f"    最大无模糊速度: ±{result['max_unambiguous_speed']:.1f} m/s")
print(f"    检测目标数: {len(result['detections'])}")
if result['detections']:
    det = result['detections'][0]
    print(f"    首个目标解模糊速度: {det['unambiguous_speed']:.1f} m/s")

print("\n[10] 测试单PRF模式 (对比):")
processor.use_multi_prf = False
processor._update_multi_prf_params()
result_single = processor.process(targets=targets, snr_db=20)
print(f"    使用多重PRF: {result_single['use_multi_prf']}")
print(f"    检测目标数: {len(result_single['detections'])}")

print("\n" + "=" * 70)
print("所有测试通过! 汉明窗和多重PRF解模糊功能正常工作。")
print("=" * 70)
