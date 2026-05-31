from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class SensorData(BaseModel):
    tank_id: str = Field(..., description="储罐ID")
    echo_time: float = Field(..., description="回波时间(秒)", gt=0)
    temperature: float = Field(25.0, description="环境温度(摄氏度)")
    waveform: Optional[List[float]] = Field(None, description="回波波形数据")


class LevelCalculationResult(BaseModel):
    tank_id: str
    echo_time: float
    temperature: float
    sound_speed: float
    distance: float
    level: float
    percentage: float
    timestamp: datetime


class TrendDataPoint(BaseModel):
    time: str
    level: float
    temperature: Optional[float] = None


class TrendResponse(BaseModel):
    tank_id: str
    data: List[TrendDataPoint]
    start_time: str
    end_time: str


class WaveformResponse(BaseModel):
    tank_id: str
    waveform: List[float]
    timestamp: str
