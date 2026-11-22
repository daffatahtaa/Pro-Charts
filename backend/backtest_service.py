import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List

from cache_service import cache_service
from models import BacktestSessionSyncRequest

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKTESTS_DIR = os.path.join(ROOT_DIR, "backtests")


def _fmt_utc(ts_ms: Any) -> str:
    if not ts_ms:
        return "-"
    try:
        dt = datetime.fromtimestamp(int(ts_ms) / 1000.0, tz=timezone.utc)
        return dt.strftime("%Y-%m-%d %H:%M")
    except Exception:
        return "-"


def compute_and_export_backtest(req: BacktestSessionSyncRequest) -> Dict[str, Any]:
    os.makedirs(BACKTESTS_DIR, exist_ok=True)
    all_trades = [t.model_dump() for t in req.trades]
    closed = [
        t
        for t in all_trades
        if t["status"] in ("CLOSED_TP", "CLOSED_SL", "CLOSED_MANUAL")
    ]
    closed.sort(key=lambda x: x.get("close_time_ms") or x.get("setup_time_ms") or 0)

    total = len(closed)
    wins_list = [t for t in closed if t["pnl_money"] > 0]
    losses_list = [t for t in closed if t["pnl_money"] <= 0]
    wins = len(wins_list)
    losses = len(losses_list)
    win_rate = round((wins / total) * 100.0, 2) if total > 0 else 0.0

    gross_profit = round(sum(t["pnl_money"] for t in wins_list), 2)
    gross_loss = round(sum(t["pnl_money"] for t in losses_list), 2)  # <= 0
    net_profit = round(gross_profit + gross_loss, 2)
    final_balance = round(req.starting_balance + net_profit, 2)
    net_profit_pct = (
        round((net_profit / req.starting_balance) * 100.0, 2)
        if req.starting_balance > 0
        else 0.0
    )

    profit_factor = (
        round(gross_profit / abs(gross_loss), 2)
        if gross_loss < 0
        else (99.99 if gross_profit > 0 else 0.0)
    )

    avg_win_r = (
        round(sum(t["realized_r"] for t in wins_list) / wins, 2) if wins > 0 else 0.0
    )
    avg_loss_r = (
        round(sum(abs(t["realized_r"]) for t in losses_list) / losses, 2)
        if losses > 0
        else 0.0
    )
    win_prob = wins / total if total > 0 else 0.0
    loss_prob = losses / total if total > 0 else 0.0
    expectancy_r = round((win_prob * avg_win_r) - (loss_prob * avg_loss_r), 3)
    expectancy_money = round(net_profit / total, 2) if total > 0 else 0.0

    # Equity curve & Max Drawdown
    equity_curve: List[Dict[str, Any]] = [
        {"trade_num": 0, "balance": round(req.starting_balance, 2), "r_cum": 0.0}
    ]
    running_bal = req.starting_balance
    running_r = 0.0
    peak_bal = req.starting_balance
    max_dd_money = 0.0
    max_dd_pct = 0.0

    for idx, t in enumerate(closed, start=1):
        running_bal = round(running_bal + t["pnl_money"], 2)
        running_r = round(running_r + t["realized_r"], 2)
        if running_bal > peak_bal:
            peak_bal = running_bal
        dd_money = peak_bal - running_bal
        dd_pct = (dd_money / peak_bal) * 100.0 if peak_bal > 0 else 0.0
        if dd_money > max_dd_money:
            max_dd_money = round(dd_money, 2)
            max_dd_pct = round(dd_pct, 2)
        equity_curve.append(
            {
                "trade_num": idx,
                "balance": running_bal,
                "r_cum": running_r,
                "pnl": t["pnl_money"],
                "side": t["side"],
                "tag": t.get("strategy_tag") or "Untagged",
            }
        )

    # Session Breakdown
    session_breakdown: Dict[str, Dict[str, Any]] = {}
    for sess in ("ASIA", "LONDON", "NEW_YORK", "OVERLAP"):
        s_trades = [t for t in closed if (t.get("trading_session") or "LONDON") == sess]
        if not s_trades:
            continue
        s_wins = sum(1 for t in s_trades if t["pnl_money"] > 0)
        session_breakdown[sess] = {
            "trades": len(s_trades),
            "wins": s_wins,
            "win_rate": round((s_wins / len(s_trades)) * 100.0, 1),
            "net_r": round(sum(t["realized_r"] for t in s_trades), 2),
            "net_pnl": round(sum(t["pnl_money"] for t in s_trades), 2),
        }

    # Direction Breakdown
    direction_breakdown: Dict[str, Dict[str, Any]] = {}
    for d in ("BUY", "SELL"):
        d_trades = [t for t in closed if t["side"] == d]
        if not d_trades:
            continue
        d_wins = sum(1 for t in d_trades if t["pnl_money"] > 0)
        d_gp = sum(t["pnl_money"] for t in d_trades if t["pnl_money"] > 0)
        d_gl = abs(sum(t["pnl_money"] for t in d_trades if t["pnl_money"] <= 0))
        direction_breakdown[d] = {
            "trades": len(d_trades),
            "wins": d_wins,
            "win_rate": round((d_wins / len(d_trades)) * 100.0, 1),
            "profit_factor": round(d_gp / d_gl, 2) if d_gl > 0 else (99.99 if d_gp > 0 else 0.0),
            "net_r": round(sum(t["realized_r"] for t in d_trades), 2),
            "net_pnl": round(sum(t["pnl_money"] for t in d_trades), 2),
        }

    # Strategy Tag / Drawable Label Breakdown
    tag_groups: Dict[str, List[Dict[str, Any]]] = {}
    for t in closed:
        tag = (t.get("strategy_tag") or "").strip() or "Untagged"
        tag_groups.setdefault(tag, []).append(t)
    tag_breakdown: Dict[str, Dict[str, Any]] = {}
    for tag, group in tag_groups.items():
        g_wins = sum(1 for t in group if t["pnl_money"] > 0)
        tag_breakdown[tag] = {
            "trades": len(group),
            "wins": g_wins,
            "win_rate": round((g_wins / len(group)) * 100.0, 1),
            "net_r": round(sum(t["realized_r"] for t in group), 2),
            "net_pnl": round(sum(t["pnl_money"] for t in group), 2),
        }

    # MFE / MAE Diagnostics
    sl_trades = [t for t in closed if t["status"] == "CLOSED_SL"]
    tp_trades = [t for t in closed if t["status"] == "CLOSED_TP"]
    avg_mfe_on_sl = (
        round(sum(t["mfe_pips"] for t in sl_trades) / len(sl_trades), 1)
        if sl_trades
        else 0.0
    )
    avg_mae_on_tp = (
        round(sum(t["mae_pips"] for t in tp_trades) / len(tp_trades), 1)
        if tp_trades
        else 0.0
    )
    avg_bars_held = (
        round(sum(t["bars_held"] for t in closed) / total, 1) if total > 0 else 0.0
    )
    mfe_mae_diagnostics = {
        "avg_mfe_pips_on_sl_trades": avg_mfe_on_sl,
        "avg_mae_pips_on_tp_trades": avg_mae_on_tp,
        "avg_bars_held": avg_bars_held,
    }

    if total == 0:
        verdict = "NO CLOSED TRADES YET"
    elif profit_factor >= 1.3 and expectancy_r > 0:
        verdict = "PROFITABLE STRATEGY"
    elif profit_factor >= 1.0 and expectancy_r >= 0:
        verdict = "MARGINAL / BREAKEVEN"
    else:
        verdict = "UNPROFITABLE / NEEDS TUNING"

    latest_json_path = os.path.join(BACKTESTS_DIR, "latest_backtest.json")
    latest_md_path = os.path.join(BACKTESTS_DIR, "latest_report.md")
    session_json_path = os.path.join(BACKTESTS_DIR, f"session_{req.session_id}.json")

    analytics = {
        "session_id": req.session_id,
        "name": req.name,
        "symbol": req.symbol,
        "timeframe": req.timeframe,
        "starting_balance": round(req.starting_balance, 2),
        "final_balance": final_balance,
        "net_profit": net_profit,
        "net_profit_pct": net_profit_pct,
        "total_trades": total,
        "wins": wins,
        "losses": losses,
        "win_rate": win_rate,
        "gross_profit": gross_profit,
        "gross_loss": gross_loss,
        "profit_factor": profit_factor,
        "expectancy_money": expectancy_money,
        "expectancy_r": expectancy_r,
        "avg_win_r": avg_win_r,
        "avg_loss_r": avg_loss_r,
        "max_drawdown_money": max_dd_money,
        "max_drawdown_pct": max_dd_pct,
        "verdict": verdict,
        "equity_curve": equity_curve,
        "session_breakdown": session_breakdown,
        "direction_breakdown": direction_breakdown,
        "tag_breakdown": tag_breakdown,
        "mfe_mae_diagnostics": mfe_mae_diagnostics,
        "report_json_path": latest_json_path,
        "report_md_path": latest_md_path,
    }

    # 1. Persist to DuckDB
    cache_service.save_backtest_session(
        session_id=req.session_id,
        name=req.name,
        symbol=req.symbol,
        timeframe=req.timeframe,
        starting_balance=req.starting_balance,
        final_balance=final_balance,
        notes=req.notes,
        metrics=analytics,
        trades=all_trades,
    )

    # 2. Export AI-readable JSON files
    full_payload = {
        "exported_at_utc": datetime.now(timezone.utc).isoformat(),
        "notes": req.notes,
        "analytics": analytics,
        "trades": all_trades,
    }
    for p in (latest_json_path, session_json_path):
        with open(p, "w", encoding="utf-8") as f:
            json.dump(full_payload, f, indent=2)

    # 3. Export AI-readable Markdown Report
    md_lines = [
        f"# Strategy Backtest Report — Session: {req.name}",
        f"- **Symbol / TF**: {req.symbol} ({req.timeframe})",
        f"- **Initial Balance**: ${req.starting_balance:,.2f} -> **Final Balance**: ${final_balance:,.2f} ({net_profit_pct:+.2f}%)",
        f"- **Verdict**: **{verdict}** (Profit Factor: {profit_factor:.2f} | Expectancy: {expectancy_r:+.2f}R / trade)",
        f"- **Notes**: {req.notes or '-'}",
        "",
        "## 1. Core Performance Metrics",
        "| Metric | Value |",
        "| :--- | :--- |",
        f"| Total Closed Trades | {total} ({wins} Wins / {losses} Losses) |",
        f"| Win Rate | {win_rate:.2f}% |",
        f"| Profit Factor | {profit_factor:.2f} |",
        f"| Expectancy | ${expectancy_money:+.2f} ({expectancy_r:+.3f}R per trade) |",
        f"| Avg Winner / Avg Loser | +{avg_win_r:.2f}R / -{avg_loss_r:.2f}R |",
        f"| Max Drawdown | ${max_dd_money:,.2f} ({max_dd_pct:.2f}%) |",
        f"| Avg MFE on SL Trades | {avg_mfe_on_sl:.1f} pips |",
        f"| Avg MAE on TP Trades | {avg_mae_on_tp:.1f} pips |",
        f"| Avg Bars Held | {avg_bars_held:.1f} bars |",
        "",
        "## 2. Session & Direction Breakdown",
    ]
    if session_breakdown:
        for sess, s in session_breakdown.items():
            md_lines.append(
                f"- **{sess}**: {s['trades']} trades | Winrate: {s['win_rate']}% | Net: {s['net_r']:+.2f}R (${s['net_pnl']:+.2f})"
            )
    else:
        md_lines.append("- No closed session data yet.")

    if direction_breakdown:
        md_lines.append("")
        for d, s in direction_breakdown.items():
            md_lines.append(
                f"- **{d}**: {s['trades']} trades | Winrate: {s['win_rate']}% | PF: {s['profit_factor']} | Net: {s['net_r']:+.2f}R"
            )

    md_lines.extend(["", "## 3. Strategy Tag / Drawable Label Breakdown"])
    if tag_breakdown:
        for tag, s in tag_breakdown.items():
            md_lines.append(
                f"- **`{tag}`**: {s['trades']} trades | Winrate: {s['win_rate']}% | Net: {s['net_r']:+.2f}R (${s['net_pnl']:+.2f})"
            )
    else:
        md_lines.append("- No tagged trades yet.")

    md_lines.extend(
        [
            "",
            "## 4. Trade-by-Trade Log (With MFE/MAE & Confluences)",
            "| # | Side | Open Time (UTC) | Session | Tag | Entry | SL | TP | Exit | Result | R-Mult | MFE (pips) | MAE (pips) | Bars | Confluences |",
            "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
        ]
    )
    for idx, t in enumerate(closed, start=1):
        conf = ", ".join(t.get("confluences") or []) or "-"
        md_lines.append(
            f"| {idx} | {t['side']} | {_fmt_utc(t.get('open_time_ms'))} | {t.get('trading_session', '-')} | "
            f"{t.get('strategy_tag') or '-'} | {t['entry_price']} | {t.get('sl', 0)} | {t.get('tp', 0)} | "
            f"{t.get('exit_price', '-')} | {t['status']} | {t['realized_r']:+.2f}R | "
            f"{t['mfe_pips']:.1f} | {t['mae_pips']:.1f} | {t['bars_held']} | {conf} |"
        )

    with open(latest_md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(md_lines) + "\n")

    return analytics
