import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, ThumbsUp, Instagram, Loader2 } from 'lucide-react';
import type { Channel } from '../../data';
import { createWorkspaceFetch, useWorkspaceApi } from '../../services/workspaceApi';

type FbConnection = {
  configured: boolean; authenticated: boolean;
  user?: { name?: string } | null;
  pages?: { id: string; name: string; hasInstagram?: boolean; instagramUsername?: string }[] | null;
  page?: { id: string; name: string } | null;
  message?: string;
};
type IgConnection = {
  configured: boolean; authenticated: boolean;
  user?: { name?: string } | null;
  accounts?: { id: string; username: string; pageName: string }[] | null;
  account?: { id: string; username: string } | null;
  message?: string;
};

export function MetaAccountsPanel({ accounts, onAccountsChange, onSelectAccount }: {
  accounts: Channel[]; onAccountsChange: (accounts: Channel[]) => void; onSelectAccount: (account: Channel) => void;
}) {
  const { account: active, profile } = useWorkspaceApi();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [fb, setFb] = useState<Record<string, FbConnection>>({});
  const [ig, setIg] = useState<Record<string, IgConnection>>({});
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const pollers = useRef(new Set<ReturnType<typeof setInterval>>());
  const mounted = useRef(false);

  const refresh = useCallback(async (accountId: string) => {
    try {
      const doFetch = createWorkspaceFetch(accountId, profile);
      const [fbRes, igRes] = await Promise.all([doFetch('/api/facebook/status'), doFetch('/api/instagram/status')]);
      if (!fbRes.ok || !igRes.ok) throw new Error('Could not read Meta connections');
      const fbData: FbConnection = await fbRes.json();
      const igData: IgConnection = await igRes.json();
      if (mounted.current) {
        setFb((current) => ({ ...current, [accountId]: fbData }));
        setIg((current) => ({ ...current, [accountId]: igData }));
      }
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Meta status unavailable');
    }
  }, [profile]);

  useEffect(() => {
    mounted.current = true;
    accounts.forEach((account) => { void refresh(account.id); });
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

  function openPopup(prefix: string, accountId: string): Window | null {
    const popup = window.open('about:blank', `${prefix}-${accountId}`, 'width=620,height=760');
    if (!popup) setError('Allow popups for this app to connect Meta.');
    return popup;
  }

  async function connect(accountId: string, platform: 'facebook' | 'instagram') {
    const popup = openPopup(platform, accountId);
    if (!popup) return;
    setBusy(accountId); setError('');
    try {
      const response = await createWorkspaceFetch(accountId, profile)(`/api/${platform}/auth-url`);
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
    if (!window.confirm('Disconnect Facebook + Instagram for this account? They share one Meta login. Scripts and videos are kept.')) return;
    setBusy(accountId); setError('');
    try {
      const response = await createWorkspaceFetch(accountId, profile)('/api/facebook/disconnect', { method: 'POST' });
      if (!response.ok) throw new Error('Could not disconnect account');
      await refresh(accountId);
    } catch (err) { setError(err instanceof Error ? err.message : 'Disconnect failed'); }
    finally { setBusy(''); }
  }

  async function saveCredentials(event: React.FormEvent) {
    event.preventDefault(); if (!configuring) return;
    setBusy('credentials'); setError('');
    try {
      const response = await createWorkspaceFetch(configuring, profile)('/api/facebook/credentials', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId, appSecret }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save configuration');
      await refresh(configuring); setConfiguring(null); setAppSecret('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Configuration failed'); }
    finally { setBusy(''); }
  }

  return (
    <section aria-label="Facebook and Instagram accounts" className="space-y-4 rounded-xl border border-border bg-surface p-5">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <ThumbsUp size={20} className="text-[#1877F2]" />
          <Instagram size={20} className="text-pink-400" />
          Facebook & Instagram accounts
        </h2>
        <p className="mt-2 text-sm text-gray-400">
          One Meta app powers both: connect with Facebook Login once and TubeFlow can publish to your Pages and your linked Instagram Business/Creator accounts.
        </p>
      </div>
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input aria-label="New account name" placeholder="Account name, e.g. My travel channel" maxLength={80} required value={name} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm" />
        <button disabled={!!busy || !name.trim()} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm disabled:opacity-40"><Plus size={16} />Add account</button>
      </form>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <div className="space-y-3">
        {accounts.map((account) => {
          const fbStatus = fb[account.id];
          const igStatus = ig[account.id];
          const connected = Boolean(fbStatus?.authenticated || igStatus?.authenticated);
          return (
            <div key={account.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${active.id === account.id ? 'border-accent bg-accent/5' : 'border-border bg-bg'}`}>
              <div className="min-w-0">
                <p className="break-words font-medium">{account.name}{active.id === account.id && <span className="ml-2 text-xs text-accent">Active</span>}</p>
                <p className="text-xs text-gray-400">
                  {fbStatus?.authenticated
                    ? `FB: ${fbStatus.page?.name || fbStatus.user?.name || 'connected'} (${fbStatus.pages?.length || 0} pages)`
                    : fbStatus ? fbStatus.message || 'Facebook not connected' : 'Checking Facebook…'}
                  {' · '}
                  {igStatus?.authenticated
                    ? `IG: @${igStatus.account?.username || igStatus.accounts?.[0]?.username}`
                    : igStatus ? igStatus.message || 'Instagram not connected' : 'Checking Instagram…'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <button aria-label={`Use ${account.name}`} onClick={() => onSelectAccount(account)} className="rounded border border-border px-3 py-2">Use account</button>
                {connected
                  ? <button disabled={!!busy} onClick={() => void disconnect(account.id)} className="rounded border border-border px-3 py-2 text-red-300">Disconnect Meta</button>
                  : fbStatus?.configured || igStatus?.configured
                    ? (
                      <>
                        <button disabled={!!busy} onClick={() => void connect(account.id, 'facebook')} className="rounded bg-[#1877F2] px-3 py-2 text-white">
                          {busy === account.id ? <Loader2 size={14} className="animate-spin" /> : 'Connect Facebook'}
                        </button>
                        <button disabled={!!busy} onClick={() => void connect(account.id, 'instagram')} className="rounded bg-gradient-to-r from-purple-600 to-pink-600 px-3 py-2 text-white">Connect Instagram</button>
                      </>
                    )
                    : <button disabled={!fbStatus || !igStatus || !!busy} onClick={() => setConfiguring(account.id)} className="rounded border border-border px-3 py-2">Configure Meta App</button>}
              </div>
            </div>
          );
        })}
      </div>
      {configuring && (
        <form onSubmit={saveCredentials} className="space-y-3 rounded-lg border border-border bg-bg p-4">
          <h3 className="text-sm font-semibold">Meta app for {accounts.find((account) => account.id === configuring)?.name}</h3>
          <input aria-label="Meta App ID" required placeholder="App ID" value={appId} onChange={(e) => setAppId(e.target.value)} className="w-full rounded border border-border bg-surface p-2 text-sm" />
          <input aria-label="Meta App Secret" type="password" required placeholder="App secret" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} className="w-full rounded border border-border bg-surface p-2 text-sm" />
          <p className="text-xs text-gray-400">
            One app covers both platforms. Add both redirect URIs in Facebook Login settings: http://localhost:3001/api/facebook/callback and http://localhost:3001/api/instagram/callback.
          </p>
          <button disabled={!!busy} className="rounded bg-accent px-3 py-2 text-sm">Save Meta app settings</button>
          <button type="button" onClick={() => { setConfiguring(null); setAppSecret(''); }} className="ml-3 text-sm text-gray-400">Cancel</button>
        </form>
      )}
    </section>
  );
}
