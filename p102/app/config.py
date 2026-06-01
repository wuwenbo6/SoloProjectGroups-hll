try:
    from pydantic_settings import BaseSettings
except ImportError:
    from pydantic import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./tracking.db"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    STREAM_TIMEOUT: int = 30
    MAX_STREAMS: int = 10
    WEBRTC_STUN_SERVER: str = "stun:stun.l.google.com:19302"
    
    class Config:
        env_file = ".env"


settings = Settings()
