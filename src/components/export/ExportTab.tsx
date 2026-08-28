import { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Maximize,
  FileVideo,
  Download,
  Copy,
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle,
  Sparkles,
  Clapperboard,
} from 'lucide-react';
import { Field } from '../layout/Field';
import type { Section, Script, GeneratedImage } from '../../data';

function urlToServerPath(url: string, scriptId: string): string {
  if (!url) return '';
  const parts = url.split('/');
  return parts[parts.length - 1];
}

export function ExportTab({
  section,
  script,
  generatedImages,
}: {
  section: Section;
  script: Script | null;
  generatedImages: GeneratedImage[];
}) {
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [renderedVideo, setRenderedVideo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [duration, setDuration] = useState(script?.duration || 30);
  const [resolution, setResolution] = useState<'1080x1920' | '1920x1080'>('1080x1920');
  const [zoomFactor, setZoomFactor] = useState(1.15);
  const [transitionDuration, setTransitionDuration] = useState(0.5);
  const [isPlaying, setIsPlaying] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (script?.duration) {
      setDuration(script.duration);
    }
  }, [script?.id, script?.duration]);

  useEffect(() => {
    if (script?.id) {
      checkExistingVideos(script.id);
    }
  }, [script?.id]);

  async function checkExistingVideos(scriptId: string) {
    try {
      const res = await fetch(`/api/render/status/${scriptId}`);
      const data = await res.json();
      if (data.videos?.length > 0) {
        setRenderedVideo(data.videos[0].url);
      }
    } catch {
      // ignore
    }
  }

  function togglePlayPause() {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }

  function toggleFullscreen() {
    if (!videoRef.current) return;
    if (!document.fullscreenElement) {
      videoRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === ' ' && renderedVideo) {
        e.preventDefault();
        togglePlayPause();
      } else if ((e.key === 'f' || e.key === 'F') && renderedVideo) {
        e.preventDefault();
        toggleFullscreen();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [renderedVideo]);

  async function handleRender() {
    if (!script || rendering) return;
    if (!generatedImages.length) {
      setError('No generated images available. Generate images first in the Generation tab.');
      return;
    }
    if (!script.generatedAudio?.length) {
      setError('No audio available. Generate audio first in the Generation tab.');
      return;
    }

    setRendering(true);
    setProgress(5);
    setError('');

    const imagePaths = generatedImages
      .filter((img) => img.status === 'done' && img.url)
      .map((img) => urlToServerPath(img.url!, script.id));

    if (!imagePaths.length) {
      setRendering(false);
      setError('No ready generated images found.');
      return;
    }

    const audioEntry = script.generatedAudio[0];
    const audioPath = urlToServerPath(audioEntry.url, script.id);

    try {
      const res = await fetch('/api/render/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: script.id,
          imagePaths,
          audioPath: audioPath || '',
          duration,
          resolution: resolution === '1080x1920' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 },
          zoomFactor,
          transitionDuration,
          sceneAnalysis: script.sceneAnalysis,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Render failed');

      const progressInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/render/status/${script.id}`);
          const statusData = await statusRes.json();

          if (statusData.status === 'error') {
            clearInterval(progressInterval);
            setRendering(false);
            setError(statusData.error || 'Render failed');
          } else if (statusData.status === 'done' && statusData.videos?.length > 0) {
            clearInterval(progressInterval);
            setRendering(false);
            setProgress(100);
            setRenderedVideo(statusData.videos[0].url);
          } else if (statusData.status === 'running') {
            if (typeof statusData.progress === 'number') {
              setProgress(statusData.progress);
            } else {
              setProgress((p) => Math.min(p + 5, 90));
            }
          }
        } catch {}
      }, 1000);
    } catch (err: any) {
      setRendering(false);
      setError(err.message || 'Failed to render video');
    }
  }

  async function handleDownload() {
    if (renderedVideo) {
      const a = document.createElement('a');
      a.href = renderedVideo;
      a.download = `video_${script?.id}_${Date.now()}.mp4`;
      a.click();
    }
  }

  const readyImages = generatedImages.filter((img) => img.status === 'done' && img.url);
  const hasAudio = Boolean(script?.generatedAudio && script.generatedAudio.length > 0);
  const sa = script?.sceneAnalysis;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      {/* 9:16 Video Player Column */}
      <div className="flex flex-col items-center lg:col-span-5">
        <div className="relative flex aspect-[9/16] w-full max-w-[340px] items-center justify-center overflow-hidden rounded-2xl border border-border bg-black shadow-2xl">
          {renderedVideo ? (
            <video
              ref={videoRef}
              className="h-full w-full object-contain"
              controls
              playsInline
              src={renderedVideo}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-gray-500 bg-surface">
              {rendering ? (
                <div className="flex flex-col items-center gap-4 text-white">
                  <div className="relative flex h-14 w-14 items-center justify-center">
                    <Loader2 className="h-12 w-12 animate-spin text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Rendering Video...</p>
                    <p className="text-xs text-accent mt-1">{progress}% complete</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface2 text-gray-400">
                    <Clapperboard className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-300">No Rendered Video Yet</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Configure your settings on the right and click Render Video.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {renderedVideo && (
          <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
            <button
              onClick={togglePlayPause}
              className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-gray-200 hover:bg-surface2"
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {isPlaying ? 'Pause' : 'Play'} (Space)
            </button>
            <button
              onClick={toggleFullscreen}
              className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-gray-200 hover:bg-surface2"
            >
              <Maximize className="h-3.5 w-3.5" />
              Fullscreen (F)
            </button>
          </div>
        )}
      </div>

      {/* Settings & Render Controls Column */}
      <div className="space-y-4 lg:col-span-7">
        {script && (
          <Field label="Script Template">
            <div className="flex items-center justify-between rounded-md bg-surface p-3 border border-border">
              <span className="font-semibold text-white text-sm truncate">{script.name}</span>
              <span className="text-xs text-accent uppercase font-mono tracking-wider font-semibold">
                {script.duration}s preset
              </span>
            </div>
          </Field>
        )}

        {/* AI Scene Analysis Summary */}
        {sa && (
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
                <Sparkles className="h-4 w-4" /> AI Directed Effects & Transitions
              </span>
              <span className="rounded bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent uppercase">
                {sa.mood || 'Epic'} Mood · {sa.pacing || 'Cinematic'}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {sa.effects?.map((eff, i) => (
                <span
                  key={`eff-${i}`}
                  className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-gray-300"
                >
                  Scene {i + 1}: <span className="font-medium text-white">{eff}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <Field label="Duration (seconds)">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="5"
              max="300"
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value) || 30)}
              className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent"
            />
            {Boolean(script?.duration && duration !== script.duration) && (
              <button
                type="button"
                onClick={() => setDuration(script!.duration)}
                className="rounded border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/20 transition-colors shrink-0"
              >
                Reset ({script!.duration}s)
              </button>
            )}
          </div>
        </Field>

        <Field label="Video Format & Resolution">
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value as '1080x1920' | '1920x1080')}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent"
          >
            <option value="1080x1920">1080×1920 (Vertical Shorts / Reels / TikTok)</option>
            <option value="1920x1080">1920×1080 (Landscape Standard 16:9)</option>
          </select>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Motion Zoom Strength">
            <input
              type="range"
              min="1.05"
              max="1.4"
              step="0.05"
              value={zoomFactor}
              onChange={(e) => setZoomFactor(parseFloat(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-gray-400 mt-1">{zoomFactor.toFixed(2)}x camera zoom</p>
          </Field>

          <Field label="Transition Speed (seconds)">
            <input
              type="range"
              min="0.2"
              max="1.5"
              step="0.1"
              value={transitionDuration}
              onChange={(e) => setTransitionDuration(parseFloat(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-gray-400 mt-1">{transitionDuration.toFixed(1)}s cross-fade/slide</p>
          </Field>
        </div>

        <div className="flex flex-wrap gap-3 pt-3">
          <button
            onClick={handleRender}
            disabled={rendering || readyImages.length === 0 || !hasAudio}
            className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all shadow-md ${
              rendering || readyImages.length === 0 || !hasAudio
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-accent text-white hover:bg-blue-500'
            }`}
          >
            {rendering ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Rendering... {progress}%
              </>
            ) : (
              <>
                <FileVideo className="h-4 w-4" />
                Render Final Video
              </>
            )}
          </button>

          {renderedVideo && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 shadow-md transition-all"
            >
              <Download className="h-4 w-4" />
              Download MP4
            </button>
          )}

          <button
            onClick={() => {
              if (script) {
                navigator.clipboard.writeText(`Topic: ${script.topicName || ''}\nScript:\n${script.narration || ''}`);
              }
            }}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-gray-200 hover:bg-surface2"
          >
            <Copy className="h-4 w-4" />
            Copy Script
          </button>
        </div>

        {readyImages.length > 0 && (
          <div className="rounded-lg border border-border bg-surface p-3.5 text-xs text-gray-400 space-y-1">
            <p className="font-semibold text-white">Assets Status:</p>
            <p>
              • {readyImages.length} of {generatedImages.length} images ready
            </p>
            <p>• Audio: {hasAudio ? 'Voiceover ready' : 'Missing (generate in Generation tab)'}</p>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {renderedVideo && !rendering && (
          <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3 text-xs text-green-300 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 shrink-0" />
            Video render completed! You can play, toggle fullscreen (F), or download the MP4.
          </div>
        )}
      </div>
    </div>
  );
}