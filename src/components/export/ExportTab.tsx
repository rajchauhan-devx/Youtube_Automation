import { useState, useEffect, useCallback } from 'react';
import { Play, FileVideo, Download, Copy, Plus, Loader2, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { Field } from '../layout/Field';
import type { Section, Script, GeneratedImage, Asset, GeneratedAudio } from '../../data';

function urlToServerPath(url: string, scriptId: string): string {
  if (!url) return '';
  const parts = url.split('/');
  const filename = parts[parts.length - 1];
  return filename;
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
  const [thumbMode, setThumbMode] = useState<'frame' | 'upload'>('frame');
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [renderedVideo, setRenderedVideo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [duration, setDuration] = useState(script?.duration || 30);
  const [resolution, setResolution] = useState<'1080x1920' | '1920x1080'>('1080x1920');
  const [zoomFactor, setZoomFactor] = useState(1.15);
  const [transitionDuration, setTransitionDuration] = useState(0.5);

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

  async function handleRender() {
    if (!script || rendering) return;
    if (!generatedImages.length) {
      setError('No generated images available. Generate images first.');
      return;
    }
    if (!script.generatedAudio?.length) {
      setError('No audio available. Generate audio first in Generation tab.');
      return;
    }

    setRendering(true);
    setProgress(5);
    setError('');

    const imagePaths = generatedImages
      .filter(img => img.status === 'done' && img.url)
      .map(img => urlToServerPath(img.url!, script.id));

    if (!imagePaths.length) {
      setRendering(false);
      setError('No ready generated images found.');
      return;
    }

    // Use the first generated audio file
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
        }),
      });

      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Render failed');

      // Poll for progress
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
              setProgress(p => Math.min(p + 5, 90));
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

  const readyImages = generatedImages.filter(img => img.status === 'done' && img.url);
  const hasAudio = script?.generatedAudio && script.generatedAudio.length > 0;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Preview */}
      <div className="flex flex-col">
        <div className="flex aspect-video items-center justify-center rounded-lg border border-border bg-black">
          {renderedVideo ? (
            <video 
              className="w-full h-full aspect-[9/16] rounded" 
              controls 
              src={renderedVideo}
            />
          ) : (
            <div className="flex aspect-[9/16] h-full items-center justify-center rounded bg-surface2">
              {rendering ? (
                <div className="flex flex-col items-center gap-3 text-white">
                  <Loader2 className="h-10 w-10 animate-spin text-accent" />
                  <p className="text-sm">Rendering video... {progress}%</p>
                </div>
              ) : (
                <FileVideo className="h-8 w-8 text-gray-600" />
              )}
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center justify-center gap-2">
          {renderedVideo && (
            <button className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-gray-200 hover:bg-surface2">
              <Play className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Settings & Actions */}
      <div className="space-y-4">
        {script && (
          <Field label="Script">
            <p className="text-sm text-gray-300">{script.name}</p>
          </Field>
        )}

        <Field label="Duration (seconds)">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="5"
              max="300"
              value={duration}
              onChange={e => setDuration(parseInt(e.target.value) || 30)}
              className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent"
            />
            {Boolean(script?.duration && duration !== script.duration) && (
              <button
                type="button"
                onClick={() => setDuration(script!.duration)}
                className="rounded border border-accent/40 bg-accent/10 px-2.5 py-2 text-xs font-medium text-accent hover:bg-accent/20 transition-colors shrink-0"
              >
                Reset ({script!.duration}s)
              </button>
            )}
          </div>
        </Field>

        <Field label="Resolution">
          <select
            value={resolution}
            onChange={e => setResolution(e.target.value as '1080x1920' | '1920x1080')}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent"
          >
            <option value="1080x1920">1080×1920 (Shorts/Reels)</option>
            <option value="1920x1080">1920×1080 (Landscape)</option>
          </select>
        </Field>

        <Field label="Zoom Factor">
          <input
            type="range"
            min="1.0"
            max="1.5"
            step="0.05"
            value={zoomFactor}
            onChange={e => setZoomFactor(parseFloat(e.target.value))}
            className="w-full"
          />
          <p className="text-xs text-gray-500 mt-1">{zoomFactor.toFixed(2)}x</p>
        </Field>

        <Field label="Transition Duration (s)">
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={transitionDuration}
            onChange={e => setTransitionDuration(parseFloat(e.target.value))}
            className="w-full"
          />
          <p className="text-xs text-gray-500 mt-1">{transitionDuration.toFixed(1)}s</p>
        </Field>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            onClick={handleRender}
            disabled={rendering || readyImages.length === 0 || !hasAudio}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
              rendering || readyImages.length === 0 || !hasAudio
                ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                : 'bg-accent text-white hover:bg-accent/80'
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
                Render Video
              </>
            )}
          </button>

          {renderedVideo && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              <Download className="h-4 w-4" />
              Download MP4
            </button>
          )}

          <button className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-gray-200 hover:bg-surface2">
            <Copy className="h-4 w-4" />
            Copy Metadata
          </button>
          <button className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-gray-200 hover:bg-surface2">
            <Plus className="h-4 w-4" />
            Start New
          </button>
        </div>

        {readyImages.length > 0 && (
          <div className="rounded-lg border border-border bg-surface p-3 text-xs text-gray-400">
            <p className="font-medium mb-1">Ready to render:</p>
            <p>{readyImages.length} images, {hasAudio ? 'audio available' : 'no audio'}</p>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {renderedVideo && !rendering && (
          <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 shrink-0" />
            Video ready! Preview above or download.
          </div>
        )}

        {section === 'long' && (
          <Field label="End Screen">
            <select className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent">
              <option>Subscribe button (default)</option>
              <option>Best for viewer</option>
              <option>Last video</option>
              <option>Custom</option>
            </select>
          </Field>
        )}
      </div>
    </div>
  );
}