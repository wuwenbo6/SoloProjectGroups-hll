from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional, List


class VarBind(BaseModel):
    oid: str
    value_type: str
    value: str


class SnmpTrap(BaseModel):
    id: str
    trap_id: str
    timestamp: str
    source_ip: str
    source_port: int
    snmp_version: str
    community: Optional[str] = None
    trap_oid: str
    variable_bindings: list[VarBind]
    raw_pdu: str
    is_duplicate: bool = False


class V3User(BaseModel):
    username: str
    auth_protocol: str = "NONE"
    auth_key: str = ""
    priv_protocol: str = "NONE"
    priv_key: str = ""


class ForwardTarget(BaseModel):
    id: str
    type: str
    enabled: bool = True
    name: str = ""
    host: Optional[str] = None
    port: Optional[int] = None
    protocol: Optional[str] = None
    url: Optional[str] = None
    method: str = "POST"
    format: str = "syslog"
    facility: int = 16
    severity: int = 6


class OidMapping(BaseModel):
    oid: str
    name: str
    description: Optional[str] = None


class SnmpConfig(BaseModel):
    listen_port: int = 162
    v2c_communities: list[str] = ["public"]
    v3_users: list[V3User] = []
    forward_targets: list[ForwardTarget] = []
    oid_mappings: list[OidMapping] = []


class EngineIdDiscoveryRequest(BaseModel):
    target_ip: str
    target_port: int = 161


class EngineIdDiscoveryResponse(BaseModel):
    success: bool
    engine_id: Optional[str] = None
    engine_id_hex: Optional[str] = None
    error: Optional[str] = None


class ServiceStatus(BaseModel):
    listening: bool
    listen_port: int
    trap_count: int
    duplicate_count: int
    uptime: float


class TrapListResponse(BaseModel):
    traps: list[SnmpTrap]
    total: int


class MessageResponse(BaseModel):
    message: str
