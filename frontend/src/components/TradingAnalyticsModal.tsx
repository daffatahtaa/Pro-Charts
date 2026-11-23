import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X,
  BarChart3,
  BookOpen,
  Calendar as CalendarIcon,
  RefreshCw,
  Star,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  ExternalLink,
  Save,
  FileText,
  Search,
} from 'lucide-react';
import { api } from '../services/api';
import { useChartStore } from '../store/useChartStore';
import { JournalTrade, MyfxbookReportData } from '../types/chart';
import { formatAccountMoney } from '../utils/calcProfit';

const SETUP_TAGS = ['OB', 'FVG', 'OB + FVG', 'BOS', 'CHoCH', 'Liquidity Sweep', 'Breakout', 'Trend', 'News'];
const MISTAKE_TAGS = ['Followed Plan ✅', 'FOMO ⚠️', 'Early Exit', 'Revenge Trade', 'Moved SL', 'Overleveraged'];
const PAGE_SIZE = 50;

function fmtHold(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return h < 24 ? `${h}h ${rm}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

interface JournalTradeRowProps {
  trade: JournalTrade;
  currency: string;
  isExpanded: boolean;
  onToggleExpand: (tradeKey: string) => void;
  onUpdateMeta: (
    t: JournalTrade,
    patch: Partial<{
      setup_tag: string;
      mistake_tag: string;
      emotion: string;
      rating: number;
      notes: string;
    }>
  ) => void;
  onViewOnChart: (t: JournalTrade) => void;
}

const JournalTradeRow: React.FC<JournalTradeRowProps> = React.memo(
  ({ trade: t, currency, isExpanded, onToggleExpand, onUpdateMeta, onViewOnChart }) => {
    const [localNote, setLocalNote] = useState(t.notes);

    useEffect(() => {
      setLocalNote(t.notes);
    }, [t.notes, t.trade_key]);

    const isWin = t.net_pnl > 0;

    return (
      <>
        <tr className="hover:bg-[#131722]/50">
          <td className="py-2 px-2.5 font-mono-num text-[#d1d4dc]">
            <div>{t.close_date}</div>
            <div className="text-[10px] text-[#787b86]">
              {fmtHold(t.hold_seconds)} · {t.session}
            </div>
          </td>
          <td className="py-2 px-2 font-semibold text-[#d1d4dc]">{t.symbol}</td>
          <td className="py-2 px-2">
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                t.side === 'BUY'
                  ? 'bg-[#089981]/20 text-[#089981]'
                  : 'bg-[#f23645]/20 text-[#f23645]'
              }`}
            >
              {t.side}
            </span>
          </td>
          <td className="py-2 px-2 text-right font-mono-num">{t.volume}</td>
          <td className="py-2 px-2 text-right font-mono-num text-[#787b86]">
            {t.entry_price} -&gt; {t.exit_price}
          </td>
          <td
            className="py-2 px-2 text-right font-mono-num"
            title={`Gross: ${formatAccountMoney(t.gross_profit, currency, { signed: true })} | Comm: ${formatAccountMoney(t.commission, currency, { signed: true })} | Swap: ${formatAccountMoney(t.swap, currency, { signed: true })}`}
          >
            <div className={isWin ? 'text-[#089981] font-semibold' : 'text-[#f23645] font-semibold'}>
              {formatAccountMoney(t.net_pnl, currency, { signed: true })}
            </div>
            <div className="text-[10px] text-[#787b86]">
              {t.pips >= 0 ? '+' : ''}
              {t.pips}p
            </div>
          </td>
          <td className="py-2 px-2">
            <select
              value={t.setup_tag}
              onChange={(e) => onUpdateMeta(t, { setup_tag: e.target.value })}
              className="px-1.5 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[11px] text-[#d1d4dc] outline-none"
            >
              <option value="">-- Setup --</option>
              {SETUP_TAGS.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </td>
          <td className="py-2 px-2">
            <select
              value={t.mistake_tag}
              onChange={(e) => onUpdateMeta(t, { mistake_tag: e.target.value })}
              className="px-1.5 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[11px] text-[#d1d4dc] outline-none"
            >
              <option value="">-- Discipline --</option>
              {MISTAKE_TAGS.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </td>
          <td className="py-2 px-2">
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => onUpdateMeta(t, { rating: star })}
                  className="p-0.5 cursor-pointer"
                >
                  <Star
                    className={`w-3 h-3 ${
                      star <= t.rating ? 'text-[#f59e0b]' : 'text-[#434651]'
                    }`}
                    fill={star <= t.rating ? '#f59e0b' : 'none'}
                  />
                </button>
              ))}
            </div>
          </td>
          <td className="py-2 px-2.5 text-right">
            <div className="inline-flex items-center gap-1">
              <button
                onClick={() => onToggleExpand(t.trade_key)}
                title="Edit Trade Notes"
                className={`p-1 rounded cursor-pointer ${
                  t.notes ? 'text-[#f59e0b]' : 'text-[#787b86] hover:text-[#d1d4dc]'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onViewOnChart(t)}
                title="Jump to this trade on Chart"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#2962ff]/15 hover:bg-[#2962ff] text-[#2962ff] hover:text-white text-[10.5px] font-semibold transition-colors cursor-pointer"
              >
                <ExternalLink className="w-3 h-3" />
                Chart
              </button>
            </div>
          </td>
        </tr>
        {isExpanded && (
          <tr className="bg-[#131722]/80">
            <td colSpan={10} className="p-3">
              <div className="flex items-start gap-2">
                <textarea
                  rows={2}
                  value={localNote}
                  onChange={(e) => setLocalNote(e.target.value)}
                  placeholder="Write trade reflection / lesson learned..."
                  className="flex-1 p-2 rounded bg-[#1e222d] border border-[#2a2e39] text-[12px] text-white outline-none focus:border-[#2962ff]"
                />
                <button
                  onClick={() => onUpdateMeta(t, { notes: localNote })}
                  className="flex items-center gap-1 px-3 py-1.5 rounded bg-[#089981] hover:bg-[#07826e] text-white text-[11.5px] font-semibold cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Note
                </button>
              </div>
            </td>
          </tr>
        )}
      </>
    );
  }
);

export const TradingAnalyticsModal: React.FC = () => {
  // Atomic Zustand selectors -> 0 re-renders when liveTick / candles / positions stream!
  const analyticsHubOpen = useChartStore((s) => s.analyticsHubOpen);
  const setAnalyticsHubOpen = useChartStore((s) => s.setAnalyticsHubOpen);
  const analyticsHubTab = useChartStore((s) => s.analyticsHubTab);
  const setAnalyticsHubTab = useChartStore((s) => s.setAnalyticsHubTab);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const showToast = useChartStore((s) => s.showToast);
  const accountCurrency = useChartStore((s) => s.account?.currency);

  const [source, setSource] = useState<'mt5' | 'paper'>('mt5');
  const [days, setDays] = useState<number>(90);
  const [symbolFilter, setSymbolFilter] = useState<string>('ALL');
  const [data, setData] = useState<MyfxbookReportData | null>(null);
  const [loading, setLoading] = useState(false);

  // Journal filters, search & pagination
  const [sideFilter, setSideFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [resultFilter, setResultFilter] = useState<'ALL' | 'WIN' | 'LOSS'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [expandedTradeKey, setExpandedTradeKey] = useState<string | null>(null);

  // Calendar state
  const [calMonth, setCalMonth] = useState<{ year: number; month: number }>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dailyNoteDraft, setDailyNoteDraft] = useState('');
  const [dailyMoodDraft, setDailyMoodDraft] = useState('Neutral');

  const fetchAnalytics = useCallback(
    async (forceRefresh = false) => {
      setLoading(true);
      try {
        const res = await api.getJournalAnalytics(source, days, symbolFilter, forceRefresh);
        setData(res);
        if (res.trades.length > 0 && !selectedDate) {
          const latestDate = res.trades[0].close_date;
          const [y, m] = latestDate.split('-').map(Number);
          if (y && m) setCalMonth({ year: y, month: m - 1 });
        }
      } catch (err: any) {
        showToast('error', err?.message || 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    },
    [source, days, symbolFilter, selectedDate, showToast]
  );

  useEffect(() => {
    if (analyticsHubOpen) {
      fetchAnalytics(false);
    }
  }, [analyticsHubOpen, source, days, symbolFilter]);

  useEffect(() => {
    setPage(1);
  }, [sideFilter, resultFilter, searchQuery, symbolFilter, days, source]);

  useEffect(() => {
    if (selectedDate && data) {
      const dayObj = data.calendar_days[selectedDate];
      setDailyNoteDraft(dayObj?.daily_note || '');
      setDailyMoodDraft(dayObj?.mood || 'Neutral');
    }
  }, [selectedDate, data]);

  const filteredJournalTrades = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLowerCase();
    return data.trades.filter((t) => {
      if (sideFilter !== 'ALL' && t.side !== sideFilter) return false;
      if (resultFilter === 'WIN' && t.net_pnl <= 0) return false;
      if (resultFilter === 'LOSS' && t.net_pnl > 0) return false;
      if (q) {
        const hay = `${t.symbol} ${t.setup_tag} ${t.mistake_tag} ${t.notes} ${t.close_date}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, sideFilter, resultFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredJournalTrades.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedJournalTrades = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredJournalTrades.slice(start, start + PAGE_SIZE);
  }, [filteredJournalTrades, safePage]);

  // Calendar Grid Builder (Mon..Sun + Weekly Summary)
  const calendarWeeks = useMemo(() => {
    const { year, month } = calMonth;
    const firstDay = new Date(Date.UTC(year, month, 1));
    const lastDay = new Date(Date.UTC(year, month + 1, 0));
    const startDow = (firstDay.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
    const totalDays = lastDay.getUTCDate();

    const weeks: Array<{
      weekNum: number;
      cells: Array<{ dateStr: string | null; dayNum: number | null }>;
      weekPnl: number;
      weekPips: number;
      weekTrades: number;
    }> = [];

    let dayCounter = 1 - startDow;
    let wk = 1;
    while (dayCounter <= totalDays) {
      const cells: Array<{ dateStr: string | null; dayNum: number | null }> = [];
      let weekPnl = 0;
      let weekPips = 0;
      let weekTrades = 0;
      for (let c = 0; c < 7; c++) {
        if (dayCounter >= 1 && dayCounter <= totalDays) {
          const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayCounter).padStart(2, '0')}`;
          cells.push({ dateStr: ds, dayNum: dayCounter });
          const stat = data?.calendar_days[ds];
          if (stat) {
            weekPnl += stat.net_pnl;
            weekPips += stat.net_pips;
            weekTrades += stat.trade_count;
          }
        } else {
          cells.push({ dateStr: null, dayNum: null });
        }
        dayCounter++;
      }
      weeks.push({
        weekNum: wk++,
        cells,
        weekPnl: Number(weekPnl.toFixed(2)),
        weekPips: Number(weekPips.toFixed(1)),
        weekTrades,
      });
    }
    return weeks;
  }, [calMonth, data]);

  const monthSummary = useMemo(() => {
    const prefix = `${calMonth.year}-${String(calMonth.month + 1).padStart(2, '0')}-`;
    let netPnl = 0;
    let totalPips = 0;
    let tradingDays = 0;
    let winningDays = 0;
    if (data) {
      for (const [ds, st] of Object.entries(data.calendar_days)) {
        if (ds.startsWith(prefix) && st.trade_count > 0) {
          netPnl += st.net_pnl;
          totalPips += st.net_pips;
          tradingDays += 1;
          if (st.net_pnl > 0) winningDays += 1;
        }
      }
    }
    return {
      netPnl: Number(netPnl.toFixed(2)),
      totalPips: Number(totalPips.toFixed(1)),
      tradingDays,
      winningDays,
      winDayPct: tradingDays > 0 ? Number(((winningDays / tradingDays) * 100).toFixed(1)) : 0,
    };
  }, [calMonth, data]);

  const handleUpdateMeta = useCallback(
    async (
      t: JournalTrade,
      patch: Partial<{
        setup_tag: string;
        mistake_tag: string;
        emotion: string;
        rating: number;
        notes: string;
      }>
    ) => {
      const updated = {
        account_login: t.account_login,
        position_id: t.position_id,
        symbol: t.symbol,
        setup_tag: patch.setup_tag ?? t.setup_tag,
        mistake_tag: patch.mistake_tag ?? t.mistake_tag,
        emotion: patch.emotion ?? t.emotion,
        rating: patch.rating ?? t.rating,
        notes: patch.notes ?? t.notes,
      };
      try {
        await api.updateJournalMeta(updated);
        setData((prev) =>
          prev
            ? {
                ...prev,
                trades: prev.trades.map((item) =>
                  item.trade_key === t.trade_key ? { ...item, ...updated } : item
                ),
              }
            : prev
        );
        showToast('success', `Saved journal entry for #${t.position_id}`);
      } catch {
        showToast('error', 'Failed to save journal metadata');
      }
    },
    [showToast]
  );

  const handleToggleExpand = useCallback((tradeKey: string) => {
    setExpandedTradeKey((prev) => (prev === tradeKey ? null : tradeKey));
  }, []);

  const handleSaveDailyNote = async () => {
    if (!selectedDate || !data) return;
    try {
      await api.saveDailyJournalNote({
        account_login: data.account_login,
        date_str: selectedDate,
        mood: dailyMoodDraft,
        summary_note: dailyNoteDraft,
      });
      showToast('success', `Saved daily reflection for ${selectedDate}`);
      fetchAnalytics(false);
    } catch {
      showToast('error', 'Failed to save daily note');
    }
  };

  const handleViewOnChart = useCallback(
    (t: JournalTrade) => {
      setAnalyticsHubOpen(false);
      setSymbol(t.symbol);
      window.setTimeout(() => {
        useChartStore.getState().bridge.jumpToDate?.(t.close_date);
      }, 350);
    },
    [setAnalyticsHubOpen, setSymbol]
  );

  // Memoized Equity curve SVG
  const curve = data?.equity_curve || [];
  const svgW = 640;
  const svgH = 190;
  const polyPts = useMemo(() => {
    if (curve.length === 0) return '';
    let minB = Infinity;
    let maxB = -Infinity;
    for (const c of curve) {
      if (c.balance < minB) minB = c.balance;
      if (c.balance > maxB) maxB = c.balance;
    }
    const spanB = Math.max(1, maxB - minB);
    return curve
      .map((pt, i) => {
        const x = curve.length > 1 ? (i / (curve.length - 1)) * (svgW - 24) + 12 : svgW / 2;
        const y = svgH - 16 - ((pt.balance - minB) / spanB) * (svgH - 32);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [curve]);

  if (!analyticsHubOpen) return null;

  const currency = source === 'paper' ? 'USD' : data?.currency || accountCurrency || 'USD';
  const k = data?.kpis || {};
  const monthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(calMonth.year, calMonth.month, 1)));

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3"
      onClick={() => setAnalyticsHubOpen(false)}
    >
      <div
        className="w-[96vw] max-w-[1340px] h-[90vh] bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-tv flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Header + Tabs + Filters */}
        <div className="px-4 py-2.5 border-b border-[#2a2e39] flex flex-wrap items-center justify-between gap-2 bg-[#131722]/70 shrink-0">
          {/* 3 Main Tabs */}
          <div className="flex items-center gap-1">
            {[
              { id: 'report' as const, label: 'Performance Report', icon: <BarChart3 className="w-3.5 h-3.5" /> },
              { id: 'journal' as const, label: 'Trade Journal', icon: <BookOpen className="w-3.5 h-3.5" /> },
              { id: 'calendar' as const, label: 'Trade Calendar', icon: <CalendarIcon className="w-3.5 h-3.5" /> },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setAnalyticsHubTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-semibold transition-colors ${
                  analyticsHubTab === t.id
                    ? 'bg-[#2962ff] text-white'
                    : 'text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]'
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* Right Global Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Source Toggle */}
            <div className="flex items-center rounded bg-[#131722] border border-[#2a2e39] p-0.5 text-[11px]">
              <button
                onClick={() => setSource('mt5')}
                className={`px-2 py-1 rounded font-medium ${
                  source === 'mt5' ? 'bg-[#089981] text-white' : 'text-[#787b86] hover:text-[#d1d4dc]'
                }`}
              >
                MT5 Account {data && source === 'mt5' ? `#${data.account_login}` : ''}
              </button>
              <button
                onClick={() => setSource('paper')}
                className={`px-2 py-1 rounded font-medium ${
                  source === 'paper' ? 'bg-[#f59e0b] text-[#131722]' : 'text-[#787b86] hover:text-[#d1d4dc]'
                }`}
              >
                Replay Paper
              </button>
            </div>

            {/* Period Filter */}
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[11.5px] text-[#d1d4dc] outline-none"
            >
              <option value={30}>Last 30D</option>
              <option value={90}>Last 90D</option>
              <option value={365}>Last 1Y</option>
              <option value={0}>All Time</option>
            </select>

            {/* Symbol Filter */}
            <select
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
              className="px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[11.5px] text-[#d1d4dc] outline-none"
            >
              <option value="ALL">All Pairs</option>
              {(data?.symbols_available || []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <button
              onClick={() => fetchAnalytics(true)}
              disabled={loading}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#2a2e39] hover:bg-[#363a45] text-[#d1d4dc] text-[11.5px] font-medium cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={() => setAnalyticsHubOpen(false)}
              className="p-1.5 rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Body */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#131722]/40">
          {/* ================= TAB 1: PERFORMANCE REPORT (MYFXBOOK) ================= */}
          {analyticsHubTab === 'report' && (
            <div className="space-y-4">
              {/* Row 1: 8 KPI Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                {[
                  {
                    label: 'Net Profit & Gain',
                    val: formatAccountMoney(k.net_profit ?? 0, currency, { signed: true }),
                    sub: `${(k.gain_pct ?? 0) >= 0 ? '+' : ''}${k.gain_pct ?? 0}% Gain`,
                    pos: (k.net_profit ?? 0) >= 0,
                  },
                  {
                    label: 'Win Rate',
                    val: `${k.win_rate_pct ?? 0}%`,
                    sub: `${k.win_count ?? 0}W / ${k.loss_count ?? 0}L (${k.total_trades ?? 0} trades)`,
                    pos: (k.win_rate_pct ?? 0) >= 50,
                  },
                  {
                    label: 'Profit Factor',
                    val: `${k.profit_factor ?? 0}`,
                    sub: `Payoff Ratio: ${k.payoff_ratio ?? 0}`,
                    pos: (k.profit_factor ?? 0) >= 1.2,
                  },
                  {
                    label: 'Expectancy',
                    val: formatAccountMoney(k.expectancy_money ?? 0, currency, { signed: true }),
                    sub: `${(k.expectancy_pips ?? 0) >= 0 ? '+' : ''}${k.expectancy_pips ?? 0} pips / trade`,
                    pos: (k.expectancy_money ?? 0) >= 0,
                  },
                  {
                    label: 'Max Drawdown',
                    val: `${k.max_drawdown_pct ?? 0}%`,
                    sub: formatAccountMoney(k.max_drawdown_money ?? 0, currency),
                    pos: (k.max_drawdown_pct ?? 0) < 10,
                  },
                  {
                    label: 'Longs vs Shorts WR',
                    val: `${k.long_win_rate_pct ?? 0}% / ${k.short_win_rate_pct ?? 0}%`,
                    sub: `Long ${k.long_trades ?? 0} · Short ${k.short_trades ?? 0}`,
                    pos: true,
                  },
                  {
                    label: 'Best / Worst Trade',
                    val: formatAccountMoney(k.best_trade_money ?? 0, currency, { signed: true }),
                    sub: `Worst: ${formatAccountMoney(k.worst_trade_money ?? 0, currency, { signed: true })}`,
                    pos: true,
                  },
                  {
                    label: 'Avg Hold & Total Lots',
                    val: k.avg_hold_time_str || '0m',
                    sub: `${k.total_lots ?? 0} lots · ${(k.total_pips ?? 0) >= 0 ? '+' : ''}${k.total_pips ?? 0}p`,
                    pos: true,
                  },
                ].map((c) => (
                  <div
                    key={c.label}
                    className="p-3 rounded bg-[#1e222d] border border-[#2a2e39]"
                  >
                    <div className="text-[10.5px] uppercase tracking-wider text-[#787b86]">
                      {c.label}
                    </div>
                    <div
                      className={`font-mono-num text-[16px] font-bold mt-1 ${
                        c.pos ? 'text-[#089981]' : 'text-[#f23645]'
                      }`}
                    >
                      {c.val}
                    </div>
                    <div className="text-[11px] font-mono-num text-[#787b86] mt-0.5">{c.sub}</div>
                  </div>
                ))}
              </div>

              {/* Row 2: Equity Growth SVG (60%) + Myfxbook Advanced Stats (40%) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                <div className="lg:col-span-7 p-3.5 rounded bg-[#1e222d] border border-[#2a2e39]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-semibold text-[#d1d4dc] flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-[#089981]" />
                      Cumulative Equity Growth Curve
                    </span>
                    <span className="text-[11px] font-mono-num text-[#787b86]">
                      Bal: {formatAccountMoney(data?.current_balance ?? 0, currency)}
                    </span>
                  </div>
                  <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-[200px] bg-[#131722] rounded">
                    {curve.length > 1 ? (
                      <polyline
                        fill="none"
                        stroke={(k.net_profit ?? 0) >= 0 ? '#089981' : '#f23645'}
                        strokeWidth="2.5"
                        points={polyPts}
                      />
                    ) : (
                      <text x={svgW / 2} y={svgH / 2} fill="#787b86" fontSize="13" textAnchor="middle">
                        No closed trades in this period yet
                      </text>
                    )}
                  </svg>
                </div>

                <div className="lg:col-span-5 p-3.5 rounded bg-[#1e222d] border border-[#2a2e39]">
                  <div className="text-[12px] font-semibold text-[#d1d4dc] mb-2">
                    Myfxbook Advanced Statistics
                  </div>
                  {/* Profitability Bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-[10.5px] font-mono-num mb-1">
                      <span className="text-[#089981]">Won: {k.win_rate_pct ?? 0}%</span>
                      <span className="text-[#f23645]">
                        Lost: {(100 - (k.win_rate_pct ?? 0)).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 rounded overflow-hidden bg-[#f23645] flex">
                      <div
                        className="bg-[#089981] h-full"
                        style={{ width: `${k.win_rate_pct ?? 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11.5px] font-mono-num">
                    {[
                      ['Gross Profit', formatAccountMoney(Math.abs(k.gross_profit ?? 0), currency, { signed: true })],
                      ['Gross Loss', formatAccountMoney(-Math.abs(k.gross_loss ?? 0), currency, { signed: true })],
                      [`Avg Win (${currency})`, formatAccountMoney(Math.abs(k.avg_win_money ?? 0), currency, { signed: true })],
                      [`Avg Loss (${currency})`, formatAccountMoney(-Math.abs(k.avg_loss_money ?? 0), currency, { signed: true })],
                      ['Avg Win (p)', `+${k.avg_win_pips ?? 0}p`],
                      ['Avg Loss (p)', `${k.avg_loss_pips ?? 0}p`],
                      ['Sharpe Ratio', `${k.sharpe_ratio ?? 0}`],
                      ['Consec. W / L', `${k.max_consecutive_wins ?? 0} / ${k.max_consecutive_losses ?? 0}`],
                      ['Commissions', formatAccountMoney(k.total_commission ?? 0, currency)],
                      ['Swaps', formatAccountMoney(k.total_swap ?? 0, currency)],
                    ].map(([lbl, val]) => (
                      <div key={lbl} className="flex justify-between border-b border-[#2a2e39]/50 pb-1">
                        <span className="text-[#787b86] font-sans">{lbl}</span>
                        <span className="text-[#d1d4dc]">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Row 3: 3 Breakdown Panels */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* By Symbol */}
                <div className="p-3 rounded bg-[#1e222d] border border-[#2a2e39]">
                  <div className="text-[11.5px] font-semibold text-[#d1d4dc] mb-2">
                    Performance by Symbol
                  </div>
                  <div className="space-y-1.5 text-[11.5px] font-mono-num max-h-44 overflow-y-auto">
                    {(data?.by_symbol || []).length === 0 ? (
                      <div className="text-[#787b86] font-sans">No data yet.</div>
                    ) : (
                      data!.by_symbol.map((s) => (
                        <div key={s.symbol} className="flex items-center justify-between">
                          <span className="font-sans font-semibold text-[#d1d4dc]">{s.symbol}</span>
                          <span>
                            {s.trades}t · {s.win_rate}% ·{' '}
                            <span className={s.net_pnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}>
                              {formatAccountMoney(s.net_pnl, currency, { signed: true })}
                            </span>
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* By Day of Week */}
                <div className="p-3 rounded bg-[#1e222d] border border-[#2a2e39]">
                  <div className="text-[11.5px] font-semibold text-[#d1d4dc] mb-2">
                    Performance by Day (Mon – Fri)
                  </div>
                  <div className="space-y-1.5 text-[11.5px] font-mono-num">
                    {(data?.by_day_of_week || []).map((d) => (
                      <div key={d.day} className="flex items-center justify-between">
                        <span className="font-sans text-[#d1d4dc] w-10">{d.day}</span>
                        <span className="text-[#787b86]">{d.trades}t ({d.win_rate}%)</span>
                        <span className={d.net_pnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}>
                          {formatAccountMoney(d.net_pnl, currency, { signed: true })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Setup & Psychology Cost Audit */}
                <div className="p-3 rounded bg-[#1e222d] border border-[#2a2e39]">
                  <div className="text-[11.5px] font-semibold text-[#d1d4dc] mb-2">
                    Setup &amp; Psychology Cost Audit
                  </div>
                  <div className="space-y-1.5 text-[11px] font-mono-num max-h-44 overflow-y-auto">
                    {(data?.by_setup_tag || []).map((st) => (
                      <div key={`s_${st.tag}`} className="flex items-center justify-between">
                        <span className="px-1.5 py-0.5 rounded bg-[#2962ff]/15 text-[#2962ff] font-sans">
                          {st.tag}
                        </span>
                        <span className={st.net_pnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}>
                          {st.trades}t · {formatAccountMoney(st.net_pnl, currency, { signed: true })}
                        </span>
                      </div>
                    ))}
                    {(data?.by_mistake_tag || [])
                      .filter((m) => m.tag !== 'No Tag')
                      .map((m) => (
                        <div key={`m_${m.tag}`} className="flex items-center justify-between">
                          <span className="px-1.5 py-0.5 rounded bg-[#f59e0b]/15 text-[#f59e0b] font-sans">
                            {m.tag}
                          </span>
                          <span className={m.net_pnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}>
                            {m.trades}t · {formatAccountMoney(m.net_pnl, currency, { signed: true })}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 2: INTERACTIVE TRADE JOURNAL ================= */}
          {analyticsHubTab === 'journal' && (
            <div className="space-y-3">
              {/* Filter, Search & Top Pagination Bar */}
              <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                <div className="flex items-center rounded bg-[#1e222d] border border-[#2a2e39] p-0.5">
                  {(['ALL', 'BUY', 'SELL'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSideFilter(s)}
                      className={`px-2.5 py-1 rounded cursor-pointer ${
                        sideFilter === s ? 'bg-[#2962ff] text-white' : 'text-[#787b86]'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div className="flex items-center rounded bg-[#1e222d] border border-[#2a2e39] p-0.5">
                  {(['ALL', 'WIN', 'LOSS'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setResultFilter(r)}
                      className={`px-2.5 py-1 rounded cursor-pointer ${
                        resultFilter === r ? 'bg-[#2962ff] text-white' : 'text-[#787b86]'
                      }`}
                    >
                      {r === 'ALL' ? 'All Results' : r === 'WIN' ? 'Winners' : 'Losers'}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#787b86] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search pair, tag, note..."
                    className="pl-7 pr-2.5 py-1 w-48 rounded bg-[#1e222d] border border-[#2a2e39] text-[11.5px] text-[#d1d4dc] placeholder-[#787b86] outline-none focus:border-[#2962ff]"
                  />
                </div>
                <div className="ml-auto flex items-center gap-2 font-mono-num text-[#787b86]">
                  <span>
                    Showing{' '}
                    {filteredJournalTrades.length === 0
                      ? 0
                      : (safePage - 1) * PAGE_SIZE + 1}
                    –{Math.min(safePage * PAGE_SIZE, filteredJournalTrades.length)} of{' '}
                    {filteredJournalTrades.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="px-2 py-0.5 rounded bg-[#1e222d] border border-[#2a2e39] text-[#d1d4dc] disabled:opacity-40 hover:bg-[#2a2e39] cursor-pointer"
                    >
                      &lt; Prev
                    </button>
                    <span className="px-1.5 text-[#d1d4dc]">
                      {safePage} / {totalPages}
                    </span>
                    <button
                      disabled={safePage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="px-2 py-0.5 rounded bg-[#1e222d] border border-[#2a2e39] text-[#d1d4dc] disabled:opacity-40 hover:bg-[#2a2e39] cursor-pointer"
                    >
                      Next &gt;
                    </button>
                  </div>
                </div>
              </div>

              {/* Journal Table (Paginated 50 rows/page + React.memo rows) */}
              <div className="rounded border border-[#2a2e39] bg-[#1e222d] overflow-x-auto">
                <table className="w-full text-left border-collapse text-[11.5px]">
                  <thead className="bg-[#131722] text-[#787b86] border-b border-[#2a2e39]">
                    <tr>
                      <th className="py-2 px-2.5">Date / Hold</th>
                      <th className="py-2 px-2">Symbol</th>
                      <th className="py-2 px-2">Side</th>
                      <th className="py-2 px-2 text-right">Lots</th>
                      <th className="py-2 px-2 text-right">Entry -&gt; Exit</th>
                      <th className="py-2 px-2 text-right">Pips / Net PnL</th>
                      <th className="py-2 px-2">Setup Tag</th>
                      <th className="py-2 px-2">Discipline / Mistake</th>
                      <th className="py-2 px-2">Rating</th>
                      <th className="py-2 px-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2e39]/50">
                    {pagedJournalTrades.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-10 text-center text-[#787b86]">
                          No closed trades found for this account / filter.
                        </td>
                      </tr>
                    ) : (
                      pagedJournalTrades.map((t) => (
                        <JournalTradeRow
                          key={t.trade_key}
                          trade={t}
                          currency={currency}
                          isExpanded={expandedTradeKey === t.trade_key}
                          onToggleExpand={handleToggleExpand}
                          onUpdateMeta={handleUpdateMeta}
                          onViewOnChart={handleViewOnChart}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Bottom Pagination Bar */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between text-[11.5px] font-mono-num text-[#787b86]">
                  <span>Auto-exported to backtests/latest_mt5_journal.md</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 rounded bg-[#1e222d] border border-[#2a2e39] text-[#d1d4dc] disabled:opacity-40 hover:bg-[#2a2e39] cursor-pointer"
                    >
                      &lt; Prev
                    </button>
                    <span className="px-2 text-[#d1d4dc]">
                      Page {safePage} of {totalPages}
                    </span>
                    <button
                      disabled={safePage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="px-2.5 py-1 rounded bg-[#1e222d] border border-[#2a2e39] text-[#d1d4dc] disabled:opacity-40 hover:bg-[#2a2e39] cursor-pointer"
                    >
                      Next &gt;
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 3: MYFXBOOK / TRADEZELLA MONTHLY TRADE CALENDAR ================= */}
          {analyticsHubTab === 'calendar' && (
            <div className="space-y-3">
              {/* Month Navigator Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-[#1e222d] border border-[#2a2e39] rounded px-3 py-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setCalMonth((c) =>
                        c.month === 0
                          ? { year: c.year - 1, month: 11 }
                          : { year: c.year, month: c.month - 1 }
                      )
                    }
                    className="p-1 rounded hover:bg-[#2a2e39] text-[#d1d4dc]"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[14px] font-bold text-white min-w-[140px] text-center">
                    {monthLabel}
                  </span>
                  <button
                    onClick={() =>
                      setCalMonth((c) =>
                        c.month === 11
                          ? { year: c.year + 1, month: 0 }
                          : { year: c.year, month: c.month + 1 }
                      )
                    }
                    className="p-1 rounded hover:bg-[#2a2e39] text-[#d1d4dc]"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      const n = new Date();
                      setCalMonth({ year: n.getFullYear(), month: n.getMonth() });
                    }}
                    className="px-2 py-0.5 rounded bg-[#131722] border border-[#2a2e39] text-[11px] text-[#d1d4dc] hover:border-[#2962ff]"
                  >
                    Today
                  </button>
                </div>

                <div className="flex items-center gap-4 text-[11.5px] font-mono-num">
                  <div>
                    <span className="text-[#787b86]">Monthly Net: </span>
                    <span
                      className={`font-bold ${
                        monthSummary.netPnl >= 0 ? 'text-[#089981]' : 'text-[#f23645]'
                      }`}
                    >
                      {formatAccountMoney(monthSummary.netPnl, currency, { signed: true })}
                    </span>
                  </div>
                  <div className="hidden sm:block text-[#d1d4dc]">
                    Days: {monthSummary.tradingDays} ({monthSummary.winDayPct}% Win Days)
                  </div>
                  <div className="hidden md:block text-[#787b86]">
                    Pips: {monthSummary.totalPips >= 0 ? '+' : ''}
                    {monthSummary.totalPips}p
                  </div>
                </div>
              </div>

              {/* 8-Column Calendar Grid (Mon-Sun + Weekly Summary) */}
              <div className="grid grid-cols-8 gap-1.5">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Weekly'].map((hdr) => (
                  <div
                    key={hdr}
                    className="text-center py-1 text-[11px] font-semibold uppercase tracking-wider text-[#787b86]"
                  >
                    {hdr}
                  </div>
                ))}

                {calendarWeeks.map((wk) => (
                  <React.Fragment key={wk.weekNum}>
                    {wk.cells.map((cell, idx) => {
                      if (!cell.dateStr) {
                        return (
                          <div
                            key={`empty_${wk.weekNum}_${idx}`}
                            className="h-[88px] rounded bg-[#131722]/30 border border-[#2a2e39]/20"
                          />
                        );
                      }
                      const stat = data?.calendar_days[cell.dateStr];
                      const hasTrades = stat && stat.trade_count > 0;
                      const isPos = stat && stat.net_pnl > 0;
                      const isNeg = stat && stat.net_pnl < 0;
                      const isSel = selectedDate === cell.dateStr;

                      return (
                        <div
                          key={cell.dateStr}
                          onClick={() => setSelectedDate(cell.dateStr)}
                          className={`h-[88px] p-1.5 rounded border flex flex-col justify-between cursor-pointer transition-all ${
                            isSel ? 'ring-2 ring-[#2962ff]' : ''
                          } ${
                            hasTrades && isPos
                              ? 'bg-[#089981]/20 border-[#089981]/50 hover:bg-[#089981]/30'
                              : hasTrades && isNeg
                              ? 'bg-[#f23645]/20 border-[#f23645]/50 hover:bg-[#f23645]/30'
                              : 'bg-[#131722]/70 border-[#2a2e39]/50 hover:border-[#2962ff]/50'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10.5px]">
                            <span className="font-mono-num text-[#d1d4dc] font-semibold">
                              {cell.dayNum}
                            </span>
                            {stat?.daily_note && <span title="Has daily note">📝</span>}
                          </div>

                          {hasTrades ? (
                            <>
                              <div
                                className={`text-center font-mono-num text-[13px] font-bold ${
                                  isPos ? 'text-[#089981]' : 'text-[#f23645]'
                                }`}
                              >
                                {formatAccountMoney(stat!.net_pnl, currency, { signed: true })}
                              </div>
                              <div className="flex items-center justify-between text-[9.5px] font-mono-num text-[#d1d4dc]/80">
                                <span>
                                  {stat!.trade_count}t ({stat!.net_pips >= 0 ? '+' : ''}
                                  {stat!.net_pips}p)
                                </span>
                                <span>{stat!.win_rate}%</span>
                              </div>
                            </>
                          ) : (
                            <div className="text-center text-[10px] text-[#787b86]/40">—</div>
                          )}
                        </div>
                      );
                    })}

                    {/* Column 8: Weekly Summary Card */}
                    <div className="h-[88px] p-1.5 rounded bg-[#1e222d] border border-[#2a2e39] flex flex-col justify-between">
                      <div className="text-[10px] uppercase tracking-wider text-[#787b86] font-semibold">
                        Week {wk.weekNum}
                      </div>
                      <div
                        className={`text-center font-mono-num text-[13px] font-bold ${
                          wk.weekTrades === 0
                            ? 'text-[#787b86]'
                            : wk.weekPnl >= 0
                            ? 'text-[#089981]'
                            : 'text-[#f23645]'
                        }`}
                      >
                        {wk.weekTrades === 0
                          ? formatAccountMoney(0, currency)
                          : formatAccountMoney(wk.weekPnl, currency, { signed: true })}
                      </div>
                      <div className="text-[9.5px] font-mono-num text-[#787b86] text-center">
                        {wk.weekTrades} trades · {wk.weekPips >= 0 ? '+' : ''}
                        {wk.weekPips}p
                      </div>
                    </div>
                  </React.Fragment>
                ))}
              </div>

              {/* Day Drilldown Drawer */}
              {selectedDate && (
                <div className="p-3.5 rounded bg-[#1e222d] border border-[#2962ff]/50 grid grid-cols-1 lg:grid-cols-12 gap-3">
                  <div className="lg:col-span-7 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[12.5px] font-semibold text-white">
                        Trades on {selectedDate} ({data?.calendar_days[selectedDate]?.trade_count || 0})
                      </span>
                      <button
                        onClick={() => setSelectedDate(null)}
                        className="text-[#787b86] hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="max-h-36 overflow-y-auto divide-y divide-[#2a2e39]/50 text-[11.5px] font-mono-num">
                      {(data?.calendar_days[selectedDate]?.trades || []).length === 0 ? (
                        <div className="py-4 text-[#787b86] font-sans">No trades closed on this date.</div>
                      ) : (
                        data!.calendar_days[selectedDate].trades.map((tr) => (
                          <div key={tr.trade_key} className="py-1.5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-sans font-semibold text-[#d1d4dc]">{tr.symbol}</span>
                              <span
                                className={
                                  tr.side === 'BUY' ? 'text-[#089981]' : 'text-[#f23645]'
                                }
                              >
                                {tr.side} {tr.volume}
                              </span>
                              {tr.setup_tag && (
                                <span className="px-1.5 py-0.5 rounded bg-[#2962ff]/15 text-[#2962ff] text-[10px] font-sans">
                                  {tr.setup_tag}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={
                                  tr.net_pnl >= 0 ? 'text-[#089981] font-bold' : 'text-[#f23645] font-bold'
                                }
                              >
                                {formatAccountMoney(tr.net_pnl, currency, { signed: true })}
                              </span>
                              <button
                                onClick={() => handleViewOnChart(tr)}
                                className="px-1.5 py-0.5 rounded bg-[#2962ff]/15 text-[#2962ff] hover:bg-[#2962ff] hover:text-white text-[10px] font-sans"
                              >
                                Chart
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Daily Reflection Note */}
                  <div className="lg:col-span-5 space-y-2 border-t lg:border-t-0 lg:border-l border-[#2a2e39] pt-2 lg:pt-0 lg:pl-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-semibold text-[#d1d4dc]">
                        Daily Reflection Note
                      </span>
                      <select
                        value={dailyMoodDraft}
                        onChange={(e) => setDailyMoodDraft(e.target.value)}
                        className="px-2 py-0.5 rounded bg-[#131722] border border-[#2a2e39] text-[11px] text-[#d1d4dc]"
                      >
                        <option value="Disciplined">Disciplined</option>
                        <option value="Neutral">Neutral</option>
                        <option value="Confident">Confident</option>
                        <option value="FOMO">FOMO</option>
                        <option value="Tilted">Tilted</option>
                      </select>
                    </div>
                    <textarea
                      rows={3}
                      value={dailyNoteDraft}
                      onChange={(e) => setDailyNoteDraft(e.target.value)}
                      placeholder="What went well today? What should be improved tomorrow?"
                      className="w-full p-2 rounded bg-[#131722] border border-[#2a2e39] text-[12px] text-white outline-none focus:border-[#2962ff]"
                    />
                    <button
                      onClick={handleSaveDailyNote}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#089981] hover:bg-[#07826e] text-white text-[11.5px] font-semibold"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Save Daily Note
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
