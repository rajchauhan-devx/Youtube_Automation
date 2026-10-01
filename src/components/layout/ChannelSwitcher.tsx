import { Check, Plus } from 'lucide-react';
import type { Channel } from '../../data';

export function ChannelSwitcher({
  active,
  onSelect,
  onClose,
  channels,
  onAdd,
}: {
  active: Channel;
  onSelect: (c: Channel) => void;
  onClose: () => void;
  channels: Channel[];
  onAdd: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="studio-card absolute left-0 top-[58px] z-50 w-64 overflow-hidden p-1.5 shadow-pop animate-scale-in">
        <div className="px-2.5 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
          YouTube Accounts
        </div>
        {channels.map((ch) => (
          <button
            key={ch.id}
            onClick={() => onSelect(ch)}
            className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm transition-colors hover:bg-white/[0.05] ${
              active.id === ch.id ? 'bg-white/[0.04] text-white' : 'text-muted'
            }`}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-extrabold text-white" style={{ backgroundColor: ch.color }}>
              {ch.avatar}
            </span>
            <span className="min-w-0 flex-1 truncate text-left text-[13px] font-medium">{ch.name}</span>
            {active.id === ch.id && <Check className="h-4 w-4 shrink-0 text-accent" />}
          </button>
        ))}
        <div className="studio-divider" />
        <button onClick={onAdd} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-white/[0.05] hover:text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-border bg-bg">
            <Plus className="h-4 w-4" />
          </span>
          Add YouTube Account
        </button>
      </div>
    </>
  );
}
