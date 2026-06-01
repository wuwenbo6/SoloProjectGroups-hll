import asyncio
import random
import threading
import time
from enum import Enum
from typing import Dict, Any, Optional, List, Set

from .types import ISCSIPDU, ConnectionState
from .connection import ConnectionManager
from .session import SessionManager
from .logger import LogManager


class FaultType(Enum):
    MANUAL = "MANUAL"
    RANDOM_DROP = "RANDOM_DROP"
    RANDOM_DISCONNECT = "RANDOM_DISCONNECT"
    PERIODIC = "PERIODIC"
    BURST = "BURST"


class FaultSimulator:
    def __init__(
        self,
        connection_manager: ConnectionManager,
        session_manager: SessionManager,
        logger: LogManager,
    ) -> None:
        self._connection_manager = connection_manager
        self._session_manager = session_manager
        self._logger = logger

        self._fault_states: Dict[str, Dict[str, Any]] = {}
        self._auto_fault_configs: Dict[str, Dict[str, Any]] = {}
        self._duration_timers: Dict[str, asyncio.Task] = {}
        self._monitor_task: Optional[asyncio.Task] = None
        self._lock = threading.Lock()
        self._running = False

    async def start(self) -> None:
        self._running = True
        self._monitor_task = asyncio.create_task(self._fault_monitor_task())

    async def stop(self) -> None:
        self._running = False
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
            self._monitor_task = None

        for timer in list(self._duration_timers.values()):
            timer.cancel()
            try:
                await timer
            except asyncio.CancelledError:
                pass
        self._duration_timers.clear()

    def trigger_manual_fault(self, connection_id: str, duration: float = 5.0) -> bool:
        with self._lock:
            connection = self._connection_manager.get_connection(connection_id)
            if connection is None:
                return False

            self._fault_states[connection_id] = {
                "type": FaultType.MANUAL,
                "enabled": True,
                "start_time": time.time(),
                "duration": duration,
                "drop_count": 0,
                "disconnect_count": 0,
            }

            self._connection_manager.simulate_fault(connection_id)
            self._logger.warning(
                f"Manual fault triggered for connection {connection_id}, duration: {duration}s",
                connection_id=connection_id,
            )

            asyncio.create_task(self._duration_timer(connection_id, duration))
            return True

    def clear_fault(self, connection_id: str) -> bool:
        with self._lock:
            if connection_id not in self._fault_states:
                return False

            del self._fault_states[connection_id]

            if connection_id in self._auto_fault_configs:
                del self._auto_fault_configs[connection_id]

            if connection_id in self._duration_timers:
                self._duration_timers[connection_id].cancel()
                del self._duration_timers[connection_id]

            self._connection_manager.recover_connection(connection_id)
            self._logger.info(
                f"Fault cleared for connection {connection_id}",
                connection_id=connection_id,
            )
            return True

    def set_auto_fault_mode(self, connection_id: str, mode: str, **kwargs) -> bool:
        try:
            fault_type = FaultType(mode.upper())
        except ValueError:
            return False

        connection = self._connection_manager.get_connection(connection_id)
        if connection is None:
            return False

        config = {"type": fault_type, "enabled": True, **kwargs}

        with self._lock:
            self._auto_fault_configs[connection_id] = config
            self._fault_states[connection_id] = {
                "type": fault_type,
                "enabled": True,
                "start_time": time.time(),
                "drop_count": 0,
                "disconnect_count": 0,
            }
            self._logger.info(
                f"Auto fault mode {fault_type.value} set for connection {connection_id}",
                connection_id=connection_id,
            )
            return True

    def disable_auto_fault(self, connection_id: str) -> bool:
        with self._lock:
            if connection_id not in self._auto_fault_configs:
                return False

            del self._auto_fault_configs[connection_id]

            if connection_id in self._fault_states:
                self._fault_states[connection_id]["enabled"] = False

            self._connection_manager.recover_connection(connection_id)
            self._logger.info(
                f"Auto fault disabled for connection {connection_id}",
                connection_id=connection_id,
            )
            return True

    def start_random_drop(self, connection_id: str, drop_probability: float = 0.3) -> bool:
        if drop_probability < 0 or drop_probability > 1:
            return False
        return self.set_auto_fault_mode(
            connection_id,
            FaultType.RANDOM_DROP.value,
            drop_probability=drop_probability,
        )

    def start_random_disconnect(
        self,
        connection_id: str,
        disconnect_probability: float = 0.1,
        min_duration: float = 3.0,
        max_duration: float = 10.0,
    ) -> bool:
        if disconnect_probability < 0 or disconnect_probability > 1:
            return False
        if min_duration < 0 or max_duration < min_duration:
            return False
        return self.set_auto_fault_mode(
            connection_id,
            FaultType.RANDOM_DISCONNECT.value,
            disconnect_probability=disconnect_probability,
            min_duration=min_duration,
            max_duration=max_duration,
            next_check_time=time.time() + random.uniform(1.0, 5.0),
        )

    def start_periodic_fault(
        self,
        connection_id: str,
        interval: float = 30.0,
        duration: float = 5.0,
    ) -> bool:
        if interval <= 0 or duration <= 0 or duration >= interval:
            return False
        return self.set_auto_fault_mode(
            connection_id,
            FaultType.PERIODIC.value,
            interval=interval,
            duration=duration,
            next_fault_time=time.time() + interval,
            is_active=False,
        )

    def start_burst_fault(
        self,
        connection_id: str,
        burst_count: int = 10,
        burst_interval: float = 0.1,
    ) -> bool:
        if burst_count <= 0 or burst_interval <= 0:
            return False
        return self.set_auto_fault_mode(
            connection_id,
            FaultType.BURST.value,
            burst_count=burst_count,
            burst_interval=burst_interval,
            remaining_burst=0,
            next_burst_time=0,
            next_burst_start=time.time() + random.uniform(5.0, 15.0),
        )

    def should_drop_pdu(self, connection_id: str, direction: str) -> bool:
        with self._lock:
            if connection_id not in self._fault_states:
                return False

            fault_state = self._fault_states[connection_id]
            if not fault_state["enabled"]:
                return False

            fault_type = fault_state["type"]

            if fault_type == FaultType.MANUAL:
                return True

            if fault_type == FaultType.RANDOM_DROP:
                config = self._auto_fault_configs.get(connection_id, {})
                drop_prob = config.get("drop_probability", 0.3)
                if random.random() < drop_prob:
                    fault_state["drop_count"] = fault_state.get("drop_count", 0) + 1
                    return True
                return False

            if fault_type == FaultType.BURST:
                config = self._auto_fault_configs.get(connection_id, {})
                if config.get("remaining_burst", 0) > 0:
                    fault_state["drop_count"] = fault_state.get("drop_count", 0) + 1
                    return True
                return False

            if fault_type == FaultType.PERIODIC:
                config = self._auto_fault_configs.get(connection_id, {})
                if config.get("is_active", False):
                    fault_state["drop_count"] = fault_state.get("drop_count", 0) + 1
                    return True
                return False

            return False

    def should_disconnect(self, connection_id: str) -> bool:
        with self._lock:
            if connection_id not in self._fault_states:
                return False

            fault_state = self._fault_states[connection_id]
            if not fault_state["enabled"]:
                return False

            fault_type = fault_state["type"]

            if fault_type == FaultType.RANDOM_DISCONNECT:
                config = self._auto_fault_configs.get(connection_id, {})
                now = time.time()
                if now >= config.get("next_check_time", 0):
                    disconnect_prob = config.get("disconnect_probability", 0.1)
                    if random.random() < disconnect_prob:
                        fault_state["disconnect_count"] = fault_state.get("disconnect_count", 0) + 1
                        min_dur = config.get("min_duration", 3.0)
                        max_dur = config.get("max_duration", 10.0)
                        duration = random.uniform(min_dur, max_dur)
                        config["next_check_time"] = now + random.uniform(10.0, 30.0)
                        asyncio.create_task(self._duration_timer(connection_id, duration))
                        return True
                    else:
                        config["next_check_time"] = now + random.uniform(1.0, 5.0)
                return False

            return False

    def process_pdu(
        self,
        connection_id: str,
        direction: str,
        pdu: ISCSIPDU,
    ) -> Optional[ISCSIPDU]:
        if self.should_drop_pdu(connection_id, direction):
            self._logger.debug(
                f"PDU dropped by fault simulator, direction: {direction}",
                connection_id=connection_id,
                pdu_type=hex(pdu.opcode),
            )
            return None
        return pdu

    def get_fault_status(self, connection_id: str) -> Dict[str, Any]:
        with self._lock:
            fault_state = self._fault_states.get(connection_id)
            auto_config = self._auto_fault_configs.get(connection_id)

            if fault_state is None and auto_config is None:
                return {"connection_id": connection_id, "has_fault": False}

            status = {
                "connection_id": connection_id,
                "has_fault": True,
                "type": fault_state["type"].value if fault_state else None,
                "enabled": fault_state["enabled"] if fault_state else False,
                "start_time": fault_state.get("start_time") if fault_state else None,
                "drop_count": fault_state.get("drop_count", 0) if fault_state else 0,
                "disconnect_count": fault_state.get("disconnect_count", 0) if fault_state else 0,
            }

            if auto_config:
                config_copy = {k: v for k, v in auto_config.items() if k != "type"}
                status["config"] = config_copy

            return status

    def get_all_fault_status(self) -> Dict[str, Dict[str, Any]]:
        with self._lock:
            result = {}
            all_connections = self._connection_manager.get_all_connections()
            for conn in all_connections:
                result[conn.connection_id] = self.get_fault_status(conn.connection_id)
            return result

    def clear_all_faults(self) -> None:
        with self._lock:
            connection_ids = list(self._fault_states.keys())

        for connection_id in connection_ids:
            self.clear_fault(connection_id)

        self._logger.info("All faults cleared")

    async def _fault_monitor_task(self) -> None:
        while self._running:
            try:
                await asyncio.sleep(0.1)
                self._process_periodic_faults()
                self._process_burst_faults()
                self._check_random_disconnects()
            except asyncio.CancelledError:
                break
            except Exception as e:
                self._logger.error(f"Fault monitor task error: {e}")

    def _process_periodic_faults(self) -> None:
        with self._lock:
            now = time.time()
            for connection_id, config in list(self._auto_fault_configs.items()):
                if config.get("type") != FaultType.PERIODIC:
                    continue

                if not config.get("enabled", True):
                    continue

                if config.get("is_active", False):
                    if now >= config.get("fault_end_time", 0):
                        config["is_active"] = False
                        config["next_fault_time"] = now + config.get("interval", 30.0)
                        self._connection_manager.recover_connection(connection_id)
                        self._logger.info(
                            f"Periodic fault ended for connection {connection_id}",
                            connection_id=connection_id,
                        )
                else:
                    if now >= config.get("next_fault_time", 0):
                        config["is_active"] = True
                        duration = config.get("duration", 5.0)
                        config["fault_end_time"] = now + duration
                        self._connection_manager.simulate_fault(connection_id)
                        self._logger.warning(
                            f"Periodic fault started for connection {connection_id}, duration: {duration}s",
                            connection_id=connection_id,
                        )

    def _process_burst_faults(self) -> None:
        with self._lock:
            now = time.time()
            for connection_id, config in list(self._auto_fault_configs.items()):
                if config.get("type") != FaultType.BURST:
                    continue

                if not config.get("enabled", True):
                    continue

                remaining = config.get("remaining_burst", 0)

                if remaining > 0:
                    if now >= config.get("next_burst_time", 0):
                        config["remaining_burst"] = remaining - 1
                        config["next_burst_time"] = now + config.get("burst_interval", 0.1)
                        if config["remaining_burst"] == 0:
                            config["next_burst_start"] = now + random.uniform(10.0, 30.0)
                            self._logger.info(
                                f"Burst fault completed for connection {connection_id}",
                                connection_id=connection_id,
                            )
                else:
                    if now >= config.get("next_burst_start", 0):
                        config["remaining_burst"] = config.get("burst_count", 10)
                        config["next_burst_time"] = now
                        self._logger.warning(
                            f"Burst fault started for connection {connection_id}, count: {config['remaining_burst']}",
                            connection_id=connection_id,
                        )

    def _check_random_disconnects(self) -> None:
        with self._lock:
            connection_ids = list(self._auto_fault_configs.keys())

        for connection_id in connection_ids:
            with self._lock:
                config = self._auto_fault_configs.get(connection_id)
                if config is None or config.get("type") != FaultType.RANDOM_DISCONNECT:
                    continue

            self.should_disconnect(connection_id)

    async def _duration_timer(self, connection_id: str, duration: float) -> None:
        try:
            await asyncio.sleep(duration)
            self.clear_fault(connection_id)
        except asyncio.CancelledError:
            pass
