from __future__ import annotations

import asyncio
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from engine import SimulationEngine, ReplicationMode

app = FastAPI(title="RBD Image Synchronization Simulator")
engine = SimulationEngine()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConfigUpdate(BaseModel):
    blockSize: Optional[int] = None
    imageSize: Optional[int] = None
    imageCount: Optional[int] = None
    baseLatency: Optional[int] = None
    jitterRange: Optional[int] = None
    packetLossRate: Optional[float] = None
    bandwidth: Optional[int] = None
    primaryOsds: Optional[int] = None
    backupOsds: Optional[int] = None
    consistencyInterval: Optional[int] = None
    orphanCleanupInterval: Optional[int] = None
    snapshotInterval: Optional[int] = None
    replicationMode: Optional[str] = None
    conflictResolution: Optional[str] = None
    conflictDetectionInterval: Optional[int] = None
    histogramBucketCount: Optional[int] = None
    histogramMaxLatency: Optional[int] = None


class ConflictResolveRequest(BaseModel):
    conflict_id: str
    winner: Optional[str] = None


class ReplicationModeRequest(BaseModel):
    mode: str


@app.get("/api/status")
async def get_status():
    return engine.get_status()


@app.post("/api/simulate/start")
async def start_simulation():
    await engine.start()
    return {"status": "started", "state": engine.state.value}


@app.post("/api/simulate/stop")
async def stop_simulation():
    await engine.stop()
    return {"status": "stopped", "state": engine.state.value}


@app.post("/api/simulate/pause")
async def pause_simulation():
    await engine.pause()
    return {"status": "paused", "state": engine.state.value}


@app.post("/api/flush-and-switch")
async def flush_and_switch():
    result = await engine.run_flush_and_switch()
    return result


@app.post("/api/orphan/cleanup")
async def orphan_cleanup():
    result = await engine.run_orphan_cleanup()
    return result


@app.get("/api/orphan")
async def get_orphans():
    if not engine.backup_cluster:
        return {"total": 0, "orphans": []}
    orphans = [
        {
            "image_id": o.image_id,
            "block_index": o.block_index,
            "hash": o.hash,
            "reason": o.reason,
        }
        for o in engine.backup_cluster.orphan_objects
    ]
    return {"total": len(orphans), "orphans": orphans}


@app.get("/api/snapshots")
async def get_snapshots(cluster: str = Query("primary", pattern="^(primary|backup)$")):
    target = engine.primary_cluster if cluster == "primary" else engine.backup_cluster
    if not target:
        return {"total": 0, "snapshots": []}
    snapshots = [
        {
            "id": s.id,
            "timestamp": s.timestamp,
            "image_id": s.image_id,
            "image_name": s.image_name,
            "block_count": len(s.block_hashes),
        }
        for s in target.snapshots
    ]
    return {"total": len(snapshots), "snapshots": snapshots}


@app.get("/api/conflicts")
async def get_conflicts(resolved: Optional[bool] = Query(None)):
    conflicts = engine.get_conflicts(resolved=resolved)
    return {"total": len(conflicts), "conflicts": conflicts}


@app.post("/api/conflicts/resolve")
async def resolve_conflict(req: ConflictResolveRequest):
    result = await engine.resolve_conflict(req.conflict_id, req.winner)
    return result


@app.post("/api/replication-mode")
async def set_replication_mode(req: ReplicationModeRequest):
    try:
        mode = ReplicationMode(req.mode)
    except ValueError:
        return {"status": "error", "message": f"Invalid mode: {req.mode}"}
    engine.set_replication_mode(mode)
    return {"status": "success", "mode": mode.value}


@app.get("/api/histogram")
async def get_histogram():
    return engine.get_latency_histogram()


@app.post("/api/histogram/reset")
async def reset_histogram():
    engine.reset_histogram()
    return {"status": "success"}


@app.put("/api/config")
async def update_config(config: ConfigUpdate):
    updates = {k: v for k, v in config.model_dump().items() if v is not None}
    if updates:
        await engine.update_config(updates)
    return {"status": "updated", "config": engine.get_config()}


@app.get("/api/config")
async def get_config():
    return engine.get_config()


@app.post("/api/consistency/check")
async def consistency_check():
    return await engine.run_consistency_check()


@app.get("/api/logs")
async def get_logs(offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200)):
    return engine.get_logs(offset, limit)


async def _ws_sender(websocket: WebSocket, queue: asyncio.Queue):
    try:
        while True:
            message = await queue.get()
            await websocket.send_json(message)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass


async def _ws_receiver(websocket: WebSocket):
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    queue = engine.subscribe()
    sender_task = asyncio.create_task(_ws_sender(websocket, queue))
    receiver_task = asyncio.create_task(_ws_receiver(websocket))
    try:
        done, pending = await asyncio.wait(
            [sender_task, receiver_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        engine.unsubscribe(queue)
