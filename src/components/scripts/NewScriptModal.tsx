import { SHORTS_MEDIA_TEMPLATE } from '../../../server/src/services/shorts-media';
import { MIXED_TEMPLATE, LONG_TEMPLATE } from '../../lib/mixed-template';
import { useWorkspaceApi } from '../../services/workspaceApi';
import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Field } from '../layout/Field';
import { ScriptModelSelector } from './ScriptModelSelector';
import { DURATION_PRESETS, LONG_DURATION_PRESETS, type Section, type Script, type DurationPreset } from '../../data';

let blockCounter = 0;
function newBlockId() {
  blockCounter += 1;
  return `nb${Date.now()}_${blockCounter}`;
}

export function NewScriptModal({ onClose, section, onCreated }: { onClose: () => void; section: Section; onCreated?: (script: Script) => void }) {
  const { fetch, profile, account } = useWorkspaceApi();
  const [mediaTemplate, setMediaTemplate] = useState(false);
  const [name, setName] = useState('');
  const [model, setModel] = useState('ollama/qwen3.5:4b');
  const [duration, setDuration] = useState<number>(section !== 'shorts' ? 300 : 30);
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
      id: `usr_${crypto.randomUUID()}`,
      accountId: account.id,
      section: profile,
      name: name.trim(),
      videoImportsEnabled: mediaTemplate,
      lastUsed: 'now',
      status: 'draft',
      locked: false,
      duration,
      model,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="studio-card thin-scrollbar max-h-[90vh] w-full max-w-xl overflow-y-auto p-6 shadow-pop animate-scale-in">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Studio Pro</p>
            <h3 className="mt-0.5 text-lg font-bold tracking-tight">New Script</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-white/5 hover:text-white">
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

          <div className="flex flex-wrap gap-2">{section === 'shorts' && <button type="button" className="rounded border border-accent px-3 py-2 text-sm text-accent" onClick={() => { setMediaTemplate(true); setModel('gemini-3.6-flash'); if (!name.trim()) setName('Shorts - Images & Videos'); setPrompts([{ id: newBlockId(), name: 'Image and video scene prompts (Production V4)', type: 'Custom', content: SHORTS_MEDIA_TEMPLATE }]); }}>Use image & video Shorts template (Production)</button>}{section === 'mixed' && <button type="button" className="rounded border border-accent px-3 py-2 text-sm text-accent" onClick={() => { setMediaTemplate(true); setModel('gemini-3.6-flash'); if (!name.trim()) setName('Mixed Media - Images & Videos'); setPrompts([{ id: newBlockId(), name: 'Mixed image + video prompts (Production V3)', type: 'Custom', content: MIXED_TEMPLATE }]); }}>Use mixed image & video template (Production)</button>}{section === 'long' && <button type="button" className="rounded border border-accent px-3 py-2 text-sm text-accent" onClick={() => { setModel('gemini-3.6-flash'); if (!name.trim()) setName('Long Video - Images'); setPrompts([{ id: newBlockId(), name: 'Long image prompts (Production V3)', type: 'Custom', content: LONG_TEMPLATE }]); }}>Use long-form image template (Production)</button>}</div>
          <Field label="AI Model">
            <ScriptModelSelector value={model} onChange={setModel} />
          </Field>
          <Field label="Target Duration">
            <div className="flex flex-wrap gap-2">
              {(section !== 'shorts' ? LONG_DURATION_PRESETS : DURATION_PRESETS).map((dur) => (
                <button
                  key={dur}
                  type="button"
                  onClick={() => setDuration(dur)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    duration === dur
                      ? 'bg-accent text-white shadow-sm'
                      : 'border border-border bg-bg text-gray-300 hover:bg-surface2 hover:text-white'
                  }`}
                >
                  {dur >= 60 && dur % 60 === 0 ? `${dur / 60}m (${dur}s)` : `${dur}s`}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              Paces script length and pre-fills export render duration.
            </p>
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

          {section !== 'shorts' && (
            <Field label="Chapter Outline">
              <textarea
                placeholder="One chapter per line..."
                rows={3}
                className="w-full resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent"
              />
            </Field>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2 border-t border-borderSoft pt-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="studio-btn-ghost"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || saving}
            className="studio-btn-primary min-w-[140px]"
          >
            {saving ? 'Saving...' : 'Create Script'}
          </button>
        </div>
      </div>
    </div>
  );
}
