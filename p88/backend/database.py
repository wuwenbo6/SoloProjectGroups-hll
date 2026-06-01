from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import json

DATABASE_URL = 'sqlite:///eit_database.db'

engine = create_engine(DATABASE_URL, connect_args={'check_same_thread': False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class EITMeasurement(Base):
    __tablename__ = 'eit_measurements'
    
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    measurement_name = Column(String(255))
    description = Column(Text, nullable=True)
    
    num_electrodes = Column(Integer, default=16)
    reconstruction_method = Column(String(50))
    
    voltage_baseline = Column(Text)
    voltage_measured = Column(Text)
    
    reconstruction_data = Column(Text)
    volume_data = Column(Text)
    
    anomaly_params = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    
    def set_voltage_data(self, v0, v1):
        self.voltage_baseline = json.dumps(v0.tolist() if hasattr(v0, 'tolist') else list(v0))
        self.voltage_measured = json.dumps(v1.tolist() if hasattr(v1, 'tolist') else list(v1))
    
    def get_voltage_data(self):
        v0 = json.loads(self.voltage_baseline) if self.voltage_baseline else []
        v1 = json.loads(self.voltage_measured) if self.voltage_measured else []
        return v0, v1
    
    def set_reconstruction_data(self, data):
        self.reconstruction_data = json.dumps(data.tolist() if hasattr(data, 'tolist') else data)
    
    def get_reconstruction_data(self):
        return json.loads(self.reconstruction_data) if self.reconstruction_data else []
    
    def set_volume_data(self, data):
        self.volume_data = json.dumps(data)
    
    def get_volume_data(self):
        return json.loads(self.volume_data) if self.volume_data else None
    
    def set_anomaly_params(self, params):
        self.anomaly_params = json.dumps(params)
    
    def get_anomaly_params(self):
        return json.loads(self.anomaly_params) if self.anomaly_params else None


class EITConfig(Base):
    __tablename__ = 'eit_configs'
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True)
    config_type = Column(String(50))
    parameters = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def set_parameters(self, params):
        self.parameters = json.dumps(params)
    
    def get_parameters(self):
        return json.loads(self.parameters) if self.parameters else {}


def init_db():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def save_measurement(db, measurement_data):
    measurement = EITMeasurement(
        measurement_name=measurement_data.get('name', f'Measurement {datetime.utcnow()}'),
        description=measurement_data.get('description', ''),
        num_electrodes=measurement_data.get('num_electrodes', 16),
        reconstruction_method=measurement_data.get('method', 'greit'),
        notes=measurement_data.get('notes', '')
    )
    
    if 'v0' in measurement_data and 'v1' in measurement_data:
        measurement.set_voltage_data(measurement_data['v0'], measurement_data['v1'])
    
    if 'reconstruction' in measurement_data:
        measurement.set_reconstruction_data(measurement_data['reconstruction'])
    
    if 'volume' in measurement_data:
        measurement.set_volume_data(measurement_data['volume'])
    
    if 'anomaly_params' in measurement_data:
        measurement.set_anomaly_params(measurement_data['anomaly_params'])
    
    db.add(measurement)
    db.commit()
    db.refresh(measurement)
    return measurement


def get_all_measurements(db, skip=0, limit=100):
    return db.query(EITMeasurement).order_by(EITMeasurement.timestamp.desc()).offset(skip).limit(limit).all()


def get_measurement_by_id(db, measurement_id):
    return db.query(EITMeasurement).filter(EITMeasurement.id == measurement_id).first()


def delete_measurement(db, measurement_id):
    measurement = db.query(EITMeasurement).filter(EITMeasurement.id == measurement_id).first()
    if measurement:
        db.delete(measurement)
        db.commit()
        return True
    return False


def measurement_to_dict(measurement):
    return {
        'id': measurement.id,
        'timestamp': measurement.timestamp.isoformat(),
        'name': measurement.measurement_name,
        'description': measurement.description,
        'num_electrodes': measurement.num_electrodes,
        'method': measurement.reconstruction_method,
        'notes': measurement.notes,
        'anomaly_params': measurement.get_anomaly_params()
    }
