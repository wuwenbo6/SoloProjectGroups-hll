from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from models import (
    JoinRequest, PruneRequest, RegisterRequest,
    SwitchSPTRequest, PresetType, RPFCheckRequest,
)
from topology import TopologyManager
from simulator import PIMSimulator

app = FastAPI(title="PIM-SM Simulator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

topology_mgr = TopologyManager()
simulator = PIMSimulator(topology_mgr)


@app.on_event("startup")
async def startup():
    await simulator.load_preset(PresetType.BASIC_RPT)


@app.get("/api/topology")
async def get_topology():
    return topology_mgr.to_dict()


@app.post("/api/topology/preset")
async def load_preset(body: dict):
    preset_name = body.get("preset", "BASIC_RPT")
    preset_type = PresetType(preset_name)
    await simulator.load_preset(preset_type)
    return topology_mgr.to_dict()


@app.put("/api/topology/nodes/{node_id}")
async def update_node_position(node_id: str, body: dict):
    router = topology_mgr.get_router(node_id)
    if not router:
        return {"error": f"Router {node_id} not found"}
    if "x" in body:
        router.x = body["x"]
    if "y" in body:
        router.y = body["y"]
    return router.model_dump()


@app.post("/api/pim/join")
async def process_join(request: JoinRequest):
    events = await simulator.process_join(request)
    return {"events": [e.model_dump() for e in events]}


@app.post("/api/pim/prune")
async def process_prune(request: PruneRequest):
    events = await simulator.process_prune(request)
    return {"events": [e.model_dump() for e in events]}


@app.post("/api/pim/switch-spt")
async def switch_spt(request: SwitchSPTRequest):
    events = await simulator.switch_to_spt(request)
    return {"events": [e.model_dump() for e in events]}


@app.post("/api/pim/register")
async def process_register(request: RegisterRequest):
    events = await simulator.process_register(request)
    return {"events": [e.model_dump() for e in events]}


@app.post("/api/pim/rpf-check")
async def rpf_check(request: RPFCheckRequest):
    result = simulator.perform_rpf_check(request)
    return result.model_dump()


@app.get("/api/routers/{router_id}/mroute")
async def get_mroute(router_id: str):
    entries = simulator.get_mroute_table(router_id)
    return {"router_id": router_id, "entries": [e.model_dump() for e in entries]}


@app.get("/api/routers/{router_id}/unicast-routes")
async def get_unicast_routes(router_id: str):
    entries = simulator.get_unicast_routes(router_id)
    return {"router_id": router_id, "entries": [e.model_dump() for e in entries]}


@app.get("/api/routers/{router_id}/state")
async def get_router_state(router_id: str):
    router = topology_mgr.get_router(router_id)
    if not router:
        return {"error": f"Router {router_id} not found"}
    mroute_entries = simulator.get_mroute_table(router_id)
    unicast_entries = simulator.get_unicast_routes(router_id)
    neighbors = topology_mgr.get_neighbors(router_id)
    return {
        "router": router.model_dump(),
        "mroute_entries": [e.model_dump() for e in mroute_entries],
        "unicast_entries": [e.model_dump() for e in unicast_entries],
        "neighbors": [
            {"router_id": n_id, "interface_id": if_id, "remote_interface_id": rif_id}
            for n_id, if_id, rif_id in neighbors
        ],
    }


@app.get("/api/groups")
async def get_groups():
    return {
        "groups": [
            {
                **g.model_dump(),
                "traffic_path": simulator.get_traffic_path(g.group_addr),
            }
            for g in simulator.groups.values()
        ]
    }


@app.get("/api/events")
async def get_events():
    recent = simulator.events[-50:]
    return {"events": [e.model_dump() for e in recent]}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    simulator.add_ws_client(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        simulator.remove_ws_client(ws)
