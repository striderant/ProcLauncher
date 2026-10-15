import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Gamepad2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { badgeMono } from '../theme';

// Telegram-style account manager: account list column on the left, focused
// account detail (or the add-account form) on the right.
export default function AccountManagerModal({
  open,
  accounts,
  selected,
  busy,
  status,
  error,
  msFlow,
  msElapsedText,
  msCode,
  msCopied,
  onCopyMsCode,
  onCancelMicrosoft,
  onClose,
  onCreateOffline,
  onMicrosoft,
  onSelect,
  onRemove,
  onRefresh,
}) {
  const [username, setUsername] = useState('');
  const [focusId, setFocusId] = useState(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (open) {
      setUsername('');
      setFocusId(null);
      setAdding((accounts || []).length === 0);
    }
    // Reset only on open transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const list = accounts || [];
  const focused = list.find(a => a.id === focusId) || selected || list[0] || null;
  const showForm = adding || !focused;

  async function addOffline(event) {
    event.preventDefault();
    const created = await onCreateOffline(username.trim());
    if (created) {
      setUsername('');
      setAdding(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[19000] flex items-center justify-center bg-black/55 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-[720px] max-h-[80vh] flex flex-col rounded-2xl bg-[#111111] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-white">Account Manager</h2>
            <p className="mt-0.5 text-[15px] text-white/40">Switch accounts or add a new one.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-white/40 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* List column */}
          <div className="w-[240px] shrink-0 flex flex-col bg-black/30 overflow-hidden">
            <div className="px-3 pt-2 pb-1.5 flex items-center justify-between shrink-0">
              <span className="text-[14px] font-bold uppercase tracking-widest text-white/40">
                Accounts ({list.length})
              </span>
              <button
                onClick={() => setAdding(true)}
                title="Add account"
                className="w-7 h-7 rounded-full bg-white text-black flex items-center justify-center hover:bg-white/90 active:scale-95 transition-all shrink-0"
              >
                <Plus size={15} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
              {list.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-center px-4">
                  <Gamepad2 size={24} className="text-white/20" />
                  <div className="text-white/50 text-[15px] font-semibold">No accounts yet</div>
                </div>
              ) : (
                list.map(account => {
                  const isFocused = focused && account.id === focused.id;
                  return (
                    <button
                      key={account.id}
                      onClick={() => { setFocusId(account.id); setAdding(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                        isFocused ? 'bg-white/10' : 'hover:bg-white/5'
                      }`}
                    >
                      <img
                        src={account.avatarUrl}
                        alt=""
                        onError={(event) => {
                          const img = event.currentTarget;
                          if (!img.dataset.fbk) {
                            img.dataset.fbk = '1';
                            img.src = 'https://mc-heads.net/avatar/MHF_Steve/64';
                          }
                        }}
                        className="w-10 h-10 rounded-full bg-black/50 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[16px] font-semibold text-white truncate">{account.username}</div>
                        <div className="text-[14px] text-white/35 truncate mt-0.5">
                          {account.type === 'microsoft' ? 'Microsoft' : 'Offline'}
                          {account.selected ? ' • Active' : ''}
                        </div>
                      </div>
                      {account.selected && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" title="Active account" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Detail pane */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-5">
              {showForm ? (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    {focused && (
                      <button
                        onClick={() => setAdding(false)}
                        className="flex items-center gap-1 text-[15px] text-white/40 hover:text-white transition-colors"
                      >
                        <ArrowLeft size={15} />
                        Accounts
                      </button>
                    )}
                  </div>
                  <h3 className="text-[16px] font-bold text-white">Add Account</h3>
                  <p className="text-[14px] text-white/40 mt-0.5 mb-4">Create an offline profile or sign in with Microsoft.</p>
                  <form onSubmit={addOffline} className="space-y-2">
                    <input
                      value={username}
                      maxLength={16}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="Offline username"
                      className="w-full h-11 rounded-xl bg-white/5 px-4 text-base text-white placeholder:text-white/25 outline-none transition-colors"
                    />
                    <button
                      disabled={busy || !username.trim()}
                      className="w-full h-11 px-4 rounded-xl bg-white hover:bg-white/90 text-base font-semibold text-black disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                    >
                      <Plus size={14} />
                      Add Offline Account
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={onMicrosoft}
                      className="w-full h-11 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-base font-medium text-white/85 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 21 21">
                        <path d="M1 1h9v9H1zM11 1h9v9h-9zM1 11h9v9H1zM11 11h9v9h-9z" />
                      </svg>
                      Sign in with Microsoft
                    </button>
                  </form>
                  <p className="mt-2 text-[14px] text-white/30">Offline names: 3–16 characters, letters, numbers, underscores.</p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-4">
                    <img
                      src={focused.avatarUrl}
                      alt=""
                      onError={(event) => {
                        const img = event.currentTarget;
                        if (!img.dataset.fbk) {
                          img.dataset.fbk = '1';
                          img.src = 'https://mc-heads.net/avatar/MHF_Steve/64';
                        }
                      }}
                      className="w-16 h-16 rounded-2xl bg-black/50 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xl font-bold text-white truncate">{focused.username}</div>
                      <div className="mt-1.5 flex gap-1.5 flex-wrap">
                        <span className={badgeMono}>{focused.type === 'microsoft' ? 'Microsoft' : 'Offline'}</span>
                        {focused.selected && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[13px] font-bold uppercase tracking-wide bg-emerald-500/15 text-emerald-300">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-[14px] text-white/30 mt-1">
                        {focused.lastUsedAt
                          ? `Last used ${new Date(focused.lastUsedAt).toLocaleDateString()}`
                          : 'Never used yet'}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    {!focused.selected && (
                      <button
                        disabled={busy}
                        onClick={() => onSelect(focused.id)}
                        className="px-3 py-2.5 rounded-xl bg-white hover:bg-white/90 text-[15px] font-bold text-black disabled:opacity-50 transition-colors"
                      >
                        Switch to this account
                      </button>
                    )}
                    {focused.type === 'microsoft' && (
                      <button
                        disabled={busy}
                        onClick={() => onRefresh(focused.id)}
                        className="px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-[15px] font-semibold text-white disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                      >
                        <RefreshCw size={14} />
                        Refresh session
                      </button>
                    )}
                    <button
                      disabled={busy}
                      onClick={() => onRemove(focused.id)}
                      className="px-3 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-[15px] font-semibold text-red-300 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <Trash2 size={14} />
                      Remove
                    </button>
                  </div>
                </div>
              )}

              {/* Status / error / auth code */}
              {(busy || status) && (
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/5 p-3 text-base text-white/70">
                  {busy && <Loader2 size={14} className="shrink-0 animate-spin" />}
                  <span className="flex-1 min-w-0 truncate">{status}</span>
                  {msFlow && (
                    <button
                      type="button"
                      disabled={!busy}
                      onClick={onCancelMicrosoft}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-white/10 text-white/80 text-sm font-semibold hover:bg-white/15 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
              {msFlow && (
                <p className="mt-2 text-sm text-white/30">
                  Waiting {msElapsedText} - finish in the browser. The code expires after a few minutes.
                </p>
              )}
              {msCode && (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/5 p-3">
                  <span className="flex-1 text-center font-mono text-lg font-bold tracking-[0.2em] text-white">
                    {msCode}
                  </span>
                  <button
                    type="button"
                    onClick={onCopyMsCode}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-white/90"
                  >
                    {msCopied ? <Check size={14} /> : <Copy size={14} />}
                    {msCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              )}
              {error && (
                <div className="mt-3 rounded-xl bg-red-500/10 p-3 text-base text-red-300">
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
