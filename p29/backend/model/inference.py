import base64
import io
import numpy as np
from PIL import Image
from typing import List, Tuple
import os

try:
    from .cnn3d import TENSORFLOW_AVAILABLE
except ImportError:
    TENSORFLOW_AVAILABLE = False

class LipReadingInference:
    def __init__(self, model_path: str = None):
        self.model = None
        self.model_path = model_path
        self._load_model()

    def _load_model(self):
        if not TENSORFLOW_AVAILABLE:
            print("TensorFlow not available, LipReadingInference disabled")
            return
            
        try:
            from .cnn3d import LipReading3DCNN
            self.model = LipReading3DCNN()
            
            if self.model_path and os.path.exists(self.model_path):
                self.model.load_weights(self.model_path)
                print(f"Model loaded from {self.model_path}")
            else:
                print("No pre-trained model found, using initialized weights")
        except Exception as e:
            print(f"Error loading model: {e}")
            self.model = None

    def is_ready(self) -> bool:
        return self.model is not None

    def _decode_frame(self, frame_b64: str) -> np.ndarray:
        try:
            if frame_b64.startswith('data:image'):
                frame_b64 = frame_b64.split(',')[1]
            
            img_data = base64.b64decode(frame_b64)
            img = Image.open(io.BytesIO(img_data))
            img = img.convert('L')
            img = img.resize((64, 64))
            
            return np.array(img)
        except Exception as e:
            print(f"Error decoding frame: {e}")
            return np.zeros((64, 64))

    def predict(self, frames: List[str]) -> Tuple[str, float]:
        if not self.is_ready():
            return 'silence', 0.0

        try:
            decoded_frames = [self._decode_frame(f) for f in frames]
            
            consonant, confidence = self.model.predict(decoded_frames)
            
            return consonant, confidence
        except Exception as e:
            print(f"Inference error: {e}")
            return 'silence', 0.0

class MockLipReadingInference:
    def __init__(self):
        self.class_names = [
            'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
            'g', 'k', 'h', 'j', 'q', 'x', 'zh', 'ch',
            'sh', 'r', 'z', 'c', 's', 'silence'
        ]
        self.counter = 0

    def is_ready(self) -> bool:
        return True

    def predict(self, frames: List[str]) -> Tuple[str, float]:
        self.counter += 1
        
        if self.counter % 30 < 5:
            idx = np.random.randint(0, 4)
            confidence = 0.7 + np.random.rand() * 0.3
        elif self.counter % 30 < 10:
            idx = np.random.randint(4, 8)
            confidence = 0.6 + np.random.rand() * 0.3
        else:
            idx = 21
            confidence = 0.9
        
        return self.class_names[idx], confidence
