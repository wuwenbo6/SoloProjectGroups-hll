from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from backend.config import settings

engine = create_engine(
    settings.DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class RecognitionLog(Base):
    __tablename__ = "recognition_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255))
    original_path = Column(String(500))
    enhanced_path = Column(String(500), nullable=True)
    plate_number = Column(String(20))
    plate_color = Column(String(10))
    confidence = Column(Float)
    processing_time = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)
    error_message = Column(Text, nullable=True)


class Watchlist(Base):
    __tablename__ = "watchlist"
    
    id = Column(Integer, primary_key=True, index=True)
    plate_number = Column(String(20), unique=True, index=True)
    description = Column(String(500), nullable=True)
    alert_type = Column(String(50), default="watchlist")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AlertRecord(Base):
    __tablename__ = "alert_records"
    
    id = Column(Integer, primary_key=True, index=True)
    alert_id = Column(String(50), unique=True, index=True)
    plate_number = Column(String(20), index=True)
    alert_type = Column(String(50))
    speed = Column(Float, default=0.0)
    confidence = Column(Float, default=0.0)
    stream_id = Column(String(100), nullable=True)
    screenshot_path = Column(String(500), nullable=True)
    is_acknowledged = Column(Boolean, default=False)
    acknowledged_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class VideoStream(Base):
    __tablename__ = "video_streams"
    
    id = Column(Integer, primary_key=True, index=True)
    stream_id = Column(String(100), unique=True, index=True)
    name = Column(String(255))
    rtsp_url = Column(String(500))
    speed_limit = Column(Float, default=60.0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SpeedConfig(Base):
    __tablename__ = "speed_config"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True)
    pixels_per_meter = Column(Float, default=30.0)
    calibration_distance = Column(Float, default=10.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
