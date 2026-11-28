"""Retry behaviour of the FPL API client (network mocked)."""

from unittest import mock

import httpx
import pytest

from app import fpl_client


@pytest.fixture(autouse=True)
def fresh(monkeypatch):
    fpl_client.clear_cache()
    monkeypatch.setattr(fpl_client, "RETRY_DELAY", 0)
    yield
    fpl_client.clear_cache()


def _resp(status, json=None):
    return httpx.Response(status, json=json, request=httpx.Request("GET", "https://x"))


def test_retries_once_after_a_timeout():
    with mock.patch.object(
        fpl_client.httpx, "get", side_effect=[httpx.ReadTimeout("slow"), _resp(200, {"id": 1})]
    ) as get:
        assert fpl_client.get_entry(1) == {"id": 1}
    assert get.call_count == 2


@pytest.mark.parametrize("status", [429, 503])
def test_retries_once_after_a_transient_status(status):
    with mock.patch.object(
        fpl_client.httpx, "get", side_effect=[_resp(status), _resp(200, {"id": 2})]
    ) as get:
        assert fpl_client.get_entry(2) == {"id": 2}
    assert get.call_count == 2


def test_gives_up_after_the_retry():
    with mock.patch.object(fpl_client.httpx, "get", side_effect=[_resp(503), _resp(503)]):
        with pytest.raises(httpx.HTTPStatusError):
            fpl_client.get_entry(3)


def test_no_retry_for_not_found_or_success():
    with mock.patch.object(fpl_client.httpx, "get", return_value=_resp(404)) as get:
        assert fpl_client.get_entry(4) is None
    assert get.call_count == 1
