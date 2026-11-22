import React, { useEffect, useMemo, useState } from 'react';
import { X, RotateCcw, Sliders } from 'lucide-react';
import { ActiveIndicator } from '../types/chart';
import {
  getSavedPineIndicators,
  PineInputDef,
  PineParamValue,
  SavedPineIndicator,
} from '../services/pineEngine';
import { useChartStore } from '../store/useChartStore';

interface IndicatorSettingsModalProps {
  indicator: ActiveIndicator | null;
  onClose: () => void;
}

const SOURCE_OPTIONS = ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4', 'volume'];

function toHexColor(raw: string): string {
  const s = String(raw || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  if (/^#[0-9a-fA-F]{8}$/.test(s)) return s.slice(0, 7);
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
  if (m) {
    const hex = (n: string) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0');
    return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
  }
  return '#2962ff';
}

function updateRgbaHex(orig: string, newHex: string): string {
  const m = /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/.exec(String(orig || ''));
  if (!m) return newHex;
  const r = parseInt(newHex.slice(1, 3), 16);
  const g = parseInt(newHex.slice(3, 5), 16);
  const b = parseInt(newHex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${m[1]})`;
}

export const IndicatorSettingsModal: React.FC<IndicatorSettingsModalProps> = ({
  indicator,
  onClose,
}) => {
  const updateIndicatorParams = useChartStore((s) => s.updateIndicatorParams);

  const savedPine: SavedPineIndicator | undefined = useMemo(() => {
    if (!indicator) return undefined;
    return getSavedPineIndicators().find((p) => p.name === indicator.name);
  }, [indicator]);

  const [drafts, setDrafts] = useState<PineParamValue[]>([]);

  useEffect(() => {
    if (!indicator) return;
    if (savedPine && savedPine.inputs.length > 0) {
      setDrafts(
        savedPine.inputs.map((inp, idx) =>
          indicator.calcParams[idx] !== undefined ? indicator.calcParams[idx] : inp.defaultVal
        )
      );
    } else {
      setDrafts([...indicator.calcParams]);
    }
  }, [indicator, savedPine]);

  if (!indicator) return null;

  const displayTitle = savedPine?.title || indicator.name;

  // Group Pine inputs by `inp.group` preserving declaration order
  const groupedInputs: Array<{ group: string; items: Array<{ inp: PineInputDef; idx: number }> }> = [];
  if (savedPine) {
    const groupMap = new Map<string, Array<{ inp: PineInputDef; idx: number }>>();
    savedPine.inputs.forEach((inp, idx) => {
      const g = inp.group || 'Inputs';
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g)!.push({ inp, idx });
    });
    groupMap.forEach((items, group) => groupedInputs.push({ group, items }));
  }

  const updateAt = (idx: number, val: PineParamValue) => {
    setDrafts((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  };

  const handleReset = () => {
    if (savedPine) {
      setDrafts(savedPine.inputs.map((i) => i.defaultVal));
    }
  };

  const handleApply = () => {
    const normalized = savedPine
      ? savedPine.inputs.map((inp, idx) => {
          const v = drafts[idx];
          if (inp.type === 'int') {
            const n = Math.round(Number(v));
            return Number.isFinite(n) ? n : Number(inp.defaultVal);
          }
          if (inp.type === 'float') {
            const n = Number(v);
            return Number.isFinite(n) ? n : Number(inp.defaultVal);
          }
          if (inp.type === 'bool') return Boolean(v);
          return String(v ?? inp.defaultVal);
        })
      : drafts.map((v) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : v;
        });

    updateIndicatorParams(indicator.id, normalized);
    onClose();
  };

  return (
    <div
      data-no-marquee="true"
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 pointer-events-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] max-h-[82vh] bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl flex flex-col overflow-hidden text-[#d1d4dc]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#2a2e39] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sliders className="w-4 h-4 text-[#2962ff] shrink-0" />
            <h3 className="text-[14px] font-semibold text-white truncate">{displayTitle}</h3>
            {savedPine?.version && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#089981]/20 text-[#22c55e] font-mono-num shrink-0">
                v{savedPine.version}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Inputs Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {savedPine ? (
            savedPine.inputs.length === 0 ? (
              <p className="text-[12px] text-[#787b86] text-center py-4">
                This Pine script does not define any customizable inputs.
              </p>
            ) : (
              groupedInputs.map(({ group, items }) => (
                <div key={group} className="space-y-2.5">
                  <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#787b86] border-b border-[#2a2e39]/70 pb-1">
                    {group}
                  </div>
                  {items.map(({ inp, idx }) => {
                    const val = drafts[idx] ?? inp.defaultVal;
                    return (
                      <div
                        key={`${inp.varName}_${idx}`}
                        className="flex items-center justify-between gap-3 text-[12px]"
                      >
                        <label className="text-[#d1d4dc] truncate" title={inp.title || inp.varName}>
                          {inp.title || inp.varName}
                        </label>

                        {inp.type === 'bool' ? (
                          <input
                            type="checkbox"
                            checked={Boolean(val)}
                            onChange={(e) => updateAt(idx, e.target.checked)}
                            className="w-4 h-4 accent-[#2962ff] cursor-pointer"
                          />
                        ) : inp.type === 'source' ? (
                          <select
                            value={String(val)}
                            onChange={(e) => updateAt(idx, e.target.value)}
                            className="w-36 px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[#d1d4dc] text-[12px] outline-none focus:border-[#2962ff]"
                          >
                            {SOURCE_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        ) : inp.type === 'string' && inp.options && inp.options.length > 0 ? (
                          <select
                            value={String(val)}
                            onChange={(e) => updateAt(idx, e.target.value)}
                            className="w-36 px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[#d1d4dc] text-[12px] outline-none focus:border-[#2962ff]"
                          >
                            {inp.options.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : inp.type === 'string' ? (
                          <input
                            type="text"
                            value={String(val)}
                            onChange={(e) => updateAt(idx, e.target.value)}
                            className="w-36 px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[#d1d4dc] text-[12px] outline-none focus:border-[#2962ff]"
                          />
                        ) : inp.type === 'color' ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={toHexColor(String(val))}
                              onChange={(e) =>
                                updateAt(idx, updateRgbaHex(String(val), e.target.value))
                              }
                              className="w-7 h-7 rounded border border-[#2a2e39] bg-transparent cursor-pointer"
                            />
                            <span className="text-[10.5px] font-mono-num text-[#787b86] w-24 truncate">
                              {String(val)}
                            </span>
                          </div>
                        ) : (
                          <input
                            type="number"
                            value={String(val)}
                            min={inp.minval}
                            max={inp.maxval}
                            step={inp.step ?? (inp.type === 'float' ? 0.1 : 1)}
                            onChange={(e) => updateAt(idx, e.target.value)}
                            className="w-28 px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[#d1d4dc] font-mono-num text-[12px] outline-none focus:border-[#2962ff]"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )
          ) : (
            <div className="space-y-2.5">
              <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#787b86] border-b border-[#2a2e39]/70 pb-1">
                Parameters
              </div>
              {drafts.map((val, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 text-[12px]">
                  <label className="text-[#d1d4dc]">Param {idx + 1}</label>
                  <input
                    type="number"
                    value={String(val)}
                    onChange={(e) => updateAt(idx, e.target.value)}
                    className="w-28 px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[#d1d4dc] font-mono-num text-[12px] outline-none focus:border-[#2962ff]"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-[#2a2e39] bg-[#131722]/40 flex items-center justify-between gap-2">
          {savedPine ? (
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11.5px] text-[#787b86] hover:text-white hover:bg-[#2a2e39] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Defaults
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-[12px] text-[#d1d4dc] hover:bg-[#2a2e39] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-1.5 rounded bg-[#2962ff] hover:bg-[#1e53e5] text-white text-[12px] font-semibold cursor-pointer"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
