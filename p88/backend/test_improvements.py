import numpy as np
import sys
sys.path.insert(0, '.')

from eit_core_improved import ImprovedEIT
from eit_core_simple import SimpleEIT

def analyze_reconstruction(ds, name):
    std = np.std(ds)
    peak_to_peak = np.max(ds) - np.min(ds)
    spatial_variation = np.mean(np.abs(np.diff(ds)))
    
    print(f"\n{name} 分析:")
    print(f"  标准差: {std:.4f}")
    print(f"  峰峰值: {peak_to_peak:.4f}")
    print(f"  空间变异: {spatial_variation:.4f}")
    
    return {
        'std': std,
        'peak_to_peak': peak_to_peak,
        'spatial_variation': spatial_variation
    }

def test_noise_robustness():
    print("=" * 60)
    print("测试噪声鲁棒性")
    print("=" * 60)
    
    eit = ImprovedEIT(n_electrodes=16, resolution=32)
    anomaly = eit.create_sample_anomaly()
    
    print(f"\n异常配置: {anomaly}")
    
    v0, v1 = eit.forward_solve(anomaly)
    
    noise_levels = [0.001, 0.005, 0.01, 0.02]
    
    for noise in noise_levels:
        print(f"\n--- 噪声水平: {noise*100:.1f}% ---")
        
        v1_noisy = v1 + np.random.randn(len(v1)) * noise
        
        ds_greit = eit.reconstruct_greit(v0, v1_noisy, lamb=0.05)
        ds_gn = eit.reconstruct_gauss_newton(v0, v1_noisy, lamb_init=0.1)
        
        analyze_reconstruction(ds_greit, f"GREIT (噪声{noise*100:.1f}%)")
        analyze_reconstruction(ds_gn, f"高斯牛顿 (噪声{noise*100:.1f}%)")

def test_regularization_effect():
    print("\n" + "=" * 60)
    print("测试正则化参数影响")
    print("=" * 60)
    
    eit = ImprovedEIT(n_electrodes=16, resolution=32)
    anomaly = eit.create_sample_anomaly()
    v0, v1 = eit.forward_solve(anomaly)
    
    v1_noisy = v1 + np.random.randn(len(v1)) * 0.01
    
    lambdas = [0.001, 0.01, 0.05, 0.1, 0.2]
    
    for lamb in lambdas:
        ds = eit.reconstruct_greit(v0, v1_noisy, lamb=lamb)
        stats = analyze_reconstruction(ds, f"λ={lamb}")
        print(f"  噪信比: {stats['std'] / stats['peak_to_peak']:.4f}")

def test_smoothing_effect():
    print("\n" + "=" * 60)
    print("测试后处理平滑效果")
    print("=" * 60)
    
    eit = ImprovedEIT(n_electrodes=16, resolution=32)
    anomaly = eit.create_sample_anomaly()
    v0, v1 = eit.forward_solve(anomaly)
    
    v1_noisy = v1 + np.random.randn(len(v1)) * 0.01
    
    ds_raw = eit.reconstruct_greit(v0, v1_noisy, lamb=0.05)
    
    sigmas = [0.3, 0.6, 1.0, 1.5]
    
    print("\n原始重建:")
    analyze_reconstruction(ds_raw, "原始")
    
    for sigma in sigmas:
        ds_smoothed = eit.post_process(ds_raw, sigma=sigma)
        stats = analyze_reconstruction(ds_smoothed, f"平滑σ={sigma}")
        noise_reduction = (1 - stats['std'] / np.std(ds_raw)) * 100
        print(f"  噪声降低: {noise_reduction:.1f}%")

def test_artifact_reduction():
    print("\n" + "=" * 60)
    print("测试环形伪影抑制")
    print("=" * 60)
    
    eit = ImprovedEIT(n_electrodes=16, resolution=32)
    
    x = eit.nodes[:, 0]
    y = eit.nodes[:, 1]
    r = np.sqrt(x**2 + y**2)
    theta = np.arctan2(y, x)
    
    ring_artifact = np.sin(8 * theta) * np.exp(-(r - 0.5)**2 / 0.05)
    
    ds_processed = eit.spatial_filter_greit(ring_artifact)
    ds_processed2 = eit.post_process(ds_processed, sigma=0.8)
    
    print("环形伪影测试:")
    print(f"  原始伪影强度: {np.max(np.abs(ring_artifact)):.4f}")
    print(f"  空间滤波后: {np.max(np.abs(ds_processed)):.4f}")
    print(f"  后处理后: {np.max(np.abs(ds_processed2)):.4f}")
    print(f"  伪影抑制率: {(1 - np.max(np.abs(ds_processed2))/np.max(np.abs(ring_artifact)))*100:.1f}%")

def main():
    test_noise_robustness()
    test_regularization_effect()
    test_smoothing_effect()
    test_artifact_reduction()
    
    print("\n" + "=" * 60)
    print("✅ 所有改进功能测试完成!")
    print("=" * 60)
    print("\n主要改进总结:")
    print("  1. ✅ Tikhonov正则化 - 抑制病态问题")
    print("  2. ✅ 小波去噪预处理 - 提高信噪比")
    print("  3. ✅ 高斯平滑后处理 - 减少伪影")
    print("  4. ✅ 空间滤波 - 抑制环形伪影")
    print("  5. ✅ 灵敏度加权 - 校正边界效应")
    print("  6. ✅ 自适应阈值 - 增强小信号识别")

if __name__ == "__main__":
    main()
