from typing import List, Dict
from dataclasses import dataclass
import time
import threading


@dataclass
class LatencyRecord:
    event_id: str
    record_id: int
    event_type: str
    publisher_ts: float
    applied_ts: float
    latency_ms: float

    def to_dict(self) -> Dict:
        return {
            "event_id": self.event_id,
            "record_id": self.record_id,
            "event_type": self.event_type,
            "publisher_ts": self.publisher_ts,
            "applied_ts": self.applied_ts,
            "latency_ms": round(self.latency_ms, 3)
        }


class LatencyTracker:
    def __init__(self, max_records: int = 1000):
        self._records: List[LatencyRecord] = []
        self._max_records = max_records
        self._lock = threading.Lock()

    def record(self, event_id: str, record_id: int, event_type: str, publisher_ts: float):
        applied_ts = time.time()
        latency_ms = (applied_ts - publisher_ts) * 1000

        rec = LatencyRecord(
            event_id=event_id,
            record_id=record_id,
            event_type=event_type,
            publisher_ts=publisher_ts,
            applied_ts=applied_ts,
            latency_ms=latency_ms
        )

        with self._lock:
            self._records.append(rec)
            if len(self._records) > self._max_records:
                self._records = self._records[-self._max_records:]

    def get_all(self) -> List[LatencyRecord]:
        with self._lock:
            return list(self._records)

    def get_recent(self, count: int = 100) -> List[LatencyRecord]:
        with self._lock:
            return self._records[-count:]

    def get_stats(self) -> Dict:
        with self._lock:
            if not self._records:
                return {
                    "count": 0,
                    "avg_ms": 0,
                    "min_ms": 0,
                    "max_ms": 0,
                    "p50_ms": 0,
                    "p95_ms": 0,
                    "p99_ms": 0
                }

            latencies = sorted([r.latency_ms for r in self._records])
            n = len(latencies)

            def percentile(data, p):
                idx = int(len(data) * p / 100)
                return data[min(idx, len(data) - 1)]

            return {
                "count": n,
                "avg_ms": round(sum(latencies) / n, 3),
                "min_ms": round(min(latencies), 3),
                "max_ms": round(max(latencies), 3),
                "p50_ms": round(percentile(latencies, 50), 3),
                "p95_ms": round(percentile(latencies, 95), 3),
                "p99_ms": round(percentile(latencies, 99), 3)
            }

    def get_trend(self, window_size: int = 10) -> List[Dict]:
        with self._lock:
            if not self._records:
                return []

            trend = []
            for i in range(0, len(self._records), window_size):
                window = self._records[i:i + window_size]
                if not window:
                    continue
                avg_latency = sum(r.latency_ms for r in window) / len(window)
                trend.append({
                    "window_start": window[0].applied_ts,
                    "window_end": window[-1].applied_ts,
                    "avg_ms": round(avg_latency, 3),
                    "count": len(window),
                    "event_types": list(set(r.event_type for r in window))
                })

            return trend

    def export_csv(self) -> str:
        lines = ["event_id,record_id,event_type,publisher_ts,applied_ts,latency_ms"]
        with self._lock:
            for r in self._records:
                lines.append(
                    f"{r.event_id},{r.record_id},{r.event_type},"
                    f"{r.publisher_ts:.6f},{r.applied_ts:.6f},{r.latency_ms:.3f}"
                )
        return "\n".join(lines)

    def export_json(self) -> List[Dict]:
        with self._lock:
            return [r.to_dict() for r in self._records]

    def clear(self):
        with self._lock:
            self._records = []
