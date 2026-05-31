from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class StatisticsResultBase(BaseModel):
    index_type: str
    mean_value: Optional[float] = None
    median_value: Optional[float] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    std_value: Optional[float] = None
    valid_pixels: Optional[int] = None
    polygon_wkt: Optional[str] = None


class StatisticsResultCreate(StatisticsResultBase):
    pass


class StatisticsResult(StatisticsResultBase):
    id: int
    task_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ProcessingTaskBase(BaseModel):
    task_name: str
    original_filename: str


class ProcessingTaskCreate(ProcessingTaskBase):
    pass


class ProcessingTask(ProcessingTaskBase):
    id: int
    status: str
    created_at: datetime
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    input_path: str
    ndvi_path: Optional[str] = None
    evi_path: Optional[str] = None
    ndwi_path: Optional[str] = None
    cloud_mask_path: Optional[str] = None
    apply_cloud_mask: Optional[str] = "auto"
    bbox: Optional[str] = None
    crs: Optional[str] = None
    statistics: List[StatisticsResult] = []

    class Config:
        from_attributes = True


class StatisticsRequest(BaseModel):
    polygon_wkt: str
    index_type: str


class TaskListResponse(BaseModel):
    tasks: List[ProcessingTask]
    total: int


class ClassificationResultBase(BaseModel):
    task_id: int


class ClassificationResultCreate(ClassificationResultBase):
    pass


class ClassificationResult(ClassificationResultBase):
    id: int
    classification_path: Optional[str] = None
    preview_path: Optional[str] = None
    status: str
    water_pixels: int = 0
    forest_pixels: int = 0
    built_pixels: int = 0
    bare_pixels: int = 0
    farm_pixels: int = 0
    water_area_km2: float = 0
    forest_area_km2: float = 0
    built_area_km2: float = 0
    bare_area_km2: float = 0
    farm_area_km2: float = 0
    created_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ChangeDetectionRequest(BaseModel):
    task_name: str
    before_task_id: int
    after_task_id: int
    index_type: str = "ndvi"
    threshold: float = 0.1


class ChangeDetectionResult(BaseModel):
    id: int
    task_name: str
    before_task_id: int
    after_task_id: int
    index_type: str
    threshold: float
    change_path: Optional[str] = None
    status: str
    severe_degradation: int = 0
    mild_degradation: int = 0
    no_change: int = 0
    mild_improvement: int = 0
    significant_improvement: int = 0
    created_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
