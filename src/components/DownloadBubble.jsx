import React, { useState } from 'react';
import { Check, Download, X } from 'lucide-react';
import { InstanceIcon } from './InstanceIcon';

// Persistent bottom-right download indicator: just a round circle showing the
// downloading mod's icon with the progress ring and percentage inside. When a
// download finishes, a toast pops out to the left of the circle with the
// result (instead of a banner at the top of the mod browser). Clicking jumps
// to the relevant tab.
export function DownloadBubble({ tasks = [], onOpen }) {
  const [badUrl, setBadUrl] = useState(null);
  const active = tasks.filter(t => !t.done);
  const shown = [...tasks].reverse().find(t => !t.done) || [...tasks].reverse()[0];
  if (!shown) return null;

  const pct = Math.min(100, Math.max(0, Math.round(shown.percent || 0)));
  const ring = shown.failed ? 'text-red-400' : shown.done ? 'text-emerald-400' : 'text-white';
  const showCheck = shown.done && !shown.failed;

  return (
    <div
      onClick={() => onOpen?.(shown.kind)}
      title={shown.label}
      className="fixed right-4 bottom-4 z-[60] flex items-center gap-2 cursor-pointer"
    >
      {shown.done && (
        <div className="animate-toast-in max-w-[240px] rounded-xl bg-[#141414]/95 backdrop-blur px-3.5 py-2.5 shadow-2xl shadow-black/60">
          <div className="flex items-center gap-1.5 text-[15px] font-bold text-white">
            {shown.failed
              ? <X size={15} className="text-red-400 shrink-0" />
              : <Check size={15} className="text-emerald-400 shrink-0" />}
            <span className="truncate">{shown.doneText || 'Done'}</span>
          </div>
          <div className="text-[13px] text-white/50 truncate mt-0.5">{shown.label}</div>
          {shown.detail && (
            <div className="text-[13px] text-white/40 truncate mt-0.5">{shown.detail}</div>
          )}
        </div>
      )}
      <div className="w-14 h-14 rounded-full bg-[#141414]/95 backdrop-blur shadow-2xl shadow-black/60 hover:scale-105 active:scale-95 transition-transform relative shrink-0">
        {/* Mod / instance icon (hidden once done - check stands alone) */}
        {!showCheck && (
          <span className="absolute inset-2 flex items-center justify-center overflow-hidden rounded-full">
            {shown.iconUrl && shown.iconUrl !== badUrl ? (
              <img
                src={shown.iconUrl}
                alt=""
                className="w-full h-full object-cover rounded-full"
                onError={() => setBadUrl(shown.iconUrl)}
              />
            ) : shown.instanceIcon ? (
              <InstanceIcon icon={shown.instanceIcon} size={20} className="text-white/85" />
            ) : (
              <Download size={18} className="text-white/70" />
            )}
          </span>
        )}
        {/* Dim so the percentage reads over artwork */}
        {!showCheck && <span className="absolute inset-0 rounded-full bg-black/55" />}
        {/* Progress ring */}
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
          <path
            className="text-white/15"
            strokeWidth="3"
            stroke="currentColor"
            fill="none"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
          <path
            className={`${ring} transition-all duration-300 ease-out`}
            strokeDasharray={`${pct}, 100`}
            strokeWidth="3"
            strokeLinecap="round"
            stroke="currentColor"
            fill="none"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
        </svg>
        {/* Percentage / done */}
        <span className="absolute inset-0 flex items-center justify-center">
          {showCheck ? (
            <Check size={22} className="text-emerald-400" strokeWidth={3} />
          ) : (
            <span className={`font-mono text-[15px] font-bold ${shown.failed ? 'text-red-400' : 'text-white'}`}>
              {pct}
            </span>
          )}
        </span>
        {/* Overflow count */}
        {active.length > 1 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-white text-black text-[11px] font-bold flex items-center justify-center">
            +{active.length - 1}
          </span>
        )}
      </div>
    </div>
  );
}
