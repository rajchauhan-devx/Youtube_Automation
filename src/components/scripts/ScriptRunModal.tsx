import { useState } from 'react';
import { X, Sparkles, Play } from 'lucide-react';
import type { Script } from '../../data';

export function ScriptRunModal({
  script,
  onClose,
  onSubmit,
}: {
  script: Script;
  onClose: () => void;
  onSubmit: (topic: string, instructions: string, options?: { autoPilot?: boolean }) => void;
}) {
  const [topic, setTopic] = useState(script.topicName || '');
  const [instructions, setInstructions] = useState(script.aiInstructions || '');

  function handleSubmit(autoPilot: boolean) {
    const cleaned = topic.trim();
    if (!cleaned) return;
    onSubmit(cleaned, instructions.trim(), { autoPilot });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
      <div className="studio-card w-full max-w-[540px] overflow-hidden shadow-pop animate-scale-in">
        <div className="flex items-center justify-between border-b border-borderSoft p-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent shadow-glow">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Autonomous Production</p>
              <h2 className="mt-0.5 text-lg font-bold tracking-tight">Run Video Script</h2>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-white/5 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(true);
          }}
          className="space-y-4 p-5 sm:p-6"
        >
          <p className="-mt-1 text-[13px] leading-relaxed text-muted">
            Running <strong className="text-white">{script.name}</strong>. Submit a topic to start either the automated 1-click pipeline or standard script generation.
          </p>
          <div className="space-y-2">
            <label htmlFor="run-topic" className="studio-label">
              Topic name · Required
            </label>
            <input
              id="run-topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Mystery of the Bermuda Triangle"
              className="studio-input"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="run-instructions" className="studio-label">
              AI instructions · Optional
            </label>
            <textarea
              id="run-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Make it dramatic, suspenseful pacing, cinematic imagery..."
              className="studio-input h-20 resize-none"
            />
          </div>

          <div className="rounded-xl border border-accent/20 bg-accent/5 p-3 text-xs leading-relaxed text-gray-300">
            <div className="flex items-center gap-1.5 font-semibold text-accent mb-0.5">
              <Sparkles className="h-3.5 w-3.5" />
              1-Click Auto-Pilot (Topic → Rendered Video)
            </div>
            Google Gemini supervises the entire workflow automatically: Research & Script → Asset Extraction → Google Cloud Visuals → Voiceover Narration → Motion Captions → Final 1080p Video Render.
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-borderSoft">
            <button type="button" onClick={onClose} className="studio-btn-ghost text-xs">
              Cancel
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!topic.trim()}
                onClick={() => handleSubmit(false)}
                className="studio-btn-ghost text-xs"
              >
                <Play className="h-3.5 w-3.5" />
                Run Script Only
              </button>
              <button
                type="submit"
                disabled={!topic.trim()}
                className="studio-btn-primary flex items-center gap-2 text-xs !py-2.5 shadow-glow"
              >
                <Sparkles className="h-4 w-4" />
                ⚡ Auto-Pilot: Full Production
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
