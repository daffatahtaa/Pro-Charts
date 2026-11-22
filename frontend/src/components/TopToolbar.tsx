import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  TrendingUp,
  Rewind,
  PanelRight,
  ChevronDown,
  Wifi,
  WifiOff,
  CandlestickChart,
  EyeOff,
  Monitor,
  LayoutGrid,
  Undo2,
  Redo2,
  BellPlus,
  Star,
  Plus,
  BookOpen,
  Maximize,
  Minimize,
  Camera,
  Trash2,
} from 'lucide-react';
import { api } from '../services/api';
import { useChartStore } from '../store/useChartStore';
import { ChartType, getTimeframeSeconds, LayoutMode, parseTradingViewInterval } from '../types/chart';
import { SnapshotMenuDropdown } from './SnapshotMenuDropdown';

const CHART_TYPES: Array<{ value: ChartType; label: string }> = [
  { value: 'candle_solid', label: 'Candles' },
  { value: 'candle_stroke', label: 'Hollow Candles' },
  { value: 'candle_up_stroke', label: 'Up Hollow Candles' },
  { value: 'heikin_ashi', label: 'Heikin Ashi' },
  { value: 'ohlc', label: 'Bars (OHLC)' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
  { value: 'baseline', label: 'Baseline' },
];

const LAYOUT_MODES: Array<{ value: LayoutMode; label: string; desc: string }> = [
  { value: '1', label: '1 Chart', desc: 'Single full view' },
  { value: '2v', label: '2 Vertical', desc: 'Left / Right split' },
  { value: '2h', label: '2 Horizontal', desc: 'Top / Bottom split' },
  { value: '4', label: '4 Grid', desc: '2x2 Multi-Timeframe' },
];

export const TopToolbar: React.FC = () => {
  const {
    symbol,
    symbolInfo,
    timeframe,
    setTimeframe,
    pinnedTimeframes,
    customTimeframes,
    togglePinnedTimeframe,
    addCustomTimeframe,
    removeCustomTimeframe,
    chartType,
    setChartType,
    layoutMode,
    setLayoutMode,
    activePaneId,
    secondaryPanes,
    syncSymbolAcrossPanes,
    toggleSyncSymbolAcrossPanes,
    setSymbolModalOpen,
    setIndicatorsModalOpen,
    openAnalyticsHub,
    setAccountModalOpen,
    setRightSidebarTab,
    replay,
    enterReplayMode,
    watchlistVisible,
    toggleWatchlist,
    isChartFullscreen,
    toggleChartFullscreen,
    mt5Status,
    wsConnected,
    account,
    mt5WindowHidden,
    setMt5WindowHidden,
    undoStack,
    redoStack,
    undoDrawing,
    redoDrawing,
    showToast,
  } = useChartStore();

  const [chartTypeMenuOpen, setChartTypeMenuOpen] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [tfMenuOpen, setTfMenuOpen] = useState(false);
  const [snapshotMenuOpen, setSnapshotMenuOpen] = useState(false);
  const [customVal, setCustomVal] = useState('45');
  const [customUnit, setCustomUnit] = useState<'m' | 'h' | 'D' | 'W'>('m');
  const [togglingWindow, setTogglingWindow] = useState(false);
  const [enablingAlgo, setEnablingAlgo] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const tfMenuRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setChartTypeMenuOpen(false);
      }
      if (layoutRef.current && !layoutRef.current.contains(e.target as Node)) {
        setLayoutMenuOpen(false);
      }
      if (tfMenuRef.current && !tfMenuRef.current.contains(e.target as Node)) {
        setTfMenuOpen(false);
      }
      if (snapshotRef.current && !snapshotRef.current.contains(e.target as Node)) {
        setSnapshotMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleAddCustomTf = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseTradingViewInterval(`${customVal}${customUnit}`);
    if (!parsed) {
      showToast('error', `Invalid custom timeframe: ${customVal}${customUnit}`);
      return;
    }
    addCustomTimeframe(parsed.tf);
    showToast('success', `Added & switched to ${parsed.humanLabel}`);
    setTfMenuOpen(false);
  };

  const BUILTIN_MINUTE_TFS = ['1m', '2m', '3m', '5m', '10m', '15m', '30m', '45m'];
  const BUILTIN_HOUR_TFS = ['1h', '2h', '3h', '4h', '6h', '8h', '12h'];
  const BUILTIN_DAY_WEEK_TFS = ['1D', '2D', '3D', '1W', '1M'];
  const builtinTfSet = new Set([
    ...BUILTIN_MINUTE_TFS,
    ...BUILTIN_HOUR_TFS,
    ...BUILTIN_DAY_WEEK_TFS,
  ]);

  const minuteOptions = Array.from(
    new Set([
      ...BUILTIN_MINUTE_TFS,
      ...customTimeframes.filter((t) => t.endsWith('m')),
    ])
  ).sort((a, b) => getTimeframeSeconds(a) - getTimeframeSeconds(b));
  const hourOptions = Array.from(
    new Set([
      ...BUILTIN_HOUR_TFS,
      ...customTimeframes.filter((t) => t.endsWith('h')),
    ])
  ).sort((a, b) => getTimeframeSeconds(a) - getTimeframeSeconds(b));
  const dayWeekOptions = Array.from(
    new Set([
      ...BUILTIN_DAY_WEEK_TFS,
      ...customTimeframes.filter((t) => t.endsWith('D') || t.endsWith('W') || t.endsWith('M')),
    ])
  ).sort((a, b) => getTimeframeSeconds(a) - getTimeframeSeconds(b));

  const algoOn = account?.trade_allowed ?? mt5Status?.algo_trading_enabled ?? false;

  const handleEnableAlgo = async () => {
    if (enablingAlgo) return;
    setEnablingAlgo(true);
    try {
      const res = await api.enableAlgoTrading();
      showToast(res.algo_trading_enabled ? 'success' : 'error', res.message);
      useChartStore.getState().refreshTradeState();
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to enable Algo Trading');
    } finally {
      setEnablingAlgo(false);
    }
  };

  const handleToggleMt5Window = async () => {
    if (togglingWindow) return;
    setTogglingWindow(true);
    try {
      const nextHidden = !mt5WindowHidden;
      const res = await api.setMt5WindowHidden(nextHidden);
      setMt5WindowHidden(res.hidden);
      showToast('info', res.message);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to toggle MT5 window');
    } finally {
      setTogglingWindow(false);
    }
  };

  const activeSymbol =
    layoutMode !== '1' && activePaneId !== 'pane-1'
      ? secondaryPanes[activePaneId]?.symbol || symbol
      : symbol;
  const activeTimeframe =
    layoutMode !== '1' && activePaneId !== 'pane-1'
      ? secondaryPanes[activePaneId]?.timeframe || timeframe
      : timeframe;

  return (
    <header className="h-[38px] bg-[#1e222d] border-b border-[#2a2e39] flex items-center justify-between px-2 shrink-0 z-30">
      {/* Left group */}
      <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
        {/* Symbol Search Trigger */}
        <button
          onClick={() => setSymbolModalOpen(true)}
          title="Search Symbol (Ctrl+K)"
          className="flex items-center gap-1.5 px-2 h-[28px] rounded hover:bg-[#2a2e39] text-[#d1d4dc] font-semibold tracking-wide transition-colors shrink-0"
        >
          <Search className="w-3.5 h-3.5 text-[#787b86]" />
          <span className="text-[13px]">{activeSymbol}</span>
          {layoutMode !== '1' && (
            <span className="text-[9.5px] px-1 py-0.5 rounded bg-[#2962ff]/20 text-[#2962ff] font-mono-num">
              {activePaneId.replace('pane-', 'P')}
            </span>
          )}
          <span className="text-[10px] px-1 py-0.5 rounded bg-[#131722] text-[#787b86] font-normal hidden xl:inline">
            {symbolInfo.category}
          </span>
        </button>

        <div className="w-[1px] h-5 bg-[#2a2e39] mx-1 shrink-0" />

        {/* Pinned Timeframes + Active Custom TF + Timeframe Manager Dropdown */}
        <div className="flex items-center gap-0.5 shrink-0" ref={tfMenuRef}>
          {pinnedTimeframes.map((tf) => {
            const active = activeTimeframe === tf;
            return (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-1.5 h-[28px] rounded text-[12px] font-medium transition-colors ${
                  active
                    ? 'text-[#2962ff] bg-[#2962ff]/15'
                    : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
                }`}
              >
                {tf}
              </button>
            );
          })}

          {!pinnedTimeframes.includes(activeTimeframe) && (
            <button
              onClick={() => setTfMenuOpen((v) => !v)}
              className="px-1.5 h-[28px] rounded text-[12px] font-semibold text-[#2962ff] bg-[#2962ff]/15"
              title="Active Custom Timeframe"
            >
              {activeTimeframe}
            </button>
          )}

          <div className="relative">
            <button
              onClick={() => setTfMenuOpen((v) => !v)}
              title="All Timeframes & Add Custom Interval"
              className="p-1 h-[28px] rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc] flex items-center"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {tfMenuOpen && (
              <div className="fixed mt-1 w-60 bg-[#1e222d] border border-[#2a2e39] rounded shadow-tv py-1.5 z-50 max-h-[75vh] overflow-y-auto">
                {[
                  { title: 'Minutes', items: minuteOptions },
                  { title: 'Hours', items: hourOptions },
                  { title: 'Days / Weeks / Months', items: dayWeekOptions },
                ].map((grp) => (
                  <div key={grp.title} className="mb-1">
                    <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-[#787b86]">
                      {grp.title}
                    </div>
                    {grp.items.map((tf) => {
                      const isPinned = pinnedTimeframes.includes(tf);
                      const isActive = timeframe === tf;
                      const isCustom = !builtinTfSet.has(tf);
                      return (
                        <div
                          key={tf}
                          onClick={() => {
                            setTimeframe(tf);
                            setTfMenuOpen(false);
                          }}
                          className={`px-3 py-1 text-[12px] flex items-center justify-between cursor-pointer hover:bg-[#2a2e39] ${
                            isActive ? 'text-[#2962ff] bg-[#2962ff]/10 font-semibold' : 'text-[#d1d4dc]'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono-num">{tf}</span>
                            {isCustom && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-[#2962ff]/15 text-[#787b86]">
                                custom
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {isCustom && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeCustomTimeframe(tf);
                                  showToast('info', `Removed custom timeframe ${tf}`);
                                }}
                                title={`Delete custom timeframe ${tf}`}
                                className="p-0.5 rounded text-[#787b86] hover:text-[#f23645] hover:bg-[#131722]"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePinnedTimeframe(tf);
                              }}
                              title={isPinned ? 'Unpin from Top Bar' : 'Pin to Top Bar'}
                              className="p-0.5 rounded hover:bg-[#131722]"
                            >
                              <Star
                                className={`w-3.5 h-3.5 ${
                                  isPinned ? 'text-[#f59e0b]' : 'text-[#787b86]'
                                }`}
                                fill={isPinned ? '#f59e0b' : 'none'}
                              />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* + Add Custom Interval Builder */}
                <form
                  onSubmit={handleAddCustomTf}
                  className="mt-1 pt-2 px-2.5 pb-1 border-t border-[#2a2e39] space-y-1.5"
                >
                  <div className="text-[10px] uppercase tracking-wider text-[#787b86]">
                    + Add Custom Interval
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={customVal}
                      onChange={(e) => setCustomVal(e.target.value)}
                      className="no-spinner w-14 px-1.5 py-1 rounded bg-[#131722] border border-[#2a2e39] font-mono-num text-[12px] text-white text-center outline-none focus:border-[#2962ff]"
                    />
                    <select
                      value={customUnit}
                      onChange={(e) => setCustomUnit(e.target.value as 'm' | 'h' | 'D' | 'W')}
                      className="flex-1 px-1.5 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[11.5px] text-[#d1d4dc] outline-none"
                    >
                      <option value="m">Minutes</option>
                      <option value="h">Hours</option>
                      <option value="D">Days</option>
                      <option value="W">Weeks</option>
                    </select>
                    <button
                      type="submit"
                      className="px-2 py-1 rounded bg-[#2962ff] hover:bg-[#1e53e5] text-white text-[11px] font-semibold flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>

        <div className="w-[1px] h-5 bg-[#2a2e39] mx-1 shrink-0" />

        {/* Chart Type Dropdown (8 TradingView Types) */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => setChartTypeMenuOpen((v) => !v)}
            title="Chart Style"
            className="flex items-center gap-1 px-2 h-[28px] rounded hover:bg-[#2a2e39] text-[#d1d4dc] transition-colors"
          >
            <CandlestickChart className="w-4 h-4" />
            <ChevronDown className="w-3 h-3 text-[#787b86]" />
          </button>
          {chartTypeMenuOpen && (
            <div className="fixed mt-1 w-48 bg-[#1e222d] border border-[#2a2e39] rounded shadow-tv py-1 z-50">
              {CHART_TYPES.map((ct) => (
                <button
                  key={ct.value}
                  onClick={() => {
                    setChartType(ct.value);
                    setChartTypeMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-[12px] flex items-center justify-between hover:bg-[#2a2e39] ${
                    chartType === ct.value ? 'text-[#2962ff] font-medium' : 'text-[#d1d4dc]'
                  }`}
                >
                  <span>{ct.label}</span>
                  {chartType === ct.value && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2962ff]" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-[1px] h-5 bg-[#2a2e39] mx-1 shrink-0" />

        {/* Indicators Button */}
        <button
          onClick={() => setIndicatorsModalOpen(true)}
          className="flex items-center gap-1 px-2 h-[28px] rounded hover:bg-[#2a2e39] text-[#d1d4dc] text-[12px] font-medium transition-colors shrink-0"
        >
          <TrendingUp className="w-3.5 h-3.5 text-[#787b86]" />
          <span className="hidden md:inline">Indicators</span>
        </button>

        {/* Price Alert Quick Button */}
        <button
          onClick={() => setRightSidebarTab('alerts')}
          title="Price Alerts"
          className="flex items-center gap-1 px-2 h-[28px] rounded hover:bg-[#2a2e39] text-[#d1d4dc] text-[12px] font-medium transition-colors shrink-0"
        >
          <BellPlus className="w-3.5 h-3.5 text-[#f59e0b]" />
          <span className="hidden lg:inline">Alert</span>
        </button>

        {/* Journal & Myfxbook Report Hub */}
        <button
          onClick={() => openAnalyticsHub('report')}
          title="Myfxbook Performance Report, Trade Journal & Monthly Calendar"
          className="flex items-center gap-1 px-2 h-[28px] rounded hover:bg-[#2a2e39] text-[#d1d4dc] text-[12px] font-medium transition-colors shrink-0"
        >
          <BookOpen className="w-3.5 h-3.5 text-[#089981]" />
          <span className="hidden lg:inline">Journal</span>
        </button>

        {/* Bar Replay Toggle */}
        <button
          onClick={enterReplayMode}
          className={`flex items-center gap-1 px-2 h-[28px] rounded text-[12px] font-medium transition-colors shrink-0 ${
            replay.isActive
              ? 'bg-[#2962ff] text-white'
              : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
          }`}
          title="Bar Replay Mode"
        >
          <Rewind className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Replay</span>
        </button>

        <div className="w-[1px] h-5 bg-[#2a2e39] mx-1 shrink-0" />

        {/* Undo / Redo Drawings */}
        <button
          onClick={undoDrawing}
          disabled={undoStack.length === 0}
          title="Undo Drawing (Ctrl+Z)"
          className="p-1.5 rounded text-[#d1d4dc] hover:bg-[#2a2e39] disabled:opacity-30 transition-colors shrink-0"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={redoDrawing}
          disabled={redoStack.length === 0}
          title="Redo Drawing (Ctrl+Y)"
          className="p-1.5 rounded text-[#d1d4dc] hover:bg-[#2a2e39] disabled:opacity-30 transition-colors shrink-0"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right group: Layout, Settings, Headless MT5, Algo, Status, Sidebar */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Multi-Chart Layout Picker */}
        <div className="relative" ref={layoutRef}>
          <button
            onClick={() => setLayoutMenuOpen((v) => !v)}
            title="Multi-Chart Layout"
            className={`flex items-center gap-1 px-1.5 h-[26px] rounded transition-colors ${
              layoutMode !== '1'
                ? 'text-[#2962ff] bg-[#2962ff]/15'
                : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="text-[11px] font-mono-num uppercase">{layoutMode}</span>
          </button>
          {layoutMenuOpen && (
            <div className="absolute right-0 top-[32px] w-48 bg-[#1e222d] border border-[#2a2e39] rounded shadow-tv py-1 z-50">
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-[#787b86] border-b border-[#2a2e39]">
                Split Screen Layout
              </div>
              {LAYOUT_MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => {
                    setLayoutMode(m.value);
                    setLayoutMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-[12px] flex items-center justify-between hover:bg-[#2a2e39] ${
                    layoutMode === m.value ? 'text-[#2962ff] font-medium' : 'text-[#d1d4dc]'
                  }`}
                >
                  <div>
                    <div>{m.label}</div>
                    <div className="text-[10px] text-[#787b86]">{m.desc}</div>
                  </div>
                  {layoutMode === m.value && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2962ff]" />
                  )}
                </button>
              ))}
              <div className="mt-1 pt-1 border-t border-[#2a2e39] px-3 py-1.5">
                <label className="flex items-center justify-between gap-2 text-[11px] text-[#d1d4dc] cursor-pointer select-none">
                  <span>Sync Symbol in Layout</span>
                  <input
                    type="checkbox"
                    checked={syncSymbolAcrossPanes}
                    onChange={toggleSyncSymbolAcrossPanes}
                    className="accent-[#2962ff] cursor-pointer"
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Headless MT5 Window Cloak Toggle */}
        <button
          onClick={handleToggleMt5Window}
          disabled={togglingWindow}
          title={
            mt5WindowHidden
              ? 'MT5 terminal is hidden in background. Click to show MT5 window.'
              : 'Click to hide MT5 terminal window (Headless Mode).'
          }
          className={`flex items-center gap-1 px-2 h-[24px] rounded text-[11px] font-medium border transition-colors ${
            mt5WindowHidden
              ? 'bg-[#2962ff]/15 border-[#2962ff]/50 text-[#2962ff]'
              : 'bg-[#131722] border-[#2a2e39] text-[#d1d4dc] hover:bg-[#2a2e39]'
          }`}
        >
          {mt5WindowHidden ? (
            <EyeOff className="w-3 h-3" />
          ) : (
            <Monitor className="w-3 h-3 text-[#787b86]" />
          )}
          <span className="hidden xl:inline">{mt5WindowHidden ? 'MT5 Hidden' : 'Hide MT5'}</span>
        </button>

        {/* Algo Trading Status Badge */}
        <button
          onClick={handleEnableAlgo}
          disabled={enablingAlgo}
          title={
            algoOn
              ? 'Algo Trading is ON (WebView IPC active, other chart EAs disabled)'
              : 'Click to automatically enable Algo Trading & disable other chart EAs'
          }
          className={`flex items-center gap-1 px-2 h-[24px] rounded border text-[10.5px] font-semibold transition-colors ${
            algoOn
              ? 'bg-[#089981]/15 border-[#089981]/40 text-[#089981]'
              : 'bg-[#f59e0b]/15 border-[#f59e0b]/40 text-[#f59e0b] hover:bg-[#f59e0b]/25'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${algoOn ? 'bg-[#089981]' : 'bg-[#f59e0b]'}`} />
          <span>{algoOn ? 'ALGO ON' : 'ALGO OFF'}</span>
        </button>

        {/* MT5 Connection Pill (clickable -> Account Login & Switcher Modal) */}
        <button
          onClick={() => setAccountModalOpen(true)}
          className="flex items-center gap-1 px-2 h-[24px] rounded bg-[#131722] border border-[#2a2e39] hover:border-[#2962ff] text-[11px] transition-colors"
          title={
            mt5Status
              ? `${mt5Status.terminal_company} | ${mt5Status.server} (Click to Switch/Login MT5 Account)`
              : 'Click to Login / Switch MT5 Account'
          }
        >
          {wsConnected ? (
            <Wifi className="w-3 h-3 text-[#089981]" />
          ) : (
            <WifiOff className="w-3 h-3 text-[#f23645]" />
          )}
          <span className={mt5Status?.connected ? 'text-[#089981]' : 'text-[#f59e0b]'}>
            {mt5Status?.connected ? 'MT5 LIVE' : 'SIM'}
          </span>
        </button>

        {/* Fullscreen Mode Button [ ⛶ ] */}
        <button
          type="button"
          onClick={toggleChartFullscreen}
          title={isChartFullscreen ? 'Exit Fullscreen (Shift + F)' : 'Fullscreen mode (Shift + F)'}
          className={`p-1.5 rounded transition-colors cursor-pointer ${
            isChartFullscreen
              ? 'text-[#2962ff] bg-[#2962ff]/15'
              : 'text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white'
          }`}
        >
          {isChartFullscreen ? (
            <Minimize className="w-4 h-4" />
          ) : (
            <Maximize className="w-4 h-4" />
          )}
        </button>

        {/* Chart Snapshot Button [ 📷 ] + CHART SNAPSHOT Dropdown */}
        <div className="relative" ref={snapshotRef}>
          <button
            type="button"
            onClick={() => setSnapshotMenuOpen((v) => !v)}
            title="Take a snapshot"
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              snapshotMenuOpen
                ? 'text-[#2962ff] bg-[#2962ff]/15'
                : 'text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white'
            }`}
          >
            <Camera className="w-4 h-4" />
          </button>
          {snapshotMenuOpen && (
            <SnapshotMenuDropdown onClose={() => setSnapshotMenuOpen(false)} />
          )}
        </div>

        <button
          onClick={toggleWatchlist}
          title={watchlistVisible ? 'Hide Right Panel' : 'Show Right Panel'}
          className={`p-1.5 rounded transition-colors ${
            watchlistVisible
              ? 'text-[#2962ff] bg-[#2962ff]/15'
              : 'text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]'
          }`}
        >
          <PanelRight className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
