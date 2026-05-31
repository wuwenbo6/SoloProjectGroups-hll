from sqlalchemy import Column, Integer, String, Float, DateTime, Enum, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from .database import Base


class TaskStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class IndexType(str, enum.Enum):
    NDVI = "ndvi"
    EVI = "evi"
    NDWI = "ndwi"


class ProcessingTask(Base):
    __tablename__ = "processing_tasks"

    id = Column(Integer, primary_key=True, index=True)
    task_name = Column(String(255), nullable=False)
    status = Column(String(50), default=TaskStatus.PENDING)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(Text, nullable=True)

    original_filename = Column(String(255), nullable=False)
    input_path = Column(String(500), nullable=False)

    ndvi_path = Column(String(500), nullable=True)
    evi_path = Column(String(500), nullable=True)
    ndwi_path = Column(String(500), nullable=True)
    cloud_mask_path = Column(String(500), nullable=True)

    apply_cloud_mask = Column(String(10), default="auto")

    bbox = Column(String(255), nullable=True)
    crs = Column(String(50), nullable=True)

    statistics = relationship("StatisticsResult", back_populates="task", cascade="all, delete-orphan")


class StatisticsResult(Base):
    __tablename__ = "statistics_results"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("processing_tasks.id"))
    index_type = Column(String(20), nullable=False)
    mean_value = Column(Float, nullable=True)
    median_value = Column(Float, nullable=True)
    min_value = Column(Float, nullable=True)
    max_value = Column(Float, nullable=True)
    std_value = Column(Float, nullable=True)
    valid_pixels = Column(Integer, nullable=True)

    polygon_wkt = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    task = relationship("ProcessingTask", back_populates="statistics")


class ClassificationResult(Base):
    __tablename__ = "classification_results"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("processing_tasks.id"))
    classification_path = Column(String(500), nullable=True)
    preview_path = Column(String(500), nullable=True)
    status = Column(String(50), default="pending")
    error_message = Column(Text, nullable=True)

    water_pixels = Column(Integer, default=0)
    forest_pixels = Column(Integer, default=0)
    built_pixels = Column(Integer, default=0)
    bare_pixels = Column(Integer, default=0)
    farm_pixels = Column(Integer, default=0)

    water_area_km2 = Column(Float, default=0)
    forest_area_km2 = Column(Float, default=0)
    built_area_km2 = Column(Float, default=0)
    bare_area_km2 = Column(Float, default=0)
    farm_area_km2 = Column(Float, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)


class ChangeDetectionResult(Base):
    __tablename__ = "change_detection_results"

    id = Column(Integer, primary_key=True, index=True)
    task_name = Column(String(255), nullable=False)
    before_task_id = Column(Integer, ForeignKey("processing_tasks.id"))
    after_task_id = Column(Integer, ForeignKey("processing_tasks.id"))
    index_type = Column(String(20), default="ndvi")
    threshold = Column(Float, default=0.1)
    change_path = Column(String(500), nullable=True)
    status = Column(String(50), default="pending")
    error_message = Column(Text, nullable=True)

    severe_degradation = Column(Integer, default=0)
    mild_degradation = Column(Integer, default=0)
    no_change = Column(Integer, default=0)
    mild_improvement = Column(Integer, default=0)
    significant_improvement = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
