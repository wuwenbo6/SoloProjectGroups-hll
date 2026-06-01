import uuid
import threading
import time
from dataclasses import dataclass, field
from typing import Optional, List, Dict

from .types import SessionState, ErrorRecoveryLevel, CommandRecord, CommandStatus, SessionConfig


@dataclass
class SessionInfo:
    session_id: str
    initiator_iqn: str
    target_iqn: str
    state: SessionState
    erl_level: ErrorRecoveryLevel
    connections: List[str]
    cmd_sn: int
    exp_stat_sn: int
    max_cmdsn: int
    created_at: float
    is_recovering: bool = False
    recovery_start_time: Optional[float] = None

    def get_next_cmd_sn(self) -> int:
        next_sn = self.cmd_sn
        self.cmd_sn += 1
        return next_sn

    def get_next_stat_sn(self) -> int:
        next_sn = self.exp_stat_sn
        self.exp_stat_sn += 1
        return next_sn

    def validate_cmd_sn(self, cmd_sn: int) -> bool:
        return self.exp_stat_sn <= cmd_sn <= self.max_cmdsn

    def update_exp_stat_sn(self, new_exp: int) -> bool:
        if new_exp < self.exp_stat_sn:
            return False
        self.exp_stat_sn = new_exp
        return True


class SessionManager:
    def __init__(self, config: SessionConfig):
        self._config = config
        self._sessions: Dict[str, SessionInfo] = {}
        self._pending_commands: Dict[str, Dict[str, CommandRecord]] = {}
        self._lock = threading.Lock()

    def create_session(self, initiator_iqn: str, session_type: str = "Normal") -> str:
        with self._lock:
            session_id = uuid.uuid4().hex
            session_info = SessionInfo(
                session_id=session_id,
                initiator_iqn=initiator_iqn,
                target_iqn=self._config.target_iqn,
                state=SessionState.LOGGED_IN,
                erl_level=self._config.erl_level,
                connections=[],
                cmd_sn=0,
                exp_stat_sn=0,
                max_cmdsn=65535,
                created_at=time.time()
            )
            self._sessions[session_id] = session_info
            self._pending_commands[session_id] = {}
            return session_id

    def remove_session(self, session_id: str) -> bool:
        with self._lock:
            if session_id not in self._sessions:
                return False
            del self._sessions[session_id]
            if session_id in self._pending_commands:
                del self._pending_commands[session_id]
            return True

    def get_session(self, session_id: str) -> Optional[SessionInfo]:
        with self._lock:
            return self._sessions.get(session_id)

    def update_session_state(self, session_id: str, state: SessionState) -> bool:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return False
            session.state = state
            return True

    def add_connection_to_session(self, session_id: str, connection_id: str) -> bool:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return False
            if connection_id in session.connections:
                return False
            session.connections.append(connection_id)
            return True

    def remove_connection_from_session(self, session_id: str, connection_id: str) -> bool:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return False
            if connection_id not in session.connections:
                return False
            session.connections.remove(connection_id)
            return True

    def start_recovery(self, session_id: str) -> bool:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return False
            if session.is_recovering:
                return False
            session.is_recovering = True
            session.recovery_start_time = time.time()
            session.state = SessionState.ERROR_RECOVERY
            return True

    def complete_recovery(self, session_id: str) -> Optional[float]:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return None
            if not session.is_recovering:
                return None
            if session.recovery_start_time is None:
                return None
            recovery_time = time.time() - session.recovery_start_time
            session.is_recovering = False
            session.recovery_start_time = None
            session.state = SessionState.LOGGED_IN
            return recovery_time

    def cancel_recovery(self, session_id: str) -> bool:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return False
            if not session.is_recovering:
                return False
            session.is_recovering = False
            session.recovery_start_time = None
            session.state = SessionState.LOGGED_IN
            return True

    def add_command(self, session_id: str, command: CommandRecord) -> bool:
        with self._lock:
            if session_id not in self._pending_commands:
                return False
            cmd_key = str(command.cmd_sn)
            if cmd_key in self._pending_commands[session_id]:
                return False
            self._pending_commands[session_id][cmd_key] = command
            return True

    def get_command(self, session_id: str, cmd_sn: int) -> Optional[CommandRecord]:
        with self._lock:
            if session_id not in self._pending_commands:
                return None
            return self._pending_commands[session_id].get(str(cmd_sn))

    def update_command_status(self, session_id: str, cmd_sn: int, status: CommandStatus) -> bool:
        with self._lock:
            if session_id not in self._pending_commands:
                return False
            cmd_key = str(cmd_sn)
            command = self._pending_commands[session_id].get(cmd_key)
            if command is None:
                return False
            command.status = status
            if status == CommandStatus.COMPLETED or status == CommandStatus.FAILED:
                command.completed_at = time.time()
            return True

    def get_pending_commands(self, session_id: str) -> List[CommandRecord]:
        with self._lock:
            if session_id not in self._pending_commands:
                return []
            return list(self._pending_commands[session_id].values())
