import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
from scipy import interpolate


@dataclass
class Signal:
    name: str
    start_bit: int
    bit_length: int
    is_signed: bool = False
    is_big_endian: bool = False
    scale: float = 1.0
    offset: float = 0.0
    unit: str = ""
    values: List[float] = None
    timestamps: List[float] = None
    confidence: float = 0.0

    def __post_init__(self):
        if self.values is None:
            self.values = []
        if self.timestamps is None:
            self.timestamps = []


@dataclass
class CANFrameAnalysis:
    can_id: int
    signals: List[Signal]
    raw_messages: List[Dict] = None
    aligned_timestamps: List[float] = None
    period_ms: float = 0.0


class SignalAnalyzer:
    def __init__(self, n_clusters_range: Tuple[int, int] = (2, 8), enable_alignment: bool = True):
        self.n_clusters_range = n_clusters_range
        self.enable_alignment = enable_alignment

    def analyze_messages(self, messages: List[Dict]) -> Dict[int, CANFrameAnalysis]:
        frames_by_id = self._group_messages_by_id(messages)
        results = {}

        for can_id, frame_messages in frames_by_id.items():
            analysis = self._analyze_single_frame(frame_messages)
            results[can_id] = analysis

        return results

    def _group_messages_by_id(self, messages: List[Dict]) -> Dict[int, List[Dict]]:
        frames_by_id = {}
        for msg in messages:
            can_id = msg['can_id']
            if can_id not in frames_by_id:
                frames_by_id[can_id] = []
            frames_by_id[can_id].append(msg)
        return frames_by_id

    def _analyze_single_frame(self, messages: List[Dict]) -> CANFrameAnalysis:
        if len(messages) < 5:
            return CANFrameAnalysis(
                can_id=messages[0]['can_id'] if messages else 0,
                signals=[],
                raw_messages=messages
            )

        timestamps = [msg['timestamp'] for msg in messages]
        period_ms = self._estimate_period(timestamps)
        
        aligned_messages = messages
        if self.enable_alignment and period_ms > 0:
            aligned_messages = self._align_messages_by_timestamp(messages, period_ms)

        bit_changes = self._compute_bit_change_rates(aligned_messages)
        bit_edges = self._find_signal_edges(bit_changes)
        
        signals = []
        for i, (start, end) in enumerate(bit_edges):
            bit_length = end - start + 1
            if bit_length < 1 or bit_length > 64:
                continue

            values, signal_timestamps = self._extract_signal_values_with_timestamps(
                aligned_messages, start, bit_length
            )
            
            aligned_values = values
            if self.enable_alignment and len(values) > 3:
                aligned_values = self._interpolate_signal_values(
                    values, signal_timestamps, period_ms
                )
            
            confidence = self._calculate_signal_confidence(values, bit_changes, start, end)

            signal = Signal(
                name=f"Signal_{i+1}",
                start_bit=start,
                bit_length=bit_length,
                values=aligned_values,
                timestamps=signal_timestamps,
                confidence=confidence
            )
            signals.append(signal)

        return CANFrameAnalysis(
            can_id=messages[0]['can_id'],
            signals=signals,
            raw_messages=aligned_messages,
            period_ms=period_ms,
            aligned_timestamps=[msg['timestamp'] for msg in aligned_messages]
        )
    
    def _estimate_period(self, timestamps: List[float]) -> float:
        if len(timestamps) < 2:
            return 0.0
        
        intervals = np.diff(timestamps)
        intervals = intervals[intervals > 0]
        
        if len(intervals) == 0:
            return 0.0
        
        median_interval = np.median(intervals)
        return median_interval * 1000.0
    
    def _align_messages_by_timestamp(self, messages: List[Dict], period_ms: float) -> List[Dict]:
        if len(messages) < 2 or period_ms <= 0:
            return messages
        
        period_s = period_ms / 1000.0
        base_time = messages[0]['timestamp']
        
        aligned = []
        expected_time = base_time
        
        for i, msg in enumerate(messages):
            msg_time = msg['timestamp']
            
            while expected_time + period_s / 2 < msg_time and len(aligned) < len(messages):
                aligned.append({
                    'timestamp': expected_time,
                    'can_id': msg['can_id'],
                    'data': aligned[-1]['data'].copy() if aligned else msg['data'].copy(),
                    'dlc': msg['dlc'],
                    '_interpolated': True
                })
                expected_time += period_s
            
            aligned.append(msg.copy())
            expected_time = msg_time + period_s
        
        return aligned
    
    def _interpolate_signal_values(self, values: List[float], timestamps: List[float], 
                                    period_ms: float) -> List[float]:
        if len(values) < 4 or len(timestamps) < 4:
            return values
        
        try:
            values_arr = np.array(values, dtype=float)
            times_arr = np.array(timestamps, dtype=float)
            
            period_s = period_ms / 1000.0
            if period_s <= 0:
                return values
            
            start_time = times_arr[0]
            end_time = times_arr[-1]
            
            if end_time <= start_time:
                return values
            
            num_points = int((end_time - start_time) / period_s) + 1
            if num_points < 2:
                return values
            
            new_times = np.linspace(start_time, end_time, num_points)
            
            valid_mask = ~np.isnan(values_arr) & ~np.isinf(values_arr)
            if np.sum(valid_mask) < 4:
                return values
            
            f = interpolate.interp1d(
                times_arr[valid_mask], values_arr[valid_mask],
                kind='linear', bounds_error=False, fill_value='extrapolate'
            )
            interpolated = f(new_times)
            
            return list(interpolated)
            
        except Exception as e:
            return values
    
    def _extract_signal_values_with_timestamps(self, messages: List[Dict], 
                                                 start_bit: int, bit_length: int
                                                 ) -> Tuple[List[float], List[float]]:
        values = []
        timestamps = []
        for msg in messages:
            value = self._extract_value(msg['data'], start_bit, bit_length)
            values.append(value)
            timestamps.append(msg['timestamp'])
        return values, timestamps

    def _compute_bit_change_rates(self, messages: List[Dict]) -> np.ndarray:
        max_bytes = 8
        bit_changes = np.zeros(max_bytes * 8, dtype=float)
        
        if len(messages) < 2:
            return bit_changes

        prev_bits = None
        change_count = 0

        for msg in messages:
            data = msg['data']
            bits = self._data_to_bits(data, max_bytes)
            
            if prev_bits is not None:
                changes = np.bitwise_xor(prev_bits, bits)
                bit_changes += changes
                change_count += 1
            
            prev_bits = bits

        if change_count > 0:
            bit_changes /= change_count

        return bit_changes

    def _data_to_bits(self, data: List[int], max_bytes: int) -> np.ndarray:
        bits = np.zeros(max_bytes * 8, dtype=int)
        for byte_idx, byte_val in enumerate(data[:max_bytes]):
            for bit_idx in range(8):
                if byte_val & (1 << bit_idx):
                    bits[byte_idx * 8 + bit_idx] = 1
        return bits

    def _find_signal_edges(self, bit_changes: np.ndarray) -> List[Tuple[int, int]]:
        features = self._prepare_clustering_features(bit_changes)
        
        if len(features) < 2:
            return [(0, 63)]

        best_k = self._find_optimal_k(features)
        kmeans = KMeans(n_clusters=best_k, random_state=42, n_init=10)
        labels = kmeans.fit_predict(features)

        segments = self._labels_to_segments(labels)
        return segments

    def _prepare_clustering_features(self, bit_changes: np.ndarray) -> np.ndarray:
        n_bits = len(bit_changes)
        features = np.zeros((n_bits, 3))
        
        for i in range(n_bits):
            features[i, 0] = bit_changes[i]
            features[i, 1] = i / 64.0
            if i > 0:
                features[i, 2] = abs(bit_changes[i] - bit_changes[i-1])
        
        scaler = StandardScaler()
        return scaler.fit_transform(features)

    def _find_optimal_k(self, features: np.ndarray) -> int:
        min_k, max_k = self.n_clusters_range
        max_k = min(max_k, len(features) // 4)
        
        if max_k <= min_k:
            return min_k

        inertias = []
        for k in range(min_k, max_k + 1):
            kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
            kmeans.fit(features)
            inertias.append(kmeans.inertia_)

        if len(inertias) < 3:
            return min_k

        deltas = np.diff(inertias)
        delta_deltas = np.diff(deltas)
        
        elbow_idx = np.argmax(delta_deltas) if len(delta_deltas) > 0 else 0
        best_k = min_k + elbow_idx + 1

        return max(min_k, min(best_k, max_k))

    def _labels_to_segments(self, labels: np.ndarray) -> List[Tuple[int, int]]:
        segments = []
        start = 0
        
        for i in range(1, len(labels)):
            if labels[i] != labels[i-1]:
                segments.append((start, i - 1))
                start = i
        
        segments.append((start, len(labels) - 1))
        
        merged = []
        for start, end in segments:
            if end - start + 1 > 0:
                merged.append((start, end))
        
        return merged

    def _extract_signal_values(self, messages: List[Dict], start_bit: int, bit_length: int) -> List[float]:
        values = []
        for msg in messages:
            value = self._extract_value(msg['data'], start_bit, bit_length)
            values.append(value)
        return values

    def _extract_value(self, data: List[int], start_bit: int, bit_length: int) -> float:
        value = 0
        for i in range(bit_length):
            bit_pos = start_bit + i
            byte_idx = bit_pos // 8
            bit_idx = bit_pos % 8
            
            if byte_idx < len(data):
                if data[byte_idx] & (1 << bit_idx):
                    value |= (1 << i)
        
        return float(value)

    def _calculate_signal_confidence(self, values: List[float], bit_changes: np.ndarray, start: int, end: int) -> float:
        if len(values) < 2:
            return 0.0

        signal_bit_changes = bit_changes[start:end+1]
        avg_change_rate = np.mean(signal_bit_changes)

        values_arr = np.array(values)
        unique_ratio = len(np.unique(values_arr)) / len(values_arr)

        variance = np.var(values_arr) if len(values_arr) > 1 else 0
        variance_norm = min(1.0, variance / 1000.0)

        confidence = 0.4 * avg_change_rate + 0.3 * unique_ratio + 0.3 * variance_norm
        return min(1.0, confidence)


if __name__ == '__main__':
    from can_capture import CANCapture
    import time

    capture = CANCapture(use_virtual=True)
    capture.start()
    time.sleep(3)
    capture.stop()

    messages = capture.get_messages(1000)
    print(f"Analyzing {len(messages)} messages...")

    analyzer = SignalAnalyzer()
    results = analyzer.analyze_messages(messages)

    for can_id, analysis in results.items():
        print(f"\nCAN ID: 0x{can_id:03X} ({len(analysis.raw_messages)} messages)")
        for signal in analysis.signals:
            print(f"  {signal.name}: bit {signal.start_bit}-{signal.start_bit+signal.bit_length-1}, "
                  f"len={signal.bit_length}, confidence={signal.confidence:.2f}")
