from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment / .env file."""

    database_url: str = "postgresql+asyncpg://exam:exam@localhost:5432/examstudio"
    # Comma-separated list of allowed CORS origins (kept as a plain string so it
    # can be set as a simple env var; use `cors_origins_list` to consume it).
    cors_origins: str = "http://localhost:4200"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
