import { useState } from 'react';
import {
  Play,
  Pause,
  Undo2,
  Redo2,
  Scissors,
  Trash2,
  Maximize2,
  ZoomIn,
  Image as ImageIcon,
  Music,
  Film,
} from 'lucide-react';
import { ToolbarBtn } from '../layout/ToolbarBtn';
import { Divider } from '../layout/Divider';
import { PropField } from '../layout/PropField';
import type { Section, ChannelData } from '../../data';

export function EditorTab({ data, section }: { data: ChannelData; section: Section }) {
  const [playing, setPlaying] = useState(false);
  const tracks =
    section === 'long'
      ? [
          { id: 'video', label: 'Video', color: '#3b82f6' },
          { id: 'broll', label: 'B-Roll', color: '#ec4899' },
          { id: 'audio', label: 'Audio', color: '#10b981' },
          { id: 'caption', label: 'Captions', color: '#f59e0b' },
        ]
      : [
          { id: 'video', label: 'Video', color: '#3b82f6' },
          { id: 'audio', label: 'Audio', color: '#10b981' },
          { id: 'caption', label: 'Captions', color: '#f59e0b' },
        ];

  return (
    <div className="flex h-[calc(100vh-12rem)] gap-3">
      {/* Media pool */}
      <div className="hidden w-48 shrink-0 flex-col rounded-lg border border-border bg-surface md:flex">
        <div className="border-b border-border px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-gray-500">
          Media Pool
        </div>
        <div className="flex-1 overflow-y-auto thin-scrollbar p-2">
          {[...data.images, ...data.audio, ...data.videos].map((m) => (
            <div
              key={m.id}
              className="mb-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-300 hover:bg-surface2"
            >
              {m.kind === 'image' && <ImageIcon className="h-4 w-4 text-gray-500" />}
              {m.kind === 'audio' && <Music className="h-4 w-4 text-gray-500" />}
              {m.kind === 'video' && <Film className="h-4 w-4 text-gray-500" />}
              <span className="truncate">{m.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Center */}
      <div className="flex flex-1 flex-col">
        {/* Toolbar */}
        <div className="mb-3 flex items-center gap-1 rounded-lg border border-border bg-surface p-1.5">
          <ToolbarBtn icon={Undo2} label="Undo" />
          <ToolbarBtn icon={Redo2} label="Redo" />
          <Divider />
          <ToolbarBtn icon={Scissors} label="Split" />
          <ToolbarBtn icon={Trash2} label="Delete" />
          <Divider />
          <ToolbarBtn icon={Maximize2} label="Fit" />
          <ToolbarBtn icon={ZoomIn} label="Zoom" />
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setPlaying((p) => !p)}
              className="flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {playing ? 'Pause' : 'Play'}
              <span className="text-xs text-blue-200">Space</span>
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex flex-1 items-center justify-center rounded-lg border border-border bg-black">
          <div className="flex aspect-[9/16] h-full max-h-full items-center justify-center rounded-md bg-surface2">
            <span className="text-sm text-gray-600">9:16 Canvas</span>
          </div>
        </div>

        {/* Timeline */}
        <div className="mt-3 rounded-lg border border-border bg-surface p-2">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs text-gray-500">Timeline</span>
            <span className="text-xs text-gray-600">0:00 / 0:13</span>
          </div>
          <div className="space-y-1">
            {tracks.map((t) => {
              const clips = data.clips.filter((c) => c.track === t.id);
              return (
                <div key={t.id} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-xs text-gray-500">{t.label}</span>
                  <div className="relative h-8 flex-1 rounded bg-bg">
                    {clips.map((c) => (
                      <div
                        key={c.id}
                        className="absolute top-0.5 bottom-0.5 flex items-center rounded px-2 text-xs text-white"
                        style={{
                          left: `${(c.start / 13) * 100}%`,
                          width: `${(c.length / 13) * 100}%`,
                          backgroundColor: c.color,
                          opacity: 0.85,
                        }}
                      >
                        <span className="truncate">{c.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Properties */}
      <div className="hidden w-56 shrink-0 flex-col rounded-lg border border-border bg-surface lg:flex">
        <div className="border-b border-border px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-gray-500">
          Properties
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto thin-scrollbar p-3">
          <PropField label="Duration">
            <input
              defaultValue="4.0s"
              className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-white outline-none focus:border-accent"
            />
          </PropField>
          <PropField label="Zoom">
            <input
              defaultValue="100%"
              className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-white outline-none focus:border-accent"
            />
          </PropField>
          <PropField label="Position">
            <input
              defaultValue="0, 0"
              className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-white outline-none focus:border-accent"
            />
          </PropField>
          <PropField label="Caption Text">
            <textarea
              defaultValue="AI just changed everything"
              rows={2}
              className="w-full resize-none rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-white outline-none focus:border-accent"
            />
          </PropField>
          <PropField label="Font">
            <select className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-white outline-none focus:border-accent">
              <option>Inter</option>
              <option>Roboto</option>
              <option>System</option>
            </select>
          </PropField>
          <PropField label="Color">
            <div className="flex gap-2">
              {['#ffffff', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'].map((c) => (
                <button
                  key={c}
                  className="h-6 w-6 rounded border border-border"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </PropField>
        </div>
      </div>
    </div>
  );
}
