import React, { useEffect, useState } from 'react';
import { Play, AlertCircle } from 'lucide-react';
import { badgeMono } from '../theme';
import { useInstancesData } from '../hooks/useInstances';
import InstanceList from './InstanceList';
import { InstanceDetail, CreateDialog, Notice, Spinner } from './InstanceDetail';
import { InstanceUpgradeModal } from './InstanceUpgradeModal';
import { InstanceIcon } from './InstanceIcon';

// Telegram-style instances view: list column + detail pane.
export default function TeleInstances({
  allVanillaVersions = [],
  activeInstanceId,
  onSelectInstance,
  onRunInstance,
  onBrowseMods,
  globalJvmArgs = '',
}) {
  const store = useInstancesData({ allVanillaVersions, activeInstanceId, onSelectInstance, onRunInstance });
  const [upgradeFor, setUpgradeFor] = useState(null);
  const [unsavedInstanceId, setUnsavedInstanceId] = useState(null);
  const {
    instances, loading, error, notice,
    modsByInstance, modsLoading, updatesByInstance, checkingUpdates, updatingProject, toggling, runningId, saving,
  } = store;

  useEffect(() => {
    if (activeInstanceId && !store.modsByInstance[activeInstanceId]) {
      store.loadMods(activeInstanceId);
    }
  }, [activeInstanceId]);

  const withUpdates = instances.map(inst => ({
    ...inst,
    hasUpdates: (store.updatesByInstance[inst.id] || []).some(u => !u.error),
  }));
  const active = withUpdates.find(i => i.id === activeInstanceId) || null;
  const mods = active ? modsByInstance[active.id] || [] : [];

  const selectAndLoad = (id) => {
    if (unsavedInstanceId && unsavedInstanceId !== id) {
      store.setNotice({ message: 'Save or discard changes before switching instances.', error: true });
      return;
    }
    store.handleSelect(id);
    if (!modsByInstance[id]) store.loadMods(id);
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      <style>{`
        @keyframes mods-spin  { to { transform: rotate(360deg); } }
      `}</style>

      <InstanceList
        instances={withUpdates}
        loading={loading}
        activeId={activeInstanceId}
        onSelect={selectAndLoad}
        onCreate={() => store.setCreateOpen(true)}
      />

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-white/30 text-[16px]">Loading instances…</div>
        ) : error && instances.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-red-400 text-[16px] px-8 text-center">{error}</div>
        ) : !active ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
            <InstanceIcon icon="Ghost" size={30} className="text-white/20" />
            <div className="text-white/50 text-base font-semibold">Select an instance</div>
            <div className="text-white/30 text-[16px] max-w-xs">Pick one from the list to manage its mods and settings - or create a new one.</div>
          </div>
        ) : (
          <>
            {/* Detail header */}
            <div className="px-6 py-4 shrink-0 flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-black/50 flex items-center justify-center shrink-0">
                <InstanceIcon icon={active.icon} size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[17px] font-bold text-white truncate">{active.name}</span>
                  <span className={badgeMono}>{active.minecraft_version || '?'}</span>
                  {active.loader_version && <span className={badgeMono}>fabric {active.loader_version}</span>}
                </div>
                <div className="text-[15px] text-white/30 mt-0.5">
                  {active.enabledCount ?? active.modCount ?? 0} mods enabled
                  {active.lastPlayedAt ? ` • played ${new Date(active.lastPlayedAt).toLocaleDateString()}` : ' • never played'}
                </div>
              </div>
              <button onClick={() => store.handleRun(active)} disabled={runningId === active.id}
                className="px-4 py-2 rounded-xl bg-transparent text-white text-[16px] font-bold hover:bg-white/10 transition-colors disabled:opacity-40 flex items-center gap-1.5 shrink-0">
                {runningId === active.id ? <Spinner size={12} /> : <Play size={13} fill="currentColor" />}
                Run Minecraft
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-2">
              <Notice notice={notice} />
              <InstanceDetail
                instance={active}
                mcOptions={store.mcOptions}
                mods={mods}
                modsLoading={!!modsLoading[active.id]}
                updates={updatesByInstance[active.id] || []}
                checkingUpdates={!!checkingUpdates[active.id]}
                updatingProject={updatingProject}
                toggling={toggling}
                saving={saving}
                onToggleMod={(mod) => store.handleToggleMod(active.id, mod)}
                onReloadMods={() => store.loadMods(active.id)}
                onDeleteMod={(mod) => store.handleDeleteMod(active.id, mod)}
                onCheckUpdates={() => store.handleCheckUpdates(active)}
                onUpdateMod={(mod) => store.handleUpdateMod(active, mod)}
                onBrowseMods={() => onBrowseMods?.(active.id)}
                onSave={(patch) => { store.handleSave(active, patch); setUnsavedInstanceId(null); }}
                globalJvmArgs={globalJvmArgs}
                onCancel={() => setUnsavedInstanceId(null)}
                onUpgrade={() => setUpgradeFor(active)}
                onDelete={() => { store.handleDelete(active); setUnsavedInstanceId(null); }}
                onUnsavedChange={(hasChanges) => setUnsavedInstanceId(hasChanges ? active.id : null)}
              />
            </div>
          </>
        )}
      </div>

      {store.createOpen && (
        <CreateDialog
          mcOptions={store.mcOptions}
          busy={store.creating}
          onClose={() => store.setCreateOpen(false)}
          onCreate={store.handleCreate}
        />
      )}

      {upgradeFor && (
        <InstanceUpgradeModal
          instance={upgradeFor}
          mcOptions={store.mcOptions}
          planUpgrade={store.planUpgrade}
          executeUpgrade={store.executeUpgrade}
          onClose={() => setUpgradeFor(null)}
          onRun={onRunInstance}
        />
      )}
    </div>
  );
}
