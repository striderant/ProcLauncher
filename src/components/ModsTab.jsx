import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Download, Search, X, Package, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, Check, Puzzle } from 'lucide-react';
import { fieldCls, btnPrimary, btnSecondary, btnGhost } from '../theme';
import { pushDownloadTask, finishDownloadTask } from '../downloads';

// ─── Constants ────────────────────────────────────────────────────────────────

const MODRINTH_API        = 'https://api.modrinth.com/v2';
const MC_VERSION_MANIFEST = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';
const SEARCH_DEBOUNCE_MS  = 400;
const DEFAULT_PAGE_SIZE   = 24;
const CACHE_MAX           = 40;

const LOADERS = [
  { value: 'fabric',   label: 'Fabric'   },
];

const SORT_OPTIONS = [
  { value: 'downloads', label: 'Downloads'        },
  { value: 'relevance', label: 'Relevance'        },
  { value: 'newest',    label: 'Newest'           },
  { value: 'updated',   label: 'Recently Updated' },
  { value: 'follows',   label: 'Most Followed'    },
];

const PAGE_SIZES = [
  { value: 12, label: '12' },
  { value: 24, label: '24' },
  { value: 48, label: '48' },
];

// ─── Design tokens ────────────────────────────────────────────────────────────
// Shared black & white palette lives in src/theme.js - edit colors there.
// (No border changes on focus/hover - background shift only)

// ─── Modrinth API ─────────────────────────────────────────────────────────────

function buildSearchUrl({ query, loader, mcVersion, sortBy, page, pageSize }) {
  const offset = (page - 1) * pageSize;
  const facets = [[`categories:${loader}`], ['server_side!=unsupported']];
  if (mcVersion) facets.push([`versions:${mcVersion}`]);
  const params = new URLSearchParams({
    query,
    index:  sortBy,
    offset: String(offset),
    limit:  String(pageSize),
    facets: JSON.stringify(facets),
  });
  return `${MODRINTH_API}/search?${params}`;
}

async function fetchMods(params, signal) {
  const res = await fetch(buildSearchUrl(params), { signal });
  if (!res.ok) throw new Error(`Modrinth API error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  const mods = (data.hits ?? []).map(h => ({
    id:                h.project_id,
    name:              h.title,
    description:       h.description,
    icon:              h.icon_url,
    downloads:         h.downloads         ?? 0,
    follows:           h.follows           ?? 0,
    author:            h.author            ?? '',
    url:               `https://modrinth.com/mod/${h.project_id}`,
    gameVersions:      h.versions          ?? [],
    displayCategories: h.display_categories ?? [],
    latestVersion:     h.latest_version    ?? null,
  }));
  return {
    mods,
    pagination: {
      total:      data.total_hits ?? 0,
      page:       params.page,
      pageSize:   params.pageSize,
      totalPages: Math.ceil((data.total_hits ?? 0) / params.pageSize),
    },
  };
}

async function fetchModVersions(modId, signal) {
  const res = await fetch(`${MODRINTH_API}/project/${modId}/version`, { signal });
  if (!res.ok) throw new Error(`Modrinth versions error: ${res.status}`);
  const data = await res.json();
  return data.map(v => ({
    versionId:     v.id,
    versionName:   v.name,
    versionNumber: v.version_number,
    gameVersions:  v.game_versions ?? [],
    loaders:       v.loaders       ?? [],
    downloads:     v.downloads > 0 ? v.downloads : null,
    versionType:   v.version_type  ?? 'release',
  }));
}

async function installModVersion(versionId, projectId, instanceId) {
  if (!window.electron?.installModrinthVersion) {
    throw new Error('Mod downloads require the Electron app.');
  }
  const result = await window.electron.installModrinthVersion({ versionId, projectId, instanceId: instanceId || null });
  if (!result?.success) throw new Error(result?.error || 'Mod download failed');
  return result;
}

let _mcVersionsCache = null;
async function fetchMinecraftVersions() {
  if (_mcVersionsCache) return _mcVersionsCache;
  const res = await fetch(MC_VERSION_MANIFEST);
  if (!res.ok) throw new Error('Could not load MC versions');
  const data = await res.json();
  _mcVersionsCache = data.versions.filter(v => v.type === 'release').map(v => v.id);
  return _mcVersionsCache;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const _cache = new Map();
function cacheGet(key) { return _cache.get(key) ?? null; }
function cacheSet(key, value) {
  if (_cache.size >= CACHE_MAX) _cache.delete(_cache.keys().next().value);
  _cache.set(key, value);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNumber(n) {
  if (n == null) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const isStableVersion = v =>
  v.startsWith('1.') && !v.includes('w') && !v.includes('CB') && !v.includes('Snapshot');

// ─── Custom Select ────────────────────────────────────────────────────────────

function CustomSelect({ value, onChange, options, placeholder, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open]);

  const allOptions = placeholder ? [{ value: '', label: placeholder }, ...options] : options;
  const selected   = allOptions.find(o => String(o.value) === String(value));

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-[16px] focus:outline-none transition-colors
          ${open ? 'bg-[#161616] text-white' : 'bg-[#111111] text-white hover:bg-[#161616]'}`}
      >
        <span className={selected?.value === '' || selected == null ? 'text-[#555555]' : 'text-white'}>
          {selected?.label ?? placeholder ?? '-'}
        </span>
        <ChevronDown
          size={12}
          className={`shrink-0 text-[#555555] transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[120px] bg-[#1c1c1c] rounded-xl shadow-2xl shadow-black/60 overflow-hidden">
          <div className="max-h-52 overflow-y-auto py-1">
            {allOptions.map(opt => {
              const active = String(opt.value) === String(value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-[16px] text-left transition-colors
                    ${active
                      ? 'bg-white/10 text-white'
                      : 'text-white/70 hover:bg-white/5 hover:text-white'
                    }`}
                >
                  <span>{opt.label}</span>
                  {active && <Check size={11} className="text-white shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function VersionTypeBadge({ type }) {
  const map = {
    release: 'bg-emerald-500/15 text-emerald-300',
    beta:    'bg-amber-500/15 text-amber-300',
    alpha:   'bg-red-500/15 text-red-300',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[13px] font-bold uppercase tracking-wide ${map[type] ?? map.release}`}>
      {type}
    </span>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'mods-spin 0.8s linear infinite', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="40 20" />
    </svg>
  );
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-xl p-4 bg-[#171717] flex flex-col h-full">
      <div className="flex gap-3 mb-2.5">
        <div className="w-11 h-11 rounded-lg bg-[#2b2b2b] shrink-0" style={{ animation: 'mods-pulse 1.8s ease-in-out infinite' }} />
        <div className="flex-1 space-y-0.5 min-w-0">
          <div className="h-4 w-3/5 rounded bg-[#2b2b2b]" style={{ animation: 'mods-pulse 1.8s ease-in-out infinite' }} />
          <div className="h-3 w-2/5 rounded bg-[#2b2b2b]" style={{ animation: 'mods-pulse 1.8s ease-in-out 0.1s infinite' }} />
        </div>
      </div>
      <div className="flex-1 mb-3 space-y-1.5">
        <div className="h-3 w-full rounded bg-[#2b2b2b]" style={{ animation: 'mods-pulse 1.8s ease-in-out 0.15s infinite' }} />
        <div className="h-3 w-full rounded bg-[#2b2b2b]" style={{ animation: 'mods-pulse 1.8s ease-in-out 0.2s infinite' }} />
        <div className="h-3 w-3/5 rounded bg-[#2b2b2b]" style={{ animation: 'mods-pulse 1.8s ease-in-out 0.25s infinite' }} />
      </div>
      <div className="flex items-center justify-between mt-auto pt-1">
        <div className="w-8 h-8 rounded-lg bg-[#2b2b2b]" style={{ animation: 'mods-pulse 1.8s ease-in-out 0.45s infinite' }} />
        <div className="flex gap-2">
          <div className="h-8 w-20 rounded-lg bg-[#2b2b2b]" style={{ animation: 'mods-pulse 1.8s ease-in-out 0.5s infinite' }} />
          <div className="h-8 w-20 rounded-lg bg-[#2b2b2b]" style={{ animation: 'mods-pulse 1.8s ease-in-out 0.55s infinite' }} />
        </div>
      </div>
    </div>
  );
}

// ─── Mod card ─────────────────────────────────────────────────────────────────

function ModCard({ mod, onViewVersions }) {
  const [expanded, setExpanded] = useState(false);
  const long = mod.description?.length > 110;
  const desc = long && !expanded ? mod.description.slice(0, 110) + '…' : mod.description;

  return (
    // Hover: subtle background lighten + slight lift. No borders.
    <div className="rounded-xl p-4 bg-[#171717] flex flex-col h-full transition-all duration-150 hover:bg-[#1e1e1e] hover:scale-[1.015] hover:-translate-y-px">
      <div className="flex gap-3 mb-2.5">
        <div className="w-11 h-11 rounded-lg bg-[#111111] flex items-center justify-center overflow-hidden shrink-0">
          {mod.icon
            ? <img src={mod.icon} alt={mod.name} className="w-full h-full object-cover"
                onError={e => { e.target.style.display = 'none'; }} />
            : <Package size={20} className="text-white/40" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-[16px] text-white truncate leading-tight">{mod.name}</h3>
          <p className="text-[14px] text-[#555555] mt-0.5">
            by {mod.author || 'unknown'} · ↓ {formatNumber(mod.downloads)}
          </p>
        </div>
      </div>

      <div className="text-[15px] text-[#8b8b8b] leading-relaxed flex-1 mb-3">
        {desc}
        {long && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="ml-1 text-white/50 hover:text-white transition-colors text-[14px]"
          >
            {expanded ? 'less' : 'more'}
          </button>
        )}
      </div>

      <div className="flex items-center justify-end mt-auto pt-1">
        <button onClick={() => onViewVersions(mod)} className={btnPrimary}>
          <Download size={12} />
          Download
        </button>
      </div>
    </div>
  );
}

// ─── Versions modal ───────────────────────────────────────────────────────────

function VersionsModal({ mod, onClose, onInstall, installingVersionId }) {
  const [versions, setVersions]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [search, setSearch]             = useState('');
  const [filterMcVer, setFilterMcVer]   = useState('');
  const [mcVersions, setMcVersions]     = useState([]);
  const abortRef = useRef(null);

  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  useEffect(() => {
    abortRef.current = new AbortController();
    setLoading(true); setError(null);
    fetchModVersions(mod.id, abortRef.current.signal)
      .then(v => { setVersions(v); setLoading(false); })
      .catch(e => { if (e.name !== 'AbortError') { setError(e.message); setLoading(false); } });
    fetchMinecraftVersions().then(setMcVersions).catch(() => {});
    return () => abortRef.current?.abort();
  }, [mod.id]);

  // Fabric-only launcher: non-Fabric versions are never shown.
  const filtered = useMemo(() => versions.filter(v => {
    if (!v.loaders.includes('fabric')) return false;
    if (search && !v.versionName.toLowerCase().includes(search.toLowerCase()) &&
        !v.versionNumber.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterMcVer  && !v.gameVersions.includes(filterMcVer)) return false;
    return true;
  }), [versions, search, filterMcVer]);

  const mcVersionOptions = useMemo(() => mcVersions.map(v => ({ value: v, label: v })), [mcVersions]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl bg-[#171717] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col max-h-[85vh]">

        <div className="flex items-center justify-between px-5 py-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {mod.icon && (
              <img src={mod.icon} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0"
                onError={e => { e.target.style.display = 'none'; }} />
            )}
            <div className="min-w-0">
              <h2 className="font-bold text-base text-white truncate">{mod.name}</h2>
              <p className="text-[14px] text-[#8b8b8b]">
                {loading ? 'Loading versions…' : `${filtered.length} of ${versions.length} versions`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#555555] hover:text-white hover:bg-white/8 transition-colors rounded-lg p-1 shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-2 px-5 py-3 shrink-0 flex-wrap">
          <div className="relative flex-1 min-w-[140px]">
            <Search size={12} className="absolute left-3 top-2.5 text-[#555555] pointer-events-none z-10" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search versions…"
              className={`${fieldCls} pl-8`}
            />
          </div>
          <CustomSelect value={filterMcVer} onChange={setFilterMcVer} options={mcVersionOptions} placeholder="Any MC ver" className="w-32" />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-[#555555]">
              <Spinner size={24} />
              <p className="text-[16px]">Loading versions…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-[16px] text-red-400">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-[15px] text-[#555555]">
              No versions match your filters.
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map(v => (
                <li key={v.versionId} className="flex items-start justify-between gap-3 rounded-xl bg-[#111111] px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="font-semibold text-[16px] text-white">{v.versionName}</span>
                      <VersionTypeBadge type={v.versionType} />
                    </div>
                    <div className="flex flex-wrap gap-1 mb-1">
                      {v.gameVersions.filter(isStableVersion).slice(0, 6).map(gv => (
                        <span key={gv} className="px-1.5 py-0.5 rounded text-[13px] bg-[#2b2b2b] text-[#8b8b8b]">{gv}</span>
                      ))}
                      {v.gameVersions.filter(isStableVersion).length > 6 && (
                        <span className="text-[13px] text-[#555555]">+{v.gameVersions.filter(isStableVersion).length - 6}</span>
                      )}
                    </div>
                    {v.downloads && (
                      <p className="text-[13px] text-[#555555]">↓ {formatNumber(v.downloads)} downloads</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => onInstall(mod, v)} disabled={installingVersionId === v.versionId} className={btnPrimary}>
                      {installingVersionId === v.versionId ? <Spinner size={12} /> : <Download size={12} />}
                      {installingVersionId === v.versionId ? 'Downloading…' : 'Download'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  const pages = [];
  const start = Math.max(1, page - 2);
  const end   = Math.min(totalPages, page + 2);
  if (start > 1) { pages.push(1); if (start > 2) pages.push('…'); }
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < totalPages) { if (end < totalPages - 1) pages.push('…'); pages.push(totalPages); }

  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      <button onClick={() => onPageChange(page - 1)} disabled={page === 1} className={btnGhost} aria-label="Previous page">
        <ChevronLeft size={14} />
      </button>
      {pages.map((p, i) =>
        p === '…'
          ? <span key={`e${i}`} className="px-1 text-[15px] text-white/30">…</span>
          : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`min-w-[28px] h-7 px-2 rounded-lg text-[15px] font-semibold transition-colors
                ${p === page
                  ? 'bg-white text-black'
                  : 'text-white/50 bg-transparent hover:bg-white/8 hover:text-white'
                }`}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </button>
          )
      )}
      <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages} className={btnGhost} aria-label="Next page">
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

// ─── Notice ───────────────────────────────────────────────────────────────────

function Notice({ notice }) {
  if (!notice) return null;
  return (
    <div className={`mb-3 px-4 py-2.5 rounded-xl text-[16px] ${
      notice.error
        ? 'bg-red-500/10 text-red-400'
        : 'bg-emerald-500/10 text-emerald-400'
    }`}>
      {notice.message}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function ModsTab({ instanceId }) {
  const [instanceName, setInstanceName] = useState('');

  useEffect(() => {
    let cancelled = false;
    setInstanceName('');
    if (!instanceId || !window.electron?.instance?.get) return undefined;
    window.electron.instance.get(instanceId)
      .then(res => {
        if (cancelled || !res?.success) return;
        setInstanceName(res.data?.name || '');
        // Default the version filter to the instance's Minecraft version so
        // installs match what the instance can actually run (user can override).
        if (res.data?.minecraft_version) {
          setMcVersion(prev => prev || res.data.minecraft_version);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [instanceId]);
  const [searchInput, setSearchInput] = useState('');
  const [loader,      setLoader]      = useState('fabric');
  const [mcVersion,   setMcVersion]   = useState('');
  const [sortBy,      setSortBy]      = useState('downloads');
  const [pageSize,    setPageSize]    = useState(DEFAULT_PAGE_SIZE);
  const [page,        setPage]        = useState(1);

  const [mods,       setMods]       = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const bypassCacheRef = useRef(false);

  const [mcVersions,    setMcVersions]    = useState([]);
  const [versionsModal, setVersionsModal] = useState(null);
  const [installing,    setInstalling]    = useState({});
  const [notice,        setNoticeState]   = useState(null);

  const noticeTimerRef = useRef(null);
  const setNotice = useCallback((message, error = false) => {
    clearTimeout(noticeTimerRef.current);
    setNoticeState({ message, error });
    noticeTimerRef.current = setTimeout(() => setNoticeState(null), 5000);
  }, []);

  const debouncedSearch = useDebounce(searchInput, SEARCH_DEBOUNCE_MS);
  const abortRef  = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    fetchMinecraftVersions().then(setMcVersions).catch(() => {});
  }, []);

  useEffect(() => { setPage(1); }, [debouncedSearch, loader, mcVersion, sortBy, pageSize]);

  useEffect(() => {
    const params   = { query: debouncedSearch, loader, mcVersion, sortBy, page, pageSize };
    const cacheKey = JSON.stringify(params);
    const bypassCache = bypassCacheRef.current;
    bypassCacheRef.current = false;
    const cached = bypassCache ? null : cacheGet(cacheKey);

    if (cached) {
      setMods(cached.mods); setPagination(cached.pagination);
      setLoading(false); setError(null);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true); setError(null);

    fetchMods(params, abortRef.current.signal)
      .then(({ mods: m, pagination: p }) => {
        cacheSet(cacheKey, { mods: m, pagination: p });
        setMods(m); setPagination(p); setLoading(false);
      })
      .catch(e => {
        if (e.name !== 'AbortError') { setError(e.message || 'Failed to load mods.'); setLoading(false); }
      });

    return () => abortRef.current?.abort();
  }, [debouncedSearch, loader, mcVersion, sortBy, page, pageSize, refreshTick]);

  const handleInstallVersion = useCallback(async (mod, version) => {
    const key = `${mod.id}:${version.versionId}`;
    setInstalling(p => ({ ...p, [key]: version.versionId }));
    const taskId = pushDownloadTask('mod', `${mod.name} ${version.versionNumber}`, { iconUrl: mod.icon });
    try {
      const result = await installModVersion(version.versionId, mod.id, instanceId);
      setVersionsModal(null);
      finishDownloadTask(taskId, true, 'Downloaded', instanceName ? `Added to ${instanceName} (${result.filename})` : result.filename);
    } catch (err) {
      finishDownloadTask(taskId, false, 'Download failed', err.message);
    } finally {
      setInstalling(p => { const n = { ...p }; delete n[key]; return n; });
    }
  }, [instanceId, instanceName, setNotice]);

  const handlePageChange = useCallback(p => {
    setPage(p);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const mcVersionOptions = useMemo(() => mcVersions.map(v => ({ value: v, label: v })), [mcVersions]);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] text-white overflow-hidden">
      <style>{`
        @keyframes mods-spin  { to { transform: rotate(360deg); } }
        @keyframes mods-pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
        ::-webkit-scrollbar       { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2b2b2b; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: white/20; }
      `}</style>

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-6 py-3 bg-black/50 z-10 shrink-0">
        <div className="flex items-center gap-2.5">
          <Puzzle size={24} className="text-white/60" />
          <div>
            <h1 className="font-bold text-base leading-none">Mod Browser</h1>
            <p className="text-[14px] text-white/40 mt-0.5">
              Browse and download mods from Modrinth{instanceName ? ` • into ${instanceName}` : ''}
            </p>
          </div>
        </div>
        <button
          onClick={() => { bypassCacheRef.current = true; setRefreshTick(t => t + 1); }}
          className={btnGhost} title="Refresh"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex items-end gap-2 px-6 py-3 bg-black/50 shrink-0 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[14px] font-bold uppercase tracking-widest text-white/40 mb-1">Search</label>
          <div className="relative">
            <Search size={12} className="absolute left-3 top-2.5 text-white/30 pointer-events-none" />
            <input
              type="search"
              placeholder="Search mods…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className={`${fieldCls} pl-8`}
              autoComplete="off"
            />
          </div>
        </div>

        <div className="w-32">
          <label className="block text-[14px] font-bold uppercase tracking-widest text-[#8b8b8b] mb-1">Loader</label>
          <CustomSelect value={loader} onChange={setLoader} options={LOADERS} />
        </div>

        <div className="w-32">
          <label className="block text-[14px] font-bold uppercase tracking-widest text-[#8b8b8b] mb-1">MC Version</label>
          <CustomSelect value={mcVersion} onChange={setMcVersion} options={mcVersionOptions} placeholder="Any" />
        </div>

        <div className="w-40">
          <label className="block text-[14px] font-bold uppercase tracking-widest text-[#8b8b8b] mb-1">Sort by</label>
          <CustomSelect value={sortBy} onChange={setSortBy} options={SORT_OPTIONS} />
        </div>

        <div className="w-24">
          <label className="block text-[14px] font-bold uppercase tracking-widest text-[#8b8b8b] mb-1">Per page</label>
          <CustomSelect
            value={pageSize}
            onChange={v => { setPageSize(Number(v)); setPage(1); }}
            options={PAGE_SIZES}
          />
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 px-6 py-4">
        <Notice notice={notice} />

        {!loading && !error && pagination && (
          <p className="text-[14px] text-[#555555] mb-4">
            Showing {mods.length} of {pagination.total.toLocaleString()} mods
            {debouncedSearch ? ` for "${debouncedSearch}"` : ''}
            {mcVersion ? ` · ${mcVersion}` : ''}
            {` · page ${page} of ${pagination.totalPages}`}
          </p>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: Math.min(pageSize, 12) }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <p className="text-[16px] text-red-400">⚠ {error}</p>
            <button onClick={() => { setError(null); setLoading(true); }} className={btnSecondary}>
              <RefreshCw size={12} /> Try again
            </button>
          </div>
        ) : mods.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center text-[#555555]">
            <Puzzle size={28} className="opacity-30 mb-1" />
            <p className="text-base font-semibold text-[#8b8b8b]">No mods found</p>
            <p className="text-[15px]">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {mods.map(mod => (
              <ModCard
                key={mod.id}
                mod={mod}
                onViewVersions={setVersionsModal}
              />
            ))}
          </div>
        )}

        {!loading && !error && pagination && (
          <Pagination page={page} totalPages={pagination.totalPages} onPageChange={handlePageChange} />
        )}
      </div>

      {versionsModal && (
        <VersionsModal
          mod={versionsModal}
          onClose={() => setVersionsModal(null)}
          onInstall={handleInstallVersion}
          installingVersionId={
            Object.entries(installing).find(([k, v]) =>
              k.startsWith(versionsModal.id + ':') && v !== true
            )?.[1] ?? null
          }
        />
      )}
    </div>
  );
}
