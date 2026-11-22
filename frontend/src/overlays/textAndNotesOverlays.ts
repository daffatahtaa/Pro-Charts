import { OverlayTemplate } from 'klinecharts';
import { DrawingExtendConfig } from '../types/chart';
import { useChartStore } from '../store/useChartStore';
import { isOverlayVisibleForTimeframe, formatFibPrice } from './index';

function extractText(extendData: any, fallback: string): string {
  if (typeof extendData === 'string' && extendData.trim()) return extendData.trim();
  if (extendData && typeof extendData === 'object') {
    if (typeof extendData.label === 'string' && extendData.label.trim()) return extendData.label.trim();
    if (typeof extendData.text === 'string' && extendData.text.trim()) return extendData.text.trim();
  }
  return fallback;
}

const TRANSPARENT_TEXT = {
  backgroundColor: 'transparent',
  borderColor: 'transparent',
  borderSize: 0,
  paddingLeft: 0,
  paddingRight: 0,
  paddingTop: 0,
  paddingBottom: 0,
};

/** 1. Clean Floating Text (`textNote`) */
export const textNoteOverlay: OverlayTemplate = {
  name: 'textNote',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length === 0) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const c = coordinates[0];
    const color = (overlay.styles as any)?.line?.color || '#d1d4dc';
    const text = extractText(overlay.extendData, 'Text');
    return [
      {
        type: 'text',
        ignoreEvent: false,
        attrs: { x: c.x, y: c.y, text, align: 'left', baseline: 'middle' },
        styles: {
          color,
          size: 13,
          weight: 'bold',
          family: 'Trebuchet MS, sans-serif',
          ...TRANSPARENT_TEXT,
        },
      },
    ];
  },
};

/** 2. Anchored Note (`anchoredNote`) */
export const anchoredNoteOverlay: OverlayTemplate = {
  name: 'anchoredNote',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length === 0) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const c = coordinates[0];
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    const text = extractText(overlay.extendData, 'Note');
    return [
      {
        type: 'line',
        attrs: { coordinates: [c, { x: c.x, y: c.y - 20 }] },
        styles: { color, size: 1.5 },
      },
      {
        type: 'text',
        ignoreEvent: false,
        attrs: { x: c.x, y: c.y - 20, text: `📝 ${text}`, align: 'center', baseline: 'bottom' },
        styles: {
          color: '#ffffff',
          size: 11,
          weight: 'bold',
          family: 'Trebuchet MS, sans-serif',
          backgroundColor: '#1e222d',
          borderColor: color,
          borderSize: 1.5,
          borderRadius: 4,
          paddingLeft: 8,
          paddingRight: 8,
          paddingTop: 4,
          paddingBottom: 4,
        },
      },
    ];
  },
};

/** 3. Price Note (`priceNote`) — 2-point leader line with anchor price + note */
export const priceNoteOverlay: OverlayTemplate = {
  name: 'priceNote',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay, precision }) => {
    if (coordinates.length === 0) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const c0 = coordinates[0];
    const c1 = coordinates[1] || { x: c0.x + 55, y: c0.y - 35 };
    const digits = precision?.price ?? 2;
    const price = overlay.points[0]?.value ?? 0;
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    const note = extractText(overlay.extendData, 'Price Note');
    return [
      {
        type: 'line',
        attrs: { coordinates: [c0, c1] },
        styles: { color, size: 1.5 },
      },
      {
        type: 'text',
        ignoreEvent: false,
        attrs: {
          x: c1.x,
          y: c1.y,
          text: `${formatFibPrice(price, digits)} · ${note}`,
          align: 'left',
          baseline: 'middle',
        },
        styles: {
          color: '#ffffff',
          size: 11,
          weight: 'bold',
          family: 'JetBrains Mono, monospace',
          backgroundColor: '#1e222d',
          borderColor: color,
          borderSize: 1.5,
          borderRadius: 4,
          paddingLeft: 7,
          paddingRight: 7,
          paddingTop: 4,
          paddingBottom: 4,
        },
      },
    ];
  },
};

/** 4. Pin Marker (`pinMarker`) */
export const pinMarkerOverlay: OverlayTemplate = {
  name: 'pinMarker',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length === 0) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const c = coordinates[0];
    const color = (overlay.styles as any)?.line?.color || '#f23645';
    const text = extractText(overlay.extendData, '');
    const figs: any[] = [
      {
        type: 'line',
        attrs: { coordinates: [c, { x: c.x, y: c.y - 16 }] },
        styles: { color, size: 2 },
      },
      {
        type: 'circle',
        attrs: { x: c.x, y: c.y - 22, r: 7 },
        styles: { style: 'stroke_fill', color, borderColor: '#ffffff', borderSize: 1.5 },
      },
    ];
    if (text) {
      figs.push({
        type: 'text',
        ignoreEvent: false,
        attrs: { x: c.x, y: c.y - 32, text, align: 'center', baseline: 'bottom' },
        styles: {
          color: '#ffffff',
          size: 10.5,
          weight: 'bold',
          family: 'Trebuchet MS, sans-serif',
          backgroundColor: '#1e222d',
          borderColor: color,
          borderSize: 1,
          borderRadius: 3,
          paddingLeft: 6,
          paddingRight: 6,
          paddingTop: 2,
          paddingBottom: 2,
        },
      });
    }
    return figs;
  },
};

/** 5. On-Chart Table (`chartTable`) */
export const chartTableOverlay: OverlayTemplate = {
  name: 'chartTable',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length === 0) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const c = coordinates[0];
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    const raw = extractText(
      overlay.extendData,
      'Trend: Bullish; HTF Zone: Demand; Trigger: CHoCH + FVG; Risk: 1.0%'
    );
    const rows = raw
      .split(';')
      .map((r) => r.trim())
      .filter(Boolean)
      .slice(0, 8)
      .map((r) => {
        const sep = r.includes('|') ? '|' : ':';
        const idx = r.indexOf(sep);
        if (idx === -1) return [r, ''];
        return [r.slice(0, idx).trim(), r.slice(idx + 1).trim()];
      });

    const rowH = 22;
    const col1W = 96;
    const col2W = 124;
    const totalW = col1W + col2W;
    const totalH = Math.max(1, rows.length) * rowH;

    const figs: any[] = [
      {
        type: 'rect',
        attrs: { x: c.x, y: c.y, width: totalW, height: totalH },
        styles: {
          style: 'stroke_fill',
          color: 'rgba(30, 34, 45, 0.94)',
          borderColor: color,
          borderSize: 1.5,
        },
      },
    ];

    rows.forEach(([k, v], i) => {
      const y = c.y + i * rowH;
      if (i > 0) {
        figs.push({
          type: 'line',
          ignoreEvent: true,
          attrs: { coordinates: [{ x: c.x, y }, { x: c.x + totalW, y }] },
          styles: { color: '#2a2e39', size: 1 },
        });
      }
      figs.push(
        {
          type: 'text',
          ignoreEvent: true,
          attrs: { x: c.x + 8, y: y + rowH / 2, text: k, align: 'left', baseline: 'middle' },
          styles: {
            color: '#787b86',
            size: 10.5,
            weight: 'bold',
            family: 'Trebuchet MS, sans-serif',
            ...TRANSPARENT_TEXT,
          },
        },
        {
          type: 'text',
          ignoreEvent: true,
          attrs: {
            x: c.x + col1W + 8,
            y: y + rowH / 2,
            text: v,
            align: 'left',
            baseline: 'middle',
          },
          styles: {
            color: '#ffffff',
            size: 10.5,
            weight: 'bold',
            family: 'JetBrains Mono, monospace',
            ...TRANSPARENT_TEXT,
          },
        }
      );
    });

    figs.push({
      type: 'line',
      ignoreEvent: true,
      attrs: { coordinates: [{ x: c.x + col1W, y: c.y }, { x: c.x + col1W, y: c.y + totalH }] },
      styles: { color: '#2a2e39', size: 1 },
    });

    return figs;
  },
};

/** 6. Comment Bubble (`commentBubble`) */
export const commentBubbleOverlay: OverlayTemplate = {
  name: 'commentBubble',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length === 0) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const c = coordinates[0];
    const color = (overlay.styles as any)?.line?.color || '#2962ff';
    const text = extractText(overlay.extendData, 'Comment');
    return [
      {
        type: 'polygon',
        ignoreEvent: true,
        attrs: {
          coordinates: [
            { x: c.x, y: c.y },
            { x: c.x + 6, y: c.y - 10 },
            { x: c.x + 14, y: c.y - 10 },
          ],
        },
        styles: { style: 'fill', color },
      },
      {
        type: 'text',
        ignoreEvent: false,
        attrs: { x: c.x + 4, y: c.y - 10, text, align: 'left', baseline: 'bottom' },
        styles: {
          color: '#ffffff',
          size: 11.5,
          weight: 'bold',
          family: 'Trebuchet MS, sans-serif',
          backgroundColor: color,
          borderRadius: 12,
          paddingLeft: 10,
          paddingRight: 10,
          paddingTop: 5,
          paddingBottom: 5,
        },
      },
    ];
  },
};

/** 7. Signpost (`signpostMarker`) */
export const signpostMarkerOverlay: OverlayTemplate = {
  name: 'signpostMarker',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length === 0) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const c = coordinates[0];
    const color = (overlay.styles as any)?.line?.color || '#f59e0b';
    const text = extractText(overlay.extendData, 'Signpost');
    return [
      {
        type: 'line',
        attrs: { coordinates: [c, { x: c.x, y: c.y - 26 }] },
        styles: { color, size: 2 },
      },
      {
        type: 'text',
        ignoreEvent: false,
        attrs: { x: c.x, y: c.y - 26, text: `★ ${text}`, align: 'center', baseline: 'bottom' },
        styles: {
          color: '#131722',
          size: 11,
          weight: 'bold',
          family: 'Trebuchet MS, sans-serif',
          backgroundColor: color,
          borderRadius: 10,
          paddingLeft: 8,
          paddingRight: 8,
          paddingTop: 3,
          paddingBottom: 3,
        },
      },
    ];
  },
};

/** 8. Flag Mark (`flagMarker`) */
export const flagMarkerOverlay: OverlayTemplate = {
  name: 'flagMarker',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length === 0) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const c = coordinates[0];
    const color = (overlay.styles as any)?.line?.color || '#089981';
    const text = extractText(overlay.extendData, '');
    const figs: any[] = [
      {
        type: 'line',
        attrs: { coordinates: [c, { x: c.x, y: c.y - 26 }] },
        styles: { color, size: 2 },
      },
      {
        type: 'polygon',
        attrs: {
          coordinates: [
            { x: c.x, y: c.y - 26 },
            { x: c.x + 18, y: c.y - 20 },
            { x: c.x, y: c.y - 13 },
          ],
        },
        styles: { style: 'fill', color },
      },
    ];
    if (text) {
      figs.push({
        type: 'text',
        ignoreEvent: false,
        attrs: { x: c.x + 22, y: c.y - 20, text, align: 'left', baseline: 'middle' },
        styles: {
          color,
          size: 11,
          weight: 'bold',
          family: 'Trebuchet MS, sans-serif',
          ...TRANSPARENT_TEXT,
        },
      });
    }
    return figs;
  },
};

/** 9-11. Content Cards: Image (`chartImage`), Post (`socialPostTag`), Idea (`tradingIdeaTag`) */
function createContentCardTemplate(
  name: string,
  prefix: string,
  defaultColor: string,
  fallbackFn: (priceStr: string) => string
): OverlayTemplate {
  return {
    name,
    totalStep: 2,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ coordinates, overlay, precision }) => {
      if (coordinates.length === 0) return [];
      if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
      const c = coordinates[0];
      const digits = precision?.price ?? 2;
      const priceStr = formatFibPrice(overlay.points[0]?.value ?? 0, digits);
      const color = (overlay.styles as any)?.line?.color || defaultColor;
      const text = extractText(overlay.extendData, fallbackFn(priceStr));
      return [
        {
          type: 'text',
          ignoreEvent: false,
          attrs: { x: c.x, y: c.y, text: `${prefix} ${text}`, align: 'left', baseline: 'middle' },
          styles: {
            color: '#ffffff',
            size: 11,
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
}

export const chartImageOverlay = createContentCardTemplate(
  'chartImage',
  '[🖼 IMAGE]',
  '#2962ff',
  () => 'Chart Snapshot'
);
export const socialPostTagOverlay = createContentCardTemplate(
  'socialPostTag',
  '[𝕏 POST]',
  '#787b86',
  () => '@Trader · Setup Note'
);
export const tradingIdeaTagOverlay = createContentCardTemplate(
  'tradingIdeaTag',
  '[💡 IDEA]',
  '#f59e0b',
  (p) => `Trade Idea @ ${p}`
);

/** 12. Icon / Emoji / Sticker Stamp (`iconStamp`) */
export const iconStampOverlay: OverlayTemplate = {
  name: 'iconStamp',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length === 0) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const c = coordinates[0];
    const ext = (overlay.extendData || {}) as DrawingExtendConfig;
    const glyph = ext.iconGlyph || useChartStore.getState().activeIconGlyph || '★';
    const size = ext.iconSize || 24;
    const color = (overlay.styles as any)?.line?.color || '#d1d4dc';
    return [
      {
        type: 'text',
        ignoreEvent: false,
        attrs: { x: c.x, y: c.y, text: glyph, align: 'center', baseline: 'middle' },
        styles: {
          color,
          size,
          family: 'Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif',
          ...TRANSPARENT_TEXT,
        },
      },
    ];
  },
};
