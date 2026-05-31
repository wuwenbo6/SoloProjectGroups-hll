import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
    BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    DB_FILE = os.path.join(os.getcwd(), 'swat_model.db')
    SQLALCHEMY_DATABASE_URI = f'sqlite:///{DB_FILE}'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), '..', 'data', 'uploads')
    SWAT_PROJECTS_FOLDER = os.path.join(os.path.dirname(__file__), '..', 'data', 'swat_projects')
    MAX_CONTENT_LENGTH = 500 * 1024 * 1024
    
    CELERY_BROKER_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
    CELERY_RESULT_BACKEND = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
    
    ALLOWED_EXTENSIONS = {'zip', 'txt', 'csv', 'shp', 'shx', 'dbf', 'prj'}
    
    SUFI2_DEFAULT_ITERATIONS = 100
    SUFI2_DEFAULT_SAMPLES = 500

class DevelopmentConfig(Config):
    DEBUG = True

class ProductionConfig(Config):
    DEBUG = False

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
