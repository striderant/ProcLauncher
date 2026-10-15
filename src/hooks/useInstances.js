import { useState, useEffect, useCallback, useRef } from 'react';
import { FALLBACK_MC_VERSIONS } from '../mcVersions';
import { pushDownloadTask, finishDownloadTask } from '../downloads';

// Shared instance data layer for the Telegram list+detail shell:
// CRUD, mods, and updates in one place.
export function useInstancesData({ allVanillaVersions = [], activeInstanceId, onSelectInstance, onRunInstance }) {
  const hasElectron = typeof window !== 'undefined' && !!window.electron;
  const api = hasElectron ? window.electron.instance : null;
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNoticeState] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [modsByInstance, setModsByInstance] = useState({});
  const [modsLoading, setModsLoading] = useState({});
  const [updatesByInstance, setUpdatesByInstance] = useState({});
  const [checkingUpdates, setCheckingUpdates] = useState({});
  const [updatingProject, setUpdatingProject] = useState(null);
  const [toggling, setToggling] = useState({});
  const [runningId, setRunningId] = useState(null);

  const noticeTimer = useRef(null);
  const setNotice = useCallback((message, isError = false) => {
    clearTimeout(noticeTimer.current);
    setNoticeState(message ? { message, error: isError } : null);
    if (message) noticeTimer.current = setTimeout(() => setNoticeState(null), 5000);
  }, []);

  const mcSource = (allVanillaVersions || []).length > 0 ? allVanillaVersions : FALLBACK_MC_VERSIONS;
  const mcOptions = mcSource.map(v =>
    typeof v === 'string' ? { value: v, label: v } : { value: v.id, label: v.label || v.id });

  const refresh = useCallback(async (selectId) => {
    if (!hasElectron) { setLoading(false); setError('Instance management requires the Electron app.'); return; }
    if (!api) {
      setLoading(false);
      setError('Launcher bridge is outdated - close this window and start the app with "npm run start" (not an old packaged build).');
      return;
    }
    try {
      const res = await api.list();
      if (!res?.success) throw new Error(res?.error || 'Could not load instances.');
      setInstances(res.data || []);
      setError(null);
      const sel = await api.getSelected().catch(() => null);
      const currentId = selectId !== undefined ? selectId : sel?.selectedId || null;
      if (selectId !== undefined || sel) onSelectInstance?.(currentId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [api, hasElectron, onSelectInstance]);

  useEffect(() => { refresh(); }, [refresh]);

  const needApi = () => {
    if (api) return true;
    setNotice(
      hasElectron
        ? 'Launcher bridge is outdated - close this window and start the app with "npm run start" (not an old packaged build).'
        : 'Instance management requires the Electron app.',
      true
    );
    return false;
  };

  const loadMods = useCallback(async (id) => {
    if (!needApi()) return;
    setModsLoading(p => ({ ...p, [id]: true }));
    try {
      const res = await api.getMods(id);
      if (!res?.success) throw new Error(res?.error || 'Could not load mods.');
      setModsByInstance(p => ({ ...p, [id]: res.data || [] }));
    } catch (err) {
      setNotice(err.message, true);
    } finally {
      setModsLoading(p => ({ ...p, [id]: false }));
    }
  }, [api, setNotice]);

  const toggleExpand = (id) => {
    setExpandedId(prev => {
      const next = prev === id ? null : id;
      if (next && !modsByInstance[id]) loadMods(id);
      return next;
    });
  };

  const handleCreate = async (fields) => {
    if (!needApi()) return null;
    setCreating(true);
    try {
      const res = await api.create(fields);
      if (!res?.success) throw new Error(res?.error || 'Could not create instance.');
      setCreateOpen(false);
      setNotice(`Instance "${res.data.name}" created.`);
      await refresh(res.data.id);
      setExpandedId(res.data.id);
      loadMods(res.data.id);
      return res.data;
    } catch (err) {
      setNotice(err.message, true);
      return null;
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (instance, patch) => {
    if (!needApi()) return;
    setSaving(true);
    try {
      const res = await api.update(instance.id, patch);
      if (!res?.success) throw new Error(res?.error || 'Could not save instance.');
      setNotice('Instance saved.');
      await refresh(activeInstanceId);
    } catch (err) {
      setNotice(err.message, true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (instance) => {
    if (!needApi()) return;
    try {
      const res = await api.delete(instance.id);
      if (!res?.success) throw new Error(res?.error || 'Could not delete instance.');
      setNotice(`Instance "${instance.name}" deleted.`);
      if (expandedId === instance.id) setExpandedId(null);
      await refresh(res.data?.selectedId ?? null);
    } catch (err) {
      setNotice(err.message, true);
    }
  };

  const handleSelect = async (id) => {
    if (!needApi()) return;
    try {
      const res = await api.select(id);
      if (!res?.success) throw new Error(res?.error || 'Could not select instance.');
      onSelectInstance?.(id);
    } catch (err) {
      setNotice(err.message, true);
    }
  };

  const handleRun = async (instance) => {
    if (runningId) return;
    setRunningId(instance.id);
    try {
      await onRunInstance?.(instance);
    } finally {
      setRunningId(null);
    }
  };

  const handleToggleMod = async (instanceId, mod) => {
    if (!needApi()) return;
    const key = `${instanceId}:${mod.filename}`;
    setToggling(p => ({ ...p, [key]: true }));
    try {
      const res = await api.setModEnabled(instanceId, mod.filename, !(mod.enabled !== false));
      if (!res?.success) throw new Error(res?.error || 'Could not toggle mod.');
      setModsByInstance(p => ({
        ...p,
        [instanceId]: (p[instanceId] || []).map(m =>
          m.filename === mod.filename ? { ...m, enabled: !(mod.enabled !== false) } : m),
      }));
      await refresh(activeInstanceId);
    } catch (err) {
      setNotice(err.message, true);
    } finally {
      setToggling(p => { const n = { ...p }; delete n[key]; return n; });
    }
  };

  const handleDeleteMod = async (instanceId, mod) => {
    if (!needApi()) return;
    try {
      const res = await api.deleteMod(instanceId, mod.filename);
      if (!res?.success) throw new Error(res?.error || 'Could not delete mod.');
      setModsByInstance(p => ({
        ...p,
        [instanceId]: (p[instanceId] || []).filter(m => m.filename !== mod.filename),
      }));
      await refresh(activeInstanceId);
    } catch (err) {
      setNotice(err.message, true);
    }
  };

  const handleCheckUpdates = async (instance) => {
    if (!needApi()) return;
    setCheckingUpdates(p => ({ ...p, [instance.id]: true }));
    try {
      const res = await api.checkModUpdates(instance.id);
      if (!res?.success) throw new Error(res?.error || 'Update check failed.');
      const list = res.data || [];
      setUpdatesByInstance(p => ({ ...p, [instance.id]: list }));
      const available = list.filter(u => !u.error);
      setNotice(available.length === 0 ? 'All mods are up to date.' : `${available.length} update(s) available.`);
    } catch (err) {
      setNotice(err.message, true);
    } finally {
      setCheckingUpdates(p => ({ ...p, [instance.id]: false }));
    }
  };

  const handleUpdateMod = async (instance, mod) => {
    if (!api || !mod.project_id) return;
    const taskId = pushDownloadTask('mod', `Updating ${mod.filename}`, { instanceIcon: instance.icon });
    setUpdatingProject(mod.project_id);
    try {
      const res = await api.updateMod(instance.id, mod.project_id);
      if (!res?.success) throw new Error(res?.error || 'Update failed.');
      setNotice(res.data?.updated === false ? 'Already on the latest version.' : `${mod.filename} updated.`);
      await loadMods(instance.id);
      await refresh(activeInstanceId);
      finishDownloadTask(taskId);
    } catch (err) {
      setNotice(err.message, true);
      finishDownloadTask(taskId, false, 'Update failed', err.message);
    } finally {
      setUpdatingProject(null);
    }
  };

  const handleOpenFolder = async (instanceId) => {
    if (!needApi()) return;
    try {
      const res = await api.openModsFolder(instanceId);
      if (!res?.success) throw new Error(res?.error || 'Could not open folder.');
    } catch (err) {
      setNotice(err.message, true);
    }
  };

  const handleOpenLibrary = () => {
    try {
      const p = window.electron?.openModsFolder?.();
      if (p?.then) {
        p.then(res => {
          if (res && res.success === false) setNotice(`Couldn't open library folder: ${res.error}`, true);
        }).catch(() => {});
      }
    } catch {}
  };

  const planUpgrade = async (instanceId, targetMc) => {
    if (!needApi()) return null;
    try {
      const res = await api.planUpgrade(instanceId, targetMc);
      if (!res?.success) throw new Error(res?.error || 'Could not check compatibility.');
      return res.data;
    } catch (err) {
      setNotice(err.message, true);
      return null;
    }
  };

  const executeUpgrade = async (payload) => {
    if (!needApi()) return null;
    try {
      const res = await api.upgradeInstance(payload);
      if (!res?.success) throw new Error(res?.error || 'Upgrade failed.');
      await refresh(res.data?.instance?.id);
      return res.data;
    } catch (err) {
      setNotice(err.message, true);
      return null;
    }
  };

  return {
    hasElectron, api,
    instances, loading, error, notice, setNotice,
    mcOptions, createOpen, setCreateOpen, creating, saving,
    expandedId, toggleExpand,
    modsByInstance, modsLoading, updatesByInstance, checkingUpdates, updatingProject, toggling, runningId,
    refresh, loadMods,
    handleCreate, handleSave, handleDelete, handleSelect, handleRun,
    handleToggleMod, handleDeleteMod, handleCheckUpdates, handleUpdateMod,
    handleOpenFolder, handleOpenLibrary, planUpgrade, executeUpgrade,
  };
}
