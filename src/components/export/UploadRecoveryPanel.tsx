import { useEffect, useState } from 'react';
import { useWorkspaceApi } from '../../services/workspaceApi';
type Upload = { id: string; status: string; videoFilename: string; startedAt: string };
export function UploadRecoveryPanel({ scriptId, refreshKey, onRecovered }: { scriptId: string; refreshKey: string; onRecovered: (result: { videoId: string; videoUrl: string }) => void }) {
  const { fetch } = useWorkspaceApi();
  const [uploads, setUploads] = useState<Upload[]>([]), [videoId, setVideoId] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/youtube/upload-status/${encodeURIComponent(scriptId)}`, { signal: abort.signal }).then(async response => { const data = await response.json(); if (response.ok && !abort.signal.aborted) setUploads(data.uploads || []); }).catch(() => {});
    return () => abort.abort();
  }, [fetch, scriptId, refreshKey]);
  const pending = uploads.filter(upload => upload.status === 'uncertain' || upload.status === 'sending');
  async function recover(upload: Upload, retry = false) {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/youtube/uploads/${upload.id}/${retry ? 'retry' : 'reconcile'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(retry ? { confirmedNoVideo: true } : { videoId: videoId.trim() }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Upload recovery failed');
      setUploads(previous => previous.filter(item => item.id !== upload.id)); if (!retry) onRecovered(data);
    } catch (error) { setError(error instanceof Error ? error.message : 'Upload recovery failed'); } finally { setBusy(false); }
  }
  if (!pending.length) return null;
  return <section aria-label="Upload recovery" className="space-y-3 rounded-xl border border-amber-400/40 p-4 text-xs text-amber-100"><h3 className="font-semibold">Previous upload needs attention</h3><p>A previous request may already have reached YouTube. Check your channel in <a href="https://studio.youtube.com" target="_blank" rel="noreferrer" className="underline">YouTube Studio</a> before retrying.</p>{pending.map(upload => <div key={upload.id} className="space-y-2"><p>{upload.videoFilename} · {new Date(upload.startedAt).toLocaleString()} · {upload.status}</p><label className="block">Existing YouTube video ID<input aria-label="Existing YouTube video ID" className="studio-input mt-1" value={videoId} disabled={busy} onChange={event => setVideoId(event.target.value)} /></label><div className="flex flex-wrap gap-3"><button type="button" className="underline disabled:opacity-40" disabled={busy || !videoId.trim()} onClick={() => void recover(upload)}>Use this existing upload</button><button type="button" className="underline disabled:opacity-40" disabled={busy} onClick={() => void recover(upload, true)}>I checked Studio: no upload exists</button></div></div>)}{error && <p role="alert" className="text-red-300">{error}</p>}</section>;
}
