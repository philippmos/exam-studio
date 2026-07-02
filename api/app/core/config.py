"""Application configuration, loaded from the environment / ``.env`` file.

Access settings through :func:`get_settings` (cached) rather than a module-level
singleton, so tests can override the environment and clear the cache, and so
import order never forces settings to be read too early.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration."""

    database_url: str = "postgresql+asyncpg://exam:exam@localhost:5432/examstudio"
    # Comma-separated list of allowed CORS origins (kept as a plain string so it
    # can be set as a simple env var; use `cors_origins_list` to consume it).
    cors_origins: str = "http://localhost:4200"

    # When true the in-browser GraphQL IDE is served and introspection stays on.
    # Off by default so neither is exposed in production.
    debug: bool = False

    # --- Auth0 / OAuth2 resource-server configuration -------------------------
    #   AUTH0_DOMAIN    e.g. "your-tenant.eu.auth0.com" (no scheme, no slash)
    #   AUTH0_AUDIENCE  the API identifier, e.g. "https://api.exam-studio"
    auth0_domain: str = ""
    auth0_audience: str = ""
    # Allowed signing algorithms for the *access token* (Auth0 uses RS256).
    auth0_algorithms: str = "RS256"
    # Namespace for custom (profile) claims read off the access token, e.g.
    # "https://exam-studio/email". Matches the Auth0 Action.
    auth0_namespace: str = "https://exam-studio/"
    # Allowed clock skew (seconds) when validating token time claims.
    auth0_leeway_seconds: int = 60

    # --- Observability --------------------------------------------------------
    # Logical service name reported in logs, traces and metrics.
    service_name: str = "exam-studio-api"
    # Deployment environment tag (dev / staging / production).
    environment: str = "development"
    log_level: str = "INFO"
    # Emit JSON logs (production) vs. a coloured console renderer (local dev).
    log_json: bool = True
    # OTLP/HTTP endpoint for traces, e.g. "http://otel-collector:4318". Tracing
    # is a no-op while this is empty, so the app runs fine without a collector.
    otel_exporter_otlp_endpoint: str = ""
    # Expose Prometheus metrics at /metrics.
    metrics_enabled: bool = True
    # Sentry DSN; error reporting stays inert while this is empty.
    sentry_dsn: str = ""

    # --- GraphQL hardening ----------------------------------------------------
    # Reject queries nested deeper than this (a cheap DoS guard).
    graphql_max_depth: int = 15

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        # The API shares the repo-root .env with the db/client compose services,
        # so ignore keys that are not ours instead of failing to start.
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def auth0_algorithms_list(self) -> list[str]:
        return [a.strip() for a in self.auth0_algorithms.split(",") if a.strip()]

    @property
    def auth0_issuer(self) -> str:
        """The expected `iss` claim (Auth0 issues tokens with a trailing slash)."""
        return f"https://{self.auth0_domain}/"

    @property
    def auth0_jwks_url(self) -> str:
        """Where the access-token signing keys are published."""
        return f"https://{self.auth0_domain}/.well-known/jwks.json"

    @property
    def auth_configured(self) -> bool:
        """Whether the mandatory Auth0 settings have been provided."""
        return bool(self.auth0_domain and self.auth0_audience)


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings, read once and cached."""
    return Settings()
