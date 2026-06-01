import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .p4_simulator import VirtualSwitch
from .api.switch import router as switch_router, set_switch
from .api.websocket import router as websocket_router, set_managers_switch

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="P4 Simulator API",
    description="P4可编程交换机模拟器API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

switch = VirtualSwitch("p4-simulator")
set_switch(switch)
set_managers_switch(switch)

switch.start()
switch.add_mirror_rule(1, 5)

logger.info("P4 Simulator initialized and started")

app.include_router(switch_router)
app.include_router(websocket_router)


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "switch_running": switch.status.running,
        "version": "1.0.0"
    }


@app.get("/")
async def root():
    return {
        "name": "P4 Simulator",
        "version": "1.0.0",
        "api_docs": "/docs",
        "endpoints": {
            "switch_status": "/api/switch/status",
            "ports": "/api/switch/ports",
            "mac_table": "/api/switch/mac-table",
            "mirror_rules": "/api/switch/mirror",
            "packets": "/api/switch/packets",
            "websocket_packets": "/ws/packets",
            "websocket_logs": "/ws/logs"
        }
    }
