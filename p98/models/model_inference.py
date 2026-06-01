import os
import cv2
import numpy as np
from typing import Tuple, Dict, List, Optional

try:
    from openvino.runtime import Core
    OPENVINO_AVAILABLE = True
except ImportError:
    OPENVINO_AVAILABLE = False
    print("OpenVINO not available, using simulation mode")

from models.beauty_suggestions import DefectDetector, BeautySuggestionEngine, MultiFaceAnalyzer


class ImagePreprocessor:
    @staticmethod
    def correct_illumination(img: np.ndarray) -> np.ndarray:
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        l = clahe.apply(l)
        
        lab = cv2.merge((l, a, b))
        img_corrected = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
        
        return img_corrected
    
    @staticmethod
    def white_balance(img: np.ndarray) -> np.ndarray:
        result = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        avg_a = np.average(result[:, :, 1])
        avg_b = np.average(result[:, :, 2])
        
        result[:, :, 1] = result[:, :, 1] - ((avg_a - 128) * (result[:, :, 0] / 255.0) * 1.1)
        result[:, :, 2] = result[:, :, 2] - ((avg_b - 128) * (result[:, :, 0] / 255.0) * 1.1)
        
        result = cv2.cvtColor(result, cv2.COLOR_LAB2BGR)
        return result
    
    @staticmethod
    def normalize_brightness(img: np.ndarray) -> np.ndarray:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        current_brightness = np.mean(gray)
        target_brightness = 127
        
        if current_brightness == 0:
            return img
        
        ratio = target_brightness / current_brightness
        
        img_normalized = img.astype(np.float32)
        img_normalized = img_normalized * ratio
        img_normalized = np.clip(img_normalized, 0, 255)
        img_normalized = img_normalized.astype(np.uint8)
        
        return img_normalized
    
    @staticmethod
    def reduce_noise(img: np.ndarray) -> np.ndarray:
        return cv2.bilateralFilter(img, d=5, sigmaColor=50, sigmaSpace=50)
    
    @staticmethod
    def full_preprocess(img: np.ndarray) -> np.ndarray:
        img = ImagePreprocessor.normalize_brightness(img)
        img = ImagePreprocessor.white_balance(img)
        img = ImagePreprocessor.correct_illumination(img)
        img = ImagePreprocessor.reduce_noise(img)
        return img


class FaceDetector:
    def __init__(self):
        self.face_cascade = None
        self.eye_cascade = None
        self._init_cascades()
    
    def _init_cascades(self):
        try:
            face_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            eye_path = cv2.data.haarcascades + 'haarcascade_eye.xml'
            
            if os.path.exists(face_path):
                self.face_cascade = cv2.CascadeClassifier(face_path)
            if os.path.exists(eye_path):
                self.eye_cascade = cv2.CascadeClassifier(eye_path)
        except Exception as e:
            print(f"Warning: Could not load face cascades: {e}")
    
    def detect_face(self, img: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
        if self.face_cascade is None:
            h, w = img.shape[:2]
            return (int(w*0.2), int(h*0.2), int(w*0.6), int(h*0.6))
        
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        faces = self.face_cascade.detectMultiScale(gray, 1.3, 5, minSize=(50, 50))
        
        if len(faces) == 0:
            faces = self.face_cascade.detectMultiScale(gray, 1.1, 3, minSize=(30, 30))
        
        if len(faces) > 0:
            return max(faces, key=lambda f: f[2] * f[3])
        
        return None
    
    def detect_eyes(self, face_roi: np.ndarray) -> List[Tuple[int, int, int, int]]:
        if self.eye_cascade is None:
            return []
        
        eyes = self.eye_cascade.detectMultiScale(face_roi, 1.1, 5)
        return eyes[:2]
    
    def analyze_pose(self, img: np.ndarray, face_rect: Tuple[int, int, int, int]) -> Dict[str, any]:
        x, y, w, h = face_rect
        face_roi = img[y:y+h, x:x+w]
        
        eyes = self.detect_eyes(face_roi)
        
        pose_score = 0.5
        pose_warnings = []
        is_profile = False
        
        if len(eyes) == 2:
            eye1, eye2 = eyes[:2]
            eye1_center = (eye1[0] + eye1[2]//2, eye1[1] + eye1[3]//2)
            eye2_center = (eye2[0] + eye2[2]//2, eye2[1] + eye2[3]//2)
            
            dx = abs(eye1_center[0] - eye2_center[0])
            dy = abs(eye1_center[1] - eye2_center[1])
            
            eye_dist_ratio = dx / w
            
            if eye_dist_ratio < 0.2:
                is_profile = True
                pose_warnings.append("可能为侧脸，检测特征点不足")
                pose_score = 0.2
            elif dy > w * 0.1:
                pose_warnings.append("头部倾斜角度较大")
                pose_score = 0.6
            else:
                pose_score = 0.9
        elif len(eyes) == 1:
            pose_warnings.append("仅检测到一只眼睛，可能为侧脸")
            pose_score = 0.3
            is_profile = True
        else:
            pose_warnings.append("未检测到眼睛，面部特征不清晰")
            pose_score = 0.2
        
        gray = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY)
        left_half = gray[:, :w//2]
        right_half = gray[:, w//2:]
        
        left_mean = np.mean(left_half)
        right_mean = np.mean(right_half)
        symmetry_diff = abs(left_mean - right_mean) / 255.0
        
        if symmetry_diff > 0.2:
            pose_warnings.append("面部两侧光照不均，可能影响评分")
            pose_score *= 0.8
        
        return {
            "pose_score": pose_score,
            "warnings": pose_warnings,
            "is_profile": is_profile,
            "eyes_detected": len(eyes)
        }


class QualityAssessor:
    @staticmethod
    def assess_illumination(img: np.ndarray) -> Dict[str, any]:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        mean_brightness = np.mean(gray)
        std_brightness = np.std(gray)
        
        brightness_score = 1.0 - abs(mean_brightness - 127) / 127
        
        uniformity_score = max(0, 1.0 - std_brightness / 127)
        
        hist, _ = np.histogram(gray, bins=256, range=(0, 256))
        dark_pixels = np.sum(hist[:50]) / hist.sum()
        bright_pixels = np.sum(hist[200:]) / hist.sum()
        
        extreme_lighting = dark_pixels + bright_pixels
        lighting_score = max(0, 1.0 - extreme_lighting * 2)
        
        overall_score = (brightness_score * 0.4 + uniformity_score * 0.3 + lighting_score * 0.3)
        
        warnings = []
        if mean_brightness < 60:
            warnings.append("图像偏暗")
        elif mean_brightness > 200:
            warnings.append("图像偏亮")
        
        if std_brightness > 80:
            warnings.append("光照对比度太高")
        
        if extreme_lighting > 0.3:
            warnings.append("存在极端光照区域（过暗或过曝）")
        
        return {
            "overall_score": overall_score,
            "brightness_score": brightness_score,
            "uniformity_score": uniformity_score,
            "lighting_score": lighting_score,
            "mean_brightness": mean_brightness,
            "warnings": warnings
        }
    
    @staticmethod
    def assess_sharpness(img: np.ndarray) -> Dict[str, any]:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        
        sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        gradient_mag = np.sqrt(sobelx**2 + sobely**2)
        gradient_mean = np.mean(gradient_mag)
        
        sharpness_score = min(laplacian_var / 500.0, 1.0)
        
        warnings = []
        if laplacian_var < 100:
            warnings.append("图像模糊，可能影响识别精度")
        
        return {
            "laplacian_variance": laplacian_var,
            "gradient_mean": gradient_mean,
            "sharpness_score": sharpness_score,
            "warnings": warnings
        }
    
    @staticmethod
    def full_assessment(img: np.ndarray) -> Dict[str, any]:
        illumination = QualityAssessor.assess_illumination(img)
        sharpness = QualityAssessor.assess_sharpness(img)
        
        overall_score = (illumination["overall_score"] * 0.6 + sharpness["sharpness_score"] * 0.4)
        
        all_warnings = illumination["warnings"] + sharpness["warnings"]
        
        return {
            "overall_quality": overall_score,
            "illumination": illumination,
            "sharpness": sharpness,
            "warnings": all_warnings
        }


class BeautyAgePredictor:
    def __init__(self, use_openvino: bool = True):
        self.use_openvino = use_openvino and OPENVINO_AVAILABLE
        self.ie = None
        self.beauty_model = None
        self.age_model = None
        self.beauty_input_layer = None
        self.age_input_layer = None
        
        self.face_detector = FaceDetector()
        self.preprocessor = ImagePreprocessor()
        self.quality_assessor = QualityAssessor()
        self.defect_detector = DefectDetector()
        self.suggestion_engine = BeautySuggestionEngine()
        self.multi_face_analyzer = MultiFaceAnalyzer(self.face_detector)
        
        self.age_groups = [
            (0, 2, "0-2岁"),
            (3, 9, "3-9岁"),
            (10, 19, "10-19岁"),
            (20, 29, "20-29岁"),
            (30, 39, "30-39岁"),
            (40, 49, "40-49岁"),
            (50, 59, "50-59岁"),
            (60, 100, "60+岁")
        ]
        
        if self.use_openvino:
            self._load_models()
        else:
            print("Using simulation mode for beauty and age prediction")
    
    def _load_models(self):
        try:
            self.ie = Core()
            
            beauty_model_path = "models/beauty_model.xml"
            age_model_path = "models/age_model.xml"
            
            if os.path.exists(beauty_model_path) and os.path.exists(age_model_path):
                beauty_model = self.ie.read_model(model=beauty_model_path)
                self.beauty_model = self.ie.compile_model(model=beauty_model, device_name="CPU")
                self.beauty_input_layer = self.beauty_model.input(0)
                
                age_model = self.ie.read_model(model=age_model_path)
                self.age_model = self.ie.compile_model(model=age_model, device_name="CPU")
                self.age_input_layer = self.age_model.input(0)
                print("OpenVINO models loaded successfully")
            else:
                print("Model files not found, using simulation mode")
                self.use_openvino = False
        except Exception as e:
            print(f"Error loading OpenVINO models: {e}, using simulation mode")
            self.use_openvino = False
    
    def _preprocess_image(self, img: np.ndarray, target_size: Tuple[int, int] = (224, 224)) -> np.ndarray:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        img = cv2.resize(img, target_size)
        img = img.astype(np.float32) / 255.0
        img = np.transpose(img, (2, 0, 1))
        img = np.expand_dims(img, axis=0)
        return img
    
    def _simulate_beauty_score(self, img: np.ndarray, quality: Dict, pose: Dict) -> Tuple[float, float]:
        face_rect = self.face_detector.detect_face(img)
        
        if face_rect is not None:
            x, y, w, h = face_rect
            face_img = img[y:y+h, x:x+w]
        else:
            face_img = img
        
        preprocessed_face = self.preprocessor.full_preprocess(face_img)
        
        gray = cv2.cvtColor(preprocessed_face, cv2.COLOR_BGR2GRAY)
        brightness = np.mean(gray) / 255.0
        
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        sharpness = min(laplacian_var / 300.0, 1.0)
        
        hsv = cv2.cvtColor(preprocessed_face, cv2.COLOR_BGR2HSV)
        saturation = np.mean(hsv[:, :, 1]) / 255.0
        
        edges = cv2.Canny(gray, 50, 150)
        edge_density = np.sum(edges > 0) / (gray.shape[0] * gray.shape[1])
        feature_score = min(edge_density * 10, 1.0)
        
        base_score = (brightness * 2 + sharpness * 3 + saturation * 2 + feature_score * 3)
        
        quality_factor = quality["overall_quality"] * 0.5 + 0.5
        pose_factor = pose["pose_score"] * 0.5 + 0.5
        
        adjusted_score = base_score * quality_factor * pose_factor
        
        adjusted_score = max(0.0, min(10.0, adjusted_score))
        
        confidence = quality["overall_quality"] * pose["pose_score"]
        
        return adjusted_score, confidence
    
    def _simulate_age(self, img: np.ndarray, quality: Dict, pose: Dict) -> Tuple[int, int, str, float]:
        face_rect = self.face_detector.detect_face(img)
        
        if face_rect is not None:
            x, y, w, h = face_rect
            face_img = img[y:y+h, x:x+w]
        else:
            face_img = img
        
        preprocessed_face = self.preprocessor.full_preprocess(face_img)
        
        gray = cv2.cvtColor(preprocessed_face, cv2.COLOR_BGR2GRAY)
        contrast = np.std(gray)
        
        h, w = face_img.shape[:2]
        aspect_ratio = h / w if w > 0 else 1
        
        avg_brightness = np.mean(gray)
        
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        texture_detail = min(laplacian_var / 1000.0, 1.0)
        
        base_age = 25
        if contrast < 30:
            base_age = 10
        elif contrast < 45:
            base_age = 18
        elif contrast < 60:
            base_age = 28
        elif contrast < 75:
            base_age = 38
        elif contrast < 90:
            base_age = 48
        else:
            base_age = 58
        
        if texture_detail > 0.5:
            base_age += 10
        elif texture_detail < 0.2:
            base_age -= 8
        
        if aspect_ratio > 1.3:
            base_age -= 5
        elif aspect_ratio < 0.9:
            base_age += 5
        
        base_age = max(0, min(80, base_age))
        
        quality_factor = quality["overall_quality"]
        pose_factor = pose["pose_score"]
        confidence = quality_factor * pose_factor
        
        if confidence < 0.3:
            age_range = 15
        elif confidence < 0.6:
            age_range = 10
        else:
            age_range = 5
        
        age_min = max(0, base_age - age_range)
        age_max = min(100, base_age + age_range)
        
        for group_min, group_max, group_name in self.age_groups:
            mid_point = (group_min + group_max) / 2
            if group_min <= base_age <= group_max:
                return group_min, group_max, group_name, confidence
        
        return 60, 100, "60+岁", confidence
    
    def predict(self, image_path: str) -> Dict[str, any]:
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Cannot read image: {image_path}")
        
        quality = self.quality_assessor.full_assessment(img)
        
        face_rect = self.face_detector.detect_face(img)
        if face_rect is not None:
            pose = self.face_detector.analyze_pose(img, face_rect)
        else:
            pose = {
                "pose_score": 0.3,
                "warnings": ["未检测到人脸"],
                "is_profile": False,
                "eyes_detected": 0
            }
        
        all_warnings = quality["warnings"] + pose["warnings"]
        
        if self.use_openvino and self.beauty_model and self.age_model:
            result = self._predict_with_openvino(img, quality, pose, all_warnings)
        else:
            result = self._predict_simulation(img, quality, pose, all_warnings)
        
        if face_rect is not None:
            x, y, w, h = face_rect
            face_img = img[y:y+h, x:x+w]
            defects = self.defect_detector.detect_skin_issues(face_img)
            suggestions = self.suggestion_engine.generate_suggestions(defects)
            result["beauty_suggestions"] = suggestions
            result["skin_defects"] = defects
        else:
            result["beauty_suggestions"] = None
            result["skin_defects"] = None
        
        return result
    
    def predict_multi_face(self, image_path: str) -> Dict[str, any]:
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Cannot read image: {image_path}")
        
        faces = self.multi_face_analyzer.detect_multiple_faces(img)
        
        if len(faces) == 0:
            return {
                "face_count": 0,
                "faces": [],
                "message": "未检测到人脸"
            }
        
        face_results = []
        
        for idx, face_rect in enumerate(faces):
            x, y, w, h = face_rect
            face_img = img[y:y+h, x:x+w]
            
            quality = self.quality_assessor.full_assessment(face_img)
            pose = self.face_detector.analyze_pose(img, face_rect)
            all_warnings = quality["warnings"] + pose["warnings"]
            
            preprocessed_face = self.preprocessor.full_preprocess(face_img)
            
            if self.use_openvino and self.beauty_model and self.age_model:
                preprocessed_img = self._preprocess_image(preprocessed_face)
                beauty_result = self.beauty_model([preprocessed_img])[self.beauty_model.output(0)]
                beauty_score = float(beauty_result[0][0]) * 10
                beauty_score = max(0.0, min(10.0, beauty_score))
                
                age_result = self.age_model([preprocessed_img])[self.age_model.output(0)]
                predicted_age = int(np.argmax(age_result[0]))
                
                for age_min, age_max, group_name in self.age_groups:
                    if age_min <= predicted_age <= age_max:
                        age_group = group_name
                        break
                else:
                    age_group = "未知"
            else:
                beauty_score, _ = self._simulate_beauty_score(img, quality, pose)
                age_min, age_max, age_group, _ = self._simulate_age(img, quality, pose)
            
            defects = self.defect_detector.detect_skin_issues(face_img)
            suggestions = self.suggestion_engine.generate_suggestions(defects)
            
            face_results.append({
                "face_id": idx + 1,
                "face_rect": {"x": int(x), "y": int(y), "width": int(w), "height": int(h)},
                "beauty_score": round(beauty_score, 2),
                "age_group": age_group,
                "age_min": age_min,
                "age_max": age_max,
                "confidence": round(quality["overall_quality"] * pose["pose_score"], 2),
                "quality_score": round(quality["overall_quality"], 2),
                "pose_score": round(pose["pose_score"], 2),
                "warnings": all_warnings,
                "is_profile": pose.get("is_profile", False),
                "beauty_suggestions": suggestions,
                "skin_defects": defects
            })
        
        return {
            "face_count": len(faces),
            "faces": face_results,
            "message": f"检测到 {len(faces)} 张人脸"
        }
    
    def _predict_with_openvino(self, img: np.ndarray, quality: Dict, pose: Dict, warnings: List[str]) -> Dict[str, any]:
        try:
            face_rect = self.face_detector.detect_face(img)
            if face_rect is not None:
                x, y, w, h = face_rect
                face_img = img[y:y+h, x:x+w]
            else:
                face_img = img
            
            preprocessed_face = self.preprocessor.full_preprocess(face_img)
            preprocessed_img = self._preprocess_image(preprocessed_face)
            
            beauty_result = self.beauty_model([preprocessed_img])[self.beauty_model.output(0)]
            beauty_score = float(beauty_result[0][0]) * 10
            
            quality_factor = quality["overall_quality"] * 0.3 + 0.7
            pose_factor = pose["pose_score"] * 0.4 + 0.6
            beauty_score = beauty_score * quality_factor * pose_factor
            beauty_score = max(0.0, min(10.0, beauty_score))
            
            age_result = self.age_model([preprocessed_img])[self.age_model.output(0)]
            predicted_age = int(np.argmax(age_result[0]))
            
            for age_min, age_max, group_name in self.age_groups:
                if age_min <= predicted_age <= age_max:
                    age_group = group_name
                    break
            else:
                age_group = "未知"
            
            confidence = quality["overall_quality"] * pose["pose_score"]
            
            return {
                "beauty_score": beauty_score,
                "age_group": age_group,
                "age_min": age_min,
                "age_max": age_max,
                "model_used": "openvino",
                "confidence": confidence,
                "quality_score": quality["overall_quality"],
                "pose_score": pose["pose_score"],
                "warnings": warnings,
                "is_profile": pose["is_profile"]
            }
        except Exception as e:
            print(f"OpenVINO prediction error: {e}, falling back to simulation")
            return self._predict_simulation(img, quality, pose, warnings)
    
    def _predict_simulation(self, img: np.ndarray, quality: Dict, pose: Dict, warnings: List[str]) -> Dict[str, any]:
        beauty_score, beauty_confidence = self._simulate_beauty_score(img, quality, pose)
        age_min, age_max, age_group, age_confidence = self._simulate_age(img, quality, pose)
        
        overall_confidence = (beauty_confidence + age_confidence) / 2
        
        return {
            "beauty_score": beauty_score,
            "age_group": age_group,
            "age_min": age_min,
            "age_max": age_max,
            "model_used": "simulation",
            "confidence": overall_confidence,
            "quality_score": quality["overall_quality"],
            "pose_score": pose["pose_score"],
            "warnings": warnings,
            "is_profile": pose.get("is_profile", False)
        }


predictor = BeautyAgePredictor()
