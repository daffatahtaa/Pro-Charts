import React, { useRef, useState } from 'react';
import {
  GripVertical,
  TrendingUp,
  Minus,
  SlidersHorizontal,
  Square,
  ArrowUpRight,
  ArrowDownRight,
  Ruler,
  Type,
  MoveUpRight,
  SeparatorVertical,
  GitCommitHorizontal,
} from 'lucide-react';
import { useChartStore } from '../store/useChartStore';

const TOOL_META: Record<string, { label: string; icon: React.ReactNode }> = {
  segment: { label: 'Trendline (Alt+T)', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  rayLine: { label: 'Ray', icon: <MoveUpRight className="w-3.5 h-3.5" /> },
  infoLine: { label: 'Info line', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  straightLine: { label: 'Extended line', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  trendAngle: { label: 'Trend angle', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  horizontalStraightLine: { label: 'Horizontal line (Alt+H)', icon: <Minus className="w-3.5 h-3.5" /> },
  horizontalRayLine: { label: 'Horizontal ray (Alt+J)', icon: <Minus className="w-3.5 h-3.5" /> },
  verticalStraightLine: { label: 'Vertical line (Alt+V)', icon: <SeparatorVertical className="w-3.5 h-3.5" /> },
  crossLine: { label: 'Crossline (Alt+C)', icon: <GitCommitHorizontal className="w-3.5 h-3.5" /> },
  priceLine: { label: 'Price Line', icon: <GitCommitHorizontal className="w-3.5 h-3.5" /> },
  parallelStraightLine: { label: 'Parallel channel', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  regressionTrend: { label: 'Regression trend', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  flatTopBottom: { label: 'Flat top/bottom', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  disjointChannel: { label: 'Disjoint channel', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  pitchfork: { label: 'Pitchfork', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  schiffPitchfork: { label: 'Schiff pitchfork', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  modifiedSchiffPitchfork: { label: 'Modified Schiff pitchfork', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  insidePitchfork: { label: 'Inside pitchfork', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  fibonacciLine: { label: 'Fib retracement (Alt+F)', icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
  fibExtension: { label: 'Trend-based fib extension', icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
  fibChannel: { label: 'Fib channel', icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
  fibTimeZone: { label: 'Fib time zone', icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
  fibSpeedResistanceFan: { label: 'Fib speed resistance fan', icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
  trendBasedFibTime: { label: 'Trend-based fib time', icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
  fibCircles: { label: 'Fib circles', icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
  fibSpiral: { label: 'Fib spiral', icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
  fibSpeedResistanceArcs: { label: 'Fib speed resistance arcs', icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
  fibWedge: { label: 'Fib wedge', icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
  pitchfan: { label: 'Pitchfan', icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
  gannBox: { label: 'Gann box', icon: <Square className="w-3.5 h-3.5" /> },
  gannSquareFixed: { label: 'Gann square fixed', icon: <Square className="w-3.5 h-3.5" /> },
  gannSquare: { label: 'Gann square', icon: <Square className="w-3.5 h-3.5" /> },
  gannFan: { label: 'Gann fan', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  xabcdPattern: { label: 'XABCD pattern', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  cypherPattern: { label: 'Cypher pattern', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  headAndShoulders: { label: 'Head and shoulders', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  abcdPattern: { label: 'ABCD pattern', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  trianglePattern: { label: 'Triangle pattern', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  threeDrivesPattern: { label: 'Three drives pattern', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  elliottImpulse: { label: 'Elliott impulse wave (12345)', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  elliottCorrection: { label: 'Elliott correction wave (ABC)', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  elliottTriangle: { label: 'Elliott triangle wave (ABCDE)', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  elliottDoubleCombo: { label: 'Elliott double combo wave (WXY)', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  elliottTripleCombo: { label: 'Elliott triple combo wave (WXYXZ)', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  cyclicLines: { label: 'Cyclic lines', icon: <SeparatorVertical className="w-3.5 h-3.5" /> },
  timeCycles: { label: 'Time cycles', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  sineLine: { label: 'Sine line', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  brushTool: { label: 'Brush', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  highlighterTool: { label: 'Highlighter', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  arrowMarker: { label: 'Arrow marker', icon: <MoveUpRight className="w-3.5 h-3.5" /> },
  arrowLine: { label: 'Arrow', icon: <MoveUpRight className="w-3.5 h-3.5" /> },
  arrowMarkUp: { label: 'Arrow mark up', icon: <ArrowUpRight className="w-3.5 h-3.5 text-[#089981]" /> },
  arrowMarkDown: { label: 'Arrow mark down', icon: <ArrowDownRight className="w-3.5 h-3.5 text-[#f23645]" /> },
  rectBox: { label: 'Rectangle (Alt+Shift+R)', icon: <Square className="w-3.5 h-3.5" /> },
  rotatedRectangle: { label: 'Rotated rectangle', icon: <Square className="w-3.5 h-3.5" /> },
  pathTool: { label: 'Path', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  circleShape: { label: 'Circle', icon: <Square className="w-3.5 h-3.5" /> },
  ellipseShape: { label: 'Ellipse', icon: <Square className="w-3.5 h-3.5" /> },
  polylineShape: { label: 'Polyline', icon: <Square className="w-3.5 h-3.5" /> },
  triangleShape: { label: 'Triangle', icon: <Square className="w-3.5 h-3.5" /> },
  arcShape: { label: 'Arc', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  curveShape: { label: 'Curve', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  doubleCurveShape: { label: 'Double curve', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  iconStamp: { label: 'Icon / Emoji', icon: <Type className="w-3.5 h-3.5" /> },
  riskRewardLong: {
    label: 'Long position',
    icon: <ArrowUpRight className="w-3.5 h-3.5 text-[#089981]" />,
  },
  riskRewardShort: {
    label: 'Short position',
    icon: <ArrowDownRight className="w-3.5 h-3.5 text-[#f23645]" />,
  },
  forecastLine: { label: 'Position forecast', icon: <MoveUpRight className="w-3.5 h-3.5 text-[#089981]" /> },
  barsPattern: { label: 'Bars pattern', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  ghostFeed: { label: 'Ghost feed', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  sectorTool: { label: 'Sector', icon: <Square className="w-3.5 h-3.5" /> },
  anchoredVwap: { label: 'Anchored VWAP', icon: <TrendingUp className="w-3.5 h-3.5 text-[#2962ff]" /> },
  fixedRangeVolumeProfile: { label: 'Fixed range volume profile', icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
  anchoredVolumeProfile: { label: 'Anchored volume profile', icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
  priceRange: { label: 'Price range', icon: <Ruler className="w-3.5 h-3.5" /> },
  dateRange: { label: 'Date range', icon: <Ruler className="w-3.5 h-3.5" /> },
  rulerMeasure: { label: 'Date and price range', icon: <Ruler className="w-3.5 h-3.5" /> },
  textNote: { label: 'Text', icon: <Type className="w-3.5 h-3.5" /> },
  anchoredNote: { label: 'Note', icon: <Type className="w-3.5 h-3.5" /> },
  priceNote: { label: 'Price note', icon: <Type className="w-3.5 h-3.5" /> },
  pinMarker: { label: 'Pin', icon: <Type className="w-3.5 h-3.5" /> },
  chartTable: { label: 'Table', icon: <Square className="w-3.5 h-3.5" /> },
  simpleAnnotation: { label: 'Callout', icon: <Type className="w-3.5 h-3.5" /> },
  commentBubble: { label: 'Comment', icon: <Type className="w-3.5 h-3.5" /> },
  simpleTag: { label: 'Price label', icon: <Type className="w-3.5 h-3.5" /> },
  signpostMarker: { label: 'Signpost', icon: <Type className="w-3.5 h-3.5" /> },
  flagMarker: { label: 'Flag mark', icon: <Type className="w-3.5 h-3.5" /> },
  chartImage: { label: 'Image', icon: <Square className="w-3.5 h-3.5" /> },
  socialPostTag: { label: 'Post', icon: <Type className="w-3.5 h-3.5" /> },
  tradingIdeaTag: { label: 'Idea', icon: <Type className="w-3.5 h-3.5 text-[#f59e0b]" /> },
};

export const FloatingFavoritesBar: React.FC = () => {
  const {
    favoriteTools,
    floatingFavVisible,
    floatingFavPos,
    setFloatingFavPos,
    reorderFavoriteTools,
    activeTool,
    setActiveTool,
  } = useChartStore();

  const barDragRef = useRef<{ mx: number; my: number; x: number; y: number } | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [draggingToolId, setDraggingToolId] = useState<string | null>(null);

  if (!floatingFavVisible || favoriteTools.length === 0) return null;

  // Drag entire toolbar via left Grip handle
  const handleBarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    barDragRef.current = {
      mx: e.clientX,
      my: e.clientY,
      x: floatingFavPos.x,
      y: floatingFavPos.y,
    };

    const onMove = (ev: MouseEvent) => {
      if (!barDragRef.current) return;
      const nx = Math.max(
        48,
        Math.min(window.innerWidth - 200, barDragRef.current.x + (ev.clientX - barDragRef.current.mx))
      );
      const ny = Math.max(
        42,
        Math.min(window.innerHeight - 60, barDragRef.current.y + (ev.clientY - barDragRef.current.my))
      );
      setFloatingFavPos({ x: nx, y: ny });
    };

    const onUp = () => {
      barDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Seamless Live-Swap Pointer Drag-to-Reorder for individual tool icons
  const handleItemMouseDown = (e: React.MouseEvent, toolId: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    let moved = false;

    const onMove = (ev: MouseEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) >= 5) {
        moved = true;
        setDraggingToolId(toolId);
      }
      if (!moved) return;

      const curList = useChartStore.getState().favoriteTools;
      const curIdx = curList.indexOf(toolId);
      if (curIdx === -1) return;

      for (let i = 0; i < curList.length; i++) {
        if (i === curIdx) continue;
        const btn = itemRefs.current[i];
        if (!btn) continue;
        const rect = btn.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        if ((i > curIdx && ev.clientX > centerX) || (i < curIdx && ev.clientX < centerX)) {
          reorderFavoriteTools(curIdx, i);
          break;
        }
      }
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setDraggingToolId(null);
      if (!moved) {
        const curActive = useChartStore.getState().activeTool;
        setActiveTool(curActive === toolId ? null : toolId);
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      style={{ left: `${floatingFavPos.x}px`, top: `${floatingFavPos.y}px` }}
      className="fixed z-30 flex items-center gap-0.5 px-1 py-1 rounded bg-[#1e222d]/95 border border-[#2a2e39] shadow-tv backdrop-blur-sm select-none"
    >
      <div
        onMouseDown={handleBarMouseDown}
        title="Drag Favorites Toolbar"
        className="px-0.5 py-1 cursor-grab active:cursor-grabbing text-[#787b86] hover:text-[#d1d4dc]"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>

      {favoriteTools.map((toolId, idx) => {
        const meta = TOOL_META[toolId] || {
          label: toolId,
          icon: <TrendingUp className="w-3.5 h-3.5" />,
        };
        const isActive = activeTool === toolId;
        const isDragging = draggingToolId === toolId;
        return (
          <button
            key={toolId}
            ref={(el) => {
              itemRefs.current[idx] = el;
            }}
            onMouseDown={(e) => handleItemMouseDown(e, toolId)}
            title={`${meta.label} (Click to use · Drag left/right to reorder)`}
            className={`w-7 h-7 rounded flex items-center justify-center transition-transform duration-150 ease-out ${
              isDragging
                ? 'scale-110 bg-[#2962ff]/30 ring-1 ring-[#2962ff] z-10 shadow-lg cursor-grabbing text-white'
                : isActive
                ? 'bg-[#2962ff]/20 text-[#2962ff]'
                : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
            }`}
          >
            {meta.icon}
          </button>
        );
      })}
    </div>
  );
};
