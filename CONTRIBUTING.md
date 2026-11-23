# Contributing to Pro-Charts

Thank you for your interest in contributing to **Pro-Charts**! Whether you are fixing a Pine Script v6 edge case, adding a new technical drawing overlay, improving MetaTrader 5 integration, or enhancing documentation, every contribution helps make open-source charting better for all traders.

---

## Ways to Contribute

- **Report Bugs:** Open a [Bug Report](https://github.com/daffatahtaa/Pro-Charts/issues/new?template=bug_report.yml) with reproduction steps, timeframe/symbol details, and screenshots if relevant.
- **Suggest Features:** Open a [Feature Request](https://github.com/daffatahtaa/Pro-Charts/issues/new?template=feature_request.yml) for new Pine Script built-ins, drawing tools, indicators, or broker workflows.
- **Submit Pull Requests:** Implement bug fixes, performance improvements, Pine Script `ta.*` functions, or UI enhancements.
- **Share Pine Script Templates:** Contribute clean, well-tested `//@version=6` starter indicators.

---

## Local Development Setup

### Prerequisites
- **Node.js** 18+ and **npm**
- **Python** 3.10+
- **MetaTrader 5** terminal (Windows, optional — Pro-Charts automatically runs in realistic simulated/mock mode when MT5 is unavailable)

### 1. Fork & Clone
```bash
git clone https://github.com/<your-username>/Pro-Charts.git
cd Pro-Charts
```

### 2. Backend (FastAPI + DuckDB + MT5)
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Frontend (React + TypeScript + Vite)
```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

---

## Project Architecture

```text
Pro-Charts/
├── backend/                  # FastAPI REST + WebSocket server, MT5 IPC, DuckDB cache
│   ├── main.py               # API routes & /ws/stream WebSocket hub
│   ├── mt5_service.py        # Live MetaTrader 5 IPC bridge + simulated fallback engine
│   ├── cache_service.py      # DuckDB candle, drawing, news & alert persistence
│   ├── news_service.py       # Pair-correlated economic calendar & news engine
│   ├── backtest_service.py   # Replay paper-trading backtest metrics & export
│   ├── journal_service.py    # Myfxbook-style performance analytics & daily notes
│   ├── broker_catalog.py     # Local MT5 broker/server discovery
│   └── tests/                # Pytest suite (bulk trading, drawings z-order, news)
└── frontend/                 # React 18 + TypeScript + Tailwind + Zustand + KLineCharts
    └── src/
        ├── components/       # Toolbar, ChartContainer, SecondaryChartPane, BulkSlTpEditor, ChartNewsOverlay, Modals
        ├── overlays/         # 80+ custom TradingView-style KLineCharts drawing tools
        ├── services/
        │   ├── pine/         # Modular Pine Script v4/v5/v6 parser, ta.* library, runtime & Vitest suite
        │   ├── replayEngine.ts
        │   ├── chartSnapshot.ts
        │   ├── api.ts & ws.ts
        └── store/            # Zustand workspace & trading state
```

---

## Pull Request Guidelines

1. Create a descriptive branch from `main` (e.g., `feat/pine-ta-vwap`, `fix/replay-mtf-sync`).
2. Keep changes focused and minimal — avoid unrelated refactoring.
3. Verify backend tests, frontend tests, and production build pass before submitting:
   ```bash
   cd backend && python -m pytest tests -v
   cd ../frontend && npm test && npm run build
   ```
4. Follow Conventional Commits where possible (`feat:`, `fix:`, `docs:`, `perf:`, `refactor:`).
5. Fill out the Pull Request template completely and attach screenshots/GIFs for UI changes.

---

## Code of Conduct

Please note that this project follows our [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to uphold a welcoming, respectful environment.
