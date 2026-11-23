import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

import main as app_main
from mt5_service import MT5Service


def _make_mock_service() -> MT5Service:
    svc = MT5Service.__new__(MT5Service)
    svc._lock = __import__("threading").RLock()
    svc.connected = False
    svc.last_error_msg = None
    svc._mock_live_state = {}
    svc._d1_prev_close_cache = {}
    svc._resolved_symbol_cache = {}
    svc.window_hidden = False
    svc._mock_positions = []
    svc._mock_orders = []
    svc._mock_balance = 10000.0
    svc._mock_ticket_seq = 900001
    return svc


def test_symbol_spec_includes_accurate_valuation_across_asset_classes():
    svc = _make_mock_service()

    xau = svc.get_symbol_spec("XAUUSD")
    assert xau["digits"] == 2
    assert xau["tick_size"] == 0.01
    assert xau["contract_size"] == 100.0
    assert xau["tick_value"] == 1.0  # 0.01 * 100 = $1 per tick per 1.0 lot

    eur = svc.get_symbol_spec("EURUSD")
    assert eur["digits"] == 5
    assert eur["tick_size"] == 0.00001
    assert eur["contract_size"] == 100000.0
    assert eur["tick_value"] == 1.0  # $10 per pip (10 ticks) per 1.0 lot

    jpy = svc.get_symbol_spec("USDJPY")
    assert jpy["digits"] == 3
    assert jpy["contract_size"] == 100000.0
    assert 0.5 < jpy["tick_value"] < 0.8

    btc = svc.get_symbol_spec("BTCUSD")
    assert btc["contract_size"] == 1.0
    assert btc["tick_value"] == 0.01

    us30 = svc.get_symbol_spec("US30")
    assert us30["contract_size"] == 1.0
    assert us30["tick_value"] == 0.1


def test_cent_3digit_gold_and_cross_asset_profit_estimation_matches_mt5():
    # Exact reproduction of user-reported Cent 3-digit Gold bug:
    # Old hardcoded `volume * 10` produced -2176.80 instead of MT5's true -217.70 USC (10x error!)
    xau_cent_spec = {
        "digits": 3,
        "point": 0.001,
        "tick_size": 0.001,
        "tick_value": 0.10,  # 0.10 USC per 0.001 tick per 1.00 cent lot
        "tick_value_profit": 0.10,
        "tick_value_loss": 0.10,
        "contract_size": 100.0,
    }
    sl_loss = MT5Service._estimate_profit_from_spec(
        "BUY", 1.0, 2650.000, 2647.823, xau_cent_spec
    )
    assert sl_loss == -217.70

    # Trailing SL moved into profit on BUY (SL > entry) MUST return positive profit!
    sl_profit = MT5Service._estimate_profit_from_spec(
        "BUY", 1.0, 2650.000, 2651.500, xau_cent_spec
    )
    assert sl_profit == 150.0

    # Pending SELL_LIMIT order TP & SL
    sell_tp = MT5Service._estimate_profit_from_spec(
        "SELL_LIMIT", 0.5, 2660.000, 2655.000, xau_cent_spec
    )
    assert sell_tp == 250.0

    # Standard EURUSD 0.10 lot, 20 pips = 0.00200 -> $20.00
    svc = _make_mock_service()
    eur_profit = svc.estimate_profit("EURUSD", "BUY", 0.10, 1.08000, 1.08200)
    assert eur_profit["profit"] == 20.0

    # Crypto BTCUSD 0.10 lot, +$500 move -> +$50.00
    btc_profit = svc.estimate_profit("BTCUSD", "BUY", 0.10, 90000.0, 90500.0)
    assert btc_profit["profit"] == 50.0


def test_live_order_calc_profit_calibration_for_cent_account(monkeypatch):
    svc = _make_mock_service()
    svc.connected = True

    fake_mt5 = SimpleNamespace(
        ORDER_TYPE_BUY=0,
        ORDER_TYPE_SELL=1,
        symbol_info_tick=lambda sym: SimpleNamespace(bid=2650.0, ask=2650.2),
        # Simulate broker whose `order_calc_profit` returns exact USC cent amounts (100 USC per $1 per 1.0 lot)
        # even if raw symbol_info.trade_tick_value was stale or 0.
        order_calc_profit=lambda action, sym, vol, p1, p2: (
            (p2 - p1) * 100.0 * vol if action == 0 else (p1 - p2) * 100.0 * vol
        ),
    )
    monkeypatch.setattr("mt5_service.MT5_IMPORTED", True)
    monkeypatch.setattr("mt5_service.mt5", fake_mt5)

    fake_info = SimpleNamespace(
        name="XAUUSDc",
        digits=3,
        point=0.001,
        bid=2650.0,
        ask=2650.2,
        trade_tick_size=0.001,
        trade_tick_value=0.0,  # stale/zero before tick
        trade_tick_value_profit=0.0,
        trade_tick_value_loss=0.0,
        trade_contract_size=100.0,
        currency_profit="USC",
    )
    calibrated = svc._extract_live_valuation_spec(fake_info)
    assert calibrated["tick_size"] == 0.001
    assert abs(calibrated["tick_value_profit"] - 0.10) < 1e-6
    assert abs(calibrated["tick_value_loss"] - 0.10) < 1e-6

    # Using calibrated spec reproduces exact -217.70 USC
    est = MT5Service._estimate_profit_from_spec("BUY", 1.0, 2650.000, 2647.823, calibrated)
    assert est == -217.70


def test_trade_state_and_calc_profit_endpoint_return_valuation_fields(monkeypatch):
    svc = _make_mock_service()
    svc._mock_positions = [
        {
            "ticket": 101,
            "symbol": "XAUUSD",
            "side": "BUY",
            "volume": 0.10,
            "open_price": 2650.00,
            "current_price": 2652.00,
            "sl": 2640.00,
            "tp": 2670.00,
            "profit": 20.0,
            "swap": 0.0,
            "open_time_ms": 1700000000000,
            "comment": "test",
        }
    ]
    svc._mock_orders = [
        {
            "ticket": 202,
            "symbol": "EURUSD",
            "order_type": "BUY_LIMIT",
            "volume": 0.20,
            "price_open": 1.08000,
            "current_price": 1.08500,
            "sl": 1.07800,
            "tp": 1.08400,
            "setup_time_ms": 1700000000000,
            "comment": "limit",
        }
    ]
    monkeypatch.setattr(app_main, "mt5_service", svc)

    client = TestClient(app_main.app)

    state_res = client.get("/api/mt5/trade/state")
    assert state_res.status_code == 200
    body = state_res.json()
    pos = body["positions"][0]
    assert pos["tick_size"] == 0.01
    assert pos["tick_value_loss"] == 1.0
    assert pos["sl_profit"] == -100.0  # -10.00 * 100 * 0.10
    assert pos["tp_profit"] == 200.0   # +20.00 * 100 * 0.10

    ord_item = body["orders"][0]
    assert ord_item["sl_profit"] == -40.0  # -20 pips * $2/pip
    assert ord_item["tp_profit"] == 80.0   # +40 pips * $2/pip

    calc_res = client.post(
        "/api/mt5/trade/calc-profit",
        json={
            "symbol": "XAUUSD",
            "side": "BUY",
            "volume": 0.10,
            "entry_price": 2650.00,
            "target_price": 2640.00,
        },
    )
    assert calc_res.status_code == 200
    assert calc_res.json()["profit"] == -100.0
