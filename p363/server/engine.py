from __future__ import annotations

import asyncio
import hashlib
import random
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Optional


class BlockStatus(str, Enum):
    PENDING = "pending"
    SYNCING = "syncing"
    SYNCED = "synced"
    ORPHAN = "orphan"


class ClusterRole(str, Enum):
    PRIMARY = "primary"
    BACKUP = "backup"
    ACTIVE = "active"


class SimState(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    FLUSHING = "flushing"
    SWITCHING = "switching"


class ReplicationMode(str, Enum):
    ASYNC_PRIMARY_BACKUP = "async_primary_backup"
    ACTIVE_ACTIVE = "active_active"


class ConflictResolution(str, Enum):
    LAST_WRITE_WINS = "last_write_wins"
    MANUAL = "manual"
    MERGE = "merge"


@dataclass
class Conflict:
    id: str
    image_id: str
    block_index: int
    cluster_a_hash: str
    cluster_b_hash: str
    cluster_a_version: int
    cluster_b_version: int
    cluster_a_timestamp: float
    cluster_b_timestamp: float
    detected_at: float
    resolved: bool = False
    resolution: Optional[str] = None
    resolved_at: Optional[float] = None
    winner: Optional[str] = None


@dataclass
class Snapshot:
    id: str
    timestamp: float
    image_id: str
    image_name: str
    block_hashes: dict[int, str]


@dataclass
class OrphanObject:
    image_id: str
    block_index: int
    hash: str
    reason: str


@dataclass
class SimConfig:
    blockSize: int = 4096
    imageSize: int = 1024
    imageCount: int = 3
    baseLatency: int = 50
    jitterRange: int = 30
    packetLossRate: float = 0.02
    bandwidth: int = 100
    primaryOsds: int = 6
    backupOsds: int = 6
    consistencyInterval: int = 5
    orphanCleanupInterval: int = 10
    snapshotInterval: int = 8
    replicationMode: ReplicationMode = ReplicationMode.ASYNC_PRIMARY_BACKUP
    conflictResolution: ConflictResolution = ConflictResolution.LAST_WRITE_WINS
    conflictDetectionInterval: int = 3
    histogramBucketCount: int = 10
    histogramMaxLatency: int = 200


@dataclass
class Block:
    index: int
    image_id: str
    hash: Optional[str] = None
    status: BlockStatus = BlockStatus.PENDING
    version: int = 0
    last_modified: float = 0.0
    modified_by: Optional[str] = None


@dataclass
class RBDImage:
    id: str
    name: str
    size_mb: int
    total_blocks: int
    synced_blocks: int = 0
    blocks: list[Block] = field(default_factory=list)


@dataclass
class Cluster:
    id: str
    name: str
    role: ClusterRole
    osds: list[str] = field(default_factory=list)
    pools: dict = field(default_factory=dict)
    images: list[RBDImage] = field(default_factory=list)
    snapshots: list[Snapshot] = field(default_factory=list)
    orphan_objects: list[OrphanObject] = field(default_factory=list)


class NetworkSimulator:
    def __init__(self, config: SimConfig):
        self.config = config

    def _clamp_delay(self, simulated_ms: float) -> float:
        sim_min, sim_max = 10.0, 200.0
        real_min, real_max = 0.005, 0.05
        if sim_max == sim_min:
            return real_min
        ratio = max(0.0, min(1.0, (simulated_ms - sim_min) / (sim_max - sim_min)))
        return real_min + ratio * (real_max - real_min)

    def get_simulated_latency(self) -> float:
        simulated_latency = self.config.baseLatency + random.uniform(
            -self.config.jitterRange, self.config.jitterRange
        )
        return max(10.0, min(200.0, simulated_latency))

    async def simulate_transfer(self) -> tuple[bool, float]:
        simulated_latency = self.get_simulated_latency()
        real_delay = self._clamp_delay(simulated_latency)
        await asyncio.sleep(real_delay)
        if random.random() < self.config.packetLossRate:
            await asyncio.sleep(real_delay)
            simulated_latency *= 2
        return True, simulated_latency


class LatencyHistogram:
    def __init__(self, bucket_count: int = 10, max_latency: int = 200):
        self.bucket_count = bucket_count
        self.max_latency = max_latency
        self.buckets: list[int] = [0] * bucket_count
        self.bucket_edges: list[float] = [
            i * (max_latency / bucket_count) for i in range(bucket_count + 1)
        ]
        self.total_samples = 0
        self.min_latency = float('inf')
        self.max_latency_actual = 0.0
        self.sum_latency = 0.0

    def reset(self):
        self.buckets = [0] * self.bucket_count
        self.total_samples = 0
        self.min_latency = float('inf')
        self.max_latency_actual = 0.0
        self.sum_latency = 0.0

    def record(self, latency_ms: float):
        self.total_samples += 1
        self.sum_latency += latency_ms
        self.min_latency = min(self.min_latency, latency_ms)
        self.max_latency_actual = max(self.max_latency_actual, latency_ms)

        bucket_idx = min(
            int(latency_ms / self.max_latency * self.bucket_count),
            self.bucket_count - 1,
        )
        self.buckets[bucket_idx] += 1

    def get_stats(self) -> dict:
        return {
            "bucket_count": self.bucket_count,
            "bucket_edges": self.bucket_edges,
            "buckets": self.buckets,
            "total_samples": self.total_samples,
            "min_ms": round(self.min_latency, 2) if self.total_samples > 0 else 0,
            "max_ms": round(self.max_latency_actual, 2) if self.total_samples > 0 else 0,
            "avg_ms": round(self.sum_latency / self.total_samples, 2) if self.total_samples > 0 else 0,
            "p50_ms": self._get_percentile(50),
            "p95_ms": self._get_percentile(95),
            "p99_ms": self._get_percentile(99),
        }

    def _get_percentile(self, percentile: int) -> float:
        if self.total_samples == 0:
            return 0.0
        target = self.total_samples * percentile / 100
        count = 0
        for i, bucket in enumerate(self.buckets):
            count += bucket
            if count >= target:
                return round(self.bucket_edges[i + 1], 2)
        return round(self.max_latency_actual, 2)


class ConflictDetector:
    def __init__(self, resolution_strategy: ConflictResolution = ConflictResolution.LAST_WRITE_WINS):
        self.resolution_strategy = resolution_strategy
        self.conflicts: list[Conflict] = []

    def detect_conflicts(
        self,
        cluster_a: Cluster,
        cluster_b: Cluster,
    ) -> list[Conflict]:
        new_conflicts = []
        existing_keys = {
            (c.image_id, c.block_index) for c in self.conflicts if not c.resolved
        }

        for img_a, img_b in zip(cluster_a.images, cluster_b.images):
            for blk_a, blk_b in zip(img_a.blocks, img_b.blocks):
                if blk_a.hash and blk_b.hash and blk_a.hash != blk_b.hash:
                    key = (img_a.id, blk_a.index)
                    if key not in existing_keys:
                        conflict = Conflict(
                            id=uuid.uuid4().hex[:8],
                            image_id=img_a.id,
                            block_index=blk_a.index,
                            cluster_a_hash=blk_a.hash,
                            cluster_b_hash=blk_b.hash,
                            cluster_a_version=blk_a.version,
                            cluster_b_version=blk_b.version,
                            cluster_a_timestamp=blk_a.last_modified,
                            cluster_b_timestamp=blk_b.last_modified,
                            detected_at=time.time(),
                        )
                        new_conflicts.append(conflict)
                        self.conflicts.append(conflict)

        return new_conflicts

    def resolve_conflict(
        self,
        conflict_id: str,
        cluster_a: Cluster,
        cluster_b: Cluster,
        winner: Optional[str] = None,
    ) -> Optional[Conflict]:
        conflict = next((c for c in self.conflicts if c.id == conflict_id), None)
        if not conflict or conflict.resolved:
            return None

        if self.resolution_strategy == ConflictResolution.LAST_WRITE_WINS:
            winner = (
                cluster_a.name
                if conflict.cluster_a_timestamp > conflict.cluster_b_timestamp
                else cluster_b.name
            )
        elif self.resolution_strategy == ConflictResolution.MANUAL and winner is None:
            return conflict

        conflict.resolved = True
        conflict.resolution = self.resolution_strategy.value
        conflict.resolved_at = time.time()
        conflict.winner = winner

        img_a = next(img for img in cluster_a.images if img.id == conflict.image_id)
        img_b = next(img for img in cluster_b.images if img.id == conflict.image_id)
        blk_a = img_a.blocks[conflict.block_index]
        blk_b = img_b.blocks[conflict.block_index]

        if winner == cluster_a.name:
            blk_b.hash = blk_a.hash
            blk_b.version = blk_a.version
            blk_b.last_modified = blk_a.last_modified
        else:
            blk_a.hash = blk_b.hash
            blk_a.version = blk_b.version
            blk_a.last_modified = blk_b.last_modified

        blk_a.status = BlockStatus.SYNCED
        blk_b.status = BlockStatus.SYNCED

        return conflict

    def get_conflicts(self, resolved: Optional[bool] = None) -> list[Conflict]:
        if resolved is None:
            return self.conflicts
        return [c for c in self.conflicts if c.resolved == resolved]

    def auto_resolve_all(
        self,
        cluster_a: Cluster,
        cluster_b: Cluster,
    ) -> list[Conflict]:
        resolved = []
        for conflict in list(self.conflicts):
            if not conflict.resolved:
                result = self.resolve_conflict(conflict.id, cluster_a, cluster_b)
                if result:
                    resolved.append(result)
        return resolved


class ConsistencyChecker:
    @staticmethod
    def check(primary_images: list[RBDImage], backup_images: list[RBDImage]) -> dict:
        mismatches = []
        for p_img, b_img in zip(primary_images, backup_images):
            image_mismatches = []
            for p_block, b_block in zip(p_img.blocks, b_img.blocks):
                if p_block.hash and b_block.hash and p_block.hash != b_block.hash:
                    image_mismatches.append({
                        "block_index": p_block.index,
                        "primary_hash": p_block.hash,
                        "backup_hash": b_block.hash,
                    })
            mismatches.append({
                "image_id": p_img.id,
                "image_name": p_img.name,
                "mismatches": image_mismatches,
                "mismatch_count": len(image_mismatches),
            })
        return {
            "timestamp": time.time(),
            "results": mismatches,
            "total_mismatches": sum(m["mismatch_count"] for m in mismatches),
        }


class SnapshotManager:
    @staticmethod
    def create_snapshot(image: RBDImage) -> Snapshot:
        block_hashes = {}
        for blk in image.blocks:
            if blk.hash and blk.status == BlockStatus.SYNCED:
                block_hashes[blk.index] = blk.hash
        return Snapshot(
            id=uuid.uuid4().hex[:8],
            timestamp=time.time(),
            image_id=image.id,
            image_name=image.name,
            block_hashes=block_hashes,
        )


class OrphanCleaner:
    @staticmethod
    def find_orphans(
        primary_snapshots: list[Snapshot],
        backup_images: list[RBDImage],
    ) -> list[OrphanObject]:
        orphans = []
        primary_block_map: dict[str, set[int]] = {}

        for snap in primary_snapshots:
            if snap.image_id not in primary_block_map:
                primary_block_map[snap.image_id] = set()
            primary_block_map[snap.image_id].update(snap.block_hashes.keys())

        for b_img in backup_images:
            known_blocks = primary_block_map.get(b_img.id, set())
            for blk in b_img.blocks:
                if blk.hash and blk.index not in known_blocks and blk.status != BlockStatus.ORPHAN:
                    orphans.append(OrphanObject(
                        image_id=b_img.id,
                        block_index=blk.index,
                        hash=blk.hash,
                        reason="exists_in_backup_not_in_primary_snapshot",
                    ))

        return orphans

    @staticmethod
    def cleanup_orphans(backup_cluster: Cluster, orphans: list[OrphanObject]) -> int:
        cleaned = 0
        orphan_map: dict[str, set[int]] = {}
        for orphan in orphans:
            if orphan.image_id not in orphan_map:
                orphan_map[orphan.image_id] = set()
            orphan_map[orphan.image_id].add(orphan.block_index)

        for b_img in backup_cluster.images:
            target_indices = orphan_map.get(b_img.id, set())
            for blk in b_img.blocks:
                if blk.index in target_indices:
                    blk.status = BlockStatus.ORPHAN
                    blk.hash = None
                    cleaned += 1

        backup_cluster.orphan_objects = [
            o for o in backup_cluster.orphan_objects
            if not any(oo.image_id == o.image_id and oo.block_index == o.block_index for oo in orphans)
        ]
        return cleaned


class SimulationEngine:
    def __init__(self):
        self.config = SimConfig()
        self.state = SimState.IDLE
        self.primary_cluster: Optional[Cluster] = None
        self.backup_cluster: Optional[Cluster] = None
        self.network = NetworkSimulator(self.config)
        self.consistency_checker = ConsistencyChecker()
        self.snapshot_manager = SnapshotManager()
        self.orphan_cleaner = OrphanCleaner()
        self.conflict_detector = ConflictDetector()
        self.latency_histogram = LatencyHistogram()
        self.logs: list[dict] = []
        self._task: Optional[asyncio.Task] = None
        self._queues: list[asyncio.Queue] = []
        self._tick_count = 0
        self._sync_queue: list[tuple[str, int, str]] = []
        self._reverse_sync_queue: list[tuple[str, int]] = []
        self._last_snapshot_tick = 0
        self._last_orphan_cleanup_tick = 0
        self._last_conflict_detection_tick = 0
        self._flushing = False
        self._switching_role = False
        self._pending_writes_blocked = False

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._queues.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        if q in self._queues:
            self._queues.remove(q)

    async def _broadcast(self, message: dict):
        dead = []
        for q in self._queues:
            try:
                q.put_nowait(message)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self._queues.remove(q)

    def _log(self, event: str, detail: str = "", level: str = "info"):
        entry = {
            "timestamp": time.time(),
            "event": event,
            "detail": detail,
            "level": level,
        }
        self.logs.append(entry)
        if len(self.logs) > 1000:
            self.logs = self.logs[-500:]

    def _generate_hash(self, image_id: str, block_index: int) -> str:
        raw = f"block_{image_id}_{block_index}_{time.time()}_{random.randint(0, 999999)}"
        return hashlib.md5(raw.encode()).hexdigest()

    def _create_clusters(self):
        primary_osds = [f"osd-{i}" for i in range(self.config.primaryOsds)]
        backup_osds = [f"osd-{i}" for i in range(self.config.backupOsds)]
        blocks_per_image = (self.config.imageSize * 1024) // self.config.blockSize

        primary_images: list[RBDImage] = []
        backup_images: list[RBDImage] = []

        for i in range(self.config.imageCount):
            img_id = uuid.uuid4().hex[:8]
            p_blocks = [Block(index=j, image_id=img_id) for j in range(blocks_per_image)]
            b_blocks = [Block(index=j, image_id=img_id) for j in range(blocks_per_image)]
            p_img = RBDImage(
                id=img_id,
                name=f"rbd-image-{i + 1}",
                size_mb=self.config.imageSize,
                total_blocks=blocks_per_image,
                synced_blocks=0,
                blocks=p_blocks,
            )
            b_img = RBDImage(
                id=img_id,
                name=f"rbd-image-{i + 1}",
                size_mb=self.config.imageSize,
                total_blocks=blocks_per_image,
                synced_blocks=0,
                blocks=b_blocks,
            )
            primary_images.append(p_img)
            backup_images.append(b_img)

        is_active_active = self.config.replicationMode == ReplicationMode.ACTIVE_ACTIVE

        self.primary_cluster = Cluster(
            id=uuid.uuid4().hex[:8],
            name="primary-cluster" if not is_active_active else "cluster-a",
            role=ClusterRole.PRIMARY if not is_active_active else ClusterRole.ACTIVE,
            osds=primary_osds,
            pools={"rbd": {"images": self.config.imageCount}},
            images=primary_images,
        )
        self.backup_cluster = Cluster(
            id=uuid.uuid4().hex[:8],
            name="backup-cluster" if not is_active_active else "cluster-b",
            role=ClusterRole.BACKUP if not is_active_active else ClusterRole.ACTIVE,
            osds=backup_osds,
            pools={"rbd": {"images": self.config.imageCount}},
            images=backup_images,
        )

    def set_replication_mode(self, mode: ReplicationMode):
        self.config.replicationMode = mode
        if self.primary_cluster and self.backup_cluster:
            if mode == ReplicationMode.ACTIVE_ACTIVE:
                self.primary_cluster.role = ClusterRole.ACTIVE
                self.backup_cluster.role = ClusterRole.ACTIVE
                self.primary_cluster.name = "cluster-a"
                self.backup_cluster.name = "cluster-b"
            else:
                self.primary_cluster.role = ClusterRole.PRIMARY
                self.backup_cluster.role = ClusterRole.BACKUP
                self.primary_cluster.name = "primary-cluster"
                self.backup_cluster.name = "backup-cluster"
        self.conflict_detector.conflicts.clear()
        self.latency_histogram.reset()
        self._log("replication_mode_changed", f"Mode set to {mode.value}", "warn")

    async def start(self):
        if self.state in (SimState.RUNNING, SimState.FLUSHING, SimState.SWITCHING):
            return
        if self.state == SimState.IDLE:
            self._create_clusters()
            self._tick_count = 0
            self._sync_queue.clear()
            self._flushing = False
            self._switching_role = False
            self._pending_writes_blocked = False
            self._last_snapshot_tick = 0
            self._last_orphan_cleanup_tick = 0
        self.state = SimState.RUNNING
        self._log("simulation_started", f"Primary: {self.primary_cluster.name}, Backup: {self.backup_cluster.name}")
        await self._broadcast({"type": "log", "data": {"event": "simulation_started"}})
        self._task = asyncio.create_task(self._run_loop())

    async def stop(self):
        if self.state == SimState.IDLE:
            return
        self.state = SimState.IDLE
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        self.primary_cluster = None
        self.backup_cluster = None
        self._tick_count = 0
        self._sync_queue.clear()
        self._flushing = False
        self._switching_role = False
        self._pending_writes_blocked = False
        self._log("simulation_stopped", "Simulation stopped")
        await self._broadcast({"type": "log", "data": {"event": "simulation_stopped"}})

    async def pause(self):
        if self.state != SimState.RUNNING:
            return
        self.state = SimState.PAUSED
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        self._log("simulation_paused", "Simulation paused")
        await self._broadcast({"type": "log", "data": {"event": "simulation_paused"}})

    async def flush_and_switch(self) -> dict:
        if self.state != SimState.RUNNING or self._flushing:
            return {"status": "error", "message": "Cannot flush: not running or already flushing"}

        self._flushing = True
        self._pending_writes_blocked = True
        self.state = SimState.FLUSHING
        self._log("flush_started", "Blocking new writes, flushing pending IO...", "warn")
        await self._broadcast({
            "type": "flush_status",
            "data": {"status": "flushing", "pending_count": len(self._sync_queue)},
        })

        flush_task = asyncio.create_task(self._flush_all_pending())
        result = await flush_task

        if result["success"]:
            self.state = SimState.SWITCHING
            self._log("flush_completed", f"Flushed {result['flushed_count']} blocks. Starting role switch...", "warn")
            await self._broadcast({
                "type": "flush_status",
                "data": {"status": "completed", "flushed_count": result["flushed_count"]},
            })
            switch_result = await self._switch_roles()
            return switch_result
        else:
            self.state = SimState.RUNNING
            self._flushing = False
            self._pending_writes_blocked = False
            return {"status": "error", "message": result.get("error", "Flush failed")}

    async def _flush_all_pending(self) -> dict:
        max_wait_ticks = 60
        wait_count = 0

        while self._sync_queue and wait_count < max_wait_ticks:
            await self._process_sync_batch(batch_size=10)
            await self._broadcast({
                "type": "flush_status",
                "data": {"status": "flushing", "pending_count": len(self._sync_queue)},
            })
            await asyncio.sleep(0.2)
            wait_count += 1

        if self._sync_queue:
            return {"success": False, "error": f"Timeout with {len(self._sync_queue)} pending"}

        if self.primary_cluster:
            for p_img in self.primary_cluster.images:
                syncing = any(blk.status == BlockStatus.SYNCING for blk in p_img.blocks)
                if syncing:
                    return {"success": False, "error": "Blocks still syncing"}

        total_flushed = sum(
            1 for img in (self.primary_cluster.images if self.primary_cluster else [])
            for blk in img.blocks
            if blk.status == BlockStatus.SYNCED
        )

        return {"success": True, "flushed_count": total_flushed}

    async def _switch_roles(self) -> dict:
        if not self.primary_cluster or not self.backup_cluster:
            return {"status": "error", "message": "No active clusters"}

        old_primary_name = self.primary_cluster.name
        old_backup_name = self.backup_cluster.name

        temp = self.primary_cluster
        self.primary_cluster = self.backup_cluster
        self.backup_cluster = temp

        self.primary_cluster.role = ClusterRole.PRIMARY
        self.backup_cluster.role = ClusterRole.BACKUP

        self._log(
            "role_switch",
            f"{old_primary_name} → BACKUP, {old_backup_name} → PRIMARY",
            "warn",
        )

        self._flushing = False
        self._pending_writes_blocked = False
        self._tick_count = 0
        self._sync_queue.clear()

        await self._broadcast({
            "type": "role_switch",
            "data": {
                "new_primary": self.primary_cluster.name,
                "new_backup": self.backup_cluster.name,
            },
        })

        await self._create_snapshots(is_role_switch=True)

        self.state = SimState.RUNNING
        self._task = asyncio.create_task(self._run_loop())

        return {
            "status": "success",
            "new_primary": self.primary_cluster.name,
            "new_backup": self.backup_cluster.name,
        }

    async def _create_snapshots(self, is_role_switch: bool = False) -> list[Snapshot]:
        snapshots = []
        cluster = self.primary_cluster if is_role_switch else self.primary_cluster
        if not cluster:
            return []

        for img in cluster.images:
            snap = self.snapshot_manager.create_snapshot(img)
            cluster.snapshots.append(snap)
            snapshots.append(snap)
            if len(cluster.snapshots) > 10:
                cluster.snapshots = cluster.snapshots[-10:]

        if not is_role_switch:
            self._log("snapshot_created", f"Created {len(snapshots)} snapshots")
            await self._broadcast({
                "type": "snapshot",
                "data": {
                    "count": len(snapshots),
                    "snapshots": [{"id": s.id, "image_name": s.image_name} for s in snapshots],
                },
            })
        else:
            self._log("post_switch_snapshot", f"Created {len(snapshots)} snapshots after role switch")

        return snapshots

    async def _cleanup_orphans(self) -> dict:
        if not self.primary_cluster or not self.backup_cluster:
            return {"status": "error", "message": "No active clusters"}

        orphans = self.orphan_cleaner.find_orphans(
            self.primary_cluster.snapshots,
            self.backup_cluster.images,
        )

        self.backup_cluster.orphan_objects.extend(orphans)

        cleaned = 0
        if orphans:
            cleaned = self.orphan_cleaner.cleanup_orphans(self.backup_cluster, orphans)
            self._log(
                "orphan_cleanup",
                f"Found {len(orphans)} orphan objects, cleaned {cleaned}",
                "warn",
            )
            await self._broadcast({
                "type": "orphan_cleanup",
                "data": {
                    "found": len(orphans),
                    "cleaned": cleaned,
                    "orphans": [
                        {"image_id": o.image_id, "block_index": o.block_index}
                        for o in orphans[:20]
                    ],
                },
            })
        else:
            self._log("orphan_cleanup", "No orphan objects found")

        return {
            "status": "success",
            "found": len(orphans),
            "cleaned": cleaned,
            "total_orphans": len(self.backup_cluster.orphan_objects),
        }

    async def _run_loop(self):
        try:
            while self.state == SimState.RUNNING:
                await self._tick()
                self._tick_count += 1
                await asyncio.sleep(0.5)
        except asyncio.CancelledError:
            return

    async def _process_sync_batch(self, batch_size: int = 3):
        if not self.primary_cluster or not self.backup_cluster:
            return

        is_active_active = self.config.replicationMode == ReplicationMode.ACTIVE_ACTIVE

        sync_batch = min(batch_size, len(self._sync_queue))
        for _ in range(sync_batch):
            if not self._sync_queue:
                break
            item = self._sync_queue.pop(0)
            if len(item) == 3:
                img_id, block_idx, src_cluster_name = item
            else:
                img_id, block_idx = item
                src_cluster_name = self.primary_cluster.name

            src_cluster = (
                self.primary_cluster
                if self.primary_cluster.name == src_cluster_name
                else self.backup_cluster
            )
            dst_cluster = (
                self.backup_cluster
                if self.primary_cluster.name == src_cluster_name
                else self.primary_cluster
            )

            src_img = next(img for img in src_cluster.images if img.id == img_id)
            dst_img = next(img for img in dst_cluster.images if img.id == img_id)
            src_block = src_img.blocks[block_idx]
            dst_block = dst_img.blocks[block_idx]

            if src_block.hash is None:
                continue

            src_block.status = BlockStatus.SYNCING
            success, latency_ms = await self.network.simulate_transfer()
            self.latency_histogram.record(latency_ms)

            if is_active_active and dst_block.hash is not None:
                if dst_block.hash != src_block.hash and dst_block.version > src_block.version:
                    src_block.status = BlockStatus.SYNCED
                    continue

            dst_block.hash = src_block.hash
            dst_block.version = src_block.version
            dst_block.last_modified = src_block.last_modified
            dst_block.modified_by = src_block.modified_by
            src_block.status = BlockStatus.SYNCED
            dst_block.status = BlockStatus.SYNCED

    async def _detect_and_resolve_conflicts(self):
        if not self.primary_cluster or not self.backup_cluster:
            return

        new_conflicts = self.conflict_detector.detect_conflicts(
            self.primary_cluster, self.backup_cluster
        )

        if new_conflicts:
            self._log(
                "conflict_detected",
                f"Detected {len(new_conflicts)} new conflicts",
                "warn",
            )
            await self._broadcast({
                "type": "conflict",
                "data": {
                    "total": len(self.conflict_detector.conflicts),
                    "unresolved": len(self.conflict_detector.get_conflicts(resolved=False)),
                    "new_conflicts": [
                        {
                            "id": c.id,
                            "image_id": c.image_id,
                            "block_index": c.block_index,
                        }
                        for c in new_conflicts[:10]
                    ],
                },
            })

            if self.config.conflictResolution != ConflictResolution.MANUAL:
                resolved = self.conflict_detector.auto_resolve_all(
                    self.primary_cluster, self.backup_cluster
                )
                if resolved:
                    self._log(
                        "conflict_resolved",
                        f"Auto-resolved {len(resolved)} conflicts using {self.config.conflictResolution.value}",
                        "warn",
                    )

    async def _tick(self):
        if not self.primary_cluster or not self.backup_cluster:
            return

        is_active_active = self.config.replicationMode == ReplicationMode.ACTIVE_ACTIVE

        if not self._pending_writes_blocked:
            for src_img in self.primary_cluster.images:
                unwritten = [i for i, blk in enumerate(src_img.blocks) if blk.hash is None]
                if unwritten:
                    idx = random.choice(unwritten)
                else:
                    idx = random.randint(0, len(src_img.blocks) - 1)
                src_img.blocks[idx].hash = self._generate_hash(src_img.id, idx)
                src_img.blocks[idx].version += 1
                src_img.blocks[idx].last_modified = time.time()
                src_img.blocks[idx].modified_by = self.primary_cluster.name
                src_img.blocks[idx].status = BlockStatus.PENDING
                self._sync_queue.append((src_img.id, idx, self.primary_cluster.name))

            if is_active_active:
                for b_img in self.backup_cluster.images:
                    if random.random() < 0.7:
                        continue
                    unwritten_b = [i for i, blk in enumerate(b_img.blocks) if blk.hash is None]
                    if unwritten_b:
                        idx_b = random.choice(unwritten_b)
                    else:
                        idx_b = random.randint(0, len(b_img.blocks) - 1)
                    b_img.blocks[idx_b].hash = self._generate_hash(b_img.id, idx_b)
                    b_img.blocks[idx_b].version += 1
                    b_img.blocks[idx_b].last_modified = time.time() + random.uniform(-0.01, 0.01)
                    b_img.blocks[idx_b].modified_by = self.backup_cluster.name
                    b_img.blocks[idx_b].status = BlockStatus.PENDING
                    self._sync_queue.append((b_img.id, idx_b, self.backup_cluster.name))

        await self._process_sync_batch()

        for p_img in self.primary_cluster.images:
            synced = sum(1 for blk in p_img.blocks if blk.status == BlockStatus.SYNCED)
            p_img.synced_blocks = synced
            b_img = next(b for b in self.backup_cluster.images if b.id == p_img.id)
            b_img.synced_blocks = synced

        if self._tick_count % self.config.consistencyInterval == 0 and self._tick_count > 0:
            result = self.consistency_checker.check(
                self.primary_cluster.images, self.backup_cluster.images
            )
            await self._broadcast({"type": "consistency", "data": result})
            if result["total_mismatches"] > 0:
                self._log(
                    "consistency_check",
                    f"Found {result['total_mismatches']} mismatches",
                    level="warning",
                )
            else:
                self._log("consistency_check", "All blocks consistent")

        if is_active_active and self._tick_count % self.config.conflictDetectionInterval == 0 and self._tick_count > 0:
            await self._detect_and_resolve_conflicts()

        if not is_active_active and self._tick_count % self.config.snapshotInterval == 0 and self._tick_count > 0:
            await self._create_snapshots()

        if not is_active_active and self._tick_count % self.config.orphanCleanupInterval == 0 and self._tick_count > 0:
            await self._cleanup_orphans()

        progress_data = []
        for p_img in self.primary_cluster.images:
            pct = round(
                (p_img.synced_blocks / p_img.total_blocks * 100) if p_img.total_blocks > 0 else 0,
                2,
            )
            progress_data.append({
                "image_id": p_img.id,
                "image_name": p_img.name,
                "total_blocks": p_img.total_blocks,
                "synced_blocks": p_img.synced_blocks,
                "progress": pct,
            })
        await self._broadcast({"type": "sync_progress", "data": progress_data})

        latency_data = {
            "base_ms": self.config.baseLatency,
            "jitter_ms": round(random.uniform(-self.config.jitterRange, self.config.jitterRange), 2),
            "packet_loss_rate": self.config.packetLossRate,
            "bandwidth_mbs": self.config.bandwidth,
        }
        await self._broadcast({"type": "latency", "data": latency_data})

        cluster_status = {
            "replication_mode": self.config.replicationMode.value,
            "primary": {
                "id": self.primary_cluster.id,
                "name": self.primary_cluster.name,
                "role": self.primary_cluster.role,
                "osd_count": len(self.primary_cluster.osds),
                "osds": self.primary_cluster.osds,
                "pool_count": len(self.primary_cluster.pools),
                "snapshot_count": len(self.primary_cluster.snapshots),
            },
            "backup": {
                "id": self.backup_cluster.id,
                "name": self.backup_cluster.name,
                "role": self.backup_cluster.role,
                "osd_count": len(self.backup_cluster.osds),
                "osds": self.backup_cluster.osds,
                "pool_count": len(self.backup_cluster.pools),
                "orphan_count": len(self.backup_cluster.orphan_objects),
                "snapshot_count": len(self.backup_cluster.snapshots),
            },
            "conflict_count": len(self.conflict_detector.conflicts),
            "unresolved_conflict_count": len(self.conflict_detector.get_conflicts(resolved=False)),
        }
        await self._broadcast({"type": "cluster_status", "data": cluster_status})

        histogram_data = self.latency_histogram.get_stats()
        await self._broadcast({"type": "histogram", "data": histogram_data})

        recent_logs = self.logs[-5:]
        await self._broadcast({"type": "log", "data": recent_logs})

    async def update_config(self, new_config: dict):
        for key, value in new_config.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)
        self.network = NetworkSimulator(self.config)
        self.conflict_detector.resolution_strategy = self.config.conflictResolution
        self._log("config_updated", f"Config updated: {new_config}")
        await self._broadcast({"type": "log", "data": {"event": "config_updated"}})

    def get_conflicts(self, resolved: Optional[bool] = None) -> list[dict]:
        conflicts = self.conflict_detector.get_conflicts(resolved)
        return [
            {
                "id": c.id,
                "image_id": c.image_id,
                "block_index": c.block_index,
                "cluster_a_hash": c.cluster_a_hash,
                "cluster_b_hash": c.cluster_b_hash,
                "cluster_a_version": c.cluster_a_version,
                "cluster_b_version": c.cluster_b_version,
                "detected_at": c.detected_at,
                "resolved": c.resolved,
                "resolution": c.resolution,
                "winner": c.winner,
            }
            for c in conflicts
        ]

    async def resolve_conflict(self, conflict_id: str, winner: Optional[str] = None) -> dict:
        if not self.primary_cluster or not self.backup_cluster:
            return {"status": "error", "message": "No active clusters"}

        result = self.conflict_detector.resolve_conflict(
            conflict_id, self.primary_cluster, self.backup_cluster, winner
        )
        if result:
            self._log("conflict_resolved", f"Conflict {conflict_id} resolved, winner: {result.winner}", "warn")
            return {"status": "success", "conflict_id": conflict_id, "winner": result.winner}
        return {"status": "error", "message": "Conflict not found or already resolved"}

    def get_latency_histogram(self) -> dict:
        return self.latency_histogram.get_stats()

    def reset_histogram(self):
        self.latency_histogram.reset()

    def get_status(self) -> dict:
        if not self.primary_cluster or not self.backup_cluster:
            return {
                "state": self.state.value,
                "tick_count": self._tick_count,
                "clusters": None,
                "progress": [],
                "pending_sync_queue": 0,
                "pending_writes_blocked": self._pending_writes_blocked,
                "flushing": self._flushing,
                "replication_mode": self.config.replicationMode.value,
            }
        progress = []
        for p_img in self.primary_cluster.images:
            pct = round(
                (p_img.synced_blocks / p_img.total_blocks * 100) if p_img.total_blocks > 0 else 0,
                2,
            )
            progress.append({
                "image_id": p_img.id,
                "image_name": p_img.name,
                "total_blocks": p_img.total_blocks,
                "synced_blocks": p_img.synced_blocks,
                "progress": pct,
            })
        return {
            "state": self.state.value,
            "tick_count": self._tick_count,
            "replication_mode": self.config.replicationMode.value,
            "clusters": {
                "primary": {
                    "id": self.primary_cluster.id,
                    "name": self.primary_cluster.name,
                    "role": self.primary_cluster.role,
                    "osd_count": len(self.primary_cluster.osds),
                    "snapshot_count": len(self.primary_cluster.snapshots),
                },
                "backup": {
                    "id": self.backup_cluster.id,
                    "name": self.backup_cluster.name,
                    "role": self.backup_cluster.role,
                    "osd_count": len(self.backup_cluster.osds),
                    "orphan_count": len(self.backup_cluster.orphan_objects),
                    "snapshot_count": len(self.backup_cluster.snapshots),
                },
            },
            "conflict_count": len(self.conflict_detector.conflicts),
            "unresolved_conflict_count": len(self.conflict_detector.get_conflicts(resolved=False)),
            "progress": progress,
            "pending_sync_queue": len(self._sync_queue),
            "pending_writes_blocked": self._pending_writes_blocked,
            "flushing": self._flushing,
        }

    def get_logs(self, offset: int = 0, limit: int = 50) -> dict:
        total = len(self.logs)
        entries = self.logs[offset : offset + limit]
        return {
            "total": total,
            "offset": offset,
            "limit": limit,
            "entries": entries,
        }

    async def run_consistency_check(self) -> dict:
        if not self.primary_cluster or not self.backup_cluster:
            return {"error": "No active simulation", "total_mismatches": 0, "results": []}
        result = self.consistency_checker.check(
            self.primary_cluster.images, self.backup_cluster.images
        )
        await self._broadcast({"type": "consistency", "data": result})
        self._log("consistency_check_manual", f"Mismatches: {result['total_mismatches']}")
        return result

    async def run_orphan_cleanup(self) -> dict:
        return await self._cleanup_orphans()

    async def run_flush_and_switch(self) -> dict:
        return await self.flush_and_switch()

    def get_config(self) -> dict:
        return asdict(self.config)
