from typing import Dict, Deque, Optional
from collections import deque
import time
import uuid
from .models import DataRecord, WALEvent


class Publisher:
    def __init__(self):
        self.data: Dict[int, DataRecord] = {}
        self.wal_queue: Deque[WALEvent] = deque()
        self._id_counter = 0

    def insert(self, record_id: Optional[int] = None, data: str = "") -> WALEvent:
        if record_id is None:
            self._id_counter += 1
            record_id = self._id_counter

        if record_id in self.data:
            raise ValueError(f"Record with id {record_id} already exists")

        timestamp = time.time()
        record = DataRecord(id=record_id, data=data, timestamp=timestamp)
        self.data[record_id] = record

        event = WALEvent(
            id=str(uuid.uuid4()),
            type="INSERT",
            record_id=record_id,
            data=data,
            timestamp=timestamp
        )
        self.wal_queue.append(event)
        return event

    def update(self, record_id: int, data: str) -> WALEvent:
        if record_id not in self.data:
            raise ValueError(f"Record with id {record_id} does not exist")

        timestamp = time.time()
        record = DataRecord(id=record_id, data=data, timestamp=timestamp)
        self.data[record_id] = record

        event = WALEvent(
            id=str(uuid.uuid4()),
            type="UPDATE",
            record_id=record_id,
            data=data,
            timestamp=timestamp
        )
        self.wal_queue.append(event)
        return event

    def upsert(self, record_id: int, data: str) -> WALEvent:
        if record_id in self.data:
            return self.update(record_id, data)
        return self.insert(record_id, data)

    def get_next_wal(self) -> Optional[WALEvent]:
        if self.wal_queue:
            return self.wal_queue.popleft()
        return None

    def get_all_data(self) -> Dict[int, DataRecord]:
        return self.data.copy()

    def get_data_list(self) -> list:
        return [r.to_dict() for r in sorted(self.data.values(), key=lambda x: x.id)]
