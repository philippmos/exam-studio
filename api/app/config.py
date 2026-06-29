from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment / .env file."""

    database_url: str = "postgresql+asyncpg://exam:exam@localhost:5432/examstudio"
    # Comma-separated list of allowed CORS origins (kept as a plain string so it
    # can be set as a simple env var; use `cors_origins_list` to consume it).
    cors_origins: str = "http://localhost:4200"

    # When true the in-browser GraphQL IDE is served. Off by default so the
    # IDE (which cannot attach an access token) is not exposed in production.
    debug: bool = False

    # --- Auth0 / OAuth2 resource-server configuration -------------------------
    # These are left blank by default and MUST be set via the environment
    # (.env) before the API will accept requests. See docs/auth0-setup.md.
    #
    #   AUTH0_DOMAIN    e.g. "your-tenant.eu.auth0.com" (no scheme, no slash)
    #   AUTH0_AUDIENCE  the API identifier, e.g. "https://api.exam-studio"
    auth0_domain: str = ""
    auth0_audience: str = ""
    # Allowed signing algorithms for the *access token* (Auth0 uses RS256).
    auth0_algorithms: str = "RS256"
    # Namespace for custom (profile) claims the API may read off the access
    # token, e.g. "https://exam-studio/email". Matches the Auth0 Action.
    auth0_namespace: str = "https://exam-studio/"
    # Allowed clock skew (seconds) for the DPoP proof `iat` freshness check.
    dpop_iat_leeway_seconds: int = 300

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def auth0_algorithms_list(self) -> list[str]:
        return [alg.strip() for alg in self.auth0_algorithms.split(",") if alg.strip()]

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


settings = Settings()
