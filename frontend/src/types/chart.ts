export type Timeframe = string;

export const DEFAULT_PINNED_TIMEFRAMES: string[] = [
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '4h',
  '1D',
  '1W',
];

export function parseTradingViewInterval(
  raw: string
): { tf: string; humanLabel: string; seconds: number } | null {
  const s = (raw || '').trim();
  if (!s) return null;

  const upper = s.toUpperCase();
  if (upper === 'D' || upper === '1D' || upper === 'D1') {
    return { tf: '1D', humanLabel: '1D (1 day)', seconds: 86400 };
  }
  if (upper === 'W' || upper === '1W' || upper === 'W1') {
    return { tf: '1W', humanLabel: '1W (1 week)', seconds: 604800 };
  }
  // Case-sensitive: uppercase 'M'/'1M' = 1 Month, lowercase '1m' = 1 Minute!
  if (s === 'M' || s === '1M' || upper === 'MN' || upper === '1MN' || upper === 'MN1') {
    return { tf: '1M', humanLabel: '1M (1 month)', seconds: 2592000 };
  }

  // Support MT5 shorthand: M15, H4, D1, W1
  const mt5Match = /^([MHDW])(\d+)$/i.exec(s);
  if (mt5Match) {
    const u = mt5Match[1].toUpperCase();
    const n = parseInt(mt5Match[2], 10);
    if (n <= 0) return null;
    if (u === 'M') return parseTradingViewInterval(`${n}m`);
    if (u === 'H') return parseTradingViewInterval(`${n}h`);
    if (u === 'D') return parseTradingViewInterval(`${n}D`);
    if (u === 'W') return parseTradingViewInterval(`${n}W`);
  }

  const m = /^(\d+)([mhdwHDWM])?$/.exec(s);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  const unit = m[2] || 'm';
  if (num <= 0) return null;

  if (unit === 'm') {
    if (num > 1440) return null;
    if (num >= 60 && num % 60 === 0 && num / 60 <= 12) {
      const hrs = num / 60;
      return {
        tf: `${hrs}h`,
        humanLabel: `${hrs}h (${hrs} ${hrs === 1 ? 'hour' : 'hours'})`,
        seconds: hrs * 3600,
      };
    }
    return {
      tf: `${num}m`,
      humanLabel: `${num}m (${num} ${num === 1 ? 'minute' : 'minutes'})`,
      seconds: num * 60,
    };
  }
  if (unit === 'h' || unit === 'H') {
    if (num > 168) return null;
    if (num >= 24 && num % 24 === 0) {
      const days = num / 24;
      return {
        tf: `${days}D`,
        humanLabel: `${days}D (${days} ${days === 1 ? 'day' : 'days'})`,
        seconds: days * 86400,
      };
    }
    return {
      tf: `${num}h`,
      humanLabel: `${num}h (${num} ${num === 1 ? 'hour' : 'hours'})`,
      seconds: num * 3600,
    };
  }
  if (unit === 'd' || unit === 'D') {
    if (num > 30) return null;
    return {
      tf: `${num}D`,
      humanLabel: `${num}D (${num} ${num === 1 ? 'day' : 'days'})`,
      seconds: num * 86400,
    };
  }
  if (unit === 'w' || unit === 'W') {
    if (num > 12) return null;
    return {
      tf: `${num}W`,
      humanLabel: `${num}W (${num} ${num === 1 ? 'week' : 'weeks'})`,
      seconds: num * 604800,
    };
  }
  if (unit === 'M') {
    if (num > 12) return null;
    return {
      tf: `${num}M`,
      humanLabel: `${num}M (${num} ${num === 1 ? 'month' : 'months'})`,
      seconds: num * 2592000,
    };
  }
  return null;
}

export function getTimeframeSeconds(tf: string): number {
  const parsed = parseTradingViewInterval(tf);
  return parsed ? parsed.seconds : 900;
}

export type ChartType =
  | 'candle_solid'
  | 'candle_stroke'
  | 'candle_up_stroke'
  | 'heikin_ashi'
  | 'ohlc'
  | 'line'
  | 'area'
  | 'baseline';

export type LayoutMode = '1' | '2v' | '2h' | '4';

export type MagnetMode = 'normal' | 'weak_magnet' | 'strong_magnet';

export type TradeLineStyle = 'solid' | 'dashed' | 'dotted';
export type UiScalePreset = 0.8 | 0.9 | 1.0 | 1.1 | 1.25;

export interface ChartThemeSettings {
  bullBodyColor: string;
  bearBodyColor: string;
  bullBorderColor: string;
  bearBorderColor: string;
  bullWickColor: string;
  bearWickColor: string;
  showBorders: boolean;
  showWicks: boolean;
  canvasBgColor: string;
  gridVertColor: string;
  gridHorizColor: string;
  showGridVert: boolean;
  showGridHoriz: boolean;
  crosshairColor: string;
  showWatermark: boolean;
  showLastPriceLine: boolean;
  showHighLowMarks: boolean;
  showHighLowLines: boolean;
  highLowColor: string;
  showCountdown: boolean;
  showBidAskLines: boolean;
  showBidAskLabels: boolean;
  showSymbolOnPriceLabel: boolean;
  bidLineColor: string;
  askLineColor: string;
  showPositionLines: boolean;
  positionLineStyle: TradeLineStyle;
  positionLineWidth: number;
  positionLineOpacity: number;
  positionColorMode: 'pnl' | 'custom';
  positionProfitColor: string;
  positionLossColor: string;
  positionCustomColor: string;
  pendingOrderLineColor: string;
  slLineColor: string;
  tpLineColor: string;
  uiScale: number;
  showOhlcValues: boolean;
  showBarChange: boolean;
  showVolumeValue: boolean;
  showQuickTradeButtons: boolean;
}

export const DEFAULT_CHART_SETTINGS: ChartThemeSettings = {
  bullBodyColor: '#089981',
  bearBodyColor: '#f23645',
  bullBorderColor: '#089981',
  bearBorderColor: '#f23645',
  bullWickColor: '#089981',
  bearWickColor: '#f23645',
  showBorders: true,
  showWicks: true,
  canvasBgColor: '#131722',
  gridVertColor: '#1f2430',
  gridHorizColor: '#1f2430',
  showGridVert: true,
  showGridHoriz: true,
  crosshairColor: '#787b86',
  showWatermark: true,
  showLastPriceLine: true,
  showHighLowMarks: true,
  showHighLowLines: false,
  highLowColor: '#787b86',
  showCountdown: true,
  showBidAskLines: true,
  showBidAskLabels: true,
  showSymbolOnPriceLabel: true,
  bidLineColor: '#2962ff',
  askLineColor: '#f23645',
  showPositionLines: true,
  positionLineStyle: 'solid',
  positionLineWidth: 1,
  positionLineOpacity: 1.0,
  positionColorMode: 'pnl',
  positionProfitColor: '#089981',
  positionLossColor: '#f23645',
  positionCustomColor: '#2962ff',
  pendingOrderLineColor: '#2962ff',
  slLineColor: '#f23645',
  tpLineColor: '#089981',
  uiScale: 1.0,
  showOhlcValues: true,
  showBarChange: true,
  showVolumeValue: true,
  showQuickTradeButtons: true,
};

export function getContrastTextColor(hexBg: string): string {
  const clean = (hexBg || '').replace('#', '');
  if (clean.length !== 6) return '#ffffff';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  // Relative luminance
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#131722' : '#ffffff';
}

export interface TimezoneOption {
  id: string;
  label: string;
  shortLabel: string;
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { id: 'Etc/UTC', label: '(UTC) Coordinated Universal Time', shortLabel: 'UTC' },
  { id: 'Asia/Jakarta', label: '(UTC+7) Jakarta / Bangkok', shortLabel: 'UTC+7' },
  { id: 'Asia/Singapore', label: '(UTC+8) Singapore / Hong Kong', shortLabel: 'UTC+8' },
  { id: 'Asia/Tokyo', label: '(UTC+9) Tokyo / Seoul', shortLabel: 'UTC+9' },
  { id: 'Australia/Sydney', label: '(UTC+10/11) Sydney', shortLabel: 'Sydney' },
  { id: 'Europe/London', label: '(UTC+0/1) London', shortLabel: 'London' },
  { id: 'Europe/Berlin', label: '(UTC+1/2) Frankfurt / Zurich', shortLabel: 'UTC+1' },
  { id: 'America/New_York', label: '(UTC-5/4) New York', shortLabel: 'New York' },
  { id: 'America/Chicago', label: '(UTC-6/5) Chicago', shortLabel: 'Chicago' },
];

export type AlertCondition = 'CROSSING' | 'CROSSING_UP' | 'CROSSING_DOWN';

export interface PriceAlertItem {
  id: string;
  symbol: string;
  price: number;
  condition: AlertCondition;
  note: string;
  active: boolean;
  triggered: boolean;
  created_at?: number;
}

export interface Candle {
  timestamp: number; // Unix epoch milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  spread?: number;
}

export interface SymbolInfo {
  symbol: string;
  description: string;
  digits: number;
  point: number;
  category: string;
  cached_bars?: number;
}

export interface MT5Status {
  connected: boolean;
  mode: 'mt5' | 'mock';
  terminal_company: string;
  server: string;
  account_login: number;
  cached_candles_total: number;
  mt5_window_hidden?: boolean;
  algo_trading_enabled?: boolean;
  error?: string | null;
}

export interface WindowStateResponse {
  hidden: boolean;
  hwnd_count: number;
  message: string;
}

export interface AccountSummary {
  login: number;
  server: string;
  currency: string;
  balance: number;
  equity: number;
  margin: number;
  free_margin: number;
  profit: number;
  leverage: number;
  trade_allowed: boolean;
}

export interface PositionItem {
  ticket: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  volume: number;
  open_price: number;
  current_price: number;
  sl: number;
  tp: number;
  profit: number;
  swap: number;
  open_time_ms: number;
  comment: string;
  digits?: number;
}

export interface PendingOrderItem {
  ticket: number;
  symbol: string;
  order_type: string;
  volume: number;
  price_open: number;
  current_price: number;
  sl: number;
  tp: number;
  setup_time_ms: number;
  comment: string;
  digits?: number;
}

export interface TradeStatePayload {
  account: AccountSummary;
  positions: PositionItem[];
  orders: PendingOrderItem[];
}

export interface PlaceOrderPayload {
  symbol: string;
  side: 'BUY' | 'SELL';
  order_mode: 'MARKET' | 'PENDING';
  entry_price?: number;
  sl?: number;
  tp?: number;
  volume?: number;
  risk_pct?: number;
  comment?: string;
}

export interface ModifyPositionPayload {
  ticket: number;
  symbol: string;
  price?: number;
  sl: number;
  tp: number;
  is_pending?: boolean;
}

export interface BulkModifyPayload {
  tickets: number[];
  sl?: number;
  tp?: number;
  symbol?: string;
}

export interface BulkTradeResult {
  success: boolean;
  results: TradeResultResponse[];
  message: string;
}

export type PaneId = 'pane-1' | 'pane-2' | 'pane-3' | 'pane-4';
export type SecondaryPaneId = 'pane-2' | 'pane-3' | 'pane-4';

export interface PaneConfig {
  id: SecondaryPaneId;
  symbol: string;
  timeframe: Timeframe;
}

export interface WorkspaceTab {
  id: string;
  isNewTab?: boolean;
  symbol: string;
  timeframe: Timeframe;
  chartType: ChartType;
  layoutMode: LayoutMode;
  activePaneId: PaneId;
  secondaryPanes: Record<SecondaryPaneId, PaneConfig>;
  activeIndicators: ActiveIndicator[];
}

export interface TradeResultResponse {
  success: boolean;
  retcode: number;
  order_ticket: number;
  message: string;
  executed_price: number;
  executed_volume: number;
}

export interface ToastNotice {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

export interface SavedMT5Account {
  login: number;
  server: string;
  account_name: string;
  company: string;
  currency: string;
  has_saved_password: boolean;
  is_last_active: boolean;
  updated_at: number;
}

export interface MT5AccountsListResponse {
  active_login: number;
  active_server: string;
  active_name: string;
  accounts: SavedMT5Account[];
}

export interface MT5LoginPayload {
  login: number;
  password?: string;
  server: string;
  save_account?: boolean;
  current_symbol?: string;
  watchlist?: string[];
}

export interface MT5LoginResponse {
  success: boolean;
  message: string;
  account?: AccountSummary | null;
  resolved_symbol?: string | null;
  resolved_watchlist?: string[] | null;
}

export interface MT5BrokerInfo {
  id: string;
  broker_name: string;
  short_code: string;
  category: string;
  website: string;
  servers: string[];
  installed_servers: string[];
  is_installed_locally: boolean;
}

export type TradingSessionName = 'ASIA' | 'LONDON' | 'NEW_YORK' | 'OVERLAP';

export interface PaperTrade {
  id: string;
  session_id: string;
  symbol: string;
  timeframe: string;
  side: 'BUY' | 'SELL';
  order_type: 'MARKET' | 'LIMIT' | 'STOP';
  volume: number;
  risk_pct: number;
  risk_amount: number;
  planned_rr: number;
  entry_price: number;
  sl: number;
  tp: number;
  exit_price?: number;
  status: 'PENDING' | 'OPEN' | 'CLOSED_TP' | 'CLOSED_SL' | 'CLOSED_MANUAL';
  setup_time_ms: number;
  open_time_ms?: number;
  close_time_ms?: number;
  trading_session: TradingSessionName;
  pnl_money: number;
  pnl_pips: number;
  realized_r: number;
  mfe_pips: number;
  mae_pips: number;
  bars_held: number;
  strategy_tag: string;
  confluences: string[];
  notes: string;
}

export interface PaperAccountState {
  session_id: string;
  name: string;
  notes: string;
  startingBalance: number;
  balance: number;
  equity: number;
  trades: PaperTrade[];
}

export interface BacktestAnalytics {
  session_id: string;
  name: string;
  symbol: string;
  timeframe: string;
  starting_balance: number;
  final_balance: number;
  net_profit: number;
  net_profit_pct: number;
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  gross_profit: number;
  gross_loss: number;
  profit_factor: number;
  expectancy_money: number;
  expectancy_r: number;
  avg_win_r: number;
  avg_loss_r: number;
  max_drawdown_money: number;
  max_drawdown_pct: number;
  verdict: string;
  equity_curve: Array<{
    trade_num: number;
    balance: number;
    r_cum: number;
    pnl?: number;
    side?: string;
    tag?: string;
  }>;
  session_breakdown: Record<
    string,
    { trades: number; wins: number; win_rate: number; net_r: number; net_pnl: number }
  >;
  direction_breakdown: Record<
    string,
    {
      trades: number;
      wins: number;
      win_rate: number;
      profit_factor: number;
      net_r: number;
      net_pnl: number;
    }
  >;
  tag_breakdown: Record<
    string,
    { trades: number; wins: number; win_rate: number; net_r: number; net_pnl: number }
  >;
  mfe_mae_diagnostics: {
    avg_mfe_pips_on_sl_trades: number;
    avg_mae_pips_on_tp_trades: number;
    avg_bars_held: number;
  };
  report_json_path: string;
  report_md_path: string;
}

export interface JournalTrade {
  trade_key: string;
  account_login: number;
  position_id: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  volume: number;
  entry_price: number;
  exit_price: number;
  open_time_ms: number;
  close_time_ms: number;
  close_date: string;
  hold_seconds: number;
  pips: number;
  gross_profit: number;
  commission: number;
  swap: number;
  net_pnl: number;
  session: string;
  comment: string;
  setup_tag: string;
  mistake_tag: string;
  emotion: string;
  rating: number;
  notes: string;
}

export interface CalendarDayStat {
  date: string;
  net_pnl: number;
  net_pips: number;
  trade_count: number;
  win_count: number;
  loss_count: number;
  win_rate: number;
  lots: number;
  mood: string;
  daily_note: string;
  trades: JournalTrade[];
}

export interface MyfxbookReportData {
  source: 'mt5' | 'paper';
  account_login: number;
  server: string;
  currency: string;
  initial_deposit: number;
  current_balance: number;
  symbols_available: string[];
  kpis: Record<string, any>;
  equity_curve: Array<{
    trade_num: number;
    timestamp: number;
    date_str: string;
    balance: number;
    cumulative_pnl: number;
    drawdown_pct: number;
  }>;
  by_symbol: Array<{
    symbol: string;
    trades: number;
    win_rate: number;
    net_pnl: number;
    net_pips: number;
    profit_factor: number;
  }>;
  by_day_of_week: Array<{
    day: string;
    trades: number;
    win_rate: number;
    net_pnl: number;
  }>;
  by_hour_utc: Array<{
    hour: number;
    trades: number;
    win_rate: number;
    net_pnl: number;
  }>;
  by_setup_tag: Array<{
    tag: string;
    trades: number;
    win_rate: number;
    net_pnl: number;
  }>;
  by_mistake_tag: Array<{
    tag: string;
    trades: number;
    win_rate: number;
    net_pnl: number;
  }>;
  trades: JournalTrade[];
  calendar_days: Record<string, CalendarDayStat>;
}

export interface LiveTick {
  symbol: string;
  tf: string;
  bid: number;
  ask: number;
  spread_points: number;
  server_time_ms: number;
  candle?: Candle;
}

export interface TickSnapshot {
  symbol: string;
  bid: number;
  ask: number;
  spread_points: number;
  digits: number;
  point: number;
  change_pct: number;
  server_time_ms: number;
}

export interface DrawingItem {
  id: string;
  symbol: string;
  timeframe: string;
  name: string;
  points: Array<{ timestamp?: number; dataIndex?: number; value?: number }>;
  styles: Record<string, any>;
  extendData?: any;
  label?: string;
  locked: boolean;
  visible: boolean;
  sort_order?: number;
  created_at?: number;
  updated_at?: number;
}

export type LabelPosition = 'top' | 'center' | 'bottom';

export interface FibLevelItem {
  enabled: boolean;
  ratio: number;
  color: string;
}

export interface DrawingVisibilityConfig {
  allTimeframes: boolean;
  timeframes: string[];
}

export interface DrawingExtendConfig {
  label?: string;
  labelPosition?: LabelPosition;
  labelHAlign?: 'left' | 'center' | 'right';
  labelColor?: string;
  opacity?: number;
  customTitle?: string;
  extendLeft?: boolean;
  extendRight?: boolean;
  showTrendLine?: boolean;
  trendLineColor?: string;
  trendLineStyle?: 'solid' | 'dashed';
  levelsLineStyle?: 'solid' | 'dashed' | 'dotted';
  levelsLineWidth?: number;
  useOneColor?: boolean;
  oneColor?: string;
  showBackground?: boolean;
  backgroundOpacity?: number;
  fibLevels?: FibLevelItem[];
  fibReverse?: boolean;
  fibShowPrices?: boolean;
  fibShowLevels?: boolean;
  fibFormat?: 'values' | 'percent';
  fibLabelsAlign?: 'left' | 'center' | 'right';
  // Parallel Channel & Rectangle Zone specific
  showMiddleLine?: boolean;
  // Long / Short R:R specific
  profitZoneColor?: string;
  lossZoneColor?: string;
  zoneOpacity?: number;
  compactBadge?: boolean;
  rrAccountSize?: number;
  rrRiskValue?: number;
  rrRiskMode?: 'percent' | 'money';
  rrFixedQty?: number;
  alwaysShowStats?: boolean;
  // Icon / Emoji / Sticker stamp overlay
  iconGlyph?: string;
  iconSize?: number;
  // Drawing Grouping metadata (persisted in extendData)
  groupId?: string;
  groupName?: string;
  // Visibility per timeframe
  visibility?: DrawingVisibilityConfig;
}

export interface DrawingTemplatePreset {
  id: string;
  name: string;
  toolName: string;
  styles: Record<string, any>;
  extendData: DrawingExtendConfig;
}

export interface SelectedOverlayInfo {
  id: string;
  name: string;
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed';
  locked: boolean;
  opacity?: number;
  label?: string;
  labelPosition?: LabelPosition;
}

export interface ActiveIndicator {
  id: string; // unique client id
  name: string; // KLineCharts indicator name (EMA, MA, BOLL, RSI, MACD, VOL, KDJ, ATR, etc.)
  paneId: string; // 'candle_pane' or created sub-pane id
  isMain: boolean;
  calcParams: Array<number | string | boolean>;
  visible: boolean;
}

export interface ReplayState {
  isActive: boolean;
  isSelectingCut: boolean;
  isPlaying: boolean;
  isLoadingReplayData: boolean;
  speedMs: number; // 2000 (0.5x), 1000 (1x), 500 (2x), 333 (3x), 200 (5x), 100 (10x)
  stepTimeframe: string; // e.g. '1h', '15m', '5m', '1m' (always <= active chart timeframe)
  replayTimeMs: number; // Universal Replay Clock (inclusive upper bound of revealed market time)
  allCandles: Candle[];
  cutIndex: number;
  subCandles: Candle[];
  subIndex: number;
  hasMoreForward: boolean;
}

export const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W'];

export const TF_SECONDS_MAP: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
  '1D': 86400,
  '1W': 604800,
};

export function computeHeikinAshi(candles: Candle[], digits = 2): Candle[] {
  const result: Candle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const prev = result[i - 1];
    const haOpen = prev ? (prev.open + prev.close) / 2 : (c.open + c.close) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    result.push({
      ...c,
      open: Number(haOpen.toFixed(digits)),
      high: Number(haHigh.toFixed(digits)),
      low: Number(haLow.toFixed(digits)),
      close: Number(haClose.toFixed(digits)),
    });
  }
  return result;
}
