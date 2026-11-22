import { registerIndicator, KLineData } from 'klinecharts';
import {
  ParsedPineScript,
  PineBoxRenderItem,
  PineLabelRenderItem,
  PineParamValue,
  PineStatement,
  SavedPineIndicator,
} from './pineTypes';
import {
  boolParam,
  PINE_ARRAY_OBJECT,
  PINE_COLOR_OBJECT,
  PINE_MATH_OBJECT,
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
import { parsePineScript, splitTopLevelArgs } from './pineParser';

// Internal execution value types:
// - number[] (series of length `len`)
// - Array<string | null> (color/string series of length `len`)
// - number[][] (multi-output tuple of numeric series)
// - scalar (string | boolean | number) or JS array (from array.new_*)
type PineEnvValue = any;

interface UserFuncDef {
  params: string[];
  body: string;
  stmts?: PineStatement[];
}

const ARRAY_METHODS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'get',
  'set',
  'size',
  'first',
  'last',
  'clear',
  'sum',
  'avg',
  'max',
  'min',
  'includes',
]);

const V4_TA_ALIASES =
  /\b(sma|ema|rma|wma|vwma|hma|swma|alma|linreg|rsi|atr|stdev|variance|dev|median|highest|lowest|highestbars|lowestbars|cci|mom|roc|change|cum|crossover|crossunder|cross|rising|falling|vwap|supertrend|stoch|sar|pivothigh|pivotlow|barssince|valuewhen|mfi|tsi|cmo|bbw|correlation|percentrank)\s*\(/g;

function normalizePineExprSyntax(raw: string): string {
  let s = raw.trim();

  // Pine v6 generic array constructors: `array.new<float>(...)`, `array.new<Cnd>(0)` -> `array.new_float(...)` / `array.new_any(...)`
  s = s.replace(/\barray\.new<\s*(float|int|bool|string|color|box|line|label)\s*>\s*\(/g, 'array.new_$1(');
  s = s.replace(/\barray\.new<\s*[^>]+\s*>\s*\(/g, 'array.new_any(');

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

  // Pine v6 `time(tf)` / `time_close(tf)` function calls (distinct from `time` / `time_close` series)
  s = s.replace(/(?<![.\w])time\s*\(/g, '__timeFn(i, ');
  s = s.replace(/(?<![.\w])time_close\s*\(/g, '__timeCloseFn(i, ');

  // Pine v6 array method calls: `arr.get(-1)` -> `array.get(arr, -1)`
  s = rewriteArrayMethodCalls(s);

  // Pine v6 named-argument calls (`box.new(...)`, `line.new(...)`, `label.new(...)`, `table.new(...)`, `table.cell(...)`, UDT `Cnd.new(...)`, `request.security_lower_tf(...)`)
  s = rewriteNamedObjectCallsGeneric(s);

  return s;
}

const NAMED_CALL_TARGETS = new Set([
  'box.new',
  'line.new',
  'label.new',
  'table.new',
  'table.cell',
  'request.security',
  'request.security_lower_tf',
]);

function rewriteNamedObjectCallsGeneric(expr: string): string {
  const re = /\b([a-zA-Z_]\w*\.[a-zA-Z_]\w*)\s*\(/g;
  let out = expr;
  let guard = 0;
  while (guard < 40) {
    re.lastIndex = 0;
    let changed = false;
    let m: RegExpExecArray | null;
    while ((m = re.exec(out)) !== null) {
      const fnFull = m[1];
      const isUdtNew = /^[A-Z]\w*\.new$/.test(fnFull);
      if (!isUdtNew && !NAMED_CALL_TARGETS.has(fnFull)) continue;

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

function rewriteArrayMethodCalls(expr: string): string {
  // Rewrite `ident.method(args)` -> `array.method(ident, args)` for known array methods
  return expr.replace(
    /\b([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)\s*\(([^()]*)\)/g,
    (match, obj: string, method: string, args: string) => {
      if (obj === 'array' || obj === 'ta' || obj === 'math' || obj === 'color' || obj === 'str') {
        return match;
      }
      if (!ARRAY_METHODS.has(method)) return match;
      const trimmedArgs = args.trim();
      return trimmedArgs
        ? `array.${method}(${obj}, ${trimmedArgs})`
        : `array.${method}(${obj})`;
    }
  );
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
    sma: (s, l) => taSma(toNumericSeries(s, len), scalarParam(l, 14)),
    ema: (s, l) => taEma(toNumericSeries(s, len), scalarParam(l, 14)),
    rma: (s, l) => taRma(toNumericSeries(s, len), scalarParam(l, 14)),
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
      taLinreg(toNumericSeries(s, len), scalarParam(l, 14), scalarParam(off, 0)),
    rsi: (s, l) => taRsi(toNumericSeries(s, len), scalarParam(l, 14)),
    tr: (handleNa) => taTr(high, low, close, boolParam(handleNa, false)),
    atr: (l) => taAtr(high, low, close, scalarParam(l, 14)),
    stdev: (s, l) => taStdev(toNumericSeries(s, len), scalarParam(l, 20)),
    variance: (s, l) => taVariance(toNumericSeries(s, len), scalarParam(l, 20)),
    dev: (s, l) => taDev(toNumericSeries(s, len), scalarParam(l, 20)),
    median: (s, l) => taMedian(toNumericSeries(s, len), scalarParam(l, 14)),
    highest: (a, b) =>
      b === undefined
        ? taHighest(high, scalarParam(a, 20))
        : taHighest(toNumericSeries(a, len), scalarParam(b, 20)),
    lowest: (a, b) =>
      b === undefined
        ? taLowest(low, scalarParam(a, 20))
        : taLowest(toNumericSeries(a, len), scalarParam(b, 20)),
    highestbars: (a, b) =>
      b === undefined
        ? taHighestBars(high, scalarParam(a, 20))
        : taHighestBars(toNumericSeries(a, len), scalarParam(b, 20)),
    lowestbars: (a, b) =>
      b === undefined
        ? taLowestBars(low, scalarParam(a, 20))
        : taLowestBars(toNumericSeries(a, len), scalarParam(b, 20)),
    cci: (s, l) => taCci(toNumericSeries(s, len), scalarParam(l, 20)),
    mom: (s, l) => taMom(toNumericSeries(s, len), scalarParam(l, 10)),
    roc: (s, l) => taRoc(toNumericSeries(s, len), scalarParam(l, 10)),
    change: (s, l) => taChange(toNumericSeries(s, len), scalarParam(l ?? 1, 1)),
    cum: (s) => taCum(toNumericSeries(s, len)),
    sum: (s, l) => taSum(toNumericSeries(s, len), scalarParam(l, 14)),
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
      taValueWhen(toNumericSeries(cond, len), toNumericSeries(src, len), scalarParam(occ, 0)),
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
  allowTuple = false
): any {
  const inlined = inlineUserFunctions(rawExpr, funcs);
  let transformed = normalizePineExprSyntax(inlined);

  // Direct tuple call check (e.g. `ta.supertrend(3, 10)`, `ta.bb(close, 20, 2)`, `ta.macd(...)`, `ta.dmi(...)`, `ta.kc(...)`)
  const directTaMatch = /^ta\.([a-zA-Z_]\w*)\((.*)\)$/.exec(transformed);
  if (allowTuple && directTaMatch && isBalancedOuterParens(directTaMatch[2])) {
    const fn = ta[directTaMatch[1]];
    if (fn) {
      const argParts = directTaMatch[2].trim() ? splitTopLevelArgs(directTaMatch[2]) : [];
      const evalArgs = argParts.map((a) => evalPineExprVector(a, env, ta, funcs, len, false));
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

  const tempVars: Record<string, PineEnvValue> = { ...env };
  let tempCounter = 0;

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
    const evalArgs = argParts.map((a) => evalPineExprVector(a, tempVars, ta, funcs, len, false));
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
    'str',
    '__timeFn',
    '__timeCloseFn',
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
      PINE_STR_OBJECT,
      __timeFn,
      __timeCloseFn,
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
  localShapeKey?: string
): any {
  const shapeKey = localShapeKey !== undefined ? localShapeKey : Object.keys(localVars).join(',');
  const cacheKey = `${rawExpr}@@${shapeKey}@@${envSeriesSet ? envSeriesSet.size : len}`;
  let compiled = __singleBarFnCache.get(cacheKey);
  if (!compiled) {
    const localKeys = shapeKey ? shapeKey.split(',') : [];
    const localSet = new Set(localKeys);
    const seriesSet =
      envSeriesSet ||
      new Set(Object.keys(env).filter((k) => !localSet.has(k) && isSeriesArray(env[k], len)));
    const envKeys = envKeySet || new Set(Object.keys(env));

    const inlined = inlineUserFunctions(rawExpr, funcs);
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
      'str',
      '__timeFn',
      '__timeCloseFn',
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
    PINE_STR_OBJECT,
    __timeFn,
    __timeCloseFn
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
      const val = evalSingleBarExpr(
        st.expr,
        env,
        localVars,
        funcs,
        barIdx,
        len,
        execCtx.envSeriesSet,
        execCtx.envKeySet,
        execCtx.localShapeKey
      );
      if (targetObj && typeof targetObj === 'object') {
        targetObj[propName] = val;
      }
      lastVal = val;
      continue;
    }

    if (st.kind === 'prop_compound' && st.propTarget && st.expr && st.op) {
      const [objName, propName] = st.propTarget.split('.');
      const targetObj = objName in localVars ? localVars[objName] : env[objName];
      const rhs = Number(
        evalSingleBarExpr(
          st.expr,
          env,
          localVars,
          funcs,
          barIdx,
          len,
          execCtx.envSeriesSet,
          execCtx.envKeySet,
          execCtx.localShapeKey
        )
      );
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
      const keyVal = st.switchExpr
        ? evalSingleBarExpr(
            st.switchExpr,
            env,
            localVars,
            funcs,
            barIdx,
            len,
            execCtx.envSeriesSet,
            execCtx.envKeySet,
            execCtx.localShapeKey
          )
        : null;
      let chosen: any = NaN;
      let matched = false;
      let defaultExpr: string | null = null;
      for (const c of st.cases) {
        if (c.matchExpr === null) {
          defaultExpr = c.resultExpr;
          continue;
        }
        const mVal = evalSingleBarExpr(
          c.matchExpr,
          env,
          localVars,
          funcs,
          barIdx,
          len,
          execCtx.envSeriesSet,
          execCtx.envKeySet,
          execCtx.localShapeKey
        );
        if (st.switchExpr ? keyVal === mVal : isPineTruthy(mVal)) {
          chosen = evalSingleBarExpr(
            c.resultExpr,
            env,
            localVars,
            funcs,
            barIdx,
            len,
            execCtx.envSeriesSet,
            execCtx.envKeySet,
            execCtx.localShapeKey
          );
          matched = true;
          break;
        }
      }
      if (!matched && defaultExpr) {
        chosen = evalSingleBarExpr(
          defaultExpr,
          env,
          localVars,
          funcs,
          barIdx,
          len,
          execCtx.envSeriesSet,
          execCtx.envKeySet,
          execCtx.localShapeKey
        );
      }
      if (st.varName) {
        if (isLocalScope) setLocal(st.varName, chosen);
        else {
          if (!env[st.varName] || !isSeriesArray(env[st.varName], len)) {
            env[st.varName] = new Array(len).fill(NaN);
            execCtx.envSeriesSet.add(st.varName);
            execCtx.envKeySet.add(st.varName);
          }
          env[st.varName][barIdx] = chosen;
        }
      }
      lastVal = chosen;
      continue;
    }

    if (st.kind === 'while_loop' && st.whileCond) {
      let guard = 0;
      while (
        ++guard <= 200 &&
        isPineTruthy(
          evalSingleBarExpr(
            st.whileCond,
            env,
            localVars,
            funcs,
            barIdx,
            len,
            execCtx.envSeriesSet,
            execCtx.envKeySet,
            execCtx.localShapeKey
          )
        )
      ) {
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
      const arr = evalSingleBarExpr(
        st.iterExpr,
        env,
        localVars,
        funcs,
        barIdx,
        len,
        execCtx.envSeriesSet,
        execCtx.envKeySet,
        execCtx.localShapeKey
      );
      if (Array.isArray(arr) && arr.length > 0) {
        const hadPrev = st.loopVar in localVars;
        const prevVal = localVars[st.loopVar];
        const prevShapeKey = execCtx.localShapeKey;
        setLocal(st.loopVar, arr[0]);
        for (let idx = 0; idx < arr.length && idx < 500; idx++) {
          localVars[st.loopVar] = arr[idx];
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
        else {
          delete localVars[st.loopVar];
          execCtx.localShapeKey = prevShapeKey;
        }
      }
      continue;
    }

    if (st.kind === 'tuple_assign' && st.varNames && st.expr) {
      const val = evalSingleBarExpr(
        st.expr,
        env,
        localVars,
        funcs,
        barIdx,
        len,
        execCtx.envSeriesSet,
        execCtx.envKeySet,
        execCtx.localShapeKey
      );
      st.varNames.forEach((vn, idx) => {
        if (vn && vn !== '_') {
          const elem = Array.isArray(val) ? val[idx] : NaN;
          if (isLocalScope) setLocal(vn, elem);
          else {
            if (!env[vn] || !isSeriesArray(env[vn], len)) {
              env[vn] = new Array(len).fill(NaN);
              execCtx.envSeriesSet.add(vn);
              execCtx.envKeySet.add(vn);
            }
            env[vn][barIdx] = elem;
          }
        }
      });
      lastVal = val;
      continue;
    }

    if (st.kind === 'assign' && st.varName && st.expr) {
      const val = evalSingleBarExpr(
        st.expr,
        env,
        localVars,
        funcs,
        barIdx,
        len,
        execCtx.envSeriesSet,
        execCtx.envKeySet,
        execCtx.localShapeKey
      );
      if (Array.isArray(val) && /^\s*array\.new/.test(st.expr)) {
        (val as any).__isPineArray = true;
      }
      if (st.varName !== '__expr_stmt') {
        if (isLocalScope) {
          setLocal(st.varName, val);
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
      const val = evalSingleBarExpr(
        st.expr,
        env,
        localVars,
        funcs,
        barIdx,
        len,
        execCtx.envSeriesSet,
        execCtx.envKeySet,
        execCtx.localShapeKey
      );
      if (st.varName in localVars) {
        localVars[st.varName] = val;
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
      const rhs = Number(
        evalSingleBarExpr(
          st.expr,
          env,
          localVars,
          funcs,
          barIdx,
          len,
          execCtx.envSeriesSet,
          execCtx.envKeySet,
          execCtx.localShapeKey
        )
      );
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
        const condOk =
          br.cond === null
            ? true
            : isPineTruthy(
                evalSingleBarExpr(
                  br.cond,
                  env,
                  localVars,
                  funcs,
                  barIdx,
                  len,
                  execCtx.envSeriesSet,
                  execCtx.envKeySet,
                  execCtx.localShapeKey
                )
              );
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
              ? evalSingleBarExpr(
                  br.resultExpr,
                  env,
                  localVars,
                  funcs,
                  barIdx,
                  len,
                  execCtx.envSeriesSet,
                  execCtx.envKeySet,
                  execCtx.localShapeKey
                )
              : val;
          if (st.varName) {
            if (isLocalScope) setLocal(st.varName, lastVal);
            else {
              if (!env[st.varName] || !isSeriesArray(env[st.varName], len)) {
                env[st.varName] = new Array(len).fill(NaN);
                execCtx.envSeriesSet.add(st.varName);
                execCtx.envKeySet.add(st.varName);
              }
              env[st.varName][barIdx] = lastVal;
            }
          }
          break;
        }
      }
    } else if (st.kind === 'for_loop' && st.loopVar && st.loopStart && st.loopEnd) {
      const start = Math.trunc(
        Number(
          evalSingleBarExpr(
            st.loopStart,
            env,
            localVars,
            funcs,
            barIdx,
            len,
            execCtx.envSeriesSet,
            execCtx.envKeySet,
            execCtx.localShapeKey
          )
        )
      );
      const end = Math.trunc(
        Number(
          evalSingleBarExpr(
            st.loopEnd,
            env,
            localVars,
            funcs,
            barIdx,
            len,
            execCtx.envSeriesSet,
            execCtx.envKeySet,
            execCtx.localShapeKey
          )
        )
      );
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (start === 0 && end < 0) continue;
      if (end === 0 && start < 0) continue;

      const step = Math.max(
        1,
        Math.abs(
          Math.trunc(
            Number(
              evalSingleBarExpr(
                st.loopStep || '1',
                env,
                localVars,
                funcs,
                barIdx,
                len,
                execCtx.envSeriesSet,
                execCtx.envKeySet,
                execCtx.localShapeKey
              )
            )
          )
        )
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
  len: number
): Array<string | null> {
  if (!colorExpr || colorExpr === 'na') return new Array(len).fill(null);
  try {
    const raw = evalPineExprVector(colorExpr, env, ta, funcs, len, false);
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

export interface PineIndicatorRow {
  [key: string]: any;
  __plotColors?: Record<string, string | null>;
  __fillColors?: Record<string, string | null>;
  __shapeHits?: Record<string, { hit: boolean; color: string }>;
  __bgColor?: string | null;
  __barColor?: string | null;
  __boxes?: PineBoxRenderItem[];
  __labels?: PineLabelRenderItem[];
}

export function executeParsedPine(
  parsed: ParsedPineScript,
  dataList: KLineData[],
  calcParams: PineParamValue[]
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
  const currentBarRef = { idx: 0 };

  const boxNamespace = {
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
        left = Number(o.left ?? o.__p0 ?? left);
        top = Number(o.top ?? o.__p1 ?? NaN);
        right = Number(o.right ?? o.__p2 ?? left + 1);
        bottom = Number(o.bottom ?? o.__p3 ?? NaN);
        borderColor = o.border_color ?? o.__p4 ?? borderColor;
        borderWidth = o.border_width !== undefined ? Number(o.border_width) : Number(o.__p5 ?? 1);
        extend = (o.extend ?? o.__p7 ?? 'none') as any;
        xloc = (o.xloc ?? o.__p8 ?? 'bar_index') as any;
        bgcolor = o.bgcolor ?? o.__p9 ?? borderColor;
        text = o.text !== undefined ? String(o.text) : '';
        textColor = o.text_color ? String(o.text_color) : '#d1d4dc';
        forceOverlay = Boolean(o.force_overlay);
      } else {
        left = Number(args[0] ?? left);
        top = Number(args[1] ?? NaN);
        right = Number(args[2] ?? left + 1);
        bottom = Number(args[3] ?? NaN);
        borderColor = args[4] ?? borderColor;
        borderWidth = args[5] !== undefined ? Number(args[5]) : 1;
        extend = (args[7] ?? 'none') as any;
        xloc = (args[8] ?? 'bar_index') as any;
        bgcolor = args[9] ?? borderColor;
      }

      const item: PineBoxRenderItem = {
        left,
        right,
        top,
        bottom,
        bgcolor: bgcolor && bgcolor !== 'na' ? String(bgcolor) : null,
        borderColor: borderColor && borderColor !== 'na' ? String(borderColor) : null,
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
    set_bgcolor: (b: any, c: string) => {
      if (b) b.bgcolor = c && c !== 'na' ? String(c) : null;
    },
    set_border_color: (b: any, c: string) => {
      if (b) b.borderColor = c && c !== 'na' ? String(c) : null;
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
  };

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
        from_index: (index: number, price: number) => ({ index, price }),
        from_time: (time: number, price: number) => ({ time, price }),
        new: (time: number, index: number, price: number) => ({ time, index, price }),
        copy: (pt: any) => ({ ...pt }),
      },
    },
    syminfo: {
      mintick: 0.0001,
      pointvalue: 1,
      ticker: 'CHART',
      tickerid: 'CHART',
      prefix: 'FX',
      root: 'CHART',
      currency: 'USD',
      basecurrency: 'EUR',
      type: 'forex',
      timezone: 'Etc/UTC',
      session: 'regular',
      volumetype: 'tick',
    },
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
      security_lower_tf: (_sym: any, _tf: any, exprVal: any) => [exprVal],
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
    },
    font: {
      family_default: 'default',
      family_monospace: 'monospace',
    },
    xloc: { bar_index: 'bar_index', bar_time: 'bar_time' },
    yloc: { price: 'price', abovebar: 'abovebar', belowbar: 'belowbar' },
    extend: { none: 'none', left: 'left', right: 'right', both: 'both' },
    line: Object.assign((x: any) => (x === 'na' || Number.isNaN(x) ? null : x), {
      style_solid: 'solid',
      style_dashed: 'dashed',
      style_dotted: 'dotted',
      style_arrow_left: 'solid',
      style_arrow_right: 'solid',
      style_arrow_both: 'solid',
      new: (...args: any[]) => ({ __type: 'line', args }),
      delete: () => {},
      set_x1: () => {},
      set_x2: () => {},
      set_y1: () => {},
      set_y2: () => {},
      set_xy1: () => {},
      set_xy2: () => {},
      set_style: () => {},
      set_color: () => {},
      set_width: () => {},
    }),
    label: Object.assign((x: any) => (x === 'na' || Number.isNaN(x) ? null : x), {
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
      new: (...args: any[]) => {
        const o = args.length === 1 && args[0] && typeof args[0] === 'object' ? args[0] : {};
        const item: PineLabelRenderItem = {
          x: Number(o.x ?? o.__p0 ?? args[0] ?? currentBarRef.idx),
          y: Number(o.y ?? o.__p1 ?? args[1] ?? NaN),
          text: String(o.text ?? o.__p2 ?? args[2] ?? ''),
          xloc: (o.xloc ?? o.__p3 ?? 'bar_index') as 'bar_index' | 'bar_time',
          color: o.color && o.color !== 'na' ? String(o.color) : null,
          textColor: o.textcolor && o.textcolor !== 'na' ? String(o.textcolor) : '#d1d4dc',
          style: String(o.style ?? 'label_center'),
          forceOverlay: Boolean(o.force_overlay),
        };
        if (Number.isFinite(item.y)) activeLabels.add(item);
        return item;
      },
      delete: (lb: any) => {
        if (lb && activeLabels.has(lb)) activeLabels.delete(lb);
      },
      get_x: (lb: any) => (lb ? lb.x ?? NaN : NaN),
      get_y: (lb: any) => (lb ? lb.y ?? NaN : NaN),
      set_x: (lb: any, x: number) => { if (lb) lb.x = x; },
      set_y: (lb: any, y: number) => { if (lb) lb.y = y; },
      set_xy: (lb: any, x: number, y: number) => { if (lb) { lb.x = x; lb.y = y; } },
      set_text: (lb: any, t: string) => { if (lb) lb.text = t; },
      set_tooltip: () => {},
      set_color: () => {},
      set_textcolor: () => {},
    }),
    table: {
      new: () => ({ __type: 'table' }),
      clear: () => {},
      cell: () => {},
      delete: () => {},
    },
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
  const varNamesSet = new Set<string>();
  const sharedEnvSeriesRef: { seriesSet?: Set<string>; keySet?: Set<string> } = {};

  const registerFuncDef = (st: PineStatement) => {
    if (!st.varName) return;
    const params = st.funcParams || [];
    const stmts = st.funcStmts && st.funcStmts.length > 0 ? st.funcStmts : undefined;
    funcs[st.varName] = { params, body: st.funcBody || 'na', stmts };
    if (stmts) {
      const paramShapeKey = params.join(',');
      env[st.varName] = (...callArgs: any[]) => {
        const fnLocal: Record<string, any> = {};
        params.forEach((p, idx) => {
          fnLocal[p] = callArgs[idx];
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
              }
            : undefined
        );
      };
    }
  };

  // Pre-register all user-defined functions & user-defined types (`type Cnd`, `type Set`, etc.)
  for (const st of parsed.statements) {
    if (st.kind === 'func_def') registerFuncDef(st);
    if (st.kind === 'type_def' && st.varName) {
      const fields = st.typeFields || [];
      env[st.varName] = {
        new: (...args: any[]) => {
          const obj: Record<string, any> = {};
          const namedArg =
            args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])
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
                obj[f.name] = Number.isFinite(n) ? n : f.defaultExpr;
              }
            } else {
              obj[f.name] = NaN;
            }
          });
          return obj;
        },
      };
    }
  }

  const firstStatefulIdx = parsed.statements.findIndex(
    (s) =>
      s.kind === 'if_block' ||
      s.kind === 'for_loop' ||
      s.kind === 'for_in_loop' ||
      s.kind === 'while_loop' ||
      s.kind === 'compound_assign' ||
      s.kind === 'prop_assign' ||
      s.kind === 'prop_compound' ||
      (s.kind === 'assign' && s.varName === '__expr_stmt')
  );

  const preStatements =
    firstStatefulIdx === -1 ? parsed.statements : parsed.statements.slice(0, firstStatefulIdx);
  const statefulStatements =
    firstStatefulIdx === -1 ? [] : parsed.statements.slice(firstStatefulIdx);

  // 1. Execute pure vectorized statements before the first stateful block
  for (const st of preStatements) {
    if (st.kind === 'func_def' || st.kind === 'type_def') continue;

    if (st.kind === 'tuple_assign' && st.varNames && st.expr) {
      const tuple = evalPineExprVector(st.expr, env, ta, funcs, len, true);
      st.varNames.forEach((vName, k) => {
        if (vName && vName !== '_') {
          env[vName] = Array.isArray(tuple?.[k]) ? tuple[k] : new Array(len).fill(NaN);
        }
      });
      continue;
    }

    if (st.kind === 'switch_assign' && st.varName && st.cases) {
      const switchKeyVal = st.switchExpr
        ? evalPineExprVector(st.switchExpr, env, ta, funcs, len, false)
        : null;
      const scalarKey = Array.isArray(switchKeyVal) ? switchKeyVal[len - 1] : switchKeyVal;

      let chosenExpr: string | null = null;
      for (const c of st.cases) {
        if (c.matchExpr === null) {
          if (chosenExpr === null) chosenExpr = c.resultExpr;
          continue;
        }
        const matchVal = evalPineExprVector(c.matchExpr, env, ta, funcs, len, false);
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
        ? evalPineExprVector(chosenExpr, env, ta, funcs, len, false)
        : new Array(len).fill(NaN);
      continue;
    }

    if (st.kind === 'assign' && st.varName && st.expr) {
      if (st.isVar) {
        varNamesSet.add(st.varName);
        if (/^\s*array\.new/.test(st.expr)) {
          const arrVal = evalSingleBarExpr(st.expr, env, {}, funcs, 0, len);
          if (Array.isArray(arrVal)) (arrVal as any).__isPineArray = true;
          env[st.varName] = arrVal;
          continue;
        }
        const initVal = evalSingleBarExpr(st.expr, env, {}, funcs, 0, len);
        env[st.varName] = new Array(len).fill(initVal);
        continue;
      }
      env[st.varName] = evalPineExprVector(st.expr, env, ta, funcs, len, false);
      continue;
    }

    if (st.kind === 'reassign' && st.varName && st.expr) {
      if (!env[st.varName] || !isSeriesArray(env[st.varName], len)) {
        env[st.varName] = new Array(len).fill(NaN);
      }
      env[st.varName] = evalPineExprVector(st.expr, env, ta, funcs, len, false);
    }
  }

  // 2. Execute stateful statements (`if`, `for`, `var` arrays, `box.new`) in exact bar-by-bar Pine order!
  if (statefulStatements.length > 0) {
    const barExecList: PineStatement[] = [];
    for (const st of statefulStatements) {
      if (st.kind === 'func_def' || st.kind === 'type_def') continue;
      if (st.kind === 'assign' && st.isVar && st.varName && st.expr) {
        varNamesSet.add(st.varName);
        if (/^\s*(?:array\.new|table\.new|[A-Z]\w*\.new)/.test(st.expr)) {
          const val = evalSingleBarExpr(st.expr, env, {}, funcs, 0, len);
          if (Array.isArray(val)) (val as any).__isPineArray = true;
          env[st.varName] = val;
        } else {
          const initVal = evalSingleBarExpr(st.expr, env, {}, funcs, 0, len);
          env[st.varName] = new Array(len).fill(initVal);
        }
        continue;
      }
      // Pre-allocate top-level non-var assignments so series lookbacks work cleanly
      if (st.kind === 'assign' && st.varName && st.varName !== '__expr_stmt' && !env[st.varName]) {
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
      });
    }
  }

  // Evaluate plots (with offset + per-bar dynamic color!)
  const plotResults = parsed.plots.map((p) => {
    const rawValues = toNumericSeries(
      evalPineExprVector(p.expr, env, ta, funcs, len, false),
      len
    );
    const rawColors = evalColorSeries(p.colorExpr, p.fallbackColor, env, ta, funcs, len);
    return {
      def: p,
      values: applyPlotOffset(rawValues, p.offset, NaN),
      colors: applyPlotOffset(rawColors, p.offset, null),
    };
  });

  // Evaluate fills
  const fillResults = parsed.fills.map((f, fIdx) => {
    // Match offset of plot1 if plot1 has an offset (e.g. Ichimoku Kumo cloud offset=26)
    const p1 = parsed.plots.find((p) => p.key === f.plot1Key);
    const rawColors = evalColorSeries(f.colorExpr, f.fallbackColor, env, ta, funcs, len);
    const colors = p1 && p1.offset ? applyPlotOffset(rawColors, p1.offset, null) : rawColors;
    return { key: `f${fIdx}`, def: f, colors };
  });

  // Evaluate shapes
  const shapeResults = parsed.shapes.map((s) => {
    const conds = toNumericSeries(
      evalPineExprVector(s.condExpr, env, ta, funcs, len, false),
      len
    );
    const colors = evalColorSeries(s.colorExpr, s.fallbackColor, env, ta, funcs, len);
    return { def: s, conds, colors };
  });

  // Evaluate bgcolor & barcolor
  const bgSeriesList = parsed.bgColors.map((b) =>
    evalColorSeries(b.colorExpr, null, env, ta, funcs, len)
  );
  const barColorSeriesList = parsed.barColors.map((b) =>
    evalColorSeries(b.colorExpr, null, env, ta, funcs, len)
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

  if (activeBoxes.size > 0 && rows.length > 0) {
    rows[rows.length - 1].__boxes = Array.from(activeBoxes);
  }
  if (activeLabels.size > 0 && rows.length > 0) {
    rows[rows.length - 1].__labels = Array.from(activeLabels);
  }

  return rows;
}

/**
 * Registers a compiled Pine Script v4/v5/v6 indicator with KLineCharts v9,
 * combining native `figures` (for Y-axis auto-scaling & legend) with a custom
 * HTML5 Canvas `draw()` renderer for clouds (`fill`), dynamic multi-color lines,
 * `bgcolor`, `barcolor`, and `plotshape`/`plotchar` markers.
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
      } catch {
        return dataList.map(() => ({}));
      }
    },
    draw: ({ ctx, kLineDataList, indicator, xAxis, yAxis, visibleRange }: any) => {
      const result: PineIndicatorRow[] = indicator?.result || [];
      if (!result.length || !visibleRange) return false;

      const from = Math.max(0, visibleRange.from - 1);
      const to = Math.min(result.length - 1, visibleRange.to + 1);
      const paneTop = yAxis.convertToPixel(yAxis.getExtremum?.()?.max ?? 0);
      const paneBot = yAxis.convertToPixel(yAxis.getExtremum?.()?.min ?? 0);
      const topY = Number.isFinite(paneTop) && Number.isFinite(paneBot) ? Math.min(paneTop, paneBot) : 0;
      const botY = Number.isFinite(paneTop) && Number.isFinite(paneBot) ? Math.max(paneTop, paneBot) : ctx.canvas.height;
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
          // Binary search nearest bar index by timestamp, then interpolate sub-bar fraction
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

      // 1.5. box.new(...) rectangles (e.g. Support/Resistance Channels, Flow CISD+ Strip Cells)
      const boxes = result[result.length - 1]?.__boxes;
      if (boxes && boxes.length > 0) {
        const canvasLeft = 0;
        const canvasRight = ctx.canvas.width;
        for (const b of boxes) {
          // Skip main-chart `force_overlay` boxes when rendering inside a sub-pane
          if (!parsed.isMain && b.forceOverlay) continue;
          const yTop = yAxis.convertToPixel(b.top);
          const yBot = yAxis.convertToPixel(b.bottom);
          if (!Number.isFinite(yTop) || !Number.isFinite(yBot)) continue;
          const xLeftRaw = resolveCoordX(b.left, b.xloc);
          const xRightRaw = resolveCoordX(b.right, b.xloc);
          const x1 =
            b.extend === 'both' || b.extend === 'left'
              ? canvasLeft
              : Number.isFinite(xLeftRaw)
              ? xLeftRaw
              : canvasLeft;
          const x2 =
            b.extend === 'both' || b.extend === 'right'
              ? canvasRight
              : Number.isFinite(xRightRaw)
              ? xRightRaw
              : canvasRight;
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

      // 1.6. label.new(...) text labels (e.g. V / ΔV / Δ% row labels in sub-pane)
      const labels = result[result.length - 1]?.__labels;
      if (labels && labels.length > 0) {
        for (const lb of labels) {
          if (!parsed.isMain && lb.forceOverlay) continue;
          if (!lb.text) continue;
          const lx = resolveCoordX(lb.x, lb.xloc);
          const ly = yAxis.convertToPixel(lb.y);
          if (!Number.isFinite(lx) || !Number.isFinite(ly)) continue;
          ctx.font = '10px JetBrains Mono, monospace';
          ctx.fillStyle = lb.textColor || '#d1d4dc';
          ctx.textAlign = lb.style === 'label_left' ? 'left' : 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(lb.text, lx + (lb.style === 'label_left' ? 4 : 0), ly);
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

      ctx.restore();
      return false; // Let KLineCharts still render hlines & axis labels
    },
  });
}
