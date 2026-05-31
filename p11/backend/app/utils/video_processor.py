import cv2
import numpy as np
import threading
import time
from typing import Optional, Callable, Dict, List, Tuple
from collections import deque, defaultdict
from dataclasses import dataclass, field
from datetime import datetime
import uuid


@dataclass
class VehicleTrack:
    track_id: str
    plate_number: str
    plate_color: str
    confidence: float
    bbox: Tuple[int, int, int, int]
    center: Tuple[int, int]
    speed: float = 0.0
    first_seen: datetime = field(default_factory=datetime.now)
    last_seen: datetime = field(default_factory=datetime.now)
    positions: deque = field(default_factory=lambda: deque(maxlen=10))
    timestamps: deque = field(default_factory=lambda: deque(maxlen=10))
    is_alerted: bool = False


@dataclass
class Alert:
    alert_id: str
    plate_number: str
    alert_type: str
    timestamp: datetime
    speed: float = 0.0
    confidence: float = 0.0
    screenshot_path: str = ""


class SpeedEstimator:
    def __init__(self, pixels_per_meter: float = 30.0, frame_rate: int = 30):
        self.pixels_per_meter = pixels_per_meter
        self.frame_rate = frame_rate
        self.min_displacement = 5
        self.min_samples = 3

    def calculate_speed(self, positions: deque, timestamps: deque) -> float:
        if len(positions) < self.min_samples:
            return 0.0

        total_distance = 0.0
        total_time = 0.0

        for i in range(1, len(positions)):
            dx = positions[i][0] - positions[i - 1][0]
            dy = positions[i][1] - positions[i - 1][1]
            displacement = np.sqrt(dx ** 2 + dy ** 2)

            if displacement > self.min_displacement:
                total_distance += displacement
                dt = (timestamps[i] - timestamps[i - 1])
                total_time += dt

        if total_time <= 0:
            return 0.0

        speed_mpm = (total_distance / self.pixels_per_meter) / total_time
        speed_kmh = speed_mpm * 3600 / 1000

        return min(speed_kmh, 200.0)


class VideoStreamProcessor:
    def __init__(
        self,
        rtsp_url: str,
        recognition_pipeline,
        watchlist: List[str] = None,
        speed_limit: float = 60.0,
        alert_callback: Optional[Callable] = None,
        process_every_n_frames: int = 5
    ):
        self.rtsp_url = rtsp_url
        self.pipeline = recognition_pipeline
        self.watchlist = set(watchlist or [])
        self.speed_limit = speed_limit
        self.alert_callback = alert_callback
        self.process_every_n_frames = process_every_n_frames

        self.speed_estimator = SpeedEstimator()
        self.tracks: Dict[str, VehicleTrack] = {}
        self.alerts: List[Alert] = []

        self.is_running = False
        self.thread: Optional[threading.Thread] = None
        self.frame_count = 0
        self.current_frame = None
        self.last_frame_time = time.time()

        self.max_tracks = 50
        self.track_timeout = 5.0

    def start(self):
        if self.is_running:
            return
        self.is_running = True
        self.thread = threading.Thread(target=self._process_stream, daemon=True)
        self.thread.start()

    def stop(self):
        self.is_running = False
        if self.thread:
            self.thread.join(timeout=5.0)

    def _process_stream(self):
        cap = cv2.VideoCapture(self.rtsp_url)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        if not cap.isOpened():
            print(f"Failed to open RTSP stream: {self.rtsp_url}")
            self.is_running = False
            return

        print(f"Started processing RTSP stream: {self.rtsp_url}")

        while self.is_running:
            ret, frame = cap.read()
            if not ret:
                print("Failed to read frame, reconnecting...")
                cap.release()
                time.sleep(2)
                cap = cv2.VideoCapture(self.rtsp_url)
                continue

            self.current_frame = frame.copy()
            self.frame_count += 1

            if self.frame_count % self.process_every_n_frames == 0:
                self._process_frame(frame)

            self._cleanup_old_tracks()

        cap.release()
        print(f"Stopped RTSP stream: {self.rtsp_url}")

    def _process_frame(self, frame):
        result = self.pipeline.process_image(frame, enhance=False)

        if result['success'] and result['detection']:
            bbox = result['detection']['bbox']
            plate_number = result['plate_number']
            plate_color = result['plate_color']
            confidence = result['confidence']

            center_x = (bbox[0] + bbox[2]) // 2
            center_y = (bbox[1] + bbox[3]) // 2
            center = (center_x, center_y)

            if plate_number:
                track = self._find_or_create_track(plate_number, plate_color, confidence, bbox, center)
                self._update_track(track, bbox, center, confidence)

                if track.speed > self.speed_limit and not track.is_alerted:
                    self._create_alert(track, "speeding")
                    track.is_alerted = True

                if plate_number in self.watchlist and not track.is_alerted:
                    self._create_alert(track, "watchlist")
                    track.is_alerted = True

    def _find_or_create_track(self, plate_number: str, plate_color: str,
                               confidence: float, bbox: tuple, center: tuple) -> VehicleTrack:
        for track in self.tracks.values():
            dx = center[0] - track.center[0]
            dy = center[1] - track.center[1]
            distance = np.sqrt(dx ** 2 + dy ** 2)

            if distance < 100 and track.plate_number == plate_number:
                return track

        track_id = str(uuid.uuid4())[:8]
        track = VehicleTrack(
            track_id=track_id,
            plate_number=plate_number,
            plate_color=plate_color,
            confidence=confidence,
            bbox=bbox,
            center=center
        )
        track.positions.append(center)
        track.timestamps.append(time.time())

        if len(self.tracks) >= self.max_tracks:
            oldest = min(self.tracks.values(), key=lambda t: t.last_seen)
            del self.tracks[oldest.track_id]

        self.tracks[track_id] = track
        return track

    def _update_track(self, track: VehicleTrack, bbox: tuple, center: tuple, confidence: float):
        track.bbox = bbox
        track.center = center
        track.last_seen = datetime.now()
        track.confidence = max(track.confidence, confidence)
        track.positions.append(center)
        track.timestamps.append(time.time())

        track.speed = self.speed_estimator.calculate_speed(track.positions, track.timestamps)

    def _cleanup_old_tracks(self):
        current_time = time.time()
        to_remove = []

        for track_id, track in self.tracks.items():
            if track.timestamps and (current_time - track.timestamps[-1]) > self.track_timeout:
                to_remove.append(track_id)

        for track_id in to_remove:
            del self.tracks[track_id]

    def _create_alert(self, track: VehicleTrack, alert_type: str):
        alert = Alert(
            alert_id=str(uuid.uuid4()),
            plate_number=track.plate_number,
            alert_type=alert_type,
            timestamp=datetime.now(),
            speed=track.speed,
            confidence=track.confidence
        )
        self.alerts.append(alert)

        if self.alert_callback:
            try:
                self.alert_callback(alert)
            except Exception as e:
                print(f"Alert callback failed: {e}")

        print(f"ALERT [{alert_type}]: {track.plate_number} - Speed: {track.speed:.1f} km/h")

    def get_status(self) -> dict:
        return {
            "is_running": self.is_running,
            "frame_count": self.frame_count,
            "active_tracks": len(self.tracks),
            "total_alerts": len(self.alerts),
            "rtsp_url": self.rtsp_url
        }

    def get_active_tracks(self) -> List[dict]:
        return [
            {
                "track_id": t.track_id,
                "plate_number": t.plate_number,
                "plate_color": t.plate_color,
                "confidence": t.confidence,
                "speed": t.speed,
                "bbox": t.bbox,
                "first_seen": t.first_seen.isoformat(),
                "last_seen": t.last_seen.isoformat()
            }
            for t in self.tracks.values()
        ]

    def get_recent_alerts(self, limit: int = 20) -> List[dict]:
        return [
            {
                "alert_id": a.alert_id,
                "plate_number": a.plate_number,
                "alert_type": a.alert_type,
                "timestamp": a.timestamp.isoformat(),
                "speed": a.speed,
                "confidence": a.confidence
            }
            for a in self.alerts[-limit:]
        ]


class VideoStreamManager:
    def __init__(self, pipeline):
        self.pipeline = pipeline
        self.streams: Dict[str, VideoStreamProcessor] = {}
        self.global_watchlist: set = set()
        self.global_speed_limit: float = 60.0

    def add_stream(self, stream_id: str, rtsp_url: str,
                   watchlist: List[str] = None, speed_limit: float = None) -> bool:
        if stream_id in self.streams:
            return False

        stream = VideoStreamProcessor(
            rtsp_url=rtsp_url,
            recognition_pipeline=self.pipeline,
            watchlist=watchlist or list(self.global_watchlist),
            speed_limit=speed_limit or self.global_speed_limit,
            alert_callback=self._on_alert
        )
        stream.start()
        self.streams[stream_id] = stream
        return True

    def remove_stream(self, stream_id: str) -> bool:
        if stream_id not in self.streams:
            return False

        self.streams[stream_id].stop()
        del self.streams[stream_id]
        return True

    def _on_alert(self, alert: Alert):
        print(f"Global alert: {alert.alert_type} - {alert.plate_number}")

    def update_watchlist(self, plate_numbers: List[str]):
        self.global_watchlist = set(plate_numbers)
        for stream in self.streams.values():
            stream.watchlist = self.global_watchlist

    def add_to_watchlist(self, plate_number: str):
        self.global_watchlist.add(plate_number)
        for stream in self.streams.values():
            stream.watchlist.add(plate_number)

    def remove_from_watchlist(self, plate_number: str):
        self.global_watchlist.discard(plate_number)
        for stream in self.streams.values():
            stream.watchlist.discard(plate_number)

    def get_all_status(self) -> dict:
        return {
            "stream_count": len(self.streams),
            "watchlist_count": len(self.global_watchlist),
            "speed_limit": self.global_speed_limit,
            "streams": {
                sid: s.get_status() for sid, s in self.streams.items()
            }
        }

    def stop_all(self):
        for stream in self.streams.values():
            stream.stop()
        self.streams.clear()


def get_video_manager(pipeline) -> VideoStreamManager:
    return VideoStreamManager(pipeline)
