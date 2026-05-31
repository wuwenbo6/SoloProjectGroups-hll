from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Float, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
from config import Config

engine = create_engine(Config.DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class RecognitionRecord(Base):
    __tablename__ = "recognition_records"
    
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), index=True)
    original_path = Column(String(500))
    visualization_path = Column(String(500))
    spice_netlist = Column(Text)
    component_count = Column(Integer)
    wiring_count = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    components = relationship("Component", back_populates="record")
    
    def to_dict(self):
        return {
            "id": self.id,
            "filename": self.filename,
            "original_path": self.original_path,
            "visualization_path": self.visualization_path,
            "spice_netlist": self.spice_netlist,
            "component_count": self.component_count,
            "wiring_count": self.wiring_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "components": [comp.to_dict() for comp in self.components]
        }

class Component(Base):
    __tablename__ = "components"
    
    id = Column(Integer, primary_key=True, index=True)
    record_id = Column(Integer, ForeignKey("recognition_records.id"))
    component_id = Column(Integer)
    type = Column(String(50))
    confidence = Column(Float)
    text = Column(String(255))
    x = Column(Integer)
    y = Column(Integer)
    width = Column(Integer)
    height = Column(Integer)
    area = Column(Integer)
    pin_count = Column(Integer)
    
    record = relationship("RecognitionRecord", back_populates="components")
    
    def to_dict(self):
        return {
            "id": self.id,
            "component_id": self.component_id,
            "type": self.type,
            "confidence": self.confidence,
            "text": self.text,
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
            "area": self.area,
            "pin_count": self.pin_count
        }

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
