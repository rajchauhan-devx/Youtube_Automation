import { useEffect, useRef, useState } from 'react';
import { BookOpen, ExternalLink, RefreshCw } from 'lucide-react';
import { useWorkspaceApi } from '../../services/workspaceApi';
import type { ProductionMemory, RetentionPerformance } from '../../../server/src/services/retention-types';

interface ProfileNotes {
  name: string;
  guidance: string;
  topics: { topic: string; videoId: string; videoUrl: string; uploadedAt: string; production?: ProductionMemory; performance?: RetentionPerformance }[];
}

export function ProfileTopicNotes() {
  const { fetch } = useWorkspaceApi();
  const [notes, setNotes] = useState<ProfileNotes | null>(null);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const syncController = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setNotes(null); setError(''); setMessage(''); setSyncing(false);
    void fetch('/api/llm/topic-notes', { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.topics)) throw new Error(data.error || 'Could not load topic notes');
      if (!controller.signal.aborted) setNotes(data);
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load topic notes'); });
    return () => { controller.abort(); syncController.current?.abort(); };
  }, [fetch]);

  async function refreshPerformance() {
    if (syncing) return;
    const controller = new AbortController();
    syncController.current = controller;
    setSyncing(true); setError('');
    try {
      const response = await fetch('/api/youtube/retention/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: true }), signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not import YouTube performance');
      const historyResponse = await fetch('/api/llm/topic-notes', { signal: controller.signal });
      const history = await historyResponse.json();
      if (!historyResponse.ok || !Array.isArray(history.topics)) throw new Error(history.error || 'Could not reload profile notes');
      if (!controller.signal.aborted) { setNotes(history); setMessage(result.message || 'Performance refreshed.'); }
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not refresh performance'); }
    finally { if (!controller.signal.aborted) setSyncing(false); }
  }

  return <section aria-label="Profile topic notes" className="studio-card p-6">
    <h2 className="flex items-center gap-2 text-base font-bold text-white"><BookOpen size={18} className="text-accent" />Auto-Pilot Topic Notes</h2>
    <p className="mt-2 text-xs leading-relaxed text-muted">Each profile has its own notes file. Successful YouTube exports are remembered across Shorts, Long Video and Mixed Media so AI can avoid repeating a topic.</p>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button type="button" disabled={syncing || !notes?.topics.length} onClick={() => void refreshPerformance()} className="studio-btn-ghost text-xs disabled:opacity-40"><RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />{syncing ? 'Importing performance…' : 'Refresh YouTube retention'}</button>
      <p className="text-[11px] text-muted">Requires YouTube Analytics access. New uploads need time to accumulate data.</p>
    </div>
    {message && <p role="status" className="mt-2 text-xs text-gray-300">{message}</p>}
    {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
    {!notes && !error && <p className="mt-3 text-xs text-muted">Loading notes…</p>}
    {notes && <>
      <p className="mt-4 text-sm font-semibold text-white">{notes.name} · {notes.topics.length} exported topics</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{notes.guidance}</p>
      {!notes.topics.length && <p className="mt-3 text-xs text-muted">Topics will appear here after a video is successfully exported to YouTube.</p>}
      <ul className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto">
        {[...notes.topics].reverse().map(entry => <li key={entry.videoId} className="rounded-lg border border-border p-3 text-xs">
          <div className="flex items-start justify-between gap-3"><span className="min-w-0 break-words text-gray-200">{entry.topic}</span>
          <a href={`https://youtu.be/${encodeURIComponent(entry.videoId)}`} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 text-accent"><ExternalLink size={12} />YouTube</a></div>
          {entry.production && <p className="mt-2 leading-relaxed text-muted">Opening: {entry.production.hook}</p>}
          {entry.performance && <div className="mt-2 space-y-2 text-muted">
            <p>{entry.performance.views.toLocaleString()} views · {entry.performance.averageViewDuration.toFixed(1)}s average watched · {entry.performance.averageViewPercentage.toFixed(1)}% average viewed</p>
            {entry.performance.status === 'insufficient_data' && <p>Limited audience data — excluded from AI performance comparisons until there are at least 100 views and a retention curve.</p>}
            {entry.performance.curve.length > 1 && <svg viewBox="0 0 280 70" role="img" aria-label={`Audience retention for ${entry.topic}`} className="h-20 w-full max-w-sm rounded bg-bg/60">
              <polyline fill="none" stroke="currentColor" strokeWidth="2" className="text-accent" points={entry.performance.curve.map(point => `${5 + point.elapsed * 270},${65 - point.watchRatio / Math.max(1, ...entry.performance!.curve.map(item => item.watchRatio)) * 60}`).join(' ')} />
            </svg>}
            {entry.performance.dips.map((dip, i) => <p key={i}>Observed drop near {Math.round(dip.elapsed * 100)}% of the video{dip.purpose ? `: ${dip.purpose}` : ''}. This does not establish the cause.</p>)}
            <p className="text-[10px]">YouTube Analytics · {entry.performance.startDate}–{entry.performance.endDate}. Shorts swipe-away metrics remain available in YouTube Studio.</p>
          </div>}
        </li>)}
      </ul>
    </>}
  </section>;
}
