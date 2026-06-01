from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from database import Base


class QualityReport(Base):
    __tablename__ = "quality_reports"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    created_at = Column(DateTime)
    station_name = Column(String)
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    num_satellites = Column(Integer)
    overall_quality_score = Column(Float)

    satellite_metrics = relationship("SatelliteMetric", back_populates="report")


class SatelliteMetric(Base):
    __tablename__ = "satellite_metrics"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("quality_reports.id"))
    satellite = Column(String)
    avg_multipath = Column(Float)
    max_multipath = Column(Float)
    avg_snr = Column(Float)
    min_snr = Column(Float)
    cycle_slips_count = Column(Integer)
    data_availability = Column(Float)

    report = relationship("QualityReport", back_populates="satellite_metrics")
