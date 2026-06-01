from dataclasses import dataclass, field, asdict
from typing import Optional, Dict, List, Tuple, Deque
from collections import deque
import time
import uuid
from datetime import datetime, timezone


def to_utc_timestamp(ts: float) -> float:
    """Convert timestamp to UTC timezone."""
    dt = datetime.fromtimestamp(ts, tz=timezone.utc)
    return dt.timestamp()


@dataclass
class DataRecord:
    id: int
    data: str
    timestamp: float

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "data": self.data,
            "timestamp": self.timestamp
        }


@dataclass
class WALEvent:
    id: str
    type: str
    record_id: int
    data: str
    timestamp: float
    source: str = "publisher"

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "type": self.type,
            "record_id": self.record_id,
            "data": self.data,
            "timestamp": self.timestamp,
            "source": self.source
        }


@dataclass
class ConflictLog:
    id: str
    timestamp: float
    record_id: int
    incoming_value: str
    incoming_ts: float
    existing_value: str
    existing_ts: float
    resolved_to: str
    reason: str

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "record_id": self.record_id,
            "incoming_value": self.incoming_value,
            "incoming_ts": self.incoming_ts,
            "existing_value": self.existing_value,
            "existing_ts": self.existing_ts,
            "resolved_to": self.resolved_to,
            "reason": self.reason
        }


@dataclass
class AuditLog:
    id: str
    timestamp: float
    record_id: int
    operation: str
    before_value: Optional[str]
    before_ts: Optional[float]
    after_value: str
    after_ts: float
    conflict_resolved: bool
    conflict_resolution: Optional[str]

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "record_id": self.record_id,
            "operation": self.operation,
            "before_value": self.before_value,
            "before_ts": self.before_ts,
            "after_value": self.after_value,
            "after_ts": self.after_ts,
            "conflict_resolved": self.conflict_resolved,
            "conflict_resolution": self.conflict_resolution
        }


class ConflictResolver:
    def resolve(self, incoming: DataRecord, existing: DataRecord) -> Tuple[DataRecord, str]:
        incoming_utc = to_utc_timestamp(incoming.timestamp)
        existing_utc = to_utc_timestamp(existing.timestamp)

        if incoming_utc > existing_utc:
            return incoming, f"保留传入记录：UTC时间戳更新 ({incoming_utc:.6f} > {existing_utc:.6f})"
        return existing, f"保留本地记录：UTC时间戳更新或相等 ({existing_utc:.6f} >= {incoming_utc:.6f})"
