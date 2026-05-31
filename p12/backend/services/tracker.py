import numpy as np
from scipy.optimize import linear_sum_assignment
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass, field
import uuid

@dataclass
class TrackState:
    NEW = 0
    TRACKED = 1
    LOST = 2
    REMOVED = 3

@dataclass
class KalmanBox3D:
    def __init__(self, bbox: Dict):
        self.x = bbox['x']
        self.y = bbox['y']
        self.z = bbox['z']
        self.w = bbox['w']
        self.h = bbox['h']
        self.l = bbox['l']
        self.rotation_y = bbox.get('rotation_y', 0)
        
        self.kf = self._init_kalman_filter()
    
    def _init_kalman_filter(self):
        dt = 0.1
        
        F = np.eye(10, 10)
        for i in range(7):
            F[i, i + 7] = dt
        
        H = np.zeros((7, 10))
        for i in range(7):
            H[i, i] = 1
        
        Q = np.eye(10, 10) * 0.01
        
        R = np.eye(7, 7) * 0.1
        
        return {
            'F': F,
            'H': H,
            'Q': Q,
            'R': R,
            'x': np.array([self.x, self.y, self.z, self.w, self.h, self.l, self.rotation_y, 0, 0, 0]),
            'P': np.eye(10, 10) * 0.1
        }
    
    def predict(self):
        kf = self.kf
        kf['x'] = kf['F'] @ kf['x']
        kf['P'] = kf['F'] @ kf['P'] @ kf['F'].T + kf['Q']
        
        self.x, self.y, self.z = kf['x'][0], kf['x'][1], kf['x'][2]
        self.w, self.h, self.l = abs(kf['x'][3]), abs(kf['x'][4]), abs(kf['x'][5])
        self.rotation_y = kf['x'][6]
        
        return self.get_state()
    
    def update(self, bbox: Dict):
        kf = self.kf
        z = np.array([
            bbox['x'], bbox['y'], bbox['z'],
            bbox['w'], bbox['h'], bbox['l'],
            bbox.get('rotation_y', 0)
        ])
        
        y = z - kf['H'] @ kf['x']
        S = kf['H'] @ kf['P'] @ kf['H'].T + kf['R']
        K = kf['P'] @ kf['H'].T @ np.linalg.inv(S)
        
        kf['x'] = kf['x'] + K @ y
        kf['P'] = (np.eye(10) - K @ kf['H']) @ kf['P']
        
        self.x, self.y, self.z = kf['x'][0], kf['x'][1], kf['x'][2]
        self.w, self.h, self.l = abs(kf['x'][3]), abs(kf['x'][4]), abs(kf['x'][5])
        self.rotation_y = kf['x'][6]
    
    def get_state(self) -> Dict:
        return {
            'x': self.x,
            'y': self.y,
            'z': self.z,
            'w': self.w,
            'h': self.h,
            'l': self.l,
            'rotation_y': self.rotation_y
        }

@dataclass
class Track:
    track_id: str
    class_name: str
    initial_bbox: Dict
    initial_confidence: float
    frame_id: int = 0
    
    def __post_init__(self):
        self.kalman_filter = KalmanBox3D(self.initial_bbox)
        self.state = TrackState.NEW
        self.hits = 1
        self.age = 0
        self.time_since_update = 0
        self.confidence_history = [self.initial_confidence]
        self.bbox_history = [self.initial_bbox]
        self.history = []
    
    def predict(self):
        self.age += 1
        self.time_since_update += 1
        predicted_bbox = self.kalman_filter.predict()
        self.history.append(predicted_bbox)
        return predicted_bbox
    
    def update(self, detection: Dict, frame_id: int):
        self.time_since_update = 0
        self.hits += 1
        self.frame_id = frame_id
        self.state = TrackState.TRACKED
        
        self.kalman_filter.update(detection['bbox'])
        self.confidence_history.append(detection['confidence'])
        self.bbox_history.append(detection['bbox'])
        self.history = []
    
    def mark_lost(self):
        self.state = TrackState.LOST
    
    def mark_removed(self):
        self.state = TrackState.REMOVED
    
    def get_current_bbox(self) -> Dict:
        return self.kalman_filter.get_state()
    
    def get_average_confidence(self) -> float:
        return np.mean(self.confidence_history[-10:]) if self.confidence_history else 0.0

class SORT:
    def __init__(self, 
                 max_age: int = 5,
                 min_hits: int = 3,
                 iou_threshold: float = 0.3,
                 use_3d_iou: bool = True):
        self.max_age = max_age
        self.min_hits = min_hits
        self.iou_threshold = iou_threshold
        self.use_3d_iou = use_3d_iou
        
        self.tracks: List[Track] = []
        self.frame_count = 0
        self.next_id = 1
    
    def _iou_2d(self, box1: Dict, box2: Dict) -> float:
        x1_min = box1['x'] - box1['w'] / 2
        x1_max = box1['x'] + box1['w'] / 2
        z1_min = box1['z'] - box1['l'] / 2
        z1_max = box1['z'] + box1['l'] / 2
        
        x2_min = box2['x'] - box2['w'] / 2
        x2_max = box2['x'] + box2['w'] / 2
        z2_min = box2['z'] - box2['l'] / 2
        z2_max = box2['z'] + box2['l'] / 2
        
        inter_x_min = max(x1_min, x2_min)
        inter_x_max = min(x1_max, x2_max)
        inter_z_min = max(z1_min, z2_min)
        inter_z_max = min(z1_max, z2_max)
        
        if inter_x_max <= inter_x_min or inter_z_max <= inter_z_min:
            return 0.0
        
        intersection = (inter_x_max - inter_x_min) * (inter_z_max - inter_z_min)
        area1 = box1['w'] * box1['l']
        area2 = box2['w'] * box2['l']
        union = area1 + area2 - intersection
        
        return intersection / union if union > 0 else 0.0
    
    def _iou_3d(self, box1: Dict, box2: Dict) -> float:
        x1_min = box1['x'] - box1['w'] / 2
        x1_max = box1['x'] + box1['w'] / 2
        y1_min = box1['y'] - box1['h'] / 2
        y1_max = box1['y'] + box1['h'] / 2
        z1_min = box1['z'] - box1['l'] / 2
        z1_max = box1['z'] + box1['l'] / 2
        
        x2_min = box2['x'] - box2['w'] / 2
        x2_max = box2['x'] + box2['w'] / 2
        y2_min = box2['y'] - box2['h'] / 2
        y2_max = box2['y'] + box2['h'] / 2
        z2_min = box2['z'] - box2['l'] / 2
        z2_max = box2['z'] + box2['l'] / 2
        
        inter_x_min = max(x1_min, x2_min)
        inter_x_max = min(x1_max, x2_max)
        inter_y_min = max(y1_min, y2_min)
        inter_y_max = min(y1_max, y2_max)
        inter_z_min = max(z1_min, z2_min)
        inter_z_max = min(z1_max, z2_max)
        
        if inter_x_max <= inter_x_min or inter_y_max <= inter_y_min or inter_z_max <= inter_z_min:
            return 0.0
        
        intersection = (inter_x_max - inter_x_min) * (inter_y_max - inter_y_min) * (inter_z_max - inter_z_min)
        volume1 = box1['w'] * box1['h'] * box1['l']
        volume2 = box2['w'] * box2['h'] * box2['l']
        union = volume1 + volume2 - intersection
        
        return intersection / union if union > 0 else 0.0
    
    def _compute_iou_matrix(self, detections: List[Dict], tracks: List[Track]) -> np.ndarray:
        if len(detections) == 0 or len(tracks) == 0:
            return np.zeros((len(detections), len(tracks)))
        
        iou_matrix = np.zeros((len(detections), len(tracks)))
        
        for i, det in enumerate(detections):
            for j, track in enumerate(tracks):
                det_bbox = det['bbox']
                track_bbox = track.get_current_bbox()
                
                if self.use_3d_iou:
                    iou_matrix[i, j] = self._iou_3d(det_bbox, track_bbox)
                else:
                    iou_matrix[i, j] = self._iou_2d(det_bbox, track_bbox)
        
        return iou_matrix
    
    def update(self, detections: List[Dict], frame_id: Optional[int] = None) -> List[Dict]:
        self.frame_count += 1
        if frame_id is None:
            frame_id = self.frame_count
        
        results = []
        
        for track in self.tracks:
            track.predict()
        
        class_groups = {}
        for det in detections:
            cls = det.get('class_name', 'Unknown')
            if cls not in class_groups:
                class_groups[cls] = []
            class_groups[cls].append(det)
        
        for class_name, class_detections in class_groups.items():
            class_tracks = [t for t in self.tracks if t.class_name == class_name and t.state != TrackState.REMOVED]
            
            if len(class_tracks) > 0 and len(class_detections) > 0:
                iou_matrix = self._compute_iou_matrix(class_detections, class_tracks)
                
                det_indices, track_indices = linear_sum_assignment(-iou_matrix)
                
                matched_dets = set()
                matched_tracks = set()
                
                for det_idx, track_idx in zip(det_indices, track_indices):
                    if iou_matrix[det_idx, track_idx] >= self.iou_threshold:
                        class_tracks[track_idx].update(class_detections[det_idx], frame_id)
                        matched_dets.add(det_idx)
                        matched_tracks.add(track_idx)
                
                for i, det in enumerate(class_detections):
                    if i not in matched_dets:
                        new_track = Track(
                            track_id=f"{class_name}_{self.next_id}",
                            class_name=class_name,
                            initial_bbox=det['bbox'],
                            initial_confidence=det['confidence'],
                            frame_id=frame_id
                        )
                        self.tracks.append(new_track)
                        self.next_id += 1
            
            elif len(class_detections) > 0:
                for det in class_detections:
                    new_track = Track(
                        track_id=f"{class_name}_{self.next_id}",
                        class_name=class_name,
                        initial_bbox=det['bbox'],
                        initial_confidence=det['confidence'],
                        frame_id=frame_id
                    )
                    self.tracks.append(new_track)
                    self.next_id += 1
        
        for track in self.tracks:
            if track.state == TrackState.TRACKED and track.hits >= self.min_hits:
                bbox = track.get_current_bbox()
                results.append({
                    'track_id': track.track_id,
                    'class_name': track.class_name,
                    'confidence': track.get_average_confidence(),
                    'bbox': bbox,
                    'frame_id': frame_id,
                    'age': track.age,
                    'hits': track.hits
                })
            
            if track.time_since_update > self.max_age:
                track.mark_removed()
        
        self.tracks = [t for t in self.tracks if t.state != TrackState.REMOVED]
        
        return results
    
    def get_all_tracks(self) -> List[Dict]:
        return [{
            'track_id': t.track_id,
            'class_name': t.class_name,
            'state': t.state,
            'hits': t.hits,
            'age': t.age,
            'time_since_update': t.time_since_update,
            'avg_confidence': t.get_average_confidence(),
            'current_bbox': t.get_current_bbox()
        } for t in self.tracks]
    
    def reset(self):
        self.tracks = []
        self.frame_count = 0
        self.next_id = 1

tracker = SORT(max_age=5, min_hits=2, iou_threshold=0.25, use_3d_iou=True)
