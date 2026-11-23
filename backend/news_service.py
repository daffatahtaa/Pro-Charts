import hashlib
import logging
import re
import threading
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

MAJOR_CURRENCIES = {"USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "CNY"}
ALL_MAJOR_LIST = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD"]

_SUFFIX_REGEX = re.compile(
    r"(\.(?:raw|pro|ecn|std|micro|cent|mini|a|b|c|i|m|r|s|z)|#|-cd|-c|_i|_sb|_ecn|\+)$",
    re.IGNORECASE,
)


def strip_broker_affixes(symbol: str) -> str:
    """Clean broker-specific prefixes/suffixes (e.g., XAUUSDm, EURUSD.raw, GBPUSDc, #US30)."""
    s = (symbol or "").strip()
    if not s:
        return ""
    s = s.lstrip("#@$")
    prev = None
    while prev != s:
        prev = s
        s = _SUFFIX_REGEX.sub("", s)
    # Handle single lowercase broker suffix attached directly to 6-letter FX/metal symbols (e.g. XAUUSDc, EURUSDm)
    if len(s) == 7 and s[:6].isupper() and s[6] in ("m", "c", "r", "i", "e", "p", "z"):
        s = s[:6]
    # Also handle uppercase trailing M/C on known 6-letter pairs like XAUUSDC / EURUSDM
    upper = s.upper()
    if len(upper) == 7 and upper[6] in ("M", "C") and (
        upper[:3] in MAJOR_CURRENCIES or upper[:3] in ("XAU", "XAG", "BTC", "ETH")
    ):
        if upper[3:6] in MAJOR_CURRENCIES or upper[3:6] in ("USD", "EUR", "GBP", "JPY"):
            upper = upper[:6]
    return re.sub(r"[^A-Z0-9]", "", upper)


def resolve_symbol_correlations(symbol: str) -> Dict[str, Any]:
    """
    Resolve any trading symbol (broker-suffix-safe) to its correlated currencies,
    macro driver tags, and human-readable correlation label.
    """
    clean = strip_broker_affixes(symbol)
    if not clean:
        return {
            "clean_symbol": "",
            "asset_class": "Macro",
            "currencies": ["USD"],
            "drivers": ["Macro"],
            "label": "USD Macro",
        }

    # Metals (Gold / Silver)
    if clean.startswith(("XAU", "XAG", "GOLD", "SILVER")):
        currencies: List[str] = []
        if len(clean) >= 6 and clean[3:6] in MAJOR_CURRENCIES and clean[3:6] != "USD":
            currencies.append(clean[3:6])
        if "USD" not in currencies:
            currencies.append("USD")
        metal = "Gold" if ("XAU" in clean or "GOLD" in clean) else "Silver"
        return {
            "clean_symbol": clean,
            "asset_class": "Metals",
            "currencies": currencies,
            "drivers": [metal, "Fed / Yields", "DXY"],
            "label": f"{'+'.join(currencies)} + {metal}",
        }

    # Oil / Energy
    if any(k in clean for k in ("USOIL", "UKOIL", "WTI", "BRENT", "XTI", "XBR", "NGAS")):
        return {
            "clean_symbol": clean,
            "asset_class": "Commodities",
            "currencies": ["USD"],
            "drivers": ["Energy", "OPEC", "Inventories"],
            "label": "USD + Energy",
        }

    # Global Equity Indices
    index_map = [
        (("US30", "DJ30", "DOW", "WS30", "NAS100", "USTEC", "NDX", "SPX500", "US500", "SP500", "US2000"), ["USD"], "US Indices"),
        (("GER40", "GER30", "DE40", "DE30", "DAX", "EU50", "STOXX", "FRA40"), ["EUR"], "Eurozone Indices"),
        (("UK100", "FTSE", "GBR100"), ["GBP"], "UK Indices"),
        (("JP225", "JPN225", "NIKKEI"), ["JPY"], "Japan Indices"),
        (("AUS200", "ASX200"), ["AUD"], "Australia Indices"),
        (("HK50", "HSI", "CN50", "CHINA50"), ["CNY", "USD"], "Asia Indices"),
    ]
    for keys, currs, drv in index_map:
        if any(clean.startswith(k) or k in clean for k in keys):
            return {
                "clean_symbol": clean,
                "asset_class": "Indices",
                "currencies": currs,
                "drivers": [drv, "Central Banks"],
                "label": f"{'+'.join(currs)} ({drv})",
            }

    # Crypto
    if clean.startswith(("BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "LTC", "AVAX")):
        return {
            "clean_symbol": clean,
            "asset_class": "Crypto",
            "currencies": ["USD"],
            "drivers": ["Crypto", "Fed / Liquidity"],
            "label": "USD + Crypto",
        }

    # Standard 6-letter Forex pair
    if len(clean) >= 6:
        base = clean[:3]
        quote = clean[3:6]
        if base in MAJOR_CURRENCIES and quote in MAJOR_CURRENCIES:
            currs = [base] if base == quote else [base, quote]
            return {
                "clean_symbol": clean,
                "asset_class": "Forex",
                "currencies": currs,
                "drivers": currs,
                "label": " + ".join(currs),
            }

    # Single-currency prefix fallback (e.g. DXY, EURX)
    if clean.startswith("DXY") or clean.startswith("USD"):
        return {
            "clean_symbol": clean,
            "asset_class": "Forex",
            "currencies": ["USD"],
            "drivers": ["USD"],
            "label": "USD",
        }

    return {
        "clean_symbol": clean,
        "asset_class": "Macro",
        "currencies": ["USD"],
        "drivers": ["Macro"],
        "label": "USD Macro",
    }


def _normalize_impact(raw: str) -> str:
    s = (raw or "").strip().lower()
    if s in ("high", "red", "3", "critical"):
        return "high"
    if s in ("medium", "med", "orange", "2"):
        return "medium"
    return "low"


def _parse_iso_to_ms(raw: str) -> Optional[int]:
    if not raw:
        return None
    s = raw.strip()
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    except Exception:
        pass
    try:
        dt = parsedate_to_datetime(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    except Exception:
        return None


def _make_event_id(country: str, title: str, event_time_ms: int, category: str) -> str:
    raw = f"{category}|{country.upper()}|{title.strip().lower()}|{event_time_ms}"
    return f"ev_{hashlib.sha1(raw.encode('utf-8')).hexdigest()[:16]}"


class NewsService:
    """
    Cached Economic Calendar & Correlated Market News Service backed by DuckDB.
    Uses a TTL cache so pair/timeframe switching is instantaneous and rate-limit-free.
    """

    CALENDAR_URLS = [
        "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
        "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
    ]
    RSS_NEWS_URL = "https://www.forexlive.com/feed/news"

    def __init__(self, cache_service: Any, ttl_seconds: int = 1200):
        self.cache = cache_service
        self.ttl_seconds = ttl_seconds
        self._lock = threading.Lock()
        self._last_calendar_fetch: float = 0.0
        self._last_headlines_fetch: float = 0.0

    def _fetch_calendar_upstream(self) -> List[Dict[str, Any]]:
        events: List[Dict[str, Any]] = []
        now_ms = int(time.time() * 1000)
        headers = {"User-Agent": "ProCharts/2.6 (+https://github.com/daffatahtaa/Pro-Charts)"}
        with httpx.Client(timeout=6.0, follow_redirects=True, headers=headers) as client:
            for url in self.CALENDAR_URLS:
                try:
                    resp = client.get(url)
                    if resp.status_code != 200:
                        continue
                    data = resp.json()
                    if not isinstance(data, list):
                        continue
                    for item in data:
                        if not isinstance(item, dict):
                            continue
                        title = str(item.get("title") or "").strip()
                        country = str(item.get("country") or "").strip().upper()
                        impact_raw = str(item.get("impact") or "").strip()
                        if not title or not country or impact_raw.lower() == "holiday":
                            continue
                        ts_ms = _parse_iso_to_ms(str(item.get("date") or ""))
                        if ts_ms is None:
                            continue
                        impact = _normalize_impact(impact_raw)
                        events.append(
                            {
                                "id": _make_event_id(country, title, ts_ms, "calendar"),
                                "title": title,
                                "country": country,
                                "impact": impact,
                                "category": "calendar",
                                "event_time_ms": ts_ms,
                                "actual": str(item.get("actual") or "").strip(),
                                "forecast": str(item.get("forecast") or "").strip(),
                                "previous": str(item.get("previous") or "").strip(),
                                "source": "ForexFactory",
                                "url": str(item.get("url") or ""),
                                "fetched_at": now_ms,
                            }
                        )
                except Exception as exc:
                    logger.debug("Calendar feed fetch skipped (%s): %s", url, exc)
        return events

    def _infer_headline_country(self, text: str) -> str:
        t = (text or "").upper()
        patterns = [
            ("USD", ("USD", "FED", "FOMC", "POWELL", "CPI", "NFP", "US ", "U.S.", "TREASURY", "GOLD", "XAU", "BTC", "BITCOIN", "SPX", "NASDAQ")),
            ("EUR", ("EUR", "ECB", "LAGARDE", "EUROZONE", "GERMAN", "DAX")),
            ("GBP", ("GBP", "BOE", "BAILEY", "UK ", "U.K.", "STERLING", "POUND", "FTSE")),
            ("JPY", ("JPY", "BOJ", "UEDA", "YEN", "JAPAN", "NIKKEI")),
            ("AUD", ("AUD", "RBA", "AUSTRALIA", "AUSSIE")),
            ("CAD", ("CAD", "BOC", "CANADA", "LOONIE")),
            ("CHF", ("CHF", "SNB", "SWISS", "FRANC")),
            ("NZD", ("NZD", "RBNZ", "NEW ZEALAND", "KIWI")),
        ]
        for code, kws in patterns:
            if any(kw in t for kw in kws):
                return code
        return "USD"

    def _fetch_headlines_upstream(self) -> List[Dict[str, Any]]:
        events: List[Dict[str, Any]] = []
        now_ms = int(time.time() * 1000)
        headers = {"User-Agent": "ProCharts/2.6 (+https://github.com/daffatahtaa/Pro-Charts)"}
        try:
            with httpx.Client(timeout=5.0, follow_redirects=True, headers=headers) as client:
                resp = client.get(self.RSS_NEWS_URL)
                if resp.status_code != 200:
                    return []
                root = ET.fromstring(resp.text)
                for item in root.findall(".//item")[:30]:
                    title = (item.findtext("title") or "").strip()
                    link = (item.findtext("link") or "").strip()
                    pub = (item.findtext("pubDate") or "").strip()
                    ts_ms = _parse_iso_to_ms(pub) or now_ms
                    if not title:
                        continue
                    country = self._infer_headline_country(title)
                    high_kw = any(
                        w in title.upper()
                        for w in ("FED", "CPI", "NFP", "RATE", "ECB", "BOJ", "BOE", "INFLATION", "FOMC", "TARIFF", "GDP")
                    )
                    events.append(
                        {
                            "id": _make_event_id(country, title, ts_ms, "news"),
                            "title": title,
                            "country": country,
                            "impact": "high" if high_kw else "medium",
                            "category": "news",
                            "event_time_ms": ts_ms,
                            "actual": "",
                            "forecast": "",
                            "previous": "",
                            "source": "ForexLive",
                            "url": link,
                            "fetched_at": now_ms,
                        }
                    )
        except Exception as exc:
            logger.debug("RSS headlines fetch skipped: %s", exc)
        return events

    def refresh_if_needed(self, include_calendar: bool = True, include_headlines: bool = False) -> None:
        now = time.time()
        with self._lock:
            if include_calendar and (now - self._last_calendar_fetch >= self.ttl_seconds):
                self._last_calendar_fetch = now
                fetched = self._fetch_calendar_upstream()
                if fetched:
                    self.cache.upsert_economic_events(fetched)
            if include_headlines and (now - self._last_headlines_fetch >= self.ttl_seconds):
                self._last_headlines_fetch = now
                fetched_news = self._fetch_headlines_upstream()
                if fetched_news:
                    self.cache.upsert_economic_events(fetched_news)

    def get_news_for_chart(
        self,
        symbol: str,
        scope: str = "correlated",
        currencies_csv: str = "",
        impact_csv: str = "high,medium",
        event_types_csv: str = "calendar",
        from_ts: Optional[int] = None,
        to_ts: Optional[int] = None,
        force_refresh: bool = False,
    ) -> Dict[str, Any]:
        corr = resolve_symbol_correlations(symbol)
        categories = [c.strip().lower() for c in event_types_csv.split(",") if c.strip()] or ["calendar"]
        impacts = [i.strip().lower() for i in impact_csv.split(",") if i.strip()] or ["high", "medium"]

        if force_refresh:
            with self._lock:
                self._last_calendar_fetch = 0.0
                self._last_headlines_fetch = 0.0

        self.refresh_if_needed(
            include_calendar="calendar" in categories,
            include_headlines="news" in categories,
        )

        scope_clean = (scope or "correlated").strip().lower()
        if scope_clean == "all":
            target_currencies = ALL_MAJOR_LIST
            label = "All Major Currencies"
        elif scope_clean == "custom":
            parsed = [c.strip().upper() for c in currencies_csv.split(",") if c.strip()]
            target_currencies = parsed or corr["currencies"]
            label = " + ".join(target_currencies)
        else:
            target_currencies = corr["currencies"]
            label = corr["label"]

        events = self.cache.get_economic_events(
            countries=target_currencies,
            impacts=impacts,
            categories=categories,
            from_ts=from_ts,
            to_ts=to_ts,
        )
        return {
            "symbol": symbol,
            "clean_symbol": corr["clean_symbol"],
            "asset_class": corr["asset_class"],
            "resolved_currencies": target_currencies,
            "correlation_label": label,
            "events": events,
            "cached_at_ms": int(time.time() * 1000),
        }
