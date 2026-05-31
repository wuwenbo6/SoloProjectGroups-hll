from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Boolean, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./gait_analysis.db")

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    doctor_id = Column(String, nullable=True)


class GaitSession(Base):
    __tablename__ = "gait_sessions"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, index=True)
    session_id = Column(String, unique=True, index=True)
    start_time = Column(DateTime)
    end_time = Column(DateTime, nullable=True)
    total_steps = Column(Integer, default=0)
    avg_stance_time = Column(Float, default=0)
    avg_swing_time = Column(Float, default=0)
    asymmetry_index = Column(Float, default=0)
    gait_quality_score = Column(Float, default=0)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class MLModel(Base):
    __tablename__ = "ml_models"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    model_version = Column(String, index=True)
    model_path = Column(String)
    accuracy = Column(Float)
    trained_on_samples = Column(Integer)
    is_personalized = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)


class Doctor(Base):
    __tablename__ = "doctors"

    id = Column(String, primary_key=True, index=True)
    name = Column(String)
    email = Column(String, unique=True, index=True)
    hospital = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class GaitReport(Base):
    __tablename__ = "gait_reports"

    id = Column(String, primary_key=True, index=True)
    session_id = Column(String, index=True)
    user_id = Column(String, index=True)
    doctor_id = Column(String, nullable=True)
    report_content = Column(Text)
    recommendations = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_reviewed = Column(Boolean, default=False)


Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
