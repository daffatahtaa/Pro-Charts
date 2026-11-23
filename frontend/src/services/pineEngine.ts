import {
  ParsedPineScript,
  PineHlineDef,
  PineInputDef,
  PineParamValue,
  PinePlotDef,
  PineRuntimeDiagnostic,
  PineStarterTemplate,
  PineVersion,
  SavedPineIndicator,
} from './pine/pineTypes';
import { parsePineScript } from './pine/pineParser';
import {
  clearPineRuntimeDiagnostic,
  executeParsedPine,
  getAllPineRuntimeDiagnostics,
  getPineRuntimeDiagnostic,
  PineExecContext,
  registerPineContextProvider,
  registerSavedPineWithKLine,
  resampleCandlesToTf,
  subscribePineDiagnostics,
  validatePineScript,
} from './pine/pineRuntime';

export type {
  ParsedPineScript,
  PineExecContext,
  PineHlineDef,
  PineInputDef,
  PineParamValue,
  PinePlotDef,
  PineRuntimeDiagnostic,
  PineStarterTemplate,
  PineVersion,
  SavedPineIndicator,
};
export {
  clearPineRuntimeDiagnostic,
  executeParsedPine,
  getAllPineRuntimeDiagnostics,
  getPineRuntimeDiagnostic,
  parsePineScript,
  registerPineContextProvider,
  resampleCandlesToTf,
  subscribePineDiagnostics,
  validatePineScript,
};

const LS_PINE_KEY = 'tv_custom_pine_indicators_v1';

export const PINE_STARTER_TEMPLATES: PineStarterTemplate[] = [
  {
    id: 'supertrend_v6',
    label: 'SuperTrend v6 Pro',
    version: 6,
    isMain: true,
    description: 'Dynamic green/red SuperTrend with translucent cloud fills & BUY/SELL signals',
    code: `//@version=6
indicator("SuperTrend v6 Pro", shorttitle="ST6", overlay=true)
factor = input.float(3.0, "Factor")
atrPeriod = input.int(10, "ATR Length")
[supertrend, direction] = ta.supertrend(factor, atrPeriod)
upTrend = plot(direction < 0 ? supertrend : na, "Up Trend", color = color.green, style = plot.style_linebr, linewidth = 2)
downTrend = plot(direction > 0 ? supertrend : na, "Down Trend", color = color.red, style = plot.style_linebr, linewidth = 2)
bodyMid = plot(hl2, "Mid", display = display.none)
fill(bodyMid, upTrend, color = color.new(color.green, 88))
fill(bodyMid, downTrend, color = color.new(color.red, 88))
plotshape(ta.crossunder(direction, 0), title="Buy", style=shape.triangleup, location=location.belowbar, color=color.green, text="BUY")
plotshape(ta.crossover(direction, 0), title="Sell", style=shape.triangledown, location=location.abovebar, color=color.red, text="SELL")`,
  },
  {
    id: 'ichimoku_v6',
    label: 'Ichimoku Cloud v6',
    version: 6,
    isMain: true,
    description: 'User function donchian(), +26/-26 offset shifts & dynamic green/red Kumo cloud',
    code: `//@version=6
indicator("Ichimoku Cloud v6", shorttitle="ICHI6", overlay=true)
convLen = input.int(9, "Conversion Line")
baseLen = input.int(26, "Base Line")
spanBLen = input.int(52, "Leading Span B")
donchian(len) => math.avg(ta.lowest(low, len), ta.highest(high, len))
tenkan = donchian(convLen)
kijun = donchian(baseLen)
lead1 = math.avg(tenkan, kijun)
lead2 = donchian(spanBLen)
plot(tenkan, "Tenkan", color=#2962ff, linewidth=1)
plot(kijun, "Kijun", color=#f23645, linewidth=1)
plot(close, "Chikou", color=#089981, offset=-26, linewidth=1)
p1 = plot(lead1, "Span A", color=color.new(#089981, 40), offset=26)
p2 = plot(lead2, "Span B", color=color.new(#f23645, 40), offset=26)
fill(p1, p2, color = lead1 > lead2 ? color.new(#089981, 82) : color.new(#f23645, 82))`,
  },
  {
    id: 'adaptive_ma_v6',
    label: 'Adaptive MA v6',
    version: 6,
    isMain: true,
    description: 'Pine v6 switch expression + input.string options + ta.hma slope coloring',
    code: `//@version=6
indicator("Adaptive MA v6", shorttitle="AMA6", overlay=true)
maType = input.string("HMA", "MA Type", options=["HMA", "EMA", "SMA", "WMA", "RMA"])
len = input.int(21, "Length")
src = input.source(close, "Source")
ma = switch maType
    "HMA" => ta.hma(src, len)
    "EMA" => ta.ema(src, len)
    "SMA" => ta.sma(src, len)
    "WMA" => ta.wma(src, len)
    => ta.rma(src, len)
plot(ma, "Adaptive MA", color = ma > ma[1] ? color.green : color.red, linewidth=2)`,
  },
  {
    id: 'smc_swing_v6',
    label: 'SMC Swing Levels v6',
    version: 6,
    isMain: true,
    description: 'Swing High/Low structure levels using ta.pivothigh, ta.pivotlow & fixnan',
    code: `//@version=6
indicator("SMC Swing Levels v6", shorttitle="SWING6", overlay=true)
leftLen = input.int(5, "Pivot Left")
rightLen = input.int(5, "Pivot Right")
ph = ta.pivothigh(high, leftLen, rightLen)
pl = ta.pivotlow(low, leftLen, rightLen)
lastHigh = fixnan(ph)
lastLow = fixnan(pl)
plot(lastHigh, "Swing High", color=color.red, style=plot.style_stepline, linewidth=1)
plot(lastLow, "Swing Low", color=color.green, style=plot.style_stepline, linewidth=1)`,
  },
  {
    id: 'macd_v6_pro',
    label: 'MACD v6 Pro',
    version: 6,
    isMain: false,
    description: '3-way tuple destructuring [macd, signal, hist] with 4-color momentum histogram',
    code: `//@version=6
indicator("MACD v6 Pro", shorttitle="MACD6", overlay=false)
fast = input.int(12, "Fast Length")
slow = input.int(26, "Slow Length")
sig = input.int(9, "Signal Length")
[macdLine, signalLine, histLine] = ta.macd(close, fast, slow, sig)
histColor = histLine >= 0 ? (histLine > histLine[1] ? #26a69a : #b2dfdb) : (histLine < histLine[1] ? #ff5252 : #ffcdd2)
plot(histLine, "Histogram", style=plot.style_columns, color=histColor)
plot(macdLine, "MACD", color=#2962ff, linewidth=2)
plot(signalLine, "Signal", color=#ff6d00, linewidth=1)
hline(0, "Zero", color=#787b86)`,
  },
  {
    id: 'rsi_cloud_v6',
    label: 'RSI Cloud v6',
    version: 6,
    isMain: false,
    description: 'RSI with dynamic OB/OS coloring, hline band fill & bgcolor zone highlights',
    code: `//@version=6
indicator("RSI Cloud v6", shorttitle="RSI6", overlay=false)
rsiLen = input.int(14, "RSI Length")
r = ta.rsi(close, rsiLen)
plot(r, "RSI", color = r > 70 ? color.red : r < 30 ? color.green : #9c27b0, linewidth=2)
hTop = hline(70, "Overbought", color=#f23645)
hline(50, "Midline", color=#787b86)
hBot = hline(30, "Oversold", color=#089981)
fill(hTop, hBot, color=color.new(#9c27b0, 90))
bgcolor(r > 70 ? color.new(color.red, 88) : r < 30 ? color.new(color.green, 88) : na)`,
  },
];

export function getSavedPineIndicators(): SavedPineIndicator[] {
  try {
    const raw = localStorage.getItem(LS_PINE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePineList(list: SavedPineIndicator[]) {
  try {
    localStorage.setItem(LS_PINE_KEY, JSON.stringify(list));
  } catch {}
}

export function initSavedPineIndicators() {
  const list = getSavedPineIndicators();
  for (const item of list) {
    try {
      registerSavedPineWithKLine(item);
    } catch {}
  }
}

export function compileAndRegisterPineScript(
  code: string,
  existingId?: string
): SavedPineIndicator {
  const check = validatePineScript(code);
  if (!check.ok || !check.parsed) {
    throw new Error(check.error || 'Failed to compile Pine Script');
  }
  const parsed = check.parsed;

  const list = getSavedPineIndicators();
  const existing = existingId ? list.find((s) => s.id === existingId) : undefined;
  const id = existing?.id || `pine_${Date.now()}`;
  const name = existing?.name || `PINE_${Date.now().toString(36).toUpperCase()}`;

  const saved: SavedPineIndicator = {
    id,
    name,
    version: parsed.version,
    title: parsed.title,
    shortTitle: parsed.shortTitle,
    isMain: parsed.isMain,
    code,
    inputs: parsed.inputs,
    plots: parsed.plots,
    hlines: parsed.hlines,
    warnings: parsed.warnings,
    updatedAt: Date.now(),
  };

  registerSavedPineWithKLine(saved);

  const next = existing
    ? list.map((s) => (s.id === id ? saved : s))
    : [saved, ...list];
  savePineList(next);
  return saved;
}

export function deleteSavedPineIndicator(id: string) {
  const list = getSavedPineIndicators().filter((s) => s.id !== id);
  savePineList(list);
}
