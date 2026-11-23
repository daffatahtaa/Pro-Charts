export interface TradeValuationSpec {
  tickSize?: number | null;
  tickValue?: number | null;
  tickValueProfit?: number | null;
  tickValueLoss?: number | null;
  contractSize?: number | null;
}

export interface EstimateTradeMoneyParams extends TradeValuationSpec {
  side: 'BUY' | 'SELL';
  entryPrice: number;
  targetPrice: number;
  volume: number;
}

/**
 * Exact MT5-compatible monetary P/L estimation in the account's native currency
 * (USD, USC Cent, EUR, GBP, JPY, etc.):
 *   delta = side === 'BUY' ? targetPrice - entryPrice : entryPrice - targetPrice
 *   tv = delta >= 0 ? (tickValueProfit || tickValue) : (tickValueLoss || tickValue)
 *   profit = (delta / tickSize) * tv * volume
 *
 * Returns `null` when broker tick/contract specs are unavailable rather than
 * inventing an inaccurate hardcoded `volume * 10` estimate.
 */
export function estimateTradeMoney(params: EstimateTradeMoneyParams): number | null {
  const {
    side,
    entryPrice,
    targetPrice,
    volume,
    tickSize,
    tickValueProfit,
    tickValueLoss,
    tickValue,
    contractSize,
  } = params;

  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(targetPrice) ||
    !Number.isFinite(volume) ||
    entryPrice <= 0 ||
    targetPrice <= 0 ||
    volume <= 0
  ) {
    return null;
  }

  const delta = side === 'BUY' ? targetPrice - entryPrice : entryPrice - targetPrice;
  const tv =
    delta >= 0
      ? tickValueProfit && tickValueProfit > 0
        ? tickValueProfit
        : tickValue && tickValue > 0
        ? tickValue
        : 0
      : tickValueLoss && tickValueLoss > 0
      ? tickValueLoss
      : tickValue && tickValue > 0
      ? tickValue
      : 0;

  if (tickSize && tickSize > 0 && tv > 0) {
    return (delta / tickSize) * tv * volume;
  }
  if (contractSize && contractSize > 0) {
    return delta * contractSize * volume;
  }
  return null;
}

/**
 * Returns account-currency monetary change per 1.00 lot per 1.0 price unit move,
 * separately for profit moves and loss moves.
 */
export function getMoneyPerLotPerPrice(spec?: TradeValuationSpec): {
  profitPerPrice: number;
  lossPerPrice: number;
  hasSpec: boolean;
} {
  const ts = spec?.tickSize ?? 0;
  const tvP = spec?.tickValueProfit || spec?.tickValue || 0;
  const tvL = spec?.tickValueLoss || spec?.tickValue || 0;
  const cs = spec?.contractSize ?? 0;

  if (ts > 0 && (tvP > 0 || tvL > 0)) {
    const p = (tvP > 0 ? tvP : tvL) / ts;
    const l = (tvL > 0 ? tvL : tvP) / ts;
    return { profitPerPrice: p, lossPerPrice: l, hasSpec: true };
  }
  if (cs > 0) {
    return { profitPerPrice: cs, lossPerPrice: cs, hasSpec: true };
  }
  return { profitPerPrice: 1, lossPerPrice: 1, hasSpec: false };
}

/**
 * Formats monetary amounts according to the active MT5 account currency:
 * - USD -> `+$1,250.50` / `-$217.70` / `$1,250.50`
 * - EUR -> `+€1,250.50` / `-€217.70`
 * - GBP -> `+£1,250.50` / `-£217.70`
 * - JPY -> `+¥1,250` / `-¥218`
 * - USC (Cent) / others -> `-217.70 USC` / `+217.70 USC`
 */
export function formatAccountMoney(
  val: number,
  currency = 'USD',
  opts?: { signed?: boolean; decimals?: number }
): string {
  const cur = (currency || 'USD').trim().toUpperCase();
  const signed = opts?.signed ?? false;
  const decimals = opts?.decimals ?? (cur === 'JPY' ? 0 : 2);
  const safeVal = Number.isFinite(val) ? val : 0;
  const absNum = Math.abs(safeVal);
  const formatted = absNum.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const sign =
    safeVal < -1e-9 ? '-' : signed && safeVal > 1e-9 ? '+' : signed && safeVal === 0 ? '+' : '';

  if (cur === 'USD') return `${sign}$${formatted}`;
  if (cur === 'EUR') return `${sign}€${formatted}`;
  if (cur === 'GBP') return `${sign}£${formatted}`;
  if (cur === 'JPY') return `${sign}¥${formatted}`;
  return `${sign}${formatted} ${cur}`;
}
