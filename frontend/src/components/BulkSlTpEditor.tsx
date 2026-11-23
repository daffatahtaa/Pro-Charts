import React, { useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  count: number;
  onApply: (sl: number | undefined, tp: number | undefined) => Promise<void>;
  onClose: () => void;
}

export const BulkSlTpEditor: React.FC<Props> = ({ count, onApply, onClose }) => {
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [busy, setBusy] = useState(false);

  const slVal = sl.trim() === '' ? undefined : Number(sl);
  const tpVal = tp.trim() === '' ? undefined : Number(tp);
  const canApply = count > 0 && (slVal !== undefined || tpVal !== undefined) && !busy;

  const handleApply = async () => {
    if (!canApply) return;
    setBusy(true);
    try {
      await onApply(slVal, tpVal);
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
        className="w-[320px] rounded-lg bg-[#1e222d] border border-[#2a2e39] shadow-xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-sans font-semibold text-[#d1d4dc]">
            Bulk Set SL/TP ({count} position{count === 1 ? '' : 's'})
          </h3>
          <button onClick={onClose} className="text-[#787b86] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-[11px] font-sans text-[#787b86]">
            Stop Loss (empty = keep current)
            <input
              type="number"
              step="any"
              value={sl}
              onChange={(e) => setSl(e.target.value)}
              placeholder="e.g. 1.08500"
              className="bg-[#131722] border border-[#2a2e39] rounded px-2 py-1.5 text-[12px] text-[#d1d4dc] focus:border-[#2962ff] outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-sans text-[#787b86]">
            Take Profit (empty = keep current)
            <input
              type="number"
              step="any"
              value={tp}
              onChange={(e) => setTp(e.target.value)}
              placeholder="e.g. 1.09000"
              className="bg-[#131722] border border-[#2a2e39] rounded px-2 py-1.5 text-[12px] text-[#d1d4dc] focus:border-[#2962ff] outline-none"
            />
          </label>
          <button
            onClick={handleApply}
            disabled={!canApply}
            className="mt-1 px-3 py-1.5 rounded bg-[#2962ff] hover:bg-[#2962ff]/80 text-white text-[12px] font-sans font-semibold disabled:opacity-40"
          >
            {busy ? 'Applying...' : 'Apply to All'}
          </button>
        </div>
      </div>
    </div>
  );
};
