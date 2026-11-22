// Pine Script v6 Standard Library: color.*, ta.*, math.*, array.*, str.*

export const PINE_COLOR_MAP: Record<string, string> = {
  'color.blue': '#2962ff',
  'color.red': '#f23645',
  'color.green': '#089981',
  'color.teal': '#00bcd4',
  'color.orange': '#ff9800',
  'color.yellow': '#f59e0b',
  'color.purple': '#9c27b0',
  'color.fuchsia': '#e91e63',
  'color.white': '#ffffff',
  'color.gray': '#787b86',
  'color.silver': '#b2b5be',
  'color.aqua': '#00e5ff',
  'color.lime': '#4caf50',
  'color.maroon': '#880e4f',
  'color.navy': '#1a237e',
  'color.olive': '#827717',
  'color.black': '#131722',
};

interface RgbaTuple {
  r: number;
  g: number;
  b: number;
  a: number; // 0..1
}

export function parseCssColorToRgba(raw: string): RgbaTuple | null {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (s === 'na' || s === 'null' || s === 'none' || s === 'transparent') return null;

  if (PINE_COLOR_MAP[s]) {
    return parseCssColorToRgba(PINE_COLOR_MAP[s]);
  }

  // Hex #rgb, #rrggbb, #rrggbbaa
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      if ([r, g, b].every(Number.isFinite)) return { r, g, b, a: 1 };
    } else if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if ([r, g, b].every(Number.isFinite)) return { r, g, b, a: 1 };
    } else if (hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = parseInt(hex.slice(6, 8), 16) / 255;
      if ([r, g, b, a].every(Number.isFinite)) return { r, g, b, a };
    }
    return null;
  }

  const rgbaMatch = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(s);
  if (rgbaMatch) {
    return {
      r: Math.max(0, Math.min(255, Math.round(Number(rgbaMatch[1])))),
      g: Math.max(0, Math.min(255, Math.round(Number(rgbaMatch[2])))),
      b: Math.max(0, Math.min(255, Math.round(Number(rgbaMatch[3])))),
      a: rgbaMatch[4] !== undefined ? Math.max(0, Math.min(1, Number(rgbaMatch[4]))) : 1,
    };
  }

  return null;
}

export function rgbaToCss(c: RgbaTuple): string {
  const r = Math.max(0, Math.min(255, Math.round(c.r)));
  const g = Math.max(0, Math.min(255, Math.round(c.g)));
  const b = Math.max(0, Math.min(255, Math.round(c.b)));
  const a = Math.max(0, Math.min(1, Number(c.a.toFixed(3))));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function pineColorNew(baseColor: any, transp = 0): string | null {
  if (baseColor === null || baseColor === undefined || baseColor === 'na' || Number.isNaN(baseColor)) {
    return null;
  }
  const rgba = parseCssColorToRgba(String(baseColor));
  if (!rgba) return null;
  const t = Number.isFinite(Number(transp)) ? Math.max(0, Math.min(100, Number(transp))) : 0;
  const a = (100 - t) / 100;
  return rgbaToCss({ ...rgba, a });
}

export function pineColorRgb(r: number, g: number, b: number, transp = 0): string {
  const t = Number.isFinite(Number(transp)) ? Math.max(0, Math.min(100, Number(transp))) : 0;
  return rgbaToCss({
    r: Number(r) || 0,
    g: Number(g) || 0,
    b: Number(b) || 0,
    a: (100 - t) / 100,
  });
}

export function pineColorFromGradient(
  val: number,
  bottomVal: number,
  topVal: number,
  bottomColor: string,
  topColor: string
): string | null {
  if (!Number.isFinite(val)) return null;
  const c1 = parseCssColorToRgba(String(bottomColor));
  const c2 = parseCssColorToRgba(String(topColor));
  if (!c1 || !c2) return null;
  const span = topVal - bottomVal;
  const ratio = span === 0 ? 0.5 : Math.max(0, Math.min(1, (val - bottomVal) / span));
  return rgbaToCss({
    r: c1.r + (c2.r - c1.r) * ratio,
    g: c1.g + (c2.g - c1.g) * ratio,
    b: c1.b + (c2.b - c1.b) * ratio,
    a: c1.a + (c2.a - c1.a) * ratio,
  });
}

export function pineColorT(c: string): number {
  const rgba = parseCssColorToRgba(String(c));
  if (!rgba) return 100;
  return Math.round((1 - rgba.a) * 100);
}

export function pineColorR(c: string): number {
  const rgba = parseCssColorToRgba(String(c));
  return rgba ? rgba.r : 0;
}

export function pineColorG(c: string): number {
  const rgba = parseCssColorToRgba(String(c));
  return rgba ? rgba.g : 0;
}

export function pineColorB(c: string): number {
  const rgba = parseCssColorToRgba(String(c));
  return rgba ? rgba.b : 0;
}

/**
 * Static fallback color resolver for UI previews & static color literals.
 */
export function resolvePineColorValue(raw: string | undefined, fallback = '#2962ff'): string {
  if (!raw) return fallback;
  const s = raw.trim().replace(/^['"]|['"]$/g, '');
  if (!s || s === 'na') return fallback;
  if (PINE_COLOR_MAP[s]) return PINE_COLOR_MAP[s];
  if (s.startsWith('#')) {
    const rgba = parseCssColorToRgba(s);
    return rgba ? (rgba.a < 1 ? rgbaToCss(rgba) : s) : fallback;
  }
  const newMatch = /^color\.new\(\s*([^,]+)\s*,\s*([^)]+)\s*\)$/.exec(s);
  if (newMatch) {
    const base = resolvePineColorValue(newMatch[1], fallback);
    const t = Number(newMatch[2].trim());
    return pineColorNew(base, Number.isFinite(t) ? t : 0) || fallback;
  }
  const rgbMatch = /^color\.rgb\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,)]+)(?:\s*,\s*([^)]+))?\s*\)$/.exec(s);
  if (rgbMatch) {
    return pineColorRgb(
      Number(rgbMatch[1]),
      Number(rgbMatch[2]),
      Number(rgbMatch[3]),
      rgbMatch[4] !== undefined ? Number(rgbMatch[4]) : 0
    );
  }
  // If dynamic expression (e.g. `dir < 0 ? color.green : color.red`), pick first color literal as fallback
  const hexInExpr = /#[0-9a-fA-F]{3,8}/.exec(s);
  if (hexInExpr) return hexInExpr[0];
  const namedInExpr = /color\.(blue|red|green|teal|orange|yellow|purple|fuchsia|white|gray|silver|aqua|lime|maroon|navy|olive|black)/.exec(s);
  if (namedInExpr && PINE_COLOR_MAP[namedInExpr[0]]) return PINE_COLOR_MAP[namedInExpr[0]];
  return fallback;
}

export const PINE_COLOR_OBJECT: any = Object.assign(
  (c: any) =>
    c === null || c === undefined || c === 'na' || (typeof c === 'number' && Number.isNaN(c))
      ? null
      : String(c),
  {
    blue: '#2962ff',
    red: '#f23645',
    green: '#089981',
    teal: '#00bcd4',
    orange: '#ff9800',
    yellow: '#f59e0b',
    purple: '#9c27b0',
    fuchsia: '#e91e63',
    white: '#ffffff',
    gray: '#787b86',
    silver: '#b2b5be',
    aqua: '#00e5ff',
    lime: '#4caf50',
    maroon: '#880e4f',
    navy: '#1a237e',
    olive: '#827717',
    black: '#131722',
    new: pineColorNew,
    rgb: pineColorRgb,
    from_gradient: pineColorFromGradient,
    t: pineColorT,
    r: pineColorR,
    g: pineColorG,
    b: pineColorB,
  }
);

// ============================================================================
// Pine v6 array.* Helpers (including Pine v6 negative indexing!)
// ============================================================================
function resolveArrIndex(arr: any[], idx: number): number {
  const i = Math.trunc(Number(idx));
  return i < 0 ? arr.length + i : i;
}

export const PINE_ARRAY_OBJECT: Record<string, any> = {
  new_any: (size = 0, initialVal: any = null): any[] => {
    const arr = new Array(Math.max(0, Math.trunc(size))).fill(initialVal);
    (arr as any).__isPineArray = true;
    return arr;
  },
  new_float: (size = 0, initialVal = NaN): number[] => {
    const arr = new Array(Math.max(0, Math.trunc(size))).fill(initialVal);
    (arr as any).__isPineArray = true;
    return arr;
  },
  new_int: (size = 0, initialVal = 0): number[] => {
    const arr = new Array(Math.max(0, Math.trunc(size))).fill(Math.trunc(initialVal));
    (arr as any).__isPineArray = true;
    return arr;
  },
  new_bool: (size = 0, initialVal = false): boolean[] => {
    const arr = new Array(Math.max(0, Math.trunc(size))).fill(Boolean(initialVal));
    (arr as any).__isPineArray = true;
    return arr;
  },
  new_string: (size = 0, initialVal = ''): string[] => {
    const arr = new Array(Math.max(0, Math.trunc(size))).fill(String(initialVal));
    (arr as any).__isPineArray = true;
    return arr;
  },
  new_color: (size = 0, initialVal: string | null = null): Array<string | null> => {
    const arr = new Array(Math.max(0, Math.trunc(size))).fill(initialVal);
    (arr as any).__isPineArray = true;
    return arr;
  },
  new_box: (size = 0, initialVal: any = null): any[] => {
    const arr = new Array(Math.max(0, Math.trunc(size))).fill(initialVal);
    (arr as any).__isPineArray = true;
    return arr;
  },
  new_line: (size = 0, initialVal: any = null): any[] => {
    const arr = new Array(Math.max(0, Math.trunc(size))).fill(initialVal);
    (arr as any).__isPineArray = true;
    return arr;
  },
  new_label: (size = 0, initialVal: any = null): any[] => {
    const arr = new Array(Math.max(0, Math.trunc(size))).fill(initialVal);
    (arr as any).__isPineArray = true;
    return arr;
  },
  fill: (arr: any[], val: any, indexFrom = 0, indexTo?: number) => {
    if (!Array.isArray(arr)) return;
    const end = indexTo !== undefined ? Math.min(arr.length, indexTo) : arr.length;
    for (let i = Math.max(0, indexFrom); i < end; i++) arr[i] = val;
  },
  from: (...items: any[]) => [...items],
  push: (arr: any[], val: any) => {
    if (Array.isArray(arr)) arr.push(val);
    return arr?.length ?? 0;
  },
  pop: (arr: any[]) => (Array.isArray(arr) && arr.length > 0 ? arr.pop() : NaN),
  shift: (arr: any[]) => (Array.isArray(arr) && arr.length > 0 ? arr.shift() : NaN),
  unshift: (arr: any[], val: any) => {
    if (Array.isArray(arr)) arr.unshift(val);
    return arr?.length ?? 0;
  },
  get: (arr: any[], idx: number) => {
    if (!Array.isArray(arr) || arr.length === 0) return NaN;
    const ri = resolveArrIndex(arr, idx);
    return ri >= 0 && ri < arr.length ? arr[ri] : NaN;
  },
  set: (arr: any[], idx: number, val: any) => {
    if (!Array.isArray(arr) || arr.length === 0) return val;
    const ri = resolveArrIndex(arr, idx);
    if (ri >= 0 && ri < arr.length) arr[ri] = val;
    return val;
  },
  size: (arr: any[]) => (Array.isArray(arr) ? arr.length : 0),
  first: (arr: any[]) => (Array.isArray(arr) && arr.length > 0 ? arr[0] : NaN),
  last: (arr: any[]) => (Array.isArray(arr) && arr.length > 0 ? arr[arr.length - 1] : NaN),
  clear: (arr: any[]) => {
    if (Array.isArray(arr)) arr.length = 0;
  },
  sum: (arr: number[]) => {
    if (!Array.isArray(arr) || arr.length === 0) return 0;
    let s = 0;
    for (const v of arr) if (Number.isFinite(v)) s += v;
    return s;
  },
  avg: (arr: number[]) => {
    if (!Array.isArray(arr) || arr.length === 0) return NaN;
    let s = 0;
    let c = 0;
    for (const v of arr) {
      if (Number.isFinite(v)) {
        s += v;
        c++;
      }
    }
    return c > 0 ? s / c : NaN;
  },
  max: (arr: number[]) => {
    if (!Array.isArray(arr) || arr.length === 0) return NaN;
    let m = -Infinity;
    for (const v of arr) if (Number.isFinite(v) && v > m) m = v;
    return Number.isFinite(m) ? m : NaN;
  },
  min: (arr: number[]) => {
    if (!Array.isArray(arr) || arr.length === 0) return NaN;
    let m = Infinity;
    for (const v of arr) if (Number.isFinite(v) && v < m) m = v;
    return Number.isFinite(m) ? m : NaN;
  },
  includes: (arr: any[], val: any) => (Array.isArray(arr) ? arr.includes(val) : false),
};

// ============================================================================
// Pine v6 math.* & str.* Helpers
// ============================================================================
export const PINE_MATH_OBJECT = {
  abs: Math.abs,
  max: Math.max,
  min: Math.min,
  avg: (...args: number[]) => {
    let s = 0;
    let c = 0;
    for (const v of args) {
      if (Number.isFinite(v)) {
        s += v;
        c++;
      }
    }
    return c > 0 ? s / c : NaN;
  },
  sqrt: Math.sqrt,
  pow: Math.pow,
  log: Math.log,
  log10: Math.log10,
  exp: Math.exp,
  round: (x: number, precision?: number) => {
    if (!Number.isFinite(x)) return NaN;
    if (precision === undefined) return Math.round(x);
    const f = Math.pow(10, Math.max(0, Math.trunc(precision)));
    return Math.round(x * f) / f;
  },
  floor: Math.floor,
  ceil: Math.ceil,
  sign: Math.sign,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  todegrees: (rad: number) => (rad * 180) / Math.PI,
  toradians: (deg: number) => (deg * Math.PI) / 180,
  pi: Math.PI,
  e: Math.E,
  phi: 1.618033988749895,
  rphi: 0.6180339887498949,
};

export const PINE_STR_OBJECT = {
  tostring: (val: any, _fmt?: string) => {
    if (val === null || val === undefined || (typeof val === 'number' && !Number.isFinite(val))) {
      return 'NaN';
    }
    if (typeof val === 'number') {
      return Number.isInteger(val) ? String(val) : Number(val.toFixed(4)).toString();
    }
    return String(val);
  },
  length: (s: string) => String(s ?? '').length,
  contains: (s: string, sub: string) => String(s ?? '').includes(String(sub ?? '')),
  upper: (s: string) => String(s ?? '').toUpperCase(),
  lower: (s: string) => String(s ?? '').toLowerCase(),
  replace: (s: string, target: string, replacement: string) =>
    String(s ?? '').replace(String(target ?? ''), String(replacement ?? '')),
  replace_all: (s: string, target: string, replacement: string) =>
    String(s ?? '').split(String(target ?? '')).join(String(replacement ?? '')),
  startswith: (s: string, sub: string) => String(s ?? '').startsWith(String(sub ?? '')),
  endswith: (s: string, sub: string) => String(s ?? '').endsWith(String(sub ?? '')),
  format_time: (ts: number, _fmt?: string, _tz?: string) => {
    if (!Number.isFinite(ts)) return '';
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  },
};

// ============================================================================
// Vectorized Pine v6 ta.* Library (40+ Functions + Multi-Output Tuples)
// ============================================================================

export function toNumericSeries(val: any, len: number): number[] {
  if (Array.isArray(val) && val.length === len && typeof val[0] !== 'object') {
    return val.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : Number(v)));
  }
  if (Array.isArray(val) && Array.isArray(val[0])) {
    // Multi-output tuple assigned to single variable -> use primary output [0]
    return toNumericSeries(val[0], len);
  }
  const n = typeof val === 'boolean' ? (val ? 1 : 0) : Number(val);
  return new Array<number>(len).fill(Number.isFinite(n) ? n : NaN);
}

export function scalarParam(val: any, fallback: number): number {
  if (Array.isArray(val)) {
    for (let i = val.length - 1; i >= 0; i--) {
      const n = Number(val[i]);
      if (Number.isFinite(n)) return n;
    }
    return fallback;
  }
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

export function boolParam(val: any, fallback: boolean): boolean {
  if (val === undefined || val === null) return fallback;
  if (Array.isArray(val)) {
    const last = val[val.length - 1];
    return Boolean(last) && !Number.isNaN(last);
  }
  return Boolean(val) && !Number.isNaN(val);
}

export function taSma(src: number[], length: number): number[] {
  const n = Math.max(1, Math.round(length));
  const out = new Array<number>(src.length).fill(NaN);
  let sum = 0;
  let valid = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (Number.isFinite(v)) {
      sum += v;
      valid++;
    }
    if (i >= n) {
      const old = src[i - n];
      if (Number.isFinite(old)) {
        sum -= old;
        valid--;
      }
    }
    if (i >= n - 1 && valid === n) {
      out[i] = sum / n;
    }
  }
  return out;
}

export function taEma(src: number[], length: number): number[] {
  const n = Math.max(1, Math.round(length));
  const k = 2 / (n + 1);
  const out = new Array<number>(src.length).fill(NaN);
  let prev = NaN;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (!Number.isFinite(v)) continue;
    prev = !Number.isFinite(prev) ? v : v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function taRma(src: number[], length: number): number[] {
  const n = Math.max(1, Math.round(length));
  const alpha = 1 / n;
  const out = new Array<number>(src.length).fill(NaN);
  let prev = NaN;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (!Number.isFinite(v)) continue;
    prev = !Number.isFinite(prev) ? v : alpha * v + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

export function taWma(src: number[], length: number): number[] {
  const n = Math.max(1, Math.round(length));
  const out = new Array<number>(src.length).fill(NaN);
  const denom = (n * (n + 1)) / 2;
  for (let i = n - 1; i < src.length; i++) {
    let sum = 0;
    let ok = true;
    for (let j = 0; j < n; j++) {
      const v = src[i - j];
      if (!Number.isFinite(v)) {
        ok = false;
        break;
      }
      sum += v * (n - j);
    }
    if (ok) out[i] = sum / denom;
  }
  return out;
}

export function taVwma(src: number[], vol: number[], length: number): number[] {
  const pv = src.map((v, i) => v * (vol[i] || 1));
  const num = taSma(pv, length);
  const den = taSma(
    vol.map((v) => v || 1),
    length
  );
  return num.map((v, i) => (den[i] ? v / den[i] : NaN));
}

export function taHma(src: number[], length: number): number[] {
  const n = Math.max(1, Math.round(length));
  const halfLen = Math.max(1, Math.floor(n / 2));
  const sqrtLen = Math.max(1, Math.round(Math.sqrt(n)));
  const wmaHalf = taWma(src, halfLen);
  const wmaFull = taWma(src, n);
  const diff = src.map((_, i) => 2 * wmaHalf[i] - wmaFull[i]);
  return taWma(diff, sqrtLen);
}

export function taSwma(src: number[]): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = 3; i < src.length; i++) {
    out[i] = (src[i - 3] + 2 * src[i - 2] + 2 * src[i - 1] + src[i]) / 6;
  }
  return out;
}

export function taAlma(src: number[], length: number, offset = 0.85, sigma = 6): number[] {
  const n = Math.max(1, Math.round(length));
  const m = offset * (n - 1);
  const s = n / Math.max(0.0001, sigma);
  const weights = new Array<number>(n);
  let wSum = 0;
  for (let j = 0; j < n; j++) {
    const w = Math.exp(-((j - m) * (j - m)) / (2 * s * s));
    weights[j] = w;
    wSum += w;
  }
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = n - 1; i < src.length; i++) {
    let acc = 0;
    let ok = true;
    for (let j = 0; j < n; j++) {
      const v = src[i - (n - 1 - j)];
      if (!Number.isFinite(v)) {
        ok = false;
        break;
      }
      acc += v * weights[j];
    }
    if (ok && wSum > 0) out[i] = acc / wSum;
  }
  return out;
}

export function taLinreg(src: number[], length: number, offset = 0): number[] {
  const n = Math.max(2, Math.round(length));
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = n - 1; i < src.length; i++) {
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    let ok = true;
    for (let j = 0; j < n; j++) {
      const y = src[i - (n - 1 - j)];
      if (!Number.isFinite(y)) {
        ok = false;
        break;
      }
      sumX += j;
      sumY += y;
      sumXY += j * y;
      sumXX += j * j;
    }
    if (!ok) continue;
    const denom = n * sumXX - sumX * sumX;
    if (denom === 0) continue;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    out[i] = intercept + slope * (n - 1 - offset);
  }
  return out;
}

export function taTr(high: number[], low: number[], close: number[], handleNa = false): number[] {
  const out = new Array<number>(close.length).fill(NaN);
  for (let i = 0; i < close.length; i++) {
    if (i === 0) {
      out[i] = handleNa ? high[i] - low[i] : high[i] - low[i];
    } else {
      out[i] = Math.max(
        high[i] - low[i],
        Math.abs(high[i] - close[i - 1]),
        Math.abs(low[i] - close[i - 1])
      );
    }
  }
  return out;
}

export function taAtr(high: number[], low: number[], close: number[], length: number): number[] {
  return taRma(taTr(high, low, close, true), length);
}

export function taRsi(src: number[], length: number): number[] {
  const gains = new Array<number>(src.length).fill(0);
  const losses = new Array<number>(src.length).fill(0);
  for (let i = 1; i < src.length; i++) {
    const diff = src[i] - src[i - 1];
    if (Number.isFinite(diff)) {
      gains[i] = diff > 0 ? diff : 0;
      losses[i] = diff < 0 ? -diff : 0;
    }
  }
  const avgGain = taRma(gains, length);
  const avgLoss = taRma(losses, length);
  return src.map((_, i) => {
    const g = avgGain[i];
    const l = avgLoss[i];
    if (!Number.isFinite(g) || !Number.isFinite(l)) return NaN;
    if (l === 0) return 100;
    const rs = g / l;
    return 100 - 100 / (1 + rs);
  });
}

export function taVariance(src: number[], length: number): number[] {
  const n = Math.max(1, Math.round(length));
  const mean = taSma(src, n);
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = n - 1; i < src.length; i++) {
    const m = mean[i];
    if (!Number.isFinite(m)) continue;
    let sumSq = 0;
    for (let j = 0; j < n; j++) {
      const d = src[i - j] - m;
      sumSq += d * d;
    }
    out[i] = sumSq / n;
  }
  return out;
}

export function taStdev(src: number[], length: number): number[] {
  return taVariance(src, length).map((v) => (Number.isFinite(v) ? Math.sqrt(v) : NaN));
}

export function taDev(src: number[], length: number): number[] {
  const n = Math.max(1, Math.round(length));
  const mean = taSma(src, n);
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = n - 1; i < src.length; i++) {
    const m = mean[i];
    if (!Number.isFinite(m)) continue;
    let sum = 0;
    for (let j = 0; j < n; j++) sum += Math.abs(src[i - j] - m);
    out[i] = sum / n;
  }
  return out;
}

export function taMedian(src: number[], length: number): number[] {
  const n = Math.max(1, Math.round(length));
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = n - 1; i < src.length; i++) {
    const win: number[] = [];
    for (let j = 0; j < n; j++) {
      if (Number.isFinite(src[i - j])) win.push(src[i - j]);
    }
    if (win.length === 0) continue;
    win.sort((a, b) => a - b);
    const mid = Math.floor(win.length / 2);
    out[i] = win.length % 2 === 0 ? (win[mid - 1] + win[mid]) / 2 : win[mid];
  }
  return out;
}

export function taHighest(src: number[], length: number): number[] {
  const n = Math.max(1, Math.round(length));
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = 0; i < src.length; i++) {
    let best = -Infinity;
    const start = Math.max(0, i - n + 1);
    for (let j = start; j <= i; j++) {
      if (src[j] > best) best = src[j];
    }
    out[i] = Number.isFinite(best) ? best : NaN;
  }
  return out;
}

export function taLowest(src: number[], length: number): number[] {
  const n = Math.max(1, Math.round(length));
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = 0; i < src.length; i++) {
    let best = Infinity;
    const start = Math.max(0, i - n + 1);
    for (let j = start; j <= i; j++) {
      if (src[j] < best) best = src[j];
    }
    out[i] = Number.isFinite(best) ? best : NaN;
  }
  return out;
}

export function taHighestBars(src: number[], length: number): number[] {
  const n = Math.max(1, Math.round(length));
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = 0; i < src.length; i++) {
    let best = -Infinity;
    let bestOffset = 0;
    const start = Math.max(0, i - n + 1);
    for (let j = start; j <= i; j++) {
      if (src[j] >= best) {
        best = src[j];
        bestOffset = j - i; // <= 0
      }
    }
    out[i] = Number.isFinite(best) ? bestOffset : NaN;
  }
  return out;
}

export function taLowestBars(src: number[], length: number): number[] {
  const n = Math.max(1, Math.round(length));
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = 0; i < src.length; i++) {
    let best = Infinity;
    let bestOffset = 0;
    const start = Math.max(0, i - n + 1);
    for (let j = start; j <= i; j++) {
      if (src[j] <= best) {
        best = src[j];
        bestOffset = j - i; // <= 0
      }
    }
    out[i] = Number.isFinite(best) ? bestOffset : NaN;
  }
  return out;
}

export function taCci(src: number[], length: number): number[] {
  const n = Math.max(1, Math.round(length));
  const sma = taSma(src, n);
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = n - 1; i < src.length; i++) {
    const m = sma[i];
    if (!Number.isFinite(m)) continue;
    let devSum = 0;
    for (let j = 0; j < n; j++) devSum += Math.abs(src[i - j] - m);
    const md = devSum / n;
    out[i] = md === 0 ? 0 : (src[i] - m) / (0.015 * md);
  }
  return out;
}

export function taMom(src: number[], length: number): number[] {
  const n = Math.max(1, Math.round(length));
  return src.map((v, i) => (i >= n ? v - src[i - n] : NaN));
}

export function taRoc(src: number[], length: number): number[] {
  const n = Math.max(1, Math.round(length));
  return src.map((v, i) =>
    i >= n && src[i - n] !== 0 ? ((v - src[i - n]) / src[i - n]) * 100 : NaN
  );
}

export function taChange(src: number[], length = 1): number[] {
  return taMom(src, length);
}

export function taCum(src: number[]): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  let acc = 0;
  for (let i = 0; i < src.length; i++) {
    if (Number.isFinite(src[i])) acc += src[i];
    out[i] = acc;
  }
  return out;
}

export function taSum(src: number[], length: number): number[] {
  const n = Math.max(1, Math.round(length));
  const out = new Array<number>(src.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += Number.isFinite(src[i]) ? src[i] : 0;
    if (i >= n) sum -= Number.isFinite(src[i - n]) ? src[i - n] : 0;
    if (i >= n - 1) out[i] = sum;
  }
  return out;
}

export function taObv(close: number[], volume: number[]): number[] {
  const out = new Array<number>(close.length).fill(0);
  for (let i = 1; i < close.length; i++) {
    const dir = close[i] > close[i - 1] ? 1 : close[i] < close[i - 1] ? -1 : 0;
    out[i] = out[i - 1] + dir * (volume[i] || 0);
  }
  return out;
}

export function taVwap(src: number[], vol: number[], timestamps: number[]): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  let cumPV = 0;
  let cumV = 0;
  let lastDay = -1;
  for (let i = 0; i < src.length; i++) {
    const day = Math.floor((timestamps[i] || 0) / 86400000);
    if (day !== lastDay) {
      cumPV = 0;
      cumV = 0;
      lastDay = day;
    }
    const v = Math.max(1, vol[i] || 1);
    cumPV += src[i] * v;
    cumV += v;
    out[i] = cumV > 0 ? cumPV / cumV : src[i];
  }
  return out;
}

/**
 * Multi-output SuperTrend: returns [supertrendLine, direction]
 * direction = -1 (uptrend), +1 (downtrend) — exact TradingView convention!
 */
export function taSupertrendTuple(
  high: number[],
  low: number[],
  close: number[],
  factor: number,
  atrLen: number
): [number[], number[]] {
  const atr = taAtr(high, low, close, atrLen);
  const len = close.length;
  const upperBand = new Array<number>(len).fill(NaN);
  const lowerBand = new Array<number>(len).fill(NaN);
  const st = new Array<number>(len).fill(NaN);
  const dirSeries = new Array<number>(len).fill(1);
  let dir = 1;

  for (let i = 0; i < len; i++) {
    const hl2 = (high[i] + low[i]) / 2;
    const a = atr[i];
    if (!Number.isFinite(a)) {
      dirSeries[i] = dir;
      continue;
    }
    let ub = hl2 + factor * a;
    let lb = hl2 - factor * a;
    if (i > 0 && Number.isFinite(lowerBand[i - 1])) {
      lb = lb > lowerBand[i - 1] || close[i - 1] < lowerBand[i - 1] ? lb : lowerBand[i - 1];
    }
    if (i > 0 && Number.isFinite(upperBand[i - 1])) {
      ub = ub < upperBand[i - 1] || close[i - 1] > upperBand[i - 1] ? ub : upperBand[i - 1];
    }
    upperBand[i] = ub;
    lowerBand[i] = lb;

    if (i === 0) {
      dir = 1;
    } else if (st[i - 1] === upperBand[i - 1]) {
      dir = close[i] > ub ? -1 : 1;
    } else {
      dir = close[i] < lb ? 1 : -1;
    }
    st[i] = dir === -1 ? lb : ub;
    dirSeries[i] = dir;
  }
  return [st, dirSeries];
}

export function taBbTuple(src: number[], length: number, mult: number): [number[], number[], number[]] {
  const basis = taSma(src, length);
  const dev = taStdev(src, length);
  const upper = basis.map((b, i) => b + mult * dev[i]);
  const lower = basis.map((b, i) => b - mult * dev[i]);
  return [basis, upper, lower];
}

export function taBbw(src: number[], length: number, mult: number): number[] {
  const [basis, upper, lower] = taBbTuple(src, length, mult);
  return basis.map((b, i) => (b !== 0 && Number.isFinite(b) ? (upper[i] - lower[i]) / b : NaN));
}

export function taKcTuple(
  src: number[],
  high: number[],
  low: number[],
  close: number[],
  length: number,
  mult: number,
  useTrueRange = true
): [number[], number[], number[]] {
  const basis = taEma(src, length);
  const rangeSeries = useTrueRange ? taTr(high, low, close, true) : high.map((h, i) => h - low[i]);
  const rangeMa = taEma(rangeSeries, length);
  const upper = basis.map((b, i) => b + mult * rangeMa[i]);
  const lower = basis.map((b, i) => b - mult * rangeMa[i]);
  return [basis, upper, lower];
}

export function taMacdTuple(
  src: number[],
  fastLen: number,
  slowLen: number,
  sigLen: number
): [number[], number[], number[]] {
  const fast = taEma(src, fastLen);
  const slow = taEma(src, slowLen);
  const macdLine = fast.map((v, i) => v - slow[i]);
  const sigLine = taEma(macdLine, sigLen);
  const histLine = macdLine.map((v, i) => v - sigLine[i]);
  return [macdLine, sigLine, histLine];
}

export function taDmiTuple(
  high: number[],
  low: number[],
  close: number[],
  diLen: number,
  adxSmoothing: number
): [number[], number[], number[]] {
  const len = close.length;
  const plusDm = new Array<number>(len).fill(0);
  const minusDm = new Array<number>(len).fill(0);
  for (let i = 1; i < len; i++) {
    const up = high[i] - high[i - 1];
    const down = low[i - 1] - low[i];
    plusDm[i] = up > down && up > 0 ? up : 0;
    minusDm[i] = down > up && down > 0 ? down : 0;
  }
  const trur = taRma(taTr(high, low, close, true), diLen);
  const plusRma = taRma(plusDm, diLen);
  const minusRma = taRma(minusDm, diLen);
  const plusDI = trur.map((t, i) => (t > 0 ? (100 * plusRma[i]) / t : 0));
  const minusDI = trur.map((t, i) => (t > 0 ? (100 * minusRma[i]) / t : 0));
  const dx = plusDI.map((p, i) => {
    const sum = p + minusDI[i];
    return sum > 0 ? (100 * Math.abs(p - minusDI[i])) / sum : 0;
  });
  const adx = taRma(dx, adxSmoothing);
  return [plusDI, minusDI, adx];
}

export function taStoch(close: number[], high: number[], low: number[], length: number): number[] {
  const hh = taHighest(high, length);
  const ll = taLowest(low, length);
  return close.map((c, i) => {
    const span = hh[i] - ll[i];
    return span > 0 ? ((c - ll[i]) / span) * 100 : 50;
  });
}

export function taMfi(hlc3: number[], volume: number[], length: number): number[] {
  const len = hlc3.length;
  const pos = new Array<number>(len).fill(0);
  const neg = new Array<number>(len).fill(0);
  for (let i = 1; i < len; i++) {
    const mf = hlc3[i] * (volume[i] || 1);
    if (hlc3[i] > hlc3[i - 1]) pos[i] = mf;
    else if (hlc3[i] < hlc3[i - 1]) neg[i] = mf;
  }
  const posSum = taSum(pos, length);
  const negSum = taSum(neg, length);
  return hlc3.map((_, i) => {
    if (!Number.isFinite(posSum[i]) || !Number.isFinite(negSum[i])) return NaN;
    if (negSum[i] === 0) return 100;
    const ratio = posSum[i] / negSum[i];
    return 100 - 100 / (1 + ratio);
  });
}

export function taTsi(src: number[], shortLen: number, longLen: number): number[] {
  const pc = taChange(src, 1);
  const absPc = pc.map((v) => Math.abs(v));
  const dsPc = taEma(taEma(pc, longLen), shortLen);
  const dsAbsPc = taEma(taEma(absPc, longLen), shortLen);
  return dsPc.map((v, i) => (dsAbsPc[i] !== 0 ? (100 * v) / dsAbsPc[i] : 0));
}

export function taCmo(src: number[], length: number): number[] {
  const len = src.length;
  const up = new Array<number>(len).fill(0);
  const dn = new Array<number>(len).fill(0);
  for (let i = 1; i < len; i++) {
    const d = src[i] - src[i - 1];
    if (d > 0) up[i] = d;
    else if (d < 0) dn[i] = -d;
  }
  const sUp = taSum(up, length);
  const sDn = taSum(dn, length);
  return src.map((_, i) => {
    const tot = sUp[i] + sDn[i];
    return tot > 0 ? (100 * (sUp[i] - sDn[i])) / tot : NaN;
  });
}

export function taSar(
  high: number[],
  low: number[],
  close: number[],
  start = 0.02,
  inc = 0.02,
  maxAf = 0.2
): number[] {
  const len = close.length;
  const out = new Array<number>(len).fill(NaN);
  if (len < 2) return out;
  let isLong = close[1] >= close[0];
  let af = start;
  let ep = isLong ? high[0] : low[0];
  let sar = isLong ? low[0] : high[0];
  out[0] = sar;

  for (let i = 1; i < len; i++) {
    sar = sar + af * (ep - sar);
    if (isLong) {
      sar = Math.min(sar, low[i - 1], i >= 2 ? low[i - 2] : low[i - 1]);
      if (low[i] < sar) {
        isLong = false;
        sar = ep;
        ep = low[i];
        af = start;
      } else if (high[i] > ep) {
        ep = high[i];
        af = Math.min(maxAf, af + inc);
      }
    } else {
      sar = Math.max(sar, high[i - 1], i >= 2 ? high[i - 2] : high[i - 1]);
      if (high[i] > sar) {
        isLong = true;
        sar = ep;
        ep = high[i];
        af = start;
      } else if (low[i] < ep) {
        ep = low[i];
        af = Math.min(maxAf, af + inc);
      }
    }
    out[i] = sar;
  }
  return out;
}

export function taPivotHigh(src: number[], leftBars: number, rightBars: number): number[] {
  const l = Math.max(0, Math.round(leftBars));
  const r = Math.max(0, Math.round(rightBars));
  const len = src.length;
  const out = new Array<number>(len).fill(NaN);
  for (let i = l + r; i < len; i++) {
    const pIdx = i - r;
    const pVal = src[pIdx];
    if (!Number.isFinite(pVal)) continue;
    let isPivot = true;
    for (let j = pIdx - l; j <= i; j++) {
      if (j === pIdx) continue;
      if (src[j] >= pVal) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) out[i] = pVal;
  }
  return out;
}

export function taPivotLow(src: number[], leftBars: number, rightBars: number): number[] {
  const l = Math.max(0, Math.round(leftBars));
  const r = Math.max(0, Math.round(rightBars));
  const len = src.length;
  const out = new Array<number>(len).fill(NaN);
  for (let i = l + r; i < len; i++) {
    const pIdx = i - r;
    const pVal = src[pIdx];
    if (!Number.isFinite(pVal)) continue;
    let isPivot = true;
    for (let j = pIdx - l; j <= i; j++) {
      if (j === pIdx) continue;
      if (src[j] <= pVal) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) out[i] = pVal;
  }
  return out;
}

export function taBarsSince(cond: number[]): number[] {
  const out = new Array<number>(cond.length).fill(NaN);
  let lastTrue = -1;
  for (let i = 0; i < cond.length; i++) {
    if (Number.isFinite(cond[i]) && cond[i] !== 0) {
      lastTrue = i;
      out[i] = 0;
    } else if (lastTrue >= 0) {
      out[i] = i - lastTrue;
    }
  }
  return out;
}

export function taValueWhen(cond: number[], src: number[], occurrence = 0): number[] {
  const occ = Math.max(0, Math.round(occurrence));
  const out = new Array<number>(src.length).fill(NaN);
  const hits: number[] = [];
  for (let i = 0; i < src.length; i++) {
    if (Number.isFinite(cond[i]) && cond[i] !== 0) {
      hits.push(src[i]);
    }
    const idx = hits.length - 1 - occ;
    if (idx >= 0) out[i] = hits[idx];
  }
  return out;
}

export function taFixNan(src: number[]): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  let last = NaN;
  for (let i = 0; i < src.length; i++) {
    if (Number.isFinite(src[i])) last = src[i];
    out[i] = last;
  }
  return out;
}

export function taCrossover(a: number[], b: number[]): number[] {
  return a.map((v, i) => (i > 0 && a[i - 1] <= b[i - 1] && v > b[i] ? 1 : 0));
}

export function taCrossunder(a: number[], b: number[]): number[] {
  return a.map((v, i) => (i > 0 && a[i - 1] >= b[i - 1] && v < b[i] ? 1 : 0));
}

export function taCross(a: number[], b: number[]): number[] {
  return a.map((v, i) =>
    i > 0 && ((a[i - 1] <= b[i - 1] && v > b[i]) || (a[i - 1] >= b[i - 1] && v < b[i])) ? 1 : 0
  );
}

export function taRising(src: number[], length: number): number[] {
  const n = Math.max(1, Math.round(length));
  const out = new Array<number>(src.length).fill(0);
  for (let i = n; i < src.length; i++) {
    let ok = true;
    for (let j = i - n + 1; j <= i; j++) {
      if (!(src[j] > src[j - 1])) {
        ok = false;
        break;
      }
    }
    out[i] = ok ? 1 : 0;
  }
  return out;
}

export function taFalling(src: number[], length: number): number[] {
  const n = Math.max(1, Math.round(length));
  const out = new Array<number>(src.length).fill(0);
  for (let i = n; i < src.length; i++) {
    let ok = true;
    for (let j = i - n + 1; j <= i; j++) {
      if (!(src[j] < src[j - 1])) {
        ok = false;
        break;
      }
    }
    out[i] = ok ? 1 : 0;
  }
  return out;
}

export function taCorrelation(a: number[], b: number[], length: number): number[] {
  const n = Math.max(2, Math.round(length));
  const out = new Array<number>(a.length).fill(NaN);
  for (let i = n - 1; i < a.length; i++) {
    let sumA = 0;
    let sumB = 0;
    for (let j = 0; j < n; j++) {
      sumA += a[i - j];
      sumB += b[i - j];
    }
    const meanA = sumA / n;
    const meanB = sumB / n;
    let cov = 0;
    let varA = 0;
    let varB = 0;
    for (let j = 0; j < n; j++) {
      const da = a[i - j] - meanA;
      const db = b[i - j] - meanB;
      cov += da * db;
      varA += da * da;
      varB += db * db;
    }
    const denom = Math.sqrt(varA * varB);
    out[i] = denom > 0 ? cov / denom : 0;
  }
  return out;
}

export function taPercentRank(src: number[], length: number): number[] {
  const n = Math.max(1, Math.round(length));
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = n; i < src.length; i++) {
    let count = 0;
    for (let j = 1; j <= n; j++) {
      if (src[i - j] <= src[i]) count++;
    }
    out[i] = (count / n) * 100;
  }
  return out;
}

export function taRange(src: number[], length: number): number[] {
  const hh = taHighest(src, length);
  const ll = taLowest(src, length);
  return hh.map((h, i) => h - ll[i]);
}
