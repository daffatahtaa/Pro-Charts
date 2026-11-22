import { OverlayTemplate } from 'klinecharts';
import { DrawingExtendConfig, getContrastTextColor } from '../types/chart';
import { useChartStore } from '../store/useChartStore';
import { isOverlayVisibleForTimeframe, hexToRgba, formatFibPrice, toHairlineSize } from './index';

/**
 * Rectangle Supply / Demand Zone Overlay (`rectBox`)
 */
export const rectBoxOverlay: OverlayTemplate = {
  name: 'rectBox',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const [c1, c2] = coordinates;
    const ext = (overlay.extendData || {}) as DrawingExtendConfig;
    const x = ext.extendLeft ? 0 : Math.min(c1.x, c2.x);
    const rightX = ext.extendRight ? bounding.width : Math.max(c1.x, c2.x);
    const y = Math.min(c1.y, c2.y);
    const width = Math.max(2, rightX - x);
    const height = Math.abs(c2.y - c1.y);

    const customLineColor = (overlay.styles as any)?.line?.color || '#2962ff';
    const customLineSize = toHairlineSize((overlay.styles as any)?.line?.size || 1);
    const customLineStyle = (overlay.styles as any)?.line?.style || 'solid';
    const bgAlpha = ext.backgroundOpacity ?? 0.18;
    const customFillColor =
      ext.showBackground === false
        ? 'transparent'
        : ext.backgroundOpacity !== undefined
        ? hexToRgba(customLineColor, bgAlpha)
        : (overlay.styles as any)?.polygon?.color || 'rgba(41, 98, 255, 0.18)';
    const customLabel = String(ext.label || '').trim();

    const figures: any[] = [
      {
        type: 'rect',
        attrs: { x, y, width, height },
        styles: {
          style: 'stroke_fill',
          color: customFillColor,
          borderColor: customLineColor,
          borderSize: customLineSize,
          borderStyle: customLineStyle === 'dashed' ? 'dashed' : 'solid',
          borderDashedValue: [4, 4],
        },
      },
    ];

    // Optional 50% Equilibrium / Consequent Encroachment (CE) Middle Line
    if (ext.showMiddleLine) {
      const midY = y + height / 2;
      figures.push({
        type: 'line',
        ignoreEvent: true,
        attrs: {
          coordinates: [
            { x, y: midY },
            { x: x + width, y: midY },
          ],
        },
        styles: {
          color: customLineColor,
          size: toHairlineSize(1),
          style: 'dashed',
          dashedValue: [4, 4],
        },
      });
    }

    if (customLabel) {
      const pos = ((overlay.extendData as any)?.labelPosition || 'top') as
        | 'top'
        | 'center'
        | 'bottom';
      const textX = pos === 'center' ? x + width / 2 : x + 6;
      const textY =
        pos === 'bottom'
          ? y + height - 6
          : pos === 'center'
          ? y + height / 2
          : y + 6;
      const align = pos === 'center' ? 'center' : 'left';
      const baseline =
        pos === 'bottom' ? 'bottom' : pos === 'center' ? 'middle' : 'top';

      const canvasBg = useChartStore.getState().chartSettings.canvasBgColor;
      const textColor = getContrastTextColor(canvasBg) === '#ffffff' ? '#d1d4dc' : '#131722';

      figures.push({
        type: 'text',
        ignoreEvent: true,
        attrs: {
          x: textX,
          y: textY,
          text: customLabel,
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
      });
    }

    return figures;
  },
};

/**
 * Trend-Based Fib Extension Overlay (`fibExtension`)
 * 3 points: Swing Start -> Swing End -> Retracement Point
 */
const FIB_EXT_LEVELS = [
  { ratio: 0, color: '#787b86' },
  { ratio: 0.618, color: '#089981' },
  { ratio: 1.0, color: '#2962ff' },
  { ratio: 1.618, color: '#f59e0b' },
  { ratio: 2.618, color: '#f23645' },
];

export const fibExtensionOverlay: OverlayTemplate = {
  name: 'fibExtension',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding, overlay, precision }) => {
    if (coordinates.length < 2) return [];
    if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
    const digits = precision?.price ?? 2;
    const ext = (overlay.extendData || {}) as DrawingExtendConfig;
    const baseColor = (overlay.styles as any)?.line?.color || '#2962ff';
    const figures: any[] = [];

    // Trend leg 1 -> 2
    if (ext.showTrendLine !== false) {
      figures.push({
        type: 'line',
        attrs: { coordinates: [coordinates[0], coordinates[1]] },
        styles: {
          color: ext.trendLineColor || '#787b86',
          size: 1,
          style: ext.trendLineStyle || 'dashed',
          dashedValue: [4, 4],
        },
      });
    }

    if (coordinates.length < 3) return figures;

    // Retracement leg 2 -> 3
    if (ext.showTrendLine !== false) {
      figures.push({
        type: 'line',
        attrs: { coordinates: [coordinates[1], coordinates[2]] },
        styles: {
          color: ext.trendLineColor || '#787b86',
          size: 1,
          style: ext.trendLineStyle || 'dashed',
          dashedValue: [4, 4],
        },
      });
    }

    const p0 = overlay.points[0]?.value ?? 0;
    const p1 = overlay.points[1]?.value ?? 0;
    const p2 = overlay.points[2]?.value ?? 0;
    const yDiff = coordinates[1].y - coordinates[0].y;
    const valDiff = p1 - p0;
    const startX = ext.extendLeft ? 0 : coordinates[2].x;
    const endX =
      ext.extendRight === false
        ? Math.max(coordinates[2].x + 120, coordinates[1].x)
        : bounding.width;
    const spanWidth = Math.max(120, endX - startX);

    const activeLevels =
      ext.fibLevels && ext.fibLevels.length > 0
        ? ext.fibLevels.filter((l) => l.enabled)
        : FIB_EXT_LEVELS;

    const lvlStyle = ext.levelsLineStyle || 'solid';
    const lvlWidth = toHairlineSize(ext.levelsLineWidth || 1);
    const dashedValue =
      lvlStyle === 'dotted' ? [2, 3] : lvlStyle === 'dashed' ? [5, 4] : undefined;

    const isRev = Boolean(ext.fibReverse);
    const getEffR = (r: number) => (isRev ? -r : r);

    // Background fill between consecutive enabled extension levels (OFF by default!)
    const showBg = Boolean(ext.showBackground);
    const bgAlpha = ext.backgroundOpacity ?? 0.12;
    if (showBg && bgAlpha > 0 && activeLevels.length >= 2) {
      const sorted = [...activeLevels].sort((a, b) => getEffR(a.ratio) - getEffR(b.ratio));
      for (let i = 0; i < sorted.length - 1; i++) {
        const lvlA = sorted[i];
        const lvlB = sorted[i + 1];
        const yA = coordinates[2].y + yDiff * getEffR(lvlA.ratio);
        const yB = coordinates[2].y + yDiff * getEffR(lvlB.ratio);
        const rectTop = Math.min(yA, yB);
        const rectH = Math.abs(yB - yA);
        if (rectH < 0.5) continue;
        const fillHex = ext.useOneColor ? ext.oneColor || baseColor : lvlB.color;
        figures.push({
          type: 'rect',
          ignoreEvent: true,
          attrs: { x: startX, y: rectTop, width: spanWidth, height: rectH },
          styles: {
            style: 'fill',
            color: hexToRgba(fillHex, bgAlpha),
          },
        });
      }
    }

    const showLevels = ext.fibShowLevels !== false;
    const showPrices = ext.fibShowPrices !== false;
    const isPercent = ext.fibFormat === 'percent';
    const labelsAlign = ext.fibLabelsAlign || 'right';
    const labelX =
      labelsAlign === 'right'
        ? endX - 6
        : labelsAlign === 'center'
        ? (startX + endX) / 2
        : startX + 4;

    for (const lvl of activeLevels) {
      const effR = getEffR(lvl.ratio);
      const y = coordinates[2].y + yDiff * effR;
      const price = p2 + valDiff * effR;
      const c = ext.useOneColor ? ext.oneColor || baseColor : lvl.color;
      figures.push({
        type: 'line',
        attrs: {
          coordinates: [
            { x: startX, y },
            { x: endX, y },
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
        const priceStr = showPrices ? `(${formatFibPrice(price, digits)})` : '';
        const fullText = [lvlStr, priceStr].filter(Boolean).join(' ');
        if (fullText) {
          figures.push({
            type: 'text',
            ignoreEvent: true,
            attrs: {
              x: labelX,
              y: y - 3,
              text: fullText,
              align: labelsAlign,
              baseline: 'bottom',
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

    return figures;
  },
};
