import socket
import time
import struct
import json
import threading
from typing import Optional, List, Callable, Dict, Any
from datetime import datetime
from enum import Enum
import queue

from app.core import SessionLocal
from app.models import TestTask, PacketRecord, CrashRecord
from .mutator import ModbusMutator, MutatedPacket
from .monitor import PLCHealthMonitor, DeviceStatus


class FuzzerStatus(Enum):
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    STOPPED = "stopped"
    COMPLETED = "completed"
    ERROR = "error"


class ModbusFuzzer:
    def __init__(self, task_id: int, target_config: Dict[str, Any], strategies: List[str]):
        self.task_id = task_id
        self.target_config = target_config
        self.strategies = strategies
        
        self.ip_address = target_config.get("ip_address")
        self.port = target_config.get("port", 502)
        self.slave_id = target_config.get("slave_id", 1)
        self.timeout = target_config.get("timeout", 5000) / 1000.0
        
        self.mutator = ModbusMutator(self.slave_id)
        self.monitor = PLCHealthMonitor(self.ip_address, self.port, self.slave_id, int(self.timeout * 1000))
        
        self.status = FuzzerStatus.IDLE
        self.packet_count = 0
        self.crash_count = 0
        self.crash_packets: List[Dict[str, Any]] = []
        self.recovery_count = 0
        
        self._thread: Optional[threading.Thread] = None
        self._pause_event = threading.Event()
        self._stop_event = threading.Event()
        
        self._callback: Optional[Callable[[str, Dict[str, Any]], None]] = None
        
        self._health_check_interval = 10
        self._last_health_check = 0
        
        self._send_interval = 0.1
        
        self._strategy_index = 0
        self._packets_per_strategy = 100
        self._current_strategy_packets = 0
        
        self._auto_recover = target_config.get("auto_recover", True)
        self._max_crashes = target_config.get("max_crashes", 5)
        self._recover_timeout = target_config.get("recover_timeout", 300)
        
        self.monitor.set_callbacks(
            on_crash=self._on_crash_detected,
            on_recover=self._on_device_recovered
        )

    def set_callback(self, callback: Callable[[str, Dict[str, Any]], None]):
        self._callback = callback

    def _emit(self, event: str, data: Dict[str, Any]):
        if self._callback:
            self._callback(event, data)

    def _on_crash_detected(self):
        self._emit("test:recovery", {
            "status": "crashed",
            "message": "设备检测异常，暂停测试进入恢复模式...",
            "crash_count": self.crash_count,
            "timestamp": datetime.utcnow().isoformat()
        })

    def _on_device_recovered(self):
        self.recovery_count += 1
        self._emit("test:recovery", {
            "status": "recovered",
            "message": f"设备已恢复！继续测试中... (恢复次数: {self.recovery_count})",
            "recovery_count": self.recovery_count,
            "timestamp": datetime.utcnow().isoformat()
        })

    def _hex_str_to_bytes(self, hex_str: str) -> bytes:
        return bytes.fromhex(hex_str.replace(' ', ''))

    def _bytes_to_hex(self, data: bytes) -> str:
        return ' '.join(f'{b:02X}' for b in data)

    def _send_packet(self, packet_bytes: bytes) -> Optional[bytes]:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(self.timeout)
                s.connect((self.ip_address, self.port))
                s.sendall(packet_bytes)
                response = s.recv(1024)
                return response
        except Exception:
            return None

    def _save_packet_record(self, direction: str, hex_data: str, function_code: int,
                            response_time_ms: Optional[int] = None, is_error: bool = False,
                            error_message: Optional[str] = None):
        try:
            db = SessionLocal()
            record = PacketRecord(
                task_id=self.task_id,
                direction=direction,
                hex_data=hex_data,
                function_code=function_code,
                response_time_ms=response_time_ms,
                is_error=is_error,
                error_message=error_message
            )
            db.add(record)
            db.commit()
            db.close()
        except Exception as e:
            print(f"保存报文记录失败: {e}")

    def _save_crash_record(self, packet_hex: str, description: str, severity: str = "high"):
        try:
            db = SessionLocal()
            record = CrashRecord(
                task_id=self.task_id,
                packet_hex=packet_hex,
                description=description,
                severity=severity,
                reproducible=False
            )
            db.add(record)
            db.commit()
            db.close()
        except Exception as e:
            print(f"保存崩溃记录失败: {e}")

    def _update_task_stats(self):
        try:
            db = SessionLocal()
            task = db.query(TestTask).filter(TestTask.id == self.task_id).first()
            if task:
                task.packet_count = self.packet_count
                task.crash_count = self.crash_count
                if self.status == FuzzerStatus.RUNNING:
                    task.status = "running"
                elif self.status == FuzzerStatus.PAUSED:
                    task.status = "paused"
                elif self.status == FuzzerStatus.COMPLETED:
                    task.status = "completed"
                    task.end_time = datetime.utcnow()
                elif self.status == FuzzerStatus.STOPPED:
                    task.status = "idle"
                    task.end_time = datetime.utcnow()
                db.commit()
            db.close()
        except Exception as e:
            print(f"更新任务状态失败: {e}")

    def _check_health(self) -> bool:
        crashed, message = self.monitor.is_crash_detected()
        if crashed:
            return True, message
        return False, ""

    def _get_next_strategy(self) -> Optional[str]:
        if not self.strategies:
            return None
        
        if len(self.strategies) == 1:
            return self.strategies[0]
        
        strategy = self.strategies[self._strategy_index]
        self._current_strategy_packets += 1
        
        if self._current_strategy_packets >= self._packets_per_strategy:
            self._current_strategy_packets = 0
            self._strategy_index = (self._strategy_index + 1) % len(self.strategies)
        
        return strategy

    def _handle_recovery(self) -> bool:
        if not self.monitor.is_in_recovery():
            return True
        
        if not self._auto_recover:
            self._emit("test:recovery", {
                "status": "manual_required",
                "message": "设备无响应，自动恢复已禁用，需手动干预",
                "timestamp": datetime.utcnow().isoformat()
            })
            self.stop()
            return False
        
        recovered, msg = self.monitor.attempt_recovery()
        self._emit("test:recovery", {
            "status": "recovering" if not recovered else "recovered",
            "message": msg,
            "recovery_attempts": self.monitor.get_recovery_status().recovery_attempts,
            "crash_duration": int(self.monitor.get_crash_duration()),
            "timestamp": datetime.utcnow().isoformat()
        })
        
        if not recovered:
            crash_duration = self.monitor.get_crash_duration()
            if crash_duration > self._recover_timeout:
                self._emit("test:recovery", {
                    "status": "timeout",
                    "message": f"恢复超时（{int(crash_duration)}秒），设备可能需要手动重启",
                    "timestamp": datetime.utcnow().isoformat()
                })
                self.stop()
                return False
            return False
        
        return True

    def _fuzzing_loop(self):
        self._pause_event.set()
        
        while not self._stop_event.is_set():
            self._pause_event.wait()
            
            if self._stop_event.is_set():
                break
            
            try:
                if self.monitor.is_in_recovery():
                    if not self._handle_recovery():
                        time.sleep(1)
                        continue
                    time.sleep(1)
                
                strategy_id = self._get_next_strategy()
                mutated_packet = self.mutator.generate_mutation(strategy_id=strategy_id)
                
                packet_bytes = self._hex_str_to_bytes(mutated_packet.hex_data)
                
                start_time = time.time()
                response = self._send_packet(packet_bytes)
                response_time_ms = int((time.time() - start_time) * 1000)
                
                self.packet_count += 1
                
                is_error = response is None
                error_msg = None if response else "无响应"
                
                self._save_packet_record(
                    direction="sent",
                    hex_data=mutated_packet.hex_data,
                    function_code=mutated_packet.function_code,
                    is_error=is_error,
                    error_message=error_msg
                )
                
                if response:
                    self._save_packet_record(
                        direction="received",
                        hex_data=self._bytes_to_hex(response),
                        function_code=response[7] if len(response) > 7 else 0,
                        response_time_ms=response_time_ms
                    )
                
                packet_data = {
                    "id": self.packet_count,
                    "timestamp": datetime.utcnow().isoformat(),
                    "direction": "sent",
                    "hex_data": mutated_packet.hex_data,
                    "function_code": mutated_packet.function_code,
                    "description": mutated_packet.description,
                    "strategy": mutated_packet.strategy,
                    "response_time_ms": response_time_ms,
                    "has_response": response is not None
                }
                self._emit("test:packet", packet_data)
                
                if self.packet_count % self._health_check_interval == 0:
                    health_result = self.monitor.check_health()
                    if health_result.status in [DeviceStatus.CRASHED, DeviceStatus.RECOVERING]:
                        self.crash_count += 1
                        self._save_crash_record(mutated_packet.hex_data, health_result.message, "critical")
                        self.crash_packets.append({
                            "packet_hex": mutated_packet.hex_data,
                            "description": health_result.message,
                            "timestamp": datetime.utcnow().isoformat()
                        })
                        self._emit("test:crash", {
                            "packet_hex": mutated_packet.hex_data,
                            "description": health_result.message,
                            "timestamp": datetime.utcnow().isoformat(),
                            "severity": "critical"
                        })
                        
                        if self.crash_count >= self._max_crashes:
                            self._emit("test:recovery", {
                                "status": "max_crashes",
                                "message": f"达到最大崩溃次数({self._max_crashes})，停止测试",
                                "timestamp": datetime.utcnow().isoformat()
                            })
                            self.stop()
                            break
                
                if self.packet_count % 10 == 0:
                    self._update_task_stats()
                    self._emit("test:progress", {
                        "packet_count": self.packet_count,
                        "crash_count": self.crash_count,
                        "recovery_count": self.recovery_count,
                        "current_strategy": strategy_id
                    })
                
                time.sleep(self._send_interval)
                
            except Exception as e:
                print(f"模糊测试循环错误: {e}")
                time.sleep(0.5)
        
        self._update_task_stats()
        self._emit("test:status", {"status": self.status.value})

    def start(self) -> bool:
        if self.status == FuzzerStatus.RUNNING:
            return False
        
        try:
            db = SessionLocal()
            task = db.query(TestTask).filter(TestTask.id == self.task_id).first()
            if task:
                task.start_time = datetime.utcnow()
                task.status = "running"
                db.commit()
            db.close()
        except Exception as e:
            print(f"更新任务开始时间失败: {e}")
        
        self.status = FuzzerStatus.RUNNING
        self._stop_event.clear()
        self._pause_event.set()
        
        self._thread = threading.Thread(target=self._fuzzing_loop, daemon=True)
        self._thread.start()
        
        self._emit("test:status", {"status": "running"})
        return True

    def pause(self) -> bool:
        if self.status != FuzzerStatus.RUNNING:
            return False
        
        self.status = FuzzerStatus.PAUSED
        self._pause_event.clear()
        self._emit("test:status", {"status": "paused"})
        return True

    def resume(self) -> bool:
        if self.status != FuzzerStatus.PAUSED:
            return False
        
        self.status = FuzzerStatus.RUNNING
        self._pause_event.set()
        self._emit("test:status", {"status": "running"})
        return True

    def stop(self) -> bool:
        if self.status not in [FuzzerStatus.RUNNING, FuzzerStatus.PAUSED]:
            return False
        
        self.status = FuzzerStatus.STOPPED
        self._stop_event.set()
        self._pause_event.set()
        
        if self._thread:
            self._thread.join(timeout=2.0)
        
        self._emit("test:status", {"status": "stopped"})
        return True

    def get_status(self) -> Dict[str, Any]:
        recovery_status = self.monitor.get_recovery_status()
        return {
            "task_id": self.task_id,
            "status": self.status.value,
            "packet_count": self.packet_count,
            "crash_count": self.crash_count,
            "recovery_count": self.recovery_count,
            "crash_packets": self.crash_packets,
            "is_recovering": self.monitor.is_in_recovery(),
            "recovery_attempts": recovery_status.recovery_attempts,
            "crash_duration": int(self.monitor.get_crash_duration()),
            "current_strategy": self.strategies[self._strategy_index] if self.strategies else None,
            "strategies_enabled": self.strategies
        }


class FuzzerManager:
    _fuzzers: Dict[int, ModbusFuzzer] = {}

    def create_fuzzer(self, task_id: int, target_config: Dict[str, Any], strategies: List[str]) -> ModbusFuzzer:
        if task_id in self._fuzzers:
            self._fuzzers[task_id].stop()
        
        fuzzer = ModbusFuzzer(task_id, target_config, strategies)
        self._fuzzers[task_id] = fuzzer
        return fuzzer

    def get_fuzzer(self, task_id: int) -> Optional[ModbusFuzzer]:
        return self._fuzzers.get(task_id)

    def remove_fuzzer(self, task_id: int):
        if task_id in self._fuzzers:
            self._fuzzers[task_id].stop()
            del self._fuzzers[task_id]
