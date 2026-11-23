import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { formatTradePrice } from '../utils/formatPrice';

export interface BulkSymbolMeta {
  count: number;
  digits: number;
  point: number;
}

interface Props {
  symbols: string[];
  initialSymbol: string;
  positionsBySymbol: Record<string, BulkSymbolMeta>;
  isMixedScope?: boolean;
  onApply: (targetSymbol: string, sl: number | undefined, tp: number | undefined) => Promise<void>;
  onClose: () => void;
}

export const BulkSlTpEditor: React.FC<Props> = ({
  symbols,
  initialSymbol,
  positionsBySymbol,
  isMixedScope = false,
  onApply,
  onClose,
}) => {
  const [targetSymbol, setTargetSymbol] = useState<string>(
    initialSymbol && positionsBySymbol[initialSymbol] ? initialSymbol : symbols[0] || ''
  );
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!targetSymbol || !positionsBySymbol[targetSymbol]) {
      setTargetSymbol(
        initialSymbol && positionsBySymbol[initialSymbol] ? initialSymbol : symbols[0] || ''
      );
    }
  }, [symbols, initialSymbol, positionsBySymbol, targetSymbol]);

  const meta = positionsBySymbol[targetSymbol] || { count: 0, digits: 2, point: 0.01 };
  const targetCount = meta.count;
  const targetDigits = meta.digits;
  const targetPoint = meta.point;

  const rawSl = sl.trim() === '' ? undefined : Number(sl);
  const rawTp = tp.trim() === '' ? undefined : Number(tp);
  const slValid = rawSl === undefined || (Number.isFinite(rawSl) && rawSl >= 0);
  const tpValid = rawTp === undefined || (Number.isFinite(rawTp) && rawTp >= 0);

  const normSl =
    rawSl !== undefined && Number.isFinite(rawSl)
      ? rawSl === 0
        ? 0
        : Number(rawSl.toFixed(targetDigits))
      : undefined;
  const normTp =
    rawTp !== undefined && Number.isFinite(rawTp)
      ? rawTp === 0
        ? 0
        : Number(rawTp.toFixed(targetDigits))
      : undefined;

  const canApply =
    Boolean(targetSymbol) &&
    targetCount > 0 &&
    slValid &&
    tpValid &&
    (normSl !== undefined || normTp !== undefined) &&
    !busy;

  const samplePlaceholder = targetDigits <= 2 ? '2650.50' : targetDigits === 3 ? '154.320' : '1.08500';

  const handleApply = async () => {
    if (!canApply) return;
    setBusy(true);
    try {
      await onApply(targetSymbol, normSl, normTp);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-[360px] rounded-lg bg-[#1e222d] border border-[#2a2e39] shadow-xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-sans font-semibold text-[#d1d4dc]">
            Bulk Set SL/TP — {targetSymbol || 'No Symbol'} ({targetCount} position
            {targetCount === 1 ? '' : 's'})
          </h3>
          <button onClick={onClose} className="text-[#787b86] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {(symbols.length > 1 || isMixedScope) && (
            <div className="rounded bg-[#f59e0b]/10 border border-[#f59e0b]/35 p-2.5 space-y-2">
              <div className="flex items-start gap-1.5 text-[11px] font-sans text-[#f59e0b]">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  SL/TP prices are symbol-specific — applying to <strong>{targetSymbol}</strong> only
                  to prevent cross-pair overwrites.
                </span>
              </div>
              {symbols.length > 1 && (
                <label className="flex items-center justify-between gap-2 text-[11px] font-sans text-[#d1d4dc]">
                  <span>Target Symbol</span>
                  <select
                    value={targetSymbol}
                    onChange={(e) => {
                      setTargetSymbol(e.target.value);
                      setSl('');
                      setTp('');
                    }}
                    className="bg-[#131722] border border-[#2a2e39] rounded px-2 py-1 text-[11.5px] font-mono-num text-white outline-none focus:border-[#2962ff]"
                  >
                    {symbols.map((sym) => (
                      <option key={sym} value={sym}>
                        {sym} ({positionsBySymbol[sym]?.count ?? 0})
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          <label className="flex flex-col gap-1 text-[11px] font-sans text-[#787b86]">
            <div className="flex items-center justify-between">
              <span>Stop Loss (empty = keep, 0 = clear)</span>
              {normSl !== undefined && normSl > 0 && (
                <span className="font-mono-num text-[#f23645]">
                  {formatTradePrice(normSl, targetDigits)}
                </span>
              )}
            </div>
            <input
              type="number"
              step={targetPoint}
              min={0}
              value={sl}
              onChange={(e) => setSl(e.target.value)}
              placeholder={`e.g. ${samplePlaceholder}`}
              className="bg-[#131722] border border-[#2a2e39] rounded px-2 py-1.5 text-[12px] font-mono-num text-[#d1d4dc] focus:border-[#2962ff] outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-sans text-[#787b86]">
            <div className="flex items-center justify-between">
              <span>Take Profit (empty = keep, 0 = clear)</span>
              {normTp !== undefined && normTp > 0 && (
                <span className="font-mono-num text-[#089981]">
                  {formatTradePrice(normTp, targetDigits)}
                </span>
              )}
            </div>
            <input
              type="number"
              step={targetPoint}
              min={0}
              value={tp}
              onChange={(e) => setTp(e.target.value)}
              placeholder={`e.g. ${samplePlaceholder}`}
              className="bg-[#131722] border border-[#2a2e39] rounded px-2 py-1.5 text-[12px] font-mono-num text-[#d1d4dc] focus:border-[#2962ff] outline-none"
            />
          </label>

          <div className="text-[10.5px] font-sans text-[#787b86]">
            Precision: <span className="font-mono-num text-[#d1d4dc]">{targetDigits} decimals</span>{' '}
            (step <span className="font-mono-num text-[#d1d4dc]">{targetPoint}</span>)
          </div>

          <button
            onClick={handleApply}
            disabled={!canApply}
            className="mt-1 px-3 py-1.5 rounded bg-[#2962ff] hover:bg-[#2962ff]/80 text-white text-[12px] font-sans font-semibold disabled:opacity-40"
          >
            {busy ? 'Applying...' : `Apply to ${targetSymbol || 'Symbol'} (${targetCount})`}
          </button>
        </div>
      </div>
    </div>
  );
};
