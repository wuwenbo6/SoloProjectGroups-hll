from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.simulator import OAMSimulator
from .api.routes import router as api_router, set_simulator
from .api.websocket import ws_manager, websocket_endpoint

app = FastAPI(title="OAM Simulator API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

simulator = OAMSimulator()
set_simulator(simulator)
ws_manager.set_simulator(simulator)

app.include_router(api_router)
app.add_websocket_route("/ws", websocket_endpoint)


@app.get("/")
async def root():
    return {
        "name": "OAM Simulator API",
        "version": "1.0.0",
        "endpoints": {
            "http": "/api",
            "websocket": "/ws",
            "docs": "/docs",
        },
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}
