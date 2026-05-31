import os
from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from .config import config

db = SQLAlchemy()

def create_app(config_name='default'):
    app = Flask(__name__, static_folder='../frontend', static_url_path='')
    app.config.from_object(config[config_name])
    
    CORS(app)
    db.init_app(app)
    
    from .api import watershed, simulation, calibration, results, scenario, sensitivity, report
    app.register_blueprint(watershed.bp, url_prefix='/api/watershed')
    app.register_blueprint(simulation.bp, url_prefix='/api/simulation')
    app.register_blueprint(calibration.bp, url_prefix='/api/calibration')
    app.register_blueprint(results.bp, url_prefix='/api/results')
    app.register_blueprint(scenario.bp, url_prefix='/api/scenario')
    app.register_blueprint(sensitivity.bp, url_prefix='/api/sensitivity')
    app.register_blueprint(report.bp, url_prefix='/api/report')
    
    @app.route('/')
    def index():
        return app.send_static_file('index.html')
    
    with app.app_context():
        db.create_all()
    
    return app
