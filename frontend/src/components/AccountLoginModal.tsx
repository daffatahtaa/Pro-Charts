import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  UserCheck,
  Trash2,
  RefreshCw,
  KeyRound,
  Server,
  Shield,
  Search,
  Eye,
  EyeOff,
  Plus,
  Check,
  Laptop,
  Trophy,
} from 'lucide-react';
import { api } from '../services/api';
import { useChartStore } from '../store/useChartStore';
import { MT5BrokerInfo, SavedMT5Account } from '../types/chart';

type BrokerCatFilter = 'ALL' | 'LOCAL' | 'FOREX' | 'PROP';
type ServerTypeFilter = 'ALL' | 'LIVE' | 'DEMO';

const AVATAR_COLORS = [
  '#2962ff',
  '#089981',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#10b981',
];

function getAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function isDemoServer(srv: string): boolean {
  return /demo|trial|practice/i.test(srv);
}

export const AccountLoginModal: React.FC = () => {
  const {
    accountModalOpen,
    setAccountModalOpen,
    account,
    symbol,
    setSymbol,
    watchlistSymbols,
    setWatchlistSymbols,
    refreshTradeState,
    showToast,
  } = useChartStore();

  const [savedAccounts, setSavedAccounts] = useState<SavedMT5Account[]>([]);
  const [brokers, setBrokers] = useState<MT5BrokerInfo[]>([]);
  const [brokerSearch, setBrokerSearch] = useState('');
  const [catFilter, setCatFilter] = useState<BrokerCatFilter>('ALL');
  const [selectedBroker, setSelectedBroker] = useState<MT5BrokerInfo | null>(null);

  const [serverTypeFilter, setServerTypeFilter] = useState<ServerTypeFilter>('ALL');
  const [serverFilterText, setServerFilterText] = useState('');
  const [serverInput, setServerInput] = useState(account?.server || 'ICMarketsSC-MT5-2');
  const [showCustomServer, setShowCustomServer] = useState(false);
  const [customServerDraft, setCustomServerDraft] = useState('');

  const [loginInput, setLoginInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saveAccount, setSaveAccount] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadSaved = () => {
    api
      .getSavedAccounts()
      .then((res) => setSavedAccounts(res.accounts || []))
      .catch(() => {});
  };

  const loadBrokers = (q = '') => {
    api
      .getBrokers(q)
      .then((list) => setBrokers(list))
      .catch(() => {});
  };

  useEffect(() => {
    if (!accountModalOpen) return;
    loadSaved();
    if (account?.server) setServerInput(account.server);
  }, [accountModalOpen, account?.server]);

  useEffect(() => {
    if (!accountModalOpen) return;
    const t = window.setTimeout(() => loadBrokers(brokerSearch), 120);
    return () => window.clearTimeout(t);
  }, [accountModalOpen, brokerSearch]);

  const filteredBrokers = useMemo(() => {
    return brokers.filter((b) => {
      if (catFilter === 'LOCAL') return b.is_installed_locally;
      if (catFilter === 'PROP') return b.category === 'Prop Firm';
      if (catFilter === 'FOREX')
        return b.category === 'ECN Broker' || b.category === 'Market Maker';
      return true;
    });
  }, [brokers, catFilter]);

  const filteredServers = useMemo(() => {
    if (!selectedBroker) return [];
    return selectedBroker.servers.filter((srv) => {
      if (serverTypeFilter === 'LIVE' && isDemoServer(srv)) return false;
      if (serverTypeFilter === 'DEMO' && !isDemoServer(srv)) return false;
      if (
        serverFilterText.trim() &&
        !srv.toLowerCase().includes(serverFilterText.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [selectedBroker, serverTypeFilter, serverFilterText]);

  if (!accountModalOpen) return null;

  const handleSelectBroker = (b: MT5BrokerInfo) => {
    setSelectedBroker(b);
    setServerTypeFilter('ALL');
    setServerFilterText('');
    setShowCustomServer(false);
    if (b.installed_servers.length > 0) {
      setServerInput(b.installed_servers[0]);
    } else if (b.servers.length > 0) {
      setServerInput(b.servers[0]);
    }
  };

  const handleAddCustomServer = async () => {
    const srv = customServerDraft.trim();
    if (!srv) return;
    const brokerName = selectedBroker?.broker_name || 'Custom Broker';
    await api.addCustomBrokerServer(brokerName, srv).catch(() => {});
    setServerInput(srv);
    setCustomServerDraft('');
    setShowCustomServer(false);
    loadBrokers(brokerSearch);
    showToast('info', `Custom server '${srv}' selected & saved.`);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const loginNum = parseInt(loginInput.trim(), 10);
    if (Number.isNaN(loginNum) || !serverInput.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.loginMt5Account({
        login: loginNum,
        password: passwordInput || undefined,
        server: serverInput.trim(),
        save_account: saveAccount,
        current_symbol: symbol,
        watchlist: watchlistSymbols,
      });
      showToast(res.success ? 'success' : 'error', res.message);
      if (res.success) {
        setPasswordInput('');
        if (res.resolved_watchlist && res.resolved_watchlist.length > 0) {
          setWatchlistSymbols(res.resolved_watchlist);
        }
        if (res.resolved_symbol) {
          setSymbol(res.resolved_symbol);
        }
        await refreshTradeState();
        loadSaved();
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickSwitch = async (acc: SavedMT5Account) => {
    setSubmitting(true);
    try {
      const res = await api.loginMt5Account({
        login: acc.login,
        server: acc.server,
        save_account: true,
        current_symbol: symbol,
        watchlist: watchlistSymbols,
      });
      showToast(res.success ? 'success' : 'error', res.message);
      if (res.success) {
        if (res.resolved_watchlist && res.resolved_watchlist.length > 0) {
          setWatchlistSymbols(res.resolved_watchlist);
        }
        if (res.resolved_symbol) {
          setSymbol(res.resolved_symbol);
        }
        await refreshTradeState();
        loadSaved();
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Switch failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSaved = async (login: number) => {
    await api.deleteSavedAccount(login).catch(() => {});
    loadSaved();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4"
      onClick={() => setAccountModalOpen(false)}
    >
      <div
        className="w-full max-w-[660px] bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-tv overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#2a2e39] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#2962ff]" />
            <h2 className="text-[15px] font-semibold text-[#d1d4dc]">
              MT5 Broker Directory &amp; Account Switcher
            </h2>
          </div>
          <button
            onClick={() => setAccountModalOpen(false)}
            className="p-1 rounded text-[#787b86] hover:bg-[#2a2e39] hover:text-[#d1d4dc]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Current Active Account Card */}
          <div className="p-3 rounded bg-[#131722] border border-[#2a2e39] flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10.5px] uppercase tracking-wider text-[#089981] font-semibold">
                  Active MT5 Account
                </span>
                <span className="font-mono-num text-[12.5px] text-white font-bold">
                  #{account?.login || 0}
                </span>
              </div>
              <div className="text-[12px] text-[#787b86] mt-0.5">
                {account?.server || 'Disconnected'} · Leverage 1:{account?.leverage || 100}
              </div>
            </div>
            <div className="text-right font-mono-num">
              <div className="text-[12px] text-[#d1d4dc]">
                Bal:{' '}
                <span className="text-white font-semibold">
                  ${(account?.balance ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="text-[11px] text-[#787b86]">
                Eq: ${(account?.equity ?? 0).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Saved Accounts - 1-Click Switch */}
          {savedAccounts.length > 0 && (
            <div>
              <div className="text-[10.5px] uppercase tracking-wider text-[#787b86] mb-1.5">
                Saved Accounts (1-Click Switch)
              </div>
              <div className="space-y-1.5">
                {savedAccounts.map((sa) => {
                  const isCurrent = sa.login === account?.login;
                  return (
                    <div
                      key={sa.login}
                      className={`px-3 py-2 rounded border flex items-center justify-between ${
                        isCurrent
                          ? 'bg-[#2962ff]/10 border-[#2962ff]/50'
                          : 'bg-[#131722]/70 border-[#2a2e39]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono-num text-[12.5px] font-semibold text-[#d1d4dc]">
                            #{sa.login}
                          </span>
                          <span className="text-[11.5px] text-[#787b86] truncate">
                            {sa.server}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isCurrent ? (
                          <span className="px-2 py-0.5 rounded bg-[#089981]/20 text-[#089981] text-[10.5px] font-semibold">
                            Connected
                          </span>
                        ) : (
                          <button
                            onClick={() => handleQuickSwitch(sa)}
                            disabled={submitting}
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#2962ff] hover:bg-[#1e53e5] text-white text-[11px] font-medium disabled:opacity-50"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Switch
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteSaved(sa.login)}
                          title="Remove saved account"
                          className="p-1 rounded text-[#787b86] hover:text-[#f23645]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 1: Interactive Broker Directory Search */}
          <div className="space-y-2.5 pt-2 border-t border-[#2a2e39]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-[#d1d4dc] font-semibold">
                1. Find Your Broker / Prop Firm
              </span>
              <span className="text-[10.5px] text-[#787b86]">
                {filteredBrokers.length} brokers available
              </span>
            </div>

            {/* Search Input */}
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-[#131722] border border-[#2a2e39] focus-within:border-[#2962ff]">
              <Search className="w-4 h-4 text-[#787b86]" />
              <input
                type="text"
                value={brokerSearch}
                onChange={(e) => setBrokerSearch(e.target.value)}
                placeholder="Search broker or server (e.g. Exness, IC Markets, FTMO, Pepperstone, XM)..."
                className="flex-1 bg-transparent text-[12.5px] text-white placeholder-[#787b86] outline-none"
              />
              {brokerSearch && (
                <button
                  onClick={() => setBrokerSearch('')}
                  className="text-[#787b86] hover:text-[#d1d4dc]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: 'ALL' as const, label: 'All' },
                { id: 'LOCAL' as const, label: 'Installed on PC', icon: <Laptop className="w-3 h-3" /> },
                { id: 'FOREX' as const, label: 'ECN / Forex' },
                { id: 'PROP' as const, label: 'Prop Firms', icon: <Trophy className="w-3 h-3" /> },
              ].map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setCatFilter(pill.id)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                    catFilter === pill.id
                      ? 'bg-[#2962ff] text-white'
                      : 'bg-[#131722] text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]'
                  }`}
                >
                  {pill.icon}
                  <span>{pill.label}</span>
                </button>
              ))}
            </div>

            {/* Scrollable Broker Cards */}
            <div className="max-h-[185px] overflow-y-auto rounded border border-[#2a2e39] bg-[#131722]/70 divide-y divide-[#2a2e39]/50">
              {filteredBrokers.length === 0 ? (
                <div className="py-6 text-center text-[12px] text-[#787b86]">
                  No broker matched &ldquo;{brokerSearch}&rdquo;. Use &ldquo;+ Custom Server&rdquo; below.
                </div>
              ) : (
                filteredBrokers.map((b) => {
                  const isSel = selectedBroker?.id === b.id;
                  return (
                    <div
                      key={b.id}
                      onClick={() => handleSelectBroker(b)}
                      className={`px-3 py-2 flex items-center justify-between cursor-pointer transition-colors ${
                        isSel
                          ? 'bg-[#2962ff]/15 border-l-2 border-l-[#2962ff]'
                          : 'hover:bg-[#1e222d]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-7 h-7 rounded flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                          style={{ backgroundColor: getAvatarColor(b.id) }}
                        >
                          {b.short_code}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[12.5px] font-semibold text-[#d1d4dc] truncate">
                              {b.broker_name}
                            </span>
                            {b.is_installed_locally && (
                              <span className="px-1.5 py-0.5 rounded bg-[#089981]/20 text-[#089981] text-[9.5px] font-semibold shrink-0">
                                Installed on PC
                              </span>
                            )}
                          </div>
                          <div className="text-[10.5px] text-[#787b86]">
                            {b.category} {b.website ? `· ${b.website}` : ''}
                          </div>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono-num text-[#787b86] shrink-0 ml-2">
                        {b.servers.length} servers
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* STEP 2: Server Picker Pills */}
          <div className="space-y-2 pt-2 border-t border-[#2a2e39]">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] uppercase tracking-wider text-[#d1d4dc] font-semibold">
                2. Select Server {selectedBroker ? `(${selectedBroker.broker_name})` : ''}
              </span>

              <div className="flex items-center gap-1">
                {selectedBroker && (
                  <>
                    {(['ALL', 'LIVE', 'DEMO'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setServerTypeFilter(t)}
                        className={`px-2 py-0.5 rounded text-[10.5px] font-medium ${
                          serverTypeFilter === t
                            ? 'bg-[#2962ff]/20 text-[#2962ff]'
                            : 'text-[#787b86] hover:text-[#d1d4dc]'
                        }`}
                      >
                        {t === 'ALL' ? 'All' : t === 'LIVE' ? 'Live / Real' : 'Demo / Trial'}
                      </button>
                    ))}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setShowCustomServer((v) => !v)}
                  className="flex items-center gap-0.5 px-2 py-0.5 rounded bg-[#131722] border border-[#2a2e39] hover:border-[#2962ff] text-[10.5px] text-[#d1d4dc]"
                >
                  <Plus className="w-3 h-3" />
                  Custom Server
                </button>
              </div>
            </div>

            {selectedBroker && selectedBroker.servers.length > 8 && (
              <input
                type="text"
                value={serverFilterText}
                onChange={(e) => setServerFilterText(e.target.value)}
                placeholder={`Filter ${selectedBroker.servers.length} servers (e.g. Real8, Trial2)...`}
                className="w-full px-2.5 py-1 rounded bg-[#131722] border border-[#2a2e39] text-[11.5px] text-white placeholder-[#787b86] outline-none focus:border-[#2962ff]"
              />
            )}

            {selectedBroker && (
              <div className="flex flex-wrap gap-1.5 max-h-[96px] overflow-y-auto p-2 rounded bg-[#131722]/60 border border-[#2a2e39]">
                {filteredServers.map((srv) => {
                  const isPicked = serverInput === srv;
                  const isLocal = selectedBroker.installed_servers.includes(srv);
                  return (
                    <button
                      key={srv}
                      type="button"
                      onClick={() => setServerInput(srv)}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono-num border transition-colors ${
                        isPicked
                          ? 'bg-[#2962ff] border-[#2962ff] text-white font-semibold'
                          : 'bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc] hover:border-[#2962ff]'
                      }`}
                    >
                      {isLocal && (
                        <span
                          title="Installed locally on this PC"
                          className="w-1.5 h-1.5 rounded-full bg-[#089981]"
                        />
                      )}
                      <span>{srv}</span>
                      {isPicked && <Check className="w-3 h-3" />}
                    </button>
                  );
                })}
              </div>
            )}

            {showCustomServer && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customServerDraft}
                  onChange={(e) => setCustomServerDraft(e.target.value)}
                  placeholder="Enter exact MT5 server name (e.g. MyBroker-Live01)"
                  className="flex-1 px-2.5 py-1.5 rounded bg-[#131722] border border-[#2a2e39] text-[12px] font-mono-num text-white outline-none focus:border-[#2962ff]"
                />
                <button
                  type="button"
                  onClick={handleAddCustomServer}
                  className="px-3 py-1.5 rounded bg-[#089981] hover:bg-[#07826e] text-white text-[11.5px] font-semibold"
                >
                  Save &amp; Use
                </button>
              </div>
            )}
          </div>

          {/* STEP 3: Credentials Form */}
          <form onSubmit={handleLogin} className="space-y-3 pt-2 border-t border-[#2a2e39]">
            <div className="text-[11px] uppercase tracking-wider text-[#d1d4dc] font-semibold">
              3. Enter MT5 Account Credentials
            </div>

            <div>
              <label className="block text-[11px] text-[#787b86] mb-1">Selected Server</label>
              <div className="flex items-center bg-[#131722] border border-[#2a2e39] rounded px-2">
                <Server className="w-3.5 h-3.5 text-[#2962ff] mr-1.5" />
                <input
                  required
                  value={serverInput}
                  onChange={(e) => setServerInput(e.target.value)}
                  placeholder="Select a broker server above or type exact server name"
                  className="w-full py-1.5 bg-transparent text-[12px] font-mono-num text-white outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] text-[#787b86] mb-1">Account Login (ID)</label>
                <div className="flex items-center bg-[#131722] border border-[#2a2e39] rounded px-2 focus-within:border-[#2962ff]">
                  <UserCheck className="w-3.5 h-3.5 text-[#787b86] mr-1.5" />
                  <input
                    type="number"
                    required
                    value={loginInput}
                    onChange={(e) => setLoginInput(e.target.value)}
                    placeholder="e.g. 7360004"
                    className="no-spinner w-full py-1.5 bg-transparent text-[12px] font-mono-num text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-[#787b86] mb-1">Password</label>
                <div className="flex items-center bg-[#131722] border border-[#2a2e39] rounded px-2 focus-within:border-[#2962ff]">
                  <KeyRound className="w-3.5 h-3.5 text-[#787b86] mr-1.5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Master / Investor password"
                    className="w-full py-1.5 bg-transparent text-[12px] text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    className="p-1 text-[#787b86] hover:text-[#d1d4dc]"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 text-[12px] text-[#d1d4dc] cursor-pointer">
              <input
                type="checkbox"
                checked={saveAccount}
                onChange={(e) => setSaveAccount(e.target.checked)}
                className="accent-[#2962ff]"
              />
              Save account locally in DuckDB for 1-click switching
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 rounded bg-[#2962ff] hover:bg-[#1e53e5] disabled:opacity-50 text-white text-[12.5px] font-semibold transition-colors"
            >
              {submitting ? 'Connecting to MT5 Broker...' : `Connect & Switch to ${serverInput || 'MT5'}`}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
