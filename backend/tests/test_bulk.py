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


def test_bulk_modify_sltp_mock():
    t = _place("EURUSD", "BUY")
    state = client.get("/api/mt5/trade/state").json()
    pos = next(p for p in state["positions"] if p["ticket"] == t)
    sl = round(pos["open_price"] - 0.01, 5)
    tp = round(pos["open_price"] + 0.01, 5)

    res = client.post("/api/mt5/trade/bulk/modify", json={"tickets": [t], "sl": sl, "tp": tp})
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert len(data["results"]) == 1 and data["results"][0]["success"] is True

    after = client.get("/api/mt5/trade/state").json()
    p = next(p for p in after["positions"] if p["ticket"] == t)
    assert abs(p["sl"] - sl) < 1e-6 and abs(p["tp"] - tp) < 1e-6


def test_bulk_modify_invalid_orientation_per_ticket_failure():
    t = _place("EURUSD", "BUY")
    state = client.get("/api/mt5/trade/state").json()
    pos = next(p for p in state["positions"] if p["ticket"] == t)
    bad_sl = round(pos["open_price"] + 0.01, 5)  # above open price -> invalid for BUY

    res = client.post("/api/mt5/trade/bulk/modify", json={"tickets": [t], "sl": bad_sl})
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is False
    assert data["results"][0]["success"] is False
    assert str(t) in data["results"][0]["message"]
