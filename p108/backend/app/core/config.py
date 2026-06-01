from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    API_V1_STR: str = "/api"
    PROJECT_NAME: str = "PhaseField Simulation API"
    
    DATABASE_URL: str = "sqlite:///./phasefield.db"
    
    CORS_ORIGINS: list = ["http://localhost:5173", "http://localhost:3000"]
    
    class Config:
        case_sensitive = True


settings = Settings()
