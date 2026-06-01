import json
import asyncio
from typing import Any, List, Optional
from fastapi import WebSocket, WebSocketDisconnect
from ..core.simulator import OAMSimulator


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.simulator: Optional[OAMSimulator] = None

    def set_simulator(self, simulator: OAMSimulator):
        self.simulator = simulator
        self.simulator.subscribe_pdu(self._on_pdu)
        self.simulator.subscribe_state(self._on_state)
        self.simulator.event_manager.subscribe(self._on_event)

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

        if self.simulator:
            state = self.simulator.get_state()
            await self._send_to(websocket, "state_update", state)

            events = self.simulator.get_events(limit=50)
            await self._send_to(websocket, "history_events", {"events": events})

            pdus = self.simulator.get_pdus(limit=50)
            await self._send_to(websocket, "history_pdus", {"pdus": pdus})

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message_type: str, payload: Any):
        for connection in self.active_connections:
            await self._send_to(connection, message_type, payload)

    async def _send_to(self, websocket: WebSocket, message_type: str, payload: Any):
        try:
            message = {
                "type": message_type,
                "timestamp": asyncio.get_event_loop().time(),
                "payload": payload,
            }
            await websocket.send_text(json.dumps(message))
        except Exception:
            pass

    def _on_pdu(self, pdu_data: dict[str, Any]):
        asyncio.create_task(self.broadcast("pdu", pdu_data))

    def _on_state(self, state_data: dict[str, Any]):
        asyncio.create_task(self.broadcast("state_update", state_data))

    def _on_event(self, event: Any):
        asyncio.create_task(self.broadcast("event", event.to_dict()))

    async def handle_message(self, websocket: WebSocket, data: str):
        if not self.simulator:
            return

        try:
            message = json.loads(data)
            msg_type = message.get("type")
            payload = message.get("payload", {})

            if msg_type == "start_simulation":
                await self.simulator.start()
            elif msg_type == "stop_simulation":
                await self.simulator.stop()
            elif msg_type == "configure_node":
                node_id = payload.get("node_id")
                name = payload.get("name")
                mac_address = payload.get("mac_address")
                mode = payload.get("mode")
                loopback_mode = payload.get("loopback_mode")
                self.simulator.configure_node(node_id, name, mac_address, mode, loopback_mode)
            elif msg_type == "set_mode":
                node_id = payload.get("node_id", "node-a")
                mode = payload.get("mode")
                self.simulator.configure_node(node_id, mode=mode)
            elif msg_type == "set_loopback_mode":
                node_id = payload.get("node_id", "node-a")
                loopback_mode = payload.get("loopback_mode")
                self.simulator.set_loopback_mode(node_id, loopback_mode)
            elif msg_type == "send_critical_event":
                node_id = payload.get("node_id", "node-a")
                cause = payload.get("cause", "unknown")
                cause_text = payload.get("cause_text", "")
                await self.simulator.send_critical_event(node_id, cause, cause_text)
            elif msg_type == "send_dying_gasp":
                node_id = payload.get("node_id", "node-a")
                cause = payload.get("cause", "unknown")
                cause_text = payload.get("cause_text", "")
                await self.simulator.send_dying_gasp(node_id, cause, cause_text)
            elif msg_type == "trigger_fault":
                fault_type = payload.get("fault_type", "manual")
                description = payload.get("description", "Manual fault injection")
                await self.simulator.trigger_fault(fault_type, description)
            elif msg_type == "clear_fault":
                await self.simulator.clear_fault()
            elif msg_type == "request_state":
                state = self.simulator.get_state()
                await self._send_to(websocket, "state_update", state)

        except json.JSONDecodeError:
            pass
        except Exception as e:
            await self._send_to(websocket, "error", {"message": str(e)})


ws_manager = ConnectionManager()


async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await ws_manager.handle_message(websocket, data)
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
