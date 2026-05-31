from datetime import datetime
from .. import db

class Simulation(db.Model):
    __tablename__ = 'simulations'
    
    id = db.Column(db.Integer, primary_key=True)
    watershed_id = db.Column(db.Integer, db.ForeignKey('watersheds.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    status = db.Column(db.String(20), default='pending')
    start_date = db.Column(db.Date)
    end_date = db.Column(db.Date)
    output_interval = db.Column(db.String(20), default='daily')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)
    error_message = db.Column(db.Text)
    
    parameters = db.relationship('SimulationParameter', backref='simulation', lazy=True, cascade='all, delete-orphan')
    results = db.relationship('SimulationResult', backref='simulation', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'watershed_id': self.watershed_id,
            'name': self.name,
            'description': self.description,
            'status': self.status,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'output_interval': self.output_interval,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'error_message': self.error_message
        }

class SimulationParameter(db.Model):
    __tablename__ = 'simulation_parameters'
    
    id = db.Column(db.Integer, primary_key=True)
    simulation_id = db.Column(db.Integer, db.ForeignKey('simulations.id'), nullable=False)
    parameter_name = db.Column(db.String(50), nullable=False)
    parameter_value = db.Column(db.Float, nullable=False)
    subbasin_number = db.Column(db.Integer)
    change_type = db.Column(db.String(20), default='absolute')
    
    def to_dict(self):
        return {
            'id': self.id,
            'simulation_id': self.simulation_id,
            'parameter_name': self.parameter_name,
            'parameter_value': self.parameter_value,
            'subbasin_number': self.subbasin_number,
            'change_type': self.change_type
        }

class SimulationResult(db.Model):
    __tablename__ = 'simulation_results'
    
    id = db.Column(db.Integer, primary_key=True)
    simulation_id = db.Column(db.Integer, db.ForeignKey('simulations.id'), nullable=False)
    subbasin_number = db.Column(db.Integer)
    date = db.Column(db.Date, nullable=False)
    streamflow = db.Column(db.Float)
    sediment_yield = db.Column(db.Float)
    nitrate_load = db.Column(db.Float)
    phosphorus_load = db.Column(db.Float)
    total_nitrogen = db.Column(db.Float)
    total_phosphorus = db.Column(db.Float)
    
    def to_dict(self):
        return {
            'id': self.id,
            'simulation_id': self.simulation_id,
            'subbasin_number': self.subbasin_number,
            'date': self.date.isoformat() if self.date else None,
            'streamflow': self.streamflow,
            'sediment_yield': self.sediment_yield,
            'nitrate_load': self.nitrate_load,
            'phosphorus_load': self.phosphorus_load,
            'total_nitrogen': self.total_nitrogen,
            'total_phosphorus': self.total_phosphorus
        }
