<div align="center">

# ⚡ Pro-Charts

**Institutional-Grade TradingView Clone Powered by Live MetaTrader 5 Execution & Full Pine Script v6**

[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![MetaTrader 5](https://img.shields.io/badge/MetaTrader_5-Live_IPC-2962FF?style=flat-square)](https://www.metatrader5.com/)
[![Pine Script](https://img.shields.io/badge/Pine_Script-v4%20%7C%20v5%20%7C%20v6-089981?style=flat-square)](https://www.tradingview.com/pine-script-docs/)

*Zero-latency MT5 WebSocket candle streaming · 80+ precision drawing tools · Lookahead-free Multi-Timeframe Bar Replay · Built-in Pine Script v6 Engine with live `box.new` & `fill()` Canvas rendering.*

</div>

---

## ✨ Key Features

- **Live MetaTrader 5 Execution & Chart Trading** — Real-time bid/ask ticks, 1-second candle sync, outlined One-Click `SELL / BUY` bar, interactive on-chart SL/TP drag lines, broker/account switcher, and headless MT5 cloak mode.
- **Full Pine Script v6 (`//@version=6`) Engine** — Modular parser & hybrid runtime supporting 40+ `ta.*` functions, multi-output tuples (`ta.supertrend`, `ta.macd`, `ta.bb`, `ta.dmi`, `ta.kc`), User-Defined Types (`type`), `if/else`, `switch`, `for`, `while`, `array.*` (with v6 negative indexing), `box.new` / `label.new` / `fill()` / `plotshape()` Canvas rendering, and a TradingView-style **Indicator Settings** modal (`⚙`) for customizing every typed `input.*`.
- **TradingView Bar Replay Pro** — Deep-history window fetching, `SELECT STARTING POINT` (`Bar`, `Date...` modal with presets, `First available date`, `Random bar`), universal `replayTimeMs` clock, intra-bar sub-step candles (`1h → 15m/5m/1m`), lookahead-free MTF switching, split-screen sync, and integrated Paper Trading simulation.
- **80+ Precision Drawing Tools & Pro Interactions** — Trendlines, Fibs, Gann, Pitchforks, Elliott Waves, 3-pill Risk/Reward Position tools, `Ctrl + Drag` marquee multi-select & `Ctrl + G` grouping with persistent TradingView anchor handles, boxless centered labels, and **`Shift`-Hold `0° / 45° / 90°` Angle Lock**.
- **Fullscreen Mode `[ ⛶ ]` & HiDPI `CHART SNAPSHOT` `[ 📷 ]`** — Distraction-free full-viewport chart (`Shift + F`) and composite PNG snapshot engine (`Download image`, `Copy image`, `Copy link` via backend archive, `Open in new tab`, `Post image` to `𝕏`).
- **Multi-Chart Split Layouts, Alerts & Trading Journal** — `1 / 2v / 2h / 4` split grids, persistent audio price alerts, drag-reorderable Watchlist, Object Tree with group folders, and Myfxbook-style Performance Analytics & Calendar.

---

## 🚀 Quick Start

### Option 1 — One-Click Launcher (Windows)
```bat
start-dev.bat
```

### Option 2 — Manual Setup

**1. Backend (FastAPI + MT5)**
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**2. Frontend (Vite + React + TypeScript)**
```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 📜 Changelog

### 🔥 Last 5 Major Releases

- **`v2.5.0` — Shift-Hold Angle Lock, Fullscreen Mode & HiDPI Chart Snapshot**
  - Added global `Shift`-hold `0° / 45° / 90°` angle snapping across all directional drawing tools & anchor handle dragging.
  - Added TradingView Fullscreen Mode (`[ ⛶ ]` / `Shift + F`) with native browser fullscreen sync and floating top-right hover controls.
  - Added `[ 📷 ]` `CHART SNAPSHOT` dropdown & composite HiDPI PNG exporter (`Download image`, `Copy image`, `Copy link` backed by `POST /api/snapshots`, `Open in new tab`, `Post image` to `𝕏`) with full TradingView keyboard shortcuts.

- **`v2.4.0` — Pine Script v6 (`//@version=6`) Engine & Indicator Settings Modal**
  - Built a modular 4-file Pine Script v6 engine (`pineTypes`, `pineTaLib`, `pineParser`, `pineRuntime`) with 40+ `ta.*` functions, tuple destructuring, User-Defined Types (`type`), `if`/`switch`/`for`/`while`, `array.*` negative indexing, `box.new` & `label.new` Canvas rendering, and 6 ready-to-run `//@version=6` starter templates.
  - Added TradingView-style **Indicator Settings (`⚙`)** modal with grouped typed controls (`int`, `float`, `bool`, `string` options, `source`, `color`) directly from the chart legend.

- **`v2.3.0` — TradingView Bar Replay Pro (Deep History, Intra-Bar & Lookahead-Free MTF)**
  - Added backend `/api/mt5/candles/window` & `/api/mt5/candles/earliest` endpoints for arbitrary historical date jumps.
  - Implemented universal `replayTimeMs` clock, intra-bar sub-candle aggregation (`1h` chart stepping by `15m`/`5m`/`1m`), auto-extending forward buffer, lookahead-free timeframe switching during Replay, split-screen secondary pane sync, and the `SELECT STARTING POINT` toolbar & `Date...` modal.

- **`v2.2.0` — `Ctrl + Drag` Multi-Select Marquee, Drawing Grouping & Boxless Labels**
  - Added `Ctrl + Drag` blue translucent marquee selection box with live TradingView circle/square handles, `Ctrl + G` / `Ctrl + Shift + G` grouping, collapsible group folders in Object Tree, and batch move/style/delete.
  - Upgraded drawing labels to clean boxless TradingView typography with centered line-splitting on horizontal lines and 1px hairline rendering.

- **`v2.1.0` — TradingView Context Menu, Top-Left Header, 3-Pill R:R Tool & 80+ Drawing Suite**
  - Added right-click chart context menu, Order Ticket modal, OHLCV Table View, Chart Templates, and outlined One-Click `SELL / BUY` legend header with live `● Open` & `≈ 1s updates` status pills.
  - Added 3-pill Risk/Reward position overlays with edge-locked handles, all 7 left-sidebar flyouts (including Icons/Emojis/Stickers), and drag-reorderable Watchlist rows.

---

### 🛠️ Latest 3 Minor Revisions

- **`v2.5.3` — Pine v6 `xloc.bar_time` Canvas Projection & Auto Chart-TF Detection**
  - Fixed `box.new(..., xloc = xloc.bar_time)` and `label.new(..., xloc = xloc.bar_time)` coordinate mapping via binary-search timestamp interpolation so sub-pane strip cells (`Flow CISD+`) render pixel-accurately under every candle.
  - Added automatic chart timeframe detection (`detectedChartSec`) for `timeframe.in_seconds()` and `box.set_text` / `label.new` Canvas rendering.

- **`v2.5.2` — Pine v6 Performance Optimization (13.4× Speedup & 60 FPS Live Ticks)**
  - Added `calcCache` memoization with adaptive live-tick throttling in `registerSavedPineWithKLine` (`0 ms` on intermediate ticks) and zero-allocation `BarExecCtx` + 550-bar tail windowing for heavy nested-loop scripts (*Support Resistance Channels* 2,000 bars in ~285 ms).
  - Fixed main-pane KLineCharts indicator tooltip collision with `ChartLegend.tsx` and resolved real Pine script titles in the active indicators legend.

- **`v2.5.1` — Persistent Multi-Select Handles & Pine v6 Built-in Compatibility Fixes**
  - Fixed selection box handles so circle/square dots remain continuously lit (`selectedOverlayIds.length > 0`) after `mouseup` for both single and multi-selected drawings, tracking live moves and deselecting cleanly on empty canvas click.
  - Added `chart.*` namespace, `color.r/g/b`, inline `input.*(...)` expression extraction, type-cast helpers (`bool()`, `int()`, `float()`, `string()`, `color()`), and recursive nested `if`/`break`/`continue` support.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + K` | Open Symbol Search |
| `Shift` (hold while drawing) | Lock angle to `0° / 45° / 90°` |
| `Ctrl + Drag` | Multi-select drawings marquee box |
| `Ctrl + G` / `Ctrl + Shift + G` | Group / Ungroup selected drawings |
| `Shift + F` / `Esc` | Toggle / Exit Fullscreen mode |
| `Ctrl + Alt + S` | Download chart snapshot (PNG) |
| `Ctrl + Shift + S` | Copy chart snapshot image to clipboard |
| `Alt + S` | Copy shareable chart snapshot link |
| `Ctrl + Z` / `Ctrl + Y` | Undo / Redo drawing |
| `Space` / `Shift + →` / `Shift + ←` | Bar Replay Play/Pause / Step Forward / Step Back |
