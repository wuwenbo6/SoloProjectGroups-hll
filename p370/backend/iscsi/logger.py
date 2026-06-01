import uuid
import time
import threading
import asyncio
from collections import deque
from typing import List, Optional, Callable, Deque, Iterable, Iterator

from .types import LogEntry, LogLevel, LogDirection


class RingBuffer(Iterable[LogEntry]):
    def __init__(self, max_entries: int):
        self._max_entries = max_entries
        self._buffer: Deque[LogEntry] = deque(maxlen=max_entries)
        self._lock = threading.Lock()

    def append(self, entry: LogEntry) -> None:
        with self._lock:
            self._buffer.append(entry)

    def __iter__(self) -> Iterator[LogEntry]:
        with self._lock:
            return iter(list(self._buffer))

    def __len__(self) -> int:
        with self._lock:
            return len(self._buffer)

    def clear(self) -> None:
        with self._lock:
            self._buffer.clear()

    def filter_by_level(self, level: Optional[LogLevel]) -> List[LogEntry]:
        with self._lock:
            if level is None:
                return list(self._buffer)
            return [entry for entry in self._buffer if entry.level == level]

    def filter_by_timestamp(self, since_timestamp: float) -> List[LogEntry]:
        with self._lock:
            return [entry for entry in self._buffer if entry.timestamp >= since_timestamp]

    def get_latest(self, limit: int) -> List[LogEntry]:
        with self._lock:
            return list(self._buffer)[-limit:]


class LogManager:
    def __init__(self, max_entries: int = 1000):
        self._buffer = RingBuffer(max_entries)
        self._lock = threading.Lock()
        self._callbacks: List[Callable[[LogEntry], None]] = []
        self._async_events: List[asyncio.Event] = []

    def add_log(
        self,
        level: LogLevel,
        direction: LogDirection,
        message: str,
        pdu_type: Optional[str] = None,
        connection_id: Optional[str] = None,
    ) -> LogEntry:
        entry = LogEntry(
            id=str(uuid.uuid4()),
            timestamp=time.time(),
            level=level,
            direction=direction,
            message=message,
            pdu_type=pdu_type,
            connection_id=connection_id,
        )
        self._buffer.append(entry)
        self._notify_subscribers(entry)
        return entry

    def get_logs(self, level: Optional[LogLevel] = None, limit: int = 100) -> List[LogEntry]:
        entries = self._buffer.filter_by_level(level)
        return entries[-limit:]

    def get_recent_logs(self, since_timestamp: float) -> List[LogEntry]:
        return self._buffer.filter_by_timestamp(since_timestamp)

    def clear_logs(self) -> None:
        self._buffer.clear()

    def info(self, message: str, **kwargs) -> LogEntry:
        return self.add_log(LogLevel.INFO, LogDirection.SYSTEM, message, **kwargs)

    def debug(self, message: str, **kwargs) -> LogEntry:
        return self.add_log(LogLevel.DEBUG, LogDirection.SYSTEM, message, **kwargs)

    def warning(self, message: str, **kwargs) -> LogEntry:
        return self.add_log(LogLevel.WARNING, LogDirection.SYSTEM, message, **kwargs)

    def error(self, message: str, **kwargs) -> LogEntry:
        return self.add_log(LogLevel.ERROR, LogDirection.SYSTEM, message, **kwargs)

    def subscribe_callback(self, callback: Callable[[LogEntry], None]) -> None:
        with self._lock:
            self._callbacks.append(callback)

    def unsubscribe_callback(self, callback: Callable[[LogEntry], None]) -> None:
        with self._lock:
            if callback in self._callbacks:
                self._callbacks.remove(callback)

    def subscribe_event(self, event: asyncio.Event) -> None:
        with self._lock:
            self._async_events.append(event)

    def unsubscribe_event(self, event: asyncio.Event) -> None:
        with self._lock:
            if event in self._async_events:
                self._async_events.remove(event)

    def _notify_subscribers(self, entry: LogEntry) -> None:
        with self._lock:
            callbacks = list(self._callbacks)
            events = list(self._async_events)

        for callback in callbacks:
            try:
                callback(entry)
            except Exception:
                pass

        for event in events:
            try:
                event.set()
            except Exception:
                pass

    def __iter__(self) -> Iterator[LogEntry]:
        return iter(self._buffer)

    def __len__(self) -> int:
        return len(self._buffer)
