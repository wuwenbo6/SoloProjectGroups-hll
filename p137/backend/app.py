import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from flask_cors import CORS
from config import Config
from models import db
from routes.topology import topology_bp
from routes.simulation import simulation_bp
from routes.flowtable import flowtable_bp
from routes.packet import packet_bp

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    
    CORS(app)
    
    db.init_app(app)
    
    app.register_blueprint(topology_bp)
    app.register_blueprint(simulation_bp)
    app.register_blueprint(flowtable_bp)
    app.register_blueprint(packet_bp)
    
    with app.app_context():
        db.create_all()
    
    return app

if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, port=5001, host='0.0.0.0')
