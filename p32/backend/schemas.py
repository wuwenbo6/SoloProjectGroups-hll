from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Dict, Any


class VideoTaskBase(BaseModel):
    filename: str


class VideoTaskCreate(VideoTaskBase):
    pass


class VideoTask(VideoTaskBase):
    id: str
    status: str
    fish_count: int
    fish_types: Dict[str, int]
    result_path: Optional[str] = None
    track_data: Optional[Any] = None
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        orm_mode = True
