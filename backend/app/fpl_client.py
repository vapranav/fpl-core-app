"""Client for the official (public) FPL API at fantasy.premierleague.com.

Read-only; the endpoints we use need no auth. Responses are cached in-process
with short TTLs so a league page doesn't hammer the upstream.
"""

import time

import httpx

BASE = "https://fantasy.premierleague.com/api"
TIMEOUT = 15.0

_cache: dict[str, tuple[float, object]] = {}


def _cached_get(path: str, ttl: int):
    now = time.monotonic()
    hit = _cache.get(path)
    if hit and now - hit[0] < ttl:
        return hit[1]
    r = httpx.get(f"{BASE}{path}", timeout=TIMEOUT)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    data = r.json()
    _cache[path] = (now, data)
    return data


def get_entry(entry_id: int) -> dict | None:
    return _cached_get(f"/entry/{entry_id}/", ttl=300)


def get_picks(entry_id: int, gw: int) -> dict | None:
    return _cached_get(f"/entry/{entry_id}/event/{gw}/picks/", ttl=60)


def get_event_status() -> dict:
    return _cached_get("/event-status/", ttl=60)


def get_event_live(gw: int) -> dict | None:
    """Every player's points and minutes for a GW, updated during matches."""
    return _cached_get(f"/event/{gw}/live/", ttl=60)


def get_league_standings(league_id: int, page: int) -> dict | None:
    return _cached_get(f"/leagues-classic/{league_id}/standings/?page_standings={page}", ttl=300)


def clear_cache() -> None:
    _cache.clear()
