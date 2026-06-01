import cv2
import numpy as np
from typing import Dict, List, Tuple


class DefectDetector:
    @staticmethod
    def detect_skin_issues(face_img: np.ndarray) -> Dict[str, any]:
        hsv = cv2.cvtColor(face_img, cv2.COLOR_BGR2HSV)
        
        h, s, v = cv2.split(hsv)
        
        issues = []
        severity_scores = {}
        
        skin_mask = DefectDetector._get_skin_mask(face_img)
        
        dullness_score = DefectDetector._assess_dullness(v, skin_mask)
        if dullness_score > 0.4:
            issues.append("肤色暗沉")
        severity_scores["dullness"] = dullness_score
        
        oiliness_score = DefectDetector._assess_oiliness(s, v, skin_mask)
        if oiliness_score > 0.5:
            issues.append("皮肤出油/泛油光")
        severity_scores["oiliness"] = oiliness_score
        
        acne_score = DefectDetector._detect_acne(face_img, skin_mask)
        if acne_score > 0.3:
            issues.append("痘痘/粉刺")
        severity_scores["acne"] = acne_score
        
        wrinkle_score = DefectDetector._detect_wrinkles(face_img, skin_mask)
        if wrinkle_score > 0.4:
            issues.append("细纹/皱纹")
        severity_scores["wrinkles"] = wrinkle_score
        
        pore_score = DefectDetector._detect_pores(face_img, skin_mask)
        if pore_score > 0.4:
            issues.append("毛孔粗大")
        severity_scores["pores"] = pore_score
        
        dark_circle_score = DefectDetector._detect_dark_circles(face_img)
        if dark_circle_score > 0.4:
            issues.append("黑眼圈")
        severity_scores["dark_circles"] = dark_circle_score
        
        overall_score = np.mean(list(severity_scores.values()))
        
        return {
            "issues": issues,
            "severity_scores": severity_scores,
            "overall_severity": overall_score,
            "issue_count": len(issues)
        }
    
    @staticmethod
    def _get_skin_mask(img: np.ndarray) -> np.ndarray:
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        lower_skin = np.array([0, 20, 70], dtype=np.uint8)
        upper_skin = np.array([20, 150, 255], dtype=np.uint8)
        mask = cv2.inRange(hsv, lower_skin, upper_skin)
        return mask
    
    @staticmethod
    def _assess_dullness(v_channel: np.ndarray, mask: np.ndarray) -> float:
        v_skin = v_channel[mask > 0]
        if len(v_skin) == 0:
            return 0.5
        mean_v = np.mean(v_skin)
        std_v = np.std(v_skin)
        dullness = max(0, 1.0 - mean_v / 200.0) * 0.6 + min(1.0, std_v / 80.0) * 0.4
        return min(1.0, dullness)
    
    @staticmethod
    def _assess_oiliness(s_channel: np.ndarray, v_channel: np.ndarray, mask: np.ndarray) -> float:
        s_skin = s_channel[mask > 0]
        v_skin = v_channel[mask > 0]
        if len(s_skin) == 0 or len(v_skin) == 0:
            return 0.5
        high_v_pixels = np.sum(v_skin > 220) / len(v_skin)
        mean_s = np.mean(s_skin)
        oiliness = high_v_pixels * 0.7 + mean_s / 255.0 * 0.3
        return min(1.0, oiliness)
    
    @staticmethod
    def _detect_acne(img: np.ndarray, mask: np.ndarray) -> float:
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        a_channel = lab[:, :, 1]
        a_skin = a_channel[mask > 0]
        if len(a_skin) == 0:
            return 0.3
        mean_a = np.mean(a_skin)
        high_red_pixels = np.sum(a_skin > mean_a + 15) / len(a_skin)
        return min(1.0, high_red_pixels * 5)
    
    @staticmethod
    def _detect_wrinkles(img: np.ndarray, mask: np.ndarray) -> float:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        gray_skin = cv2.bitwise_and(gray, gray, mask=mask)
        edges = cv2.Canny(gray_skin, 20, 60)
        edge_density = np.sum(edges > 0) / (np.sum(mask > 0) + 1e-6)
        return min(1.0, edge_density * 10)
    
    @staticmethod
    def _detect_pores(img: np.ndarray, mask: np.ndarray) -> float:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        gray_skin = cv2.bitwise_and(gray, gray, mask=mask)
        laplacian = cv2.Laplacian(gray_skin, cv2.CV_64F)
        local_var = cv2.GaussianBlur(laplacian**2, (5, 5), 0)
        pore_regions = local_var > np.mean(local_var) + np.std(local_var)
        pore_density = np.sum(pore_regions) / (np.sum(mask > 0) + 1e-6)
        return min(1.0, pore_density * 20)
    
    @staticmethod
    def _detect_dark_circles(img: np.ndarray) -> float:
        h, w = img.shape[:2]
        eye_region = img[int(h*0.35):int(h*0.5), int(w*0.1):int(w*0.9)]
        if eye_region.size == 0:
            return 0.3
        gray_eye = cv2.cvtColor(eye_region, cv2.COLOR_BGR2GRAY)
        mean_brightness = np.mean(gray_eye)
        darkness = max(0, 1.0 - mean_brightness / 150.0)
        lab = cv2.cvtColor(eye_region, cv2.COLOR_BGR2LAB)
        b_channel = lab[:, :, 2]
        yellow_tone = np.mean(b_channel)
        yellow_factor = max(0, (yellow_tone - 130) / 50.0)
        return min(1.0, darkness * 0.7 + yellow_factor * 0.3)


class BeautySuggestionEngine:
    SUGGESTIONS = {
        "肤色暗沉": {
            "severity_based": True,
            "suggestions": [
                {
                    "min_severity": 0.0,
                    "title": "提亮肤色建议",
                    "tips": [
                        "使用含维生素C的精华液提亮肤色",
                        "定期去角质促进肌肤新陈代谢",
                        "注意防晒，避免紫外线导致的色素沉着",
                        "保持充足睡眠，促进肌肤修复"
                    ]
                },
                {
                    "min_severity": 0.5,
                    "title": "针对性提亮方案",
                    "tips": [
                        "使用烟酰胺产品改善肤色不均",
                        "考虑使用美白面膜进行密集护理",
                        "增加补水，改善皮肤透明度",
                        "饮食中增加抗氧化食物摄入"
                    ]
                }
            ]
        },
        "皮肤出油/泛油光": {
            "severity_based": True,
            "suggestions": [
                {
                    "min_severity": 0.0,
                    "title": "控油护理建议",
                    "tips": [
                        "使用温和的控油洁面产品",
                        "选择清爽型保湿产品，避免过度滋润",
                        "定期使用泥膜清洁毛孔",
                        "注意补水，水油平衡是关键"
                    ]
                },
                {
                    "min_severity": 0.5,
                    "title": "强效控油方案",
                    "tips": [
                        "考虑使用含水杨酸的产品调理",
                        "增加清洁面膜使用频率",
                        "避免高糖高脂饮食",
                        "可以考虑使用控油妆前乳改善泛油现象"
                    ]
                }
            ]
        },
        "痘痘/粉刺": {
            "severity_based": True,
            "suggestions": [
                {
                    "min_severity": 0.0,
                    "title": "祛痘护理建议",
                    "tips": [
                        "保持面部清洁，避免用手触摸",
                        "使用含水杨酸或茶树精油的产品",
                        "饮食清淡，减少辛辣刺激食物",
                        "保证充足睡眠，减轻压力"
                    ]
                },
                {
                    "min_severity": 0.5,
                    "title": "专业祛痘方案",
                    "tips": [
                        "考虑使用过氧化苯甲酰产品",
                        "严重时建议咨询皮肤科医生",
                        "避免挤压，防止感染和留疤",
                        "可以考虑使用祛痘精华点涂"
                    ]
                }
            ]
        },
        "细纹/皱纹": {
            "severity_based": True,
            "suggestions": [
                {
                    "min_severity": 0.0,
                    "title": "抗初老建议",
                    "tips": [
                        "做好防晒，紫外线是老化元凶",
                        "使用含视黄醇的抗老产品",
                        "加强保湿，增加皮肤弹性",
                        "避免夸张表情，减少动态纹"
                    ]
                },
                {
                    "min_severity": 0.5,
                    "title": "深度抗老方案",
                    "tips": [
                        "使用含胜肽的抗皱精华",
                        "考虑使用美容仪辅助护理",
                        "增加抗氧化成分摄入",
                        "定期使用紧致面膜"
                    ]
                }
            ]
        },
        "毛孔粗大": {
            "severity_based": True,
            "suggestions": [
                {
                    "min_severity": 0.0,
                    "title": "毛孔护理建议",
                    "tips": [
                        "定期清洁毛孔，使用泥膜",
                        "使用含果酸或水杨酸的产品",
                        "注意补水，保持皮肤水润",
                        "使用收敛水调理毛孔"
                    ]
                },
                {
                    "min_severity": 0.5,
                    "title": "细致毛孔方案",
                    "tips": [
                        "可以考虑使用毛孔精华",
                        "定期做深层清洁护理",
                        "避免油脂过度分泌",
                        "使用含硅类妆前乳修饰毛孔"
                    ]
                }
            ]
        },
        "黑眼圈": {
            "severity_based": True,
            "suggestions": [
                {
                    "min_severity": 0.0,
                    "title": "黑眼圈护理建议",
                    "tips": [
                        "保证充足睡眠，避免熬夜",
                        "使用含咖啡因的眼霜",
                        "睡前避免大量饮水",
                        "可以尝试冷热敷交替"
                    ]
                },
                {
                    "min_severity": 0.5,
                    "title": "强效淡化方案",
                    "tips": [
                        "使用含维生素K的眼部产品",
                        "定期使用眼膜",
                        "考虑使用遮瑕产品修饰",
                        "严重时建议咨询专业医师"
                    ]
                }
            ]
        }
    }
    
    GENERAL_TIPS = [
        "每天喝足够的水，保持身体水分",
        "坚持运动，促进血液循环",
        "保持愉快心情，压力会影响皮肤状态",
        "定期更换枕套，保持清洁",
        "避免吸烟和过量饮酒",
        "多吃新鲜蔬果，补充维生素"
    ]
    
    @classmethod
    def generate_suggestions(cls, defects: Dict[str, any]) -> Dict[str, any]:
        issues = defects.get("issues", [])
        severity_scores = defects.get("severity_scores", {})
        
        all_suggestions = []
        
        for issue in issues:
            if issue in cls.SUGGESTIONS:
                severity = severity_scores.get(issue, 0.5)
                suggestion_config = cls.SUGGESTIONS[issue]
                
                applicable_suggestions = [
                    s for s in suggestion_config["suggestions"]
                    if s["min_severity"] <= severity
                ]
                
                if applicable_suggestions:
                    best_suggestion = max(applicable_suggestions, key=lambda s: s["min_severity"])
                    all_suggestions.append({
                        "issue": issue,
                        "severity": round(severity, 2),
                        "title": best_suggestion["title"],
                        "tips": best_suggestion["tips"]
                    })
        
        general_advice = np.random.choice(cls.GENERAL_TIPS, 3, replace=False).tolist()
        
        overall_severity = defects.get("overall_severity", 0)
        if overall_severity < 0.2:
            skin_status = "皮肤状态很好！"
            summary = "您的皮肤状态非常健康，请继续保持良好的护肤习惯。"
        elif overall_severity < 0.4:
            skin_status = "皮肤状态良好"
            summary = "整体皮肤状态不错，针对小问题进行微调护理即可。"
        elif overall_severity < 0.6:
            skin_status = "皮肤状态一般"
            summary = "皮肤存在一些小问题，建议按照建议进行针对性护理。"
        else:
            skin_status = "皮肤需要关注"
            summary = "皮肤问题比较明显，建议认真按照建议进行护理，必要时咨询专业人士。"
        
        return {
            "skin_status": skin_status,
            "summary": summary,
            "issue_suggestions": all_suggestions,
            "general_tips": general_advice,
            "issue_count": len(all_suggestions)
        }


class MultiFaceAnalyzer:
    def __init__(self, face_detector):
        self.face_detector = face_detector
    
    def detect_multiple_faces(self, img: np.ndarray) -> List[Tuple[int, int, int, int]]:
        if self.face_detector.face_cascade is None:
            h, w = img.shape[:2]
            return [(int(w*0.2), int(h*0.2), int(w*0.6), int(h*0.6))]
        
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        faces = self.face_detector.face_cascade.detectMultiScale(
            gray, 1.1, 4, minSize=(50, 50)
        )
        
        faces = self._suppress_overlapping(faces)
        
        return sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
    
    def _suppress_overlapping(self, faces: List[Tuple], overlap_thresh: float = 0.3) -> List[Tuple]:
        if len(faces) == 0:
            return []
        
        boxes = np.array([[x, y, x+w, y+h] for x, y, w, h in faces])
        pick = []
        
        x1 = boxes[:, 0]
        y1 = boxes[:, 1]
        x2 = boxes[:, 2]
        y2 = boxes[:, 3]
        
        area = (x2 - x1 + 1) * (y2 - y1 + 1)
        idxs = np.argsort(y2)
        
        while len(idxs) > 0:
            last = len(idxs) - 1
            i = idxs[last]
            pick.append(i)
            
            xx1 = np.maximum(x1[i], x1[idxs[:last]])
            yy1 = np.maximum(y1[i], y1[idxs[:last]])
            xx2 = np.minimum(x2[i], x2[idxs[:last]])
            yy2 = np.minimum(y2[i], y2[idxs[:last]])
            
            w = np.maximum(0, xx2 - xx1 + 1)
            h = np.maximum(0, yy2 - yy1 + 1)
            
            overlap = (w * h) / area[idxs[:last]]
            
            idxs = np.delete(idxs, np.concatenate(([last], np.where(overlap > overlap_thresh)[0])))
        
        return [faces[i] for i in pick]
