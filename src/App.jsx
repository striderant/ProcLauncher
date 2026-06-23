import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Home, Settings, Package, Play, X, Minus, Square, Download, ChevronDown, Layers, Users, Sliders, MessageSquare, ShoppingBag, RefreshCw, Terminal, Wifi, Search, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import P2PTab from './components/P2PTab';
import AccountChip from './components/AccountChip';
import AccountManagerModal from './components/AccountManagerModal';
import AccountSetupModal from './components/AccountSetupModal';
import { ShieldCheck, Zap, Bell, Gamepad2, Sparkles } from "lucide-react";

const electron = window.electron || {
  minimize: () => console.log('Mock: Minimize'),
  maximize: () => console.log('Mock: Maximize'),
  close: () => console.log('Mock: Close'),
  launchGame: async (opts) => { console.log('Mock: Launch', opts); return { success: true }; },
  onLaunchProgress: () => () => {},
  onLaunchFinished: () => () => {},
  onLaunchStarted: () => () => {},
  onLog: () => () => {},
  openGameFolder: () => console.log('Mock: Open folder'),
  accounts: {
  list: async () => {
    return JSON.parse(localStorage.getItem('accounts') || '[]');
  },

  getSelected: async () => {
    const selectedId = localStorage.getItem('selectedAccount');

    if (!selectedId) return null;

    const accounts = JSON.parse(localStorage.getItem('accounts') || '[]');

    return accounts.find(a => a.id === selectedId) || null;
  },

  createOffline: async (username) => {
    username = String(username || '').trim();

    if (!username) {
      throw new Error('Username is required.');
    }

    const accounts = JSON.parse(localStorage.getItem('accounts') || '[]');

    const existing = accounts.find(
      a => a.username.toLowerCase() === username.toLowerCase()
    );

    if (existing) {
      localStorage.setItem('selectedAccount', existing.id);
      return existing;
    }

    const account = {
      id: crypto.randomUUID(),
      username,
      type: 'offline',
      avatar: `https://minotar.net/avatar/${encodeURIComponent(username)}/64`,
      createdAt: Date.now()
    };

    accounts.push(account);

    localStorage.setItem(
      'accounts',
      JSON.stringify(accounts)
    );

    localStorage.setItem(
      'selectedAccount',
      account.id
    );

    return account;
  },

  startMicrosoftLogin: async () => {
    throw new Error(
      'Microsoft login requires the Electron version of Omega Launcher.'
    );
  },

  refreshMicrosoft: async (id) => {
    const accounts = JSON.parse(
      localStorage.getItem('accounts') || '[]'
    );

    return accounts.find(a => a.id === id) || null;
  },

  select: async (id) => {
    const accounts = JSON.parse(
      localStorage.getItem('accounts') || '[]'
    );

    const account = accounts.find(a => a.id === id);

    if (!account) {
      throw new Error('Account not found.');
    }

    localStorage.setItem('selectedAccount', id);

    return account;
  },

  remove: async (id) => {
    const accounts = JSON.parse(
      localStorage.getItem('accounts') || '[]'
    );

    const filtered = accounts.filter(
      account => account.id !== id
    );

    localStorage.setItem(
      'accounts',
      JSON.stringify(filtered)
    );

    const selectedId =
      localStorage.getItem('selectedAccount');

    if (selectedId === id) {
      if (filtered.length > 0) {
        localStorage.setItem(
          'selectedAccount',
          filtered[0].id
        );
      } else {
        localStorage.removeItem(
          'selectedAccount'
        );
      }
    }

    return true;
  },

  onMicrosoftStatus: (callback) => {
    return () => {};
  }
},
  fetchWonderlandClients: async () => ({
    success: true,
    clients: [
      { name: 'LiquidBounce-1.8.9', link: '#', source: 'Wonderland' },
      { name: 'Rise-Client-1.8.9', link: '#', source: 'Wonderland' },
      { name: 'FDP-1.8.9', link: '#', source: 'Wonderland' },
      { name: 'Novoline-1.8.9', link: '#', source: 'Wonderland' },
      { name: 'Sigma-1.8.9', link: '#', source: 'External' },
      { name: 'Meteor-1.21.1', link: '#', source: 'External' },
    ]
  }),
  downloadWonderlandClient: async (c) => { console.log('Mock: Download', c); return { success: true }; },
  getInstalledVersions: async () => {
    console.log('Mock: getInstalledVersions');
    return { success: true, versions: [] };
  },
};
const navBase =
  "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-[12px] font-medium transition-all";

const navInactive =
  "text-white/35 hover:text-white/80 hover:bg-white/5";

const navActive =
  "text-white bg-white/5 border border-white/10";

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'clients', label: 'Clients', icon: Users },
  { id: 'p2p', label: 'P2P', icon: Wifi },
  { id: 'mods', label: 'Mods', icon: Layers },
  { id: 'profiles', label: 'Profiles', icon: Package },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'changelog', label: 'Changelog', icon: RefreshCw },
  { id: 'discord', label: 'Discord', icon: MessageSquare },
  { id: 'store', label: 'Store', icon: ShoppingBag },
];

function getClientIcon(name) {
  const n = name.toLowerCase();
  if (n.includes('liquid')) return '💧';
  if (n.includes('rise')) return '⭐';
  if (n.includes('fdp')) return 'F';
  if (n.includes('novo')) return 'N';
  if (n.includes('meteor')) return '☄️';
  if (n.includes('wurst')) return 'W';
  if (n.includes('sigma')) return 'Σ';
  if (n.includes('aristois')) return 'A';
  if (n.includes('impact')) return '⚡';
  return name.charAt(0).toUpperCase();
}

function getClientColor(name) {
  const colors = ['#3b9eff','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#10b981','#f97316','#eab308','#ec4899','#14b8a6'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [accountSetupOpen, setAccountSetupOpen] = useState(true);
  const [accountManagerOpen, setAccountManagerOpen] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountStatus, setAccountStatus] = useState('');
  const [accountError, setAccountError] = useState('');
  const [installedVersions, setInstalledVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [versionOpen, setVersionOpen] = useState(false);
  const [ram, setRam] = useState('4');
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchProgress, setLaunchProgress] = useState(0);
  const [launchStatus, setLaunchStatus] = useState('');
  const [logs, setLogs] = useState([]);
  const [showConsole, setShowConsole] = useState(false);
  const [resolution, setResolution] = useState('1280x720');
  const [hideOnLaunch, setHideOnLaunch] = useState(true);
  const [customJvmArgs, setCustomJvmArgs] = useState(() => localStorage.getItem('customJvmArgs') || '');
  const [modLoader, setModLoader] = useState('vanilla');
  const consoleEndRef = useRef(null);
  const versionBtnRef = useRef(null);
  const versionDropdownRef = useRef(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  const [wonderlandClients, setWonderlandClients] = useState([]);
  const [loadingWonderland, setLoadingWonderland] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('all');
  const [downloadingClients, setDownloadingClients] = useState({});
  const [downloadProgress, setDownloadProgress] = useState({});
  const [selectedClient, setSelectedClient] = useState(null);
  const [installedClients, setInstalledClients] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('installedClients') || '[]')); }
    catch { return new Set(); }
  });

  const markInstalled = (name) => {
    setInstalledClients(prev => {
      const next = new Set(prev);
      next.add(name);
      try { localStorage.setItem('installedClients', JSON.stringify([...next])); } catch {}
      return next;
    });
    fetchInstalledVersions();
  };
const Logo = ({ size = 32 }) => (
  <div
    className="flex items-center justify-center rounded-xl bg-[#12121c] border border-white/10 glow-purple"
    style={{ width: size, height: size }}
  >
    <span className="text-violet-400 font-black tracking-widest">
      Ω
    </span>
  </div>
);
  const [allVanillaVersions, setAllVanillaVersions] = useState([]);

  const syncAccounts = async () => {
    const [saved, selected] = await Promise.all([
      electron.accounts.list(),
      electron.accounts.getSelected(),
    ]);
    setAccounts(saved);
    setSelectedAccount(selected);
    setAccountSetupOpen(!selected);
    return selected;
  };

  useEffect(() => {
    syncAccounts().catch(error => {
      setAccountError(error.message || 'Unable to load accounts.');
      setAccountSetupOpen(true);
    });
    return electron.accounts.onMicrosoftStatus?.(setAccountStatus) || (() => {});
  }, []);

  const createOfflineAccount = async username => {
    setAccountBusy(true); setAccountError(''); setAccountStatus('Creating offline account...');
    try {
      await electron.accounts.createOffline(username);
      await syncAccounts();
      setAccountSetupOpen(false);
      setAccountStatus('');
      return true;
    } catch (error) {
      setAccountError(error.message || 'Unable to create account.');
      return false;
    } finally { setAccountBusy(false); }
  };

  const loginMicrosoftAccount = async () => {
    setAccountBusy(true); setAccountError(''); setAccountStatus('Opening Microsoft sign-in...');
    try {
      await electron.accounts.startMicrosoftLogin();
      await syncAccounts();
      setAccountSetupOpen(false);
      setAccountStatus('');
      return true;
    } catch (error) {
      setAccountError(error.message || 'Microsoft sign-in failed.');
      return false;
    } finally { setAccountBusy(false); }
  };

  const selectAccount = async id => {
    setAccountBusy(true); setAccountError('');
    try { await electron.accounts.select(id); await syncAccounts(); }
    catch (error) { setAccountError(error.message || 'Unable to select account.'); }
    finally { setAccountBusy(false); }
  };

  const removeAccount = async id => {
    setAccountBusy(true); setAccountError('');
    try {
      await electron.accounts.remove(id);
      const selected = await syncAccounts();
      if (!selected) setAccountManagerOpen(false);
    } catch (error) { setAccountError(error.message || 'Unable to remove account.'); }
    finally { setAccountBusy(false); }
  };

  const refreshMicrosoftAccount = async id => {
    setAccountBusy(true); setAccountError(''); setAccountStatus('Refreshing Microsoft session...');
    try { await electron.accounts.refreshMicrosoft(id); await syncAccounts(); setAccountStatus('Session refreshed.'); }
    catch (error) { setAccountError(error.message || 'Unable to refresh Microsoft session.'); }
    finally { setAccountBusy(false); }
  };

  const fetchInstalledVersions = async () => {
    try {
      const [installedResult, allResult] = await Promise.all([
        electron.getInstalledVersions(),
        electron.fetchAllVanillaVersions()
      ]);

      const vanillaRegex = /^\d+\.\d+(\.\d+)?$/;
      const loaders = ['Forge', 'Fabric', 'NeoForge', 'Quilt'];

      if (allResult.success && allResult.versions) {
        setAllVanillaVersions(allResult.versions.map(v => ({
          id: v,
          label: v,
          loaders: loaders,
          isMainline: true
        })));
      }

      if (installedResult.success && installedResult.versions) {
        const versions = installedResult.versions.map(v => {
          const isVanilla = vanillaRegex.test(v);
          return {
            id: v,
            label: v,
            loaders: isVanilla ? loaders : []
          };
        });
        setInstalledVersions(versions);
        if (versions.length > 0 && !selectedVersion) {
          setSelectedVersion(versions[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch versions:', err);
    }
  };

  useEffect(() => {
    fetchInstalledVersions();
  }, []);

  useEffect(() => {
    if (selectedVersion && !selectedVersion.loaders.includes(modLoader)) {
      setModLoader('vanilla');
    }
  }, [selectedVersion]);

  const openVersionDropdown = () => {
    if (versionBtnRef.current) {
      const rect = versionBtnRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    setVersionOpen(true);
  };

  useEffect(() => {
    const unsubProgress = electron.onLaunchProgress?.((progress) => {
      setLaunchProgress(Math.round(progress.percent || 0));
      const statusMap = { assets: 'Downloading assets...', classes: 'Preparing classes...', natives: 'Extracting natives...', download: 'Downloading files...' };
      if (statusMap[progress.type]) setLaunchStatus(statusMap[progress.type]);
    }) || (() => {});
    const unsubStarted = electron.onLaunchStarted?.(() => {
      setLaunchStatus('Game started!'); setLaunchProgress(100);
      setTimeout(() => { setIsLaunching(false); if (hideOnLaunch) electron.minimize(); }, 2000);
    }) || (() => {});
    const unsubFinished = electron.onLaunchFinished?.(() => {
      setIsLaunching(false); setLaunchProgress(0); setLaunchStatus('');
    }) || (() => {});
    const unsubLog = electron.onLog?.((log) => setLogs(p => [...p.slice(-100), log])) || (() => {});
    return () => { unsubProgress(); unsubStarted(); unsubFinished(); unsubLog(); };
  }, [hideOnLaunch]);

  useEffect(() => {
    if (activeTab === 'clients' && wonderlandClients.length === 0) {
      fetchWonderlandClients();
    }
  }, [activeTab]);

  useEffect(() => {
    if (!versionOpen) return;
    const handler = (e) => {
      if (versionBtnRef.current && !versionBtnRef.current.contains(e.target) && versionDropdownRef.current && !versionDropdownRef.current.contains(e.target)) {
        setVersionOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [versionOpen]);

  const fetchWonderlandClients = async () => {
    setLoadingWonderland(true);
    try {
      const result = await electron.fetchWonderlandClients();
      if (result.success) setWonderlandClients(result.clients);
    } catch (err) { console.error('Failed to fetch clients:', err); }
    setLoadingWonderland(false);
  };

  const handleDownloadClient = async (client) => {
    const key = client.name;
    setDownloadingClients(p => ({ ...p, [key]: 'downloading' }));
    setDownloadProgress(p => ({ ...p, [key]: 0 }));
    const unsubProgress = electron.onLaunchProgress?.((progress) => {
      if (progress.type === 'download' || progress.type === 'extract') {
        setDownloadProgress(p => ({ ...p, [key]: progress.percent || 0 }));
      }
    }) || (() => {});
    try {
      const result = await electron.downloadWonderlandClient(client);
      unsubProgress();
      if (result.success) {
        setDownloadingClients(p => ({ ...p, [key]: 'done' }));
        setDownloadProgress(p => ({ ...p, [key]: 100 }));
        markInstalled(key);
      } else {
        setDownloadingClients(p => ({ ...p, [key]: 'error' }));
        alert(`Download failed: ${result.error}`);
      }
    } catch (err) {
      unsubProgress();
      setDownloadingClients(p => ({ ...p, [key]: 'error' }));
      alert(`Download failed: ${err.message}`);
    }
  };

  const allClients = useMemo(() => {
    // 1. Process installed versions first
    const installed = installedVersions.map(v => ({
      name: v.label,
      desc: `Installed version ${v.label}`,
      version: v.label,
      icon: getClientIcon(v.label),
      color: getClientColor(v.label),
      tags: [],
      source: 'Installed',
      isInstalled: true,
    }));

    // Create a set of names for fast lookup to prevent duplicates
    const installedNames = new Set(installed.map(i => i.name.toLowerCase()));

    // 2. Process Wonderland clients, but filter out those already in 'installed'
    const wl = wonderlandClients
      .filter(c => !installedNames.has(c.name.toLowerCase()))
      .map(c => ({
        name: c.name,
        desc: c.name.match(/1\.\d+/)?.[0] ? `Version ${c.name.match(/1\.\d+(?:\.\d+)?/)[0]}` : 'Additional client',
        version: c.name.match(/1\.\d+(?:\.\d+)?/)?.[0] || '?',
        icon: getClientIcon(c.name),
        color: getClientColor(c.name),
        tags: [],
        source: c.source,
        link: c.link,
        isWonderland: true,
        raw: c,
      }));
    return [...installed, ...wl];
  }, [installedVersions, wonderlandClients]);

  const filteredClients = useMemo(() => {
    let list = allClients;
    if (clientFilter === 'installed') list = list.filter(c => c.isInstalled || installedClients.has(c.name));
    
    if (clientSearch.trim()) {
      const q = clientSearch.toLowerCase();
      list = list.filter(c => {
        const nameMatch = c.name.toLowerCase().includes(q);
        const tagMatch = c.tags?.some(t => t.toLowerCase().includes(q));
        // Only match on version if the query looks like a version number
        const versionMatch = /^\d+(\.\d+)?/.test(q) && c.version.includes(q);
        
        return nameMatch || tagMatch || versionMatch;
      });
    }
    return list;
  }, [allClients, clientFilter, clientSearch, installedClients]);

  useEffect(() => {
    localStorage.setItem('customJvmArgs', customJvmArgs);
  }, [customJvmArgs]);

  const handleLaunch = async () => {
    if (isLaunching || !selectedVersion) return;
    if (!selectedAccount) {
      setAccountSetupOpen(true);
      return;
    }
    setIsLaunching(true); setLaunchStatus('Initializing...'); setLaunchProgress(5); setLogs([]);
    try {
      const result = await electron.launchGame({
        version: selectedVersion.id,
        modLoader,
        ram: `${ram}G`,
        resolution,
        customJvmArgs,
      });
      if (!result.success) {
        if (result.code === 'ACCOUNT_REQUIRED') setAccountSetupOpen(true);
        alert(`Launch failed: ${result.error}`); setIsLaunching(false);
      }
    } catch (err) { alert(`Launch failed: ${err.message}`); setIsLaunching(false); }
  };

  const availableLoaders = selectedVersion?.loaders || [];
  const showLoaderPicker = availableLoaders.length > 0;

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif" }} className="flex flex-col h-screen overflow-hidden bg-[#0d0d14] text-white select-none">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
        *, *::before, *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #2d2d4a; border-radius: 4px; }
        .drag { -webkit-app-region: drag; } .no-drag { -webkit-app-region: no-drag; }
        @keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-8px); } }
        .float { animation: float 4s ease-in-out infinite; }
        .glow-purple { box-shadow: 0 0 30px rgba(139,92,246,0.25); }
        .nav-active { background: linear-gradient(90deg, rgba(139,92,246,0.2) 0%, rgba(139,92,246,0.05) 100%); border-left: 2px solid #8b5cf6; }
        .client-row:hover { background: rgba(139,92,246,0.07); }
        .client-row-selected { background: rgba(139,92,246,0.12) !important; border-color: rgba(139,92,246,0.4) !important; }
        .launch-btn { background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #5b21b6 100%); }
        .launch-btn:hover { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #6d28d9 100%); }
        .hero-bg { background: radial-gradient(ellipse 80% 60% at 60% 50%, rgba(109,40,217,0.18) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 80% 20%, rgba(59,130,246,0.1) 0%, transparent 60%); }
        .card-bg { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); }
        .version-dropdown { background: #13131f; border: 1px solid rgba(139,92,246,0.3); position: fixed; z-index: 9999; border-radius: 8px; padding: 4px 0; box-shadow: 0 8px 24px rgba(0,0,0,0.5); max-height: 250px; overflow-y: auto; }
        .search-input:focus { outline: none; border-color: rgba(139,92,246,0.5); background: rgba(139,92,246,0.05); }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        .progress-bar { transition: width 0.3s ease; }
        .tag { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 6px; border-radius: 4px; }
        .loader-btn { flex: 1; padding: 5px 4px; border-radius: 6px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.3); transition: all 0.15s; cursor: pointer; }
        .loader-btn:hover { color: rgba(255,255,255,0.65); background: rgba(255,255,255,0.06); }
        .loader-btn-active { background: rgba(139,92,246,0.22) !important; border-color: rgba(139,92,246,0.55) !important; color: #c4b5fd !important; }
        .installed-badge { display: flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 6px; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.25); color: #34d399; font-size: 10px; font-weight: 700; }
      `}</style>

      <div className="h-9 flex items-center justify-between px-4 bg-[#0a0a12] border-b border-white/5 drag shrink-0">
        <div className="flex items-center gap-2 no-drag">
          <span className="text-[11px] font-bold tracking-[0.15em] text-white/70 uppercase">Omega Launcher</span>
        </div>
        <div className="flex items-center no-drag">
          <button onClick={() => setShowConsole(!showConsole)} className="p-1.5 hover:bg-white/5 rounded transition-colors mr-1">
            <Terminal size={13} className={showConsole ? 'text-violet-400' : 'text-white/40'} />
          </button>
          <button onClick={() => electron.minimize()} className="p-1.5 hover:bg-white/5 rounded transition-colors"><Minus size={13} className="text-white/50" /></button>
          <button onClick={() => electron.maximize()} className="p-1.5 hover:bg-white/5 rounded transition-colors"><Square size={13} className="text-white/50" /></button>
          <button onClick={() => electron.close()} className="p-1.5 hover:bg-red-500/80 rounded transition-colors ml-1"><X size={13} className="text-white/50 hover:text-white" /></button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <aside className={`bg-[#0a0a12] flex flex-col border-r border-white/5 shrink-0 overflow-hidden transition-all duration-200 w-[200px]`}>
          
          <nav className="py-3 px-2 space-y-1 flex-1">
  {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
    const active = activeTab === id;

    return (
      <button
  key={id}
  onClick={() => setActiveTab(id)}
  className={`
    group relative flex items-center
    h-10 w-full
    px-3 rounded-lg
    transition-all duration-150
    ${activeTab === id
      ? "bg-white/5 text-white"
      : "text-white/35 hover:text-white/80 hover:bg-white/5"}
  `}
>
  {/* icon container ALWAYS fixed */}
  <div className="w-6 flex items-center justify-center shrink-0">
    <Icon
      size={15}
      className={
        activeTab === id
          ? "text-violet-400"
          : "text-white/30 group-hover:text-white/60"
      }
    />
  </div>

  {/* label (hidden in collapsed mode) */}
  <span className="ml-3 text-[12px] font-medium truncate">
  {label}
</span>

</button>
    );
  })}
</nav>
          <div className="p-3 border-t border-white/5">
  <AccountChip
  account={selectedAccount}
  onClick={() => {
    setAccountError('');
    setAccountStatus('');
    selectedAccount
      ? setAccountManagerOpen(true)
      : setAccountSetupOpen(true);
  }}
/>
</div>
          
        </aside>

        <main className="flex-1 min-w-0 overflow-hidden flex flex-col relative">
          {showConsole && (
            <div className="fixed inset-0 z-50 bg-[#0a0a12]/98 backdrop-blur flex flex-col p-4 font-mono text-[11px]">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-white/40 uppercase tracking-widest text-[10px]">Console</span>
                  <button onClick={() => setLogs([])} className="text-[9px] bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded text-white/40 uppercase font-bold">Clear</button>
                </div>
                <button onClick={() => setShowConsole(false)} className="text-white/30 hover:text-white"><X size={15} /></button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1">
                {logs.map((log, i) => (
                  <div key={i} className={`border-l-2 pl-2 ${log.type === 'error' ? 'border-red-500 text-red-400' : log.type === 'progress' ? 'border-violet-500 text-violet-400' : 'border-emerald-500 text-emerald-400'}`}>
                    <span className="opacity-40 mr-2">[{new Date().toLocaleTimeString()}]</span>{log.message}
                  </div>
                ))}
                <div ref={consoleEndRef} />
                {logs.length === 0 && <div className="text-white/20 italic">No logs yet.</div>}
              </div>
            </div>
          )}
{activeTab === 'home' && (
  <div className="flex-1 overflow-y-auto">

    {/* HERO */}
    <div
      className="relative border-b border-white/5"
      style={{
        backgroundImage:
          "linear-gradient(to bottom, rgba(8,8,12,.45), rgba(8,8,12,.92)), url('https://i.ibb.co/zHD9sGfn/backgroundomega.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        minHeight: "420px",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b0b12]/90 via-[#0b0b12]/60 to-transparent" />

      <div className="relative z-10 px-8 py-8 h-full flex flex-col justify-center">

        <div className="max-w-2xl">

          <div className="text-[25px] uppercase tracking-[0.25em] text-violet-400 font-semibold mb-3">
            Omega Launcher
          </div>

          <h1 className="text-5xl font-black text-white leading-none mb-3">
            For Minecraft
          </h1>

          <p className="text-sm text-white/50 max-w-lg mb-8 leading-relaxed">
            Launch vanilla, Forge, Fabric, NeoForge and custom clients
            from one clean launcher.
          </p>

          {/* ACTION BAR */}
          <div className="flex flex-wrap items-center gap-3">

            <button
              onClick={handleLaunch}
              disabled={isLaunching || !selectedVersion}
              className="launch-btn flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-[13px] transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              {isLaunching ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full spin" />
                  Launching...
                </>
              ) : (
                <>
                  <Play size={15} fill="currentColor" />
                  Launch Game
                </>
              )}
            </button>

            {/* VERSION PICKER */}
            <div className="relative no-drag">
              <button
                ref={versionBtnRef}
                onClick={() =>
                  versionOpen
                    ? setVersionOpen(false)
                    : openVersionDropdown()
                }
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-black/30 backdrop-blur border border-white/10 text-[12px] font-medium text-white/80 hover:text-white min-w-[180px] justify-between"
              >
                {selectedVersion
                  ? selectedVersion.label
                  : "Select Version"}

                <ChevronDown
                  size={14}
                  className={`transition-transform ${
                    versionOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {versionOpen && (
                <div
                  ref={versionDropdownRef}
                  className="version-dropdown"
                  style={{
                    top: dropdownPos.top,
                    left: dropdownPos.left,
                    minWidth: Math.max(
                      dropdownPos.width,
                      240
                    ),
                  }}
                >
                  <div className="px-3 py-2 text-[10px] font-bold text-white/25 uppercase">
                    Installed
                  </div>

                  {installedVersions.map(v => (
                    <button
                      key={v.id}
                      onClick={() => {
                        setSelectedVersion(v);
                        setModLoader("vanilla");
                        setVersionOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-[12px]
                      ${
                        selectedVersion?.id === v.id
                          ? "bg-violet-500/10 text-violet-400"
                          : "text-white/60 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}

                  <div className="px-3 py-2 text-[10px] font-bold text-white/25 uppercase border-t border-white/5 mt-1">
                    Releases
                  </div>

                  <div className="max-h-[180px] overflow-y-auto">
                    {allVanillaVersions.map(v => (
                      <button
                        key={v.id}
                        onClick={() => {
                          setSelectedVersion(v);
                          setModLoader("vanilla");
                          setVersionOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-[12px]
                        ${
                          selectedVersion?.id === v.id
                            ? "bg-violet-500/10 text-violet-400"
                            : "text-white/60 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
          onClick={() => setActiveTab("clients")}
        >
          <div className="launch-btn flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-[13px] transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
            Open Client Library
          </div>

        </button>

            {/* LOADERS */}
            {showLoaderPicker && (
              <div className="flex items-center gap-1 bg-black/30 backdrop-blur border border-white/10 rounded-xl p-1">
                <button
                  className={`loader-btn ${
                    modLoader === "vanilla"
                      ? "loader-btn-active"
                      : ""
                  }`}
                  onClick={() =>
                    setModLoader("vanilla")
                  }
                >
                  Vanilla
                </button>

                {availableLoaders.map(l => (
                  <button
                    key={l}
                    className={`loader-btn ${
                      modLoader === l
                        ? "loader-btn-active"
                        : ""
                    }`}
                    onClick={() => setModLoader(l)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* PROGRESS */}
          {isLaunching && (
            <div className="mt-6 max-w-md">
              <div className="flex justify-between text-[10px] text-white/50 mb-1">
                <span>{launchStatus}</span>
                <span>{launchProgress}%</span>
              </div>

              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 progress-bar"
                  style={{
                    width: `${launchProgress}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

  </div>
)}

          {activeTab === 'clients' && (
  <div className="flex-1 flex flex-col overflow-hidden">

    {/* HEADER */}
    <div className="px-8 py-5 border-b border-white/5 shrink-0">

      <div className="flex items-start justify-between">

        <div>
          <h1 className="text-xl font-semibold text-white">
            Clients
          </h1>

          <p className="text-[11px] text-white/30 mt-1">
            {filteredClients.length} clients • {installedVersions.length} installed
          </p>
        </div>

        <button
          onClick={fetchWonderlandClients}
          disabled={loadingWonderland}
          className="
            px-3 py-2
            rounded-lg
            bg-white/[0.04]
            border border-white/5
            text-[11px]
            text-white/60
            hover:text-white
            hover:bg-white/[0.06]
            transition
            disabled:opacity-40
          "
        >
          {loadingWonderland ? 'Refreshing…' : 'Refresh'}
        </button>

      </div>

      {/* SEARCH + FILTERS */}
      <div className="flex gap-2 mt-4">

        <input
          type="text"
          value={clientSearch}
          onChange={e => setClientSearch(e.target.value)}
          placeholder="Search clients..."
          className="
            flex-1
            px-3 py-2.5
            rounded-lg
            bg-white/[0.03]
            border border-white/5
            text-[12px]
            text-white
            placeholder:text-white/20
            outline-none
          "
        />

        <button
          onClick={() => setClientFilter('all')}
          className={`
            px-4 py-2.5 rounded-lg text-[11px] border transition
            ${
              clientFilter === 'all'
                ? 'bg-violet-500/15 border-violet-500/30 text-violet-300'
                : 'bg-white/[0.03] border-white/5 text-white/40 hover:text-white'
            }
          `}
        >
          All
        </button>

        <button
          onClick={() => setClientFilter('installed')}
          className={`
            px-4 py-2.5 rounded-lg text-[11px] border transition
            ${
              clientFilter === 'installed'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-white/[0.03] border-white/5 text-white/40 hover:text-white'
            }
          `}
        >
          Installed
        </button>

      </div>
    </div>

    {/* LIST */}
    <div className="flex-1 overflow-y-auto px-8 py-4">

      {loadingWonderland && wonderlandClients.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-white/30 text-sm">
          Loading clients...
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-white/25 text-sm">
          No clients found
        </div>
      ) : (

        <div className="space-y-2">

          {filteredClients.map(c => {

            const dlState = downloadingClients[c.name];
            const dlPct = downloadProgress[c.name] || 0;

            const isInstalled =
              c.isInstalled ||
              installedClients.has(c.name) ||
              dlState === 'done';

            return (

              <div
                key={c.name}
                onClick={() =>
                  setSelectedClient(
                    selectedClient === c.name ? null : c.name
                  )
                }
                className="
                  flex items-center justify-between
                  px-4 py-3
                  rounded-xl
                  bg-white/[0.02]
                  border border-white/5
                  hover:bg-white/[0.04]
                  transition
                  cursor-pointer
                "
              >

                {/* NAME */}
                <div className="min-w-0 flex-1">

                  <div className="flex items-center gap-2">

                    <span className="text-sm font-medium text-white truncate">
                      {c.name}
                    </span>

                    {isInstalled && (
                      <span className="text-[10px] text-emerald-400">
                        Installed
                      </span>
                    )}

                  </div>

                  <div className="text-[11px] text-white/30 truncate mt-0.5">
                    {c.desc}
                  </div>

                </div>

                {/* VERSION */}
                <div className="hidden md:block text-[11px] text-white/25 font-mono w-16 text-center">
                  {c.version !== '?' ? c.version : ''}
                </div>

                {/* ACTION */}
                <div className="w-36 flex justify-end">

                  {dlState === 'downloading' ? (

                    <div className="w-full">
                      <div className="text-[10px] text-violet-400 mb-1 text-right">
                        {dlPct}%
                      </div>

                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-violet-500"
                          style={{ width: `${dlPct}%` }}
                        />
                      </div>
                    </div>

                  ) : isInstalled ? (

                    <button
                      className="
                        px-3 py-1.5
                        rounded-lg
                        bg-emerald-500/10
                        border border-emerald-500/20
                        text-emerald-300
                        text-[11px]
                        font-medium
                      "
                    >
                      Installed
                    </button>

                  ) : (

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (c.isWonderland) handleDownloadClient(c.raw);
                      }}
                      className="
                        px-3 py-1.5
                        rounded-lg
                        bg-violet-500/10
                        border border-violet-500/20
                        text-violet-300
                        text-[11px]
                        font-medium
                        hover:bg-violet-500/15
                        transition
                      "
                    >
                      Download
                    </button>

                  )}

                </div>

              </div>

            );
          })}

        </div>

      )}

    </div>

    {/* FOOTER */}
    <div className="px-8 py-2 border-t border-white/5 text-[10px] text-white/20">
      {filteredClients.length} results
    </div>

  </div>
)}
          {activeTab === 'p2p' && <P2PTab />}

          {activeTab === 'settings' && (
            <div className="flex-1 overflow-y-auto p-8">
              <div className="mb-6">
                <h1 className="text-3xl font-black mb-1">Settings</h1>
                <p className="text-white/30 text-sm">Configure your launcher</p>
              </div>
              <div className="max-w-2xl">
                <div className="card-bg rounded-2xl p-5 space-y-4">
                  <h3 className="font-bold text-violet-400 text-[13px] uppercase tracking-wider flex items-center gap-2"><Settings size={15} /> Performance</h3>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase">RAM Allocation</label>
                      <span className="text-[11px] font-mono bg-white/5 border border-white/10 px-2 py-0.5 rounded">{ram}GB</span>
                    </div>
                    <input type="range" min="2" max="16" step="2" value={ram} onChange={e => setRam(e.target.value)}
                      className="w-full accent-violet-500 h-1 bg-white/10 rounded cursor-pointer appearance-none" />
                    <div className="flex justify-between mt-1">
                      {['2','4','6','8','10','12','14','16'].map(v => (
                        <span key={v} className="text-[8px] text-white/15 font-mono">{v}</span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-white/40 uppercase block mb-2">Resolution</label>
                    <select value={resolution} onChange={e => setResolution(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 transition-colors appearance-none text-white">
                      {['854x480', '1280x720', '1920x1080', '2560x1440'].map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <div className="text-[13px] font-medium">Hide on launch</div>
                      <div className="text-[10px] text-white/30">Minimize when game starts</div>
                    </div>
                    <button onClick={() => setHideOnLaunch(!hideOnLaunch)}
                      className={`w-9 h-5 rounded-full relative transition-colors ${hideOnLaunch ? 'bg-violet-600' : 'bg-white/10'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${hideOnLaunch ? 'right-0.5' : 'left-0.5'}`}></div>
                    </button>
                  </div>

                  <div className="pt-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase block mb-2">Custom JVM Arguments</label>
                    <textarea 
                      value={customJvmArgs}
                      onChange={e => setCustomJvmArgs(e.target.value)}
                      placeholder="-Dexample=true -Xss2M..."
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[11px] font-mono focus:outline-none focus:border-violet-500 transition-colors text-white h-20 resize-none"
                    />
                  </div>

                  <p className="text-[10px] text-white/20 pt-1 border-t border-white/5">
                    Mod loader is now selected on the home tab, next to the version picker.
                  </p>
                  <button onClick={() => electron.openGameFolder()}
                    className="w-full py-2 bg-white/5 hover:bg-white/8 border border-white/10 rounded-lg text-sm font-medium transition-colors">
                    Open game folder
                  </button>
                </div>
              </div>
            </div>
          )}

          {(activeTab === 'mods' || activeTab === 'profiles' || activeTab === 'changelog' || activeTab === 'discord' || activeTab === 'store') && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl mb-4 opacity-20">🚧</div>
                <div className="text-white/30 font-bold text-lg capitalize">{activeTab}</div>
                <div className="text-white/15 text-sm mt-1">Coming soon</div>
              </div>
            </div>
          )}

          <div className="h-7 bg-[#0a0a12] border-t border-white/5 px-6 flex items-center justify-between shrink-0">
            <span className="text-[10px] text-white/20 font-mono"></span>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div>
                <span className="text-[10px] text-emerald-400/70 font-medium">Up to date</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Wifi size={10} className="text-violet-400/60" />
                <span className="text-[10px] text-violet-400/60 font-medium">Ready</span>
              </div>
            </div>
          </div>
        </main>
      </div>

      <AccountSetupModal
        open={accountSetupOpen}
        busy={accountBusy}
        status={accountStatus}
        error={accountError}
        onCreateOffline={createOfflineAccount}
        onMicrosoft={loginMicrosoftAccount}
      />
      <AccountManagerModal
        open={accountManagerOpen && !accountSetupOpen}
        accounts={accounts}
        selected={selectedAccount}
        busy={accountBusy}
        status={accountStatus}
        error={accountError}
        onClose={() => { setAccountManagerOpen(false); setAccountError(''); setAccountStatus(''); }}
        onCreateOffline={createOfflineAccount}
        onMicrosoft={loginMicrosoftAccount}
        onSelect={selectAccount}
        onRemove={removeAccount}
        onRefresh={refreshMicrosoftAccount}
      />
    </div>
  );
}
