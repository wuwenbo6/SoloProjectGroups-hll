import time
import threading
from queue import Queue
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Callable, Any
from enum import Enum


class TriggerType(Enum):
    CAN_ID = "can_id"
    DATA_PATTERN = "data_pattern"
    SIGNAL_VALUE = "signal_value"
    ERROR_FRAME = "error_frame"
    REMOTE_FRAME = "remote_frame"


class TriggerCondition(Enum):
    EQUAL = "=="
    NOT_EQUAL = "!="
    GREATER = ">"
    LESS = "<"
    GREATER_EQUAL = ">="
    LESS_EQUAL = "<="
    CONTAINS = "contains"
    BIT_SET = "bit_set"
    BIT_CLEAR = "bit_clear"
    CHANGE = "change"


@dataclass
class Trigger:
    trigger_type: TriggerType
    enabled: bool = True
    can_id: Optional[int] = None
    can_id_mask: int = 0x1FFFFFFF
    byte_offset: int = 0
    bit_offset: int = 0
    bit_length: int = 8
    condition: TriggerCondition = TriggerCondition.EQUAL
    value: Any = None
    mask: Optional[List[int]] = None
    action: str = "record"
    pre_trigger_samples: int = 100
    post_trigger_samples: int = 100
    description: str = ""
    
    def __post_init__(self):
        if self.mask is None:
            self.mask = []


@dataclass
class TriggerEvent:
    timestamp: float
    trigger: Trigger
    message: Optional[Dict] = None
    matched_value: Any = None


class TriggerRecorder:
    def __init__(self, max_buffer_size: int = 10000):
        self.max_buffer_size = max_buffer_size
        self.message_buffer: List[Dict] = []
        self.triggers: List[Trigger] = []
        self.trigger_events: List[TriggerEvent] = []
        self.is_recording: bool = False
        self.is_triggered: bool = False
        self.triggered_index: int = -1
        self.post_trigger_count: int = 0
        self.trigger_lock = threading.Lock()
        self.on_trigger_callback: Optional[Callable[[TriggerEvent], None]] = None
        self._last_values: Dict[str, Any] = {}

    def add_trigger(self, trigger: Trigger):
        with self.trigger_lock:
            self.triggers.append(trigger)

    def remove_trigger(self, index: int):
        with self.trigger_lock:
            if 0 <= index < len(self.triggers):
                del self.triggers[index]

    def clear_triggers(self):
        with self.trigger_lock:
            self.triggers.clear()

    def get_triggers(self) -> List[Trigger]:
        with self.trigger_lock:
            return list(self.triggers)

    def start_recording(self):
        self.is_recording = True
        self.is_triggered = False
        self.triggered_index = -1
        self.post_trigger_count = 0
        self.trigger_events.clear()
        self.message_buffer.clear()
        self._last_values.clear()

    def stop_recording(self) -> List[Dict]:
        self.is_recording = False
        return self.get_triggered_data()

    def process_message(self, msg: Dict) -> Optional[TriggerEvent]:
        if not self.is_recording:
            return None
        
        with self.trigger_lock:
            self.message_buffer.append(msg.copy())
            
            if len(self.message_buffer) > self.max_buffer_size:
                overflow = len(self.message_buffer) - self.max_buffer_size
                self.message_buffer = self.message_buffer[overflow:]
                
                if self.is_triggered:
                    self.triggered_index -= overflow
                    if self.triggered_index < 0:
                        self.triggered_index = 0
            
            if self.is_triggered:
                self.post_trigger_count += 1
                if self.post_trigger_count >= self._get_max_post_trigger():
                    self.is_recording = False
                    return None
                return None
            
            for trigger in self.triggers:
                if not trigger.enabled:
                    continue
                
                event = self._check_trigger(trigger, msg)
                if event:
                    self.trigger_events.append(event)
                    self.is_triggered = True
                    self.triggered_index = len(self.message_buffer) - 1
                    self.post_trigger_count = 0
                    
                    if self.on_trigger_callback:
                        self.on_trigger_callback(event)
                    
                    return event
        
        return None

    def _get_max_post_trigger(self) -> int:
        if not self.triggers:
            return 100
        return max(t.post_trigger_samples for t in self.triggers if t.enabled)

    def _check_trigger(self, trigger: Trigger, msg: Dict) -> Optional[TriggerEvent]:
        if trigger.trigger_type == TriggerType.CAN_ID:
            return self._check_can_id_trigger(trigger, msg)
        elif trigger.trigger_type == TriggerType.DATA_PATTERN:
            return self._check_data_pattern_trigger(trigger, msg)
        elif trigger.trigger_type == TriggerType.SIGNAL_VALUE:
            return self._check_signal_value_trigger(trigger, msg)
        elif trigger.trigger_type == TriggerType.ERROR_FRAME:
            return self._check_error_frame_trigger(trigger, msg)
        elif trigger.trigger_type == TriggerType.REMOTE_FRAME:
            return self._check_remote_frame_trigger(trigger, msg)
        
        return None

    def _check_can_id_trigger(self, trigger: Trigger, msg: Dict) -> Optional[TriggerEvent]:
        if trigger.can_id is None:
            return None
        
        masked_id = msg['can_id'] & trigger.can_id_mask
        target_id = trigger.can_id & trigger.can_id_mask
        
        if self._evaluate_condition(masked_id, target_id, trigger.condition):
            return TriggerEvent(
                timestamp=msg['timestamp'],
                trigger=trigger,
                message=msg,
                matched_value=masked_id
            )
        
        return None

    def _check_data_pattern_trigger(self, trigger: Trigger, msg: Dict) -> Optional[TriggerEvent]:
        if trigger.can_id is not None and msg['can_id'] != trigger.can_id:
            return None
        
        data = msg.get('data', [])
        
        if trigger.mask:
            for i, mask_byte in enumerate(trigger.mask):
                if i + trigger.byte_offset >= len(data):
                    break
                if (data[i + trigger.byte_offset] & mask_byte) != (trigger.value[i] & mask_byte):
                    return None
            return TriggerEvent(
                timestamp=msg['timestamp'],
                trigger=trigger,
                message=msg,
                matched_value=data[trigger.byte_offset:trigger.byte_offset + len(trigger.value)]
            )
        elif trigger.value is not None and isinstance(trigger.value, list):
            if len(data) < trigger.byte_offset + len(trigger.value):
                return None
            
            match = True
            for i, val in enumerate(trigger.value):
                if data[trigger.byte_offset + i] != val:
                    match = False
                    break
            
            if match:
                return TriggerEvent(
                    timestamp=msg['timestamp'],
                    trigger=trigger,
                    message=msg,
                    matched_value=data[trigger.byte_offset:trigger.byte_offset + len(trigger.value)]
                )
        
        return None

    def _check_signal_value_trigger(self, trigger: Trigger, msg: Dict) -> Optional[TriggerEvent]:
        if trigger.can_id is not None and msg['can_id'] != trigger.can_id:
            return None
        
        value = self._extract_signal_value(
            msg.get('data', []),
            trigger.byte_offset * 8 + trigger.bit_offset,
            trigger.bit_length
        )
        
        key = f"{msg['can_id']}_{trigger.byte_offset}_{trigger.bit_offset}_{trigger.bit_length}"
        
        if trigger.condition == TriggerCondition.CHANGE:
            if key in self._last_values:
                if self._last_values[key] != value:
                    self._last_values[key] = value
                    return TriggerEvent(
                        timestamp=msg['timestamp'],
                        trigger=trigger,
                        message=msg,
                        matched_value=value
                    )
            self._last_values[key] = value
            return None
        
        self._last_values[key] = value
        
        if self._evaluate_condition(value, trigger.value, trigger.condition):
            return TriggerEvent(
                timestamp=msg['timestamp'],
                trigger=trigger,
                message=msg,
                matched_value=value
            )
        
        return None

    def _check_error_frame_trigger(self, trigger: Trigger, msg: Dict) -> Optional[TriggerEvent]:
        if msg.get('is_error', False):
            return TriggerEvent(
                timestamp=msg['timestamp'],
                trigger=trigger,
                message=msg,
                matched_value=True
            )
        return None

    def _check_remote_frame_trigger(self, trigger: Trigger, msg: Dict) -> Optional[TriggerEvent]:
        if msg.get('is_remote', False):
            return TriggerEvent(
                timestamp=msg['timestamp'],
                trigger=trigger,
                message=msg,
                matched_value=True
            )
        return None

    def _extract_signal_value(self, data: List[int], start_bit: int, bit_length: int) -> int:
        value = 0
        for i in range(bit_length):
            bit_pos = start_bit + i
            byte_idx = bit_pos // 8
            bit_idx = bit_pos % 8
            
            if byte_idx < len(data):
                if data[byte_idx] & (1 << bit_idx):
                    value |= (1 << i)
        
        return value

    def _evaluate_condition(self, actual: Any, expected: Any, condition: TriggerCondition) -> bool:
        try:
            if condition == TriggerCondition.EQUAL:
                return actual == expected
            elif condition == TriggerCondition.NOT_EQUAL:
                return actual != expected
            elif condition == TriggerCondition.GREATER:
                return actual > expected
            elif condition == TriggerCondition.LESS:
                return actual < expected
            elif condition == TriggerCondition.GREATER_EQUAL:
                return actual >= expected
            elif condition == TriggerCondition.LESS_EQUAL:
                return actual <= expected
            elif condition == TriggerCondition.CONTAINS:
                return expected in actual if isinstance(actual, (list, str)) else False
            elif condition == TriggerCondition.BIT_SET:
                return (actual & (1 << expected)) != 0 if isinstance(expected, int) else False
            elif condition == TriggerCondition.BIT_CLEAR:
                return (actual & (1 << expected)) == 0 if isinstance(expected, int) else False
        except:
            pass
        return False

    def get_triggered_data(self) -> List[Dict]:
        if not self.is_triggered or self.triggered_index < 0:
            return []
        
        pre_samples = 100
        if self.triggers:
            pre_samples = max(t.pre_trigger_samples for t in self.triggers if t.enabled)
        
        start_idx = max(0, self.triggered_index - pre_samples)
        end_idx = min(len(self.message_buffer), self.triggered_index + self.post_trigger_count + 1)
        
        return self.message_buffer[start_idx:end_idx]

    def get_trigger_events(self) -> List[TriggerEvent]:
        return list(self.trigger_events)

    def is_complete(self) -> bool:
        return self.is_triggered and self.post_trigger_count >= self._get_max_post_trigger()


def create_standard_triggers() -> List[Trigger]:
    return [
        Trigger(
            trigger_type=TriggerType.CAN_ID,
            can_id=0x100,
            description="Trigger on CAN ID 0x100"
        ),
        Trigger(
            trigger_type=TriggerType.SIGNAL_VALUE,
            can_id=0x100,
            byte_offset=0,
            bit_length=16,
            condition=TriggerCondition.GREATER,
            value=5000,
            description="Trigger when signal > 5000"
        ),
        Trigger(
            trigger_type=TriggerType.DATA_PATTERN,
            byte_offset=0,
            value=[0xFF, 0x00],
            description="Trigger on data pattern 0xFF 0x00"
        )
    ]


if __name__ == '__main__':
    from can_capture import CANCapture
    
    recorder = TriggerRecorder()
    
    trigger = Trigger(
        trigger_type=TriggerType.CAN_ID,
        can_id=0x100,
        pre_trigger_samples=50,
        post_trigger_samples=50,
        description="Capture on CAN ID 0x100"
    )
    recorder.add_trigger(trigger)
    
    value_trigger = Trigger(
        trigger_type=TriggerType.SIGNAL_VALUE,
        can_id=0x100,
        byte_offset=0,
        bit_length=16,
        condition=TriggerCondition.GREATER,
        value=60,
        pre_trigger_samples=20,
        post_trigger_samples=30,
        description="Trigger when speed > 60"
    )
    recorder.add_trigger(value_trigger)
    
    def on_trigger(event):
        print(f"\nTRIGGERED: {event.trigger.description}")
        print(f"  Time: {event.timestamp:.4f}s")
        print(f"  Value: {event.matched_value}")
    
    recorder.on_trigger_callback = on_trigger
    
    print("Starting trigger capture test...")
    capture = CANCapture(use_virtual=True)
    capture.start()
    recorder.start_recording()
    
    start_time = time.time()
    while time.time() - start_time < 5 and recorder.is_recording:
        messages = capture.get_messages(100)
        for msg in messages:
            recorder.process_message(msg)
        time.sleep(0.01)
    
    capture.stop()
    triggered_data = recorder.stop_recording()
    
    print(f"\nCaptured {len(triggered_data)} messages around trigger")
    print(f"Trigger events: {len(recorder.get_trigger_events())}")
    
    if triggered_data:
        print(f"First message time: {triggered_data[0]['timestamp']:.4f}s")
        print(f"Last message time: {triggered_data[-1]['timestamp']:.4f}s")
