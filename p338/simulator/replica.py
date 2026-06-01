import re
import time
import uuid
import hashlib
import threading
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Callable, Tuple

from simulator.zookeeper import ZooKeeperSimulator


@dataclass
class DataBlock:
    id: str
    content: str
    source_replica: str
    timestamp: float
    block_number: int
    version: int = 1
    partition_key: str = ''
    content_hash: str = ''


@dataclass
class LatencyRecord:
    block_id: str
    source_replica: str
    target_replica: str
    insert_time: float
    apply_time: float
    latency_ms: float
    partition_key: str
    version: int


@dataclass
class DedupRecord:
    content_hash: str
    block_id: str
    duplicate_of_block_id: str
    detected_at: float
    detected_by: str
    partition_key: str


@dataclass
class PartLogEntry:
    part_id: str
    block_id: str
    partition_key: str
    operation: str
    content: str
    version: int
    timestamp: float
    source_replica: str
    prev_version: int = 0


@dataclass
class ConflictRecord:
    conflict_id: str
    partition_key: str
    local_version: int
    remote_version: int
    local_timestamp: float
    remote_timestamp: float
    local_source: str
    remote_source: str
    resolution: str
    winner_source: str
    resolved_at: float


@dataclass
class SyncQueueItem:
    block_id: str
    progress: int
    status: str
    start_time: float
    log_id: str
    source_replica: str
    part_ids: List[str] = field(default_factory=list)


class ClickHouseReplica:
    def __init__(self, replica_id: str, name: str, host: str, port: int, zk: ZooKeeperSimulator):
        self.id = replica_id
        self.name = name
        self.host = host
        self.port = port
        self.zk = zk
        
        self._lock = threading.RLock()
        self._data: Dict[str, DataBlock] = {}
        self._block_counter = 0
        self._sync_queue: Dict[str, SyncQueueItem] = {}
        self._last_sync_time: Optional[float] = None
        self._is_leader = False
        self._status = 'online'
        
        self._part_log: List[PartLogEntry] = []
        self._part_log_index: Dict[str, PartLogEntry] = {}
        self._last_applied_part: Optional[str] = None
        self._partition_versions: Dict[str, Tuple[int, str, float]] = {}
        self._conflicts: List[ConflictRecord] = []
        
        self._content_hash_index: Dict[str, str] = {}
        self._dedup_records: List[DedupRecord] = []
        self._latency_records: List[LatencyRecord] = []
        
        self._sync_thread: Optional[threading.Thread] = None
        self._stop_sync = threading.Event()
        self._pause_sync = threading.Event()
        
        self._on_sync_complete: Optional[Callable] = None
        self._on_sync_progress: Optional[Callable] = None
        self._on_conflict: Optional[Callable] = None
        self._on_dedup: Optional[Callable] = None
        self._on_latency: Optional[Callable] = None
        
        self._register_with_zk()
        self._setup_zk_watchers()
    
    def _register_with_zk(self):
        replica_path = f'/clickhouse/replicas/{self.id}'
        self.zk.create_node(replica_path, {
            'id': self.id,
            'name': self.name,
            'host': self.host,
            'port': self.port,
            'status': self._status,
            'registered_at': time.time(),
            'last_applied_part': None
        }, ephemeral=True, owner=self.id)
        
        parts_path = f'/clickhouse/replicas/{self.id}/parts'
        self.zk.create_node(parts_path, {'count': 0})
    
    def _setup_zk_watchers(self):
        self.zk.watch('/clickhouse/replication_log', self._on_replication_log_event)
        self.zk.watch('/clickhouse/part_log', self._on_part_log_event)
    
    def _on_replication_log_event(self, event_type: str, path: str, data: Any):
        if event_type == 'new_log' and isinstance(data, dict):
            source_replica = data.get('source_replica')
            block_id = data.get('block_id')
            log_id = data.get('id')
            part_ids = data.get('part_ids', [])
            
            if source_replica != self.id and block_id and log_id:
                if block_id not in self._data and block_id not in self._sync_queue:
                    self._queue_sync(block_id, log_id, source_replica, part_ids)
    
    def _on_part_log_event(self, event_type: str, path: str, data: Any):
        if event_type == 'new_part' and isinstance(data, dict):
            source_replica = data.get('source_replica')
            part_id = data.get('part_id')
            if source_replica != self.id and part_id:
                if part_id not in self._part_log_index:
                    pass
    
    def _queue_sync(self, block_id: str, log_id: str, source_replica: str, part_ids: List[str] = None):
        with self._lock:
            if block_id in self._sync_queue or block_id in self._data:
                return
            
            self._sync_queue[block_id] = SyncQueueItem(
                block_id=block_id,
                progress=0,
                status='pending',
                start_time=time.time(),
                log_id=log_id,
                source_replica=source_replica,
                part_ids=part_ids or []
            )
            self._status = 'syncing'
    
    def _extract_partition_key(self, content: str) -> str:
        match = re.search(r'VALUES\s*\(([^,)]+)', content, re.IGNORECASE)
        if match:
            return match.group(1).strip().strip("'\"")
        return f'auto-{uuid.uuid4().hex[:8]}'
    
    def _compute_content_hash(self, content: str) -> str:
        return hashlib.sha256(content.encode('utf-8')).hexdigest()[:16]
    
    def insert_data(self, content: str) -> Dict:
        with self._lock:
            content_hash = self._compute_content_hash(content)
            
            if content_hash in self._content_hash_index:
                existing_block_id = self._content_hash_index[content_hash]
                existing_block = self._data.get(existing_block_id)
                
                dedup_record = DedupRecord(
                    content_hash=content_hash,
                    block_id=f'blk-{uuid.uuid4().hex[:12]}',
                    duplicate_of_block_id=existing_block_id,
                    detected_at=time.time(),
                    detected_by=self.id,
                    partition_key=existing_block.partition_key if existing_block else ''
                )
                self._dedup_records.append(dedup_record)
                
                if self._on_dedup:
                    self._on_dedup(self.id, dedup_record)
                
                return {
                    'success': True,
                    'block_id': existing_block_id,
                    'is_duplicate': True,
                    'duplicate_of': existing_block_id,
                    'message': 'Duplicate data detected, skipped insertion',
                    'partition_key': existing_block.partition_key if existing_block else '',
                    'version': existing_block.version if existing_block else 1
                }
            
            self._block_counter += 1
            block_id = f'blk-{uuid.uuid4().hex[:12]}'
            partition_key = self._extract_partition_key(content)
            
            current_version = 1
            prev_version = 0
            if partition_key in self._partition_versions:
                prev_version, _, _ = self._partition_versions[partition_key]
                current_version = prev_version + 1
            
            block = DataBlock(
                id=block_id,
                content=content,
                source_replica=self.id,
                timestamp=time.time(),
                block_number=self._block_counter,
                version=current_version,
                partition_key=partition_key,
                content_hash=content_hash
            )
            
            self._data[block_id] = block
            self._content_hash_index[content_hash] = block_id
            self._last_sync_time = time.time()
            self._partition_versions[partition_key] = (current_version, self.id, block.timestamp)
            
            part_id = f'part-{uuid.uuid4().hex[:8]}'
            part_entry = PartLogEntry(
                part_id=part_id,
                block_id=block_id,
                partition_key=partition_key,
                operation='INSERT',
                content=content,
                version=current_version,
                timestamp=block.timestamp,
                source_replica=self.id,
                prev_version=prev_version
            )
            
            self._part_log.append(part_entry)
            self._part_log_index[part_id] = part_entry
            self._last_applied_part = part_id
            
            return {
                'success': True,
                'block_id': block_id,
                'block_number': block.block_number,
                'timestamp': block.timestamp,
                'version': current_version,
                'partition_key': partition_key,
                'part_id': part_id,
                'content_hash': content_hash,
                'is_duplicate': False
            }
    
    def apply_block(self, block: DataBlock) -> Tuple[bool, Optional[ConflictRecord]]:
        with self._lock:
            conflict = None
            
            content_hash = block.content_hash or self._compute_content_hash(block.content)
            if content_hash in self._content_hash_index and self._content_hash_index[content_hash] != block.id:
                existing_block_id = self._content_hash_index[content_hash]
                
                dedup_record = DedupRecord(
                    content_hash=content_hash,
                    block_id=block.id,
                    duplicate_of_block_id=existing_block_id,
                    detected_at=time.time(),
                    detected_by=self.id,
                    partition_key=block.partition_key
                )
                self._dedup_records.append(dedup_record)
                
                if self._on_dedup:
                    self._on_dedup(self.id, dedup_record)
                
                return False, conflict
            
            if block.partition_key and block.partition_key in self._partition_versions:
                local_ver, local_source, local_ts = self._partition_versions[block.partition_key]
                
                if local_ver >= block.version and local_source != block.source_replica:
                    conflict = self._resolve_conflict(
                        block.partition_key,
                        local_ver, local_ts, local_source,
                        block.version, block.timestamp, block.source_replica
                    )
                    
                    if conflict.winner_source != block.source_replica:
                        part_id = f'part-{uuid.uuid4().hex[:8]}'
                        part_entry = PartLogEntry(
                            part_id=part_id,
                            block_id=block.id,
                            partition_key=block.partition_key,
                            operation='CONFLICT_REJECTED',
                            content=block.content,
                            version=block.version,
                            timestamp=block.timestamp,
                            source_replica=block.source_replica,
                            prev_version=local_ver
                        )
                        self._part_log.append(part_entry)
                        self._part_log_index[part_id] = part_entry
                        return False, conflict
            
            if block.id in self._data:
                existing = self._data[block.id]
                if existing.version >= block.version:
                    return False, conflict
            
            self._data[block.id] = block
            if content_hash not in self._content_hash_index:
                self._content_hash_index[content_hash] = block.id
            self._block_counter = max(self._block_counter, block.block_number)
            self._last_sync_time = time.time()
            
            if block.source_replica != self.id:
                latency_ms = (time.time() - block.timestamp) * 1000
                latency_record = LatencyRecord(
                    block_id=block.id,
                    source_replica=block.source_replica,
                    target_replica=self.id,
                    insert_time=block.timestamp,
                    apply_time=time.time(),
                    latency_ms=latency_ms,
                    partition_key=block.partition_key,
                    version=block.version
                )
                self._latency_records.append(latency_record)
                
                if self._on_latency:
                    self._on_latency(self.id, latency_record)
            
            if block.partition_key:
                new_ver = max(block.version, self._partition_versions.get(block.partition_key, (0, '', 0))[0])
                if block.version >= self._partition_versions.get(block.partition_key, (0, '', 0))[0]:
                    self._partition_versions[block.partition_key] = (block.version, block.source_replica, block.timestamp)
            
            part_id = f'part-{uuid.uuid4().hex[:8]}'
            part_entry = PartLogEntry(
                part_id=part_id,
                block_id=block.id,
                partition_key=block.partition_key,
                operation='REPLICATE',
                content=block.content,
                version=block.version,
                timestamp=block.timestamp,
                source_replica=block.source_replica,
                prev_version=max(0, block.version - 1)
            )
            
            self._part_log.append(part_entry)
            self._part_log_index[part_id] = part_entry
            self._last_applied_part = part_id
            
            return True, conflict
    
    def _resolve_conflict(self, partition_key: str,
                          local_ver: int, local_ts: float, local_source: str,
                          remote_ver: int, remote_ts: float, remote_source: str) -> ConflictRecord:
        if remote_ver > local_ver:
            resolution = 'version_wins'
            winner_source = remote_source
        elif local_ver > remote_ver:
            resolution = 'version_wins'
            winner_source = local_source
        elif remote_ts > local_ts:
            resolution = 'timestamp_wins'
            winner_source = remote_source
        elif local_ts > remote_ts:
            resolution = 'timestamp_wins'
            winner_source = local_source
        else:
            resolution = 'id_tiebreak'
            winner_source = min(local_source, remote_source)
        
        conflict = ConflictRecord(
            conflict_id=f'conflict-{uuid.uuid4().hex[:8]}',
            partition_key=partition_key,
            local_version=local_ver,
            remote_version=remote_ver,
            local_timestamp=local_ts,
            remote_timestamp=remote_ts,
            local_source=local_source,
            remote_source=remote_source,
            resolution=resolution,
            winner_source=winner_source,
            resolved_at=time.time()
        )
        
        self._conflicts.append(conflict)
        
        if self._on_conflict:
            self._on_conflict(self.id, conflict)
        
        return conflict
    
    def get_block(self, block_id: str) -> Optional[DataBlock]:
        with self._lock:
            return self._data.get(block_id)
    
    def get_parts_since(self, after_part_id: Optional[str] = None) -> List[PartLogEntry]:
        with self._lock:
            if after_part_id is None:
                return list(self._part_log)
            
            found = False
            result = []
            for entry in self._part_log:
                if found:
                    result.append(entry)
                elif entry.part_id == after_part_id:
                    found = True
            
            return result
    
    def start_sync_process(self):
        if self._sync_thread and self._sync_thread.is_alive():
            return
        
        self._stop_sync.clear()
        self._pause_sync.clear()
        self._sync_thread = threading.Thread(target=self._sync_worker, daemon=True)
        self._sync_thread.start()
    
    def stop_sync_process(self):
        self._stop_sync.set()
        if self._sync_thread:
            self._sync_thread.join(timeout=2)
    
    def pause_sync(self):
        self._pause_sync.set()
    
    def resume_sync(self):
        self._pause_sync.clear()
    
    def _simulate_network_delay(self) -> float:
        import random
        return random.uniform(0.1, 0.4)
    
    def _simulate_download_time(self) -> float:
        import random
        return random.uniform(0.2, 0.8)
    
    def _simulate_apply_time(self) -> float:
        import random
        return random.uniform(0.1, 0.5)
    
    def _sync_worker(self):
        while not self._stop_sync.is_set():
            if self._pause_sync.is_set():
                time.sleep(0.1)
                continue
            
            item_to_process = None
            
            with self._lock:
                for block_id, item in self._sync_queue.items():
                    if item.status in ('pending', 'downloading', 'applying'):
                        item_to_process = item
                        break
            
            if item_to_process is None:
                with self._lock:
                    if not self._sync_queue:
                        self._status = 'online'
                time.sleep(0.1)
                continue
            
            try:
                if item_to_process.status == 'pending':
                    time.sleep(self._simulate_network_delay())
                    item_to_process.status = 'downloading'
                    item_to_process.progress = 0
                    if self._on_sync_progress:
                        self._on_sync_progress(self.id, item_to_process.block_id, 0, 'downloading')
                
                elif item_to_process.status == 'downloading':
                    download_time = self._simulate_download_time()
                    steps = 10
                    for i in range(1, steps + 1):
                        if self._stop_sync.is_set() or self._pause_sync.is_set():
                            break
                        time.sleep(download_time / steps)
                        item_to_process.progress = i * 10
                        if self._on_sync_progress:
                            self._on_sync_progress(self.id, item_to_process.block_id, i * 10, 'downloading')
                    
                    if not self._stop_sync.is_set() and not self._pause_sync.is_set():
                        item_to_process.status = 'applying'
                        item_to_process.progress = 100
                        if self._on_sync_progress:
                            self._on_sync_progress(self.id, item_to_process.block_id, 100, 'applying')
                
                elif item_to_process.status == 'applying':
                    time.sleep(self._simulate_apply_time())
                    
                    source_replica_id = item_to_process.source_replica
                    source_replica = self._get_source_replica(source_replica_id)
                    
                    if source_replica:
                        block = source_replica.get_block(item_to_process.block_id)
                        if block:
                            applied, conflict = self.apply_block(block)
                            
                            self.zk.mark_replica_completed(item_to_process.log_id, self.id)
                            
                            if conflict:
                                self.zk.add_conflict_log(conflict)
                            
                            item_to_process.status = 'completed'
                            if self._on_sync_complete:
                                self._on_sync_complete(self.id, item_to_process.block_id, conflict)
                            
                            with self._lock:
                                del self._sync_queue[item_to_process.block_id]
                        else:
                            item_to_process.status = 'pending'
                            item_to_process.progress = 0
                    else:
                        item_to_process.status = 'pending'
                        item_to_process.progress = 0
            
            except Exception:
                time.sleep(0.5)
                continue
    
    def _get_source_replica(self, replica_id: str):
        return None
    
    def set_source_replica_provider(self, provider: Callable[[str], Optional['ClickHouseReplica']]):
        self._get_source_replica = provider
    
    def set_sync_complete_callback(self, callback: Callable):
        self._on_sync_complete = callback
    
    def set_sync_progress_callback(self, callback: Callable):
        self._on_sync_progress = callback
    
    def set_conflict_callback(self, callback: Callable):
        self._on_conflict = callback
    
    def set_dedup_callback(self, callback: Callable):
        self._on_dedup = callback
    
    def set_latency_callback(self, callback: Callable):
        self._on_latency = callback
    
    def get_dedup_records(self) -> List[DedupRecord]:
        with self._lock:
            return list(self._dedup_records)
    
    def get_latency_records(self) -> List[LatencyRecord]:
        with self._lock:
            return list(self._latency_records)
    
    def get_latency_stats(self) -> Dict:
        with self._lock:
            if not self._latency_records:
                return {
                    'count': 0,
                    'avg_ms': 0,
                    'min_ms': 0,
                    'max_ms': 0,
                    'p50_ms': 0,
                    'p95_ms': 0,
                    'p99_ms': 0
                }
            
            latencies = sorted([r.latency_ms for r in self._latency_records])
            n = len(latencies)
            
            def percentile(p):
                k = (n - 1) * p
                f = int(k)
                c = min(f + 1, n - 1)
                if f == c:
                    return latencies[f]
                return latencies[f] + (latencies[c] - latencies[f]) * (k - f)
            
            return {
                'count': n,
                'avg_ms': round(sum(latencies) / n, 2),
                'min_ms': round(latencies[0], 2),
                'max_ms': round(latencies[-1], 2),
                'p50_ms': round(percentile(0.50), 2),
                'p95_ms': round(percentile(0.95), 2),
                'p99_ms': round(percentile(0.99), 2)
            }
    
    def set_leader(self, is_leader: bool):
        self._is_leader = is_leader
    
    def is_leader(self) -> bool:
        return self._is_leader
    
    def get_sync_progress(self, block_id: str) -> Optional[Dict]:
        with self._lock:
            item = self._sync_queue.get(block_id)
            if item:
                return {
                    'block_id': item.block_id,
                    'progress': item.progress,
                    'status': item.status,
                    'start_time': item.start_time
                }
            return None
    
    def get_status(self) -> Dict:
        with self._lock:
            sync_queue_list = []
            for item in self._sync_queue.values():
                sync_queue_list.append({
                    'block_id': item.block_id,
                    'progress': item.progress,
                    'status': item.status,
                    'start_time': item.start_time,
                    'source_replica': item.source_replica,
                    'part_ids': item.part_ids
                })
            
            data_list = []
            for block in sorted(self._data.values(), key=lambda b: b.block_number):
                data_list.append({
                    'id': block.id,
                    'content': block.content,
                    'source_replica': block.source_replica,
                    'timestamp': block.timestamp,
                    'block_number': block.block_number,
                    'version': block.version,
                    'partition_key': block.partition_key
                })
            
            part_log_list = []
            for entry in self._part_log[-20:]:
                part_log_list.append({
                    'part_id': entry.part_id,
                    'block_id': entry.block_id,
                    'partition_key': entry.partition_key,
                    'operation': entry.operation,
                    'content': entry.content,
                    'version': entry.version,
                    'timestamp': entry.timestamp,
                    'source_replica': entry.source_replica,
                    'prev_version': entry.prev_version
                })
            
            latest_block = max(self._data.values(), key=lambda b: b.timestamp) if self._data else None
            sync_lag = 0
            if latest_block and self._last_sync_time:
                sync_lag = max(0, latest_block.timestamp - self._last_sync_time)
            
            conflicts_list = []
            for c in self._conflicts:
                conflicts_list.append({
                    'conflict_id': c.conflict_id,
                    'partition_key': c.partition_key,
                    'local_version': c.local_version,
                    'remote_version': c.remote_version,
                    'local_timestamp': c.local_timestamp,
                    'remote_timestamp': c.remote_timestamp,
                    'local_source': c.local_source,
                    'remote_source': c.remote_source,
                    'resolution': c.resolution,
                    'winner_source': c.winner_source,
                    'resolved_at': c.resolved_at
                })
            
            dedup_list = []
            for d in self._dedup_records[-10:]:
                dedup_list.append({
                    'content_hash': d.content_hash,
                    'block_id': d.block_id,
                    'duplicate_of_block_id': d.duplicate_of_block_id,
                    'detected_at': d.detected_at,
                    'detected_by': d.detected_by,
                    'partition_key': d.partition_key
                })
            
            latency_stats = self.get_latency_stats()
            
            return {
                'id': self.id,
                'name': self.name,
                'host': self.host,
                'port': self.port,
                'status': self._status,
                'isLeader': self._is_leader,
                'dataCount': len(self._data),
                'lastSyncTime': self._last_sync_time,
                'syncLag': round(sync_lag, 3),
                'data': data_list,
                'syncQueue': sync_queue_list,
                'partLog': part_log_list,
                'partLogCount': len(self._part_log),
                'lastAppliedPart': self._last_applied_part,
                'conflicts': conflicts_list,
                'conflictCount': len(self._conflicts),
                'partitionVersions': {
                    pk: {'version': v, 'source': s, 'timestamp': ts}
                    for pk, (v, s, ts) in self._partition_versions.items()
                },
                'dedupCount': len(self._dedup_records),
                'dedupRecords': dedup_list,
                'latencyStats': latency_stats
            }
    
    def reset(self):
        with self._lock:
            self._data = {}
            self._block_counter = 0
            self._sync_queue = {}
            self._last_sync_time = None
            self._is_leader = False
            self._status = 'online'
            self._stop_sync.clear()
            self._pause_sync.clear()
            self._part_log = []
            self._part_log_index = {}
            self._last_applied_part = None
            self._partition_versions = {}
            self._conflicts = []
            self._content_hash_index = {}
            self._dedup_records = []
            self._latency_records = []
