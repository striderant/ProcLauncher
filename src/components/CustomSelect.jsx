import React, { useState, useEffect, useRef } from 'react';
import { Check, ChevronDown } from 'lucide-react';

// Shared dark dropdown - replaces native <select> menus (whose OS-rendered
// popups can't be themed) everywhere in the launcher.
// Props: value, onChange(value), options: [{ value, label }], placeholder?
export function CustomSelect({ value, onChange, options = [], placeholder, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  const allOptions = placeholder ? [{ value: '', label: placeholder }, ...options] : options;
  const selected = allOptions.find(o => String(o.value) === String(value));
  const isEmpty = selected?.value === '' || selected == null;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-base transition-colors focus:outline-none ${
          open ? 'bg-white/10 text-white' : 'bg-white/5 text-white hover:bg-white/10'
        }`}
      >
        <span className={`truncate ${isEmpty ? 'text-white/25' : 'text-white'}`}>
          {selected?.label ?? placeholder ?? '-'}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-white/40 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full min-w-[140px] bg-[#161616] rounded-xl shadow-2xl shadow-black/60 overflow-hidden">
          <div className="max-h-56 overflow-y-auto py-1">
            {allOptions.map(opt => {
              const active = String(opt.value) === String(value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-base text-left transition-colors ${
                    active
                      ? 'bg-white/10 text-white'
                      : 'text-white/70 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {active && <Check size={13} className="text-white shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
