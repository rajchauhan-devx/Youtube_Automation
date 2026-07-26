import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Field } from '../layout/Field';
import type { Section, Script } from '../../data';

let blockCounter = 0;
function newBlockId() {
  blockCounter += 1;
  return `nb${Date.now()}_${blockCounter}`;
}

export function NewScriptModal({ onClose, section, onCreated }: { onClose: () => void; section: Section; onCreated?: (script: Script) => void }) {
  const [name, setName] = useState('');
  const [prompts, setPrompts] = useState<
    { id: string; name: string; type?: string; content: string }[]
  >([
    { id: newBlockId(), name: '', type: 'Custom', content: '' },
  ]);
  const [howItWorks, setHowItWorks] = useState('');
  const [saving, setSaving] = useState(false);

  function updatePrompt(id: string, patch: Partial<{ name: string; content: string }>) {
    setPrompts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function addPrompt() {
    setPrompts((prev) => [...prev, { id: newBlockId(), name: '', type: 'Custom', content: '' }]);
  }
  function deletePrompt(id: string) {
    setPrompts((prev) => (prev.length > 1 ? prev.filter((p) => p.id !== id) : prev));
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    const newScript: Script = {
      id: `usr_${Date.now()}`,
      name: name.trim(),
      lastUsed: 'now',
      status: 'draft',
      locked: false,
      duration: 30,
      prompts: prompts.map((p) => ({ id: p.id, name: p.name, type: p.type, content: p.content })),
      howItWorks,
    };
    try {
      const res = await fetch('/api/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newScript),
      });
      if (!res.ok) throw new Error('Failed to save script');
      const saved = await res.json();
      onCreated?.(saved);
      onClose();
    } catch (err) {
      console.error('Error saving script:', err);
      alert('Failed to save script. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto thin-scrollbar rounded-lg border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">New Script</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Script name"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent"
            />
          </Field>

          <div>
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
              Prompts
            </div>
            <div className="space-y-3">
              {prompts.map((p, i) => (
                <div key={p.id} className="rounded-md border border-border bg-bg p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs text-gray-500">#{i + 1}</span>
                    <input
                      value={p.name}
                      onChange={(e) => updatePrompt(p.id, { name: e.target.value })}
                      placeholder="Prompt name"
                      className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-white outline-none focus:border-accent"
                    />
                    <button
                      onClick={() => deletePrompt(p.id)}
                      disabled={prompts.length === 1}
                      className="rounded-md p-1.5 text-gray-400 hover:bg-surface2 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <textarea
                    value={p.content}
                    onChange={(e) => updatePrompt(p.id, { content: e.target.value })}
                    placeholder="Prompt content..."
                    rows={2}
                    className="w-full resize-none rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-white outline-none focus:border-accent"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={addPrompt}
              className="mt-2 flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-sm text-gray-300 hover:bg-surface2"
            >
              <Plus className="h-4 w-4" />
              Add Prompt
            </button>
          </div>

          {prompts.length >= 2 && (
            <Field label="How It Works">
              <textarea
                value={howItWorks}
                onChange={(e) => setHowItWorks(e.target.value)}
                placeholder="Explain execution flow between prompts"
                rows={2}
                className="w-full resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent"
              />
            </Field>
          )}

          {section === 'long' && (
            <Field label="Chapter Outline">
              <textarea
                placeholder="One chapter per line..."
                rows={3}
                className="w-full resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent"
              />
            </Field>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border px-4 py-2 text-sm text-gray-200 hover:bg-surface2 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Create Script'}
          </button>
        </div>
      </div>
    </div>
  );
}
