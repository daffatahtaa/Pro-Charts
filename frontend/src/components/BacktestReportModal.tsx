import React, { useEffect, useState } from 'react';
import { X, BarChart3, RefreshCw, RotateCcw, Sparkles } from 'lucide-react';
import { useChartStore } from '../store/useChartStore';

export const BacktestReportModal: React.FC = () => {
  const {
    backtestModalOpen,
    setBacktestModalOpen,
    paperAccount,
    latestAnalytics,
    syncPaperBacktest,
    updatePaperSessionMeta,
    resetPaperAccount,
    showToast,
  } = useChartStore();

  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (backtestModalOpen) {
      syncPaperBacktest();
    }
  }, [backtestModalOpen, syncPaperBacktest]);

  if (!backtestModalOpen) return null;

  const a = latestAnalytics;
  const closedTrades = paperAccount.trades.filter((t) =>
    ['CLOSED_TP', 'CLOSED_SL', 'CLOSED_MANUAL'].includes(t.status)
  );

  const isProfitable = a && a.profit_factor >= 1.3 && a.expectancy_r > 0;

  const handleManualSync = async () => {
    setSyncing(true);
    const res = await syncPaperBacktest();
    setSyncing(false);
    if (res) {
      showToast('success', 'Synced to backtests/latest_backtest.json & latest_report.md for AI review!');
    }
  };

  // Build SVG Equity Curve polyline
  const curve = a?.equity_curve || [{ trade_num: 0, balance: paperAccount.startingBalance }];
  const minBal = Math.min(...curve.map((c) => c.balance), paperAccount.startingBalance);
  const maxBal = Math.max(...curve.map((c) => c.balance), paperAccount.startingBalance);
  const span = Math.max(1, maxBal - minBal);
  const svgW = 680;
  const svgH = 140;
  const pts = curve
    .map((pt, i) => {
      const x = curve.length > 1 ? (i / (curve.length - 1)) * (svgW - 20) + 10 : svgW / 2;
      const y = svgH - 12 - ((pt.balance - minBal) / span) * (svgH - 24);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4"
      onClick={() => setBacktestModalOpen(false)}
    >
      <div
        className="w-full max-w-[820px] bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-tv overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#2a2e39] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#2962ff]" />
            <h2 className="text-[15px] font-semibold text-[#d1d4dc]">
              Strategy Backtest Telemetry & AI Report
            </h2>
          </div>
          <button
            onClick={() => setBacktestModalOpen(false)}
            className="p-1 rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Session Name & Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <input
              type="text"
              value={paperAccount.name}
              onChange={(e) => updatePaperSessionMeta(e.target.value, paperAccount.notes)}
              placeholder="Strategy Session Name (e.g. XAUUSD ICT London Sweep)"
              className="px-3 py-1.5 rounded bg-[#131722] border border-[#2a2e39] text-[12.5px] text-white outline-none focus:border-[#2962ff]"
            />
            <input
              type="text"
              value={paperAccount.notes}
              onChange={(e) => updatePaperSessionMeta(paperAccount.name, e.target.value)}
              placeholder="Rules / Notes for AI Reviewer..."
              className="px-3 py-1.5 rounded bg-[#131722] border border-[#2a2e39] text-[12.5px] text-[#d1d4dc] outline-none focus:border-[#2962ff]"
            />
          </div>

          {/* Verdict Banner */}
          <div
            className={`px-4 py-2.5 rounded border flex items-center justify-between ${
              isProfitable
                ? 'bg-[#089981]/15 border-[#089981]/50 text-[#089981]'
                : 'bg-[#f59e0b]/15 border-[#f59e0b]/50 text-[#f59e0b]'
            }`}
          >
            <div className="font-semibold text-[13px]">
              Verdict: {a?.verdict || 'NO CLOSED TRADES YET'}
            </div>
            <div className="text-[11px] font-mono-num">
              AI File: backtests/latest_report.md
            </div>
          </div>

          {/* 6 KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              {
                label: 'Net Profit',
                val: `${(a?.net_profit ?? 0) >= 0 ? '+' : '-'}$${Math.abs(a?.net_profit ?? 0).toFixed(2)}`,
                sub: `${(a?.net_profit_pct ?? 0) >= 0 ? '+' : ''}${(a?.net_profit_pct ?? 0).toFixed(2)}%`,
                pos: (a?.net_profit ?? 0) >= 0,
              },
              {
                label: 'Win Rate',
                val: `${(a?.win_rate ?? 0).toFixed(1)}%`,
                sub: `${a?.wins ?? 0}W / ${a?.losses ?? 0}L`,
                pos: (a?.win_rate ?? 0) >= 50,
              },
              {
                label: 'Profit Factor',
                val: (a?.profit_factor ?? 0).toFixed(2),
                sub: 'Gross P / L',
                pos: (a?.profit_factor ?? 0) >= 1.3,
              },
              {
                label: 'Expectancy',
                val: `${(a?.expectancy_r ?? 0) >= 0 ? '+' : ''}${(a?.expectancy_r ?? 0).toFixed(2)}R`,
                sub: `$${(a?.expectancy_money ?? 0).toFixed(2)}/trade`,
                pos: (a?.expectancy_r ?? 0) > 0,
              },
              {
                label: 'Max Drawdown',
                val: `${(a?.max_drawdown_pct ?? 0).toFixed(2)}%`,
                sub: `$${(a?.max_drawdown_money ?? 0).toFixed(2)}`,
                pos: (a?.max_drawdown_pct ?? 0) < 10,
              },
              {
                label: 'Total Trades',
                val: String(a?.total_trades ?? closedTrades.length),
                sub: `Avg ${a?.mfe_mae_diagnostics?.avg_bars_held ?? 0} bars`,
                pos: true,
              },
            ].map((k) => (
              <div
                key={k.label}
                className="p-2.5 rounded bg-[#131722] border border-[#2a2e39]"
              >
                <div className="text-[10px] uppercase tracking-wider text-[#787b86]">
                  {k.label}
                </div>
                <div
                  className={`font-mono-num text-[14px] font-bold mt-0.5 ${
                    k.pos ? 'text-[#089981]' : 'text-[#f23645]'
                  }`}
                >
                  {k.val}
                </div>
                <div className="text-[10.5px] font-mono-num text-[#787b86]">{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Equity Curve SVG */}
          <div className="p-3 rounded bg-[#131722] border border-[#2a2e39]">
            <div className="text-[11px] uppercase tracking-wider text-[#787b86] mb-2">
              Equity Curve (${paperAccount.startingBalance.toLocaleString()} -&gt; $
              {(a?.final_balance ?? paperAccount.balance).toLocaleString()})
            </div>
            <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-[135px]">
              <line
                x1="10"
                y1={svgH - 12}
                x2={svgW - 10}
                y2={svgH - 12}
                stroke="#2a2e39"
                strokeWidth="1"
              />
              {curve.length > 1 ? (
                <polyline
                  fill="none"
                  stroke={
                    (a?.net_profit ?? 0) >= 0 ? '#089981' : '#f23645'
                  }
                  strokeWidth="2.5"
                  points={pts}
                />
              ) : (
                <text
                  x={svgW / 2}
                  y={svgH / 2}
                  fill="#787b86"
                  fontSize="12"
                  textAnchor="middle"
                >
                  Close at least 1 paper trade during Bar Replay to plot equity curve
                </text>
              )}
            </svg>
          </div>

          {/* Session & Strategy Tag Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 rounded bg-[#131722] border border-[#2a2e39]">
              <div className="text-[11px] uppercase tracking-wider text-[#787b86] mb-2">
                Session Breakdown
              </div>
              {a && Object.keys(a.session_breakdown).length > 0 ? (
                <div className="space-y-1.5 text-[11.5px] font-mono-num">
                  {Object.entries(a.session_breakdown).map(([sess, s]) => (
                    <div key={sess} className="flex items-center justify-between">
                      <span className="text-[#d1d4dc] font-sans font-medium">{sess}</span>
                      <span>
                        {s.trades}t · {s.win_rate}% ·{' '}
                        <span className={s.net_r >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}>
                          {s.net_r >= 0 ? '+' : ''}
                          {s.net_r}R
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11.5px] text-[#787b86]">No closed trades yet.</div>
              )}
            </div>

            <div className="p-3 rounded bg-[#131722] border border-[#2a2e39]">
              <div className="text-[11px] uppercase tracking-wider text-[#787b86] mb-2">
                Setup Label / Strategy Tag Breakdown
              </div>
              {a && Object.keys(a.tag_breakdown).length > 0 ? (
                <div className="space-y-1.5 text-[11.5px] font-mono-num">
                  {Object.entries(a.tag_breakdown).map(([tag, s]) => (
                    <div key={tag} className="flex items-center justify-between">
                      <span className="px-1.5 py-0.5 rounded bg-[#f59e0b]/15 text-[#f59e0b] font-sans text-[11px]">
                        {tag}
                      </span>
                      <span>
                        {s.trades}t · {s.win_rate}% ·{' '}
                        <span className={s.net_r >= 0 ? 'text-[#089981]' : 'text-[#f23645]'}>
                          {s.net_r >= 0 ? '+' : ''}
                          {s.net_r}R
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11.5px] text-[#787b86]">
                  Label your R:R boxes (OB, FVG, BOS) to see winrate per setup!
                </div>
              )}
            </div>
          </div>

          {/* Trade Log Table (With MFE / MAE) */}
          <div className="rounded bg-[#131722] border border-[#2a2e39] overflow-x-auto max-h-52">
            <table className="w-full text-left border-collapse text-[11px] font-mono-num">
              <thead className="bg-[#1e222d] text-[#787b86] sticky top-0 border-b border-[#2a2e39]">
                <tr>
                  <th className="py-1.5 px-2">Side</th>
                  <th className="py-1.5 px-2">Session</th>
                  <th className="py-1.5 px-2">Tag</th>
                  <th className="py-1.5 px-2 text-right">Entry</th>
                  <th className="py-1.5 px-2 text-right">Exit</th>
                  <th className="py-1.5 px-2 text-right">Result</th>
                  <th className="py-1.5 px-2 text-right">R</th>
                  <th className="py-1.5 px-2 text-right">MFE</th>
                  <th className="py-1.5 px-2 text-right">MAE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2e39]/40">
                {closedTrades.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-[#787b86] font-sans">
                      No closed paper trades yet.
                    </td>
                  </tr>
                ) : (
                  closedTrades.map((t) => (
                    <tr key={t.id} className="hover:bg-[#1e222d]/60">
                      <td
                        className={`py-1.5 px-2 font-sans font-semibold ${
                          t.side === 'BUY' ? 'text-[#089981]' : 'text-[#f23645]'
                        }`}
                      >
                        {t.side}
                      </td>
                      <td className="py-1.5 px-2 text-[#787b86]">{t.trading_session}</td>
                      <td className="py-1.5 px-2 text-[#f59e0b] font-sans">
                        {t.strategy_tag || '-'}
                      </td>
                      <td className="py-1.5 px-2 text-right text-[#d1d4dc]">{t.entry_price}</td>
                      <td className="py-1.5 px-2 text-right text-[#d1d4dc]">
                        {t.exit_price ?? '-'}
                      </td>
                      <td className="py-1.5 px-2 text-right text-[#787b86]">{t.status}</td>
                      <td
                        className={`py-1.5 px-2 text-right font-semibold ${
                          t.realized_r >= 0 ? 'text-[#089981]' : 'text-[#f23645]'
                        }`}
                      >
                        {t.realized_r >= 0 ? '+' : ''}
                        {t.realized_r.toFixed(2)}R
                      </td>
                      <td className="py-1.5 px-2 text-right text-[#089981]">
                        {t.mfe_pips.toFixed(1)}p
                      </td>
                      <td className="py-1.5 px-2 text-right text-[#f23645]">
                        {t.mae_pips.toFixed(1)}p
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-[#2a2e39] flex items-center justify-between bg-[#131722]/40">
          <button
            onClick={() => resetPaperAccount()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#2a2e39] hover:bg-[#f23645]/15 hover:text-[#f23645] text-[#d1d4dc] text-[12px] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Paper Account</span>
          </button>

          <button
            onClick={handleManualSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-[#2962ff] hover:bg-[#1e53e5] disabled:opacity-50 text-white text-[12px] font-semibold transition-colors"
          >
            {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>Sync for AI Review</span>
          </button>
        </div>
      </div>
    </div>
  );
};
