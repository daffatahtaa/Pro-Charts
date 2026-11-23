import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Search,
  Code2,
  Play,
  Edit3,
  AlertCircle,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { useChartStore } from '../store/useChartStore';
import {
  compileAndRegisterPineScript,
  deleteSavedPineIndicator,
  getAllPineRuntimeDiagnostics,
  getSavedPineIndicators,
  PINE_STARTER_TEMPLATES,
  PineParamValue,
  PineRuntimeDiagnostic,
  PineVersion,
  SavedPineIndicator,
  subscribePineDiagnostics,
  validatePineScript,
} from '../services/pineEngine';

function getVersionBadgeClass(v?: PineVersion): string {
  if (v === 6) return 'bg-[#089981]/20 text-[#22c55e] border border-[#089981]/30';
  if (v === 4) return 'bg-[#787b86]/20 text-[#b2b5be] border border-[#787b86]/30';
  return 'bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30';
}

interface IndicatorTemplate {
  name: string;
  label: string;
  isMain: boolean;
  defaultParams: number[];
  description: string;
}

const INDICATOR_CATALOG: IndicatorTemplate[] = [
  // Main Pane Overlays
  {
    name: 'EMA',
    label: 'EMA (Exponential Moving Average)',
    isMain: true,
    defaultParams: [20, 50, 200],
    description: 'Overlay EMA lines on price candles',
  },
  {
    name: 'MA',
    label: 'MA (Simple Moving Average)',
    isMain: true,
    defaultParams: [10, 20, 50],
    description: 'Simple moving average overlays',
  },
  {
    name: 'BOLL',
    label: 'BOLL (Bollinger Bands)',
    isMain: true,
    defaultParams: [20, 2],
    description: 'Volatility bands around 20-period SMA',
  },
  {
    name: 'SAR',
    label: 'SAR (Parabolic SAR)',
    isMain: true,
    defaultParams: [2, 2, 20],
    description: 'Stop and Reverse trend dots',
  },
  // Sub-Pane Indicators
  {
    name: 'RSI',
    label: 'RSI (Relative Strength Index)',
    isMain: false,
    defaultParams: [14],
    description: 'Momentum oscillator (0-100)',
  },
  {
    name: 'MACD',
    label: 'MACD',
    isMain: false,
    defaultParams: [12, 26, 9],
    description: 'Moving Average Convergence Divergence',
  },
  {
    name: 'VOL',
    label: 'VOL (Volume)',
    isMain: false,
    defaultParams: [5, 10, 20],
    description: 'Tick volume histogram with moving averages',
  },
  {
    name: 'KDJ',
    label: 'KDJ (Stochastic)',
    isMain: false,
    defaultParams: [9, 3, 3],
    description: 'Stochastic K/D/J oscillator',
  },
  {
    name: 'CCI',
    label: 'CCI (Commodity Channel Index)',
    isMain: false,
    defaultParams: [20],
    description: 'Cyclical trend oscillator',
  },
  {
    name: 'WR',
    label: 'WR (Williams %R)',
    isMain: false,
    defaultParams: [14],
    description: 'Overbought / oversold momentum indicator',
  },
];

export const IndicatorsModal: React.FC = () => {
  const {
    indicatorsModalOpen,
    setIndicatorsModalOpen,
    activeIndicators,
    addIndicator,
    removeIndicator,
    showToast,
  } = useChartStore();

  const [tab, setTab] = useState<'catalog' | 'pine'>('catalog');
  const [query, setQuery] = useState('');
  const [paramDrafts, setParamDrafts] = useState<Record<string, string>>({});
  const [savedPine, setSavedPine] = useState<SavedPineIndicator[]>(() => getSavedPineIndicators());

  // Pine Editor state
  const [editingPineId, setEditingPineId] = useState<string | undefined>(undefined);
  const [pineCode, setPineCode] = useState<string>(PINE_STARTER_TEMPLATES[0].code);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [showWarningsList, setShowWarningsList] = useState(false);
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<Record<string, PineRuntimeDiagnostic>>(
    () => getAllPineRuntimeDiagnostics()
  );

  useEffect(() => {
    return subscribePineDiagnostics(() => {
      setRuntimeDiagnostics(getAllPineRuntimeDiagnostics());
    });
  }, []);

  const livePreview = useMemo(() => {
    const res = validatePineScript(pineCode);
    if (res.ok && res.parsed) {
      return { ok: true as const, parsed: res.parsed, warnings: res.warnings };
    }
    return {
      ok: false as const,
      parsed: res.parsed,
      phase: res.phase,
      error: res.error || 'Syntax error',
      warnings: res.warnings,
    };
  }, [pineCode]);

  if (!indicatorsModalOpen) return null;

  const q = query.toLowerCase();
  const filteredBuiltIn = INDICATOR_CATALOG.filter(
    (ind) => ind.name.toLowerCase().includes(q) || ind.label.toLowerCase().includes(q)
  );
  const filteredPine = savedPine.filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      p.shortTitle.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q)
  );

  const handleAddBuiltIn = (tpl: IndicatorTemplate) => {
    const raw = paramDrafts[tpl.name];
    let params = tpl.defaultParams;
    if (raw && raw.trim()) {
      const parsed = raw
        .split(',')
        .map((n) => Number(n.trim()))
        .filter((n) => !Number.isNaN(n) && n > 0);
      if (parsed.length > 0) params = parsed;
    }

    addIndicator({
      id: `${tpl.name}_${Date.now()}`,
      name: tpl.name,
      paneId: tpl.isMain ? 'candle_pane' : '',
      isMain: tpl.isMain,
      calcParams: params,
      visible: true,
    });
  };

  const handleAddSavedPine = (item: SavedPineIndicator) => {
    const raw = paramDrafts[item.id];
    let params: PineParamValue[] = item.inputs.map((i) => i.defaultVal);
    if (raw && raw.trim()) {
      const parts = raw.split(',').map((p) => p.trim());
      params = item.inputs.map((inp, idx) => {
        const token = parts[idx];
        if (token === undefined || token === '') return inp.defaultVal;
        if (inp.type === 'bool') return token.toLowerCase() === 'true' || token === '1';
        if (inp.type === 'string' || inp.type === 'source' || inp.type === 'color') return token;
        const n = Number(token);
        return Number.isFinite(n) ? n : inp.defaultVal;
      });
    }

    addIndicator({
      id: `${item.name}_${Date.now()}`,
      name: item.name,
      paneId: item.isMain ? 'candle_pane' : '',
      isMain: item.isMain,
      calcParams: params,
      visible: true,
    });
  };

  const handleCompileAndAdd = () => {
    setCompileError(null);
    try {
      const compiled = compileAndRegisterPineScript(pineCode, editingPineId);
      setSavedPine(getSavedPineIndicators());
      setEditingPineId(compiled.id);

      // Remove existing mounted instance of same custom indicator if re-compiling
      activeIndicators
        .filter((a) => a.name === compiled.name)
        .forEach((a) => removeIndicator(a.id));

      addIndicator({
        id: `${compiled.name}_${Date.now()}`,
        name: compiled.name,
        paneId: compiled.isMain ? 'candle_pane' : '',
        isMain: compiled.isMain,
        calcParams: compiled.inputs.map((i) => i.defaultVal),
        visible: true,
      });

      showToast('success', `Compiled & added "${compiled.title}" to chart`);
      setTab('catalog');
    } catch (err: any) {
      setCompileError(err?.message || 'Failed to compile Pine Script');
    }
  };

  const handleDeletePine = (item: SavedPineIndicator) => {
    activeIndicators
      .filter((a) => a.name === item.name)
      .forEach((a) => removeIndicator(a.id));
    deleteSavedPineIndicator(item.id);
    setSavedPine(getSavedPineIndicators());
    if (editingPineId === item.id) setEditingPineId(undefined);
  };

  const handleEditPine = (item: SavedPineIndicator) => {
    setEditingPineId(item.id);
    setPineCode(item.code);
    setCompileError(null);
    setTab('pine');
  };

  const resolveDisplayName = (indName: string) => {
    const found = savedPine.find((p) => p.name === indName);
    return found ? found.shortTitle || found.title : indName;
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-12 px-4"
      onClick={() => setIndicatorsModalOpen(false)}
    >
      <div
        className="w-full max-w-[700px] bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-tv overflow-hidden flex flex-col max-h-[82vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + Tabs */}
        <div className="px-4 py-3 border-b border-[#2a2e39] flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-[15px] font-semibold text-[#d1d4dc]">Indicators &amp; Pine Script</h2>
            <div className="flex items-center bg-[#131722] rounded p-0.5 border border-[#2a2e39]">
              <button
                onClick={() => setTab('catalog')}
                className={`px-3 py-1 rounded text-[12px] font-medium transition-colors cursor-pointer ${
                  tab === 'catalog'
                    ? 'bg-[#2962ff] text-white'
                    : 'text-[#787b86] hover:text-[#d1d4dc]'
                }`}
              >
                Catalog &amp; Saved Scripts
              </button>
              <button
                onClick={() => {
                  setCompileError(null);
                  setTab('pine');
                }}
                className={`px-3 py-1 rounded text-[12px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  tab === 'pine'
                    ? 'bg-[#2962ff] text-white'
                    : 'text-[#787b86] hover:text-[#d1d4dc]'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                + Pine Script Editor
              </button>
            </div>
          </div>
          <button
            onClick={() => setIndicatorsModalOpen(false)}
            className="p-1 rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Active Indicators Bar */}
        {activeIndicators.length > 0 && (
          <div className="px-4 py-2 border-b border-[#2a2e39] bg-[#131722]/40">
            <div className="text-[10.5px] uppercase tracking-wider text-[#787b86] mb-1.5">
              Active on Chart
            </div>
            <div className="flex flex-wrap gap-1.5">
              {activeIndicators.map((ind) => (
                <div
                  key={ind.id}
                  className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#2962ff]/15 border border-[#2962ff]/30 text-[11.5px] text-[#d1d4dc]"
                >
                  <span>
                    {resolveDisplayName(ind.name)}
                    {ind.calcParams.length > 0 ? ` (${ind.calcParams.join(',')})` : ''}
                  </span>
                  <button
                    onClick={() => removeIndicator(ind.id)}
                    className="text-[#787b86] hover:text-[#f23645] cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'catalog' ? (
          <>
            <div className="px-4 py-2.5 border-b border-[#2a2e39] flex items-center gap-2 bg-[#131722]/60">
              <Search className="w-4 h-4 text-[#787b86]" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search built-in or saved Pine scripts (EMA, RSI, SuperTrend, Keltner)..."
                className="flex-1 bg-transparent text-[#d1d4dc] placeholder-[#787b86] outline-none text-[13px]"
              />
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#2a2e39]/40">
              {/* Saved Custom Pine Scripts Section */}
              {filteredPine.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 bg-[#131722]/50 text-[10px] font-semibold uppercase tracking-wider text-[#f59e0b] flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" />
                    My Custom Pine Scripts ({filteredPine.length})
                  </div>
                  {filteredPine.map((item) => {
                    const defaultParamStr = item.inputs.map((i) => i.defaultVal).join(', ');
                    const draft = paramDrafts[item.id] ?? defaultParamStr;
                    return (
                      <div
                        key={item.id}
                        className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-[#2a2e39]/50 transition-colors border-t border-[#2a2e39]/30"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-medium text-[#d1d4dc]">
                              {item.title}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-mono-num ${getVersionBadgeClass(
                                item.version || 5
                              )}`}
                            >
                              Pine v{item.version || 5}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
                                item.isMain
                                  ? 'bg-[#2962ff]/15 text-[#2962ff]'
                                  : 'bg-[#089981]/15 text-[#089981]'
                              }`}
                            >
                              {item.isMain ? 'Main Pane' : 'Sub-Pane'}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#787b86] mt-0.5">
                            {item.plots.length} plot(s) · {item.inputs.length} input(s)
                          </p>
                          {runtimeDiagnostics[item.name] && (
                            <div className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-[#f23645] bg-[#f23645]/10 border border-[#f23645]/30 rounded px-1.5 py-0.5 max-w-full">
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              <span className="truncate" title={runtimeDiagnostics[item.name].message}>
                                Runtime: {runtimeDiagnostics[item.name].message}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.inputs.length > 0 && (
                            <input
                              value={draft}
                              onChange={(e) =>
                                setParamDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                              }
                              title="Inputs (comma-separated)"
                              className="w-24 px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[11px] font-mono-num text-[#d1d4dc] outline-none focus:border-[#2962ff]"
                            />
                          )}
                          <button
                            onClick={() => handleEditPine(item)}
                            title="Edit Pine Code"
                            className="p-1.5 rounded bg-[#2a2e39] hover:bg-[#363a45] text-[#d1d4dc] cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeletePine(item)}
                            title="Delete Script"
                            className="p-1.5 rounded bg-[#2a2e39] hover:bg-[#f23645]/20 text-[#787b86] hover:text-[#f23645] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleAddSavedPine(item)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#2962ff] hover:bg-[#1e53e5] text-white text-[11.5px] font-medium transition-colors cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Built-in Technical Indicators */}
              <div className="px-4 py-1.5 bg-[#131722]/50 text-[10px] font-semibold uppercase tracking-wider text-[#787b86]">
                Built-in Technicals
              </div>
              {filteredBuiltIn.map((tpl) => {
                const draft = paramDrafts[tpl.name] ?? tpl.defaultParams.join(', ');
                return (
                  <div
                    key={tpl.name}
                    className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-[#2a2e39]/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-[#d1d4dc]">{tpl.label}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            tpl.isMain
                              ? 'bg-[#2962ff]/15 text-[#2962ff]'
                              : 'bg-[#089981]/15 text-[#089981]'
                          }`}
                        >
                          {tpl.isMain ? 'Main Pane' : 'Sub-Pane'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#787b86] mt-0.5">{tpl.description}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        value={draft}
                        onChange={(e) =>
                          setParamDrafts((prev) => ({ ...prev, [tpl.name]: e.target.value }))
                        }
                        title="Parameters (comma-separated)"
                        className="w-24 px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[11px] font-mono-num text-[#d1d4dc] outline-none focus:border-[#2962ff]"
                      />
                      <button
                        onClick={() => handleAddBuiltIn(tpl)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#2962ff] hover:bg-[#1e53e5] text-white text-[11.5px] font-medium transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* Pine Script Editor Tab */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Starter Templates Strip */}
            <div className="px-4 py-2 border-b border-[#2a2e39] bg-[#131722]/60 flex items-center gap-1.5 overflow-x-auto">
              <span className="text-[10.5px] uppercase tracking-wider text-[#787b86] mr-1 shrink-0">
                Templates:
              </span>
              {PINE_STARTER_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => {
                    setEditingPineId(undefined);
                    setPineCode(tpl.code);
                    setCompileError(null);
                  }}
                  title={tpl.description}
                  className="px-2 py-1 rounded bg-[#1e222d] hover:bg-[#2a2e39] border border-[#2a2e39] text-[11px] text-[#d1d4dc] shrink-0 cursor-pointer transition-colors"
                >
                  {tpl.label}
                </button>
              ))}
            </div>

            {/* Live Metadata Detection Bar */}
            <div className="px-4 py-2 border-b border-[#2a2e39] bg-[#131722]/30 flex items-center justify-between gap-2 text-[11.5px]">
              {livePreview.ok ? (
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono-num font-semibold ${getVersionBadgeClass(
                      livePreview.parsed.version
                    )}`}
                  >
                    v{livePreview.parsed.version}
                  </span>
                  <span className="font-semibold text-white">{livePreview.parsed.title}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      livePreview.parsed.isMain
                        ? 'bg-[#2962ff]/15 text-[#2962ff]'
                        : 'bg-[#089981]/15 text-[#089981]'
                    }`}
                  >
                    {livePreview.parsed.isMain ? 'Main Overlay' : 'Sub-Pane'}
                  </span>
                  <span className="text-[#787b86]">
                    Inputs: {livePreview.parsed.inputs.length} · Plots:{' '}
                    {livePreview.parsed.plots.length}
                    {livePreview.parsed.fills.length > 0
                      ? ` · Fills: ${livePreview.parsed.fills.length}`
                      : ''}
                    {livePreview.parsed.shapes.length > 0
                      ? ` · Shapes: ${livePreview.parsed.shapes.length}`
                      : ''}
                    {livePreview.parsed.plotCandles?.length > 0
                      ? ` · Candles: ${livePreview.parsed.plotCandles.length}`
                      : ''}
                    {livePreview.parsed.hlines.length > 0
                      ? ` · Hlines: ${livePreview.parsed.hlines.length}`
                      : ''}
                  </span>
                  {livePreview.parsed.warnings.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowWarningsList((v) => !v)}
                      title={livePreview.parsed.warnings.join('\n')}
                      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30 cursor-pointer hover:bg-[#f59e0b]/25"
                    >
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      {livePreview.parsed.warnings.length} notice
                      {livePreview.parsed.warnings.length > 1 ? 's' : ''}
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[#f23645] min-w-0">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate" title={livePreview.error}>
                    {livePreview.phase === 'runtime' ? 'Runtime error: ' : 'Syntax error: '}
                    {livePreview.error}
                  </span>
                </div>
              )}
              {editingPineId && (
                <button
                  onClick={() => setEditingPineId(undefined)}
                  className="text-[11px] text-[#787b86] hover:text-white underline cursor-pointer shrink-0"
                >
                  Save as New
                </button>
              )}
            </div>

            {showWarningsList && livePreview.warnings.length > 0 && (
              <div className="px-4 py-1.5 border-b border-[#2a2e39] bg-[#f59e0b]/10 text-[#f59e0b] text-[11px] space-y-0.5 max-h-24 overflow-y-auto">
                {livePreview.warnings.map((w, idx) => (
                  <div key={idx} className="flex items-start gap-1.5">
                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Code Editor Textarea */}
            <div className="flex-1 p-3 bg-[#131722] overflow-hidden flex flex-col">
              <textarea
                value={pineCode}
                onChange={(e) => {
                  setPineCode(e.target.value);
                  setCompileError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const el = e.currentTarget;
                    const start = el.selectionStart;
                    const end = el.selectionEnd;
                    const next = `${pineCode.slice(0, start)}    ${pineCode.slice(end)}`;
                    setPineCode(next);
                    requestAnimationFrame(() => {
                      el.selectionStart = el.selectionEnd = start + 4;
                    });
                  }
                }}
                spellCheck={false}
                placeholder="//@version=6&#10;indicator(&quot;My Indicator&quot;, overlay=true)&#10;..."
                className="flex-1 w-full min-h-[240px] bg-[#0f131c] border border-[#2a2e39] rounded p-3 text-[12.5px] leading-relaxed font-mono-num text-[#e2e8f0] outline-none focus:border-[#2962ff] resize-none"
              />
              {compileError && (
                <div className="mt-2 px-3 py-2 rounded bg-[#f23645]/15 border border-[#f23645]/40 text-[#f23645] text-[12px] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{compileError}</span>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="px-4 py-2.5 border-t border-[#2a2e39] bg-[#1e222d] flex items-center justify-between gap-2">
              <span className="text-[11px] text-[#787b86]">
                Pine v6: type/method/enum, map/matrix/array, line/box/label/table/linefill/polyline,
                plotcandle, MTF request.security, dynamic ta.*
              </span>
              <button
                onClick={handleCompileAndAdd}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-[#089981] hover:bg-[#067a67] text-white text-[12px] font-semibold transition-colors cursor-pointer shrink-0"
              >
                <Play className="w-3.5 h-3.5" />
                Compile &amp; Add to Chart
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
