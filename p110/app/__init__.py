from flask import Flask
from flask_cors import CORS
from app.models import db

def create_app():
    app = Flask(__name__, static_folder='../static', template_folder='../templates')
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///icd_templates.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
    
    CORS(app)
    db.init_app(app)
    
    with app.app_context():
        db.create_all()
    
    from app.routes import main_bp
    app.register_blueprint(main_bp)
    
    return app
