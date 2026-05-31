import sys
sys.path.insert(0, '../backend')

import numpy as np
from obspy import Trace, Stream, UTCDateTime
from matched_filter import MatchedFilterDetector
import os


def generate_test_data_multi_station():
    """生成多台站测试数据"""
    sampling_rate = 100.0
    npts_template = int(3 * sampling_rate)
    starttime = UTCDateTime("2024-01-01T00:00:00")

    t_template = np.arange(npts_template) / sampling_rate
    decay = np.exp(-t_template / 0.5)
    event_signal = np.sin(2 * np.pi * 3 * t_template) * decay * 5
    noise_template = np.random.randn(npts_template) * 0.05
    template_data = event_signal + noise_template

    st_template = Stream()
    stations = ["STA1", "STA2", "STA3"]
    for station in stations:
        tr = Trace(data=template_data.copy())
        tr.stats.station = station
        tr.stats.channel = "BHZ"
        tr.stats.sampling_rate = sampling_rate
        tr.stats.starttime = starttime
        tr.stats.name = f"template_{station}"
        st_template.append(tr)

    npts_continuous = int(60 * sampling_rate)
    event_times = [10, 25, 45]

    st_continuous = Stream()
    for station in stations:
        noise_level = 0.2
        data = np.random.randn(npts_continuous) * noise_level

        for et in event_times:
            event_sample = int(et * sampling_rate)
            end_sample = min(event_sample + npts_template, npts_continuous)
            copy_len = end_sample - event_sample
            station_noise = np.random.randn(copy_len) * 0.05
            data[event_sample:end_sample] += (
                template_data[:copy_len] * (0.7 + np.random.rand() * 0.3) + station_noise
            )

        tr = Trace(data=data)
        tr.stats.station = station
        tr.stats.channel = "BHZ"
        tr.stats.sampling_rate = sampling_rate
        tr.stats.starttime = starttime
        st_continuous.append(tr)

    return st_template, st_continuous, event_times


def test_adaptive_threshold():
    """测试自适应阈值在强噪声下的表现"""
    print("=" * 60)
    print("测试1: 自适应阈值 vs 固定阈值 (强噪声场景)")
    print("=" * 60)

    sampling_rate = 100.0
    npts_template = int(3 * sampling_rate)
    npts_continuous = int(60 * sampling_rate)
    starttime = UTCDateTime("2024-01-01T00:00:00")

    t = np.arange(npts_template) / sampling_rate
    decay = np.exp(-t / 0.5)
    template_data = np.sin(2 * np.pi * 3 * t) * decay * 5 + np.random.randn(npts_template) * 0.05

    tr_template = Trace(data=template_data)
    tr_template.stats.station = "TEST"
    tr_template.stats.channel = "BHZ"
    tr_template.stats.sampling_rate = sampling_rate
    tr_template.stats.starttime = starttime
    st_template = Stream(traces=[tr_template])

    high_noise_data = np.random.randn(npts_continuous) * 0.5
    event_times = [10, 25, 45]
    for et in event_times:
        event_sample = int(et * sampling_rate)
        end_sample = min(event_sample + npts_template, npts_continuous)
        copy_len = end_sample - event_sample
        high_noise_data[event_sample:end_sample] += template_data[:copy_len] * 0.8

    tr_cont = Trace(data=high_noise_data)
    tr_cont.stats.station = "TEST"
    tr_cont.stats.channel = "BHZ"
    tr_cont.stats.sampling_rate = sampling_rate
    tr_cont.stats.starttime = starttime
    st_continuous = Stream(traces=[tr_cont])

    print("\n--- 固定阈值 (0.75) ---")
    detector_fixed = MatchedFilterDetector(
        threshold=0.75,
        use_adaptive_threshold=False,
    )
    detections_fixed = detector_fixed.detect_stream(st_template, st_continuous)
    print(f"检测到事件数: {len(detections_fixed)}")
    for det in detections_fixed:
        print(f"  时间: {det['detection_time'].split('T')[1][:8]}, CC: {det['correlation_coefficient']:.3f}")

    print("\n--- 自适应阈值 (MAD + 6σ) ---")
    detector_adaptive = MatchedFilterDetector(
        threshold=0.75,
        use_adaptive_threshold=True,
        adaptive_threshold_sigma=6.0,
    )
    detections_adaptive = detector_adaptive.detect_stream(st_template, st_continuous)
    print(f"检测到事件数: {len(detections_adaptive)}")
    for det in detections_adaptive:
        print(f"  时间: {det['detection_time'].split('T')[1][:8]}, CC: {det['correlation_coefficient']:.3f}, 阈值: {det['threshold_used']:.3f}")

    print(f"\n期望事件: {len(event_times)} 个")
    print(f"固定阈值检测率: {len(detections_fixed)/len(event_times)*100:.1f}%")
    print(f"自适应阈值检测率: {len(detections_adaptive)/len(event_times)*100:.1f}%")

    return detections_fixed, detections_adaptive


def test_multi_station_coincidence():
    """测试多台站联合验证"""
    print("\n" + "=" * 60)
    print("测试2: 多台站联合验证")
    print("=" * 60)

    st_template, st_continuous, event_times = generate_test_data_multi_station()

    print(f"\n台站数: {len(set(tr.stats.station for tr in st_continuous))}")
    print(f"期望事件: {len(event_times)} 个")

    print("\n--- 单台站检测 (min_stations=1) ---")
    detector_single = MatchedFilterDetector(
        threshold=0.7,
        use_adaptive_threshold=True,
        adaptive_threshold_sigma=5.0,
        min_stations=1,
    )
    detections_single = detector_single.detect_stream(st_template, st_continuous)
    print(f"检测到事件数: {len(detections_single)}")
    station_counts = {}
    for det in detections_single:
        station_counts[det['station']] = station_counts.get(det['station'], 0) + 1
    for station, count in station_counts.items():
        print(f"  {station}: {count} 个事件")

    print("\n--- 多台站联合验证 (min_stations=2) ---")
    detector_multi = MatchedFilterDetector(
        threshold=0.7,
        use_adaptive_threshold=True,
        adaptive_threshold_sigma=5.0,
        min_stations=2,
    )
    detections_multi = detector_multi.detect_stream(st_template, st_continuous)
    print(f"检测到事件数: {len(detections_multi)}")
    for det in detections_multi:
        print(f"  台站: {det['station']}, 时间: {det['detection_time'].split('T')[1][:8]}, CC: {det['correlation_coefficient']:.3f}")

    print(f"\n多台站验证后保留: {len(detections_multi)} 个事件")
    print(f"假阳性可能减少: {len(detections_single) - len(detections_multi)} 个")

    return detections_single, detections_multi


def test_clustering():
    """测试检测聚类功能"""
    print("\n" + "=" * 60)
    print("测试3: 检测结果聚类 (避免重复检测)")
    print("=" * 60)

    sampling_rate = 100.0
    npts_template = int(3 * sampling_rate)
    npts_continuous = int(60 * sampling_rate)
    starttime = UTCDateTime("2024-01-01T00:00:00")

    t = np.arange(npts_template) / sampling_rate
    decay = np.exp(-t / 0.5)
    template_data = np.sin(2 * np.pi * 3 * t) * decay * 5 + np.random.randn(npts_template) * 0.05

    tr_template = Trace(data=template_data)
    tr_template.stats.station = "TEST"
    tr_template.stats.channel = "BHZ"
    tr_template.stats.sampling_rate = sampling_rate
    tr_template.stats.starttime = starttime
    st_template = Stream(traces=[tr_template])

    data = np.random.randn(npts_continuous) * 0.1
    event_sample = int(10 * sampling_rate)
    for offset in [-50, 0, 50]:
        start = event_sample + offset
        end = min(start + npts_template, npts_continuous)
        data[start:end] += template_data[:end - start] * 0.9

    tr_cont = Trace(data=data)
    tr_cont.stats.station = "TEST"
    tr_cont.stats.channel = "BHZ"
    tr_cont.stats.sampling_rate = sampling_rate
    tr_cont.stats.starttime = starttime
    st_continuous = Stream(traces=[tr_cont])

    print("\n--- 无聚类 (cluster_time_window=0) ---")
    detector_no_cluster = MatchedFilterDetector(
        threshold=0.7,
        use_adaptive_threshold=False,
        cluster_max_time_diff=0.01,
    )
    detections_no_cluster = detector_no_cluster.detect_stream(st_template, st_continuous)
    print(f"检测到事件数: {len(detections_no_cluster)}")
    for det in detections_no_cluster:
        print(f"  时间: {det['detection_time'].split('T')[1][:8]}, CC: {det['correlation_coefficient']:.3f}")

    print("\n--- 启用聚类 (cluster_time_window=2秒) ---")
    detector_with_cluster = MatchedFilterDetector(
        threshold=0.7,
        use_adaptive_threshold=False,
        cluster_max_time_diff=2.0,
    )
    detections_with_cluster = detector_with_cluster.detect_stream(st_template, st_continuous)
    print(f"检测到事件数: {len(detections_with_cluster)}")
    for det in detections_with_cluster:
        print(f"  时间: {det['detection_time'].split('T')[1][:8]}, CC: {det['correlation_coefficient']:.3f}")

    print(f"\n聚类后减少: {len(detections_no_cluster) - len(detections_with_cluster)} 个重复检测")

    return detections_no_cluster, detections_with_cluster


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    test_adaptive_threshold()
    test_multi_station_coincidence()
    test_clustering()

    print("\n" + "=" * 60)
    print("所有测试完成!")
    print("=" * 60)
