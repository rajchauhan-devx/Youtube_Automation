import { ChevronRight, Search, Sparkles } from 'lucide-react';
import type { Channel, Section, Tab } from '../../data';

export function Header({
  channel,
  section,
  tab,
  isMain,
}: {
  channel: Channel;
  section: Section | string;
  tab: Tab;
  isMain: boolean;
}) {
  const sectionLabel =
    section === 'shorts' ? 'Shorts' : section === 'long' ? 'Long' : (section as string);
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-bg px-6">
      <div className="flex items-center gap-2 text-sm">
        <span className="flex items-center gap-2 font-medium text-white">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: channel.color }} />
          {channel.name}
        </span>
        <ChevronRight className="h-4 w-4 text-gray-600" />
        <span className="text-gray-400">{sectionLabel}</span>
        {isMain && (
          <>
            <ChevronRight className="h-4 w-4 text-gray-600" />
            <span className="text-gray-400 capitalize">{tab}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-gray-300 hover:bg-surface2">
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">Search</span>
        </button>
        <button className="flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500">
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">New Script</span>
        </button>
      </div>
    </header>
  );
}
