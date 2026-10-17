
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Home, Settings, Play, X, Minus, Square, ChevronDown,
  Puzzle, Rocket, Terminal, FolderOpen,
  IdCard, RefreshCw, ChevronRight, Gamepad2, Cpu
} from 'lucide-react';
import ModsTab from './components/ModsTab';
import TeleInstances from './components/TeleInstances';
import { CustomSelect } from './components/CustomSelect';
import { DownloadBubble } from './components/DownloadBubble';
import { UpdateBubble } from './components/UpdateBubble';
import { useDownloadTasks, updateLatestDownload } from './downloads';
import { ErrorBoundary } from './components/ErrorBoundary';
import { InstanceIcon } from './components/InstanceIcon';
import { FALLBACK_MC_VERSIONS, toVersionOptions } from './mcVersions';
import AccountManagerModal from './components/AccountManagerModal';
import AccountSetupModal from './components/AccountSetupModal';

const electron = window.electron || {
  minimize: () => console.log('Mock: Minimize'),
  maximize: () => console.log('Mock: Maximize'),
  close: () => console.log('Mock: Close'),
  launchGame: async (opts) => { console.log('Mock: Launch', opts); return { success: true }; },
  cancelLaunch: async () => { console.log('Mock: Cancel launch'); return { success: true, stopped: false }; },
  checkForUpdates: async () => ({ checked: false }),
  downloadUpdate: async () => ({ started: false }),
  installUpdate: async () => ({ installing: false }),
  onUpdate: () => () => {},
  onLaunchProgress: () => () => {},
  onLaunchFinished: () => () => {},
  onLaunchStarted: () => () => {},
  onLog: () => () => {},
  openGameFolder: () => console.log('Mock: Open folder'),
  openVersionsFolder: () => console.log('Mock: Open versions folder'),
  openModsFolder: () => console.log('Mock: Open mods folder'),
  accounts: {
    list: async () => JSON.parse(localStorage.getItem('accounts') || '[]'),
    getSelected: async () => {
      const selectedId = localStorage.getItem('selectedAccount');
      if (!selectedId) return null;
      const accounts = JSON.parse(localStorage.getItem('accounts') || '[]');
      return accounts.find(a => a.id === selectedId) || null;
    },
    createOffline: async (username) => {
      username = String(username || '').trim();
      if (!username) throw new Error('Username is required.');
      const accounts = JSON.parse(localStorage.getItem('accounts') || '[]');
      const existing = accounts.find(a => a.username.toLowerCase() === username.toLowerCase());
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
      localStorage.setItem('accounts', JSON.stringify(accounts));
      localStorage.setItem('selectedAccount', account.id);
      return account;
    },
    startMicrosoftLogin: async () => {
      throw new Error('Microsoft login requires the Electron version of Proc Launcher.');
    },
    cancelMicrosoftLogin: async () => ({ cancelled: true }),
    refreshMicrosoft: async (id) => {
      const accounts = JSON.parse(localStorage.getItem('accounts') || '[]');
      return accounts.find(a => a.id === id) || null;
    },
    select: async (id) => {
      const accounts = JSON.parse(localStorage.getItem('accounts') || '[]');
      const account = accounts.find(a => a.id === id);
      if (!account) throw new Error('Account not found.');
      localStorage.setItem('selectedAccount', id);
      return account;
    },
    remove: async (id) => {
      const accounts = JSON.parse(localStorage.getItem('accounts') || '[]');
      const filtered = accounts.filter(account => account.id !== id);
      localStorage.setItem('accounts', JSON.stringify(filtered));
      const selectedId = localStorage.getItem('selectedAccount');
      if (selectedId === id) {
        if (filtered.length > 0) {
          localStorage.setItem('selectedAccount', filtered[0].id);
        } else {
          localStorage.removeItem('selectedAccount');
        }
      }
      return true;
    },
    onMicrosoftStatus: (callback) => (() => {}),
    onMicrosoftCode: (callback) => (() => {})
  },

  getInstalledVersions: async () => ({ success: true, versions: [] }),
  getSystemMemory: async () => ({ totalGB: 8, freeGB: 4 }),
};
function SmoothRamSlider({ ram, setRam, max = 16 }) {
  const min = 2;
  const step = 1; // 1 GB increments

  const currentRam = Math.min(Number(ram) || min, max);
  const percentage = Math.min(Math.max(((currentRam - min) / (max - min)) * 100, 0), 100);

  const calculateValueFromPointer = (clientX, rect) => {
    const clickPos = (clientX - rect.left) / rect.width;
    const rawVal = min + clickPos * (max - min);
    const steppedVal = Math.round((rawVal - min) / step) * step + min;
    return Math.min(Math.max(steppedVal, min), max);
  };

  const handlePointerDown = (e) => {
    const trackElement = e.currentTarget;
    const rect = trackElement.getBoundingClientRect();
    
    setRam(calculateValueFromPointer(e.clientX, rect));

    const handlePointerMove = (moveEvent) => {
      setRam(calculateValueFromPointer(moveEvent.clientX, rect));
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <div className="w-full select-none">

      {/* Interactive Track Area with Drag Listener */}
      <div 
        onPointerDown={handlePointerDown}
        className="relative h-5 flex items-center cursor-pointer group touch-none"
      >
        {/* Track Background */}
        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden relative">
          {/* Solid White Fill */}
          <div 
            className="h-full bg-white rounded-full transition-all duration-150 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Pointer Thumb (No Glow, Solid Styling) */}
        <div 
          className="absolute w-4 h-4 bg-black rounded-full  transition-all duration-150 ease-out -translate-x-1/2 group-hover:scale-125 group-active:scale-110 pointer-events-none"
          style={{ left: `${percentage}%` }}
        />
      </div>

      {/* Scale Labels - each centered on its exact slider position */}
      <div className="relative h-4 mt-1 font-mono text-[13px] text-white/30">
        {(() => {
          const ticks = [];
          for (let v = min; v <= max; v *= 2) ticks.push(v);
          if (ticks[ticks.length - 1] !== max) ticks.push(max);
          return ticks.map(v => {
            const pct = ((v - min) / (max - min)) * 100;
            const align = v === min ? 'translateX(0)' : v === max ? 'translateX(-100%)' : 'translateX(-50%)';
            return <span key={v} className="absolute top-0 whitespace-nowrap" style={{ left: `${pct}%`, transform: align }}>{v}</span>;
          });
        })()}
      </div>
    </div>
  );
}

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'instances', label: 'Instances', icon: Gamepad2 },
  { id: 'clients', label: 'Versions', icon: Rocket },
  { id: 'mods', label: 'Mods', icon: Puzzle },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function InstanceSelector({ instances = [], activeInstanceId, onSelect, onManage }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const active = instances.find(i => i.id === activeInstanceId) || null;

  return (
    <div ref={ref} className="relative no-drag min-w-[190px]">
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-[16px] font-semibold transition-all duration-200
          ${open
            ? 'bg-white/10  text-white shadow-lg'
            : 'bg-white/5  text-white/90 hover:bg-white/10'}`}
      >
        <div className="flex items-center gap-2 truncate">
          {active ? (
            <InstanceIcon icon={active.icon} size={14} className="text-white/70 shrink-0" />
          ) : (
            <Gamepad2 size={14} className="text-white/50 shrink-0" />
          )}
          <span className="truncate">{active ? active.name : 'Select Instance'}</span>
        </div>
        <ChevronDown size={14} className={`text-white/50 transition-transform duration-200 ${open ? 'rotate-180 text-white/70' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 bottom-full mb-2 left-0 w-full min-w-[220px] bg-[#111111] rounded-xl shadow-2xl overflow-hidden">
          <div className="max-h-[200px] overflow-y-auto">
            {instances.length === 0 && (
              <div className="px-3.5 py-3 text-[16px] text-white/40">No instances yet</div>
            )}
            {instances.map(inst => (
              <button
                key={inst.id}
                onClick={() => { onSelect(inst.id); setOpen(false); }}
                className={`w-full text-left px-3.5 py-2 text-[16px] font-medium transition-colors flex items-center justify-between gap-2
                  ${activeInstanceId === inst.id ? 'bg-white/10 text-white font-semibold' : 'text-white/70 hover:bg-white/5'}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <InstanceIcon icon={inst.icon} size={14} className="text-white/60 shrink-0" />
                  <span className="truncate">{inst.name}</span>
                </span>
                <span className="text-[14px] text-white/40 font-mono shrink-0">{inst.minecraft_version || '?'}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => { setOpen(false); onManage?.(); }}
            className="w-full px-3.5 py-2 text-[15px] font-bold text-white/60 hover:text-white hover:bg-white/5 transition-colors text-left"
          >
            Manage instances →
          </button>
        </div>
      )}
    </div>
  );
}

const TELE_NAV_DOCKS = ['top', 'bottom', 'left', 'right'];

function TeleNavbar({ activeTab, onTab, account, onAccount }) {
  const [dock, setDock] = useState(() => {
    try {
      const saved = localStorage.getItem('teleNavDock');
      if (TELE_NAV_DOCKS.includes(saved)) return saved;
    } catch {}
    return 'top';
  });
  const [pos, setPos] = useState(null);
  const [dragging, setDragging] = useState(false);
  const wrapRef = useRef(null);
  const pillRef = useRef(null);
  const dragRef = useRef(null);
  const dockRef = useRef(dock);
  const [preview, setPreview] = useState(null);
  const previewRef = useRef(null);

  const vertical = preview
    ? (preview === 'left' || preview === 'right')
    : (dock === 'left' || dock === 'right');

  const isVerticalEdge = (edge) => edge === 'left' || edge === 'right';

  // Brief scale pop that masks the instant row<->column reflow.
  const pulse = () => {
    try {
      pillRef.current?.animate(
        [{ transform: 'scale(0.9)' }, { transform: 'scale(1)' }],
        { duration: 160, easing: 'ease-out' }
      );
    } catch {}
  };

  const applyPreview = (edge) => {
    const before = previewRef.current;
    if (before === edge) return;
    const wasV = before ? isVerticalEdge(before) : isVerticalEdge(dockRef.current);
    const willV = edge ? isVerticalEdge(edge) : isVerticalEdge(dockRef.current);
    previewRef.current = edge;
    setPreview(edge);
    if (wasV !== willV) pulse();
  };

  const snapDock = (next) => {
    if (dockRef.current === next) return;
    dockRef.current = next;
    setDock(next);
    try { localStorage.setItem('teleNavDock', next); } catch {}
  };

  // Docked resting spot for an edge, measured from the live pill size.
  const restFor = (edge) => {
    const host = wrapRef.current;
    const pill = pillRef.current;
    if (!host || !pill) return null;
    const W = host.clientWidth;
    const H = host.clientHeight;
    const pw = pill.offsetWidth;
    const ph = pill.offsetHeight;
    if (!W || !H || !pw || !ph) return null;
    const M = 12;
    if (edge === 'top') return { x: Math.round((W - pw) / 2), y: M };
    if (edge === 'bottom') return { x: Math.round((W - pw) / 2), y: Math.max(M, H - ph - M) };
    if (edge === 'left') return { x: M, y: Math.round((H - ph) / 2) };
    return { x: Math.max(M, W - pw - M), y: Math.round((H - ph) / 2) };
  };

  // Place before first paint so there's no flash or fly-in.
  useLayoutEffect(() => {
    const p = restFor(dockRef.current);
    if (p) setPos(p);
  }, []);

  // Glide to the docked spot whenever the dock changes outside a drag.
  useEffect(() => {
    if (dragRef.current) return;
    const p = restFor(dock);
    if (p) setPos(p);
  }, [dock]);

  // Stay docked across window resizes.
  useEffect(() => {
    const onResize = () => {
      if (dragRef.current) return;
      const p = restFor(dockRef.current);
      if (p) setPos(p);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const pill = pillRef.current;
    if (!pill) return;
    // Capture immediately so fast pulls from the pill edge never lose tracking.
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch {}
    const r = pill.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top, moved: false };
  };

  // One rAF-throttled pass per frame: follow target + edge-zone preview.
  const processDragMove = () => {
    const drag = dragRef.current;
    if (!drag?.moved) return;
    const host = wrapRef.current;
    const pill = pillRef.current;
    if (!host || !pill) return;
    const bounds = host.getBoundingClientRect();
    const cx = drag.x - bounds.left;
    const cy = drag.y - bounds.top;

    // Edge zones with hysteresis: enter within 140px, leave past 220px,
    // switch directly between edges on a decisive 30px margin.
    const dist = {
      top: cy,
      bottom: bounds.height - cy,
      left: cx,
      right: bounds.width - cx,
    };
    const [nearest, nearestDist] = Object.entries(dist).sort((a, b) => a[1] - b[1])[0];
    const cur = previewRef.current;
    if (!cur) {
      if (nearestDist < 140) applyPreview(nearest);
    } else if (cur) {
      const dCur = dist[cur];
      if (dCur > 220) applyPreview(null);
      else if (nearest !== cur && nearestDist < dCur - 30) applyPreview(nearest);
    }

    const pw = pill.offsetWidth;
    const ph = pill.offsetHeight;
    const VISIBLE = 48;
    setPos({
      x: Math.round(Math.min(Math.max(cx - drag.offX, VISIBLE - pw), bounds.width - VISIBLE)),
      y: Math.round(Math.min(Math.max(cy - drag.offY, VISIBLE - ph), bounds.height - VISIBLE)),
    });
  };

  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      setDragging(true);
    }
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.raf) {
      drag.raf = requestAnimationFrame(() => {
        drag.raf = 0;
        processDragMove();
      });
    }
  };

  const forwardTap = (e) => {
    // With pointer capture held, taps land on the pill itself - forward
    // them to whichever button is actually under the cursor.
    try {
      const el = document.elementFromPoint?.(e.clientX, e.clientY);
      el?.closest?.('button')?.click();
    } catch {}
  };

  const onPointerUp = (e) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!drag) return;
    if (drag.raf) cancelAnimationFrame(drag.raf);
    if (!drag.moved) {
      forwardTap(e);
      return;
    }
    // Snap to the closest edge on release; the dock effect glides there.
    // Orientation already matches the previewed edge in the common case,
    // otherwise pulse the flip.
    const host = wrapRef.current;
    if (host) {
      const bounds = host.getBoundingClientRect();
      const cx = e.clientX - bounds.left;
      const cy = e.clientY - bounds.top;
      const dist = {
        top: cy,
        bottom: bounds.height - cy,
        left: cx,
        right: bounds.width - cx,
      };
      const nearest = Object.entries(dist).sort((a, b) => a[1] - b[1])[0][0];
      const wasV = previewRef.current
        ? isVerticalEdge(previewRef.current)
        : isVerticalEdge(dockRef.current);
      previewRef.current = null;
      setPreview(null);
      snapDock(nearest);
      if (wasV !== isVerticalEdge(nearest)) pulse();
    } else {
      previewRef.current = null;
      setPreview(null);
    }
  };

  return (
    <div ref={wrapRef} className="absolute inset-0 z-30 pointer-events-none overflow-hidden">

    <div
      ref={pillRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        if (dragRef.current?.raf) cancelAnimationFrame(dragRef.current.raf);
        dragRef.current = null;
        setDragging(false);
        previewRef.current = null;
        setPreview(null);
        const p = restFor(dockRef.current);
        if (p) setPos(p);
      }}
      style={pos ? { left: pos.x, top: pos.y } : undefined}
      className={`${vertical ? 'flex-col px-1.5 py-1.5 rounded-[28px]' : 'flex-row pl-1.5 pr-1.5 py-1.5 rounded-full'} absolute flex items-center gap-1 bg-black/80 backdrop-blur-md shadow-2xl pointer-events-auto touch-none select-none transition-[left,top,transform] duration-150 ease-out ${dragging ? 'cursor-grabbing scale-[1.04]' : 'cursor-grab'} ${pos ? '' : 'invisible'}`}
    >
      <nav className={`${vertical ? 'flex-col' : 'flex-row'} flex items-center gap-1 overflow-x-auto min-w-0`}>
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTab(id)}
              title={label}
              className={`p-3 rounded-full transition-all shrink-0 flex items-center justify-center
                ${isActive ? 'bg-white text-black' : 'text-white/45 hover:text-white hover:bg-white/10'}`}
            >
              <Icon size={20} strokeWidth={2} />
            </button>
          );
        })}
      </nav>
      <div className={`${vertical ? 'h-px w-6 my-1' : 'w-px h-6 mx-1'} bg-white/10 shrink-0`} />
      <button
        onClick={onAccount}
        title={account?.username || 'Choose Account'}
        className="rounded-full hover:bg-white/10 transition-colors shrink-0"
      >
        {account ? (
          <img
            src={account.avatarUrl}
            alt=""
            className="w-9 h-9 rounded-full bg-[#111111] pointer-events-none"
            draggable={false}
            onError={(event) => {
              const img = event.currentTarget;
              if (!img.dataset.fbk) {
                img.dataset.fbk = '1';
                img.src = 'https://mc-heads.net/avatar/MHF_Steve/64';
              }
            }}
          />
        ) : (
          <span className="block w-9 h-9 rounded-full bg-white/10" />
        )}
      </button>
    </div>
    </div>
  );
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
  // Microsoft browser-step wait: which flow is pending + elapsed seconds.
  const [msFlow, setMsFlow] = useState(null);
  const [msElapsed, setMsElapsed] = useState(0);
  const [msCode, setMsCode] = useState('');
  const [msCopied, setMsCopied] = useState(false);
  const msTimer = useRef(null);
  const msCancelled = useRef(false);

  const startMsWait = (flow) => {
    msCancelled.current = false;
    setMsFlow(flow);
    setMsElapsed(0);
    setMsCode('');
    setMsCopied(false);
    clearInterval(msTimer.current);
    msTimer.current = setInterval(() => setMsElapsed(s => s + 1), 1000);
  };
  const stopMsWait = () => {
    clearInterval(msTimer.current);
    msTimer.current = null;
    setMsFlow(null);
  };
  useEffect(() => () => clearInterval(msTimer.current), []);

  const msElapsedText = `${Math.floor(msElapsed / 60)}:${String(msElapsed % 60).padStart(2, '0')}`;

  const cancelMicrosoftLogin = async () => {
    msCancelled.current = true;
    try { await electron.accounts.cancelMicrosoftLogin?.(); } catch {}
    stopMsWait();
    setAccountBusy(false);
    setMsCode('');
    setAccountStatus('Microsoft sign-in cancelled.');
  };

  const copyMsCode = async () => {
    if (!msCode) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(msCode);
      } else {
        throw new Error('clipboard unavailable');
      }
      setMsCopied(true);
      setTimeout(() => setMsCopied(false), 2000);
    } catch {
      setAccountError('Could not copy automatically - long-press the code to copy it manually.');
    }
  };
  const [installedVersions, setInstalledVersions] = useState([]);
  const [ram, setRam] = useState(() => localStorage.getItem('ramGB') || '4');
  const [systemMemory, setSystemMemory] = useState(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchProgress, setLaunchProgress] = useState(0);
  const [launchStatus, setLaunchStatus] = useState('');
  const [logs, setLogs] = useState([]);
  const [showConsole, setShowConsole] = useState(false);
  const [resolution, setResolution] = useState(() => localStorage.getItem('resolution') || '1280x720');
  const [hideOnLaunch, setHideOnLaunch] = useState(() => localStorage.getItem('hideOnLaunch') !== '0');
  const [customJvmArgs, setCustomJvmArgs] = useState(() => localStorage.getItem('customJvmArgs') || '');
  const [activeInstanceId, setActiveInstanceId] = useState(null);
  const [instances, setInstances] = useState([]);
  const [lastCrash, setLastCrash] = useState(null);
  const [prefs, setPrefs] = useState({ uiMode: 'tele', closeBehavior: 'quit', updateChannel: 'stable' });
  const [appVersion, setAppVersion] = useState('');
  const [updateInfo, setUpdateInfo] = useState({ state: 'idle' });
  const dlTasks = useDownloadTasks();
  const cancellingRef = useRef(false);
  const consoleEndRef = useRef(null);

  useEffect(() => {
    window.launcher?.getPrefs?.()
      .then(p => { if (p) setPrefs(prev => ({ ...prev, ...p })); })
      .catch(() => {});
    window.launcher?.getVersion?.()
      .then(v => { if (v) setAppVersion(v); })
      .catch(() => {});
  }, []);

  const updatePrefs = async (patch) => {
    setPrefs(prev => ({ ...prev, ...patch }));
    try {
      const next = await window.launcher?.setPrefs?.(patch);
      if (next) setPrefs(prev => ({ ...prev, ...next }));
    } catch (err) {
      console.error('Failed to save launcher preferences:', err);
    }
  };

  const [clientSearch, setClientSearch] = useState('');

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
    const offStatus = electron.accounts.onMicrosoftStatus?.(setAccountStatus) || (() => {});
    const offCode = electron.accounts.onMicrosoftCode?.((code) => { if (code) setMsCode(code); }) || (() => {});
    return () => { offStatus(); offCode(); };
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
    startMsWait('login');
    try {
      const res = await electron.accounts.startMicrosoftLogin();
      if (msCancelled.current || res?.cancelled) return false;
      await syncAccounts();
      setAccountSetupOpen(false);
      setAccountStatus('');
      setMsCode('');
      return true;
    } catch (error) {
      if (msCancelled.current) return false;
      setAccountError(error.message || 'Microsoft sign-in failed.');
      return false;
    } finally { setAccountBusy(false); stopMsWait(); }
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
    startMsWait('refresh');
    try {
      const res = await electron.accounts.refreshMicrosoft(id);
      if (msCancelled.current || res?.cancelled) return;
      await syncAccounts(); setAccountStatus('Session refreshed.'); setMsCode('');
    }
    catch (error) {
      if (msCancelled.current) return;
      setAccountError(error.message || 'Unable to refresh Microsoft session.');
    }
    finally { setAccountBusy(false); stopMsWait(); }
  };

  const fetchInstalledVersions = async () => {
    try {
      const [installedResult, allResult] = await Promise.all([
        electron.getInstalledVersions(),
        electron.fetchAllVanillaVersions ? electron.fetchAllVanillaVersions() : { success: true, versions: ['1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.8.9'] }
      ]);

      if (allResult?.success && allResult.versions) {
        setAllVanillaVersions(allResult.versions.map(v => ({
          id: v,
          label: v,
          loaders: [],
          isMainline: true
        })));
      } else {
        // Offline / manifest unreachable: fall back to a static recent list
        // so instance creation and version pickers keep working.
        setAllVanillaVersions(toVersionOptions(FALLBACK_MC_VERSIONS));
      }

      if (installedResult.success && installedResult.versions) {
        const locations = installedResult.locations || {};
        const versions = installedResult.versions.map(v => ({
          id: v,
          label: v,
          loaders: [],
          base: locations[v] || 'local'
        }));
        setInstalledVersions(versions);
      }
    } catch (err) {
      console.error('Failed to fetch versions:', err);
      setAllVanillaVersions(prev => (prev.length > 0 ? prev : toVersionOptions(FALLBACK_MC_VERSIONS)));
    }
  };

  const fetchInstances = async () => {
    try {
      const res = await electron.instance?.list();
      if (res?.success) setInstances(res.data || []);
      const sel = await electron.instance?.getSelected().catch(() => null);
      if (sel?.selectedId) setActiveInstanceId(prev => prev || sel.selectedId);
    } catch (err) {
      console.error('Failed to fetch instances:', err);
    }
  };

  // Boot splash + first loads are handled in the boot effect below.

  // Boot splash: fade out once the first loads settle (with a short minimum
  // display so the animation reads instead of flashing).
  useEffect(() => {
    const started = Date.now();
    let alive = true;
    const accountsP = syncAccounts().catch(error => {
      setAccountError(error.message || 'Unable to load accounts.');
      setAccountSetupOpen(true);
    });
    Promise.allSettled([accountsP, fetchInstalledVersions(), fetchInstances()])
      .finally(() => {
        if (!alive) return;
        const wait = Math.max(0, 900 - (Date.now() - started));
        setTimeout(() => {
          const el = document.getElementById('boot-splash');
          if (el) {
            if (window.__bootTimer) clearInterval(window.__bootTimer);
            el.classList.add('done');
            setTimeout(() => el.remove(), 320);
          }
        }, wait);
      });
    return () => { alive = false; };
  }, []);

  // Keep the home deck's instance list fresh after managing instances.
  useEffect(() => {
    if (activeTab === 'home') fetchInstances();
  }, [activeTab]);

  useEffect(() => {
    const unsubProgress = electron.onLaunchProgress?.((progress) => {
      setLaunchProgress(Math.round(progress.percent || 0));
      const statusMap = { assets: 'Downloading assets...', classes: 'Preparing classes...', natives: 'Extracting natives...', download: 'Downloading files...' };
      if (statusMap[progress.type]) setLaunchStatus(statusMap[progress.type]);
      // Feed the global download bubble (stays visible on every page).
      if (progress?.type === 'mod-download' && typeof progress.percent === 'number') {
        updateLatestDownload('mod', progress.percent, 'Downloading mod…');
      } else if (progress?.type === 'instance-upgrade' && typeof progress.percent === 'number') {
        updateLatestDownload('upgrade', progress.percent, 'Upgrading instance…');
      }
    }) || (() => {});
    const unsubStarted = electron.onLaunchStarted?.(() => {
      setLaunchStatus('Game started!'); setLaunchProgress(100);
      setTimeout(() => { setIsLaunching(false); if (hideOnLaunch) electron.minimize(); }, 2000);
    }) || (() => {});
    const unsubFinished = electron.onLaunchFinished?.((code) => {
      const wasCancelling = cancellingRef.current;
      cancellingRef.current = false;
      setIsLaunching(false); setLaunchProgress(0); setLaunchStatus('');
      if (!wasCancelling && code !== 0 && code !== null && code !== undefined) {
        setLastCrash({
          title: 'Minecraft exited unexpectedly',
          message: `The game closed with exit code ${code}. A broken mod is the most common cause - check the logs below or try disabling recently added mods.`,
        });
      }
    }) || (() => {});
    const unsubLog = electron.onLog?.((log) => setLogs(p => [...p.slice(-100), log])) || (() => {});
    return () => { unsubProgress(); unsubStarted(); unsubFinished(); unsubLog(); };
  }, [hideOnLaunch]);

  // Custom clients only: fabric-loader profiles are managed by instances,
  // everything else in versions/ (CM Client, CheatBreaker, vanilla, …) runs here.
  // Runs use the standard vanilla .minecraft folder, just like the vanilla launcher.
  const allClients = useMemo(() => {
    return installedVersions
      .filter(v => !/^fabric-loader-/i.test(v.label))
      .map(v => ({
        name: v.label,
        desc: `Version ${v.label}`,
        version: v.label,
        tags: [],
        source: v.base === 'vanilla' ? 'Vanilla versions folder' : 'Versions folder',
        isInstalled: true,
        base: v.base || 'local',
      }));
  }, [installedVersions]);

  const filteredClients = useMemo(() => {
    let list = allClients;
    if (clientSearch.trim()) {
      const q = clientSearch.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.version.includes(q));
    }
    return list;
  }, [allClients, clientSearch]);

  useEffect(() => {
    localStorage.setItem('customJvmArgs', customJvmArgs);
  }, [customJvmArgs]);

  useEffect(() => {
    localStorage.setItem('ramGB', ram);
  }, [ram]);

  useEffect(() => {
    localStorage.setItem('resolution', resolution);
  }, [resolution]);

  useEffect(() => {
    localStorage.setItem('hideOnLaunch', hideOnLaunch ? '1' : '0');
  }, [hideOnLaunch]);

  // Max allocatable RAM = rounded total system memory, so a 12 GB PC
  // offers 12 GB. Warnings (not a hard reserve) steer users away from the top.
  const maxRamFor = (totalGB) => Math.max(4, Math.round(Number(totalGB) || 0));
  const ramMax = systemMemory?.totalGB ? maxRamFor(systemMemory.totalGB) : 16;

  // Detect real system memory once; clamp a stale saved value into range.
  useEffect(() => {
    electron.getSystemMemory?.()
      .then(m => {
        if (m && Number(m.totalGB) > 0) {
          setSystemMemory(m);
          const cap = maxRamFor(m.totalGB);
          setRam(prev => {
            const v = Number(prev) || 4;
            return String(Math.min(Math.max(v, 2), cap));
          });
        }
      })
      .catch(() => {});
  }, []);

  // Self-update circle: available -> downloading(%) -> downloaded | error.
  useEffect(() => {
    return electron.onUpdate?.((info) => {
      if (info) setUpdateInfo(info);
    }) || (() => {});
  }, []);

  const checkUpdates = async () => {
    setUpdateInfo({ state: 'checking' });
    try {
      const res = await electron.checkForUpdates?.();
      if (!res?.checked) setUpdateInfo({ state: 'idle' });
    } catch (err) {
      setUpdateInfo({ state: 'error', error: err.message || 'Update check failed.' });
    }
  };

  const handleUpdateAction = async (state) => {
    try {
      if (state === 'available') {
        setUpdateInfo(prev => ({ ...prev, state: 'downloading', percent: 0 }));
        await electron.downloadUpdate?.();
      } else if (state === 'downloaded') {
        await electron.installUpdate?.();
      }
    } catch (err) {
      setUpdateInfo({ state: 'error', error: err.message || 'Update failed.' });
    }
  };
  // Cancel an in-progress launch: stops downloads from spawning a game
  // and kills the game process if it's already running.
  const cancelLaunch = async () => {    cancellingRef.current = true;
    try { await electron.cancelLaunch?.(); } catch {}
    setIsLaunching(false); setLaunchProgress(0); setLaunchStatus('');
  };

  // Folder buttons: the main process returns { success } - surface a
  // failure instead of silently doing nothing.
  const openFolder = (fn, label) => async () => {
    try {
      const res = await fn?.();
      if (res && res.success === false) {
        setLogs(p => [...p.slice(-100), { type: 'error', message: `Couldn't open ${label}: ${res.error}` }]);
        setLastCrash({ title: `Couldn't open ${label}`, message: res.error || 'The system file browser reported an error.' });
      }
    } catch (err) {
      setLastCrash({ title: `Couldn't open ${label}`, message: err.message || 'Unknown error.' });
    }
  };

  const handleLaunchResult = (result) => {
    if (!result.success) {
      if (result.code === 'ACCOUNT_REQUIRED') setAccountSetupOpen(true);
      if (result.code === 'SESSION_EXPIRED') {
        setLastCrash({ title: 'Microsoft session expired', message: result.error || 'Refresh your Microsoft account, then launch again.' });
        setIsLaunching(false);
        setAccountManagerOpen(true);
        return;
      }
      if (result.code === 'CANCELLED') { setIsLaunching(false); setLaunchProgress(0); setLaunchStatus(''); return; }
      if (result.code === 'ALREADY_LAUNCHING') return;
      setLastCrash({ title: 'Launch failed', message: result.error || 'Unknown error.' });
      setIsLaunching(false);
    }
  };

  // Run a custom client version straight from the versions folder.
  // Uses the standard vanilla .minecraft folder (configs, saves, mods),
  // global performance settings, and no instance isolation.
  const runClientVersion = async (client) => {
    if (isLaunching || !client) return;
    if (!selectedAccount) {
      setAccountSetupOpen(true);
      return;
    }
    setActiveTab('home');
    setIsLaunching(true); setLaunchStatus(`Starting ${client.name}...`); setLaunchProgress(5); setLogs([]);
    try {
      const result = await electron.launchGame({
        version: client.name,
        modLoader: 'fabric',
        versionBase: client.base || 'local',
        ram: `${ram}G`,
        resolution,
        customJvmArgs,
      });
      handleLaunchResult(result);
    } catch (err) { setLastCrash({ title: 'Launch failed', message: err.message }); setIsLaunching(false); }
  };

  const runActiveInstance = async () => {
    if (isLaunching) return;
    const target = instances.find(i => i.id === activeInstanceId);
    if (!target) {
      setActiveTab('instances');
      return;
    }
    await runInstance(target);
  };

  const activeInstance = instances.find(i => i.id === activeInstanceId) || null;

  // Instant-run an instance: RAM/resolution always come from global Settings;
  // per-instance JVM args override the global value when non-empty (whitespace = empty).
  const runInstance = async (instance) => {
    if (isLaunching) return;
    if (!instance?.minecraft_version) {
      setLastCrash({ title: 'Cannot launch', message: 'This instance has no Minecraft version set. Edit it to pick one.' });
      return;
    }
    if (!selectedAccount) {
      setAccountSetupOpen(true);
      return;
    }
    setActiveInstanceId(instance.id);
    try { await electron.instance?.select(instance.id); } catch {}
    setActiveTab('home');
    setIsLaunching(true); setLaunchStatus(`Starting ${instance.name}...`); setLaunchProgress(5); setLogs([]);
    try {
      let record = instance;
      try {
        const res = await electron.instance?.get(instance.id);
        if (res?.success && res.data) record = res.data;
      } catch {}
      const result = await electron.launchGame({
        version: record.minecraft_version,
        modLoader: 'fabric',
        instanceId: instance.id,
        ram: `${ram}G`,
        resolution,
        customJvmArgs: (record.customJvmArgs ?? '').trim() ? record.customJvmArgs : customJvmArgs,
      });
      handleLaunchResult(result);
    } catch (err) { setLastCrash({ title: 'Launch failed', message: err.message }); setIsLaunching(false); }
  };

  const browseModsForInstance = async (instanceId) => {
    setActiveInstanceId(instanceId);
    try { await electron.instance?.select(instanceId); } catch {}
    setActiveTab('mods');
  };

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif" }} className="flex flex-col h-screen overflow-hidden bg-[#0a0a0a] text-white select-none">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; height: 5px; } 
        ::-webkit-scrollbar-track { background: transparent; } 
        ::-webkit-scrollbar-thumb { background: #262626; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #3d3d3d; }
        .drag { -webkit-app-region: drag; } .no-drag { -webkit-app-region: no-drag; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        .glass-panel {
          background: rgba(18, 18, 28, 0.65);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }
        .glass-panel-hover:hover {
          background: rgba(28, 28, 42, 0.8);
        }
      `}</style>

      {/* Title Bar */}
      <div className="h-9 flex items-center justify-between px-4 bg-black/50 drag shrink-0 z-30">
        <div className="flex items-center gap-2">
          <Cpu size={13} className="text-white/60" />
          <span className="text-[15px] font-bold tracking-[0.18em] text-white/80 uppercase">Proc Launcher</span>
        </div>
        <div className="flex items-center gap-1 no-drag">
          <button onClick={() => setShowConsole(!showConsole)} className="p-1.5 hover:bg-white/10 rounded-md transition-colors" title="Toggle Console">
            <Terminal size={13} className={showConsole ? 'text-white/70' : 'text-white/40'} />
          </button>
          <button onClick={() => electron.minimize()} className="p-1.5 hover:bg-white/10 rounded-md transition-colors"><Minus size={13} className="text-white/50" /></button>
          <button onClick={() => electron.maximize()} className="p-1.5 hover:bg-white/10 rounded-md transition-colors"><Square size={13} className="text-white/50" /></button>
          <button onClick={() => electron.close()} className="p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded-md transition-colors"><X size={13} className="text-white/50" /></button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        <TeleNavbar
          activeTab={activeTab}
          onTab={setActiveTab}
          account={selectedAccount}
          onAccount={() => selectedAccount ? setAccountManagerOpen(true) : setAccountSetupOpen(true)}
        />
        {/* Classic icon-rail sidebar removed - the Telegram navbar above is the only navigation. */}

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 overflow-hidden flex flex-col relative bg-[#0a0a0a]">
          {/* Console Modal Overlay */}
          {showConsole && (
            <div className="fixed inset-0 z-50 bg-black/95 flex flex-col p-4 font-mono text-[15px]">
              <div className="flex items-center justify-between mb-3 pb-2 ">
                <div className="flex items-center gap-2">
                  <Terminal size={14} className="text-white/60" />
                  <span className="font-bold text-white/80 uppercase tracking-wider text-[15px]">System Output Console</span>
                </div>
                <button onClick={() => setShowConsole(false)} className="text-white/40 hover:text-white p-1 rounded hover:bg-white/10"><X size={16} /></button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1 pr-2">
                {logs.length === 0 ? (
                  <div className="text-white/30 italic">No console logs available. Launch a version to see output.</div>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className={`pl-2 py-0.5 ${log.type === 'error' ? 'text-red-400 bg-red-950/10' : log.type === 'progress' ? 'text-white/80 bg-white/5' : 'text-green-400'}`}>
                      <span className="opacity-40 font-sans text-[14px]">[{new Date().toLocaleTimeString()}]</span> {log.message}
                    </div>
                  ))
                )}
                <div ref={consoleEndRef} />
              </div>
            </div>
          )}

          {/* HOME TAB - REWORKED UI & UX */}
{activeTab === 'home' && (
            <div className="flex-1 overflow-y-auto flex flex-col">
              {/* Hero Banner - Minimal Black/White */}
              <div
                className="relative min-h-[300px] flex flex-col justify-end items-center p-8 overflow-hidden bg-[#0a0a0a]"
              >
                {/* Center Title & Core Launch Control Hub */}
                <div className="relative z-10 max-w-3xl w-full my-auto flex flex-col items-center text-center">

                  <Cpu size={72} className="text-white/90 mt-10 mb-5" strokeWidth={1.5} />
                  <h1 className="text-5xl font-black text-white tracking-tight leading-tight mb-3">
                    PROC <span className="text-white">LAUNCHER</span>
                  </h1>
                  <p className="text-base text-white/40 max-w-xl leading-relaxed mb-5 font-normal">
                  A minimal Fabric-only Minecraft launcher.
                  </p>

                  {lastCrash && (
                    <div className="mb-3 max-w-2xl w-full mx-auto rounded-xl bg-red-500/10 p-3.5 text-left">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[16px] font-bold text-red-300">{lastCrash.title}</div>
                          <div className="text-[16px] text-red-200/70 truncate mt-0.5">{lastCrash.message}</div>
                        </div>
                        <button onClick={() => setLastCrash(null)} className="p-1 rounded-md text-red-300/60 hover:text-red-200 hover:bg-white/10 shrink-0" title="Dismiss">
                          <X size={14} />
                        </button>
                      </div>
                      <div className="flex gap-2 mt-2.5">
                        <button
                          onClick={() => {
                            const text = logs.map(l => `[${l.type}] ${l.message}`).join('\n') || lastCrash.message;
                            if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => {});
                          }}
                          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[15px] font-semibold text-white transition-colors"
                        >
                          Copy logs
                        </button>
                        <button
                          onClick={() => { setLastCrash(null); setShowConsole(true); }}
                          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[15px] font-semibold text-white transition-colors"
                        >
                          Open console
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Integrated Glass Launch Deck */}
                  <div className="p-3.5 rounded-2xl bg-white/5 shadow-2xl flex flex-wrap items-center justify-center gap-3 max-w-2xl w-full mx-auto">
                    {/* Primary Big PLAY Button - borderless, no background */}
<button
  onClick={runActiveInstance}
  disabled={isLaunching}
  title={activeInstanceId ? 'Launch the active instance' : 'Pick an instance first'}
  className={`relative flex-1 min-w-[200px] h-12 rounded-xl font-bold text-[16px] tracking-wide flex items-center justify-center gap-2.5 transition-all duration-200 overflow-hidden
    ${isLaunching 
      ? 'bg-white/10 text-white cursor-not-allowed' 
      : 'bg-transparent text-white hover:bg-white/10 active:scale-[0.99]'}`}
>
  {isLaunching ? (
    <div className="flex items-center gap-2.5">
      {/* SVG Circular Ring Loader - brightened for readability on dark */}
      <div className="relative flex items-center justify-center w-7 h-7 shrink-0">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
          {/* Track Background */}
          <path
            className="text-white/25"
            strokeWidth="3.5"
            stroke="currentColor"
            fill="none"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
          {/* Animated Progress Arc */}
          <path
            className="text-white transition-all duration-300 ease-out"
            strokeDasharray={`${launchProgress}, 100`}
            strokeWidth="3.5"
            strokeLinecap="round"
            stroke="currentColor"
            fill="none"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
        </svg>
        {/* Center Percentage Display */}
        <span className="absolute font-mono text-[8px] leading-none font-bold text-white">
          {launchProgress}%
        </span>
      </div>

      {/* Dynamic Launch Status Label */}
      <span className="truncate max-w-[150px] text-white">
        {launchStatus || 'Launching...'}
      </span>
    </div>
  ) : (
    <>
      <Play size={20} fill="currentColor" className="text-white" />
      <span>PLAY MINECRAFT</span>
    </>
  )}
</button>
{isLaunching && (
  <button
    onClick={cancelLaunch}
    title="Cancel launch"
    className="h-12 w-12 rounded-xl bg-white/5 hover:bg-red-500/20 flex items-center justify-center transition-colors shrink-0"
  >
    <X size={16} className="text-white/60" />
  </button>
)}

                    {/* Instance Selector */}
                    <InstanceSelector
                      instances={instances}
                      activeInstanceId={activeInstanceId}
                      onSelect={(id) => {
                        setActiveInstanceId(id);
                        electron.instance?.select(id).catch(() => {});
                      }}
                      onManage={() => setActiveTab('instances')}
                    />

                    
                  </div>

                </div>
              </div>

{/* Lower Dashboard Grid */}
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5 flex-2 max-w-4xl mx-auto w-full">
                {/* Card 1: Active Profile & Account Status */}
                <div className="bg-white/5 rounded-2xl p-4 flex flex-col justify-between hover:bg-white/10 transition-all">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <IdCard size={16} className="text-white/60" />
                        <span className="text-[16px] font-bold uppercase tracking-wider text-white/80">Active Profile</span>
                      </div>
                      <span className="text-[14px] font-mono px-2 py-0.5 rounded bg-white/10 text-white/60">
                        {selectedAccount?.type || 'Guest'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 p-3 rounded-xl bg-black/30 mb-3">
                      <img 
                        src={selectedAccount?.avatarUrl || selectedAccount?.avatar || "https://minotar.net/avatar/steve/64"} 
                        alt="Avatar" 
                        className="w-12 h-12 rounded-lg bg-black/40"
                        onError={(event) => {
                          const img = event.currentTarget;
                          if (!img.dataset.fbk) {
                            img.dataset.fbk = '1';
                            img.src = 'https://mc-heads.net/avatar/MHF_Steve/64';
                          }
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-base font-bold text-white truncate">
                          {selectedAccount?.username || 'No Account Selected'}
                        </div>
                        <div className="text-[15px] text-white/40 truncate">
                          {selectedAccount ? `Ready to launch Minecraft` : 'Click to setup profile'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={() => selectedAccount ? setAccountManagerOpen(true) : setAccountSetupOpen(true)}
                    className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-[16px] font-semibold text-white/80 transition-colors flex items-center justify-center gap-2"
                  >
                    <span>Manage Accounts</span>
                    <ChevronRight size={14} className="text-white/40" />
                  </button>
                </div>

                {/* Card 2: Active Instance */}
                <div className="bg-white/5 rounded-2xl p-4 flex flex-col justify-between hover:bg-white/10 transition-all">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Gamepad2 size={16} className="text-white/60" />
                        <span className="text-[16px] font-bold uppercase tracking-wider text-white/80">Active Instance</span>
                      </div>
                      {activeInstance?.minecraft_version && (
                        <span className="text-[14px] font-mono px-2 py-0.5 rounded bg-white/5 text-white/60">
                          MC {activeInstance.minecraft_version}
                        </span>
                      )}
                    </div>

                    {activeInstance ? (
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-black/30 mb-3">
                        <div className="w-12 h-12 rounded-lg bg-black/40 flex items-center justify-center shrink-0">
                          <InstanceIcon icon={activeInstance.icon} size={22} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-base font-bold text-white truncate">
                            {activeInstance.name}
                          </div>
                          <div className="text-[15px] text-white/40 truncate">
                            Fabric {activeInstance.loader_version || 'latest'} • {activeInstance.enabledCount ?? activeInstance.modCount ?? 0} mods enabled
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-black/30 mb-4 text-center">
                        <div className="text-[16px] font-semibold text-white/60">No instance selected</div>
                        <div className="text-[15px] text-white/40">Create one to start playing</div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveTab('instances')}
                      className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-[15px] font-semibold text-white/80 transition-colors flex items-center justify-center gap-2"
                    >
                      <span>{activeInstance ? 'Manage Instances' : 'Create Instance'}</span>
                      <ChevronRight size={14} className="text-white/40" />
                    </button>
                    {activeInstance && (
                      <button
                        onClick={runActiveInstance}
                        disabled={isLaunching}
                        className="flex-1 py-2.5 rounded-xl bg-transparent hover:bg-white/10 text-[15px] font-bold text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
                      >
                        <Play size={16} fill="currentColor" />
                        <span>Run Minecraft</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* OTHER TABS */}
          {activeTab === 'clients' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-8 py-5 shrink-0">
                <div className="flex items-center justify-between gap-4">
                  <div>
                <h1 className="text-2xl font-semibold text-white">Versions</h1>
                <p className="text-[15px] text-white/30 mt-1">{filteredClients.length} version{filteredClients.length === 1 ? '' : 's'} • drop versions into the vanilla versions folder to add more</p>
                  </div>
                  <button
                    onClick={openFolder(() => electron.openVersionsFolder?.(), 'versions folder')}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-[15px] font-medium text-white/70 hover:text-white transition-all shrink-0"
                  >
                    <FolderOpen size={13} className="text-white/60" />
                    Versions Folder
                  </button>
                </div>

                <div className="flex gap-2 mt-4">
                  <input type="text" value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                    placeholder="Search versions..." className="flex-1 px-3.5 py-2.5 rounded-xl bg-white/5 text-[16px] text-white placeholder:text-white/20 transition-colors outline-none" />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-8 py-4">
                {filteredClients.length === 0 ? (
                  clientSearch.trim() ? (
                    <div className="flex items-center justify-center h-40 text-white/25">No versions found</div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-60 gap-3 text-center">
                      <div className="text-white/50 text-base font-semibold">No custom versions installed</div>
                      <div className="text-white/30 text-[16px] max-w-sm">Drop a version (CM Client, CheatBreaker, …) into your versions folder, then run it from here.</div>
                      <button
                        onClick={() => electron.openVersionsFolder?.()}
                        className="mt-1 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-black text-[16px] font-bold hover:bg-white/90 transition-colors"
                      >
                        <FolderOpen size={14} />
                        Open Versions Folder
                      </button>
                    </div>
                  )
                ) : (
                  <div className="space-y-2">
                    {filteredClients.map(c => (
                      <div key={c.name} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-base font-medium text-white truncate">{c.name}</span>
                            {c.isInstalled && <span className="text-[14px] font-bold px-2 py-0.5 rounded bg-green-500/20 text-green-400 shrink-0">Installed</span>}
                          </div>
                          <div className="text-[15px] text-white/30 mt-0.5 truncate">{c.desc}</div>
                        </div>
                        <button
                          onClick={() => runClientVersion(c)}
                          disabled={isLaunching}
                          className="px-3.5 py-1.5 rounded-xl bg-white text-black text-[15px] font-bold hover:bg-white/90 transition-colors disabled:opacity-40 flex items-center gap-1.5 shrink-0"
                        >
                          <Play size={12} fill="currentColor" />
                          Run
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'mods' && <ModsTab instanceId={activeInstanceId} />}

          {activeTab === 'settings' && (
            <div className="flex-1 overflow-y-auto p-8">
              <h1 className="text-4xl font-black mb-2">Settings</h1>
              <p className="text-white/30 text-base mb-6">Configure your launcher preferences</p>

              <div className="max-w-2xl space-y-4">
                <div className="rounded-2xl p-6 bg-white/5">
                  <h3 className="font-bold text-white/70 text-[16px] uppercase tracking-wider mb-1">Game</h3>
                  <p className="text-[14px] text-white/30 mb-4">Applies to every instance and version.</p>

                  <div className="space-y-5">
                    <div>
                      <div className="flex justify-between mb-2">
                        <label className="text-[15px] font-bold text-white/50 uppercase">RAM Allocation</label>
                        <span className="text-[15px] font-mono bg-white/5 px-2 py-0.5 rounded">{ram} GB</span>
                      </div>
                     <SmoothRamSlider ram={ram} setRam={setRam} max={ramMax} />
                      {systemMemory?.totalGB ? (
                        <p className="text-[14px] text-white/30 mt-1.5">
                          Your PC has {Number(systemMemory.totalGB).toFixed(1)} GB total
                          {Number(systemMemory.freeGB) > 0 ? ` • ${Number(systemMemory.freeGB).toFixed(1)} GB free right now` : ''}.
                        </p>
                      ) : (
                        <p className="text-[14px] text-white/30 mt-1.5">Detecting system memory…</p>
                      )}
                      {systemMemory?.totalGB && Number(ram) >= maxRamFor(systemMemory.totalGB) && (
                        <p className="text-[14px] text-red-300/90 mt-1">This leaves almost nothing for Windows - expect stuttering or crashes.</p>
                      )}
                      {systemMemory?.totalGB && Number(ram) > Number(systemMemory.totalGB) * 0.75 && Number(ram) < maxRamFor(systemMemory.totalGB) && (
                        <p className="text-[14px] text-amber-300/80 mt-1">Over 75% of your system memory - leave room for Windows or the game may stutter.</p>
                      )}
                    </div>

                    <div>
                      <label className="text-[15px] font-bold text-white/50 uppercase block mb-2">Resolution</label>
                      <CustomSelect
                        value={resolution}
                        onChange={setResolution}
                        options={['854x480', '1280x720', '1920x1080', '2560x1440'].map(r => ({ value: r, label: r }))}
                      />
                    </div>

                    <div>
                      <label className="text-[15px] font-bold text-white/50 uppercase block mb-2">Custom JVM Arguments</label>
                      <textarea value={customJvmArgs} onChange={e => setCustomJvmArgs(e.target.value)}
                        placeholder="-Dexample=true -Xss2M..."
                        className="w-full bg-white/5 rounded-xl px-3.5 py-2.5 text-[15px] font-mono text-white h-24 resize-none focus:outline-none" />
                      <p className="text-[14px] text-white/30 mt-1.5">Default for all instances and versions. A non-empty instance value replaces this.</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl p-6 bg-white/5">
                  <h3 className="font-bold text-white/70 text-[16px] uppercase tracking-wider mb-4">Launcher</h3>

                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[16px] font-semibold text-white/90">Hide on launch</div>
                        <div className="text-[15px] text-white/40">Minimize launcher window when the game starts</div>
                      </div>
                      <button onClick={() => setHideOnLaunch(!hideOnLaunch)}
                        className={`w-9 h-5 rounded-full transition-colors relative ${hideOnLaunch ? 'bg-white' : 'bg-white/10'}`}>
                        <div className={`h-4 w-4 rounded-full transition-all absolute top-0.5 ${hideOnLaunch ? 'right-0.5 bg-black' : 'left-0.5 bg-white'}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-3 ">
                      <div>
                        <div className="text-[16px] font-semibold text-white/90">Minimize to tray on close</div>
                        <div className="text-[15px] text-white/40">Keep running in the taskbar instead of quitting</div>
                      </div>
                      <button onClick={() => updatePrefs({ closeBehavior: prefs.closeBehavior === 'tray' ? 'quit' : 'tray' })}
                        className={`w-9 h-5 rounded-full transition-colors relative ${prefs.closeBehavior === 'tray' ? 'bg-white' : 'bg-white/10'}`}>
                        <div className={`h-4 w-4 rounded-full transition-all absolute top-0.5 ${prefs.closeBehavior === 'tray' ? 'right-0.5 bg-black' : 'left-0.5 bg-white'}`} />
                      </button>
                    </div>

                    <div>
                      <label className="text-[15px] font-bold text-white/50 uppercase block mb-2">Update channel</label>
                      <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1">
                        {[
                          { value: 'stable', label: 'Stable' },
                          { value: 'beta', label: 'Beta' },
                        ].map(ch => (
                          <button
                            key={ch.value}
                            onClick={() => updatePrefs({ updateChannel: ch.value })}
                            className={`flex-1 px-3 py-1.5 rounded-lg text-[15px] font-bold tracking-wider transition-all ${
                              prefs.updateChannel === ch.value ? 'bg-white text-black' : 'text-white/40 hover:text-white/80'
                            }`}
                          >
                            {ch.label.toUpperCase()}
                          </button>
                        ))}
                      </div>
                      <p className="text-[15px] text-white/40 mt-2">Beta includes pre-release builds. Applies to the next update check.</p>
                    </div>

                    <div className="flex items-center justify-between pt-3 ">
                      <div>
                        <div className="text-[16px] font-semibold text-white/90">Version</div>
                        <div className="text-[15px] text-white/40">Proc Launcher{appVersion ? ` v${appVersion}` : ''} • {prefs.updateChannel === 'beta' ? 'Beta' : 'Stable'} channel</div>
                      </div>
                      {appVersion && (
                        <span className="text-[15px] font-mono bg-white/5 px-2 py-0.5 rounded">v{appVersion}</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 ">
                      <div>
                        <div className="text-[16px] font-semibold text-white/90">Updates</div>
                        <div className="text-[15px] text-white/40">
                          {updateInfo.state === 'available'
                            ? `Version ${updateInfo.version} available — use the circle, top right.`
                            : updateInfo.state === 'downloading'
                              ? `Downloading update… ${Math.round(updateInfo.percent || 0)}%`
                              : updateInfo.state === 'downloaded'
                                ? `Version ${updateInfo.version} ready — use the circle to install.`
                                : updateInfo.state === 'error'
                                  ? `Last check failed: ${updateInfo.error}`
                                  : updateInfo.state === 'none'
                                    ? 'Launcher is up to date.'
                                    : 'Check for new versions.'}
                        </div>
                      </div>
                      <button
                        onClick={checkUpdates}
                        disabled={updateInfo.state === 'checking' || updateInfo.state === 'downloading'}
                        className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-[15px] font-semibold text-white/80 transition-colors disabled:opacity-40 shrink-0"
                      >
                        {updateInfo.state === 'checking' ? 'Checking…' : 'Check now'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl p-6 bg-white/5">
                  <h3 className="font-bold text-white/70 text-[16px] uppercase tracking-wider mb-1">Storage</h3>
                  <p className="text-[14px] text-white/30 mb-4">Launcher files on this PC.</p>
                    <button onClick={openFolder(() => electron.openGameFolder(), 'game directory')}
                    className="w-full py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-base font-semibold transition-colors flex items-center justify-center gap-2">
                    <FolderOpen size={16} className="text-white/60" />
                    Open Game Directory
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'instances' && (
            <ErrorBoundary name="instances" key="instances-tele">
              <TeleInstances
                allVanillaVersions={allVanillaVersions}
                activeInstanceId={activeInstanceId}
                onSelectInstance={setActiveInstanceId}
                onRunInstance={runInstance}
                onBrowseMods={browseModsForInstance}
                globalJvmArgs={customJvmArgs}
              />
            </ErrorBoundary>
          )}

        </main>
      </div>

      <DownloadBubble
        tasks={dlTasks}
        onOpen={(kind) => setActiveTab(kind === 'upgrade' ? 'instances' : 'mods')}
      />
      <UpdateBubble
        info={updateInfo}
        onAction={handleUpdateAction}
      />
      <AccountSetupModal
        open={accountSetupOpen}
        busy={accountBusy}
        status={accountStatus}
        error={accountError}
        msFlow={msFlow}
        msElapsedText={msElapsedText}
        msCode={msCode}
        msCopied={msCopied}
        onCopyMsCode={copyMsCode}
        onCancelMicrosoft={cancelMicrosoftLogin}
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
        msFlow={msFlow}
        msElapsedText={msElapsedText}
        msCode={msCode}
        msCopied={msCopied}
        onCopyMsCode={copyMsCode}
        onCancelMicrosoft={cancelMicrosoftLogin}
        onClose={() => { setAccountManagerOpen(false); setAccountError(''); }}
        onCreateOffline={createOfflineAccount}
        onMicrosoft={loginMicrosoftAccount}
        onSelect={selectAccount}
        onRemove={removeAccount}
        onRefresh={refreshMicrosoftAccount}
      />
    </div>
  );
}