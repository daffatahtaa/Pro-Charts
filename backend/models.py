from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class CandleItem(BaseModel):
    timestamp: int  # Unix epoch milliseconds
    open: float
    high: float
    low: float
    close: float
    volume: float
    spread: int = 0


class CandlesResponse(BaseModel):
    symbol: str
    timeframe: str
    digits: int
    point: float
    has_more: bool
    candles: List[CandleItem]


class SymbolMetadata(BaseModel):
    symbol: str
    description: str
    digits: int
    point: float
    category: str  # 'Forex' | 'Metals' | 'Indices' | 'Crypto' | 'Other'
    cached_bars: int = 0
    bid: Optional[float] = None
    ask: Optional[float] = None
    spread_points: Optional[int] = None


class MT5StatusResponse(BaseModel):
    connected: bool
    mode: str = "mt5"  # "mt5" | "mock"
    terminal_company: str = ""
    server: str = ""
    account_login: int = 0
    cached_candles_total: int = 0
    mt5_window_hidden: bool = False
    algo_trading_enabled: bool = False
    error: Optional[str] = None


class TickSnapshot(BaseModel):
    symbol: str
    bid: float
    ask: float
    spread_points: int
    digits: int
    point: float
    change_pct: float = 0.0
    server_time_ms: int


class DrawingPoint(BaseModel):
    timestamp: Optional[int] = None
    dataIndex: Optional[int] = None
    value: Optional[float] = None


class DrawingModel(BaseModel):
    id: str
    symbol: str
    timeframe: str
    name: str
    points: List[Dict[str, Any]] = Field(default_factory=list)
    styles: Dict[str, Any] = Field(default_factory=dict)
    extendData: Any = Field(default_factory=dict)
    label: Optional[str] = None
    locked: bool = False
    visible: bool = True
    sort_order: Optional[int] = None
    created_at: Optional[int] = None
    updated_at: Optional[int] = None


class PriceAlertModel(BaseModel):
    id: str
    symbol: str
    price: float
    condition: str = "CROSSING"  # 'CROSSING' | 'CROSSING_UP' | 'CROSSING_DOWN'
    note: str = ""
    active: bool = True
    triggered: bool = False
    created_at: Optional[int] = None


class EconomicEventItem(BaseModel):
    id: str
    title: str
    country: str
    impact: str  # 'high' | 'medium' | 'low'
    category: str = "calendar"  # 'calendar' | 'news'
    event_time_ms: int
    actual: str = ""
    forecast: str = ""
    previous: str = ""
    source: str = ""
    url: str = ""
    fetched_at: int = 0


class ChartNewsResponse(BaseModel):
    symbol: str
    clean_symbol: str = ""
    asset_class: str = "Macro"
    resolved_currencies: List[str] = Field(default_factory=list)
    correlation_label: str = ""
    events: List[EconomicEventItem] = Field(default_factory=list)
    cached_at_ms: int = 0


class WindowStateRequest(BaseModel):
    hidden: bool


class WindowStateResponse(BaseModel):
    hidden: bool
    hwnd_count: int
    message: str


class AccountSummary(BaseModel):
    login: int = 0
    server: str = ""
    currency: str = "USD"
    balance: float = 0.0
    equity: float = 0.0
    margin: float = 0.0
    free_margin: float = 0.0
    profit: float = 0.0
    leverage: int = 100
    trade_allowed: bool = False


class PositionItem(BaseModel):
    ticket: int
    symbol: str
    side: str  # 'BUY' | 'SELL'
    volume: float
    open_price: float
    current_price: float
    sl: float = 0.0
    tp: float = 0.0
    profit: float = 0.0
    swap: float = 0.0
    open_time_ms: int
    comment: str = ""
    digits: Optional[int] = None


class PendingOrderItem(BaseModel):
    ticket: int
    symbol: str
    order_type: str  # 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP'
    volume: float
    price_open: float
    current_price: float
    sl: float = 0.0
    tp: float = 0.0
    setup_time_ms: int
    comment: str = ""
    digits: Optional[int] = None


class PlaceOrderRequest(BaseModel):
    symbol: str
    side: str  # 'BUY' | 'SELL'
    order_mode: str = "MARKET"  # 'MARKET' | 'PENDING'
    entry_price: Optional[float] = None
    sl: Optional[float] = None
    tp: Optional[float] = None
    volume: Optional[float] = None
    risk_pct: Optional[float] = None
    comment: str = "TV-Web"


class ModifyPositionRequest(BaseModel):
    ticket: int
    symbol: str
    price: Optional[float] = None  # New entry price for Pending Orders (Limit / Stop)
    sl: float = 0.0
    tp: float = 0.0
    is_pending: bool = False


class TradeResultResponse(BaseModel):
    success: bool
    retcode: int = 0
    order_ticket: int = 0
    message: str
    executed_price: float = 0.0
    executed_volume: float = 0.0


class BulkCloseRequest(BaseModel):
    tickets: list[int]


class BulkModifyRequest(BaseModel):
    tickets: list[int]
    sl: Optional[float] = None  # None = keep current, 0.0 = clear
    tp: Optional[float] = None
    symbol: Optional[str] = None  # Expected single target symbol guard


class BulkResultResponse(BaseModel):
    success: bool
    results: list[TradeResultResponse]
    message: str


class MT5LoginRequest(BaseModel):
    login: int
    password: Optional[str] = None
    server: str
    save_account: bool = True
    current_symbol: Optional[str] = None
    watchlist: Optional[List[str]] = None


class SavedMT5Account(BaseModel):
    login: int
    server: str
    account_name: str = ""
    company: str = ""
    currency: str = "USD"
    has_saved_password: bool = True
    is_last_active: bool = False
    updated_at: int = 0


class MT5AccountsListResponse(BaseModel):
    active_login: int = 0
    active_server: str = ""
    active_name: str = ""
    accounts: List[SavedMT5Account] = Field(default_factory=list)


class MT5LoginResponse(BaseModel):
    success: bool
    message: str
    account: Optional[AccountSummary] = None
    resolved_symbol: Optional[str] = None
    resolved_watchlist: Optional[List[str]] = None


class BrokerInfoModel(BaseModel):
    id: str
    broker_name: str
    short_code: str
    category: str
    website: str = ""
    servers: List[str] = Field(default_factory=list)
    installed_servers: List[str] = Field(default_factory=list)
    is_installed_locally: bool = False


class CustomServerRequest(BaseModel):
    broker_name: str = "Custom Broker"
    server_name: str


class BacktestTradeModel(BaseModel):
    id: str
    session_id: str
    symbol: str
    timeframe: str
    side: str  # 'BUY' | 'SELL'
    order_type: str = "MARKET"  # 'MARKET' | 'LIMIT' | 'STOP'
    volume: float = 0.01
    risk_pct: float = 1.0
    risk_amount: float = 100.0
    planned_rr: float = 0.0
    entry_price: float
    sl: float = 0.0
    tp: float = 0.0
    exit_price: Optional[float] = None
    status: str = "OPEN"  # 'PENDING' | 'OPEN' | 'CLOSED_TP' | 'CLOSED_SL' | 'CLOSED_MANUAL'
    setup_time_ms: int
    open_time_ms: Optional[int] = None
    close_time_ms: Optional[int] = None
    trading_session: str = "LONDON"
    pnl_money: float = 0.0
    pnl_pips: float = 0.0
    realized_r: float = 0.0
    mfe_pips: float = 0.0
    mae_pips: float = 0.0
    bars_held: int = 0
    strategy_tag: str = ""
    confluences: List[str] = Field(default_factory=list)
    notes: str = ""


class BacktestSessionSyncRequest(BaseModel):
    session_id: str
    name: str = "Replay Backtest Session"
    symbol: str
    timeframe: str
    starting_balance: float = 10000.0
    current_balance: float = 10000.0
    notes: str = ""
    trades: List[BacktestTradeModel] = Field(default_factory=list)


class BacktestAnalyticsResponse(BaseModel):
    session_id: str
    name: str
    symbol: str
    timeframe: str
    starting_balance: float
    final_balance: float
    net_profit: float
    net_profit_pct: float
    total_trades: int
    wins: int
    losses: int
    win_rate: float
    gross_profit: float
    gross_loss: float
    profit_factor: float
    expectancy_money: float
    expectancy_r: float
    avg_win_r: float
    avg_loss_r: float
    max_drawdown_money: float
    max_drawdown_pct: float
    verdict: str
    equity_curve: List[Dict[str, Any]] = Field(default_factory=list)
    session_breakdown: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    direction_breakdown: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    tag_breakdown: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    mfe_mae_diagnostics: Dict[str, Any] = Field(default_factory=dict)
    report_json_path: str = ""
    report_md_path: str = ""


class JournalMetaUpdateRequest(BaseModel):
    account_login: int
    position_id: int
    symbol: str
    setup_tag: str = ""
    mistake_tag: str = ""
    emotion: str = "Calm"
    rating: int = 0
    notes: str = ""


class DailyNoteRequest(BaseModel):
    account_login: int
    date_str: str  # 'YYYY-MM-DD'
    mood: str = "Neutral"
    summary_note: str = ""


class JournalTradeItem(BaseModel):
    trade_key: str
    account_login: int
    position_id: int
    symbol: str
    side: str  # 'BUY' | 'SELL'
    volume: float
    entry_price: float
    exit_price: float
    open_time_ms: int
    close_time_ms: int
    close_date: str  # 'YYYY-MM-DD'
    hold_seconds: int
    pips: float
    gross_profit: float
    commission: float
    swap: float
    net_pnl: float
    session: str
    comment: str = ""
    setup_tag: str = ""
    mistake_tag: str = ""
    emotion: str = "Calm"
    rating: int = 0
    notes: str = ""


class CalendarDaySummary(BaseModel):
    date: str
    net_pnl: float
    net_pips: float
    trade_count: int
    win_count: int
    loss_count: int
    win_rate: float
    lots: float
    mood: str = "Neutral"
    daily_note: str = ""
    trades: List[JournalTradeItem] = Field(default_factory=list)


class MyfxbookReportResponse(BaseModel):
    source: str
    account_login: int
    server: str = ""
    currency: str = "USD"
    initial_deposit: float = 0.0
    current_balance: float = 0.0
    symbols_available: List[str] = Field(default_factory=list)
    kpis: Dict[str, Any] = Field(default_factory=dict)
    equity_curve: List[Dict[str, Any]] = Field(default_factory=list)
    by_symbol: List[Dict[str, Any]] = Field(default_factory=list)
    by_day_of_week: List[Dict[str, Any]] = Field(default_factory=list)
    by_hour_utc: List[Dict[str, Any]] = Field(default_factory=list)
    by_setup_tag: List[Dict[str, Any]] = Field(default_factory=list)
    by_mistake_tag: List[Dict[str, Any]] = Field(default_factory=list)
    trades: List[JournalTradeItem] = Field(default_factory=list)
    calendar_days: Dict[str, CalendarDaySummary] = Field(default_factory=dict)
