import numpy as np
from obspy import read, Stream, UTCDateTime
from scipy.signal import correlate
from scipy.cluster.hierarchy import linkage, fcluster
from typing import List, Dict, Tuple, Optional
import io
from collections import defaultdict


class MatchedFilterDetector:
    def __init__(
        self,
        threshold: float = 0.75,
        step: float = 0.1,
        use_adaptive_threshold: bool = True,
        adaptive_threshold_sigma: float = 6.0,
        min_stations: int = 1,
        cluster_max_time_diff: float = 2.0,
    ):
        self.threshold = threshold
        self.step = step
        self.use_adaptive_threshold = use_adaptive_threshold
        self.adaptive_threshold_sigma = adaptive_threshold_sigma
        self.min_stations = min_stations
        self.cluster_max_time_diff = cluster_max_time_diff

    def _normalize(self, data: np.ndarray) -> np.ndarray:
        data = data - np.mean(data)
        std = np.std(data)
        if std > 0:
            data = data / std
        return data

    def _robust_std(self, data: np.ndarray) -> float:
        median = np.median(data)
        mad = np.median(np.abs(data - median))
        return mad * 1.4826

    def _calculate_adaptive_threshold(
        self, corr: np.ndarray, method: str = "mad"
    ) -> float:
        if method == "mad":
            std = self._robust_std(corr)
            mean = np.median(corr)
        else:
            std = np.std(corr)
            mean = np.mean(corr)

        adaptive_thresh = mean + self.adaptive_threshold_sigma * std
        return max(adaptive_thresh, self.threshold)

    def _cross_correlate(self, template: np.ndarray, data: np.ndarray) -> np.ndarray:
        template_norm = self._normalize(template)
        data_norm = self._normalize(data)
        corr = correlate(data_norm, template_norm, mode="valid")
        corr = corr / len(template_norm)
        return corr

    def _find_peaks(
        self, corr: np.ndarray, threshold: float, min_distance: int = 10
    ) -> List[int]:
        peaks = []
        n = len(corr)

        for i in range(1, n - 1):
            if (
                corr[i] > threshold
                and corr[i] > corr[i - 1]
                and corr[i] > corr[i + 1]
            ):
                if len(peaks) == 0 or (i - peaks[-1]) >= min_distance:
                    peaks.append(i)

        return peaks

    def _cluster_detections(
        self, detections: List[Dict], sampling_rate: float
    ) -> List[Dict]:
        if len(detections) <= 1:
            return detections

        times = np.array([det["sample_index"] for det in detections])
        times_reshaped = times.reshape(-1, 1)

        max_time_diff_samples = self.cluster_max_time_diff * sampling_rate
        if len(times) > 1:
            Z = linkage(times_reshaped, method="single")
            clusters = fcluster(Z, t=max_time_diff_samples, criterion="distance")

            clustered = defaultdict(list)
            for i, det in enumerate(detections):
                clustered[clusters[i]].append(det)

            result = []
            for cluster_dets in clustered.values():
                best_det = max(
                    cluster_dets, key=lambda x: x["correlation_coefficient"]
                )
                result.append(best_det)

            return result
        else:
            return detections

    def _multi_station_coincidence(
        self, all_detections: List[Dict], sampling_rate: float
    ) -> List[Dict]:
        if len(all_detections) == 0:
            return []

        station_times = defaultdict(list)
        for det in all_detections:
            station = det["station"]
            time_sec = det["sample_index"] / sampling_rate
            station_times[station].append((time_sec, det))

        if len(station_times) < self.min_stations:
            return all_detections

        all_times_with_det = []
        for det in all_detections:
            time_sec = det["sample_index"] / sampling_rate
            all_times_with_det.append((time_sec, det))

        all_times_with_det.sort(key=lambda x: x[0])

        validated = []
        time_window = self.cluster_max_time_diff

        for i, (time, det) in enumerate(all_times_with_det):
            window_detections = [det]
            for j in range(len(all_times_with_det)):
                if i == j:
                    continue
                t2, det2 = all_times_with_det[j]
                if abs(t2 - time) <= time_window:
                    window_detections.append(det2)

            unique_stations = set(d["station"] for d in window_detections)

            if len(unique_stations) >= self.min_stations:
                best_det = max(
                    window_detections, key=lambda x: x["correlation_coefficient"]
                )
                if not any(
                    np.abs(d["sample_index"] / sampling_rate - best_det["sample_index"] / sampling_rate)
                    < time_window
                    and d["station"] == best_det["station"]
                    for d in validated
                ):
                    validated.append(best_det)

        if len(validated) > 0:
            return validated
        else:
            return all_detections

    def load_template_from_bytes(self, template_bytes: bytes) -> Tuple[Stream, np.ndarray]:
        st = read(io.BytesIO(template_bytes))
        st.merge(fill_value="interpolate")
        return st, st[0].data if len(st) > 0 else np.array([])

    def load_continuous_from_bytes(self, data_bytes: bytes) -> Tuple[Stream, np.ndarray]:
        st = read(io.BytesIO(data_bytes))
        st.merge(fill_value="interpolate")
        return st, st[0].data if len(st) > 0 else np.array([])

    def detect(
        self, template_data: np.ndarray, continuous_data: np.ndarray, sampling_rate: float
    ) -> Tuple[List[Dict], Dict]:
        detections = []
        template_len = len(template_data)
        data_len = len(continuous_data)

        if template_len >= data_len:
            return [], {}

        corr = self._cross_correlate(template_data, continuous_data)

        current_threshold = self.threshold
        if self.use_adaptive_threshold:
            current_threshold = self._calculate_adaptive_threshold(corr)

        min_distance = max(int(template_len * 0.5), int(sampling_rate * 1))
        peaks = self._find_peaks(corr, current_threshold, min_distance)

        for peak_idx in peaks:
            cc_value = float(corr[peak_idx])

            detections.append({
                "sample_index": peak_idx,
                "correlation_coefficient": cc_value,
                "template_length": template_len
            })

        stats = {
            "corr_mean": float(np.mean(corr)),
            "corr_std": float(np.std(corr)),
            "corr_median": float(np.median(corr)),
            "threshold_used": current_threshold,
            "n_peaks_initial": len(peaks),
        }

        return detections, stats

    def detect_stream(
        self, template_stream: Stream, continuous_stream: Stream
    ) -> List[Dict]:
        all_station_detections = []
        station_stats = {}

        template_by_station = defaultdict(list)
        for tr_temp in template_stream:
            station_key = (tr_temp.stats.station, tr_temp.stats.channel)
            template_by_station[station_key].append(tr_temp)

        common_sampling_rate = None
        for tr_cont in continuous_stream:
            station = tr_cont.stats.station
            channel = tr_cont.stats.channel
            sampling_rate = tr_cont.stats.sampling_rate
            common_sampling_rate = sampling_rate

            matching_templates = []
            for (temp_station, temp_channel), templates in template_by_station.items():
                if station == temp_station and channel[-1] == temp_channel[-1]:
                    matching_templates.extend(templates)

            if len(matching_templates) == 0:
                continue

            for tr_temp in matching_templates:
                template_data = tr_temp.data
                continuous_data = tr_cont.data

                detections, stats = self.detect(
                    template_data, continuous_data, sampling_rate
                )

                detections = self._cluster_detections(detections, sampling_rate)

                station_stats[f"{station}_{channel}"] = stats

                for det in detections:
                    time = tr_cont.stats.starttime + det["sample_index"] / sampling_rate
                    all_station_detections.append({
                        "station": station,
                        "channel": channel,
                        "detection_time": str(time),
                        "correlation_coefficient": det["correlation_coefficient"],
                        "sample_index": det["sample_index"],
                        "start_sample": det["sample_index"],
                        "end_sample": det["sample_index"] + det["template_length"],
                        "template_name": tr_temp.stats.get("name", "unknown"),
                        "threshold_used": stats["threshold_used"],
                    })

        if self.min_stations > 1 and common_sampling_rate:
            all_station_detections = self._multi_station_coincidence(
                all_station_detections, common_sampling_rate
            )

        all_station_detections.sort(key=lambda x: x["detection_time"])

        return all_station_detections

    def extract_waveform_segment(
        self, stream: Stream, start_time_str: str, duration: float
    ) -> Optional[Dict]:
        start_time = UTCDateTime(start_time_str)
        end_time = start_time + duration

        st_slice = stream.slice(starttime=start_time, endtime=end_time)

        if len(st_slice) == 0:
            return None

        tr = st_slice[0]
        return {
            "station": tr.stats.station,
            "channel": tr.stats.channel,
            "start_time": str(tr.stats.starttime),
            "end_time": str(tr.stats.endtime),
            "sampling_rate": tr.stats.sampling_rate,
            "data": tr.data.tolist()
        }
