import React from 'react';
import { Check, Download } from 'lucide-react';

// Top-right self-update circle (same ring language as the download bubble):
// appears when a launcher update is available, fills while downloading,
// flips to install mode once staged. Clicking advances the flow.
export function UpdateBubble({ info = { state: 'idle' }, onAction }) {
  const { state = 'idle', version, percent = 0 } = info;
  if (state !== 'available' && state !== 'downloading' && state !== 'downloaded') return null;

  const pct = Math.min(100, Math.max(0, Math.round(percent || 0)));
  const done = state === 'downloaded';
  const title = done
    ? `Version ${version || ''} downloaded — click to restart and install`.trim()
    : state === 'downloading'
      ? `Downloading update ${version || ''} — ${pct}%`.trim()
      : `Launcher update ${version || ''} available — click to download`.trim();

  return (
    <button
      onClick={() => onAction?.(state)}
      title={title}
      className="fixed right-4 top-14 z-[60] w-14 h-14 rounded-full bg-[#141414]/95 backdrop-blur shadow-2xl shadow-black/60 hover:scale-105 active:scale-95 transition-transform"
    >
      <span className="absolute inset-0 flex items-center justify-center">
        {done ? (
          <Check size={22} className="text-emerald-400" strokeWidth={3} />
        ) : state === 'downloading' && pct > 0 ? (
          <span className="font-mono text-[15px] font-bold text-white">{pct}</span>
        ) : (
          <Download size={22} className="text-white/85" />
        )}
      </span>
      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
        <path
          className="text-white/15"
          strokeWidth="3"
          stroke="currentColor"
          fill="none"
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
        />
        <path
          className={`${done ? 'text-emerald-400' : 'text-white'} transition-all duration-300 ease-out`}
          strokeDasharray={`${done ? 100 : state === 'downloading' ? pct : 100}, 100`}
          strokeWidth="3"
          strokeLinecap="round"
          stroke="currentColor"
          fill="none"
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
        />
      </svg>
      {state === 'available' && (
        <span className="absolute -top-1 -right-1 px-1.5 h-5 rounded-full bg-emerald-400 text-black text-[11px] font-bold flex items-center justify-center">
          NEW
        </span>
      )}
    </button>
  );
}
