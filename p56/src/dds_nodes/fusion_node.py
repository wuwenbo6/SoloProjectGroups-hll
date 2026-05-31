import asyncio
import math
import uuid
from typing import Dict, List, Tuple, Set
from collections import defaultdict, deque
from .idl.vehicle_types import (
    VehicleState, Position, ConflictAlert, current_timestamp
)

class ConflictResolver:
    def __init__(self):
        self.vehicle_states: Dict[str, dict] = {}
        self.vehicle_paths: Dict[str, dict] = {}
        self.vehicle_last_update: Dict[str, float] = {}
        self.conflict_callbacks = []
        self.resolution_callbacks = []
        self.state_cache_callbacks = []
        
        self.active_conflicts: Dict[str, dict] = {}
        self.resolved_conflicts: Dict[str, float] = {}
        self.vehicle_priorities: Dict[str, int] = {}
        
        self.state_cache: deque = deque(maxlen=500)
        self.path_cache: deque = deque(maxlen=100)
        
        self.conflict_cooldown = 3.0
        self.vehicle_timeout = 5.0
        
        self.resolution_actions: Dict[str, Dict] = {}

    def add_conflict_callback(self, callback):
        self.conflict_callbacks.append(callback)

    def add_resolution_callback(self, callback):
        self.resolution_callbacks.append(callback)

    def add_state_cache_callback(self, callback):
        self.state_cache_callbacks.append(callback)

    def update_vehicle_state(self, state: dict):
        vehicle_id = state['vehicle_id']
        self.vehicle_states[vehicle_id] = state
        self.vehicle_last_update[vehicle_id] = current_timestamp()
        self.state_cache.append(state)
        
        if 'priority' in state:
            self.vehicle_priorities[vehicle_id] = state['priority']
        elif vehicle_id not in self.vehicle_priorities:
            self.vehicle_priorities[vehicle_id] = int(vehicle_id.split('_')[-1])

    def update_vehicle_path(self, path: dict):
        self.vehicle_paths[path['vehicle_id']] = path
        self.path_cache.append(path)

    def _cleanup_timeout_vehicles(self):
        now = current_timestamp()
        timeout_vehicles = [
            vid for vid, last_update in self.vehicle_last_update.items()
            if now - last_update > self.vehicle_timeout
        ]
        for vid in timeout_vehicles:
            del self.vehicle_states[vid]
            if vid in self.vehicle_paths:
                del self.vehicle_paths[vid]
            del self.vehicle_last_update[vid]
            if vid in self.vehicle_priorities:
                del self.vehicle_priorities[vid]

    async def broadcast_state_cache(self, new_vehicle_id: str):
        recent_states = {}
        for state in reversed(self.state_cache):
            vid = state['vehicle_id']
            if vid != new_vehicle_id and vid not in recent_states:
                recent_states[vid] = state
                if len(recent_states) >= len(self.vehicle_states) - 1:
                    break
        
        for state in recent_states.values():
            for callback in self.state_cache_callbacks:
                await callback(state)

    def _distance(self, p1: dict, p2: dict) -> float:
        return math.sqrt(
            (p1['x'] - p2['x']) ** 2 +
            (p1['y'] - p2['y']) ** 2
        )

    def _predict_position(self, vehicle_id: str, time_ahead: float) -> dict:
        if vehicle_id not in self.vehicle_states:
            return None
        
        state = self.vehicle_states[vehicle_id]
        pos = state['position'].copy()
        yaw = state['orientation']['yaw']
        vel = state['velocity']
        
        pos['x'] += math.cos(yaw) * vel * time_ahead
        pos['y'] += math.sin(yaw) * vel * time_ahead
        
        return pos

    def detect_conflicts(self) -> List[ConflictAlert]:
        conflicts = []
        vehicle_ids = list(self.vehicle_states.keys())
        
        for i in range(len(vehicle_ids)):
            for j in range(i + 1, len(vehicle_ids)):
                v1, v2 = vehicle_ids[i], vehicle_ids[j]
                
                for t in range(0, 50, 5):
                    time_ahead = t / 10.0
                    p1 = self._predict_position(v1, time_ahead)
                    p2 = self._predict_position(v2, time_ahead)
                    
                    if p1 and p2:
                        dist = self._distance(p1, p2)
                        if dist < 5.0:
                            severity = 'critical' if dist < 2.0 else 'warning'
                            conflict_id = f"conflict_{uuid.uuid4().hex[:8]}"
                            
                            conflict = {
                                'alert_id': conflict_id,
                                'timestamp': current_timestamp(),
                                'vehicle_ids': [v1, v2],
                                'conflict_position': {
                                    'x': (p1['x'] + p2['x']) / 2,
                                    'y': (p1['y'] + p2['y']) / 2,
                                    'z': 0
                                },
                                'conflict_time': current_timestamp() + time_ahead,
                                'severity': severity,
                                'resolved': False
                            }
                            
                            if conflict_id not in self.active_conflicts:
                                self.active_conflicts[conflict_id] = conflict
                                conflicts.append(conflict)
                            break
        
        return conflicts

    def _get_vehicle_priority(self, vehicle_id: str) -> int:
        return self.vehicle_priorities.get(vehicle_id, 999)

    def _is_in_cooldown(self, vehicle_pair: Tuple[str, str]) -> bool:
        pair_key = tuple(sorted(vehicle_pair))
        pair_str = f"{pair_key[0]}_{pair_key[1]}"
        last_resolved = self.resolved_conflicts.get(pair_str, 0)
        return current_timestamp() - last_resolved < self.conflict_cooldown

    def _set_cooldown(self, vehicle_pair: Tuple[str, str]):
        pair_key = tuple(sorted(vehicle_pair))
        pair_str = f"{pair_key[0]}_{pair_key[1]}"
        self.resolved_conflicts[pair_str] = current_timestamp()

    def _has_pending_action(self, vehicle_id: str) -> bool:
        return vehicle_id in self.resolution_actions and \
               current_timestamp() < self.resolution_actions[vehicle_id]['expire_time']

    def resolve_conflict(self, conflict_id: str) -> dict:
        if conflict_id not in self.active_conflicts:
            return None
        
        conflict = self.active_conflicts[conflict_id]
        v1, v2 = conflict['vehicle_ids']
        
        if self._is_in_cooldown((v1, v2)):
            conflict['resolved'] = True
            del self.active_conflicts[conflict_id]
            return None
        
        p1 = self._get_vehicle_priority(v1)
        p2 = self._get_vehicle_priority(v2)
        
        v1_has_action = self._has_pending_action(v1)
        v2_has_action = self._has_pending_action(v2)
        
        if v1_has_action and v2_has_action:
            conflict['resolved'] = True
            del self.active_conflicts[conflict_id]
            return None
        
        actions = []
        
        if p1 < p2:
            higher_priority_v, lower_priority_v = v1, v2
        elif p2 < p1:
            higher_priority_v, lower_priority_v = v2, v1
        else:
            if conflict['severity'] == 'critical':
                higher_priority_v, lower_priority_v = v1, v2
            else:
                higher_priority_v, lower_priority_v = v2, v1
        
        if not self._has_pending_action(lower_priority_v):
            actions.append({
                'vehicle_id': lower_priority_v,
                'action': 'slow_down',
                'new_velocity': 1.5
            })
            self.resolution_actions[lower_priority_v] = {
                'expire_time': current_timestamp() + 3.0,
                'action': 'slow_down'
            }
        
        if not self._has_pending_action(higher_priority_v):
            s1 = self.vehicle_states.get(higher_priority_v, {})
            s2 = self.vehicle_states.get(lower_priority_v, {})
            if s1 and s2:
                yaw1 = s1['orientation']['yaw']
                yaw2 = s2['orientation']['yaw']
                angle_diff = abs(yaw1 - yaw2)
                
                if angle_diff < math.pi / 4:
                    actions.append({
                        'vehicle_id': higher_priority_v,
                        'action': 'change_lane',
                        'direction': 'left'
                    })
                    self.resolution_actions[higher_priority_v] = {
                        'expire_time': current_timestamp() + 2.0,
                        'action': 'change_lane'
                    }
        
        if not actions:
            conflict['resolved'] = True
            del self.active_conflicts[conflict_id]
            return None
        
        self._set_cooldown((v1, v2))
        
        resolution = {
            'conflict_id': conflict_id,
            'timestamp': current_timestamp(),
            'actions': actions,
            'higher_priority': higher_priority_v,
            'lower_priority': lower_priority_v
        }
        
        conflict['resolved'] = True
        del self.active_conflicts[conflict_id]
        
        return resolution

    def _cleanup_expired_actions(self):
        now = current_timestamp()
        expired = [
            vid for vid, action in self.resolution_actions.items()
            if now > action['expire_time']
        ]
        for vid in expired:
            del self.resolution_actions[vid]

    def _cleanup_old_cooldowns(self):
        now = current_timestamp()
        expired = [
            key for key, timestamp in self.resolved_conflicts.items()
            if now - timestamp > self.conflict_cooldown * 2
        ]
        for key in expired:
            del self.resolved_conflicts[key]

    async def run_detection(self):
        while True:
            self._cleanup_timeout_vehicles()
            self._cleanup_expired_actions()
            self._cleanup_old_cooldowns()
            
            conflicts = self.detect_conflicts()
            
            for conflict in conflicts:
                for callback in self.conflict_callbacks:
                    await callback(conflict)
                
                resolution = self.resolve_conflict(conflict['alert_id'])
                if resolution:
                    for callback in self.resolution_callbacks:
                        await callback(resolution)
            
            await asyncio.sleep(0.5)
