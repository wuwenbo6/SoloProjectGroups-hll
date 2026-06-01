from enum import Enum
from typing import Callable, Optional
from .events import EventType, EventSeverity


class OAMState(str, Enum):
    IDLE = "IDLE"
    DISCOVERY = "DISCOVERY"
    SEND_DISCOVERY = "SEND_DISCOVERY"
    WAIT_DISCOVERY = "WAIT_DISCOVERY"
    WAIT_RESPONSE = "WAIT_RESPONSE"
    SEND_RESPONSE = "SEND_RESPONSE"
    DISCOVERY_COMPLETE = "DISCOVERY_COMPLETE"
    STABLE = "STABLE"
    SEND_INFO = "SEND_INFO"
    FAULT_DETECTED = "FAULT_DETECTED"


class OAMStateMachine:
    def __init__(self, event_callback: Optional[Callable] = None):
        self.current_state = OAMState.IDLE
        self.event_callback = event_callback
        self.transitions = self._init_transitions()

    def _init_transitions(self) -> dict[OAMState, dict[str, OAMState]]:
        return {
            OAMState.IDLE: {
                "start": OAMState.DISCOVERY,
            },
            OAMState.DISCOVERY: {
                "active_mode": OAMState.SEND_DISCOVERY,
                "passive_mode": OAMState.WAIT_DISCOVERY,
            },
            OAMState.SEND_DISCOVERY: {
                "sent": OAMState.WAIT_RESPONSE,
            },
            OAMState.WAIT_DISCOVERY: {
                "receive_discovery": OAMState.SEND_RESPONSE,
            },
            OAMState.SEND_RESPONSE: {
                "sent": OAMState.DISCOVERY_COMPLETE,
            },
            OAMState.WAIT_RESPONSE: {
                "receive_response": OAMState.DISCOVERY_COMPLETE,
                "timeout": OAMState.FAULT_DETECTED,
            },
            OAMState.DISCOVERY_COMPLETE: {
                "stable": OAMState.STABLE,
            },
            OAMState.STABLE: {
                "send_info": OAMState.SEND_INFO,
                "fault_detected": OAMState.FAULT_DETECTED,
                "stop": OAMState.IDLE,
            },
            OAMState.SEND_INFO: {
                "sent": OAMState.STABLE,
            },
            OAMState.FAULT_DETECTED: {
                "fault_cleared": OAMState.STABLE,
                "stop": OAMState.IDLE,
            },
        }

    def transition(self, event: str) -> OAMState:
        if self.current_state not in self.transitions:
            return self.current_state

        if event not in self.transitions[self.current_state]:
            return self.current_state

        old_state = self.current_state
        new_state = self.transitions[self.current_state][event]
        self.current_state = new_state

        if self.event_callback:
            self.event_callback(
                EventType.STATE_CHANGE,
                EventSeverity.INFO,
                f"State transition: {old_state.value} -> {new_state.value}",
                {"old_state": old_state.value, "new_state": new_state.value},
            )

        return self.current_state

    def get_state(self) -> OAMState:
        return self.current_state

    def reset(self) -> None:
        self.current_state = OAMState.IDLE
