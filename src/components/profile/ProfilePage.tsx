import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic2, RefreshCw, Trash2, Upload } from 'lucide-react';
import type { Channel } from '../../data';
import { YouTubeAccountsPanel } from './YouTubeAccountsPanel';
import { listVoices, rememberVoice, removeVoiceReference, saveVoiceReference, VOICE_FILE_ACCEPT, type SavedVoice, type VoiceLanguage } from '../../services/voiceLibrary';

function VoiceLibrary({ language }: { language: VoiceLanguage }) {
  const label = language === 'en' ? 'English' : 'Hindi';
  const [voices, setVoices] = useState<SavedVoice[]>([]);
  const [provider, setProvider] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const data = await listVoices(language, signal);
      if (!mounted.current || signal?.aborted) return;
      setVoices(data.voices.filter(voice => voice.source === 'clone'));
      setProvider(data.provider);
      setError('');
    } catch (err) {
      if (mounted.current && !signal?.aborted) setError(err instanceof Error ? err.message : 'Could not load voices');
    } finally { if (mounted.current && !signal?.aborted) setLoading(false); }
  }, [language]);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => { mounted.current = false; controller.abort(); };
  }, [refresh]);

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file || saving) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const voice = await saveVoiceReference(name, language, file);
      if (!mounted.current) return;
      // Profile uploads are also the source of the default selection in Audio
      // Generation. Remember the exact Chatterbox reference by language so a
      // newly saved voice is selected after navigating away and back.
      rememberVoice(language, provider || 'Chatterbox Multilingual V3', voice.id);
      setVoices(current => [...current, voice]);
      setName(''); setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setMessage(`${voice.name} saved. Select it in Generation → Audio → ${label}.`);
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Could not save reference');
    } finally { if (mounted.current) setSaving(false); }
  }

  async function remove(voice: SavedVoice) {
    if (!window.confirm(`Delete “${voice.name}” and its saved reference recording?`)) return;
    setDeleting(voice.id); setError(''); setMessage('');
    try {
      await removeVoiceReference(voice.id);
      if (mounted.current) setVoices(current => current.filter(item => item.id !== voice.id));
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Could not delete reference');
    } finally { if (mounted.current) setDeleting(null); }
  }

  const enabled = provider.toLowerCase().includes('chatterbox');
  return (
    <section aria-label={`${label} voice library`} className="min-w-0 rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Mic2 size={20} className="text-accent" />{label} voices</h2>
        <button aria-label={`Refresh ${label} voices`} disabled={loading || saving || !!deleting} onClick={() => void refresh()} className="rounded p-2 text-gray-400 hover:bg-surface2 disabled:opacity-40"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
      </div>
      {!loading && provider && !enabled && <p className="mb-4 text-sm text-amber-300">Chatterbox must be configured as the speech provider to manage reference voices. Current provider: {provider}.</p>}
      <form onSubmit={upload} className="space-y-3">
        <label className="block text-sm text-gray-300">Voice name
          <input aria-label={`${label} voice name`} required maxLength={80} value={name} onChange={e => setName(e.target.value)} disabled={saving} placeholder={`e.g. My ${label} narrator`} className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-white" />
        </label>
        <label className="block text-sm text-gray-300">{label} reference recording
          <input ref={fileRef} aria-label={`${label} reference recording`} type="file" required accept={VOICE_FILE_ACCEPT} disabled={saving} onChange={e => { setFile(e.target.files?.[0] || null); setMessage(''); }} className="mt-2 block w-full text-xs text-gray-400 file:mr-3 file:rounded-md file:border-0 file:bg-surface2 file:px-3 file:py-2 file:text-gray-200" />
        </label>
        <p className="text-xs leading-relaxed text-gray-400">Use a clear solo recording in {label}, ideally 10–20 seconds, without music. WAV, MP3, M4A, FLAC or OGG; up to 8 MB. Longer recordings use the first 20 seconds.</p>
        <button type="submit" disabled={loading || saving || !enabled || !file || !name.trim()} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium disabled:opacity-40">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}{saving ? 'Saving reference…' : `Save ${label} voice`}
        </button>
      </form>
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      {message && <p role="status" className="mt-4 text-sm text-green-300">{message}</p>}
      <div className="mt-6 border-t border-border pt-4">
        <h3 className="mb-3 text-sm font-medium text-gray-300">Saved references ({voices.length})</h3>
        {loading && <p className="text-sm text-gray-400">Loading voices…</p>}
        {!loading && !voices.length && <p className="text-sm text-gray-500">No {label} references saved yet.</p>}
        <div className="space-y-3">
          {voices.map(voice => <div key={voice.id} className="rounded-lg border border-border bg-bg p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="min-w-0 break-words text-sm font-medium">{voice.name}</span>
              {voice.deletable && <button aria-label={`Delete ${voice.name}`} disabled={!!deleting || saving} onClick={() => void remove(voice)} className="shrink-0 rounded p-2 text-gray-500 hover:text-red-300 disabled:opacity-40">{deleting === voice.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}</button>}
            </div>
            <audio aria-label={`${voice.name} reference playback`} controls preload="none" src={`/api/tts/voices/${encodeURIComponent(voice.id)}/reference`} className="h-9 w-full" />
          </div>)}
        </div>
      </div>
    </section>
  );
}

export function ProfilePage({ accounts, onAccountsChange, onSelectAccount }: { accounts: Channel[]; onAccountsChange: (accounts: Channel[]) => void; onSelectAccount: (account: Channel) => void }) {
  return <div className="mx-auto max-w-5xl space-y-6">
    <YouTubeAccountsPanel accounts={accounts} onAccountsChange={onAccountsChange} onSelectAccount={onSelectAccount} />
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-accent">Profile</p>
      <h1 className="text-2xl font-semibold">Your Chatterbox voices</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">Save English and Hindi voice references once and reuse them across your projects. They appear in the matching language's voice list in Generation → Audio, even after restarting the app.</p>
      <p className="mt-2 text-xs text-gray-500">Recordings stay on this computer. Use your own voice or a voice you have permission to use. Chatterbox does not need to be running to save references.</p>
    </div>
    <div className="grid gap-5 lg:grid-cols-2"><VoiceLibrary language="en" /><VoiceLibrary language="hi" /></div>
  </div>;
}
