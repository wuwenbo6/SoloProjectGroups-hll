from datetime import datetime
from .. import db

class Scenario(db.Model):
    __tablename__ = 'scenarios'
    
    id = db.Column(db.Integer, primary_key=True)
    watershed_id = db.Column(db.Integer, db.ForeignKey('watersheds.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    scenario_type = db.Column(db.String(50), default='custom')
    management_measures = db.Column(db.Text)
    is_baseline = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    parameters = db.relationship('ScenarioParameter', backref='scenario', lazy=True, cascade='all, delete-orphan')
    simulations = db.relationship('Simulation', secondary='scenario_simulations', backref='scenarios')
    
    def to_dict(self):
        return {
            'id': self.id,
            'watershed_id': self.watershed_id,
            'name': self.name,
            'description': self.description,
            'scenario_type': self.scenario_type,
            'management_measures': self.management_measures,
            'is_baseline': self.is_baseline,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'simulations_count': len(self.simulations)
        }

class ScenarioParameter(db.Model):
    __tablename__ = 'scenario_parameters'
    
    id = db.Column(db.Integer, primary_key=True)
    scenario_id = db.Column(db.Integer, db.ForeignKey('scenarios.id'), nullable=False)
    parameter_name = db.Column(db.String(50), nullable=False)
    parameter_value = db.Column(db.Float, nullable=False)
    change_type = db.Column(db.String(20), default='absolute')
    description = db.Column(db.String(200))
    
    def to_dict(self):
        return {
            'id': self.id,
            'scenario_id': self.scenario_id,
            'parameter_name': self.parameter_name,
            'parameter_value': self.parameter_value,
            'change_type': self.change_type,
            'description': self.description
        }

scenario_simulations = db.Table('scenario_simulations',
    db.Column('scenario_id', db.Integer, db.ForeignKey('scenarios.id'), primary_key=True),
    db.Column('simulation_id', db.Integer, db.ForeignKey('simulations.id'), primary_key=True)
)

class SensitivityAnalysis(db.Model):
    __tablename__ = 'sensitivity_analyses'
    
    id = db.Column(db.Integer, primary_key=True)
    watershed_id = db.Column(db.Integer, db.ForeignKey('watersheds.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    method = db.Column(db.String(20), default='morris')
    status = db.Column(db.String(20), default='pending')
    target_variable = db.Column(db.String(50), default='streamflow')
    n_samples = db.Column(db.Integer, default=100)
    n_levels = db.Column(db.Integer, default=4)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)
    error_message = db.Column(db.Text)
    
    parameters = db.relationship('SensitivityParameter', backref='analysis', lazy=True, cascade='all, delete-orphan')
    results = db.relationship('SensitivityResult', backref='analysis', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'watershed_id': self.watershed_id,
            'name': self.name,
            'method': self.method,
            'status': self.status,
            'target_variable': self.target_variable,
            'n_samples': self.n_samples,
            'n_levels': self.n_levels,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'error_message': self.error_message
        }

class SensitivityParameter(db.Model):
    __tablename__ = 'sensitivity_parameters'
    
    id = db.Column(db.Integer, primary_key=True)
    analysis_id = db.Column(db.Integer, db.ForeignKey('sensitivity_analyses.id'), nullable=False)
    parameter_name = db.Column(db.String(50), nullable=False)
    min_value = db.Column(db.Float, nullable=False)
    max_value = db.Column(db.Float, nullable=False)
    
    def to_dict(self):
        return {
            'id': self.id,
            'analysis_id': self.analysis_id,
            'parameter_name': self.parameter_name,
            'min_value': self.min_value,
            'max_value': self.max_value
        }

class SensitivityResult(db.Model):
    __tablename__ = 'sensitivity_results'
    
    id = db.Column(db.Integer, primary_key=True)
    analysis_id = db.Column(db.Integer, db.ForeignKey('sensitivity_analyses.id'), nullable=False)
    parameter_name = db.Column(db.String(50), nullable=False)
    mu_star = db.Column(db.Float)
    sigma = db.Column(db.Float)
    mu = db.Column(db.Float)
    rank = db.Column(db.Integer)
    
    def to_dict(self):
        return {
            'id': self.id,
            'analysis_id': self.analysis_id,
            'parameter_name': self.parameter_name,
            'mu_star': self.mu_star,
            'sigma': self.sigma,
            'mu': self.mu,
            'rank': self.rank
        }
