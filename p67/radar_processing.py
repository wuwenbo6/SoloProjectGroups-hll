import sys
import json
import numpy as np

def generate_fmcw_frame(bandwidth, sweep_time, fs, num_chirps=32, num_targets=3, snr=20):
    c = 3e8
    f0 = 24e9
    k = bandwidth / sweep_time
    wavelength = c / f0
    
    n_samples_per_chirp = int(fs * sweep_time)
    t = np.arange(n_samples_per_chirp) / fs
    
    target_distances = np.random.uniform(20, 150, num_targets)
    target_velocities = np.random.uniform(-2, 2, num_targets)
    target_rcs = np.random.uniform(0.5, 1.0, num_targets)
    
    frame_data = np.zeros((num_chirps, n_samples_per_chirp), dtype=np.complex64)
    
    for chirp_idx in range(num_chirps):
        chirp_start_time = chirp_idx * sweep_time
        beat_signal = np.zeros(n_samples_per_chirp, dtype=np.complex64)
        
        for dist, vel, rcs in zip(target_distances, target_velocities, target_rcs):
            current_dist = dist + vel * chirp_start_time
            tau = 2 * current_dist / c
            
            if tau < sweep_time:
                fb = 2 * current_dist * k / c
                fd = 2 * vel / wavelength
                
                valid_idx = t >= tau
                t_valid = t[valid_idx] - tau
                
                beat_phase = 2 * np.pi * (fb * t_valid + fd * (chirp_start_time + t_valid))
                target_beat = np.exp(1j * beat_phase)
                
                attenuation = rcs / (current_dist**2 + 1)
                
                beat_target = np.zeros(n_samples_per_chirp, dtype=np.complex64)
                beat_target[valid_idx] = target_beat * attenuation
                beat_signal += beat_target
        
        noise = (np.random.randn(n_samples_per_chirp) + 1j * np.random.randn(n_samples_per_chirp)) / np.sqrt(2)
        signal_power = np.mean(np.abs(beat_signal)**2)
        if signal_power > 0:
            noise_power = signal_power / (10**(snr/10))
            beat_signal += noise * np.sqrt(noise_power)
        
        frame_data[chirp_idx, :] = beat_signal
    
    iq_data = {
        'rx_real': np.real(frame_data).tolist(),
        'rx_imag': np.imag(frame_data).tolist()
    }
    
    return frame_data, target_distances, target_velocities, target_rcs, iq_data

def range_doppler_fft(frame_data, fs, bandwidth, sweep_time, window_type='hamming'):
    c = 3e8
    num_chirps, n_samples = frame_data.shape
    
    if window_type == 'hamming':
        range_window = np.hamming(n_samples)
        doppler_window = np.hamming(num_chirps)
    elif window_type == 'hanning':
        range_window = np.hanning(n_samples)
        doppler_window = np.hanning(num_chirps)
    elif window_type == 'blackman':
        range_window = np.blackman(n_samples)
        doppler_window = np.blackman(num_chirps)
    elif window_type == 'kaiser':
        range_window = np.kaiser(n_samples, beta=14)
        doppler_window = np.kaiser(num_chirps, beta=14)
    else:
        range_window = np.ones(n_samples)
        doppler_window = np.ones(num_chirps)
    
    dc_removed = frame_data - np.mean(frame_data, axis=1, keepdims=True)
    
    range_windowed = dc_removed * range_window[np.newaxis, :]
    range_fft = np.fft.fft(range_windowed, n=n_samples*4, axis=1)
    
    doppler_windowed = range_fft * doppler_window[:, np.newaxis]
    doppler_fft = np.fft.fft(doppler_windowed, n=num_chirps*4, axis=0)
    doppler_fft = np.fft.fftshift(doppler_fft, axes=0)
    
    range_freqs = np.fft.fftfreq(n_samples*4, 1/fs)
    doppler_freqs = np.fft.fftshift(np.fft.fftfreq(num_chirps*4, sweep_time))
    
    positive_range_idx = range_freqs >= 0
    ranges = range_freqs[positive_range_idx] * c * sweep_time / (2 * bandwidth)
    range_profile = np.mean(np.abs(range_fft[:, positive_range_idx]), axis=0)
    
    wavelength = c / 24e9
    velocities = doppler_freqs * wavelength / 2
    
    rd_map = np.abs(doppler_fft[:, positive_range_idx])
    rd_map_db = 20 * np.log10(rd_map + 1e-10)
    
    velocity_profile = np.mean(np.abs(doppler_fft), axis=1)
    
    return ranges, range_profile, velocities, velocity_profile, rd_map_db

def os_cfar_2d(rd_map, guard_cells=2, training_cells=8, p_fa=1e-6):
    num_doppler, num_range = rd_map.shape
    detection_mask = np.zeros_like(rd_map, dtype=bool)
    
    for d in range(guard_cells + training_cells, num_doppler - guard_cells - training_cells):
        for r in range(guard_cells + training_cells, num_range - guard_cells - training_cells):
            cell_under_test = rd_map[d, r]
            
            training_samples = []
            
            for dd in range(-training_cells - guard_cells, training_cells + guard_cells + 1):
                for rr in range(-training_cells - guard_cells, training_cells + guard_cells + 1):
                    if abs(dd) > guard_cells or abs(rr) > guard_cells:
                        training_samples.append(rd_map[d + dd, r + rr])
            
            training_samples = np.array(training_samples)
            sorted_samples = np.sort(training_samples)
            
            k = int(len(training_samples) * 0.75)
            noise_level = sorted_samples[k]
            
            alpha = len(training_samples) * (p_fa ** (-1.0 / len(training_samples)) - 1)
            threshold = noise_level * alpha
            
            if cell_under_test > threshold:
                is_local_max = True
                for dd in range(-guard_cells, guard_cells + 1):
                    for rr in range(-guard_cells, guard_cells + 1):
                        if (dd != 0 or rr != 0) and rd_map[d + dd, r + rr] >= cell_under_test:
                            is_local_max = False
                            break
                    if not is_local_max:
                        break
                if is_local_max:
                    detection_mask[d, r] = True
    
    return detection_mask

def extract_detections(detection_mask, ranges, velocities, rd_map_db):
    detections = []
    doppler_idx_to_vel = lambda d: velocities[d]
    range_idx_to_dist = lambda r: ranges[r]
    
    for d in range(detection_mask.shape[0]):
        for r in range(detection_mask.shape[1]):
            if detection_mask[d, r]:
                detections.append({
                    'range': float(range_idx_to_dist(r)),
                    'velocity': float(doppler_idx_to_vel(d)),
                    'power': float(rd_map_db[d, r])
                })
    
    if len(detections) > 1:
        detections = sorted(detections, key=lambda x: -x['power'])
        detections = detections[:10]
    
    return detections

def generate_spectrogram(beat_signal, fs, nperseg=256, noverlap=128):
    from scipy import signal
    
    f, t, Sxx = signal.spectrogram(
        np.real(beat_signal), 
        fs=fs, 
        nperseg=nperseg, 
        noverlap=noverlap,
        scaling='density'
    )
    
    Sxx_db = 10 * np.log10(Sxx + 1e-10)
    
    return t.tolist(), f.tolist(), Sxx_db.tolist()

def main():
    try:
        input_data = json.loads(sys.stdin.readline())
        
        bandwidth = input_data.get('bandwidth', 100e6)
        sweep_time = input_data.get('sweep_time', 1e-3)
        fs = input_data.get('sample_rate', 5e6)
        window_type = input_data.get('window_type', 'none')
        num_chirps = input_data.get('num_chirps', 16)
        
        frame_data, true_distances, true_velocities, true_rcs, iq_data = generate_fmcw_frame(
            bandwidth, sweep_time, fs, num_chirps=num_chirps
        )
        
        c = 3e8
        max_unambiguous_range = c * fs / (4 * bandwidth)
        range_resolution = c / (2 * bandwidth)
        
        wavelength = c / 24e9
        max_unambiguous_velocity = wavelength / (4 * sweep_time)
        velocity_resolution = wavelength / (2 * num_chirps * sweep_time)
        
        ranges, range_profile, velocities, velocity_profile, rd_map_db = range_doppler_fft(
            frame_data, fs, bandwidth, sweep_time, window_type
        )
        
        detection_mask = os_cfar_2d(rd_map_db, guard_cells=2, training_cells=6, p_fa=1e-3)
        detections = extract_detections(detection_mask, ranges, velocities, rd_map_db)
        
        beat_signal_avg = np.mean(frame_data, axis=0)
        spec_time, spec_freq, spec_power = generate_spectrogram(beat_signal_avg, fs)
        
        valid_detections = []
        for det in detections:
            if det['range'] <= 200 and det['range'] >= 1:
                valid_detections.append(det)
        
        valid_detections = valid_detections[:5]
        
        result = {
            'success': True,
            'ranges': ranges.tolist(),
            'range_profile': range_profile.tolist(),
            'velocities': velocities.tolist(),
            'velocity_profile': velocity_profile.tolist(),
            'rd_map': rd_map_db.tolist(),
            'true_distances': true_distances.tolist(),
            'true_velocities': true_velocities.tolist(),
            'true_rcs': true_rcs.tolist(),
            'detections': valid_detections,
            'detected_ranges': [d['range'] for d in valid_detections],
            'detected_velocities': [d['velocity'] for d in valid_detections],
            'detected_powers': [d['power'] for d in valid_detections],
            'max_unambiguous_range': float(max_unambiguous_range),
            'range_resolution': float(range_resolution),
            'max_unambiguous_velocity': float(max_unambiguous_velocity),
            'velocity_resolution': float(velocity_resolution),
            'spectrogram': {
                'time': spec_time,
                'freq': spec_freq,
                'power': spec_power
            },
            'iq_data': iq_data,
            'params': {
                'bandwidth': float(bandwidth),
                'sweep_time': float(sweep_time),
                'sample_rate': float(fs),
                'window_type': window_type,
                'num_chirps': num_chirps
            }
        }
        
        print(json.dumps(result))
        sys.stdout.flush()
        
    except Exception as e:
        import traceback
        result = {
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }
        print(json.dumps(result))
        sys.stdout.flush()

if __name__ == '__main__':
    main()
