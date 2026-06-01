from pydantic_settings import BaseSettings
from pathlib import Path

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./rt_plans.db"
    UPLOAD_DIR: Path = Path("./uploads")
    DOSE_GRID_SIZE: tuple = (100, 100, 100)
    DOSE_GRID_SPACING: tuple = (2.0, 2.0, 2.0)

    class Config:
        env_file = ".env"

settings = Settings()

settings.UPLOAD_DIR.mkdir(exist_ok=True)
