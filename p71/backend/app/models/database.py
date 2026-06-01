from sqlalchemy import create_engine, Column, Integer, Float, DateTime, String, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

SQLALCHEMY_DATABASE_URL = "sqlite:///./training.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class TrainingSession(Base):
    __tablename__ = "training_session"

    id = Column(Integer, primary_key=True, index=True)
    start_time = Column(DateTime, nullable=False, default=datetime.utcnow)
    end_time = Column(DateTime)
    duration = Column(Float, default=0)
    total_calories = Column(Float, default=0)
    
    actions = relationship("ActionRecord", back_populates="session", cascade="all, delete-orphan")


class ActionRecord(Base):
    __tablename__ = "action_record"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("training_session.id"), nullable=False)
    action_name = Column(String(50), nullable=False)
    count = Column(Integer, default=0)
    avg_confidence = Column(Float, default=0)
    
    session = relationship("TrainingSession", back_populates="actions")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    Base.metadata.create_all(bind=engine)
