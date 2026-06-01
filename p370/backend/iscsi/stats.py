import json
import csv
import io
import threading
from collections import deque
from typing import List, Optional, Dict, Any, Callable

from .types import Statistics, CommandRecord, LogLevel, LogDirection
from .logger import LogManager


class StatsManager:
    def __init__(self, logger: LogManager):
        self._logger = logger
        self._lock = threading.RLock()

        self._total_commands: int = 0
        self._successful_commands: int = 0
        self._retransmitted_commands: int = 0
        self._failed_commands: int = 0
        self._total_retries: int = 0
        self._active_commands: int = 0
        self._fault_count: int = 0
        self._recovery_count: int = 0
        self._recovery_times: List[float] = []

        self._command_history: deque = deque(maxlen=1000)
        self._pdu_stats: Dict[str, Dict[str, int]] = {}
        self._subscribers: List[Callable[[Statistics], None]] = []

    def get_statistics(self) -> Statistics:
        with self._lock:
            return Statistics(
                total_commands=self._total_commands,
                successful_commands=self._successful_commands,
                retransmitted_commands=self._retransmitted_commands,
                failed_commands=self._failed_commands,
                total_retries=self._total_retries,
                active_commands=self._active_commands,
                fault_count=self._fault_count,
                recovery_count=self._recovery_count,
                recovery_times=self._recovery_times.copy(),
            )

    def reset_statistics(self) -> None:
        with self._lock:
            self._total_commands = 0
            self._successful_commands = 0
            self._retransmitted_commands = 0
            self._failed_commands = 0
            self._total_retries = 0
            self._active_commands = 0
            self._fault_count = 0
            self._recovery_count = 0
            self._recovery_times.clear()
            self._command_history.clear()
            self._pdu_stats.clear()
            self._logger.info("Statistics reset")
            self._notify_subscribers()

    def command_created(self) -> None:
        with self._lock:
            self._total_commands += 1
            self._active_commands += 1
            self._logger.debug(
                f"Command created - total: {self._total_commands}, active: {self._active_commands}"
            )
            self._notify_subscribers()

    def command_completed(self, success: bool, had_retry: bool = False) -> None:
        with self._lock:
            if self._active_commands > 0:
                self._active_commands -= 1
            if success:
                self._successful_commands += 1
                if had_retry:
                    self._retransmitted_commands += 1
            else:
                self._failed_commands += 1
            self._logger.debug(
                f"Command completed - success: {success}, had_retry: {had_retry}, "
                f"active: {self._active_commands}"
            )
            self._notify_subscribers()

    def command_retried(self) -> None:
        with self._lock:
            self._total_retries += 1
            self._logger.debug(f"Command retried - total_retries: {self._total_retries}")
            self._notify_subscribers()

    def command_failed(self) -> None:
        with self._lock:
            if self._active_commands > 0:
                self._active_commands -= 1
            self._failed_commands += 1
            self._logger.warning(
                f"Command failed - failed: {self._failed_commands}, active: {self._active_commands}"
            )
            self._notify_subscribers()

    def fault_occurred(self) -> None:
        with self._lock:
            self._fault_count += 1
            self._logger.warning(f"Fault occurred - fault_count: {self._fault_count}")
            self._notify_subscribers()

    def recovery_completed(self, duration: float) -> None:
        with self._lock:
            self._recovery_count += 1
            self._recovery_times.append(duration)
            self._logger.info(
                f"Recovery completed - recovery_count: {self._recovery_count}, duration: {duration:.3f}s"
            )
            self._notify_subscribers()

    def get_average_recovery_time(self) -> float:
        with self._lock:
            if not self._recovery_times:
                return 0.0
            return sum(self._recovery_times) / len(self._recovery_times)

    def get_success_rate(self) -> float:
        with self._lock:
            if self._total_commands == 0:
                return 0.0
            return self._successful_commands / self._total_commands

    def get_retry_rate(self) -> float:
        with self._lock:
            if self._total_commands == 0:
                return 0.0
            return self._retransmitted_commands / self._total_commands

    def add_command_history(self, command: CommandRecord) -> None:
        with self._lock:
            self._command_history.append(command)

    def get_command_history(self, limit: int = 100) -> List[CommandRecord]:
        with self._lock:
            history = list(self._command_history)
            return history[-limit:] if limit > 0 else history

    def get_command_by_id(self, command_id: str) -> Optional[CommandRecord]:
        with self._lock:
            for cmd in reversed(self._command_history):
                if cmd.id == command_id:
                    return cmd
            return None

    def _ensure_pdu_type(self, pdu_type: str) -> None:
        if pdu_type not in self._pdu_stats:
            self._pdu_stats[pdu_type] = {"sent": 0, "received": 0, "dropped": 0}

    def pdu_sent(self, pdu_type: str) -> None:
        with self._lock:
            self._ensure_pdu_type(pdu_type)
            self._pdu_stats[pdu_type]["sent"] += 1
            self._logger.debug(f"PDU sent - type: {pdu_type}", pdu_type=pdu_type)

    def pdu_received(self, pdu_type: str) -> None:
        with self._lock:
            self._ensure_pdu_type(pdu_type)
            self._pdu_stats[pdu_type]["received"] += 1
            self._logger.debug(f"PDU received - type: {pdu_type}", pdu_type=pdu_type)

    def pdu_dropped(self, pdu_type: str) -> None:
        with self._lock:
            self._ensure_pdu_type(pdu_type)
            self._pdu_stats[pdu_type]["dropped"] += 1
            self._logger.warning(f"PDU dropped - type: {pdu_type}", pdu_type=pdu_type)

    def get_pdu_stats(self) -> Dict[str, Any]:
        with self._lock:
            return {
                pdu_type: stats.copy() for pdu_type, stats in self._pdu_stats.items()
            }

    def subscribe_stats(self, callback: Callable[[Statistics], None]) -> None:
        with self._lock:
            self._subscribers.append(callback)

    def unsubscribe_stats(self, callback: Callable[[Statistics], None]) -> None:
        with self._lock:
            if callback in self._subscribers:
                self._subscribers.remove(callback)

    def _notify_subscribers(self) -> None:
        stats = self.get_statistics()
        for callback in self._subscribers:
            try:
                callback(stats)
            except Exception:
                pass

    def export_json(self) -> str:
        with self._lock:
            data = {
                "statistics": {
                    "total_commands": self._total_commands,
                    "successful_commands": self._successful_commands,
                    "retransmitted_commands": self._retransmitted_commands,
                    "failed_commands": self._failed_commands,
                    "total_retries": self._total_retries,
                    "active_commands": self._active_commands,
                    "fault_count": self._fault_count,
                    "recovery_count": self._recovery_count,
                    "recovery_times": self._recovery_times,
                    "average_recovery_time": self.get_average_recovery_time(),
                    "success_rate": self.get_success_rate(),
                    "retry_rate": self.get_retry_rate(),
                },
                "pdu_stats": self.get_pdu_stats(),
                "command_history_count": len(self._command_history),
            }
            return json.dumps(data, indent=2)

    def export_csv(self) -> str:
        with self._lock:
            output = io.StringIO()
            writer = csv.writer(output)

            writer.writerow(["Category", "Metric", "Value"])

            writer.writerow(["Commands", "Total Commands", self._total_commands])
            writer.writerow(["Commands", "Successful Commands", self._successful_commands])
            writer.writerow(["Commands", "Retransmitted Commands", self._retransmitted_commands])
            writer.writerow(["Commands", "Failed Commands", self._failed_commands])
            writer.writerow(["Commands", "Total Retries", self._total_retries])
            writer.writerow(["Commands", "Active Commands", self._active_commands])
            writer.writerow(["Commands", "Success Rate", f"{self.get_success_rate():.4f}"])
            writer.writerow(["Commands", "Retry Rate", f"{self.get_retry_rate():.4f}"])

            writer.writerow(["Recovery", "Fault Count", self._fault_count])
            writer.writerow(["Recovery", "Recovery Count", self._recovery_count])
            writer.writerow(["Recovery", "Average Recovery Time (s)", f"{self.get_average_recovery_time():.4f}"])

            writer.writerow([])
            writer.writerow(["PDU Type", "Sent", "Received", "Dropped"])
            for pdu_type, stats in self._pdu_stats.items():
                writer.writerow([
                    pdu_type,
                    stats["sent"],
                    stats["received"],
                    stats["dropped"],
                ])

            return output.getvalue()
