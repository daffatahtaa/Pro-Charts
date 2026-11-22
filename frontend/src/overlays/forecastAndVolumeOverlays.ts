import { OverlayTemplate } from 'klinecharts';
import { DrawingExtendConfig } from '../types/chart';
import { useChartStore } from '../store/useChartStore';
import {
  isOverlayVisibleForTimeframe,
  hexToRgba,
  formatFibPrice,
  convertOverlayPointsToPixel,
} from './index';

const TRANSPARENT_TEXT_RESET = {
  backgroundColor: 'transparent',
  borderColor: 'transparent',
  borderSize: 0,
  paddingLeft: 0,
  paddingRight: 0,
  paddingTop: 0,
  paddingBottom: 0,
};

function fmtDuration(ms: number): string {
  const totalMins = Math.max(0, Math.round(ms / 60000));
  const days = Math.floor(totalMins / 1440);
  const hrs = Math.floor((totalMins % 1440) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

/**
 * 1. Position Forecast (`forecastLine`)
 */
export const forecastLineOverlay: OverlayTemplate = {
  name: 'forecastLine',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay, precision }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1] = coordinates;
    const digits = precision?.price ?? 2;
    const v0 = overlay.points[0]?.value ?? 0;
    const v1 = overlay.points[1]?.value ?? 0;
    const diff = v1 - v0;
    const pct = v0 !== 0 ? (diff / v0) * 100 : 0;
    const color = diff >= 0 ? '#089981' : '#f23645';
    const sign = diff >= 0 ? '+' : '';

    return [
      {
        type: 'line',
        attrs: { coordinates: [c0, c1] },
        styles: { color, size: 2, style: 'dashed', dashedValue: [6, 4] },
      },
      {
        type: 'circle',
        ignoreEvent: true,
        attrs: { x: c1.x, y: c1.y, r: 7 },
        styles: { style: 'stroke', borderColor: color, borderSize: 2, color: 'transparent' },
      },
      {
        type: 'text',
        ignoreEvent: true,
        attrs: {
          x: c1.x + 12,
          y: c1.y,
          text: `Forecast: ${formatFibPrice(v1, digits)} (${sign}${pct.toFixed(2)}%)`,
          align: 'left',
          baseline: 'middle',
        },
        styles: {
          color: '#ffffff',
          size: 10.5,
          weight: 'bold',
          family: 'JetBrains Mono, monospace',
          backgroundColor: color,
          borderRadius: 3,
          paddingLeft: 6,
          paddingRight: 6,
          paddingTop: 3,
          paddingBottom: 3,
        },
      },
    ];
  },
};

/**
 * 2. Bars Pattern (`barsPattern`) — Projects selected historical candle slice forward as blue ghost bars
 */
export const barsPatternOverlay: OverlayTemplate = {
  name: 'barsPattern',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1] = coordinates;
    const p0 = overlay.points[0];
    const p1 = overlay.points[1];
    const ls = (overlay.styles as any)?.line || {};
    const color = ls.color || '#2962ff';

    const candles = useChartStore.getState().candles;
    const idxStart = Math.max(0, Math.min(p0?.dataIndex ?? 0, p1?.dataIndex ?? 0));
    const idxEnd = Math.min(candles.length - 1, Math.max(p0?.dataIndex ?? 0, p1?.dataIndex ?? 0));
    const slice = candles.slice(idxStart, Math.min(idxEnd + 1, idxStart + 80));

    const figures: any[] = [
      {
        type: 'rect',
        attrs: {
          x: Math.min(c0.x, c1.x),
          y: Math.min(c0.y, c1.y),
          width: Math.max(8, Math.abs(c1.x - c0.x)),
          height: Math.max(8, Math.abs(c1.y - c0.y)),
        },
        styles: {
          style: 'stroke_fill',
          color: hexToRgba(color, 0.08),
          borderColor: color,
          borderSize: 1,
          borderStyle: 'dashed',
          borderDashedValue: [4, 4],
        },
      },
    ];

    if (slice.length >= 2) {
      const priceSpan = Math.abs((p1?.value ?? 0) - (p0?.value ?? 0));
      const pxSpan = Math.abs(c1.y - c0.y);
      const pxPerPrice = priceSpan > 1e-9 && pxSpan > 2 ? pxSpan / priceSpan : 1;
      const stepX = Math.max(4, Math.abs(c1.x - c0.x) / Math.max(1, slice.length - 1));
      const baseX = Math.max(c0.x, c1.x) + stepX;
      const basePrice = slice[0].open;
      const baseY = c1.y;

      for (let i = 0; i < slice.length; i++) {
        const bar = slice[i];
        const x = baseX + i * stepX;
        const yO = baseY - (bar.open - basePrice) * pxPerPrice;
        const yC = baseY - (bar.close - basePrice) * pxPerPrice;
        const yH = baseY - (bar.high - basePrice) * pxPerPrice;
        const yL = baseY - (bar.low - basePrice) * pxPerPrice;
        const barColor = bar.close >= bar.open ? color : '#787b86';

        figures.push({
          type: 'line',
          ignoreEvent: true,
          attrs: { coordinates: [{ x, y: yH }, { x, y: yL }] },
          styles: { color: hexToRgba(barColor, 0.7), size: 1 },
        });
        figures.push({
          type: 'rect',
          ignoreEvent: true,
          attrs: {
            x: x - Math.max(1.5, stepX * 0.3),
            y: Math.min(yO, yC),
            width: Math.max(3, stepX * 0.6),
            height: Math.max(1.5, Math.abs(yC - yO)),
          },
          styles: { style: 'fill', color: hexToRgba(barColor, 0.55) },
        });
      }
    }

    return figures;
  },
};

/**
 * 3. Ghost Feed (`ghostFeed`) — 12 deterministic synthetic ghost candles along vector c0 -> c1
 */
export const ghostFeedOverlay: OverlayTemplate = {
  name: 'ghostFeed',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1] = coordinates;
    const seed = ((overlay.points[0]?.timestamp ?? 12345) % 997) / 997;
    const count = 12;
    const figures: any[] = [];
    const dx = (c1.x - c0.x) / count;
    const dy = (c1.y - c0.y) / count;
    const bodyW = Math.max(3, Math.min(9, Math.abs(dx) * 0.55));

    let prevY = c0.y;
    for (let i = 0; i < count; i++) {
      const wave = Math.sin((i + 1) * 1.618 + seed * 12.5) * 14;
      const x = c0.x + dx * (i + 0.5);
      const nextY = c0.y + dy * (i + 1) + wave;
      const highY = Math.min(prevY, nextY) - 6 - ((i * 5) % 7);
      const lowY = Math.max(prevY, nextY) + 6 + ((i * 3) % 7);
      const col = nextY <= prevY ? '#2962ff' : '#a855f7';

      figures.push(
        {
          type: 'line',
          ignoreEvent: true,
          attrs: { coordinates: [{ x, y: highY }, { x, y: lowY }] },
          styles: { color: hexToRgba(col, 0.65), size: 1 },
        },
        {
          type: 'rect',
          ignoreEvent: true,
          attrs: {
            x: x - bodyW / 2,
            y: Math.min(prevY, nextY),
            width: bodyW,
            height: Math.max(2, Math.abs(nextY - prevY)),
          },
          styles: { style: 'fill', color: hexToRgba(col, 0.5) },
        }
      );
      prevY = nextY;
    }

    figures.unshift({
      type: 'line',
      attrs: { coordinates: [c0, c1] },
      styles: { color: '#2962ff', size: 1, style: 'dashed', dashedValue: [3, 3] },
    });
    return figures;
  },
};

/**
 * 4. Sector Tool (`sectorTool`) — 3-point pie sector wedge
 */
export const sectorToolOverlay: OverlayTemplate = {
  name: 'sectorTool',
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

    const radius = Math.max(10, Math.hypot(c1.x - c0.x, c1.y - c0.y));
    const a1 = Math.atan2(c1.y - c0.y, c1.x - c0.x);
    let a2 = c2 ? Math.atan2(c2.y - c0.y, c2.x - c0.x) : a1 + Math.PI / 3;
    let delta = a2 - a1;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    const poly: Array<{ x: number; y: number }> = [c0];
    const segs = 28;
    for (let i = 0; i <= segs; i++) {
      const a = a1 + (delta * i) / segs;
      poly.push({ x: c0.x + Math.cos(a) * radius, y: c0.y + Math.sin(a) * radius });
    }

    return [
      {
        type: 'polygon',
        attrs: { coordinates: poly },
        styles: {
          style: 'stroke_fill',
          color: hexToRgba(color, ext.backgroundOpacity ?? 0.18),
          borderColor: color,
          borderSize: ls.size || 1.5,
        },
      },
    ];
  },
};

/**
 * 5. Anchored VWAP (`anchoredVwap`) — 1-point cumulative VWAP curve from clicked bar to present
 */
export const anchoredVwapOverlay: OverlayTemplate = {
  name: 'anchoredVwap',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay, precision }) => {
    if (coordinates.length === 0) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const digits = precision?.price ?? 2;
    const ls = (overlay.styles as any)?.line || {};
    const color = ls.color || '#2962ff';

    const candles = useChartStore.getState().candles;
    const anchorIdx = Math.max(0, Math.min(candles.length - 1, overlay.points[0]?.dataIndex ?? 0));
    if (candles.length === 0) return [];

    let cumPV = 0;
    let cumV = 0;
    const vwapPts: Array<{ dataIndex: number; value: number }> = [];
    const totalBars = candles.length - anchorIdx;
    const stride = totalBars > 400 ? Math.ceil(totalBars / 400) : 1;

    let lastVwap = candles[anchorIdx].close;
    for (let i = anchorIdx; i < candles.length; i++) {
      const c = candles[i];
      const tp = (c.high + c.low + c.close) / 3;
      const vol = c.volume > 0 ? c.volume : 1;
      cumPV += tp * vol;
      cumV += vol;
      lastVwap = cumPV / cumV;
      if ((i - anchorIdx) % stride === 0 || i === candles.length - 1) {
        vwapPts.push({ dataIndex: i, value: lastVwap });
      }
    }

    const pxPts = convertOverlayPointsToPixel(vwapPts).filter(
      (p): p is { x: number; y: number } =>
        typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y)
    );
    if (pxPts.length < 2) {
      return [
        {
          type: 'line',
          attrs: { coordinates: [coordinates[0], { x: coordinates[0].x + 80, y: coordinates[0].y }] },
          styles: { color, size: 2 },
        },
      ];
    }

    const lastPx = pxPts[pxPts.length - 1];
    return [
      {
        type: 'line',
        attrs: { coordinates: pxPts },
        styles: { color, size: ls.size || 2, style: ls.style || 'solid', dashedValue: [4, 4] },
      },
      {
        type: 'text',
        ignoreEvent: true,
        attrs: {
          x: lastPx.x + 6,
          y: lastPx.y,
          text: `VWAP ${formatFibPrice(lastVwap, digits)}`,
          align: 'left',
          baseline: 'middle',
        },
        styles: {
          color: '#ffffff',
          size: 10,
          weight: 'bold',
          family: 'JetBrains Mono, monospace',
          backgroundColor: color,
          borderRadius: 2,
          paddingLeft: 5,
          paddingRight: 5,
          paddingTop: 2,
          paddingBottom: 2,
        },
      },
    ];
  },
};

/**
 * 6 & 7. Fixed Range Volume Profile (`fixedRangeVolumeProfile`) & Anchored Volume Profile (`anchoredVolumeProfile`)
 */
function createVolumeProfileTemplate(isAnchored: boolean): OverlayTemplate {
  return {
    name: isAnchored ? 'anchoredVolumeProfile' : 'fixedRangeVolumeProfile',
    totalStep: isAnchored ? 2 : 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay, precision }) => {
      if (isAnchored ? coordinates.length < 1 : coordinates.length < 2) return [];
      if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
      const digits = precision?.price ?? 2;
      const candles = useChartStore.getState().candles;
      if (candles.length === 0) return [];

      const p0 = overlay.points[0];
      const p1 = overlay.points[1];
      const startIdx = isAnchored
        ? Math.max(0, Math.min(candles.length - 1, p0?.dataIndex ?? 0))
        : Math.max(0, Math.min(p0?.dataIndex ?? 0, p1?.dataIndex ?? 0));
      const endIdx = isAnchored
        ? candles.length - 1
        : Math.min(candles.length - 1, Math.max(p0?.dataIndex ?? 0, p1?.dataIndex ?? 0));

      const leftX = isAnchored ? coordinates[0].x : Math.min(coordinates[0].x, coordinates[1].x);
      const rightX = isAnchored
        ? Math.max(leftX + 120, bounding.width - 10)
        : Math.max(leftX + 40, Math.max(coordinates[0].x, coordinates[1].x));
      const maxBarW = Math.max(30, (rightX - leftX) * 0.42);

      let lo = Infinity;
      let hi = -Infinity;
      for (let i = startIdx; i <= endIdx; i++) {
        if (candles[i].low < lo) lo = candles[i].low;
        if (candles[i].high > hi) hi = candles[i].high;
      }
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return [];

      const BINS = 24;
      const binSize = (hi - lo) / BINS;
      const bullVol = new Array<number>(BINS).fill(0);
      const bearVol = new Array<number>(BINS).fill(0);

      for (let i = startIdx; i <= endIdx; i++) {
        const c = candles[i];
        const vol = c.volume > 0 ? c.volume : 1;
        const bStart = Math.max(0, Math.min(BINS - 1, Math.floor((c.low - lo) / binSize)));
        const bEnd = Math.max(0, Math.min(BINS - 1, Math.floor((c.high - lo) / binSize)));
        const share = vol / (bEnd - bStart + 1);
        const isBull = c.close >= c.open;
        for (let b = bStart; b <= bEnd; b++) {
          if (isBull) bullVol[b] += share;
          else bearVol[b] += share;
        }
      }

      const totals = bullVol.map((v, i) => v + bearVol[i]);
      const grandTotal = totals.reduce((a, b) => a + b, 0);
      let pocIdx = 0;
      let maxVol = 0;
      for (let b = 0; b < BINS; b++) {
        if (totals[b] > maxVol) {
          maxVol = totals[b];
          pocIdx = b;
        }
      }
      if (maxVol <= 0) return [];

      // 70% Value Area expansion from POC
      let vaLow = pocIdx;
      let vaHigh = pocIdx;
      let vaSum = totals[pocIdx];
      const vaTarget = grandTotal * 0.7;
      while (vaSum < vaTarget && (vaLow > 0 || vaHigh < BINS - 1)) {
        const upVol = vaHigh < BINS - 1 ? totals[vaHigh + 1] : -1;
        const dnVol = vaLow > 0 ? totals[vaLow - 1] : -1;
        if (upVol >= dnVol) {
          vaHigh++;
          vaSum += totals[vaHigh];
        } else {
          vaLow--;
          vaSum += totals[vaLow];
        }
      }

      // Convert bin boundaries to pixel Y in one batch
      const pricePts = Array.from({ length: BINS + 1 }, (_, i) => ({ value: lo + i * binSize }));
      const pxYs = convertOverlayPointsToPixel(pricePts).map((p) => p.y);
      if (pxYs.some((y) => typeof y !== 'number' || !Number.isFinite(y))) return [];

      const figures: any[] = [
        // Range boundary verticals
        {
          type: 'line',
          attrs: { coordinates: [{ x: leftX, y: pxYs[BINS] as number }, { x: leftX, y: pxYs[0] as number }] },
          styles: { color: '#2962ff', size: 1, style: 'dashed', dashedValue: [3, 3] },
        },
        {
          type: 'line',
          attrs: { coordinates: [{ x: rightX, y: pxYs[BINS] as number }, { x: rightX, y: pxYs[0] as number }] },
          styles: { color: '#2962ff', size: 1, style: 'dashed', dashedValue: [3, 3] },
        },
      ];

      for (let b = 0; b < BINS; b++) {
        const yBot = pxYs[b] as number;
        const yTop = pxYs[b + 1] as number;
        const h = Math.max(1.5, Math.abs(yBot - yTop) - 1);
        const top = Math.min(yTop, yBot);
        const inVA = b >= vaLow && b <= vaHigh;
        const bullW = (bullVol[b] / maxVol) * maxBarW;
        const bearW = (bearVol[b] / maxVol) * maxBarW;

        if (bullW > 0.5) {
          figures.push({
            type: 'rect',
            ignoreEvent: true,
            attrs: { x: leftX, y: top, width: bullW, height: h },
            styles: {
              style: 'fill',
              color: inVA ? 'rgba(41, 98, 255, 0.50)' : 'rgba(41, 98, 255, 0.22)',
            },
          });
        }
        if (bearW > 0.5) {
          figures.push({
            type: 'rect',
            ignoreEvent: true,
            attrs: { x: leftX + bullW, y: top, width: bearW, height: h },
            styles: {
              style: 'fill',
              color: inVA ? 'rgba(245, 158, 11, 0.45)' : 'rgba(245, 158, 11, 0.20)',
            },
          });
        }
      }

      // POC Line
      const pocY = ((pxYs[pocIdx] as number) + (pxYs[pocIdx + 1] as number)) / 2;
      const pocPrice = lo + (pocIdx + 0.5) * binSize;
      figures.push(
        {
          type: 'line',
          attrs: { coordinates: [{ x: leftX, y: pocY }, { x: rightX, y: pocY }] },
          styles: { color: '#f23645', size: 2, style: 'solid' },
        },
        {
          type: 'text',
          ignoreEvent: true,
          attrs: {
            x: rightX - 4,
            y: pocY - 3,
            text: `POC ${formatFibPrice(pocPrice, digits)}`,
            align: 'right',
            baseline: 'bottom',
          },
          styles: {
            color: '#f23645',
            size: 10,
            weight: 'bold',
            family: 'JetBrains Mono, monospace',
            ...TRANSPARENT_TEXT_RESET,
          },
        }
      );

      // VAH & VAL dashed lines
      const vahY = pxYs[vaHigh + 1] as number;
      const valY = pxYs[vaLow] as number;
      figures.push(
        {
          type: 'line',
          ignoreEvent: true,
          attrs: { coordinates: [{ x: leftX, y: vahY }, { x: rightX, y: vahY }] },
          styles: { color: '#2962ff', size: 1, style: 'dashed', dashedValue: [4, 4] },
        },
        {
          type: 'line',
          ignoreEvent: true,
          attrs: { coordinates: [{ x: leftX, y: valY }, { x: rightX, y: valY }] },
          styles: { color: '#2962ff', size: 1, style: 'dashed', dashedValue: [4, 4] },
        }
      );

      return figures;
    },
  };
}

export const fixedRangeVolumeProfileOverlay = createVolumeProfileTemplate(false);
export const anchoredVolumeProfileOverlay = createVolumeProfileTemplate(true);

/**
 * 8. Price Range Measurer (`priceRange`)
 */
export const priceRangeOverlay: OverlayTemplate = {
  name: 'priceRange',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay, precision }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1] = coordinates;
    const digits = precision?.price ?? 2;
    const v0 = overlay.points[0]?.value ?? 0;
    const v1 = overlay.points[1]?.value ?? 0;
    const diff = v1 - v0;
    const pct = v0 !== 0 ? (diff / v0) * 100 : 0;
    const pipUnit = Math.pow(10, -digits) * 10;
    const pips = pipUnit > 0 ? Math.abs(diff) / pipUnit : 0;
    const color = diff >= 0 ? '#089981' : '#f23645';
    const sign = diff >= 0 ? '+' : '';

    const xLeft = Math.min(c0.x, c1.x);
    const xRight = Math.max(xLeft + 40, Math.max(c0.x, c1.x));
    const yTop = Math.min(c0.y, c1.y);
    const yBot = Math.max(c0.y, c1.y);
    const midX = (xLeft + xRight) / 2;

    return [
      {
        type: 'rect',
        attrs: { x: xLeft, y: yTop, width: xRight - xLeft, height: Math.max(2, yBot - yTop) },
        styles: { style: 'fill', color: hexToRgba(color, 0.16) },
      },
      {
        type: 'line',
        attrs: { coordinates: [{ x: xLeft, y: c0.y }, { x: xRight, y: c0.y }] },
        styles: { color, size: 1.5 },
      },
      {
        type: 'line',
        attrs: { coordinates: [{ x: xLeft, y: c1.y }, { x: xRight, y: c1.y }] },
        styles: { color, size: 1.5 },
      },
      {
        type: 'line',
        ignoreEvent: true,
        attrs: { coordinates: [{ x: midX, y: yTop }, { x: midX, y: yBot }] },
        styles: { color, size: 1.5 },
      },
      {
        type: 'text',
        ignoreEvent: true,
        attrs: {
          x: midX,
          y: diff >= 0 ? yTop - 6 : yBot + 6,
          text: `${sign}${formatFibPrice(diff, digits)} (${sign}${pct.toFixed(2)}%) | ${pips.toFixed(1)} pips`,
          align: 'center',
          baseline: diff >= 0 ? 'bottom' : 'top',
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
    ];
  },
};

/**
 * 9. Date Range Measurer (`dateRange`)
 */
export const dateRangeOverlay: OverlayTemplate = {
  name: 'dateRange',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1] = coordinates;
    const color = (overlay.styles as any)?.line?.color || '#2962ff';

    const xLeft = Math.min(c0.x, c1.x);
    const xRight = Math.max(c0.x, c1.x);
    const yTop = Math.min(c0.y, c1.y);
    const yBot = Math.max(yTop + 36, Math.max(c0.y, c1.y));
    const midY = (yTop + yBot) / 2;

    const p0 = overlay.points[0];
    const p1 = overlay.points[1];
    const bars = Math.abs((p1?.dataIndex ?? 0) - (p0?.dataIndex ?? 0));
    const durMs = Math.abs((p1?.timestamp ?? 0) - (p0?.timestamp ?? 0));

    return [
      {
        type: 'rect',
        attrs: { x: xLeft, y: yTop, width: Math.max(2, xRight - xLeft), height: yBot - yTop },
        styles: { style: 'fill', color: hexToRgba(color, 0.16) },
      },
      {
        type: 'line',
        attrs: { coordinates: [{ x: xLeft, y: yTop }, { x: xLeft, y: yBot }] },
        styles: { color, size: 1.5 },
      },
      {
        type: 'line',
        attrs: { coordinates: [{ x: xRight, y: yTop }, { x: xRight, y: yBot }] },
        styles: { color, size: 1.5 },
      },
      {
        type: 'line',
        ignoreEvent: true,
        attrs: { coordinates: [{ x: xLeft, y: midY }, { x: xRight, y: midY }] },
        styles: { color, size: 1.5 },
      },
      {
        type: 'text',
        ignoreEvent: true,
        attrs: {
          x: (xLeft + xRight) / 2,
          y: yBot + 6,
          text: `${bars} bars · ${fmtDuration(durMs)}`,
          align: 'center',
          baseline: 'top',
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
    ];
  },
};
