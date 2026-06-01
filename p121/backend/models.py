from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class IFModel(db.Model):
    __tablename__ = 'ifmodels'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(256), nullable=False)
    filename = db.Column(db.String(512), nullable=False)
    file_path = db.Column(db.String(1024), nullable=False)
    element_count = db.Column(db.Integer, default=0)
    vertex_count = db.Column(db.Integer, default=0)
    face_count = db.Column(db.Integer, default=0)
    status = db.Column(db.String(64), default='pending')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    elements = db.relationship('Element', backref='model', cascade='all, delete-orphan', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'filename': self.filename,
            'element_count': self.element_count,
            'vertex_count': self.vertex_count,
            'face_count': self.face_count,
            'status': self.status,
            'created_at': self.created_at.isoformat(),
        }


class Element(db.Model):
    __tablename__ = 'elements'

    id = db.Column(db.Integer, primary_key=True)
    model_id = db.Column(db.Integer, db.ForeignKey('ifmodels.id'), nullable=False)
    ifc_id = db.Column(db.String(128), nullable=False)
    ifc_type = db.Column(db.String(128), nullable=False)
    name = db.Column(db.String(256))
    vertices_json = db.Column(db.Text, nullable=False)
    faces_json = db.Column(db.Text, nullable=False)
    colors_json = db.Column(db.Text)
    aabb_min = db.Column(db.String(128))
    aabb_max = db.Column(db.String(128))
    merged = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'ifc_id': self.ifc_id,
            'ifc_type': self.ifc_type,
            'name': self.name,
            'aabb_min': self.aabb_min,
            'aabb_max': self.aabb_max,
            'merged': self.merged,
        }

    def to_detail_dict(self):
        return {
            'id': self.id,
            'ifc_id': self.ifc_id,
            'ifc_type': self.ifc_type,
            'name': self.name,
            'vertices': self.vertices_json,
            'faces': self.faces_json,
            'colors': self.colors_json,
            'aabb_min': self.aabb_min,
            'aabb_max': self.aabb_max,
            'merged': self.merged,
        }
