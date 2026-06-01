from pydantic import BaseModel
from typing import Optional


class ConnectRequest(BaseModel):
    host: str
    port: int
    username: str
    password: str
    namespace: Optional[str] = "root/SMI-S"
    ssl_verify: Optional[bool] = False


class ProviderInfo(BaseModel):
    product: str = ""
    version: str = ""
    vendor: str = ""


class ConnectResponse(BaseModel):
    success: bool
    message: str
    provider_info: ProviderInfo = ProviderInfo()


class StatusResponse(BaseModel):
    connected: bool
    provider_info: ProviderInfo = ProviderInfo()
    last_sync: Optional[str] = None


class StoragePool(BaseModel):
    id: str
    name: str
    path: str = ""
    total_size_gb: float = 0.0
    used_size_gb: float = 0.0
    free_size_gb: float = 0.0
    pool_type: str = ""
    health_state: str = "Unknown"
    system_name: str = ""


class StoragePoolsResponse(BaseModel):
    pools: list[StoragePool] = []
    total: int = 0


class StorageVolume(BaseModel):
    id: str
    name: str
    path: str = ""
    size_gb: float = 0.0
    volume_type: str = ""
    pool_id: str = ""
    health_state: str = "Unknown"
    system_name: str = ""


class StorageVolumesResponse(BaseModel):
    volumes: list[StorageVolume] = []
    total: int = 0


class MaskingView(BaseModel):
    id: str
    name: str
    path: str = ""
    volume_id: str = ""
    volume_name: str = ""
    initiator_ids: list[str] = []
    port_ids: list[str] = []
    system_name: str = ""


class MaskingViewsResponse(BaseModel):
    views: list[MaskingView] = []
    total: int = 0


class TopologyNode(BaseModel):
    id: str
    label: str
    type: str
    status: str = "Unknown"
    properties: Optional[dict] = None


class TopologyEdge(BaseModel):
    source: str
    target: str
    relation: str


class TopologyResponse(BaseModel):
    nodes: list[TopologyNode] = []
    edges: list[TopologyEdge] = []


class CreateLUNRequest(BaseModel):
    pool_id: str
    name: str
    size_gb: float
    purpose: Optional[str] = ""


class CreateLUNResponse(BaseModel):
    success: bool
    message: str
    volume_id: str = ""
    volume_name: str = ""


class CreateMaskingViewRequest(BaseModel):
    volume_id: str
    view_name: str
    initiator_wwns: list[str] = []
    port_wwns: list[str] = []


class CreateMaskingViewResponse(BaseModel):
    success: bool
    message: str
    view_id: str = ""
    view_name: str = ""
