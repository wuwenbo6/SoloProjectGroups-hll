from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Callable, Any
from enum import Enum
from collections import defaultdict, deque
import time
import random


class ModbusState(Enum):
    IDLE = "idle"
    CONNECTED = "connected"
    READ_COILS = "read_coils"
    READ_DISCRETE_INPUTS = "read_discrete_inputs"
    READ_HOLDING_REGISTERS = "read_holding_registers"
    READ_INPUT_REGISTERS = "read_input_registers"
    WRITE_SINGLE_COIL = "write_single_coil"
    WRITE_SINGLE_REGISTER = "write_single_register"
    WRITE_MULTIPLE_COILS = "write_multiple_coils"
    WRITE_MULTIPLE_REGISTERS = "write_multiple_registers"
    DIAGNOSTIC = "diagnostic"
    ERROR = "error"
    TIMEOUT = "timeout"
    EXCEPTION = "exception"


@dataclass
class StateTransition:
    from_state: ModbusState
    to_state: ModbusState
    function_code: Optional[int]
    timestamp: float
    packet_id: Optional[int] = None
    success: bool = True
    notes: str = ""


@dataclass
class StateStats:
    state: ModbusState
    entry_count: int = 0
    total_duration: float = 0.0
    last_entry_time: Optional[float] = None
    crash_count: int = 0


class ProtocolStateMachine:
    def __init__(self, protocol: str = "modbus"):
        self.protocol = protocol
        self.current_state = ModbusState.IDLE
        self.previous_state = ModbusState.IDLE
        self.transition_history: deque = deque(maxlen=1000)
        self.state_stats: Dict[ModbusState, StateStats] = defaultdict(
            lambda: StateStats(state=ModbusState.IDLE)
        )
        self.state_start_time = time.time()
        self.packet_count = 0
        self.crash_count = 0
        
        self._init_state_stats()
        
        self._state_transition_map: Dict[ModbusState, Set[ModbusState]] = {
            ModbusState.IDLE: {ModbusState.CONNECTED, ModbusState.ERROR},
            ModbusState.CONNECTED: {
                ModbusState.READ_COILS, ModbusState.READ_DISCRETE_INPUTS,
                ModbusState.READ_HOLDING_REGISTERS, ModbusState.READ_INPUT_REGISTERS,
                ModbusState.WRITE_SINGLE_COIL, ModbusState.WRITE_SINGLE_REGISTER,
                ModbusState.WRITE_MULTIPLE_COILS, ModbusState.WRITE_MULTIPLE_REGISTERS,
                ModbusState.DIAGNOSTIC, ModbusState.ERROR, ModbusState.TIMEOUT
            },
            ModbusState.READ_COILS: {ModbusState.CONNECTED, ModbusState.EXCEPTION, ModbusState.TIMEOUT, ModbusState.ERROR},
            ModbusState.READ_DISCRETE_INPUTS: {ModbusState.CONNECTED, ModbusState.EXCEPTION, ModbusState.TIMEOUT, ModbusState.ERROR},
            ModbusState.READ_HOLDING_REGISTERS: {ModbusState.CONNECTED, ModbusState.EXCEPTION, ModbusState.TIMEOUT, ModbusState.ERROR},
            ModbusState.READ_INPUT_REGISTERS: {ModbusState.CONNECTED, ModbusState.EXCEPTION, ModbusState.TIMEOUT, ModbusState.ERROR},
            ModbusState.WRITE_SINGLE_COIL: {ModbusState.CONNECTED, ModbusState.EXCEPTION, ModbusState.TIMEOUT, ModbusState.ERROR},
            ModbusState.WRITE_SINGLE_REGISTER: {ModbusState.CONNECTED, ModbusState.EXCEPTION, ModbusState.TIMEOUT, ModbusState.ERROR},
            ModbusState.WRITE_MULTIPLE_COILS: {ModbusState.CONNECTED, ModbusState.EXCEPTION, ModbusState.TIMEOUT, ModbusState.ERROR},
            ModbusState.WRITE_MULTIPLE_REGISTERS: {ModbusState.CONNECTED, ModbusState.EXCEPTION, ModbusState.TIMEOUT, ModbusState.ERROR},
            ModbusState.DIAGNOSTIC: {ModbusState.CONNECTED, ModbusState.EXCEPTION, ModbusState.TIMEOUT, ModbusState.ERROR},
            ModbusState.EXCEPTION: {ModbusState.CONNECTED, ModbusState.ERROR},
            ModbusState.TIMEOUT: {ModbusState.CONNECTED, ModbusState.ERROR},
            ModbusState.ERROR: {ModbusState.IDLE, ModbusState.CONNECTED},
        }
        
        self._fc_to_state: Dict[int, ModbusState] = {
            0x01: ModbusState.READ_COILS,
            0x02: ModbusState.READ_DISCRETE_INPUTS,
            0x03: ModbusState.READ_HOLDING_REGISTERS,
            0x04: ModbusState.READ_INPUT_REGISTERS,
            0x05: ModbusState.WRITE_SINGLE_COIL,
            0x06: ModbusState.WRITE_SINGLE_REGISTER,
            0x0F: ModbusState.WRITE_MULTIPLE_COILS,
            0x10: ModbusState.WRITE_MULTIPLE_REGISTERS,
            0x08: ModbusState.DIAGNOSTIC,
        }
        
        self._crash_prone_states: Set[ModbusState] = set()
        self._strategy_weights: Dict[str, float] = defaultdict(lambda: 1.0)

    def _init_state_stats(self):
        for state in ModbusState:
            self.state_stats[state] = StateStats(state=state)

    def transition(self, to_state: ModbusState, function_code: Optional[int] = None,
                   packet_id: Optional[int] = None, success: bool = True, notes: str = "") -> bool:
        allowed_transitions = self._state_transition_map.get(self.current_state, set())
        
        if to_state not in allowed_transitions and to_state != self.current_state:
            notes = f"异常状态转换: {self.current_state.value} -> {to_state.value}. {notes}"
        
        duration = time.time() - self.state_start_time
        self.state_stats[self.current_state].total_duration += duration
        
        self.previous_state = self.current_state
        self.current_state = to_state
        self.state_start_time = time.time()
        
        self.state_stats[to_state].entry_count += 1
        self.state_stats[to_state].last_entry_time = time.time()
        
        transition = StateTransition(
            from_state=self.previous_state,
            to_state=self.current_state,
            function_code=function_code,
            timestamp=time.time(),
            packet_id=packet_id,
            success=success,
            notes=notes
        )
        self.transition_history.append(transition)
        
        if success:
            self.packet_count += 1
        
        return success

    def transition_by_function_code(self, function_code: int, success: bool = True,
                                    packet_id: Optional[int] = None, notes: str = "") -> bool:
        if function_code & 0x80:
            return self.transition(
                ModbusState.EXCEPTION, function_code=function_code,
                packet_id=packet_id, success=False,
                notes=f"异常码: 0x{function_code & 0x7F:02X}"
            )
        
        target_state = self._fc_to_state.get(function_code, ModbusState.CONNECTED)
        return self.transition(
            target_state, function_code=function_code,
            packet_id=packet_id, success=success, notes=notes
        )

    def report_crash(self, state: ModbusState, function_code: Optional[int] = None):
        self.crash_count += 1
        self.state_stats[state].crash_count += 1
        self._crash_prone_states.add(state)
        
        self._adjust_strategy_weights(function_code, -0.5)

    def _adjust_strategy_weights(self, function_code: Optional[int], adjustment: float):
        if function_code is None:
            return
        
        fc_strategies = {
            0x01: ["address_out_of_range", "invalid_data_length"],
            0x02: ["address_out_of_range", "invalid_data_length"],
            0x03: ["address_out_of_range", "invalid_data_length", "malformed_data"],
            0x04: ["address_out_of_range", "invalid_data_length"],
            0x05: ["address_out_of_range", "malformed_data"],
            0x06: ["address_out_of_range", "malformed_data", "byte_order_flip"],
            0x0F: ["address_out_of_range", "invalid_data_length", "oversized_packet"],
            0x10: ["address_out_of_range", "invalid_data_length", "oversized_packet"],
        }
        
        for strategy in fc_strategies.get(function_code, []):
            self._strategy_weights[strategy] = max(0.1, self._strategy_weights[strategy] + adjustment)

    def get_recommended_strategies(self, available_strategies: List[str]) -> List[str]:
        weighted_strategies = []
        for strategy in available_strategies:
            weight = self._strategy_weights[strategy]
            weighted_strategies.extend([strategy] * int(weight * 10))
        
        if not weighted_strategies:
            return available_strategies
        
        random.shuffle(weighted_strategies)
        return sorted(set(weighted_strategies), 
                     key=lambda s: self._strategy_weights[s], reverse=True)

    def get_current_state(self) -> ModbusState:
        return self.current_state

    def get_state_duration(self) -> float:
        return time.time() - self.state_start_time

    def get_state_statistics(self) -> Dict[str, Any]:
        stats = {}
        for state, state_stat in self.state_stats.items():
            if state_stat.entry_count > 0:
                stats[state.value] = {
                    "entry_count": state_stat.entry_count,
                    "total_duration": round(state_stat.total_duration, 2),
                    "avg_duration": round(state_stat.total_duration / max(1, state_stat.entry_count), 2),
                    "crash_count": state_stat.crash_count,
                }
        
        return {
            "current_state": self.current_state.value,
            "previous_state": self.previous_state.value,
            "state_duration": round(self.get_state_duration(), 2),
            "total_transitions": len(self.transition_history),
            "packet_count": self.packet_count,
            "crash_count": self.crash_count,
            "state_details": stats,
            "crash_prone_states": [s.value for s in self._crash_prone_states],
            "strategy_weights": dict(self._strategy_weights),
        }

    def get_recent_transitions(self, count: int = 20) -> List[Dict[str, Any]]:
        recent = list(self.transition_history)[-count:]
        return [
            {
                "from": t.from_state.value,
                "to": t.to_state.value,
                "function_code": t.function_code,
                "timestamp": t.timestamp,
                "success": t.success,
                "notes": t.notes,
            }
            for t in recent
        ]

    def reset(self):
        self.current_state = ModbusState.IDLE
        self.previous_state = ModbusState.IDLE
        self.transition_history.clear()
        self.state_start_time = time.time()
        self.packet_count = 0
        self.crash_count = 0
        self._crash_prone_states.clear()
        self._strategy_weights.clear()
        self._init_state_stats()
