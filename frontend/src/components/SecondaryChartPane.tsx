import React, { useEffect, useRef, useState } from 'react';
import { init, dispose, Chart } from 'klinecharts';
import { api } from '../services/api';
import { marketWs } from '../services/ws';
import { sliceCandlesAtReplayTime } from '../services/replayEngine';
import { useChartStore } from '../store/useChartStore';
import { Candle, computeHeikinAshi, SecondaryPaneId, Timeframe } from '../types/chart';

const PANE_TFS: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];

interface SecondaryChartPaneProps {
  paneId: SecondaryPaneId;
}

export const SecondaryChartPane: React.FC<SecondaryChartPaneProps> = ({ paneId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const digitsRef = useRef<number>(2);

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
    drawingsList,
    crosshairData,
    replay,
  } = useChartStore();

  const rawCandlesRef = useRef<Candle[]>([]);

  const paneConfig = secondaryPanes[paneId];
  const paneSymbol = paneConfig?.symbol || 'EURUSD';
  const paneTf = paneConfig?.timeframe || '1h';
  const isActive = activePaneId === paneId;

  const [syncX, setSyncX] = useState<number | null>(null);

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
    // Find nearest bar <= ts
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
        tickText: { color: '#787b86', size: 10 },
      },
      yAxis: {
        axisLine: { show: true, color: '#2a2e39', size: 1 },
        tickText: { color: '#787b86', size: 10, family: 'JetBrains Mono, monospace' },
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
    const isSyncedReplay = replay.isActive && !replay.isSelectingCut && paneSymbol === symbol && replay.replayTimeMs > 0;
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
          curReplay.isActive && !curReplay.isSelectingCut && paneSymbol === symbol && curReplay.replayTimeMs > 0
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

  // Live tick updates for secondary pane (paused during Replay on same symbol)
  useEffect(() => {
    const offTick = marketWs.onTick((tick) => {
      const st = useChartStore.getState();
      if (st.replay.isActive && paneSymbol === st.symbol) return;
      if (tick.symbol === paneSymbol && tick.tf === paneTf && tick.candle && chartRef.current) {
        chartRef.current.updateData(tick.candle);
      }
    });
    const timer = window.setInterval(() => {
      const st = useChartStore.getState();
      if (st.replay.isActive && paneSymbol === st.symbol) return;
      const chart = chartRef.current;
      if (!chart) return;
      api
        .getTicks([paneSymbol])
        .then((ticks) => {
          const t = ticks[0];
          if (!t || !chartRef.current) return;
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
    }, 2000);
    return () => {
      offTick();
      window.clearInterval(timer);
    };
  }, [paneSymbol, paneTf]);

  // Mirror symbol drawings onto secondary pane
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.removeOverlay();
    for (const d of drawingsList) {
      if (d.symbol !== paneSymbol) continue;
      try {
        chart.createOverlay({
          id: `sec_${d.id}`,
          name: d.name,
          points: d.points,
          styles: d.styles,
          extendData: d.extendData,
          lock: true,
          visible: d.visible,
        });
      } catch {}
    }
  }, [drawingsList, paneSymbol]);

  return (
    <div
      onMouseDown={() => setActivePaneId(paneId)}
      className={`relative w-full h-full overflow-hidden ${
        isActive
          ? 'ring-2 ring-inset ring-[#2962ff] z-[2]'
          : 'border border-[#2a2e39]'
      }`}
      style={{ backgroundColor: chartSettings.canvasBgColor }}
    >
      {/* Top-Left Pane Header (Click symbol to change pair for THIS pane only!) */}
      <div className="absolute top-1.5 left-2 z-10 flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#1e222d]/90 border border-[#2a2e39] text-[11px]">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setActivePaneId(paneId);
            setSymbolModalOpen(true);
          }}
          title="Click to change symbol for this chart pane"
          className={`font-semibold hover:text-[#2962ff] transition-colors cursor-pointer ${
            isActive ? 'text-[#2962ff]' : 'text-[#d1d4dc]'
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
