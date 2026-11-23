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
    lo = min(pos["open_price"], pos["current_price"])
    hi = max(pos["open_price"], pos["current_price"])
    sl = round(lo - 0.01, 5)
    tp = round(hi + 0.01, 5)

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
    bad_sl = round(pos["current_price"] + 0.01, 5)  # above current price -> invalid for BUY

    res = client.post("/api/mt5/trade/bulk/modify", json={"tickets": [t], "sl": bad_sl})
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is False
    assert data["results"][0]["success"] is False
    assert str(t) in data["results"][0]["message"]


def test_bulk_modify_validation_anchors_to_current_price():
    # SL between open and current (breakeven/lock-profit zone): valid iff current > open
    t = _place("EURUSD", "BUY")
    state = client.get("/api/mt5/trade/state").json()
    pos = next(p for p in state["positions"] if p["ticket"] == t)
    mid = round((pos["open_price"] + pos["current_price"]) / 2, 5)

    res = client.post("/api/mt5/trade/bulk/modify", json={"tickets": [t], "sl": mid}).json()
    expected = pos["current_price"] > pos["open_price"]
    assert res["success"] is expected


def test_bulk_modify_negative_sl_rejected():
    t = _place("EURUSD", "BUY")
    res = client.post("/api/mt5/trade/bulk/modify", json={"tickets": [t], "sl": -5}).json()
    assert res["success"] is False
    assert res["results"][0]["success"] is False


def test_bulk_modify_sl_zero_clears():
    t = _place("EURUSD", "BUY")
    state = client.get("/api/mt5/trade/state").json()
    pos = next(p for p in state["positions"] if p["ticket"] == t)
    sl = round(min(pos["open_price"], pos["current_price"]) - 0.01, 5)
    client.post("/api/mt5/trade/bulk/modify", json={"tickets": [t], "sl": sl})

    res = client.post("/api/mt5/trade/bulk/modify", json={"tickets": [t], "sl": 0}).json()
    assert res["success"] is True
    after = client.get("/api/mt5/trade/state").json()
    p = next(p for p in after["positions"] if p["ticket"] == t)
    assert p["sl"] == 0


def test_bulk_close_partial_failure():
    t = _place("EURUSD", "BUY")
    res = client.post("/api/mt5/trade/bulk/close", json={"tickets": [t, 999999]})
    data = res.json()
    assert data["success"] is False and len(data["results"]) == 2
    assert data["results"][0]["success"] is True and data["results"][1]["success"] is False
    after = client.get("/api/mt5/trade/state").json()
    assert all(p["ticket"] != t for p in after["positions"])


def test_bulk_modify_mixed_partial():
    # Same symbol, opposite sides: one SL below current is valid for BUY, invalid for SELL
    t1 = _place("EURUSD", "BUY")
    t2 = _place("EURUSD", "SELL")
    state = client.get("/api/mt5/trade/state").json()
    p1 = next(p for p in state["positions"] if p["ticket"] == t1)
    p2 = next(p for p in state["positions"] if p["ticket"] == t2)
    sl = round(min(p1["open_price"], p1["current_price"], p2["current_price"]) - 0.01, 5)

    res = client.post("/api/mt5/trade/bulk/modify", json={"tickets": [t1, t2], "sl": sl}).json()
    assert res["success"] is False and len(res["results"]) == 2
    assert res["results"][0]["success"] is True and res["results"][1]["success"] is False
    assert str(t2) in res["results"][1]["message"]


def test_bulk_modify_rejects_mixed_symbols():
    t_gold = _place("XAUUSD", "BUY")
    t_fx = _place("EURUSD", "BUY")
    before = client.get("/api/mt5/trade/state").json()["positions"]
    gold_before = next(p for p in before if p["ticket"] == t_gold)
    fx_before = next(p for p in before if p["ticket"] == t_fx)

    res = client.post(
        "/api/mt5/trade/bulk/modify",
        json={"tickets": [t_gold, t_fx], "sl": round(gold_before["current_price"] - 10.0, 2)},
    ).json()
    assert res["success"] is False
    assert "multiple symbols" in res["message"].lower()
    assert all(not r["success"] for r in res["results"])

    after = client.get("/api/mt5/trade/state").json()["positions"]
    gold_after = next(p for p in after if p["ticket"] == t_gold)
    fx_after = next(p for p in after if p["ticket"] == t_fx)
    assert gold_after["sl"] == gold_before["sl"]
    assert fx_after["sl"] == fx_before["sl"]


def test_bulk_modify_rejects_expected_symbol_mismatch():
    t_fx = _place("EURUSD", "BUY")
    res = client.post(
        "/api/mt5/trade/bulk/modify",
        json={"tickets": [t_fx], "sl": 1.01, "symbol": "XAUUSD"},
    ).json()
    assert res["success"] is False
    assert "mismatch" in res["message"].lower()


def test_bulk_modify_rounds_sltp_to_symbol_digits():
    t_gold = _place("XAUUSD", "BUY")
    state = client.get("/api/mt5/trade/state").json()
    pos = next(p for p in state["positions"] if p["ticket"] == t_gold)
    assert pos["digits"] == 2
    noisy_sl = round(pos["current_price"] - 10.0, 2) + 0.004294353796595
    expected_sl = round(noisy_sl, 2)

    res = client.post(
        "/api/mt5/trade/bulk/modify",
        json={"tickets": [t_gold], "sl": noisy_sl, "symbol": "XAUUSD"},
    ).json()
    assert res["success"] is True
    after = client.get("/api/mt5/trade/state").json()
    updated = next(p for p in after["positions"] if p["ticket"] == t_gold)
    assert updated["sl"] == expected_sl


def test_trade_state_includes_symbol_digits():
    t_gold = _place("XAUUSD", "BUY")
    t_eur = _place("EURUSD", "BUY")
    t_jpy = _place("USDJPY", "BUY")
    state = client.get("/api/mt5/trade/state").json()
    by_ticket = {p["ticket"]: p for p in state["positions"]}
    assert by_ticket[t_gold]["digits"] == 2
    assert by_ticket[t_eur]["digits"] == 5
    assert by_ticket[t_jpy]["digits"] == 3
