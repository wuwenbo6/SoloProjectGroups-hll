import struct
import time
from dataclasses import dataclass, field
from typing import Optional, Dict, List, Set, Tuple, Any
from collections import defaultdict

MESSAGE_TYPES = {
    0: "IQ Data",
    1: "Bit Sequence",
    2: "Real-time Control Data",
    3: "Generic Data Transfer",
    4: "Remote Memory Access",
    5: "One-way Delay Measurement",
    6: "Remote Reset",
    7: "Event Indication"
}

SEQ_MOD = 65536
DEFAULT_WINDOW_SIZE = 64
RTC_TIMESTAMP_SIZE = 4
RTC_TIME_OFFSET_SIZE = 4
RTC_HEADER_SIZE = 4
IQ_SAMPLE_HEADER = 4


@dataclass
class IQSample:
    i: int
    q: int
    
    def to_dict(self) -> Dict[str, int]:
        return {"i": self.i, "q": self.q}


@dataclass
class EcpriFrame:
    protocol_revision: int
    c_bit: int
    message_type: int
    message_type_name: str
    payload_size: int
    sequence_id: Optional[int]
    stream_id: Optional[int]
    payload: bytes
    timestamp: float
    latency_ms: Optional[float] = None
    rtc_timestamp: Optional[int] = None
    rtc_time_offset: Optional[int] = None
    seq_status: Optional[str] = None
    iq_samples: Optional[List[IQSample]] = None


@dataclass
class SlidingWindow:
    stream_id: int
    window_size: int = DEFAULT_WINDOW_SIZE
    expected_seq: int = 0
    initialized: bool = False
    received_seqs: Set[int] = field(default_factory=set)
    buffer: Dict[int, EcpriFrame] = field(default_factory=dict)
    gap_count: int = 0
    duplicate_count: int = 0
    reorder_count: int = 0
    total_received: int = 0

    def _seq_distance(self, a: int, b: int) -> int:
        diff = (b - a) % SEQ_MOD
        if diff > SEQ_MOD // 2:
            diff -= SEQ_MOD
        return diff

    def _seq_lt(self, a: int, b: int) -> bool:
        return self._seq_distance(a, b) > 0

    def _seq_within_window(self, seq: int) -> bool:
        dist = self._seq_distance(self.expected_seq, seq)
        return 0 <= dist < self.window_size

    def update(self, frame: EcpriFrame) -> str:
        seq = frame.sequence_id
        if seq is None:
            return "no_seq"

        self.total_received += 1

        if not self.initialized:
            self.expected_seq = (seq + 1) % SEQ_MOD
            self.initialized = True
            self.received_seqs.add(seq)
            self.buffer[seq] = frame
            return "first"

        if seq in self.received_seqs:
            self.duplicate_count += 1
            return "duplicate"

        dist = self._seq_distance(self.expected_seq, seq)

        if dist == 0:
            has_later_buffered = any(
                self._seq_distance(self.expected_seq, s) > 0
                for s in self.buffer.keys() if s != seq
            )
            if has_later_buffered:
                status = "reorder"
                self.reorder_count += 1
            else:
                status = "in_order"
        elif 0 < dist < self.window_size:
            status = "gap"
            self.gap_count += 1
        elif -self.window_size < dist < 0:
            status = "reorder"
            self.reorder_count += 1
        else:
            status = "out_of_window"

        if self._seq_within_window(seq):
            self.received_seqs.add(seq)
            self.buffer[seq] = frame

        self._advance_window()

        return status

    def _advance_window(self):
        while self.expected_seq in self.received_seqs:
            self.expected_seq = (self.expected_seq + 1) % SEQ_MOD

    def get_ordered_frames(self) -> List[EcpriFrame]:
        if not self.buffer:
            return []

        min_seq = min(self.buffer.keys())
        result = []
        seq = min_seq
        while seq in self.buffer:
            result.append(self.buffer[seq])
            seq = (seq + 1) % SEQ_MOD
        return result

    def get_stats(self) -> Dict:
        return {
            "stream_id": self.stream_id,
            "expected_seq": self.expected_seq,
            "window_size": self.window_size,
            "buffered_frames": len(self.buffer),
            "gap_count": self.gap_count,
            "duplicate_count": self.duplicate_count,
            "reorder_count": self.reorder_count,
            "total_received": self.total_received,
        }


class EcpriParser:
    def __init__(self, window_size: int = DEFAULT_WINDOW_SIZE):
        self.frames: List[EcpriFrame] = []
        self.stream_last_seen: Dict[int, float] = defaultdict(float)
        self.stream_latency: Dict[int, List[float]] = defaultdict(list)
        self.stream_windows: Dict[int, SlidingWindow] = {}
        self.window_size = window_size

    def _parse_rtc_fields(self, message_type: int, payload: bytes) -> Tuple[Optional[int], Optional[int]]:
        if message_type != 2:
            return None, None

        if len(payload) < RTC_HEADER_SIZE + RTC_TIMESTAMP_SIZE + RTC_TIME_OFFSET_SIZE:
            return None, None

        offset = RTC_HEADER_SIZE
        rtc_ts = struct.unpack('!I', payload[offset:offset + RTC_TIMESTAMP_SIZE])[0]
        offset += RTC_TIMESTAMP_SIZE
        rtc_time_off = struct.unpack('!i', payload[offset:offset + RTC_TIME_OFFSET_SIZE])[0]

        return rtc_ts, rtc_time_off

    def _parse_iq_samples(self, message_type: int, payload: bytes) -> Optional[List[IQSample]]:
        if message_type != 0:
            return None

        data_offset = IQ_SAMPLE_HEADER
        iq_data = payload[data_offset:]
        
        sample_size = 4
        if len(iq_data) < sample_size:
            return None
        
        num_samples = len(iq_data) // sample_size
        samples = []
        
        for i in range(num_samples):
            offset = i * sample_size
            i_val = struct.unpack('!h', iq_data[offset:offset + 2])[0]
            q_val = struct.unpack('!h', iq_data[offset + 2:offset + 4])[0]
            samples.append(IQSample(i=i_val, q=q_val))
        
        return samples if samples else None

    def get_iq_samples(self, stream_id: Optional[int] = None, limit: int = 1000) -> List[Dict[str, Any]]:
        results = []
        frames_to_process = []
        
        if stream_id is not None:
            for frame in self.frames:
                if frame.stream_id == stream_id and frame.iq_samples:
                    frames_to_process.append(frame)
        else:
            for frame in self.frames:
                if frame.iq_samples:
                    frames_to_process.append(frame)
        
        for frame in frames_to_process[-limit:]:
            for sample in frame.iq_samples:
                results.append({
                    "stream_id": frame.stream_id,
                    "sequence_id": frame.sequence_id,
                    "i": sample.i,
                    "q": sample.q,
                    "timestamp": frame.timestamp
                })
        
        return results

    def parse(self, raw_data: bytes) -> EcpriFrame:
        if len(raw_data) < 4:
            raise ValueError("Invalid eCPRI frame: too short")

        header_byte = raw_data[0]
        protocol_revision = (header_byte >> 4) & 0x0F
        c_bit = header_byte & 0x01

        message_type = raw_data[1]
        payload_size = struct.unpack('!H', raw_data[2:4])[0]

        if len(raw_data) < 4 + payload_size:
            raise ValueError("Invalid eCPRI frame: payload size mismatch")

        payload = raw_data[4:4 + payload_size]

        sequence_id = None
        stream_id = None

        if message_type in [0, 2]:
            if len(payload) >= 4:
                sequence_id = struct.unpack('!H', payload[0:2])[0]
                stream_id = struct.unpack('!H', payload[2:4])[0]

        rtc_timestamp, rtc_time_offset = self._parse_rtc_fields(message_type, payload)
        iq_samples = self._parse_iq_samples(message_type, payload)

        message_type_name = MESSAGE_TYPES.get(message_type, f"Unknown ({message_type})")

        timestamp = time.time()
        latency_ms = None

        if stream_id is not None:
            last_seen = self.stream_last_seen[stream_id]
            if last_seen > 0:
                latency_ms = (timestamp - last_seen) * 1000
                self.stream_latency[stream_id].append(latency_ms)
            self.stream_last_seen[stream_id] = timestamp

        seq_status = None
        if stream_id is not None and sequence_id is not None:
            if stream_id not in self.stream_windows:
                self.stream_windows[stream_id] = SlidingWindow(
                    stream_id=stream_id,
                    window_size=self.window_size
                )
            seq_status = self.stream_windows[stream_id].update(
                EcpriFrame(
                    protocol_revision=protocol_revision,
                    c_bit=c_bit,
                    message_type=message_type,
                    message_type_name=message_type_name,
                    payload_size=payload_size,
                    sequence_id=sequence_id,
                    stream_id=stream_id,
                    payload=payload,
                    timestamp=timestamp,
                    latency_ms=latency_ms,
                    rtc_timestamp=rtc_timestamp,
                    rtc_time_offset=rtc_time_offset,
                    iq_samples=iq_samples,
                )
            )

        frame = EcpriFrame(
            protocol_revision=protocol_revision,
            c_bit=c_bit,
            message_type=message_type,
            message_type_name=message_type_name,
            payload_size=payload_size,
            sequence_id=sequence_id,
            stream_id=stream_id,
            payload=payload,
            timestamp=timestamp,
            latency_ms=latency_ms,
            rtc_timestamp=rtc_timestamp,
            rtc_time_offset=rtc_time_offset,
            seq_status=seq_status,
            iq_samples=iq_samples,
        )

        self.frames.append(frame)
        return frame

    def get_stream_stats(self, stream_id: int) -> Dict:
        latencies = self.stream_latency.get(stream_id, [])
        win = self.stream_windows.get(stream_id)

        base = {
            "stream_id": stream_id,
            "frame_count": len(latencies) + 1 if latencies else 0,
            "avg_latency_ms": 0,
            "max_latency_ms": 0,
            "min_latency_ms": 0,
            "expected_seq": None,
            "gap_count": 0,
            "duplicate_count": 0,
            "reorder_count": 0,
            "window_buffered": 0,
        }

        if latencies:
            base["avg_latency_ms"] = sum(latencies) / len(latencies)
            base["max_latency_ms"] = max(latencies)
            base["min_latency_ms"] = min(latencies)

        if win:
            ws = win.get_stats()
            base["expected_seq"] = ws["expected_seq"]
            base["gap_count"] = ws["gap_count"]
            base["duplicate_count"] = ws["duplicate_count"]
            base["reorder_count"] = ws["reorder_count"]
            base["window_buffered"] = ws["buffered_frames"]

        return base

    def get_all_streams(self) -> List[Dict]:
        stream_ids = set()
        for frame in self.frames:
            if frame.stream_id is not None:
                stream_ids.add(frame.stream_id)

        return [self.get_stream_stats(sid) for sid in sorted(stream_ids)]

    def get_stream_ordered_frames(self, stream_id: int) -> List[Dict]:
        win = self.stream_windows.get(stream_id)
        if not win:
            return []
        ordered = win.get_ordered_frames()
        return [
            {
                "sequence_id": f.sequence_id,
                "message_type": f.message_type_name,
                "stream_id": f.stream_id,
                "latency_ms": f.latency_ms,
                "timestamp": f.timestamp,
                "rtc_timestamp": f.rtc_timestamp,
                "rtc_time_offset": f.rtc_time_offset,
                "seq_status": f.seq_status,
                "iq_sample_count": len(f.iq_samples) if f.iq_samples else 0,
            }
            for f in ordered
        ]

    def get_recent_frames(self, limit: int = 100) -> List[Dict]:
        recent = self.frames[-limit:]
        return [
            {
                "sequence_id": f.sequence_id,
                "message_type": f.message_type_name,
                "stream_id": f.stream_id,
                "latency_ms": f.latency_ms,
                "timestamp": f.timestamp,
                "payload_size": f.payload_size,
                "rtc_timestamp": f.rtc_timestamp,
                "rtc_time_offset": f.rtc_time_offset,
                "seq_status": f.seq_status,
                "iq_sample_count": len(f.iq_samples) if f.iq_samples else 0,
            }
            for f in recent
        ]
    
    def get_raw_frames(self) -> List[EcpriFrame]:
        return list(self.frames)
