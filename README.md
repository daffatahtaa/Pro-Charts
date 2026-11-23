<div align="center">

<a href="https://github.com/daffatahtaa/Pro-Charts">
  <img src="./docs/assets/pro-charts-banner.jpg" alt="Pro-Charts — Free Open-Source TradingView Alternative with Live MetaTrader 5 Execution, Pine Script v6 Engine, and Multi-Timeframe Forex Bar Replay" width="100%" />
</a>

# ⚡ Pro-Charts

### Free, Open-Source TradingView Alternative Powered by Live MetaTrader 5 Execution & Full Pine Script v6

[![License: MIT](https://img.shields.io/badge/License-MIT-2962FF?style=flat-square)](./LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/daffatahtaa/Pro-Charts?style=flat-square&color=f59e0b)](https://github.com/daffatahtaa/Pro-Charts/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/daffatahtaa/Pro-Charts?style=flat-square&color=089981)](https://github.com/daffatahtaa/Pro-Charts/network/members)
[![Last Commit](https://img.shields.io/github/last-commit/daffatahtaa/Pro-Charts?style=flat-square&color=6366f1)](https://github.com/daffatahtaa/Pro-Charts/commits/main)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-089981?style=flat-square)](./CONTRIBUTING.md)

[![React 18](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript 5](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![MetaTrader 5](https://img.shields.io/badge/MetaTrader_5-Live_IPC-2962FF?style=flat-square)](https://www.metatrader5.com/)
[![Pine Script v6](https://img.shields.io/badge/Pine_Script-v4%20%7C%20v5%20%7C%20v6-089981?style=flat-square)](https://www.tradingview.com/pine-script-docs/)
[![DuckDB](https://img.shields.io/badge/DuckDB-Local_Cache-FFF000?style=flat-square&logo=duckdb&logoColor=black)](https://duckdb.org/)

**Pro-Charts** is a free, self-hosted, open-source **TradingView alternative** built for Forex, Gold (`XAUUSD`), Crypto, and Indices traders. Stream zero-latency **MetaTrader 5 (MT5)** live WebSocket candles, execute trades directly from the chart, run custom **Pine Script v4 / v5 / v6** indicators, backtest with lookahead-free **Multi-Timeframe Bar Replay**, and analyze performance with a **Myfxbook-style Trading Journal** — with zero monthly subscriptions or paywalls.

[Features](#-core-features) · [vs. TradingView](#-why-pro-charts-pro-charts-vs-tradingview) · [Quick Start](#-quick-start--installation) · [Pine Script v6](#-pine-script-v6-engine-example) · [Architecture](#-architecture--tech-stack) · [Shortcuts](#-keyboard-shortcuts) · [FAQ](#-frequently-asked-questions-faq)

</div>

---

## 📖 Table of Contents

- [Why Pro-Charts? (Pro-Charts vs. TradingView)](#-why-pro-charts-pro-charts-vs-tradingview)
- [Core Features](#-core-features)
- [Pine Script v6 Engine Example](#-pine-script-v6-engine-example)
- [Architecture & Tech Stack](#-architecture--tech-stack)
- [Quick Start & Installation](#-quick-start--installation)
- [Keyboard Shortcuts](#-keyboard-shortcuts)
- [Changelog](#-changelog)
- [Frequently Asked Questions (FAQ)](#-frequently-asked-questions-faq)
- [Contributing & License](#-contributing--community)

---

## ⚖️ Why Pro-Charts? (Pro-Charts vs. TradingView)

Many core trading workflows—such as intraday Bar Replay, multi-chart split layouts, unlimited custom indicators, and direct MetaTrader 5 execution—are locked behind expensive monthly paywalls. **Pro-Charts** unlocks them locally and for free:

| Capability | Pro-Charts (Open Source) | TradingView Free Plan | TradingView Paid Plans |
| :--- | :---: | :---: | :---: |
| **Price** | **Free forever (MIT)** | Free (with ads) | $14.95 – $59.95+/month |
| **Intraday Bar Replay (1m / 5m / 15m / 1h)** | **Included (Intra-bar MTF)** | Daily+ only | Paid add-on / Essential+ |
| **Multi-Chart Split Layouts (`1 / 2v / 2h / 4`)** | **Up to 4 synced panes** | 1 chart per tab | Essential / Plus / Premium |
| **Custom Pine Script Indicators** | **Unlimited (`v4 / v5 / v6`)** | Max 2 indicators | 5 – 25+ indicators |
| **Direct MetaTrader 5 Live Execution** | **Native MT5 IPC bridge** | Not supported natively | Not supported natively |
| **On-Chart Drag SL/TP & One-Click Trade** | **Included** | Limited brokers | Limited brokers |
| **Persistent Price Alerts & Drawings** | **Unlimited (Local DuckDB)** | Limited alerts | Tiered limits |
| **Built-in Trading Journal & Calendar** | **Myfxbook-style analytics** | Not included | Not included |
| **Privacy & Data Ownership** | **100% Local & Self-Hosted** | Cloud-hosted | Cloud-hosted |

---

## ✨ Core Features

### 📈 Live MetaTrader 5 (MT5) Charting & Direct Trade Execution
- **Zero-Latency WebSocket Streaming** — Live bid/ask tick feeds (`/ws/stream`) with 1-second candle synchronization and local **DuckDB** caching for instant chart reloads.
- **Direct On-Chart Order Execution** — Outlined TradingView-style One-Click `SELL / BUY` legend header, Order Ticket modal, and interactive on-chart **Stop Loss (SL) / Take Profit (TP)** drag lines.
- **Multi-Broker & Headless MT5 Support** — Built-in local MT5 server scanner, account switcher, Algo Trading toggle, and **Headless MT5 Cloak Mode** to hide the native MT5 window while trading cleanly in the browser.
- **Built-in Offline / Simulated Mode** — Automatically falls back to a realistic mock market engine when MetaTrader 5 is not running, allowing instant testing on **Windows, macOS, and Linux**.

### 🌲 Full Pine Script v4 / v5 / v6 (`//@version=6`) Engine
- **Modular 4-File Parser & Hybrid Runtime** (`pineTypes`, `pineTaLib`, `pineParser`, `pineRuntime`) running natively in TypeScript at **60 FPS** on live ticks via `calcCache` memoization and adaptive throttling.
- **40+ Technical Analysis (`ta.*`) Functions** — Full support for multi-output tuples (`ta.supertrend`, `ta.macd`, `ta.bb`, `ta.dmi`, `ta.kc`), `ta.pivothigh/low`, `ta.hma`, `ta.ema/sma/rma/wma`, `ta.crossover/under`, and `fixnan`.
- **Modern Pine v6 Language Features** — User-Defined Types (`type`), `if/else`, `switch`, `for`, `while`, `array.*` (including v6 negative indexing), `chart.*`, `timeframe.in_seconds()`, and Canvas rendering for `box.new` (with `xloc.bar_time`), `label.new`, `fill()`, and `plotshape()`.
- **TradingView-Style Indicator Settings Modal (`⚙`)** — Dynamically generates grouped typed controls (`int`, `float`, `bool`, `string` options, `source`, `color`) directly from every `input.*` call in your script.
- **6 Ready-to-Run `//@version=6` Starter Templates** — Includes *SuperTrend v6 Pro*, *Ichimoku Cloud v6*, *Adaptive MA v6*, *SMC Swing Levels v6*, and *MACD v6 Pro*.

### ⏪ Free Multi-Timeframe Forex Bar Replay & Paper Trading
- **Deep-History Window Fetching** — Jump to any historical date via `/api/mt5/candles/window` and `/api/mt5/candles/earliest` with `SELECT STARTING POINT` (`Bar`, `Date...` modal with presets, `First available date`, or `Random bar`).
- **Lookahead-Free MTF & Intra-Bar Sub-Steps** — Universal `replayTimeMs` clock aggregates intra-bar sub-candles (`1h` chart stepping realistically by `15m / 5m / 1m`) with zero future data leakage when switching timeframes or syncing split-screen panes.
- **Integrated Paper Trading & Backtest Reports** — Place simulated market/limit entries with SL/TP during Bar Replay and export full session performance statistics.

### ✏️ 80+ Precision Drawing Tools & Pro Interactions
- **Complete Technical Analysis Drawing Suite** — Trendlines, Rays, Parallel Channels, Fibonacci Retracements & Extensions, Gann tools, Pitchforks, Elliott Waves, Brushes, Text/Callouts, Icons/Stickers, Ruler, and **3-Pill Risk/Reward Long & Short Position** tools with edge-locked handles.
- **Multi-Select Marquee & Grouping** — `Ctrl + Drag` translucent selection marquee with persistent TradingView anchor handles, `Ctrl + G` / `Ctrl + Shift + G` grouping, collapsible **Object Tree** group folders, and batch move/style/delete.
- **Pro Snapping & Clean Typography** — Hold **`Shift`** to lock angles to `0° / 45° / 90°`, plus crisp 1px hairline lines and boxless centered horizontal labels.

### 🖥️ Multi-Chart Layouts, HiDPI Snapshots, Alerts & Trading Journal
- **Multi-Chart Split Grids** — Instant `1 / 2v / 2h / 4` workspace layouts synced seamlessly with live feeds and Bar Replay.
- **Fullscreen Mode (`[ ⛶ ]`) & HiDPI Chart Snapshots (`[ 📷 ]`)** — Distraction-free viewport (`Shift + F`) and composite PNG snapshot exporter (`Download image`, `Copy image`, `Copy link` via `POST /api/snapshots`, `Open in new tab`, `Post image` to `𝕏`).
- **Watchlist, Audio Alerts & Myfxbook-Style Analytics** — Drag-reorderable Watchlist, persistent browser audio price alerts, equity curve analytics, trade tagging, and a daily P&L Trading Calendar.

---

## 🧪 Pine Script v6 Engine Example

Paste and run native TradingView `//@version=6` scripts directly inside **Pro-Charts** — complete with `input.*` settings modals, tuple destructuring, cloud fills, and buy/sell signals:

```pine
//@version=6
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
plotshape(ta.crossover(direction, 0), title="Sell", style=shape.triangledown, location=location.abovebar, color=color.red, text="SELL")
```

---

## 🏗️ Architecture & Tech Stack

```mermaid
flowchart LR
    MT5["MetaTrader 5 Terminal (Live IPC / Simulated Fallback)"] <--> API["FastAPI Backend (REST + WebSocket /ws/stream)"]
    API <--> DB[("DuckDB Local Cache (Candles, Drawings, Alerts)")]
    API <--> UI["React 18 + TypeScript Frontend (Vite + Zustand)"]
    UI --> Chart["KLineCharts Canvas + 80+ Drawing Overlays"]
    UI --> Pine["Modular Pine Script v4/v5/v6 Engine"]
    UI --> Replay["Lookahead-Free MTF Bar Replay Engine"]
```

| Layer | Technologies |
| :--- | :--- |
| **Frontend UI & State** | React 18, TypeScript 5, Vite 5, Tailwind CSS 3, Zustand 4, Lucide Icons |
| **Charting & Overlays** | KLineCharts 9, Custom Canvas Overlays, Composite HiDPI PNG Snapshot Engine |
| **Scripting Engine** | Custom TypeScript Pine Script v4 / v5 / v6 Lexer, AST Parser, `ta.*` Library & Memoized Runtime |
| **Backend API & Streaming** | Python 3.10+, FastAPI, Uvicorn, WebSockets, Pydantic, NumPy |
| **Broker Bridge & Storage** | Official `MetaTrader5` Python IPC Library, DuckDB Embedded Analytics Database |

---

## 🚀 Quick Start & Installation

### Prerequisites

- **Node.js** `18+` & **npm**
- **Python** `3.10+`
- **MetaTrader 5** terminal (Windows, optional for live trading — **Pro-Charts** automatically falls back to a built-in simulated market feed when MT5 is offline or on macOS/Linux)

### Option 1 — One-Click Launcher (Windows)

```bat
git clone https://github.com/daffatahtaa/Pro-Charts.git
cd Pro-Charts
start-dev.bat
```

> First run: the launcher auto-installs backend (venv + pip) and frontend (npm) dependencies.

### Option 2 — Manual Setup (Windows / macOS / Linux)

**1. Clone the repository**
```bash
git clone https://github.com/daffatahtaa/Pro-Charts.git
cd Pro-Charts
```

**2. Start the Backend (FastAPI + DuckDB + MT5 Bridge)**
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate      # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**3. Start the Frontend (Vite + React + TypeScript)**
```powershell
cd frontend
npm install
npm run dev
```

Open **`http://localhost:5173`** in your browser and start charting!

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + K` | Open Symbol Search |
| `Shift` (hold while drawing) | Lock drawing angle to `0° / 45° / 90°` |
| `Ctrl + Drag` | Multi-select drawings marquee box |
| `Ctrl + G` / `Ctrl + Shift + G` | Group / Ungroup selected drawings |
| `Shift + F` / `Esc` | Toggle / Exit Fullscreen mode |
| `Ctrl + Alt + S` | Download chart snapshot (HiDPI PNG) |
| `Ctrl + Shift + S` | Copy chart snapshot image to clipboard |
| `Alt + S` | Copy shareable chart snapshot link |
| `Ctrl + Z` / `Ctrl + Y` | Undo / Redo drawing |
| `Space` / `Shift + →` / `Shift + ←` | Bar Replay Play/Pause / Step Forward / Step Back |

---

## 📜 Changelog

See the full release history in [`CHANGELOG.md`](./CHANGELOG.md).

### 🔥 Last 5 Major Releases

- **`v2.5.0` — Shift-Hold Angle Lock, Fullscreen Mode & HiDPI Chart Snapshot**
  - Global `Shift`-hold `0° / 45° / 90°` angle snapping across directional drawing tools & anchor handles.
  - TradingView Fullscreen Mode (`[ ⛶ ]` / `Shift + F`) with native browser fullscreen sync and floating hover controls.
  - `[ 📷 ]` `CHART SNAPSHOT` dropdown & composite HiDPI PNG exporter (`Download image`, `Copy image`, `Copy link` via `POST /api/snapshots`, `Open in new tab`, `Post image` to `𝕏`).
- **`v2.4.0` — Pine Script v6 (`//@version=6`) Engine & Indicator Settings Modal**
  - Modular 4-file Pine Script v6 engine (`pineTypes`, `pineTaLib`, `pineParser`, `pineRuntime`) with 40+ `ta.*` functions, tuple destructuring, User-Defined Types (`type`), `if`/`switch`/`for`/`while`, `array.*` negative indexing, `box.new` & `label.new` Canvas rendering, and 6 starter templates.
  - TradingView-style **Indicator Settings (`⚙`)** modal with grouped typed controls directly from the chart legend.
- **`v2.3.0` — TradingView Bar Replay Pro (Deep History, Intra-Bar & Lookahead-Free MTF)**
  - Backend `/api/mt5/candles/window` & `/api/mt5/candles/earliest` endpoints for arbitrary historical date jumps.
  - Universal `replayTimeMs` clock, intra-bar sub-candle aggregation (`1h → 15m/5m/1m`), auto-extending forward buffer, lookahead-free MTF switching, split-screen secondary pane sync, and `SELECT STARTING POINT` toolbar & `Date...` modal.
- **`v2.2.0` — `Ctrl + Drag` Multi-Select Marquee, Drawing Grouping & Boxless Labels**
  - `Ctrl + Drag` blue translucent marquee selection with persistent anchor handles, `Ctrl + G` / `Ctrl + Shift + G` grouping, Object Tree group folders, and batch actions.
  - Boxless TradingView drawing typography with centered line-splitting on horizontal lines and 1px hairline rendering.
- **`v2.1.0` — TradingView Context Menu, Top-Left Header, 3-Pill R:R Tool & 80+ Drawing Suite**
  - Right-click chart context menu, Order Ticket modal, OHLCV Table View, Chart Templates, and outlined One-Click `SELL / BUY` header with live status pills.
  - 3-pill Risk/Reward position overlays with edge-locked handles, all 7 left-sidebar flyouts, and drag-reorderable Watchlist rows.

### 🛠️ Latest 3 Minor Revisions

- **`v2.5.3` — Pine v6 `xloc.bar_time` Canvas Projection & Auto Chart-TF Detection** — Binary-search timestamp interpolation for `box.new` / `label.new` (`xloc.bar_time`) and automatic chart timeframe detection (`detectedChartSec`) for `timeframe.in_seconds()`.
- **`v2.5.2` — Pine v6 Performance Optimization (13.4× Speedup & 60 FPS Live Ticks)** — `calcCache` memoization with adaptive live-tick throttling (`0 ms` on intermediate ticks) and zero-allocation `BarExecCtx` + 550-bar tail windowing.
- **`v2.5.1` — Persistent Multi-Select Handles & Pine v6 Built-in Compatibility** — Continuously lit selection handles after `mouseup`, plus `chart.*` namespace, `color.r/g/b`, inline `input.*(...)` extraction, type-cast helpers, and nested `if`/`break`/`continue`.

---

## ❓ Frequently Asked Questions (FAQ)

### Is Pro-Charts really a free TradingView alternative?
Yes. Pro-Charts is 100% open source under the [MIT License](./LICENSE). You run it locally on your own machine with zero subscription fees, no ads, and no artificial limits on intraday Bar Replay, split charts, drawings, or custom indicators.

### Does Pro-Charts require a MetaTrader 5 account to run?
No. While live market feeds and direct order execution connect to any local **MetaTrader 5** demo or live broker account on Windows, Pro-Charts includes a built-in **Simulated Market Engine** fallback so you can test charting, Pine Script v6, drawings, and Bar Replay immediately without MT5 installed.

### Can I paste TradingView Pine Script v6 indicators into Pro-Charts?
Yes. Pro-Charts includes a custom Pine Script v4 / v5 / v6 parser and execution runtime supporting 40+ `ta.*` functions, tuple destructuring, User-Defined Types (`type`), arrays, `box.new`, `label.new`, `fill()`, `plotshape()`, and automatic `input.*` settings modals.

### Does Bar Replay work across multiple timeframes without lookahead bias?
Yes. Bar Replay uses a single universal `replayTimeMs` clock with intra-bar sub-candle aggregation (`1h` stepping by `15m / 5m / 1m`), preventing future candles from leaking when switching timeframes or viewing multi-chart split layouts.

### Can I run Pro-Charts on macOS or Linux?
Yes. The React + TypeScript frontend and FastAPI + DuckDB backend run natively on Windows, macOS, and Linux (using the simulated market feed on non-Windows platforms where MetaTrader 5's native Python IPC library is unavailable).

---

## 🤝 Contributing & Community

Contributions, bug reports, Pine Script v6 indicator templates, and feature requests are always welcome!

- Read our [Contributing Guide](./CONTRIBUTING.md) and [Code of Conduct](./CODE_OF_CONDUCT.md)
- Report bugs or suggest features in [GitHub Issues](https://github.com/daffatahtaa/Pro-Charts/issues)
- Review our [Security Policy](./SECURITY.md) before live trading

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](./LICENSE) for details.

> **Disclaimer:** Pro-Charts is open-source charting and trade-execution software provided for educational and analytical purposes. Trading Forex, CFDs, and financial instruments involves significant risk of loss. Always test strategies and MT5 execution on a demo account first.

---

<div align="center">

If **Pro-Charts** saves you money on charting subscriptions or levels up your MT5 workflow, consider giving the repo a **⭐ Star** on GitHub!

</div>
