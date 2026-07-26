import { useState } from 'react';
import { Image as ImageIcon, Music, Copy, Pencil, Play, Loader2 } from 'lucide-react';
import type { Script } from '../../data';

export function AssetsTab({ script, onProceedToGeneration }: { script: Script | null; onProceedToGeneration?: () => void }) {
  const [activeSubTab, setActiveSubTab] = useState<'images' | 'narration'>('images');

  if (!script) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-500">
        <p className="text-sm">No script selected.</p>
        <p className="mt-1 text-xs">Run a script to see extracted assets.</p>
      </div>
    );
  }

  const responseStep = script.pipeline?.find((p) => p.id === 'response');
  const isExtracting = responseStep?.status === 'running';
  const hasAssets = (script.imagePrompts?.length ?? 0) > 0 || script.narration;

  if (isExtracting) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-500">
        <Loader2 className="mb-3 h-8 w-8 animate-spin text-accent" />
        <p className="text-sm">Extracting assets with AI...</p>
        <p className="mt-1 text-xs">Please wait while we parse the response</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveSubTab('images')}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors ${
              activeSubTab === 'images' ? 'bg-surface2 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <ImageIcon className="h-4 w-4" />
            Image Prompts
            {script.imagePrompts && script.imagePrompts.length > 0 && (
              <span className="ml-1 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] text-accent">
                {script.imagePrompts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveSubTab('narration')}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors ${
              activeSubTab === 'narration' ? 'bg-surface2 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Music className="h-4 w-4" />
            Narration
            {script.narration && (
              <span className="ml-1 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] text-accent">
                1
              </span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {script.imagePrompts?.length ?? 0} images, {script.narration ? '1 narration' : 'no narration'}
          </span>
          {hasAssets && (script.imagePrompts?.length ?? 0) > 0 && onProceedToGeneration && (
            <button
              onClick={onProceedToGeneration}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/80"
            >
              <Play className="h-3.5 w-3.5" />
              Proceed to Generation
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {!hasAssets ? (
          <div className="flex h-full flex-col items-center justify-center text-gray-500">
            <ImageIcon className="mb-3 h-8 w-8 text-gray-600" />
            <p className="text-sm">No assets extracted yet.</p>
            <p className="mt-1 text-xs">Run a script and assets will appear here automatically.</p>
          </div>
        ) : activeSubTab === 'images' ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Image Prompts</h3>
              <span className="text-xs text-gray-500">Pending generation</span>
            </div>
            {script.imagePrompts && script.imagePrompts.length > 0 ? (
              <div className="flex flex-col gap-3">
                {script.imagePrompts.map((prompt, i) => (
                  <div key={i} className="rounded-lg border border-border bg-surface p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold text-accent">
                          {i + 1}
                        </span>
                        <span className="text-xs font-medium text-white">Image {i + 1}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                          Pending
                        </span>
                      </div>
                    </div>
                    <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                      {prompt}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigator.clipboard.writeText(prompt)}
                        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </button>
                      <button className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2">
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No image prompts found in the response.</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Narration (TTS)</h3>
              <span className="text-xs text-gray-500">Pending generation</span>
            </div>
            {script.narration ? (
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-white">Narration Script</span>
                  <span className="flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                    Pending
                  </span>
                </div>
                <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                  {script.narration}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigator.clipboard.writeText(script.narration!)}
                    className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No narration found in the response.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
