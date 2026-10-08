import { ChevronRight, Search, Sparkles, Radio } from 'lucide-react';
import type { Channel, Section, Tab } from '../../data';

export function Header({
  channel,
  section,
  tab,
  isMain,
  onNewScript,
}: {
  channel: Channel;
  section: Section | string;
  tab: Tab;
  isMain: boolean;
  onNewScript: () => void;
}) {
  const sectionLabel =
    section === 'shorts' ? 'Shorts' : section === 'mixed' ? 'Mixed Media' : section === 'long' ? 'Long Video' : section === 'dashboard' ? 'YouTube Studio' : section === 'profile' ? 'Profile & Voices' : (section as string);
  return (
    <header className="sticky top-0 z-20 flex h-[68px] shrink-0 items-center justify-between gap-4 border-b border-borderSoft bg-bg/85 px-5 backdrop-blur-xl sm:px-7">
      <div className="flex min-w-0 items-center gap-2 text-[13px]">
        <span className="flex items-center gap-2.5 rounded-xl border border-borderSoft bg-surface px-3 py-1.5 font-semibold text-white">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ backgroundColor: channel.color }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: channel.color }} />
          </span>
          <span className="max-w-[140px] truncate">{channel.name}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
        <span className="hidden font-medium text-muted sm:inline">{sectionLabel}</span>
        {isMain && (
          <>
            <ChevronRight className="hidden h-4 w-4 text-faint sm:block" />
            <span className="hidden rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-200 capitalize sm:inline">{tab === 'review' ? 'Timeline' : tab}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="studio-pill hidden border border-success/20 bg-success/10 text-emerald-300 md:inline-flex">
          <Radio className="h-3 w-3" />
          Studio online
        </span>
        <button className="studio-btn-ghost !px-3 !py-2">
          <Search className="h-4 w-4 text-muted" />
          <span className="hidden text-[13px] lg:inline">Search</span>
          <kbd className="hidden rounded-md border border-border bg-bg px-1.5 py-0.5 text-[10px] text-faint lg:inline">⌘K</kbd>
        </button>
        <button onClick={onNewScript} className="studio-btn-primary !px-4 !py-2">
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">New Script</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>
    </header>
  );
}
