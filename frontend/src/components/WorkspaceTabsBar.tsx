import React, { useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { api } from '../services/api';
import { useChartStore } from '../store/useChartStore';

function getSymbolBadge(sym: string): { text: string; bg: string } {
  const u = (sym || '').toUpperCase();
  if (u.startsWith('BTC')) return { text: '₿', bg: '#f7931a' };
  if (u.startsWith('ETH')) return { text: 'Ξ', bg: '#627eea' };
  if (u.startsWith('XAU') || u.startsWith('GOLD')) return { text: 'Au', bg: '#f59e0b' };
  if (u.startsWith('XAG') || u.startsWith('SILVER')) return { text: 'Ag', bg: '#94a3b8' };
  if (
    u.startsWith('US30') ||
    u.startsWith('NAS') ||
    u.startsWith('USTEC') ||
    u.startsWith('SPX') ||
    u.startsWith('US500') ||
    u.startsWith('GER') ||
    u.startsWith('DE40')
  ) {
    return { text: u.slice(0, 2), bg: '#2962ff' };
  }
  return { text: u.slice(0, 2) || 'FX', bg: '#089981' };
}

function formatTabPrice(val: number, digits = 2): string {
  return val.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export const WorkspaceTabsBar: React.FC = () => {
  const workspaceTabs = useChartStore((s) => s.workspaceTabs);
  const activeTabId = useChartStore((s) => s.activeTabId);
  const addWorkspaceTab = useChartStore((s) => s.addWorkspaceTab);
  const switchWorkspaceTab = useChartStore((s) => s.switchWorkspaceTab);
  const closeWorkspaceTab = useChartStore((s) => s.closeWorkspaceTab);
  const setSymbolModalOpen = useChartStore((s) => s.setSymbolModalOpen);
  const liveTick = useChartStore((s) => s.liveTick);
  const candles = useChartStore((s) => s.candles);
  const symbolInfo = useChartStore((s) => s.symbolInfo);
  const watchlistTicks = useChartStore((s) => s.watchlistTicks);
  const setWatchlistTicks = useChartStore((s) => s.setWatchlistTicks);

  // Poll ticks for background tab symbols that might not be in the watchlist
  useEffect(() => {
    const syms = Array.from(
      new Set(workspaceTabs.filter((t) => !t.isNewTab).map((t) => t.symbol))
    );
    if (syms.length === 0) return;
    let cancelled = false;
    const poll = () => {
      api
        .getTicks(syms)
        .then((ticks) => {
          if (!cancelled && ticks.length > 0) setWatchlistTicks(ticks);
        })
        .catch(() => {});
    };
    poll();
    const timer = window.setInterval(poll, 3500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [workspaceTabs, setWatchlistTicks]);

  // Alt+N shortcut to open a new workspace tab
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        addWorkspaceTab();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [addWorkspaceTab]);

  return (
    <div className="h-[34px] bg-[#0b0e14] border-b border-[#2a2e39] flex items-end px-1.5 gap-1 overflow-x-auto no-scrollbar select-none shrink-0 z-30">
      {workspaceTabs.map((tab) => {
        const isActive = tab.id === activeTabId;

        if (tab.isNewTab) {
          return (
            <div
              key={tab.id}
              onClick={() => {
                switchWorkspaceTab(tab.id);
                setSymbolModalOpen(true);
              }}
              className={`group flex items-center justify-between min-w-[140px] max-w-[200px] h-[27px] px-3 rounded-t-md text-[12px] cursor-pointer transition-colors shrink-0 ${
                isActive
                  ? 'bg-[#1e222d] text-white font-medium border-t border-x border-[#2a2e39]'
                  : 'bg-[#131722]/60 text-[#787b86] hover:bg-[#1e222d]/60 hover:text-[#d1d4dc]'
              }`}
            >
              <span className="truncate">New tab</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeWorkspaceTab(tab.id);
                }}
                title="Close tab"
                className="p-0.5 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        }

        const snap = watchlistTicks[tab.symbol];
        let price = snap?.bid ?? 0;
        let digits = snap?.digits ?? (isActive ? symbolInfo.digits ?? 2 : 2);
        let changePct = snap?.change_pct ?? 0;

        if (isActive) {
          const liveP = liveTick?.bid ?? candles[candles.length - 1]?.close;
          if (typeof liveP === 'number' && liveP > 0) price = liveP;
          digits = symbolInfo.digits ?? digits;
          if (snap?.change_pct !== undefined) {
            changePct = snap.change_pct;
          } else if (candles.length > 0 && candles[0].open > 0 && price > 0) {
            changePct = ((price - candles[0].open) / candles[0].open) * 100;
          }
        }

        const isUp = changePct >= 0;
        const badge = getSymbolBadge(tab.symbol);

        return (
          <div
            key={tab.id}
            onClick={() => switchWorkspaceTab(tab.id)}
            className={`group flex items-center gap-2 h-[28px] px-2.5 rounded-t-md cursor-pointer transition-colors shrink-0 ${
              isActive
                ? 'bg-[#1e222d] text-white border-t border-x border-[#2a2e39]'
                : 'bg-[#131722]/60 text-[#787b86] hover:bg-[#1e222d]/70 hover:text-[#d1d4dc]'
            }`}
          >
            {/* Symbol Icon Badge */}
            <span
              className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9.5px] font-bold text-white shrink-0"
              style={{ backgroundColor: badge.bg }}
            >
              {badge.text}
            </span>

            {/* Symbol Name */}
            <span className="font-bold text-[12px] tracking-tight whitespace-nowrap">
              {tab.symbol}
            </span>

            {/* Direction Triangle + Live Price + % Change */}
            {price > 0 && (
              <div className="flex items-center gap-1.5 font-mono-num text-[11.5px] whitespace-nowrap">
                <span className={isUp ? 'text-[#089981] text-[9px]' : 'text-[#f23645] text-[9px]'}>
                  {isUp ? '▲' : '▼'}
                </span>
                <span className={isActive ? 'text-white font-medium' : 'text-[#d1d4dc]'}>
                  {formatTabPrice(price, digits)}
                </span>
                <span className={`font-medium ${isUp ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                  {isUp ? '+' : ''}
                  {changePct.toFixed(2)}%
                </span>
              </div>
            )}

            {/* Close Tab Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeWorkspaceTab(tab.id);
              }}
              title="Close tab"
              className="ml-0.5 p-0.5 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}

      {/* Divider + New Tab '+' Button */}
      <div className="w-[1px] h-4 bg-[#2a2e39] mx-0.5 mb-1.5 shrink-0" />
      <button
        type="button"
        onClick={addWorkspaceTab}
        title="New Tab (Alt+N)"
        className="w-7 h-7 mb-0.5 rounded flex items-center justify-center text-[#787b86] hover:text-white hover:bg-[#1e222d] transition-colors cursor-pointer shrink-0"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};
