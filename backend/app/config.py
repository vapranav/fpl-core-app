"""Application configuration via environment variables."""

from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    # ./.env (the working directory) and backend/.env; real env vars win over both
    model_config = SettingsConfigDict(env_file=(".env", BACKEND_DIR / ".env"), extra="ignore")

    # SQLite everywhere: ./fpl.db locally, /data/fpl.db on the Fly volume
    database_url: str = "sqlite:///./fpl.db"

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

    # LLM features (Claude). Bring your own key from console.anthropic.com;
    # without one, LLM-backed endpoints should report themselves unavailable.
    # SecretStr keeps the key out of logs and reprs: read it with
    # settings.anthropic_api_key.get_secret_value().
    anthropic_api_key: SecretStr = SecretStr("")
    llm_model: str = "claude-opus-5-5"

    @property
    def llm_enabled(self) -> bool:
        return bool(self.anthropic_api_key.get_secret_value().strip())

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
