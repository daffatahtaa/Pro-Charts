import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  StepForward,
  StepBack,
  X,
  BarChart3,
  ChevronUp,
  Calendar,
  Flag,
  Dices,
  Loader2,
} from 'lucide-react';
import { useChartStore } from '../store/useChartStore';
import { getAllowedStepTimeframes } from '../services/replayEngine';

const SPEEDS = [
  { label: '0.5x', ms: 2000 },
  { label: '1x', ms: 1000 },
  { label: '2x', ms: 500 },
  { label: '3x', ms: 333 },
  { label: '5x', ms: 200 },
  { label: '10x', ms: 100 },
];

const DATE_PRESETS = [
  { label: '3D ago', days: 3 },
  { label: '1W ago', days: 7 },
  { label: '1M ago', days: 30 },
  { label: '3M ago', days: 90 },
  { label: '6M ago', days: 180 },
  { label: '1Y ago', days: 365 },
];

const BarCutIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="4" y1="3.5" x2="4" y2="16.5" />
    <line x1="8" y1="10" x2="17" y2="10" />
    <polyline points="11.5,6.5 8,10 11.5,13.5" />
  </svg>
);

const JumpRealTimeIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polygon points="4,5.5 11,10 4,14.5" fill="currentColor" />
    <line x1="13.5" y1="5.5" x2="13.5" y2="14.5" />
    <line x1="16.5" y1="5.5" x2="16.5" y2="14.5" />
  </svg>
);

function toLocalDateTimeInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const ReplayToolbar: React.FC = () => {
  const {
    timeframe,
    timezone,
    replay,
    paperAccount,
    defaultLot,
    placePaperOrder,
    setBacktestModalOpen,
    startSelectingCut,
    startReplayFromDate,
    startReplayFromFirstAvailable,
    startReplayFromRandomBar,
    setReplayStepTimeframe,
    toggleReplayPlaying,
    stepReplayForward,
    stepReplayBackward,
    setReplaySpeed,
    exitReplayMode,
  } = useChartStore();

  const toolbarRef = useRef<HTMLDivElement>(null);
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [stepTfMenuOpen, setStepTfMenuOpen] = useState(false);
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [dateDraft, setDateDraft] = useState(() => toLocalDateTimeInput(Date.now() - 30 * 86400_000));

  // Auto-play interval
  useEffect(() => {
    if (!replay.isActive || !replay.isPlaying || replay.isSelectingCut) return;
    const timer = window.setInterval(() => {
      useChartStore.getState().stepReplayForward();
    }, replay.speedMs);
    return () => window.clearInterval(timer);
  }, [replay.isActive, replay.isPlaying, replay.isSelectingCut, replay.speedMs]);

  // Close popovers on outside mousedown
  useEffect(() => {
    if (!startMenuOpen && !speedMenuOpen && !stepTfMenuOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setStartMenuOpen(false);
        setSpeedMenuOpen(false);
        setStepTfMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [startMenuOpen, speedMenuOpen, stepTfMenuOpen]);

  // Keyboard shortcuts: Space / Shift+ArrowDown (Play/Pause), Shift+ArrowRight (+1), Shift+ArrowLeft (-1)
  useEffect(() => {
    if (!replay.isActive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      ) {
        return;
      }
      if (e.code === 'Space' || (e.shiftKey && e.key === 'ArrowDown')) {
        e.preventDefault();
        useChartStore.getState().toggleReplayPlaying();
      } else if (e.shiftKey && e.key === 'ArrowRight') {
        e.preventDefault();
        useChartStore.getState().stepReplayForward();
      } else if (e.shiftKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        useChartStore.getState().stepReplayBackward();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [replay.isActive]);

  if (!replay.isActive) return null;

  const activeSpeed = SPEEDS.find((s) => s.ms === replay.speedMs) || SPEEDS[2];
  const allowedStepTfs = getAllowedStepTimeframes(timeframe);
  const atEnd =
    !replay.hasMoreForward &&
    replay.cutIndex >= Math.max(0, replay.allCandles.length - 1) &&
    (replay.subCandles.length === 0 || replay.subIndex >= replay.subCandles.length - 1);

  const formattedClock = (() => {
    if (!replay.replayTimeMs) return '';
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(replay.replayTimeMs));
    } catch {
      return '';
    }
  })();

  const handleApplyDate = async (e: React.FormEvent) => {
    e.preventDefault();
    const ms = Date.parse(dateDraft);
    if (Number.isNaN(ms)) return;
    await startReplayFromDate(ms);
    setDateModalOpen(false);
  };

  return (
    <>
      <div
        ref={toolbarRef}
        data-no-marquee="true"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#131722]/95 border border-[#2a2e39] shadow-2xl backdrop-blur-md select-none"
      >
        {/* Split Button: [ |← Select bar ] [ ^ ] + SELECT STARTING POINT Popover */}
        <div className="relative flex items-center">
          <button
            onClick={() => {
              setStartMenuOpen(false);
              startSelectingCut();
            }}
            title="Select Starting Bar on Chart"
            className={`flex items-center gap-1.5 px-2.5 h-7 rounded-l text-[12px] font-medium transition-colors cursor-pointer ${
              replay.isSelectingCut
                ? 'bg-[#2962ff] text-white'
                : 'bg-[#1e222d] hover:bg-[#2a2e39] text-[#d1d4dc]'
            }`}
          >
            <BarCutIcon className="w-3.5 h-3.5" />
            <span>Select bar</span>
          </button>
          <button
            onClick={() => {
              setSpeedMenuOpen(false);
              setStepTfMenuOpen(false);
              setStartMenuOpen((v) => !v);
            }}
            title="Select Starting Point"
            className={`px-1.5 h-7 rounded-r border-l border-[#2a2e39] flex items-center justify-center transition-colors cursor-pointer ${
              startMenuOpen
                ? 'bg-[#2962ff] text-white'
                : 'bg-[#1e222d] hover:bg-[#2a2e39] text-[#d1d4dc]'
            }`}
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>

          {startMenuOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-[235px] bg-[#1e222d] border border-[#363a45] rounded-lg shadow-2xl py-2 z-50">
              <div className="px-3.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-[#787b86]">
                SELECT STARTING POINT
              </div>
              <button
                onClick={() => {
                  setStartMenuOpen(false);
                  startSelectingCut();
                }}
                className={`w-full px-3.5 py-2 flex items-center gap-2.5 text-[12.5px] text-left cursor-pointer transition-colors ${
                  replay.isSelectingCut
                    ? 'bg-white text-[#131722] font-semibold'
                    : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
                }`}
              >
                <BarCutIcon className="w-4 h-4 shrink-0" />
                <span>Bar</span>
              </button>
              <button
                onClick={() => {
                  setStartMenuOpen(false);
                  setDateModalOpen(true);
                }}
                className="w-full px-3.5 py-2 flex items-center gap-2.5 text-[12.5px] text-[#d1d4dc] hover:bg-[#2a2e39] text-left cursor-pointer transition-colors"
              >
                <Calendar className="w-4 h-4 shrink-0 text-[#9598a1]" />
                <span>Date...</span>
              </button>
              <button
                onClick={() => {
                  setStartMenuOpen(false);
                  startReplayFromFirstAvailable();
                }}
                className="w-full px-3.5 py-2 flex items-center gap-2.5 text-[12.5px] text-[#d1d4dc] hover:bg-[#2a2e39] text-left cursor-pointer transition-colors"
              >
                <Flag className="w-4 h-4 shrink-0 text-[#9598a1]" />
                <span>First available date</span>
              </button>
              <button
                onClick={() => {
                  setStartMenuOpen(false);
                  startReplayFromRandomBar();
                }}
                className="w-full px-3.5 py-2 flex items-center gap-2.5 text-[12.5px] text-[#d1d4dc] hover:bg-[#2a2e39] text-left cursor-pointer transition-colors"
              >
                <Dices className="w-4 h-4 shrink-0 text-[#9598a1]" />
                <span>Random bar</span>
              </button>
            </div>
          )}
        </div>

        <div className="w-[1px] h-5 bg-[#2a2e39]" />

        {/* Playback Controls */}
        <button
          onClick={toggleReplayPlaying}
          disabled={replay.isSelectingCut || replay.isLoadingReplayData || atEnd}
          title="Play / Pause (Space or Shift+Down)"
          className="w-7 h-7 rounded flex items-center justify-center bg-[#2962ff] hover:bg-[#1e53e5] disabled:opacity-40 text-white transition-colors cursor-pointer"
        >
          {replay.isLoadingReplayData ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : replay.isPlaying ? (
            <Pause className="w-3.5 h-3.5" />
          ) : (
            <Play className="w-3.5 h-3.5 ml-0.5" />
          )}
        </button>

        <button
          onClick={stepReplayBackward}
          disabled={replay.isSelectingCut || replay.isLoadingReplayData || replay.cutIndex <= 20}
          title="Step Backward -1 Bar (Shift + Left Arrow)"
          className="w-7 h-7 rounded flex items-center justify-center text-[#d1d4dc] hover:bg-[#2a2e39] disabled:opacity-35 transition-colors cursor-pointer"
        >
          <StepBack className="w-4 h-4" />
        </button>

        <button
          onClick={stepReplayForward}
          disabled={replay.isSelectingCut || replay.isLoadingReplayData || atEnd}
          title="Step Forward +1 (Shift + Right Arrow)"
          className="w-7 h-7 rounded flex items-center justify-center text-[#d1d4dc] hover:bg-[#2a2e39] disabled:opacity-35 transition-colors cursor-pointer"
        >
          <StepForward className="w-4 h-4" />
        </button>

        {/* Compact Speed Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setStartMenuOpen(false);
              setStepTfMenuOpen(false);
              setSpeedMenuOpen((v) => !v);
            }}
            title="Replay Playback Speed"
            className="px-2 h-7 rounded text-[12px] font-mono-num font-semibold text-[#d1d4dc] hover:bg-[#2a2e39] cursor-pointer transition-colors"
          >
            {activeSpeed.label}
          </button>
          {speedMenuOpen && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-24 bg-[#1e222d] border border-[#363a45] rounded-md shadow-2xl py-1 z-50">
              {SPEEDS.map((s) => (
                <button
                  key={s.ms}
                  onClick={() => {
                    setReplaySpeed(s.ms);
                    setSpeedMenuOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-[12px] font-mono-num cursor-pointer ${
                    replay.speedMs === s.ms
                      ? 'bg-[#2962ff]/20 text-[#2962ff] font-semibold'
                      : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Step Resolution Selector (1h / 15m / 5m / 1m) */}
        <div className="relative">
          <button
            onClick={() => {
              setStartMenuOpen(false);
              setSpeedMenuOpen(false);
              setStepTfMenuOpen((v) => !v);
            }}
            title="Update interval (Intra-bar step resolution)"
            className="px-2 h-7 rounded text-[12px] font-mono-num font-semibold text-[#2962ff] bg-[#2962ff]/12 hover:bg-[#2962ff]/22 cursor-pointer transition-colors"
          >
            {replay.stepTimeframe || timeframe}
          </button>
          {stepTfMenuOpen && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 bg-[#1e222d] border border-[#363a45] rounded-md shadow-2xl py-1.5 z-50">
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#787b86]">
                Update interval (Intra-bar)
              </div>
              {allowedStepTfs.map((tf) => (
                <button
                  key={tf}
                  onClick={() => {
                    setStepTfMenuOpen(false);
                    setReplayStepTimeframe(tf);
                  }}
                  className={`w-full px-3 py-1.5 flex items-center justify-between text-[12px] font-mono-num cursor-pointer ${
                    (replay.stepTimeframe || timeframe) === tf
                      ? 'bg-[#2962ff]/20 text-[#2962ff] font-semibold'
                      : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
                  }`}
                >
                  <span>{tf}</span>
                  {tf === timeframe && (
                    <span className="text-[10px] text-[#787b86]">Chart TF</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-[1px] h-5 bg-[#2a2e39]" />

        {/* Jump to Real-Time (▷||) */}
        <button
          onClick={exitReplayMode}
          title="Jump to Real-Time (Exit Replay Cut)"
          className="w-7 h-7 rounded flex items-center justify-center text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white transition-colors cursor-pointer"
        >
          <JumpRealTimeIcon className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-5 bg-[#2a2e39]" />

        {/* Current Replay Clock Badge */}
        {formattedClock && !replay.isSelectingCut && (
          <span className="hidden lg:inline-block px-1.5 text-[11px] font-mono-num text-[#9598a1] whitespace-nowrap">
            {formattedClock}
          </span>
        )}

        {/* Quick Paper Buy / Sell Buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() =>
              placePaperOrder({
                side: 'SELL',
                order_mode: 'MARKET',
                volume: defaultLot,
                strategy_tag: 'Replay-Quick',
              })
            }
            disabled={replay.isSelectingCut}
            title="Quick Paper SELL at current replay bar"
            className="px-2 h-6 rounded bg-[#f23645] hover:bg-[#d92b3a] disabled:opacity-40 text-white text-[10.5px] font-semibold cursor-pointer"
          >
            Sell
          </button>
          <button
            onClick={() =>
              placePaperOrder({
                side: 'BUY',
                order_mode: 'MARKET',
                volume: defaultLot,
                strategy_tag: 'Replay-Quick',
              })
            }
            disabled={replay.isSelectingCut}
            title="Quick Paper BUY at current replay bar"
            className="px-2 h-6 rounded bg-[#089981] hover:bg-[#07826e] disabled:opacity-40 text-white text-[10.5px] font-semibold cursor-pointer"
          >
            Buy
          </button>
        </div>

        {/* Paper Equity + Strategy Report Button */}
        <div className="hidden md:flex items-center gap-1 text-[11px] font-mono-num px-1">
          <span
            className={
              paperAccount.equity >= paperAccount.startingBalance
                ? 'text-[#089981] font-semibold'
                : 'text-[#f23645] font-semibold'
            }
          >
            ${paperAccount.equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <button
          onClick={() => setBacktestModalOpen(true)}
          title="Open Backtest Strategy Report & AI Telemetry"
          className="flex items-center gap-1 px-2 h-7 rounded bg-[#2962ff]/15 hover:bg-[#2962ff]/25 text-[#2962ff] text-[11px] font-semibold transition-colors cursor-pointer"
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Report</span>
        </button>

        {/* Exit Replay */}
        <button
          onClick={exitReplayMode}
          title="Exit Bar Replay"
          className="p-1 rounded text-[#787b86] hover:bg-[#f23645]/15 hover:text-[#f23645] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Date... Starting Point Modal */}
      {dateModalOpen && (
        <div
          data-no-marquee="true"
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setDateModalOpen(false)}
        >
          <form
            onSubmit={handleApplyDate}
            onClick={(e) => e.stopPropagation()}
            className="w-[360px] bg-[#1e222d] border border-[#363a45] rounded-lg shadow-2xl p-4 space-y-3.5 text-[12px] text-[#d1d4dc]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-[14px] text-white">
                <Calendar className="w-4 h-4 text-[#2962ff]" />
                <span>Select Replay Starting Date</span>
              </div>
              <button
                type="button"
                onClick={() => setDateModalOpen(false)}
                className="p-1 rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() =>
                    setDateDraft(toLocalDateTimeInput(Date.now() - p.days * 86400_000))
                  }
                  className="py-1.5 rounded bg-[#131722] hover:bg-[#2962ff]/20 border border-[#2a2e39] hover:border-[#2962ff]/50 text-[11.5px] font-medium text-[#d1d4dc] cursor-pointer transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-[11px] text-[#787b86] mb-1">
                Target Date &amp; Time
              </label>
              <input
                type="datetime-local"
                required
                value={dateDraft}
                onChange={(e) => setDateDraft(e.target.value)}
                className="w-full px-2.5 py-2 rounded bg-[#131722] border border-[#2a2e39] focus:border-[#2962ff] text-[12.5px] font-mono-num text-white outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDateModalOpen(false)}
                className="px-3 py-1.5 rounded bg-[#2a2e39] hover:bg-[#363a45] text-[#d1d4dc] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={replay.isLoadingReplayData}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-[#2962ff] hover:bg-[#1e53e5] disabled:opacity-50 text-white font-semibold cursor-pointer"
              >
                {replay.isLoadingReplayData && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Go to Date &amp; Start Replay</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};
