import React, { useState, useEffect, useRef } from 'react';
import { X, ArrowUp, Check, Download } from 'lucide-react';
import { btnPrimary, btnSecondary, btnGhost, fieldCls } from '../theme';
import { CustomSelect } from './CustomSelect';
import { pushDownloadTask, updateDownloadTask, finishDownloadTask } from '../downloads';
import { Spinner } from './InstanceDetail';

// Upgrade wizard: clone an instance onto a new Minecraft version.
// Step 1 picks the target, step 2 checks every mod for a compatible build,
// step 3 reviews per-mod downloads (or accept-all), step 4 reports results.
export function InstanceUpgradeModal({ instance, mcOptions, planUpgrade, executeUpgrade, onClose, onRun }) {
  const [targetMc, setTargetMc] = useState('');
  const [cloneName, setCloneName] = useState(`${instance.name} `);
  const [step, setStep] = useState('target');
  const [plan, setPlan] = useState(null);
  const [checked, setChecked] = useState(new Set());
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const upgradeTask = useRef(null);

  useEffect(() => {
    const unsub = window.electron?.onLaunchProgress?.((p) => {
      if (p?.type === 'instance-upgrade' && typeof p.percent === 'number') {
        setProgress(p.percent);
        if (upgradeTask.current != null) updateDownloadTask(upgradeTask.current, p.percent);
      }
    });
    return () => { try { unsub?.(); } catch {} };
  }, []);

  const toggleCheck = (projectId) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const startCheck = async () => {
    if (!targetMc || targetMc === instance.minecraft_version) return;
    setBusy(true);
    setError(null);
    try {
      const data = await planUpgrade(instance.id, targetMc);
      if (!data) return;
      setPlan(data);
      setChecked(new Set(
        (data.mods || []).filter(m => m.status === 'updatable' && m.project_id).map(m => m.project_id)
      ));
      setStep('review');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const startUpgrade = async (acceptAll) => {
    const mods = plan?.mods || [];
    const downloads = mods
      .filter(m => m.status === 'updatable' && m.project_id && (acceptAll || checked.has(m.project_id)))
      .map(m => m.project_id);
    setBusy(true);
    setError(null);
    setProgress(0);
    setStep('upgrading');
    upgradeTask.current = pushDownloadTask('upgrade', `Upgrading ${instance.name} to ${targetMc}`, { instanceIcon: instance.icon });
    try {
      const data = await executeUpgrade({
        sourceId: instance.id,
        name: cloneName.trim(),
        minecraft_version: targetMc,
        downloads,
      });
      if (!data) {
        setStep('review');
        finishDownloadTask(upgradeTask.current, false, 'Upgrade failed');
        upgradeTask.current = null;
        return;
      }
      setResult(data);
      setStep('done');
      finishDownloadTask(upgradeTask.current);
      upgradeTask.current = null;
    } catch (err) {
      setError(err.message);
      setStep('review');
      finishDownloadTask(upgradeTask.current, false, 'Upgrade failed', err.message);
      upgradeTask.current = null;
    } finally {
      setBusy(false);
    }
  };

  const updatable = (plan?.mods || []).filter(m => m.status === 'updatable');
  const kept = (plan?.mods || []).filter(m => m.status === 'kept');
  const failed = (plan?.mods || []).filter(m => m.status === 'failed');
  const local = (plan?.mods || []).filter(m => m.status === 'local');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={busy && step === 'upgrading' ? undefined : onClose} />
      <div className="relative w-full max-w-lg bg-[#171717] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 shrink-0">
          <div>
            <h2 className="font-bold text-base text-white">Upgrade Instance</h2>
            <p className="text-[14px] text-white/40 mt-0.5">
              Copy {instance.name} onto a new Minecraft version
            </p>
          </div>
          <button onClick={onClose} className="text-[#555555] hover:text-white transition-colors rounded-lg p-1 shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-3 px-4 py-2.5 rounded-xl bg-red-500/10 text-red-300 text-[16px]">
              {error}
            </div>
          )}

          {step === 'target' && (
            <div className="space-y-4">
              <div>
                <label className="block text-[14px] font-bold uppercase tracking-widest text-white/40 mb-1">New instance name</label>
                <input value={cloneName} onChange={e => setCloneName(e.target.value)} maxLength={60} className={fieldCls} />
              </div>
              <div>
                <label className="block text-[14px] font-bold uppercase tracking-widest text-white/40 mb-1">Target Minecraft version</label>
                <CustomSelect
                  value={targetMc}
                  onChange={setTargetMc}
                  options={mcOptions.filter(o => o.value !== instance.minecraft_version)}
                  placeholder="Select version…"
                />
                <p className="text-[15px] text-white/30 mt-2">
                  Currently on {instance.minecraft_version}. A compatibility check runs next - nothing is copied yet.
                </p>
              </div>
            </div>
          )}

          {step === 'review' && plan && (
            <div className="space-y-4">
              <p className="text-[16px] text-white/50">
                {updatable.length} to update • {kept.length} already compatible • {failed.length} unavailable • {local.length} local
              </p>
              {updatable.length > 0 && (
                <div>
                  <div className="text-[14px] font-bold uppercase tracking-widest text-white/40 mb-1.5">New builds to download</div>
                  <div className="space-y-1.5">
                    {updatable.map(m => (
                      <label key={m.project_id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked.has(m.project_id)}
                          onChange={() => toggleCheck(m.project_id)}
                          className="w-4 h-4 accent-white shrink-0"
                        />
                        <span className="flex-1 min-w-0">
                          <span className="block text-[16px] font-semibold text-white truncate">{m.filename}</span>
                          <span className="block text-[14px] text-white/30 truncate">
                            {m.current_version} → {m.latest_version}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {kept.length > 0 && (
                <div>
                  <div className="text-[14px] font-bold uppercase tracking-widest text-white/40 mb-1.5">Already compatible</div>
                  <div className="space-y-1">
                    {kept.map(m => (
                      <div key={m.filename} className="flex items-center gap-2 px-3 py-1.5 text-[16px] text-white/60">
                        <Check size={12} className="text-green-400 shrink-0" />
                        <span className="truncate">{m.filename}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {failed.length > 0 && (
                <div>
                  <div className="text-[14px] font-bold uppercase tracking-widest text-white/40 mb-1.5">
                    No build for {plan.targetMc} - copied disabled
                  </div>
                  <div className="space-y-1">
                    {failed.map(m => (
                      <div key={m.filename} className="px-3 py-1.5 text-[16px]">
                        <span className="text-white/60 truncate block">{m.filename}</span>
                        <span className="text-[14px] text-red-400/80">{m.error || 'Unavailable'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {local.length > 0 && (
                <div>
                  <div className="text-[14px] font-bold uppercase tracking-widest text-white/40 mb-1.5">Local files carried over</div>
                  <div className="space-y-1">
                    {local.map(m => (
                      <div key={m.filename} className="px-3 py-1.5 text-[16px] text-white/60 truncate">{m.filename}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'upgrading' && (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <Spinner size={24} />
              <div className="text-white/70 text-base font-semibold">Upgrading to {targetMc}… {progress}%</div>
              <div className="w-full max-w-xs h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-white transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="text-white/30 text-[15px]">Copying mods and downloading updates…</div>
            </div>
          )}

          {step === 'done' && result && (
            <div className="space-y-3">
              <div className="text-center py-2">
                <div className="text-white font-bold text-base">“{result.instance?.name}” is ready</div>
                <div className="text-white/40 text-[16px] mt-1">
                  {result.summary.updated.length} updated • {result.summary.kept.length} compatible • {result.summary.failed.length} unavailable • {result.summary.local.length} local
                </div>
              </div>
              {result.summary.failed.length > 0 && (
                <div className="rounded-xl bg-amber-500/10 p-3">
                  <div className="text-[14px] font-bold uppercase tracking-widest text-amber-300/80 mb-1.5">Copied disabled</div>
                  {result.summary.failed.map((f, i) => (
                    <div key={i} className="text-[15px] text-amber-200/70 truncate">{f}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 shrink-0">
          {step === 'target' && (
            <>
              <button onClick={onClose} className={btnSecondary}>Cancel</button>
              <button onClick={startCheck} disabled={busy || !targetMc} className={btnPrimary}>
                {busy ? <Spinner size={12} /> : <ArrowUp size={12} />}
                Check Compatibility
              </button>
            </>
          )}
          {step === 'review' && (
            <>
              <button onClick={() => setStep('target')} className={btnGhost}>Back</button>
              <button onClick={() => startUpgrade(false)} disabled={busy} className={btnSecondary}>
                <Download size={12} />
                Upgrade Selected
              </button>
              <button onClick={() => startUpgrade(true)} disabled={busy || updatable.length === 0} className={btnPrimary}>
                {busy ? <Spinner size={12} /> : <Check size={12} />}
                Accept All & Download
              </button>
            </>
          )}
          {step === 'done' && (
            <>
              <button onClick={onClose} className={btnSecondary}>Done</button>
              <button
                onClick={() => { onRun?.(result.instance); onClose(); }}
                className="px-3.5 py-1.5 rounded-xl bg-white text-black text-[16px] font-bold hover:bg-white/90 transition-colors"
              >
                Run New Instance
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
