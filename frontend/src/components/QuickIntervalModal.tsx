import React, { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { useChartStore } from '../store/useChartStore';
import { parseTradingViewInterval } from '../types/chart';

export const QuickIntervalModal: React.FC = () => {
  const {
    setTimeframe,
    openSymbolSearchWithQuery,
    showToast,
  } = useChartStore();

  const [open, setOpen] = useState(false);
  const [rawInput, setRawInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const state = useChartStore.getState();
      if (
        state.symbolModalOpen ||
        state.indicatorsModalOpen ||
        state.chartSettingsModalOpen ||
        state.accountModalOpen ||
        state.backtestModalOpen ||
        open
      ) {
        return;
      }

      // Single printable key
      if (e.key.length !== 1) return;

      // Letter A-Z -> Open Symbol Search directly with first letter
      if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        openSymbolSearchWithQuery(e.key.toUpperCase());
        return;
      }

      // Digit 0-9 -> Open Change Interval HUD
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        setRawInput(e.key);
        setOpen(true);
      }
    };

    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, [open, openSymbolSearchWithQuery]);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      }, 10);
    }
  }, [open]);

  if (!open) return null;

  const parsed = parseTradingViewInterval(rawInput);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      setOpen(false);
      openSymbolSearchWithQuery(rawInput.toUpperCase());
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (parsed) {
        setTimeframe(parsed.tf);
        showToast('info', `Timeframe changed to ${parsed.humanLabel}`);
        setOpen(false);
      }
    }
  };

  const handleChange = (val: string) => {
    // If user types a letter other than m/h/d/w/M (e.g. searching US30), hand off to Symbol Search
    if (/[a-zA-Z]/.test(val) && !/^\d+[mhdwM]?$/i.test(val)) {
      setOpen(false);
      openSymbolSearchWithQuery(val.toUpperCase());
      return;
    }
    setRawInput(val);
    if (val === '') {
      setOpen(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-[290px] bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-tv p-4 flex flex-col items-center gap-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#d1d4dc]">
          <Clock className="w-3.5 h-3.5 text-[#2962ff]" />
          <span>Change interval</span>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={rawInput}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full text-center px-3 py-2 rounded bg-[#131722] border border-[#2962ff] font-mono-num text-[22px] font-bold text-white outline-none"
        />

        <div className="text-[12px] font-mono-num">
          {parsed ? (
            <span className="text-[#089981] font-semibold">{parsed.humanLabel}</span>
          ) : (
            <span className="text-[#f23645]">Invalid interval (e.g. 3, 45, 2h, 2d)</span>
          )}
        </div>

        <div className="text-[10.5px] text-[#787b86] text-center">
          Press <kbd className="px-1 py-0.5 rounded bg-[#131722] text-[#d1d4dc]">Enter</kbd> to apply ·{' '}
          <kbd className="px-1 py-0.5 rounded bg-[#131722] text-[#d1d4dc]">Tab</kbd> for Symbol Search
        </div>
      </div>
    </div>
  );
};
