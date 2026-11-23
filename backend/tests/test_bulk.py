from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def _place(symbol: str, side: str) -> int:
    r = client.post(
        "/api/mt5/trade/order",
        json={"symbol": symbol, "side": side, "order_mode": "MARKET", "volume": 0.01},
    )
    assert r.status_code == 200
    assert r.json()["success"] is True
    return r.json()["order_ticket"]


def test_bulk_close_mock_positions():
    t1 = _place("EURUSD", "BUY")
    t2 = _place("GBPUSD", "SELL")

    res = client.post("/api/mt5/trade/bulk/close", json={"tickets": [t1, t2]})
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert len(data["results"]) == 2
    assert all(r["success"] for r in data["results"])

    after = client.get("/api/mt5/trade/state").json()
    remaining = {p["ticket"] for p in after["positions"]}
    assert t1 not in remaining and t2 not in remaining


def test_bulk_close_unknown_ticket_partial_failure():
    res = client.post("/api/mt5/trade/bulk/close", json={"tickets": [999999]})
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is False
    assert data["results"][0]["success"] is False


def test_bulk_close_empty_tickets_400():
    res = client.post("/api/mt5/trade/bulk/close", json={"tickets": []})
    assert res.status_code == 400
