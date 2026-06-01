import asyncio
import json
import os
from aiohttp import web, WSMsgType
from .config import WS_HOST, WS_PORT, FRONTEND_DIR
from .detector import SeqNumDetector
from .simulator import FixSimulator


class WSServer:
    def __init__(self, detector: SeqNumDetector, simulator: FixSimulator):
        self._detector = detector
        self._simulator = simulator
        self._ws_clients: list[web.WebSocketResponse] = []
        self._app = web.Application()
        self._setup_routes()

    def _setup_routes(self):
        self._app.router.add_get("/ws", self._ws_handler)
        self._app.router.add_get("/", self._index_handler)
        self._app.router.add_get("/api/logs/export", self._export_logs_handler)
        self._app.router.add_get("/api/logs/{session_id}", self._session_logs_handler)
        self._app.router.add_static("/", FRONTEND_DIR)

    async def _index_handler(self, request):
        index_path = os.path.join(FRONTEND_DIR, "index.html")
        return web.FileResponse(index_path)

    async def _export_logs_handler(self, request):
        from datetime import datetime
        sessions = self._detector.get_all_sessions()

        csv_lines = ["timestamp,session_id,msg_type,seq_num,direction,is_attack,checksum_valid,checksum_value"]

        for sid, session in sessions.items():
            for msg in session.messages:
                csv_lines.append(
                    f"{msg.timestamp.isoformat()},"
                    f"{sid},"
                    f"{msg.msg_type},"
                    f"{msg.seq_num},"
                    f"{msg.direction.value},"
                    f"{msg.is_attack},"
                    f"{msg.checksum_valid},"
                    f"{msg.checksum_value}"
                )

        csv_content = "\n".join(csv_lines)
        filename = f"fix_session_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

        return web.Response(
            text=csv_content,
            content_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    async def _session_logs_handler(self, request):
        session_id = request.match_info["session_id"]
        session = self._detector.get_session(session_id)
        if not session:
            return web.json_response({"error": "Session not found"}, status=404)

        return web.json_response({
            "session_id": session_id,
            "messages": [
                {
                    "timestamp": m.timestamp.isoformat(),
                    "msg_type": m.msg_type,
                    "seq_num": m.seq_num,
                    "direction": m.direction.value,
                    "is_attack": m.is_attack,
                    "checksum_valid": m.checksum_valid,
                    "checksum_value": m.checksum_value,
                }
                for m in session.messages[-200:]
            ],
        })

    async def _ws_handler(self, request):
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        self._ws_clients.append(ws)

        await self._send_full_state(ws)

        try:
            async for msg in ws:
                if msg.type == WSMsgType.TEXT:
                    await self._handle_command(ws, msg.data)
                elif msg.type == WSMsgType.ERROR:
                    break
        finally:
            self._ws_clients.remove(ws)

        return ws

    async def _handle_command(self, ws, data: str):
        try:
            cmd = json.loads(data)
        except json.JSONDecodeError:
            return

        action = cmd.get("action")

        if action == "inject_attack_seqnum_reset":
            session_id = cmd.get("session_id")
            if session_id:
                await self._simulator.inject_attack_seqnum_reset(session_id)
                await self._broadcast_state()

        elif action == "inject_attack_checksum_tamper":
            session_id = cmd.get("session_id")
            if session_id:
                await self._simulator.inject_attack_checksum_tamper(session_id)
                await self._broadcast_state()

        elif action == "inject_attack_log_gap":
            session_id = cmd.get("session_id")
            gap = cmd.get("gap_seconds", 8)
            if session_id:
                await self._simulator.inject_attack_log_gap(session_id, gap)
                await self._broadcast_state()

        elif action == "inject_normal_gap":
            session_id = cmd.get("session_id")
            gap = cmd.get("gap_seconds", 3)
            if session_id:
                await self._simulator.inject_normal_gap(session_id, gap)

        elif action == "add_session":
            session_id = cmd.get("session_id")
            sender = cmd.get("sender", "SIMSENDER")
            target = cmd.get("target", "SIMTARGET")
            if session_id:
                self._simulator.add_session(session_id, sender, target)
                await self._broadcast_state()

        elif action == "get_state":
            await self._send_full_state(ws)

    async def _send_full_state(self, ws):
        data = self._build_state_payload()
        try:
            await ws.send_str(json.dumps(data))
        except Exception:
            pass

    async def _broadcast_state(self):
        data = self._build_state_payload()
        closed = []
        for ws in self._ws_clients:
            try:
                await ws.send_str(json.dumps(data))
            except Exception:
                closed.append(ws)
        for ws in closed:
            if ws in self._ws_clients:
                self._ws_clients.remove(ws)

    def _build_state_payload(self) -> dict:
        sessions = self._detector.get_all_sessions()
        return {
            "type": "state_update",
            "sessions": {sid: s.to_dict() for sid, s in sessions.items()},
            "timestamp": __import__("datetime").datetime.now().isoformat(),
        }

    async def broadcast_message(self, session_id: str, message):
        data = {
            "type": "message",
            "session_id": session_id,
            "message": message.to_dict() if hasattr(message, "to_dict") else message,
        }
        for ws in list(self._ws_clients):
            try:
                await ws.send_str(json.dumps(data))
            except Exception:
                pass

    async def broadcast_alert(self, session_id: str, alert):
        data = {
            "type": "alert",
            "session_id": session_id,
            "alert": alert.to_dict() if hasattr(alert, "to_dict") else alert,
        }
        for ws in list(self._ws_clients):
            try:
                await ws.send_str(json.dumps(data))
            except Exception:
                pass

    async def broadcast_logout(self, session_id: str, logout_msg):
        data = {
            "type": "logout_sent",
            "session_id": session_id,
            "message": logout_msg.to_dict() if hasattr(logout_msg, "to_dict") else logout_msg,
        }
        for ws in list(self._ws_clients):
            try:
                await ws.send_str(json.dumps(data))
            except Exception:
                pass

    async def broadcast_resend_request(self, session_id: str, resend_msg):
        data = {
            "type": "resend_request_sent",
            "session_id": session_id,
            "message": resend_msg.to_dict() if hasattr(resend_msg, "to_dict") else resend_msg,
        }
        for ws in list(self._ws_clients):
            try:
                await ws.send_str(json.dumps(data))
            except Exception:
                pass

    def run(self):
        web.run_app(self._app, host=WS_HOST, port=WS_PORT)

    async def start_async(self):
        runner = web.AppRunner(self._app)
        await runner.setup()
        site = web.TCPSite(runner, WS_HOST, WS_PORT)
        await site.start()
        return runner
