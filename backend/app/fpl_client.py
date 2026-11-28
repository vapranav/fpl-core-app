"""Client for the official (public) FPL API at fantasy.premierleague.com.

Read-only. Most endpoints need no auth; responses are cached in-process with
short TTLs so a league page doesn't hammer the upstream. The few that do need
auth (``get_me``, ``get_my_team``) take the user's own FPL access token, which
is passed straight through and never cached, stored or logged.
"""

import time
from datetime import UTC, datetime

import httpx

BASE = "https://fantasy.premierleague.com/api"
TIMEOUT = 15.0
RETRY_DELAY = 0.5  # seconds before the one retry of a transient failure
# FPL rate-limits bursts and has the odd 5xx/timeout, especially to a cold host
_RETRYABLE_STATUS = {429, 500, 502, 503, 504}

# path -> (monotonic fetch time, wall-clock fetch time, payload)
_cache: dict[str, tuple[float, datetime, object]] = {}


def _cached_fetch(path: str, ttl: int) -> tuple[datetime, object] | None:
    """(fetched_at, payload), or None on 404. Raises httpx errors otherwise."""
    now = time.monotonic()
    hit = _cache.get(path)
    if hit and now - hit[0] < ttl:
        return hit[1], hit[2]
    r = _get_with_retry(f"{BASE}{path}")
    if r.status_code == 404:
        return None
    r.raise_for_status()
    fetched_at = datetime.now(UTC)
    data = r.json()
    _cache[path] = (now, fetched_at, data)
    return fetched_at, data


def _get_with_retry(url: str) -> httpx.Response:
    """GET, retrying once on a timeout/connection error or a transient status."""
    try:
        r = httpx.get(url, timeout=TIMEOUT)
        if r.status_code not in _RETRYABLE_STATUS:
            return r
    except httpx.TransportError:
        pass
    time.sleep(RETRY_DELAY)
    return httpx.get(url, timeout=TIMEOUT)


def _cached_get(path: str, ttl: int):
    hit = _cached_fetch(path, ttl)
    return None if hit is None else hit[1]


def get_entry(entry_id: int) -> dict | None:
    return _cached_get(f"/entry/{entry_id}/", ttl=300)


def get_entry_history(entry_id: int) -> dict | None:
    """A manager's GW-by-GW season history (points, ranks, value) and chips."""
    return _cached_get(f"/entry/{entry_id}/history/", ttl=300)


def get_picks(entry_id: int, gw: int) -> dict | None:
    return _cached_get(f"/entry/{entry_id}/event/{gw}/picks/", ttl=60)


def get_event_status() -> dict:
    return _cached_get("/event-status/", ttl=60)


def get_event_live(gw: int) -> dict | None:
    """Every player's points and minutes for a GW, updated during matches."""
    return _cached_get(f"/event/{gw}/live/", ttl=60)


def get_league_standings(league_id: int, page: int) -> dict | None:
    return _cached_get(f"/leagues-classic/{league_id}/standings/?page_standings={page}", ttl=300)


def get_bootstrap() -> tuple[datetime, dict]:
    """bootstrap-static and when it was fetched. FPL refreshes its price-change
    predictions in it every ~15 minutes, so the TTL is short."""
    return _cached_fetch("/bootstrap-static/", ttl=300)


def get_price_change_history() -> list[dict]:
    """Every price change made this season, with its exact time."""
    return _cached_get("/stats/price-changes/", ttl=300) or []


def get_element_summary(element_id: int) -> dict | None:
    """A player's per-GW history and upcoming fixtures this season."""
    return _cached_get(f"/element-summary/{element_id}/", ttl=300)


class FplAuthError(Exception):
    """FPL rejected the access token (missing, expired or for another account)."""


def _auth_get(path: str, token: str) -> dict | None:
    """GET an authenticated endpoint with the user's token; never cached, since
    the response is private to that token. None on 404."""
    r = httpx.get(
        f"{BASE}{path}",
        headers={"X-Api-Authorization": f"Bearer {token}"},
        timeout=TIMEOUT,
    )
    if r.status_code in (401, 403):
        raise FplAuthError(r.status_code)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.json()


def get_me(token: str) -> dict | None:
    """The signed-in account: {player: {entry, first_name, last_name, ...}}."""
    return _auth_get("/me/", token)


def get_my_team(entry_id: int, token: str) -> dict | None:
    """The squad as it stands for the next deadline, with selling prices, chip
    availability and free transfers. Only the entry's owner can read it."""
    return _auth_get(f"/my-team/{entry_id}/", token)


def clear_cache() -> None:
    _cache.clear()
