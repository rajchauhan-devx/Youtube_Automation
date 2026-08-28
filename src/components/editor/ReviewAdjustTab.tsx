import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
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
  Sparkles,
  Volume2,
  Sliders,
  Type,
  Eye,
} from 'lucide-react';
import { Field } from '../layout/Field';
import type { Script, TimelineClip, TimelineConfig } from '../../data';

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
  const [fullscreen, setFullscreen] = useState(false);

  // Video render options & state
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [renderedVideo, setRenderedVideo] = useState<string | null>(null);
  const [renderError, setRenderError] = useState('');
  const [duration, setDuration] = useState(script?.duration || 30);
  const [resolution, setResolution] = useState<'1080x1920' | '1920x1080'>('1080x1920');
  const [zoomFactor, setZoomFactor] = useState(1.15);
  const [transitionDuration, setTransitionDuration] = useState(0.5);
  const [globalTransition, setGlobalTransition] = useState<string>('auto');
  const [globalMotion, setGlobalMotion] = useState<string>('auto');
  const [enableSubtitles, setEnableSubtitles] = useState(true);
  const [bgmTrack, setBgmTrack] = useState('auto');
  const [bgmVolume, setBgmVolume] = useState(0.15);
  const [colorGrade, setColorGrade] = useState('auto');
  const [enableVignette, setEnableVignette] = useState(true);
  const [enableSfx, setEnableSfx] = useState(true);
  const [availableTracks, setAvailableTracks] = useState<{ id: string; name: string; mood: string }[]>([]);

  const playIntervalRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isSeekingRef = useRef(false);

  const doneImages = useMemo(
    () => (script?.generatedImages || []).filter((img) => img.status === 'done' && img.url),
    [script?.generatedImages]
  );

  const audioUrl = useMemo(() => {
    const audio = script?.generatedAudio?.[0];
    return audio?.url || null;
  }, [script?.generatedAudio]);

  const sa = script?.sceneAnalysis;

  useEffect(() => {
    fetch('/api/render/music-tracks')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.tracks)) setAvailableTracks(d.tracks);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (script?.duration) {
      setDuration(script.duration);
    }
  }, [script?.id, script?.duration]);

  // Check for any previously rendered video for this script
  useEffect(() => {
    if (script?.id) {
      fetch(`/api/render/status/${script.id}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.videos?.length > 0) {
            setRenderedVideo(data.videos[0].url);
          }
        })
        .catch(() => {});
    }
  }, [script?.id]);

  function handleAudioLoaded() {
    if (audioRef.current && audioRef.current.duration > 0) {
      const realDur = Math.round(audioRef.current.duration * 10) / 10;
      setDuration(realDur);
      setTimeline((prev) => {
        if (!prev || prev.clips.length === 0) return prev;
        const perClip = Math.round((realDur / prev.clips.length) * 10) / 10;
        const clips = prev.clips.map((c) => ({ ...c, duration: perClip }));
        const next = {
          ...prev,
          clips,
          totalDuration: realDur,
        };
        onUpdate({ timelineConfig: next });
        return next;
      });
    }
  }

  // Auto-populate timeline from generated assets (DO NOT AUTO-RENDER VIDEO)
  useEffect(() => {
    if (!script) {
      setTimeline(null);
      return;
    }

    if (script.timelineConfig) {
      setTimeline(script.timelineConfig);
      setZoomFactor(script.timelineConfig.zoomFactor);
      setTransitionDuration(script.timelineConfig.clips[0]?.transitionDuration ?? 0.5);
      return;
    }

    if (doneImages.length === 0 || !audioUrl) {
      setTimeline(null);
      return;
    }

    const clipDuration = script.duration ? script.duration / doneImages.length : 5;

    const clips: TimelineClip[] = doneImages.map((img, i) => ({
      id: generateId(),
      imageUrl: img.url!,
      prompt: img.prompt,
      duration: Math.round(clipDuration * 10) / 10,
      transition: sa?.transitions?.[i] || 'fade',
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

  // Preview playback
  useEffect(() => {
    if (!playing || !timeline) {
      if (playIntervalRef.current) {
        cancelAnimationFrame(playIntervalRef.current);
        playIntervalRef.current = null;
      }
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
      return;
    }

    if (audioRef.current) {
      audioRef.current.currentTime = currentTime;
      audioRef.current.play().catch(() => {});
    }

    let lastFrameTime = performance.now();

    function tick(now: number) {
      const delta = (now - lastFrameTime) / 1000;
      lastFrameTime = now;
      setCurrentTime((prev) => {
        const next = prev + delta;
        if (next >= timeline!.totalDuration) {
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
  }, [playing, timeline]);

  // Global keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === ' ') {
        e.preventDefault();
        if (renderedVideo && videoRef.current) {
          if (videoRef.current.paused) videoRef.current.play();
          else videoRef.current.pause();
        } else {
          setPlaying((p) => !p);
        }
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        if (renderedVideo && videoRef.current) {
          if (!document.fullscreenElement) videoRef.current.requestFullscreen().catch(() => {});
          else document.exitFullscreen().catch(() => {});
        } else {
          setFullscreen((f) => !f);
        }
      }
      if (e.key === 'Escape' && fullscreen) setFullscreen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen, renderedVideo]);

  const selectedClip = useMemo(
    () => timeline?.clips.find((c) => c.id === selectedClipId) || null,
    [timeline, selectedClipId]
  );

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
        const clips = prev.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c));
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

  // START VIDEO GENERATION
  async function handleStartVideoGeneration() {
    if (!script || rendering) return;
    if (doneImages.length === 0) {
      setRenderError('No ready generated images found. Please generate images first.');
      return;
    }
    if (!audioUrl) {
      setRenderError('No voiceover audio found. Please generate audio first.');
      return;
    }

    setRendering(true);
    setProgress(5);
    setRenderError('');

    const imagePaths = (timeline?.clips || doneImages.map((img) => ({ imageUrl: img.url! }))).map((c) =>
      urlToFilename(c.imageUrl)
    );
    const audioPath = urlToFilename(audioUrl);

    // Build custom scene analysis if user customized global options
    const customSceneAnalysis = {
      ...(script.sceneAnalysis || {}),
      transitions:
        globalTransition !== 'auto'
          ? Array(imagePaths.length).fill(globalTransition)
          : script.sceneAnalysis?.transitions || [],
      effects:
        globalMotion !== 'auto'
          ? Array(imagePaths.length).fill(globalMotion)
          : script.sceneAnalysis?.effects || [],
      colorGrade:
        colorGrade !== 'auto' ? colorGrade : script.sceneAnalysis?.colorGrade || 'teal-orange',
    };

    try {
      const res = await fetch('/api/render/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: script.id,
          imagePaths,
          audioPath,
          narration: script.narration || '',
          duration,
          resolution: resolution === '1080x1920' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 },
          zoomFactor,
          transitionDuration,
          sceneAnalysis: customSceneAnalysis,
          enableSubtitles,
          bgmTrack: bgmTrack === 'auto' ? (script.sceneAnalysis?.mood || 'epic') : bgmTrack,
          bgmVolume,
          colorGrade: colorGrade === 'auto' ? (script.sceneAnalysis?.colorGrade || 'teal-orange') : colorGrade,
          enableVignette,
          enableSfx,
          timelineConfig: timeline
            ? {
                clips: timeline.clips.map((c) => ({
                  duration: c.duration,
                  transition: globalTransition !== 'auto' ? globalTransition : c.transition,
                  transitionDuration: c.transitionDuration,
                })),
              }
            : undefined,
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

  if (doneImages.length === 0) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center text-gray-500 rounded-xl border border-border bg-surface p-8">
        <ImageIcon className="mb-3 h-10 w-10 text-gray-600" />
        <p className="text-sm font-medium text-gray-300">No generated assets to review yet.</p>
        <p className="mt-1 text-xs text-gray-500">Generate images and audio in the Generation tab first.</p>
      </div>
    );
  }

  const previewImage = doneImages[currentImageIndex]?.url || '';

  return (
    <div className="flex flex-col gap-6">
      {/* Audio element for timeline preview */}
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" onLoadedMetadata={handleAudioLoaded} />}

      {/* Main Studio Area */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: 9:16 Video / Scene Player */}
        <div className="flex flex-col items-center lg:col-span-5">
          <div className="relative flex aspect-[9/16] w-full max-w-[340px] items-center justify-center overflow-hidden rounded-2xl border border-border bg-black shadow-2xl">
            {renderedVideo ? (
              <video
                ref={videoRef}
                className="h-full w-full object-contain"
                controls
                playsInline
                src={renderedVideo}
              />
            ) : previewImage ? (
              <div className="relative h-full w-full">
                <img
                  src={previewImage}
                  alt=""
                  className="h-full w-full object-cover transition-all duration-300"
                />
                {/* Overlay Caption preview */}
                {selectedClip?.caption && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                    <p className="text-center text-sm font-semibold text-white">
                      {selectedClip.caption}
                    </p>
                  </div>
                )}
                {/* Playing indicator badge */}
                {playing && (
                  <div className="absolute top-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-green-400 backdrop-blur-sm">
                    ● Live Preview ({formatTime(currentTime)})
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-gray-500 bg-surface">
                {rendering ? (
                  <div className="flex flex-col items-center gap-4 text-white">
                    <Loader2 className="h-12 w-12 animate-spin text-accent" />
                    <div>
                      <p className="text-sm font-semibold">Generating Final Video...</p>
                      <p className="text-xs text-accent mt-1">{progress}% complete</p>
                    </div>
                  </div>
                ) : (
                  <FileVideo className="h-10 w-10 text-gray-600" />
                )}
              </div>
            )}
          </div>

          {/* Player controls */}
          <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
            {renderedVideo ? (
              <button
                onClick={() => setRenderedVideo(null)}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2"
              >
                <Sliders className="mr-1.5 inline h-3.5 w-3.5" /> Back to Composition Setup
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    isSeekingRef.current = true;
                    setCurrentTime(0);
                  }}
                  className="rounded p-1.5 text-gray-400 hover:bg-surface2 hover:text-white"
                  title="Restart (0:00)"
                >
                  <SkipBack className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPlaying((p) => !p)}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3.5 py-1.5 text-xs text-white hover:bg-surface2"
                >
                  {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {playing ? 'Pause' : 'Play Timeline'} (Space)
                </button>
                <button
                  onClick={() => setFullscreen((f) => !f)}
                  className="rounded p-1.5 text-gray-400 hover:bg-surface2 hover:text-white"
                  title="Fullscreen (F)"
                >
                  <Maximize className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Right Column: Customization Controls & Start Video Generation Button */}
        <div className="space-y-4 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div>
              <h3 className="text-base font-bold text-white">Video Options & FX Studio</h3>
              <p className="text-xs text-gray-400">
                Choose your music, camera effects, subtitles, and color grading before generating.
              </p>
            </div>
            {script.duration && (
              <span className="rounded bg-accent/20 px-2.5 py-1 text-xs font-semibold text-accent uppercase tracking-wider">
                {script.duration}s Preset
              </span>
            )}
          </div>

          {/* AI Directed Summary Card */}
          {sa && (
            <div className="rounded-xl border border-accent/30 bg-accent/5 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-accent">
                  <Sparkles className="h-4 w-4" /> AI Scene Analysis
                </span>
                <span className="rounded bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent uppercase">
                  {sa.mood || 'Epic'} · {sa.pacing || 'Cinematic'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {sa.effects?.map((eff, i) => (
                  <span
                    key={`eff-${i}`}
                    className="rounded border border-border bg-surface px-2 py-0.5 text-[11px] text-gray-300"
                  >
                    Clip {i + 1}: <span className="font-semibold text-white">{eff}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 1. Background Music (BGM) */}
          <div className="rounded-xl border border-border bg-surface/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-white">
                <Music className="h-4 w-4 text-accent" /> Background Music (BGM)
              </span>
              <span className="text-xs text-gray-400">Auto-ducked under voiceover</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Music Track">
                <select
                  value={bgmTrack}
                  onChange={(e) => setBgmTrack(e.target.value)}
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                >
                  <option value="auto">Auto (Match AI Mood: {sa?.mood || 'Epic'})</option>
                  <option value="none">None (Voice Only)</option>
                  {availableTracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.mood})
                    </option>
                  ))}
                </select>
              </Field>

              {bgmTrack !== 'none' && (
                <Field label="Music Volume">
                  <input
                    type="range"
                    min="0.05"
                    max="0.40"
                    step="0.01"
                    value={bgmVolume}
                    onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-400 mt-1">{Math.round(bgmVolume * 100)}% background volume</p>
                </Field>
              )}
            </div>
          </div>

          {/* 2. Visual Effects & Transitions */}
          <div className="rounded-xl border border-border bg-surface/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-white">
                <Sliders className="h-4 w-4 text-accent" /> Motion & Transitions
              </span>
              <span className="text-xs text-gray-400">46+ xfade transitions supported</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Camera Motion Style">
                <select
                  value={globalMotion}
                  onChange={(e) => setGlobalMotion(e.target.value)}
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                >
                  <option value="auto">Auto (AI Scene Directing)</option>
                  <option value="crash-zoom">Crash Zoom (High-Energy Push)</option>
                  <option value="slow-zoom-in">Slow Zoom In (Dramatic)</option>
                  <option value="slow-zoom-out">Slow Zoom Out (Reveal)</option>
                  <option value="pan-left">Pan Left (Horizontal Sweep)</option>
                  <option value="pan-right">Pan Right (Horizontal Sweep)</option>
                  <option value="ken-burns-in">Ken Burns In (Cinematic Diagonal)</option>
                  <option value="hold">Static Framing (No Motion)</option>
                </select>
              </Field>

              <Field label="Scene Transition Style">
                <select
                  value={globalTransition}
                  onChange={(e) => setGlobalTransition(e.target.value)}
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                >
                  <option value="auto">Auto (AI Dynamic Transitions)</option>
                  <option value="slideleft">Slide Left (Fast Cut)</option>
                  <option value="slideright">Slide Right</option>
                  <option value="fade">Smooth Crossfade</option>
                  <option value="fadeblack">Fade Through Black (Dramatic)</option>
                  <option value="wipeleft">Wipe Left</option>
                  <option value="circleopen">Circle Open (Fun Zoom)</option>
                  <option value="dissolve">Dissolve</option>
                  <option value="none">Cut (No Transition)</option>
                </select>
              </Field>
            </div>
          </div>

          {/* 3. Subtitles, Color Grading & Sound FX */}
          <div className="rounded-xl border border-border bg-surface/60 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white flex items-center gap-2">
                  <Type className="h-4 w-4 text-accent" /> Auto-Generated Subtitles
                </p>
                <p className="text-xs text-gray-400">
                  Burn bold Shorts captions with glowing yellow keywords into the video
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={enableSubtitles}
                  onChange={(e) => setEnableSubtitles(e.target.checked)}
                  className="peer sr-only"
                />
                <div className="peer h-6 w-11 rounded-full bg-surface2 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-accent peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none" />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-border/50">
              <Field label="Color Grading Look">
                <select
                  value={colorGrade}
                  onChange={(e) => setColorGrade(e.target.value)}
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                >
                  <option value="auto">Auto (AI Mood: {sa?.colorGrade || 'Teal & Orange'})</option>
                  <option value="teal-orange">Teal & Orange (Cinematic Standard)</option>
                  <option value="warm-vintage">Warm Golden Hour (Vintage Glow)</option>
                  <option value="vibrant">Cyberpunk Vibrant (Electric Pop)</option>
                  <option value="dramatic-noir">Dramatic Noir (Moody Contrast)</option>
                  <option value="clean">Clean Commercial (Crisp Natural)</option>
                  <option value="none">None (Raw Output)</option>
                </select>
              </Field>

              <div className="flex flex-col justify-end gap-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={enableVignette}
                    onChange={(e) => setEnableVignette(e.target.checked)}
                    className="rounded border-border bg-surface text-accent focus:ring-0"
                  />
                  <span>Cinematic Vignette Shading</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={enableSfx}
                    onChange={(e) => setEnableSfx(e.target.checked)}
                    className="rounded border-border bg-surface text-accent focus:ring-0"
                  />
                  <span>Whoosh & Impact Sound FX</span>
                </label>
              </div>
            </div>
          </div>

          {/* Action Buttons: START VIDEO GENERATION */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={handleStartVideoGeneration}
              disabled={rendering || doneImages.length === 0 || !audioUrl}
              className={`flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold shadow-lg transition-all ${
                rendering || doneImages.length === 0 || !audioUrl
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 shadow-blue-500/20'
              }`}
            >
              {rendering ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Generating Video... {progress}%
                </>
              ) : (
                <>
                  <FileVideo className="h-5 w-5" />
                  Start Video Generation
                </>
              )}
            </button>

            {renderedVideo && (
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-sm font-bold text-white hover:bg-green-700 shadow-lg shadow-green-600/20 transition-all"
              >
                <Download className="h-5 w-5" />
                Download Final MP4
              </button>
            )}
          </div>

          {renderError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {renderError}
            </div>
          )}

          {renderedVideo && !rendering && (
            <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3 text-xs text-green-300 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 shrink-0" />
              Video generated successfully! Preview on the left or click Download Final MP4.
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Timeline Track Editor */}
      {timeline && (
        <div className="rounded-xl border border-border bg-surface p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-300">Scene Timeline & Clip Pacing</span>
            <div className="flex items-center gap-3">
              <button
                onClick={autoFixDurations}
                className="flex items-center gap-1 rounded border border-border px-2.5 py-1 text-[11px] text-gray-300 hover:bg-surface2"
              >
                <Clock className="h-3 w-3" /> Auto-balance clip durations
              </button>
              <span className="text-[11px] text-gray-400 font-mono">
                {timeline.clips.length} clips · {formatTime(timeline.totalDuration)} total
              </span>
            </div>
          </div>

          {/* Image clips track */}
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-[11px] font-medium text-gray-400">Scenes</span>
            <div className="relative flex h-16 flex-1 gap-1 overflow-x-auto rounded-lg bg-bg p-1.5 thin-scrollbar">
              {timeline.clips.map((clip) => {
                const widthPct = (clip.duration / timeline.totalDuration) * 100;
                const isSelected = clip.id === selectedClipId;
                return (
                  <button
                    key={clip.id}
                    onClick={() => setSelectedClipId(clip.id === selectedClipId ? null : clip.id)}
                    className={`relative shrink-0 overflow-hidden rounded-md border-2 transition-all ${
                      isSelected ? 'border-accent shadow-md' : 'border-transparent hover:border-gray-500'
                    }`}
                    style={{
                      width: `${Math.max(widthPct, 6)}%`,
                      minWidth: '55px',
                    }}
                  >
                    <img src={clip.imageUrl} alt="" className="h-full w-full object-cover" />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-center">
                      <span className="text-[9px] font-semibold text-gray-200">{clip.duration}s</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Audio voiceover track */}
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-[11px] font-medium text-gray-400">Voiceover</span>
            <div className="relative h-7 flex-1 rounded-lg bg-bg overflow-hidden">
              <div className="flex h-full items-center rounded-lg bg-green-500/20 px-3 border border-green-500/30">
                <Music className="mr-2 h-3.5 w-3.5 text-green-400" />
                <span className="text-[11px] font-medium text-green-400">
                  Narration Track ({formatTime(timeline.totalDuration)})
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
