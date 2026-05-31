from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
import os

db = SQLAlchemy()

def create_app():
    app = Flask(__name__, 
                static_folder='../../frontend/static',
                template_folder='../../frontend/templates')
    
    app.config['SECRET_KEY'] = 'dev-secret-key'
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///../data/swmm_simulation.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['UPLOAD_FOLDER'] = '../data/swmm'
    
    CORS(app)
    db.init_app(app)
    
    from app.routes import main_bp
    app.register_blueprint(main_bp)
    
    with app.app_context():
        db.create_all()
    
    return app
