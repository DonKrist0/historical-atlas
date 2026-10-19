from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://chronicle:chronicle@127.0.0.1:5432/chronicle?connect_timeout=5"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    session_hours: int = Field(default=12, ge=1, le=720)
    cookie_secure: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
