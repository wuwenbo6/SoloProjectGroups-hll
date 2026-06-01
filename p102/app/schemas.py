from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class StreamBase(BaseModel):
    name: str
    rtsp_url: str


class StreamCreate(StreamBase):
    pass


class StreamUpdate(BaseModel):
    name: Optional[str] = None
    rtsp_url: Optional[str] = None
    is_active: Optional[bool] = None


class StreamResponse(StreamBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class TrackingRecordBase(BaseModel):
    stream_id: int
    object_id: str
    label: str = "target"
    x: float
    y: float
    width: float
    height: float
    confidence: float = 1.0
    frame_timestamp: datetime


class TrackingRecordCreate(TrackingRecordBase):
    pass


class TrackingRecordResponse(TrackingRecordBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class TrackingInitRequest(BaseModel):
    stream_id: int
    x: float
    y: float
    width: float
    height: float
    label: str = "target"


class WebRTCOffer(BaseModel):
    sdp: str
    type: str


class WebRTCAnswer(BaseModel):
    sdp: str
    type: str


class TrajectoryPoint(BaseModel):
    x: float
    y: float
    timestamp: datetime


class TrajectoryResponse(BaseModel):
    object_id: str
    label: str
    stream_id: int
    trajectory: List[TrajectoryPoint]


class ExportRequest(BaseModel):
    stream_id: int
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    filename: Optional[str] = None
    draw_boxes: bool = True
    draw_trajectory: bool = True


class ExportResponse(BaseModel):
    export_id: str
    status: str
    filepath: Optional[str] = None
    filename: Optional[str] = None
    frame_count: Optional[int] = None
    file_size: Optional[int] = None
    error: Optional[str] = None


class ExportStatusResponse(BaseModel):
    export_id: str
    status: str
    progress: int
    filepath: Optional[str] = None
    filename: Optional[str] = None
    frame_count: Optional[int] = None
    file_size: Optional[int] = None
    error: Optional[str] = None
