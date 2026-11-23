import { registerIndicator, KLineData } from 'klinecharts';
import {
  ParsedPineScript,
  PineBoxRenderItem,
  PineLabelRenderItem,
  PineLinefillRenderItem,
  PineLineRenderItem,
  PineParamValue,
  PinePolylineRenderItem,
  PineRuntimeDiagnostic,
  PineStatement,
  PineTableCell,
  PineTableRenderItem,
  SavedPineIndicator,
} from './pineTypes';
import {
  boolParam,
  lengthParam,
  PINE_ARRAY_OBJECT,
  PINE_COLOR_OBJECT,
  PINE_MAP_OBJECT,
  PINE_MATH_OBJECT,
  PINE_MATRIX_OBJECT,
  PINE_STR_OBJECT,
  resolvePineColorValue,
  scalarParam,
  taAlma,
  taAtr,
  taBarsSince,
  taBbTuple,
  taBbw,
  taCci,
  taChange,
  taCmo,
  taCorrelation,
  taCross,
  taCrossover,
  taCrossunder,
  taCum,
  taDev,
  taDmiTuple,
  taEma,
  taFalling,
  taFixNan,
  taHighest,
  taHighestBars,
  taHma,
  taKcTuple,
  taLinreg,
  taLowest,
  taLowestBars,
  taMacdTuple,
  taMedian,
  taMfi,
  taMom,
  taObv,
  taPercentRank,
  taPivotHigh,
  taPivotLow,
  taRange,
  taRising,
  taRma,
  taRoc,
  taRsi,
  taSar,
  taSma,
  taStdev,
  taStoch,
  taSum,
  taSupertrendTuple,
  taSwma,
  taTr,
  taTsi,
  taValueWhen,
  taVariance,
  taVwap,
  taVwma,
  taWma,
  toNumericSeries,
} from './pineTaLib';
import { parseNamedAndPositional, parsePineScript, splitTopLevelArgs } from './pineParser';

export interface PineExecContext {
  symbolInfo?: {
    symbol?: string;
    description?: string;
    digits?: number;
    point?: number;
    category?: string;
  };
  timezone?: string;
}

let pineContextProvider: (() => PineExecContext) | null = null;

export function registerPineContextProvider(provider: () => PineExecContext) {
  pineContextProvider = provider;
}

// ============================================================================
// Structured Runtime Diagnostics Registry (non-silent error surfacing!)
// ============================================================================
const pineDiagnosticsMap = new Map<string, PineRuntimeDiagnostic>();
const pineDiagnosticListeners = new Set<() => void>();

function notifyDiagnosticListeners() {
  for (const fn of pineDiagnosticListeners) {
    try {
      fn();
    } catch {}
  }
}

export function setPineRuntimeDiagnostic(indicatorName: string, diag: PineRuntimeDiagnostic) {
  pineDiagnosticsMap.set(indicatorName, diag);
  notifyDiagnosticListeners();
}

export function clearPineRuntimeDiagnostic(indicatorName: string) {
  if (pineDiagnosticsMap.delete(indicatorName)) {
    notifyDiagnosticListeners();
  }
}

export function getPineRuntimeDiagnostic(indicatorName: string): PineRuntimeDiagnostic | null {
  return pineDiagnosticsMap.get(indicatorName) ?? null;
}

export function getAllPineRuntimeDiagnostics(): Record<string, PineRuntimeDiagnostic> {
  const out: Record<string, PineRuntimeDiagnostic> = {};
  for (const [k, v] of pineDiagnosticsMap.entries()) out[k] = v;
  return out;
}

export function subscribePineDiagnostics(fn: () => void): () => void {
  pineDiagnosticListeners.add(fn);
  return () => {
    pineDiagnosticListeners.delete(fn);
  };
}

function getDefaultExecContext(): PineExecContext {
  try {
    return pineContextProvider ? pineContextProvider() : {};
  } catch {
    return {};
  }
}

function buildSyminfoFromContext(ctx?: PineExecContext) {
  const si = ctx?.symbolInfo;
  const rawSym = si?.symbol || 'CHART';
  const cleanSym = rawSym.replace(/(?:[._-][A-Za-z0-9]+|[a-z]+)$/, '') || rawSym;
  const digits = si?.digits ?? 4;
  const mintick = si?.point && si.point > 0 ? si.point : Math.pow(10, -digits);
  const catLower = (si?.category || 'forex').toLowerCase();
  let symType = 'forex';
  if (catLower.includes('crypto')) symType = 'crypto';
  else if (catLower.includes('index') || catLower.includes('indices')) symType = 'index';
  else if (catLower.includes('stock') || catLower.includes('equit')) symType = 'stock';
  else if (catLower.includes('metal') || catLower.includes('commod') || catLower.includes('cfd')) symType = 'cfd';

  let baseCurrency = 'EUR';
  let quoteCurrency = 'USD';
  if (/^[A-Z]{6}$/.test(cleanSym)) {
    baseCurrency = cleanSym.slice(0, 3);
    quoteCurrency = cleanSym.slice(3, 6);
  } else if (cleanSym.endsWith('USDT')) {
    baseCurrency = cleanSym.slice(0, -4) || cleanSym;
    quoteCurrency = 'USDT';
  } else if (cleanSym.endsWith('USD')) {
    baseCurrency = cleanSym.slice(0, -3) || cleanSym;
    quoteCurrency = 'USD';
  }

  const prefix = symType === 'crypto' ? 'CRYPTO' : symType === 'index' ? 'INDEX' : 'FX';
  return {
    mintick,
    pointvalue: 1,
    ticker: rawSym,
    tickerid: `${prefix}:${rawSym}`,
    prefix,
    root: cleanSym,
    description: si?.description || rawSym,
    currency: quoteCurrency,
    basecurrency: baseCurrency,
    type: symType,
    timezone: ctx?.timezone || 'Etc/UTC',
    session: 'regular',
    volumetype: 'tick',
  };
}

// ============================================================================
// Multi-Timeframe Candle Resampler (Phase 3: real request.security & timeframe.change)
// ============================================================================
export interface ResampledTfData {
  bars: KLineData[];
  baseToHtfIdx: number[];
  isNewHtfBar: number[];
}

export function resampleCandlesToTf(dataList: KLineData[], targetTfSec: number): ResampledTfData {
  const len = dataList.length;
  const bars: KLineData[] = [];
  const baseToHtfIdx = new Array<number>(len).fill(0);
  const isNewHtfBar = new Array<number>(len).fill(0);
  if (len === 0) return { bars, baseToHtfIdx, isNewHtfBar };

  const bucketMs = Math.max(1000, Math.round(targetTfSec) * 1000);
  const getBucketTs = (ts: number): number => {
    if (targetTfSec >= 2419200) {
      const d = new Date(ts);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    }
    if (targetTfSec === 604800) {
      const d = new Date(ts);
      const dayOffset = (d.getUTCDay() + 6) % 7; // Monday = 0
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dayOffset);
    }
    return Math.floor(ts / bucketMs) * bucketMs;
  };

  let curBucket = -1;
  for (let i = 0; i < len; i++) {
    const bar = dataList[i];
    const bTs = getBucketTs(bar.timestamp);
    if (bTs !== curBucket) {
      curBucket = bTs;
      bars.push({
        timestamp: bTs,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume ?? 1,
      });
      isNewHtfBar[i] = 1;
    } else {
      const cur = bars[bars.length - 1];
      if (bar.high > cur.high) cur.high = bar.high;
      if (bar.low < cur.low) cur.low = bar.low;
      cur.close = bar.close;
      cur.volume = (cur.volume ?? 0) + (bar.volume ?? 0);
    }
    baseToHtfIdx[i] = bars.length - 1;
  }

  return { bars, baseToHtfIdx, isNewHtfBar };
}

// Internal execution value types:
// - number[] (series of length `len`)
// - Array<string | null> (color/string series of length `len`)
// - number[][] (multi-output tuple of numeric series)
// - scalar (string | boolean | number) or JS array / map / matrix / UDT / drawing object
type PineEnvValue = any;

interface UserFuncDef {
  params: string[];
  paramDefaults?: Array<string | undefined>;
  body: string;
  stmts?: PineStatement[];
}

const STATIC_NAMESPACES = new Set([
  'ta',
  'math',
  'color',
  'array',
  'map',
  'matrix',
  'str',
  'line',
  'box',
  'label',
  'table',
  'linefill',
  'polyline',
  'request',
  'timeframe',
  'chart',
  'strategy',
  'syminfo',
  'session',
  'barstate',
  'barmerge',
  'format',
  'input',
  'plot',
  'hline',
  'shape',
  'location',
  'size',
  'display',
  'position',
  'text',
  'font',
  'xloc',
  'yloc',
  'extend',
  'dayofweek',
]);

const V4_TA_ALIASES =
  /\b(sma|ema|rma|wma|vwma|hma|swma|alma|linreg|rsi|atr|stdev|variance|dev|median|highest|lowest|highestbars|lowestbars|cci|mom|roc|change|cum|crossover|crossunder|cross|rising|falling|vwap|supertrend|stoch|sar|pivothigh|pivotlow|barssince|valuewhen|mfi|tsi|cmo|bbw|correlation|percentrank)\s*\(/g;

function normalizePineExprSyntax(raw: string): string {
  let s = raw.trim();

  // Pine v6 generic collection constructors: `array.new<T>(...)`, `map.new<K,V>()`, `matrix.new<T>(...)`
  s = s.replace(
    /\barray\.new<\s*(float|int|bool|string|color|box|line|label|table|linefill|polyline)\s*>\s*\(/g,
    'array.new_$1('
  );
  s = s.replace(/\barray\.new<\s*[^>]+\s*>\s*\(/g, 'array.new_any(');
  s = s.replace(/\barray\.from<\s*[^>]+\s*>\s*\(/g, 'array.from(');
  s = s.replace(/\bmap\.new<\s*[^>]+\s*>\s*\(/g, 'map.new_any(');
  s = s.replace(/\bmatrix\.new<\s*[^>]+\s*>\s*\(/g, 'matrix.new_any(');

  // Pine v6 hex color literals `#rrggbb` or `#rrggbbaa` outside quotes -> `'#rrggbb'`
  s = quoteHexLiteralsOutsideStrings(s);

  // Pine v4 bare TA aliases -> `ta.xxx(`
  s = s.replace(V4_TA_ALIASES, (match, fn, offset, full) => {
    if (offset >= 3 && full.slice(offset - 3, offset) === 'ta.') return match;
    if (offset >= 1 && full[offset - 1] === '.') return match;
    return `ta.${fn}(`;
  });

  // `fixnan(` -> `ta.fixnan(`
  s = s.replace(/\bfixnan\s*\(/g, (match, offset, full) => {
    if (offset >= 3 && full.slice(offset - 3, offset) === 'ta.') return match;
    return 'ta.fixnan(';
  });

  // `math.sum(` -> `ta.sum(`
  s = s.replace(/\bmath\.sum\s*\(/g, 'ta.sum(');

  // Pine v6 `time(tf)` / `time_close(tf)` / `timeframe.change(tf)` function calls
  s = s.replace(/(?<![.\w])time\s*\(/g, '__timeFn(i, ');
  s = s.replace(/(?<![.\w])time_close\s*\(/g, '__timeCloseFn(i, ');
  s = s.replace(/\btimeframe\.change\s*\(/g, '__tfChange(i, ');

  // Pine v6 named-argument calls (`box.new(...)`, `line.new(...)`, `label.new(...)`, `table.new(...)`, `table.cell(...)`, `tbl.cell(...)`, `linefill.new(...)`, `polyline.new(...)`, UDT `Cnd.new(...)`)
  s = rewriteNamedObjectCallsGeneric(s);

  // Pine v6 universal method calls (`arr.push(...)`, `m.put(...)`, `mat.get(...)`, `ln.set_x2(...)`, `udt.update(...)`, chained calls)
  s = rewritePineMethodCalls(s);

  return s;
}

const NAMED_CALL_TARGETS = new Set([
  'box.new',
  'line.new',
  'label.new',
  'linefill.new',
  'polyline.new',
  'table.new',
  'table.cell',
  'table.cell_set_text',
  'table.cell_set_bgcolor',
  'table.cell_set_text_color',
  'chart.point.new',
  'chart.point.from_index',
  'chart.point.from_time',
  'request.security_lower_tf',
]);

function rewriteNamedObjectCallsGeneric(expr: string): string {
  const re = /\b([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*){1,2})\s*\(/g;
  let out = expr;
  let guard = 0;
  while (guard < 60) {
    re.lastIndex = 0;
    let changed = false;
    let m: RegExpExecArray | null;
    while ((m = re.exec(out)) !== null) {
      const fnFull = m[1];
      const isUdtNew = /^[A-Z]\w*\.new$/.test(fnFull);
      const isTableCellMethod = /^[a-zA-Z_]\w*\.cell$/.test(fnFull);
      if (!isUdtNew && !isTableCellMethod && !NAMED_CALL_TARGETS.has(fnFull)) continue;

      const openIdx = m.index + m[0].length - 1;
      let depth = 1;
      let inStr: string | null = null;
      let closeIdx = -1;
      for (let i = openIdx + 1; i < out.length; i++) {
        const ch = out[i];
        if (inStr) {
          if (ch === '\\') {
            i++;
            continue;
          }
          if (ch === inStr) inStr = null;
        } else if (ch === '"' || ch === "'") {
          inStr = ch;
        } else if (ch === '(') {
          depth++;
        } else if (ch === ')') {
          depth--;
          if (depth === 0) {
            closeIdx = i;
            break;
          }
        }
      }
      if (closeIdx <= openIdx) continue;
      const rawArgs = out.slice(openIdx + 1, closeIdx);
      if (rawArgs.trim().startsWith('{')) continue;
      const args = splitTopLevelArgs(rawArgs);
      const hasNamed = args.some((a) => /^[a-zA-Z_]\w*\s*=(?![=>])/.test(a));
      if (!hasNamed) continue;
      const entries = args.map((a, idx) => {
        const nm = /^([a-zA-Z_]\w*)\s*=(?![=>])\s*(.+)$/.exec(a);
        if (nm) return `${nm[1]}: (${nm[2].trim()})`;
        return `__p${idx}: (${a})`;
      });
      const replacement = `{ ${entries.join(', ')} }`;
      out = out.slice(0, openIdx + 1) + replacement + out.slice(closeIdx);
      changed = true;
      break;
    }
    if (!changed) break;
    guard++;
  }
  return out;
}

function quoteHexLiteralsOutsideStrings(expr: string): string {
  let out = '';
  let inStr: string | null = null;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (inStr) {
      out += ch;
      if (ch === '\\' && i + 1 < expr.length) {
        out += expr[++i];
      } else if (ch === inStr) {
        inStr = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      out += ch;
      continue;
    }
    if (ch === '#') {
      const m = /^#[0-9a-fA-F]{3,8}\b/.exec(expr.slice(i));
      if (m) {
        out += `'${m[0]}'`;
        i += m[0].length - 1;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/**
 * Rewrites Pine v6 method-call syntax (`receiver.method(args)`) into `__pineCall(receiver, 'method', args)`
 * with full balanced-parenthesis support for nested calls and method chains (`arr.get(0).update(close)`).
 * Static namespaces (`ta.*`, `array.*`, `map.*`, `matrix.*`, `line.*`, `box.*`, `table.*`, etc.) and
 * UDT constructors (`MyType.new(...)`) are left untouched.
 */
function rewritePineMethodCalls(expr: string): string {
  let out = expr;
  let guard = 0;

  while (guard < 80) {
    guard++;
    let inStr: string | null = null;
    let didRewrite = false;

    for (let i = 0; i < out.length; i++) {
      const ch = out[i];
      if (inStr) {
        if (ch === '\\') {
          i++;
          continue;
        }
        if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inStr = ch;
        continue;
      }
      if (ch !== '.') continue;

      // Match `.methodName(`
      const m = /^\.([a-zA-Z_]\w*)\s*\(/.exec(out.slice(i));
      if (!m) continue;
      const methodName = m[1];
      const openIdx = i + m[0].length - 1;

      // Walk backwards from `i - 1` to extract receiver expression (`ident`, `a.b`, `fn(...)`)
      let rStart = i;
      let p = i - 1;
      while (p >= 0) {
        if (out[p] === ')') {
          let d = 1;
          let sIn: string | null = null;
          p--;
          while (p >= 0 && d > 0) {
            const c = out[p];
            if (sIn) {
              if (c === sIn && out[p - 1] !== '\\') sIn = null;
            } else if (c === '"' || c === "'") {
              sIn = c;
            } else if (c === ')') {
              d++;
            } else if (c === '(') {
              d--;
            }
            p--;
          }
          // Include identifier immediately preceding `(` if any
          while (p >= 0 && /[a-zA-Z0-9_$]/.test(out[p])) p--;
          rStart = p + 1;
          if (p >= 0 && out[p] === '.') {
            p--;
            continue;
          }
          break;
        } else if (/[a-zA-Z0-9_$]/.test(out[p])) {
          while (p >= 0 && /[a-zA-Z0-9_$]/.test(out[p])) p--;
          rStart = p + 1;
          if (p >= 0 && out[p] === '.') {
            p--;
            continue;
          }
          break;
        } else {
          break;
        }
      }

      const receiver = out.slice(rStart, i).trim();
      if (!receiver || /^\d/.test(receiver)) continue;

      // Skip static namespaces & PascalCase type constructors (`MyType.new(...)`, `MyType.copy(...)`)
      const rootIdent = /^([a-zA-Z_]\w*)/.exec(receiver)?.[1];
      if (rootIdent && STATIC_NAMESPACES.has(rootIdent)) continue;
      if (/^[A-Z]\w*$/.test(receiver) && (methodName === 'new' || methodName === 'copy')) continue;

      // Scan forward with balanced parens to find matching `)`
      let depth = 1;
      let argStr: string | null = null;
      let closeIdx = -1;
      for (let k = openIdx + 1; k < out.length; k++) {
        const c = out[k];
        if (argStr) {
          if (c === '\\') {
            k++;
            continue;
          }
          if (c === argStr) argStr = null;
        } else if (c === '"' || c === "'") {
          argStr = c;
        } else if (c === '(') {
          depth++;
        } else if (c === ')') {
          depth--;
          if (depth === 0) {
            closeIdx = k;
            break;
          }
        }
      }
      if (closeIdx <= openIdx) continue;

      const rawArgs = out.slice(openIdx + 1, closeIdx).trim();
      const rewritten = rawArgs
        ? `__pineCall(${receiver}, '${methodName}', ${rawArgs})`
        : `__pineCall(${receiver}, '${methodName}')`;
      out = out.slice(0, rStart) + rewritten + out.slice(closeIdx + 1);
      didRewrite = true;
      break;
    }

    if (!didRewrite) break;
  }

  return out;
}

/**
 * Expands user-defined functions like `donchian(convLen)` into their body expression
 * so nested `ta.*` calls evaluate cleanly on full series.
 */
function inlineUserFunctions(expr: string, funcs: Record<string, UserFuncDef>): string {
  let result = expr;
  const fnNames = Object.keys(funcs).filter((k) => !funcs[k].stmts || funcs[k].stmts!.length === 0);
  if (fnNames.length === 0) return result;

  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const fnName of fnNames) {
      const def = funcs[fnName];
      const re = new RegExp(`\\b${fnName}\\s*\\(([^()]*)\\)`, 'g');
      result = result.replace(re, (_, rawArgs: string) => {
        changed = true;
        const argList = rawArgs.trim() ? splitTopLevelArgs(rawArgs) : [];
        let expanded = def.body;
        def.params.forEach((p, idx) => {
          const replacement = argList[idx] !== undefined ? `(${argList[idx]})` : 'na';
          expanded = expanded.replace(new RegExp(`\\b${p}\\b`, 'g'), replacement);
        });
        return `(${expanded})`;
      });
    }
    if (!changed) break;
  }
  return result;
}

function buildTaRegistry(
  high: number[],
  low: number[],
  close: number[],
  hlc3: number[],
  volume: number[],
  timestamps: number[],
  len: number
): Record<string, (...args: any[]) => any> {
  return {
    sma: (s, l) => taSma(toNumericSeries(s, len), lengthParam(l, len, 14)),
    ema: (s, l) => taEma(toNumericSeries(s, len), lengthParam(l, len, 14)),
    rma: (s, l) => taRma(toNumericSeries(s, len), lengthParam(l, len, 14)),
    wma: (s, l) => taWma(toNumericSeries(s, len), scalarParam(l, 14)),
    vwma: (s, l) => taVwma(toNumericSeries(s, len), volume, scalarParam(l, 14)),
    hma: (s, l) => taHma(toNumericSeries(s, len), scalarParam(l, 14)),
    swma: (s) => taSwma(toNumericSeries(s, len)),
    alma: (s, l, off, sig) =>
      taAlma(
        toNumericSeries(s, len),
        scalarParam(l, 9),
        scalarParam(off, 0.85),
        scalarParam(sig, 6)
      ),
    linreg: (s, l, off) =>
      taLinreg(toNumericSeries(s, len), lengthParam(l, len, 14), scalarParam(off, 0)),
    rsi: (s, l) => taRsi(toNumericSeries(s, len), scalarParam(l, 14)),
    tr: (handleNa) => taTr(high, low, close, boolParam(handleNa, false)),
    atr: (l) => taAtr(high, low, close, scalarParam(l, 14)),
    stdev: (s, l) => taStdev(toNumericSeries(s, len), lengthParam(l, len, 20)),
    variance: (s, l) => taVariance(toNumericSeries(s, len), lengthParam(l, len, 20)),
    dev: (s, l) => taDev(toNumericSeries(s, len), scalarParam(l, 20)),
    median: (s, l) => taMedian(toNumericSeries(s, len), scalarParam(l, 14)),
    highest: (a, b) =>
      b === undefined
        ? taHighest(high, lengthParam(a, len, 20))
        : taHighest(toNumericSeries(a, len), lengthParam(b, len, 20)),
    lowest: (a, b) =>
      b === undefined
        ? taLowest(low, lengthParam(a, len, 20))
        : taLowest(toNumericSeries(a, len), lengthParam(b, len, 20)),
    highestbars: (a, b) =>
      b === undefined
        ? taHighestBars(high, lengthParam(a, len, 20))
        : taHighestBars(toNumericSeries(a, len), lengthParam(b, len, 20)),
    lowestbars: (a, b) =>
      b === undefined
        ? taLowestBars(low, lengthParam(a, len, 20))
        : taLowestBars(toNumericSeries(a, len), lengthParam(b, len, 20)),
    cci: (s, l) => taCci(toNumericSeries(s, len), scalarParam(l, 20)),
    mom: (s, l) => taMom(toNumericSeries(s, len), lengthParam(l, len, 10)),
    roc: (s, l) => taRoc(toNumericSeries(s, len), lengthParam(l, len, 10)),
    change: (s, l) => taChange(toNumericSeries(s, len), lengthParam(l ?? 1, len, 1)),
    cum: (s) => taCum(toNumericSeries(s, len)),
    sum: (s, l) => taSum(toNumericSeries(s, len), lengthParam(l, len, 14)),
    vwap: (s) => taVwap(s ? toNumericSeries(s, len) : hlc3, volume, timestamps),
    obv: () => taObv(close, volume),
    supertrend: (f, l) => taSupertrendTuple(high, low, close, scalarParam(f, 3), scalarParam(l, 10)),
    bb: (s, l, m) => taBbTuple(toNumericSeries(s, len), scalarParam(l, 20), scalarParam(m, 2)),
    bbw: (s, l, m) => taBbw(toNumericSeries(s, len), scalarParam(l, 20), scalarParam(m, 2)),
    kc: (s, l, m, useTr) =>
      taKcTuple(
        toNumericSeries(s, len),
        high,
        low,
        close,
        scalarParam(l, 20),
        scalarParam(m, 1.5),
        boolParam(useTr, true)
      ),
    macd: (s, fast, slow, sig) =>
      taMacdTuple(
        toNumericSeries(s, len),
        scalarParam(fast ?? 12, 12),
        scalarParam(slow ?? 26, 26),
        scalarParam(sig ?? 9, 9)
      ),
    dmi: (diLen, adxSmooth) =>
      taDmiTuple(high, low, close, scalarParam(diLen, 14), scalarParam(adxSmooth, 14)),
    stoch: (c, h, l, p) =>
      taStoch(
        toNumericSeries(c, len),
        toNumericSeries(h, len),
        toNumericSeries(l, len),
        scalarParam(p, 14)
      ),
    mfi: (s, l) => taMfi(toNumericSeries(s, len), volume, scalarParam(l, 14)),
    tsi: (s, shortL, longL) =>
      taTsi(toNumericSeries(s, len), scalarParam(shortL, 13), scalarParam(longL, 25)),
    cmo: (s, l) => taCmo(toNumericSeries(s, len), scalarParam(l, 9)),
    sar: (st, inc, maxAf) =>
      taSar(high, low, close, scalarParam(st, 0.02), scalarParam(inc, 0.02), scalarParam(maxAf, 0.2)),
    pivothigh: (a, b, c) =>
      c === undefined
        ? taPivotHigh(high, scalarParam(a, 5), scalarParam(b, 5))
        : taPivotHigh(toNumericSeries(a, len), scalarParam(b, 5), scalarParam(c, 5)),
    pivotlow: (a, b, c) =>
      c === undefined
        ? taPivotLow(low, scalarParam(a, 5), scalarParam(b, 5))
        : taPivotLow(toNumericSeries(a, len), scalarParam(b, 5), scalarParam(c, 5)),
    barssince: (cond) => taBarsSince(toNumericSeries(cond, len)),
    valuewhen: (cond, src, occ) =>
      taValueWhen(
        toNumericSeries(cond, len),
        toNumericSeries(src, len),
        lengthParam(occ ?? 0, len, 0)
      ),
    fixnan: (s) => taFixNan(toNumericSeries(s, len)),
    crossover: (a, b) => taCrossover(toNumericSeries(a, len), toNumericSeries(b, len)),
    crossunder: (a, b) => taCrossunder(toNumericSeries(a, len), toNumericSeries(b, len)),
    cross: (a, b) => taCross(toNumericSeries(a, len), toNumericSeries(b, len)),
    rising: (s, l) => taRising(toNumericSeries(s, len), scalarParam(l, 3)),
    falling: (s, l) => taFalling(toNumericSeries(s, len), scalarParam(l, 3)),
    correlation: (a, b, l) =>
      taCorrelation(toNumericSeries(a, len), toNumericSeries(b, len), scalarParam(l, 20)),
    percentrank: (s, l) => taPercentRank(toNumericSeries(s, len), scalarParam(l, 20)),
    range: (s, l) => taRange(toNumericSeries(s, len), scalarParam(l, 14)),
  };
}

function isSeriesArray(v: any, len: number): boolean {
  return Array.isArray(v) && !(v as any).__isPineArray && v.length === len && !Array.isArray(v[0]);
}

function findRequestSecurityCall(
  expr: string
): { start: number; end: number; rawArgs: string; fullText: string } | null {
  const re = /\brequest\.security\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(expr)) !== null) {
    const start = match.index;
    const openIdx = match.index + match[0].length - 1;
    let depth = 1;
    let inStr: string | null = null;
    let closeIdx = -1;
    for (let i = openIdx + 1; i < expr.length; i++) {
      const ch = expr[i];
      if (inStr) {
        if (ch === '\\') {
          i++;
          continue;
        }
        if (ch === inStr) inStr = null;
      } else if (ch === '"' || ch === "'") {
        inStr = ch;
      } else if (ch === '(') {
        depth++;
      } else if (ch === ')') {
        depth--;
        if (depth === 0) {
          closeIdx = i;
          break;
        }
      }
    }
    if (closeIdx > openIdx) {
      return {
        start,
        end: closeIdx + 1,
        rawArgs: expr.slice(openIdx + 1, closeIdx),
        fullText: expr.slice(start, closeIdx + 1),
      };
    }
  }
  return null;
}

interface RuntimeHooks {
  pineCall: (obj: any, method: string, ...args: any[]) => any;
  tfChange: (barIdx: number, tf?: string) => number;
  resolveSecurity?: (rawArgs: string, allowTuple: boolean) => any;
  secExprLookup?: Map<string, string>;
}

/**
 * Finds the innermost `ta.fnName(...)` call using balanced-parenthesis scanning
 * so nested grouping parens like `ta.lowest(low, (convLen))` or `ta.sma((high + low) / 2, 10)` work cleanly.
 */
function findInnermostTaCall(
  expr: string
): { start: number; end: number; fnName: string; rawArgs: string } | null {
  const re = /\bta\.([a-zA-Z_]\w*)\s*\(/g;
  let match: RegExpExecArray | null;
  let best: { start: number; end: number; fnName: string; rawArgs: string } | null = null;

  while ((match = re.exec(expr)) !== null) {
    const start = match.index;
    const fnName = match[1];
    const openIdx = match.index + match[0].length - 1;
    let depth = 1;
    let inStr: string | null = null;
    let closeIdx = -1;

    for (let i = openIdx + 1; i < expr.length; i++) {
      const ch = expr[i];
      if (inStr) {
        if (ch === '\\') {
          i++;
          continue;
        }
        if (ch === inStr) inStr = null;
      } else if (ch === '"' || ch === "'") {
        inStr = ch;
      } else if (ch === '(') {
        depth++;
      } else if (ch === ')') {
        depth--;
        if (depth === 0) {
          closeIdx = i;
          break;
        }
      }
    }

    if (closeIdx > openIdx) {
      const rawArgs = expr.slice(openIdx + 1, closeIdx);
      // Prefer innermost call (contains no nested `ta.xxx(` inside its args)
      if (!/\bta\.[a-zA-Z_]\w*\s*\(/.test(rawArgs)) {
        return { start, end: closeIdx + 1, fnName, rawArgs };
      }
      best = { start, end: closeIdx + 1, fnName, rawArgs };
    }
  }
  return best;
}

/**
 * Evaluates a Pine v6 expression across all `len` bars, returning either:
 * - `number[]` / `Array<string | null>` (per-bar series)
 * - `number[][]` (multi-output tuple, when `allowTuple = true`)
 */
function evalPineExprVector(
  rawExpr: string,
  env: Record<string, PineEnvValue>,
  ta: Record<string, (...args: any[]) => any>,
  funcs: Record<string, UserFuncDef>,
  len: number,
  allowTuple = false,
  hooks?: RuntimeHooks
): any {
  const inlined = inlineUserFunctions(rawExpr, funcs);
  const tempVars: Record<string, PineEnvValue> = { ...env };
  let tempCounter = 0;

  // Intercept `request.security(...)` BEFORE syntax normalization / `ta.*` lifting so
  // expressions like `request.security(syminfo.tickerid, "240", ta.ema(close, 50))` evaluate on the HTF series!
  let preTransformed = inlined.trim();
  if (hooks?.resolveSecurity) {
    const directSec = findRequestSecurityCall(preTransformed);
    if (allowTuple && directSec && directSec.start === 0 && directSec.end === preTransformed.length) {
      return hooks.resolveSecurity(directSec.rawArgs, true);
    }
    let secGuard = 0;
    let secCall = findRequestSecurityCall(preTransformed);
    while (secCall && secGuard < 20) {
      secGuard++;
      const secVal = hooks.resolveSecurity(secCall.rawArgs, false);
      const tmpName = `__sec${tempCounter++}`;
      tempVars[tmpName] =
        Array.isArray(secVal) && Array.isArray(secVal[0]) ? secVal[0] : secVal;
      preTransformed =
        preTransformed.slice(0, secCall.start) + tmpName + preTransformed.slice(secCall.end);
      secCall = findRequestSecurityCall(preTransformed);
    }
  }

  let transformed = normalizePineExprSyntax(preTransformed);

  // Direct tuple call check (e.g. `ta.supertrend(3, 10)`, `ta.bb(close, 20, 2)`, `ta.macd(...)`, `ta.dmi(...)`, `ta.kc(...)`)
  const directTaMatch = /^ta\.([a-zA-Z_]\w*)\((.*)\)$/.exec(transformed);
  if (allowTuple && directTaMatch && isBalancedOuterParens(directTaMatch[2])) {
    const fn = ta[directTaMatch[1]];
    if (fn) {
      const argParts = directTaMatch[2].trim() ? splitTopLevelArgs(directTaMatch[2]) : [];
      const evalArgs = argParts.map((a) => evalPineExprVector(a, tempVars, ta, funcs, len, false, hooks));
      const res = fn(...evalArgs);
      if (Array.isArray(res) && Array.isArray(res[0])) return res;
      return [toNumericSeries(res, len)];
    }
  }

  // Handle `request.security_lower_tf(sym, tf, [open, close, volume], ...)` tuple return
  if (allowTuple && /^request\.security_lower_tf\s*\(/.test(transformed)) {
    const openSeries = env.open as number[];
    const closeSeries = env.close as number[];
    const volSeries = env.volume as number[];
    const mkBarArr = (src: number[]) =>
      src.map((v) => {
        const a: any = [v];
        a.__isPineArray = true;
        return a;
      });
    return [mkBarArr(openSeries), mkBarArr(closeSeries), mkBarArr(volSeries)];
  }

  // Iteratively resolve innermost `ta.xxx(...)` calls using balanced-parenthesis scanning
  let guard = 0;
  let taCall = findInnermostTaCall(transformed);
  while (taCall && guard < 80) {
    guard++;
    const fn = ta[taCall.fnName];
    if (!fn) throw new Error(`Unsupported Pine function: ta.${taCall.fnName}()`);
    const argParts = taCall.rawArgs.trim()
      ? splitTopLevelArgs(taCall.rawArgs).map((a) => {
          const namedM = /^[a-zA-Z_]\w*\s*=(?![=>])\s*(.+)$/.exec(a);
          return namedM ? namedM[1].trim() : a;
        })
      : [];
    const evalArgs = argParts.map((a) => evalPineExprVector(a, tempVars, ta, funcs, len, false, hooks));
    const res = fn(...evalArgs);
    const tmpName = `__t${tempCounter++}`;
    tempVars[tmpName] =
      Array.isArray(res) && Array.isArray(res[0]) ? res[0] : toNumericSeries(res, len);
    transformed = transformed.slice(0, taCall.start) + tmpName + transformed.slice(taCall.end);
    taCall = findInnermostTaCall(transformed);
  }

  // Replace bare `ta.tr`, `ta.obv`, `ta.vwap` properties (without parens)
  transformed = transformed
    .replace(/\bta\.tr\b(?!\s*\()/g, '__ta_tr')
    .replace(/\bta\.obv\b(?!\s*\()/g, '__ta_obv')
    .replace(/\bta\.vwap\b(?!\s*\()/g, '__ta_vwap');

  // Transform historical lookback `ident[k]` -> `__lag(ident, i, k)`
  transformed = transformed.replace(
    /\b([a-zA-Z_]\w*)\s*\[\s*(\d+)\s*\]/g,
    '__lag($1, i, $2)'
  );

  // Transform Pine v6 boolean operators & `na`
  transformed = replaceKeywordsOutsideStrings(transformed);

  // Rewrite identifiers belonging to `tempVars` (series -> `name[i]`, scalars/arrays -> `name`)
  const varNames = Object.keys(tempVars);
  const seriesSet = new Set(varNames.filter((k) => isSeriesArray(tempVars[k], len)));

  const perBarExpr = rewriteSeriesIdentifiers(transformed, seriesSet);

  const nz = (v: any, fallback: any = 0) =>
    v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v)) ? fallback : v;
  const naFn = (v: any) =>
    v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v));
  const __lag = (arr: any, i: number, k: number) => {
    if (!Array.isArray(arr)) return arr;
    return i - k >= 0 ? arr[i - k] : NaN;
  };
  const __bool = (v: any) => !(v === false || v === 0 || v === null || v === undefined || Number.isNaN(v));
  const __int = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : NaN;
  };
  const __float = (v: any) => Number(v);
  const __string = (v: any) =>
    v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v)) ? '' : String(v);
  const __pineCall =
    hooks?.pineCall ||
    ((obj: any, method: string, ...args: any[]) => {
      if (obj === null || obj === undefined || (typeof obj === 'number' && Number.isNaN(obj))) return NaN;
      if (obj.__isPineMap && method in PINE_MAP_OBJECT) return PINE_MAP_OBJECT[method](obj, ...args);
      if (obj.__isPineMatrix && method in PINE_MATRIX_OBJECT) return PINE_MATRIX_OBJECT[method](obj, ...args);
      if (Array.isArray(obj) && method in PINE_ARRAY_OBJECT) return PINE_ARRAY_OBJECT[method](obj, ...args);
      if (typeof obj[method] === 'function') return obj[method](...args);
      throw new Error(`Unknown Pine method ".${method}()"`);
    });
  const __tfChange = hooks?.tfChange || (() => 0);

  const fnArgs = [
    ...varNames,
    'nz',
    'naFn',
    '__lag',
    '__bool',
    'bool',
    'int',
    'float',
    'string',
    'math',
    'color',
    'array',
    'map',
    'matrix',
    'str',
    '__pineCall',
    '__timeFn',
    '__timeCloseFn',
    '__tfChange',
    '__len',
  ];
  const fnBody = `
    const __out = new Array(__len);
    for (let i = 0; i < __len; i++) {
      const __v = (${perBarExpr});
      __out[i] = typeof __v === 'boolean' ? (__v ? 1 : 0) : __v;
    }
    return __out;
  `;

  const __timeFn = (i: number, tf?: string) => {
    const ts = Array.isArray(tempVars.time) ? tempVars.time[i] : 0;
    const sec = parsePineTfSeconds(tf, 3600);
    const ms = Math.max(1000, sec * 1000);
    return Math.floor(ts / ms) * ms;
  };
  const __timeCloseFn = (i: number, tf?: string) => {
    const sec = parsePineTfSeconds(tf, 3600);
    return __timeFn(i, tf) + Math.max(1000, sec * 1000);
  };

  try {
    const compiled = new Function(...fnArgs, fnBody);
    return compiled(
      ...varNames.map((k) => tempVars[k]),
      nz,
      naFn,
      __lag,
      __bool,
      __bool,
      __int,
      __float,
      __string,
      PINE_MATH_OBJECT,
      PINE_COLOR_OBJECT,
      PINE_ARRAY_OBJECT,
      PINE_MAP_OBJECT,
      PINE_MATRIX_OBJECT,
      PINE_STR_OBJECT,
      __pineCall,
      __timeFn,
      __timeCloseFn,
      __tfChange,
      len
    );
  } catch (err: any) {
    throw new Error(`Expression error in "${rawExpr}": ${err?.message || String(err)}`);
  }
}

function isBalancedOuterParens(s: string): boolean {
  let depth = 0;
  let inStr: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === inStr) inStr = null;
    } else if (ch === '"' || ch === "'") {
      inStr = ch;
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

function replaceKeywordsOutsideStrings(expr: string): string {
  // Tokenize string literals so keywords inside strings are never touched
  const strings: string[] = [];
  let safe = '';
  let inStr: string | null = null;
  let cur = '';
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (inStr) {
      cur += ch;
      if (ch === '\\' && i + 1 < expr.length) {
        cur += expr[++i];
      } else if (ch === inStr) {
        strings.push(cur);
        safe += `__STR_${strings.length - 1}__`;
        cur = '';
        inStr = null;
      }
    } else if (ch === '"' || ch === "'") {
      inStr = ch;
      cur = ch;
    } else {
      safe += ch;
    }
  }
  if (cur) safe += cur;

  safe = safe
    .replace(/\bna\s*\(/g, 'naFn(')
    .replace(/\band\b/g, '&&')
    .replace(/\bor\b/g, '||')
    .replace(/\bnot\b/g, '!')
    .replace(/\bna\b/g, 'NaN');

  return safe.replace(/__STR_(\d+)__/g, (_, idx) => strings[Number(idx)]);
}

function rewriteSeriesIdentifiers(expr: string, seriesSet: Set<string>): string {
  // Protect string literals and `__lag(ident,`
  const strings: string[] = [];
  let safe = '';
  let inStr: string | null = null;
  let cur = '';
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (inStr) {
      cur += ch;
      if (ch === '\\' && i + 1 < expr.length) {
        cur += expr[++i];
      } else if (ch === inStr) {
        strings.push(cur);
        safe += `__STR_${strings.length - 1}__`;
        cur = '';
        inStr = null;
      }
    } else if (ch === '"' || ch === "'") {
      inStr = ch;
      cur = ch;
    } else {
      safe += ch;
    }
  }
  if (cur) safe += cur;

  const lagProtected = safe.replace(/__lag\(([a-zA-Z_]\w*),/g, '__LAG_ARR__$1,');
  const rewritten = lagProtected
    .replace(/\b([a-zA-Z_]\w*)\b/g, (word, _g1, offset, full) => {
      if (!seriesSet.has(word)) return word;
      const prevChar = offset > 0 ? full[offset - 1] : '';
      const nextChar = full[offset + word.length] || '';
      if (prevChar === '.' || nextChar === '(') return word;
      return `${word}[i]`;
    })
    .replace(/__LAG_ARR__([a-zA-Z_]\w*),/g, '__lag($1,');

  return rewritten.replace(/__STR_(\d+)__/g, (_, idx) => strings[Number(idx)]);
}

function parsePineTfSeconds(tf: any, chartSec = 3600): number {
  if (tf === undefined || tf === null || tf === '') return chartSec;
  const s = String(tf).trim().toUpperCase();
  if (/^\d+S$/.test(s)) return Math.max(1, Number(s.slice(0, -1)));
  if (/^\d+$/.test(s)) return Math.max(60, Number(s) * 60);
  if (/^\d*D$/.test(s)) return Math.max(1, Number(s.slice(0, -1) || '1')) * 86400;
  if (/^\d*W$/.test(s)) return Math.max(1, Number(s.slice(0, -1) || '1')) * 604800;
  if (/^\d*M$/.test(s)) return Math.max(1, Number(s.slice(0, -1) || '1')) * 2592000;
  return chartSec;
}

function createBarTaProxy(
  env: Record<string, PineEnvValue>,
  taVec: Record<string, (...args: any[]) => any>,
  len: number,
  currentBarRef: { idx: number }
): Record<string, (...args: any[]) => any> {
  const staticCache = new Map<string, number[]>();
  const getSeries = (x: any): number[] | null => (Array.isArray(x) ? x : null);

  return {
    sma: (src: any, l: any) => {
      const i = currentBarRef.idx;
      const n = Math.max(1, Math.round(Number(l) || 14));
      const arr = getSeries(src);
      if (!arr) return Number(src);
      if (i < n - 1) return NaN;
      let sum = 0;
      let cnt = 0;
      for (let k = i - n + 1; k <= i; k++) {
        const v = arr[k];
        if (Number.isFinite(v)) {
          sum += v;
          cnt++;
        }
      }
      return cnt === n ? sum / n : NaN;
    },
    highest: (a: any, b?: any) => {
      const i = currentBarRef.idx;
      const arr = b === undefined ? (env.high as number[]) : getSeries(a);
      const n = Math.max(1, Math.round(Number(b === undefined ? a : b) || 20));
      if (!arr) return Number(a);
      let best = -Infinity;
      const start = Math.max(0, i - n + 1);
      for (let k = start; k <= i; k++) {
        if (arr[k] > best) best = arr[k];
      }
      return Number.isFinite(best) ? best : NaN;
    },
    lowest: (a: any, b?: any) => {
      const i = currentBarRef.idx;
      const arr = b === undefined ? (env.low as number[]) : getSeries(a);
      const n = Math.max(1, Math.round(Number(b === undefined ? a : b) || 20));
      if (!arr) return Number(a);
      let best = Infinity;
      const start = Math.max(0, i - n + 1);
      for (let k = start; k <= i; k++) {
        if (arr[k] < best) best = arr[k];
      }
      return Number.isFinite(best) ? best : NaN;
    },
    atr: (l: any) => {
      const n = Math.max(1, Math.round(Number(l) || 14));
      const key = `atr_${n}`;
      let series = staticCache.get(key);
      if (!series) {
        series = taVec.atr(n);
        staticCache.set(key, series!);
      }
      return series![currentBarRef.idx];
    },
    pivothigh: (a: any, b: any, c?: any) => {
      const l = Math.round(Number(c === undefined ? a : b) || 5);
      const r = Math.round(Number(c === undefined ? b : c) || 5);
      const src = c === undefined ? env.high : getSeries(a) || env.high;
      const key = `ph_${src === env.high ? 'h' : 's'}_${l}_${r}`;
      let series = staticCache.get(key);
      if (!series) {
        series = taPivotHigh(toNumericSeries(src, len), l, r);
        staticCache.set(key, series);
      }
      return series[currentBarRef.idx];
    },
    pivotlow: (a: any, b: any, c?: any) => {
      const l = Math.round(Number(c === undefined ? a : b) || 5);
      const r = Math.round(Number(c === undefined ? b : c) || 5);
      const src = c === undefined ? env.low : getSeries(a) || env.low;
      const key = `pl_${src === env.low ? 'l' : 's'}_${l}_${r}`;
      let series = staticCache.get(key);
      if (!series) {
        series = taPivotLow(toNumericSeries(src, len), l, r);
        staticCache.set(key, series);
      }
      return series[currentBarRef.idx];
    },
    ema: (src: any, l: any) => {
      const arr = getSeries(src);
      if (!arr) return Number(src);
      const n = Math.max(1, Math.round(Number(l) || 14));
      const key = `ema_${n}_${arr === env.close ? 'c' : 'x'}`;
      let series = staticCache.get(key);
      if (!series || arr !== env.close) {
        series = taEma(arr, n);
        if (arr === env.close) staticCache.set(key, series);
      }
      return series[currentBarRef.idx];
    },
    rsi: (src: any, l: any) => {
      const arr = getSeries(src) || (env.close as number[]);
      const n = Math.max(1, Math.round(Number(l) || 14));
      const key = `rsi_${n}`;
      let series = staticCache.get(key);
      if (!series) {
        series = taRsi(arr, n);
        staticCache.set(key, series);
      }
      return series[currentBarRef.idx];
    },
    change: (src: any, l = 1) => {
      const arr = getSeries(src);
      const i = currentBarRef.idx;
      const k = Math.max(1, Math.round(Number(l) || 1));
      return arr && i >= k ? arr[i] - arr[i - k] : NaN;
    },
    crossover: (a: any, b: any) => {
      const i = currentBarRef.idx;
      const sa = getSeries(a);
      const sb = getSeries(b);
      if (i === 0) return 0;
      const a0 = sa ? sa[i - 1] : Number(a);
      const a1 = sa ? sa[i] : Number(a);
      const b0 = sb ? sb[i - 1] : Number(b);
      const b1 = sb ? sb[i] : Number(b);
      return a0 <= b0 && a1 > b1 ? 1 : 0;
    },
    crossunder: (a: any, b: any) => {
      const i = currentBarRef.idx;
      const sa = getSeries(a);
      const sb = getSeries(b);
      if (i === 0) return 0;
      const a0 = sa ? sa[i - 1] : Number(a);
      const a1 = sa ? sa[i] : Number(a);
      const b0 = sb ? sb[i - 1] : Number(b);
      const b1 = sb ? sb[i] : Number(b);
      return a0 >= b0 && a1 < b1 ? 1 : 0;
    },
    cross: (a: any, b: any) => {
      const i = currentBarRef.idx;
      const sa = getSeries(a);
      const sb = getSeries(b);
      if (i === 0) return 0;
      const a0 = sa ? sa[i - 1] : Number(a);
      const a1 = sa ? sa[i] : Number(a);
      const b0 = sb ? sb[i - 1] : Number(b);
      const b1 = sb ? sb[i] : Number(b);
      return (a0 <= b0 && a1 > b1) || (a0 >= b0 && a1 < b1) ? 1 : 0;
    },
    sum: (src: any, l: any) => {
      const i = currentBarRef.idx;
      const arr = getSeries(src);
      const n = Math.max(1, Math.round(Number(l) || 14));
      if (!arr) return Number(src);
      if (i < n - 1) return NaN;
      let s = 0;
      for (let k = i - n + 1; k <= i; k++) if (Number.isFinite(arr[k])) s += arr[k];
      return s;
    },
    stdev: (src: any, l: any) => {
      const i = currentBarRef.idx;
      const arr = getSeries(src);
      const n = Math.max(1, Math.round(Number(l) || 20));
      if (!arr || i < n - 1) return NaN;
      let sum = 0;
      for (let k = i - n + 1; k <= i; k++) {
        if (!Number.isFinite(arr[k])) return NaN;
        sum += arr[k];
      }
      const mean = sum / n;
      let sq = 0;
      for (let k = i - n + 1; k <= i; k++) sq += (arr[k] - mean) * (arr[k] - mean);
      return Math.sqrt(sq / n);
    },
    rma: (src: any, l: any) => {
      const arr = getSeries(src);
      if (!arr) return Number(src);
      const n = Math.max(1, Math.round(Number(l) || 14));
      const key = `rma_${n}_${arr === env.close ? 'c' : 'x'}`;
      let series = staticCache.get(key);
      if (!series || arr !== env.close) {
        series = taRma(arr, n);
        if (arr === env.close) staticCache.set(key, series);
      }
      return series[currentBarRef.idx];
    },
    linreg: (src: any, l: any, off = 0) => {
      const i = currentBarRef.idx;
      const arr = getSeries(src);
      const n = Math.max(2, Math.round(Number(l) || 14));
      if (!arr || i < n - 1) return NaN;
      let sumX = 0;
      let sumY = 0;
      let sumXY = 0;
      let sumXX = 0;
      for (let j = 0; j < n; j++) {
        const y = arr[i - (n - 1 - j)];
        if (!Number.isFinite(y)) return NaN;
        sumX += j;
        sumY += y;
        sumXY += j * y;
        sumXX += j * j;
      }
      const denom = n * sumXX - sumX * sumX;
      if (denom === 0) return NaN;
      const slope = (n * sumXY - sumX * sumY) / denom;
      const intercept = (sumY - slope * sumX) / n;
      return intercept + slope * (n - 1 - Number(off || 0));
    },
    mom: (src: any, l: any) => {
      const i = currentBarRef.idx;
      const arr = getSeries(src);
      const n = Math.max(1, Math.round(Number(l) || 10));
      return arr && i >= n ? arr[i] - arr[i - n] : NaN;
    },
    roc: (src: any, l: any) => {
      const i = currentBarRef.idx;
      const arr = getSeries(src);
      const n = Math.max(1, Math.round(Number(l) || 10));
      return arr && i >= n && arr[i - n] !== 0 ? ((arr[i] - arr[i - n]) / arr[i - n]) * 100 : NaN;
    },
    barssince: (cond: any) => {
      const i = currentBarRef.idx;
      const arr = getSeries(cond);
      if (!arr) return isPineTruthy(cond) ? 0 : NaN;
      for (let k = i; k >= 0; k--) {
        if (Number.isFinite(arr[k]) && arr[k] !== 0) return i - k;
      }
      return NaN;
    },
    valuewhen: (cond: any, src: any, occ = 0) => {
      const i = currentBarRef.idx;
      const cArr = getSeries(cond);
      const sArr = getSeries(src);
      if (!cArr || !sArr) return NaN;
      let seen = 0;
      const target = Math.max(0, Math.round(Number(occ) || 0));
      for (let k = i; k >= 0; k--) {
        if (Number.isFinite(cArr[k]) && cArr[k] !== 0) {
          if (seen === target) return sArr[k];
          seen++;
        }
      }
      return NaN;
    },
    fixnan: (src: any) => {
      const i = currentBarRef.idx;
      const arr = getSeries(src);
      if (!arr) return Number(src);
      for (let k = i; k >= 0; k--) {
        if (Number.isFinite(arr[k])) return arr[k];
      }
      return NaN;
    },
    tr: () => (env.__ta_tr as number[])[currentBarRef.idx],
    obv: () => (env.__ta_obv as number[])[currentBarRef.idx],
    vwap: () => (env.__ta_vwap as number[])[currentBarRef.idx],
    rising: (src: any, l: any) => {
      const i = currentBarRef.idx;
      const arr = getSeries(src);
      const n = Math.max(1, Math.round(Number(l) || 3));
      if (!arr || i < n) return 0;
      for (let k = i - n + 1; k <= i; k++) if (!(arr[k] > arr[k - 1])) return 0;
      return 1;
    },
    falling: (src: any, l: any) => {
      const i = currentBarRef.idx;
      const arr = getSeries(src);
      const n = Math.max(1, Math.round(Number(l) || 3));
      if (!arr || i < n) return 0;
      for (let k = i - n + 1; k <= i; k++) if (!(arr[k] < arr[k - 1])) return 0;
      return 1;
    },
  };
}

const __singleBarFnCache = new Map<string, Function>();

const __pineNz = (v: any, fallback: any = 0) =>
  v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v)) ? fallback : v;
const __pineNaFn = (v: any) =>
  v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v));
const __pineLag = (arr: any, i: number, k: number) => {
  if (!Array.isArray(arr)) return arr;
  const idx = i - Math.trunc(Number(k));
  return idx >= 0 && idx < arr.length ? arr[idx] : NaN;
};
const __pineBool = (v: any) =>
  !(v === false || v === 0 || v === null || v === undefined || Number.isNaN(v));
const __pineInt = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
};
const __pineFloat = (v: any) => Number(v);
const __pineString = (v: any) =>
  v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v)) ? '' : String(v);

/**
 * Evaluates a single expression at a specific bar index `barIdx` (used for stateful `if` / `for` / `var` / `:=`).
 * Uses a compiled Function cache with direct `__env` / `__loc` access so tight `for` loops run at near-native JS speed.
 */
function evalSingleBarExpr(
  rawExpr: string,
  env: Record<string, PineEnvValue>,
  localVars: Record<string, any>,
  funcs: Record<string, UserFuncDef>,
  barIdx: number,
  len: number,
  envSeriesSet?: Set<string>,
  envKeySet?: Set<string>,
  localShapeKey?: string,
  hooks?: RuntimeHooks
): any {
  const shapeKey = localShapeKey !== undefined ? localShapeKey : Object.keys(localVars).join(',');
  // Substitute any pre-resolved `request.security(...)` calls before caching/compiling
  let effectiveRaw = rawExpr;
  if (hooks?.secExprLookup && hooks.secExprLookup.size > 0 && rawExpr.includes('request.security')) {
    for (const [callText, envKey] of hooks.secExprLookup.entries()) {
      if (effectiveRaw.includes(callText)) {
        effectiveRaw = effectiveRaw.split(callText).join(envKey);
      }
    }
  }
  const cacheKey = `${effectiveRaw}@@${shapeKey}@@${envSeriesSet ? envSeriesSet.size : len}`;
  let compiled = __singleBarFnCache.get(cacheKey);
  if (!compiled) {
    const localKeys = shapeKey ? shapeKey.split(',') : [];
    const localSet = new Set(localKeys);
    const seriesSet =
      envSeriesSet ||
      new Set(Object.keys(env).filter((k) => !localSet.has(k) && isSeriesArray(env[k], len)));
    const envKeys = envKeySet || new Set(Object.keys(env));

    const inlined = inlineUserFunctions(effectiveRaw, funcs);
    let transformed = normalizePineExprSyntax(inlined);
    // Support both literal (`close[1]`) and dynamic variable (`high[y]`) lookbacks on series!
    transformed = transformed.replace(
      /\b([a-zA-Z_]\w*)\s*\[\s*([^\[\]]+?)\s*\]/g,
      (match, ident: string, offsetExpr: string) => {
        if (localSet.has(ident) || !seriesSet.has(ident)) return match;
        return `__lag(__env.${ident}, i, ${offsetExpr})`;
      }
    );
    transformed = replaceKeywordsOutsideStrings(transformed);

    // Protect string literals & `__lag(__env.ident,`
    const strings: string[] = [];
    let safe = '';
    let inStr: string | null = null;
    let cur = '';
    for (let idx = 0; idx < transformed.length; idx++) {
      const ch = transformed[idx];
      if (inStr) {
        cur += ch;
        if (ch === '\\' && idx + 1 < transformed.length) {
          cur += transformed[++idx];
        } else if (ch === inStr) {
          strings.push(cur);
          safe += `__STR_${strings.length - 1}__`;
          cur = '';
          inStr = null;
        }
      } else if (ch === '"' || ch === "'") {
        inStr = ch;
        cur = ch;
      } else {
        safe += ch;
      }
    }
    if (cur) safe += cur;

    // Protect `ta.fn(seriesIdent` so series arguments to `ta.*` stay arrays instead of `series[i]`
    const taArgProtected = safe.replace(
      /\bta\.([a-zA-Z_]\w*)\(\s*([a-zA-Z_]\w*)(?=\s*[,)])/g,
      (m, fnName: string, firstArg: string) =>
        seriesSet.has(firstArg) ? `ta.${fnName}(__TA_SER__${firstArg}` : m
    );
    const lagProtected = taArgProtected.replace(/__lag\(__env\.([a-zA-Z_]\w*),/g, '__LAG_ENV__$1,');
    const rewritten = lagProtected
      .replace(/\b([a-zA-Z_]\w*)\b/g, (word, _g1, offset, full) => {
        const prevChar = offset > 0 ? full[offset - 1] : '';
        if (prevChar === '.') return word;
        // Skip object literal keys like `{ left: ... }`
        let nextIdx = offset + word.length;
        while (nextIdx < full.length && full[nextIdx] === ' ') nextIdx++;
        if (full[nextIdx] === ':' && full[nextIdx + 1] !== '=') {
          // Only treat as object key if preceded by `{` or `,`
          let prevIdx = offset - 1;
          while (prevIdx >= 0 && full[prevIdx] === ' ') prevIdx--;
          if (full[prevIdx] === '{' || full[prevIdx] === ',') return word;
        }
        if (localSet.has(word)) return `__loc.${word}`;
        if (!envKeys.has(word)) return word;
        if (seriesSet.has(word)) {
          const nextChar = full[offset + word.length] || '';
          if (nextChar === '(') return `__env.${word}`;
          return `__env.${word}[i]`;
        }
        return `__env.${word}`;
      })
      .replace(/__TA_SER__([a-zA-Z_]\w*)/g, '__env.$1')
      .replace(/__LAG_ENV__([a-zA-Z_]\w*),/g, '__lag(__env.$1,')
      .replace(/__STR_(\d+)__/g, (_, idx) => strings[Number(idx)]);

    compiled = new Function(
      '__env',
      '__loc',
      'i',
      'nz',
      'naFn',
      '__lag',
      'bool',
      'int',
      'float',
      'string',
      'math',
      'color',
      'array',
      'map',
      'matrix',
      'str',
      '__pineCall',
      '__timeFn',
      '__timeCloseFn',
      '__tfChange',
      `return (${rewritten});`
    );
    if (__singleBarFnCache.size > 4000) __singleBarFnCache.clear();
    __singleBarFnCache.set(cacheKey, compiled);
  }

  const __timeFn = (idx: number, tf?: string) => {
    const ts = Array.isArray(env.time) ? env.time[idx] : 0;
    const sec = parsePineTfSeconds(tf, 3600);
    const ms = Math.max(1000, sec * 1000);
    return Math.floor(ts / ms) * ms;
  };
  const __timeCloseFn = (idx: number, tf?: string) => {
    const sec = parsePineTfSeconds(tf, 3600);
    return __timeFn(idx, tf) + Math.max(1000, sec * 1000);
  };
  const __pineCall =
    hooks?.pineCall ||
    ((obj: any, method: string, ...args: any[]) => {
      if (obj === null || obj === undefined || (typeof obj === 'number' && Number.isNaN(obj))) return NaN;
      if (obj.__isPineMap && method in PINE_MAP_OBJECT) return PINE_MAP_OBJECT[method](obj, ...args);
      if (obj.__isPineMatrix && method in PINE_MATRIX_OBJECT) return PINE_MATRIX_OBJECT[method](obj, ...args);
      if (Array.isArray(obj) && method in PINE_ARRAY_OBJECT) return PINE_ARRAY_OBJECT[method](obj, ...args);
      if (typeof obj[method] === 'function') return obj[method](...args);
      throw new Error(`Unknown Pine method ".${method}()"`);
    });
  const __tfChange = hooks?.tfChange || (() => 0);

  return compiled(
    env,
    localVars,
    barIdx,
    __pineNz,
    __pineNaFn,
    __pineLag,
    __pineBool,
    __pineInt,
    __pineFloat,
    __pineString,
    PINE_MATH_OBJECT,
    PINE_COLOR_OBJECT,
    PINE_ARRAY_OBJECT,
    PINE_MAP_OBJECT,
    PINE_MATRIX_OBJECT,
    PINE_STR_OBJECT,
    __pineCall,
    __timeFn,
    __timeCloseFn,
    __tfChange
  );
}

function isPineTruthy(v: any): boolean {
  return !(v === false || v === 0 || v === null || v === undefined || Number.isNaN(v));
}

interface LoopControl {
  broken?: boolean;
  continued?: boolean;
}

interface BarExecCtx {
  envSeriesSet: Set<string>;
  envKeySet: Set<string>;
  localShapeKey: string;
  hooks?: RuntimeHooks;
}

function executeBarStatements(
  stmts: PineStatement[],
  env: Record<string, PineEnvValue>,
  localVars: Record<string, any>,
  funcs: Record<string, UserFuncDef>,
  barIdx: number,
  len: number,
  ctrl: LoopControl = {},
  isLocalScope = true,
  ctx?: BarExecCtx
): any {
  const execCtx: BarExecCtx = ctx || {
    envSeriesSet: new Set(Object.keys(env).filter((k) => isSeriesArray(env[k], len))),
    envKeySet: new Set(Object.keys(env)),
    localShapeKey: Object.keys(localVars).join(','),
  };

  const setLocal = (k: string, v: any) => {
    const isNew = !(k in localVars);
    localVars[k] = v;
    if (isNew) {
      execCtx.localShapeKey = execCtx.localShapeKey ? `${execCtx.localShapeKey},${k}` : k;
    }
  };

  const evalExpr = (expr: string, lineNum?: number) => {
    try {
      return evalSingleBarExpr(
        expr,
        env,
        localVars,
        funcs,
        barIdx,
        len,
        execCtx.envSeriesSet,
        execCtx.envKeySet,
        execCtx.localShapeKey,
        execCtx.hooks
      );
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (lineNum && !msg.startsWith('Line ')) {
        throw new Error(`Line ${lineNum}: ${msg}`);
      }
      throw err;
    }
  };

  const writeTargetVar = (varName: string, val: any, isReassign?: boolean) => {
    if (isReassign && varName in localVars) {
      localVars[varName] = val;
      return;
    }
    if (isLocalScope && !isReassign) {
      setLocal(varName, val);
      return;
    }
    if (isLocalScope && isReassign) {
      if (varName in env) {
        if (!isSeriesArray(env[varName], len)) {
          if (Array.isArray(env[varName]) || (env[varName] && typeof env[varName] === 'object')) {
            env[varName] = val;
            return;
          }
          env[varName] = new Array(len).fill(NaN);
          execCtx.envSeriesSet.add(varName);
          execCtx.envKeySet.add(varName);
        }
        env[varName][barIdx] = val;
      } else {
        setLocal(varName, val);
      }
      return;
    }
    if (!env[varName] || !isSeriesArray(env[varName], len)) {
      env[varName] = new Array(len).fill(NaN);
      execCtx.envSeriesSet.add(varName);
      execCtx.envKeySet.add(varName);
    }
    env[varName][barIdx] = val;
  };

  let lastVal: any = NaN;
  for (const st of stmts) {
    if (ctrl.broken || ctrl.continued) break;

    if (st.kind === 'break') {
      ctrl.broken = true;
      break;
    }
    if (st.kind === 'continue') {
      ctrl.continued = true;
      break;
    }

    if (st.kind === 'prop_assign' && st.propTarget && st.expr) {
      const [objName, propName] = st.propTarget.split('.');
      const targetObj = objName in localVars ? localVars[objName] : env[objName];
      const val = evalExpr(st.expr, st.lineNum);
      if (targetObj && typeof targetObj === 'object') {
        targetObj[propName] = val;
      }
      lastVal = val;
      continue;
    }

    if (st.kind === 'prop_compound' && st.propTarget && st.expr && st.op) {
      const [objName, propName] = st.propTarget.split('.');
      const targetObj = objName in localVars ? localVars[objName] : env[objName];
      const rhs = Number(evalExpr(st.expr, st.lineNum));
      if (targetObj && typeof targetObj === 'object') {
        const base = Number(targetObj[propName]) || 0;
        let next = base;
        if (st.op === '+=') next = base + rhs;
        else if (st.op === '-=') next = base - rhs;
        else if (st.op === '*=') next = base * rhs;
        else if (st.op === '/=') next = rhs !== 0 ? base / rhs : NaN;
        targetObj[propName] = next;
        lastVal = next;
      }
      continue;
    }

    if (st.kind === 'switch_assign' && st.cases) {
      const keyVal = st.switchExpr ? evalExpr(st.switchExpr, st.lineNum) : null;
      let chosen: any = NaN;
      let matched = false;
      let defaultCase: { matchExpr: string | null; resultExpr: string; body?: PineStatement[] } | null = null;
      for (const c of st.cases) {
        if (c.matchExpr === null) {
          defaultCase = c;
          continue;
        }
        const mVal = evalExpr(c.matchExpr, st.lineNum);
        if (st.switchExpr ? keyVal === mVal : isPineTruthy(mVal)) {
          chosen =
            c.body && c.body.length > 0
              ? executeBarStatements(c.body, env, localVars, funcs, barIdx, len, ctrl, true, execCtx)
              : evalExpr(c.resultExpr, st.lineNum);
          matched = true;
          break;
        }
      }
      if (!matched && defaultCase) {
        chosen =
          defaultCase.body && defaultCase.body.length > 0
            ? executeBarStatements(
                defaultCase.body,
                env,
                localVars,
                funcs,
                barIdx,
                len,
                ctrl,
                true,
                execCtx
              )
            : evalExpr(defaultCase.resultExpr, st.lineNum);
      }
      if (st.varName) {
        writeTargetVar(st.varName, chosen, st.isReassign);
      }
      lastVal = chosen;
      continue;
    }

    if (st.kind === 'while_loop' && st.whileCond) {
      let guard = 0;
      while (++guard <= 200 && isPineTruthy(evalExpr(st.whileCond, st.lineNum))) {
        const innerCtrl: LoopControl = {};
        if (st.loopBody) {
          lastVal = executeBarStatements(
            st.loopBody,
            env,
            localVars,
            funcs,
            barIdx,
            len,
            innerCtrl,
            true,
            execCtx
          );
        }
        if (innerCtrl.broken) break;
      }
      continue;
    }

    if (st.kind === 'for_in_loop' && st.loopVar && st.iterExpr) {
      const iterTarget = evalExpr(st.iterExpr, st.lineNum);
      const arr = Array.isArray(iterTarget)
        ? iterTarget
        : iterTarget?.__isPineMap
        ? Array.from(iterTarget.__data.entries())
        : null;
      const isMapEntries = Boolean(iterTarget?.__isPineMap);
      if (arr && arr.length > 0) {
        const hadPrev = st.loopVar in localVars;
        const prevVal = localVars[st.loopVar];
        const hadPrevIdx = st.loopIdxVar ? st.loopIdxVar in localVars : false;
        const prevIdxVal = st.loopIdxVar ? localVars[st.loopIdxVar] : undefined;
        const prevShapeKey = execCtx.localShapeKey;

        setLocal(st.loopVar, isMapEntries ? arr[0][1] : arr[0]);
        if (st.loopIdxVar) {
          setLocal(st.loopIdxVar, isMapEntries ? arr[0][0] : 0);
        }

        for (let idx = 0; idx < arr.length && idx < 500; idx++) {
          if (isMapEntries) {
            if (st.loopIdxVar) localVars[st.loopIdxVar] = arr[idx][0];
            localVars[st.loopVar] = arr[idx][1];
          } else {
            if (st.loopIdxVar) localVars[st.loopIdxVar] = idx;
            localVars[st.loopVar] = arr[idx];
          }
          const innerCtrl: LoopControl = {};
          if (st.loopBody) {
            lastVal = executeBarStatements(
              st.loopBody,
              env,
              localVars,
              funcs,
              barIdx,
              len,
              innerCtrl,
              true,
              execCtx
            );
          }
          if (innerCtrl.broken) break;
        }
        if (hadPrev) localVars[st.loopVar] = prevVal;
        else delete localVars[st.loopVar];
        if (st.loopIdxVar) {
          if (hadPrevIdx) localVars[st.loopIdxVar] = prevIdxVal;
          else delete localVars[st.loopIdxVar];
        }
        execCtx.localShapeKey = prevShapeKey;
      }
      continue;
    }

    if (st.kind === 'tuple_assign' && st.varNames && st.expr) {
      const val = evalExpr(st.expr, st.lineNum);
      st.varNames.forEach((vn, idx) => {
        if (vn && vn !== '_') {
          const elem = Array.isArray(val) ? val[idx] : NaN;
          writeTargetVar(vn, elem, false);
        }
      });
      lastVal = val;
      continue;
    }

    if (st.kind === 'assign' && st.varName && st.expr) {
      const val = evalExpr(st.expr, st.lineNum);
      if (Array.isArray(val) && /^\s*array\.new/.test(st.expr)) {
        (val as any).__isPineArray = true;
      }
      if (st.varName !== '__expr_stmt') {
        if (isLocalScope) {
          setLocal(st.varName, val);
        } else if (
          val &&
          typeof val === 'object' &&
          !isSeriesArray(val, len) &&
          (val.__isPineArray || val.__isPineMap || val.__isPineMatrix || val.__pineType)
        ) {
          env[st.varName] = val;
          execCtx.envKeySet.add(st.varName);
          execCtx.envSeriesSet.delete(st.varName);
        } else {
          if (!env[st.varName] || !isSeriesArray(env[st.varName], len)) {
            env[st.varName] = new Array(len).fill(NaN);
            execCtx.envSeriesSet.add(st.varName);
            execCtx.envKeySet.add(st.varName);
          }
          env[st.varName][barIdx] = val;
        }
      }
      lastVal = val;
    } else if (st.kind === 'reassign' && st.varName && st.expr) {
      const val = evalExpr(st.expr, st.lineNum);
      if (st.varName in localVars) {
        localVars[st.varName] = val;
      } else if (
        val &&
        typeof val === 'object' &&
        !isSeriesArray(val, len) &&
        (val.__isPineArray || val.__isPineMap || val.__isPineMatrix || val.__pineType)
      ) {
        env[st.varName] = val;
        execCtx.envKeySet.add(st.varName);
        execCtx.envSeriesSet.delete(st.varName);
      } else {
        if (!env[st.varName] || !isSeriesArray(env[st.varName], len)) {
          env[st.varName] = new Array(len).fill(NaN);
          execCtx.envSeriesSet.add(st.varName);
          execCtx.envKeySet.add(st.varName);
        }
        env[st.varName][barIdx] = val;
      }
      lastVal = val;
    } else if (st.kind === 'compound_assign' && st.varName && st.expr && st.op) {
      const rhs = Number(evalExpr(st.expr, st.lineNum));
      const prev =
        st.varName in localVars
          ? Number(localVars[st.varName])
          : isSeriesArray(env[st.varName], len)
          ? Number(env[st.varName][barIdx] ?? (barIdx > 0 ? env[st.varName][barIdx - 1] : 0))
          : 0;
      const base = Number.isFinite(prev) ? prev : 0;
      let next = base;
      if (st.op === '+=') next = base + rhs;
      else if (st.op === '-=') next = base - rhs;
      else if (st.op === '*=') next = base * rhs;
      else if (st.op === '/=') next = rhs !== 0 ? base / rhs : NaN;
      if (st.varName in localVars) {
        localVars[st.varName] = next;
      } else {
        if (!env[st.varName] || !isSeriesArray(env[st.varName], len)) {
          env[st.varName] = new Array(len).fill(NaN);
          execCtx.envSeriesSet.add(st.varName);
          execCtx.envKeySet.add(st.varName);
        }
        env[st.varName][barIdx] = next;
      }
      lastVal = next;
    } else if (st.kind === 'if_block' && st.branches) {
      for (const br of st.branches) {
        const condOk = br.cond === null ? true : isPineTruthy(evalExpr(br.cond, st.lineNum));
        if (condOk) {
          const val = executeBarStatements(
            br.body,
            env,
            localVars,
            funcs,
            barIdx,
            len,
            ctrl,
            isLocalScope,
            execCtx
          );
          lastVal =
            br.resultExpr && br.body.length === 0
              ? evalExpr(br.resultExpr, st.lineNum)
              : val;
          if (st.varName) {
            writeTargetVar(st.varName, lastVal, st.isReassign);
          }
          break;
        }
      }
    } else if (st.kind === 'for_loop' && st.loopVar && st.loopStart && st.loopEnd) {
      const start = Math.trunc(Number(evalExpr(st.loopStart, st.lineNum)));
      const end = Math.trunc(Number(evalExpr(st.loopEnd, st.lineNum)));
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (start === 0 && end < 0) continue;
      if (end === 0 && start < 0) continue;

      const step = Math.max(
        1,
        Math.abs(Math.trunc(Number(evalExpr(st.loopStep || '1', st.lineNum))))
      );
      const dir = end >= start ? 1 : -1;
      let iterGuard = 0;
      const hadPrevLoopVar = st.loopVar in localVars;
      const prevLoopVarVal = localVars[st.loopVar];
      const prevShapeKey = execCtx.localShapeKey;

      setLocal(st.loopVar, start);

      for (let k = start; dir > 0 ? k <= end : k >= end; k += dir * step) {
        if (++iterGuard > 500) break;
        localVars[st.loopVar] = k;
        const innerCtrl: LoopControl = {};
        if (st.loopBody) {
          lastVal = executeBarStatements(
            st.loopBody,
            env,
            localVars,
            funcs,
            barIdx,
            len,
            innerCtrl,
            true,
            execCtx
          );
        }
        if (innerCtrl.broken) break;
      }

      if (hadPrevLoopVar) {
        localVars[st.loopVar] = prevLoopVarVal;
      } else {
        delete localVars[st.loopVar];
        execCtx.localShapeKey = prevShapeKey;
      }
    }
  }
  return lastVal;
}

function applyPlotOffset<T>(arr: T[], offset: number, fillValue: T): T[] {
  if (!offset) return arr;
  const len = arr.length;
  const out = new Array<T>(len).fill(fillValue);
  if (offset > 0) {
    for (let i = offset; i < len; i++) {
      out[i] = arr[i - offset];
    }
  } else {
    const shift = -offset;
    for (let i = 0; i < len - shift; i++) {
      out[i] = arr[i + shift];
    }
  }
  return out;
}

function evalColorSeries(
  colorExpr: string,
  fallbackColor: string | null,
  env: Record<string, PineEnvValue>,
  ta: Record<string, (...args: any[]) => any>,
  funcs: Record<string, UserFuncDef>,
  len: number,
  hooks?: RuntimeHooks
): Array<string | null> {
  if (!colorExpr || colorExpr === 'na') return new Array(len).fill(null);
  try {
    const raw = evalPineExprVector(colorExpr, env, ta, funcs, len, false, hooks);
    if (Array.isArray(raw)) {
      return raw.map((v) => {
        if (v === null || v === undefined || v === 'na' || (typeof v === 'number' && !Number.isFinite(v))) {
          return null;
        }
        return String(v);
      });
    }
  } catch {
    // Fallback to static resolved color
  }
  const resolved = fallbackColor ?? resolvePineColorValue(colorExpr, '#2962ff');
  return new Array(len).fill(resolved);
}

export interface PinePlotCandleBar {
  kind: 'candle' | 'bar';
  open: number;
  high: number;
  low: number;
  close: number;
  color: string;
  wickColor: string;
  borderColor: string;
}

export interface PineIndicatorRow {
  [key: string]: any;
  __plotColors?: Record<string, string | null>;
  __fillColors?: Record<string, string | null>;
  __shapeHits?: Record<string, { hit: boolean; color: string }>;
  __plotCandles?: Record<string, PinePlotCandleBar>;
  __bgColor?: string | null;
  __barColor?: string | null;
  __boxes?: PineBoxRenderItem[];
  __labels?: PineLabelRenderItem[];
  __lines?: PineLineRenderItem[];
  __linefills?: PineLinefillRenderItem[];
  __polylines?: PinePolylineRenderItem[];
  __tables?: PineTableRenderItem[];
}

function collectSecurityCallsInStmts(stmts: PineStatement[], out: Set<string>) {
  const scanExpr = (expr?: string) => {
    if (!expr || !expr.includes('request.security')) return;
    let remaining = expr;
    let guard = 0;
    while (guard < 20) {
      guard++;
      const found = findRequestSecurityCall(remaining);
      if (!found) break;
      out.add(found.fullText);
      remaining = remaining.slice(found.end);
    }
  };
  for (const st of stmts) {
    scanExpr(st.expr);
    scanExpr(st.switchExpr);
    scanExpr(st.iterExpr);
    scanExpr(st.whileCond);
    scanExpr(st.loopStart);
    scanExpr(st.loopEnd);
    scanExpr(st.loopStep);
    scanExpr(st.funcBody);
    if (st.branches) {
      for (const br of st.branches) {
        if (br.cond) scanExpr(br.cond);
        scanExpr(br.resultExpr);
        collectSecurityCallsInStmts(br.body, out);
      }
    }
    if (st.cases) {
      for (const c of st.cases) {
        if (c.matchExpr) scanExpr(c.matchExpr);
        scanExpr(c.resultExpr);
        if (c.body) collectSecurityCallsInStmts(c.body, out);
      }
    }
    if (st.loopBody) collectSecurityCallsInStmts(st.loopBody, out);
    if (st.funcStmts) collectSecurityCallsInStmts(st.funcStmts, out);
  }
}

function statementUsesStatefulFeature(st: PineStatement): boolean {
  if (
    st.kind === 'if_block' ||
    st.kind === 'for_loop' ||
    st.kind === 'for_in_loop' ||
    st.kind === 'while_loop' ||
    st.kind === 'compound_assign' ||
    st.kind === 'prop_assign' ||
    st.kind === 'prop_compound' ||
    st.isReassign ||
    (st.kind === 'assign' && st.varName === '__expr_stmt')
  ) {
    return true;
  }
  if (
    st.expr &&
    /\b(?:line|box|label|table|linefill|polyline|map|matrix)\.new\b|\b(?:line|box|label|table|linefill|polyline)\.[a-z_]+\s*\(|\b[A-Z]\w*\.new\s*\(/.test(
      st.expr
    )
  ) {
    return true;
  }
  return false;
}

export function executeParsedPine(
  parsed: ParsedPineScript,
  dataList: KLineData[],
  calcParams: PineParamValue[],
  context?: PineExecContext
): PineIndicatorRow[] {
  const len = dataList.length;
  if (len === 0) return [];

  const open = dataList.map((d) => d.open);
  const high = dataList.map((d) => d.high);
  const low = dataList.map((d) => d.low);
  const close = dataList.map((d) => d.close);
  const volume = dataList.map((d) => d.volume ?? 1);
  const timestamps = dataList.map((d) => d.timestamp);
  const hl2 = dataList.map((d) => (d.high + d.low) / 2);
  const hlc3 = dataList.map((d) => (d.high + d.low + d.close) / 3);
  const ohlc4 = dataList.map((d) => (d.open + d.high + d.low + d.close) / 4);
  const barIndex = Array.from({ length: len }, (_, i) => i);

  const detectedChartSec =
    len >= 2
      ? Math.max(1, Math.round((timestamps[len - 1] - timestamps[len - 2]) / 1000))
      : 3600;
  const detectedTfStr =
    detectedChartSec >= 86400
      ? 'D'
      : detectedChartSec >= 60
      ? String(Math.round(detectedChartSec / 60))
      : `${detectedChartSec}S`;

  const ta = buildTaRegistry(high, low, close, hlc3, volume, timestamps, len);
  const activeBoxes = new Set<PineBoxRenderItem>();
  const activeLabels = new Set<PineLabelRenderItem>();
  const activeLines = new Set<PineLineRenderItem>();
  const activeLinefills = new Set<PineLinefillRenderItem>();
  const activePolylines = new Set<PinePolylineRenderItem>();
  const activeTables = new Set<PineTableRenderItem>();
  const currentBarRef = { idx: 0 };

  const normalizeColorOrNull = (c: any, fallback: string | null = null): string | null => {
    if (c === undefined) return fallback;
    if (c === null || c === 'na' || (typeof c === 'number' && Number.isNaN(c))) return null;
    const s = String(c);
    return s && s !== 'na' ? s : null;
  };

  const boxNamespace: Record<string, any> = Object.assign(
    (x: any) => (x === 'na' || Number.isNaN(x) ? null : x),
    {
      new: (...args: any[]): PineBoxRenderItem => {
        let left = currentBarRef.idx;
        let top = NaN;
        let right = currentBarRef.idx + 1;
        let bottom = NaN;
        let borderColor: string | null = '#2962ff';
        let borderWidth = 1;
        let extend: 'none' | 'left' | 'right' | 'both' = 'none';
        let xloc: 'bar_index' | 'bar_time' = 'bar_index';
        let bgcolor: string | null = 'rgba(41, 98, 255, 0.15)';
        let text = '';
        let textColor = '#d1d4dc';
        let forceOverlay = false;

        if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
          const o = args[0];
          const tl = o.top_left;
          const br = o.bottom_right;
          left = Number(tl ? tl.index ?? tl.time : o.left ?? o.__p0 ?? left);
          top = Number(tl ? tl.price : o.top ?? o.__p1 ?? NaN);
          right = Number(br ? br.index ?? br.time : o.right ?? o.__p2 ?? left + 1);
          bottom = Number(br ? br.price : o.bottom ?? o.__p3 ?? NaN);
          borderColor = normalizeColorOrNull(o.border_color ?? o.__p4, borderColor);
          borderWidth = o.border_width !== undefined ? Number(o.border_width) : Number(o.__p5 ?? 1);
          extend = (o.extend ?? o.__p7 ?? 'none') as any;
          xloc = (o.xloc ?? o.__p8 ?? 'bar_index') as any;
          bgcolor = normalizeColorOrNull(o.bgcolor ?? o.__p9, borderColor);
          text = o.text !== undefined ? String(o.text) : '';
          textColor = o.text_color ? String(o.text_color) : '#d1d4dc';
          forceOverlay = Boolean(o.force_overlay);
        } else {
          left = Number(args[0] ?? left);
          top = Number(args[1] ?? NaN);
          right = Number(args[2] ?? left + 1);
          bottom = Number(args[3] ?? NaN);
          borderColor = normalizeColorOrNull(args[4], borderColor);
          borderWidth = args[5] !== undefined ? Number(args[5]) : 1;
          extend = (args[7] ?? 'none') as any;
          xloc = (args[8] ?? 'bar_index') as any;
          bgcolor = normalizeColorOrNull(args[9], borderColor);
        }

        const item: PineBoxRenderItem = {
          __pineType: 'box',
          left,
          right,
          top,
          bottom,
          bgcolor,
          borderColor,
          borderWidth: Number.isFinite(borderWidth) ? borderWidth : 1,
          extend,
          xloc,
          text,
          textColor,
          forceOverlay,
        };
        if (Number.isFinite(item.top) && Number.isFinite(item.bottom)) {
          activeBoxes.add(item);
        }
        return item;
      },
      delete: (b: any) => {
        if (b && activeBoxes.has(b)) activeBoxes.delete(b);
      },
      copy: (b: any): PineBoxRenderItem | null => {
        if (!b) return null;
        const cloned: PineBoxRenderItem = { ...b, __pineType: 'box' };
        activeBoxes.add(cloned);
        return cloned;
      },
      set_top: (b: any, v: number) => {
        if (b) b.top = Number(v);
      },
      set_bottom: (b: any, v: number) => {
        if (b) b.bottom = Number(v);
      },
      set_left: (b: any, v: number) => {
        if (b) b.left = Number(v);
      },
      set_right: (b: any, v: number) => {
        if (b) b.right = Number(v);
      },
      set_lefttop: (b: any, left: number, top: number) => {
        if (b) {
          b.left = Number(left);
          b.top = Number(top);
        }
      },
      set_rightbottom: (b: any, right: number, bottom: number) => {
        if (b) {
          b.right = Number(right);
          b.bottom = Number(bottom);
        }
      },
      set_extend: (b: any, ext: any) => {
        if (b) b.extend = ext;
      },
      set_bgcolor: (b: any, c: string) => {
        if (b) b.bgcolor = normalizeColorOrNull(c, null);
      },
      set_border_color: (b: any, c: string) => {
        if (b) b.borderColor = normalizeColorOrNull(c, null);
      },
      set_border_width: (b: any, w: number) => {
        if (b) b.borderWidth = Number(w);
      },
      get_left: (b: any) => (b ? b.left : NaN),
      get_right: (b: any) => (b ? b.right : NaN),
      get_top: (b: any) => (b ? b.top : NaN),
      get_bottom: (b: any) => (b ? b.bottom : NaN),
      set_text: (b: any, txt: string) => {
        if (b) b.text = String(txt ?? '');
      },
      set_text_color: (b: any, c: string) => {
        if (b && c) b.textColor = String(c);
      },
    }
  );
  Object.defineProperty(boxNamespace, 'all', {
    get: () => {
      const a = Array.from(activeBoxes);
      (a as any).__isPineArray = true;
      return a;
    },
  });

  const lineNamespace: Record<string, any> = Object.assign(
    (x: any) => (x === 'na' || Number.isNaN(x) ? null : x),
    {
      style_solid: 'solid',
      style_dashed: 'dashed',
      style_dotted: 'dotted',
      style_arrow_left: 'arrow_left',
      style_arrow_right: 'arrow_right',
      style_arrow_both: 'arrow_both',
      new: (...args: any[]): PineLineRenderItem => {
        let x1 = currentBarRef.idx;
        let y1 = NaN;
        let x2 = currentBarRef.idx;
        let y2 = NaN;
        let xloc: 'bar_index' | 'bar_time' = 'bar_index';
        let extend: 'none' | 'left' | 'right' | 'both' = 'none';
        let color: string | null = '#2962ff';
        let style: PineLineRenderItem['style'] = 'solid';
        let width = 1;
        let forceOverlay = false;

        if (
          args.length === 1 &&
          args[0] &&
          typeof args[0] === 'object' &&
          !Array.isArray(args[0]) &&
          !('price' in args[0])
        ) {
          const o = args[0];
          const p1 = o.first_point ?? (o.__p0 && typeof o.__p0 === 'object' ? o.__p0 : null);
          const p2 = o.second_point ?? (o.__p1 && typeof o.__p1 === 'object' ? o.__p1 : null);
          if (p1 && p2) {
            x1 = Number(p1.index ?? p1.time ?? x1);
            y1 = Number(p1.price ?? NaN);
            x2 = Number(p2.index ?? p2.time ?? x2);
            y2 = Number(p2.price ?? NaN);
            xloc = (o.xloc ?? o.__p2 ?? (p1.time !== undefined && p1.index === undefined ? 'bar_time' : 'bar_index')) as any;
            extend = (o.extend ?? o.__p3 ?? 'none') as any;
            color = normalizeColorOrNull(o.color ?? o.__p4, color);
            style = (o.style ?? o.__p5 ?? 'solid') as any;
            width = o.width !== undefined ? Number(o.width) : Number(o.__p6 ?? 1);
          } else {
            x1 = Number(o.x1 ?? o.__p0 ?? x1);
            y1 = Number(o.y1 ?? o.__p1 ?? NaN);
            x2 = Number(o.x2 ?? o.__p2 ?? x1);
            y2 = Number(o.y2 ?? o.__p3 ?? y1);
            xloc = (o.xloc ?? o.__p4 ?? 'bar_index') as any;
            extend = (o.extend ?? o.__p5 ?? 'none') as any;
            color = normalizeColorOrNull(o.color ?? o.__p6, color);
            style = (o.style ?? o.__p7 ?? 'solid') as any;
            width = o.width !== undefined ? Number(o.width) : Number(o.__p8 ?? 1);
          }
          forceOverlay = Boolean(o.force_overlay);
        } else if (args[0] && typeof args[0] === 'object' && 'price' in args[0]) {
          // chart.point overload: line.new(p1, p2, xloc, extend, color, style, width)
          const p1 = args[0];
          const p2 = args[1] || p1;
          x1 = Number(p1.index ?? p1.time ?? x1);
          y1 = Number(p1.price ?? NaN);
          x2 = Number(p2.index ?? p2.time ?? x2);
          y2 = Number(p2.price ?? NaN);
          xloc = (args[2] ?? (p1.time !== undefined && p1.index === undefined ? 'bar_time' : 'bar_index')) as any;
          extend = (args[3] ?? 'none') as any;
          color = normalizeColorOrNull(args[4], color);
          style = (args[5] ?? 'solid') as any;
          width = args[6] !== undefined ? Number(args[6]) : 1;
        } else {
          x1 = Number(args[0] ?? x1);
          y1 = Number(args[1] ?? NaN);
          x2 = Number(args[2] ?? x1);
          y2 = Number(args[3] ?? y1);
          xloc = (args[4] ?? 'bar_index') as any;
          extend = (args[5] ?? 'none') as any;
          color = normalizeColorOrNull(args[6], color);
          style = (args[7] ?? 'solid') as any;
          width = args[8] !== undefined ? Number(args[8]) : 1;
        }

        const item: PineLineRenderItem = {
          __pineType: 'line',
          x1,
          y1,
          x2,
          y2,
          xloc,
          extend,
          color,
          style,
          width: Number.isFinite(width) && width > 0 ? width : 1,
          forceOverlay,
        };
        if (Number.isFinite(item.y1) && Number.isFinite(item.y2)) {
          activeLines.add(item);
        }
        return item;
      },
      delete: (ln: any) => {
        if (!ln) return;
        activeLines.delete(ln);
        for (const lf of Array.from(activeLinefills)) {
          if (lf.line1 === ln || lf.line2 === ln) activeLinefills.delete(lf);
        }
      },
      copy: (ln: any): PineLineRenderItem | null => {
        if (!ln) return null;
        const cloned: PineLineRenderItem = { ...ln, __pineType: 'line' };
        activeLines.add(cloned);
        return cloned;
      },
      set_x1: (ln: any, v: number) => {
        if (ln) ln.x1 = Number(v);
      },
      set_y1: (ln: any, v: number) => {
        if (ln) ln.y1 = Number(v);
      },
      set_x2: (ln: any, v: number) => {
        if (ln) ln.x2 = Number(v);
      },
      set_y2: (ln: any, v: number) => {
        if (ln) ln.y2 = Number(v);
      },
      set_xy1: (ln: any, x: number, y: number) => {
        if (ln) {
          ln.x1 = Number(x);
          ln.y1 = Number(y);
        }
      },
      set_xy2: (ln: any, x: number, y: number) => {
        if (ln) {
          ln.x2 = Number(x);
          ln.y2 = Number(y);
        }
      },
      set_xloc: (ln: any, x1: number, x2: number, xloc: any) => {
        if (ln) {
          ln.x1 = Number(x1);
          ln.x2 = Number(x2);
          ln.xloc = xloc;
        }
      },
      set_extend: (ln: any, ext: any) => {
        if (ln) ln.extend = ext;
      },
      set_color: (ln: any, c: any) => {
        if (ln) ln.color = normalizeColorOrNull(c, null);
      },
      set_style: (ln: any, s: any) => {
        if (ln && s) ln.style = s;
      },
      set_width: (ln: any, w: number) => {
        if (ln && Number.isFinite(Number(w))) ln.width = Math.max(1, Number(w));
      },
      get_x1: (ln: any) => (ln ? ln.x1 : NaN),
      get_y1: (ln: any) => (ln ? ln.y1 : NaN),
      get_x2: (ln: any) => (ln ? ln.x2 : NaN),
      get_y2: (ln: any) => (ln ? ln.y2 : NaN),
      get_price: (ln: any, x: number) => {
        if (!ln || !Number.isFinite(ln.y1) || !Number.isFinite(ln.y2)) return NaN;
        if (ln.x2 === ln.x1) return ln.y1;
        return ln.y1 + ((ln.y2 - ln.y1) * (Number(x) - ln.x1)) / (ln.x2 - ln.x1);
      },
    }
  );
  Object.defineProperty(lineNamespace, 'all', {
    get: () => {
      const a = Array.from(activeLines);
      (a as any).__isPineArray = true;
      return a;
    },
  });

  const linefillNamespace: Record<string, any> = Object.assign(
    (x: any) => (x === 'na' || Number.isNaN(x) ? null : x),
    {
      new: (...args: any[]): PineLinefillRenderItem => {
        let line1: any;
        let line2: any;
        let color: string | null = 'rgba(41, 98, 255, 0.18)';
        if (args.length === 1 && args[0] && typeof args[0] === 'object' && !args[0].__pineType) {
          const o = args[0];
          line1 = o.line1 ?? o.__p0;
          line2 = o.line2 ?? o.__p1;
          color = normalizeColorOrNull(o.color ?? o.__p2, color);
        } else {
          line1 = args[0];
          line2 = args[1];
          color = normalizeColorOrNull(args[2], color);
        }
        const item: PineLinefillRenderItem = {
          __pineType: 'linefill',
          line1,
          line2,
          color,
        };
        if (line1 && line2) activeLinefills.add(item);
        return item;
      },
      delete: (lf: any) => {
        if (lf) activeLinefills.delete(lf);
      },
      set_color: (lf: any, c: any) => {
        if (lf) lf.color = normalizeColorOrNull(c, null);
      },
      get_line1: (lf: any) => lf?.line1 ?? null,
      get_line2: (lf: any) => lf?.line2 ?? null,
    }
  );
  Object.defineProperty(linefillNamespace, 'all', {
    get: () => {
      const a = Array.from(activeLinefills);
      (a as any).__isPineArray = true;
      return a;
    },
  });

  const polylineNamespace: Record<string, any> = Object.assign(
    (x: any) => (x === 'na' || Number.isNaN(x) ? null : x),
    {
      new: (...args: any[]): PinePolylineRenderItem => {
        let rawPoints: any[] = [];
        let curved = false;
        let closed = false;
        let xloc: 'bar_index' | 'bar_time' = 'bar_index';
        let lineColor: string | null = '#2962ff';
        let fillColor: string | null = null;
        let lineStyle: 'solid' | 'dashed' | 'dotted' = 'solid';
        let lineWidth = 1;
        let forceOverlay = false;

        if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
          const o = args[0];
          rawPoints = Array.isArray(o.points ?? o.__p0) ? o.points ?? o.__p0 : [];
          curved = Boolean(o.curved ?? o.__p1 ?? false);
          closed = Boolean(o.closed ?? o.__p2 ?? false);
          xloc = (o.xloc ?? o.__p3 ?? 'bar_index') as any;
          lineColor = normalizeColorOrNull(o.line_color ?? o.__p4, lineColor);
          fillColor = normalizeColorOrNull(o.fill_color ?? o.__p5, null);
          lineStyle = (o.line_style ?? o.__p6 ?? 'solid') as any;
          lineWidth = o.line_width !== undefined ? Number(o.line_width) : Number(o.__p7 ?? 1);
          forceOverlay = Boolean(o.force_overlay);
        } else {
          rawPoints = Array.isArray(args[0]) ? args[0] : [];
          curved = Boolean(args[1] ?? false);
          closed = Boolean(args[2] ?? false);
          xloc = (args[3] ?? 'bar_index') as any;
          lineColor = normalizeColorOrNull(args[4], lineColor);
          fillColor = normalizeColorOrNull(args[5], null);
          lineStyle = (args[6] ?? 'solid') as any;
          lineWidth = args[7] !== undefined ? Number(args[7]) : 1;
        }

        const clonedPts = rawPoints
          .filter((pt) => pt && typeof pt === 'object' && Number.isFinite(Number(pt.price)))
          .map((pt) => ({
            index: pt.index !== undefined ? Number(pt.index) : undefined,
            time: pt.time !== undefined ? Number(pt.time) : undefined,
            price: Number(pt.price),
          }));

        const item: PinePolylineRenderItem = {
          __pineType: 'polyline',
          points: clonedPts,
          curved,
          closed,
          xloc,
          lineColor,
          fillColor,
          lineStyle,
          lineWidth: Number.isFinite(lineWidth) && lineWidth > 0 ? lineWidth : 1,
          forceOverlay,
        };
        if (clonedPts.length >= 2) activePolylines.add(item);
        return item;
      },
      delete: (pl: any) => {
        if (pl) activePolylines.delete(pl);
      },
    }
  );
  Object.defineProperty(polylineNamespace, 'all', {
    get: () => {
      const a = Array.from(activePolylines);
      (a as any).__isPineArray = true;
      return a;
    },
  });

  const labelNamespace: Record<string, any> = Object.assign(
    (x: any) => (x === 'na' || Number.isNaN(x) ? null : x),
    {
      style_none: 'none',
      style_label_up: 'labelup',
      style_label_down: 'labeldown',
      style_label_left: 'label_left',
      style_label_right: 'label_right',
      style_label_center: 'label_center',
      style_circle: 'circle',
      style_diamond: 'diamond',
      style_triangleup: 'triangleup',
      style_triangledown: 'triangledown',
      style_xcross: 'xcross',
      style_cross: 'cross',
      style_square: 'square',
      style_flag: 'flag',
      new: (...args: any[]): PineLabelRenderItem => {
        let x = currentBarRef.idx;
        let y = NaN;
        let text = '';
        let xloc: 'bar_index' | 'bar_time' = 'bar_index';
        let yloc: 'price' | 'abovebar' | 'belowbar' = 'price';
        let color: string | null = '#2962ff';
        let style = 'labeldown';
        let textColor = '#ffffff';
        let size: 'tiny' | 'small' | 'normal' | 'large' = 'small';
        let tooltip = '';
        let forceOverlay = false;

        if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
          const o = args[0];
          const pt = o.point;
          x = Number(pt ? pt.index ?? pt.time : o.x ?? o.__p0 ?? x);
          y = Number(pt ? pt.price : o.y ?? o.__p1 ?? NaN);
          text = o.text !== undefined ? String(o.text) : o.__p2 !== undefined ? String(o.__p2) : '';
          xloc = (o.xloc ?? o.__p3 ?? 'bar_index') as any;
          yloc = (o.yloc ?? o.__p4 ?? 'price') as any;
          color = normalizeColorOrNull(o.color ?? o.__p5, o.style === 'none' ? null : color);
          style = String(o.style ?? o.__p6 ?? (o.color === 'na' ? 'none' : 'labeldown'));
          textColor = normalizeColorOrNull(o.textcolor ?? o.__p7, '#ffffff') || '#ffffff';
          size = (o.size ?? o.__p8 ?? 'small') as any;
          tooltip = o.tooltip !== undefined ? String(o.tooltip) : '';
          forceOverlay = Boolean(o.force_overlay);
        } else {
          x = Number(args[0] ?? x);
          y = Number(args[1] ?? NaN);
          text = args[2] !== undefined ? String(args[2]) : '';
          xloc = (args[3] ?? 'bar_index') as any;
          yloc = (args[4] ?? 'price') as any;
          color = normalizeColorOrNull(args[5], color);
          style = String(args[6] ?? 'labeldown');
          textColor = normalizeColorOrNull(args[7], '#ffffff') || '#ffffff';
          size = (args[8] ?? 'small') as any;
          tooltip = args[10] !== undefined ? String(args[10]) : '';
        }

        const item: PineLabelRenderItem = {
          __pineType: 'label',
          x,
          y,
          text,
          xloc,
          yloc,
          color,
          textColor,
          style,
          size,
          tooltip,
          forceOverlay,
        };
        if (Number.isFinite(item.y) || item.yloc === 'abovebar' || item.yloc === 'belowbar') {
          activeLabels.add(item);
        }
        return item;
      },
      delete: (lb: any) => {
        if (lb && activeLabels.has(lb)) activeLabels.delete(lb);
      },
      copy: (lb: any): PineLabelRenderItem | null => {
        if (!lb) return null;
        const cloned: PineLabelRenderItem = { ...lb, __pineType: 'label' };
        activeLabels.add(cloned);
        return cloned;
      },
      get_x: (lb: any) => (lb ? lb.x ?? NaN : NaN),
      get_y: (lb: any) => (lb ? lb.y ?? NaN : NaN),
      get_text: (lb: any) => (lb ? String(lb.text ?? '') : ''),
      set_x: (lb: any, x: number) => {
        if (lb) lb.x = Number(x);
      },
      set_y: (lb: any, y: number) => {
        if (lb) lb.y = Number(y);
      },
      set_xy: (lb: any, x: number, y: number) => {
        if (lb) {
          lb.x = Number(x);
          lb.y = Number(y);
        }
      },
      set_xloc: (lb: any, x: number, xloc: any) => {
        if (lb) {
          lb.x = Number(x);
          lb.xloc = xloc;
        }
      },
      set_yloc: (lb: any, yloc: any) => {
        if (lb) lb.yloc = yloc;
      },
      set_text: (lb: any, t: string) => {
        if (lb) lb.text = String(t ?? '');
      },
      set_tooltip: (lb: any, tip: string) => {
        if (lb) lb.tooltip = String(tip ?? '');
      },
      set_color: (lb: any, c: any) => {
        if (lb) lb.color = normalizeColorOrNull(c, null);
      },
      set_textcolor: (lb: any, c: any) => {
        if (lb) lb.textColor = normalizeColorOrNull(c, '#ffffff') || '#ffffff';
      },
      set_style: (lb: any, s: any) => {
        if (lb && s) lb.style = String(s);
      },
      set_size: (lb: any, s: any) => {
        if (lb && s) lb.size = s;
      },
    }
  );
  Object.defineProperty(labelNamespace, 'all', {
    get: () => {
      const a = Array.from(activeLabels);
      (a as any).__isPineArray = true;
      return a;
    },
  });

  const ensureTableCell = (tbl: PineTableRenderItem, col: number, row: number): PineTableCell => {
    const key = `${row}_${col}`;
    if (!tbl.cells[key]) {
      tbl.cells[key] = {
        row,
        col,
        text: '',
        bgcolor: null,
        textColor: '#d1d4dc',
        textSize: 'small',
        textHalign: 'center',
        textValign: 'center',
      };
    }
    if (col + 1 > tbl.columns) tbl.columns = col + 1;
    if (row + 1 > tbl.rows) tbl.rows = row + 1;
    return tbl.cells[key];
  };

  const tableNamespace: Record<string, any> = Object.assign(
    (x: any) => (x === 'na' || Number.isNaN(x) ? null : x),
    {
      new: (...args: any[]): PineTableRenderItem => {
        let position = 'top_right';
        let columns = 1;
        let rowsCount = 1;
        let bgcolor: string | null = 'rgba(19, 23, 34, 0.85)';
        let frameColor: string | null = '#2a2e39';
        let frameWidth = 1;
        let borderColor: string | null = '#2a2e39';
        let borderWidth = 1;
        let forceOverlay = false;

        if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
          const o = args[0];
          position = String(o.position ?? o.__p0 ?? position);
          columns = Math.max(1, Math.trunc(Number(o.columns ?? o.__p1 ?? 1) || 1));
          rowsCount = Math.max(1, Math.trunc(Number(o.rows ?? o.__p2 ?? 1) || 1));
          bgcolor = normalizeColorOrNull(o.bgcolor ?? o.__p3, bgcolor);
          frameColor = normalizeColorOrNull(o.frame_color ?? o.__p4, frameColor);
          frameWidth = o.frame_width !== undefined ? Number(o.frame_width) : Number(o.__p5 ?? 1);
          borderColor = normalizeColorOrNull(o.border_color ?? o.__p6, borderColor);
          borderWidth = o.border_width !== undefined ? Number(o.border_width) : Number(o.__p7 ?? 1);
          forceOverlay = Boolean(o.force_overlay);
        } else {
          position = String(args[0] ?? position);
          columns = Math.max(1, Math.trunc(Number(args[1] ?? 1) || 1));
          rowsCount = Math.max(1, Math.trunc(Number(args[2] ?? 1) || 1));
          bgcolor = normalizeColorOrNull(args[3], bgcolor);
          frameColor = normalizeColorOrNull(args[4], frameColor);
          frameWidth = args[5] !== undefined ? Number(args[5]) : 1;
          borderColor = normalizeColorOrNull(args[6], borderColor);
          borderWidth = args[7] !== undefined ? Number(args[7]) : 1;
        }

        const item: PineTableRenderItem = {
          __pineType: 'table',
          position,
          columns,
          rows: rowsCount,
          bgcolor,
          frameColor,
          frameWidth: Number.isFinite(frameWidth) ? frameWidth : 1,
          borderColor,
          borderWidth: Number.isFinite(borderWidth) ? borderWidth : 1,
          cells: {},
          forceOverlay,
        };
        activeTables.add(item);
        return item;
      },
      cell: (...args: any[]) => {
        let tbl: PineTableRenderItem | null = null;
        let col = 0;
        let row = 0;
        let text = '';
        let textColor = '#d1d4dc';
        let textHalign: 'left' | 'center' | 'right' = 'center';
        let textValign: 'top' | 'center' | 'bottom' = 'center';
        let textSize: 'tiny' | 'small' | 'normal' | 'large' = 'small';
        let bgcolor: string | null = null;

        if (args.length === 1 && args[0] && typeof args[0] === 'object' && !args[0].__pineType) {
          // Static named call: table.cell(table_id=t, column=0, row=0, text="Hi", ...)
          const o = args[0];
          tbl = o.table_id ?? o.__p0;
          col = Math.max(0, Math.trunc(Number(o.column ?? o.__p1 ?? 0) || 0));
          row = Math.max(0, Math.trunc(Number(o.row ?? o.__p2 ?? 0) || 0));
          text = o.text !== undefined ? String(o.text) : o.__p3 !== undefined ? String(o.__p3) : '';
          textColor = normalizeColorOrNull(o.text_color ?? o.__p6, '#d1d4dc') || '#d1d4dc';
          textHalign = (o.text_halign ?? o.__p7 ?? 'center') as any;
          textValign = (o.text_valign ?? o.__p8 ?? 'center') as any;
          textSize = (o.text_size ?? o.__p9 ?? 'small') as any;
          bgcolor = normalizeColorOrNull(o.bgcolor ?? o.__p10, null);
        } else if (
          args.length === 2 &&
          args[0]?.__pineType === 'table' &&
          args[1] &&
          typeof args[1] === 'object' &&
          !Array.isArray(args[1])
        ) {
          // Method named call: tbl.cell(0, 0, text="Hi", bgcolor=color.green)
          tbl = args[0];
          const o = args[1];
          col = Math.max(0, Math.trunc(Number(o.column ?? o.__p0 ?? 0) || 0));
          row = Math.max(0, Math.trunc(Number(o.row ?? o.__p1 ?? 0) || 0));
          text = o.text !== undefined ? String(o.text) : o.__p2 !== undefined ? String(o.__p2) : '';
          textColor = normalizeColorOrNull(o.text_color ?? o.__p5, '#d1d4dc') || '#d1d4dc';
          textHalign = (o.text_halign ?? o.__p6 ?? 'center') as any;
          textValign = (o.text_valign ?? o.__p7 ?? 'center') as any;
          textSize = (o.text_size ?? o.__p8 ?? 'small') as any;
          bgcolor = normalizeColorOrNull(o.bgcolor ?? o.__p9, null);
        } else {
          // Positional: table.cell(table_id, column, row, text, width, height, text_color, text_halign, text_valign, text_size, bgcolor)
          tbl = args[0];
          col = Math.max(0, Math.trunc(Number(args[1] ?? 0) || 0));
          row = Math.max(0, Math.trunc(Number(args[2] ?? 0) || 0));
          text = args[3] !== undefined ? String(args[3]) : '';
          textColor = normalizeColorOrNull(args[6], '#d1d4dc') || '#d1d4dc';
          textHalign = (args[7] ?? 'center') as any;
          textValign = (args[8] ?? 'center') as any;
          textSize = (args[9] ?? 'small') as any;
          bgcolor = normalizeColorOrNull(args[10], null);
        }

        if (!tbl || tbl.__pineType !== 'table') return;
        const cell = ensureTableCell(tbl, col, row);
        cell.text = text;
        cell.textColor = textColor;
        cell.textHalign = textHalign;
        cell.textValign = textValign;
        cell.textSize = textSize;
        cell.bgcolor = bgcolor;
      },
      clear: (
        tbl: PineTableRenderItem,
        startCol = 0,
        startRow = 0,
        endCol?: number,
        endRow?: number
      ) => {
        if (!tbl?.cells) return;
        if (endCol === undefined && endRow === undefined && startCol === 0 && startRow === 0) {
          tbl.cells = {};
          return;
        }
        const cMax = endCol ?? tbl.columns - 1;
        const rMax = endRow ?? tbl.rows - 1;
        for (let r = startRow; r <= rMax; r++) {
          for (let c = startCol; c <= cMax; c++) {
            delete tbl.cells[`${r}_${c}`];
          }
        }
      },
      delete: (tbl: any) => {
        if (tbl) activeTables.delete(tbl);
      },
      merge_cells: (
        tbl: PineTableRenderItem,
        startCol: number,
        startRow: number,
        endCol: number,
        endRow: number
      ) => {
        if (!tbl?.cells) return;
        const c0 = Math.min(startCol, endCol);
        const c1 = Math.max(startCol, endCol);
        const r0 = Math.min(startRow, endRow);
        const r1 = Math.max(startRow, endRow);
        const anchor = ensureTableCell(tbl, c0, r0);
        anchor.colSpan = c1 - c0 + 1;
        anchor.rowSpan = r1 - r0 + 1;
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            if (r === r0 && c === c0) continue;
            const covered = ensureTableCell(tbl, c, r);
            covered.merged = true;
          }
        }
      },
      cell_set_text: (tbl: PineTableRenderItem, col: number, row: number, text: any) => {
        if (!tbl?.cells) return;
        ensureTableCell(tbl, Math.trunc(col), Math.trunc(row)).text = String(text ?? '');
      },
      cell_set_bgcolor: (tbl: PineTableRenderItem, col: number, row: number, color: any) => {
        if (!tbl?.cells) return;
        ensureTableCell(tbl, Math.trunc(col), Math.trunc(row)).bgcolor = normalizeColorOrNull(color, null);
      },
      cell_set_text_color: (tbl: PineTableRenderItem, col: number, row: number, color: any) => {
        if (!tbl?.cells) return;
        ensureTableCell(tbl, Math.trunc(col), Math.trunc(row)).textColor =
          normalizeColorOrNull(color, '#d1d4dc') || '#d1d4dc';
      },
      cell_set_text_size: (tbl: PineTableRenderItem, col: number, row: number, size: any) => {
        if (!tbl?.cells) return;
        ensureTableCell(tbl, Math.trunc(col), Math.trunc(row)).textSize = size;
      },
      cell_set_text_halign: (tbl: PineTableRenderItem, col: number, row: number, align: any) => {
        if (!tbl?.cells) return;
        ensureTableCell(tbl, Math.trunc(col), Math.trunc(row)).textHalign = align;
      },
      cell_set_text_valign: (tbl: PineTableRenderItem, col: number, row: number, align: any) => {
        if (!tbl?.cells) return;
        ensureTableCell(tbl, Math.trunc(col), Math.trunc(row)).textValign = align;
      },
      set_bgcolor: (tbl: PineTableRenderItem, c: any) => {
        if (tbl) tbl.bgcolor = normalizeColorOrNull(c, null);
      },
      set_frame_color: (tbl: PineTableRenderItem, c: any) => {
        if (tbl) tbl.frameColor = normalizeColorOrNull(c, null);
      },
      set_frame_width: (tbl: PineTableRenderItem, w: number) => {
        if (tbl) tbl.frameWidth = Number(w);
      },
      set_border_color: (tbl: PineTableRenderItem, c: any) => {
        if (tbl) tbl.borderColor = normalizeColorOrNull(c, null);
      },
      set_border_width: (tbl: PineTableRenderItem, w: number) => {
        if (tbl) tbl.borderWidth = Number(w);
      },
      set_position: (tbl: PineTableRenderItem, pos: string) => {
        if (tbl) tbl.position = String(pos);
      },
    }
  );
  Object.defineProperty(tableNamespace, 'all', {
    get: () => {
      const a = Array.from(activeTables);
      (a as any).__isPineArray = true;
      return a;
    },
  });

  // Resample cache per targetTfSec (shared by `timeframe.change` and `request.security`)
  const resampledTfCache = new Map<number, ResampledTfData>();
  const getResampledTf = (targetSec: number): ResampledTfData => {
    let entry = resampledTfCache.get(targetSec);
    if (!entry) {
      entry = resampleCandlesToTf(dataList, targetSec);
      resampledTfCache.set(targetSec, entry);
    }
    return entry;
  };

  const tfChangeCache = new Map<string, number[]>();
  const tfChangeFn = (barIdx: number, tf?: string): number => {
    const key = String(tf ?? '');
    let series = tfChangeCache.get(key);
    if (!series) {
      const targetSec = parsePineTfSeconds(tf, detectedChartSec);
      if (targetSec <= detectedChartSec) {
        series = new Array<number>(len).fill(1);
      } else {
        series = getResampledTf(targetSec).isNewHtfBar;
      }
      tfChangeCache.set(key, series);
    }
    return series[barIdx] ?? 0;
  };

  const execCtx = context ?? getDefaultExecContext();
  const syminfoObj = buildSyminfoFromContext(execCtx);

  const env: Record<string, PineEnvValue> = {
    open,
    high,
    low,
    close,
    volume,
    time: timestamps,
    time_close: timestamps,
    timenow: Date.now(),
    hl2,
    hlc3,
    ohlc4,
    bar_index: barIndex,
    last_bar_index: len - 1,
    year: timestamps.map((t) => new Date(t).getUTCFullYear()),
    month: timestamps.map((t) => new Date(t).getUTCMonth() + 1),
    dayofmonth: timestamps.map((t) => new Date(t).getUTCDate()),
    hour: timestamps.map((t) => new Date(t).getUTCHours()),
    minute: timestamps.map((t) => new Date(t).getUTCMinutes()),
    second: timestamps.map((t) => new Date(t).getUTCSeconds()),
    __ta_tr: taTr(high, low, close, true),
    __ta_obv: taObv(close, volume),
    __ta_vwap: taVwap(hlc3, volume, timestamps),
    chart: {
      bg_color: '#131722',
      fg_color: '#d1d4dc',
      is_standard: true,
      is_heikinashi: false,
      is_kagi: false,
      is_linebreak: false,
      is_pnf: false,
      is_range: false,
      is_renko: false,
      left_visible_bar_time: timestamps[0] ?? 0,
      right_visible_bar_time: timestamps[len - 1] ?? 0,
      point: {
        from_index: (index: any, price?: any) => {
          if (index && typeof index === 'object') {
            return { index: Number(index.index ?? index.__p0), price: Number(index.price ?? index.__p1) };
          }
          return { index: Number(index), price: Number(price) };
        },
        from_time: (timeVal: any, price?: any) => {
          if (timeVal && typeof timeVal === 'object') {
            return { time: Number(timeVal.time ?? timeVal.__p0), price: Number(timeVal.price ?? timeVal.__p1) };
          }
          return { time: Number(timeVal), price: Number(price) };
        },
        new: (timeVal: any, index?: any, price?: any) => {
          if (timeVal && typeof timeVal === 'object') {
            return {
              time: timeVal.time !== undefined ? Number(timeVal.time) : timeVal.__p0 !== undefined ? Number(timeVal.__p0) : undefined,
              index: timeVal.index !== undefined ? Number(timeVal.index) : timeVal.__p1 !== undefined ? Number(timeVal.__p1) : undefined,
              price: Number(timeVal.price ?? timeVal.__p2),
            };
          }
          return { time: Number(timeVal), index: Number(index), price: Number(price) };
        },
        copy: (pt: any) => ({ ...pt }),
      },
    },
    syminfo: syminfoObj,
    timeframe: {
      period: detectedTfStr,
      main_period: detectedTfStr,
      multiplier: Math.max(1, Math.round(detectedChartSec / 60)),
      isintraday: detectedChartSec < 86400,
      isminutes: detectedChartSec >= 60 && detectedChartSec < 86400,
      isseconds: detectedChartSec < 60,
      isdaily: detectedChartSec === 86400,
      isweekly: detectedChartSec === 604800,
      ismonthly: detectedChartSec >= 2419200,
      isdwm: detectedChartSec >= 86400,
      in_seconds: (tf?: string) => parsePineTfSeconds(tf, detectedChartSec),
      change: (tf?: string) => tfChangeFn(currentBarRef.idx, tf),
    },
    format: {
      mintick: '#.####',
      volume: 'volume',
      price: 'price',
      percent: 'percent',
      inherit: 'inherit',
    },
    session: {
      ismarket: true,
      ispremarket: false,
      ispostmarket: false,
      isfirstbar: barIndex.map((i) => (i === 0 ? 1 : 0)),
      isfirstbar_regular: barIndex.map((i) => (i === 0 ? 1 : 0)),
      islastbar: barIndex.map((i) => (i === len - 1 ? 1 : 0)),
      islastbar_regular: barIndex.map((i) => (i === len - 1 ? 1 : 0)),
      regular: 'regular',
      extended: 'extended',
    },
    barstate: {
      isfirst: barIndex.map((i) => (i === 0 ? 1 : 0)),
      islast: barIndex.map((i) => (i === len - 1 ? 1 : 0)),
      isconfirmed: new Array(len).fill(1),
      isrealtime: barIndex.map((i) => (i === len - 1 ? 1 : 0)),
      ishistory: barIndex.map((i) => (i < len - 1 ? 1 : 0)),
      isnew: new Array(len).fill(1),
      islastconfirmedhistory: barIndex.map((i) => (i === len - 1 ? 1 : 0)),
    },
    dayofweek: {
      sunday: 1,
      monday: 2,
      tuesday: 3,
      wednesday: 4,
      thursday: 5,
      friday: 6,
      saturday: 7,
    },
    request: {
      security: (_sym: any, _tf: any, exprVal: any) => exprVal,
      security_lower_tf: (_sym: any, _tf: any, exprVal: any) => {
        const a: any = [exprVal];
        a.__isPineArray = true;
        return a;
      },
    },
    plot: {
      style_line: 'line',
      style_linebr: 'linebr',
      style_stepline: 'stepline',
      style_steplinebr: 'stepline',
      style_stepline_diamond: 'stepline',
      style_histogram: 'histogram',
      style_columns: 'columns',
      style_circles: 'circles',
      style_cross: 'cross',
      style_area: 'area',
      style_areabr: 'area',
    },
    hline: {
      style_solid: 'solid',
      style_dashed: 'dashed',
      style_dotted: 'dotted',
    },
    shape: {
      triangleup: 'triangleup',
      triangledown: 'triangledown',
      circle: 'circle',
      diamond: 'diamond',
      cross: 'cross',
      xcross: 'xcross',
      labelup: 'labelup',
      labeldown: 'labeldown',
      arrowup: 'triangleup',
      arrowdown: 'triangledown',
      flag: 'diamond',
      square: 'diamond',
    },
    location: {
      abovebar: 'abovebar',
      belowbar: 'belowbar',
      top: 'top',
      bottom: 'bottom',
      absolute: 'absolute',
    },
    size: {
      auto: 'small',
      tiny: 'tiny',
      small: 'small',
      normal: 'normal',
      large: 'large',
      huge: 'large',
    },
    display: {
      all: 'all',
      none: 'none',
      pane: 'pane',
      data_window: 'data_window',
      price_scale: 'price_scale',
      status_line: 'status_line',
    },
    position: {
      top_left: 'top_left',
      top_center: 'top_center',
      top_right: 'top_right',
      middle_left: 'middle_left',
      middle_center: 'middle_center',
      middle_right: 'middle_right',
      bottom_left: 'bottom_left',
      bottom_center: 'bottom_center',
      bottom_right: 'bottom_right',
    },
    text: {
      align_left: 'left',
      align_center: 'center',
      align_right: 'right',
      align_top: 'top',
      align_bottom: 'bottom',
    },
    font: {
      family_default: 'default',
      family_monospace: 'monospace',
    },
    order: {
      ascending: 'ascending',
      descending: 'descending',
    },
    xloc: { bar_index: 'bar_index', bar_time: 'bar_time' },
    yloc: { price: 'price', abovebar: 'abovebar', belowbar: 'belowbar' },
    extend: { none: 'none', left: 'left', right: 'right', both: 'both' },
    line: lineNamespace,
    linefill: linefillNamespace,
    polyline: polylineNamespace,
    label: labelNamespace,
    table: tableNamespace,
    barmerge: {
      gaps_off: 'gaps_off',
      gaps_on: 'gaps_on',
      lookahead_off: 'lookahead_off',
      lookahead_on: 'lookahead_on',
    },
    strategy: {
      long: 'long',
      short: 'short',
      cash: 'cash',
      fixed: 'fixed',
      percent_of_equity: 'percent_of_equity',
      position_size: 0,
      equity: 10000,
    },
    box: boxNamespace,
  };
  env.ta = createBarTaProxy(env, ta, len, currentBarRef);

  // Bind typed inputs
  const sourceMap: Record<string, number[]> = {
    open,
    high,
    low,
    close,
    hl2,
    hlc3,
    ohlc4,
    volume,
  };

  parsed.inputs.forEach((inp, idx) => {
    const rawParam = calcParams[idx] !== undefined ? calcParams[idx] : inp.defaultVal;
    if (inp.type === 'source') {
      const srcKey = String(rawParam || inp.defaultVal || 'close').trim().toLowerCase();
      env[inp.varName] = sourceMap[srcKey] || close;
    } else if (inp.type === 'bool') {
      const b =
        typeof rawParam === 'boolean'
          ? rawParam
          : String(rawParam).toLowerCase() === 'true' || rawParam === 1;
      env[inp.varName] = b;
    } else if (inp.type === 'string' || inp.type === 'color') {
      env[inp.varName] = String(rawParam ?? inp.defaultVal);
    } else {
      const n = Number(rawParam);
      const fallbackNum = Number(inp.defaultVal);
      env[inp.varName] = new Array(len).fill(Number.isFinite(n) ? n : fallbackNum);
    }
  });

  const funcs: Record<string, UserFuncDef> = {};
  const methodsRegistry = new Map<string, Map<string, (...args: any[]) => any>>();
  const varNamesSet = new Set<string>();
  const sharedEnvSeriesRef: { seriesSet?: Set<string>; keySet?: Set<string> } = {};
  const secExprLookup = new Map<string, string>();

  const pineCall = (obj: any, methodName: string, ...args: any[]): any => {
    if (obj === null || obj === undefined || (typeof obj === 'number' && Number.isNaN(obj))) {
      return NaN;
    }
    // 1. User-defined `method` dispatch by receiver type (`__pineType` or built-in kind)
    const recvType = obj.__pineType
      ? String(obj.__pineType)
      : obj.__isPineMap
      ? 'map'
      : obj.__isPineMatrix
      ? 'matrix'
      : Array.isArray(obj)
      ? 'array'
      : typeof obj;
    const typedMethod =
      methodsRegistry.get(recvType)?.get(methodName) ||
      methodsRegistry.get('any')?.get(methodName);
    if (typedMethod) {
      return typedMethod(obj, ...args);
    }
    // 2. Built-in Pine v6 object namespaces
    if (obj.__isPineMap && methodName in PINE_MAP_OBJECT) {
      return PINE_MAP_OBJECT[methodName](obj, ...args);
    }
    if (obj.__isPineMatrix && methodName in PINE_MATRIX_OBJECT) {
      return PINE_MATRIX_OBJECT[methodName](obj, ...args);
    }
    if (Array.isArray(obj) && methodName in PINE_ARRAY_OBJECT) {
      return PINE_ARRAY_OBJECT[methodName](obj, ...args);
    }
    if (obj.__pineType === 'line' && methodName in lineNamespace) {
      return lineNamespace[methodName](obj, ...args);
    }
    if (obj.__pineType === 'box' && methodName in boxNamespace) {
      return boxNamespace[methodName](obj, ...args);
    }
    if (obj.__pineType === 'label' && methodName in labelNamespace) {
      return labelNamespace[methodName](obj, ...args);
    }
    if (obj.__pineType === 'table' && methodName in tableNamespace) {
      return tableNamespace[methodName](obj, ...args);
    }
    if (obj.__pineType === 'linefill' && methodName in linefillNamespace) {
      return linefillNamespace[methodName](obj, ...args);
    }
    if (obj.__pineType === 'polyline' && methodName in polylineNamespace) {
      return polylineNamespace[methodName](obj, ...args);
    }
    if (methodName === 'copy' && obj.__pineType && env[obj.__pineType]?.copy) {
      return env[obj.__pineType].copy(obj);
    }
    if (typeof obj[methodName] === 'function') {
      return obj[methodName](...args);
    }
    throw new Error(`Unknown Pine method ".${methodName}()" on ${recvType}`);
  };

  // Real Multi-Timeframe `request.security(symbol, timeframe, expression, gaps, lookahead)` resolver
  const resolveSecurity = (rawArgs: string, allowTuple: boolean): any => {
    const { pos, named } = parseNamedAndPositional(splitTopLevelArgs(rawArgs));
    const tfExpr = (named.timeframe ?? pos[1] ?? '').trim();
    const targetExpr = (named.expression ?? pos[2] ?? 'close').trim();
    const gapsExpr = (named.gaps ?? pos[3] ?? 'barmerge.gaps_off').trim();
    const lookaheadExpr = (named.lookahead ?? pos[4] ?? 'barmerge.lookahead_off').trim();

    let tfVal: any = '';
    if (tfExpr) {
      try {
        tfVal = evalSingleBarExpr(tfExpr, env, {}, funcs, 0, len, undefined, undefined, '', runtimeHooks);
      } catch {
        tfVal = tfExpr.replace(/^['"]|['"]$/g, '');
      }
    }
    let gapsVal = 'gaps_off';
    try {
      gapsVal = String(
        evalSingleBarExpr(gapsExpr, env, {}, funcs, 0, len, undefined, undefined, '', runtimeHooks)
      );
    } catch {}
    let lookaheadVal = 'lookahead_off';
    try {
      lookaheadVal = String(
        evalSingleBarExpr(lookaheadExpr, env, {}, funcs, 0, len, undefined, undefined, '', runtimeHooks)
      );
    } catch {}

    const gapsOn = gapsVal === 'gaps_on';
    const lookaheadOn = lookaheadVal === 'lookahead_on';
    const targetSec = parsePineTfSeconds(tfVal, detectedChartSec);

    const isTupleExpr = targetExpr.startsWith('[') && targetExpr.endsWith(']');

    const evalOnSeries = (
      exprStr: string,
      evalEnv: Record<string, PineEnvValue>,
      evalTa: Record<string, (...a: any[]) => any>,
      evalLen: number,
      asTuple: boolean
    ): any => {
      if (isTupleExpr) {
        const inner = exprStr.slice(1, -1).trim();
        const parts = splitTopLevelArgs(inner);
        return parts.map((p) => evalPineExprVector(p, evalEnv, evalTa, funcs, evalLen, false, runtimeHooks));
      }
      return evalPineExprVector(exprStr, evalEnv, evalTa, funcs, evalLen, asTuple, runtimeHooks);
    };

    // Same timeframe or lower timeframe -> evaluate directly on base chart series
    if (targetSec <= detectedChartSec) {
      const baseRes = evalOnSeries(targetExpr, env, ta, len, allowTuple);
      if (allowTuple && !Array.isArray(baseRes?.[0])) return [baseRes];
      return baseRes;
    }

    // Higher timeframe -> resample candles, evaluate on HTF, and project back onto base bars
    const resampled = getResampledTf(targetSec);
    const htfLen = resampled.bars.length;
    if (htfLen === 0) {
      return allowTuple ? [new Array(len).fill(NaN)] : new Array(len).fill(NaN);
    }

    const htfOpen = resampled.bars.map((b) => b.open);
    const htfHigh = resampled.bars.map((b) => b.high);
    const htfLow = resampled.bars.map((b) => b.low);
    const htfClose = resampled.bars.map((b) => b.close);
    const htfVol = resampled.bars.map((b) => b.volume ?? 1);
    const htfTs = resampled.bars.map((b) => b.timestamp);
    const htfHl2 = resampled.bars.map((b) => (b.high + b.low) / 2);
    const htfHlc3 = resampled.bars.map((b) => (b.high + b.low + b.close) / 3);
    const htfOhlc4 = resampled.bars.map((b) => (b.open + b.high + b.low + b.close) / 4);
    const htfBarIdx = Array.from({ length: htfLen }, (_, i) => i);

    const htfTa = buildTaRegistry(htfHigh, htfLow, htfClose, htfHlc3, htfVol, htfTs, htfLen);
    const htfEnv: Record<string, PineEnvValue> = {};
    // Copy non-series scalars, enums, types, constants & inputs from base `env`
    for (const [k, v] of Object.entries(env)) {
      if (isSeriesArray(v, len)) {
        // If scalar input was expanded to a constant numeric series, re-fill for `htfLen`
        if (parsed.inputs.some((inp) => inp.varName === k && (inp.type === 'int' || inp.type === 'float'))) {
          htfEnv[k] = new Array(htfLen).fill(v[0]);
        }
      } else {
        htfEnv[k] = v;
      }
    }
    htfEnv.open = htfOpen;
    htfEnv.high = htfHigh;
    htfEnv.low = htfLow;
    htfEnv.close = htfClose;
    htfEnv.volume = htfVol;
    htfEnv.time = htfTs;
    htfEnv.time_close = htfTs;
    htfEnv.hl2 = htfHl2;
    htfEnv.hlc3 = htfHlc3;
    htfEnv.ohlc4 = htfOhlc4;
    htfEnv.bar_index = htfBarIdx;
    htfEnv.last_bar_index = htfLen - 1;
    htfEnv.__ta_tr = taTr(htfHigh, htfLow, htfClose, true);
    htfEnv.__ta_obv = taObv(htfClose, htfVol);
    htfEnv.__ta_vwap = taVwap(htfHlc3, htfVol, htfTs);

    const htfEval = evalOnSeries(targetExpr, htfEnv, htfTa, htfLen, allowTuple || isTupleExpr);

    const mapHtfSeriesToBase = (htfSeries: any[]): any[] => {
      const out = new Array(len).fill(NaN);
      for (let i = 0; i < len; i++) {
        const h = resampled.baseToHtfIdx[i];
        // Zero-lookahead guarantee: under `barmerge.lookahead_off` (default),
        // base bars inside forming HTF bucket `h` ONLY see the last COMPLETED HTF bar (`h - 1`).
        const srcIdx = lookaheadOn ? h : h - 1;
        if (srcIdx < 0 || srcIdx >= htfSeries.length) continue;
        if (gapsOn && resampled.isNewHtfBar[i] !== 1) continue;
        out[i] = htfSeries[srcIdx];
      }
      return out;
    };

    if (Array.isArray(htfEval) && Array.isArray(htfEval[0])) {
      const mappedTuple = htfEval.map((series: any[]) => mapHtfSeriesToBase(series));
      return allowTuple || isTupleExpr ? mappedTuple : mappedTuple[0];
    }
    const mapped = mapHtfSeriesToBase(Array.isArray(htfEval) ? htfEval : new Array(htfLen).fill(htfEval));
    return allowTuple ? [mapped] : mapped;
  };

  const runtimeHooks: RuntimeHooks = {
    pineCall,
    tfChange: tfChangeFn,
    resolveSecurity,
    secExprLookup,
  };

  const buildCallableBody = (
    params: string[],
    paramDefaults: Array<string | undefined> | undefined,
    stmts: PineStatement[]
  ) => {
    const paramShapeKey = params.join(',');
    return (...callArgs: any[]) => {
      const fnLocal: Record<string, any> = {};
      params.forEach((p, idx) => {
        if (callArgs[idx] !== undefined) {
          fnLocal[p] = callArgs[idx];
        } else if (paramDefaults && paramDefaults[idx] !== undefined) {
          fnLocal[p] = evalSingleBarExpr(
            paramDefaults[idx]!,
            env,
            fnLocal,
            funcs,
            currentBarRef.idx,
            len,
            sharedEnvSeriesRef.seriesSet,
            sharedEnvSeriesRef.keySet,
            Object.keys(fnLocal).join(','),
            runtimeHooks
          );
        } else {
          fnLocal[p] = NaN;
        }
      });
      return executeBarStatements(
        stmts,
        env,
        fnLocal,
        funcs,
        currentBarRef.idx,
        len,
        {},
        true,
        sharedEnvSeriesRef.seriesSet && sharedEnvSeriesRef.keySet
          ? {
              envSeriesSet: sharedEnvSeriesRef.seriesSet,
              envKeySet: sharedEnvSeriesRef.keySet,
              localShapeKey: paramShapeKey,
              hooks: runtimeHooks,
            }
          : {
              envSeriesSet: new Set(Object.keys(env).filter((k) => isSeriesArray(env[k], len))),
              envKeySet: new Set(Object.keys(env)),
              localShapeKey: paramShapeKey,
              hooks: runtimeHooks,
            }
      );
    };
  };

  const registerFuncDef = (st: PineStatement) => {
    if (!st.varName) return;
    const params = st.funcParams || [];
    const stmts = st.funcStmts && st.funcStmts.length > 0 ? st.funcStmts : undefined;
    funcs[st.varName] = {
      params,
      paramDefaults: st.funcParamDefaults,
      body: st.funcBody || 'na',
      stmts,
    };
    if (stmts) {
      env[st.varName] = buildCallableBody(params, st.funcParamDefaults, stmts);
    }
  };

  const registerMethodDef = (st: PineStatement) => {
    if (!st.varName) return;
    const recvType = st.receiverType || 'any';
    const params = st.funcParams || ['this'];
    const stmts =
      st.funcStmts && st.funcStmts.length > 0
        ? st.funcStmts
        : [{ kind: 'assign' as const, varName: '__expr_stmt', expr: st.funcBody || 'na' }];
    const fn = buildCallableBody(params, st.funcParamDefaults, stmts);
    let bucket = methodsRegistry.get(recvType);
    if (!bucket) {
      bucket = new Map();
      methodsRegistry.set(recvType, bucket);
    }
    bucket.set(st.varName, fn);
  };

  // Pre-register all enums, user-defined functions, methods, and user-defined types
  for (const st of parsed.statements) {
    if (st.kind === 'enum_def' && st.varName) {
      const enumObj: Record<string, string> = {};
      for (const m of st.enumMembers || []) {
        enumObj[m.name] = m.title ?? `${st.varName}.${m.name}`;
      }
      env[st.varName] = Object.freeze(enumObj);
    }
    if (st.kind === 'func_def') registerFuncDef(st);
    if (st.kind === 'method_def') registerMethodDef(st);
    if (st.kind === 'type_def' && st.varName) {
      const typeName = st.varName;
      const fields = st.typeFields || [];
      env[typeName] = {
        new: (...args: any[]) => {
          const obj: Record<string, any> = { __pineType: typeName };
          const namedArg =
            args.length === 1 &&
            args[0] &&
            typeof args[0] === 'object' &&
            !Array.isArray(args[0]) &&
            !args[0].__pineType &&
            !args[0].__isPineMap &&
            !args[0].__isPineMatrix
              ? args[0]
              : null;
          fields.forEach((f, idx) => {
            if (namedArg && f.name in namedArg) {
              obj[f.name] = namedArg[f.name];
            } else if (namedArg && `__p${idx}` in namedArg) {
              obj[f.name] = namedArg[`__p${idx}`];
            } else if (!namedArg && args[idx] !== undefined) {
              obj[f.name] = args[idx];
            } else if (f.defaultExpr !== undefined) {
              if (f.defaultExpr === 'false') obj[f.name] = false;
              else if (f.defaultExpr === 'true') obj[f.name] = true;
              else if (f.defaultExpr === 'na') obj[f.name] = NaN;
              else {
                const n = Number(f.defaultExpr);
                obj[f.name] = Number.isFinite(n) ? n : f.defaultExpr.replace(/^['"]|['"]$/g, '');
              }
            } else {
              obj[f.name] = NaN;
            }
          });
          return obj;
        },
        copy: (srcObj: any) => (srcObj && typeof srcObj === 'object' ? { ...srcObj, __pineType: typeName } : null),
      };
    }
  }

  const firstStatefulIdx = parsed.statements.findIndex((s) => statementUsesStatefulFeature(s));

  const preStatements =
    firstStatefulIdx === -1 ? parsed.statements : parsed.statements.slice(0, firstStatefulIdx);
  const statefulStatements =
    firstStatefulIdx === -1 ? [] : parsed.statements.slice(firstStatefulIdx);

  // 1. Execute pure vectorized statements before the first stateful block
  for (const st of preStatements) {
    if (
      st.kind === 'func_def' ||
      st.kind === 'method_def' ||
      st.kind === 'type_def' ||
      st.kind === 'enum_def'
    ) {
      continue;
    }

    if (st.kind === 'tuple_assign' && st.varNames && st.expr) {
      const tuple = evalPineExprVector(st.expr, env, ta, funcs, len, true, runtimeHooks);
      st.varNames.forEach((vName, k) => {
        if (vName && vName !== '_') {
          env[vName] = Array.isArray(tuple?.[k]) ? tuple[k] : new Array(len).fill(NaN);
        }
      });
      continue;
    }

    if (st.kind === 'switch_assign' && st.varName && st.cases) {
      const switchKeyVal = st.switchExpr
        ? evalPineExprVector(st.switchExpr, env, ta, funcs, len, false, runtimeHooks)
        : null;
      const scalarKey = Array.isArray(switchKeyVal) ? switchKeyVal[len - 1] : switchKeyVal;

      let chosenExpr: string | null = null;
      for (const c of st.cases) {
        if (c.matchExpr === null) {
          if (chosenExpr === null) chosenExpr = c.resultExpr;
          continue;
        }
        const matchVal = evalPineExprVector(c.matchExpr, env, ta, funcs, len, false, runtimeHooks);
        const scalarMatch = Array.isArray(matchVal) ? matchVal[len - 1] : matchVal;
        if (st.switchExpr) {
          if (scalarKey === scalarMatch) {
            chosenExpr = c.resultExpr;
            break;
          }
        } else if (isPineTruthy(scalarMatch)) {
          chosenExpr = c.resultExpr;
          break;
        }
      }
      env[st.varName] = chosenExpr
        ? evalPineExprVector(chosenExpr, env, ta, funcs, len, false, runtimeHooks)
        : new Array(len).fill(NaN);
      continue;
    }

    if (st.kind === 'assign' && st.varName && st.expr) {
      if (st.isVar) {
        varNamesSet.add(st.varName);
        if (
          /^\s*(?:array\.new|map\.new|matrix\.new|table\.new|line\.new|box\.new|label\.new|linefill\.new|polyline\.new|[A-Z]\w*\.new)/.test(
            st.expr
          )
        ) {
          const objVal = evalSingleBarExpr(st.expr, env, {}, funcs, 0, len, undefined, undefined, '', runtimeHooks);
          if (Array.isArray(objVal)) (objVal as any).__isPineArray = true;
          env[st.varName] = objVal;
          continue;
        }
        const initVal = evalSingleBarExpr(st.expr, env, {}, funcs, 0, len, undefined, undefined, '', runtimeHooks);
        env[st.varName] = new Array(len).fill(initVal);
        continue;
      }
      env[st.varName] = evalPineExprVector(st.expr, env, ta, funcs, len, false, runtimeHooks);
      continue;
    }

    if (st.kind === 'reassign' && st.varName && st.expr) {
      if (!env[st.varName] || !isSeriesArray(env[st.varName], len)) {
        env[st.varName] = new Array(len).fill(NaN);
      }
      env[st.varName] = evalPineExprVector(st.expr, env, ta, funcs, len, false, runtimeHooks);
    }
  }

  // 2. Execute stateful statements (`if`, `for`, `var` objects, `line.new`, `box.new`, `table.new`, methods) in exact bar-by-bar Pine order!
  if (statefulStatements.length > 0) {
    // Pre-resolve any `request.security(...)` calls used inside stateful blocks so they execute with full HTF resampling!
    const secCalls = new Set<string>();
    collectSecurityCallsInStmts(statefulStatements, secCalls);
    let secIdx = 0;
    for (const fullText of secCalls) {
      const found = findRequestSecurityCall(fullText);
      if (!found) continue;
      const secKey = `__pre_sec_${secIdx++}`;
      const secVal = resolveSecurity(found.rawArgs, false);
      env[secKey] = Array.isArray(secVal) && Array.isArray(secVal[0]) ? secVal[0] : secVal;
      secExprLookup.set(fullText, secKey);
    }

    const barExecList: PineStatement[] = [];
    for (const st of statefulStatements) {
      if (
        st.kind === 'func_def' ||
        st.kind === 'method_def' ||
        st.kind === 'type_def' ||
        st.kind === 'enum_def'
      ) {
        continue;
      }
      if (st.kind === 'assign' && st.isVar && st.varName && st.expr) {
        varNamesSet.add(st.varName);
        if (
          /^\s*(?:array\.new|map\.new|matrix\.new|table\.new|line\.new|box\.new|label\.new|linefill\.new|polyline\.new|[A-Z]\w*\.new)/.test(
            st.expr
          )
        ) {
          const val = evalSingleBarExpr(st.expr, env, {}, funcs, 0, len, undefined, undefined, '', runtimeHooks);
          if (Array.isArray(val)) (val as any).__isPineArray = true;
          env[st.varName] = val;
        } else {
          const initVal = evalSingleBarExpr(st.expr, env, {}, funcs, 0, len, undefined, undefined, '', runtimeHooks);
          env[st.varName] = new Array(len).fill(initVal);
        }
        continue;
      }
      // Pre-allocate top-level non-var numeric assignments so series lookbacks work cleanly
      if (
        st.kind === 'assign' &&
        st.varName &&
        st.varName !== '__expr_stmt' &&
        !env[st.varName] &&
        !(
          st.expr &&
          /^\s*(?:array\.new|map\.new|matrix\.new|table\.new|line\.new|box\.new|label\.new|linefill\.new|polyline\.new|[A-Z]\w*\.new)/.test(
            st.expr
          )
        )
      ) {
        env[st.varName] = new Array(len).fill(NaN);
      }
      barExecList.push(st);
    }

    const sharedEnvSeriesSet = new Set(Object.keys(env).filter((k) => isSeriesArray(env[k], len)));
    const sharedEnvKeySet = new Set(Object.keys(env));
    sharedEnvSeriesRef.seriesSet = sharedEnvSeriesSet;
    sharedEnvSeriesRef.keySet = sharedEnvKeySet;

    // For heavy nested-loop scripts (e.g. Support/Resistance Channels with loopback 300),
    // cap bar-by-bar stateful simulation to the most recent 550 bars so 3,000+ bar charts stay instant!
    const hasHeavyForLoop = barExecList.some(
      (s) =>
        s.kind === 'for_loop' ||
        (s.kind === 'if_block' &&
          s.branches?.some((b) => b.body.some((inner) => inner.kind === 'for_loop')))
    );
    const startBar = hasHeavyForLoop && len > 550 ? len - 550 : 0;

    for (let i = startBar; i < len; i++) {
      currentBarRef.idx = i;
      if (i > startBar) {
        for (const vn of varNamesSet) {
          if (isSeriesArray(env[vn], len)) {
            env[vn][i] = env[vn][i - 1];
          }
        }
      }
      executeBarStatements(barExecList, env, {}, funcs, i, len, {}, false, {
        envSeriesSet: sharedEnvSeriesSet,
        envKeySet: sharedEnvKeySet,
        localShapeKey: '',
        hooks: runtimeHooks,
      });
    }
  }

  // Evaluate plots (with offset + per-bar dynamic color!)
  const plotResults = parsed.plots.map((p) => {
    const rawValues = toNumericSeries(
      evalPineExprVector(p.expr, env, ta, funcs, len, false, runtimeHooks),
      len
    );
    const rawColors = evalColorSeries(p.colorExpr, p.fallbackColor, env, ta, funcs, len, runtimeHooks);
    return {
      def: p,
      values: applyPlotOffset(rawValues, p.offset, NaN),
      colors: applyPlotOffset(rawColors, p.offset, null),
    };
  });

  // Evaluate plotcandle / plotbar definitions
  const plotCandleResults = (parsed.plotCandles || []).map((pc) => {
    const oSer = toNumericSeries(evalPineExprVector(pc.openExpr, env, ta, funcs, len, false, runtimeHooks), len);
    const hSer = toNumericSeries(evalPineExprVector(pc.highExpr, env, ta, funcs, len, false, runtimeHooks), len);
    const lSer = toNumericSeries(evalPineExprVector(pc.lowExpr, env, ta, funcs, len, false, runtimeHooks), len);
    const cSer = toNumericSeries(evalPineExprVector(pc.closeExpr, env, ta, funcs, len, false, runtimeHooks), len);
    const colors = evalColorSeries(pc.colorExpr, pc.fallbackColor, env, ta, funcs, len, runtimeHooks);
    const wickColors = evalColorSeries(pc.wickColorExpr, pc.fallbackColor, env, ta, funcs, len, runtimeHooks);
    const borderColors = evalColorSeries(pc.borderColorExpr, pc.fallbackColor, env, ta, funcs, len, runtimeHooks);
    return { def: pc, oSer, hSer, lSer, cSer, colors, wickColors, borderColors };
  });

  // Evaluate fills
  const fillResults = parsed.fills.map((f, fIdx) => {
    // Match offset of plot1 if plot1 has an offset (e.g. Ichimoku Kumo cloud offset=26)
    const p1 = parsed.plots.find((p) => p.key === f.plot1Key);
    const rawColors = evalColorSeries(f.colorExpr, f.fallbackColor, env, ta, funcs, len, runtimeHooks);
    const colors = p1 && p1.offset ? applyPlotOffset(rawColors, p1.offset, null) : rawColors;
    return { key: `f${fIdx}`, def: f, colors };
  });

  // Evaluate shapes
  const shapeResults = parsed.shapes.map((s) => {
    const conds = toNumericSeries(
      evalPineExprVector(s.condExpr, env, ta, funcs, len, false, runtimeHooks),
      len
    );
    const colors = evalColorSeries(s.colorExpr, s.fallbackColor, env, ta, funcs, len, runtimeHooks);
    return { def: s, conds, colors };
  });

  // Evaluate bgcolor & barcolor
  const bgSeriesList = parsed.bgColors.map((b) =>
    evalColorSeries(b.colorExpr, null, env, ta, funcs, len, runtimeHooks)
  );
  const barColorSeriesList = parsed.barColors.map((b) =>
    evalColorSeries(b.colorExpr, null, env, ta, funcs, len, runtimeHooks)
  );

  // Assemble rows for KLineCharts
  const rows: PineIndicatorRow[] = new Array(len);
  for (let i = 0; i < len; i++) {
    const row: PineIndicatorRow = {};
    const plotColors: Record<string, string | null> = {};

    for (const pr of plotResults) {
      const v = pr.values[i];
      if (Number.isFinite(v)) row[pr.def.key] = v;
      plotColors[pr.def.key] = pr.colors[i];
    }

    for (let h = 0; h < parsed.hlines.length; h++) {
      row[parsed.hlines[h].key] = parsed.hlines[h].value;
    }

    row.__plotColors = plotColors;

    if (plotCandleResults.length > 0) {
      const candlesMap: Record<string, PinePlotCandleBar> = {};
      for (const pcr of plotCandleResults) {
        const o = pcr.oSer[i];
        const h = pcr.hSer[i];
        const l = pcr.lSer[i];
        const c = pcr.cSer[i];
        if (Number.isFinite(o) && Number.isFinite(h) && Number.isFinite(l) && Number.isFinite(c)) {
          const baseCol = pcr.colors[i] || pcr.def.fallbackColor;
          candlesMap[pcr.def.key] = {
            kind: pcr.def.kind,
            open: o,
            high: h,
            low: l,
            close: c,
            color: baseCol,
            wickColor: pcr.wickColors[i] || baseCol,
            borderColor: pcr.borderColors[i] || baseCol,
          };
        }
      }
      if (Object.keys(candlesMap).length > 0) {
        row.__plotCandles = candlesMap;
      }
    }

    if (fillResults.length > 0) {
      const fillColors: Record<string, string | null> = {};
      for (const fr of fillResults) {
        fillColors[fr.key] = fr.colors[i];
      }
      row.__fillColors = fillColors;
    }

    if (shapeResults.length > 0) {
      const shapeHits: Record<string, { hit: boolean; color: string }> = {};
      for (const sr of shapeResults) {
        if (Number.isFinite(sr.conds[i]) && sr.conds[i] !== 0) {
          shapeHits[sr.def.key] = {
            hit: true,
            color: sr.colors[i] || sr.def.fallbackColor,
          };
        }
      }
      row.__shapeHits = shapeHits;
    }

    if (bgSeriesList.length > 0) {
      for (let b = bgSeriesList.length - 1; b >= 0; b--) {
        if (bgSeriesList[b][i]) {
          row.__bgColor = bgSeriesList[b][i];
          break;
        }
      }
    }

    if (barColorSeriesList.length > 0) {
      for (let b = barColorSeriesList.length - 1; b >= 0; b--) {
        if (barColorSeriesList[b][i]) {
          row.__barColor = barColorSeriesList[b][i];
          break;
        }
      }
    }

    rows[i] = row;
  }

  if (rows.length > 0) {
    const lastRow = rows[rows.length - 1];
    if (activeBoxes.size > 0) lastRow.__boxes = Array.from(activeBoxes);
    if (activeLabels.size > 0) lastRow.__labels = Array.from(activeLabels);
    if (activeLines.size > 0) lastRow.__lines = Array.from(activeLines);
    if (activeLinefills.size > 0) lastRow.__linefills = Array.from(activeLinefills);
    if (activePolylines.size > 0) lastRow.__polylines = Array.from(activePolylines);
    if (activeTables.size > 0) lastRow.__tables = Array.from(activeTables);
  }

  return rows;
}

/**
 * Parses and dry-runs a Pine script against realistic sample candles so the Pine Editor
 * immediately catches both syntax AND runtime errors (unsupported functions, bad expressions, etc.).
 */
export function validatePineScript(
  code: string,
  context?: PineExecContext
): {
  ok: boolean;
  parsed?: ParsedPineScript;
  error?: string;
  phase?: 'parse' | 'runtime';
  warnings: string[];
} {
  let parsed: ParsedPineScript;
  try {
    parsed = parsePineScript(code);
  } catch (err: any) {
    return {
      ok: false,
      phase: 'parse',
      error: err?.message || 'Syntax error',
      warnings: [],
    };
  }

  const dummyBars: KLineData[] = Array.from({ length: 64 }, (_, i) => {
    const wave = Math.sin(i * 0.25) * 2.5;
    const base = 100 + i * 0.15 + wave;
    return {
      timestamp: 1700000000000 + i * 900000, // 15m bars so MTF ("60", "240") resampling exercises cleanly
      open: base - 0.3,
      high: base + 1.2,
      low: base - 1.2,
      close: base + 0.3,
      volume: 100 + (i % 15) * 12,
    };
  });

  try {
    executeParsedPine(
      parsed,
      dummyBars,
      parsed.inputs.map((x) => x.defaultVal),
      context
    );
    return { ok: true, parsed, warnings: parsed.warnings };
  } catch (err: any) {
    return {
      ok: false,
      parsed,
      phase: 'runtime',
      error: err?.message || 'Runtime execution error',
      warnings: parsed.warnings,
    };
  }
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  size: number,
  color: string
) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - size * Math.cos(angle - Math.PI / 6), toY - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - size * Math.cos(angle + Math.PI / 6), toY - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Registers a compiled Pine Script v4/v5/v6 indicator with KLineCharts v9,
 * combining native `figures` (for Y-axis auto-scaling & legend) with a custom
 * HTML5 Canvas `draw()` renderer for clouds (`fill`), dynamic multi-color lines,
 * `bgcolor`, `barcolor`, `plotcandle`/`plotbar`, `plotshape`/`plotchar`, and
 * Pine v6 drawing primitives (`line`, `linefill`, `box`, `polyline`, `label`, `table`).
 */
export function registerSavedPineWithKLine(saved: SavedPineIndicator) {
  const parsed = parsePineScript(saved.code);
  const figures: any[] = [];

  // Register transparent/standard figures so KLineCharts auto-scales the Y-axis & populates tooltip values
  parsed.plots.forEach((p) => {
    if (p.hidden) return;
    figures.push({
      key: p.key,
      title: `${p.title}: `,
      type:
        p.style === 'histogram' || p.style === 'columns'
          ? 'bar'
          : p.style === 'circles'
          ? 'circle'
          : 'line',
      styles: (data: any) => {
        const dynColor = data?.current?.indicatorData?.__plotColors?.[p.key] ?? p.fallbackColor;
        // Let our custom draw() handle dynamic multi-color lines/stepline/area/columns cleanly
        return {
          color: dynColor || 'transparent',
          size: 0,
        };
      },
    });
  });

  parsed.hlines.forEach((h) => {
    figures.push({
      key: h.key,
      title: '',
      type: 'line',
      styles: () => ({
        color: h.color,
        size: 1,
        style: h.linestyle === 'solid' ? 'solid' : 'dashed',
        dashedValue: h.linestyle === 'dotted' ? [2, 3] : [4, 4],
      }),
    });
  });

  // Memoization + adaptive live-tick throttling cache so heavy Pine scripts never freeze 60fps chart panning/ticks
  let calcCache: {
    len: number;
    firstTs: number;
    lastTs: number;
    lastClose: number;
    paramsKey: string;
    lastRunAt: number;
    lastExecMs: number;
    result: PineIndicatorRow[];
  } | null = null;

  registerIndicator({
    name: saved.name,
    shortName: saved.shortTitle || saved.title,
    calcParams: parsed.inputs.map((inp) => inp.defaultVal as any),
    figures,
    calc: (dataList: KLineData[], indicator: any) => {
      try {
        const len = dataList.length;
        if (len === 0) return [];
        const params: PineParamValue[] =
          Array.isArray(indicator?.calcParams) && indicator.calcParams.length > 0
            ? indicator.calcParams
            : parsed.inputs.map((inp) => inp.defaultVal);
        const firstTs = dataList[0]?.timestamp ?? 0;
        const lastTs = dataList[len - 1]?.timestamp ?? 0;
        const lastClose = dataList[len - 1]?.close ?? 0;
        const paramsKey = JSON.stringify(params);
        const now = Date.now();

        if (
          calcCache &&
          calcCache.len === len &&
          calcCache.firstTs === firstTs &&
          calcCache.lastTs === lastTs &&
          calcCache.paramsKey === paramsKey
        ) {
          if (calcCache.lastClose === lastClose) {
            return calcCache.result;
          }
          // Intra-bar live tick throttle for heavy scripts (>20ms): keep UI 60fps!
          if (calcCache.lastExecMs > 20) {
            const cooldownMs = Math.min(4000, Math.max(800, calcCache.lastExecMs * 6));
            if (now - calcCache.lastRunAt < cooldownMs) {
              return calcCache.result;
            }
          }
        }

        const t0 = performance.now();
        const result = executeParsedPine(parsed, dataList, params);
        const lastExecMs = performance.now() - t0;
        clearPineRuntimeDiagnostic(saved.name);
        calcCache = {
          len,
          firstTs,
          lastTs,
          lastClose,
          paramsKey,
          lastRunAt: now,
          lastExecMs,
          result,
        };
        return result;
      } catch (err: any) {
        const msg = err?.message || String(err);
        const lineMatch = /^Line\s+(\d+):/.exec(msg);
        setPineRuntimeDiagnostic(saved.name, {
          level: 'error',
          message: msg,
          line: lineMatch ? Number(lineMatch[1]) : undefined,
          timestamp: Date.now(),
        });
        console.warn(`[PineRuntime] Error in "${saved.title}" (${saved.name}):`, msg);
        return dataList.map(() => ({}));
      }
    },
    draw: ({ ctx, kLineDataList, bounding, indicator, xAxis, yAxis, visibleRange }: any) => {
      const result: PineIndicatorRow[] = indicator?.result || [];
      if (!result.length || !visibleRange) return false;

      const from = Math.max(0, visibleRange.from - 1);
      const to = Math.min(result.length - 1, visibleRange.to + 1);
      const viewLeft = bounding?.left ?? 0;
      const viewTop = bounding?.top ?? 0;
      const viewWidth = bounding?.width ?? ctx.canvas.width;
      const viewHeight = bounding?.height ?? ctx.canvas.height;
      const viewRight = viewLeft + viewWidth;
      const viewBottom = viewTop + viewHeight;

      const paneTop = yAxis.convertToPixel(yAxis.getExtremum?.()?.max ?? 0);
      const paneBot = yAxis.convertToPixel(yAxis.getExtremum?.()?.min ?? 0);
      const topY = Number.isFinite(paneTop) && Number.isFinite(paneBot) ? Math.min(paneTop, paneBot) : viewTop;
      const botY = Number.isFinite(paneTop) && Number.isFinite(paneBot) ? Math.max(paneTop, paneBot) : viewBottom;
      const barSpace =
        to > from
          ? Math.abs(xAxis.convertToPixel(from + 1) - xAxis.convertToPixel(from))
          : 8;
      const halfBar = Math.max(1, barSpace * 0.5);

      ctx.save();

      // 1. bgcolor(...) translucent vertical columns
      if (parsed.bgColors.length > 0) {
        for (let i = from; i <= to; i++) {
          const bg = result[i]?.__bgColor;
          if (!bg) continue;
          const x = xAxis.convertToPixel(i);
          ctx.fillStyle = bg;
          ctx.fillRect(x - halfBar, topY, Math.max(2, barSpace), Math.max(1, botY - topY));
        }
      }

      const resolveCoordX = (val: number, xloc?: 'bar_index' | 'bar_time'): number => {
        if (xloc === 'bar_time' || val > 1e11) {
          const n = kLineDataList.length;
          if (n === 0) return NaN;
          let lo = 0;
          let hi = n - 1;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (kLineDataList[mid].timestamp < val) lo = mid + 1;
            else hi = mid;
          }
          const idx = lo;
          const barTs = kLineDataList[idx].timestamp;
          const prevTs = idx > 0 ? kLineDataList[idx - 1].timestamp : barTs - 60000;
          const stepMs = Math.max(1000, barTs - prevTs);
          const frac = Math.max(-1, Math.min(1, (val - barTs) / stepMs));
          return xAxis.convertToPixel(idx) + frac * barSpace;
        }
        return xAxis.convertToPixel(val);
      };

      const resolveLineEndpoints = (ln: PineLineRenderItem) => {
        const rx1 = resolveCoordX(ln.x1, ln.xloc);
        const ry1 = yAxis.convertToPixel(ln.y1);
        const rx2 = resolveCoordX(ln.x2, ln.xloc);
        const ry2 = yAxis.convertToPixel(ln.y2);
        if (!Number.isFinite(rx1) || !Number.isFinite(ry1) || !Number.isFinite(rx2) || !Number.isFinite(ry2)) {
          return null;
        }
        let ax1 = rx1;
        let ay1 = ry1;
        let ax2 = rx2;
        let ay2 = ry2;
        const dx = rx2 - rx1;
        const dy = ry2 - ry1;
        if (Math.abs(dx) > 0.0001) {
          const slope = dy / dx;
          if (ln.extend === 'right' || ln.extend === 'both') {
            const targetX = dx >= 0 ? viewRight : viewLeft;
            ax2 = targetX;
            ay2 = ry1 + slope * (targetX - rx1);
          }
          if (ln.extend === 'left' || ln.extend === 'both') {
            const targetX = dx >= 0 ? viewLeft : viewRight;
            ax1 = targetX;
            ay1 = ry1 + slope * (targetX - rx1);
          }
        }
        return { x1: ax1, y1: ay1, x2: ax2, y2: ay2 };
      };

      const lastRow = result[result.length - 1];

      // 1.3. linefill.new(...) translucent quads between two lines
      const linefills = lastRow?.__linefills;
      if (linefills && linefills.length > 0) {
        for (const lf of linefills) {
          if (!lf.color || !lf.line1 || !lf.line2) continue;
          const p1 = resolveLineEndpoints(lf.line1);
          const p2 = resolveLineEndpoints(lf.line2);
          if (!p1 || !p2) continue;
          ctx.beginPath();
          ctx.moveTo(p1.x1, p1.y1);
          ctx.lineTo(p1.x2, p1.y2);
          ctx.lineTo(p2.x2, p2.y2);
          ctx.lineTo(p2.x1, p2.y1);
          ctx.closePath();
          ctx.fillStyle = lf.color;
          ctx.fill();
        }
      }

      // 1.5. box.new(...) rectangles (e.g. Support/Resistance Channels, Order Blocks, FVGs)
      const boxes = lastRow?.__boxes;
      if (boxes && boxes.length > 0) {
        for (const b of boxes) {
          if (!parsed.isMain && b.forceOverlay) continue;
          const yTop = yAxis.convertToPixel(b.top);
          const yBot = yAxis.convertToPixel(b.bottom);
          if (!Number.isFinite(yTop) || !Number.isFinite(yBot)) continue;
          const xLeftRaw = resolveCoordX(b.left, b.xloc);
          const xRightRaw = resolveCoordX(b.right, b.xloc);
          const x1 =
            b.extend === 'both' || b.extend === 'left'
              ? viewLeft
              : Number.isFinite(xLeftRaw)
              ? xLeftRaw
              : viewLeft;
          const x2 =
            b.extend === 'both' || b.extend === 'right'
              ? viewRight
              : Number.isFinite(xRightRaw)
              ? xRightRaw
              : viewRight;
          const rectX = Math.min(x1, x2);
          const rectW = Math.max(2, Math.abs(x2 - x1));
          const rectY = Math.min(yTop, yBot);
          const rectH = Math.max(1, Math.abs(yBot - yTop));

          if (b.bgcolor) {
            ctx.fillStyle = b.bgcolor;
            ctx.fillRect(rectX, rectY, rectW, rectH);
          }
          if (b.borderColor && b.borderWidth > 0) {
            ctx.strokeStyle = b.borderColor;
            ctx.lineWidth = b.borderWidth;
            ctx.strokeRect(rectX, rectY, rectW, rectH);
          }
          if (b.text && rectW >= 18) {
            ctx.font = '10px JetBrains Mono, monospace';
            ctx.fillStyle = b.textColor || '#d1d4dc';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(b.text, rectX + rectW / 2, rectY + rectH / 2, rectW - 2);
          }
        }
      }

      // 2. fill(p1, p2, color) cloud polygons
      if (parsed.fills.length > 0) {
        parsed.fills.forEach((f, fIdx) => {
          const fKey = `f${fIdx}`;
          for (let i = Math.max(1, from); i <= to; i++) {
            const cur = result[i];
            const prev = result[i - 1];
            const fillColor = cur?.__fillColors?.[fKey];
            if (!fillColor) continue;
            const v1a = prev?.[f.plot1Key];
            const v2a = prev?.[f.plot2Key];
            const v1b = cur?.[f.plot1Key];
            const v2b = cur?.[f.plot2Key];
            if (
              !Number.isFinite(v1a) ||
              !Number.isFinite(v2a) ||
              !Number.isFinite(v1b) ||
              !Number.isFinite(v2b)
            ) {
              continue;
            }
            const xPrev = xAxis.convertToPixel(i - 1);
            const xCur = xAxis.convertToPixel(i);
            const y1a = yAxis.convertToPixel(v1a);
            const y2a = yAxis.convertToPixel(v2a);
            const y1b = yAxis.convertToPixel(v1b);
            const y2b = yAxis.convertToPixel(v2b);

            ctx.beginPath();
            ctx.moveTo(xPrev, y1a);
            ctx.lineTo(xCur, y1b);
            ctx.lineTo(xCur, y2b);
            ctx.lineTo(xPrev, y2a);
            ctx.closePath();
            ctx.fillStyle = fillColor;
            ctx.fill();
          }
        });
      }

      // 2.5. plotcandle(...) / plotbar(...) custom OHLC overlays
      if (parsed.plotCandles && parsed.plotCandles.length > 0) {
        const bw = Math.max(2, Math.min(barSpace * 0.7, 14));
        for (const pc of parsed.plotCandles) {
          for (let i = from; i <= to; i++) {
            const cBar = result[i]?.__plotCandles?.[pc.key];
            if (!cBar) continue;
            const x = xAxis.convertToPixel(i);
            const yO = yAxis.convertToPixel(cBar.open);
            const yH = yAxis.convertToPixel(cBar.high);
            const yL = yAxis.convertToPixel(cBar.low);
            const yC = yAxis.convertToPixel(cBar.close);
            if (![x, yO, yH, yL, yC].every(Number.isFinite)) continue;

            if (cBar.kind === 'bar') {
              ctx.strokeStyle = cBar.color;
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.moveTo(x, yH);
              ctx.lineTo(x, yL);
              ctx.moveTo(x - bw * 0.45, yO);
              ctx.lineTo(x, yO);
              ctx.moveTo(x, yC);
              ctx.lineTo(x + bw * 0.45, yC);
              ctx.stroke();
            } else {
              ctx.strokeStyle = cBar.wickColor;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(x, yH);
              ctx.lineTo(x, yL);
              ctx.stroke();
              const topB = Math.min(yO, yC);
              const hB = Math.max(1.5, Math.abs(yC - yO));
              ctx.fillStyle = cBar.color;
              ctx.fillRect(x - bw / 2, topB, bw, hB);
              if (cBar.borderColor && cBar.borderColor !== cBar.color) {
                ctx.strokeStyle = cBar.borderColor;
                ctx.strokeRect(x - bw / 2, topB, bw, hB);
              }
            }
          }
        }
      }

      // 3. Dynamic multi-color plots (line, linebr, stepline, area, histogram, columns, circles, cross)
      for (const p of parsed.plots) {
        if (p.hidden) continue;
        const zeroY = yAxis.convertToPixel(0);

        if (p.style === 'histogram' || p.style === 'columns') {
          const w = Math.max(1.5, Math.min(barSpace * 0.72, 16));
          for (let i = from; i <= to; i++) {
            const v = result[i]?.[p.key];
            const c = result[i]?.__plotColors?.[p.key] || p.fallbackColor;
            if (!Number.isFinite(v) || !c) continue;
            const x = xAxis.convertToPixel(i);
            const y = yAxis.convertToPixel(v);
            ctx.fillStyle = c;
            const h = y - zeroY;
            if (h >= 0) ctx.fillRect(x - w / 2, zeroY, w, Math.max(1, h));
            else ctx.fillRect(x - w / 2, y, w, Math.max(1, -h));
          }
          continue;
        }

        if (p.style === 'circles' || p.style === 'cross') {
          const r = Math.max(2, p.lineWidth + 1);
          for (let i = from; i <= to; i++) {
            const v = result[i]?.[p.key];
            const c = result[i]?.__plotColors?.[p.key] || p.fallbackColor;
            if (!Number.isFinite(v) || !c) continue;
            const x = xAxis.convertToPixel(i);
            const y = yAxis.convertToPixel(v);
            if (p.style === 'circles') {
              ctx.beginPath();
              ctx.arc(x, y, r, 0, Math.PI * 2);
              ctx.fillStyle = c;
              ctx.fill();
            } else {
              ctx.strokeStyle = c;
              ctx.lineWidth = Math.max(1.2, p.lineWidth);
              ctx.beginPath();
              ctx.moveTo(x - r, y);
              ctx.lineTo(x + r, y);
              ctx.moveTo(x, y - r);
              ctx.lineTo(x, y + r);
              ctx.stroke();
            }
          }
          continue;
        }

        // Line / Linebr / Stepline / Area
        ctx.lineWidth = p.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        let prevValidIdx = -1;

        for (let i = from; i <= to; i++) {
          const v = result[i]?.[p.key];
          const c = result[i]?.__plotColors?.[p.key];
          if (!Number.isFinite(v) || !c) {
            if (p.style === 'linebr') prevValidIdx = -1;
            continue;
          }
          const x = xAxis.convertToPixel(i);
          const y = yAxis.convertToPixel(v);

          if (prevValidIdx >= 0 && (p.style !== 'linebr' || prevValidIdx === i - 1)) {
            const pv = result[prevValidIdx]?.[p.key];
            const px = xAxis.convertToPixel(prevValidIdx);
            const py = yAxis.convertToPixel(pv);

            if (p.style === 'area') {
              ctx.beginPath();
              ctx.moveTo(px, py);
              ctx.lineTo(x, y);
              ctx.lineTo(x, botY);
              ctx.lineTo(px, botY);
              ctx.closePath();
              ctx.fillStyle = c;
              ctx.globalAlpha = 0.2;
              ctx.fill();
              ctx.globalAlpha = 1;
            }

            ctx.beginPath();
            ctx.strokeStyle = c;
            ctx.moveTo(px, py);
            if (p.style === 'stepline') {
              ctx.lineTo(x, py);
              ctx.lineTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
          prevValidIdx = i;
        }
      }

      // 4. barcolor(...) translucent candle highlight overlay
      if (parsed.barColors.length > 0) {
        const bw = Math.max(2, Math.min(barSpace * 0.72, 14));
        for (let i = from; i <= to; i++) {
          const bc = result[i]?.__barColor;
          const bar = kLineDataList[i];
          if (!bc || !bar) continue;
          const x = xAxis.convertToPixel(i);
          const yOpen = yAxis.convertToPixel(bar.open);
          const yClose = yAxis.convertToPixel(bar.close);
          const yHigh = yAxis.convertToPixel(bar.high);
          const yLow = yAxis.convertToPixel(bar.low);
          ctx.strokeStyle = bc;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, yHigh);
          ctx.lineTo(x, yLow);
          ctx.stroke();
          ctx.fillStyle = bc;
          ctx.fillRect(x - bw / 2, Math.min(yOpen, yClose), bw, Math.max(1.5, Math.abs(yClose - yOpen)));
        }
      }

      // 4.5. polyline.new(...) vertex paths (straight or curved, open or closed)
      const polylines = lastRow?.__polylines;
      if (polylines && polylines.length > 0) {
        for (const pl of polylines) {
          if (!parsed.isMain && pl.forceOverlay) continue;
          const pts: Array<{ x: number; y: number }> = [];
          for (const v of pl.points) {
            const xVal = pl.xloc === 'bar_time' ? v.time ?? v.index ?? 0 : v.index ?? v.time ?? 0;
            const px = resolveCoordX(xVal, pl.xloc);
            const py = yAxis.convertToPixel(v.price);
            if (Number.isFinite(px) && Number.isFinite(py)) pts.push({ x: px, y: py });
          }
          if (pts.length < 2) continue;

          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          if (pl.curved && pts.length >= 3) {
            for (let k = 1; k < pts.length - 1; k++) {
              const mx = (pts[k].x + pts[k + 1].x) / 2;
              const my = (pts[k].y + pts[k + 1].y) / 2;
              ctx.quadraticCurveTo(pts[k].x, pts[k].y, mx, my);
            }
            ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
          } else {
            for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
          }
          if (pl.closed) ctx.closePath();

          if (pl.fillColor) {
            ctx.fillStyle = pl.fillColor;
            ctx.fill();
          }
          if (pl.lineColor) {
            ctx.strokeStyle = pl.lineColor;
            ctx.lineWidth = pl.lineWidth;
            ctx.setLineDash(
              pl.lineStyle === 'dashed' ? [6, 4] : pl.lineStyle === 'dotted' ? [2, 3] : []
            );
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }

      // 4.6. line.new(...) trendlines, BOS/CHoCH structure lines, session highs/lows
      const lines = lastRow?.__lines;
      if (lines && lines.length > 0) {
        for (const ln of lines) {
          if (!parsed.isMain && ln.forceOverlay) continue;
          if (!ln.color) continue;
          const ep = resolveLineEndpoints(ln);
          if (!ep) continue;
          ctx.strokeStyle = ln.color;
          ctx.lineWidth = ln.width;
          ctx.setLineDash(
            ln.style === 'dashed' ? [6, 4] : ln.style === 'dotted' ? [2, 3] : []
          );
          ctx.beginPath();
          ctx.moveTo(ep.x1, ep.y1);
          ctx.lineTo(ep.x2, ep.y2);
          ctx.stroke();
          ctx.setLineDash([]);

          if (ln.style === 'arrow_right' || ln.style === 'arrow_both') {
            drawArrowhead(ctx, ep.x1, ep.y1, ep.x2, ep.y2, 7 + ln.width, ln.color);
          }
          if (ln.style === 'arrow_left' || ln.style === 'arrow_both') {
            drawArrowhead(ctx, ep.x2, ep.y2, ep.x1, ep.y1, 7 + ln.width, ln.color);
          }
        }
      }

      // 4.7. label.new(...) styled pills, arrows, shapes & text labels
      const labels = lastRow?.__labels;
      if (labels && labels.length > 0) {
        for (const lb of labels) {
          if (!parsed.isMain && lb.forceOverlay) continue;
          const lx = resolveCoordX(lb.x, lb.xloc);
          let ly = yAxis.convertToPixel(lb.y);
          if (lb.yloc === 'abovebar' || lb.yloc === 'belowbar') {
            const barIdxClamped = Math.max(0, Math.min(kLineDataList.length - 1, Math.round(lb.x)));
            const bar = kLineDataList[barIdxClamped];
            if (bar) {
              ly =
                lb.yloc === 'abovebar'
                  ? yAxis.convertToPixel(bar.high) - 10
                  : yAxis.convertToPixel(bar.low) + 10;
            }
          }
          if (!Number.isFinite(lx) || !Number.isFinite(ly)) continue;

          const fontPx =
            lb.size === 'tiny' ? 9 : lb.size === 'large' ? 13 : lb.size === 'normal' ? 11 : 10;
          ctx.font = `600 ${fontPx}px -apple-system, BlinkMacSystemFont, "JetBrains Mono", sans-serif`;

          const isPill =
            lb.color &&
            (lb.style === 'labelup' ||
              lb.style === 'labeldown' ||
              lb.style === 'label_left' ||
              lb.style === 'label_right' ||
              lb.style === 'label_center');

          if (isPill && lb.color) {
            const linesTxt = (lb.text || '').split('\n');
            const maxW = linesTxt.reduce((m, t) => Math.max(m, ctx.measureText(t).width), 0);
            const padX = 6;
            const padY = 3;
            const lineH = fontPx + 3;
            const boxW = Math.max(16, maxW + padX * 2);
            const boxH = Math.max(14, linesTxt.length * lineH + padY * 2);
            const arrowSz = 5;

            let bx = lx - boxW / 2;
            let by = ly - boxH / 2;
            if (lb.style === 'labelup') by = ly + arrowSz;
            else if (lb.style === 'labeldown') by = ly - boxH - arrowSz;
            else if (lb.style === 'label_left') bx = lx + arrowSz;
            else if (lb.style === 'label_right') bx = lx - boxW - arrowSz;

            ctx.fillStyle = lb.color;
            drawRoundedRectPath(ctx, bx, by, boxW, boxH, 3);
            ctx.fill();

            // Directional pointer triangle
            if (lb.style === 'labelup') {
              ctx.beginPath();
              ctx.moveTo(lx, ly);
              ctx.lineTo(lx - arrowSz, by + 0.5);
              ctx.lineTo(lx + arrowSz, by + 0.5);
              ctx.closePath();
              ctx.fill();
            } else if (lb.style === 'labeldown') {
              ctx.beginPath();
              ctx.moveTo(lx, ly);
              ctx.lineTo(lx - arrowSz, by + boxH - 0.5);
              ctx.lineTo(lx + arrowSz, by + boxH - 0.5);
              ctx.closePath();
              ctx.fill();
            } else if (lb.style === 'label_left') {
              ctx.beginPath();
              ctx.moveTo(lx, ly);
              ctx.lineTo(bx + 0.5, ly - arrowSz);
              ctx.lineTo(bx + 0.5, ly + arrowSz);
              ctx.closePath();
              ctx.fill();
            } else if (lb.style === 'label_right') {
              ctx.beginPath();
              ctx.moveTo(lx, ly);
              ctx.lineTo(bx + boxW - 0.5, ly - arrowSz);
              ctx.lineTo(bx + boxW - 0.5, ly + arrowSz);
              ctx.closePath();
              ctx.fill();
            }

            if (lb.text) {
              ctx.fillStyle = lb.textColor || '#ffffff';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              linesTxt.forEach((lineStr, idxLine) => {
                ctx.fillText(lineStr, bx + boxW / 2, by + padY + lineH * (idxLine + 0.5));
              });
            }
          } else if (
            lb.color &&
            (lb.style === 'circle' ||
              lb.style === 'diamond' ||
              lb.style === 'triangleup' ||
              lb.style === 'triangledown')
          ) {
            const r = fontPx * 0.45;
            ctx.fillStyle = lb.color;
            ctx.beginPath();
            if (lb.style === 'circle') {
              ctx.arc(lx, ly, r, 0, Math.PI * 2);
            } else if (lb.style === 'diamond') {
              ctx.moveTo(lx, ly - r);
              ctx.lineTo(lx + r, ly);
              ctx.lineTo(lx, ly + r);
              ctx.lineTo(lx - r, ly);
            } else if (lb.style === 'triangleup') {
              ctx.moveTo(lx, ly - r);
              ctx.lineTo(lx - r, ly + r);
              ctx.lineTo(lx + r, ly + r);
            } else {
              ctx.moveTo(lx, ly + r);
              ctx.lineTo(lx - r, ly - r);
              ctx.lineTo(lx + r, ly - r);
            }
            ctx.closePath();
            ctx.fill();
            if (lb.text) {
              ctx.fillStyle = lb.textColor || '#d1d4dc';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
              ctx.fillText(lb.text, lx, ly - r - 2);
            }
          } else if (lb.text) {
            ctx.fillStyle = lb.textColor || '#d1d4dc';
            ctx.textAlign = lb.style === 'label_left' ? 'left' : lb.style === 'label_right' ? 'right' : 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(lb.text, lx + (lb.style === 'label_left' ? 4 : lb.style === 'label_right' ? -4 : 0), ly);
          }
        }
      }

      // 5. plotshape(...) & plotchar(...) markers
      if (parsed.shapes.length > 0) {
        for (const s of parsed.shapes) {
          const sz = s.size === 'tiny' ? 4 : s.size === 'large' ? 8 : s.size === 'normal' ? 6.5 : 5.5;
          for (let i = from; i <= to; i++) {
            const hit = result[i]?.__shapeHits?.[s.key];
            const bar = kLineDataList[i];
            if (!hit?.hit || !bar) continue;

            const x = xAxis.convertToPixel(i);
            let y: number;
            if (s.location === 'belowbar') {
              y = yAxis.convertToPixel(bar.low) + sz + 6;
            } else if (s.location === 'abovebar') {
              y = yAxis.convertToPixel(bar.high) - sz - 6;
            } else if (s.location === 'top') {
              y = topY + sz + 8;
            } else if (s.location === 'bottom') {
              y = botY - sz - 8;
            } else {
              y = yAxis.convertToPixel(bar.close);
            }

            ctx.fillStyle = hit.color;
            ctx.strokeStyle = hit.color;

            if (s.shape === 'triangleup' || s.shape === 'labelup') {
              ctx.beginPath();
              ctx.moveTo(x, y - sz);
              ctx.lineTo(x - sz, y + sz * 0.8);
              ctx.lineTo(x + sz, y + sz * 0.8);
              ctx.closePath();
              ctx.fill();
            } else if (s.shape === 'triangledown' || s.shape === 'labeldown') {
              ctx.beginPath();
              ctx.moveTo(x, y + sz);
              ctx.lineTo(x - sz, y - sz * 0.8);
              ctx.lineTo(x + sz, y - sz * 0.8);
              ctx.closePath();
              ctx.fill();
            } else if (s.shape === 'diamond') {
              ctx.beginPath();
              ctx.moveTo(x, y - sz);
              ctx.lineTo(x + sz, y);
              ctx.lineTo(x, y + sz);
              ctx.lineTo(x - sz, y);
              ctx.closePath();
              ctx.fill();
            } else if (s.shape === 'circle') {
              ctx.beginPath();
              ctx.arc(x, y, sz * 0.75, 0, Math.PI * 2);
              ctx.fill();
            } else if (s.shape === 'cross' || s.shape === 'xcross') {
              ctx.lineWidth = 1.6;
              ctx.beginPath();
              if (s.shape === 'cross') {
                ctx.moveTo(x - sz, y);
                ctx.lineTo(x + sz, y);
                ctx.moveTo(x, y - sz);
                ctx.lineTo(x, y + sz);
              } else {
                ctx.moveTo(x - sz * 0.8, y - sz * 0.8);
                ctx.lineTo(x + sz * 0.8, y + sz * 0.8);
                ctx.moveTo(x + sz * 0.8, y - sz * 0.8);
                ctx.lineTo(x - sz * 0.8, y + sz * 0.8);
              }
              ctx.stroke();
            } else if (s.shape === 'char' && s.charGlyph) {
              ctx.font = `bold ${Math.round(sz * 2)}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(s.charGlyph, x, y);
            }

            if (s.text) {
              ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = s.location === 'belowbar' ? 'top' : 'bottom';
              const textY = s.location === 'belowbar' ? y + sz + 2 : y - sz - 2;
              ctx.fillStyle = hit.color;
              ctx.fillText(s.text, x, textY);
            }
          }
        }
      }

      // 6. table.new(...) / table.cell(...) anchored dashboard tables (9 TradingView corners)
      const tables = lastRow?.__tables;
      if (tables && tables.length > 0) {
        for (const tbl of tables) {
          if (!parsed.isMain && tbl.forceOverlay) continue;
          const cellList = Object.values(tbl.cells);
          if (cellList.length === 0) continue;

          let maxCol = 0;
          let maxRow = 0;
          for (const cell of cellList) {
            if (cell.col > maxCol) maxCol = cell.col;
            if (cell.row > maxRow) maxRow = cell.row;
          }
          const numCols = maxCol + 1;
          const numRows = maxRow + 1;
          const colWidths = new Array<number>(numCols).fill(28);
          const rowHeights = new Array<number>(numRows).fill(20);
          const padX = 8;
          const padY = 4;

          for (const cell of cellList) {
            if (cell.merged) continue;
            const fontPx =
              cell.textSize === 'tiny'
                ? 9
                : cell.textSize === 'large'
                ? 13
                : cell.textSize === 'normal'
                ? 11.5
                : 10.5;
            ctx.font = `500 ${fontPx}px -apple-system, BlinkMacSystemFont, "JetBrains Mono", sans-serif`;
            const linesTxt = (cell.text || '').split('\n');
            const textW = linesTxt.reduce((m, t) => Math.max(m, ctx.measureText(t).width), 0);
            const neededW = Math.ceil(textW + padX * 2);
            const neededH = Math.ceil(linesTxt.length * (fontPx + 3) + padY * 2);
            if (!cell.colSpan || cell.colSpan === 1) {
              colWidths[cell.col] = Math.max(colWidths[cell.col], neededW);
            }
            if (!cell.rowSpan || cell.rowSpan === 1) {
              rowHeights[cell.row] = Math.max(rowHeights[cell.row], neededH);
            }
          }

          const totalW = colWidths.reduce((a, b) => a + b, 0);
          const totalH = rowHeights.reduce((a, b) => a + b, 0);
          const margin = 12;

          let startX = viewRight - totalW - margin;
          let startY = viewTop + margin;
          const pos = tbl.position || 'top_right';
          if (pos.includes('left')) startX = viewLeft + margin;
          else if (pos.includes('center')) startX = viewLeft + (viewWidth - totalW) / 2;
          else startX = viewRight - totalW - margin;

          if (pos.startsWith('bottom')) startY = viewBottom - totalH - margin;
          else if (pos.startsWith('middle')) startY = viewTop + (viewHeight - totalH) / 2;
          else startY = viewTop + margin;

          startX = Math.round(startX);
          startY = Math.round(startY);

          if (tbl.bgcolor) {
            ctx.fillStyle = tbl.bgcolor;
            ctx.fillRect(startX, startY, totalW, totalH);
          }

          const colOffsets = new Array<number>(numCols + 1).fill(0);
          for (let c = 0; c < numCols; c++) colOffsets[c + 1] = colOffsets[c] + colWidths[c];
          const rowOffsets = new Array<number>(numRows + 1).fill(0);
          for (let r = 0; r < numRows; r++) rowOffsets[r + 1] = rowOffsets[r] + rowHeights[r];

          for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < numCols; c++) {
              const cell = tbl.cells[`${r}_${c}`];
              if (cell?.merged) continue;
              const cSpan = Math.min(numCols - c, Math.max(1, cell?.colSpan ?? 1));
              const rSpan = Math.min(numRows - r, Math.max(1, cell?.rowSpan ?? 1));
              const cx = startX + colOffsets[c];
              const cy = startY + rowOffsets[r];
              const cw = colOffsets[c + cSpan] - colOffsets[c];
              const ch = rowOffsets[r + rSpan] - rowOffsets[r];

              if (cell?.bgcolor) {
                ctx.fillStyle = cell.bgcolor;
                ctx.fillRect(cx, cy, cw, ch);
              }
              if (tbl.borderColor && tbl.borderWidth > 0) {
                ctx.strokeStyle = tbl.borderColor;
                ctx.lineWidth = tbl.borderWidth;
                ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);
              }
              if (cell?.text) {
                const fontPx =
                  cell.textSize === 'tiny'
                    ? 9
                    : cell.textSize === 'large'
                    ? 13
                    : cell.textSize === 'normal'
                    ? 11.5
                    : 10.5;
                ctx.font = `500 ${fontPx}px -apple-system, BlinkMacSystemFont, "JetBrains Mono", sans-serif`;
                ctx.fillStyle = cell.textColor || '#d1d4dc';
                const hAlign = cell.textHalign || 'center';
                ctx.textAlign = hAlign;
                ctx.textBaseline = 'middle';
                const tx =
                  hAlign === 'left'
                    ? cx + padX
                    : hAlign === 'right'
                    ? cx + cw - padX
                    : cx + cw / 2;
                const linesTxt = cell.text.split('\n');
                const lineH = fontPx + 3;
                const blockH = linesTxt.length * lineH;
                const baseY =
                  cell.textValign === 'top'
                    ? cy + padY + lineH / 2
                    : cell.textValign === 'bottom'
                    ? cy + ch - padY - blockH + lineH / 2
                    : cy + ch / 2 - blockH / 2 + lineH / 2;
                linesTxt.forEach((lineStr, idxLine) => {
                  ctx.fillText(lineStr, tx, baseY + idxLine * lineH, cw - padX);
                });
              }
            }
          }

          if (tbl.frameColor && tbl.frameWidth > 0) {
            ctx.strokeStyle = tbl.frameColor;
            ctx.lineWidth = tbl.frameWidth;
            ctx.strokeRect(startX + 0.5, startY + 0.5, totalW - 1, totalH - 1);
          }
        }
      }

      ctx.restore();
      return false; // Let KLineCharts still render hlines & axis labels
    },
  });
}
