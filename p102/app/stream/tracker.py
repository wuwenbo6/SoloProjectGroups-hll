import cv2
import numpy as np
import logging
from typing import Optional, Dict, Tuple, List
from datetime import datetime
import uuid
import pickle
import os

logger = logging.getLogger(__name__)


class KalmanFilter:
    def __init__(self, initial_x, initial_y, dt=0.033):
        self.dt = dt
        
        self.state = np.array([[initial_x], [initial_y], [0], [0]], dtype=np.float32)
        
        self.transition_matrix = np.array([
            [1, 0, dt, 0],
            [0, 1, 0, dt],
            [0, 0, 1, 0],
            [0, 0, 0, 1]
        ], dtype=np.float32)
        
        self.measurement_matrix = np.array([
            [1, 0, 0, 0],
            [0, 1, 0, 0]
        ], dtype=np.float32)
        
        self.error_cov = np.eye(4, dtype=np.float32) * 1000
        self.process_noise = np.eye(4, dtype=np.float32) * 0.1
        self.measurement_noise = np.eye(2, dtype=np.float32) * 1

    def predict(self):
        self.state = self.transition_matrix @ self.state
        self.error_cov = self.transition_matrix @ self.error_cov @ self.transition_matrix.T + self.process_noise
        return self.state[0, 0], self.state[1, 0]

    def update(self, x, y):
        measurement = np.array([[x], [y]], dtype=np.float32)
        
        innovation = measurement - self.measurement_matrix @ self.state
        innovation_cov = self.measurement_matrix @ self.error_cov @ self.measurement_matrix.T + self.measurement_noise
        
        kalman_gain = self.error_cov @ self.measurement_matrix.T @ np.linalg.inv(innovation_cov)
        
        self.state = self.state + kalman_gain @ innovation
        identity = np.eye(4, dtype=np.float32)
        self.error_cov = (identity - kalman_gain @ self.measurement_matrix) @ self.error_cov
        
        return self.state[0, 0], self.state[1, 0]


class TemplateMatcher:
    def __init__(self, template: np.ndarray, method=cv2.TM_CCOEFF_NORMED):
        self.template = template
        self.method = method
        self.template_h, self.template_w = template.shape[:2]
        self.threshold = 0.65
        
        self.pyramid_levels = 3
        self.scales = [1.0, 0.8, 1.2]

    def match(self, frame: np.ndarray, search_region: Optional[Tuple[int, int, int, int]] = None) -> Optional[Tuple[int, int, int, int, float]]:
        if search_region:
            x, y, w, h = search_region
            search_img = frame[y:y+h, x:x+w]
            offset_x, offset_y = x, y
        else:
            search_img = frame
            offset_x, offset_y = 0, 0

        if search_img.shape[0] < self.template_h or search_img.shape[1] < self.template_w:
            return None

        best_val = -1
        best_loc = None
        best_scale = 1.0

        for scale in self.scales:
            if scale != 1.0:
                scaled_w = int(self.template_w * scale)
                scaled_h = int(self.template_h * scale)
                if scaled_w < 10 or scaled_h < 10:
                    continue
                if scaled_w > search_img.shape[1] or scaled_h > search_img.shape[0]:
                    continue
                scaled_template = cv2.resize(self.template, (scaled_w, scaled_h))
            else:
                scaled_template = self.template
                scaled_w, scaled_h = self.template_w, self.template_h

            try:
                result = cv2.matchTemplate(search_img, scaled_template, self.method)
                min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(result)
                
                if self.method in [cv2.TM_SQDIFF, cv2.TM_SQDIFF_NORMED]:
                    match_val = 1 - min_val
                    match_loc = min_loc
                else:
                    match_val = max_val
                    match_loc = max_loc

                if match_val > best_val:
                    best_val = match_val
                    best_loc = match_loc
                    best_scale = scale
            except Exception as e:
                continue

        if best_val >= self.threshold and best_loc:
            final_w = int(self.template_w * best_scale)
            final_h = int(self.template_h * best_scale)
            return (
                int(best_loc[0] + offset_x),
                int(best_loc[1] + offset_y),
                final_w,
                final_h,
                best_val
            )
        
        return None

    def update_template(self, new_template: np.ndarray, alpha: float = 0.3):
        if new_template.shape != self.template.shape:
            new_template = cv2.resize(new_template, (self.template.shape[1], self.template.shape[0]))
        
        self.template = cv2.addWeighted(self.template, 1 - alpha, new_template, alpha, 0)


class EnhancedTracker:
    def __init__(self, stream_id: int, tracker_type: str = "CSRT", record_trajectory: bool = True):
        self.stream_id = stream_id
        self.tracker_type = tracker_type
        self.record_trajectory = record_trajectory
        
        self.trackers: Dict[str, object] = {}
        self.tracking_info: Dict[str, dict] = {}
        self.kalman_filters: Dict[str, KalmanFilter] = {}
        self.template_matchers: Dict[str, TemplateMatcher] = {}
        self.trajectories: Dict[str, List[Tuple[float, float, datetime]]] = {}
        
        self.tracking_boxes: List[dict] = []
        
        self.consecutive_failures = {}
        self.max_failures = 10
        self.re_detection_enabled = True
        self.re_detection_interval = 5
        
        self.search_scale_padding = 2.0
        self.full_frame_re_detection_threshold = 3

    def _create_tracker(self):
        if self.tracker_type == "KCF":
            return cv2.TrackerKCF_create()
        elif self.tracker_type == "CSRT":
            return cv2.TrackerCSRT_create()
        elif self.tracker_type == "MOSSE":
            return cv2.TrackerMOSSE_create()
        elif self.tracker_type == "MIL":
            return cv2.TrackerMIL_create()
        else:
            return cv2.TrackerCSRT_create()

    def _get_search_region(self, frame, center_x, center_y, base_w, base_h, scale=None):
        h, w = frame.shape[:2]
        
        if scale is None:
            scale = self.search_scale_padding
        
        search_w = int(base_w * scale)
        search_h = int(base_h * scale)
        
        x1 = max(0, int(center_x - search_w // 2))
        y1 = max(0, int(center_y - search_h // 2))
        x2 = min(w, int(center_x + search_w // 2))
        y2 = min(h, int(center_y + search_h // 2))
        
        if x2 <= x1 or y2 <= y1:
            return None, None
        
        return (x1, y1, x2 - x1, y2 - y1)

    def init_tracker(self, frame: np.ndarray, bbox: Tuple[int, int, int, int], label: str = "target") -> str:
        object_id = str(uuid.uuid4())[:8]
        
        tracker = self._create_tracker()
        tracker.init(frame, bbox)
        
        self.trackers[object_id] = tracker
        x, y, w, h = bbox
        center_x = x + w / 2
        center_y = y + h / 2
        
        self.tracking_info[object_id] = {
            "label": label,
            "bbox": bbox,
            "center": (center_x, center_y),
            "confidence": 1.0,
            "created_at": datetime.now(),
            "last_updated": datetime.now(),
            "last_seen_at": datetime.now(),
            "is_lost": False,
            "re_detection_attempts": 0
        }
        
        self.kalman_filters[object_id] = KalmanFilter(center_x, center_y)
        
        template = frame[y:y+h, x:x+w].copy()
        self.template_matchers[object_id] = TemplateMatcher(template)
        
        self.consecutive_failures[object_id] = 0
        
        if self.record_trajectory:
            self.trajectories[object_id] = [(center_x, center_y, datetime.now())]
        
        logger.info(f"{self.tracker_type} tracker initialized for stream {self.stream_id}, object: {object_id}")
        return object_id

    def update(self, frame: np.ndarray) -> List[dict]:
        self.tracking_boxes = []
        
        for object_id, tracker in list(self.trackers.items()):
            info = self.tracking_info[object_id]
            kalman = self.kalman_filters.get(object_id)
            template_matcher = self.template_matchers.get(object_id)
            
            if not kalman:
                continue
            
            pred_x, pred_y = kalman.predict()
            
            success, bbox = tracker.update(frame)
            
            if success:
                x, y, w, h = [int(v) for v in bbox]
                center_x = x + w / 2
                center_y = y + h / 2
                
                kalman.update(center_x, center_y)
                
                info["bbox"] = (x, y, w, h)
                info["center"] = (center_x, center_y)
                info["last_updated"] = datetime.now()
                info["last_seen_at"] = datetime.now()
                info["confidence"] = min(1.0, info["confidence"] + 0.05)
                info["is_lost"] = False
                info["re_detection_attempts"] = 0
                
                self.consecutive_failures[object_id] = 0
                
                if self.record_trajectory and object_id in self.trajectories:
                    self.trajectories[object_id].append((center_x, center_y, datetime.now()))
                    if len(self.trajectories[object_id]) > 500:
                        self.trajectories[object_id].pop(0)
                
                self.tracking_boxes.append({
                    "object_id": object_id,
                    "label": info["label"],
                    "x": x,
                    "y": y,
                    "width": w,
                    "height": h,
                    "confidence": info["confidence"],
                    "is_lost": False
                })
            else:
                self.consecutive_failures[object_id] += 1
                info["confidence"] = max(0.0, info["confidence"] - 0.05)
                info["is_lost"] = True
                
                re_detected = False
                if self.re_detection_enabled and template_matcher:
                    last_bbox = info["bbox"]
                    
                    if self.consecutive_failures[object_id] % self.re_detection_interval == 0:
                        info["re_detection_attempts"] += 1
                        
                        if self.consecutive_failures[object_id] <= self.full_frame_re_detection_threshold:
                            search_region = self._get_search_region(
                                frame, pred_x, pred_y, last_bbox[2], last_bbox[3]
                            )
                        else:
                            search_region = None
                        
                        match_result = template_matcher.match(frame, search_region)
                        
                        if match_result:
                            mx, my, mw, mh, mval = match_result
                            
                            new_tracker = self._create_tracker()
                            try:
                                new_tracker.init(frame, (mx, my, mw, mh))
                                self.trackers[object_id] = new_tracker
                                
                                info["bbox"] = (mx, my, mw, mh)
                                info["center"] = (mx + mw / 2, my + mh / 2)
                                info["confidence"] = mval
                                info["is_lost"] = False
                                info["last_seen_at"] = datetime.now()
                                self.consecutive_failures[object_id] = 0
                                
                                kalman.update(mx + mw / 2, my + mh / 2)
                                
                                new_template = frame[my:my+mh, mx:mx+mw].copy()
                                template_matcher.update_template(new_template)
                                
                                re_detected = True
                                
                                self.tracking_boxes.append({
                                    "object_id": object_id,
                                    "label": info["label"] + " (recovered)",
                                    "x": mx,
                                    "y": my,
                                    "width": mw,
                                    "height": mh,
                                    "confidence": mval,
                                    "is_lost": False,
                                    "recovered": True
                                })
                            except Exception as e:
                                logger.debug(f"Re-detection init failed: {e}")
                
                if not re_detected:
                    self.tracking_boxes.append({
                        "object_id": object_id,
                        "label": info["label"] + " (lost)",
                        "x": int(pred_x - last_bbox[2] / 2),
                        "y": int(pred_y - last_bbox[3] / 2),
                        "width": last_bbox[2],
                        "height": last_bbox[3],
                        "confidence": info["confidence"],
                        "is_lost": True
                    })
                    
                    if self.consecutive_failures[object_id] > self.max_failures * 3:
                        logger.info(f"Object {object_id} lost for too long, keeping for re-detection")
                        if self.consecutive_failures[object_id] > self.max_failures * 10:
                            logger.warning(f"Removing lost object {object_id}")
                            self.remove_tracker(object_id)
        
        return self.tracking_boxes

    def remove_tracker(self, object_id: str) -> bool:
        deleted = False
        
        if object_id in self.trackers:
            del self.trackers[object_id]
            deleted = True
        if object_id in self.tracking_info:
            del self.tracking_info[object_id]
        if object_id in self.kalman_filters:
            del self.kalman_filters[object_id]
        if object_id in self.template_matchers:
            del self.template_matchers[object_id]
        if object_id in self.consecutive_failures:
            del self.consecutive_failures[object_id]
        if object_id in self.trajectories:
            del self.trajectories[object_id]
        
        if deleted:
            logger.info(f"Tracker removed: {object_id}")
        return deleted

    def clear_all(self):
        self.trackers.clear()
        self.tracking_info.clear()
        self.kalman_filters.clear()
        self.template_matchers.clear()
        self.consecutive_failures.clear()
        self.trajectories.clear()
        self.tracking_boxes.clear()

    def get_tracking_boxes(self) -> List[dict]:
        return self.tracking_boxes

    def get_trajectory(self, object_id: str) -> Optional[List[Tuple[float, float, datetime]]]:
        return self.trajectories.get(object_id)

    def get_all_trajectories(self) -> Dict[str, List[Tuple[float, float, datetime]]]:
        return self.trajectories.copy()

    def draw_boxes(self, frame: np.ndarray, draw_trajectory: bool = True) -> np.ndarray:
        overlay = frame.copy()
        
        for box in self.tracking_boxes:
            x, y, w, h = box["x"], box["y"], box["width"], box["height"]
            label = box["label"]
            conf = box["confidence"]
            is_lost = box.get("is_lost", False)
            is_recovered = box.get("recovered", False)
            
            if is_lost:
                color = (0, 0, 255)
                thickness = 1
                line_style = cv2.LINE_AA
            elif is_recovered:
                color = (0, 255, 255)
                thickness = 3
                line_style = cv2.LINE_AA
            else:
                color = (0, int(255 * conf), int(255 * (1 - conf)))
                thickness = 2
                line_style = cv2.LINE_AA
            
            cv2.rectangle(frame, (x, y), (x + w, y + h), color, thickness, line_style)
            
            label_text = f"{label}: {box['object_id']}"
            (text_w, text_h), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)
            cv2.rectangle(frame, (x, y - text_h - 10), (x + text_w, y), color, -1)
            cv2.putText(frame, label_text, (x, y - 5),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
            
            if draw_trajectory and not is_lost:
                object_id = box.get("object_id")
                if object_id and object_id in self.trajectories:
                    trajectory = self.trajectories[object_id]
                    if len(trajectory) > 1:
                        points = np.array([(int(p[0]), int(p[1])) for p in trajectory[-50:]], np.int32)
                        points = points.reshape((-1, 1, 2))
                        cv2.polylines(frame, [points], False, (255, 255, 0), 2, cv2.LINE_AA)
                        
                        if len(trajectory) > 0:
                            first = trajectory[0]
                            cv2.circle(frame, (int(first[0]), int(first[1])), 5, (255, 0, 0), -1)
                        
                        last = trajectory[-1]
                        cv2.circle(frame, (int(last[0]), int(last[1])), 5, (0, 255, 0), -1)
        
        return frame

    def has_trackers(self) -> bool:
        return len(self.trackers) > 0

    def save_templates(self, path: str):
        os.makedirs(path, exist_ok=True)
        for obj_id, matcher in self.template_matchers.items():
            cv2.imwrite(f"{path}/template_{obj_id}.jpg", matcher.template)

    def export_trajectory(self, object_id: str, filepath: str) -> bool:
        if object_id not in self.trajectories:
            return False
        
        data = {
            "object_id": object_id,
            "stream_id": self.stream_id,
            "label": self.tracking_info.get(object_id, {}).get("label", "unknown"),
            "trajectory": [
                {"x": p[0], "y": p[1], "timestamp": p[2].isoformat()}
                for p in self.trajectories[object_id]
            ]
        }
        
        import json
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
        
        return True
