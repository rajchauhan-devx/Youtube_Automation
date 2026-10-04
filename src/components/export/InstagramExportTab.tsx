import { useWorkspaceApi } from '../../services/workspaceApi';
import { useState, useEffect, useRef } from 'react';
import {
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  UploadCloud,
  ExternalLink,
  RefreshCw,
  Key,
  Loader2,
  Film,
  Instagram,
} from 'lucide-react';
import type { Script } from '../../data';
import { copyTextToClipboard } from '../../lib/safe';

interface InstagramAccount {
  id: string;
  username: string;
  pageId: string;
  pageName: string;
}

interface InstagramStatusResponse {
  configured: boolean;
  authenticated: boolean;
  user?: { id?: string; name?: string } | null;
  accounts: InstagramAccount[];
  account: InstagramAccount | null;
  message?: string;
}

interface GeneratedMetadataResponse {
  titles: string[];
  description: string;
  tags: string[];
}

export function InstagramExportTab({
  script,
  onUpdate,
  onNavigateToTimeline,
}: {
  script: Script | null;
  onUpdate: (patch: Partial<Script>) => void;
  onNavigateToTimeline?: () => void;
}) {
  const { fetch, account, profile } = useWorkspaceApi();
  const [renderedVideo, setRenderedVideo] = useState<string | null>(null);
  const [videoFilename, setVideoFilename] = useState<string | null>(null);
  const [checkingVideo, setCheckingVideo] = useState(true);

  const oauthOrigin = useRef('');
  const oauthPopup = useRef<Window | null>(null);
  const oauthTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [igStatus, setIgStatus] = useState<InstagramStatusResponse>({ configured: false, authenticated: false, accounts: [], account: null });
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [appIdInput, setAppIdInput] = useState('');
  const [appSecretInput, setAppSecretInput] = useState('');
  const [savingCreds, setSavingCreds] = useState(false);

  const initialData = script?.instagramExport;
  const [caption, setCaption] = useState(initialData?.caption || '');
  const [tagsText, setTagsText] = useState(initialData?.tags ? initialData.tags.join(', ') : '');
  const [igUserId, setIgUserId] = useState(initialData?.igUserId || '');
  const [hookOptions, setHookOptions] = useState<string[]>(initialData?.titles || []);
  const [generating, setGenerating] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState<{ mediaId: string; videoUrl: string } | null>(
    initialData?.uploadedMediaId && initialData?.uploadedVideoUrl
      ? { mediaId: initialData.uploadedMediaId, videoUrl: initialData.uploadedVideoUrl }
      : null
  );
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    setRenderedVideo(null);
    setVideoFilename(null);
    if (!script?.id || !script.generatedImages?.length || !script.generatedAudio?.length) {
      setCheckingVideo(false);
      return;
    }
    const controller = new AbortController();
    setCheckingVideo(true);
    fetch(`/api/render/status/${script.id}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data.videos && data.videos.length > 0) {
          setRenderedVideo(data.videos[0].url);
          setVideoFilename(data.videos[0].filename);
        }
      })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setCheckingVideo(false); });
    return () => controller.abort();
  }, [script?.id, script?.generatedImages?.length, script?.generatedAudio?.length]);

  async function refreshStatus() {
    setCheckingStatus(true);
    try {
      const res = await fetch('/api/instagram/status');
      const data: InstagramStatusResponse = await res.json();
      setIgStatus(data);
      if (!igUserId && (initialData?.igUserId || data.account?.id)) setIgUserId(initialData?.igUserId || data.account!.id);
    } catch {
      setIgStatus({ configured: false, authenticated: false, accounts: [], account: null });
    } finally {
      setCheckingStatus(false);
    }
  }

  useEffect(() => {
    refreshStatus();
    function handleOAuthMessage(e: MessageEvent) {
      if (e.origin === oauthOrigin.current && e.source === oauthPopup.current && e.data?.type === 'instagram-connected' && e.data.accountId === account.id) {
        refreshStatus();
      }
      // A Facebook-tab login uses the same Meta token and also unlocks Instagram.
      if (e.origin === oauthOrigin.current && e.source === oauthPopup.current && e.data?.type === 'facebook-connected' && e.data.accountId === account.id) {
        refreshStatus();
      }
    }
    window.addEventListener('message', handleOAuthMessage);
    return () => { window.removeEventListener('message', handleOAuthMessage); if (oauthTimer.current) clearInterval(oauthTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persist(patch: Partial<NonNullable<Script['instagramExport']>>) {
    if (!script?.id) return;
    onUpdate({ instagramExport: { ...(script.instagramExport || {}), ...patch } });
  }

  async function handleConnect() {
    const popup = window.open('about:blank', `instagram-${account.id}`, 'width=600,height=700');
    if (!popup) { alert('Allow popups for this app to connect Instagram.'); return; }
    oauthPopup.current = popup;
    try {
      const res = await fetch('/api/instagram/auth-url');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get auth URL');
      oauthOrigin.current = data.callbackOrigin;
      popup.location.href = data.url;
      if (oauthTimer.current) clearInterval(oauthTimer.current);
      const started = Date.now();
      const interval = setInterval(() => {
        if (popup.closed || Date.now() - started > 10 * 60_000) {
          clearInterval(interval); oauthTimer.current = null;
          void refreshStatus();
        }
      }, 1500);
      oauthTimer.current = interval;
    } catch (err) {
      popup.close();
      alert(err instanceof Error ? err.message : 'Could not connect Instagram account.');
    }
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect Instagram/Facebook from TubeFlow? Both share one Meta login.')) return;
    try {
      await fetch('/api/instagram/disconnect', { method: 'POST' });
      refreshStatus();
    } catch (err) { console.error(err); }
  }

  async function handleSaveCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (!appIdInput.trim() || !appSecretInput.trim()) return;
    setSavingCreds(true);
    try {
      const res = await fetch('/api/instagram/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: appIdInput, appSecret: appSecretInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save credentials');
      setShowConfigModal(false);
      refreshStatus();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save credentials');
    } finally {
      setSavingCreds(false);
    }
  }

  async function handleGenerate(field: 'all' | 'title' | 'description' | 'tags' = 'all') {
    if (!script) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/instagram/generate-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: script.topicName || script.name || '',
          script: script.content || script.extractedScript || '',
          narration: script.narration || '',
          isShort: profile === 'shorts',
          field,
        }),
      });
      const data: GeneratedMetadataResponse = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Failed to generate metadata');
      if (data.titles?.length) { setHookOptions(data.titles); persist({ titles: data.titles }); }
      if (data.description) { setCaption(data.description); persist({ caption: data.description }); }
      if (data.tags?.length) { setTagsText(data.tags.join(', ')); persist({ tags: data.tags }); }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate Instagram caption');
    } finally {
      setGenerating(false);
    }
  }

  function copy(text: string, fieldName: string) {
    copyTextToClipboard(text).then((ok) => {
      if (!ok) return;
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    });
  }

  async function handleUpload() {
    if (!script?.id || !caption.trim()) { alert('Please write a caption before publishing.'); return; }
    const targetIg = igUserId || igStatus.account?.id || igStatus.accounts[0]?.id;
    if (!targetIg) { alert('No Instagram account available. Link Instagram to a Facebook Page first.'); return; }
    setUploading(true);
    setUploadError('');
    setUploadProgress(10);
    setUploadStage('Creating Reel container...');
    const timer = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev < 40) { setUploadStage('Uploading video to Instagram...'); return prev + 6; }
        if (prev < 85) { setUploadStage('Instagram is processing your Reel...'); return prev + 3; }
        return prev;
      });
    }, 1000);
    try {
      const parsedTags = tagsText.split(',').map((t) => t.trim()).filter(Boolean);
      const res = await fetch('/api/instagram/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: script.id,
          videoFilename: videoFilename || undefined,
          caption, tags: parsedTags,
          igUserId: targetIg,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setUploadProgress(100);
      setUploadStage('Upload Complete!');
      setUploadSuccess({ mediaId: data.mediaId, videoUrl: data.videoUrl });
      persist({ uploadedMediaId: data.mediaId, uploadedVideoUrl: data.videoUrl, uploadedAt: new Date().toISOString(), igUserId: data.igUserId, username: data.username });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Instagram upload failed');
    } finally {
      clearInterval(timer);
      setUploading(false);
    }
  }

  const accounts = igStatus.accounts || [];
  const effectiveIg = igUserId || igStatus.account?.id || '';
  const fullCaptionPreview = [caption, tagsText.split(',').map((t) => t.trim()).filter(Boolean).map((t) => `#${t.replace(/\s+/g, '')}`).join(' ')].filter(Boolean).join('\n\n');

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-amber-400 text-white ring-1 ring-pink-400/40">
            <Instagram className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Instagram Reels Publishing
              {renderedVideo && (
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">READY TO EXPORT</span>
              )}
            </h2>
            <p className="text-xs text-gray-400">Publish your rendered video as a Reel with an AI-written caption.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {igStatus.authenticated ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5">
              <div className="text-left">
                <span className="block text-xs font-semibold text-emerald-200">@{igStatus.account?.username || accounts[0]?.username || igStatus.user?.name}</span>
                <span className="block text-[10px] text-emerald-400/80">Instagram Connected</span>
              </div>
              <button onClick={handleDisconnect} className="ml-2 text-[11px] text-gray-400 hover:text-red-300">Disconnect</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {igStatus.configured ? (
                <button onClick={handleConnect} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90">
                  <Instagram className="h-4 w-4" /> Connect Instagram
                </button>
              ) : (
                <button onClick={() => setShowConfigModal(true)} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface2 px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white">
                  <Key className="h-3.5 w-3.5 text-amber-400" /> Setup Meta App
                </button>
              )}
              <button onClick={refreshStatus} disabled={checkingStatus} className="rounded-lg border border-border p-2 text-gray-400 hover:bg-surface2 hover:text-white" title="Refresh Status">
                <RefreshCw className={`h-3.5 w-3.5 ${checkingStatus ? 'animate-spin' : ''}`} />
              </button>
            </div>
          )}
        </div>
      </div>

      {igStatus.message && (
        <div className={`mb-4 rounded-lg border p-3 text-xs flex items-center gap-2 ${igStatus.authenticated ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>
          <AlertCircle className="h-4 w-4 shrink-0" /> {igStatus.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-5">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <span className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              <Film className="h-3.5 w-3.5 text-accent" /> 1. Rendered Video
            </span>
            <div className="relative flex aspect-[9/16] max-w-[290px] w-full mx-auto items-center justify-center overflow-hidden rounded-xl border border-border bg-black">
              {renderedVideo ? (
                <video src={renderedVideo} controls playsInline className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-gray-500">
                  <Film className="h-10 w-10 text-gray-600 mb-2" />
                  <p className="text-xs font-medium text-gray-300">{checkingVideo ? 'Checking for rendered video...' : 'No Rendered Video Found'}</p>
                  {!checkingVideo && <p className="text-[11px] text-gray-500 mt-1 mb-3">Reels need a rendered 9:16 video. Render first in Timeline.</p>}
                  {onNavigateToTimeline && !checkingVideo && (
                    <button onClick={onNavigateToTimeline} className="rounded-md bg-accent/20 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/30">Go to Timeline & Render</button>
                  )}
                </div>
              )}
            </div>
            <p className="mt-2 text-[11px] text-gray-500 text-center">Reels perform best as 9:16 vertical video under 90 seconds.</p>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm space-y-3">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">2. Target Instagram Account</span>
            {accounts.length === 0 ? (
              <p className="text-xs text-gray-500 rounded-lg border border-dashed border-border p-4 text-center">
                {igStatus.configured
                  ? 'No Business/Creator account linked. Connect Instagram to a Facebook Page in Meta Business settings, then reconnect.'
                  : 'Connect Instagram to list your accounts.'}
              </p>
            ) : (
              <select
                value={effectiveIg}
                onChange={(e) => { setIgUserId(e.target.value); const a = accounts.find((x) => x.id === e.target.value); persist({ igUserId: e.target.value, username: a?.username }); }}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-white outline-none focus:border-accent"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>@{a.username} (via {a.pageName})</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-7">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">3. Reel Caption & Hashtags</span>
              <button type="button" onClick={() => handleGenerate()} disabled={generating} className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40">
                {generating ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...</> : <><Sparkles className="h-3.5 w-3.5" /> Generate Caption with AI</>}
              </button>
            </div>
            {hookOptions.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-semibold text-pink-300 uppercase tracking-wider">Cover hooks (tap to prepend):</span>
                {hookOptions.map((opt, idx) => (
                  <button key={idx} type="button" onClick={() => { setCaption(`${opt}\n\n${caption}`.slice(0, 2200)); }}
                    className="text-left rounded-md border border-border/60 bg-surface2/40 p-2 text-xs text-gray-300 hover:bg-surface2">{opt}</button>
                ))}
              </div>
            )}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <label className="font-semibold text-gray-300">Caption ({caption.length}/2200)</label>
                <button onClick={() => copy(fullCaptionPreview, 'cap')} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white">
                  {copiedField === 'cap' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />} Copy caption + tags
                </button>
              </div>
              <textarea rows={6} value={caption} maxLength={2200} onChange={(e) => { setCaption(e.target.value); persist({ caption: e.target.value }); }}
                placeholder="Hook first line, value, CTA (Save + Follow), hashtags..." className="w-full rounded-lg border border-border bg-bg p-3 text-xs leading-relaxed text-white outline-none focus:border-accent font-sans" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-300">Hashtags (comma separated)</label>
              <input type="text" value={tagsText} onChange={(e) => { setTagsText(e.target.value); persist({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) }); }}
                placeholder="reels, motivation, viral" className="w-full rounded-lg border border-border bg-bg px-3.5 py-2 text-xs text-white outline-none focus:border-accent" />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm space-y-4">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              <UploadCloud className="h-3.5 w-3.5 text-accent" /> 4. Publish Reel
            </span>
            {uploadSuccess && (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-white">Reel Published to Instagram!</h4>
                    <p className="text-xs text-emerald-300">Your Reel is live on your profile.</p>
                  </div>
                </div>
                <a href={uploadSuccess.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">
                  <ExternalLink className="h-3.5 w-3.5" /> View Reel
                </a>
              </div>
            )}
            {uploadError && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" /> <span>{uploadError}</span>
              </div>
            )}
            {igStatus.authenticated ? (
              <button onClick={handleUpload} disabled={uploading || !renderedVideo || !caption.trim() || !effectiveIg}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 p-3.5 text-sm font-bold text-white shadow-lg hover:opacity-90 disabled:opacity-40">
                {uploading ? <><Loader2 className="h-5 w-5 animate-spin" /> {uploadStage} ({uploadProgress}%)</>
                  : <><UploadCloud className="h-5 w-5" /> Publish Reel to Instagram</>}
              </button>
            ) : (
              <div className="rounded-lg border border-border/80 bg-surface2/30 p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-white">Direct Publishing Not Connected</span>
                  <p className="text-[11px] text-gray-400">Connect with Facebook Login to publish Reels with one click.</p>
                </div>
                <button onClick={igStatus.configured ? handleConnect : () => setShowConfigModal(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90">
                  <Instagram className="h-4 w-4" /> {igStatus.configured ? 'Connect Account' : 'Configure Meta App'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><Key className="h-4 w-4 text-amber-400" /> Configure Meta App</h3>
              <button onClick={() => setShowConfigModal(false)} className="text-gray-400 hover:text-white text-xs">✕</button>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Create an app at <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-accent underline">developers.facebook.com/apps</a>,
              add the <strong>Facebook Login</strong> product with redirect URIs{' '}
              <code className="text-gray-200 bg-surface2 px-1 rounded">http://localhost:3001/api/facebook/callback</code> and{' '}
              <code className="text-gray-200 bg-surface2 px-1 rounded">http://localhost:3001/api/instagram/callback</code>,
              then paste the App ID + Secret here. The same app powers both Facebook and Instagram tabs.
            </p>
            <form onSubmit={handleSaveCredentials} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">App ID</label>
                <input type="text" required value={appIdInput} onChange={(e) => setAppIdInput(e.target.value)} placeholder="1234567890"
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-white outline-none focus:border-accent" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">App Secret</label>
                <input type="password" required value={appSecretInput} onChange={(e) => setAppSecretInput(e.target.value)} placeholder="••••••••"
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-white outline-none focus:border-accent" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowConfigModal(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2">Cancel</button>
                <button type="submit" disabled={savingCreds} className="rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent/80 disabled:opacity-40">
                  {savingCreds ? 'Saving...' : 'Save App Credentials'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
