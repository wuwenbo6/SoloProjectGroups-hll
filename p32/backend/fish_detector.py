from ultralytics import YOLO
import torch
import numpy as np
from pathlib import Path


class FishDetector:
    def __init__(self, model_path: str = None, device: str = None):
        if device is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
        self.device = device
        
        if model_path and Path(model_path).exists():
            self.model = YOLO(model_path)
        else:
            self.model = YOLO("yolov8n.pt")
        
        self.fish_classes = {
            0: "fish",
            1: "tuna",
            2: "salmon",
            3: "shark",
            4: "clownfish",
            5: "goldfish"
        }
    
    def detect(self, frame: np.ndarray, conf_threshold: float = 0.3):
        results = self.model(frame, conf=conf_threshold, device=self.device, verbose=False)
        
        detections = []
        for result in results:
            for box in result.boxes:
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                
                cls_name = self._get_class_name(cls_id, result.names)
                
                detections.append({
                    "bbox": [float(x1), float(y1), float(x2), float(y2)],
                    "confidence": conf,
                    "class_id": cls_id,
                    "class_name": cls_name
                })
        
        return detections
    
    def _get_class_name(self, cls_id: int, names: dict) -> str:
        name = names.get(cls_id, "unknown").lower()
        
        fish_keywords = ["fish", "tuna", "salmon", "shark", "goldfish", "trout", "bass", "carp"]
        for keyword in fish_keywords:
            if keyword in name:
                return keyword
        
        if any(fish in name for fish in ["animal", "creature", "object"]):
            return "fish"
        
        return "fish"
    
    def get_fish_class_names(self) -> dict:
        return self.fish_classes
