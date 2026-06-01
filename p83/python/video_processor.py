import cv2
import numpy as np
from collections import defaultdict
import json
import os
import base64


class ObjectClassifier:
    def __init__(self):
        self.hog = cv2.HOGDescriptor()
        self.hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

    def classify(self, frame, box):
        x, y, w, h = box
        
        if x < 0 or y < 0 or x + w > frame.shape[1] or y + h > frame.shape[0]:
            return 'unknown', 0.0

        roi = frame[y:y+h, x:x+w]
        if roi.size == 0:
            return 'unknown', 0.0

        aspect_ratio = w / h if h > 0 else 0
        area = w * h

        person_score = 0
        car_score = 0

        if 0.2 < aspect_ratio < 0.8 and h > w:
            person_score += 30
        elif 1.0 < aspect_ratio < 3.0 and w > h:
            car_score += 30

        try:
            roi_gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
            roi_resized = cv2.resize(roi_gray, (64, 128))
            
            found, weights = self.hog.detect(roi_resized, winStride=(8, 8), padding=(8, 8), scale=1.05)
            
            if len(found) > 0 and weights[0] > 0.3:
                person_score += weights[0] * 50
        except Exception:
            pass

        try:
            hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
            v_channel = hsv[:, :, 2]
            mean_brightness = np.mean(v_channel)
            
            gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
            edges = cv2.Canny(gray, 50, 150)
            edge_density = np.sum(edges > 0) / (w * h)
            
            if edge_density > 0.15:
                car_score += 20
            if 0.8 < aspect_ratio < 2.5:
                car_score += 10
        except Exception:
            pass

        if person_score > car_score and person_score > 20:
            return 'person', min(person_score, 100)
        elif car_score > person_score and car_score > 20:
            return 'car', min(car_score, 100)
        else:
            return 'unknown', 0.0


class MotionDetector:
    def __init__(self, min_area=800, history=500, var_threshold=25):
        self.min_area = min_area
        self.backSub = cv2.createBackgroundSubtractorMOG2(
            history=history,
            varThreshold=var_threshold,
            detectShadows=False
        )
        self.kernel_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        self.kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        self.kernel_dilate = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))

    def process_frame(self, frame):
        fg_mask = self.backSub.apply(frame)
        
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, self.kernel_open, iterations=1)
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, self.kernel_close, iterations=2)
        fg_mask = cv2.dilate(fg_mask, self.kernel_dilate, iterations=1)
        
        contours, _ = cv2.findContours(
            fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        
        boxes = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area >= self.min_area:
                x, y, w, h = cv2.boundingRect(contour)
                aspect_ratio = w / h if h > 0 else 0
                if 0.2 < aspect_ratio < 5.0:
                    boxes.append((x, y, w, h))
        
        boxes = self._merge_overlapping_boxes(boxes)
        return boxes, fg_mask

    def _merge_overlapping_boxes(self, boxes, overlap_threshold=0.3):
        if not boxes:
            return []
        
        boxes = sorted(boxes, key=lambda b: b[2] * b[3], reverse=True)
        merged = []
        used = [False] * len(boxes)
        
        for i, box1 in enumerate(boxes):
            if used[i]:
                continue
            
            x1, y1, w1, h1 = box1
            merged_box = [x1, y1, w1, h1]
            used[i] = True
            
            for j, box2 in enumerate(boxes[i+1:], start=i+1):
                if used[j]:
                    continue
                
                x2, y2, w2, h2 = box2
                iou = self._calculate_iou(
                    (x1, y1, x1+w1, y1+h1),
                    (x2, y2, x2+w2, y2+h2)
                )
                
                if iou > overlap_threshold:
                    nx = min(x1, x2)
                    ny = min(y1, y2)
                    nw = max(x1 + w1, x2 + w2) - nx
                    nh = max(y1 + h1, y2 + h2) - ny
                    merged_box = [nx, ny, nw, nh]
                    x1, y1, w1, h1 = merged_box
                    used[j] = True
            
            merged.append(tuple(merged_box))
        
        return merged

    def _calculate_iou(self, box1, box2):
        x1_min, y1_min, x1_max, y1_max = box1
        x2_min, y2_min, x2_max, y2_max = box2
        
        inter_x_min = max(x1_min, x2_min)
        inter_y_min = max(y1_min, y2_min)
        inter_x_max = min(x1_max, x2_max)
        inter_y_max = min(y1_max, y2_max)
        
        if inter_x_max <= inter_x_min or inter_y_max <= inter_y_min:
            return 0
        
        inter_area = (inter_x_max - inter_x_min) * (inter_y_max - inter_y_min)
        area1 = (x1_max - x1_min) * (y1_max - y1_min)
        area2 = (x2_max - x2_min) * (y2_max - y2_min)
        union_area = area1 + area2 - inter_area
        
        return inter_area / union_area if union_area > 0 else 0


class TargetTracker:
    def __init__(self, max_disappeared=30, max_distance=100):
        self.next_object_id = 0
        self.objects = {}
        self.disappeared = {}
        self.max_disappeared = max_disappeared
        self.max_distance = max_distance
        self.object_timelines = defaultdict(list)
        self.object_boxes = {}
        self.object_classes = {}
        self.object_trajectories = defaultdict(list)
        self.classifier = ObjectClassifier()

    def register(self, centroid, box, frame=None):
        obj_class = 'unknown'
        class_score = 0.0
        
        if frame is not None:
            obj_class, class_score = self.classifier.classify(frame, box)
        
        self.objects[self.next_object_id] = centroid
        self.object_boxes[self.next_object_id] = box
        self.object_classes[self.next_object_id] = {
            'class': obj_class,
            'score': class_score
        }
        self.object_trajectories[self.next_object_id].append(centroid)
        self.disappeared[self.next_object_id] = 0
        self.next_object_id += 1

    def deregister(self, object_id):
        del self.objects[object_id]
        del self.disappeared[object_id]
        del self.object_boxes[object_id]
        del self.object_classes[object_id]
        if object_id in self.object_trajectories:
            del self.object_trajectories[object_id]

    def update(self, rects, frame_num, timestamp, frame=None):
        if len(rects) == 0:
            for object_id in list(self.disappeared.keys()):
                self.disappeared[object_id] += 1
                if self.disappeared[object_id] > self.max_disappeared:
                    self.deregister(object_id)
            return self.objects

        input_centroids = []
        input_boxes = []
        for (x, y, w, h) in rects:
            cX = int((x + x + w) / 2.0)
            cY = int((y + y + h) / 2.0)
            input_centroids.append((cX, cY))
            input_boxes.append((x, y, w, h))

        input_centroids = np.array(input_centroids)

        if len(self.objects) == 0:
            for i in range(len(input_centroids)):
                self.register(input_centroids[i], input_boxes[i], frame)
                self.object_timelines[self.next_object_id - 1].append({
                    'frame': frame_num,
                    'timestamp': timestamp,
                    'centroid': (input_centroids[i][0], input_centroids[i][1]),
                    'box': input_boxes[i]
                })
        else:
            object_ids = list(self.objects.keys())
            object_centroids = np.array(list(self.objects.values()))
            object_boxes_list = [self.object_boxes[oid] for oid in object_ids]

            D = np.linalg.norm(
                object_centroids[:, np.newaxis] - input_centroids,
                axis=2
            )

            iou_matrix = np.zeros((len(object_ids), len(input_centroids)))
            for i, obj_box in enumerate(object_boxes_list):
                for j, inp_box in enumerate(input_boxes):
                    iou_matrix[i, j] = self._calculate_iou(obj_box, inp_box)

            combined_score = D - (iou_matrix * 200)

            rows = combined_score.min(axis=1).argsort()
            cols = combined_score.argmin(axis=1)[rows]

            used_rows = set()
            used_cols = set()

            for (row, col) in zip(rows, cols):
                if row in used_rows or col in used_cols:
                    continue

                distance = D[row, col]
                iou = iou_matrix[row, col]

                if distance > self.max_distance and iou < 0.1:
                    continue

                object_id = object_ids[row]
                self.objects[object_id] = input_centroids[col]
                self.object_boxes[object_id] = input_boxes[col]
                self.object_trajectories[object_id].append(input_centroids[col])
                
                if frame is not None:
                    obj_class, class_score = self.classifier.classify(frame, input_boxes[col])
                    if obj_class != 'unknown' and class_score > self.object_classes[object_id]['score']:
                        self.object_classes[object_id] = {
                            'class': obj_class,
                            'score': class_score
                        }
                
                self.disappeared[object_id] = 0
                self.object_timelines[object_id].append({
                    'frame': frame_num,
                    'timestamp': timestamp,
                    'centroid': (input_centroids[col][0], input_centroids[col][1]),
                    'box': input_boxes[col]
                })

                used_rows.add(row)
                used_cols.add(col)

            unused_rows = set(range(D.shape[0])).difference(used_rows)
            unused_cols = set(range(D.shape[1])).difference(used_cols)

            for row in unused_rows:
                object_id = object_ids[row]
                self.disappeared[object_id] += 1
                if self.disappeared[object_id] > self.max_disappeared:
                    self.deregister(object_id)

            for col in unused_cols:
                self.register(input_centroids[col], input_boxes[col], frame)
                self.object_timelines[self.next_object_id - 1].append({
                    'frame': frame_num,
                    'timestamp': timestamp,
                    'centroid': (input_centroids[col][0], input_centroids[col][1]),
                    'box': input_boxes[col]
                })

        return self.objects

    def _calculate_iou(self, box1, box2):
        x1, y1, w1, h1 = box1
        x2, y2, w2, h2 = box2
        
        box1_xyxy = (x1, y1, x1 + w1, y1 + h1)
        box2_xyxy = (x2, y2, x2 + w2, y2 + h2)
        
        inter_x_min = max(box1_xyxy[0], box2_xyxy[0])
        inter_y_min = max(box1_xyxy[1], box2_xyxy[1])
        inter_x_max = min(box1_xyxy[2], box2_xyxy[2])
        inter_y_max = min(box1_xyxy[3], box2_xyxy[3])
        
        if inter_x_max <= inter_x_min or inter_y_max <= inter_y_min:
            return 0
        
        inter_area = (inter_x_max - inter_x_min) * (inter_y_max - inter_y_min)
        area1 = w1 * h1
        area2 = w2 * h2
        union_area = area1 + area2 - inter_area
        
        return inter_area / union_area if union_area > 0 else 0

    def draw_trajectories(self, frame, max_points=50):
        colors = {
            'person': (0, 255, 0),
            'car': (255, 0, 0),
            'unknown': (128, 128, 128)
        }
        
        for obj_id, trajectory in self.object_trajectories.items():
            if len(trajectory) < 2:
                continue
            
            obj_class = self.object_classes.get(obj_id, {}).get('class', 'unknown')
            color = colors.get(obj_class, (128, 128, 128))
            
            points = trajectory[-max_points:]
            for i in range(1, len(points)):
                pt1 = tuple(map(int, points[i-1]))
                pt2 = tuple(map(int, points[i]))
                cv2.line(frame, pt1, pt2, color, 2)
        
        return frame

    def draw_detections(self, frame):
        colors = {
            'person': (0, 255, 0),
            'car': (255, 0, 0),
            'unknown': (128, 128, 128)
        }
        
        class_labels = {
            'person': '人',
            'car': '车',
            'unknown': '未知'
        }
        
        for obj_id, centroid in self.objects.items():
            if obj_id not in self.object_boxes:
                continue
                
            box = self.object_boxes[obj_id]
            obj_class = self.object_classes.get(obj_id, {}).get('class', 'unknown')
            color = colors.get(obj_class, (128, 128, 128))
            label = class_labels.get(obj_class, '未知')
            
            x, y, w, h = box
            cx, cy = centroid
            
            cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
            
            text = f"ID:{obj_id} {label}"
            (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)
            cv2.rectangle(frame, (x, y - th - 10), (x + tw, y), color, -1)
            cv2.putText(frame, text, (x, y - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
            
            cv2.circle(frame, (int(cx), int(cy)), 5, color, -1)
        
        return frame


def analyze_video(video_path, progress_callback=None, export_keyframes=False, keyframes_dir=None):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise Exception(f"Cannot open video file: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    detector = MotionDetector(min_area=800)
    tracker = TargetTracker(max_disappeared=30, max_distance=150)

    motion_intervals = []
    active_objects_per_frame = []
    keyframes = []
    frame_num = 0
    current_interval_start = None
    min_target_frames = 15
    last_keyframe_frame = -30

    if export_keyframes and keyframes_dir:
        os.makedirs(keyframes_dir, exist_ok=True)

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        timestamp = frame_num / fps

        boxes, _ = detector.process_frame(frame)
        objects = tracker.update(boxes, frame_num, timestamp, frame)

        active_count = len(objects)
        active_objects_per_frame.append({
            'frame': frame_num,
            'timestamp': timestamp,
            'active_count': active_count,
            'object_ids': list(objects.keys())
        })

        if active_count >= 2:
            if current_interval_start is None:
                current_interval_start = timestamp
            
            if export_keyframes and frame_num - last_keyframe_frame >= 30:
                frame_with_detections = tracker.draw_detections(frame.copy())
                frame_with_detections = tracker.draw_trajectories(frame_with_detections)
                
                keyframe_path = None
                if keyframes_dir:
                    keyframe_path = os.path.join(keyframes_dir, f"keyframe_{frame_num:06d}.jpg")
                    cv2.imwrite(keyframe_path, frame_with_detections)
                
                _, buffer = cv2.imencode('.jpg', frame_with_detections, [cv2.IMWRITE_JPEG_QUALITY, 80])
                keyframes.append({
                    'frame': frame_num,
                    'timestamp': timestamp,
                    'object_count': active_count,
                    'image_base64': base64.b64encode(buffer).decode('utf-8'),
                    'saved_path': keyframe_path
                })
                last_keyframe_frame = frame_num
        else:
            if current_interval_start is not None:
                duration = timestamp - current_interval_start
                if duration >= 0.5:
                    motion_intervals.append({
                        'start': current_interval_start,
                        'end': timestamp,
                        'duration': duration
                    })
                current_interval_start = None

        frame_num += 1
        if progress_callback and frame_num % 10 == 0:
            progress = (frame_num / total_frames) * 100
            progress_callback(progress)

    if current_interval_start is not None:
        duration = ((frame_num - 1) / fps) - current_interval_start
        if duration >= 0.5:
            motion_intervals.append({
                'start': current_interval_start,
                'end': (frame_num - 1) / fps,
                'duration': duration
            })

    cap.release()

    object_timelines = {}
    for obj_id, timeline in tracker.object_timelines.items():
        if len(timeline) >= min_target_frames:
            obj_class = tracker.object_classes.get(obj_id, {}).get('class', 'unknown')
            class_score = tracker.object_classes.get(obj_id, {}).get('score', 0)
            trajectory = tracker.object_trajectories.get(obj_id, [])
            
            object_timelines[str(obj_id)] = {
                'first_seen': timeline[0]['timestamp'],
                'last_seen': timeline[-1]['timestamp'],
                'total_frames': len(timeline),
                'class': obj_class,
                'class_score': class_score,
                'trajectory': [(int(p[0]), int(p[1])) for p in trajectory[-100:]]
            }

    return {
        'video_info': {
            'fps': fps,
            'total_frames': total_frames,
            'width': width,
            'height': height,
            'duration': total_frames / fps if fps > 0 else 0
        },
        'motion_intervals': motion_intervals,
        'object_timelines': object_timelines,
        'active_objects_per_frame': active_objects_per_frame,
        'keyframes': keyframes
    }


def save_analysis_result(result, output_path):
    with open(output_path, 'w') as f:
        json.dump(result, f, indent=2)


def load_analysis_result(input_path):
    with open(input_path, 'r') as f:
        return json.load(f)


def export_keyframes(analysis_result, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    
    keyframe_paths = []
    for i, keyframe in enumerate(analysis_result.get('keyframes', [])):
        if 'image_base64' in keyframe:
            image_data = base64.b64decode(keyframe['image_base64'])
            output_path = os.path.join(output_dir, f"keyframe_{i:04d}.jpg")
            with open(output_path, 'wb') as f:
                f.write(image_data)
            keyframe_paths.append(output_path)
    
    return keyframe_paths
