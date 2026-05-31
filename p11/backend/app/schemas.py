from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime


class RecognitionResult(BaseModel):
    success: bool
    plate_number: str
    plate_color: str
    confidence: float
    processing_time: float
    original_image: str
    enhanced_image: Optional[str] = None
    bbox: Optional[List[int]] = None
    message: Optional[str] = None


class RecognitionLogResponse(BaseModel):
    id: int
    filename: str
    plate_number: str
    plate_color: str
    confidence: float
    processing_time: float
    created_at: datetime
    original_path: str
    enhanced_path: Optional[str] = None
    error_message: Optional[str] = None

    class Config:
        from_attributes = True


class HealthCheck(BaseModel):
    status: str
    app_name: str
    timestamp: datetime


class ImageEnhanceRequest(BaseModel):
    method: str = "auto"


class DetectionResponse(BaseModel):
    success: bool
    detections: List[dict]
    processing_time: float


class WatchlistCreate(BaseModel):
    plate_number: str
    description: Optional[str] = None
    alert_type: str = "watchlist"


class WatchlistUpdate(BaseModel):
    description: Optional[str] = None
    alert_type: Optional[str] = None
    is_active: Optional[bool] = None


class WatchlistResponse(BaseModel):
    id: int
    plate_number: str
    description: Optional[str]
    alert_type: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AlertResponse(BaseModel):
    id: int
    alert_id: str
    plate_number: str
    alert_type: str
    speed: float
    confidence: float
    stream_id: Optional[str]
    screenshot_path: Optional[str]
    is_acknowledged: bool
    acknowledged_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class VideoStreamCreate(BaseModel):
    stream_id: str
    name: str
    rtsp_url: str
    speed_limit: float = 60.0


class VideoStreamUpdate(BaseModel):
    name: Optional[str] = None
    rtsp_url: Optional[str] = None
    speed_limit: Optional[float] = None
    is_active: Optional[bool] = None


class VideoStreamResponse(BaseModel):
    id: int
    stream_id: str
    name: str
    rtsp_url: str
    speed_limit: float
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SpeedConfigUpdate(BaseModel):
    pixels_per_meter: Optional[float] = None
    calibration_distance: Optional[float] = None


class SpeedConfigResponse(BaseModel):
    id: int
    name: str
    pixels_per_meter: float
    calibration_distance: float
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class VehicleTrackResponse(BaseModel):
    track_id: str
    plate_number: str
    plate_color: str
    confidence: float
    speed: float
    bbox: List[int]
    first_seen: str
    last_seen: str


class StreamStatusResponse(BaseModel):
    stream_id: str
    is_running: bool
    frame_count: int
    active_tracks: int
    total_alerts: int
    rtsp_url: str


class StreamManagerStatus(BaseModel):
    stream_count: int
    watchlist_count: int
    speed_limit: float
    streams: Dict[str, StreamStatusResponse]
