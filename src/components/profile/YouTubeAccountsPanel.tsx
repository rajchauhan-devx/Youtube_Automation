import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Youtube, Loader2 } from 'lucide-react';
import type { Channel } from '../../data';
import { createWorkspaceFetch, useWorkspaceApi } from '../../services/workspaceApi';

type Connection = { configured: boolean; authenticated: boolean; channel?: { title?: string } | null; message?: string };
export function YouTubeAccountsPanel({ accounts, onAccountsChange, onSelectAccount }: {
  accounts: Channel[]; onAccountsChange: (accounts: Channel[]) => void; onSelectAccount: (account: Channel) => void;
}) {
  const { account: active, profile } = useWorkspaceApi();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [connections, setConnections] = useState<Record<string, Connection>>({});
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const pollers = useRef(new Set<ReturnType<typeof setInterval>>());
  const mounted = useRef(false);
  const refresh = useCallback(async (accountId: string) => {
    try {
      const response = await createWorkspaceFetch(accountId, profile)('/api/youtube/status');
      if (!response.ok) throw new Error('Could not read account connection');
      const data: Connection = await response.json();
      if (mounted.current) setConnections(current => ({ ...current, [accountId]: data }));
    } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : 'Connection status unavailable'); }
  }, [profile]);
  useEffect(() => {
    mounted.current = true;
    accounts.forEach(account => { void refresh(account.id); });
    const timers = pollers.current;
    return () => { mounted.current = false; timers.forEach(clearInterval); timers.clear(); };
  }, [accounts, refresh]);

  async function add(event: React.FormEvent) {
    event.preventDefault(); setBusy('add'); setError('');
    try {
      const response = await fetch('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create account');
      onAccountsChange([...accounts, data.account]);
      onSelectAccount(data.account); setName('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not add account'); }
    finally { setBusy(''); }
  }

  async function connect(accountId: string) {
    // Open synchronously so the browser does not block the Google sign-in window.
    const popup = window.open('about:blank', `youtube-${accountId}`, 'width=620,height=760');
    if (!popup) { setError('Allow popups for this app to connect YouTube.'); return; }
    setBusy(accountId); setError('');
    try {
      const response = await createWorkspaceFetch(accountId, profile)('/api/youtube/auth-url');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start connection');
      popup.location.href = data.url;
      const started = Date.now();
      const timer = setInterval(() => {
        if (popup.closed || Date.now() - started > 10 * 60_000) { clearInterval(timer); pollers.current.delete(timer); void refresh(accountId); }
      }, 3000);
      pollers.current.add(timer);
    } catch (err) { popup.close(); setError(err instanceof Error ? err.message : 'Connection failed'); }
    finally { setBusy(''); }
  }

  async function disconnect(accountId: string) {
    if (!window.confirm('Disconnect only this YouTube account? Its scripts and videos will be kept.')) return;
    setBusy(accountId); setError('');
    try {
      const response = await createWorkspaceFetch(accountId, profile)('/api/youtube/disconnect', { method: 'POST' });
      if (!response.ok) throw new Error('Could not disconnect account');
      await refresh(accountId);
    } catch (err) { setError(err instanceof Error ? err.message : 'Disconnect failed'); }
    finally { setBusy(''); }
  }

  async function saveCredentials(event: React.FormEvent) {
    event.preventDefault(); if (!configuring) return;
    setBusy('credentials'); setError('');
    try {
      const response = await createWorkspaceFetch(configuring, profile)('/api/youtube/credentials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, clientSecret }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save configuration');
      await refresh(configuring); setConfiguring(null); setClientSecret('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Configuration failed'); }
    finally { setBusy(''); }
  }

  return <section aria-label="YouTube accounts" className="space-y-4 rounded-xl border border-border bg-surface p-5">
    <div><h2 className="flex items-center gap-2 text-xl font-semibold"><Youtube className="text-red-400" />YouTube accounts</h2>
      <p className="mt-2 text-sm text-gray-400">Each account has separate Shorts and Long Video workspaces. Add an account, connect its YouTube channel, then switch accounts to work on its videos.</p></div>
    <form onSubmit={add} className="flex flex-wrap gap-2">
      <input aria-label="New YouTube account name" placeholder="Account name, e.g. My travel channel" maxLength={80} required value={name} onChange={e => setName(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm" />
      <button disabled={!!busy || !name.trim()} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm disabled:opacity-40"><Plus size={16} />Add account</button>
    </form>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    <div className="space-y-3">{accounts.map(account => {
      const status = connections[account.id];
      return <div key={account.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${active.id === account.id ? 'border-accent bg-accent/5' : 'border-border bg-bg'}`}>
        <div className="min-w-0"><p className="break-words font-medium">{account.name}{active.id === account.id && <span className="ml-2 text-xs text-accent">Active</span>}</p>
          <p className="text-xs text-gray-400">{status?.authenticated ? `Connected: ${status.channel?.title || account.youtubeChannelTitle}` : status ? status.message || 'YouTube not connected' : 'Checking connection…'}</p></div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button aria-label={`Use ${account.name}`} onClick={() => onSelectAccount(account)} className="rounded border border-border px-3 py-2">Use account</button>
          {status?.authenticated ? <button disabled={!!busy} onClick={() => void disconnect(account.id)} className="rounded border border-border px-3 py-2 text-red-300">Disconnect</button>
            : status?.configured ? <button disabled={!!busy} onClick={() => void connect(account.id)} className="rounded bg-red-600 px-3 py-2">{busy === account.id ? <Loader2 size={14} className="animate-spin" /> : 'Connect YouTube'}</button>
              : <button disabled={!status || !!busy} onClick={() => setConfiguring(account.id)} className="rounded border border-border px-3 py-2">Configure OAuth</button>}
        </div>
      </div>;
    })}</div>
    {configuring && <form onSubmit={saveCredentials} className="space-y-3 rounded-lg border border-border bg-bg p-4">
      <h3 className="text-sm font-semibold">Google OAuth application for {accounts.find(account => account.id === configuring)?.name}</h3>
      <input aria-label="Google OAuth client ID" required placeholder="Client ID" value={clientId} onChange={e => setClientId(e.target.value)} className="w-full rounded border border-border bg-surface p-2 text-sm" />
      <input aria-label="Google OAuth client secret" type="password" required placeholder="Client secret" value={clientSecret} onChange={e => setClientSecret(e.target.value)} className="w-full rounded border border-border bg-surface p-2 text-sm" />
      <p className="text-xs text-gray-400">Use your configured OAuth redirect URI (default: http://localhost:3001/api/youtube/callback). Each channel must complete Google sign-in separately.</p>
      <button disabled={!!busy} className="rounded bg-accent px-3 py-2 text-sm">Save OAuth settings</button>
      <button type="button" onClick={() => { setConfiguring(null); setClientSecret(''); }} className="ml-3 text-sm text-gray-400">Cancel</button>
    </form>}
  </section>;
}
