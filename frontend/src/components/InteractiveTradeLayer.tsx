import React, { useEffect, useRef, useState } from 'react';
import { Chart } from 'klinecharts';
import { Plus, X, ArrowUpDown, AlertTriangle, Bell, RotateCcw } from 'lucide-react';
import { api } from '../services/api';
import { unlockAudio } from '../services/sound';
import { useChartStore } from '../store/useChartStore';
import { PriceAlertItem } from '../types/chart';
import { formatTradePrice, formatUnsignedMoney } from '../utils/formatPrice';

export interface ActivePositionEditor {
  key: string;
  mode: 'live' | 'paper';
  isPending: boolean;
  orderType: string;
  id: string | number;
  symbol: string;
  side: 'BUY' | 'SELL';
  volume: number;
  entryPrice: number;
  currentPrice: number;
  profit: number;
}

interface NormalizedTrade {
  key: string;
  mode: 'live' | 'paper';
  isPending: boolean;
  orderType: string;
  id: string | number;
  symbol: string;
  side: 'BUY' | 'SELL';
  volume: number;
  entryPrice: number;
  currentPrice: number;
  sl: number;
  tp: number;
  profit: number;
}

interface DragState {
  trade: NormalizedTrade;
  kind: 'entry' | 'sl' | 'tp';
  origEntry: number;
  origSl: number;
  origTp: number;
  curEntry: number;
  curSl: number;
  curTp: number;
  warning: string | null;
  startClientY: number;
  moved: boolean;
}

interface InteractiveTradeLayerProps {
  chartRef: React.RefObject<Chart | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  coordTick: number;
  yAxisWidth: number;
  selectedTradeKey: string | null;
  setSelectedTradeKey: (key: string | null) => void;
  onSelectTrade: (editor: ActivePositionEditor, entry: number, sl: number, tp: number) => void;
  entryDraft: string;
  slDraft: string;
  tpDraft: string;
  setEntryDraft: (val: string) => void;
  setSlDraft: (val: string) => void;
  setTpDraft: (val: string) => void;
  hoverCursor: { y: number; price: number } | null;
  dragActiveRef: React.MutableRefObject<boolean>;
  cancelDragRef: React.MutableRefObject<(() => void) | null>;
}

export const InteractiveTradeLayer: React.FC<InteractiveTradeLayerProps> = ({
  chartRef,
  containerRef,
  coordTick,
  yAxisWidth,
  selectedTradeKey,
  setSelectedTradeKey,
  onSelectTrade,
  entryDraft,
  slDraft,
  tpDraft,
  setEntryDraft,
  setSlDraft,
  setTpDraft,
  hoverCursor,
  dragActiveRef,
  cancelDragRef,
}) => {
  void coordTick;

  const {
    symbol,
    symbolInfo,
    liveTick,
    chartSettings,
    replay,
    positions,
    orders,
    alerts,
    paperAccount,
    addAlert,
    updateAlertPrice,
    rearmAlert,
    removeAlert,
    showToast,
    refreshTradeState,
    modifyPaperTrade,
    bulkPaperModify,
    closePaperTrade,
    cancelPaperTrade,
    bulkScope,
    bulkPairFilter,
    selectedTickets,
  } = useChartStore();

  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  dragStateRef.current = dragState;

  // Bulk drag targets: active only when the dock has an explicit bulk scope
  // (pair or selected), ALWAYS restricted to the active chart symbol so dragging
  // SL/TP on one pair can never overwrite another symbol's positions!
  const bulkTargets = React.useMemo(() => {
    if (bulkScope === 'pair') {
      const targetPair = bulkPairFilter || symbol;
      if (targetPair !== symbol) return [];
      return positions.filter((p) => p.symbol === symbol).map((p) => p.ticket);
    }
    if (bulkScope === 'selected') {
      return selectedTickets.filter((t) =>
        positions.some((p) => p.ticket === t && p.symbol === symbol)
      );
    }
    return [];
  }, [bulkScope, bulkPairFilter, selectedTickets, positions, symbol]);
  const bulkTargetsRef = useRef<number[]>([]);
  bulkTargetsRef.current = bulkTargets;
  const wasSelectedBeforeDownRef = useRef<boolean>(false);
  const lastDragMovedRef = useRef<boolean>(false);
  const dragCooldownRef = useRef<boolean>(false);
  const [hoveringTradePill, setHoveringTradePill] = useState<boolean>(false);

  // Draggable Price Alert state
  const [alertDrag, setAlertDrag] = useState<{
    alert: PriceAlertItem;
    curPrice: number;
    moved: boolean;
  } | null>(null);
  const alertDragRef = useRef(alertDrag);
  alertDragRef.current = alertDrag;

  dragActiveRef.current = dragState !== null || alertDrag !== null || dragCooldownRef.current;

  const digits = symbolInfo.digits ?? 2;
  const point = symbolInfo.point || 0.01;
  const pipSize = point * 10;
  const minStep = point * 2;
  const paneHeight = containerRef.current?.clientHeight ?? 600;

  const priceToY = (price: number): number | null => {
    const chart = chartRef.current;
    if (!chart || !Number.isFinite(price) || price <= 0) return null;
    try {
      const res: any = chart.convertToPixel({ value: price }, { paneId: 'candle_pane' });
      const pt = Array.isArray(res) ? res[0] : res;
      if (pt && typeof pt.y === 'number' && Number.isFinite(pt.y)) {
        return pt.y;
      }
    } catch {}
    return null;
  };

  const yToPrice = (yPx: number): number | null => {
    const chart = chartRef.current;
    if (!chart) return null;
    try {
      const res: any = chart.convertFromPixel([{ x: 100, y: yPx }], { paneId: 'candle_pane' });
      const pt = Array.isArray(res) ? res[0] : res;
      if (pt && typeof pt.value === 'number' && Number.isFinite(pt.value)) {
        return pt.value;
      }
    } catch {}
    return null;
  };

  // Clamp dragged price according to MT5 Limit/Stop & SL/TP rules
  const clampDraggedPrice = (
    tr: NormalizedTrade,
    kind: 'entry' | 'sl' | 'tp',
    rawPrice: number,
    curEntry: number
  ): { price: number; warning: string | null } => {
    const curBid = liveTick?.bid ?? tr.currentPrice ?? tr.entryPrice;
    const curAsk = liveTick?.ask ?? tr.currentPrice ?? tr.entryPrice;

    if (kind === 'entry' && tr.isPending) {
      const ot = tr.orderType.toUpperCase();
      if (ot === 'BUY_LIMIT') {
        if (rawPrice >= curAsk - minStep) {
          return {
            price: Number((curAsk - minStep).toFixed(digits)),
            warning: `BUY LIMIT cannot be >= current Ask (${curAsk.toFixed(digits)})`,
          };
        }
      } else if (ot === 'BUY_STOP') {
        if (rawPrice <= curAsk + minStep) {
          return {
            price: Number((curAsk + minStep).toFixed(digits)),
            warning: `BUY STOP cannot be <= current Ask (${curAsk.toFixed(digits)})`,
          };
        }
      } else if (ot === 'SELL_LIMIT') {
        if (rawPrice <= curBid + minStep) {
          return {
            price: Number((curBid + minStep).toFixed(digits)),
            warning: `SELL LIMIT cannot be <= current Bid (${curBid.toFixed(digits)})`,
          };
        }
      } else if (ot === 'SELL_STOP') {
        if (rawPrice >= curBid - minStep) {
          return {
            price: Number((curBid - minStep).toFixed(digits)),
            warning: `SELL STOP cannot be >= current Bid (${curBid.toFixed(digits)})`,
          };
        }
      }
      return { price: Number(rawPrice.toFixed(digits)), warning: null };
    }

    if (kind === 'sl') {
      if (tr.side === 'BUY') {
        const ref = tr.isPending ? curEntry : curBid;
        if (rawPrice >= ref - minStep) {
          return {
            price: Number((ref - minStep).toFixed(digits)),
            warning: `BUY SL must be below ${tr.isPending ? 'Entry' : 'Bid'} (${ref.toFixed(digits)})`,
          };
        }
      } else {
        const ref = tr.isPending ? curEntry : curAsk;
        if (rawPrice <= ref + minStep) {
          return {
            price: Number((ref + minStep).toFixed(digits)),
            warning: `SELL SL must be above ${tr.isPending ? 'Entry' : 'Ask'} (${ref.toFixed(digits)})`,
          };
        }
      }
      return { price: Number(rawPrice.toFixed(digits)), warning: null };
    }

    // kind === 'tp'
    if (tr.side === 'BUY') {
      const ref = tr.isPending ? curEntry : curBid;
      if (rawPrice <= ref + minStep) {
        return {
          price: Number((ref + minStep).toFixed(digits)),
          warning: `BUY TP must be above ${tr.isPending ? 'Entry' : 'Bid'} (${ref.toFixed(digits)})`,
        };
      }
    } else {
      const ref = tr.isPending ? curEntry : curAsk;
      if (rawPrice >= ref - minStep) {
        return {
          price: Number((ref - minStep).toFixed(digits)),
          warning: `SELL TP must be below ${tr.isPending ? 'Entry' : 'Ask'} (${ref.toFixed(digits)})`,
        };
      }
    }
    return { price: Number(rawPrice.toFixed(digits)), warning: null };
  };

  // Register Esc / Right-Click drag cancel callback
  useEffect(() => {
    cancelDragRef.current = () => {
      if (alertDragRef.current) {
        setAlertDrag(null);
        showToast('info', 'Alert drag cancelled.');
        return;
      }
      const st = dragStateRef.current;
      if (!st) return;
      setEntryDraft(st.origEntry.toFixed(digits));
      setSlDraft(st.origSl > 0 ? st.origSl.toFixed(digits) : '');
      setTpDraft(st.origTp > 0 ? st.origTp.toFixed(digits) : '');
      setDragState(null);
      showToast('info', 'Drag cancelled.');
    };
    return () => {
      cancelDragRef.current = null;
    };
  }, [cancelDragRef, digits, setEntryDraft, setSlDraft, setTpDraft, showToast]);

  // Global mousemove / mouseup for active alert drag
  useEffect(() => {
    if (!alertDrag) return;
    const onMove = (e: MouseEvent) => {
      const cur = alertDragRef.current;
      const el = containerRef.current;
      if (!cur || !el) return;
      const rect = el.getBoundingClientRect();
      const yPx = Math.max(12, Math.min(rect.height - 28, e.clientY - rect.top));
      const raw = yToPrice(yPx);
      if (raw === null) return;
      setAlertDrag({ ...cur, curPrice: Number(raw.toFixed(digits)), moved: true });
    };
    const onUp = () => {
      const cur = alertDragRef.current;
      setAlertDrag(null);
      if (!cur || !cur.moved) return;
      const curBid = liveTick?.bid ?? cur.curPrice;
      const nextCond =
        cur.alert.condition === 'CROSSING'
          ? 'CROSSING'
          : cur.curPrice >= curBid
          ? 'CROSSING_UP'
          : 'CROSSING_DOWN';
      updateAlertPrice(cur.alert.id, cur.curPrice, nextCond);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [alertDrag !== null]);

  // Global mousemove / mouseup for active drag
  useEffect(() => {
    if (!dragState) return;

    const onMouseMove = (e: MouseEvent) => {
      const cur = dragStateRef.current;
      const el = containerRef.current;
      if (!cur || !el) return;
      if (!cur.moved && Math.abs(e.clientY - cur.startClientY) < 4) {
        return;
      }
      lastDragMovedRef.current = true;
      const rect = el.getBoundingClientRect();
      const yPx = Math.max(12, Math.min(rect.height - 28, e.clientY - rect.top));
      const raw = yToPrice(yPx);
      if (raw === null) return;

      const { price, warning } = clampDraggedPrice(cur.trade, cur.kind, raw, cur.curEntry);
      const next: DragState = {
        ...cur,
        moved: true,
        warning,
        curEntry: cur.kind === 'entry' ? price : cur.curEntry,
        curSl: cur.kind === 'sl' ? price : cur.curSl,
        curTp: cur.kind === 'tp' ? price : cur.curTp,
      };
      setDragState(next);
      if (cur.kind === 'entry') setEntryDraft(price.toFixed(digits));
      if (cur.kind === 'sl') setSlDraft(price.toFixed(digits));
      if (cur.kind === 'tp') setTpDraft(price.toFixed(digits));
    };

    const onMouseUp = async () => {
      const cur = dragStateRef.current;
      dragCooldownRef.current = true;
      dragActiveRef.current = true;
      setDragState(null);
      window.setTimeout(() => {
        dragCooldownRef.current = false;
        dragActiveRef.current = dragStateRef.current !== null || alertDragRef.current !== null;
      }, 120);
      if (!cur || !cur.moved) return;

      const tr = cur.trade;
      const newEntry = cur.curEntry;
      const newSl = cur.curSl;
      const newTp = cur.curTp;

      // Bulk branch: SL/TP line drag applies to all bulk targets when active
      if (!tr.isPending && (cur.kind === 'sl' || cur.kind === 'tp')) {
        if (tr.mode === 'paper') {
          const paperIds = paperAccount.trades
            .filter((t) => t.symbol === symbol && t.status === 'OPEN')
            .map((t) => t.id);
          if (paperIds.length > 1) {
            bulkPaperModify(paperIds, {
              sl: cur.kind === 'sl' ? newSl : undefined,
              tp: cur.kind === 'tp' ? newTp : undefined,
            });
            showToast('success', `Bulk updated ${paperIds.length} paper trades`);
            return;
          }
        } else {
          const targets = bulkTargetsRef.current;
          // Guard: only bulk-apply when the dragged trade itself is in the same-symbol target set
          if (targets.length > 0 && targets.includes(Number(tr.id))) {
            try {
              const payload: { tickets: number[]; sl?: number; tp?: number; symbol: string } = {
                tickets: targets,
                symbol: tr.symbol,
              };
              if (cur.kind === 'sl') payload.sl = Number(newSl.toFixed(digits));
              if (cur.kind === 'tp') payload.tp = Number(newTp.toFixed(digits));
              const res = await api.bulkModifyTrade(payload);
              if (res.success) {
                showToast('success', `Bulk updated ${targets.length} ${tr.symbol} position(s)`);
                await refreshTradeState();
              } else {
                const fails = res.results.filter((r) => !r.success);
                const detail = fails.length
                  ? ` — ${fails.slice(0, 2).map((f) => `#${f.order_ticket}: ${f.message}`).join(' | ')}`
                  : '';
                showToast('error', `${res.message}${detail}`);
                await refreshTradeState();
              }
            } catch (err: any) {
              showToast('error', err?.message || 'Bulk modify failed');
            }
            return;
          }
        }
      }

      if (tr.mode === 'paper') {
        modifyPaperTrade(String(tr.id), {
          entry_price: tr.isPending ? newEntry : undefined,
          sl: newSl,
          tp: newTp,
        });
        showToast(
          'success',
          `Updated Paper ${tr.side} (${tr.isPending ? `Entry ${formatTradePrice(newEntry, digits)} | ` : ''}SL ${formatTradePrice(newSl, digits)} | TP ${formatTradePrice(newTp, digits)})`
        );
        return;
      }

      try {
        const res = await api.modifyTrade({
          ticket: Number(tr.id),
          symbol: tr.symbol,
          price: tr.isPending ? newEntry : undefined,
          sl: newSl,
          tp: newTp,
          is_pending: tr.isPending,
        });
        if (res.success) {
          showToast(
            'success',
            `Updated #${tr.id}: ${tr.isPending ? `Entry ${formatTradePrice(newEntry, digits)} | ` : ''}SL ${formatTradePrice(newSl, digits)} | TP ${formatTradePrice(newTp, digits)}`
          );
          await refreshTradeState();
        } else {
          // Revert drafts on rejection
          setEntryDraft(cur.origEntry.toFixed(digits));
          setSlDraft(cur.origSl > 0 ? cur.origSl.toFixed(digits) : '');
          setTpDraft(cur.origTp > 0 ? cur.origTp.toFixed(digits) : '');
          showToast('error', res.message || 'Failed to modify order');
        }
      } catch (err: any) {
        setEntryDraft(cur.origEntry.toFixed(digits));
        setSlDraft(cur.origSl > 0 ? cur.origSl.toFixed(digits) : '');
        setTpDraft(cur.origTp > 0 ? cur.origTp.toFixed(digits) : '');
        showToast('error', err?.message || 'Modify trade failed');
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragState !== null]);

  // Build normalized trade list for active symbol
  const visibleTrades: NormalizedTrade[] = [];
  if (chartSettings.showPositionLines) {
    if (replay.isActive) {
      const curBar = replay.allCandles[replay.cutIndex];
      for (const t of paperAccount.trades) {
        if (t.symbol !== symbol || (t.status !== 'OPEN' && t.status !== 'PENDING')) continue;
        visibleTrades.push({
          key: `paper_${t.id}`,
          mode: 'paper',
          isPending: t.status === 'PENDING',
          orderType: t.status === 'PENDING' ? `${t.side}_${t.order_type}` : t.side,
          id: t.id,
          symbol: t.symbol,
          side: t.side,
          volume: t.volume,
          entryPrice: t.entry_price,
          currentPrice: curBar?.close ?? t.entry_price,
          sl: t.sl,
          tp: t.tp,
          profit: t.pnl_money,
        });
      }
    } else {
      for (const p of positions) {
        if (p.symbol !== symbol) continue;
        visibleTrades.push({
          key: `pos_${p.ticket}`,
          mode: 'live',
          isPending: false,
          orderType: p.side,
          id: p.ticket,
          symbol: p.symbol,
          side: p.side,
          volume: p.volume,
          entryPrice: p.open_price,
          currentPrice: p.current_price,
          sl: p.sl,
          tp: p.tp,
          profit: p.profit,
        });
      }
      for (const o of orders) {
        if (o.symbol !== symbol) continue;
        visibleTrades.push({
          key: `ord_${o.ticket}`,
          mode: 'live',
          isPending: true,
          orderType: o.order_type,
          id: o.ticket,
          symbol: o.symbol,
          side: o.order_type.startsWith('BUY') ? 'BUY' : 'SELL',
          volume: o.volume,
          entryPrice: o.price_open,
          currentPrice: o.current_price,
          sl: o.sl,
          tp: o.tp,
          profit: 0,
        });
      }
    }
  }

  const startDrag = (
    e: React.MouseEvent,
    tr: NormalizedTrade,
    kind: 'entry' | 'sl' | 'tp'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const isSelected = selectedTradeKey === tr.key;
    wasSelectedBeforeDownRef.current = isSelected;
    lastDragMovedRef.current = false;
    const curEntry =
      isSelected && parseFloat(entryDraft) > 0 ? parseFloat(entryDraft) : tr.entryPrice;
    const curSl = isSelected ? parseFloat(slDraft) || 0 : tr.sl;
    const curTp = isSelected ? parseFloat(tpDraft) || 0 : tr.tp;

    if (!isSelected) {
      setSelectedTradeKey(tr.key);
      onSelectTrade(
        {
          key: tr.key,
          mode: tr.mode,
          isPending: tr.isPending,
          orderType: tr.orderType,
          id: tr.id,
          symbol: tr.symbol,
          side: tr.side,
          volume: tr.volume,
          entryPrice: tr.entryPrice,
          currentPrice: tr.currentPrice,
          profit: tr.profit,
        },
        tr.entryPrice,
        tr.sl,
        tr.tp
      );
    }

    setDragState({
      trade: tr,
      kind,
      origEntry: curEntry,
      origSl: curSl,
      origTp: curTp,
      curEntry,
      curSl,
      curTp,
      warning: null,
      startClientY: e.clientY,
      moved: false,
    });
    dragActiveRef.current = true;
  };

  const handleQuickCloseOrCancel = async (e: React.MouseEvent, tr: NormalizedTrade) => {
    e.stopPropagation();
    if (tr.mode === 'paper') {
      if (tr.isPending) cancelPaperTrade(String(tr.id));
      else closePaperTrade(String(tr.id));
      if (selectedTradeKey === tr.key) setSelectedTradeKey(null);
      return;
    }
    try {
      const res = tr.isPending
        ? await api.cancelOrder(Number(tr.id))
        : await api.closePosition(Number(tr.id));
      if (res.success) {
        showToast(
          'success',
          tr.isPending ? `Cancelled pending order #${tr.id}` : `Closed position #${tr.id}`
        );
        if (selectedTradeKey === tr.key) setSelectedTradeKey(null);
        await refreshTradeState();
      } else {
        showToast('error', res.message || 'Action failed');
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Action error');
    }
  };

  const handleQuickAddAlert = (e: React.MouseEvent) => {
    e.stopPropagation();
    unlockAudio();
    if (!hoverCursor) return;
    const curBid = liveTick?.bid ?? hoverCursor.price;
    const price = Number(hoverCursor.price.toFixed(digits));
    const condition = price >= curBid ? 'CROSSING_UP' : 'CROSSING_DOWN';
    addAlert({
      id: `alert_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      symbol,
      price,
      condition,
      note: '',
      active: true,
      triggered: false,
      created_at: Date.now(),
    });
    showToast('info', `🔔 Alert added on ${symbol} @ ${price.toFixed(digits)}`);
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-[12] overflow-hidden">
      {/* Drag Clamping Warning Banner */}
      {dragState?.warning && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#f59e0b] text-[#131722] text-[11.5px] font-semibold shadow-tv">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{dragState.warning}</span>
        </div>
      )}

      {/* Interactive Position & Pending Order Lines + Clicked SL/TP Zones */}
      {visibleTrades.map((tr) => {
        const isSelected = selectedTradeKey === tr.key;
        const isDraggingThis = dragState?.trade.key === tr.key;

        const effEntry = isDraggingThis
          ? dragState.curEntry
          : isSelected && parseFloat(entryDraft) > 0
          ? parseFloat(entryDraft)
          : tr.entryPrice;
        const effSl = isDraggingThis
          ? dragState.curSl
          : isSelected
          ? parseFloat(slDraft) || 0
          : tr.sl;
        const effTp = isDraggingThis
          ? dragState.curTp
          : isSelected
          ? parseFloat(tpDraft) || 0
          : tr.tp;

        const entryY = priceToY(effEntry);
        const slY = effSl > 0 ? priceToY(effSl) : null;
        const tpY = effTp > 0 ? priceToY(effTp) : null;

        if (entryY === null || entryY < 8 || entryY > paneHeight - 26) return null;

        const entryColor = tr.isPending
          ? '#2962ff'
          : tr.profit >= 0
          ? '#089981'
          : '#f23645';

        const slDist = effSl > 0 ? Math.abs(effEntry - effSl) : 0;
        const tpDist = effTp > 0 ? Math.abs(effTp - effEntry) : 0;
        const slPips = slDist > 0 ? (slDist / pipSize).toFixed(1) : '0.0';
        const tpPips = tpDist > 0 ? (tpDist / pipSize).toFixed(1) : '0.0';
        const rr = slDist > 0 && tpDist > 0 ? (tpDist / slDist).toFixed(2) : null;

        // Rough dollar estimate per pip based on volume (fallback visual guide)
        const estPerPip = tr.volume * 10;
        const estLoss = formatUnsignedMoney(parseFloat(slPips) * estPerPip, 2);
        const estProfit = formatUnsignedMoney(parseFloat(tpPips) * estPerPip, 2);

        return (
          <React.Fragment key={tr.key}>
            {/* Visual TP Profit Zone (ONLY when selected!) */}
            {isSelected && tpY !== null && (
              <div
                className="absolute left-0 pointer-events-none bg-[#089981]/15 border-y border-[#089981]/70"
                style={{
                  right: `${yAxisWidth}px`,
                  top: `${Math.min(entryY, tpY)}px`,
                  height: `${Math.max(2, Math.abs(tpY - entryY))}px`,
                }}
              />
            )}

            {/* Visual SL Loss Zone (ONLY when selected!) */}
            {isSelected && slY !== null && (
              <div
                className="absolute left-0 pointer-events-none bg-[#f23645]/15 border-y border-[#f23645]/70"
                style={{
                  right: `${yAxisWidth}px`,
                  top: `${Math.min(entryY, slY)}px`,
                  height: `${Math.max(2, Math.abs(slY - entryY))}px`,
                }}
              />
            )}

            {/* Draggable TP Line & Info Handle (ONLY when selected & TP set) */}
            {isSelected && tpY !== null && tpY >= 8 && tpY <= paneHeight - 26 && (
              <div
                onMouseDown={(e) => startDrag(e, tr, 'tp')}
                onClick={(e) => e.stopPropagation()}
                onMouseEnter={() => setHoveringTradePill(true)}
                onMouseLeave={() => setHoveringTradePill(false)}
                className="absolute left-0 -translate-y-1/2 h-[14px] flex items-center pointer-events-auto cursor-ns-resize group z-[16]"
                style={{ top: `${tpY}px`, right: `${yAxisWidth}px` }}
                title="Drag vertically to move Take Profit"
              >
                <div className="w-full border-t border-dashed border-[#089981] group-hover:border-solid" />
                <div className="absolute right-7 flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-[#089981] text-white font-mono-num text-[10.5px] font-bold shadow-tv whitespace-nowrap select-none">
                  <ArrowUpDown className="w-3 h-3 opacity-85 shrink-0" />
                  <span>
                    TP: {formatTradePrice(effTp, digits)} (+{tpPips}p | ~+${estProfit}
                    {rr ? ` | R:R 1:${rr}` : ''})
                  </span>
                </div>
              </div>
            )}

            {/* Draggable SL Line & Info Handle (ONLY when selected & SL set) */}
            {isSelected && slY !== null && slY >= 8 && slY <= paneHeight - 26 && (
              <div
                onMouseDown={(e) => startDrag(e, tr, 'sl')}
                onClick={(e) => e.stopPropagation()}
                onMouseEnter={() => setHoveringTradePill(true)}
                onMouseLeave={() => setHoveringTradePill(false)}
                className="absolute left-0 -translate-y-1/2 h-[14px] flex items-center pointer-events-auto cursor-ns-resize group z-[16]"
                style={{ top: `${slY}px`, right: `${yAxisWidth}px` }}
                title="Drag vertically to move Stop Loss"
              >
                <div className="w-full border-t border-dashed border-[#f23645] group-hover:border-solid" />
                <div className="absolute right-7 flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-[#f23645] text-white font-mono-num text-[10.5px] font-bold shadow-tv whitespace-nowrap select-none">
                  <ArrowUpDown className="w-3 h-3 opacity-85 shrink-0" />
                  <span>
                    SL: {formatTradePrice(effSl, digits)} (-{slPips}p | ~-${estLoss})
                  </span>
                </div>
              </div>
            )}

            {/* Entry Horizontal Line + Clickable/Draggable Entry Pill */}
            <div
              className="absolute left-0 -translate-y-1/2 flex items-center pointer-events-none z-[15]"
              style={{ top: `${entryY}px`, right: `${yAxisWidth}px` }}
            >
              <div
                className="w-full"
                style={{
                  borderTop: `${tr.isPending ? '1px dashed' : '1px solid'} ${entryColor}`,
                }}
              />
              <div
                onMouseEnter={() => setHoveringTradePill(true)}
                onMouseLeave={() => setHoveringTradePill(false)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (dragStateRef.current?.moved || lastDragMovedRef.current) {
                    lastDragMovedRef.current = false;
                    return;
                  }
                  if (tr.isPending) {
                    if (wasSelectedBeforeDownRef.current && isSelected) {
                      setSelectedTradeKey(null);
                    }
                    return;
                  }
                  if (isSelected) {
                    setSelectedTradeKey(null);
                  } else {
                    setSelectedTradeKey(tr.key);
                    onSelectTrade(
                      {
                        key: tr.key,
                        mode: tr.mode,
                        isPending: tr.isPending,
                        orderType: tr.orderType,
                        id: tr.id,
                        symbol: tr.symbol,
                        side: tr.side,
                        volume: tr.volume,
                        entryPrice: tr.entryPrice,
                        currentPrice: tr.currentPrice,
                        profit: tr.profit,
                      },
                      tr.entryPrice,
                      tr.sl,
                      tr.tp
                    );
                  }
                }}
                onMouseDown={(e) => {
                  if (tr.isPending) {
                    startDrag(e, tr, 'entry');
                  } else {
                    e.stopPropagation();
                  }
                }}
                className={`absolute right-7 pointer-events-auto flex items-center gap-1 rounded shadow-tv select-none ${
                  isSelected ? 'ring-2 ring-white/80' : ''
                }`}
              >
                {/* Quick + Drag SL & + Drag TP handles when selected and SL/TP not yet placed */}
                {isSelected && effSl <= 0 && (
                  <button
                    type="button"
                    onMouseDown={(e) => startDrag(e, tr, 'sl')}
                    onClick={(e) => e.stopPropagation()}
                    title="Press and drag vertically to set Stop Loss"
                    className="px-1.5 py-[3px] rounded bg-[#f23645] hover:bg-[#d92638] text-white font-mono-num text-[10px] font-bold cursor-ns-resize whitespace-nowrap"
                  >
                    + Drag SL
                  </button>
                )}
                {isSelected && effTp <= 0 && (
                  <button
                    type="button"
                    onMouseDown={(e) => startDrag(e, tr, 'tp')}
                    onClick={(e) => e.stopPropagation()}
                    title="Press and drag vertically to set Take Profit"
                    className="px-1.5 py-[3px] rounded bg-[#089981] hover:bg-[#067a66] text-white font-mono-num text-[10px] font-bold cursor-ns-resize whitespace-nowrap"
                  >
                    + Drag TP
                  </button>
                )}

                {/* Main Entry Pill */}
                <div
                  className={`flex items-center gap-1.5 px-2 py-[3px] rounded text-white font-mono-num text-[10.5px] font-bold whitespace-nowrap ${
                    tr.isPending ? 'cursor-ns-resize' : 'cursor-pointer'
                  }`}
                  style={{ backgroundColor: entryColor }}
                  title={
                    tr.isPending
                      ? 'Click to inspect SL/TP zone or drag vertically to move pending order price'
                      : 'Click to show/drag SL & TP zone'
                  }
                >
                  {tr.isPending && <ArrowUpDown className="w-3 h-3 opacity-85" />}
                  {tr.mode === 'paper' && (
                    <span className="px-1 rounded bg-black/25 text-[9px]">PAPER</span>
                  )}
                  {tr.isPending ? (
                    <span>
                      {tr.orderType.replace('_', ' ')} {tr.volume.toFixed(2)} @{' '}
                      {formatTradePrice(effEntry, digits)}
                    </span>
                  ) : (
                    <span>
                      {tr.side} {tr.volume.toFixed(2)} | {tr.profit >= 0 ? '+' : '-'}$
                      {formatUnsignedMoney(tr.profit, 2)}
                    </span>
                  )}

                  {/* Compact SL / TP indicators in default state */}
                  {!isSelected && effSl > 0 && (
                    <span className="px-1 rounded bg-[#f23645] text-[9px] font-semibold">SL</span>
                  )}
                  {!isSelected && effTp > 0 && (
                    <span className="px-1 rounded bg-[#089981] text-[9px] font-semibold">TP</span>
                  )}

                  {/* Quick Close / Cancel X */}
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => handleQuickCloseOrCancel(e, tr)}
                    title={tr.isPending ? 'Cancel Pending Order' : 'Close Position'}
                    className="ml-0.5 p-0.5 rounded hover:bg-black/30 transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </React.Fragment>
        );
      })}

      {/* Draggable Price Alert Lines (Active + Triggered so alerts never vanish silently) */}
      {!replay.isActive &&
        alerts
          .filter((a) => a.symbol === symbol && (a.active || a.triggered))
          .map((alert) => {
            const isDraggingAlert = alertDrag?.alert.id === alert.id;
            const effPrice = isDraggingAlert ? alertDrag.curPrice : alert.price;
            const alertY = priceToY(effPrice);
            if (alertY === null || alertY < 8 || alertY > paneHeight - 26) return null;

            const isTriggered = alert.triggered && !alert.active;

            return (
              <div
                key={alert.id}
                onMouseDown={(e) => {
                  if ((e.target as HTMLElement).closest('button')) return;
                  e.stopPropagation();
                  e.preventDefault();
                  setAlertDrag({ alert, curPrice: alert.price, moved: false });
                }}
                onClick={(e) => e.stopPropagation()}
                className="absolute left-0 -translate-y-1/2 h-[16px] flex items-center pointer-events-auto cursor-ns-resize group z-[14]"
                style={{ top: `${alertY}px`, right: `${yAxisWidth}px` }}
                title="Drag vertically to move Price Alert"
              >
                <div
                  className={`w-full border-t border-dashed group-hover:border-solid ${
                    isTriggered ? 'border-[#787b86]' : 'border-[#f59e0b]'
                  }`}
                />
                <div
                  className={`absolute left-3 flex items-center gap-1.5 px-2 py-[2px] rounded font-mono-num text-[10.5px] font-bold shadow-sm select-none whitespace-nowrap ${
                    isTriggered
                      ? 'bg-[#2a2e39] border border-[#f59e0b]/60 text-[#d1d4dc]'
                      : 'bg-[#f59e0b] text-[#131722]'
                  }`}
                >
                  <Bell className={`w-3 h-3 shrink-0 ${isTriggered ? 'text-[#f59e0b]' : ''}`} />
                  <span>
                    {isTriggered ? 'TRIGGERED · ' : ''}
                    {formatTradePrice(effPrice, digits)}
                    {alert.note ? ` · ${alert.note}` : ''}
                  </span>
                  {isTriggered && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        rearmAlert(alert.id);
                      }}
                      title="Re-arm Alert"
                      className="px-1 py-0.5 rounded bg-[#f59e0b]/20 hover:bg-[#f59e0b]/35 text-[#f59e0b] flex items-center gap-0.5 text-[9.5px] cursor-pointer"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Re-arm</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAlert(alert.id);
                      showToast('info', `Alert @ ${alert.price.toFixed(digits)} deleted.`);
                    }}
                    title="Delete Alert"
                    className="ml-0.5 p-0.5 rounded hover:bg-black/20 transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}

      {/* TradingView-style '+' Quick Add Alert Button next to Y-Axis (hidden near trade/alert pills) */}
      {(() => {
        if (
          !hoverCursor ||
          replay.isActive ||
          dragState ||
          alertDrag ||
          hoveringTradePill ||
          hoverCursor.y < 16 ||
          hoverCursor.y > paneHeight - 32
        ) {
          return null;
        }
        const isNearTradeOrAlertLine =
          visibleTrades.some((tr) => {
            const ey = priceToY(tr.entryPrice);
            const sy = tr.sl > 0 ? priceToY(tr.sl) : null;
            const ty = tr.tp > 0 ? priceToY(tr.tp) : null;
            return (
              (ey !== null && Math.abs(hoverCursor.y - ey) < 14) ||
              (sy !== null && Math.abs(hoverCursor.y - sy) < 14) ||
              (ty !== null && Math.abs(hoverCursor.y - ty) < 14)
            );
          }) ||
          alerts
            .filter((a) => a.symbol === symbol && (a.active || a.triggered))
            .some((a) => {
              const ay = priceToY(a.price);
              return ay !== null && Math.abs(hoverCursor.y - ay) < 14;
            });
        if (isNearTradeOrAlertLine) return null;

        return (
          <div
            className="absolute -translate-y-1/2 z-[18] pointer-events-auto group flex items-center"
            style={{ top: `${hoverCursor.y}px`, right: `${yAxisWidth + 2}px` }}
          >
            <span className="hidden group-hover:inline-block mr-1 px-1.5 py-0.5 rounded bg-[#1e222d] border border-[#2a2e39] text-[#d1d4dc] font-mono-num text-[10px] whitespace-nowrap shadow-tv">
              + Alert @ {formatTradePrice(hoverCursor.price, digits)}
            </span>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={handleQuickAddAlert}
              title={`Add Price Alert @ ${formatTradePrice(hoverCursor.price, digits)}`}
              className="w-[18px] h-[18px] rounded-[3px] bg-[#2a2e39] hover:bg-[#2962ff] border border-[#363a45] text-[#d1d4dc] hover:text-white flex items-center justify-center shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        );
      })()}
    </div>
  );
};
