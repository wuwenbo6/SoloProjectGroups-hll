import cv2
import asyncio
import logging
import queue
import threading
from typing import Optional, Callable
import numpy as np
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class RTSPReceiver:
    def __init__(self, rtsp_url: str, stream_id: int, max_queue_size: int = 2):
        self.rtsp_url = rtsp_url
        self.stream_id = stream_id
        self.max_queue_size = max_queue_size
        
        self.cap: Optional[cv2.VideoCapture] = None
        self.is_running = False
        self.frame_callback: Optional[Callable] = None
        
        self._frame_queue: queue.Queue = queue.Queue(maxsize=max_queue_size)
        self._read_thread: Optional[threading.Thread] = None
        self._process_task: Optional[asyncio.Task] = None
        
        self.last_frame: Optional[np.ndarray] = None
        self.last_frame_timestamp: Optional[datetime] = None
        
        self.frame_count = 0
        self.fps = 0
        self._last_fps_time = datetime.now()
        
        self._max_latency = timedelta(milliseconds=200)
        self._dropped_frames = 0

    async def start(self, use_gstreamer: bool = True):
        if self.is_running:
            return

        self.is_running = True
        
        if use_gstreamer:
            pipeline = (
                f"rtspsrc location={self.rtsp_url} latency=50 ! "
                "queue max-size-buffers=1 max-size-time=0 max-size-bytes=0 ! "
                "rtph264depay ! "
                "h264parse ! "
                "avdec_h264 lowres=0 ! "
                "videoconvert ! "
                "video/x-raw,format=BGR ! "
                "appsink drop=1 sync=0 max-buffers=1"
            )
            self.cap = cv2.VideoCapture(pipeline, cv2.CAP_GSTREAMER)
        else:
            self.cap = cv2.VideoCapture(self.rtsp_url)
            self.cap.set(cv2.CAP_PROP_FPS, 30)
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            
            try:
                self.cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
                self.cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 1000)
            except:
                pass

        if not self.cap.isOpened():
            logger.error(f"Failed to open RTSP stream: {self.rtsp_url}")
            self.is_running = False
            raise RuntimeError(f"Failed to open RTSP stream: {self.rtsp_url}")

        logger.info(f"RTSP stream started: {self.rtsp_url}")
        
        self._read_thread = threading.Thread(target=self._read_frames_thread, daemon=True)
        self._read_thread.start()
        
        self._process_task = asyncio.create_task(self._process_frames())

    def _read_frames_thread(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        while self.is_running and self.cap and self.cap.isOpened():
            try:
                ret, frame = self.cap.read()
                if not ret or frame is None:
                    continue
                
                timestamp = datetime.now()
                
                try:
                    if self._frame_queue.full():
                        try:
                            self._frame_queue.get_nowait()
                            self._dropped_frames += 1
                        except queue.Empty:
                            pass
                    
                    self._frame_queue.put_nowait((frame, timestamp))
                except queue.Full:
                    self._dropped_frames += 1
                    continue
                    
            except Exception as e:
                logger.error(f"Error reading frame from stream {self.stream_id}: {e}")
                continue
        
        logger.info(f"RTSP read thread stopped for stream {self.stream_id}")

    async def _process_frames(self):
        while self.is_running:
            try:
                try:
                    frame, timestamp = self._frame_queue.get_nowait()
                except queue.Empty:
                    await asyncio.sleep(0.001)
                    continue
                
                now = datetime.now()
                latency = now - timestamp
                
                if latency > self._max_latency:
                    self._dropped_frames += 1
                    continue
                
                self.last_frame = frame
                self.last_frame_timestamp = timestamp
                self.frame_count += 1

                if (now - self._last_fps_time).total_seconds() >= 1:
                    self.fps = self.frame_count
                    self.frame_count = 0
                    self._last_fps_time = now
                    
                    if self._dropped_frames > 0:
                        logger.debug(f"Stream {self.stream_id}: dropped {self._dropped_frames} frames in last second")
                        self._dropped_frames = 0

                if self.frame_callback:
                    await self.frame_callback(self.stream_id, frame, timestamp)

            except Exception as e:
                logger.error(f"Error processing frame from stream {self.stream_id}: {e}")
                await asyncio.sleep(0.01)

        logger.info(f"RTSP frame processor stopped: {self.stream_id}")

    async def stop(self):
        self.is_running = False
        
        if self._process_task:
            self._process_task.cancel()
            try:
                await self._process_task
            except asyncio.CancelledError:
                pass
            self._process_task = None
        
        if self._read_thread:
            self._read_thread.join(timeout=2.0)
            self._read_thread = None

        while not self._frame_queue.empty():
            try:
                self._frame_queue.get_nowait()
            except queue.Empty:
                break

        if self.cap:
            self.cap.release()
            self.cap = None
        
        self.last_frame = None
        self.last_frame_timestamp = None
        
        logger.info(f"RTSP stream stopped: {self.stream_id}")

    def get_last_frame(self) -> Optional[np.ndarray]:
        return self.last_frame

    def get_last_frame_with_timestamp(self) -> tuple:
        return (self.last_frame, self.last_frame_timestamp)

    def get_fps(self) -> int:
        return self.fps

    def get_latency_ms(self) -> float:
        if self.last_frame_timestamp:
            return (datetime.now() - self.last_frame_timestamp).total_seconds() * 1000
        return 0.0
