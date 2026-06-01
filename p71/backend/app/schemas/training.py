from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class ActionRecordBase(BaseModel):
    action_name: str
    count: int
    avg_confidence: float


class ActionRecordCreate(ActionRecordBase):
    pass


class ActionRecordResponse(ActionRecordBase):
    id: int

    class Config:
        from_attributes = True


class TrainingSessionBase(BaseModel):
    startTime: str
    endTime: str
    duration: float
    totalCalories: float
    actions: List[ActionRecordCreate]


class TrainingSessionCreate(TrainingSessionBase):
    pass


class TrainingSessionResponse(BaseModel):
    id: int
    startTime: datetime
    endTime: Optional[datetime] = None
    duration: float
    totalCalories: float
    actions: List[ActionRecordResponse]

    class Config:
        from_attributes = True

    @classmethod
    def from_orm(cls, obj):
        return cls(
            id=obj.id,
            startTime=obj.start_time,
            endTime=obj.end_time,
            duration=obj.duration,
            totalCalories=obj.total_calories,
            actions=[ActionRecordResponse.from_orm(a) for a in obj.actions]
        )
