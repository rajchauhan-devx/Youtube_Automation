import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Download,
  FileVideo,
  Loader2,
  AlertCircle,
  CheckCircle,
  Settings2,
  Clock,
  Image as ImageIcon,
  Music,
  MoveUp,
  MoveDown,
  Maximize,
  Minimize,
} from 'lucide-react';
import { Field } from '../layout/Field';
import type { Script, GeneratedImage, TimelineClip, TimelineConfig } from '../../data';

function urlToFilename(url: string): string {
  if (!url) return '';
  const parts = url.split('/');
  return parts[parts.length - 1];
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function ReviewAdjustTab({
  script,
  onUpdate,
}: {
  script: Script | null;
  onUpdate: (patch: Partial<Script>) => void;
}) {
  const [timeline, setTimeline] = useState<TimelineConfig | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showExportSettings, setShowExportSettings] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Export state
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [renderedVideo, setRenderedVideo] = useState<string | null>(null);
  const [renderError, setRenderError] = useState('');
  const [zoomFactor, setZoomFactor] = useState(1.15);
  const [transitionDuration, setTransitionDuration] = useState(0.5);

  const playIntervalRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isSeekingRef = useRef(false);

  const doneImages = useMemo(
    () => (script?.generatedImages || []).filter((img) => img.status === 'done' && img.url),
    [script?.generatedImages]
  );

  const audioUrl = useMemo(() => {
    const audio = script?.generatedAudio?.[0];
    return audio?.url || null;
  }, [script?.generatedAudio]);

  // Auto-populate timeline from generated assets
  useEffect(() => {
    if (!script) {
      setTimeline(null);
      return;
    }

    if (script.timelineConfig) {
      setTimeline(script.timelineConfig);
      setZoomFactor(script.timelineConfig.zoomFactor);
      setTransitionDuration(
        script.timelineConfig.clips[0]?.transitionDuration ?? 0.5
      );
      return;
    }

    if (doneImages.length === 0 || !audioUrl) {
      setTimeline(null);
      return;
    }

    const clipDuration = script.duration
      ? script.duration / doneImages.length
      : 5;

    const clips: TimelineClip[] = doneImages.map((img) => ({
      id: generateId(),
      imageUrl: img.url!,
      prompt: img.prompt,
      duration: Math.round(clipDuration * 10) / 10,
      transition: 'crossfade',
      transitionDuration: 0.5,
      caption: '',
    }));

    const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);

    const config: TimelineConfig = {
      clips,
      audioUrl,
      totalDuration: Math.round(totalDuration * 10) / 10,
      resolution: { width: 1080, height: 1920 },
      zoomFactor: 1.15,
    };

    setTimeline(config);
    onUpdate({ timelineConfig: config });
  }, [script?.id, doneImages.length, audioUrl]);

  // Preview playback — advances time with requestAnimationFrame
  useEffect(() => {
    if (!playing || !timeline) {
      if (playIntervalRef.current) {
        cancelAnimationFrame(playIntervalRef.current);
        playIntervalRef.current = null;
      }
      return;
    }

    let lastFrameTime = performance.now();

    function tick(now: number) {
      const delta = (now - lastFrameTime) / 1000;
      lastFrameTime = now;
      setCurrentTime((prev) => {
        const next = prev + delta;
        if (next >= timeline.totalDuration) {
          setPlaying(false);
          return 0;
        }
        return next;
      });
      playIntervalRef.current = requestAnimationFrame(tick);
    }

    playIntervalRef.current = requestAnimationFrame(tick);

    return () => {
      if (playIntervalRef.current) {
        cancelAnimationFrame(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    };
  }, [playing, timeline?.totalDuration]);

  // Audio — create once, play/pause based on playing state, seek only on manual scrub
  useEffect(() => {
    if (!audioUrl) return;

    // Create audio element once
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.preload = 'auto';
    } else if (audioRef.current.src !== audioUrl) {
      audioRef.current.src = audioUrl;
    }

    if (playing) {
      // Only seek if we're not mid-playback (avoid constant seeks)
      if (isSeekingRef.current) {
        audioRef.current.currentTime = currentTime;
        isSeekingRef.current = false;
      }
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [playing, audioUrl]);

  // Handle manual seek — only sync audio when user scrubs while paused
  useEffect(() => {
    if (playing || !audioRef.current) return;
    if (isSeekingRef.current) {
      audioRef.current.currentTime = currentTime;
    }
  }, [currentTime, playing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (playIntervalRef.current) {
        cancelAnimationFrame(playIntervalRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
      if (e.key === 'ArrowLeft') { isSeekingRef.current = true; setCurrentTime((t) => Math.max(0, t - 2)); }
      if (e.key === 'ArrowRight') { isSeekingRef.current = true; setCurrentTime((t) => Math.min(timeline?.totalDuration || 0, t + 2)); }
      if (e.key === 'f' || e.key === 'F') setFullscreen((f) => !f);
      if (e.key === 'Escape' && fullscreen) setFullscreen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen, timeline?.totalDuration]);

  const selectedClip = useMemo(
    () => timeline?.clips.find((c) => c.id === selectedClipId) || null,
    [timeline, selectedClipId]
  );

  // Current image index based on time
  const currentImageIndex = useMemo(() => {
    if (!timeline) return 0;
    let elapsed = 0;
    for (let i = 0; i < timeline.clips.length; i++) {
      elapsed += timeline.clips[i].duration;
      if (currentTime < elapsed) return i;
    }
    return timeline.clips.length - 1;
  }, [currentTime, timeline]);

  const updateClip = useCallback(
    (clipId: string, patch: Partial<TimelineClip>) => {
      setTimeline((prev) => {
        if (!prev) return prev;
        const clips = prev.clips.map((c) =>
          c.id === clipId ? { ...c, ...patch } : c
        );
        const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);
        const next = {
          ...prev,
          clips,
          totalDuration: Math.round(totalDuration * 10) / 10,
        };
        onUpdate({ timelineConfig: next });
        return next;
      });
    },
    [onUpdate]
  );

  const removeClip = useCallback(
    (clipId: string) => {
      setTimeline((prev) => {
        if (!prev || prev.clips.length <= 1) return prev;
        const clips = prev.clips.filter((c) => c.id !== clipId);
        const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);
        const next = {
          ...prev,
          clips,
          totalDuration: Math.round(totalDuration * 10) / 10,
        };
        onUpdate({ timelineConfig: next });
        return next;
      });
      setSelectedClipId(null);
    },
    [onUpdate]
  );

  const moveClip = useCallback(
    (clipId: string, direction: 'up' | 'down') => {
      setTimeline((prev) => {
        if (!prev) return prev;
        const idx = prev.clips.findIndex((c) => c.id === clipId);
        if (idx < 0) return prev;
        const newIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= prev.clips.length) return prev;
        const clips = [...prev.clips];
        [clips[idx], clips[newIdx]] = [clips[newIdx], clips[idx]];
        const next = { ...prev, clips };
        onUpdate({ timelineConfig: next });
        return next;
      });
    },
    [onUpdate]
  );

  const autoFixDurations = useCallback(() => {
    if (!timeline || !audioUrl) return;
    const perClip = Math.round((timeline.totalDuration / timeline.clips.length) * 10) / 10;
    const clips = timeline.clips.map((c) => ({ ...c, duration: perClip }));
    const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);
    const next = {
      ...timeline,
      clips,
      totalDuration: Math.round(totalDuration * 10) / 10,
    };
    setTimeline(next);
    onUpdate({ timelineConfig: next });
  }, [timeline, audioUrl, onUpdate]);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!timeline) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      isSeekingRef.current = true;
      setCurrentTime(pct * timeline.totalDuration);
    },
    [timeline]
  );

  // Export
  async function handleRender() {
    if (!script || !timeline || rendering) return;
    if (doneImages.length === 0) {
      setRenderError('No generated images available.');
      return;
    }
    if (!audioUrl) {
      setRenderError('No audio available. Generate audio first.');
      return;
    }

    setRendering(true);
    setProgress(5);
    setRenderError('');

    const imagePaths = timeline.clips.map((c) => urlToFilename(c.imageUrl));
    const audioPath = urlToFilename(audioUrl);

    try {
      const res = await fetch('/api/render/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: script.id,
          imagePaths,
          audioPath,
          duration: timeline.totalDuration,
          resolution: timeline.resolution,
          zoomFactor,
          transitionDuration,
          timelineConfig: {
            clips: timeline.clips.map((c) => ({
              duration: c.duration,
              transition: c.transition,
              transitionDuration: c.transitionDuration,
            })),
          },
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
            setRenderError(statusData.error || 'Render failed');
          } else if (statusData.status === 'done' && statusData.videos?.length > 0) {
            clearInterval(progressInterval);
            setRendering(false);
            setProgress(100);
            setRenderedVideo(statusData.videos[0].url);
          } else if (statusData.status === 'running') {
            setProgress(
              typeof statusData.progress === 'number'
                ? statusData.progress
                : Math.min(progress + 5, 90)
            );
          }
        } catch {
          // ignore
        }
      }, 1000);
    } catch (err: any) {
      setRendering(false);
      setRenderError(err.message || 'Failed to render video');
    }
  }

  function handleDownload() {
    if (renderedVideo) {
      const a = document.createElement('a');
      a.href = renderedVideo;
      a.download = `video_${script?.id}_${Date.now()}.mp4`;
      a.click();
    }
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  if (!script) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        No script selected.
      </div>
    );
  }

  if (!timeline || doneImages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-500">
        <ImageIcon className="mb-3 h-8 w-8 text-gray-600" />
        <p className="text-sm">No generated assets to review.</p>
        <p className="mt-1 text-xs">Generate images and audio first in the Generation tab.</p>
      </div>
    );
  }

  const previewImage = doneImages[currentImageIndex]?.url || '';

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col gap-3">
      {/* Top: Preview + Properties */}
      <div className="flex flex-1 gap-3 overflow-hidden">
        {/* Preview player */}
        <div className="flex flex-1 flex-col">
          {/* Playback controls */}
          <div className="mb-2 flex items-center gap-2">
            <button
              onClick={() => {
                isSeekingRef.current = true;
                setCurrentTime(0);
              }}
              className="rounded p-1 text-gray-400 hover:bg-surface2 hover:text-white"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                isSeekingRef.current = true;
                setCurrentTime((prev) => Math.max(0, prev - 2));
              }}
              className="rounded p-1 text-gray-400 hover:bg-surface2 hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPlaying((p) => !p)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white hover:bg-blue-500"
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </button>
            <button
              onClick={() => {
                isSeekingRef.current = true;
                setCurrentTime((prev) => Math.min(timeline.totalDuration, prev + 2));
              }}
              className="rounded p-1 text-gray-400 hover:bg-surface2 hover:text-white"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                setPlaying(false);
                isSeekingRef.current = true;
                setCurrentTime(0);
              }}
              className="rounded p-1 text-gray-400 hover:bg-surface2 hover:text-white"
            >
              <SkipForward className="h-4 w-4" />
            </button>

            <span className="ml-2 font-mono text-xs text-gray-400">
              {formatTime(currentTime)} / {formatTime(timeline.totalDuration)}
            </span>

            <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
              <ImageIcon className="h-3.5 w-3.5" />
              {doneImages.length} images
              <Music className="ml-2 h-3.5 w-3.5" />
              Audio loaded
            </div>
          </div>

          {/* Canvas */}
          <div className="flex flex-1 items-center justify-center rounded-lg border border-border bg-black">
            <div className="relative aspect-[9/16] h-full max-h-full overflow-hidden rounded-md">
              {previewImage && (
                <img
                  src={previewImage}
                  alt={`Frame ${currentImageIndex + 1}`}
                  className="h-full w-full object-cover"
                />
              )}
              {selectedClip?.caption && currentImageIndex === timeline.clips.indexOf(selectedClip) && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                  <p className="text-center text-sm font-semibold text-white">
                    {selectedClip.caption}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Seek bar + fullscreen */}
          <div className="mt-2 flex items-center gap-2">
            <div
              className="relative h-6 flex-1 cursor-pointer rounded bg-surface2"
              onClick={handleSeek}
            >
              <div
                className="h-full rounded bg-accent/40 transition-none"
                style={{
                  width: `${(currentTime / timeline.totalDuration) * 100}%`,
                }}
              />
              {/* Clip markers */}
              {timeline.clips.map((clip, i) => {
                const start = timeline.clips
                  .slice(0, i)
                  .reduce((sum, c) => sum + c.duration, 0);
                return (
                  <div
                    key={clip.id}
                    className="absolute top-0 bottom-0 w-px bg-gray-600"
                    style={{
                      left: `${(start / timeline.totalDuration) * 100}%`,
                    }}
                  />
                );
              })}
            </div>
            <button
              onClick={() => setFullscreen(true)}
              className="rounded p-1.5 text-gray-400 hover:bg-surface2 hover:text-white"
              title="Fullscreen"
            >
              <Maximize className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Properties panel */}
        <div className="hidden w-60 shrink-0 flex-col rounded-lg border border-border bg-surface lg:flex">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Properties
            </span>
            {selectedClip && (
              <button
                onClick={() => setSelectedClipId(null)}
                className="text-xs text-gray-500 hover:text-white"
              >
                Deselect
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto thin-scrollbar p-3">
            {selectedClip ? (
              <>
                <Field label="Duration (s)">
                  <input
                    type="number"
                    min="1"
                    max="30"
                    step="0.5"
                    value={selectedClip.duration}
                    onChange={(e) =>
                      updateClip(selectedClip.id, {
                        duration: parseFloat(e.target.value) || 1,
                      })
                    }
                    className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-white outline-none focus:border-accent"
                  />
                </Field>

                <div className="mt-3">
                  <Field label="Transition">
                    <select
                      value={selectedClip.transition}
                      onChange={(e) =>
                        updateClip(selectedClip.id, {
                          transition: e.target.value as 'crossfade' | 'none',
                        })
                      }
                      className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-white outline-none focus:border-accent"
                    >
                      <option value="crossfade">Crossfade</option>
                      <option value="none">None</option>
                    </select>
                  </Field>
                </div>

                {selectedClip.transition === 'crossfade' && (
                  <div className="mt-3">
                    <Field label="Transition Duration (s)">
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={selectedClip.transitionDuration}
                        onChange={(e) =>
                          updateClip(selectedClip.id, {
                            transitionDuration: parseFloat(e.target.value),
                          })
                        }
                        className="w-full"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        {selectedClip.transitionDuration.toFixed(1)}s
                      </p>
                    </Field>
                  </div>
                )}

                <div className="mt-3">
                  <Field label="Caption Text">
                    <textarea
                      value={selectedClip.caption}
                      onChange={(e) =>
                        updateClip(selectedClip.id, { caption: e.target.value })
                      }
                      rows={2}
                      placeholder="Optional text overlay"
                      className="w-full resize-none rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-white outline-none focus:border-accent"
                    />
                  </Field>
                </div>

                <div className="mt-3">
                  <Field label="Image Prompt">
                    <p className="text-xs text-gray-400 leading-relaxed">
                      {selectedClip.prompt}
                    </p>
                  </Field>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => moveClip(selectedClip.id, 'up')}
                    disabled={timeline.clips.indexOf(selectedClip) === 0}
                    className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-gray-300 hover:bg-surface2 disabled:opacity-30"
                  >
                    <MoveUp className="h-3 w-3" /> Left
                  </button>
                  <button
                    onClick={() => moveClip(selectedClip.id, 'down')}
                    disabled={
                      timeline.clips.indexOf(selectedClip) ===
                      timeline.clips.length - 1
                    }
                    className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-gray-300 hover:bg-surface2 disabled:opacity-30"
                  >
                    <MoveDown className="h-3 w-3" /> Right
                  </button>
                  <button
                    onClick={() => removeClip(selectedClip.id)}
                    disabled={timeline.clips.length <= 1}
                    className="flex items-center gap-1 rounded border border-red-500/40 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-30"
                  >
                    <Trash2 className="h-3 w-3" /> Remove
                  </button>
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center text-gray-500">
                <Settings2 className="mb-2 h-6 w-6 text-gray-600" />
                <p className="text-xs">Select a clip on the timeline to edit its properties</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-lg border border-border bg-surface p-2">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-xs font-medium text-gray-400">Timeline</span>
          <div className="flex items-center gap-3">
            <button
              onClick={autoFixDurations}
              className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-gray-300 hover:bg-surface2"
            >
              <Clock className="h-3 w-3" /> Auto-fix duration
            </button>
            <span className="text-[11px] text-gray-500">
              {timeline.clips.length} clips · {formatTime(timeline.totalDuration)}
            </span>
          </div>
        </div>

        {/* Image track */}
        <div className="mb-1 flex items-center gap-2">
          <span className="w-16 shrink-0 text-[11px] text-gray-500">Images</span>
          <div className="relative flex h-14 flex-1 gap-0.5 overflow-x-auto rounded bg-bg p-1 thin-scrollbar">
            {timeline.clips.map((clip) => {
              const widthPct = (clip.duration / timeline.totalDuration) * 100;
              const isSelected = clip.id === selectedClipId;
              return (
                <button
                  key={clip.id}
                  onClick={() =>
                    setSelectedClipId(
                      clip.id === selectedClipId ? null : clip.id
                    )
                  }
                  className={`relative shrink-0 overflow-hidden rounded border-2 transition-all ${
                    isSelected
                      ? 'border-accent shadow-lg'
                      : 'border-transparent hover:border-gray-500'
                  }`}
                  style={{
                    width: `${Math.max(widthPct, 4)}%`,
                    minWidth: '40px',
                  }}
                >
                  <img
                    src={clip.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                    <span className="text-[9px] text-gray-300">
                      {clip.duration}s
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Audio track */}
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-[11px] text-gray-500">Audio</span>
          <div className="relative h-8 flex-1 rounded bg-bg">
            <div className="flex h-full items-center rounded bg-green-500/20 px-2">
              <Music className="mr-1.5 h-3.5 w-3.5 text-green-400" />
              <span className="text-[11px] text-green-400">
                Voiceover ({formatTime(timeline.totalDuration)})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar: Export settings + Render button */}
      <div className="rounded-lg border border-border bg-surface p-3">
        <div className="flex items-center gap-4">
          {/* Render status */}
          {renderedVideo && !rendering && (
            <div className="flex items-center gap-2 text-sm text-green-400">
              <CheckCircle className="h-4 w-4" />
              Video ready!
            </div>
          )}
          {renderError && (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <AlertCircle className="h-4 w-4" />
              {renderError}
            </div>
          )}

          {/* Quick settings */}
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span>
              {timeline.resolution.width}x{timeline.resolution.height}
            </span>
            <span>·</span>
            <span>{zoomFactor.toFixed(2)}x zoom</span>
            <span>·</span>
            <span>{transitionDuration.toFixed(1)}s transition</span>
          </div>

          <button
            onClick={() => setShowExportSettings((v) => !v)}
            className="ml-auto flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-xs text-gray-300 hover:bg-surface2"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Settings
          </button>

          {renderedVideo && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              <Download className="h-4 w-4" />
              Download
            </button>
          )}

          <button
            onClick={handleRender}
            disabled={rendering || doneImages.length === 0 || !audioUrl}
            className={`flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium ${
              rendering || doneImages.length === 0 || !audioUrl
                ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
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
                Render Video
              </>
            )}
          </button>
        </div>

        {/* Expanded settings */}
        {showExportSettings && (
          <div className="mt-3 grid grid-cols-3 gap-4 border-t border-border pt-3">
            <Field label="Zoom Factor">
              <input
                type="range"
                min="1.0"
                max="1.5"
                step="0.05"
                value={zoomFactor}
                onChange={(e) => setZoomFactor(parseFloat(e.target.value))}
                className="w-full"
              />
              <p className="mt-1 text-xs text-gray-500">{zoomFactor.toFixed(2)}x</p>
            </Field>
            <Field label="Transition Duration (s)">
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={transitionDuration}
                onChange={(e) => setTransitionDuration(parseFloat(e.target.value))}
                className="w-full"
              />
              <p className="mt-1 text-xs text-gray-500">{transitionDuration.toFixed(1)}s</p>
            </Field>
            <Field label="Resolution">
              <select
                value={`${timeline.resolution.width}x${timeline.resolution.height}`}
                onChange={(e) => {
                  const [w, h] = e.target.value.split('x').map(Number);
                  const next = { ...timeline, resolution: { width: w, height: h } };
                  setTimeline(next);
                  onUpdate({ timelineConfig: next });
                }}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent"
              >
                <option value="1080x1920">1080x1920 (Shorts)</option>
                <option value="1920x1080">1920x1080 (Landscape)</option>
              </select>
            </Field>
          </div>
        )}
      </div>

      {/* Fullscreen overlay */}
      {fullscreen && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black"
          onClick={(e) => {
            // Click on background to exit, but not on controls
            if (e.target === e.currentTarget) setFullscreen(false);
          }}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-6 py-3">
            <span className="font-mono text-sm text-white">
              {formatTime(currentTime)} / {formatTime(timeline.totalDuration)}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">
                {currentImageIndex + 1} / {timeline.clips.length}
              </span>
              <button
                onClick={() => setFullscreen(false)}
                className="rounded p-1.5 text-gray-400 hover:text-white"
              >
                <Minimize className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Video — centered, fills available height */}
          <div className="flex flex-1 items-center justify-center overflow-hidden">
            <div className="relative h-full max-h-full overflow-hidden">
              {previewImage && (
                <img
                  src={previewImage}
                  alt={`Frame ${currentImageIndex + 1}`}
                  className="h-full w-full object-contain"
                />
              )}
              {selectedClip?.caption && currentImageIndex === timeline.clips.indexOf(selectedClip) && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
                  <p className="text-center text-lg font-semibold text-white">
                    {selectedClip.caption}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Bottom controls */}
          <div className="bg-gradient-to-t from-black/80 to-transparent px-6 pb-4 pt-8">
            {/* Seek bar */}
            <div
              className="relative mb-3 h-2 cursor-pointer rounded-full bg-white/20"
              onClick={(e) => {
                if (!timeline) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                isSeekingRef.current = true;
                setCurrentTime(pct * timeline.totalDuration);
              }}
            >
              <div
                className="h-full rounded-full bg-white transition-none"
                style={{
                  width: `${(currentTime / timeline.totalDuration) * 100}%`,
                }}
              />
              {timeline.clips.map((clip, i) => {
                const start = timeline.clips
                  .slice(0, i)
                  .reduce((sum, c) => sum + c.duration, 0);
                return (
                  <div
                    key={clip.id}
                    className="absolute top-0 bottom-0 w-px bg-white/40"
                    style={{
                      left: `${(start / timeline.totalDuration) * 100}%`,
                    }}
                  />
                );
              })}
            </div>

            {/* Controls row */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => {
                  isSeekingRef.current = true;
                  setCurrentTime(0);
                }}
                className="rounded p-2 text-white/70 hover:text-white"
              >
                <SkipBack className="h-5 w-5" />
              </button>
              <button
                onClick={() => {
                  isSeekingRef.current = true;
                  setCurrentTime((prev) => Math.max(0, prev - 2));
                }}
                className="rounded p-2 text-white/70 hover:text-white"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => setPlaying((p) => !p)}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-black hover:bg-white/90"
              >
                {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
              </button>
              <button
                onClick={() => {
                  isSeekingRef.current = true;
                  setCurrentTime((prev) => Math.min(timeline.totalDuration, prev + 2));
                }}
                className="rounded p-2 text-white/70 hover:text-white"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <button
                onClick={() => {
                  setPlaying(false);
                  isSeekingRef.current = true;
                  setCurrentTime(0);
                }}
                className="rounded p-2 text-white/70 hover:text-white"
              >
                <SkipForward className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
