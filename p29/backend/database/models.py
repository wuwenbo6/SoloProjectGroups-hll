from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from .database import Base

class TrainingVideo(Base):
    __tablename__ = "training_videos"

    id = Column(Integer, primary_key=True, index=True)
    consonant_label = Column(String(10), index=True, nullable=False)
    frame_count = Column(Integer, nullable=False)
    duration = Column(Float, nullable=False)
    file_path = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<TrainingVideo(id={self.id}, label='{self.consonant_label}')>"

class ModelTrainingLog(Base):
    __tablename__ = "training_logs"

    id = Column(Integer, primary_key=True, index=True)
    model_version = Column(String(50))
    epochs = Column(Integer)
    training_samples = Column(Integer)
    accuracy = Column(Float)
    loss = Column(Float)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<ModelTrainingLog(id={self.id}, version='{self.model_version}')>"
