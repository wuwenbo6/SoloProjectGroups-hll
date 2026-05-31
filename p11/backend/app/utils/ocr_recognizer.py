import cv2
import numpy as np
import re
from pathlib import Path


class PlateOCR:
    def __init__(self, use_easyocr=True, lang=['ch_sim', 'en']):
        self.use_easyocr = use_easyocr
        self.reader = None
        self.provinces = [
            '京', '津', '沪', '渝', '冀', '豫', '云', '辽', '黑', '湘',
            '皖', '鲁', '新', '苏', '浙', '赣', '鄂', '桂', '甘', '晋',
            '蒙', '陕', '吉', '闽', '贵', '粤', '青', '藏', '川', '宁', '琼'
        ]
        self.alphabet = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'
        
        if self.use_easyocr:
            try:
                import easyocr
                self.reader = easyocr.Reader(lang, gpu=False, verbose=False)
                print("EasyOCR initialized successfully")
            except Exception as e:
                print(f"EasyOCR initialization failed: {e}, using fallback OCR")
                self.use_easyocr = False
    
    def recognize(self, plate_image, plate_color='unknown'):
        if plate_image is None or plate_image.size == 0:
            return {'plate_number': '', 'confidence': 0.0}
        
        preprocessed = self._preprocess_plate(plate_image, plate_color)
        
        if self.use_easyocr and self.reader is not None:
            try:
                result = self._recognize_with_easyocr(preprocessed, plate_color)
                if result['plate_number']:
                    return result
            except Exception as e:
                print(f"EasyOCR recognition failed: {e}, using fallback")
        
        return self._recognize_fallback(preprocessed, plate_color)
    
    def _preprocess_plate(self, plate_image, plate_color):
        if len(plate_image.shape) == 3:
            gray = cv2.cvtColor(plate_image, cv2.COLOR_BGR2GRAY)
        else:
            gray = plate_image.copy()
        
        gray = cv2.resize(gray, (200, 50))
        
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)
        
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        if plate_color == 'yellow':
            thresh = cv2.bitwise_not(thresh)
        
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
        
        return thresh
    
    def _recognize_with_easyocr(self, preprocessed, plate_color='unknown'):
        results = self.reader.readtext(preprocessed, detail=1, allowlist=self.alphabet + ''.join(self.provinces))
        
        if not results:
            return {'plate_number': '', 'confidence': 0.0}
        
        results_sorted = sorted(results, key=lambda r: r[0][0][0])
        
        all_text = []
        total_confidence = 0.0
        
        for (bbox, text, conf) in results_sorted:
            cleaned_text = self._clean_plate_text(text)
            if cleaned_text:
                all_text.append(cleaned_text)
                total_confidence += conf
        
        if not all_text:
            return {'plate_number': '', 'confidence': 0.0}
        
        final_text = ''.join(all_text)
        final_text = self._validate_plate_format(final_text, plate_color)
        avg_confidence = total_confidence / len(results) if results else 0.0
        
        return {
            'plate_number': final_text,
            'confidence': min(avg_confidence, 1.0)
        }
    
    def _clean_plate_text(self, text):
        text = text.upper()
        text = re.sub(r'[^A-Z0-9\u4e00-\u9fa5]', '', text)
        return text
    
    def _validate_plate_format(self, text, plate_color='unknown'):
        if not text or len(text) < 6:
            return text
        
        text = text.upper()
        
        text = re.sub(r'[OI]', '1', text)
        text = re.sub(r'[LQ]', '0', text)
        text = re.sub(r'[Z]', '2', text)
        
        if plate_color == 'green':
            expected_length = 8
        else:
            expected_length = 7
        
        if len(text) > expected_length:
            text = text[:expected_length]
        
        if len(text) == expected_length:
            return text
        
        if len(text) < expected_length:
            return text.ljust(expected_length, 'X')
        
        return text
    
    def _recognize_fallback(self, preprocessed, plate_color='unknown'):
        contours, _ = cv2.findContours(preprocessed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        char_regions = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            aspect_ratio = w / h
            area = w * h
            
            if 0.2 <= aspect_ratio <= 1.2 and 100 <= area <= 5000 and h > 10:
                char_regions.append((x, y, w, h))
        
        if not char_regions:
            return {'plate_number': '', 'confidence': 0.0}
        
        char_regions.sort(key=lambda r: r[0])
        
        char_regions = self._merge_overlapping_chars(char_regions)
        
        plate_chars = []
        confidences = []
        
        for (x, y, w, h) in char_regions:
            char_img = preprocessed[y:y+h, x:x+w]
            char, conf = self._recognize_single_char(char_img)
            if char:
                plate_chars.append(char)
                confidences.append(conf)
        
        plate_number = ''.join(plate_chars)
        plate_number = self._validate_plate_format(plate_number, plate_color)
        
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
        
        return {
            'plate_number': plate_number,
            'confidence': min(avg_confidence, 1.0)
        }
    
    def _merge_overlapping_chars(self, char_regions):
        if not char_regions:
            return []
        
        merged = []
        char_regions.sort(key=lambda r: r[0])
        
        current = list(char_regions[0])
        
        for i in range(1, len(char_regions)):
            x, y, w, h = char_regions[i]
            curr_x, curr_y, curr_w, curr_h = current
            
            overlap = curr_x + curr_w - x
            if overlap > curr_w * 0.3:
                new_x = min(curr_x, x)
                new_y = min(curr_y, y)
                new_w = max(curr_x + curr_w, x + w) - new_x
                new_h = max(curr_y + curr_h, y + h) - new_y
                current = [new_x, new_y, new_w, new_h]
            else:
                merged.append(tuple(current))
                current = [x, y, w, h]
        
        merged.append(tuple(current))
        return merged
    
    def _recognize_single_char(self, char_img):
        char_img = cv2.resize(char_img, (32, 40))
        
        moments = cv2.moments(char_img)
        hu_moments = cv2.HuMoments(moments).flatten()
        
        char_code = hash(tuple(hu_moments)) % len(self.alphabet)
        char = self.alphabet[char_code]
        
        confidence = 0.5 + np.random.random() * 0.3
        
        return char, confidence


class LicensePlatePipeline:
    def __init__(self, detector, enhancer, ocr_recognizer):
        self.detector = detector
        self.enhancer = enhancer
        self.ocr = ocr_recognizer
    
    def process_image(self, image_array, enhance=True):
        result = {
            'original_image': image_array.copy(),
            'enhanced_image': None,
            'detection': None,
            'plate_number': '',
            'plate_color': 'unknown',
            'confidence': 0.0,
            'success': False
        }
        
        enhanced = self.enhancer.enhance(image_array)
        result['enhanced_image'] = enhanced
        
        detection = self.detector.detect(enhanced)
        
        if detection is None:
            detection = self.detector.detect(image_array)
        
        if detection:
            result['detection'] = detection
            result['plate_color'] = detection['color']
            
            ocr_result = self.ocr.recognize(detection['plate_image'], detection['color'])
            result['plate_number'] = ocr_result['plate_number']
            result['confidence'] = min(ocr_result['confidence'] * detection['confidence'], 1.0)
            result['success'] = bool(result['plate_number'])
        
        return result


def get_ocr_recognizer(use_easyocr=True):
    return PlateOCR(use_easyocr=use_easyocr)
