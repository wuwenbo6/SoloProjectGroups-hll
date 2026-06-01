from pydantic import BaseModel, Field
from typing import Optional, Any
from enum import Enum
import uuid
import time


class NodeMode(str, Enum):
    ACTIVE = "active"
    PASSIVE = "passive"


class LoopbackMode(str, Enum):
    NONE = "none"
    LOCAL_LOOPBACK = "local_loopback"
    REMOTE_LOOPBACK = "remote_loopback"


class CriticalEventCause(str, Enum):
    UNKNOWN = "unknown"
    POWER_OFF = "power_off"
    RESET = "reset"
    GENERIC_HARDWARE_ERROR = "generic_hardware_error"
    GENERIC_SOFTWARE_ERROR = "generic_software_error"
    PORT_STATE_CHANGE = "port_state_change"
    CONFIGURATION_CHANGE = "configuration_change"


class DyingGaspCause(str, Enum):
    UNKNOWN = "unknown"
    POWER_FAILURE = "power_failure"
    OVERHEATING = "overheating"
    WATCHDOG_RESET = "watchdog_reset"
    FAN_FAILURE = "fan_failure"
    POWER_SUPPLY_FAILURE = "power_supply_failure"
    HARDWARE_FAILURE = "hardware_failure"
    SOFTWARE_CRASH = "software_crash"


class ExportFormat(str, Enum):
    JSON = "json"
    CSV = "csv"


class DiscoveryState(str, Enum):
    IDLE = "idle"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class LinkStatus(str, Enum):
    UP = "up"
    DOWN = "down"
    FAULT = "fault"


class PDUTypeEnum(str, Enum):
    DISCOVERY = "discovery"
    INFORMATION = "information"
    EVENT = "event"
    VARIABLE_REQUEST = "variable_request"
    VARIABLE_RESPONSE = "variable_response"


class EventTypeEnum(str, Enum):
    INFO = "info"
    DISCOVERY = "discovery"
    PDU = "pdu"
    FAULT = "fault"
    STATE_CHANGE = "state_change"


class EventSeverityEnum(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class NodeConfig(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    mac_address: str
    mode: NodeMode = NodeMode.ACTIVE
    loopback_mode: LoopbackMode = LoopbackMode.NONE


class PDUFields(BaseModel):
    code: int
    flags: int
    type: int
    payload: dict[str, Any]


class PDUData(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: float = Field(default_factory=time.time)
    direction: str
    type: PDUTypeEnum
    source_mac: str
    dest_mac: str
    fields: PDUFields
    raw_hex: str


class OAMEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: float = Field(default_factory=time.time)
    type: EventTypeEnum
    severity: EventSeverityEnum
    message: str
    details: Optional[dict[str, Any]] = None


class OAMStateResponse(BaseModel):
    simulation_running: bool
    discovery_state: DiscoveryState
    link_status: LinkStatus
    nodes: list[NodeConfig]
    local_state: str
    remote_state: str
    local_mac: str
    remote_mac: str


class ClientMessage(BaseModel):
    type: str
    payload: Optional[dict[str, Any]] = None


class ServerMessage(BaseModel):
    type: str
    timestamp: float = Field(default_factory=time.time)
    payload: Optional[dict[str, Any]] = None


class ConfigureRequest(BaseModel):
    node_id: str
    name: Optional[str] = None
    mac_address: Optional[str] = None
    mode: Optional[NodeMode] = None
    loopback_mode: Optional[LoopbackMode] = None


class ModeRequest(BaseModel):
    mode: NodeMode
    node_id: Optional[str] = None


class LoopbackModeRequest(BaseModel):
    loopback_mode: LoopbackMode
    node_id: Optional[str] = None


class CriticalEventRequest(BaseModel):
    cause: CriticalEventCause = CriticalEventCause.UNKNOWN
    cause_text: Optional[str] = ""
    node_id: Optional[str] = None


class DyingGaspRequest(BaseModel):
    cause: DyingGaspCause = DyingGaspCause.UNKNOWN
    cause_text: Optional[str] = ""
    node_id: Optional[str] = None


class EventResponse(BaseModel):
    events: list[OAMEvent]
    total: int
