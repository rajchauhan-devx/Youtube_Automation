import { useEffect, useState } from 'react';
import { useWorkspaceApi } from '../../services/workspaceApi';
import { parseJsonResponse } from '../../lib/safe';

const format = (entries: Record<string, string>) => Object.entries(entries).map(([word, spoken]) => `${word} = ${spoken}`).join('\n');

export function HindiPronunciationEditor({ disabled, onSaved }: { disabled: boolean; onSaved: () => void }) {
  const { fetch } = useWorkspaceApi();
  const [text, setText] = useState('');
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void fetch('/api/tts/pronunciations/hi', { signal: controller.signal }).then(async response => {
      const data = await parseJsonResponse<{ entries?: Record<string, string>; error?: string }>(response, {});
      if (!response.ok || !data.entries) throw new Error(data.error || 'Could not load pronunciation corrections.');
      if (!controller.signal.aborted) { const value = format(data.entries); setText(value); setSaved(value); }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [fetch, reload]);

  async function save() {
    setError(''); setMessage(''); setSaving(true);
    try {
      const entries = new Map<string, string>();
      for (const line of text.split('\n').filter(line => line.trim())) {
        const index = line.indexOf('=');
        const word = line.slice(0, index).trim();
        const spoken = line.slice(index + 1).trim();
        if (index < 1 || !spoken) throw new Error('Use one correction per line: written word = spoken form.');
        if (entries.has(word)) throw new Error(`Keep only one correction for ${word}.`);
        entries.set(word, spoken);
      }
      const response = await fetch('/api/tts/pronunciations/hi', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries: Object.fromEntries(entries) }),
      });
      const data = await parseJsonResponse<{ entries?: Record<string, string>; error?: string }>(response, {});
      if (!response.ok || !data.entries) throw new Error(data.error || 'Could not save pronunciation corrections.');
      const value = format(data.entries); setText(value); setSaved(value);
      setMessage('Saved. Preview again to hear the corrections.'); onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save corrections.'); }
    finally { setSaving(false); }
  }

  return <details className="mt-3 rounded-md border border-border bg-bg/50 p-3">
    <summary className="cursor-pointer text-xs font-medium text-gray-200">Hindi pronunciation corrections</summary>
    <p className="my-2 text-xs text-gray-400">If a name or English word sounds wrong, enter how it should be spoken in Devanagari. Saved corrections apply to this account’s Hindi previews and narration, including Auto-Pilot. Your written script stays the same.</p>
    <label className="block text-xs text-gray-300" htmlFor="hindi-pronunciations">One correction per line: written word = spoken form</label>
    <textarea id="hindi-pronunciations" rows={4} maxLength={25000} value={text} disabled={disabled || loading || saving}
      onChange={event => { setText(event.target.value); setMessage(''); }} placeholder={'YouTube = यूट्यूब\nChatGPT = चैट जी पी टी'}
      className="mt-1 w-full rounded border border-border bg-bg p-2 text-sm text-white disabled:opacity-50" />
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <button type="button" disabled={disabled || loading || saving || text === saved} onClick={() => void save()} className="studio-btn-ghost text-xs">{saving ? 'Saving…' : 'Save corrections'}</button>
      <button type="button" disabled={disabled || loading || saving} onClick={() => setReload(value => value + 1)} className="text-xs text-gray-400 underline">Reload saved</button>
      {text !== saved && <span className="text-xs text-amber-300">Save before previewing or generating.</span>}
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
    {message && <p role="status" className="mt-2 text-xs text-green-400">{message}</p>}
  </details>;
}
