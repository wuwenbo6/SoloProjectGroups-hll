import logging
from flask import Flask
from flask_cors import CORS

from .routes import api_bp

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)


def create_app():
    app = Flask(__name__)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    app.register_blueprint(api_bp, url_prefix='/api')

    @app.route('/')
    def index():
        return {
            'name': 'SAS Backplane LED Management API',
            'version': '1.0.0',
            'status': 'running',
            'endpoints': {
                'GET /api/health': 'Health check',
                'GET /api/enclosures': 'List enclosures',
                'GET /api/status': 'Get full system status',
                'GET /api/slots': 'Get all slot status',
                'GET /api/slots/{slot}': 'Get single slot status',
                'POST /api/led/{slot}/{type}/{action}': 'Control LED',
                'GET /api/temperature': 'Get temperature sensors',
            },
        }

    @app.errorhandler(404)
    def not_found(e):
        return {'success': False, 'error': 'Not found'}, 404

    @app.errorhandler(500)
    def internal_error(e):
        logger.exception(f"Internal server error: {e}")
        return {'success': False, 'error': 'Internal server error'}, 500

    return app
