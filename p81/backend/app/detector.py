from ultralytics import YOLO
from collections import defaultdict
from typing import List, Dict, Tuple
import os
import cv2
import numpy as np
from PIL import Image


class ImagePreprocessor:
    @staticmethod
    def enhance_contrast(image: np.ndarray, clip_limit: float = 2.0, tile_grid_size: Tuple[int, int] = (8, 8)) -> np.ndarray:
        if len(image.shape) == 3:
            lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)
            l = clahe.apply(l)
            lab = cv2.merge((l, a, b))
            return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
        else:
            clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)
            return clahe.apply(image)

    @staticmethod
    def adjust_gamma(image: np.ndarray, gamma: float = 1.2) -> np.ndarray:
        inv_gamma = 1.0 / gamma
        table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in np.arange(0, 256)]).astype("uint8")
        return cv2.LUT(image, table)

    @staticmethod
    def denoise(image: np.ndarray, strength: int = 5) -> np.ndarray:
        if len(image.shape) == 3:
            return cv2.fastNlMeansDenoisingColored(image, None, strength, strength, 7, 21)
        return cv2.fastNlMeansDenoising(image, None, strength, 7, 21)

    @staticmethod
    def sharpen(image: np.ndarray) -> np.ndarray:
        kernel = np.array([[-1, -1, -1],
                           [-1,  9, -1],
                           [-1, -1, -1]])
        return cv2.filter2D(image, -1, kernel)

    @staticmethod
    def process_infrared(image: np.ndarray) -> np.ndarray:
        image = ImagePreprocessor.enhance_contrast(image, clip_limit=3.0, tile_grid_size=(4, 4))
        image = ImagePreprocessor.adjust_gamma(image, gamma=1.1)
        image = ImagePreprocessor.denoise(image, strength=3)
        return image


class SmallObjectDetector:
    def __init__(self, model: YOLO, animal_classes: Dict[int, str]):
        self.model = model
        self.animal_classes = animal_classes

    def detect_sliding_window(self, image: np.ndarray, conf_threshold: float, iou_threshold: float) -> List:
        h, w = image.shape[:2]
        all_detections = []

        scales = [1.0, 1.5, 2.0]
        overlap = 0.2

        for scale in scales:
            if scale > 1.0:
                scaled = cv2.resize(image, (int(w * scale), int(h * scale)))
            else:
                scaled = image.copy()

            sh, sw = scaled.shape[:2]
            win_size = min(640, min(sh, sw))
            step = int(win_size * (1 - overlap))

            for y in range(0, sh - win_size + 1, step):
                for x in range(0, sw - win_size + 1, step):
                    window = scaled[y:y + win_size, x:x + win_size]
                    results = self.model(window, conf=conf_threshold, iou=iou_threshold, verbose=False)
                    
                    for result in results:
                        for box in result.boxes:
                            class_id = int(box.cls[0])
                            if class_id in self.animal_classes:
                                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                                x1 = (x1 + x) / scale
                                y1 = (y1 + y) / scale
                                x2 = (x2 + x) / scale
                                y2 = (y2 + y) / scale
                                
                                all_detections.append({
                                    'class_id': class_id,
                                    'bbox': [x1, y1, x2, y2],
                                    'confidence': float(box.conf[0])
                                })

        return all_detections

    def nms(self, detections: List[Dict], iou_threshold: float = 0.5) -> List[Dict]:
        if not detections:
            return []

        detections = sorted(detections, key=lambda x: x['confidence'], reverse=True)
        keep = []

        while detections:
            current = detections.pop(0)
            keep.append(current)

            remaining = []
            for det in detections:
                iou = self.calculate_iou(current['bbox'], det['bbox'])
                if iou < iou_threshold:
                    remaining.append(det)
            detections = remaining

        return keep

    @staticmethod
    def calculate_iou(box1: List[float], box2: List[float]) -> float:
        x1 = max(box1[0], box2[0])
        y1 = max(box1[1], box2[1])
        x2 = min(box1[2], box2[2])
        y2 = min(box1[3], box2[3])

        if x2 <= x1 or y2 <= y1:
            return 0.0

        intersection = (x2 - x1) * (y2 - y1)
        area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
        area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
        union = area1 + area2 - intersection

        return intersection / union if union > 0 else 0.0


class AnimalDetector:
    def __init__(self, model_path: str = "yolov8m.pt"):
        self.model = YOLO(model_path)
        self.preprocessor = ImagePreprocessor()
        self.small_obj_detector = SmallObjectDetector(self.model, self._get_animal_classes())
        
        self.animal_classes = self._get_animal_classes()
        self.conf_threshold = 0.25
        self.iou_threshold = 0.5
        self.enable_preprocessing = True
        self.enable_small_object_detection = True

    @staticmethod
    def _get_animal_classes() -> Dict[int, str]:
        return {
            14: "bird",
            15: "cat",
            16: "dog",
            17: "horse",
            18: "sheep",
            19: "cow",
            20: "elephant",
            21: "bear",
            22: "zebra",
            23: "giraffe"
        }

    def detect(self, image_path: str, conf_threshold: float = None, enable_preprocessing: bool = None, enable_small_object: bool = None) -> List[Dict]:
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image file not found: {image_path}")

        conf_threshold = conf_threshold if conf_threshold is not None else self.conf_threshold
        enable_preprocessing = enable_preprocessing if enable_preprocessing is not None else self.enable_preprocessing
        enable_small_object = enable_small_object if enable_small_object is not None else self.enable_small_object_detection

        image = cv2.imread(image_path)
        if image is None:
            raise ValueError(f"Failed to load image: {image_path}")

        if enable_preprocessing:
            processed_image = self.preprocessor.process_infrared(image)
        else:
            processed_image = image

        detections = defaultdict(lambda: {"count": 0, "confidences": []})

        results = self.model(processed_image, conf=conf_threshold, iou=self.iou_threshold, verbose=False)
        
        for result in results:
            for box in result.boxes:
                class_id = int(box.cls[0])
                if class_id in self.animal_classes:
                    species = self.animal_classes[class_id]
                    confidence = float(box.conf[0])
                    detections[species]["count"] += 1
                    detections[species]["confidences"].append(confidence)

        if enable_small_object:
            small_detections = self.small_obj_detector.detect_sliding_window(
                processed_image, conf_threshold * 0.9, self.iou_threshold
            )
            small_detections = self.small_obj_detector.nms(small_detections, self.iou_threshold)
            
            for det in small_detections:
                species = self.animal_classes[det['class_id']]
                detections[species]["count"] += 1
                detections[species]["confidences"].append(det['confidence'])

        result_list = []
        for species, data in detections.items():
            avg_conf = sum(data["confidences"]) / len(data["confidences"])
            result_list.append({
                "species": species,
                "count": data["count"],
                "confidence": f"{avg_conf:.2f}"
            })

        return result_list

    def detect_with_original_image(self, image_path: str) -> List[Dict]:
        return self.detect(image_path, enable_preprocessing=False, enable_small_object=False)

    def detect_enhanced(self, image_path: str) -> List[Dict]:
        return self.detect(image_path, enable_preprocessing=True, enable_small_object=True)


detector = AnimalDetector()
