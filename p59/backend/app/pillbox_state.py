from datetime import datetime, timedelta
from typing import Dict, Optional
from dataclasses import dataclass, field
import logging

logger = logging.getLogger(__name__)

@dataclass
class PillboxState:
    device_id: str
    is_lid_open: bool = False
    lid_open_time: Optional[datetime] = None
    lid_close_time: Optional[datetime] = None
    ir_detection_count: int = 0
    last_ir_time: Optional[datetime] = None
    medication_taken: bool = False
    pending_ir_events: list = field(default_factory=list)

class PillboxStateMachine:
    def __init__(self):
        self.states: Dict[str, PillboxState] = {}
        self.ir_debounce_window = timedelta(seconds=2)
        self.min_ir_detections = 2
        self.session_timeout = timedelta(minutes=5)
        
    def get_state(self, device_id: str) -> PillboxState:
        if device_id not in self.states:
            self.states[device_id] = PillboxState(device_id=device_id)
        return self.states[device_id]
    
    def cleanup_old_states(self):
        now = datetime.utcnow()
        expired = []
        for device_id, state in self.states.items():
            if state.lid_close_time and (now - state.lid_close_time) > self.session_timeout:
                expired.append(device_id)
        for device_id in expired:
            del self.states[device_id]
            logger.info(f"Cleaned up state for device {device_id}")
    
    def handle_hall_sensor(self, device_id: str, value: int, timestamp: datetime = None) -> Dict:
        state = self.get_state(device_id)
        now = timestamp or datetime.utcnow()
        result = {"action": None, "state_changed": False}
        
        if value == 1 and not state.is_lid_open:
            state.is_lid_open = True
            state.lid_open_time = now
            state.ir_detection_count = 0
            state.medication_taken = False
            state.pending_ir_events = []
            result["action"] = "lid_opened"
            result["state_changed"] = True
            logger.info(f"Device {device_id}: Lid opened at {now}")
            
        elif value == 0 and state.is_lid_open:
            state.is_lid_open = False
            state.lid_close_time = now
            
            if state.medication_taken:
                result["action"] = "lid_closed_medication_taken"
            else:
                result["action"] = "lid_closed_no_medication"
            result["state_changed"] = True
            result["medication_taken"] = state.medication_taken
            logger.info(f"Device {device_id}: Lid closed at {now}, medication taken: {state.medication_taken}")
        
        return result
    
    def handle_ir_sensor(self, device_id: str, value: int, timestamp: datetime = None) -> Dict:
        state = self.get_state(device_id)
        now = timestamp or datetime.utcnow()
        result = {"action": None, "medication_confirmed": False}
        
        if not state.is_lid_open:
            result["action"] = "ignored_lid_closed"
            return result
        
        if value == 0:
            state.pending_ir_events.append(now)
            
            state.pending_ir_events = [
                t for t in state.pending_ir_events
                if (now - t) <= self.ir_debounce_window
            ]
            
            if len(state.pending_ir_events) >= self.min_ir_detections:
                if not state.medication_taken:
                    state.medication_taken = True
                    state.last_ir_time = now
                    result["action"] = "medication_confirmed"
                    result["medication_confirmed"] = True
                    result["detection_count"] = len(state.pending_ir_events)
                    logger.info(
                        f"Device {device_id}: Medication confirmed after "
                        f"{len(state.pending_ir_events)} detections"
                    )
                else:
                    result["action"] = "additional_detection"
            else:
                result["action"] = "ir_detected_pending"
                result["detection_count"] = len(state.pending_ir_events)
        else:
            result["action"] = "ir_cleared"
        
        return result

state_machine = PillboxStateMachine()
