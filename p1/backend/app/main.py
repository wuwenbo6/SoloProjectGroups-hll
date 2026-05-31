from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json

from app.api import tanks, sensor, trends, calibration, prediction
from app.services.tank_service import get_tank_service

app = FastAPI(
    title="液位监测系统 API",
    description="超声波液位监测系统后端API，支持多储罐管理、温度补偿计算、历史趋势查询、异常报警、传感器校准和液位预测",
    version="1.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tanks.router)
app.include_router(sensor.router)
app.include_router(trends.router)
app.include_router(calibration.router)
app.include_router(prediction.router)


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass


manager = ConnectionManager()


@app.websocket("/ws/realtime")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            tank_service = get_tank_service()
            tanks = tank_service.get_all_tanks()
            
            tank_statuses = []
            for tank in tanks:
                tank_statuses.append({
                    "id": tank.id,
                    "name": tank.name,
                    "level": tank.current_level,
                    "temperature": tank.current_temperature,
                    "status": tank.status.value if tank.status else None,
                    "last_update": tank.last_update.isoformat() if tank.last_update else None,
                    "max_height": tank.max_height
                })
            
            await manager.broadcast({
                "type": "tank_status",
                "data": tank_statuses
            })
            
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.get("/")
async def root():
    return {
        "message": "液位监测系统 API",
        "version": "1.0.0",
        "docs": "/docs",
        "redoc": "/redoc"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
