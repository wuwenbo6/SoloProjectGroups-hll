import asyncio
import threading
import time
from typing import Dict, List, Optional, Any

from .types import ErrorRecoveryLevel, CommandRecord, CommandStatus, SessionState, ConnectionState, CommandEvent
from .session import SessionManager
from .connection import ConnectionManager
from .logger import LogManager


class ErrorRecoveryEngine:
    def __init__(
        self,
        session_manager: SessionManager,
        connection_manager: ConnectionManager,
        logger: LogManager,
    ) -> None:
        self._session_manager = session_manager
        self._connection_manager = connection_manager
        self._logger = logger
        self._lock = threading.Lock()
        self._pending_retries: Dict[str, List[CommandRecord]] = {}
        self._recovery_sessions: Dict[str, Dict[str, Any]] = {}
        self.recovery_timeout: float = 30.0

    def _recover_erl0(self, session_id: str) -> bool:
        session = self._session_manager.get_session(session_id)
        if session is None:
            self._logger.error(
                f"ERL0 recovery failed: session {session_id} not found",
                connection_id=None,
            )
            return False

        self._logger.warning(
            f"Starting ERL0 recovery for session {session_id}",
            connection_id=None,
        )

        pending_commands = self._session_manager.get_pending_commands(session_id)
        for cmd in pending_commands:
            self._session_manager.update_command_status(
                session_id, cmd.cmd_sn, CommandStatus.FAILED
            )
            cmd.events.append(
                CommandEvent(
                    type="FAILED",
                    timestamp=time.time(),
                    reason="ERL0 session discard",
                )
            )
            self._logger.debug(
                f"Discarded command cmd_sn={cmd.cmd_sn} during ERL0 recovery",
                connection_id=None,
            )

        connections = self._connection_manager.get_connections_by_session(session_id)
        for conn in connections:
            self._connection_manager.update_connection_state(
                conn.connection_id, ConnectionState.FREE
            )
            self._session_manager.remove_connection_from_session(
                session_id, conn.connection_id
            )
            self._logger.debug(
                f"Closed connection {conn.connection_id} during ERL0 recovery",
                connection_id=conn.connection_id,
            )

        self._session_manager.update_session_state(session_id, SessionState.FREE)
        self.clear_retransmit_queue(session_id)

        if session_id in self._recovery_sessions:
            del self._recovery_sessions[session_id]

        self._logger.info(
            f"ERL0 recovery completed for session {session_id}, session discarded",
            connection_id=None,
        )
        return True

    def _recover_erl1(self, session_id: str) -> List[CommandRecord]:
        session = self._session_manager.get_session(session_id)
        if session is None:
            self._logger.error(
                f"ERL1 recovery failed: session {session_id} not found",
                connection_id=None,
            )
            return []

        self._logger.warning(
            f"Starting ERL1 recovery for session {session_id}",
            connection_id=None,
        )

        self._session_manager.start_recovery(session_id)

        pending_commands = self._session_manager.get_pending_commands(session_id)
        retransmit_commands: List[CommandRecord] = []

        for cmd in pending_commands:
            if cmd.status in (CommandStatus.PENDING, CommandStatus.ACTIVE):
                self._session_manager.update_command_status(
                    session_id, cmd.cmd_sn, CommandStatus.RETRANSMITTING
                )
                cmd.retry_count += 1
                cmd.events.append(
                    CommandEvent(
                        type="RETRANSMIT",
                        timestamp=time.time(),
                        reason="ERL1 connection recovery",
                    )
                )
                retransmit_commands.append(cmd)
                self._logger.debug(
                    f"Marked command cmd_sn={cmd.cmd_sn} for retransmission",
                    connection_id=None,
                )

        with self._lock:
            self._pending_retries[session_id] = retransmit_commands
            self._recovery_sessions[session_id] = {
                "start_time": time.time(),
                "erl_level": ErrorRecoveryLevel.ERL1,
                "pending_count": len(retransmit_commands),
            }

        self._logger.info(
            f"ERL1 recovery prepared for session {session_id}, "
            f"{len(retransmit_commands)} commands pending retransmission",
            connection_id=None,
        )
        return retransmit_commands

    def _recover_erl2(self, session_id: str) -> bool:
        session = self._session_manager.get_session(session_id)
        if session is None:
            self._logger.error(
                f"ERL2 recovery failed: session {session_id} not found",
                connection_id=None,
            )
            return False

        self._logger.warning(
            f"Starting ERL2 recovery for session {session_id}",
            connection_id=None,
        )

        self._session_manager.start_recovery(session_id)

        pending_commands = self._session_manager.get_pending_commands(session_id)
        retransmit_commands: List[CommandRecord] = []

        for cmd in pending_commands:
            if cmd.status in (CommandStatus.PENDING, CommandStatus.ACTIVE):
                self._session_manager.update_command_status(
                    session_id, cmd.cmd_sn, CommandStatus.RETRANSMITTING
                )
                cmd.retry_count += 1
                cmd.events.append(
                    CommandEvent(
                        type="RETRANSMIT",
                        timestamp=time.time(),
                        reason="ERL2 session recovery",
                    )
                )
                retransmit_commands.append(cmd)
                self._logger.debug(
                    f"Marked command cmd_sn={cmd.cmd_sn} for retransmission in ERL2",
                    connection_id=None,
                )

        connections = self._connection_manager.get_connections_by_session(session_id)
        for conn in connections:
            self._connection_manager.update_connection_state(
                conn.connection_id, ConnectionState.ERROR_RECOVERY
            )
            self._logger.debug(
                f"Set connection {conn.connection_id} to ERROR_RECOVERY state",
                connection_id=conn.connection_id,
            )

        with self._lock:
            self._pending_retries[session_id] = retransmit_commands
            self._recovery_sessions[session_id] = {
                "start_time": time.time(),
                "erl_level": ErrorRecoveryLevel.ERL2,
                "pending_count": len(retransmit_commands),
                "cmd_sn": session.cmd_sn,
                "exp_stat_sn": session.exp_stat_sn,
                "max_cmdsn": session.max_cmdsn,
            }

        self._logger.info(
            f"ERL2 recovery prepared for session {session_id}, "
            f"preserving session state (CmdSN={session.cmd_sn}, "
            f"ExpStatSN={session.exp_stat_sn}), "
            f"{len(retransmit_commands)} commands pending retransmission",
            connection_id=None,
        )
        return True

    def handle_connection_fault(self, session_id: str, connection_id: str) -> None:
        session = self._session_manager.get_session(session_id)
        if session is None:
            self._logger.error(
                f"Connection fault handling failed: session {session_id} not found",
                connection_id=connection_id,
            )
            return

        connection = self._connection_manager.get_connection(connection_id)
        if connection is None:
            self._logger.error(
                f"Connection fault handling failed: connection {connection_id} not found",
                connection_id=connection_id,
            )
            return

        self._logger.warning(
            f"Connection fault detected: session={session_id}, connection={connection_id}",
            connection_id=connection_id,
        )

        self._connection_manager.simulate_fault(connection_id)
        self._connection_manager.update_connection_state(
            connection_id, ConnectionState.ERROR_RECOVERY
        )

        if "fault_count" not in connection.stats:
            connection.stats["fault_count"] = 0
        connection.stats["fault_count"] += 1

        session = self._session_manager.get_session(session_id)
        if session is not None and "fault_count" in session.__dict__:
            pass

        self.trigger_recovery(session_id)

    def handle_connection_recovery(
        self, session_id: str, connection_id: str
    ) -> List[CommandRecord]:
        session = self._session_manager.get_session(session_id)
        if session is None:
            self._logger.error(
                f"Connection recovery failed: session {session_id} not found",
                connection_id=connection_id,
            )
            return []

        connection = self._connection_manager.get_connection(connection_id)
        if connection is None:
            self._logger.error(
                f"Connection recovery failed: connection {connection_id} not found",
                connection_id=connection_id,
            )
            return []

        self._logger.info(
            f"Connection recovery initiated: session={session_id}, connection={connection_id}",
            connection_id=connection_id,
        )

        self._connection_manager.recover_connection(connection_id)
        self._connection_manager.update_connection_state(
            connection_id, ConnectionState.LOGGED_IN
        )

        if "recovery_count" not in connection.stats:
            connection.stats["recovery_count"] = 0
        connection.stats["recovery_count"] += 1

        retransmit_queue = self.get_retransmit_queue(session_id)

        if session.erl_level == ErrorRecoveryLevel.ERL2:
            with self._lock:
                if session_id in self._recovery_sessions:
                    recovery_info = self._recovery_sessions[session_id]
                    self._logger.debug(
                        f"ERL2: Restoring session state for {session_id}: "
                        f"CmdSN={recovery_info.get('cmd_sn')}, "
                        f"ExpStatSN={recovery_info.get('exp_stat_sn')}",
                        connection_id=connection_id,
                    )

        self._logger.info(
            f"Connection {connection_id} recovered, {len(retransmit_queue)} "
            f"commands ready for retransmission",
            connection_id=connection_id,
        )
        return retransmit_queue

    def trigger_recovery(self, session_id: str) -> None:
        session = self._session_manager.get_session(session_id)
        if session is None:
            self._logger.error(
                f"Recovery trigger failed: session {session_id} not found",
                connection_id=None,
            )
            return

        erl_level = session.erl_level
        self._logger.info(
            f"Triggering recovery for session {session_id} with ERL={erl_level.value}",
            connection_id=None,
        )

        if erl_level == ErrorRecoveryLevel.ERL0:
            self._recover_erl0(session_id)
        elif erl_level == ErrorRecoveryLevel.ERL1:
            self._recover_erl1(session_id)
        elif erl_level == ErrorRecoveryLevel.ERL2:
            self._recover_erl2(session_id)
        else:
            self._logger.error(
                f"Unknown ERL level: {erl_level} for session {session_id}",
                connection_id=None,
            )

    def get_recovery_status(self, session_id: str) -> Dict[str, Any]:
        session = self._session_manager.get_session(session_id)
        if session is None:
            return {
                "session_id": session_id,
                "exists": False,
                "is_recovering": False,
            }

        with self._lock:
            recovery_info = self._recovery_sessions.get(session_id, {})
            pending_retries = self._pending_retries.get(session_id, [])

        status = {
            "session_id": session_id,
            "exists": True,
            "is_recovering": session.is_recovering,
            "erl_level": session.erl_level.value,
            "session_state": session.state.value,
            "recovery_start_time": session.recovery_start_time,
            "pending_retry_count": len(pending_retries),
            "recovery_timeout": self.recovery_timeout,
            "elapsed_time": (
                time.time() - session.recovery_start_time
                if session.recovery_start_time is not None
                else None
            ),
            "connections": [
                {
                    "connection_id": conn.connection_id,
                    "state": conn.state.value,
                    "is_faulty": conn.is_faulty,
                }
                for conn in self._connection_manager.get_connections_by_session(
                    session_id
                )
            ],
            "recovery_info": recovery_info,
        }

        return status

    def mark_for_retransmission(self, session_id: str, cmd_sn: int) -> bool:
        session = self._session_manager.get_session(session_id)
        if session is None:
            self._logger.error(
                f"Failed to mark for retransmission: session {session_id} not found",
                connection_id=None,
            )
            return False

        command = self._session_manager.get_command(session_id, cmd_sn)
        if command is None:
            self._logger.error(
                f"Failed to mark for retransmission: command cmd_sn={cmd_sn} "
                f"not found in session {session_id}",
                connection_id=None,
            )
            return False

        self._session_manager.update_command_status(
            session_id, cmd_sn, CommandStatus.RETRANSMITTING
        )
        command.retry_count += 1
        command.events.append(
            CommandEvent(
                type="RETRANSMIT",
                timestamp=time.time(),
                reason="Manual retransmission request",
            )
        )

        with self._lock:
            if session_id not in self._pending_retries:
                self._pending_retries[session_id] = []
            if command not in self._pending_retries[session_id]:
                self._pending_retries[session_id].append(command)

        self._logger.debug(
            f"Command cmd_sn={cmd_sn} marked for retransmission in session {session_id}",
            connection_id=None,
        )
        return True

    def get_retransmit_queue(self, session_id: str) -> List[CommandRecord]:
        with self._lock:
            return list(self._pending_retries.get(session_id, []))

    def clear_retransmit_queue(self, session_id: str) -> None:
        with self._lock:
            if session_id in self._pending_retries:
                count = len(self._pending_retries[session_id])
                del self._pending_retries[session_id]
                self._logger.debug(
                    f"Cleared retransmit queue for session {session_id}, "
                    f"removed {count} commands",
                    connection_id=None,
                )

    def command_retried(self, session_id: str, cmd_sn: int) -> bool:
        with self._lock:
            if session_id not in self._pending_retries:
                return False

            queue = self._pending_retries[session_id]
            for i, cmd in enumerate(queue):
                if cmd.cmd_sn == cmd_sn:
                    removed_cmd = queue.pop(i)
                    removed_cmd.events.append(
                        CommandEvent(
                            type="RETRIED",
                            timestamp=time.time(),
                            reason="Command successfully retransmitted",
                        )
                    )
                    self._logger.debug(
                        f"Command cmd_sn={cmd_sn} marked as retried, "
                        f"removed from retransmit queue",
                        connection_id=None,
                    )

                    if not queue:
                        session = self._session_manager.get_session(session_id)
                        if session is not None and session.is_recovering:
                            recovery_time = self._session_manager.complete_recovery(
                                session_id
                            )
                            if recovery_time is not None:
                                if "recovery_times" not in session.__dict__:
                                    pass
                                self._logger.info(
                                    f"Recovery completed for session {session_id} "
                                    f"in {recovery_time:.2f}s",
                                    connection_id=None,
                                )
                            if session_id in self._recovery_sessions:
                                del self._recovery_sessions[session_id]

                    return True

        self._logger.warning(
            f"Command cmd_sn={cmd_sn} not found in retransmit queue "
            f"for session {session_id}",
            connection_id=None,
        )
        return False

    def check_recovery_timeout(self, session_id: str) -> bool:
        session = self._session_manager.get_session(session_id)
        if session is None:
            return False

        if not session.is_recovering:
            return False

        if session.recovery_start_time is None:
            return False

        elapsed = time.time() - session.recovery_start_time
        if elapsed <= self.recovery_timeout:
            return False

        self._logger.warning(
            f"Recovery timeout for session {session_id}, "
            f"elapsed={elapsed:.2f}s, timeout={self.recovery_timeout}s",
            connection_id=None,
        )

        current_erl = session.erl_level
        if current_erl == ErrorRecoveryLevel.ERL2:
            self._logger.info(
                f"ERL2 -> ERL1 downgrade for session {session_id} due to timeout",
                connection_id=None,
            )
            self._recover_erl1(session_id)
        elif current_erl == ErrorRecoveryLevel.ERL1:
            self._logger.info(
                f"ERL1 -> ERL0 downgrade for session {session_id} due to timeout",
                connection_id=None,
            )
            self._recover_erl0(session_id)

        return True

    async def monitor_recovery_timeouts(self) -> None:
        while True:
            try:
                with self._lock:
                    session_ids = list(self._recovery_sessions.keys())

                for session_id in session_ids:
                    self.check_recovery_timeout(session_id)

                await asyncio.sleep(1.0)
            except Exception as e:
                self._logger.error(
                    f"Error in recovery timeout monitor: {str(e)}",
                    connection_id=None,
                )
                await asyncio.sleep(1.0)
