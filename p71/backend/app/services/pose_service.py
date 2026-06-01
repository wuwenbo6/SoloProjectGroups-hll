import numpy as np
from typing import List
from collections import deque
from app.schemas.pose import PoseFrame

ALPHA = 0.4
MIN_VISIBILITY = 0.5
SMOOTHING_WINDOW = 8
STATE_HYSTERESIS_FRAMES = 3


class ActionRecognitionService:
    def __init__(self):
        self.filtered_landmarks = []
        self.angle_history = {"knee": deque(maxlen=SMOOTHING_WINDOW), "elbow": deque(maxlen=SMOOTHING_WINDOW)}
        self.action_history = deque(maxlen=SMOOTHING_WINDOW)
        self.confidence_history = deque(maxlen=5)
        
        self.squat_state = {
            "is_down": False,
            "consecutive_down": 0,
            "consecutive_up": 0,
            "min_angle": 180,
            "max_angle": 0
        }
        
        self.pushup_state = {
            "is_down": False,
            "consecutive_down": 0,
            "consecutive_up": 0,
            "min_angle": 180,
            "max_angle": 0
        }
        
        self.squat_count = 0
        self.pushup_count = 0

    def _low_pass_filter(self, new_value: float, old_value: float, alpha: float = ALPHA) -> float:
        return alpha * new_value + (1 - alpha) * old_value

    def _filter_landmarks(self, landmarks):
        filtered = []
        
        for i, lm in enumerate(landmarks):
            prev = self.filtered_landmarks[i] if i < len(self.filtered_landmarks) else None
            
            if prev and lm.visibility > MIN_VISIBILITY:
                filtered.append({
                    "x": self._low_pass_filter(lm.x, prev["x"]),
                    "y": self._low_pass_filter(lm.y, prev["y"]),
                    "z": self._low_pass_filter(lm.z, prev["z"]),
                    "visibility": lm.visibility
                })
            else:
                filtered.append({
                    "x": lm.x,
                    "y": lm.y,
                    "z": lm.z,
                    "visibility": lm.visibility
                })
        
        self.filtered_landmarks = filtered
        return filtered

    def _smooth_angle(self, angle: float, angle_type: str) -> float:
        history = self.angle_history[angle_type]
        history.append(angle)
        return sum(history) / len(history)

    def _smooth_confidence(self, conf: float) -> float:
        self.confidence_history.append(conf)
        return sum(self.confidence_history) / len(self.confidence_history)

    def _calculate_angle(self, p1, p2, p3):
        v1 = np.array([p1["x"] - p2["x"], p1["y"] - p2["y"], p1["z"] - p2["z"]])
        v2 = np.array([p3["x"] - p2["x"], p3["y"] - p2["y"], p3["z"] - p2["z"]])
        
        dot = np.dot(v1, v2)
        mag1 = np.linalg.norm(v1)
        mag2 = np.linalg.norm(v2)
        
        if mag1 == 0 or mag2 == 0:
            return 0
            
        cos = dot / (mag1 * mag2)
        cos = max(-1, min(1, cos))
        return np.arccos(cos) * (180 / np.pi)

    def _detect_squat(self, landmarks):
        left_hip = landmarks[23]
        left_knee = landmarks[25]
        left_ankle = landmarks[27]
        right_hip = landmarks[24]
        right_knee = landmarks[26]
        right_ankle = landmarks[28]

        critical_points = [left_hip, left_knee, left_ankle, right_hip, right_knee, right_ankle]
        low_visibility = any(not p or p["visibility"] < MIN_VISIBILITY for p in critical_points)
        
        if low_visibility:
            return {
                "isSquat": self.squat_state["is_down"],
                "confidence": 0.3,
                "angle": 180
            }

        left_knee_angle = self._calculate_angle(left_hip, left_knee, left_ankle)
        right_knee_angle = self._calculate_angle(right_hip, right_knee, right_ankle)
        avg_knee_angle = self._smooth_angle((left_knee_angle + right_knee_angle) / 2, "knee")

        hip_y = (left_hip["y"] + right_hip["y"]) / 2
        knee_y = (left_knee["y"] + right_knee["y"]) / 2
        hip_knee_diff = knee_y - hip_y

        symmetry = 1 - abs(left_knee_angle - right_knee_angle) / 180
        depth_confidence = min(1, max(0, (180 - avg_knee_angle) / 70))
        position_confidence = 1 if hip_knee_diff > 0.08 else max(0, hip_knee_diff / 0.08)
        
        is_down = avg_knee_angle < 125 and hip_knee_diff > 0.08
        is_up = avg_knee_angle > 155

        confidence = (depth_confidence * position_confidence * symmetry) if is_down else \
                     (0.85 * symmetry if is_up else 0.4 + symmetry * 0.2)

        return {
            "isSquat": is_down,
            "confidence": confidence,
            "angle": avg_knee_angle
        }

    def _detect_pushup(self, landmarks):
        left_shoulder = landmarks[11]
        left_elbow = landmarks[13]
        left_wrist = landmarks[15]
        right_shoulder = landmarks[12]
        right_elbow = landmarks[14]
        right_wrist = landmarks[16]
        left_hip = landmarks[23] if len(landmarks) > 23 else None
        right_hip = landmarks[24] if len(landmarks) > 24 else None

        critical_points = [left_shoulder, left_elbow, left_wrist, right_shoulder, right_elbow, right_wrist]
        low_visibility = any(not p or p["visibility"] < MIN_VISIBILITY for p in critical_points)
        
        if low_visibility:
            return {
                "isPushup": self.pushup_state["is_down"],
                "confidence": 0.3,
                "angle": 180
            }

        left_elbow_angle = self._calculate_angle(left_shoulder, left_elbow, left_wrist)
        right_elbow_angle = self._calculate_angle(right_shoulder, right_elbow, right_wrist)
        avg_elbow_angle = self._smooth_angle((left_elbow_angle + right_elbow_angle) / 2, "elbow")

        shoulder_y = (left_shoulder["y"] + right_shoulder["y"]) / 2
        hip_y = (left_hip["y"] + right_hip["y"]) / 2 if left_hip and right_hip else shoulder_y
        body_horizontal = abs(shoulder_y - hip_y) < 0.18
        
        symmetry = 1 - abs(left_elbow_angle - right_elbow_angle) / 180
        depth_confidence = min(1, max(0, (180 - avg_elbow_angle) / 70))
        
        is_down = avg_elbow_angle < 130 and body_horizontal
        is_up = avg_elbow_angle > 155 and body_horizontal

        confidence = (depth_confidence * (1 if body_horizontal else 0.5) * symmetry) if is_down else \
                     (0.8 * symmetry if is_up else 0.3 + symmetry * 0.2)

        return {
            "isPushup": is_down,
            "confidence": confidence,
            "angle": avg_elbow_angle
        }

    def recognize(self, frames: List[PoseFrame]):
        if not frames:
            return {"action": "none", "confidence": 0, "count": 0}

        latest_frame = frames[-1]
        landmarks = latest_frame.landmarks

        if len(landmarks) < 33:
            return {"action": "none", "confidence": 0, "count": self.squat_count + self.pushup_count}

        filtered = self._filter_landmarks(landmarks)
        squat_result = self._detect_squat(filtered)
        pushup_result = self._detect_pushup(filtered)

        if squat_result["isSquat"]:
            self.squat_state["consecutive_down"] += 1
            self.squat_state["consecutive_up"] = 0
            self.squat_state["min_angle"] = min(self.squat_state["min_angle"], squat_result["angle"])
        else:
            self.squat_state["consecutive_up"] += 1
            self.squat_state["consecutive_down"] = 0
            self.squat_state["max_angle"] = max(self.squat_state["max_angle"], squat_result["angle"])

        if pushup_result["isPushup"]:
            self.pushup_state["consecutive_down"] += 1
            self.pushup_state["consecutive_up"] = 0
            self.pushup_state["min_angle"] = min(self.pushup_state["min_angle"], pushup_result["angle"])
        else:
            self.pushup_state["consecutive_up"] += 1
            self.pushup_state["consecutive_down"] = 0
            self.pushup_state["max_angle"] = max(self.pushup_state["max_angle"], pushup_result["angle"])

        if not self.squat_state["is_down"] and \
           self.squat_state["consecutive_down"] >= STATE_HYSTERESIS_FRAMES and \
           squat_result["confidence"] > 0.6:
            self.squat_state["is_down"] = True
        
        if self.squat_state["is_down"] and \
           self.squat_state["consecutive_up"] >= STATE_HYSTERESIS_FRAMES and \
           squat_result["angle"] > 150:
            self.squat_state["is_down"] = False
            if self.squat_state["min_angle"] < 130:
                self.squat_count += 1
            self.squat_state["min_angle"] = 180
            self.squat_state["max_angle"] = 0

        if not self.pushup_state["is_down"] and \
           self.pushup_state["consecutive_down"] >= STATE_HYSTERESIS_FRAMES and \
           pushup_result["confidence"] > 0.6:
            self.pushup_state["is_down"] = True
        
        if self.pushup_state["is_down"] and \
           self.pushup_state["consecutive_up"] >= STATE_HYSTERESIS_FRAMES and \
           pushup_result["angle"] > 150:
            self.pushup_state["is_down"] = False
            if self.pushup_state["min_angle"] < 135:
                self.pushup_count += 1
            self.pushup_state["min_angle"] = 180
            self.pushup_state["max_angle"] = 0

        action = "none"
        confidence = 0

        if squat_result["confidence"] > pushup_result["confidence"] and squat_result["confidence"] > 0.45:
            action = "squat"
            confidence = squat_result["confidence"]
        elif pushup_result["confidence"] > squat_result["confidence"] and pushup_result["confidence"] > 0.45:
            action = "pushup"
            confidence = pushup_result["confidence"]
        elif squat_result["confidence"] < 0.35 and pushup_result["confidence"] < 0.35:
            action = "stand"
            confidence = 0.8

        self.action_history.append(action)
        
        from collections import Counter
        action_counts = Counter(self.action_history)
        smooth_action, max_count = action_counts.most_common(1)[0]

        smoothed_confidence = self._smooth_confidence(confidence)
        final_confidence = smoothed_confidence if max_count >= SMOOTHING_WINDOW * 0.6 else smoothed_confidence * 0.7

        return {
            "action": smooth_action,
            "confidence": float(final_confidence),
            "count": self.squat_count + self.pushup_count
        }

    def reset_counts(self):
        self.squat_count = 0
        self.pushup_count = 0
        
        self.squat_state = {
            "is_down": False,
            "consecutive_down": 0,
            "consecutive_up": 0,
            "min_angle": 180,
            "max_angle": 0
        }
        
        self.pushup_state = {
            "is_down": False,
            "consecutive_down": 0,
            "consecutive_up": 0,
            "min_angle": 180,
            "max_angle": 0
        }
        
        self.filtered_landmarks = []
        self.angle_history = {"knee": deque(maxlen=SMOOTHING_WINDOW), "elbow": deque(maxlen=SMOOTHING_WINDOW)}
        self.action_history.clear()
        self.confidence_history.clear()
