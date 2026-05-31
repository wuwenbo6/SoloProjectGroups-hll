import cv2
import numpy as np
import torch
from pathlib import Path
import warnings
warnings.filterwarnings('ignore')


class PlateDetector:
    def __init__(self, model_path=None, device='cpu', conf_threshold=0.5):
        self.device = torch.device(device if torch.cuda.is_available() else 'cpu')
        self.conf_threshold = conf_threshold
        self.model = None
        self.use_yolo = False
        
        if model_path and Path(model_path).exists():
            self._load_yolo_model(model_path)
        else:
            print("YOLO model not found, using traditional detection method")
        
        self.legacy_detector = LegacyPlateDetector()
    
    def _load_yolo_model(self, model_path):
        try:
            self.model = torch.hub.load('ultralytics/yolov5', 'custom', 
                                       path=model_path, device=self.device, verbose=False)
            self.model.conf = self.conf_threshold
            self.use_yolo = True
            print(f"Loaded YOLOv5 model from {model_path}")
        except Exception as e:
            print(f"Failed to load YOLOv5 model: {e}")
            self.use_yolo = False
    
    def detect(self, image_array):
        if self.use_yolo and self.model is not None:
            try:
                return self._detect_with_yolo(image_array)
            except Exception as e:
                print(f"YOLO detection failed, using fallback: {e}")
        
        return self.legacy_detector.detect(image_array)
    
    def _detect_with_yolo(self, image_array):
        results = self.model(image_array)
        
        detections = []
        for *xyxy, conf, cls in results.xyxy[0]:
            x1, y1, x2, y2 = map(int, xyxy)
            confidence = float(conf)
            class_id = int(cls)
            
            plate_region = image_array[y1:y2, x1:x2]
            plate_color = self._detect_plate_color(plate_region)
            
            detections.append({
                'bbox': (x1, y1, x2, y2),
                'confidence': confidence,
                'color': plate_color,
                'plate_image': plate_region,
                'class_id': class_id
            })
        
        if not detections:
            return self.legacy_detector.detect(image_array)
        
        detections.sort(key=lambda x: x['confidence'], reverse=True)
        return detections[0] if detections else None
    
    def _detect_plate_color(self, plate_region):
        if plate_region.size == 0:
            return 'unknown'
        
        hsv = cv2.cvtColor(plate_region, cv2.COLOR_BGR2HSV)
        
        blue_lower = np.array([100, 50, 50])
        blue_upper = np.array([130, 255, 255])
        
        yellow_lower1 = np.array([20, 50, 50])
        yellow_upper1 = np.array([40, 255, 255])
        
        green_lower = np.array([35, 50, 50])
        green_upper = np.array([85, 255, 255])
        
        blue_mask = cv2.inRange(hsv, blue_lower, blue_upper)
        yellow_mask = cv2.inRange(hsv, yellow_lower1, yellow_upper1)
        green_mask = cv2.inRange(hsv, green_lower, green_upper)
        
        blue_pixels = cv2.countNonZero(blue_mask)
        yellow_pixels = cv2.countNonZero(yellow_mask)
        green_pixels = cv2.countNonZero(green_mask)
        
        max_pixels = max(blue_pixels, yellow_pixels, green_pixels)
        
        if max_pixels < 100:
            return 'unknown'
        elif max_pixels == blue_pixels:
            return 'blue'
        elif max_pixels == yellow_pixels:
            return 'yellow'
        else:
            return 'green'


class LegacyPlateDetector:
    def __init__(self):
        self.alphabet = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'
        self.provinces = [
            '京', '津', '沪', '渝', '冀', '豫', '云', '辽', '黑', '湘',
            '皖', '鲁', '新', '苏', '浙', '赣', '鄂', '桂', '甘', '晋',
            '蒙', '陕', '吉', '闽', '贵', '粤', '青', '藏', '川', '宁', '琼'
        ]
    
    def detect(self, image_array):
        gray = cv2.cvtColor(image_array, cv2.COLOR_BGR2GRAY)
        
        edges = cv2.Canny(gray, 100, 200)
        
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
        
        contours, _ = cv2.findContours(closed.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        possible_plates = []
        
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            aspect_ratio = w / h
            
            if 2.0 <= aspect_ratio <= 5.0 and 1000 <= w * h <= 50000:
                plate_region = image_array[y:y+h, x:x+w]
                plate_color = self._detect_plate_color(plate_region)
                
                confidence = self._calculate_confidence(contour, w, h, plate_region)
                
                possible_plates.append({
                    'bbox': (x, y, x + w, y + h),
                    'confidence': confidence,
                    'color': plate_color,
                    'plate_image': plate_region,
                    'aspect_ratio': aspect_ratio
                })
        
        if possible_plates:
            possible_plates.sort(key=lambda x: x['confidence'], reverse=True)
            return possible_plates[0]
        
        return None
    
    def _detect_plate_color(self, plate_region):
        if plate_region.size == 0:
            return 'unknown'
        
        hsv = cv2.cvtColor(plate_region, cv2.COLOR_BGR2HSV)
        
        blue_lower = np.array([100, 80, 80])
        blue_upper = np.array([140, 255, 255])
        
        yellow_lower = np.array([15, 80, 80])
        yellow_upper = np.array([40, 255, 255])
        
        green_lower = np.array([35, 80, 80])
        green_upper = np.array([85, 255, 255])
        
        blue_mask = cv2.inRange(hsv, blue_lower, blue_upper)
        yellow_mask = cv2.inRange(hsv, yellow_lower, yellow_upper)
        green_mask = cv2.inRange(hsv, green_lower, green_upper)
        
        blue_pixels = cv2.countNonZero(blue_mask)
        yellow_pixels = cv2.countNonZero(yellow_mask)
        green_pixels = cv2.countNonZero(green_mask)
        
        total_pixels = plate_region.shape[0] * plate_region.shape[1]
        
        blue_ratio = blue_pixels / total_pixels
        yellow_ratio = yellow_pixels / total_pixels
        green_ratio = green_pixels / total_pixels
        
        if blue_ratio > 0.2:
            return 'blue'
        elif yellow_ratio > 0.2:
            return 'yellow'
        elif green_ratio > 0.2:
            return 'green'
        else:
            return 'unknown'
    
    def _calculate_confidence(self, contour, w, h, plate_region):
        confidence = 0.5
        
        aspect_ratio = w / h
        if 2.5 <= aspect_ratio <= 4.5:
            confidence += 0.2
        
        peri = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
        if len(approx) == 4:
            confidence += 0.15
        
        area = cv2.contourArea(contour)
        rect_area = w * h
        extent = float(area) / rect_area
        if extent > 0.7:
            confidence += 0.15
        
        gray = cv2.cvtColor(plate_region, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        white_ratio = cv2.countNonZero(thresh) / (w * h)
        if 0.2 <= white_ratio <= 0.7:
            confidence += 0.1
        
        return min(confidence, 1.0)


def get_plate_detector(model_path=None, device='cpu', conf_threshold=0.5):
    return PlateDetector(model_path=model_path, device=device, conf_threshold=conf_threshold)
