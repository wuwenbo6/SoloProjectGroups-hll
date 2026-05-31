import uuid
from typing import List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.api.deps import get_video_manager_instance
from backend.app.schemas import (
    WatchlistCreate, WatchlistUpdate, WatchlistResponse,
    AlertResponse,
    VideoStreamCreate, VideoStreamUpdate, VideoStreamResponse,
    SpeedConfigUpdate, SpeedConfigResponse,
    VehicleTrackResponse, StreamManagerStatus
)
from backend.database import get_db, Watchlist, AlertRecord, VideoStream, SpeedConfig


router = APIRouter()


@router.get("/status", response_model=StreamManagerStatus)
async def get_stream_manager_status(
    video_manager = Depends(get_video_manager_instance)
):
    return video_manager.get_all_status()


@router.get("/streams", response_model=List[VideoStreamResponse])
async def get_video_streams(
    db: Session = Depends(get_db)
):
    streams = db.query(VideoStream).order_by(VideoStream.created_at.desc()).all()
    return streams


@router.post("/streams", response_model=VideoStreamResponse)
async def create_video_stream(
    stream_data: VideoStreamCreate,
    db: Session = Depends(get_db),
    video_manager = Depends(get_video_manager_instance)
):
    existing = db.query(VideoStream).filter(VideoStream.stream_id == stream_data.stream_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Stream ID already exists")
    
    stream = VideoStream(
        stream_id=stream_data.stream_id,
        name=stream_data.name,
        rtsp_url=stream_data.rtsp_url,
        speed_limit=stream_data.speed_limit
    )
    db.add(stream)
    db.commit()
    db.refresh(stream)
    
    if stream.is_active:
        watchlist = db.query(Watchlist.plate_number).filter(Watchlist.is_active == True).all()
        watchlist_plates = [w[0] for w in watchlist]
        video_manager.add_stream(
            stream_id=stream_data.stream_id,
            rtsp_url=stream_data.rtsp_url,
            watchlist=watchlist_plates,
            speed_limit=stream_data.speed_limit
        )
    
    return stream


@router.put("/streams/{stream_id}", response_model=VideoStreamResponse)
async def update_video_stream(
    stream_id: str,
    stream_data: VideoStreamUpdate,
    db: Session = Depends(get_db),
    video_manager = Depends(get_video_manager_instance)
):
    stream = db.query(VideoStream).filter(VideoStream.stream_id == stream_id).first()
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    
    if stream_data.name is not None:
        stream.name = stream_data.name
    if stream_data.rtsp_url is not None:
        stream.rtsp_url = stream_data.rtsp_url
    if stream_data.speed_limit is not None:
        stream.speed_limit = stream_data.speed_limit
    if stream_data.is_active is not None:
        stream.is_active = stream_data.is_active
        
        if stream.is_active and stream_id not in video_manager.streams:
            watchlist = db.query(Watchlist.plate_number).filter(Watchlist.is_active == True).all()
            watchlist_plates = [w[0] for w in watchlist]
            video_manager.add_stream(
                stream_id=stream_id,
                rtsp_url=stream.rtsp_url,
                watchlist=watchlist_plates,
                speed_limit=stream.speed_limit
            )
        elif not stream.is_active and stream_id in video_manager.streams:
            video_manager.remove_stream(stream_id)
    
    db.commit()
    db.refresh(stream)
    return stream


@router.delete("/streams/{stream_id}")
async def delete_video_stream(
    stream_id: str,
    db: Session = Depends(get_db),
    video_manager = Depends(get_video_manager_instance)
):
    stream = db.query(VideoStream).filter(VideoStream.stream_id == stream_id).first()
    if not stream:
        raise HTTPException(status_code=404, detail="Stream not found")
    
    if stream_id in video_manager.streams:
        video_manager.remove_stream(stream_id)
    
    db.delete(stream)
    db.commit()
    
    return {"success": True, "message": "Stream deleted successfully"}


@router.get("/streams/{stream_id}/tracks", response_model=List[VehicleTrackResponse])
async def get_stream_tracks(
    stream_id: str,
    video_manager = Depends(get_video_manager_instance)
):
    if stream_id not in video_manager.streams:
        raise HTTPException(status_code=404, detail="Stream not found or not running")
    
    return video_manager.streams[stream_id].get_active_tracks()


@router.get("/streams/{stream_id}/alerts", response_model=List[dict])
async def get_stream_alerts(
    stream_id: str,
    limit: int = 20,
    video_manager = Depends(get_video_manager_instance)
):
    if stream_id not in video_manager.streams:
        raise HTTPException(status_code=404, detail="Stream not found or not running")
    
    return video_manager.streams[stream_id].get_recent_alerts(limit=limit)


@router.get("/watchlist", response_model=List[WatchlistResponse])
async def get_watchlist(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    watchlist = db.query(Watchlist).order_by(Watchlist.created_at.desc()).offset(skip).limit(limit).all()
    return watchlist


@router.post("/watchlist", response_model=WatchlistResponse)
async def add_to_watchlist(
    item_data: WatchlistCreate,
    db: Session = Depends(get_db),
    video_manager = Depends(get_video_manager_instance)
):
    existing = db.query(Watchlist).filter(Watchlist.plate_number == item_data.plate_number).first()
    if existing:
        raise HTTPException(status_code=400, detail="Plate number already in watchlist")
    
    item = Watchlist(
        plate_number=item_data.plate_number,
        description=item_data.description,
        alert_type=item_data.alert_type
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    
    video_manager.add_to_watchlist(item_data.plate_number)
    
    return item


@router.put("/watchlist/{plate_id}", response_model=WatchlistResponse)
async def update_watchlist_item(
    plate_id: int,
    item_data: WatchlistUpdate,
    db: Session = Depends(get_db),
    video_manager = Depends(get_video_manager_instance)
):
    item = db.query(Watchlist).filter(Watchlist.id == plate_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")
    
    if item_data.description is not None:
        item.description = item_data.description
    if item_data.alert_type is not None:
        item.alert_type = item_data.alert_type
    if item_data.is_active is not None:
        item.is_active = item_data.is_active
        
        if item.is_active:
            video_manager.add_to_watchlist(item.plate_number)
        else:
            video_manager.remove_from_watchlist(item.plate_number)
    
    db.commit()
    db.refresh(item)
    return item


@router.delete("/watchlist/{plate_id}")
async def remove_from_watchlist(
    plate_id: int,
    db: Session = Depends(get_db),
    video_manager = Depends(get_video_manager_instance)
):
    item = db.query(Watchlist).filter(Watchlist.id == plate_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")
    
    video_manager.remove_from_watchlist(item.plate_number)
    
    db.delete(item)
    db.commit()
    
    return {"success": True, "message": "Item removed from watchlist"}


@router.get("/alerts", response_model=List[AlertResponse])
async def get_alerts(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    alerts = db.query(AlertRecord).order_by(AlertRecord.created_at.desc()).offset(skip).limit(limit).all()
    return alerts


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: int,
    db: Session = Depends(get_db)
):
    alert = db.query(AlertRecord).filter(AlertRecord.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    alert.is_acknowledged = True
    alert.acknowledged_at = datetime.utcnow()
    db.commit()
    db.refresh(alert)
    
    return {"success": True, "message": "Alert acknowledged"}


@router.get("/speed-config", response_model=List[SpeedConfigResponse])
async def get_speed_configs(
    db: Session = Depends(get_db)
):
    configs = db.query(SpeedConfig).all()
    return configs


@router.post("/speed-config", response_model=SpeedConfigResponse)
async def create_speed_config(
    config_data: SpeedConfigUpdate,
    db: Session = Depends(get_db)
):
    config = SpeedConfig(
        name="default",
        pixels_per_meter=config_data.pixels_per_meter or 30.0,
        calibration_distance=config_data.calibration_distance or 10.0
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


@router.put("/speed-config/{config_id}", response_model=SpeedConfigResponse)
async def update_speed_config(
    config_id: int,
    config_data: SpeedConfigUpdate,
    db: Session = Depends(get_db)
):
    config = db.query(SpeedConfig).filter(SpeedConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Speed config not found")
    
    if config_data.pixels_per_meter is not None:
        config.pixels_per_meter = config_data.pixels_per_meter
    if config_data.calibration_distance is not None:
        config.calibration_distance = config_data.calibration_distance
    
    db.commit()
    db.refresh(config)
    return config
