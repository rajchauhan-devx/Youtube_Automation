import fs from 'fs';

const filePath = 'c:/Users/zrajc/Youtube_Automation/src/App.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Update TABS
content = content.replace(
  `const TABS: { id: Tab; label: string }[] = [\n  { id: 'scripts', label: 'Scripts' },\n  { id: 'preview', label: 'Preview' },\n  { id: 'assets', label: 'Assets' },\n  { id: 'editor', label: 'Editor' },\n  { id: 'export', label: 'Export' },\n];`,
  `const TABS: { id: Tab; label: string }[] = [\n  { id: 'scripts', label: 'Scripts' },\n  { id: 'preview', label: 'Preview' },\n  { id: 'assets', label: 'Assets' },\n  { id: 'generation', label: 'Generation' },\n  { id: 'editor', label: 'Editor' },\n  { id: 'export', label: 'Export' },\n];`
);

// 2. Add RefreshCw to imports if missing
if (!content.includes('RefreshCw,')) {
  content = content.replace('AlertCircle,', 'AlertCircle,\n  RefreshCw,');
}

// 3. Add tab === 'generation' rendering
const tabRenderTarget = `{tab === 'assets' && <AssetsTab data={data} section={section} />}`;
const tabRenderReplacement = `{tab === 'assets' && <AssetsTab data={data} section={section} onProceedToGeneration={() => setTab('generation')} />}\n                {tab === 'generation' && selectedScript && (\n                  <GenerationTab script={selectedScript} onUpdate={(patch) => updateScript(selectedScript.id, patch)} />\n                )}`;

content = content.replace(tabRenderTarget, tabRenderReplacement);

// 4. Append GenerationTab component code
const generationTabCode = `
/* ============ GENERATION TAB (FLUX.2 Klein / ComfyUI) ============ */

interface GeneratedImage {
  index: number;
  prompt: string;
  status: 'pending' | 'generating' | 'done' | 'error';
  url?: string;
  seed?: number;
  error?: string;
  errorCode?: string;
  attempts?: number;
  elapsedMs?: number;
}

function GenerationTab({
  script,
  onUpdate,
}: {
  script: Script;
  onUpdate: (patch: Partial<Script>) => void;
}) {
  const defaultPrompts: string[] = useMemo(() => {
    if (script.imagePrompts && script.imagePrompts.length > 0) return script.imagePrompts;
    return [
      \`Atmospheric cinematic scene for topic: \${script.topicName || script.name}, photorealistic depth\`,
      \`Detailed macro shot, epic dramatic lighting, hyperrealistic details\`,
      \`Wide dynamic landscape framing, masterpiece cinematic atmosphere\`,
    ];
  }, [script]);

  const [images, setImages] = useState<GeneratedImage[]>(() => {
    if (script.generatedImages && script.generatedImages.length > 0) return script.generatedImages;
    return defaultPrompts.map((prompt, idx) => ({
      index: idx,
      prompt,
      status: 'pending',
    }));
  });

  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  const imagesRef = useRef(images);
  imagesRef.current = images;

  const pausedRef = useRef(isPaused);
  pausedRef.current = isPaused;

  const runTokenRef = useRef(0);

  const checkServer = useCallback(async () => {
    setServerStatus('checking');
    try {
      const res = await fetch('/api/generate/status');
      const data = await res.json();
      if (data.online) {
        setServerStatus('online');
      } else {
        setServerStatus('offline');
      }
    } catch {
      setServerStatus('offline');
    }
  }, []);

  useEffect(() => {
    checkServer();
    const interval = setInterval(checkServer, 5000);
    return () => clearInterval(interval);
  }, [checkServer]);

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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      const errorCode = err instanceof Error && 'code' in err ? (err as { code: string }).code : undefined;
      updateImage(item.index, {
        status: 'error',
        error: errorMessage,
        errorCode,
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
    if (myToken === runTokenRef.current) {
      setIsRunning(false);
      setIsPaused(false);
    }
  }

  function handleStart() {
    setIsPaused(false);
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
  }

  function handleRetryFailed() {
    const failed = imagesRef.current.filter((im) => im.status === 'error');
    if (failed.length === 0) return;
    setIsPaused(false);
    runQueue(failed);
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

  const doneCount = images.filter((i) => i.status === 'done').length;
  const errorCount = images.filter((i) => i.status === 'error').length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-semibold">Image Generation</h3>
          <span className="text-xs text-gray-500">
            {doneCount}/{images.length} done{errorCount > 0 ? \`, \${errorCount} failed\` : ''}
          </span>
          {serverStatus === 'online' && (
            <span className="flex items-center gap-1.5 text-[10px] text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" /> FLUX.2 Klein server online
            </span>
          )}
          {serverStatus === 'offline' && (
            <span className="flex items-center gap-1.5 text-[10px] text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Server Offline (Manual Run Required)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {serverStatus === 'offline' && (
            <button
              onClick={checkServer}
              className="flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Check / Connect Image Server
            </button>
          )}

          {serverStatus === 'online' && (!isRunning ? (
            <button
              onClick={handleStart}
              disabled={doneCount === images.length}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/80 disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5" />
              {doneCount === 0 ? 'Start Generation' : 'Resume Generation'}
            </button>
          ) : isPaused ? (
            <button onClick={handleResume} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/80">
              <Play className="h-3.5 w-3.5" /> Resume
            </button>
          ) : (
            <button onClick={handlePause} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2">
              <Pause className="h-3.5 w-3.5" /> Pause
            </button>
          ))}
          {isRunning && (
            <button onClick={handleCancel} className="flex items-center gap-1.5 rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10">
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          )}
          {!isRunning && errorCount > 0 && (
            <button onClick={handleRetryFailed} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2">
              <RefreshCw className="h-3.5 w-3.5" /> Retry Failed ({errorCount})
            </button>
          )}
        </div>
      </div>

      {serverStatus === 'offline' && (
        <div className="mx-4 mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="flex-1">
              <p className="font-medium text-amber-300">Image Generation Server Not Connected</p>
              <p className="mt-1 text-amber-200/80">To run image generation locally, start ComfyUI in your terminal:</p>
              <div className="mt-2 font-mono text-[11px] bg-black/40 p-2 rounded text-emerald-400 select-all border border-amber-500/20">
                cd ComfyUI ; python main.py --listen 127.0.0.1 --port 8188 --cpu
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button onClick={checkServer} className="rounded bg-amber-600/80 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-600">
                  Click here once server is running
                </button>
              </div>
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
                {img.status === 'pending' && (
                  <span className="rounded-full bg-gray-500/10 px-2 py-0.5 text-[10px] text-gray-400">Pending</span>
                )}
                {img.status === 'generating' && (
                  <span className="flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Rendering...
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
                    alt={\`Generated \${img.index + 1}\`}
                    className="h-full w-full cursor-pointer object-cover"
                    onClick={() => setLightbox(img.url!)}
                  />
                ) : img.status === 'generating' ? (
                  <div className="flex flex-col items-center gap-2 text-gray-500">
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                    <span className="text-[10px]">Rendering image...</span>
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
`;

content += '\n' + generationTabCode;
fs.writeFileSync(filePath, content, 'utf-8');
console.log('Appended GenerationTab successfully!');
