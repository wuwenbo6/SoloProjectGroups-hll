from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    cluster_name: str = "ceph"
    user_name: str = "client.admin"
    conf_path: str = "/etc/ceph/ceph.conf"
    keyring_path: Optional[str] = None
    default_pool: str = "rbd"
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    class Config:
        env_prefix = "ceph_"
        env_file = ".env"


settings = Settings()
