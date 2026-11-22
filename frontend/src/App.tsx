import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Info,
  X,
  Bell,
  Volume2,
  RotateCcw,
  Camera,
  Minimize,
} from 'lucide-react';
import { api } from './services/api';
import { installAudioUnlock, playAlertSound } from './services/sound';
import {
  copySnapshotImage,
  copySnapshotLink,
  downloadSnapshot,
} from './services/chartSnapshot';
import { useChartStore } from './store/useChartStore';
import { SnapshotMenuDropdown } from './components/SnapshotMenuDropdown';
import { TopToolbar } from './components/TopToolbar';
import { WorkspaceTabsBar } from './components/WorkspaceTabsBar';
import { LeftDrawingBar } from './components/LeftDrawingBar';
import { MultiChartGrid } from './components/MultiChartGrid';
import { RightWatchlist } from './components/RightWatchlist';
import { BottomTradingDock } from './components/BottomTradingDock';
import { BottomStatusBar } from './components/BottomStatusBar';
import { SymbolSearchModal } from './components/SymbolSearchModal';
import { IndicatorsModal } from './components/IndicatorsModal';
import { ChartSettingsModal } from './components/ChartSettingsModal';
import { AccountLoginModal } from './components/AccountLoginModal';
import { BacktestReportModal } from './components/BacktestReportModal';
import { TradingAnalyticsModal } from './components/TradingAnalyticsModal';
import { QuickIntervalModal } from './components/QuickIntervalModal';
import { DrawingSettingsModal } from './components/DrawingSettingsModal';
import { FloatingFavoritesBar } from './components/FloatingFavoritesBar';

export function App() {
  const {
    setMt5Status,
    setTradeState,
    setAlerts,
    setSymbolModalOpen,
    toastMessage,
    clearToast,
    triggeredAlertNotice,
    dismissTriggeredAlert,
    rearmAlert,
    isChartFullscreen,
    toggleChartFullscreen,
    setChartFullscreen,
  } = useChartStore();

  const [fsSnapshotOpen, setFsSnapshotOpen] = useState(false);
  const fsSnapshotRef = useRef<HTMLDivElement>(null);

  // Sync chart fullscreen state with native browser Fullscreen API
  useEffect(() => {
    if (isChartFullscreen) {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    } else {
      setFsSnapshotOpen(false);
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    }
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 60);
    return () => window.clearTimeout(timer);
  }, [isChartFullscreen]);

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement && useChartStore.getState().isChartFullscreen) {
        setChartFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [setChartFullscreen]);

  useEffect(() => {
    if (!fsSnapshotOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (fsSnapshotRef.current && !fsSnapshotRef.current.contains(e.target as Node)) {
        setFsSnapshotOpen(false);
      }
    };
    window.addEventListener('mousedown', onOutside);
    return () => window.removeEventListener('mousedown', onOutside);
  }, [fsSnapshotOpen]);

  // Unlock browser WebAudio on first user gesture & disable native browser right-click menu
  useEffect(() => {
    installAudioUnlock();
    const onGlobalContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
    };
    window.addEventListener('contextmenu', onGlobalContextMenu);
    return () => window.removeEventListener('contextmenu', onGlobalContextMenu);
  }, []);

  // Poll backend /api/mt5/status periodically & fetch initial trade state + alerts
  useEffect(() => {
    let cancelled = false;
    const fetchStatus = () => {
      api
        .getStatus()
        .then((status) => {
          if (!cancelled) setMt5Status(status);
        })
        .catch(() => {});
    };
    fetchStatus();
    api
      .getTradeState()
      .then((state) => {
        if (!cancelled) setTradeState(state);
      })
      .catch(() => {});
    api
      .getAlerts()
      .then((list) => {
        if (!cancelled) setAlerts(list);
      })
      .catch(() => {});

    const timer = window.setInterval(fetchStatus, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [setMt5Status, setTradeState, setAlerts]);

  // Global shortcuts: Ctrl+K, Ctrl+Z/Y, Snapshot (Ctrl+Alt+S, Ctrl+Shift+S, Alt+S), Fullscreen (Shift+F, Esc)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      const key = e.key.toLowerCase();

      if ((e.ctrlKey || e.metaKey) && key === 'k') {
        e.preventDefault();
        setSymbolModalOpen(true);
      } else if (!isInput && (e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && key === 's') {
        e.preventDefault();
        void downloadSnapshot();
      } else if (!isInput && (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && key === 's') {
        e.preventDefault();
        void copySnapshotImage();
      } else if (!isInput && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && key === 's') {
        e.preventDefault();
        void copySnapshotLink();
      } else if (!isInput && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && key === 'f') {
        e.preventDefault();
        toggleChartFullscreen();
      } else if (!isInput && e.key === 'Escape' && useChartStore.getState().isChartFullscreen) {
        e.preventDefault();
        setChartFullscreen(false);
      } else if (!isInput && (e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useChartStore.getState().undoDrawing();
      } else if (
        !isInput &&
        (e.ctrlKey || e.metaKey) &&
        (key === 'y' || (e.shiftKey && key === 'z'))
      ) {
        e.preventDefault();
        useChartStore.getState().redoDrawing();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setSymbolModalOpen, toggleChartFullscreen, setChartFullscreen]);

  return (
    <div className="w-screen h-screen flex flex-col bg-[#131722] text-[#d1d4dc] overflow-hidden relative">
      {/* TradingView Desktop Workspace Tabs Bar (34px) */}
      {!isChartFullscreen && <WorkspaceTabsBar />}

      {/* Top Toolbar (38px) */}
      {!isChartFullscreen && <TopToolbar />}

      {/* Main Workspace Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Drawing Sidebar (44px) */}
        {!isChartFullscreen && <LeftDrawingBar />}

        {/* Center Column: Multi-Chart Grid + Bottom Trading Dock + Bottom Status Bar */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          <MultiChartGrid />
          {!isChartFullscreen && <BottomTradingDock />}
          {!isChartFullscreen && <BottomStatusBar />}
        </main>

        {/* Right Sidebar (Watchlist / Object Tree / Alerts) */}
        {!isChartFullscreen && <RightWatchlist />}
      </div>

      {/* Floating Hover Pill in Fullscreen Mode (Snapshot + Exit Fullscreen) */}
      {isChartFullscreen && (
        <div
          ref={fsSnapshotRef}
          data-no-marquee="true"
          className="fixed top-2.5 right-3 z-[65] flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#1e222d]/85 hover:bg-[#1e222d] border border-[#363a45] shadow-xl backdrop-blur-sm opacity-75 hover:opacity-100 transition-opacity"
        >
          <div className="relative">
            <button
              type="button"
              onClick={() => setFsSnapshotOpen((v) => !v)}
              title="Take a snapshot"
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11.5px] font-medium transition-colors cursor-pointer ${
                fsSnapshotOpen
                  ? 'bg-[#2962ff] text-white'
                  : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Snapshot</span>
            </button>
            {fsSnapshotOpen && (
              <SnapshotMenuDropdown onClose={() => setFsSnapshotOpen(false)} />
            )}
          </div>
          <div className="w-[1px] h-4 bg-[#2a2e39]" />
          <button
            type="button"
            onClick={() => setChartFullscreen(false)}
            title="Exit Fullscreen (Esc / Shift + F)"
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[11.5px] font-medium text-[#d1d4dc] hover:bg-[#2a2e39] hover:text-white transition-colors cursor-pointer"
          >
            <Minimize className="w-3.5 h-3.5" />
            <span>Exit Fullscreen</span>
          </button>
        </div>
      )}

      {/* Draggable Floating Favorites Toolbar */}
      {!isChartFullscreen && <FloatingFavoritesBar />}

      {/* Modals */}
      <SymbolSearchModal />
      <IndicatorsModal />
      <ChartSettingsModal />
      <AccountLoginModal />
      <BacktestReportModal />
      <TradingAnalyticsModal />
      <QuickIntervalModal />
      <DrawingSettingsModal />

      {/* Persistent TradingView-style Alert Triggered Popup (stays until user clicks OK / Re-arm) */}
      {triggeredAlertNotice && (
        <div className="fixed top-14 right-5 z-[60] w-[320px] rounded-md bg-[#1e222d] border-2 border-[#f59e0b] shadow-tv overflow-hidden text-[12px]">
          <div className="flex items-center justify-between px-3 py-2 bg-[#f59e0b]/15 border-b border-[#f59e0b]/40">
            <div className="flex items-center gap-2 text-[#f59e0b] font-bold">
              <Bell className="w-4 h-4 animate-bounce" />
              <span>Alert Triggered!</span>
            </div>
            <button
              onClick={dismissTriggeredAlert}
              className="p-0.5 rounded text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[14px] text-white">
                {triggeredAlertNotice.alert.symbol}
              </span>
              <span className="font-mono-num text-[13px] font-bold text-[#f59e0b]">
                @ {triggeredAlertNotice.alert.price}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-[#787b86]">
              <span>Condition: {triggeredAlertNotice.alert.condition.replace('_', ' ')}</span>
              <span>
                {new Date(triggeredAlertNotice.triggeredAt).toLocaleTimeString()}
              </span>
            </div>
            {triggeredAlertNotice.alert.note && (
              <div className="px-2 py-1.5 rounded bg-[#131722] border border-[#2a2e39] text-[#d1d4dc] text-[11.5px]">
                {triggeredAlertNotice.alert.note}
              </div>
            )}
            <div className="flex items-center gap-1.5 pt-1">
              <button
                onClick={() => playAlertSound()}
                title="Replay Alert Sound"
                className="px-2.5 h-7 rounded bg-[#131722] hover:bg-[#2a2e39] border border-[#2a2e39] text-[#d1d4dc] flex items-center gap-1 text-[11px] cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5 text-[#f59e0b]" />
                <span>Sound</span>
              </button>
              <button
                onClick={() => rearmAlert(triggeredAlertNotice.alert.id)}
                className="flex-1 h-7 rounded bg-[#2a2e39] hover:bg-[#363a45] text-[#d1d4dc] flex items-center justify-center gap-1 text-[11px] font-medium cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Re-arm</span>
              </button>
              <button
                onClick={dismissTriggeredAlert}
                className="flex-1 h-7 rounded bg-[#f59e0b] hover:bg-[#d97706] text-[#131722] font-bold text-[11.5px] cursor-pointer"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order & Alert Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-10 right-5 z-50 flex items-center gap-2.5 px-3.5 py-2.5 rounded-md border shadow-tv max-w-md text-[12px] ${
            toastMessage.type === 'success'
              ? 'bg-[#1e222d] border-[#089981] text-[#d1d4dc]'
              : toastMessage.type === 'error'
              ? 'bg-[#1e222d] border-[#f23645] text-[#d1d4dc]'
              : 'bg-[#1e222d] border-[#2962ff] text-[#d1d4dc]'
          }`}
        >
          {toastMessage.type === 'success' && (
            <CheckCircle2 className="w-4 h-4 text-[#089981] shrink-0" />
          )}
          {toastMessage.type === 'error' && (
            <AlertCircle className="w-4 h-4 text-[#f23645] shrink-0" />
          )}
          {toastMessage.type === 'info' && (
            <Info className="w-4 h-4 text-[#2962ff] shrink-0" />
          )}
          <span className="leading-snug">{toastMessage.message}</span>
          <button
            onClick={clearToast}
            className="text-[#787b86] hover:text-[#d1d4dc] ml-1 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
