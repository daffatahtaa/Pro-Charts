import json
import math
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from cache_service import cache_service
from mt5_service import MT5_IMPORTED, mt5, mt5_service

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKTESTS_DIR = os.path.join(ROOT_DIR, "backtests")

_SYMBOL_PIP_CACHE: Dict[str, float] = {}
_MT5_TRADES_CACHE: Dict[str, Any] = {
    "ts": 0.0,
    "login": None,
    "server": "",
    "currency": "USD",
    "initial_deposit": 0.0,
    "current_balance": 0.0,
    "trades": [],
}
_MT5_CACHE_TTL_SEC = 15.0
_LAST_EXPORT_TS = 0.0
_EXPORT_LOCK = threading.Lock()


def _detect_session(ts_ms: int) -> str:
    try:
        h = datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc).hour
    except Exception:
        return "LONDON"
    if 7 <= h < 12:
        return "LONDON"
    if 12 <= h < 16:
        return "OVERLAP"
    if 16 <= h < 21:
        return "NEW_YORK"
    return "ASIA"


def _get_pip_size_fast(symbol: str, sample_price: float) -> float:
    sym_u = symbol.upper()
    cached = _SYMBOL_PIP_CACHE.get(sym_u)
    if cached is not None:
        return cached

    # Pure deterministic heuristic: 0 MT5 IPC calls and 0 lock contention
    if any(k in sym_u for k in ("XAU", "GOLD")):
        pip_size = 0.1
    elif any(k in sym_u for k in ("XAG", "SILVER")):
        pip_size = 0.01
    elif "JPY" in sym_u:
        pip_size = 0.01
    elif any(
        k in sym_u
        for k in (
            "BTC",
            "ETH",
            "US30",
            "NAS100",
            "US100",
            "USTEC",
            "SPX",
            "US500",
            "GER40",
            "DE40",
            "UK100",
            "JP225",
        )
    ):
        pip_size = 1.0
    elif sample_price >= 500.0:
        pip_size = 1.0
    elif sample_price >= 20.0:
        pip_size = 0.01
    else:
        pip_size = 0.0001

    _SYMBOL_PIP_CACHE[sym_u] = pip_size
    return pip_size


def _calc_pips(symbol: str, side: str, entry: float, exit_p: float) -> float:
    diff = (exit_p - entry) if side == "BUY" else (entry - exit_p)
    pip_size = _get_pip_size_fast(symbol, entry or exit_p)
    return round(diff / pip_size, 1) if pip_size > 0 else 0.0


def update_cached_trade_meta(account_login: int, position_id: int, meta: Dict[str, Any]) -> None:
    """In-place update of cached MT5 trade metadata so UI reflects changes immediately without re-querying MT5."""
    if _MT5_TRADES_CACHE.get("login") != account_login:
        return
    tkey = f"{account_login}_{position_id}"
    for t in _MT5_TRADES_CACHE.get("trades", []):
        if t.get("trade_key") == tkey:
            t["setup_tag"] = meta.get("setup_tag", t.get("setup_tag", ""))
            t["mistake_tag"] = meta.get("mistake_tag", t.get("mistake_tag", ""))
            t["emotion"] = meta.get("emotion", t.get("emotion", "Calm"))
            t["rating"] = int(meta.get("rating", t.get("rating", 0)))
            t["notes"] = meta.get("notes", t.get("notes", ""))
            break


def _fmt_hold_time(seconds: int) -> str:
    s = max(0, int(seconds))
    if s < 60:
        return f"{s}s"
    mins = s // 60
    if mins < 60:
        return f"{mins}m"
    hrs = mins // 60
    rem_m = mins % 60
    if hrs < 24:
        return f"{hrs}h {rem_m}m"
    days = hrs // 24
    rem_h = hrs % 24
    return f"{days}d {rem_h}h"


def _fetch_mt5_closed_trades(
    force_refresh: bool = False,
) -> Tuple[int, str, str, float, float, List[Dict[str, Any]]]:
    """Reconstruct round-trip closed trades from mt5.history_deals_get() grouped by position_id, with 15s in-memory cache."""
    now = time.time()
    if (
        not force_refresh
        and _MT5_TRADES_CACHE["login"] is not None
        and (now - _MT5_TRADES_CACHE["ts"]) < _MT5_CACHE_TTL_SEC
    ):
        return (
            _MT5_TRADES_CACHE["login"],
            _MT5_TRADES_CACHE["server"],
            _MT5_TRADES_CACHE["currency"],
            _MT5_TRADES_CACHE["initial_deposit"],
            _MT5_TRADES_CACHE["current_balance"],
            list(_MT5_TRADES_CACHE["trades"]),
        )

    acc_state = mt5_service.get_account_and_positions().get("account", {})
    login = int(acc_state.get("login", 0))
    server = str(acc_state.get("server", ""))
    currency = str(acc_state.get("currency", "USD"))
    current_balance = float(acc_state.get("balance", 0.0))
    initial_deposit = 0.0

    if not mt5_service.connected or not MT5_IMPORTED or mt5 is None:
        return login, server, currency, current_balance, current_balance, []

    date_from = datetime(2015, 1, 1, tzinfo=timezone.utc)
    # +10 years upper bound so PC clock set to 2026 never clips broker deals
    date_to = datetime.now(timezone.utc) + timedelta(days=3650)

    with mt5_service._lock:
        deals = mt5.history_deals_get(date_from, date_to) or []

    by_pos: Dict[int, List[Any]] = {}
    for d in deals:
        if d.type == mt5.DEAL_TYPE_BALANCE:
            if float(d.profit) > 0:
                initial_deposit += float(d.profit)
            continue
        if d.type in (mt5.DEAL_TYPE_BUY, mt5.DEAL_TYPE_SELL):
            pos_id = int(getattr(d, "position_id", 0) or d.ticket)
            by_pos.setdefault(pos_id, []).append(d)

    meta_map = cache_service.get_journal_meta_map(login)
    trades: List[Dict[str, Any]] = []

    for pos_id, pos_deals in by_pos.items():
        pos_deals.sort(key=lambda x: int(getattr(x, "time_msc", 0) or int(x.time) * 1000))
        in_deals = [d for d in pos_deals if d.entry == mt5.DEAL_ENTRY_IN]
        out_deals = [
            d
            for d in pos_deals
            if d.entry in (mt5.DEAL_ENTRY_OUT, mt5.DEAL_ENTRY_INOUT, mt5.DEAL_ENTRY_OUT_BY)
        ]
        if not out_deals:
            continue
        in_d = in_deals[0] if in_deals else pos_deals[0]
        out_d = out_deals[-1]

        side = "BUY" if in_d.type == mt5.DEAL_TYPE_BUY else "SELL"
        open_ms = int(getattr(in_d, "time_msc", 0) or int(in_d.time) * 1000)
        close_ms = int(getattr(out_d, "time_msc", 0) or int(out_d.time) * 1000)
        hold_sec = max(1, (close_ms - open_ms) // 1000)

        entry_p = float(in_d.price)
        exit_p = float(out_d.price)
        vol = round(sum(float(d.volume) for d in out_deals), 2)
        gross = round(sum(float(d.profit) for d in pos_deals), 2)
        comm = round(sum(float(d.commission) for d in pos_deals), 2)
        swap = round(sum(float(d.swap) for d in pos_deals), 2)
        fee = round(sum(float(getattr(d, "fee", 0.0)) for d in pos_deals), 2)
        net = round(gross + comm + swap + fee, 2)

        sym = str(out_d.symbol or in_d.symbol)
        pips = _calc_pips(sym, side, entry_p, exit_p)
        close_date = datetime.fromtimestamp(close_ms / 1000.0, tz=timezone.utc).strftime("%Y-%m-%d")

        tkey = f"{login}_{pos_id}"
        meta = meta_map.get(tkey, {})
        comment = str(getattr(in_d, "comment", "") or getattr(out_d, "comment", "") or "")
        # Auto-infer setup_tag from TV-RR:<tag> comment if user hasn't edited it yet
        default_tag = ""
        if not meta.get("setup_tag") and comment.startswith("TV-RR:"):
            default_tag = comment.split(":", 1)[1].strip()

        trades.append(
            {
                "trade_key": tkey,
                "account_login": login,
                "position_id": pos_id,
                "symbol": sym,
                "side": side,
                "volume": vol,
                "entry_price": entry_p,
                "exit_price": exit_p,
                "open_time_ms": open_ms,
                "close_time_ms": close_ms,
                "close_date": close_date,
                "hold_seconds": hold_sec,
                "pips": pips,
                "gross_profit": gross,
                "commission": comm,
                "swap": swap,
                "net_pnl": net,
                "session": _detect_session(open_ms),
                "comment": comment,
                "setup_tag": meta.get("setup_tag", "") or default_tag,
                "mistake_tag": meta.get("mistake_tag", ""),
                "emotion": meta.get("emotion", "Calm"),
                "rating": int(meta.get("rating", 0)),
                "notes": meta.get("notes", ""),
            }
        )

    if initial_deposit <= 0:
        total_net = sum(t["net_pnl"] for t in trades)
        initial_deposit = max(100.0, round(current_balance - total_net, 2))

    init_dep_r = round(initial_deposit, 2)
    cur_bal_r = round(current_balance, 2)
    _MT5_TRADES_CACHE.update(
        {
            "ts": time.time(),
            "login": login,
            "server": server,
            "currency": currency,
            "initial_deposit": init_dep_r,
            "current_balance": cur_bal_r,
            "trades": trades,
        }
    )
    return login, server, currency, init_dep_r, cur_bal_r, list(trades)


def _fetch_paper_closed_trades() -> Tuple[int, str, str, float, float, List[Dict[str, Any]]]:
    login = 999999
    raw = cache_service.get_all_paper_closed_trades()
    meta_map = cache_service.get_journal_meta_map(login)
    trades: List[Dict[str, Any]] = []
    for r in raw:
        pos_id = int(r["position_id"])
        tkey = f"{login}_{pos_id}"
        meta = meta_map.get(tkey, {})
        close_ms = int(r["close_time_ms"] or r["open_time_ms"] or 0)
        open_ms = int(r["open_time_ms"] or close_ms)
        close_date = (
            datetime.fromtimestamp(close_ms / 1000.0, tz=timezone.utc).strftime("%Y-%m-%d")
            if close_ms > 0
            else datetime.now(timezone.utc).strftime("%Y-%m-%d")
        )
        trades.append(
            {
                "trade_key": tkey,
                "account_login": login,
                "position_id": pos_id,
                "symbol": r["symbol"],
                "side": r["side"],
                "volume": r["volume"],
                "entry_price": r["entry_price"],
                "exit_price": r["exit_price"],
                "open_time_ms": open_ms,
                "close_time_ms": close_ms,
                "close_date": close_date,
                "hold_seconds": max(1, (close_ms - open_ms) // 1000),
                "pips": r["pips"],
                "gross_profit": r["net_pnl"],
                "commission": 0.0,
                "swap": 0.0,
                "net_pnl": r["net_pnl"],
                "session": r["session"],
                "comment": "Paper Replay",
                "setup_tag": meta.get("setup_tag") or r["setup_tag"],
                "mistake_tag": meta.get("mistake_tag", ""),
                "emotion": meta.get("emotion", "Calm"),
                "rating": int(meta.get("rating", 0)),
                "notes": meta.get("notes") or r["notes"],
            }
        )
    net_sum = sum(t["net_pnl"] for t in trades)
    return login, "Replay-Paper-Account", "USD", 10000.0, round(10000.0 + net_sum, 2), trades


def _downsample_equity_curve(points: List[Dict[str, Any]], max_points: int = 300) -> List[Dict[str, Any]]:
    n = len(points)
    if n <= max_points:
        return points
    step = (n - 1) / float(max_points - 1)
    sampled = [points[int(round(i * step))] for i in range(max_points - 1)]
    sampled.append(points[-1])
    return sampled


def get_journal_analytics(
    source: str = "mt5",
    days: int = 90,
    symbol: str = "ALL",
    force_refresh: bool = False,
) -> Dict[str, Any]:
    if source == "paper":
        login, server, currency, init_dep, cur_bal, all_trades = _fetch_paper_closed_trades()
    else:
        login, server, currency, init_dep, cur_bal, all_trades = _fetch_mt5_closed_trades(
            force_refresh=force_refresh
        )

    symbols_available = sorted({t["symbol"] for t in all_trades})

    # Filter by period (days=0 means All Time) using latest trade timestamp as reference
    filtered = list(all_trades)
    if days > 0 and filtered:
        ref_ms = max(t["close_time_ms"] for t in filtered)
        cutoff_ms = ref_ms - (days * 86400 * 1000)
        filtered = [t for t in filtered if t["close_time_ms"] >= cutoff_ms]

    if symbol and symbol.upper() != "ALL":
        filtered = [t for t in filtered if t["symbol"].upper() == symbol.upper()]

    # Sort chronologically for equity curve & streaks
    chron = sorted(filtered, key=lambda x: x["close_time_ms"])
    total = len(chron)
    wins = [t for t in chron if t["net_pnl"] > 0]
    losses = [t for t in chron if t["net_pnl"] <= 0]
    win_count = len(wins)
    loss_count = len(losses)
    win_rate = round((win_count / total) * 100.0, 2) if total > 0 else 0.0

    gross_profit = round(sum(t["net_pnl"] for t in wins), 2)
    gross_loss = round(sum(t["net_pnl"] for t in losses), 2)
    net_profit = round(gross_profit + gross_loss, 2)
    gain_pct = round((net_profit / init_dep) * 100.0, 2) if init_dep > 0 else 0.0
    profit_factor = (
        round(gross_profit / abs(gross_loss), 2)
        if gross_loss < 0
        else (99.99 if gross_profit > 0 else 0.0)
    )

    longs = [t for t in chron if t["side"] == "BUY"]
    shorts = [t for t in chron if t["side"] == "SELL"]
    long_wins = sum(1 for t in longs if t["net_pnl"] > 0)
    short_wins = sum(1 for t in shorts if t["net_pnl"] > 0)

    avg_win_money = round(gross_profit / win_count, 2) if win_count > 0 else 0.0
    avg_loss_money = round(gross_loss / loss_count, 2) if loss_count > 0 else 0.0
    avg_win_pips = round(sum(t["pips"] for t in wins) / win_count, 1) if win_count > 0 else 0.0
    avg_loss_pips = round(sum(t["pips"] for t in losses) / loss_count, 1) if loss_count > 0 else 0.0
    payoff_ratio = (
        round(avg_win_money / abs(avg_loss_money), 2) if avg_loss_money < 0 else 0.0
    )
    expectancy_money = round(net_profit / total, 2) if total > 0 else 0.0
    total_pips = round(sum(t["pips"] for t in chron), 1)
    expectancy_pips = round(total_pips / total, 1) if total > 0 else 0.0

    best_money = max((t["net_pnl"] for t in chron), default=0.0)
    worst_money = min((t["net_pnl"] for t in chron), default=0.0)
    best_pips = max((t["pips"] for t in chron), default=0.0)
    worst_pips = min((t["pips"] for t in chron), default=0.0)
    total_comm = round(sum(t["commission"] for t in chron), 2)
    total_swap = round(sum(t["swap"] for t in chron), 2)
    total_lots = round(sum(t["volume"] for t in chron), 2)
    avg_hold_sec = int(sum(t["hold_seconds"] for t in chron) / total) if total > 0 else 0

    # Equity curve, Max Drawdown & Streaks
    equity_curve: List[Dict[str, Any]] = [
        {"trade_num": 0, "timestamp": 0, "date_str": "Start", "balance": init_dep, "cumulative_pnl": 0.0, "drawdown_pct": 0.0}
    ]
    running_bal = init_dep
    cum_pnl = 0.0
    peak_bal = init_dep
    max_dd_money = 0.0
    max_dd_pct = 0.0
    max_cw = cur_cw = max_cl = cur_cl = 0
    returns: List[float] = []

    for idx, t in enumerate(chron, start=1):
        prev_bal = running_bal
        running_bal = round(running_bal + t["net_pnl"], 2)
        cum_pnl = round(cum_pnl + t["net_pnl"], 2)
        if prev_bal > 0:
            returns.append(t["net_pnl"] / prev_bal)
        if running_bal > peak_bal:
            peak_bal = running_bal
        dd_money = peak_bal - running_bal
        dd_pct = (dd_money / peak_bal) * 100.0 if peak_bal > 0 else 0.0
        if dd_money > max_dd_money:
            max_dd_money = round(dd_money, 2)
            max_dd_pct = round(dd_pct, 2)

        if t["net_pnl"] > 0:
            cur_cw += 1
            cur_cl = 0
            max_cw = max(max_cw, cur_cw)
        else:
            cur_cl += 1
            cur_cw = 0
            max_cl = max(max_cl, cur_cl)

        equity_curve.append(
            {
                "trade_num": idx,
                "timestamp": t["close_time_ms"],
                "date_str": t["close_date"],
                "balance": running_bal,
                "cumulative_pnl": cum_pnl,
                "drawdown_pct": round(dd_pct, 2),
            }
        )

    sharpe = 0.0
    if len(returns) >= 2:
        mean_r = sum(returns) / len(returns)
        var_r = sum((r - mean_r) ** 2 for r in returns) / (len(returns) - 1)
        std_r = math.sqrt(var_r)
        if std_r > 0:
            sharpe = round((mean_r / std_r) * math.sqrt(len(returns)), 2)

    # Breakdown by Symbol
    sym_groups: Dict[str, List[Dict[str, Any]]] = {}
    for t in chron:
        sym_groups.setdefault(t["symbol"], []).append(t)
    by_symbol = []
    for sym, grp in sorted(sym_groups.items(), key=lambda kv: sum(x["net_pnl"] for x in kv[1]), reverse=True):
        gw = sum(x["net_pnl"] for x in grp if x["net_pnl"] > 0)
        gl = abs(sum(x["net_pnl"] for x in grp if x["net_pnl"] <= 0))
        wc = sum(1 for x in grp if x["net_pnl"] > 0)
        by_symbol.append(
            {
                "symbol": sym,
                "trades": len(grp),
                "win_rate": round((wc / len(grp)) * 100.0, 1),
                "net_pnl": round(sum(x["net_pnl"] for x in grp), 2),
                "net_pips": round(sum(x["pips"] for x in grp), 1),
                "profit_factor": round(gw / gl, 2) if gl > 0 else (99.99 if gw > 0 else 0.0),
            }
        )

    # Breakdown by Day of Week (Mon-Fri)
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    dow_groups: Dict[str, List[Dict[str, Any]]] = {d: [] for d in day_names[:5]}
    for t in chron:
        wd = datetime.fromtimestamp(t["close_time_ms"] / 1000.0, tz=timezone.utc).weekday()
        dname = day_names[wd]
        dow_groups.setdefault(dname, []).append(t)
    by_day_of_week = []
    for dname in day_names[:5]:
        grp = dow_groups.get(dname, [])
        wc = sum(1 for x in grp if x["net_pnl"] > 0)
        by_day_of_week.append(
            {
                "day": dname,
                "trades": len(grp),
                "win_rate": round((wc / len(grp)) * 100.0, 1) if grp else 0.0,
                "net_pnl": round(sum(x["net_pnl"] for x in grp), 2),
            }
        )

    # Breakdown by Hour UTC
    hour_groups: Dict[int, List[Dict[str, Any]]] = {h: [] for h in range(24)}
    for t in chron:
        hr = datetime.fromtimestamp(t["open_time_ms"] / 1000.0, tz=timezone.utc).hour
        hour_groups[hr].append(t)
    by_hour_utc = [
        {
            "hour": h,
            "trades": len(hour_groups[h]),
            "win_rate": round((sum(1 for x in hour_groups[h] if x["net_pnl"] > 0) / len(hour_groups[h])) * 100.0, 1)
            if hour_groups[h]
            else 0.0,
            "net_pnl": round(sum(x["net_pnl"] for x in hour_groups[h]), 2),
        }
        for h in range(24)
    ]

    # Breakdown by Setup Tag & Mistake Tag
    def _group_tag(field: str, fallback_label: str) -> List[Dict[str, Any]]:
        gmap: Dict[str, List[Dict[str, Any]]] = {}
        for t in chron:
            tag = (t.get(field) or "").strip() or fallback_label
            gmap.setdefault(tag, []).append(t)
        res = []
        for tag, grp in sorted(gmap.items(), key=lambda kv: sum(x["net_pnl"] for x in kv[1]), reverse=True):
            wc = sum(1 for x in grp if x["net_pnl"] > 0)
            res.append(
                {
                    "tag": tag,
                    "trades": len(grp),
                    "win_rate": round((wc / len(grp)) * 100.0, 1),
                    "net_pnl": round(sum(x["net_pnl"] for x in grp), 2),
                }
            )
        return res

    by_setup_tag = _group_tag("setup_tag", "Untagged")
    by_mistake_tag = _group_tag("mistake_tag", "No Tag")

    # Calendar Days Aggregation + Daily Notes
    daily_notes = cache_service.get_daily_notes_map(login)
    cal_groups: Dict[str, List[Dict[str, Any]]] = {}
    for t in chron:
        cal_groups.setdefault(t["close_date"], []).append(t)

    calendar_days: Dict[str, Dict[str, Any]] = {}
    all_dates = set(cal_groups.keys()) | set(daily_notes.keys())
    for dstr in sorted(all_dates):
        dtrades = cal_groups.get(dstr, [])
        dwc = sum(1 for x in dtrades if x["net_pnl"] > 0)
        dlc = len(dtrades) - dwc
        note_obj = daily_notes.get(dstr, {})
        calendar_days[dstr] = {
            "date": dstr,
            "net_pnl": round(sum(x["net_pnl"] for x in dtrades), 2),
            "net_pips": round(sum(x["pips"] for x in dtrades), 1),
            "trade_count": len(dtrades),
            "win_count": dwc,
            "loss_count": dlc,
            "win_rate": round((dwc / len(dtrades)) * 100.0, 1) if dtrades else 0.0,
            "lots": round(sum(x["volume"] for x in dtrades), 2),
            "mood": note_obj.get("mood", "Neutral"),
            "daily_note": note_obj.get("summary_note", ""),
            "trades": list(reversed(dtrades)),
        }

    kpis = {
        "net_profit": net_profit,
        "gain_pct": gain_pct,
        "gross_profit": gross_profit,
        "gross_loss": gross_loss,
        "profit_factor": profit_factor,
        "total_trades": total,
        "win_count": win_count,
        "loss_count": loss_count,
        "win_rate_pct": win_rate,
        "long_trades": len(longs),
        "long_win_rate_pct": round((long_wins / len(longs)) * 100.0, 1) if longs else 0.0,
        "long_net_pnl": round(sum(t["net_pnl"] for t in longs), 2),
        "short_trades": len(shorts),
        "short_win_rate_pct": round((short_wins / len(shorts)) * 100.0, 1) if shorts else 0.0,
        "short_net_pnl": round(sum(t["net_pnl"] for t in shorts), 2),
        "avg_win_money": avg_win_money,
        "avg_loss_money": avg_loss_money,
        "avg_win_pips": avg_win_pips,
        "avg_loss_pips": avg_loss_pips,
        "payoff_ratio": payoff_ratio,
        "expectancy_money": expectancy_money,
        "expectancy_pips": expectancy_pips,
        "best_trade_money": best_money,
        "worst_trade_money": worst_money,
        "best_trade_pips": best_pips,
        "worst_trade_pips": worst_pips,
        "max_drawdown_money": max_dd_money,
        "max_drawdown_pct": max_dd_pct,
        "max_consecutive_wins": max_cw,
        "max_consecutive_losses": max_cl,
        "avg_hold_time_seconds": avg_hold_sec,
        "avg_hold_time_str": _fmt_hold_time(avg_hold_sec),
        "sharpe_ratio": sharpe,
        "total_commission": total_comm,
        "total_swap": total_swap,
        "total_lots": total_lots,
        "total_pips": total_pips,
    }

    report = {
        "source": source,
        "account_login": login,
        "server": server,
        "currency": currency,
        "initial_deposit": init_dep,
        "current_balance": cur_bal,
        "symbols_available": symbols_available,
        "kpis": kpis,
        "equity_curve": _downsample_equity_curve(equity_curve, max_points=300),
        "by_symbol": by_symbol,
        "by_day_of_week": by_day_of_week,
        "by_hour_utc": by_hour_utc,
        "by_setup_tag": by_setup_tag,
        "by_mistake_tag": by_mistake_tag,
        "trades": list(reversed(chron)),
        "calendar_days": calendar_days,
    }

    # Auto-export AI-readable journal files in background thread (non-blocking, throttled 10s)
    if source == "mt5":
        global _LAST_EXPORT_TS
        now_ts = time.time()
        if force_refresh or (now_ts - _LAST_EXPORT_TS >= 10.0):
            _LAST_EXPORT_TS = now_ts
            threading.Thread(
                target=_export_ai_journal_files,
                args=(report,),
                daemon=True,
            ).start()

    return report


def _export_ai_journal_files(report: Dict[str, Any]) -> None:
    try:
        os.makedirs(BACKTESTS_DIR, exist_ok=True)
        json_path = os.path.join(BACKTESTS_DIR, "latest_mt5_journal.json")
        md_path = os.path.join(BACKTESTS_DIR, "latest_mt5_journal.md")

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)

        k = report["kpis"]
        lines = [
            f"# MT5 Live Trading Journal & Myfxbook Report — Account #{report['account_login']} ({report['server']})",
            f"- **Exported (UTC)**: {datetime.now(timezone.utc).isoformat()}",
            f"- **Net Profit**: ${k['net_profit']:+.2f} ({k['gain_pct']:+.2f}%) | **Win Rate**: {k['win_rate_pct']}% ({k['win_count']}W / {k['loss_count']}L)",
            f"- **Profit Factor**: {k['profit_factor']} | **Sharpe Ratio**: {k['sharpe_ratio']} | **Max DD**: ${k['max_drawdown_money']:.2f} ({k['max_drawdown_pct']}%)",
            f"- **Avg Hold Time**: {k['avg_hold_time_str']} | **Total Lots**: {k['total_lots']} | **Total Pips**: {k['total_pips']:+.1f}p",
            "",
            "## Breakdown by Setup Tag",
        ]
        for s in report["by_setup_tag"]:
            lines.append(f"- `{s['tag']}`: {s['trades']} trades | WR {s['win_rate']}% | Net ${s['net_pnl']:+.2f}")
        lines.append("")
        lines.append("## Breakdown by Mistake / Psychology")
        for m in report["by_mistake_tag"]:
            lines.append(f"- `{m['tag']}`: {m['trades']} trades | WR {m['win_rate']}% | Net ${m['net_pnl']:+.2f}")
        lines.append("")
        lines.append("## Recent Trades")
        lines.append("| Date | Symbol | Side | Lot | Pips | Net PnL | Setup | Mistake | Rating | Notes |")
        lines.append("| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |")
        for t in report["trades"][:50]:
            lines.append(
                f"| {t['close_date']} | {t['symbol']} | {t['side']} | {t['volume']} | "
                f"{t['pips']:+.1f}p | ${t['net_pnl']:+.2f} | {t['setup_tag'] or '-'} | "
                f"{t['mistake_tag'] or '-'} | {t['rating']}★ | {(t['notes'] or '-').replace('|', '/')} |"
            )

        with open(md_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    except Exception:
        pass
