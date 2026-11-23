import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  X,
  ShieldCheck,
  BarChart3,
  UserCheck,
  Calendar,
  BookOpen,
} from 'lucide-react';
import { api } from '../services/api';
import { useChartStore } from '../store/useChartStore';
import { PositionItem } from '../types/chart';
import { BulkSlTpEditor } from './BulkSlTpEditor';

export const BottomTradingDock: React.FC = () => {
  const {
    symbol,
    setSymbol,
    account,
    positions,
    orders,
    tradeDockOpen,
    toggleTradeDock,
    showToast,
    refreshTradeState,
    replay,
    paperAccount,
    closePaperTrade,
    cancelPaperTrade,
    breakevenPaperTrade,
    bulkPaperModify,
    setAccountModalOpen,
    setBacktestModalOpen,
    openAnalyticsHub,
  } = useChartStore();

  const [activeTab, setActiveTab] = useState<'positions' | 'orders'>('positions');
  const [busyTicket, setBusyTicket] = useState<number | null>(null);
  const [selectedTickets, setSelectedTickets] = useState<Set<number>>(new Set());
  const [scope, setScope] = useState<'all' | 'pair' | 'selected'>('all');
  const [pairFilter, setPairFilter] = useState<string>('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkEditorOpen, setBulkEditorOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; kind: 'live' | 'paper'; symbol: string } | null>(null);

  const isPaper = replay.isActive;
  const paperOpen = paperAccount.trades.filter((t) => t.status === 'OPEN');
  const paperPending = paperAccount.trades.filter((t) => t.status === 'PENDING');

  const currency = isPaper ? 'USD' : account?.currency || 'USD';
  const fmtMoney = (v: number) =>
    `${v < 0 ? '-' : ''}${currency === 'USD' ? '$' : ''}${Math.abs(v).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const handleBreakeven = async (pos: PositionItem) => {
    setBusyTicket(pos.ticket);
    try {
      const res = await api.modifyTrade({
        ticket: pos.ticket,
        symbol: pos.symbol,
        sl: pos.open_price,
        tp: pos.tp,
        is_pending: false,
      });
      showToast(res.success ? 'success' : 'error', res.message);
      await refreshTradeState();
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to set Breakeven');
    } finally {
      setBusyTicket(null);
    }
  };

  const handleClosePosition = async (ticket: number) => {
    setBusyTicket(ticket);
    try {
      const res = await api.closePosition(ticket);
      showToast(res.success ? 'success' : 'error', res.message);
      await refreshTradeState();
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to close position');
    } finally {
      setBusyTicket(null);
    }
  };

  const handleCancelOrder = async (ticket: number) => {
    setBusyTicket(ticket);
    try {
      const res = await api.cancelOrder(ticket);
      showToast(res.success ? 'success' : 'error', res.message);
      await refreshTradeState();
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to cancel order');
    } finally {
      setBusyTicket(null);
    }
  };

  const floatingPnl = isPaper
    ? paperAccount.equity - paperAccount.balance
    : account?.profit ?? 0;

  const uniqueSymbols = Array.from(new Set(positions.map((p) => p.symbol))).sort();
  const bulkTargetTickets = (): number[] => {
    if (scope === 'pair') return positions.filter((p) => p.symbol === pairFilter).map((p) => p.ticket);
    if (scope === 'selected') return [...selectedTickets];
    return positions.map((p) => p.ticket);
  };
  const bulkCount = bulkTargetTickets().length;

  const toggleTicket = (ticket: number) => {
    setSelectedTickets((prev) => {
      const next = new Set(prev);
      if (next.has(ticket)) next.delete(ticket);
      else next.add(ticket);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedTickets((prev) => {
      const next = new Set(prev);
      const allSelected = positions.every((p) => next.has(p.ticket));
      positions.forEach((p) => (allSelected ? next.delete(p.ticket) : next.add(p.ticket)));
      return next;
    });
  };

  const handleBulkApply = async (sl?: number, tp?: number) => {
    setBulkBusy(true);
    try {
      if (isPaper) {
        const ids = paperOpen.map((t) => t.id);
        bulkPaperModify(ids, { sl, tp });
        showToast('success', `Bulk SL/TP applied to ${ids.length} paper trade(s)`);
      } else {
        const res = await api.bulkModifyTrade({ tickets: bulkTargetTickets(), sl, tp });
        showToast(res.success ? 'success' : 'error', res.message);
        await refreshTradeState();
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Bulk SL/TP failed');
    } finally {
      setBulkBusy(false);
      setBulkEditorOpen(false);
    }
  };

  return (
    <section className="bg-[#1e222d] border-t border-[#2a2e39] flex flex-col shrink-0 z-20">
      {/* Always-visible 32px Header Bar */}
      <div className="h-[32px] px-3 flex items-center justify-between border-b border-[#2a2e39]/60 select-none">
        {/* Left: Collapse Toggle + Title + Tabs */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={toggleTradeDock}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-[#d1d4dc] hover:text-white"
          >
            {tradeDockOpen ? (
              <ChevronDown className="w-4 h-4 text-[#787b86]" />
            ) : (
              <ChevronUp className="w-4 h-4 text-[#787b86]" />
            )}
            <span>
              {isPaper ? 'Replay Paper Account (Backtest)' : 'Trading Panel (MT5 Broker)'}
            </span>
          </button>

          <div className="w-[1px] h-4 bg-[#2a2e39]" />

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setActiveTab('positions');
                if (!tradeDockOpen) toggleTradeDock();
              }}
              className={`px-2 py-0.5 rounded text-[11.5px] font-medium transition-colors ${
                activeTab === 'positions'
                  ? 'bg-[#2962ff]/15 text-[#2962ff]'
                  : 'text-[#787b86] hover:text-[#d1d4dc]'
              }`}
            >
              Positions ({isPaper ? paperOpen.length : positions.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('orders');
                if (!tradeDockOpen) toggleTradeDock();
              }}
              className={`px-2 py-0.5 rounded text-[11.5px] font-medium transition-colors ${
                activeTab === 'orders'
                  ? 'bg-[#2962ff]/15 text-[#2962ff]'
                  : 'text-[#787b86] hover:text-[#d1d4dc]'
              }`}
            >
              Pending ({isPaper ? paperPending.length : orders.length})
            </button>
          </div>

          <button
            onClick={() => openAnalyticsHub('calendar')}
            className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded bg-[#089981]/15 hover:bg-[#089981]/25 text-[#089981] text-[11px] font-medium"
          >
            <Calendar className="w-3 h-3" />
            <span>Calendar</span>
          </button>

          <button
            onClick={() => openAnalyticsHub('journal')}
            className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded bg-[#2962ff]/10 hover:bg-[#2962ff]/20 text-[#2962ff] text-[11px] font-medium"
          >
            <BookOpen className="w-3 h-3" />
            <span>Journal</span>
          </button>

          {isPaper && (
            <button
              onClick={() => setBacktestModalOpen(true)}
              className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded bg-[#f59e0b]/15 hover:bg-[#f59e0b]/25 text-[#f59e0b] text-[11px] font-medium"
            >
              <BarChart3 className="w-3 h-3" />
              <span>Replay Report</span>
            </button>
          )}

          {!isPaper && (
            <button
              onClick={() => setAccountModalOpen(true)}
              className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded bg-[#131722] border border-[#2a2e39] hover:border-[#2962ff] text-[#d1d4dc] text-[11px]"
            >
              <UserCheck className="w-3 h-3 text-[#787b86]" />
              <span>Switch Account</span>
            </button>
          )}
        </div>

        {/* Right: Real-time Account Summary */}
        <div className="flex items-center gap-3.5 text-[11px] font-mono-num">
          <div className="hidden md:flex items-center gap-1">
            <span className="text-[#787b86]">Balance:</span>
            <span className="text-[#d1d4dc]">
              {fmtMoney(isPaper ? paperAccount.balance : account?.balance ?? 0)}
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-1">
            <span className="text-[#787b86]">Equity:</span>
            <span className="text-[#d1d4dc]">
              {fmtMoney(isPaper ? paperAccount.equity : account?.equity ?? 0)}
            </span>
          </div>
          {!isPaper && (
            <div className="hidden xl:flex items-center gap-1">
              <span className="text-[#787b86]">Free Margin:</span>
              <span className="text-[#d1d4dc]">{fmtMoney(account?.free_margin ?? 0)}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span className="text-[#787b86]">Floating:</span>
            <span
              className={`font-semibold ${
                floatingPnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'
              }`}
            >
              {floatingPnl >= 0 ? '+' : ''}
              {fmtMoney(floatingPnl)}
            </span>
          </div>
        </div>
      </div>

      {/* Collapsible 180px Body Table */}
      {tradeDockOpen && (
        <div className="h-[180px] overflow-auto bg-[#131722]">
          {isPaper ? (
            activeTab === 'positions' ? (
              paperOpen.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[12px] text-[#787b86]">
                  No open paper positions. Draw a Long/Short R:R box or click Paper Buy/Sell to backtest.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-[11.5px]">
                  <thead className="sticky top-0 bg-[#1e222d] text-[#787b86] border-b border-[#2a2e39]">
                    <tr>
                      <th className="py-1.5 px-3 font-medium">Symbol</th>
                      <th className="py-1.5 px-2 font-medium">Side</th>
                      <th className="py-1.5 px-2 font-medium">Tag</th>
                      <th className="py-1.5 px-2 font-medium text-right">Entry</th>
                      <th className="py-1.5 px-2 font-medium text-right">SL</th>
                      <th className="py-1.5 px-2 font-medium text-right">TP</th>
                      <th className="py-1.5 px-2 font-medium text-right">MFE / MAE</th>
                      <th className="py-1.5 px-2 font-medium text-right">Floating ($)</th>
                      <th className="py-1.5 px-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2e39]/40 font-mono-num">
                    {paperOpen.map((tr) => {
                      const isProfit = tr.pnl_money >= 0;
                      return (
                        <tr
                          key={tr.id}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'paper', symbol: tr.symbol });
                          }}
                          className="hover:bg-[#1e222d]/80"
                        >
                          <td className="py-1.5 px-3 font-sans font-semibold text-[#d1d4dc]">
                            {tr.symbol}
                          </td>
                          <td className="py-1.5 px-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold ${
                                tr.side === 'BUY'
                                  ? 'bg-[#089981]/20 text-[#089981]'
                                  : 'bg-[#f23645]/20 text-[#f23645]'
                              }`}
                            >
                              {tr.side}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 font-sans text-[#f59e0b]">
                            {tr.strategy_tag || '-'}
                          </td>
                          <td className="py-1.5 px-2 text-right text-[#d1d4dc]">{tr.entry_price}</td>
                          <td className="py-1.5 px-2 text-right text-[#f23645]">
                            {tr.sl > 0 ? tr.sl : '—'}
                          </td>
                          <td className="py-1.5 px-2 text-right text-[#089981]">
                            {tr.tp > 0 ? tr.tp : '—'}
                          </td>
                          <td className="py-1.5 px-2 text-right text-[#787b86]">
                            <span className="text-[#089981]">{tr.mfe_pips}p</span> /{' '}
                            <span className="text-[#f23645]">{tr.mae_pips}p</span>
                          </td>
                          <td
                            className={`py-1.5 px-2 text-right font-semibold ${
                              isProfit ? 'text-[#089981]' : 'text-[#f23645]'
                            }`}
                          >
                            {isProfit ? '+' : ''}
                            {tr.pnl_money.toFixed(2)} ({tr.realized_r >= 0 ? '+' : ''}
                            {tr.realized_r.toFixed(2)}R)
                          </td>
                          <td className="py-1.5 px-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => breakevenPaperTrade(tr.id)}
                                className="px-1.5 py-0.5 rounded bg-[#2962ff]/15 hover:bg-[#2962ff]/30 text-[#2962ff] text-[10.5px] font-sans font-semibold"
                              >
                                BE
                              </button>
                              <button
                                onClick={() => closePaperTrade(tr.id)}
                                className="px-1.5 py-0.5 rounded bg-[#f23645]/15 hover:bg-[#f23645] text-[#f23645] hover:text-white text-[10.5px] font-sans font-semibold"
                              >
                                Close
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            ) : paperPending.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[12px] text-[#787b86]">
                No pending paper orders.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-[11.5px]">
                <thead className="sticky top-0 bg-[#1e222d] text-[#787b86] border-b border-[#2a2e39]">
                  <tr>
                    <th className="py-1.5 px-3 font-medium">Symbol</th>
                    <th className="py-1.5 px-2 font-medium">Type</th>
                    <th className="py-1.5 px-2 font-medium">Tag</th>
                    <th className="py-1.5 px-2 font-medium text-right">Entry</th>
                    <th className="py-1.5 px-2 font-medium text-right">SL</th>
                    <th className="py-1.5 px-2 font-medium text-right">TP</th>
                    <th className="py-1.5 px-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2e39]/40 font-mono-num">
                  {paperPending.map((tr) => (
                    <tr key={tr.id} className="hover:bg-[#1e222d]/80">
                      <td className="py-1.5 px-3 font-sans font-semibold text-[#d1d4dc]">
                        {tr.symbol}
                      </td>
                      <td className="py-1.5 px-2 font-sans text-[#2962ff] font-semibold">
                        {tr.side} {tr.order_type}
                      </td>
                      <td className="py-1.5 px-2 font-sans text-[#f59e0b]">
                        {tr.strategy_tag || '-'}
                      </td>
                      <td className="py-1.5 px-2 text-right text-[#d1d4dc]">{tr.entry_price}</td>
                      <td className="py-1.5 px-2 text-right text-[#f23645]">
                        {tr.sl > 0 ? tr.sl : '—'}
                      </td>
                      <td className="py-1.5 px-2 text-right text-[#089981]">
                        {tr.tp > 0 ? tr.tp : '—'}
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        <button
                          onClick={() => cancelPaperTrade(tr.id)}
                          className="px-1.5 py-0.5 rounded bg-[#f23645]/15 hover:bg-[#f23645] text-[#f23645] hover:text-white text-[10.5px] font-sans font-semibold"
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : activeTab === 'positions' ? (
            positions.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[12px] text-[#787b86]">
                No open positions. Use One-Click Buy/Sell or draw a Long/Short R:R box to place an order.
              </div>
            ) : (
              <>
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2e39]/60 bg-[#1e222d]/60">
                <span className="text-[10.5px] font-sans font-semibold uppercase tracking-wide text-[#787b86]">Bulk</span>
                <div className="flex items-center gap-0.5 rounded bg-[#131722] border border-[#2a2e39] overflow-hidden">
                  {(['all', 'pair', 'selected'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setScope(s);
                        if (s === 'pair' && !pairFilter && uniqueSymbols.length) setPairFilter(uniqueSymbols[0]);
                      }}
                      className={`px-2 py-0.5 text-[10.5px] font-sans font-semibold capitalize transition-colors ${
                        scope === s ? 'bg-[#2962ff]/20 text-[#2962ff]' : 'text-[#787b86] hover:text-[#d1d4dc]'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {scope === 'pair' && (
                  <select
                    value={pairFilter}
                    onChange={(e) => setPairFilter(e.target.value)}
                    className="bg-[#131722] border border-[#2a2e39] rounded text-[10.5px] font-sans text-[#d1d4dc] px-1.5 py-0.5"
                  >
                    {uniqueSymbols.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}
                <button
                  onClick={() => setBulkEditorOpen(true)}
                  disabled={bulkCount === 0 || bulkBusy}
                  className="px-2 py-0.5 rounded bg-[#2962ff]/15 hover:bg-[#2962ff]/30 text-[#2962ff] text-[10.5px] font-sans font-semibold disabled:opacity-40"
                >
                  Set SL/TP ({bulkCount})
                </button>
                <button
                  onClick={() => showToast('info', 'Bulk close lands in the next commit')}
                  disabled={bulkCount === 0 || bulkBusy}
                  className="px-2 py-0.5 rounded bg-[#089981]/15 hover:bg-[#089981]/30 text-[#089981] text-[10.5px] font-sans font-semibold disabled:opacity-40"
                >
                  Close ({bulkCount})
                </button>
              </div>
              <table className="w-full text-left border-collapse text-[11.5px]">
                <thead className="sticky top-0 bg-[#1e222d] text-[#787b86] border-b border-[#2a2e39]">
                  <tr>
                    <th className="py-1.5 px-2 font-medium">
                      <input
                        type="checkbox"
                        checked={positions.length > 0 && positions.every((p) => selectedTickets.has(p.ticket))}
                        onChange={toggleAllVisible}
                        className="accent-[#2962ff]"
                      />
                    </th>
                    <th className="py-1.5 px-3 font-medium">Ticket</th>
                    <th className="py-1.5 px-2 font-medium">Symbol</th>
                    <th className="py-1.5 px-2 font-medium">Side</th>
                    <th className="py-1.5 px-2 font-medium text-right">Lot</th>
                    <th className="py-1.5 px-2 font-medium text-right">Entry Price</th>
                    <th className="py-1.5 px-2 font-medium text-right">SL</th>
                    <th className="py-1.5 px-2 font-medium text-right">TP</th>
                    <th className="py-1.5 px-2 font-medium text-right">Current</th>
                    <th className="py-1.5 px-2 font-medium text-right">Profit ($)</th>
                    <th className="py-1.5 px-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2e39]/40 font-mono-num">
                  {positions.map((pos) => {
                    const isProfit = pos.profit >= 0;
                    const busy = busyTicket === pos.ticket;
                    return (
                      <tr
                        key={pos.ticket}
                        onClick={() => {
                          if (pos.symbol !== symbol) setSymbol(pos.symbol);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'live', symbol: pos.symbol });
                        }}
                        className="hover:bg-[#1e222d]/80 cursor-pointer transition-colors"
                      >
                        <td className="py-1.5 px-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedTickets.has(pos.ticket)}
                            onChange={() => toggleTicket(pos.ticket)}
                            className="accent-[#2962ff]"
                          />
                        </td>
                        <td className="py-1.5 px-3 text-[#787b86]">#{pos.ticket}</td>
                        <td className="py-1.5 px-2 font-sans font-semibold text-[#d1d4dc]">
                          {pos.symbol}
                        </td>
                        <td className="py-1.5 px-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold ${
                              pos.side === 'BUY'
                                ? 'bg-[#089981]/20 text-[#089981]'
                                : 'bg-[#f23645]/20 text-[#f23645]'
                            }`}
                          >
                            {pos.side}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-right text-[#d1d4dc]">
                          {pos.volume.toFixed(2)}
                        </td>
                        <td className="py-1.5 px-2 text-right text-[#d1d4dc]">
                          {pos.open_price}
                        </td>
                        <td className="py-1.5 px-2 text-right text-[#f23645]">
                          {pos.sl > 0 ? pos.sl : '—'}
                        </td>
                        <td className="py-1.5 px-2 text-right text-[#089981]">
                          {pos.tp > 0 ? pos.tp : '—'}
                        </td>
                        <td className="py-1.5 px-2 text-right text-[#d1d4dc]">
                          {pos.current_price}
                        </td>
                        <td
                          className={`py-1.5 px-2 text-right font-semibold ${
                            isProfit ? 'text-[#089981]' : 'text-[#f23645]'
                          }`}
                        >
                          {isProfit ? '+' : ''}
                          {pos.profit.toFixed(2)}
                        </td>
                        <td
                          className="py-1.5 px-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => handleBreakeven(pos)}
                              disabled={busy}
                              title="Set Stop Loss to Entry Price (Breakeven)"
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#2962ff]/15 hover:bg-[#2962ff]/30 text-[#2962ff] text-[10.5px] font-sans font-semibold disabled:opacity-40"
                            >
                              <ShieldCheck className="w-3 h-3" />
                              BE
                            </button>
                            <button
                              onClick={() => handleClosePosition(pos.ticket)}
                              disabled={busy}
                              title="Close Position at Market"
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#f23645]/15 hover:bg-[#f23645] text-[#f23645] hover:text-white text-[10.5px] font-sans font-semibold transition-colors disabled:opacity-40"
                            >
                              <X className="w-3 h-3" />
                              Close
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </>
            )
          ) : orders.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[12px] text-[#787b86]">
              No active pending orders.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-[11.5px]">
              <thead className="sticky top-0 bg-[#1e222d] text-[#787b86] border-b border-[#2a2e39]">
                <tr>
                  <th className="py-1.5 px-3 font-medium">Ticket</th>
                  <th className="py-1.5 px-2 font-medium">Symbol</th>
                  <th className="py-1.5 px-2 font-medium">Type</th>
                  <th className="py-1.5 px-2 font-medium text-right">Lot</th>
                  <th className="py-1.5 px-2 font-medium text-right">Order Price</th>
                  <th className="py-1.5 px-2 font-medium text-right">SL</th>
                  <th className="py-1.5 px-2 font-medium text-right">TP</th>
                  <th className="py-1.5 px-2 font-medium text-right">Current</th>
                  <th className="py-1.5 px-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2e39]/40 font-mono-num">
                {orders.map((ord) => {
                  const isBuy = ord.order_type.startsWith('BUY');
                  const busy = busyTicket === ord.ticket;
                  return (
                    <tr
                      key={ord.ticket}
                      onClick={() => {
                        if (ord.symbol !== symbol) setSymbol(ord.symbol);
                      }}
                      className="hover:bg-[#1e222d]/80 cursor-pointer transition-colors"
                    >
                      <td className="py-1.5 px-3 text-[#787b86]">#{ord.ticket}</td>
                      <td className="py-1.5 px-2 font-sans font-semibold text-[#d1d4dc]">
                        {ord.symbol}
                      </td>
                      <td className="py-1.5 px-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold ${
                            isBuy
                              ? 'bg-[#2962ff]/20 text-[#2962ff]'
                              : 'bg-[#f59e0b]/20 text-[#f59e0b]'
                          }`}
                        >
                          {ord.order_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-right text-[#d1d4dc]">
                        {ord.volume.toFixed(2)}
                      </td>
                      <td className="py-1.5 px-2 text-right text-[#d1d4dc]">
                        {ord.price_open}
                      </td>
                      <td className="py-1.5 px-2 text-right text-[#f23645]">
                        {ord.sl > 0 ? ord.sl : '—'}
                      </td>
                      <td className="py-1.5 px-2 text-right text-[#089981]">
                        {ord.tp > 0 ? ord.tp : '—'}
                      </td>
                      <td className="py-1.5 px-2 text-right text-[#787b86]">
                        {ord.current_price}
                      </td>
                      <td
                        className="py-1.5 px-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => handleCancelOrder(ord.ticket)}
                          disabled={busy}
                          title="Cancel Pending Order"
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#f23645]/15 hover:bg-[#f23645] text-[#f23645] hover:text-white text-[10.5px] font-sans font-semibold transition-colors disabled:opacity-40"
                        >
                          <X className="w-3 h-3" />
                          Cancel
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {ctxMenu && (
        <div
          className="fixed z-50 bg-[#1e222d] border border-[#2a2e39] rounded shadow-xl py-1 min-w-[190px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseLeave={() => setCtxMenu(null)}
        >
          <button
            onClick={() => {
              if (ctxMenu.kind === 'live') {
                setScope('pair');
                setPairFilter(ctxMenu.symbol);
              }
              setBulkEditorOpen(true);
              setCtxMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 text-[11.5px] font-sans text-[#d1d4dc] hover:bg-[#2962ff]/15"
          >
            Bulk Set SL/TP ({ctxMenu.kind === 'live' ? ctxMenu.symbol : 'all paper'})
          </button>
        </div>
      )}

      {bulkEditorOpen && (
        <BulkSlTpEditor
          count={isPaper ? paperOpen.length : bulkCount}
          onApply={handleBulkApply}
          onClose={() => setBulkEditorOpen(false)}
        />
      )}
    </section>
  );
};
