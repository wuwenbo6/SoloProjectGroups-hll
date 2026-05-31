import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./sentinel_processing.db")

UPLOAD_DIR = os.path.join(BASE_DIR, "data", "uploads")
PROCESSED_DIR = os.path.join(BASE_DIR, "data", "processed")
STATIC_DIR = os.path.join(BASE_DIR, "static")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

MAX_FILE_SIZE = 1024 * 1024 * 1024

ALLOWED_EXTENSIONS = {".jp2", ".tif", ".tiff", ".zip"}
