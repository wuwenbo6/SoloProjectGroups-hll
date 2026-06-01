import asyncio
import logging
from typing import Dict, Optional, List
from datetime import datetime
import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession

from app.stream.rtsp_receiver import RTSPReceiver
from app.stream.tracker import EnhancedTracker
from app.stream.webrtc_stream import WebRTCStreamer
from app.stream.video_exporter import get_export_manager
from app import schemas, crud

logger = logging.getLogger(__name__)


class StreamProcess:
    def __init__(self, stream_id: int, rtsp_url: str, db_session_factory):
        self.stream_id = stream_id
        self.rtsp_url = rtsp_url
        self.db_session_factory = db_session_factory
        
        self.receiver: Optional[RTSPReceiver] = None
        self.tracker: Optional[EnhancedTracker] = None
        self.webrtc: Optional[WebRTCStreamer] = None
        
        self.is_running = False
        self._process_task: Optional[asyncio.Task] = None
        self._frame_lock = asyncio.Lock()
        self._processed_frame: Optional[np.ndarray] = None
        
        self._db_save_interval = 1.0
        self._last_db_save = datetime.now()

    async def start(self, use_gstreamer: bool = True):
        if self.is_running:
            return

        self.receiver = RTSPReceiver(self.rtsp_url, self.stream_id)
        self.receiver.frame_callback = self._on_frame_received
        
        self.tracker = EnhancedTracker(self.stream_id, tracker_type="CSRT")
        self.webrtc = WebRTCStreamer(
            self.stream_id, 
            self._get_processed_frame,
            stun_server="stun:stun.l.google.com:19302"
        )
        
        await self.receiver.start(use_gstreamer=use_gstreamer)
        
        self.is_running = True
        logger.info(f"Stream process started: {self.stream_id}")

    async def _on_frame_received(self, stream_id: int, frame: np.ndarray, timestamp: datetime):
        export_manager = get_export_manager()
        if export_manager:
            export_manager.add_frame(stream_id, frame, timestamp)
        
        if self.tracker and self.tracker.has_trackers():
            boxes = self.tracker.update(frame)
            frame = self.tracker.draw_boxes(frame, draw_trajectory=True)
            
            await self._save_tracking_records(boxes, timestamp)
        
        async with self._frame_lock:
            self._processed_frame = frame.copy()

    async def _get_processed_frame(self, stream_id: int) -> Optional[np.ndarray]:
        async with self._frame_lock:
            if self._processed_frame is not None:
                return self._processed_frame.copy()
            return None

    async def _save_tracking_records(self, boxes: List[dict], timestamp: datetime):
        if not boxes:
            return
        
        elapsed = (timestamp - self._last_db_save).total_seconds()
        if elapsed < self._db_save_interval:
            return
        
        self._last_db_save = timestamp
        
        try:
            async with self.db_session_factory() as db:
                for box in boxes:
                    record = schemas.TrackingRecordCreate(
                        stream_id=self.stream_id,
                        object_id=box["object_id"],
                        label=box["label"],
                        x=float(box["x"]),
                        y=float(box["y"]),
                        width=float(box["width"]),
                        height=float(box["height"]),
                        confidence=box["confidence"],
                        frame_timestamp=timestamp
                    )
                    await crud.create_tracking_record(db, record)
        except Exception as e:
            logger.error(f"Error saving tracking records: {e}")

    def init_tracking(self, x: int, y: int, width: int, height: int, label: str = "target") -> Optional[str]:
        if not self.receiver or not self.tracker:
            return None
        
        frame = self.receiver.get_last_frame()
        if frame is None:
            return None
        
        bbox = (x, y, width, height)
        return self.tracker.init_tracker(frame, bbox, label)

    def stop_tracking(self, object_id: str) -> bool:
        if self.tracker:
            return self.tracker.remove_tracker(object_id)
        return False

    def get_tracking_boxes(self) -> List[dict]:
        if self.tracker:
            return self.tracker.get_tracking_boxes()
        return []

    async def create_webrtc_offer(self, offer):
        if self.webrtc:
            return await self.webrtc.create_peer_connection(offer)
        return None

    async def stop(self):
        self.is_running = False
        
        if self.webrtc:
            await self.webrtc.close_all()
            self.webrtc = None
        
        if self.receiver:
            await self.receiver.stop()
            self.receiver = None
        
        if self.tracker:
            self.tracker.clear_all()
            self.tracker = None
        
        self._processed_frame = None
        logger.info(f"Stream process stopped: {self.stream_id}")

    def get_status(self) -> dict:
        return {
            "stream_id": self.stream_id,
            "is_running": self.is_running,
            "fps": self.receiver.get_fps() if self.receiver else 0,
            "latency_ms": self.receiver.get_latency_ms() if self.receiver else 0,
            "tracking_count": len(self.tracker.trackers) if self.tracker else 0,
            "webrtc_connections": self.webrtc.get_connection_count() if self.webrtc else 0,
            "tracker_type": self.tracker.tracker_type if self.tracker else "N/A"
        }


class StreamManager:
    def __init__(self, db_session_factory, max_streams: int = 10):
        self.streams: Dict[int, StreamProcess] = {}
        self.db_session_factory = db_session_factory
        self.max_streams = max_streams
        self._lock = asyncio.Lock()

    async def add_stream(self, stream_id: int, rtsp_url: str, use_gstreamer: bool = True) -> bool:
        async with self._lock:
            if len(self.streams) >= self.max_streams:
                logger.warning(f"Max streams limit reached: {self.max_streams}")
                return False
            
            if stream_id in self.streams:
                return True
            
            stream = StreamProcess(stream_id, rtsp_url, self.db_session_factory)
            try:
                await stream.start(use_gstreamer=use_gstreamer)
                self.streams[stream_id] = stream
                return True
            except Exception as e:
                logger.error(f"Failed to start stream {stream_id}: {e}")
                return False

    async def remove_stream(self, stream_id: int) -> bool:
        async with self._lock:
            if stream_id not in self.streams:
                return False
            
            stream = self.streams.pop(stream_id)
            await stream.stop()
            return True

    def get_stream(self, stream_id: int) -> Optional[StreamProcess]:
        return self.streams.get(stream_id)

    def has_stream(self, stream_id: int) -> bool:
        return stream_id in self.streams

    def get_all_status(self) -> List[dict]:
        return [stream.get_status() for stream in self.streams.values()]

    async def shutdown_all(self):
        for stream_id in list(self.streams.keys()):
            await self.remove_stream(stream_id)
        logger.info("All streams shutdown complete")


stream_manager: Optional[StreamManager] = None


def init_stream_manager(db_session_factory):
    global stream_manager
    stream_manager = StreamManager(db_session_factory)
    return stream_manager


def get_stream_manager() -> Optional[StreamManager]:
    return stream_manager
