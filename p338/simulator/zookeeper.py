import time
import uuid
import threading
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional


@dataclass
class ZKNode:
    path: str
    value: Any
    ephemeral: bool = False
    createdAt: float = field(default_factory=time.time)
    children: Dict[str, 'ZKNode'] = field(default_factory=dict)


class ZooKeeperSimulator:
    def __init__(self):
        self._lock = threading.RLock()
        self._root = ZKNode(path='/', value=None)
        self._watchers: Dict[str, List[Callable]] = {}
        self._ephemeral_nodes: Dict[str, str] = {}
        self._leader: Optional[str] = None
        self._replication_log: List[Dict] = []
        self._part_log: List[Dict] = []
        self._conflict_log: List[Dict] = []
        
        self._initialize_structure()
    
    def _initialize_structure(self):
        self.create_node('/clickhouse', {'cluster': 'default'})
        self.create_node('/clickhouse/tables', {})
        self.create_node('/clickhouse/replicas', {})
        self.create_node('/clickhouse/leader_election', {})
        self.create_node('/clickhouse/replication_log', {})
        self.create_node('/clickhouse/part_log', {})
        self.create_node('/clickhouse/conflict_log', {})
    
    def _get_parent_path(self, path: str) -> str:
        if path == '/':
            return '/'
        parts = path.rstrip('/').split('/')
        return '/'.join(parts[:-1]) or '/'
    
    def _get_node_name(self, path: str) -> str:
        return path.rstrip('/').split('/')[-1]
    
    def _traverse_to_node(self, path: str) -> Optional[ZKNode]:
        if path == '/':
            return self._root
        
        parts = path.strip('/').split('/')
        current = self._root
        
        for part in parts:
            if part not in current.children:
                return None
            current = current.children[part]
        
        return current
    
    def create_node(self, path: str, value: Any, ephemeral: bool = False, owner: str = None) -> bool:
        with self._lock:
            if self._traverse_to_node(path) is not None:
                return False
            
            parent_path = self._get_parent_path(path)
            parent = self._traverse_to_node(parent_path)
            
            if parent is None:
                return False
            
            node_name = self._get_node_name(path)
            new_node = ZKNode(path=path, value=value, ephemeral=ephemeral)
            parent.children[node_name] = new_node
            
            if ephemeral and owner:
                self._ephemeral_nodes[path] = owner
            
            self._notify_watchers(parent_path, 'child_created', path)
            self._notify_watchers(path, 'created', value)
            
            return True
    
    def get_node(self, path: str) -> Optional[Dict]:
        with self._lock:
            node = self._traverse_to_node(path)
            if node is None:
                return None
            
            return {
                'path': node.path,
                'value': node.value,
                'ephemeral': node.ephemeral,
                'createdAt': node.createdAt,
                'children': list(node.children.keys())
            }
    
    def set_data(self, path: str, value: Any) -> bool:
        with self._lock:
            node = self._traverse_to_node(path)
            if node is None:
                return False
            
            node.value = value
            self._notify_watchers(path, 'data_changed', value)
            return True
    
    def get_children(self, path: str) -> List[str]:
        with self._lock:
            node = self._traverse_to_node(path)
            if node is None:
                return []
            return list(node.children.keys())
    
    def delete_node(self, path: str) -> bool:
        with self._lock:
            if path == '/':
                return False
            
            parent_path = self._get_parent_path(path)
            parent = self._traverse_to_node(parent_path)
            
            if parent is None:
                return False
            
            node_name = self._get_node_name(path)
            if node_name not in parent.children:
                return False
            
            node = parent.children[node_name]
            
            if node.children:
                return False
            
            del parent.children[node_name]
            
            if path in self._ephemeral_nodes:
                del self._ephemeral_nodes[path]
            
            self._notify_watchers(parent_path, 'child_deleted', path)
            self._notify_watchers(path, 'deleted', None)
            
            return True
    
    def watch(self, path: str, callback: Callable) -> None:
        with self._lock:
            if path not in self._watchers:
                self._watchers[path] = []
            self._watchers[path].append(callback)
    
    def _notify_watchers(self, path: str, event_type: str, data: Any):
        if path in self._watchers:
            for callback in self._watchers[path]:
                try:
                    callback(event_type, path, data)
                except Exception:
                    pass
    
    def elect_leader(self, replica_ids: List[str]) -> str:
        with self._lock:
            election_path = '/clickhouse/leader_election'
            
            for replica_id in replica_ids:
                candidate_path = f'{election_path}/{replica_id}'
                self.create_node(candidate_path, {'replica_id': replica_id, 'timestamp': time.time()}, ephemeral=True, owner=replica_id)
            
            children = sorted(self.get_children(election_path))
            
            if children:
                self._leader = children[0]
                self.set_data('/clickhouse/leader', {'leader': self._leader, 'elected_at': time.time()})
                return self._leader
            
            return None
    
    def get_leader(self) -> Optional[str]:
        return self._leader
    
    def add_replication_log(self, block_id: str, source_replica: str, replicas_to_sync: List[str], part_ids: List[str] = None, version: int = 1, partition_key: str = '', content_hash: str = '') -> str:
        with self._lock:
            log_id = f'log-{uuid.uuid4().hex[:8]}'
            log_path = f'/clickhouse/replication_log/{log_id}'
            
            log_entry = {
                'id': log_id,
                'block_id': block_id,
                'source_replica': source_replica,
                'timestamp': time.time(),
                'replicas_to_sync': replicas_to_sync,
                'completed_replicas': [],
                'part_ids': part_ids or [],
                'version': version,
                'partition_key': partition_key,
                'content_hash': content_hash
            }
            
            self.create_node(log_path, log_entry)
            self._replication_log.append(log_entry)
            
            self._notify_watchers('/clickhouse/replication_log', 'new_log', log_entry)
            
            return log_id
    
    def mark_replica_completed(self, log_id: str, replica_id: str) -> bool:
        with self._lock:
            log_path = f'/clickhouse/replication_log/{log_id}'
            node = self.get_node(log_path)
            
            if node is None:
                return False
            
            value = node['value']
            if replica_id not in value['completed_replicas']:
                value['completed_replicas'].append(replica_id)
                self.set_data(log_path, value)
                
                for log_entry in self._replication_log:
                    if log_entry['id'] == log_id:
                        log_entry['completed_replicas'] = value['completed_replicas']
                        break
            
            return True
    
    def get_replication_log(self) -> List[Dict]:
        with self._lock:
            return list(self._replication_log)
    
    def add_part_log(self, part_id: str, block_id: str, partition_key: str, operation: str,
                     version: int, source_replica: str, prev_version: int = 0) -> bool:
        with self._lock:
            part_path = f'/clickhouse/part_log/{part_id}'
            
            part_entry = {
                'part_id': part_id,
                'block_id': block_id,
                'partition_key': partition_key,
                'operation': operation,
                'version': version,
                'prev_version': prev_version,
                'source_replica': source_replica,
                'timestamp': time.time()
            }
            
            self.create_node(part_path, part_entry)
            self._part_log.append(part_entry)
            
            self._notify_watchers('/clickhouse/part_log', 'new_part', part_entry)
            
            return True
    
    def get_part_log(self) -> List[Dict]:
        with self._lock:
            return list(self._part_log)
    
    def add_conflict_log(self, conflict) -> bool:
        with self._lock:
            conflict_path = f'/clickhouse/conflict_log/{conflict.conflict_id}'
            
            conflict_entry = {
                'conflict_id': conflict.conflict_id,
                'partition_key': conflict.partition_key,
                'local_version': conflict.local_version,
                'remote_version': conflict.remote_version,
                'local_timestamp': conflict.local_timestamp,
                'remote_timestamp': conflict.remote_timestamp,
                'local_source': conflict.local_source,
                'remote_source': conflict.remote_source,
                'resolution': conflict.resolution,
                'winner_source': conflict.winner_source,
                'resolved_at': conflict.resolved_at
            }
            
            self.create_node(conflict_path, conflict_entry)
            self._conflict_log.append(conflict_entry)
            
            self._notify_watchers('/clickhouse/conflict_log', 'new_conflict', conflict_entry)
            
            return True
    
    def get_conflict_log(self) -> List[Dict]:
        with self._lock:
            return list(self._conflict_log)
    
    def get_tree_structure(self) -> Dict:
        def build_tree(node: ZKNode) -> Dict:
            return {
                'path': node.path,
                'value': node.value,
                'ephemeral': node.ephemeral,
                'createdAt': node.createdAt,
                'children': [build_tree(child) for child in node.children.values()]
            }
        
        with self._lock:
            return build_tree(self._root)
    
    def cleanup_ephemeral(self, owner: str) -> None:
        with self._lock:
            paths_to_delete = [
                path for path, node_owner in self._ephemeral_nodes.items()
                if node_owner == owner
            ]
            for path in paths_to_delete:
                self.delete_node(path)
    
    def reset(self) -> None:
        with self._lock:
            self._root = ZKNode(path='/', value=None)
            self._watchers = {}
            self._ephemeral_nodes = {}
            self._leader = None
            self._replication_log = []
            self._part_log = []
            self._conflict_log = []
            self._initialize_structure()
