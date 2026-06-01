import time
import random
import json
import threading
import csv
import io
from datetime import datetime
from collections import deque
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
from enum import Enum


BLOCK_SIZE = 1 * 1024 * 1024

SLIDING_WINDOW_SECONDS = 3600


class TierType(Enum):
    SSD = "ssd"
    SAS = "sas"
    SATA = "sata"


class MigrationState(Enum):
    IDLE = "idle"
    COPYING = "copying"
    SWITCHING = "switching"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class AccessEvent:
    block_id: str
    timestamp: float


@dataclass
class Block:
    id: str
    size: int
    tier_type: TierType
    preferred_tier: Optional[TierType] = None
    access_events: deque = field(default_factory=lambda: deque())
    heat_score: float = 0.0
    total_access_count: int = 0
    last_access_time: float = 0.0

    def access(self):
        now = time.time()
        self.access_events.append(AccessEvent(block_id=self.id, timestamp=now))
        self.total_access_count += 1
        self.last_access_time = now

    def window_access_count(self, window_seconds: float = SLIDING_WINDOW_SECONDS) -> int:
        cutoff = time.time() - window_seconds
        while self.access_events and self.access_events[0].timestamp < cutoff:
            self.access_events.popleft()
        return len(self.access_events)


@dataclass
class MigrationTask:
    block_id: str
    from_tier: TierType
    to_tier: TierType
    state: MigrationState = MigrationState.IDLE
    start_time: float = 0.0
    copy_complete_time: float = 0.0
    switch_complete_time: float = 0.0
    block_size: int = 0

    def to_dict(self) -> dict:
        return {
            "block_id": self.block_id,
            "from_tier": self.from_tier.value,
            "to_tier": self.to_tier.value,
            "state": self.state.value,
            "start_time": self.start_time,
            "copy_complete_time": self.copy_complete_time,
            "switch_complete_time": self.switch_complete_time,
            "block_size": self.block_size
        }


@dataclass
class StorageTier:
    tier_type: TierType
    name: str
    total_capacity: int
    used_capacity: int = 0
    blocks: Dict[str, Block] = field(default_factory=dict)

    def available_capacity(self) -> int:
        return self.total_capacity - self.used_capacity

    def add_block(self, block: Block) -> bool:
        if block.size > self.available_capacity():
            return False
        self.blocks[block.id] = block
        self.used_capacity += block.size
        block.tier_type = self.tier_type
        return True

    def remove_block(self, block_id: str) -> Optional[Block]:
        if block_id not in self.blocks:
            return None
        block = self.blocks.pop(block_id)
        self.used_capacity -= block.size
        return block

    def get_block(self, block_id: str) -> Optional[Block]:
        return self.blocks.get(block_id)

    def to_dict(self) -> dict:
        total_window_access = sum(
            b.window_access_count() for b in self.blocks.values()
        )
        return {
            "type": self.tier_type.value,
            "name": self.name,
            "total_capacity": self.total_capacity,
            "used_capacity": self.used_capacity,
            "available_capacity": self.available_capacity(),
            "block_count": len(self.blocks),
            "total_access_count": sum(b.total_access_count for b in self.blocks.values()),
            "window_access_count": total_window_access
        }


@dataclass
class MigrationStats:
    total_migrations: int = 0
    ssd_to_sas: int = 0
    ssd_to_sata: int = 0
    sas_to_ssd: int = 0
    sas_to_sata: int = 0
    sata_to_ssd: int = 0
    sata_to_sas: int = 0
    last_migration_time: float = 0.0
    copy_migrations: int = 0
    active_migrations: int = 0

    def record_migration(self, from_tier: TierType, to_tier: TierType):
        self.total_migrations += 1
        self.copy_migrations += 1
        self.last_migration_time = time.time()
        key = f"{from_tier.value}_to_{to_tier.value}"
        if hasattr(self, key):
            setattr(self, key, getattr(self, key) + 1)

    def to_dict(self) -> dict:
        return {
            "total_migrations": self.total_migrations,
            "ssd_to_sas": self.ssd_to_sas,
            "ssd_to_sata": self.ssd_to_sata,
            "sas_to_ssd": self.sas_to_ssd,
            "sas_to_sata": self.sas_to_sata,
            "sata_to_ssd": self.sata_to_ssd,
            "sata_to_sas": self.sata_to_sas,
            "last_migration_time": self.last_migration_time,
            "copy_migrations": self.copy_migrations,
            "active_migrations": self.active_migrations
        }


class TieredStorageSimulator:
    def __init__(
        self,
        ssd_capacity: int = 100 * 1024 * 1024 * 1024,
        sas_capacity: int = 500 * 1024 * 1024 * 1024,
        sata_capacity: int = 2000 * 1024 * 1024 * 1024,
        heat_threshold_high: float = 0.7,
        heat_threshold_low: float = 0.3,
        window_seconds: float = SLIDING_WINDOW_SECONDS
    ):
        self.ssd = StorageTier(TierType.SSD, "SSD", ssd_capacity)
        self.sas = StorageTier(TierType.SAS, "SAS", sas_capacity)
        self.sata = StorageTier(TierType.SATA, "SATA", sata_capacity)
        self.heat_threshold_high = heat_threshold_high
        self.heat_threshold_low = heat_threshold_low
        self.window_seconds = window_seconds
        self.migration_stats = MigrationStats()
        self.all_blocks: Dict[str, Block] = {}
        self.start_time = time.time()
        self.migration_log: List[MigrationTask] = []
        self._lock = threading.Lock()

    def get_tier(self, tier_type: TierType) -> StorageTier:
        if tier_type == TierType.SSD:
            return self.ssd
        elif tier_type == TierType.SAS:
            return self.sas
        else:
            return self.sata

    def create_block(self, block_id: str, size: int = BLOCK_SIZE,
                     initial_tier: TierType = TierType.SATA,
                     preferred_tier: Optional[TierType] = None) -> bool:
        with self._lock:
            if block_id in self.all_blocks:
                return False
            block = Block(id=block_id, size=size, tier_type=initial_tier,
                          preferred_tier=preferred_tier)
            tier = self.get_tier(initial_tier)
            if tier.add_block(block):
                self.all_blocks[block_id] = block
                return True
            return False

    def access_block(self, block_id: str) -> bool:
        block = self.all_blocks.get(block_id)
        if block is None:
            return False
        block.access()
        return True

    def update_heat_scores(self):
        window_counts = {}
        max_window_count = 0
        for block in self.all_blocks.values():
            wc = block.window_access_count(self.window_seconds)
            window_counts[block.id] = wc
            if wc > max_window_count:
                max_window_count = wc

        for block in self.all_blocks.values():
            wc = window_counts[block.id]
            if max_window_count > 0:
                block.heat_score = wc / max_window_count
            else:
                block.heat_score = 0.0

    def migrate_block(self, block_id: str, target_tier_type: TierType) -> bool:
        with self._lock:
            block = self.all_blocks.get(block_id)
            if block is None:
                return False
            if block.tier_type == target_tier_type:
                return True

            source_tier_type = block.tier_type
            source_tier = self.get_tier(source_tier_type)
            target_tier = self.get_tier(target_tier_type)

            task = MigrationTask(
                block_id=block_id,
                from_tier=source_tier_type,
                to_tier=target_tier_type,
                state=MigrationState.COPYING,
                start_time=time.time(),
                block_size=block.size
            )

            if target_tier.available_capacity() < block.size:
                task.state = MigrationState.FAILED
                self.migration_log.append(task)
                return False

            task.state = MigrationState.COPYING
            self.migration_stats.active_migrations += 1

            target_tier.used_capacity += block.size

            task.state = MigrationState.SWITCHING
            task.copy_complete_time = time.time()

            source_tier.blocks.pop(block_id, None)
            source_tier.used_capacity -= block.size
            block.tier_type = target_tier_type
            target_tier.blocks[block_id] = block

            task.state = MigrationState.COMPLETED
            task.switch_complete_time = time.time()
            self.migration_stats.active_migrations -= 1
            self.migration_stats.record_migration(source_tier_type, target_tier_type)

            self.migration_log.append(task)
            return True

    def perform_auto_tiering(self):
        self.update_heat_scores()
        migration_plan = []
        for tier_type in [TierType.SSD, TierType.SAS, TierType.SATA]:
            tier = self.get_tier(tier_type)
            for block in list(tier.blocks.values()):
                if block.heat_score >= self.heat_threshold_high:
                    if tier_type == TierType.SATA:
                        migration_plan.append((block.id, TierType.SSD))
                    elif tier_type == TierType.SAS:
                        migration_plan.append((block.id, TierType.SSD))
                elif block.heat_score <= self.heat_threshold_low:
                    if tier_type == TierType.SSD:
                        migration_plan.append((block.id, TierType.SATA))
                    elif tier_type == TierType.SAS:
                        migration_plan.append((block.id, TierType.SATA))
                else:
                    if block.preferred_tier and block.preferred_tier != block.tier_type:
                        migration_plan.append((block.id, block.preferred_tier))

        for block_id, target_tier in migration_plan:
            self.migrate_block(block_id, target_tier)

    def simulate_random_access(self, num_accesses: int = 100):
        if not self.all_blocks:
            return
        block_ids = list(self.all_blocks.keys())
        weights = [1.0 / (i + 1) for i in range(len(block_ids))]
        total_weight = sum(weights)
        normalized_weights = [w / total_weight for w in weights]
        for _ in range(num_accesses):
            block_id = random.choices(block_ids, weights=normalized_weights, k=1)[0]
            self.access_block(block_id)

    def simulate_time_advance(self, advance_seconds: float = 60):
        for block in self.all_blocks.values():
            for event in block.access_events:
                event.timestamp -= advance_seconds

    def get_status(self) -> dict:
        return {
            "tiers": {
                "ssd": self.ssd.to_dict(),
                "sas": self.sas.to_dict(),
                "sata": self.sata.to_dict()
            },
            "migration_stats": self.migration_stats.to_dict(),
            "total_blocks": len(self.all_blocks),
            "runtime": time.time() - self.start_time,
            "heat_thresholds": {
                "high": self.heat_threshold_high,
                "low": self.heat_threshold_low
            },
            "window_seconds": self.window_seconds,
            "block_size_mb": BLOCK_SIZE / (1024 * 1024),
            "migration_strategy": "copy_then_atomic_switch",
            "recent_migrations": [t.to_dict() for t in self.migration_log[-20:]]
        }

    def get_blocks_by_tier(self, tier_type: TierType) -> List[dict]:
        tier = self.get_tier(tier_type)
        return [
            {
                "id": b.id,
                "size": b.size,
                "total_access_count": b.total_access_count,
                "window_access_count": b.window_access_count(self.window_seconds),
                "heat_score": b.heat_score,
                "last_access_time": b.last_access_time,
                "preferred_tier": b.preferred_tier.value if b.preferred_tier else None
            }
            for b in sorted(tier.blocks.values(), key=lambda x: x.heat_score, reverse=True)
        ]

    def set_preferred_tier(self, block_id: str, preferred_tier: Optional[TierType]) -> bool:
        block = self.all_blocks.get(block_id)
        if block is None:
            return False
        block.preferred_tier = preferred_tier
        return True

    def generate_report(self, fmt: str = "json") -> str:
        now = time.time()
        self.update_heat_scores()
        report = {
            "report_time": datetime.now().isoformat(),
            "simulator_runtime_seconds": round(now - self.start_time, 2),
            "configuration": {
                "block_size_mb": BLOCK_SIZE / (1024 * 1024),
                "window_seconds": self.window_seconds,
                "heat_threshold_high": self.heat_threshold_high,
                "heat_threshold_low": self.heat_threshold_low,
                "migration_strategy": "copy_then_atomic_switch"
            },
            "tier_summary": {
                "ssd": self.ssd.to_dict(),
                "sas": self.sas.to_dict(),
                "sata": self.sata.to_dict()
            },
            "migration_stats": self.migration_stats.to_dict(),
            "total_blocks": len(self.all_blocks),
            "blocks_with_preferred_tier": sum(
                1 for b in self.all_blocks.values() if b.preferred_tier
            ),
            "blocks": [
                {
                    "id": b.id,
                    "size_mb": b.size / (1024 * 1024),
                    "current_tier": b.tier_type.value,
                    "preferred_tier": b.preferred_tier.value if b.preferred_tier else None,
                    "heat_score": round(b.heat_score, 4),
                    "total_access_count": b.total_access_count,
                    "window_access_count": b.window_access_count(self.window_seconds),
                    "last_access_time": b.last_access_time
                }
                for b in sorted(self.all_blocks.values(), key=lambda x: x.heat_score, reverse=True)
            ],
            "migration_log": [t.to_dict() for t in self.migration_log]
        }

        if fmt == "csv":
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow([
                "block_id", "size_mb", "current_tier", "preferred_tier",
                "heat_score", "total_access_count", "window_access_count"
            ])
            for b in report["blocks"]:
                writer.writerow([
                    b["id"], b["size_mb"], b["current_tier"],
                    b["preferred_tier"] or "", b["heat_score"],
                    b["total_access_count"], b["window_access_count"]
                ])
            return output.getvalue()

        return json.dumps(report, indent=2, ensure_ascii=False)
