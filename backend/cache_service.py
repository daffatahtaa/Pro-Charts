import json
import logging
import os
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

import duckdb

from models import DrawingModel, PriceAlertModel
from mt5_service import mt5_service, normalize_tf_code, parse_tf_seconds

logger = logging.getLogger("cache_service")

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
DB_PATH = os.path.join(DATA_DIR, "market_cache.duckdb")


class CacheService:
    def __init__(self, db_path: str = DB_PATH) -> None:
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self._lock = threading.Lock()
        self.db_path = db_path
        self.conn = duckdb.connect(self.db_path)
        self._init_schema()

    def _init_schema(self) -> None:
        with self._lock:
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS ohlcv_candles (
                    symbol VARCHAR NOT NULL,
                    timeframe VARCHAR NOT NULL,
                    timestamp BIGINT NOT NULL,
                    open DOUBLE NOT NULL,
                    high DOUBLE NOT NULL,
                    low DOUBLE NOT NULL,
                    close DOUBLE NOT NULL,
                    volume DOUBLE NOT NULL,
                    spread INTEGER DEFAULT 0,
                    PRIMARY KEY (symbol, timeframe, timestamp)
                );
                """
            )
            self.conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_ohlcv_lookup
                ON ohlcv_candles (symbol, timeframe, timestamp);
                """
            )
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS symbol_metadata (
                    symbol VARCHAR PRIMARY KEY,
                    description VARCHAR,
                    category VARCHAR,
                    digits INTEGER NOT NULL,
                    point DOUBLE NOT NULL,
                    updated_at BIGINT NOT NULL
                );
                """
            )
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS chart_drawings (
                    id VARCHAR PRIMARY KEY,
                    symbol VARCHAR NOT NULL,
                    timeframe VARCHAR NOT NULL,
                    name VARCHAR NOT NULL,
                    points_json VARCHAR NOT NULL,
                    styles_json VARCHAR NOT NULL,
                    extend_data_json VARCHAR DEFAULT '{}',
                    locked BOOLEAN DEFAULT FALSE,
                    visible BOOLEAN DEFAULT TRUE,
                    sort_order INTEGER DEFAULT 0,
                    created_at BIGINT DEFAULT 0,
                    updated_at BIGINT NOT NULL
                );
                """
            )
            # Idempotent schema migrations for existing DuckDB files (preserve Z-order across edits/hides)
            self.conn.execute(
                "ALTER TABLE chart_drawings ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;"
            )
            self.conn.execute(
                "ALTER TABLE chart_drawings ADD COLUMN IF NOT EXISTS created_at BIGINT DEFAULT 0;"
            )
            self.conn.execute(
                """
                WITH ranked AS (
                    SELECT id,
                           ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY updated_at ASC, id ASC) AS rn,
                           updated_at
                    FROM chart_drawings
                    WHERE sort_order IS NULL OR sort_order = 0
                )
                UPDATE chart_drawings
                SET sort_order = ranked.rn,
                    created_at = CASE
                        WHEN chart_drawings.created_at IS NULL OR chart_drawings.created_at = 0
                        THEN ranked.updated_at
                        ELSE chart_drawings.created_at
                    END
                FROM ranked
                WHERE chart_drawings.id = ranked.id;
                """
            )
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS price_alerts (
                    id VARCHAR PRIMARY KEY,
                    symbol VARCHAR NOT NULL,
                    price DOUBLE NOT NULL,
                    condition VARCHAR NOT NULL DEFAULT 'CROSSING',
                    note VARCHAR DEFAULT '',
                    active BOOLEAN DEFAULT TRUE,
                    triggered BOOLEAN DEFAULT FALSE,
                    created_at BIGINT NOT NULL
                );
                """
            )
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS saved_mt5_accounts (
                    login BIGINT PRIMARY KEY,
                    password VARCHAR NOT NULL,
                    server VARCHAR NOT NULL,
                    account_name VARCHAR DEFAULT '',
                    company VARCHAR DEFAULT '',
                    currency VARCHAR DEFAULT 'USD',
                    is_last_active BOOLEAN DEFAULT FALSE,
                    updated_at BIGINT NOT NULL
                );
                """
            )
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS custom_broker_servers (
                    server_name VARCHAR PRIMARY KEY,
                    broker_name VARCHAR NOT NULL,
                    created_at BIGINT NOT NULL
                );
                """
            )
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS backtest_sessions (
                    session_id VARCHAR PRIMARY KEY,
                    name VARCHAR NOT NULL,
                    symbol VARCHAR NOT NULL,
                    timeframe VARCHAR NOT NULL,
                    starting_balance DOUBLE NOT NULL,
                    final_balance DOUBLE NOT NULL,
                    notes VARCHAR DEFAULT '',
                    metrics_json VARCHAR DEFAULT '{}',
                    updated_at BIGINT NOT NULL
                );
                """
            )
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS backtest_trades (
                    id VARCHAR PRIMARY KEY,
                    session_id VARCHAR NOT NULL,
                    symbol VARCHAR NOT NULL,
                    timeframe VARCHAR NOT NULL,
                    side VARCHAR NOT NULL,
                    order_type VARCHAR NOT NULL,
                    volume DOUBLE NOT NULL,
                    risk_pct DOUBLE DEFAULT 1.0,
                    risk_amount DOUBLE DEFAULT 100.0,
                    planned_rr DOUBLE DEFAULT 0.0,
                    entry_price DOUBLE NOT NULL,
                    sl DOUBLE DEFAULT 0.0,
                    tp DOUBLE DEFAULT 0.0,
                    exit_price DOUBLE,
                    status VARCHAR NOT NULL,
                    setup_time_ms BIGINT NOT NULL,
                    open_time_ms BIGINT,
                    close_time_ms BIGINT,
                    trading_session VARCHAR DEFAULT 'LONDON',
                    pnl_money DOUBLE DEFAULT 0.0,
                    pnl_pips DOUBLE DEFAULT 0.0,
                    realized_r DOUBLE DEFAULT 0.0,
                    mfe_pips DOUBLE DEFAULT 0.0,
                    mae_pips DOUBLE DEFAULT 0.0,
                    bars_held INTEGER DEFAULT 0,
                    strategy_tag VARCHAR DEFAULT '',
                    confluences_json VARCHAR DEFAULT '[]',
                    notes VARCHAR DEFAULT ''
                );
                """
            )
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS trade_journal_meta (
                    trade_key VARCHAR PRIMARY KEY,
                    account_login BIGINT NOT NULL,
                    position_id BIGINT NOT NULL,
                    symbol VARCHAR NOT NULL,
                    setup_tag VARCHAR DEFAULT '',
                    mistake_tag VARCHAR DEFAULT '',
                    emotion VARCHAR DEFAULT 'Calm',
                    rating INTEGER DEFAULT 0,
                    notes VARCHAR DEFAULT '',
                    updated_at BIGINT NOT NULL
                );
                """
            )
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS daily_journal_notes (
                    day_key VARCHAR PRIMARY KEY,
                    account_login BIGINT NOT NULL,
                    date_str VARCHAR NOT NULL,
                    mood VARCHAR DEFAULT 'Neutral',
                    summary_note VARCHAR DEFAULT '',
                    updated_at BIGINT NOT NULL
                );
                """
            )

        # Clean any polluted future mock candles if MT5 is connected
        self._cleanup_future_mock_candles()

    def _cleanup_future_mock_candles(self) -> None:
        if not mt5_service.connected:
            return
        latest_broker_ts = mt5_service.get_latest_broker_timestamp_ms()
        if latest_broker_ts is None:
            return
        cutoff = latest_broker_ts + 86400_000
        with self._lock:
            row = self.conn.execute(
                "SELECT COUNT(*) FROM ohlcv_candles WHERE timestamp > ?", (cutoff,)
            ).fetchone()
            polluted = int(row[0]) if row else 0
            if polluted > 0:
                self.conn.execute("DELETE FROM ohlcv_candles WHERE timestamp > ?", (cutoff,))
                logger.info(
                    "Cleaned %d future/mock candles (> %d) from DuckDB cache.",
                    polluted,
                    cutoff,
                )

    def close(self) -> None:
        with self._lock:
            try:
                self.conn.close()
            except Exception:
                pass

    def get_total_cached_candles(self) -> int:
        with self._lock:
            row = self.conn.execute("SELECT COUNT(*) FROM ohlcv_candles").fetchone()
            return int(row[0]) if row else 0

    def get_cached_counts_by_symbol(self) -> Dict[str, int]:
        with self._lock:
            rows = self.conn.execute(
                "SELECT symbol, COUNT(*) FROM ohlcv_candles GROUP BY symbol"
            ).fetchall()
            return {r[0]: int(r[1]) for r in rows}

    def upsert_candles(self, symbol: str, tf: str, candles: List[Dict[str, Any]]) -> None:
        if not candles:
            return
        ts_list = [int(c["timestamp"]) for c in candles]
        o_list = [float(c["open"]) for c in candles]
        h_list = [float(c["high"]) for c in candles]
        l_list = [float(c["low"]) for c in candles]
        c_list = [float(c["close"]) for c in candles]
        v_list = [float(c.get("volume", 0.0)) for c in candles]
        s_list = [int(c.get("spread", 0)) for c in candles]
        with self._lock:
            self.conn.execute(
                """
                INSERT OR REPLACE INTO ohlcv_candles
                    (symbol, timeframe, timestamp, open, high, low, close, volume, spread)
                SELECT ?, ?,
                    unnest(?::BIGINT[]),
                    unnest(?::DOUBLE[]),
                    unnest(?::DOUBLE[]),
                    unnest(?::DOUBLE[]),
                    unnest(?::DOUBLE[]),
                    unnest(?::DOUBLE[]),
                    unnest(?::INTEGER[])
                """,
                (symbol, tf, ts_list, o_list, h_list, l_list, c_list, v_list, s_list),
            )

    def upsert_symbol_metadata(self, spec: Dict[str, Any]) -> None:
        now_ms = int(time.time() * 1000)
        with self._lock:
            self.conn.execute(
                """
                INSERT OR REPLACE INTO symbol_metadata
                    (symbol, description, category, digits, point, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    spec["symbol"],
                    spec.get("description", spec["symbol"]),
                    spec.get("category", "Other"),
                    int(spec.get("digits", 5)),
                    float(spec.get("point", 0.00001)),
                    now_ms,
                ),
            )

    def get_candles(
        self,
        symbol: str,
        tf: str,
        limit: int = 1500,
        before_ts: Optional[int] = None,
    ) -> Tuple[List[Dict[str, Any]], bool]:
        """
        Smart Read-Through & Delta Sync Engine.
        Returns (candles_asc, has_more).
        """
        norm_tf = normalize_tf_code(tf) or tf
        tf_seconds = parse_tf_seconds(norm_tf) or 900
        tf = norm_tf
        now_ms = int(time.time() * 1000)

        if before_ts is None:
            # Case A: Initial Load / Latest
            with self._lock:
                row = self.conn.execute(
                    """
                    SELECT MAX(timestamp) AS max_ts, COUNT(*) AS cnt
                    FROM ohlcv_candles
                    WHERE symbol = ? AND timeframe = ?
                    """,
                    (symbol, tf),
                ).fetchone()
            max_ts = row[0] if row else None
            cnt = int(row[1]) if row else 0

            if cnt == 0 or max_ts is None:
                # Cache Miss: Deep initial batch (10,000 bars)
                fetched = mt5_service.fetch_latest_candles(symbol, tf, count=max(limit, 10000))
                self.upsert_candles(symbol, tf, fetched)
            else:
                # Cache Hit -> Delta Sync (anchor to broker time when connected)
                ref_now_ms = mt5_service.get_latest_broker_timestamp_ms() or now_ms
                bars_to_fetch = min(
                    5000, max(10, int(abs(ref_now_ms - int(max_ts)) / (tf_seconds * 1000)) + 10)
                )
                fetched = mt5_service.fetch_latest_candles(symbol, tf, count=bars_to_fetch)
                self.upsert_candles(symbol, tf, fetched)

            with self._lock:
                rows = self.conn.execute(
                    """
                    SELECT timestamp, open, high, low, close, volume, spread
                    FROM (
                        SELECT * FROM ohlcv_candles
                        WHERE symbol = ? AND timeframe = ?
                        ORDER BY timestamp DESC
                        LIMIT ?
                    ) sub
                    ORDER BY timestamp ASC
                    """,
                    (symbol, tf, limit),
                ).fetchall()

            candles = [
                {
                    "timestamp": int(r[0]),
                    "open": float(r[1]),
                    "high": float(r[2]),
                    "low": float(r[3]),
                    "close": float(r[4]),
                    "volume": float(r[5]),
                    "spread": int(r[6]),
                }
                for r in rows
            ]
            has_more = len(candles) >= min(limit, 50)
            return candles, has_more

        else:
            # Case B: Lazy Scroll to Past (before_ts in ms)
            with self._lock:
                row = self.conn.execute(
                    """
                    SELECT COUNT(*) FROM ohlcv_candles
                    WHERE symbol = ? AND timeframe = ? AND timestamp < ?
                    """,
                    (symbol, tf, int(before_ts)),
                ).fetchone()
                total_row = self.conn.execute(
                    "SELECT COUNT(*) FROM ohlcv_candles WHERE symbol = ? AND timeframe = ?",
                    (symbol, tf),
                ).fetchone()
            existing_before = int(row[0]) if row else 0
            total_cached_for_pair = int(total_row[0]) if total_row else 0

            if existing_before < limit:
                fetched = mt5_service.fetch_candles_before(
                    symbol,
                    tf,
                    int(before_ts),
                    count=max(limit, 5000),
                    offset_pos=total_cached_for_pair,
                )
                self.upsert_candles(symbol, tf, fetched)

            with self._lock:
                rows = self.conn.execute(
                    """
                    SELECT timestamp, open, high, low, close, volume, spread
                    FROM (
                        SELECT * FROM ohlcv_candles
                        WHERE symbol = ? AND timeframe = ? AND timestamp < ?
                        ORDER BY timestamp DESC
                        LIMIT ?
                    ) sub
                    ORDER BY timestamp ASC
                    """,
                    (symbol, tf, int(before_ts), limit),
                ).fetchall()

            candles = [
                {
                    "timestamp": int(r[0]),
                    "open": float(r[1]),
                    "high": float(r[2]),
                    "low": float(r[3]),
                    "close": float(r[4]),
                    "volume": float(r[5]),
                    "spread": int(r[6]),
                }
                for r in rows
            ]
            has_more = len(candles) > 0
            return candles, has_more

    def get_candles_window(
        self,
        symbol: str,
        tf: str,
        center_ts: int,
        before_bars: int = 400,
        after_bars: int = 1500,
    ) -> Tuple[List[Dict[str, Any]], bool]:
        norm_tf = normalize_tf_code(tf) or tf
        tf_seconds = parse_tf_seconds(norm_tf) or 900
        tf_ms = tf_seconds * 1000
        now_ms = mt5_service.get_latest_broker_timestamp_ms() or int(time.time() * 1000)

        start_ms = max(0, int(center_ts) - int(before_bars) * tf_ms)
        end_ms = min(now_ms, int(center_ts) + int(after_bars) * tf_ms)

        with self._lock:
            row = self.conn.execute(
                """
                SELECT
                    SUM(CASE WHEN timestamp < ? THEN 1 ELSE 0 END) AS before_cnt,
                    MAX(timestamp) AS max_ts,
                    COUNT(*) AS total_cnt
                FROM ohlcv_candles
                WHERE symbol = ? AND timeframe = ? AND timestamp >= ? AND timestamp <= ?
                """,
                (center_ts, symbol, norm_tf, start_ms, end_ms),
            ).fetchone()

        before_cnt = int(row[0] or 0) if row else 0
        cached_max_ts = int(row[1] or 0) if row and row[1] is not None else 0
        total_cnt = int(row[2] or 0) if row else 0

        need_fetch = (
            total_cnt == 0
            or before_cnt < min(100, max(10, before_bars // 2))
            or (end_ms - cached_max_ts) > tf_ms * 20
        )
        if need_fetch:
            fetched = mt5_service.fetch_candles_range(symbol, norm_tf, start_ms, end_ms)
            if fetched:
                self.upsert_candles(symbol, norm_tf, fetched)

        with self._lock:
            rows = self.conn.execute(
                """
                SELECT timestamp, open, high, low, close, volume, spread
                FROM ohlcv_candles
                WHERE symbol = ? AND timeframe = ? AND timestamp >= ? AND timestamp <= ?
                ORDER BY timestamp ASC
                LIMIT 5000
                """,
                (symbol, norm_tf, start_ms, end_ms),
            ).fetchall()

        candles = [
            {
                "timestamp": int(r[0]),
                "open": float(r[1]),
                "high": float(r[2]),
                "low": float(r[3]),
                "close": float(r[4]),
                "volume": float(r[5]),
                "spread": int(r[6]),
            }
            for r in rows
        ]
        has_more_after = len(candles) > 0 and (candles[-1]["timestamp"] + tf_ms < now_ms)
        return candles, has_more_after

    def get_earliest_candles(
        self, symbol: str, tf: str, limit: int = 3000
    ) -> Tuple[List[Dict[str, Any]], bool]:
        norm_tf = normalize_tf_code(tf) or tf
        tf_seconds = parse_tf_seconds(norm_tf) or 900
        tf_ms = tf_seconds * 1000
        now_ms = mt5_service.get_latest_broker_timestamp_ms() or int(time.time() * 1000)

        fetched = mt5_service.fetch_earliest_candles(symbol, norm_tf, limit=limit)
        if fetched:
            self.upsert_candles(symbol, norm_tf, fetched)

        with self._lock:
            rows = self.conn.execute(
                """
                SELECT timestamp, open, high, low, close, volume, spread
                FROM ohlcv_candles
                WHERE symbol = ? AND timeframe = ?
                ORDER BY timestamp ASC
                LIMIT ?
                """,
                (symbol, norm_tf, limit),
            ).fetchall()

        candles = [
            {
                "timestamp": int(r[0]),
                "open": float(r[1]),
                "high": float(r[2]),
                "low": float(r[3]),
                "close": float(r[4]),
                "volume": float(r[5]),
                "spread": int(r[6]),
            }
            for r in rows
        ]
        has_more_after = len(candles) > 0 and (candles[-1]["timestamp"] + tf_ms < now_ms)
        return candles, has_more_after

    # --- Drawings CRUD ---

    def get_drawings(self, symbol: str) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self.conn.execute(
                """
                SELECT id, symbol, timeframe, name, points_json, styles_json,
                       extend_data_json, locked, visible, updated_at, sort_order, created_at
                FROM chart_drawings
                WHERE symbol = ?
                ORDER BY sort_order ASC, created_at ASC, id ASC
                """,
                (symbol,),
            ).fetchall()

        results: List[Dict[str, Any]] = []
        for r in rows:
            results.append(
                {
                    "id": r[0],
                    "symbol": r[1],
                    "timeframe": r[2],
                    "name": r[3],
                    "points": json.loads(r[4]) if r[4] else [],
                    "styles": json.loads(r[5]) if r[5] else {},
                    "extendData": json.loads(r[6]) if r[6] else {},
                    "locked": bool(r[7]),
                    "visible": bool(r[8]),
                    "updated_at": int(r[9]),
                    "sort_order": int(r[10] or 0),
                    "created_at": int(r[11] or r[9]),
                }
            )
        return results

    def upsert_drawing(self, drawing: DrawingModel) -> Dict[str, Any]:
        now_ms = int(time.time() * 1000)
        with self._lock:
            existing = self.conn.execute(
                "SELECT sort_order, created_at FROM chart_drawings WHERE id = ?",
                (drawing.id,),
            ).fetchone()
            if existing:
                prev_sort = int(existing[0] or 0)
                prev_created = int(existing[1] or now_ms)
                sort_order = (
                    int(drawing.sort_order)
                    if (drawing.sort_order is not None and drawing.sort_order > 0)
                    else prev_sort
                )
                created_at = prev_created if prev_created > 0 else (drawing.created_at or now_ms)
            else:
                if drawing.sort_order is not None and drawing.sort_order > 0:
                    sort_order = int(drawing.sort_order)
                else:
                    max_row = self.conn.execute(
                        "SELECT COALESCE(MAX(sort_order), 0) FROM chart_drawings WHERE symbol = ?",
                        (drawing.symbol,),
                    ).fetchone()
                    sort_order = int(max_row[0] or 0) + 1
                created_at = int(drawing.created_at) if drawing.created_at else now_ms

            self.conn.execute(
                """
                INSERT OR REPLACE INTO chart_drawings
                    (id, symbol, timeframe, name, points_json, styles_json,
                     extend_data_json, locked, visible, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    drawing.id,
                    drawing.symbol,
                    drawing.timeframe,
                    drawing.name,
                    json.dumps(drawing.points),
                    json.dumps(drawing.styles),
                    json.dumps(drawing.extendData if drawing.extendData is not None else {}),
                    bool(drawing.locked),
                    bool(drawing.visible),
                    sort_order,
                    created_at,
                    now_ms,
                ),
            )
        data = drawing.model_dump()
        data["sort_order"] = sort_order
        data["created_at"] = created_at
        data["updated_at"] = now_ms
        return data

    def delete_drawing(self, drawing_id: str) -> bool:
        with self._lock:
            self.conn.execute("DELETE FROM chart_drawings WHERE id = ?", (drawing_id,))
        return True

    def delete_drawings_by_symbol(self, symbol: str) -> bool:
        with self._lock:
            self.conn.execute("DELETE FROM chart_drawings WHERE symbol = ?", (symbol,))
        return True

    # --- Price Alerts CRUD ---

    def get_alerts(self, symbol: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._lock:
            if symbol:
                rows = self.conn.execute(
                    """
                    SELECT id, symbol, price, condition, note, active, triggered, created_at
                    FROM price_alerts
                    WHERE symbol = ?
                    ORDER BY created_at DESC
                    """,
                    (symbol,),
                ).fetchall()
            else:
                rows = self.conn.execute(
                    """
                    SELECT id, symbol, price, condition, note, active, triggered, created_at
                    FROM price_alerts
                    ORDER BY created_at DESC
                    """
                ).fetchall()

        return [
            {
                "id": r[0],
                "symbol": r[1],
                "price": float(r[2]),
                "condition": r[3],
                "note": r[4] or "",
                "active": bool(r[5]),
                "triggered": bool(r[6]),
                "created_at": int(r[7]),
            }
            for r in rows
        ]

    def upsert_alert(self, alert: PriceAlertModel) -> Dict[str, Any]:
        created_ms = alert.created_at or int(time.time() * 1000)
        with self._lock:
            self.conn.execute(
                """
                INSERT OR REPLACE INTO price_alerts
                    (id, symbol, price, condition, note, active, triggered, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    alert.id,
                    alert.symbol,
                    float(alert.price),
                    alert.condition,
                    alert.note or "",
                    bool(alert.active),
                    bool(alert.triggered),
                    int(created_ms),
                ),
            )
        data = alert.model_dump()
        data["created_at"] = int(created_ms)
        return data

    def delete_alert(self, alert_id: str) -> bool:
        with self._lock:
            self.conn.execute("DELETE FROM price_alerts WHERE id = ?", (alert_id,))
        return True

    # --- Saved MT5 Accounts CRUD ---

    def get_saved_accounts(self) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self.conn.execute(
                """
                SELECT login, server, account_name, company, currency,
                       is_last_active, updated_at
                FROM saved_mt5_accounts
                ORDER BY is_last_active DESC, updated_at DESC
                """
            ).fetchall()
        return [
            {
                "login": int(r[0]),
                "server": r[1],
                "account_name": r[2] or "",
                "company": r[3] or "",
                "currency": r[4] or "USD",
                "has_saved_password": True,
                "is_last_active": bool(r[5]),
                "updated_at": int(r[6]),
            }
            for r in rows
        ]

    def get_saved_account_password(self, login: int) -> Optional[Tuple[str, str]]:
        with self._lock:
            row = self.conn.execute(
                "SELECT password, server FROM saved_mt5_accounts WHERE login = ?",
                (int(login),),
            ).fetchone()
        if not row:
            return None
        return (str(row[0]), str(row[1]))

    def upsert_saved_account(
        self,
        login: int,
        password: str,
        server: str,
        account_name: str = "",
        company: str = "",
        currency: str = "USD",
    ) -> None:
        now_ms = int(time.time() * 1000)
        with self._lock:
            self.conn.execute("UPDATE saved_mt5_accounts SET is_last_active = FALSE")
            self.conn.execute(
                """
                INSERT OR REPLACE INTO saved_mt5_accounts
                    (login, password, server, account_name, company, currency, is_last_active, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, TRUE, ?)
                """,
                (int(login), password, server, account_name, company, currency, now_ms),
            )

    def delete_saved_account(self, login: int) -> bool:
        with self._lock:
            self.conn.execute("DELETE FROM saved_mt5_accounts WHERE login = ?", (int(login),))
        return True

    # --- Custom Broker Servers CRUD ---

    def get_custom_broker_servers(self) -> List[Dict[str, str]]:
        with self._lock:
            rows = self.conn.execute(
                "SELECT broker_name, server_name FROM custom_broker_servers ORDER BY created_at DESC"
            ).fetchall()
        return [{"broker_name": r[0], "server_name": r[1]} for r in rows]

    def upsert_custom_broker_server(self, broker_name: str, server_name: str) -> Dict[str, str]:
        now_ms = int(time.time() * 1000)
        sn = server_name.strip()
        bn = (broker_name or "Custom Broker").strip()
        with self._lock:
            self.conn.execute(
                """
                INSERT OR REPLACE INTO custom_broker_servers (server_name, broker_name, created_at)
                VALUES (?, ?, ?)
                """,
                (sn, bn, now_ms),
            )
        return {"broker_name": bn, "server_name": sn}

    # --- Backtest Sessions & Trades CRUD ---

    def save_backtest_session(
        self,
        session_id: str,
        name: str,
        symbol: str,
        timeframe: str,
        starting_balance: float,
        final_balance: float,
        notes: str,
        metrics: Dict[str, Any],
        trades: List[Dict[str, Any]],
    ) -> None:
        now_ms = int(time.time() * 1000)
        with self._lock:
            self.conn.execute(
                """
                INSERT OR REPLACE INTO backtest_sessions
                    (session_id, name, symbol, timeframe, starting_balance, final_balance, notes, metrics_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    name,
                    symbol,
                    timeframe,
                    float(starting_balance),
                    float(final_balance),
                    notes or "",
                    json.dumps(metrics),
                    now_ms,
                ),
            )
            self.conn.execute("DELETE FROM backtest_trades WHERE session_id = ?", (session_id,))
            if trades:
                params = [
                    (
                        t["id"],
                        session_id,
                        t["symbol"],
                        t["timeframe"],
                        t["side"],
                        t.get("order_type", "MARKET"),
                        float(t.get("volume", 0.01)),
                        float(t.get("risk_pct", 1.0)),
                        float(t.get("risk_amount", 100.0)),
                        float(t.get("planned_rr", 0.0)),
                        float(t["entry_price"]),
                        float(t.get("sl", 0.0)),
                        float(t.get("tp", 0.0)),
                        float(t["exit_price"]) if t.get("exit_price") is not None else None,
                        t["status"],
                        int(t["setup_time_ms"]),
                        int(t["open_time_ms"]) if t.get("open_time_ms") is not None else None,
                        int(t["close_time_ms"]) if t.get("close_time_ms") is not None else None,
                        t.get("trading_session", "LONDON"),
                        float(t.get("pnl_money", 0.0)),
                        float(t.get("pnl_pips", 0.0)),
                        float(t.get("realized_r", 0.0)),
                        float(t.get("mfe_pips", 0.0)),
                        float(t.get("mae_pips", 0.0)),
                        int(t.get("bars_held", 0)),
                        t.get("strategy_tag", ""),
                        json.dumps(t.get("confluences", [])),
                        t.get("notes", ""),
                    )
                    for t in trades
                ]
                self.conn.executemany(
                    """
                    INSERT OR REPLACE INTO backtest_trades
                        (id, session_id, symbol, timeframe, side, order_type, volume,
                         risk_pct, risk_amount, planned_rr, entry_price, sl, tp, exit_price,
                         status, setup_time_ms, open_time_ms, close_time_ms, trading_session,
                         pnl_money, pnl_pips, realized_r, mfe_pips, mae_pips, bars_held,
                         strategy_tag, confluences_json, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    params,
                )

    def list_backtest_sessions(self) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self.conn.execute(
                """
                SELECT session_id, name, symbol, timeframe, starting_balance,
                       final_balance, notes, metrics_json, updated_at
                FROM backtest_sessions
                ORDER BY updated_at DESC
                LIMIT 30
                """
            ).fetchall()
        return [
            {
                "session_id": r[0],
                "name": r[1],
                "symbol": r[2],
                "timeframe": r[3],
                "starting_balance": float(r[4]),
                "final_balance": float(r[5]),
                "notes": r[6] or "",
                "metrics": json.loads(r[7]) if r[7] else {},
                "updated_at": int(r[8]),
            }
            for r in rows
        ]

    def get_backtest_report(self, session_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        with self._lock:
            if session_id:
                row = self.conn.execute(
                    """
                    SELECT session_id, name, symbol, timeframe, starting_balance,
                           final_balance, notes, metrics_json, updated_at
                    FROM backtest_sessions WHERE session_id = ?
                    """,
                    (session_id,),
                ).fetchone()
            else:
                row = self.conn.execute(
                    """
                    SELECT session_id, name, symbol, timeframe, starting_balance,
                           final_balance, notes, metrics_json, updated_at
                    FROM backtest_sessions ORDER BY updated_at DESC LIMIT 1
                    """
                ).fetchone()
        if not row:
            return None
        return {
            "session_id": row[0],
            "name": row[1],
            "symbol": row[2],
            "timeframe": row[3],
            "starting_balance": float(row[4]),
            "final_balance": float(row[5]),
            "notes": row[6] or "",
            "analytics": json.loads(row[7]) if row[7] else {},
            "updated_at": int(row[8]),
        }

    def get_all_paper_closed_trades(self) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self.conn.execute(
                """
                SELECT id, session_id, symbol, timeframe, side, volume,
                       entry_price, exit_price, open_time_ms, close_time_ms,
                       trading_session, pnl_money, pnl_pips, strategy_tag, notes
                FROM backtest_trades
                WHERE status IN ('CLOSED_TP', 'CLOSED_SL', 'CLOSED_MANUAL')
                ORDER BY close_time_ms DESC
                """
            ).fetchall()
        out = []
        for idx, r in enumerate(rows, start=1):
            out.append(
                {
                    "id": r[0],
                    "position_id": abs(hash(r[0])) % 10**9 or idx,
                    "symbol": r[2],
                    "side": r[4],
                    "volume": float(r[5]),
                    "entry_price": float(r[6]),
                    "exit_price": float(r[7] if r[7] is not None else r[6]),
                    "open_time_ms": int(r[8] or 0),
                    "close_time_ms": int(r[9] or r[8] or 0),
                    "session": r[10] or "LONDON",
                    "net_pnl": round(float(r[11]), 2),
                    "pips": round(float(r[12]), 1),
                    "setup_tag": r[13] or "",
                    "notes": r[14] or "",
                }
            )
        return out

    # --- Trade Journal Metadata & Daily Notes CRUD ---

    def get_journal_meta_map(self, account_login: int) -> Dict[str, Dict[str, Any]]:
        with self._lock:
            rows = self.conn.execute(
                """
                SELECT trade_key, setup_tag, mistake_tag, emotion, rating, notes
                FROM trade_journal_meta
                WHERE account_login = ?
                """,
                (int(account_login),),
            ).fetchall()
        return {
            r[0]: {
                "setup_tag": r[1] or "",
                "mistake_tag": r[2] or "",
                "emotion": r[3] or "Calm",
                "rating": int(r[4] or 0),
                "notes": r[5] or "",
            }
            for r in rows
        }

    def upsert_journal_meta(
        self,
        account_login: int,
        position_id: int,
        symbol: str,
        setup_tag: str,
        mistake_tag: str,
        emotion: str,
        rating: int,
        notes: str,
    ) -> Dict[str, Any]:
        trade_key = f"{int(account_login)}_{int(position_id)}"
        now_ms = int(time.time() * 1000)
        with self._lock:
            self.conn.execute(
                """
                INSERT OR REPLACE INTO trade_journal_meta
                    (trade_key, account_login, position_id, symbol, setup_tag,
                     mistake_tag, emotion, rating, notes, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    trade_key,
                    int(account_login),
                    int(position_id),
                    symbol,
                    setup_tag,
                    mistake_tag,
                    emotion,
                    max(0, min(5, int(rating))),
                    notes,
                    now_ms,
                ),
            )
        return {
            "trade_key": trade_key,
            "account_login": int(account_login),
            "position_id": int(position_id),
            "setup_tag": setup_tag,
            "mistake_tag": mistake_tag,
            "emotion": emotion,
            "rating": max(0, min(5, int(rating))),
            "notes": notes,
        }

    def get_daily_notes_map(self, account_login: int) -> Dict[str, Dict[str, str]]:
        with self._lock:
            rows = self.conn.execute(
                """
                SELECT date_str, mood, summary_note
                FROM daily_journal_notes
                WHERE account_login = ?
                """,
                (int(account_login),),
            ).fetchall()
        return {
            r[0]: {"mood": r[1] or "Neutral", "summary_note": r[2] or ""}
            for r in rows
        }

    def upsert_daily_note(
        self,
        account_login: int,
        date_str: str,
        mood: str,
        summary_note: str,
    ) -> Dict[str, Any]:
        day_key = f"{int(account_login)}_{date_str}"
        now_ms = int(time.time() * 1000)
        with self._lock:
            self.conn.execute(
                """
                INSERT OR REPLACE INTO daily_journal_notes
                    (day_key, account_login, date_str, mood, summary_note, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (day_key, int(account_login), date_str, mood, summary_note, now_ms),
            )
        return {
            "day_key": day_key,
            "date_str": date_str,
            "mood": mood,
            "summary_note": summary_note,
        }


cache_service = CacheService()
