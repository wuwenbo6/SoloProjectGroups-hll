import numpy as np
from scipy import signal
import tensorflow as tf
from tensorflow.keras import layers, models, Model
import os


class ArtifactDetector:
    def __init__(self, sampling_rate=256):
        self.sampling_rate = sampling_rate
        
    def detect_emg_artifact(self, eeg_data):
        eeg_data = np.array(eeg_data)
        
        artifact_scores = []
        
        for channel in range(eeg_data.shape[1]):
            channel_data = eeg_data[:, channel]
            
            f, t, Zxx = signal.stft(channel_data, fs=self.sampling_rate, nperseg=64)
            power_spectrum = np.abs(Zxx)
            
            low_freq_mask = (f >= 0.5) & (f <= 30)
            high_freq_mask = (f >= 30) & (f <= 100)
            
            low_freq_power = np.mean(power_spectrum[low_freq_mask, :])
            high_freq_power = np.mean(power_spectrum[high_freq_mask, :])
            
            hf_lf_ratio = high_freq_power / (low_freq_power + 1e-8)
            
            amplitude_std = np.std(channel_data)
            amplitude_range = np.max(channel_data) - np.min(channel_data)
            
            derivative = np.diff(channel_data)
            spike_count = np.sum(np.abs(derivative) > np.mean(np.abs(derivative)) * 3)
            
            zero_crossings = np.sum(np.diff(np.sign(channel_data)) != 0)
            zcr_rate = zero_crossings / len(channel_data)
            
            score = 0.0
            score += min(1.0, hf_lf_ratio / 2.0) * 0.35
            score += min(1.0, amplitude_std / 100.0) * 0.25
            score += min(1.0, spike_count / 20.0) * 0.25
            score += min(1.0, zcr_rate * 10) * 0.15
            
            artifact_scores.append(score)
        
        max_artifact_score = np.max(artifact_scores)
        avg_artifact_score = np.mean(artifact_scores)
        
        is_emg_artifact = (max_artifact_score > 0.6) or (avg_artifact_score > 0.45)
        
        return {
            'is_emg_artifact': is_emg_artifact,
            'artifact_score': float(max_artifact_score),
            'channel_scores': [float(s) for s in artifact_scores]
        }
    
    def detect_eog_artifact(self, eeg_data):
        eeg_data = np.array(eeg_data)
        
        if eeg_data.shape[1] < 4:
            return {'is_eog_artifact': False, 'eog_score': 0.0}
        
        front_channels = eeg_data[:, 1:3]
        back_channels = eeg_data[:, [0, 3]]
        
        front_power = np.mean(np.abs(front_channels))
        back_power = np.mean(np.abs(back_channels))
        
        front_back_ratio = front_power / (back_power + 1e-8)
        
        low_freq_front = self._band_power(front_channels.flatten(), 0.5, 4)
        low_freq_back = self._band_power(back_channels.flatten(), 0.5, 4)
        
        delta_ratio = low_freq_front / (low_freq_back + 1e-8)
        
        eog_score = min(1.0, (front_back_ratio - 1) / 2.0) * 0.5
        eog_score += min(1.0, (delta_ratio - 1) / 1.5) * 0.5
        
        is_eog_artifact = eog_score > 0.55
        
        return {
            'is_eog_artifact': is_eog_artifact,
            'eog_score': float(eog_score)
        }
    
    def _band_power(self, data, low_freq, high_freq):
        f, Pxx = signal.welch(data, fs=self.sampling_rate, nperseg=128)
        freq_mask = (f >= low_freq) & (f <= high_freq)
        return np.mean(Pxx[freq_mask])


class SeizureDetectionCNN:
    def __init__(self, sampling_rate=256, window_size=256):
        self.sampling_rate = sampling_rate
        self.window_size = window_size
        self.artifact_detector = ArtifactDetector(sampling_rate)
        self.model = self._build_multitask_model()
        self._load_or_create_weights()

    def _build_multitask_model(self):
        input_layer = layers.Input(shape=(self.window_size, 4, 1))
        
        x = layers.Conv2D(32, (5, 2), activation='relu', padding='same')(input_layer)
        x = layers.BatchNormalization()(x)
        x = layers.MaxPooling2D((2, 1))(x)
        x = layers.Dropout(0.3)(x)
        
        x = layers.Conv2D(64, (5, 2), activation='relu', padding='same')(x)
        x = layers.BatchNormalization()(x)
        x = layers.MaxPooling2D((2, 1))(x)
        x = layers.Dropout(0.3)(x)
        
        x = layers.Conv2D(128, (5, 2), activation='relu', padding='same')(x)
        x = layers.BatchNormalization()(x)
        x = layers.MaxPooling2D((2, 1))(x)
        x = layers.Dropout(0.3)(x)
        
        x = layers.Flatten()(x)
        
        shared = layers.Dense(256, activation='relu')(x)
        shared = layers.Dropout(0.5)(shared)
        shared = layers.Dense(128, activation='relu')(shared)
        
        seizure_output = layers.Dense(1, activation='sigmoid', name='seizure')(shared)
        artifact_output = layers.Dense(1, activation='sigmoid', name='artifact')(shared)
        
        model = Model(inputs=input_layer, outputs=[seizure_output, artifact_output])
        
        model.compile(
            optimizer='adam',
            loss={
                'seizure': 'binary_crossentropy',
                'artifact': 'binary_crossentropy'
            },
            loss_weights={
                'seizure': 1.0,
                'artifact': 0.7
            },
            metrics={
                'seizure': ['accuracy', tf.keras.metrics.AUC(name='auc')],
                'artifact': ['accuracy']
            }
        )
        
        return model

    def _load_or_create_weights(self):
        weights_path = os.path.join(os.path.dirname(__file__), '..', 'models', 'seizure_model_weights.h5')
        if os.path.exists(weights_path):
            try:
                self.model.load_weights(weights_path)
            except:
                print("Weights shape mismatch, using initialized weights")
        else:
            print("No pre-trained weights found. Using initialized weights.")
            os.makedirs(os.path.dirname(weights_path), exist_ok=True)

    def preprocess_eeg(self, eeg_data):
        eeg_data = np.array(eeg_data)
        
        if eeg_data.shape[0] < self.window_size:
            pad_size = self.window_size - eeg_data.shape[0]
            eeg_data = np.pad(eeg_data, ((0, pad_size), (0, 0)), mode='edge')
        elif eeg_data.shape[0] > self.window_size:
            eeg_data = eeg_data[-self.window_size:, :]
        
        eeg_data = self._bandpass_filter(eeg_data, 0.5, 70)
        eeg_data = (eeg_data - np.mean(eeg_data, axis=0)) / (np.std(eeg_data, axis=0) + 1e-8)
        
        return eeg_data.reshape(1, self.window_size, 4, 1)

    def _bandpass_filter(self, data, lowcut, highcut):
        nyquist = 0.5 * self.sampling_rate
        low = lowcut / nyquist
        high = highcut / nyquist
        b, a = signal.butter(4, [low, high], btype='band')
        filtered = np.zeros_like(data)
        for i in range(data.shape[1]):
            filtered[:, i] = signal.filtfilt(b, a, data[:, i])
        return filtered

    def predict(self, eeg_data):
        eeg_array = np.array(eeg_data)
        
        emg_result = self.artifact_detector.detect_emg_artifact(eeg_array)
        eog_result = self.artifact_detector.detect_eog_artifact(eeg_array)
        
        has_artifact = emg_result['is_emg_artifact'] or eog_result['is_eog_artifact']
        artifact_confidence = max(emg_result['artifact_score'], eog_result['eog_score'])
        
        processed_data = self.preprocess_eeg(eeg_data)
        seizure_pred, artifact_pred = self.model.predict(processed_data, verbose=0)
        
        seizure_confidence = float(seizure_pred[0][0])
        cnn_artifact_score = float(artifact_pred[0][0])
        
        final_artifact_score = max(
            emg_result['artifact_score'],
            eog_result['eog_score'],
            cnn_artifact_score
        )
        
        seizure_threshold = 0.7
        if final_artifact_score > 0.6:
            seizure_threshold = 0.85
        elif final_artifact_score > 0.4:
            seizure_threshold = 0.78
        
        is_seizure = seizure_confidence > seizure_threshold
        
        adjusted_confidence = seizure_confidence
        if has_artifact and is_seizure:
            adjusted_confidence = max(0.3, seizure_confidence * (1 - final_artifact_score * 0.5))
            is_seizure = adjusted_confidence > seizure_threshold
        
        artifact_type = None
        if emg_result['is_emg_artifact']:
            artifact_type = 'emg'
        elif eog_result['is_eog_artifact']:
            artifact_type = 'eog'
        
        return {
            'is_seizure': is_seizure,
            'confidence': float(adjusted_confidence),
            'raw_confidence': float(seizure_confidence),
            'seizure_type': 'generalized' if is_seizure and adjusted_confidence > 0.9 else 'focal' if is_seizure else None,
            'has_artifact': has_artifact,
            'artifact_type': artifact_type,
            'artifact_score': float(final_artifact_score),
            'emg_score': emg_result['artifact_score'],
            'eog_score': eog_result['eog_score'],
            'emg_channel_scores': emg_result['channel_scores']
        }

    def save_weights(self):
        weights_path = os.path.join(os.path.dirname(__file__), '..', 'models', 'seizure_model_weights.h5')
        os.makedirs(os.path.dirname(weights_path), exist_ok=True)
        self.model.save_weights(weights_path)


seizure_model = SeizureDetectionCNN()
