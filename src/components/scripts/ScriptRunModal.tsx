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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[500px] rounded-2xl border border-border bg-bg shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-lg font-semibold">Run AI Script</h2>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-surface">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          <p className="mb-6 text-sm text-gray-400">
            Running <strong>{script.name}</strong>. Provide a topic and optional instructions.
          </p>
          <div className="mb-4 space-y-2">
            <label htmlFor="run-topic" className="text-sm font-medium">
              Topic Name (Required)
            </label>
            <input
              id="run-topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. History of Rome"
              className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm focus:border-accent focus:outline-none"
              required
            />
          </div>
          <div className="mb-6 space-y-2">
            <label htmlFor="run-instructions" className="text-sm font-medium">
              AI Instructions (Optional)
            </label>
            <textarea
              id="run-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Make it dramatic, focus on Caesar..."
              className="h-24 w-full resize-none rounded-lg border border-border bg-surface px-4 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-surface">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!topic.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Run Script
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
