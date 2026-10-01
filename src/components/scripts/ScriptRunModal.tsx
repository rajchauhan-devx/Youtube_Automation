import { useState } from 'react';
import { X } from 'lucide-react';
import type { Script } from '../../data';

export function ScriptRunModal({
  script,
  onClose,
  onSubmit,
}: {
  script: Script;
  onClose: () => void;
  onSubmit: (topic: string, instructions: string) => void;
}) {
  const [topic, setTopic] = useState(script.topicName || '');
  const [instructions, setInstructions] = useState(script.aiInstructions || '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = topic.trim();
    if (!cleaned) return;
    onSubmit(cleaned, instructions.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="studio-card w-full max-w-[520px] overflow-hidden shadow-pop animate-scale-in">
        <div className="flex items-center justify-between border-b border-borderSoft p-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">AI Production</p>
            <h2 className="mt-0.5 text-lg font-bold tracking-tight">Run AI Script</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-white/5 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5 sm:p-6">
          <p className="-mt-1 text-[13px] leading-relaxed text-muted">
            Running <strong className="text-white">{script.name}</strong>. Provide a topic and optional instructions.
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
              placeholder="e.g. History of Rome"
              className="studio-input"
              required
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
              placeholder="e.g. Make it dramatic, focus on Caesar..."
              className="studio-input h-24 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="studio-btn-ghost">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!topic.trim()}
              className="studio-btn-primary min-w-[120px]"
            >
              Run Script
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
