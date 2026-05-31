import cv2
import numpy as np
from config import Config

class ImageProcessor:
    def __init__(self):
        pass
    
    def preprocess(self, image_path):
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Cannot load image: {image_path}")
        
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        
        thresh = cv2.adaptiveThreshold(
            blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
            cv2.THRESH_BINARY_INV, 11, 2
        )
        
        kernel = np.ones((2, 2), np.uint8)
        cleaned = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
        
        return img, gray, cleaned
    
    def detect_components(self, cleaned_img):
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(
            cleaned_img, connectivity=8
        )
        
        components = []
        for i in range(1, num_labels):
            x, y, w, h, area = stats[i]
            if Config.MIN_COMPONENT_SIZE < area < Config.MAX_COMPONENT_SIZE:
                aspect_ratio = w / h if h > 0 else 0
                components.append({
                    'id': i,
                    'x': x,
                    'y': y,
                    'width': w,
                    'height': h,
                    'area': area,
                    'centroid': (centroids[i][0], centroids[i][1]),
                    'aspect_ratio': aspect_ratio,
                    'mask': (labels == i).astype(np.uint8) * 255
                })
        
        return components
    
    def detect_wires(self, cleaned_img):
        horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (30, 1))
        vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 30))
        
        horizontal = cv2.morphologyEx(cleaned_img, cv2.MORPH_OPEN, horizontal_kernel)
        vertical = cv2.morphologyEx(cleaned_img, cv2.MORPH_OPEN, vertical_kernel)
        
        wires = cv2.add(horizontal, vertical)
        
        return wires
    
    def extract_component_image(self, original_img, component):
        x, y, w, h = component['x'], component['y'], component['width'], component['height']
        padding = 10
        x1 = max(0, x - padding)
        y1 = max(0, y - padding)
        x2 = min(original_img.shape[1], x + w + padding)
        y2 = min(original_img.shape[0], y + h + padding)
        
        return original_img[y1:y2, x1:x2]
