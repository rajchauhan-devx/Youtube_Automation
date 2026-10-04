import { useWorkspaceApi } from '../../services/workspaceApi';
import { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Square,
  Undo2,
  X,
  Check,
  AlertCircle,
  Download,
  Zap,
  Image as ImageIcon,
  Music,
  Copy,
  Loader2,
  Volume2,
  RefreshCw,
  Clock,
  Mic2,
  Trash2,
  Upload,
  Sparkles,
} from 'lucide-react';
import type { Script, GeneratedImage, GeneratedAudio } from '../../data';
import { ErrorBoundary } from '../ErrorBoundary';
import { MixedMediaContent } from './MixedMediaContent';
import { GenerationDisclosure } from './GenerationDisclosure';
import { saveVoiceReference, rememberVoice, preferredVoice, VOICES_CHANGED } from '../../services/voiceLibrary';
import { normalizeNarration, spokenText } from '../../../server/src/services/scene-plan';
import { parseJsonResponse } from '../../lib/safe';

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

export function GenerationTab({
  script,
  onUpdate,
  onVisualEdit,
}: {
  script: Script | null;
  onUpdate: (patch: Partial<Script>) => void;
  onVisualEdit?: () => void;
}) {
  const [generationSubTab, setGenerationSubTab] = useState<'images' | 'audio'>('images');
  const { profile, account } = useWorkspaceApi();
  const mixedScenes = profile === 'mixed' || profile === 'shorts' || script?.scenePlan?.scenes.some(scene => scene.mediaType === 'video');

  return (
    <ErrorBoundary fallbackLabel="Generation Tab Error">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
          <div role="tablist" aria-label="Generation type" className="flex items-center gap-1 rounded-xl bg-surface2/60 p-1" onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 'images' : event.key === 'End' ? 'audio' : generationSubTab === 'images' ? 'audio' : 'images';
            setGenerationSubTab(next);
            event.currentTarget.querySelector<HTMLButtonElement>(`#generation-${next}-tab`)?.focus();
          }}>
            <button type="button" role="tab" tabIndex={generationSubTab === 'images' ? 0 : -1} id="generation-images-tab" aria-selected={generationSubTab === 'images'} aria-controls="generation-panel" onClick={() => setGenerationSubTab('images')}
              className={`studio-tab-btn ${generationSubTab === 'images' ? 'bg-surface text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}>
              <ImageIcon className="h-4 w-4" />{mixedScenes ? 'Images & videos' : 'Images'}
            </button>
            <button type="button" role="tab" tabIndex={generationSubTab === 'audio' ? 0 : -1} id="generation-audio-tab" aria-selected={generationSubTab === 'audio'} aria-controls="generation-panel" onClick={() => setGenerationSubTab('audio')}
              className={`studio-tab-btn ${generationSubTab === 'audio' ? 'bg-surface text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}>
              <Music className="h-4 w-4" />Audio
            </button>
          </div>
          {onVisualEdit && <button className="flex items-center gap-2 text-xs font-medium text-gray-400 transition-colors hover:text-white" onClick={onVisualEdit}>Create visual edit <Play className="h-3 w-3" /></button>}
        </div>
        <div id="generation-panel" role="tabpanel" aria-labelledby={`generation-${generationSubTab}-tab`} className="flex min-h-0 flex-1 flex-col">
        {generationSubTab === 'images' ? (
          mixedScenes ? <MixedMediaContent key={`${account.id}:${profile}:${script?.id}`} script={script} onUpdate={onUpdate} /> : <ImageGenerationContent key={`${account.id}:${profile}:${script?.id}`} script={script} onUpdate={onUpdate} />
        ) : (
          <AudioGenerationContent script={script} onUpdate={onUpdate} />
        )}
        </div>
      </div>
    </ErrorBoundary>
  );
}

function ImageGenerationContent({
  script,
  onUpdate,
}: {
  script: Script | null;
  onUpdate: (patch: Partial<Script>) => void;
}) {
  const { fetch, profile } = useWorkspaceApi();
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline' | 'starting' | 'stopping'>('checking');
  const [serverError, setServerError] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [preset, setPreset] = useState<'fast' | 'standard' | 'high'>('standard');
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [seedMode, setSeedMode] = useState<'random' | 'fixed'>('random');
  const [fixedSeed, setFixedSeed] = useState<number>(42);
  const [longBatchSize, setLongBatchSize] = useState(5);
  const [longRestSeconds, setLongRestSeconds] = useState(60);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  const runTokenRef = useRef(0);
  const pausedRef = useRef(false);
  const imagesRef = useRef<GeneratedImage[]>([]);
  const batchSizeRef = useRef(longBatchSize);
  const restSecondsRef = useRef(longRestSeconds);
  batchSizeRef.current = longBatchSize;
  restSecondsRef.current = longRestSeconds;

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    runTokenRef.current++;
    setIsRunning(false);
    setIsPaused(false);
    if (!script) {
      setImages([]);
      return;
    }
    const prompts = script.imagePrompts || [];
    const existing = script.generatedImages || [];
    const merged: GeneratedImage[] = prompts.map((prompt, i) => {
      const prior = existing.find((e) => e.index === i && e.prompt === prompt);
      return prior ?? { index: i, prompt, status: 'pending' as const };
    });
    imagesRef.current = merged;
    setImages(merged);
    return () => { runTokenRef.current++; pausedRef.current = false; };
  }, [script?.id, script?.imagePrompts]);

  async function checkServer() {
    setServerStatus('checking');
    const status = await fetch('/api/generate/status')
      .then(async (r) => parseJsonResponse<{ online?: boolean; detail?: string }>(r, {}))
      .catch((err) => ({ online: false as boolean, detail: err?.message as string | undefined }));
    setServerStatus(status.online ? 'online' : 'offline');
    setServerError(status.detail || '');
    return status.online as boolean;
  }

  async function loadModels() {
    try {
      const res = await fetch('/api/generate/models');
      const data = await parseJsonResponse<{ models?: unknown }>(res, {});
      if (Array.isArray(data.models) && data.models.length > 0) {
        setModels(data.models);
        if (!selectedModel) {
          setSelectedModel(data.models[0]);
        }
      }
    } catch {
      // Model discovery is optional; the default model remains usable.
    }
  }

  useEffect(() => {
    checkServer();
    loadModels();
  }, []);

  function updateImage(index: number, patch: Partial<GeneratedImage>) {
    const next = imagesRef.current.map((im) => (im.index === index ? { ...im, ...patch } : im));
    imagesRef.current = next;
    setImages(next);
    onUpdate({ generatedImages: next });
  }

  async function generateOne(item: GeneratedImage) {
    if (!script) return;
    const token = runTokenRef.current;
    updateImage(item.index, { status: 'generating', error: undefined, errorCode: undefined });
    try {
      const res = await fetch('/api/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: script.id,
          index: item.index,
          prompt: item.prompt,
          preset,
          modelName: selectedModel || undefined,
          seed: seedMode === 'fixed' ? fixedSeed : undefined,
        }),
      });
      const data = await parseJsonResponse<{ url?: string; seed?: number; elapsedMs?: number; error?: string; code?: string }>(res, {});
      if (token !== runTokenRef.current) return;
      if (!res.ok) throw Object.assign(new Error(data.error || 'Generation failed'), { code: data.code });
      updateImage(item.index, {
        status: 'done',
        url: data.url,
        seed: data.seed,
        elapsedMs: data.elapsedMs,
        attempts: (item.attempts || 0) + 1,
      });
    } catch (err: unknown) {
      if (token !== runTokenRef.current) return;
      updateImage(item.index, {
        status: 'error',
        error: getErrorMessage(err, 'Unknown error'),
        errorCode: getErrorCode(err),
        attempts: (item.attempts || 0) + 1,
      });
    }
  }

  async function runQueue(items: GeneratedImage[]) {
    const myToken = ++runTokenRef.current;
    setIsRunning(true);
    let completedInBatch = 0;
    for (let itemPosition = 0; itemPosition < items.length; itemPosition += 1) {
      const item = items[itemPosition];
      if (myToken !== runTokenRef.current) return;
      if (item.status === 'done') continue;
      while (pausedRef.current) {
        await new Promise((r) => setTimeout(r, 300));
        if (myToken !== runTokenRef.current) return;
      }
      await generateOne(item);
      completedInBatch += 1;

      // Long videos can have dozens of high-resolution images. Give the local
      // image model and GPU a configurable recovery period between batches.
      const remaining = items.slice(itemPosition + 1).some((candidate) => candidate.status !== 'done');
      if (profile !== 'shorts' && remaining && completedInBatch >= Math.max(1, batchSizeRef.current)) {
        completedInBatch = 0;
        const rest = Math.max(0, Math.round(restSecondsRef.current));
        if (rest > 0) {
          for (let seconds = rest; seconds > 0;) {
            if (myToken !== runTokenRef.current) return;
            if (!pausedRef.current) {
              setCooldownRemaining(seconds);
              seconds -= 1;
            }
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
          setCooldownRemaining(0);
        }
      }
    }
    if (myToken === runTokenRef.current) {
      setCooldownRemaining(0);
      setIsRunning(false);
    }
  }

  async function handleStartModel() {
    setServerStatus('starting');
    setServerError('');
    try {
      const res = await fetch('/api/generate/start', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setServerStatus('online');
      } else {
        setServerStatus('offline');
        setServerError(data.message || 'Failed to start ComfyUI');
      }
    } catch (err: unknown) {
      setServerStatus('offline');
      setServerError(getErrorMessage(err, 'Could not reach the server'));
    }
  }

  async function handleStopModel() {
    setServerStatus('stopping');
    if (isRunning) {
      await handleCancel();
    }
    try {
      const res = await fetch('/api/generate/stop', { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        setServerError(data.message || 'Failed to stop image model');
      }
    } catch (err: unknown) {
      setServerError(getErrorMessage(err, 'Could not reach the server'));
    }
    await checkServer();
  }

  async function handleStart() {
    if (!script || images.length === 0 || isRunning) return;
    let online = await checkServer();
    if (!online) {
      setServerStatus('starting');
      setServerError('');
      try {
        const res = await fetch('/api/generate/start', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          setServerStatus('online');
          online = true;
        } else {
          setServerStatus('offline');
          setServerError(data.message || 'Failed to start ComfyUI');
          return;
        }
      } catch (err: unknown) {
        setServerStatus('offline');
        setServerError(getErrorMessage(err, 'Could not reach the server'));
        return;
      }
    }
    if (!online) return;
    runQueue(imagesRef.current);
  }

  function handlePause() {
    setIsPaused(true);
  }
  function handleResume() {
    setIsPaused(false);
  }

  async function handleCancel() {
    runTokenRef.current++;
    setIsPaused(false);
    setCooldownRemaining(0);
    const generating = imagesRef.current.find((im) => im.status === 'generating');
    if (generating && script) {
      await fetch('/api/generate/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId: script.id, index: generating.index }),
      }).catch(() => {});
      updateImage(generating.index, { status: 'pending' });
    }
    setIsRunning(false);
  }

  function handleRetryFailed() {
    if (isRunning) return;
    runQueue(imagesRef.current);
  }

  async function handleRegenerateOne(index: number) {
    if (isRunning) return;
    const target = imagesRef.current.find((im) => im.index === index);
    if (!target) return;
    setIsRunning(true);
    const myToken = ++runTokenRef.current;
    await generateOne({ ...target, status: 'pending' });
    if (myToken === runTokenRef.current) setIsRunning(false);
  }

  if (!script) {
    return <div className="flex h-full items-center justify-center text-gray-500">No script selected.</div>;
  }
  if (images.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-500">
        <ImageIcon className="mb-3 h-8 w-8 text-gray-600" />
        <p className="text-sm">No image prompts to generate.</p>
        <p className="mt-1 text-xs">Extract assets first from the Preview tab.</p>
      </div>
    );
  }

  const doneCount = images.filter((i) => i.status === 'done').length;
  const errorCount = images.filter((i) => i.status === 'error').length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-semibold">Image Generation</h3>
          <span className="text-xs text-gray-500">
            {doneCount}/{images.length} done{errorCount > 0 ? `, ${errorCount} failed` : ''}
          </span>
          {script?.duration && (
            <span className="rounded bg-surface2 px-2 py-0.5 text-[11px] text-gray-400">
              Target: {script.duration}s (
              {script.duration <= 30
                ? '3–4 images recommended'
                : script.duration <= 45
                ? '4–5 images recommended'
                : script.duration <= 60
                ? '5–6 images recommended'
                : script.duration <= 90
                ? '6–8 images recommended'
                : '8–10 images recommended'}
              )
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isRunning ? (
            <button
              onClick={handleStart}
              disabled={((serverStatus === 'starting' || serverStatus === 'stopping')) || doneCount === images.length}
              className="studio-btn-primary"
            >
              {serverStatus === 'starting' ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {serverStatus === 'starting' ? 'Starting model...' : doneCount === 0 ? 'Start Generation' : 'Resume Generation'}
            </button>
          ) : isPaused ? (
            <button onClick={handleResume} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/80">
              <Play className="h-3.5 w-3.5" /> Resume
            </button>
          ) : (
            <button onClick={handlePause} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2">
              <Pause className="h-3.5 w-3.5" /> Pause
            </button>
          )}
          {isRunning && (
            <button onClick={handleCancel} className="flex items-center gap-1.5 rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10">
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          )}
          {!isRunning && errorCount > 0 && (
            <button onClick={handleRetryFailed} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2">
              <Undo2 className="h-3.5 w-3.5" /> Retry Failed ({errorCount})
            </button>
          )}
        </div>
      </div>

      {cooldownRemaining > 0 && <p role="status" className="px-4 py-3 text-xs text-amber-200">Computer rest: {cooldownRemaining}s remaining</p>}
      <div className="px-4 pt-4">
        <GenerationDisclosure title="Image settings" hint={`Local model / ${preset} quality`}>
      {profile !== 'shorts' && (
        <div className="flex flex-wrap items-center gap-4 border-b border-border bg-surface px-4 py-3 text-xs">
          <div>
            <p className="font-semibold text-amber-200">Long Video batch generation</p>
            <p className="mt-0.5 text-gray-400">Images are generated in groups so the computer can cool down between batches.</p>
          </div>
          <label className="flex items-center gap-2 text-gray-300">
            Images per batch
            <select aria-label="Images per batch" value={longBatchSize} disabled={isRunning} onChange={(e) => setLongBatchSize(Number(e.target.value))} className="rounded border border-border bg-bg px-2 py-1 text-xs text-white">
              {[3, 5, 8, 10].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-gray-300">
            Rest after each batch
            <select aria-label="Rest after batch" value={longRestSeconds} disabled={isRunning} onChange={(e) => setLongRestSeconds(Number(e.target.value))} className="rounded border border-border bg-bg px-2 py-1 text-xs text-white">
              <option value={0}>No rest</option><option value={30}>30 seconds</option><option value={60}>1 minute</option><option value={120}>2 minutes</option><option value={300}>5 minutes</option>
            </select>
          </label>

        </div>
      )}

      {/* Quality Presets & Model Selector Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-surface/50 px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-400">Quality:</span>
          <select aria-label="Image quality" value={preset} disabled={isRunning} onChange={e => setPreset(e.target.value as typeof preset)} className="rounded border border-border bg-bg px-3 py-2 text-xs text-white">
            <option value="fast">Fast</option><option value="standard">Standard</option><option value="high">High</option>
          </select>
        </div>
        {models.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-400">Model:</span>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="rounded border border-border bg-bg px-2.5 py-1 text-xs text-white outline-none focus:border-accent"
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m.replace(/\.(safetensors|ckpt)$/i, '')}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Seed Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 bg-surface/30 px-4 py-2 text-xs">
        <p className="text-gray-400">Images use the generated prompt exactly as written.</p>
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-400">Seed:</span>
          <select
            value={seedMode}
            onChange={(e) => setSeedMode(e.target.value as typeof seedMode)}
            className="rounded border border-border bg-bg px-2 py-1 text-xs text-white outline-none focus:border-accent"
          >
            <option value="random">Random Seed</option>
            <option value="fixed">Fixed Seed</option>
          </select>
          {seedMode === 'fixed' && (
            <input
              type="number"
              value={fixedSeed}
              onChange={(e) => setFixedSeed(parseInt(e.target.value, 10) || 0)}
              className="w-20 rounded border border-border bg-bg px-2 py-1 text-xs text-white outline-none focus:border-accent"
            />
          )}
        </div>
      </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span role="status" className="mr-auto text-xs text-gray-400">Model: {serverStatus}</span>
            {serverStatus === 'online' && <button onClick={handleStopModel} className="studio-btn-ghost"><Square className="h-3.5 w-3.5" />Stop Model</button>}
            {serverStatus === 'offline' && <button onClick={handleStartModel} className="studio-btn-ghost"><Zap className="h-3.5 w-3.5" />Run Image Model</button>}
            <button onClick={checkServer} disabled={serverStatus === 'starting' || serverStatus === 'stopping' || isRunning} className="studio-btn-ghost">Retry connection</button>
          </div>
        </GenerationDisclosure>
      </div>

      {serverStatus === 'starting' && (
        <div className="mx-4 mt-4 flex items-start gap-2 rounded-md border border-accent/30 bg-accent/10 p-3 text-xs text-accent">
          <span className="mt-0.5 h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <div>
            <p className="font-medium">Starting Image Model...</p>
            <p className="mt-1 text-accent/80">Launching ComfyUI, this may take up to 2 minutes.</p>
          </div>
        </div>
      )}

      {serverStatus === 'offline' && (
        <div className="mx-4 mt-4 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Image Model is offline</p>
            <p className="mt-1 text-red-300/80">{serverError}</p>
            <p className="mt-1 text-gray-400">Generation starts the local model automatically. Connection controls are in Image settings.</p>
          </div>
        </div>
      )}

      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((img) => (
            <div key={img.index} className="rounded-lg border border-border bg-surface p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-white">Image {img.index + 1}</span>
                {img.status === 'pending' && <span className="rounded-full bg-gray-500/10 px-2 py-0.5 text-[10px] text-gray-400">Pending</span>}
                {img.status === 'generating' && (
                  <span className="flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Generating...
                  </span>
                )}
                {img.status === 'done' && (
                  <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] text-green-400">
                    <Check className="h-3 w-3" /> Done
                  </span>
                )}
                {img.status === 'error' && (
                  <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">
                    <AlertCircle className="h-3 w-3" /> Failed
                  </span>
                )}
              </div>

              <div className="mb-2 flex aspect-square items-center justify-center overflow-hidden rounded-md bg-surface2">
                {img.status === 'done' && img.url ? (
                  <img
                    src={img.url}
                    alt={`Generated ${img.index + 1}`}
                    className="h-full w-full cursor-pointer object-cover"
                    onClick={() => setLightbox(img.url!)}
                  />
                ) : img.status === 'generating' ? (
                  <div className="flex flex-col items-center gap-2 text-gray-500">
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                    <span className="text-[10px]">Rendering...</span>
                  </div>
                ) : (
                  <ImageIcon className="h-8 w-8 text-gray-600" />
                )}
              </div>

              <p className="mb-2 line-clamp-3 text-[11px] leading-relaxed text-gray-400">{img.prompt}</p>
              {img.status === 'error' && <p className="mb-2 text-[11px] text-red-400">{img.error}</p>}

              {(img.status === 'done' || img.status === 'error') && <GenerationDisclosure title="Image actions">
              <div className="flex gap-2">
                <button
                  onClick={() => handleRegenerateOne(img.index)}
                  disabled={isRunning}
                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-gray-300 hover:bg-surface2 disabled:opacity-40"
                >
                  <Undo2 className="h-3 w-3" /> {img.status === 'done' ? 'Regenerate' : 'Retry'}
                </button>
                {img.status === 'done' && img.url && (
                  <a href={img.url} download className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-gray-300 hover:bg-surface2">
                    <Download className="h-3 w-3" /> Download
                  </a>
                )}
              </div>
              </GenerationDisclosure>}
            </div>
          ))}
        </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8" onClick={() => setLightbox(null)}>
          <img src={lightbox} className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}

interface VoiceItem {
  id?: string;
  name?: string;
  description?: string;
  gender?: string;
  language?: string;
  sampleText?: string;
  pitch?: number;
  tags?: string[];
  source?: 'builtin' | 'clone' | 'provider';
  deletable?: boolean;
}

function AudioGenerationContent({
  script,
  onUpdate,
}: {
  script: Script | null;
  onUpdate: (patch: Partial<Script>) => void;
}) {
  const { fetch, profile, account } = useWorkspaceApi();
  const sceneBacked = profile !== 'shorts' || Boolean(script?.scenePlan);
  const [copied, setCopied] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<'hi' | 'en'>('en');
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const voiceProviderRef = useRef('');
  function selectVoice(id: string) {
    setSelectedVoice(id);
    rememberVoice(account.id, selectedLanguage, voiceProviderRef.current, id);
  }
  const [previewVoiceId, setPreviewVoiceId] = useState<string | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [voicePreviewText, setVoicePreviewText] = useState('');

  // Voice Customization Controls
  const [rateOffset, setRateOffset] = useState<number>(0); // -25% to +35%
  const [pitchOffset, setPitchOffset] = useState<number>(0); // -12Hz to +12Hz
  const [stylePreset, setStylePreset] = useState<'natural' | 'cinematic' | 'shorts' | 'tech' | 'vlog' | 'custom'>('natural');
  const [exaggeration, setExaggeration] = useState(0.5);
  const [cfgWeight, setCfgWeight] = useState(0.5);
  const [temperature, setTemperature] = useState(0.8);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [voiceName, setVoiceName] = useState('');
  const [uploadingVoice, setUploadingVoice] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressElapsed, setProgressElapsed] = useState(0);
  const [progressStage, setProgressStage] = useState('');

  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [serverStarting, setServerStarting] = useState(false);
  const [providerName, setProviderName] = useState('Edge Neural TTS');
  const [providerKind, setProviderKind] = useState<'local' | 'cloud'>('cloud');
  const [providerState, setProviderState] = useState('');
  const [providerMessage, setProviderMessage] = useState('');
  const [error, setError] = useState('');

  const getInitialNarration = () => {
    if (script?.narration && script.narration.trim()) return script.narration;
    if (script?.extractedScript && script.extractedScript.trim()) return script.extractedScript;
    if (script?.content && script.content.trim()) return script.content;
    if (script?.aiResponse && script.aiResponse.trim()) return script.aiResponse;
    return '';
  };

  const [narrationText, setNarrationText] = useState<string>(getInitialNarration);
  const [enhancing, setEnhancing] = useState(false);
  const [enhanceTone, setEnhanceTone] = useState<'storyteller' | 'viral' | 'conversational' | 'dramatic'>('storyteller');
  const [previousNarrationText, setPreviousNarrationText] = useState<string | null>(null);
  const [enhanceError, setEnhanceError] = useState('');
  const [enhanceSuccessMessage, setEnhanceSuccessMessage] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const longResultRef = useRef(script?.generatedAudio?.[0]?.filename);
  const onLongUpdateRef = useRef(onUpdate);
  onLongUpdateRef.current = onUpdate;
  useEffect(() => {
    if (!sceneBacked || !script?.id) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(`/api/tts/long/status/${script.id}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Cannot read narration progress');
        const state = await response.json();
        if (controller.signal.aborted) return;
        setGenerating(state.status === 'running');
        if (state.status === 'running') {
          setProgressPercent(Math.round(100 * state.completed / Math.max(1, state.total)));
          setProgressStage(`Narration: ${state.completed} of ${state.total} scenes complete. You can leave this page and return.`);
        }
        if (state.status === 'error') setError(state.error);
        if (state.status === 'done' && state.result?.filename !== longResultRef.current) {
          longResultRef.current = state.result.filename;
          onLongUpdateRef.current({ generatedAudio: [state.result], timelineConfig: undefined, youtubeExport: undefined, facebookExport: undefined, instagramExport: undefined });
          setProgressPercent(100);
          setError('');
        }
      } catch (error) { if (!controller.signal.aborted) setError(getErrorMessage(error, 'Cannot read narration progress. Reopen this tab to reconnect.')); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 2000);
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [script?.id, sceneBacked, fetch]);

  // Synchronize script narration when the active script changes
  useEffect(() => {
    const text =
      script?.narration?.trim()
        ? script.narration
        : script?.extractedScript?.trim()
        ? script.extractedScript
        : script?.content?.trim()
        ? script.content
        : script?.aiResponse?.trim()
        ? script.aiResponse
        : '';
    if (text) {
      setNarrationText(text);
    }
  }, [script?.id, script?.narration, script?.extractedScript, script?.content, script?.aiResponse]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const previewVoiceIdRef = useRef<string | null>(null);
  const fetchTokenRef = useRef(0);
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;

    function loadSystemVoices() {
      const sv = window.speechSynthesis.getVoices();
      if (sv.length > 0) setSystemVoices(sv);
    }

    loadSystemVoices();
    window.speechSynthesis.onvoiceschanged = loadSystemVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const generatedAudio = script?.generatedAudio || [];
  const isLocalProvider = providerKind === 'local' || providerName === 'OmniVoice' || providerName.includes('Chatterbox');
  const isChatterbox = providerName.includes('Chatterbox');

  // Format rate and pitch for backend SSML
  const formattedRate = rateOffset >= 0 ? `+${rateOffset}%` : `${rateOffset}%`;
  const formattedPitch = pitchOffset >= 0 ? `+${pitchOffset}Hz` : `${pitchOffset}Hz`;

  function applyStylePreset(preset: 'natural' | 'cinematic' | 'shorts' | 'tech' | 'vlog') {
    stopPreview();
    setStylePreset(preset);
    if (preset === 'natural') {
      setRateOffset(0);
      setPitchOffset(0);
      setExaggeration(0.5);
      setCfgWeight(0.5);
      setTemperature(0.8);
    } else if (preset === 'cinematic') {
      setRateOffset(0);
      setPitchOffset(-2);
      setExaggeration(0.72);
      setCfgWeight(0.32);
      setTemperature(0.75);
    } else if (preset === 'shorts') {
      setRateOffset(10);
      setPitchOffset(2);
      setExaggeration(0.68);
      setCfgWeight(0.28);
      setTemperature(0.9);
    } else if (preset === 'tech') {
      setRateOffset(2);
      setPitchOffset(0);
      setExaggeration(0.5);
      setCfgWeight(0.5);
      setTemperature(0.65);
    } else if (preset === 'vlog') {
      setRateOffset(6);
      setPitchOffset(3);
      setExaggeration(0.6);
      setCfgWeight(0.4);
      setTemperature(0.8);
    }
  }

  function insertPause(durationSec: number) {
    if (sceneBacked) { setError('Edit the scene narration in the script response and extract it again.'); return; }
    const tag = ` [pause ${durationSec}s] `;
    if (!textareaRef.current) {
      const updated = (narrationText ? narrationText + tag : tag).trim();
      setNarrationText(updated);
      if (script?.id) onUpdate({ narration: updated });
      return;
    }
    const el = textareaRef.current;
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const textBefore = narrationText.substring(0, start);
    const textAfter = narrationText.substring(end);
    const newText = textBefore + tag + textAfter;
    setNarrationText(newText);
    if (script?.id) onUpdate({ narration: newText });

    setTimeout(() => {
      el.focus();
      const newPos = start + tag.length;
      el.setSelectionRange(newPos, newPos);
    }, 50);
  }

  async function handleEnhanceNarration() {
    if (sceneBacked) { setError('Narration is linked to scenes. Revise the script response and extract again.'); return; }
    if (!narrationText.trim()) {
      setEnhanceError('Please enter or generate narration script text first.');
      return;
    }
    setEnhancing(true);
    setEnhanceError('');
    setEnhanceSuccessMessage('');
    try {
      const res = await fetch('/api/llm/enhance-narration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: narrationText,
          language: selectedLanguage,
          tone: enhanceTone,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to modify narration');
      }
      if (data.enhancedText) {
        setPreviousNarrationText(narrationText);
        setNarrationText(data.enhancedText);
        if (script?.id) {
          onUpdate({ narration: data.enhancedText });
        }
        setEnhanceSuccessMessage('Narration polished with emotional cadence & pauses!');
        setTimeout(() => setEnhanceSuccessMessage(''), 5000);
      }
    } catch (err: unknown) {
      setEnhanceError(err instanceof Error ? err.message : 'Failed to modify narration');
    } finally {
      setEnhancing(false);
    }
  }

  function handleUndoEnhance() {
    if (previousNarrationText !== null) {
      setNarrationText(previousNarrationText);
      if (script?.id) {
        onUpdate({ narration: previousNarrationText });
      }
      setPreviousNarrationText(null);
      setEnhanceSuccessMessage('Reverted to previous narration script.');
      setTimeout(() => setEnhanceSuccessMessage(''), 3000);
    }
  }

  function stopPreview() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    previewVoiceIdRef.current = null;
    setPreviewVoiceId(null);
    setPreviewLoadingId(null);
  }

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      utteranceRef.current = null;
    };
  }, []);

  async function checkStatus() {
    try {
      const { data } = await fetchJson('/api/tts/status');
      const ready = data?.ready === undefined ? data?.online === true : data?.ready === true;
      setServerOnline(ready ? true : data?.state === 'loading' ? null : false);
      if (data?.provider) setProviderName(String(data.provider));
      if (data?.providerKind === 'local' || data?.providerKind === 'cloud') setProviderKind(data.providerKind);
      setProviderState(String(data?.state || ''));
      setProviderMessage(String(data?.error || data?.message || ''));
      return data;
    } catch {
      setServerOnline(false);
      return null;
    }
  }

  async function fetchVoices(lang: string) {
    const token = ++fetchTokenRef.current;
    setVoicesLoading(true);
    try {
      const { ok, data } = await fetchJson(`/api/tts/voices?language=${lang}`);
      if (!ok) throw new Error(data?.error || 'Could not load voices');
      if (token !== fetchTokenRef.current) return;
      const voiceList = Array.isArray(data?.voices) ? data.voices : [];
      setVoices(voiceList);
      voiceProviderRef.current = String(data.provider || '');
      const preferred = preferredVoice(account.id, lang, voiceProviderRef.current);
      const voiceId = (voice: VoiceItem | string) => typeof voice === 'string' ? voice : voice?.id || '';
      const preferredVoiceItem = voiceList.find((voice: VoiceItem) => voiceId(voice) === preferred);
      const currentVoiceItem = voiceList.find((voice: VoiceItem) => voiceId(voice) === selectedVoice);
      // Existing profiles may have been saved before the preference key was
      // introduced. Prefer a saved local clone over the built-in narrator in
      // that case, so the profile voice is actually used on first visit.
      const firstSavedVoice = voiceList.find((voice: VoiceItem) => typeof voice === 'object' && voice?.source === 'clone');
      setSelectedVoice((prev) => {
        if (preferredVoiceItem) return voiceId(preferredVoiceItem);
        if (currentVoiceItem && voiceId(currentVoiceItem) === prev) return prev;
        if (firstSavedVoice) return voiceId(firstSavedVoice);
        return voiceId(voiceList[0] || '');
      });
    } catch (err) {
      if (token !== fetchTokenRef.current) return;
      setVoices([]);
      setSelectedVoice('');
      setError(err instanceof Error ? err.message : 'Failed to load voices');
    } finally {
      if (token === fetchTokenRef.current) setVoicesLoading(false);
    }
  }

  useEffect(() => {
    checkStatus();
  }, []);

  useEffect(() => {
    fetchVoices(selectedLanguage);
    const refresh = () => { void fetchVoices(selectedLanguage); };
    window.addEventListener(VOICES_CHANGED, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      fetchTokenRef.current++;
      window.removeEventListener(VOICES_CHANGED, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [selectedLanguage]);

  function handleLanguageSwitch(lang: 'hi' | 'en') {
    stopPreview();
    setPreviewError('');
    setError('');
    setSelectedLanguage(lang);
  }

  async function handlePreviewVoice(v: VoiceItem, e: React.MouseEvent) {
    e.stopPropagation();
    const vId = typeof v === 'string' ? v : (v?.id || '');
    if (!vId) return;

    if (previewVoiceId === vId) {
      stopPreview();
      return;
    }

    stopPreview();
    setPreviewError('');
    setPreviewLoadingId(vId);
    previewVoiceIdRef.current = vId;

    try {
      const res = await fetch('/api/tts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice: vId,
          ...(isChatterbox ? { text: voicePreviewText.trim() || undefined, seed: 42 } : {}),
          language: selectedLanguage,
          rate: formattedRate,
          pitch: formattedPitch,
          exaggeration,
          cfgWeight,
          temperature,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('audio')) {
        const blob = await res.blob();
        if (previewVoiceIdRef.current !== vId) return;
        const url = URL.createObjectURL(blob);
        if (previewVoiceIdRef.current !== vId) {
          URL.revokeObjectURL(url);
          return;
        }
        audioUrlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        setPreviewVoiceId(vId);
        setPreviewLoadingId(null);

        audio.onended = () => {
          if (previewVoiceIdRef.current === vId) stopPreview();
        };
        audio.onerror = () => {
          if (previewVoiceIdRef.current === vId) {
            stopPreview();
            setPreviewError(`${providerName} could not render a preview for this voice.`);
          }
        };

        try {
          await audio.play();
        } catch {
          stopPreview();
          setPreviewError('Browser blocked audio playback. Try clicking Listen again.');
        }
        return;
      }
      if (previewVoiceIdRef.current !== vId) return;
      // A Chatterbox preview must never silently fall back to a browser voice:
      // that sounds like the wrong saved reference and hides the real error.
      if (isChatterbox) {
        setPreviewLoadingId(null);
        setPreviewError(`${providerName} could not render this selected voice. Check that Chatterbox is running and ready.`);
        return;
      }
    } catch {
      // Server unreachable — fall through to system voice preview
      if (isChatterbox && previewVoiceIdRef.current === vId) {
        setPreviewLoadingId(null);
        setPreviewError(`${providerName} is unavailable. Start Chatterbox and wait until the model is ready.`);
        return;
      }
    }

    setPreviewLoadingId(null);
    if (!playSystemPreview(v, vId)) {
      stopPreview();
      setPreviewError(
        isLocalProvider
          ? `${providerName} is unavailable. Start the local voice engine and wait until the model is ready.`
          : `${providerName} is unavailable. Check the internet connection.`
      );
    }
  }

  function playSystemPreview(v: VoiceItem, vId: string): boolean {
    if (!('speechSynthesis' in window)) return false;
    const sysVoices = systemVoices.length > 0 ? systemVoices : window.speechSynthesis.getVoices();
    if (!sysVoices || sysVoices.length === 0) return false;

    const targetLang = selectedLanguage === 'hi' ? 'hi' : 'en';
    let langPool = sysVoices.filter((sv) => sv.lang.toLowerCase().startsWith(targetLang));
    if (langPool.length === 0 && selectedLanguage === 'hi') {
      langPool = sysVoices.filter((sv) => sv.lang.toLowerCase().includes('in'));
    }
    if (langPool.length === 0 && selectedLanguage === 'hi') {
      langPool = sysVoices.filter((sv) => sv.lang.toLowerCase().startsWith('en'));
    }
    if (langPool.length === 0) return false;

    const gender = typeof v === 'object' ? String(v.gender || '').toLowerCase() : '';
    const femaleKeywords = ['female', 'swara', 'neerja', 'ava', 'jenny', 'emma', 'zira', 'kalpana'];
    const maleKeywords = ['male', 'madhur', 'prabhat', 'brian', 'andrew', 'christopher', 'david', 'mark'];

    let genderPool = langPool;
    if (gender === 'female') {
      const f = langPool.filter((sv) => femaleKeywords.some((kw) => sv.name.toLowerCase().includes(kw)));
      if (f.length > 0) genderPool = f;
    } else if (gender === 'male') {
      const m = langPool.filter((sv) => maleKeywords.some((kw) => sv.name.toLowerCase().includes(kw)));
      if (m.length > 0) genderPool = m;
    }

    const voiceIdx = voices.findIndex((lv: VoiceItem) => lv?.id === vId);
    const picked = genderPool[voiceIdx >= 0 ? voiceIdx % genderPool.length : 0];
    if (!picked) return false;

    const sampleText = typeof v === 'object' && v?.sampleText
      ? v.sampleText
      : (selectedLanguage === 'hi' ? 'नमस्ते! यह मेरी आवाज़ का नमूना है।' : 'Hello! This is a sample of my voice.');

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(sampleText);
    utterance.voice = picked;
    utterance.lang = picked.lang;
    utterance.pitch = 1.0 + (pitchOffset * 0.03);
    utterance.rate = 1.0 + (rateOffset * 0.01);
    utteranceRef.current = utterance;
    setPreviewVoiceId(vId);

    utterance.onend = () => {
      if (previewVoiceIdRef.current === vId) stopPreview();
    };
    utterance.onerror = (ev) => {
      if (previewVoiceIdRef.current !== vId) return;
      if (ev.error !== 'interrupted' && ev.error !== 'canceled') {
        setPreviewError('System voice playback failed: ' + ev.error);
      }
      stopPreview();
    };

    setTimeout(() => {
      if (previewVoiceIdRef.current === vId) window.speechSynthesis.speak(utterance);
    }, 80);
    return true;
  }

  async function fetchJson(path: string, options?: RequestInit) {
    const res = await fetch(path, options);
    const text = await res.text();
    try {
      return { ok: res.ok, status: res.status, data: JSON.parse(text) };
    } catch {
      return { ok: false, status: res.status, data: { error: text || `Server returned ${res.status} with no body` } };
    }
  }

  async function checkOrStartServer() {
    setServerStarting(true);
    setServerOnline(null);
    setError('');
    try {
      const { data } = await fetchJson('/api/tts/start', { method: 'POST' });
      if (data?.success) {
        setProviderState(String(data?.state || 'loading'));
        setProviderMessage(String(data?.message || 'Loading local voice model...'));
        if (data?.ready) {
          setServerOnline(true);
          await fetchVoices(selectedLanguage);
        } else {
          let ready = false;
          for (let attempt = 0; attempt < 300; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            const status = await checkStatus();
            if (status?.ready === true) {
              ready = true;
              break;
            }
            if (status?.state === 'error') {
              throw new Error(status?.error || status?.message || 'The local TTS model failed to load.');
            }
          }
          if (!ready) throw new Error('The local TTS model did not become ready within 10 minutes.');
          setServerOnline(true);
          await fetchVoices(selectedLanguage);
        }
      } else {
        setServerOnline(false);
        setError(data?.message || 'Failed to start TTS engine');
      }
    } catch (err) {
      setServerOnline(false);
      setError(err instanceof Error ? err.message : 'Could not reach the server');
    } finally {
      setServerStarting(false);
    }
  }

  async function handleVoiceUpload() {
    if (!voiceFile || !voiceName.trim() || uploadingVoice) return;
    setUploadingVoice(true);
    setError('');
    try {
      const voice = await saveVoiceReference(voiceName, selectedLanguage, voiceFile, fetch);
      rememberVoice(account.id, selectedLanguage, voiceProviderRef.current, voice.id);
      await fetchVoices(selectedLanguage);
      selectVoice(voice.id);
      setVoiceFile(null);
      setVoiceName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Voice upload failed');
    } finally {
      setUploadingVoice(false);
    }
  }

  async function handleDeleteVoice(id: string, name: string) {
    if (!window.confirm(`Remove the local voice “${name}”? This deletes its reference audio from this computer.`)) return;
    setError('');
    const { ok, data } = await fetchJson(`/api/tts/voices/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!ok) {
      setError(data?.error || 'Could not delete local voice');
      return;
    }
    await fetchVoices(selectedLanguage);
  }

  async function handleStopServer() {
    setServerOnline(false);
    setServerStarting(false);
    stopPreview();
    try {
      await fetch('/api/tts/stop', { method: 'POST' });
    } catch {
      // The UI is already reset even if the local process was unavailable.
    }
  }

  function handleCopy() {
    if (narrationText) {
      navigator.clipboard.writeText(narrationText).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  async function handleGenerate() {
    const textToGenerate = narrationText.trim();
    if (!textToGenerate || generating || !script) return;
    if (voicesLoading || !selectedVoice || !voices.some(voice => voice.id === selectedVoice && (!voice.language || voice.language === selectedLanguage))) {
      setError('Please select a voice character first.');
      return;
    }

    if (sceneBacked) {
      if (!script.scenePlan || normalizeNarration(textToGenerate) !== normalizeNarration(spokenText(script.scenePlan))) {
        setError('Extract the scene map first. Change narration in the script response and extract again so visuals keep their matching words.'); return;
      }
      setGenerating(true); setError(''); setProgressPercent(0);
      try {
        const { ok, data } = await fetchJson('/api/tts/long/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scriptId: script.id, language: selectedLanguage, voice: selectedVoice, rate: formattedRate, pitch: formattedPitch, exaggeration, cfgWeight, temperature }) });
        if (!ok) throw new Error(data?.error || 'Could not start narration');
        onUpdate({ generatedAudio: [], timelineConfig: undefined, youtubeExport: undefined, facebookExport: undefined, instagramExport: undefined });
      } catch (error) { setGenerating(false); setError(getErrorMessage(error, 'Could not start narration')); }
      return;
    }

    // Save narration directly to script state
    onUpdate({ narration: textToGenerate });

    setGenerating(true);
    setError('');
    setPreviewError('');
    setProgressPercent(5);
    setProgressElapsed(0);
    setProgressStage(`Initializing ${selectedLanguage === 'hi' ? 'Hindi' : 'English'} neural speech model...`);

    const timer = setInterval(() => {
      setProgressElapsed((prev) => prev + 1);
      setProgressPercent((prev) => {
        if (prev < 30) {
          setProgressStage('Synthesizing speech & natural acoustic pause timing...');
          return prev + 6;
        } else if (prev < 70) {
          setProgressStage('Modulating prosody, pitch, and human inflection...');
          return prev + 4;
        } else if (prev < 92) {
          setProgressStage('Encoding high-fidelity audio stream...');
          return prev + 2;
        }
        return prev;
      });
    }, 500);

    try {
      const { ok, data } = await fetchJson('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToGenerate,
          language: selectedLanguage,
          voice: selectedVoice,
          scriptId: script.id,
          rate: formattedRate,
          pitch: formattedPitch,
          exaggeration,
          cfgWeight,
          temperature,
        }),
      });

      if (!ok) throw new Error(data?.error || 'Generation failed');

      setProgressPercent(100);
      setProgressStage('Voice synthesis complete!');
      await new Promise((r) => setTimeout(r, 400));

      const entry: GeneratedAudio = {
        narrationText: data.narrationText || textToGenerate,
        language: selectedLanguage,
        voice: selectedVoice,
        voiceName: activeVoiceObj?.name || selectedVoice,
        url: data.publicUrl,
        filename: data.filename,
        elapsedMs: data.elapsedMs,
      };

      const existing = (script.generatedAudio || []).filter((a) => a.language !== selectedLanguage);
      onUpdate({ narration: textToGenerate, generatedAudio: [entry, ...existing] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate audio');
    } finally {
      clearInterval(timer);
      setGenerating(false);
    }
  }

  function handleRegenerate() {
    if (!script) return;
    if (sceneBacked) { void handleGenerate(); return; }
    const existing = (script.generatedAudio || []).filter((a) => a.language !== selectedLanguage);
    onUpdate({ generatedAudio: existing });
    handleGenerate();
  }

  const currentAudio = generatedAudio.find((a) => a.language === selectedLanguage);
  const activeVoiceObj = voices.find((v: VoiceItem) => (typeof v === 'string' ? v === selectedVoice : v?.id === selectedVoice));
  const activeVoiceName = typeof activeVoiceObj === 'string' ? activeVoiceObj : (activeVoiceObj?.name || selectedVoice || 'Default Voice');

  if (!script) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        No script selected.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Music className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold">Audio Generation ({providerName})</h3>
          {serverOnline === true && (
            <span className="flex items-center gap-1.5 text-[10px] text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" /> {providerName} connected
            </span>
          )}
          {serverOnline === false && (
            <span className="flex items-center gap-1.5 text-[10px] text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> {providerName} offline
            </span>
          )}
          {(serverStarting || providerState === 'loading') && (
            <span className="flex items-center gap-1.5 text-[10px] text-accent">
              <span className="h-1.5 w-1.5 animate-spin rounded-full border-2 border-accent border-t-transparent" /> Loading local model...
            </span>
          )}
        </div>

        <button
          onClick={currentAudio ? handleRegenerate : handleGenerate}
          disabled={generating || voicesLoading || !selectedVoice || !narrationText.trim()}
          className="studio-btn-primary"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating Audio ({progressPercent}%)...
            </>
          ) : currentAudio ? (
            <>
              <Undo2 className="h-4 w-4" />
              Regenerate audio
            </>
          ) : (
            <>
              <Play className="h-4 w-4 fill-current" />
              Generate audio
            </>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {serverStarting && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-accent/30 bg-accent/10 p-3 text-xs text-accent">
            <span className="mt-0.5 h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <div>
              <p className="font-medium">Starting {providerName}...</p>
              <p className="mt-1 text-accent/80">
                {providerMessage || 'Initializing neural models. The first run may download several gigabytes...'}
              </p>
            </div>
          </div>
        )}

        {serverOnline === false && !serverStarting && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">{providerName} is unavailable</p>
              <p className="mt-1 text-red-300/80">
                {error || providerMessage || (isLocalProvider
                  ? 'Start the local TTS engine to load the model.'
                  : 'Check your internet connection and try again.')}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={checkStatus}
                  className="rounded border border-red-500/40 px-2 py-1 text-[11px] hover:bg-red-500/10"
                >
                  Check status
                </button>
                {isLocalProvider && (
                  <button
                    onClick={checkOrStartServer}
                    className="rounded border border-accent/50 bg-accent/15 px-2 py-1 text-[11px] text-accent hover:bg-accent/25"
                  >
                    Start {isChatterbox ? 'Chatterbox' : 'TTS engine'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label htmlFor="narration-language" className="text-xs font-medium text-gray-400">Narration language</label>
          <select id="narration-language" value={selectedLanguage} disabled={generating} onChange={e => handleLanguageSwitch(e.target.value as 'en' | 'hi')} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white">
            <option value="en">English</option><option value="hi">Hindi & Hinglish</option>
          </select>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
          <label className="min-w-0 flex-1 text-xs font-medium text-gray-400">Voice
            <select aria-label="Narration voice" value={selectedVoice} disabled={voicesLoading || generating} onChange={e => { stopPreview(); selectVoice(e.target.value); }} className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white">
              {!selectedVoice && <option value="">{voicesLoading ? 'Loading voices...' : 'Select a voice'}</option>}
              {voices.map((voice, index) => <option key={voice.id || index} value={voice.id || `voice_${index}`}>{voice.name || voice.id || `Voice ${index + 1}`}</option>)}
            </select>
          </label>
          <button type="button" disabled={!activeVoiceObj || Boolean(previewLoadingId)} onClick={event => activeVoiceObj && handlePreviewVoice(activeVoiceObj, event)} className="studio-btn-ghost">
            {previewLoadingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {previewLoadingId ? 'Loading preview...' : previewVoiceId ? 'Stop preview' : 'Preview voice'}
          </button>
          {previewError && <p role="alert" className="w-full text-xs text-red-400">{previewError}</p>}
        </div>
        {/* Step 2: Voice Character Selection */}
        <GenerationDisclosure title="Voice library & reference upload" hint={`${voices.length} voices available`} className="mb-4">
          <div className="mb-3 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Voice library ({selectedLanguage === 'en' ? 'English' : 'Hindi'})
            </label>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-500">
                {voicesLoading ? 'Loading voices...' : `${voices.length} neural voice${voices.length === 1 ? '' : 's'} available`}
              </span>
              <button
                onClick={() => fetchVoices(selectedLanguage)}
                disabled={voicesLoading}
                className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-gray-300 hover:bg-surface2 disabled:opacity-40"
              >
                <RefreshCw className={`h-3 w-3 ${voicesLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {voicesLoading ? (
            <div className="flex items-center gap-2 py-6 text-xs text-gray-400">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              Fetching neural voice models...
            </div>
          ) : voices.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface2/50 py-6 text-center text-xs text-gray-400">
              <Volume2 className="h-5 w-5 text-gray-600" />
              <p>No voice models found for {selectedLanguage === 'en' ? 'English' : 'Hindi'}.</p>
              <p className="text-[11px] text-gray-500">Click Refresh to reload available models.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {voices.map((v: VoiceItem, idx: number) => {
                const vId = typeof v === 'string' ? v : (v?.id || `voice_${idx}`);
                const vName = typeof v === 'string' ? v : (v?.name || v?.id || `Voice ${idx + 1}`);
                const rawGender = typeof v === 'object' && v?.gender ? String(v.gender) : 'VOICE';
                const isFemale = rawGender.toLowerCase() === 'female';
                const vDescription = typeof v === 'object' && v?.description ? String(v.description) : '';
                const vTags = typeof v === 'object' && Array.isArray(v?.tags) ? v.tags : [];
                const isSelected = selectedVoice === vId;
                const isPlayingPreview = previewVoiceId === vId;

                return (
                  <div
                    key={vId}
                    onClick={() => selectVoice(vId)}
                    className={`relative cursor-pointer rounded-lg border p-3.5 transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-accent bg-accent/10 shadow-lg ring-1 ring-accent/50'
                        : 'border-border bg-surface2/50 hover:border-gray-500 hover:bg-surface2'
                    }`}
                  >
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-xs font-bold text-white truncate pr-2">{vName}</span>
                        <div className="flex items-center gap-1.5">
                          {typeof v === 'object' && v?.deletable && (
                            <button
                              type="button"
                              title="Delete local voice"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDeleteVoice(vId, vName);
                              }}
                              className="rounded p-1 text-gray-500 hover:bg-red-500/10 hover:text-red-400"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                          {isSelected && (
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent text-white">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mb-2 flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            isFemale
                              ? 'bg-pink-500/20 text-pink-300'
                              : 'bg-blue-500/20 text-blue-300'
                          }`}
                        >
                          {rawGender.toUpperCase()}
                        </span>
                        {vTags.map((t: string) => (
                          <span key={String(t)} className="rounded bg-gray-700/50 px-1.5 py-0.5 text-[10px] text-gray-300">
                            {String(t)}
                          </span>
                        ))}
                      </div>

                      {vDescription ? (
                        <p className="text-[11px] leading-relaxed text-gray-400 line-clamp-2 mb-3">
                          {vDescription}
                        </p>
                      ) : null}
                    </div>

                    <div className="pt-2 border-t border-border/40 mt-auto">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={(e) => handlePreviewVoice(v, e)}
                          disabled={previewLoadingId === vId}
                          className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-all ${
                            isPlayingPreview
                              ? 'bg-accent text-white animate-pulse'
                              : previewLoadingId === vId
                              ? 'bg-accent/30 text-white'
                              : 'border border-accent/40 text-accent hover:bg-accent/20'
                          }`}
                        >
                          {isPlayingPreview ? (
                            <>
                              <Volume2 className="h-3.5 w-3.5 animate-bounce" />
                              Playing...
                            </>
                          ) : previewLoadingId === vId ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            <>
                              <Play className="h-3 w-3 fill-current" />
                              Audition Voice
                            </>
                          )}
                        </button>
                        <span className="text-[10px] font-mono text-gray-500">
                          {selectedLanguage.toUpperCase()}
                        </span>
                      </div>
                      {isPlayingPreview && previewError && (
                        <p className="mt-2 text-[10px] leading-snug text-red-400">{previewError}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {isChatterbox && (
            <div className="mt-4 rounded-lg border border-accent/25 bg-accent/5 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Mic2 className="h-4 w-4 text-accent" />
                <div>
                  <p className="text-xs font-semibold text-gray-200">Add a local reference voice</p>
                  <p className="text-[10px] text-gray-500">Use a clean 8–15 second recording with no music or background noise.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.2fr_auto]">
                <input
                  value={voiceName}
                  onChange={(event) => setVoiceName(event.target.value)}
                  maxLength={80}
                  placeholder="Voice name"
                  className="rounded border border-border bg-surface2 px-3 py-2 text-xs text-gray-200 outline-none focus:border-accent"
                />
                <label className="flex cursor-pointer items-center gap-2 rounded border border-border bg-surface2 px-3 py-2 text-xs text-gray-300 hover:border-gray-500">
                  <Upload className="h-3.5 w-3.5 text-accent" />
                  <span className="truncate">{voiceFile?.name || 'Choose WAV, MP3, M4A, FLAC or OGG'}</span>
                  <input
                    type="file"
                    accept="audio/wav,audio/x-wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/flac,audio/ogg,.wav,.mp3,.m4a,.flac,.ogg"
                    className="hidden"
                    onChange={(event) => setVoiceFile(event.target.files?.[0] || null)}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleVoiceUpload}
                  disabled={!voiceFile || !voiceName.trim() || uploadingVoice}
                  className="flex items-center justify-center gap-1.5 rounded bg-accent px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {uploadingVoice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic2 className="h-3.5 w-3.5" />}
                  {uploadingVoice ? 'Preparing...' : 'Add Voice'}
                </button>
              </div>
              <p className="mt-2 text-[10px] text-amber-300/80">
                Only clone voices you own or have explicit permission to use. References remain on this computer.
              </p>
            </div>
          )}
        </GenerationDisclosure>

        {/* Step 3: Voice Customization & Style Controls */}
        <GenerationDisclosure title="Voice settings" hint={`${stylePreset === 'custom' ? 'Custom' : stylePreset.charAt(0).toUpperCase() + stylePreset.slice(1)} delivery`} className="mb-4">
          <label className="mb-4 flex flex-wrap items-center gap-3 text-xs text-gray-400">Delivery style
            <select aria-label="Voice delivery style" value={stylePreset} disabled={generating} onChange={e => { const value = e.target.value as typeof stylePreset; if (value === 'custom') setStylePreset(value); else applyStylePreset(value); }} className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white">
              <option value="natural">Natural conversation</option><option value="cinematic">Storyteller</option><option value="shorts">Viral Shorts</option><option value="tech">Tech news</option><option value="vlog">Vlog</option><option value="custom">Custom</option>
            </select>
          </label>
          {isChatterbox && <div className="mb-3 space-y-2 rounded-md border border-border bg-bg/50 p-3">
            <p className="text-xs text-gray-400">Start with Natural Conversation for a relaxed delivery. Higher expressiveness can speed up speech. Paragraph breaks add a short pause; breaths within a sentence are preserved.</p>
            <label className="block text-xs text-gray-300" htmlFor="voice-preview-text">Try your own sentence</label>
            <textarea id="voice-preview-text" value={voicePreviewText} maxLength={500} rows={2}
              onChange={event => { stopPreview(); setVoicePreviewText(event.target.value); }}
              placeholder="Paste a short part of your narration, then compare presets…"
              className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent" />
            <button type="button" disabled={!activeVoiceObj || !serverOnline || Boolean(previewLoadingId)}
              onClick={event => activeVoiceObj && handlePreviewVoice(activeVoiceObj, event)}
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">
              {previewLoadingId ? 'Generating preview…' : previewVoiceId ? 'Stop preview' : 'Preview selected voice'}
            </button>
            {previewError && <p role="alert" className="text-xs text-red-400">{previewError}</p>}
          </div>}
          {isChatterbox ? (
            <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-3">
              <div className="rounded-md border border-border/50 bg-surface2/40 p-3">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-300">Expressiveness</span>
                  <span className="font-mono font-semibold text-accent">{exaggeration.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.25"
                  max="1.2"
                  step="0.05"
                  value={exaggeration}
                  onChange={(event) => {
                    stopPreview();
                    setExaggeration(Number(event.target.value));
                    setStylePreset('custom');
                  }}
                  className="w-full cursor-pointer accent-accent"
                />
                <div className="mt-1 flex justify-between text-[10px] text-gray-500"><span>Calm</span><span>Dramatic</span></div>
              </div>

              <div className="rounded-md border border-border/50 bg-surface2/40 p-3">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-300">Pace Guidance</span>
                  <span className="font-mono font-semibold text-accent">{cfgWeight.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="0.8"
                  step="0.05"
                  value={cfgWeight}
                  onChange={(event) => {
                    stopPreview();
                    setCfgWeight(Number(event.target.value));
                    setStylePreset('custom');
                  }}
                  className="w-full cursor-pointer accent-accent"
                />
                <div className="mt-1 flex justify-between text-[10px] text-gray-500"><span>Expressive</span><span>Measured</span></div>
              </div>

              <div className="rounded-md border border-border/50 bg-surface2/40 p-3">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-300">Natural Variation</span>
                  <span className="font-mono font-semibold text-accent">{temperature.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.4"
                  max="1.2"
                  step="0.05"
                  value={temperature}
                  onChange={(event) => {
                    stopPreview();
                    setTemperature(Number(event.target.value));
                    setStylePreset('custom');
                  }}
                  className="w-full cursor-pointer accent-accent"
                />
                <div className="mt-1 flex justify-between text-[10px] text-gray-500"><span>Consistent</span><span>Varied</span></div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
              <div className="rounded-md border border-border/50 bg-surface2/40 p-3">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-300">Speech Pace (Rate)</span>
                  <span className="font-mono font-semibold text-accent">
                    {rateOffset === 0 ? 'Normal (1.0x)' : `${rateOffset > 0 ? '+' : ''}${rateOffset}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min="-20"
                  max="30"
                  step="2"
                  value={rateOffset}
                  onChange={(event) => {
                    setRateOffset(parseInt(event.target.value, 10));
                    setStylePreset('custom');
                  }}
                  className="w-full cursor-pointer accent-accent"
                />
                <div className="mt-1 flex justify-between text-[10px] text-gray-500"><span>Slow (-20%)</span><span>Normal</span><span>Fast (+30%)</span></div>
              </div>

              <div className="rounded-md border border-border/50 bg-surface2/40 p-3">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-300">Pitch & Tone</span>
                  <span className="font-mono font-semibold text-accent">
                    {pitchOffset === 0 ? 'Natural (0Hz)' : `${pitchOffset > 0 ? '+' : ''}${pitchOffset}Hz`}
                  </span>
                </div>
                <input
                  type="range"
                  min="-10"
                  max="10"
                  step="1"
                  value={pitchOffset}
                  onChange={(event) => {
                    setPitchOffset(parseInt(event.target.value, 10));
                    setStylePreset('custom');
                  }}
                  className="w-full cursor-pointer accent-accent"
                />
                <div className="mt-1 flex justify-between text-[10px] text-gray-500"><span>Deeper (-10Hz)</span><span>Natural</span><span>Higher (+10Hz)</span></div>
              </div>
            </div>
          )}

        <GenerationDisclosure title="Engine controls" hint={providerName} className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={checkStatus} disabled={generating || serverStarting} className="studio-btn-ghost">Check status</button>
        {serverOnline === true && isLocalProvider && (
          <button
            onClick={handleStopServer}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
          >
            <Square className="h-3.5 w-3.5" /> Stop Server
          </button>
        )}
          </div>
        </GenerationDisclosure>
        </GenerationDisclosure>

        {/* Step 4: Narration Script Editor with Natural Pause Insertion Toolbar */}
        <div className="mb-6 rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              <Copy className="h-3.5 w-3.5 text-gray-400" />
              Narration script
            </span>
            <div className="flex items-center gap-2">
              {previousNarrationText !== null && (
                <button
                  type="button"
                  onClick={handleUndoEnhance}
                  className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/20"
                  title="Revert to previous narration"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Undo AI
                </button>
              )}

              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1 text-xs text-gray-300 hover:bg-surface2"
              >
                {copied ? 'Copied!' : 'Copy Script'}
              </button>
            </div>
          </div>

          {!sceneBacked && <GenerationDisclosure title="Narration tools" hint="AI polish & pause insertion" className="mb-3">
          {/* AI Narration Polish Toolbar */}
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-purple-500/30 bg-gradient-to-r from-purple-950/30 to-surface2/60 p-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-purple-200">
                <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                AI Narration Polish:
              </span>
              <select aria-label="Narration polish tone" value={enhanceTone} onChange={e => setEnhanceTone(e.target.value as typeof enhanceTone)} className="rounded-lg border border-border bg-bg px-3 py-2 text-xs text-white">
                <option value="storyteller">Storyteller</option><option value="viral">Viral Shorts</option><option value="conversational">Conversational</option><option value="dramatic">Dramatic</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleEnhanceNarration}
              disabled={sceneBacked || enhancing || !narrationText.trim()}
              className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-purple-600 to-accent px-3.5 py-1 text-xs font-semibold text-white shadow-md transition-all hover:opacity-90 disabled:opacity-40"
              title="Enhance script with emotional cadence and acoustic pause markers for Chatterbox"
            >
              {enhancing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Polishing for Speech...
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Modify with AI
                </>
              )}
            </button>
          </div>

          {enhanceSuccessMessage && (
            <div className="mb-2 flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
              <Check className="h-3 w-3" /> {enhanceSuccessMessage}
            </div>
          )}
          {enhanceError && (
            <div className="mb-2 flex items-center gap-1.5 rounded-md bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-400">
              <AlertCircle className="h-3 w-3" /> {enhanceError}
            </div>
          )}

          {/* Quick Pause Insertion Bar */}
          <div style={{ display: sceneBacked ? 'none' : undefined }} className="mb-2.5 flex flex-wrap items-center gap-2 rounded-md border border-border/40 bg-surface2/30 px-3 py-2">
            <span className="flex items-center gap-1 text-[11px] font-medium text-gray-400">
              <Clock className="h-3 w-3 text-accent" /> Insert Acoustic Pause:
            </span>
            <button
              type="button"
              onClick={() => insertPause(0.5)}
              className="rounded border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent hover:bg-accent/20"
            >
              + 0.5s Pause
            </button>
            <button
              type="button"
              onClick={() => insertPause(1.0)}
              className="rounded border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent hover:bg-accent/20"
            >
              + 1.0s Pause
            </button>
            <button
              type="button"
              onClick={() => insertPause(1.5)}
              className="rounded border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent hover:bg-accent/20"
            >
              + 1.5s Pause
            </button>
            <span className="ml-auto text-[10px] text-gray-500">
              💡 Pauses like <code className="text-gray-300">[pause 1s]</code> create authentic silence and are never spoken.
            </span>
          </div>

          </GenerationDisclosure>}

          <textarea
            readOnly={sceneBacked}
            ref={textareaRef}
            value={narrationText}
            onChange={(e) => {
              setNarrationText(e.target.value);
              if (script?.id) {
                onUpdate({ narration: e.target.value });
              }
            }}
            rows={5}
            className="w-full rounded-md border border-border bg-surface2 p-3 text-sm leading-relaxed text-gray-200 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            placeholder="Type or paste narration script text here (you can write [pause 1s] or ... for natural pauses)..."
          />
        </div>

        {/* Step 5: Start Generation Action & Progress Bar */}
        <div className="mb-6 flex flex-col items-start gap-4 rounded-lg border border-border bg-surface p-4">
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-gray-300">
              Selected Model:{' '}
              <span className="font-bold text-accent">
                {activeVoiceName}
              </span>{' '}
              ({selectedLanguage === 'en' ? 'English' : 'Hindi'})
              {isChatterbox ? (
                <> • Expression: <span className="font-mono text-gray-300">{exaggeration.toFixed(2)}</span> • Pace: <span className="font-mono text-gray-300">{cfgWeight.toFixed(2)}</span></>
              ) : (
                <> • Rate: <span className="font-mono text-gray-300">{formattedRate}</span> • Pitch: <span className="font-mono text-gray-300">{formattedPitch}</span></>
              )}
            </div>


          </div>

          {/* Real-time Generation Progress Bar */}
          {sceneBacked && <div className="mt-3 rounded border border-border p-3 text-xs text-gray-300">
            Narration is linked to the scene map. Use Edit on a scene in Assets to change its words and matching visual. Completed scenes are reused when retrying with the same voice settings.
            {generating && <button className="ml-3 text-red-300" onClick={async () => {
              try {
                const response = await fetch(`/api/tts/long/cancel/${script.id}`, { method: 'POST' });
                if (!response.ok) throw new Error('Cancellation failed');
                setGenerating(false);
              } catch (error) { setError(getErrorMessage(error, 'Could not cancel narration')); }
            }}>Cancel after current voice request</button>}
          </div>}
          {generating && (
            <div className="w-full rounded-md border border-accent/30 bg-accent/5 p-4 transition-all">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 font-medium text-white">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                  {progressStage}
                </span>
                <span className="font-mono text-accent font-semibold">
                  {progressPercent}% (Elapsed: {progressElapsed}s)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface2">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent/70 via-accent to-accent transition-all duration-300 shadow-sm"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="mt-1 flex w-full items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Generated Audio Player */}
        {currentAudio && currentAudio.url && typeof currentAudio.url === 'string' && (
          <div className="mb-6 rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-medium text-gray-300">
                <Volume2 className="h-3.5 w-3.5 text-accent" />
                {selectedLanguage === 'en' ? 'English' : 'Hindi'} Audio Result
                {(currentAudio.voiceName || currentAudio.voice) && (
                  <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent font-semibold">
                    {currentAudio.voiceName || currentAudio.voice}
                  </span>
                )}
                {currentAudio.elapsedMs && (
                  <span className="text-gray-500">
                    (generated in {Math.round(currentAudio.elapsedMs / 1000)}s)
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={currentAudio.url}
                  download
                  className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] text-gray-300 hover:bg-surface2"
                >
                  <Download className="h-3 w-3" /> Download {currentAudio.filename.toLowerCase().endsWith('.wav') ? 'WAV' : 'MP3'}
                </a>

              </div>
            </div>
            <audio
              key={currentAudio.url}
              controls
              preload="auto"
              className="w-full"
              src={`${currentAudio.url}${currentAudio.url.includes('?') ? '&' : '?'}t=${Date.now()}`}
            >
              Your browser does not support the audio element.
            </audio>
          </div>
        )}
      </div>
    </div>
  );
}


