"""Unit tests for performance statistics and file lock detection.

Covers: PerformanceStats, LockDetector, LockInfo, and decorators.
"""

import os
import time
import tempfile
import pytest

from nfs4_client.stats import (
    PerformanceStats,
    OperationStats,
    LockDetector,
    LockInfo,
    LockStatus,
    _format_bytes,
)


class TestFormatBytes:
    """Tests for byte formatting helper."""

    def test_format_bytes_b(self):
        assert "100.00 B" in _format_bytes(100)
        assert "512" in _format_bytes(512)

    def test_format_bytes_kb(self):
        assert "KB" in _format_bytes(2048)

    def test_format_bytes_mb(self):
        assert "MB" in _format_bytes(1024 * 1024 * 5)

    def test_format_bytes_gb(self):
        assert "GB" in _format_bytes(1024 * 1024 * 1024 * 2)


class TestOperationStats:
    """Tests for OperationStats data class."""

    def test_initial_state(self):
        stats = OperationStats()
        assert stats.count == 0
        assert stats.total_time == 0.0
        assert stats.total_bytes == 0
        assert stats.errors == 0
        assert stats.min_time == float("inf")
        assert stats.max_time == 0.0

    def test_record_single(self):
        stats = OperationStats()
        stats.record(duration=0.1, bytes_transferred=100, error=False)

        assert stats.count == 1
        assert stats.total_time == 0.1
        assert stats.total_bytes == 100
        assert stats.errors == 0
        assert stats.min_time == 0.1
        assert stats.max_time == 0.1
        assert stats.avg_time == 0.1

    def test_record_multiple(self):
        stats = OperationStats()
        stats.record(duration=0.1, bytes_transferred=100)
        stats.record(duration=0.2, bytes_transferred=200)
        stats.record(duration=0.3, bytes_transferred=300)

        assert stats.count == 3
        assert stats.total_time == pytest.approx(0.6)
        assert stats.total_bytes == 600
        assert stats.min_time == 0.1
        assert stats.max_time == 0.3
        assert stats.avg_time == pytest.approx(0.2)

    def test_record_with_errors(self):
        stats = OperationStats()
        stats.record(duration=0.1, error=False)
        stats.record(duration=0.2, error=True)
        stats.record(duration=0.3, error=False)

        assert stats.count == 3
        assert stats.errors == 1

    def test_percentiles(self):
        stats = OperationStats()
        for i in range(100):
            stats.record(duration=0.01 * (i + 1))

        assert stats.p50_time > 0
        assert stats.p95_time > 0
        assert stats.p99_time > 0
        assert stats.p50_time <= stats.p95_time
        assert stats.p95_time <= stats.p99_time

    def test_throughput_calculation(self):
        stats = OperationStats()
        stats.record(duration=1.0, bytes_transferred=1_000_000)

        assert stats.total_bytes == 1_000_000
        assert stats.total_time == 1.0
        assert stats.throughput_bytes_per_sec == 1_000_000

    def test_to_dict(self):
        stats = OperationStats()
        stats.record(duration=0.1, bytes_transferred=1000)

        d = stats.to_dict()
        assert d["count"] == 1
        assert d["total_time_ms"] == 100.0
        assert d["avg_time_ms"] == 100.0
        assert d["total_bytes"] == 1000
        assert "throughput_mbps" in d


class TestPerformanceStats:
    """Tests for PerformanceStats class."""

    def test_initial_state(self):
        stats = PerformanceStats()
        assert stats.enabled is True
        assert stats.elapsed_time >= 0

    def test_start_timer(self):
        stats = PerformanceStats()
        stats.start()
        time.sleep(0.01)
        assert stats.elapsed_time > 0

    def test_measure_context_manager(self):
        stats = PerformanceStats()

        with stats.measure("test_op"):
            time.sleep(0.01)

        op_stats = stats.get("test_op")
        assert op_stats is not None
        assert op_stats.count == 1
        assert op_stats.total_time > 0

    def test_measure_with_bytes(self):
        stats = PerformanceStats()

        with stats.measure("read", bytes_transferred=1000):
            pass

        op_stats = stats.get("read")
        assert op_stats is not None
        assert op_stats.total_bytes == 1000

    def test_manual_record(self):
        stats = PerformanceStats()
        stats.record("test_op", duration=0.1, bytes_transferred=500, error=False)

        op_stats = stats.get("test_op")
        assert op_stats is not None
        assert op_stats.count == 1
        assert op_stats.total_time == 0.1

    def test_disable_enable(self):
        stats = PerformanceStats()
        stats.disable()
        assert stats.enabled is False

        with stats.measure("test_op"):
            pass

        assert stats.get("test_op") is None

        stats.enable()
        assert stats.enabled is True

    def test_reset(self):
        stats = PerformanceStats()
        stats.record("test_op", duration=0.1)

        stats.reset()
        assert stats.get("test_op") is None or stats.get("test_op").count == 0

    def test_get_all(self):
        stats = PerformanceStats()
        stats.record("op1", duration=0.1)
        stats.record("op2", duration=0.2)

        all_stats = stats.get_all()
        assert "op1" in all_stats
        assert "op2" in all_stats

    def test_summary(self):
        stats = PerformanceStats()
        stats.record("op1", duration=0.1, bytes_transferred=100)
        stats.record("op2", duration=0.2, bytes_transferred=200)

        summary = stats.summary()
        assert summary["enabled"] is True
        assert "elapsed_time_sec" in summary
        assert "operations" in summary
        assert "totals" in summary
        assert summary["totals"]["total_count"] == 2
        assert summary["totals"]["total_bytes"] == 300

    def test_format_summary(self):
        stats = PerformanceStats()
        stats.record("listdir", duration=0.05)
        stats.record("read_file", duration=0.1, bytes_transferred=10000)

        output = stats.format_summary("Test Summary")
        assert "Test Summary" in output
        assert "listdir" in output
        assert "read_file" in output
        assert "Count" in output
        assert "Avg(ms)" in output

    def test_error_recording(self):
        stats = PerformanceStats()

        try:
            with stats.measure("failing_op"):
                raise ValueError("test error")
        except ValueError:
            pass

        op_stats = stats.get("failing_op")
        assert op_stats is not None
        assert op_stats.errors == 1

    def test_max_history_truncation(self):
        stats = PerformanceStats(max_history=100)
        for i in range(200):
            stats.record("test_op", duration=0.001)

        op_stats = stats.get("test_op")
        assert op_stats is not None
        assert len(op_stats.times) <= 100


class TestLockStatus:
    """Tests for LockStatus class."""

    def test_lock_status_values(self):
        assert LockStatus.UNLOCKED == "unlocked"
        assert LockStatus.LOCKED_READ == "locked_read"
        assert LockStatus.LOCKED_WRITE == "locked_write"
        assert LockStatus.UNKNOWN == "unknown"


class TestLockInfo:
    """Tests for LockInfo data class."""

    def test_unlocked_file(self):
        info = LockInfo(path="/test/file.txt", status=LockStatus.UNLOCKED)
        assert info.path == "/test/file.txt"
        assert info.is_locked is False
        assert info.is_write_locked is False

    def test_write_locked_file(self):
        info = LockInfo(path="/test/file.txt", status=LockStatus.LOCKED_WRITE)
        assert info.is_locked is True
        assert info.is_write_locked is True

    def test_read_locked_file(self):
        info = LockInfo(path="/test/file.txt", status=LockStatus.LOCKED_READ)
        assert info.is_locked is True
        assert info.is_write_locked is False

    def test_full_info(self):
        info = LockInfo(
            path="/test/file.txt",
            status=LockStatus.LOCKED_WRITE,
            lock_type="exclusive",
            owner_pid=1234,
            owner_host="client.example.com",
            offset=0,
            length=1024,
        )
        assert info.lock_type == "exclusive"
        assert info.owner_pid == 1234
        assert info.owner_host == "client.example.com"
        assert info.offset == 0
        assert info.length == 1024

    def test_to_dict(self):
        info = LockInfo(
            path="/test/file.txt",
            status=LockStatus.LOCKED_WRITE,
            lock_type="exclusive",
            owner_pid=1234,
        )
        d = info.to_dict()
        assert d["path"] == "/test/file.txt"
        assert d["status"] == "locked_write"
        assert d["is_locked"] is True
        assert d["is_write_locked"] is True
        assert d["lock_type"] == "exclusive"
        assert d["owner_pid"] == 1234

    def test_detected_at_timestamp(self):
        info = LockInfo(path="/test/file.txt", status=LockStatus.UNLOCKED)
        assert info.detected_at > 0
        assert isinstance(info.detected_at, float)


class TestLockDetector:
    """Tests for LockDetector class."""

    def test_initialization(self):
        detector = LockDetector(timeout=2.0)
        assert detector is not None

    def test_check_lock_nonexistent_file(self):
        detector = LockDetector()
        info = detector.check_lock("/nonexistent/path/file.txt")
        assert info.path == "/nonexistent/path/file.txt"
        assert info.status in ("unlocked", "unknown")

    def test_check_lock_directory(self):
        detector = LockDetector()
        with tempfile.TemporaryDirectory() as tmpdir:
            info = detector.check_lock(tmpdir)
            assert info.path == tmpdir
            assert info.status == "unlocked"

    def test_can_read_regular_file(self):
        detector = LockDetector()
        with tempfile.NamedTemporaryFile() as f:
            assert detector.can_read(f.name) is True

    def test_can_write_regular_file(self):
        detector = LockDetector()
        with tempfile.NamedTemporaryFile() as f:
            assert detector.can_write(f.name) is True

    def test_batch_check(self):
        detector = LockDetector()
        with tempfile.TemporaryDirectory() as tmpdir:
            file1 = os.path.join(tmpdir, "file1.txt")
            file2 = os.path.join(tmpdir, "file2.txt")

            with open(file1, "w") as f:
                f.write("test1")
            with open(file2, "w") as f:
                f.write("test2")

            results = detector.batch_check([file1, file2])
            assert len(results) == 2
            assert file1 in results
            assert file2 in results


class TestPerformanceStatsContext:
    """Tests for PerformanceStats context manager behavior."""

    def test_nested_measure(self):
        stats = PerformanceStats()

        with stats.measure("outer"):
            time.sleep(0.01)
            with stats.measure("inner"):
                time.sleep(0.01)

        assert stats.get("outer") is not None
        assert stats.get("inner") is not None
        assert stats.get("outer").total_time >= stats.get("inner").total_time

    def test_measure_exception_propagation(self):
        stats = PerformanceStats()

        with pytest.raises(ValueError):
            with stats.measure("test_op"):
                raise ValueError("test")

        op_stats = stats.get("test_op")
        assert op_stats is not None
        assert op_stats.errors == 1
