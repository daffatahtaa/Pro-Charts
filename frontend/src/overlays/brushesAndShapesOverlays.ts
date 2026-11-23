import { OverlayTemplate } from 'klinecharts';
import { isOverlayVisibleForTimeframe, hexToRgba, toHairlineSize } from './index';

function sampleQuadBezier(
  p0: { x: number; y: number },
  pc: { x: number; y: number },
  p1: { x: number; y: number },
  segs = 24
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const u = 1 - t;
    pts.push({
      x: u * u * p0.x + 2 * u * t * pc.x + t * t * p1.x,
      y: u * u * p0.y + 2 * u * t * pc.y + t * t * p1.y,
    });
  }
  return pts;
}

function sampleCubicBezier(
  p0: { x: number; y: number },
  c1: { x: number; y: number },
  c2: { x: number; y: number },
  p1: { x: number; y: number },
  segs = 32
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const u = 1 - t;
    pts.push({
      x:
        u * u * u * p0.x +
        3 * u * u * t * c1.x +
        3 * u * t * t * c2.x +
        t * t * t * p1.x,
      y:
        u * u * u * p0.y +
        3 * u * u * t * c1.y +
        3 * u * t * t * c2.y +
        t * t * t * p1.y,
    });
  }
  return pts;
}

function smoothSpline(coords: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (coords.length <= 2) return coords;
  const out: Array<{ x: number; y: number }> = [coords[0]];
  for (let i = 1; i < coords.length - 1; i++) {
    const pPrev = coords[i - 1];
    const pCur = coords[i];
    const pNext = coords[i + 1];
    const mid1 = { x: (pPrev.x + pCur.x) / 2, y: (pPrev.y + pCur.y) / 2 };
    const mid2 = { x: (pCur.x + pNext.x) / 2, y: (pCur.y + pNext.y) / 2 };
    const seg = sampleQuadBezier(mid1, pCur, mid2, 10);
    out.push(...seg);
  }
  out.push(coords[coords.length - 1]);
  return out;
}

function makeArrowheadPolygon(
  from: { x: number; y: number },
  to: { x: number; y: number },
  headLen = 12,
  headWidth = 5
): Array<{ x: number; y: number }> {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  return [
    to,
    {
      x: to.x - headLen * Math.cos(angle) + headWidth * Math.sin(angle),
      y: to.y - headLen * Math.sin(angle) - headWidth * Math.cos(angle),
    },
    {
      x: to.x - headLen * Math.cos(angle) - headWidth * Math.sin(angle),
      y: to.y - headLen * Math.sin(angle) + headWidth * Math.cos(angle),
    },
  ];
}

/** 1. Brush (`brushTool`) */
export const brushToolOverlay: OverlayTemplate = {
  name: 'brushTool',
  totalStep: 5,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const lineStyle = (overlay.styles as any)?.line || {};
    const color = lineStyle.color || '#2962ff';
    return [
      {
        type: 'line',
        attrs: { coordinates: smoothSpline(coordinates) },
        styles: { color, size: Math.max(2, lineStyle.size || 2.5) },
      },
    ];
  },
};

/** 2. Highlighter (`highlighterTool`) */
export const highlighterToolOverlay: OverlayTemplate = {
  name: 'highlighterTool',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const color = (overlay.styles as any)?.line?.color || '#f59e0b';
    return [
      {
        type: 'line',
        attrs: { coordinates: smoothSpline(coordinates) },
        styles: { color: hexToRgba(color, 0.35), size: 16 },
      },
    ];
  },
};

/** 3. Arrow Marker (`arrowMarker`) — bold tapered filled arrow */
export const arrowMarkerOverlay: OverlayTemplate = {
  name: 'arrowMarker',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1] = coordinates;
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    const dx = c1.x - c0.x;
    const dy = c1.y - c0.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const headLen = Math.min(20, len * 0.4);
    const baseTip = { x: c1.x - ux * headLen, y: c1.y - uy * headLen };
    const poly = [
      { x: c0.x + px * 3, y: c0.y + py * 3 },
      { x: baseTip.x + px * 5, y: baseTip.y + py * 5 },
      { x: baseTip.x + px * 11, y: baseTip.y + py * 11 },
      c1,
      { x: baseTip.x - px * 11, y: baseTip.y - py * 11 },
      { x: baseTip.x - px * 5, y: baseTip.y - py * 5 },
      { x: c0.x - px * 3, y: c0.y - py * 3 },
    ];
    return [
      {
        type: 'polygon',
        attrs: { coordinates: poly },
        styles: { style: 'stroke_fill', color: hexToRgba(color, 0.75), borderColor: color, borderSize: 1 },
      },
    ];
  },
};

/** 4. Arrow (`arrowLine`) — 2-point line with filled triangular arrowhead */
export const arrowLineOverlay: OverlayTemplate = {
  name: 'arrowLine',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1] = coordinates;
    const lineStyle = (overlay.styles as any)?.line || {};
    const color = lineStyle.color || '#2962ff';
    return [
      {
        type: 'line',
        attrs: { coordinates: [c0, c1] },
        styles: { color, size: lineStyle.size || 2 },
      },
      {
        type: 'polygon',
        attrs: { coordinates: makeArrowheadPolygon(c0, c1, 13, 5.5) },
        styles: { style: 'fill', color },
      },
    ];
  },
};

/** 5. Arrow Mark Up (`arrowMarkUp`) */
export const arrowMarkUpOverlay: OverlayTemplate = {
  name: 'arrowMarkUp',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length === 0) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const c = coordinates[0];
    const color = (overlay.styles as any)?.line?.color || '#089981';
    const poly = [
      { x: c.x, y: c.y - 14 },
      { x: c.x + 10, y: c.y },
      { x: c.x + 4, y: c.y },
      { x: c.x + 4, y: c.y + 12 },
      { x: c.x - 4, y: c.y + 12 },
      { x: c.x - 4, y: c.y },
      { x: c.x - 10, y: c.y },
    ];
    return [{ type: 'polygon', attrs: { coordinates: poly }, styles: { style: 'fill', color } }];
  },
};

/** 6. Arrow Mark Down (`arrowMarkDown`) */
export const arrowMarkDownOverlay: OverlayTemplate = {
  name: 'arrowMarkDown',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length === 0) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const c = coordinates[0];
    const color = (overlay.styles as any)?.line?.color || '#f23645';
    const poly = [
      { x: c.x, y: c.y + 14 },
      { x: c.x + 10, y: c.y },
      { x: c.x + 4, y: c.y },
      { x: c.x + 4, y: c.y - 12 },
      { x: c.x - 4, y: c.y - 12 },
      { x: c.x - 4, y: c.y },
      { x: c.x - 10, y: c.y },
    ];
    return [{ type: 'polygon', attrs: { coordinates: poly }, styles: { style: 'fill', color } }];
  },
};

/** 7. Rotated Rectangle (`rotatedRectangle`) — 3-point angled rectangle */
export const rotatedRectangleOverlay: OverlayTemplate = {
  name: 'rotatedRectangle',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1, c2] = coordinates;
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    if (!c2) {
      return [{ type: 'line', attrs: { coordinates: [c0, c1] }, styles: { color, size: 1.5 } }];
    }
    const dx = c1.x - c0.x;
    const dy = c1.y - c0.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    const proj = (c2.x - c0.x) * nx + (c2.y - c0.y) * ny;
    const p3 = { x: c1.x + nx * proj, y: c1.y + ny * proj };
    const p4 = { x: c0.x + nx * proj, y: c0.y + ny * proj };
    return [
      {
        type: 'polygon',
        attrs: { coordinates: [c0, c1, p3, p4] },
        styles: {
          style: 'stroke_fill',
          color: hexToRgba(color, 0.16),
          borderColor: color,
          borderSize: toHairlineSize(1),
        },
      },
    ];
  },
};

/** 8. Path (`pathTool`) — unlimited connected points with arrowhead at last vertex until finished/cancelled */
export const pathToolOverlay: OverlayTemplate = {
  name: 'pathTool',
  totalStep: 10000,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const lineStyle = (overlay.styles as any)?.line || {};
    const color = lineStyle.color || '#2962ff';
    const size = toHairlineSize(lineStyle.size || 1.8);
    const style = lineStyle.style || 'solid';
    const dashedValue = lineStyle.dashedValue || [4, 4];

    const last = coordinates[coordinates.length - 1];
    // Walk backward to find the last distinct vertex so duplicate double-click vertices don't collapse the arrowhead
    let prev = coordinates[coordinates.length - 2];
    for (let i = coordinates.length - 2; i >= 0; i--) {
      const c = coordinates[i];
      if (Math.hypot(last.x - c.x, last.y - c.y) > 0.5) {
        prev = c;
        break;
      }
    }
    const figures: any[] = [
      {
        type: 'line',
        attrs: { coordinates },
        styles: { color, size, style, dashedValue },
      },
    ];
    if (Math.hypot(last.x - prev.x, last.y - prev.y) > 0.5) {
      figures.push({
        type: 'polygon',
        attrs: { coordinates: makeArrowheadPolygon(prev, last, 11, 5) },
        styles: { style: 'fill', color },
      });
    }
    return figures;
  },
};

/** 9. Circle (`circleShape`) — 2-point center to radius */
export const circleShapeOverlay: OverlayTemplate = {
  name: 'circleShape',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1] = coordinates;
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    const r = Math.max(4, Math.hypot(c1.x - c0.x, c1.y - c0.y));
    const pts: Array<{ x: number; y: number }> = [];
    const segs = 40;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push({ x: c0.x + Math.cos(a) * r, y: c0.y + Math.sin(a) * r });
    }
    return [
      {
        type: 'polygon',
        attrs: { coordinates: pts },
        styles: {
          style: 'stroke_fill',
          color: hexToRgba(color, 0.16),
          borderColor: color,
          borderSize: toHairlineSize(1),
        },
      },
    ];
  },
};

/** 10. Ellipse (`ellipseShape`) — 2-point bounding box ellipse */
export const ellipseShapeOverlay: OverlayTemplate = {
  name: 'ellipseShape',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1] = coordinates;
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    const cx = (c0.x + c1.x) / 2;
    const cy = (c0.y + c1.y) / 2;
    const rx = Math.max(4, Math.abs(c1.x - c0.x) / 2);
    const ry = Math.max(4, Math.abs(c1.y - c0.y) / 2);
    const pts: Array<{ x: number; y: number }> = [];
    const segs = 40;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
    }
    return [
      {
        type: 'polygon',
        attrs: { coordinates: pts },
        styles: {
          style: 'stroke_fill',
          color: hexToRgba(color, 0.16),
          borderColor: color,
          borderSize: toHairlineSize(1),
        },
      },
    ];
  },
};

/** 11. Polyline (`polylineShape`) — 5-point filled & bordered polygon */
export const polylineShapeOverlay: OverlayTemplate = {
  name: 'polylineShape',
  totalStep: 6,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    if (coordinates.length < 3) {
      return [{ type: 'line', attrs: { coordinates }, styles: { color, size: 1.5 } }];
    }
    return [
      {
        type: 'polygon',
        attrs: { coordinates },
        styles: {
          style: 'stroke_fill',
          color: hexToRgba(color, 0.16),
          borderColor: color,
          borderSize: toHairlineSize(1),
        },
      },
    ];
  },
};

/** 12. Triangle (`triangleShape`) — 3-point filled & bordered triangle */
export const triangleShapeOverlay: OverlayTemplate = {
  name: 'triangleShape',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    if (coordinates.length < 3) {
      return [{ type: 'line', attrs: { coordinates }, styles: { color, size: 1.5 } }];
    }
    return [
      {
        type: 'polygon',
        attrs: { coordinates: [coordinates[0], coordinates[1], coordinates[2]] },
        styles: {
          style: 'stroke_fill',
          color: hexToRgba(color, 0.16),
          borderColor: color,
          borderSize: toHairlineSize(1),
        },
      },
    ];
  },
};

/** 13. Arc (`arcShape`) — 3-point quadratic Bezier curve with shaded chord fill */
export const arcShapeOverlay: OverlayTemplate = {
  name: 'arcShape',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1, c2] = coordinates;
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    if (!c2) {
      return [{ type: 'line', attrs: { coordinates: [c0, c1] }, styles: { color, size: 1.5 } }];
    }
    // Control point so curve passes through c2 at t=0.5
    const pc = { x: 2 * c2.x - 0.5 * (c0.x + c1.x), y: 2 * c2.y - 0.5 * (c0.y + c1.y) };
    const curvePts = sampleQuadBezier(c0, pc, c1, 28);
    return [
      {
        type: 'polygon',
        ignoreEvent: true,
        attrs: { coordinates: curvePts },
        styles: { style: 'fill', color: hexToRgba(color, 0.14) },
      },
      {
        type: 'line',
        attrs: { coordinates: curvePts },
        styles: { color, size: 1.8 },
      },
    ];
  },
};

/** 14. Curve (`curveShape`) — 3-point smooth quadratic Bezier */
export const curveShapeOverlay: OverlayTemplate = {
  name: 'curveShape',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1, c2] = coordinates;
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    if (!c2) {
      return [{ type: 'line', attrs: { coordinates: [c0, c1] }, styles: { color, size: 1.5 } }];
    }
    const curvePts = sampleQuadBezier(c0, c2, c1, 28);
    return [{ type: 'line', attrs: { coordinates: curvePts }, styles: { color, size: 1.8 } }];
  },
};

/** 15. Double Curve (`doubleCurveShape`) — 4-point cubic S-curve Bezier */
export const doubleCurveShapeOverlay: OverlayTemplate = {
  name: 'doubleCurveShape',
  totalStep: 5,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c0, c1, c2, c3] = coordinates;
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    if (!c2) {
      return [{ type: 'line', attrs: { coordinates: [c0, c1] }, styles: { color, size: 1.5 } }];
    }
    const ctrl2 = c3 || c2;
    const curvePts = sampleCubicBezier(c0, c2, ctrl2, c1, 32);
    return [{ type: 'line', attrs: { coordinates: curvePts }, styles: { color, size: 1.8 } }];
  },
};
