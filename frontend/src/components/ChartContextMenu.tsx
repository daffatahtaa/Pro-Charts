import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  RotateCcw,
  AlarmClockPlus,
  ChevronsDown,
  ChevronsUp,
  LineChart,
  Check,
  ChevronRight,
  Settings,
  X,
  Download,
  Trash2,
  BookmarkPlus,
  Lock,
  Unlock,
  EyeOff,
  Eye,
  Copy,
  FolderPlus,
  FolderMinus,
  Folder,
  Layers,
} from 'lucide-react';
import { useChartStore } from '../store/useChartStore';
import {
  ActiveIndicator,
  ChartThemeSettings,
  ChartType,
  DEFAULT_CHART_SETTINGS,
  DrawingItem,
} from '../types/chart';

export interface ContextMenuState {
  x: number;
  y: number;
  price: number;
  timestamp: number | null;
  dataIndex: number | null;
  targetOverlayId?: string | null;
}

export type CopiedClipboardState =
  | { type: 'price'; price: number }
  | { type: 'overlay'; item: DrawingItem }
  | null;

interface SavedChartTemplate {
  id: string;
  name: string;
  chartType: ChartType;
  chartSettings: ChartThemeSettings;
  indicators: ActiveIndicator[];
}

const LS_CHART_TEMPLATES_KEY = 'tv_chart_templates_v1';

const BUILTIN_TEMPLATES: Array<{
  id: string;
  name: string;
  chartType: ChartType;
  patch: Partial<ChartThemeSettings>;
}> = [
  {
    id: 'builtin_tv_dark',
    name: 'TradingView Dark (Default)',
    chartType: 'candle_solid',
    patch: DEFAULT_CHART_SETTINGS,
  },
  {
    id: 'builtin_ict_mono',
    name: 'ICT / SMC Monochrome',
    chartType: 'candle_solid',
    patch: {
      bullBodyColor: '#e2e8f0',
      bearBodyColor: '#64748b',
      bullBorderColor: '#e2e8f0',
      bearBorderColor: '#64748b',
      bullWickColor: '#cbd5e1',
      bearWickColor: '#64748b',
      canvasBgColor: '#0f131a',
      gridVertColor: '#1a1f2b',
      gridHorizColor: '#1a1f2b',
    },
  },
  {
    id: 'builtin_emerald_crimson',
    name: 'Emerald & Crimson Classic',
    chartType: 'candle_solid',
    patch: {
      bullBodyColor: '#10b981',
      bearBodyColor: '#ef4444',
      bullBorderColor: '#059669',
      bearBorderColor: '#dc2626',
      bullWickColor: '#10b981',
      bearWickColor: '#ef4444',
      canvasBgColor: '#131722',
    },
  },
];

function loadChartTemplates(): SavedChartTemplate[] {
  try {
    const raw = localStorage.getItem(LS_CHART_TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveChartTemplates(list: SavedChartTemplate[]) {
  try {
    localStorage.setItem(LS_CHART_TEMPLATES_KEY, JSON.stringify(list));
  } catch {}
}

interface ChartContextMenuProps {
  menu: ContextMenuState | null;
  onClose: () => void;
  lockedCursorTs: number | null;
  onToggleLockedCursor: (ts: number | null) => void;
  copiedClipboard: CopiedClipboardState;
  onCopyPrice: (price: number) => void;
  onPaste: (price: number, ts: number | null, idx: number | null) => void;
  onOpenOrderDialog: (price: number) => void;
  onOpenTableView: () => void;
}

export const ChartContextMenu: React.FC<ChartContextMenuProps> = ({
  menu,
  onClose,
  lockedCursorTs,
  onToggleLockedCursor,
  copiedClipboard,
  onCopyPrice,
  onPaste,
  onOpenOrderDialog,
  onOpenTableView,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [tplSubOpen, setTplSubOpen] = useState(false);
  const [groupSubOpen, setGroupSubOpen] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<SavedChartTemplate[]>(() =>
    loadChartTemplates()
  );
  const [savingTpl, setSavingTpl] = useState(false);
  const [tplNameDraft, setTplNameDraft] = useState('');

  const {
    symbol,
    symbolInfo,
    liveTick,
    candles,
    replay,
    defaultLot,
    selectedOverlay,
    selectedOverlayIds,
    setSelectedOverlayIds,
    drawingsList,
    drawingGroups,
    drawingsLocked,
    watchlistVisible,
    toggleWatchlist,
    setRightSidebarTab,
    setChartSettingsModalOpen,
    setDrawingSettingsOverlayId,
    chartType,
    setChartType,
    chartSettings,
    updateChartSettings,
    resetChartSettings,
    activeIndicators,
    addAlert,
    executeOrder,
    placePaperOrder,
    bridge,
    showToast,
  } = useChartStore();

  useEffect(() => {
    if (!menu) {
      setTplSubOpen(false);
      setGroupSubOpen(false);
      setSavingTpl(false);
      return;
    }
    setSavedTemplates(loadChartTemplates());
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const digits = symbolInfo.digits ?? 2;
  const currentPrice =
    !replay.isActive && liveTick?.bid
      ? liveTick.bid
      : candles.length > 0
      ? candles[candles.length - 1].close
      : menu.price;
  const isAboveMarket = menu.price >= currentPrice;
  const rawPrice = Number(menu.price.toFixed(digits));
  const fmtPrice = menu.price.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const lotStr = Number(defaultLot.toFixed(2));

  const menuW = 296;
  const menuH = 405;
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - menuW - 12));
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - menuH - 12));
  const openSubLeft = left + menuW + 235 > window.innerWidth;

  const handleQuickPending = async (side: 'BUY' | 'SELL') => {
    onClose();
    if (replay.isActive) {
      placePaperOrder({
        side,
        order_mode: 'PENDING',
        entry_price: rawPrice,
        volume: defaultLot,
      });
      return;
    }
    await executeOrder({
      symbol,
      side,
      order_mode: 'PENDING',
      entry_price: rawPrice,
      volume: defaultLot,
      comment: 'TV Context Menu',
    });
  };

  const handleAddAlertAtPrice = async () => {
    onClose();
    await addAlert({
      id: `alert_${Date.now()}`,
      symbol,
      price: rawPrice,
      condition: isAboveMarket ? 'CROSSING_UP' : 'CROSSING_DOWN',
      note: `Chart alert @ ${fmtPrice}`,
      active: true,
      triggered: false,
    });
    if (!watchlistVisible) toggleWatchlist();
    setRightSidebarTab('alerts');
    showToast('success', `Alert added on ${symbol} @ ${fmtPrice}`);
  };

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    const name = tplNameDraft.trim();
    if (!name) return;
    const item: SavedChartTemplate = {
      id: `ctpl_${Date.now()}`,
      name,
      chartType,
      chartSettings: { ...chartSettings },
      indicators: activeIndicators.map((i) => ({ ...i })),
    };
    const next = [item, ...savedTemplates];
    setSavedTemplates(next);
    saveChartTemplates(next);
    setTplNameDraft('');
    setSavingTpl(false);
    showToast('success', `Saved chart template "${name}"`);
  };

  const handleApplySavedTemplate = (tpl: SavedChartTemplate) => {
    setChartType(tpl.chartType);
    updateChartSettings(tpl.chartSettings);
    if (Array.isArray(tpl.indicators)) {
      const store = useChartStore.getState();
      store.activeIndicators.forEach((ind) => store.removeIndicator(ind.id));
      tpl.indicators.forEach((ind, idx) => {
        store.addIndicator({
          ...ind,
          id: ind.id || `tpl_ind_${Date.now()}_${idx}`,
        });
      });
    }
    showToast('info', `Applied template "${tpl.name}"`);
    onClose();
  };

  const handleDeleteSavedTemplate = (id: string) => {
    const next = savedTemplates.filter((t) => t.id !== id);
    setSavedTemplates(next);
    saveChartTemplates(next);
  };

  const drawingsCount = drawingsList.length;

  // Context-Aware TradingView Drawing Right-Click Menu (Issues #14, #8, #9)
  const targetDrawing = menu.targetOverlayId
    ? drawingsList.find((d) => d.id === menu.targetOverlayId) || null
    : null;

  if (targetDrawing) {
    const isMulti =
      selectedOverlayIds.length > 1 && selectedOverlayIds.includes(targetDrawing.id);
    const activeIds = isMulti ? selectedOverlayIds : [targetDrawing.id];
    const activeItems = drawingsList.filter((d) => activeIds.includes(d.id));
    const allLocked =
      drawingsLocked || (activeItems.length > 0 && activeItems.every((d) => d.locked));
    const targetGroupId = (targetDrawing.extendData as any)?.groupId as string | undefined;
    const targetGroupName = (targetDrawing.extendData as any)?.groupName as string | undefined;
    const targetGroupMembers = targetGroupId
      ? drawingsList.filter((d) => (d.extendData as any)?.groupId === targetGroupId)
      : [];

    // Collect available groups on this symbol for "Add to group" submenu
    const availableGroups = new Map<string, string>();
    drawingGroups
      .filter((g) => g.symbol === symbol)
      .forEach((g) => availableGroups.set(g.id, g.name));
    drawingsList.forEach((d) => {
      const gid = (d.extendData as any)?.groupId;
      if (gid) availableGroups.set(gid, String((d.extendData as any)?.groupName || 'Group'));
    });
    const groupOptions = Array.from(availableGroups.entries()).map(([id, name]) => ({
      id,
      name,
    }));

    return (
      <div
        ref={menuRef}
        style={{ left: `${left}px`, top: `${top}px`, width: `${menuW}px` }}
        onContextMenu={(e) => e.preventDefault()}
        className="fixed z-50 bg-[#1e222d] border border-[#363a45] rounded-md shadow-2xl py-1.5 text-[12.5px] text-[#d1d4dc] select-none"
      >
        <div className="px-3 py-1 text-[10.5px] uppercase tracking-wider text-[#787b86] flex items-center justify-between border-b border-[#2a2e39] mb-1">
          <span className="truncate">
            {isMulti ? `${activeIds.length} Drawings Selected` : targetDrawing.name}
          </span>
          {targetGroupName && !isMulti && (
            <span className="px-1.5 py-0.2 rounded bg-[#2962ff]/15 text-[#2962ff] text-[9.5px] normal-case truncate max-w-[110px]">
              {targetGroupName}
            </span>
          )}
        </div>

        {/* Settings */}
        {!isMulti && (
          <button
            onClick={() => {
              setDrawingSettingsOverlayId(targetDrawing.id);
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
          >
            <Settings className="w-4 h-4 text-[#9598a1] shrink-0" />
            <span className="flex-1">Settings...</span>
          </button>
        )}

        {/* Copy / Clone */}
        {!isMulti && (
          <button
            onClick={() => {
              bridge.copyOverlayById?.(targetDrawing.id);
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
          >
            <Copy className="w-4 h-4 text-[#9598a1] shrink-0" />
            <span className="flex-1">Copy</span>
            <span className="text-[10.5px] text-[#787b86]">Ctrl+C</span>
          </button>
        )}

        {/* Lock / Unlock */}
        <button
          onClick={() => {
            if (isMulti) {
              bridge.updateMultipleOverlaysStyle?.(activeIds, { locked: !allLocked });
            } else {
              bridge.toggleSingleOverlayLock?.(targetDrawing.id);
            }
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
        >
          {targetDrawing.locked || (isMulti && allLocked) ? (
            <Unlock className="w-4 h-4 text-[#f59e0b] shrink-0" />
          ) : (
            <Lock className="w-4 h-4 text-[#9598a1] shrink-0" />
          )}
          <span className="flex-1">
            {isMulti
              ? allLocked
                ? 'Unlock selected'
                : 'Lock selected'
              : targetDrawing.locked
              ? 'Unlock'
              : 'Lock'}
          </span>
        </button>

        {/* Hide / Show */}
        <button
          onClick={() => {
            if (isMulti) {
              bridge.updateMultipleOverlaysStyle?.(activeIds, { visible: false });
              setSelectedOverlayIds([]);
            } else {
              bridge.toggleSingleOverlayVisible?.(targetDrawing.id);
            }
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
        >
          {targetDrawing.visible !== false ? (
            <EyeOff className="w-4 h-4 text-[#9598a1] shrink-0" />
          ) : (
            <Eye className="w-4 h-4 text-[#2962ff] shrink-0" />
          )}
          <span className="flex-1">
            {isMulti ? 'Hide selected' : targetDrawing.visible !== false ? 'Hide' : 'Show'}
          </span>
        </button>

        <div className="my-1 border-t border-[#2a2e39]" />

        {/* Group Actions (Issue #9) */}
        {isMulti ? (
          <button
            onClick={() => {
              bridge.groupOverlays?.(activeIds);
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
          >
            <FolderPlus className="w-4 h-4 text-[#2962ff] shrink-0" />
            <span className="flex-1">Group selected</span>
            <span className="text-[10.5px] text-[#787b86]">Ctrl+G</span>
          </button>
        ) : !targetGroupId ? (
          <button
            onClick={() => {
              bridge.groupOverlays?.([targetDrawing.id]);
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
          >
            <FolderPlus className="w-4 h-4 text-[#2962ff] shrink-0" />
            <span className="flex-1">Create group from drawing</span>
          </button>
        ) : (
          <>
            <button
              onClick={() => {
                setSelectedOverlayIds(targetGroupMembers.map((m) => m.id));
                onClose();
              }}
              className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
            >
              <Folder className="w-4 h-4 text-[#2962ff] shrink-0" />
              <span className="flex-1">
                Select group ({targetGroupMembers.length})
              </span>
            </button>
            <button
              onClick={() => {
                bridge.cloneOverlayGroup?.(targetGroupId);
                onClose();
              }}
              className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
            >
              <Copy className="w-4 h-4 text-[#9598a1] shrink-0" />
              <span className="flex-1">Clone group</span>
            </button>
            <button
              onClick={() => {
                bridge.removeOverlayFromGroup?.(targetDrawing.id);
                onClose();
              }}
              className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
            >
              <FolderMinus className="w-4 h-4 text-[#f59e0b] shrink-0" />
              <span className="flex-1">Remove from group</span>
            </button>
            <button
              onClick={() => {
                bridge.ungroupOverlays?.(targetGroupMembers.map((m) => m.id));
                onClose();
              }}
              className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
            >
              <FolderMinus className="w-4 h-4 text-[#f59e0b] shrink-0" />
              <span className="flex-1">Ungroup all</span>
              <span className="text-[10.5px] text-[#787b86]">Ctrl+Shift+G</span>
            </button>
          </>
        )}

        {groupOptions.length > 0 && (
          <div
            className="relative"
            onMouseEnter={() => setGroupSubOpen(true)}
            onMouseLeave={() => setGroupSubOpen(false)}
          >
            <button
              type="button"
              onClick={() => setGroupSubOpen((v) => !v)}
              className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
            >
              <Folder className="w-4 h-4 text-[#9598a1] shrink-0" />
              <span className="flex-1">Add to group</span>
              <ChevronRight className="w-3.5 h-3.5 text-[#787b86]" />
            </button>
            {groupSubOpen && (
              <div
                style={{ left: openSubLeft ? -192 : menuW - 4 }}
                className="absolute top-0 w-48 bg-[#1e222d] border border-[#363a45] rounded-md shadow-2xl py-1 z-50"
              >
                {groupOptions.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => {
                      bridge.addOverlaysToGroup?.(activeIds, g.id, g.name);
                      onClose();
                    }}
                    className="w-full px-3 py-1.5 hover:bg-[#2a2e39] text-left flex items-center gap-2 truncate cursor-pointer"
                  >
                    <Folder className="w-3.5 h-3.5 text-[#2962ff] shrink-0" />
                    <span className="truncate">{g.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Object Tree */}
        <button
          onClick={() => {
            if (!watchlistVisible) toggleWatchlist();
            setRightSidebarTab('objects');
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
        >
          <Layers className="w-4 h-4 text-[#9598a1] shrink-0" />
          <span className="flex-1">Object tree...</span>
        </button>

        <div className="my-1 border-t border-[#2a2e39]" />

        {/* Remove drawing (Lock-protected per Issue #8) */}
        <button
          disabled={allLocked}
          onClick={() => {
            if (isMulti) {
              bridge.deleteMultipleOverlays?.(activeIds);
            } else {
              bridge.deleteSingleOverlay?.(targetDrawing.id);
            }
            onClose();
          }}
          title={allLocked ? 'Unlock drawing first to delete' : 'Delete drawing (Del)'}
          className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#f23645]/15 text-[#f23645] disabled:text-[#787b86] disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed text-left cursor-pointer"
        >
          <Trash2 className="w-4 h-4 shrink-0" />
          <span className="flex-1">
            {allLocked
              ? 'Locked (unlock to remove)'
              : isMulti
              ? `Remove ${activeIds.length} drawings`
              : 'Remove drawing'}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      style={{ left: `${left}px`, top: `${top}px`, width: `${menuW}px` }}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-50 bg-[#1e222d] border border-[#363a45] rounded-md shadow-2xl py-1.5 text-[12.5px] text-[#d1d4dc] select-none"
    >
      {/* Section 1: Reset chart view */}
      <button
        onClick={() => {
          bridge.resetChartScale?.();
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
      >
        <RotateCcw className="w-4 h-4 text-[#9598a1] shrink-0" />
        <span className="flex-1">Reset chart view</span>
        <span className="text-[11px] text-[#787b86] font-mono-num">Alt + R</span>
      </button>

      <div className="my-1 border-t border-[#2a2e39]" />

      {/* Section 2: Copy price / Paste */}
      <button
        onClick={() => {
          onCopyPrice(rawPrice);
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
      >
        <span className="w-4 shrink-0" />
        <span className="flex-1 truncate">Copy price {fmtPrice}</span>
      </button>

      <button
        disabled={!copiedClipboard}
        onClick={() => {
          onPaste(rawPrice, menu.timestamp, menu.dataIndex);
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed text-left cursor-pointer"
      >
        <span className="w-4 shrink-0" />
        <span className="flex-1">Paste</span>
        <span className="text-[11px] text-[#787b86] font-mono-num">Ctrl + V</span>
      </button>

      <div className="my-1 border-t border-[#2a2e39]" />

      {/* Section 3: Alert + Smart Limit / Stop Orders + Order Dialog */}
      <button
        onClick={handleAddAlertAtPrice}
        className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
      >
        <AlarmClockPlus className="w-4 h-4 text-[#9598a1] shrink-0" />
        <span className="flex-1 truncate">
          Add alert on {symbol} at {fmtPrice}...
        </span>
        <span className="text-[11px] text-[#787b86] font-mono-num shrink-0">Alt + A</span>
      </button>

      {isAboveMarket ? (
        <>
          <button
            onClick={() => handleQuickPending('SELL')}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
          >
            <ChevronsDown className="w-4 h-4 text-[#f23645] shrink-0" />
            <span className="flex-1 truncate">
              Sell {lotStr} {symbol} @ {fmtPrice} limit
            </span>
            <span className="text-[10.5px] text-[#787b86] font-mono-num shrink-0">
              Alt + Shift + S
            </span>
          </button>
          <button
            onClick={() => handleQuickPending('BUY')}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
          >
            <ChevronsUp className="w-4 h-4 text-[#089981] shrink-0" />
            <span className="flex-1 truncate">
              Buy {lotStr} {symbol} @ {fmtPrice} stop
            </span>
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => handleQuickPending('BUY')}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
          >
            <ChevronsUp className="w-4 h-4 text-[#089981] shrink-0" />
            <span className="flex-1 truncate">
              Buy {lotStr} {symbol} @ {fmtPrice} limit
            </span>
            <span className="text-[10.5px] text-[#787b86] font-mono-num shrink-0">
              Alt + Shift + B
            </span>
          </button>
          <button
            onClick={() => handleQuickPending('SELL')}
            className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
          >
            <ChevronsDown className="w-4 h-4 text-[#f23645] shrink-0" />
            <span className="flex-1 truncate">
              Sell {lotStr} {symbol} @ {fmtPrice} stop
            </span>
            <span className="text-[10.5px] text-[#787b86] font-mono-num shrink-0">
              Alt + Shift + S
            </span>
          </button>
        </>
      )}

      <button
        onClick={() => {
          onOpenOrderDialog(rawPrice);
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
      >
        <LineChart className="w-4 h-4 text-[#9598a1] shrink-0" />
        <span className="flex-1 truncate">
          Add order on {symbol} at {fmtPrice}...
        </span>
        <span className="text-[11px] text-[#787b86] font-mono-num shrink-0">Shift + T</span>
      </button>

      <div className="my-1 border-t border-[#2a2e39]" />

      {/* Section 4: Lock vertical cursor line by time */}
      <button
        onClick={() => {
          if (lockedCursorTs !== null) {
            onToggleLockedCursor(null);
          } else {
            const fallbackTs =
              menu.timestamp ??
              (candles.length > 0 ? candles[candles.length - 1].timestamp : Date.now());
            onToggleLockedCursor(fallbackTs);
          }
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
      >
        <span className="w-4 flex items-center justify-center shrink-0">
          {lockedCursorTs !== null && <Check className="w-3.5 h-3.5 text-[#2962ff]" />}
        </span>
        <span className="flex-1">Lock vertical cursor line by time</span>
      </button>

      <div className="my-1 border-t border-[#2a2e39]" />

      {/* Section 5: Table view / Object tree / Chart template */}
      <button
        onClick={() => {
          onOpenTableView();
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
      >
        <span className="w-4 shrink-0" />
        <span className="flex-1">Table view</span>
      </button>

      <button
        onClick={() => {
          if (!watchlistVisible) toggleWatchlist();
          setRightSidebarTab('objects');
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
      >
        <span className="w-4 shrink-0" />
        <span className="flex-1">Object tree</span>
      </button>

      {/* Chart template submenu */}
      <div
        className="relative"
        onMouseEnter={() => setTplSubOpen(true)}
        onMouseLeave={() => {
          if (!savingTpl) setTplSubOpen(false);
        }}
      >
        <button
          onClick={() => setTplSubOpen((v) => !v)}
          className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
        >
          <span className="w-4 shrink-0" />
          <span className="flex-1">Chart template</span>
          <ChevronRight className="w-3.5 h-3.5 text-[#787b86]" />
        </button>

        {tplSubOpen && (
          <div
            className={`absolute top-0 w-60 bg-[#1e222d] border border-[#363a45] rounded-md shadow-2xl py-1.5 z-50 ${
              openSubLeft ? 'right-full mr-1' : 'left-full ml-1'
            }`}
          >
            {savingTpl ? (
              <form onSubmit={handleSaveTemplate} className="px-2.5 py-1.5 space-y-1.5">
                <input
                  autoFocus
                  value={tplNameDraft}
                  onChange={(e) => setTplNameDraft(e.target.value)}
                  placeholder="Template name..."
                  className="w-full px-2 py-1 rounded bg-[#131722] border border-[#2962ff] text-[12px] text-white outline-none"
                />
                <div className="flex gap-1">
                  <button
                    type="submit"
                    className="flex-1 py-1 rounded bg-[#2962ff] text-white text-[11px] font-medium cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setSavingTpl(false)}
                    className="px-2 py-1 rounded bg-[#2a2e39] text-[#d1d4dc] text-[11px] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setSavingTpl(true)}
                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[#2a2e39] text-left cursor-pointer"
              >
                <BookmarkPlus className="w-3.5 h-3.5 text-[#2962ff]" />
                <span>Save chart template as...</span>
              </button>
            )}

            <button
              onClick={() => {
                resetChartSettings();
                setChartType('candle_solid');
                showToast('info', 'Applied default chart template');
                onClose();
              }}
              className="w-full px-3 py-1.5 hover:bg-[#2a2e39] text-left cursor-pointer"
            >
              Apply default template
            </button>

            <div className="my-1 border-t border-[#2a2e39]" />
            <div className="px-3 py-0.5 text-[10px] uppercase tracking-wider text-[#787b86]">
              Presets
            </div>
            {BUILTIN_TEMPLATES.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setChartType(p.chartType);
                  updateChartSettings(p.patch);
                  showToast('info', `Applied "${p.name}"`);
                  onClose();
                }}
                className="w-full px-3 py-1.5 hover:bg-[#2a2e39] text-left truncate cursor-pointer"
              >
                {p.name}
              </button>
            ))}

            {savedTemplates.length > 0 && (
              <>
                <div className="my-1 border-t border-[#2a2e39]" />
                <div className="px-3 py-0.5 text-[10px] uppercase tracking-wider text-[#787b86]">
                  Saved Templates
                </div>
                {savedTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="group px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-[#2a2e39] cursor-pointer"
                    onClick={() => handleApplySavedTemplate(tpl)}
                  >
                    <span className="truncate flex-1">{tpl.name}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSavedTemplate(tpl.id);
                      }}
                      title="Delete template"
                      className="opacity-0 group-hover:opacity-100 text-[#787b86] hover:text-[#f23645] cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <div className="my-1 border-t border-[#2a2e39]" />

      {/* Section 6: Remove drawings */}
      <button
        disabled={
          (!selectedOverlay && drawingsCount === 0) ||
          Boolean(selectedOverlay && (selectedOverlay.locked || drawingsLocked))
        }
        onClick={() => {
          if (selectedOverlay) {
            bridge.deleteSelectedOverlay?.();
          } else if (drawingsCount > 0) {
            bridge.clearAllOverlays?.();
          }
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed text-left cursor-pointer"
      >
        <span className="w-4 shrink-0" />
        <span className="flex-1">
          {selectedOverlay
            ? selectedOverlay.locked || drawingsLocked
              ? 'Drawing locked (unlock to remove)'
              : 'Remove 1 drawing'
            : `Remove ${drawingsCount} ${drawingsCount === 1 ? 'drawing' : 'drawings'}`}
        </span>
      </button>

      <div className="my-1 border-t border-[#2a2e39]" />

      {/* Section 7: Settings... */}
      <button
        onClick={() => {
          if (selectedOverlay) {
            setDrawingSettingsOverlayId(selectedOverlay.id);
          } else {
            setChartSettingsModalOpen(true);
          }
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-[#2a2e39] text-left cursor-pointer"
      >
        <Settings className="w-4 h-4 text-[#9598a1] shrink-0" />
        <span className="flex-1">Settings...</span>
      </button>
    </div>
  );
};

// --- Pre-filled Order Ticket Modal (Shift + T / Add order on...) ---
interface ChartOrderTicketModalProps {
  initialPrice: number | null;
  onClose: () => void;
}

export const ChartOrderTicketModal: React.FC<ChartOrderTicketModalProps> = ({
  initialPrice,
  onClose,
}) => {
  const {
    symbol,
    symbolInfo,
    liveTick,
    candles,
    replay,
    defaultLot,
    riskPct,
    executeOrder,
    placePaperOrder,
  } = useChartStore();

  const digits = symbolInfo.digits ?? 2;
  const pipSize = (symbolInfo.point || Math.pow(10, -digits)) * 10;
  const currentPrice =
    !replay.isActive && liveTick?.bid
      ? liveTick.bid
      : candles.length > 0
      ? candles[candles.length - 1].close
      : initialPrice ?? 0;

  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderMode, setOrderMode] = useState<'PENDING' | 'MARKET'>('PENDING');
  const [entryStr, setEntryStr] = useState('');
  const [sizeMode, setSizeMode] = useState<'lot' | 'risk'>('lot');
  const [lotStr, setLotStr] = useState(String(defaultLot));
  const [riskStr, setRiskStr] = useState(String(riskPct));
  const [slStr, setSlStr] = useState('');
  const [tpStr, setTpStr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialPrice === null) return;
    setSide(initialPrice >= currentPrice ? 'SELL' : 'BUY');
    setOrderMode('PENDING');
    setEntryStr(initialPrice.toFixed(digits));
    setLotStr(String(defaultLot));
    setRiskStr(String(riskPct));
    setSlStr('');
    setTpStr('');
  }, [initialPrice, currentPrice, digits, defaultLot, riskPct]);

  if (initialPrice === null) return null;

  const entryNum = orderMode === 'MARKET' ? currentPrice : parseFloat(entryStr) || initialPrice;
  const pendingSubtype =
    side === 'BUY'
      ? entryNum < currentPrice
        ? 'BUY LIMIT'
        : 'BUY STOP'
      : entryNum > currentPrice
      ? 'SELL LIMIT'
      : 'SELL STOP';

  const applyQuickSl = (pips: number) => {
    const val = side === 'BUY' ? entryNum - pips * pipSize : entryNum + pips * pipSize;
    setSlStr(val.toFixed(digits));
  };

  const applyQuickTpRR = (rr: number) => {
    const slNum = parseFloat(slStr);
    const riskDist = Number.isFinite(slNum) && slNum > 0 ? Math.abs(entryNum - slNum) : 20 * pipSize;
    const val = side === 'BUY' ? entryNum + riskDist * rr : entryNum - riskDist * rr;
    setTpStr(val.toFixed(digits));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const slNum = parseFloat(slStr);
      const tpNum = parseFloat(tpStr);
      const volume = sizeMode === 'lot' ? parseFloat(lotStr) || defaultLot : undefined;
      const risk_pct = sizeMode === 'risk' ? parseFloat(riskStr) || riskPct : undefined;

      if (replay.isActive) {
        placePaperOrder({
          side,
          order_mode: orderMode,
          entry_price: orderMode === 'PENDING' ? entryNum : undefined,
          sl: Number.isFinite(slNum) && slNum > 0 ? slNum : undefined,
          tp: Number.isFinite(tpNum) && tpNum > 0 ? tpNum : undefined,
          volume,
          risk_pct,
        });
        onClose();
      } else {
        const ok = await executeOrder({
          symbol,
          side,
          order_mode: orderMode,
          entry_price: orderMode === 'PENDING' ? entryNum : undefined,
          sl: Number.isFinite(slNum) && slNum > 0 ? slNum : undefined,
          tp: Number.isFinite(tpNum) && tpNum > 0 ? tpNum : undefined,
          volume,
          risk_pct,
          comment: 'TV Order Ticket',
        });
        if (ok) onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[360px] bg-[#1e222d] border border-[#363a45] rounded-lg shadow-2xl overflow-hidden text-[12px] text-[#d1d4dc]"
      >
        <div className="px-4 py-3 border-b border-[#2a2e39] flex items-center justify-between">
          <div>
            <div className="text-[14px] font-semibold text-white">
              Order Ticket · {symbol}
            </div>
            <div className="text-[10.5px] text-[#787b86]">
              {replay.isActive ? 'Replay Paper Mode' : 'Live MT5'} · Market:{' '}
              {currentPrice.toFixed(digits)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* BUY / SELL */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setSide('BUY')}
              className={`py-2 rounded font-semibold cursor-pointer transition-colors ${
                side === 'BUY'
                  ? 'bg-[#089981] text-white'
                  : 'bg-[#131722] text-[#787b86] hover:text-white'
              }`}
            >
              BUY
            </button>
            <button
              type="button"
              onClick={() => setSide('SELL')}
              className={`py-2 rounded font-semibold cursor-pointer transition-colors ${
                side === 'SELL'
                  ? 'bg-[#f23645] text-white'
                  : 'bg-[#131722] text-[#787b86] hover:text-white'
              }`}
            >
              SELL
            </button>
          </div>

          {/* PENDING / MARKET */}
          <div className="grid grid-cols-2 gap-1.5 bg-[#131722] p-1 rounded border border-[#2a2e39]">
            <button
              type="button"
              onClick={() => setOrderMode('PENDING')}
              className={`py-1 rounded text-[11.5px] font-medium cursor-pointer ${
                orderMode === 'PENDING' ? 'bg-[#2962ff] text-white' : 'text-[#787b86]'
              }`}
            >
              Pending ({pendingSubtype})
            </button>
            <button
              type="button"
              onClick={() => setOrderMode('MARKET')}
              className={`py-1 rounded text-[11.5px] font-medium cursor-pointer ${
                orderMode === 'MARKET' ? 'bg-[#2962ff] text-white' : 'text-[#787b86]'
              }`}
            >
              Market
            </button>
          </div>

          {/* Entry Price */}
          {orderMode === 'PENDING' && (
            <div>
              <label className="block text-[11px] text-[#787b86] mb-1">Entry Price</label>
              <input
                type="number"
                step="any"
                required
                value={entryStr}
                onChange={(e) => setEntryStr(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-[#131722] border border-[#2a2e39] font-mono-num text-white outline-none focus:border-[#2962ff]"
              />
            </div>
          )}

          {/* Sizing: Lot or % Risk */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] text-[#787b86]">Position Size</label>
              <div className="flex gap-1 text-[10.5px]">
                <button
                  type="button"
                  onClick={() => setSizeMode('lot')}
                  className={`px-1.5 py-0.5 rounded cursor-pointer ${
                    sizeMode === 'lot' ? 'bg-[#2962ff] text-white' : 'text-[#787b86]'
                  }`}
                >
                  Lot
                </button>
                <button
                  type="button"
                  onClick={() => setSizeMode('risk')}
                  className={`px-1.5 py-0.5 rounded cursor-pointer ${
                    sizeMode === 'risk' ? 'bg-[#2962ff] text-white' : 'text-[#787b86]'
                  }`}
                >
                  % Risk
                </button>
              </div>
            </div>
            {sizeMode === 'lot' ? (
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={lotStr}
                onChange={(e) => setLotStr(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-[#131722] border border-[#2a2e39] font-mono-num text-white outline-none focus:border-[#2962ff]"
              />
            ) : (
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={riskStr}
                onChange={(e) => setRiskStr(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-[#131722] border border-[#2a2e39] font-mono-num text-white outline-none focus:border-[#2962ff]"
              />
            )}
          </div>

          {/* Stop Loss */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] text-[#787b86]">Stop Loss (optional)</label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => applyQuickSl(20)}
                  className="px-1.5 py-0.5 rounded bg-[#2a2e39] hover:bg-[#363a45] text-[10px] font-mono-num cursor-pointer"
                >
                  -20p
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickSl(50)}
                  className="px-1.5 py-0.5 rounded bg-[#2a2e39] hover:bg-[#363a45] text-[10px] font-mono-num cursor-pointer"
                >
                  -50p
                </button>
              </div>
            </div>
            <input
              type="number"
              step="any"
              placeholder="None"
              value={slStr}
              onChange={(e) => setSlStr(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded bg-[#131722] border border-[#2a2e39] font-mono-num text-white outline-none focus:border-[#f23645]"
            />
          </div>

          {/* Take Profit */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] text-[#787b86]">Take Profit (optional)</label>
              <div className="flex gap-1">
                {[1, 2, 3].map((rr) => (
                  <button
                    key={rr}
                    type="button"
                    onClick={() => applyQuickTpRR(rr)}
                    className="px-1.5 py-0.5 rounded bg-[#2a2e39] hover:bg-[#363a45] text-[10px] font-mono-num cursor-pointer"
                  >
                    1:{rr}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="number"
              step="any"
              placeholder="None"
              value={tpStr}
              onChange={(e) => setTpStr(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded bg-[#131722] border border-[#2a2e39] font-mono-num text-white outline-none focus:border-[#089981]"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className={`w-full py-2 rounded font-semibold text-white transition-colors cursor-pointer disabled:opacity-50 ${
              side === 'BUY'
                ? 'bg-[#089981] hover:bg-[#067a67]'
                : 'bg-[#f23645] hover:bg-[#d12938]'
            }`}
          >
            {submitting
              ? 'Placing...'
              : `Place ${orderMode === 'MARKET' ? `${side} Market` : pendingSubtype}`}
          </button>
        </div>
      </form>
    </div>
  );
};

// --- OHLCV Data Table View Modal ---
interface ChartTableViewModalProps {
  open: boolean;
  onClose: () => void;
}

export const ChartTableViewModal: React.FC<ChartTableViewModalProps> = ({ open, onClose }) => {
  const { symbol, timeframe, symbolInfo, candles } = useChartStore();
  const digits = symbolInfo.digits ?? 2;

  const rows = useMemo(() => {
    if (!open) return [];
    const slice = candles.slice(-300);
    return slice.reverse();
  }, [open, candles]);

  if (!open) return null;

  const handleExportCsv = () => {
    const header = 'Timestamp,TimeUTC,Open,High,Low,Close,ChangePct,Volume\n';
    const body = rows
      .map((c) => {
        const chg = c.open > 0 ? (((c.close - c.open) / c.open) * 100).toFixed(3) : '0.000';
        return `${c.timestamp},${new Date(c.timestamp).toISOString()},${c.open.toFixed(digits)},${c.high.toFixed(digits)},${c.low.toFixed(digits)},${c.close.toFixed(digits)},${chg},${c.volume ?? 0}`;
      })
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${symbol}_${timeframe}_ohlcv.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[820px] max-h-[82vh] bg-[#1e222d] border border-[#363a45] rounded-lg shadow-2xl flex flex-col overflow-hidden text-[#d1d4dc]"
      >
        <div className="px-4 py-3 border-b border-[#2a2e39] flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-semibold text-white">
              OHLCV Table View · {symbol} ({timeframe})
            </h3>
            <p className="text-[11px] text-[#787b86]">Showing last {rows.length} bars</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#2962ff] hover:bg-[#1e53e5] text-white text-[11.5px] font-medium cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-[11.5px] font-mono-num">
            <thead className="sticky top-0 bg-[#131722] text-[#787b86] border-b border-[#2a2e39]">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Time</th>
                <th className="text-right px-3 py-2 font-medium">Open</th>
                <th className="text-right px-3 py-2 font-medium">High</th>
                <th className="text-right px-3 py-2 font-medium">Low</th>
                <th className="text-right px-3 py-2 font-medium">Close</th>
                <th className="text-right px-3 py-2 font-medium">Change %</th>
                <th className="text-right px-3 py-2 font-medium">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2e39]/40">
              {rows.map((c) => {
                const chg = c.open > 0 ? ((c.close - c.open) / c.open) * 100 : 0;
                const isUp = c.close >= c.open;
                return (
                  <tr key={c.timestamp} className="hover:bg-[#2a2e39]/40">
                    <td className="px-3 py-1.5 text-[#9598a1]">
                      {new Date(c.timestamp).toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5 text-right">{c.open.toFixed(digits)}</td>
                    <td className="px-3 py-1.5 text-right">{c.high.toFixed(digits)}</td>
                    <td className="px-3 py-1.5 text-right">{c.low.toFixed(digits)}</td>
                    <td
                      className={`px-3 py-1.5 text-right font-semibold ${
                        isUp ? 'text-[#089981]' : 'text-[#f23645]'
                      }`}
                    >
                      {c.close.toFixed(digits)}
                    </td>
                    <td
                      className={`px-3 py-1.5 text-right ${
                        isUp ? 'text-[#089981]' : 'text-[#f23645]'
                      }`}
                    >
                      {isUp ? '+' : ''}
                      {chg.toFixed(2)}%
                    </td>
                    <td className="px-3 py-1.5 text-right text-[#787b86]">
                      {(c.volume ?? 0).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
