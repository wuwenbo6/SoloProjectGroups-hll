from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional, Dict, Any


class DetectionBase(BaseModel):
    species: str
    count: int
    confidence: str


class DetectionCreate(DetectionBase):
    bbox: Optional[str] = None
    individual_id: Optional[int] = None


class Detection(DetectionBase):
    id: int
    photo_id: int
    bbox: Optional[str] = None
    individual_id: Optional[int] = None

    class Config:
        from_attributes = True


class PhotoBase(BaseModel):
    filename: str
    camera_id: Optional[str] = None
    location: Optional[str] = None


class PhotoCreate(PhotoBase):
    file_path: str


class Photo(PhotoBase):
    id: int
    file_path: str
    upload_time: datetime
    detections: List[Detection] = []

    class Config:
        from_attributes = True


class PhotoWithDetections(Photo):
    pass


class DetectionResult(BaseModel):
    species: str
    count: int
    confidence: str


class IndividualBase(BaseModel):
    species: str
    individual_id: str


class IndividualCreate(IndividualBase):
    feature_vector: Optional[str] = None


class Individual(IndividualBase):
    id: int
    first_seen: datetime
    last_seen: datetime
    sighting_count: int

    class Config:
        from_attributes = True


class IndividualWithDetections(Individual):
    detections: List[Detection] = []


class RecaptureRate(BaseModel):
    species: str
    total_individuals: int
    recaptured_individuals: int
    recapture_rate: float


class ActivityHeatmapData(BaseModel):
    species: str
    heatmap: List[List[int]]
    hour_labels: List[str]
    day_labels: List[str]


class SpeciesActivity(BaseModel):
    species: str
    hourly_counts: Dict[str, int]
    peak_hour: str
    peak_count: int


class ExportReportRequest(BaseModel):
    species: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    include_individuals: bool = True
    include_activity: bool = True
