from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from aiortc import RTCSessionDescription
from datetime import datetime, timedelta
import os

from app.database import get_db, AsyncSessionLocal
from app import schemas, crud
from app.stream.stream_manager import get_stream_manager
from app.stream.video_exporter import get_export_manager, init_export_manager

router = APIRouter()


@router.post("/streams", response_model=schemas.StreamResponse)
async def create_stream(stream: schemas.StreamCreate, db: AsyncSession = Depends(get_db)):
    db_stream = await crud.create_stream(db, stream)
    
    manager = get_stream_manager()
    if manager:
        use_gstreamer = os.environ.get("USE_GSTREAMER", "false").lower() == "true"
        success = await manager.add_stream(db_stream.id, db_stream.rtsp_url, use_gstreamer=use_gstreamer)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to start stream")
    
    return db_stream


@router.get("/streams", response_model=List[schemas.StreamResponse])
async def list_streams(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    streams = await crud.get_all_streams(db, skip=skip, limit=limit)
    return streams


@router.get("/streams/{stream_id}", response_model=schemas.StreamResponse)
async def get_stream(stream_id: int, db: AsyncSession = Depends(get_db)):
    stream = await crud.get_stream(db, stream_id)
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    return stream


@router.put("/streams/{stream_id}", response_model=schemas.StreamResponse)
async def update_stream(stream_id: int, stream_update: schemas.StreamUpdate, db: AsyncSession = Depends(get_db)):
    stream = await crud.update_stream(db, stream_id, stream_update)
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    
    manager = get_stream_manager()
    if manager and stream_update.rtsp_url:
        await manager.remove_stream(stream_id)
        use_gstreamer = os.environ.get("USE_GSTREAMER", "false").lower() == "true"
        await manager.add_stream(stream_id, stream.rtsp_url, use_gstreamer=use_gstreamer)
    
    return stream


@router.delete("/streams/{stream_id}")
async def delete_stream(stream_id: int, db: AsyncSession = Depends(get_db)):
    manager = get_stream_manager()
    if manager:
        await manager.remove_stream(stream_id)
    
    stream = await crud.delete_stream(db, stream_id)
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    return {"message": "Stream deleted"}


@router.post("/streams/{stream_id}/start")
async def start_stream(stream_id: int, db: AsyncSession = Depends(get_db)):
    stream = await crud.get_stream(db, stream_id)
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    
    manager = get_stream_manager()
    if not manager:
        raise HTTPException(status_code=500, detail="Stream manager not initialized")
    
    use_gstreamer = os.environ.get("USE_GSTREAMER", "false").lower() == "true"
    success = await manager.add_stream(stream_id, stream.rtsp_url, use_gstreamer=use_gstreamer)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to start stream")
    
    return {"message": "Stream started"}


@router.post("/streams/{stream_id}/stop")
async def stop_stream(stream_id: int):
    manager = get_stream_manager()
    if not manager:
        raise HTTPException(status_code=500, detail="Stream manager not initialized")
    
    success = await manager.remove_stream(stream_id)
    if not success:
        raise HTTPException(status_code=404, detail="Stream not found or not running")
    
    return {"message": "Stream stopped"}


@router.get("/streams/{stream_id}/status")
async def get_stream_status(stream_id: int):
    manager = get_stream_manager()
    if not manager:
        raise HTTPException(status_code=500, detail="Stream manager not initialized")
    
    stream = manager.get_stream(stream_id)
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not running")
    
    return stream.get_status()


@router.post("/streams/{stream_id}/track")
async def init_tracking(stream_id: int, request: schemas.TrackingInitRequest):
    manager = get_stream_manager()
    if not manager:
        raise HTTPException(status_code=500, detail="Stream manager not initialized")
    
    stream = manager.get_stream(stream_id)
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not running")
    
    object_id = stream.init_tracking(
        int(request.x),
        int(request.y),
        int(request.width),
        int(request.height),
        request.label
    )
    
    if not object_id:
        raise HTTPException(status_code=500, detail="Failed to initialize tracking")
    
    return {"object_id": object_id, "message": "Tracking initialized"}


@router.delete("/streams/{stream_id}/track/{object_id}")
async def stop_tracking(stream_id: int, object_id: str):
    manager = get_stream_manager()
    if not manager:
        raise HTTPException(status_code=500, detail="Stream manager not initialized")
    
    stream = manager.get_stream(stream_id)
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not running")
    
    success = stream.stop_tracking(object_id)
    if not success:
        raise HTTPException(status_code=404, detail="Tracker not found")
    
    return {"message": "Tracking stopped"}


@router.get("/streams/{stream_id}/track")
async def get_tracking_boxes(stream_id: int):
    manager = get_stream_manager()
    if not manager:
        raise HTTPException(status_code=500, detail="Stream manager not initialized")
    
    stream = manager.get_stream(stream_id)
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not running")
    
    return {"boxes": stream.get_tracking_boxes()}


@router.get("/streams/{stream_id}/trajectory/{object_id}", response_model=schemas.TrajectoryResponse)
async def get_trajectory(stream_id: int, object_id: str):
    manager = get_stream_manager()
    if not manager:
        raise HTTPException(status_code=500, detail="Stream manager not initialized")
    
    stream = manager.get_stream(stream_id)
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not running")
    
    if not stream.tracker:
        raise HTTPException(status_code=404, detail="Tracker not initialized")
    
    trajectory = stream.tracker.get_trajectory(object_id)
    if trajectory is None:
        raise HTTPException(status_code=404, detail="Object not found")
    
    return {
        "object_id": object_id,
        "label": stream.tracker.tracking_info.get(object_id, {}).get("label", "unknown"),
        "stream_id": stream_id,
        "trajectory": [
            {"x": p[0], "y": p[1], "timestamp": p[2]}
            for p in trajectory
        ]
    }


@router.get("/streams/{stream_id}/trajectory")
async def get_all_trajectories(stream_id: int):
    manager = get_stream_manager()
    if not manager:
        raise HTTPException(status_code=500, detail="Stream manager not initialized")
    
    stream = manager.get_stream(stream_id)
    if not stream or not stream.tracker:
        raise HTTPException(status_code=404, detail="Stream not running")
    
    trajectories = stream.tracker.get_all_trajectories()
    result = {}
    
    for obj_id, traj in trajectories.items():
        result[obj_id] = {
            "label": stream.tracker.tracking_info.get(obj_id, {}).get("label", "unknown"),
            "points": [
                {"x": p[0], "y": p[1], "timestamp": p[2].isoformat()}
                for p in traj
            ]
        }
    
    return {"trajectories": result}


@router.get("/streams/{stream_id}/records", response_model=List[schemas.TrackingRecordResponse])
async def get_tracking_records(
    stream_id: int,
    limit: int = 1000,
    db: AsyncSession = Depends(get_db)
):
    records = await crud.get_tracking_records_by_stream(db, stream_id, limit=limit)
    return records


@router.post("/streams/{stream_id}/webrtc/offer")
async def webrtc_offer(stream_id: int, offer: schemas.WebRTCOffer):
    manager = get_stream_manager()
    if not manager:
        raise HTTPException(status_code=500, detail="Stream manager not initialized")
    
    stream = manager.get_stream(stream_id)
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not running")
    
    rtc_offer = RTCSessionDescription(sdp=offer.sdp, type=offer.type)
    answer = await stream.create_webrtc_offer(rtc_offer)
    
    if not answer:
        raise HTTPException(status_code=500, detail="Failed to create WebRTC answer")
    
    return {"sdp": answer.sdp, "type": answer.type}


@router.post("/streams/{stream_id}/export", response_model=schemas.ExportResponse)
async def export_video(
    stream_id: int,
    request: schemas.ExportRequest,
    background_tasks: BackgroundTasks
):
    export_manager = get_export_manager()
    if not export_manager:
        raise HTTPException(status_code=500, detail="Export manager not initialized")
    
    manager = get_stream_manager()
    if not manager or not manager.has_stream(stream_id):
        raise HTTPException(status_code=404, detail="Stream not running")
    
    if request.duration_seconds:
        end_time = datetime.now()
        start_time = end_time - timedelta(seconds=request.duration_seconds)
    elif request.start_time and request.end_time:
        start_time = request.start_time
        end_time = request.end_time
    else:
        raise HTTPException(status_code=400, detail="Either duration_seconds or both start_time and end_time must be provided")
    
    result = await export_manager.export_stream_clip(
        stream_id=stream_id,
        start_time=start_time,
        end_time=end_time,
        filename=request.filename,
        draw_boxes=request.draw_boxes,
        draw_trajectory=request.draw_trajectory
    )
    
    return result


@router.get("/streams/{stream_id}/export/{export_id}", response_model=schemas.ExportStatusResponse)
async def get_export_status(stream_id: int, export_id: str):
    export_manager = get_export_manager()
    if not export_manager:
        raise HTTPException(status_code=500, detail="Export manager not initialized")
    
    status = export_manager.get_export_status(stream_id, export_id)
    if not status:
        raise HTTPException(status_code=404, detail="Export not found")
    
    return {
        "export_id": export_id,
        **status
    }


@router.get("/streams/{stream_id}/exports")
async def list_exports(stream_id: int):
    export_manager = get_export_manager()
    if not export_manager:
        raise HTTPException(status_code=500, detail="Export manager not initialized")
    
    exports = export_manager.list_stream_exports(stream_id)
    return {"exports": exports}


@router.get("/exports/{stream_id}/{filename}")
async def download_export(stream_id: int, filename: str):
    filepath = f"exports/stream_{stream_id}/{filename}"
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(filepath, media_type="video/mp4", filename=filename)


@router.get("/")
async def root():
    return FileResponse("static/index.html")
