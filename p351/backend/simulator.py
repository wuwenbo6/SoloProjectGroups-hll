from typing import Optional, List
import threading
import time
import random
import string
from .publisher import Publisher
from .subscriber import Subscriber
from .conflict_resolver import TimestampConflictResolver
from .lua_resolver import LuaConflictResolver, LUPA_AVAILABLE
from .latency_tracker import LatencyTracker
from .models import WALEvent, ConflictLog


class Simulator:
    def __init__(self):
        self.publisher = Publisher()
        self.use_lua = LUPA_AVAILABLE
        if self.use_lua:
            self.conflict_resolver = LuaConflictResolver()
        else:
            self.conflict_resolver = TimestampConflictResolver()
        self.subscriber = Subscriber(self.conflict_resolver)
        self.wal_events: List[WALEvent] = []
        self.latency_tracker = LatencyTracker()
        self.is_running = False
        self._sim_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._replication_thread: Optional[threading.Thread] = None
        self._callbacks = {
            "wal": [],
            "conflict": [],
            "state_change": [],
            "latency": []
        }
        self._lock = threading.Lock()

    def on(self, event: str, callback):
        if event in self._callbacks:
            self._callbacks[event].append(callback)

    def _emit(self, event: str, data):
        for cb in self._callbacks.get(event, []):
            try:
                cb(data)
            except Exception:
                pass

    def insert(self, record_id: Optional[int] = None, data: Optional[str] = None) -> dict:
        with self._lock:
            if data is None:
                data = self._generate_random_data()
            event = self.publisher.insert(record_id, data)
            self.wal_events.append(event)
            self._emit("wal", event.to_dict())
            self._replicate_one(event)
            return {
                "success": True,
                "wal_event": event.to_dict(),
                "publisher_data": self.publisher.get_data_list(),
                "subscriber_data": self.subscriber.get_data_list()
            }

    def update(self, record_id: int, data: Optional[str] = None) -> dict:
        with self._lock:
            if data is None:
                data = self._generate_random_data()
            event = self.publisher.update(record_id, data)
            self.wal_events.append(event)
            self._emit("wal", event.to_dict())
            self._replicate_one(event)
            return {
                "success": True,
                "wal_event": event.to_dict(),
                "publisher_data": self.publisher.get_data_list(),
                "subscriber_data": self.subscriber.get_data_list()
            }

    def upsert(self, record_id: int, data: Optional[str] = None) -> dict:
        with self._lock:
            if data is None:
                data = self._generate_random_data()
            event = self.publisher.upsert(record_id, data)
            self.wal_events.append(event)
            self._emit("wal", event.to_dict())
            self._replicate_one(event)
            return {
                "success": True,
                "wal_event": event.to_dict(),
                "publisher_data": self.publisher.get_data_list(),
                "subscriber_data": self.subscriber.get_data_list()
            }

    def insert_conflict_pair(self, record_id: int) -> dict:
        with self._lock:
            base_time = time.time()
            pub_data = f"publisher_value_{record_id}"
            sub_data = f"subscriber_value_{record_id}"

            sub_ts = base_time - random.uniform(0.1, 2.0)
            self.subscriber.direct_insert(record_id, sub_data, sub_ts)

            event = self.publisher.insert(record_id, pub_data)
            self.wal_events.append(event)
            self._emit("wal", event.to_dict())

            conflict_log = self._replicate_one(event)

            return {
                "success": True,
                "wal_event": event.to_dict(),
                "conflict_log": conflict_log.to_dict() if conflict_log else None,
                "publisher_data": self.publisher.get_data_list(),
                "subscriber_data": self.subscriber.get_data_list()
            }

    def _replicate_one(self, event: WALEvent) -> Optional[ConflictLog]:
        self.latency_tracker.record(
            event_id=event.id,
            record_id=event.record_id,
            event_type=event.type,
            publisher_ts=event.timestamp
        )

        conflict_log = self.subscriber.apply_wal(event)
        if conflict_log:
            self._emit("conflict", conflict_log.to_dict())
        self._emit("state_change", self.get_state())
        self._emit("latency", self.latency_tracker.get_stats())
        return conflict_log

    def start_auto_simulate(self, interval: float = 1.0, conflict_rate: float = 0.3):
        if self.is_running:
            return {"success": False, "message": "Simulation already running"}

        self.is_running = True
        self._stop_event.clear()

        def run():
            counter = 0
            while not self._stop_event.is_set():
                try:
                    with self._lock:
                        counter += 1
                        if random.random() < conflict_rate and counter > 2:
                            rid = random.randint(1, max(1, len(self.publisher.data)))
                            result = self.insert_conflict_pair(rid)
                        else:
                            rid = len(self.publisher.data) + 1
                            result = self.insert(rid)
                except Exception:
                    pass
                time.sleep(interval)

        self._sim_thread = threading.Thread(target=run, daemon=True)
        self._sim_thread.start()
        return {"success": True, "message": "Simulation started"}

    def stop_auto_simulate(self):
        self.is_running = False
        self._stop_event.set()
        if self._sim_thread:
            self._sim_thread.join(timeout=2)
        return {"success": True, "message": "Simulation stopped"}

    def reset(self):
        with self._lock:
            self.stop_auto_simulate()
            self.publisher = Publisher()
            self.subscriber = Subscriber(self.conflict_resolver)
            self.wal_events = []
            self.latency_tracker.clear()
            self._emit("state_change", self.get_state())
            return {"success": True, "message": "Simulation reset"}

    def get_state(self) -> dict:
        conflict_stats = self.subscriber.get_conflict_stats()
        latency_stats = self.latency_tracker.get_stats()
        return {
            "is_running": self.is_running,
            "publisher_data": self.publisher.get_data_list(),
            "subscriber_data": self.subscriber.get_data_list(),
            "conflict_count": conflict_stats["total_conflicts"],
            "resolved_incoming": conflict_stats["resolved_incoming"],
            "resolved_existing": conflict_stats["resolved_existing"],
            "conflict_logs": conflict_stats["logs"],
            "audit_logs": self.subscriber.get_audit_logs(),
            "wal_events": [e.to_dict() for e in self.wal_events[-100:]],
            "latency_stats": latency_stats,
            "lua_enabled": self.use_lua,
            "resolver_type": "lua" if self.use_lua else "timestamp"
        }

    def get_audit_logs(self) -> list:
        return self.subscriber.get_audit_logs()

    def get_lua_script(self) -> dict:
        if not self.use_lua:
            return {"enabled": False, "script": "", "default_script": LuaConflictResolver.get_default_script()}
        return {
            "enabled": True,
            "script": self.conflict_resolver.get_script(),
            "default_script": LuaConflictResolver.get_default_script()
        }

    def update_lua_script(self, script: str) -> dict:
        if not self.use_lua:
            return {"success": False, "error": "Lua resolver not available (lupa not installed)"}
        try:
            self.conflict_resolver.update_script(script)
            self.subscriber.conflict_resolver = self.conflict_resolver
            return {"success": True, "message": "Lua script updated"}
        except ValueError as e:
            return {"success": False, "error": str(e)}

    def reset_lua_script(self) -> dict:
        if not self.use_lua:
            return {"success": False, "error": "Lua resolver not available"}
        try:
            self.conflict_resolver.update_script(LuaConflictResolver.get_default_script())
            self.subscriber.conflict_resolver = self.conflict_resolver
            return {"success": True, "message": "Lua script reset to default"}
        except ValueError as e:
            return {"success": False, "error": str(e)}

    def validate_lua_script(self, script: str) -> dict:
        if not LUPA_AVAILABLE:
            return {"valid": False, "error": "lupa not installed"}
        try:
            test_resolver = LuaConflictResolver(script)
            return {"valid": True, "error": None}
        except Exception as e:
            return {"valid": False, "error": str(e)}

    def get_latency_trend(self, window_size: int = 10) -> list:
        return self.latency_tracker.get_trend(window_size)

    def get_latency_stats(self) -> dict:
        return self.latency_tracker.get_stats()

    def export_latency_csv(self) -> str:
        return self.latency_tracker.export_csv()

    def export_latency_json(self) -> list:
        return self.latency_tracker.export_json()

    @staticmethod
    def _generate_random_data() -> str:
        return ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
