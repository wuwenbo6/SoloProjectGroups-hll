from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text, ForeignKey, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./defect_detection.db')

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class DetectionRecord(Base):
    __tablename__ = "detection_records"
    
    id = Column(Integer, primary_key=True, index=True)
    image_name = Column(String(255), index=True)
    image_path = Column(String(500))
    detected_class = Column(String(50))
    confidence = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)
    heatmap_path = Column(String(500))
    result_json = Column(Text)
    is_labeled = Column(Boolean, default=False)
    true_class = Column(String(50), nullable=True)
    
    defects = relationship("DefectLocation", back_populates="detection_record", cascade="all, delete-orphan")


class DefectLocation(Base):
    __tablename__ = "defect_locations"
    
    id = Column(Integer, primary_key=True, index=True)
    detection_record_id = Column(Integer, ForeignKey("detection_records.id"))
    defect_class = Column(String(50))
    severity = Column(String(20), default='medium')
    x = Column(Integer)
    y = Column(Integer)
    width = Column(Integer)
    height = Column(Integer)
    area = Column(Integer)
    
    detection_record = relationship("DetectionRecord", back_populates="defects")


class LabelingQueue(Base):
    __tablename__ = "labeling_queue"
    
    id = Column(Integer, primary_key=True, index=True)
    image_name = Column(String(255), index=True)
    image_path = Column(String(500))
    predicted_class = Column(String(50))
    confidence = Column(Float)
    is_labeled = Column(Boolean, default=False)
    true_class = Column(String(50), nullable=True)
    true_severity = Column(String(20), nullable=True)
    added_at = Column(DateTime, default=datetime.utcnow)
    labeled_at = Column(DateTime, nullable=True)
    priority = Column(Float, default=0.5)
    heatmap_path = Column(String(500), nullable=True)


class TrainingSession(Base):
    __tablename__ = "training_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    session_name = Column(String(255))
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    num_samples = Column(Integer, default=0)
    initial_accuracy = Column(Float, nullable=True)
    final_accuracy = Column(Float, nullable=True)
    model_path = Column(String(500))
    status = Column(String(50), default='running')


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
