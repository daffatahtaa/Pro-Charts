import { OverlayTemplate } from 'klinecharts';

export const rulerMeasureOverlay: OverlayTemplate = {
  name: 'rulerMeasure',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay, precision }) => {
    if (coordinates.length < 2) return [];
    const [c1, c2] = coordinates;
    const p1 = overlay.points[0];
    const p2 = overlay.points[1];
    const digits = precision?.price ?? 2;

    const val1 = p1?.value ?? 0;
    const val2 = p2?.value ?? 0;
    const priceDiff = val2 - val1;
    const isUp = priceDiff >= 0;

    const fillColor = isUp ? 'rgba(41, 98, 255, 0.20)' : 'rgba(242, 54, 69, 0.20)';
    const borderColor = isUp ? '#2962ff' : '#f23645';

    const x = Math.min(c1.x, c2.x);
    const y = Math.min(c1.y, c2.y);
    const width = Math.abs(c2.x - c1.x);
    const height = Math.abs(c2.y - c1.y);
    const midX = x + width / 2;
    const midY = y + height / 2;

    const pctDiff = val1 !== 0 ? ((priceDiff / val1) * 100).toFixed(2) : '0.00';
    // Infer point from digits (e.g. 5 digits -> 0.00001, 2 digits -> 0.01)
    const point = Math.pow(10, -digits);
    const pipFactor = digits === 3 || digits === 5 ? point * 10 : point * 10;
    const pips = pipFactor > 0 ? (Math.abs(priceDiff) / pipFactor).toFixed(1) : '0.0';

    const bars =
      p1?.dataIndex !== undefined && p2?.dataIndex !== undefined
        ? Math.abs(p2.dataIndex - p1.dataIndex)
        : null;

    const sign = priceDiff >= 0 ? '+' : '';
    const barLabel = bars !== null ? ` | ${bars} bars` : '';
    const labelText = `${sign}${priceDiff.toFixed(digits)} (${sign}${pctDiff}%) | ${pips} pips${barLabel}`;

    return [
      {
        type: 'rect',
        attrs: { x, y, width, height },
        styles: {
          style: 'stroke_fill',
          color: fillColor,
          borderColor,
          borderSize: 1,
        },
      },
      // Horizontal center line
      {
        type: 'line',
        ignoreEvent: true,
        attrs: {
          coordinates: [
            { x, y: midY },
            { x: x + width, y: midY },
          ],
        },
        styles: {
          color: borderColor,
          size: 1,
          style: 'dashed',
          dashedValue: [3, 3],
        },
      },
      // Vertical center line
      {
        type: 'line',
        ignoreEvent: true,
        attrs: {
          coordinates: [
            { x: midX, y },
            { x: midX, y: y + height },
          ],
        },
        styles: {
          color: borderColor,
          size: 1,
          style: 'dashed',
          dashedValue: [3, 3],
        },
      },
      // Measurement Info Box
      {
        type: 'text',
        ignoreEvent: true,
        attrs: {
          x: midX,
          y: isUp ? y - 8 : y + height + 8,
          text: labelText,
          align: 'center',
          baseline: isUp ? 'bottom' : 'top',
        },
        styles: {
          color: '#ffffff',
          size: 11,
          family: 'JetBrains Mono, monospace',
          backgroundColor: borderColor,
          borderRadius: 3,
          paddingLeft: 8,
          paddingRight: 8,
          paddingTop: 4,
          paddingBottom: 4,
        },
      },
    ];
  },
};
