import React, { useEffect, useRef, useState } from 'react';
import { Search, X, Plus, Check, Database, Clock } from 'lucide-react';
import { api } from '../services/api';
import { useChartStore } from '../store/useChartStore';
import { parseTradingViewInterval, SymbolInfo } from '../types/chart';

const CATEGORIES = ['All', 'Forex', 'Metals', 'Indices', 'Crypto', 'Other'];

export const SymbolSearchModal: React.FC = () => {
  const {
    symbolModalOpen,
    setSymbolModalOpen,
    symbolSearchInitialQuery,
    clearSymbolSearchInitialQuery,
    setSymbol,
    setTimeframe,
    watchlistSymbols,
    addWatchlistSymbol,
  } = useChartStore();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync initial query when opened via global type-to-search (A-Z)
  useEffect(() => {
    if (symbolModalOpen) {
      if (symbolSearchInitialQuery) {
        setSearch(symbolSearchInitialQuery);
      }
      window.setTimeout(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      }, 10);
    } else {
      setSearch('');
      setHighlightIdx(0);
      clearSymbolSearchInitialQuery();
    }
  }, [symbolModalOpen, symbolSearchInitialQuery, clearSymbolSearchInitialQuery]);

  // Combo Syntax: "XAUUSD 45m" or "EURUSD 2h"
  const parts = search.trim().split(/\s+/);
  const symbolQuery = parts[0] || '';
  const comboInterval = parts.length >= 2 ? parseTradingViewInterval(parts[1]) : null;

  useEffect(() => {
    if (!symbolModalOpen) return;
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      api
        .getSymbols(symbolQuery, category)
        .then((list) => {
          if (!cancelled) {
            setSymbols(list);
            setHighlightIdx(0);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 90);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [symbolModalOpen, symbolQuery, category]);

  if (!symbolModalOpen) return null;

  const commitSelection = (s: SymbolInfo) => {
    setSymbol(s.symbol, s);
    if (comboInterval) {
      setTimeframe(comboInterval.tf);
    }
    setSymbolModalOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setSymbolModalOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(Math.max(0, symbols.length - 1), i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && symbols.length > 0) {
      e.preventDefault();
      const target = symbols[Math.min(highlightIdx, symbols.length - 1)];
      if (target) commitSelection(target);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-16 px-4"
      onClick={() => setSymbolModalOpen(false)}
    >
      <div
        className="w-full max-w-[640px] bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-tv overflow-hidden flex flex-col max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#2a2e39] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-[#d1d4dc]">Symbol Search (MT5)</h2>
            {comboInterval && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#2962ff]/20 text-[#2962ff] text-[11px] font-semibold">
                <Clock className="w-3 h-3" />+ Switch to {comboInterval.tf}
              </span>
            )}
          </div>
          <button
            onClick={() => setSymbolModalOpen(false)}
            className="p-1 rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Input */}
        <div className="px-4 py-2.5 border-b border-[#2a2e39] flex items-center gap-2 bg-[#131722]/60">
          <Search className="w-4 h-4 text-[#787b86]" />
          <input
            ref={inputRef}
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search symbol or combo (e.g. XAUUSD, EURUSD 45m, GBPUSD 2h)..."
            className="flex-1 bg-transparent text-[#d1d4dc] placeholder-[#787b86] outline-none text-[13px]"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-[#787b86] hover:text-[#d1d4dc]">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category Filter Tabs */}
        <div className="px-4 py-2 border-b border-[#2a2e39] flex items-center gap-1.5 overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium transition-colors ${
                category === cat
                  ? 'bg-[#2962ff] text-white'
                  : 'bg-[#131722] text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#2a2e39]/40 min-h-[280px]">
          {loading ? (
            <div className="py-12 text-center text-[#787b86] text-[12px]">
              Loading MT5 symbols...
            </div>
          ) : symbols.length === 0 ? (
            <div className="py-12 text-center text-[#787b86] text-[12px]">
              No matching symbols found.
            </div>
          ) : (
            symbols.map((s, idx) => {
              const inWatchlist = watchlistSymbols.includes(s.symbol);
              const isHighlighted = idx === highlightIdx;
              return (
                <div
                  key={s.symbol}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  onClick={() => commitSelection(s)}
                  className={`px-4 py-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                    isHighlighted ? 'bg-[#2962ff]/15' : 'hover:bg-[#2a2e39]/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-semibold text-[13px] text-[#d1d4dc] w-28 shrink-0">
                      {s.symbol}
                    </span>
                    <span className="text-[12px] text-[#787b86] truncate">
                      {s.description}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {(s.cached_bars ?? 0) > 0 && (
                      <span
                        title="Cached in DuckDB"
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#089981]/15 text-[#089981] text-[10px] font-mono-num"
                      >
                        <Database className="w-2.5 h-2.5" />
                        {s.cached_bars?.toLocaleString()}
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded bg-[#131722] text-[#787b86] text-[10px]">
                      {s.category}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addWatchlistSymbol(s.symbol);
                      }}
                      title={inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
                      className={`p-1 rounded transition-colors ${
                        inWatchlist
                          ? 'text-[#089981]'
                          : 'text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]'
                      }`}
                    >
                      {inWatchlist ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
