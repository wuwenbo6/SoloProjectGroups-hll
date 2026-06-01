import time
import threading
from collections import deque
from dataclasses import dataclass, field
from typing import List, Dict, Optional

@dataclass
class ISCSISession:
    session_id: str
    initiator_name: str
    initiator_addr: tuple
    target_name: str
    tsih: int
    status: str = 'active'
    logged_in_at: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)
    cmd_count: int = 0
    data_read_bytes: int = 0
    data_written_bytes: int = 0
    read_ops: int = 0
    write_ops: int = 0
    connections: List = field(default_factory=list)
    cmd_history: deque = field(default_factory=lambda: deque(maxlen=300))
    read_history: deque = field(default_factory=lambda: deque(maxlen=300))
    write_history: deque = field(default_factory=lambda: deque(maxlen=300))
    
    def update_activity(self, is_read=False, is_write=False):
        current_time = time.time()
        self.last_activity = current_time
        self.cmd_count += 1
        self.cmd_history.append(current_time)
        
        if is_read:
            self.read_ops += 1
            self.read_history.append(current_time)
        if is_write:
            self.write_ops += 1
            self.write_history.append(current_time)
    
    def add_data_read(self, bytes_count):
        self.data_read_bytes += bytes_count
    
    def add_data_written(self, bytes_count):
        self.data_written_bytes += bytes_count
    
    def calculate_iops(self, window_seconds=10):
        current_time = time.time()
        window_start = current_time - window_seconds
        
        total_ops = sum(1 for t in self.cmd_history if t > window_start)
        read_ops = sum(1 for t in self.read_history if t > window_start)
        write_ops = sum(1 for t in self.write_history if t > window_start)
        
        total_iops = total_ops / window_seconds
        read_iops = read_ops / window_seconds
        write_iops = write_ops / window_seconds
        
        return {
            'total_iops': round(total_iops, 2),
            'read_iops': round(read_iops, 2),
            'write_iops': round(write_iops, 2),
            'total_ops': total_ops,
            'read_ops': read_ops,
            'write_ops': write_ops,
            'window': window_seconds
        }
    
    def calculate_bandwidth_mbps(self, window_seconds=10):
        if self.data_read_bytes + self.data_written_bytes == 0:
            return {'read_mbps': 0, 'write_mbps': 0, 'total_mbps': 0}
        
        duration = max(1, time.time() - self.logged_in_at)
        read_mbps = (self.data_read_bytes / (1024 * 1024)) / duration
        write_mbps = (self.data_written_bytes / (1024 * 1024)) / duration
        
        return {
            'read_mbps': round(read_mbps, 2),
            'write_mbps': round(write_mbps, 2),
            'total_mbps': round(read_mbps + write_mbps, 2)
        }
    
    def to_dict(self):
        iops = self.calculate_iops()
        bandwidth = self.calculate_bandwidth_mbps()
        
        return {
            'session_id': self.session_id,
            'initiator_name': self.initiator_name,
            'initiator_ip': self.initiator_addr[0],
            'initiator_port': self.initiator_addr[1],
            'target_name': self.target_name,
            'tsih': self.tsih,
            'status': self.status,
            'logged_in_at': self.logged_in_at,
            'last_activity': self.last_activity,
            'duration': time.time() - self.logged_in_at,
            'cmd_count': self.cmd_count,
            'read_ops_total': self.read_ops,
            'write_ops_total': self.write_ops,
            'data_read_mb': round(self.data_read_bytes / (1024 * 1024), 2),
            'data_written_mb': round(self.data_written_bytes / (1024 * 1024), 2),
            'connections': len(self.connections),
            'iops': iops,
            'bandwidth': bandwidth
        }

class SessionManager:
    def __init__(self):
        self.sessions: Dict[str, ISCSISession] = {}
        self.lock = threading.Lock()
        self._next_tsih = 1
    
    def get_next_tsih(self):
        with self.lock:
            tsih = self._next_tsih
            self._next_tsih += 1
            return tsih
    
    def create_session(self, session_id: str, initiator_name: str, 
                       initiator_addr: tuple, target_name: str) -> ISCSISession:
        with self.lock:
            tsih = self.get_next_tsih()
            session = ISCSISession(
                session_id=session_id,
                initiator_name=initiator_name,
                initiator_addr=initiator_addr,
                target_name=target_name,
                tsih=tsih
            )
            self.sessions[session_id] = session
            return session
    
    def get_session(self, session_id: str) -> Optional[ISCSISession]:
        with self.lock:
            return self.sessions.get(session_id)
    
    def remove_session(self, session_id: str):
        with self.lock:
            if session_id in self.sessions:
                self.sessions[session_id].status = 'disconnected'
                del self.sessions[session_id]
    
    def get_all_sessions(self) -> List[ISCSISession]:
        with self.lock:
            return list(self.sessions.values())
    
    def get_sessions_info(self) -> List[dict]:
        with self.lock:
            return [s.to_dict() for s in self.sessions.values()]
    
    def get_session_count(self) -> int:
        with self.lock:
            return len(self.sessions)
    
    def update_session_activity(self, session_id: str, bytes_read: int = 0, bytes_written: int = 0, is_read=False, is_write=False):
        with self.lock:
            session = self.sessions.get(session_id)
            if session:
                session.update_activity(is_read=is_read, is_write=is_write)
                if bytes_read > 0:
                    session.add_data_read(bytes_read)
                if bytes_written > 0:
                    session.add_data_written(bytes_written)
    
    def cleanup_inactive_sessions(self, timeout: int = 300):
        current_time = time.time()
        with self.lock:
            inactive = [
                sid for sid, s in self.sessions.items()
                if current_time - s.last_activity > timeout
            ]
            for sid in inactive:
                self.sessions[sid].status = 'timed_out'
                del self.sessions[sid]
            return len(inactive)
