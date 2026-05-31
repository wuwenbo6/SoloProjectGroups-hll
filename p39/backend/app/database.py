from sqlalchemy import create_engine, Column, String, Integer, Float, DateTime, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from .config import settings

engine = create_engine(settings.database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class ProbeData(Base):
    __tablename__ = "probe_data"

    id = Column(Integer, primary_key=True, index=True)
    mac_address = Column(String(17), index=True)
    rssi = Column(Integer)
    ap_id = Column(String(50), index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    zone = Column(String(50), index=True)

    __table_args__ = (
        Index('idx_probe_mac_time', 'mac_address', 'timestamp'),
        Index('idx_probe_zone_time', 'zone', 'timestamp'),
    )


class PassengerCount(Base):
    __tablename__ = "passenger_count"

    id = Column(Integer, primary_key=True, index=True)
    zone = Column(String(50), index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    raw_count = Column(Integer)
    adjusted_count = Column(Integer, nullable=True)
    estimated_count = Column(Float)
    lower_bound = Column(Float)
    upper_bound = Column(Float)
    confidence = Column(Float)
    total_probes = Column(Integer, nullable=True)
    random_mac_ratio = Column(Float, nullable=True)
    is_holiday = Column(Integer, nullable=True)
    holiday_type = Column(String(20), nullable=True)


class ZoneConfig(Base):
    __tablename__ = "zone_config"

    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(String(50), unique=True, index=True)
    name = Column(String(100))
    x = Column(Float)
    y = Column(Float)
    width = Column(Float)
    height = Column(Float)
    max_capacity = Column(Integer)
    ap_ids = Column(String(200))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
