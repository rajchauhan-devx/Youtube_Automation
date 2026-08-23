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
} from 'lucide-react';
import type { Script, GeneratedImage, GeneratedAudio } from '../../data';
import { ErrorBoundary } from '../ErrorBoundary';

export function GenerationTab({
  script,
  onUpdate,
}: {
  script: Script | null;
  onUpdate: (patch: Partial<Script>) => void;
}) {
  const [generationSubTab, setGenerationSubTab] = useState<'images' | 'audio'>('images');

  return (
    <ErrorBoundary fallbackLabel="Generation Tab Error">
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-4 border-b border-border px-4">
          <button
            onClick={() => setGenerationSubTab('images')}
            className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              generationSubTab === 'images'
                ? 'border-accent text-white'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <ImageIcon className="h-4 w-4" />
            Image Generation
          </button>
          <button
            onClick={() => setGenerationSubTab('audio')}
            className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              generationSubTab === 'audio'
                ? 'border-accent text-white'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Music className="h-4 w-4" />
            Audio Generation
          </button>
        </div>

        {generationSubTab === 'images' ? (
          <ImageGenerationContent script={script} onUpdate={onUpdate} />
        ) : (
          <AudioGenerationContent script={script} onUpdate={onUpdate} />
        )}
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
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline' | 'starting'>('checking');
  const [serverError, setServerError] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);

  const runTokenRef = useRef(0);
  const pausedRef = useRef(false);
  const imagesRef = useRef<GeneratedImage[]>([]);

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
    setImages(merged);
  }, [script?.id, script?.imagePrompts]);

  async function checkServer() {
    setServerStatus('checking');
    const status = await fetch('/api/generate/status')
      .then((r) => r.json())
      .catch((err) => ({ online: false, detail: err.message }));
    setServerStatus(status.online ? 'online' : 'offline');
    setServerError(status.detail || '');
    return status.online as boolean;
  }

  useEffect(() => {
    checkServer();
  }, []);

  function updateImage(index: number, patch: Partial<GeneratedImage>) {
    const next = imagesRef.current.map((im) => (im.index === index ? { ...im, ...patch } : im));
    imagesRef.current = next;
    setImages(next);
    onUpdate({ generatedImages: next });
  }

  async function generateOne(item: GeneratedImage) {
    if (!script) return;
    updateImage(item.index, { status: 'generating', error: undefined, errorCode: undefined });
    try {
      const res = await fetch('/api/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId: script.id, index: item.index, prompt: item.prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data.error || 'Generation failed'), { code: data.code });
      updateImage(item.index, {
        status: 'done',
        url: data.url,
        seed: data.seed,
        elapsedMs: data.elapsedMs,
        attempts: (item.attempts || 0) + 1,
      });
    } catch (err: any) {
      updateImage(item.index, {
        status: 'error',
        error: err.message || 'Unknown error',
        errorCode: err.code,
        attempts: (item.attempts || 0) + 1,
      });
    }
  }

  async function runQueue(items: GeneratedImage[]) {
    const myToken = ++runTokenRef.current;
    setIsRunning(true);
    for (const item of items) {
      if (myToken !== runTokenRef.current) return;
      if (item.status === 'done') continue;
      while (pausedRef.current) {
        await new Promise((r) => setTimeout(r, 300));
        if (myToken !== runTokenRef.current) return;
      }
      await generateOne(item);
    }
    if (myToken === runTokenRef.current) setIsRunning(false);
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
    } catch (err: any) {
      setServerStatus('offline');
      setServerError(err.message || 'Could not reach the server');
    }
  }

  async function handleStopModel() {
    setServerStatus('offline');
    try {
      await fetch('/api/generate/stop', { method: 'POST' });
    } catch {
      // ignore
    }
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
      } catch (err: any) {
        setServerStatus('offline');
        setServerError(err.message || 'Could not reach the server');
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

  function handleCancel() {
    runTokenRef.current++;
    setIsRunning(false);
    setIsPaused(false);
    const generating = imagesRef.current.find((im) => im.status === 'generating');
    if (generating && script) {
      fetch('/api/generate/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId: script.id, index: generating.index }),
      }).catch(() => {});
      updateImage(generating.index, { status: 'pending' });
    }
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
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-semibold">Image Generation</h3>
          <span className="text-xs text-gray-500">
            {doneCount}/{images.length} done{errorCount > 0 ? `, ${errorCount} failed` : ''}
          </span>
          {serverStatus === 'online' && (
            <span className="flex items-center gap-1.5 text-[10px] text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" /> FLUX.2 Klein server online
            </span>
          )}
          {serverStatus === 'offline' && (
            <span className="flex items-center gap-1.5 text-[10px] text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> Server offline
            </span>
          )}
          {serverStatus === 'starting' && (
            <span className="flex items-center gap-1.5 text-[10px] text-accent">
              <span className="h-1.5 w-1.5 animate-spin rounded-full border-2 border-accent border-t-transparent" /> Starting model...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {serverStatus === 'online' && (
            <button
              onClick={handleStopModel}
              className="flex items-center gap-1.5 rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
            >
              <Square className="h-3.5 w-3.5" /> Stop Model
            </button>
          )}
          {!isRunning ? (
            <button
              onClick={handleStart}
              disabled={serverStatus === 'starting' || doneCount === images.length}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/80 disabled:opacity-40"
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
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleStartModel}
                className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-[11px] font-medium text-white hover:bg-accent/80"
              >
                <Zap className="h-3.5 w-3.5" />
                Run Image Model
              </button>
              <button onClick={checkServer} className="rounded border border-red-500/40 px-2 py-1 text-[11px] hover:bg-red-500/10">
                Retry connection
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
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
}

function AudioGenerationContent({
  script,
  onUpdate,
}: {
  script: Script | null;
  onUpdate: (patch: Partial<Script>) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<'hi' | 'en'>('en');
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [previewVoiceId, setPreviewVoiceId] = useState<string | null>(null);
  const [previewSource, setPreviewSource] = useState<'server' | 'system' | null>(null);
  const [previewError, setPreviewError] = useState('');

  const [generating, setGenerating] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressElapsed, setProgressElapsed] = useState(0);
  const [progressStage, setProgressStage] = useState('');

  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [serverStarting, setServerStarting] = useState(false);
  const [providerName, setProviderName] = useState('OpenRouter TTS');
  const [error, setError] = useState('');

  const [narrationText, setNarrationText] = useState<string>(
    script?.narration || 'Welcome back to Pixel Pulse! Today we are exploring incredible breakthroughs in artificial intelligence and automation that will re-define how content is created in 2026. Subscribe for daily tech updates!'
  );

  useEffect(() => {
    if (script?.narration) {
      setNarrationText(script.narration);
    }
  }, [script?.id, script?.narration]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const previewVoiceIdRef = useRef<string | null>(null);
  const fetchTokenRef = useRef(0);
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Preload browser speech synthesis voices on mount
  // getVoices() returns [] on first call in Chrome — must wait for onvoiceschanged
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;

    function loadSystemVoices() {
      const sv = window.speechSynthesis.getVoices();
      if (sv.length > 0) setSystemVoices(sv);
    }

    // Try immediately (works in Firefox / already-loaded)
    loadSystemVoices();

    // Also listen for the async event (Chrome/Edge)
    window.speechSynthesis.onvoiceschanged = loadSystemVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const generatedAudio = script?.generatedAudio || [];
  const isCloudProvider = providerName !== 'OmniVoice';

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
    setPreviewSource(null);
  }

  // Cleanup preview audio on unmount
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
      setServerOnline(data?.online === true);
      if (data?.provider) setProviderName(String(data.provider));
    } catch {
      setServerOnline(false);
    }
  }

  async function fetchVoices(lang: string) {
    const token = ++fetchTokenRef.current;
    setVoicesLoading(true);
    try {
      const { data } = await fetchJson(`/api/tts/voices?language=${lang}`);
      if (token !== fetchTokenRef.current) return;
      const voiceList = Array.isArray(data?.voices) ? data.voices : [];
      setVoices(voiceList);
      setSelectedVoice((prev) => {
        if (voiceList.some((v: VoiceItem) => v?.id === prev)) return prev;
        return voiceList[0]?.id || '';
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

    // Toggle off if already playing this voice
    if (previewVoiceId === vId) {
      stopPreview();
      return;
    }

    stopPreview();
    setPreviewError('');
    setPreviewVoiceId(vId);
    previewVoiceIdRef.current = vId;

    // 1) Try server-side preview first ({providerName} renders the real character voice)
    try {
      const res = await fetch('/api/tts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: vId, language: selectedLanguage }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('audio')) {
        const blob = await res.blob();
        if (previewVoiceIdRef.current !== vId) return;
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        setPreviewSource('server');

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
    } catch {
      // Server unreachable — fall through to system voice preview below
    }

    // 2) Fallback: browser speech synthesis with the character's own sample text.
    //    Only used when a voice for the target language exists — never a silent wrong voice.
    if (!playSystemPreview(v, vId)) {
      stopPreview();
      setPreviewError(
        selectedLanguage === 'hi'
          ? `${providerName} is unavailable and no Hindi system voice is installed. ${isCloudProvider ? 'Check the connection and try again.' : 'Start OmniVoice, or install a Hindi voice (e.g. Microsoft Heera) in Windows voice settings.'}`
          : `${providerName} is unavailable and no suitable English system voice is available. ${isCloudProvider ? 'Check the connection and try again.' : 'Start OmniVoice to hear accurate character previews.'}`
      );
    }
  }

  function playSystemPreview(v: VoiceItem, vId: string): boolean {
    if (!('speechSynthesis' in window)) return false;
    const sysVoices = systemVoices.length > 0 ? systemVoices : window.speechSynthesis.getVoices();
    if (!sysVoices || sysVoices.length === 0) return false;

    const targetLang = selectedLanguage === 'hi' ? 'hi' : 'en';

    // 1st choice: voices of the target language
    let langPool = sysVoices.filter((sv) => sv.lang.toLowerCase().startsWith(targetLang));
    // 2nd choice for Hindi: Indian-accented voices (en-IN)
    if (langPool.length === 0 && selectedLanguage === 'hi') {
      langPool = sysVoices.filter((sv) => sv.lang.toLowerCase().includes('in'));
    }
    // Only fall back to English voices for Hindi if the browser cannot pronounce Hindi at all — still label it
    if (langPool.length === 0 && selectedLanguage === 'hi') {
      langPool = sysVoices.filter((sv) => sv.lang.toLowerCase().startsWith('en'));
    }
    if (langPool.length === 0) return false;

    const gender = typeof v === 'object' ? String(v.gender || '').toLowerCase() : '';
    const femaleKeywords = ['female', 'zira', 'kalpana', 'swara', 'heera', 'sabina', 'hazel', 'susan', 'google', 'heami', 'huihui'];
    const maleKeywords = ['male', 'david', 'mark', 'hemant', 'madhur', 'ravi', 'george', 'james', 'richard', 'daniel'];

    let genderPool = langPool;
    if (gender === 'female') {
      const f = langPool.filter((sv) => femaleKeywords.some((kw) => sv.name.toLowerCase().includes(kw)));
      if (f.length > 0) genderPool = f;
    } else if (gender === 'male') {
      const m = langPool.filter((sv) => maleKeywords.some((kw) => sv.name.toLowerCase().includes(kw)));
      if (m.length > 0) genderPool = m;
    }

    // Deterministic: same character always maps to the same system voice
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
    utterance.pitch = typeof v === 'object' && typeof v?.pitch === 'number' ? v.pitch : 1.0;
    utterance.rate = gender === 'male' ? 0.92 : 1.0;
    utteranceRef.current = utterance;
    setPreviewSource('system');

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

    // Delay to ensure cancel() has taken effect before speaking
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
        setServerOnline(true);
        fetchVoices(selectedLanguage);
      } else {
        setServerOnline(false);
        setError(data?.message || 'Failed to start OmniVoice');
      }
    } catch (err) {
      setServerOnline(false);
      setError(err instanceof Error ? err.message : 'Could not reach the server');
    } finally {
      setServerStarting(false);
    }
  }

  async function handleStopServer() {
    setServerOnline(false);
    setServerStarting(false);
    stopPreview();
    try {
      await fetch('/api/tts/stop', { method: 'POST' });
    } catch {
      // ignore
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
    if (!selectedVoice) {
      setError('Please select a voice character first.');
      return;
    }
    setGenerating(true);
    setError('');
    setPreviewError('');
    setProgressPercent(5);
    setProgressElapsed(0);
    setProgressStage(isCloudProvider ? `Calling ${providerName}...` : 'Initializing OmniVoice neural model...');

    const timer = setInterval(() => {
      setProgressElapsed((prev) => prev + 1);
      setProgressPercent((prev) => {
        if (prev < 30) {
          setProgressStage('Synthesizing voice audio & pitch contours...');
          return prev + 6;
        } else if (prev < 70) {
          setProgressStage('Rendering neural speech tokens...');
          return prev + 4;
        } else if (prev < 92) {
          setProgressStage('Encoding audio stream & finalizing file...');
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
        }),
      });

      if (!ok) throw new Error(data?.error || 'Generation failed');

      setProgressPercent(100);
      setProgressStage('Voice synthesis complete!');
      await new Promise((r) => setTimeout(r, 400));

      const entry: GeneratedAudio = {
        language: selectedLanguage,
        voice: selectedVoice,
        voiceName: activeVoiceObj?.name || selectedVoice,
        url: data.publicUrl,
        filename: data.filename,
        elapsedMs: data.elapsedMs,
      };

      const existing = (script.generatedAudio || []).filter((a) => a.language !== selectedLanguage);
      onUpdate({ generatedAudio: [...existing, entry] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate audio');
    } finally {
      clearInterval(timer);
      setGenerating(false);
    }
  }

  function handleRegenerate() {
    if (!script) return;
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
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
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
          {serverStarting && (
            <span className="flex items-center gap-1.5 text-[10px] text-accent">
              <span className="h-1.5 w-1.5 animate-spin rounded-full border-2 border-accent border-t-transparent" /> Starting OmniVoice...
            </span>
          )}
        </div>
        {serverOnline === true && !isCloudProvider && (
          <button
            onClick={handleStopServer}
            className="flex items-center gap-1.5 rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
          >
            <Square className="h-3.5 w-3.5" /> Stop Server
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {serverStarting && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-accent/30 bg-accent/10 p-3 text-xs text-accent">
            <span className="mt-0.5 h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <div>
              <p className="font-medium">Starting OmniVoice Server...</p>
              <p className="mt-1 text-accent/80">Launching local TTS server on port 3900...</p>
            </div>
          </div>
        )}

        {serverOnline === false && !serverStarting && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">{providerName} is unavailable</p>
              <p className="mt-1 text-red-300/80">
                {isCloudProvider
                  ? error || 'Check your internet connection and try again.'
                  : error || 'Start OmniVoice to run voice synthesis locally.'}
              </p>
              <div className="mt-2 flex gap-2">
                {!isCloudProvider && (
                  <button
                    onClick={checkOrStartServer}
                    className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-[11px] font-medium text-white hover:bg-accent/80"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Start OmniVoice Server
                  </button>
                )}
                <button
                  onClick={checkStatus}
                  className="rounded border border-red-500/40 px-2 py-1 text-[11px] hover:bg-red-500/10"
                >
                  Check status
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Language Selection */}
        <div className="mb-6 rounded-lg border border-border bg-surface p-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-400">
            1. Select Generation Language
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleLanguageSwitch('en')}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-xs font-medium transition-all ${
                selectedLanguage === 'en'
                  ? 'bg-accent text-white shadow-md'
                  : 'border border-border bg-surface2 text-gray-300 hover:text-white'
              }`}
            >
              🇺🇸 English (EN)
            </button>
            <button
              onClick={() => handleLanguageSwitch('hi')}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-xs font-medium transition-all ${
                selectedLanguage === 'hi'
                  ? 'bg-accent text-white shadow-md'
                  : 'border border-border bg-surface2 text-gray-300 hover:text-white'
              }`}
            >
              🇮🇳 Hindi (HI)
            </button>
          </div>
        </div>

        {/* Step 2: Voice Model Selection */}
        <div className="mb-6 rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              2. Select Voice Character ({selectedLanguage === 'en' ? 'English' : 'Hindi'})
            </label>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-500">
                {voicesLoading ? 'Loading voices...' : `${voices.length} character${voices.length === 1 ? '' : 's'} available`}
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
              Fetching available voice characters...
            </div>
          ) : voices.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface2/50 py-6 text-center text-xs text-gray-400">
              <Volume2 className="h-5 w-5 text-gray-600" />
              <p>No voice characters found for {selectedLanguage === 'en' ? 'English' : 'Hindi'}.</p>
              <p className="text-[11px] text-gray-500">
                {isCloudProvider ? 'Check your connection and try Refresh.' : 'Start the OmniVoice server and try Refresh.'}
              </p>
            </div>
          ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                  onClick={() => setSelectedVoice(vId)}
                  className={`relative cursor-pointer rounded-lg border p-3.5 transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'border-accent bg-accent/10 shadow-lg ring-1 ring-accent/50'
                      : 'border-border bg-surface2/50 hover:border-gray-500 hover:bg-surface2'
                  }`}
                >
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-semibold text-white truncate pr-2">{vName}</span>
                      {isSelected && (
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </div>

                    <div className="mb-2 flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
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
                        className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-medium transition-all ${
                          isPlayingPreview
                            ? 'bg-accent text-white animate-pulse'
                            : 'border border-accent/40 text-accent hover:bg-accent/20'
                        }`}
                      >
                        {isPlayingPreview ? (
                          <>
                            <Volume2 className="h-3.5 w-3.5 animate-bounce" />
                            Playing...
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3 fill-current" />
                            Listen Voice
                          </>
                        )}
                      </button>
                      <span className="flex items-center gap-1.5">
                        {isPlayingPreview && previewSource === 'server' && (
                          <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-[9px] font-medium text-green-400">
                            {providerName}
                          </span>
                        )}
                        {isPlayingPreview && previewSource === 'system' && (
                          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-400">
                            System Voice
                          </span>
                        )}
                        <span className="text-[10px] text-gray-500 font-mono">
                          {selectedLanguage.toUpperCase()}
                        </span>
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
        </div>

        {/* Step 3: Start Generation Action & Progress Bar */}
        <div className="mb-6 flex flex-col items-start gap-4 rounded-lg border border-border bg-surface p-4">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            3. Start Voice Generation
          </label>

          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-gray-300">
              Selected Model:{' '}
              <span className="font-semibold text-accent">
                {activeVoiceName}
              </span>{' '}
              ({selectedLanguage === 'en' ? 'English' : 'Hindi'})
            </div>

            <button
              onClick={currentAudio ? handleRegenerate : handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-xs font-semibold text-white transition-all hover:bg-accent/80 shadow-md disabled:opacity-40"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating Audio ({progressPercent}%)...
                </>
              ) : currentAudio ? (
                <>
                  <Undo2 className="h-4 w-4" />
                  Start Re-generation ({selectedLanguage.toUpperCase()})
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  Start Audio Generation
                </>
              )}
            </button>
          </div>

          {/* Real-time Generation Progress Bar */}
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

        {/* Generated Audio Audio Player */}
        {currentAudio && currentAudio.url && typeof currentAudio.url === 'string' && (
          <div className="mb-6 rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-medium text-gray-300">
                <Volume2 className="h-3.5 w-3.5 text-accent" />
                {selectedLanguage === 'en' ? 'English' : 'Hindi'} Audio Result
                {(currentAudio.voiceName || currentAudio.voice) && (
                  <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">
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
                  <Download className="h-3 w-3" /> Download WAV
                </a>
                <a
                  href={currentAudio.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] text-gray-300 hover:bg-surface2"
                >
                  <Play className="h-3 w-3" /> Open in Browser
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

        {/* Narration Script View & Editor */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-medium text-gray-300">
              <Copy className="h-3.5 w-3.5 text-gray-400" />
              Narration Script (Editable)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (script?.id) {
                    onUpdate({ narration: narrationText });
                  }
                }}
                className="flex items-center gap-1.5 rounded-md bg-accent/20 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/30"
              >
                Save Script
              </button>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1 text-xs text-gray-300 hover:bg-surface2"
              >
                {copied ? 'Copied!' : 'Copy Script'}
              </button>
            </div>
          </div>
          <textarea
            value={narrationText}
            onChange={(e) => {
              setNarrationText(e.target.value);
              if (script?.id) {
                onUpdate({ narration: e.target.value });
              }
            }}
            rows={4}
            className="w-full rounded-md border border-border bg-surface2 p-3 text-sm leading-relaxed text-gray-200 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            placeholder="Type or paste narration script text here to generate audio..."
          />
        </div>
      </div>
    </div>
  );
}

