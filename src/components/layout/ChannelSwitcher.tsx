import { Check, Plus } from 'lucide-react';
import { channels } from '../../data';
import type { Channel } from '../../data';

export function ChannelSwitcher({
  active,
  onSelect,
  onClose,
}: {
  active: Channel;
  onSelect: (c: Channel) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-2 top-14 z-50 w-56 rounded-lg border border-border bg-surface py-1 shadow-lg">
        <div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-gray-500">
          Switch Channel
        </div>
        {channels.map((ch) => (
          <button
            key={ch.id}
            onClick={() => onSelect(ch)}
            className={`flex w-full items-center gap-3 px-3 py-2.5 text-sm hover:bg-surface2 ${
              active.id === ch.id ? 'text-white' : 'text-gray-300'
            }`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ch.color }} />
            <span className="flex-1 text-left">{ch.name}</span>
            {active.id === ch.id && <Check className="h-4 w-4 text-accent" />}
          </button>
        ))}
        <div className="my-1 border-t border-border" />
        <button className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-gray-300 hover:bg-surface2">
          <Plus className="h-4 w-4" />
          Add Channel
        </button>
      </div>
    </>
  );
}
