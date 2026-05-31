import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
    MAX_CONTENT_LENGTH = 100 * 1024 * 1024
    ALLOWED_EXTENSIONS = {'pcd', 'bin'}
    
    DATABASE_PATH = os.path.join(BASE_DIR, 'detection.db')
    
    MODEL_PATH = os.path.join(BASE_DIR, 'ml', 'models')
    
    DETECTION_CLASSES = ['Car', 'Pedestrian']
    CONFIDENCE_THRESHOLD = 0.5
    NMS_THRESHOLD = 0.3
    
    CORS_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000']
