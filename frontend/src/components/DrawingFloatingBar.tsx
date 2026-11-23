import React, { useEffect, useState } from 'react';
import {
  Lock,
  Unlock,
  Trash2,
  X,
  Zap,
  Pin,
  Tag,
  Settings,
  FolderPlus,
  FolderMinus,
  Folder,
  EyeOff,
} from 'lucide-react';
import { useChartStore } from '../store/useChartStore';
import { resolveRiskRewardPrices } from '../overlays/riskRewardOverlay';

const COLORS = [
  '#2962ff',
  '#089981',
  '#f23645',
  '#f59e0b',
  '#a855f7',
  '#06b6d4',
  '#d1d4dc',
];

const WIDTHS = [1, 2, 3, 4];

const QUICK_TAGS = ['OB', 'FVG', 'BOS', 'CHoCH', 'Liquidity', 'SNR', 'Breakout'];

export const DrawingFloatingBar: React.FC = () => {
  const {
    symbol,
    symbolInfo,
    selectedOverlay,
    selectedOverlayIds,
    drawingsList,
    setSelectedOverlay,
    setSelectedOverlayIds,
    setDrawingSettingsOverlayId,
    bridge,
    defaultLot,
    setDefaultLot,
    riskPct,
    setRiskPct,
    executeOrder,
    placePaperOrder,
    replay,
  } = useChartStore();

  const [sizeMode, setSizeMode] = useState<'RISK' | 'LOT'>('RISK');
  const [executing, setExecuting] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');
  const [showTagPresets, setShowTagPresets] = useState(false);
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState('');

  useEffect(() => {
    setLabelDraft(selectedOverlay?.label || '');
    setShowTagPresets(false);
    setEditingGroupName(false);
  }, [selectedOverlay?.id, selectedOverlay?.label, selectedOverlayIds.length]);

  if (!selectedOverlay && selectedOverlayIds.length === 0) return null;

  // Multi-Selection / Group Mode Floating Bar
  if (selectedOverlayIds.length > 1) {
    const selectedItems = drawingsList.filter((d) => selectedOverlayIds.includes(d.id));
    const groupIds = Array.from(
      new Set(
        selectedItems
          .map((d) => (d.extendData as any)?.groupId as string | undefined)
          .filter((g): g is string => Boolean(g))
      )
    );
    const allSameGroup =
      groupIds.length === 1 &&
      selectedItems.length > 0 &&
      selectedItems.every((d) => (d.extendData as any)?.groupId === groupIds[0]);
    const sharedGroupId = allSameGroup ? groupIds[0] : null;
    const sharedGroupName = allSameGroup
      ? String((selectedItems[0]?.extendData as any)?.groupName || 'Group')
      : null;
    const allLocked = selectedItems.length > 0 && selectedItems.every((d) => d.locked);

    return (
      <div
        data-no-marquee="true"
        className="absolute top-12 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#1e222d] border border-[#2962ff]/60 shadow-tv">
          {/* Count / Group Badge */}
          {sharedGroupId && sharedGroupName ? (
            editingGroupName ? (
              <input
                autoFocus
                value={groupNameDraft}
                onChange={(e) => setGroupNameDraft(e.target.value)}
                onBlur={() => {
                  if (groupNameDraft.trim()) {
                    bridge.renameOverlayGroup?.(sharedGroupId, groupNameDraft.trim());
                  }
                  setEditingGroupName(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (groupNameDraft.trim()) {
                      bridge.renameOverlayGroup?.(sharedGroupId, groupNameDraft.trim());
                    }
                    setEditingGroupName(false);
                  } else if (e.key === 'Escape') {
                    setEditingGroupName(false);
                  }
                }}
                className="w-28 px-1.5 py-0.5 rounded bg-[#131722] border border-[#2962ff] text-[11.5px] text-white outline-none"
              />
            ) : (
              <button
                onClick={() => {
                  setGroupNameDraft(sharedGroupName);
                  setEditingGroupName(true);
                }}
                title="Click to rename group"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#2962ff]/15 text-[#2962ff] text-[11.5px] font-semibold cursor-pointer hover:bg-[#2962ff]/25"
              >
                <Folder className="w-3.5 h-3.5" />
                <span>
                  {sharedGroupName} ({selectedOverlayIds.length})
                </span>
              </button>
            )
          ) : (
            <span className="text-[11.5px] font-semibold text-[#2962ff] pr-1.5 border-r border-[#2a2e39]">
              {selectedOverlayIds.length} drawings selected
            </span>
          )}

          {/* Group / Ungroup Button */}
          {sharedGroupId ? (
            <button
              onClick={() => bridge.ungroupOverlays?.(selectedOverlayIds)}
              title="Ungroup Drawings (Ctrl+Shift+G)"
              className="flex items-center gap-1 px-2 h-6 rounded bg-[#2a2e39] hover:bg-[#363a45] text-[#d1d4dc] text-[11px] font-medium cursor-pointer"
            >
              <FolderMinus className="w-3.5 h-3.5 text-[#f59e0b]" />
              <span>Ungroup</span>
            </button>
          ) : (
            <button
              onClick={() => bridge.groupOverlays?.(selectedOverlayIds)}
              title="Group Selected Drawings (Ctrl+G)"
              className="flex items-center gap-1 px-2 h-6 rounded bg-[#2962ff] hover:bg-[#1e53e5] text-white text-[11px] font-medium cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>Group</span>
            </button>
          )}

          <div className="w-[1px] h-4 bg-[#2a2e39]" />

          {/* Batch Color Swatches */}
          <div className="flex items-center gap-1 px-0.5">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => bridge.updateMultipleOverlaysStyle?.(selectedOverlayIds, { color: c })}
                title={`Apply color ${c} to all selected`}
                className="w-4 h-4 rounded-full border border-[#2a2e39] transition-transform hover:scale-110 cursor-pointer"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <div className="w-[1px] h-4 bg-[#2a2e39]" />

          {/* Batch Line Widths */}
          <div className="flex items-center gap-0.5">
            {WIDTHS.map((w) => (
              <button
                key={w}
                onClick={() =>
                  bridge.updateMultipleOverlaysStyle?.(selectedOverlayIds, { lineWidth: w })
                }
                className="px-1.5 h-6 rounded text-[11px] font-mono-num text-[#d1d4dc] hover:bg-[#2a2e39] cursor-pointer"
              >
                {w}px
              </button>
            ))}
          </div>

          <div className="w-[1px] h-4 bg-[#2a2e39]" />

          {/* Batch Opacity */}
          <div className="flex items-center gap-1 px-1" title="Opacity for all selected drawings">
            <span className="text-[10px] text-[#787b86]">α</span>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              defaultValue={Math.round(
                ((selectedItems[0]?.extendData as any)?.opacity ?? 1) * 100
              )}
              onChange={(e) =>
                bridge.updateMultipleOverlaysStyle?.(selectedOverlayIds, {
                  opacity: Number(e.target.value) / 100,
                })
              }
              className="w-14 accent-[#2962ff] cursor-pointer"
            />
          </div>

          <div className="w-[1px] h-4 bg-[#2a2e39]" />

          {/* Batch Lock / Unlock */}
          <button
            onClick={() =>
              bridge.updateMultipleOverlaysStyle?.(selectedOverlayIds, { locked: !allLocked })
            }
            title={allLocked ? 'Unlock All Selected' : 'Lock All Selected'}
            className={`p-1 rounded cursor-pointer ${
              allLocked
                ? 'text-[#f59e0b] bg-[#f59e0b]/15'
                : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
            }`}
          >
            {allLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>

          {/* Batch Hide */}
          <button
            onClick={() => {
              bridge.updateMultipleOverlaysStyle?.(selectedOverlayIds, { visible: false });
              setSelectedOverlay(null);
              setSelectedOverlayIds([]);
            }}
            title="Hide All Selected"
            className="p-1 rounded text-[#d1d4dc] hover:bg-[#2a2e39] cursor-pointer"
          >
            <EyeOff className="w-3.5 h-3.5" />
          </button>

          {/* Batch Delete */}
          <button
            onClick={() => bridge.deleteMultipleOverlays?.(selectedOverlayIds)}
            disabled={allLocked}
            title={allLocked ? 'Unlock drawings to delete' : 'Delete Selected Drawings (Del)'}
            className={`p-1 rounded ${
              allLocked
                ? 'text-[#787b86] opacity-40 cursor-not-allowed'
                : 'text-[#f23645] hover:bg-[#f23645]/15 cursor-pointer'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Close Multi-Selection */}
          <button
            onClick={() => {
              setSelectedOverlay(null);
              setSelectedOverlayIds([]);
            }}
            title="Clear Selection (Esc)"
            className="p-1 rounded text-[#787b86] hover:text-white hover:bg-[#2a2e39] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  if (!selectedOverlay) return null;

  // Check if single selected drawing belongs to a group
  const singleDrawing = drawingsList.find((d) => d.id === selectedOverlay.id);
  const singleGroupId = (singleDrawing?.extendData as any)?.groupId as string | undefined;
  const singleGroupMembers = singleGroupId
    ? drawingsList.filter((d) => (d.extendData as any)?.groupId === singleGroupId)
    : [];

  const isRRTool =
    selectedOverlay.name === 'riskRewardLong' ||
    selectedOverlay.name === 'riskRewardShort';
  const side: 'BUY' | 'SELL' =
    selectedOverlay.name === 'riskRewardLong' ? 'BUY' : 'SELL';
  const digits = symbolInfo.digits ?? 2;

  const points = isRRTool ? bridge.getOverlayPoints?.(selectedOverlay.id) || [] : [];
  const rawP0 = points[0]?.value;
  const rawP1 = points[1]?.value;
  const rawP2 = points[2]?.value;
  const hasValidRRPoints =
    rawP0 !== undefined && rawP1 !== undefined && rawP2 !== undefined;
  const resolvedRR = hasValidRRPoints
    ? resolveRiskRewardPrices(side === 'BUY', rawP0, rawP1, rawP2)
    : null;
  const entryPrice = resolvedRR?.entry;
  const tpPrice = resolvedRR?.tp;
  const slPrice = resolvedRR?.sl;

  const applyLabel = (text: string) => {
    setLabelDraft(text);
    bridge.updateSelectedOverlayLabel?.(text);
  };

  const handleRROrder = async (orderMode: 'MARKET' | 'PENDING') => {
    if (!hasValidRRPoints || executing) return;
    if (replay.isActive) {
      placePaperOrder({
        side,
        order_mode: orderMode,
        entry_price: orderMode === 'PENDING' ? entryPrice : undefined,
        sl: slPrice,
        tp: tpPrice,
        volume: sizeMode === 'LOT' ? defaultLot : undefined,
        risk_pct: sizeMode === 'RISK' ? riskPct : undefined,
        strategy_tag: labelDraft.trim() || 'RR-Setup',
      });
      return;
    }

    setExecuting(true);
    try {
      const tagSuffix = labelDraft.trim() ? `:${labelDraft.trim().slice(0, 16)}` : '';
      await executeOrder({
        symbol,
        side,
        order_mode: orderMode,
        entry_price: orderMode === 'PENDING' ? entryPrice : undefined,
        sl: slPrice,
        tp: tpPrice,
        volume: sizeMode === 'LOT' ? defaultLot : undefined,
        risk_pct: sizeMode === 'RISK' ? riskPct : undefined,
        comment: `TV-RR${tagSuffix}`,
      });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div
      data-no-marquee="true"
      className="absolute top-12 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {/* Primary Style + Label Bar */}
      <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#1e222d] border border-[#2a2e39] shadow-tv">
        <span className="text-[11px] text-[#787b86] font-medium pr-1 border-r border-[#2a2e39]">
          {selectedOverlay.name}
        </span>

        {singleGroupId && singleGroupMembers.length > 1 && (
          <button
            onClick={() => setSelectedOverlayIds(singleGroupMembers.map((m) => m.id))}
            title="Select all drawings in this group"
            className="flex items-center gap-1 px-1.5 h-6 rounded bg-[#2962ff]/15 hover:bg-[#2962ff]/25 text-[#2962ff] text-[10.5px] font-semibold cursor-pointer"
          >
            <Folder className="w-3 h-3" />
            <span>Select Group ({singleGroupMembers.length})</span>
          </button>
        )}

        {/* Color Swatches */}
        <div className="flex items-center gap-1 px-0.5">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => bridge.updateSelectedOverlayStyle?.({ color: c })}
              title={`Color ${c}`}
              className={`w-4 h-4 rounded-full border transition-transform hover:scale-110 ${
                selectedOverlay.color.toLowerCase() === c.toLowerCase()
                  ? 'border-white scale-110'
                  : 'border-[#2a2e39]'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <div className="w-[1px] h-4 bg-[#2a2e39]" />

        {/* Line Widths */}
        <div className="flex items-center gap-0.5">
          {WIDTHS.map((w) => (
            <button
              key={w}
              onClick={() => bridge.updateSelectedOverlayStyle?.({ lineWidth: w })}
              className={`px-1.5 h-6 rounded text-[11px] font-mono-num ${
                selectedOverlay.lineWidth === w
                  ? 'bg-[#2962ff]/20 text-[#2962ff]'
                  : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
              }`}
            >
              {w}px
            </button>
          ))}
        </div>

        <div className="w-[1px] h-4 bg-[#2a2e39]" />

        {/* Line Style */}
        <button
          onClick={() =>
            bridge.updateSelectedOverlayStyle?.({
              lineStyle: selectedOverlay.lineStyle === 'solid' ? 'dashed' : 'solid',
            })
          }
          className="px-2 h-6 rounded text-[11px] text-[#d1d4dc] hover:bg-[#2a2e39]"
          title="Toggle Solid / Dashed"
        >
          {selectedOverlay.lineStyle === 'solid' ? 'Solid' : 'Dashed'}
        </button>

        <div className="w-[1px] h-4 bg-[#2a2e39]" />

        {/* Label / Setup Tag Input + Top/Center/Bottom Position Toggle */}
        <div className="relative flex items-center gap-1">
          <Tag className="w-3.5 h-3.5 text-[#f59e0b]" />
          <input
            type="text"
            value={labelDraft}
            onFocus={() => setShowTagPresets(true)}
            onChange={(e) => applyLabel(e.target.value)}
            placeholder="Label / Tag (OB, FVG...)"
            className="w-28 px-2 py-0.5 rounded bg-[#131722] border border-[#2a2e39] text-[11.5px] text-white placeholder-[#787b86] outline-none focus:border-[#2962ff]"
          />
          <div className="flex items-center rounded bg-[#131722] border border-[#2a2e39] p-0.5">
            {(['top', 'center', 'bottom'] as const).map((pos) => (
              <button
                key={pos}
                onClick={() => bridge.updateSelectedOverlayLabel?.(labelDraft, pos)}
                title={`Label position: ${pos}`}
                className={`px-1 py-0.5 rounded text-[9.5px] uppercase font-semibold ${
                  (selectedOverlay.labelPosition || 'top') === pos
                    ? 'bg-[#2962ff] text-white'
                    : 'text-[#787b86] hover:text-[#d1d4dc]'
                }`}
              >
                {pos[0]}
              </button>
            ))}
          </div>
          {showTagPresets && (
            <div className="absolute left-0 top-7 flex flex-wrap gap-1 p-1.5 w-60 rounded bg-[#1e222d] border border-[#2a2e39] shadow-tv z-50">
              {QUICK_TAGS.map((tag) => (
                <button
                  key={tag}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyLabel(tag);
                    setShowTagPresets(false);
                  }}
                  className="px-2 py-0.5 rounded bg-[#131722] hover:bg-[#2962ff] text-[#d1d4dc] hover:text-white text-[10.5px] font-medium transition-colors"
                >
                  {tag}
                </button>
              ))}
              {labelDraft && (
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyLabel('');
                    setShowTagPresets(false);
                  }}
                  className="px-2 py-0.5 rounded bg-[#f23645]/20 text-[#f23645] text-[10.5px]"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* Quick Opacity */}
        <div
          className="flex items-center gap-1 px-1"
          title={`Opacity: ${Math.round((selectedOverlay.opacity ?? (singleDrawing?.extendData as any)?.opacity ?? 1) * 100)}%`}
        >
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={Math.round(
              (selectedOverlay.opacity ?? (singleDrawing?.extendData as any)?.opacity ?? 1) * 100
            )}
            onChange={(e) =>
              bridge.updateSelectedOverlayStyle?.({ opacity: Number(e.target.value) / 100 })
            }
            className="w-12 accent-[#2962ff] cursor-pointer"
          />
          <span className="text-[10px] font-mono-num text-[#787b86] w-7 text-right">
            {Math.round(
              (selectedOverlay.opacity ?? (singleDrawing?.extendData as any)?.opacity ?? 1) * 100
            )}
            %
          </span>
        </div>

        {/* Settings (Full Drawing Properties Modal) */}
        <button
          onClick={() => setDrawingSettingsOverlayId(selectedOverlay.id)}
          title="Settings... (Double-click object)"
          className="p-1 rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {/* Lock */}
        <button
          onClick={() =>
            bridge.updateSelectedOverlayStyle?.({ locked: !selectedOverlay.locked })
          }
          title={selectedOverlay.locked ? 'Unlock' : 'Lock'}
          className={`p-1 rounded ${
            selectedOverlay.locked
              ? 'text-[#f59e0b] bg-[#f59e0b]/15'
              : 'text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]'
          }`}
        >
          {selectedOverlay.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
        </button>

        {/* Delete */}
        <button
          onClick={() => bridge.deleteSelectedOverlay?.()}
          disabled={selectedOverlay.locked}
          title={selectedOverlay.locked ? 'Unlock drawing to delete' : 'Delete Drawing'}
          className={`p-1 rounded ${
            selectedOverlay.locked
              ? 'text-[#787b86] opacity-40 cursor-not-allowed'
              : 'text-[#787b86] hover:bg-[#f23645]/15 hover:text-[#f23645]'
          }`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setSelectedOverlay(null)}
          title="Close"
          className="p-1 rounded text-[#787b86] hover:text-[#d1d4dc]"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Visual Execution Extension for Long/Short Position R:R (Works in BOTH Live & Bar Replay Paper Mode!) */}
      {isRRTool && hasValidRRPoints && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 rounded bg-[#1e222d] border border-[#2962ff]/50 shadow-tv text-[11.5px]">
          {replay.isActive && (
            <span className="px-1.5 py-0.5 rounded bg-[#f59e0b]/20 text-[#f59e0b] text-[10px] font-semibold">
              PAPER
            </span>
          )}
          <div className="flex items-center rounded bg-[#131722] border border-[#2a2e39] p-0.5">
            <button
              onClick={() => setSizeMode('RISK')}
              className={`px-2 py-0.5 rounded text-[10.5px] font-medium ${
                sizeMode === 'RISK'
                  ? 'bg-[#2962ff] text-white'
                  : 'text-[#787b86] hover:text-[#d1d4dc]'
              }`}
            >
              % Risk
            </button>
            <button
              onClick={() => setSizeMode('LOT')}
              className={`px-2 py-0.5 rounded text-[10.5px] font-medium ${
                sizeMode === 'LOT'
                  ? 'bg-[#2962ff] text-white'
                  : 'text-[#787b86] hover:text-[#d1d4dc]'
              }`}
            >
              Lot
            </button>
          </div>

          {sizeMode === 'RISK' ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0.1"
                max="25"
                step="0.25"
                value={riskPct}
                onChange={(e) => setRiskPct(parseFloat(e.target.value))}
                className="no-spinner w-[68px] px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] font-mono-num text-[12px] font-semibold text-white text-center outline-none focus:border-[#2962ff]"
              />
              <span className="text-[#787b86] text-[11px]">%</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={defaultLot}
                onChange={(e) => setDefaultLot(parseFloat(e.target.value))}
                className="no-spinner w-[72px] px-2 py-1 rounded bg-[#131722] border border-[#2a2e39] font-mono-num text-[12px] font-semibold text-white text-center outline-none focus:border-[#2962ff]"
              />
              <span className="text-[#787b86] text-[11px]">lot</span>
            </div>
          )}

          <div className="w-[1px] h-4 bg-[#2a2e39]" />

          <button
            onClick={() => handleRROrder('MARKET')}
            disabled={executing}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-white font-semibold transition-colors disabled:opacity-50 ${
              side === 'BUY'
                ? 'bg-[#089981] hover:bg-[#07826e]'
                : 'bg-[#f23645] hover:bg-[#d92b3a]'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>
              {replay.isActive ? `Execute Paper Market ${side}` : `Execute Market ${side}`}
            </span>
          </button>

          <button
            onClick={() => handleRROrder('PENDING')}
            disabled={executing}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#2962ff] hover:bg-[#1e53e5] text-white font-semibold transition-colors disabled:opacity-50"
          >
            <Pin className="w-3.5 h-3.5" />
            <span className="font-mono-num">
              {replay.isActive
                ? `Place Paper Limit/Stop @ ${entryPrice!.toFixed(digits)}`
                : `Place Limit/Stop @ ${entryPrice!.toFixed(digits)}`}
            </span>
          </button>
        </div>
      )}
    </div>
  );
};
