"""Application configuration via environment variables."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # sqlite for local dev, postgresql+psycopg2://... in production
    database_url: str = "sqlite:///./fpl.db"

    @property
    def sqlalchemy_url(self) -> str:
        # Hosted providers (Fly, Heroku) hand out postgres:// URLs without
        # the driver suffix SQLAlchemy needs
        url = self.database_url
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        if url.startswith("postgresql://") and "+" not in url.split("://")[0]:
            url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
        return url

    repo_owner: str = "olbauday"
    repo_name: str = "FPL-Core-Insights"
    repo_branch: str = "main"

    # comma-separated season dirs, e.g. "2025-2026,2026-2027"; empty = all
    seasons: str = ""

    # cron for the refresh job, UTC (repo updates ~07:30 and ~17:30 UTC)
    refresh_hour: str = "8,18"
    refresh_minute: int = 5

    # run a refresh at startup when the DB has no data yet
    etl_on_startup_if_empty: bool = True

    # if set, /api/admin/* requires header X-Admin-Token with this value
    admin_token: str = ""

    @property
    def season_list(self) -> list[str]:
        return [s.strip() for s in self.seasons.split(",") if s.strip()]

    @property
    def tarball_url(self) -> str:
        return (
            f"https://codeload.github.com/{self.repo_owner}/{self.repo_name}"
            f"/tar.gz/refs/heads/{self.repo_branch}"
        )

    @property
    def commit_api_url(self) -> str:
        return (
            f"https://api.github.com/repos/{self.repo_owner}/{self.repo_name}"
            f"/commits/{self.repo_branch}"
        )


settings = Settings()
