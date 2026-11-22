import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Settings, X } from 'lucide-react';
import { useChartStore } from '../store/useChartStore';
import { ActiveIndicator, LiveTick, MT5Status } from '../types/chart';
import { getSavedPineIndicators } from '../services/pineEngine';
import { IndicatorSettingsModal } from './IndicatorSettingsModal';

function getSymbolBadgeMeta(symbol: string): { bg: string; fg: string; text: string } {
  const s = (symbol || '').toUpperCase();
  if (s.startsWith('BTC')) return { bg: '#f7931a', fg: '#ffffff', text: '₿' };
  if (s.startsWith('ETH')) return { bg: '#627eea', fg: '#ffffff', text: 'Ξ' };
  if (s.startsWith('SOL')) return { bg: '#14f195', fg: '#131722', text: 'S' };
  if (s.startsWith('XAU') || s.includes('GOLD')) {
    return { bg: '#f59e0b', fg: '#131722', text: 'Au' };
  }
  if (s.startsWith('XAG') || s.includes('SILVER')) {
    return { bg: '#94a3b8', fg: '#131722', text: 'Ag' };
  }
  if (
    ['US30', 'NAS100', 'US100', 'USTEC', 'US500', 'SPX500', 'GER40', 'DE40'].some((k) =>
      s.startsWith(k)
    )
  ) {
    return { bg: '#2962ff', fg: '#ffffff', text: s.slice(0, 2) };
  }
  return {
    bg: '#089981',
    fg: '#ffffff',
    text: s.replace(/[^A-Z]/g, '').slice(0, 2) || '$',
  };
}

function getDisplayInstrumentTitle(symbol: string, description?: string): string {
  const desc = (description || '').trim();
  if (desc && desc.toUpperCase() !== symbol.toUpperCase()) {
    return desc
      .replace(/\s+vs\.?\s+/i, ' / ')
      .replace(/\bUS Dollar\b/i, 'U.S. Dollar');
  }
  const s = symbol.toUpperCase();
  if (s.startsWith('BTCUSD')) return 'Bitcoin / U.S. Dollar';
  if (s.startsWith('ETHUSD')) return 'Ethereum / U.S. Dollar';
  if (s.startsWith('XAUUSD')) return 'Gold / U.S. Dollar';
  if (s.startsWith('XAGUSD')) return 'Silver / U.S. Dollar';
  if (s.startsWith('EURUSD')) return 'Euro / U.S. Dollar';
  if (s.startsWith('GBPUSD')) return 'British Pound / U.S. Dollar';
  if (s.startsWith('USDJPY')) return 'U.S. Dollar / Japanese Yen';
  if (s.startsWith('US30')) return 'Dow Jones 30 Index';
  if (s.startsWith('NAS100') || s.startsWith('USTEC') || s.startsWith('US100')) {
    return 'Nasdaq 100 Index';
  }
  return symbol;
}

function getShortBrokerName(mt5Status: MT5Status | null, accountServer?: string): string {
  const raw = (accountServer || mt5Status?.server || mt5Status?.terminal_company || 'MT5').trim();
  const brand = raw.split(/[-_\s]/)[0] || raw;
  return brand.replace(/SC$/i, '') || 'MT5';
}

function getMarketOpenStatus(
  symbol: string,
  wsConnected: boolean,
  liveTick: LiveTick | null,
  isReplay: boolean
): { isOpen: boolean; label: string } {
  if (isReplay) return { isOpen: true, label: 'Replay' };

  const s = (symbol || '').toUpperCase();
  const isCrypto = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE'].some((c) => s.startsWith(c));
  if (isCrypto) {
    const open = wsConnected || Boolean(liveTick);
    return { isOpen: open, label: open ? 'Open' : 'Closed' };
  }

  if (liveTick && liveTick.server_time_ms && Math.abs(Date.now() - liveTick.server_time_ms) < 60_000) {
    return { isOpen: true, label: 'Open' };
  }

  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 6=Sat
  const hour = now.getUTCHours();
  const isWeekendClosed =
    day === 6 || (day === 0 && hour < 21) || (day === 5 && hour >= 22);
  const isOpen = !isWeekendClosed && wsConnected;
  return { isOpen, label: isOpen ? 'Open' : 'Closed' };
}

export const ChartLegend: React.FC = () => {
  const {
    symbol,
    symbolInfo,
    timeframe,
    candles,
    crosshairData,
    liveTick,
    wsConnected,
    mt5Status,
    account,
    chartSettings,
    activeIndicators,
    toggleIndicatorVisibility,
    removeIndicator,
    replay,
    defaultLot,
    setDefaultLot,
    executeOrder,
    placePaperOrder,
  } = useChartStore();

  const [submitting, setSubmitting] = useState<'BUY' | 'SELL' | null>(null);
  const [lotDraft, setLotDraft] = useState<string>(defaultLot.toFixed(2));
  const [settingsIndicator, setSettingsIndicator] = useState<ActiveIndicator | null>(null);

  useEffect(() => {
    setLotDraft((prev) => {
      const parsed = parseFloat(prev);
      return Number.isNaN(parsed) || Math.abs(parsed - defaultLot) > 1e-6
        ? defaultLot.toFixed(2)
        : prev;
    });
  }, [defaultLot]);

  const handleLotChange = (val: string) => {
    if (!/^[0-9]*\.?[0-9]*$/.test(val)) return;
    setLotDraft(val);
    const num = parseFloat(val);
    if (!Number.isNaN(num) && num >= 0.01) {
      setDefaultLot(num);
    }
  };

  const handleLotBlur = () => {
    const num = parseFloat(lotDraft);
    const valid = !Number.isNaN(num) && num >= 0.01 ? num : 0.01;
    setDefaultLot(valid);
    setLotDraft(valid.toFixed(2));
  };

  const digits = symbolInfo.digits ?? 2;
  const lastCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const displayCandle = crosshairData?.candle ?? lastCandle;
  const prevClose =
    crosshairData?.prevClose ??
    (candles.length >= 2 ? candles[candles.length - 2].close : displayCandle?.open ?? 0);

  const isBull = displayCandle ? displayCandle.close >= displayCandle.open : true;
  const priceColor = isBull ? 'text-[#089981]' : 'text-[#f23645]';

  const change = displayCandle ? displayCandle.close - prevClose : 0;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;

  const badge = getSymbolBadgeMeta(symbol);
  const instrumentTitle = getDisplayInstrumentTitle(symbol, symbolInfo.description);
  const brokerName = getShortBrokerName(mt5Status, account?.server);
  const marketStatus = getMarketOpenStatus(symbol, wsConnected, liveTick, replay.isActive);

  const fmtPrice = (val: number) =>
    val.toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  const handleQuickMarket = async (side: 'BUY' | 'SELL') => {
    if (submitting) return;
    if (replay.isActive) {
      placePaperOrder({
        side,
        order_mode: 'MARKET',
        volume: defaultLot,
        strategy_tag: 'OneClick',
      });
      return;
    }
    setSubmitting(side);
    try {
      await executeOrder({
        symbol,
        side,
        order_mode: 'MARKET',
        volume: defaultLot,
        comment: 'TV-OneClick',
      });
    } finally {
      setSubmitting(null);
    }
  };

  const bidPrice = replay.isActive ? lastCandle?.close ?? 0 : liveTick?.bid ?? 0;
  const askPrice = replay.isActive ? lastCandle?.close ?? 0 : liveTick?.ask ?? 0;
  const spreadPriceDiff = Math.max(0, askPrice - bidPrice);

  return (
    <div className="absolute top-2 left-3 z-10 pointer-events-none select-none flex flex-col gap-1.5 max-w-[calc(100%-100px)]">
      {/* Row 1: TradingView Symbol Header ([₿] Bitcoin / U.S. Dollar · 1h · FxPro [● Open] [≈ 1s updates]) + OHLCV */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px]">
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* Circular Symbol Icon Badge */}
          <span
            className="w-[19px] h-[19px] rounded-full flex items-center justify-center text-[10.5px] font-bold shrink-0 shadow-sm"
            style={{ backgroundColor: badge.bg, color: badge.fg }}
          >
            {badge.text}
          </span>

          {/* Clickable Full Instrument Name -> Opens Symbol Search */}
          <button
            type="button"
            onClick={() => useChartStore.getState().setSymbolModalOpen(true)}
            title={`Change symbol (${symbol})`}
            className="text-[14px] font-medium text-[#d1d4dc] hover:text-white transition-colors cursor-pointer"
          >
            {instrumentTitle}
          </button>

          <span className="text-[#787b86] font-bold">·</span>

          {/* Timeframe */}
          <span className="text-[14px] font-medium text-[#d1d4dc]">{timeframe}</span>

          <span className="text-[#787b86] font-bold">·</span>

          {/* Broker Name */}
          <button
            type="button"
            onClick={() => useChartStore.getState().setAccountModalOpen(true)}
            title="Switch Broker / MT5 Account"
            className="text-[14px] font-medium text-[#d1d4dc] hover:text-white transition-colors cursor-pointer"
          >
            {brokerName}
          </button>

          {/* Market Status Pill: [ ● Open ] / [ ● Closed ] / [ ● Replay ] */}
          <span
            className={`ml-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-none ${
              replay.isActive
                ? 'bg-[#2962ff]/20 text-[#2962ff]'
                : marketStatus.isOpen
                ? 'bg-[#089981]/20 text-[#089981]'
                : 'bg-[#787b86]/20 text-[#787b86]'
            }`}
          >
            <span
              className={`w-[7px] h-[7px] rounded-full ${
                replay.isActive
                  ? 'bg-[#2962ff]'
                  : marketStatus.isOpen
                  ? 'bg-[#089981]'
                  : 'bg-[#787b86]'
              }`}
            />
            <span>{marketStatus.label}</span>
          </span>

          {/* Feed Update Cadence Pill: [ ≈ 1s updates ] */}
          <span
            title="Real-time MT5 tick & 1-second candle sync"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#f23645]/15 text-[#f23645] text-[11px] font-semibold leading-none"
          >
            <span className="text-[12px] font-bold leading-none">≈</span>
            <span>1s updates</span>
          </span>
        </div>

        {/* OHLCV Values inline next to header */}
        {displayCandle && (
          <div className="flex items-center gap-2 font-mono-num text-[11.5px]">
            {chartSettings.showOhlcValues && (
              <>
                <span className="text-[#787b86]">
                  O <span className={priceColor}>{displayCandle.open.toFixed(digits)}</span>
                </span>
                <span className="text-[#787b86]">
                  H <span className={priceColor}>{displayCandle.high.toFixed(digits)}</span>
                </span>
                <span className="text-[#787b86]">
                  L <span className={priceColor}>{displayCandle.low.toFixed(digits)}</span>
                </span>
                <span className="text-[#787b86]">
                  C <span className={priceColor}>{displayCandle.close.toFixed(digits)}</span>
                </span>
              </>
            )}
            {chartSettings.showBarChange && (
              <span className={change >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}>
                {change >= 0 ? '+' : ''}
                {change.toFixed(digits)} ({change >= 0 ? '+' : ''}
                {changePct.toFixed(2)}%)
              </span>
            )}
            {chartSettings.showVolumeValue && (
              <span className="text-[#787b86] hidden sm:inline">
                Vol <span className="text-[#d1d4dc]">{Math.round(displayCandle.volume)}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Row 2: TradingView Outlined SELL / Spread / BUY One-Click Bar + Compact Lot Selector */}
      {chartSettings.showQuickTradeButtons &&
        ((liveTick && !replay.isActive) ||
          (replay.isActive && !replay.isSelectingCut && lastCandle)) && (
          <div className="flex items-center gap-2 pointer-events-auto w-fit">
            {/* SELL Market Outlined Button */}
            <button
              onClick={() => handleQuickMarket('SELL')}
              disabled={submitting !== null}
              title={
                replay.isActive
                  ? `Paper SELL ${defaultLot} lot ${symbol} at Replay Bar Close`
                  : `One-Click SELL ${defaultLot} lot ${symbol} at Market`
              }
              className="group flex flex-col items-center justify-center px-3 py-1 rounded-[4px] bg-[#131722]/90 hover:bg-[#f23645] border border-[#f23645] text-[#f23645] hover:text-white active:scale-[0.98] disabled:opacity-60 transition-colors min-w-[88px] cursor-pointer"
            >
              <span className="font-mono-num text-[12px] font-bold leading-tight">
                {fmtPrice(bidPrice)}
              </span>
              <span className="text-[9.5px] font-semibold uppercase tracking-wider leading-none mt-0.5">
                {replay.isActive ? 'PAPER SELL' : 'SELL'}
              </span>
            </button>

            {/* Center Live Price Spread */}
            <span
              title={
                replay.isActive
                  ? 'Replay Spread'
                  : `Spread: ${liveTick?.spread_points ?? 0} pts`
              }
              className="font-mono-num text-[11px] font-medium text-[#787b86] px-0.5 min-w-[32px] text-center"
            >
              {replay.isActive ? '0.00' : spreadPriceDiff.toFixed(digits)}
            </span>

            {/* BUY Market Outlined Button */}
            <button
              onClick={() => handleQuickMarket('BUY')}
              disabled={submitting !== null}
              title={
                replay.isActive
                  ? `Paper BUY ${defaultLot} lot ${symbol} at Replay Bar Close`
                  : `One-Click BUY ${defaultLot} lot ${symbol} at Market`
              }
              className="group flex flex-col items-center justify-center px-3 py-1 rounded-[4px] bg-[#131722]/90 hover:bg-[#2962ff] border border-[#2962ff] text-[#2962ff] hover:text-white active:scale-[0.98] disabled:opacity-60 transition-colors min-w-[88px] cursor-pointer"
            >
              <span className="font-mono-num text-[12px] font-bold leading-tight">
                {fmtPrice(askPrice)}
              </span>
              <span className="text-[9.5px] font-semibold uppercase tracking-wider leading-none mt-0.5">
                {replay.isActive ? 'PAPER BUY' : 'BUY'}
              </span>
            </button>

            {/* Compact Lot Selector Pill */}
            <div className="flex items-center gap-1 px-1.5 py-1 rounded-[4px] bg-[#1e222d]/90 border border-[#2a2e39]">
              <span className="text-[10px] text-[#787b86] mr-0.5">Lot</span>
              <button
                type="button"
                onClick={() => {
                  const next = Math.max(0.01, Number((defaultLot - 0.01).toFixed(2)));
                  setDefaultLot(next);
                  setLotDraft(next.toFixed(2));
                }}
                className="w-4 h-5 rounded bg-[#131722] hover:bg-[#2a2e39] text-[#d1d4dc] text-[11px] font-bold flex items-center justify-center cursor-pointer"
                title="Decrease 0.01 lot"
              >
                -
              </button>
              <input
                type="text"
                inputMode="decimal"
                value={lotDraft}
                onChange={(e) => handleLotChange(e.target.value)}
                onBlur={handleLotBlur}
                title="Order Volume (Lots)"
                className="w-[52px] text-center bg-[#131722] border border-[#2a2e39] rounded px-1 py-0.5 text-[11.5px] font-mono-num font-semibold text-white outline-none focus:border-[#2962ff]"
              />
              <button
                type="button"
                onClick={() => {
                  const next = Number((defaultLot + 0.01).toFixed(2));
                  setDefaultLot(next);
                  setLotDraft(next.toFixed(2));
                }}
                className="w-4 h-5 rounded bg-[#131722] hover:bg-[#2a2e39] text-[#d1d4dc] text-[11px] font-bold flex items-center justify-center cursor-pointer"
                title="Increase 0.01 lot"
              >
                +
              </button>
            </div>
          </div>
        )}

      {/* Row 3: Active Indicators */}
      {activeIndicators.length > 0 && (() => {
        const savedPineList = getSavedPineIndicators();
        const pineByName = new Map(savedPineList.map((p) => [p.name, p]));
        return (
          <div className="flex flex-col gap-0.5 pointer-events-auto">
            {activeIndicators.map((ind) => {
              const savedPine = pineByName.get(ind.name);
              const displayName = savedPine?.title || savedPine?.shortTitle || ind.name;
              const shortParams = ind.calcParams
                .filter((p) => {
                  const s = String(p);
                  return !s.startsWith('rgba(') && !s.startsWith('#') && s.length <= 16;
                })
                .slice(0, 4);
              const paramSummary =
                shortParams.length > 0
                  ? ` (${shortParams.join(', ')}${ind.calcParams.length > shortParams.length ? ', …' : ''})`
                  : '';

              return (
                <div
                  key={ind.id}
                  className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-[#131722]/75 hover:bg-[#1e222d] border border-transparent hover:border-[#2a2e39] w-fit text-[11px] transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => setSettingsIndicator(ind)}
                    title="Click to customize indicator inputs"
                    className={`text-left cursor-pointer hover:text-white ${
                      ind.visible ? 'text-[#d1d4dc]' : 'text-[#787b86] line-through'
                    }`}
                  >
                    <span className="font-medium">{displayName}</span>
                    {paramSummary && <span className="text-[#787b86]">{paramSummary}</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsIndicator(ind)}
                    className="text-[#787b86] hover:text-[#2962ff] cursor-pointer"
                    title="Indicator Settings"
                  >
                    <Settings className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleIndicatorVisibility(ind.id)}
                    className="text-[#787b86] hover:text-[#d1d4dc] cursor-pointer"
                    title={ind.visible ? 'Hide' : 'Show'}
                  >
                    {ind.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeIndicator(ind.id)}
                    className="text-[#787b86] hover:text-[#f23645] cursor-pointer"
                    title="Remove Indicator"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        );
      })()}

      <IndicatorSettingsModal
        indicator={settingsIndicator}
        onClose={() => setSettingsIndicator(null)}
      />
    </div>
  );
};
