import os

class Settings:
    APP_NAME: str = "License Plate Recognition API"
    DEBUG: bool = True
    UPLOAD_DIR: str = "static/uploads"
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024
    
    DATABASE_URL: str = "sqlite:///./license_plate.db"
    
    YOLO_MODEL_PATH: str = "backend/models/yolov5_lp.pt"
    AOD_MODEL_PATH: str = "backend/models/aod_net.pth"
    
    CONFIDENCE_THRESHOLD: float = 0.5
    PLATE_COLORS: list = ["blue", "yellow", "green"]

settings = Settings()

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
