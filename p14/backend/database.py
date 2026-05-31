from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

SQLALCHEMY_DATABASE_URL = "sqlite:///./seismic_events.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class Template(Base):
    __tablename__ = "templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    station = Column(String, index=True)
    channel = Column(String)
    start_time = Column(String)
    end_time = Column(String)
    sampling_rate = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)

    detections = relationship("Detection", back_populates="template")


class Detection(Base):
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("templates.id"))
    station = Column(String, index=True)
    channel = Column(String)
    detection_time = Column(String)
    correlation_coefficient = Column(Float)
    threshold_used = Column(Float)
    sample_index = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)

    template = relationship("Template", back_populates="detections")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
