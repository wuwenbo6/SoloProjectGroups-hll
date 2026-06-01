from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    APP_NAME: str = "Modbus Fuzzer API"
    DEBUG: bool = True
    
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    DATABASE_URL: str = f"sqlite:///{BASE_DIR}/data/modbus_fuzzer.db"
    
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    CORS_ORIGINS: list = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    
    SOCKETIO_CORS_ORIGINS: str = "*"
    
    DEFAULT_MODBUS_PORT: int = 502
    DEFAULT_SLAVE_ID: int = 1
    DEFAULT_TIMEOUT: int = 5000
    
    MAX_PACKET_RECORDS: int = 10000

    class Config:
        env_file = ".env"


settings = Settings()
