from sqlalchemy import Column, Integer, Float, String, DateTime
from sqlalchemy.sql import func

from app.core.database import Base


class SimulationParams(Base):
    __tablename__ = "simulation_params"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    undercooling = Column(Float, nullable=False)
    anisotropy = Column(Float, nullable=False)
    anisotropy_mode = Column(Integer, nullable=False, default=4)
    interface_width = Column(Float, nullable=False, default=3.0)
    mobility = Column(Float, nullable=False, default=1.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
