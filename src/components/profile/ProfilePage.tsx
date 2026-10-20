import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic2, RefreshCw, Trash2, Upload } from 'lucide-react';
import type { Channel } from '../../data';
import { YouTubeAccountsPanel } from './YouTubeAccountsPanel';
import { MetaAccountsPanel } from './MetaAccountsPanel';
import { ProfileTopicNotes } from './ProfileTopicNotes';
import { RecoveryPanel } from './RecoveryPanel';
import { createWorkspaceUrl, useWorkspaceApi } from '../../services/workspaceApi';
import { listVoices, rememberVoice, removeVoiceReference, saveVoiceReference, VOICE_FILE_ACCEPT, type SavedVoice, type VoiceLanguage } from '../../services/voiceLibrary';

function VoiceLibrary({ language }: { language: VoiceLanguage }) {
  const { account, profile, fetch: workspaceFetch } = useWorkspaceApi();
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
      const data = await listVoices(language, workspaceFetch, signal);
      if (!mounted.current || signal?.aborted) return;
      setVoices(data.voices.filter(voice => voice.source === 'clone'));
      setProvider(data.provider);
      setError('');
    } catch (err) {
      if (mounted.current && !signal?.aborted) setError(err instanceof Error ? err.message : 'Could not load voices');
    } finally { if (mounted.current && !signal?.aborted) setLoading(false); }
  }, [language, workspaceFetch]);

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
      const voice = await saveVoiceReference(name, language, file, workspaceFetch);
      if (!mounted.current) return;
      // Profile uploads are also the source of the default selection in Audio
      // Generation. Remember the exact Chatterbox reference by language so a
      // newly saved voice is selected after navigating away and back.
      rememberVoice(account.id, language, provider || 'Chatterbox Multilingual V3', voice.id);
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
      await removeVoiceReference(voice.id, workspaceFetch);
      if (mounted.current) setVoices(current => current.filter(item => item.id !== voice.id));
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Could not delete reference');
    } finally { if (mounted.current) setDeleting(null); }
  }

  const enabled = provider.toLowerCase().includes('chatterbox');
  return (
    <section aria-label={`${label} voice library`} className="studio-card min-w-0 p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-bold text-white"><Mic2 size={18} className="text-accent" />{label} Voices</h2>
        <button aria-label={`Refresh ${label} voices`} disabled={loading || saving || !!deleting} onClick={() => void refresh()} className="studio-btn-ghost !p-2 text-muted hover:text-white disabled:opacity-40"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
      </div>
      {!loading && provider && !enabled && <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200">Chatterbox must be configured as the speech provider to manage reference voices. Current provider: {provider}.</p>}
      <form onSubmit={upload} className="space-y-3.5">
        <label className="block text-xs font-semibold text-gray-300">Voice Name
          <input aria-label={`${label} voice name`} required maxLength={80} value={name} onChange={e => setName(e.target.value)} disabled={saving} placeholder={`e.g. My ${label} Narrator`} className="studio-input mt-1.5" />
        </label>
        <label className="block text-xs font-semibold text-gray-300">{label} Reference Recording
          <input ref={fileRef} aria-label={`${label} reference recording`} type="file" required accept={VOICE_FILE_ACCEPT} disabled={saving} onChange={e => { setFile(e.target.files?.[0] || null); setMessage(''); }} className="mt-1.5 block w-full text-xs text-gray-400 file:mr-3 file:rounded-xl file:border file:border-border file:bg-surface2 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-gray-200 hover:file:bg-surface3 cursor-pointer" />
        </label>
        <p className="text-[11px] leading-relaxed text-muted">Use a clear solo recording in {label}, ideally 10–20 seconds, without music. WAV, MP3, M4A, FLAC or OGG; up to 8 MB.</p>
        <button type="submit" disabled={loading || saving || !enabled || !file || !name.trim()} className="studio-btn-primary w-full !py-2 text-xs font-semibold disabled:opacity-40">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}{saving ? 'Saving reference…' : `Save ${label} Voice`}
        </button>
      </form>
      {error && <p role="alert" className="mt-3.5 rounded-xl border border-red-500/30 bg-red-950/20 p-2.5 text-xs text-red-200">{error}</p>}
      {message && <p role="status" className="mt-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-2.5 text-xs text-emerald-200">{message}</p>}
      <div className="mt-6 border-t border-border pt-4">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-faint">Saved References ({voices.length})</h3>
        {loading && <p className="text-xs text-muted">Loading voices…</p>}
        {!loading && !voices.length && <p className="text-xs text-faint">No {label} references saved yet.</p>}
        <div className="space-y-2.5">
          {voices.map(voice => <div key={voice.id} className="rounded-xl border border-border bg-bg/70 p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="min-w-0 break-words text-xs font-semibold text-white">{voice.name}</span>
              {voice.deletable && <button aria-label={`Delete ${voice.name}`} disabled={!!deleting || saving} onClick={() => void remove(voice)} className="shrink-0 rounded-lg p-1.5 text-faint hover:bg-surface2 hover:text-red-400 disabled:opacity-40 transition-colors">{deleting === voice.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}</button>}
            </div>
            <audio aria-label={`${voice.name} reference playback`} controls preload="none" src={createWorkspaceUrl(account.id, profile, `tts/voices/${encodeURIComponent(voice.id)}/reference`)} className="h-8 w-full rounded-lg" />
          </div>)}
        </div>
      </div>
    </section>
  );
}

export function ProfilePage({ accounts, onAccountsChange, onSelectAccount, onOpenDashboard }: { accounts: Channel[]; onAccountsChange: (accounts: Channel[]) => void; onSelectAccount: (account: Channel) => void; onOpenDashboard?: () => void }) {
  const { account } = useWorkspaceApi();
  return <div className="mx-auto max-w-5xl space-y-7">
    <YouTubeAccountsPanel accounts={accounts} onAccountsChange={onAccountsChange} onSelectAccount={onSelectAccount} onOpenDashboard={onOpenDashboard} />
    <MetaAccountsPanel accounts={accounts} onAccountsChange={onAccountsChange} onSelectAccount={onSelectAccount} />
    <ProfileTopicNotes />
    <RecoveryPanel />
    <div className="border-t border-border/70 pt-6">
      <p className="mb-1 flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-accent">
        <span className="h-1 w-5 rounded-full bg-accent" />
        Profile · {account.name}
      </p>
      <h1 className="text-2xl font-bold tracking-tight text-white">Your Chatterbox Voices</h1>
      <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">Save English and Hindi voice references once and reuse them across this profile's projects. They appear in the matching language's voice list in Generation → Audio, even after restarting the app.</p>
    </div>
    <div className="grid gap-5 lg:grid-cols-2"><VoiceLibrary language="en" /><VoiceLibrary language="hi" /></div>
  </div>;
}
