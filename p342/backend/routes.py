from fastapi import APIRouter
from fastapi.responses import Response

from models import (
    ConnectRequest,
    ConnectResponse,
    StatusResponse,
    StoragePoolsResponse,
    StorageVolumesResponse,
    MaskingViewsResponse,
    TopologyResponse,
    CreateLUNRequest,
    CreateLUNResponse,
    CreateMaskingViewRequest,
    CreateMaskingViewResponse,
)
from smis_service import SMISService

router = APIRouter(prefix="/api")
smis_service = SMISService()


@router.post("/connect", response_model=ConnectResponse)
def connect(request: ConnectRequest) -> ConnectResponse:
    success, message, provider_info = smis_service.connect(
        host=request.host,
        port=request.port,
        username=request.username,
        password=request.password,
        namespace=request.namespace or "root/SMI-S",
        ssl_verify=request.ssl_verify if request.ssl_verify is not None else False,
    )
    return ConnectResponse(success=success, message=message, provider_info=provider_info)


@router.get("/status", response_model=StatusResponse)
def get_status() -> StatusResponse:
    return StatusResponse(
        connected=smis_service.connected,
        provider_info=smis_service.provider_info,
        last_sync=smis_service.last_sync,
    )


@router.get("/storage-pools", response_model=StoragePoolsResponse)
def get_storage_pools() -> StoragePoolsResponse:
    pools = smis_service.enumerate_storage_pools()
    return StoragePoolsResponse(pools=pools, total=len(pools))


@router.get("/storage-volumes", response_model=StorageVolumesResponse)
def get_storage_volumes() -> StorageVolumesResponse:
    volumes = smis_service.enumerate_storage_volumes()
    sim_volumes = smis_service.get_simulated_volumes()
    all_volumes = volumes + sim_volumes
    return StorageVolumesResponse(volumes=all_volumes, total=len(all_volumes))


@router.get("/masking-views", response_model=MaskingViewsResponse)
def get_masking_views() -> MaskingViewsResponse:
    views = smis_service.enumerate_masking_views()
    sim_views = smis_service.get_simulated_masking_views()
    all_views = views + sim_views
    return MaskingViewsResponse(views=all_views, total=len(all_views))


@router.get("/topology", response_model=TopologyResponse)
def get_topology() -> TopologyResponse:
    nodes, edges = smis_service.build_topology()
    return TopologyResponse(nodes=nodes, edges=edges)


@router.post("/create-lun", response_model=CreateLUNResponse)
def create_lun(request: CreateLUNRequest) -> CreateLUNResponse:
    success, message, vol_id, vol_name = smis_service.simulate_create_lun(
        pool_id=request.pool_id,
        name=request.name,
        size_gb=request.size_gb,
        purpose=request.purpose or "",
    )
    return CreateLUNResponse(success=success, message=message, volume_id=vol_id, volume_name=vol_name)


@router.post("/create-masking-view", response_model=CreateMaskingViewResponse)
def create_masking_view(request: CreateMaskingViewRequest) -> CreateMaskingViewResponse:
    success, message, view_id, view_name = smis_service.simulate_create_masking_view(
        volume_id=request.volume_id,
        view_name=request.view_name,
        initiator_wwns=request.initiator_wwns,
        port_wwns=request.port_wwns,
    )
    return CreateMaskingViewResponse(success=success, message=message, view_id=view_id, view_name=view_name)


@router.get("/export-xml")
def export_xml():
    xml_content = smis_service.export_xml()
    return Response(
        content=xml_content,
        media_type="application/xml",
        headers={
            "Content-Disposition": "attachment; filename=storage_config.xml",
        },
    )
