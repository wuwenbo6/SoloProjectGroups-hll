from flask import Flask
from flask_cors import CORS
from config import Config
from database import init_db
from api.routes import api_bp
import os

app = Flask(__name__)
app.config.from_object(Config)

CORS(app, resources={r"/api/*": {"origins": Config.CORS_ORIGINS}})

app.register_blueprint(api_bp, url_prefix='/api')

@app.route('/')
def index():
    return {
        'name': 'PointCloud Detection API',
        'version': '1.0.0',
        'endpoints': {
            'upload': '/api/upload',
            'files': '/api/files',
            'pointcloud': '/api/pointcloud/<file_id>',
            'detect': '/api/detect/<file_id>',
            'detections': '/api/detections',
            'metrics': '/api/metrics/map',
            'health': '/api/health'
        }
    }

if __name__ == '__main__':
    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
    os.makedirs(Config.MODEL_PATH, exist_ok=True)
    
    init_db()
    
    print("=" * 60)
    print("PointCloud Detection API Server")
    print("=" * 60)
    print(f"Upload folder: {Config.UPLOAD_FOLDER}")
    print(f"Database: {Config.DATABASE_PATH}")
    print(f"Allowed extensions: {Config.ALLOWED_EXTENSIONS}")
    print("=" * 60)
    
    app.run(host='0.0.0.0', port=5000, debug=True)
