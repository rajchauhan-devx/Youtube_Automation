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
    <header className="sticky top-0 z-20 flex h-[68px] shrink-0 items-center justify-between gap-4 border-b border-border/80 bg-bg/80 px-5 backdrop-blur-2xl sm:px-7">
      <div className="flex min-w-0 items-center gap-2.5 text-[13px]">
        <span className="flex items-center gap-2 rounded-xl border border-border/80 bg-surface/90 px-3 py-1.5 font-semibold text-white shadow-sm">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ backgroundColor: channel.color }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: channel.color }} />
          </span>
          <span className="max-w-[140px] truncate text-xs">{channel.name}</span>
        </span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" />
        <span className="hidden font-medium text-gray-300 sm:inline text-xs">{sectionLabel}</span>
        {isMain && (
          <>
            <ChevronRight className="hidden h-3.5 w-3.5 text-faint sm:block" />
            <span className="hidden rounded-lg bg-surface2/80 border border-borderSoft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent capitalize sm:inline">
              {tab === 'review' ? 'Timeline' : tab}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        <span className="studio-pill hidden border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 md:inline-flex shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <Radio className="h-3 w-3" />
          Studio Engine Ready
        </span>
        <button className="studio-btn-ghost !px-3 !py-1.5 text-xs">
          <Search className="h-3.5 w-3.5 text-muted" />
          <span className="hidden lg:inline text-xs">Search</span>
          <kbd className="hidden rounded border border-border bg-bg/90 px-1 py-0.5 text-[9px] text-faint font-mono lg:inline">⌘K</kbd>
        </button>
        <button onClick={onNewScript} className="studio-btn-primary !px-3.5 !py-1.5 text-xs">
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">New Script</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>
    </header>
  );
}
