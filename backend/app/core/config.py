"""Application configuration via environment variables.

All settings are loaded from environment variables (or a .env file in development).
Uses pydantic-settings for validation and type safety.
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings.

    All values come from environment variables. See `.env.example` for the
    full list of supported variables.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Operational
    environment: Literal["development", "staging", "production"] = "development"
    sentry_dsn: str | None = None

    # Database
    database_url: str = Field(
        default="postgresql+asyncpg://monitor:monitor@postgres:5432/monitor_parlamentari",
        description="Async SQLAlchemy DSN.",
    )

    # Redis (used by RQ workers)
    redis_url: str = "redis://redis:6379/0"

    # Backend HTTP
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    backend_log_level: str = "INFO"
    backend_cors_origins: str = "http://localhost:3000"

    @field_validator("backend_cors_origins")
    @classmethod
    def split_cors_origins(cls, v: str) -> str:
        """Keep as comma-separated string here; we split in main.py when registering middleware."""
        return v

    @property
    def cors_origins_list(self) -> list[str]:
        """List form of CORS origins."""
        return [o.strip() for o in self.backend_cors_origins.split(",") if o.strip()]

    # Auth (admin only — there is no public user system)
    secret_key: str = "change-me-in-production-please"
    access_token_expire_minutes: int = 60 * 8  # 8 hours

    # LLM provider for topic classification. ``keyword`` runs locally with
    # no API key — used as a fallback while we wire a real LLM in.
    llm_provider: Literal["mistral", "anthropic", "local_qwen", "keyword"] = "mistral"
    mistral_api_key: str | None = None
    anthropic_api_key: str | None = None
    qwen_base_url: str = "http://localhost:11434"

    # Email (alerts and double opt-in)
    email_provider: Literal["smtp", "mailgun", "resend", "listmonk"] = "smtp"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str = "noreply@example.org"
    smtp_from_name: str = "Monitor Parlamentari"

    # Listmonk newsletter integration
    listmonk_base_url: str | None = None
    listmonk_api_user: str | None = None
    listmonk_api_key: str | None = None
    listmonk_list_id: int | None = None

    @field_validator("listmonk_list_id", mode="before")
    @classmethod
    def empty_str_as_none_int(cls, v: object) -> object:
        # .env.example ships with `LISTMONK_LIST_ID=` (empty), which pydantic
        # would otherwise refuse to coerce into int|None. Treat blank as unset.
        if isinstance(v, str) and v.strip() == "":
            return None
        return v

    # External data sources.
    # The Congreso open data portal serves listing pages under /es/opendata/<section>
    # and static files under /webpublica/opendata/<section>/. We keep the host root
    # here and join the appropriate paths in the client.
    congreso_opendata_base_url: str = "https://www.congreso.es"
    congreso_user_agent: str = "monitor-parlamentari/0.1 (+https://example.org)"

    # Web Push (VAPID). Both keys are base64url-encoded raw EC P-256
    # parameters as required by RFC 8292. ``vapid_public_key`` is also
    # surfaced via /push/public-key for the browser. The ``vapid_subject``
    # must be a mailto: or https: URL identifying the application server
    # to the push service (see RFC 8292 §2.1).
    vapid_public_key: str | None = None
    vapid_private_key: str | None = None
    vapid_subject: str = "mailto:noreply@monitorparlamentari.cat"

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached singleton instance of Settings."""
    return Settings()
