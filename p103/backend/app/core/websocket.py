import socketio
from typing import Dict, Set
import json

from app.core.config import settings

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=settings.SOCKETIO_CORS_ORIGINS,
    logger=settings.DEBUG,
    engineio_logger=settings.DEBUG
)

connected_clients: Set[str] = set()


@sio.event
async def connect(sid, environ):
    print(f"客户端连接: {sid}")
    connected_clients.add(sid)


@sio.event
async def disconnect(sid):
    print(f"客户端断开: {sid}")
    connected_clients.discard(sid)


def _get_fuzzer_manager():
    from app.services import get_fuzzer_manager
    return get_fuzzer_manager()


@sio.event
async def test_control(sid, data):
    task_id = data.get("task_id")
    action = data.get("action")
    
    if not task_id or not action:
        await sio.emit("error", {"message": "缺少参数错误"}, room=sid)
        return
    
    fuzzer_manager = _get_fuzzer_manager()
    fuzzer = fuzzer_manager.get_fuzzer(task_id)
    if not fuzzer:
        await sio.emit("error", {"message": "测试任务不存在"}, room=sid)
        return
    
    def ws_callback(event: str, event_data: Dict):
        sio.start_background_task(
            sio.emit,
            event,
            {"task_id": task_id, **event_data},
            room=sid
        )
    
    fuzzer.set_callback(ws_callback)
    
    if action == "start":
        fuzzer.start()
    elif action == "pause":
        fuzzer.pause()
    elif action == "resume":
        fuzzer.resume()
    elif action == "stop":
        fuzzer.stop()
    
    await sio.emit("test:status", {
        "task_id": task_id,
        "status": fuzzer.status.value
    }, room=sid)


@sio.event
async def test_status(sid, data):
    task_id = data.get("task_id")
    if not task_id:
        return
    
    fuzzer_manager = _get_fuzzer_manager()
    fuzzer = fuzzer_manager.get_fuzzer(task_id)
    if fuzzer:
        await sio.emit("test:status", fuzzer.get_status(), room=sid)


@sio.event
async def subscribe_task(sid, data):
    task_id = data.get("task_id")
    if not task_id:
        return
    
    fuzzer_manager = _get_fuzzer_manager()
    fuzzer = fuzzer_manager.get_fuzzer(task_id)
    if fuzzer:
        def ws_callback(event: str, event_data: Dict):
            sio.start_background_task(
                sio.emit,
                event,
                {"task_id": task_id, **event_data},
                room=sid
            )
        fuzzer.set_callback(ws_callback)
        await sio.emit("test:status", fuzzer.get_status(), room=sid)


socketio_app = socketio.ASGIApp(sio)
