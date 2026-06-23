import React, { useState } from 'react';
import {
  ArrowLeft,
  Gamepad2,
  Loader2,
  Monitor,
  ShieldCheck,
} from 'lucide-react';

export default function AccountSetupModal({
  open,
  busy,
  status,
  error,
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
      <div className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-[#232330] bg-[#111118] shadow-2xl">

        {/* Header */}
        <div className="border-b border-[#232330] p-8">
          <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl border border-[#2B2B3D] bg-[#171722]">
            <Gamepad2 size={20} className="text-[#A78BFA]" />
          </div>

          <h2 className="text-2xl font-bold text-white">
            Choose Account
          </h2>

          <p className="mt-2 text-sm text-[#8B8B95]">
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
                  border border-[#26263A]
                  bg-[#171722]
                  p-5
                  text-left
                  transition-all
                  hover:border-[#7C3AED]
                  hover:bg-[#1D1D2D]
                  disabled:opacity-50
                "
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#2B2B3D] bg-[#111118]">
                    <Monitor size={18} className="text-[#A78BFA]" />
                  </div>

                  <div>
                    <h3 className="font-semibold text-white">
                      Offline Account
                    </h3>

                    <p className="mt-1 text-sm text-[#8B8B95]">
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
                  border border-[#26263A]
                  bg-[#171722]
                  p-5
                  text-left
                  transition-all
                  hover:border-[#7C3AED]
                  hover:bg-[#1D1D2D]
                  disabled:opacity-50
                "
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#2B2B3D] bg-[#111118]">
                    <ShieldCheck size={18} className="text-[#A78BFA]" />
                  </div>

                  <div>
                    <h3 className="font-semibold text-white">
                      Microsoft Login
                    </h3>

                    <p className="mt-1 text-sm text-[#8B8B95]">
                      Secure browser sign-in. Your password never enters Omega.
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
                  text-sm
                  text-[#8B8B95]
                  transition-colors
                  hover:text-white
                "
              >
                <ArrowLeft size={15} />
                Back
              </button>

              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[#8B8B95]">
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
                  border
                  border-[#26263A]
                  bg-[#171722]
                  px-4
                  text-sm
                  text-white
                  outline-none
                  transition-colors
                  focus:border-[#7C3AED]
                "
              />

              <p className="mt-2 text-xs text-[#6B6B76]">
                3–16 characters • letters, numbers and underscores
              </p>

              <button
                disabled={busy || !username.trim()}
                className="
                  mt-6
                  h-11
                  w-full
                  rounded-xl
                  bg-[#7C3AED]
                  font-semibold
                  text-white
                  transition-colors
                  hover:bg-[#8B5CF6]
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
            <div className="mt-5 flex items-center gap-2 rounded-xl border border-[#2B2B3D] bg-[#171722] p-3 text-sm text-[#C4B5FD]">
              {busy && (
                <Loader2
                  size={14}
                  className="shrink-0 animate-spin"
                />
              )}
              {status}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}