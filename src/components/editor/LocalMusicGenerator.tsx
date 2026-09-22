import { useEffect, useRef, useState } from 'react';
import { useWorkspaceApi } from '../../services/workspaceApi';
import type { Script } from '../../data';

type Music = NonNullable<Script['generatedMusic']>;
type Status = { status: string; stage?: string; error?: string; installed?: boolean; music?: Music };
function suggestedSegmentLength(targetDuration: number) {
  if (targetDuration <= 30) return 30;
  if (targetDuration <= 60) return 60;
  return 90;
}
export function LocalMusicGenerator({ script, targetDuration, disabled, onReady, onBusyChange }: {
  script: Script; targetDuration: number; disabled: boolean; onReady: (music: Music) => Promise<void>; onBusyChange: (busy: boolean) => void;
}) {
  const { fetch } = useWorkspaceApi();
  const [status, setStatus] = useState<Status>({ status: 'idle', music: script.generatedMusic });
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(() => suggestedSegmentLength(targetDuration));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const mounted = useRef(true);
  const scriptIdRef = useRef(script.id); scriptIdRef.current = script.id;
  const seen = useRef(script.generatedMusic?.filename);
  const readyRef = useRef(onReady); readyRef.current = onReady;
  const running = submitting || status.status === 'running';
  useEffect(() => { onBusyChange(running); return () => onBusyChange(false); }, [running, onBusyChange]);
  useEffect(() => {
    mounted.current = true;
    let reading = false;
    const controller = new AbortController();
    async function poll() {
      if (reading) return;
      reading = true;
      try {
        const response = await fetch(`/api/render/music/status/${script.id}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Could not read music generation status.');
        const result: Status = await response.json();
        if (!mounted.current) return;
        setStatus(result);
        if (result.music && seen.current !== result.music.filename) {
          await readyRef.current(result.music);
          seen.current = result.music.filename;
        }
      } catch (err) { if (!controller.signal.aborted && mounted.current) setError(err instanceof Error ? err.message : 'Could not read music status.'); }
      finally { reading = false; }
    }
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    return () => { mounted.current = false; controller.abort(); clearInterval(timer); };
  }, [script.id, fetch]);
  useEffect(() => { setPrompt(''); setSuggesting(false); setDuration(suggestedSegmentLength(targetDuration)); }, [script.id, targetDuration]);
  async function autoGeneratePrompt() {
    const requestedScriptId = script.id;
    setSuggesting(true); setError('');
    try {
      const response = await fetch(`/api/render/music/prompt/${requestedScriptId}`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not create a music prompt.');
      if (mounted.current && scriptIdRef.current === requestedScriptId) setPrompt(result.prompt || '');
    } catch (err) {
      if (mounted.current && scriptIdRef.current === requestedScriptId) setError(err instanceof Error ? err.message : 'Could not create a music prompt.');
    } finally {
      if (mounted.current && scriptIdRef.current === requestedScriptId) setSuggesting(false);
    }
  }
  async function request(action: 'generate' | 'cancel') {
    setSubmitting(true); setError('');
    try {
      const response = await fetch(`/api/render/music/${action}/${script.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, duration }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Music request failed.');
      if (mounted.current) setStatus(previous => ({ ...previous, ...result }));
    } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : 'Music request failed.'); }
    finally { if (mounted.current) setSubmitting(false); }
  }
  return <div className="mt-3 space-y-3 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
    <p className="text-sm font-medium text-white">AI music · ACE-Step 1.5 · Runs on this computer</p>
    <p className="text-xs text-gray-400">Create a prompt from the video title, narration, mood, pacing, and scene visuals, or write your own. Every result is kept clean, sparse, quiet under narration, and instrumental.</p>
    <label className="block text-xs text-gray-300">Music description (optional)
      <textarea aria-label="AI music description" value={prompt} onChange={e => setPrompt(e.target.value)} disabled={disabled || running || suggesting} maxLength={1200} rows={3} placeholder="Auto-generate from the video, or describe a clean mood and a few instruments…" className="mt-1 w-full rounded border border-border bg-bg p-2 text-sm text-white" />
    </label>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={disabled || running || suggesting} onClick={() => void autoGeneratePrompt()} className="rounded border border-blue-400/50 bg-blue-500/10 px-3 py-2 text-sm text-blue-100 disabled:opacity-50">{suggesting ? 'Reading video context…' : 'Auto-generate prompt from video'}</button>
      <label className="text-xs text-gray-300">Segment length <select aria-label="AI music duration" disabled={disabled || running || suggesting} value={duration} onChange={e => setDuration(Number(e.target.value))} className="rounded border border-border bg-bg p-2 text-white">{[30, 60, 90].map(value => <option key={value} value={value}>{value} seconds</option>)}</select></label>
      <button disabled={disabled || running || suggesting || status.installed === false} onClick={() => void request('generate')} className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50">{running ? 'Generating music…' : status.music ? 'Generate another version' : 'Generate music locally'}</button>
      {running && <button disabled={submitting} onClick={() => void request('cancel')} className="rounded border border-border px-3 py-2 text-sm text-gray-200">Cancel music generation</button>}
    </div>
    {status.installed === false && <p role="alert" className="text-xs text-amber-300">The local music models are not installed yet.</p>}
    {running && <p role="status" className="text-xs text-blue-200">{status.stage || 'Starting…'} You can leave this tab and return later.</p>}
    {(error || status.status === 'error') && <p role="alert" className="text-xs text-red-300">{error || status.error}</p>}
    {status.music && <div className="space-y-2">
      <p className="text-xs text-green-300">Saved instrumental · {status.music.duration.toFixed(1)}s segment · covers the full {targetDuration.toFixed(1)}s video {status.music.duration + 0.01 < targetDuration ? `by repeating ${Math.ceil(targetDuration / status.music.duration)} times` : 'and is trimmed at the end'}.</p>
      <audio aria-label="Generated music preview" controls loop preload="none" src={status.music.url} className="w-full" />
      <details className="text-xs text-gray-400"><summary className="cursor-pointer">Music direction</summary><p className="mt-2">{status.music.prompt}</p></details>
    </div>}
  </div>;
}
