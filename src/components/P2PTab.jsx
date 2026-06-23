import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ChevronDown, Copy, Download, FolderOpen, KeyRound,
  Link, Lock, MessageSquare, Pause, Play, RefreshCw, Search, Send,
  Share2, Shield, Trash2, Unlock, Upload, Wifi, User, Plus,
} from 'lucide-react';

const api = window.electron?.p2p 


// ── helpers ──────────────────────────────────────────────────────────────────
function unwrap(response) {
  if (!response?.success) throw new Error(response?.error || 'P2P request failed');
  return response.data;
}

function formatBytes(value = 0) {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

// ── design tokens ─────────────────────────────────────────────────────────────
const BG       = '#0F0F17';
const SURFACE  = '#171722';
const BORDER   = '#232330';
const ACCENT   = '#7C3AED';
const MUTED    = '#8B8B95';

const cardCls  = `rounded-xl p-5 border transition-all`;
const cardBase = `${cardCls} bg-[#171722] border-[#232330]`;
const fieldCls = 'w-full bg-[#111118] border border-[#2B2B3D] rounded-lg px-3 py-2 text-[12px] text-white placeholder-[#555566] focus:outline-none focus:border-[#7C3AED] transition-colors';
const btnPrimary   = 'inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-[#7C3AED] text-white text-[12px] font-semibold hover:bg-[#6D28D9] transition disabled:opacity-40 disabled:cursor-not-allowed';
const btnSecondary = 'inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg border border-[#2B2B3D] bg-[#111118] text-[#CFCFD6] text-[12px] hover:border-[#7C3AED] transition disabled:opacity-40 disabled:cursor-not-allowed';
const btnGhost     = 'inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded-lg text-[11px] text-[#8B8B95] hover:text-white hover:bg-white/5 transition disabled:opacity-40';

const SectionTitle = ({ icon: Icon, children }) => (
  <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[#8B8B95] mb-4">
    <Icon size={13} className="text-[#7C3AED]" />{children}
  </h3>
);

// ── Chat (full-height sidebar) ────────────────────────────────────────────────
function ChatPanel({ messages, unlocked, setNotice }) {
  const [value, setValue] = useState('');
  const bottomRef = React.useRef(null);

  const send = async () => {
    if (!value.trim()) return;
    try { unwrap(await api.sendMessage({ text: value })); setValue(''); }
    catch (e) { setNotice(e.message, true); }
  };

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  return (
    <div className="flex flex-col h-full bg-[#111118]">
      {/* header */}
      <div className="px-4 py-4 border-b border-[#232330] flex items-center gap-2 shrink-0">
        <MessageSquare size={16} className="text-[#7C3AED]" />
        <div>
          <div className="text-sm font-bold">Global Chat</div>
          <div className="text-[10px] text-[#8B8B95]">Signed messages · stored locally</div>
        </div>
      </div>

      {/* messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {!messages.length && (
          <div className="flex flex-col items-center justify-center h-full text-center text-[11px] text-[#555566] gap-2">
            <MessageSquare size={24} className="opacity-30" />
            <p>No messages yet.</p>
            <p className="text-[10px]">All messages are signed and stored locally.</p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.nonce} className="group">
            <div className="flex items-baseline gap-1.5 mb-0.5">
              <button
                onClick={() => navigator.clipboard.writeText(msg.uid)}
                className="text-[11px] font-bold text-[#7C3AED] hover:underline leading-none"
                title={msg.uid}
              >
                {msg.displayName}#{msg.uid.slice(0, 4).toUpperCase()}
              </button>
            </div>
            <div className="text-[12px] text-[#CFCFD6] leading-relaxed pl-0">
              {msg.payload?.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div className="p-4 border-t border-[#232330] shrink-0">
        <div className="flex gap-2">
          <input
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder={unlocked ? 'Write a signed message…' : 'Unlock identity to chat'}
            disabled={!unlocked}
            className={fieldCls}
          />
          <button
            disabled={!unlocked || !value.trim()}
            onClick={send}
            className={btnPrimary}
          >
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Identity ──────────────────────────────────────────────────────────────────
function IdentityPanel({ status, refresh, setNotice }) {
  const [mode, setMode] = useState('create');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async fn => {
    setBusy(true);
    try { unwrap(await fn()); setPassword(''); await refresh(); setNotice('Identity ready and unlocked.'); }
    catch (e) { setNotice(e.message, true); }
    finally { setBusy(false); }
  };

  if (status?.exists && status?.profile) {
    const p = status.profile;
    return (
      <div className={cardBase}>
        <SectionTitle icon={User}>Identity</SectionTitle>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="font-semibold text-sm">{p.displayName}#{p.shortTag}</div>
            <button
              onClick={() => navigator.clipboard.writeText(p.uid)}
              className="flex items-center gap-1 text-[10px] font-mono text-[#555566] hover:text-[#7C3AED] mt-0.5"
              title={p.uid}
            >
              <span className="truncate max-w-[140px]">{p.uid}</span>
              <Copy size={9} className="shrink-0" />
            </button>
          </div>
          <span className={`flex items-center gap-1 text-[9px] font-bold uppercase px-2 py-1 rounded border whitespace-nowrap
            ${status.unlocked
              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
              : 'text-amber-400 bg-amber-500/10 border-amber-500/25'}`}
          >
            {status.unlocked ? <Unlock size={9} /> : <Lock size={9} />}
            {status.unlocked ? 'Unlocked' : 'Locked'}
          </span>
        </div>

        {!status.unlocked && (
          <div className="flex gap-2">
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Encryption password" className={fieldCls} />
            <button disabled={busy} onClick={() => run(() => api.unlockIdentity({ password }))} className={btnPrimary}>
              Unlock
            </button>
          </div>
        )}

        {status.unlocked && (
          <div className="flex gap-2 mt-1">
            <button
              className={btnSecondary}
              onClick={async () => {
                try { const v = unwrap(await api.getRecoveryPhrase()); setPhrase(v); }
                catch (e) { setNotice(e.message, true); }
              }}
            >
              Recovery phrase
            </button>
            <button
              className={btnSecondary}
              onClick={async () => {
                try { const saved = unwrap(await api.exportIdentity()); if (saved) setNotice(`Exported to ${saved}`); }
                catch (e) { setNotice(e.message, true); }
              }}
            >
              <Upload size={12} />Export
            </button>
          </div>
        )}

        {phrase && (
          <div className="mt-3 p-3 rounded-lg bg-amber-500/8 border border-amber-500/20">
            <div className="flex justify-between gap-2">
              <code className="text-[10px] text-amber-200 break-all select-text leading-relaxed">{phrase}</code>
              <button onClick={() => navigator.clipboard.writeText(phrase)} className="shrink-0 text-amber-300 hover:text-white">
                <Copy size={12} />
              </button>
            </div>
            <p className="text-[9px] text-amber-300/60 mt-2">Store this phrase securely — it's the only way to restore your identity.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cardBase}>
      <SectionTitle icon={User}>Identity</SectionTitle>
      <div className="flex gap-1 mb-3">
        {['create', 'restore', 'import'].map(item => (
          <button key={item} onClick={() => setMode(item)}
            className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold capitalize transition
              ${mode === item ? 'bg-[#7C3AED] text-white' : 'text-[#8B8B95] hover:bg-white/5'}`}
          >
            {item}
          </button>
        ))}
      </div>
      {mode !== 'import' && <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Display name" className={`${fieldCls} mb-2`} />}
      {mode === 'restore' && <textarea value={phrase} onChange={e => setPhrase(e.target.value)} placeholder="Recovery phrase" className={`${fieldCls} mb-2 h-16 resize-none`} />}
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Encryption password (8+ chars)" className={`${fieldCls} mb-3`} />
      <button
        disabled={busy}
        onClick={() => run(() =>
          mode === 'create' ? api.createIdentity({ displayName, password })
          : mode === 'restore' ? api.restoreIdentity({ phrase, displayName, password })
          : api.importIdentity({ password })
        )}
        className={`${btnPrimary} w-full`}
      >
        <KeyRound size={13} />
        {busy ? 'Working…' : mode === 'create' ? 'Create identity' : mode === 'restore' ? 'Restore identity' : 'Import encrypted identity'}
      </button>
      <p className="text-[9px] text-[#555566] mt-2">Your password never leaves this PC — it only encrypts the local key.</p>
    </div>
  );
}

// ── Network Status ────────────────────────────────────────────────────────────
function NetworkStatus({ status }) {
  const stats = [
    { value: status?.online ? 'Online' : 'Offline', label: 'Network', color: status?.online ? 'text-emerald-400' : 'text-red-400' },
    { value: status?.peerCount ?? 0, label: 'Peers' },
    { value: status?.activeTorrents ?? 0, label: 'Active torrents' },
  ];
  return (
    <div className={cardBase}>
      <SectionTitle icon={Wifi}>Network</SectionTitle>
      <div className="grid grid-cols-3 gap-3">
        {stats.map(({ value, label, color }) => (
          <div key={label} className="rounded-lg bg-[#111118] border border-[#2B2B3D] p-3">
            <div className={`text-xl font-bold ${color ?? 'text-white'}`}>{value}</div>
            <div className="text-[10px] text-[#8B8B95] mt-0.5">{label}</div>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-[#555566] mt-3">Discovery is manual magnet exchange. Peer counts reflect real torrent connections.</p>
    </div>
  );
}

// ── Create Share ──────────────────────────────────────────────────────────────
function SharePanel({ unlocked, refresh, setNotice }) {
  const [form, setForm] = useState({ sourcePath: '', title: '', description: '', category: 'other', mcVersion: '', loader: 'unknown' });
  const [folder, setFolder] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm(c => ({ ...c, [key]: value }));

  const choose = async () => {
    try { const s = unwrap(await api.chooseShareSource({ folder })); if (s) set('sourcePath', s); }
    catch (e) { setNotice(e.message, true); }
  };

  const submit = async () => {
    setBusy(true);
    try {
      unwrap(await api.createShare(form));
      setForm(c => ({ ...c, sourcePath: '', title: '', description: '' }));
      await refresh(); setNotice('Torrent created and seeding.');
    } catch (e) { setNotice(e.message, true); }
    finally { setBusy(false); }
  };

  return (
    <div className={cardBase}>
      <SectionTitle icon={Share2}>New share</SectionTitle>
      <div className="flex gap-1 mb-3">
        {[['File', false], ['Folder', true]].map(([label, val]) => (
          <button key={label} onClick={() => setFolder(val)}
            className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition
              ${folder === val ? 'bg-[#7C3AED] text-white' : 'text-[#8B8B95] hover:bg-white/5'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <button onClick={choose} className={`${btnSecondary} w-full mb-2 truncate justify-start`}>
        <FolderOpen size={13} />
        <span className="truncate">{form.sourcePath || 'Choose source…'}</span>
      </button>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Title" className={fieldCls} />
        <select value={form.category} onChange={e => set('category', e.target.value)} className={`${fieldCls} p2p-select`}>
          {['client', 'texture_pack', 'world', 'other'].map(x => <option key={x} value={x}>{x.replace('_', ' ')}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input value={form.mcVersion} onChange={e => set('mcVersion', e.target.value)} placeholder="MC version" className={fieldCls} />
        <select value={form.loader} onChange={e => set('loader', e.target.value)} className={`${fieldCls} p2p-select`}>
          {['unknown', 'vanilla', 'forge', 'fabric', 'neoforge', 'quilt'].map(x => <option key={x}>{x}</option>)}
        </select>
      </div>
      <textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Description" className={`${fieldCls} h-14 resize-none mb-3`} />
      <button disabled={!unlocked || busy} onClick={submit} className={`${btnPrimary} w-full`}>
        <Plus size={13} />
        {busy ? 'Creating…' : 'Create and seed'}
      </button>
    </div>
  );
}

// ── Browse Shares ─────────────────────────────────────────────────────────────
function BrowseShares({ shares, ownUid, refresh, setNotice }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [magnet, setMagnet] = useState('');

  const visible = useMemo(() =>
    shares.filter(s =>
      (category === 'all' || s.category === category) &&
      `${s.title} ${s.description} ${s.mcVersion}`.toLowerCase().includes(search.toLowerCase())
    ), [shares, search, category]);

  const download = async value => {
    try { unwrap(await api.startDownload(value)); setMagnet(''); await refresh(); setNotice('Download started.'); }
    catch (e) { setNotice(e.message, true); }
  };
  const shareAction = async (name, id) => {
    try { unwrap(await api[name](id)); await refresh(); setNotice(name === 'removeShare' ? 'Share removed.' : 'Seeding again.'); }
    catch (e) { setNotice(e.message, true); }
  };

  return (
    <div className={cardBase}>
      <div className="flex items-center justify-between mb-4">
        <SectionTitle icon={Share2}>Shares</SectionTitle>
        <span className="text-[10px] text-[#555566] -mt-4">{shares.length} saved</span>
      </div>

      {/* filters */}
      <div className="flex gap-2 mb-2">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-3 top-2.5 text-[#555566]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className={`${fieldCls} pl-8`} />
        </div>
        <select value={category} onChange={e => setCategory(e.target.value)} className={`${fieldCls} p2p-select w-32`}>
          {['all', 'client', 'texture_pack', 'world', 'other'].map(x => <option key={x}>{x}</option>)}
        </select>
      </div>

      {/* magnet import */}
      <div className="flex gap-2 mb-3">
        <input value={magnet} onChange={e => setMagnet(e.target.value)} placeholder="Paste magnet URI…" className={fieldCls} />
        <button disabled={!magnet} onClick={() => download({ magnetURI: magnet, title: 'Magnet download', category: 'other' })} className={btnPrimary}>
          <Link size={12} />Import
        </button>
      </div>

      {/* list */}
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {visible.map(share => (
          <div key={share.id} className="rounded-lg bg-[#111118] border border-[#2B2B3D] p-3 hover:border-[#7C3AED]/40 transition">
            <div className="flex justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-[12px] truncate">{share.title}</div>
                <div className="text-[9px] text-[#8B8B95] mt-0.5">
                  {share.category.replace('_', ' ')} · {share.mcVersion || 'any'} · {share.loader} · {formatBytes(share.sizeBytes)}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] text-[#7C3AED]">{share.publisherDisplayName}#{share.publisherTag}</div>
                <div className={`text-[9px] mt-0.5 ${['missing_source', 'error'].includes(share.status) ? 'text-red-400' : 'text-emerald-400/70'}`}>
                  {(share.status || 'offline').replaceAll('_', ' ')}
                </div>
              </div>
            </div>
            {share.description && <p className="text-[10px] text-[#555566] mt-2 line-clamp-2">{share.description}</p>}
            <div className="flex gap-2 mt-2">
              <button onClick={() => navigator.clipboard.writeText(share.magnetURI)} className={btnGhost}>
                <Copy size={10} />Magnet
              </button>
              {share.publisherUid === ownUid ? (
                <>
                  <button onClick={() => shareAction('retryShare', share.id)} title="Retry seeding" className={btnGhost}><RefreshCw size={10} /></button>
                  <button onClick={() => shareAction('removeShare', share.id)} title="Remove" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-red-400 hover:bg-red-500/10 transition"><Trash2 size={10} /></button>
                </>
              ) : (
                <button onClick={() => download(share)} className={`${btnPrimary} ml-auto py-1 px-2.5 text-[11px]`}>
                  <Download size={10} />Download
                </button>
              )}
            </div>
          </div>
        ))}
        {!visible.length && (
          <div className="text-center text-[11px] text-[#555566] py-8 flex flex-col items-center gap-2">
            <Share2 size={20} className="opacity-30" />
            No shares found. Exchange a magnet link with a peer.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Downloads ─────────────────────────────────────────────────────────────────
function DownloadsPanel({ downloads, refresh, setNotice }) {
  const action = async (name, id) => {
    try { unwrap(await api[name](id)); await refresh(); }
    catch (e) { setNotice(e.message, true); }
  };
  return (
    <div className={cardBase}>
      <div className="flex items-center justify-between mb-4">
        <SectionTitle icon={Download}>Downloads</SectionTitle>
        <button onClick={() => api.openDownloads()} className={btnGhost} title="Open staging folder">
          <FolderOpen size={13} />
        </button>
      </div>
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {downloads.map(item => <DownloadRow key={item.id} item={item} action={action} />)}
        {!downloads.length && (
          <div className="text-center text-[11px] text-[#555566] py-6 flex flex-col items-center gap-2">
            <Download size={20} className="opacity-30" />
            Nothing downloading
          </div>
        )}
      </div>
      <p className="text-[9px] text-[#555566] mt-3">Files are staged and never execute automatically.</p>
    </div>
  );
}

function DownloadRow({ item, action }) {
  const [debugOpen, setDebugOpen] = useState(false);
  const d = item.diagnostics || {};
  const status = d.status || item.status || 'metadata';
  const done = status === 'done' || status === 'staged';
  const stalled = status === 'stalled' || status === 'error';
  const pct = Math.round((item.progress || 0) * 100);

  return (
    <div className={`rounded-lg border p-3 transition-colors ${stalled ? 'border-amber-500/30 bg-amber-500/5' : 'border-[#2B2B3D] bg-[#111118]'}`}>
      <div className="flex justify-between text-[11px] mb-1.5">
        <span className="font-semibold truncate">{item.title}</span>
        <span className="text-[#8B8B95] ml-2 shrink-0">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#2B2B3D] overflow-hidden mb-1.5">
        <div className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#4F46E5] transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between">
        <span className={`text-[10px] capitalize ${stalled ? 'text-amber-400' : 'text-[#8B8B95]'}`}>
          {status.replaceAll('_', ' ')} · {formatBytes(item.downloadSpeed)}/s · {item.peers || 0} peers
        </span>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setDebugOpen(v => !v)} className={btnGhost} title="Debug info">
            <ChevronDown size={11} className={`transition-transform ${debugOpen ? 'rotate-180' : ''}`} />
          </button>
          {status === 'paused'
            ? <button onClick={() => action('resumeDownload', item.id)} className={btnGhost}><Play size={11} /></button>
            : !done && <button onClick={() => action('pauseDownload', item.id)} className={btnGhost}><Pause size={11} /></button>
          }
          <button onClick={() => action('cancelDownload', item.id)} className="inline-flex items-center px-1.5 py-1 rounded text-red-400 hover:bg-red-500/10 transition">
            <Trash2 size={11} />
          </button>
        </div>
      </div>
      {stalled && (
        <div className="mt-2 p-2 rounded bg-amber-500/8 border border-amber-500/15 text-[9px] leading-relaxed text-amber-200/80">
          Connected to peers but no pieces are transferring. The seeder may not have the file or WebTorrent may be blocked.
        </div>
      )}
      {debugOpen && (
        <div className="mt-2 p-2 rounded bg-black/20 border border-white/5 text-[9px] font-mono text-[#555566] space-y-1 select-text">
          <div className="break-all">infoHash: {d.infoHash || item.infoHash || 'waiting for metadata'}</div>
          <div>ready: {String(Boolean(d.ready))} · wires: {d.wires || 0} · tracker: {d.trackerStatus || 'unknown'}</div>
          <div>downloaded: {formatBytes(d.downloaded)} · uploaded: {formatBytes(d.uploaded)}</div>
          {d.lastError && <div className="text-red-400/70 break-words">last error: {d.lastError}</div>}
        </div>
      )}
    </div>
  );
}

// ── Admin ─────────────────────────────────────────────────────────────────────
function AdminPanel({ setNotice, refresh }) {
  const [uid, setUid] = useState('');
  const act = async name => {
    try { unwrap(await api[name](uid)); setNotice(name === 'blockUid' ? 'UID blocked locally.' : 'UID unblocked locally.'); await refresh(); }
    catch (e) { setNotice(e.message, true); }
  };
  return (
    <div className={cardBase}>
      <SectionTitle icon={Shield}>Moderation</SectionTitle>
      <p className="text-[10px] text-[#555566] mb-3">Moderation is local and trust-network based — not globally enforceable in a P2P network.</p>
      <div className="flex gap-2">
        <input value={uid} onChange={e => setUid(e.target.value)} placeholder="Full UID" className={fieldCls} />
        <button onClick={() => act('blockUid')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-[12px] hover:bg-red-500/15 transition">Block</button>
        <button onClick={() => act('unblockUid')} className={btnSecondary}>Unblock</button>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function P2PTab() {
  const [status, setStatus] = useState(null);
  const [shares, setShares] = useState([]);
  const [downloads, setDownloads] = useState([]);
  const [messages, setMessages] = useState([]);
  const [notice, setNoticeState] = useState(null);

  const setNotice = (message, error = false) => {
    setNoticeState({ message, error });
    setTimeout(() => setNoticeState(null), 5000);
  };

  const refresh = useCallback(async () => {
    if (!api) return;
    try {
      const [s, sh, dl, msg] = await Promise.all([
        api.getStatus(), api.listShares(), api.listDownloads(), api.getMessages(),
      ]);
      setStatus(unwrap(s)); setShares(unwrap(sh)); setDownloads(unwrap(dl)); setMessages(unwrap(msg));
    } catch (e) { setNotice(e.message, true); }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    const off = [
      window.electron?.onP2PEvent?.('p2p-message', m => setMessages(v => [...v, m])),
      window.electron?.onP2PEvent?.('p2p-download-progress', v => setDownloads(items => [...items.filter(x => x.id !== v.id), v])),
      window.electron?.onP2PEvent?.('p2p-share-update', refresh),
      window.electron?.onP2PEvent?.('p2p-error', v => setNotice(v.error, true)),
    ];
    return () => { clearInterval(timer); off.forEach(fn => fn?.()); };
  }, [refresh]);

  if (!api) return (
    <div className="flex items-center justify-center h-full bg-[#0F0F17] text-[#555566] text-sm">
      P2P features are available in the Electron app.
    </div>
  );

  return (
    <div className="flex h-full bg-[#0F0F17] text-white overflow-hidden">
      <style>{`
        .p2p-select { color-scheme: dark; }
        .p2p-select option { background: #111118; color: #f5f3ff; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2B2B3D; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #7C3AED; }
      `}</style>

      {/* ── Left: Everything else ── */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {/* top bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#232330] sticky top-0 bg-[#0F0F17]/95 backdrop-blur z-10">
          <div className="flex items-center gap-3">
            <Wifi size={18} className="text-[#7C3AED]" />
            <div>
              <h1 className="font-bold text-base leading-none">P2P Network</h1>
              <p className="text-[10px] text-[#8B8B95] mt-0.5">Serverless identity · signed messages · content sharing</p>
            </div>
          </div>
          <button onClick={refresh} className={btnSecondary}>
            <RefreshCw size={13} />Refresh
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* legal notice */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/6 border border-amber-500/20 text-[11px] text-amber-200/80">
            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-400" />
            Only share content you own or have the right to distribute. Downloads are untrusted and must be reviewed before use.
          </div>

          {/* notice banner */}
          {notice && (
            <div className={`px-4 py-2.5 rounded-xl border text-[12px] ${
              notice.error
                ? 'bg-red-500/10 border-red-500/25 text-red-400'
                : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
            }`}>
              {notice.message}
            </div>
          )}

          {/* Identity + Network */}
          <div className="grid grid-cols-2 gap-4">
            <IdentityPanel status={status} refresh={refresh} setNotice={setNotice} />
            <NetworkStatus status={status} />
          </div>

          {/* New Share + Browse */}
          <div className="grid grid-cols-2 gap-4">
            <SharePanel unlocked={status?.unlocked} refresh={refresh} setNotice={setNotice} />
            <BrowseShares shares={shares} ownUid={status?.profile?.uid} refresh={refresh} setNotice={setNotice} />
          </div>

          {/* Downloads */}
          <DownloadsPanel downloads={downloads} refresh={refresh} setNotice={setNotice} />

          {/* Admin */}
          {status?.isPrivileged && <AdminPanel setNotice={setNotice} refresh={refresh} />}
        </div>
      </div>

      {/* ── Right: Global Chat ── */}
      <div className="w-72 flex flex-col shrink-0 h-full border-l border-[#232330]">
        <ChatPanel messages={messages} unlocked={status?.unlocked} setNotice={setNotice} />
      </div>
    </div>
  );
}