import React, { useEffect, useRef, useState } from 'react';
import {
  Plus,
  X,
  Database,
  Layers,
  Bell,
  List,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Trash2,
  FolderPlus,
  FolderMinus,
  Folder,
  ChevronDown,
  ChevronRight,
  Pencil,
  GripVertical,
  Copy,
} from 'lucide-react';
import { api } from '../services/api';
import { useChartStore } from '../store/useChartStore';
import { AlertCondition, DrawingItem } from '../types/chart';

const SECTION_PREFIX = '###SECTION:';

export const RightWatchlist: React.FC = () => {
  const {
    symbol,
    symbolInfo,
    liveTick,
    watchlistVisible,
    rightSidebarTab,
    setRightSidebarTab,
    watchlistSymbols,
    collapsedSections,
    toggleSectionCollapsed,
    addWatchlistSection,
    renameWatchlistSection,
    removeWatchlistItemAt,
    reorderWatchlistItems,
    watchlistTicks,
    setSymbol,
    setWatchlistTicks,
    setSymbolModalOpen,
    mt5Status,
    drawingsList,
    drawingGroups,
    drawingsLocked,
    addEmptyDrawingGroup,
    renameEmptyDrawingGroup,
    removeEmptyDrawingGroup,
    selectedOverlayIds,
    setSelectedOverlayIds,
    toggleSelectedOverlayId,
    alerts,
    addAlert,
    removeAlert,
    bridge,
  } = useChartStore();

  const [alertPrice, setAlertPrice] = useState('');
  const [alertCond, setAlertCond] = useState<AlertCondition>('CROSSING');
  const [alertNote, setAlertNote] = useState('');
  const [editingSecIdx, setEditingSecIdx] = useState<number | null>(null);
  const [editingSecText, setEditingSecText] = useState('');
  const [collapsedObjGroups, setCollapsedObjGroups] = useState<Record<string, boolean>>({});
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [draggingDrawingId, setDraggingDrawingId] = useState<string | null>(null);
  const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    if (liveTick && !alertPrice) {
      setAlertPrice(liveTick.bid.toFixed(symbolInfo.digits ?? 2));
    }
  }, [liveTick, symbolInfo.digits, alertPrice]);

  useEffect(() => {
    setAlertPrice('');
  }, [symbol]);

  useEffect(() => {
    const realSymbols = watchlistSymbols.filter((s) => !s.startsWith(SECTION_PREFIX));
    if (!watchlistVisible || realSymbols.length === 0) return;

    let cancelled = false;
    const poll = () => {
      api
        .getTicks(realSymbols)
        .then((ticks) => {
          if (!cancelled) setWatchlistTicks(ticks);
        })
        .catch(() => {});
    };

    poll();
    const timer = window.setInterval(poll, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [watchlistVisible, watchlistSymbols, setWatchlistTicks]);

  const handleRowDragStart = (e: React.MouseEvent, idx: number, immediate = false) => {
    if (e.button !== 0) return;
    // Don't start row drag when interacting with buttons or inputs inside the row
    const target = e.target as HTMLElement | null;
    if (!immediate && target?.closest('button, input')) return;

    if (immediate) {
      e.stopPropagation();
      e.preventDefault();
    }

    const startY = e.clientY;
    let moved = immediate;
    let curIdx = idx;
    if (immediate) {
      setDraggingIdx(idx);
    }

    const onMove = (ev: MouseEvent) => {
      if (!moved && Math.abs(ev.clientY - startY) >= 5) {
        moved = true;
        setDraggingIdx(curIdx);
      }
      if (!moved) return;

      const listLen = useChartStore.getState().watchlistSymbols.length;
      for (let i = 0; i < listLen; i++) {
        if (i === curIdx) continue;
        const el = rowRefs.current[i];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if ((i > curIdx && ev.clientY > midY) || (i < curIdx && ev.clientY < midY)) {
          reorderWatchlistItems(curIdx, i);
          curIdx = i;
          setDraggingIdx(i);
          break;
        }
      }
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (moved) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }
      setDraggingIdx(null);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  if (!watchlistVisible) return null;

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = parseFloat(alertPrice);
    if (Number.isNaN(priceNum) || priceNum <= 0) return;
    await addAlert({
      id: `alert_${Date.now()}`,
      symbol,
      price: priceNum,
      condition: alertCond,
      note: alertNote.trim(),
      active: true,
      triggered: false,
    });
    setAlertNote('');
  };

  return (
    <aside className="w-[270px] bg-[#1e222d] border-l border-[#2a2e39] flex flex-col shrink-0 z-20">
      {/* 3-Tab Header */}
      <div className="h-[34px] px-1.5 border-b border-[#2a2e39] flex items-center gap-0.5">
        <button
          onClick={() => setRightSidebarTab('watchlist')}
          className={`flex-1 flex items-center justify-center gap-1 h-[26px] rounded text-[11px] font-medium transition-colors ${
            rightSidebarTab === 'watchlist'
              ? 'bg-[#2962ff]/15 text-[#2962ff]'
              : 'text-[#787b86] hover:text-[#d1d4dc]'
          }`}
        >
          <List className="w-3.5 h-3.5" />
          <span>Watch</span>
        </button>
        <button
          onClick={() => setRightSidebarTab('objects')}
          className={`flex-1 flex items-center justify-center gap-1 h-[26px] rounded text-[11px] font-medium transition-colors ${
            rightSidebarTab === 'objects'
              ? 'bg-[#2962ff]/15 text-[#2962ff]'
              : 'text-[#787b86] hover:text-[#d1d4dc]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Objects ({drawingsList.length})</span>
        </button>
        <button
          onClick={() => setRightSidebarTab('alerts')}
          className={`flex-1 flex items-center justify-center gap-1 h-[26px] rounded text-[11px] font-medium transition-colors ${
            rightSidebarTab === 'alerts'
              ? 'bg-[#2962ff]/15 text-[#2962ff]'
              : 'text-[#787b86] hover:text-[#d1d4dc]'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>Alerts ({alerts.filter((a) => a.active).length})</span>
        </button>
      </div>

      {/* TAB 1: WATCHLIST */}
      {rightSidebarTab === 'watchlist' && (
        <>
          <div className="px-3 py-1.5 border-b border-[#2a2e39] flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider">
              MT5 Watchlist
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  addWatchlistSection('NEW BROKER / GROUP');
                  setEditingSecIdx(0);
                  setEditingSecText('NEW BROKER / GROUP');
                }}
                title="Add Section Separator (Broker / Group)"
                className="p-0.5 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-[#2962ff]"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setSymbolModalOpen(true)}
                title="Add Symbol (Ctrl+K)"
                className="p-0.5 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc]"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-12 px-3 py-1 text-[10.5px] text-[#787b86] border-b border-[#2a2e39]">
            <span className="col-span-4">Symbol</span>
            <span className="col-span-3 text-right">Bid</span>
            <span className="col-span-3 text-right">Ask</span>
            <span className="col-span-2 text-right">Spr</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#2a2e39]/30">
            {(() => {
              let activeSectionKey = '';
              return watchlistSymbols.map((entry, idx) => {
                const isSection = entry.startsWith(SECTION_PREFIX);
                if (isSection) {
                  activeSectionKey = entry;
                  const label = entry.slice(SECTION_PREFIX.length);
                  const isCollapsed = Boolean(collapsedSections[entry]);
                  const isEditing = editingSecIdx === idx;
                  return (
                    <div
                      key={`${entry}_${idx}`}
                      ref={(el) => {
                        rowRefs.current[idx] = el;
                      }}
                      onMouseDown={(e) => handleRowDragStart(e, idx)}
                      className={`group bg-[#131722] border-y border-[#2a2e39] px-2 py-1.5 flex items-center justify-between gap-1 select-none ${
                        draggingIdx === idx
                          ? 'ring-1 ring-[#2962ff] opacity-80 cursor-grabbing'
                          : 'cursor-grab'
                      }`}
                    >
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        <div
                          onMouseDown={(e) => handleRowDragStart(e, idx, true)}
                          title="Drag to reorder section"
                          className="cursor-grab text-[#787b86] hover:text-[#d1d4dc]"
                        >
                          <GripVertical className="w-3 h-3" />
                        </div>
                        <button
                          onClick={() => toggleSectionCollapsed(entry)}
                          className="text-[#787b86] hover:text-[#d1d4dc]"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editingSecText}
                            onChange={(e) => setEditingSecText(e.target.value)}
                            onBlur={() => {
                              renameWatchlistSection(idx, editingSecText);
                              setEditingSecIdx(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                renameWatchlistSection(idx, editingSecText);
                                setEditingSecIdx(null);
                              } else if (e.key === 'Escape') {
                                setEditingSecIdx(null);
                              }
                            }}
                            className="flex-1 min-w-0 px-1 py-0.5 rounded bg-[#1e222d] border border-[#2962ff] text-[10.5px] font-bold uppercase text-white outline-none"
                          />
                        ) : (
                          <span
                            onDoubleClick={() => {
                              setEditingSecIdx(idx);
                              setEditingSecText(label);
                            }}
                            className="text-[10.5px] font-bold uppercase tracking-wider text-[#2962ff] truncate cursor-pointer"
                            title="Double-click to rename section"
                          >
                            {label}
                          </span>
                        )}
                      </div>

                      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => {
                            setEditingSecIdx(idx);
                            setEditingSecText(label);
                          }}
                          title="Rename section"
                          className="p-0.5 rounded text-[#787b86] hover:text-[#d1d4dc]"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => removeWatchlistItemAt(idx)}
                          title="Remove section separator"
                          className="p-0.5 rounded text-[#787b86] hover:text-[#f23645]"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                }

                // Hide pair if its parent section is collapsed
                if (activeSectionKey && collapsedSections[activeSectionKey]) {
                  return null;
                }

                const sym = entry;
                const tick = watchlistTicks[sym];
                const isSelected = sym === symbol;
                const digits = tick?.digits ?? 2;
                const chg = tick?.change_pct ?? 0;
                const isUp = chg >= 0;

                return (
                  <div
                    key={`${sym}_${idx}`}
                    ref={(el) => {
                      rowRefs.current[idx] = el;
                    }}
                    onMouseDown={(e) => handleRowDragStart(e, idx)}
                    onClick={() => {
                      if (suppressClickRef.current) return;
                      setSymbol(sym);
                    }}
                    className={`group grid grid-cols-12 items-center px-2 py-2 transition-colors select-none ${
                      draggingIdx === idx
                        ? 'bg-[#2962ff]/25 ring-1 ring-[#2962ff] cursor-grabbing'
                        : isSelected
                        ? 'bg-[#2962ff]/15 border-l-2 border-l-[#2962ff] cursor-pointer'
                        : 'hover:bg-[#2a2e39]/60 border-l-2 border-l-transparent cursor-pointer'
                    }`}
                  >
                    <div className="col-span-4 flex items-center gap-1 min-w-0">
                      <div
                        onMouseDown={(e) => handleRowDragStart(e, idx, true)}
                        title="Drag to reorder pair"
                        className="opacity-0 group-hover:opacity-100 cursor-grab text-[#787b86] hover:text-[#d1d4dc] shrink-0"
                      >
                        <GripVertical className="w-3 h-3" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[12px] font-semibold text-[#d1d4dc] truncate">
                          {sym}
                        </span>
                        <span
                          className={`text-[10px] font-mono-num ${
                            isUp ? 'text-[#089981]' : 'text-[#f23645]'
                          }`}
                        >
                          {tick ? `${isUp ? '+' : ''}${chg.toFixed(2)}%` : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="col-span-3 text-right font-mono-num text-[11.5px] text-[#089981]">
                      {tick ? tick.bid.toFixed(digits) : '—'}
                    </div>
                    <div className="col-span-3 text-right font-mono-num text-[11.5px] text-[#f23645]">
                      {tick ? tick.ask.toFixed(digits) : '—'}
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-1">
                      <span className="font-mono-num text-[10.5px] text-[#787b86] group-hover:hidden">
                        {tick ? tick.spread_points : '—'}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeWatchlistItemAt(idx);
                        }}
                        title="Remove from watchlist"
                        className="hidden group-hover:flex p-0.5 rounded text-[#787b86] hover:text-[#f23645]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </>
      )}

      {/* TAB 2: OBJECT TREE (LAYER MANAGER & DRAWING GROUPS) */}
      {rightSidebarTab === 'objects' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 py-1.5 border-b border-[#2a2e39] flex items-center justify-between text-[11px] text-[#787b86]">
            <span>Drawings on {symbol}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const defaultName = `Group ${
                    drawingGroups.filter((g) => g.symbol === symbol).length +
                    new Set(
                      drawingsList
                        .map((d) => (d.extendData as any)?.groupId)
                        .filter(Boolean)
                    ).size +
                    1
                  }`;
                  const name = window.prompt('New group folder name:', defaultName);
                  if (!name || !name.trim()) return;
                  if (selectedOverlayIds.length >= 1) {
                    bridge.groupOverlays?.(selectedOverlayIds, name.trim());
                  } else {
                    addEmptyDrawingGroup(symbol, name.trim());
                  }
                }}
                title="Create New Group Folder (from selection or empty)"
                className="flex items-center gap-0.5 text-[#2962ff] hover:underline text-[10.5px] font-medium cursor-pointer"
              >
                <FolderPlus className="w-3 h-3" />
                <span>New Group</span>
              </button>
              {drawingsList.length > 0 && (
                <button
                  onClick={() => bridge.clearAllOverlays?.()}
                  className="text-[#f23645] hover:underline text-[10.5px] cursor-pointer"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>

          {/* Multi-Select Batch Action Bar */}
          {selectedOverlayIds.length > 1 && (
            <div className="px-2.5 py-1.5 border-b border-[#2a2e39] bg-[#2962ff]/10 flex items-center justify-between gap-1.5 text-[11px]">
              <span className="font-semibold text-[#2962ff]">
                {selectedOverlayIds.length} selected
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => bridge.groupOverlays?.(selectedOverlayIds)}
                  className="px-2 py-0.5 rounded bg-[#2962ff] hover:bg-[#1e53e5] text-white text-[10.5px] font-medium cursor-pointer"
                >
                  + Group
                </button>
                <button
                  onClick={() => bridge.deleteMultipleOverlays?.(selectedOverlayIds)}
                  className="px-2 py-0.5 rounded bg-[#f23645]/20 hover:bg-[#f23645]/35 text-[#f23645] text-[10.5px] font-medium cursor-pointer"
                >
                  Delete ({selectedOverlayIds.length})
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto divide-y divide-[#2a2e39]/40">
            {drawingsList.length === 0 &&
            drawingGroups.filter((g) => g.symbol === symbol).length === 0 ? (
              <div className="p-6 text-center text-[11.5px] text-[#787b86]">
                No drawings on {symbol}. Draw lines, zones, or R:R boxes to manage them here.
              </div>
            ) : (
              (() => {
                const groupsMap = new Map<
                  string,
                  { groupId: string; groupName: string; items: DrawingItem[]; isEmptyFolder?: boolean }
                >();
                const ungrouped: DrawingItem[] = [];

                // Include persisted empty group folders for this symbol
                for (const g of drawingGroups) {
                  if (g.symbol === symbol) {
                    groupsMap.set(g.id, {
                      groupId: g.id,
                      groupName: g.name,
                      items: [],
                      isEmptyFolder: true,
                    });
                  }
                }

                for (const d of drawingsList) {
                  const gid = (d.extendData as any)?.groupId as string | undefined;
                  if (gid) {
                    const gName = String((d.extendData as any)?.groupName || 'Group');
                    const existing = groupsMap.get(gid);
                    if (existing) {
                      existing.items.push(d);
                      existing.isEmptyFolder = false;
                    } else {
                      groupsMap.set(gid, { groupId: gid, groupName: gName, items: [d] });
                    }
                  } else {
                    ungrouped.push(d);
                  }
                }

                const renderDrawingRow = (d: DrawingItem, indented = false) => {
                  const label = (d.extendData as any)?.label || d.label || '';
                  const isMultiSelected = selectedOverlayIds.includes(d.id);
                  const isRowLocked = drawingsLocked || d.locked;
                  const rowColor = (d.styles as any)?.line?.color || '#2962ff';
                  return (
                    <div
                      key={d.id}
                      draggable
                      onDragStart={(e) => {
                        setDraggingDrawingId(d.id);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', d.id);
                      }}
                      onDragEnd={() => {
                        setDraggingDrawingId(null);
                        setDropTargetGroupId(null);
                      }}
                      onClick={(e) => {
                        if (e.ctrlKey || e.metaKey) {
                          toggleSelectedOverlayId(d.id);
                        } else {
                          bridge.selectOverlayById?.(d.id);
                        }
                      }}
                      className={`group ${
                        indented ? 'pl-6 pr-3' : 'px-3'
                      } py-2 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                        draggingDrawingId === d.id ? 'opacity-50' : ''
                      } ${
                        isMultiSelected
                          ? 'bg-[#2962ff]/15 border-l-2 border-l-[#2962ff]'
                          : 'hover:bg-[#2a2e39]/60 border-l-2 border-l-transparent'
                      }`}
                      title="Click to select · Ctrl+Click multi-select · Drag to move into/out of a group"
                    >
                      <div className="min-w-0 flex items-center gap-1.5">
                        <GripVertical className="w-3 h-3 text-[#787b86]/60 shrink-0 cursor-grab" />
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: rowColor }}
                        />
                        <div className="min-w-0 flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[12px] font-medium text-[#d1d4dc] truncate">
                              {d.name}
                            </span>
                            {label && (
                              <span className="px-1.5 py-0.5 rounded bg-[#f59e0b]/20 text-[#f59e0b] text-[10px] font-semibold truncate max-w-[90px]">
                                {label}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-[#787b86] font-mono-num">
                            {d.timeframe}
                          </span>
                        </div>
                      </div>

                      <div
                        className="flex items-center gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {indented && (
                          <button
                            onClick={() => bridge.removeOverlayFromGroup?.(d.id)}
                            title="Remove from group"
                            className="p-1 rounded text-[#787b86] hover:text-[#f59e0b] opacity-0 group-hover:opacity-100 cursor-pointer"
                          >
                            <FolderMinus className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => bridge.toggleSingleOverlayLock?.(d.id)}
                          title={d.locked ? 'Unlock' : 'Lock'}
                          className={`p-1 rounded cursor-pointer ${
                            d.locked ? 'text-[#f59e0b]' : 'text-[#787b86] hover:text-[#d1d4dc]'
                          }`}
                        >
                          {d.locked ? (
                            <Lock className="w-3.5 h-3.5" />
                          ) : (
                            <Unlock className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => bridge.toggleSingleOverlayVisible?.(d.id)}
                          title={d.visible ? 'Hide' : 'Show'}
                          className={`p-1 rounded cursor-pointer ${
                            !d.visible ? 'text-[#2962ff]' : 'text-[#787b86] hover:text-[#d1d4dc]'
                          }`}
                        >
                          {d.visible ? (
                            <Eye className="w-3.5 h-3.5" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => bridge.deleteSingleOverlay?.(d.id)}
                          disabled={isRowLocked}
                          title={isRowLocked ? 'Unlock to delete' : 'Delete'}
                          className={`p-1 rounded ${
                            isRowLocked
                              ? 'text-[#787b86] opacity-35 cursor-not-allowed'
                              : 'text-[#787b86] hover:text-[#f23645] cursor-pointer'
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                };

                return (
                  <>
                    {/* Collapsible Group Folders (Drop Targets) */}
                    {Array.from(groupsMap.values()).map((grp) => {
                      const isCollapsed = Boolean(collapsedObjGroups[grp.groupId]);
                      const memberIds = grp.items.map((i) => i.id);
                      const allLocked =
                        drawingsLocked ||
                        (grp.items.length > 0 && grp.items.every((i) => i.locked));
                      const allVisible = grp.items.every((i) => i.visible !== false);
                      const allSelected =
                        memberIds.length > 0 &&
                        memberIds.every((id) => selectedOverlayIds.includes(id));
                      const isDropTarget = dropTargetGroupId === grp.groupId;

                      return (
                        <div
                          key={grp.groupId}
                          onDragOver={(e) => {
                            if (!draggingDrawingId) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (dropTargetGroupId !== grp.groupId) {
                              setDropTargetGroupId(grp.groupId);
                            }
                          }}
                          onDragLeave={() => {
                            if (dropTargetGroupId === grp.groupId) {
                              setDropTargetGroupId(null);
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const draggedId =
                              draggingDrawingId || e.dataTransfer.getData('text/plain');
                            setDraggingDrawingId(null);
                            setDropTargetGroupId(null);
                            if (draggedId) {
                              bridge.addOverlaysToGroup?.([draggedId], grp.groupId, grp.groupName);
                            }
                          }}
                          className={`bg-[#131722]/40 transition-all ${
                            isDropTarget ? 'ring-2 ring-inset ring-[#2962ff] bg-[#2962ff]/10' : ''
                          }`}
                        >
                          <div
                            onClick={() => {
                              if (memberIds.length > 0) setSelectedOverlayIds(memberIds);
                            }}
                            className={`group px-2 py-1.5 flex items-center justify-between gap-1 cursor-pointer ${
                              allSelected
                                ? 'bg-[#2962ff]/20 border-l-2 border-l-[#2962ff]'
                                : 'hover:bg-[#2a2e39]/60 border-l-2 border-l-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-1 min-w-0 flex-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCollapsedObjGroups((prev) => ({
                                    ...prev,
                                    [grp.groupId]: !prev[grp.groupId],
                                  }));
                                }}
                                className="text-[#787b86] hover:text-[#d1d4dc] cursor-pointer"
                              >
                                {isCollapsed ? (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <Folder className="w-3.5 h-3.5 text-[#2962ff] shrink-0" />
                              {editingGroupId === grp.groupId ? (
                                <input
                                  autoFocus
                                  value={editingGroupName}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => setEditingGroupName(e.target.value)}
                                  onBlur={() => {
                                    if (editingGroupName.trim()) {
                                      bridge.renameOverlayGroup?.(
                                        grp.groupId,
                                        editingGroupName.trim()
                                      );
                                      renameEmptyDrawingGroup(
                                        grp.groupId,
                                        editingGroupName.trim()
                                      );
                                    }
                                    setEditingGroupId(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      if (editingGroupName.trim()) {
                                        bridge.renameOverlayGroup?.(
                                          grp.groupId,
                                          editingGroupName.trim()
                                        );
                                        renameEmptyDrawingGroup(
                                          grp.groupId,
                                          editingGroupName.trim()
                                        );
                                      }
                                      setEditingGroupId(null);
                                    } else if (e.key === 'Escape') {
                                      setEditingGroupId(null);
                                    }
                                  }}
                                  className="flex-1 min-w-0 px-1 py-0.5 rounded bg-[#1e222d] border border-[#2962ff] text-[11px] font-semibold text-white outline-none"
                                />
                              ) : (
                                <span
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    setEditingGroupId(grp.groupId);
                                    setEditingGroupName(grp.groupName);
                                  }}
                                  title="Click to select group · Double-click to rename · Drop drawings here"
                                  className="text-[11.5px] font-semibold text-[#d1d4dc] truncate"
                                >
                                  {grp.groupName}{' '}
                                  <span className="text-[#787b86] font-normal">
                                    ({grp.items.length})
                                  </span>
                                </span>
                              )}
                            </div>

                            <div
                              className="flex items-center gap-0.5 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => {
                                  setEditingGroupId(grp.groupId);
                                  setEditingGroupName(grp.groupName);
                                }}
                                title="Rename group"
                                className="p-0.5 rounded text-[#787b86] hover:text-[#d1d4dc] opacity-0 group-hover:opacity-100 cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              {memberIds.length > 0 && (
                                <button
                                  onClick={() => bridge.cloneOverlayGroup?.(grp.groupId)}
                                  title="Clone group"
                                  className="p-0.5 rounded text-[#787b86] hover:text-[#2962ff] opacity-0 group-hover:opacity-100 cursor-pointer"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              )}
                              {memberIds.length > 0 && (
                                <>
                                  <button
                                    onClick={() =>
                                      bridge.updateMultipleOverlaysStyle?.(memberIds, {
                                        locked: !allLocked,
                                      })
                                    }
                                    title={allLocked ? 'Unlock group' : 'Lock group'}
                                    className={`p-0.5 rounded cursor-pointer ${
                                      allLocked
                                        ? 'text-[#f59e0b]'
                                        : 'text-[#787b86] hover:text-[#d1d4dc]'
                                    }`}
                                  >
                                    {allLocked ? (
                                      <Lock className="w-3 h-3" />
                                    ) : (
                                      <Unlock className="w-3 h-3" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() =>
                                      bridge.updateMultipleOverlaysStyle?.(memberIds, {
                                        visible: !allVisible,
                                      })
                                    }
                                    title={allVisible ? 'Hide group' : 'Show group'}
                                    className={`p-0.5 rounded cursor-pointer ${
                                      !allVisible
                                        ? 'text-[#2962ff]'
                                        : 'text-[#787b86] hover:text-[#d1d4dc]'
                                    }`}
                                  >
                                    {allVisible ? (
                                      <Eye className="w-3 h-3" />
                                    ) : (
                                      <EyeOff className="w-3 h-3" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => {
                                      bridge.ungroupOverlays?.(memberIds);
                                      removeEmptyDrawingGroup(grp.groupId);
                                    }}
                                    title="Ungroup folder"
                                    className="p-0.5 rounded text-[#787b86] hover:text-[#f59e0b] cursor-pointer"
                                  >
                                    <FolderMinus className="w-3 h-3" />
                                  </button>
                                </>
                              )}
                              <button
                                disabled={memberIds.length > 0 && allLocked}
                                onClick={() => {
                                  if (memberIds.length > 0) {
                                    bridge.deleteMultipleOverlays?.(memberIds);
                                  }
                                  removeEmptyDrawingGroup(grp.groupId);
                                }}
                                title={
                                  memberIds.length > 0 && allLocked
                                    ? 'Unlock group to delete'
                                    : memberIds.length === 0
                                    ? 'Remove empty folder'
                                    : 'Delete entire group'
                                }
                                className={`p-0.5 rounded ${
                                  memberIds.length > 0 && allLocked
                                    ? 'text-[#787b86] opacity-35 cursor-not-allowed'
                                    : 'text-[#787b86] hover:text-[#f23645] cursor-pointer'
                                }`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {!isCollapsed && (
                            <div className="divide-y divide-[#2a2e39]/30">
                              {grp.items.length === 0 ? (
                                <div className="pl-7 pr-3 py-2 text-[10.5px] italic text-[#787b86]">
                                  Drag drawings here to add to group
                                </div>
                              ) : (
                                grp.items.map((item) => renderDrawingRow(item, true))
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Ungrouped Drawings + Ungroup Drop Zone */}
                    <div
                      onDragOver={(e) => {
                        if (!draggingDrawingId) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dropTargetGroupId !== '__ungrouped__') {
                          setDropTargetGroupId('__ungrouped__');
                        }
                      }}
                      onDragLeave={() => {
                        if (dropTargetGroupId === '__ungrouped__') {
                          setDropTargetGroupId(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const draggedId =
                          draggingDrawingId || e.dataTransfer.getData('text/plain');
                        setDraggingDrawingId(null);
                        setDropTargetGroupId(null);
                        if (draggedId) {
                          bridge.removeOverlayFromGroup?.(draggedId);
                        }
                      }}
                      className={`divide-y divide-[#2a2e39]/40 min-h-[32px] transition-all ${
                        dropTargetGroupId === '__ungrouped__'
                          ? 'ring-2 ring-inset ring-[#2962ff] bg-[#2962ff]/10'
                          : ''
                      }`}
                    >
                      {groupsMap.size > 0 && draggingDrawingId && (
                        <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-[#2962ff] bg-[#2962ff]/5">
                          Drop here to ungroup
                        </div>
                      )}
                      {ungrouped.map((d) => renderDrawingRow(d, false))}
                    </div>
                  </>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PRICE ALERTS */}
      {rightSidebarTab === 'alerts' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <form
            onSubmit={handleCreateAlert}
            className="p-3 border-b border-[#2a2e39] space-y-2 bg-[#131722]/40"
          >
            <div className="text-[11px] font-semibold text-[#d1d4dc]">
              New Alert on {symbol}
            </div>
            <div className="flex gap-1.5">
              <input
                type="number"
                step="any"
                required
                value={alertPrice}
                onChange={(e) => setAlertPrice(e.target.value)}
                placeholder="Target Price"
                className="no-spinner flex-1 px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] font-mono-num text-[12px] text-white outline-none focus:border-[#2962ff]"
              />
              <select
                value={alertCond}
                onChange={(e) => setAlertCond(e.target.value as AlertCondition)}
                className="px-1.5 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[11px] text-[#d1d4dc] outline-none"
              >
                <option value="CROSSING">Crossing</option>
                <option value="CROSSING_UP">Cross Up</option>
                <option value="CROSSING_DOWN">Cross Down</option>
              </select>
            </div>
            <input
              type="text"
              value={alertNote}
              onChange={(e) => setAlertNote(e.target.value)}
              placeholder="Note (e.g. H4 OB touched)"
              className="w-full px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[11.5px] text-[#d1d4dc] placeholder-[#787b86] outline-none focus:border-[#2962ff]"
            />
            <button
              type="submit"
              className="w-full py-1.5 rounded bg-[#f59e0b] hover:bg-[#d97706] text-[#131722] font-semibold text-[11.5px] transition-colors"
            >
              + Create Price Alert
            </button>
          </form>

          <div className="flex-1 overflow-y-auto divide-y divide-[#2a2e39]/40">
            {alerts.length === 0 ? (
              <div className="p-6 text-center text-[11.5px] text-[#787b86]">
                No price alerts configured.
              </div>
            ) : (
              alerts.map((a) => (
                <div
                  key={a.id}
                  onClick={() => {
                    if (a.symbol !== symbol) setSymbol(a.symbol);
                  }}
                  className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-[#2a2e39]/60 cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-semibold text-[#d1d4dc]">
                        {a.symbol}
                      </span>
                      <span className="font-mono-num text-[11.5px] text-[#f59e0b]">
                        @ {a.price}
                      </span>
                      <span
                        className={`px-1 py-0.5 rounded text-[9.5px] font-semibold ${
                          a.triggered
                            ? 'bg-[#787b86]/20 text-[#787b86]'
                            : 'bg-[#089981]/20 text-[#089981]'
                        }`}
                      >
                        {a.triggered ? 'TRIGGERED' : 'ACTIVE'}
                      </span>
                    </div>
                    <div className="text-[10.5px] text-[#787b86] truncate">
                      {a.condition} {a.note ? `· ${a.note}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAlert(a.id);
                    }}
                    className="p-1 rounded text-[#787b86] hover:text-[#f23645]"
                    title="Delete Alert"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* DuckDB Cache Footer */}
      <div className="px-3 py-2 border-t border-[#2a2e39] bg-[#131722]/60 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5 text-[#787b86]">
          <Database className="w-3.5 h-3.5 text-[#2962ff]" />
          <span>DuckDB Cache</span>
        </div>
        <span className="font-mono-num text-[#d1d4dc]">
          {(mt5Status?.cached_candles_total ?? 0).toLocaleString()} bars
        </span>
      </div>
    </aside>
  );
};
