from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.sql import func
from app.database import Base


class Stream(Base):
    __tablename__ = "streams"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    rtsp_url = Column(String(512), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class TrackingRecord(Base):
    __tablename__ = "tracking_records"
    
    id = Column(Integer, primary_key=True, index=True)
    stream_id = Column(Integer, ForeignKey("streams.id"), nullable=False)
    object_id = Column(String(100), nullable=False)
    label = Column(String(100), default="target")
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False)
    width = Column(Float, nullable=False)
    height = Column(Float, nullable=False)
    confidence = Column(Float, default=1.0)
    frame_timestamp = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
