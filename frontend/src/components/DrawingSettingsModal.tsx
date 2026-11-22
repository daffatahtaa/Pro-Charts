import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Pencil, ChevronDown, Check, Trash2, BookmarkPlus, RotateCcw } from 'lucide-react';
import { useChartStore } from '../store/useChartStore';
import { DEFAULT_FIB_LEVELS } from '../overlays';
import {
  DrawingExtendConfig,
  DrawingTemplatePreset,
  FibLevelItem,
  TIMEFRAMES,
} from '../types/chart';

const LS_TEMPLATES_KEY = 'tv_drawing_templates_v1';

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  fibonacciLine: 'Fib retracement',
  fibExtension: 'Trend-based fib extension',
  fibChannel: 'Fib channel',
  fibTimeZone: 'Fib time zone',
  fibSpeedResistanceFan: 'Fib speed resistance fan',
  trendBasedFibTime: 'Trend-based fib time',
  fibCircles: 'Fib circles',
  fibSpiral: 'Fib spiral',
  fibSpeedResistanceArcs: 'Fib speed resistance arcs',
  fibWedge: 'Fib wedge',
  pitchfan: 'Pitchfan',
  gannBox: 'Gann box',
  gannSquareFixed: 'Gann square fixed',
  gannSquare: 'Gann square',
  gannFan: 'Gann fan',
  xabcdPattern: 'XABCD pattern',
  cypherPattern: 'Cypher pattern',
  headAndShoulders: 'Head and shoulders',
  abcdPattern: 'ABCD pattern',
  trianglePattern: 'Triangle pattern',
  threeDrivesPattern: 'Three drives pattern',
  elliottImpulse: 'Elliott impulse wave (12345)',
  elliottCorrection: 'Elliott correction wave (ABC)',
  elliottTriangle: 'Elliott triangle wave (ABCDE)',
  elliottDoubleCombo: 'Elliott double combo wave (WXY)',
  elliottTripleCombo: 'Elliott triple combo wave (WXYXZ)',
  cyclicLines: 'Cyclic lines',
  timeCycles: 'Time cycles',
  sineLine: 'Sine line',
  brushTool: 'Brush',
  highlighterTool: 'Highlighter',
  arrowMarker: 'Arrow marker',
  arrowLine: 'Arrow',
  arrowMarkUp: 'Arrow mark up',
  arrowMarkDown: 'Arrow mark down',
  rotatedRectangle: 'Rotated rectangle',
  pathTool: 'Path',
  circleShape: 'Circle',
  ellipseShape: 'Ellipse',
  polylineShape: 'Polyline',
  triangleShape: 'Triangle',
  arcShape: 'Arc',
  curveShape: 'Curve',
  doubleCurveShape: 'Double curve',
  iconStamp: 'Icon / Emoji',
  segment: 'Trendline',
  rayLine: 'Ray',
  infoLine: 'Info line',
  straightLine: 'Extended line',
  trendAngle: 'Trend angle',
  horizontalStraightLine: 'Horizontal line',
  horizontalRayLine: 'Horizontal ray',
  verticalStraightLine: 'Vertical line',
  crossLine: 'Crossline',
  priceLine: 'Price Label Line',
  parallelStraightLine: 'Parallel channel',
  regressionTrend: 'Regression trend',
  flatTopBottom: 'Flat top/bottom',
  disjointChannel: 'Disjoint channel',
  pitchfork: 'Pitchfork',
  schiffPitchfork: 'Schiff pitchfork',
  modifiedSchiffPitchfork: 'Modified Schiff pitchfork',
  insidePitchfork: 'Inside pitchfork',
  rectBox: 'Rectangle',
  riskRewardLong: 'Long position',
  riskRewardShort: 'Short position',
  forecastLine: 'Position forecast',
  barsPattern: 'Bars pattern',
  ghostFeed: 'Ghost feed',
  sectorTool: 'Sector',
  anchoredVwap: 'Anchored VWAP',
  fixedRangeVolumeProfile: 'Fixed range volume profile',
  anchoredVolumeProfile: 'Anchored volume profile',
  priceRange: 'Price range',
  dateRange: 'Date range',
  rulerMeasure: 'Date and price range',
  textNote: 'Text',
  anchoredNote: 'Note',
  priceNote: 'Price note',
  pinMarker: 'Pin',
  chartTable: 'Table',
  simpleAnnotation: 'Callout',
  commentBubble: 'Comment',
  simpleTag: 'Price label',
  signpostMarker: 'Signpost',
  flagMarker: 'Flag mark',
  chartImage: 'Image',
  socialPostTag: 'Post',
  tradingIdeaTag: 'Idea',
};

function loadTemplates(): DrawingTemplatePreset[] {
  try {
    const raw = localStorage.getItem(LS_TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTemplates(list: DrawingTemplatePreset[]) {
  try {
    localStorage.setItem(LS_TEMPLATES_KEY, JSON.stringify(list));
  } catch {}
}

function tsToLocalInput(ts?: number): string {
  if (!ts || !Number.isFinite(ts)) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToTs(val: string, fallback?: number): number | undefined {
  if (!val) return fallback;
  const ms = Date.parse(val);
  return Number.isNaN(ms) ? fallback : ms;
}

export const DrawingSettingsModal: React.FC = () => {
  const overlayId = useChartStore((s) => s.drawingSettingsOverlayId);
  const setOverlayId = useChartStore((s) => s.setDrawingSettingsOverlayId);
  const drawingsList = useChartStore((s) => s.drawingsList);
  const candles = useChartStore((s) => s.candles);
  const symbolInfo = useChartStore((s) => s.symbolInfo);
  const customTimeframes = useChartStore((s) => s.customTimeframes);
  const bridge = useChartStore((s) => s.bridge);
  const showToast = useChartStore((s) => s.showToast);

  const [tab, setTab] = useState<'style' | 'coordinates' | 'visibility'>('style');
  const [editingTitle, setEditingTitle] = useState(false);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [templates, setTemplates] = useState<DrawingTemplatePreset[]>(() => loadTemplates());

  // Draft states synced from live overlay
  const [toolName, setToolName] = useState<string>('segment');
  const [points, setPoints] = useState<Array<{ timestamp?: number; dataIndex?: number; value?: number }>>([]);
  const [styles, setStyles] = useState<Record<string, any>>({});
  const [ext, setExt] = useState<DrawingExtendConfig>({});

  // Snapshot for Cancel revert
  const snapshotRef = useRef<{
    points: Array<{ timestamp?: number; dataIndex?: number; value?: number }>;
    styles: Record<string, any>;
    extendData: DrawingExtendConfig;
  } | null>(null);
  const coordsDirtyRef = useRef(false);

  useEffect(() => {
    if (!overlayId) return;
    coordsDirtyRef.current = false;
    const item = drawingsList.find((d) => d.id === overlayId);
    const livePoints = bridge.getOverlayPoints?.(overlayId) || item?.points || [];
    const liveExt = (bridge.getOverlayExtendData?.(overlayId) || item?.extendData || {}) as DrawingExtendConfig;
    const liveStyles = item?.styles || {};
    const name = item?.name || 'segment';

    const initializedExt: DrawingExtendConfig = {
      ...liveExt,
      fibLevels:
        liveExt.fibLevels && liveExt.fibLevels.length > 0
          ? liveExt.fibLevels.map((l) => ({ ...l }))
          : DEFAULT_FIB_LEVELS.map((l) => ({ ...l })),
      visibility: liveExt.visibility
        ? {
            allTimeframes: liveExt.visibility.allTimeframes !== false,
            timeframes: [...(liveExt.visibility.timeframes || TIMEFRAMES)],
          }
        : { allTimeframes: true, timeframes: [...TIMEFRAMES, ...customTimeframes] },
    };

    snapshotRef.current = {
      points: livePoints.map((p) => ({ ...p })),
      styles: JSON.parse(JSON.stringify(liveStyles)),
      extendData: JSON.parse(JSON.stringify(liveExt)),
    };

    setToolName(name);
    setPoints(livePoints.map((p) => ({ ...p })));
    setStyles(JSON.parse(JSON.stringify(liveStyles)));
    setExt(initializedExt);
    setTab('style');
    setEditingTitle(false);
    setTemplateMenuOpen(false);
  }, [overlayId]);

  const allTimeframeOptions = useMemo(
    () => Array.from(new Set([...TIMEFRAMES, ...customTimeframes])),
    [customTimeframes]
  );

  if (!overlayId) return null;

  const isFib = toolName === 'fibonacciLine' || toolName === 'fibExtension';
  const lineColor = styles?.line?.color || '#2962ff';
  const lineWidth = Math.round(styles?.line?.size || 1);
  const lineStyle = styles?.line?.style === 'dashed' ? 'dashed' : 'solid';
  const displayTitle = ext.customTitle || TOOL_DISPLAY_NAMES[toolName] || toolName;

  const pushLivePreview = (
    nextPoints = points,
    nextStyles = styles,
    nextExt = ext,
    persist = false,
    includePoints = false
  ) => {
    bridge.updateOverlayConfig?.(
      overlayId,
      {
        ...(includePoints ? { points: nextPoints } : {}),
        styles: nextStyles,
        extendData: nextExt,
      },
      persist
    );
  };

  const updateExt = (patch: Partial<DrawingExtendConfig>) => {
    const next = { ...ext, ...patch };
    setExt(next);
    pushLivePreview(points, styles, next, false, false);
  };

  const updateLineStyle = (patch: { color?: string; size?: number; style?: 'solid' | 'dashed' }) => {
    const nextColor = patch.color ?? lineColor;
    const nextSize = patch.size ?? lineWidth;
    const nextStyle = patch.style ?? lineStyle;
    const nextStyles = {
      ...styles,
      line: {
        ...(styles.line || {}),
        color: nextColor,
        size: nextSize,
        style: nextStyle,
        dashedValue: [4, 4],
      },
      polygon: {
        ...(styles.polygon || {}),
        color: `${nextColor}2e`,
        borderColor: nextColor,
        borderSize: nextSize,
      },
      rect: {
        ...(styles.rect || {}),
        color: `${nextColor}2e`,
        borderColor: nextColor,
        borderSize: nextSize,
      },
    };
    setStyles(nextStyles);
    pushLivePreview(points, nextStyles, ext, false, false);
  };

  const updateFibLevel = (idx: number, patch: Partial<FibLevelItem>) => {
    const list = (ext.fibLevels || DEFAULT_FIB_LEVELS).map((lvl, i) =>
      i === idx ? { ...lvl, ...patch } : lvl
    );
    updateExt({ fibLevels: list });
  };

  const handleCancel = () => {
    if (snapshotRef.current) {
      bridge.updateOverlayConfig?.(
        overlayId,
        {
          ...(coordsDirtyRef.current ? { points: snapshotRef.current.points } : {}),
          styles: snapshotRef.current.styles,
          extendData: snapshotRef.current.extendData,
        },
        false
      );
    }
    setOverlayId(null);
  };

  const handleOk = () => {
    pushLivePreview(points, styles, ext, true, coordsDirtyRef.current);
    setOverlayId(null);
    showToast('success', `${displayTitle} settings saved.`);
  };

  const handleSaveTemplate = () => {
    const name = window.prompt(`Template name for ${displayTitle}:`, `${displayTitle} Custom`);
    if (!name || !name.trim()) return;
    const preset: DrawingTemplatePreset = {
      id: `tpl_${Date.now()}`,
      name: name.trim(),
      toolName,
      styles,
      extendData: { ...ext, label: undefined, customTitle: undefined },
    };
    const next = [preset, ...templates];
    setTemplates(next);
    saveTemplates(next);
    setTemplateMenuOpen(false);
    showToast('success', `Saved template "${preset.name}"`);
  };

  const handleApplyTemplate = (preset: DrawingTemplatePreset) => {
    const nextStyles = JSON.parse(JSON.stringify(preset.styles || {}));
    const nextExt: DrawingExtendConfig = {
      ...ext,
      ...JSON.parse(JSON.stringify(preset.extendData || {})),
    };
    setStyles(nextStyles);
    setExt(nextExt);
    pushLivePreview(points, nextStyles, nextExt, false, false);
    setTemplateMenuOpen(false);
    showToast('info', `Applied template "${preset.name}"`);
  };

  const handleApplyDefault = () => {
    const defExt: DrawingExtendConfig = {
      ...ext,
      extendLeft: false,
      extendRight: false,
      showTrendLine: false,
      trendLineColor: '#787b86',
      trendLineStyle: 'dashed',
      levelsLineStyle: 'solid',
      levelsLineWidth: 1,
      useOneColor: false,
      oneColor: '#787b86',
      showBackground: false,
      backgroundOpacity: 0.12,
      fibReverse: false,
      fibShowPrices: true,
      fibShowLevels: true,
      fibFormat: 'values',
      fibLabelsAlign: 'right',
      fibLevels: DEFAULT_FIB_LEVELS.map((l) => ({ ...l })),
    };
    const defStyles = {
      line: { color: '#2962ff', size: 1, style: 'solid', dashedValue: [4, 4] },
      polygon: { color: 'rgba(41, 98, 255, 0.18)', borderColor: '#2962ff', borderSize: 1 },
      rect: { color: 'rgba(41, 98, 255, 0.18)', borderColor: '#2962ff', borderSize: 1 },
    };
    setStyles(defStyles);
    setExt(defExt);
    pushLivePreview(points, defStyles, defExt, false, false);
    setTemplateMenuOpen(false);
    showToast('info', 'Reset to TradingView defaults');
  };

  const handleDeleteTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = templates.filter((t) => t.id !== id);
    setTemplates(next);
    saveTemplates(next);
  };

  const extendModeValue =
    ext.extendLeft && ext.extendRight
      ? 'both'
      : ext.extendLeft
      ? 'left'
      : ext.extendRight
      ? 'right'
      : 'none';

  const setExtendMode = (mode: string) => {
    updateExt({
      extendLeft: mode === 'left' || mode === 'both',
      extendRight: mode === 'right' || mode === 'both',
    });
  };

  const fibLevels = ext.fibLevels || DEFAULT_FIB_LEVELS;
  const vis = ext.visibility || { allTimeframes: true, timeframes: allTimeframeOptions };
  const bgOpacityPct = Math.round((ext.backgroundOpacity ?? 0.12) * 100);

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4"
      onClick={handleCancel}
    >
      <div
        className="w-[450px] max-w-[95vw] max-h-[86vh] bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-tv flex flex-col overflow-hidden text-[12.5px] text-[#d1d4dc]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#2a2e39] flex items-center justify-between bg-[#131722]/40 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {editingTitle ? (
              <input
                type="text"
                autoFocus
                value={ext.customTitle ?? displayTitle}
                onChange={(e) => updateExt({ customTitle: e.target.value })}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setEditingTitle(false);
                }}
                className="px-2 py-0.5 rounded bg-[#131722] border border-[#2962ff] text-[14px] font-semibold text-white outline-none"
              />
            ) : (
              <>
                <h2 className="text-[15px] font-semibold text-white truncate">{displayTitle}</h2>
                <button
                  onClick={() => setEditingTitle(true)}
                  title="Rename object title"
                  className="p-1 rounded text-[#787b86] hover:text-white hover:bg-[#2a2e39] cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
          <button
            onClick={handleCancel}
            className="p-1 rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3 Tabs */}
        <div className="px-4 flex items-center gap-5 border-b border-[#2a2e39] shrink-0">
          {(['style', 'coordinates', 'visibility'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-2.5 text-[12.5px] font-medium capitalize border-b-2 transition-colors cursor-pointer ${
                tab === t
                  ? 'border-[#2962ff] text-white'
                  : 'border-transparent text-[#787b86] hover:text-[#d1d4dc]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Scrollable Tab Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {/* ==================== TAB 1: STYLE ==================== */}
          {tab === 'style' && isFib && (
            <>
              {/* Trend Line Row (Visual Control Box) */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(ext.showTrendLine)}
                    onChange={(e) => updateExt({ showTrendLine: e.target.checked })}
                    className="accent-[#2962ff]"
                  />
                  <span>Trend line</span>
                </label>
                <div className="flex items-center gap-1.5 px-1.5 py-1 rounded border border-[#363a45] bg-[#131722]">
                  <input
                    type="color"
                    disabled={!ext.showTrendLine}
                    value={ext.trendLineColor || '#787b86'}
                    onChange={(e) => updateExt({ trendLineColor: e.target.value })}
                    className="w-5 h-5 rounded border border-[#2a2e39] bg-transparent cursor-pointer disabled:opacity-40"
                  />
                  <div className="flex items-center gap-0.5">
                    {(['solid', 'dashed'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        disabled={!ext.showTrendLine}
                        onClick={() => updateExt({ trendLineStyle: st })}
                        title={st === 'solid' ? 'Solid' : 'Dashed'}
                        className={`px-2 h-6 rounded text-[11px] font-mono-num cursor-pointer disabled:opacity-40 ${
                          (ext.trendLineStyle || 'dashed') === st
                            ? 'bg-[#2962ff]/25 text-white border border-[#2962ff]/60'
                            : 'text-[#787b86] hover:text-white'
                        }`}
                      >
                        {st === 'solid' ? '────' : '----'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Levels Line Style & Thickness (Visual TradingView Boxes) */}
              <div className="flex items-center justify-between">
                <span>Levels line</span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5 px-1 py-0.5 rounded border border-[#363a45] bg-[#131722]">
                    {([
                      { id: 'solid' as const, glyph: '────', title: 'Solid' },
                      { id: 'dashed' as const, glyph: '----', title: 'Dashed' },
                      { id: 'dotted' as const, glyph: '····', title: 'Dotted' },
                    ]).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateExt({ levelsLineStyle: opt.id })}
                        title={opt.title}
                        className={`px-1.5 h-6 rounded text-[11px] font-mono-num cursor-pointer ${
                          (ext.levelsLineStyle || 'solid') === opt.id
                            ? 'bg-[#2962ff]/25 text-white border border-[#2962ff]/60'
                            : 'text-[#787b86] hover:text-white'
                        }`}
                      >
                        {opt.glyph}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-0.5 px-1 py-0.5 rounded border border-[#363a45] bg-[#131722]">
                    {[1, 2, 3, 4].map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => updateExt({ levelsLineWidth: w })}
                        className={`px-1.5 h-6 rounded text-[10.5px] font-mono-num cursor-pointer ${
                          (ext.levelsLineWidth || 1) === w
                            ? 'bg-[#2962ff]/25 text-white border border-[#2962ff]/60'
                            : 'text-[#787b86] hover:text-white'
                        }`}
                      >
                        {w}px
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Extend Mode */}
              <div className="flex items-center justify-between">
                <span>Extend</span>
                <select
                  value={extendModeValue}
                  onChange={(e) => setExtendMode(e.target.value)}
                  className="w-40 px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[11.5px] outline-none"
                >
                  <option value="none">Don&apos;t extend</option>
                  <option value="left">Extend left</option>
                  <option value="right">Extend right</option>
                  <option value="both">Extend both</option>
                </select>
              </div>

              <div className="h-[1px] bg-[#2a2e39]" />

              {/* 2-Column 24-Level Fibonacci Grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {fibLevels.map((lvl, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={lvl.enabled}
                      onChange={(e) => updateFibLevel(idx, { enabled: e.target.checked })}
                      className="accent-[#2962ff] cursor-pointer shrink-0"
                    />
                    <input
                      type="number"
                      step="0.001"
                      value={lvl.ratio}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (Number.isFinite(val)) updateFibLevel(idx, { ratio: val });
                      }}
                      className="no-spinner flex-1 min-w-0 px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] font-mono-num text-[11.5px] text-white outline-none focus:border-[#2962ff]"
                    />
                    <input
                      type="color"
                      disabled={Boolean(ext.useOneColor)}
                      value={lvl.color}
                      onChange={(e) => updateFibLevel(idx, { color: e.target.value })}
                      className="w-7 h-6 rounded border border-[#2a2e39] bg-transparent cursor-pointer shrink-0 disabled:opacity-40"
                    />
                  </div>
                ))}
              </div>

              <div className="h-[1px] bg-[#2a2e39]" />

              {/* Use One Color */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(ext.useOneColor)}
                    onChange={(e) => updateExt({ useOneColor: e.target.checked })}
                    className="accent-[#2962ff]"
                  />
                  <span>Use one color</span>
                </label>
                <input
                  type="color"
                  disabled={!ext.useOneColor}
                  value={ext.oneColor || '#2962ff'}
                  onChange={(e) => updateExt({ oneColor: e.target.value })}
                  className="w-8 h-6 rounded border border-[#2a2e39] bg-transparent cursor-pointer disabled:opacity-40"
                />
              </div>

              {/* Background Opacity Slider */}
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={Boolean(ext.showBackground)}
                    onChange={(e) => updateExt({ showBackground: e.target.checked })}
                    className="accent-[#2962ff]"
                  />
                  <span>Background</span>
                </label>
                <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                  <input
                    type="range"
                    min={0}
                    max={50}
                    step={2}
                    disabled={!ext.showBackground}
                    value={bgOpacityPct}
                    onChange={(e) =>
                      updateExt({ backgroundOpacity: Number(e.target.value) / 100 })
                    }
                    className="w-full accent-[#2962ff] cursor-pointer disabled:opacity-40"
                  />
                  <span className="font-mono-num text-[11px] text-[#787b86] w-9 text-right">
                    {bgOpacityPct}%
                  </span>
                </div>
              </div>

              <div className="h-[1px] bg-[#2a2e39]" />

              {/* Reverse, Prices, Levels Format & Labels Alignment */}
              <div className="grid grid-cols-2 gap-2.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(ext.fibReverse)}
                    onChange={(e) => updateExt({ fibReverse: e.target.checked })}
                    className="accent-[#2962ff]"
                  />
                  <span>Reverse</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ext.fibShowPrices !== false}
                    onChange={(e) => updateExt({ fibShowPrices: e.target.checked })}
                    className="accent-[#2962ff]"
                  />
                  <span>Prices</span>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ext.fibShowLevels !== false}
                    onChange={(e) => updateExt({ fibShowLevels: e.target.checked })}
                    className="accent-[#2962ff]"
                  />
                  <span>Levels</span>
                </label>
                <select
                  disabled={ext.fibShowLevels === false}
                  value={ext.fibFormat || 'values'}
                  onChange={(e) =>
                    updateExt({ fibFormat: e.target.value as 'values' | 'percent' })
                  }
                  className="w-36 px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[11.5px] outline-none disabled:opacity-40"
                >
                  <option value="values">Values</option>
                  <option value="percent">Percent</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <span>Labels</span>
                <div className="flex items-center gap-1 rounded border border-[#363a45] bg-[#131722] p-0.5">
                  {(['left', 'center', 'right'] as const).map((al) => (
                    <button
                      key={al}
                      type="button"
                      onClick={() => updateExt({ fibLabelsAlign: al })}
                      className={`px-2.5 py-0.5 rounded text-[11px] capitalize cursor-pointer ${
                        (ext.fibLabelsAlign || 'right') === al
                          ? 'bg-[#2962ff] text-white font-medium'
                          : 'text-[#787b86] hover:text-white'
                      }`}
                    >
                      {al}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === 'style' && !isFib && (
            <>
              <div className="flex items-center justify-between">
                <span>Color &amp; Thickness</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={lineColor}
                    onChange={(e) => updateLineStyle({ color: e.target.value })}
                    className="w-8 h-6 rounded border border-[#2a2e39] bg-transparent cursor-pointer"
                  />
                  <select
                    value={lineWidth}
                    onChange={(e) => updateLineStyle({ size: Number(e.target.value) })}
                    className="px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[11.5px] font-mono-num outline-none"
                  >
                    {[1, 2, 3, 4].map((w) => (
                      <option key={w} value={w}>
                        {w}px
                      </option>
                    ))}
                  </select>
                  <select
                    value={lineStyle}
                    onChange={(e) =>
                      updateLineStyle({ style: e.target.value as 'solid' | 'dashed' })
                    }
                    className="px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[11.5px] outline-none"
                  >
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                  </select>
                </div>
              </div>

              {(toolName === 'segment' ||
                toolName === 'rectBox' ||
                toolName === 'parallelStraightLine') && (
                <div className="flex items-center justify-between">
                  <span>Extend</span>
                  <select
                    value={extendModeValue}
                    onChange={(e) => setExtendMode(e.target.value)}
                    className="w-40 px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[11.5px] outline-none"
                  >
                    <option value="none">Don&apos;t extend</option>
                    <option value="left">Extend left</option>
                    <option value="right">Extend right</option>
                    <option value="both">Extend both</option>
                  </select>
                </div>
              )}

              {(toolName === 'rectBox' || toolName === 'parallelStraightLine') && (
                <>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={
                        toolName === 'parallelStraightLine'
                          ? ext.showMiddleLine !== false
                          : Boolean(ext.showMiddleLine)
                      }
                      onChange={(e) => updateExt({ showMiddleLine: e.target.checked })}
                      className="accent-[#2962ff]"
                    />
                    <span>
                      {toolName === 'rectBox'
                        ? 'Middle line (50% Equilibrium / CE)'
                        : 'Middle line'}
                    </span>
                  </label>
                  <div className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ext.showBackground !== false}
                        onChange={(e) => updateExt({ showBackground: e.target.checked })}
                        className="accent-[#2962ff]"
                      />
                      <span>Fill Background</span>
                    </label>
                    <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                      <input
                        type="range"
                        min={0}
                        max={60}
                        step={2}
                        disabled={ext.showBackground === false}
                        value={Math.round((ext.backgroundOpacity ?? 0.18) * 100)}
                        onChange={(e) =>
                          updateExt({ backgroundOpacity: Number(e.target.value) / 100 })
                        }
                        className="w-full accent-[#2962ff] cursor-pointer disabled:opacity-40"
                      />
                      <span className="font-mono-num text-[11px] text-[#787b86] w-9 text-right">
                        {Math.round((ext.backgroundOpacity ?? 0.18) * 100)}%
                      </span>
                    </div>
                  </div>
                </>
              )}

              {(toolName === 'riskRewardLong' || toolName === 'riskRewardShort') && (
                <>
                  <div className="flex items-center justify-between">
                    <span>Account Size</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      placeholder="Auto (Account Balance)"
                      value={ext.rrAccountSize ?? ''}
                      onChange={(e) => {
                        const v = e.target.value === '' ? undefined : Number(e.target.value);
                        updateExt({ rrAccountSize: v });
                      }}
                      className="w-40 px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[11.5px] font-mono-num text-white outline-none focus:border-[#2962ff]"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Risk</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        placeholder="Auto"
                        value={ext.rrRiskValue ?? ''}
                        onChange={(e) => {
                          const v = e.target.value === '' ? undefined : Number(e.target.value);
                          updateExt({ rrRiskValue: v });
                        }}
                        className="w-24 px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[11.5px] font-mono-num text-white outline-none focus:border-[#2962ff]"
                      />
                      <select
                        value={ext.rrRiskMode || 'percent'}
                        onChange={(e) =>
                          updateExt({ rrRiskMode: e.target.value as 'percent' | 'money' })
                        }
                        className="px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[11.5px] outline-none"
                      >
                        <option value="percent">%</option>
                        <option value="money">USD</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Fixed Qty / Lot</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      placeholder="Auto from Risk"
                      value={ext.rrFixedQty ?? ''}
                      onChange={(e) => {
                        const v = e.target.value === '' ? undefined : Number(e.target.value);
                        updateExt({ rrFixedQty: v });
                      }}
                      className="w-40 px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[11.5px] font-mono-num text-white outline-none focus:border-[#2962ff]"
                    />
                  </div>
                  <div className="h-[1px] bg-[#2a2e39]" />
                  <div className="flex items-center justify-between">
                    <span>Profit Zone Color</span>
                    <input
                      type="color"
                      value={ext.profitZoneColor || '#56b467'}
                      onChange={(e) => updateExt({ profitZoneColor: e.target.value })}
                      className="w-8 h-6 rounded border border-[#2a2e39] bg-transparent cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Stop Loss Zone Color</span>
                    <input
                      type="color"
                      value={ext.lossZoneColor || '#ef5350'}
                      onChange={(e) => updateExt({ lossZoneColor: e.target.value })}
                      className="w-8 h-6 rounded border border-[#2a2e39] bg-transparent cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Zone Opacity</span>
                    <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                      <input
                        type="range"
                        min={5}
                        max={60}
                        step={2}
                        value={Math.round((ext.zoneOpacity ?? 0.16) * 100)}
                        onChange={(e) =>
                          updateExt({ zoneOpacity: Number(e.target.value) / 100 })
                        }
                        className="w-full accent-[#2962ff] cursor-pointer"
                      />
                      <span className="font-mono-num text-[11px] text-[#787b86] w-9 text-right">
                        {Math.round((ext.zoneOpacity ?? 0.16) * 100)}%
                      </span>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ext.alwaysShowStats !== false}
                      onChange={(e) => updateExt({ alwaysShowStats: e.target.checked })}
                      className="accent-[#2962ff]"
                    />
                    <span>Always show stats</span>
                  </label>
                </>
              )}

              <div className="h-[1px] bg-[#2a2e39]" />

              <div className="space-y-2">
                <span className="text-[11.5px] text-[#787b86]">Text Label &amp; Alignment</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={ext.label || ''}
                    onChange={(e) => updateExt({ label: e.target.value })}
                    placeholder="Label / Note (OB, FVG, Liquidity...)"
                    className="flex-1 px-2.5 py-1.5 rounded bg-[#131722] border border-[#2a2e39] text-[12px] text-white outline-none focus:border-[#2962ff]"
                  />
                  <select
                    value={
                      ext.labelPosition ||
                      (toolName === 'horizontalStraightLine' ? 'center' : 'top')
                    }
                    onChange={(e) =>
                      updateExt({
                        labelPosition: e.target.value as 'top' | 'center' | 'bottom',
                      })
                    }
                    title="Vertical Alignment"
                    className="px-2 py-1.5 rounded bg-[#131722] border border-[#2a2e39] text-[11.5px] outline-none"
                  >
                    <option value="top">Top</option>
                    <option value="center">Center</option>
                    <option value="bottom">Bottom</option>
                  </select>
                  {toolName === 'horizontalStraightLine' && (
                    <select
                      value={ext.labelHAlign || 'center'}
                      onChange={(e) =>
                        updateExt({
                          labelHAlign: e.target.value as 'left' | 'center' | 'right',
                        })
                      }
                      title="Horizontal Alignment"
                      className="px-2 py-1.5 rounded bg-[#131722] border border-[#2a2e39] text-[11.5px] outline-none"
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ==================== TAB 2: COORDINATES ==================== */}
          {tab === 'coordinates' && (
            <div className="space-y-3">
              <div className="text-[11px] text-[#787b86]">
                Set exact price and timestamp coordinates for each anchor point.
              </div>
              {points.map((pt, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded bg-[#131722]/60 border border-[#2a2e39] space-y-2"
                >
                  <div className="text-[11px] font-semibold text-[#787b86] uppercase">
                    Point #{idx + 1}
                    {toolName.startsWith('riskReward')
                      ? idx === 0
                        ? ' (Entry)'
                        : idx === 1
                        ? ' (Take Profit)'
                        : ' (Stop Loss)'
                      : ''}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10.5px] text-[#787b86] mb-1">Price</label>
                      <input
                        type="number"
                        step={symbolInfo.point || 0.01}
                        value={pt.value ?? ''}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v)) return;
                          const nextPts = points.map((p, i) =>
                            i === idx ? { ...p, value: v } : p
                          );
                          coordsDirtyRef.current = true;
                          setPoints(nextPts);
                          pushLivePreview(nextPts, styles, ext, false, true);
                        }}
                        className="w-full px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] font-mono-num text-[12px] text-white outline-none focus:border-[#2962ff]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] text-[#787b86] mb-1">Bar #</label>
                      <input
                        type="number"
                        step={1}
                        min={0}
                        max={Math.max(0, candles.length - 1)}
                        value={pt.dataIndex ?? ''}
                        onChange={(e) => {
                          const barIdx = parseInt(e.target.value, 10);
                          if (!Number.isFinite(barIdx)) return;
                          const clamped = Math.max(0, Math.min(candles.length - 1, barIdx));
                          const syncedTs = candles[clamped]?.timestamp ?? pt.timestamp;
                          const nextPts = points.map((p, i) =>
                            i === idx
                              ? { ...p, dataIndex: clamped, timestamp: syncedTs }
                              : p
                          );
                          coordsDirtyRef.current = true;
                          setPoints(nextPts);
                          pushLivePreview(nextPts, styles, ext, false, true);
                        }}
                        className="w-full px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] font-mono-num text-[12px] text-white outline-none focus:border-[#2962ff]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] text-[#787b86] mb-1">Date / Time</label>
                      <input
                        type="datetime-local"
                        value={tsToLocalInput(pt.timestamp)}
                        onChange={(e) => {
                          const nextTs = localInputToTs(e.target.value, pt.timestamp);
                          let syncedIdx = pt.dataIndex;
                          if (nextTs && candles.length > 0) {
                            let bestIdx = 0;
                            let bestDiff = Infinity;
                            for (let ci = 0; ci < candles.length; ci++) {
                              const diff = Math.abs(candles[ci].timestamp - nextTs);
                              if (diff < bestDiff) {
                                bestDiff = diff;
                                bestIdx = ci;
                              }
                            }
                            syncedIdx = bestIdx;
                          }
                          const nextPts = points.map((p, i) =>
                            i === idx
                              ? { ...p, timestamp: nextTs, dataIndex: syncedIdx }
                              : p
                          );
                          coordsDirtyRef.current = true;
                          setPoints(nextPts);
                          pushLivePreview(nextPts, styles, ext, false, true);
                        }}
                        className="w-full px-1.5 py-1 rounded bg-[#131722] border border-[#2a2e39] font-mono-num text-[10.5px] text-white outline-none focus:border-[#2962ff]"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ==================== TAB 3: VISIBILITY ==================== */}
          {tab === 'visibility' && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 p-2.5 rounded bg-[#131722]/60 border border-[#2a2e39] cursor-pointer">
                <input
                  type="checkbox"
                  checked={vis.allTimeframes !== false}
                  onChange={(e) =>
                    updateExt({
                      visibility: {
                        allTimeframes: e.target.checked,
                        timeframes:
                          vis.timeframes && vis.timeframes.length > 0
                            ? vis.timeframes
                            : allTimeframeOptions,
                      },
                    })
                  }
                  className="accent-[#2962ff]"
                />
                <span className="font-medium text-white">Show on all timeframes</span>
              </label>

              <div className="text-[11px] text-[#787b86]">
                Or select specific timeframes where this drawing should remain visible:
              </div>

              <div className="grid grid-cols-3 gap-2">
                {allTimeframeOptions.map((tf) => {
                  const checked =
                    vis.allTimeframes !== false || (vis.timeframes || []).includes(tf);
                  return (
                    <label
                      key={tf}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded border text-[12px] font-mono-num cursor-pointer ${
                        vis.allTimeframes !== false
                          ? 'bg-[#131722]/40 border-[#2a2e39]/60 text-[#787b86]'
                          : checked
                          ? 'bg-[#2962ff]/15 border-[#2962ff]/50 text-white'
                          : 'bg-[#131722] border-[#2a2e39] text-[#787b86]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const baseList =
                            vis.allTimeframes !== false
                              ? allTimeframeOptions
                              : vis.timeframes || [];
                          const nextList = e.target.checked
                            ? Array.from(new Set([...baseList, tf]))
                            : baseList.filter((x) => x !== tf);
                          updateExt({
                            visibility: {
                              allTimeframes: false,
                              timeframes: nextList,
                            },
                          });
                        }}
                        className="accent-[#2962ff]"
                      />
                      <span>{tf}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer: Template Dropdown + Cancel / Ok */}
        <div className="px-4 py-3 border-t border-[#2a2e39] flex items-center justify-between bg-[#131722]/40 shrink-0 relative">
          <div className="relative">
            <button
              onClick={() => setTemplateMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#131722] hover:bg-[#2a2e39] border border-[#2a2e39] text-[12px] text-[#d1d4dc] cursor-pointer"
            >
              <span>Template</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#787b86]" />
            </button>
            {templateMenuOpen && (
              <div className="absolute left-0 bottom-10 w-56 rounded bg-[#1e222d] border border-[#2a2e39] shadow-tv py-1 z-50">
                <button
                  onClick={handleSaveTemplate}
                  className="w-full px-3 py-1.5 text-left text-[12px] hover:bg-[#2a2e39] flex items-center gap-2 text-[#d1d4dc] cursor-pointer"
                >
                  <BookmarkPlus className="w-3.5 h-3.5 text-[#2962ff]" />
                  <span>Save As...</span>
                </button>
                <button
                  onClick={handleApplyDefault}
                  className="w-full px-3 py-1.5 text-left text-[12px] hover:bg-[#2a2e39] flex items-center gap-2 text-[#d1d4dc] cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-[#787b86]" />
                  <span>Apply Default</span>
                </button>
                {templates.filter((t) => t.toolName === toolName).length > 0 && (
                  <div className="my-1 border-t border-[#2a2e39]" />
                )}
                {templates
                  .filter((t) => t.toolName === toolName)
                  .map((tpl) => (
                    <div
                      key={tpl.id}
                      onClick={() => handleApplyTemplate(tpl)}
                      className="w-full px-3 py-1.5 text-[12px] hover:bg-[#2a2e39] flex items-center justify-between cursor-pointer text-[#d1d4dc]"
                    >
                      <span className="truncate">{tpl.name}</span>
                      <button
                        onClick={(e) => handleDeleteTemplate(tpl.id, e)}
                        title="Delete template"
                        className="p-0.5 rounded hover:text-[#f23645] text-[#787b86]"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="px-4 py-1.5 rounded bg-[#131722] hover:bg-[#2a2e39] border border-[#2a2e39] text-[12px] text-[#d1d4dc] cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleOk}
              className="flex items-center gap-1 px-5 py-1.5 rounded bg-white hover:bg-[#e2e8f0] text-[#131722] font-semibold text-[12px] cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Ok</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
