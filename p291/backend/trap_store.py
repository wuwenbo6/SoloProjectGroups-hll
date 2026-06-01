from __future__ import annotations
import threading
import time
from collections import deque
from models import SnmpTrap


class TrapStore:
    MAX_TRAPS = 1000
    DEDUP_WINDOW_SECONDS = 5

    def __init__(self):
        self._traps: deque[SnmpTrap] = deque(maxlen=self.MAX_TRAPS)
        self._lock = threading.Lock()
        self._start_time = time.time()
        self._recent_traps: dict[str, float] = {}
        self._duplicate_count = 0

    def _cleanup_recent(self):
        now = time.time()
        to_remove = [key for key, ts in self._recent_traps.items() if now - ts > self.DEDUP_WINDOW_SECONDS]
        for key in to_remove:
            del self._recent_traps[key]

    def _get_dup_key(self, trap: SnmpTrap) -> str:
        return f"{trap.trap_id}:{trap.source_ip}"

    def add_trap(self, trap: SnmpTrap) -> bool:
        with self._lock:
            self._cleanup_recent()
            key = self._get_dup_key(trap)
            now = time.time()
            if key in self._recent_traps:
                self._duplicate_count += 1
                trap.is_duplicate = True
                return False
            self._recent_traps[key] = now
            self._traps.appendleft(trap)
            return True

    def get_traps(
        self,
        version: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[SnmpTrap], int]:
        with self._lock:
            traps = list(self._traps)
        if version:
            traps = [t for t in traps if t.snmp_version == version]
        total = len(traps)
        return traps[offset : offset + limit], total

    def get_trap_by_id(self, trap_id: str) -> SnmpTrap | None:
        with self._lock:
            for t in self._traps:
                if t.id == trap_id:
                    return t
        return None

    def clear(self):
        with self._lock:
            self._traps.clear()
            self._recent_traps.clear()
            self._duplicate_count = 0

    def count(self) -> int:
        with self._lock:
            return len(self._traps)

    @property
    def duplicate_count(self) -> int:
        with self._lock:
            return self._duplicate_count

    @property
    def uptime(self) -> float:
        return time.time() - self._start_time


trap_store = TrapStore()
