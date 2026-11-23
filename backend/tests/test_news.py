import time
from fastapi.testclient import TestClient

from main import app, cache_service, news_service
from news_service import resolve_symbol_correlations

client = TestClient(app)


def test_resolve_symbol_correlations_matrix():
    assert resolve_symbol_correlations("EURUSD")["currencies"] == ["EUR", "USD"]
    assert resolve_symbol_correlations("EURUSD.raw")["currencies"] == ["EUR", "USD"]
    assert resolve_symbol_correlations("GBPJPY")["currencies"] == ["GBP", "JPY"]
    assert resolve_symbol_correlations("GBPUSDc")["currencies"] == ["GBP", "USD"]
    assert resolve_symbol_correlations("XAUUSD")["currencies"] == ["USD"]
    assert resolve_symbol_correlations("XAUUSDm")["currencies"] == ["USD"]
    assert resolve_symbol_correlations("XAUUSDc")["asset_class"] == "Metals"
    assert resolve_symbol_correlations("US30")["currencies"] == ["USD"]
    assert resolve_symbol_correlations("GER40")["currencies"] == ["EUR"]
    assert resolve_symbol_correlations("JP225")["currencies"] == ["JPY"]
    assert resolve_symbol_correlations("BTCUSD")["currencies"] == ["USD"]
    assert resolve_symbol_correlations("BTCUSD")["asset_class"] == "Crypto"


def test_api_news_filters_and_serves_cached_events(monkeypatch):
    # Prevent live HTTP calls during deterministic unit test
    monkeypatch.setattr(news_service, "_fetch_calendar_upstream", lambda: [])
    monkeypatch.setattr(news_service, "_fetch_headlines_upstream", lambda: [])

    now_ms = int(time.time() * 1000)
    cache_service.upsert_economic_events(
        [
            {
                "id": "test_ev_usd_high",
                "title": "US Non-Farm Payrolls",
                "country": "USD",
                "impact": "high",
                "category": "calendar",
                "event_time_ms": now_ms + 3600_000,
                "actual": "",
                "forecast": "185K",
                "previous": "172K",
                "source": "Test",
            },
            {
                "id": "test_ev_eur_med",
                "title": "ECB Press Conference",
                "country": "EUR",
                "impact": "medium",
                "category": "calendar",
                "event_time_ms": now_ms + 7200_000,
                "actual": "",
                "forecast": "",
                "previous": "",
                "source": "Test",
            },
            {
                "id": "test_ev_jpy_low",
                "title": "Japan Housing Starts",
                "country": "JPY",
                "impact": "low",
                "category": "calendar",
                "event_time_ms": now_ms + 10800_000,
                "actual": "1.2%",
                "forecast": "1.0%",
                "previous": "0.8%",
                "source": "Test",
            },
        ]
    )

    # Correlated to XAUUSDc -> only USD high/medium events
    r_gold = client.get("/api/news?symbol=XAUUSDc&scope=correlated&impact=high,medium")
    assert r_gold.status_code == 200
    d_gold = r_gold.json()
    assert d_gold["resolved_currencies"] == ["USD"]
    ids_gold = {e["id"] for e in d_gold["events"]}
    assert "test_ev_usd_high" in ids_gold
    assert "test_ev_eur_med" not in ids_gold
    assert "test_ev_jpy_low" not in ids_gold

    # Correlated to EURUSD -> USD + EUR
    r_eur = client.get("/api/news?symbol=EURUSD.raw&scope=correlated&impact=high,medium")
    assert r_eur.status_code == 200
    ids_eur = {e["id"] for e in r_eur.json()["events"]}
    assert "test_ev_usd_high" in ids_eur and "test_ev_eur_med" in ids_eur

    # Custom scope with JPY + low impact
    r_jpy = client.get("/api/news?symbol=XAUUSD&scope=custom&currencies=JPY&impact=low")
    assert r_jpy.status_code == 200
    ids_jpy = {e["id"] for e in r_jpy.json()["events"]}
    assert "test_ev_jpy_low" in ids_jpy and "test_ev_usd_high" not in ids_jpy
