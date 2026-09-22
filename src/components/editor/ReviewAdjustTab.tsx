import { useWorkspaceApi } from '../../services/workspaceApi';
import { longVideoTimeline } from '../../lib/timeline';
import { SceneVideo } from './SceneVideo';
import { AutoEditPanel } from './AutoEditPanel';
import { LocalMusicGenerator } from './LocalMusicGenerator';
import { PresenterPanel, PresenterPreview, type PresenterAvatar } from './PresenterPanel';
import { defaultPresenter, presenterCaptionLayout, type PresenterSettings } from '../../../server/src/services/presenter-settings';
import { editingPreset, type EditingSettings } from '../../../server/src/services/auto-edit';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  Download,
  FileVideo,
  Loader2,
  AlertCircle,
  CheckCircle,
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
} from 'lucide-react';
import { fitTimeline } from '../../lib/timeline';
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
  onUpdate: (patch: Partial<Script>) => unknown;
}) {
  const { fetch, profile, account } = useWorkspaceApi();
  const [presenter, setPresenter] = useState<PresenterSettings>(() => script?.presenter || defaultPresenter());
  const [presenterAvatars, setPresenterAvatars] = useState<PresenterAvatar[]>([]);
  const [renderStage, setRenderStage] = useState('Preparing video');
  useEffect(() => { setPresenter(script?.presenter || defaultPresenter()); }, [script?.id]);
  async function savePresenter() {
    const saved = await onUpdate({ presenter });
    if (saved === false) throw new Error('Could not save presenter settings.');
    setRenderedVideo(null);
  }
  const [editing, setEditing] = useState<EditingSettings>(() => script?.editing || { ...editingPreset(), enabled: profile === 'mixed' });
  useEffect(() => {
    setEditing(script?.editing || { ...editingPreset(), enabled: profile === 'mixed' });
  }, [script?.id, script?.editing]);
  const editingActive = profile !== 'shorts' && editing.enabled;
  const [editingBusy, setEditingBusy] = useState(false);
  const [musicBusy, setMusicBusy] = useState(false);
  async function changeEditing(next: EditingSettings) {
    const captionsChanged = next.captions !== editing.captions;
    const saved = await onUpdate({ editing: next, ...(captionsChanged ? { enableSubtitles: next.captions } : {}) });
    if (saved === false) throw new Error('Could not save editing settings. Try again.');
    setEditing(next); setRenderedVideo(null); setPlaying(false);
    if (captionsChanged) setEnableSubtitles(next.captions);
  }
  const [timeline, setTimeline] = useState<TimelineConfig | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const currentTimeRef = useRef(0);
  const previewRef = useRef<HTMLDivElement | null>(null);

  // Video render options & state
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [renderedVideo, setRenderedVideo] = useState<string | null>(null);
  const [renderError, setRenderError] = useState('');
  const [duration, setDuration] = useState(script?.duration || 30);
  const [resolution, setResolution] = useState<'1080x1920' | '1920x1080'>(profile !== 'shorts' ? '1920x1080' : '1080x1920');
  const [zoomFactor, setZoomFactor] = useState(1.15);
  const [transitionDuration, setTransitionDuration] = useState(0.5);
  const [globalTransition, setGlobalTransition] = useState<string>('auto');
  const [globalMotion, setGlobalMotion] = useState<string>('auto');
  const [enableSubtitles, setEnableSubtitles] = useState(script?.enableSubtitles ?? script?.editing?.captions ?? true);
  const [savingSubtitles, setSavingSubtitles] = useState(false);
  useEffect(() => { setEnableSubtitles(script?.enableSubtitles ?? script?.editing?.captions ?? true); }, [script?.id, script?.enableSubtitles]);
  async function changeSubtitles(enabled: boolean) {
    setSavingSubtitles(true); setRenderError('');
    try {
      const nextEditing = { ...editing, captions: enabled };
      const saved = await onUpdate({ enableSubtitles: enabled, ...(profile !== 'shorts' ? { editing: nextEditing } : {}) });
      if (saved === false) throw new Error('Could not save subtitle settings. Try again.');
      setEnableSubtitles(enabled);
      if (profile !== 'shorts') setEditing(nextEditing);
      setRenderedVideo(null); setPlaying(false);
    } catch (error) { setRenderError(error instanceof Error ? error.message : 'Could not save subtitles.'); }
    finally { setSavingSubtitles(false); }
  }
  const [bgmTrack, setBgmTrack] = useState(script?.timelineConfig?.bgmTrack ?? 'auto');
  const [bgmVolume, setBgmVolume] = useState(script?.timelineConfig?.bgmVolume ?? 0.15);
  const [ttsVolume, setTtsVolume] = useState(script?.timelineConfig?.ttsVolume ?? script?.ttsVolume ?? 1.0);
  const [colorGrade, setColorGrade] = useState('auto');
  const [enableVignette, setEnableVignette] = useState(true);
  const enableSfx = false;
  const [availableTracks, setAvailableTracks] = useState<{ id: string; name: string; mood: string }[]>([]);

  const playIntervalRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const renderEpoch = useRef(0);
  const mountedRef = useRef(true);
  const [undoStack, setUndoStack] = useState<TimelineConfig[]>([]);
  const [redoStack, setRedoStack] = useState<TimelineConfig[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
      audioRef.current?.pause();
      musicRef.current?.pause();
      queueMicrotask(() => {
        if (!mountedRef.current) audioCtxRef.current?.close().catch(() => {});
      });
    };
  }, []);

  function seekTo(time: number) {
    const value = Math.max(0, Math.min(duration, time));
    currentTimeRef.current = value;
    setCurrentTime(value);
    if (audioRef.current) audioRef.current.currentTime = value;
    if (musicRef.current) {
      const musicDuration = musicRef.current.duration;
      musicRef.current.currentTime = Number.isFinite(musicDuration) && musicDuration > 0 ? value % musicDuration : value;
    }
  }

  const commitTimeline = useCallback((next: TimelineConfig) => {
    setPlaying(false);
    setRenderedVideo(null);
    if (timeline) setUndoStack(stack => [...stack.slice(-49), timeline]);
    setRedoStack([]);
    setTimeline(next);
    onUpdate({ timelineConfig: next });
  }, [timeline, onUpdate]);

  const doneImages = useMemo(
    () => (script?.generatedImages || []).filter((img) => img.status === 'done' && img.url),
    [script?.generatedImages]
  );

  const audioUrl = useMemo(() => {
    const audio = script?.generatedAudio?.[0];
    return audio?.url || null;
  }, [script?.generatedAudio]);
  let syncError = '';
  if (profile !== 'shorts' && script) {
    try { longVideoTimeline(script); } catch (error) { syncError = error instanceof Error ? error.message : 'Scene timing is not ready'; }
  }

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
    const controller = new AbortController();
    const epoch = ++renderEpoch.current;
    setRenderedVideo(null);
    if (script?.id && script.generatedImages?.length && script.generatedAudio?.length) {
      fetch(`/api/render/status/${script.id}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((data) => {
          if (!mountedRef.current || controller.signal.aborted || epoch !== renderEpoch.current) return;
          if (data.status === 'running') { setRendering(true); startPolling(script.id); }
          if (data.status === 'error') setRenderError(data.error || 'Previous render failed');
          if (data.videos?.length > 0) {
            setRenderedVideo(data.videos[0].url);
          }
        })
        .catch(() => {});
    }
    return () => controller.abort();
  }, [script?.id, script?.generatedImages?.length, script?.generatedAudio?.length]);

  // Sync TTS volume when script changes
  useEffect(() => {
    const savedVol = script?.timelineConfig?.ttsVolume ?? script?.ttsVolume;
    setTtsVolume(typeof savedVol === 'number' && savedVol >= 0 ? savedVol : 1);
    setBgmTrack(script?.timelineConfig?.bgmTrack ?? 'auto');
    setBgmVolume(script?.timelineConfig?.bgmVolume ?? 0.15);
  }, [script?.id]);

  // Connect audio element to Web Audio GainNode for real-time preview volume amplification (> 1.0)
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          const source = ctx.createMediaElementSource(audioEl);
          const gainNode = ctx.createGain();
          gainNode.gain.value = ttsVolume;
          source.connect(gainNode);
          gainNode.connect(ctx.destination);
          audioCtxRef.current = ctx;
          gainNodeRef.current = gainNode;
        }
      }
    } catch {
      // Audio element may already be connected or restricted by policy
    }
  }, [audioUrl]);

  // Keep GainNode value in sync with ttsVolume slider
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = ttsVolume;
    }
    if (audioRef.current && !gainNodeRef.current) {
      audioRef.current.volume = Math.min(1.0, Math.max(0, ttsVolume));
    }
  }, [ttsVolume]);

  async function handleTtsVolumeChange(val: number) {
    const clamped = Math.round(val * 100) / 100;
    setTtsVolume(clamped);
    setRenderedVideo(null);
    try {
      const next = timeline ? { ...timeline, ttsVolume: clamped } : null;
      const saved = await onUpdate(next ? { timelineConfig: next } : { ttsVolume: clamped });
      if (saved === false) throw new Error('Could not save voice volume. Please try again.');
      if (next) setTimeline(next);
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : 'Could not save voice volume.');
    }
  }

  async function saveMusic(track: string, volume: number) {
    if (!timeline) return;
    const next = { ...timeline, bgmTrack: track, bgmVolume: volume };
    try {
      const saved = await onUpdate({ timelineConfig: next });
      if (saved === false) throw new Error('Could not save music settings. Please try again.');
      setTimeline(next);
      setRenderedVideo(null);
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : 'Could not save music settings.');
    }
  }

  function handleAudioLoaded() {
    const realDuration = audioRef.current?.duration;
    if (realDuration && Number.isFinite(realDuration)) setDuration(realDuration);
  }

  // Auto-populate timeline from generated assets (DO NOT AUTO-RENDER VIDEO)
  useEffect(() => {
    if (!script) {
      setTimeline(null);
      return;
    }

    if (profile !== 'shorts') {
      try {
        const config = longVideoTimeline(script);
        setTimeline(config); setDuration(config.totalDuration);
      } catch { setTimeline(null); }
      return;
    }
    if (script.timelineConfig) {
      setTimeline(script.timelineConfig);
      setZoomFactor(script.timelineConfig.zoomFactor);
      setResolution(script.timelineConfig.resolution.width > script.timelineConfig.resolution.height ? '1920x1080' : '1080x1920');
      setTransitionDuration(script.timelineConfig.clips[0]?.transitionDuration ?? 0.5);
      return;
    }

    if (doneImages.length === 0 || !audioUrl) {
      setTimeline(null);
      return;
    }

    const weights = sa?.timings?.length === doneImages.length && sa.timings.every(t => Number.isFinite(t) && t > 0)
      ? sa.timings : doneImages.map(() => 1);
    const weightSum = weights.reduce((sum, weight) => sum + weight, 0);

    const clips: TimelineClip[] = doneImages.map((img, i) => ({
      id: generateId(),
      imageUrl: img.url!,
      prompt: img.prompt,
      duration: (script.duration || 30) * weights[i] / weightSum,
      transition: sa?.transitions?.[i] === 'none' ? 'none' : 'crossfade',
      transitionDuration: 0.5,
      caption: '',
    }));

    const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);

    const config: TimelineConfig = {
      clips,
      audioUrl,
      totalDuration,
      resolution: { width: 1080, height: 1920 },
      zoomFactor: 1.15,
    };

    setTimeline(config);
    onUpdate({ timelineConfig: config });
  }, [script?.id, doneImages, audioUrl, script?.scenePlan, script?.generatedAudio]);

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
      musicRef.current?.pause();
      return;
    }

    if (audioRef.current) {
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      audioRef.current.currentTime = currentTimeRef.current;
      audioRef.current.play().catch(() => { setPlaying(false); setRenderError('Audio playback failed. Check the narration file.'); });
    }
    if (bgmTrack === 'ai' && musicRef.current) {
      const music = musicRef.current;
      const musicDuration = music.duration;
      const previewTime = currentTimeRef.current;
      music.currentTime = Number.isFinite(musicDuration) && musicDuration > 0 ? previewTime % musicDuration : previewTime;
      music.play().catch(() => {});
    }

    function tick() {
      const audio = audioRef.current;
      if (!audio) return;
      currentTimeRef.current = audio.currentTime;
      setCurrentTime(audio.currentTime);
      const music = musicRef.current;
      if (bgmTrack === 'ai' && music && Number.isFinite(music.duration) && music.duration > 0) {
        const expected = audio.currentTime % music.duration;
        const drift = Math.abs(music.currentTime - expected);
        if (drift > 0.25 && Math.abs(drift - music.duration) > 0.25) music.currentTime = expected;
      }
      if (audio.ended) { setPlaying(false); return; }
      playIntervalRef.current = requestAnimationFrame(tick);
    }

    playIntervalRef.current = requestAnimationFrame(tick);

    return () => {
      if (playIntervalRef.current) {
        cancelAnimationFrame(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    };
  }, [playing, timeline, bgmTrack, script?.generatedMusic?.filename]);

  useEffect(() => {
    if (musicRef.current) musicRef.current.volume = Math.min(1, Math.max(0, bgmVolume));
  }, [bgmVolume]);

  // Global keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === ' ') {
        e.preventDefault();
        if (renderedVideo && videoRef.current) {
          if (videoRef.current.paused) videoRef.current.play().catch(() => setRenderError('Video playback failed. Try downloading the rendered video.'));
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
          if (!document.fullscreenElement) previewRef.current?.requestFullscreen().catch(() => {});
          else document.exitFullscreen().catch(() => {});
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [renderedVideo]);

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

  function updateClip(clipId: string, patch: Partial<TimelineClip>) {
    if (profile !== 'shorts') return;
    if (!timeline || (patch.duration !== undefined && (!Number.isFinite(patch.duration) || patch.duration < 0.1))) return;
    const clips = timeline.clips.map(c => c.id === clipId ? { ...c, ...patch } : c);
    commitTimeline({ ...timeline, clips, totalDuration: clips.reduce((sum, c) => sum + c.duration, 0) });
  }

  function removeClip(clipId: string) {
    if (profile !== 'shorts') return;
    if (!timeline || timeline.clips.length <= 1) return;
    const index = timeline.clips.findIndex(c => c.id === clipId);
    if (index < 0) return;
    const removed = timeline.clips[index];
    const clips = timeline.clips.filter(c => c.id !== clipId).map(c => ({ ...c }));
    clips[Math.min(index, clips.length - 1)].duration += removed.duration;
    commitTimeline({ ...timeline, clips });
    setSelectedClipId(null);
  }

  function moveClip(clipId: string, direction: 'up' | 'down') {
    if (profile !== 'shorts') return;
    if (!timeline) return;
    const index = timeline.clips.findIndex(c => c.id === clipId);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= timeline.clips.length) return;
    const clips = [...timeline.clips];
    [clips[index], clips[target]] = [clips[target], clips[index]];
    commitTimeline({ ...timeline, clips });
  }

  function markSceneEnd() {
    if (profile !== 'shorts') return;
    if (!timeline || !selectedClip) return;
    const index = timeline.clips.findIndex(c => c.id === selectedClip.id);
    if (index === timeline.clips.length - 1) return;
    const start = timeline.clips.slice(0, index).reduce((sum, c) => sum + c.duration, 0);
    const pairEnd = start + selectedClip.duration + timeline.clips[index + 1].duration;
    if (currentTime <= start + 0.1 || currentTime >= pairEnd - 0.1) {
      setRenderError('Place the playhead inside this scene or the next scene, leaving at least 0.1 seconds on each side.');
      return;
    }
    const clips = timeline.clips.map(c => ({ ...c }));
    clips[index].duration = currentTime - start;
    clips[index + 1].duration = pairEnd - currentTime;
    commitTimeline({ ...timeline, clips });
    setRenderError('');
  }

  function restoreTimeline(direction: 'undo' | 'redo') {
    const stack = direction === 'undo' ? undoStack : redoStack;
    const next = stack[stack.length - 1];
    if (!next || !timeline) return;
    if (direction === 'undo') {
      setUndoStack(stack.slice(0, -1)); setRedoStack(items => [...items, timeline]);
    } else {
      setRedoStack(stack.slice(0, -1)); setUndoStack(items => [...items, timeline]);
    }
    setPlaying(false); setRenderedVideo(null); setTimeline(next);
    onUpdate({ timelineConfig: next });
  }

  function autoFixDurations() {
    if (profile !== 'shorts') return;
    if (timeline && audioUrl) commitTimeline(fitTimeline(timeline, duration));
  }

  function startPolling(scriptId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    const epoch = renderEpoch.current;
      let polling = false;
      let failures = 0;
      const progressInterval = setInterval(async () => {
        if (polling) return;
        polling = true;
        try {
          const statusRes = await fetch(`/api/render/status/${scriptId}`);
          if (!statusRes.ok) throw new Error('Cannot read render status');
          const statusData = await statusRes.json();
          if (!mountedRef.current || epoch !== renderEpoch.current) return;
          failures = 0;

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
            setRenderStage(statusData.message || 'Rendering video');
            setProgress(
              typeof statusData.progress === 'number'
                ? statusData.progress
                : Math.min(progress + 5, 90)
            );
          }
        } catch {
          if (++failures >= 5 && mountedRef.current) {
            clearInterval(progressInterval);
            setRendering(false);
            setRenderError('Lost connection to rendering. Reopen this editor to check its status.');
          }
        } finally { polling = false; }
      }, 1000);
      pollRef.current = progressInterval;
  }

  // START VIDEO GENERATION
  async function handleStartVideoGeneration() {
    if (!script || rendering || editingBusy || musicBusy || savingSubtitles) return;
    if (doneImages.length === 0) {
      setRenderError('No ready generated images found. Please generate images first.');
      return;
    }
    if (!audioUrl) {
      setRenderError('No voiceover audio found. Please generate audio first.');
      return;
    }

    if (timeline && Math.abs(timeline.totalDuration - duration) > 1 / 30) {
      setRenderError('Scene timing differs from narration. Use Fit timing to narration before rendering.');
      return;
    }
    setPlaying(false);
    videoRef.current?.pause();
    renderEpoch.current++;
    if (pollRef.current) clearInterval(pollRef.current);
    setRenderedVideo(null);
    setRendering(true);
    setProgress(5);
    setRenderStage(presenter.enabled ? 'Preparing presenter' : 'Preparing video');
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
          : (timeline?.clips.map(c => script.sceneAnalysis?.effects?.[doneImages.find(img => img.url === c.imageUrl)?.index ?? 0] || 'zoom-in') || script.sceneAnalysis?.effects || []),
      colorGrade:
        colorGrade !== 'auto' ? colorGrade : script.sceneAnalysis?.colorGrade || 'teal-orange',
    };

    try {
      const presenterSaved = await onUpdate({ presenter, enableSubtitles });
      if (presenterSaved === false) throw new Error('Could not save presenter settings.');
      if (profile !== 'shorts') {
        const saved = await onUpdate({ editing, ...(timeline ? { timelineConfig: { ...timeline, bgmTrack, bgmVolume, ttsVolume } } : {}) });
        if (saved === false) throw new Error('Could not save editing settings. Reconnect and try again.');
      }
      const res = await fetch('/api/render/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: script.id,
          imagePaths,
          audioPath,
          presenter,
          narration: script.narration || '',
          duration,
          resolution: resolution === '1080x1920' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 },
          zoomFactor,
          transitionDuration,
          sceneAnalysis: customSceneAnalysis,
          enableSubtitles,
          bgmTrack: bgmTrack === 'auto' ? (script.sceneAnalysis?.mood || 'epic') : bgmTrack,
          bgmVolume,
          ttsVolume,
          colorGrade: colorGrade === 'auto' ? (script.sceneAnalysis?.colorGrade || 'teal-orange') : colorGrade,
          enableVignette,
          enableSfx,
          ...(profile !== 'shorts' ? { editing } : {}),
          timelineConfig: timeline
            ? {
                clips: timeline.clips.map((c) => ({
                  duration: c.duration,
                  transition: globalTransition !== 'auto' ? globalTransition : c.transition,
                  transitionDuration: c.transitionDuration,
                })),
                ttsVolume,
              }
            : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Render failed');

      if (!mountedRef.current) return;
      startPolling(script.id);
    } catch (err: unknown) {
      setRendering(false);
      setRenderError(err instanceof Error ? err.message : 'Failed to render video');
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

  const previewImage = timeline?.clips[currentImageIndex]?.imageUrl || doneImages[0]?.url || '';

  return (
    <div className="flex flex-col gap-6">
      {profile !== 'shorts' && <AutoEditPanel key={script.id} scriptId={script.id} value={editing} plan={script.scenePlan} disabled={rendering || musicBusy} onChange={changeEditing} onBusyChange={setEditingBusy} />}
      {profile !== 'shorts' && <div role="status" className={`rounded-lg border p-4 text-sm ${syncError ? 'border-amber-600 text-amber-200' : 'border-emerald-700 text-emerald-200'}`}>
        {syncError || `Audio sync ready: ${script.scenePlan?.scenes.length} scenes timed to the generated narration. Scene order and durations follow the audio. Select a scene to review its spoken text.`}
      </div>}
      {/* Audio element for timeline preview */}
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" onLoadedMetadata={handleAudioLoaded} onEnded={() => setPlaying(false)} />}
      {bgmTrack === 'ai' && script.generatedMusic?.url && <audio ref={musicRef} src={script.generatedMusic.url} preload="auto" loop />}

      {/* Main Studio Area */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: 9:16 Video / Scene Player */}
        <div className="flex flex-col items-center lg:col-span-5">
          <div ref={previewRef} className={`relative flex ${resolution === '1080x1920' ? 'aspect-[9/16] max-w-[340px]' : 'aspect-video'} w-full items-center justify-center overflow-hidden rounded-2xl border border-border bg-black shadow-2xl`}>
            {renderedVideo ? (
              <video
                key={renderedVideo}
                ref={videoRef}
                className="h-full w-full object-contain"
                controls
                playsInline
                src={renderedVideo}
              />
            ) : previewImage ? (
              <div className="relative h-full w-full">
                {timeline?.clips[currentImageIndex]?.mediaType === 'video' ? <SceneVideo src={previewImage} playing={playing} time={currentTime - timeline.clips.slice(0, currentImageIndex).reduce((sum, clip) => sum + clip.duration, 0)} /> : <img
                  src={previewImage}
                  alt=""
                  className="h-full w-full object-cover transition-all duration-300"
                />}
                {/* Overlay Caption preview */}
                {enableSubtitles && (!editingActive || editing.captions) && timeline?.clips[currentImageIndex]?.caption && (
                  <div aria-label="Subtitle placement preview" className={`absolute bottom-0 left-0 right-0 p-4 ${presenter.enabled ? '' : 'bg-gradient-to-t from-black/80 to-transparent'}`} style={presenter.enabled ? (() => {
                    const avatar = presenterAvatars.find(a => a.id === presenter.avatarId);
                    if (!avatar) return undefined;
                    const width = resolution === '1920x1080' ? 1920 : 1080, height = resolution === '1920x1080' ? 1080 : 1920;
                    const layout = presenterCaptionLayout(presenter, width, height, avatar.width, avatar.height);
                    return { bottom: `${layout.bottom / height * 100}%`, left: '5%', right: '5%', padding: '0.25rem 0.5rem' };
                  })() : undefined}>
                    <p className="text-center text-sm font-semibold text-white" style={presenter.enabled ? { textShadow: '0 1px 3px black, 0 0 4px black' } : undefined}>
                      {timeline?.clips[currentImageIndex]?.caption}
                    </p>
                  </div>
                )}
                {presenter.enabled && presenterAvatars.find(a => a.id === presenter.avatarId) && <PresenterPreview avatar={presenterAvatars.find(a => a.id === presenter.avatarId)!} value={presenter} playing={playing} landscape={resolution === '1920x1080'} />}
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
                    seekTo(0);
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
                  onClick={() => previewRef.current?.requestFullscreen().catch(() => {})}
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
          <section className="rounded-xl border border-border bg-surface/60 p-4">
            <label className="flex items-center justify-between gap-3 text-sm font-semibold text-white">
              <span className="flex items-center gap-2"><Type className="h-4 w-4 text-accent" />Show subtitles</span>
              <input aria-label="Show subtitles" type="checkbox" checked={enableSubtitles} disabled={rendering || editingBusy || savingSubtitles}
                onChange={e => void changeSubtitles(e.target.checked)} className="h-4 w-4 accent-blue-500" />
            </label>
            <p className="mt-2 text-xs text-gray-400">{savingSubtitles ? 'Saving subtitle setting...' : enableSubtitles ? 'Subtitles are enabled. Turn off to remove them from the preview and next render.' : 'Subtitles are off. Your narration and avatar stay unchanged.'}</p>
          </section>
          <PresenterPanel key={script.id} value={presenter} disabled={rendering || musicBusy || editingBusy} onAvatars={setPresenterAvatars} onSave={savePresenter} onChange={value => { setPresenter(value); setRenderedVideo(null); }} />
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-300">
            <label>Format <select aria-label="Video format" disabled={profile !== 'shorts'} value={resolution} onChange={e => {
              const value = e.target.value as typeof resolution; setResolution(value);
              if (timeline) commitTimeline({ ...timeline, resolution: value === '1080x1920' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 } });
            }} className="rounded bg-surface p-2">
              {profile === 'shorts' && <option value="1080x1920">Portrait 9:16</option>}<option value="1920x1080">Landscape 16:9</option>
            </select></label>
            <label>Zoom <input disabled={editingActive} aria-label="Camera zoom" type="number" min="1" max="2" step="0.05" value={zoomFactor} onChange={e => {
              const value = Number(e.target.value); if (Number.isFinite(value) && value >= 1 && value <= 2) { setZoomFactor(value); if (timeline) commitTimeline({ ...timeline, zoomFactor: value }); }
            }} className="w-20 rounded bg-surface p-2" /></label>
          </div>
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div>
              <h3 className="text-base font-bold text-white">Video Options & FX Studio</h3>
              <p className="text-xs text-gray-400">
                Choose your music, camera effects, subtitles, and color grading before generating.
              </p>
            </div>
            {script.duration && (
              <span className="rounded bg-accent/20 px-2.5 py-1 text-xs font-semibold text-accent uppercase tracking-wider">
                {formatTime(duration)} {profile !== 'shorts' ? 'narration' : 'timeline'}
              </span>
            )}
          </div>

          {/* AI Directed Summary Card */}
          {sa && !editingActive && (
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

          {/* 1. Audio & Voiceover Mix (TTS & BGM) */}
          <div className="rounded-xl border border-border bg-surface/60 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-white">
                <Volume2 className="h-4 w-4 text-accent" /> Audio & Voiceover Mix
              </span>
              <span className="text-xs text-gray-400">TTS narration volume & background music</span>
            </div>

            {/* TTS Voiceover Volume Control */}
            <div className="rounded-lg border border-border/70 bg-bg/50 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white">TTS Voiceover Volume</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      ttsVolume > 1.0
                        ? 'bg-accent/20 text-accent'
                        : ttsVolume < 1.0
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-surface2 text-gray-300'
                    }`}
                  >
                    {Math.round(ttsVolume * 100)}% {ttsVolume > 1.0 ? `(+${Math.round((ttsVolume - 1) * 100)}% Boost)` : ttsVolume === 1.0 ? '(Normal)' : ''}
                  </span>
                </div>
                {ttsVolume !== 1.0 && (
                  <button
                    type="button"
                    onClick={() => handleTtsVolumeChange(1.0)}
                    className="text-[11px] text-accent hover:underline"
                  >
                    Reset (100%)
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.05"
                  value={ttsVolume}
                  onChange={(e) => handleTtsVolumeChange(parseFloat(e.target.value))}
                  className="flex-1"
                />
                <span className="w-12 text-right font-mono text-xs font-semibold text-gray-300">
                  {ttsVolume.toFixed(2)}x
                </span>
              </div>

              {/* Quick preset chips */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] text-gray-500 font-medium">Presets:</span>
                {[
                  { label: '80%', val: 0.8 },
                  { label: '100% Normal', val: 1.0 },
                  { label: '130% Boost', val: 1.3 },
                  { label: '160% Boost', val: 1.6 },
                  { label: '200% (2x)', val: 2.0 },
                  { label: '250% (Max)', val: 2.5 },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handleTtsVolumeChange(p.val)}
                    className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                      Math.abs(ttsVolume - p.val) < 0.03
                        ? 'bg-accent text-white'
                        : 'border border-border/70 bg-surface text-gray-400 hover:bg-surface2 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Background Music (BGM) */}
            <Field label="Music source">
              <select aria-label="Music source" value={bgmTrack === 'ai' ? 'ai' : 'local'} disabled={rendering || editingBusy || musicBusy}
                onChange={e => { const track = e.target.value === 'ai' ? 'ai' : 'auto'; setBgmTrack(track); void saveMusic(track, bgmVolume); }}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-white">
                <option value="local">Local music library</option>
                <option value="ai">AI-generated music · local ACE-Step</option>
              </select>
            </Field>
            {bgmTrack === 'ai' && <LocalMusicGenerator script={script} targetDuration={duration} disabled={rendering || editingBusy} onBusyChange={setMusicBusy} onReady={async music => {
              const saved = await onUpdate({ generatedMusic: music });
              if (saved === false) throw new Error('Music is generated, but the page could not refresh. Reload this project.');
              setRenderedVideo(null);
            }} />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {bgmTrack !== 'ai' && <Field label="Music Track">
                <select
                  value={bgmTrack}
                  aria-label="Music track"
                  onChange={(e) => { setBgmTrack(e.target.value); void saveMusic(e.target.value, bgmVolume); }}
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
                {!['auto', 'none'].includes(bgmTrack) && <audio aria-label="Local music preview" controls preload="none" src={`/api/accounts/${account.id}/profiles/${profile}/render/music/local/${encodeURIComponent(bgmTrack)}`} className="mt-2 w-full" />}
              </Field>}

              {bgmTrack !== 'none' && (
                <Field label="Music Volume">
                  <input
                    type="range"
                    min="0.05"
                    max="0.40"
                    step="0.01"
                    value={bgmVolume}
                    aria-label="Music volume"
                    onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
                    onBlur={() => void saveMusic(bgmTrack, bgmVolume)}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-400 mt-1">{Math.round(bgmVolume * 100)}% background volume</p>
                </Field>
              )}
            </div>
          </div>

          {/* 2. Visual Effects & Transitions */}
          {!editingActive && <div className="rounded-xl border border-border bg-surface/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-white">
                <Sliders className="h-4 w-4 text-accent" /> Motion & Transitions
              </span>
              <span className="text-xs text-gray-400">Render to preview effects</span>
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
                  disabled={profile !== 'shorts'}
                  onChange={(e) => setGlobalTransition(e.target.value)}
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                >
                  <option value="auto">{profile !== 'shorts' ? 'Cuts at narration boundaries' : 'Auto (AI Dynamic Transitions)'}</option>
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
          </div>}

          {/* 3. Subtitles, Color Grading & Sound FX */}
          {!editingActive && <div className="rounded-xl border border-border bg-surface/60 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white flex items-center gap-2">
                  <Type className="h-4 w-4 text-accent" /> {profile !== 'shorts' ? 'Scene Captions' : 'Auto-Generated Subtitles'}
                </p>
                <p className="text-xs text-gray-400">
                  {profile !== 'shorts' ? 'Each scene’s narration stays visible for its measured audio segment.' : 'Estimated captions: word timing is approximate until speech alignment is added'}
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={enableSubtitles}
                  aria-label="Subtitles (manual editing)"
                  disabled={rendering || savingSubtitles}
                  onChange={(e) => void changeSubtitles(e.target.checked)}
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

              </div>
            </div>
          </div>

          }
          {/* Action Buttons: START VIDEO GENERATION */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={handleStartVideoGeneration}
              disabled={rendering || editingBusy || musicBusy || savingSubtitles || (bgmTrack === 'ai' && !script.generatedMusic) || doneImages.length === 0 || !audioUrl || Boolean(syncError)}
              className={`flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold shadow-lg transition-all ${
                rendering || doneImages.length === 0 || !audioUrl
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 shadow-blue-500/20'
              }`}
            >
              {rendering ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {renderStage}... {progress}%
                </>
              ) : (
                <>
                  <FileVideo className="h-5 w-5" />
                  Start Video Generation
                </>
              )}
            </button>

            {rendering && <button onClick={async () => {
              try {
                const response = await fetch('/api/render/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scriptId: script.id }) });
                if (!response.ok) throw new Error('Cancellation failed');
              } catch { setRenderError('Could not cancel. Check the server connection.'); }
            }} className="rounded-lg border border-border px-4 py-3 text-sm text-gray-300">Cancel render</button>}
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
          <div className="flex items-center gap-3 text-xs text-gray-300">
            <button disabled={!undoStack.length} onClick={() => restoreTimeline('undo')} className="disabled:opacity-30">Undo</button>
            <button disabled={!redoStack.length} onClick={() => restoreTimeline('redo')} className="disabled:opacity-30">Redo</button>
            <span className="ml-auto font-mono">{currentTime.toFixed(2)} / {duration.toFixed(2)} seconds</span>
          </div>
          <input aria-label="Narration playhead" type="range" min="0" max={duration} step="0.01" value={currentTime}
            onChange={e => seekTo(Number(e.target.value))} className="w-full accent-blue-500" />
          <p className="text-xs text-gray-400">{profile !== 'shorts' ? 'Scene cuts follow measured narration boundaries. Edit scene text in the script response and extract again to change timing.' : 'Listen to the narration, select a scene, then mark where it should end. Preview shows scene cuts; render to check motion and transitions.'}</p>
          {Math.abs(timeline.totalDuration - duration) > 1 / 30 && (
            <p role="status" className="text-xs text-amber-300">Timeline differs from narration by {(timeline.totalDuration - duration).toFixed(2)}s. Fit timing before rendering; this preserves relative scene lengths.</p>
          )}
          {selectedClip && (
            <div className="rounded-lg border border-border bg-bg p-3 space-y-3 text-xs text-gray-300">
              <p className="text-white">Scene {timeline.clips.findIndex(c => c.id === selectedClip.id) + 1}: {selectedClip.prompt}</p>
              {profile !== 'shorts' && <p className="text-emerald-200">Narration: {selectedClip.caption}</p>}
              <fieldset disabled={profile !== 'shorts'} className="flex flex-wrap items-center gap-3 disabled:opacity-50">
                <label>Duration (seconds) <input aria-label="Scene duration" type="number" min="0.1" step="0.1" value={Number(selectedClip.duration.toFixed(3))}
                  onChange={e => updateClip(selectedClip.id, { duration: Number(e.target.value) })} className="w-24 rounded bg-surface p-2" /></label>
                <label>Transition <select aria-label="Scene transition" value={selectedClip.transition} onChange={e => updateClip(selectedClip.id, { transition: e.target.value as TimelineClip['transition'] })} className="rounded bg-surface p-2">
                  <option value="crossfade">Crossfade</option><option value="none">Cut</option>
                </select></label>
                <label>Fade seconds <input aria-label="Scene fade duration" type="number" min="0" max="3" step="0.1" value={selectedClip.transitionDuration}
                  onChange={e => { const value = Number(e.target.value); if (Number.isFinite(value) && value >= 0 && value <= 3) updateClip(selectedClip.id, { transitionDuration: value }); }} className="w-20 rounded bg-surface p-2" /></label>
              </fieldset>
              <fieldset disabled={profile !== 'shorts'} className="flex flex-wrap gap-4 disabled:opacity-50">
                <button onClick={() => moveClip(selectedClip.id, 'up')} className="flex items-center gap-1"><MoveUp size={14} />Earlier</button>
                <button onClick={() => moveClip(selectedClip.id, 'down')} className="flex items-center gap-1"><MoveDown size={14} />Later</button>
                <button onClick={markSceneEnd} disabled={timeline.clips[timeline.clips.length - 1]?.id === selectedClip.id} className="disabled:opacity-30">End scene at playhead</button>
                <button disabled={timeline.clips.length <= 1} onClick={() => removeClip(selectedClip.id)} className="text-red-300 disabled:opacity-30">Remove scene</button>
              </fieldset>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-300">Scene Timeline & Clip Pacing</span>
            <div className="flex items-center gap-3">
              <button
                onClick={autoFixDurations}
                disabled={profile !== 'shorts'}
                className="flex items-center gap-1 rounded border border-border px-2.5 py-1 text-[11px] text-gray-300 hover:bg-surface2"
              >
                <Clock className="h-3 w-3" /> Fit timing to narration
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
                    {clip.mediaType === 'video' ? <video src={clip.imageUrl} muted preload="metadata" className="h-full w-full object-cover" /> : <img src={clip.imageUrl} alt="" className="h-full w-full object-cover" />}
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
                  Narration Track ({formatTime(duration)})
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
