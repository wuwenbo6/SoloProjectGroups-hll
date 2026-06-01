from enum import Enum
from typing import Optional, Any, Callable, List, Dict
from dataclasses import dataclass, field
import time
import uuid


class EventType(str, Enum):
    INFO = "info"
    DISCOVERY = "discovery"
    PDU = "pdu"
    FAULT = "fault"
    STATE_CHANGE = "state_change"


class EventSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


@dataclass
class OAMEvent:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: float = field(default_factory=time.time)
    type: EventType = EventType.INFO
    severity: EventSeverity = EventSeverity.INFO
    message: str = ""
    details: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "type": self.type.value,
            "severity": self.severity.value,
            "message": self.message,
            "details": self.details,
        }


class EventManager:
    def __init__(self, max_events: int = 1000):
        self.events: List[OAMEvent] = []
        self.max_events = max_events
        self.subscribers: List[Callable[[OAMEvent], None]] = []

    def subscribe(self, callback: Callable[[OAMEvent], None]) -> None:
        self.subscribers.append(callback)

    def unsubscribe(self, callback: Callable[[OAMEvent], None]) -> None:
        if callback in self.subscribers:
            self.subscribers.remove(callback)

    def add_event(
        self,
        event_type: EventType,
        severity: EventSeverity,
        message: str,
        details: Optional[dict[str, Any]] = None,
    ) -> OAMEvent:
        event = OAMEvent(
            type=event_type,
            severity=severity,
            message=message,
            details=details,
        )

        self.events.append(event)

        if len(self.events) > self.max_events:
            self.events = self.events[-self.max_events :]

        for subscriber in self.subscribers:
            try:
                subscriber(event)
            except Exception:
                pass

        return event

    def get_events(
        self,
        event_type: Optional[EventType] = None,
        limit: Optional[int] = None,
    ) -> list[OAMEvent]:
        events = self.events
        if event_type:
            events = [e for e in events if e.type == event_type]
        if limit:
            events = events[-limit:]
        return events

    def clear(self) -> None:
        self.events = []
