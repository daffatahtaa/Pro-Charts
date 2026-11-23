import React, { useEffect } from 'react';
import { marketWs } from '../services/ws';
import { useChartStore } from '../store/useChartStore';
import { ChartContainer } from './ChartContainer';
import { SecondaryChartPane } from './SecondaryChartPane';

export const MultiChartGrid: React.FC = () => {
  const { layoutMode, activePaneId, setActivePaneId, secondaryPanes, symbol, timeframe } =
    useChartStore();

  // Keep WebSocket subscribed to all visible secondary panes for live Bid/Ask & candle updates
  useEffect(() => {
    if (layoutMode === '1') {
      marketWs.setExtraSubscriptions([]);
      return;
    }
    const visibleSecondaryIds =
      layoutMode === '4'
        ? (['pane-2', 'pane-3', 'pane-4'] as const)
        : (['pane-2'] as const);
    const streams = visibleSecondaryIds.map((pid) => ({
      symbol: secondaryPanes[pid]?.symbol || 'EURUSD',
      tf: secondaryPanes[pid]?.timeframe || '1h',
    }));
    marketWs.setExtraSubscriptions(streams);
    return () => {
      marketWs.setExtraSubscriptions([]);
    };
  }, [layoutMode, secondaryPanes]);

  if (layoutMode === '1') {
    return <ChartContainer />;
  }

  const isPrimaryActive = activePaneId === 'pane-1';
  const primaryClass = `flex min-w-0 min-h-0 overflow-hidden relative ${
    isPrimaryActive
      ? 'ring-2 ring-inset ring-[#2962ff] z-[2]'
      : 'ring-1 ring-inset ring-transparent'
  }`;

  const primaryBadge = (
    <div
      onMouseDownCapture={() => setActivePaneId('pane-1')}
      className={`absolute top-1.5 right-14 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10.5px] font-semibold select-none pointer-events-auto cursor-pointer transition-opacity ${
        isPrimaryActive
          ? 'bg-[#2962ff] border-[#2962ff] text-white shadow-sm opacity-100'
          : 'bg-[#1e222d]/90 border-[#2a2e39] text-[#787b86] opacity-75 hover:opacity-100'
      }`}
      title="Pane 1 (Alt+1)"
    >
      <span className="font-mono-num">#1</span>
      <span>{symbol}</span>
      <span className="opacity-80">· {timeframe}</span>
      {isPrimaryActive && (
        <span className="ml-0.5 px-1 rounded bg-white/20 text-[9px] tracking-wider">ACTIVE</span>
      )}
    </div>
  );

  if (layoutMode === '2v') {
    return (
      <div className="flex-1 grid grid-cols-2 grid-rows-1 min-h-0 overflow-hidden bg-[#2a2e39] gap-[1px]">
        <div className={primaryClass} onMouseDownCapture={() => setActivePaneId('pane-1')}>
          {isPrimaryActive && (
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#2962ff] z-30 pointer-events-none" />
          )}
          {primaryBadge}
          <ChartContainer />
        </div>
        <div className="min-w-0 min-h-0 overflow-hidden">
          <SecondaryChartPane paneId="pane-2" />
        </div>
      </div>
    );
  }

  if (layoutMode === '2h') {
    return (
      <div className="flex-1 grid grid-cols-1 grid-rows-2 min-h-0 overflow-hidden bg-[#2a2e39] gap-[1px]">
        <div className={primaryClass} onMouseDownCapture={() => setActivePaneId('pane-1')}>
          {isPrimaryActive && (
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#2962ff] z-30 pointer-events-none" />
          )}
          {primaryBadge}
          <ChartContainer />
        </div>
        <div className="min-w-0 min-h-0 overflow-hidden">
          <SecondaryChartPane paneId="pane-2" />
        </div>
      </div>
    );
  }

  // 4-Split Grid (2x2)
  return (
    <div className="flex-1 grid grid-cols-2 grid-rows-2 min-h-0 overflow-hidden bg-[#2a2e39] gap-[1px]">
      <div className={primaryClass} onMouseDownCapture={() => setActivePaneId('pane-1')}>
        {isPrimaryActive && (
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#2962ff] z-30 pointer-events-none" />
        )}
        {primaryBadge}
        <ChartContainer />
      </div>
      <div className="min-w-0 min-h-0 overflow-hidden">
        <SecondaryChartPane paneId="pane-2" />
      </div>
      <div className="min-w-0 min-h-0 overflow-hidden">
        <SecondaryChartPane paneId="pane-3" />
      </div>
      <div className="min-w-0 min-h-0 overflow-hidden">
        <SecondaryChartPane paneId="pane-4" />
      </div>
    </div>
  );
};
