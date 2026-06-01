from sqlalchemy import Column, Integer, Float, String, DateTime, Text, Boolean
from sqlalchemy.sql import func
from backend.app.models.database import Base

class Simulation(Base):
    __tablename__ = "simulations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    source_lat = Column(Float, nullable=False)
    source_lon = Column(Float, nullable=False)
    emission_rate = Column(Float, nullable=False)
    wind_speed = Column(Float, nullable=False)
    wind_direction = Column(Float, nullable=False)
    stability_class = Column(String(10), nullable=False)
    duration_hours = Column(Integer, nullable=False)
    grid_resolution = Column(Float, nullable=False)
    pollutant_type = Column(String(50), nullable=False)
    num_particles = Column(Integer, default=10000)
    use_dynamic_weather = Column(Boolean, default=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    result_data = Column(Text, nullable=True)
