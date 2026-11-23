import {
  BacktestAnalytics,
  BulkModifyPayload,
  BulkTradeResult,
  Candle,
  ChartNewsResponse,
  DrawingItem,
  ModifyPositionPayload,
  MT5AccountsListResponse,
  MT5BrokerInfo,
  MT5LoginPayload,
  MT5LoginResponse,
  MT5Status,
  MyfxbookReportData,
  PaperTrade,
  PlaceOrderPayload,
  PriceAlertItem,
  SymbolInfo,
  TickSnapshot,
  Timeframe,
  TradeResultResponse,
  TradeStatePayload,
  WindowStateResponse,
} from '../types/chart';

const API_BASE = 'http://localhost:8000/api';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export interface CandlesApiResponse {
  symbol: string;
  timeframe: Timeframe;
  digits: number;
  point: number;
  has_more: boolean;
  candles: Candle[];
}

export const api = {
  getStatus(): Promise<MT5Status> {
    return fetchJson<MT5Status>(`${API_BASE}/mt5/status`);
  },

  getSymbols(search = '', category = ''): Promise<SymbolInfo[]> {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (category && category !== 'All') params.set('category', category);
    return fetchJson<SymbolInfo[]>(`${API_BASE}/mt5/symbols?${params.toString()}`);
  },

  getTicks(symbols: string[]): Promise<TickSnapshot[]> {
    if (symbols.length === 0) return Promise.resolve([]);
    const params = new URLSearchParams({ symbols: symbols.join(',') });
    return fetchJson<TickSnapshot[]>(`${API_BASE}/mt5/ticks?${params.toString()}`);
  },

  getCandles(
    symbol: string,
    tf: Timeframe,
    limit = 1500,
    beforeTs?: number
  ): Promise<CandlesApiResponse> {
    const params = new URLSearchParams({
      symbol,
      tf,
      limit: String(limit),
    });
    if (beforeTs !== undefined) {
      params.set('before_ts', String(beforeTs));
    }
    return fetchJson<CandlesApiResponse>(`${API_BASE}/mt5/candles?${params.toString()}`);
  },

  getCandlesWindow(
    symbol: string,
    tf: Timeframe,
    centerTs: number,
    beforeBars = 400,
    afterBars = 1500
  ): Promise<CandlesApiResponse> {
    const params = new URLSearchParams({
      symbol,
      tf,
      center_ts: String(Math.floor(centerTs)),
      before_bars: String(beforeBars),
      after_bars: String(afterBars),
    });
    return fetchJson<CandlesApiResponse>(`${API_BASE}/mt5/candles/window?${params.toString()}`);
  },

  getEarliestCandles(
    symbol: string,
    tf: Timeframe,
    limit = 3000
  ): Promise<CandlesApiResponse> {
    const params = new URLSearchParams({
      symbol,
      tf,
      limit: String(limit),
    });
    return fetchJson<CandlesApiResponse>(`${API_BASE}/mt5/candles/earliest?${params.toString()}`);
  },

  getDrawings(symbol: string, tf?: Timeframe): Promise<DrawingItem[]> {
    const params = new URLSearchParams({ symbol });
    if (tf) params.set('tf', tf);
    return fetchJson<DrawingItem[]>(`${API_BASE}/drawings?${params.toString()}`);
  },

  saveDrawing(drawing: DrawingItem): Promise<DrawingItem> {
    return fetchJson<DrawingItem>(`${API_BASE}/drawings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(drawing),
    });
  },

  deleteDrawing(drawingId: string): Promise<{ deleted: boolean; id: string }> {
    return fetchJson(`${API_BASE}/drawings/${encodeURIComponent(drawingId)}`, {
      method: 'DELETE',
    });
  },

  deleteDrawingsForSymbol(symbol: string): Promise<{ deleted: boolean; symbol: string }> {
    const params = new URLSearchParams({ symbol });
    return fetchJson(`${API_BASE}/drawings?${params.toString()}`, {
      method: 'DELETE',
    });
  },

  setMt5WindowHidden(hidden: boolean): Promise<WindowStateResponse> {
    return fetchJson<WindowStateResponse>(`${API_BASE}/mt5/window`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden }),
    });
  },

  enableAlgoTrading(): Promise<{
    algo_trading_enabled: boolean;
    removed_eas: number;
    message: string;
  }> {
    return fetchJson(`${API_BASE}/mt5/algo`, { method: 'POST' });
  },

  getTradeState(): Promise<TradeStatePayload> {
    return fetchJson<TradeStatePayload>(`${API_BASE}/mt5/trade/state`);
  },

  placeOrder(payload: PlaceOrderPayload): Promise<TradeResultResponse> {
    return fetchJson<TradeResultResponse>(`${API_BASE}/mt5/trade/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  modifyTrade(payload: ModifyPositionPayload): Promise<TradeResultResponse> {
    return fetchJson<TradeResultResponse>(`${API_BASE}/mt5/trade/modify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  closePosition(ticket: number): Promise<TradeResultResponse> {
    return fetchJson<TradeResultResponse>(`${API_BASE}/mt5/trade/close/${ticket}`, {
      method: 'POST',
    });
  },

  bulkClosePosition(tickets: number[]): Promise<BulkTradeResult> {
    return fetchJson<BulkTradeResult>(`${API_BASE}/mt5/trade/bulk/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickets }),
    });
  },

  bulkModifyTrade(payload: BulkModifyPayload): Promise<BulkTradeResult> {
    return fetchJson<BulkTradeResult>(`${API_BASE}/mt5/trade/bulk/modify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  cancelOrder(ticket: number): Promise<TradeResultResponse> {
    return fetchJson<TradeResultResponse>(`${API_BASE}/mt5/trade/cancel/${ticket}`, {
      method: 'POST',
    });
  },

  getAlerts(symbol?: string): Promise<PriceAlertItem[]> {
    const params = symbol ? `?symbol=${encodeURIComponent(symbol)}` : '';
    return fetchJson<PriceAlertItem[]>(`${API_BASE}/alerts${params}`);
  },

  saveAlert(alert: PriceAlertItem): Promise<PriceAlertItem> {
    return fetchJson<PriceAlertItem>(`${API_BASE}/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert),
    });
  },

  deleteAlert(alertId: string): Promise<{ deleted: boolean; id: string }> {
    return fetchJson(`${API_BASE}/alerts/${encodeURIComponent(alertId)}`, {
      method: 'DELETE',
    });
  },

  getChartNews(params: {
    symbol: string;
    scope?: string;
    currencies?: string[];
    impacts?: string[];
    eventTypes?: string[];
    fromTs?: number;
    toTs?: number;
    refresh?: boolean;
  }): Promise<ChartNewsResponse> {
    const q = new URLSearchParams();
    q.set('symbol', params.symbol);
    if (params.scope) q.set('scope', params.scope);
    if (params.currencies && params.currencies.length > 0) {
      q.set('currencies', params.currencies.join(','));
    }
    if (params.impacts && params.impacts.length > 0) {
      q.set('impact', params.impacts.join(','));
    }
    if (params.eventTypes && params.eventTypes.length > 0) {
      q.set('event_types', params.eventTypes.join(','));
    }
    if (params.fromTs !== undefined) q.set('from_ts', String(params.fromTs));
    if (params.toTs !== undefined) q.set('to_ts', String(params.toTs));
    if (params.refresh) q.set('refresh', 'true');
    return fetchJson<ChartNewsResponse>(`${API_BASE}/news?${q.toString()}`);
  },

  getSavedAccounts(): Promise<MT5AccountsListResponse> {
    return fetchJson<MT5AccountsListResponse>(`${API_BASE}/mt5/accounts`);
  },

  getBrokers(search = ''): Promise<MT5BrokerInfo[]> {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return fetchJson<MT5BrokerInfo[]>(`${API_BASE}/mt5/brokers${q}`);
  },

  addCustomBrokerServer(
    broker_name: string,
    server_name: string
  ): Promise<{ broker_name: string; server_name: string }> {
    return fetchJson(`${API_BASE}/mt5/brokers/custom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ broker_name, server_name }),
    });
  },

  loginMt5Account(payload: MT5LoginPayload): Promise<MT5LoginResponse> {
    return fetchJson<MT5LoginResponse>(`${API_BASE}/mt5/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  deleteSavedAccount(login: number): Promise<{ deleted: boolean; login: number }> {
    return fetchJson(`${API_BASE}/mt5/accounts/${login}`, { method: 'DELETE' });
  },

  syncBacktestSession(payload: {
    session_id: string;
    name: string;
    symbol: string;
    timeframe: string;
    starting_balance: number;
    current_balance: number;
    notes: string;
    trades: PaperTrade[];
  }): Promise<BacktestAnalytics> {
    return fetchJson<BacktestAnalytics>(`${API_BASE}/backtest/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  getJournalAnalytics(
    source: 'mt5' | 'paper' = 'mt5',
    days = 90,
    symbol = 'ALL',
    refresh = false
  ): Promise<MyfxbookReportData> {
    const params = new URLSearchParams({
      source,
      days: String(days),
      symbol,
      refresh: refresh ? 'true' : 'false',
    });
    return fetchJson<MyfxbookReportData>(`${API_BASE}/journal/analytics?${params.toString()}`);
  },

  updateJournalMeta(payload: {
    account_login: number;
    position_id: number;
    symbol: string;
    setup_tag: string;
    mistake_tag: string;
    emotion: string;
    rating: number;
    notes: string;
  }) {
    return fetchJson(`${API_BASE}/journal/meta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  saveDailyJournalNote(payload: {
    account_login: number;
    date_str: string;
    mood: string;
    summary_note: string;
  }) {
    return fetchJson(`${API_BASE}/journal/daily-note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  uploadSnapshot(
    imageDataUrl: string,
    symbol: string,
    timeframe: string
  ): Promise<{ filename: string; url: string }> {
    return fetchJson<{ filename: string; url: string }>(`${API_BASE}/snapshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_data_url: imageDataUrl,
        symbol,
        timeframe,
      }),
    });
  },
};
