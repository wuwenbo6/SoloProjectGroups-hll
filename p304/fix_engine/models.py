from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional


class SessionStatus(Enum):
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    LOGGING_OUT = "logging_out"
    COMPROMISED = "compromised"
    UNDER_ATTACK = "under_attack"


class AlertSeverity(Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class MsgDirection(Enum):
    INBOUND = "inbound"
    OUTBOUND = "outbound"


@dataclass
class FixMessage:
    timestamp: datetime
    msg_type: str
    seq_num: int
    sender_comp_id: str
    target_comp_id: str
    direction: MsgDirection
    raw: str = ""
    is_attack: bool = False
    checksum_valid: bool = True
    checksum_value: str = ""

    def to_dict(self):
        return {
            "timestamp": self.timestamp.isoformat(),
            "msg_type": self.msg_type,
            "seq_num": self.seq_num,
            "sender_comp_id": self.sender_comp_id,
            "target_comp_id": self.target_comp_id,
            "direction": self.direction.value,
            "raw": self.raw,
            "is_attack": self.is_attack,
            "checksum_valid": self.checksum_valid,
            "checksum_value": self.checksum_value,
        }


@dataclass
class Alert:
    timestamp: datetime
    session_id: str
    alert_type: str
    description: str
    severity: AlertSeverity
    seq_num_at_event: int = 0
    previous_seq_num: int = 0

    def to_dict(self):
        return {
            "timestamp": self.timestamp.isoformat(),
            "session_id": self.session_id,
            "alert_type": self.alert_type,
            "description": self.description,
            "severity": self.severity.value,
            "seq_num_at_event": self.seq_num_at_event,
            "previous_seq_num": self.previous_seq_num,
        }


@dataclass
class Session:
    session_id: str
    sender_comp_id: str
    target_comp_id: str
    status: SessionStatus = SessionStatus.DISCONNECTED
    incoming_seq_num: int = 0
    outgoing_seq_num: int = 0
    last_msg_time: Optional[datetime] = None
    messages: list = field(default_factory=list)
    alerts: list = field(default_factory=list)
    seq_num_history: list = field(default_factory=list)
    log_gap_detected: bool = False
    attack_count: int = 0

    def to_dict(self):
        return {
            "session_id": self.session_id,
            "sender_comp_id": self.sender_comp_id,
            "target_comp_id": self.target_comp_id,
            "status": self.status.value,
            "incoming_seq_num": self.incoming_seq_num,
            "outgoing_seq_num": self.outgoing_seq_num,
            "last_msg_time": self.last_msg_time.isoformat() if self.last_msg_time else None,
            "attack_count": self.attack_count,
            "log_gap_detected": self.log_gap_detected,
            "alerts": [a.to_dict() for a in self.alerts[-20:]],
            "seq_num_history": self.seq_num_history[-100:],
        }
