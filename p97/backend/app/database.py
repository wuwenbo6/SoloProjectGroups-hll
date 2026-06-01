from sqlalchemy import create_engine, Column, String, DateTime, Integer, Float, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import uuid

SQLALCHEMY_DATABASE_URL = "sqlite:///./eeg_database.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class Record(Base):
    __tablename__ = "records"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    duration_seconds = Column(Integer, nullable=False)
    seizure_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    seizure_events = relationship("SeizureEvent", back_populates="record", cascade="all, delete-orphan")


class SeizureEvent(Base):
    __tablename__ = "seizure_events"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    record_id = Column(String, ForeignKey("records.id"), nullable=False)
    timestamp = Column(DateTime, nullable=False)
    duration = Column(Float, nullable=False)
    confidence = Column(Float, nullable=False)
    seizure_type = Column(String)

    record = relationship("Record", back_populates="seizure_events")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
