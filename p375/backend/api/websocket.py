from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, List, Any
import json
import logging
import asyncio

from ..p4_simulator import VirtualSwitch

router = APIRouter()
logger = logging.getLogger(__name__)


class BaseWebSocketManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected: {len(self.active_connections)} active")

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected: {len(self.active_connections)} active")

    async def broadcast(self, message: Dict[str, Any]) -> None:
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error sending WebSocket message: {e}")
                try:
                    await connection.close()
                except:
                    pass
                if connection in self.active_connections:
                    self.active_connections.remove(connection)


class PacketWebSocketManager(BaseWebSocketManager):
    def __init__(self):
        super().__init__()
        self.switch: VirtualSwitch = None

    def set_switch(self, switch: VirtualSwitch) -> None:
        self.switch = switch
        switch.on_packet(self._on_packet)

    def _on_packet(self, packet: Dict[str, Any]) -> None:
        asyncio.create_task(self.broadcast({
            'type': 'packet',
            'data': packet
        }))


class LogWebSocketManager(BaseWebSocketManager):
    def __init__(self):
        super().__init__()
        self.switch: VirtualSwitch = None

    def set_switch(self, switch: VirtualSwitch) -> None:
        self.switch = switch
        switch.on_log(self._on_log)
        switch.on_mac_update(self._on_mac_update)
        switch.on_port_update(self._on_port_update)
        switch.on_status(self._on_status)

    def _on_log(self, log: Dict[str, Any]) -> None:
        asyncio.create_task(self.broadcast({
            'type': 'log',
            'data': log
        }))

    def _on_mac_update(self, entry: Dict[str, Any]) -> None:
        asyncio.create_task(self.broadcast({
            'type': 'mac_update',
            'data': entry
        }))

    def _on_port_update(self, port: Dict[str, Any]) -> None:
        asyncio.create_task(self.broadcast({
            'type': 'port_update',
            'data': port
        }))

    def _on_status(self, status: Dict[str, Any]) -> None:
        asyncio.create_task(self.broadcast({
            'type': 'status',
            'data': status
        }))


packet_manager = PacketWebSocketManager()
log_manager = LogWebSocketManager()


def set_managers_switch(switch: VirtualSwitch) -> None:
    packet_manager.set_switch(switch)
    log_manager.set_switch(switch)


@router.websocket("/ws/packets")
async def websocket_packets(websocket: WebSocket):
    await packet_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get('type') == 'ping':
                    await websocket.send_json({'type': 'pong', 'timestamp': msg.get('timestamp')})
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        packet_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket packets error: {e}")
        packet_manager.disconnect(websocket)


@router.websocket("/ws/logs")
async def websocket_logs(websocket: WebSocket):
    await log_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get('type') == 'ping':
                    await websocket.send_json({'type': 'pong', 'timestamp': msg.get('timestamp')})
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        log_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket logs error: {e}")
        log_manager.disconnect(websocket)
