import numpy as np
from math import gcd
from functools import reduce


class PDRadarSignalProcessor:
    def __init__(self):
        self.fc = 10e9
        self.bw = 100e6
        self.tau = 10e-6
        self.prf = 1e3
        self.num_pulses = 128
        self.fs = 2 * self.bw
        self.range_max = 5000
        self.speed_max = 100
        self.c = 3e8
        self.wavelength = self.c / self.fc

        self.use_multi_prf = True
        self.prf_list = [980, 1000, 1020]
        self.num_pulses_per_prf = 64

        self.num_range_bins = int(self.tau * self.fs)
        self.range_resolution = self.c / (2 * self.bw)
        self.speed_resolution = self.wavelength * self.prf / (2 * self.num_pulses)

        self.range_axis = np.linspace(0, self.range_max, self.num_range_bins)
        self.speed_axis = np.linspace(-self.speed_max, self.speed_max, self.num_pulses)

        self._update_multi_prf_params()

    def _update_multi_prf_params(self):
        if self.use_multi_prf and self.prf_list:
            self.unambiguous_speed_list = []
            for prf in self.prf_list:
                v_unamb = self.wavelength * prf / 4
                self.unambiguous_speed_list.append(v_unamb)

            if len(self.prf_list) >= 2:
                self.max_unambiguous_speed = self._calculate_max_unambiguous_speed()
            else:
                self.max_unambiguous_speed = self.unambiguous_speed_list[0] if self.unambiguous_speed_list else self.speed_max
        else:
            self.max_unambiguous_speed = self.wavelength * self.prf / 4

    def _calculate_max_unambiguous_speed(self):
        prfs = np.array(self.prf_list)
        intervals = self.wavelength * prfs / 4

        intervals_int = [int(v * 1000) for v in intervals]

        def lcm(a, b):
            return a * b // gcd(a, b)

        max_v_int = reduce(lcm, intervals_int)
        max_v = max_v_int / 1000

        return min(max_v, self.speed_max * 5)

    def extended_gcd(self, a, b):
        if b == 0:
            return a, 1, 0
        g, x, y = self.extended_gcd(b, a % b)
        return g, y, x - (a // b) * y

    def mod_inverse(self, a, m):
        g, x, _ = self.extended_gcd(a % m, m)
        if g != 1:
            return None
        return x % m

    def chinese_remainder_theorem(self, remainders, moduli):
        remainders = np.array(remainders, dtype=np.float64)
        moduli = np.array(moduli, dtype=np.float64)

        scale = 10000
        remainders_int = np.round(remainders * scale).astype(np.int64)
        moduli_int = np.round(moduli * scale).astype(np.int64)

        M = 1
        for m in moduli_int:
            M = M * m // gcd(M, m)

        result = 0
        for i in range(len(moduli_int)):
            Mi = M // moduli_int[i]
            inv = self.mod_inverse(Mi, moduli_int[i])
            if inv is None:
                return None
            result = (result + remainders_int[i] * Mi * inv) % M

        result_float = result / scale

        if result_float > M / (2 * scale):
            result_float -= M / scale

        return result_float

    def search_unwrap_speed(self, measured_speeds, prf_list):
        v_unamb_list = [self.wavelength * prf / 4 for prf in prf_list]

        max_ambiguity = int(np.ceil(self.max_unambiguous_speed / min(v_unamb_list)))

        best_speed = None
        min_error = float('inf')

        for k0 in range(-max_ambiguity, max_ambiguity + 1):
            v_candidate = measured_speeds[0] + 2 * k0 * v_unamb_list[0]

            if abs(v_candidate) > self.max_unambiguous_speed:
                continue

            total_error = 0
            valid = True

            for i in range(1, len(measured_speeds)):
                v_meas = measured_speeds[i]
                v_unamb = v_unamb_list[i]

                expected_meas = ((v_candidate + v_unamb) % (2 * v_unamb)) - v_unamb
                error = abs(v_meas - expected_meas)

                if error > v_unamb * 0.3:
                    valid = False
                    break

                total_error += error

            if valid and total_error < min_error:
                min_error = total_error
                best_speed = v_candidate

        if best_speed is None:
            best_speed = measured_speeds[0]

        return best_speed

    def crt_unwrap_speed(self, measured_speeds, prf_list):
        moduli = []
        remainders = []

        for v_meas, prf in zip(measured_speeds, prf_list):
            v_unamb = self.wavelength * prf / 4
            period = 2 * v_unamb
            moduli.append(period)
            remainder = v_meas % period
            if remainder < 0:
                remainder += period
            remainders.append(remainder)

        unwrapped_speed = self.chinese_remainder_theorem(remainders, moduli)

        if unwrapped_speed is None or abs(unwrapped_speed) > self.max_unambiguous_speed * 2:
            unwrapped_speed = self.search_unwrap_speed(measured_speeds, prf_list)

        if unwrapped_speed is not None and unwrapped_speed > self.max_unambiguous_speed:
            unwrapped_speed -= 2 * self.max_unambiguous_speed
        elif unwrapped_speed is not None and unwrapped_speed < -self.max_unambiguous_speed:
            unwrapped_speed += 2 * self.max_unambiguous_speed

        return unwrapped_speed if unwrapped_speed is not None else measured_speeds[-1]

    def generate_lfm_signal(self, t):
        k = self.bw / self.tau
        return np.exp(1j * np.pi * k * (t - self.tau / 2) ** 2)

    def generate_received_signal(self, targets, snr_db=20):
        num_samples = int(self.tau * self.fs)
        t_fast = np.linspace(0, self.tau, num_samples, endpoint=False)
        transmitted = self.generate_lfm_signal(t_fast)

        if self.use_multi_prf and self.prf_list:
            return self._generate_multi_prf_signal(targets, snr_db, t_fast, transmitted)
        else:
            return self._generate_single_prf_signal(targets, snr_db, t_fast, transmitted)

    def _generate_single_prf_signal(self, targets, snr_db, t_fast, transmitted):
        num_samples = len(t_fast)
        t_slow = np.arange(self.num_pulses) / self.prf
        signal_matrix = np.zeros((self.num_pulses, num_samples), dtype=np.complex128)

        for pulse_idx in range(self.num_pulses):
            signal = np.zeros(num_samples, dtype=np.complex128)
            for target in targets:
                r0, v, rcs = target
                r = r0 + v * t_slow[pulse_idx]
                tau_delay = 2 * r / self.c
                doppler_freq = 2 * v / self.wavelength

                if tau_delay < self.tau:
                    delay_samples = int(tau_delay * self.fs)
                    if delay_samples < num_samples:
                        phase = np.exp(1j * 2 * np.pi * doppler_freq * t_slow[pulse_idx])
                        delay_t = t_fast - tau_delay
                        target_echo = rcs * self.generate_lfm_signal(delay_t) * phase
                        start_idx = delay_samples
                        end_idx = min(start_idx + len(target_echo), num_samples)
                        signal[start_idx:end_idx] += target_echo[:end_idx - start_idx]

            noise_power = np.mean(np.abs(signal) ** 2) / (10 ** (snr_db / 10))
            noise = np.sqrt(noise_power / 2) * (
                np.random.randn(num_samples) + 1j * np.random.randn(num_samples)
            )
            signal_matrix[pulse_idx, :] = signal + noise

        return signal_matrix, transmitted

    def _generate_multi_prf_signal(self, targets, snr_db, t_fast, transmitted):
        num_samples = len(t_fast)
        signal_matrices = []
        prf_used = []

        for prf in self.prf_list:
            num_pulses = self.num_pulses_per_prf
            t_slow = np.arange(num_pulses) / prf
            signal_matrix = np.zeros((num_pulses, num_samples), dtype=np.complex128)

            for pulse_idx in range(num_pulses):
                signal = np.zeros(num_samples, dtype=np.complex128)
                for target in targets:
                    r0, v, rcs = target
                    r = r0 + v * t_slow[pulse_idx]
                    tau_delay = 2 * r / self.c
                    doppler_freq = 2 * v / self.wavelength

                    if tau_delay < self.tau:
                        delay_samples = int(tau_delay * self.fs)
                        if delay_samples < num_samples:
                            phase = np.exp(1j * 2 * np.pi * doppler_freq * t_slow[pulse_idx])
                            delay_t = t_fast - tau_delay
                            target_echo = rcs * self.generate_lfm_signal(delay_t) * phase
                            start_idx = delay_samples
                            end_idx = min(start_idx + len(target_echo), num_samples)
                            signal[start_idx:end_idx] += target_echo[:end_idx - start_idx]

                noise_power = np.mean(np.abs(signal) ** 2) / (10 ** (snr_db / 10))
                noise = np.sqrt(noise_power / 2) * (
                    np.random.randn(num_samples) + 1j * np.random.randn(num_samples)
                )
                signal_matrix[pulse_idx, :] = signal + noise

            signal_matrices.append(signal_matrix)
            prf_used.append(prf)

        return signal_matrices, transmitted

    def pulse_compression(self, signal_matrix, transmitted):
        num_samples = signal_matrix.shape[1]
        transmitted_fft = np.fft.fft(np.conj(transmitted[::-1]), n=num_samples)
        compressed = np.zeros_like(signal_matrix)

        for pulse_idx in range(signal_matrix.shape[0]):
            signal_fft = np.fft.fft(signal_matrix[pulse_idx, :], n=num_samples)
            compressed[pulse_idx, :] = np.fft.ifft(signal_fft * transmitted_fft)

        return compressed

    def doppler_processing(self, compressed, prf=None):
        num_pulses = compressed.shape[0]
        range_doppler = np.zeros_like(compressed, dtype=np.complex128)

        window = np.hamming(num_pulses).reshape(-1, 1)
        windowed = compressed * window

        for range_bin in range(compressed.shape[1]):
            range_doppler[:, range_bin] = np.fft.fftshift(
                np.fft.fft(windowed[:, range_bin], n=num_pulses)
            )

        return range_doppler

    def multi_prf_doppler_processing(self, compressed_list, prf_list):
        rd_maps = []
        speed_axes = []

        for compressed, prf in zip(compressed_list, prf_list):
            num_pulses = compressed.shape[0]
            rd_map = self.doppler_processing(compressed, prf)
            v_unamb = self.wavelength * prf / 4
            speed_axis = np.linspace(-v_unamb, v_unamb, num_pulses)

            rd_maps.append(rd_map)
            speed_axes.append(speed_axis)

        return rd_maps, speed_axes

    def multi_prf_pulse_compression(self, signal_matrices, transmitted):
        compressed_list = []
        for signal_matrix in signal_matrices:
            compressed = self.pulse_compression(signal_matrix, transmitted)
            compressed_list.append(compressed)
        return compressed_list

    def extract_peak_speeds(self, rd_maps, speed_axes, range_bin_idx):
        measured_speeds = []
        for rd_map, speed_axis in zip(rd_maps, speed_axes):
            rd_power = np.abs(rd_map[:, range_bin_idx])
            peak_idx = np.argmax(rd_power)
            measured_speed = speed_axis[peak_idx]
            measured_speeds.append(measured_speed)
        return measured_speeds

    def resolve_speed_ambiguity(self, detections, rd_maps, speed_axes, prf_list):
        resolved_detections = []

        for det in detections:
            range_idx = np.argmin(np.abs(self.range_axis - det['range']))

            measured_speeds = self.extract_peak_speeds(rd_maps, speed_axes, range_idx)
            true_speed = self.crt_unwrap_speed(measured_speeds, prf_list)

            resolved_det = det.copy()
            resolved_det['measured_speeds'] = [float(v) for v in measured_speeds]
            resolved_det['unambiguous_speed'] = float(true_speed)
            resolved_det['prf_list'] = prf_list
            resolved_det['unambiguous_speed_ranges'] = [
                float(self.wavelength * prf / 4) for prf in prf_list
            ]
            resolved_det['max_unambiguous_speed'] = float(self.max_unambiguous_speed)

            resolved_detections.append(resolved_det)

        return resolved_detections

    def combine_multi_prf_rd_maps(self, rd_maps, speed_axes):
        num_range_bins = rd_maps[0].shape[1]
        max_speed = self.max_unambiguous_speed
        num_speed_bins = self.num_pulses

        combined_speed_axis = np.linspace(-max_speed, max_speed, num_speed_bins)
        combined_rd = np.zeros((num_speed_bins, num_range_bins), dtype=np.complex128)

        for rd_map, speed_axis in zip(rd_maps, speed_axes):
            for sp_idx in range(len(speed_axis)):
                v = speed_axis[sp_idx]
                combined_idx = np.argmin(np.abs(combined_speed_axis - v))
                combined_rd[combined_idx, :] += rd_map[sp_idx, :]

        combined_rd /= len(rd_maps)

        return combined_rd, combined_speed_axis

    def cfar_detector(self, rd_map, guard_cells=2, training_cells=8, pfa=1e-3, method='ca'):
        if method == 'ca':
            return self._ca_cfar(rd_map, guard_cells, training_cells, pfa)
        elif method == 'os':
            return self._os_cfar(rd_map, guard_cells, training_cells, pfa)
        elif method == 'so':
            return self._so_cfar(rd_map, guard_cells, training_cells, pfa)
        else:
            return self._ca_cfar(rd_map, guard_cells, training_cells, pfa)

    def _extract_training_cells(self, power_map, i, j, guard_cells, training_cells):
        total_window = guard_cells + training_cells
        i_start = i - total_window
        i_end = i + total_window + 1
        j_start = j - total_window
        j_end = j + total_window + 1

        window = power_map[i_start:i_end, j_start:j_end].copy()

        center_i = total_window
        center_j = total_window
        window[center_i - guard_cells:center_i + guard_cells + 1,
               center_j - guard_cells:center_j + guard_cells + 1] = 0

        return window[window != 0]

    def _ca_cfar(self, rd_map, guard_cells=2, training_cells=8, pfa=1e-3):
        num_pulses, num_ranges = rd_map.shape
        power_map = np.abs(rd_map) ** 2
        detection_map = np.zeros_like(power_map, dtype=bool)

        n_eff = training_cells * 4 * 2
        alpha = n_eff * (pfa ** (-1 / n_eff) - 1)

        total_window = guard_cells + training_cells

        for i in range(total_window, num_pulses - total_window):
            for j in range(total_window, num_ranges - total_window):
                training_values = self._extract_training_cells(
                    power_map, i, j, guard_cells, training_cells
                )

                if len(training_values) > 0:
                    noise_power = np.mean(training_values)
                    threshold = alpha * noise_power

                    if power_map[i, j] > threshold:
                        detection_map[i, j] = True

        return detection_map

    def _os_cfar(self, rd_map, guard_cells=2, training_cells=8, pfa=1e-3, k_ratio=0.5):
        num_pulses, num_ranges = rd_map.shape
        power_map = np.abs(rd_map) ** 2
        detection_map = np.zeros_like(power_map, dtype=bool)

        total_window = guard_cells + training_cells

        for i in range(total_window, num_pulses - total_window):
            for j in range(total_window, num_ranges - total_window):
                training_values = self._extract_training_cells(
                    power_map, i, j, guard_cells, training_cells
                )

                if len(training_values) > 0:
                    sorted_values = np.sort(training_values)
                    k = int(len(sorted_values) * k_ratio)
                    k = max(1, min(k, len(sorted_values) - 1))

                    noise_power = sorted_values[k]

                    n_eff = len(training_values)
                    alpha = n_eff * (pfa ** (-1 / n_eff) - 1)
                    threshold = alpha * noise_power

                    if power_map[i, j] > threshold:
                        detection_map[i, j] = True

        return detection_map

    def _so_cfar(self, rd_map, guard_cells=2, training_cells=8, pfa=1e-3):
        num_pulses, num_ranges = rd_map.shape
        power_map = np.abs(rd_map) ** 2
        detection_map = np.zeros_like(power_map, dtype=bool)

        n_half = training_cells
        alpha = n_half * (pfa ** (-1 / n_half) - 1)

        total_window = guard_cells + training_cells

        for i in range(total_window, num_pulses - total_window):
            for j in range(total_window, num_ranges - total_window):
                left_cells = power_map[i, j - total_window:j - guard_cells]
                right_cells = power_map[i, j + guard_cells + 1:j + total_window + 1]
                top_cells = power_map[i - total_window:i - guard_cells, j]
                bottom_cells = power_map[i + guard_cells + 1:i + total_window + 1, j]

                n_left = max(len(left_cells), 1)
                n_right = max(len(right_cells), 1)
                n_top = max(len(top_cells), 1)
                n_bottom = max(len(bottom_cells), 1)

                left_mean = np.sum(left_cells) / n_left
                right_mean = np.sum(right_cells) / n_right
                top_mean = np.sum(top_cells) / n_top
                bottom_mean = np.sum(bottom_cells) / n_bottom

                horiz_min = min(left_mean, right_mean)
                vert_min = min(top_mean, bottom_mean)

                noise_power = min(horiz_min, vert_min)
                threshold = alpha * noise_power

                if power_map[i, j] > threshold:
                    detection_map[i, j] = True

        return detection_map

    def process(self, targets=None, snr_db=20, cfar_method='ca'):
        if targets is None:
            targets = [
                (1000, 20, 1.0),
                (2000, -15, 0.8),
                (3500, 50, 0.6),
            ]

        if self.use_multi_prf and self.prf_list:
            return self._process_multi_prf(targets, snr_db, cfar_method)
        else:
            return self._process_single_prf(targets, snr_db, cfar_method)

    def _process_single_prf(self, targets, snr_db, cfar_method='ca'):
        signal_matrix, transmitted = self.generate_received_signal(targets, snr_db)
        compressed = self.pulse_compression(signal_matrix, transmitted)
        rd_map = self.doppler_processing(compressed)
        detection_map = self.cfar_detector(rd_map, method=cfar_method)

        rd_power = 20 * np.log10(np.abs(rd_map) + 1e-10)
        rd_power_norm = (rd_power - rd_power.min()) / (rd_power.max() - rd_power.min() + 1e-10)

        detections = []
        if np.any(detection_map):
            speed_indices, range_indices = np.where(detection_map)
            for sp_idx, rng_idx in zip(speed_indices, range_indices):
                detections.append({
                    'range': float(self.range_axis[rng_idx]),
                    'speed': float(self.speed_axis[sp_idx]),
                    'power': float(rd_power[sp_idx, rng_idx])
                })

        return {
            'range_axis': self.range_axis.tolist(),
            'speed_axis': self.speed_axis.tolist(),
            'rd_map': rd_power_norm.tolist(),
            'detections': detections,
            'num_range_bins': self.num_range_bins,
            'num_speed_bins': self.num_pulses,
            'range_resolution': self.range_resolution,
            'speed_resolution': self.speed_resolution,
            'use_multi_prf': False,
            'window_type': 'hamming'
        }

    def _process_multi_prf(self, targets, snr_db, cfar_method='ca'):
        signal_matrices, transmitted = self.generate_received_signal(targets, snr_db)
        compressed_list = self.multi_prf_pulse_compression(signal_matrices, transmitted)
        rd_maps, speed_axes = self.multi_prf_doppler_processing(compressed_list, self.prf_list)

        combined_rd, combined_speed_axis = self.combine_multi_prf_rd_maps(rd_maps, speed_axes)

        detection_map = self.cfar_detector(combined_rd, method=cfar_method)

        rd_power = 20 * np.log10(np.abs(combined_rd) + 1e-10)
        rd_power_norm = (rd_power - rd_power.min()) / (rd_power.max() - rd_power.min() + 1e-10)

        detections = []
        if np.any(detection_map):
            speed_indices, range_indices = np.where(detection_map)
            for sp_idx, rng_idx in zip(speed_indices, range_indices):
                detections.append({
                    'range': float(self.range_axis[rng_idx]),
                    'speed': float(combined_speed_axis[sp_idx]),
                    'power': float(rd_power[sp_idx, rng_idx])
                })

        resolved_detections = self.resolve_speed_ambiguity(
            detections, rd_maps, speed_axes, self.prf_list
        )

        individual_rd_maps = []
        for rd_map, speed_axis, prf in zip(rd_maps, speed_axes, self.prf_list):
            rd_pwr = 20 * np.log10(np.abs(rd_map) + 1e-10)
            rd_pwr_norm = (rd_pwr - rd_pwr.min()) / (rd_pwr.max() - rd_pwr.min() + 1e-10)
            individual_rd_maps.append({
                'prf': prf,
                'speed_axis': speed_axis.tolist(),
                'rd_map': rd_pwr_norm.tolist(),
                'unambiguous_speed': float(self.wavelength * prf / 4)
            })

        return {
            'range_axis': self.range_axis.tolist(),
            'speed_axis': combined_speed_axis.tolist(),
            'rd_map': rd_power_norm.tolist(),
            'detections': resolved_detections,
            'num_range_bins': self.num_range_bins,
            'num_speed_bins': len(combined_speed_axis),
            'range_resolution': self.range_resolution,
            'speed_resolution': float(2 * self.max_unambiguous_speed / len(combined_speed_axis)),
            'use_multi_prf': True,
            'window_type': 'hamming',
            'prf_list': self.prf_list,
            'unambiguous_speed_list': [float(v) for v in self.unambiguous_speed_list],
            'max_unambiguous_speed': float(self.max_unambiguous_speed),
            'individual_rd_maps': individual_rd_maps
        }
