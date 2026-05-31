import numpy as np
from scipy.fft import fft, fftfreq

class HarmonicAnalyzer:
    def __init__(self, fs=1000, f0=50, max_harmonic=50, window_type='hanning'):
        self.fs = fs
        self.f0 = f0
        self.max_harmonic = max_harmonic
        self.window_type = window_type
    
    def _get_window(self, n):
        if self.window_type is None or self.window_type == 'none':
            window = np.ones(n)
            correction = 1.0
        elif self.window_type == 'hanning':
            window = np.hanning(n)
            correction = 1.0 / np.mean(window)
        elif self.window_type == 'hamming':
            window = np.hamming(n)
            correction = 1.0 / np.mean(window)
        elif self.window_type == 'blackman':
            window = np.blackman(n)
            correction = 1.0 / np.mean(window)
        elif self.window_type == 'flattop':
            window = self._flattop_window(n)
            correction = 1.0 / np.mean(window)
        else:
            window = np.blackman(n)
            correction = 1.0 / np.mean(window)
        
        return window, correction
    
    def _flattop_window(self, n):
        a0 = 0.21557895
        a1 = 0.41663158
        a2 = 0.277263158
        a3 = 0.083578947
        a4 = 0.006947368
        
        x = 2 * np.pi * np.arange(n) / (n - 1)
        window = (a0 - a1 * np.cos(x) + a2 * np.cos(2*x) - 
                 a3 * np.cos(3*x) + a4 * np.cos(4*x))
        return window
    
    def compute_fft(self, signal):
        n = len(signal)
        
        window, correction = self._get_window(n)
        
        windowed_signal = signal * window
        
        yf = fft(windowed_signal)
        xf = fftfreq(n, 1 / self.fs)[:n//2]
        
        amplitude = correction * 2.0 / n * np.abs(yf[:n//2])
        
        return xf, amplitude, yf
    
    def _interpolate_peak(self, freq_bin, amplitude, target_freq):
        idx = np.argmin(np.abs(freq_bin - target_freq))
        
        if idx <= 0 or idx >= len(amplitude) - 1:
            return amplitude[idx], freq_bin[idx]
        
        y0 = amplitude[idx - 1]
        y1 = amplitude[idx]
        y2 = amplitude[idx + 1]
        
        d = (y2 - y0) / (2 * (2 * y1 - y0 - y2))
        
        true_amp = y1 - 0.25 * (y0 - y2) * d
        true_freq = freq_bin[idx] + d * (freq_bin[1] - freq_bin[0])
        
        return true_amp, true_freq
    
    def find_harmonics(self, signal):
        xf, amplitude, _ = self.compute_fft(signal)
        
        harmonics = {}
        
        for h in range(1, self.max_harmonic + 1):
            target_freq = h * self.f0
            peak_amp, peak_freq = self._interpolate_peak(xf, amplitude, target_freq)
            harmonics[h] = peak_amp
        
        return harmonics, xf, amplitude
    
    def compute_thd(self, signal):
        harmonics, xf, amplitude = self.find_harmonics(signal)
        
        fundamental = harmonics.get(1, 1e-10)
        
        harmonic_sum = 0
        for h in range(2, self.max_harmonic + 1):
            harmonic_sum += harmonics.get(h, 0) ** 2
        
        thd = np.sqrt(harmonic_sum) / fundamental * 100
        
        harmonic_contents = {}
        for h in range(1, self.max_harmonic + 1):
            harmonic_contents[h] = (harmonics.get(h, 0) / fundamental * 100) if fundamental > 0 else 0
        
        return thd, harmonic_contents, harmonics, xf, amplitude
    
    def compute_three_phase_thd(self, phase_a, phase_b, phase_c):
        thd_a, contents_a, _, xf, amp_a = self.compute_thd(phase_a)
        thd_b, contents_b, _, _, amp_b = self.compute_thd(phase_b)
        thd_c, contents_c, _, _, amp_c = self.compute_thd(phase_c)
        
        avg_thd = (thd_a + thd_b + thd_c) / 3
        
        return {
            'thd_a': thd_a,
            'thd_b': thd_b,
            'thd_c': thd_c,
            'avg_thd': avg_thd,
            'contents_a': contents_a,
            'contents_b': contents_b,
            'contents_c': contents_c,
            'frequencies': xf.tolist(),
            'amplitude_a': amp_a.tolist(),
            'amplitude_b': amp_b.tolist(),
            'amplitude_c': amp_c.tolist(),
            'window_type': self.window_type
        }
