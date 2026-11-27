"""Pydantic response schemas.

Stat-heavy rows pass through as plain dicts (they're wide and the column set
may grow with the dataset); schemas are used where the API adds value:
computed URLs and list envelopes.
"""

PL_CDN = "https://resources.premierleague.com/premierleague"


def player_photo_url(player_code: int | None, size: str = "250x250") -> str | None:
    if player_code is None:
        return None
    return f"{PL_CDN}/photos/players/{size}/p{int(player_code)}.png"


def team_badge_url(team_code: int | None, size: int = 50) -> str | None:
    if team_code is None:
        return None
    return f"{PL_CDN}/badges/{size}/t{int(team_code)}.png"
