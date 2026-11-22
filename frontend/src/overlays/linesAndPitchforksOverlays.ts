import { OverlayTemplate } from 'klinecharts';
import { DrawingExtendConfig } from '../types/chart';
import { useChartStore } from '../store/useChartStore';
import { isOverlayVisibleForTimeframe, hexToRgba, formatFibPrice, toHairlineSize } from './index';

const TRANSPARENT_TEXT_RESET = {
  backgroundColor: 'transparent',
  borderColor: 'transparent',
  borderSize: 0,
  paddingLeft: 0,
  paddingRight: 0,
  paddingTop: 0,
  paddingBottom: 0,
};

function extendSegment(
  c0: { x: number; y: number },
  c1: { x: number; y: number },
  bounding: { width: number; height: number },
  extendLeft?: boolean,
  extendRight?: boolean
) {
  let pA = c0;
  let pB = c1;
  const dx = pB.x - pA.x;
  const dy = pB.y - pA.y;
  if ((extendLeft || extendRight) && Math.abs(dx) > 0.001) {
    const slope = dy / dx;
    const leftPt = pA.x <= pB.x ? pA : pB;
    const rightPt = pA.x <= pB.x ? pB : pA;
    pA = extendLeft ? { x: 0, y: leftPt.y - leftPt.x * slope } : leftPt;
    pB = extendRight
      ? { x: bounding.width, y: rightPt.y + (bounding.width - rightPt.x) * slope }
      : rightPt;
  }
  return [pA, pB] as const;
}

function projectRay(
  origin: { x: number; y: number },
  vx: number,
  vy: number,
  bounding: { width: number; height: number }
): { x: number; y: number } {
  const mag = Math.hypot(vx, vy);
  if (mag < 0.001) return { x: origin.x + 120, y: origin.y };
  const scale = Math.max(bounding.width, bounding.height) * 1.8 / mag;
  return { x: origin.x + vx * scale, y: origin.y + vy * scale };
}

/**
 * 1. Info Line (`infoLine`) — Trendline with live delta price, %, pips, bars & angle card
 */
export const infoLineOverlay: OverlayTemplate = {
  name: 'infoLine',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding, overlay, precision }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1] = coordinates;
    const ext = (overlay.extendData || {}) as DrawingExtendConfig;
    const ls = (overlay.styles as any)?.line || {};
    const color = ls.color || '#2962ff';
    const digits = precision?.price ?? 2;

    const [pA, pB] = extendSegment(c0, c1, bounding, ext.extendLeft, ext.extendRight);
    const p0 = overlay.points[0];
    const p1 = overlay.points[1];
    const v0 = p0?.value ?? 0;
    const v1 = p1?.value ?? 0;
    const priceDiff = v1 - v0;
    const pctDiff = v0 !== 0 ? (priceDiff / v0) * 100 : 0;
    const pipUnit = Math.pow(10, -digits) * 10;
    const pips = pipUnit > 0 ? Math.abs(priceDiff) / pipUnit : 0;
    const bars = Math.abs((p1?.dataIndex ?? 0) - (p0?.dataIndex ?? 0));
    const angleDeg = (Math.atan2(-(c1.y - c0.y), c1.x - c0.x) * 180) / Math.PI;
    const sign = priceDiff >= 0 ? '+' : '';

    return [
      {
        type: 'line',
        attrs: { coordinates: [pA, pB] },
        styles: {
          color,
          size: toHairlineSize(ls.size || 1),
          style: ls.style || 'solid',
          dashedValue: [4, 4],
        },
      },
      {
        type: 'text',
        ignoreEvent: true,
        attrs: {
          x: (c0.x + c1.x) / 2,
          y: (c0.y + c1.y) / 2 - 14,
          text: `Δ ${sign}${formatFibPrice(priceDiff, digits)} (${sign}${pctDiff.toFixed(2)}%) · ${pips.toFixed(1)}p · ${bars}b · ${angleDeg.toFixed(1)}°`,
          align: 'center',
          baseline: 'bottom',
        },
        styles: {
          color: '#d1d4dc',
          size: 10.5,
          weight: 'bold',
          family: 'JetBrains Mono, monospace',
          backgroundColor: '#1e222d',
          borderColor: color,
          borderSize: 1,
          borderRadius: 4,
          paddingLeft: 7,
          paddingRight: 7,
          paddingTop: 3,
          paddingBottom: 3,
        },
      },
    ];
  },
};

/**
 * 2. Trend Angle (`trendAngle`) — Trendline with horizontal ref line, 36px arc & degree label
 */
export const trendAngleOverlay: OverlayTemplate = {
  name: 'trendAngle',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1] = coordinates;
    const ls = (overlay.styles as any)?.line || {};
    const color = ls.color || '#2962ff';

    const rad = Math.atan2(c1.y - c0.y, c1.x - c0.x);
    const angleDeg = (-rad * 180) / Math.PI;
    const radius = 36;
    const arcPts: Array<{ x: number; y: number }> = [];
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const a = (rad * i) / steps;
      arcPts.push({ x: c0.x + Math.cos(a) * radius, y: c0.y + Math.sin(a) * radius });
    }

    return [
      {
        type: 'line',
        attrs: { coordinates: [c0, c1] },
        styles: { color, size: toHairlineSize(ls.size || 1), style: ls.style || 'solid', dashedValue: [4, 4] },
      },
      {
        type: 'line',
        ignoreEvent: true,
        attrs: { coordinates: [c0, { x: c0.x + 70, y: c0.y }] },
        styles: { color: '#787b86', size: 1, style: 'dashed', dashedValue: [3, 3] },
      },
      {
        type: 'line',
        ignoreEvent: true,
        attrs: { coordinates: arcPts },
        styles: { color, size: 1, style: 'solid' },
      },
      {
        type: 'text',
        ignoreEvent: true,
        attrs: {
          x: c0.x + 48,
          y: c0.y - 6,
          text: `${angleDeg.toFixed(1)}°`,
          align: 'left',
          baseline: 'bottom',
        },
        styles: {
          color,
          size: 11,
          weight: 'bold',
          family: 'JetBrains Mono, monospace',
          ...TRANSPARENT_TEXT_RESET,
        },
      },
    ];
  },
};

/**
 * 3. Crossline (`crossLine`) — 1-point full-width horizontal + full-height vertical crosshair lock
 */
export const crossLineOverlay: OverlayTemplate = {
  name: 'crossLine',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    if (coordinates.length === 0) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const c = coordinates[0];
    const ls = (overlay.styles as any)?.line || {};
    const color = ls.color || '#2962ff';
    const size = ls.size || 1.5;
    const style = ls.style || 'solid';
    return [
      {
        type: 'line',
        attrs: { coordinates: [{ x: 0, y: c.y }, { x: bounding.width, y: c.y }] },
        styles: { color, size, style, dashedValue: [4, 4] },
      },
      {
        type: 'line',
        attrs: { coordinates: [{ x: c.x, y: 0 }, { x: c.x, y: bounding.height }] },
        styles: { color, size, style, dashedValue: [4, 4] },
      },
    ];
  },
};

/**
 * 4. Regression Trend (`regressionTrend`) — OLS Linear Regression + ±2σ Channel & Pearson R
 */
export const regressionTrendOverlay: OverlayTemplate = {
  name: 'regressionTrend',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1] = coordinates;
    const ext = (overlay.extendData || {}) as DrawingExtendConfig;
    const ls = (overlay.styles as any)?.line || {};
    const color = ls.color || '#2962ff';
    const alpha = ext.backgroundOpacity ?? 0.14;

    const p0 = overlay.points[0];
    const p1 = overlay.points[1];
    const candles = useChartStore.getState().candles;
    const idxA = Math.max(0, Math.min(p0?.dataIndex ?? 0, p1?.dataIndex ?? 0));
    const idxB = Math.min(candles.length - 1, Math.max(p0?.dataIndex ?? 0, p1?.dataIndex ?? 0));
    const leftX = Math.min(c0.x, c1.x);
    const rightX = Math.max(c0.x, c1.x);

    let yStart = c0.x <= c1.x ? c0.y : c1.y;
    let yEnd = c0.x <= c1.x ? c1.y : c0.y;
    let halfBandPx = 35;
    let pearsonR = 0;

    const n = idxB - idxA + 1;
    if (n >= 3 && p0?.value !== undefined && p1?.value !== undefined) {
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
      for (let i = 0; i < n; i++) {
        const yVal = candles[idxA + i].close;
        sumX += i;
        sumY += yVal;
        sumXY += i * yVal;
        sumXX += i * i;
        sumYY += yVal * yVal;
      }
      const denom = n * sumXX - sumX * sumX;
      if (Math.abs(denom) > 1e-9) {
        const slope = (n * sumXY - sumX * sumY) / denom;
        const intercept = (sumY - slope * sumX) / n;
        let sqErr = 0;
        for (let i = 0; i < n; i++) {
          const pred = intercept + slope * i;
          const err = candles[idxA + i].close - pred;
          sqErr += err * err;
        }
        const stdDev = Math.sqrt(sqErr / n);
        const rDenom = Math.sqrt((n * sumXX - sumX * sumX) * Math.max(0, n * sumYY - sumY * sumY));
        pearsonR = rDenom > 1e-9 ? (n * sumXY - sumX * sumY) / rDenom : 0;

        const priceSpan = Math.abs(p1.value - p0.value);
        const pxSpan = Math.abs(c1.y - c0.y);
        if (priceSpan > 1e-9 && pxSpan > 2) {
          const pxPerPrice = pxSpan / priceSpan;
          const refPrice = p0.value;
          const refY = c0.y;
          const yHatStart = intercept;
          const yHatEnd = intercept + slope * (n - 1);
          yStart = refY - (yHatStart - refPrice) * pxPerPrice;
          yEnd = refY - (yHatEnd - refPrice) * pxPerPrice;
          halfBandPx = Math.max(12, Math.min(220, 2 * stdDev * pxPerPrice));
        }
      }
    }

    const upStart = { x: leftX, y: yStart - halfBandPx };
    const upEnd = { x: rightX, y: yEnd - halfBandPx };
    const loStart = { x: leftX, y: yStart + halfBandPx };
    const loEnd = { x: rightX, y: yEnd + halfBandPx };

    return [
      {
        type: 'polygon',
        ignoreEvent: true,
        attrs: { coordinates: [upStart, upEnd, loEnd, loStart] },
        styles: { style: 'fill', color: hexToRgba(color, alpha) },
      },
      {
        type: 'line',
        attrs: { coordinates: [upStart, upEnd] },
        styles: { color: '#f23645', size: toHairlineSize(ls.size || 1), style: 'solid' },
      },
      {
        type: 'line',
        attrs: { coordinates: [loStart, loEnd] },
        styles: { color: '#089981', size: toHairlineSize(ls.size || 1), style: 'solid' },
      },
      {
        type: 'line',
        attrs: { coordinates: [{ x: leftX, y: yStart }, { x: rightX, y: yEnd }] },
        styles: { color, size: 1, style: 'dashed', dashedValue: [4, 4] },
      },
      {
        type: 'text',
        ignoreEvent: true,
        attrs: {
          x: leftX + 6,
          y: loStart.y + 12,
          text: `R = ${pearsonR.toFixed(2)}`,
          align: 'left',
          baseline: 'top',
        },
        styles: {
          color,
          size: 10.5,
          fontWeight: 'bold',
          family: 'JetBrains Mono, monospace',
          ...TRANSPARENT_TEXT_RESET,
        },
      },
    ];
  },
};

/**
 * 5. Flat Top/Bottom Channel (`flatTopBottom`) — 1 sloped wall (c0->c1) + 1 strictly horizontal wall at c2.y
 */
export const flatTopBottomOverlay: OverlayTemplate = {
  name: 'flatTopBottom',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1, c2] = coordinates;
    const ext = (overlay.extendData || {}) as DrawingExtendConfig;
    const ls = (overlay.styles as any)?.line || {};
    const color = ls.color || '#2962ff';
    const size = ls.size || 1.5;

    const figures: any[] = [
      {
        type: 'line',
        attrs: { coordinates: [c0, c1] },
        styles: { color, size, style: ls.style || 'solid', dashedValue: [4, 4] },
      },
    ];

    if (c2) {
      const f0 = { x: c0.x, y: c2.y };
      const f1 = { x: c1.x, y: c2.y };
      if (ext.showBackground !== false) {
        figures.unshift({
          type: 'polygon',
          ignoreEvent: true,
          attrs: { coordinates: [c0, c1, f1, f0] },
          styles: { style: 'fill', color: hexToRgba(color, ext.backgroundOpacity ?? 0.14) },
        });
      }
      figures.push({
        type: 'line',
        attrs: { coordinates: [f0, f1] },
        styles: { color, size, style: ls.style || 'solid', dashedValue: [4, 4] },
      });
    }
    return figures;
  },
};

/**
 * 6. Disjoint Channel (`disjointChannel`) — Diverging/converging wedge channel
 */
export const disjointChannelOverlay: OverlayTemplate = {
  name: 'disjointChannel',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1, c2] = coordinates;
    const ext = (overlay.extendData || {}) as DrawingExtendConfig;
    const ls = (overlay.styles as any)?.line || {};
    const color = ls.color || '#2962ff';
    const size = ls.size || 1.5;
    const dy = c1.y - c0.y;

    const figures: any[] = [
      {
        type: 'line',
        attrs: { coordinates: [c0, c1] },
        styles: { color, size, style: ls.style || 'solid', dashedValue: [4, 4] },
      },
    ];

    if (c2) {
      const d0 = { x: c0.x, y: c2.y };
      const d1 = { x: c1.x, y: c2.y - dy * 0.5 };
      if (ext.showBackground !== false) {
        figures.unshift({
          type: 'polygon',
          ignoreEvent: true,
          attrs: { coordinates: [c0, c1, d1, d0] },
          styles: { style: 'fill', color: hexToRgba(color, ext.backgroundOpacity ?? 0.14) },
        });
      }
      figures.push(
        {
          type: 'line',
          attrs: { coordinates: [d0, d1] },
          styles: { color, size, style: ls.style || 'solid', dashedValue: [4, 4] },
        },
        {
          type: 'line',
          ignoreEvent: true,
          attrs: {
            coordinates: [
              { x: c0.x, y: (c0.y + d0.y) / 2 },
              { x: c1.x, y: (c1.y + d1.y) / 2 },
            ],
          },
          styles: { color, size: 1, style: 'dashed', dashedValue: [4, 4] },
        }
      );
    }
    return figures;
  },
};

/**
 * 7. Pitchfork Family (`pitchfork`, `schiffPitchfork`, `modifiedSchiffPitchfork`, `insidePitchfork`)
 */
function createPitchforkTemplate(
  name: string,
  variant: 'standard' | 'schiff' | 'modifiedSchiff' | 'inside'
): OverlayTemplate {
  return {
    name,
    totalStep: 4,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      if (coordinates.length < 2) return [];
      if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
      const [c0, c1, c2] = coordinates;
      const ext = (overlay.extendData || {}) as DrawingExtendConfig;
      const ls = (overlay.styles as any)?.line || {};
      const color = ls.color || '#2962ff';

      if (!c2) {
        return [
          {
            type: 'line',
            attrs: { coordinates: [c0, c1] },
            styles: { color, size: toHairlineSize(1), style: 'solid' },
          },
        ];
      }

      const M = { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 };
      let O = c0;
      let vx = M.x - c0.x;
      let vy = M.y - c0.y;

      if (variant === 'schiff') {
        O = { x: c0.x, y: (c0.y + M.y) / 2 };
        vx = M.x - O.x;
        vy = M.y - O.y;
      } else if (variant === 'modifiedSchiff') {
        O = { x: (c0.x + M.x) / 2, y: (c0.y + M.y) / 2 };
        vx = M.x - O.x;
        vy = M.y - O.y;
      } else if (variant === 'inside') {
        O = M;
        vx = M.x - c0.x;
        vy = M.y - c0.y;
      }

      const medEnd = projectRay(O, vx, vy, bounding);
      const upEnd = projectRay(c1, vx, vy, bounding);
      const loEnd = projectRay(c2, vx, vy, bounding);
      const halfUp = { x: (c1.x + M.x) / 2, y: (c1.y + M.y) / 2 };
      const halfLo = { x: (c2.x + M.x) / 2, y: (c2.y + M.y) / 2 };
      const halfUpEnd = projectRay(halfUp, vx, vy, bounding);
      const halfLoEnd = projectRay(halfLo, vx, vy, bounding);

      const alpha = ext.backgroundOpacity ?? 0.12;
      const figures: any[] = [];

      if (ext.showBackground !== false && alpha > 0) {
        figures.push(
          {
            type: 'polygon',
            ignoreEvent: true,
            attrs: { coordinates: [c1, upEnd, medEnd, M] },
            styles: { style: 'fill', color: hexToRgba('#089981', alpha) },
          },
          {
            type: 'polygon',
            ignoreEvent: true,
            attrs: { coordinates: [M, medEnd, loEnd, c2] },
            styles: { style: 'fill', color: hexToRgba('#f23645', alpha) },
          }
        );
      }

      figures.push(
        // Crossbar c1 -> c2
        {
          type: 'line',
          attrs: { coordinates: [c1, c2] },
          styles: { color: '#787b86', size: 1, style: 'dashed', dashedValue: [3, 3] },
        },
        // Median Line
        {
          type: 'line',
          attrs: { coordinates: [O, medEnd] },
          styles: { color: '#f23645', size: toHairlineSize(ls.size || 1), style: 'solid' },
        },
        // Upper & Lower 1.0 Tines
        {
          type: 'line',
          attrs: { coordinates: [c1, upEnd] },
          styles: { color, size: toHairlineSize(ls.size || 1), style: 'solid' },
        },
        {
          type: 'line',
          attrs: { coordinates: [c2, loEnd] },
          styles: { color, size: toHairlineSize(ls.size || 1), style: 'solid' },
        },
        // 0.5 Internal Dashed Tines
        {
          type: 'line',
          ignoreEvent: true,
          attrs: { coordinates: [halfUp, halfUpEnd] },
          styles: { color, size: 1, style: 'dashed', dashedValue: [4, 4] },
        },
        {
          type: 'line',
          ignoreEvent: true,
          attrs: { coordinates: [halfLo, halfLoEnd] },
          styles: { color, size: 1, style: 'dashed', dashedValue: [4, 4] },
        }
      );

      return figures;
    },
  };
}

export const pitchforkOverlay = createPitchforkTemplate('pitchfork', 'standard');
export const schiffPitchforkOverlay = createPitchforkTemplate('schiffPitchfork', 'schiff');
export const modifiedSchiffPitchforkOverlay = createPitchforkTemplate(
  'modifiedSchiffPitchfork',
  'modifiedSchiff'
);
export const insidePitchforkOverlay = createPitchforkTemplate('insidePitchfork', 'inside');
