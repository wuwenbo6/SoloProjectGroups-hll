import asyncio
import cv2
import numpy as np
import logging
import time
from typing import Optional, Callable
from datetime import datetime
from aiortc import MediaStreamTrack, RTCPeerConnection, RTCSessionDescription, RTCConfiguration, RTCIceServer
from aiortc.contrib.media import MediaRelay
import av
from fractions import Fraction

logger = logging.getLogger(__name__)
relay = MediaRelay()


class VideoTransformTrack(MediaStreamTrack):
    kind = "video"

    def __init__(self, get_frame_callback: Callable, stream_id: int, target_fps: int = 30):
        super().__init__()
        self.get_frame_callback = get_frame_callback
        self.stream_id = stream_id
        self.target_fps = target_fps
        self._frame_interval = 1.0 / target_fps
        
        self._start_time = time.time()
        self._frame_count = 0
        self._timestamp = 0
        self._time_base = Fraction(1, 90000)
        self._last_frame_time = time.time()
        
        self._actual_fps = 0
        self._fps_window = []
        
        self._skip_frames = 0
        self._max_skip_frames = 5

    async def recv(self):
        current_time = time.time()
        elapsed = current_time - self._last_frame_time
        
        if elapsed < self._frame_interval * 0.8:
            await asyncio.sleep(self._frame_interval * 0.1)
        
        self._last_frame_time = time.time()
        
        pts = self._timestamp
        self._timestamp += int(90000 / self.target_fps)
        
        frame = None
        try:
            frame = await self.get_frame_callback(self.stream_id)
        except Exception as e:
            logger.error(f"Error getting frame for WebRTC: {e}")
        
        if frame is None:
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(frame, "No Signal", (250, 240),
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        video_frame = av.VideoFrame.from_ndarray(frame_rgb, format="rgb24")
        video_frame.pts = pts
        video_frame.time_base = self._time_base
        
        self._frame_count += 1
        
        return video_frame


class WebRTCStreamer:
    def __init__(self, stream_id: int, get_frame_callback: Callable, stun_server: str = "stun:stun.l.google.com:19302"):
        self.stream_id = stream_id
        self.get_frame_callback = get_frame_callback
        self.stun_server = stun_server
        self.peer_connections: dict = {}
        self._lock = asyncio.Lock()
        
        self._target_bitrate = 2_000_000
        self._target_fps = 30

    async def create_peer_connection(self, offer: RTCSessionDescription) -> RTCSessionDescription:
        config = RTCConfiguration([
            RTCIceServer(urls=self.stun_server)
        ])
        
        pc = RTCPeerConnection(configuration=config)
        pc_id = f"pc_{self.stream_id}_{datetime.now().timestamp()}"
        
        self.peer_connections[pc_id] = pc

        @pc.on("connectionstatechange")
        async def on_connectionstatechange():
            logger.info(f"Connection state for {pc_id}: {pc.connectionState}")
            if pc.connectionState in ("failed", "closed", "disconnected"):
                await self._remove_peer(pc_id)

        @pc.on("iceconnectionstatechange")
        async def on_iceconnectionstatechange():
            logger.info(f"ICE state for {pc_id}: {pc.iceConnectionState}")
            if pc.iceConnectionState == "failed":
                await pc.close()

        @pc.on("signalingstatechange")
        async def on_signalingstatechange():
            logger.debug(f"Signaling state for {pc_id}: {pc.signalingState}")

        video_track = VideoTransformTrack(self.get_frame_callback, self.stream_id, target_fps=self._target_fps)
        pc.addTrack(relay.subscribe(video_track))

        for transceiver in pc.getTransceivers():
            if transceiver.kind == "video":
                try:
                    capabilities = transceiver.sender.getCapabilities("video")
                    if capabilities:
                        for codec in capabilities.codecs:
                            if codec.name.lower() in ("h264", "vp8"):
                                codec_parameters = {
                                    "x-google-start-bitrate": str(self._target_bitrate // 1000),
                                    "x-google-min-bitrate": str(self._target_bitrate // 2000),
                                    "x-google-max-bitrate": str(self._target_bitrate // 1000 * 2),
                                }
                                break
                except Exception as e:
                    logger.debug(f"Could not set codec parameters: {e}")

        await pc.setRemoteDescription(offer)
        answer = await pc.createAnswer()
        
        await pc.setLocalDescription(answer)

        logger.info(f"WebRTC peer connection created: {pc_id}")
        return pc.localDescription

    async def _remove_peer(self, pc_id: str):
        async with self._lock:
            if pc_id in self.peer_connections:
                pc = self.peer_connections.pop(pc_id)
                try:
                    await pc.close()
                except Exception as e:
                    logger.error(f"Error closing peer connection: {e}")
                logger.info(f"Peer connection removed: {pc_id}")

    async def close_all(self):
        for pc_id in list(self.peer_connections.keys()):
            await self._remove_peer(pc_id)
        logger.info(f"All WebRTC connections closed for stream {self.stream_id}")

    def get_connection_count(self) -> int:
        return len(self.peer_connections)

    def set_target_bitrate(self, bitrate: int):
        self._target_bitrate = max(500_000, min(bitrate, 10_000_000))

    def set_target_fps(self, fps: int):
        self._target_fps = max(15, min(fps, 60))
