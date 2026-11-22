# Changelog

All notable changes to **Pro-Charts** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.5.3] — Pine v6 `xloc.bar_time` Canvas Projection & Auto Chart-TF Detection

### Fixed
- Fixed `box.new(..., xloc = xloc.bar_time)` and `label.new(..., xloc = xloc.bar_time)` coordinate mapping via binary-search timestamp interpolation so sub-pane strip cells render pixel-accurately under every candle.

### Added
- Added automatic chart timeframe detection (`detectedChartSec`) for `timeframe.in_seconds()` and `box.set_text` / `label.new` Canvas rendering.

---

## [2.5.2] — Pine v6 Performance Optimization (13.4x Speedup & 60 FPS Live Ticks)

### Changed
- Added `calcCache` memoization with adaptive live-tick throttling in `registerSavedPineWithKLine` (`0 ms` on intermediate ticks).
- Added zero-allocation `BarExecCtx` and 550-bar tail windowing for heavy nested-loop scripts (*Support Resistance Channels* 2,000 bars in ~285 ms).

### Fixed
- Fixed main-pane KLineCharts indicator tooltip collision with `ChartLegend.tsx` and resolved real Pine script titles in the active indicators legend.

---

## [2.5.1] — Persistent Multi-Select Handles & Pine v6 Built-in Compatibility

### Fixed
- Fixed selection box handles so circle/square dots remain continuously lit (`selectedOverlayIds.length > 0`) after `mouseup` for both single and multi-selected drawings, tracking live moves and deselecting cleanly on empty canvas click.

### Added
- Added `chart.*` namespace, `color.r/g/b`, inline `input.*(...)` expression extraction, type-cast helpers (`bool()`, `int()`, `float()`, `string()`, `color()`), and recursive nested `if`/`break`/`continue` support.

---

## [2.5.0] — Shift-Hold Angle Lock, Fullscreen Mode & HiDPI Chart Snapshot

### Added
- Global `Shift`-hold `0° / 45° / 90°` angle snapping across directional drawing tools and anchor handle dragging.
- TradingView Fullscreen Mode (`Shift + F` / `Esc`) with native browser fullscreen sync and floating top-right hover controls.
- `CHART SNAPSHOT` dropdown and composite HiDPI PNG exporter (`Download image`, `Copy image`, `Copy link` backed by `POST /api/snapshots`, `Open in new tab`, `Post image` to X) with TradingView keyboard shortcuts.

---

## [2.4.0] — Pine Script v6 (`//@version=6`) Engine & Indicator Settings Modal

### Added
- Modular 4-file Pine Script v6 engine (`pineTypes.ts`, `pineTaLib.ts`, `pineParser.ts`, `pineRuntime.ts`) with 40+ `ta.*` functions, tuple destructuring, User-Defined Types (`type`), `if`/`switch`/`for`/`while`, `array.*` negative indexing, `box.new` & `label.new` Canvas rendering, and 6 ready-to-run `//@version=6` starter templates.
- TradingView-style **Indicator Settings** modal with grouped typed controls (`int`, `float`, `bool`, `string` options, `source`, `color`) accessible from the chart legend.

---

## [2.3.0] — TradingView Bar Replay Pro (Deep History, Intra-Bar & Lookahead-Free MTF)

### Added
- Backend `/api/mt5/candles/window` and `/api/mt5/candles/earliest` endpoints for arbitrary historical date jumps.
- Universal `replayTimeMs` clock, intra-bar sub-candle aggregation (`1h` chart stepping by `15m`/`5m`/`1m`), auto-extending forward buffer, lookahead-free timeframe switching during Replay, split-screen secondary pane sync, and the `SELECT STARTING POINT` toolbar & `Date...` modal.

---

## [2.2.0] — Multi-Select Marquee, Drawing Grouping & Boxless Labels

### Added
- `Ctrl + Drag` blue translucent marquee selection box with live TradingView circle/square handles, `Ctrl + G` / `Ctrl + Shift + G` grouping, collapsible group folders in Object Tree, and batch move/style/delete.
- Boxless TradingView drawing typography with centered line-splitting on horizontal lines and 1px hairline rendering.

---

## [2.1.0] — TradingView Context Menu, Top-Left Header, 3-Pill R:R Tool & 80+ Drawing Suite

### Added
- Right-click chart context menu, Order Ticket modal, OHLCV Table View, Chart Templates, and outlined One-Click `SELL / BUY` legend header with live status pills.
- 3-pill Risk/Reward position overlays with edge-locked handles, all 7 left-sidebar flyouts, and drag-reorderable Watchlist rows.
