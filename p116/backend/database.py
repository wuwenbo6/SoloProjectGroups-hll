from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, Float, Boolean, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

DATABASE_URL = "sqlite:///./satellite.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class TLEData(Base):
    __tablename__ = "tle_data"

    id = Column(Integer, primary_key=True, index=True)
    norad_id = Column(String(50), unique=True, index=True)
    name = Column(String(200), index=True)
    line1 = Column(String(100))
    line2 = Column(String(100))
    source = Column(String(100))
    updated_at = Column(DateTime, default=datetime.utcnow)
    description = Column(Text, nullable=True)
    version = Column(Integer, default=1)
    transition_minutes = Column(Integer, default=5)
    is_active = Column(Boolean, default=True)
    
    history = relationship("TLEHistory", back_populates="current", cascade="all, delete-orphan")

class TLEHistory(Base):
    __tablename__ = "tle_history"

    id = Column(Integer, primary_key=True, index=True)
    tle_id = Column(Integer, ForeignKey("tle_data.id"))
    norad_id = Column(String(50), index=True)
    name = Column(String(200))
    line1 = Column(String(100))
    line2 = Column(String(100))
    source = Column(String(100))
    epoch = Column(DateTime)
    replaced_at = Column(DateTime, default=datetime.utcnow)
    version = Column(Integer, default=1)
    bstar = Column(Float)
    inclination = Column(Float)
    eccentricity = Column(Float)
    period = Column(Float)
    
    current = relationship("TLEData", back_populates="history")

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
