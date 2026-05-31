from sqlalchemy import create_engine, Column, Integer, Float, DateTime, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'cygnss.db')}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class SoilMoisture(Base):
    __tablename__ = "soil_moisture"
    
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, index=True)
    latitude = Column(Float, index=True)
    longitude = Column(Float, index=True)
    soil_moisture = Column(Float)
    surface_type = Column(String, index=True)
    reflectivity = Column(Float)
    sharpness = Column(Float)
    ddm_peak = Column(Float)
    ddm_noise = Column(Float)
    snr = Column(Float)
    satellite = Column(String)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    Base.metadata.create_all(bind=engine)
