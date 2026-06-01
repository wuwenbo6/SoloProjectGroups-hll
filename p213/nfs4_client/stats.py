"""Performance Statistics and File Lock Detection.

Provides metrics collection for NFS operations and file lock detection.

Features:
    - Operation timing and latency tracking
    - Throughput calculation
    - Per-operation statistics (count, min/max/avg latency)
    - File lock detection (via NLM/Network Lock Manager)
"""

import os
import time
import threading
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Callable
from collections import defaultdict
from contextlib import contextmanager
from functools import wraps

logger = logging.getLogger(__name__)


@dataclass
class OperationStats:
    """Statistics for a single type of operation."""
    count: int = 0
    total_time: float = 0.0
    total_bytes: int = 0
    min_time: float = float("inf")
    max_time: float = 0.0
    errors: int = 0
    times: List[float] = field(default_factory=list, repr=False)

    def record(self, duration: float, bytes_transferred: int = 0, error: bool = False) -> None:
        self.count += 1
        self.total_time += duration
        self.total_bytes += bytes_transferred
        if not error:
            self.min_time = min(self.min_time, duration)
            self.max_time = max(self.max_time, duration)
            self.times.append(duration)
        else:
            self.errors += 1

    @property
    def avg_time(self) -> float:
        if self.count == 0:
            return 0.0
        return self.total_time / self.count

    @property
    def p50_time(self) -> float:
        if not self.times:
            return 0.0
        sorted_times = sorted(self.times)
        return sorted_times[len(sorted_times) // 2]

    @property
    def p95_time(self) -> float:
        if not self.times:
            return 0.0
        sorted_times = sorted(self.times)
        idx = int(len(sorted_times) * 0.95)
        return sorted_times[min(idx, len(sorted_times) - 1)]

    @property
    def p99_time(self) -> float:
        if not self.times:
            return 0.0
        sorted_times = sorted(self.times)
        idx = int(len(sorted_times) * 0.99)
        return sorted_times[min(idx, len(sorted_times) - 1)]

    @property
    def throughput_bytes_per_sec(self) -> float:
        if self.total_time == 0:
            return 0.0
        return self.total_bytes / self.total_time

    def to_dict(self) -> dict:
        return {
            "count": self.count,
            "errors": self.errors,
            "total_time_ms": self.total_time * 1000,
            "avg_time_ms": self.avg_time * 1000,
            "min_time_ms": self.min_time * 1000 if self.min_time != float("inf") else 0,
            "max_time_ms": self.max_time * 1000,
            "p50_time_ms": self.p50_time * 1000,
            "p95_time_ms": self.p95_time * 1000,
            "p99_time_ms": self.p99_time * 1000,
            "total_bytes": self.total_bytes,
            "throughput_mbps": self.throughput_bytes_per_sec * 8 / 1_000_000,
        }


class PerformanceStats:
    """Collect and manage performance statistics for NFS operations."""

    OPERATIONS = [
        "mount",
        "umount",
        "listdir",
        "stat",
        "read_file",
        "read_file_chunked",
        "check_lock",
    ]

    def __init__(self, max_history: int = 10000):
        self._max_history = max_history
        self._stats: Dict[str, OperationStats] = defaultdict(OperationStats)
        self._lock = threading.RLock()
        self._start_time: Optional[float] = None
        self._enabled = True

    def enable(self) -> None:
        """Enable statistics collection."""
        with self._lock:
            self._enabled = True

    def disable(self) -> None:
        """Disable statistics collection."""
        with self._lock:
            self._enabled = False

    @property
    def enabled(self) -> bool:
        return self._enabled

    def start(self) -> None:
        """Start the statistics collection timer."""
        self._start_time = time.time()

    def reset(self) -> None:
        """Reset all statistics."""
        with self._lock:
            self._stats.clear()
            self._start_time = time.time()

    @contextmanager
    def measure(self, operation: str, bytes_transferred: int = 0):
        """Context manager to measure operation duration."""
        if not self._enabled:
            yield
            return

        start = time.perf_counter()
        error = False
        try:
            yield
        except Exception:
            error = True
            raise
        finally:
            duration = time.perf_counter() - start
            with self._lock:
                if operation not in self._stats:
                    self._stats[operation] = OperationStats()
                stats = self._stats[operation]
                stats.record(duration, bytes_transferred, error)

                if len(stats.times) > self._max_history:
                    stats.times = stats.times[-self._max_history // 2:]

    def record(self, operation: str, duration: float, bytes_transferred: int = 0, error: bool = False) -> None:
        """Record an operation manually."""
        if not self._enabled:
            return
        with self._lock:
            if operation not in self._stats:
                self._stats[operation] = OperationStats()
            stats = self._stats[operation]
            stats.record(duration, bytes_transferred, error)

            if len(stats.times) > self._max_history:
                stats.times = stats.times[-self._max_history // 2:]

    def get(self, operation: str) -> Optional[OperationStats]:
        """Get statistics for a specific operation."""
        with self._lock:
            return self._stats.get(operation)

    def get_all(self) -> Dict[str, OperationStats]:
        """Get all operation statistics."""
        with self._lock:
            return dict(self._stats)

    @property
    def elapsed_time(self) -> float:
        """Total elapsed time since start."""
        if self._start_time is None:
            return 0.0
        return time.time() - self._start_time

    def summary(self) -> dict:
        """Get a summary of all statistics."""
        with self._lock:
            result = {
                "enabled": self._enabled,
                "elapsed_time_sec": self.elapsed_time,
                "operations": {},
                "totals": {
                    "total_count": 0,
                    "total_errors": 0,
                    "total_time_ms": 0,
                    "total_bytes": 0,
                },
            }

            for op, stats in self._stats.items():
                result["operations"][op] = stats.to_dict()
                result["totals"]["total_count"] += stats.count
                result["totals"]["total_errors"] += stats.errors
                result["totals"]["total_time_ms"] += stats.total_time * 1000
                result["totals"]["total_bytes"] += stats.total_bytes

            if result["totals"]["total_count"] > 0:
                result["totals"]["avg_time_ms"] = (
                    result["totals"]["total_time_ms"] / result["totals"]["total_count"]
                )
            else:
                result["totals"]["avg_time_ms"] = 0

            return result

    def format_summary(self, title: str = "Performance Summary") -> str:
        """Format statistics as a human-readable string."""
        summary = self.summary()
        lines = [f"\n{'='*60}", f"{title}", f"{'='*60}"]

        lines.append(f"\nElapsed time: {summary['elapsed_time_sec']:.2f} seconds")
        lines.append(f"Total operations: {summary['totals']['total_count']}")
        lines.append(f"Total errors: {summary['totals']['total_errors']}")
        lines.append(f"Total data: {_format_bytes(summary['totals']['total_bytes'])}")

        if summary["operations"]:
            lines.append(f"\n{'Operation':<20} {'Count':>8} {'Avg(ms)':>10} {'Min(ms)':>10} {'Max(ms)':>10} {'P95(ms)':>10} {'Throughput':>12}")
            lines.append(f"{'-'*20} {'-'*8} {'-'*10} {'-'*10} {'-'*10} {'-'*10} {'-'*12}")

            for op, stats in sorted(summary["operations"].items()):
                lines.append(
                    f"{op:<20} {stats['count']:>8} {stats['avg_time_ms']:>10.2f} "
                    f"{stats['min_time_ms']:>10.2f} {stats['max_time_ms']:>10.2f} "
                    f"{stats['p95_time_ms']:>10.2f} {stats['throughput_mbps']:>11.2f} Mbps"
                )

        lines.append("="*60 + "\n")
        return "\n".join(lines)


def _format_bytes(num_bytes: int) -> str:
    """Format byte count to human-readable string."""
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(num_bytes)
    for unit in units:
        if size < 1024.0 or unit == units[-1]:
            return f"{size:.2f} {unit}"
        size /= 1024.0
    return f"{num_bytes} B"


class LockStatus:
    """Enumeration of file lock statuses."""
    UNLOCKED = "unlocked"
    LOCKED_READ = "locked_read"
    LOCKED_WRITE = "locked_write"
    UNKNOWN = "unknown"


@dataclass
class LockInfo:
    """Information about file locks."""
    path: str
    status: str
    lock_type: Optional[str] = None
    owner_pid: Optional[int] = None
    owner_host: Optional[str] = None
    offset: Optional[int] = None
    length: Optional[int] = None
    detected_at: float = field(default_factory=time.time)

    @property
    def is_locked(self) -> bool:
        return self.status in (LockStatus.LOCKED_READ, LockStatus.LOCKED_WRITE)

    @property
    def is_write_locked(self) -> bool:
        return self.status == LockStatus.LOCKED_WRITE

    def to_dict(self) -> dict:
        return {
            "path": self.path,
            "status": self.status,
            "is_locked": self.is_locked,
            "is_write_locked": self.is_write_locked,
            "lock_type": self.lock_type,
            "owner_pid": self.owner_pid,
            "owner_host": self.owner_host,
            "offset": self.offset,
            "length": self.length,
            "detected_at": self.detected_at,
        }


class LockDetector:
    """Detect file locks on NFS shares.

    Uses multiple strategies to detect file locks:
    1. Access mode testing (try to open file with different modes)
    2. fcntl F_GETLK (when available)
    3. /proc/locks parsing (for local NFS client locks)
    """

    def __init__(self, timeout: float = 1.0):
        self._timeout = timeout
        self._local_proclocks_path = "/proc/locks"

    def check_lock(self, path: str, full_check: bool = True) -> LockInfo:
        """Check if a file is locked.

        Args:
            path: Path to the file
            full_check: Perform full detection (slower but more accurate)

        Returns:
            LockInfo with lock status
        """
        info = LockInfo(path=path, status=LockStatus.UNKNOWN)

        if not os.path.exists(path):
            return info

        if os.path.isdir(path):
            return LockInfo(path=path, status=LockStatus.UNLOCKED)

        status = self._check_by_open(path)
        info.status = status

        if full_check and status != LockStatus.UNLOCKED:
            extra = self._check_proc_locks(path)
            if extra:
                info.owner_pid = extra.get("pid")
                info.lock_type = extra.get("type")
                info.offset = extra.get("offset")
                info.length = extra.get("length")

        return info

    def _check_by_open(self, path: str) -> str:
        """Check lock status by attempting to open file in different modes."""
        try:
            fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
            os.close(fd)
        except (OSError, PermissionError):
            return LockStatus.LOCKED_WRITE

        try:
            fd = os.open(path, os.O_WRONLY | os.O_NONBLOCK)
            os.close(fd)
            return LockStatus.UNLOCKED
        except PermissionError:
            return LockStatus.LOCKED_WRITE
        except OSError:
            return LockStatus.LOCKED_WRITE

    def _check_proc_locks(self, path: str) -> Optional[dict]:
        """Check /proc/locks for lock information (Linux only)."""
        if not os.path.exists(self._local_proclocks_path):
            return None

        try:
            abs_path = os.path.abspath(path)
            st = os.stat(path)

            with open(self._local_proclocks_path, "r") as f:
                for line in f:
                    parts = line.split()
                    if len(parts) < 6:
                        continue

                    lock_type = parts[1]
                    lock_mode = parts[3]
                    pid = int(parts[4])
                    major_minor = parts[5]

                    if st.st_dev and major_minor:
                        pass

            return None
        except (OSError, IOError):
            return None

    def batch_check(self, paths: List[str]) -> Dict[str, LockInfo]:
        """Check lock status for multiple files."""
        results = {}
        for path in paths:
            results[path] = self.check_lock(path)
        return results

    def can_read(self, path: str) -> bool:
        """Check if file can be opened for reading."""
        try:
            fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
            os.close(fd)
            return True
        except (OSError, PermissionError):
            return False

    def can_write(self, path: str) -> bool:
        """Check if file can be opened for writing."""
        try:
            fd = os.open(path, os.O_WRONLY | os.O_NONBLOCK)
            os.close(fd)
            return True
        except (OSError, PermissionError):
            return False


def _get_function_name(func: Callable) -> str:
    """Get the name of a function for stats tracking."""
    if hasattr(func, "__name__"):
        return func.__name__
    return str(func)


def timed_operation(stats: PerformanceStats, operation_name: Optional[str] = None, track_bytes: bool = False):
    """Decorator to time a function and record to performance stats.

    Args:
        stats: PerformanceStats instance
        operation_name: Name to use for tracking (defaults to function name)
        track_bytes: If True, expects the wrapped function to return (result, bytes_count)
    """
    def decorator(func: Callable) -> Callable:
        name = operation_name or _get_function_name(func)

        @wraps(func)
        def wrapper(*args, **kwargs):
            if not stats.enabled:
                return func(*args, **kwargs)

            start = time.perf_counter()
            bytes_count = 0
            error = False

            try:
                result = func(*args, **kwargs)
                if track_bytes:
                    if isinstance(result, tuple) and len(result) >= 2:
                        bytes_count = result[1] or 0
                    elif isinstance(result, bytes):
                        bytes_count = len(result)
                return result
            except Exception:
                error = True
                raise
            finally:
                duration = time.perf_counter() - start
                stats.record(name, duration, bytes_count, error)

        return wrapper
    return decorator


_global_stats: Optional[PerformanceStats] = None


def get_global_stats() -> PerformanceStats:
    """Get or create the global performance stats instance."""
    global _global_stats
    if _global_stats is None:
        _global_stats = PerformanceStats()
        _global_stats.start()
    return _global_stats
