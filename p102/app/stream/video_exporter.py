import cv2
import logging
import asyncio
import os
import queue
import threading
from typing import Optional, Dict, List, Tuple
from datetime import datetime, timedelta
from collections import deque
import numpy as np

logger = logging.getLogger(__name__)


class FrameBuffer:
    def __init__(self, max_seconds: int = 60, fps: int = 30):
        self.max_frames = max_seconds * fps
        self.buffer: deque = deque(maxlen=self.max_frames)
        self.fps = fps

    def add_frame(self, frame: np.ndarray, timestamp: datetime):
        self.buffer.append((frame.copy(), timestamp))

    def get_frames(self, start_time: datetime, end_time: datetime) -> List[Tuple[np.ndarray, datetime]]:
        result = []
        for frame, ts in self.buffer:
            if start_time <= ts <= end_time:
                result.append((frame, ts))
        return result

    def get_last_n_seconds(self, seconds: int) -> List[Tuple[np.ndarray, datetime]]:
        n_frames = seconds * self.fps
        return list(self.buffer)[-n_frames:]

    def clear(self):
        self.buffer.clear()

    def __len__(self):
        return len(self.buffer)


class VideoExporter:
    def __init__(self, stream_id: int, output_dir: str = "exports"):
        self.stream_id = stream_id
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
        
        self.frame_buffer = FrameBuffer(max_seconds=120, fps=30)
        self._export_tasks: Dict[str, dict] = {}
        self._lock = threading.Lock()

    def add_frame(self, frame: np.ndarray, timestamp: datetime):
        self.frame_buffer.add_frame(frame, timestamp)

    async def export_clip(
        self,
        start_time: datetime,
        end_time: datetime,
        filename: Optional[str] = None,
        codec: str = "mp4v",
        fps: int = 30,
        draw_boxes: bool = True,
        draw_trajectory: bool = True
    ) -> Dict:
        export_id = f"export_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{self.stream_id}"
        
        if filename is None:
            filename = f"{export_id}.mp4"
        
        filepath = os.path.join(self.output_dir, filename)
        
        self._export_tasks[export_id] = {
            "status": "processing",
            "progress": 0,
            "filepath": filepath,
            "start_time": start_time,
            "end_time": end_time
        }
        
        try:
            frames = self.frame_buffer.get_frames(start_time, end_time)
            
            if not frames:
                logger.warning(f"No frames found for export: {start_time} to {end_time}")
                self._export_tasks[export_id]["status"] = "failed"
                self._export_tasks[export_id]["error"] = "No frames found"
                return {"export_id": export_id, "status": "failed", "error": "No frames found"}
            
            height, width = frames[0][0].shape[:2]
            
            fourcc = cv2.VideoWriter_fourcc(*codec)
            writer = cv2.VideoWriter(filepath, fourcc, fps, (width, height))
            
            total_frames = len(frames)
            for i, (frame, ts) in enumerate(frames):
                writer.write(frame)
                self._export_tasks[export_id]["progress"] = int((i + 1) / total_frames * 100)
                await asyncio.sleep(0.001)
            
            writer.release()
            
            self._export_tasks[export_id]["status"] = "completed"
            self._export_tasks[export_id]["progress"] = 100
            self._export_tasks[export_id]["filename"] = filename
            self._export_tasks[export_id]["file_size"] = os.path.getsize(filepath)
            self._export_tasks[export_id]["frame_count"] = total_frames
            
            logger.info(f"Export completed: {filepath} ({total_frames} frames)")
            return {
                "export_id": export_id,
                "status": "completed",
                "filepath": filepath,
                "filename": filename,
                "frame_count": total_frames,
                "file_size": os.path.getsize(filepath)
            }
            
        except Exception as e:
            logger.error(f"Export failed: {e}")
            self._export_tasks[export_id]["status"] = "failed"
            self._export_tasks[export_id]["error"] = str(e)
            return {"export_id": export_id, "status": "failed", "error": str(e)}

    async def export_last_n_seconds(
        self,
        seconds: int,
        filename: Optional[str] = None,
        draw_boxes: bool = True
    ) -> Dict:
        end_time = datetime.now()
        start_time = end_time - timedelta(seconds=seconds)
        
        return await self.export_clip(
            start_time=start_time,
            end_time=end_time,
            filename=filename,
            draw_boxes=draw_boxes
        )

    def get_export_status(self, export_id: str) -> Optional[Dict]:
        return self._export_tasks.get(export_id)

    def list_exports(self) -> List[Dict]:
        return [
            {"export_id": eid, **data}
            for eid, data in self._export_tasks.items()
        ]

    def clear_buffer(self):
        self.frame_buffer.clear()


class ExportManager:
    def __init__(self, base_output_dir: str = "exports"):
        self.base_output_dir = base_output_dir
        self.exporters: Dict[int, VideoExporter] = {}
        self._lock = asyncio.Lock()

    def get_or_create_exporter(self, stream_id: int) -> VideoExporter:
        if stream_id not in self.exporters:
            stream_dir = os.path.join(self.base_output_dir, f"stream_{stream_id}")
            self.exporters[stream_id] = VideoExporter(stream_id, stream_dir)
        return self.exporters[stream_id]

    def add_frame(self, stream_id: int, frame: np.ndarray, timestamp: datetime):
        exporter = self.get_or_create_exporter(stream_id)
        exporter.add_frame(frame, timestamp)

    async def export_stream_clip(
        self,
        stream_id: int,
        start_time: datetime,
        end_time: datetime,
        **kwargs
    ) -> Dict:
        exporter = self.get_or_create_exporter(stream_id)
        return await exporter.export_clip(start_time, end_time, **kwargs)

    async def export_stream_last_seconds(
        self,
        stream_id: int,
        seconds: int,
        **kwargs
    ) -> Dict:
        exporter = self.get_or_create_exporter(stream_id)
        return await exporter.export_last_n_seconds(seconds, **kwargs)

    def get_export_status(self, stream_id: int, export_id: str) -> Optional[Dict]:
        if stream_id in self.exporters:
            return self.exporters[stream_id].get_export_status(export_id)
        return None

    def list_stream_exports(self, stream_id: int) -> List[Dict]:
        if stream_id in self.exporters:
            return self.exporters[stream_id].list_exports()
        return []

    def remove_exporter(self, stream_id: int):
        if stream_id in self.exporters:
            del self.exporters[stream_id]


export_manager: Optional[ExportManager] = None


def init_export_manager(base_output_dir: str = "exports"):
    global export_manager
    export_manager = ExportManager(base_output_dir)
    return export_manager


def get_export_manager() -> Optional[ExportManager]:
    return export_manager
