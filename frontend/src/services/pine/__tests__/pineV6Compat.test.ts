import { describe, expect, it } from 'vitest';
import type { KLineData } from 'klinecharts';
import { parsePineScript } from '../pineParser';
import {
  executeParsedPine,
  resampleCandlesToTf,
  validatePineScript,
} from '../pineRuntime';
import { PINE_STARTER_TEMPLATES } from '../../pineEngine';

function make15mCandles(count: number, startMs = Date.UTC(2026, 0, 5, 0, 0, 0)): KLineData[] {
  return Array.from({ length: count }, (_, i) => {
    const base = 2000 + i * 1.5 + Math.sin(i * 0.35) * 4;
    return {
      timestamp: startMs + i * 15 * 60 * 1000,
      open: Number((base - 0.5).toFixed(2)),
      high: Number((base + 2.0).toFixed(2)),
      low: Number((base - 2.0).toFixed(2)),
      close: Number((base + 0.5).toFixed(2)),
      volume: 100 + (i % 10) * 25,
    };
  });
}

describe('Pine Script v6 Engine Compatibility Suite (Issue #4)', () => {
  it('supports UDT + method + enum + array<UDT> + for [i, item] in arr', () => {
    const code = `//@version=6
indicator("UDT Method Enum Test", overlay=true)

enum Bias
    bull = "Bullish"
    bear = "Bearish"

type Swing
    float price
    int idx
    Bias dir

method updatePrice(Swing this, float p) =>
    this.price := p

method distFrom(Swing this, float ref) =>
    math.abs(this.price - ref)

var swings = array.new<Swing>()
var float weightedSum = 0.0
var string lastDir = ""

if bar_index == 5
    swings.push(Swing.new(high, bar_index, Bias.bull))
if bar_index == 10
    swings.push(Swing.new(low, bar_index, Bias.bear))

if bar_index == 15
    s0 = swings.get(0)
    s0.updatePrice(close)
    float acc = 0.0
    for [idx, item] in swings
        acc += (idx + 1) * item.distFrom(open)
        lastDir := str.tostring(item.dir)
    weightedSum := acc

plot(weightedSum, "Weighted", color=color.blue)
`;

    const bars = make15mCandles(25);
    const parsed = parsePineScript(code);
    const rows = executeParsedPine(parsed, bars, []);

    expect(parsed.warnings).toEqual([]);
    expect(rows).toHaveLength(25);

    // At bar 15: s0.price was updated to bars[15].close -> distFrom(open) = |close - open| = 1.0
    // s1.price = bars[10].low -> distFrom(bars[15].open) = |bars[10].low - bars[15].open|
    const expected =
      1 * Math.abs(bars[15].close - bars[15].open) +
      2 * Math.abs(bars[10].low - bars[15].open);
    expect(rows[15].p0).toBeCloseTo(expected, 4);
    // Persisted via `var` through bar 24
    expect(rows[24].p0).toBeCloseTo(expected, 4);
  });

  it('executes drawing-only SMC script (line, box, label, linefill, polyline) with zero plot() calls', () => {
    const code = `//@version=6
indicator("SMC BOS/CHoCH Primitives")

var line topLn = na
var line botLn = na
var linefill zoneFill = na
var box obBox = na
var label bosLbl = na
var float interpPrice = na

if bar_index == 10
    topLn := line.new(bar_index - 5, high[5], bar_index, high, extend=extend.right, color=color.green, style=line.style_dashed, width=2)
    botLn := line.new(bar_index - 5, low[5], bar_index, low, extend=extend.right, color=color.red, style=line.style_dotted, width=1)
    zoneFill := linefill.new(topLn, botLn, color.new(color.blue, 85))
    obBox := box.new(bar_index - 2, high, bar_index + 5, low, bgcolor=color.new(color.green, 80), border_color=color.green, text="OB")
    bosLbl := label.new(bar_index, high, "BOS", style=label.style_label_down, color=color.green, textcolor=color.white)
    bosLbl.set_color(color.orange)
    bosLbl.set_textcolor(color.black)
    pts = array.from(chart.point.from_index(bar_index - 4, low[4]), chart.point.from_index(bar_index - 2, high[2]), chart.point.from_index(bar_index, close))
    polyline.new(pts, curved=true, closed=false, line_color=color.purple, line_width=2)

if bar_index == 20
    topLn.set_x2(bar_index)
    interpPrice := topLn.get_price(15)
`;

    const bars = make15mCandles(25);
    const parsed = parsePineScript(code);
    // Drawing-only script should parse cleanly and default to main overlay
    expect(parsed.isMain).toBe(true);
    expect(parsed.plots).toHaveLength(0);

    const rows = executeParsedPine(parsed, bars, []);
    const last = rows[rows.length - 1];

    expect(last.__lines).toBeDefined();
    expect(last.__lines!.length).toBe(2);
    expect(last.__lines![0].x2).toBe(20);
    expect(last.__lines![0].style).toBe('dashed');
    expect(last.__lines![0].extend).toBe('right');
    expect(last.__lines![0].width).toBe(2);

    expect(last.__linefills).toBeDefined();
    expect(last.__linefills!.length).toBe(1);
    expect(last.__linefills![0].line1).toBe(last.__lines![0]);
    expect(last.__linefills![0].line2).toBe(last.__lines![1]);

    expect(last.__boxes).toBeDefined();
    expect(last.__boxes!.length).toBe(1);
    expect(last.__boxes![0].text).toBe('OB');

    expect(last.__labels).toBeDefined();
    expect(last.__labels!.length).toBe(1);
    expect(last.__labels![0].text).toBe('BOS');
    expect(last.__labels![0].color).toBe('#ff9800'); // updated via set_color(color.orange)
    expect(last.__labels![0].textColor).toBe('#131722'); // updated via set_textcolor(color.black)

    expect(last.__polylines).toBeDefined();
    expect(last.__polylines!.length).toBe(1);
    expect(last.__polylines![0].points).toHaveLength(3);
    expect(last.__polylines![0].curved).toBe(true);
  });

  it('computes real MTF request.security with zero lookahead, timeframe.change, syminfo, and table dashboard', () => {
    const code = `//@version=6
indicator("MTF 4H Dashboard", overlay=true)

htfEma = request.security(syminfo.tickerid, "240", ta.ema(close, 3))
[htfO, htfH, htfL, htfC] = request.security(syminfo.tickerid, "240", [open, high, low, close])
htfCLookahead = request.security(syminfo.tickerid, "240", close, lookahead=barmerge.lookahead_on)
isNew4H = timeframe.change("240")

var tbl = table.new(position.top_right, 2, 3, bgcolor=color.new(color.black, 20), border_color=color.gray, border_width=1)
if barstate.islast
    table.cell(tbl, 0, 0, syminfo.ticker, text_color=color.white, bgcolor=color.blue)
    tbl.cell(1, 0, str.tostring(syminfo.mintick), text_color=color.yellow, bgcolor=color.black)
    table.cell(tbl, 0, 1, "4H EMA", text_color=color.white)
    table.cell(tbl, 1, 1, str.tostring(htfEma), text_color=color.green)
    table.merge_cells(tbl, 0, 2, 1, 2)
    table.cell(tbl, 0, 2, "LIVE", text_color=color.white, bgcolor=color.green)

plot(htfEma, "4H EMA", color=color.orange)
plot(htfC, "4H Close", color=color.blue)
plot(htfCLookahead, "4H Close Lookahead", color=color.gray)
plot(isNew4H ? 1 : 0, "New 4H", color=color.purple)
`;

    // 160 x 15m bars = 10 exact 4H buckets (16 base bars per 4H bucket)
    const bars = make15mCandles(160);
    const resampled = resampleCandlesToTf(bars, 240 * 60);
    expect(resampled.bars).toHaveLength(10);

    const parsed = parsePineScript(code);
    const rows = executeParsedPine(parsed, bars, [], {
      symbolInfo: {
        symbol: 'XAUUSD',
        description: 'Gold vs US Dollar',
        digits: 2,
        point: 0.01,
        category: 'Metals',
      },
      timezone: 'Etc/UTC',
    });

    // Zero lookahead check: bars 0..15 (bucket 0) have NO prior completed 4H bar -> undefined (NaN)
    expect(rows[0].p1).toBeUndefined();
    expect(rows[15].p1).toBeUndefined();

    // Bars 16..31 (bucket 1) MUST ALL hold bucket 0's close (bars[15].close), NEVER peeking at bar 31!
    for (let i = 16; i <= 31; i++) {
      expect(rows[i].p1).toBeCloseTo(bars[15].close, 5);
    }
    // Bars 32..47 (bucket 2) step cleanly to bucket 1's close (bars[31].close)
    for (let i = 32; i <= 47; i++) {
      expect(rows[i].p1).toBeCloseTo(bars[31].close, 5);
    }

    // Lookahead ON returns bucket 0's close right at bar 0
    expect(rows[0].p2).toBeCloseTo(bars[15].close, 5);

    // 4H EMA(3) on bucket 3 (bars 48..63) should be stepped constant & distinct from base close
    expect(rows[48].p0).toBeDefined();
    expect(rows[48].p0).toBeCloseTo(rows[63].p0, 6);

    // timeframe.change("240") triggers strictly on bar 0, 16, 32, ...
    expect(rows[0].p3).toBe(1);
    expect(rows[1].p3).toBe(0);
    expect(rows[15].p3).toBe(0);
    expect(rows[16].p3).toBe(1);
    expect(rows[17].p3).toBe(0);
    expect(rows[32].p3).toBe(1);

    // Table dashboard populated with real syminfo.* values and merged cell
    const last = rows[rows.length - 1];
    expect(last.__tables).toBeDefined();
    expect(last.__tables!.length).toBe(1);
    const tbl = last.__tables![0];
    expect(tbl.position).toBe('top_right');
    expect(tbl.cells['0_0'].text).toBe('XAUUSD');
    expect(tbl.cells['0_1'].text).toBe('0.01');
    expect(tbl.cells['1_0'].text).toBe('4H EMA');
    expect(Number(tbl.cells['1_1'].text)).toBeGreaterThan(2000);
    expect(tbl.cells['2_0'].colSpan).toBe(2);
    expect(tbl.cells['2_1'].merged).toBe(true);
  });

  it('supports dynamic series int ta.* lengths, map.*, matrix.*, short-circuit and/or, plotcandle, and multi-line switch', () => {
    const code = `//@version=6
indicator("Dynamic TA + Map + Matrix + PlotCandle", overlay=true)

dynLen = bar_index % 2 == 0 ? 3 : 5
dynSma = ta.sma(close, dynLen)
dynHigh = ta.highest(high, dynLen)

var m = map.new<string, float>()
var mat = matrix.new<float>(2, 2, 0.0)
var emptyArr = array.new<float>(0)
var float mapTotal = 0.0
var float matSum = 0.0
var float shortCircuitOk = 0.0
var float notNaOk = 0.0
var float switchOut = 0.0

if bar_index == 10
    m.put("a", 10.5)
    m.put("b", 20.5)
    float s = 0.0
    for [k, v] in m
        s += v
    mapTotal := s + (m.contains("a") ? 1 : 0)

    mat.set(0, 0, 2.0)
    mat.set(0, 1, 3.0)
    mat.set(1, 0, 4.0)
    mat.set(1, 1, 5.0)
    mat.add_row(2, array.from(6.0, 7.0))
    matSum := mat.sum() + mat.rows() * 100

    // Short-circuit check: emptyArr.size() > 0 is false, so RHS must NOT fail or throw
    shortCircuitOk := (emptyArr.size() > 0 and emptyArr.get(0) > 0) ? 0.0 : 1.0
    notNaOk := (not na and not bool(na)) ? 1.0 : 0.0

    switchOut := switch 2
        1 =>
            tmp1 = 10
            tmp1 + 1
        2 =>
            tmp2 = 20
            tmp2 * 2
        => 0

plotcandle(open, high, low, close, title="Mirror Candles", color=close >= open ? color.green : color.red)
plot(dynSma, "Dyn SMA")
plot(dynHigh, "Dyn High")
plot(mapTotal, "Map Total")
plot(matSum, "Matrix Sum")
plot(shortCircuitOk, "Short Circuit")
plot(notNaOk, "Not NA")
plot(switchOut, "Switch Out")
`;

    const bars = make15mCandles(20);
    const parsed = parsePineScript(code);
    const rows = executeParsedPine(parsed, bars, []);

    // Dynamic SMA: bar 10 is even -> 3-bar SMA; bar 11 is odd -> 5-bar SMA
    const sma3At10 = (bars[8].close + bars[9].close + bars[10].close) / 3;
    const sma5At11 =
      (bars[7].close + bars[8].close + bars[9].close + bars[10].close + bars[11].close) / 5;
    expect(rows[10].p0).toBeCloseTo(sma3At10, 5);
    expect(rows[11].p0).toBeCloseTo(sma5At11, 5);

    // Dynamic Highest: bar 10 -> max of 8..10; bar 11 -> max of 7..11
    const hi3At10 = Math.max(bars[8].high, bars[9].high, bars[10].high);
    const hi5At11 = Math.max(bars[7].high, bars[8].high, bars[9].high, bars[10].high, bars[11].high);
    expect(rows[10].p1).toBeCloseTo(hi3At10, 5);
    expect(rows[11].p1).toBeCloseTo(hi5At11, 5);

    // Map total = 10.5 + 20.5 + 1 = 32
    expect(rows[10].p2).toBeCloseTo(32, 5);
    // Matrix sum = (2+3+4+5+6+7) + 3*100 = 27 + 300 = 327
    expect(rows[10].p3).toBeCloseTo(327, 5);
    // Short-circuit & Pine v6 `not na` / `bool(na)` semantics
    expect(rows[10].p4).toBe(1);
    expect(rows[10].p5).toBe(1);
    // Multi-line switch branch result: tmp2 = 20; tmp2 * 2 = 40
    expect(rows[10].p6).toBe(40);

    // plotcandle populates per-bar OHLC render data
    expect(rows[10].__plotCandles?.pc0).toBeDefined();
    expect(rows[10].__plotCandles?.pc0.close).toBe(bars[10].close);
  });

  it('surfaces structured compile and runtime diagnostics instead of failing silently', () => {
    const missingOutput = validatePineScript(`//@version=6
indicator("Empty")
x = close * 2
`);
    expect(missingOutput.ok).toBe(false);
    expect(missingOutput.phase).toBe('parse');
    expect(missingOutput.error).toMatch(/No visual output found/i);

    const unsupportedTa = validatePineScript(`//@version=6
indicator("Bad TA")
x = ta.nonexistent_fn(close, 14)
plot(x)
`);
    expect(unsupportedTa.ok).toBe(false);
    expect(unsupportedTa.phase).toBe('runtime');
    expect(unsupportedTa.error).toMatch(/Unsupported Pine function: ta\.nonexistent_fn/i);
  });

  it('keeps all built-in Pine starter templates passing with zero regressions', () => {
    for (const tpl of PINE_STARTER_TEMPLATES) {
      const check = validatePineScript(tpl.code);
      expect(check.ok, `Template "${tpl.label}" failed: ${check.error}`).toBe(true);
    }
  });
});
