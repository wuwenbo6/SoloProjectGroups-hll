import time
from dataclasses import dataclass


@dataclass
class TokenBucketStats:
    total_tokens_available: int
    total_packets_passed: int
    total_packets_dropped: int
    total_bytes_passed: int
    total_bytes_dropped: int


class TokenBucket:
    def __init__(self, rate_mbps: float = 10.0, burst_size: int = 10000):
        self.rate_mbps = rate_mbps
        self.rate_bps = rate_mbps * 1_000_000 / 8
        self.burst_size = burst_size
        self._tokens = float(burst_size)
        self.last_update = time.time()

        self.stats_passed = 0
        self.stats_dropped = 0
        self.stats_bytes_passed = 0
        self.stats_bytes_dropped = 0

    @property
    def tokens(self) -> int:
        self._refill()
        return int(self._tokens)

    @property
    def tokens_raw(self) -> float:
        return self._tokens

    def _refill(self):
        now = time.time()
        elapsed = now - self.last_update
        if elapsed > 0:
            new_tokens = elapsed * self.rate_bps
            self._tokens = min(self.burst_size, self._tokens + new_tokens)
            self.last_update = now

    def consume(self, packet_size: int) -> bool:
        self._refill()
        if self._tokens >= packet_size:
            self._tokens -= packet_size
            self.stats_passed += 1
            self.stats_bytes_passed += packet_size
            return True
        else:
            self.stats_dropped += 1
            self.stats_bytes_dropped += packet_size
            return False

    def can_consume(self, packet_size: int) -> bool:
        self._refill()
        return self._tokens >= packet_size

    def get_stats(self) -> TokenBucketStats:
        self._refill()
        return TokenBucketStats(
            total_tokens_available=self.tokens,
            total_packets_passed=self.stats_passed,
            total_packets_dropped=self.stats_dropped,
            total_bytes_passed=self.stats_bytes_passed,
            total_bytes_dropped=self.stats_bytes_dropped
        )

    def reset(self):
        self._tokens = float(self.burst_size)
        self.last_update = time.time()
        self.stats_passed = 0
        self.stats_dropped = 0
        self.stats_bytes_passed = 0
        self.stats_bytes_dropped = 0

    def set_rate(self, rate_mbps: float):
        self.rate_mbps = rate_mbps
        self.rate_bps = rate_mbps * 1_000_000 / 8
