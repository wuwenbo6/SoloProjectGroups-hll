from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class TankStatus(str, Enum):
    NORMAL = "normal"
    WARNING = "warning"
    ALARM = "alarm"
    OFFLINE = "offline"


class TankBase(BaseModel):
    name: str = Field(..., description="储罐名称", min_length=1, max_length=100)
    description: Optional[str] = Field(None, description="储罐描述", max_length=500)
    max_height: float = Field(..., description="储罐最大高度(米)", gt=0)
    sensor_height: float = Field(..., description="传感器安装高度(米)", gt=0)
    min_level: float = Field(0.0, description="最低液位报警阈值(米)", ge=0)
    max_level: float = Field(..., description="最高液位报警阈值(米)", gt=0)
    location: Optional[str] = Field(None, description="安装位置")


class TankCreate(TankBase):
    pass


class TankUpdate(BaseModel):
    name: Optional[str] = Field(None, description="储罐名称", min_length=1, max_length=100)
    description: Optional[str] = Field(None, description="储罐描述", max_length=500)
    max_height: Optional[float] = Field(None, description="储罐最大高度(米)", gt=0)
    sensor_height: Optional[float] = Field(None, description="传感器安装高度(米)", gt=0)
    min_level: Optional[float] = Field(None, description="最低液位报警阈值(米)", ge=0)
    max_level: Optional[float] = Field(None, description="最高液位报警阈值(米)", gt=0)
    location: Optional[str] = Field(None, description="安装位置")
    status: Optional[TankStatus] = Field(None, description="储罐状态")


class Tank(TankBase):
    id: str
    status: TankStatus = TankStatus.OFFLINE
    current_level: Optional[float] = None
    current_temperature: Optional[float] = None
    last_update: Optional[datetime] = None
    calibration_offset: float = 0.0
    calibration_scale: float = 1.0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TankListResponse(BaseModel):
    total: int
    tanks: List[Tank]


class TankStatusResponse(BaseModel):
    tank_id: str
    level: float
    temperature: float
    status: TankStatus
    timestamp: datetime
