from sqlalchemy import Column, Integer, String, DateTime, Float, JSON
from sqlalchemy.sql import func
from backend.database import Base


class VideoTask(Base):
    __tablename__ = "video_tasks"

    id = Column(String, primary_key=True, index=True)
    filename = Column(String, index=True)
    file_path = Column(String)
    status = Column(String, default="pending")
    fish_count = Column(Integer, default=0)
    fish_types = Column(JSON, default=dict)
    result_path = Column(String, nullable=True)
    track_data = Column(JSON, nullable=True)
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), onupdate=func.now())
