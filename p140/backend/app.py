import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

from api.dicom_routes import dicom_bp
from api.export_routes import export_bp

app = Flask(__name__, static_folder='exports')
CORS(app, resources={
    r"/api/*": {
        "origins": ["http://localhost:5173", "http://localhost:3000"],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024

app.register_blueprint(dicom_bp, url_prefix='/api/dicom')
app.register_blueprint(export_bp, url_prefix='/api/export')


@app.route('/api/health', methods=['GET'])
def health_check():
    return {
        'status': 'ok',
        'service': 'DICOM Volume Renderer API',
        'version': '1.0.0'
    }


@app.route('/api/exports/<path:filename>')
def serve_export(filename):
    exports_dir = os.path.join(os.path.dirname(__file__), 'exports')
    return send_from_directory(exports_dir, filename)


@app.errorhandler(404)
def not_found(error):
    return {'error': 'Not found'}, 404


@app.errorhandler(413)
def too_large(error):
    return {'error': 'File too large. Maximum size is 500MB'}, 413


@app.errorhandler(500)
def internal_error(error):
    return {'error': 'Internal server error'}, 500


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('DEBUG', 'False').lower() == 'true'
    print(f"Starting DICOM Volume Renderer API server on port {port}")
    print(f"Debug mode: {debug}")
    app.run(host='0.0.0.0', port=port, debug=debug)
