import os
import random
import numpy as np
from PIL import Image, ImageOps, ImageEnhance
import cv2

CHINESE_CHARS = '的一是了我不人在他有这个上们来到时大地为子中你说生国年着就那和要她出也得里后自以会家可下而过天去能对小多然于心学么之都好看起发当没成只如事把还用第样道想作种开美总从无情己面最女但现前些所同日手又行意动方期它头经长儿回位分爱老因很给名法间斯知世什两次使身者被高已亲其进此话常与活正感见明问力理尔点文几定本公特做外孩相西果走将月十实向声车全信重三机工物气每并别真打太新比才便夫再书部水像眼少家经'

SIMILAR_CHARS = {
    '己': ['已', '巳', '已', '己'],
    '已': ['己', '巳', '己', '已'],
    '巳': ['己', '已', '已', '巳'],
    '日': ['曰', '目', '月', '日'],
    '曰': ['日', '目', '月', '曰'],
    '人': ['入', '八', '乂', '人'],
    '入': ['人', '八', '乂', '入'],
    '土': ['士', '工', '上', '土'],
    '士': ['土', '工', '上', '士'],
    '未': ['末', '本', '木', '未'],
    '末': ['未', '本', '木', '末'],
}

CONFUSION_MATRIX = {
    ('己', '已'): 0.85,
    ('己', '巳'): 0.75,
    ('已', '己'): 0.85,
    ('已', '巳'): 0.80,
    ('巳', '己'): 0.75,
    ('巳', '已'): 0.80,
}

class CRNNRecognizer:
    def __init__(self, model_path=None):
        self.characters = CHINESE_CHARS
        self.use_demo = True
        self.debug_logs = []
        
        if model_path and os.path.exists(model_path):
            try:
                self.load_model(model_path)
                self.use_demo = False
            except Exception as e:
                self._log('model_load_error', error=str(e))
                self.use_demo = True
        
        if self.use_demo:
            self._log('mode_info', message='CRNN running in DEMO mode - with similar chars support')
            print('CRNN running in DEMO mode - with similar chars support')
    
    def _log(self, event_type, **kwargs):
        log_entry = {
            'timestamp': np.datetime64('now').item().isoformat(),
            'event': event_type,
            **kwargs
        }
        self.debug_logs.append(log_entry)
        if len(self.debug_logs) > 100:
            self.debug_logs = self.debug_logs[-100:]
    
    def load_model(self, model_path):
        pass
    
    def recognize(self, image):
        self._log('recognize_start', image_size=image.size)
        
        preprocessed = self.preprocess_image(image)
        self._log('preprocessed', size=preprocessed.size)
        
        if self.use_demo:
            result = self._demo_recognize(image, preprocessed)
        else:
            result = self._real_recognize(image)
        
        result = self._apply_similar_char_boost(result, image)
        
        self._log('recognize_end', result=result['text'], confidence=result['confidence'])
        return result
    
    def _demo_recognize(self, image, preprocessed):
        img_array = np.array(image)
        brightness = np.mean(img_array)
        aspect_ratio = img_array.shape[1] / max(img_array.shape[0], 1)
        
        self._log('demo_recognize', brightness=brightness, aspect_ratio=aspect_ratio)
        
        is_similar_char_region = self._detect_similar_char_region(preprocessed)
        self._log('similar_char_detection', detected=is_similar_char_region)
        
        if is_similar_char_region:
            base_char = random.choice(['己', '已', '巳', '日', '曰', '人', '入', '土', '士', '未', '末'])
            candidates = self._generate_similar_candidates(base_char)
        else:
            num_chars = max(1, min(5, int(img_array.shape[1] / 30)))
            candidates = []
            for _ in range(random.randint(3, 6)):
                char = random.choice(self.characters)
                confidence = random.uniform(0.3, 0.95)
                candidates.append({'char': char, 'confidence': confidence})
        
        candidates.sort(key=lambda x: x['confidence'], reverse=True)
        
        main_char = candidates[0]['char']
        main_confidence = candidates[0]['confidence']
        
        return {
            'text': main_char,
            'confidence': main_confidence,
            'candidates': candidates
        }
    
    def _detect_similar_char_region(self, image):
        img_array = np.array(image)
        if len(img_array.shape) > 2:
            img_array = np.mean(img_array, axis=2)
        
        aspect_ratio = img_array.shape[1] / max(img_array.shape[0], 1)
        density = np.mean(img_array > 50)
        
        is_compact = 0.6 < aspect_ratio < 1.4
        has_medium_density = 0.2 < density < 0.6
        
        result = is_compact and has_medium_density
        self._log('similar_char_detection_detail', aspect_ratio=aspect_ratio, density=density, result=result)
        return result
    
    def _generate_similar_candidates(self, base_char):
        candidates = []
        
        if base_char in SIMILAR_CHARS:
            similar_chars = SIMILAR_CHARS[base_char]
            for i, char in enumerate(similar_chars):
                base_conf = 0.95 - (i * 0.15)
                confidence = base_conf + random.uniform(-0.05, 0.05)
                confidence = max(0.1, min(0.99, confidence))
                candidates.append({'char': char, 'confidence': confidence})
        
        for _ in range(random.randint(1, 3)):
            char = random.choice(self.characters)
            if char not in [c['char'] for c in candidates]:
                confidence = random.uniform(0.1, 0.5)
                candidates.append({'char': char, 'confidence': confidence})
        
        return candidates
    
    def _apply_similar_char_boost(self, result, image):
        text = result['text']
        candidates = result['candidates']
        
        enhanced_candidates = []
        for cand in candidates:
            char = cand['char']
            conf = cand['confidence']
            
            if text in SIMILAR_CHARS and char in SIMILAR_CHARS[text]:
                key = tuple(sorted([text, char]))
                if key in CONFUSION_MATRIX:
                    similarity = CONFUSION_MATRIX[key]
                    adjusted_conf = conf * (0.8 + 0.2 * similarity)
                else:
                    adjusted_conf = conf * 0.9
            else:
                adjusted_conf = conf * 0.7
            
            enhanced_candidates.append({
                'char': char,
                'confidence': min(0.99, adjusted_conf),
                'is_similar': text in SIMILAR_CHARS and char in SIMILAR_CHARS.get(text, [])
            })
        
        enhanced_candidates.sort(key=lambda x: x['confidence'], reverse=True)
        
        return {
            'text': result['text'],
            'confidence': result['confidence'],
            'candidates': enhanced_candidates[:5]
        }
    
    def _real_recognize(self, image):
        return {
            'text': '字',
            'confidence': 0.9,
            'candidates': [
                {'char': '字', 'confidence': 0.9},
                {'char': '学', 'confidence': 0.7},
                {'char': '子', 'confidence': 0.5}
            ]
        }
    
    def preprocess_image(self, image, target_size=(100, 32)):
        self._log('preprocess_start', original_size=image.size)
        
        img_cv2 = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2GRAY)
        
        skew_angle = self._detect_skew(img_cv2)
        self._log('skew_detection', angle=skew_angle)
        
        if abs(skew_angle) > 0.5:
            image = self._correct_skew(image, skew_angle)
            self._log('skew_corrected', new_size=image.size)
        
        if image.mode != 'L':
            image = image.convert('L')
        
        image = ImageOps.invert(image)
        
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(1.5)
        
        enhancer = ImageEnhance.Sharpness(image)
        image = enhancer.enhance(1.2)
        
        ratio = min(target_size[0] / image.width, target_size[1] / image.height)
        new_size = (int(image.width * ratio), int(image.height * ratio))
        image = image.resize(new_size, Image.Resampling.LANCZOS)
        
        new_image = Image.new('L', target_size, 0)
        paste_pos = ((target_size[0] - new_size[0]) // 2, (target_size[1] - new_size[1]) // 2)
        new_image.paste(image, paste_pos)
        
        self._log('preprocess_end', final_size=new_image.size)
        return new_image
    
    def _detect_skew(self, gray_image):
        try:
            blur = cv2.GaussianBlur(gray_image, (3, 3), 0)
            
            edges = cv2.Canny(blur, 50, 150, apertureSize=3)
            
            lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=50, 
                                    minLineLength=20, maxLineGap=10)
            
            if lines is not None and len(lines) > 0:
                angles = []
                for line in lines:
                    x1, y1, x2, y2 = line[0]
                    angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
                    if abs(angle) < 45:
                        angles.append(angle)
                
                if len(angles) > 0:
                    median_angle = np.median(angles)
                    self._last_detected_angle = median_angle
                    return median_angle
            
            thresh = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
            
            coords = np.column_stack(np.where(thresh > 0))
            
            if len(coords) < 10:
                self._last_detected_angle = 0.0
                return 0.0
            
            angle = cv2.minAreaRect(coords)[-1]
            
            if angle < -45:
                angle = -(90 + angle)
            else:
                angle = -angle
            
            self._last_detected_angle = angle
            return angle
        except Exception as e:
            self._log('skew_detection_error', error=str(e))
            self._last_detected_angle = 0.0
            return 0.0
    
    def _correct_skew(self, image, angle):
        image_np = np.array(image)
        
        (h, w) = image_np.shape[:2]
        center = (w // 2, h // 2)
        
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(image_np, M, (w, h),
                                 flags=cv2.INTER_CUBIC,
                                 borderMode=cv2.BORDER_REPLICATE)
        
        return Image.fromarray(rotated)
    
    def get_debug_logs(self):
        return self.debug_logs
    
    def clear_debug_logs(self):
        self.debug_logs = []
