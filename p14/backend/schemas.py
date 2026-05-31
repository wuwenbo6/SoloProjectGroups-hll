from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class TemplateBase(BaseModel):
    name: str
    station: str
    channel: str
    start_time: str
    end_time: str
    sampling_rate: float


class TemplateCreate(TemplateBase):
    pass


class Template(TemplateBase):
    id: int
    created_at: datetime

    class Config:
        orm_mode = True


class DetectionBase(BaseModel):
    station: str
    channel: str
    detection_time: str
    correlation_coefficient: float
    threshold_used: Optional[float] = None
    sample_index: Optional[int] = None


class DetectionCreate(DetectionBase):
    template_id: int


class Detection(DetectionBase):
    id: int
    template_id: int
    created_at: datetime
    template: Optional[Template] = None

    class Config:
        orm_mode = True


class DetectionResult(BaseModel):
    station: str
    channel: str
    detection_time: str
    correlation_coefficient: float
    template_name: str


class DetectionResponse(BaseModel):
    detections: List[DetectionResult]
    total: int


class WaveformSegment(BaseModel):
    station: str
    channel: str
    start_time: str
    end_time: str
    sampling_rate: float
    data: List[float]


class AlignedWaveforms(BaseModel):
    template: WaveformSegment
    detections: List[WaveformSegment]


class Station(BaseModel):
    name: str
    latitude: float
    longitude: float
    elevation: float


class LocationRequest(BaseModel):
    station_coords: Dict[str, Tuple[float, float, float]]
    arrival_times: Dict[str, float]


class LocationResult(BaseModel):
    latitude: float
    longitude: float
    depth: float
    origin_time: float
    latitude_uncertainty: float
    longitude_uncertainty: float
    depth_uncertainty: float


class RelocateRequest(BaseModel):
    station_coords: Dict[str, Tuple[float, float, float]]
    events: List[Dict]


class StreamingStatus(BaseModel):
    is_running: bool
    total_data_samples: int
    windows_processed: int
    detections_count: int
    buffer_sizes: Dict[str, int]
