import asyncio
import base64
from datetime import datetime
import json
import logging
import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from backtest_service import compute_and_export_backtest
from broker_catalog import discover_brokers, scan_local_mt5_servers
from cache_service import cache_service
from journal_service import get_journal_analytics, update_cached_trade_meta
from models import (
    BacktestAnalyticsResponse,
    BacktestSessionSyncRequest,
    BrokerInfoModel,
    BulkCloseRequest,
    BulkModifyRequest,
    BulkResultResponse,
    CandlesResponse,
    CustomServerRequest,
    DailyNoteRequest,
    DrawingModel,
    JournalMetaUpdateRequest,
    ModifyPositionRequest,
    MT5AccountsListResponse,
    MT5LoginRequest,
    MT5LoginResponse,
    MT5StatusResponse,
    MyfxbookReportResponse,
    PlaceOrderRequest,
    PriceAlertModel,
    SymbolMetadata,
    TickSnapshot,
    TradeResultResponse,
    WindowStateRequest,
    WindowStateResponse,
)
from mt5_service import mt5_service, normalize_tf_code, parse_tf_seconds

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Forex Chart Backend Engine...")
    yield
    logger.info("Shutting down Forex Chart Backend Engine...")
    mt5_service.shutdown()
    cache_service.close()


app = FastAPI(
    title="TradingView Clone + MT5 Live Engine",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/mt5/status", response_model=MT5StatusResponse)
async def get_mt5_status():
    status = mt5_service.get_connection_status()
    total = cache_service.get_total_cached_candles()
    return MT5StatusResponse(
        connected=status["connected"],
        mode=status["mode"],
        terminal_company=status["terminal_company"],
        server=status["server"],
        account_login=status["account_login"],
        cached_candles_total=total,
        mt5_window_hidden=status.get("mt5_window_hidden", False),
        algo_trading_enabled=status.get("algo_trading_enabled", False),
        error=status.get("error"),
    )


@app.post("/api/mt5/window", response_model=WindowStateResponse)
async def toggle_mt5_window(req: WindowStateRequest):
    res = await asyncio.to_thread(mt5_service.set_terminal_window_hidden, req.hidden)
    return WindowStateResponse(**res)


@app.post("/api/mt5/algo")
async def enable_mt5_algo_trading():
    return await asyncio.to_thread(mt5_service.enable_algo_trading)


@app.get("/api/mt5/trade/state")
async def get_trade_state():
    return await asyncio.to_thread(mt5_service.get_account_and_positions)


@app.post("/api/mt5/trade/order", response_model=TradeResultResponse)
async def place_trade_order(req: PlaceOrderRequest):
    res = await asyncio.to_thread(mt5_service.place_order, req)
    return TradeResultResponse(**res)


@app.post("/api/mt5/trade/modify", response_model=TradeResultResponse)
async def modify_trade_position(req: ModifyPositionRequest):
    res = await asyncio.to_thread(mt5_service.modify_position_sltp, req)
    return TradeResultResponse(**res)


@app.post("/api/mt5/trade/close/{ticket}", response_model=TradeResultResponse)
async def close_trade_position(ticket: int):
    res = await asyncio.to_thread(mt5_service.close_position, ticket)
    return TradeResultResponse(**res)


@app.post("/api/mt5/trade/bulk/close", response_model=BulkResultResponse)
async def bulk_close_trade_positions(req: BulkCloseRequest):
    if not req.tickets:
        raise HTTPException(status_code=400, detail="tickets must not be empty")
    success, results, message = await asyncio.to_thread(mt5_service.bulk_close_positions, req.tickets)
    return BulkResultResponse(success=success, results=results, message=message)


@app.post("/api/mt5/trade/bulk/modify", response_model=BulkResultResponse)
async def bulk_modify_trade_positions(req: BulkModifyRequest):
    if not req.tickets:
        raise HTTPException(status_code=400, detail="tickets must not be empty")
    success, results, message = await asyncio.to_thread(mt5_service.bulk_modify_sltp, req.tickets, req.sl, req.tp)
    return BulkResultResponse(success=success, results=results, message=message)


@app.post("/api/mt5/trade/cancel/{ticket}", response_model=TradeResultResponse)
async def cancel_trade_order(ticket: int):
    res = await asyncio.to_thread(mt5_service.cancel_pending_order, ticket)
    return TradeResultResponse(**res)


@app.get("/api/mt5/symbols", response_model=List[SymbolMetadata])
async def get_mt5_symbols(
    search: str = Query(default="", description="Filter by symbol or description"),
    category: str = Query(default="", description="Filter by category"),
):
    symbols = mt5_service.get_symbols(search=search, category=category)
    cached_counts = cache_service.get_cached_counts_by_symbol()
    result: List[SymbolMetadata] = []
    for s in symbols:
        result.append(
            SymbolMetadata(
                symbol=s["symbol"],
                description=s["description"],
                digits=s["digits"],
                point=s["point"],
                category=s["category"],
                cached_bars=cached_counts.get(s["symbol"], 0),
            )
        )
    return result


@app.get("/api/mt5/ticks", response_model=List[TickSnapshot])
async def get_mt5_ticks(
    symbols: str = Query(..., description="Comma-separated list of symbols"),
):
    sym_list = [s.strip() for s in symbols.split(",") if s.strip()][:30]
    snapshots = []
    for raw_sym in sym_list:
        resolved = await asyncio.to_thread(mt5_service.resolve_broker_symbol, raw_sym)
        snap = await asyncio.to_thread(mt5_service.get_tick_snapshot, resolved)
        # Return under the requested key AND resolved symbol is reflected in chart when clicked
        snap["symbol"] = raw_sym
        snapshots.append(TickSnapshot(**snap))
    return snapshots


@app.get("/api/mt5/candles", response_model=CandlesResponse)
async def get_mt5_candles(
    symbol: str = Query(default="XAUUSD"),
    tf: str = Query(default="15m"),
    limit: int = Query(default=1500, ge=10, le=10000),
    before_ts: Optional[int] = Query(default=None),
):
    norm_tf = normalize_tf_code(tf)
    if not norm_tf or parse_tf_seconds(norm_tf) is None:
        raise HTTPException(status_code=400, detail=f"Unsupported timeframe: {tf}")

    resolved_sym = await asyncio.to_thread(mt5_service.resolve_broker_symbol, symbol)
    spec = await asyncio.to_thread(mt5_service.get_symbol_spec, resolved_sym)
    cache_service.upsert_symbol_metadata(spec)
    candles, has_more = await asyncio.to_thread(
        cache_service.get_candles,
        resolved_sym,
        norm_tf,
        limit,
        before_ts,
    )
    return CandlesResponse(
        symbol=spec["symbol"],
        timeframe=norm_tf,
        digits=spec["digits"],
        point=spec["point"],
        has_more=has_more,
        candles=candles,
    )


@app.get("/api/mt5/candles/window", response_model=CandlesResponse)
async def get_mt5_candles_window(
    symbol: str = Query(default="XAUUSD"),
    tf: str = Query(default="15m"),
    center_ts: int = Query(..., description="Target epoch milliseconds to center replay window around"),
    before_bars: int = Query(default=400, ge=20, le=3000),
    after_bars: int = Query(default=1500, ge=20, le=5000),
):
    norm_tf = normalize_tf_code(tf)
    if not norm_tf or parse_tf_seconds(norm_tf) is None:
        raise HTTPException(status_code=400, detail=f"Unsupported timeframe: {tf}")

    resolved_sym = await asyncio.to_thread(mt5_service.resolve_broker_symbol, symbol)
    spec = await asyncio.to_thread(mt5_service.get_symbol_spec, resolved_sym)
    cache_service.upsert_symbol_metadata(spec)
    candles, has_more = await asyncio.to_thread(
        cache_service.get_candles_window,
        resolved_sym,
        norm_tf,
        center_ts,
        before_bars,
        after_bars,
    )
    return CandlesResponse(
        symbol=spec["symbol"],
        timeframe=norm_tf,
        digits=spec["digits"],
        point=spec["point"],
        has_more=has_more,
        candles=candles,
    )


@app.get("/api/mt5/candles/earliest", response_model=CandlesResponse)
async def get_mt5_candles_earliest(
    symbol: str = Query(default="XAUUSD"),
    tf: str = Query(default="15m"),
    limit: int = Query(default=3000, ge=50, le=5000),
):
    norm_tf = normalize_tf_code(tf)
    if not norm_tf or parse_tf_seconds(norm_tf) is None:
        raise HTTPException(status_code=400, detail=f"Unsupported timeframe: {tf}")

    resolved_sym = await asyncio.to_thread(mt5_service.resolve_broker_symbol, symbol)
    spec = await asyncio.to_thread(mt5_service.get_symbol_spec, resolved_sym)
    cache_service.upsert_symbol_metadata(spec)
    candles, has_more = await asyncio.to_thread(
        cache_service.get_earliest_candles,
        resolved_sym,
        norm_tf,
        limit,
    )
    return CandlesResponse(
        symbol=spec["symbol"],
        timeframe=norm_tf,
        digits=spec["digits"],
        point=spec["point"],
        has_more=has_more,
        candles=candles,
    )


@app.get("/api/drawings")
async def get_drawings(
    symbol: str = Query(...),
    tf: Optional[str] = Query(default=None),
):
    # Return all drawings for the symbol (cross-timeframe visibility like TradingView)
    return cache_service.get_drawings(symbol=symbol)


@app.post("/api/drawings")
async def save_drawing(drawing: DrawingModel):
    saved = cache_service.upsert_drawing(drawing)
    return saved


@app.delete("/api/drawings/{drawing_id}")
async def delete_drawing(drawing_id: str):
    cache_service.delete_drawing(drawing_id)
    return {"deleted": True, "id": drawing_id}


@app.delete("/api/drawings")
async def delete_drawings_for_symbol(symbol: str = Query(...)):
    cache_service.delete_drawings_by_symbol(symbol)
    return {"deleted": True, "symbol": symbol}


@app.get("/api/alerts")
async def get_alerts(symbol: Optional[str] = Query(default=None)):
    return cache_service.get_alerts(symbol=symbol)


@app.post("/api/alerts")
async def save_alert(alert: PriceAlertModel):
    return cache_service.upsert_alert(alert)


@app.delete("/api/alerts/{alert_id}")
async def delete_alert(alert_id: str):
    cache_service.delete_alert(alert_id)
    return {"deleted": True, "id": alert_id}


# --- MT5 Broker Directory & Server Discovery ---

@app.get("/api/mt5/brokers", response_model=List[BrokerInfoModel])
async def get_mt5_brokers(search: str = Query(default="")):
    data_path = await asyncio.to_thread(mt5_service.get_terminal_data_path)
    local_servers = await asyncio.to_thread(scan_local_mt5_servers, data_path)
    custom_servers = cache_service.get_custom_broker_servers()
    saved_accounts = cache_service.get_saved_accounts()
    saved_server_names = [a["server"] for a in saved_accounts if a.get("server")]
    brokers = discover_brokers(
        search=search,
        local_servers=local_servers,
        custom_servers=custom_servers,
        saved_servers=saved_server_names,
    )
    return [BrokerInfoModel(**b) for b in brokers]


@app.post("/api/mt5/brokers/custom")
async def add_custom_broker_server(req: CustomServerRequest):
    return cache_service.upsert_custom_broker_server(req.broker_name, req.server_name)


# --- MT5 Account Login & Saved Account Switcher ---

@app.get("/api/mt5/accounts", response_model=MT5AccountsListResponse)
async def get_saved_mt5_accounts():
    trade_state = await asyncio.to_thread(mt5_service.get_account_and_positions)
    acc = trade_state.get("account", {})
    saved = cache_service.get_saved_accounts()
    return MT5AccountsListResponse(
        active_login=int(acc.get("login", 0)),
        active_server=str(acc.get("server", "")),
        active_name="",
        accounts=saved,
    )


@app.post("/api/mt5/login", response_model=MT5LoginResponse)
async def login_mt5_account(req: MT5LoginRequest):
    password = req.password
    server = req.server
    if not password:
        stored = cache_service.get_saved_account_password(req.login)
        if not stored:
            return MT5LoginResponse(
                success=False,
                message=f"No saved password found for account #{req.login}. Please enter password.",
            )
        password, saved_server = stored
        if not server:
            server = saved_server

    res = await asyncio.to_thread(
        mt5_service.login_account, req.login, password, server, req.current_symbol
    )
    if res.get("success"):
        acc_info = res.get("account") or {}
        final_server = acc_info.get("server", server)
        cache_service.upsert_custom_broker_server(
            res.get("company") or final_server, final_server
        )
        if req.save_account:
            cache_service.upsert_saved_account(
                login=req.login,
                password=password,
                server=final_server,
                account_name=res.get("account_name", ""),
                company=res.get("company", ""),
                currency=acc_info.get("currency", "USD"),
            )
    resolved_wl = None
    if res.get("success") and req.watchlist:
        resolved_wl = await asyncio.to_thread(
            mt5_service.resolve_watchlist_symbols, req.watchlist
        )
    return MT5LoginResponse(
        success=bool(res.get("success")),
        message=str(res.get("message", "")),
        account=res.get("account"),
        resolved_symbol=res.get("resolved_symbol"),
        resolved_watchlist=resolved_wl,
    )


@app.delete("/api/mt5/accounts/{login}")
async def delete_saved_mt5_account(login: int):
    cache_service.delete_saved_account(login)
    return {"deleted": True, "login": login}


# --- Replay Backtest Telemetry & AI Report Endpoints ---

@app.post("/api/backtest/sync", response_model=BacktestAnalyticsResponse)
async def sync_backtest_session(req: BacktestSessionSyncRequest):
    analytics = await asyncio.to_thread(compute_and_export_backtest, req)
    return BacktestAnalyticsResponse(**analytics)


@app.get("/api/backtest/sessions")
async def list_backtest_sessions():
    return cache_service.list_backtest_sessions()


@app.get("/api/backtest/report")
async def get_backtest_report(session_id: Optional[str] = Query(default=None)):
    rep = cache_service.get_backtest_report(session_id=session_id)
    if not rep:
        raise HTTPException(status_code=404, detail="No backtest report found yet.")
    return rep


# --- Myfxbook Performance Report, Trade Journal & Monthly Calendar ---

@app.get("/api/journal/analytics", response_model=MyfxbookReportResponse)
async def api_journal_analytics(
    source: str = Query(default="mt5"),
    days: int = Query(default=90, ge=0, le=3650),
    symbol: str = Query(default="ALL"),
    refresh: bool = Query(default=False),
):
    data = await asyncio.to_thread(get_journal_analytics, source, days, symbol, refresh)
    return MyfxbookReportResponse(**data)


@app.post("/api/journal/meta")
async def api_update_journal_meta(req: JournalMetaUpdateRequest):
    saved = cache_service.upsert_journal_meta(
        account_login=req.account_login,
        position_id=req.position_id,
        symbol=req.symbol,
        setup_tag=req.setup_tag,
        mistake_tag=req.mistake_tag,
        emotion=req.emotion,
        rating=req.rating,
        notes=req.notes,
    )
    update_cached_trade_meta(req.account_login, req.position_id, saved)
    return saved


@app.post("/api/journal/daily-note")
async def api_save_daily_note(req: DailyNoteRequest):
    saved = cache_service.upsert_daily_note(
        account_login=req.account_login,
        date_str=req.date_str,
        mood=req.mood,
        summary_note=req.summary_note,
    )
    return saved


@app.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    await websocket.accept()
    subscription: Dict[str, str] = {"symbol": "XAUUSD", "tf": "15m"}
    active = True
    last_cache_flush = time.time()

    async def receiver():
        nonlocal active
        try:
            while active:
                raw = await websocket.receive_text()
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if msg.get("action") == "subscribe":
                    sym = msg.get("symbol")
                    tf = msg.get("tf")
                    if sym:
                        subscription["symbol"] = await asyncio.to_thread(
                            mt5_service.resolve_broker_symbol, str(sym)
                        )
                    if tf:
                        norm = normalize_tf_code(str(tf))
                        if norm and parse_tf_seconds(norm) is not None:
                            subscription["tf"] = norm
        except WebSocketDisconnect:
            active = False
        except Exception:
            active = False

    recv_task = asyncio.create_task(receiver())
    last_trade_push = 0.0
    try:
        while active:
            sym = subscription["symbol"]
            tf = subscription["tf"]
            payload = await asyncio.to_thread(
                mt5_service.get_live_tick_and_candle, sym, tf
            )
            now = time.time()
            if payload:
                await websocket.send_json(payload)
                if now - last_cache_flush >= 5.0 and payload.get("candle"):
                    last_cache_flush = now
                    await asyncio.to_thread(
                        cache_service.upsert_candles, sym, tf, [payload["candle"]]
                    )

            # Broadcast live Account, Positions & Pending Orders every 1.0s
            if now - last_trade_push >= 1.0:
                last_trade_push = now
                trade_state = await asyncio.to_thread(
                    mt5_service.get_account_and_positions
                )
                await websocket.send_json(
                    {
                        "type": "trade_state_update",
                        "account": trade_state["account"],
                        "positions": trade_state["positions"],
                        "orders": trade_state["orders"],
                    }
                )
            await asyncio.sleep(0.15)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.debug("WebSocket stream closed: %s", exc)
    finally:
        active = False
        recv_task.cancel()


SNAPSHOTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "snapshots")
os.makedirs(SNAPSHOTS_DIR, exist_ok=True)


@app.post("/api/snapshots")
async def create_chart_snapshot(payload: Dict[str, Any]):
    """Accepts { image_data_url: 'data:image/png;base64,...', symbol, timeframe } and returns a shareable local URL."""
    data_url = str(payload.get("image_data_url") or "")
    if "," not in data_url:
        raise HTTPException(status_code=400, detail="Invalid PNG data URL")
    try:
        raw_b64 = data_url.split(",", 1)[1]
        img_bytes = base64.b64decode(raw_b64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to decode PNG: {exc}")
    sym = re.sub(r"[^A-Za-z0-9_-]", "", str(payload.get("symbol") or "CHART"))[:20] or "CHART"
    tf = re.sub(r"[^A-Za-z0-9_-]", "", str(payload.get("timeframe") or ""))[:10]
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    rand = uuid.uuid4().hex[:6]
    filename = f"{sym}_{tf}_{ts}_{rand}.png" if tf else f"{sym}_{ts}_{rand}.png"
    out_path = os.path.join(SNAPSHOTS_DIR, filename)
    with open(out_path, "wb") as f:
        f.write(img_bytes)
    return {"filename": filename, "url": f"/api/snapshots/{filename}"}


@app.get("/api/snapshots/{filename}")
async def get_chart_snapshot(filename: str):
    safe_name = os.path.basename(filename)
    path = os.path.join(SNAPSHOTS_DIR, safe_name)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return FileResponse(path, media_type="image/png")
