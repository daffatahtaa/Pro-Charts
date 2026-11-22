import { OverlayTemplate } from 'klinecharts';
import { useChartStore } from '../store/useChartStore';
import { DrawingExtendConfig } from '../types/chart';
import {
  isOverlayVisibleForTimeframe,
  hexToRgba,
  toHairlineSize,
  getHoveredOverlayId,
  convertOverlayPointsToPixel,
} from './index';

export interface ResolvedRRPrices {
  entry: number;
  tp: number;
  sl: number;
}

/**
 * Normalizes any 3 R:R overlay points into strictly valid trading order:
 * - Long (BUY):  SL < Entry < TP
 * - Short (SELL): TP < Entry < SL
 * This prevents inverted stops (MT5 retcode 10016) regardless of click order or handle dragging.
 */
export function resolveRiskRewardPrices(
  isLong: boolean,
  p0: number,
  p1: number,
  p2: number
): ResolvedRRPrices {
  const sorted = [p0, p1, p2].sort((a, b) => a - b);
  if (isLong) {
    return { sl: sorted[0], entry: sorted[1], tp: sorted[2] };
  }
  return { tp: sorted[0], entry: sorted[1], sl: sorted[2] };
}

function fmtNum(val: number, decimals: number): string {
  return val.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtSmart(val: number, maxDecimals = 2): string {
  const n = Number(val.toFixed(maxDecimals));
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}

function createRiskRewardTemplate(isLong: boolean): OverlayTemplate {
  return {
    name: isLong ? 'riskRewardLong' : 'riskRewardShort',
    totalStep: 4,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    performEventMoveForDrawing: ({ points, performPointIndex, performPoint }) => {
      // Lock ONLY Point 2 (performPointIndex === 2) horizontally to Point 0 (Left Edge).
      // NOTE: Never check `currentStep === 3` here because KLineCharts' OverlayImp.setPoints()
      // passes `currentStep: i + 2` (so i=1 has currentStep=3 & performPoint=points[1]!).
      if (performPointIndex === 2 && points[0]) {
        performPoint.timestamp = points[0].timestamp;
        performPoint.dataIndex = points[0].dataIndex;
        if (points[2]) {
          points[2].timestamp = points[0].timestamp;
          points[2].dataIndex = points[0].dataIndex;
        }
      }
    },
    performEventPressedMove: ({ points, performPointIndex, performPoint }) => {
      // Keep Point 0 and Point 2 permanently locked on the same vertical edge (Left Edge),
      // while Point 1 stays on the opposite vertical edge (Right Edge) for clean horizontal resizing.
      if (performPointIndex === 0 && points[2]) {
        points[2].timestamp = performPoint.timestamp;
        points[2].dataIndex = performPoint.dataIndex;
      } else if (performPointIndex === 2 && points[0]) {
        points[0].timestamp = performPoint.timestamp;
        points[0].dataIndex = performPoint.dataIndex;
      }
    },
    createPointFigures: ({ coordinates, overlay, precision }) => {
      if (coordinates.length === 0) return [];
      if (!isOverlayVisibleForTimeframe(overlay.extendData)) return [];
      const points = overlay.points;
      const digits = precision?.price ?? 2;
      const ext = (overlay.extendData || {}) as DrawingExtendConfig;

      const profitHex = ext.profitZoneColor || '#56b467';
      const lossHex = ext.lossZoneColor || '#ef5350';
      const zoneAlpha = ext.zoneOpacity ?? 0.16;

      const c0 = coordinates[0];
      const c1 = coordinates[1];
      const c2 = coordinates[2];

      const xs = coordinates.map((c) => c.x);
      const xLeft = Math.min(...xs);
      const xRight =
        coordinates.length >= 2 ? Math.max(xLeft + 24, Math.max(...xs)) : xLeft + 160;
      const width = Math.max(24, xRight - xLeft);

      let yEntry: number;
      let yTP: number;
      let ySL: number;

      if (c0 && c1 && c2) {
        const ys = [c0.y, c1.y, c2.y].sort((a, b) => a - b);
        if (isLong) {
          yTP = ys[0];
          yEntry = ys[1];
          ySL = ys[2];
        } else {
          ySL = ys[0];
          yEntry = ys[1];
          yTP = ys[2];
        }
      } else {
        yEntry = c0.y;
        yTP = c1 ? c1.y : isLong ? yEntry - 70 : yEntry + 70;
        ySL = c2 ? c2.y : isLong ? yEntry + 70 : yEntry - 70;
      }

      const profitTop = Math.min(yEntry, yTP);
      const profitHeight = Math.abs(yTP - yEntry);
      const lossTop = Math.min(yEntry, ySL);
      const lossHeight = Math.abs(ySL - yEntry);

      const figures: any[] = [
        // 1. Profit Zone Fill (Pure fill, no vertical borders)
        {
          type: 'rect',
          attrs: { x: xLeft, y: profitTop, width, height: profitHeight },
          styles: {
            style: 'fill',
            color: hexToRgba(profitHex, zoneAlpha),
          },
        },
        // 2. Stop Loss Zone Fill (Pure fill, no vertical borders)
        {
          type: 'rect',
          attrs: { x: xLeft, y: lossTop, width, height: lossHeight },
          styles: {
            style: 'fill',
            color: hexToRgba(lossHex, zoneAlpha),
          },
        },
        // 3. Target horizontal border line
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x: xLeft, y: yTP },
              { x: xRight, y: yTP },
            ],
          },
          styles: { color: hexToRgba(profitHex, 0.55), size: toHairlineSize(1) },
        },
        // 4. Stop horizontal border line
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x: xLeft, y: ySL },
              { x: xRight, y: ySL },
            ],
          },
          styles: { color: hexToRgba(lossHex, 0.55), size: toHairlineSize(1) },
        },
        // 5. Entry horizontal divider line
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x: xLeft, y: yEntry },
              { x: xRight, y: yEntry },
            ],
          },
          styles: { color: '#787b86', size: toHairlineSize(1) },
        },
      ];

      const p0Val = points[0]?.value;
      const p1Val = points[1]?.value;
      const p2Val = points[2]?.value;

      if (p0Val !== undefined && p1Val !== undefined && p2Val !== undefined) {
        const state = useChartStore.getState();
        const resolved = resolveRiskRewardPrices(isLong, p0Val, p1Val, p2Val);

        // --- TradingView Entry-Hit Execution Visual (Darker Shaded Span + Dashed Arrow) ---
        let simulatedExitPrice: number | null = null;
        const candles = state.candles;
        if (candles.length > 0) {
          const resolveBarIdx = (pt: any): number => {
            if (typeof pt?.dataIndex === 'number' && Number.isFinite(pt.dataIndex)) {
              return Math.round(pt.dataIndex);
            }
            if (typeof pt?.timestamp === 'number' && Number.isFinite(pt.timestamp)) {
              let lo = 0;
              let hi = candles.length - 1;
              while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (candles[mid].timestamp < pt.timestamp) lo = mid + 1;
                else hi = mid;
              }
              return lo;
            }
            return -1;
          };

          const rawIdxs = points.map(resolveBarIdx).filter((idx) => idx >= 0);
          if (rawIdxs.length >= 2) {
            const leftIdx = Math.max(0, Math.min(...rawIdxs));
            const rightIdx = Math.min(candles.length - 1, Math.max(...rawIdxs));

            // 1. Find first bar in [leftIdx, rightIdx] that touched Entry price
            let entryHitIdx = -1;
            for (let i = leftIdx; i <= rightIdx; i++) {
              const bar = candles[i];
              if (bar.low <= resolved.entry && bar.high >= resolved.entry) {
                entryHitIdx = i;
                break;
              }
            }

            if (entryHitIdx >= 0) {
              // 2. Scan forward for SL / TP hit or end of box
              let exitIdx = rightIdx;
              let exitPrice = candles[rightIdx].close;
              for (let j = entryHitIdx; j <= rightIdx; j++) {
                const bar = candles[j];
                if (isLong) {
                  if (bar.low <= resolved.sl) {
                    exitIdx = j;
                    exitPrice = resolved.sl;
                    break;
                  }
                  if (bar.high >= resolved.tp) {
                    exitIdx = j;
                    exitPrice = resolved.tp;
                    break;
                  }
                } else {
                  if (bar.high >= resolved.sl) {
                    exitIdx = j;
                    exitPrice = resolved.sl;
                    break;
                  }
                  if (bar.low <= resolved.tp) {
                    exitIdx = j;
                    exitPrice = resolved.tp;
                    break;
                  }
                }
              }

              simulatedExitPrice = exitPrice;

              const hitPx = convertOverlayPointsToPixel([
                { dataIndex: entryHitIdx, value: resolved.entry },
                { dataIndex: exitIdx, value: exitPrice },
              ]);
              const cEnt = hitPx[0];
              const cExt = hitPx[1];
              if (
                typeof cEnt?.x === 'number' &&
                Number.isFinite(cEnt.x) &&
                typeof cExt?.x === 'number' &&
                Number.isFinite(cExt.x) &&
                typeof cExt?.y === 'number' &&
                Number.isFinite(cExt.y)
              ) {
                const x1 = Math.max(xLeft, Math.min(xRight, cEnt.x));
                const x2 = Math.max(xLeft, Math.min(xRight, cExt.x));
                const yMinBox = Math.min(yTP, ySL);
                const yMaxBox = Math.max(yTP, ySL);
                const y2 = Math.max(yMinBox, Math.min(yMaxBox, cExt.y));
                const isProfitSpan = isLong
                  ? exitPrice >= resolved.entry
                  : exitPrice <= resolved.entry;
                const activeShadeColor = hexToRgba(
                  isProfitSpan ? profitHex : lossHex,
                  Math.min(0.42, zoneAlpha + 0.16)
                );

                // Darker shaded active trade rectangle
                figures.push({
                  type: 'rect',
                  ignoreEvent: true,
                  attrs: {
                    x: Math.min(x1, x2),
                    y: Math.min(yEntry, y2),
                    width: Math.max(2, Math.abs(x2 - x1)),
                    height: Math.max(1, Math.abs(y2 - yEntry)),
                  },
                  styles: {
                    style: 'fill',
                    color: activeShadeColor,
                  },
                });

                // Dashed diagonal arrow from Entry hit to Exit/Current point
                const segDist = Math.hypot(x2 - x1, y2 - yEntry);
                if (segDist >= 4) {
                  figures.push({
                    type: 'line',
                    ignoreEvent: true,
                    attrs: {
                      coordinates: [
                        { x: x1, y: yEntry },
                        { x: x2, y: y2 },
                      ],
                    },
                    styles: {
                      color: '#787b86',
                      size: 1.2,
                      style: 'dashed',
                      dashedValue: [5, 4],
                    },
                  });

                  // Arrowhead wings at (x2, y2)
                  const angle = Math.atan2(y2 - yEntry, x2 - x1);
                  const headLen = 9;
                  const spread = 0.5; // ~28.6 deg
                  const wx1 = x2 - headLen * Math.cos(angle - spread);
                  const wy1 = y2 - headLen * Math.sin(angle - spread);
                  const wx2 = x2 - headLen * Math.cos(angle + spread);
                  const wy2 = y2 - headLen * Math.sin(angle + spread);
                  figures.push(
                    {
                      type: 'line',
                      ignoreEvent: true,
                      attrs: {
                        coordinates: [
                          { x: wx1, y: wy1 },
                          { x: x2, y: y2 },
                        ],
                      },
                      styles: { color: '#787b86', size: 1.2, style: 'solid' },
                    },
                    {
                      type: 'line',
                      ignoreEvent: true,
                      attrs: {
                        coordinates: [
                          { x: wx2, y: wy2 },
                          { x: x2, y: y2 },
                        ],
                      },
                      styles: { color: '#787b86', size: 1.2, style: 'solid' },
                    }
                  );
                }
              }
            }
          }
        }

        const ovId = String(overlay.id);
        const isSelected =
          state.selectedOverlay?.id === ovId || state.selectedOverlayIds.includes(ovId);
        const isHovered = getHoveredOverlayId() === ovId;
        const isDrawing = Boolean((overlay as any).isDrawing?.());
        const showStats = ext.alwaysShowStats === true || isSelected || isHovered || isDrawing;

        if (showStats) {
          const rewardDist = Math.abs(resolved.tp - resolved.entry);
          const riskDist = Math.abs(resolved.entry - resolved.sl);
          const rrNum = riskDist > 0 ? rewardDist / riskDist : 0;
          const rrFormatted = fmtSmart(rrNum, 2);

          const tpPct =
            resolved.entry > 0 ? ((rewardDist / resolved.entry) * 100).toFixed(3) : '0.000';
          const slPct =
            resolved.entry > 0 ? ((riskDist / resolved.entry) * 100).toFixed(3) : '0.000';

          const point = state.symbolInfo.point || Math.pow(10, -digits);
          const tpTicks = Math.round(rewardDist / point).toLocaleString('en-US');
          const slTicks = Math.round(riskDist / point).toLocaleString('en-US');

          const defaultAccSize = state.replay.isActive
            ? state.paperAccount.startingBalance
            : state.account?.balance || 1000;
          const accountSize =
            ext.rrAccountSize !== undefined && ext.rrAccountSize > 0
              ? ext.rrAccountSize
              : defaultAccSize;

          const riskMode = ext.rrRiskMode || 'percent';
          const riskVal =
            ext.rrRiskValue !== undefined && ext.rrRiskValue > 0
              ? ext.rrRiskValue
              : state.riskPct || 1;
          const riskMoney =
            riskMode === 'money' ? riskVal : (accountSize * riskVal) / 100;

          const rawQty =
            ext.rrFixedQty !== undefined && ext.rrFixedQty > 0
              ? ext.rrFixedQty
              : riskDist > 0
              ? riskMoney / riskDist
              : state.defaultLot || 0.01;
          const qtyFormatted =
            rawQty >= 10 ? fmtSmart(rawQty, 2) : fmtSmart(rawQty, 4);

          const actualLossMoney =
            ext.rrFixedQty && ext.rrFixedQty > 0 ? rawQty * riskDist : riskMoney;
          const actualProfitMoney =
            ext.rrFixedQty && ext.rrFixedQty > 0
              ? rawQty * rewardDist
              : riskMoney * rrNum;

          const targetAmount = accountSize + actualProfitMoney;
          const stopAmount = Math.max(0, accountSize - actualLossMoney);

          const lastCandleClose =
            state.candles.length > 0
              ? state.candles[state.candles.length - 1].close
              : resolved.entry;
          const currentPrice =
            simulatedExitPrice !== null
              ? simulatedExitPrice
              : !state.replay.isActive && state.liveTick?.bid
              ? state.liveTick.bid
              : lastCandleClose;
          const openPriceDiff = isLong
            ? currentPrice - resolved.entry
            : resolved.entry - currentPrice;
          const openPnl = openPriceDiff * rawQty;
          const isOpenPositive = openPnl >= 0;

          const midX = xLeft + width / 2;
          const customLabel = String(ext.label || '').trim();
          const prefix = customLabel ? `[${customLabel}] ` : '';

          const targetText = `${prefix}Target: ${fmtNum(rewardDist, digits)} (${tpPct}%) ${tpTicks}, Amount: ${fmtSmart(targetAmount, 2)}, PnL: ${fmtNum(actualProfitMoney, 2)}`;
          const stopText = `Stop: ${fmtNum(riskDist, digits)} (${slPct}%) ${slTicks}, Amount: ${fmtSmart(stopAmount, 2)}, PnL: -${fmtNum(actualLossMoney, 2)}`;

          const topIsTarget = isLong;
          const topY = Math.min(yTP, ySL) - 10;
          const bottomY = Math.max(yTP, ySL) + 10;

          // Outer Top Pill
          figures.push({
            type: 'text',
            ignoreEvent: true,
            attrs: {
              x: midX,
              y: topY,
              text: topIsTarget ? targetText : stopText,
              align: 'center',
              baseline: 'bottom',
            },
            styles: {
              color: '#ffffff',
              size: 11.5,
              weight: '500',
              family: 'Trebuchet MS, sans-serif',
              backgroundColor: topIsTarget ? profitHex : lossHex,
              borderColor: topIsTarget ? profitHex : lossHex,
              borderSize: 0,
              borderRadius: 5,
              paddingLeft: 10,
              paddingRight: 10,
              paddingTop: 5,
              paddingBottom: 5,
            },
          });

          // Outer Bottom Pill
          figures.push({
            type: 'text',
            ignoreEvent: true,
            attrs: {
              x: midX,
              y: bottomY,
              text: topIsTarget ? stopText : targetText,
              align: 'center',
              baseline: 'top',
            },
            styles: {
              color: '#ffffff',
              size: 11.5,
              weight: '500',
              family: 'Trebuchet MS, sans-serif',
              backgroundColor: topIsTarget ? lossHex : profitHex,
              borderColor: topIsTarget ? lossHex : profitHex,
              borderSize: 0,
              borderRadius: 5,
              paddingLeft: 10,
              paddingRight: 10,
              paddingTop: 5,
              paddingBottom: 5,
            },
          });

          // Center 2-Line White-Bordered Pill
          const line1Text = `Open PnL: ${openPnl >= 0 ? '' : '-'}${fmtNum(Math.abs(openPnl), 2)}, Qty: ${qtyFormatted}`;
          const line2Text = `Risk/reward ratio: ${rrFormatted}`;
          const maxChars = Math.max(line1Text.length, line2Text.length);
          const pillW = Math.max(175, Math.round(maxChars * 6.9 + 24));
          const pillH = 38;
          const lowerZoneHeight = Math.max(yTP, ySL) - yEntry;
          const pillTop =
            lowerZoneHeight >= pillH + 10 ? yEntry + 8 : yEntry - pillH / 2;
          const centerBg = isOpenPositive ? profitHex : lossHex;

          figures.push({
            type: 'rect',
            ignoreEvent: true,
            attrs: {
              x: midX - pillW / 2,
              y: pillTop,
              width: pillW,
              height: pillH,
            },
            styles: {
              style: 'stroke_fill',
              color: centerBg,
              borderColor: '#ffffff',
              borderSize: 1.5,
              borderRadius: 6,
            },
          });

          figures.push({
            type: 'text',
            ignoreEvent: true,
            attrs: {
              x: midX,
              y: pillTop + 12,
              text: line1Text,
              align: 'center',
              baseline: 'middle',
            },
            styles: {
              color: '#ffffff',
              size: 11.5,
              weight: '500',
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

          figures.push({
            type: 'text',
            ignoreEvent: true,
            attrs: {
              x: midX,
              y: pillTop + 26,
              text: line2Text,
              align: 'center',
              baseline: 'middle',
            },
            styles: {
              color: '#ffffff',
              size: 11.5,
              weight: '500',
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

      return figures;
    },
  };
}

export const riskRewardLongOverlay = createRiskRewardTemplate(true);
export const riskRewardShortOverlay = createRiskRewardTemplate(false);
