import { create } from 'zustand';
import { api } from '../services/api';
import {
  simulatePaperBarTick,
  sliceCandlesAtReplayTime,
} from '../services/replayEngine';
import {
  AccountSummary,
  ActiveIndicator,
  BacktestAnalytics,
  Candle,
  ChartThemeSettings,
  ChartType,
  DEFAULT_CHART_SETTINGS,
  DEFAULT_PINNED_TIMEFRAMES,
  DrawingItem,
  getTimeframeSeconds,
  LayoutMode,
  LiveTick,
  MagnetMode,
  MT5Status,
  PaneConfig,
  PaneId,
  PaperAccountState,
  PaperTrade,
  PendingOrderItem,
  PlaceOrderPayload,
  PositionItem,
  PriceAlertItem,
  ReplayState,
  SecondaryPaneId,
  SelectedOverlayInfo,
  SymbolInfo,
  TickSnapshot,
  Timeframe,
  ToastNotice,
  TradeStatePayload,
  TradingSessionName,
  WorkspaceTab,
} from '../types/chart';

function detectTradingSession(tsMs: number): TradingSessionName {
  const h = new Date(tsMs).getUTCHours();
  if (h >= 7 && h < 12) return 'LONDON';
  if (h >= 12 && h < 16) return 'OVERLAP';
  if (h >= 16 && h < 21) return 'NEW_YORK';
  return 'ASIA';
}

function extractConfluences(
  entryPrice: number,
  slPrice: number,
  drawings: DrawingItem[],
  symbol: string
): string[] {
  const low = slPrice > 0 ? Math.min(entryPrice, slPrice) : entryPrice * 0.995;
  const high = slPrice > 0 ? Math.max(entryPrice, slPrice) : entryPrice * 1.005;
  const tol = Math.abs(entryPrice) * 0.004;
  const found = new Set<string>();
  for (const d of drawings) {
    if (d.symbol !== symbol) continue;
    const lbl = String((d.extendData as any)?.label || d.label || '').trim();
    if (!lbl) continue;
    const pts = d.points || [];
    const near = pts.some(
      (p) =>
        typeof p.value === 'number' &&
        p.value >= low - tol &&
        p.value <= high + tol
    );
    if (near) found.add(lbl);
  }
  return Array.from(found);
}

export interface CrosshairData {
  candle: Candle | null;
  prevClose: number | null;
  dataIndex: number;
  x: number;
  y: number;
}

export interface ChartActionsBridge {
  applyReplaySlice?: (candles: Candle[]) => void;
  updateReplayCandle?: (candle: Candle) => void;
  restoreAllCandles?: (candles: Candle[]) => void;
  setVisibleRangeBars?: (bars: number) => void;
  resetChartScale?: () => void;
  captureChartBaseImage?: () => string | null;
  updateSelectedOverlayStyle?: (patch: Partial<SelectedOverlayInfo>) => void;
  updateSelectedOverlayLabel?: (label: string, labelPosition?: 'top' | 'center' | 'bottom') => void;
  updateOverlayConfig?: (
    id: string,
    patch: {
      points?: Array<{ timestamp?: number; dataIndex?: number; value?: number }>;
      styles?: Record<string, any>;
      extendData?: Record<string, any>;
      lock?: boolean;
      visible?: boolean;
    },
    persist?: boolean
  ) => void;
  deleteSelectedOverlay?: () => void;
  clearAllOverlays?: () => void;
  getOverlayPoints?: (id: string) => Array<{ timestamp?: number; dataIndex?: number; value?: number }>;
  getOverlayExtendData?: (id: string) => Record<string, any>;
  restoreDrawingsSnapshot?: (items: DrawingItem[]) => void;
  toggleSingleOverlayLock?: (id: string) => void;
  toggleSingleOverlayVisible?: (id: string) => void;
  deleteSingleOverlay?: (id: string) => void;
  deleteMultipleOverlays?: (ids: string[]) => void;
  updateMultipleOverlaysStyle?: (
    ids: string[],
    patch: {
      color?: string;
      lineWidth?: number;
      lineStyle?: 'solid' | 'dashed';
      opacity?: number;
      locked?: boolean;
      visible?: boolean;
    }
  ) => void;
  groupOverlays?: (ids: string[], groupName?: string) => void;
  ungroupOverlays?: (ids: string[]) => void;
  addOverlaysToGroup?: (ids: string[], groupId: string, groupName: string) => void;
  removeOverlayFromGroup?: (id: string) => void;
  cloneOverlayGroup?: (groupId: string) => void;
  copyOverlayById?: (id: string) => void;
  renameOverlayGroup?: (groupId: string, newName: string) => void;
  selectOverlayById?: (id: string) => void;
  loadMoreDeepHistory?: (bars?: number) => void;
  jumpToDate?: (dateStr: string) => void;
  zoomInChart?: () => void;
  setYAxisAutoScale?: (auto: boolean) => void;
}

const LS_SETTINGS_KEY = 'tv_chart_settings';
const LS_FAV_TOOLS_KEY = 'tv_fav_tools';
const LS_FAV_POS_KEY = 'tv_fav_pos';
const LS_TZ_KEY = 'tv_timezone';
const LS_PINNED_TFS_KEY = 'tv_pinned_tfs';
const LS_CUSTOM_TFS_KEY = 'tv_custom_tfs';
const LS_WATCHLIST_KEY = 'tv_watchlist_items';
const LS_TABS_KEY = 'tv_workspace_tabs_v1';
const LS_DRAWING_GROUPS_KEY = 'tv_drawing_groups_v1';

export interface DrawingGroupFolder {
  id: string;
  name: string;
  symbol: string;
}

const DEFAULT_SECONDARY_PANES: Record<SecondaryPaneId, PaneConfig> = {
  'pane-2': { id: 'pane-2', symbol: 'EURUSD', timeframe: '1h' },
  'pane-3': { id: 'pane-3', symbol: 'GBPUSD', timeframe: '4h' },
  'pane-4': { id: 'pane-4', symbol: 'USDJPY', timeframe: '1D' },
};

function loadInitialTabs(): { tabs: WorkspaceTab[]; activeTabId: string } {
  try {
    const raw = localStorage.getItem(LS_TABS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.tabs) && parsed.tabs.length > 0) {
        return {
          tabs: parsed.tabs,
          activeTabId: parsed.activeTabId || parsed.tabs[0].id,
        };
      }
    }
  } catch {}
  const initial: WorkspaceTab = {
    id: 'tab-1',
    isNewTab: false,
    symbol: 'XAUUSD',
    timeframe: '15m',
    chartType: 'candle_solid',
    layoutMode: '1',
    activePaneId: 'pane-1',
    secondaryPanes: { ...DEFAULT_SECONDARY_PANES },
    activeIndicators: [],
  };
  return { tabs: [initial], activeTabId: 'tab-1' };
}

function saveWorkspaceTabs(tabs: WorkspaceTab[], activeTabId: string) {
  try {
    localStorage.setItem(LS_TABS_KEY, JSON.stringify({ tabs, activeTabId }));
  } catch {}
}

const INITIAL_TABS_STATE = loadInitialTabs();
const INITIAL_ACTIVE_TAB =
  INITIAL_TABS_STATE.tabs.find((t) => t.id === INITIAL_TABS_STATE.activeTabId) ||
  INITIAL_TABS_STATE.tabs[0];

const DEFAULT_FAV_TOOLS = [
  'segment',
  'horizontalStraightLine',
  'fibonacciLine',
  'rectBox',
  'riskRewardLong',
  'riskRewardShort',
  'rulerMeasure',
];

function loadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

function sortTimeframesAsc(tfs: string[]): string[] {
  return [...tfs].sort((a, b) => getTimeframeSeconds(a) - getTimeframeSeconds(b));
}

function loadLSArray(key: string, fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

interface ChartStore {
  // Core market state
  symbol: string;
  symbolReloadNonce: number;
  symbolInfo: SymbolInfo;
  timeframe: Timeframe;
  pinnedTimeframes: string[];
  customTimeframes: string[];
  symbolSearchInitialQuery: string;
  chartType: ChartType;

  // Data state
  candles: Candle[];
  isLoadingCandles: boolean;
  hasMoreHistory: boolean;
  liveTick: LiveTick | null;
  wsConnected: boolean;
  mt5Status: MT5Status | null;
  crosshairData: CrosshairData | null;

  // Drawing & Tool state
  activeTool: string | null;
  activeIconGlyph: string;
  keepDrawingMode: boolean;
  magnetMode: MagnetMode;
  ctrlMagnetPressed: boolean;
  drawingsLocked: boolean;
  drawingsVisible: boolean;
  selectedOverlay: SelectedOverlayInfo | null;
  selectedOverlayIds: string[];
  drawingSettingsOverlayId: string | null;
  drawingsList: DrawingItem[];
  drawingsBySymbol: Record<string, DrawingItem[]>;
  drawingGroups: DrawingGroupFolder[];
  paneBridges: Partial<Record<PaneId, ChartActionsBridge>>;
  undoStack: DrawingItem[][];
  redoStack: DrawingItem[][];

  // Favorites Toolbar state
  favoriteTools: string[];
  floatingFavVisible: boolean;
  floatingFavPos: { x: number; y: number };

  // Chart Theme Settings
  chartSettings: ChartThemeSettings;
  chartSettingsModalOpen: boolean;

  // Indicators state
  activeIndicators: ActiveIndicator[];

  // Multi-chart & Sidebar state
  workspaceTabs: WorkspaceTab[];
  activeTabId: string;
  layoutMode: LayoutMode;
  activePaneId: PaneId;
  syncSymbolAcrossPanes: boolean;
  secondaryPanes: Record<SecondaryPaneId, PaneConfig>;
  rightSidebarTab: 'watchlist' | 'objects' | 'alerts';
  watchlistSymbols: string[];
  collapsedSections: Record<string, boolean>;
  watchlistVisible: boolean;
  isChartFullscreen: boolean;
  watchlistTicks: Record<string, TickSnapshot>;
  symbolModalOpen: boolean;
  indicatorsModalOpen: boolean;
  logScale: boolean;
  autoScale: boolean;
  timezone: string; // IANA timezone string e.g. 'Asia/Jakarta'

  // Alerts state
  alerts: PriceAlertItem[];
  triggeredAlertNotice: { alert: PriceAlertItem; triggeredAt: number } | null;

  // Bar Replay state
  replay: ReplayState;

  // Phase 2: Broker Trading & Headless MT5 state
  account: AccountSummary | null;
  positions: PositionItem[];
  orders: PendingOrderItem[];
  tradeDockOpen: boolean;
  defaultLot: number;
  riskPct: number;
  mt5WindowHidden: boolean;
  toastMessage: ToastNotice | null;

  // Phase 3.5 & Backtest Telemetry state
  accountModalOpen: boolean;
  backtestModalOpen: boolean;
  analyticsHubOpen: boolean;
  analyticsHubTab: 'report' | 'journal' | 'calendar';
  paperAccount: PaperAccountState;
  latestAnalytics: BacktestAnalytics | null;

  // Imperative bridge to ChartContainer
  bridge: ChartActionsBridge;

  // Actions
  setSymbol: (symbol: string, info?: Partial<SymbolInfo>) => void;
  syncResolvedSymbol: (resolved: string) => void;
  setSymbolInfo: (info: SymbolInfo) => void;
  setTimeframe: (tf: Timeframe) => void;
  togglePinnedTimeframe: (tf: string) => void;
  addCustomTimeframe: (tf: string) => void;
  removeCustomTimeframe: (tf: string) => void;
  openSymbolSearchWithQuery: (query: string) => void;
  clearSymbolSearchInitialQuery: () => void;
  setWatchlistSymbols: (symbols: string[]) => void;
  setChartType: (type: ChartType) => void;
  setCandles: (candles: Candle[], hasMore?: boolean) => void;
  prependCandles: (older: Candle[], hasMore: boolean) => void;
  setLoadingCandles: (loading: boolean) => void;
  setLiveTick: (tick: LiveTick) => void;
  setWsConnected: (connected: boolean) => void;
  setMt5Status: (status: MT5Status) => void;
  setCrosshairData: (data: CrosshairData | null) => void;

  setActiveTool: (tool: string | null) => void;
  setActiveIconGlyph: (glyph: string) => void;
  toggleKeepDrawingMode: () => void;
  cycleMagnetMode: () => void;
  setCtrlMagnetPressed: (pressed: boolean) => void;
  toggleDrawingsLocked: () => void;
  toggleDrawingsVisible: () => void;
  setSelectedOverlay: (info: SelectedOverlayInfo | null) => void;
  setSelectedOverlayIds: (ids: string[]) => void;
  toggleSelectedOverlayId: (id: string) => void;
  setDrawingSettingsOverlayId: (id: string | null) => void;
  setDrawingsList: (list: DrawingItem[]) => void;
  setDrawingsForSymbol: (symbol: string, list: DrawingItem[]) => void;
  registerPaneBridge: (paneId: PaneId, bridge: ChartActionsBridge) => void;
  addEmptyDrawingGroup: (symbol: string, name?: string) => DrawingGroupFolder;
  renameEmptyDrawingGroup: (groupId: string, name: string) => void;
  removeEmptyDrawingGroup: (groupId: string) => void;
  pushUndoSnapshot: (snapshot: DrawingItem[]) => void;
  undoDrawing: () => void;
  redoDrawing: () => void;

  toggleFavoriteTool: (toolId: string) => void;
  reorderFavoriteTools: (fromIndex: number, toIndex: number) => void;
  toggleFloatingFavVisible: () => void;
  setFloatingFavPos: (pos: { x: number; y: number }) => void;

  setChartSettingsModalOpen: (open: boolean) => void;
  updateChartSettings: (patch: Partial<ChartThemeSettings>) => void;
  resetChartSettings: () => void;

  addIndicator: (ind: ActiveIndicator) => void;
  removeIndicator: (id: string) => void;
  toggleIndicatorVisibility: (id: string) => void;
  updateIndicatorParams: (id: string, params: Array<number | string | boolean>) => void;

  setLayoutMode: (mode: LayoutMode) => void;
  setRightSidebarTab: (tab: 'watchlist' | 'objects' | 'alerts') => void;
  toggleWatchlist: () => void;
  toggleChartFullscreen: () => void;
  setChartFullscreen: (v: boolean) => void;
  addWatchlistSymbol: (symbol: string) => void;
  addWatchlistSymbolAt: (symbol: string, insertIndex: number) => void;
  addWatchlistSection: (label: string) => void;
  renameWatchlistSection: (index: number, newLabel: string) => void;
  removeWatchlistItemAt: (index: number) => void;
  reorderWatchlistItems: (fromIndex: number, toIndex: number) => void;
  toggleSectionCollapsed: (sectionKey: string) => void;
  removeWatchlistSymbol: (symbol: string) => void;
  setWatchlistTicks: (ticks: TickSnapshot[]) => void;
  setSymbolModalOpen: (open: boolean) => void;
  setIndicatorsModalOpen: (open: boolean) => void;
  toggleLogScale: () => void;
  toggleAutoScale: () => void;
  setAutoScale: (auto: boolean) => void;
  setTimezone: (tz: string) => void;

  setAlerts: (alerts: PriceAlertItem[]) => void;
  addAlert: (alert: PriceAlertItem) => Promise<void>;
  updateAlertPrice: (
    id: string,
    price: number,
    condition?: 'CROSSING' | 'CROSSING_UP' | 'CROSSING_DOWN'
  ) => Promise<void>;
  removeAlert: (id: string) => Promise<void>;
  markAlertTriggered: (id: string) => Promise<void>;
  rearmAlert: (id: string) => Promise<void>;
  dismissTriggeredAlert: () => void;

  // Replay actions
  enterReplayMode: () => void;
  startSelectingCut: () => void;
  cutReplayAtIndex: (targetIndex: number) => void;
  startReplayFromDate: (targetTsMs: number) => Promise<void>;
  startReplayFromFirstAvailable: () => Promise<void>;
  startReplayFromRandomBar: () => Promise<void>;
  setReplayStepTimeframe: (stepTf: string) => Promise<void>;
  stepReplayForward: () => void;
  stepReplayBackward: () => void;
  reloadReplayForTimeframe: (tf: string) => Promise<void>;
  toggleReplayPlaying: () => void;
  setReplaySpeed: (speedMs: number) => void;
  exitReplayMode: () => void;

  // Phase 2: Broker Trading & Headless MT5 actions
  setTradeState: (payload: TradeStatePayload) => void;
  toggleTradeDock: () => void;
  setDefaultLot: (lot: number) => void;
  setRiskPct: (pct: number) => void;
  setMt5WindowHidden: (hidden: boolean) => void;
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
  clearToast: () => void;
  executeOrder: (payload: PlaceOrderPayload) => Promise<boolean>;
  refreshTradeState: () => Promise<void>;

  // Account Switcher & Replay Paper Backtest actions
  setAccountModalOpen: (open: boolean) => void;
  setBacktestModalOpen: (open: boolean) => void;
  openAnalyticsHub: (tab?: 'report' | 'journal' | 'calendar') => void;
  setAnalyticsHubOpen: (open: boolean) => void;
  setAnalyticsHubTab: (tab: 'report' | 'journal' | 'calendar') => void;
  setActivePaneId: (paneId: PaneId) => void;
  toggleSyncSymbolAcrossPanes: () => void;
  setSecondaryPaneSymbol: (paneId: SecondaryPaneId, symbol: string) => void;
  setSecondaryPaneTimeframe: (paneId: SecondaryPaneId, tf: Timeframe) => void;
  addWorkspaceTab: () => void;
  switchWorkspaceTab: (tabId: string) => void;
  closeWorkspaceTab: (tabId: string) => void;
  updatePaperTradeSlTp: (tradeId: string, sl: number, tp: number) => void;
  modifyPaperTrade: (tradeId: string, patch: { entry_price?: number; sl?: number; tp?: number }) => void;
  bulkPaperModify: (ids: string[], patch: { sl?: number; tp?: number }) => void;
  bulkPaperClose: (ids: string[]) => void;
  bulkScope: 'all' | 'pair' | 'selected';
  bulkPairFilter: string;
  selectedTickets: number[];
  setBulkScope: (s: 'all' | 'pair' | 'selected') => void;
  setBulkPairFilter: (s: string) => void;
  toggleBulkTicket: (ticket: number) => void;
  setBulkTickets: (tickets: number[]) => void;
  placePaperOrder: (payload: {
    side: 'BUY' | 'SELL';
    order_mode: 'MARKET' | 'PENDING';
    entry_price?: number;
    sl?: number;
    tp?: number;
    volume?: number;
    risk_pct?: number;
    strategy_tag?: string;
  }) => void;
  closePaperTrade: (tradeId: string) => void;
  cancelPaperTrade: (tradeId: string) => void;
  breakevenPaperTrade: (tradeId: string) => void;
  resetPaperAccount: (name?: string, startingBalance?: number) => void;
  updatePaperSessionMeta: (name: string, notes: string) => void;
  syncPaperBacktest: () => Promise<BacktestAnalytics | null>;

  registerBridge: (bridge: ChartActionsBridge) => void;
}

const LEGACY_DEFAULT_WATCHLIST = [
  '###SECTION:IC MARKETS / STANDARD',
  'XAUUSD',
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  '###SECTION:EXNESS CENT (c)',
  'XAUUSDc',
  'EURUSDc',
  'GBPUSDc',
  '###SECTION:INDICES & CRYPTO',
  'US30',
  'NAS100',
  'BTCUSD',
];

const DEFAULT_WATCHLIST = [
  'XAUUSD',
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'AUDUSD',
  'USDCAD',
  'US30',
  'NAS100',
  'BTCUSD',
];

function loadInitialWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(LS_WATCHLIST_KEY);
    if (!raw) return [...DEFAULT_WATCHLIST];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_WATCHLIST];
    if (
      parsed.length === LEGACY_DEFAULT_WATCHLIST.length &&
      parsed.every((item, idx) => item === LEGACY_DEFAULT_WATCHLIST[idx])
    ) {
      localStorage.setItem(LS_WATCHLIST_KEY, JSON.stringify(DEFAULT_WATCHLIST));
      return [...DEFAULT_WATCHLIST];
    }
    return parsed;
  } catch {
    return [...DEFAULT_WATCHLIST];
  }
}

export const useChartStore = create<ChartStore>((set, get) => ({
  symbol: 'XAUUSD',
  symbolReloadNonce: 0,
  symbolInfo: {
    symbol: 'XAUUSD',
    description: 'Gold vs US Dollar',
    digits: 2,
    point: 0.01,
    category: 'Metals',
  },
  timeframe: '15m',
  pinnedTimeframes: sortTimeframesAsc(loadLSArray(LS_PINNED_TFS_KEY, DEFAULT_PINNED_TIMEFRAMES)),
  customTimeframes: sortTimeframesAsc(loadLSArray(LS_CUSTOM_TFS_KEY, ['3m', '45m', '2h', '2D'])),
  symbolSearchInitialQuery: '',
  chartType: 'candle_solid',

  candles: [],
  isLoadingCandles: false,
  hasMoreHistory: true,
  liveTick: null,
  wsConnected: false,
  mt5Status: null,
  crosshairData: null,

  activeTool: null,
  activeIconGlyph: '★',
  keepDrawingMode: false,
  magnetMode: 'normal',
  ctrlMagnetPressed: false,
  drawingsLocked: false,
  drawingsVisible: true,
  selectedOverlay: null,
  selectedOverlayIds: [],
  drawingSettingsOverlayId: null,
  drawingsList: [],
  drawingsBySymbol: {},
  drawingGroups: loadLS<DrawingGroupFolder[]>(LS_DRAWING_GROUPS_KEY, []),
  paneBridges: {},
  undoStack: [],
  redoStack: [],

  favoriteTools: loadLSArray(LS_FAV_TOOLS_KEY, DEFAULT_FAV_TOOLS),
  floatingFavVisible: true,
  floatingFavPos: loadLS(LS_FAV_POS_KEY, { x: 60, y: 52 }),

  chartSettings: loadLS(LS_SETTINGS_KEY, DEFAULT_CHART_SETTINGS),
  chartSettingsModalOpen: false,

  activeIndicators: [],

  workspaceTabs: INITIAL_TABS_STATE.tabs,
  activeTabId: INITIAL_TABS_STATE.activeTabId,
  layoutMode: INITIAL_ACTIVE_TAB?.layoutMode || '1',
  activePaneId: INITIAL_ACTIVE_TAB?.activePaneId || 'pane-1',
  syncSymbolAcrossPanes: false,
  secondaryPanes: loadLS<Record<SecondaryPaneId, PaneConfig>>('tv_secondary_panes', {
    ...DEFAULT_SECONDARY_PANES,
  }),
  rightSidebarTab: 'watchlist',
  watchlistSymbols: loadInitialWatchlist(),
  collapsedSections: {},
  watchlistVisible: true,
  isChartFullscreen: false,
  watchlistTicks: {},
  symbolModalOpen: false,
  indicatorsModalOpen: false,
  logScale: false,
  autoScale: true,
  timezone: localStorage.getItem(LS_TZ_KEY) || 'Asia/Jakarta',

  alerts: [],
  triggeredAlertNotice: null,

  replay: {
    isActive: false,
    isSelectingCut: false,
    isPlaying: false,
    isLoadingReplayData: false,
    speedMs: 500,
    stepTimeframe: '15m',
    replayTimeMs: 0,
    allCandles: [],
    cutIndex: 0,
    subCandles: [],
    subIndex: -1,
    hasMoreForward: false,
  },

  account: null,
  positions: [],
  orders: [],
  tradeDockOpen: true,
  defaultLot: 0.01,
  riskPct: 1.0,
  mt5WindowHidden: false,
  toastMessage: null,

  accountModalOpen: false,
  backtestModalOpen: false,
  analyticsHubOpen: false,
  analyticsHubTab: 'report',
  paperAccount: {
    session_id: `bt_${Date.now()}`,
    name: 'Smart Money Replay Session',
    notes: '',
    startingBalance: 10000,
    balance: 10000,
    equity: 10000,
    trades: [],
  },
  latestAnalytics: null,

  bridge: {},

  setSymbol: (symbol, info) => {
    const state = get();
    // In multi-chart mode without sync, changing symbol only updates the focused pane!
    if (
      state.layoutMode !== '1' &&
      !state.syncSymbolAcrossPanes &&
      state.activePaneId !== 'pane-1'
    ) {
      const targetPane = state.activePaneId as SecondaryPaneId;
      const nextPanes: Record<SecondaryPaneId, PaneConfig> = {
        ...state.secondaryPanes,
        [targetPane]: { ...state.secondaryPanes[targetPane], symbol },
      };
      try {
        localStorage.setItem('tv_secondary_panes', JSON.stringify(nextPanes));
      } catch {}
      set({ secondaryPanes: nextPanes });
      return;
    }

    if (state.replay.isActive) {
      set({
        replay: {
          isActive: false,
          isSelectingCut: false,
          isPlaying: false,
          isLoadingReplayData: false,
          speedMs: state.replay.speedMs,
          stepTimeframe: state.timeframe,
          replayTimeMs: 0,
          allCandles: [],
          cutIndex: 0,
          subCandles: [],
          subIndex: -1,
          hasMoreForward: false,
        },
      });
    }

    let nextSecondary = state.secondaryPanes;
    if (state.syncSymbolAcrossPanes) {
      nextSecondary = {
        'pane-2': { ...state.secondaryPanes['pane-2'], symbol },
        'pane-3': { ...state.secondaryPanes['pane-3'], symbol },
        'pane-4': { ...state.secondaryPanes['pane-4'], symbol },
      };
      try {
        localStorage.setItem('tv_secondary_panes', JSON.stringify(nextSecondary));
      } catch {}
    }

    const updatedTabs = state.workspaceTabs.map((t) =>
      t.id === state.activeTabId
        ? { ...t, isNewTab: false, symbol, secondaryPanes: nextSecondary }
        : t
    );
    saveWorkspaceTabs(updatedTabs, state.activeTabId);

    set({
      symbol,
      workspaceTabs: updatedTabs,
      secondaryPanes: nextSecondary,
      symbolReloadNonce: state.symbolReloadNonce + 1,
      symbolInfo: {
        symbol,
        description: info?.description ?? symbol,
        digits: info?.digits ?? state.symbolInfo.digits,
        point: info?.point ?? state.symbolInfo.point,
        category: info?.category ?? 'Other',
      },
      selectedOverlay: null,
      liveTick: null,
      crosshairData: null,
      undoStack: [],
      redoStack: [],
    });
  },

  syncResolvedSymbol: (resolved) =>
    set((state) =>
      state.symbol === resolved
        ? state
        : {
            symbol: resolved,
            symbolInfo: { ...state.symbolInfo, symbol: resolved },
          }
    ),

  setSymbolInfo: (info) => set({ symbolInfo: info }),

  setTimeframe: (tf) => {
    const state = get();
    if (state.layoutMode !== '1' && state.activePaneId !== 'pane-1') {
      const targetPane = state.activePaneId as SecondaryPaneId;
      const nextPanes: Record<SecondaryPaneId, PaneConfig> = {
        ...state.secondaryPanes,
        [targetPane]: { ...state.secondaryPanes[targetPane], timeframe: tf },
      };
      try {
        localStorage.setItem('tv_secondary_panes', JSON.stringify(nextPanes));
      } catch {}
      set({ secondaryPanes: nextPanes });
      return;
    }
    if (state.replay.isActive) {
      if (!state.replay.isSelectingCut) {
        // Lookahead-free MTF switch during active Bar Replay:
        // Keep replay active at the same replayTimeMs, clamp stepTimeframe if needed, and reload chart TF.
        const nextStepTf =
          getTimeframeSeconds(state.replay.stepTimeframe) > getTimeframeSeconds(tf)
            ? tf
            : state.replay.stepTimeframe;
        set({
          timeframe: tf,
          crosshairData: null,
          replay: {
            ...state.replay,
            isPlaying: false,
            stepTimeframe: nextStepTf,
          },
        });
        void get().reloadReplayForTimeframe(tf);
        return;
      }

      // If still selecting cut point, exit selection mode cleanly on timeframe switch
      set({
        replay: {
          isActive: false,
          isSelectingCut: false,
          isPlaying: false,
          isLoadingReplayData: false,
          speedMs: state.replay.speedMs,
          stepTimeframe: tf,
          replayTimeMs: 0,
          allCandles: [],
          cutIndex: 0,
          subCandles: [],
          subIndex: -1,
          hasMoreForward: false,
        },
      });
    }
    set({ timeframe: tf, crosshairData: null });
  },

  setActivePaneId: (paneId) =>
    set((state) => {
      if (state.activePaneId === paneId) return state;
      const targetSymbol =
        state.layoutMode !== '1' && paneId !== 'pane-1'
          ? state.secondaryPanes[paneId as SecondaryPaneId]?.symbol || state.symbol
          : state.symbol;
      const nextBridge =
        state.paneBridges[paneId] || state.paneBridges['pane-1'] || state.bridge;
      const nextDrawings = state.drawingsBySymbol[targetSymbol] ?? state.drawingsList;
      return {
        activePaneId: paneId,
        selectedOverlay: null,
        selectedOverlayIds: [],
        bridge: { ...state.bridge, ...nextBridge },
        drawingsList: nextDrawings,
      };
    }),

  toggleSyncSymbolAcrossPanes: () =>
    set((state) => {
      const next = !state.syncSymbolAcrossPanes;
      if (next) {
        const synced: Record<SecondaryPaneId, PaneConfig> = {
          'pane-2': { ...state.secondaryPanes['pane-2'], symbol: state.symbol },
          'pane-3': { ...state.secondaryPanes['pane-3'], symbol: state.symbol },
          'pane-4': { ...state.secondaryPanes['pane-4'], symbol: state.symbol },
        };
        try {
          localStorage.setItem('tv_secondary_panes', JSON.stringify(synced));
        } catch {}
        return { syncSymbolAcrossPanes: next, secondaryPanes: synced };
      }
      return { syncSymbolAcrossPanes: next };
    }),

  setSecondaryPaneSymbol: (paneId, symbol) =>
    set((state) => {
      const nextPanes: Record<SecondaryPaneId, PaneConfig> = {
        ...state.secondaryPanes,
        [paneId]: { ...state.secondaryPanes[paneId], symbol },
      };
      try {
        localStorage.setItem('tv_secondary_panes', JSON.stringify(nextPanes));
      } catch {}
      return { secondaryPanes: nextPanes };
    }),

  setSecondaryPaneTimeframe: (paneId, tf) =>
    set((state) => {
      const nextPanes: Record<SecondaryPaneId, PaneConfig> = {
        ...state.secondaryPanes,
        [paneId]: { ...state.secondaryPanes[paneId], timeframe: tf },
      };
      try {
        localStorage.setItem('tv_secondary_panes', JSON.stringify(nextPanes));
      } catch {}
      return { secondaryPanes: nextPanes };
    }),

  togglePinnedTimeframe: (tf) =>
    set((state) => {
      const exists = state.pinnedTimeframes.includes(tf);
      const next = exists
        ? state.pinnedTimeframes.filter((t) => t !== tf)
        : sortTimeframesAsc([...state.pinnedTimeframes, tf]);
      if (next.length === 0) return state;
      try {
        localStorage.setItem(LS_PINNED_TFS_KEY, JSON.stringify(next));
      } catch {}
      return { pinnedTimeframes: next };
    }),

  addCustomTimeframe: (tf) =>
    set((state) => {
      const nextCustom = sortTimeframesAsc(
        state.customTimeframes.includes(tf)
          ? state.customTimeframes
          : [...state.customTimeframes, tf]
      );
      const nextPinned = sortTimeframesAsc(
        state.pinnedTimeframes.includes(tf)
          ? state.pinnedTimeframes
          : [...state.pinnedTimeframes, tf]
      );
      try {
        localStorage.setItem(LS_CUSTOM_TFS_KEY, JSON.stringify(nextCustom));
        localStorage.setItem(LS_PINNED_TFS_KEY, JSON.stringify(nextPinned));
      } catch {}
      return {
        customTimeframes: nextCustom,
        pinnedTimeframes: nextPinned,
        timeframe: tf,
      };
    }),

  removeCustomTimeframe: (tf) =>
    set((state) => {
      const nextCustom = state.customTimeframes.filter((t) => t !== tf);
      let nextPinned = state.pinnedTimeframes.filter((t) => t !== tf);
      if (nextPinned.length === 0) {
        nextPinned = ['15m'];
      }
      try {
        localStorage.setItem(LS_CUSTOM_TFS_KEY, JSON.stringify(nextCustom));
        localStorage.setItem(LS_PINNED_TFS_KEY, JSON.stringify(nextPinned));
      } catch {}
      return {
        customTimeframes: nextCustom,
        pinnedTimeframes: nextPinned,
        timeframe: state.timeframe === tf ? nextPinned[0] : state.timeframe,
      };
    }),

  openSymbolSearchWithQuery: (query) =>
    set({
      symbolSearchInitialQuery: query,
      symbolModalOpen: true,
    }),

  clearSymbolSearchInitialQuery: () => set({ symbolSearchInitialQuery: '' }),

  setWatchlistSymbols: (watchlistSymbols) => {
    try {
      localStorage.setItem(LS_WATCHLIST_KEY, JSON.stringify(watchlistSymbols));
    } catch {}
    set({ watchlistSymbols });
  },

  setChartType: (chartType) => set({ chartType }),

  setCandles: (candles, hasMore = true) => set({ candles, hasMoreHistory: hasMore }),

  prependCandles: (older, hasMore) =>
    set((state) => {
      if (older.length === 0) return { hasMoreHistory: false };
      const existingFirst = state.candles[0]?.timestamp ?? Infinity;
      const filtered = older.filter((c) => c.timestamp < existingFirst);
      return {
        candles: [...filtered, ...state.candles],
        hasMoreHistory: hasMore,
      };
    }),

  setLoadingCandles: (isLoadingCandles) => set({ isLoadingCandles }),

  setLiveTick: (tick) => set({ liveTick: tick }),

  setWsConnected: (wsConnected) => set({ wsConnected }),

  setMt5Status: (mt5Status) =>
    set({
      mt5Status,
      mt5WindowHidden:
        mt5Status.mt5_window_hidden !== undefined
          ? mt5Status.mt5_window_hidden
          : get().mt5WindowHidden,
    }),

  setCrosshairData: (crosshairData) => set({ crosshairData }),

  setActiveTool: (activeTool) => set({ activeTool }),

  toggleKeepDrawingMode: () => set((state) => ({ keepDrawingMode: !state.keepDrawingMode })),
  setActiveIconGlyph: (activeIconGlyph) => set({ activeIconGlyph }),

  cycleMagnetMode: () =>
    set((state) => {
      const next: MagnetMode =
        state.magnetMode === 'normal'
          ? 'weak_magnet'
          : state.magnetMode === 'weak_magnet'
          ? 'strong_magnet'
          : 'normal';
      return { magnetMode: next };
    }),

  setCtrlMagnetPressed: (ctrlMagnetPressed) => set({ ctrlMagnetPressed }),

  toggleDrawingsLocked: () => set((state) => ({ drawingsLocked: !state.drawingsLocked })),

  toggleDrawingsVisible: () => set((state) => ({ drawingsVisible: !state.drawingsVisible })),

  setSelectedOverlay: (selectedOverlay) =>
    set((state) => ({
      selectedOverlay,
      selectedOverlayIds: !selectedOverlay
        ? []
        : state.selectedOverlayIds.length > 1 &&
          state.selectedOverlayIds.includes(selectedOverlay.id)
        ? state.selectedOverlayIds
        : [selectedOverlay.id],
    })),

  setSelectedOverlayIds: (selectedOverlayIds) => set({ selectedOverlayIds }),

  toggleSelectedOverlayId: (id) =>
    set((state) => {
      const exists = state.selectedOverlayIds.includes(id);
      const next = exists
        ? state.selectedOverlayIds.filter((x) => x !== id)
        : [...state.selectedOverlayIds, id];
      return {
        selectedOverlayIds: next,
        ...(next.length === 0 ? { selectedOverlay: null } : {}),
      };
    }),

  setDrawingSettingsOverlayId: (drawingSettingsOverlayId) => set({ drawingSettingsOverlayId }),

  setDrawingsList: (drawingsList) =>
    set((state) => {
      const sym =
        state.layoutMode !== '1' && state.activePaneId !== 'pane-1'
          ? state.secondaryPanes[state.activePaneId as SecondaryPaneId]?.symbol || state.symbol
          : state.symbol;
      return {
        drawingsList,
        drawingsBySymbol: { ...state.drawingsBySymbol, [sym]: drawingsList },
      };
    }),

  setDrawingsForSymbol: (sym, list) =>
    set((state) => {
      const activeSym =
        state.layoutMode !== '1' && state.activePaneId !== 'pane-1'
          ? state.secondaryPanes[state.activePaneId as SecondaryPaneId]?.symbol || state.symbol
          : state.symbol;
      return {
        drawingsBySymbol: { ...state.drawingsBySymbol, [sym]: list },
        ...(activeSym === sym ? { drawingsList: list } : {}),
      };
    }),

  registerPaneBridge: (paneId, paneBridge) =>
    set((state) => {
      const nextPaneBridges = {
        ...state.paneBridges,
        [paneId]: { ...(state.paneBridges[paneId] || {}), ...paneBridge },
      };
      return {
        paneBridges: nextPaneBridges,
        ...(state.activePaneId === paneId || (state.layoutMode === '1' && paneId === 'pane-1')
          ? { bridge: { ...state.bridge, ...nextPaneBridges[paneId] } }
          : {}),
      };
    }),

  addEmptyDrawingGroup: (symbol, name) => {
    const state = get();
    const existingForSym = new Set<string>();
    state.drawingGroups
      .filter((g) => g.symbol === symbol)
      .forEach((g) => existingForSym.add(g.id));
    state.drawingsList.forEach((d) => {
      const gid = (d.extendData as any)?.groupId;
      if (gid) existingForSym.add(gid);
    });
    const folder: DrawingGroupFolder = {
      id: `grp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name?.trim() || `Group ${existingForSym.size + 1}`,
      symbol,
    };
    const next = [...state.drawingGroups, folder];
    try {
      localStorage.setItem(LS_DRAWING_GROUPS_KEY, JSON.stringify(next));
    } catch {}
    set({ drawingGroups: next });
    return folder;
  },

  renameEmptyDrawingGroup: (groupId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((state) => {
      const next = state.drawingGroups.map((g) =>
        g.id === groupId ? { ...g, name: trimmed } : g
      );
      try {
        localStorage.setItem(LS_DRAWING_GROUPS_KEY, JSON.stringify(next));
      } catch {}
      return { drawingGroups: next };
    });
  },

  removeEmptyDrawingGroup: (groupId) => {
    set((state) => {
      const next = state.drawingGroups.filter((g) => g.id !== groupId);
      try {
        localStorage.setItem(LS_DRAWING_GROUPS_KEY, JSON.stringify(next));
      } catch {}
      return { drawingGroups: next };
    });
  },

  pushUndoSnapshot: (snapshot) =>
    set((state) => ({
      undoStack: [...state.undoStack.slice(-24), snapshot],
      redoStack: [],
    })),

  undoDrawing: () => {
    const state = get();
    if (state.undoStack.length === 0) return;
    const prev = state.undoStack[state.undoStack.length - 1];
    const nextUndo = state.undoStack.slice(0, -1);
    const nextRedo = [...state.redoStack, state.drawingsList];
    set({ undoStack: nextUndo, redoStack: nextRedo, drawingsList: prev });
    state.bridge.restoreDrawingsSnapshot?.(prev);
  },

  redoDrawing: () => {
    const state = get();
    if (state.redoStack.length === 0) return;
    const next = state.redoStack[state.redoStack.length - 1];
    const nextRedo = state.redoStack.slice(0, -1);
    const nextUndo = [...state.undoStack, state.drawingsList];
    set({ undoStack: nextUndo, redoStack: nextRedo, drawingsList: next });
    state.bridge.restoreDrawingsSnapshot?.(next);
  },

  toggleFavoriteTool: (toolId) =>
    set((state) => {
      const exists = state.favoriteTools.includes(toolId);
      const next = exists
        ? state.favoriteTools.filter((t) => t !== toolId)
        : [...state.favoriteTools, toolId];
      try {
        localStorage.setItem(LS_FAV_TOOLS_KEY, JSON.stringify(next));
      } catch {}
      return { favoriteTools: next };
    }),

  reorderFavoriteTools: (fromIndex, toIndex) =>
    set((state) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= state.favoriteTools.length ||
        toIndex >= state.favoriteTools.length
      ) {
        return state;
      }
      const next = [...state.favoriteTools];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      try {
        localStorage.setItem(LS_FAV_TOOLS_KEY, JSON.stringify(next));
      } catch {}
      return { favoriteTools: next };
    }),

  toggleFloatingFavVisible: () =>
    set((state) => ({ floatingFavVisible: !state.floatingFavVisible })),

  setFloatingFavPos: (pos) => {
    try {
      localStorage.setItem(LS_FAV_POS_KEY, JSON.stringify(pos));
    } catch {}
    set({ floatingFavPos: pos });
  },

  setChartSettingsModalOpen: (chartSettingsModalOpen) => set({ chartSettingsModalOpen }),

  updateChartSettings: (patch) =>
    set((state) => {
      const next = { ...state.chartSettings, ...patch };
      try {
        localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(next));
      } catch {}
      return { chartSettings: next };
    }),

  resetChartSettings: () => {
    try {
      localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(DEFAULT_CHART_SETTINGS));
    } catch {}
    set({ chartSettings: { ...DEFAULT_CHART_SETTINGS } });
  },

  addIndicator: (ind) =>
    set((state) => ({ activeIndicators: [...state.activeIndicators, ind] })),

  removeIndicator: (id) =>
    set((state) => ({
      activeIndicators: state.activeIndicators.filter((i) => i.id !== id),
    })),

  toggleIndicatorVisibility: (id) =>
    set((state) => ({
      activeIndicators: state.activeIndicators.map((i) =>
        i.id === id ? { ...i, visible: !i.visible } : i
      ),
    })),

  updateIndicatorParams: (id, calcParams) =>
    set((state) => ({
      activeIndicators: state.activeIndicators.map((i) =>
        i.id === id ? { ...i, calcParams } : i
      ),
    })),

  setLayoutMode: (layoutMode) =>
    set((state) => {
      const updatedTabs = state.workspaceTabs.map((t) =>
        t.id === state.activeTabId ? { ...t, layoutMode } : t
      );
      saveWorkspaceTabs(updatedTabs, state.activeTabId);
      return { layoutMode, workspaceTabs: updatedTabs };
    }),

  addWorkspaceTab: () => {
    const state = get();
    const newId = `tab-${Date.now()}`;
    const newTab: WorkspaceTab = {
      id: newId,
      isNewTab: true,
      symbol: state.symbol,
      timeframe: state.timeframe,
      chartType: state.chartType,
      layoutMode: '1',
      activePaneId: 'pane-1',
      secondaryPanes: { ...state.secondaryPanes },
      activeIndicators: [...state.activeIndicators],
    };
    const nextTabs = [
      ...state.workspaceTabs.map((t) =>
        t.id === state.activeTabId
          ? {
              ...t,
              symbol: state.symbol,
              timeframe: state.timeframe,
              chartType: state.chartType,
              layoutMode: state.layoutMode,
              activePaneId: state.activePaneId,
              secondaryPanes: { ...state.secondaryPanes },
              activeIndicators: [...state.activeIndicators],
            }
          : t
      ),
      newTab,
    ];
    saveWorkspaceTabs(nextTabs, newId);
    set({
      workspaceTabs: nextTabs,
      activeTabId: newId,
      layoutMode: '1',
      activePaneId: 'pane-1',
      symbolModalOpen: true,
    });
  },

  switchWorkspaceTab: (tabId) => {
    const state = get();
    if (tabId === state.activeTabId) return;
    const target = state.workspaceTabs.find((t) => t.id === tabId);
    if (!target) return;

    const savedTabs = state.workspaceTabs.map((t) =>
      t.id === state.activeTabId
        ? {
            ...t,
            symbol: state.symbol,
            timeframe: state.timeframe,
            chartType: state.chartType,
            layoutMode: state.layoutMode,
            activePaneId: state.activePaneId,
            secondaryPanes: { ...state.secondaryPanes },
            activeIndicators: [...state.activeIndicators],
          }
        : t
    );
    saveWorkspaceTabs(savedTabs, tabId);
    set({
      workspaceTabs: savedTabs,
      activeTabId: tabId,
      symbol: target.symbol,
      symbolReloadNonce: state.symbolReloadNonce + 1,
      timeframe: target.timeframe,
      chartType: target.chartType,
      layoutMode: target.layoutMode,
      activePaneId: target.activePaneId,
      secondaryPanes: { ...target.secondaryPanes },
      activeIndicators: [...target.activeIndicators],
      selectedOverlay: null,
      liveTick: null,
      crosshairData: null,
    });
  },

  closeWorkspaceTab: (tabId) => {
    const state = get();
    if (state.workspaceTabs.length <= 1) {
      const resetTabs = state.workspaceTabs.map((t) => ({ ...t, isNewTab: true }));
      saveWorkspaceTabs(resetTabs, resetTabs[0].id);
      set({ workspaceTabs: resetTabs, symbolModalOpen: true });
      return;
    }
    const idx = state.workspaceTabs.findIndex((t) => t.id === tabId);
    const remaining = state.workspaceTabs.filter((t) => t.id !== tabId);
    if (tabId !== state.activeTabId) {
      saveWorkspaceTabs(remaining, state.activeTabId);
      set({ workspaceTabs: remaining });
      return;
    }
    const nextTab = remaining[Math.max(0, idx - 1)] || remaining[0];
    saveWorkspaceTabs(remaining, nextTab.id);
    set({
      workspaceTabs: remaining,
      activeTabId: nextTab.id,
      symbol: nextTab.symbol,
      symbolReloadNonce: state.symbolReloadNonce + 1,
      timeframe: nextTab.timeframe,
      chartType: nextTab.chartType,
      layoutMode: nextTab.layoutMode,
      activePaneId: nextTab.activePaneId,
      secondaryPanes: { ...nextTab.secondaryPanes },
      activeIndicators: [...nextTab.activeIndicators],
      selectedOverlay: null,
      liveTick: null,
      crosshairData: null,
    });
  },

  setRightSidebarTab: (rightSidebarTab) => set({ rightSidebarTab, watchlistVisible: true }),

  toggleWatchlist: () => set((state) => ({ watchlistVisible: !state.watchlistVisible })),

  toggleChartFullscreen: () =>
    set((state) => ({ isChartFullscreen: !state.isChartFullscreen })),

  setChartFullscreen: (isChartFullscreen) => set({ isChartFullscreen }),

  addWatchlistSymbol: (sym) =>
    set((state) => {
      if (state.watchlistSymbols.includes(sym)) return state;
      const next = [...state.watchlistSymbols, sym];
      try {
        localStorage.setItem(LS_WATCHLIST_KEY, JSON.stringify(next));
      } catch {}
      return { watchlistSymbols: next };
    }),

  addWatchlistSymbolAt: (sym, insertIndex) =>
    set((state) => {
      const next = state.watchlistSymbols.filter((s) => s !== sym);
      const idx = Math.max(0, Math.min(insertIndex, next.length));
      next.splice(idx, 0, sym);
      try {
        localStorage.setItem(LS_WATCHLIST_KEY, JSON.stringify(next));
      } catch {}
      return { watchlistSymbols: next };
    }),

  addWatchlistSection: (label) =>
    set((state) => {
      const item = `###SECTION:${label.trim() || 'NEW GROUP'}`;
      const next = [item, ...state.watchlistSymbols];
      try {
        localStorage.setItem(LS_WATCHLIST_KEY, JSON.stringify(next));
      } catch {}
      return { watchlistSymbols: next };
    }),

  renameWatchlistSection: (index, newLabel) =>
    set((state) => {
      if (index < 0 || index >= state.watchlistSymbols.length) return state;
      const next = [...state.watchlistSymbols];
      next[index] = `###SECTION:${newLabel.trim() || 'GROUP'}`;
      try {
        localStorage.setItem(LS_WATCHLIST_KEY, JSON.stringify(next));
      } catch {}
      return { watchlistSymbols: next };
    }),

  removeWatchlistItemAt: (index) =>
    set((state) => {
      const next = state.watchlistSymbols.filter((_, i) => i !== index);
      try {
        localStorage.setItem(LS_WATCHLIST_KEY, JSON.stringify(next));
      } catch {}
      return { watchlistSymbols: next };
    }),

  reorderWatchlistItems: (fromIndex, toIndex) =>
    set((state) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= state.watchlistSymbols.length ||
        toIndex >= state.watchlistSymbols.length
      ) {
        return state;
      }
      const next = [...state.watchlistSymbols];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      try {
        localStorage.setItem(LS_WATCHLIST_KEY, JSON.stringify(next));
      } catch {}
      return { watchlistSymbols: next };
    }),

  toggleSectionCollapsed: (sectionKey) =>
    set((state) => ({
      collapsedSections: {
        ...state.collapsedSections,
        [sectionKey]: !state.collapsedSections[sectionKey],
      },
    })),

  removeWatchlistSymbol: (sym) =>
    set((state) => {
      const next = state.watchlistSymbols.filter((s) => s !== sym);
      try {
        localStorage.setItem(LS_WATCHLIST_KEY, JSON.stringify(next));
      } catch {}
      return { watchlistSymbols: next };
    }),

  setWatchlistTicks: (ticks) =>
    set((state) => {
      const next = { ...state.watchlistTicks };
      for (const t of ticks) {
        next[t.symbol] = t;
      }
      return { watchlistTicks: next };
    }),

  setSymbolModalOpen: (symbolModalOpen) => set({ symbolModalOpen }),

  setIndicatorsModalOpen: (indicatorsModalOpen) => set({ indicatorsModalOpen }),

  toggleLogScale: () => set((state) => ({ logScale: !state.logScale })),

  toggleAutoScale: () => set((state) => ({ autoScale: !state.autoScale })),

  setAutoScale: (autoScale) => set({ autoScale }),

  setTimezone: (timezone) => {
    try {
      localStorage.setItem(LS_TZ_KEY, timezone);
    } catch {}
    set({ timezone });
  },

  setAlerts: (alerts) => set({ alerts }),

  addAlert: async (alert) => {
    try {
      const saved = await api.saveAlert(alert);
      set((state) => ({ alerts: [saved, ...state.alerts.filter((a) => a.id !== saved.id)] }));
      get().showToast('info', `Alert set on ${saved.symbol} @ ${saved.price}`);
    } catch (err: any) {
      get().showToast('error', err?.message || 'Failed to save alert');
    }
  },

  updateAlertPrice: async (id, price, condition) => {
    const existing = get().alerts.find((a) => a.id === id);
    if (!existing) return;
    const updated: PriceAlertItem = {
      ...existing,
      price,
      condition: condition ?? existing.condition,
      triggered: false,
      active: true,
    };
    set((state) => ({
      alerts: state.alerts.map((a) => (a.id === id ? updated : a)),
    }));
    try {
      await api.saveAlert(updated);
      const d = get().symbolInfo.digits ?? 2;
      get().showToast('success', `🔔 Alert moved to ${price.toFixed(d)}`);
    } catch (err: any) {
      get().showToast('error', err?.message || 'Failed to update alert');
    }
  },

  removeAlert: async (id) => {
    try {
      await api.deleteAlert(id);
      set((state) => ({ alerts: state.alerts.filter((a) => a.id !== id) }));
    } catch {}
  },

  markAlertTriggered: async (id) => {
    const existing = get().alerts.find((a) => a.id === id);
    if (!existing || existing.triggered) return;
    const updated: PriceAlertItem = { ...existing, triggered: true, active: false };
    set((state) => ({
      alerts: state.alerts.map((a) => (a.id === id ? updated : a)),
      triggeredAlertNotice: { alert: updated, triggeredAt: Date.now() },
    }));
    api.saveAlert(updated).catch(() => {});
  },

  rearmAlert: async (id) => {
    const existing = get().alerts.find((a) => a.id === id);
    if (!existing) return;
    const updated: PriceAlertItem = { ...existing, triggered: false, active: true };
    set((state) => ({
      alerts: state.alerts.map((a) => (a.id === id ? updated : a)),
      triggeredAlertNotice:
        state.triggeredAlertNotice?.alert.id === id ? null : state.triggeredAlertNotice,
    }));
    api.saveAlert(updated).catch(() => {});
    get().showToast('info', `🔔 Alert re-armed on ${updated.symbol} @ ${updated.price}`);
  },

  dismissTriggeredAlert: () => set({ triggeredAlertNotice: null }),

  // --- Bar Replay Mode Engine (Universal replayTimeMs Clock + Intra-Bar + MTF) ---

  enterReplayMode: () => {
    const state = get();
    if (state.candles.length < 25) return;
    if (state.replay.isActive) {
      get().exitReplayMode();
      return;
    }
    const tfMs = getTimeframeSeconds(state.timeframe) * 1000;
    const last = state.candles[state.candles.length - 1];
    set({
      activeTool: null,
      replay: {
        isActive: true,
        isSelectingCut: true,
        isPlaying: false,
        isLoadingReplayData: false,
        speedMs: state.replay.speedMs || 500,
        stepTimeframe: state.timeframe,
        replayTimeMs: last ? last.timestamp + tfMs : Date.now(),
        allCandles: [...state.candles],
        cutIndex: state.candles.length - 1,
        subCandles: [],
        subIndex: -1,
        hasMoreForward: false,
      },
    });
  },

  startSelectingCut: () => {
    const state = get();
    if (!state.replay.isActive) return;
    state.bridge.restoreAllCandles?.(state.replay.allCandles);
    set({
      replay: {
        ...state.replay,
        isPlaying: false,
        isSelectingCut: true,
      },
    });
  },

  cutReplayAtIndex: (targetIndex) => {
    const state = get();
    if (!state.replay.isActive || state.replay.allCandles.length === 0) return;
    const clamped = Math.max(20, Math.min(targetIndex, state.replay.allCandles.length - 1));
    const sliced = state.replay.allCandles.slice(0, clamped + 1);
    const tfMs = getTimeframeSeconds(state.timeframe) * 1000;
    const lastCandle = sliced[sliced.length - 1];
    const replayTimeMs = lastCandle ? lastCandle.timestamp + tfMs : state.replay.replayTimeMs;

    state.bridge.applyReplaySlice?.(sliced);
    set({
      candles: sliced,
      replay: {
        ...state.replay,
        cutIndex: clamped,
        replayTimeMs,
        subCandles: [],
        subIndex: -1,
        isSelectingCut: false,
        isPlaying: false,
      },
      crosshairData: lastCandle
        ? {
            candle: lastCandle,
            prevClose: sliced[sliced.length - 2]?.close ?? lastCandle.open,
            dataIndex: clamped,
            x: 0,
            y: 0,
          }
        : state.crosshairData,
    });

    // If user already picked a smaller stepTimeframe, load intra-bar sub-candles around cut point
    if (getTimeframeSeconds(state.replay.stepTimeframe) < getTimeframeSeconds(state.timeframe)) {
      void get().setReplayStepTimeframe(state.replay.stepTimeframe);
    }
  },

  startReplayFromDate: async (targetTsMs) => {
    const state = get();
    set({
      replay: { ...state.replay, isPlaying: false, isLoadingReplayData: true },
    });
    try {
      const res = await api.getCandlesWindow(state.symbol, state.timeframe, targetTsMs, 400, 1500);
      if (!res.candles || res.candles.length < 25) {
        get().showToast('error', 'Not enough historical data around that date.');
        set((s) => ({ replay: { ...s.replay, isLoadingReplayData: false } }));
        return;
      }

      let cutIdx = res.candles.findIndex((c) => c.timestamp >= targetTsMs);
      if (cutIdx === -1) cutIdx = res.candles.length - 1;
      cutIdx = Math.max(20, Math.min(cutIdx, res.candles.length - 1));

      const sliced = res.candles.slice(0, cutIdx + 1);
      const tfMs = getTimeframeSeconds(state.timeframe) * 1000;
      const last = sliced[sliced.length - 1];
      const replayTimeMs = last.timestamp + tfMs;

      get().bridge.applyReplaySlice?.(sliced);
      set((s) => ({
        candles: sliced,
        replay: {
          ...s.replay,
          isActive: true,
          isSelectingCut: false,
          isPlaying: false,
          isLoadingReplayData: false,
          allCandles: res.candles,
          cutIndex: cutIdx,
          replayTimeMs,
          subCandles: [],
          subIndex: -1,
          hasMoreForward: res.has_more,
        },
        crosshairData: {
          candle: last,
          prevClose: sliced[sliced.length - 2]?.close ?? last.open,
          dataIndex: cutIdx,
          x: 0,
          y: 0,
        },
      }));

      const dateStr = new Date(last.timestamp).toLocaleString();
      get().showToast('success', `📅 Replay started from ${dateStr}`);

      const curStep = get().replay.stepTimeframe;
      if (getTimeframeSeconds(curStep) < getTimeframeSeconds(state.timeframe)) {
        void get().setReplayStepTimeframe(curStep);
      }
    } catch {
      get().showToast('error', 'Failed to load replay date window.');
      set((s) => ({ replay: { ...s.replay, isLoadingReplayData: false } }));
    }
  },

  startReplayFromFirstAvailable: async () => {
    const state = get();
    set({
      replay: { ...state.replay, isPlaying: false, isLoadingReplayData: true },
    });
    try {
      const res = await api.getEarliestCandles(state.symbol, state.timeframe, 3000);
      if (!res.candles || res.candles.length < 10) {
        get().showToast('error', 'No earliest historical candles available.');
        set((s) => ({ replay: { ...s.replay, isLoadingReplayData: false } }));
        return;
      }

      const cutIdx = Math.min(35, Math.max(5, res.candles.length - 10));
      const sliced = res.candles.slice(0, cutIdx + 1);
      const tfMs = getTimeframeSeconds(state.timeframe) * 1000;
      const last = sliced[sliced.length - 1];
      const replayTimeMs = last.timestamp + tfMs;

      get().bridge.applyReplaySlice?.(sliced);
      set((s) => ({
        candles: sliced,
        replay: {
          ...s.replay,
          isActive: true,
          isSelectingCut: false,
          isPlaying: false,
          isLoadingReplayData: false,
          allCandles: res.candles,
          cutIndex: cutIdx,
          replayTimeMs,
          subCandles: [],
          subIndex: -1,
          hasMoreForward: res.has_more,
        },
        crosshairData: {
          candle: last,
          prevClose: sliced[sliced.length - 2]?.close ?? last.open,
          dataIndex: cutIdx,
          x: 0,
          y: 0,
        },
      }));

      const dateStr = new Date(last.timestamp).toLocaleDateString();
      get().showToast('success', `🚩 Replay jumped to first available date (${dateStr})`);
    } catch {
      get().showToast('error', 'Failed to fetch earliest candles.');
      set((s) => ({ replay: { ...s.replay, isLoadingReplayData: false } }));
    }
  },

  startReplayFromRandomBar: async () => {
    const state = get();
    let pool = state.replay.allCandles;
    if (pool.length < 300) {
      set({ replay: { ...state.replay, isPlaying: false, isLoadingReplayData: true } });
      try {
        const res = await api.getCandles(state.symbol, state.timeframe, 3000);
        if (res.candles.length > pool.length) {
          pool = res.candles;
          set((s) => ({
            replay: { ...s.replay, allCandles: pool, isLoadingReplayData: false },
          }));
        } else {
          set((s) => ({ replay: { ...s.replay, isLoadingReplayData: false } }));
        }
      } catch {
        set((s) => ({ replay: { ...s.replay, isLoadingReplayData: false } }));
      }
    }
    if (pool.length < 30) return;

    const minIdx = Math.max(30, Math.floor(pool.length * 0.15));
    const maxIdx = Math.max(minIdx + 1, Math.floor(pool.length * 0.78));
    const randomIdx = minIdx + Math.floor(Math.random() * (maxIdx - minIdx));
    get().cutReplayAtIndex(randomIdx);
    const ts = pool[randomIdx]?.timestamp;
    if (ts) {
      get().showToast('info', `🎲 Random Replay cut at ${new Date(ts).toLocaleString()}`);
    }
  },

  setReplayStepTimeframe: async (stepTf) => {
    const state = get();
    if (!state.replay.isActive) return;

    const chartSec = getTimeframeSeconds(state.timeframe);
    const stepSec = getTimeframeSeconds(stepTf);
    if (stepSec >= chartSec) {
      set((s) => ({
        replay: {
          ...s.replay,
          stepTimeframe: state.timeframe,
          subCandles: [],
          subIndex: -1,
        },
      }));
      return;
    }

    set((s) => ({
      replay: { ...s.replay, stepTimeframe: stepTf, isPlaying: false, isLoadingReplayData: true },
    }));
    try {
      const res = await api.getCandlesWindow(
        state.symbol,
        stepTf,
        state.replay.replayTimeMs,
        200,
        3000
      );
      const cur = get();
      const { visible, cutIndex, subIndex } = sliceCandlesAtReplayTime(
        cur.replay.allCandles,
        cur.timeframe,
        cur.replay.replayTimeMs,
        res.candles,
        stepTf
      );
      if (visible.length > 0) {
        cur.bridge.applyReplaySlice?.(visible);
      }
      set((s) => ({
        candles: visible.length > 0 ? visible : s.candles,
        replay: {
          ...s.replay,
          stepTimeframe: stepTf,
          subCandles: res.candles,
          subIndex,
          cutIndex,
          isLoadingReplayData: false,
        },
      }));
      get().showToast('info', `Intra-bar step set to ${stepTf} on ${state.timeframe} chart`);
    } catch {
      set((s) => ({ replay: { ...s.replay, isLoadingReplayData: false } }));
    }
  },

  reloadReplayForTimeframe: async (tf) => {
    const state = get();
    if (!state.replay.isActive) return;
    const anchorMs = state.replay.replayTimeMs;
    set((s) => ({
      replay: { ...s.replay, isPlaying: false, isLoadingReplayData: true },
    }));

    try {
      const res = await api.getCandlesWindow(state.symbol, tf, anchorMs, 400, 1500);
      const tfSec = getTimeframeSeconds(tf);
      const tfMs = tfSec * 1000;
      const isMidBar = anchorMs % tfMs !== 0;

      let subCandles: Candle[] = [];
      let subTf = get().replay.stepTimeframe;
      if (getTimeframeSeconds(subTf) > tfSec) subTf = tf;

      // If anchorMs falls mid-candle on the new HTF (or user chose intra-bar step), fetch LTF sub-bars
      if (isMidBar || getTimeframeSeconds(subTf) < tfSec) {
        const fetchSubTf =
          getTimeframeSeconds(subTf) < tfSec
            ? subTf
            : tfSec >= 3600
            ? '15m'
            : tfSec >= 900
            ? '5m'
            : '1m';
        try {
          const subRes = await api.getCandlesWindow(state.symbol, fetchSubTf, anchorMs, 200, 2000);
          subCandles = subRes.candles;
          if (getTimeframeSeconds(subTf) >= tfSec && isMidBar) {
            // Keep subCandles for forming candle synthesis without forcing stepTf change
          }
        } catch {}
      }

      const { visible, cutIndex, subIndex } = sliceCandlesAtReplayTime(
        res.candles,
        tf,
        anchorMs,
        subCandles,
        getTimeframeSeconds(subTf) < tfSec ? subTf : undefined
      );

      get().bridge.applyReplaySlice?.(visible);
      const last = visible[visible.length - 1];
      set((s) => ({
        candles: visible,
        replay: {
          ...s.replay,
          allCandles: res.candles,
          cutIndex,
          subCandles: getTimeframeSeconds(subTf) < tfSec ? subCandles : [],
          subIndex: getTimeframeSeconds(subTf) < tfSec ? subIndex : -1,
          stepTimeframe: subTf,
          hasMoreForward: res.has_more,
          isLoadingReplayData: false,
        },
        crosshairData: last
          ? {
              candle: last,
              prevClose: visible[visible.length - 2]?.close ?? last.open,
              dataIndex: visible.length - 1,
              x: 0,
              y: 0,
            }
          : s.crosshairData,
      }));
    } catch {
      set((s) => ({ replay: { ...s.replay, isLoadingReplayData: false } }));
    }
  },

  stepReplayForward: () => {
    const state = get();
    const { replay, bridge, symbolInfo, paperAccount } = state;
    if (!replay.isActive || replay.isSelectingCut || replay.isLoadingReplayData) return;

    const chartTfMs = getTimeframeSeconds(state.timeframe) * 1000;
    const stepTfMs = getTimeframeSeconds(replay.stepTimeframe) * 1000;
    const isIntraBar = stepTfMs < chartTfMs && replay.subCandles.length > 0;

    // --- Mode A: Intra-Bar Sub-Step ---
    if (isIntraBar) {
      const nextSubIdx = replay.subIndex + 1;
      if (nextSubIdx >= replay.subCandles.length) {
        set({ replay: { ...replay, isPlaying: false } });
        return;
      }

      const nextSub = replay.subCandles[nextSubIdx];
      const nextReplayTimeMs = nextSub.timestamp + stepTfMs;
      const sim = simulatePaperBarTick(paperAccount, state.symbol, symbolInfo, nextSub);
      const { visible, cutIndex } = sliceCandlesAtReplayTime(
        replay.allCandles,
        state.timeframe,
        nextReplayTimeMs,
        replay.subCandles,
        replay.stepTimeframe
      );

      const formingBar = visible[visible.length - 1];
      if (formingBar) {
        bridge.updateReplayCandle?.(formingBar);
      }

      set({
        candles: visible,
        replay: {
          ...replay,
          cutIndex,
          subIndex: nextSubIdx,
          replayTimeMs: nextReplayTimeMs,
          isPlaying: nextSubIdx >= replay.subCandles.length - 1 ? false : replay.isPlaying,
        },
        paperAccount: sim.nextPaperAccount,
        crosshairData: formingBar
          ? {
              candle: formingBar,
              prevClose: visible[visible.length - 2]?.close ?? formingBar.open,
              dataIndex: visible.length - 1,
              x: 0,
              y: 0,
            }
          : state.crosshairData,
      });

      if (sim.toasts.length > 0) {
        const lastT = sim.toasts[sim.toasts.length - 1];
        get().showToast(lastT.type, lastT.msg);
      }
      if (sim.anyClosed) get().syncPaperBacktest();
      return;
    }

    // --- Mode B: Full-Bar Step ---
    if (replay.cutIndex >= replay.allCandles.length - 1) {
      set({ replay: { ...replay, isPlaying: false } });
      return;
    }

    const nextIndex = replay.cutIndex + 1;
    const nextCandle = replay.allCandles[nextIndex];
    const prevCandle = replay.allCandles[replay.cutIndex];
    const nextReplayTimeMs = nextCandle.timestamp + chartTfMs;

    bridge.updateReplayCandle?.(nextCandle);

    const sim = simulatePaperBarTick(paperAccount, state.symbol, symbolInfo, nextCandle);

    const nextCandles = [...state.candles, nextCandle];
    set({
      candles: nextCandles,
      replay: {
        ...replay,
        cutIndex: nextIndex,
        replayTimeMs: nextReplayTimeMs,
        isPlaying:
          nextIndex >= replay.allCandles.length - 1 && !replay.hasMoreForward
            ? false
            : replay.isPlaying,
      },
      paperAccount: sim.nextPaperAccount,
      crosshairData: {
        candle: nextCandle,
        prevClose: prevCandle?.close ?? nextCandle.open,
        dataIndex: nextCandles.length - 1,
        x: 0,
        y: 0,
      },
    });

    if (sim.toasts.length > 0) {
      const lastT = sim.toasts[sim.toasts.length - 1];
      get().showToast(lastT.type, lastT.msg);
    }
    if (sim.anyClosed) {
      get().syncPaperBacktest();
    }

    // Auto-Extend Forward Buffer silently when < 40 bars remain
    const remaining = replay.allCandles.length - 1 - nextIndex;
    if (remaining < 40 && replay.hasMoreForward) {
      const lastBuffered = replay.allCandles[replay.allCandles.length - 1];
      if (lastBuffered) {
        api
          .getCandlesWindow(state.symbol, state.timeframe, lastBuffered.timestamp, 50, 1500)
          .then((res) => {
            if (!res.candles.length) return;
            set((s) => {
              if (!s.replay.isActive) return s;
              const existingTs = new Set(s.replay.allCandles.map((c) => c.timestamp));
              const appended = res.candles.filter((c) => !existingTs.has(c.timestamp));
              if (appended.length === 0) {
                return { replay: { ...s.replay, hasMoreForward: false } };
              }
              return {
                replay: {
                  ...s.replay,
                  allCandles: [...s.replay.allCandles, ...appended],
                  hasMoreForward: res.has_more,
                },
              };
            });
          })
          .catch(() => {});
      }
    }
  },

  stepReplayBackward: () => {
    const state = get();
    const { replay, bridge } = state;
    if (!replay.isActive || replay.isSelectingCut || replay.cutIndex <= 20) return;
    const prevIdx = Math.max(20, replay.cutIndex - 1);
    const sliced = replay.allCandles.slice(0, prevIdx + 1);
    const tfMs = getTimeframeSeconds(state.timeframe) * 1000;
    const last = sliced[sliced.length - 1];
    const replayTimeMs = last ? last.timestamp + tfMs : replay.replayTimeMs;

    bridge.applyReplaySlice?.(sliced);
    set({
      candles: sliced,
      replay: {
        ...replay,
        isPlaying: false,
        cutIndex: prevIdx,
        replayTimeMs,
        subCandles: [],
        subIndex: -1,
      },
      crosshairData: last
        ? {
            candle: last,
            prevClose: sliced[sliced.length - 2]?.close ?? last.open,
            dataIndex: prevIdx,
            x: 0,
            y: 0,
          }
        : state.crosshairData,
    });
  },

  toggleReplayPlaying: () =>
    set((state) => {
      if (!state.replay.isActive || state.replay.isSelectingCut) return state;
      const atEnd =
        !state.replay.hasMoreForward &&
        state.replay.cutIndex >= state.replay.allCandles.length - 1 &&
        (state.replay.subCandles.length === 0 ||
          state.replay.subIndex >= state.replay.subCandles.length - 1);
      if (atEnd) return state;
      return {
        replay: { ...state.replay, isPlaying: !state.replay.isPlaying },
      };
    }),

  setReplaySpeed: (speedMs) =>
    set((state) => ({
      replay: { ...state.replay, speedMs },
    })),

  exitReplayMode: () => {
    const state = get();
    if (!state.replay.isActive) return;
    set({
      replay: {
        isActive: false,
        isSelectingCut: false,
        isPlaying: false,
        isLoadingReplayData: false,
        speedMs: state.replay.speedMs,
        stepTimeframe: state.timeframe,
        replayTimeMs: 0,
        allCandles: [],
        cutIndex: 0,
        subCandles: [],
        subIndex: -1,
        hasMoreForward: false,
      },
    });
    // Reload latest live candles cleanly when exiting Replay
    api
      .getCandles(state.symbol, state.timeframe, 1500)
      .then((res) => {
        get().bridge.restoreAllCandles?.(res.candles);
        set({ candles: res.candles, hasMoreHistory: res.has_more });
      })
      .catch(() => {
        const full = state.replay.allCandles;
        if (full.length > 0) {
          state.bridge.restoreAllCandles?.(full);
          set({ candles: full });
        }
      });
  },

  setTradeState: (payload) =>
    set({
      account: payload.account,
      positions: payload.positions || [],
      orders: payload.orders || [],
    }),

  toggleTradeDock: () => set((state) => ({ tradeDockOpen: !state.tradeDockOpen })),

  setDefaultLot: (defaultLot) => set({ defaultLot: Math.max(0.01, Number(defaultLot) || 0.01) }),

  setRiskPct: (riskPct) => set({ riskPct: Math.max(0.1, Math.min(25, Number(riskPct) || 1.0)) }),

  setMt5WindowHidden: (mt5WindowHidden) => set({ mt5WindowHidden }),

  showToast: (type, message) => {
    const id = Date.now();
    set({ toastMessage: { id, type, message } });
    window.setTimeout(() => {
      if (get().toastMessage?.id === id) {
        set({ toastMessage: null });
      }
    }, 4500);
  },

  clearToast: () => set({ toastMessage: null }),

  refreshTradeState: async () => {
    try {
      const state = await api.getTradeState();
      get().setTradeState(state);
    } catch {}
  },

  executeOrder: async (payload) => {
    try {
      const res = await api.placeOrder(payload);
      if (res.success) {
        get().showToast('success', res.message);
        await get().refreshTradeState();
        return true;
      } else {
        get().showToast('error', res.message);
        return false;
      }
    } catch (err: any) {
      get().showToast('error', err?.message || 'Order execution failed');
      return false;
    }
  },

  setAccountModalOpen: (accountModalOpen) => set({ accountModalOpen }),

  setBacktestModalOpen: (backtestModalOpen) => set({ backtestModalOpen }),

  openAnalyticsHub: (tab = 'report') =>
    set({ analyticsHubOpen: true, analyticsHubTab: tab }),

  setAnalyticsHubOpen: (analyticsHubOpen) => set({ analyticsHubOpen }),

  setAnalyticsHubTab: (analyticsHubTab) => set({ analyticsHubTab }),

  updatePaperTradeSlTp: (tradeId, sl, tp) => {
    set((state) => ({
      paperAccount: {
        ...state.paperAccount,
        trades: state.paperAccount.trades.map((t) =>
          t.id === tradeId ? { ...t, sl, tp } : t
        ),
      },
    }));
    get().showToast('success', `Updated Paper SL=${sl || 0}, TP=${tp || 0}`);
  },

  placePaperOrder: (payload) => {
    const state = get();
    const curCandle =
      state.replay.allCandles[state.replay.cutIndex] ||
      state.candles[state.candles.length - 1];
    if (!curCandle) return;

    const digits = state.symbolInfo.digits ?? 2;
    const isMarket = payload.order_mode === 'MARKET' || payload.entry_price === undefined;
    const entryPrice = Number(
      (isMarket ? curCandle.close : payload.entry_price!).toFixed(digits)
    );
    const sl = payload.sl ? Number(payload.sl.toFixed(digits)) : 0;
    const tp = payload.tp ? Number(payload.tp.toFixed(digits)) : 0;
    const riskPct = payload.risk_pct ?? state.riskPct ?? 1.0;
    const riskAmount = Number((state.paperAccount.balance * (riskPct / 100)).toFixed(2));
    const slDist = sl > 0 ? Math.abs(entryPrice - sl) : 0;
    const tpDist = tp > 0 ? Math.abs(tp - entryPrice) : 0;
    const plannedRR = slDist > 0 && tpDist > 0 ? Number((tpDist / slDist).toFixed(2)) : 0;

    let orderType: 'MARKET' | 'LIMIT' | 'STOP' = 'MARKET';
    if (!isMarket) {
      if (payload.side === 'BUY') {
        orderType = entryPrice < curCandle.close ? 'LIMIT' : 'STOP';
      } else {
        orderType = entryPrice > curCandle.close ? 'LIMIT' : 'STOP';
      }
    }

    const confluences = extractConfluences(
      entryPrice,
      sl,
      state.drawingsList,
      state.symbol
    );

    const newTrade: PaperTrade = {
      id: `pt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      session_id: state.paperAccount.session_id,
      symbol: state.symbol,
      timeframe: state.timeframe,
      side: payload.side,
      order_type: orderType,
      volume: payload.volume ?? state.defaultLot,
      risk_pct: riskPct,
      risk_amount: riskAmount,
      planned_rr: plannedRR,
      entry_price: entryPrice,
      sl,
      tp,
      status: isMarket ? 'OPEN' : 'PENDING',
      setup_time_ms: curCandle.timestamp,
      open_time_ms: isMarket ? curCandle.timestamp : undefined,
      trading_session: detectTradingSession(curCandle.timestamp),
      pnl_money: 0,
      pnl_pips: 0,
      realized_r: 0,
      mfe_pips: 0,
      mae_pips: 0,
      bars_held: 0,
      strategy_tag: (payload.strategy_tag || '').trim(),
      confluences,
      notes: '',
    };

    set({
      paperAccount: {
        ...state.paperAccount,
        trades: [newTrade, ...state.paperAccount.trades],
      },
    });

    get().showToast(
      'info',
      `🧪 Paper ${orderType} ${payload.side} @ ${entryPrice.toFixed(digits)}${
        newTrade.strategy_tag ? ` [${newTrade.strategy_tag}]` : ''
      }`
    );
    get().syncPaperBacktest();
  },

  closePaperTrade: (tradeId) => {
    const state = get();
    const curCandle =
      state.replay.allCandles[state.replay.cutIndex] ||
      state.candles[state.candles.length - 1];
    if (!curCandle) return;
    const pipSize = (state.symbolInfo.point || 0.01) * 10;
    let updatedBalance = state.paperAccount.balance;

    const nextTrades = state.paperAccount.trades.map((tr) => {
      if (tr.id !== tradeId || tr.status !== 'OPEN') return tr;
      const isBuy = tr.side === 'BUY';
      const exitP = curCandle.close;
      const rawDiff = isBuy ? exitP - tr.entry_price : tr.entry_price - exitP;
      const slDist = tr.sl > 0 ? Math.abs(tr.entry_price - tr.sl) : 0;
      const pnlPips = Number((rawDiff / pipSize).toFixed(1));
      const rMult =
        slDist > 0 ? Number((rawDiff / slDist).toFixed(2)) : Number((pnlPips / 20).toFixed(2));
      const pnlMoney = Number((rMult * tr.risk_amount).toFixed(2));
      updatedBalance = Number((updatedBalance + pnlMoney).toFixed(2));
      return {
        ...tr,
        status: 'CLOSED_MANUAL' as const,
        exit_price: exitP,
        close_time_ms: curCandle.timestamp,
        pnl_pips: pnlPips,
        realized_r: rMult,
        pnl_money: pnlMoney,
      };
    });

    const floating = nextTrades
      .filter((t) => t.status === 'OPEN')
      .reduce((acc, t) => acc + t.pnl_money, 0);

    set({
      paperAccount: {
        ...state.paperAccount,
        balance: updatedBalance,
        equity: Number((updatedBalance + floating).toFixed(2)),
        trades: nextTrades,
      },
    });
    get().showToast('info', 'Paper position closed at current replay bar.');
    get().syncPaperBacktest();
  },

  cancelPaperTrade: (tradeId) => {
    const state = get();
    set({
      paperAccount: {
        ...state.paperAccount,
        trades: state.paperAccount.trades.filter((t) => t.id !== tradeId),
      },
    });
    get().showToast('info', 'Pending paper order cancelled.');
  },

  breakevenPaperTrade: (tradeId) => {
    const state = get();
    set({
      paperAccount: {
        ...state.paperAccount,
        trades: state.paperAccount.trades.map((t) =>
          t.id === tradeId && t.status === 'OPEN' ? { ...t, sl: t.entry_price } : t
        ),
      },
    });
    get().showToast('success', 'Paper SL moved to Breakeven.');
  },

  modifyPaperTrade: (tradeId, patch) => {
    const state = get();
    set({
      paperAccount: {
        ...state.paperAccount,
        trades: state.paperAccount.trades.map((t) => {
          if (t.id !== tradeId) return t;
          return {
            ...t,
            entry_price:
              patch.entry_price !== undefined && patch.entry_price > 0
                ? patch.entry_price
                : t.entry_price,
            sl: patch.sl !== undefined ? (patch.sl > 0 ? patch.sl : 0) : t.sl,
            tp: patch.tp !== undefined ? (patch.tp > 0 ? patch.tp : 0) : t.tp,
          };
        }),
      },
    });
    get().syncPaperBacktest();
  },

  bulkPaperModify: (ids, patch) => {
    const state = get();
    const idSet = new Set(ids);
    set({
      paperAccount: {
        ...state.paperAccount,
        trades: state.paperAccount.trades.map((t) => {
          if (!idSet.has(t.id) || t.status !== 'OPEN') return t;
          return {
            ...t,
            sl: patch.sl !== undefined ? (patch.sl > 0 ? patch.sl : 0) : t.sl,
            tp: patch.tp !== undefined ? (patch.tp > 0 ? patch.tp : 0) : t.tp,
          };
        }),
      },
    });
    get().syncPaperBacktest();
  },

  bulkScope: 'pair',
  bulkPairFilter: '',
  selectedTickets: [],
  setBulkScope: (s) => set({ bulkScope: s }),
  setBulkPairFilter: (s) => set({ bulkPairFilter: s }),
  toggleBulkTicket: (ticket) =>
    set((state) => ({
      selectedTickets: state.selectedTickets.includes(ticket)
        ? state.selectedTickets.filter((t) => t !== ticket)
        : [...state.selectedTickets, ticket],
    })),
  setBulkTickets: (tickets) => set({ selectedTickets: tickets }),

  bulkPaperClose: (ids) => {
    const state = get();
    const idSet = new Set(ids);
    const curCandle =
      state.replay.allCandles[state.replay.cutIndex] ||
      state.candles[state.candles.length - 1];
    if (!curCandle) return;
    const pipSize = (state.symbolInfo.point || 0.01) * 10;
    let updatedBalance = state.paperAccount.balance;

    const nextTrades = state.paperAccount.trades.map((tr) => {
      if (!idSet.has(tr.id) || tr.status !== 'OPEN') return tr;
      const isBuy = tr.side === 'BUY';
      const exitP = curCandle.close;
      const rawDiff = isBuy ? exitP - tr.entry_price : tr.entry_price - exitP;
      const slDist = tr.sl > 0 ? Math.abs(tr.entry_price - tr.sl) : 0;
      const pnlPips = Number((rawDiff / pipSize).toFixed(1));
      const rMult =
        slDist > 0 ? Number((rawDiff / slDist).toFixed(2)) : Number((pnlPips / 20).toFixed(2));
      const pnlMoney = Number((rMult * tr.risk_amount).toFixed(2));
      updatedBalance = Number((updatedBalance + pnlMoney).toFixed(2));
      return {
        ...tr,
        status: 'CLOSED_MANUAL' as const,
        exit_price: exitP,
        close_time_ms: curCandle.timestamp,
        pnl_pips: pnlPips,
        realized_r: rMult,
        pnl_money: pnlMoney,
      };
    });

    const floating = nextTrades
      .filter((t) => t.status === 'OPEN')
      .reduce((acc, t) => acc + t.pnl_money, 0);

    set({
      paperAccount: {
        ...state.paperAccount,
        balance: updatedBalance,
        equity: Number((updatedBalance + floating).toFixed(2)),
        trades: nextTrades,
      },
    });
    get().showToast('success', `${ids.length} paper position(s) closed at current replay bar.`);
    get().syncPaperBacktest();
  },

  resetPaperAccount: (name, startingBalance = 10000) => {
    set({
      paperAccount: {
        session_id: `bt_${Date.now()}`,
        name: name || 'Smart Money Replay Session',
        notes: '',
        startingBalance,
        balance: startingBalance,
        equity: startingBalance,
        trades: [],
      },
      latestAnalytics: null,
    });
    get().showToast('info', `Paper Backtest Account reset ($${startingBalance.toLocaleString()}).`);
  },

  updatePaperSessionMeta: (name, notes) => {
    set((state) => ({
      paperAccount: { ...state.paperAccount, name, notes },
    }));
  },

  syncPaperBacktest: async () => {
    const state = get();
    try {
      const analytics = await api.syncBacktestSession({
        session_id: state.paperAccount.session_id,
        name: state.paperAccount.name,
        symbol: state.symbol,
        timeframe: state.timeframe,
        starting_balance: state.paperAccount.startingBalance,
        current_balance: state.paperAccount.balance,
        notes: state.paperAccount.notes,
        trades: state.paperAccount.trades,
      });
      set({ latestAnalytics: analytics });
      return analytics;
    } catch {
      return null;
    }
  },

  registerBridge: (bridge) =>
    set((state) => {
      const mergedPrimary = { ...(state.paneBridges['pane-1'] || {}), ...bridge };
      return {
        paneBridges: { ...state.paneBridges, 'pane-1': mergedPrimary },
        ...(state.activePaneId === 'pane-1' || state.layoutMode === '1'
          ? { bridge: { ...state.bridge, ...bridge } }
          : {}),
      };
    }),
}));
