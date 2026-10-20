import { mediaScenes } from '../../../server/src/services/shorts-media';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Plus, Loader2, Sparkles, Square, Film, Image as ImageIcon, Download, User, RefreshCw, ExternalLink, X } from 'lucide-react';
import { type Script, getChannelLoraProfile, formatPromptWithChannelStyleDna } from '../../data';
import { useWorkspaceApi } from '../../services/workspaceApi';
import { GenerationDisclosure } from './GenerationDisclosure';
import { CloudflareImagePanel, type ImageProviderMode } from './CloudflareImagePanel';

interface FlowJobState {
  id: string;
  state: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  stage: string;
  progress: number;
  error?: string;
  overseerCode?: string;
  result?: { downloadId: string; bytes: number };
}

// Per-scene Google Flow automation: start → poll → download → import.
// Uses the global /api/flow routes (own Google session); the downloaded MP4 is
// imported through the workspace-scoped media-import, same as manual upload.
interface FlowCreditsState {
  credits: number;
  videosRemaining: number;
  status: 'ok' | 'low' | 'exhausted';
  tier: string;
  account: string;
  costPerVideo?: number;
}

interface FlowAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  credits: FlowCreditsState | null;
  onUpdated: () => void;
}

function FlowAccountModal({ isOpen, onClose, credits, onUpdated }: FlowAccountModalProps) {
  const [emailInput, setEmailInput] = useState(credits?.account || '');
  const [creditsInput, setCreditsInput] = useState(credits?.credits !== undefined ? String(credits.credits) : '800');
  const [launching, setLaunching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (credits) {
      setEmailInput(credits.account || '');
      setCreditsInput(String(credits.credits ?? 800));
    }
  }, [credits]);

  if (!isOpen) return null;

  async function handleLaunchLogin(fresh = false) {
    setLaunching(true);
    setMsg(fresh ? 'Launching clean browser window…' : 'Launching browser window…');
    try {
      const res = await globalThis.fetch('/api/flow/launch-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fresh }),
      });
      const data = await res.json() as { message?: string };
      setMsg(data.message || (fresh ? 'Clean browser opened! Sign into your new Google account, then close the browser.' : 'Browser opened! Sign into your Google account, then close the browser.'));
      const poll = setInterval(() => {
        onUpdated();
      }, 3000);
      setTimeout(() => clearInterval(poll), 60000);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to launch login window');
    } finally {
      setLaunching(false);
    }
  }

  async function handleSaveManual() {
    setSaving(true);
    setMsg('');
    try {
      const res = await globalThis.fetch('/api/flow/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: emailInput.trim(),
          credits: parseInt(creditsInput, 10),
        }),
      });
      if (!res.ok) throw new Error('Failed to update credentials');
      onUpdated();
      setMsg('Account info updated successfully!');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-gray-900 p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/20 text-purple-300">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-white">Google Flow Account & Credits</h3>
              <p className="text-[11px] text-gray-400">Switch account or sync credit balance</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Current status card */}
        <div className="rounded-xl border border-purple-500/20 bg-purple-950/30 p-3.5 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Active Google Account:</span>
            <span className="font-semibold text-purple-200">{credits?.account || 'zrajchauhan3@gmail.com'}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Current Balance:</span>
            <span className="font-semibold text-emerald-300">{credits?.credits ?? 0} Credits (~{credits?.videosRemaining ?? 0} videos)</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Tier:</span>
            <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-bold text-purple-300 border border-purple-500/30">
              {credits?.tier || 'PRO'}
            </span>
          </div>
        </div>

        {/* Method 1: Launch headed browser */}
        <div className="space-y-2 rounded-xl border border-white/5 bg-black/20 p-3.5">
          <h4 className="text-xs font-semibold text-white">1. Switch Account in Browser</h4>
          <p className="text-[11px] text-gray-400">
            Opens Microsoft Edge / Chrome. Sign into another Google account with Flow credits, then close the window.
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={launching}
              onClick={() => void handleLaunchLogin(false)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-50 transition shadow-lg shadow-purple-900/30"
            >
              {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Open Browser (Current Profile)
            </button>
            <button
              type="button"
              disabled={launching}
              onClick={() => void handleLaunchLogin(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-800 border border-purple-500/30 px-3 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-950/40 disabled:opacity-50 transition"
              title="Clears stored browser cookies for Google Flow so you can sign in to a different account freshly"
            >
              {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Switch Account (Fresh Clean Sign-in)
            </button>
          </div>
        </div>

        {/* Method 2: Manual email / balance update */}
        <div className="space-y-2 rounded-xl border border-white/5 bg-black/20 p-3.5">
          <h4 className="text-xs font-semibold text-white">2. Quick Account Info & Balance Sync</h4>
          <div className="space-y-2">
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Google Email / Account Label</label>
              <input
                type="text"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="e.g. yourname@gmail.com"
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Current Credits Balance</label>
              <input
                type="number"
                value={creditsInput}
                onChange={(e) => setCreditsInput(e.target.value)}
                placeholder="e.g. 800"
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveManual()}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15 disabled:opacity-50 transition"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Save & Sync Info
            </button>
          </div>
        </div>

        {msg && (
          <p className="text-center text-xs text-purple-300 bg-purple-500/10 rounded-lg p-2 border border-purple-500/20 leading-relaxed">
            {msg}
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}

function FlowVideoButton({ scriptId, sceneIndex, prompt, duration, aspect, defaultResolution = '720p', disabled, hasReference, onEnsureReference, onImported, onError, onNotice }: {
  scriptId: string; sceneIndex: number; prompt: string; duration: number; aspect: 'portrait' | 'landscape';
  defaultResolution?: '720p' | '1080p';
  disabled: boolean;
  hasReference?: boolean;
  onEnsureReference?: () => Promise<void>;
  onImported: (blob: Blob) => Promise<void>; onError: (message: string) => void; onNotice: (message: string) => void;
}) {
  const [job, setJob] = useState<FlowJobState | null>(null);
  const [busy, setBusy] = useState(false);
  const [credits, setCredits] = useState<FlowCreditsState | null>(null);
  const [resolution, setResolution] = useState<'720p' | '1080p'>(defaultResolution);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setResolution(defaultResolution);
  }, [defaultResolution]);

  const loadCredits = useCallback(async () => {
    try {
      const res = await globalThis.fetch('/api/flow/credits');
      if (res.ok) {
        const data = await res.json() as FlowCreditsState;
        if (typeof data.credits === 'number') setCredits(data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    void loadCredits();
  }, [loadCredits]);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  async function poll(id: string): Promise<FlowJobState> {
    const res = await globalThis.fetch(`/api/flow/jobs/${id}`);
    const data = await res.json() as FlowJobState & { error?: string };
    if (!res.ok) throw new Error((data as { error?: string }).error || 'Flow job lookup failed.');
    return data;
  }

  async function start() {
    if (busy) return;
    setBusy(true);
    onError('');
    try {
      if (onEnsureReference) {
        onNotice('Ensuring 2D reference frame is generated…');
        try {
          await onEnsureReference();
        } catch (refErr) {
          console.warn('Reference generation error:', refErr);
        }
      }
      onNotice('Validating Flow prompt (0 credits)…');
      const res = await globalThis.fetch('/api/flow/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId, sceneIndex, prompt, model: 'veo-3.1-fast', aspect, duration, resolution, dryRun: false }),
      });
      const data = await res.json() as FlowJobState & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Flow job failed to start.');
      setJob(data);
      if (data.state === 'done' && data.result) {
        await finishImport(data);
        return;
      }
      onNotice(data.stage || 'Flow job queued…');
      timer.current = setInterval(async () => {
        try {
          const current = await poll(data.id);
          setJob(current);
          if (current.state === 'queued' || current.state === 'running') {
            onNotice(`${current.stage} (${current.progress}%)`);
            return;
          }
          if (timer.current) clearInterval(timer.current);
          setBusy(false);
          if (current.state === 'done' && current.result) {
            await finishImport(current);
          } else if (current.state !== 'cancelled') {
            onError(current.error || 'Flow generation failed. See job log.');
          }
        } catch (err) {
          if (timer.current) clearInterval(timer.current);
          setBusy(false);
          onError(err instanceof Error ? err.message : 'Flow poll failed.');
        }
      }, 3000);
    } catch (err) {
      setBusy(false);
      onError(err instanceof Error ? err.message : 'Flow job failed to start.');
    }
  }

  async function finishImport(current: FlowJobState) {
    if (!current.result) return;
    onNotice('Downloading Flow render…');
    const dl = await globalThis.fetch(`/api/flow/downloads/${current.result.downloadId}`);
    if (!dl.ok) throw new Error('Flow download missing. The job must be done first.');
    await onImported(new Blob([await dl.blob()], { type: 'video/mp4' }));
    void loadCredits();
    onNotice(`Scene ${sceneIndex + 1}: Flow video imported (${Math.round(current.result.bytes / 1024)} KB).`);
  }

  async function cancel() {
    if (!job || busy === false) return;
    try {
      await globalThis.fetch(`/api/flow/jobs/${job.id}/cancel`, { method: 'POST' });
      if (timer.current) clearInterval(timer.current);
      setBusy(false);
      setJob(null);
      onNotice('Flow job cancelled.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Cancel failed.');
    }
  }

  const running = busy && job && (job.state === 'queued' || job.state === 'running');
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1 rounded bg-indigo-500/20 px-2 py-1 text-[11px] font-semibold text-indigo-200 border border-indigo-500/30"
          title={aspect === 'portrait' ? 'Renders in 9:16 vertical portrait for Shorts' : 'Renders in 16:9 horizontal landscape for YouTube'}
        >
          {aspect === 'portrait' ? '📱 9:16 Shorts' : '🖥️ 16:9 Landscape'}
        </span>

        <div className="inline-flex rounded-lg bg-black/40 p-0.5 border border-white/10 text-xs">
          <button
            type="button"
            className={`rounded px-2 py-0.5 font-medium transition ${resolution === '720p' ? 'bg-indigo-600/50 text-indigo-100 shadow-sm' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setResolution('720p')}
            title="Fast native 720p MP4 download (~50s)"
          >
            720p Fast
          </button>
          <button
            type="button"
            className={`rounded px-2 py-0.5 font-medium transition ${resolution === '1080p' ? 'bg-purple-600/50 text-purple-100 shadow-sm' : 'text-gray-400 hover:text-white'}`}
            onClick={() => setResolution('1080p')}
            title="Flow AI Upscaled 1080p Full HD (~2 min)"
          >
            1080p Upscaled
          </button>
        </div>

        {!running ? (
          <button type="button" disabled={disabled || busy || credits?.status === 'exhausted'} onClick={() => void start()}
            className="flex items-center gap-1.5 rounded bg-purple-500/25 px-2.5 py-1.5 text-xs font-semibold text-purple-100 hover:bg-purple-500/35 disabled:opacity-40"
            title={hasReference ? "Generate video with Google Flow (using 2D image reference frame)" : "Generate video with Google Flow"}>
            <Sparkles className="h-3.5 w-3.5 text-purple-300" /> Generate with Flow
          </button>
        ) : (
          <>
            <span role="status" className="flex items-center gap-1.5 text-xs text-purple-200">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {job?.stage} ({job?.progress}%)
            </span>
            <button type="button" onClick={() => void cancel()} className="rounded border border-red-400/40 px-2 py-1 text-xs text-red-200 hover:bg-red-500/15">Cancel</button>
          </>
        )}
      </div>

      {credits?.status === 'exhausted' && (
        <p className="text-[11px] text-red-400 font-medium">❌ Out of credits. Top up in Google Flow or switch accounts above.</p>
      )}

      {job?.state === 'error' && job.error && (
        <span role="alert" className="block text-[11px] leading-relaxed text-red-300">{job.overseerCode ? `[${job.overseerCode}] ` : ''}{job.error}</span>
      )}
    </div>
  );
}

export function MixedMediaContent({ script, onUpdate }: { script: Script | null; onUpdate: (patch: Partial<Script>) => unknown }) {
  const { fetch, profile, account } = useWorkspaceApi();
  const channelLora = getChannelLoraProfile(account);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [generating, setGenerating] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [activeRefIndex, setActiveRefIndex] = useState<number | null>(null);
  const [activeVideoIndex, setActiveVideoIndex] = useState<number | null>(null);
  const [generatingVideos, setGeneratingVideos] = useState(false);
  const activeFlowJobId = useRef<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [preset, setPreset] = useState<'fast' | 'standard' | 'high'>('standard');
  const [imageProvider, setImageProvider] = useState<ImageProviderMode>('local');
  const [cloudflareModelLabel, setCloudflareModelLabel] = useState<string>('FLUX.1 Schnell (12B)');
  const [autoStyleDna, setAutoStyleDna] = useState(true);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [flowCredits, setFlowCredits] = useState<FlowCreditsState | null>(null);
  const [flowResolution, setFlowResolution] = useState<'720p' | '1080p'>('720p');

  const loadFlowCredits = useCallback(async () => {
    try {
      const res = await globalThis.fetch('/api/flow/credits');
      if (res.ok) {
        const data = await res.json() as FlowCreditsState;
        if (typeof data.credits === 'number') setFlowCredits(data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    void loadFlowCredits();
  }, [loadFlowCredits]);

  const [modelStatus, setModelStatus] = useState<'checking' | 'online' | 'offline' | 'starting' | 'stopping'>('checking');
  const [modelDetail, setModelDetail] = useState('');
  const operation = useRef(false);
  const stopRequested = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stopRequested.current = true; };
  }, []);
  const fileInput = useRef<HTMLInputElement>(null);
  const selectedIndex = useRef<number | null>(null);
  const scenes = mediaScenes(script);
  const imageCount = scenes.filter(scene => scene.mediaType === 'image').length;
  const videoCount = scenes.filter(scene => scene.mediaType === 'video').length;
  const locked = busy || generating;
  const missingImages = scenes.flatMap((scene, index) => !script?.generatedImages?.some(asset =>
    asset.index === index && asset.prompt === scene.imagePrompt && (asset.mediaType || 'image') === 'image' && asset.status === 'done' && asset.url
  ) && !script?.referenceFrames?.[index]?.url ? [index] : []);
  const missingVideos = scenes.flatMap((scene, index) => scene.mediaType === 'video' && !script?.generatedImages?.some(asset =>
    asset.index === index && asset.prompt === scene.imagePrompt && (asset.mediaType || 'image') === 'video' && asset.status === 'done' && asset.url
  ) ? [index] : []);
  const videoSceneIndices = scenes.flatMap((scene, index) => scene.mediaType === 'video' ? [index] : []);

  const imageProviderRef = useRef<ImageProviderMode>('local');
  imageProviderRef.current = imageProvider;

  async function refreshModelStatus(providerOverride?: ImageProviderMode) {
    const provider = providerOverride ?? imageProviderRef.current;
    setModelStatus('checking');
    try {
      const response = await fetch(`/api/generate/status?provider=${provider}`);
      const result = await response.json();
      setModelStatus(result.online ? 'online' : 'offline');
      setModelDetail(result.detail || '');
      return Boolean(result.online);
    } catch (err) {
      setModelStatus('offline');
      setModelDetail(err instanceof Error ? err.message : 'Could not reach the image model service.');
      return false;
    }
  }

  async function startModel(providerOverride?: ImageProviderMode): Promise<boolean> {
    const provider = providerOverride ?? imageProviderRef.current;
    if (locked || modelStatus === 'starting') return false;
    if (provider === 'cloudflare' || provider === 'google') {
      // Cloudflare and Google Cloud need no local startup — just re-check API readiness.
      const online = await refreshModelStatus(provider);
      return online;
    }
    setModelStatus('starting'); setModelDetail('Starting the local image model…'); setError('');
    try {
      const response = await fetch('/api/generate/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'local' }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not start the image model.');
      setModelStatus('online'); setModelDetail(result.message || 'Image model is ready.');
      return true;
    } catch (err) {
      setModelStatus('offline');
      setModelDetail(err instanceof Error ? err.message : 'Could not start the image model.');
      return false;
    }
  }

  function cloudflareNotReadyMessage(): string {
    return modelDetail || 'Cloudflare API is not ready. Open "Configure Cloudflare APIs" above, add at least one Worker URL + Key or Account ID + Token, then press "Test all APIs".';
  }

  async function stopModel() {
    if (modelStatus === 'stopping') return;
    stopRequested.current = true;
    setModelStatus('stopping');
    setModelDetail('Stopping the local image model…');
    setError('');
    try {
      if (script && activeIndex !== null) {
        await fetch('/api/generate/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scriptId: script.id, index: activeIndex }),
        }).catch(() => {});
      }
      const response = await fetch('/api/generate/stop', { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not stop the image model.');
      setModelStatus('offline');
      setModelDetail(result.message || 'Image model is stopped.');
      setNotice('Image model stopped successfully.');
    } catch (err) {
      const isOnline = await refreshModelStatus();
      if (!isOnline) {
        setModelStatus('offline');
        setModelDetail('Image model is stopped.');
      } else {
        setModelDetail(err instanceof Error ? err.message : 'Could not stop the image model.');
      }
    } finally {
      if (mounted.current) {
        setGenerating(false);
        setActiveIndex(null);
        setActiveRefIndex(null);
        setStopping(false);
      }
    }
  }

  useEffect(() => { void refreshModelStatus(); }, []);

  async function generateImages(indices: number[]) {
    if (!script || operation.current || !indices.length) return;
    // Generate images for all scenes in queue (including video placeholders as reference frames)
    const queue = indices.filter(index => Boolean(scenes[index]));
    if (!queue.length) return;
    operation.current = true; stopRequested.current = false;
    setGenerating(true); setStopping(false); setError(''); setNotice('Checking image model…');
    try {
      const online = await refreshModelStatus();
      if (!online && !stopRequested.current) {
        if (imageProviderRef.current === 'google') {
          throw new Error('Google Cloud is offline or unconfigured. Verify GEMINI_API_KEY in server/.env.');
        }
        if (imageProviderRef.current === 'cloudflare') {
          throw new Error(cloudflareNotReadyMessage());
        }
        setNotice('Starting image model…');
        const started = await startModel();
        if (!started) throw new Error('The image model could not be started. Check the model status message above.');
        await refreshModelStatus();
      }
      let completed = 0;
      for (const index of queue) {
        if (stopRequested.current) break;
        const activeEngineLabel = imageProvider === 'google' ? 'Google Cloud · Gemini Image' : imageProvider === 'cloudflare' ? `Cloudflare · ${cloudflareModelLabel}` : channelLora.loraTitle;
        setActiveIndex(index); setNotice(`Generating image ${completed + 1} of ${queue.length} · scene ${index + 1} (${activeEngineLabel})…`);
        const response = await fetch('/api/generate/image', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scriptId: script.id, index, prompt: scenes[index].imagePrompt, preset, provider: imageProvider }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(`Scene ${index + 1}: ${result.error || 'Image generation failed.'}`);
        // Each result is saved by the server, even when this page is closed.
        if (!mounted.current) return;
        await onUpdate({
          generatedImages: result.generatedImages,
          ...(result.referenceFrames ? { referenceFrames: result.referenceFrames } : {}),
          timelineConfig: undefined,
          youtubeExport: undefined,
          facebookExport: undefined,
          instagramExport: undefined,
        });
        completed++;
      }
      if (mounted.current) setNotice(`${stopRequested.current ? 'Stopped. ' : ''}Saved ${completed} of ${queue.length} images (${channelLora.channelLabel} LoRA). Existing media was kept.`);
    } catch (err) {
      if (mounted.current) { setNotice(''); setError(err instanceof Error ? err.message : 'Image generation failed.'); }
    } finally {
      operation.current = false;
      if (mounted.current) { setGenerating(false); setActiveIndex(null); setStopping(false); }
    }
  }

  async function generateReferenceFrames(indices: number[]) {
    if (!script || operation.current || !indices.length) return;
    const queue = indices.filter(index => Boolean(scenes[index]));
    if (!queue.length) return;
    operation.current = true; stopRequested.current = false;
    setGenerating(true); setStopping(false); setError(''); setNotice('Checking image model for LoRA reference frame…');
    try {
      const online = await refreshModelStatus();
      if (!online && !stopRequested.current) {
        if (imageProviderRef.current === 'google') {
          throw new Error('Google Cloud is offline or unconfigured. Verify GEMINI_API_KEY in server/.env.');
        }
        if (imageProviderRef.current === 'cloudflare') {
          throw new Error(cloudflareNotReadyMessage());
        }
        setNotice('Starting image model…');
        const started = await startModel();
        if (!started) throw new Error('The image model could not be started. Check the model status message above.');
        await refreshModelStatus();
      }
      let completed = 0;
      for (const index of queue) {
        if (stopRequested.current) break;
        setActiveRefIndex(index);
        setNotice(`Generating LoRA reference frame ${completed + 1} of ${queue.length} · scene ${index + 1} (${channelLora.loraTitle})…`);
        const response = await fetch('/api/generate/reference-frame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scriptId: script.id, index, prompt: scenes[index].imagePrompt, preset, provider: imageProviderRef.current }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(`Scene ${index + 1}: ${result.error || 'Reference frame generation failed.'}`);
        if (!mounted.current) return;
        await onUpdate({ referenceFrames: result.referenceFrames });
        completed++;
      }
      if (mounted.current) {
        setNotice(`${stopRequested.current ? 'Stopped. ' : ''}Generated ${completed} LoRA reference frame${completed === 1 ? '' : 's'} for Google Studio Image-to-Video.`);
      }
    } catch (err) {
      if (mounted.current) { setNotice(''); setError(err instanceof Error ? err.message : 'Reference frame generation failed.'); }
    } finally {
      operation.current = false;
      if (mounted.current) { setGenerating(false); setActiveRefIndex(null); setStopping(false); }
    }
  }

  async function importOne(file: File, index: number, extension: string) {
    if (!script) throw new Error('No script selected.');
    const response = await fetch(`/api/media-import/${script.id}/${index}?extension=${extension}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
    const data = await response.json();
    if (!response.ok) throw new Error(`${file.name}: ${data.error || 'Import failed'}`);
    // Server has already saved the imported asset; sync the visible script.
    await onUpdate({ generatedImages: data.generatedImages, timelineConfig: undefined, youtubeExport: undefined, facebookExport: undefined, instagramExport: undefined });
  }

  async function importFlowBlob(blob: Blob, index: number) {
    const file = new File([blob], `${String(index + 1).padStart(3, '0')}_flow.mp4`, { type: 'video/mp4' });
    await importOne(file, index, 'mp4');
  }

  async function generateAllFlowVideos(indices: number[]) {
    if (!script || operation.current || !indices.length) return;
    const queue = indices.filter(index => Boolean(scenes[index]));
    if (!queue.length) return;

    if (flowCredits && flowCredits.credits < 12) {
      setError('Insufficient Google Flow credits. Please top up or switch accounts.');
      return;
    }

    operation.current = true;
    stopRequested.current = false;
    setGenerating(true);
    setGeneratingVideos(true);
    setStopping(false);
    setError('');
    setNotice(`Starting batch Flow video generation for ${queue.length} scene(s) at ${flowResolution}…`);

    let completed = 0;
    try {
      // Check if any scene in queue needs a reference image and ensure model is ready
      const anyNeedsRef = queue.some(idx => {
        const sc = scenes[idx];
        const hasImg = script.generatedImages?.some(asset =>
          asset.index === idx && asset.prompt === sc.imagePrompt && (asset.mediaType || 'image') === 'image' && asset.status === 'done' && asset.url
        );
        const hasRef = Boolean(script.referenceFrames?.[idx]?.url);
        return !hasImg && !hasRef;
      });

      if (anyNeedsRef && !stopRequested.current) {
        const online = await refreshModelStatus();
        if (!online && !stopRequested.current) {
          if (imageProviderRef.current === 'google') {
            throw new Error('Google Cloud is offline or unconfigured. Verify GEMINI_API_KEY in server/.env.');
          }
          if (imageProviderRef.current === 'cloudflare') {
            throw new Error(cloudflareNotReadyMessage());
          }
          setNotice('Starting image model to prepare reference frames…');
          const started = await startModel();
          if (!started) throw new Error('The image model could not be started for reference frames.');
          await refreshModelStatus();
        }
      }

      for (const index of queue) {
        if (stopRequested.current) break;
        const scene = scenes[index];
        setActiveVideoIndex(index);

        if (scene.mediaType !== 'video') {
          await toggleMediaType(index, 'video');
        }

        // Ensure this scene has a 2D reference image generated first
        const hasExistingImg = script.generatedImages?.some(asset =>
          asset.index === index && asset.prompt === scene.imagePrompt && (asset.mediaType || 'image') === 'image' && asset.status === 'done' && asset.url
        );
        const hasExistingRef = Boolean(script.referenceFrames?.[index]?.url);

        if (!hasExistingImg && !hasExistingRef && !stopRequested.current) {
          setNotice(`Generating 2D cartoon reference frame for Scene ${index + 1}…`);
          try {
            const imgRes = await fetch('/api/generate/image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ scriptId: script.id, index, prompt: scene.imagePrompt, preset, provider: imageProviderRef.current }),
            });
            const imgData = await imgRes.json();
            if (imgRes.ok && imgData.generatedImages) {
              await onUpdate({
                generatedImages: imgData.generatedImages,
                ...(imgData.referenceFrames ? { referenceFrames: imgData.referenceFrames } : {}),
              });
            }
          } catch (imgErr) {
            console.warn(`Could not pre-generate reference image for scene ${index + 1}:`, imgErr);
          }
        }

        const audio = script.generatedAudio?.find(item => item.sync?.timingMode === 'narration');
        const timing = audio?.sync?.scenes.find(item => item.sceneId === scene.id);
        const spokenSeconds = timing && audio?.sync ? (timing.endSample - timing.startSample) / audio.sync.sampleRate : undefined;
        const duration = spokenSeconds !== undefined ? Math.min(10, Math.max(4, Math.round(spokenSeconds))) : 8;
        const styleDnaPrompt = formatPromptWithChannelStyleDna(scene.imagePrompt, account);
        const prompt = scene.videoPrompt || styleDnaPrompt;
        const aspect = profile === 'shorts' ? 'portrait' : 'landscape';

        setNotice(`Generating video ${completed + 1} of ${queue.length} · Scene ${index + 1} (${flowResolution}) (Submitting to Flow)…`);

        const res = await globalThis.fetch('/api/flow/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scriptId: script.id,
            sceneIndex: index,
            prompt,
            model: 'veo-3.1-fast',
            aspect,
            duration,
            resolution: flowResolution,
            dryRun: false,
          }),
        });

        const data = await res.json() as FlowJobState & { error?: string };
        if (!res.ok) throw new Error(`Scene ${index + 1}: ${data.error || 'Failed to start Flow job.'}`);

        activeFlowJobId.current = data.id;

        // Poll job until done
        let jobResult: FlowJobState = data;
        while (jobResult.state === 'queued' || jobResult.state === 'running') {
          if (stopRequested.current) {
            await globalThis.fetch(`/api/flow/jobs/${jobResult.id}/cancel`, { method: 'POST' }).catch(() => {});
            break;
          }
          await new Promise(r => setTimeout(r, 3000));
          const pollRes = await globalThis.fetch(`/api/flow/jobs/${jobResult.id}`);
          if (pollRes.ok) {
            jobResult = await pollRes.json();
            setNotice(`Generating video ${completed + 1} of ${queue.length} · Scene ${index + 1} (${flowResolution}) · ${jobResult.stage} (${jobResult.progress}%)`);
          }
        }

        if (stopRequested.current) break;

        if (jobResult.state === 'done' && jobResult.result) {
          setNotice(`Downloading ${flowResolution} Flow video for Scene ${index + 1}…`);
          const dl = await globalThis.fetch(`/api/flow/downloads/${jobResult.result.downloadId}`);
          if (dl.ok) {
            const blob = await dl.blob();
            await importFlowBlob(blob, index);
            completed++;
            void loadFlowCredits();
          }
        } else if (jobResult.state === 'error') {
          throw new Error(`Scene ${index + 1}: ${jobResult.error || 'Flow generation failed.'}`);
        }
      }

      if (mounted.current) {
        setNotice(
          stopRequested.current
            ? `Stopped. Generated ${completed} of ${queue.length} video(s).`
            : `Successfully generated and imported all ${completed} Flow video(s) at ${flowResolution}!`
        );
      }
    } catch (err) {
      if (mounted.current) {
        setNotice('');
        setError(err instanceof Error ? err.message : 'Batch Flow video generation failed.');
      }
    } finally {
      operation.current = false;
      activeFlowJobId.current = null;
      if (mounted.current) {
        setGenerating(false);
        setGeneratingVideos(false);
        setActiveVideoIndex(null);
        setStopping(false);
      }
    }
  }

  async function toggleMediaType(index: number, newType: 'image' | 'video') {
    if (!script) return;
    const currentScenes = script.scenePlan?.scenes || scenes;
    const updated = currentScenes.map((s, i) => (i === index ? { ...s, mediaType: newType } : s));
    const fallbackPlan = {
      version: 1 as const,
      title: script.name || 'Script',
      thumbnailPrompt: '',
      scenes: [],
    };
    const updatedScenePlan = {
      ...(script.scenePlan || fallbackPlan),
      scenes: updated,
    };
    await onUpdate({ scenePlan: updatedScenePlan });
  }

  async function setAllMediaTypes(newType: 'image' | 'video') {
    if (!script || !scenes.length) return;
    const currentScenes = script.scenePlan?.scenes || scenes;
    const updated = currentScenes.map(s => ({ ...s, mediaType: newType }));
    const fallbackPlan = {
      version: 1 as const,
      title: script.name || 'Script',
      thumbnailPrompt: '',
      scenes: [],
    };
    const updatedScenePlan = {
      ...(script.scenePlan || fallbackPlan),
      scenes: updated,
    };
    await onUpdate({ scenePlan: updatedScenePlan });
    setNotice(`All ${updated.length} scenes converted to ${newType === 'video' ? 'Video' : 'Image'}.`);
  }

  async function upload(files: FileList | null) {
    if (!script || !files?.length || operation.current) return;
    operation.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      const entries = Array.from(files).map(file => {
        const match = file.name.match(/^(\d+)(?:[._ -]|$)/);
        const index = selectedIndex.current ?? (match ? Number(match[1]) - 1 : -1);
        if (!scenes[index]) throw new Error(`Cannot match ${file.name}. Use scene numbers such as 001.png or 002.mp4.`);
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (!(scenes[index].mediaType === 'video' ? ['mp4'] : ['png', 'jpg', 'jpeg', 'webp']).includes(extension || '')) throw new Error(`${file.name}: wrong file type for scene ${index + 1}.`);
        if (file.size > 250 * 1024 * 1024) throw new Error(`${file.name} exceeds 250 MB.`);
        return { file, index, extension };
      });
      if (new Set(entries.map(entry => entry.index)).size !== entries.length) throw new Error('Choose only one file per scene.');
      let completed = 0;
      for (const { file, index, extension } of entries) {
        await importOne(file, index, extension!);
        completed++;
        setNotice(`Saved ${completed} of ${entries.length} imports.`);
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Import failed.'); }
    finally { operation.current = false; setBusy(false); if (fileInput.current) fileInput.current.value = ''; }
  }

  return <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Scene media</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400">
            {imageCount} images / {videoCount} videos · {scenes.length - missingImages.length - missingVideos.length} of {scenes.length} ready{scenes.length ? ` (${Math.round((scenes.length - missingImages.length - missingVideos.length) / scenes.length * 100)}%)` : ''}
          </span>
          <span className="text-gray-600">·</span>
          <button
            type="button"
            disabled={locked}
            onClick={() => void setAllMediaTypes('video')}
            className="text-[11px] font-medium text-purple-400 hover:text-purple-300 underline underline-offset-2 disabled:opacity-40"
            title="Convert all scenes to video"
          >
            Set all to Video
          </button>
          <span className="text-gray-600">·</span>
          <button
            type="button"
            disabled={locked}
            onClick={() => void setAllMediaTypes('image')}
            className="text-[11px] font-medium text-blue-400 hover:text-blue-300 underline underline-offset-2 disabled:opacity-40"
            title="Convert all scenes to image"
          >
            Set all to Image
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {generating ? <button disabled={stopping} onClick={() => { stopRequested.current = true; setStopping(true); }} className="studio-btn-ghost text-red-300 hover:text-red-200"><Square className="h-4 w-4 mr-1 text-red-400" />{stopping ? 'Stopping after current job...' : 'Stop batch generation'}</button> : <>
          {scenes.length > 0 && (
            <button
              disabled={locked || !missingImages.length || (modelStatus === 'starting' || modelStatus === 'stopping')}
              onClick={() => void generateImages(missingImages.length ? missingImages : scenes.map((_, i) => i))}
              className="studio-btn-primary"
              title="Generate 2D cartoon images for all scenes (used directly for image scenes and as reference frames for video scenes)"
            >
              <Sparkles className="h-4 w-4" />
              Generate images / reference frames{missingImages.length ? ` (${missingImages.length})` : ''}
            </button>
          )}
          {scenes.length > 0 && (
            <div className="flex items-center rounded-lg border border-purple-500/40 bg-purple-600/25 p-0.5 shadow-sm">
              <button
                disabled={Boolean(locked || flowCredits?.status === 'exhausted')}
                onClick={() => {
                  const targets = videoCount > 0
                    ? (missingVideos.length ? missingVideos : videoSceneIndices)
                    : scenes.map((_, i) => i);
                  void generateAllFlowVideos(targets);
                }}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-purple-100 hover:bg-purple-600/40 disabled:opacity-40 transition"
                title={`Generate all ${videoCount > 0 ? (missingVideos.length || videoCount) : scenes.length} video scenes using Google Flow Veo 3.1 at ${flowResolution === '1080p' ? '1080p Upscaled' : '720p Fast'}`}
              >
                <Film className="h-4 w-4 text-purple-300" />
                <span>Generate all videos with Flow ({videoCount > 0 ? (missingVideos.length || videoCount) : scenes.length})</span>
              </button>
              <div className="flex items-center ml-1 border-l border-purple-400/30 pl-1 pr-0.5">
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => setFlowResolution('720p')}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition ${flowResolution === '720p' ? 'bg-purple-600 text-white font-bold shadow-sm' : 'text-purple-300 hover:text-white'}`}
                  title="Fast native 720p MP4 download (~50s)"
                >
                  720p
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => setFlowResolution('1080p')}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition ${flowResolution === '1080p' ? 'bg-purple-600 text-white font-bold shadow-sm' : 'text-purple-300 hover:text-white'}`}
                  title="Flow AI Upscaled 1080p Full HD (~2 min)"
                >
                  1080p
                </button>
              </div>
            </div>
          )}
        </>}
        <button disabled={locked || !scenes.length} className="studio-btn-ghost" onClick={() => { selectedIndex.current = null; if (fileInput.current) { fileInput.current.multiple = true; fileInput.current.accept = videoCount > 0 ? '.png,.jpg,.jpeg,.webp,.mp4' : '.png,.jpg,.jpeg,.webp'; fileInput.current.click(); } }}>Import media</button>
      </div>
    </div>

    {/* Google Flow Account & Credits Bar */}
    <div className="mb-5 rounded-xl border border-purple-500/25 bg-gradient-to-r from-purple-950/40 via-purple-900/20 to-black/40 p-3.5 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30">
            <Film className="h-4.5 w-4.5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-white">Google Flow AI Video</span>
              <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-bold text-purple-300 border border-purple-500/30">
                {flowCredits?.tier || 'PRO'}
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-black/50 px-2 py-0.5 text-xs text-purple-200 border border-white/10 font-medium">
                <User className="h-3 w-3 text-purple-300" />
                {flowCredits?.account || 'zrajchauhan3@gmail.com'}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-gray-400">
              Live Balance: <strong className="text-emerald-400 font-semibold">{flowCredits?.credits ?? 788} Credits</strong> (~{flowCredits?.videosRemaining ?? 65} videos remaining · ~12 credits/video) · Quality: <strong className="text-purple-300">{flowResolution === '1080p' ? '1080p Upscaled' : '720p Fast'}</strong>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadFlowCredits()}
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-white/5 transition"
            title="Refresh Flow credit balance"
          >
            <RefreshCw className="h-3 w-3" />
            Sync
          </button>
          <button
            type="button"
            onClick={() => setShowAccountModal(true)}
            className="flex items-center gap-1.5 rounded-lg border border-purple-400/40 bg-purple-500/20 px-3 py-1.5 text-xs font-semibold text-purple-100 hover:bg-purple-500/30 transition shadow-sm"
            title="Switch Google Account or update credits"
          >
            <RefreshCw className="h-3.5 w-3.5 text-purple-300" />
            Switch Account
          </button>
        </div>
      </div>
    </div>

    <CloudflareImagePanel
      disabled={locked}
      onConfigChange={(cfg) => {
        setImageProvider(cfg.provider);
        imageProviderRef.current = cfg.provider;
        setCloudflareModelLabel(cfg.provider === 'google' ? (cfg.googleModelLabel || 'Gemini 2.5 Flash Image') : cfg.modelLabel);
        void refreshModelStatus(cfg.provider);
      }}
    />
    <GenerationDisclosure title="Media settings" hint={imageProvider === 'google' ? `Images: Google Cloud (${cloudflareModelLabel}) / Videos: import MP4` : imageProvider === 'cloudflare' ? `Images: Cloudflare (${cloudflareModelLabel}) / Videos: import MP4` : "Images: local model / Videos: import MP4"} className="mb-5">
      <div className="flex flex-wrap items-center gap-4">
        <label className="text-xs text-gray-400">Quality <select aria-label="Image quality" value={preset} disabled={locked} onChange={event => setPreset(event.target.value as typeof preset)} className="ml-2 rounded-lg border border-border bg-bg px-3 py-2 text-white"><option value="fast">Fast</option><option value="standard">Standard</option><option value="high">High</option></select></label>
        <span role="status" className="text-xs text-gray-400">
          {imageProvider === 'google' ? `Google Cloud: ${modelStatus}` : imageProvider === 'cloudflare' ? `Cloudflare API: ${modelStatus}` : `Image model: ${modelStatus}`}
        </span>
        {imageProvider === 'google' ? (
          <span className="text-[11px] text-blue-300">Google Cloud active — images render via GEMINI_API_KEY ($300 credit).</span>
        ) : imageProvider === 'cloudflare' ? (
          <span className="text-[11px] text-gray-500">No local model needed — images render on Cloudflare Workers AI.</span>
        ) : modelStatus === 'online' || modelStatus === 'stopping' ? (
          <button
            disabled={modelStatus === 'stopping'}
            onClick={() => void stopModel()}
            className="studio-btn-ghost text-red-300 hover:text-red-200"
            title="Stop the local ComfyUI image model process and release GPU memory"
          >
            <Square className="h-3.5 w-3.5 mr-1" />
            {modelStatus === 'stopping' ? 'Stopping model...' : 'Stop model'}
          </button>
        ) : (
          <button
            disabled={locked || modelStatus !== 'offline'}
            onClick={() => void startModel()}
            className="studio-btn-ghost"
          >
            {modelStatus === 'starting' ? 'Starting model...' : 'Start model'}
          </button>
        )}
        <button disabled={locked || modelStatus === 'checking' || modelStatus === 'starting' || modelStatus === 'stopping'} onClick={() => void refreshModelStatus()} className="studio-btn-ghost">Refresh</button>
      </div>
      <div className="mt-4 rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-semibold text-white">Channel-Isolated LoRA ({channelLora.channelLabel}): </span>
            <span className="text-accent">{channelLora.loraTitle}</span>
            <span className="ml-2 text-gray-400">({channelLora.loraFileName} · weight {channelLora.strengthModel})</span>
          </div>
          <label className="flex items-center gap-1.5 text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={autoStyleDna}
              onChange={(e) => setAutoStyleDna(e.target.checked)}
              className="rounded border-border bg-bg text-accent"
            />
            <span>Auto-inject Style-DNA for Google Studio video prompts</span>
          </label>
        </div>
        <p className="mt-1.5 text-[11px] text-gray-400">
          <span className="font-medium text-gray-300">Style-DNA:</span> {channelLora.styleDna}
        </p>
      </div>
      <div className="mt-4 space-y-3">
        {profile === 'shorts' && !script?.scenePlan && <p className="text-xs text-gray-400">For video scenes, run the Shorts - Images & Videos script and extract its scene prompts.</p>}
        <p className="text-xs leading-relaxed text-gray-400">Image generation fills missing image scenes and keeps completed media. Create video clips externally using their scene prompts, then import the MP4 files. Videos follow narration timing and their audio is muted in the final edit.</p>
        <p className="text-xs text-gray-400">Import filenames: 001.png, 002.mp4, 003.png. Files are copied into this project. Maximum 250 MB per file.</p>
      </div>
    </GenerationDisclosure>
    {modelDetail && modelStatus !== 'online' && <p role="status" className="mb-3 text-xs text-amber-200">{modelDetail}</p>}
    <input ref={fileInput} type="file" className="hidden" onChange={event => void upload(event.target.files)} />
    {error && <p role="alert" className="mb-4 text-sm text-red-300">{error}</p>}
    {notice && <p role="status" className="mb-4 text-sm text-emerald-300">{notice}</p>}
    {busy && <p role="status" className="mb-4 flex gap-2 text-sm text-gray-300"><Loader2 className="h-4 w-4 animate-spin" />Importing and checking media…</p>}
    {!scenes.length && <p className="text-gray-400">Run a script, preview it and extract its scenes first.</p>}
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {scenes.map((scene, index) => {
        const type = scene.mediaType || 'image';
        const audio = script?.generatedAudio?.find(item => item.sync?.timingMode === 'narration');
        const timing = audio?.sync?.scenes.find(item => item.sceneId === scene.id);
        const spokenSeconds = timing && audio?.sync ? (timing.endSample - timing.startSample) / audio.sync.sampleRate : undefined;
        const asset = script?.generatedImages?.find(item => item.index === index && item.prompt === scene.imagePrompt && (item.mediaType || 'image') === type && item.status === 'done');
        const refFrame = script?.referenceFrames?.[index];
        const stillImage = script?.generatedImages?.find(item => item.index === index && item.prompt === scene.imagePrompt && (item.mediaType || 'image') === 'image' && item.status === 'done');
        const referenceImageToDisplay = type === 'video' && !asset?.url ? (stillImage?.url || refFrame?.url) : null;
        const sceneRunning = activeIndex === index || activeRefIndex === index || activeVideoIndex === index;
        const styleDnaPrompt = formatPromptWithChannelStyleDna(scene.imagePrompt, account);
        return <article key={scene.id} className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-white">
            <span>{String(index + 1).padStart(3, '0')} · {scene.chapter}</span>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg bg-black/40 p-0.5 border border-white/10 text-xs">
                <button
                  type="button"
                  className={`rounded px-2 py-0.5 font-medium transition ${type === 'image' ? 'bg-blue-600/40 text-blue-200' : 'text-gray-400 hover:text-white'}`}
                  onClick={() => void toggleMediaType(index, 'image')}
                  title="Mark scene as still image"
                >
                  Image
                </button>
                <button
                  type="button"
                  className={`rounded px-2 py-0.5 font-medium transition ${type === 'video' ? 'bg-purple-600/40 text-purple-200' : 'text-gray-400 hover:text-white'}`}
                  onClick={() => void toggleMediaType(index, 'video')}
                  title="Mark scene as video"
                >
                  Video
                </button>
              </div>
              <span className="text-xs text-gray-400">
                {spokenSeconds !== undefined ? `${spokenSeconds.toFixed(2)}s spoken` : 'Timing after narration'}
              </span>
            </div>
          </div>
          <div className={`relative flex ${profile === 'shorts' ? 'aspect-[9/16] max-h-[420px]' : 'aspect-video'} items-center justify-center overflow-hidden rounded-lg bg-black/40`}>
            {asset?.url ? (
              type === 'video' ? (
                <video src={asset.url} controls muted playsInline preload="metadata" className="h-full w-full object-contain" />
              ) : (
                <img src={asset.url} alt={`Scene ${index + 1}`} className="h-full w-full object-contain" />
              )
            ) : referenceImageToDisplay ? (
              <div className="relative h-full w-full flex items-center justify-center">
                <img src={referenceImageToDisplay} alt={`Scene ${index + 1} reference frame`} className="h-full w-full object-contain opacity-90" />
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between rounded bg-black/80 px-2.5 py-1 text-[11px] text-purple-200 backdrop-blur-sm border border-purple-500/30">
                  <span className="font-semibold flex items-center gap-1">🖼️ 2D Reference Frame</span>
                  <span className="text-[10px] text-purple-300">Ready for Flow Video</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-500">
                {type === 'video' ? <Film className="h-8 w-8 text-purple-300/50" /> : <ImageIcon className="h-8 w-8 text-gray-600" />}
                <span className="text-sm">{type === 'video' ? 'Video scene' : 'Image scene'}</span>
                <span className="px-3 text-center text-xs">{type === 'video' ? 'Generate 2D image reference or import MP4' : 'Generate an image or import a still'}</span>
              </div>
            )}
            {sceneRunning && (
              <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 p-4 text-center text-purple-200">
                <Loader2 className="h-9 w-9 animate-spin" />
                <span className="text-sm font-medium">
                  {activeVideoIndex === index
                    ? 'Generating Flow video…'
                    : activeRefIndex === index
                    ? 'Generating LoRA reference frame…'
                    : 'Generating image…'}
                </span>
              </div>
            )}
            <button disabled={locked} aria-label={`Add or replace ${type} for scene ${index + 1}`} title={`Add or replace ${type}`} className="absolute right-3 top-3 rounded-lg border border-white/10 bg-black/60 p-2 text-gray-200 hover:bg-black/80 disabled:opacity-40" onClick={() => { selectedIndex.current = index; if (fileInput.current) { fileInput.current.multiple = false; fileInput.current.accept = type === 'video' ? '.mp4' : '.png,.jpg,.jpeg,.webp'; fileInput.current.click(); } }}><Plus className="h-5 w-5" /></button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 p-2.5">
            <FlowVideoButton
              scriptId={script!.id}
              sceneIndex={index}
              prompt={scene.videoPrompt || styleDnaPrompt}
              duration={spokenSeconds !== undefined ? Math.min(10, Math.max(4, Math.round(spokenSeconds))) : 8}
              aspect={profile === 'shorts' ? 'portrait' : 'landscape'}
              defaultResolution={flowResolution}
              disabled={locked}
              hasReference={Boolean(referenceImageToDisplay)}
              onEnsureReference={async () => {
                if (!referenceImageToDisplay) {
                  await generateImages([index]);
                }
              }}
              onImported={async (blob) => {
                if (type !== 'video') {
                  await toggleMediaType(index, 'video');
                }
                await importFlowBlob(blob, index);
              }}
              onError={setError}
              onNotice={setNotice}
            />
            <span className="text-[11px] text-gray-400">
              {asset ? 'Ready in scene' : 'Direct Playwright generation'}
            </span>
          </div>
          <GenerationDisclosure title="Scene actions & prompt" className="mt-3">
          <button disabled={locked} onClick={() => void generateImages([index])} className="mt-3 flex items-center gap-2 rounded bg-accent/15 px-3 py-2 text-sm text-accent disabled:opacity-40">
            {activeIndex === index ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {activeIndex === index
              ? 'Generating image…'
              : type === 'video'
              ? (referenceImageToDisplay ? 'Regenerate 2D reference image' : 'Generate 2D reference image')
              : (asset ? 'Regenerate image' : 'Generate image')}
          </button>
          {type === 'video' && (
            <div className="mt-3 mb-3 rounded-lg border border-purple-500/30 bg-purple-500/10 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-purple-200">
                  Google Studio Consistency ({channelLora.channelLabel} LoRA)
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => void generateReferenceFrames([index])}
                    className="flex items-center gap-1.5 rounded bg-purple-500/25 px-2.5 py-1.5 text-xs font-medium text-purple-100 hover:bg-purple-500/35 disabled:opacity-40"
                  >
                    {activeRefIndex === index ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {activeRefIndex === index ? 'Generating frame…' : refFrame?.url ? 'Regenerate Reference Frame (LoRA)' : 'Generate Reference Frame (LoRA)'}
                  </button>
                  {refFrame?.url && (
                    <a
                      href={refFrame.url}
                      download={`${String(index + 1).padStart(3, '0')}_reference_frame.png`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download Reference Frame
                    </a>
                  )}
                </div>
              </div>
              {refFrame?.url && (
                <div className="flex items-center gap-3 pt-1">
                  <div
                    role="img"
                    aria-label={`Reference frame for scene ${index + 1}`}
                    className="h-16 w-28 shrink-0 rounded border border-white/15 bg-cover bg-center"
                    style={{ backgroundImage: `url("${refFrame.url}")` }}
                  />
                  <div className="text-[11px] text-gray-300 space-y-0.5">
                    <p className="font-medium text-emerald-300">LoRA Reference Frame Ready</p>
                    <p className="text-gray-400">Upload this frame to Google Studio (Image-to-Video) along with the Style-DNA prompt below for 100% style consistency.</p>
                  </div>
                </div>
              )}
            </div>
          )}
          <p className="mb-3 whitespace-pre-wrap text-xs leading-relaxed text-gray-400">{scene.imagePrompt}</p>
          {type === 'video' && autoStyleDna && (
            <div className="mb-3 rounded border border-border bg-bg/60 p-2.5 text-[11px] text-gray-300">
              <span className="font-semibold text-accent">Auto Style-DNA ({channelLora.channelLabel}): </span>
              {channelLora.styleDna}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              className="flex items-center gap-2 text-xs text-accent"
              onClick={() => {
                const textToCopy = type === 'video' && autoStyleDna ? styleDnaPrompt : scene.imagePrompt;
                navigator.clipboard
                  .writeText(textToCopy)
                  .then(() =>
                    setNotice(
                      type === 'video' && autoStyleDna
                        ? `Copied scene ${index + 1} prompt with ${channelLora.channelLabel} Style-DNA.`
                        : `Copied scene ${index + 1} prompt.`,
                    ),
                  )
                  .catch(() => setError('Could not copy. Select the prompt text and copy manually.'));
              }}
            >
              <Copy className="h-3 w-3" />
              {type === 'video' && autoStyleDna ? `Copy prompt + ${channelLora.channelLabel} Style-DNA` : 'Copy prompt'}
            </button>
            {type === 'video' && autoStyleDna && (
              <button
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white"
                onClick={() => {
                  navigator.clipboard
                    .writeText(scene.imagePrompt)
                    .then(() => setNotice(`Copied raw scene ${index + 1} prompt.`))
                    .catch(() => setError('Could not copy.'));
                }}
              >
                <Copy className="h-3 w-3" />
                Copy raw prompt
              </button>
            )}
          </div>
          </GenerationDisclosure>
          <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-gray-400">Narration: {scene.narration}</p>
        </article>;
      })}
    </div>
    <FlowAccountModal
      isOpen={showAccountModal}
      onClose={() => setShowAccountModal(false)}
      credits={flowCredits}
      onUpdated={() => void loadFlowCredits()}
    />
  </div>;
}
