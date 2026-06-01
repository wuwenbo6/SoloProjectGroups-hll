from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from typing import Optional
from datetime import datetime
from ..core.simulator import OAMSimulator
from ..models.schemas import (
    OAMStateResponse,
    ConfigureRequest,
    ModeRequest,
    LoopbackModeRequest,
    CriticalEventRequest,
    DyingGaspRequest,
    EventResponse,
    NodeMode,
    ExportFormat,
)

router = APIRouter(prefix="/api", tags=["OAM Simulator"])

simulator: Optional[OAMSimulator] = None


def set_simulator(sim: OAMSimulator):
    global simulator
    simulator = sim


@router.get("/state", response_model=OAMStateResponse)
async def get_state():
    if not simulator:
        raise HTTPException(status_code=500, detail="Simulator not initialized")
    return simulator.get_state()


@router.post("/configure")
async def configure_node(request: ConfigureRequest):
    if not simulator:
        raise HTTPException(status_code=500, detail="Simulator not initialized")

    success = simulator.configure_node(
        node_id=request.node_id,
        name=request.name,
        mac_address=request.mac_address,
        mode=request.mode.value if request.mode else None,
        loopback_mode=request.loopback_mode.value if request.loopback_mode else None,
    )

    if not success:
        raise HTTPException(status_code=404, detail=f"Node {request.node_id} not found")

    return {"success": True, "state": simulator.get_state()}


@router.post("/mode")
async def set_mode(request: ModeRequest):
    if not simulator:
        raise HTTPException(status_code=500, detail="Simulator not initialized")

    node_id = request.node_id or "node-a"
    success = simulator.configure_node(
        node_id=node_id,
        mode=request.mode.value,
    )

    if not success:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")

    return {"success": True, "state": simulator.get_state()}


@router.post("/loopback")
async def set_loopback_mode(request: LoopbackModeRequest):
    if not simulator:
        raise HTTPException(status_code=500, detail="Simulator not initialized")

    node_id = request.node_id or "node-a"
    success = simulator.set_loopback_mode(node_id, request.loopback_mode.value)

    if not success:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")

    return {"success": True, "state": simulator.get_state()}


@router.post("/critical-event")
async def send_critical_event(request: CriticalEventRequest):
    if not simulator:
        raise HTTPException(status_code=500, detail="Simulator not initialized")

    node_id = request.node_id or "node-a"
    success = await simulator.send_critical_event(
        sender_id=node_id,
        cause=request.cause.value,
        cause_text=request.cause_text or "",
    )

    if not success:
        raise HTTPException(status_code=400, detail="Simulation is not running or node not found")

    return {"success": True, "state": simulator.get_state()}


@router.post("/dying-gasp")
async def send_dying_gasp(request: DyingGaspRequest):
    if not simulator:
        raise HTTPException(status_code=500, detail="Simulator not initialized")

    node_id = request.node_id or "node-a"
    success = await simulator.send_dying_gasp(
        sender_id=node_id,
        cause=request.cause.value,
        cause_text=request.cause_text or "",
    )

    if not success:
        raise HTTPException(status_code=400, detail="Simulation is not running or node not found")

    return {"success": True, "state": simulator.get_state()}


@router.get("/events/export")
async def export_events(
    format: ExportFormat = ExportFormat.JSON,
    limit: Optional[int] = None,
):
    if not simulator:
        raise HTTPException(status_code=500, detail="Simulator not initialized")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    if format == ExportFormat.JSON:
        content = simulator.export_events_json(limit=limit)
        media_type = "application/json"
        filename = f"oam_events_{timestamp}.json"
    elif format == ExportFormat.CSV:
        content = simulator.export_events_csv(limit=limit)
        media_type = "text/csv"
        filename = f"oam_events_{timestamp}.csv"
    else:
        raise HTTPException(status_code=400, detail="Unsupported export format")

    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        },
    )


@router.post("/start")
async def start_simulation():
    if not simulator:
        raise HTTPException(status_code=500, detail="Simulator not initialized")

    await simulator.start()
    return {"success": True, "state": simulator.get_state()}


@router.post("/stop")
async def stop_simulation():
    if not simulator:
        raise HTTPException(status_code=500, detail="Simulator not initialized")

    await simulator.stop()
    return {"success": True, "state": simulator.get_state()}


@router.post("/fault/trigger")
async def trigger_fault(fault_type: str = "manual", description: str = "Manual fault injection"):
    if not simulator:
        raise HTTPException(status_code=500, detail="Simulator not initialized")

    success = await simulator.trigger_fault(fault_type, description)
    if not success:
        raise HTTPException(status_code=400, detail="Simulation is not running")

    return {"success": True, "state": simulator.get_state()}


@router.post("/fault/clear")
async def clear_fault():
    if not simulator:
        raise HTTPException(status_code=500, detail="Simulator not initialized")

    success = await simulator.clear_fault()
    if not success:
        raise HTTPException(status_code=400, detail="No active fault or simulation not running")

    return {"success": True, "state": simulator.get_state()}


@router.get("/events", response_model=EventResponse)
async def get_events(limit: Optional[int] = 100):
    if not simulator:
        raise HTTPException(status_code=500, detail="Simulator not initialized")

    events = simulator.get_events(limit=limit)
    return {"events": events, "total": len(events)}


@router.get("/pdus")
async def get_pdus(limit: Optional[int] = 100):
    if not simulator:
        raise HTTPException(status_code=500, detail="Simulator not initialized")

    pdus = simulator.get_pdus(limit=limit)
    return {"pdus": pdus, "total": len(pdus)}
