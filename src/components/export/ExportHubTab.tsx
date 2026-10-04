import { useState } from 'react';
import { Youtube, ThumbsUp, Instagram, Rocket } from 'lucide-react';
import type { Script } from '../../data';
import { YouTubeExportTab } from './YouTubeExportTab';
import { FacebookExportTab } from './FacebookExportTab';
import { InstagramExportTab } from './InstagramExportTab';

type Platform = 'youtube' | 'facebook' | 'instagram';

const PLATFORMS: { id: Platform; label: string; hint: string; activeClass: string }[] = [
  { id: 'youtube', label: 'YouTube', hint: 'Long videos & Shorts', activeClass: 'bg-red-600 text-white shadow' },
  { id: 'facebook', label: 'Facebook', hint: 'Pages & feed video', activeClass: 'bg-[#1877F2] text-white shadow' },
  { id: 'instagram', label: 'Instagram', hint: 'Reels', activeClass: 'bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 text-white shadow' },
];

export function ExportHubTab({
  script,
  onUpdate,
  onNavigateToTimeline,
}: {
  script: Script | null;
  onUpdate: (patch: Partial<Script>) => void;
  onNavigateToTimeline?: () => void;
}) {
  const [platform, setPlatform] = useState<Platform>('youtube');

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2">
        <span className="flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          <Rocket className="h-3.5 w-3.5 text-accent" /> Publish to
        </span>
        {PLATFORMS.map((p) => {
          const active = platform === p.id;
          const Icon = p.id === 'youtube' ? Youtube : p.id === 'facebook' ? ThumbsUp : Instagram;
          return (
            <button
              key={p.id}
              onClick={() => setPlatform(p.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
                active ? p.activeClass : 'text-gray-400 hover:bg-surface2 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              {p.label}
              <span className={`text-[10px] font-normal ${active ? 'opacity-80' : 'text-gray-500'}`}>{p.hint}</span>
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1">
        {platform === 'youtube' && (
          <YouTubeExportTab script={script} onUpdate={onUpdate} onNavigateToTimeline={onNavigateToTimeline} />
        )}
        {platform === 'facebook' && (
          <FacebookExportTab script={script} onUpdate={onUpdate} onNavigateToTimeline={onNavigateToTimeline} />
        )}
        {platform === 'instagram' && (
          <InstagramExportTab script={script} onUpdate={onUpdate} onNavigateToTimeline={onNavigateToTimeline} />
        )}
      </div>
    </div>
  );
}
