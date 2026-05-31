from datetime import datetime
from app import db

class Simulation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(20), default='pending')
    start_time = db.Column(db.DateTime)
    end_time = db.Column(db.DateTime)
    duration = db.Column(db.Float)
    has_lid = db.Column(db.Boolean, default=False)
    
    parameters = db.relationship('SimulationParameter', backref='simulation', lazy=True)
    node_results = db.relationship('NodeResult', backref='simulation', lazy=True)
    link_results = db.relationship('LinkResult', backref='simulation', lazy=True)

class SimulationParameter(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    simulation_id = db.Column(db.Integer, db.ForeignKey('simulation.id'), nullable=False)
    param_name = db.Column(db.String(50), nullable=False)
    param_value = db.Column(db.Float, nullable=False)
    subcatchment_id = db.Column(db.String(50))
    link_id = db.Column(db.String(50))

class NodeResult(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    simulation_id = db.Column(db.Integer, db.ForeignKey('simulation.id'), nullable=False)
    node_id = db.Column(db.String(50), nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False)
    depth = db.Column(db.Float)
    head = db.Column(db.Float)
    volume = db.Column(db.Float)
    lateral_inflow = db.Column(db.Float)
    total_inflow = db.Column(db.Float)
    flooding = db.Column(db.Float)

class LinkResult(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    simulation_id = db.Column(db.Integer, db.ForeignKey('simulation.id'), nullable=False)
    link_id = db.Column(db.String(50), nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False)
    flow = db.Column(db.Float)
    velocity = db.Column(db.Float)
    depth = db.Column(db.Float)
    capacity = db.Column(db.Float)

class NetworkNode(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    node_id = db.Column(db.String(50), unique=True, nullable=False)
    node_type = db.Column(db.String(20))
    x_coord = db.Column(db.Float, nullable=False)
    y_coord = db.Column(db.Float, nullable=False)
    invert_elev = db.Column(db.Float)
    max_depth = db.Column(db.Float)

class NetworkLink(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    link_id = db.Column(db.String(50), unique=True, nullable=False)
    link_type = db.Column(db.String(20))
    from_node = db.Column(db.String(50), nullable=False)
    to_node = db.Column(db.String(50), nullable=False)
    length = db.Column(db.Float)
    roughness = db.Column(db.Float)
    offset1 = db.Column(db.Float)
    offset2 = db.Column(db.Float)

class Subcatchment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    subcatchment_id = db.Column(db.String(50), unique=True, nullable=False)
    outlet = db.Column(db.String(50))
    area = db.Column(db.Float)
    width = db.Column(db.Float)
    slope = db.Column(db.Float)
    curb_length = db.Column(db.Float)
    snow_pack = db.Column(db.String(50))
    perc_imperv = db.Column(db.Float)
    n_imperv = db.Column(db.Float)
    n_perv = db.Column(db.Float)
    dest_imperv = db.Column(db.String(50))
    dest_perv = db.Column(db.String(50))
    polygon_coords = db.Column(db.Text)

class CalibrationRun(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(20), default='pending')
    start_time = db.Column(db.DateTime)
    end_time = db.Column(db.DateTime)
    n_parameters = db.Column(db.Integer)
    n_iterations = db.Column(db.Integer)
    best_fitness = db.Column(db.Float)
    best_parameters = db.Column(db.Text)
    
    parameters = db.relationship('CalibrationParameter', backref='calibration_run', lazy=True)

class CalibrationParameter(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    calibration_id = db.Column(db.Integer, db.ForeignKey('calibration_run.id'), nullable=False)
    iteration = db.Column(db.Integer, nullable=False)
    param_name = db.Column(db.String(50), nullable=False)
    param_value = db.Column(db.Float, nullable=False)
    fitness = db.Column(db.Float, nullable=False)

class LIDScenario(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    lid_type = db.Column(db.String(50))
    subcatchment_id = db.Column(db.String(50))
    area_ratio = db.Column(db.Float)
    baseline_sim_id = db.Column(db.Integer, db.ForeignKey('simulation.id'))
    lid_sim_id = db.Column(db.Integer, db.ForeignKey('simulation.id'))
    flooding_reduction = db.Column(db.Float)
    flow_reduction = db.Column(db.Float)
