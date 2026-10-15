// ─── Proc Launcher - central color palette ────────────────────────────────────
// Black & white by default. Green / red / yellow are reserved for semantic
// states only (success / error / warning). To re-theme the whole launcher,
// edit the tokens below - components import these instead of hard-coding
// colors. (All values are static string literals so Tailwind JIT picks them up.)

export const palette = {
  background: '#0a0a0a',
  surface: 'rgba(255, 255, 255, 0.05)',
  surfaceHover: 'rgba(255, 255, 255, 0.10)',
  text: '#ffffff',
  textDim: 'rgba(255, 255, 255, 0.70)',
  textMuted: 'rgba(255, 255, 255, 0.40)',
  accent: '#ffffff',
  accentContrast: '#000000',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
};

// ─── Shared Tailwind tokens ───────────────────────────────────────────────────
// Borderless: no border utilities here - separation comes from background only.
export const btnPrimary =
  'inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-white text-black text-[15px] font-semibold hover:bg-white/90 active:bg-white/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

export const btnSecondary =
  'inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 text-white/70 text-[15px] hover:bg-white/10 active:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

export const btnGhost =
  'inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded-lg text-[14px] text-white/50 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors disabled:opacity-40';

export const fieldCls =
  'w-full bg-white/5 rounded-xl px-3 py-2 text-[15px] text-white placeholder-white/30 focus:outline-none focus:bg-white/10 transition-colors';

// Neutral monochrome badge (non-semantic labels such as loader names)
export const badgeMono =
  'inline-flex items-center px-2 py-0.5 rounded-full text-[13px] font-bold uppercase tracking-wide bg-white/10 text-white/70';

// Neutral status / info box (busy states, informational notices)
export const statusInfo =
  'bg-white/5 text-white/70';

// Muted icon tone for decorative icons
export const iconMuted = 'text-white/60';
export const iconFaint = 'text-white/40';
