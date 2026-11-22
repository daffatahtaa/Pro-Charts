import React from 'react';
import { useChartStore } from '../store/useChartStore';
import { ChartContainer } from './ChartContainer';
import { SecondaryChartPane } from './SecondaryChartPane';

export const MultiChartGrid: React.FC = () => {
  const { layoutMode, activePaneId, setActivePaneId } = useChartStore();

  if (layoutMode === '1') {
    return <ChartContainer />;
  }

  const primaryClass = `flex min-w-0 min-h-0 overflow-hidden relative ${
    activePaneId === 'pane-1'
      ? 'ring-2 ring-inset ring-[#2962ff] z-[2]'
      : 'ring-1 ring-inset ring-transparent'
  }`;

  if (layoutMode === '2v') {
    return (
      <div className="flex-1 grid grid-cols-2 grid-rows-1 min-h-0 overflow-hidden bg-[#2a2e39] gap-[1px]">
        <div className={primaryClass} onMouseDown={() => setActivePaneId('pane-1')}>
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
        <div className={primaryClass} onMouseDown={() => setActivePaneId('pane-1')}>
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
      <div className={primaryClass} onMouseDown={() => setActivePaneId('pane-1')}>
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
