import cv2
import numpy as np
from paddleocr import PaddleOCR
from config import Config

class ComponentRecognizer:
    def __init__(self):
        self.ocr = PaddleOCR(
            use_angle_cls=True,
            lang=Config.PADDLEOCR_LANG,
            use_gpu=Config.PADDLEOCR_USE_GPU,
            show_log=False
        )
    
    def classify_component(self, component, component_img):
        aspect_ratio = component['aspect_ratio']
        area = component['area']
        h, w = component_img.shape[:2]
        
        gray = cv2.cvtColor(component_img, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150)
        
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        has_parallel_lines = self._check_parallel_lines(edges)
        has_curves = self._check_curves(contours)
        has_rectangle = self._check_rectangle(contours)
        
        component_type = 'UNKNOWN'
        confidence = 0.0
        rotation_angle = 0
        pin_positions = []
        
        if has_rectangle:
            pin_positions, pin_count, rotation_angle = self._detect_ic_pins_and_orientation(component_img, gray)
            
            if pin_count >= 4:
                component_type = 'IC'
                confidence = 0.85
                
                if rotation_angle != 0:
                    component_img = self._rotate_image(component_img, rotation_angle)
                    gray = cv2.cvtColor(component_img, cv2.COLOR_BGR2GRAY)
            elif pin_count == 2:
                component_type = 'RESISTOR'
                confidence = 0.6
        elif has_parallel_lines and 0.3 < aspect_ratio < 3.0:
            component_type = 'RESISTOR'
            confidence = 0.75
            pin_count = 2
        elif has_curves and aspect_ratio > 0.5:
            component_type = 'CAPACITOR'
            confidence = 0.7
            pin_count = 2
        else:
            pin_count = 2
        
        ocr_text = self._recognize_text(component_img)
        
        return {
            'type': component_type,
            'confidence': confidence,
            'text': ocr_text,
            'pin_count': pin_count,
            'rotation_angle': rotation_angle,
            'pin_positions': pin_positions,
            'features': {
                'parallel_lines': has_parallel_lines,
                'curves': has_curves,
                'rectangle': has_rectangle,
                'pins': pin_count
            }
        }
    
    def _check_parallel_lines(self, edges):
        lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=20, 
                                minLineLength=10, maxLineGap=5)
        if lines is None:
            return False
        
        angles = []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            angle = np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi
            angles.append(angle)
        
        for i in range(len(angles)):
            for j in range(i + 1, len(angles)):
                diff = abs(angles[i] - angles[j])
                if diff < 10 or abs(diff - 180) < 10:
                    return True
        return False
    
    def _check_curves(self, contours):
        if not contours:
            return False
        
        for contour in contours:
            if len(contour) >= 5:
                ellipse = cv2.fitEllipse(contour)
                if ellipse[1][0] > 5 and ellipse[1][1] > 5:
                    return True
        return False
    
    def _check_rectangle(self, contours):
        if not contours:
            return False
        
        for contour in contours:
            approx = cv2.approxPolyDP(contour, 0.02 * cv2.arcLength(contour, True), True)
            if len(approx) == 4:
                return True
        return False
    
    def _detect_ic_pins_and_orientation(self, component_img, gray_img):
        h, w = gray_img.shape
        
        edges = cv2.Canny(gray_img, 50, 150)
        
        left_pins = self._detect_pins_on_edge(gray_img, 'left')
        right_pins = self._detect_pins_on_edge(gray_img, 'right')
        top_pins = self._detect_pins_on_edge(gray_img, 'top')
        bottom_pins = self._detect_pins_on_edge(gray_img, 'bottom')
        
        pin_positions = []
        for pos in left_pins:
            pin_positions.append({'side': 'left', 'position': pos})
        for pos in right_pins:
            pin_positions.append({'side': 'right', 'position': pos})
        for pos in top_pins:
            pin_positions.append({'side': 'top', 'position': pos})
        for pos in bottom_pins:
            pin_positions.append({'side': 'bottom', 'position': pos})
        
        pin_count = len(pin_positions)
        
        rotation_angle = 0
        left_right_count = len(left_pins) + len(right_pins)
        top_bottom_count = len(top_pins) + len(bottom_pins)
        
        if left_right_count >= 4 and top_bottom_count <= 2:
            rotation_angle = 0
        elif top_bottom_count >= 4 and left_right_count <= 2:
            rotation_angle = 90 if len(top_pins) >= 2 else -90
        
        if pin_count >= 4:
            pin_positions = self._assign_pin_numbers(pin_positions, rotation_angle, w, h)
        
        return pin_positions, min(16, pin_count), rotation_angle
    
    def _detect_pins_on_edge(self, gray_img, edge):
        h, w = gray_img.shape
        pins = []
        
        if edge == 'left':
            edge_region = gray_img[:, 0:min(10, w)]
            _, binary = cv2.threshold(edge_region, 100, 255, cv2.THRESH_BINARY_INV)
            projection = np.sum(binary, axis=1)
            pin_regions = self._find_peaks(projection, threshold=50)
            for y in pin_regions:
                pins.append((5, y))
        
        elif edge == 'right':
            edge_region = gray_img[:, max(0, w-10):w]
            _, binary = cv2.threshold(edge_region, 100, 255, cv2.THRESH_BINARY_INV)
            projection = np.sum(binary, axis=1)
            pin_regions = self._find_peaks(projection, threshold=50)
            for y in pin_regions:
                pins.append((w-5, y))
        
        elif edge == 'top':
            edge_region = gray_img[0:min(10, h), :]
            _, binary = cv2.threshold(edge_region, 100, 255, cv2.THRESH_BINARY_INV)
            projection = np.sum(binary, axis=0)
            pin_regions = self._find_peaks(projection, threshold=50)
            for x in pin_regions:
                pins.append((x, 5))
        
        elif edge == 'bottom':
            edge_region = gray_img[max(0, h-10):h, :]
            _, binary = cv2.threshold(edge_region, 100, 255, cv2.THRESH_BINARY_INV)
            projection = np.sum(binary, axis=0)
            pin_regions = self._find_peaks(projection, threshold=50)
            for x in pin_regions:
                pins.append((x, h-5))
        
        return pins
    
    def _find_peaks(self, array, threshold=50, min_distance=10):
        peaks = []
        i = 0
        while i < len(array):
            if array[i] > threshold:
                peak_start = i
                while i < len(array) and array[i] > threshold:
                    i += 1
                peak_end = i
                peak_center = (peak_start + peak_end) // 2
                if not peaks or (peak_center - peaks[-1]) >= min_distance:
                    peaks.append(peak_center)
            else:
                i += 1
        return peaks
    
    def _assign_pin_numbers(self, pin_positions, rotation_angle, img_w, img_h):
        left_pins = [p for p in pin_positions if p['side'] == 'left']
        right_pins = [p for p in pin_positions if p['side'] == 'right']
        top_pins = [p for p in pin_positions if p['side'] == 'top']
        bottom_pins = [p for p in pin_positions if p['side'] == 'bottom']
        
        left_pins.sort(key=lambda p: p['position'][1], reverse=True)
        right_pins.sort(key=lambda p: p['position'][1])
        top_pins.sort(key=lambda p: p['position'][0])
        bottom_pins.sort(key=lambda p: p['position'][0], reverse=True)
        
        pin_number = 1
        for pin in left_pins:
            pin['pin_number'] = pin_number
            pin_number += 1
        
        if top_pins and len(top_pins) == 1:
            top_pins[0]['pin_number'] = pin_number
            pin_number += 1
        
        for pin in right_pins:
            pin['pin_number'] = pin_number
            pin_number += 1
        
        if bottom_pins and len(bottom_pins) == 1:
            bottom_pins[0]['pin_number'] = pin_number
            pin_number += 1
        
        return pin_positions
    
    def _rotate_image(self, image, angle):
        h, w = image.shape[:2]
        center = (w // 2, h // 2)
        rotation_matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
        
        abs_cos = abs(rotation_matrix[0, 0])
        abs_sin = abs(rotation_matrix[0, 1])
        
        new_w = int(h * abs_sin + w * abs_cos)
        new_h = int(h * abs_cos + w * abs_sin)
        
        rotation_matrix[0, 2] += new_w / 2 - center[0]
        rotation_matrix[1, 2] += new_h / 2 - center[1]
        
        rotated = cv2.warpAffine(image, rotation_matrix, (new_w, new_h), 
                                 flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        return rotated
    
    def _recognize_text(self, component_img):
        try:
            result = self.ocr.ocr(component_img, cls=True)
            texts = []
            if result and result[0]:
                for line in result[0]:
                    if line and len(line) >= 2:
                        texts.append(line[1][0])
            return ' '.join(texts)
        except Exception as e:
            print(f"OCR error: {e}")
            return ''
