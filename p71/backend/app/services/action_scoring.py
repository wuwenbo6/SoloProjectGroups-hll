import numpy as np
from typing import List, Dict, Tuple
from collections import deque


class ActionScoringService:
    def __init__(self):
        self.squat_template = self._create_squat_template()
        self.pushup_template = self._create_pushup_template()
        self.rep_buffer = deque(maxlen=60)
        
    def _create_squat_template(self) -> np.ndarray:
        template_frames = []
        
        for i in range(20):
            t = i / 19.0
            knee_angle = 170 - t * 80
            hip_y = 0.3 + t * 0.3
            
            frame = {
                'knee_angle': knee_angle,
                'hip_y': hip_y,
                'hip_knee_ratio': 0.5 + t * 0.4
            }
            template_frames.append(frame)
        
        for i in range(20):
            t = i / 19.0
            knee_angle = 90 + t * 80
            hip_y = 0.6 - t * 0.3
            
            frame = {
                'knee_angle': knee_angle,
                'hip_y': hip_y,
                'hip_knee_ratio': 0.9 - t * 0.4
            }
            template_frames.append(frame)
        
        return np.array([[f['knee_angle'], f['hip_y'], f['hip_knee_ratio']] for f in template_frames])
    
    def _create_pushup_template(self) -> np.ndarray:
        template_frames = []
        
        for i in range(15):
            t = i / 14.0
            elbow_angle = 170 - t * 70
            shoulder_y = 0.2 + t * 0.25
            
            frame = {
                'elbow_angle': elbow_angle,
                'shoulder_y': shoulder_y,
                'body_straight': 0.95
            }
            template_frames.append(frame)
        
        for i in range(15):
            t = i / 14.0
            elbow_angle = 100 + t * 70
            shoulder_y = 0.45 - t * 0.25
            
            frame = {
                'elbow_angle': elbow_angle,
                'shoulder_y': shoulder_y,
                'body_straight': 0.95
            }
            template_frames.append(frame)
        
        return np.array([[f['elbow_angle'], f['shoulder_y'], f['body_straight']] for f in template_frames])
    
    def _extract_squat_features(self, landmarks) -> np.ndarray:
        left_hip = landmarks[23]
        left_knee = landmarks[25]
        left_ankle = landmarks[27]
        right_hip = landmarks[24]
        right_knee = landmarks[26]
        right_ankle = landmarks[28]
        
        if not all([left_hip, left_knee, left_ankle, right_hip, right_knee, right_ankle]):
            return None
        
        def calc_angle(p1, p2, p3):
            v1 = np.array([p1.x - p2.x, p1.y - p2.y, p1.z - p2.z])
            v2 = np.array([p3.x - p2.x, p3.y - p2.y, p3.z - p2.z])
            dot = np.dot(v1, v2)
            mag1 = np.linalg.norm(v1)
            mag2 = np.linalg.norm(v2)
            if mag1 == 0 or mag2 == 0:
                return 0
            cos = dot / (mag1 * mag2)
            cos = max(-1, min(1, cos))
            return np.arccos(cos) * (180 / np.pi)
        
        left_knee_angle = calc_angle(left_hip, left_knee, left_ankle)
        right_knee_angle = calc_angle(right_hip, right_knee, right_ankle)
        avg_knee_angle = (left_knee_angle + right_knee_angle) / 2
        
        hip_y = (left_hip.y + right_hip.y) / 2
        knee_y = (left_knee.y + right_knee.y) / 2
        hip_knee_ratio = hip_y / max(knee_y, 0.001)
        
        return np.array([avg_knee_angle, hip_y, hip_knee_ratio])
    
    def _extract_pushup_features(self, landmarks) -> np.ndarray:
        left_shoulder = landmarks[11]
        left_elbow = landmarks[13]
        left_wrist = landmarks[15]
        right_shoulder = landmarks[12]
        right_elbow = landmarks[14]
        right_wrist = landmarks[16]
        left_hip = landmarks[23] if len(landmarks) > 23 else None
        right_hip = landmarks[24] if len(landmarks) > 24 else None
        
        if not all([left_shoulder, left_elbow, left_wrist, right_shoulder, right_elbow, right_wrist]):
            return None
        
        def calc_angle(p1, p2, p3):
            v1 = np.array([p1.x - p2.x, p1.y - p2.y, p1.z - p2.z])
            v2 = np.array([p3.x - p2.x, p3.y - p2.y, p3.z - p2.z])
            dot = np.dot(v1, v2)
            mag1 = np.linalg.norm(v1)
            mag2 = np.linalg.norm(v2)
            if mag1 == 0 or mag2 == 0:
                return 0
            cos = dot / (mag1 * mag2)
            cos = max(-1, min(1, cos))
            return np.arccos(cos) * (180 / np.pi)
        
        left_elbow_angle = calc_angle(left_shoulder, left_elbow, left_wrist)
        right_elbow_angle = calc_angle(right_shoulder, right_elbow, right_wrist)
        avg_elbow_angle = (left_elbow_angle + right_elbow_angle) / 2
        
        shoulder_y = (left_shoulder.y + right_shoulder.y) / 2
        hip_y = (left_hip.y + right_hip.y) / 2 if left_hip and right_hip else shoulder_y
        body_straight = 1 - abs(shoulder_y - hip_y)
        
        return np.array([avg_elbow_angle, shoulder_y, body_straight])
    
    def _dtw_distance(self, series: np.ndarray, template: np.ndarray) -> Tuple[float, List]:
        n, m = len(series), len(template)
        dtw_matrix = np.full((n + 1, m + 1), np.inf)
        dtw_matrix[0, 0] = 0
        
        path_matrix = np.zeros((n, m), dtype=int)
        
        for i in range(n):
            for j in range(m):
                cost = np.linalg.norm(series[i] - template[j])
                options = [
                    dtw_matrix[i, j + 1],
                    dtw_matrix[i + 1, j],
                    dtw_matrix[i, j]
                ]
                min_idx = np.argmin(options)
                dtw_matrix[i + 1, j + 1] = cost + options[min_idx]
                path_matrix[i, j] = min_idx
        
        path = []
        i, j = n - 1, m - 1
        while i >= 0 and j >= 0:
            path.append((i, j))
            move = path_matrix[i, j]
            if move == 0:
                i -= 1
            elif move == 1:
                j -= 1
            else:
                i -= 1
                j -= 1
        
        return dtw_matrix[n, m], path[::-1]
    
    def _normalize_series(self, series: np.ndarray) -> np.ndarray:
        if len(series) == 0:
            return series
        
        mean = np.mean(series, axis=0)
        std = np.std(series, axis=0) + 1e-8
        return (series - mean) / std
    
    def score_action(self, landmarks_sequence: List, action_type: str) -> Dict:
        if len(landmarks_sequence) < 10:
            return {
                'score': 0,
                'form_score': 0,
                'range_score': 0,
                'symmetry_score': 0,
                'speed_score': 0,
                'feedback': []
            }
        
        feature_extractor = self._extract_squat_features if action_type == 'squat' else self._extract_pushup_features
        template = self.squat_template if action_type == 'squat' else self.pushup_template
        
        features = []
        for landmarks in landmarks_sequence:
            feat = feature_extractor(landmarks)
            if feat is not None:
                features.append(feat)
        
        if len(features) < 10:
            return {
                'score': 50,
                'form_score': 50,
                'range_score': 50,
                'symmetry_score': 50,
                'speed_score': 50,
                'feedback': ['动作数据不足，请完整完成动作']
            }
        
        features = np.array(features)
        norm_features = self._normalize_series(features)
        norm_template = self._normalize_series(template)
        
        dtw_dist, path = self._dtw_distance(norm_features, norm_template)
        
        max_dist = len(features) * 3
        normalized_dist = dtw_dist / max_dist
        form_score = max(0, min(100, int(100 - normalized_dist * 150)))
        
        if action_type == 'squat':
            knee_angles = features[:, 0]
            min_angle = np.min(knee_angles)
            max_angle = np.max(knee_angles)
            range_score = max(0, min(100, int((180 - min_angle) / 90 * 100)))
            
            left_knee_angles = []
            right_knee_angles = []
            for lm in landmarks_sequence:
                if lm[23] and lm[25] and lm[27] and lm[24] and lm[26] and lm[28]:
                    def calc_angle(p1, p2, p3):
                        v1 = np.array([p1.x - p2.x, p1.y - p2.y, p1.z - p2.z])
                        v2 = np.array([p3.x - p2.x, p3.y - p2.y, p3.z - p2.z])
                        dot = np.dot(v1, v2)
                        mag1 = np.linalg.norm(v1)
                        mag2 = np.linalg.norm(v2)
                        cos = dot / (mag1 * mag2 + 1e-8)
                        cos = max(-1, min(1, cos))
                        return np.arccos(cos) * (180 / np.pi)
                    
                    left_knee_angles.append(calc_angle(lm[23], lm[25], lm[27]))
                    right_knee_angles.append(calc_angle(lm[24], lm[26], lm[28]))
            
            if left_knee_angles and right_knee_angles:
                angle_diff = np.mean(np.abs(np.array(left_knee_angles) - np.array(right_knee_angles)))
                symmetry_score = max(0, min(100, int(100 - angle_diff)))
            else:
                symmetry_score = 70
        else:
            elbow_angles = features[:, 0]
            min_angle = np.min(elbow_angles)
            range_score = max(0, min(100, int((180 - min_angle) / 80 * 100)))
            
            left_elbow_angles = []
            right_elbow_angles = []
            for lm in landmarks_sequence:
                if lm[11] and lm[13] and lm[15] and lm[12] and lm[14] and lm[16]:
                    def calc_angle(p1, p2, p3):
                        v1 = np.array([p1.x - p2.x, p1.y - p2.y, p1.z - p2.z])
                        v2 = np.array([p3.x - p2.x, p3.y - p2.y, p3.z - p2.z])
                        dot = np.dot(v1, v2)
                        mag1 = np.linalg.norm(v1)
                        mag2 = np.linalg.norm(v2)
                        cos = dot / (mag1 * mag2 + 1e-8)
                        cos = max(-1, min(1, cos))
                        return np.arccos(cos) * (180 / np.pi)
                    
                    left_elbow_angles.append(calc_angle(lm[11], lm[13], lm[15]))
                    right_elbow_angles.append(calc_angle(lm[12], lm[14], lm[16]))
            
            if left_elbow_angles and right_elbow_angles:
                angle_diff = np.mean(np.abs(np.array(left_elbow_angles) - np.array(right_elbow_angles)))
                symmetry_score = max(0, min(100, int(100 - angle_diff)))
            else:
                symmetry_score = 70
        
        frame_duration = len(landmarks_sequence)
        optimal_frames = 30
        speed_ratio = min(frame_duration, optimal_frames) / max(frame_duration, optimal_frames)
        speed_score = int(speed_ratio * 100)
        
        overall_score = int(
            form_score * 0.4 +
            range_score * 0.25 +
            symmetry_score * 0.2 +
            speed_score * 0.15
        )
        
        feedback = []
        if range_score < 70:
            feedback.append('动作幅度不够，请蹲得更低/压得更深')
        if symmetry_score < 70:
            feedback.append('左右对称性需要改善')
        if speed_score < 60:
            feedback.append('动作节奏可以更稳定一些')
        if form_score >= 80:
            feedback.append('动作标准，保持住！')
        if overall_score >= 90:
            feedback.append('优秀！近乎完美的动作')
        
        return {
            'score': overall_score,
            'form_score': form_score,
            'range_score': range_score,
            'symmetry_score': symmetry_score,
            'speed_score': speed_score,
            'feedback': feedback
        }
