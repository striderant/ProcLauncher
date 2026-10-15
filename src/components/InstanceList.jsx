import React, { useState } from 'react';
import { Plus, Search, Gamepad2 } from 'lucide-react';
import { InstanceIcon } from './InstanceIcon';

// Telegram-style second column: search-first instance list with circular
// avatars, subtitles, and status badges. Pure UI - all data comes via props.
export default function InstanceList({ instances = [], loading, activeId, onSelect, onCreate }) {
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const filtered = q
    ? instances.filter(i =>
        String(i.name || '').toLowerCase().includes(q) ||
        String(i.minecraft_version || '').toLowerCase().includes(q))
    : instances;

  return (
    <div className="w-[280px] shrink-0 flex flex-col bg-black/30 overflow-hidden">
      <div className="p-3 shrink-0">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-2.5 text-white/30 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search instances"
            className="w-full pl-9 pr-3 py-2 rounded-full bg-white/5 text-[16px] text-white placeholder:text-white/25 transition-colors outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-white/30 text-[16px]">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-center px-4">
            <Gamepad2 size={26} className="text-white/20" />
            <div className="text-white/50 text-[16px] font-semibold">
              {instances.length === 0 ? 'No instances yet' : 'No matches'}
            </div>
            {instances.length === 0 && (
              <div className="text-white/30 text-[15px]">Create one to get started.</div>
            )}
          </div>
        ) : (
          filtered.map(instance => {
            const isActive = instance.id === activeId;
            return (
              <button
                key={instance.id}
                onClick={() => onSelect(instance.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                  isActive ? 'bg-white/10' : 'hover:bg-white/5'
                }`}
              >
                <div className="w-11 h-11 rounded-full bg-black/50 flex items-center justify-center shrink-0">
                  <InstanceIcon icon={instance.icon} size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[16px] font-semibold text-white truncate">{instance.name}</span>
                  </div>
                  <div className="text-[15px] text-white/35 truncate mt-0.5">
                    MC {instance.minecraft_version || '?'} • {instance.enabledCount ?? instance.modCount ?? 0} mods
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  {instance.hasUpdates ? (
                    <span className="w-2 h-2 rounded-full bg-amber-400" title="Mod updates available" />
                  ) : (
                    <span className="text-[13px] text-white/25 font-mono">
                      {instance.lastPlayedAt ? new Date(instance.lastPlayedAt).toLocaleDateString() : ''}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="p-3 shrink-0 flex justify-end">
        <button
          onClick={onCreate}
          title="Create instance"
          className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center hover:bg-white/90 active:scale-95 transition-all shadow-lg"
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}
