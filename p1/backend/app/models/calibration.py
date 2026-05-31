from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from enum import Enum


class CalibrationStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class CalibrationPointCreate(BaseModel):
    measured_level: float = Field(..., description="传感器测量液位(米)", ge=0)
    actual_level: float = Field(..., description="实际液位(米)", ge=0)
    temperature: Optional[float] = Field(25.0, description="校准时温度(摄氏度)")
    note: Optional[str] = Field(None, description="备注")


class CalibrationPoint(BaseModel):
    id: str
    tank_id: str
    measured_level: float
    actual_level: float
    temperature: float
    error: float
    note: Optional[str]
    created_at: datetime


class CalibrationCreate(BaseModel):
    tank_id: str = Field(..., description="储罐ID")
    name: str = Field(..., description="校准任务名称", min_length=1)
    description: Optional[str] = Field(None, description="描述")


class CalibrationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class CalibrationResult(BaseModel):
    offset: float = Field(..., description="偏移量(米)")
    scale_factor: float = Field(..., description="缩放系数")
    r_squared: float = Field(..., description="拟合优度")
    mean_error: float = Field(..., description="平均误差(米)")
    max_error: float = Field(..., description="最大误差(米)")
    point_count: int = Field(..., description="校准点数")


class Calibration(BaseModel):
    id: str
    tank_id: str
    name: str
    description: Optional[str]
    status: CalibrationStatus
    points: List[CalibrationPoint]
    result: Optional[CalibrationResult]
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class CalibrationListResponse(BaseModel):
    total: int
    calibrations: List[Calibration]


class ApplyCalibrationRequest(BaseModel):
    apply: bool = Field(True, description="是否应用校准")
