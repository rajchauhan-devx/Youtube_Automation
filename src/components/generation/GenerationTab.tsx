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
} from 'lucide-react';
import type { Script, GeneratedImage, GeneratedAudio } from '../../data';

export function GenerationTab({
  script,
  onUpdate,
}: {
  script: Script | null;
  onUpdate: (patch: Partial<Script>) => void;
}) {
  const [generationSubTab, setGenerationSubTab] = useState<'images' | 'audio'>('images');

  return (
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

function AudioGenerationContent({
  script,
  onUpdate,
}: {
  script: Script | null;
  onUpdate: (patch: Partial<Script>) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<'hi' | 'en'>('en');
  const [voices, setVoices] = useState<any[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [previewVoiceId, setPreviewVoiceId] = useState<string | null>(null);
  
  const [generating, setGenerating] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressElapsed, setProgressElapsed] = useState(0);
  const [progressStage, setProgressStage] = useState('');
  
  const [error, setError] = useState('');
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [serverStarting, setServerStarting] = useState(false);

  const generatedAudio = script?.generatedAudio || [];

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  async function checkStatus() {
    const { data } = await fetchJson('/api/tts/status');
    setServerOnline(data?.online === true);
  }

  async function fetchVoices(lang: string) {
    try {
      const { data } = await fetchJson(`/api/tts/voices?language=${lang}`);
      const voiceList = Array.isArray(data?.voices) ? data.voices : [];
      setVoices(voiceList);
      if (voiceList.length > 0) {
        const firstVoiceId = typeof voiceList[0] === 'string' ? voiceList[0] : (voiceList[0]?.id || 'default');
        setSelectedVoice(firstVoiceId);
      } else {
        setSelectedVoice('');
      }
    } catch {
      setVoices([]);
      setSelectedVoice('');
    }
  }

  useEffect(() => {
    checkStatus();
  }, []);

  useEffect(() => {
    fetchVoices(selectedLanguage);
  }, [selectedLanguage]);

  function handleLanguageSwitch(lang: 'hi' | 'en') {
    setSelectedLanguage(lang);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setPreviewVoiceId(null);
    fetchVoices(lang);
  }

  async function handlePreviewVoice(v: any, e: React.MouseEvent) {
    e.stopPropagation();
    const vId = typeof v === 'string' ? v : (v?.id || 'voice');

    if (previewVoiceId === vId) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setPreviewVoiceId(null);
      return;
    }

    setPreviewVoiceId(vId);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    try {
      const res = await fetch('/api/tts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: vId, language: selectedLanguage }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          setPreviewVoiceId(null);
          URL.revokeObjectURL(url);
          audioRef.current = null;
        };
        audio.onerror = () => {
          setPreviewVoiceId(null);
          URL.revokeObjectURL(url);
          audioRef.current = null;
        };

        await audio.play();
        return;
      }
    } catch {}

    // Fallback: Speech Synthesis with character pitch
    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();

      const sampleText = typeof v === 'object' && v?.sampleText
        ? v.sampleText
        : (vId === 'hi_female' ? 'नमस्ते! मैं अनन्या हूँ, यह मेरी आवाज़ का नमूना है।'
          : vId === 'hi_male' ? 'नमस्ते! मैं रोहन हूँ, यह मेरी आवाज़ का नमूना है।'
          : vId === 'hi_female_casual' ? 'हे दोस्तों! मैं प्रिया हूँ, यह मेरी आवाज़ का नमूना है।'
          : vId === 'hi_male_deep' ? 'नमस्कार! मैं विक्रम हूँ, यह मेरी आवाज़ का नमूना है।'
          : selectedLanguage === 'hi' ? 'नमस्ते! यह हिंदी वॉयस सैंपल है।'
          : 'Hello! Welcome to OmniVoice audio generation.');

      const utterance = new SpeechSynthesisUtterance(sampleText);
      utteranceRef.current = utterance;

      const sysVoices = window.speechSynthesis.getVoices();
      const targetLang = selectedLanguage === 'hi' ? 'hi' : 'en';
      const langVoices = sysVoices.filter((sv) => sv.lang.toLowerCase().includes(targetLang));

      const isFemale = typeof v === 'object' && v?.gender === 'female';
      const isMale = typeof v === 'object' && v?.gender === 'male';

      if (langVoices.length > 0) {
        const genderMatch = langVoices.find((sv) => 
          isFemale ? (sv.name.toLowerCase().includes('female') || sv.name.toLowerCase().includes('zira') || sv.name.toLowerCase().includes('kalpana') || sv.name.toLowerCase().includes('swara') || sv.name.toLowerCase().includes('google'))
          : isMale ? (sv.name.toLowerCase().includes('male') || sv.name.toLowerCase().includes('david') || sv.name.toLowerCase().includes('mark') || sv.name.toLowerCase().includes('hemant') || sv.name.toLowerCase().includes('madhur'))
          : true
        );
        utterance.voice = genderMatch || langVoices[0];
      }

      utterance.lang = selectedLanguage === 'hi' ? 'hi-IN' : 'en-US';

      if (isFemale) {
        utterance.pitch = 1.25;
        utterance.rate = 1.0;
      } else if (isMale) {
        utterance.pitch = 0.8;
        utterance.rate = 0.95;
      } else {
        utterance.pitch = 1.0;
        utterance.rate = 1.0;
      }

      utterance.onend = () => {
        setPreviewVoiceId(null);
        utteranceRef.current = null;
      };
      utterance.onerror = () => {
        setPreviewVoiceId(null);
        utteranceRef.current = null;
      };

      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
      }, 50);
    } else {
      setPreviewVoiceId(null);
    }
  }

  async function fetchJson(path: string, options?: RequestInit): Promise<any> {
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
      const { ok, data } = await fetchJson('/api/tts/start', { method: 'POST' });
      if (data?.success) {
        setServerOnline(true);
      } else {
        setServerOnline(false);
        setError(data?.message || 'Failed to start OmniVoice');
      }
    } catch (err: any) {
      setServerOnline(false);
      setError(err.message || 'Could not reach the server');
    } finally {
      setServerStarting(false);
    }
  }

  async function handleStopServer() {
    setServerOnline(false);
    setServerStarting(false);
    try {
      await fetch('/api/tts/stop', { method: 'POST' });
    } catch {}
  }

  function handleCopy() {
    if (script?.narration) {
      navigator.clipboard.writeText(script.narration).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  async function handleGenerate() {
    if (!script?.narration || generating) return;
    setGenerating(true);
    setError('');
    setProgressPercent(5);
    setProgressElapsed(0);
    setProgressStage('Initializing OmniVoice neural model...');

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
          setProgressStage('Encoding WAV audio stream & finalizing file...');
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
          text: script.narration,
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
        url: data.publicUrl,
        filename: data.filename,
        elapsedMs: data.elapsedMs,
      };

      const existing = generatedAudio.filter((a) => a.language !== selectedLanguage);
      onUpdate({ generatedAudio: [...existing, entry] });
    } catch (err: any) {
      setError(err.message || 'Failed to generate audio');
    } finally {
      clearInterval(timer);
      setGenerating(false);
    }
  }

  function handleRegenerate() {
    const existing = generatedAudio.filter((a) => a.language !== selectedLanguage);
    onUpdate({ generatedAudio: existing });
    handleGenerate();
  }

  const currentAudio = generatedAudio.find((a) => a.language === selectedLanguage);
  const activeVoiceObj = voices.find((v: any) => (typeof v === 'string' ? v === selectedVoice : v?.id === selectedVoice));
  const activeVoiceName = typeof activeVoiceObj === 'string' ? activeVoiceObj : (activeVoiceObj?.name || selectedVoice || 'Default Voice');

  if (!script) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        No script selected.
      </div>
    );
  }

  if (!script.narration) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-500">
        <Music className="mb-3 h-8 w-8 text-gray-600" />
        <p className="text-sm">No narration script available.</p>
        <p className="mt-1 text-xs">Extract assets first from the Preview tab to generate a narration script.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Music className="h-4 w-4 text-gray-400" />
          <h3 className="text-sm font-semibold">Audio Generation (OmniVoice)</h3>
          {serverOnline === true && (
            <span className="flex items-center gap-1.5 text-[10px] text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" /> OmniVoice connected
            </span>
          )}
          {serverOnline === false && (
            <span className="flex items-center gap-1.5 text-[10px] text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> OmniVoice offline
            </span>
          )}
          {serverStarting && (
            <span className="flex items-center gap-1.5 text-[10px] text-accent">
              <span className="h-1.5 w-1.5 animate-spin rounded-full border-2 border-accent border-t-transparent" /> Starting OmniVoice...
            </span>
          )}
        </div>
        {serverOnline === true && (
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
              <p className="font-medium">OmniVoice model server is offline</p>
              <p className="mt-1 text-red-300/80">
                {error || 'Start OmniVoice to run voice synthesis locally.'}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={checkOrStartServer}
                  className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-[11px] font-medium text-white hover:bg-accent/80"
                >
                  <Zap className="h-3.5 w-3.5" />
                  Start OmniVoice Server
                </button>
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
              2. Select Voice Model ({selectedLanguage === 'en' ? 'English' : 'Hindi'})
            </label>
            <span className="text-[11px] text-gray-500">
              {voices.length} voice models available
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {voices.map((v: any, idx: number) => {
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
                      {vTags.map((t: any) => (
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

                  <div className="pt-2 border-t border-border/40 flex items-center justify-between mt-auto">
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
                    <span className="text-[10px] text-gray-500 font-mono">
                      {selectedLanguage.toUpperCase()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
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
        {currentAudio && (
          <div className="mb-6 rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-medium text-gray-300">
                <Volume2 className="h-3.5 w-3.5 text-accent" />
                {selectedLanguage === 'en' ? 'English' : 'Hindi'} Audio Result
                {currentAudio.voice && (
                  <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">
                    {currentAudio.voice}
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
            <audio controls className="w-full" src={currentAudio.url}>
              Your browser does not support the audio element.
            </audio>
          </div>
        )}

        {/* Narration Script View */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-medium text-gray-300">
              <Copy className="h-3.5 w-3.5 text-gray-400" />
              Narration Script
            </span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2"
            >
              {copied ? 'Copied!' : 'Copy Script'}
            </button>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
            {script.narration}
          </p>
        </div>
      </div>
    </div>
  );
}

