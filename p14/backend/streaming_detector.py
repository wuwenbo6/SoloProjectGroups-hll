import asyncio
import numpy as np
from obspy import Stream, Trace, UTCDateTime
from typing import List, Dict, Callable, Optional, Deque
from collections import deque
import time
from matched_filter import MatchedFilterDetector


class StreamingDetector:
    def __init__(
        self,
        detector: MatchedFilterDetector,
        template_stream: Stream,
        window_size: float = 60.0,
        overlap: float = 30.0,
        callback: Optional[Callable] = None,
    ):
        self.detector = detector
        self.template_stream = template_stream
        self.window_size = window_size
        self.overlap = overlap
        self.callback = callback

        self.buffer: Dict[str, Deque[float]] = {}
        self.buffer_start_time: Dict[str, Optional[UTCDateTime]] = {}
        self.sampling_rates: Dict[str, float] = {}

        self.detections: List[Dict] = []
        self.total_data_received = 0
        self.windows_processed = 0
        self.is_running = False

    def _initialize_buffer(self, trace: Trace):
        station_key = f"{trace.stats.station}_{trace.stats.channel}"
        if station_key not in self.buffer:
            self.buffer[station_key] = deque()
            self.buffer_start_time[station_key] = None
            self.sampling_rates[station_key] = trace.stats.sampling_rate

    def add_trace_data(
        self,
        data: np.ndarray,
        station: str,
        channel: str,
        sampling_rate: float,
        start_time: UTCDateTime,
    ) -> List[Dict]:
        station_key = f"{station}_{channel}"

        if station_key not in self.buffer:
            self.buffer[station_key] = deque()
            self.buffer_start_time[station_key] = start_time
            self.sampling_rates[station_key] = sampling_rate

        self.buffer[station_key].extend(data.tolist())
        self.total_data_received += len(data)

        return self._process_buffers()

    def add_stream(self, stream: Stream) -> List[Dict]:
        all_detections = []
        for trace in stream:
            dets = self.add_trace_data(
                trace.data,
                trace.stats.station,
                trace.stats.channel,
                trace.stats.sampling_rate,
                trace.stats.starttime,
            )
            all_detections.extend(dets)
        return all_detections

    def _process_buffers(self) -> List[Dict]:
        detections = []

        for station_key in list(self.buffer.keys()):
            sampling_rate = self.sampling_rates[station_key]
            window_samples = int(self.window_size * sampling_rate)
            step_samples = int((self.window_size - self.overlap) * sampling_rate)

            while len(self.buffer[station_key]) >= window_samples:
                window_data = np.array(list(self.buffer[station_key])[:window_samples])

                station, channel = station_key.split("_", 1)
                st_continuous = self._create_stream(
                    window_data, station, channel, sampling_rate,
                    self.buffer_start_time[station_key]
                )

                window_detections = self.detector.detect_stream(
                    self.template_stream, st_continuous
                )

                for det in window_detections:
                    det["window_number"] = self.windows_processed
                    det["streaming"] = True

                    if det not in self.detections:
                        detections.append(det)
                        self.detections.append(det)

                        if self.callback:
                            self.callback(det)

                for _ in range(min(step_samples, len(self.buffer[station_key]))):
                    self.buffer[station_key].popleft()

                if self.buffer_start_time[station_key]:
                    self.buffer_start_time[station_key] += step_samples / sampling_rate

                self.windows_processed += 1

        return detections

    def _create_stream(
        self,
        data: np.ndarray,
        station: str,
        channel: str,
        sampling_rate: float,
        start_time: UTCDateTime,
    ) -> Stream:
        trace = Trace(data=data.copy())
        trace.stats.station = station
        trace.stats.channel = channel
        trace.stats.sampling_rate = sampling_rate
        trace.stats.starttime = start_time
        return Stream(traces=[trace])

    def get_current_buffer_size(self) -> Dict[str, int]:
        return {key: len(val) for key, val in self.buffer.items()}

    def get_statistics(self) -> Dict:
        return {
            "total_data_samples": self.total_data_received,
            "windows_processed": self.windows_processed,
            "detections_count": len(self.detections),
            "buffer_sizes": self.get_current_buffer_size(),
        }

    def clear_buffer(self):
        self.buffer.clear()
        self.buffer_start_time.clear()
        self.sampling_rates.clear()

    def reset(self):
        self.clear_buffer()
        self.detections.clear()
        self.total_data_received = 0
        self.windows_processed = 0


class AsyncStreamingDetector:
    def __init__(
        self,
        detector: MatchedFilterDetector,
        template_stream: Stream,
        window_size: float = 60.0,
        overlap: float = 30.0,
        callback: Optional[Callable] = None,
        queue_maxsize: int = 100,
    ):
        self.sync_detector = StreamingDetector(detector, template_stream, window_size, overlap, callback)
        self.data_queue: asyncio.Queue = asyncio.Queue(maxsize=queue_maxsize)
        self.is_running = False
        self.process_task: Optional[asyncio.Task] = None

    async def enqueue_stream(self, stream: Stream):
        await self.data_queue.put(stream)

    async def enqueue_trace(
        self,
        data: np.ndarray,
        station: str,
        channel: str,
        sampling_rate: float,
        start_time: UTCDateTime,
    ):
        await self.data_queue.put(
            (data, station, channel, sampling_rate, start_time)
        )

    async def process_loop(self):
        self.is_running = True
        while self.is_running:
            try:
                item = await asyncio.wait_for(self.data_queue.get(), timeout=0.1)

                if isinstance(item, Stream):
                    self.sync_detector.add_stream(item)
                elif isinstance(item, tuple) and len(item) == 5:
                    data, station, channel, sampling_rate, start_time = item
                    self.sync_detector.add_trace_data(
                        data, station, channel, sampling_rate, start_time
                    )

            except asyncio.TimeoutError:
                continue
            except Exception as e:
                print(f"处理错误: {e}")

    def start(self):
        self.process_task = asyncio.create_task(self.process_loop())

    async def stop(self):
        self.is_running = False
        if self.process_task:
            await self.process_task

    def get_detections(self) -> List[Dict]:
        return self.sync_detector.detections

    def get_statistics(self) -> Dict:
        return self.sync_detector.get_statistics()


class SimulatedRealTimeStreamer:
    def __init__(
        self,
        continuous_stream: Stream,
        streaming_detector: StreamingDetector,
        speed_factor: float = 1.0,
    ):
        self.continuous_stream = continuous_stream
        self.streaming_detector = streaming_detector
        self.speed_factor = speed_factor
        self.is_playing = False
        self.current_position = 0

    def play(self, chunk_size_seconds: float = 5.0) -> List[Dict]:
        self.is_playing = True
        all_detections = []

        for trace in self.continuous_stream:
            sampling_rate = trace.stats.sampling_rate
            chunk_size = int(chunk_size_seconds * sampling_rate)
            n_chunks = int(np.ceil(len(trace.data) / chunk_size))

            for i in range(n_chunks):
                if not self.is_playing:
                    break

                start = i * chunk_size
                end = min((i + 1) * chunk_size, len(trace.data))
                chunk_data = trace.data[start:end]
                chunk_start_time = trace.stats.starttime + start / sampling_rate

                detections = self.streaming_detector.add_trace_data(
                    chunk_data,
                    trace.stats.station,
                    trace.stats.channel,
                    sampling_rate,
                    chunk_start_time,
                )
                all_detections.extend(detections)

                time.sleep(chunk_size_seconds / self.speed_factor)

        return all_detections

    async def play_async(
        self,
        chunk_size_seconds: float = 5.0,
    ) -> List[Dict]:
        self.is_playing = True
        all_detections = []

        for trace in self.continuous_stream:
            sampling_rate = trace.stats.sampling_rate
            chunk_size = int(chunk_size_seconds * sampling_rate)
            n_chunks = int(np.ceil(len(trace.data) / chunk_size))

            for i in range(n_chunks):
                if not self.is_playing:
                    break

                start = i * chunk_size
                end = min((i + 1) * chunk_size, len(trace.data))
                chunk_data = trace.data[start:end]
                chunk_start_time = trace.stats.starttime + start / sampling_rate

                detections = self.streaming_detector.add_trace_data(
                    chunk_data,
                    trace.stats.station,
                    trace.stats.channel,
                    sampling_rate,
                    chunk_start_time,
                )
                all_detections.extend(detections)

                await asyncio.sleep(chunk_size_seconds / self.speed_factor)

        return all_detections

    def stop(self):
        self.is_playing = False
