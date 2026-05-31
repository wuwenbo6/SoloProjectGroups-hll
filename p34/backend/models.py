from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class NestingSolution(Base):
    __tablename__ = "nesting_solutions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    sheet_width = Column(Float)
    sheet_height = Column(Float)
    material_utilization = Column(Float)
    total_waste = Column(Float)
    cutting_path_length = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)
    gcode = Column(Text)
    
    parts = relationship("Part", back_populates="solution")

class Part(Base):
    __tablename__ = "parts"

    id = Column(Integer, primary_key=True, index=True)
    solution_id = Column(Integer, ForeignKey("nesting_solutions.id"))
    name = Column(String)
    x = Column(Float)
    y = Column(Float)
    rotation = Column(Float)
    scale = Column(Float, default=1.0)
    path_data = Column(Text)
    cutting_order = Column(Integer)
    
    solution = relationship("NestingSolution", back_populates="parts")
