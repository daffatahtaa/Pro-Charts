import React, { useEffect, useRef, useState, useCallback } from 'react';
import { init, dispose, Chart, ActionType, OverlayEvent } from 'klinecharts';
import { Scissors, Loader2, Settings, X, Crosshair, GripHorizontal, ChevronsRight } from 'lucide-react';
import { api } from '../services/api';
import { marketWs } from '../services/ws';
import { playAlertSound } from '../services/sound';
import {
  getHoveredOverlayId,
  setHoveredOverlayId,
  setOverlayActiveTimeframe,
  setOverlayFromPixelConverter,
  setOverlayPixelConverter,
  setOverlayShiftPressed,
  toHairlineSize,
} from '../overlays';
import { useChartStore } from '../store/useChartStore';
import {
  Candle,
  computeHeikinAshi,
  DrawingItem,
  getContrastTextColor,
  getTimeframeSeconds,
  SelectedOverlayInfo,
} from '../types/chart';
import { ChartLegend } from './ChartLegend';
import { DrawingFloatingBar } from './DrawingFloatingBar';
import { ReplayToolbar } from './ReplayToolbar';
import {
  ActivePositionEditor,
  InteractiveTradeLayer,
} from './InteractiveTradeLayer';
import {
  ChartContextMenu,
  ChartOrderTicketModal,
  ChartTableViewModal,
  ContextMenuState,
  CopiedClipboardState,
} from './ChartContextMenu';

interface YAxisMarkersState {
  lastY: number | null;
  lastPrice: number | null;
  lastColor: string;
  bidY: number | null;
  bidPrice: number | null;
  askY: number | null;
  askPrice: number | null;
}

interface YAxisPillItem {
  id: 'ask' | 'bid' | 'last';
  rawY: number;
  resolvedY: number;
  h: number;
  priceText: string;
  subText?: string;
  tagLabel?: string;
  bgColor: string;
  textColor: string;
  zIndex: number;
}

function formatPriceTag(val: number, digits: number): string {
  return val.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatCountdown(secondsLeft: number): string {
  const s = Math.max(0, Math.floor(secondsLeft));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  return `${pad(mins)}:${pad(secs)}`;
}

function isSystemOverlay(id: string, name: string): boolean {
  return (
    name === 'rulerMeasure' ||
    name === 'tradePositionLine' ||
    name === 'priceAlertLine' ||
    name === 'bidAskLine' ||
    id.startsWith('pos_line_') ||
    id.startsWith('pos_sl_') ||
    id.startsWith('pos_tp_') ||
    id.startsWith('ord_line_') ||
    id.startsWith('alert_line_') ||
    id.startsWith('sys_bid_') ||
    id.startsWith('sys_ask_') ||
    id.startsWith('sys_hl_') ||
    id === 'sys_locked_cursor'
  );
}

function getYAxisFreeMoveSnapshot(chart: Chart) {
  try {
    const yAxisComp = (chart as any)._candlePane?.getAxisComponent?.();
    if (!yAxisComp || typeof yAxisComp.getAutoCalcTickFlag !== 'function') return null;
    const isAuto = Boolean(yAxisComp.getAutoCalcTickFlag());
    if (isAuto) return { isFreeMove: false, range: null };
    const range =
      typeof yAxisComp.getRange === 'function' && yAxisComp.getRange()
        ? { ...yAxisComp.getRange() }
        : null;
    return { isFreeMove: true, range };
  } catch {
    return null;
  }
}

function restoreYAxisFreeMoveSnapshot(
  chart: Chart,
  snap: { isFreeMove: boolean; range: any } | null
) {
  if (!snap || !snap.isFreeMove || !snap.range) return;
  try {
    const yAxisComp = (chart as any)._candlePane?.getAxisComponent?.();
    if (!yAxisComp) return;
    yAxisComp.setRange(snap.range);
    yAxisComp.setAutoCalcTickFlag(false);
    (chart as any).adjustPaneViewport?.(false, true, true, true);
  } catch {}
}

function doesSegmentIntersectBox(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  left: number,
  top: number,
  right: number,
  bottom: number
): boolean {
  if (
    (x1 >= left && x1 <= right && y1 >= top && y1 <= bottom) ||
    (x2 >= left && x2 <= right && y2 >= top && y2 <= bottom)
  ) {
    return true;
  }
  if (Math.max(x1, x2) < left || Math.min(x1, x2) > right) return false;
  if (Math.max(y1, y2) < top || Math.min(y1, y2) > bottom) return false;

  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - left, right - x1, y1 - top, bottom - y1];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-6) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0 <= t1;
}

export const ChartContainer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const isFetchingMoreRef = useRef(false);
  const prevTickBidRef = useRef<number | null>(null);
  const mountedIndicatorsRef = useRef<
    Map<string, { name: string; paneId: string; visible: boolean }>
  >(new Map());
  const scissorHoverRef = useRef<{ x: number; dataIndex: number } | null>(null);
  const inProgressOverlayIdRef = useRef<string | null>(null);
  const syncYAxisRef = useRef<() => void>(() => {});
  const dragActiveRef = useRef<boolean>(false);
  const cancelDragRef = useRef<(() => void) | null>(null);
  const prevLogScaleRef = useRef<boolean>(useChartStore.getState().logScale);

  const [scissorHover, setScissorHover] = useState<{ x: number; dataIndex: number } | null>(null);
  const [countdown, setCountdown] = useState<string>('00:00');
  const [coordTick, setCoordTick] = useState<number>(0);
  const [axisDims, setAxisDims] = useState<{ yAxisWidth: number; xAxisHeight: number }>({
    yAxisWidth: 68,
    xAxisHeight: 28,
  });
  const [hoverCursor, setHoverCursor] = useState<{ y: number; price: number } | null>(null);
  const [isScrolledAway, setIsScrolledAway] = useState<boolean>(false);
  const [yMarkers, setYMarkers] = useState<YAxisMarkersState>({
    lastY: null,
    lastPrice: null,
    lastColor: '#089981',
    bidY: null,
    bidPrice: null,
    askY: null,
    askPrice: null,
  });

  // On-Chart Interactive Trade Selection & SL/TP/Entry Editor state
  const [selectedTradeKey, setSelectedTradeKey] = useState<string | null>(null);
  const [posEditor, setPosEditor] = useState<ActivePositionEditor | null>(null);
  const [entryDraft, setEntryDraft] = useState<string>('');
  const [slDraft, setSlDraft] = useState<string>('');
  const [tpDraft, setTpDraft] = useState<string>('');
  const [pickMode, setPickMode] = useState<'sl' | 'tp' | null>(null);

  // Right-Click TradingView Chart Context Menu, Locked Vertical Cursor & Modals
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [lockedCursorTs, setLockedCursorTs] = useState<number | null>(null);
  const [copiedClipboard, setCopiedClipboard] = useState<CopiedClipboardState>(null);
  const [orderDialogPrice, setOrderDialogPrice] = useState<number | null>(null);
  const [tableViewOpen, setTableViewOpen] = useState(false);

  // Ctrl + Drag Multi-Select Marquee Box & Group Move tracking
  const [marqueeBox, setMarqueeBox] = useState<{
    startX: number;
    startY: number;
    curX: number;
    curY: number;
  } | null>(null);
  const marqueeRef = useRef<{
    startX: number;
    startY: number;
    curX: number;
    curY: number;
  } | null>(null);
  const preMarqueeSelectionRef = useRef<{
    selectedOverlay: SelectedOverlayInfo | null;
    selectedOverlayIds: string[];
  }>({ selectedOverlay: null, selectedOverlayIds: [] });
  const marqueeJustFinishedRef = useRef<boolean>(false);
  const lastOverlaySelectedAtRef = useRef<number>(0);
  const plainMouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastKnownPointsRef = useRef<
    Record<string, Array<{ timestamp?: number; dataIndex?: number; value?: number }>>
  >({});
  const selectedOverlayIds = useChartStore((s) => s.selectedOverlayIds);
  const drawingsList = useChartStore((s) => s.drawingsList);
  const [isSubmittingPos, setIsSubmittingPos] = useState(false);
  const [posEditorPos, setPosEditorPos] = useState<{ x: number; y: number } | null>(null);
  const posEditorRef = useRef<HTMLDivElement>(null);

  const handlePosEditorDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.stopPropagation();
    e.preventDefault();
    const containerEl = containerRef.current;
    const panelEl = posEditorRef.current;
    if (!containerEl || !panelEl) return;

    const cRect = containerEl.getBoundingClientRect();
    const pRect = panelEl.getBoundingClientRect();
    const offsetX = e.clientX - pRect.left;
    const offsetY = e.clientY - pRect.top;

    const onMove = (ev: MouseEvent) => {
      const nextX = Math.max(
        8,
        Math.min(cRect.width - pRect.width - 8, ev.clientX - cRect.left - offsetX)
      );
      const nextY = Math.max(
        8,
        Math.min(cRect.height - pRect.height - 8, ev.clientY - cRect.top - offsetY)
      );
      setPosEditorPos({ x: nextX, y: nextY });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const {
    symbol,
    symbolReloadNonce,
    symbolInfo,
    timeframe,
    chartType,
    chartSettings,
    timezone,
    candles,
    liveTick,
    isLoadingCandles,
    activeTool,
    magnetMode,
    ctrlMagnetPressed,
    drawingsLocked,
    drawingsVisible,
    activeIndicators,
    logScale,
    replay,
    paperAccount,
    positions,
    orders,
    alerts,
    setCandles,
    prependCandles,
    setLoadingCandles,
    setSymbolInfo,
    syncResolvedSymbol,
    setLiveTick,
    setWsConnected,
    setTradeState,
    setCrosshairData,
    setActiveTool,
    setCtrlMagnetPressed,
    setSelectedOverlay,
    setDrawingsList,
    setChartSettingsModalOpen,
    pushUndoSnapshot,
    markAlertTriggered,
    showToast,
    cutReplayAtIndex,
    refreshTradeState,
    modifyPaperTrade,
    closePaperTrade,
    cancelPaperTrade,
    registerBridge,
  } = useChartStore();

  const openPositionEditor = useCallback(
    (editor: ActivePositionEditor, entry: number, sl: number, tp: number) => {
      const d = useChartStore.getState().symbolInfo.digits ?? 2;
      setSelectedTradeKey(editor.key);
      setPosEditor(editor);
      setEntryDraft(entry > 0 ? entry.toFixed(d) : '');
      setSlDraft(sl > 0 ? sl.toFixed(d) : '');
      setTpDraft(tp > 0 ? tp.toFixed(d) : '');
      setPickMode(null);
    },
    []
  );

  const cancelActiveDrawingTool = useCallback(() => {
    const chart = chartRef.current;
    if (chart && inProgressOverlayIdRef.current) {
      try {
        chart.removeOverlay({ id: inProgressOverlayIdRef.current });
      } catch {}
      inProgressOverlayIdRef.current = null;
    }
    const state = useChartStore.getState();
    if (state.activeTool) {
      state.setActiveTool(null);
    }
  }, []);

  const syncYAxisMarkers = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const state = useChartStore.getState();
    const list = chart.getDataList();
    const lastBar = list.length > 0 ? list[list.length - 1] : null;

    const toY = (val: number | null | undefined): number | null => {
      if (typeof val !== 'number' || !Number.isFinite(val)) return null;
      try {
        const res: any = chart.convertToPixel({ value: val }, { paneId: 'candle_pane' });
        const pt = Array.isArray(res) ? res[0] : res;
        if (pt && typeof pt.y === 'number' && Number.isFinite(pt.y)) {
          return pt.y;
        }
      } catch {}
      return null;
    };

    const lastPrice = lastBar ? lastBar.close : null;
    const lastColor = lastBar
      ? lastBar.close >= lastBar.open
        ? state.chartSettings.bullBodyColor
        : state.chartSettings.bearBodyColor
      : '#787b86';

    const showBA = state.chartSettings.showBidAskLines && !state.replay.isActive && !!state.liveTick;
    const bidPrice = showBA && state.liveTick ? state.liveTick.bid : null;
    const askPrice = showBA && state.liveTick ? state.liveTick.ask : null;

    setYMarkers({
      lastY: toY(lastPrice),
      lastPrice,
      lastColor,
      bidY: toY(bidPrice),
      bidPrice,
      askY: toY(askPrice),
      askPrice,
    });

    // Measure exact KLineCharts Y-Axis width & X-Axis height so Gear button, Y-Axis tags & trade lines align pixel-perfectly
    try {
      const yBox = chart.getSize('candle_pane', 'yAxis' as any);
      const xBox = chart.getSize('x_axis_pane');
      const nextW = yBox && yBox.width > 20 ? Math.round(yBox.width) : 68;
      const nextH = xBox && xBox.height > 14 ? Math.round(xBox.height) : 28;
      setAxisDims((prev) =>
        prev.yAxisWidth === nextW && prev.xAxisHeight === nextH
          ? prev
          : { yAxisWidth: nextW, xAxisHeight: nextH }
      );
    } catch {}

    setCoordTick((n) => (n + 1) % 1000000);

    // Track if user scrolled away from the latest bar
    if (list.length > 0) {
      const vr = chart.getVisibleRange();
      const away = Boolean(vr && vr.to < list.length - 5);
      setIsScrolledAway((prev) => (prev === away ? prev : away));
    }

    // Sync BottomStatusBar `auto` button with KLineCharts's live Y-Axis Free Move flag
    try {
      const yAxisComp = (chart as any)._candlePane?.getAxisComponent?.();
      if (yAxisComp && typeof yAxisComp.getAutoCalcTickFlag === 'function') {
        const liveAuto = Boolean(yAxisComp.getAutoCalcTickFlag());
        if (useChartStore.getState().autoScale !== liveAuto) {
          useChartStore.getState().setAutoScale(liveAuto);
        }
      }
    } catch {}

    // Sync visible-range High/Low horizontal lines if enabled
    chart.removeOverlay({ id: 'sys_hl_high' });
    chart.removeOverlay({ id: 'sys_hl_low' });
    if (state.chartSettings.showHighLowLines && list.length > 0) {
      const range = chart.getVisibleRange();
      const from = Math.max(0, range?.from ?? 0);
      const to = Math.min(list.length - 1, range?.to ?? list.length - 1);
      if (to >= from) {
        let hi = -Infinity;
        let lo = Infinity;
        for (let i = from; i <= to; i++) {
          if (list[i].high > hi) hi = list[i].high;
          if (list[i].low < lo) lo = list[i].low;
        }
        const digits = state.symbolInfo.digits ?? 2;
        if (Number.isFinite(hi)) {
          chart.createOverlay({
            id: 'sys_hl_high',
            name: 'bidAskLine',
            lock: true,
            points: [{ value: hi }],
            extendData: {
              color: state.chartSettings.highLowColor,
              label: `H ${hi.toFixed(digits)}`,
              dashed: true,
            },
          });
        }
        if (Number.isFinite(lo)) {
          chart.createOverlay({
            id: 'sys_hl_low',
            name: 'bidAskLine',
            lock: true,
            points: [{ value: lo }],
            extendData: {
              color: state.chartSettings.highLowColor,
              label: `L ${lo.toFixed(digits)}`,
              dashed: true,
            },
          });
        }
      }
    }
  }, []);

  syncYAxisRef.current = syncYAxisMarkers;

  const serializeOverlay = useCallback((overlay: any): DrawingItem | null => {
    if (!overlay || !overlay.id || !overlay.name) return null;
    const id = String(overlay.id);
    const name = String(overlay.name);
    if (isSystemOverlay(id, name)) return null;
    const state = useChartStore.getState();
    return {
      id,
      symbol: state.symbol,
      timeframe: state.timeframe,
      name,
      points: (overlay.points || []).map((p: any) => ({
        timestamp: p.timestamp,
        dataIndex: p.dataIndex,
        value: p.value,
      })),
      styles: overlay.styles || {},
      extendData: overlay.extendData ?? {},
      locked: Boolean(overlay.lock),
      visible: overlay.visible !== false,
    };
  }, []);

  const persistOverlay = useCallback(
    (overlay: any, recordUndo = false) => {
      const item = serializeOverlay(overlay);
      if (!item) return;
      const state = useChartStore.getState();
      if (recordUndo) {
        state.pushUndoSnapshot([...state.drawingsList]);
      }
      const nextList = [
        ...state.drawingsList.filter((d) => d.id !== item.id),
        item,
      ];
      lastKnownPointsRef.current[item.id] = (item.points || []).map((p) => ({ ...p }));
      state.setDrawingsList(nextList);
      api.saveDrawing(item).catch(() => {});
    },
    [serializeOverlay]
  );

  const buildOverlayEvents = useCallback(
    () => ({
      onDrawEnd: (event: OverlayEvent) => {
        inProgressOverlayIdRef.current = null;
        const state = useChartStore.getState();
        persistOverlay(event.overlay, true);

        const ov: any = event.overlay;
        if (ov && !isSystemOverlay(String(ov.id), String(ov.name))) {
          const lineStyleObj = ov?.styles?.line || {};
          const rawExt = ov.extendData;
          const label =
            typeof rawExt === 'string'
              ? rawExt
              : typeof rawExt === 'object' && rawExt
              ? String(rawExt.label || '')
              : '';
          const labelPosition =
            typeof rawExt === 'object' && rawExt && rawExt.labelPosition
              ? rawExt.labelPosition
              : 'top';
          state.setSelectedOverlay({
            id: String(ov.id),
            name: String(ov.name),
            color: lineStyleObj.color || '#2962ff',
            lineWidth: lineStyleObj.size || 1.5,
            lineStyle: lineStyleObj.style === 'dashed' ? 'dashed' : 'solid',
            locked: Boolean(ov.lock),
            label,
            labelPosition,
          });
        }

        if (state.keepDrawingMode && state.activeTool) {
          const toolName = state.activeTool;
          window.setTimeout(() => {
            const cur = useChartStore.getState();
            if (cur.keepDrawingMode && cur.activeTool === toolName && chartRef.current) {
              const effMagnet = cur.ctrlMagnetPressed ? 'strong_magnet' : cur.magnetMode;
              const newId = chartRef.current.createOverlay({
                name: toolName,
                mode: effMagnet as any,
                lock: cur.drawingsLocked,
                visible: cur.drawingsVisible,
                ...(toolName === 'iconStamp' ? { extendData: { iconGlyph: cur.activeIconGlyph } } : {}),
                ...buildOverlayEvents(),
              });
              inProgressOverlayIdRef.current = typeof newId === 'string' ? newId : null;
            }
          }, 15);
        } else {
          state.setActiveTool(null);
        }
        return false;
      },
      onPressedMoving: () => {
        setCoordTick((n) => (n + 1) % 1000000);
        return false;
      },
      onPressedMoveEnd: (event: OverlayEvent) => {
        const movedOv: any = event.overlay;
        const chart = chartRef.current;
        if (movedOv && chart && !isSystemOverlay(String(movedOv.id), String(movedOv.name))) {
          const movedId = String(movedOv.id);
          const prevPts = lastKnownPointsRef.current[movedId];
          const curPts = movedOv.points || [];
          const st = useChartStore.getState();
          const movedExt = (movedOv.extendData || {}) as Record<string, any>;
          const movedGroupId = movedExt.groupId as string | undefined;

          // Collect sibling IDs (either same group or multi-selection)
          const siblingSet = new Set<string>();
          if (movedGroupId) {
            st.drawingsList.forEach((d) => {
              if (d.id !== movedId && (d.extendData as any)?.groupId === movedGroupId) {
                siblingSet.add(d.id);
              }
            });
          }
          if (st.selectedOverlayIds.length > 1 && st.selectedOverlayIds.includes(movedId)) {
            st.selectedOverlayIds.forEach((id) => {
              if (id !== movedId) siblingSet.add(id);
            });
          }

          if (siblingSet.size > 0 && prevPts && prevPts[0] && curPts[0]) {
            const dVal =
              typeof curPts[0].value === 'number' && typeof prevPts[0].value === 'number'
                ? curPts[0].value - prevPts[0].value
                : 0;
            const dIdx =
              typeof curPts[0].dataIndex === 'number' && typeof prevPts[0].dataIndex === 'number'
                ? curPts[0].dataIndex - prevPts[0].dataIndex
                : 0;
            const dTs =
              typeof curPts[0].timestamp === 'number' && typeof prevPts[0].timestamp === 'number'
                ? curPts[0].timestamp - prevPts[0].timestamp
                : 0;

            if (dVal !== 0 || dIdx !== 0 || dTs !== 0) {
              for (const sibId of siblingSet) {
                const sibOv: any = chart.getOverlayById(sibId);
                if (!sibOv || sibOv.lock) continue;
                const shifted = (sibOv.points || []).map((p: any) => ({
                  ...(typeof p.timestamp === 'number' ? { timestamp: p.timestamp + dTs } : {}),
                  ...(typeof p.dataIndex === 'number' ? { dataIndex: p.dataIndex + dIdx } : {}),
                  ...(typeof p.value === 'number' ? { value: p.value + dVal } : {}),
                }));
                chart.overrideOverlay({ id: sibId, points: shifted });
                const updated = chart.getOverlayById(sibId);
                if (updated) persistOverlay(updated, false);
              }
            }
          }
        }
        persistOverlay(event.overlay, false);
        setCoordTick((n) => (n + 1) % 1000000);
        return false;
      },
      onMouseEnter: (event: OverlayEvent) => {
        const ov: any = event.overlay;
        if (!ov || isSystemOverlay(String(ov.id), String(ov.name))) return false;
        const id = String(ov.id);
        if (getHoveredOverlayId() !== id) {
          setHoveredOverlayId(id);
          if (ov.name === 'riskRewardLong' || ov.name === 'riskRewardShort') {
            chartRef.current?.overrideOverlay({ id });
          }
        }
        return false;
      },
      onMouseLeave: (event: OverlayEvent) => {
        const ov: any = event.overlay;
        if (!ov || isSystemOverlay(String(ov.id), String(ov.name))) return false;
        const id = String(ov.id);
        if (getHoveredOverlayId() === id) {
          setHoveredOverlayId(null);
          if (ov.name === 'riskRewardLong' || ov.name === 'riskRewardShort') {
            chartRef.current?.overrideOverlay({ id });
          }
        }
        return false;
      },
      onSelected: (event: OverlayEvent) => {
        const ov: any = event.overlay;
        if (!ov || isSystemOverlay(String(ov.id), String(ov.name))) return false;
        lastOverlaySelectedAtRef.current = Date.now();
        const lineStyleObj = ov?.styles?.line || {};
        const info: SelectedOverlayInfo = {
          id: String(ov.id),
          name: String(ov.name),
          color: lineStyleObj.color || '#2962ff',
          lineWidth: lineStyleObj.size || 1,
          lineStyle: lineStyleObj.style === 'dashed' ? 'dashed' : 'solid',
          locked: Boolean(ov.lock),
          label: String((ov.extendData as any)?.label || ''),
        };
        useChartStore.getState().setSelectedOverlay(info);
        if (ov.name === 'riskRewardLong' || ov.name === 'riskRewardShort') {
          chartRef.current?.overrideOverlay({ id: String(ov.id) });
        }
        return false;
      },
      onDeselected: (event: OverlayEvent) => {
        if (marqueeRef.current || marqueeJustFinishedRef.current) return false;
        useChartStore.getState().setSelectedOverlay(null);
        const ov: any = event?.overlay;
        if (ov && (ov.name === 'riskRewardLong' || ov.name === 'riskRewardShort')) {
          chartRef.current?.overrideOverlay({ id: String(ov.id) });
        }
        return false;
      },
      onDoubleClick: (event: OverlayEvent) => {
        const ov: any = event.overlay;
        if (!ov || isSystemOverlay(String(ov.id), String(ov.name))) return false;
        useChartStore.getState().setDrawingSettingsOverlayId(String(ov.id));
        return true;
      },
    }),
    [persistOverlay]
  );

  const transformForChartType = useCallback(
    (raw: Candle[]): Candle[] => {
      const state = useChartStore.getState();
      if (state.chartType === 'heikin_ashi') {
        return computeHeikinAshi(raw, state.symbolInfo.digits ?? 2);
      }
      return raw;
    },
    []
  );

  // 1. Initialize KLineCharts instance once
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = init(el);
    if (!chart) return;
    chartRef.current = chart;

    setOverlayPixelConverter((pts) => {
      const res: any = chart.convertToPixel(pts, { paneId: 'candle_pane' });
      return Array.isArray(res) ? res : res ? [res] : [];
    });
    setOverlayFromPixelConverter((pts) => {
      const res: any = chart.convertFromPixel(pts, { paneId: 'candle_pane' });
      return Array.isArray(res) ? res : res ? [res] : [];
    });

    // Crosshair subscription -> Legend + Replay Scissor Hover
    chart.subscribeAction(ActionType.OnCrosshairChange, (data: any) => {
      const state = useChartStore.getState();
      if (data && data.kLineData) {
        const idx = typeof data.dataIndex === 'number' ? data.dataIndex : -1;
        const list = chart.getDataList();
        const prev = idx > 0 ? list[idx - 1] : null;
        state.setCrosshairData({
          candle: data.kLineData as Candle,
          prevClose: prev ? prev.close : data.kLineData.open,
          dataIndex: idx,
          x: data.x ?? 0,
          y: data.y ?? 0,
        });
        if (state.replay.isActive && state.replay.isSelectingCut && typeof data.x === 'number') {
          const hover = { x: data.x, dataIndex: idx };
          scissorHoverRef.current = hover;
          setScissorHover(hover);
        }
      } else {
        state.setCrosshairData(null);
      }
    });

    // Shared Deep History Fetch Helper
    const fetchMoreHistory = (beforeTs: number, count = 5000) => {
      const state = useChartStore.getState();
      if (!beforeTs || state.replay.isActive || isFetchingMoreRef.current) return;
      isFetchingMoreRef.current = true;
      api
        .getCandles(state.symbol, state.timeframe, count, beforeTs)
        .then((res) => {
          const snap = getYAxisFreeMoveSnapshot(chart);
          const transformed =
            useChartStore.getState().chartType === 'heikin_ashi'
              ? computeHeikinAshi(res.candles, res.digits)
              : res.candles;
          chart.applyMoreData(transformed, res.has_more);
          if (snap?.isFreeMove) {
            restoreYAxisFreeMoveSnapshot(chart, snap);
          }
          state.prependCandles(res.candles, res.has_more);
        })
        .catch(() => {
          chart.applyMoreData([], false);
        })
        .finally(() => {
          isFetchingMoreRef.current = false;
        });
    };

    // Lazy load past candles on scroll left (disabled during Replay)
    chart.loadMore((timestamp: number | null) => {
      if (timestamp) fetchMoreHistory(timestamp, 5000);
    });

    // Proactive Deep Left-Scroll Trigger when approaching leftmost 30 bars
    const checkNearLeftEdge = () => {
      const state = useChartStore.getState();
      if (state.replay.isActive || isFetchingMoreRef.current || !state.hasMoreHistory) return;
      const range = chart.getVisibleRange();
      const list = chart.getDataList();
      if (range && range.from <= 30 && list.length > 0 && list[0]?.timestamp) {
        fetchMoreHistory(list[0].timestamp, 5000);
      }
    };
    chart.subscribeAction(ActionType.OnScroll, () => {
      checkNearLeftEdge();
      syncYAxisRef.current();
    });
    chart.subscribeAction(ActionType.OnZoom, () => {
      checkNearLeftEdge();
      syncYAxisRef.current();
    });

    // Register imperative bridge methods
    registerBridge({
      applyReplaySlice: (sliced) => {
        chart.applyNewData(transformForChartType(sliced), false);
      },
      updateReplayCandle: (candle) => {
        const state = useChartStore.getState();
        if (state.chartType === 'heikin_ashi') {
          const list = chart.getDataList();
          const prevHa = list[list.length - 1];
          const haClose = (candle.open + candle.high + candle.low + candle.close) / 4;
          const haOpen = prevHa ? (prevHa.open + prevHa.close) / 2 : (candle.open + candle.close) / 2;
          const d = state.symbolInfo.digits ?? 2;
          chart.updateData({
            ...candle,
            open: Number(haOpen.toFixed(d)),
            high: Number(Math.max(candle.high, haOpen, haClose).toFixed(d)),
            low: Number(Math.min(candle.low, haOpen, haClose).toFixed(d)),
            close: Number(haClose.toFixed(d)),
          });
        } else {
          chart.updateData(candle);
        }
      },
      restoreAllCandles: (all) => {
        chart.applyNewData(transformForChartType(all), true);
      },
      captureChartBaseImage: () => {
        try {
          const bg = useChartStore.getState().chartSettings.canvasBgColor || '#131722';
          return chart.getConvertPictureUrl(true, 'png', bg);
        } catch {
          return null;
        }
      },
      setVisibleRangeBars: (bars) => {
        const width = el.clientWidth || 1000;
        const space = Math.max(2, Math.min(30, (width - 80) / bars));
        chart.setBarSpace(space);
        chart.scrollToRealTime();
      },
      resetChartScale: () => {
        try {
          const yAxisComp = (chart as any)._candlePane?.getAxisComponent?.();
          yAxisComp?.setAutoCalcTickFlag?.(true);
          (chart as any).adjustPaneViewport?.(false, true, true, true);
          useChartStore.getState().setAutoScale(true);
        } catch {}
        chart.setBarSpace(8);
        chart.scrollToRealTime();
      },
      setYAxisAutoScale: (auto: boolean) => {
        try {
          const yAxisComp = (chart as any)._candlePane?.getAxisComponent?.();
          if (!yAxisComp) return;
          yAxisComp.setAutoCalcTickFlag(auto);
          (chart as any).adjustPaneViewport?.(false, true, true, true);
          useChartStore.getState().setAutoScale(auto);
          syncYAxisRef.current();
        } catch {}
      },
      updateSelectedOverlayStyle: (patch) => {
        const sel = useChartStore.getState().selectedOverlay;
        if (!sel) return;
        const next: SelectedOverlayInfo = { ...sel, ...patch };
        const styleOverride: any = {
          line: {
            color: next.color,
            size: next.lineWidth,
            style: next.lineStyle,
            dashedValue: [4, 4],
          },
          polygon: {
            color: `${next.color}2e`,
            borderColor: next.color,
            borderSize: next.lineWidth,
          },
          rect: {
            color: `${next.color}2e`,
            borderColor: next.color,
            borderSize: next.lineWidth,
          },
        };
        chart.overrideOverlay({
          id: sel.id,
          lock: next.locked,
          styles: styleOverride,
        });
        useChartStore.getState().setSelectedOverlay(next);
        const ov = chart.getOverlayById(sel.id);
        if (ov) persistOverlay(ov, false);
      },
      updateSelectedOverlayLabel: (label, labelPosition) => {
        const sel = useChartStore.getState().selectedOverlay;
        if (!sel) return;
        const ov = chart.getOverlayById(sel.id);
        const prevExt = (ov?.extendData as Record<string, any>) || {};
        const nextPos = labelPosition ?? prevExt.labelPosition ?? 'top';
        chart.overrideOverlay({
          id: sel.id,
          extendData: { ...prevExt, label, labelPosition: nextPos },
        });
        useChartStore.getState().setSelectedOverlay({ ...sel, label, labelPosition: nextPos });
        const updatedOv = chart.getOverlayById(sel.id);
        if (updatedOv) persistOverlay(updatedOv, false);
      },
      updateOverlayConfig: (id, patch, persist = false) => {
        const overridePayload: any = { id };
        if (patch.points) overridePayload.points = patch.points;
        if (patch.styles) overridePayload.styles = patch.styles;
        if (patch.extendData !== undefined) overridePayload.extendData = patch.extendData;
        if (patch.lock !== undefined) overridePayload.lock = patch.lock;
        if (patch.visible !== undefined) overridePayload.visible = patch.visible;
        chart.overrideOverlay(overridePayload);
        const updatedOv: any = chart.getOverlayById(id);
        if (updatedOv) {
          const sel = useChartStore.getState().selectedOverlay;
          if (sel && sel.id === id) {
            const lineStyleObj = updatedOv?.styles?.line || {};
            useChartStore.getState().setSelectedOverlay({
              ...sel,
              color: lineStyleObj.color || sel.color,
              lineWidth: lineStyleObj.size || sel.lineWidth,
              lineStyle: lineStyleObj.style === 'dashed' ? 'dashed' : 'solid',
              locked: Boolean(updatedOv.lock),
              label: String((updatedOv.extendData as any)?.label || ''),
              labelPosition: (updatedOv.extendData as any)?.labelPosition || sel.labelPosition,
            });
          }
          if (persist) {
            persistOverlay(updatedOv, false);
          }
        }
      },
      deleteSelectedOverlay: () => {
        const state = useChartStore.getState();
        const sel = state.selectedOverlay;
        if (!sel) return;
        state.pushUndoSnapshot([...state.drawingsList]);
        chart.removeOverlay({ id: sel.id });
        api.deleteDrawing(sel.id).catch(() => {});
        state.setDrawingsList(state.drawingsList.filter((d) => d.id !== sel.id));
        state.setSelectedOverlay(null);
      },
      clearAllOverlays: () => {
        const state = useChartStore.getState();
        if (state.drawingsList.length > 0) {
          state.pushUndoSnapshot([...state.drawingsList]);
        }
        for (const d of state.drawingsList) {
          chart.removeOverlay({ id: d.id });
        }
        api.deleteDrawingsForSymbol(state.symbol).catch(() => {});
        state.setDrawingsList([]);
        state.setSelectedOverlay(null);
      },
      getOverlayPoints: (id: string) => {
        const ov = chart.getOverlayById(id);
        return (ov?.points || []).map((p: any) => ({
          timestamp: p.timestamp,
          dataIndex: p.dataIndex,
          value: p.value,
        }));
      },
      getOverlayExtendData: (id: string) => {
        const ov = chart.getOverlayById(id);
        return (ov?.extendData as Record<string, any>) || {};
      },
      restoreDrawingsSnapshot: (items: DrawingItem[]) => {
        const state = useChartStore.getState();
        // Remove all user drawings
        for (const d of state.drawingsList) {
          chart.removeOverlay({ id: d.id });
        }
        api.deleteDrawingsForSymbol(state.symbol).then(() => {
          const events = buildOverlayEvents();
          for (const d of items) {
            try {
              chart.createOverlay({
                id: d.id,
                name: d.name,
                points: d.points,
                styles: d.styles,
                extendData: d.extendData,
                lock: d.locked,
                visible: d.visible,
                ...events,
              });
              api.saveDrawing(d).catch(() => {});
            } catch {}
          }
        });
      },
      toggleSingleOverlayLock: (id: string) => {
        const state = useChartStore.getState();
        const target = state.drawingsList.find((d) => d.id === id);
        if (!target) return;
        const nextLocked = !target.locked;
        chart.overrideOverlay({ id, lock: nextLocked });
        const ov = chart.getOverlayById(id);
        if (ov) persistOverlay(ov, false);
      },
      toggleSingleOverlayVisible: (id: string) => {
        const state = useChartStore.getState();
        const target = state.drawingsList.find((d) => d.id === id);
        if (!target) return;
        const nextVis = !target.visible;
        chart.overrideOverlay({ id, visible: nextVis });
        const ov = chart.getOverlayById(id);
        if (ov) persistOverlay(ov, false);
      },
      deleteSingleOverlay: (id: string) => {
        const state = useChartStore.getState();
        state.pushUndoSnapshot([...state.drawingsList]);
        chart.removeOverlay({ id });
        api.deleteDrawing(id).catch(() => {});
        state.setDrawingsList(state.drawingsList.filter((d) => d.id !== id));
        if (state.selectedOverlay?.id === id) state.setSelectedOverlay(null);
      },
      deleteMultipleOverlays: (ids: string[]) => {
        if (!ids || ids.length === 0) return;
        const state = useChartStore.getState();
        state.pushUndoSnapshot([...state.drawingsList]);
        const idSet = new Set(ids);
        for (const id of ids) {
          chart.removeOverlay({ id });
          api.deleteDrawing(id).catch(() => {});
        }
        state.setDrawingsList(state.drawingsList.filter((d) => !idSet.has(d.id)));
        state.setSelectedOverlay(null);
        state.setSelectedOverlayIds([]);
        state.showToast('info', `Deleted ${ids.length} ${ids.length === 1 ? 'drawing' : 'drawings'}`);
      },
      updateMultipleOverlaysStyle: (ids, patch) => {
        if (!ids || ids.length === 0) return;
        const state = useChartStore.getState();
        state.pushUndoSnapshot([...state.drawingsList]);
        for (const id of ids) {
          const ov: any = chart.getOverlayById(id);
          if (!ov) continue;
          const prevLine = ov?.styles?.line || {};
          const nextColor = patch.color ?? prevLine.color ?? '#2962ff';
          const nextSize = patch.lineWidth ?? prevLine.size ?? 1;
          const nextStyle = patch.lineStyle ?? (prevLine.style === 'dashed' ? 'dashed' : 'solid');
          const overrideObj: any = { id };
          if (patch.color !== undefined || patch.lineWidth !== undefined || patch.lineStyle !== undefined) {
            overrideObj.styles = {
              line: { color: nextColor, size: nextSize, style: nextStyle, dashedValue: [4, 4] },
              polygon: { color: `${nextColor}2e`, borderColor: nextColor, borderSize: nextSize },
              rect: { color: `${nextColor}2e`, borderColor: nextColor, borderSize: nextSize },
            };
          }
          if (patch.locked !== undefined) overrideObj.lock = patch.locked;
          if (patch.visible !== undefined) overrideObj.visible = patch.visible;
          chart.overrideOverlay(overrideObj);
          const updated = chart.getOverlayById(id);
          if (updated) persistOverlay(updated, false);
        }
      },
      groupOverlays: (ids: string[], customName?: string) => {
        if (!ids || ids.length < 2) return;
        const state = useChartStore.getState();
        const existingGroups = new Set<string>();
        state.drawingsList.forEach((d) => {
          const gid = (d.extendData as any)?.groupId;
          if (gid) existingGroups.add(gid);
        });
        const groupId = `grp_${Date.now()}`;
        const groupName = customName?.trim() || `Group ${existingGroups.size + 1}`;
        for (const id of ids) {
          const ov: any = chart.getOverlayById(id);
          if (!ov) continue;
          const prevExt =
            ov.extendData && typeof ov.extendData === 'object' ? ov.extendData : {};
          chart.overrideOverlay({
            id,
            extendData: { ...prevExt, groupId, groupName },
          });
          const updated = chart.getOverlayById(id);
          if (updated) persistOverlay(updated, false);
        }
        state.showToast('success', `Grouped ${ids.length} drawings into "${groupName}"`);
      },
      ungroupOverlays: (ids: string[]) => {
        if (!ids || ids.length === 0) return;
        const state = useChartStore.getState();
        for (const id of ids) {
          const ov: any = chart.getOverlayById(id);
          if (!ov) continue;
          const prevExt =
            ov.extendData && typeof ov.extendData === 'object' ? { ...ov.extendData } : {};
          delete prevExt.groupId;
          delete prevExt.groupName;
          chart.overrideOverlay({ id, extendData: prevExt });
          const updated = chart.getOverlayById(id);
          if (updated) persistOverlay(updated, false);
        }
        state.showToast('info', 'Ungrouped drawings');
      },
      renameOverlayGroup: (groupId: string, newName: string) => {
        const trimmed = newName.trim();
        if (!groupId || !trimmed) return;
        const state = useChartStore.getState();
        const members = state.drawingsList.filter(
          (d) => (d.extendData as any)?.groupId === groupId
        );
        for (const m of members) {
          const ov: any = chart.getOverlayById(m.id);
          if (!ov) continue;
          const prevExt =
            ov.extendData && typeof ov.extendData === 'object' ? ov.extendData : {};
          chart.overrideOverlay({
            id: m.id,
            extendData: { ...prevExt, groupId, groupName: trimmed },
          });
          const updated = chart.getOverlayById(m.id);
          if (updated) persistOverlay(updated, false);
        }
      },
      selectOverlayById: (id: string) => {
        const ov: any = chart.getOverlayById(id);
        if (!ov) return;
        const lineStyleObj = ov?.styles?.line || {};
        useChartStore.getState().setSelectedOverlay({
          id: String(ov.id),
          name: String(ov.name),
          color: lineStyleObj.color || '#2962ff',
          lineWidth: lineStyleObj.size || 1,
          lineStyle: lineStyleObj.style === 'dashed' ? 'dashed' : 'solid',
          locked: Boolean(ov.lock),
          label: String((ov.extendData as any)?.label || ''),
        });
      },
      loadMoreDeepHistory: (bars = 5000) => {
        const list = chart.getDataList();
        if (list.length > 0 && list[0]?.timestamp) {
          fetchMoreHistory(list[0].timestamp, bars);
          useChartStore.getState().showToast('info', `Loading ${bars.toLocaleString()} deeper historical bars...`);
        }
      },
      jumpToDate: (dateStr: string) => {
        const targetMs = Date.parse(`${dateStr}T23:59:59Z`);
        if (Number.isNaN(targetMs)) return;
        const state = useChartStore.getState();
        api
          .getCandles(state.symbol, state.timeframe, 3000, targetMs)
          .then((res) => {
            if (res.candles.length === 0) {
              state.showToast('error', `No historical bars available before ${dateStr}`);
              return;
            }
            const transformed =
              useChartStore.getState().chartType === 'heikin_ashi'
                ? computeHeikinAshi(res.candles, res.digits)
                : res.candles;
            chart.applyNewData(transformed, res.has_more);
            state.setCandles(res.candles, res.has_more);
            state.showToast('success', `Jumped to ${dateStr} (${res.candles.length} bars loaded)`);
          })
          .catch(() => {});
      },
      zoomInChart: () => {
        try {
          const curSpace = chart.getBarSpace();
          chart.setBarSpace(Math.min(50, Math.max(2, curSpace * 1.25)));
        } catch {}
      },
    });

    const ro = new ResizeObserver(() => {
      chart.resize();
      syncYAxisRef.current();
    });
    ro.observe(el);

    return () => {
      setOverlayPixelConverter(null);
      setOverlayFromPixelConverter(null);
      setOverlayShiftPressed(false);
      ro.disconnect();
      mountedIndicatorsRef.current.clear();
      dispose(el);
      chartRef.current = null;
    };
  }, [buildOverlayEvents, persistOverlay, registerBridge, transformForChartType]);

  // 2. Apply Chart Settings + Chart Type + Log Scale + Timezone
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const logScaleChanged = prevLogScaleRef.current !== logScale;
    prevLogScaleRef.current = logScale;
    const freeMoveSnap = !logScaleChanged ? getYAxisFreeMoveSnapshot(chart) : null;

    const mappedCandleType =
      chartType === 'heikin_ashi'
        ? 'candle_solid'
        : chartType === 'line' || chartType === 'baseline'
        ? 'area'
        : chartType;

    const curCandles = useChartStore.getState().candles;
    const lastClose = curCandles.length > 0 ? curCandles[curCandles.length - 1].close : 0;
    const firstOpen = curCandles.length > 0 ? curCandles[0].open : 0;
    const baselineColor = lastClose >= firstOpen ? chartSettings.bullBodyColor : chartSettings.bearBodyColor;
    const hairline = toHairlineSize(1);

    chart.setStyles({
      grid: {
        show: chartSettings.showGridHoriz || chartSettings.showGridVert,
        horizontal: {
          show: chartSettings.showGridHoriz,
          size: hairline,
          color: chartSettings.gridHorizColor,
          style: 'solid' as any,
        },
        vertical: {
          show: chartSettings.showGridVert,
          size: hairline,
          color: chartSettings.gridVertColor,
          style: 'solid' as any,
        },
      },
      candle: {
        type: mappedCandleType as any,
        bar: {
          upColor: chartSettings.bullBodyColor,
          downColor: chartSettings.bearBodyColor,
          noChangeColor: '#787b86',
          upBorderColor: chartSettings.showBorders ? chartSettings.bullBorderColor : 'transparent',
          downBorderColor: chartSettings.showBorders ? chartSettings.bearBorderColor : 'transparent',
          noChangeBorderColor: '#787b86',
          upWickColor: chartSettings.showWicks ? chartSettings.bullWickColor : 'transparent',
          downWickColor: chartSettings.showWicks ? chartSettings.bearWickColor : 'transparent',
          noChangeWickColor: '#787b86',
        },
        area: {
          lineSize: 2,
          lineColor: chartType === 'baseline' ? baselineColor : '#2962ff',
          backgroundColor:
            chartType === 'line'
              ? [
                  { offset: 0, color: 'transparent' },
                  { offset: 1, color: 'transparent' },
                ]
              : chartType === 'baseline'
              ? [
                  { offset: 0, color: `${baselineColor}33` },
                  { offset: 1, color: `${baselineColor}05` },
                ]
              : [
                  { offset: 0, color: 'rgba(41, 98, 255, 0.28)' },
                  { offset: 1, color: 'rgba(41, 98, 255, 0.02)' },
                ],
        },
        priceMark: {
          show: true,
          high: {
            show: chartSettings.showHighLowMarks,
            color: chartSettings.highLowColor,
            textSize: 10,
          },
          low: {
            show: chartSettings.showHighLowMarks,
            color: chartSettings.highLowColor,
            textSize: 10,
          },
          last: {
            show: chartSettings.showLastPriceLine,
            upColor: chartSettings.bullBodyColor,
            downColor: chartSettings.bearBodyColor,
            noChangeColor: '#787b86',
            line: {
              show: chartSettings.showLastPriceLine,
              style: 'dashed' as any,
              dashedValue: [4, 4],
              size: hairline,
            },
            text: {
              show: false,
            },
          },
        },
        tooltip: { showRule: 'none' as any },
      },
      xAxis: {
        axisLine: { show: true, color: '#2a2e39', size: 1 },
        tickText: { color: '#787b86', size: 11, family: 'Trebuchet MS, sans-serif' },
        tickLine: { show: true, size: 1, length: 3, color: '#2a2e39' },
      },
      yAxis: {
        type: (logScale ? 'log' : 'normal') as any,
        axisLine: { show: true, color: '#2a2e39', size: 1 },
        tickText: { color: '#787b86', size: 11, family: 'JetBrains Mono, monospace' },
        tickLine: { show: true, size: 1, length: 3, color: '#2a2e39' },
      },
      crosshair: {
        show: true,
        horizontal: {
          show: true,
          line: {
            show: true,
            style: 'dashed' as any,
            dashedValue: [4, 4],
            size: hairline,
            color: chartSettings.crosshairColor,
          },
          text: {
            show: true,
            color: '#ffffff',
            size: 11,
            backgroundColor: '#2962ff',
            borderColor: '#2962ff',
          },
        },
        vertical: {
          show: true,
          line: {
            show: true,
            style: 'dashed' as any,
            dashedValue: [4, 4],
            size: hairline,
            color: chartSettings.crosshairColor,
          },
          text: {
            show: true,
            color: '#ffffff',
            size: 11,
            backgroundColor: '#2962ff',
            borderColor: '#2962ff',
          },
        },
      },
      separator: {
        size: 1,
        color: '#2a2e39',
        fill: true,
        activeBackgroundColor: 'rgba(41, 98, 255, 0.25)',
      },
      overlay: {
        line: { color: '#2962ff', size: hairline },
        rect: { color: 'rgba(41, 98, 255, 0.18)', borderColor: '#2962ff', borderSize: hairline },
        polygon: { color: 'rgba(41, 98, 255, 0.18)', borderColor: '#2962ff', borderSize: hairline },
        point: {
          color: '#131722',
          borderColor: '#2962ff',
          borderSize: 2,
          radius: 5,
          activeColor: '#ffffff',
          activeBorderColor: '#2962ff',
          activeBorderSize: 2,
          activeRadius: 6,
        },
        text: {
          color: '#d1d4dc',
          size: 11,
          family: 'Trebuchet MS, sans-serif',
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          borderSize: 0,
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
        },
      },
    } as any);

    if (freeMoveSnap?.isFreeMove) {
      restoreYAxisFreeMoveSnapshot(chart, freeMoveSnap);
    }

    try {
      chart.setTimezone(timezone);
    } catch {}
  }, [chartSettings, chartType, logScale, timezone]);

  // Re-apply data when toggling Heikin Ashi on/off
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || candles.length === 0) return;
    chart.applyNewData(transformForChartType(candles), useChartStore.getState().hasMoreHistory);
  }, [chartType, transformForChartType]);

  // 3. Load candles when symbol, timeframe, or symbolReloadNonce changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    // During active Bar Replay, timeframe switches are handled lookahead-free by reloadReplayForTimeframe
    if (useChartStore.getState().replay.isActive) return;
    let cancelled = false;
    prevTickBidRef.current = null;

    setLoadingCandles(true);
    api
      .getCandles(symbol, timeframe, 1500)
      .then((res) => {
        if (cancelled) return;
        if (res.symbol && res.symbol !== symbol) {
          syncResolvedSymbol(res.symbol);
        }
        setSymbolInfo({
          symbol: res.symbol,
          description: useChartStore.getState().symbolInfo.description,
          digits: res.digits,
          point: res.point,
          category: useChartStore.getState().symbolInfo.category,
        });
        chart.setPriceVolumePrecision(res.digits, 0);
        const displayCandles =
          useChartStore.getState().chartType === 'heikin_ashi'
            ? computeHeikinAshi(res.candles, res.digits)
            : res.candles;
        chart.applyNewData(displayCandles, res.has_more);
        setCandles(res.candles, res.has_more);
        marketWs.subscribe(res.symbol || symbol, timeframe);
        window.requestAnimationFrame(() => syncYAxisRef.current());
      })
      .catch((err) => {
        console.error('Failed to load candles:', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingCandles(false);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe, symbolReloadNonce, setCandles, setLoadingCandles, setSymbolInfo, syncResolvedSymbol]);

  // 4. Load saved drawings when symbol changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    let cancelled = false;

    chart.removeOverlay();
    setSelectedOverlay(null);

    api
      .getDrawings(symbol)
      .then((drawings) => {
        if (cancelled) return;
        setDrawingsList(drawings);
        const events = buildOverlayEvents();
        for (const d of drawings) {
          try {
            chart.createOverlay({
              id: d.id,
              name: d.name,
              points: d.points,
              styles: d.styles,
              extendData: d.extendData,
              lock: d.locked,
              visible: d.visible,
              ...events,
            });
          } catch {}
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [symbol, buildOverlayEvents, setDrawingsList, setSelectedOverlay]);

  // 5. WebSocket tick, trade state & real-time Price Alerts checker
  useEffect(() => {
    const offStatus = marketWs.onStatus((connected) => setWsConnected(connected));
    const offTrade = marketWs.onTradeState((payload) => setTradeState(payload));
    const offTick = marketWs.onTick((tick) => {
      const state = useChartStore.getState();

      // Check Price Alerts on live tick
      if (tick.symbol === state.symbol && typeof tick.bid === 'number') {
        const prevBid = prevTickBidRef.current;
        const curBid = tick.bid;
        prevTickBidRef.current = curBid;

        if (prevBid !== null && !state.replay.isActive) {
          for (const alert of state.alerts) {
            if (!alert.active || alert.triggered || alert.symbol !== tick.symbol) continue;
            const crossedUp = prevBid < alert.price && curBid >= alert.price;
            const crossedDown = prevBid > alert.price && curBid <= alert.price;
            const hit =
              (alert.condition === 'CROSSING' && (crossedUp || crossedDown)) ||
              (alert.condition === 'CROSSING_UP' && crossedUp) ||
              (alert.condition === 'CROSSING_DOWN' && crossedDown);

            if (hit) {
              playAlertSound();
              markAlertTriggered(alert.id);
              showToast(
                'info',
                `🔔 ALERT ${alert.symbol} @ ${alert.price}${alert.note ? ` — ${alert.note}` : ''}`
              );
            }
          }
        }
      }

      if (state.replay.isActive) return;
      if (tick.symbol !== state.symbol || tick.tf !== state.timeframe) return;

      setLiveTick(tick);
      if (tick.candle && chartRef.current) {
        if (state.chartType === 'heikin_ashi') {
          const list = chartRef.current.getDataList();
          const lastIdx = list.length - 1;
          const prevHa =
            lastIdx >= 1 && list[lastIdx]?.timestamp === tick.candle.timestamp
              ? list[lastIdx - 1]
              : list[lastIdx];
          const haClose =
            (tick.candle.open + tick.candle.high + tick.candle.low + tick.candle.close) / 4;
          const haOpen = prevHa
            ? (prevHa.open + prevHa.close) / 2
            : (tick.candle.open + tick.candle.close) / 2;
          const d = state.symbolInfo.digits ?? 2;
          chartRef.current.updateData({
            ...tick.candle,
            open: Number(haOpen.toFixed(d)),
            high: Number(Math.max(tick.candle.high, haOpen, haClose).toFixed(d)),
            low: Number(Math.min(tick.candle.low, haOpen, haClose).toFixed(d)),
            close: Number(haClose.toFixed(d)),
          });
        } else {
          chartRef.current.updateData(tick.candle);
        }
        syncYAxisRef.current();
      }
    });
    return () => {
      offStatus();
      offTrade();
      offTick();
    };
  }, [markAlertTriggered, setLiveTick, setTradeState, setWsConnected, showToast]);

  // 6. Visualize Bid/Ask Lines on Canvas (Positions, Pending Orders & Draggable Price Alerts are rendered by InteractiveTradeLayer)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    chart.removeOverlay({ name: 'tradePositionLine' });
    chart.removeOverlay({ name: 'priceAlertLine' });
    chart.removeOverlay({ id: 'sys_bid_line' });
    chart.removeOverlay({ id: 'sys_ask_line' });

    const d = symbolInfo.digits ?? 2;

    // Bid / Ask horizontal lines
    if (chartSettings.showBidAskLines && !replay.isActive && liveTick) {
      if (typeof liveTick.bid === 'number' && liveTick.bid > 0) {
        chart.createOverlay({
          id: 'sys_bid_line',
          name: 'bidAskLine',
          lock: true,
          points: [{ value: liveTick.bid }],
          extendData: {
            color: chartSettings.bidLineColor,
            label: `BID ${liveTick.bid.toFixed(d)}`,
            dashed: true,
          },
        });
      }
      if (typeof liveTick.ask === 'number' && liveTick.ask > 0) {
        chart.createOverlay({
          id: 'sys_ask_line',
          name: 'bidAskLine',
          lock: true,
          points: [{ value: liveTick.ask }],
          extendData: {
            color: chartSettings.askLineColor,
            label: `ASK ${liveTick.ask.toFixed(d)}`,
            dashed: true,
          },
        });
      }
    }
  }, [
    symbol,
    symbolInfo.digits,
    liveTick,
    replay.isActive,
    chartSettings.showBidAskLines,
    chartSettings.bidLineColor,
    chartSettings.askLineColor,
  ]);

  // Keep dynamic Y-Axis tags synced on settings / replay / candle changes
  useEffect(() => {
    window.requestAnimationFrame(() => syncYAxisRef.current());
  }, [candles.length, liveTick, chartSettings, replay.isActive, replay.cutIndex]);

  // 7. Activate Drawing Tool when selected (ONLY depends on activeTool so toggling Ctrl/Magnet mid-draw NEVER spawns duplicates!)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (inProgressOverlayIdRef.current) {
      try {
        chart.removeOverlay({ id: inProgressOverlayIdRef.current });
      } catch {}
      inProgressOverlayIdRef.current = null;
    }
    if (!activeTool) return;

    const cur = useChartStore.getState();
    const events = buildOverlayEvents();
    const effectiveMagnet = cur.ctrlMagnetPressed ? 'strong_magnet' : cur.magnetMode;
    const createdId = chart.createOverlay({
      name: activeTool,
      mode: effectiveMagnet as any,
      lock: cur.drawingsLocked,
      visible: cur.drawingsVisible,
      ...(activeTool === 'iconStamp' ? { extendData: { iconGlyph: cur.activeIconGlyph } } : {}),
      ...events,
    });
    inProgressOverlayIdRef.current = typeof createdId === 'string' ? createdId : null;
  }, [activeTool, buildOverlayEvents]);

  // 8. Sync global drawings lock / visibility / magnet (with Ctrl temporary strong magnet)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const effectiveMagnet = ctrlMagnetPressed ? 'strong_magnet' : magnetMode;
    chart.overrideOverlay({
      lock: drawingsLocked,
      visible: drawingsVisible,
      mode: effectiveMagnet as any,
    });
  }, [drawingsLocked, drawingsVisible, magnetMode, ctrlMagnetPressed]);

  // 9. Sync Active Indicators
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const mounted = mountedIndicatorsRef.current;
    const activeMap = new Map(activeIndicators.map((i) => [i.id, i]));

    for (const [id, info] of mounted.entries()) {
      const target = activeMap.get(id);
      if (!target || !target.visible) {
        chart.removeIndicator(info.paneId, info.name);
        mounted.delete(id);
      }
    }

    for (const ind of activeIndicators) {
      if (!ind.visible) continue;
      const existing = mounted.get(ind.id);
      if (!existing) {
        if (ind.isMain) {
          chart.createIndicator(
            {
              name: ind.name,
              calcParams: ind.calcParams as any[],
              styles: { tooltip: { showRule: 'none' } } as any,
            },
            true,
            { id: 'candle_pane' }
          );
          mounted.set(ind.id, { name: ind.name, paneId: 'candle_pane', visible: true });
        } else {
          const paneId = chart.createIndicator(
            { name: ind.name, calcParams: ind.calcParams as any[] },
            false,
            { height: 110, dragEnabled: true }
          );
          if (paneId) {
            mounted.set(ind.id, { name: ind.name, paneId, visible: true });
          }
        }
      } else {
        // Keep calcParams synced when re-compiling or editing an already-mounted Pine indicator
        try {
          chart.overrideIndicator(
            {
              name: ind.name,
              calcParams: ind.calcParams as any[],
              ...(ind.isMain ? { styles: { tooltip: { showRule: 'none' } } as any } : {}),
            },
            existing.paneId
          );
        } catch {}
      }
    }
  }, [activeIndicators]);

  // 10. Countdown to Bar Close Timer & Sync Active Timeframe for Overlay Visibility
  useEffect(() => {
    setOverlayActiveTimeframe(timeframe);
    if (chartRef.current) {
      // Trigger KLineCharts to re-evaluate overlay createPointFigures for per-timeframe visibility
      for (const d of useChartStore.getState().drawingsList) {
        try {
          chartRef.current.overrideOverlay({ id: d.id });
        } catch {}
      }
    }
    const updateCountdown = () => {
      const tfSec = getTimeframeSeconds(timeframe);
      const nowSec = Math.floor(Date.now() / 1000);
      const remaining = tfSec - (nowSec % tfSec);
      setCountdown(formatCountdown(remaining));
    };
    updateCountdown();
    const t = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(t);
  }, [timeframe]);

  // 10b. Sync Locked Vertical Cursor Line by Time
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.removeOverlay({ id: 'sys_locked_cursor' });
    if (lockedCursorTs !== null) {
      chart.createOverlay({
        id: 'sys_locked_cursor',
        name: 'verticalStraightLine',
        lock: true,
        points: [{ timestamp: lockedCursorTs }],
        styles: {
          line: {
            color: '#2962ff',
            size: 1,
            style: 'dashed' as any,
            dashedValue: [4, 4],
          },
        },
      });
    }
  }, [lockedCursorTs, symbol, timeframe, candles.length]);

  const handleCopyPrice = useCallback((price: number) => {
    const st = useChartStore.getState();
    const d = st.symbolInfo.digits ?? 2;
    const text = price.toFixed(d);
    try {
      navigator.clipboard?.writeText(text).catch(() => {});
    } catch {}
    setCopiedClipboard({ type: 'price', price });
    st.showToast('info', `Copied price ${text}`);
  }, []);

  const handlePasteFromClipboard = useCallback(
    (targetPrice: number, targetTs: number | null, targetIdx: number | null) => {
      const chart = chartRef.current;
      if (!chart || !copiedClipboard) return;
      const st = useChartStore.getState();

      if (copiedClipboard.type === 'price') {
        const newId = `hline_${Date.now()}`;
        chart.createOverlay({
          id: newId,
          name: 'horizontalStraightLine',
          points: [{ value: copiedClipboard.price }],
          styles: { line: { color: '#2962ff', size: 1.5 } },
          ...buildOverlayEvents(),
        });
        const ov = chart.getOverlayById(newId);
        if (ov) persistOverlay(ov, true);
        st.showToast('success', `Pasted horizontal line @ ${copiedClipboard.price}`);
        return;
      }

      const src = copiedClipboard.item;
      const srcPts = src.points || [];
      if (srcPts.length === 0) return;

      const baseVal = srcPts[0].value ?? targetPrice;
      const deltaVal = targetPrice - baseVal;
      const baseTs = srcPts[0].timestamp;
      const deltaTs = baseTs && targetTs ? targetTs - baseTs : 0;
      const baseIdx = srcPts[0].dataIndex;
      const deltaIdx =
        typeof baseIdx === 'number' && typeof targetIdx === 'number' ? targetIdx - baseIdx : 0;

      const shiftedPts = srcPts.map((p) => ({
        ...(p.timestamp !== undefined ? { timestamp: p.timestamp + deltaTs } : {}),
        ...(typeof p.dataIndex === 'number' ? { dataIndex: p.dataIndex + deltaIdx } : {}),
        ...(typeof p.value === 'number' ? { value: p.value + deltaVal } : {}),
      }));

      const newId = `${src.name}_${Date.now()}`;
      chart.createOverlay({
        id: newId,
        name: src.name,
        points: shiftedPts,
        styles: src.styles ? JSON.parse(JSON.stringify(src.styles)) : undefined,
        extendData: src.extendData ? JSON.parse(JSON.stringify(src.extendData)) : undefined,
        lock: false,
        visible: true,
        ...buildOverlayEvents(),
      });
      const ov = chart.getOverlayById(newId);
      if (ov) persistOverlay(ov, true);
      st.showToast('success', `Pasted ${src.name}`);
    },
    [buildOverlayEvents, copiedClipboard, persistOverlay]
  );

  // 11. Hold Ctrl for Temporary Strong Magnet + Context Menu & Drawing Shortcuts + Esc to Cancel
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' && !e.repeat) {
        setCtrlMagnetPressed(true);
      }
      if (e.key === 'Shift') {
        setOverlayShiftPressed(true);
      }

      const target = e.target as HTMLElement | null;
      const isInputFocused =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      const getCursorOrLastPrice = () => {
        const st = useChartStore.getState();
        if (hoverCursor && Number.isFinite(hoverCursor.price)) return hoverCursor.price;
        if (!st.replay.isActive && st.liveTick?.bid) return st.liveTick.bid;
        return st.candles.length > 0 ? st.candles[st.candles.length - 1].close : 0;
      };

      // Ctrl + C (copy selected drawing) / Ctrl + V (paste) / Ctrl + G (group) / Ctrl + Shift + G (ungroup)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !isInputFocused) {
        const key = e.key.toLowerCase();
        if (key === 'g') {
          const st = useChartStore.getState();
          if (e.shiftKey) {
            if (st.selectedOverlayIds.length > 0) {
              e.preventDefault();
              st.bridge.ungroupOverlays?.(st.selectedOverlayIds);
              return;
            }
          } else if (st.selectedOverlayIds.length > 1) {
            e.preventDefault();
            st.bridge.groupOverlays?.(st.selectedOverlayIds);
            return;
          }
        }
        if (key === 'c') {
          const st = useChartStore.getState();
          if (st.selectedOverlay && chartRef.current) {
            const ov = chartRef.current.getOverlayById(st.selectedOverlay.id);
            const serialized = serializeOverlay(ov);
            if (serialized) {
              e.preventDefault();
              setCopiedClipboard({ type: 'overlay', item: serialized });
              st.showToast('info', `Copied ${serialized.name}`);
              return;
            }
          }
        }
        if (key === 'v' && copiedClipboard) {
          e.preventDefault();
          const p = getCursorOrLastPrice();
          const st = useChartStore.getState();
          const lastCandle = st.candles[st.candles.length - 1];
          handlePasteFromClipboard(p, lastCandle?.timestamp ?? null, st.candles.length - 1);
          return;
        }
      }

      // Shift + T -> Open Order Ticket Modal at cursor price
      if (e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !isInputFocused) {
        if (e.key.toLowerCase() === 't') {
          e.preventDefault();
          const p = getCursorOrLastPrice();
          if (p > 0) setOrderDialogPrice(p);
          return;
        }
      }

      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const key = e.key.toLowerCase();
        if (e.shiftKey && key === 'r') {
          e.preventDefault();
          useChartStore.getState().setActiveTool('rectBox');
          return;
        }
        if (e.shiftKey && (key === 's' || key === 'b')) {
          e.preventDefault();
          const st = useChartStore.getState();
          const p = Number(getCursorOrLastPrice().toFixed(st.symbolInfo.digits ?? 2));
          if (p > 0) {
            const side = key === 's' ? 'SELL' : 'BUY';
            if (st.replay.isActive) {
              st.placePaperOrder({
                side,
                order_mode: 'PENDING',
                entry_price: p,
                volume: st.defaultLot,
              });
            } else {
              st.executeOrder({
                symbol: st.symbol,
                side,
                order_mode: 'PENDING',
                entry_price: p,
                volume: st.defaultLot,
                comment: 'TV Shortcut Order',
              });
            }
          }
          return;
        }
        if (!e.shiftKey && key === 'r') {
          e.preventDefault();
          useChartStore.getState().bridge.resetChartScale?.();
          return;
        }
        if (!e.shiftKey && key === 'a') {
          e.preventDefault();
          const st = useChartStore.getState();
          const d = st.symbolInfo.digits ?? 2;
          const p = Number(getCursorOrLastPrice().toFixed(d));
          const curP =
            !st.replay.isActive && st.liveTick?.bid
              ? st.liveTick.bid
              : st.candles[st.candles.length - 1]?.close ?? p;
          if (p > 0) {
            st.addAlert({
              id: `alert_${Date.now()}`,
              symbol: st.symbol,
              price: p,
              condition: p >= curP ? 'CROSSING_UP' : 'CROSSING_DOWN',
              note: `Alert @ ${p.toFixed(d)}`,
              active: true,
              triggered: false,
            });
            st.showToast('success', `Alert added on ${st.symbol} @ ${p.toFixed(d)}`);
          }
          return;
        }
        const altToolMap: Record<string, string> = {
          t: 'segment',
          h: 'horizontalStraightLine',
          j: 'horizontalRayLine',
          v: 'verticalStraightLine',
          c: 'crossLine',
          f: 'fibonacciLine',
        };
        if (altToolMap[key]) {
          e.preventDefault();
          useChartStore.getState().setActiveTool(altToolMap[key]);
          return;
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (isInputFocused) return;

        const st = useChartStore.getState();
        const anyModalOpen =
          Boolean(st.drawingSettingsOverlayId) ||
          st.symbolModalOpen ||
          st.indicatorsModalOpen ||
          st.chartSettingsModalOpen ||
          st.accountModalOpen ||
          st.backtestModalOpen ||
          st.analyticsHubOpen ||
          orderDialogPrice !== null ||
          tableViewOpen;
        if (anyModalOpen) return;

        if (st.selectedOverlayIds.length > 1) {
          e.preventDefault();
          st.bridge.deleteMultipleOverlays?.(st.selectedOverlayIds);
          return;
        }
        if (st.selectedOverlay) {
          e.preventDefault();
          st.bridge.deleteSelectedOverlay?.();
          return;
        }
      }
      if (e.key === 'Escape') {
        if (marqueeRef.current) {
          marqueeRef.current = null;
          setMarqueeBox(null);
          const prev = preMarqueeSelectionRef.current;
          useChartStore.getState().setSelectedOverlay(prev.selectedOverlay);
          useChartStore.getState().setSelectedOverlayIds(prev.selectedOverlayIds);
          return;
        }
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        if (orderDialogPrice !== null) {
          setOrderDialogPrice(null);
          return;
        }
        if (tableViewOpen) {
          setTableViewOpen(false);
          return;
        }
        if (dragActiveRef.current && cancelDragRef.current) {
          cancelDragRef.current();
          return;
        }
        if (pickMode) {
          setPickMode(null);
          return;
        }
        if (selectedTradeKey || posEditor) {
          setSelectedTradeKey(null);
          setPosEditor(null);
          return;
        }
        if (useChartStore.getState().activeTool || inProgressOverlayIdRef.current) {
          cancelActiveDrawingTool();
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        setCtrlMagnetPressed(false);
      }
      if (e.key === 'Shift') {
        setOverlayShiftPressed(false);
      }
    };
    const onBlur = () => {
      setCtrlMagnetPressed(false);
      setOverlayShiftPressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [
    cancelActiveDrawingTool,
    contextMenu,
    copiedClipboard,
    handlePasteFromClipboard,
    hoverCursor,
    orderDialogPrice,
    pickMode,
    posEditor,
    selectedTradeKey,
    serializeOverlay,
    setCtrlMagnetPressed,
    tableViewOpen,
  ]);

  // Populate lastKnownPointsRef whenever drawingsList changes (for group/multi-select move deltas)
  useEffect(() => {
    for (const d of drawingsList) {
      if (!lastKnownPointsRef.current[d.id] || d.points?.length) {
        lastKnownPointsRef.current[d.id] = (d.points || []).map((p) => ({ ...p }));
      }
    }
  }, [drawingsList]);

  const findDrawingsIntersectingBox = useCallback(
    (left: number, top: number, right: number, bottom: number): string[] => {
      const chart = chartRef.current;
      if (!chart) return [];
      const list = useChartStore.getState().drawingsList;
      const matched: string[] = [];

      for (const d of list) {
        if (d.visible === false) continue;
        const liveOv: any = chart.getOverlayById(d.id);
        if (liveOv && liveOv.visible === false) continue;
        const pts = liveOv?.points?.length ? liveOv.points : d.points;
        if (!pts || pts.length === 0) continue;
        try {
          const raw: any = chart.convertToPixel(pts, { paneId: 'candle_pane' });
          const coords: Array<{ x?: number; y?: number }> = Array.isArray(raw)
            ? raw
            : raw
            ? [raw]
            : [];
          if (coords.length === 0) continue;

          const c0x = coords[0]?.x;
          const c0y = coords[0]?.y;

          if (d.name === 'horizontalStraightLine') {
            if (typeof c0y === 'number' && Number.isFinite(c0y) && c0y >= top && c0y <= bottom) {
              matched.push(d.id);
            }
            continue;
          }
          if (d.name === 'horizontalRayLine' || d.name === 'priceLine') {
            if (
              typeof c0y === 'number' &&
              Number.isFinite(c0y) &&
              c0y >= top &&
              c0y <= bottom &&
              (typeof c0x !== 'number' || !Number.isFinite(c0x) || c0x <= right)
            ) {
              matched.push(d.id);
            }
            continue;
          }
          if (d.name === 'verticalStraightLine') {
            if (typeof c0x === 'number' && Number.isFinite(c0x) && c0x >= left && c0x <= right) {
              matched.push(d.id);
            }
            continue;
          }
          if (d.name === 'crossLine') {
            if (
              (typeof c0y === 'number' && Number.isFinite(c0y) && c0y >= top && c0y <= bottom) ||
              (typeof c0x === 'number' && Number.isFinite(c0x) && c0x >= left && c0x <= right)
            ) {
              matched.push(d.id);
            }
            continue;
          }

          const valid = coords.filter(
            (c): c is { x: number; y: number } =>
              typeof c?.x === 'number' &&
              Number.isFinite(c.x) &&
              typeof c?.y === 'number' &&
              Number.isFinite(c.y)
          );
          if (valid.length === 0) continue;

          if (valid.length === 1) {
            if (
              valid[0].x >= left &&
              valid[0].x <= right &&
              valid[0].y >= top &&
              valid[0].y <= bottom
            ) {
              matched.push(d.id);
            }
            continue;
          }

          let hit = false;
          for (let i = 0; i < valid.length - 1; i++) {
            if (
              doesSegmentIntersectBox(
                valid[i].x,
                valid[i].y,
                valid[i + 1].x,
                valid[i + 1].y,
                left,
                top,
                right,
                bottom
              )
            ) {
              hit = true;
              break;
            }
          }
          if (!hit) {
            const minX = Math.min(...valid.map((p) => p.x));
            const maxX = Math.max(...valid.map((p) => p.x));
            const minY = Math.min(...valid.map((p) => p.y));
            const maxY = Math.max(...valid.map((p) => p.y));
            if (maxX >= left && minX <= right && maxY >= top && minY <= bottom) {
              hit = true;
            }
          }
          if (hit) matched.push(d.id);
        } catch {}
      }
      return matched;
    },
    []
  );

  const cancelMarqueeSelection = useCallback(() => {
    if (!marqueeRef.current) return;
    marqueeRef.current = null;
    setMarqueeBox(null);
    const prev = preMarqueeSelectionRef.current;
    const st = useChartStore.getState();
    st.setSelectedOverlay(prev.selectedOverlay);
    st.setSelectedOverlayIds(prev.selectedOverlayIds);
  }, []);

  const handleContainerMouseDownCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (!e.ctrlKey && !e.metaKey) {
      plainMouseDownPosRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    plainMouseDownPosRef.current = null;

    const st = useChartStore.getState();
    if (st.activeTool || inProgressOverlayIdRef.current || pickMode || dragActiveRef.current) {
      return;
    }

    const targetEl = e.target as HTMLElement | null;
    if (
      targetEl &&
      targetEl.closest('button, input, select, textarea, [data-no-marquee="true"]')
    ) {
      return;
    }

    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (x > rect.width - axisDims.yAxisWidth || y > rect.height - axisDims.xAxisHeight) {
      return;
    }

    e.stopPropagation();
    e.preventDefault();

    const initBox = { startX: x, startY: y, curX: x, curY: y };
    preMarqueeSelectionRef.current = {
      selectedOverlay: st.selectedOverlay,
      selectedOverlayIds: [...st.selectedOverlayIds],
    };
    marqueeRef.current = initBox;
    setMarqueeBox(initBox);
  };

  useEffect(() => {
    if (!marqueeBox) return;

    const onMove = (ev: MouseEvent) => {
      if (!marqueeRef.current) return;
      // CRITICAL RULE: Releasing Ctrl while dragging cancels the selection box
      if (!ev.ctrlKey && !ev.metaKey) {
        cancelMarqueeSelection();
        return;
      }
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const curX = Math.max(0, Math.min(rect.width - axisDims.yAxisWidth, ev.clientX - rect.left));
      const curY = Math.max(0, Math.min(rect.height - axisDims.xAxisHeight, ev.clientY - rect.top));
      const next = { ...marqueeRef.current, curX, curY };
      marqueeRef.current = next;
      setMarqueeBox(next);

      const left = Math.min(next.startX, next.curX);
      const right = Math.max(next.startX, next.curX);
      const top = Math.min(next.startY, next.curY);
      const bottom = Math.max(next.startY, next.curY);
      const matchedIds = findDrawingsIntersectingBox(left, top, right, bottom);
      useChartStore.getState().setSelectedOverlayIds(matchedIds);
    };

    const onKeyUp = (ev: KeyboardEvent) => {
      if (ev.key === 'Control' || ev.key === 'Meta') {
        cancelMarqueeSelection();
      }
    };

    const onUp = () => {
      if (!marqueeRef.current) return;
      const box = marqueeRef.current;
      marqueeRef.current = null;
      setMarqueeBox(null);

      // Guard against trailing click / KLineCharts onDeselected immediately after marquee mouseup
      marqueeJustFinishedRef.current = true;
      window.setTimeout(() => {
        marqueeJustFinishedRef.current = false;
      }, 180);

      const left = Math.min(box.startX, box.curX);
      const right = Math.max(box.startX, box.curX);
      const top = Math.min(box.startY, box.curY);
      const bottom = Math.max(box.startY, box.curY);
      const matchedIds = findDrawingsIntersectingBox(left, top, right, bottom);
      const st = useChartStore.getState();

      if (matchedIds.length === 1) {
        st.setSelectedOverlayIds(matchedIds);
        st.bridge.selectOverlayById?.(matchedIds[0]);
      } else if (matchedIds.length > 1) {
        st.setSelectedOverlayIds(matchedIds);
        const first = st.drawingsList.find((d) => d.id === matchedIds[0]);
        if (first) {
          const ls = (first.styles as any)?.line || {};
          st.setSelectedOverlay({
            id: first.id,
            name: first.name,
            color: ls.color || '#2962ff',
            lineWidth: ls.size || 1,
            lineStyle: ls.style === 'dashed' ? 'dashed' : 'solid',
            locked: Boolean(first.locked),
            label: String((first.extendData as any)?.label || ''),
          });
        }
      } else {
        st.setSelectedOverlay(null);
        st.setSelectedOverlayIds([]);
      }
      setCoordTick((n) => (n + 1) % 1000000);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    marqueeBox !== null,
    axisDims.xAxisHeight,
    axisDims.yAxisWidth,
    cancelMarqueeSelection,
    findDrawingsIntersectingBox,
  ]);

  // Clear selected trade zone if symbol changes
  useEffect(() => {
    setSelectedTradeKey(null);
    setPosEditor(null);
  }, [symbol]);

  const handleContainerMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    setOverlayShiftPressed(e.shiftKey);
    const chart = chartRef.current;
    const el = containerRef.current;
    if (!chart || !el) return;
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (y < 14 || y > rect.height - 30) {
      setHoverCursor(null);
      return;
    }
    try {
      const res: any = chart.convertFromPixel([{ x: 100, y }], { paneId: 'candle_pane' });
      const pt = Array.isArray(res) ? res[0] : res;
      if (pt && typeof pt.value === 'number' && Number.isFinite(pt.value)) {
        setHoverCursor({ y, price: pt.value });
        return;
      }
    } catch {}
    setHoverCursor(null);
  };

  const handleContainerMouseLeave = () => {
    setHoverCursor(null);
  };

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 1. Pick SL/TP price directly on chart canvas
    if (pickMode && chartRef.current && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      try {
        const res: any = chartRef.current.convertFromPixel([{ x, y }], { paneId: 'candle_pane' });
        const pt = Array.isArray(res) ? res[0] : res;
        if (pt && typeof pt.value === 'number' && Number.isFinite(pt.value)) {
          const d = symbolInfo.digits ?? 2;
          const formatted = pt.value.toFixed(d);
          if (pickMode === 'sl') setSlDraft(formatted);
          else setTpDraft(formatted);
          setPickMode(null);
          showToast('info', `${pickMode.toUpperCase()} set to ${formatted} from chart.`);
          return;
        }
      } catch {}
    }

    // 2. Bar Replay Scissor Cut
    const state = useChartStore.getState();
    if (state.replay.isActive && state.replay.isSelectingCut && scissorHoverRef.current) {
      cutReplayAtIndex(scissorHoverRef.current.dataIndex);
      setScissorHover(null);
      scissorHoverRef.current = null;
      return;
    }

    // 3. Click on empty chart canvas hides active trade SL/TP detail zone
    if (selectedTradeKey && !dragActiveRef.current) {
      setSelectedTradeKey(null);
      setPosEditor(null);
    }

    // 4. Plain click on empty chart canvas clears multi-selected / box-selected drawings
    if (
      !e.ctrlKey &&
      !e.metaKey &&
      !marqueeRef.current &&
      !marqueeJustFinishedRef.current &&
      state.selectedOverlayIds.length > 0 &&
      Date.now() - lastOverlaySelectedAtRef.current > 180
    ) {
      const targetEl = e.target as HTMLElement | null;
      const isUiControl = Boolean(
        targetEl?.closest('button, input, select, textarea, [data-no-marquee="true"]')
      );
      const downPos = plainMouseDownPosRef.current;
      const dist = downPos
        ? Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y)
        : 0;
      if (!isUiControl && dist < 5) {
        state.setSelectedOverlay(null);
        state.setSelectedOverlayIds([]);
      }
    }
    plainMouseDownPosRef.current = null;
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const state = useChartStore.getState();

    // 1. Keep existing right-click-to-cancel behavior when an operation is in progress
    if (dragActiveRef.current && cancelDragRef.current) {
      cancelDragRef.current();
      return;
    }
    if (pickMode) {
      setPickMode(null);
      return;
    }
    if (selectedTradeKey || posEditor) {
      setSelectedTradeKey(null);
      setPosEditor(null);
      return;
    }
    if (state.activeTool || inProgressOverlayIdRef.current) {
      cancelActiveDrawingTool();
      return;
    }
    if (state.replay.isActive && state.replay.isSelectingCut) {
      setScissorHover(null);
      scissorHoverRef.current = null;
      return;
    }

    // 2. Otherwise open TradingView Right-Click Chart Context Menu at clicked coordinates
    const chart = chartRef.current;
    const el = containerRef.current;
    if (!chart || !el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let clickedPrice =
      hoverCursor?.price ??
      (state.candles.length > 0 ? state.candles[state.candles.length - 1].close : 0);
    let clickedTs: number | null = null;
    let clickedIdx: number | null = null;

    try {
      const converted: any = chart.convertFromPixel([{ x, y }], { paneId: 'candle_pane' });
      const pt = Array.isArray(converted) ? converted[0] : converted;
      if (pt && typeof pt.value === 'number' && Number.isFinite(pt.value)) {
        clickedPrice = pt.value;
      }
      if (pt && typeof pt.timestamp === 'number') {
        clickedTs = pt.timestamp;
      }
      if (pt && typeof pt.dataIndex === 'number') {
        clickedIdx = pt.dataIndex;
      }
    } catch {}

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      price: clickedPrice,
      timestamp: clickedTs,
      dataIndex: clickedIdx,
    });
  };

  const digits = symbolInfo.digits ?? 2;
  const pipSize = (symbolInfo.point || 0.01) * 10;

  const applyQuickSlPips = (pips: number) => {
    if (!posEditor) return;
    const baseEntry =
      posEditor.isPending && parseFloat(entryDraft) > 0
        ? parseFloat(entryDraft)
        : posEditor.entryPrice;
    const price =
      pips === 0
        ? baseEntry
        : posEditor.side === 'BUY'
        ? baseEntry - pips * pipSize
        : baseEntry + pips * pipSize;
    setSlDraft(price.toFixed(digits));
  };

  const applyQuickTpPips = (pips: number) => {
    if (!posEditor) return;
    const baseEntry =
      posEditor.isPending && parseFloat(entryDraft) > 0
        ? parseFloat(entryDraft)
        : posEditor.entryPrice;
    const price =
      posEditor.side === 'BUY'
        ? baseEntry + pips * pipSize
        : baseEntry - pips * pipSize;
    setTpDraft(price.toFixed(digits));
  };

  const applyQuickTpRR = (rr: number) => {
    if (!posEditor) return;
    const baseEntry =
      posEditor.isPending && parseFloat(entryDraft) > 0
        ? parseFloat(entryDraft)
        : posEditor.entryPrice;
    const slVal = parseFloat(slDraft);
    const slDist = Number.isFinite(slVal) && slVal > 0 ? Math.abs(baseEntry - slVal) : 20 * pipSize;
    const price =
      posEditor.side === 'BUY'
        ? baseEntry + slDist * rr
        : baseEntry - slDist * rr;
    setTpDraft(price.toFixed(digits));
  };

  const handleSubmitPosEditor = async () => {
    if (!posEditor) return;
    const entryVal = parseFloat(entryDraft) || posEditor.entryPrice;
    const slVal = parseFloat(slDraft) || 0;
    const tpVal = parseFloat(tpDraft) || 0;

    if (posEditor.mode === 'paper') {
      modifyPaperTrade(String(posEditor.id), {
        entry_price: posEditor.isPending ? entryVal : undefined,
        sl: slVal,
        tp: tpVal,
      });
      showToast('success', 'Paper trade updated.');
      setSelectedTradeKey(null);
      setPosEditor(null);
      return;
    }

    setIsSubmittingPos(true);
    try {
      const res = await api.modifyTrade({
        ticket: Number(posEditor.id),
        symbol: posEditor.symbol,
        price: posEditor.isPending ? entryVal : undefined,
        sl: slVal,
        tp: tpVal,
        is_pending: posEditor.isPending,
      });
      if (res.success) {
        showToast('success', `Updated #${posEditor.id}`);
        await refreshTradeState();
        setSelectedTradeKey(null);
        setPosEditor(null);
      } else {
        showToast('error', res.message || 'Failed to modify trade');
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Modify trade error');
    } finally {
      setIsSubmittingPos(false);
    }
  };

  const handleClosePosFromEditor = async () => {
    if (!posEditor) return;
    if (posEditor.mode === 'paper') {
      if (posEditor.isPending) cancelPaperTrade(String(posEditor.id));
      else closePaperTrade(String(posEditor.id));
      setSelectedTradeKey(null);
      setPosEditor(null);
      return;
    }

    setIsSubmittingPos(true);
    try {
      const res = posEditor.isPending
        ? await api.cancelOrder(Number(posEditor.id))
        : await api.closePosition(Number(posEditor.id));
      if (res.success) {
        showToast(
          'success',
          posEditor.isPending
            ? `Cancelled pending order #${posEditor.id}`
            : `Closed position #${posEditor.id}`
        );
        await refreshTradeState();
        setSelectedTradeKey(null);
        setPosEditor(null);
      } else {
        showToast('error', res.message || 'Failed to close/cancel');
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Close/cancel error');
    } finally {
      setIsSubmittingPos(false);
    }
  };

  // Compute live-synced profit for open editor
  const liveEditorPos =
    posEditor?.mode === 'live' && !posEditor.isPending
      ? positions.find((p) => p.ticket === posEditor.id)
      : null;
  const paperEditorPos =
    posEditor?.mode === 'paper'
      ? paperAccount.trades.find((t) => t.id === posEditor.id)
      : null;
  const activeEditorProfit = liveEditorPos
    ? liveEditorPos.profit
    : paperEditorPos
    ? paperEditorPos.pnl_money
    : posEditor?.profit ?? 0;

  const activeEntryRef =
    posEditor?.isPending && parseFloat(entryDraft) > 0
      ? parseFloat(entryDraft)
      : posEditor?.entryPrice ?? 0;
  const slNum = parseFloat(slDraft);
  const tpNum = parseFloat(tpDraft);
  const slPipsDist =
    posEditor && Number.isFinite(slNum) && slNum > 0
      ? ((posEditor.side === 'BUY' ? slNum - activeEntryRef : activeEntryRef - slNum) / pipSize).toFixed(1)
      : null;
  const tpPipsDist =
    posEditor && Number.isFinite(tpNum) && tpNum > 0
      ? ((posEditor.side === 'BUY' ? tpNum - activeEntryRef : activeEntryRef - tpNum) / pipSize).toFixed(1)
      : null;

  return (
    <div
      className={`flex-1 relative overflow-hidden ${
        (replay.isActive && replay.isSelectingCut) || pickMode ? 'cursor-crosshair' : ''
      }`}
      style={{ backgroundColor: chartSettings.canvasBgColor }}
      onMouseDownCapture={handleContainerMouseDownCapture}
      onClick={handleContainerClick}
      onContextMenu={handleContextMenu}
      onMouseMove={handleContainerMouseMove}
      onMouseLeave={handleContainerMouseLeave}
    >
      {/* Background Symbol Watermark */}
      {chartSettings.showWatermark && (
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center opacity-[0.05] select-none z-0">
          <span className="text-6xl font-bold tracking-widest text-[#d1d4dc]">
            {symbol} · {timeframe}
          </span>
          <span className="text-xl tracking-wider text-[#d1d4dc] mt-1">
            {symbolInfo.description}
          </span>
        </div>
      )}

      {/* Top-Left TradingView Chart Legend */}
      <ChartLegend />

      {/* Drawing Style + Label + R:R Execution Floating Toolbar */}
      <DrawingFloatingBar />

      {/* KLineCharts Canvas Mount */}
      <div ref={containerRef} className="w-full h-full relative z-[1]" />

      {/* Selected & Live Marquee-Hovered Drawings TradingView-Style Anchor Handles (stays lit on all selected items) */}
      {selectedOverlayIds.length > 0 &&
        chartRef.current &&
        (() => {
          void coordTick;
          const handles: Array<{
            key: string;
            x: number;
            y: number;
            shape: 'circle' | 'square';
            rrExpandOverlayId?: string;
          }> = [];
          const idSet = new Set(selectedOverlayIds);
          const cw = containerRef.current?.clientWidth ?? 800;
          const ch = containerRef.current?.clientHeight ?? 500;
          const usableW = Math.max(80, cw - axisDims.yAxisWidth);
          const usableH = Math.max(80, ch - axisDims.xAxisHeight);

          const pushHandle = (
            key: string,
            x: number,
            y: number,
            shape: 'circle' | 'square' = 'circle',
            rrExpandOverlayId?: string
          ) => {
            if (
              Number.isFinite(x) &&
              Number.isFinite(y) &&
              x >= 0 &&
              x <= usableW &&
              y >= 0 &&
              y <= usableH
            ) {
              handles.push({ key, x, y, shape, rrExpandOverlayId });
            }
          };

          for (const d of drawingsList) {
            if (!idSet.has(d.id) || d.visible === false) continue;
            const liveOv: any = chartRef.current.getOverlayById(d.id);
            const pts = liveOv?.points?.length ? liveOv.points : d.points;
            if (!pts?.length) continue;
            try {
              const raw: any = chartRef.current.convertToPixel(pts, { paneId: 'candle_pane' });
              const coords: Array<{ x?: number; y?: number }> = Array.isArray(raw)
                ? raw
                : raw
                ? [raw]
                : [];
              const valid = coords.filter(
                (c): c is { x: number; y: number } =>
                  typeof c?.x === 'number' &&
                  Number.isFinite(c.x) &&
                  typeof c?.y === 'number' &&
                  Number.isFinite(c.y)
              );

              if (d.name === 'rectBox' && valid.length >= 2) {
                // TradingView 8-handle Rectangle: 4 corner circles + 4 midpoint rounded squares
                const x1 = Math.min(valid[0].x, valid[1].x);
                const x2 = Math.max(valid[0].x, valid[1].x);
                const y1 = Math.min(valid[0].y, valid[1].y);
                const y2 = Math.max(valid[0].y, valid[1].y);
                const xm = (x1 + x2) / 2;
                const ym = (y1 + y2) / 2;
                pushHandle(`${d.id}_tl`, x1, y1, 'circle');
                pushHandle(`${d.id}_tr`, x2, y1, 'circle');
                pushHandle(`${d.id}_bl`, x1, y2, 'circle');
                pushHandle(`${d.id}_br`, x2, y2, 'circle');
                pushHandle(`${d.id}_tc`, xm, y1, 'square');
                pushHandle(`${d.id}_bc`, xm, y2, 'square');
                pushHandle(`${d.id}_ml`, x1, ym, 'square');
                pushHandle(`${d.id}_mr`, x2, ym, 'square');
                continue;
              }

              if ((d.name === 'riskRewardLong' || d.name === 'riskRewardShort') && valid.length >= 3) {
                // TradingView 4-handle Position: Top-Left square, Mid-Left circle, Bot-Left square,
                // and Mid-Right interactive circle handle (horizontal-only expand/shrink!)
                const xLeft = Math.min(...valid.map((p) => p.x));
                const xRight = Math.max(xLeft + 24, Math.max(...valid.map((p) => p.x)));
                const ys = [valid[0].y, valid[1].y, valid[2].y].sort((a, b) => a - b);
                pushHandle(`${d.id}_top`, xLeft, ys[0], 'square');
                pushHandle(`${d.id}_entryL`, xLeft, ys[1], 'circle');
                pushHandle(`${d.id}_entryR`, xRight, ys[1], 'circle', d.id);
                pushHandle(`${d.id}_bot`, xLeft, ys[2], 'square');
                continue;
              }

              let addedForDrawing = false;
              valid.forEach((c, idx) => {
                if (c.x >= 0 && c.x <= usableW && c.y >= 0 && c.y <= usableH) {
                  handles.push({ key: `${d.id}_${idx}`, x: c.x, y: c.y, shape: 'circle' });
                  addedForDrawing = true;
                }
              });

              // Fallback visible handle for horizontal / vertical lines whose anchor is off-screen
              if (!addedForDrawing && coords[0]) {
                const c0x = coords[0].x;
                const c0y = coords[0].y;
                if (
                  (d.name === 'horizontalStraightLine' ||
                    d.name === 'horizontalRayLine' ||
                    d.name === 'priceLine') &&
                  typeof c0y === 'number' &&
                  Number.isFinite(c0y) &&
                  c0y >= 0 &&
                  c0y <= usableH
                ) {
                  handles.push({ key: `${d.id}_hmid`, x: usableW / 2, y: c0y, shape: 'circle' });
                } else if (
                  d.name === 'verticalStraightLine' &&
                  typeof c0x === 'number' &&
                  Number.isFinite(c0x) &&
                  c0x >= 0 &&
                  c0x <= usableW
                ) {
                  handles.push({ key: `${d.id}_vmid`, x: c0x, y: usableH / 2, shape: 'circle' });
                }
              }
            } catch {}
          }
          const startRrHorizontalExpand = (
            e: React.MouseEvent<HTMLDivElement>,
            overlayId: string
          ) => {
            e.stopPropagation();
            e.preventDefault();
            const chart = chartRef.current;
            const el = containerRef.current;
            if (!chart || !el) return;
            const ov: any = chart.getOverlayById(overlayId);
            if (!ov || ov.lock || !Array.isArray(ov.points) || ov.points.length < 3) return;

            dragActiveRef.current = true;
            lastOverlaySelectedAtRef.current = Date.now();
            const origPts = ov.points.map((p: any) => ({ ...p }));

            // Resolve actual pixel X of each point to find left edge and right-edge point reliably
            const pxRaw: any = chart.convertToPixel(origPts, { paneId: 'candle_pane' });
            const pxArr: Array<{ x?: number; y?: number }> = Array.isArray(pxRaw)
              ? pxRaw
              : pxRaw
              ? [pxRaw]
              : [];
            const leftPx = Math.min(
              ...pxArr.map((p) => (typeof p?.x === 'number' && Number.isFinite(p.x) ? p.x : Infinity))
            );
            const leftConvRaw: any = Number.isFinite(leftPx)
              ? chart.convertFromPixel([{ x: leftPx, y: 100 }], { paneId: 'candle_pane' })
              : null;
            const leftConv = Array.isArray(leftConvRaw) ? leftConvRaw[0] : leftConvRaw;
            const leftBarIdx =
              typeof leftConv?.dataIndex === 'number' && Number.isFinite(leftConv.dataIndex)
                ? Math.round(leftConv.dataIndex)
                : typeof origPts[0]?.dataIndex === 'number'
                ? Math.round(origPts[0].dataIndex)
                : 0;

            // Point index 1 is always the independent right-edge point (points 0 & 2 are locked to left edge)
            const rightPtIdx = 1;

            const onMove = (ev: MouseEvent) => {
              const rect = el.getBoundingClientRect();
              const mx = Math.max(0, Math.min(rect.width - axisDims.yAxisWidth, ev.clientX - rect.left));
              const my = Math.max(0, Math.min(rect.height - axisDims.xAxisHeight, ev.clientY - rect.top));
              try {
                const res: any = chart.convertFromPixel([{ x: mx, y: my }], { paneId: 'candle_pane' });
                const pt = Array.isArray(res) ? res[0] : res;
                if (!pt || typeof pt.dataIndex !== 'number' || !Number.isFinite(pt.dataIndex)) return;

                const nextIdx = Math.max(leftBarIdx + 1, Math.round(pt.dataIndex));
                // CRITICAL: Do NOT retain stale `origPts[rightPtIdx].timestamp` when dragging into future space,
                // because KLineCharts prioritizes `timestamp` over `dataIndex` if present!
                const nextRightPt: any = {
                  value: origPts[rightPtIdx].value,
                  dataIndex: nextIdx,
                };
                if (typeof pt.timestamp === 'number' && Number.isFinite(pt.timestamp)) {
                  nextRightPt.timestamp = pt.timestamp;
                }

                const nextPts = origPts.map((p: any, idx: number) =>
                  idx === rightPtIdx ? nextRightPt : { ...p }
                );
                chart.overrideOverlay({ id: overlayId, points: nextPts });
                setCoordTick((n) => (n + 1) % 1000000);
              } catch {}
            };

            const onUp = () => {
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
              lastOverlaySelectedAtRef.current = Date.now();
              window.setTimeout(() => {
                dragActiveRef.current = false;
              }, 120);
              const updated = chart.getOverlayById(overlayId);
              if (updated) persistOverlay(updated, false);
              setCoordTick((n) => (n + 1) % 1000000);
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          };

          return (
            <div className="absolute inset-0 pointer-events-none z-[26] overflow-hidden">
              {handles.map((h) =>
                h.rrExpandOverlayId ? (
                  <div
                    key={h.key}
                    data-no-marquee="true"
                    title="Drag left / right to resize position width"
                    onMouseDown={(e) => startRrHorizontalExpand(e, h.rrExpandOverlayId!)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ left: `${h.x}px`, top: `${h.y}px` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 w-[18px] h-[18px] flex items-center justify-center pointer-events-auto cursor-ew-resize group"
                  >
                    <span className="w-[11px] h-[11px] bg-white border-[2px] border-[#2962ff] rounded-full shadow-sm group-hover:scale-125 transition-transform" />
                  </div>
                ) : (
                  <div
                    key={h.key}
                    style={{ left: `${h.x}px`, top: `${h.y}px` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 w-[10px] h-[10px] bg-white border-[2px] border-[#2962ff] shadow-sm ${
                      h.shape === 'square' ? 'rounded-[2px]' : 'rounded-full'
                    }`}
                  />
                )
              )}
            </div>
          );
        })()}

      {/* Ctrl + Drag Blue Translucent Multi-Select Marquee Box */}
      {marqueeBox && (
        <div
          className="absolute pointer-events-none z-[25]"
          style={{
            left: `${Math.min(marqueeBox.startX, marqueeBox.curX)}px`,
            top: `${Math.min(marqueeBox.startY, marqueeBox.curY)}px`,
            width: `${Math.abs(marqueeBox.curX - marqueeBox.startX)}px`,
            height: `${Math.abs(marqueeBox.curY - marqueeBox.startY)}px`,
            backgroundColor: 'rgba(41, 98, 255, 0.22)',
            border: '1px solid #2962ff',
          }}
        />
      )}

      {/* Interactive On-Chart Position/Pending Drag Layer + Visual SL/TP Zone + Quick '+' Alert */}
      <InteractiveTradeLayer
        chartRef={chartRef}
        containerRef={containerRef}
        coordTick={coordTick}
        yAxisWidth={axisDims.yAxisWidth}
        selectedTradeKey={selectedTradeKey}
        setSelectedTradeKey={(k) => {
          setSelectedTradeKey(k);
          if (!k) setPosEditor(null);
        }}
        onSelectTrade={openPositionEditor}
        entryDraft={entryDraft}
        slDraft={slDraft}
        tpDraft={tpDraft}
        setEntryDraft={setEntryDraft}
        setSlDraft={setSlDraft}
        setTpDraft={setTpDraft}
        hoverCursor={hoverCursor}
        dragActiveRef={dragActiveRef}
        cancelDragRef={cancelDragRef}
      />

      {/* Pick-on-Chart Banner */}
      {pickMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded bg-[#2962ff] text-white text-[11.5px] font-medium shadow-tv">
          <Crosshair className="w-3.5 h-3.5" />
          <span>Click on chart to pick {pickMode.toUpperCase()} price (Esc / Right-click to cancel)</span>
        </div>
      )}

      {/* TradingView-Style Y-Axis Split Price Pills (Ask, Bid, Symbol | Countdown) — Aligned Exact to Y-Axis Divider */}
      {(() => {
        const pills: YAxisPillItem[] = [];
        const showBA = chartSettings.showBidAskLines && !replay.isActive;
        const showCd = chartSettings.showCountdown && !replay.isActive;

        if (showBA && (yMarkers.bidY !== null || yMarkers.askY !== null)) {
          const anchorBidY = Math.max(24, yMarkers.bidY ?? yMarkers.lastY ?? 40);
          const rawAskY = Math.max(12, yMarkers.askY ?? anchorBidY - 20);
          // Bidirectional anti-overlap: keep Bid exact on candle close, push Ask UP if spread < 20px, lock Symbol|Countdown 1px BELOW Bid!
          const resolvedBidY = anchorBidY;
          const resolvedAskY = Math.min(rawAskY, resolvedBidY - 20);
          const resolvedCdY = resolvedBidY + 20;

          if (yMarkers.askPrice !== null) {
            pills.push({
              id: 'ask',
              rawY: rawAskY,
              resolvedY: resolvedAskY,
              h: 19,
              priceText: formatPriceTag(yMarkers.askPrice, digits),
              tagLabel: chartSettings.showBidAskLabels ? 'Ask' : undefined,
              bgColor: chartSettings.askLineColor,
              textColor: getContrastTextColor(chartSettings.askLineColor),
              zIndex: 14,
            });
          }
          if (yMarkers.bidPrice !== null) {
            pills.push({
              id: 'bid',
              rawY: anchorBidY,
              resolvedY: resolvedBidY,
              h: 19,
              priceText: formatPriceTag(yMarkers.bidPrice, digits),
              tagLabel: chartSettings.showBidAskLabels ? 'Bid' : undefined,
              bgColor: chartSettings.bidLineColor,
              textColor: getContrastTextColor(chartSettings.bidLineColor),
              zIndex: 15,
            });
          }
          if (showCd) {
            const cdBg = chartSettings.bidLineColor;
            pills.push({
              id: 'last',
              rawY: resolvedCdY,
              resolvedY: resolvedCdY,
              h: 19,
              priceText: countdown,
              tagLabel: chartSettings.showSymbolOnPriceLabel ? symbol : undefined,
              bgColor: cdBg,
              textColor: getContrastTextColor(cdBg),
              zIndex: 15,
            });
          }
        } else if (yMarkers.lastY !== null && yMarkers.lastPrice !== null) {
          const h = showCd ? 30 : 19;
          pills.push({
            id: 'last',
            rawY: Math.max(18, yMarkers.lastY),
            resolvedY: Math.max(18, yMarkers.lastY),
            h,
            priceText: formatPriceTag(yMarkers.lastPrice, digits),
            subText: showCd ? countdown : undefined,
            tagLabel: chartSettings.showSymbolOnPriceLabel ? symbol : undefined,
            bgColor: yMarkers.lastColor,
            textColor: getContrastTextColor(yMarkers.lastColor),
            zIndex: 15,
          });
        }

        return pills.map((p) => (
          <div
            key={p.id}
            className="absolute right-0 -translate-y-1/2 pointer-events-none flex items-stretch"
            style={{ top: `${p.resolvedY}px`, zIndex: p.zIndex }}
          >
            {/* Left Tag inside Chart Area (1px gap right on Y-Axis vertical divider!) */}
            {p.tagLabel && (
              <div
                className="px-1.5 flex items-center justify-center rounded-l-[3px] text-[10.5px] font-semibold tracking-tight whitespace-nowrap shadow-sm"
                style={{
                  backgroundColor: p.bgColor,
                  color: p.textColor,
                  height: `${p.h}px`,
                  marginRight: '1px',
                }}
              >
                {p.tagLabel}
              </div>
            )}
            {/* Right Price Box inside Y-Axis Column (exact width = yAxisWidth - 1, left-aligned with scale numbers!) */}
            <div
              className={`px-1.5 font-mono-num flex flex-col justify-center items-start shadow-sm ${
                p.tagLabel ? 'rounded-r-[3px]' : 'rounded-[3px]'
              }`}
              style={{
                width: `${Math.max(48, axisDims.yAxisWidth - 1)}px`,
                height: `${p.h}px`,
                backgroundColor: p.bgColor,
                color: p.textColor,
              }}
            >
              <div className="text-[11px] font-bold leading-none tracking-tight">
                {p.priceText}
              </div>
              {p.subText && (
                <div className="text-[10px] font-semibold leading-none mt-[2px] opacity-95">
                  {p.subText}
                </div>
              )}
            </div>
          </div>
        ));
      })()}

      {/* Scroll to Last Bar Button (Bottom-Right Corner of Chart Canvas) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          chartRef.current?.scrollToRealTime(200);
          setIsScrolledAway(false);
        }}
        title="Scroll to Last Bar"
        style={{
          right: `${axisDims.yAxisWidth + 12}px`,
          bottom: `${axisDims.xAxisHeight + 12}px`,
        }}
        className={`absolute z-20 w-8 h-8 rounded-full flex items-center justify-center border shadow-tv transition-all cursor-pointer ${
          isScrolledAway
            ? 'bg-[#1e222d]/95 border-[#2962ff] text-[#2962ff] hover:bg-[#2962ff] hover:text-white opacity-100'
            : 'bg-[#1e222d]/80 border-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39] opacity-75 hover:opacity-100'
        }`}
      >
        <ChevronsRight className="w-4 h-4" />
      </button>

      {/* Bottom-Right Chart Settings Gear under Y-Axis (Pixel-perfect aligned to KLineCharts Y-Axis & X-Axis) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setChartSettingsModalOpen(true);
        }}
        title="Chart Settings"
        style={{
          width: `${axisDims.yAxisWidth}px`,
          height: `${axisDims.xAxisHeight}px`,
          backgroundColor: chartSettings.canvasBgColor,
        }}
        className="absolute right-0 bottom-0 z-20 flex items-center justify-center hover:bg-[#2a2e39]/70 border-t border-l border-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc] transition-colors cursor-pointer"
      >
        <Settings className="w-3.5 h-3.5" />
      </button>

      {/* Interactive Running Position / Pending Order SL/TP Editor Popover (Draggable) */}
      {posEditor && (
        <div
          ref={posEditorRef}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={
            posEditorPos
              ? { left: `${posEditorPos.x}px`, top: `${posEditorPos.y}px` }
              : { right: `${axisDims.yAxisWidth + 16}px`, top: '64px' }
          }
          className="absolute z-30 w-[300px] rounded-md bg-[#1e222d] border border-[#2a2e39] shadow-tv overflow-hidden text-[12px]"
        >
          {/* Draggable Header */}
          <div
            onMouseDown={handlePosEditorDragStart}
            title="Drag to move panel"
            className="flex items-center justify-between px-3 py-2 bg-[#131722] border-b border-[#2a2e39] cursor-grab active:cursor-grabbing select-none"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <GripHorizontal className="w-3.5 h-3.5 text-[#787b86] shrink-0" />
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  posEditor.isPending
                    ? 'bg-[#2962ff]/20 text-[#2962ff]'
                    : posEditor.side === 'BUY'
                    ? 'bg-[#089981]/20 text-[#089981]'
                    : 'bg-[#f23645]/20 text-[#f23645]'
                }`}
              >
                {posEditor.isPending ? posEditor.orderType.replace('_', ' ') : posEditor.side}
              </span>
              <span className="font-mono-num font-semibold text-[#d1d4dc]">
                {posEditor.volume.toFixed(2)} {posEditor.symbol}
              </span>
              <span className="text-[10px] text-[#787b86]">
                {posEditor.mode === 'paper' ? 'PAPER' : `#${posEditor.id}`}
              </span>
            </div>
            <button
              onClick={() => {
                setSelectedTradeKey(null);
                setPosEditor(null);
                setPickMode(null);
              }}
              className="p-0.5 rounded text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-3 space-y-3">
            {/* Entry & Floating PnL (or Editable Entry for Pending Order) */}
            {posEditor.isPending ? (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium text-[#2962ff]">
                    Pending Entry Price (Drag on Chart or Type)
                  </span>
                </div>
                <input
                  type="number"
                  step={symbolInfo.point || 0.01}
                  value={entryDraft}
                  onChange={(e) => setEntryDraft(e.target.value)}
                  className="w-full h-7 px-2 rounded bg-[#131722] border border-[#2a2e39] text-[#d1d4dc] font-mono-num text-[12px] focus:outline-none focus:border-[#2962ff]"
                />
              </div>
            ) : (
              <div className="flex items-center justify-between text-[11px] px-2 py-1.5 rounded bg-[#131722] border border-[#2a2e39]">
                <div>
                  <span className="text-[#787b86]">Entry: </span>
                  <span className="font-mono-num text-[#d1d4dc] font-medium">
                    {posEditor.entryPrice.toFixed(digits)}
                  </span>
                </div>
                <div
                  className={`font-mono-num font-bold ${
                    activeEditorProfit >= 0 ? 'text-[#089981]' : 'text-[#f23645]'
                  }`}
                >
                  {activeEditorProfit >= 0 ? '+' : '-'}${Math.abs(activeEditorProfit).toFixed(2)}
                </div>
              </div>
            )}

            {/* Stop Loss Controls */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-[#f23645]">Stop Loss (SL)</span>
                {slPipsDist !== null && (
                  <span className="text-[10px] font-mono-num text-[#787b86]">
                    {Number(slPipsDist) >= 0 ? `+${slPipsDist}` : slPipsDist} pips
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step={symbolInfo.point || 0.01}
                  value={slDraft}
                  onChange={(e) => setSlDraft(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 h-7 px-2 rounded bg-[#131722] border border-[#2a2e39] text-[#d1d4dc] font-mono-num text-[12px] focus:outline-none focus:border-[#f23645]"
                />
                <button
                  onClick={() => setPickMode(pickMode === 'sl' ? null : 'sl')}
                  title="Pick SL price directly on chart"
                  className={`h-7 px-2 rounded border text-[10.5px] flex items-center gap-1 cursor-pointer ${
                    pickMode === 'sl'
                      ? 'bg-[#f23645] border-[#f23645] text-white'
                      : 'bg-[#131722] border-[#2a2e39] text-[#d1d4dc] hover:bg-[#2a2e39]'
                  }`}
                >
                  <Crosshair className="w-3 h-3" />
                  <span>Pick</span>
                </button>
              </div>
              <div className="flex items-center gap-1 mt-1.5">
                <button
                  onClick={() => applyQuickSlPips(0)}
                  className="flex-1 py-0.5 rounded bg-[#2a2e39] hover:bg-[#363a45] text-[#d1d4dc] text-[10px] font-medium cursor-pointer"
                >
                  BE
                </button>
                <button
                  onClick={() => applyQuickSlPips(20)}
                  className="flex-1 py-0.5 rounded bg-[#2a2e39] hover:bg-[#363a45] text-[#d1d4dc] text-[10px] font-mono-num cursor-pointer"
                >
                  -20p
                </button>
                <button
                  onClick={() => applyQuickSlPips(50)}
                  className="flex-1 py-0.5 rounded bg-[#2a2e39] hover:bg-[#363a45] text-[#d1d4dc] text-[10px] font-mono-num cursor-pointer"
                >
                  -50p
                </button>
                <button
                  onClick={() => setSlDraft('')}
                  className="px-2 py-0.5 rounded bg-[#131722] border border-[#2a2e39] hover:text-[#f23645] text-[#787b86] text-[10px] cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Take Profit Controls */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-[#089981]">Take Profit (TP)</span>
                {tpPipsDist !== null && (
                  <span className="text-[10px] font-mono-num text-[#787b86]">
                    {Number(tpPipsDist) >= 0 ? `+${tpPipsDist}` : tpPipsDist} pips
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step={symbolInfo.point || 0.01}
                  value={tpDraft}
                  onChange={(e) => setTpDraft(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 h-7 px-2 rounded bg-[#131722] border border-[#2a2e39] text-[#d1d4dc] font-mono-num text-[12px] focus:outline-none focus:border-[#089981]"
                />
                <button
                  onClick={() => setPickMode(pickMode === 'tp' ? null : 'tp')}
                  title="Pick TP price directly on chart"
                  className={`h-7 px-2 rounded border text-[10.5px] flex items-center gap-1 cursor-pointer ${
                    pickMode === 'tp'
                      ? 'bg-[#089981] border-[#089981] text-white'
                      : 'bg-[#131722] border-[#2a2e39] text-[#d1d4dc] hover:bg-[#2a2e39]'
                  }`}
                >
                  <Crosshair className="w-3 h-3" />
                  <span>Pick</span>
                </button>
              </div>
              <div className="flex items-center gap-1 mt-1.5">
                <button
                  onClick={() => applyQuickTpRR(1)}
                  className="flex-1 py-0.5 rounded bg-[#2a2e39] hover:bg-[#363a45] text-[#d1d4dc] text-[10px] font-mono-num cursor-pointer"
                >
                  1:1
                </button>
                <button
                  onClick={() => applyQuickTpRR(2)}
                  className="flex-1 py-0.5 rounded bg-[#2a2e39] hover:bg-[#363a45] text-[#d1d4dc] text-[10px] font-mono-num cursor-pointer"
                >
                  1:2
                </button>
                <button
                  onClick={() => applyQuickTpRR(3)}
                  className="flex-1 py-0.5 rounded bg-[#2a2e39] hover:bg-[#363a45] text-[#d1d4dc] text-[10px] font-mono-num cursor-pointer"
                >
                  1:3
                </button>
                <button
                  onClick={() => applyQuickTpPips(50)}
                  className="flex-1 py-0.5 rounded bg-[#2a2e39] hover:bg-[#363a45] text-[#d1d4dc] text-[10px] font-mono-num cursor-pointer"
                >
                  +50p
                </button>
                <button
                  onClick={() => setTpDraft('')}
                  className="px-1.5 py-0.5 rounded bg-[#131722] border border-[#2a2e39] hover:text-[#f23645] text-[#787b86] text-[10px] cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-1 border-t border-[#2a2e39]">
              <button
                onClick={handleSubmitPosEditor}
                disabled={isSubmittingPos}
                className="flex-1 h-8 rounded bg-[#2962ff] hover:bg-[#1e53e5] disabled:opacity-50 text-white font-semibold text-[11.5px] cursor-pointer"
              >
                {isSubmittingPos ? 'Saving...' : 'Update SL / TP'}
              </button>
              <button
                onClick={handleClosePosFromEditor}
                disabled={isSubmittingPos}
                className="h-8 px-3 rounded bg-[#f23645]/15 hover:bg-[#f23645]/25 border border-[#f23645]/40 text-[#f23645] font-semibold text-[11.5px] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Indicator */}
      {isLoadingCandles && (
        <div className="absolute inset-0 bg-[#131722]/60 flex items-center justify-center z-20 pointer-events-none">
          <div className="flex items-center gap-2 px-3 py-2 rounded bg-[#1e222d] border border-[#2a2e39] text-[12px] text-[#d1d4dc]">
            <Loader2 className="w-4 h-4 animate-spin text-[#2962ff]" />
            <span>Loading {symbol} ({timeframe})...</span>
          </div>
        </div>
      )}

      {/* Bar Replay Scissor Cut Overlay */}
      {replay.isActive && replay.isSelectingCut && scissorHover && (
        <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
          <div
            className="absolute top-0 bottom-0 right-0"
            style={{
              left: `${scissorHover.x}px`,
              backgroundColor: 'rgba(19, 23, 34, 0.55)',
            }}
          />
          <div
            className="absolute top-0 bottom-0"
            style={{
              left: `${scissorHover.x}px`,
              borderLeft: '2px dashed #2962ff',
            }}
          >
            <div className="mt-14 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#2962ff] text-white text-[11px] font-medium whitespace-nowrap shadow-tv">
              <Scissors className="w-3.5 h-3.5" />
              <span>
                Click to start replay here
                {(() => {
                  const ts = replay.allCandles[scissorHover.dataIndex]?.timestamp;
                  if (!ts) return '';
                  try {
                    const fmt = new Intl.DateTimeFormat('en-GB', {
                      timeZone: timezone,
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    }).format(new Date(ts));
                    return ` · ${fmt}`;
                  } catch {
                    return '';
                  }
                })()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bar Replay Toolbar */}
      <ReplayToolbar />

      {/* TradingView Right-Click Chart Context Menu + Order Ticket + Table View */}
      <ChartContextMenu
        menu={contextMenu}
        onClose={() => setContextMenu(null)}
        lockedCursorTs={lockedCursorTs}
        onToggleLockedCursor={setLockedCursorTs}
        copiedClipboard={copiedClipboard}
        onCopyPrice={handleCopyPrice}
        onPaste={handlePasteFromClipboard}
        onOpenOrderDialog={(price) => setOrderDialogPrice(price)}
        onOpenTableView={() => setTableViewOpen(true)}
      />
      <ChartOrderTicketModal
        initialPrice={orderDialogPrice}
        onClose={() => setOrderDialogPrice(null)}
      />
      <ChartTableViewModal open={tableViewOpen} onClose={() => setTableViewOpen(false)} />
    </div>
  );
};
