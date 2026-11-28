"""Config and CDN helper tests."""

from app.config import Settings
from app.schemas import player_photo_url, team_badge_url


def test_season_list_parsing():
    assert Settings(seasons="2025-2026, 2026-2027").season_list == [
        "2025-2026",
        "2026-2027",
    ]
    assert Settings(seasons="").season_list == []


def test_llm_key_is_optional_and_secret(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert Settings(_env_file=None).llm_enabled is False
    assert Settings(_env_file=None, anthropic_api_key="   ").llm_enabled is False

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test-123")
    s = Settings(_env_file=None)
    assert s.llm_enabled is True
    assert s.anthropic_api_key.get_secret_value() == "sk-ant-test-123"
    # never leaks through str/repr (e.g. if settings get logged)
    assert "sk-ant-test-123" not in repr(s) and "sk-ant-test-123" not in str(s)


def test_llm_key_from_env_file(tmp_path, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    env = tmp_path / ".env"
    env.write_text("ANTHROPIC_API_KEY=sk-ant-file\nLLM_MODEL=claude-sonnet-5-5\n")
    s = Settings(_env_file=env)
    assert s.anthropic_api_key.get_secret_value() == "sk-ant-file"
    assert s.llm_model == "claude-sonnet-5-5"


def test_player_photo_url():
    assert player_photo_url(223094).endswith("/photos/players/250x250/p223094.png")
    assert player_photo_url(None) is None


def test_team_badge_url():
    assert team_badge_url(3).endswith("/badges/50/t3.png")
    assert team_badge_url(None) is None
