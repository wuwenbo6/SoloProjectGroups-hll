import threading
import time
from collections import deque
from typing import Dict, Optional, Deque, Set, Tuple
from dataclasses import dataclass, field


@dataclass
class SessionState:
    session_id: bytes
    auth_key_id: int
    last_msg_ids: Deque[int] = field(default_factory=lambda: deque(maxlen=1000))
    seen_msg_ids: Set[int] = field(default_factory=set)
    created_at: float = field(default_factory=time.time)
    last_accessed: float = field(default_factory=time.time)
    message_count: int = 0
    replay_detected: int = 0


class SessionManager:
    def __init__(self, max_sessions: int = 1000, msg_history_size: int = 1000,
                 session_timeout: int = 3600 * 24):
        self._sessions: Dict[Tuple[int, bytes], SessionState] = {}
        self._max_sessions = max_sessions
        self._msg_history_size = msg_history_size
        self._session_timeout = session_timeout
        self._lock = threading.RLock()

    def get_or_create_session(self, auth_key_id: int, session_id: bytes) -> SessionState:
        key = (auth_key_id, session_id)

        with self._lock:
            self._cleanup_expired()

            if key not in self._sessions:
                if len(self._sessions) >= self._max_sessions:
                    self._evict_oldest()

                session = SessionState(
                    session_id=session_id,
                    auth_key_id=auth_key_id,
                    last_msg_ids=deque(maxlen=self._msg_history_size)
                )
                self._sessions[key] = session
            else:
                session = self._sessions[key]
                session.last_accessed = time.time()

            return session

    def check_and_record_msg_id(self, auth_key_id: int, session_id: bytes,
                                msg_id: int, strict: bool = True) -> Tuple[bool, str]:
        session = self.get_or_create_session(auth_key_id, session_id)

        with self._lock:
            session.last_accessed = time.time()

            if msg_id in session.seen_msg_ids:
                session.replay_detected += 1
                return False, f"Duplicate message_id {msg_id} detected (replay attack)"

            current_time = time.time()
            msg_time = msg_id >> 32
            time_diff = abs(current_time - msg_time)

            if time_diff > 300 and strict:
                return False, f"Message timestamp too far from current time (diff: {time_diff}s)"

            if session.last_msg_ids:
                latest_msg_id = session.last_msg_ids[-1]
                if msg_id <= latest_msg_id and strict:
                    return False, f"Message_id {msg_id} is not strictly increasing"

            session.last_msg_ids.append(msg_id)
            session.seen_msg_ids.add(msg_id)
            session.message_count += 1

            if len(session.seen_msg_ids) > self._msg_history_size * 2:
                self._trim_seen_ids(session)

            return True, "OK"

    def get_session_stats(self, auth_key_id: int, session_id: bytes) -> Optional[dict]:
        key = (auth_key_id, session_id)

        with self._lock:
            session = self._sessions.get(key)
            if not session:
                return None

            return {
                "session_id_hex": session.session_id.hex(),
                "auth_key_id": session.auth_key_id,
                "created_at": session.created_at,
                "last_accessed": session.last_accessed,
                "message_count": session.message_count,
                "replay_detected": session.replay_detected,
                "recent_msg_ids_count": len(session.last_msg_ids),
                "unique_msg_ids_count": len(session.seen_msg_ids)
            }

    def get_all_sessions(self) -> list:
        with self._lock:
            return [
                {
                    "auth_key_id": auth_key_id,
                    "session_id_hex": session_id.hex(),
                    "stats": self.get_session_stats(auth_key_id, session_id)
                }
                for (auth_key_id, session_id) in self._sessions.keys()
            ]

    def remove_session(self, auth_key_id: int, session_id: bytes) -> bool:
        key = (auth_key_id, session_id)

        with self._lock:
            if key in self._sessions:
                del self._sessions[key]
                return True
            return False

    def clear_all_sessions(self) -> int:
        with self._lock:
            count = len(self._sessions)
            self._sessions.clear()
            return count

    def _cleanup_expired(self):
        current_time = time.time()
        expired_keys = []

        for key, session in self._sessions.items():
            if current_time - session.last_accessed > self._session_timeout:
                expired_keys.append(key)

        for key in expired_keys:
            del self._sessions[key]

    def _evict_oldest(self):
        if not self._sessions:
            return

        oldest_key = None
        oldest_time = float('inf')

        for key, session in self._sessions.items():
            if session.last_accessed < oldest_time:
                oldest_time = session.last_accessed
                oldest_key = key

        if oldest_key:
            del self._sessions[oldest_key]

    def _trim_seen_ids(self, session: SessionState):
        keep_ids = set(session.last_msg_ids)
        session.seen_msg_ids = keep_ids


_global_session_manager = SessionManager()


def get_global_session_manager() -> SessionManager:
    return _global_session_manager
