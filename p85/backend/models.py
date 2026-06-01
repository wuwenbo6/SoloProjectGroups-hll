from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()


class ProtocolTemplate(Base):
    __tablename__ = 'protocol_templates'

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False, unique=True)
    description = Column(Text)
    lua_script = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    fields = relationship('ProtocolField', backref='template', lazy=True, cascade='all, delete-orphan')


class ProtocolField(Base):
    __tablename__ = 'protocol_fields'

    id = Column(Integer, primary_key=True)
    template_id = Column(Integer, ForeignKey('protocol_templates.id'), nullable=False)
    name = Column(String(100), nullable=False)
    field_type = Column(String(50), nullable=False)
    offset = Column(Integer)
    length = Column(Integer)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class PcapFile(Base):
    __tablename__ = 'pcap_files'

    id = Column(Integer, primary_key=True)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    packet_count = Column(Integer, default=0)
    protocol = Column(String(100))

    packets = relationship('ParsedPacket', backref='pcap_file', lazy=True, cascade='all, delete-orphan')


class ParsedPacket(Base):
    __tablename__ = 'parsed_packets'

    id = Column(Integer, primary_key=True)
    pcap_id = Column(Integer, ForeignKey('pcap_files.id'), nullable=False)
    packet_number = Column(Integer, nullable=False)
    timestamp = Column(String(50))
    src_ip = Column(String(50))
    dst_ip = Column(String(50))
    protocol = Column(String(50))
    length = Column(Integer)
    raw_data = Column(Text)
    parsed_fields = Column(Text)
