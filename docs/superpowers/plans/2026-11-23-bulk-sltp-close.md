# Bulk Set SL/TP & Bulk Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow bulk set of SL/TP and bulk close of open positions, targetable by pair (symbol), selected positions, or all.

**Architecture:** Two backend bulk endpoints loop the existing single-ticket `close_position` / `modify_position_sltp` internals inside the MT5 lock, so mock fallback and SL/TP orientation validation come free. Frontend adds a selection set + scope selector to the trade manager (BottomTradingDock), a bulk SL/TP editor (typed input or drag on chart lines), a confirm-before-close dialog, and paper-mode equivalents as zustand actions. Bulk controls render only when open positions exist.

**Tech Stack:** FastAPI + pydantic (backend), React + TypeScript + Zustand (frontend), pytest + httpx (new, backend tests only — frontend has no test runner; verified via mock-mode E2E steps).

**Spec:** https://github.com/daffatahtaa/Pro-Charts/issues/13 plus owner decisions: bulk set SL/TP appears conditionally (right-click menu when trades exist + trade manager), accepts direct input OR drag like normal TP/SL lines, and must also work in paper/Bar Replay mode.

## Global Constraints

- No new frontend runtime dependencies. Only new dev deps: `pytest`, `httpx` appended to `backend/requirements.txt`.
- All new routes follow the existing trade API shape: under `/api/mt5/trade/`, `response_model=TradeResultResponse`-style fields, executed via `asyncio.to_thread` in `backend/main.py`.
- Every MT5 call happens inside the existing `self._lock` in `mt5_service.py`; bulk functions reuse `close_position` / `modify_position_sltp` internals so the mock branch and validation are identical for live and mock.
- Conventional commits (`fix:`, `feat:`, `chore:`) matching repo history.

## Review Focus

1. **Partial failure** — one ticket fails (invalid SL/TP orientation, MT5 retcode) while others succeed: UI must show a per-ticket summary (n ok / m failed + messages), never a blanket "success".
2. **Empty selection / no positions** — bulk buttons hidden or disabled when `positions.length === 0` or selection is empty; backend rejects empty `tickets` with HTTP 400.
3. **SL/TP orientation per pair** — BUY requires SL < price < TP (SELL inverted): reuse the validation in `place_order`/`modify_position_sltp` per ticket; failing ticket reports its own error.
4. **WS race** — `trade_state_update` pushes every 1.0s during a bulk run: after completion call `refreshTradeState()`; pending state (Set of tickets) disables the buttons until done.
5. **Mock/live parity** — tests run in mock mode (MT5 disconnected); live and mock must share the same code path (only `mt5.` calls branch).

---

## File Structure

- `backend/models.py` — add `BulkCloseRequest`, `BulkModifyRequest`, `BulkResultResponse`.
- `backend/mt5_service.py` — add `bulk_close_positions()`, `bulk_modify_sltp()`.
- `backend/main.py` — add `POST /api/mt5/trade/bulk/close`, `POST /api/mt5/trade/bulk/modify`.
- `backend/requirements.txt` — add `pytest`, `httpx`.
- `backend/tests/test_bulk.py` — new.
- `frontend/src/services/api.ts` — add `bulkClosePosition()`, `bulkModifyTrade()`.
- `frontend/src/store/useChartStore.ts` — add `bulkPaperClose()`, `bulkPaperModify()`.
- `frontend/src/components/BottomTradingDock.tsx` — checkbox column, scope selector, bulk bar, confirm dialog, right-click menu entry.
- `frontend/src/components/BulkSlTpEditor.tsx` — new editor modal.
- `frontend/src/components/InteractiveTradeLayer.tsx` — bulk drag mode on SL/TP lines.

---

### Task 1: Backend bulk close endpoint

**Files:**
- Modify: `backend/models.py`, `backend/mt5_service.py`, `backend/main.py`, `backend/requirements.txt`
- Test: `backend/tests/test_bulk.py`

**Interfaces:**
- Produces: `POST /api/mt5/trade/bulk/close` body `{"tickets": [int, ...]}` → `BulkResultResponse`
  ```python
  class BulkCloseRequest(BaseModel):
      tickets: list[int]

  class BulkResultResponse(BaseModel):
      success: bool            # True only if ALL tickets succeeded
      results: list[TradeResultResponse]   # one entry per ticket, in request order
      message: str             # "n closed, m failed"
  ```
  `mt5_service.bulk_close_positions(tickets: list[int]) -> tuple[bool, list[dict], str]` (same shape, dicts matching `TradeResultResponse`).

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_bulk.py`

```python
from fastapi.testclient import TestClient
from main import app  # backend dir on sys.path

client = TestClient(app)

def test_bulk_close_mock_positions():
    # setup: two mock positions via POST /api/mt5/trade/order (order_mode=MARKET, EURUSD BUY, GBPUSD SELL)
    state = client.get("/api/mt5/trade/state").json()
    tickets = [p["ticket"] for p in state["positions"] if p["symbol"] in ("EURUSD", "GBPUSD")]
    res = client.post("/api/mt5/trade/bulk/close", json={"tickets": tickets}).json()
    assert res["success"] is True
    assert len(res["results"]) == 2 and all(r["success"] for r in res["results"])
    after = client.get("/api/mt5/trade/state").json()
    assert all(p["ticket"] not in tickets for p in after["positions"])

def test_bulk_close_unknown_ticket_partial_failure():
    res = client.post("/api/mt5/trade/bulk/close", json={"tickets": [999999]}).json()
    assert res["success"] is False and res["results"][0]["success"] is False

def test_bulk_close_empty_tickets_400():
    assert client.post("/api/mt5/trade/bulk/close", json={"tickets": []}).status_code == 400
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd backend && .\.venv\Scripts\python.exe -m pytest tests/test_bulk.py -v`
Expected: FAIL (route 404 / no bulk_close_positions).

- [ ] **Step 3: Add `pytest`, `httpx` to `backend/requirements.txt`, install**

Run: `.\.venv\Scripts\python.exe -m pip install pytest httpx`

- [ ] **Step 4: Implement `bulk_close_positions(tickets: list[int]) -> tuple[bool, list[dict], str]` in `backend/mt5_service.py`**

Approach: inside `with self._lock:` loop tickets, calling the same logic as `close_position` (refactor its body into a private `_close_one(ticket) -> dict` returning the TradeResultResponse-shaped dict, call it from both `close_position` and the loop). Unknown ticket → `{"success": False, "message": "position not found", ...}`. Aggregate `success = all(...)`.

- [ ] **Step 5: Add `POST /api/mt5/trade/bulk/close` in `backend/main.py`**

Pattern: copy the existing `/api/mt5/trade/close/{ticket}` route; body `BulkCloseRequest`; 400 on empty `tickets`; run service call via `asyncio.to_thread`; return `BulkResultResponse`.

- [ ] **Step 6: Run tests, verify they pass**

Run: same pytest command. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/models.py backend/mt5_service.py backend/main.py backend/requirements.txt backend/tests/test_bulk.py
git commit -m "feat: bulk close positions endpoint (per-ticket results, mock fallback)"
```

---

### Task 2: Backend bulk modify SL/TP endpoint

**Files:**
- Modify: `backend/models.py`, `backend/mt5_service.py`, `backend/main.py`
- Test: `backend/tests/test_bulk.py`

**Interfaces:**
- Consumes: `BulkResultResponse` (Task 1).
- Produces: `POST /api/mt5/trade/bulk/modify` body `{"tickets": [int, ...], "sl": float, "tp": float}` → `BulkResultResponse`; `mt5_service.bulk_modify_sltp(tickets: list[int], sl: float, tp: float) -> tuple[bool, list[dict], str]`.

- [ ] **Step 1: Write the failing tests**

```python
def test_bulk_modify_sltp_mock():
    # setup: one mock EURUSD BUY position (MARKET order)
    state = client.get("/api/mt5/trade/state").json()
    pos = next(p for p in state["positions"] if p["symbol"] == "EURUSD")
    sl, tp = pos["open_price"] - 0.01, pos["open_price"] + 0.01
    res = client.post("/api/mt5/trade/bulk/modify", json={"tickets": [pos["ticket"]], "sl": sl, "tp": tp}).json()
    assert res["success"] is True
    after = client.get("/api/mt5/trade/state").json()
    p = next(p for p in after["positions"] if p["ticket"] == pos["ticket"])
    assert abs(p["sl"] - sl) < 1e-6 and abs(p["tp"] - tp) < 1e-6

def test_bulk_modify_invalid_orientation_per_ticket_failure():
    # BUY position with sl ABOVE open price -> that ticket fails, res["success"] is False, message mentions the ticket
```

- [ ] **Step 2: Run tests, verify they fail**

Run: pytest command from Task 1. Expected: FAIL.

- [ ] **Step 3: Implement `bulk_modify_sltp(tickets, sl, tp)` in `backend/mt5_service.py`**

Approach: refactor `modify_position_sltp`'s core into `_modify_one(ticket, sl, tp) -> dict` (reusing its orientation validation and mock branch), call from both. Per-ticket failure keeps its message (e.g. invalid SL/TP for side).

- [ ] **Step 4: Add `POST /api/mt5/trade/bulk/modify` in `backend/main.py`**

Pattern: as Task 1 Step 5; body `BulkModifyRequest` (`tickets: list[int]`, `sl: float = 0.0`, `tp: float = 0.0`), 400 on empty tickets.

- [ ] **Step 5: Run tests, verify they pass**

Expected: PASS (all four tests in `test_bulk.py`).

- [ ] **Step 6: Commit**

```bash
git add backend/models.py backend/mt5_service.py backend/main.py backend/tests/test_bulk.py
git commit -m "feat: bulk modify SL/TP endpoint (per-ticket validation results)"
```

---

### Task 3: Frontend API client + selection & scope state

**Files:**
- Modify: `frontend/src/services/api.ts`, `frontend/src/components/BottomTradingDock.tsx`

**Interfaces:**
- Consumes: `BulkResultResponse` shape (Task 1/2).
- Produces:
  - `api.bulkClosePosition(tickets: number[]): Promise<BulkResultResponse>` — POST `/api/mt5/trade/bulk/close`.
  - `api.bulkModifyTrade(payload: {tickets: number[]; sl: number; tp: number}): Promise<BulkResultResponse>` — POST `/api/mt5/trade/bulk/modify`.
  - In `BottomTradingDock`: `selectedTickets: Set<number>` (local state), `scope: 'all' | 'pair' | 'selected'`, `pairFilter: string` (symbol from unique `positions[].symbol`), `bulkBusy: boolean`; computed `bulkTargetTickets(): number[]` — for scope `'all'` every position, `'pair'` positions of `pairFilter`, `'selected'` the Set. Pending-orders table untouched by this feature (positions only).

- [ ] **Step 1: Add the two API functions in `frontend/src/services/api.ts`**

Copy the shape of the existing `closePosition` / `modifyTrade` functions (same `ApiResponse` envelope pattern used there).

- [ ] **Step 2: Add checkbox column + scope selector + bulk bar in `BottomTradingDock.tsx` positions table**

- Checkbox per row (checked = in `selectedTickets`), header checkbox toggles all currently visible rows.
- Bar above the positions table, rendered **only when `positions.length > 0`**: scope segmented control (All / Pair / Selected) with a symbol `<select>` (unique symbols) shown when Pair, plus buttons "Bulk Set SL/TP" (disabled when scope=Selected and Set empty) and "Bulk Close" (same condition, plus disabled while `bulkBusy`).
- Row click symbol-switch behavior (existing) must stay intact.

- [ ] **Step 3: Manual verification (mock-mode E2E)**

Run: `start-dev.bat` → open http://localhost:5173 → wait for mock positions to appear in the dock (mock mode when MT5 offline).
Check: bar hidden with zero positions; with positions: scope toggling updates `bulkTargetTickets` count shown next to each button (e.g. "Bulk Close (3)"), checkbox toggles, header checkbox selects visible rows. Buttons not yet wired (tasks 4-6) — verify via React DevTools state or temporary console.log, then remove.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/services/api.ts frontend/src/components/BottomTradingDock.tsx
git commit -m "feat: bulk selection UI (checkboxes, scope selector, conditional bulk bar)"
```

---

### Task 4: Bulk SL/TP editor (typed input) + paper bulk actions

**Files:**
- Create: `frontend/src/components/BulkSlTpEditor.tsx`
- Modify: `frontend/src/components/BottomTradingDock.tsx`, `frontend/src/store/useChartStore.ts`

**Interfaces:**
- Consumes: `bulkTargetTickets()` (Task 3), `api.bulkModifyTrade` (Task 3).
- Produces:
  - `<BulkSlTpEditor tickets={number[]} symbol?: string onClose={() => void} />` — SL and TP numeric inputs (empty = keep current), Apply → live: `api.bulkModifyTrade` per ticket selection then `refreshTradeState()` + toast "n ok, m failed"; paper (`replay.isActive`): `bulkPaperModify(ids: string[], sl?: number, tp?: number)` then toast.
  - `useChartStore` actions: `bulkPaperModify(ids: string[], sl?: number, tp?: number)` — map over `paperAccount.trades` where `id in ids && status === 'OPEN'`, set sl/tp like `modifyPaperTrade` does; `bulkPaperClose(ids: string[])` — reuse `closePaperTrade` logic per id (Task 6 wires it).
- Right-click entry point: in the positions table, right-click a row → context menu item "Bulk Set SL/TP" **shown only when `positions.length > 0`**; opens the editor with scope pre-set to `'pair'` + that row's symbol. (Chart-canvas right-click menu stays unchanged.)

- [ ] **Step 1: Implement `bulkPaperModify` and `bulkPaperClose` in `frontend/src/store/useChartStore.ts`**

Mirror the existing `modifyPaperTrade` / `closePaperTrade` bodies (profit/balance updates included) in a loop over ids. Skip unknown ids silently.

- [ ] **Step 2: Implement `BulkSlTpEditor.tsx`**

Controlled inputs (number), `onChange` local state `{sl: string; tp: string}` parsed with `Number()`; empty string → omit field from payload. Apply button disabled while a request is in flight; per-mode branch as in Interfaces.

- [ ] **Step 3: Wire editor + right-click menu in `BottomTradingDock.tsx`**

"Bulk Set SL/TP" button opens editor with `tickets={bulkTargetTickets()}`; right-click menu as above; close editor on success with toast.

- [ ] **Step 4: Manual verification (mock-mode E2E)**

Check: right-click row → menu item present; open via bar too; type SL/TP → Apply → per-ticket toast + table updates after refresh. Then enable Bar Replay, open paper trades, bulk set on paper trades (no API calls in network tab). Empty SL+TP both → button disabled.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BulkSlTpEditor.tsx frontend/src/components/BottomTradingDock.tsx frontend/src/store/useChartStore.ts
git commit -m "feat: bulk SL/TP editor with typed input, right-click entry, paper support"
```

---

### Task 5: Drag-to-bulk SL/TP on chart lines

**Files:**
- Modify: `frontend/src/components/InteractiveTradeLayer.tsx`

**Interfaces:**
- Consumes: `api.bulkModifyTrade` (Task 3), `bulkPaperModify` (Task 4), selection set + scope state (Task 3 — lift `selectedTickets`/`scope`/`pairFilter` into `useChartStore` if the layer needs them; otherwise pass as props from `ChartContainer`). Decide at implementation: cheapest wiring that gives the layer `bulkTargetTickets()`.
- Produces: when bulk mode is active (a `bulkMode` flag: selection non-empty OR scope set by the dock), dragging a trade's SL or TP line calls bulk modify for `bulkTargetTickets()` with the dragged price, instead of the single `api.modifyTrade` in the existing `onMouseUp` handler; paper branch calls `bulkPaperModify` with the layer's trade ids.

- [ ] **Step 1: Extract the drag-end price-application logic**

Refactor the existing `onMouseUp` SL/TP branch (live: `api.modifyTrade` + `refreshTradeState`; paper: `modifyPaperTrade`) into one function `applyLinePrice(kind: 'sl' | 'tp', price: number)` — no behavior change yet.

- [ ] **Step 2: Add bulk branch**

If bulk mode active: live → `api.bulkModifyTrade({tickets: bulkTargetTickets(), [kind]: price})` then `refreshTradeState()`; paper → `bulkPaperModify(ids, {[kind]: price})`. Toast per-ticket summary (same as Task 4).

- [ ] **Step 3: Manual verification (mock-mode E2E)**

Check: select 2+ positions in the dock → drag one SL line on chart → both selected trades' SL move (live table updates); drag without selection keeps single-trade behavior. Paper mode same via Bar Replay.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/InteractiveTradeLayer.tsx
git commit -m "feat: drag chart SL/TP lines to bulk-set selected positions"
```

---

### Task 6: Bulk close wiring + confirm dialog

**Files:**
- Modify: `frontend/src/components/BottomTradingDock.tsx`

**Interfaces:**
- Consumes: `api.bulkClosePosition` (Task 3), `bulkPaperClose` (Task 4), `bulkTargetTickets()` (Task 3).

- [ ] **Step 1: Add confirm dialog**

"Bulk Close (N)" click → modal: "Close N position(s)? Scope: All / EURUSD / Selected" with scope name resolved; Confirm → live: `api.bulkClosePosition(tickets)` then toast summary + `refreshTradeState()`; paper: `bulkPaperClose(ids)` then toast. Cancel closes modal. `bulkBusy` disables both bulk buttons during the request.

- [ ] **Step 2: Manual verification (mock-mode E2E)**

Check: scope All → all mock positions close, table empties, bar disappears (kondisional rule); scope Pair → only that symbol's rows close; scope Selected → only checked rows; cancel closes nothing; paper mode closes paper trades with balance update. Partial-failure path: temporarily stop backend mid-request (or edit one ticket invalid in DevTools) → per-ticket toast, remaining positions stay.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/BottomTradingDock.tsx
git commit -m "feat: bulk close with scope selector and confirmation dialog"
```

---

## Self-Review

- **Spec coverage:** pair/position/all selection (Task 3 scope selector + Task 6); bulk set SL/TP typed (Task 4) and drag (Task 5); conditional visibility (Task 3 bar, Task 4 right-click); paper/replay (Tasks 4-6); bulk close (Tasks 1, 6). ✓
- **Review Focus:** 1 (per-ticket toasts, Tasks 1/4/6 tests+steps), 2 (400 + disabled buttons, Task 1 test, Task 3 step), 3 (Task 2 test reuses orientation validation), 4 (`refreshTradeState` + `bulkBusy`, Tasks 4-6), 5 (mock-mode tests throughout). ✓
- **Type consistency:** `bulkTargetTickets()` named identically in Tasks 3-6; `BulkResultResponse` fields match frontend usage (`success`, `results`, `message`). ✓
- **Proportion:** 6 tasks, each with one testable deliverable; frontend has no test runner so E2E mock-mode steps replace unit tests there (documented trade-off, no new frontend deps).
