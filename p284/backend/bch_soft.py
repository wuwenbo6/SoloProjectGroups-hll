import numpy as np
from bitarray import bitarray
from typing import List, Dict, Tuple, Optional
import math
import csv
import io
import json
from dataclasses import dataclass, asdict, field
from datetime import datetime


class BCHSoftDecisionDecoder:
    def __init__(self, n: int = 63, k: int = 51, t: int = 2,
                 chase_depth: int = 4):
        self.n = n
        self.k = k
        self.t = t
        self.chase_depth = chase_depth
        self.gen_poly = self._build_gen_poly()

    def _build_gen_poly(self):
        return [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]

    def encode(self, data: bitarray) -> bitarray:
        if len(data) != self.k:
            raise ValueError(f"Data must be {self.k} bits long")
        codeword = bitarray([False] * self.n)
        for i in range(self.k):
            codeword[i] = data[i]
        for i in range(self.k):
            if codeword[i]:
                for j in range(len(self.gen_poly)):
                    if i + j < self.n:
                        codeword[i + j] ^= bool(self.gen_poly[j])
        for i in range(self.k):
            codeword[i] = data[i]
        return codeword

    def _hard_decode(self, received: bitarray) -> Tuple[bitarray, int, bool]:
        r = bitarray(received)
        for i in range(self.k):
            if r[i]:
                for j in range(len(self.gen_poly)):
                    if i + j < self.n:
                        r[i + j] ^= bool(self.gen_poly[j])
        syndrome_weight = sum(1 for b in r[self.k:] if b)
        if syndrome_weight == 0:
            return received[:self.k], 0, True
        return received[:self.k], -1, False

    def _is_valid_codeword(self, candidate: bitarray) -> bool:
        r = bitarray(candidate)
        for i in range(self.k):
            if r[i]:
                for j in range(len(self.gen_poly)):
                    if i + j < self.n:
                        r[i + j] ^= bool(self.gen_poly[j])
        return sum(1 for b in r[self.k:] if b) == 0

    def _euclidean_distance(self, soft_symbols: np.ndarray,
                            candidate: bitarray) -> float:
        ref = np.where(np.array(list(map(int, candidate.tolist()))), 1.0, -1.0)
        return float(np.sum((soft_symbols - ref) ** 2))

    def decode_soft(self, soft_symbols: np.ndarray
                    ) -> Tuple[bitarray, int, bool, float, Dict]:
        if len(soft_symbols) != self.n:
            raise ValueError(
                f"Soft symbols must have {self.n} elements, got {len(soft_symbols)}")

        hard_decision = bitarray(
            [bool(s > 0) for s in soft_symbols])
        reliability = np.abs(soft_symbols)

        sorted_indices = np.argsort(reliability)

        best_candidate = None
        best_distance = float('inf')
        best_error_count = -1
        hard_ok = False

        hd_decoded, hd_errors, hd_valid = self._hard_decode(hard_decision)
        if hd_valid:
            dist = self._euclidean_distance(soft_symbols, hard_decision)
            if dist < best_distance:
                best_distance = dist
                best_candidate = hd_decoded
                best_error_count = hd_errors
                hard_ok = True

        flip_positions_list = self._generate_chase_patterns(
            sorted_indices, self.chase_depth)

        for flip_positions in flip_positions_list:
            candidate = bitarray(hard_decision)
            for pos in flip_positions:
                if pos < self.n:
                    candidate[pos] = not candidate[pos]

            if self._is_valid_codeword(candidate):
                dist = self._euclidean_distance(soft_symbols, candidate)
                if dist < best_distance:
                    best_distance = dist
                    best_candidate = candidate[:self.k]
                    best_error_count = len(flip_positions)
                    hard_ok = False

        info = {
            'hard_decision_valid': hd_valid,
            'chase_trials': len(flip_positions_list),
            'euclidean_distance': round(best_distance, 4),
            'reliability_min': round(float(np.min(reliability)), 4),
            'reliability_avg': round(float(np.mean(reliability)), 4),
            'soft_improvement': not hard_ok and best_candidate is not None
        }

        if best_candidate is not None:
            return best_candidate, best_error_count, True, best_distance, info
        else:
            return hd_decoded, -1, False, best_distance, info

    def _generate_chase_patterns(self, sorted_indices: np.ndarray,
                                 depth: int) -> List[List[int]]:
        patterns = []
        indices = sorted_indices[:depth].tolist()

        for num_flips in range(1, min(depth, self.t * 2) + 1):
            self._combinations(indices, num_flips, 0, [], patterns)

        return patterns

    def _combinations(self, arr: List[int], k: int, start: int,
                      current: List[int], result: List[List[int]]) -> None:
        if len(current) == k:
            result.append(current[:])
            return
        for i in range(start, len(arr)):
            current.append(arr[i])
            self._combinations(arr, k, i + 1, current, result)
            current.pop()

    def hard_to_soft(self, hard_bits: bitarray,
                     snr_db: float = 10.0) -> np.ndarray:
        sigma = 1.0 / math.sqrt(10 ** (snr_db / 10.0))
        soft = np.zeros(len(hard_bits))
        for i, b in enumerate(hard_bits):
            symbol = 1.0 if b else -1.0
            noise = np.random.normal(0, sigma)
            soft[i] = symbol + noise
        return soft

    def soft_decode_frame(self, soft_frame: np.ndarray
                          ) -> Tuple[bitarray, int, bool, float, Dict]:
        return self.decode_soft(soft_frame[:self.n])


class FLWCorrelator:
    def __init__(self, sync_word: Optional[bitarray] = None,
                 threshold: float = 0.75,
                 window_size: int = 0):
        if sync_word is not None:
            self.sync_word = bitarray(sync_word)
        else:
            self.sync_word = bitarray('0110111000100101')
        self.sync_length = len(self.sync_word)
        self.threshold = threshold
        self.window_size = window_size if window_size > 0 else self.sync_length * 4

        self.sync_ref = np.array(
            [1.0 if b else -1.0 for b in self.sync_word])

    def correlate(self, data: bitarray,
                  start: int = 0,
                  end: int = -1) -> Dict:
        if end < 0 or end > len(data):
            end = len(data)

        search_end = min(end, len(data) - self.sync_length + 1)
        if search_end <= start:
            return {
                'found': False,
                'position': -1,
                'correlation_peak': 0.0,
                'correlation_normalized': 0.0,
                'threshold': self.threshold,
                'correlation_values': []
            }

        correlations = []
        for pos in range(start, search_end):
            corr = self._compute_correlation(data, pos)
            correlations.append((pos, corr))

        if not correlations:
            return {
                'found': False,
                'position': -1,
                'correlation_peak': 0.0,
                'correlation_normalized': 0.0,
                'threshold': self.threshold,
                'correlation_values': []
            }

        best_pos, best_corr = max(correlations, key=lambda x: x[1])
        normalized = best_corr / self.sync_length

        corr_values = [
            {'position': pos, 'correlation': round(corr, 4),
             'normalized': round(corr / self.sync_length, 4)}
            for pos, corr in correlations
            if corr / self.sync_length > 0.3
        ]
        corr_values.sort(key=lambda x: x['normalized'], reverse=True)
        corr_values = corr_values[:50]

        return {
            'found': normalized >= self.threshold,
            'position': best_pos,
            'correlation_peak': round(best_corr, 4),
            'correlation_normalized': round(normalized, 4),
            'threshold': self.threshold,
            'correlation_values': corr_values
        }

    def correlate_soft(self, soft_data: np.ndarray,
                       start: int = 0,
                       end: int = -1) -> Dict:
        if end < 0 or end > len(soft_data):
            end = len(soft_data)

        search_end = min(end, len(soft_data) - self.sync_length + 1)
        if search_end <= start:
            return {
                'found': False,
                'position': -1,
                'correlation_peak': 0.0,
                'correlation_normalized': 0.0,
                'threshold': self.threshold,
                'correlation_values': [],
                'snr_estimate': 0.0
            }

        correlations = []
        for pos in range(start, search_end):
            segment = soft_data[pos:pos + self.sync_length]
            corr = float(np.dot(segment, self.sync_ref))
            correlations.append((pos, corr))

        if not correlations:
            return {
                'found': False,
                'position': -1,
                'correlation_peak': 0.0,
                'correlation_normalized': 0.0,
                'threshold': self.threshold,
                'correlation_values': [],
                'snr_estimate': 0.0
            }

        best_pos, best_corr = max(correlations, key=lambda x: x[1])
        max_possible = float(np.sum(np.abs(self.sync_ref))) * np.max(
            np.abs(soft_data[:search_end]))
        normalized = best_corr / max_possible if max_possible > 0 else 0.0

        corr_values = []
        for pos, corr in correlations:
            norm = corr / max_possible if max_possible > 0 else 0.0
            if abs(norm) > 0.3:
                corr_values.append({
                    'position': pos,
                    'correlation': round(corr, 4),
                    'normalized': round(norm, 4)
                })
        corr_values.sort(key=lambda x: abs(x['normalized']), reverse=True)
        corr_values = corr_values[:50]

        snr_estimate = self._estimate_snr(soft_data, best_pos)

        return {
            'found': normalized >= self.threshold,
            'position': best_pos,
            'correlation_peak': round(best_corr, 4),
            'correlation_normalized': round(normalized, 4),
            'threshold': self.threshold,
            'correlation_values': corr_values,
            'snr_estimate': round(snr_estimate, 2)
        }

    def _compute_correlation(self, data: bitarray, pos: int) -> float:
        if pos + self.sync_length > len(data):
            return 0.0
        segment = data[pos:pos + self.sync_length]
        matches = sum(1 for i in range(self.sync_length)
                      if segment[i] == self.sync_word[i])
        mismatches = self.sync_length - matches
        return float(matches - mismatches)

    def _estimate_snr(self, soft_data: np.ndarray,
                      sync_pos: int) -> float:
        if sync_pos + self.sync_length > len(soft_data):
            return 0.0
        signal_segment = soft_data[sync_pos:sync_pos + self.sync_length]
        signal_power = float(np.mean(signal_segment ** 2))
        noise_region_start = max(0, sync_pos - self.sync_length)
        noise_region_end = sync_pos
        if noise_region_end <= noise_region_start:
            noise_region_start = sync_pos + self.sync_length
            noise_region_end = min(
                len(soft_data), noise_region_start + self.sync_length)
        if noise_region_end <= noise_region_start:
            return 0.0
        noise_segment = soft_data[noise_region_start:noise_region_end]
        expected = np.array([1.0 if b else -1.0 for b in self.sync_word])
        if len(noise_segment) >= self.sync_length:
            noise_est = noise_segment[:self.sync_length] - expected[:len(
                noise_segment[:self.sync_length])]
        else:
            noise_est = noise_segment - np.mean(noise_segment)
        noise_power = float(np.mean(noise_est ** 2)) if len(
            noise_est) > 0 else 1e-10
        if noise_power < 1e-10:
            return 30.0
        snr = signal_power / noise_power
        return 10.0 * math.log10(max(snr, 1e-10))

    def multi_peak_detect(self, data: bitarray,
                          num_peaks: int = 3) -> List[Dict]:
        result = self.correlate(data)
        if not result['correlation_values']:
            return []

        peaks = []
        sorted_corrs = sorted(result['correlation_values'],
                              key=lambda x: x['normalized'], reverse=True)

        for cv in sorted_corrs[:num_peaks]:
            peaks.append({
                'position': cv['position'],
                'correlation': cv['correlation'],
                'normalized': cv['normalized'],
                'valid': cv['normalized'] >= self.threshold
            })

        return peaks


@dataclass
class LQIMetrics:
    snr_db: float = 0.0
    correlation_normalized: float = 0.0
    bch_error_rate: float = 0.0
    bch_corrected_count: int = 0
    bch_uncorrectable_count: int = 0
    sync_lock_status: str = 'searching'
    evm: float = 0.0
    ber_estimate: float = 0.0
    lqi_value: int = 0
    lqi_quality: str = 'unknown'
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> Dict:
        return asdict(self)


class LQICalculator:
    def __init__(self, sync_word: Optional[bitarray] = None):
        self.flw_correlator = FLWCorrelator(sync_word)
        self.history: List[LQIMetrics] = []

    def calculate(self,
                  raw_data: bitarray,
                  bch_stats: Optional[Dict] = None,
                  sync_status: str = 'searching',
                  soft_symbols: Optional[np.ndarray] = None) -> LQIMetrics:
        metrics = LQIMetrics()
        metrics.sync_lock_status = sync_status

        corr_result = self.flw_correlator.correlate(raw_data)
        metrics.correlation_normalized = corr_result['correlation_normalized']

        if soft_symbols is not None and corr_result['found']:
            soft_result = self.flw_correlator.correlate_soft(soft_symbols)
            metrics.snr_db = soft_result.get('snr_estimate', 0.0)
            metrics.evm = self._calculate_evm(
                soft_symbols, corr_result['position'])
        else:
            metrics.snr_db = self._estimate_snr_from_correlation(
                metrics.correlation_normalized)
            metrics.evm = self._estimate_evm_from_snr(metrics.snr_db)

        if bch_stats is not None:
            total_bch = bch_stats.get('total', 0)
            valid_bch = bch_stats.get('valid', 0)
            corrected = bch_stats.get('corrected', 0)
            uncorrectable = total_bch - valid_bch

            metrics.bch_error_rate = (
                uncorrectable / total_bch) if total_bch > 0 else 0.0
            metrics.bch_corrected_count = corrected
            metrics.bch_uncorrectable_count = uncorrectable

        metrics.ber_estimate = self._estimate_ber(
            metrics.snr_db, metrics.bch_error_rate)

        metrics.lqi_value = self._compute_lqi_score(metrics)
        metrics.lqi_quality = self._classify_quality(metrics.lqi_value)

        self.history.append(metrics)
        if len(self.history) > 100:
            self.history = self.history[-100:]

        return metrics

    def _calculate_evm(self, soft_symbols: np.ndarray, sync_pos: int) -> float:
        sync_len = self.flw_correlator.sync_length
        if sync_pos + sync_len > len(soft_symbols):
            return 0.0

        sync_ref = np.array(
            [1.0 if b else -1.0 for b in self.flw_correlator.sync_word])
        received = soft_symbols[sync_pos:sync_pos + sync_len]

        if len(received) < sync_len:
            return 0.0

        avg_power = np.mean(received ** 2)
        if avg_power <= 0:
            return 0.0

        error = received - sync_ref
        mse = np.mean(error ** 2)
        evm_pct = math.sqrt(mse / avg_power) * 100
        return round(evm_pct, 4)

    def _estimate_snr_from_correlation(self, corr_norm: float) -> float:
        if corr_norm >= 0.95:
            return 20.0
        elif corr_norm >= 0.85:
            return 15.0
        elif corr_norm >= 0.75:
            return 10.0
        elif corr_norm >= 0.6:
            return 5.0
        elif corr_norm >= 0.4:
            return 0.0
        else:
            return -5.0

    def _estimate_evm_from_snr(self, snr_db: float) -> float:
        if snr_db >= 20:
            return 5.0
        elif snr_db >= 15:
            return 10.0
        elif snr_db >= 10:
            return 18.0
        elif snr_db >= 5:
            return 30.0
        elif snr_db >= 0:
            return 50.0
        else:
            return 70.0

    def _estimate_ber(self, snr_db: float, bch_error_rate: float) -> float:
        if snr_db >= 20:
            base_ber = 1e-6
        elif snr_db >= 15:
            base_ber = 1e-5
        elif snr_db >= 10:
            base_ber = 1e-4
        elif snr_db >= 5:
            base_ber = 1e-3
        elif snr_db >= 0:
            base_ber = 1e-2
        else:
            base_ber = 1e-1

        combined_ber = base_ber * (1.0 + bch_error_rate * 10.0)
        return min(combined_ber, 0.5)

    def _compute_lqi_score(self, m: LQIMetrics) -> int:
        score = 0

        if m.correlation_normalized >= 0.95:
            score += 30
        elif m.correlation_normalized >= 0.85:
            score += 25
        elif m.correlation_normalized >= 0.75:
            score += 20
        elif m.correlation_normalized >= 0.6:
            score += 10
        else:
            score += 0

        if m.snr_db >= 20:
            score += 25
        elif m.snr_db >= 15:
            score += 20
        elif m.snr_db >= 10:
            score += 15
        elif m.snr_db >= 5:
            score += 10
        elif m.snr_db >= 0:
            score += 5
        else:
            score += 0

        if m.bch_error_rate <= 0.01:
            score += 25
        elif m.bch_error_rate <= 0.05:
            score += 20
        elif m.bch_error_rate <= 0.1:
            score += 15
        elif m.bch_error_rate <= 0.2:
            score += 10
        else:
            score += 0

        if m.evm <= 10:
            score += 20
        elif m.evm <= 20:
            score += 15
        elif m.evm <= 35:
            score += 10
        elif m.evm <= 50:
            score += 5
        else:
            score += 0

        if m.sync_lock_status == 'locked':
            score += 10
        elif m.sync_lock_status == 'acquiring':
            score += 5
        else:
            score += 0

        return min(score, 100)

    def _classify_quality(self, lqi_value: int) -> str:
        if lqi_value >= 80:
            return 'excellent'
        elif lqi_value >= 60:
            return 'good'
        elif lqi_value >= 40:
            return 'fair'
        elif lqi_value >= 20:
            return 'poor'
        else:
            return 'bad'

    def get_history(self, count: int = 10) -> List[Dict]:
        if count <= 0:
            return [m.to_dict() for m in self.history]
        return [m.to_dict() for m in self.history[-count:]]

    def get_statistics(self) -> Dict:
        if not self.history:
            return {}

        lqi_values = [m.lqi_value for m in self.history]
        snr_values = [m.snr_db for m in self.history]
        corr_values = [m.correlation_normalized for m in self.history]
        ber_values = [m.ber_estimate for m in self.history]
        evm_values = [m.evm for m in self.history]

        return {
            'sample_count': len(self.history),
            'lqi_avg': round(np.mean(lqi_values), 2),
            'lqi_min': round(np.min(lqi_values), 2),
            'lqi_max': round(np.max(lqi_values), 2),
            'lqi_std': round(np.std(lqi_values), 2),
            'snr_avg': round(np.mean(snr_values), 2),
            'corr_avg': round(np.mean(corr_values), 4),
            'ber_avg': float(np.mean(ber_values)),
            'evm_avg': round(np.mean(evm_values), 2),
            'current_quality': self.history[-1].lqi_quality if self.history else 'unknown'
        }


@dataclass
class ErrorStatEntry:
    multiframe: int
    basic_frame: int
    timeslot: Optional[int]
    bch_index: Optional[int]
    error_type: str
    bit_errors: int
    error_rate: float
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> Dict:
        return asdict(self)


class ErrorStatistics:
    def __init__(self):
        self.entries: List[ErrorStatEntry] = []
        self.total_bits_processed: int = 0
        self.total_bit_errors: int = 0
        self.frame_error_count: int = 0
        self.total_frames: int = 0

    def add_entry(self, entry: ErrorStatEntry) -> None:
        self.entries.append(entry)
        self.total_bit_errors += entry.bit_errors

    def record_frame(self, has_error: bool, bit_count: int = 0,
                      error_count: int = 0) -> None:
        self.total_frames += 1
        self.total_bits_processed += bit_count
        self.total_bit_errors += error_count
        if has_error:
            self.frame_error_count += 1

    def get_summary(self) -> Dict:
        ber = (self.total_bit_errors / self.total_bits_processed
               if self.total_bits_processed > 0 else 0.0)
        fer = (self.frame_error_count / self.total_frames
               if self.total_frames > 0 else 0.0)

        error_type_counts = {}
        for e in self.entries:
            error_type_counts[e.error_type] = error_type_counts.get(
                e.error_type, 0) + 1

        return {
            'total_frames': self.total_frames,
            'total_bits_processed': self.total_bits_processed,
            'total_bit_errors': self.total_bit_errors,
            'frame_errors': self.frame_error_count,
            'bit_error_rate': ber,
            'frame_error_rate': fer,
            'error_type_distribution': error_type_counts,
            'total_entries': len(self.entries)
        }

    def export_csv(self, limit: int = 1000) -> str:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            'multiframe', 'basic_frame', 'timeslot', 'bch_index',
            'error_type', 'bit_errors', 'error_rate', 'timestamp'
        ])

        start_idx = max(0, len(self.entries) - limit)
        for entry in self.entries[start_idx:]:
            writer.writerow([
                entry.multiframe,
                entry.basic_frame,
                entry.timeslot if entry.timeslot is not None else '',
                entry.bch_index if entry.bch_index is not None else '',
                entry.error_type,
                entry.bit_errors,
                round(entry.error_rate, 6),
                entry.timestamp
            ])

        return output.getvalue()

    def export_json(self, limit: int = 1000) -> str:
        start_idx = max(0, len(self.entries) - limit)
        data = {
            'summary': self.get_summary(),
            'entries': [e.to_dict() for e in self.entries[start_idx:]],
            'export_timestamp': datetime.now().isoformat()
        }
        return json.dumps(data, indent=2, ensure_ascii=False)

    def get_error_distribution(self) -> Dict:
        mf_errors: Dict[int, int] = {}
        bf_errors: Dict[int, int] = {}
        ts_errors: Dict[int, int] = {}

        for entry in self.entries:
            mf_errors[entry.multiframe] = mf_errors.get(
                entry.multiframe, 0) + 1
            bf_errors[entry.basic_frame] = bf_errors.get(
                entry.basic_frame, 0) + 1
            if entry.timeslot is not None:
                ts_errors[entry.timeslot] = ts_errors.get(
                    entry.timeslot, 0) + 1

        return {
            'by_multiframe': dict(sorted(mf_errors.items())),
            'by_basic_frame': dict(sorted(bf_errors.items())),
            'by_timeslot': dict(sorted(ts_errors.items()))
        }

    def clear(self) -> None:
        self.entries.clear()
        self.total_bits_processed = 0
        self.total_bit_errors = 0
        self.frame_error_count = 0
        self.total_frames = 0
