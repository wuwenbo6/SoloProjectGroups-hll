import asyncio
import json
import time
from typing import Dict, Any, List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from iscsi.target import ISCSITarget, TargetConfig
from iscsi.types import (
    ErrorRecoveryLevel,
    CommandStatus,
    LogLevel,
    LogDirection,
    CommandRecord,
    CommandEvent,
)


app = FastAPI(title="iSCSI Target Simulator", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

target: Optional[ISCSITarget] = None
log_subscribers: List[WebSocket] = []
stats_subscribers: List[WebSocket] = []


class SetERLRequest(BaseModel):
    level: int


class TriggerFaultRequest(BaseModel):
    duration: float = 5.0


class AutoFaultRequest(BaseModel):
    mode: str = "random_drop"
    probability: float = 0.3


class StartTargetRequest(BaseModel):
    target_iqn: Optional[str] = None
    listen_port: int = 3260


def _ensure_target() -> ISCSITarget:
    global target
    if target is None:
        target = ISCSITarget()
        target.logger.subscribe_callback(_on_log_entry)
    return target


def _on_log_entry(entry) -> None:
    asyncio.get_event_loop().create_task(_broadcast_log(entry))


async def _broadcast_log(entry) -> None:
    if not log_subscribers:
        return
    data = _log_entry_to_dict(entry)
    message = json.dumps(data)
    dead = []
    for ws in log_subscribers:
        try:
            await ws.send_text(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        if ws in log_subscribers:
            log_subscribers.remove(ws)


async def _stats_broadcaster() -> None:
    while True:
        await asyncio.sleep(1.0)
        if not stats_subscribers or target is None:
            continue
        try:
            stats = target.stats_manager.get_statistics()
            status = target.get_status()
            data = {
                "statistics": _stats_to_dict(stats),
                "status": status,
            }
            message = json.dumps(data)
            dead = []
            for ws in stats_subscribers:
                try:
                    await ws.send_text(message)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                if ws in stats_subscribers:
                    stats_subscribers.remove(ws)
        except Exception:
            pass


def _log_entry_to_dict(entry) -> Dict[str, Any]:
    return {
        "id": entry.id,
        "timestamp": entry.timestamp,
        "level": entry.level.value,
        "direction": entry.direction.value,
        "message": entry.message,
        "pduType": entry.pdu_type,
        "connectionId": entry.connection_id,
    }


def _stats_to_dict(stats) -> Dict[str, Any]:
    return {
        "totalCommands": stats.total_commands,
        "successfulCommands": stats.successful_commands,
        "retransmittedCommands": stats.retransmitted_commands,
        "failedCommands": stats.failed_commands,
        "totalRetries": stats.total_retries,
        "activeCommands": stats.active_commands,
        "faultCount": stats.fault_count,
        "recoveryCount": stats.recovery_count,
        "averageRecoveryTime": sum(stats.recovery_times) / len(stats.recovery_times) if stats.recovery_times else 0,
    }


def _command_to_dict(cmd: CommandRecord) -> Dict[str, Any]:
    return {
        "id": cmd.id,
        "cmdSN": cmd.cmd_sn,
        "expStatSN": cmd.exp_stat_sn,
        "opcode": cmd.opcode,
        "status": cmd.status.value,
        "retryCount": cmd.retry_count,
        "createdAt": cmd.created_at,
        "completedAt": cmd.completed_at,
        "events": [
            {
                "type": e.type,
                "timestamp": e.timestamp,
                "connectionId": e.connection_id,
                "reason": e.reason,
            }
            for e in cmd.events
        ],
    }


@app.on_event("startup")
async def startup():
    asyncio.create_task(_stats_broadcaster())


@app.get("/api/status")
async def get_status():
    t = _ensure_target()
    return t.get_status()


@app.get("/api/stats")
async def get_stats():
    t = _ensure_target()
    stats = t.stats_manager.get_statistics()
    return _stats_to_dict(stats)


@app.post("/api/erl")
async def set_erl(req: SetERLRequest):
    t = _ensure_target()
    if t.set_erl_level(req.level):
        return {"success": True, "erlLevel": req.level}
    return {"success": False, "error": "Invalid ERL level"}


@app.post("/api/target/start")
async def start_target(req: StartTargetRequest = None):
    t = _ensure_target()
    if req and req.target_iqn:
        config = TargetConfig(target_iqn=req.target_iqn, listen_port=req.listen_port)
        global target
        t = ISCSITarget(config)
        t.logger.subscribe_callback(_on_log_entry)
        target = t
    result = await t.start()
    return {"success": result, "status": t.get_status()}


@app.post("/api/target/stop")
async def stop_target():
    t = _ensure_target()
    await t.stop()
    return {"success": True}


@app.post("/api/fault")
async def trigger_fault(req: TriggerFaultRequest):
    t = _ensure_target()
    result = await t.trigger_fault(req.duration)
    return {"success": result}


@app.post("/api/fault/auto")
async def set_auto_fault(req: AutoFaultRequest):
    t = _ensure_target()
    result = t.set_auto_fault(req.mode, req.probability)
    return {"success": result}


@app.post("/api/fault/clear")
async def clear_fault():
    t = _ensure_target()
    result = await t.recover_connection()
    return {"success": result}


@app.post("/api/fault/disable")
async def disable_auto_fault():
    t = _ensure_target()
    result = t.disable_auto_fault()
    return {"success": result}


@app.get("/api/commands")
async def get_commands(limit: int = 100):
    t = _ensure_target()
    commands = t.get_command_history(limit)
    return [_command_to_dict(cmd) for cmd in commands]


@app.get("/api/recovery/status")
async def get_recovery_status():
    t = _ensure_target()
    session_id = t._current_session_id
    if session_id:
        return t.recovery_engine.get_recovery_status(session_id)
    return {"exists": False, "is_recovering": False}


@app.websocket("/ws/logs")
async def ws_logs(websocket: WebSocket):
    await websocket.accept()
    log_subscribers.append(websocket)
    t = _ensure_target()
    recent = t.logger.get_recent_logs(time.time() - 60)
    for entry in recent[-50:]:
        try:
            await websocket.send_text(json.dumps(_log_entry_to_dict(entry)))
        except Exception:
            break
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in log_subscribers:
            log_subscribers.remove(websocket)


@app.websocket("/ws/stats")
async def ws_stats(websocket: WebSocket):
    await websocket.accept()
    stats_subscribers.append(websocket)
    t = _ensure_target()
    try:
        stats = t.stats_manager.get_statistics()
        status = t.get_status()
        data = {"statistics": _stats_to_dict(stats), "status": status}
        await websocket.send_text(json.dumps(data))
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in stats_subscribers:
            stats_subscribers.remove(websocket)
