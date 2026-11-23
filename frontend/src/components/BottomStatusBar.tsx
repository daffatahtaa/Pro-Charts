import React, { useEffect, useRef, useState } from 'react';
import { Clock, Check, History, Calendar, Newspaper } from 'lucide-react';
import { useChartStore } from '../store/useChartStore';
import { getTimeframeSeconds, TIMEZONE_OPTIONS } from '../types/chart';

const RANGES = [
  { label: '1D', seconds: 86400 },
  { label: '5D', seconds: 86400 * 5 },
  { label: '1M', seconds: 86400 * 30 },
  { label: 'All', seconds: 0 },
];

export const BottomStatusBar: React.FC = () => {
  const {
    timeframe,
    candles,
    logScale,
    toggleLogScale,
    autoScale,
    timezone,
    setTimezone,
    chartSettings,
    updateChartSettings,
    setChartSettingsModalOpen,
    chartNewsEvents,
    replay,
    bridge,
  } = useChartStore();

  const [clock, setClock] = useState('');
  const [tzOpen, setTzOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpDate, setJumpDate] = useState('2024-01-01');
  const tzRef = useRef<HTMLDivElement>(null);
  const jumpRef = useRef<HTMLDivElement>(null);

  const selectedTz =
    TIMEZONE_OPTIONS.find((t) => t.id === timezone) || TIMEZONE_OPTIONS[1];

  useEffect(() => {
    const tick = () => {
      try {
        const formatted = new Intl.DateTimeFormat('en-GB', {
          timeZone: selectedTz.id,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(new Date());
        setClock(`${formatted} (${selectedTz.shortLabel})`);
      } catch {
        setClock(new Date().toISOString().slice(11, 19) + ' (UTC)');
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [selectedTz]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tzRef.current && !tzRef.current.contains(e.target as Node)) {
        setTzOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleRangeClick = (seconds: number) => {
    if (seconds === 0) {
      bridge.setVisibleRangeBars?.(Math.min(candles.length || 300, 400));
      return;
    }
    const tfSec = getTimeframeSeconds(timeframe);
    const bars = Math.max(20, Math.round(seconds / tfSec));
    bridge.setVisibleRangeBars?.(bars);
  };

  return (
    <footer className="h-[28px] bg-[#1e222d] border-t border-[#2a2e39] px-3 flex items-center justify-between text-[11px] shrink-0 z-20">
      {/* Left: Quick Date Ranges + Deep History Loader */}
      <div className="flex items-center gap-1">
        {RANGES.map((r) => (
          <button
            key={r.label}
            onClick={() => handleRangeClick(r.seconds)}
            className="px-2 h-[22px] rounded text-[#d1d4dc] hover:bg-[#2a2e39] transition-colors"
          >
            {r.label}
          </button>
        ))}

        <div className="w-[1px] h-3.5 bg-[#2a2e39] mx-1" />

        <button
          onClick={() => bridge.loadMoreDeepHistory?.(5000)}
          title="Load 5,000 deeper historical bars from MT5"
          className="flex items-center gap-1 px-2 h-[22px] rounded text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39] transition-colors"
        >
          <History className="w-3 h-3" />
          <span className="hidden sm:inline">+5k History</span>
        </button>

        <div className="relative" ref={jumpRef}>
          <button
            onClick={() => setJumpOpen((v) => !v)}
            title="Jump to Historical Date"
            className="flex items-center gap-1 px-2 h-[22px] rounded text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39] transition-colors"
          >
            <Calendar className="w-3 h-3" />
            <span className="hidden md:inline">Go to</span>
          </button>
          {jumpOpen && (
            <div className="absolute left-0 bottom-[30px] p-2.5 w-56 bg-[#1e222d] border border-[#2a2e39] rounded shadow-tv z-50 space-y-2">
              <div className="text-[10.5px] uppercase tracking-wider text-[#787b86]">
                Jump to Date (MT5 Deep History)
              </div>
              <input
                type="date"
                value={jumpDate}
                onChange={(e) => setJumpDate(e.target.value)}
                className="w-full px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[12px] text-white outline-none"
              />
              <button
                onClick={() => {
                  bridge.jumpToDate?.(jumpDate);
                  setJumpOpen(false);
                }}
                className="w-full py-1 rounded bg-[#2962ff] hover:bg-[#1e53e5] text-white text-[11.5px] font-medium"
              >
                Load &amp; Jump
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right: News Quick Toggle + TradingView Timezone Picker + Scale Toggles */}
      <div className="flex items-center gap-2">
        {(() => {
          const newsEnabled = chartSettings.showChartNews !== false;
          const nowRef = replay.isActive && replay.replayTimeMs > 0 ? replay.replayTimeMs : Date.now();
          const upcoming = chartNewsEvents.find((e) => e.event_time_ms >= nowRef);
          const minsAway = upcoming ? Math.max(1, Math.round((upcoming.event_time_ms - nowRef) / 60000)) : null;
          const cdText =
            minsAway !== null
              ? minsAway >= 1440
                ? `${Math.floor(minsAway / 1440)}d`
                : minsAway >= 60
                ? `${Math.floor(minsAway / 60)}h ${minsAway % 60}m`
                : `${minsAway}m`
              : '';
          return (
            <button
              onClick={() => updateChartSettings({ showChartNews: !newsEnabled })}
              onContextMenu={(e) => {
                e.preventDefault();
                setChartSettingsModalOpen(true);
              }}
              title="Toggle Economic Events on Chart (Right-click for News Settings)"
              className={`flex items-center gap-1 px-2 h-[22px] rounded transition-colors cursor-pointer ${
                newsEnabled
                  ? 'text-[#d1d4dc] bg-[#2962ff]/12 hover:bg-[#2962ff]/20'
                  : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]'
              }`}
            >
              <Newspaper className="w-3 h-3 text-[#2962ff]" />
              {newsEnabled && upcoming ? (
                <span className="flex items-center gap-1 text-[10.5px]">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      upcoming.impact === 'high'
                        ? 'bg-[#f23645]'
                        : upcoming.impact === 'medium'
                        ? 'bg-[#f59e0b]'
                        : 'bg-[#eab308]'
                    }`}
                  />
                  <span className="font-semibold">{upcoming.country}</span>
                  <span className="hidden xl:inline truncate max-w-[90px] text-[#9598a1]">
                    {upcoming.title}
                  </span>
                  <span className="font-mono-num text-[#f59e0b]">{cdText}</span>
                </span>
              ) : (
                <span className="text-[10.5px]">Events</span>
              )}
            </button>
          );
        })()}

        <div className="w-[1px] h-3.5 bg-[#2a2e39]" />

        <div className="relative" ref={tzRef}>
          <button
            onClick={() => setTzOpen((v) => !v)}
            title="Select Chart & Clock Timezone"
            className="flex items-center gap-1.5 px-2 h-[22px] rounded font-mono-num text-[#d1d4dc] hover:bg-[#2a2e39] transition-colors"
          >
            <Clock className="w-3 h-3 text-[#787b86]" />
            <span>{clock}</span>
          </button>

          {tzOpen && (
            <div className="absolute right-0 bottom-[30px] w-64 bg-[#1e222d] border border-[#2a2e39] rounded shadow-tv py-1 z-50 max-h-72 overflow-y-auto">
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-[#787b86] border-b border-[#2a2e39]">
                Timezone (X-Axis & Clock)
              </div>
              {TIMEZONE_OPTIONS.map((opt) => {
                const active = opt.id === selectedTz.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setTimezone(opt.id);
                      setTzOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-[11.5px] flex items-center justify-between hover:bg-[#2a2e39] ${
                      active ? 'text-[#2962ff] bg-[#2962ff]/10 font-medium' : 'text-[#d1d4dc]'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {active && <Check className="w-3.5 h-3.5 text-[#2962ff]" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="w-[1px] h-3.5 bg-[#2a2e39]" />

        {Math.abs((chartSettings.uiScale || 1) - 1) > 0.01 && (
          <button
            onClick={() => setChartSettingsModalOpen(true)}
            title="Active UI Scale (click to adjust in Chart Settings)"
            className="px-1.5 h-[22px] rounded font-mono-num text-[10.5px] text-[#2962ff] bg-[#2962ff]/15 hover:bg-[#2962ff]/25 transition-colors"
          >
            {Math.round((chartSettings.uiScale || 1) * 100)}%
          </button>
        )}

        <button
          onClick={toggleLogScale}
          title="Toggle Logarithmic Scale"
          className={`px-1.5 h-[22px] rounded font-medium transition-colors ${
            logScale ? 'text-[#2962ff] bg-[#2962ff]/15' : 'text-[#787b86] hover:text-[#d1d4dc]'
          }`}
        >
          log
        </button>

        <button
          onClick={() => {
            bridge.setYAxisAutoScale?.(!autoScale);
          }}
          title="Auto Fits Data to Screen (Turn off for Free Move)"
          className={`px-1.5 h-[22px] rounded font-medium transition-colors cursor-pointer ${
            autoScale ? 'text-[#2962ff] bg-[#2962ff]/15' : 'text-[#787b86] hover:text-[#d1d4dc]'
          }`}
        >
          auto
        </button>
      </div>
    </footer>
  );
};
