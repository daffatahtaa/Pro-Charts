import React, { useEffect, useMemo, useState } from 'react';
import { Chart } from 'klinecharts';
import { Calendar, Clock, ExternalLink, Newspaper, Zap } from 'lucide-react';
import { api } from '../services/api';
import { useChartStore } from '../store/useChartStore';
import { EconomicEventItem, NewsImpactLevel } from '../types/chart';

interface ChartNewsOverlayProps {
  chartRef: React.RefObject<Chart | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  yAxisWidth: number;
  xAxisHeight: number;
  coordTick: number;
}

interface EventCluster {
  key: string;
  x: number;
  maxImpact: NewsImpactLevel;
  events: EconomicEventItem[];
  isUpcomingPill?: boolean;
}

const IMPACT_RANK: Record<NewsImpactLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const IMPACT_COLORS: Record<NewsImpactLevel, { bg: string; border: string; text: string; label: string }> = {
  high: { bg: '#f23645', border: '#f23645', text: '#ffffff', label: 'High' },
  medium: { bg: '#f59e0b', border: '#f59e0b', text: '#131722', label: 'Med' },
  low: { bg: '#eab308', border: '#eab308', text: '#131722', label: 'Low' },
};

function formatCountdownShort(diffMs: number): string {
  const absSec = Math.floor(Math.abs(diffMs) / 1000);
  const days = Math.floor(absSec / 86400);
  const hrs = Math.floor((absSec % 86400) / 3600);
  const mins = Math.floor((absSec % 3600) / 60);
  const body =
    days > 0 ? `${days}d ${hrs}h` : hrs > 0 ? `${hrs}h ${mins}m` : `${Math.max(1, mins)}m`;
  return diffMs >= 0 ? `in ${body}` : `${body} ago`;
}

function formatEventTime(tsMs: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(tsMs));
  } catch {
    return new Date(tsMs).toISOString().slice(5, 16).replace('T', ' ');
  }
}

function parseNumericVal(s: string): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[%KMBT,\s]/gi, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export const ChartNewsOverlay: React.FC<ChartNewsOverlayProps> = ({
  chartRef,
  containerRef,
  yAxisWidth,
  xAxisHeight,
  coordTick,
}) => {
  const {
    symbol,
    candles,
    chartSettings,
    timezone,
    replay,
    chartNewsEvents,
    setChartNews,
  } = useChartStore();

  const [hoveredClusterKey, setHoveredClusterKey] = useState<string | null>(null);
  const [pinnedClusterKey, setPinnedClusterKey] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Tick countdown clock once every 30s
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);

  const showNews = chartSettings.showChartNews !== false;
  const impactsKey = (chartSettings.newsImpacts || ['high', 'medium']).join(',');
  const scope = chartSettings.newsScope || 'correlated';
  const customCurrKey = (chartSettings.newsCustomCurrencies || ['USD', 'EUR', 'GBP', 'JPY']).join(',');
  const showCal = chartSettings.newsShowCalendar !== false;
  const showHeadlines = Boolean(chartSettings.newsShowHeadlines);

  // Fetch cached pair-correlated events whenever symbol or filter params change
  useEffect(() => {
    if (!showNews) return;
    let cancelled = false;
    const types: string[] = [];
    if (showCal) types.push('calendar');
    if (showHeadlines) types.push('news');
    if (types.length === 0) {
      setChartNews([], [], '');
      return;
    }

    api
      .getChartNews({
        symbol,
        scope,
        currencies: scope === 'custom' ? customCurrKey.split(',').filter(Boolean) : undefined,
        impacts: impactsKey.split(',').filter(Boolean),
        eventTypes: types,
      })
      .then((res) => {
        if (!cancelled) {
          setChartNews(res.events || [], res.resolved_currencies || [], res.correlation_label || '');
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [symbol, showNews, scope, impactsKey, customCurrKey, showCal, showHeadlines, setChartNews]);

  // Reference clock: respects Bar Replay clock for zero-lookahead backtesting!
  const refNowMs = replay.isActive && replay.replayTimeMs > 0 ? replay.replayTimeMs : nowMs;
  const timeMode = chartSettings.newsTimeMode || 'all';

  const { clusters, nextUpcoming } = useMemo(() => {
    void coordTick;
    const chart = chartRef.current;
    const el = containerRef.current;
    if (!showNews || !chart || !el || chartNewsEvents.length === 0) {
      return { clusters: [] as EventCluster[], nextUpcoming: [] as EconomicEventItem[] };
    }

    const dataList = chart.getDataList() || [];
    if (dataList.length === 0) {
      return { clusters: [] as EventCluster[], nextUpcoming: [] as EconomicEventItem[] };
    }

    const usableW = Math.max(80, el.clientWidth - yAxisWidth);
    const firstBarTs = dataList[0].timestamp;
    const lastBarTs = dataList[dataList.length - 1].timestamp;

    const filtered = chartNewsEvents.filter((ev) => {
      if (timeMode === 'upcoming' && ev.event_time_ms < refNowMs - 60_000) {
        return false;
      }
      return true;
    });

    const mapped: Array<{ x: number; ev: EconomicEventItem }> = [];
    const upcomingBeyondChart: EconomicEventItem[] = [];

    for (const ev of filtered) {
      if (ev.event_time_ms > lastBarTs) {
        if (ev.event_time_ms >= refNowMs - 60_000) {
          upcomingBeyondChart.push(ev);
        }
        continue;
      }
      if (ev.event_time_ms < firstBarTs) continue;

      // Binary search nearest candle bar <= ev.event_time_ms
      let lo = 0;
      let hi = dataList.length - 1;
      let best = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (dataList[mid].timestamp <= ev.event_time_ms) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      try {
        const raw: any = chart.convertToPixel(
          { timestamp: dataList[best].timestamp },
          { paneId: 'candle_pane' }
        );
        const pt = Array.isArray(raw) ? raw[0] : raw;
        if (pt && typeof pt.x === 'number' && Number.isFinite(pt.x)) {
          if (pt.x >= 12 && pt.x <= usableW - 12) {
            mapped.push({ x: pt.x, ev });
          }
        }
      } catch {}
    }

    // Cluster overlapping events within 18px horizontally
    mapped.sort((a, b) => a.x - b.x);
    const built: EventCluster[] = [];
    for (const item of mapped) {
      const prev = built[built.length - 1];
      if (prev && Math.abs(item.x - prev.x) <= 18) {
        prev.events.push(item.ev);
        if (IMPACT_RANK[item.ev.impact] > IMPACT_RANK[prev.maxImpact]) {
          prev.maxImpact = item.ev.impact;
        }
      } else {
        built.push({
          key: `cl_${item.ev.id}`,
          x: item.x,
          maxImpact: item.ev.impact,
          events: [item.ev],
        });
      }
    }

    return {
      clusters: built,
      nextUpcoming: upcomingBeyondChart.slice(0, 6),
    };
  }, [showNews, chartNewsEvents, candles.length, coordTick, yAxisWidth, refNowMs, timeMode, chartRef, containerRef]);

  if (!showNews) return null;

  const activeClusterKey = pinnedClusterKey || hoveredClusterKey;
  const activeCluster: EventCluster | null =
    activeClusterKey === '__next_upcoming__' && nextUpcoming.length > 0
      ? {
          key: '__next_upcoming__',
          x: Math.max(120, (containerRef.current?.clientWidth ?? 800) - yAxisWidth - 52),
          maxImpact: nextUpcoming.reduce<NewsImpactLevel>(
            (acc, e) => (IMPACT_RANK[e.impact] > IMPACT_RANK[acc] ? e.impact : acc),
            'low'
          ),
          events: nextUpcoming,
          isUpcomingPill: true,
        }
      : clusters.find((c) => c.key === activeClusterKey) || null;

  const usableW = Math.max(240, (containerRef.current?.clientWidth ?? 800) - yAxisWidth);
  const popoverLeft = activeCluster
    ? Math.max(8, Math.min(usableW - 318, activeCluster.x - 155))
    : 8;

  return (
    <div
      data-no-marquee="true"
      className="absolute inset-0 pointer-events-none z-[18] overflow-hidden"
    >
      {/* Optional Vertical Hover Guideline aligned to the event candle */}
      {activeCluster &&
        !activeCluster.isUpcomingPill &&
        chartSettings.newsShowGuidelineOnHover !== false && (
          <div
            className="absolute top-0 pointer-events-none"
            style={{
              left: `${activeCluster.x}px`,
              bottom: `${xAxisHeight}px`,
              borderLeft: `1px dashed ${IMPACT_COLORS[activeCluster.maxImpact].border}`,
              opacity: 0.65,
            }}
          />
        )}

      {/* Pinned Event Cluster Icons Along Bottom Edge (Above X-Axis) */}
      {clusters.map((cl) => {
        const theme = IMPACT_COLORS[cl.maxImpact];
        const isSelected = activeClusterKey === cl.key;
        const firstCurr = cl.events[0]?.country || 'USD';
        const isHeadlineOnly = cl.events.every((e) => e.category === 'news');
        return (
          <button
            key={cl.key}
            type="button"
            onMouseEnter={() => setHoveredClusterKey(cl.key)}
            onMouseLeave={() => setHoveredClusterKey((cur) => (cur === cl.key ? null : cur))}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setPinnedClusterKey((cur) => (cur === cl.key ? null : cl.key));
            }}
            style={{
              left: `${cl.x}px`,
              bottom: `${xAxisHeight + 5}px`,
              borderColor: theme.border,
              backgroundColor: isSelected ? theme.bg : '#1e222d',
              color: isSelected ? theme.text : '#d1d4dc',
            }}
            title={`${cl.events.length} event(s) — click to inspect`}
            className="absolute -translate-x-1/2 pointer-events-auto flex items-center justify-center w-[22px] h-[22px] rounded-full border-[1.5px] shadow-tv transition-transform hover:scale-110 cursor-pointer"
          >
            {isHeadlineOnly ? (
              <Newspaper className="w-3 h-3" style={{ color: isSelected ? theme.text : theme.bg }} />
            ) : (
              <span className="text-[8.5px] font-bold tracking-tighter leading-none">
                {firstCurr.slice(0, 2)}
              </span>
            )}
            {cl.events.length > 1 && (
              <span
                className="absolute -top-1.5 -right-1.5 min-w-[13px] h-[13px] px-0.5 rounded-full text-[8.5px] font-mono-num font-bold flex items-center justify-center shadow"
                style={{ backgroundColor: theme.bg, color: theme.text }}
              >
                {cl.events.length}
              </span>
            )}
          </button>
        );
      })}

      {/* Compact Right-Edge "Next Event" Pill for Upcoming Releases Beyond Rightmost Candle */}
      {nextUpcoming.length > 0 && (() => {
        const first = nextUpcoming[0];
        const theme = IMPACT_COLORS[first.impact];
        const isSelected = activeClusterKey === '__next_upcoming__';
        return (
          <button
            type="button"
            onMouseEnter={() => setHoveredClusterKey('__next_upcoming__')}
            onMouseLeave={() =>
              setHoveredClusterKey((cur) => (cur === '__next_upcoming__' ? null : cur))
            }
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setPinnedClusterKey((cur) =>
                cur === '__next_upcoming__' ? null : '__next_upcoming__'
              );
            }}
            style={{
              right: `${yAxisWidth + 8}px`,
              bottom: `${xAxisHeight + 5}px`,
              borderColor: isSelected ? theme.border : '#363a45',
            }}
            className="absolute pointer-events-auto flex items-center gap-1.5 px-2 h-[22px] rounded-full bg-[#1e222d]/95 hover:bg-[#2a2e39] border text-[10px] text-[#d1d4dc] shadow-tv cursor-pointer"
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: theme.bg }}
            />
            <span className="font-semibold text-white">{first.country}</span>
            <span className="truncate max-w-[110px] text-[#9598a1]">{first.title}</span>
            <span className="font-mono-num text-[#f59e0b]">
              {formatCountdownShort(first.event_time_ms - refNowMs)}
            </span>
          </button>
        );
      })()}

      {/* TradingView-style Event Detail Popover */}
      {activeCluster && (
        <div
          onMouseEnter={() => setHoveredClusterKey(activeCluster.key)}
          onMouseLeave={() => setHoveredClusterKey(null)}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            left: `${popoverLeft}px`,
            bottom: `${xAxisHeight + 34}px`,
          }}
          className="absolute w-[310px] max-h-[260px] overflow-y-auto pointer-events-auto rounded-md bg-[#1e222d] border border-[#363a45] shadow-2xl p-2.5 text-[11.5px] text-[#d1d4dc] z-30 space-y-2"
        >
          <div className="flex items-center justify-between border-b border-[#2a2e39] pb-1.5">
            <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-[#787b86]">
              <Calendar className="w-3.5 h-3.5 text-[#2962ff]" />
              <span>
                {activeCluster.isUpcomingPill
                  ? `Upcoming Events (${activeCluster.events.length})`
                  : `${formatEventTime(activeCluster.events[0].event_time_ms, timezone)}`}
              </span>
            </div>
            {pinnedClusterKey && (
              <button
                type="button"
                onClick={() => setPinnedClusterKey(null)}
                className="text-[10px] text-[#787b86] hover:text-white cursor-pointer"
              >
                Close
              </button>
            )}
          </div>

          {activeCluster.events.map((ev) => {
            const theme = IMPACT_COLORS[ev.impact];
            const isMaskedForReplay = replay.isActive && ev.event_time_ms > refNowMs;
            const actualDisplay = isMaskedForReplay ? '—' : ev.actual || '—';
            const actNum = isMaskedForReplay ? null : parseNumericVal(ev.actual);
            const fcNum = parseNumericVal(ev.forecast);
            const actualColor =
              actNum !== null && fcNum !== null
                ? actNum > fcNum
                  ? 'text-[#089981]'
                  : actNum < fcNum
                  ? 'text-[#f23645]'
                  : 'text-white'
                : 'text-white';

            return (
              <div
                key={ev.id}
                className="p-2 rounded bg-[#131722]/75 border border-[#2a2e39] space-y-1.5"
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="px-1.5 py-0.2 rounded text-[9.5px] font-bold shrink-0"
                      style={{ backgroundColor: theme.bg, color: theme.text }}
                    >
                      {ev.country}
                    </span>
                    <span className="font-semibold text-white leading-tight truncate">
                      {ev.title}
                    </span>
                  </div>
                  <span
                    className="text-[9.5px] uppercase font-semibold shrink-0"
                    style={{ color: theme.bg }}
                  >
                    {theme.label}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[10px] text-[#787b86]">
                  <span className="flex items-center gap-1 font-mono-num">
                    <Clock className="w-3 h-3" />
                    {formatEventTime(ev.event_time_ms, timezone)} ·{' '}
                    <span className={ev.event_time_ms >= refNowMs ? 'text-[#f59e0b]' : ''}>
                      {formatCountdownShort(ev.event_time_ms - refNowMs)}
                    </span>
                  </span>
                  {ev.url && (
                    <a
                      href={ev.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#2962ff] hover:underline flex items-center gap-0.5"
                    >
                      <span>Source</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>

                {ev.category === 'calendar' && (
                  <div className="grid grid-cols-3 gap-1 pt-1 border-t border-[#2a2e39]/60 font-mono-num text-[10.5px]">
                    <div>
                      <div className="text-[9px] text-[#787b86] font-sans">Actual</div>
                      <div className={`font-semibold ${actualColor}`}>
                        {actualDisplay}
                        {isMaskedForReplay && (
                          <span className="ml-1 text-[8.5px] font-sans text-[#f59e0b]">(Replay)</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-[#787b86] font-sans">Forecast</div>
                      <div className="text-[#d1d4dc]">{ev.forecast || '—'}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-[#787b86] font-sans">Previous</div>
                      <div className="text-[#9598a1]">{ev.previous || '—'}</div>
                    </div>
                  </div>
                )}

                {ev.category === 'news' && (
                  <div className="flex items-center gap-1 text-[10px] text-[#787b86]">
                    <Zap className="w-3 h-3 text-[#f59e0b]" />
                    <span>{ev.source || 'Market Headline'}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
