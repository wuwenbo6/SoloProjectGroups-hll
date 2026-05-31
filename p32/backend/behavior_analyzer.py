import numpy as np
from collections import defaultdict


class FishBehaviorAnalyzer:
    def __init__(self, fps=30.0, pixel_per_cm=10.0):
        self.fps = fps
        self.pixel_per_cm = pixel_per_cm
        
        self.track_metrics = defaultdict(lambda: {
            "speeds": [],
            "turn_angles": [],
            "sizes": [],
            "accelerations": []
        })
    
    def pixels_to_cm(self, pixels):
        return pixels / self.pixel_per_cm
    
    def calculate_distance(self, pos1, pos2):
        dx = pos2[0] - pos1[0]
        dy = pos2[1] - pos1[1]
        return np.sqrt(dx**2 + dy**2)
    
    def calculate_speed(self, pos1, pos2, frame_diff=1):
        pixel_distance = self.calculate_distance(pos1, pos2)
        cm_distance = self.pixels_to_cm(pixel_distance)
        time_seconds = frame_diff / self.fps
        return cm_distance / time_seconds if time_seconds > 0 else 0
    
    def calculate_turn_angle(self, pos_prev, pos_curr, pos_next):
        v1 = np.array([pos_prev[0] - pos_curr[0], pos_prev[1] - pos_curr[1]])
        v2 = np.array([pos_next[0] - pos_curr[0], pos_next[1] - pos_curr[1]])
        
        norm_v1 = np.linalg.norm(v1)
        norm_v2 = np.linalg.norm(v2)
        
        if norm_v1 == 0 or norm_v2 == 0:
            return 0
        
        cos_angle = np.dot(v1, v2) / (norm_v1 * norm_v2)
        cos_angle = np.clip(cos_angle, -1.0, 1.0)
        
        angle_rad = np.arccos(cos_angle)
        angle_deg = np.degrees(angle_rad)
        
        cross = np.cross(v1, v2)
        if cross < 0:
            angle_deg = -angle_deg
        
        return angle_deg
    
    def calculate_size(self, bbox):
        x1, y1, x2, y2 = bbox
        width_pix = x2 - x1
        height_pix = y2 - y1
        
        width_cm = self.pixels_to_cm(width_pix)
        height_cm = self.pixels_to_cm(height_pix)
        area_cm2 = width_cm * height_cm
        
        return {
            "width_pix": width_pix,
            "height_pix": height_pix,
            "width_cm": width_cm,
            "height_cm": height_cm,
            "area_cm2": area_cm2,
            "diagonal_cm": self.pixels_to_cm(np.sqrt(width_pix**2 + height_pix**2))
        }
    
    def analyze_track(self, track_id, positions, bboxes, frame_ids):
        if len(positions) < 2:
            return None
        
        metrics = {
            "track_id": track_id,
            "frame_data": [],
            "summary": {}
        }
        
        speeds = []
        turn_angles = []
        sizes = []
        
        for i in range(len(positions)):
            frame_data = {
                "frame_id": frame_ids[i],
                "position": positions[i],
                "bbox": bboxes[i]
            }
            
            size = self.calculate_size(bboxes[i])
            sizes.append(size["diagonal_cm"])
            frame_data["size"] = size
            
            if i > 0:
                frame_diff = frame_ids[i] - frame_ids[i-1]
                speed = self.calculate_speed(positions[i-1], positions[i], frame_diff)
                speeds.append(speed)
                frame_data["speed_cm_s"] = speed
                
                if i > 1:
                    turn_angle = self.calculate_turn_angle(
                        positions[i-2], positions[i-1], positions[i]
                    )
                    turn_angles.append(turn_angle)
                    frame_data["turn_angle_deg"] = turn_angle
                else:
                    frame_data["turn_angle_deg"] = 0
            else:
                frame_data["speed_cm_s"] = 0
                frame_data["turn_angle_deg"] = 0
            
            metrics["frame_data"].append(frame_data)
        
        accelerations = []
        for i in range(1, len(speeds)):
            frame_diff = frame_ids[i] - frame_ids[i-1]
            time_seconds = frame_diff / self.fps
            if time_seconds > 0:
                accel = (speeds[i] - speeds[i-1]) / time_seconds
                accelerations.append(accel)
        
        metrics["summary"] = {
            "avg_speed_cm_s": np.mean(speeds) if speeds else 0,
            "max_speed_cm_s": np.max(speeds) if speeds else 0,
            "min_speed_cm_s": np.min(speeds) if speeds else 0,
            "std_speed_cm_s": np.std(speeds) if speeds else 0,
            "avg_turn_angle_deg": np.mean(np.abs(turn_angles)) if turn_angles else 0,
            "max_turn_angle_deg": np.max(np.abs(turn_angles)) if turn_angles else 0,
            "total_turn_deg": np.sum(np.abs(turn_angles)) if turn_angles else 0,
            "avg_size_cm": np.mean(sizes) if sizes else 0,
            "max_size_cm": np.max(sizes) if sizes else 0,
            "min_size_cm": np.min(sizes) if sizes else 0,
            "avg_acceleration_cm_s2": np.mean(accelerations) if accelerations else 0,
            "max_acceleration_cm_s2": np.max(accelerations) if accelerations else 0,
            "total_distance_cm": np.sum([self.pixels_to_cm(self.calculate_distance(positions[i-1], positions[i])) 
                                         for i in range(1, len(positions))]),
            "duration_seconds": (frame_ids[-1] - frame_ids[0]) / self.fps if len(frame_ids) > 1 else 0,
            "total_frames": len(frame_ids)
        }
        
        return metrics


def analyze_all_tracks(tracks_data, fps=30.0, pixel_per_cm=10.0):
    analyzer = FishBehaviorAnalyzer(fps=fps, pixel_per_cm=pixel_per_cm)
    results = {}
    
    for track_id, track_info in tracks_data.items():
        positions = track_info.get("positions", [])
        bboxes = track_info.get("bboxes", [])
        frame_ids = track_info.get("frame_ids", [])
        
        if len(positions) >= 2:
            metrics = analyzer.analyze_track(track_id, positions, bboxes, frame_ids)
            if metrics:
                results[str(track_id)] = metrics
    
    return results
