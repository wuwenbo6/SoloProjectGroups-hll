import time
import threading
from typing import Dict, List, Optional, Callable

from simulator.zookeeper import ZooKeeperSimulator
from simulator.replica import ClickHouseReplica


class ReplicationManager:
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self, replica_count: int = 3):
        if hasattr(self, '_initialized'):
            return
        
        self._initialized = True
        self._lock = threading.RLock()
        
        self.zk = ZooKeeperSimulator()
        self.replicas: Dict[str, ClickHouseReplica] = {}
        self.replica_count = replica_count
        
        self._is_paused = False
        self._sync_progress_callbacks: List[Callable] = []
        self._sync_complete_callbacks: List[Callable] = []
        self._conflict_callbacks: List[Callable] = []
        self._dedup_callbacks: List[Callable] = []
        self._latency_callbacks: List[Callable] = []
        
        self._initialize_replicas()
        self._elect_leader()
        self._start_all_sync_processes()
    
    def _initialize_replicas(self):
        replica_configs = [
            {'id': 'replica-1', 'name': '副本1', 'host': '192.168.1.101', 'port': 9000},
            {'id': 'replica-2', 'name': '副本2', 'host': '192.168.1.102', 'port': 9000},
            {'id': 'replica-3', 'name': '副本3', 'host': '192.168.1.103', 'port': 9000},
        ]
        
        for config in replica_configs[:self.replica_count]:
            replica = ClickHouseReplica(
                replica_id=config['id'],
                name=config['name'],
                host=config['host'],
                port=config['port'],
                zk=self.zk
            )
            
            replica.set_source_replica_provider(self._get_replica)
            replica.set_sync_progress_callback(self._on_sync_progress)
            replica.set_sync_complete_callback(self._on_sync_complete)
            replica.set_conflict_callback(self._on_conflict)
            replica.set_dedup_callback(self._on_dedup)
            replica.set_latency_callback(self._on_latency)
            
            self.replicas[config['id']] = replica
    
    def _elect_leader(self):
        replica_ids = list(self.replicas.keys())
        leader_id = self.zk.elect_leader(replica_ids)
        
        for replica in self.replicas.values():
            replica.set_leader(replica.id == leader_id)
    
    def _start_all_sync_processes(self):
        for replica in self.replicas.values():
            replica.start_sync_process()
    
    def _get_replica(self, replica_id: str) -> Optional[ClickHouseReplica]:
        return self.replicas.get(replica_id)
    
    def _on_sync_progress(self, replica_id: str, block_id: str, progress: int, status: str):
        for callback in self._sync_progress_callbacks:
            try:
                callback(replica_id, block_id, progress, status)
            except Exception:
                pass
    
    def _on_sync_complete(self, replica_id: str, block_id: str, conflict=None):
        for callback in self._sync_complete_callbacks:
            try:
                callback(replica_id, block_id, conflict)
            except Exception:
                pass
    
    def _on_conflict(self, replica_id: str, conflict):
        for callback in self._conflict_callbacks:
            try:
                callback(replica_id, conflict)
            except Exception:
                pass
    
    def _on_dedup(self, replica_id: str, dedup_record):
        for callback in self._dedup_callbacks:
            try:
                callback(replica_id, dedup_record)
            except Exception:
                pass
    
    def _on_latency(self, replica_id: str, latency_record):
        for callback in self._latency_callbacks:
            try:
                callback(replica_id, latency_record)
            except Exception:
                pass
    
    def add_sync_progress_callback(self, callback: Callable):
        self._sync_progress_callbacks.append(callback)
    
    def add_sync_complete_callback(self, callback: Callable):
        self._sync_complete_callbacks.append(callback)
    
    def add_conflict_callback(self, callback: Callable):
        self._conflict_callbacks.append(callback)
    
    def add_dedup_callback(self, callback: Callable):
        self._dedup_callbacks.append(callback)
    
    def add_latency_callback(self, callback: Callable):
        self._latency_callbacks.append(callback)
    
    def get_dedup_records(self) -> List[Dict]:
        with self._lock:
            all_dedup = []
            for replica in self.replicas.values():
                for d in replica.get_dedup_records():
                    all_dedup.append({
                        'content_hash': d.content_hash,
                        'block_id': d.block_id,
                        'duplicate_of_block_id': d.duplicate_of_block_id,
                        'detected_at': d.detected_at,
                        'detected_by': d.detected_by,
                        'partition_key': d.partition_key
                    })
            all_dedup.sort(key=lambda x: x['detected_at'], reverse=True)
            return all_dedup
    
    def get_latency_report(self) -> Dict:
        with self._lock:
            all_latency = []
            per_replica_stats = {}
            
            for replica in self.replicas.values():
                records = replica.get_latency_records()
                stats = replica.get_latency_stats()
                per_replica_stats[replica.id] = {
                    'name': replica.name,
                    'stats': stats,
                    'records': [
                        {
                            'block_id': r.block_id,
                            'source_replica': r.source_replica,
                            'latency_ms': round(r.latency_ms, 2),
                            'partition_key': r.partition_key,
                            'version': r.version,
                            'insert_time': r.insert_time,
                            'apply_time': r.apply_time
                        }
                        for r in records[-20:]
                    ]
                }
                all_latency.extend([r.latency_ms for r in records])
            
            overall_stats = {'count': 0, 'avg_ms': 0, 'min_ms': 0, 'max_ms': 0, 'p50_ms': 0, 'p95_ms': 0, 'p99_ms': 0}
            if all_latency:
                latencies = sorted(all_latency)
                n = len(latencies)
                
                def percentile(p):
                    k = (n - 1) * p
                    f = int(k)
                    c = min(f + 1, n - 1)
                    if f == c:
                        return latencies[f]
                    return latencies[f] + (latencies[c] - latencies[f]) * (k - f)
                
                overall_stats = {
                    'count': n,
                    'avg_ms': round(sum(latencies) / n, 2),
                    'min_ms': round(latencies[0], 2),
                    'max_ms': round(latencies[-1], 2),
                    'p50_ms': round(percentile(0.50), 2),
                    'p95_ms': round(percentile(0.95), 2),
                    'p99_ms': round(percentile(0.99), 2)
                }
            
            return {
                'overall': overall_stats,
                'per_replica': per_replica_stats,
                'generated_at': time.time()
            }
    
    def insert_to_replica(self, replica_id: str, content: str) -> Dict:
        with self._lock:
            replica = self.replicas.get(replica_id)
            if not replica:
                return {
                    'success': False,
                    'message': f'Replica {replica_id} not found'
                }
            
            result = replica.insert_data(content)
            
            if result.get('is_duplicate'):
                return {
                    'success': True,
                    'block_id': result['block_id'],
                    'is_duplicate': True,
                    'duplicate_of': result.get('duplicate_of'),
                    'partition_key': result.get('partition_key', ''),
                    'version': result.get('version', 1),
                    'message': 'Duplicate data detected, skipped insertion and replication'
                }
            
            if result['success']:
                other_replicas = [
                    rid for rid in self.replicas.keys()
                    if rid != replica_id
                ]
                
                self.zk.add_replication_log(
                    block_id=result['block_id'],
                    source_replica=replica_id,
                    replicas_to_sync=other_replicas,
                    part_ids=[result['part_id']],
                    version=result['version'],
                    partition_key=result['partition_key'],
                    content_hash=result.get('content_hash', '')
                )
                
                self.zk.add_part_log(
                    part_id=result['part_id'],
                    block_id=result['block_id'],
                    partition_key=result['partition_key'],
                    operation='INSERT',
                    version=result['version'],
                    source_replica=replica_id,
                    prev_version=max(0, result['version'] - 1)
                )
            
            return {
                'success': True,
                'block_id': result['block_id'],
                'version': result['version'],
                'partition_key': result['partition_key'],
                'part_id': result['part_id'],
                'content_hash': result.get('content_hash', ''),
                'is_duplicate': False,
                'message': 'Data inserted successfully, replication started'
            }
    
    def get_all_status(self) -> Dict:
        with self._lock:
            replicas_status = []
            total_blocks = 0
            all_conflicts = []
            total_dedup = 0
            
            for replica in self.replicas.values():
                status = replica.get_status()
                replicas_status.append(status)
                total_blocks = max(total_blocks, status['dataCount'])
                all_conflicts.extend(status.get('conflicts', []))
                total_dedup += status.get('dedupCount', 0)
            
            return {
                'replicas': replicas_status,
                'isPaused': self._is_paused,
                'totalDataBlocks': total_blocks,
                'leader': self.zk.get_leader(),
                'conflicts': all_conflicts,
                'conflictCount': len(all_conflicts),
                'dedupCount': total_dedup
            }
    
    def get_zk_status(self) -> Dict:
        with self._lock:
            return {
                'leader': self.zk.get_leader(),
                'tree': self.zk.get_tree_structure(),
                'replicationLog': self.zk.get_replication_log(),
                'partLog': self.zk.get_part_log(),
                'conflictLog': self.zk.get_conflict_log()
            }
    
    def get_part_log(self) -> List[Dict]:
        with self._lock:
            return self.zk.get_part_log()
    
    def get_conflicts(self) -> Dict:
        with self._lock:
            all_conflicts = []
            for replica in self.replicas.values():
                status = replica.get_status()
                all_conflicts.extend(status.get('conflicts', []))
            return {
                'conflicts': all_conflicts,
                'conflictCount': len(all_conflicts),
                'zkConflictLog': self.zk.get_conflict_log()
            }
    
    def pause_replication(self) -> Dict:
        with self._lock:
            if self._is_paused:
                return {'success': True, 'message': 'Replication already paused'}
            
            self._is_paused = True
            for replica in self.replicas.values():
                replica.pause_sync()
            
            return {'success': True, 'message': 'Replication paused'}
    
    def resume_replication(self) -> Dict:
        with self._lock:
            if not self._is_paused:
                return {'success': True, 'message': 'Replication already running'}
            
            self._is_paused = False
            for replica in self.replicas.values():
                replica.resume_sync()
            
            return {'success': True, 'message': 'Replication resumed'}
    
    def reset(self) -> Dict:
        with self._lock:
            for replica in self.replicas.values():
                replica.stop_sync_process()
                replica.reset()
            
            self.zk.reset()
            self._is_paused = False
            
            for replica in self.replicas.values():
                replica._register_with_zk()
            
            self._elect_leader()
            self._start_all_sync_processes()
            
            return {'success': True, 'message': 'Cluster reset successfully'}
    
    def get_replica_count(self) -> int:
        return len(self.replicas)
    
    def get_replica_ids(self) -> List[str]:
        return list(self.replicas.keys())
    
    def shutdown(self):
        for replica in self.replicas.values():
            replica.stop_sync_process()
