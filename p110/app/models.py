from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class ICDTemplate(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    ied_name = db.Column(db.String(200))
    manufacturer = db.Column(db.String(200))
    desc = db.Column(db.Text)
    xml_content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'ied_name': self.ied_name,
            'manufacturer': self.manufacturer,
            'desc': self.desc,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
