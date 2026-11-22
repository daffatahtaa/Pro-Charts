import { OverlayTemplate } from 'klinecharts';
import { isOverlayVisibleForTimeframe, hexToRgba, toHairlineSize } from './index';

const TRANSPARENT_TEXT = {
  backgroundColor: 'transparent',
  borderColor: 'transparent',
  borderSize: 0,
  paddingLeft: 0,
  paddingRight: 0,
  paddingTop: 0,
  paddingBottom: 0,
};

function extendRayToBounds(
  origin: { x: number; y: number },
  target: { x: number; y: number },
  width: number,
  height: number
): { x: number; y: number } {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return target;
  const scale = Math.max(width, height) * 2 / Math.max(1, Math.hypot(dx, dy));
  return { x: origin.x + dx * scale, y: origin.y + dy * scale };
}

/** 1. Fib Channel (`fibChannel`) — 3-point sloped parallel Fib levels */
export const fibChannelOverlay: OverlayTemplate = {
  name: 'fibChannel',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1, c2] = coordinates;
    const baseColor = (overlay.styles as any)?.line?.color || '#787b86';
    const figures: any[] = [
      {
        type: 'line',
        attrs: { coordinates: [c0, c1] },
        styles: { color: baseColor, size: 1.2 },
      },
    ];
    if (!c2) return figures;

    const dx = c1.x - c0.x;
    const dy = c1.y - c0.y;
    const slope = Math.abs(dx) > 0.001 ? dy / dx : 0;
    const baseYAtC2 = c0.y + (c2.x - c0.x) * slope;
    const offsetY = c2.y - baseYAtC2;

    const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
    const colors = ['#787b86', '#f23645', '#ff9800', '#089981', '#2962ff', '#9c27b0', '#787b86'];

    ratios.forEach((r, idx) => {
      const pA = { x: c0.x, y: c0.y + offsetY * r };
      const pB = { x: c1.x, y: c1.y + offsetY * r };
      const col = colors[idx] || baseColor;
      figures.push({
        type: 'line',
        attrs: { coordinates: [pA, pB] },
        styles: { color: col, size: r === 0 || r === 1 ? 1.5 : 1 },
      });
      const rightPt = pA.x >= pB.x ? pA : pB;
      figures.push({
        type: 'text',
        ignoreEvent: true,
        attrs: { x: rightPt.x + 6, y: rightPt.y, text: `${r}`, align: 'left', baseline: 'middle' },
        styles: { color: col, size: 10.5, family: 'Trebuchet MS, sans-serif', ...TRANSPARENT_TEXT },
      });
    });

    // Subtle channel fill between 0 and 1
    figures.unshift({
      type: 'polygon',
      ignoreEvent: true,
      attrs: {
        coordinates: [c0, c1, { x: c1.x, y: c1.y + offsetY }, { x: c0.x, y: c0.y + offsetY }],
      },
      styles: { style: 'fill', color: hexToRgba(baseColor, 0.08) },
    });

    return figures;
  },
};

/** 2. Fib Time Zone (`fibTimeZone`) — 2-point vertical Fibonacci time projections */
export const fibTimeZoneOverlay: OverlayTemplate = {
  name: 'fibTimeZone',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1] = coordinates;
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    const dir = c1.x >= c0.x ? 1 : -1;
    const step = Math.max(12, Math.abs(c1.x - c0.x));
    const fibNums = [0, 1, 2, 3, 5, 8, 13, 21, 34];

    const figures: any[] = [
      {
        type: 'line',
        ignoreEvent: true,
        attrs: { coordinates: [c0, c1] },
        styles: { color: '#787b86', size: 1, style: 'dashed', dashedValue: [4, 4] },
      },
    ];

    for (const n of fibNums) {
      const x = c0.x + dir * step * n;
      if (x < -20 || x > bounding.width + 20) continue;
      figures.push({
        type: 'line',
        attrs: {
          coordinates: [
            { x, y: 0 },
            { x, y: bounding.height },
          ],
        },
        styles: { color, size: n <= 1 ? 1.5 : 1 },
      });
      figures.push({
        type: 'text',
        ignoreEvent: true,
        attrs: { x: x + 4, y: 14, text: `${n}`, align: 'left', baseline: 'top' },
        styles: { color, size: 10.5, family: 'JetBrains Mono, monospace', ...TRANSPARENT_TEXT },
      });
    }
    return figures;
  },
};

/** 3. Fib Speed Resistance Fan (`fibSpeedResistanceFan`) */
export const fibSpeedResistanceFanOverlay: OverlayTemplate = {
  name: 'fibSpeedResistanceFan',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1] = coordinates;
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    const dx = c1.x - c0.x;
    const dy = c1.y - c0.y;
    const ratios = [0.25, 0.382, 0.5, 0.618, 0.75];

    const figures: any[] = [
      {
        type: 'rect',
        ignoreEvent: true,
        attrs: {
          x: Math.min(c0.x, c1.x),
          y: Math.min(c0.y, c1.y),
          width: Math.abs(dx),
          height: Math.abs(dy),
        },
        styles: {
          style: 'stroke_fill',
          color: hexToRgba(color, 0.06),
          borderColor: hexToRgba(color, 0.45),
          borderSize: 1,
        },
      },
      {
        type: 'line',
        attrs: { coordinates: [c0, extendRayToBounds(c0, c1, bounding.width, bounding.height)] },
        styles: { color, size: toHairlineSize(1) },
      },
    ];

    for (const r of ratios) {
      const tPrice = { x: c1.x, y: c0.y + dy * r };
      const tTime = { x: c0.x + dx * r, y: c1.y };
      figures.push({
        type: 'line',
        ignoreEvent: true,
        attrs: { coordinates: [c0, extendRayToBounds(c0, tPrice, bounding.width, bounding.height)] },
        styles: { color: hexToRgba(color, 0.75), size: 1 },
      });
      figures.push({
        type: 'line',
        ignoreEvent: true,
        attrs: { coordinates: [c0, extendRayToBounds(c0, tTime, bounding.width, bounding.height)] },
        styles: { color: hexToRgba('#089981', 0.7), size: 1 },
      });
      figures.push({
        type: 'text',
        ignoreEvent: true,
        attrs: { x: tPrice.x + 4, y: tPrice.y, text: `${r}`, align: 'left', baseline: 'middle' },
        styles: { color, size: 10, family: 'Trebuchet MS, sans-serif', ...TRANSPARENT_TEXT },
      });
    }

    return figures;
  },
};

/** 4. Trend-Based Fib Time (`trendBasedFibTime`) — 3-point vertical projections */
export const trendBasedFibTimeOverlay: OverlayTemplate = {
  name: 'trendBasedFibTime',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1, c2] = coordinates;
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    const figures: any[] = [
      {
        type: 'line',
        attrs: { coordinates: [c0, c1] },
        styles: { color: '#787b86', size: 1, style: 'dashed', dashedValue: [4, 4] },
      },
    ];
    if (!c2) return figures;

    figures.push({
      type: 'line',
      attrs: { coordinates: [c1, c2] },
      styles: { color: '#787b86', size: 1, style: 'dashed', dashedValue: [4, 4] },
    });

    const spanX = c1.x - c0.x;
    const ratios = [0, 0.382, 0.618, 1, 1.618, 2.618];
    for (const r of ratios) {
      const x = c2.x + spanX * r;
      if (x < -20 || x > bounding.width + 20) continue;
      figures.push({
        type: 'line',
        attrs: {
          coordinates: [
            { x, y: 0 },
            { x, y: bounding.height },
          ],
        },
        styles: { color, size: r === 1 || r === 1.618 ? 1.5 : 1 },
      });
      figures.push({
        type: 'text',
        ignoreEvent: true,
        attrs: { x: x + 4, y: 16, text: `${r}`, align: 'left', baseline: 'top' },
        styles: { color, size: 10.5, family: 'JetBrains Mono, monospace', ...TRANSPARENT_TEXT },
      });
    }
    return figures;
  },
};

/** 5. Fib Circles (`fibCircles`) — 2-point concentric Fibonacci ellipses */
export const fibCirclesOverlay: OverlayTemplate = {
  name: 'fibCircles',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1] = coordinates;
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    const rxBase = Math.max(8, Math.abs(c1.x - c0.x));
    const ryBase = Math.max(8, Math.abs(c1.y - c0.y));
    const ratios = [0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618];
    const figures: any[] = [
      {
        type: 'line',
        ignoreEvent: true,
        attrs: { coordinates: [c0, c1] },
        styles: { color: '#787b86', size: 1, style: 'dashed', dashedValue: [4, 4] },
      },
    ];

    const segs = 40;
    for (const r of ratios) {
      const pts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i <= segs; i++) {
        const theta = (i / segs) * Math.PI * 2;
        pts.push({
          x: c0.x + Math.cos(theta) * rxBase * r,
          y: c0.y + Math.sin(theta) * ryBase * r,
        });
      }
      figures.push({
        type: 'line',
        attrs: { coordinates: pts },
        styles: { color, size: r === 1 ? 1.5 : 1 },
      });
      figures.push({
        type: 'text',
        ignoreEvent: true,
        attrs: { x: c0.x + rxBase * r + 4, y: c0.y, text: `${r}`, align: 'left', baseline: 'middle' },
        styles: { color, size: 10, family: 'Trebuchet MS, sans-serif', ...TRANSPARENT_TEXT },
      });
    }
    return figures;
  },
};

/** 6. Fib Spiral (`fibSpiral`) — 2-point golden logarithmic spiral */
export const fibSpiralOverlay: OverlayTemplate = {
  name: 'fibSpiral',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1] = coordinates;
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    const r0 = Math.max(4, Math.hypot(c1.x - c0.x, c1.y - c0.y) * 0.15);
    const startAngle = Math.atan2(c1.y - c0.y, c1.x - c0.x);
    const pts: Array<{ x: number; y: number }> = [];
    const steps = 120;
    const maxTheta = 4.5 * Math.PI;
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * maxTheta;
      const rad = r0 * Math.exp(0.30635 * theta);
      pts.push({
        x: c0.x + rad * Math.cos(startAngle + theta),
        y: c0.y + rad * Math.sin(startAngle + theta),
      });
    }
    return [
      {
        type: 'line',
        ignoreEvent: true,
        attrs: { coordinates: [c0, c1] },
        styles: { color: '#787b86', size: 1, style: 'dashed', dashedValue: [4, 4] },
      },
      {
        type: 'line',
        attrs: { coordinates: pts },
        styles: { color, size: toHairlineSize(1) },
      },
    ];
  },
};

/** 7. Fib Speed Resistance Arcs (`fibSpeedResistanceArcs`) */
export const fibSpeedResistanceArcsOverlay: OverlayTemplate = {
  name: 'fibSpeedResistanceArcs',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1] = coordinates;
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    const dist = Math.max(10, Math.hypot(c1.x - c0.x, c1.y - c0.y));
    const baseAngle = Math.atan2(c1.y - c0.y, c1.x - c0.x);
    const ratios = [0.236, 0.382, 0.5, 0.618, 0.786, 1];

    const figures: any[] = [
      {
        type: 'line',
        attrs: { coordinates: [c0, c1] },
        styles: { color: '#787b86', size: 1, style: 'dashed', dashedValue: [4, 4] },
      },
    ];

    const segs = 28;
    for (const r of ratios) {
      const rad = dist * r;
      const pts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i <= segs; i++) {
        const a = baseAngle - Math.PI / 2 + (i / segs) * Math.PI;
        pts.push({ x: c0.x + Math.cos(a) * rad, y: c0.y + Math.sin(a) * rad });
      }
      figures.push({
        type: 'line',
        attrs: { coordinates: pts },
        styles: { color, size: r === 1 ? 1.5 : 1 },
      });
      const midPt = pts[Math.floor(segs / 2)];
      figures.push({
        type: 'text',
        ignoreEvent: true,
        attrs: { x: midPt.x + 4, y: midPt.y, text: `${r}`, align: 'left', baseline: 'middle' },
        styles: { color, size: 10, family: 'Trebuchet MS, sans-serif', ...TRANSPARENT_TEXT },
      });
    }
    return figures;
  },
};

/** 8. Fib Wedge (`fibWedge`) — 3-point sector with concentric Fib arcs */
export const fibWedgeOverlay: OverlayTemplate = {
  name: 'fibWedge',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1, c2] = coordinates;
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    const figures: any[] = [
      { type: 'line', attrs: { coordinates: [c0, c1] }, styles: { color, size: toHairlineSize(1) } },
    ];
    if (!c2) return figures;

    figures.push({ type: 'line', attrs: { coordinates: [c0, c2] }, styles: { color, size: toHairlineSize(1) } });

    const rMax = Math.max(
      12,
      Math.hypot(c1.x - c0.x, c1.y - c0.y),
      Math.hypot(c2.x - c0.x, c2.y - c0.y)
    );
    let a1 = Math.atan2(c1.y - c0.y, c1.x - c0.x);
    let a2 = Math.atan2(c2.y - c0.y, c2.x - c0.x);
    let diff = a2 - a1;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const ratios = [0.236, 0.382, 0.5, 0.618, 0.786, 1];
    const segs = 24;
    for (const r of ratios) {
      const rad = rMax * r;
      const pts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i <= segs; i++) {
        const a = a1 + (i / segs) * diff;
        pts.push({ x: c0.x + Math.cos(a) * rad, y: c0.y + Math.sin(a) * rad });
      }
      figures.push({
        type: 'line',
        attrs: { coordinates: pts },
        styles: { color: hexToRgba(color, 0.8), size: 1 },
      });
      const endPt = pts[pts.length - 1];
      figures.push({
        type: 'text',
        ignoreEvent: true,
        attrs: { x: endPt.x + 4, y: endPt.y, text: `${r}`, align: 'left', baseline: 'middle' },
        styles: { color, size: 10, family: 'Trebuchet MS, sans-serif', ...TRANSPARENT_TEXT },
      });
    }
    return figures;
  },
};

/** 9. Pitchfan (`pitchfan`) — 3-point fan radiating from c0 through c1..c2 */
export const pitchfanOverlay: OverlayTemplate = {
  name: 'pitchfan',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1, c2] = coordinates;
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    const figures: any[] = [
      {
        type: 'line',
        attrs: { coordinates: [c0, extendRayToBounds(c0, c1, bounding.width, bounding.height)] },
        styles: { color, size: toHairlineSize(1) },
      },
    ];
    if (!c2) return figures;

    figures.push({
      type: 'line',
      ignoreEvent: true,
      attrs: { coordinates: [c1, c2] },
      styles: { color: '#787b86', size: 1, style: 'dashed', dashedValue: [4, 4] },
    });

    const subs = [0, 0.25, 0.5, 0.75, 1];
    for (const s of subs) {
      const target = { x: c1.x + (c2.x - c1.x) * s, y: c1.y + (c2.y - c1.y) * s };
      figures.push({
        type: 'line',
        attrs: { coordinates: [c0, extendRayToBounds(c0, target, bounding.width, bounding.height)] },
        styles: {
          color: s === 0.5 ? '#f23645' : color,
          size: s === 0 || s === 0.5 || s === 1 ? 1.5 : 1,
          style: s === 0.25 || s === 0.75 ? 'dashed' : 'solid',
          dashedValue: [4, 4],
        },
      });
    }
    return figures;
  },
};

/** 10. Gann Box (`gannBox`) — 2-point box subdivided horizontally & vertically */
export const gannBoxOverlay: OverlayTemplate = {
  name: 'gannBox',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1] = coordinates;
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    const x1 = Math.min(c0.x, c1.x);
    const y1 = Math.min(c0.y, c1.y);
    const w = Math.abs(c1.x - c0.x);
    const h = Math.abs(c1.y - c0.y);
    const ratios = [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1];

    const figures: any[] = [
      {
        type: 'rect',
        attrs: { x: x1, y: y1, width: w, height: h },
        styles: {
          style: 'stroke_fill',
          color: hexToRgba(color, 0.08),
          borderColor: color,
          borderSize: toHairlineSize(1),
        },
      },
    ];

    for (const r of ratios) {
      if (r > 0 && r < 1) {
        const y = y1 + h * r;
        const x = x1 + w * r;
        figures.push({
          type: 'line',
          ignoreEvent: true,
          attrs: {
            coordinates: [
              { x: x1, y },
              { x: x1 + w, y },
            ],
          },
          styles: { color: hexToRgba(color, r === 0.5 ? 0.85 : 0.45), size: r === 0.5 ? 1.2 : 1 },
        });
        figures.push({
          type: 'line',
          ignoreEvent: true,
          attrs: {
            coordinates: [
              { x, y: y1 },
              { x, y: y1 + h },
            ],
          },
          styles: { color: hexToRgba(color, r === 0.5 ? 0.85 : 0.45), size: r === 0.5 ? 1.2 : 1 },
        });
      }
      figures.push({
        type: 'text',
        ignoreEvent: true,
        attrs: { x: x1 + w + 5, y: y1 + h * r, text: `${r}`, align: 'left', baseline: 'middle' },
        styles: { color, size: 10, family: 'Trebuchet MS, sans-serif', ...TRANSPARENT_TEXT },
      });
    }
    return figures;
  },
};

function createGannSquareTemplate(name: string, divisions: number, rings: number): OverlayTemplate {
  return {
    name,
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return [];
      if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
      const [c0, c1] = coordinates;
      const color = (overlay.styles as any)?.line?.color || '#2962ff';
      const x1 = Math.min(c0.x, c1.x);
      const y1 = Math.min(c0.y, c1.y);
      const w = Math.abs(c1.x - c0.x);
      const h = Math.abs(c1.y - c0.y);
      const cx = x1 + w / 2;
      const cy = y1 + h / 2;

      const figures: any[] = [
        {
          type: 'rect',
          attrs: { x: x1, y: y1, width: w, height: h },
          styles: {
            style: 'stroke_fill',
            color: hexToRgba(color, 0.06),
            borderColor: color,
            borderSize: toHairlineSize(1),
          },
        },
        // Main diagonals
        {
          type: 'line',
          ignoreEvent: true,
          attrs: {
            coordinates: [
              { x: x1, y: y1 },
              { x: x1 + w, y: y1 + h },
            ],
          },
          styles: { color: '#f23645', size: 1 },
        },
        {
          type: 'line',
          ignoreEvent: true,
          attrs: {
            coordinates: [
              { x: x1 + w, y: y1 },
              { x: x1, y: y1 + h },
            ],
          },
          styles: { color: '#089981', size: 1 },
        },
      ];

      for (let i = 1; i < divisions; i++) {
        const f = i / divisions;
        const isMid = i === divisions / 2;
        figures.push({
          type: 'line',
          ignoreEvent: true,
          attrs: {
            coordinates: [
              { x: x1 + w * f, y: y1 },
              { x: x1 + w * f, y: y1 + h },
            ],
          },
          styles: { color: hexToRgba(color, isMid ? 0.75 : 0.35), size: isMid ? 1.2 : 1 },
        });
        figures.push({
          type: 'line',
          ignoreEvent: true,
          attrs: {
            coordinates: [
              { x: x1, y: y1 + h * f },
              { x: x1 + w, y: y1 + h * f },
            ],
          },
          styles: { color: hexToRgba(color, isMid ? 0.75 : 0.35), size: isMid ? 1.2 : 1 },
        });
      }

      // Inscribed concentric rings
      const segs = 36;
      for (let rIdx = 1; rIdx <= rings; rIdx++) {
        const frac = rIdx / rings;
        const pts: Array<{ x: number; y: number }> = [];
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * Math.PI * 2;
          pts.push({
            x: cx + Math.cos(a) * (w / 2) * frac,
            y: cy + Math.sin(a) * (h / 2) * frac,
          });
        }
        figures.push({
          type: 'line',
          ignoreEvent: true,
          attrs: { coordinates: pts },
          styles: { color: hexToRgba('#f59e0b', 0.65), size: 1 },
        });
      }

      return figures;
    },
  };
}

/** 11. Gann Square Fixed (`gannSquareFixed`) */
export const gannSquareFixedOverlay = createGannSquareTemplate('gannSquareFixed', 4, 3);

/** 12. Gann Square (`gannSquare`) */
export const gannSquareOverlay = createGannSquareTemplate('gannSquare', 8, 4);

/** 13. Gann Fan (`gannFan`) — 9 classic Gann angle rays */
export const gannFanOverlay: OverlayTemplate = {
  name: 'gannFan',
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
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return [];

    const specs: Array<{ label: string; multY: number; color: string }> = [
      { label: '1/8', multY: 0.125, color: '#787b86' },
      { label: '1/4', multY: 0.25, color: '#9c27b0' },
      { label: '1/3', multY: 1 / 3, color: '#2962ff' },
      { label: '1/2', multY: 0.5, color: '#00bcd4' },
      { label: '1/1', multY: 1, color: '#089981' },
      { label: '2/1', multY: 2, color: '#f59e0b' },
      { label: '3/1', multY: 3, color: '#ff9800' },
      { label: '4/1', multY: 4, color: '#f23645' },
      { label: '8/1', multY: 8, color: '#e91e63' },
    ];

    const figures: any[] = [];
    for (const sp of specs) {
      const target = { x: c0.x + dx, y: c0.y + dy * sp.multY };
      const far = extendRayToBounds(c0, target, bounding.width, bounding.height);
      figures.push({
        type: 'line',
        attrs: { coordinates: [c0, far] },
        styles: { color: sp.color, size: sp.label === '1/1' ? 1.8 : 1.1 },
      });
      const lblX = c0.x + (target.x - c0.x) * 1.15;
      const lblY = c0.y + (target.y - c0.y) * 1.15;
      if (lblX > 0 && lblX < bounding.width && lblY > 0 && lblY < bounding.height) {
        figures.push({
          type: 'text',
          ignoreEvent: true,
          attrs: { x: lblX, y: lblY, text: sp.label, align: 'left', baseline: 'middle' },
          styles: { color: sp.color, size: 10, family: 'JetBrains Mono, monospace', ...TRANSPARENT_TEXT },
        });
      }
    }
    return figures;
  },
};
