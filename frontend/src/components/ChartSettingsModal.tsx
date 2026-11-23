import React, { useState } from 'react';
import { X, RotateCcw, Palette, Layers, Sliders, Newspaper } from 'lucide-react';
import { useChartStore } from '../store/useChartStore';
import {
  ChartThemeSettings,
  DEFAULT_CHART_SETTINGS,
  NewsImpactLevel,
} from '../types/chart';

const NEWS_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];

const THEME_PRESETS: Array<{
  name: string;
  desc: string;
  swatch: [string, string, string];
  settings: Partial<ChartThemeSettings>;
}> = [
  {
    name: 'TradingView Default',
    desc: 'Classic emerald & crimson on dark navy',
    swatch: ['#089981', '#f23645', '#131722'],
    settings: { ...DEFAULT_CHART_SETTINGS },
  },
  {
    name: 'Classic ICT / Monochrome',
    desc: 'Clean white bullish & slate bearish on deep obsidian',
    swatch: ['#ffffff', '#4b5563', '#0b0e14'],
    settings: {
      bullBodyColor: '#ffffff',
      bearBodyColor: '#4b5563',
      bullBorderColor: '#ffffff',
      bearBorderColor: '#9ca3af',
      bullWickColor: '#d1d5db',
      bearWickColor: '#9ca3af',
      canvasBgColor: '#0b0e14',
      gridVertColor: '#161b26',
      gridHorizColor: '#161b26',
      crosshairColor: '#9ca3af',
    },
  },
  {
    name: 'Neon Cyber',
    desc: 'Electric cyan & magenta on midnight slate',
    swatch: ['#00f5d4', '#ff2a85', '#0d1117'],
    settings: {
      bullBodyColor: '#00f5d4',
      bearBodyColor: '#ff2a85',
      bullBorderColor: '#00f5d4',
      bearBorderColor: '#ff2a85',
      bullWickColor: '#00f5d4',
      bearWickColor: '#ff2a85',
      canvasBgColor: '#0d1117',
      gridVertColor: '#1a2233',
      gridHorizColor: '#1a2233',
      crosshairColor: '#38bdf8',
    },
  },
  {
    name: 'Gold & Onyx',
    desc: 'Amber gold & ruby on matte onyx',
    swatch: ['#f59e0b', '#ef4444', '#111318'],
    settings: {
      bullBodyColor: '#f59e0b',
      bearBodyColor: '#ef4444',
      bullBorderColor: '#fbbf24',
      bearBorderColor: '#ef4444',
      bullWickColor: '#f59e0b',
      bearWickColor: '#ef4444',
      canvasBgColor: '#111318',
      gridVertColor: '#1d2028',
      gridHorizColor: '#1d2028',
      crosshairColor: '#a1a1aa',
    },
  },
];

export const ChartSettingsModal: React.FC = () => {
  const {
    symbol,
    chartSettingsModalOpen,
    setChartSettingsModalOpen,
    chartSettings,
    updateChartSettings,
    resetChartSettings,
    chartNewsLabel,
  } = useChartStore();

  const [tab, setTab] = useState<'symbol' | 'canvas' | 'events' | 'presets'>('symbol');

  if (!chartSettingsModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={() => setChartSettingsModalOpen(false)}
    >
      <div
        className="w-full max-w-[600px] bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-tv overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#2a2e39] flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[#d1d4dc]">Chart Settings</h2>
          <button
            onClick={() => setChartSettingsModalOpen(false)}
            className="p-1 rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body with Left Sidebar Tabs */}
        <div className="flex min-h-[340px]">
          <div className="w-40 border-r border-[#2a2e39] bg-[#131722]/40 p-2 flex flex-col gap-1">
            <button
              onClick={() => setTab('symbol')}
              className={`flex items-center gap-2 px-3 py-2 rounded text-[12px] font-medium transition-colors ${
                tab === 'symbol'
                  ? 'bg-[#2962ff]/15 text-[#2962ff]'
                  : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Symbol</span>
            </button>
            <button
              onClick={() => setTab('canvas')}
              className={`flex items-center gap-2 px-3 py-2 rounded text-[12px] font-medium transition-colors ${
                tab === 'canvas'
                  ? 'bg-[#2962ff]/15 text-[#2962ff]'
                  : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Canvas</span>
            </button>
            <button
              onClick={() => setTab('events')}
              className={`flex items-center gap-2 px-3 py-2 rounded text-[12px] font-medium transition-colors ${
                tab === 'events'
                  ? 'bg-[#2962ff]/15 text-[#2962ff]'
                  : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
              }`}
            >
              <Newspaper className="w-3.5 h-3.5" />
              <span>Events / News</span>
            </button>
            <button
              onClick={() => setTab('presets')}
              className={`flex items-center gap-2 px-3 py-2 rounded text-[12px] font-medium transition-colors ${
                tab === 'presets'
                  ? 'bg-[#2962ff]/15 text-[#2962ff]'
                  : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Scales & Presets</span>
            </button>
          </div>

          <div className="flex-1 p-4 space-y-4 overflow-y-auto max-h-[380px]">
            {tab === 'symbol' && (
              <>
                <div className="text-[11px] uppercase tracking-wider text-[#787b86]">
                  Candles Appearance
                </div>

                {/* Body */}
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] text-[#d1d4dc]">Body</span>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-[11px] text-[#787b86]">
                      Up
                      <input
                        type="color"
                        value={chartSettings.bullBodyColor}
                        onChange={(e) =>
                          updateChartSettings({ bullBodyColor: e.target.value })
                        }
                        className="w-7 h-6 rounded border border-[#2a2e39] bg-transparent cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] text-[#787b86]">
                      Down
                      <input
                        type="color"
                        value={chartSettings.bearBodyColor}
                        onChange={(e) =>
                          updateChartSettings({ bearBodyColor: e.target.value })
                        }
                        className="w-7 h-6 rounded border border-[#2a2e39] bg-transparent cursor-pointer"
                      />
                    </label>
                  </div>
                </div>

                {/* Borders */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-[12.5px] text-[#d1d4dc] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={chartSettings.showBorders}
                      onChange={(e) =>
                        updateChartSettings({ showBorders: e.target.checked })
                      }
                      className="accent-[#2962ff]"
                    />
                    Borders
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      disabled={!chartSettings.showBorders}
                      value={chartSettings.bullBorderColor}
                      onChange={(e) =>
                        updateChartSettings({ bullBorderColor: e.target.value })
                      }
                      className="w-7 h-6 rounded border border-[#2a2e39] bg-transparent cursor-pointer disabled:opacity-40"
                    />
                    <input
                      type="color"
                      disabled={!chartSettings.showBorders}
                      value={chartSettings.bearBorderColor}
                      onChange={(e) =>
                        updateChartSettings({ bearBorderColor: e.target.value })
                      }
                      className="w-7 h-6 rounded border border-[#2a2e39] bg-transparent cursor-pointer disabled:opacity-40"
                    />
                  </div>
                </div>

                {/* Wicks */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-[12.5px] text-[#d1d4dc] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={chartSettings.showWicks}
                      onChange={(e) =>
                        updateChartSettings({ showWicks: e.target.checked })
                      }
                      className="accent-[#2962ff]"
                    />
                    Wick
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      disabled={!chartSettings.showWicks}
                      value={chartSettings.bullWickColor}
                      onChange={(e) =>
                        updateChartSettings({ bullWickColor: e.target.value })
                      }
                      className="w-7 h-6 rounded border border-[#2a2e39] bg-transparent cursor-pointer disabled:opacity-40"
                    />
                    <input
                      type="color"
                      disabled={!chartSettings.showWicks}
                      value={chartSettings.bearWickColor}
                      onChange={(e) =>
                        updateChartSettings({ bearWickColor: e.target.value })
                      }
                      className="w-7 h-6 rounded border border-[#2a2e39] bg-transparent cursor-pointer disabled:opacity-40"
                    />
                  </div>
                </div>

                <div className="h-[1px] bg-[#2a2e39]" />

                {/* Last Price Line */}
                <label className="flex items-center gap-2 text-[12.5px] text-[#d1d4dc] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chartSettings.showLastPriceLine}
                    onChange={(e) =>
                      updateChartSettings({ showLastPriceLine: e.target.checked })
                    }
                    className="accent-[#2962ff]"
                  />
                  Show Last Price Line
                </label>

                <label className="flex items-center gap-2 text-[12.5px] text-[#d1d4dc] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chartSettings.showCountdown}
                    onChange={(e) =>
                      updateChartSettings({ showCountdown: e.target.checked })
                    }
                    className="accent-[#2962ff]"
                  />
                  Countdown to Bar Close (on Y-Axis)
                </label>

                <label className="flex items-center gap-2 text-[12.5px] text-[#d1d4dc] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chartSettings.showSymbolOnPriceLabel}
                    onChange={(e) =>
                      updateChartSettings({ showSymbolOnPriceLabel: e.target.checked })
                    }
                    className="accent-[#2962ff]"
                  />
                  Show Symbol Name on Price Label
                </label>

                <label className="flex items-center gap-2 text-[12.5px] text-[#d1d4dc] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chartSettings.showBidAskLabels}
                    onChange={(e) =>
                      updateChartSettings({ showBidAskLabels: e.target.checked })
                    }
                    className="accent-[#2962ff]"
                  />
                  Show Bid / Ask Text Labels
                </label>

                {/* Bid & Ask Lines */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-[12.5px] text-[#d1d4dc] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={chartSettings.showBidAskLines}
                      onChange={(e) =>
                        updateChartSettings({ showBidAskLines: e.target.checked })
                      }
                      className="accent-[#2962ff]"
                    />
                    Bid &amp; Ask Lines + Labels
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-[10.5px] text-[#787b86]">
                      Bid
                      <input
                        type="color"
                        disabled={!chartSettings.showBidAskLines}
                        value={chartSettings.bidLineColor}
                        onChange={(e) =>
                          updateChartSettings({ bidLineColor: e.target.value })
                        }
                        className="w-6 h-5 rounded border border-[#2a2e39] bg-transparent cursor-pointer disabled:opacity-40"
                      />
                    </label>
                    <label className="flex items-center gap-1 text-[10.5px] text-[#787b86]">
                      Ask
                      <input
                        type="color"
                        disabled={!chartSettings.showBidAskLines}
                        value={chartSettings.askLineColor}
                        onChange={(e) =>
                          updateChartSettings({ askLineColor: e.target.value })
                        }
                        className="w-6 h-5 rounded border border-[#2a2e39] bg-transparent cursor-pointer disabled:opacity-40"
                      />
                    </label>
                  </div>
                </div>

                {/* High / Low Marks & Lines */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-[12.5px] text-[#d1d4dc] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={chartSettings.showHighLowMarks}
                      onChange={(e) =>
                        updateChartSettings({ showHighLowMarks: e.target.checked })
                      }
                      className="accent-[#2962ff]"
                    />
                    High &amp; Low Price Labels
                  </label>
                  <input
                    type="color"
                    value={chartSettings.highLowColor}
                    onChange={(e) =>
                      updateChartSettings({ highLowColor: e.target.value })
                    }
                    className="w-6 h-5 rounded border border-[#2a2e39] bg-transparent cursor-pointer"
                  />
                </div>

                <label className="flex items-center gap-2 text-[12.5px] text-[#d1d4dc] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chartSettings.showHighLowLines}
                    onChange={(e) =>
                      updateChartSettings({ showHighLowLines: e.target.checked })
                    }
                    className="accent-[#2962ff]"
                  />
                  High &amp; Low Price Lines (Visible Range)
                </label>

                <label className="flex items-center gap-2 text-[12.5px] text-[#d1d4dc] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chartSettings.showPositionLines}
                    onChange={(e) =>
                      updateChartSettings({ showPositionLines: e.target.checked })
                    }
                    className="accent-[#2962ff]"
                  />
                  Show Open Positions &amp; SL/TP Lines
                </label>

                {/* Running-Trade Line Style, Opacity & Color Settings */}
                <div
                  className={`ml-5 pl-3 border-l border-[#2a2e39] space-y-2.5 transition-opacity ${
                    chartSettings.showPositionLines ? 'opacity-100' : 'opacity-45 pointer-events-none'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11.5px] text-[#787b86]">Line Type &amp; Width</span>
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center rounded bg-[#131722] border border-[#2a2e39] p-0.5">
                        {(['solid', 'dashed', 'dotted'] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => updateChartSettings({ positionLineStyle: st })}
                            className={`px-2 py-0.5 rounded text-[10.5px] capitalize transition-colors ${
                              (chartSettings.positionLineStyle || 'solid') === st
                                ? 'bg-[#2962ff] text-white font-semibold'
                                : 'text-[#787b86] hover:text-[#d1d4dc]'
                            }`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                      <select
                        value={chartSettings.positionLineWidth || 1}
                        onChange={(e) =>
                          updateChartSettings({ positionLineWidth: Number(e.target.value) })
                        }
                        title="Running-trade line width"
                        className="px-1.5 py-0.5 rounded bg-[#131722] border border-[#2a2e39] text-[11px] font-mono-num text-[#d1d4dc] outline-none"
                      >
                        <option value={1}>1px</option>
                        <option value={2}>2px</option>
                        <option value={3}>3px</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11.5px] text-[#787b86]">Line Opacity</span>
                    <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                      <input
                        type="range"
                        min={10}
                        max={100}
                        step={5}
                        value={Math.round((chartSettings.positionLineOpacity ?? 1) * 100)}
                        onChange={(e) =>
                          updateChartSettings({
                            positionLineOpacity: Number(e.target.value) / 100,
                          })
                        }
                        className="flex-1 accent-[#2962ff] cursor-pointer"
                      />
                      <span className="w-9 text-right text-[11px] font-mono-num text-[#d1d4dc]">
                        {Math.round((chartSettings.positionLineOpacity ?? 1) * 100)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11.5px] text-[#787b86]">Entry Color Mode</span>
                    <div className="flex items-center rounded bg-[#131722] border border-[#2a2e39] p-0.5">
                      <button
                        type="button"
                        onClick={() => updateChartSettings({ positionColorMode: 'pnl' })}
                        className={`px-2 py-0.5 rounded text-[10.5px] transition-colors ${
                          (chartSettings.positionColorMode || 'pnl') === 'pnl'
                            ? 'bg-[#2962ff] text-white font-semibold'
                            : 'text-[#787b86] hover:text-[#d1d4dc]'
                        }`}
                      >
                        Auto P&amp;L
                      </button>
                      <button
                        type="button"
                        onClick={() => updateChartSettings({ positionColorMode: 'custom' })}
                        className={`px-2 py-0.5 rounded text-[10.5px] transition-colors ${
                          chartSettings.positionColorMode === 'custom'
                            ? 'bg-[#2962ff] text-white font-semibold'
                            : 'text-[#787b86] hover:text-[#d1d4dc]'
                        }`}
                      >
                        Single Color
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {(chartSettings.positionColorMode || 'pnl') === 'pnl' ? (
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-[11px] text-[#787b86]">
                          Profit
                          <input
                            type="color"
                            value={chartSettings.positionProfitColor || '#089981'}
                            onChange={(e) =>
                              updateChartSettings({ positionProfitColor: e.target.value })
                            }
                            className="w-6 h-5 rounded border border-[#2a2e39] bg-transparent cursor-pointer"
                          />
                        </label>
                        <label className="flex items-center gap-1.5 text-[11px] text-[#787b86]">
                          Loss
                          <input
                            type="color"
                            value={chartSettings.positionLossColor || '#f23645'}
                            onChange={(e) =>
                              updateChartSettings({ positionLossColor: e.target.value })
                            }
                            className="w-6 h-5 rounded border border-[#2a2e39] bg-transparent cursor-pointer"
                          />
                        </label>
                      </div>
                    ) : (
                      <label className="flex items-center gap-1.5 text-[11px] text-[#787b86]">
                        Position Line
                        <input
                          type="color"
                          value={chartSettings.positionCustomColor || '#2962ff'}
                          onChange={(e) =>
                            updateChartSettings({ positionCustomColor: e.target.value })
                          }
                          className="w-6 h-5 rounded border border-[#2a2e39] bg-transparent cursor-pointer"
                        />
                      </label>
                    )}

                    <div className="flex items-center gap-2.5">
                      <label className="flex items-center gap-1 text-[11px] text-[#787b86]">
                        Pending
                        <input
                          type="color"
                          value={chartSettings.pendingOrderLineColor || '#2962ff'}
                          onChange={(e) =>
                            updateChartSettings({ pendingOrderLineColor: e.target.value })
                          }
                          className="w-5 h-5 rounded border border-[#2a2e39] bg-transparent cursor-pointer"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-[#787b86]">
                        SL
                        <input
                          type="color"
                          value={chartSettings.slLineColor || '#f23645'}
                          onChange={(e) =>
                            updateChartSettings({ slLineColor: e.target.value })
                          }
                          className="w-5 h-5 rounded border border-[#2a2e39] bg-transparent cursor-pointer"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-[11px] text-[#787b86]">
                        TP
                        <input
                          type="color"
                          value={chartSettings.tpLineColor || '#089981'}
                          onChange={(e) =>
                            updateChartSettings({ tpLineColor: e.target.value })
                          }
                          className="w-5 h-5 rounded border border-[#2a2e39] bg-transparent cursor-pointer"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Live Preview */}
                  <div className="px-2.5 py-2 rounded bg-[#131722] border border-[#2a2e39] flex items-center gap-2">
                    <span className="text-[10px] text-[#787b86] shrink-0">Preview</span>
                    <div
                      className="flex-1"
                      style={{
                        borderTop: `${chartSettings.positionLineWidth || 1}px ${
                          chartSettings.positionLineStyle || 'solid'
                        } ${
                          chartSettings.positionColorMode === 'custom'
                            ? chartSettings.positionCustomColor || '#2962ff'
                            : chartSettings.positionProfitColor || '#089981'
                        }`,
                        opacity: chartSettings.positionLineOpacity ?? 1,
                      }}
                    />
                    <span
                      className="px-1.5 py-0.5 rounded text-[9.5px] font-mono-num font-bold text-white"
                      style={{
                        backgroundColor:
                          chartSettings.positionColorMode === 'custom'
                            ? chartSettings.positionCustomColor || '#2962ff'
                            : chartSettings.positionProfitColor || '#089981',
                      }}
                    >
                      BUY 0.10 | +$24.50
                    </span>
                  </div>
                </div>
              </>
            )}

            {tab === 'canvas' && (
              <>
                <div className="text-[11px] uppercase tracking-wider text-[#787b86]">
                  Canvas & Grid
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] text-[#d1d4dc]">Background Color</span>
                  <input
                    type="color"
                    value={chartSettings.canvasBgColor}
                    onChange={(e) =>
                      updateChartSettings({ canvasBgColor: e.target.value })
                    }
                    className="w-8 h-6 rounded border border-[#2a2e39] bg-transparent cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-[12.5px] text-[#d1d4dc] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={chartSettings.showGridVert}
                      onChange={(e) =>
                        updateChartSettings({ showGridVert: e.target.checked })
                      }
                      className="accent-[#2962ff]"
                    />
                    Vertical Grid Lines
                  </label>
                  <input
                    type="color"
                    disabled={!chartSettings.showGridVert}
                    value={chartSettings.gridVertColor}
                    onChange={(e) =>
                      updateChartSettings({ gridVertColor: e.target.value })
                    }
                    className="w-8 h-6 rounded border border-[#2a2e39] bg-transparent cursor-pointer disabled:opacity-40"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-[12.5px] text-[#d1d4dc] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={chartSettings.showGridHoriz}
                      onChange={(e) =>
                        updateChartSettings({ showGridHoriz: e.target.checked })
                      }
                      className="accent-[#2962ff]"
                    />
                    Horizontal Grid Lines
                  </label>
                  <input
                    type="color"
                    disabled={!chartSettings.showGridHoriz}
                    value={chartSettings.gridHorizColor}
                    onChange={(e) =>
                      updateChartSettings({ gridHorizColor: e.target.value })
                    }
                    className="w-8 h-6 rounded border border-[#2a2e39] bg-transparent cursor-pointer disabled:opacity-40"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] text-[#d1d4dc]">Crosshair Color</span>
                  <input
                    type="color"
                    value={chartSettings.crosshairColor}
                    onChange={(e) =>
                      updateChartSettings({ crosshairColor: e.target.value })
                    }
                    className="w-8 h-6 rounded border border-[#2a2e39] bg-transparent cursor-pointer"
                  />
                </div>

                <div className="h-[1px] bg-[#2a2e39]" />

                <label className="flex items-center gap-2 text-[12.5px] text-[#d1d4dc] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chartSettings.showWatermark}
                    onChange={(e) =>
                      updateChartSettings({ showWatermark: e.target.checked })
                    }
                    className="accent-[#2962ff]"
                  />
                  Show Symbol Watermark
                </label>

                <div className="h-[1px] bg-[#2a2e39]" />

                <div className="text-[11px] uppercase tracking-wider text-[#787b86]">
                  Status Line (Top-Left Legend)
                </div>

                <label className="flex items-center gap-2 text-[12.5px] text-[#d1d4dc] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chartSettings.showOhlcValues}
                    onChange={(e) =>
                      updateChartSettings({ showOhlcValues: e.target.checked })
                    }
                    className="accent-[#2962ff]"
                  />
                  OHLC Values (O H L C)
                </label>

                <label className="flex items-center gap-2 text-[12.5px] text-[#d1d4dc] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chartSettings.showBarChange}
                    onChange={(e) =>
                      updateChartSettings({ showBarChange: e.target.checked })
                    }
                    className="accent-[#2962ff]"
                  />
                  Bar Change Values (+Chg / +%)
                </label>

                <label className="flex items-center gap-2 text-[12.5px] text-[#d1d4dc] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chartSettings.showVolumeValue}
                    onChange={(e) =>
                      updateChartSettings({ showVolumeValue: e.target.checked })
                    }
                    className="accent-[#2962ff]"
                  />
                  Volume Value (Vol)
                </label>

                <label className="flex items-center gap-2 text-[12.5px] text-[#d1d4dc] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chartSettings.showQuickTradeButtons}
                    onChange={(e) =>
                      updateChartSettings({ showQuickTradeButtons: e.target.checked })
                    }
                    className="accent-[#2962ff]"
                  />
                  One-Click Buy / Sell Buttons
                </label>
              </>
            )}

            {tab === 'events' && (
              <>
                <div className="text-[11px] uppercase tracking-wider text-[#787b86]">
                  Economic Events &amp; Pair-Correlated News
                </div>

                <label className="flex items-center gap-2 text-[12.5px] text-[#d1d4dc] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chartSettings.showChartNews !== false}
                    onChange={(e) =>
                      updateChartSettings({ showChartNews: e.target.checked })
                    }
                    className="accent-[#2962ff]"
                  />
                  Show Economic Events on Chart Bottom
                </label>

                <div
                  className={`space-y-3.5 transition-opacity ${
                    chartSettings.showChartNews !== false
                      ? 'opacity-100'
                      : 'opacity-45 pointer-events-none'
                  }`}
                >
                  {/* Impact Importance Multi-Select */}
                  <div className="space-y-1.5">
                    <span className="text-[11.5px] text-[#787b86]">Impact / Importance Filter</span>
                    <div className="flex items-center gap-2">
                      {(
                        [
                          { id: 'high', label: 'High', color: '#f23645' },
                          { id: 'medium', label: 'Medium', color: '#f59e0b' },
                          { id: 'low', label: 'Low', color: '#eab308' },
                        ] as Array<{ id: NewsImpactLevel; label: string; color: string }>
                      ).map((imp) => {
                        const activeList = chartSettings.newsImpacts || ['high', 'medium'];
                        const checked = activeList.includes(imp.id);
                        return (
                          <button
                            key={imp.id}
                            type="button"
                            onClick={() => {
                              const next = checked
                                ? activeList.filter((i) => i !== imp.id)
                                : [...activeList, imp.id];
                              if (next.length > 0) {
                                updateChartSettings({ newsImpacts: next });
                              }
                            }}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11.5px] font-medium transition-colors cursor-pointer ${
                              checked
                                ? 'bg-[#131722] border-[#2962ff] text-white'
                                : 'bg-[#131722]/40 border-[#2a2e39] text-[#787b86]'
                            }`}
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: imp.color }}
                            />
                            <span>{imp.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Correlation Scope */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11.5px] text-[#787b86]">Correlation Scope</span>
                      {chartNewsLabel && (
                        <span className="text-[10.5px] font-mono-num text-[#2962ff]">
                          Active: {symbol} → {chartNewsLabel}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'correlated', label: 'Active Pair' },
                          { id: 'all', label: 'All Majors' },
                          { id: 'custom', label: 'Custom' },
                        ] as const
                      ).map((sc) => (
                        <button
                          key={sc.id}
                          type="button"
                          onClick={() => updateChartSettings({ newsScope: sc.id })}
                          className={`py-1.5 rounded border text-[11.5px] font-medium transition-colors cursor-pointer ${
                            (chartSettings.newsScope || 'correlated') === sc.id
                              ? 'bg-[#2962ff] border-[#2962ff] text-white'
                              : 'bg-[#131722] border-[#2a2e39] text-[#d1d4dc] hover:border-[#2962ff]/60'
                          }`}
                        >
                          {sc.label}
                        </button>
                      ))}
                    </div>

                    {chartSettings.newsScope === 'custom' && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {NEWS_CURRENCIES.map((code) => {
                          const list = chartSettings.newsCustomCurrencies || ['USD', 'EUR', 'GBP', 'JPY'];
                          const active = list.includes(code);
                          return (
                            <button
                              key={code}
                              type="button"
                              onClick={() => {
                                const next = active
                                  ? list.filter((c) => c !== code)
                                  : [...list, code];
                                if (next.length > 0) {
                                  updateChartSettings({ newsCustomCurrencies: next });
                                }
                              }}
                              className={`px-2 py-0.5 rounded border text-[11px] font-mono-num font-semibold cursor-pointer ${
                                active
                                  ? 'bg-[#2962ff]/20 border-[#2962ff] text-[#2962ff]'
                                  : 'bg-[#131722] border-[#2a2e39] text-[#787b86]'
                              }`}
                            >
                              {code}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Event Types */}
                  <div className="space-y-1.5">
                    <span className="text-[11.5px] text-[#787b86]">Event Types</span>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 text-[12px] text-[#d1d4dc] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={chartSettings.newsShowCalendar !== false}
                          onChange={(e) =>
                            updateChartSettings({ newsShowCalendar: e.target.checked })
                          }
                          className="accent-[#2962ff]"
                        />
                        Economic Calendar (Actual / Forecast / Previous)
                      </label>
                      <label className="flex items-center gap-2 text-[12px] text-[#d1d4dc] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(chartSettings.newsShowHeadlines)}
                          onChange={(e) =>
                            updateChartSettings({ newsShowHeadlines: e.target.checked })
                          }
                          className="accent-[#2962ff]"
                        />
                        Correlated Market News Headlines
                      </label>
                    </div>
                  </div>

                  {/* Time Range Mode */}
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[#d1d4dc]">Time Range Display</span>
                    <div className="flex items-center rounded bg-[#131722] border border-[#2a2e39] p-0.5">
                      {(
                        [
                          { id: 'all', label: 'Historical + Upcoming' },
                          { id: 'upcoming', label: 'Upcoming Only' },
                        ] as const
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => updateChartSettings({ newsTimeMode: m.id })}
                          className={`px-2 py-0.5 rounded text-[10.5px] cursor-pointer ${
                            (chartSettings.newsTimeMode || 'all') === m.id
                              ? 'bg-[#2962ff] text-white font-semibold'
                              : 'text-[#787b86] hover:text-[#d1d4dc]'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-[12px] text-[#d1d4dc] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={chartSettings.newsShowGuidelineOnHover !== false}
                      onChange={(e) =>
                        updateChartSettings({ newsShowGuidelineOnHover: e.target.checked })
                      }
                      className="accent-[#2962ff]"
                    />
                    Show vertical candle guideline on hover/click
                  </label>
                </div>
              </>
            )}

            {tab === 'presets' && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wider text-[#787b86]">
                      Interface / UI Scale
                    </span>
                    <span className="text-[11px] font-mono-num text-[#2962ff] font-semibold">
                      {Math.round((chartSettings.uiScale || 1) * 100)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {([0.8, 0.9, 1.0, 1.1, 1.25] as const).map((scaleVal) => {
                      const active = Math.abs((chartSettings.uiScale || 1) - scaleVal) < 0.01;
                      return (
                        <button
                          key={scaleVal}
                          type="button"
                          onClick={() => updateChartSettings({ uiScale: scaleVal })}
                          className={`py-1.5 rounded text-[11.5px] font-mono-num font-semibold border transition-colors ${
                            active
                              ? 'bg-[#2962ff] border-[#2962ff] text-white'
                              : 'bg-[#131722] border-[#2a2e39] text-[#d1d4dc] hover:border-[#2962ff]/60'
                          }`}
                        >
                          {Math.round(scaleVal * 100)}%
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-[#787b86]">
                    Scales toolbars, panels, modals, and chart axis labels while keeping chart
                    canvas rendering 1:1 pixel crisp.
                  </p>
                </div>

                <div className="h-[1px] bg-[#2a2e39]" />

                <label className="flex items-center gap-2 text-[12.5px] text-[#d1d4dc] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chartSettings.showHighLowMarks}
                    onChange={(e) =>
                      updateChartSettings({ showHighLowMarks: e.target.checked })
                    }
                    className="accent-[#2962ff]"
                  />
                  Show High / Low Price Marks
                </label>

                <div className="h-[1px] bg-[#2a2e39]" />

                <div className="text-[11px] uppercase tracking-wider text-[#787b86]">
                  1-Click Theme Presets
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {THEME_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => updateChartSettings(preset.settings)}
                      className="flex items-center justify-between p-2.5 rounded bg-[#131722] border border-[#2a2e39] hover:border-[#2962ff] text-left transition-colors"
                    >
                      <div>
                        <div className="text-[12.5px] font-semibold text-[#d1d4dc]">
                          {preset.name}
                        </div>
                        <div className="text-[11px] text-[#787b86]">{preset.desc}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        {preset.swatch.map((c, idx) => (
                          <span
                            key={idx}
                            className="w-4 h-4 rounded-sm border border-[#2a2e39]"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-[#2a2e39] flex items-center justify-between bg-[#131722]/40">
          <button
            onClick={resetChartSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#2a2e39] hover:bg-[#2a2e39] text-[#d1d4dc] text-[12px] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Defaults</span>
          </button>
          <button
            onClick={() => setChartSettingsModalOpen(false)}
            className="px-4 py-1.5 rounded bg-[#2962ff] hover:bg-[#1e53e5] text-white text-[12px] font-medium transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
