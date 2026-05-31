from datetime import datetime
from .. import db

class Watershed(db.Model):
    __tablename__ = 'watersheds'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    project_path = db.Column(db.String(500))
    area = db.Column(db.Float)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    subbasins = db.relationship('Subbasin', backref='watershed', lazy=True, cascade='all, delete-orphan')
    simulations = db.relationship('Simulation', backref='watershed', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'area': self.area,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'subbasins_count': len(self.subbasins)
        }

class Subbasin(db.Model):
    __tablename__ = 'subbasins'
    
    id = db.Column(db.Integer, primary_key=True)
    watershed_id = db.Column(db.Integer, db.ForeignKey('watersheds.id'), nullable=False)
    subbasin_number = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(100))
    area = db.Column(db.Float)
    geometry = db.Column(db.Text)
    centroid_lat = db.Column(db.Float)
    centroid_lon = db.Column(db.Float)
    
    def to_dict(self):
        return {
            'id': self.id,
            'watershed_id': self.watershed_id,
            'subbasin_number': self.subbasin_number,
            'name': self.name,
            'area': self.area,
            'centroid_lat': self.centroid_lat,
            'centroid_lon': self.centroid_lon,
            'geometry': self.geometry
        }
