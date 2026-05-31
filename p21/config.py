import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    
    UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
    OUTPUT_DIR = os.path.join(BASE_DIR, "outputs")
    STATIC_DIR = os.path.join(BASE_DIR, "static")
    
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./circuit_ocr.db")
    
    PADDLEOCR_LANG = os.getenv("PADDLEOCR_LANG", "en")
    PADDLEOCR_USE_GPU = os.getenv("PADDLEOCR_USE_GPU", "false").lower() == "true"
    
    MIN_COMPONENT_SIZE = 500
    MAX_COMPONENT_SIZE = 50000
    
    WIRE_THICKNESS = 3
    
    SPICE_VOLTAGE = 5.0
    SPICE_GROUND_NODE = "0"
    
    @classmethod
    def ensure_dirs(cls):
        for dir_path in [cls.UPLOAD_DIR, cls.OUTPUT_DIR, cls.STATIC_DIR]:
            os.makedirs(dir_path, exist_ok=True)
