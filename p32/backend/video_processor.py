import cv2
import numpy as np
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from collections import defaultdict, deque

from backend.fish_detector import FishDetector
from backend.deep_sort.tracker import Tracker
from backend.deep_sort.detection import Detection
from backend.deep_sort.nn_matching import NearestNeighborDistanceMetric
from backend.behavior_analyzer import analyze_all_tracks


class UnderwaterImageEnhancer:
    def __init__(self):
        self.gamma = 1.2
        self.clip_limit = 2.0
        self.tile_grid_size = (8, 8)
    
    def enhance(self, frame):
        lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        
        clahe = cv2.createCLAHE(clipLimit=self.clip_limit, tileGridSize=self.tile_grid_size)
        l_enhanced = clahe.apply(l)
        
        lab_enhanced = cv2.merge((l_enhanced, a, b))
        enhanced = cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2BGR)
        
        enhanced = self._white_balance(enhanced)
        enhanced = self._gamma_correction(enhanced)
        
        return enhanced
    
    def _white_balance(self, frame):
        result = cv2.xphoto.createSimpleWB().balanceWhite(frame) if hasattr(cv2, 'xphoto') else frame
        return result
    
    def _gamma_correction(self, frame):
        inv_gamma = 1.0 / self.gamma
        table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in np.arange(0, 256)]).astype("uint8")
        return cv2.LUT(frame, table)


class DetectionSmoother:
    def __init__(self, buffer_size=3, iou_threshold=0.4):
        self.buffer_size = buffer_size
        self.iou_threshold = iou_threshold
        self.detection_buffer = deque(maxlen=buffer_size)
    
    def update(self, detections):
        self.detection_buffer.append(detections)
        return self._smooth_detections()
    
    def _smooth_detections(self):
        if len(self.detection_buffer) < 2:
            return self.detection_buffer[-1]
        
        smoothed = []
        current_dets = self.detection_buffer[-1]
        
        for current_det in current_dets:
            matched_dets = [current_det]
            
            for past_dets in list(self.detection_buffer)[:-1]:
                for past_det in past_dets:
                    if self._iou(current_det["bbox"], past_det["bbox"]) > self.iou_threshold:
                        matched_dets.append(past_det)
                        break
            
            if len(matched_dets) >= 2:
                avg_bbox = np.mean([d["bbox"] for d in matched_dets], axis=0).tolist()
                avg_conf = np.mean([d["confidence"] for d in matched_dets])
                smoothed_det = current_det.copy()
                smoothed_det["bbox"] = avg_bbox
                smoothed_det["confidence"] = avg_conf
                smoothed.append(smoothed_det)
            else:
                smoothed.append(current_det)
        
        return smoothed
    
    def _iou(self, bbox1, bbox2):
        x1 = max(bbox1[0], bbox2[0])
        y1 = max(bbox1[1], bbox2[1])
        x2 = min(bbox1[2], bbox2[2])
        y2 = min(bbox1[3], bbox2[3])
        
        if x2 <= x1 or y2 <= y1:
            return 0.0
        
        intersection = (x2 - x1) * (y2 - y1)
        area1 = (bbox1[2] - bbox1[0]) * (bbox1[3] - bbox1[1])
        area2 = (bbox2[2] - bbox2[0]) * (bbox2[3] - bbox2[1])
        
        return intersection / (area1 + area2 - intersection + 1e-6)


class VideoProcessor:
    def __init__(self, pixel_per_cm=10.0):
        self.detector = FishDetector()
        self.enhancer = UnderwaterImageEnhancer()
        self.detection_smoother = DetectionSmoother(buffer_size=3, iou_threshold=0.35)
        self.results_dir = Path("results")
        self.results_dir.mkdir(exist_ok=True)
        
        self.max_age = 60
        self.n_init = 2
        self.max_iou_distance = 0.8
        self.matching_threshold = 0.3
        self.budget = 200
        self.pixel_per_cm = pixel_per_cm
    
    def _get_feature(self, frame, bbox):
        x1, y1, x2, y2 = map(int, bbox)
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(frame.shape[1], x2), min(frame.shape[0], y2)
        
        if x2 <= x1 or y2 <= y1:
            return np.zeros(256)
        
        crop = frame[y1:y2, x1:x2]
        
        crop_hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
        hist_h = cv2.calcHist([crop_hsv], [0], None, [32], [0, 180]).flatten()
        hist_s = cv2.calcHist([crop_hsv], [1], None, [32], [0, 256]).flatten()
        hist_v = cv2.calcHist([crop_hsv], [2], None, [32], [0, 256]).flatten()
        
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        gray = cv2.resize(gray, (16, 16))
        spatial = gray.flatten().astype(np.float32) / 255.0
        
        feature = np.concatenate([hist_h / (hist_h.sum() + 1e-6), 
                                  hist_s / (hist_s.sum() + 1e-6),
                                  hist_v / (hist_v.sum() + 1e-6),
                                  spatial * 0.5])
        
        return feature.astype(np.float32)
    
    def _multi_scale_detect(self, frame, conf_threshold=0.25):
        all_detections = []
        
        scales = [1.0]
        if min(frame.shape[:2]) < 640:
            scales.append(1.2)
        if min(frame.shape[:2]) > 480:
            scales.append(0.8)
        
        seen_bboxes = []
        for scale in scales:
            if scale != 1.0:
                scaled = cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_LINEAR)
            else:
                scaled = frame
            
            detections = self.detector.detect(scaled, conf_threshold=conf_threshold * 0.9)
            
            for det in detections:
                bbox = [x / scale for x in det["bbox"]]
                det["bbox"] = bbox
                
                duplicate = False
                for seen in seen_bboxes:
                    if self._iou(bbox, seen) > 0.7:
                        duplicate = True
                        break
                
                if not duplicate:
                    all_detections.append(det)
                    seen_bboxes.append(bbox)
        
        return self._nms(all_detections, iou_threshold=0.5)
    
    def _nms(self, detections, iou_threshold=0.5):
        if not detections:
            return []
        
        detections = sorted(detections, key=lambda x: x["confidence"], reverse=True)
        keep = []
        
        while detections:
            best = detections.pop(0)
            keep.append(best)
            
            detections = [d for d in detections 
                         if self._iou(best["bbox"], d["bbox"]) < iou_threshold]
        
        return keep
    
    def _iou(self, bbox1, bbox2):
        x1 = max(bbox1[0], bbox2[0])
        y1 = max(bbox1[1], bbox2[1])
        x2 = min(bbox1[2], bbox2[2])
        y2 = min(bbox1[3], bbox2[3])
        
        if x2 <= x1 or y2 <= y1:
            return 0.0
        
        intersection = (x2 - x1) * (y2 - y1)
        area1 = (bbox1[2] - bbox1[0]) * (bbox1[3] - bbox1[1])
        area2 = (bbox2[2] - bbox2[0]) * (bbox2[3] - bbox2[1])
        
        return intersection / (area1 + area2 - intersection + 1e-6)
    
    def _interpolate_tracks(self, tracks_data, total_frames):
        for track_id, track_info in tracks_data.items():
            frame_ids = track_info["frame_ids"]
            positions = track_info["positions"]
            bboxes = track_info["bboxes"]
            
            if len(frame_ids) < 2:
                continue
            
            min_frame = min(frame_ids)
            max_frame = max(frame_ids)
            all_frame_ids = list(range(min_frame, max_frame + 1))
            
            if len(all_frame_ids) != len(frame_ids):
                interp_positions = []
                interp_bboxes = []
                
                pos_arr = np.array(positions)
                bbox_arr = np.array(bboxes)
                fid_arr = np.array(frame_ids)
                
                for fid in all_frame_ids:
                    if fid in fid_arr:
                        idx = np.where(fid_arr == fid)[0][0]
                        interp_positions.append(positions[idx])
                        interp_bboxes.append(bboxes[idx])
                    else:
                        interp_x = np.interp(fid, fid_arr, pos_arr[:, 0])
                        interp_y = np.interp(fid, fid_arr, pos_arr[:, 1])
                        interp_positions.append([interp_x, interp_y])
                        
                        interp_bbox = [
                            np.interp(fid, fid_arr, bbox_arr[:, 0]),
                            np.interp(fid, fid_arr, bbox_arr[:, 1]),
                            np.interp(fid, fid_arr, bbox_arr[:, 2]),
                            np.interp(fid, fid_arr, bbox_arr[:, 3])
                        ]
                        interp_bboxes.append(interp_bbox)
                
                track_info["frame_ids"] = all_frame_ids
                track_info["positions"] = interp_positions
                track_info["bboxes"] = interp_bboxes
        
        return tracks_data
    
    def process_video(self, video_path: str, task_id: str):
        task_dir = self.results_dir / task_id
        task_dir.mkdir(parents=True, exist_ok=True)
        
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Cannot open video file: {video_path}")
        
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        metric = NearestNeighborDistanceMetric(
            "cosine", 
            self.matching_threshold, 
            budget=self.budget
        )
        tracker = Tracker(
            metric, 
            max_iou_distance=self.max_iou_distance, 
            max_age=self.max_age, 
            n_init=self.n_init
        )
        
        tracks_data = defaultdict(lambda: {
            "class_name": "fish",
            "positions": [],
            "frame_ids": [],
            "bboxes": []
        })
        
        heatmap = np.zeros((height, width), dtype=np.float32)
        count_per_frame = []
        fish_type_counts = defaultdict(int)
        unique_track_ids = set()
        
        frame_idx = 0
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            enhanced_frame = self.enhancer.enhance(frame)
            
            detections = self._multi_scale_detect(enhanced_frame, conf_threshold=0.25)
            detections = self.detection_smoother.update(detections)
            
            deepsort_detections = []
            for det in detections:
                bbox = det["bbox"]
                tlwh = [bbox[0], bbox[1], bbox[2] - bbox[0], bbox[3] - bbox[1]]
                confidence = det["confidence"]
                feature = self._get_feature(enhanced_frame, bbox)
                deepsort_detections.append(Detection(tlwh, confidence, feature, det["class_name"]))
            
            tracker.predict()
            tracker.update(deepsort_detections)
            
            current_count = 0
            for track in tracker.tracks:
                if not track.is_confirmed() and track.time_since_update > 1:
                    continue
                
                track_id = track.track_id
                
                if track.is_confirmed():
                    unique_track_ids.add(track_id)
                    current_count += 1
                
                bbox = track.to_tlbr()
                center = track.get_center()
                
                if track.is_confirmed() or track.hits >= 1:
                    tracks_data[track_id]["class_name"] = track.class_name
                    tracks_data[track_id]["positions"].append([float(center[0]), float(center[1])])
                    tracks_data[track_id]["frame_ids"].append(frame_idx)
                    tracks_data[track_id]["bboxes"].append([float(x) for x in bbox])
                
                    if track.is_confirmed() and 0 <= int(center[1]) < height and 0 <= int(center[0]) < width:
                        cv2.circle(heatmap, (int(center[0]), int(center[1])), 20, 1, -1)
            
            count_per_frame.append(current_count)
            frame_idx += 1
        
        cap.release()
        
        tracks_data = self._interpolate_tracks(tracks_data, total_frames)
        
        for track_id in unique_track_ids:
            class_name = tracks_data[track_id]["class_name"]
            fish_type_counts[class_name] += 1
        
        confirmed_tracks = {k: v for k, v in tracks_data.items() if k in unique_track_ids}
        behavior_analysis = analyze_all_tracks(confirmed_tracks, fps=fps, pixel_per_cm=self.pixel_per_cm)
        
        self._generate_heatmap(heatmap, task_dir)
        self._generate_count_curve(count_per_frame, fps, task_dir)
        self._generate_behavior_charts(behavior_analysis, task_dir)
        
        output_video_path = task_dir / "output.mp4"
        self._create_tracked_video(video_path, confirmed_tracks, str(output_video_path), 
                                   behavior_analysis, unique_track_ids)
        
        track_data_json = {
            "tracks": {str(k): v for k, v in confirmed_tracks.items()},
            "behavior_analysis": behavior_analysis,
            "count_per_frame": count_per_frame,
            "fps": fps,
            "total_frames": total_frames,
            "pixel_per_cm": self.pixel_per_cm
        }
        
        return {
            "total_count": len(unique_track_ids),
            "fish_types": dict(fish_type_counts),
            "result_path": str(output_video_path),
            "track_data": track_data_json
        }
    
    def _generate_heatmap(self, heatmap, task_dir):
        plt.figure(figsize=(10, 6))
        
        heatmap = cv2.GaussianBlur(heatmap, (31, 31), 0)
        heatmap_norm = cv2.normalize(heatmap, None, 0, 255, cv2.NORM_MINMAX)
        heatmap_colored = cv2.applyColorMap(heatmap_norm.astype(np.uint8), cv2.COLORMAP_JET)
        heatmap_colored = cv2.cvtColor(heatmap_colored, cv2.COLOR_BGR2RGB)
        
        plt.imshow(heatmap_colored)
        plt.title("Fish Trajectory Heatmap")
        plt.axis('off')
        plt.tight_layout()
        plt.savefig(task_dir / "heatmap.png", dpi=150)
        plt.close()
    
    def _generate_count_curve(self, count_per_frame, fps, task_dir):
        plt.figure(figsize=(12, 6))
        
        times = [i / fps for i in range(len(count_per_frame))]
        
        kernel_size = max(3, min(15, int(fps / 2)))
        if kernel_size % 2 == 0:
            kernel_size += 1
        
        smoothed_counts = np.convolve(
            count_per_frame, 
            np.ones(kernel_size) / kernel_size, 
            mode='same'
        )
        
        plt.plot(times, smoothed_counts, linewidth=2, color='#2E86AB', label='Smoothed')
        plt.plot(times, count_per_frame, linewidth=0.5, color='#2E86AB', alpha=0.3, label='Raw')
        plt.fill_between(times, smoothed_counts, alpha=0.3, color='#2E86AB')
        
        plt.title("Fish Count Over Time", fontsize=14, pad=20)
        plt.xlabel("Time (seconds)", fontsize=12)
        plt.ylabel("Number of Fish", fontsize=12)
        plt.legend()
        plt.grid(True, alpha=0.3)
        plt.tight_layout()
        plt.savefig(task_dir / "count_curve.png", dpi=150)
        plt.close()
    
    def _generate_behavior_charts(self, behavior_analysis, task_dir):
        if not behavior_analysis:
            return
        
        all_speeds = []
        all_sizes = []
        all_turns = []
        
        for track_id, metrics in behavior_analysis.items():
            summary = metrics["summary"]
            all_speeds.append(summary["avg_speed_cm_s"])
            all_sizes.append(summary["avg_size_cm"])
            all_turns.append(summary["avg_turn_angle_deg"])
        
        fig, axes = plt.subplots(2, 2, figsize=(14, 10))
        
        ax1 = axes[0, 0]
        ax1.hist(all_speeds, bins=15, color='#06b6d4', alpha=0.7, edgecolor='black')
        ax1.set_title("Distribution of Average Swimming Speed", fontsize=12)
        ax1.set_xlabel("Speed (cm/s)")
        ax1.set_ylabel("Frequency")
        ax1.grid(True, alpha=0.3)
        
        ax2 = axes[0, 1]
        ax2.hist(all_sizes, bins=15, color='#8b5cf6', alpha=0.7, edgecolor='black')
        ax2.set_title("Distribution of Fish Size", fontsize=12)
        ax2.set_xlabel("Size (cm)")
        ax2.set_ylabel("Frequency")
        ax2.grid(True, alpha=0.3)
        
        ax3 = axes[1, 0]
        ax3.hist(all_turns, bins=15, color='#f59e0b', alpha=0.7, edgecolor='black')
        ax3.set_title("Distribution of Average Turn Angle", fontsize=12)
        ax3.set_xlabel("Turn Angle (degrees)")
        ax3.set_ylabel("Frequency")
        ax3.grid(True, alpha=0.3)
        
        ax4 = axes[1, 1]
        if all_speeds and all_sizes:
            ax4.scatter(all_sizes, all_speeds, c='#10b981', alpha=0.6, s=60)
            ax4.set_title("Size vs Speed Correlation", fontsize=12)
            ax4.set_xlabel("Average Size (cm)")
            ax4.set_ylabel("Average Speed (cm/s)")
            ax4.grid(True, alpha=0.3)
        
        plt.tight_layout()
        plt.savefig(task_dir / "behavior_analysis.png", dpi=150)
        plt.close()
    
    def _create_tracked_video(self, input_path, tracks_data, output_path, 
                               behavior_analysis, confirmed_ids):
        cap = cv2.VideoCapture(input_path)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
        
        colors = {}
        import random
        random.seed(42)
        
        for track_id in confirmed_ids:
            colors[track_id] = (
                random.randint(0, 255),
                random.randint(0, 255),
                random.randint(0, 255)
            )
        
        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            overlay = frame.copy()
            cv2.rectangle(overlay, (0, 0), (width, 70), (0, 0, 0), -1)
            cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)
            
            fish_count = sum(1 for tid in confirmed_ids 
                           if frame_idx in tracks_data.get(tid, {}).get("frame_ids", []))
            
            cv2.putText(frame, f"Frame: {frame_idx} | Fish Count: {fish_count}",
                       (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            cv2.putText(frame, f"Pixel/cm ratio: {self.pixel_per_cm}",
                       (10, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 2)
            
            for track_id, track_info in tracks_data.items():
                if track_id not in confirmed_ids:
                    continue
                
                if frame_idx not in track_info["frame_ids"]:
                    continue
                
                pos_idx = track_info["frame_ids"].index(frame_idx)
                bbox = track_info["bboxes"][pos_idx]
                positions = track_info["positions"]
                
                color = colors.get(track_id, (0, 255, 0))
                x1, y1, x2, y2 = map(int, bbox)
                
                track_behavior = behavior_analysis.get(str(track_id), {})
                frame_data_list = track_behavior.get("frame_data", [])
                current_frame_data = next((fd for fd in frame_data_list 
                                          if fd["frame_id"] == frame_idx), None)
                
                size_cm = 0
                speed_cm_s = 0
                turn_deg = 0
                
                if current_frame_data:
                    size_info = current_frame_data.get("size", {})
                    size_cm = size_info.get("width_cm", 0)
                    speed_cm_s = current_frame_data.get("speed_cm_s", 0)
                    turn_deg = current_frame_data.get("turn_angle_deg", 0)
                
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                
                label_lines = [
                    f"ID:{track_id} {track_info['class_name']}",
                    f"Size: {size_cm:.1f}cm",
                    f"Speed: {speed_cm_s:.1f}cm/s"
                ]
                
                for i, line in enumerate(label_lines):
                    y_pos = y1 - 10 - (len(label_lines) - 1 - i) * 18
                    cv2.putText(frame, line, (x1, y_pos),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 2)
                
                start_idx = max(0, pos_idx - 30)
                for i in range(start_idx + 1, pos_idx + 1):
                    if i < len(positions):
                        pos1 = tuple(map(int, positions[i-1]))
                        pos2 = tuple(map(int, positions[i]))
                        cv2.line(frame, pos1, pos2, color, 2)
                
                if abs(turn_deg) > 30 and pos_idx > 0:
                    center = tuple(map(int, positions[pos_idx]))
                    arrow_len = 40
                    angle_rad = np.radians(-turn_deg / 2)
                    prev_center = tuple(map(int, positions[pos_idx - 1]))
                    dx = center[0] - prev_center[0]
                    dy = center[1] - prev_center[1]
                    base_angle = np.arctan2(dy, dx) if (dx != 0 or dy != 0) else 0
                    
                    end_x = int(center[0] + arrow_len * np.cos(base_angle + angle_rad))
                    end_y = int(center[1] + arrow_len * np.sin(base_angle + angle_rad))
                    cv2.arrowedLine(frame, center, (end_x, end_y), (0, 165, 255), 2, tipLength=0.3)
            
            out.write(frame)
            frame_idx += 1
        
        cap.release()
        out.release()
