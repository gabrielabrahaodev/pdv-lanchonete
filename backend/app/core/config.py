"""Configurações centrais do backend (lidas de variáveis de ambiente / .env)."""
from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    project_id: str = "pdv-lanchonete-1fa79"
    service_account_path: Path = Path(__file__).resolve().parents[3] / "scripts" / "service-account.json"
    service_account_json: str | None = None
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    timezone: str = "America/Sao_Paulo"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
