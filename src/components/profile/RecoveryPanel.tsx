import { useCallback, useEffect, useState } from 'react';
import { useWorkspaceApi } from '../../services/workspaceApi';

type Recovery = { fingerprint: string; stores: { name: string; damaged: boolean; canRestore: boolean }[]; backups: { id: string; createdAt: string; files: number; bytes: number }[] };
export function RecoveryPanel() {
  const { fetch, profile, account } = useWorkspaceApi();
  const [data, setData] = useState<Recovery>(), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [selected, setSelected] = useState('');
  const request = useCallback(async (url: string, body?: unknown) => {
    const response = await fetch(`/api/recovery${url}`, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Recovery request failed'); return result;
  }, [fetch]);
  const refresh = useCallback(async () => { setData(await request('')); }, [request]);
  useEffect(() => { let active = true; setData(undefined); setError(''); setMessage(''); setSelected(''); request('').then(result => { if (active) setData(result); }).catch(error => { if (active) setError(error.message); }); return () => { active = false; }; }, [request]);
  async function act(work: () => Promise<string>) {
    setBusy(true); setError(''); setMessage('');
    try { setMessage(await work()); await refresh(); } catch (error) { setError(error instanceof Error ? error.message : 'Recovery failed'); }
    finally { setBusy(false); }
  }
  const backup = data?.backups.find(backup => backup.id === selected);
  return <section aria-label="Backups and recovery" className="studio-card space-y-4 p-6">
    <h2 className="text-base font-bold text-white">Backups & recovery</h2>
    <p className="text-xs text-muted">{account.name} · {profile}. Local snapshots include scripts, settings, generated media, completed exports and motion assets. Account credentials and model caches are excluded.</p>
    <div className="flex flex-wrap gap-3"><button type="button" className="studio-btn-primary" disabled={busy || !data} onClick={() => void act(async () => { const result = await request('/backups', {}); return `Backup created · ${result.files} files verified.`; })}>{busy ? 'Working…' : 'Create verified backup'}</button><button type="button" className="studio-btn-ghost" disabled={busy} onClick={() => void act(async () => { await refresh(); return 'Recovery status refreshed.'; })}>Refresh recovery status</button></div>
    {data?.stores.filter(store => store.damaged).map(store => <div key={store.name} className="space-y-2 rounded-xl border border-red-400/40 p-3 text-xs text-red-200"><p>Saved {store.name} data is damaged. Writes are blocked to protect your projects.</p><button type="button" className="underline disabled:opacity-40" disabled={busy || !store.canRestore} onClick={() => void act(async () => { await request(`/stores/${encodeURIComponent(store.name)}/restore`, { fingerprint: data.fingerprint }); return `${store.name} recovered. Reopen the script list to load the restored data.`; })}>Restore last verified {store.name} copy</button>{!store.canRestore && <p>Select a full workspace backup below.</p>}</div>)}
    <label className="block text-xs text-gray-300">Saved workspace backup<select aria-label="Workspace backup" className="studio-input mt-1" disabled={busy} value={selected} onChange={event => setSelected(event.target.value)}><option value="">Select a backup</option>{data?.backups.map(backup => <option key={backup.id} value={backup.id}>{new Date(backup.createdAt).toLocaleString()} · {backup.files} files · {(backup.bytes / 1048576).toFixed(1)} MB</option>)}</select></label>
    {backup && <div className="space-y-3 rounded-xl border border-amber-400/30 p-3 text-xs text-amber-100"><p>Restore this profile to {new Date(backup.createdAt).toLocaleString()}. Every file is verified first; a copy of the current workspace is retained for recovery.</p><button type="button" className="studio-btn-ghost" disabled={busy} onClick={() => void act(async () => { await request(`/backups/${backup.id}/restore`, { fingerprint: data!.fingerprint }); return 'Workspace restored. Reload the app to load the restored scripts and settings.'; })}>Restore selected backup</button></div>}
    <p className="text-[11px] text-muted">Snapshots are stored in the data folder under .workspace-backups. Copy that folder to another drive for protection against disk failure.</p>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}{message && <p role="status" className="text-xs text-emerald-300">{message}</p>}
  </section>;
}
