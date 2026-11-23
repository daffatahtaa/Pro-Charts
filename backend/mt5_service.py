import ctypes
import glob
import logging
import math
import os
import random
import re
import threading
import time
from ctypes import wintypes
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from models import ModifyPositionRequest, PlaceOrderRequest

try:
    import MetaTrader5 as mt5
    MT5_IMPORTED = True
except ImportError:
    mt5 = None
    MT5_IMPORTED = False

logger = logging.getLogger("mt5_service")

SW_HIDE = 0
SW_SHOWNOACTIVATE = 4
SW_RESTORE = 9
WM_COMMAND = 0x0111
MT5_CMD_ALGO_TRADING = 32851
MT4_CMD_ALGO_TRADING = 33020

GWL_EXSTYLE = -20
WS_EX_TOOLWINDOW = 0x00000080
WS_EX_APPWINDOW = 0x00040000
WS_EX_LAYERED = 0x00080000
LWA_ALPHA = 0x00000002
SWP_NOSIZE = 0x0001
SWP_NOZORDER = 0x0004
SWP_NOACTIVATE = 0x0010
SWP_FRAMECHANGED = 0x0020
SWP_ASYNCWINDOWPOS = 0x4000


def _find_mt5_hwnds() -> List[int]:
    """Cari semua Top-Level Window Handle milik proses terminal64.exe (64-bit safe)."""
    if os.name != "nt":
        return []
    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32

    kernel32.OpenProcess.restype = wintypes.HANDLE
    kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.QueryFullProcessImageNameW.argtypes = [
        wintypes.HANDLE,
        wintypes.DWORD,
        wintypes.LPWSTR,
        ctypes.POINTER(wintypes.DWORD),
    ]

    hwnds: List[int] = []
    WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    def enum_cb(hwnd: int, _lparam: int) -> bool:
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if not pid.value:
            return True
        # Open process with PROCESS_QUERY_LIMITED_INFORMATION (0x1000)
        h_proc = kernel32.OpenProcess(0x1000, False, pid.value)
        if h_proc:
            try:
                buf = ctypes.create_unicode_buffer(260)
                size = wintypes.DWORD(260)
                if kernel32.QueryFullProcessImageNameW(h_proc, 0, buf, ctypes.byref(size)):
                    exe_name = os.path.basename(buf.value).lower()
                    if exe_name in ("terminal64.exe", "terminal.exe"):
                        cls_buf = ctypes.create_unicode_buffer(128)
                        user32.GetClassNameW(hwnd, cls_buf, 128)
                        if "MetaQuotes::MetaTrader" in cls_buf.value:
                            hwnds.append(int(hwnd))
            finally:
                kernel32.CloseHandle(h_proc)
        return True

    user32.EnumWindows(WNDENUMPROC(enum_cb), 0)
    return hwnds

TF_SECONDS: Dict[str, int] = {
    "1m": 60,
    "2m": 120,
    "3m": 180,
    "4m": 240,
    "5m": 300,
    "6m": 360,
    "10m": 600,
    "12m": 720,
    "15m": 900,
    "20m": 1200,
    "30m": 1800,
    "1h": 3600,
    "2h": 7200,
    "3h": 10800,
    "4h": 14400,
    "6h": 21600,
    "8h": 28800,
    "12h": 43200,
    "1D": 86400,
    "1W": 604800,
    "1M": 2592000,
}

TF_REGEX = re.compile(r"^(\d+)([mhdwHDWM]|MN)?$")


def normalize_tf_code(raw: str) -> Optional[str]:
    """Normalize timeframe string to canonical code ('1m', '45m', '2h', '1D', '2D', '1W', '1M')."""
    s = (raw or "").strip()
    if not s:
        return None
    if s.upper() in ("D", "1D", "D1"):
        return "1D"
    if s.upper() in ("W", "1W", "W1"):
        return "1W"
    # Case-sensitive check: uppercase 'M'/'1M' = 1 Month, lowercase '1m' = 1 Minute!
    if s in ("M", "1M") or s.upper() in ("MN", "1MN", "MN1"):
        return "1M"

    if s[0].upper() in ("M", "H", "D", "W") and s[1:].isdigit():
        unit = s[0].upper()
        val = int(s[1:])
        if val <= 0:
            return None
        if unit == "M":
            return f"{val // 60}h" if (val >= 60 and val % 60 == 0 and val // 60 <= 12) else f"{val}m"
        if unit == "H":
            return f"{val // 24}D" if (val >= 24 and val % 24 == 0) else f"{val}h"
        if unit == "D":
            return f"{val}D"
        if unit == "W":
            return f"{val}W"

    m = TF_REGEX.match(s)
    if not m:
        return None
    num = int(m.group(1))
    unit = m.group(2) or "m"
    if num <= 0:
        return None

    if unit == "m":
        if num >= 60 and num % 60 == 0 and (num // 60) <= 12:
            return f"{num // 60}h"
        return f"{num}m"
    if unit in ("h", "H"):
        if num >= 24 and num % 24 == 0:
            return f"{num // 24}D"
        return f"{num}h"
    if unit in ("d", "D"):
        return f"{num}D"
    if unit in ("w", "W"):
        return f"{num}W"
    if unit in ("M", "MN"):
        return f"{num}M"
    return None


def parse_tf_seconds(tf: str) -> Optional[int]:
    norm = normalize_tf_code(tf)
    if not norm:
        return None
    if norm.endswith("m"):
        val = int(norm[:-1])
        return val * 60 if 1 <= val <= 1440 else None
    if norm.endswith("h"):
        val = int(norm[:-1])
        return val * 3600 if 1 <= val <= 168 else None
    if norm.endswith("D"):
        val = int(norm[:-1])
        return val * 86400 if 1 <= val <= 30 else None
    if norm.endswith("W"):
        val = int(norm[:-1])
        return val * 604800 if 1 <= val <= 12 else None
    if norm.endswith("M"):
        val = int(norm[:-1])
        return val * 2592000 if 1 <= val <= 12 else None
    return None


def get_mt5_timeframe(tf: str) -> Optional[int]:
    if not MT5_IMPORTED or mt5 is None:
        return None
    norm = normalize_tf_code(tf) or tf
    mapping = {
        "1m": mt5.TIMEFRAME_M1,
        "2m": mt5.TIMEFRAME_M2,
        "3m": mt5.TIMEFRAME_M3,
        "4m": mt5.TIMEFRAME_M4,
        "5m": mt5.TIMEFRAME_M5,
        "6m": mt5.TIMEFRAME_M6,
        "10m": mt5.TIMEFRAME_M10,
        "12m": mt5.TIMEFRAME_M12,
        "15m": mt5.TIMEFRAME_M15,
        "20m": mt5.TIMEFRAME_M20,
        "30m": mt5.TIMEFRAME_M30,
        "1h": mt5.TIMEFRAME_H1,
        "2h": mt5.TIMEFRAME_H2,
        "3h": mt5.TIMEFRAME_H3,
        "4h": mt5.TIMEFRAME_H4,
        "6h": mt5.TIMEFRAME_H6,
        "8h": mt5.TIMEFRAME_H8,
        "12h": mt5.TIMEFRAME_H12,
        "1D": mt5.TIMEFRAME_D1,
        "1W": mt5.TIMEFRAME_W1,
        "1M": mt5.TIMEFRAME_MN1,
    }
    return mapping.get(norm)


def _select_base_tf_for_resampling(target_sec: int) -> Tuple[str, int]:
    """Select the largest native MT5 base timeframe that evenly divides target_sec."""
    candidates = [
        (86400, "1D"),
        (14400, "4h"),
        (3600, "1h"),
        (1800, "30m"),
        (900, "15m"),
        (300, "5m"),
        (60, "1m"),
    ]
    for base_sec, base_tf in candidates:
        if target_sec >= base_sec and target_sec % base_sec == 0:
            return base_tf, max(1, target_sec // base_sec)
    return "1m", max(1, target_sec // 60)


def _resample_candles(
    base_candles: List[Dict[str, Any]], target_sec: int, digits: int
) -> List[Dict[str, Any]]:
    """Aggregate base OHLCV candles into exact target_sec time buckets."""
    if not base_candles:
        return []
    bucket_ms = target_sec * 1000
    buckets: Dict[int, Dict[str, Any]] = {}
    for c in sorted(base_candles, key=lambda x: x["timestamp"]):
        bts = (int(c["timestamp"]) // bucket_ms) * bucket_ms
        existing = buckets.get(bts)
        if existing is None:
            buckets[bts] = {
                "timestamp": bts,
                "open": round(float(c["open"]), digits),
                "high": round(float(c["high"]), digits),
                "low": round(float(c["low"]), digits),
                "close": round(float(c["close"]), digits),
                "volume": float(c.get("volume", 0.0)),
                "spread": int(c.get("spread", 0)),
            }
        else:
            existing["high"] = round(max(existing["high"], float(c["high"])), digits)
            existing["low"] = round(min(existing["low"], float(c["low"])), digits)
            existing["close"] = round(float(c["close"]), digits)
            existing["volume"] = float(existing["volume"] + float(c.get("volume", 0.0)))
            existing["spread"] = int(c.get("spread", existing["spread"]))
    return [buckets[k] for k in sorted(buckets.keys())]


def classify_category(symbol: str, path: str = "") -> str:
    s_upper = symbol.upper()
    p_upper = (path or "").upper()
    if any(k in s_upper for k in ("XAU", "XAG", "GOLD", "SILVER", "XPT", "XPD")) or "METAL" in p_upper:
        return "Metals"
    if any(k in s_upper for k in ("BTC", "ETH", "SOL", "XRP", "LTC", "DOGE", "ADA")) or "CRYPTO" in p_upper:
        return "Crypto"
    if any(k in s_upper for k in ("US30", "US100", "NAS100", "SPX", "US500", "GER40", "DE40", "UK100", "JP225", "HK50", "USTEC", "DJ30")) or "IND" in p_upper or "INDEX" in p_upper:
        return "Indices"
    if "FOREX" in p_upper or "FX" in p_upper or "MAJOR" in p_upper or "MINOR" in p_upper or "EXOTIC" in p_upper:
        return "Forex"
    # Heuristic for 6-char forex pairs
    currencies = ("USD", "EUR", "GBP", "JPY", "CHF", "AUD", "NZD", "CAD")
    clean = s_upper[:6]
    if len(clean) == 6 and clean[:3] in currencies and clean[3:] in currencies:
        return "Forex"
    return "Other"


MOCK_SYMBOLS: List[Dict[str, Any]] = [
    {"symbol": "XAUUSD", "description": "Gold vs US Dollar", "digits": 2, "point": 0.01, "category": "Metals", "base_price": 2650.50, "vol": 2.8, "spread": 25},
    {"symbol": "EURUSD", "description": "Euro vs US Dollar", "digits": 5, "point": 0.00001, "category": "Forex", "base_price": 1.08450, "vol": 0.0008, "spread": 10},
    {"symbol": "GBPUSD", "description": "Great Britain Pound vs US Dollar", "digits": 5, "point": 0.00001, "category": "Forex", "base_price": 1.26820, "vol": 0.0010, "spread": 14},
    {"symbol": "USDJPY", "description": "US Dollar vs Japanese Yen", "digits": 3, "point": 0.001, "category": "Forex", "base_price": 154.350, "vol": 0.14, "spread": 12},
    {"symbol": "AUDUSD", "description": "Australian Dollar vs US Dollar", "digits": 5, "point": 0.00001, "category": "Forex", "base_price": 0.65420, "vol": 0.0007, "spread": 12},
    {"symbol": "USDCAD", "description": "US Dollar vs Canadian Dollar", "digits": 5, "point": 0.00001, "category": "Forex", "base_price": 1.39210, "vol": 0.0008, "spread": 15},
    {"symbol": "USDCHF", "description": "US Dollar vs Swiss Franc", "digits": 5, "point": 0.00001, "category": "Forex", "base_price": 0.88150, "vol": 0.0007, "spread": 13},
    {"symbol": "GBPJPY", "description": "Great Britain Pound vs Japanese Yen", "digits": 3, "point": 0.001, "category": "Forex", "base_price": 195.740, "vol": 0.22, "spread": 22},
    {"symbol": "EURJPY", "description": "Euro vs Japanese Yen", "digits": 3, "point": 0.001, "category": "Forex", "base_price": 167.390, "vol": 0.18, "spread": 18},
    {"symbol": "XAGUSD", "description": "Silver vs US Dollar", "digits": 3, "point": 0.001, "category": "Metals", "base_price": 31.240, "vol": 0.12, "spread": 30},
    {"symbol": "US30", "description": "Dow Jones Industrial Average", "digits": 1, "point": 0.1, "category": "Indices", "base_price": 43850.0, "vol": 45.0, "spread": 30},
    {"symbol": "NAS100", "description": "Nasdaq 100 Index", "digits": 1, "point": 0.1, "category": "Indices", "base_price": 20890.0, "vol": 32.0, "spread": 20},
    {"symbol": "BTCUSD", "description": "Bitcoin vs US Dollar", "digits": 2, "point": 0.01, "category": "Crypto", "base_price": 91450.00, "vol": 280.0, "spread": 150},
    {"symbol": "ETHUSD", "description": "Ethereum vs US Dollar", "digits": 2, "point": 0.01, "category": "Crypto", "base_price": 3180.00, "vol": 18.0, "spread": 40},
]
MOCK_SYMBOL_MAP: Dict[str, Dict[str, Any]] = {s["symbol"]: s for s in MOCK_SYMBOLS}


class MT5Service:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.connected: bool = False
        self.last_error_msg: Optional[str] = None
        self._mock_live_state: Dict[str, Dict[str, Any]] = {}
        self._d1_prev_close_cache: Dict[str, Tuple[float, float]] = {}
        self._resolved_symbol_cache: Dict[str, str] = {}
        self.window_hidden: bool = False
        self._mock_positions: List[Dict[str, Any]] = []
        self._mock_orders: List[Dict[str, Any]] = []
        self._mock_balance: float = 10000.0
        self._mock_ticket_seq: int = 900001
        self.initialize()

    def initialize(self) -> bool:
        initialized_ok = False
        with self._lock:
            if not MT5_IMPORTED or mt5 is None:
                self.connected = False
                self.last_error_msg = "MetaTrader5 Python package not installed; using mock fallback."
                logger.warning(self.last_error_msg)
                return False

            try:
                ok = mt5.initialize()
                if ok:
                    self.connected = True
                    self.last_error_msg = None
                    initialized_ok = True
                    info = mt5.terminal_info()
                    acc = mt5.account_info()
                    logger.info(
                        "MT5 connected: company=%s, server=%s, login=%s",
                        getattr(info, "company", ""),
                        getattr(acc, "server", ""),
                        getattr(acc, "login", 0),
                    )
                else:
                    err = mt5.last_error()
                    self.connected = False
                    self.last_error_msg = f"mt5.initialize() failed: {err}"
                    logger.warning("%s — Falling back to realistic mock market data.", self.last_error_msg)
                    return False
            except Exception as exc:
                self.connected = False
                self.last_error_msg = f"MT5 init exception: {exc}"
                logger.warning("%s — Falling back to realistic mock market data.", self.last_error_msg)
                return False

        # Auto-disable other chart EAs & auto-enable Algo Trading for WebView IPC
        if initialized_ok:
            try:
                algo_res = self.enable_algo_trading()
                logger.info("MT5 Auto-Algo: %s", algo_res["message"])
            except Exception as exc:
                logger.warning("Failed to auto-enable Algo Trading: %s", exc)

        # Auto-Hide MT5 Terminal window on startup when MT5_HEADLESS=1 (default)
        if initialized_ok and os.environ.get("MT5_HEADLESS", "1") == "1":
            try:
                res = self.set_terminal_window_hidden(True)
                logger.info("MT5 Headless Auto-Hide: %s", res["message"])
            except Exception as exc:
                logger.warning("Failed to auto-hide MT5 window: %s", exc)
        return initialized_ok

    def disable_other_chart_eas(self) -> int:
        """Hapus/nonaktifkan semua EA lain (<expert>...</expert>) pada chart profile MT5 agar hanya WebView IPC yang bisa trading."""
        removed = 0
        if not self.connected or not MT5_IMPORTED or mt5 is None:
            return 0
        with self._lock:
            term = mt5.terminal_info()
            data_path = getattr(term, "data_path", "") if term else ""
        if not data_path:
            return 0

        pattern = os.path.join(data_path, "MQL5", "Profiles", "Charts", "**", "*.chr")
        expert_re = re.compile(r"<expert>.*?</expert>\s*", re.IGNORECASE | re.DOTALL)
        for chr_path in glob.glob(pattern, recursive=True):
            try:
                raw = open(chr_path, "rb").read()
                has_bom = raw.startswith(b"\xff\xfe")
                text = raw[2:].decode("utf-16-le", errors="ignore") if has_bom else raw.decode("utf-16-le", errors="ignore")
                if "<expert>" in text.lower():
                    cleaned, count = expert_re.subn("", text)
                    if count > 0:
                        out_bytes = (b"\xff\xfe" if has_bom else b"") + cleaned.encode("utf-16-le")
                        with open(chr_path, "wb") as f:
                            f.write(out_bytes)
                        removed += count
                        logger.info("Removed %d non-WebView EA block(s) from %s", count, chr_path)
            except Exception as exc:
                logger.debug("Skipping chart profile %s: %s", chr_path, exc)
        return removed

    def enable_algo_trading(self) -> Dict[str, Any]:
        """Otomatis aktifkan Algo Trading (Ctrl+E / WM_COMMAND 32851) di MT5 meski dalam mode headless, setelah menonaktifkan EA lain."""
        removed_eas = self.disable_other_chart_eas()
        if not self.connected or not MT5_IMPORTED or mt5 is None:
            return {
                "algo_trading_enabled": True,
                "removed_eas": removed_eas,
                "message": "Mock mode: Algo Trading enabled.",
            }

        with self._lock:
            term = mt5.terminal_info()
            already_on = bool(getattr(term, "trade_allowed", False)) if term else False

        if already_on:
            return {
                "algo_trading_enabled": True,
                "removed_eas": removed_eas,
                "message": f"Algo Trading ON (removed {removed_eas} other chart EA(s)).",
            }

        hwnds = _find_mt5_hwnds()
        if os.name == "nt" and hwnds:
            user32 = ctypes.windll.user32
            user32.PostMessageW.argtypes = [
                wintypes.HWND,
                wintypes.UINT,
                wintypes.WPARAM,
                wintypes.LPARAM,
            ]
            for cmd_id in (MT5_CMD_ALGO_TRADING, MT4_CMD_ALGO_TRADING):
                for hwnd in hwnds:
                    user32.PostMessageW(hwnd, WM_COMMAND, cmd_id, 0)
                time.sleep(0.45)
                with self._lock:
                    term = mt5.terminal_info()
                    now_on = bool(getattr(term, "trade_allowed", False)) if term else False
                if now_on:
                    return {
                        "algo_trading_enabled": True,
                        "removed_eas": removed_eas,
                        "message": f"Algo Trading otomatis diaktifkan (cmd={cmd_id}, removed {removed_eas} other EA(s)).",
                    }

        with self._lock:
            term = mt5.terminal_info()
            final_on = bool(getattr(term, "trade_allowed", False)) if term else False
        return {
            "algo_trading_enabled": final_on,
            "removed_eas": removed_eas,
            "message": (
                "Algo Trading ON."
                if final_on
                else f"Tidak bisa mengaktifkan Algo Trading otomatis (hwnds={len(hwnds)}). Klik 'MT5 Hidden' lalu tekan Ctrl+E di MT5."
            ),
        }

    def set_terminal_window_hidden(self, hidden: bool) -> Dict[str, Any]:
        """
        Off-Screen + Transparent Layered ToolWindow Cloaking (NEVER use SW_HIDE!).
        Keeps MT5's internal IsWindowVisible() == TRUE so background history downloads
        for new pairs (like XAUUSDc) never freeze, while completely hiding MT5 from
        the screen, Taskbar, and Alt+Tab.
        """
        hwnds = _find_mt5_hwnds()
        if os.name == "nt" and hwnds:
            user32 = ctypes.windll.user32
            get_wl = getattr(user32, "GetWindowLongPtrW", user32.GetWindowLongW)
            set_wl = getattr(user32, "SetWindowLongPtrW", user32.SetWindowLongW)
            get_wl.restype = ctypes.c_longlong
            get_wl.argtypes = [wintypes.HWND, ctypes.c_int]
            set_wl.restype = ctypes.c_longlong
            set_wl.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_longlong]
            user32.SetLayeredWindowAttributes.argtypes = [
                wintypes.HWND,
                wintypes.COLORREF,
                wintypes.BYTE,
                wintypes.DWORD,
            ]
            user32.SetWindowPos.argtypes = [
                wintypes.HWND,
                wintypes.HWND,
                ctypes.c_int,
                ctypes.c_int,
                ctypes.c_int,
                ctypes.c_int,
                wintypes.UINT,
            ]

            for hwnd in hwnds:
                ex_style = int(get_wl(hwnd, GWL_EXSTYLE))
                if hidden:
                    # Ensure window stays WS_VISIBLE (not SW_HIDE) so history pump keeps running
                    user32.ShowWindowAsync(hwnd, SW_SHOWNOACTIVATE)
                    new_style = (ex_style | WS_EX_TOOLWINDOW | WS_EX_LAYERED) & ~WS_EX_APPWINDOW
                    set_wl(hwnd, GWL_EXSTYLE, new_style)
                    user32.SetLayeredWindowAttributes(hwnd, 0, 0, LWA_ALPHA)
                    user32.SetWindowPos(
                        hwnd,
                        0,
                        -32000,
                        -32000,
                        0,
                        0,
                        SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_ASYNCWINDOWPOS,
                    )
                else:
                    new_style = (ex_style & ~WS_EX_TOOLWINDOW) | WS_EX_APPWINDOW | WS_EX_LAYERED
                    set_wl(hwnd, GWL_EXSTYLE, new_style)
                    user32.SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA)
                    user32.SetWindowPos(
                        hwnd,
                        0,
                        100,
                        100,
                        1280,
                        800,
                        SWP_NOZORDER | SWP_FRAMECHANGED | SWP_ASYNCWINDOWPOS,
                    )
                    user32.ShowWindowAsync(hwnd, SW_RESTORE)
                    user32.SetForegroundWindow(hwnd)

        self.window_hidden = hidden
        action_word = "cloaked off-screen (history pump active)" if hidden else "restored"
        msg = (
            f"MT5 terminal window {action_word} ({len(hwnds)} window(s))."
            if hwnds
            else f"No running MetaQuotes::MetaTrader window found (state={action_word})."
        )
        return {
            "hidden": self.window_hidden,
            "hwnd_count": len(hwnds),
            "message": msg,
        }

    def shutdown(self) -> None:
        with self._lock:
            if self.connected and MT5_IMPORTED and mt5 is not None:
                try:
                    mt5.shutdown()
                except Exception:
                    pass
            self.connected = False

    def _ensure_connected(self) -> bool:
        if self.connected:
            return True
        return False

    def get_connection_status(self) -> Dict[str, Any]:
        with self._lock:
            if self.connected and MT5_IMPORTED and mt5 is not None:
                term = mt5.terminal_info()
                acc = mt5.account_info()
                if term is not None:
                    return {
                        "connected": True,
                        "mode": "mt5",
                        "terminal_company": getattr(term, "company", "") or "",
                        "server": getattr(acc, "server", "") if acc else "",
                        "account_login": int(getattr(acc, "login", 0)) if acc else 0,
                        "mt5_window_hidden": self.window_hidden,
                        "algo_trading_enabled": bool(getattr(term, "trade_allowed", False)),
                        "error": None,
                    }
            return {
                "connected": False,
                "mode": "mock",
                "terminal_company": "Simulated Feed (MT5 Offline)",
                "server": "Local-Mock-Engine",
                "account_login": 0,
                "mt5_window_hidden": self.window_hidden,
                "algo_trading_enabled": True,
                "error": self.last_error_msg,
            }

    def get_symbol_spec(self, symbol: str) -> Dict[str, Any]:
        with self._lock:
            if self.connected and MT5_IMPORTED and mt5 is not None:
                mt5.symbol_select(symbol, True)
                info = mt5.symbol_info(symbol)
                if info is not None:
                    return {
                        "symbol": info.name,
                        "description": info.description or info.name,
                        "digits": int(info.digits),
                        "point": float(info.point),
                        "category": classify_category(info.name, getattr(info, "path", "")),
                    }
            # Fallback mock spec
            mock = MOCK_SYMBOL_MAP.get(symbol.upper())
            if mock:
                return {
                    "symbol": mock["symbol"],
                    "description": mock["description"],
                    "digits": mock["digits"],
                    "point": mock["point"],
                    "category": mock["category"],
                }
            return {
                "symbol": symbol,
                "description": symbol,
                "digits": 5,
                "point": 0.00001,
                "category": classify_category(symbol),
            }

    def get_symbols(self, search: str = "", category: str = "") -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        search_u = (search or "").strip().upper()
        cat_u = (category or "").strip().lower()

        with self._lock:
            if self.connected and MT5_IMPORTED and mt5 is not None:
                all_syms = mt5.symbols_get()
                if all_syms:
                    # Prioritize visible symbols in Market Watch first
                    visible_list = []
                    hidden_list = []
                    for s in all_syms:
                        cat = classify_category(s.name, getattr(s, "path", ""))
                        if cat_u and cat_u != "all" and cat.lower() != cat_u:
                            continue
                        if search_u and search_u not in s.name.upper() and search_u not in (s.description or "").upper():
                            continue
                        item = {
                            "symbol": s.name,
                            "description": s.description or s.name,
                            "digits": int(s.digits),
                            "point": float(s.point),
                            "category": cat,
                        }
                        if getattr(s, "visible", False):
                            visible_list.append(item)
                        else:
                            hidden_list.append(item)
                    results = (visible_list + hidden_list)[:200]
                    return results

        # Mock fallback
        for m in MOCK_SYMBOLS:
            if cat_u and cat_u != "all" and m["category"].lower() != cat_u:
                continue
            if search_u and search_u not in m["symbol"].upper() and search_u not in m["description"].upper():
                continue
            results.append(
                {
                    "symbol": m["symbol"],
                    "description": m["description"],
                    "digits": m["digits"],
                    "point": m["point"],
                    "category": m["category"],
                }
            )
        return results

    def _rates_to_dicts(self, rates: Any, digits: int) -> List[Dict[str, Any]]:
        if rates is None or len(rates) == 0:
            return []
        candles: List[Dict[str, Any]] = []
        for r in rates:
            ts_ms = int(r["time"]) * 1000
            vol = float(r["tick_volume"]) if "tick_volume" in r.dtype.names else 0.0
            spr = int(r["spread"]) if "spread" in r.dtype.names else 0
            candles.append(
                {
                    "timestamp": ts_ms,
                    "open": round(float(r["open"]), digits),
                    "high": round(float(r["high"]), digits),
                    "low": round(float(r["low"]), digits),
                    "close": round(float(r["close"]), digits),
                    "volume": vol,
                    "spread": spr,
                }
            )
        return candles

    def fetch_latest_candles(self, symbol: str, tf: str, count: int = 10000) -> List[Dict[str, Any]]:
        norm_tf = normalize_tf_code(tf) or tf
        tf_sec = parse_tf_seconds(norm_tf) or 900
        resolved_sym = self.resolve_broker_symbol(symbol)
        spec = self.get_symbol_spec(resolved_sym)
        digits = spec["digits"]

        with self._lock:
            if self.connected and MT5_IMPORTED and mt5 is not None:
                mt5.symbol_select(resolved_sym, True)
                mt5_tf = get_mt5_timeframe(norm_tf)
                if mt5_tf is not None:
                    # 14-attempt warm-up polling loop (max ~3.5s) for brand-new broker symbols (e.g. XAUUSDc)
                    for _attempt in range(14):
                        rates = mt5.copy_rates_from_pos(resolved_sym, mt5_tf, 0, count)
                        if rates is not None and len(rates) > 0:
                            return self._rates_to_dicts(rates, digits)
                        mt5.symbol_info_tick(resolved_sym)
                        time.sleep(0.25)
                    logger.warning(
                        "MT5 copy_rates_from_pos(%s, %s, %d) returned empty after warm-up: %s",
                        resolved_sym,
                        norm_tf,
                        count,
                        mt5.last_error(),
                    )
                    return []
                else:
                    # Arbitrary Custom Timeframe -> Smart OHLCV Resampling from largest native divisor
                    base_tf, ratio = _select_base_tf_for_resampling(tf_sec)
                    base_mt5_tf = get_mt5_timeframe(base_tf)
                    if base_mt5_tf is not None:
                        target_bars = min(count, 2500)
                        base_count = min(15000, max(300, target_bars * ratio + ratio * 2))
                        for _attempt in range(14):
                            rates = mt5.copy_rates_from_pos(resolved_sym, base_mt5_tf, 0, base_count)
                            if rates is not None and len(rates) > 0:
                                base_dicts = self._rates_to_dicts(rates, digits)
                                resampled = _resample_candles(base_dicts, tf_sec, digits)
                                return resampled[-count:]
                            mt5.symbol_info_tick(resolved_sym)
                            time.sleep(0.25)
                    return []

        # Fallback realistic synthetic candles ONLY when MT5 is offline
        now_sec = int(time.time())
        aligned_now = (now_sec // tf_sec) * tf_sec
        return self._generate_mock_candles(resolved_sym, tf_sec, aligned_now, count)

    def fetch_candles_before(
        self,
        symbol: str,
        tf: str,
        before_ts_ms: int,
        count: int = 5000,
        offset_pos: int = 0,
    ) -> List[Dict[str, Any]]:
        norm_tf = normalize_tf_code(tf) or tf
        tf_sec = parse_tf_seconds(norm_tf) or 900
        resolved_sym = self.resolve_broker_symbol(symbol)
        spec = self.get_symbol_spec(resolved_sym)
        digits = spec["digits"]
        fetch_count = max(count, 5000)

        with self._lock:
            if self.connected and MT5_IMPORTED and mt5 is not None:
                mt5.symbol_select(resolved_sym, True)
                mt5_tf = get_mt5_timeframe(norm_tf)
                dt_from = datetime.fromtimestamp(
                    max(0.0, (before_ts_ms / 1000.0) - 1.0), tz=timezone.utc
                )

                if mt5_tf is not None:
                    rates = mt5.copy_rates_from(resolved_sym, mt5_tf, dt_from, fetch_count)
                    candles = [
                        c
                        for c in self._rates_to_dicts(rates, digits)
                        if c["timestamp"] < before_ts_ms
                    ]

                    if len(candles) < min(100, count):
                        pos_rates = mt5.copy_rates_from_pos(
                            resolved_sym, mt5_tf, max(0, offset_pos), fetch_count
                        )
                        if pos_rates is None or len(pos_rates) == 0:
                            time.sleep(0.25)
                            pos_rates = mt5.copy_rates_from_pos(
                                resolved_sym, mt5_tf, max(0, offset_pos), fetch_count
                            )
                        pos_candles = [
                            c
                            for c in self._rates_to_dicts(pos_rates, digits)
                            if c["timestamp"] < before_ts_ms
                        ]
                        if len(pos_candles) > len(candles):
                            candles = pos_candles

                    if not candles:
                        time.sleep(0.25)
                        rates2 = mt5.copy_rates_from(resolved_sym, mt5_tf, dt_from, fetch_count)
                        candles = [
                            c
                            for c in self._rates_to_dicts(rates2, digits)
                            if c["timestamp"] < before_ts_ms
                        ]

                    return candles
                else:
                    # Arbitrary Custom Timeframe -> Resample from base TF
                    base_tf, ratio = _select_base_tf_for_resampling(tf_sec)
                    base_mt5_tf = get_mt5_timeframe(base_tf)
                    if base_mt5_tf is not None:
                        base_count = min(50000, fetch_count * ratio)
                        rates = mt5.copy_rates_from(resolved_sym, base_mt5_tf, dt_from, base_count)
                        if rates is None or len(rates) == 0:
                            rates = mt5.copy_rates_from_pos(
                                resolved_sym, base_mt5_tf, max(0, offset_pos * ratio), base_count
                            )
                        base_dicts = self._rates_to_dicts(rates, digits)
                        resampled = _resample_candles(base_dicts, tf_sec, digits)
                        return [c for c in resampled if c["timestamp"] < before_ts_ms]
                    return []

        end_sec = (int(before_ts_ms // 1000) // tf_sec) * tf_sec - tf_sec
        return self._generate_mock_candles(resolved_sym, tf_sec, end_sec, count)

    def fetch_candles_range(
        self, symbol: str, tf: str, start_ts_ms: int, end_ts_ms: int
    ) -> List[Dict[str, Any]]:
        norm_tf = normalize_tf_code(tf) or tf
        tf_sec = parse_tf_seconds(norm_tf) or 900
        resolved_sym = self.resolve_broker_symbol(symbol)
        spec = self.get_symbol_spec(resolved_sym)
        digits = spec["digits"]
        start_ms = max(0, int(start_ts_ms))
        end_ms = max(start_ms + tf_sec * 1000, int(end_ts_ms))

        with self._lock:
            if self.connected and MT5_IMPORTED and mt5 is not None:
                mt5.symbol_select(resolved_sym, True)
                mt5_tf = get_mt5_timeframe(norm_tf)
                dt_from = datetime.fromtimestamp(start_ms / 1000.0, tz=timezone.utc)
                dt_to = datetime.fromtimestamp(end_ms / 1000.0, tz=timezone.utc)

                if mt5_tf is not None:
                    for _attempt in range(4):
                        rates = mt5.copy_rates_range(resolved_sym, mt5_tf, dt_from, dt_to)
                        if rates is not None and len(rates) > 0:
                            return [
                                c
                                for c in self._rates_to_dicts(rates, digits)
                                if start_ms <= c["timestamp"] <= end_ms
                            ]
                        mt5.symbol_info_tick(resolved_sym)
                        time.sleep(0.25)
                    return []
                else:
                    base_tf, _ratio = _select_base_tf_for_resampling(tf_sec)
                    base_mt5_tf = get_mt5_timeframe(base_tf)
                    if base_mt5_tf is not None:
                        for _attempt in range(4):
                            rates = mt5.copy_rates_range(resolved_sym, base_mt5_tf, dt_from, dt_to)
                            if rates is not None and len(rates) > 0:
                                base_dicts = self._rates_to_dicts(rates, digits)
                                resampled = _resample_candles(base_dicts, tf_sec, digits)
                                return [
                                    c for c in resampled if start_ms <= c["timestamp"] <= end_ms
                                ]
                            mt5.symbol_info_tick(resolved_sym)
                            time.sleep(0.25)
                    return []

        # Fallback mock candles when MT5 is offline
        bar_count = min(5000, max(10, int((end_ms - start_ms) // (tf_sec * 1000)) + 1))
        end_sec = (int(end_ms // 1000) // tf_sec) * tf_sec
        return self._generate_mock_candles(resolved_sym, tf_sec, end_sec, bar_count)

    def fetch_earliest_candles(
        self, symbol: str, tf: str, limit: int = 3000
    ) -> List[Dict[str, Any]]:
        norm_tf = normalize_tf_code(tf) or tf
        tf_sec = parse_tf_seconds(norm_tf) or 900
        resolved_sym = self.resolve_broker_symbol(symbol)
        spec = self.get_symbol_spec(resolved_sym)
        digits = spec["digits"]
        now_dt = datetime.now(timezone.utc)

        with self._lock:
            if self.connected and MT5_IMPORTED and mt5 is not None:
                mt5.symbol_select(resolved_sym, True)
                mt5_tf = get_mt5_timeframe(norm_tf)
                target_mt5_tf = mt5_tf
                needs_resample = False
                if target_mt5_tf is None:
                    base_tf, _ = _select_base_tf_for_resampling(tf_sec)
                    target_mt5_tf = get_mt5_timeframe(base_tf)
                    needs_resample = True

                if target_mt5_tf is not None:
                    for year in (2015, 2018, 2020, 2022, 2024):
                        dt_from = datetime(year, 1, 1, tzinfo=timezone.utc)
                        if dt_from >= now_dt:
                            continue
                        rates = mt5.copy_rates_range(resolved_sym, target_mt5_tf, dt_from, now_dt)
                        if rates is not None and len(rates) > 0:
                            dicts = self._rates_to_dicts(rates, digits)
                            if needs_resample:
                                dicts = _resample_candles(dicts, tf_sec, digits)
                            return dicts[:limit]
                    # Fallback: pull largest available batch from pos 0
                    return self.fetch_latest_candles(resolved_sym, norm_tf, count=limit)[:limit]

        # Mock fallback starting 90 days ago
        start_sec = int(time.time()) - 90 * 86400
        end_sec = start_sec + limit * tf_sec
        aligned_end = (min(int(time.time()), end_sec) // tf_sec) * tf_sec
        return self._generate_mock_candles(resolved_sym, tf_sec, aligned_end, limit)

    def get_latest_broker_timestamp_ms(self) -> Optional[int]:
        """Get the latest real candle timestamp from MT5 broker to detect/clean mock clock pollution."""
        with self._lock:
            if not self.connected or not MT5_IMPORTED or mt5 is None:
                return None
            for sym in ("EURUSD", "XAUUSD", "GBPUSD", "USDJPY"):
                mt5.symbol_select(sym, True)
                rates = mt5.copy_rates_from_pos(sym, mt5.TIMEFRAME_M15, 0, 1)
                if rates is not None and len(rates) > 0:
                    return int(rates[0]["time"]) * 1000
        return None

    def get_terminal_data_path(self) -> str:
        with self._lock:
            if self.connected and MT5_IMPORTED and mt5 is not None:
                term = mt5.terminal_info()
                return str(getattr(term, "data_path", "") or "") if term else ""
        return ""

    def resolve_broker_symbol(self, requested_symbol: str) -> str:
        """
        Auto-resolve broker symbol suffix (e.g. XAUUSD -> XAUUSDc / XAUUSDm / XAUUSD.raw),
        ensuring trade_mode != 0 (skipping disabled view-only symbols on Cent/Raw accounts).
        """
        if not requested_symbol:
            return requested_symbol
        if not self.connected or not MT5_IMPORTED or mt5 is None:
            return requested_symbol
        cached = self._resolved_symbol_cache.get(requested_symbol)
        if cached:
            return cached
        with self._lock:
            info = mt5.symbol_info(requested_symbol)
            if info is not None and int(getattr(info, "trade_mode", 0)) != 0:
                mt5.symbol_select(requested_symbol, True)
                self._resolved_symbol_cache[requested_symbol] = info.name
                return info.name

            # Strip common suffixes to get base root (e.g. XAUUSDc / XAUUSDm -> XAUUSD)
            base = re.sub(r"(\.[a-zA-Z0-9]+|[mcMC]|pro|raw|ecn|_i)$", "", requested_symbol)
            base_u = base.upper()
            all_syms = mt5.symbols_get() or []

            # Priority 1: exact match on base with trade_mode != 0
            for s in all_syms:
                if s.name.upper() == base_u and int(getattr(s, "trade_mode", 0)) != 0:
                    mt5.symbol_select(s.name, True)
                    self._resolved_symbol_cache[requested_symbol] = s.name
                    return s.name

            # Priority 2: starts with base AND trade_mode != 0 (visible in Market Watch first, then shortest)
            candidates = [
                s
                for s in all_syms
                if s.name.upper().startswith(base_u) and int(getattr(s, "trade_mode", 0)) != 0
            ]
            if candidates:
                candidates.sort(key=lambda s: (not bool(getattr(s, "visible", False)), len(s.name)))
                mt5.symbol_select(candidates[0].name, True)
                self._resolved_symbol_cache[requested_symbol] = candidates[0].name
                return candidates[0].name

            # Fallback: if exact symbol exists even with trade_mode == 0
            if info is not None:
                mt5.symbol_select(info.name, True)
                self._resolved_symbol_cache[requested_symbol] = info.name
                return info.name
        return requested_symbol

    def resolve_watchlist_symbols(self, symbols: List[str]) -> List[str]:
        out: List[str] = []
        seen = set()
        for sym in symbols:
            resolved = self.resolve_broker_symbol(sym)
            if resolved and resolved not in seen:
                seen.add(resolved)
                out.append(resolved)
        return out

    def login_account(
        self,
        login: int,
        password: str,
        server: str,
        current_symbol: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Switch/Login MT5 trading account directly from WebView via mt5.login() / mt5.initialize()."""
        if not MT5_IMPORTED or mt5 is None:
            return {
                "success": False,
                "message": "MetaTrader5 package is not installed.",
                "account": None,
                "resolved_symbol": None,
            }

        with self._lock:
            authorized = False
            try:
                authorized = bool(
                    mt5.login(
                        login=int(login),
                        password=str(password),
                        server=str(server),
                        timeout=15000,
                    )
                )
            except Exception as exc:
                logger.warning("mt5.login() exception: %s", exc)

            if not authorized:
                try:
                    authorized = bool(
                        mt5.initialize(
                            login=int(login),
                            password=str(password),
                            server=str(server),
                            timeout=15000,
                        )
                    )
                except Exception as exc:
                    logger.warning("mt5.initialize(login=...) exception: %s", exc)

            if not authorized:
                err = mt5.last_error()
                err_code = err[0] if isinstance(err, tuple) and len(err) > 0 else -1
                err_desc = err[1] if isinstance(err, tuple) and len(err) > 1 else str(err)
                if err_code == -6:
                    msg = f"Login gagal: Nomor Login atau Password salah untuk server {server}."
                else:
                    msg = (
                        f"Server '{server}' belum memiliki profil jaringan di MT5 lokal atau tidak terjangkau ({err_code}: {err_desc}). "
                        f"Klik 'MT5 Hidden' -> File -> Open an Account -> cari broker sekali untuk mengunduh sertifikat servernya."
                    )
                return {
                    "success": False,
                    "message": msg,
                    "account": None,
                    "resolved_symbol": None,
                }

            # Allow MT5 terminal to sync account_info & broker symbol list
            time.sleep(0.35)
            self.connected = True
            self.last_error_msg = None
            self._d1_prev_close_cache.clear()
            self._resolved_symbol_cache.clear()
            acc = mt5.account_info()
            term = mt5.terminal_info()

            account_summary = {
                "login": int(getattr(acc, "login", login)) if acc else int(login),
                "server": getattr(acc, "server", server) if acc else server,
                "currency": getattr(acc, "currency", "USD") if acc else "USD",
                "balance": round(float(getattr(acc, "balance", 0.0)), 2) if acc else 0.0,
                "equity": round(float(getattr(acc, "equity", 0.0)), 2) if acc else 0.0,
                "margin": round(float(getattr(acc, "margin", 0.0)), 2) if acc else 0.0,
                "free_margin": round(float(getattr(acc, "margin_free", 0.0)), 2) if acc else 0.0,
                "profit": round(float(getattr(acc, "profit", 0.0)), 2) if acc else 0.0,
                "leverage": int(getattr(acc, "leverage", 100)) if acc else 100,
                "trade_allowed": bool(getattr(term, "trade_allowed", False)) if term else False,
            }
            account_name = getattr(acc, "name", "") if acc else ""
            company = getattr(acc, "company", "") if acc else ""

        resolved_sym = (
            self.resolve_broker_symbol(current_symbol) if current_symbol else None
        )

        if self.window_hidden:
            self.set_terminal_window_hidden(True)
        self.enable_algo_trading()

        return {
            "success": True,
            "message": f"Connected to MT5 account #{account_summary['login']} ({account_summary['server']})",
            "account": account_summary,
            "account_name": account_name,
            "company": company,
            "resolved_symbol": resolved_sym,
        }

    def get_live_tick_and_candle(self, symbol: str, tf: str) -> Optional[Dict[str, Any]]:
        norm_tf = normalize_tf_code(tf) or tf
        tf_sec = parse_tf_seconds(norm_tf) or 900
        resolved_sym = self.resolve_broker_symbol(symbol)
        spec = self.get_symbol_spec(resolved_sym)
        digits = spec["digits"]
        point = spec["point"]

        with self._lock:
            if self.connected and MT5_IMPORTED and mt5 is not None:
                mt5.symbol_select(resolved_sym, True)
                tick = mt5.symbol_info_tick(resolved_sym)
                mt5_tf = get_mt5_timeframe(norm_tf)
                candle = None

                if mt5_tf is not None:
                    rates = mt5.copy_rates_from_pos(resolved_sym, mt5_tf, 0, 1)
                    if rates is not None and len(rates) > 0:
                        candle = self._rates_to_dicts(rates, digits)[0]
                else:
                    # Resample latest bucket for arbitrary custom TF
                    base_tf, ratio = _select_base_tf_for_resampling(tf_sec)
                    base_mt5_tf = get_mt5_timeframe(base_tf)
                    if base_mt5_tf is not None:
                        rates = mt5.copy_rates_from_pos(resolved_sym, base_mt5_tf, 0, ratio + 2)
                        if rates is not None and len(rates) > 0:
                            resampled = _resample_candles(self._rates_to_dicts(rates, digits), tf_sec, digits)
                            if resampled:
                                candle = resampled[-1]

                if tick is not None and candle is not None:
                    bid = round(float(tick.bid), digits)
                    ask = round(float(tick.ask), digits)
                    spread_pts = int(round((ask - bid) / point)) if point > 0 else 0
                    candle["close"] = bid
                    candle["high"] = round(max(candle["high"], bid), digits)
                    candle["low"] = round(min(candle["low"], bid), digits)
                    server_time_ms = int(getattr(tick, "time_msc", int(tick.time) * 1000))
                    return {
                        "type": "realtime_update",
                        "symbol": resolved_sym,
                        "tf": norm_tf,
                        "bid": bid,
                        "ask": ask,
                        "spread_points": spread_pts,
                        "server_time_ms": server_time_ms,
                        "candle": candle,
                    }

        # Mock live tick simulation
        return self._generate_mock_live_tick(resolved_sym, norm_tf, tf_sec)

    def get_tick_snapshot(self, symbol: str) -> Dict[str, Any]:
        spec = self.get_symbol_spec(symbol)
        digits = spec["digits"]
        point = spec["point"]
        now_ts = time.time()

        with self._lock:
            if self.connected and MT5_IMPORTED and mt5 is not None:
                mt5.symbol_select(symbol, True)
                tick = mt5.symbol_info_tick(symbol)
                if tick is not None:
                    bid = round(float(tick.bid), digits)
                    ask = round(float(tick.ask), digits)
                    spread_pts = int(round((ask - bid) / point)) if point > 0 else 0
                    change_pct = 0.0

                    cached_d1 = self._d1_prev_close_cache.get(symbol)
                    if cached_d1 and (now_ts - cached_d1[1]) < 60.0:
                        prev_close = cached_d1[0]
                    else:
                        prev_close = 0.0
                        rates = mt5.copy_rates_from_pos(symbol, mt5.TIMEFRAME_D1, 0, 2)
                        if rates is not None and len(rates) >= 1:
                            prev_close = float(rates[0]["open"]) if len(rates) == 1 else float(rates[0]["close"])
                            self._d1_prev_close_cache[symbol] = (prev_close, now_ts)

                    if prev_close > 0:
                        change_pct = round(((bid - prev_close) / prev_close) * 100.0, 2)
                    return {
                        "symbol": symbol,
                        "bid": bid,
                        "ask": ask,
                        "spread_points": spread_pts,
                        "digits": digits,
                        "point": point,
                        "change_pct": change_pct,
                        "server_time_ms": int(getattr(tick, "time_msc", int(tick.time) * 1000)),
                    }

        live = self._generate_mock_live_tick(symbol, "15m", 900)
        base = MOCK_SYMBOL_MAP.get(symbol.upper(), {}).get("base_price", live["bid"])
        chg = round(((live["bid"] - base) / base) * 100.0, 2) if base else 0.0
        return {
            "symbol": symbol,
            "bid": live["bid"],
            "ask": live["ask"],
            "spread_points": live["spread_points"],
            "digits": digits,
            "point": point,
            "change_pct": chg,
            "server_time_ms": live["server_time_ms"],
        }

    # --- Deterministic + Realistic Mock Generator (only used when MT5 is unavailable) ---

    def _generate_mock_candles(
        self, symbol: str, tf_sec: int, end_sec: int, count: int
    ) -> List[Dict[str, Any]]:
        meta = MOCK_SYMBOL_MAP.get(
            symbol.upper(),
            {"base_price": 100.0, "vol": 0.5, "digits": 2, "point": 0.01, "spread": 15},
        )
        digits = meta["digits"]
        base_price = meta["base_price"]
        # Scale volatility by sqrt(tf_sec / 900)
        step_vol = meta["vol"] * math.sqrt(max(1.0, tf_sec / 900.0))
        spread = meta["spread"]

        start_sec = end_sec - (count - 1) * tf_sec
        candles: List[Dict[str, Any]] = []

        # Deterministic seed based on symbol + start bucket so adjacent chunks connect smoothly
        rng = np.random.default_rng(abs(hash((symbol.upper(), tf_sec, start_sec // (tf_sec * 500)))) % (2**32))
        returns = rng.normal(0.0, step_vol, size=count)
        # Add mild mean-reverting sinusoidal trend for realistic market structure
        t_arr = np.arange(count, dtype=np.float64)
        wave = np.sin(t_arr / 45.0) * (step_vol * 4.5) + np.cos(t_arr / 130.0) * (step_vol * 8.0)

        price = base_price
        for i in range(count):
            ts_sec = start_sec + i * tf_sec
            open_p = price
            delta = float(returns[i]) + (float(wave[i] - wave[i - 1]) if i > 0 else 0.0) * 0.15
            close_p = max(meta["point"] * 10, open_p + delta)
            wick_up = abs(float(rng.normal(0.0, step_vol * 0.45)))
            wick_dn = abs(float(rng.normal(0.0, step_vol * 0.45)))
            high_p = max(open_p, close_p) + wick_up
            low_p = max(meta["point"] * 5, min(open_p, close_p) - wick_dn)
            vol = float(int(rng.integers(120, 2400)))

            candles.append(
                {
                    "timestamp": int(ts_sec) * 1000,
                    "open": round(open_p, digits),
                    "high": round(high_p, digits),
                    "low": round(low_p, digits),
                    "close": round(close_p, digits),
                    "volume": vol,
                    "spread": spread,
                }
            )
            price = close_p

        # Seed mock live state from last candle
        key = f"{symbol.upper()}_{tf_sec}"
        if candles:
            self._mock_live_state[key] = dict(candles[-1])
        return candles

    def _generate_mock_live_tick(self, symbol: str, tf: str, tf_sec: int) -> Dict[str, Any]:
        meta = MOCK_SYMBOL_MAP.get(
            symbol.upper(),
            {"base_price": 100.0, "vol": 0.5, "digits": 2, "point": 0.01, "spread": 15},
        )
        digits = meta["digits"]
        point = meta["point"]
        spread_pts = meta["spread"]

        now_ms = int(time.time() * 1000)
        bar_ts_ms = (int(time.time()) // tf_sec) * tf_sec * 1000
        key = f"{symbol.upper()}_{tf_sec}"

        state = self._mock_live_state.get(key)
        if state is None:
            p = meta["base_price"]
            state = {
                "timestamp": bar_ts_ms,
                "open": p,
                "high": p,
                "low": p,
                "close": p,
                "volume": 100.0,
                "spread": spread_pts,
            }
            self._mock_live_state[key] = state

        # Roll over to new candle if bar_ts_ms advanced
        if bar_ts_ms > state["timestamp"]:
            last_close = state["close"]
            state = {
                "timestamp": bar_ts_ms,
                "open": last_close,
                "high": last_close,
                "low": last_close,
                "close": last_close,
                "volume": 1.0,
                "spread": spread_pts,
            }
            self._mock_live_state[key] = state

        tick_step = random.gauss(0.0, meta["vol"] * 0.06)
        new_close = round(max(point * 10, state["close"] + tick_step), digits)
        state["close"] = new_close
        state["high"] = round(max(state["high"], new_close), digits)
        state["low"] = round(min(state["low"], new_close), digits)
        state["volume"] = float(state["volume"] + random.randint(1, 5))

        bid = new_close
        ask = round(bid + spread_pts * point, digits)
        return {
            "type": "realtime_update",
            "symbol": symbol,
            "tf": tf,
            "bid": bid,
            "ask": ask,
            "spread_points": spread_pts,
            "server_time_ms": now_ms,
            "candle": dict(state),
        }

    # --- Live Broker Trading Execution Engine ---

    def _get_filling_mode(self, symbol_info: Any) -> int:
        filling = int(getattr(symbol_info, "filling_mode", 0))
        if filling & 1:
            return mt5.ORDER_FILLING_FOK
        if filling & 2:
            return mt5.ORDER_FILLING_IOC
        return mt5.ORDER_FILLING_RETURN

    def _normalize_volume(self, raw_vol: float, vol_min: float, vol_max: float, vol_step: float) -> float:
        step = vol_step if vol_step > 0 else 0.01
        clamped = max(vol_min, min(vol_max, raw_vol))
        steps = round(clamped / step)
        normalized = steps * step
        # Determine decimal precision from vol_step
        step_str = f"{step:.8f}".rstrip("0")
        decimals = len(step_str.split(".")[1]) if "." in step_str else 0
        return round(max(vol_min, min(vol_max, normalized)), decimals)

    def _calculate_risk_volume(
        self,
        info: Any,
        equity: float,
        entry_price: float,
        sl: float,
        risk_pct: float,
    ) -> float:
        sl_distance = abs(entry_price - sl)
        if sl_distance <= 0 or equity <= 0 or risk_pct <= 0:
            return float(getattr(info, "volume_min", 0.01))
        risk_money = equity * (risk_pct / 100.0)
        tick_val = float(getattr(info, "trade_tick_value", 0.0))
        tick_size = float(getattr(info, "trade_tick_size", 0.0))
        contract_size = float(getattr(info, "trade_contract_size", 100000.0))
        if tick_val > 0 and tick_size > 0:
            loss_per_lot = (sl_distance / tick_size) * tick_val
        else:
            loss_per_lot = sl_distance * contract_size
        if loss_per_lot <= 0:
            return float(getattr(info, "volume_min", 0.01))
        raw_vol = risk_money / loss_per_lot
        return self._normalize_volume(
            raw_vol,
            float(getattr(info, "volume_min", 0.01)),
            float(getattr(info, "volume_max", 100.0)),
            float(getattr(info, "volume_step", 0.01)),
        )

    def _order_type_to_str(self, order_type: int) -> str:
        if not MT5_IMPORTED or mt5 is None:
            return "UNKNOWN"
        mapping = {
            mt5.ORDER_TYPE_BUY_LIMIT: "BUY_LIMIT",
            mt5.ORDER_TYPE_SELL_LIMIT: "SELL_LIMIT",
            mt5.ORDER_TYPE_BUY_STOP: "BUY_STOP",
            mt5.ORDER_TYPE_SELL_STOP: "SELL_STOP",
            mt5.ORDER_TYPE_BUY_STOP_LIMIT: "BUY_STOP_LIMIT",
            mt5.ORDER_TYPE_SELL_STOP_LIMIT: "SELL_STOP_LIMIT",
        }
        return mapping.get(order_type, f"TYPE_{order_type}")

    def get_account_and_positions(self) -> Dict[str, Any]:
        with self._lock:
            if self.connected and MT5_IMPORTED and mt5 is not None:
                acc = mt5.account_info()
                term = mt5.terminal_info()
                trade_allowed = bool(getattr(term, "trade_allowed", False)) if term else False
                account_data = {
                    "login": int(getattr(acc, "login", 0)) if acc else 0,
                    "server": getattr(acc, "server", "") if acc else "",
                    "currency": getattr(acc, "currency", "USD") if acc else "USD",
                    "balance": round(float(getattr(acc, "balance", 0.0)), 2) if acc else 0.0,
                    "equity": round(float(getattr(acc, "equity", 0.0)), 2) if acc else 0.0,
                    "margin": round(float(getattr(acc, "margin", 0.0)), 2) if acc else 0.0,
                    "free_margin": round(float(getattr(acc, "margin_free", 0.0)), 2) if acc else 0.0,
                    "profit": round(float(getattr(acc, "profit", 0.0)), 2) if acc else 0.0,
                    "leverage": int(getattr(acc, "leverage", 100)) if acc else 100,
                    "trade_allowed": trade_allowed,
                }

                raw_pos = mt5.positions_get() or []
                positions: List[Dict[str, Any]] = []
                for p in raw_pos:
                    side = "BUY" if p.type == mt5.POSITION_TYPE_BUY else "SELL"
                    positions.append(
                        {
                            "ticket": int(p.ticket),
                            "symbol": p.symbol,
                            "side": side,
                            "volume": float(p.volume),
                            "open_price": float(p.price_open),
                            "current_price": float(p.price_current),
                            "sl": float(p.sl),
                            "tp": float(p.tp),
                            "profit": round(float(p.profit), 2),
                            "swap": round(float(p.swap), 2),
                            "open_time_ms": int(p.time_msc) if getattr(p, "time_msc", 0) else int(p.time) * 1000,
                            "comment": p.comment or "",
                        }
                    )

                raw_orders = mt5.orders_get() or []
                orders: List[Dict[str, Any]] = []
                for o in raw_orders:
                    orders.append(
                        {
                            "ticket": int(o.ticket),
                            "symbol": o.symbol,
                            "order_type": self._order_type_to_str(o.type),
                            "volume": float(o.volume_current),
                            "price_open": float(o.price_open),
                            "current_price": float(o.price_current),
                            "sl": float(o.sl),
                            "tp": float(o.tp),
                            "setup_time_ms": int(o.time_setup_msc) if getattr(o, "time_setup_msc", 0) else int(o.time_setup) * 1000,
                            "comment": o.comment or "",
                        }
                    )

                return {"account": account_data, "positions": positions, "orders": orders}

        # Mock mode fallback
        total_pnl = 0.0
        mock_pos_out: List[Dict[str, Any]] = []
        for mp in self._mock_positions:
            snap = self._generate_mock_live_tick(mp["symbol"], "15m", 900)
            cur = snap["bid"] if mp["side"] == "BUY" else snap["ask"]
            diff = (cur - mp["open_price"]) if mp["side"] == "BUY" else (mp["open_price"] - cur)
            pnl = round(diff * mp["volume"] * 100.0, 2)
            total_pnl += pnl
            mp["current_price"] = cur
            mp["profit"] = pnl
            mock_pos_out.append(dict(mp))

        return {
            "account": {
                "login": 999999,
                "server": "Local-Mock-Engine",
                "currency": "USD",
                "balance": round(self._mock_balance, 2),
                "equity": round(self._mock_balance + total_pnl, 2),
                "margin": round(len(mock_pos_out) * 50.0, 2),
                "free_margin": round(self._mock_balance + total_pnl - len(mock_pos_out) * 50.0, 2),
                "profit": round(total_pnl, 2),
                "leverage": 500,
                "trade_allowed": True,
            },
            "positions": mock_pos_out,
            "orders": [dict(mo) for mo in self._mock_orders],
        }

    def place_order(self, req: PlaceOrderRequest) -> Dict[str, Any]:
        side = req.side.upper()
        if side not in ("BUY", "SELL"):
            return {"success": False, "retcode": -1, "order_ticket": 0, "message": f"Invalid side: {req.side}"}

        # Ensure Algo Trading is ON automatically before placing live order
        if self.connected and MT5_IMPORTED and mt5 is not None:
            with self._lock:
                term = mt5.terminal_info()
                allowed = bool(getattr(term, "trade_allowed", False)) if term else False
            if not allowed:
                self.enable_algo_trading()

        with self._lock:
            if self.connected and MT5_IMPORTED and mt5 is not None:
                mt5.symbol_select(req.symbol, True)
                info = mt5.symbol_info(req.symbol)
                tick = mt5.symbol_info_tick(req.symbol)
                acc = mt5.account_info()
                if info is None or tick is None:
                    return {
                        "success": False,
                        "retcode": -1,
                        "order_ticket": 0,
                        "message": f"Symbol {req.symbol} not available in MT5.",
                    }

                digits = int(info.digits)
                point = float(getattr(info, "point", 0.01) or 0.01)
                stops_level_pts = int(getattr(info, "trade_stops_level", 0) or 0)
                min_stop_dist = stops_level_pts * point
                is_pending = req.order_mode.upper() == "PENDING" and req.entry_price is not None

                if not is_pending:
                    action = mt5.TRADE_ACTION_DEAL
                    order_type = mt5.ORDER_TYPE_BUY if side == "BUY" else mt5.ORDER_TYPE_SELL
                    price = float(tick.ask if side == "BUY" else tick.bid)
                else:
                    action = mt5.TRADE_ACTION_PENDING
                    entry_p = round(float(req.entry_price), digits)
                    ref_p = float(tick.ask if side == "BUY" else tick.bid)
                    if min_stop_dist > 0 and abs(entry_p - ref_p) < min_stop_dist:
                        return {
                            "success": False,
                            "retcode": 10016,
                            "order_ticket": 0,
                            "message": (
                                f"Pending entry {entry_p:.{digits}f} too close to current price {ref_p:.{digits}f} "
                                f"(broker min stop distance: {min_stop_dist:.{digits}f})."
                            ),
                        }
                    if side == "BUY":
                        order_type = mt5.ORDER_TYPE_BUY_LIMIT if entry_p < tick.ask else mt5.ORDER_TYPE_BUY_STOP
                    else:
                        order_type = mt5.ORDER_TYPE_SELL_LIMIT if entry_p > tick.bid else mt5.ORDER_TYPE_SELL_STOP
                    price = entry_p

                sl_val = round(float(req.sl), digits) if req.sl else 0.0
                tp_val = round(float(req.tp), digits) if req.tp else 0.0

                # Validate SL/TP orientation against execution price before sending to MT5
                if side == "BUY":
                    if sl_val > 0 and sl_val >= price:
                        return {
                            "success": False,
                            "retcode": 10016,
                            "order_ticket": 0,
                            "message": f"Invalid BUY Stop Loss ({sl_val:.{digits}f}) must be below Entry ({price:.{digits}f}).",
                        }
                    if tp_val > 0 and tp_val <= price:
                        return {
                            "success": False,
                            "retcode": 10016,
                            "order_ticket": 0,
                            "message": f"Invalid BUY Take Profit ({tp_val:.{digits}f}) must be above Entry ({price:.{digits}f}).",
                        }
                else:
                    if sl_val > 0 and sl_val <= price:
                        return {
                            "success": False,
                            "retcode": 10016,
                            "order_ticket": 0,
                            "message": f"Invalid SELL Stop Loss ({sl_val:.{digits}f}) must be above Entry ({price:.{digits}f}).",
                        }
                    if tp_val > 0 and tp_val >= price:
                        return {
                            "success": False,
                            "retcode": 10016,
                            "order_ticket": 0,
                            "message": f"Invalid SELL Take Profit ({tp_val:.{digits}f}) must be below Entry ({price:.{digits}f}).",
                        }

                # Volume calculation (Fixed Lot or % Risk)
                if req.volume is not None and req.volume > 0:
                    volume = self._normalize_volume(
                        float(req.volume),
                        float(info.volume_min),
                        float(info.volume_max),
                        float(info.volume_step),
                    )
                elif req.risk_pct is not None and req.risk_pct > 0 and sl_val > 0:
                    equity = float(acc.equity) if acc else 10000.0
                    volume = self._calculate_risk_volume(info, equity, price, sl_val, float(req.risk_pct))
                else:
                    volume = float(info.volume_min)

                filling_mode = self._get_filling_mode(info)
                request = {
                    "action": action,
                    "symbol": req.symbol,
                    "volume": float(volume),
                    "type": order_type,
                    "price": round(float(price), digits),
                    "sl": sl_val,
                    "tp": tp_val,
                    "deviation": 20,
                    "magic": 202611,
                    "comment": (req.comment or "TV-Web")[:31],
                    "type_time": mt5.ORDER_TIME_GTC,
                    "type_filling": filling_mode,
                }

                result = mt5.order_send(request)
                if result is None:
                    err = mt5.last_error()
                    return {
                        "success": False,
                        "retcode": -1,
                        "order_ticket": 0,
                        "message": f"mt5.order_send() returned None: {err}",
                    }

                if result.retcode in (mt5.TRADE_RETCODE_DONE, mt5.TRADE_RETCODE_PLACED):
                    return {
                        "success": True,
                        "retcode": int(result.retcode),
                        "order_ticket": int(result.order),
                        "message": f"Order #{result.order} executed ({side} {volume} {req.symbol} @ {result.price or price})",
                        "executed_price": float(result.price or price),
                        "executed_volume": float(result.volume or volume),
                    }

                if result.retcode == 10027:
                    msg = "Algo Trading belum diaktifkan di MT5! Klik tombol 'Algo Trading' (Ctrl+E) di MT5 agar berwarna hijau."
                else:
                    msg = f"Order rejected (retcode={result.retcode}): {result.comment}"

                return {
                    "success": False,
                    "retcode": int(result.retcode),
                    "order_ticket": int(getattr(result, "order", 0)),
                    "message": msg,
                }

        # Mock order execution fallback
        snap = self._generate_mock_live_tick(req.symbol, "15m", 900)
        vol = round(float(req.volume if req.volume and req.volume > 0 else 0.01), 2)
        ticket = self._mock_ticket_seq
        self._mock_ticket_seq += 1
        now_ms = int(time.time() * 1000)

        if req.order_mode.upper() == "PENDING" and req.entry_price is not None:
            ref_p = snap["ask"] if side == "BUY" else snap["bid"]
            if side == "BUY":
                otype = "BUY_LIMIT" if req.entry_price < ref_p else "BUY_STOP"
            else:
                otype = "SELL_LIMIT" if req.entry_price > ref_p else "SELL_STOP"
            self._mock_orders.append(
                {
                    "ticket": ticket,
                    "symbol": req.symbol,
                    "order_type": otype,
                    "volume": vol,
                    "price_open": float(req.entry_price),
                    "current_price": ref_p,
                    "sl": float(req.sl or 0.0),
                    "tp": float(req.tp or 0.0),
                    "setup_time_ms": now_ms,
                    "comment": req.comment or "TV-Web",
                }
            )
            return {
                "success": True,
                "retcode": 10008,
                "order_ticket": ticket,
                "message": f"[MOCK] Pending #{ticket} placed ({otype} {vol} {req.symbol} @ {req.entry_price})",
                "executed_price": float(req.entry_price),
                "executed_volume": vol,
            }

        exec_price = snap["ask"] if side == "BUY" else snap["bid"]
        self._mock_positions.append(
            {
                "ticket": ticket,
                "symbol": req.symbol,
                "side": side,
                "volume": vol,
                "open_price": exec_price,
                "current_price": exec_price,
                "sl": float(req.sl or 0.0),
                "tp": float(req.tp or 0.0),
                "profit": 0.0,
                "swap": 0.0,
                "open_time_ms": now_ms,
                "comment": req.comment or "TV-Web",
            }
        )
        return {
            "success": True,
            "retcode": 10009,
            "order_ticket": ticket,
            "message": f"[MOCK] Market #{ticket} filled ({side} {vol} {req.symbol} @ {exec_price})",
            "executed_price": exec_price,
            "executed_volume": vol,
        }

    def _modify_one(self, req: ModifyPositionRequest) -> Dict[str, Any]:
        if self.connected and MT5_IMPORTED and mt5 is not None:
                info = mt5.symbol_info(req.symbol)
                digits = int(info.digits) if info else 5
                sl = round(float(req.sl), digits) if req.sl else 0.0
                tp = round(float(req.tp), digits) if req.tp else 0.0

                if not req.is_pending:
                    request = {
                        "action": mt5.TRADE_ACTION_SLTP,
                        "position": int(req.ticket),
                        "symbol": req.symbol,
                        "sl": sl,
                        "tp": tp,
                    }
                else:
                    orders = mt5.orders_get(ticket=int(req.ticket))
                    if not orders:
                        return {"success": False, "retcode": -1, "order_ticket": req.ticket, "message": f"Pending order #{req.ticket} not found."}
                    o = orders[0]
                    tick = mt5.symbol_info_tick(req.symbol)
                    new_price = round(float(req.price), digits) if (req.price is not None and req.price > 0) else float(o.price_open)
                    if tick is not None:
                        otype = o.type
                        if otype == mt5.ORDER_TYPE_BUY_LIMIT and new_price >= tick.ask:
                            return {
                                "success": False,
                                "retcode": 10015,
                                "order_ticket": req.ticket,
                                "message": f"Invalid BUY LIMIT price ({new_price:.{digits}f}): Harga Buy Limit tidak boleh >= harga Ask saat ini ({tick.ask:.{digits}f}).",
                            }
                        if otype == mt5.ORDER_TYPE_BUY_STOP and new_price <= tick.ask:
                            return {
                                "success": False,
                                "retcode": 10015,
                                "order_ticket": req.ticket,
                                "message": f"Invalid BUY STOP price ({new_price:.{digits}f}): Harga Buy Stop tidak boleh <= harga Ask saat ini ({tick.ask:.{digits}f}).",
                            }
                        if otype == mt5.ORDER_TYPE_SELL_LIMIT and new_price <= tick.bid:
                            return {
                                "success": False,
                                "retcode": 10015,
                                "order_ticket": req.ticket,
                                "message": f"Invalid SELL LIMIT price ({new_price:.{digits}f}): Harga Sell Limit tidak boleh <= harga Bid saat ini ({tick.bid:.{digits}f}).",
                            }
                        if otype == mt5.ORDER_TYPE_SELL_STOP and new_price >= tick.bid:
                            return {
                                "success": False,
                                "retcode": 10015,
                                "order_ticket": req.ticket,
                                "message": f"Invalid SELL STOP price ({new_price:.{digits}f}): Harga Sell Stop tidak boleh >= harga Bid saat ini ({tick.bid:.{digits}f}).",
                            }

                    request = {
                        "action": mt5.TRADE_ACTION_MODIFY,
                        "order": int(req.ticket),
                        "symbol": req.symbol,
                        "price": new_price,
                        "sl": sl,
                        "tp": tp,
                        "type_time": o.type_time,
                        "expiration": o.time_expiration,
                    }

                result = mt5.order_send(request)
                if result is None:
                    return {"success": False, "retcode": -1, "order_ticket": req.ticket, "message": f"Modify failed: {mt5.last_error()}"}
                if result.retcode == mt5.TRADE_RETCODE_DONE:
                    return {
                        "success": True,
                        "retcode": int(result.retcode),
                        "order_ticket": int(req.ticket),
                        "message": f"Modified #{req.ticket} (SL={sl}, TP={tp})",
                    }
                if result.retcode == 10027:
                    return {
                        "success": False,
                        "retcode": 10027,
                        "order_ticket": req.ticket,
                        "message": "Algo Trading belum diaktifkan di MT5! Tekan Ctrl+E di MT5.",
                    }
                return {
                    "success": False,
                    "retcode": int(result.retcode),
                    "order_ticket": req.ticket,
                    "message": f"Modify rejected (retcode={result.retcode}): {result.comment}",
                }

        # Mock modify
        target_list = self._mock_orders if req.is_pending else self._mock_positions
        for item in target_list:
            if item["ticket"] == req.ticket:
                if req.is_pending and req.price is not None and req.price > 0:
                    item["price_open"] = float(req.price)
                item["sl"] = float(req.sl)
                item["tp"] = float(req.tp)
                return {"success": True, "retcode": 10009, "order_ticket": req.ticket, "message": f"[MOCK] Modified #{req.ticket}"}
        return {"success": False, "retcode": -1, "order_ticket": req.ticket, "message": f"Ticket #{req.ticket} not found"}

    def modify_position_sltp(self, req: ModifyPositionRequest) -> Dict[str, Any]:
        with self._lock:
            return self._modify_one(req)

    def _validate_sltp(self, side: str, current_price: float, sl: Optional[float], tp: Optional[float]) -> Optional[str]:
        if sl is not None and sl < 0:
            return f"Invalid SL ({sl}): must be positive"
        if tp is not None and tp < 0:
            return f"Invalid TP ({tp}): must be positive"
        if sl is not None and sl != 0:
            if side == "BUY" and sl >= current_price:
                return f"Invalid SL ({sl}) for BUY position: SL must be below current price ({current_price})"
            if side == "SELL" and sl <= current_price:
                return f"Invalid SL ({sl}) for SELL position: SL must be above current price ({current_price})"
        if tp is not None and tp != 0:
            if side == "BUY" and tp <= current_price:
                return f"Invalid TP ({tp}) for BUY position: TP must be above current price ({current_price})"
            if side == "SELL" and tp >= current_price:
                return f"Invalid TP ({tp}) for SELL position: TP must be below current price ({current_price})"
        return None

    def bulk_modify_sltp(self, tickets: List[int], sl: Optional[float], tp: Optional[float]) -> Tuple[bool, List[Dict[str, Any]], str]:
        with self._lock:
            results: List[Dict[str, Any]] = []
            for t in tickets:
                pos: Optional[Dict[str, Any]] = None
                if self.connected and MT5_IMPORTED and mt5 is not None:
                    live = mt5.positions_get(ticket=int(t))
                    if live:
                        p = live[0]
                        pos = {
                            "side": "BUY" if p.type == mt5.POSITION_TYPE_BUY else "SELL",
                            "open_price": float(p.price_open),
                            "current_price": float(p.price_current),
                            "symbol": p.symbol,
                            "sl": float(p.sl),
                            "tp": float(p.tp),
                        }
                else:
                    for mp in self._mock_positions:
                        if mp["ticket"] == t:
                            pos = {
                                "side": mp["side"],
                                "open_price": float(mp["open_price"]),
                                "current_price": float(mp.get("current_price", mp["open_price"])),
                                "symbol": mp["symbol"],
                                "sl": float(mp["sl"]),
                                "tp": float(mp["tp"]),
                            }
                            break
                if pos is None:
                    results.append({"success": False, "retcode": -1, "order_ticket": t, "message": f"Position #{t} not found"})
                    continue
                cur = float(pos["current_price"])
                if self.connected and MT5_IMPORTED and mt5 is not None:
                    tick = mt5.symbol_info_tick(pos["symbol"])
                    if tick is not None:
                        cur = float(tick.bid if pos["side"] == "BUY" else tick.ask)
                err = self._validate_sltp(pos["side"], cur, sl, tp)
                if err:
                    results.append({"success": False, "retcode": 10015, "order_ticket": t, "message": f"#{t}: {err}"})
                    continue
                eff_sl = sl if sl is not None else pos["sl"]
                eff_tp = tp if tp is not None else pos["tp"]
                req = ModifyPositionRequest(ticket=t, symbol=pos["symbol"], sl=eff_sl, tp=eff_tp, is_pending=False)
                results.append(self._modify_one(req))
        ok = sum(1 for r in results if r.get("success"))
        return all(r.get("success") for r in results), results, f"{ok} modified, {len(results) - ok} failed"

    def _close_one(self, ticket: int) -> Dict[str, Any]:
        if self.connected and MT5_IMPORTED and mt5 is not None:
                positions = mt5.positions_get(ticket=int(ticket))
                if not positions:
                    return {"success": False, "retcode": -1, "order_ticket": ticket, "message": f"Position #{ticket} not found."}
                pos = positions[0]
                info = mt5.symbol_info(pos.symbol)
                tick = mt5.symbol_info_tick(pos.symbol)
                if info is None or tick is None:
                    return {"success": False, "retcode": -1, "order_ticket": ticket, "message": f"No tick data for {pos.symbol}."}

                is_buy = pos.type == mt5.POSITION_TYPE_BUY
                close_type = mt5.ORDER_TYPE_SELL if is_buy else mt5.ORDER_TYPE_BUY
                close_price = float(tick.bid if is_buy else tick.ask)
                filling_mode = self._get_filling_mode(info)

                request = {
                    "action": mt5.TRADE_ACTION_DEAL,
                    "position": int(ticket),
                    "symbol": pos.symbol,
                    "volume": float(pos.volume),
                    "type": close_type,
                    "price": round(close_price, int(info.digits)),
                    "deviation": 20,
                    "magic": 202611,
                    "comment": "TV-Web Close",
                    "type_time": mt5.ORDER_TIME_GTC,
                    "type_filling": filling_mode,
                }
                result = mt5.order_send(request)
                if result is None:
                    return {"success": False, "retcode": -1, "order_ticket": ticket, "message": f"Close failed: {mt5.last_error()}"}
                if result.retcode == mt5.TRADE_RETCODE_DONE:
                    return {
                        "success": True,
                        "retcode": int(result.retcode),
                        "order_ticket": int(result.order),
                        "message": f"Closed position #{ticket} @ {result.price or close_price}",
                        "executed_price": float(result.price or close_price),
                        "executed_volume": float(pos.volume),
                    }
                if result.retcode == 10027:
                    return {
                        "success": False,
                        "retcode": 10027,
                        "order_ticket": ticket,
                        "message": "Algo Trading belum diaktifkan di MT5! Tekan Ctrl+E di MT5.",
                    }
                return {
                    "success": False,
                    "retcode": int(result.retcode),
                    "order_ticket": ticket,
                    "message": f"Close rejected (retcode={result.retcode}): {result.comment}",
                }

        # Mock close
        for idx, p in enumerate(self._mock_positions):
            if p["ticket"] == ticket:
                self._mock_balance += p.get("profit", 0.0)
                self._mock_positions.pop(idx)
                return {"success": True, "retcode": 10009, "order_ticket": ticket, "message": f"[MOCK] Closed #{ticket}"}
        return {"success": False, "retcode": -1, "order_ticket": ticket, "message": f"Position #{ticket} not found"}

    def close_position(self, ticket: int) -> Dict[str, Any]:
        with self._lock:
            return self._close_one(ticket)

    def bulk_close_positions(self, tickets: List[int]) -> Tuple[bool, List[Dict[str, Any]], str]:
        with self._lock:
            results = [self._close_one(t) for t in tickets]
        ok = sum(1 for r in results if r.get("success"))
        return all(r.get("success") for r in results), results, f"{ok} closed, {len(results) - ok} failed"

    def cancel_pending_order(self, ticket: int) -> Dict[str, Any]:
        with self._lock:
            if self.connected and MT5_IMPORTED and mt5 is not None:
                request = {
                    "action": mt5.TRADE_ACTION_REMOVE,
                    "order": int(ticket),
                }
                result = mt5.order_send(request)
                if result is None:
                    return {"success": False, "retcode": -1, "order_ticket": ticket, "message": f"Cancel failed: {mt5.last_error()}"}
                if result.retcode == mt5.TRADE_RETCODE_DONE:
                    return {
                        "success": True,
                        "retcode": int(result.retcode),
                        "order_ticket": int(ticket),
                        "message": f"Cancelled pending order #{ticket}",
                    }
                if result.retcode == 10027:
                    return {
                        "success": False,
                        "retcode": 10027,
                        "order_ticket": ticket,
                        "message": "Algo Trading belum diaktifkan di MT5! Tekan Ctrl+E di MT5.",
                    }
                return {
                    "success": False,
                    "retcode": int(result.retcode),
                    "order_ticket": ticket,
                    "message": f"Cancel rejected (retcode={result.retcode}): {result.comment}",
                }

        # Mock cancel
        for idx, o in enumerate(self._mock_orders):
            if o["ticket"] == ticket:
                self._mock_orders.pop(idx)
                return {"success": True, "retcode": 10009, "order_ticket": ticket, "message": f"[MOCK] Cancelled #{ticket}"}
        return {"success": False, "retcode": -1, "order_ticket": ticket, "message": f"Order #{ticket} not found"}


mt5_service = MT5Service()
