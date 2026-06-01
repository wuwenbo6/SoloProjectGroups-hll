from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class TargetBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    ip_address: str = Field(..., min_length=1, max_length=45)
    port: int = Field(502, ge=1, le=65535)
    slave_id: int = Field(1, ge=0, le=255)
    timeout: int = Field(5000, ge=100, le=60000)


class TargetCreate(TargetBase):
    pass


class TargetUpdate(TargetBase):
    pass


class Target(TargetBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class TestTaskBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    target_id: int
    strategies: List[str] = Field(default_factory=list)


class TestTaskCreate(TestTaskBase):
    pass


class TestTaskUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None


class TestTask(TestTaskBase):
    id: int
    status: str
    packet_count: int
    crash_count: int
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    target: Optional[Target] = None

    class Config:
        from_attributes = True


class PacketRecordBase(BaseModel):
    task_id: int
    direction: str
    hex_data: str
    function_code: Optional[int] = None
    response_time_ms: Optional[int] = None
    is_error: bool = False
    error_message: Optional[str] = None


class PacketRecordCreate(PacketRecordBase):
    pass


class PacketRecord(PacketRecordBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True


class CrashRecordBase(BaseModel):
    task_id: int
    packet_hex: str
    description: Optional[str] = None
    severity: str = "medium"
    reproducible: bool = False
    notes: Optional[str] = None


class CrashRecordCreate(CrashRecordBase):
    pass


class CrashRecord(CrashRecordBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True


class TestCaseBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    strategy_type: str
    params: Dict[str, Any] = Field(default_factory=dict)


class TestCaseCreate(TestCaseBase):
    pass


class TestCaseUpdate(TestCaseBase):
    pass


class TestCase(TestCaseBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MutationStrategy(BaseModel):
    id: str
    name: str
    description: str
    enabled: bool = True
    params: Optional[Dict[str, Any]] = None


class ConnectionTestResult(BaseModel):
    success: bool
    message: str
    response_time_ms: Optional[int] = None


class DashboardStats(BaseModel):
    total_targets: int
    total_tasks: int
    running_tasks: int
    total_packets: int
    total_crashes: int
    recent_crashes: List[CrashRecord]
    recent_tasks: List[TestTask]


class TaskControl(BaseModel):
    action: str
