from datetime import datetime
from .. import db

class CalibrationRun(db.Model):
    __tablename__ = 'calibration_runs'
    
    id = db.Column(db.Integer, primary_key=True)
    watershed_id = db.Column(db.Integer, db.ForeignKey('watersheds.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    algorithm = db.Column(db.String(20), default='SUFI2')
    status = db.Column(db.String(20), default='pending')
    current_iteration = db.Column(db.Integer, default=0)
    total_iterations = db.Column(db.Integer, default=100)
    n_samples = db.Column(db.Integer, default=500)
    objective_function = db.Column(db.String(50), default='NSE')
    target_variable = db.Column(db.String(50), default='streamflow')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)
    error_message = db.Column(db.Text)
    
    parameters = db.relationship('CalibrationParameter', backref='calibration_run', lazy=True, cascade='all, delete-orphan')
    results = db.relationship('CalibrationResult', backref='calibration_run', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'watershed_id': self.watershed_id,
            'name': self.name,
            'algorithm': self.algorithm,
            'status': self.status,
            'current_iteration': self.current_iteration,
            'total_iterations': self.total_iterations,
            'n_samples': self.n_samples,
            'objective_function': self.objective_function,
            'target_variable': self.target_variable,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'error_message': self.error_message
        }

class CalibrationParameter(db.Model):
    __tablename__ = 'calibration_parameters'
    
    id = db.Column(db.Integer, primary_key=True)
    calibration_run_id = db.Column(db.Integer, db.ForeignKey('calibration_runs.id'), nullable=False)
    parameter_name = db.Column(db.String(50), nullable=False)
    min_value = db.Column(db.Float, nullable=False)
    max_value = db.Column(db.Float, nullable=False)
    initial_value = db.Column(db.Float)
    distribution = db.Column(db.String(20), default='uniform')
    change_type = db.Column(db.String(20), default='relative')
    
    def to_dict(self):
        return {
            'id': self.id,
            'calibration_run_id': self.calibration_run_id,
            'parameter_name': self.parameter_name,
            'min_value': self.min_value,
            'max_value': self.max_value,
            'initial_value': self.initial_value,
            'distribution': self.distribution,
            'change_type': self.change_type
        }

class CalibrationResult(db.Model):
    __tablename__ = 'calibration_results'
    
    id = db.Column(db.Integer, primary_key=True)
    calibration_run_id = db.Column(db.Integer, db.ForeignKey('calibration_runs.id'), nullable=False)
    iteration = db.Column(db.Integer, nullable=False)
    parameter_values = db.Column(db.Text)
    objective_value = db.Column(db.Float)
    is_best = db.Column(db.Boolean, default=False)
    p_factor = db.Column(db.Float)
    r_factor = db.Column(db.Float)
    
    def to_dict(self):
        return {
            'id': self.id,
            'calibration_run_id': self.calibration_run_id,
            'iteration': self.iteration,
            'parameter_values': self.parameter_values,
            'objective_value': self.objective_value,
            'is_best': self.is_best,
            'p_factor': self.p_factor,
            'r_factor': self.r_factor
        }
