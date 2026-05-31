from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    influxdb_url: str = "http://localhost:8086"
    influxdb_token: str = "liquid-level-token"
    influxdb_org: str = "liquid-level-org"
    influxdb_bucket: str = "liquid-level-bucket"

    alert_webhook_url: Optional[str] = None
    alert_type: str = "none"

    app_host: str = "0.0.0.0"
    app_port: int = 8000


settings = Settings()
