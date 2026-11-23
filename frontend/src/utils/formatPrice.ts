import { TickSnapshot } from '../types/chart';

/**
 * Resolve the exact decimal precision (`digits`) for a trading symbol.
 * Priority: explicit MT5 digits -> active chart symbol digits -> watchlist tick -> heuristic fallback.
 */
export function resolveSymbolDigits(
  sym: string,
  explicitDigits?: number | null,
  activeSymbol?: string,
  activeDigits?: number,
  watchlistTicks?: Record<string, TickSnapshot>
): number {
  if (typeof explicitDigits === 'number' && Number.isFinite(explicitDigits) && explicitDigits >= 0) {
    return Math.min(8, Math.round(explicitDigits));
  }
  if (activeSymbol && sym === activeSymbol && typeof activeDigits === 'number' && Number.isFinite(activeDigits)) {
    return Math.min(8, Math.round(activeDigits));
  }
  const tickDigits = watchlistTicks?.[sym]?.digits;
  if (typeof tickDigits === 'number' && Number.isFinite(tickDigits)) {
    return Math.min(8, Math.round(tickDigits));
  }
  const clean = (sym || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.includes('JPY')) return 3;
  if (
    clean.includes('XAU') ||
    clean.includes('XAG') ||
    clean.includes('GOLD') ||
    clean.includes('SILVER') ||
    clean.includes('US30') ||
    clean.includes('NAS100') ||
    clean.includes('USTEC') ||
    clean.includes('SPX') ||
    clean.includes('US500') ||
    clean.includes('GER40') ||
    clean.includes('DE40') ||
    clean.includes('BTC') ||
    clean.includes('ETH') ||
    clean.includes('OIL')
  ) {
    return 2;
  }
  return 5;
}

export function resolveSymbolPoint(digits: number): number {
  const d = Math.max(0, Math.min(8, Math.round(digits)));
  return Number(Math.pow(10, -d).toFixed(d));
}

/**
 * Format a trade price (Entry / SL / TP / Current) with exact decimal precision
 * AND standard US thousands separators (e.g., 2,650.50, 95,420.00, 1.08520).
 * Returns '—' for unset / non-positive values.
 */
export function formatTradePrice(price: number | null | undefined, digits: number): string {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return '—';
  const d = Math.max(0, Math.min(8, Math.round(digits)));
  return price.toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

/**
 * Format signed monetary P/L with thousands separators (e.g., +$1,250.50, -$42.10).
 */
export function formatSignedMoney(val: number, prefix = '', decimals = 2): string {
  if (!Number.isFinite(val)) return `${prefix}0.00`;
  const sign = val > 0 ? '+' : val < 0 ? '-' : '';
  return `${sign}${prefix}${Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatUnsignedMoney(val: number, decimals = 2): string {
  if (!Number.isFinite(val)) return '0.00';
  return Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
