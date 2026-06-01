from app import db
from datetime import datetime

class Simulation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)
    geometry_type = db.Column(db.String(20), nullable=False)
    geometry_params = db.Column(db.JSON, nullable=False)
    boundary_conditions = db.Column(db.JSON, nullable=False)
    material_properties = db.Column(db.JSON, nullable=False)
    mesh_refinement = db.Column(db.Integer, default=1)
    status = db.Column(db.String(20), default='pending')
    result_path = db.Column(db.String(200), nullable=True)
    vtu_path = db.Column(db.String(200), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'geometry_type': self.geometry_type,
            'geometry_params': self.geometry_params,
            'boundary_conditions': self.boundary_conditions,
            'material_properties': self.material_properties,
            'mesh_refinement': self.mesh_refinement,
            'status': self.status,
            'result_path': self.result_path,
            'vtu_path': self.vtu_path,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
