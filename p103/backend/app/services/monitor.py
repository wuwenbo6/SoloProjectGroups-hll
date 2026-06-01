import socket
import time
import struct
import threading
from typing import Optional, Tuple, Callable
from dataclasses import dataclass
from enum import Enum


class DeviceStatus(Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    UNRESPONSIVE = "unresponsive"
    RECOVERED = "recovered"
    CRASHED = "crashed"
    RECOVERING = "recovering"


@dataclass
class HealthCheckResult:
    status: DeviceStatus
    response_time_ms: Optional[int]
    message: str
    timestamp: float
    consecutive_failures: int = 0


@dataclass
class RecoveryStatus:
    is_recovering: bool
    crash_time: Optional[float]
    recovery_attempts: int
    last_attempt_time: Optional[float]
    estimated_recovery_time: Optional[float]


class PLCHealthMonitor:
    def __init__(self, ip_address: str, port: int = 502, slave_id: int = 1, timeout: int = 5000):
        self.ip_address = ip_address
        self.port = port
        self.slave_id = slave_id
        self.timeout = timeout / 1000.0
        self._transaction_id = 0
        self._consecutive_failures = 0
        self._failure_threshold = 3
        self._last_status = DeviceStatus.ONLINE
        
        self._recovery_status = RecoveryStatus(
            is_recovering=False,
            crash_time=None,
            recovery_attempts=0,
            last_attempt_time=None,
            estimated_recovery_time=None
        )
        
        self._max_recovery_attempts = 30
        self._recovery_interval = 10
        self._recovery_timeout = 300
        
        self._on_crash_callback: Optional[Callable[[], None]] = None
        self._on_recover_callback: Optional[Callable[[], None]] = None

    def _get_next_tid(self) -> int:
        self._transaction_id = (self._transaction_id + 1) % 0x10000
        return self._transaction_id

    def _build_modbus_request(self, function_code: int = 0x03, address: int = 0, quantity: int = 1) -> bytes:
        tid = self._get_next_tid()
        mbap = struct.pack('>HHH', tid, 0, 6)
        pdu = struct.pack('>BBHH', self.slave_id, function_code, address, quantity)
        return mbap + pdu

    def check_tcp_connection(self) -> HealthCheckResult:
        start_time = time.time()
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(self.timeout)
                s.connect((self.ip_address, self.port))
                response_time = int((time.time() - start_time) * 1000)
                return HealthCheckResult(
                    status=DeviceStatus.ONLINE,
                    response_time_ms=response_time,
                    message=f"TCP连接成功，端口{self.port}开放",
                    timestamp=time.time()
                )
        except socket.timeout:
            return HealthCheckResult(
                status=DeviceStatus.UNRESPONSIVE,
                response_time_ms=None,
                message="TCP连接超时",
                timestamp=time.time()
            )
        except ConnectionRefusedError:
            return HealthCheckResult(
                status=DeviceStatus.OFFLINE,
                response_time_ms=None,
                message="连接被拒绝，端口可能未开放",
                timestamp=time.time()
            )
        except Exception as e:
            return HealthCheckResult(
                status=DeviceStatus.OFFLINE,
                response_time_ms=None,
                message=f"TCP连接错误: {str(e)}",
                timestamp=time.time()
            )

    def check_modbus_protocol(self) -> HealthCheckResult:
        start_time = time.time()
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(self.timeout)
                s.connect((self.ip_address, self.port))
                
                request = self._build_modbus_request(0x03, 0, 1)
                s.sendall(request)
                
                response = s.recv(1024)
                response_time = int((time.time() - start_time) * 1000)
                
                if len(response) >= 9:
                    mbap_header = response[:7]
                    tid, pid, length = struct.unpack('>HHH', mbap_header)
                    function_code = response[7]
                    
                    if function_code & 0x80:
                        exception_code = response[8]
                        return HealthCheckResult(
                            status=DeviceStatus.ONLINE,
                            response_time_ms=response_time,
                            message=f"Modbus异常响应 (异常码: 0x{exception_code:02X})",
                            timestamp=time.time()
                        )
                    else:
                        return HealthCheckResult(
                            status=DeviceStatus.ONLINE,
                            response_time_ms=response_time,
                            message=f"Modbus正常响应，功能码 0x{function_code:02X}",
                            timestamp=time.time()
                        )
                else:
                    return HealthCheckResult(
                        status=DeviceStatus.UNRESPONSIVE,
                        response_time_ms=response_time,
                        message=f"响应过短，仅{len(response)}字节",
                        timestamp=time.time()
                    )
                    
        except socket.timeout:
            return HealthCheckResult(
                status=DeviceStatus.UNRESPONSIVE,
                response_time_ms=None,
                message="Modbus协议响应超时",
                timestamp=time.time()
            )
        except Exception as e:
            return HealthCheckResult(
                status=DeviceStatus.OFFLINE,
                response_time_ms=None,
                message=f"Modbus通信错误: {str(e)}",
                timestamp=time.time()
            )

    def check_health(self) -> HealthCheckResult:
        if self._recovery_status.is_recovering:
            return HealthCheckResult(
                status=DeviceStatus.RECOVERING,
                response_time_ms=None,
                message=f"设备恢复中... 已尝试{self._recovery_status.recovery_attempts}次",
                timestamp=time.time(),
                consecutive_failures=self._consecutive_failures
            )

        tcp_result = self.check_tcp_connection()
        
        if tcp_result.status != DeviceStatus.ONLINE:
            self._consecutive_failures += 1
            if self._consecutive_failures >= self._failure_threshold:
                self._last_status = DeviceStatus.OFFLINE
                self.enter_recovery_mode()
                tcp_result.status = DeviceStatus.CRASHED
                tcp_result.message = f"设备疑似崩溃！连续{self._consecutive_failures}次检测失败"
            tcp_result.consecutive_failures = self._consecutive_failures
            return tcp_result
        
        modbus_result = self.check_modbus_protocol()
        
        if modbus_result.status == DeviceStatus.ONLINE:
            if self._consecutive_failures > 0:
                self._consecutive_failures = 0
                if self._last_status in [DeviceStatus.OFFLINE, DeviceStatus.CRASHED]:
                    modbus_result.status = DeviceStatus.RECOVERED
                    modbus_result.message = "设备已恢复在线"
            self._last_status = DeviceStatus.ONLINE
        else:
            self._consecutive_failures += 1
            if self._consecutive_failures >= self._failure_threshold:
                self._last_status = DeviceStatus.CRASHED
                self.enter_recovery_mode()
                modbus_result.status = DeviceStatus.CRASHED
                modbus_result.message = f"Modbus协议无响应！连续{self._consecutive_failures}次失败"
        
        modbus_result.consecutive_failures = self._consecutive_failures
        return modbus_result

    def test_connection(self) -> Tuple[bool, str, Optional[int]]:
        result = self.check_health()
        return (
            result.status in [DeviceStatus.ONLINE, DeviceStatus.RECOVERED],
            result.message,
            result.response_time_ms
        )

    def is_crash_detected(self) -> Tuple[bool, str]:
        result = self.check_health()
        if result.status in [DeviceStatus.OFFLINE, DeviceStatus.UNRESPONSIVE]:
            return True, result.message
        return False, ""

    def reset_failure_counter(self):
        self._consecutive_failures = 0
        self._last_status = DeviceStatus.ONLINE

    def set_callbacks(self, on_crash: Optional[Callable[[], None]] = None, 
                     on_recover: Optional[Callable[[], None]] = None):
        self._on_crash_callback = on_crash
        self._on_recover_callback = on_recover

    def enter_recovery_mode(self):
        self._recovery_status.is_recovering = True
        self._recovery_status.crash_time = time.time()
        self._recovery_status.recovery_attempts = 0
        self._recovery_status.last_attempt_time = None
        self._last_status = DeviceStatus.CRASHED
        if self._on_crash_callback:
            self._on_crash_callback()

    def exit_recovery_mode(self, recovered: bool = True):
        self._recovery_status.is_recovering = False
        if recovered:
            self._consecutive_failures = 0
            self._last_status = DeviceStatus.RECOVERED
            if self._on_recover_callback:
                self._on_recover_callback()

    def get_recovery_status(self) -> RecoveryStatus:
        return self._recovery_status

    def attempt_recovery(self) -> Tuple[bool, str]:
        if not self._recovery_status.is_recovering:
            return True, "未处于恢复模式"

        self._recovery_status.recovery_attempts += 1
        self._recovery_status.last_attempt_time = time.time()

        elapsed_time = time.time() - self._recovery_status.crash_time
        if elapsed_time > self._recovery_timeout:
            return False, f"恢复超时（已等待{int(elapsed_time)}秒），设备可能需要手动重启"

        if self._recovery_status.recovery_attempts > self._max_recovery_attempts:
            return False, f"超过最大恢复尝试次数({self._max_recovery_attempts})"

        tcp_result = self.check_tcp_connection()
        if tcp_result.status != DeviceStatus.ONLINE:
            time.sleep(self._recovery_interval)
            return False, f"TCP连接仍失败（尝试{self._recovery_status.recovery_attempts}/{self._max_recovery_attempts}）"

        modbus_result = self.check_modbus_protocol()
        if modbus_result.status == DeviceStatus.ONLINE:
            self.exit_recovery_mode(True)
            return True, f"设备已恢复！恢复用时：{int(elapsed_time)}秒"

        time.sleep(self._recovery_interval)
        return False, f"Modbus协议未恢复（尝试{self._recovery_status.recovery_attempts}/{self._max_recovery_attempts}）"

    def is_in_recovery(self) -> bool:
        return self._recovery_status.is_recovering

    def get_crash_duration(self) -> float:
        if self._recovery_status.crash_time:
            return time.time() - self._recovery_status.crash_time
        return 0.0
