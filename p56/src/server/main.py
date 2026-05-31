import asyncio
import json
import csv
import io
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
import uvicorn
from typing import Dict, List, Optional
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dds_nodes.vehicle_node import DDSPublisher, DiagnosticLog
from dds_nodes.fusion_node import ConflictResolver
from database.event_logger import EventLogger
from ros2_bridge.dds_ros2_bridge import DDSROS2Bridge

app = FastAPI()

class SimulationManager:
    def __init__(self):
        self.vehicles: Dict[str, DDSPublisher] = {}
        self.fusion = ConflictResolver()
        self.logger = EventLogger()
        self.ros2_bridge = DDSROS2Bridge()
        self.connected_clients: List[WebSocket] = []
        self._initialized = False
        self._heartbeat_history: Dict[str, float] = {}
        self._central_heartbeat_interval = 2.0
        self._simulate_failure_mode = False
        self.system_logs: List[dict] = []

    async def initialize(self, num_vehicles: int = 5):
        if self._initialized:
            return
        
        for i in range(num_vehicles):
            vehicle_id = f"vehicle_{i:03d}"
            vehicle = DDSPublisher(vehicle_id, priority=i)
            
            vehicle.add_state_callback(self._on_vehicle_state)
            vehicle.add_path_callback(self._on_vehicle_path)
            vehicle.add_heartbeat_callback(self._on_heartbeat)
            vehicle.add_replan_callback(self._on_replan)
            
            self.vehicles[vehicle_id] = vehicle
        
        self.fusion.add_conflict_callback(self._on_conflict_alert)
        self.fusion.add_resolution_callback(self._on_conflict_resolution)
        self.fusion.add_state_cache_callback(self._on_state_cache_broadcast)
        
        self.log_system_event('system', 'info', f'仿真系统初始化完成，{num_vehicles}辆车', {})
        self._initialized = True

    async def _on_vehicle_state(self, state: dict):
        self.fusion.update_vehicle_state(state)
        self.logger.log_vehicle_state(state)
        await self.ros2_bridge.publish_from_dds('vehicle_state', state)
        await self._broadcast({'type': 'vehicle_state', 'data': state})
        
        for vid, vehicle in self.vehicles.items():
            if vid != state['vehicle_id']:
                vehicle.receive_peer_state(state)

    async def _on_vehicle_path(self, path: dict):
        self.fusion.update_vehicle_path(path)
        self.logger.log_vehicle_path(path)
        await self.ros2_bridge.publish_from_dds('vehicle_path', path)
        await self._broadcast({'type': 'vehicle_path', 'data': path})
        
        for vid, vehicle in self.vehicles.items():
            if vid != path['vehicle_id']:
                vehicle.receive_peer_path(path)

    async def _on_heartbeat(self, heartbeat: dict):
        vehicle_id = heartbeat['vehicle_id']
        self._heartbeat_history[vehicle_id] = heartbeat['timestamp']
        
        if heartbeat.get('request_snapshot'):
            await self.fusion.broadcast_state_cache(vehicle_id)
        
        for vid, vehicle in self.vehicles.items():
            if vid != vehicle_id:
                vehicle.receive_heartbeat(heartbeat)

    async def _on_state_cache_broadcast(self, state: dict):
        await self._broadcast({'type': 'vehicle_state', 'data': state})

    async def _on_conflict_alert(self, conflict: dict):
        self.logger.log_conflict_alert(conflict)
        await self._broadcast({'type': 'conflict_alert', 'data': conflict})

    async def _on_conflict_resolution(self, resolution: dict):
        self.logger.log_conflict_resolution(resolution)
        
        conflict_id = resolution['conflict_id']
        for action in resolution['actions']:
            vehicle_id = action['vehicle_id']
            if vehicle_id in self.vehicles:
                self.vehicles[vehicle_id].apply_resolution_action(action, conflict_id)
        
        await self._broadcast({'type': 'conflict_resolution', 'data': resolution})

    async def _on_replan(self, path: dict):
        self.log_system_event('replan', 'info', 
            f"{path['vehicle_id']} 重规划路径", 
            {'reason': path.get('replan_reason'), 'is_local': path.get('is_local_replan')})
        await self._broadcast({'type': 'path_replan', 'data': path})

    def log_system_event(self, event_type: str, level: str, message: str, data: dict = None):
        log = {
            'timestamp': datetime.now().timestamp(),
            'source': 'system',
            'event_type': event_type,
            'level': level,
            'message': message,
            'data': data or {}
        }
        self.system_logs.append(log)
        if len(self.system_logs) > 2000:
            self.system_logs.pop(0)

    async def send_central_heartbeat(self):
        while True:
            if not self._simulate_failure_mode:
                for vehicle in self.vehicles.values():
                    vehicle.receive_central_heartbeat()
            await asyncio.sleep(self._central_heartbeat_interval)

    def simulate_communication_failure(self, enable: bool):
        self._simulate_failure_mode = enable
        self.log_system_event('simulation', 'warning' if enable else 'info',
            f"通信故障模拟 {'启动' if enable else '关闭'}", {})

    async def trigger_vehicle_replan(self, vehicle_id: str, reason: str = 'manual'):
        if vehicle_id in self.vehicles:
            await self.vehicles[vehicle_id].trigger_replan(reason)

    def collect_all_diagnostic_logs(self, min_level: str = None) -> List[dict]:
        all_logs = []
        
        all_logs.extend(self.system_logs)
        
        for vehicle_id, vehicle in self.vehicles.items():
            vehicle_logs = vehicle.get_diagnostic_logs(min_level)
            all_logs.extend(vehicle_logs)
        
        all_logs.sort(key=lambda x: x['timestamp'])
        return all_logs

    def export_logs_csv(self) -> str:
        logs = self.collect_all_diagnostic_logs()
        output = io.StringIO()
        writer = csv.writer(output)
        
        writer.writerow(['Timestamp', 'Time', 'Source', 'Vehicle ID', 'Event Type', 'Level', 'Message', 'Data'])
        
        for log in logs:
            timestamp = log.get('timestamp', 0)
            time_str = datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
            source = log.get('source', 'vehicle')
            vehicle_id = log.get('vehicle_id', 'system')
            event_type = log.get('event_type', 'unknown')
            level = log.get('level', 'info')
            message = log.get('message', '')
            data = json.dumps(log.get('data', {}), ensure_ascii=False)
            
            writer.writerow([timestamp, time_str, source, vehicle_id, event_type, level, message, data])
        
        return output.getvalue()

    def export_logs_json(self) -> dict:
        return {
            'export_time': datetime.now().isoformat(),
            'total_logs': len(self.collect_all_diagnostic_logs()),
            'logs': self.collect_all_diagnostic_logs()
        }

    async def _broadcast(self, message: dict):
        disconnected = []
        for ws in self.connected_clients:
            try:
                await ws.send_json(message)
            except:
                disconnected.append(ws)
        
        for ws in disconnected:
            if ws in self.connected_clients:
                self.connected_clients.remove(ws)

    async def add_client(self, ws: WebSocket):
        self.connected_clients.append(ws)
        
        state_snapshot = {
            'type': 'initial_state',
            'data': {
                'vehicles': list(self.vehicles.keys()),
                'statistics': self.logger.get_statistics()
            }
        }
        await ws.send_json(state_snapshot)

    async def remove_client(self, ws: WebSocket):
        if ws in self.connected_clients:
            self.connected_clients.remove(ws)

    async def run(self):
        tasks = []
        for vehicle in self.vehicles.values():
            tasks.append(asyncio.create_task(vehicle.run()))
        tasks.append(asyncio.create_task(self.fusion.run_detection()))
        tasks.append(asyncio.create_task(self.send_central_heartbeat()))
        await asyncio.gather(*tasks)

sim_manager = SimulationManager()

@app.on_event("startup")
async def startup_event():
    await sim_manager.initialize(num_vehicles=6)
    asyncio.create_task(sim_manager.run())

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    await sim_manager.add_client(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            if message.get('action') == 'toggle_ros2_bridge':
                if sim_manager.ros2_bridge.enabled:
                    sim_manager.ros2_bridge.disable()
                else:
                    sim_manager.ros2_bridge.enable()
                await websocket.send_json({
                    'type': 'ros2_bridge_status',
                    'data': {'enabled': sim_manager.ros2_bridge.enabled}
                })
            elif message.get('action') == 'get_statistics':
                stats = sim_manager.logger.get_statistics()
                await websocket.send_json({'type': 'statistics', 'data': stats})
            elif message.get('action') == 'simulate_failure':
                enable = message.get('enable', False)
                sim_manager.simulate_communication_failure(enable)
                await websocket.send_json({
                    'type': 'failure_mode',
                    'data': {'enabled': enable}
                })
            elif message.get('action') == 'trigger_replan':
                vehicle_id = message.get('vehicle_id')
                reason = message.get('reason', 'manual')
                await sim_manager.trigger_vehicle_replan(vehicle_id, reason)
            elif message.get('action') == 'get_diagnostics':
                logs = sim_manager.collect_all_diagnostic_logs(message.get('min_level'))
                await websocket.send_json({'type': 'diagnostic_logs', 'data': logs})
    except WebSocketDisconnect:
        await sim_manager.remove_client(websocket)

@app.get("/api/statistics")
async def get_statistics():
    return sim_manager.logger.get_statistics()

@app.get("/api/conflicts")
async def get_conflicts(severity: str = None):
    return sim_manager.logger.get_conflicts(severity=severity)

@app.get("/api/diagnostics")
async def get_diagnostics(min_level: str = None):
    return sim_manager.collect_all_diagnostic_logs(min_level)

@app.get("/api/export/csv")
async def export_logs_csv():
    csv_content = sim_manager.export_logs_csv()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=diagnostic_logs_{timestamp}.csv"}
    )

@app.get("/api/export/json")
async def export_logs_json():
    return JSONResponse(sim_manager.export_logs_json())

@app.get("/api/vehicle/status")
async def get_vehicle_status():
    statuses = []
    for vehicle_id, vehicle in sim_manager.vehicles.items():
        statuses.append(vehicle.get_status())
    return statuses

@app.post("/api/vehicle/{vehicle_id}/replan")
async def trigger_replan(vehicle_id: str, reason: str = "api_trigger"):
    await sim_manager.trigger_vehicle_replan(vehicle_id, reason)
    return {"status": "ok", "vehicle_id": vehicle_id, "reason": reason}

@app.post("/api/simulate/failure")
async def simulate_failure(enable: bool):
    sim_manager.simulate_communication_failure(enable)
    return {"status": "ok", "failure_mode": enable}

@app.get("/")
async def get_index():
    return FileResponse("frontend/index.html")

app.mount("/static", StaticFiles(directory="frontend"), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
