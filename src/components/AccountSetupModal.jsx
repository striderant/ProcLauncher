import React, { useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Gamepad2,
  Loader2,
  Monitor,
  ShieldCheck,
} from 'lucide-react';
import { iconMuted } from '../theme';

export default function AccountSetupModal({
  open,
  busy,
  status,
  error,
  msFlow,
  msElapsedText,
  msCode,
  msCopied,
  onCopyMsCode,
  onCancelMicrosoft,
  onCreateOffline,
  onMicrosoft,
}) {
  const [mode, setMode] = useState('choose');
  const [username, setUsername] = useState('');

  if (!open) return null;

  const submitOffline = (event) => {
    event.preventDefault();
    onCreateOffline(username.trim());
  };

  return (
    <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/85 backdrop-blur-sm p-6">
      <div className="w-full max-w-[560px] overflow-hidden rounded-2xl bg-[#111111] shadow-2xl">

        {/* Header */}
        <div className="p-8">
          

          <h2 className="text-2xl font-bold text-white">
            Choose Account
          </h2>

          <p className="mt-2 text-base text-[#8b8b8b]">
            Continue with an offline account or sign in with Microsoft.
          </p>
        </div>

        {/* Content */}
        <div className="p-8">
          {mode === 'choose' ? (
            <div className="space-y-3">

              {/* Offline */}
              <button
                disabled={busy}
                onClick={() => setMode('offline')}
                className="
                  w-full
                  rounded-xl
                  bg-[#171717]
                  p-5
                  text-left
                  transition-all

                  hover:bg-[#1e1e1e]
                  disabled:opacity-50
                "
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#111111]">
                    <Monitor size={18} className={iconMuted} />
                  </div>

                  <div>
                    <h3 className="font-semibold text-white">
                      Offline Account
                    </h3>

                    <p className="mt-1 text-base text-[#8b8b8b]">
                      Create a local Minecraft profile and play offline.
                    </p>
                  </div>
                </div>
              </button>

              {/* Microsoft */}
              <button
                disabled={busy}
                onClick={onMicrosoft}
                className="
                  w-full
                  rounded-xl
                  bg-[#171717]
                  p-5
                  text-left
                  transition-all
                  hover:bg-[#1e1e1e]
                  disabled:opacity-50
                "
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#111111]">
                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 21 21">
                      <path d="M1 1h9v9H1zM11 1h9v9h-9zM1 11h9v9H1zM11 11h9v9h-9z" />
                   </svg>
                  </div>

                  <div>
                    <h3 className="font-semibold text-white">
                      Microsoft Login
                    </h3>

                    <p className="mt-1 text-base text-[#8b8b8b]">
                      Secure browser sign-in. Your password never enters Proc Launcher.
                    </p>
                  </div>
                </div>
              </button>
            </div>
          ) : (
            <form onSubmit={submitOffline}>
              <button
                type="button"
                disabled={busy}
                onClick={() => setMode('choose')}
                className="
                  mb-6
                  flex
                  items-center
                  gap-2
                  text-base
                  text-[#8b8b8b]
                  transition-colors
                  hover:text-white
                "
              >
                <ArrowLeft size={15} />
                Back
              </button>

              <label className="mb-2 block text-base font-semibold uppercase tracking-wider text-[#8b8b8b]">
                Minecraft Username
              </label>

              <input
                autoFocus
                value={username}
                maxLength={16}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Enter username"
                className="
                  h-11
                  w-full
                  rounded-xl
                  bg-white/5
                  px-4
                  text-base
                  text-white
                  outline-none
                  transition-colors
                "
              />

              <p className="mt-2 text-base text-[#6b6b6b]">
                3–16 characters • letters, numbers and underscores
              </p>

              <button
                disabled={busy || !username.trim()}
                className="
                  mt-6
                  h-11
                  w-full
                  rounded-xl
                  bg-white
                  text-black
                  font-semibold
                  transition-colors
                  hover:bg-white/90
                  disabled:cursor-not-allowed
                  disabled:opacity-40
                "
              >
                Continue
              </button>
            </form>
          )}

          {/* Status */}
          {(busy || status) && (
            <div className="mt-5 flex items-center gap-2 rounded-xl bg-white/5 p-3 text-base text-white/70">
              {busy && (
                <Loader2
                  size={14}
                  className="shrink-0 animate-spin"
                />
              )}
              <span className="flex-1">{status}</span>
              {msFlow && (
                <button
                  type="button"
                  onClick={onCancelMicrosoft}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-white/10 text-white/80 text-sm font-semibold hover:bg-white/15 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
          {msFlow && (
            <p className="mt-2 text-sm text-[#6b6b6b]">
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

          {/* Error */}
          {error && (
            <div className="mt-4 rounded-xl bg-red-500/10 p-3 text-base text-red-300">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}