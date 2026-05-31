from pydantic import BaseModel
from datetime import datetime, time
from typing import Optional, List

class UserBase(BaseModel):
    name: str
    wechat_openid: Optional[str] = None
    phone: Optional[str] = None
    tts_enabled: bool = False
    tts_voice: str = "default"

class UserCreate(UserBase):
    pass

class UserUpdate(BaseModel):
    name: Optional[str] = None
    wechat_openid: Optional[str] = None
    phone: Optional[str] = None
    tts_enabled: Optional[bool] = None
    tts_voice: Optional[str] = None

class User(UserBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class PillboxBase(BaseModel):
    device_id: str
    name: str
    user_id: int

class PillboxCreate(PillboxBase):
    pass

class Pillbox(PillboxBase):
    id: int
    is_online: bool
    last_heartbeat: Optional[datetime]
    created_at: datetime
    
    class Config:
        from_attributes = True

class MedicationPlanBase(BaseModel):
    user_id: int
    pillbox_id: int
    medicine_name: str
    dosage: str
    pills_per_dose: int = 1
    total_pills: int = 0
    remaining_pills: int = 0
    refill_threshold: int = 10
    take_time: time
    days_of_week: str
    is_active: bool = True

class MedicationPlanCreate(MedicationPlanBase):
    pass

class MedicationPlanUpdate(BaseModel):
    user_id: Optional[int] = None
    pillbox_id: Optional[int] = None
    medicine_name: Optional[str] = None
    dosage: Optional[str] = None
    pills_per_dose: Optional[int] = None
    total_pills: Optional[int] = None
    remaining_pills: Optional[int] = None
    refill_threshold: Optional[int] = None
    take_time: Optional[time] = None
    days_of_week: Optional[str] = None
    is_active: Optional[bool] = None

class MedicationPlan(MedicationPlanBase):
    id: int
    low_stock_notified: bool = False
    created_at: datetime
    
    class Config:
        from_attributes = True

class MedicationRefillBase(BaseModel):
    plan_id: int
    added_count: int
    note: Optional[str] = None

class MedicationRefillCreate(MedicationRefillBase):
    pass

class MedicationRefill(MedicationRefillBase):
    id: int
    previous_count: int
    new_count: int
    refill_date: datetime
    
    class Config:
        from_attributes = True

class MedicationRecordBase(BaseModel):
    user_id: int
    plan_id: int
    pillbox_id: int
    scheduled_time: datetime
    actual_time: Optional[datetime] = None
    is_taken: bool = False
    pills_taken: int = 0

class MedicationRecordCreate(MedicationRecordBase):
    pass

class MedicationRecord(MedicationRecordBase):
    id: int
    is_notified: bool = False
    tts_played: bool = False
    created_at: datetime
    
    class Config:
        from_attributes = True

class SensorLogBase(BaseModel):
    pillbox_id: int
    sensor_type: str
    value: str

class SensorLogCreate(SensorLogBase):
    pass

class SensorLog(SensorLogBase):
    id: int
    timestamp: datetime
    
    class Config:
        from_attributes = True

class SensorDataBatchItem(BaseModel):
    sensor_type: str
    value: int
    timestamp: datetime

class SensorDataBatch(BaseModel):
    device_id: str
    data: List[SensorDataBatchItem]
    is_offline_data: bool = False

class BatchUploadResponse(BaseModel):
    success: bool
    processed_count: int
    medication_taken: bool = False
    message: str

class TTSRequest(BaseModel):
    text: str
    voice: str = "default"
    speed: float = 1.0

class ReportRequest(BaseModel):
    user_id: Optional[int] = None
    start_date: datetime
    end_date: datetime
    format: str = "csv"

class LowStockAlert(BaseModel):
    plan_id: int
    medicine_name: str
    remaining_pills: int
    threshold: int
    user_id: int
    user_name: str
