import asyncio
from datetime import datetime, timezone
from uuid import uuid4
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


app = FastAPI(title="H.323 Gatekeeper RAS Simulator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TerminalAlias(BaseModel):
    h323_id: str = ""
    e164: str = ""


class Terminal(BaseModel):
    id: str
    aliases: TerminalAlias
    signaling_address: str
    signaling_port: int
    ras_address: str
    registration_time: str
    status: str
    time_to_live: int
    last_irr_time: Optional[str] = None


class AdmissionRequest(BaseModel):
    id: str
    caller_alias: str
    callee_alias: str
    callee_routed_to: Optional[str] = None
    bandwidth: int
    call_type: str
    status: str
    request_time: str
    response_time: Optional[str] = None
    reject_reason: Optional[str] = None


class RASMessage(BaseModel):
    id: str
    type: str
    direction: str
    source: str
    destination: str
    timestamp: str
    payload: dict


class GatekeeperInfo(BaseModel):
    id: str
    name: str
    status: str
    total_bandwidth: int
    used_bandwidth: int
    registered_count: int = 0
    active_calls: int = 0
    irq_interval: int = 30
    irq_timeout: int = 10


class GRQRequest(BaseModel):
    terminal_alias: str
    ras_address: str


class RRQRequest(BaseModel):
    h323_id: str = ""
    e164: str = ""
    signaling_address: str
    signaling_port: int
    ras_address: str
    time_to_live: int = 600


class ARQRequest(BaseModel):
    caller_alias: str
    callee_alias: str
    bandwidth: int = 128
    call_type: str = "point_to_point"


class BandwidthUpdate(BaseModel):
    total_bandwidth: int


class IRRResponse(BaseModel):
    terminal_id: str


class IRQConfig(BaseModel):
    interval: int = 30
    timeout: int = 10


class BRQRequest(BaseModel):
    admission_id: str
    new_bandwidth: int


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, event: str, data: dict):
        message = {"event": event, "data": data}
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)


def generate_id() -> str:
    return uuid4().hex


def get_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def _alias_display(aliases: TerminalAlias) -> str:
    parts = []
    if aliases.h323_id:
        parts.append(f"h323:{aliases.h323_id}")
    if aliases.e164:
        parts.append(f"e164:{aliases.e164}")
    return parts[0] if len(parts) == 1 else " | ".join(parts) if parts else "unknown"


def _find_terminal_by_alias(alias: str) -> Optional[Terminal]:
    for t in terminals:
        if t.status != "online":
            continue
        if alias == t.aliases.h323_id or alias == t.aliases.e164:
            return t
        if alias == f"h323:{t.aliases.h323_id}" or alias == f"e164:{t.aliases.e164}":
            return t
        if alias == _alias_display(t.aliases):
            return t
    return None


gatekeeper = GatekeeperInfo(
    id="gk-001",
    name="H.323-Gatekeeper-01",
    status="running",
    total_bandwidth=10000,
    used_bandwidth=0,
    irq_interval=30,
    irq_timeout=10,
)

terminals: list[Terminal] = []
admissions: list[AdmissionRequest] = []
ras_messages: list[RASMessage] = []

manager = ConnectionManager()

irq_pending: dict[str, asyncio.Event] = {}
irq_task_handle: Optional[asyncio.Task] = None


async def log_ras_message(
    msg_type: str, direction: str, source: str, destination: str, payload: dict
):
    msg = RASMessage(
        id=generate_id(),
        type=msg_type,
        direction=direction,
        source=source,
        destination=destination,
        timestamp=get_timestamp(),
        payload=payload,
    )
    ras_messages.append(msg)
    await manager.broadcast("ras_message", msg.model_dump())


def _compute_gatekeeper() -> GatekeeperInfo:
    online_count = sum(1 for t in terminals if t.status == "online")
    confirmed = [a for a in admissions if a.status == "confirmed"]
    used_bw = sum(a.bandwidth for a in confirmed)
    gatekeeper.registered_count = online_count
    gatekeeper.active_calls = len(confirmed)
    gatekeeper.used_bandwidth = used_bw
    return gatekeeper


async def _force_unregister(terminal: Terminal, reason: str):
    await log_ras_message(
        "URQ", "outbound", gatekeeper.name, terminal.ras_address,
        {"terminal_id": terminal.id, "aliases": terminal.aliases.model_dump(), "reason": reason},
    )
    terminal.status = "offline"
    await log_ras_message(
        "UCF", "inbound", terminal.ras_address, gatekeeper.name,
        {"terminal_id": terminal.id, "aliases": terminal.aliases.model_dump()},
    )
    await manager.broadcast("terminal_unregistered", terminal.model_dump())
    _compute_gatekeeper()
    await manager.broadcast("gatekeeper_update", gatekeeper.model_dump())


async def _irq_cycle():
    while gatekeeper.status == "running":
        await asyncio.sleep(gatekeeper.irq_interval)
        online_terminals = [t for t in terminals if t.status == "online"]
        for t in online_terminals:
            alias_str = _alias_display(t.aliases)
            await log_ras_message(
                "IRQ", "outbound", gatekeeper.name, t.ras_address,
                {"terminal_id": t.id, "aliases": t.aliases.model_dump()},
            )
            response_event = asyncio.Event()
            irq_pending[t.id] = response_event
            try:
                await asyncio.wait_for(response_event.wait(), timeout=gatekeeper.irq_timeout)
                await log_ras_message(
                    "IRR", "inbound", t.ras_address, gatekeeper.name,
                    {"terminal_id": t.id, "aliases": t.aliases.model_dump(), "status": "alive"},
                )
                t.last_irr_time = get_timestamp()
            except asyncio.TimeoutError:
                await log_ras_message(
                    "IRR_TIMEOUT", "outbound", gatekeeper.name, t.ras_address,
                    {"terminal_id": t.id, "aliases": t.aliases.model_dump(), "reason": "IRR timeout - no response"},
                )
                await _force_unregister(t, "IRR timeout - terminal did not respond to IRQ")
            finally:
                irq_pending.pop(t.id, None)


@app.on_event("startup")
async def startup():
    sample_terminals = [
        ("terminal-001", "endpoint1@example.com", "1001", "192.168.1.101", 1720, "192.168.1.101"),
        ("terminal-002", "endpoint2@example.com", "1002", "192.168.1.102", 1720, "192.168.1.102"),
        ("terminal-003", "endpoint3@example.com", "1003", "192.168.1.103", 1720, "192.168.1.103"),
    ]
    for tid, h323_id, e164, sig_addr, sig_port, ras_addr in sample_terminals:
        t = Terminal(
            id=tid,
            aliases=TerminalAlias(h323_id=h323_id, e164=e164),
            signaling_address=sig_addr,
            signaling_port=sig_port,
            ras_address=ras_addr,
            registration_time=get_timestamp(),
            status="online",
            time_to_live=600,
            last_irr_time=get_timestamp(),
        )
        terminals.append(t)
    _compute_gatekeeper()
    global irq_task_handle
    irq_task_handle = asyncio.create_task(_irq_cycle())


@app.on_event("shutdown")
async def shutdown():
    if irq_task_handle:
        irq_task_handle.cancel()


@app.get("/api/gatekeeper")
async def get_gatekeeper():
    return _compute_gatekeeper().model_dump()


@app.get("/api/terminals")
async def get_terminals():
    return [t.model_dump() for t in terminals]


@app.post("/api/terminals/register")
async def register_terminal(req: RRQRequest):
    alias_display = _alias_display(TerminalAlias(h323_id=req.h323_id, e164=req.e164))

    await log_ras_message(
        "RRQ", "inbound", req.ras_address, gatekeeper.name,
        {"h323_id": req.h323_id, "e164": req.e164, "signaling_address": req.signaling_address, "signaling_port": req.signaling_port, "ras_address": req.ras_address, "time_to_live": req.time_to_live},
    )

    terminal = Terminal(
        id=generate_id(),
        aliases=TerminalAlias(h323_id=req.h323_id, e164=req.e164),
        signaling_address=req.signaling_address,
        signaling_port=req.signaling_port,
        ras_address=req.ras_address,
        registration_time=get_timestamp(),
        status="online",
        time_to_live=req.time_to_live,
        last_irr_time=None,
    )
    terminals.append(terminal)

    await log_ras_message(
        "RCF", "outbound", gatekeeper.name, req.ras_address,
        {"terminal_id": terminal.id, "aliases": terminal.aliases.model_dump()},
    )

    await manager.broadcast("terminal_registered", terminal.model_dump())
    _compute_gatekeeper()
    await manager.broadcast("gatekeeper_update", gatekeeper.model_dump())
    return terminal.model_dump()


@app.delete("/api/terminals/{terminal_id}")
async def unregister_terminal(terminal_id: str):
    terminal = None
    for t in terminals:
        if t.id == terminal_id:
            terminal = t
            break
    if not terminal:
        raise HTTPException(status_code=404, detail="Terminal not found")

    await _force_unregister(terminal, "manual unregister")
    return terminal.model_dump()


@app.post("/api/terminals/irr")
async def receive_irr(req: IRRResponse):
    terminal = None
    for t in terminals:
        if t.id == req.terminal_id:
            terminal = t
            break
    if not terminal:
        raise HTTPException(status_code=404, detail="Terminal not found")

    if terminal.id in irq_pending:
        irq_pending[terminal.id].set()

    terminal.last_irr_time = get_timestamp()
    await manager.broadcast("terminal_registered", terminal.model_dump())
    return {"status": "ok"}


@app.post("/api/ras/irq/{terminal_id}")
async def manual_irq(terminal_id: str):
    terminal = None
    for t in terminals:
        if t.id == terminal_id:
            terminal = t
            break
    if not terminal:
        raise HTTPException(status_code=404, detail="Terminal not found")
    if terminal.status != "online":
        raise HTTPException(status_code=400, detail="Terminal is offline")

    alias_str = _alias_display(terminal.aliases)
    await log_ras_message(
        "IRQ", "outbound", gatekeeper.name, terminal.ras_address,
        {"terminal_id": terminal.id, "aliases": terminal.aliases.model_dump()},
    )

    response_event = asyncio.Event()
    irq_pending[terminal.id] = response_event

    try:
        await asyncio.wait_for(response_event.wait(), timeout=gatekeeper.irq_timeout)
        await log_ras_message(
            "IRR", "inbound", terminal.ras_address, gatekeeper.name,
            {"terminal_id": terminal.id, "aliases": terminal.aliases.model_dump(), "status": "alive"},
        )
        terminal.last_irr_time = get_timestamp()
        await manager.broadcast("terminal_registered", terminal.model_dump())
        return {"status": "alive", "terminal_id": terminal.id}
    except asyncio.TimeoutError:
        await log_ras_message(
            "IRR_TIMEOUT", "outbound", gatekeeper.name, terminal.ras_address,
            {"terminal_id": terminal.id, "aliases": terminal.aliases.model_dump(), "reason": "IRR timeout"},
        )
        await _force_unregister(terminal, "IRR timeout - manual probe failed")
        return {"status": "timeout", "terminal_id": terminal.id, "action": "unregistered"}


@app.get("/api/admissions")
async def get_admissions():
    return [a.model_dump() for a in admissions]


@app.post("/api/admissions/bandwidth")
async def change_bandwidth(req: BRQRequest):
    admission = None
    for a in admissions:
        if a.id == req.admission_id:
            admission = a
            break
    if not admission:
        raise HTTPException(status_code=404, detail="Admission not found")

    caller = _find_terminal_by_alias(admission.caller_alias)
    caller_ras = caller.ras_address if caller else admission.caller_alias

    await log_ras_message(
        "BRQ", "inbound", caller_ras, gatekeeper.name,
        {"admission_id": req.admission_id, "old_bandwidth": admission.bandwidth, "new_bandwidth": req.new_bandwidth},
    )

    old_bw = admission.bandwidth
    bandwidth_diff = req.new_bandwidth - old_bw
    gk = _compute_gatekeeper()
    available = gk.total_bandwidth - gk.used_bandwidth

    if bandwidth_diff > 0 and bandwidth_diff > available:
        reject_reason = f"Insufficient bandwidth for change: requested delta={bandwidth_diff}, available={available}"
        admission.status = "rejected"
        admission.response_time = get_timestamp()
        admission.reject_reason = reject_reason
        await log_ras_message(
            "BRJ", "outbound", gatekeeper.name, caller_ras,
            {"admission_id": req.admission_id, "reason": reject_reason},
        )
        await manager.broadcast("admission_update", admission.model_dump())
        return admission.model_dump()

    admission.bandwidth = req.new_bandwidth
    admission.response_time = get_timestamp()
    admission.status = "confirmed"

    await log_ras_message(
        "BCF", "outbound", gatekeeper.name, caller_ras,
        {"admission_id": req.admission_id, "old_bandwidth": old_bw, "new_bandwidth": req.new_bandwidth, "bandwidth_delta": bandwidth_diff},
    )

    _compute_gatekeeper()
    await manager.broadcast("admission_update", admission.model_dump())
    return admission.model_dump()


@app.post("/api/admissions/request")
async def request_admission(req: ARQRequest):
    await log_ras_message(
        "ARQ", "inbound", req.caller_alias, gatekeeper.name,
        {"caller_alias": req.caller_alias, "callee_alias": req.callee_alias, "bandwidth": req.bandwidth, "call_type": req.call_type},
    )

    caller = _find_terminal_by_alias(req.caller_alias)
    callee = _find_terminal_by_alias(req.callee_alias)

    if not caller:
        reject_reason = f"Caller not found or offline: {req.caller_alias}"
        admission = AdmissionRequest(
            id=generate_id(),
            caller_alias=req.caller_alias,
            callee_alias=req.callee_alias,
            bandwidth=req.bandwidth,
            call_type=req.call_type,
            status="rejected",
            request_time=get_timestamp(),
            response_time=get_timestamp(),
            reject_reason=reject_reason,
        )
        admissions.append(admission)
        await log_ras_message("ARJ", "outbound", gatekeeper.name, req.caller_alias, {"reason": reject_reason})
        await manager.broadcast("admission_update", admission.model_dump())
        return admission.model_dump()

    if not callee:
        reject_reason = f"Callee not found or offline: {req.callee_alias} (route lookup failed)"
        admission = AdmissionRequest(
            id=generate_id(),
            caller_alias=req.caller_alias,
            callee_alias=req.callee_alias,
            bandwidth=req.bandwidth,
            call_type=req.call_type,
            status="rejected",
            request_time=get_timestamp(),
            response_time=get_timestamp(),
            reject_reason=reject_reason,
        )
        admissions.append(admission)
        await log_ras_message("ARJ", "outbound", gatekeeper.name, req.caller_alias, {"reason": reject_reason})
        await manager.broadcast("admission_update", admission.model_dump())
        return admission.model_dump()

    gk = _compute_gatekeeper()
    if gk.used_bandwidth + req.bandwidth > gk.total_bandwidth:
        reject_reason = f"Insufficient bandwidth: requested={req.bandwidth}, available={gk.total_bandwidth - gk.used_bandwidth}"
        admission = AdmissionRequest(
            id=generate_id(),
            caller_alias=req.caller_alias,
            callee_alias=req.callee_alias,
            bandwidth=req.bandwidth,
            call_type=req.call_type,
            status="rejected",
            request_time=get_timestamp(),
            response_time=get_timestamp(),
            reject_reason=reject_reason,
        )
        admissions.append(admission)
        await log_ras_message("ARJ", "outbound", gatekeeper.name, req.caller_alias, {"reason": reject_reason})
        await manager.broadcast("admission_update", admission.model_dump())
        return admission.model_dump()

    callee_route = _alias_display(callee.aliases)
    admission = AdmissionRequest(
        id=generate_id(),
        caller_alias=req.caller_alias,
        callee_alias=req.callee_alias,
        callee_routed_to=callee_route,
        bandwidth=req.bandwidth,
        call_type=req.call_type,
        status="confirmed",
        request_time=get_timestamp(),
        response_time=get_timestamp(),
    )
    admissions.append(admission)

    await log_ras_message(
        "ACF", "outbound", gatekeeper.name, req.caller_alias,
        {"admission_id": admission.id, "callee_alias": req.callee_alias, "callee_routed_to": callee_route, "callee_signal_address": callee.signaling_address, "callee_signal_port": callee.signaling_port, "bandwidth": req.bandwidth},
    )

    _compute_gatekeeper()
    await manager.broadcast("admission_update", admission.model_dump())
    return admission.model_dump()


@app.post("/api/ras/grq")
async def send_grq(req: GRQRequest):
    await log_ras_message(
        "GRQ", "inbound", req.ras_address, "255.255.255.255",
        {"terminal_alias": req.terminal_alias, "ras_address": req.ras_address},
    )

    gcf_payload = {
        "gatekeeper_name": gatekeeper.name,
        "gatekeeper_id": gatekeeper.id,
        "ras_address": gatekeeper.id,
        "total_bandwidth": gatekeeper.total_bandwidth,
    }
    await log_ras_message(
        "GCF", "outbound", gatekeeper.name, req.ras_address,
        gcf_payload,
    )

    return {"status": "discovered", "gatekeeper": gatekeeper.model_dump(), "gcf_payload": gcf_payload}


@app.get("/api/ras/messages")
async def get_ras_messages():
    return [m.model_dump() for m in reversed(ras_messages[-100:])]


@app.post("/api/gatekeeper/bandwidth")
async def update_bandwidth(req: BandwidthUpdate):
    gatekeeper.total_bandwidth = req.total_bandwidth
    _compute_gatekeeper()
    await manager.broadcast("gatekeeper_update", gatekeeper.model_dump())
    return gatekeeper.model_dump()


@app.post("/api/gatekeeper/irq-config")
async def update_irq_config(req: IRQConfig):
    gatekeeper.irq_interval = req.interval
    gatekeeper.irq_timeout = req.timeout
    await manager.broadcast("gatekeeper_update", gatekeeper.model_dump())
    return gatekeeper.model_dump()


@app.get("/api/terminals/csv")
async def export_terminals_csv():
    csv_rows = ["Terminal ID,H.323 ID,E.164 Number,Signaling Address,Signaling Port,RAS Address,Registration Time,Status,TTL,Last IRR"]
    for t in terminals:
        row = [
            t.id,
            t.aliases.h323_id,
            t.aliases.e164,
            t.signaling_address,
            str(t.signaling_port),
            t.ras_address,
            t.registration_time,
            t.status,
            str(t.time_to_live),
            t.last_irr_time or "",
        ]
        csv_rows.append(",".join(f'"{v}"' for v in row))
    csv_content = "\n".join(csv_rows)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="h323-terminals-{get_timestamp()}.csv"'},
    )


@app.websocket("/ws/ras")
async def websocket_ras(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
