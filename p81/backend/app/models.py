from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base


class Photo(Base):
    __tablename__ = "photos"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    file_path = Column(String)
    upload_time = Column(DateTime(timezone=True), server_default=func.now())
    camera_id = Column(String, nullable=True)
    location = Column(String, nullable=True)

    detections = relationship("Detection", back_populates="photo")


class Individual(Base):
    __tablename__ = "individuals"

    id = Column(Integer, primary_key=True, index=True)
    species = Column(String, index=True)
    individual_id = Column(String, unique=True, index=True)
    first_seen = Column(DateTime(timezone=True), server_default=func.now())
    last_seen = Column(DateTime(timezone=True), server_default=func.now())
    sighting_count = Column(Integer, default=1)
    feature_vector = Column(Text, nullable=True)

    detections = relationship("Detection", back_populates="individual")


class Detection(Base):
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True, index=True)
    photo_id = Column(Integer, ForeignKey("photos.id"))
    individual_id = Column(Integer, ForeignKey("individuals.id"), nullable=True)
    species = Column(String, index=True)
    count = Column(Integer, default=1)
    confidence = Column(String)
    bbox = Column(String, nullable=True)
    feature_vector = Column(Text, nullable=True)

    photo = relationship("Photo", back_populates="detections")
    individual = relationship("Individual", back_populates="detections")
