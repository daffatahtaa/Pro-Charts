import { describe, expect, it } from 'vitest';
import {
  estimateTradeMoney,
  formatAccountMoney,
  getMoneyPerLotPerPrice,
} from '../calcProfit';

describe('MT5 Trade Valuation & Currency Formatting (Issue #18)', () => {
  it('computes exact Cent 3-digit Gold SL loss (-217.70 USC) instead of 10x mispriced value', () => {
    const val = estimateTradeMoney({
      side: 'BUY',
      entryPrice: 2650.0,
      targetPrice: 2647.823,
      volume: 1.0,
      tickSize: 0.001,
      tickValueProfit: 0.1,
      tickValueLoss: 0.1,
      contractSize: 100,
    });
    expect(val).not.toBeNull();
    expect(val!).toBeCloseTo(-217.7, 2);
    expect(formatAccountMoney(val!, 'USC', { signed: true })).toBe('-217.70 USC');
  });

  it('shows positive profit when trailing SL is moved above entry on BUY', () => {
    const val = estimateTradeMoney({
      side: 'BUY',
      entryPrice: 2650.0,
      targetPrice: 2652.5,
      volume: 0.2,
      tickSize: 0.001,
      tickValueProfit: 0.1,
      tickValueLoss: 0.1,
    });
    expect(val!).toBeCloseTo(50.0, 2);
    expect(formatAccountMoney(val!, 'USC', { signed: true })).toBe('+50.00 USC');
  });

  it('uses directional tickValueProfit vs tickValueLoss for cross pairs', () => {
    const win = estimateTradeMoney({
      side: 'SELL',
      entryPrice: 1.25,
      targetPrice: 1.24,
      volume: 1.0,
      tickSize: 0.00001,
      tickValueProfit: 1.26,
      tickValueLoss: 1.28,
    });
    const loss = estimateTradeMoney({
      side: 'SELL',
      entryPrice: 1.25,
      targetPrice: 1.26,
      volume: 1.0,
      tickSize: 0.00001,
      tickValueProfit: 1.26,
      tickValueLoss: 1.28,
    });
    expect(win!).toBeCloseTo(1260.0, 2);
    expect(loss!).toBeCloseTo(-1280.0, 2);
  });

  it('computes money-per-lot-per-price for Risk/Reward overlay sizing', () => {
    const { profitPerPrice, lossPerPrice, hasSpec } = getMoneyPerLotPerPrice({
      tickSize: 0.001,
      tickValueProfit: 0.1,
      tickValueLoss: 0.1,
      contractSize: 100,
    });
    expect(hasSpec).toBe(true);
    expect(profitPerPrice).toBeCloseTo(100, 4);
    expect(lossPerPrice).toBeCloseTo(100, 4);
  });

  it('formats USD, EUR, GBP, JPY, IDR, and USC account currencies accurately', () => {
    expect(formatAccountMoney(-217.7, 'USC', { signed: true })).toBe('-217.70 USC');
    expect(formatAccountMoney(1250.5, 'USD', { signed: true })).toBe('+$1,250.50');
    expect(formatAccountMoney(-42.1, 'USD', { signed: true })).toBe('-$42.10');
    expect(formatAccountMoney(500, 'EUR', { signed: true })).toBe('+€500.00');
    expect(formatAccountMoney(-88.5, 'GBP', { signed: true })).toBe('-£88.50');
    expect(formatAccountMoney(15000, 'JPY', { signed: true })).toBe('+¥15,000');
    expect(formatAccountMoney(-217700, 'IDR', { signed: true })).toBe('-217,700.00 IDR');
    expect(formatAccountMoney(1500000, 'IDR', { signed: true })).toBe('+1,500,000.00 IDR');
  });
});
