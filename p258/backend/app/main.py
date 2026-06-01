import logging
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .config import settings
from .rbd_manager import RBDManager
from .models import (
    ImageCreate,
    ImageDelete,
    ImageInfo,
    SnapshotCreate,
    SnapshotDelete,
    SnapshotInfo,
    CloneCreate,
    CloneFlatten,
    TreeNode,
    PoolInfo,
    ResponseModel,
    BatchFlattenRequest,
    BatchFlattenResult,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

rbd_manager = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global rbd_manager
    logger.info("Initializing RBD Manager...")
    rbd_manager = RBDManager()
    logger.info("RBD Manager initialized successfully")
    yield
    logger.info("Shutting down...")


app = FastAPI(
    title="Ceph RBD Management API",
    description="API for managing Ceph RBD images, snapshots, and clones",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", response_model=ResponseModel)
async def root():
    return ResponseModel(
        success=True,
        message="Ceph RBD Management API",
        data={"version": "1.0.0", "docs": "/docs"},
    )


@app.get("/api/pools", response_model=ResponseModel)
async def list_pools():
    try:
        pools = rbd_manager.list_pools()
        return ResponseModel(
            success=True,
            message="Pools listed successfully",
            data=pools,
        )
    except Exception as e:
        logger.error(f"Error listing pools: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/pools/detail", response_model=ResponseModel)
async def get_all_pools_with_images():
    try:
        pools = rbd_manager.get_all_pools_with_images()
        return ResponseModel(
            success=True,
            message="Pools with images listed successfully",
            data=[p.model_dump() for p in pools],
        )
    except Exception as e:
        logger.error(f"Error getting pools detail: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/pools/{pool_name}/images", response_model=ResponseModel)
async def list_images(pool_name: str = None):
    try:
        images = rbd_manager.list_images(pool_name)
        return ResponseModel(
            success=True,
            message="Images listed successfully",
            data=images,
        )
    except Exception as e:
        logger.error(f"Error listing images: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/images/{image_name}", response_model=ResponseModel)
async def get_image(image_name: str, pool: str = None):
    try:
        info = rbd_manager.get_image_info(image_name, pool)
        return ResponseModel(
            success=True,
            message="Image info retrieved successfully",
            data=info.model_dump(),
        )
    except Exception as e:
        logger.error(f"Error getting image info: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/images", response_model=ResponseModel)
async def create_image(image: ImageCreate):
    try:
        rbd_manager.create_image(image.name, image.size, image.pool)
        return ResponseModel(
            success=True,
            message=f"Image {image.name} created successfully",
        )
    except Exception as e:
        logger.error(f"Error creating image: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/images", response_model=ResponseModel)
async def delete_image(image: ImageDelete):
    try:
        rbd_manager.delete_image(image.name, image.pool)
        return ResponseModel(
            success=True,
            message=f"Image {image.name} deleted successfully",
        )
    except Exception as e:
        logger.error(f"Error deleting image: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/images/{image_name}/snapshots", response_model=ResponseModel)
async def list_snapshots(image_name: str, pool: str = None):
    try:
        snapshots = rbd_manager.list_snapshots(image_name, pool)
        return ResponseModel(
            success=True,
            message="Snapshots listed successfully",
            data=[s.model_dump() for s in snapshots],
        )
    except Exception as e:
        logger.error(f"Error listing snapshots: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/snapshots", response_model=ResponseModel)
async def create_snapshot(snapshot: SnapshotCreate):
    try:
        rbd_manager.create_snapshot(
            snapshot.image_name, snapshot.snapshot_name, snapshot.pool
        )
        return ResponseModel(
            success=True,
            message=f"Snapshot {snapshot.snapshot_name} created successfully for image {snapshot.image_name}",
        )
    except Exception as e:
        logger.error(f"Error creating snapshot: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/snapshots", response_model=ResponseModel)
async def delete_snapshot(snapshot: SnapshotDelete):
    try:
        rbd_manager.delete_snapshot(
            snapshot.image_name, snapshot.snapshot_name, snapshot.pool
        )
        return ResponseModel(
            success=True,
            message=f"Snapshot {snapshot.snapshot_name} deleted successfully from image {snapshot.image_name}",
        )
    except Exception as e:
        logger.error(f"Error deleting snapshot: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/snapshots/protect", response_model=ResponseModel)
async def protect_snapshot(snapshot: SnapshotDelete):
    try:
        rbd_manager.protect_snapshot(
            snapshot.image_name, snapshot.snapshot_name, snapshot.pool
        )
        return ResponseModel(
            success=True,
            message=f"Snapshot {snapshot.snapshot_name} protected successfully",
        )
    except Exception as e:
        logger.error(f"Error protecting snapshot: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/snapshots/unprotect", response_model=ResponseModel)
async def unprotect_snapshot(snapshot: SnapshotDelete):
    try:
        rbd_manager.unprotect_snapshot(
            snapshot.image_name, snapshot.snapshot_name, snapshot.pool
        )
        return ResponseModel(
            success=True,
            message=f"Snapshot {snapshot.snapshot_name} unprotected successfully",
        )
    except Exception as e:
        logger.error(f"Error unprotecting snapshot: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/clones", response_model=ResponseModel)
async def create_clone(clone: CloneCreate):
    try:
        rbd_manager.create_clone(
            clone.parent_pool,
            clone.parent_image,
            clone.parent_snapshot,
            clone.child_pool,
            clone.child_image,
        )
        return ResponseModel(
            success=True,
            message=f"Clone {clone.child_image} created successfully from {clone.parent_image}@{clone.parent_snapshot}",
        )
    except Exception as e:
        logger.error(f"Error creating clone: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/clones/flatten", response_model=ResponseModel)
async def flatten_clone(clone: CloneFlatten):
    try:
        rbd_manager.flatten_clone(clone.image_name, clone.pool)
        return ResponseModel(
            success=True,
            message=f"Clone {clone.image_name} flattened successfully",
        )
    except Exception as e:
        logger.error(f"Error flattening clone: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/images/{image_name}/snapshot-tree", response_model=ResponseModel)
async def get_snapshot_tree(image_name: str, pool: str = None):
    try:
        tree = rbd_manager.get_snapshot_tree(image_name, pool)
        return ResponseModel(
            success=True,
            message="Snapshot tree retrieved successfully",
            data=tree.model_dump(),
        )
    except Exception as e:
        logger.error(f"Error getting snapshot tree: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/tree", response_model=ResponseModel)
async def get_complete_tree():
    try:
        trees = rbd_manager.get_complete_tree()
        return ResponseModel(
            success=True,
            message="Complete tree retrieved successfully",
            data=[t.model_dump() for t in trees],
        )
    except Exception as e:
        logger.error(f"Error getting complete tree: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/warnings/depth", response_model=ResponseModel)
async def get_depth_warnings():
    try:
        warnings = rbd_manager.get_depth_warnings()
        return ResponseModel(
            success=True,
            message="Depth warnings retrieved successfully",
            data=[w.model_dump() for w in warnings],
        )
    except Exception as e:
        logger.error(f"Error getting depth warnings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/images/{image_name}/clone-chain", response_model=ResponseModel)
async def get_clone_chain_path(image_name: str, pool: str = None):
    try:
        chain = rbd_manager.get_clone_chain_path(image_name, pool)
        return ResponseModel(
            success=True,
            message="Clone chain path retrieved successfully",
            data=chain,
        )
    except Exception as e:
        logger.error(f"Error getting clone chain path: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/clones/batch-flatten", response_model=ResponseModel)
async def batch_flatten(request: BatchFlattenRequest):
    try:
        result = rbd_manager.batch_flatten(request.image_names, request.pool)
        return ResponseModel(
            success=True,
            message="Batch flatten completed",
            data=result.model_dump(),
        )
    except Exception as e:
        logger.error(f"Error in batch flatten: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/clones/flatten-deep", response_model=ResponseModel)
async def flatten_deep_clones(pool: str = None, min_depth: int = 5):
    try:
        result = rbd_manager.flatten_deep_clones(pool, min_depth)
        return ResponseModel(
            success=True,
            message="Flatten deep clones completed",
            data=result.model_dump(),
        )
    except Exception as e:
        logger.error(f"Error flattening deep clones: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/topology/export")
async def export_topology(format: str = "json"):
    try:
        trees = rbd_manager.get_complete_tree()
        topology_data = {
            "export_time": datetime.now().isoformat(),
            "version": "1.0",
            "format": format,
            "statistics": {
                "total_pools": len(set(t.pool for t in trees if hasattr(t, 'pool'))),
                "total_images": 0,
                "total_snapshots": 0,
                "total_clones": 0,
                "max_depth": 0,
                "warnings_count": 0
            },
            "trees": [t.model_dump() for t in trees]
        }

        def count_nodes(nodes):
            for node in nodes:
                if node.type == "image":
                    topology_data["statistics"]["total_images"] += 1
                elif node.type == "snapshot":
                    topology_data["statistics"]["total_snapshots"] += 1
                elif node.type == "clone":
                    topology_data["statistics"]["total_clones"] += 1
                if node.depth > topology_data["statistics"]["max_depth"]:
                    topology_data["statistics"]["max_depth"] = node.depth
                if node.has_warning:
                    topology_data["statistics"]["warnings_count"] += 1
                count_nodes(node.children)

        for tree in trees:
            count_nodes([tree])

        if format == "dot":
            dot_content = generate_dot_format(topology_data)
            return ResponseModel(
                success=True,
                message="Topology exported successfully (DOT format)",
                data={"content": dot_content, "filename": f"rbd_topology_{datetime.now().strftime('%Y%m%d_%H%M%S')}.dot"},
            )

        return ResponseModel(
            success=True,
            message="Topology exported successfully",
            data={"content": topology_data, "filename": f"rbd_topology_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"},
        )
    except Exception as e:
        logger.error(f"Error exporting topology: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def generate_dot_format(topology_data):
    lines = ["digraph RBD_Topology {", "    rankdir=TB;", "    node [shape=box, style=filled, fontname=\"Arial\"];"]

    def add_node(node, parent_id=None):
        node_id = node["id"].replace("-", "_").replace("@", "_")

        if node["type"] == "image":
            color = "#67c23a"
        elif node["type"] == "snapshot":
            color = "#409eff"
        else:
            color = "#e6a23c" if not node.get("has_warning") else "#f56c6c"

        label = f"{node['name']}\\n{node['type']}"
        if node.get("depth"):
            label += f"\\ndepth: {node['depth']}"

        lines.append(f'    {node_id} [label="{label}", fillcolor="{color}"];')

        if parent_id:
            lines.append(f"    {parent_id} -> {node_id};")

        for child in node.get("children", []):
            add_node(child, node_id)

    for tree in topology_data["trees"]:
        add_node(tree)

    lines.append("}")
    return "\n".join(lines)
