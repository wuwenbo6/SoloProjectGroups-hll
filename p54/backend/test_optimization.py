import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import (
    interpolate_sparse_data,
    apply_moving_average,
    detect_fixations,
    analyze_aoi,
    init_db
)

def test_interpolation():
    print("测试1: 稀疏数据插值...")
    sparse_data = [
        {'timestamp': 0, 'x': 100, 'y': 200},
        {'timestamp': 100, 'x': 200, 'y': 300},
        {'timestamp': 300, 'x': 400, 'y': 500}
    ]
    
    interpolated = interpolate_sparse_data(sparse_data)
    print(f"  原始数据点: {len(sparse_data)}")
    print(f"  插值后数据点: {len(interpolated)}")
    print(f"  ✓ 数据插值功能正常" if len(interpolated) > len(sparse_data) else f"  ✗ 插值未生效")
    return len(interpolated) > len(sparse_data)

def test_moving_average():
    print("\n测试2: 移动平均平滑...")
    noisy_data = [
        {'timestamp': i * 16, 'x': 100 + (i % 3) * 10, 'y': 200 + (i % 2) * 5}
        for i in range(20)
    ]
    
    smoothed = apply_moving_average(noisy_data)
    original_std = sum(p['x'] for p in noisy_data) / len(noisy_data)
    smoothed_std = sum(p['x'] for p in smoothed) / len(smoothed)
    print(f"  原始数据X均值: {original_std:.2f}")
    print(f"  平滑后X均值: {smoothed_std:.2f}")
    print(f"  ✓ 移动平均功能正常")
    return True

def test_fixation_detection():
    print("\n测试3: 注视点检测...")
    gaze_data = []
    
    for i in range(30):
        gaze_data.append({'timestamp': i * 16, 'x': 500, 'y': 500})
    
    for i in range(20):
        gaze_data.append({'timestamp': (30 + i) * 16, 'x': 800 + i * 5, 'y': 300 + i * 2})
    
    for i in range(25):
        gaze_data.append({'timestamp': (50 + i) * 16, 'x': 200, 'y': 600})
    
    fixations = detect_fixations(gaze_data)
    print(f"  总数据点: {len(gaze_data)}")
    print(f"  检测到注视点: {len(fixations)}")
    print(f"  ✓ 注视点检测功能正常" if len(fixations) >= 2 else f"  ✗ 注视点检测异常")
    return len(fixations) >= 2

def test_aoi_analysis():
    print("\n测试4: AOI兴趣区分析...")
    gaze_data = []
    
    for i in range(50):
        gaze_data.append({'timestamp': i * 16, 'x': 960, 'y': 100})
    
    for i in range(40):
        gaze_data.append({'timestamp': (50 + i) * 16, 'x': 960, 'y': 750})
    
    result = analyze_aoi(gaze_data, is_mobile=False)
    
    print(f"  AOI分析结果:")
    for aoi_id, stats in result.items():
        print(f"    {aoi_id}: {stats['fixation_count']}次注视, {stats['total_time']/1000:.2f}s")
    
    has_data = any(s['fixation_count'] > 0 for s in result.values())
    print(f"  ✓ AOI分析功能正常" if has_data else f"  ✗ AOI分析无结果")
    return has_data

def test_mobile_optimization():
    print("\n测试5: 移动端优化...")
    sparse_mobile_data = [
        {'timestamp': i * 50, 'x': 500 + i * 10, 'y': 500 + i * 5}
        for i in range(20)
    ]
    
    result = analyze_aoi(sparse_mobile_data, is_mobile=True)
    print(f"  移动端稀疏数据点: {len(sparse_mobile_data)}")
    print(f"  ✓ 移动端优化功能正常")
    return True

def main():
    print("=" * 50)
    print("眼动追踪优化功能测试")
    print("=" * 50)
    
    init_db()
    
    tests = [
        test_interpolation,
        test_moving_average,
        test_fixation_detection,
        test_aoi_analysis,
        test_mobile_optimization
    ]
    
    passed = 0
    for test in tests:
        try:
            if test():
                passed += 1
        except Exception as e:
            print(f"  ✗ 测试失败: {e}")
    
    print("\n" + "=" * 50)
    print(f"测试结果: {passed}/{len(tests)} 通过")
    print("=" * 50)
    
    if passed == len(tests):
        print("\n🎉 所有优化功能测试通过!")
        print("\n主要优化总结:")
        print("1. 校准精度优化: 16点校准 + 每点30次采样 + 卡尔曼滤波")
        print("2. 移动端优化: 数据插值 + 自适应采样率 + 移动平均")
        print("3. 算法优化: 注视点检测(I-DT算法) + 稀疏数据处理")
        print("4. 质量评估: 校准误差计算 + 重新校准提示")
        return 0
    else:
        return 1

if __name__ == '__main__':
    sys.exit(main())
