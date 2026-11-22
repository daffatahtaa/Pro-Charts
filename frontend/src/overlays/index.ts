import { registerOverlay, OverlayTemplate } from 'klinecharts';
import { DrawingExtendConfig, FibLevelItem, getContrastTextColor } from '../types/chart';
import { useChartStore } from '../store/useChartStore';
import { riskRewardLongOverlay, riskRewardShortOverlay } from './riskRewardOverlay';
import { rulerMeasureOverlay } from './rulerOverlay';
import { rectBoxOverlay, fibExtensionOverlay } from './fibExtensionOverlay';
import {
  infoLineOverlay,
  trendAngleOverlay,
  crossLineOverlay,
  regressionTrendOverlay,
  flatTopBottomOverlay,
  disjointChannelOverlay,
  pitchforkOverlay,
  schiffPitchforkOverlay,
  modifiedSchiffPitchforkOverlay,
  insidePitchforkOverlay,
} from './linesAndPitchforksOverlays';
import {
  forecastLineOverlay,
  barsPatternOverlay,
  ghostFeedOverlay,
  sectorToolOverlay,
  anchoredVwapOverlay,
  fixedRangeVolumeProfileOverlay,
  anchoredVolumeProfileOverlay,
  priceRangeOverlay,
  dateRangeOverlay,
} from './forecastAndVolumeOverlays';
import {
  textNoteOverlay,
  anchoredNoteOverlay,
  priceNoteOverlay,
  pinMarkerOverlay,
  chartTableOverlay,
  commentBubbleOverlay,
  signpostMarkerOverlay,
  flagMarkerOverlay,
  chartImageOverlay,
  socialPostTagOverlay,
  tradingIdeaTagOverlay,
  iconStampOverlay,
} from './textAndNotesOverlays';
import {
  fibChannelOverlay,
  fibTimeZoneOverlay,
  fibSpeedResistanceFanOverlay,
  trendBasedFibTimeOverlay,
  fibCirclesOverlay,
  fibSpiralOverlay,
  fibSpeedResistanceArcsOverlay,
  fibWedgeOverlay,
  pitchfanOverlay,
  gannBoxOverlay,
  gannSquareFixedOverlay,
  gannSquareOverlay,
  gannFanOverlay,
} from './fibAndGannOverlays';
import {
  xabcdPatternOverlay,
  cypherPatternOverlay,
  headAndShouldersOverlay,
  abcdPatternOverlay,
  trianglePatternOverlay,
  threeDrivesPatternOverlay,
  elliottImpulseOverlay,
  elliottCorrectionOverlay,
  elliottTriangleOverlay,
  elliottDoubleComboOverlay,
  elliottTripleComboOverlay,
  cyclicLinesOverlay,
  timeCyclesOverlay,
  sineLineOverlay,
} from './patternsAndWavesOverlays';
import {
  brushToolOverlay,
  highlighterToolOverlay,
  arrowMarkerOverlay,
  arrowLineOverlay,
  arrowMarkUpOverlay,
  arrowMarkDownOverlay,
  rotatedRectangleOverlay,
  pathToolOverlay,
  circleShapeOverlay,
  ellipseShapeOverlay,
  polylineShapeOverlay,
  triangleShapeOverlay,
  arcShapeOverlay,
  curveShapeOverlay,
  doubleCurveShapeOverlay,
} from './brushesAndShapesOverlays';

// Module-level active chart timeframe & pixel converter for synchronous overlay renderers
let activeOverlayTimeframe = '15m';

type PixelConverterFn = (
  pts: Array<{ dataIndex?: number; value?: number }>
) => Array<{ x?: number; y?: number }>;

let overlayPixelConverter: PixelConverterFn | null = null;

export function setOverlayPixelConverter(fn: PixelConverterFn | null) {
  overlayPixelConverter = fn;
}

export function convertOverlayPointsToPixel(
  pts: Array<{ dataIndex?: number; value?: number }>
): Array<{ x?: number; y?: number }> {
  if (!overlayPixelConverter) return [];
  try {
    return overlayPixelConverter(pts);
  } catch {
    return [];
  }
}

let overlayShiftPressed = false;
export function setOverlayShiftPressed(pressed: boolean) {
  overlayShiftPressed = pressed;
}
export function isOverlayShiftPressed(): boolean {
  return overlayShiftPressed;
}

type FromPixelConverterFn = (
  pts: Array<{ x?: number; y?: number }>
) => Array<{ timestamp?: number; dataIndex?: number; value?: number }>;

let overlayFromPixelConverter: FromPixelConverterFn | null = null;
export function setOverlayFromPixelConverter(fn: FromPixelConverterFn | null) {
  overlayFromPixelConverter = fn;
}
export function convertOverlayPixelsToPoints(
  pts: Array<{ x?: number; y?: number }>
): Array<{ timestamp?: number; dataIndex?: number; value?: number }> {
  if (!overlayFromPixelConverter) return [];
  try {
    return overlayFromPixelConverter(pts);
  } catch {
    return [];
  }
}

/**
 * Locks `movingPoint` relative to `anchorPoint` to the nearest 45-degree screen angle
 * (0°, 45°, 90°, 135°, 180°, -135°, -90°, -45°) while Shift is held.
 */
function snapPointTo45DegreeAngle(anchorPoint: any, movingPoint: any): void {
  if (!anchorPoint || !movingPoint) return;
  const pixels = convertOverlayPointsToPixel([anchorPoint, movingPoint]);
  if (pixels.length < 2) return;
  const cA = pixels[0];
  const cM = pixels[1];
  if (
    typeof cA?.x !== 'number' ||
    typeof cA?.y !== 'number' ||
    typeof cM?.x !== 'number' ||
    typeof cM?.y !== 'number'
  ) {
    return;
  }

  const dx = cM.x - cA.x;
  const dy = cM.y - cA.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return;

  const rawAngle = Math.atan2(dy, dx);
  const stepRad = Math.PI / 4; // 45 degrees
  const snappedAngle = Math.round(rawAngle / stepRad) * stepRad;
  const deg = ((Math.round((snappedAngle * 180) / Math.PI) % 360) + 360) % 360;

  // 1. Exact Horizontal Lock (0° / 180°): preserve X/bar, lock exact price!
  if (deg === 0 || deg === 180) {
    if (typeof anchorPoint.value === 'number') {
      movingPoint.value = anchorPoint.value;
    }
    return;
  }

  // 2. Exact Vertical Lock (90° / 270°): preserve price, lock exact bar/timestamp!
  if (deg === 90 || deg === 270) {
    if (typeof anchorPoint.dataIndex === 'number') {
      movingPoint.dataIndex = anchorPoint.dataIndex;
    }
    if (anchorPoint.timestamp !== undefined) {
      movingPoint.timestamp = anchorPoint.timestamp;
    }
    return;
  }

  // 3. Exact Visual 45° Diagonal Lock (45° / 135° / 225° / 315°):
  const targetX = cA.x + Math.cos(snappedAngle) * dist;
  const convertedX = convertOverlayPixelsToPoints([{ x: targetX, y: cM.y }]);
  if (convertedX.length > 0 && convertedX[0]) {
    const snappedBar = convertedX[0];
    if (typeof snappedBar.dataIndex === 'number') {
      movingPoint.dataIndex = snappedBar.dataIndex;
    }
    if (snappedBar.timestamp !== undefined) {
      movingPoint.timestamp = snappedBar.timestamp;
    }
    const actualPx = convertOverlayPointsToPixel([movingPoint]);
    const actualX = typeof actualPx[0]?.x === 'number' ? actualPx[0].x : targetX;
    const absDx = Math.abs(actualX - cA.x);
    const signY = Math.sin(snappedAngle) >= 0 ? 1 : -1;
    const exactTargetY = cA.y + signY * absDx;
    const convertedY = convertOverlayPixelsToPoints([{ x: actualX, y: exactTargetY }]);
    if (convertedY.length > 0 && typeof convertedY[0]?.value === 'number') {
      movingPoint.value = convertedY[0].value;
    }
  }
}

const ANGLE_LOCK_EXCLUDED = new Set([
  'horizontalStraightLine',
  'horizontalRayLine',
  'verticalStraightLine',
  'crossLine',
  'priceLine',
  'rectBox',
  'rulerMeasure',
  'priceRange',
  'dateRange',
  'riskRewardLong',
  'riskRewardShort',
  'tradePositionLine',
  'bidAskLine',
  'priceAlertLine',
  'simpleAnnotation',
  'simpleTag',
  'textNote',
  'anchoredNote',
  'pinMarker',
  'chartTable',
  'commentBubble',
  'signpostMarker',
  'flagMarker',
  'chartImage',
  'socialPostTag',
  'tradingIdeaTag',
  'iconStamp',
  'anchoredVwap',
  'anchoredVolumeProfile',
  'fixedRangeVolumeProfile',
  'gannBox',
  'gannSquare',
  'gannSquareFixed',
  'fibTimeZone',
  'cyclicLines',
  'timeCycles',
]);

function withShiftAngleLock(tpl: OverlayTemplate): OverlayTemplate {
  if (ANGLE_LOCK_EXCLUDED.has(tpl.name) || (tpl.totalStep ?? 2) < 3) {
    return tpl;
  }
  const origMoveDraw = tpl.performEventMoveForDrawing;
  const origPressedMove = tpl.performEventPressedMove;

  return {
    ...tpl,
    performEventMoveForDrawing: (event) => {
      if (isOverlayShiftPressed() && event.performPointIndex > 0) {
        const anchor = event.points[event.performPointIndex - 1];
        const moving = event.points[event.performPointIndex];
        snapPointTo45DegreeAngle(anchor, moving);
      }
      origMoveDraw?.(event);
    },
    performEventPressedMove: (event) => {
      if (isOverlayShiftPressed() && event.points.length >= 2) {
        const idx = event.performPointIndex;
        const anchorIdx = idx > 0 ? idx - 1 : 1;
        const anchor = event.points[anchorIdx];
        const moving = event.points[idx];
        snapPointTo45DegreeAngle(anchor, moving);
      }
      origPressedMove?.(event);
    },
  };
}

export function setOverlayActiveTimeframe(tf: string) {
  activeOverlayTimeframe = tf;
}

export function getOverlayActiveTimeframe(): string {
  return activeOverlayTimeframe;
}

export function isOverlayVisibleForTimeframe(extendData: any): boolean {
  const vis = (extendData as DrawingExtendConfig | undefined)?.visibility;
  if (!vis || vis.allTimeframes !== false) return true;
  if (!Array.isArray(vis.timeframes)) return true;
  return vis.timeframes.includes(activeOverlayTimeframe);
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = (hex || '#2962ff').replace('#', '');
  if (clean.length !== 6) return `rgba(41, 98, 255, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return `rgba(41, 98, 255, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

export function formatFibPrice(val: number, digits: number): string {
  return val.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Converts a UI line thickness (1px, 2px, 3px, 4px) into a crisp TradingView
 * physical-pixel hairline width on high-DPI HTML5 Canvas.
 */
export function toHairlineSize(px: number = 1): number {
  const raw = typeof px === 'number' && Number.isFinite(px) && px > 0 ? px : 1;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  if (raw <= 1) {
    return dpr > 1 ? Math.max(0.65, Number((1 / dpr).toFixed(2))) : 0.8;
  }
  return dpr > 1 ? Number((raw / Math.pow(dpr, 0.35)).toFixed(2)) : raw;
}

export const DEFAULT_FIB_LEVELS: FibLevelItem[] = [
  // Row 1: 0 | 0.236
  { enabled: true, ratio: 0, color: '#787b86' },
  { enabled: true, ratio: 0.236, color: '#787b86' },
  // Row 2: 0.382 | 0.5
  { enabled: true, ratio: 0.382, color: '#787b86' },
  { enabled: true, ratio: 0.5, color: '#787b86' },
  // Row 3: 0.618 | 0.786
  { enabled: true, ratio: 0.618, color: '#787b86' },
  { enabled: true, ratio: 0.786, color: '#787b86' },
  // Row 4: 1 | 1.618
  { enabled: true, ratio: 1, color: '#787b86' },
  { enabled: false, ratio: 1.618, color: '#2962ff' },
  // Row 5: 2.618 | 3.618
  { enabled: false, ratio: 2.618, color: '#f23645' },
  { enabled: false, ratio: 3.618, color: '#9c27b0' },
  // Row 6: 4.236 | 1.272
  { enabled: false, ratio: 4.236, color: '#e91e63' },
  { enabled: false, ratio: 1.272, color: '#ff9800' },
  // Row 7: 1.414 | 2.272
  { enabled: false, ratio: 1.414, color: '#f23645' },
  { enabled: false, ratio: 2.272, color: '#ff9800' },
  // Row 8: 2.414 | 2
  { enabled: false, ratio: 2.414, color: '#4caf50' },
  { enabled: false, ratio: 2, color: '#00bcd4' },
  // Row 9: 3 | 3.272
  { enabled: false, ratio: 3, color: '#787b86' },
  { enabled: false, ratio: 3.272, color: '#787b86' },
  // Row 10: 3.414 | 4
  { enabled: false, ratio: 3.414, color: '#2962ff' },
  { enabled: false, ratio: 4, color: '#f23645' },
  // Row 11: 4.272 | 0.62
  { enabled: false, ratio: 4.272, color: '#9c27b0' },
  { enabled: false, ratio: 0.62, color: '#f59e0b' },
  // Row 12: 0.79 | 0.705
  { enabled: false, ratio: 0.79, color: '#089981' },
  { enabled: false, ratio: 0.705, color: '#2962ff' },
];

function makeLabelFigure(
  x: number,
  y: number,
  label: string,
  _color: string,
  position: 'top' | 'center' | 'bottom' = 'top',
  align: 'left' | 'center' | 'right' = 'center'
) {
  const offsetY = position === 'bottom' ? y + 6 : position === 'center' ? y : y - 6;
  const baseline = position === 'bottom' ? 'top' : position === 'center' ? 'middle' : 'bottom';
  const canvasBg = useChartStore.getState().chartSettings.canvasBgColor;
  const textColor = getContrastTextColor(canvasBg) === '#ffffff' ? '#d1d4dc' : '#131722';
  return {
    type: 'text',
    ignoreEvent: true,
    attrs: {
      x,
      y: offsetY,
      text: label,
      align,
      baseline,
    },
    styles: {
      color: textColor,
      size: 11.5,
      weight: 'normal',
      family: 'Trebuchet MS, sans-serif',
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      borderSize: 0,
      paddingLeft: 0,
      paddingRight: 0,
      paddingTop: 0,
      paddingBottom: 0,
    },
  };
}

/**
 * Enhanced Trendline (`segment`) with custom extendData.label rendering
 */
const labeledSegmentOverlay: OverlayTemplate = {
  name: 'segment',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const ext = (overlay.extendData || {}) as DrawingExtendConfig;
    const lineStyle = (overlay.styles as any)?.line || {};
    const color = lineStyle.color || '#2962ff';

    let pA = coordinates[0];
    let pB = coordinates[1];
    const dx = pB.x - pA.x;
    const dy = pB.y - pA.y;
    if ((ext.extendLeft || ext.extendRight) && Math.abs(dx) > 0.001) {
      const slope = dy / dx;
      const leftPt = pA.x <= pB.x ? pA : pB;
      const rightPt = pA.x <= pB.x ? pB : pA;
      const newLeft = ext.extendLeft ? { x: 0, y: leftPt.y - leftPt.x * slope } : leftPt;
      const newRight = ext.extendRight
        ? { x: bounding.width, y: rightPt.y + (bounding.width - rightPt.x) * slope }
        : rightPt;
      pA = newLeft;
      pB = newRight;
    }

    const figures: any[] = [
      {
        type: 'line',
        attrs: { coordinates: [pA, pB] },
        styles: {
          color,
          size: toHairlineSize(lineStyle.size || 1),
          style: lineStyle.style || 'solid',
          dashedValue: lineStyle.dashedValue || [4, 4],
        },
      },
    ];
    const label = String(ext.label || '').trim();
    const pos = (ext.labelPosition || 'top') as 'top' | 'center' | 'bottom';
    if (label) {
      const midX = (coordinates[0].x + coordinates[1].x) / 2;
      const midY = (coordinates[0].y + coordinates[1].y) / 2;
      figures.push(makeLabelFigure(midX, midY, label, color, pos));
    }
    return figures;
  },
};

/**
 * Enhanced Ray Line (`rayLine`) with custom extendData.label rendering
 */
const labeledRayLineOverlay: OverlayTemplate = {
  name: 'rayLine',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1] = coordinates;
    const dx = c1.x - c0.x;
    const dy = c1.y - c0.y;
    let endX = c1.x;
    let endY = c1.y;
    if (Math.abs(dx) > 0.001) {
      endX = dx > 0 ? bounding.width : 0;
      endY = c0.y + ((endX - c0.x) / dx) * dy;
    } else {
      endY = dy > 0 ? bounding.height : 0;
    }

    const lineStyle = (overlay.styles as any)?.line || {};
    const color = lineStyle.color || '#2962ff';
    const figures: any[] = [
      {
        type: 'line',
        attrs: { coordinates: [c0, { x: endX, y: endY }] },
        styles: {
          color,
          size: toHairlineSize(lineStyle.size || 1),
          style: lineStyle.style || 'solid',
          dashedValue: lineStyle.dashedValue || [4, 4],
        },
      },
    ];
    const label = String((overlay.extendData as any)?.label || '').trim();
    const pos = ((overlay.extendData as any)?.labelPosition || 'top') as 'top' | 'center' | 'bottom';
    if (label) {
      figures.push(makeLabelFigure((c0.x + c1.x) / 2, (c0.y + c1.y) / 2, label, color, pos));
    }
    return figures;
  },
};

/**
 * Enhanced Horizontal Line (`horizontalStraightLine`) with clean TradingView boxless label
 * (splits the line cleanly around the text when vertically centered, matching TradingView)
 */
const labeledHorizontalLineOverlay: OverlayTemplate = {
  name: 'horizontalStraightLine',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    if (coordinates.length === 0) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const y = coordinates[0].y;
    const ext = (overlay.extendData || {}) as DrawingExtendConfig;
    const lineStyle = (overlay.styles as any)?.line || {};
    const color = lineStyle.color || '#2962ff';
    const lineStyles = {
      color,
      size: toHairlineSize(lineStyle.size || 1),
      style: lineStyle.style || 'solid',
      dashedValue: lineStyle.dashedValue || [4, 4],
    };

    const label = String(ext.label || '').trim();
    const pos = (ext.labelPosition || 'center') as 'top' | 'center' | 'bottom';
    const hAlign = (ext.labelHAlign || 'center') as 'left' | 'center' | 'right';

    const figures: any[] = [];

    if (!label || pos !== 'center') {
      figures.push({
        type: 'line',
        attrs: {
          coordinates: [
            { x: 0, y },
            { x: bounding.width, y },
          ],
        },
        styles: lineStyles,
      });
    } else {
      // Split the horizontal line cleanly around the centered text (no box, no strike-through)
      const estTextW = Math.max(24, label.length * 7.2);
      const pad = 10;
      let gapLeft = bounding.width / 2 - estTextW / 2 - pad;
      let gapRight = bounding.width / 2 + estTextW / 2 + pad;
      if (hAlign === 'left') {
        gapLeft = 6;
        gapRight = 14 + estTextW + pad;
      } else if (hAlign === 'right') {
        gapLeft = bounding.width - 14 - estTextW - pad;
        gapRight = bounding.width - 6;
      }

      if (gapLeft > 2) {
        figures.push({
          type: 'line',
          attrs: {
            coordinates: [
              { x: 0, y },
              { x: gapLeft, y },
            ],
          },
          styles: lineStyles,
        });
      }
      if (gapRight < bounding.width - 2) {
        figures.push({
          type: 'line',
          attrs: {
            coordinates: [
              { x: gapRight, y },
              { x: bounding.width, y },
            ],
          },
          styles: lineStyles,
        });
      }
    }

    if (label) {
      const labelX =
        hAlign === 'left'
          ? 14
          : hAlign === 'right'
          ? Math.max(14, bounding.width - 14)
          : bounding.width / 2;
      const offsetY = pos === 'bottom' ? y + 5 : pos === 'center' ? y : y - 5;
      const baseline = pos === 'bottom' ? 'top' : pos === 'center' ? 'middle' : 'bottom';
      const canvasBg = useChartStore.getState().chartSettings.canvasBgColor;
      const textColor = getContrastTextColor(canvasBg) === '#ffffff' ? '#d1d4dc' : '#131722';

      figures.push({
        type: 'text',
        ignoreEvent: true,
        attrs: {
          x: labelX,
          y: offsetY,
          text: label,
          align: hAlign,
          baseline,
        },
        styles: {
          color: textColor,
          size: 12,
          weight: 'normal',
          family: 'Trebuchet MS, sans-serif',
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          borderSize: 0,
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
        },
      });
    }

    return figures;
  },
};

const FIB_RETRACE_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

/**
 * Clean TradingView Fib Retracement (`fibonacciLine`):
 * - Neutral #787b86 horizontal levels by default, NO blue box behind text labels
 * - Background fills & diagonal Trend line OFF by default (toggleable in Settings)
 * - Labels placed cleanly outside right of horizontal lines with thousand separators
 */
const labeledFibRetraceOverlay: OverlayTemplate = {
  name: 'fibonacciLine',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding, overlay, precision }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const digits = precision?.price ?? 2;
    const ext = (overlay.extendData || {}) as DrawingExtendConfig;
    const baseColor = (overlay.styles as any)?.line?.color || '#787b86';

    const [c0, c1] = coordinates;
    const startX = Math.min(c0.x, c1.x);
    const endX = Math.max(c0.x, c1.x);
    const drawStartX = ext.extendLeft ? 0 : startX;
    const drawEndX = ext.extendRight ? bounding.width : Math.max(endX, startX + 40);
    const rectWidth = Math.max(2, drawEndX - drawStartX);

    const p0Val = overlay.points[0]?.value ?? 0;
    const p1Val = overlay.points[1]?.value ?? 0;
    const isRev = Boolean(ext.fibReverse);

    const anchor0Y = isRev ? c0.y : c1.y;
    const anchor1Y = isRev ? c1.y : c0.y;
    const anchor0Val = isRev ? p0Val : p1Val;
    const anchor1Val = isRev ? p1Val : p0Val;

    const ySpan = anchor1Y - anchor0Y;
    const valSpan = anchor1Val - anchor0Val;

    const rawLevels =
      ext.fibLevels && ext.fibLevels.length > 0 ? ext.fibLevels : DEFAULT_FIB_LEVELS;
    const activeLevels = rawLevels.filter((l) => l.enabled);

    const figures: any[] = [];

    // 1. Optional Background fills between consecutive sorted levels (OFF by default!)
    const showBg = Boolean(ext.showBackground);
    const bgAlpha = ext.backgroundOpacity ?? 0.12;
    if (showBg && bgAlpha > 0 && activeLevels.length >= 2) {
      const sorted = [...activeLevels].sort((a, b) => a.ratio - b.ratio);
      for (let i = 0; i < sorted.length - 1; i++) {
        const lvlA = sorted[i];
        const lvlB = sorted[i + 1];
        const yA = anchor0Y + ySpan * lvlA.ratio;
        const yB = anchor0Y + ySpan * lvlB.ratio;
        const rectTop = Math.min(yA, yB);
        const rectH = Math.abs(yB - yA);
        if (rectH < 0.5) continue;
        const fillHex = ext.useOneColor ? ext.oneColor || baseColor : lvlB.color;
        figures.push({
          type: 'rect',
          ignoreEvent: true,
          attrs: {
            x: drawStartX,
            y: rectTop,
            width: rectWidth,
            height: rectH,
          },
          styles: {
            style: 'fill',
            color: hexToRgba(fillHex, bgAlpha),
          },
        });
      }
    }

    // 2. Optional diagonal Trend line connecting point 1 and point 2 (OFF by default!)
    if (Boolean(ext.showTrendLine)) {
      const tlStyle = ext.trendLineStyle || 'dashed';
      figures.push({
        type: 'line',
        ignoreEvent: true,
        attrs: { coordinates: [c0, c1] },
        styles: {
          color: ext.trendLineColor || '#787b86',
          size: 1,
          style: tlStyle === 'solid' ? 'solid' : 'dashed',
          dashedValue: [4, 4],
        },
      });
    }

    // 3. Horizontal level lines & clean transparent text labels (NO blue block!)
    const lvlStyle = ext.levelsLineStyle || 'solid';
    const lvlWidth = toHairlineSize(ext.levelsLineWidth || 1);
    const dashedValue =
      lvlStyle === 'dotted' ? [2, 3] : lvlStyle === 'dashed' ? [6, 4] : undefined;

    const showLevels = ext.fibShowLevels !== false;
    const showPrices = ext.fibShowPrices !== false;
    const isPercent = ext.fibFormat === 'percent';
    const labelsAlign = ext.fibLabelsAlign || 'right';

    for (const lvl of activeLevels) {
      const y = anchor0Y + ySpan * lvl.ratio;
      const val = anchor0Val + valSpan * lvl.ratio;
      const c = ext.useOneColor ? ext.oneColor || baseColor : lvl.color;

      figures.push({
        type: 'line',
        attrs: {
          coordinates: [
            { x: drawStartX, y },
            { x: drawEndX, y },
          ],
        },
        styles: {
          color: c,
          size: lvlWidth,
          style: lvlStyle === 'solid' ? 'solid' : 'dashed',
          ...(dashedValue ? { dashedValue } : {}),
        },
      });

      if (showLevels || showPrices) {
        const lvlStr = showLevels
          ? isPercent
            ? `${Number((lvl.ratio * 100).toFixed(2))}%`
            : `${lvl.ratio}`
          : '';
        const priceStr = showPrices ? `(${formatFibPrice(val, digits)})` : '';
        const fullText = [lvlStr, priceStr].filter(Boolean).join(' ');
        if (fullText) {
          let labelX = drawEndX + 8;
          let textAlign: CanvasTextAlign = 'left';
          let textBaseline: CanvasTextBaseline = 'middle';
          let labelY = y;

          if (labelsAlign === 'right') {
            if (ext.extendRight || drawEndX > bounding.width - 95) {
              labelX = Math.min(drawEndX, bounding.width) - 8;
              textAlign = 'right';
              textBaseline = 'bottom';
              labelY = y - 3;
            } else {
              labelX = drawEndX + 8;
              textAlign = 'left';
              textBaseline = 'middle';
              labelY = y;
            }
          } else if (labelsAlign === 'center') {
            labelX = (drawStartX + drawEndX) / 2;
            textAlign = 'center';
            textBaseline = 'bottom';
            labelY = y - 3;
          } else {
            if (ext.extendLeft || drawStartX < 95) {
              labelX = Math.max(0, drawStartX) + 6;
              textAlign = 'left';
              textBaseline = 'bottom';
              labelY = y - 3;
            } else {
              labelX = drawStartX - 8;
              textAlign = 'right';
              textBaseline = 'middle';
              labelY = y;
            }
          }

          figures.push({
            type: 'text',
            ignoreEvent: true,
            attrs: {
              x: labelX,
              y: labelY,
              text: fullText,
              align: textAlign,
              baseline: textBaseline,
            },
            styles: {
              color: c,
              size: 11,
              weight: 'normal',
              family: 'Trebuchet MS, sans-serif',
              backgroundColor: 'transparent',
              borderColor: 'transparent',
              borderSize: 0,
              paddingLeft: 0,
              paddingRight: 0,
              paddingTop: 0,
              paddingBottom: 0,
            },
          });
        }
      }
    }

    // 4. Optional user Setup / Note Tag
    const customLabel = String(ext.label || '').trim();
    if (customLabel) {
      const pos = (ext.labelPosition || 'top') as 'top' | 'center' | 'bottom';
      const topY = Math.min(c0.y, c1.y);
      const botY = Math.max(c0.y, c1.y);
      const badgeY =
        pos === 'bottom' ? botY + 14 : pos === 'center' ? (topY + botY) / 2 : topY - 14;
      figures.push(
        makeLabelFigure((drawStartX + drawEndX) / 2, badgeY, customLabel, '#2962ff', pos)
      );
    }

    return figures;
  },
};

function extractOverlayText(extendData: any, fallback = 'Text'): string {
  if (typeof extendData === 'string') return extendData.trim() || fallback;
  if (extendData && typeof extendData === 'object') {
    if (typeof extendData.label === 'string' && extendData.label.trim()) {
      return extendData.label;
    }
    if (typeof extendData.text === 'string' && extendData.text.trim()) {
      return extendData.text;
    }
  }
  return fallback;
}

/**
 * Custom Draggable Callout Annotation (`simpleAnnotation`) — fixes [object Object] & enables drag
 */
const customSimpleAnnotationOverlay: OverlayTemplate = {
  name: 'simpleAnnotation',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length === 0) return [];
    const c = coordinates[0];
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    const text = extractOverlayText(overlay.extendData, 'Annotation (Type in Label box)');
    return [
      {
        type: 'line',
        attrs: {
          coordinates: [
            { x: c.x, y: c.y },
            { x: c.x, y: c.y - 22 },
          ],
        },
        styles: { color, size: 1.5 },
      },
      {
        type: 'text',
        ignoreEvent: false,
        attrs: {
          x: c.x,
          y: c.y - 22,
          text,
          align: 'center',
          baseline: 'bottom',
        },
        styles: {
          color: '#ffffff',
          size: 11.5,
          weight: 'bold',
          family: 'Trebuchet MS, sans-serif',
          backgroundColor: '#1e222d',
          borderColor: color,
          borderSize: 1.5,
          borderRadius: 4,
          paddingLeft: 8,
          paddingRight: 8,
          paddingTop: 5,
          paddingBottom: 5,
        },
      },
    ];
  },
};

/**
 * Custom Draggable Price / Note Tag (`simpleTag`) — fixes [object Object] & enables drag
 */
const customSimpleTagOverlay: OverlayTemplate = {
  name: 'simpleTag',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay, precision }) => {
    if (coordinates.length === 0) return [];
    const c = coordinates[0];
    const priceVal = overlay.points[0]?.value;
    const digits = precision?.price ?? 2;
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    const customLabel = extractOverlayText(overlay.extendData, '');
    const priceStr = priceVal !== undefined ? priceVal.toFixed(digits) : 'Tag';
    const displayText = customLabel ? `${customLabel} (${priceStr})` : priceStr;

    return [
      {
        type: 'text',
        ignoreEvent: false,
        attrs: {
          x: c.x,
          y: c.y,
          text: displayText,
          align: 'center',
          baseline: 'middle',
        },
        styles: {
          color: '#ffffff',
          size: 11,
          weight: 'bold',
          family: 'JetBrains Mono, monospace',
          backgroundColor: color,
          borderRadius: 3,
          paddingLeft: 7,
          paddingRight: 7,
          paddingTop: 4,
          paddingBottom: 4,
        },
      },
    ];
  },
};

/**
 * Non-persisted Trade Position / SL / TP / Pending Order horizontal line on chart (Clickable Badge!)
 */
const tradePositionLineOverlay: OverlayTemplate = {
  name: 'tradePositionLine',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    if (coordinates.length === 0) return [];
    const y = coordinates[0].y;
    const ext = (overlay.extendData || {}) as {
      label?: string;
      color?: string;
      dashed?: boolean;
      clickable?: boolean;
    };
    const color = ext.color || '#089981';
    const label = ext.label || '';

    return [
      {
        type: 'line',
        ignoreEvent: true,
        attrs: {
          coordinates: [
            { x: 0, y },
            { x: bounding.width, y },
          ],
        },
        styles: {
          color,
          size: ext.dashed ? 1 : 1.5,
          style: ext.dashed ? 'dashed' : 'solid',
          dashedValue: [4, 4],
        },
      },
      ...(label
        ? [
            {
              type: 'text',
              ignoreEvent: ext.clickable === false,
              attrs: {
                x: bounding.width - 8,
                y,
                text: label,
                align: 'right',
                baseline: 'middle',
              },
              styles: {
                color: '#ffffff',
                size: 10.5,
                weight: 'bold',
                family: 'JetBrains Mono, monospace',
                backgroundColor: color,
                borderRadius: 3,
                paddingLeft: 7,
                paddingRight: 7,
                paddingTop: 3,
                paddingBottom: 3,
              },
            },
          ]
        : []),
    ];
  },
};

/**
 * Non-persisted Bid / Ask & High/Low horizontal thin dashed lines
 */
const bidAskLineOverlay: OverlayTemplate = {
  name: 'bidAskLine',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    if (coordinates.length === 0) return [];
    const y = coordinates[0].y;
    const ext = (overlay.extendData || {}) as { color?: string; label?: string };
    const color = ext.color || '#089981';
    return [
      {
        type: 'line',
        ignoreEvent: true,
        attrs: {
          coordinates: [
            { x: 0, y },
            { x: bounding.width, y },
          ],
        },
        styles: {
          color,
          size: 1,
          style: 'dashed',
          dashedValue: [2, 2],
        },
      },
    ];
  },
};

/**
 * Non-persisted Price Alert horizontal dashed line on chart
 */
const priceAlertLineOverlay: OverlayTemplate = {
  name: 'priceAlertLine',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    if (coordinates.length === 0) return [];
    const y = coordinates[0].y;
    const ext = (overlay.extendData || {}) as { label?: string; triggered?: boolean };
    const color = ext.triggered ? '#787b86' : '#f59e0b';
    return [
      {
        type: 'line',
        ignoreEvent: true,
        attrs: {
          coordinates: [
            { x: 0, y },
            { x: bounding.width, y },
          ],
        },
        styles: {
          color,
          size: 1,
          style: 'dashed',
          dashedValue: [5, 3],
        },
      },
      {
        type: 'text',
        ignoreEvent: true,
        attrs: {
          x: 12,
          y: y - 4,
          text: ext.label || 'ALERT',
          align: 'left',
          baseline: 'bottom',
        },
        styles: {
          color: '#131722',
          size: 10,
          weight: 'bold',
          family: 'JetBrains Mono, monospace',
          backgroundColor: color,
          borderRadius: 2,
          paddingLeft: 5,
          paddingRight: 5,
          paddingTop: 1,
          paddingBottom: 1,
        },
      },
    ];
  },
};

/**
 * Custom Extended Line (`straightLine`) — extends across full chart width with Label & Visibility
 */
const customStraightLineOverlay: OverlayTemplate = {
  name: 'straightLine',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1] = coordinates;
    const ext = (overlay.extendData || {}) as DrawingExtendConfig;
    const lineStyle = (overlay.styles as any)?.line || {};
    const color = lineStyle.color || '#2962ff';

    const dx = c1.x - c0.x;
    const dy = c1.y - c0.y;
    let pStart = c0;
    let pEnd = c1;
    if (Math.abs(dx) > 0.001) {
      const slope = dy / dx;
      pStart = { x: 0, y: c0.y - c0.x * slope };
      pEnd = { x: bounding.width, y: c0.y + (bounding.width - c0.x) * slope };
    } else {
      pStart = { x: c0.x, y: 0 };
      pEnd = { x: c0.x, y: bounding.height };
    }

    const figures: any[] = [
      {
        type: 'line',
        attrs: { coordinates: [pStart, pEnd] },
        styles: {
          color,
          size: toHairlineSize(lineStyle.size || 1),
          style: lineStyle.style || 'solid',
          dashedValue: lineStyle.dashedValue || [4, 4],
        },
      },
    ];
    const label = String(ext.label || '').trim();
    if (label) {
      const pos = (ext.labelPosition || 'top') as 'top' | 'center' | 'bottom';
      figures.push(makeLabelFigure((c0.x + c1.x) / 2, (c0.y + c1.y) / 2, label, color, pos));
    }
    return figures;
  },
};

/**
 * Custom Horizontal Ray (`horizontalRayLine`) — extends right from anchor with Label & Visibility
 */
const customHorizontalRayOverlay: OverlayTemplate = {
  name: 'horizontalRayLine',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    if (coordinates.length === 0) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const c = coordinates[0];
    const ext = (overlay.extendData || {}) as DrawingExtendConfig;
    const lineStyle = (overlay.styles as any)?.line || {};
    const color = lineStyle.color || '#2962ff';
    const figures: any[] = [
      {
        type: 'line',
        attrs: {
          coordinates: [
            { x: c.x, y: c.y },
            { x: bounding.width, y: c.y },
          ],
        },
        styles: {
          color,
          size: toHairlineSize(lineStyle.size || 1),
          style: lineStyle.style || 'solid',
          dashedValue: lineStyle.dashedValue || [4, 4],
        },
      },
    ];
    const label = String(ext.label || '').trim();
    if (label) {
      const pos = (ext.labelPosition || 'top') as 'top' | 'center' | 'bottom';
      figures.push(makeLabelFigure(Math.min(c.x + 60, bounding.width - 70), c.y, label, color, pos));
    }
    return figures;
  },
};

/**
 * Custom Vertical Line (`verticalStraightLine`) — full height with Label & Visibility
 */
const customVerticalLineOverlay: OverlayTemplate = {
  name: 'verticalStraightLine',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    if (coordinates.length === 0) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const x = coordinates[0].x;
    const ext = (overlay.extendData || {}) as DrawingExtendConfig;
    const lineStyle = (overlay.styles as any)?.line || {};
    const color = lineStyle.color || '#2962ff';
    const figures: any[] = [
      {
        type: 'line',
        attrs: {
          coordinates: [
            { x, y: 0 },
            { x, y: bounding.height },
          ],
        },
        styles: {
          color,
          size: toHairlineSize(lineStyle.size || 1),
          style: lineStyle.style || 'solid',
          dashedValue: lineStyle.dashedValue || [4, 4],
        },
      },
    ];
    const label = String(ext.label || '').trim();
    if (label) {
      const pos = (ext.labelPosition || 'top') as 'top' | 'center' | 'bottom';
      const lblY = pos === 'bottom' ? bounding.height - 24 : pos === 'center' ? bounding.height / 2 : 24;
      figures.push(makeLabelFigure(x, lblY, label, color, pos));
    }
    return figures;
  },
};

/**
 * Custom Price Label Line (`priceLine`) — horizontal ray with prominent price badge
 */
const customPriceLineOverlay: OverlayTemplate = {
  name: 'priceLine',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding, overlay, precision }) => {
    if (coordinates.length === 0) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const c = coordinates[0];
    const digits = precision?.price ?? 2;
    const price = overlay.points[0]?.value ?? 0;
    const ext = (overlay.extendData || {}) as DrawingExtendConfig;
    const lineStyle = (overlay.styles as any)?.line || {};
    const color = lineStyle.color || '#2962ff';
    const customLabel = String(ext.label || '').trim();
    const badgeText = customLabel ? `${customLabel} · ${price.toFixed(digits)}` : price.toFixed(digits);
    return [
      {
        type: 'line',
        attrs: {
          coordinates: [
            { x: c.x, y: c.y },
            { x: bounding.width, y: c.y },
          ],
        },
        styles: {
          color,
          size: toHairlineSize(lineStyle.size || 1),
          style: lineStyle.style || 'solid',
          dashedValue: lineStyle.dashedValue || [4, 4],
        },
      },
      {
        type: 'text',
        ignoreEvent: true,
        attrs: {
          x: c.x + 6,
          y: c.y - 4,
          text: badgeText,
          align: 'left',
          baseline: 'bottom',
        },
        styles: {
          color: '#ffffff',
          size: 11,
          weight: 'bold',
          family: 'JetBrains Mono, monospace',
          backgroundColor: color,
          borderRadius: 3,
          paddingLeft: 6,
          paddingRight: 6,
          paddingTop: 2,
          paddingBottom: 2,
        },
      },
    ];
  },
};

/**
 * Custom Parallel Channel (`parallelStraightLine`) — 3-point channel with Background Fill,
 * Dashed Middle Line, Extend Left/Right, Label & Per-Timeframe Visibility
 */
const customParallelChannelOverlay: OverlayTemplate = {
  name: 'parallelStraightLine',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1, c2] = coordinates;
    const ext = (overlay.extendData || {}) as DrawingExtendConfig;
    const lineStyle = (overlay.styles as any)?.line || {};
    const color = lineStyle.color || '#2962ff';
    const size = toHairlineSize(lineStyle.size || 1);
    const style = lineStyle.style || 'solid';

    const dx = c1.x - c0.x;
    const dy = c1.y - c0.y;
    const slope = Math.abs(dx) > 0.001 ? dy / dx : 0;

    const leftBase = c0.x <= c1.x ? c0 : c1;
    const rightBase = c0.x <= c1.x ? c1 : c0;
    const p1Start = ext.extendLeft
      ? { x: 0, y: leftBase.y - leftBase.x * slope }
      : leftBase;
    const p1End = ext.extendRight
      ? { x: bounding.width, y: rightBase.y + (bounding.width - rightBase.x) * slope }
      : rightBase;

    const figures: any[] = [
      {
        type: 'line',
        attrs: { coordinates: [p1Start, p1End] },
        styles: { color, size, style, dashedValue: [4, 4] },
      },
    ];

    if (c2) {
      // Vertical offset from line (c0->c1) at c2.x
      const lineYAtC2 = leftBase.y + (c2.x - leftBase.x) * slope;
      const offsetY = c2.y - lineYAtC2;
      const p2Start = { x: p1Start.x, y: p1Start.y + offsetY };
      const p2End = { x: p1End.x, y: p1End.y + offsetY };

      // Background Fill Polygon
      if (ext.showBackground !== false) {
        const alpha = ext.backgroundOpacity ?? 0.15;
        if (alpha > 0) {
          figures.unshift({
            type: 'polygon',
            ignoreEvent: true,
            attrs: { coordinates: [p1Start, p1End, p2End, p2Start] },
            styles: { style: 'fill', color: hexToRgba(color, alpha) },
          });
        }
      }

      // Parallel second border
      figures.push({
        type: 'line',
        attrs: { coordinates: [p2Start, p2End] },
        styles: { color, size, style, dashedValue: [4, 4] },
      });

      // Dashed Middle Line
      if (ext.showMiddleLine !== false) {
        const midStart = { x: p1Start.x, y: p1Start.y + offsetY / 2 };
        const midEnd = { x: p1End.x, y: p1End.y + offsetY / 2 };
        figures.push({
          type: 'line',
          ignoreEvent: true,
          attrs: { coordinates: [midStart, midEnd] },
          styles: { color, size: 1, style: 'dashed', dashedValue: [4, 4] },
        });
      }

      const label = String(ext.label || '').trim();
      if (label) {
        const pos = (ext.labelPosition || 'top') as 'top' | 'center' | 'bottom';
        const midX = (c0.x + c1.x) / 2;
        const midY = (c0.y + c1.y) / 2 + offsetY / 2;
        figures.push(makeLabelFigure(midX, midY, label, color, pos));
      }
    }

    return figures;
  },
};

let registered = false;

export function registerCustomOverlays() {
  if (registered) return;
  registered = true;
  const reg = (tpl: OverlayTemplate) => registerOverlay(withShiftAngleLock(tpl));
  reg(labeledSegmentOverlay);
  reg(labeledRayLineOverlay);
  reg(labeledHorizontalLineOverlay);
  reg(labeledFibRetraceOverlay);
  reg(customStraightLineOverlay);
  reg(customHorizontalRayOverlay);
  reg(customVerticalLineOverlay);
  reg(customPriceLineOverlay);
  reg(customParallelChannelOverlay);
  reg(customSimpleAnnotationOverlay);
  reg(customSimpleTagOverlay);
  reg(rectBoxOverlay);
  reg(rulerMeasureOverlay);
  reg(riskRewardLongOverlay);
  reg(riskRewardShortOverlay);
  reg(fibExtensionOverlay);
  // Lines, Channels & Pitchforks
  reg(infoLineOverlay);
  reg(trendAngleOverlay);
  reg(crossLineOverlay);
  reg(regressionTrendOverlay);
  reg(flatTopBottomOverlay);
  reg(disjointChannelOverlay);
  reg(pitchforkOverlay);
  reg(schiffPitchforkOverlay);
  reg(modifiedSchiffPitchforkOverlay);
  reg(insidePitchforkOverlay);
  // Forecasting, Volume-Based & Measurers
  reg(forecastLineOverlay);
  reg(barsPatternOverlay);
  reg(ghostFeedOverlay);
  reg(sectorToolOverlay);
  reg(anchoredVwapOverlay);
  reg(fixedRangeVolumeProfileOverlay);
  reg(anchoredVolumeProfileOverlay);
  reg(priceRangeOverlay);
  reg(dateRangeOverlay);
  // Text, Notes & Content
  reg(textNoteOverlay);
  reg(anchoredNoteOverlay);
  reg(priceNoteOverlay);
  reg(pinMarkerOverlay);
  reg(chartTableOverlay);
  reg(commentBubbleOverlay);
  reg(signpostMarkerOverlay);
  reg(flagMarkerOverlay);
  reg(chartImageOverlay);
  reg(socialPostTagOverlay);
  reg(tradingIdeaTagOverlay);
  reg(iconStampOverlay);
  // Fibonacci & Gann
  reg(fibChannelOverlay);
  reg(fibTimeZoneOverlay);
  reg(fibSpeedResistanceFanOverlay);
  reg(trendBasedFibTimeOverlay);
  reg(fibCirclesOverlay);
  reg(fibSpiralOverlay);
  reg(fibSpeedResistanceArcsOverlay);
  reg(fibWedgeOverlay);
  reg(pitchfanOverlay);
  reg(gannBoxOverlay);
  reg(gannSquareFixedOverlay);
  reg(gannSquareOverlay);
  reg(gannFanOverlay);
  // Chart Patterns, Elliott Waves & Cycles
  reg(xabcdPatternOverlay);
  reg(cypherPatternOverlay);
  reg(headAndShouldersOverlay);
  reg(abcdPatternOverlay);
  reg(trianglePatternOverlay);
  reg(threeDrivesPatternOverlay);
  reg(elliottImpulseOverlay);
  reg(elliottCorrectionOverlay);
  reg(elliottTriangleOverlay);
  reg(elliottDoubleComboOverlay);
  reg(elliottTripleComboOverlay);
  reg(cyclicLinesOverlay);
  reg(timeCyclesOverlay);
  reg(sineLineOverlay);
  // Brushes, Arrows & Shapes
  reg(brushToolOverlay);
  reg(highlighterToolOverlay);
  reg(arrowMarkerOverlay);
  reg(arrowLineOverlay);
  reg(arrowMarkUpOverlay);
  reg(arrowMarkDownOverlay);
  reg(rotatedRectangleOverlay);
  reg(pathToolOverlay);
  reg(circleShapeOverlay);
  reg(ellipseShapeOverlay);
  reg(polylineShapeOverlay);
  reg(triangleShapeOverlay);
  reg(arcShapeOverlay);
  reg(curveShapeOverlay);
  reg(doubleCurveShapeOverlay);
  // System overlays
  reg(tradePositionLineOverlay);
  reg(bidAskLineOverlay);
  reg(priceAlertLineOverlay);
}
