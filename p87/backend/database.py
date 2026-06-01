from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os

DATABASE_URL = "sqlite:///./option_pricing.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class PricingHistory(Base):
    __tablename__ = "pricing_history"

    id = Column(Integer, primary_key=True, index=True)
    underlying_name = Column(String, index=True)
    option_style = Column(String)
    option_type = Column(String)
    S0 = Column(Float)
    K = Column(Float)
    T = Column(Float)
    r = Column(Float)
    sigma = Column(Float)
    num_paths = Column(Integer)
    num_steps = Column(Integer)
    price = Column(Float)
    ci_lower = Column(Float)
    ci_upper = Column(Float)
    std_error = Column(Float)
    time_taken = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    Base.metadata.create_all(bind=engine)
