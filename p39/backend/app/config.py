from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_topic: str = "probe_data"
    database_url: str = "postgresql://postgres:postgres@localhost:5432/passenger_flow"
    redis_url: str = "redis://localhost:6379/0"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    bayesian_prior_alpha: float = 2.0
    bayesian_prior_beta: float = 5.0
    rssi_threshold: int = -70
    deduplication_window_seconds: int = 300

    class Config:
        env_file = ".env"


settings = Settings()
