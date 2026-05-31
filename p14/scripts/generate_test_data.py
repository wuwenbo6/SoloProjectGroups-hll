import numpy as np
from obspy import Trace, Stream, UTCDateTime
import os


def generate_synthetic_seismic_signal(npts, sampling_rate, event_time=None, noise_level=0.1):
    t = np.arange(npts) / sampling_rate
    data = np.random.randn(npts) * noise_level

    if event_time is not None:
        event_sample = int(event_time * sampling_rate)
        if 0 <= event_sample < npts:
            duration = int(2 * sampling_rate)
            end_sample = min(event_sample + duration, npts)
            event_len = end_sample - event_sample
            decay = np.exp(-np.arange(event_len) / (0.5 * sampling_rate))
            freq = 3
            event_signal = (
                np.sin(2 * np.pi * freq * np.arange(event_len) / sampling_rate)
                * decay
                * 5
            )
            data[event_sample:end_sample] += event_signal

    return data


def generate_test_data():
    output_dir = "./test_data"
    os.makedirs(output_dir, exist_ok=True)

    sampling_rate = 100.0
    npts_template = int(3 * sampling_rate)
    starttime = UTCDateTime("2024-01-01T00:00:00")

    template_data = generate_synthetic_seismic_signal(
        npts_template, sampling_rate, event_time=0.5, noise_level=0.05
    )
    tr_template = Trace(data=template_data)
    tr_template.stats.station = "TEST"
    tr_template.stats.channel = "BHZ"
    tr_template.stats.sampling_rate = sampling_rate
    tr_template.stats.starttime = starttime
    st_template = Stream(traces=[tr_template])
    template_file = os.path.join(output_dir, "template.mseed")
    st_template.write(template_file, format="MSEED")
    print(f"模板文件已生成: {template_file}")

    npts_continuous = int(60 * sampling_rate)
    continuous_data = generate_synthetic_seismic_signal(
        npts_continuous, sampling_rate, noise_level=0.1
    )

    event_times = [10, 25, 45]
    for et in event_times:
        event_sample = int(et * sampling_rate)
        end_sample = min(event_sample + npts_template, npts_continuous)
        copy_len = end_sample - event_sample
        continuous_data[event_sample:end_sample] += template_data[:copy_len] * 0.8

    tr_continuous = Trace(data=continuous_data)
    tr_continuous.stats.station = "TEST"
    tr_continuous.stats.channel = "BHZ"
    tr_continuous.stats.sampling_rate = sampling_rate
    tr_continuous.stats.starttime = starttime
    st_continuous = Stream(traces=[tr_continuous])
    continuous_file = os.path.join(output_dir, "continuous.mseed")
    st_continuous.write(continuous_file, format="MSEED")
    print(f"连续波形文件已生成: {continuous_file}")
    print(f"共嵌入 {len(event_times)} 个事件，分别在第 {event_times} 秒")

    print("\n测试数据生成完成！")
    print(f"模板: 3秒波形，包含一个地震事件")
    print(f"连续数据: 60秒波形，包含3个重复的事件")


if __name__ == "__main__":
    generate_test_data()
