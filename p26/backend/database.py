from sqlalchemy import create_engine, Column, Integer, String, DateTime, JSON, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

SQLALCHEMY_DATABASE_URL = "sqlite:///./dicom_annotator.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class Series(Base):
    __tablename__ = "series"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    folder_path = Column(String)
    num_slices = Column(Integer)
    modality = Column(String, default="CT")
    created_at = Column(DateTime, default=datetime.utcnow)
    
    annotations = relationship("Annotation", back_populates="series")

class Annotation(Base):
    __tablename__ = "annotations"
    
    id = Column(Integer, primary_key=True, index=True)
    series_id = Column(Integer, ForeignKey("series.id"))
    label = Column(String)
    slice_index = Column(Integer)
    data = Column(JSON)
    color = Column(String, default="#ff0000")
    created_at = Column(DateTime, default=datetime.utcnow)
    
    series = relationship("Series", back_populates="annotations")

class TrainingJob(Base):
    __tablename__ = "training_jobs"
    
    id = Column(String, primary_key=True, index=True)
    model_type = Column(String, default="liver")
    status = Column(String, default="pending")
    annotation_ids = Column(JSON)
    config = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    result = Column(JSON, nullable=True)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    Base.metadata.create_all(bind=engine)
