import React, { useCallback, useEffect, useRef, useState } from 'react';
import { init, dispose, Chart, OverlayEvent } from 'klinecharts';
import { api } from '../services/api';
import { marketWs } from '../services/ws';
import { sliceCandlesAtReplayTime } from '../services/replayEngine';
import {
  setOverlayFromPixelConverter,
  setOverlayPixelConverter,
} from '../overlays';
import { useChartStore } from '../store/useChartStore';
import {
  Candle,
  computeHeikinAshi,
  DrawingItem,
  SecondaryPaneId,
  SelectedOverlayInfo,
  Timeframe,
} from '../types/chart';
import { formatTradePrice } from '../utils/formatPrice';

const PANE_TFS: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];

const SYSTEM_OVERLAY_NAMES = new Set([
  'tradePositionLine',
  'bidAskLine',
  'priceAlertLine',
]);

function isSystemOverlay(id: string, name: string): boolean {
  return id.startsWith('sys_') || SYSTEM_OVERLAY_NAMES.has(name);
}

interface SecondaryChartPaneProps {
  paneId: SecondaryPaneId;
}

export const SecondaryChartPane: React.FC<SecondaryChartPaneProps> = ({ paneId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const digitsRef = useRef<number>(2);
  const inProgressOverlayIdRef = useRef<string | null>(null);
  const localMutatingRef = useRef<boolean>(false);

  const {
    symbol,
    activePaneId,
    secondaryPanes,
    setActivePaneId,
    setSecondaryPaneTimeframe,
    setSymbolModalOpen,
    chartType,
    chartSettings,
    timezone,
    drawingsBySymbol,
    setDrawingsForSymbol,
    registerPaneBridge,
    activeTool,
    magnetMode,
    ctrlMagnetPressed,
    drawingsLocked,
    drawingsVisible,
    crosshairData,
    replay,
  } = useChartStore();

  const rawCandlesRef = useRef<Candle[]>([]);

  const paneConfig = secondaryPanes[paneId];
  const paneSymbol = paneConfig?.symbol || 'EURUSD';
  const paneTf = paneConfig?.timeframe || '1h';
  const paneNumber = paneId.replace('pane-', '');
  const isActive = activePaneId === paneId;
  const paneDrawings = drawingsBySymbol[paneSymbol] || [];

  const [syncX, setSyncX] = useState<number | null>(null);
  const [paneTick, setPaneTick] = useState<{
    bid: number;
    ask: number;
    spread_points?: number;
  } | null>(null);
  const [bidAskY, setBidAskY] = useState<{ bidY: number | null; askY: number | null }>({
    bidY: null,
    askY: null,
  });

  const bindPixelConverters = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    setOverlayPixelConverter((pts) => {
      try {
        const res: any = chart.convertToPixel(pts as any, { paneId: 'candle_pane' });
        return Array.isArray(res) ? res : [res];
      } catch {
        return [];
      }
    });
    setOverlayFromPixelConverter((px) => {
      try {
        const res: any = chart.convertFromPixel([px] as any, { paneId: 'candle_pane' });
        return Array.isArray(res) ? res[0] : res;
      } catch {
        return null;
      }
    });
  }, []);

  const serializeSecondaryOverlay = useCallback(
    (overlay: any): DrawingItem | null => {
      if (!overlay || !overlay.id || !overlay.name) return null;
      const id = String(overlay.id);
      const name = String(overlay.name);
      if (isSystemOverlay(id, name)) return null;
      return {
        id,
        symbol: paneSymbol,
        timeframe: paneTf,
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
    },
    [paneSymbol, paneTf]
  );

  const persistSecondaryOverlay = useCallback(
    (overlay: any, recordUndo = false) => {
      const item = serializeSecondaryOverlay(overlay);
      if (!item) return;
      const state = useChartStore.getState();
      const currentList = state.drawingsBySymbol[paneSymbol] || [];
      if (recordUndo) {
        state.pushUndoSnapshot([...currentList]);
      }
      const existingIdx = currentList.findIndex((d) => d.id === item.id);
      let nextItem: DrawingItem = item;
      let nextList: DrawingItem[];
      if (existingIdx >= 0) {
        const prev = currentList[existingIdx];
        nextItem = {
          ...item,
          sort_order: item.sort_order ?? prev.sort_order,
          created_at: item.created_at ?? prev.created_at,
        };
        nextList = currentList.map((d, i) => (i === existingIdx ? nextItem : d));
      } else {
        const maxOrder = currentList.reduce((m, d) => Math.max(m, d.sort_order ?? 0), 0);
        nextItem = {
          ...item,
          sort_order: item.sort_order ?? maxOrder + 1,
          created_at: item.created_at ?? Date.now(),
        };
        nextList = [...currentList, nextItem];
      }
      localMutatingRef.current = true;
      setDrawingsForSymbol(paneSymbol, nextList);
      api.saveDrawing(nextItem).catch(() => {});
      window.setTimeout(() => {
        localMutatingRef.current = false;
      }, 30);
    },
    [paneSymbol, serializeSecondaryOverlay, setDrawingsForSymbol]
  );

  const buildSecondaryOverlayEvents = useCallback(
    () => ({
      onDrawEnd: (event: OverlayEvent) => {
        inProgressOverlayIdRef.current = null;
        const ov: any = event.overlay;
        const st = useChartStore.getState();
        persistSecondaryOverlay(ov, true);

        if (ov && !isSystemOverlay(String(ov.id), String(ov.name))) {
          const lineStyleObj = ov?.styles?.line || {};
          const rawExt = (ov.extendData || {}) as Record<string, any>;
          st.setSelectedOverlay({
            id: String(ov.id),
            name: String(ov.name),
            color: lineStyleObj.color || '#2962ff',
            lineWidth: lineStyleObj.size || 1.5,
            lineStyle: lineStyleObj.style === 'dashed' ? 'dashed' : 'solid',
            locked: Boolean(ov.lock),
            opacity: typeof rawExt.opacity === 'number' ? rawExt.opacity : 1,
            label: String(rawExt.label || ''),
            labelPosition: rawExt.labelPosition || 'top',
          });
        }

        if (st.keepDrawingMode && st.activeTool && st.activePaneId === paneId) {
          const toolName = st.activeTool;
          window.setTimeout(() => {
            const cur = useChartStore.getState();
            if (
              cur.keepDrawingMode &&
              cur.activeTool === toolName &&
              cur.activePaneId === paneId &&
              chartRef.current
            ) {
              const effMagnet = cur.ctrlMagnetPressed ? 'strong_magnet' : cur.magnetMode;
              const newId = chartRef.current.createOverlay({
                name: toolName,
                mode: effMagnet as any,
                lock: cur.drawingsLocked,
                visible: cur.drawingsVisible,
                ...(toolName === 'iconStamp'
                  ? { extendData: { iconGlyph: cur.activeIconGlyph } }
                  : {}),
                ...buildSecondaryOverlayEvents(),
              });
              inProgressOverlayIdRef.current = typeof newId === 'string' ? newId : null;
            }
          }, 15);
        } else {
          st.setActiveTool(null);
        }
        return false;
      },
      onPressedMoveEnd: (event: OverlayEvent) => {
        const movedOv: any = event.overlay;
        const st = useChartStore.getState();
        if (!movedOv || movedOv.lock || st.drawingsLocked) return false;
        persistSecondaryOverlay(movedOv, false);
        return false;
      },
      onSelected: (event: OverlayEvent) => {
        const ov: any = event.overlay;
        if (!ov || isSystemOverlay(String(ov.id), String(ov.name))) return false;
        setActivePaneId(paneId);
        const lineStyleObj = ov?.styles?.line || {};
        const rawExt = (ov.extendData || {}) as Record<string, any>;
        const info: SelectedOverlayInfo = {
          id: String(ov.id),
          name: String(ov.name),
          color: lineStyleObj.color || '#2962ff',
          lineWidth: lineStyleObj.size || 1,
          lineStyle: lineStyleObj.style === 'dashed' ? 'dashed' : 'solid',
          locked: Boolean(ov.lock),
          opacity: typeof rawExt.opacity === 'number' ? rawExt.opacity : 1,
          label: String(rawExt.label || ''),
          labelPosition: rawExt.labelPosition || 'top',
        };
        useChartStore.getState().setSelectedOverlay(info);
        return false;
      },
      onDeselected: () => {
        if (useChartStore.getState().activePaneId === paneId) {
          useChartStore.getState().setSelectedOverlay(null);
        }
        return false;
      },
      onDoubleClick: (event: OverlayEvent) => {
        const ov: any = event.overlay;
        if (!ov || isSystemOverlay(String(ov.id), String(ov.name))) return false;
        setActivePaneId(paneId);
        useChartStore.getState().setDrawingSettingsOverlayId(String(ov.id));
        return true;
      },
      onRightClick: (event: OverlayEvent) => {
        const ov: any = event.overlay;
        if (!ov || isSystemOverlay(String(ov.id), String(ov.name))) return true;
        setActivePaneId(paneId);
        return true;
      },
    }),
    [paneId, persistSecondaryOverlay, setActivePaneId]
  );

  // Sync pixel converters whenever this secondary pane becomes active
  useEffect(() => {
    if (isActive) {
      bindPixelConverters();
    }
  }, [isActive, bindPixelConverters]);

  // Crosshair Time Sync from primary ChartContainer
  useEffect(() => {
    const chart = chartRef.current;
    const ts = crosshairData?.candle?.timestamp;
    if (!chart || !ts) {
      setSyncX(null);
      return;
    }
    const list = chart.getDataList();
    if (list.length === 0) {
      setSyncX(null);
      return;
    }
    let bestTs = list[0].timestamp;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].timestamp <= ts) {
        bestTs = list[i].timestamp;
        break;
      }
    }
    try {
      const pt = chart.convertToPixel({ timestamp: bestTs }, { paneId: 'candle_pane' }) as any;
      const xVal = Array.isArray(pt) ? pt[0]?.x : pt?.x;
      setSyncX(typeof xVal === 'number' && xVal >= 0 ? xVal : null);
    } catch {
      setSyncX(null);
    }
  }, [crosshairData?.candle?.timestamp]);

  // Initialize KLineCharts instance & register per-pane bridge
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = init(el);
    if (!chart) return;
    chartRef.current = chart;

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);

    return () => {
      ro.disconnect();
      dispose(el);
      chartRef.current = null;
    };
  }, []);

  // Register imperative drawing bridge for this secondary pane so Floating Bar / Settings / Object Tree work seamlessly!
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    registerPaneBridge(paneId, {
      resetChartScale: () => {
        chart.setBarSpace(8);
        chart.scrollToRealTime();
      },
      updateSelectedOverlayStyle: (patch) => {
        const sel = useChartStore.getState().selectedOverlay;
        if (!sel) return;
        const next: SelectedOverlayInfo = { ...sel, ...patch };
        const ovBefore: any = chart.getOverlayById(sel.id);
        const overridePayload: any = {
          id: sel.id,
          lock: next.locked,
          styles: {
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
          },
        };
        if (patch.opacity !== undefined) {
          const prevExt =
            ovBefore?.extendData && typeof ovBefore.extendData === 'object'
              ? ovBefore.extendData
              : {};
          overridePayload.extendData = { ...prevExt, opacity: patch.opacity };
        }
        chart.overrideOverlay(overridePayload);
        useChartStore.getState().setSelectedOverlay(next);
        const ov = chart.getOverlayById(sel.id);
        if (ov) persistSecondaryOverlay(ov, false);
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
        if (updatedOv) persistSecondaryOverlay(updatedOv, false);
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
        if (updatedOv && persist) {
          persistSecondaryOverlay(updatedOv, false);
        }
      },
      getOverlayPoints: (id) => {
        const ov = chart.getOverlayById(id);
        return (ov?.points || []).map((p: any) => ({
          timestamp: p.timestamp,
          dataIndex: p.dataIndex,
          value: p.value,
        }));
      },
      getOverlayExtendData: (id) => {
        const ov = chart.getOverlayById(id);
        return (ov?.extendData as Record<string, any>) || {};
      },
      toggleSingleOverlayLock: (id) => {
        const st = useChartStore.getState();
        const list = st.drawingsBySymbol[paneSymbol] || [];
        const target = list.find((d) => d.id === id);
        if (!target) return;
        const nextLocked = !target.locked;
        chart.overrideOverlay({ id, lock: st.drawingsLocked || nextLocked });
        const ov: any = chart.getOverlayById(id);
        if (ov) {
          ov.lock = nextLocked;
          persistSecondaryOverlay(ov, false);
        }
        if (st.selectedOverlay?.id === id) {
          st.setSelectedOverlay({ ...st.selectedOverlay, locked: nextLocked });
        }
      },
      toggleSingleOverlayVisible: (id) => {
        const st = useChartStore.getState();
        const list = st.drawingsBySymbol[paneSymbol] || [];
        const target = list.find((d) => d.id === id);
        if (!target) return;
        const nextVis = !target.visible;
        chart.overrideOverlay({ id, visible: st.drawingsVisible && nextVis });
        const ov: any = chart.getOverlayById(id);
        if (ov) {
          ov.visible = nextVis;
          persistSecondaryOverlay(ov, false);
        }
      },
      deleteSelectedOverlay: () => {
        const st = useChartStore.getState();
        const sel = st.selectedOverlay;
        if (!sel) return;
        const list = st.drawingsBySymbol[paneSymbol] || [];
        const target = list.find((d) => d.id === sel.id);
        const liveOv: any = chart.getOverlayById(sel.id);
        if (st.drawingsLocked || target?.locked || sel.locked || liveOv?.lock) {
          st.showToast('info', 'Drawing is locked — unlock it first to delete');
          return;
        }
        chart.removeOverlay({ id: sel.id });
        api.deleteDrawing(sel.id).catch(() => {});
        setDrawingsForSymbol(
          paneSymbol,
          list.filter((d) => d.id !== sel.id)
        );
        st.setSelectedOverlay(null);
      },
      deleteSingleOverlay: (id) => {
        const st = useChartStore.getState();
        const list = st.drawingsBySymbol[paneSymbol] || [];
        const target = list.find((d) => d.id === id);
        const liveOv: any = chart.getOverlayById(id);
        if (st.drawingsLocked || target?.locked || liveOv?.lock) {
          st.showToast('info', 'Drawing is locked — unlock it first to delete');
          return;
        }
        chart.removeOverlay({ id });
        api.deleteDrawing(id).catch(() => {});
        setDrawingsForSymbol(
          paneSymbol,
          list.filter((d) => d.id !== id)
        );
        if (st.selectedOverlay?.id === id) st.setSelectedOverlay(null);
      },
      selectOverlayById: (id) => {
        const ov: any = chart.getOverlayById(id);
        if (!ov) return;
        const lineStyleObj = ov?.styles?.line || {};
        const rawExt = (ov.extendData || {}) as Record<string, any>;
        useChartStore.getState().setSelectedOverlay({
          id: String(ov.id),
          name: String(ov.name),
          color: lineStyleObj.color || '#2962ff',
          lineWidth: lineStyleObj.size || 1,
          lineStyle: lineStyleObj.style === 'dashed' ? 'dashed' : 'solid',
          locked: Boolean(ov.lock),
          opacity: typeof rawExt.opacity === 'number' ? rawExt.opacity : 1,
          label: String(rawExt.label || ''),
          labelPosition: rawExt.labelPosition || 'top',
        });
      },
    });
  }, [paneId, paneSymbol, persistSecondaryOverlay, registerPaneBridge, setDrawingsForSymbol]);

  // Apply theme styles & timezone
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const mappedType =
      chartType === 'heikin_ashi'
        ? 'candle_solid'
        : chartType === 'line' || chartType === 'baseline'
        ? 'area'
        : chartType;

    chart.setStyles({
      grid: {
        show: chartSettings.showGridHoriz || chartSettings.showGridVert,
        horizontal: {
          show: chartSettings.showGridHoriz,
          size: 1,
          color: chartSettings.gridHorizColor,
          style: 'solid' as any,
        },
        vertical: {
          show: chartSettings.showGridVert,
          size: 1,
          color: chartSettings.gridVertColor,
          style: 'solid' as any,
        },
      },
      candle: {
        type: mappedType as any,
        bar: {
          upColor: chartSettings.bullBodyColor,
          downColor: chartSettings.bearBodyColor,
          upBorderColor: chartSettings.showBorders
            ? chartSettings.bullBorderColor
            : 'transparent',
          downBorderColor: chartSettings.showBorders
            ? chartSettings.bearBorderColor
            : 'transparent',
          upWickColor: chartSettings.showWicks
            ? chartSettings.bullWickColor
            : 'transparent',
          downWickColor: chartSettings.showWicks
            ? chartSettings.bearWickColor
            : 'transparent',
        },
        area: {
          lineSize: 2,
          lineColor: chartType === 'baseline' ? '#089981' : '#2962ff',
          backgroundColor:
            chartType === 'line'
              ? [{ offset: 0, color: 'transparent' }, { offset: 1, color: 'transparent' }]
              : [
                  { offset: 0, color: 'rgba(41, 98, 255, 0.25)' },
                  { offset: 1, color: 'rgba(41, 98, 255, 0.02)' },
                ],
        },
        tooltip: { showRule: 'none' as any },
      },
      xAxis: {
        axisLine: { show: true, color: '#2a2e39', size: 1 },
        tickText: { color: '#787b86', size: Math.round(10 * (chartSettings.uiScale || 1)) },
      },
      yAxis: {
        axisLine: { show: true, color: '#2a2e39', size: 1 },
        tickText: {
          color: '#787b86',
          size: Math.round(10 * (chartSettings.uiScale || 1)),
          family: 'JetBrains Mono, monospace',
        },
      },
      crosshair: {
        show: true,
        horizontal: {
          show: true,
          line: { show: true, style: 'dashed' as any, color: chartSettings.crosshairColor },
        },
        vertical: {
          show: true,
          line: { show: true, style: 'dashed' as any, color: chartSettings.crosshairColor },
        },
      },
    } as any);
    try {
      chart.setTimezone(timezone);
    } catch {}
  }, [chartSettings, chartType, timezone]);

  // Fetch candles for secondary pane (or replay window when Replay is active on same symbol)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    let cancelled = false;
    setPaneTick(null);
    const isSyncedReplay =
      replay.isActive && !replay.isSelectingCut && paneSymbol === symbol && replay.replayTimeMs > 0;
    const req = isSyncedReplay
      ? api.getCandlesWindow(paneSymbol, paneTf, replay.replayTimeMs, 350, 1000)
      : api.getCandles(paneSymbol, paneTf, 500);

    req
      .then((res) => {
        if (cancelled) return;
        digitsRef.current = res.digits;
        rawCandlesRef.current = res.candles;
        chart.setPriceVolumePrecision(res.digits, 0);
        const curReplay = useChartStore.getState().replay;
        const base =
          curReplay.isActive &&
          !curReplay.isSelectingCut &&
          paneSymbol === symbol &&
          curReplay.replayTimeMs > 0
            ? sliceCandlesAtReplayTime(
                res.candles,
                paneTf,
                curReplay.replayTimeMs,
                curReplay.subCandles,
                curReplay.stepTimeframe
              ).visible
            : res.candles;
        const data =
          chartType === 'heikin_ashi' ? computeHeikinAshi(base, res.digits) : base;
        chart.applyNewData(data, isSyncedReplay ? false : res.has_more);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [paneSymbol, paneTf, chartType, replay.isActive, replay.isSelectingCut, symbol]);

  // Fetch saved drawings for paneSymbol if not yet loaded in drawingsBySymbol
  useEffect(() => {
    let cancelled = false;
    const existing = useChartStore.getState().drawingsBySymbol[paneSymbol];
    if (existing !== undefined) return;
    api
      .getDrawings(paneSymbol)
      .then((list) => {
        if (!cancelled) {
          setDrawingsForSymbol(paneSymbol, list);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [paneSymbol, setDrawingsForSymbol]);

  // Synchronize secondary pane with universal replayTimeMs clock (zero lookahead!)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !replay.isActive || replay.isSelectingCut || paneSymbol !== symbol) return;
    if (rawCandlesRef.current.length === 0 || !replay.replayTimeMs) return;
    const { visible } = sliceCandlesAtReplayTime(
      rawCandlesRef.current,
      paneTf,
      replay.replayTimeMs,
      replay.subCandles,
      replay.stepTimeframe
    );
    const data =
      chartType === 'heikin_ashi'
        ? computeHeikinAshi(visible, digitsRef.current)
        : visible;
    chart.applyNewData(data, false);
  }, [
    replay.isActive,
    replay.isSelectingCut,
    replay.replayTimeMs,
    replay.subCandles,
    replay.stepTimeframe,
    paneSymbol,
    paneTf,
    symbol,
    chartType,
  ]);

  // Live tick + Bid/Ask updates for secondary pane (sub-second WS + fallback HTTP poll)
  useEffect(() => {
    const updateTickState = (bid: number, ask: number, spread_points?: number) => {
      if (typeof bid === 'number' && bid > 0) {
        setPaneTick({ bid, ask: typeof ask === 'number' && ask > 0 ? ask : bid, spread_points });
      }
    };

    const offTick = marketWs.onTick((tick) => {
      const st = useChartStore.getState();
      if (st.replay.isActive && paneSymbol === st.symbol) return;
      if (tick.symbol === paneSymbol) {
        updateTickState(tick.bid, tick.ask, tick.spread_points);
        if (tick.tf === paneTf && tick.candle && chartRef.current) {
          chartRef.current.updateData(tick.candle);
        }
      }
    });

    const pollOnce = () => {
      const st = useChartStore.getState();
      if (st.replay.isActive && paneSymbol === st.symbol) return;
      const chart = chartRef.current;
      if (!chart) return;
      api
        .getTicks([paneSymbol])
        .then((ticks) => {
          const t = ticks[0];
          if (!t || !chartRef.current) return;
          if (typeof t.digits === 'number') digitsRef.current = t.digits;
          updateTickState(t.bid, t.ask, t.spread_points);
          const list = chartRef.current.getDataList();
          const last = list[list.length - 1];
          if (!last) return;
          const price = t.bid;
          if (typeof price === 'number' && price > 0) {
            chartRef.current.updateData({
              ...last,
              close: price,
              high: Math.max(last.high, price),
              low: Math.min(last.low, price),
            });
          }
        })
        .catch(() => {});
    };

    pollOnce();
    const timer = window.setInterval(pollOnce, 2000);
    return () => {
      offTick();
      window.clearInterval(timer);
    };
  }, [paneSymbol, paneTf]);

  // Render Bid & Ask horizontal lines + compute Y-axis tag positions (Issue #1)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.removeOverlay({ id: 'sys_bid_line' });
    chart.removeOverlay({ id: 'sys_ask_line' });

    const isSyncedReplay = replay.isActive && paneSymbol === symbol;
    if (!chartSettings.showBidAskLines || isSyncedReplay || !paneTick) {
      setBidAskY({ bidY: null, askY: null });
      return;
    }

    const d = digitsRef.current;
    if (paneTick.bid > 0) {
      chart.createOverlay({
        id: 'sys_bid_line',
        name: 'bidAskLine',
        lock: true,
        onRightClick: () => true,
        points: [{ value: paneTick.bid }],
        extendData: {
          color: chartSettings.bidLineColor,
          label: `BID ${paneTick.bid.toFixed(d)}`,
          dashed: true,
        },
      });
    }
    if (paneTick.ask > 0) {
      chart.createOverlay({
        id: 'sys_ask_line',
        name: 'bidAskLine',
        lock: true,
        onRightClick: () => true,
        points: [{ value: paneTick.ask }],
        extendData: {
          color: chartSettings.askLineColor,
          label: `ASK ${paneTick.ask.toFixed(d)}`,
          dashed: true,
        },
      });
    }

    const toY = (val: number): number | null => {
      try {
        const res: any = chart.convertToPixel({ value: val }, { paneId: 'candle_pane' });
        const pt = Array.isArray(res) ? res[0] : res;
        return pt && typeof pt.y === 'number' && Number.isFinite(pt.y) ? pt.y : null;
      } catch {
        return null;
      }
    };
    setBidAskY({
      bidY: paneTick.bid > 0 ? toY(paneTick.bid) : null,
      askY: paneTick.ask > 0 ? toY(paneTick.ask) : null,
    });
  }, [
    paneTick,
    paneSymbol,
    symbol,
    replay.isActive,
    chartSettings.showBidAskLines,
    chartSettings.bidLineColor,
    chartSettings.askLineColor,
  ]);

  // Interactive cross-pane drawings sync (NOT read-only! Real lock/visible/zLevel & events)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || localMutatingRef.current) return;

    // Remove existing user drawings (preserve sys_bid_line / sys_ask_line and any in-progress draw)
    const st = useChartStore.getState();
    const keepIds = new Set<string>(['sys_bid_line', 'sys_ask_line']);
    if (inProgressOverlayIdRef.current) keepIds.add(inProgressOverlayIdRef.current);

    // Clear stale overlays by fetching current drawings for this symbol cleanly
    const existingDrawings = paneDrawings;
    const events = buildSecondaryOverlayEvents();
    const effectiveMagnet = st.ctrlMagnetPressed ? 'strong_magnet' : st.magnetMode;

    // Remove old non-system overlays not in progress
    try {
      const allOvs: any[] = (chart as any)._chartStore?.getOverlayStore?.()?.getInstances?.('candle_pane') || [];
      for (const ov of allOvs) {
        const oid = String(ov.id);
        if (!keepIds.has(oid) && !isSystemOverlay(oid, String(ov.name))) {
          chart.removeOverlay({ id: oid });
        }
      }
    } catch {
      // Fallback: remove by known IDs
      for (const d of existingDrawings) {
        try {
          chart.removeOverlay({ id: d.id });
        } catch {}
      }
    }

    existingDrawings.forEach((d, idx) => {
      if (d.symbol !== paneSymbol) return;
      try {
        chart.createOverlay({
          id: d.id,
          name: d.name,
          points: d.points,
          styles: d.styles,
          extendData: d.extendData,
          lock: st.drawingsLocked || Boolean(d.locked),
          visible: st.drawingsVisible && d.visible !== false,
          mode: effectiveMagnet as any,
          zLevel: d.sort_order ?? idx + 1,
          ...events,
        });
      } catch {}
    });
  }, [paneDrawings, paneSymbol, drawingsLocked, drawingsVisible, magnetMode, ctrlMagnetPressed, buildSecondaryOverlayEvents]);

  // Activate drawing tool directly on this secondary pane when IT is the focused active pane (Issue #1)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (inProgressOverlayIdRef.current) {
      try {
        chart.removeOverlay({ id: inProgressOverlayIdRef.current });
      } catch {}
      inProgressOverlayIdRef.current = null;
    }
    if (!isActive || !activeTool) return;

    bindPixelConverters();
    const cur = useChartStore.getState();
    const events = buildSecondaryOverlayEvents();
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
  }, [isActive, activeTool, bindPixelConverters, buildSecondaryOverlayEvents]);

  const d = digitsRef.current;

  return (
    <div
      onMouseDownCapture={() => {
        setActivePaneId(paneId);
        bindPixelConverters();
      }}
      onPointerEnter={() => {
        if (isActive) bindPixelConverters();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (inProgressOverlayIdRef.current && chartRef.current) {
          try {
            chartRef.current.removeOverlay({ id: inProgressOverlayIdRef.current });
          } catch {}
          inProgressOverlayIdRef.current = null;
          useChartStore.getState().setActiveTool(null);
        }
      }}
      className={`relative w-full h-full overflow-hidden ${
        isActive
          ? 'ring-2 ring-inset ring-[#2962ff] z-[2]'
          : 'border border-[#2a2e39]'
      }`}
      style={{ backgroundColor: chartSettings.canvasBgColor }}
    >
      {/* Top Active Accent Bar */}
      {isActive && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#2962ff] z-30 pointer-events-none" />
      )}

      {/* Top-Left Pane Header with Unambiguous Pane # Badge + Bid/Ask Spread */}
      <div
        className={`absolute top-1.5 left-2 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] transition-opacity ${
          isActive
            ? 'bg-[#1e222d]/95 border-[#2962ff]/70 opacity-100 shadow-sm'
            : 'bg-[#1e222d]/85 border-[#2a2e39] opacity-75 hover:opacity-100'
        }`}
      >
        <span
          className={`px-1.5 py-0.2 rounded font-mono-num text-[10px] font-bold ${
            isActive ? 'bg-[#2962ff] text-white' : 'bg-[#2a2e39] text-[#787b86]'
          }`}
          title={`Pane ${paneNumber} (Alt+${paneNumber})`}
        >
          #{paneNumber}
          {isActive ? ' ACTIVE' : ''}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setActivePaneId(paneId);
            setSymbolModalOpen(true);
          }}
          title="Click to change symbol for this chart pane"
          className={`font-semibold hover:text-[#2962ff] transition-colors cursor-pointer ${
            isActive ? 'text-white' : 'text-[#d1d4dc]'
          }`}
        >
          {paneSymbol}
        </button>
        <span className="text-[#787b86]">·</span>
        <div className="flex items-center gap-0.5">
          {PANE_TFS.map((tf) => (
            <button
              key={tf}
              onClick={(e) => {
                e.stopPropagation();
                setActivePaneId(paneId);
                setSecondaryPaneTimeframe(paneId, tf);
              }}
              className={`px-1 py-0.5 rounded text-[10px] cursor-pointer ${
                paneTf === tf
                  ? 'bg-[#2962ff]/20 text-[#2962ff] font-semibold'
                  : 'text-[#787b86] hover:text-[#d1d4dc]'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Live Bid / Ask Compact Readout */}
        {paneTick && (
          <div className="hidden lg:flex items-center gap-1 pl-1.5 ml-0.5 border-l border-[#2a2e39] font-mono-num text-[10px]">
            <span style={{ color: chartSettings.bidLineColor }}>
              B:{formatTradePrice(paneTick.bid, d)}
            </span>
            <span className="text-[#787b86]">/</span>
            <span style={{ color: chartSettings.askLineColor }}>
              A:{formatTradePrice(paneTick.ask, d)}
            </span>
          </div>
        )}
      </div>

      {/* Optional Watermark */}
      {chartSettings.showWatermark && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.05] select-none">
          <span className="text-4xl font-bold tracking-widest text-[#d1d4dc]">
            {paneSymbol} · {paneTf}
          </span>
        </div>
      )}

      <div ref={containerRef} className="w-full h-full" />

      {/* Compact Y-Axis Bid / Ask Price Pills on Secondary Pane (Issue #1) */}
      {chartSettings.showBidAskLabels &&
        chartSettings.showBidAskLines &&
        paneTick &&
        !(replay.isActive && paneSymbol === symbol) && (
          <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
            {bidAskY.askY !== null && bidAskY.askY >= 10 && (
              <div
                style={{
                  top: `${bidAskY.askY}px`,
                  backgroundColor: chartSettings.askLineColor,
                }}
                className="absolute right-1 -translate-y-1/2 px-1 py-[1px] rounded text-[9.5px] font-mono-num font-bold text-white shadow-sm"
              >
                Ask {paneTick.ask.toFixed(d)}
              </div>
            )}
            {bidAskY.bidY !== null && bidAskY.bidY >= 10 && (
              <div
                style={{
                  top: `${bidAskY.bidY}px`,
                  backgroundColor: chartSettings.bidLineColor,
                }}
                className="absolute right-1 -translate-y-1/2 px-1 py-[1px] rounded text-[9.5px] font-mono-num font-bold text-white shadow-sm"
              >
                Bid {paneTick.bid.toFixed(d)}
              </div>
            )}
          </div>
        )}

      {/* Synced Crosshair Time Line from Primary Chart */}
      {syncX !== null && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none z-10"
          style={{
            left: `${syncX}px`,
            borderLeft: '1px dashed rgba(41, 98, 255, 0.75)',
          }}
        />
      )}
    </div>
  );
};
