import glob
import os
import re
from typing import Any, Dict, List, Set

IGNORED_BASE_DIRS = {"chats", "custom", "default", "signals", "metaquotes-demo"}

CURATED_BROKERS: List[Dict[str, Any]] = [
    {
        "id": "icmarkets",
        "broker_name": "IC Markets (Raw Trading / International)",
        "short_code": "IC",
        "category": "ECN Broker",
        "website": "icmarkets.com",
        "servers": [
            "ICMarketsSC-MT5",
            "ICMarketsSC-MT5-2",
            "ICMarketsSC-MT5-3",
            "ICMarketsSC-MT5-4",
            "ICMarketsSC-Demo",
            "ICMarketsEU-MT5",
            "ICMarketsEU-Demo",
            "ICMarketsInternational-MT5",
            "ICMarketsInternational-MT5-2",
            "ICMarketsInternational-Demo",
            "RawTrading-MT5",
            "RawTrading-MT5-2",
        ],
    },
    {
        "id": "exness",
        "broker_name": "Exness Technologies Ltd",
        "short_code": "EX",
        "category": "ECN Broker",
        "website": "exness.com",
        "servers": [
            "Exness-MT5Real",
            *[f"Exness-MT5Real{i}" for i in range(2, 16)],
            "Exness-MT5Trial",
            *[f"Exness-MT5Trial{i}" for i in range(2, 11)],
        ],
    },
    {
        "id": "pepperstone",
        "broker_name": "Pepperstone Group",
        "short_code": "PP",
        "category": "ECN Broker",
        "website": "pepperstone.com",
        "servers": [
            "Pepperstone-MT5-Live01",
            "Pepperstone-MT5-Live02",
            "Pepperstone-Demo01",
            "PepperstoneUK-Live",
            "PepperstoneUK-Demo",
            "PepperstoneMarkets-Live",
            "PepperstoneMarkets-Demo",
        ],
    },
    {
        "id": "xmglobal",
        "broker_name": "XM Global",
        "short_code": "XM",
        "category": "Market Maker",
        "website": "xm.com",
        "servers": [
            "XMGlobal-MT5",
            "XMGlobal-MT5 2",
            "XMGlobal-MT5 3",
            "XMGlobal-MT5 4",
            "XMGlobal-MT5 5",
            "XMGlobal-MT5 6",
            "XMGlobal-MT5 7",
            "XMGlobal-MT5 Demo",
        ],
    },
    {
        "id": "octafx",
        "broker_name": "Octa / OctaFX",
        "short_code": "OC",
        "category": "ECN Broker",
        "website": "octafx.com",
        "servers": ["OctaFX-Real", "OctaFX-Real2", "OctaFX-Real3", "OctaFX-Demo"],
    },
    {
        "id": "fbs",
        "broker_name": "FBS Markets",
        "short_code": "FB",
        "category": "Market Maker",
        "website": "fbs.com",
        "servers": ["FBS-Real", "FBS-Real-2", "FBS-Demo"],
    },
    {
        "id": "hfm",
        "broker_name": "HFM (HotForex)",
        "short_code": "HF",
        "category": "ECN Broker",
        "website": "hfm.com",
        "servers": [
            "HFMarketsGlobal-Live2",
            "HFMarketsGlobal-Live3",
            "HFMarketsGlobal-Demo",
            "HFMarketsSV-Live",
            "HFMarketsSV-Demo",
        ],
    },
    {
        "id": "tickmill",
        "broker_name": "Tickmill",
        "short_code": "TM",
        "category": "ECN Broker",
        "website": "tickmill.com",
        "servers": [
            "Tickmill-Live",
            "Tickmill-Live02",
            "Tickmill-Demo",
            "TickmillUK-Live",
            "TickmillUK-Demo",
        ],
    },
    {
        "id": "vantage",
        "broker_name": "Vantage Markets",
        "short_code": "VT",
        "category": "ECN Broker",
        "website": "vantagemarkets.com",
        "servers": [
            "VantageInternational-Live",
            "VantageInternational-Live 2",
            "VantageInternational-Live 3",
            "VantageInternational-Demo",
            "VantageGlobalPrime-Live",
            "VantageGlobalPrime-Demo",
        ],
    },
    {
        "id": "fpmarkets",
        "broker_name": "FP Markets",
        "short_code": "FP",
        "category": "ECN Broker",
        "website": "fpmarkets.com",
        "servers": [
            "FPMarketsLLC-Live",
            "FPMarketsLLC-Demo",
            "FPMarkets-Live",
            "FPMarkets-Demo",
        ],
    },
    {
        "id": "eightcap",
        "broker_name": "Eightcap",
        "short_code": "EC",
        "category": "ECN Broker",
        "website": "eightcap.com",
        "servers": [
            "Eightcap-Real",
            "Eightcap-Demo",
            "EightcapGlobal-Real",
            "EightcapGlobal-Demo",
        ],
    },
    {
        "id": "oanda",
        "broker_name": "OANDA",
        "short_code": "OA",
        "category": "ECN Broker",
        "website": "oanda.com",
        "servers": ["OANDA-v20 Live-1", "OANDA-v20 Practice-1", "OANDATMS-MT5"],
    },
    {
        "id": "forexcom",
        "broker_name": "FOREX.com / StoneX",
        "short_code": "FX",
        "category": "Market Maker",
        "website": "forex.com",
        "servers": [
            "FOREX.comGlobal-Live 5",
            "FOREX.comGlobal-Demo 5",
            "FOREX.com-Live",
            "FOREX.com-Demo",
        ],
    },
    {
        "id": "fxtm",
        "broker_name": "FXTM (ForexTime)",
        "short_code": "FT",
        "category": "ECN Broker",
        "website": "forextime.com",
        "servers": ["ForexTimeFXTM-MT5", "ForexTimeFXTM-MT5-Demo"],
    },
    {
        "id": "roboforex",
        "broker_name": "RoboForex",
        "short_code": "RF",
        "category": "ECN Broker",
        "website": "roboforex.com",
        "servers": ["RoboForex-ECN", "RoboForex-Pro", "RoboForex-Demo"],
    },
    {
        "id": "justmarkets",
        "broker_name": "JustMarkets",
        "short_code": "JM",
        "category": "ECN Broker",
        "website": "justmarkets.com",
        "servers": ["JustMarkets-Live", "JustMarkets-Live2", "JustMarkets-Demo"],
    },
    {
        "id": "fxpro",
        "broker_name": "FxPro Financial Services",
        "short_code": "FP",
        "category": "ECN Broker",
        "website": "fxpro.com",
        "servers": ["FxPro-MT5", "FxPro-MT5 Live02", "FxPro-MT5 Demo"],
    },
    {
        "id": "admirals",
        "broker_name": "Admirals (Admiral Markets)",
        "short_code": "AM",
        "category": "ECN Broker",
        "website": "admiralmarkets.com",
        "servers": ["AdmiralsGroup-Live", "AdmiralsGroup-Demo", "AdmiralMarkets-MT5"],
    },
    {
        "id": "axi",
        "broker_name": "Axi (AxiTrader)",
        "short_code": "AX",
        "category": "ECN Broker",
        "website": "axi.com",
        "servers": ["Axi-US03-Live", "Axi-US03-Demo", "AxiTrader-Live", "AxiTrader-Demo"],
    },
    {
        "id": "thinkmarkets",
        "broker_name": "ThinkMarkets",
        "short_code": "TK",
        "category": "ECN Broker",
        "website": "thinkmarkets.com",
        "servers": ["ThinkMarkets-Live", "ThinkMarkets-Live 2", "ThinkMarkets-Demo"],
    },
    {
        "id": "blueberry",
        "broker_name": "Blueberry Markets",
        "short_code": "BB",
        "category": "ECN Broker",
        "website": "blueberrymarkets.com",
        "servers": ["BlueberryMarkets-Live", "BlueberryMarkets-Demo"],
    },
    {
        "id": "cmcmarkets",
        "broker_name": "CMC Markets",
        "short_code": "CM",
        "category": "ECN Broker",
        "website": "cmcmarkets.com",
        "servers": ["CMCMarkets-Live", "CMCMarkets-Demo"],
    },
    {
        "id": "darwinex",
        "broker_name": "Darwinex / Darwinex Zero",
        "short_code": "DW",
        "category": "ECN Broker",
        "website": "darwinex.com",
        "servers": ["Darwinex-Live", "Darwinex-Demo", "DarwinexZero-Demo"],
    },
    {
        "id": "ig",
        "broker_name": "IG Markets",
        "short_code": "IG",
        "category": "ECN Broker",
        "website": "ig.com",
        "servers": ["IG-LIVE", "IG-DEMO"],
    },
    {
        "id": "alpaca",
        "broker_name": "Alpaca Markets",
        "short_code": "AL",
        "category": "ECN Broker",
        "website": "alpaca.markets",
        "servers": ["Alpaca-Live", "Alpaca-Demo"],
    },
    {
        "id": "blackbull",
        "broker_name": "BlackBull Markets",
        "short_code": "BL",
        "category": "ECN Broker",
        "website": "blackbull.com",
        "servers": ["BlackBullMarkets-Live", "BlackBullMarkets-Live2", "BlackBullMarkets-Demo"],
    },
    {
        "id": "weltrade",
        "broker_name": "Weltrade",
        "short_code": "WT",
        "category": "Market Maker",
        "website": "weltrade.com",
        "servers": ["Weltrade-Live", "Weltrade-Demo"],
    },
    {
        "id": "headway",
        "broker_name": "Headway",
        "short_code": "HW",
        "category": "Market Maker",
        "website": "hw.site",
        "servers": ["Headway-Real", "Headway-Demo"],
    },
    {
        "id": "dupoin",
        "broker_name": "Dupoin (ID / Global)",
        "short_code": "DP",
        "category": "ECN Broker",
        "website": "dupoin.co.id",
        "servers": ["Dupoin-Live", "Dupoin-Demo", "DupoinFutures-Live", "DupoinFutures-Demo"],
    },
    {
        "id": "mifx",
        "broker_name": "MIFX (Monex Investindo Futures)",
        "short_code": "MI",
        "category": "ECN Broker",
        "website": "mifx.com",
        "servers": ["MonexInvestindo-Live", "MonexInvestindo-Demo"],
    },
    {
        "id": "finex",
        "broker_name": "Finex Berjangka",
        "short_code": "FN",
        "category": "ECN Broker",
        "website": "finex.co.id",
        "servers": ["FinexBerjangka-Live", "FinexBerjangka-Demo"],
    },
    {
        "id": "gkfx",
        "broker_name": "GKFX / Trive",
        "short_code": "GK",
        "category": "ECN Broker",
        "website": "trive.com",
        "servers": ["GKFX-Live", "GKFX-Demo", "Trive-Live", "Trive-Demo"],
    },
    {
        "id": "valetax",
        "broker_name": "Valetax",
        "short_code": "VX",
        "category": "ECN Broker",
        "website": "valetax.com",
        "servers": ["Valetax-Live", "Valetax-Demo"],
    },
    {
        "id": "puprime",
        "broker_name": "PU Prime",
        "short_code": "PU",
        "category": "ECN Broker",
        "website": "puprime.com",
        "servers": ["PUPrime-Live", "PUPrime-Live 2", "PUPrime-Demo"],
    },
    {
        "id": "avatrade",
        "broker_name": "AvaTrade",
        "short_code": "AV",
        "category": "Market Maker",
        "website": "avatrade.com",
        "servers": ["Ava-Real 1-MT5", "Ava-Demo 1-MT5"],
    },
    # --- PROP FIRMS ---
    {
        "id": "ftmo",
        "broker_name": "FTMO",
        "short_code": "FT",
        "category": "Prop Firm",
        "website": "ftmo.com",
        "servers": [
            "FTMO-Server",
            "FTMO-Server2",
            "FTMO-Server3",
            "FTMO-Server4",
            "FTMO-Demo",
            "FTMO-Demo2",
        ],
    },
    {
        "id": "fundingpips",
        "broker_name": "FundingPips",
        "short_code": "FP",
        "category": "Prop Firm",
        "website": "fundingpips.com",
        "servers": [
            "FundingPips-Real",
            "FundingPips-Demo",
            "BlackBullMarkets-Live",
            "BlackBullMarkets-Demo",
        ],
    },
    {
        "id": "the5ers",
        "broker_name": "The5ers (Five Percent Online)",
        "short_code": "5%",
        "category": "Prop Firm",
        "website": "the5ers.com",
        "servers": ["FivePercentOnline-Real", "FivePercentOnline-Demo"],
    },
    {
        "id": "fundednext",
        "broker_name": "FundedNext",
        "short_code": "FN",
        "category": "Prop Firm",
        "website": "fundednext.com",
        "servers": [
            "FundedNext-Server",
            "FundedNext-Server 2",
            "FundedNext-Server 3",
            "FundedNext-Demo",
            "GrowthNext-Server",
        ],
    },
    {
        "id": "alphacapital",
        "broker_name": "Alpha Capital Group",
        "short_code": "AC",
        "category": "Prop Firm",
        "website": "alphacapitalgroup.uk",
        "servers": ["ACGMarkets-Live", "ACGMarkets-Demo"],
    },
    {
        "id": "e8markets",
        "broker_name": "E8 Markets",
        "short_code": "E8",
        "category": "Prop Firm",
        "website": "e8markets.com",
        "servers": ["E8Markets-Live", "E8Markets-Demo"],
    },
    {
        "id": "maventrading",
        "broker_name": "Maven Trading",
        "short_code": "MV",
        "category": "Prop Firm",
        "website": "maventrading.com",
        "servers": ["MavenTrading-Live", "MavenTrading-Demo"],
    },
    {
        "id": "goatfunded",
        "broker_name": "Goat Funded Trader",
        "short_code": "GF",
        "category": "Prop Firm",
        "website": "goatfundedtrader.com",
        "servers": ["GoatFunded-Live", "GoatFunded-Demo"],
    },
    {
        "id": "brightfunded",
        "broker_name": "BrightFunded",
        "short_code": "BF",
        "category": "Prop Firm",
        "website": "brightfunded.com",
        "servers": ["BrightFunded-Live", "BrightFunded-Demo"],
    },
    {
        "id": "fxify",
        "broker_name": "FXIFY",
        "short_code": "FX",
        "category": "Prop Firm",
        "website": "fxify.com",
        "servers": ["FXIFY-Live", "FXIFY-Demo", "FXPIG-Live", "FXPIG-Demo"],
    },
    {
        "id": "toptier",
        "broker_name": "TopTier Trader",
        "short_code": "TT",
        "category": "Prop Firm",
        "website": "toptiertrader.com",
        "servers": ["TopTierTrader-Live", "TopTierTrader-Demo"],
    },
    {
        "id": "metaquotes",
        "broker_name": "MetaQuotes Demo",
        "short_code": "MQ",
        "category": "ECN Broker",
        "website": "metaquotes.net",
        "servers": ["MetaQuotes-Demo"],
    },
]


def scan_local_mt5_servers(active_data_path: str = "") -> List[str]:
    """Scan local MT5 installations (bases/* & recent logs/*.log) for installed server profiles."""
    found: Set[str] = set()
    search_roots: List[str] = []

    if active_data_path:
        search_roots.append(active_data_path)

    appdata = os.environ.get("APPDATA", "")
    if appdata:
        search_roots.extend(glob.glob(os.path.join(appdata, "MetaQuotes", "Terminal", "*")))

    auth_re = re.compile(r"authorized on ([A-Za-z0-9._\- ]+?)(?:\s+through|\r|\n|$)", re.IGNORECASE)

    for root in set(search_roots):
        base_dir = os.path.join(root, "bases")
        if os.path.isdir(base_dir):
            try:
                for entry in os.listdir(base_dir):
                    full = os.path.join(base_dir, entry)
                    if os.path.isdir(full) and entry.lower() not in IGNORED_BASE_DIRS:
                        found.add(entry)
            except OSError:
                pass

        # Also inspect the 3 most recent terminal logs for previously connected servers
        logs_dir = os.path.join(root, "logs")
        if os.path.isdir(logs_dir):
            try:
                log_files = sorted(
                    glob.glob(os.path.join(logs_dir, "*.log")),
                    key=os.path.getmtime,
                    reverse=True,
                )[:3]
                for lf in log_files:
                    try:
                        raw = open(lf, "rb").read(262144)
                        txt = raw.decode("utf-16-le", errors="ignore")
                        for m in auth_re.finditer(txt):
                            srv = m.group(1).strip()
                            if 3 <= len(srv) <= 60 and srv.lower() not in IGNORED_BASE_DIRS:
                                found.add(srv)
                    except OSError:
                        continue
            except OSError:
                pass

    return sorted(found)


def discover_brokers(
    search: str = "",
    local_servers: List[str] = None,
    custom_servers: List[Dict[str, str]] = None,
    saved_servers: List[str] = None,
) -> List[Dict[str, Any]]:
    local_set = set(local_servers or [])
    local_lower_map = {s.lower(): s for s in local_set}
    matched_local: Set[str] = set()

    brokers: List[Dict[str, Any]] = []

    for b in CURATED_BROKERS:
        servers = list(b["servers"])
        srv_lower = {s.lower() for s in servers}
        installed_here: List[str] = []

        # Match any locally installed server that belongs to this broker
        for ls in local_set:
            ls_l = ls.lower()
            prefix = b["id"].lower()
            if ls_l in srv_lower or (len(prefix) >= 3 and prefix in ls_l):
                if ls_l not in srv_lower:
                    servers.insert(0, ls)
                    srv_lower.add(ls_l)
                installed_here.append(ls)
                matched_local.add(ls)

        # Merge custom servers matching this broker
        for cs in custom_servers or []:
            s_name = cs.get("server_name", "").strip()
            b_name = cs.get("broker_name", "").strip().lower()
            if s_name and s_name.lower() not in srv_lower:
                if b_name and (b_name in b["broker_name"].lower() or b["id"] in b_name):
                    servers.insert(0, s_name)
                    srv_lower.add(s_name.lower())

        brokers.append(
            {
                "id": b["id"],
                "broker_name": b["broker_name"],
                "short_code": b["short_code"],
                "category": b["category"],
                "website": b.get("website", ""),
                "servers": servers,
                "installed_servers": installed_here,
                "is_installed_locally": len(installed_here) > 0,
            }
        )

    # Add unmatched locally installed servers as an "Installed / Local" entry
    unmatched_local = sorted(s for s in local_set if s not in matched_local)
    if unmatched_local:
        brokers.insert(
            0,
            {
                "id": "local_installed",
                "broker_name": "Installed MT5 Servers (Local PC)",
                "short_code": "PC",
                "category": "Installed / Local",
                "website": "localhost",
                "servers": unmatched_local,
                "installed_servers": unmatched_local,
                "is_installed_locally": True,
            },
        )

    # Add unmatched custom/saved servers
    all_known_lower = {s.lower() for b in brokers for s in b["servers"]}
    extra_custom: List[str] = []
    for cs in custom_servers or []:
        sn = cs.get("server_name", "").strip()
        if sn and sn.lower() not in all_known_lower:
            extra_custom.append(sn)
            all_known_lower.add(sn.lower())
    for ss in saved_servers or []:
        if ss and ss.lower() not in all_known_lower:
            extra_custom.append(ss)
            all_known_lower.add(ss.lower())

    if extra_custom:
        brokers.insert(
            0,
            {
                "id": "custom_saved",
                "broker_name": "Custom & Saved Broker Servers",
                "short_code": "CS",
                "category": "Installed / Local",
                "website": "",
                "servers": extra_custom,
                "installed_servers": [s for s in extra_custom if s.lower() in local_lower_map],
                "is_installed_locally": True,
            },
        )

    # Filter by search query
    q = (search or "").strip().lower()
    if q:
        filtered = []
        for b in brokers:
            if (
                q in b["broker_name"].lower()
                or q in b["short_code"].lower()
                or q in b["category"].lower()
                or any(q in s.lower() for s in b["servers"])
            ):
                filtered.append(b)
        brokers = filtered

    # Sort: Installed on PC first, then alphabetical
    brokers.sort(key=lambda x: (not x["is_installed_locally"], x["broker_name"].lower()))
    return brokers
