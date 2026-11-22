import { OverlayTemplate } from 'klinecharts';
import { isOverlayVisibleForTimeframe, hexToRgba } from './index';

const TRANSPARENT_TEXT = {
  backgroundColor: 'transparent',
  borderColor: 'transparent',
  borderSize: 0,
  paddingLeft: 0,
  paddingRight: 0,
  paddingTop: 0,
  paddingBottom: 0,
};

function makePivotBadge(x: number, y: number, text: string, color: string, isPeak: boolean) {
  return {
    type: 'text',
    ignoreEvent: true,
    attrs: {
      x,
      y: isPeak ? y - 10 : y + 10,
      text,
      align: 'center',
      baseline: isPeak ? 'bottom' : 'top',
    },
    styles: {
      color: '#ffffff',
      size: 10.5,
      weight: 'bold',
      family: 'Trebuchet MS, sans-serif',
      backgroundColor: color,
      borderRadius: 3,
      paddingLeft: 5,
      paddingRight: 5,
      paddingTop: 2,
      paddingBottom: 2,
    },
  };
}

function makeRatioText(
  a: { x: number; y: number },
  b: { x: number; y: number },
  ratioText: string,
  color: string
) {
  return {
    type: 'text',
    ignoreEvent: true,
    attrs: {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2 - 4,
      text: ratioText,
      align: 'center',
      baseline: 'bottom',
    },
    styles: {
      color,
      size: 10.5,
      weight: 'bold',
      family: 'JetBrains Mono, monospace',
      ...TRANSPARENT_TEXT,
    },
  };
}

function createHarmonic5Overlay(name: string, isCypher: boolean): OverlayTemplate {
  return {
    name,
    totalStep: 6,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return [];
      if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
      const color = (overlay.styles as any)?.line?.color || (isCypher ? '#00bcd4' : '#2962ff');
      const labels = ['X', 'A', 'B', 'C', 'D'];
      const pts = overlay.points;
      const figures: any[] = [];

      // Shaded triangles [X,A,B] and [B,C,D]
      if (coordinates.length >= 3) {
        figures.push({
          type: 'polygon',
          ignoreEvent: true,
          attrs: { coordinates: [coordinates[0], coordinates[1], coordinates[2]] },
          styles: { style: 'fill', color: hexToRgba(color, 0.16) },
        });
      }
      if (coordinates.length >= 5) {
        figures.push({
          type: 'polygon',
          ignoreEvent: true,
          attrs: { coordinates: [coordinates[2], coordinates[3], coordinates[4]] },
          styles: { style: 'fill', color: hexToRgba(color, 0.16) },
        });
      }

      // Main legs
      figures.push({
        type: 'line',
        attrs: { coordinates },
        styles: { color, size: 1.8 },
      });

      // Dashed connectors + retracement ratios
      const val = (i: number) => pts[i]?.value;
      if (coordinates.length >= 3) {
        figures.push({
          type: 'line',
          ignoreEvent: true,
          attrs: { coordinates: [coordinates[0], coordinates[2]] },
          styles: { color, size: 1, style: 'dashed', dashedValue: [4, 4] },
        });
        const xa = Math.abs((val(1) ?? 0) - (val(0) ?? 0));
        const ab = Math.abs((val(2) ?? 0) - (val(1) ?? 0));
        if (xa > 0) {
          figures.push(makeRatioText(coordinates[0], coordinates[2], (ab / xa).toFixed(3), color));
        }
      }
      if (coordinates.length >= 4) {
        figures.push({
          type: 'line',
          ignoreEvent: true,
          attrs: { coordinates: [coordinates[1], coordinates[3]] },
          styles: { color, size: 1, style: 'dashed', dashedValue: [4, 4] },
        });
        if (isCypher) {
          const xa = Math.abs((val(1) ?? 0) - (val(0) ?? 0));
          const xc = Math.abs((val(3) ?? 0) - (val(0) ?? 0));
          if (xa > 0) {
            figures.push(makeRatioText(coordinates[1], coordinates[3], (xc / xa).toFixed(3), color));
          }
        } else {
          const ab = Math.abs((val(2) ?? 0) - (val(1) ?? 0));
          const bc = Math.abs((val(3) ?? 0) - (val(2) ?? 0));
          if (ab > 0) {
            figures.push(makeRatioText(coordinates[1], coordinates[3], (bc / ab).toFixed(3), color));
          }
        }
      }
      if (coordinates.length >= 5) {
        figures.push({
          type: 'line',
          ignoreEvent: true,
          attrs: { coordinates: [coordinates[2], coordinates[4]] },
          styles: { color, size: 1, style: 'dashed', dashedValue: [4, 4] },
        });
        const denom = isCypher
          ? Math.abs((val(3) ?? 0) - (val(0) ?? 0))
          : Math.abs((val(3) ?? 0) - (val(2) ?? 0));
        const cd = Math.abs((val(4) ?? 0) - (val(3) ?? 0));
        if (denom > 0) {
          figures.push(makeRatioText(coordinates[2], coordinates[4], (cd / denom).toFixed(3), color));
        }
      }

      // Vertex labels
      coordinates.forEach((c, i) => {
        const prev = coordinates[i - 1];
        const next = coordinates[i + 1];
        const isPeak =
          (prev ? c.y <= prev.y : true) && (next ? c.y <= next.y : true);
        figures.push(makePivotBadge(c.x, c.y, labels[i] || `${i}`, color, isPeak));
      });

      return figures;
    },
  };
}

/** 1. XABCD Pattern (`xabcdPattern`) */
export const xabcdPatternOverlay = createHarmonic5Overlay('xabcdPattern', false);

/** 2. Cypher Pattern (`cypherPattern`) */
export const cypherPatternOverlay = createHarmonic5Overlay('cypherPattern', true);

/** 3. Head and Shoulders (`headAndShoulders`) — 7 points */
export const headAndShouldersOverlay: OverlayTemplate = {
  name: 'headAndShoulders',
  totalStep: 8,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const color = (overlay.styles as any)?.line?.color || '#089981';
    const figures: any[] = [];

    if (coordinates.length >= 3) {
      figures.push({
        type: 'polygon',
        ignoreEvent: true,
        attrs: { coordinates: [coordinates[0], coordinates[1], coordinates[2]] },
        styles: { style: 'fill', color: hexToRgba(color, 0.15) },
      });
    }
    if (coordinates.length >= 5) {
      figures.push({
        type: 'polygon',
        ignoreEvent: true,
        attrs: { coordinates: [coordinates[2], coordinates[3], coordinates[4]] },
        styles: { style: 'fill', color: hexToRgba(color, 0.2) },
      });
    }
    if (coordinates.length >= 7) {
      figures.push({
        type: 'polygon',
        ignoreEvent: true,
        attrs: { coordinates: [coordinates[4], coordinates[5], coordinates[6]] },
        styles: { style: 'fill', color: hexToRgba(color, 0.15) },
      });
    }

    figures.push({
      type: 'line',
      attrs: { coordinates },
      styles: { color, size: 1.8 },
    });

    // Extended dashed neckline through N1 (idx 2) and N2 (idx 4)
    if (coordinates.length >= 5) {
      const n1 = coordinates[2];
      const n2 = coordinates[4];
      const dx = n2.x - n1.x;
      const dy = n2.y - n1.y;
      figures.push({
        type: 'line',
        ignoreEvent: true,
        attrs: {
          coordinates: [
            { x: n1.x - dx * 0.4, y: n1.y - dy * 0.4 },
            { x: n2.x + dx * 0.6, y: n2.y + dy * 0.6 },
          ],
        },
        styles: { color: '#f23645', size: 1.4, style: 'dashed', dashedValue: [5, 4] },
      });
    }

    const labelMap: Record<number, string> = {
      1: 'Left Shoulder',
      3: 'Head',
      5: 'Right Shoulder',
    };
    Object.entries(labelMap).forEach(([idxStr, lbl]) => {
      const idx = Number(idxStr);
      const c = coordinates[idx];
      if (!c) return;
      const prev = coordinates[idx - 1];
      const isPeak = prev ? c.y < prev.y : true;
      figures.push(makePivotBadge(c.x, c.y, lbl, color, isPeak));
    });

    return figures;
  },
};

/** 4. ABCD Pattern (`abcdPattern`) — 4 points */
export const abcdPatternOverlay: OverlayTemplate = {
  name: 'abcdPattern',
  totalStep: 5,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    const labels = ['A', 'B', 'C', 'D'];
    const pts = overlay.points;
    const figures: any[] = [
      { type: 'line', attrs: { coordinates }, styles: { color, size: 1.8 } },
    ];

    if (coordinates.length >= 3) {
      figures.push({
        type: 'line',
        ignoreEvent: true,
        attrs: { coordinates: [coordinates[0], coordinates[2]] },
        styles: { color, size: 1, style: 'dashed', dashedValue: [4, 4] },
      });
      const ab = Math.abs((pts[1]?.value ?? 0) - (pts[0]?.value ?? 0));
      const bc = Math.abs((pts[2]?.value ?? 0) - (pts[1]?.value ?? 0));
      if (ab > 0) figures.push(makeRatioText(coordinates[0], coordinates[2], (bc / ab).toFixed(3), color));
    }
    if (coordinates.length >= 4) {
      figures.push({
        type: 'line',
        ignoreEvent: true,
        attrs: { coordinates: [coordinates[1], coordinates[3]] },
        styles: { color, size: 1, style: 'dashed', dashedValue: [4, 4] },
      });
      const bc = Math.abs((pts[2]?.value ?? 0) - (pts[1]?.value ?? 0));
      const cd = Math.abs((pts[3]?.value ?? 0) - (pts[2]?.value ?? 0));
      if (bc > 0) figures.push(makeRatioText(coordinates[1], coordinates[3], (cd / bc).toFixed(3), color));
    }

    coordinates.forEach((c, i) => {
      const prev = coordinates[i - 1];
      const next = coordinates[i + 1];
      const isPeak = (prev ? c.y <= prev.y : true) && (next ? c.y <= next.y : true);
      figures.push(makePivotBadge(c.x, c.y, labels[i] || `${i}`, color, isPeak));
    });
    return figures;
  },
};

/** 5. Triangle Pattern (`trianglePattern`) — 4 points with extended A-C & B-D walls */
export const trianglePatternOverlay: OverlayTemplate = {
  name: 'trianglePattern',
  totalStep: 5,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const color = (overlay.styles as any)?.line?.color || '#9c27b0';
    const labels = ['A', 'B', 'C', 'D'];
    const figures: any[] = [];

    if (coordinates.length >= 4) {
      figures.push({
        type: 'polygon',
        ignoreEvent: true,
        attrs: { coordinates: [coordinates[0], coordinates[2], coordinates[3], coordinates[1]] },
        styles: { style: 'fill', color: hexToRgba(color, 0.14) },
      });
    }
    figures.push({
      type: 'line',
      attrs: { coordinates },
      styles: { color, size: 1.5 },
    });

    if (coordinates.length >= 3) {
      const a = coordinates[0];
      const c = coordinates[2];
      figures.push({
        type: 'line',
        attrs: { coordinates: [a, { x: c.x + (c.x - a.x) * 0.5, y: c.y + (c.y - a.y) * 0.5 }] },
        styles: { color, size: 1.5 },
      });
    }
    if (coordinates.length >= 4) {
      const b = coordinates[1];
      const d = coordinates[3];
      figures.push({
        type: 'line',
        attrs: { coordinates: [b, { x: d.x + (d.x - b.x) * 0.5, y: d.y + (d.y - b.y) * 0.5 }] },
        styles: { color, size: 1.5 },
      });
    }

    coordinates.forEach((c, i) => {
      const prev = coordinates[i - 1];
      const isPeak = prev ? c.y < prev.y : i % 2 === 0;
      figures.push(makePivotBadge(c.x, c.y, labels[i] || `${i}`, color, isPeak));
    });
    return figures;
  },
};

/** 6. Three Drives Pattern (`threeDrivesPattern`) — 7 points */
export const threeDrivesPatternOverlay: OverlayTemplate = {
  name: 'threeDrivesPattern',
  totalStep: 8,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const color = (overlay.styles as any)?.line?.color || '#f59e0b';
    const labels = ['0', '1', 'A', '2', 'B', '3', 'C'];
    const figures: any[] = [
      { type: 'line', attrs: { coordinates }, styles: { color, size: 1.8 } },
    ];
    if (coordinates.length >= 4) {
      figures.push({
        type: 'line',
        ignoreEvent: true,
        attrs: { coordinates: [coordinates[1], coordinates[3]] },
        styles: { color, size: 1, style: 'dashed', dashedValue: [4, 4] },
      });
    }
    if (coordinates.length >= 6) {
      figures.push({
        type: 'line',
        ignoreEvent: true,
        attrs: { coordinates: [coordinates[3], coordinates[5]] },
        styles: { color, size: 1, style: 'dashed', dashedValue: [4, 4] },
      });
    }
    coordinates.forEach((c, i) => {
      const prev = coordinates[i - 1];
      const isPeak = prev ? c.y < prev.y : false;
      figures.push(makePivotBadge(c.x, c.y, labels[i] || `${i}`, color, isPeak));
    });
    return figures;
  },
};

/** 7-11. Elliott Waves Helper */
function createWaveOverlay(name: string, labels: string[], defaultColor: string): OverlayTemplate {
  return {
    name,
    totalStep: labels.length + 1,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length === 0) return [];
      if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
      const color = (overlay.styles as any)?.line?.color || defaultColor;
      const figures: any[] = [];
      if (coordinates.length >= 2) {
        figures.push({
          type: 'line',
          attrs: { coordinates },
          styles: { color, size: 1.6 },
        });
      }
      coordinates.forEach((c, i) => {
        const prev = coordinates[i - 1];
        const next = coordinates[i + 1];
        const isPeak =
          prev && next
            ? c.y < prev.y && c.y < next.y
            : prev
            ? c.y < prev.y
            : next
            ? c.y < next.y
            : true;
        figures.push({
          type: 'text',
          ignoreEvent: true,
          attrs: {
            x: c.x,
            y: isPeak ? c.y - 12 : c.y + 12,
            text: labels[i] || `${i}`,
            align: 'center',
            baseline: isPeak ? 'bottom' : 'top',
          },
          styles: {
            color,
            size: 11.5,
            weight: 'bold',
            family: 'Trebuchet MS, sans-serif',
            ...TRANSPARENT_TEXT,
          },
        });
      });
      return figures;
    },
  };
}

export const elliottImpulseOverlay = createWaveOverlay(
  'elliottImpulse',
  ['0', '(1)', '(2)', '(3)', '(4)', '(5)'],
  '#2962ff'
);
export const elliottCorrectionOverlay = createWaveOverlay(
  'elliottCorrection',
  ['0', '(A)', '(B)', '(C)'],
  '#f23645'
);
export const elliottTriangleOverlay = createWaveOverlay(
  'elliottTriangle',
  ['0', '(A)', '(B)', '(C)', '(D)', '(E)'],
  '#9c27b0'
);
export const elliottDoubleComboOverlay = createWaveOverlay(
  'elliottDoubleCombo',
  ['0', '(W)', '(X)', '(Y)'],
  '#089981'
);
export const elliottTripleComboOverlay = createWaveOverlay(
  'elliottTripleCombo',
  ['0', '(W)', '(X)', '(Y)', '(X)', '(Z)'],
  '#f59e0b'
);

/** 12. Cyclic Lines (`cyclicLines`) — repeating vertical period lines */
export const cyclicLinesOverlay: OverlayTemplate = {
  name: 'cyclicLines',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1] = coordinates;
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    const step = Math.max(12, Math.abs(c1.x - c0.x));
    const figures: any[] = [];

    const startK = Math.floor(-c0.x / step);
    const endK = Math.ceil((bounding.width - c0.x) / step);
    for (let k = startK; k <= endK; k++) {
      const x = c0.x + k * step;
      if (x < 0 || x > bounding.width) continue;
      figures.push({
        type: 'line',
        attrs: {
          coordinates: [
            { x, y: 0 },
            { x, y: bounding.height },
          ],
        },
        styles: { color, size: k === 0 || k === 1 ? 1.5 : 1 },
      });
    }
    return figures;
  },
};

/** 13. Time Cycles (`timeCycles`) — repeating semi-circular arches along c0.y */
export const timeCyclesOverlay: OverlayTemplate = {
  name: 'timeCycles',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1] = coordinates;
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    const step = Math.max(20, Math.abs(c1.x - c0.x));
    const r = step / 2;
    const baseY = c0.y;
    const figures: any[] = [];

    const startK = Math.floor(-c0.x / step) - 1;
    const endK = Math.ceil((bounding.width - c0.x) / step) + 1;
    const segs = 20;
    for (let k = startK; k <= endK; k++) {
      const cx = c0.x + k * step + r;
      if (cx + r < 0 || cx - r > bounding.width) continue;
      const pts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i <= segs; i++) {
        const a = Math.PI + (i / segs) * Math.PI;
        pts.push({ x: cx + Math.cos(a) * r, y: baseY + Math.sin(a) * Math.min(r, 90) });
      }
      figures.push({
        type: 'line',
        attrs: { coordinates: pts },
        styles: { color, size: 1.4 },
      });
    }
    return figures;
  },
};

/** 14. Sine Line (`sineLine`) — smooth continuous sine wave across chart width */
export const sineLineOverlay: OverlayTemplate = {
  name: 'sineLine',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1] = coordinates;
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    const halfPeriod = Math.max(16, Math.abs(c1.x - c0.x));
    const amp = Math.max(8, Math.abs(c1.y - c0.y));
    const dirY = c1.y <= c0.y ? -1 : 1;
    const pts: Array<{ x: number; y: number }> = [];
    const stepPx = 4;
    for (let x = 0; x <= bounding.width; x += stepPx) {
      const phase = ((x - c0.x) / halfPeriod) * Math.PI;
      pts.push({ x, y: c0.y + Math.sin(phase) * amp * dirY });
    }
    return [
      {
        type: 'line',
        attrs: { coordinates: pts },
        styles: { color, size: 1.6 },
      },
    ];
  },
};
