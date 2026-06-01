from enum import Enum
from typing import Optional
from pydantic import BaseModel


class RouterType(str, Enum):
    ROUTER = "router"
    SOURCE = "source"
    RECEIVER = "receiver"


class MRouteType(str, Enum):
    STARG = "starg"
    SG = "sg"


class PresetType(str, Enum):
    BASIC_RPT = "BASIC_RPT"
    SPT_SWITCH = "SPT_SWITCH"
    MULTI_SOURCE = "MULTI_SOURCE"
    PRUNE_LEAVE = "PRUNE_LEAVE"


class Router(BaseModel):
    id: str
    name: str
    type: RouterType
    x: float
    y: float
    is_rp: bool = False


class Interface(BaseModel):
    id: str
    name: str
    router_id: str
    neighbor_router_id: Optional[str] = None
    neighbor_if_id: Optional[str] = None
    cost: int = 1


class Link(BaseModel):
    id: str
    router_a_id: str
    router_b_id: str
    interface_a_id: str
    interface_b_id: str
    cost: int = 1


class MRouteEntry(BaseModel):
    id: str
    router_id: str
    entry_type: MRouteType
    group: str
    source: Optional[str] = None
    upstream_if: Optional[str] = None
    downstream_ifs: list[str] = []
    expire: int = 180


class MulticastGroup(BaseModel):
    group_addr: str
    rp_id: Optional[str] = None
    source_ids: list[str] = []
    receiver_ids: list[str] = []


class JoinRequest(BaseModel):
    router_id: str
    group: str
    source: Optional[str] = None
    join_type: str = "starg"


class PruneRequest(BaseModel):
    router_id: str
    group: str
    source: Optional[str] = None
    prune_type: str = "starg"


class RegisterRequest(BaseModel):
    source_id: str
    group: str


class SwitchSPTRequest(BaseModel):
    receiver_id: str
    group: str
    source_id: str


class SimEvent(BaseModel):
    type: str
    timestamp: float
    data: dict


class Topology(BaseModel):
    routers: list[Router] = []
    links: list[Link] = []


class RouteEntry(BaseModel):
    id: str
    router_id: str
    destination: str
    next_hop: str
    interface: str
    metric: int
    protocol: str = "static"


class RPFCheckRequest(BaseModel):
    router_id: str
    source_addr: str
    incoming_if: Optional[str] = None


class RPFCheckResult(BaseModel):
    passed: bool
    rpf_interface: Optional[str] = None
    source_addr: str
    router_id: str
    reason: Optional[str] = None


class RegisterRequest(BaseModel):
    source_id: str
    group: str
    source_ip: Optional[str] = None
    packet_source_ip: Optional[str] = None
