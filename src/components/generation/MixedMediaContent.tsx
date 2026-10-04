import { mediaScenes } from '../../../server/src/services/shorts-media';
import { useEffect, useRef, useState } from 'react';
import { Copy, Plus, Loader2, Sparkles, Square, Film, Image as ImageIcon } from 'lucide-react';
import type { Script } from '../../data';
import { useWorkspaceApi } from '../../services/workspaceApi';
import { GenerationDisclosure } from './GenerationDisclosure';

export function MixedMediaContent({ script, onUpdate }: { script: Script | null; onUpdate: (patch: Partial<Script>) => unknown }) {
  const { fetch, profile } = useWorkspaceApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [generating, setGenerating] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [stopping, setStopping] = useState(false);
  const [preset, setPreset] = useState<'fast' | 'standard' | 'high'>('standard');
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
  const missingImages = scenes.flatMap((scene, index) => scene.mediaType === 'image' && !script?.generatedImages?.some(asset =>
    asset.index === index && asset.prompt === scene.imagePrompt && (asset.mediaType || 'image') === 'image' && asset.status === 'done' && asset.url
  ) ? [index] : []);
  const missingVideos = scenes.flatMap((scene, index) => scene.mediaType === 'video' && !script?.generatedImages?.some(asset =>
    asset.index === index && asset.prompt === scene.imagePrompt && (asset.mediaType || 'image') === 'video' && asset.status === 'done' && asset.url
  ) ? [index] : []);

  async function refreshModelStatus() {
    setModelStatus('checking');
    try {
      const response = await fetch('/api/generate/status');
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

  async function startModel(): Promise<boolean> {
    if (locked || modelStatus === 'starting') return false;
    setModelStatus('starting'); setModelDetail('Starting the local image model…'); setError('');
    try {
      const response = await fetch('/api/generate/start', { method: 'POST' });
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

  async function stopModel() {
    if (locked || modelStatus === 'stopping') return;
    setModelStatus('stopping'); setModelDetail('Stopping the local image model…'); setError('');
    try {
      const response = await fetch('/api/generate/stop', { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Could not stop the image model.');
      setModelStatus('offline'); setModelDetail(result.message || 'Image model is stopped.');
    } catch (err) {
      setModelStatus('offline');
      setModelDetail(err instanceof Error ? err.message : 'Could not stop the image model.');
    }
  }

  useEffect(() => { void refreshModelStatus(); }, []);

  async function generateImages(indices: number[]) {
    if (!script || operation.current || !indices.length) return;
    // Preserve original scene indices; filtering must never move an image into a video slot.
    const queue = indices.filter(index => scenes[index]?.mediaType === 'image');
    if (!queue.length) return;
    operation.current = true; stopRequested.current = false;
    setGenerating(true); setStopping(false); setError(''); setNotice('Checking image model…');
    try {
      const online = await refreshModelStatus();
      if (!online && !stopRequested.current) {
        setNotice('Starting image model…');
        const started = await startModel();
        if (!started) throw new Error('The image model could not be started. Check the model status message above.');
        await refreshModelStatus();
      }
      let completed = 0;
      for (const index of queue) {
        if (stopRequested.current) break;
        setActiveIndex(index); setNotice(`Generating image ${completed + 1} of ${queue.length} · scene ${index + 1}…`);
        const response = await fetch('/api/generate/image', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scriptId: script.id, index, prompt: scenes[index].imagePrompt, preset }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(`Scene ${index + 1}: ${result.error || 'Image generation failed.'}`);
        // Each result is saved by the server, even when this page is closed.
        if (!mounted.current) return;
        await onUpdate({ generatedImages: result.generatedImages, timelineConfig: undefined, youtubeExport: undefined, facebookExport: undefined, instagramExport: undefined });
        completed++;
      }
      if (mounted.current) setNotice(`${stopRequested.current ? 'Stopped. ' : ''}Saved ${completed} of ${queue.length} images. Existing media was kept.`);
    } catch (err) {
      if (mounted.current) { setNotice(''); setError(err instanceof Error ? err.message : 'Image generation failed.'); }
    } finally {
      operation.current = false;
      if (mounted.current) { setGenerating(false); setActiveIndex(null); setStopping(false); }
    }
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
        const response = await fetch(`/api/media-import/${script.id}/${index}?extension=${extension}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
        const data = await response.json();
        if (!response.ok) throw new Error(`${file.name}: ${data.error || 'Import failed'}`);
        // Server has already saved the imported asset; sync the visible script.
        await onUpdate({ generatedImages: data.generatedImages, timelineConfig: undefined, youtubeExport: undefined, facebookExport: undefined, instagramExport: undefined });
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
        <p className="mt-1 text-xs text-gray-400">{imageCount} images / {videoCount} videos · {scenes.length - missingImages.length - missingVideos.length} of {scenes.length} ready{scenes.length ? ` (${Math.round((scenes.length - missingImages.length - missingVideos.length) / scenes.length * 100)}%)` : ''}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {generating ? <button disabled={stopping} onClick={() => { stopRequested.current = true; setStopping(true); }} className="studio-btn-ghost"><Square className="h-4 w-4" />{stopping ? 'Stopping after current job...' : 'Stop after current job'}</button> : <>
          <button disabled={locked || !missingImages.length || (modelStatus === 'starting' || modelStatus === 'stopping')} onClick={() => void generateImages(missingImages)} className="studio-btn-primary"><Sparkles className="h-4 w-4" />Generate images{missingImages.length ? ` (${missingImages.length})` : ''}</button>
        </>}
        <button disabled={locked || !scenes.length} className="studio-btn-ghost" onClick={() => { selectedIndex.current = null; if (fileInput.current) { fileInput.current.multiple = true; fileInput.current.accept = videoCount > 0 ? '.png,.jpg,.jpeg,.webp,.mp4' : '.png,.jpg,.jpeg,.webp'; fileInput.current.click(); } }}>Import media</button>
      </div>
    </div>
    <GenerationDisclosure title="Media settings" hint="Images: local model / Videos: import MP4" className="mb-5">
      <div className="flex flex-wrap items-center gap-4">
        <label className="text-xs text-gray-400">Quality <select aria-label="Image quality" value={preset} disabled={locked} onChange={event => setPreset(event.target.value as typeof preset)} className="ml-2 rounded-lg border border-border bg-bg px-3 py-2 text-white"><option value="fast">Fast</option><option value="standard">Standard</option><option value="high">High</option></select></label>
        <span role="status" className="text-xs text-gray-400">Image model: {modelStatus}</span>
        {modelStatus === 'online' ? <button disabled={locked} onClick={() => void stopModel()} className="studio-btn-ghost">Stop model</button> : <button disabled={locked || modelStatus !== 'offline'} onClick={() => void startModel()} className="studio-btn-ghost">{modelStatus === 'starting' ? 'Starting model...' : 'Start model'}</button>}
        <button disabled={locked || modelStatus === 'checking' || modelStatus === 'starting' || modelStatus === 'stopping'} onClick={() => void refreshModelStatus()} className="studio-btn-ghost">Refresh</button>
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
        const sceneRunning = activeIndex === index;
        return <article key={scene.id} className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex justify-between text-sm font-semibold text-white"><span>{String(index + 1).padStart(3, '0')} · {scene.chapter}</span><span className={type === 'video' ? 'text-purple-300' : 'text-blue-300'}>{type === 'video' ? 'Video' : 'Image'} · {spokenSeconds !== undefined ? `${spokenSeconds.toFixed(2)}s spoken` : 'Timing after narration'}</span></div>
          <div className={`relative flex ${profile === 'shorts' ? 'aspect-[9/16] max-h-[420px]' : 'aspect-video'} items-center justify-center overflow-hidden rounded-lg bg-black/40`}>
            {asset?.url ? type === 'video' ? <video src={asset.url} controls muted playsInline preload="metadata" className="h-full w-full object-contain" /> : <img src={asset.url} alt={`Scene ${index + 1}`} className="h-full w-full object-contain" /> : <div className="flex flex-col items-center gap-2 text-gray-500">
              {type === 'video' ? <Film className="h-8 w-8 text-purple-300/50" /> : <ImageIcon className="h-8 w-8 text-gray-600" />}
              <span className="text-sm">{type === 'video' ? 'Video scene' : 'Image scene'}</span>
              <span className="px-3 text-center text-xs">{type === 'video' ? 'Import an MP4' : 'Generate an image or import a still'}</span>
            </div>}
            {sceneRunning && <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 p-4 text-center text-purple-200"><Loader2 className="h-9 w-9 animate-spin" /><span className="text-sm font-medium">Generating image...</span></div>}
            <button disabled={locked} aria-label={`Add or replace ${type} for scene ${index + 1}`} title={`Add or replace ${type}`} className="absolute right-3 top-3 rounded-lg border border-white/10 bg-black/60 p-2 text-gray-200 hover:bg-black/80 disabled:opacity-40" onClick={() => { selectedIndex.current = index; if (fileInput.current) { fileInput.current.multiple = false; fileInput.current.accept = type === 'video' ? '.mp4' : '.png,.jpg,.jpeg,.webp'; fileInput.current.click(); } }}><Plus className="h-5 w-5" /></button>
          </div>
          <GenerationDisclosure title="Scene actions & prompt" className="mt-3">
          {type === 'image' && <button disabled={locked} onClick={() => void generateImages([index])} className="mt-3 flex items-center gap-2 rounded bg-accent/15 px-3 py-2 text-sm text-accent disabled:opacity-40">{activeIndex === index ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{activeIndex === index ? 'Generating image…' : asset ? 'Regenerate image' : 'Generate image'}</button>}
          <p className="mb-3 whitespace-pre-wrap text-xs leading-relaxed text-gray-400">{scene.imagePrompt}</p>
          <button className="mt-3 flex items-center gap-2 text-xs text-accent" onClick={() => { navigator.clipboard.writeText(scene.imagePrompt).then(() => setNotice(`Copied scene ${index + 1} prompt.`)).catch(() => setError('Could not copy. Select the prompt text and copy manually.')); }}><Copy className="h-3 w-3" />Copy prompt</button>
          </GenerationDisclosure>
          <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-gray-400">Narration: {scene.narration}</p>
        </article>;
      })}
    </div>
  </div>;
}
