import asyncio
import json
import random
import math
from typing import List, Dict, Tuple
from collections import deque
from dataclasses import dataclass, field
from .idl.vehicle_types import (
    VehicleState, Position, Orientation, Path, Waypoint, current_timestamp
)

@dataclass
class DiagnosticLog:
    timestamp: float
    vehicle_id: str
    event_type: str
    level: str
    message: str
    data: dict = field(default_factory=dict)

class DDSPublisher:
    def __init__(self, vehicle_id: str, priority: int = None):
        self.vehicle_id = vehicle_id
        self.priority = priority if priority is not None else int(vehicle_id.split('_')[-1])
        self.state_callbacks = []
        self.path_callbacks = []
        self.heartbeat_callbacks = []
        self.replan_callbacks = []
        
        self.peer_states: Dict[str, dict] = {}
        self.peer_paths: Dict[str, dict] = {}
        self.peer_last_seen: Dict[str, float] = {}
        
        self.state_history = deque(maxlen=100)
        self.heartbeat_interval = 1.0
        self.data_timeout = 3.0
        
        self._state = VehicleState(
            vehicle_id=vehicle_id,
            timestamp=current_timestamp(),
            position=Position(x=random.uniform(-50, 50), y=random.uniform(-50, 50), z=0),
            orientation=Orientation(roll=0, pitch=0, yaw=random.uniform(0, 2 * math.pi)),
            velocity=random.uniform(2.0, 8.0)
        )
        self._original_velocity = self._state.velocity
        self._target_path = self._generate_path()
        
        self._resolution_cooldown = {}
        self._pending_actions = []
        
        self.diagnostic_logs: deque = deque(maxlen=1000)
        self._replan_cooldown = 0.0
        self._last_central_heartbeat = current_timestamp()
        self._central_timeout = 5.0
        self._is_local_mode = False
        
        self.obstacle_history: deque = deque(maxlen=50)
        self.local_decisions: deque = deque(maxlen=50)

    def add_state_callback(self, callback):
        self.state_callbacks.append(callback)

    def add_path_callback(self, callback):
        self.path_callbacks.append(callback)

    def add_heartbeat_callback(self, callback):
        self.heartbeat_callbacks.append(callback)

    def add_replan_callback(self, callback):
        self.replan_callbacks.append(callback)

    def log_diagnostic(self, event_type: str, level: str, message: str, data: dict = None):
        log = DiagnosticLog(
            timestamp=current_timestamp(),
            vehicle_id=self.vehicle_id,
            event_type=event_type,
            level=level,
            message=message,
            data=data or {}
        )
        self.diagnostic_logs.append(log)

    def get_diagnostic_logs(self, min_level: str = None) -> List[dict]:
        level_order = {'debug': 0, 'info': 1, 'warning': 2, 'error': 3}
        min_level_value = level_order.get(min_level, 0) if min_level else 0
        
        return [
            {
                'timestamp': log.timestamp,
                'vehicle_id': log.vehicle_id,
                'event_type': log.event_type,
                'level': log.level,
                'message': log.message,
                'data': log.data
            }
            for log in self.diagnostic_logs
            if level_order.get(log.level, 0) >= min_level_value
        ]

    def receive_central_heartbeat(self):
        self._last_central_heartbeat = current_timestamp()
        if self._is_local_mode:
            self._is_local_mode = False
            self.log_diagnostic('mode_change', 'info', '恢复中央控制模式')

    def receive_peer_state(self, state: dict):
        peer_id = state['vehicle_id']
        if peer_id == self.vehicle_id:
            return
        self.peer_states[peer_id] = state
        self.peer_last_seen[peer_id] = current_timestamp()

    def receive_peer_path(self, path: dict):
        peer_id = path['vehicle_id']
        if peer_id == self.vehicle_id:
            return
        self.peer_paths[peer_id] = path

    def receive_heartbeat(self, heartbeat: dict):
        peer_id = heartbeat['vehicle_id']
        self.peer_last_seen[peer_id] = heartbeat['timestamp']
        
        if heartbeat.get('request_snapshot') and peer_id not in self.peer_states:
            asyncio.create_task(self._publish_full_state())

    def get_active_peers(self) -> List[str]:
        now = current_timestamp()
        return [
            peer_id for peer_id, last_seen in self.peer_last_seen.items()
            if now - last_seen < self.data_timeout
        ]

    async def _publish_full_state(self):
        state_dict = self._get_state_dict()
        for callback in self.state_callbacks:
            await callback(state_dict)
        
        path_dict = self._get_path_dict()
        for callback in self.path_callbacks:
            await callback(path_dict)

    def _predict_peer_position(self, peer_id: str, time_ahead: float) -> dict:
        if peer_id not in self.peer_states:
            return None
        
        state = self.peer_states[peer_id]
        pos = state['position'].copy()
        yaw = state['orientation']['yaw']
        vel = state['velocity']
        
        pos['x'] += math.cos(yaw) * vel * time_ahead
        pos['y'] += math.sin(yaw) * vel * time_ahead
        
        return pos

    def _distance(self, p1: dict, p2: dict) -> float:
        return math.sqrt(
            (p1['x'] - p2['x']) ** 2 +
            (p1['y'] - p2['y']) ** 2
        )

    def detect_local_conflicts(self) -> List[dict]:
        conflicts = []
        my_pos = self._state.position
        my_yaw = self._state.orientation.yaw
        
        for peer_id, peer_state in self.peer_states.items():
            if current_timestamp() - self.peer_last_seen.get(peer_id, 0) > self.data_timeout:
                continue
            
            for t in range(0, 30, 5):
                time_ahead = t / 10.0
                peer_pred = self._predict_peer_position(peer_id, time_ahead)
                
                if peer_pred:
                    my_pred = {
                        'x': my_pos.x + math.cos(my_yaw) * self._state.velocity * time_ahead,
                        'y': my_pos.y + math.sin(my_yaw) * self._state.velocity * time_ahead
                    }
                    
                    dist = self._distance(my_pred, peer_pred)
                    if dist < 8.0:
                        conflicts.append({
                            'peer_id': peer_id,
                            'distance': dist,
                            'time_ahead': time_ahead,
                            'peer_pos': peer_pred,
                            'my_pos': my_pred
                        })
                        break
        
        return conflicts

    async def trigger_replan(self, reason: str = 'local_conflict'):
        now = current_timestamp()
        if now - self._replan_cooldown < 1.0:
            return
        
        self._replan_cooldown = now
        self.log_diagnostic('replan', 'info', f'触发路径重规划: {reason}')
        
        new_path = self._generate_avoidance_path()
        if new_path:
            self._target_path = new_path
            self._target_path.timestamp = now
            
            path_dict = self._get_path_dict()
            path_dict['replan_reason'] = reason
            path_dict['is_local_replan'] = self._is_local_mode
            
            for callback in self.path_callbacks:
                await callback(path_dict)
            
            for callback in self.replan_callbacks:
                await callback(path_dict)

    def _generate_avoidance_path(self) -> Path:
        waypoints = []
        x, y = self._state.position.x, self._state.position.y
        yaw = self._state.orientation.yaw
        
        conflicts = self.detect_local_conflicts()
        avoidance_angle = 0.0
        
        if conflicts:
            worst_conflict = min(conflicts, key=lambda c: c['distance'])
            dx = worst_conflict['peer_pos']['x'] - x
            dy = worst_conflict['peer_pos']['y'] - y
            angle_to_peer = math.atan2(dy, dx)
            
            avoidance_direction = 1 if (yaw - angle_to_peer) < 0 else -1
            avoidance_angle = avoidance_direction * math.pi / 3
            self.log_diagnostic('avoidance', 'warning', 
                f'规避 {worst_conflict["peer_id"]}, 转向{math.degrees(avoidance_angle):.0f}度')
        
        for i in range(10):
            dist = (i + 1) * 5.0
            adjusted_yaw = yaw + avoidance_angle * (1 - i / 15)
            wx = x + math.cos(adjusted_yaw) * dist + random.uniform(-1, 1)
            wy = y + math.sin(adjusted_yaw) * dist + random.uniform(-1, 1)
            waypoints.append(Waypoint(
                position=Position(x=wx, y=wy, z=0),
                target_velocity=max(self._state.velocity * 0.7, 2.0)
            ))
        
        return Path(
            vehicle_id=self.vehicle_id,
            timestamp=current_timestamp(),
            waypoints=waypoints,
            planned_duration=10.0
        )

    def check_central_connection(self) -> bool:
        elapsed = current_timestamp() - self._last_central_heartbeat
        if elapsed > self._central_timeout and not self._is_local_mode:
            self._is_local_mode = True
            self.log_diagnostic('mode_change', 'warning', 
                f'中央通信中断 ({elapsed:.1f}s), 切换本地决策模式')
        return not self._is_local_mode

    def local_decision_cycle(self):
        if self._is_local_mode:
            conflicts = self.detect_local_conflicts()
            if conflicts:
                self.obstacle_history.append({
                    'timestamp': current_timestamp(),
                    'conflicts': conflicts
                })
                
                worst_conflict = min(conflicts, key=lambda c: c['distance'])
                if worst_conflict['distance'] < 4.0 and worst_conflict['time_ahead'] < 2.0:
                    self._state.velocity = max(self._state.velocity * 0.9, 1.0)
                elif worst_conflict['distance'] < 6.0:
                    asyncio.create_task(self.trigger_replan('local_avoidance'))
                
                decision = {
                    'timestamp': current_timestamp(),
                    'action': 'replan' if worst_conflict['distance'] < 6.0 else 'slow_down',
                    'conflicts_count': len(conflicts)
                }
                self.local_decisions.append(decision)
            else:
                self._state.velocity = min(self._state.velocity + 0.1, self._original_velocity)

    def _generate_path(self) -> Path:
        waypoints = []
        x, y = self._state.position.x, self._state.position.y
        yaw = self._state.orientation.yaw
        
        for i in range(10):
            dist = (i + 1) * 5.0
            wx = x + math.cos(yaw) * dist + random.uniform(-2, 2)
            wy = y + math.sin(yaw) * dist + random.uniform(-2, 2)
            waypoints.append(Waypoint(
                position=Position(x=wx, y=wy, z=0),
                target_velocity=self._state.velocity
            ))
        
        return Path(
            vehicle_id=self.vehicle_id,
            timestamp=current_timestamp(),
            waypoints=waypoints,
            planned_duration=10.0
        )

    def _get_state_dict(self) -> dict:
        return {
            'vehicle_id': self._state.vehicle_id,
            'timestamp': self._state.timestamp,
            'position': {
                'x': self._state.position.x,
                'y': self._state.position.y,
                'z': self._state.position.z
            },
            'orientation': {
                'roll': self._state.orientation.roll,
                'pitch': self._state.orientation.pitch,
                'yaw': self._state.orientation.yaw
            },
            'velocity': self._state.velocity,
            'priority': self.priority
        }

    def _get_path_dict(self) -> dict:
        return {
            'vehicle_id': self._target_path.vehicle_id,
            'timestamp': self._target_path.timestamp,
            'waypoints': [
                {
                    'position': {
                        'x': wp.position.x,
                        'y': wp.position.y,
                        'z': wp.position.z
                    },
                    'target_velocity': wp.target_velocity
                }
                for wp in self._target_path.waypoints
            ],
            'planned_duration': self._target_path.planned_duration
        }

    def apply_resolution_action(self, action: dict, conflict_id: str):
        if conflict_id in self._resolution_cooldown:
            return
        
        self._resolution_cooldown[conflict_id] = current_timestamp() + 5.0
        
        if action['action'] == 'slow_down':
            self._state.velocity = action.get('new_velocity', 1.0)
            self._pending_actions.append({
                'type': 'restore_velocity',
                'restore_time': current_timestamp() + 3.0,
                'original_velocity': self._original_velocity
            })
        elif action['action'] == 'change_lane':
            direction = 1 if action.get('direction') == 'left' else -1
            self._state.orientation.yaw += direction * 0.3

    def _process_pending_actions(self):
        now = current_timestamp()
        expired_conflicts = [
            cid for cid, expire_time in self._resolution_cooldown.items()
            if now > expire_time
        ]
        for cid in expired_conflicts:
            del self._resolution_cooldown[cid]
        
        completed_actions = []
        for action in self._pending_actions:
            if now > action['restore_time']:
                if action['type'] == 'restore_velocity':
                    self._state.velocity = min(
                        self._state.velocity + 0.5,
                        action['original_velocity']
                    )
                    if self._state.velocity >= action['original_velocity']:
                        completed_actions.append(action)
        
        for action in completed_actions:
            self._pending_actions.remove(action)

    def get_status(self) -> dict:
        return {
            'vehicle_id': self.vehicle_id,
            'is_local_mode': self._is_local_mode,
            'last_central_heartbeat': self._last_central_heartbeat,
            'active_peers': len(self.get_active_peers()),
            'diagnostic_count': len(self.diagnostic_logs),
            'local_decision_count': len(self.local_decisions)
        }

    async def publish_state(self):
        while True:
            self._process_pending_actions()
            self.check_central_connection()
            self.local_decision_cycle()
            
            self._state.timestamp = current_timestamp()
            
            dt = 0.1
            yaw = self._state.orientation.yaw
            self._state.position.x += math.cos(yaw) * self._state.velocity * dt
            self._state.position.y += math.sin(yaw) * self._state.velocity * dt
            
            self._state.orientation.yaw += random.uniform(-0.02, 0.02)
            
            if self._state.position.x > 100 or self._state.position.x < -100:
                self._state.orientation.yaw += math.pi
            if self._state.position.y > 100 or self._state.position.y < -100:
                self._state.orientation.yaw += math.pi
            
            state_dict = self._get_state_dict()
            state_dict['is_local_mode'] = self._is_local_mode
            self.state_history.append(state_dict)
            
            for callback in self.state_callbacks:
                await callback(state_dict)
            
            await asyncio.sleep(0.1)

    async def publish_path(self):
        while True:
            self._target_path = self._generate_path()
            self._target_path.timestamp = current_timestamp()
            
            path_dict = self._get_path_dict()
            
            for callback in self.path_callbacks:
                await callback(path_dict)
            
            await asyncio.sleep(2.0)

    async def publish_heartbeat(self):
        startup_time = current_timestamp()
        while True:
            elapsed = current_timestamp() - startup_time
            request_snapshot = elapsed < 5.0
            
            heartbeat = {
                'vehicle_id': self.vehicle_id,
                'timestamp': current_timestamp(),
                'request_snapshot': request_snapshot,
                'active_peers': self.get_active_peers()
            }
            
            for callback in self.heartbeat_callbacks:
                await callback(heartbeat)
            
            await asyncio.sleep(self.heartbeat_interval)

    async def run(self):
        await asyncio.gather(
            self.publish_state(),
            self.publish_path(),
            self.publish_heartbeat()
        )
