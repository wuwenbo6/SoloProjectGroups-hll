from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


db = SQLAlchemy(model_class=Base)


class Recording(db.Model):
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=True)
    duration: Mapped[float] = mapped_column(Float, nullable=True)
    sample_rate: Mapped[int] = mapped_column(Integer, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    user_ip: Mapped[str] = mapped_column(String(100), nullable=True)
    
    predictions = relationship("Prediction", back_populates="recording", cascade="all, delete-orphan")


class Prediction(db.Model):
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    recording_id: Mapped[int] = mapped_column(Integer, ForeignKey('recording.id'), nullable=False)
    species: Mapped[str] = mapped_column(String(200), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    confidence_percent: Mapped[float] = mapped_column(Float, nullable=False)
    is_top_prediction: Mapped[int] = mapped_column(Integer, default=0)
    predicted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    recording = relationship("Recording", back_populates="predictions")


class BatchJob(db.Model):
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default='pending')
    total_files: Mapped[int] = mapped_column(Integer, default=0)
    processed_files: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    results: Mapped[str] = mapped_column(Text, nullable=True)


def init_db(app):
    with app.app_context():
        db.create_all()
