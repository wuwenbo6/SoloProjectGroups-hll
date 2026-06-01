from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core import Base


class Target(Base):
    __tablename__ = "targets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    ip_address = Column(String(45), nullable=False)
    port = Column(Integer, nullable=False, default=502)
    slave_id = Column(Integer, nullable=False, default=1)
    timeout = Column(Integer, nullable=False, default=5000)
    protocol = Column(String(20), nullable=False, default="modbus")
    created_at = Column(DateTime, default=datetime.utcnow)

    tasks = relationship("TestTask", back_populates="target", cascade="all, delete-orphan")


class TestTask(Base):
    __tablename__ = "test_tasks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    target_id = Column(Integer, ForeignKey("targets.id"), nullable=False)
    status = Column(String(20), nullable=False, default="idle")
    strategies_json = Column(Text)
    packet_count = Column(Integer, default=0)
    crash_count = Column(Integer, default=0)
    start_time = Column(DateTime)
    end_time = Column(DateTime)

    target = relationship("Target", back_populates="tasks")
    packets = relationship("PacketRecord", back_populates="task", cascade="all, delete-orphan")
    crashes = relationship("CrashRecord", back_populates="task", cascade="all, delete-orphan")


class PacketRecord(Base):
    __tablename__ = "packet_records"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("test_tasks.id"), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    direction = Column(String(10), nullable=False)
    hex_data = Column(Text, nullable=False)
    function_code = Column(Integer)
    response_time_ms = Column(Integer)
    is_error = Column(Boolean, default=False)
    error_message = Column(Text)

    task = relationship("TestTask", back_populates="packets")


class CrashRecord(Base):
    __tablename__ = "crash_records"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("test_tasks.id"), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    packet_hex = Column(Text, nullable=False)
    description = Column(Text)
    severity = Column(String(20), default="medium")
    reproducible = Column(Boolean, default=False)
    notes = Column(Text)

    task = relationship("TestTask", back_populates="crashes")


class TestCase(Base):
    __tablename__ = "test_cases"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    strategy_type = Column(String(50), nullable=False)
    params_json = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


all_models = [Target, TestTask, PacketRecord, CrashRecord, TestCase]
