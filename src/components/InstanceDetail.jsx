import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Trash2, RefreshCw, Download,
  Check, X, ArrowUp, FolderOpen, AlertCircle, Pencil,
} from 'lucide-react';
import { btnPrimary, btnSecondary, btnGhost, fieldCls } from '../theme';
import { CustomSelect } from './CustomSelect';
import { ICON_CHOICES, InstanceIcon } from './InstanceIcon';

export function Notice({ notice }) {
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

export function Spinner({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'mods-spin 0.8s linear infinite', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="40 20" />
    </svg>
  );
}

// ─── Create dialog ────────────────────────────────────────────────────────────

export function CreateDialog({ mcOptions, busy, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICON_CHOICES[0]);
  const [mcVersion, setMcVersion] = useState('');

  const submit = (e) => {
    e.preventDefault();
    onCreate({ name: name.trim(), icon, minecraft_version: mcVersion });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <form onSubmit={submit} className="relative w-full max-w-md bg-[#171717] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="font-bold text-base text-white">Create Instance</h2>
          <button type="button" onClick={onClose} className="text-[#555555] hover:text-white transition-colors rounded-lg p-1">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-[14px] font-bold uppercase tracking-widest text-white/40 mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="My Modpack" maxLength={60}
              className={fieldCls} autoFocus />
          </div>
          <div>
            <label className="block text-[14px] font-bold uppercase tracking-widest text-white/40 mb-1">Icon</label>
            <div className="flex flex-wrap gap-1.5">
              {ICON_CHOICES.map(choice => (
                <button key={choice} type="button" onClick={() => setIcon(choice)} title={choice}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[15px] font-semibold transition-colors ${
                    icon === choice ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'
                  }`}>
                  <InstanceIcon icon={choice} size={13} className="" />
                  {choice}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[14px] font-bold uppercase tracking-widest text-white/40 mb-1">Minecraft version</label>
            <CustomSelect value={mcVersion} onChange={setMcVersion} options={mcOptions} placeholder="Select version…" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4">
          <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
          <button type="submit" disabled={busy || !name.trim() || !mcVersion} className={btnPrimary}>
            {busy ? <Spinner size={12} /> : <Plus size={12} />}
            Create
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Local mod row ────────────────────────────────────────────────────────────

function ModRow({ mod, updates, toggling, updating, onToggle, onDelete, onUpdate }) {
  const update = updates?.find(u => u.project_id === mod.project_id && !u.error);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-white/5">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => onToggle(mod)}
          title={mod.enabled !== false ? 'Disable mod' : 'Enable mod'}
          className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${mod.enabled !== false ? 'bg-white' : 'bg-white/10'}`}
        >
          <div className={`h-4 w-4 rounded-full transition-all absolute top-0.5 ${mod.enabled !== false ? 'right-0.5 bg-black' : 'left-0.5 bg-white/50'}`} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[16px] font-semibold text-white truncate">{mod.filename}</span>
            {!mod.project_id && <span className="text-[13px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-white/50 uppercase">Local</span>}
            {update && <span className="text-[13px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 uppercase">Update</span>}
            {mod.enabled === false && <span className="text-[13px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-white/40 uppercase">Disabled</span>}
          </div>
          <div className="text-[14px] text-white/30 truncate">
            {mod.version_number ? `v${mod.version_number}` : 'unknown version'}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {update && (
          <button onClick={() => onUpdate(mod)} disabled={!!updating}
            className="px-2.5 py-1.5 rounded-lg bg-white text-black text-[15px] font-semibold hover:bg-white/90 disabled:opacity-40 flex items-center gap-1.5">
            {updating ? <Spinner size={11} /> : <Download size={11} />}
            {update.latest_version}
          </button>
        )}
        <button onClick={() => onDelete(mod)} className="p-1.5 text-white/40 hover:text-red-400 rounded-lg transition-colors" title="Delete mod">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Downloaded-mods picker ─────────────────────────────────────────────────────
// Every .jar already on disk (other instances, legacy folder) offered for
// one-click copy into this instance - no re-downloading.

function DownloadedModsPicker({ instanceId, presentFiles, onAdded, open }) {
  const api = typeof window !== 'undefined' ? window.electron?.instance : null;
  const [items, setItems] = useState(null);
  const [loadingList, setLoadingList] = useState(false);
  const [adding, setAdding] = useState(null);
  const [pickerError, setPickerError] = useState(null);

  useEffect(() => {
    if (open && items === null && api?.listLocalMods) {
      setLoadingList(true);
      api.listLocalMods()
        .then(res => { if (res?.success) setItems(res.data || []); })
        .catch(() => {})
        .finally(() => setLoadingList(false));
    }
  }, [open]);

  const add = async (item) => {
    if (!api?.addLocalMod) return;
    setAdding(item.filename);
    setPickerError(null);
    try {
      const res = await api.addLocalMod(instanceId, {
        filename: item.filename,
        sourceInstanceId: item.sourceInstanceId || null,
      });
      if (!res?.success) throw new Error(res?.error || 'Could not add mod.');
      onAdded?.();
    } catch (err) {
      setPickerError(err.message);
    } finally {
      setAdding(null);
    }
  };

  const present = new Set((presentFiles || []).map(f => String(f).toLowerCase()));
  const available = (items || []).filter(i => !present.has(String(i.filename).toLowerCase()));

  return open ? (
    <div className="mt-2 space-y-1.5 rounded-xl bg-black/30 p-2">
          {pickerError && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-[15px]">
              {pickerError}
            </div>
          )}
          {loadingList ? (
            <div className="text-center py-4 text-white/30 text-[16px]">Scanning local mods…</div>
          ) : available.length === 0 ? (
            <div className="text-center py-4 text-white/30 text-[16px]">
              No other downloaded mods found. Grab some from the Mods page first.
            </div>
          ) : (
            available.map(item => (
              <div key={item.filename} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/5">
                <div className="min-w-0">
                  <div className="text-[16px] font-semibold text-white truncate">{item.filename}</div>
                  <div className="text-[14px] text-white/30 truncate">
                    from {item.sourceInstanceName || 'elsewhere'}{item.version_number ? ` • v${item.version_number}` : ''}
                  </div>
                </div>
                <button onClick={() => add(item)} disabled={adding === item.filename}
                  className="px-2.5 py-1.5 rounded-lg bg-white text-black text-[15px] font-bold hover:bg-white/90 disabled:opacity-40 shrink-0">
                  {adding === item.filename ? 'Adding…' : 'Add'}
                </button>
              </div>
            ))
          )}
    </div>
  ) : null;
}

// ─── Instance detail (edit + local mods) ───────────────────────────────────────

export function InstanceDetail({ instance, mcOptions, mods, modsLoading, updates, checkingUpdates, updatingProject,
  toggling, onToggleMod, onDeleteMod, onCheckUpdates, onUpdateMod, onBrowseMods, onReloadMods, onSave, onDelete, saving,
  onUpgrade, onOpenFolder, onOpenLibrary, onCancel, onUnsavedChange, globalJvmArgs = '' }) {
  const [name, setName] = useState(instance.name);
  const [icon, setIcon] = useState(instance.icon);
  const [mcVersion, setMcVersion] = useState(instance.minecraft_version);
  const [jvmArgs, setJvmArgs] = useState(instance.customJvmArgs || '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setName(instance.name);
    setIcon(instance.icon);
    setMcVersion(instance.minecraft_version);
    setJvmArgs(instance.customJvmArgs || '');
    setConfirmDelete(false);
    setIconOpen(false);
    setPickerOpen(false);
  }, [instance.id]);

  const hasUnsavedChanges = useMemo(() => {
    return (
      name.trim() !== instance.name ||
      icon !== instance.icon ||
      mcVersion !== instance.minecraft_version ||
      jvmArgs !== (instance.customJvmArgs || '')
    );
  }, [name, icon, mcVersion, jvmArgs, instance]);

  useEffect(() => {
    onUnsavedChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedChange]);

  const actionBtn =
    'flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 text-white text-[15px] font-semibold transition-colors disabled:opacity-40';

  return (
    <>
      <div className="px-4 pb-4 pt-1 space-y-4 mt-3">
        {/* Edit */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-3">
        <div>
          <label className="block text-[14px] font-bold uppercase tracking-widest text-white/40 mb-1">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={60} className={fieldCls} />
        </div>
        <div>
          <label className="block text-[14px] font-bold uppercase tracking-widest text-white/40 mb-1">Icon</label>
          <div className="relative">
            <button type="button" onClick={() => setIconOpen(v => !v)} title="Click to pick an icon"
              className="relative w-[46px] h-[46px] rounded-xl bg-black/40 hover:bg-black/60 flex items-center justify-center transition-colors">
              <InstanceIcon icon={icon} size={22} className="" />
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white flex items-center justify-center shadow">
                <Pencil size={11} className="text-black" />
              </span>
            </button>
            {iconOpen && (
              <>
                <div className="fixed inset-0 z-40 cursor-default" onClick={() => setIconOpen(false)} />
                <div className="absolute z-50 mt-2 w-[248px] rounded-xl bg-[#171717] shadow-2xl shadow-black/60 p-2">
                  <div className="grid grid-cols-4 gap-1">
                    {ICON_CHOICES.map(choice => (
                      <button key={choice} type="button" title={choice}
                        onClick={() => { setIcon(choice); setIconOpen(false); }}
                        className={`flex flex-col items-center gap-1 px-1 py-2 rounded-lg text-[13px] font-semibold transition-colors ${
                          icon === choice ? 'bg-white text-black' : 'text-white/60 hover:text-white hover:bg-white/10'
                        }`}>
                        <InstanceIcon icon={choice} size={18} className={icon === choice ? 'text-black' : ''} />
                        {choice}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        <div>
          <label className="block text-[14px] font-bold uppercase tracking-widest text-white/40 mb-1">Minecraft</label>
          <CustomSelect value={mcVersion} onChange={setMcVersion} options={mcOptions} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <div className="md:col-span-3">
          <label className="block text-[14px] font-bold uppercase tracking-widest text-white/40 mb-1">Custom JVM arguments (overrides Settings)</label>
          <input value={jvmArgs} onChange={e => setJvmArgs(e.target.value)} placeholder={globalJvmArgs?.trim() ? `Global: ${globalJvmArgs.trim().slice(0, 80)}` : '-Xss2M -Dexample=true'} maxLength={2000} className={`${fieldCls} font-mono`} />
          <div className="text-[14px] text-white/30 mt-1">Leave empty to use Settings value.</div>
        </div>
        <div className="flex items-end gap-2">
          <button onClick={() => onSave({ name: name.trim(), icon, minecraft_version: mcVersion, customJvmArgs: jvmArgs })} disabled={saving || !name.trim() || !mcVersion} className={btnPrimary}>
            {saving ? <Spinner size={12} /> : <Check size={12} />}
            Save
          </button>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className={btnSecondary}>
              <Trash2 size={12} />
              Delete
            </button>
          ) : (
            <>
              <button onClick={() => onDelete()} className="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/15 text-red-300 text-[16px] font-semibold hover:bg-red-500/25 transition-colors">
                Confirm
              </button>
              <button onClick={() => setConfirmDelete(false)} className={btnGhost}>Cancel</button>
            </>
          )}
        </div>
      </div>

      {/* Upgrade to a newer Minecraft version (clones mods over) */}
      <button onClick={onUpgrade}
        className="w-full rounded-xl bg-white text-black hover:bg-white/90 transition-colors px-4 py-3 flex items-center justify-center gap-3">
        <ArrowUp size={18} className="shrink-0" />
        <span className="text-left">
          <span className="block text-[16px] font-bold leading-tight">Upgrade to New Version</span>
          <span className="block text-[14px] text-black/60 leading-tight">Copy your mods to a newer Minecraft</span>
        </span>
      </button>

      {/* Local mods + quick actions */}
      <div className="rounded-2xl bg-white/5 p-4">
        <div className="text-[14px] font-bold uppercase tracking-widest text-white/40">
          Local mods ({mods.filter(m => m.enabled !== false).length}/{mods.length})
        </div>
        <p className="text-[14px] text-white/30 mt-0.5 mb-3">Add, update and organize this instance's mods.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <button onClick={onBrowseMods}
            className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-white text-black text-[15px] font-bold hover:bg-white/90 transition-colors">
            <Plus size={16} />
            Find More Mods
          </button>
          <button onClick={() => setPickerOpen(v => !v)} className={actionBtn}>
            <Download size={16} />
            {pickerOpen ? 'Hide Downloaded Mods' : 'Add Downloaded Mods'}
          </button>
          <button onClick={onReloadMods} className={actionBtn} title="Rescan the mods folder">
            <RefreshCw size={16} />
            Refresh Mod List
          </button>
          <button onClick={onOpenLibrary} className={actionBtn} title="Open the shared downloaded-mods folder">
            <FolderOpen size={16} />
            Open Mods Folder
          </button>
        </div>
        <DownloadedModsPicker
          instanceId={instance.id}
          presentFiles={mods.map(m => m.filename)}
          onAdded={onReloadMods}
          open={pickerOpen}
        />
        <div className="mt-3">
        {modsLoading ? (
          <div className="flex items-center justify-center h-20 text-white/30 text-[16px]">Loading mods…</div>
        ) : mods.length === 0 ? (
          <div className="text-center py-6 text-white/30 text-[16px] rounded-xl">
            No mods yet - use the buttons above or drop .jar files into the instance mods folder.
          </div>
        ) : (
          <div className="space-y-1.5">
            {mods.map(mod => (
              <ModRow key={mod.filename} mod={mod} updates={updates}
                toggling={toggling} updating={updatingProject === mod.project_id}
                onToggle={onToggleMod} onDelete={onDeleteMod} onUpdate={onUpdateMod} />
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
    {hasUnsavedChanges && (
      <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pointer-events-none">
        <div className="max-w-4xl mx-auto pointer-events-auto">
          <div className="bg-yellow-500/10 rounded-xl px-4 py-3 flex items-center justify-between gap-4 shadow-2xl shadow-black/50 animate-slide-up">
            <div className="flex items-center gap-3 text-yellow-300">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span className="text-[16px] font-medium">Unsaved changes - save before switching instances or closing</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onCancel?.()}
                className="px-3 py-1.5 rounded-lg bg-white/10 text-white/70 text-[15px] font-semibold hover:bg-white/15 transition-colors"
              >
                Discard
              </button>
              <button
                onClick={() => onSave({ name: name.trim(), icon, minecraft_version: mcVersion, customJvmArgs: jvmArgs })}
                disabled={saving || !name.trim() || !mcVersion}
                className="px-3 py-1.5 rounded-lg bg-yellow-500 text-black text-[15px] font-bold hover:bg-yellow-400 transition-colors disabled:opacity-40 flex items-center gap-1.5"
              >
                {saving ? <span style={{width:12,height:12}} className="animate-spin" /> : <Check size={12} />}
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
