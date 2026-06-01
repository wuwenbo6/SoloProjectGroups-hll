from sqlalchemy import create_engine, Column, Integer, String, Float, Text, DateTime, ForeignKey, LargeBinary
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
from .config import settings

engine = create_engine(
    settings.DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class RTPlan(Base):
    __tablename__ = "rt_plans"
    
    id = Column(Integer, primary_key=True, index=True)
    plan_name = Column(String, index=True)
    patient_id = Column(String, index=True)
    patient_name = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    description = Column(Text)
    
    structures = relationship("Structure", back_populates="plan", cascade="all, delete-orphan")
    beams = relationship("Beam", back_populates="plan", cascade="all, delete-orphan")
    dose_grid = relationship("DoseGrid", back_populates="plan", uselist=False, cascade="all, delete-orphan")

class Structure(Base):
    __tablename__ = "structures"
    
    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("rt_plans.id"))
    name = Column(String)
    roi_number = Column(Integer)
    color = Column(String)
    type = Column(String)
    
    plan = relationship("RTPlan", back_populates="structures")
    contours = relationship("Contour", back_populates="structure", cascade="all, delete-orphan")

class Contour(Base):
    __tablename__ = "contours"
    
    id = Column(Integer, primary_key=True, index=True)
    structure_id = Column(Integer, ForeignKey("structures.id"))
    slice_z = Column(Float)
    points = Column(Text)
    
    structure = relationship("Structure", back_populates="contours")

class Beam(Base):
    __tablename__ = "beams"
    
    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("rt_plans.id"))
    beam_name = Column(String)
    beam_number = Column(Integer)
    gantry_angle = Column(Float)
    collimator_angle = Column(Float)
    couch_angle = Column(Float)
    energy = Column(String)
    dose_rate = Column(Float)
    mu = Column(Float)
    field_size_x = Column(Float)
    field_size_y = Column(Float)
    sad = Column(Float)
    isocenter_x = Column(Float)
    isocenter_y = Column(Float)
    isocenter_z = Column(Float)
    
    plan = relationship("RTPlan", back_populates="beams")
    control_points = relationship("ControlPoint", back_populates="beam", cascade="all, delete-orphan")

class ControlPoint(Base):
    __tablename__ = "control_points"
    
    id = Column(Integer, primary_key=True, index=True)
    beam_id = Column(Integer, ForeignKey("beams.id"))
    index = Column(Integer)
    gantry_angle = Column(Float)
    collimator_angle = Column(Float)
    couch_angle = Column(Float)
    cumulative_mu = Column(Float)
    jaw_positions = Column(Text)
    mlc_positions = Column(Text)
    
    beam = relationship("Beam", back_populates="control_points")

class DoseGrid(Base):
    __tablename__ = "dose_grids"
    
    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("rt_plans.id"))
    data = Column(LargeBinary)
    shape_x = Column(Integer)
    shape_y = Column(Integer)
    shape_z = Column(Integer)
    spacing_x = Column(Float)
    spacing_y = Column(Float)
    spacing_z = Column(Float)
    origin_x = Column(Float)
    origin_y = Column(Float)
    origin_z = Column(Float)
    max_dose = Column(Float)
    min_dose = Column(Float)
    
    plan = relationship("RTPlan", back_populates="dose_grid")

Base.metadata.create_all(bind=engine)
