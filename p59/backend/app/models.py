from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Time
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    wechat_openid = Column(String, unique=True, index=True)
    phone = Column(String)
    tts_enabled = Column(Boolean, default=False)
    tts_voice = Column(String, default="default")
    created_at = Column(DateTime, default=datetime.utcnow)
    
    pillboxes = relationship("Pillbox", back_populates="user")
    medication_plans = relationship("MedicationPlan", back_populates="user")
    medication_records = relationship("MedicationRecord", back_populates="user")

class Pillbox(Base):
    __tablename__ = "pillboxes"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, unique=True, index=True)
    name = Column(String)
    user_id = Column(Integer, ForeignKey("users.id"))
    is_online = Column(Boolean, default=False)
    last_heartbeat = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="pillboxes")
    medication_plans = relationship("MedicationPlan", back_populates="pillbox")
    sensor_logs = relationship("SensorLog", back_populates="pillbox")

class MedicationPlan(Base):
    __tablename__ = "medication_plans"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    pillbox_id = Column(Integer, ForeignKey("pillboxes.id"))
    medicine_name = Column(String)
    dosage = Column(String)
    pills_per_dose = Column(Integer, default=1)
    total_pills = Column(Integer, default=0)
    remaining_pills = Column(Integer, default=0)
    refill_threshold = Column(Integer, default=10)
    low_stock_notified = Column(Boolean, default=False)
    take_time = Column(Time)
    days_of_week = Column(String)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="medication_plans")
    pillbox = relationship("Pillbox", back_populates="medication_plans")
    medication_records = relationship("MedicationRecord", back_populates="medication_plan")
    refills = relationship("MedicationRefill", back_populates="medication_plan")

class MedicationRefill(Base):
    __tablename__ = "medication_refills"
    
    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("medication_plans.id"))
    previous_count = Column(Integer)
    added_count = Column(Integer)
    new_count = Column(Integer)
    refill_date = Column(DateTime, default=datetime.utcnow)
    note = Column(String, nullable=True)
    
    medication_plan = relationship("MedicationPlan", back_populates="refills")

class MedicationRecord(Base):
    __tablename__ = "medication_records"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    plan_id = Column(Integer, ForeignKey("medication_plans.id"))
    pillbox_id = Column(Integer, ForeignKey("pillboxes.id"))
    scheduled_time = Column(DateTime)
    actual_time = Column(DateTime)
    is_taken = Column(Boolean, default=False)
    is_notified = Column(Boolean, default=False)
    tts_played = Column(Boolean, default=False)
    pills_taken = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="medication_records")
    medication_plan = relationship("MedicationPlan", back_populates="medication_records")

class SensorLog(Base):
    __tablename__ = "sensor_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    pillbox_id = Column(Integer, ForeignKey("pillboxes.id"))
    sensor_type = Column(String)
    value = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    pillbox = relationship("Pillbox", back_populates="sensor_logs")
