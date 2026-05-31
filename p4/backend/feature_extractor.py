import librosa
import numpy as np
import os
from typing import Tuple, List, Optional
import warnings
warnings.filterwarnings('ignore')


class NoiseReducer:
    @staticmethod
    def spectral_subtraction(y: np.ndarray, sr: int, n_fft: int = 2048, 
                             hop_length: int = 512) -> np.ndarray:
        stft = librosa.stft(y, n_fft=n_fft, hop_length=hop_length)
        magnitude = np.abs(stft)
        phase = np.angle(stft)
        
        noise_estimation_frames = min(10, magnitude.shape[1])
        noise_profile = np.mean(magnitude[:, :noise_estimation_frames], axis=1, keepdims=True)
        
        alpha = 2.0
        beta = 0.01
        magnitude_clean = np.maximum(magnitude - alpha * noise_profile, beta * magnitude)
        
        stft_clean = magnitude_clean * np.exp(1j * phase)
        y_clean = librosa.istft(stft_clean, hop_length=hop_length)
        
        return y_clean
    
    @staticmethod
    def wiener_filter(y: np.ndarray, sr: int) -> np.ndarray:
        n_fft = 2048
        hop_length = 512
        
        stft = librosa.stft(y, n_fft=n_fft, hop_length=hop_length)
        magnitude = np.abs(stft)
        phase = np.angle(stft)
        
        noise_est = np.mean(magnitude[:, :5], axis=1, keepdims=True)
        snr = magnitude / (noise_est + 1e-8)
        wiener_gain = snr / (snr + 1)
        
        magnitude_clean = magnitude * wiener_gain
        stft_clean = magnitude_clean * np.exp(1j * phase)
        y_clean = librosa.istft(stft_clean, hop_length=hop_length)
        
        return y_clean
    
    @staticmethod
    def reduce_noise(y: np.ndarray, sr: int, method: str = 'combined') -> np.ndarray:
        if method == 'spectral':
            return NoiseReducer.spectral_subtraction(y, sr)
        elif method == 'wiener':
            return NoiseReducer.wiener_filter(y, sr)
        elif method == 'combined':
            y1 = NoiseReducer.spectral_subtraction(y, sr)
            y2 = NoiseReducer.wiener_filter(y1, sr)
            return y2
        return y


class VoiceActivityDetector:
    def __init__(self, sr: int = 22050, frame_length: int = 2048, hop_length: int = 512):
        self.sr = sr
        self.frame_length = frame_length
        self.hop_length = hop_length
    
    def detect(self, y: np.ndarray, energy_threshold: float = 0.01, 
               zcr_threshold: float = 0.1) -> np.ndarray:
        rms = librosa.feature.rms(y=y, frame_length=self.frame_length, 
                                  hop_length=self.hop_length)[0]
        zcr = librosa.feature.zero_crossing_rate(y, frame_length=self.frame_length,
                                                  hop_length=self.hop_length)[0]
        
        energy_mask = rms > energy_threshold * np.max(rms)
        zcr_mask = zcr > zcr_threshold
        
        vad_mask = energy_mask & zcr_mask
        
        vad_mask = self._smooth_mask(vad_mask, window_size=3)
        
        return vad_mask
    
    def _smooth_mask(self, mask: np.ndarray, window_size: int = 3) -> np.ndarray:
        kernel = np.ones(window_size) / window_size
        smoothed = np.convolve(mask.astype(float), kernel, mode='same')
        return smoothed > 0.5
    
    def get_active_segments(self, y: np.ndarray, min_duration: float = 0.5) -> List[Tuple[int, int]]:
        vad_mask = self.detect(y)
        
        hop_length = self.hop_length
        segments = []
        in_segment = False
        start_frame = 0
        
        for i, is_active in enumerate(vad_mask):
            if is_active and not in_segment:
                start_frame = i
                in_segment = True
            elif not is_active and in_segment:
                duration = (i - start_frame) * hop_length / self.sr
                if duration >= min_duration:
                    start_sample = start_frame * hop_length
                    end_sample = i * hop_length
                    segments.append((start_sample, end_sample))
                in_segment = False
        
        if in_segment:
            duration = (len(vad_mask) - start_frame) * hop_length / self.sr
            if duration >= min_duration:
                start_sample = start_frame * hop_length
                end_sample = len(y)
                segments.append((start_sample, end_sample))
        
        return segments
    
    def extract_active_audio(self, y: np.ndarray) -> Optional[np.ndarray]:
        segments = self.get_active_segments(y)
        
        if not segments:
            return None
        
        active_parts = []
        for start, end in segments:
            active_parts.append(y[start:end])
        
        if active_parts:
            return np.concatenate(active_parts)
        return None


class AudioChunker:
    def __init__(self, sr: int = 22050, chunk_duration: float = 5.0, 
                 overlap: float = 1.0):
        self.sr = sr
        self.chunk_duration = chunk_duration
        self.overlap = overlap
    
    def chunk_audio(self, y: np.ndarray) -> List[np.ndarray]:
        chunk_samples = int(self.chunk_duration * self.sr)
        hop_samples = int((self.chunk_duration - self.overlap) * self.sr)
        
        chunks = []
        start = 0
        
        while start + chunk_samples <= len(y):
            chunk = y[start:start + chunk_samples]
            chunks.append(chunk)
            start += hop_samples
        
        if start < len(y):
            last_chunk = np.zeros(chunk_samples, dtype=y.dtype)
            last_chunk[:len(y) - start] = y[start:]
            chunks.append(last_chunk)
        
        if not chunks and len(y) > 0:
            last_chunk = np.zeros(chunk_samples, dtype=y.dtype)
            last_chunk[:len(y)] = y[:min(len(y), chunk_samples)]
            chunks.append(last_chunk)
        
        return chunks


class FeatureExtractor:
    def __init__(self, sample_rate: int = 22050, n_mfcc: int = 40, 
                 n_fft: int = 2048, hop_length: int = 512,
                 apply_noise_reduction: bool = True,
                 apply_vad: bool = True,
                 chunk_duration: float = 5.0):
        self.sample_rate = sample_rate
        self.n_mfcc = n_mfcc
        self.n_fft = n_fft
        self.hop_length = hop_length
        self.apply_noise_reduction = apply_noise_reduction
        self.apply_vad = apply_vad
        
        self.noise_reducer = NoiseReducer()
        self.vad = VoiceActivityDetector(sample_rate, n_fft, hop_length)
        self.chunker = AudioChunker(sample_rate, chunk_duration)
    
    def load_audio(self, file_path: str, max_duration: float = 120) -> Tuple[np.ndarray, int]:
        try:
            y, sr = librosa.load(file_path, sr=self.sample_rate, duration=max_duration)
            if len(y) < self.sample_rate * 0.5:
                y = np.pad(y, (0, self.sample_rate * 1 - len(y)), mode='constant')
            return y, sr
        except Exception as e:
            raise RuntimeError(f"Error loading audio file: {e}")
    
    def preprocess_audio(self, y: np.ndarray) -> Tuple[np.ndarray, dict]:
        stats = {
            'original_duration': len(y) / self.sample_rate,
            'noise_reduced': False,
            'vad_applied': False,
            'active_duration': 0
        }
        
        y_processed = y.copy()
        
        if self.apply_noise_reduction:
            y_processed = self.noise_reducer.reduce_noise(y_processed, self.sample_rate)
            stats['noise_reduced'] = True
        
        if self.apply_vad:
            y_active = self.vad.extract_active_audio(y_processed)
            if y_active is not None and len(y_active) > 0:
                y_processed = y_active
                stats['vad_applied'] = True
                stats['active_duration'] = len(y_active) / self.sample_rate
        
        stats['final_duration'] = len(y_processed) / self.sample_rate
        
        return y_processed, stats
    
    def extract_mfcc(self, y: np.ndarray) -> np.ndarray:
        mfcc = librosa.feature.mfcc(
            y=y, sr=self.sample_rate, n_mfcc=self.n_mfcc,
            n_fft=self.n_fft, hop_length=self.hop_length
        )
        return mfcc
    
    def _extract_features_single(self, y: np.ndarray) -> np.ndarray:
        mfcc = self.extract_mfcc(y)
        mfcc_mean = np.mean(mfcc, axis=1)
        mfcc_var = np.var(mfcc, axis=1)
        mfcc_max = np.max(mfcc, axis=1)
        mfcc_min = np.min(mfcc, axis=1)
        mfcc_median = np.median(mfcc, axis=1)
        
        delta_mfcc = librosa.feature.delta(mfcc)
        delta2_mfcc = librosa.feature.delta(mfcc, order=2)
        delta_mean = np.mean(delta_mfcc, axis=1)
        delta2_mean = np.mean(delta2_mfcc, axis=1)
        
        spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=self.sample_rate)
        spectral_bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=self.sample_rate)
        spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=self.sample_rate)
        spectral_flatness = librosa.feature.spectral_flatness(y=y)
        zero_crossing_rate = librosa.feature.zero_crossing_rate(y)
        rms = librosa.feature.rms(y=y)
        
        features = np.concatenate([
            mfcc_mean, mfcc_var, mfcc_max, mfcc_min, mfcc_median,
            delta_mean, delta2_mean,
            [np.mean(spectral_centroid), np.mean(spectral_bandwidth),
             np.mean(spectral_rolloff), np.mean(spectral_flatness),
             np.mean(zero_crossing_rate), np.mean(rms)]
        ])
        
        return features
    
    def extract_features(self, y: np.ndarray, aggregate: bool = True) -> np.ndarray:
        y_processed, stats = self.preprocess_audio(y)
        
        if len(y_processed) < self.sample_rate * 0.5:
            y_processed = y
        
        chunks = self.chunker.chunk_audio(y_processed)
        
        if not chunks:
            chunks = [y_processed]
        
        chunk_features = []
        for chunk in chunks:
            feat = self._extract_features_single(chunk)
            chunk_features.append(feat)
        
        chunk_features = np.array(chunk_features)
        
        if aggregate:
            agg_mean = np.mean(chunk_features, axis=0)
            agg_var = np.var(chunk_features, axis=0)
            agg_max = np.max(chunk_features, axis=0)
            return np.concatenate([agg_mean, agg_var, agg_max])
        
        return chunk_features
    
    def extract_from_file(self, file_path: str) -> np.ndarray:
        y, _ = self.load_audio(file_path)
        return self.extract_features(y)
    
    def get_processing_stats(self, file_path: str) -> dict:
        y, sr = self.load_audio(file_path)
        _, stats = self.preprocess_audio(y)
        return stats
    
    def generate_spectrogram(self, y: np.ndarray, output_path: str, 
                             use_denoised: bool = True) -> str:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        
        if use_denoised and self.apply_noise_reduction:
            y = self.noise_reducer.reduce_noise(y, self.sample_rate)
        
        D = librosa.amplitude_to_db(np.abs(librosa.stft(y)), ref=np.max)
        
        plt.figure(figsize=(10, 4))
        librosa.display.specshow(D, sr=self.sample_rate, x_axis='time', y_axis='hz')
        plt.colorbar(format='%+2.0f dB')
        plt.title('Spectrogram (Denoised)')
        plt.tight_layout()
        plt.savefig(output_path, dpi=100, bbox_inches='tight')
        plt.close()
        
        return output_path
