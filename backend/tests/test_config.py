"""Config and CDN helper tests."""
from app.config import Settings
from app.schemas import player_photo_url, team_badge_url


def test_season_list_parsing():
    assert Settings(seasons="2025-2026, 2026-2027").season_list == [
        "2025-2026",
        "2026-2027",
    ]
    assert Settings(seasons="").season_list == []


def test_player_photo_url():
    assert player_photo_url(223094).endswith("/photos/players/250x250/p223094.png")
    assert player_photo_url(None) is None


def test_team_badge_url():
    assert team_badge_url(3).endswith("/badges/50/t3.png")
    assert team_badge_url(None) is None
