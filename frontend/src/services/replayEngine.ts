import {
  Candle,
  getTimeframeSeconds,
  PaperAccountState,
  SymbolInfo,
  TradingSessionName,
} from '../types/chart';

const STANDARD_STEP_TFS = ['1m', '5m', '15m', '30m', '1h', '4h', '1D'];

export function getAllowedStepTimeframes(chartTf: string): string[] {
  const chartSec = getTimeframeSeconds(chartTf);
  const allowed = STANDARD_STEP_TFS.filter((tf) => getTimeframeSeconds(tf) <= chartSec);
  if (!allowed.includes(chartTf)) {
    allowed.push(chartTf);
  }
  return allowed.sort((a, b) => getTimeframeSeconds(b) - getTimeframeSeconds(a));
}

export function detectReplaySession(tsMs: number): TradingSessionName {
  const h = new Date(tsMs).getUTCHours();
  if (h >= 7 && h < 12) return 'LONDON';
  if (h >= 12 && h < 16) return 'OVERLAP';
  if (h >= 16 && h < 21) return 'NEW_YORK';
  return 'ASIA';
}

/**
 * Pure, lookahead-free candle slicer & forming-candle synthesizer for Universal Replay Clock.
 * - All completed bars have `c.timestamp + chartTfMs <= replayTimeMs`.
 * - If `replayTimeMs` falls mid-bar on `chartTf`, synthesizes the incomplete forming candle
 *   STRICTLY from `subCandles` with `barOpenMs <= sub.timestamp < replayTimeMs`.
 */
export function sliceCandlesAtReplayTime(
  chartCandles: Candle[],
  chartTf: string,
  replayTimeMs: number,
  subCandles: Candle[] = [],
  subTf?: string
): { visible: Candle[]; cutIndex: number; subIndex: number } {
  if (chartCandles.length === 0) {
    return { visible: [], cutIndex: 0, subIndex: -1 };
  }

  const chartTfMs = getTimeframeSeconds(chartTf) * 1000;
  const subTfMs = subTf ? getTimeframeSeconds(subTf) * 1000 : 0;

  // 1. Collect all fully completed chart candles strictly <= replayTimeMs
  const visible: Candle[] = [];
  let lastCompletedIdx = -1;
  for (let i = 0; i < chartCandles.length; i++) {
    const c = chartCandles[i];
    if (c.timestamp + chartTfMs <= replayTimeMs) {
      visible.push(c);
      lastCompletedIdx = i;
    } else {
      break;
    }
  }

  // Find current subIndex in subCandles (latest sub-candle whose close <= replayTimeMs)
  let subIndex = -1;
  if (subCandles.length > 0) {
    for (let i = 0; i < subCandles.length; i++) {
      const endTs = subTfMs > 0 ? subCandles[i].timestamp + subTfMs : subCandles[i].timestamp;
      if (endTs <= replayTimeMs) {
        subIndex = i;
      } else {
        break;
      }
    }
  }

  // 2. Check if there is an in-progress forming chart candle starting at barOpenMs
  const nextChartIdx = lastCompletedIdx + 1;
  const nextBar = chartCandles[nextChartIdx];
  const barOpenMs = nextBar
    ? nextBar.timestamp
    : Math.floor(replayTimeMs / chartTfMs) * chartTfMs;

  if (barOpenMs < replayTimeMs && replayTimeMs < barOpenMs + chartTfMs) {
    if (subCandles.length > 0 && subIndex >= 0) {
      const matchedSubs: Candle[] = [];
      for (let i = 0; i <= subIndex; i++) {
        const s = subCandles[i];
        if (s.timestamp >= barOpenMs && s.timestamp < barOpenMs + chartTfMs) {
          matchedSubs.push(s);
        }
      }
      if (matchedSubs.length > 0) {
        const forming: Candle = {
          timestamp: barOpenMs,
          open: matchedSubs[0].open,
          high: Math.max(...matchedSubs.map((s) => s.high)),
          low: Math.min(...matchedSubs.map((s) => s.low)),
          close: matchedSubs[matchedSubs.length - 1].close,
          volume: matchedSubs.reduce((acc, s) => acc + (s.volume || 0), 0),
          spread: matchedSubs[matchedSubs.length - 1].spread,
        };
        visible.push(forming);
        return {
          visible,
          cutIndex: nextBar ? nextChartIdx : Math.max(0, lastCompletedIdx),
          subIndex,
        };
      }
    }
  }

  // Ensure at least 1 bar is visible if replayTimeMs precedes chartCandles[0]
  if (visible.length === 0) {
    return { visible: [chartCandles[0]], cutIndex: 0, subIndex };
  }

  return {
    visible,
    cutIndex: Math.max(0, lastCompletedIdx),
    subIndex,
  };
}

export interface PaperBarSimResult {
  nextPaperAccount: PaperAccountState;
  anyClosed: boolean;
  toasts: Array<{ type: 'success' | 'error' | 'info'; msg: string }>;
}

/**
 * Evaluates all PENDING and OPEN paper trades against a newly revealed bar (full-bar or sub-bar).
 */
export function simulatePaperBarTick(
  paperAccount: PaperAccountState,
  symbol: string,
  symbolInfo: SymbolInfo,
  bar: Candle
): PaperBarSimResult {
  const pipSize = (symbolInfo.point || 0.01) * 10;
  let updatedBalance = paperAccount.balance;
  let floatingTotal = 0;
  let anyClosed = false;
  const toasts: Array<{ type: 'success' | 'error' | 'info'; msg: string }> = [];

  const nextTrades = paperAccount.trades.map((tr) => {
    if (tr.symbol !== symbol) return tr;
    const trade = { ...tr };

    // Step 1: Check PENDING trigger
    if (trade.status === 'PENDING') {
      if (bar.low <= trade.entry_price && bar.high >= trade.entry_price) {
        trade.status = 'OPEN';
        trade.open_time_ms = bar.timestamp;
        trade.trading_session = detectReplaySession(bar.timestamp);
        toasts.push({
          type: 'info',
          msg: `📌 Paper ${trade.order_type} triggered (${trade.side} @ ${trade.entry_price})`,
        });
      } else {
        return trade;
      }
    }

    // Step 2: Update OPEN trade MFE/MAE & check SL/TP hits
    if (trade.status === 'OPEN') {
      trade.bars_held += 1;
      const isBuy = trade.side === 'BUY';

      const favDist = isBuy ? bar.high - trade.entry_price : trade.entry_price - bar.low;
      const advDist = isBuy ? trade.entry_price - bar.low : bar.high - trade.entry_price;

      trade.mfe_pips = Number(
        Math.max(trade.mfe_pips, Math.max(0, favDist / pipSize)).toFixed(1)
      );
      trade.mae_pips = Number(
        Math.max(trade.mae_pips, Math.max(0, advDist / pipSize)).toFixed(1)
      );

      const hitSL =
        trade.sl > 0 && (isBuy ? bar.low <= trade.sl : bar.high >= trade.sl);
      const hitTP =
        trade.tp > 0 && (isBuy ? bar.high >= trade.tp : bar.low <= trade.tp);

      let closedStatus: 'CLOSED_TP' | 'CLOSED_SL' | null = null;
      if (hitSL && hitTP) {
        closedStatus =
          Math.abs(bar.open - trade.tp) < Math.abs(bar.open - trade.sl)
            ? 'CLOSED_TP'
            : 'CLOSED_SL';
      } else if (hitTP) {
        closedStatus = 'CLOSED_TP';
      } else if (hitSL) {
        closedStatus = 'CLOSED_SL';
      }

      const slDist = trade.sl > 0 ? Math.abs(trade.entry_price - trade.sl) : 0;

      if (closedStatus) {
        anyClosed = true;
        const exitP = closedStatus === 'CLOSED_TP' ? trade.tp : trade.sl;
        const rawDiff = isBuy ? exitP - trade.entry_price : trade.entry_price - exitP;
        const pnlPips = Number((rawDiff / pipSize).toFixed(1));
        const rMult =
          slDist > 0
            ? Number((rawDiff / slDist).toFixed(2))
            : Number((pnlPips / 20).toFixed(2));
        const pnlMoney = Number((rMult * trade.risk_amount).toFixed(2));

        trade.status = closedStatus;
        trade.exit_price = exitP;
        trade.close_time_ms = bar.timestamp;
        trade.pnl_pips = pnlPips;
        trade.realized_r = rMult;
        trade.pnl_money = pnlMoney;
        updatedBalance = Number((updatedBalance + pnlMoney).toFixed(2));

        toasts.push({
          type: closedStatus === 'CLOSED_TP' ? 'success' : 'error',
          msg:
            closedStatus === 'CLOSED_TP'
              ? `🎯 Paper TP Hit (${trade.side}): +$${Math.abs(pnlMoney).toFixed(2)} (+${rMult}R)`
              : `🛑 Paper SL Hit (${trade.side}): -$${Math.abs(pnlMoney).toFixed(2)} (${rMult}R)`,
        });
      } else {
        const rawDiff = isBuy ? bar.close - trade.entry_price : trade.entry_price - bar.close;
        const pnlPips = Number((rawDiff / pipSize).toFixed(1));
        const rMult =
          slDist > 0
            ? Number((rawDiff / slDist).toFixed(2))
            : Number((pnlPips / 20).toFixed(2));
        const pnlMoney = Number((rMult * trade.risk_amount).toFixed(2));
        trade.pnl_pips = pnlPips;
        trade.realized_r = rMult;
        trade.pnl_money = pnlMoney;
        floatingTotal += pnlMoney;
      }
    }

    return trade;
  });

  const nextPaperAccount: PaperAccountState = {
    ...paperAccount,
    balance: updatedBalance,
    equity: Number((updatedBalance + floatingTotal).toFixed(2)),
    trades: nextTrades,
  };

  return { nextPaperAccount, anyClosed, toasts };
}
