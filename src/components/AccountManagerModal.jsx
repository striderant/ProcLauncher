import React, { useState } from 'react';
import {
  Check,
  Loader2,
  LogIn,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';

function Badge({ children }) {
  return (
    <span
      className="
        px-2
        py-1
        rounded-md

        text-xs
        font-medium

        bg-[#181820]
        border
        border-[#252530]

        text-[#cfcfda]
      "
    >
      {children}
    </span>
  );
}

export default function AccountManagerModal({
  open,
  accounts,
  selected,
  busy,
  status,
  error,
  onClose,
  onCreateOffline,
  onMicrosoft,
  onSelect,
  onRemove,
  onRefresh,
}) {
  const [username, setUsername] = useState('');

  if (!open) return null;

  async function addOffline(event) {
    event.preventDefault();

    const created = await onCreateOffline(username.trim());

    if (created) {
      setUsername('');
    }
  }

  return (
    <div
      className="fixed inset-0 z-[19000] flex items-center justify-center bg-[#09090d]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="
          w-full
          max-w-[620px]
          max-h-[85vh]

          flex
          flex-col

          rounded-xl
          border
          border-[#252530]

          bg-[#121218]

          overflow-hidden
        "
      >
        <div className="flex items-center justify-between border-b border-[#252530] px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-white">
              Account Manager
            </h2>

            <p className="mt-1 text-sm text-[#8d8d98]">
              Manage and switch Minecraft accounts.
            </p>
          </div>

          <button
            onClick={onClose}
            className="
              p-2
              rounded-lg
              text-[#8d8d98]
              hover:text-white
            "
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5">
          {selected && (
            <div
              className="
                flex
                items-center
                gap-3

                rounded-lg
                border
                border-[#6d28d9]

                bg-[#181820]

                p-4
              "
            >
              <img
                src={selected.avatarUrl}
                alt=""
                className="
                  w-10
                  h-10
                  rounded-lg

                  border
                  border-[#252530]
                "
              />

              <div className="flex-1 min-w-0">
                <div className="font-medium truncate text-white">
                  {selected.username}
                </div>

                <div className="mt-1 flex gap-2">
                  <Badge>
                    {selected.type === 'microsoft'
                      ? 'Microsoft'
                      : 'Offline'}
                  </Badge>

                  <Badge>Selected</Badge>
                </div>
              </div>

              <Check size={18} className="text-green-400" />
            </div>
          )}

          <div>
            <h3 className="mb-3 text-sm font-medium text-white">
              Saved Accounts
            </h3>

            <div className="space-y-2">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className={`
                    flex
                    items-center
                    gap-3

                    rounded-lg
                    border

                    p-3

                    ${
                      account.selected
                        ? 'border-[#6d28d9] bg-[#1b1b24]'
                        : 'border-[#252530] bg-[#181820]'
                    }
                  `}
                >
                  <img
                    src={account.avatarUrl}
                    alt=""
                    className="
                      w-9
                      h-9
                      rounded-lg
                      border
                      border-[#252530]
                    "
                  />

                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium text-white">
                      {account.username}
                    </div>

                    <div className="mt-1">
                      <Badge>
                        {account.type === 'microsoft'
                          ? 'Microsoft'
                          : 'Offline'}
                      </Badge>
                    </div>
                  </div>

                  {account.type === 'microsoft' && (
                    <button
                      disabled={busy}
                      onClick={() => onRefresh(account.id)}
                      className="
                        p-2
                        text-[#8d8d98]
                        hover:text-white
                      "
                    >
                      <RefreshCw size={15} />
                    </button>
                  )}

                  {!account.selected && (
                    <button
                      disabled={busy}
                      onClick={() => onSelect(account.id)}
                      className="
                        h-9
                        px-3

                        rounded-lg

                        bg-[#6d28d9]
                        hover:bg-[#7c3aed]

                        text-sm
                        font-medium
                        text-white

                        disabled:opacity-50
                      "
                    >
                      Select
                    </button>
                  )}

                  <button
                    disabled={busy}
                    onClick={() => onRemove(account.id)}
                    className="
                      p-2
                      text-[#8d8d98]
                      hover:text-red-400
                    "
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div
            className="
              rounded-lg
              border
              border-[#252530]

              bg-[#181820]

              p-4
            "
          >
            <h3 className="mb-3 text-sm font-medium text-white">
              Add Account
            </h3>

            <form
              onSubmit={addOffline}
              className="flex flex-wrap gap-2"
            >
              <input
                value={username}
                maxLength={16}
                onChange={(event) =>
                  setUsername(event.target.value)
                }
                placeholder="Offline username"
                className="
                  flex-1
                  min-w-[180px]

                  h-10

                  rounded-lg
                  border
                  border-[#252530]

                  bg-[#121218]

                  px-3

                  text-sm
                  text-white

                  outline-none
                  focus:border-[#6d28d9]
                "
              />

              <button
                disabled={busy || !username.trim()}
                className="
                  h-10
                  px-4

                  rounded-lg

                  bg-[#6d28d9]
                  hover:bg-[#7c3aed]

                  text-sm
                  font-medium
                  text-white

                  disabled:opacity-50

                  flex
                  items-center
                  gap-2
                "
              >
                <Plus size={14} />
                Offline
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={onMicrosoft}
                className="
                  h-10
                  px-4

                  rounded-lg

                  border
                  border-[#252530]

                  bg-[#121218]

                  text-sm
                  font-medium
                  text-white

                  flex
                  items-center
                  gap-2
                "
              >
                <LogIn size={14} />
                Microsoft
              </button>
            </form>
          </div>

          {(busy || status) && (
            <div className="flex items-center gap-2 text-sm text-[#b9a3ff]">
              {busy && (
                <Loader2
                  size={14}
                  className="animate-spin"
                />
              )}

              {status}
            </div>
          )}

          {error && (
            <div className="text-sm text-red-400">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}