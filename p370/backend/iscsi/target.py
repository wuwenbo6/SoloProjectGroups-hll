import asyncio
import uuid
import time
import random
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

from .types import (
    ErrorRecoveryLevel,
    CommandStatus,
    CommandRecord,
    CommandEvent,
    SessionConfig,
    SessionState,
    ConnectionState,
    LogDirection,
    LogLevel,
    ISCSIPDU,
)
from .session import SessionManager
from .connection import ConnectionManager
from .recovery import ErrorRecoveryEngine
from .logger import LogManager
from .fault_simulator import FaultSimulator
from .stats import StatsManager
from .pdu import (
    create_scsi_response,
    create_data_in,
    create_r2t,
    create_login_response,
    create_nop_in,
)


@dataclass
class TargetConfig:
    target_iqn: str = "iqn.2024.com.example:iscsi-target"
    listen_address: str = "0.0.0.0"
    listen_port: int = 3260


class ISCSITarget:
    def __init__(self, config: Optional[TargetConfig] = None):
        self._config = config or TargetConfig()
        self._session_config = SessionConfig(
            target_iqn=self._config.target_iqn,
            erl_level=ErrorRecoveryLevel.ERL1,
        )

        self._logger = LogManager(max_entries=2000)
        self._connection_manager = ConnectionManager()
        self._session_manager = SessionManager(self._session_config)
        self._stats_manager = StatsManager(self._logger)
        self._recovery_engine = ErrorRecoveryEngine(
            self._session_manager, self._connection_manager, self._logger
        )
        self._fault_simulator = FaultSimulator(
            self._connection_manager, self._session_manager, self._logger
        )

        self._is_running = False
        self._start_time: Optional[float] = None
        self._current_session_id: Optional[str] = None
        self._current_connection_id: Optional[str] = None

        self._command_task: Optional[asyncio.Task] = None
        self._nop_task: Optional[asyncio.Task] = None

    @property
    def is_running(self) -> bool:
        return self._is_running

    @property
    def logger(self) -> LogManager:
        return self._logger

    @property
    def stats_manager(self) -> StatsManager:
        return self._stats_manager

    @property
    def connection_manager(self) -> ConnectionManager:
        return self._connection_manager

    @property
    def session_manager(self) -> SessionManager:
        return self._session_manager

    @property
    def recovery_engine(self) -> ErrorRecoveryEngine:
        return self._recovery_engine

    @property
    def fault_simulator(self) -> FaultSimulator:
        return self._fault_simulator

    def get_status(self) -> Dict[str, Any]:
        connection_state = "disconnected"
        initiator_iqn = None

        if self._current_session_id:
            session = self._session_manager.get_session(self._current_session_id)
            if session:
                initiator_iqn = session.initiator_iqn
                if session.is_recovering:
                    connection_state = "recovering"
                elif session.state == SessionState.LOGGED_IN:
                    connection_state = "connected"

        if self._current_connection_id:
            conn = self._connection_manager.get_connection(self._current_connection_id)
            if conn and conn.is_faulty:
                connection_state = "fault"

        return {
            "is_running": self._is_running,
            "connection_state": connection_state,
            "erl_level": self._session_config.erl_level.value,
            "uptime": (time.time() - self._start_time) if self._start_time else 0,
            "initiator_iqn": initiator_iqn,
            "target_iqn": self._config.target_iqn,
            "listen_address": f"{self._config.listen_address}:{self._config.listen_port}",
        }

    async def start(self) -> bool:
        if self._is_running:
            return False

        self._is_running = True
        self._start_time = time.time()

        await self._fault_simulator.start()

        self._logger.info(
            f"iSCSI Target started: {self._config.target_iqn}",
            direction=LogDirection.SYSTEM,
        )

        self._command_task = asyncio.create_task(self._simulate_initiator())
        self._nop_task = asyncio.create_task(self._nop_keepalive())

        return True

    async def stop(self) -> None:
        if not self._is_running:
            return

        self._is_running = False

        if self._command_task:
            self._command_task.cancel()
            try:
                await self._command_task
            except asyncio.CancelledError:
                pass
            self._command_task = None

        if self._nop_task:
            self._nop_task.cancel()
            try:
                await self._nop_task
            except asyncio.CancelledError:
                pass
            self._nop_task = None

        await self._fault_simulator.stop()

        if self._current_connection_id:
            self._connection_manager.update_connection_state(
                self._current_connection_id, ConnectionState.CLEANUP_WAIT
            )

        if self._current_session_id:
            self._session_manager.update_session_state(
                self._current_session_id, SessionState.FREE
            )

        self._current_session_id = None
        self._current_connection_id = None

        self._logger.info(
            "iSCSI Target stopped",
            direction=LogDirection.SYSTEM,
        )

    async def _simulate_initiator(self) -> None:
        try:
            await asyncio.sleep(0.5)

            if not self._is_running:
                return

            conn = self._connection_manager.create_connection(
                address="127.0.0.1:55260",
                cid=0,
            )
            self._current_connection_id = conn.connection_id

            self._connection_manager.update_connection_state(
                conn.connection_id, ConnectionState.XPT_WAIT
            )
            self._logger.info(
                "Initiator connecting...",
                direction=LogDirection.IN,
                pdu_type="LOGIN_REQUEST",
            )
            await asyncio.sleep(0.3)

            self._connection_manager.update_connection_state(
                conn.connection_id, ConnectionState.IN_LOGIN
            )
            self._logger.info(
                "Login negotiation in progress",
                direction=LogDirection.IN,
                pdu_type="LOGIN_REQUEST",
            )
            await asyncio.sleep(0.5)

            session_id = self._session_manager.create_session(
                initiator_iqn="iqn.2024.com.example:iscsi-initiator"
            )
            self._current_session_id = session_id
            self._session_manager.add_connection_to_session(
                session_id, conn.connection_id
            )
            self._connection_manager.update_connection_state(
                conn.connection_id, ConnectionState.LOGGED_IN
            )

            self._logger.info(
                f"Login successful, ERL={self._session_config.erl_level.value}",
                direction=LogDirection.OUT,
                pdu_type="LOGIN_RESPONSE",
            )

            cmd_sn = 0
            while self._is_running:
                await asyncio.sleep(random.uniform(1.0, 3.0))
                if not self._is_running:
                    break

                opcode = random.choice(["READ", "WRITE", "READ", "WRITE", "READ"])
                cmd = CommandRecord(
                    id=uuid.uuid4().hex[:8],
                    cmd_sn=cmd_sn,
                    exp_stat_sn=cmd_sn,
                    opcode=opcode,
                    status=CommandStatus.ACTIVE,
                    retry_count=0,
                    created_at=time.time(),
                    events=[
                        CommandEvent(type="created", timestamp=time.time()),
                        CommandEvent(type="sent", timestamp=time.time()),
                    ],
                )

                self._session_manager.add_command(session_id, cmd)
                self._stats_manager.command_created()
                self._stats_manager.add_command_history(cmd)

                self._logger.info(
                    f"SCSI {opcode} cmd_sn={cmd_sn}",
                    direction=LogDirection.IN,
                    pdu_type="SCSI_COMMAND",
                    connection_id=conn.connection_id,
                )

                processed = await self._process_command(cmd, session_id, conn.connection_id)
                cmd_sn += 1

        except asyncio.CancelledError:
            pass
        except Exception as e:
            self._logger.error(f"Initiator simulation error: {e}")

    async def _process_command(
        self, cmd: CommandRecord, session_id: str, connection_id: str
    ) -> bool:
        try:
            pdu = await self._connection_manager.dequeue_send_pdu(connection_id)
            pdu_to_send = create_scsi_response(
                initiator_task_tag=0,
                cmd_sn=cmd.cmd_sn,
                exp_stat_sn=cmd.exp_stat_sn,
                stat_sn=cmd.cmd_sn,
            )

            processed = self._fault_simulator.process_pdu(
                connection_id, "out", pdu_to_send
            )

            if processed is None:
                self._stats_manager.pdu_dropped("SCSI_RESPONSE")
                self._logger.warning(
                    f"SCSI RESPONSE for cmd_sn={cmd.cmd_sn} dropped",
                    direction=LogDirection.SYSTEM,
                    pdu_type="SCSI_RESPONSE",
                    connection_id=connection_id,
                )

                if self._session_config.erl_level == ErrorRecoveryLevel.ERL0:
                    self._session_manager.update_command_status(
                        session_id, cmd.cmd_sn, CommandStatus.FAILED
                    )
                    self._stats_manager.command_failed()
                    return False
                elif self._session_config.erl_level in (
                    ErrorRecoveryLevel.ERL1,
                    ErrorRecoveryLevel.ERL2,
                ):
                    self._session_manager.update_command_status(
                        session_id, cmd.cmd_sn, CommandStatus.RETRANSMITTING
                    )
                    self._stats_manager.command_retried()
                    cmd.retry_count += 1
                    cmd.events.append(
                        CommandEvent(
                            type="retransmit",
                            timestamp=time.time(),
                            reason="PDU dropped, queuing for retransmission",
                        )
                    )

                    await asyncio.sleep(random.uniform(0.5, 2.0))

                    conn = self._connection_manager.get_connection(connection_id)
                    if conn and not conn.is_faulty:
                        self._session_manager.update_command_status(
                            session_id, cmd.cmd_sn, CommandStatus.COMPLETED
                        )
                        cmd.events.append(
                            CommandEvent(
                                type="completed",
                                timestamp=time.time(),
                                reason="Retransmission successful",
                            )
                        )
                        self._stats_manager.command_completed(True, had_retry=True)
                        self._logger.info(
                            f"SCSI {cmd.opcode} cmd_sn={cmd.cmd_sn} completed (retry #{cmd.retry_count})",
                            direction=LogDirection.OUT,
                            pdu_type="SCSI_RESPONSE",
                            connection_id=connection_id,
                        )
                        return True
                    else:
                        self._session_manager.update_command_status(
                            session_id, cmd.cmd_sn, CommandStatus.FAILED
                        )
                        self._stats_manager.command_failed()
                        return False

            self._stats_manager.pdu_sent("SCSI_RESPONSE")

            await asyncio.sleep(random.uniform(0.1, 0.3))

            self._session_manager.update_command_status(
                session_id, cmd.cmd_sn, CommandStatus.COMPLETED
            )
            cmd.events.append(
                CommandEvent(type="completed", timestamp=time.time())
            )
            self._stats_manager.command_completed(True)

            if random.random() < 0.4:
                data_pdu = create_data_in(
                    initiator_task_tag=0,
                    cmd_sn=cmd.cmd_sn,
                    exp_stat_sn=cmd.exp_stat_sn,
                    stat_sn=cmd.cmd_sn,
                    data=b"\x00" * random.randint(256, 4096),
                )
                data_processed = self._fault_simulator.process_pdu(
                    connection_id, "out", data_pdu
                )
                if data_processed:
                    self._stats_manager.pdu_sent("DATA_IN")
                    self._logger.debug(
                        f"DATA-IN for cmd_sn={cmd.cmd_sn} ({len(data_pdu.data)} bytes)",
                        direction=LogDirection.OUT,
                        pdu_type="DATA_IN",
                        connection_id=connection_id,
                    )
                else:
                    self._stats_manager.pdu_dropped("DATA_IN")

            self._logger.info(
                f"SCSI {cmd.opcode} cmd_sn={cmd.cmd_sn} completed",
                direction=LogDirection.OUT,
                pdu_type="SCSI_RESPONSE",
                connection_id=connection_id,
            )
            return True

        except Exception as e:
            self._logger.error(f"Command processing error: {e}")
            self._session_manager.update_command_status(
                session_id, cmd.cmd_sn, CommandStatus.FAILED
            )
            self._stats_manager.command_failed()
            return False

    async def _nop_keepalive(self) -> None:
        try:
            while self._is_running:
                await asyncio.sleep(10.0)
                if not self._is_running or not self._current_connection_id:
                    continue

                conn = self._connection_manager.get_connection(
                    self._current_connection_id
                )
                if conn and conn.state == ConnectionState.LOGGED_IN and not conn.is_faulty:
                    nop = create_nop_in(initiator_task_tag=0xFFFFFFFF)
                    processed = self._fault_simulator.process_pdu(
                        self._current_connection_id, "out", nop
                    )
                    if processed:
                        self._stats_manager.pdu_sent("NOP_IN")
                        self._logger.debug(
                            "NOP-In keepalive sent",
                            direction=LogDirection.OUT,
                            pdu_type="NOP_IN",
                            connection_id=self._current_connection_id,
                        )
        except asyncio.CancelledError:
            pass

    def set_erl_level(self, level: int) -> bool:
        try:
            erl = ErrorRecoveryLevel(level)
            self._session_config.erl_level = erl

            if self._current_session_id:
                session = self._session_manager.get_session(self._current_session_id)
                if session:
                    session.erl_level = erl

            self._logger.info(
                f"ERL level changed to {erl.value}",
                direction=LogDirection.SYSTEM,
            )
            return True
        except ValueError:
            return False

    async def trigger_fault(self, duration: float = 5.0) -> bool:
        if not self._current_connection_id:
            self._logger.error("No active connection to apply fault")
            return False

        result = self._fault_simulator.trigger_manual_fault(
            self._current_connection_id, duration
        )

        if result and self._current_session_id:
            self._stats_manager.fault_occurred()
            self._recovery_engine.handle_connection_fault(
                self._current_session_id, self._current_connection_id
            )

        return result

    async def recover_connection(self) -> bool:
        if not self._current_connection_id or not self._current_session_id:
            return False

        self._fault_simulator.clear_fault(self._current_connection_id)

        retransmit_queue = self._recovery_engine.handle_connection_recovery(
            self._current_session_id, self._current_connection_id
        )

        if retransmit_queue:
            recovery_time = self._session_manager.complete_recovery(
                self._current_session_id
            )
            if recovery_time is not None:
                self._stats_manager.recovery_completed(recovery_time)

            for cmd in retransmit_queue:
                self._recovery_engine.command_retried(
                    self._current_session_id, cmd.cmd_sn
                )

        return True

    def set_auto_fault(self, mode: str, probability: float = 0.3) -> bool:
        if not self._current_connection_id:
            return False

        if mode == "random_drop":
            return self._fault_simulator.start_random_drop(
                self._current_connection_id, probability
            )
        elif mode == "periodic":
            return self._fault_simulator.start_periodic_fault(
                self._current_connection_id, interval=15.0, duration=3.0
            )
        elif mode == "burst":
            return self._fault_simulator.start_burst_fault(
                self._current_connection_id, burst_count=5, burst_interval=0.2
            )
        return False

    def disable_auto_fault(self) -> bool:
        if not self._current_connection_id:
            return False
        return self._fault_simulator.disable_auto_fault(self._current_connection_id)

    def get_command_history(self, limit: int = 100) -> List[CommandRecord]:
        return self._stats_manager.get_command_history(limit)
