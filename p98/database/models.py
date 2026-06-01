from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

SQLALCHEMY_DATABASE_URL = "sqlite:///./database/app.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class ImageAnalysis(Base):
    __tablename__ = "image_analysis"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), index=True)
    image_path = Column(String(500))
    beauty_score = Column(Float)
    age_group = Column(String(50))
    age_min = Column(Integer)
    age_max = Column(Integer)
    confidence = Column(Float, default=1.0)
    quality_score = Column(Float, default=1.0)
    pose_score = Column(Float, default=1.0)
    warnings = Column(Text, default="")
    is_profile = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        warnings_list = self.warnings.split("|") if self.warnings else []
        return {
            "id": self.id,
            "filename": self.filename,
            "image_path": self.image_path,
            "beauty_score": round(self.beauty_score, 2),
            "age_group": self.age_group,
            "age_min": self.age_min,
            "age_max": self.age_max,
            "confidence": round(self.confidence, 2) if self.confidence else 0,
            "quality_score": round(self.quality_score, 2) if self.quality_score else 0,
            "pose_score": round(self.pose_score, 2) if self.pose_score else 0,
            "warnings": warnings_list,
            "is_profile": bool(self.is_profile),
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S")
        }


Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
