from dataclasses import dataclass
from typing import List, Tuple
import time

@dataclass
class Position:
    x: float
    y: float
    z: float = 0.0

@dataclass
class Orientation:
    roll: float
    pitch: float
    yaw: float

@dataclass
class VehicleState:
    vehicle_id: str
    timestamp: float
    position: Position
    orientation: Orientation
    velocity: float
    acceleration: float = 0.0

@dataclass
class Waypoint:
    position: Position
    target_velocity: float

@dataclass
class Path:
    vehicle_id: str
    timestamp: float
    waypoints: List[Waypoint]
    planned_duration: float

@dataclass
class ConflictAlert:
    alert_id: str
    timestamp: float
    vehicle_ids: List[str]
    conflict_position: Position
    conflict_time: float
    severity: str
    resolved: bool = False

def current_timestamp() -> float:
    return time.time()
