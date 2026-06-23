import React from 'react';
import { ChevronUp, UserRound } from 'lucide-react';

export default function AccountChip({ account, onClick }) {
return (
<button
onClick={onClick}
className="
w-full
flex
items-center
gap-3
p-3


    rounded-xl
    bg-[#171722]
    border
    border-[#232330]

    hover:bg-[#1D1D2D]
    hover:border-[#7C3AED]

    transition-all
    text-left
  "
>
  {account ? (
    <img
      src={account.avatarUrl}
      alt=""
      className="
        w-9
        h-9
        rounded-lg
        border
        border-[#2B2B3D]
        bg-[#111118]
      "
      onError={(event) => {
        event.currentTarget.src =
          'https://mc-heads.net/avatar/MHF_Steve/64';
      }}
    />
  ) : (
    <div
      className="
        w-9
        h-9
        rounded-lg
        border
        border-[#2B2B3D]
        bg-[#111118]

        flex
        items-center
        justify-center
      "
    >
      <UserRound size={16} className="text-[#8B8B95]" />
    </div>
  )}

  <div className="flex-1 min-w-0">
    <div className="text-sm font-semibold text-white truncate">
      {account?.username || 'Choose Account'}
    </div>

    <div className="text-xs text-[#8B8B95] mt-0.5">
      {account?.type === 'microsoft'
        ? 'Microsoft Account'
        : account
        ? 'Offline Account'
        : 'No account selected'}
    </div>
  </div>

  <ChevronUp
    size={15}
    className="text-[#6B6B76] shrink-0"
  />
</button>


);
}
