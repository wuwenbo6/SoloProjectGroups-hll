from datetime import datetime
from enum import Enum, IntEnum
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List


BHS_LENGTH = 48

ISCSI_OPCODE_SCSI_RESP = 0x21
ISCSI_OPCODE_SCSI_DATA_IN = 0x25
ISCSI_OPCODE_R2T = 0x31
ISCSI_OPCODE_LOGIN_RESP = 0x23
ISCSI_OPCODE_NOP_IN = 0x20

ISCSI_FLAG_FINAL = 0x80
ISCSI_FLAG_IMMEDIATE = 0x40

SCSI_STATUS_GOOD = 0x00

ISCSI_RESPONSE_COMMAND_COMPLETED = 0x00

LOGIN_FLAG_TRANSIT = 0x80
LOGIN_STAGE_FULL_FEATURE_PHASE = 0x03


class ConnectionState(Enum):
    FREE = "FREE"
    XPT_WAIT = "XPT_WAIT"
    IN_LOGIN = "IN_LOGIN"
    LOGGED_IN = "LOGGED_IN"
    IN_LOGOUT = "IN_LOGOUT"
    LOGOUT_REQUESTED = "LOGOUT_REQUESTED"
    CLEANUP_WAIT = "CLEANUP_WAIT"
    ERROR_RECOVERY = "ERROR_RECOVERY"


@dataclass
class ConnectionInfo:
    connection_id: str
    address: str
    cid: int
    state: ConnectionState
    session_id: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)
    last_activity: datetime = field(default_factory=datetime.now)
    is_faulty: bool = False
    stats: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ISCSIPDU:
    opcode: int
    immediate: bool = False
    final: bool = False
    data: bytes = b""
    flags: int = 0
    total_ahs_length: int = 0
    data_segment_length: int = 0
    lun: int = 0
    initiator_task_tag: int = 0
    cmd_sn: int = 0
    exp_cmd_sn: int = 0
    max_cmd_sn: int = 0
    exp_stat_sn: int = 0
    stat_sn: int = 0
    header_digest: int = 0
    ahs_segments: bytes = b""
    opcode_specific: Dict[str, Any] = field(default_factory=dict)
    header: Dict[str, Any] = field(default_factory=dict)


class Opcode(IntEnum):
    NOP_OUT = 0x00
    SCSI_COMMAND = 0x01
    SCSI_TASK_MANAGEMENT = 0x02
    LOGIN_REQUEST = 0x03
    TEXT_REQUEST = 0x04
    LOGOUT_REQUEST = 0x06
    NOP_IN = 0x10
    SCSI_RESPONSE = 0x11
    SCSI_TASK_MANAGEMENT_RESPONSE = 0x12
    LOGIN_RESPONSE = 0x13
    TEXT_RESPONSE = 0x14
    LOGOUT_RESPONSE = 0x16
    READY_TO_TRANSFER = 0x20
    SCSI_DATA_IN = 0x21
    SCSI_DATA_OUT = 0x22


class SessionState(Enum):
    FREE = "FREE"
    LOGGED_IN = "LOGGED_IN"
    CONTINUE = "CONTINUE"
    ERROR_RECOVERY = "ERROR_RECOVERY"
    LOGOUT_REQUEST = "LOGOUT_REQUEST"


class ErrorRecoveryLevel(IntEnum):
    ERL0 = 0
    ERL1 = 1
    ERL2 = 2


class CommandStatus(Enum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    RETRANSMITTING = "RETRANSMITTING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class LogLevel(Enum):
    INFO = "INFO"
    DEBUG = "DEBUG"
    WARNING = "WARNING"
    ERROR = "ERROR"


class LogDirection(Enum):
    IN = "IN"
    OUT = "OUT"
    SYSTEM = "SYSTEM"


@dataclass
class CommandEvent:
    type: str
    timestamp: float
    connection_id: Optional[str] = None
    reason: Optional[str] = None


@dataclass
class CommandRecord:
    id: str
    cmd_sn: int
    exp_stat_sn: int
    opcode: str
    status: CommandStatus
    retry_count: int
    created_at: float
    completed_at: Optional[float] = None
    events: List[CommandEvent] = field(default_factory=list)


@dataclass
class LogEntry:
    id: str
    timestamp: float
    level: LogLevel
    direction: LogDirection
    message: str
    pdu_type: Optional[str] = None
    connection_id: Optional[str] = None


@dataclass
class SessionConfig:
    target_iqn: str
    initiator_iqn: Optional[str] = None
    erl_level: ErrorRecoveryLevel = ErrorRecoveryLevel.ERL1
    max_connections: int = 1
    first_burst_length: int = 65536
    max_burst_length: int = 262144


@dataclass
class Statistics:
    total_commands: int = 0
    successful_commands: int = 0
    retransmitted_commands: int = 0
    failed_commands: int = 0
    total_retries: int = 0
    active_commands: int = 0
    fault_count: int = 0
    recovery_count: int = 0
    recovery_times: List[float] = field(default_factory=list)


def opcode_to_name(opcode: int) -> str:
    try:
        return Opcode(opcode).name
    except ValueError:
        return f"UNKNOWN_0x{opcode:02X}"


def name_to_opcode(name: str) -> Optional[int]:
    try:
        return Opcode[name].value
    except KeyError:
        return None
