import { useState, useEffect, useRef } from 'react';
import {
  Music,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Download,
  Loader2,
  Volume2,
  Film,
  Video,
  Image as ImageIcon,
  ShieldCheck,
  RotateCcw,
  Trash2,
  Upload,
  Plus,
  Wand2,
  ChevronDown,
  ChevronUp,
  XCircle,
  Activity,
  Zap,
  Type,
  Maximize2,
  Scissors,
  Sliders,
  Smartphone,
  Monitor,
  Eye,
  Play,
  Pause,
  Mic,
} from 'lucide-react';
import { useWorkspaceApi } from '../../services/workspaceApi';
import type { Script } from '../../data';
import { FlowMusicSettingsSection, type FlowMusicConfig } from '../scripts/FlowMusicSettingsSection';

export interface FlowSceneDraft {
  line: string;
  caption: string;
  tag?: string;
  duration: number;
  effect: 'zoom-in' | 'zoom-out' | 'pan-up' | 'pan-left';
  prompt: string;
  sectionType?: string;
  imageType?: string;
}

type BeatSubtitleStyleUi = 'motion' | 'karaoke' | 'pop' | 'glow';
type BeatSubtitleSizeUi = 'small' | 'medium' | 'large' | 'huge' | number;
type BeatIntensityUi = 'subtle' | 'balanced' | 'hype';

export function getEffectiveSubtitlePx(
  size: BeatSubtitleSizeUi | undefined,
  style: BeatSubtitleStyleUi = 'motion'
): number {
  if (typeof size === 'number' && !isNaN(size) && size > 0) {
    return Math.min(280, Math.max(50, Math.round(size)));
  }
  if (size === 'small') return style === 'motion' ? 77 : 48;
  if (size === 'large') return style === 'motion' ? 120 : 73;
  if (size === 'huge') return style === 'motion' ? 195 : 120;
  return style === 'motion' ? 180 : 58;
}

export function getSubtitleSizeCategory(px: number): {
  label: string;
  color: string;
  desc: string;
  badgeGradient: string;
} {
  if (px < 85) {
    return {
      label: 'Compact',
      color: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
      desc: 'Subtle clean captions',
      badgeGradient: 'from-emerald-500 to-teal-500',
    };
  }
  if (px < 125) {
    return {
      label: 'Standard',
      color: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
      desc: 'Balanced bold subtitles',
      badgeGradient: 'from-sky-500 to-cyan-500',
    };
  }
  if (px < 170) {
    return {
      label: 'Large Reel',
      color: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
      desc: 'High-impact reel subtitle',
      badgeGradient: 'from-amber-500 to-yellow-500',
    };
  }
  if (px < 225) {
    return {
      label: 'Huge Reel 🔥',
      color: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
      desc: 'Massive screen-slamming bold words',
      badgeGradient: 'from-orange-500 to-amber-500',
    };
  }
  return {
    label: 'Ultra Massive 🔥🔥',
    color: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
    desc: 'Maximized screen-filling words',
    badgeGradient: 'from-rose-500 to-pink-500',
  };
}

interface BeatDropInfo {
  start: number;
  end: number;
  strength: number;
}

interface BeatInfo {
  duration: number;
  bpm: number;
  beatInterval: number;
  beats: number[];
  downbeats: number[];
  onsets: Array<{ time: number; strength: number }>;
  drops: BeatDropInfo[];
  energy: number[];
  reliable: boolean;
  source: 'analysis' | 'fallback';
}

interface BeatEditUiOptions {
  enabled: boolean;
  subtitleStyle: BeatSubtitleStyleUi;
  subtitleSize: BeatSubtitleSizeUi;
  intensity: BeatIntensityUi;
  snapCuts: boolean;
  punchZoom: boolean;
  flashes: boolean;
  shakeDrops: boolean;
}

const DEFAULT_BEAT_EDIT: BeatEditUiOptions = {
  enabled: true,
  subtitleStyle: 'motion',
  subtitleSize: 180,
  intensity: 'balanced',
  snapCuts: true,
  punchZoom: true,
  flashes: true,
  shakeDrops: true,
};

const EMPTY_FLOW_SETTINGS: Partial<FlowMusicConfig> = {
  enabled: false,
  prompt: '',
  lyrics: '',
  lyricsMode: 'custom',
  language: 'auto',
  title: '',
  mood: '',
  theme: '',
  vocalProfile: 'male',
  sfxBooms: false,
  sfxRisers: false,
  dholPercussion: false,
  brassSwells: false,
  duration: 60,
  bpm: 110,
  producerModel: 'Google Lyria / Flow Music',
  imageOnlyReel: true,
  letterboxBanner: '',
  vfxParticles: false,
};

function slugifyFilename(value: string, fallback: string): string {
  const clean = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return clean || fallback;
}

export function GoogleFlowMusicContent({
  script,
  onUpdate,
}: {
  script?: Script | null;
  onUpdate?: (patch: Partial<Script>) => void;
}) {
  const { fetch, account } = useWorkspaceApi();
  const [workspaceScripts, setWorkspaceScripts] = useState<Script[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState<string>(
    script?.id || 'flow_studio_custom'
  );

  const [flowSettings, setFlowSettings] = useState<Partial<FlowMusicConfig>>(() => {
    const saved = (script?.autoPilotSettings as any)?.flowMusic;
    return saved ? { ...EMPTY_FLOW_SETTINGS, ...saved } : { ...EMPTY_FLOW_SETTINGS };
  });
  const [scenes, setScenes] = useState<FlowSceneDraft[]>([]);
  const [settingsExpanded, setSettingsExpanded] = useState(true);
  const [storyboardExpanded, setStoryboardExpanded] = useState(true);
  const [planningScenes, setPlanningScenes] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [activeMusicJobId, setActiveMusicJobId] = useState<string | null>(null);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [stage, setStage] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [musicUrl, setMusicUrl] = useState<string | null>(script?.generatedMusic?.url || null);
  const [trackTitle, setTrackTitle] = useState<string>('');
  const [transcription, setTranscription] = useState<string>('');

  const [songApproved, setSongApproved] = useState(false);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  // Rejection loop: reject → refine lyrics/settings → regenerate
  const [songRejected, setSongRejected] = useState(false);
  const [rejectedNote, setRejectedNote] = useState('');
  const [rejectCount, setRejectCount] = useState(0);
  const [showRejectInput, setShowRejectInput] = useState(false);

  // Beat Edit Studio (beat-synced subtitles & editing)
  const [beatEdit, setBeatEdit] = useState<BeatEditUiOptions>({ ...DEFAULT_BEAT_EDIT });
  const [beatInfo, setBeatInfo] = useState<BeatInfo | null>(null);
  const [analyzingBeats, setAnalyzingBeats] = useState(false);
  const [beatError, setBeatError] = useState('');

  const [videoGenerating, setVideoGenerating] = useState(false);
  const [activeVideoJobId, setActiveVideoJobId] = useState<string | null>(null);
  const [videoStage, setVideoStage] = useState('');
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoError, setVideoError] = useState('');
  const [videoSuccess, setVideoSuccess] = useState('');

  const [shortsVideoUrl, setShortsVideoUrl] = useState<string | null>(null);
  const [longVideoUrl, setLongVideoUrl] = useState<string | null>(null);
  const [videoFormat, setVideoFormat] = useState<'shorts' | 'long' | 'both'>('shorts');
  const [sceneImages, setSceneImages] = useState<
    Array<{ line: string; prompt: string; filename: string; url: string }>
  >([]);
  const [regeneratingScene, setRegeneratingScene] = useState<string | null>(null);

  // Live Subtitle & Screen Preview state
  const [previewFormat, setPreviewFormat] = useState<'shorts' | 'long'>('shorts');
  const [previewText, setPreviewText] = useState('⚡ FEEL THE BEAT');
  const [previewPulsing, setPreviewPulsing] = useState(false);
  const [showSafeZones, setShowSafeZones] = useState(true);

  // Sync preview format when videoFormat changes
  useEffect(() => {
    if (videoFormat === 'long') setPreviewFormat('long');
    else if (videoFormat === 'shorts') setPreviewFormat('shorts');
  }, [videoFormat]);

  // Sync sample text from song lyrics
  useEffect(() => {
    if (flowSettings.lyrics?.trim()) {
      const firstLine = flowSettings.lyrics
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.length > 0 && !l.startsWith('[') && !l.startsWith('('));
      if (firstLine) {
        const words = firstLine.split(/\s+/).filter(Boolean);
        setPreviewText(words.slice(0, 3).join(' '));
      }
    }
  }, [flowSettings.lyrics]);

  // Live heartbeat pulse preview at track BPM
  useEffect(() => {
    const bpm = Number(flowSettings.bpm) || 120;
    const intervalMs = Math.max(350, Math.round((60 / bpm) * 1000));
    const timer = setInterval(() => {
      setPreviewPulsing(true);
      setTimeout(() => setPreviewPulsing(false), 140);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [flowSettings.bpm]);

  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const draftLoadedRef = useRef(false);
  const sessionTokenRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const targetScriptId = script?.id || selectedScriptId || 'flow_studio_custom';

  const loadWorkspaceScripts = async () => {
    if (script?.id) return;
    try {
      const res = await fetch('/api/scripts');
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) setWorkspaceScripts(list);
      }
    } catch {}
  };

  const loadApprovalAndVideos = async (activeId: string) => {
    try {
      const appRes = await fetch(`/api/flow-music/approval/${encodeURIComponent(activeId)}`);
      if (appRes.ok) {
        const appData = await appRes.json();
        setSongApproved(Boolean(appData.approved));
        setApprovedAt(appData.approvedAt || null);
        setSongRejected(Boolean(appData.rejected));
        setRejectedNote(appData.rejectNote || '');
        setRejectCount(Number(appData.rejectCount) || 0);
      }

      const vidRes = await fetch('/api/flow-music/latest-videos');
      if (vidRes.ok) {
        const vidData = await vidRes.json();
        setShortsVideoUrl(vidData.shorts?.url || null);
        setLongVideoUrl(vidData.long?.url || null);
        if (Array.isArray(vidData.images) && vidData.images.length > 0) {
          setSceneImages(vidData.images);
        }
      }
    } catch {}
  };

  const loadInitialStudioState = async () => {
    try {
      if (!script?.id) {
        const stateRes = await fetch('/api/flow-music/state');
        if (stateRes.ok) {
          const st = await stateRes.json();
          if (st?.scriptId) setSelectedScriptId(st.scriptId);
          setFlowSettings({
            ...EMPTY_FLOW_SETTINGS,
            ...st,
          });
          if (Array.isArray(st?.scenes)) {
            setScenes(st.scenes);
          }
        }
      }
    } catch {} finally {
      draftLoadedRef.current = true;
    }

    if (script?.generatedMusic?.url) {
      setMusicUrl(script.generatedMusic.url);
      setTrackTitle(script.name || 'Attached Script Soundtrack');
      if ((script.generatedMusic as any).transcription) {
        setTranscription((script.generatedMusic as any).transcription);
      }
      return;
    }

    try {
      const res = await fetch('/api/flow-music/latest-track');
      if (res.ok) {
        const data = await res.json();
        if (data?.track?.url) {
          setMusicUrl(data.track.url);
          setTrackTitle(data.track.title || data.track.filename || 'Generated Track');
          if (data.track.transcription) {
            setTranscription(data.track.transcription);
          }
        }
      }
    } catch {}
  };

  useEffect(() => {
    void loadWorkspaceScripts();
    void loadInitialStudioState();
  }, [script?.id]);

  useEffect(() => {
    void loadApprovalAndVideos(targetScriptId);
  }, [targetScriptId]);

  // Persist standalone draft edits cleanly (skipped before initial load finishes)
  useEffect(() => {
    if (script?.id || !draftLoadedRef.current) return;
    const timer = setTimeout(() => {
      void fetch('/api/flow-music/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: selectedScriptId,
          ...flowSettings,
          scenes,
        }),
      }).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [selectedScriptId, flowSettings, scenes, script?.id]);

  const updateSettings = (patch: Partial<FlowMusicConfig>) => {
    setFlowSettings((prev) => {
      const next = { ...prev, ...patch };
      if (script && onUpdate) {
        onUpdate({
          autoPilotSettings: {
            ...(script.autoPilotSettings as any),
            flowMusic: next,
          },
        } as any);
      }
      return next;
    });
  };

  const handleSelectWorkspaceScript = (newId: string) => {
    setSelectedScriptId(newId);
    setError('');
    setSuccess('');
    if (newId === 'flow_studio_custom') return;
    const chosen = workspaceScripts.find((s) => s.id === newId);
    if (!chosen) return;
    const extractedLines =
      chosen.narration?.trim() ||
      (Array.isArray(chosen.scenePlan?.scenes)
        ? chosen.scenePlan.scenes.map((sc: any) => sc.narration || sc.line || '').filter(Boolean).join('\n')
        : Array.isArray(chosen.imagePrompts)
          ? chosen.imagePrompts.join('\n')
          : '');
    updateSettings({
      title: chosen.topicName || chosen.name || '',
      theme: chosen.topicName || chosen.name || '',
      lyrics: extractedLines,
    });
    if (chosen.generatedMusic?.url) {
      setMusicUrl(chosen.generatedMusic.url);
      setTrackTitle(chosen.name || 'Script Soundtrack');
      if ((chosen.generatedMusic as any).transcription) {
        setTranscription((chosen.generatedMusic as any).transcription);
      }
    }
    setSuccess(`Loaded script "${chosen.name}". Click "Build Scenes from Script" to prepare keyframes.`);
  };


  const handlePlanScenes = async () => {
    setPlanningScenes(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/flow-music/plan-scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lyrics: flowSettings.lyrics || '',
          topic: flowSettings.title || flowSettings.theme || '',
          mood: flowSettings.mood || flowSettings.prompt || '',
          theme: flowSettings.theme || '',
          duration: flowSettings.duration || 60,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not plan scenes');
      if (Array.isArray(data.scenes)) {
        setScenes(data.scenes);
        setStoryboardExpanded(true);
        setSuccess(`Built ${data.scenes.length} editable scenes from your script!`);
      }
    } catch (e: any) {
      setError(e?.message || 'Scene planning failed');
    } finally {
      setPlanningScenes(false);
    }
  };

  const handleResetAll = async () => {
    setResetting(true);
    sessionTokenRef.current += 1;
    setError('');
    setVideoError('');
    setSuccess('');
    setVideoSuccess('');
    try {
      const res = await fetch('/api/flow-music/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: targetScriptId,
          scope: 'all',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Reset failed');

      setGenerating(false);
      setActiveMusicJobId(null);
      setVideoGenerating(false);
      setActiveVideoJobId(null);
      setStage('');
      setProgress(0);
      setVideoStage('');
      setVideoProgress(0);

      setSelectedScriptId(script?.id || 'flow_studio_custom');
      setFlowSettings({ ...EMPTY_FLOW_SETTINGS });
      setScenes([]);
      setMusicUrl(null);
      setTrackTitle('');
      setSongApproved(false);
      setApprovedAt(null);
      setSongRejected(false);
      setRejectedNote('');
      setRejectCount(0);
      setShowRejectInput(false);
      setBeatInfo(null);
      setBeatEdit({ ...DEFAULT_BEAT_EDIT });
      setVideoFormat('shorts');
      setSceneImages([]);
      setShortsVideoUrl(null);
      setLongVideoUrl(null);
      setConfirmResetOpen(false);
      setSettingsExpanded(true);

      if (script && onUpdate) {
        onUpdate({
          generatedMusic: undefined,
          autoPilotSettings: {
            ...(script.autoPilotSettings as any),
            flowMusic: { ...EMPTY_FLOW_SETTINGS },
          },
        } as any);
      }

      setSuccess(data.message || 'Workspace reset! Write or paste a fresh script below to start again.');
    } catch (e: any) {
      setError(e?.message || 'Failed to reset Flow Music workspace');
    } finally {
      setResetting(false);
    }
  };

  const handleClearVideosOnly = async () => {
    setVideoError('');
    setVideoSuccess('');
    try {
      const res = await fetch('/api/flow-music/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: targetScriptId,
          scope: 'videos',
        }),
      });
      if (res.ok) {
        setSceneImages([]);
        setShortsVideoUrl(null);
        setLongVideoUrl(null);
        setVideoSuccess('Cleared rendered videos & keyframe gallery. Ready to re-render cleanly.');
      }
    } catch {}
  };

  const handleUploadTrack = async (file: File) => {
    setUploadingAudio(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/flow-music/upload-track', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'x-track-filename': encodeURIComponent(file.name),
          'x-track-title': encodeURIComponent(flowSettings.title || file.name.replace(/\.[^.]+$/, '')),
          'x-script-id': encodeURIComponent(targetScriptId),
        },
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setMusicUrl(data.track.url);
      setTrackTitle(data.track.title || file.name);
      setTranscription(data.track.transcription || '');
      setSongApproved(true);
      setApprovedAt(new Date().toISOString());
      setSongRejected(false);
      setRejectedNote('');
      setBeatInfo(null);
      setBeatError('');
      setSuccess(`Uploaded "${data.track.title || file.name}". Track is approved & ready for video production!`);

      if (script && onUpdate) {
        onUpdate({
          generatedMusic: {
            filename: data.track.filename,
            url: data.track.url,
            prompt: flowSettings.prompt || '',
            duration: flowSettings.duration || 60,
            seed: 42,
            contextHash: `upload_${Date.now()}`,
            transcription: data.track.transcription || '',
            createdAt: new Date().toISOString(),
          },
        });
      }

      // Automatically analyze beats so Step 3 is ready immediately
      void handleAnalyzeBeats();
    } catch (e: any) {
      setError(e?.message || 'Audio upload failed');
    } finally {
      setUploadingAudio(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleApproveSong = async () => {
    setApproving(true);
    setError('');
    try {
      const res = await fetch('/api/flow-music/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: targetScriptId,
          approved: true,
          songUrl: musicUrl,
          trackTitle: trackTitle || flowSettings.title || 'Custom Track',
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to update approval');
      }
      setSongApproved(true);
      setSongRejected(false);
      setRejectedNote('');
      setApprovedAt(new Date().toISOString());
      setSuccess('Song approved! Beat-synced short production is unlocked — check the Beat Edit Studio below.');
      // Beat analysis runs automatically so the edit studio is ready
      void handleAnalyzeBeats();
    } catch (e: any) {
      setError(e.message || 'Error updating approval');
    } finally {
      setApproving(false);
    }
  };

  const handleRejectSong = async () => {
    setApproving(true);
    setError('');
    try {
      const res = await fetch('/api/flow-music/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: targetScriptId,
          approved: false,
          action: 'reject',
          songUrl: musicUrl,
          trackTitle: trackTitle || flowSettings.title || 'Custom Track',
          note: rejectedNote,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to reject track');

      setSongApproved(false);
      setApprovedAt(null);
      setSongRejected(true);
      setRejectCount((c) => c + 1);
      setShowRejectInput(false);
      setSuccess(
        rejectedNote.trim()
          ? 'Track rejected. Your note was saved — refine the lyrics & settings below, then regenerate.'
          : 'Track rejected. Refine the lyrics & settings below, then regenerate.'
      );
      document.getElementById('flow-step-1')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e: any) {
      setError(e.message || 'Error rejecting track');
    } finally {
      setApproving(false);
    }
  };

  const handleAnalyzeBeats = async (force = false) => {
    if (!musicUrl) return;
    setAnalyzingBeats(true);
    setBeatError('');
    try {
      const res = await fetch('/api/flow-music/analyze-beats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: targetScriptId,
          songUrl: musicUrl || undefined,
          bpmHint: Number(flowSettings.bpm) || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Beat analysis failed');
      setBeatInfo(data as BeatInfo);
      if (force) setSuccess(`Beat map ready: ${data.bpm} BPM · ${data.beats?.length || 0} beats · ${data.drops?.length || 0} bass drops.`);
    } catch (e: any) {
      setBeatError(e?.message || 'Beat analysis failed');
    } finally {
      setAnalyzingBeats(false);
    }
  };

  const handleCancelMusicJob = async () => {
    sessionTokenRef.current += 1;
    if (activeMusicJobId) {
      await fetch(`/api/flow-music/jobs/${activeMusicJobId}/cancel`, { method: 'POST' }).catch(() => {});
    }
    setGenerating(false);
    setActiveMusicJobId(null);
    setStage('Track generation cancelled.');
  };

  const handleCancelVideoJob = async () => {
    sessionTokenRef.current += 1;
    if (activeVideoJobId) {
      await fetch(`/api/flow-music/video-job/${activeVideoJobId}/cancel`, { method: 'POST' }).catch(() => {});
    }
    setVideoGenerating(false);
    setActiveVideoJobId(null);
    setVideoStage('Video rendering cancelled.');
  };

  const handleGenerate = async () => {
    const token = ++sessionTokenRef.current;
    setGenerating(true);
    setError('');
    setSuccess('');
    setStage('Starting Google Flow Music generation...');
    setProgress(5);
    setTranscription('');

    // Keep user settings raw
    const regenSettings = { ...flowSettings };

    try {
      const res = await fetch('/api/flow-music/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: targetScriptId,
          settings: regenSettings,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to start generation');
      }

      const jobData = await res.json();
      const jobId = jobData.id;
      setActiveMusicJobId(jobId);

      let done = false;
      while (!done) {
        await new Promise((r) => setTimeout(r, 2000));
        if (token !== sessionTokenRef.current) return;

        const pollRes = await fetch(`/api/flow-music/jobs/${jobId}`);
        if (!pollRes.ok) continue;

        const currentJob = await pollRes.json();
        if (token !== sessionTokenRef.current) return;
        setStage(currentJob.stage || 'Generating...');
        setProgress(currentJob.progress || 20);

        if (currentJob.state === 'done') {
          done = true;
          setSuccess('Audio track generated! Listen below, then Approve to continue or Reject to refine.');
          setTrackTitle(flowSettings.title?.trim() || 'Generated Flow Music Track');
          setSongApproved(false);
          setApprovedAt(null);
          // A fresh track clears the previous rejection and any stale beat map
          setSongRejected(false);
          setRejectedNote('');
          setBeatInfo(null);
          if (currentJob.transcription) {
            setTranscription(currentJob.transcription);
          }
          if (currentJob.downloadUrl) {
            setMusicUrl(currentJob.downloadUrl);
            if (script && onUpdate) {
              onUpdate({
                generatedMusic: {
                  filename: `flow_music_${jobId}.mp3`,
                  url: currentJob.downloadUrl,
                  prompt: flowSettings.prompt || '',
                  duration: flowSettings.duration || 60,
                  seed: 42,
                  contextHash: `flow_${jobId}`,
                  transcription: currentJob.transcription || '',
                  createdAt: new Date().toISOString(),
                },
              });
            }
          }
        } else if (currentJob.state === 'cancelled') {
          done = true;
        } else if (currentJob.state === 'error') {
          done = true;
          throw new Error(currentJob.error || 'Generation failed');
        }
      }
    } catch (err: any) {
      if (token === sessionTokenRef.current) {
        setError(err?.message || 'Error generating Flow Music');
      }
    } finally {
      if (token === sessionTokenRef.current) {
        setGenerating(false);
        setActiveMusicJobId(null);
      }
    }
  };

  const handleGenerateVideos = async (options?: { reuseImages?: boolean }) => {
    if (!songApproved) {
      if (musicUrl) {
        // Automatically approve and proceed
        await handleApproveSong();
      } else {
        setError('Please generate or upload an audio track first before starting video production.');
        return;
      }
    }

    const token = ++sessionTokenRef.current;
    setVideoGenerating(true);
    setVideoError('');
    setVideoSuccess('');
    const willReuse = Boolean(options?.reuseImages && sceneImages.length > 0);
    setVideoStage(
      willReuse
        ? 'Re-rendering video with updated subtitles & beat settings (keeping visuals)...'
        : 'Initializing 2K HD scene generation pipeline...'
    );
    setVideoProgress(willReuse ? 15 : 5);

    try {
      const res = await fetch('/api/flow-music/generate-full-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: targetScriptId,
          scenes: scenes.length > 0 ? scenes : undefined,
          lyrics: flowSettings.lyrics || undefined,
          title: flowSettings.title || undefined,
          prompt: flowSettings.prompt || undefined,
          mood: flowSettings.mood || undefined,
          theme: flowSettings.theme || undefined,
          duration: flowSettings.duration || undefined,
          letterboxBanner: flowSettings.letterboxBanner ?? '',
          songUrl: musicUrl || undefined,
          videoFormat,
          beatEdit,
          bpmHint: Number(flowSettings.bpm) || undefined,
          reuseImages: willReuse,
          existingImages: willReuse ? sceneImages : undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to start video generation');
      }

      const jobData = await res.json();
      const jobId = jobData.id;
      setActiveVideoJobId(jobId);

      let done = false;
      while (!done) {
        await new Promise((r) => setTimeout(r, 2500));
        if (token !== sessionTokenRef.current) return;

        const pollRes = await fetch(`/api/flow-music/video-job/${jobId}`);
        if (!pollRes.ok) continue;

        const currentJob = await pollRes.json();
        if (token !== sessionTokenRef.current) return;
        setVideoStage(currentJob.stage || 'Rendering videos...');
        setVideoProgress(currentJob.progress || 10);

        if (Array.isArray(currentJob.images) && currentJob.images.length > 0) {
          setSceneImages(currentJob.images);
        }

        if (currentJob.state === 'done') {
          done = true;
          const fmtLabel =
            videoFormat === 'shorts'
              ? '9:16 Portrait Short'
              : videoFormat === 'long'
                ? '16:9 Landscape Video'
                : 'Shorts & Long videos';
          setVideoSuccess(
            willReuse
              ? `Re-render complete! ${fmtLabel} updated with ${beatEdit.subtitleStyle.toUpperCase()} subtitles & settings.`
              : currentJob.beats
                ? `Beat-synced ${fmtLabel} ready! ${currentJob.beats.beatCount} beats @ ${currentJob.beats.bpm} BPM — captions, punch zooms & drop shakes synced to your track.`
                : `${fmtLabel} created successfully!`
          );
          if (currentJob.shortsVideoUrl) {
            setShortsVideoUrl(currentJob.shortsVideoUrl);
          } else if (videoFormat === 'long') {
            setShortsVideoUrl(null);
          }
          if (currentJob.longVideoUrl) {
            setLongVideoUrl(currentJob.longVideoUrl);
          } else if (videoFormat === 'shorts') {
            setLongVideoUrl(null);
          }
        } else if (currentJob.state === 'cancelled') {
          done = true;
        } else if (currentJob.state === 'error') {
          done = true;
          throw new Error(currentJob.error || 'Video rendering failed');
        }
      }
    } catch (e: any) {
      if (token === sessionTokenRef.current) {
        setVideoError(e.message || 'Error generating full videos');
      }
    } finally {
      if (token === sessionTokenRef.current) {
        setVideoGenerating(false);
        setActiveVideoJobId(null);
      }
    }
  };

  const handleRegenerateSceneImage = async (img: { filename: string; prompt: string }, idx: number) => {
    setRegeneratingScene(img.filename);
    setVideoError('');
    try {
      const res = await fetch('/api/flow-music/regenerate-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: img.filename,
          prompt: scenes[idx]?.prompt || img.prompt || `Cinematic HD frame for ${scenes[idx]?.line || 'scene'}`,
          index: idx,
          jobId: activeVideoJobId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Regeneration failed');
      setSceneImages((prev) =>
        prev.map((item, i) => (i === idx ? { ...item, url: data.url } : item))
      );
      setVideoSuccess(`Regenerated Scene ${idx + 1} keyframe! Re-render video if you want the updated frame in MP4s.`);
    } catch (e: any) {
      setVideoError(e?.message || 'Could not regenerate scene image');
    } finally {
      setRegeneratingScene(null);
    }
  };

  const projectSlug = slugifyFilename(
    flowSettings.title || trackTitle || script?.name || '',
    'flow_music_video'
  );
  const totalSceneDuration = scenes.reduce((acc, s) => acc + (Number(s.duration) || 8), 0);
  const effectiveSubtitlePx = getEffectiveSubtitlePx(beatEdit.subtitleSize, beatEdit.subtitleStyle);
  const subtitleSizeCategory = getSubtitleSizeCategory(effectiveSubtitlePx);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6 space-y-5">
      {/* Header Bar with Project Switcher & Reset Button */}
      <div className="rounded-xl border border-amber-500/30 bg-zinc-900/80 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Music className="h-5 w-5 text-amber-400" />
              Google Flow Music Studio · {account?.name || 'Channel Workspace'}
            </h3>
            <p className="text-xs text-zinc-400">
              Create custom music & 2K HD Shorts + Long videos from any script, lyrics, or uploaded track
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!script?.id && (
              <select
                aria-label="Load Script Project"
                value={selectedScriptId}
                onChange={(e) => handleSelectWorkspaceScript(e.target.value)}
                className="studio-input !py-1.5 !px-3 text-xs min-w-[190px]"
              >
                <option value="flow_studio_custom">Blank / Custom Project</option>
                {workspaceScripts.map((s) => (
                  <option key={s.id} value={s.id}>
                    Script: {s.name}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => setConfirmResetOpen((v) => !v)}
              disabled={resetting}
              className="flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2 text-xs font-bold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50 transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset All & Start Fresh
            </button>
          </div>
        </div>

        {/* Inline Reset Confirmation Strip */}
        {confirmResetOpen && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-500/50 bg-rose-950/60 px-3.5 py-2.5 text-xs text-rose-100">
            <span>
              Clear current script, lyrics, scenes, audio track, song approval, keyframe images, and rendered videos? Your Google Flow login stays signed in.
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={resetting}
                onClick={handleResetAll}
                className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Confirm Reset All
              </button>
              <button
                type="button"
                disabled={resetting}
                onClick={() => setConfirmResetOpen(false)}
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pipeline Stage Tracker: Compose -> Approve -> Visuals -> Beat Edit -> Final Short */}
      {(() => {
        const composeDone = Boolean(musicUrl);
        const approveDone = songApproved;
        const visualsDone = sceneImages.length > 0;
        const renderDone = Boolean(shortsVideoUrl || longVideoUrl);
        const steps = [
          {
            key: 'compose',
            label: '1 · Compose',
            hint: 'Lyrics & style',
            icon: Music,
            state: composeDone ? 'done' : 'active',
            anchor: 'flow-step-1',
          },
          {
            key: 'approve',
            label: '2 · Approve',
            hint: songRejected ? 'Rejected — refine' : 'Listen & approve',
            icon: songRejected ? XCircle : ShieldCheck,
            state: songRejected ? 'rejected' : approveDone ? 'done' : composeDone ? 'active' : 'locked',
            anchor: 'flow-step-2',
          },
          {
            key: 'visuals',
            label: '3 · Visuals',
            hint: 'HD keyframes',
            icon: ImageIcon,
            state: visualsDone ? 'done' : approveDone ? 'active' : 'locked',
            anchor: 'flow-step-3',
          },
          {
            key: 'beatedit',
            label: '4 · Beat Edit',
            hint: 'Synced subtitles & cuts',
            icon: Zap,
            state: renderDone ? 'done' : approveDone ? 'active' : 'locked',
            anchor: 'flow-step-3',
          },
          {
            key: 'final',
            label: 'Final Short',
            hint: '9:16 + 16:9',
            icon: Film,
            state: renderDone ? 'done' : 'locked',
            anchor: 'flow-final',
          },
        ] as const;
        return (
          <div className="rounded-xl border border-amber-500/20 bg-zinc-950/80 px-4 py-3">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {steps.map((step, idx) => {
                const Icon = step.icon;
                const isDone = step.state === 'done';
                const isRejected = step.state === 'rejected';
                const isActive = step.state === 'active';
                return (
                  <div key={step.key} className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        document.getElementById(step.anchor)?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 border text-xs font-bold whitespace-nowrap transition hover:brightness-125 cursor-pointer ${
                        isRejected
                          ? 'border-rose-500/50 bg-rose-500/10 text-rose-300'
                          : isDone
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                            : isActive
                              ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
                              : 'border-white/10 bg-white/5 text-zinc-500'
                      }`}
                    >
                      <Icon className={`h-3.5 w-3.5 ${isActive && (step.key === 'beatedit' || step.key === 'visuals') ? 'animate-pulse' : ''}`} />
                      <span>{step.label}</span>
                      <span className={`text-[9px] font-medium ${isRejected ? 'text-rose-400/80' : 'text-zinc-400'}`}>
                        {step.hint}
                      </span>
                    </button>
                    {idx < steps.length - 1 && <span className="text-zinc-600 text-xs">→</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Rejection Banner — refinement loop back into Step 1 */}
      {songRejected && !songApproved && (
        <div className="rounded-xl border border-rose-500/50 bg-rose-950/40 p-3.5 space-y-2">
          <div className="flex items-start gap-2.5">
            <XCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <h4 className="text-xs font-bold text-rose-200">
                Track Rejected{rejectCount > 1 ? ` (${rejectCount} rejections so far)` : ''} — refine & regenerate
              </h4>
              <p className="text-[11px] text-rose-200/80">
                Update the lyrics, style prompt, mood, vocal profile or BPM in Step 1, then click
                &ldquo;Generate Flow Music Track&rdquo; again. Your feedback note is folded into the next generation.
              </p>
              {rejectedNote.trim() && (
                <p className="text-[11px] text-rose-300/90 bg-rose-950/60 rounded-lg px-2.5 py-1.5 border border-rose-500/30">
                  <span className="font-bold">Your note: </span>
                  {rejectedNote}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Alert Banners */}
      {error && (
        <div className="rounded-xl border border-rose-500/50 bg-rose-950/50 p-3.5 text-xs text-rose-200 flex items-center gap-2.5">
          <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/50 p-3.5 text-xs text-emerald-200 flex items-center gap-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* STEP 1: Script, Lyrics & Visual Settings */}
      <div className="space-y-3" id="flow-step-1">
        <button
          type="button"
          onClick={() => setSettingsExpanded((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-2.5 text-left text-xs font-bold text-zinc-200 hover:bg-zinc-900"
        >
          <span>Step 1 · Compose — Script, Lyrics, Style & Visual Direction</span>
          {settingsExpanded ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
        </button>

        {settingsExpanded && (
          <FlowMusicSettingsSection
            value={flowSettings}
            onChange={updateSettings}
            onClear={() => setScenes([])}
            topicName={script?.topicName || script?.name || ''}
          />
        )}

        {/* Scene Storyboard Editor */}
        <div className="rounded-xl border border-white/10 bg-zinc-950/90 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setStoryboardExpanded((v) => !v)}
              className="flex items-center gap-2 text-xs font-bold text-white"
            >
              <ImageIcon className="h-4 w-4 text-amber-400" />
              Scene Storyboard ({scenes.length} Scenes · {totalSceneDuration}s)
              {storyboardExpanded ? <ChevronUp className="h-3.5 w-3.5 text-zinc-400" /> : <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />}
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={planningScenes}
                onClick={handlePlanScenes}
                className="flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 disabled:opacity-50"
              >
                {planningScenes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                Build Scenes from Script
              </button>
              <button
                type="button"
                onClick={() => {
                  setScenes((prev) => [
                    ...prev,
                    {
                      line: `Scene ${prev.length + 1}`,
                      caption: `Scene ${prev.length + 1}`,
                      duration: 8,
                      effect: 'zoom-in',
                      prompt: '',
                    },
                  ]);
                  setStoryboardExpanded(true);
                }}
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/10"
              >
                <Plus className="h-3.5 w-3.5" /> Add Scene
              </button>
              {scenes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setScenes([])}
                  className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-rose-300"
                >
                  Clear Scenes
                </button>
              )}
            </div>
          </div>

          {storyboardExpanded && (
            <>
              {scenes.length === 0 ? (
                <p className="text-[11px] text-zinc-400 italic">
                  No custom scenes yet. Paste lines in Step 1 and click &ldquo;Build Scenes from Script&rdquo;, click &ldquo;+ Add Scene&rdquo;, or scenes will auto-build when rendering.
                </p>
              ) : (
                <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                  {scenes.map((sc, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-white/10 bg-black/40 p-2.5 space-y-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                          Scene {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={sc.caption ?? sc.line ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setScenes((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, line: val, caption: val } : item))
                            );
                          }}
                          placeholder="On-screen line / caption..."
                          className="studio-input flex-1 !py-1 text-xs"
                        />
                        <label className="flex items-center gap-1 text-[10px] text-zinc-400">
                          Sec:
                          <input
                            type="number"
                            min={2}
                            max={30}
                            value={sc.duration ?? 8}
                            onChange={(e) => {
                              const d = Math.max(2, Number(e.target.value) || 8);
                              setScenes((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, duration: d } : item))
                              );
                            }}
                            className="studio-input w-14 !py-1 text-xs text-center"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setScenes((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-zinc-500 hover:text-rose-400 p-1"
                          title="Remove scene"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={sc.prompt ?? ''}
                        onChange={(e) => {
                          const p = e.target.value;
                          setScenes((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, prompt: p } : item))
                          );
                        }}
                        placeholder="Visual image prompt (auto-generated from caption if left empty)"
                        className="studio-input w-full !py-1 text-[11px] text-zinc-300"
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* STEP 2: Soundtrack Generation / Upload & Approval */}
      <div className="rounded-xl border border-amber-500/40 bg-zinc-900/70 p-4 space-y-4" id="flow-step-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-amber-400" />
              Step 2 · Music Track & Approval Gate
            </h4>
            <p className="text-xs text-zinc-400">
              Generate with Google Flow Music (lyrics, style, mood, vocals, SFX) or upload your own MP3/WAV — then Approve or Reject
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUploadTrack(file);
              }}
            />
            <button
              type="button"
              disabled={uploadingAudio || generating}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:bg-white/10 disabled:opacity-50"
            >
              {uploadingAudio ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Upload MP3 / WAV
            </button>

            {musicUrl && (
              songApproved ? (
                <span className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  Track Approved
                </span>
              ) : (
                <button
                  type="button"
                  disabled={approving || generating || videoGenerating}
                  onClick={handleApproveSong}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-3.5 py-2 text-xs font-bold text-white shadow-glow hover:brightness-110 disabled:opacity-50 transition"
                  title="Approve this track to unlock beat analysis and video rendering"
                >
                  {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Approve Track
                </button>
              )
            )}

            <button
              type="button"
              disabled={generating || uploadingAudio}
              onClick={handleGenerate}
              className="studio-btn-primary flex items-center gap-2 !py-2 !px-4 text-xs font-bold shadow-glow disabled:opacity-50"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? 'Generating Track...' : 'Generate Flow Music Track'}
            </button>

            {generating && (
              <button
                type="button"
                onClick={handleCancelMusicJob}
                className="flex items-center gap-1 rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/25"
              >
                <XCircle className="h-3.5 w-3.5" /> Cancel
              </button>
            )}
          </div>
        </div>

        {generating && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-amber-200">
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-amber-400" /> {stage}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {musicUrl && (
          <div className="space-y-4 rounded-xl border border-white/10 bg-zinc-950/90 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> Track Ready
                </span>
                <h5 className="text-sm font-bold text-white">{trackTitle || flowSettings.title || 'Soundtrack'}</h5>
              </div>
              <a
                href={musicUrl}
                download={`${projectSlug}.mp3`}
                className="studio-btn-primary flex items-center gap-1.5 !py-1.5 !px-3 text-xs font-semibold"
              >
                <Download className="h-3.5 w-3.5" /> Download Audio
              </a>
            </div>
            <audio controls loop className="w-full h-11 rounded-lg bg-zinc-900" src={musicUrl} />

            {transcription && (
              <div className="rounded-lg border border-purple-500/30 bg-purple-950/30 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-purple-300 font-bold uppercase tracking-wider text-[11px]">
                  <Mic className="h-3.5 w-3.5 text-purple-400" />
                  <span>AI Vocal Transcription (Verified by Whisper AI)</span>
                  <span className="ml-auto text-[10px] text-emerald-400 font-mono font-normal flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Lyrics Active & Detected in Audio
                  </span>
                </div>
                <p className="text-zinc-200 italic font-mono text-xs leading-relaxed select-text bg-black/40 rounded px-2.5 py-1.5 border border-purple-500/10">
                  "{transcription}"
                </p>
              </div>
            )}

            {/* Approval Gate — Approve or Reject & Refine */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className={`h-5 w-5 ${songApproved ? 'text-emerald-400' : songRejected ? 'text-rose-400' : 'text-amber-400'}`} />
                  <h4 className="text-sm font-bold text-white">Song Approval Gate</h4>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      songApproved
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : songRejected
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {songApproved ? '✓ Approved' : songRejected ? '✗ Rejected' : '⏳ Awaiting Approval'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  {songApproved
                    ? 'Approved! Short production unlocked — set up your Beat Edit Studio in Step 3 below.'
                    : songRejected
                      ? 'Rejected. Refine lyrics & settings in Step 1, regenerate, then approve the new version.'
                      : 'Listen to your track — Approve to unlock short production, or Reject to refine it first.'}
                </p>
                {approvedAt && songApproved && (
                  <p className="text-[10px] text-emerald-400/80 mt-0.5">
                    Approved at {new Date(approvedAt).toLocaleTimeString()}
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end gap-2">
                {!songApproved ? (
                  <>
                    {showRejectInput && (
                      <div className="flex w-full flex-col gap-1.5 items-end">
                        <input
                          type="text"
                          value={rejectedNote}
                          onChange={(e) => setRejectedNote(e.target.value)}
                          placeholder="What should change? e.g. 'lyrics too soft, more bass drop at the end'"
                          className="studio-input w-full !py-1.5 text-xs"
                          maxLength={300}
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={approving || generating || videoGenerating}
                            onClick={handleRejectSong}
                            className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50 transition"
                          >
                            {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                            Confirm Reject
                          </button>
                          <button
                            type="button"
                            disabled={approving}
                            onClick={() => setShowRejectInput(false)}
                            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/10"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={approving || generating || videoGenerating}
                        onClick={handleApproveSong}
                        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2.5 text-xs font-bold text-white shadow-glow hover:brightness-110 disabled:opacity-50 transition"
                      >
                        {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Approve Song & Unlock Short Production
                      </button>
                      <button
                        type="button"
                        disabled={approving || generating || videoGenerating}
                        onClick={() => setShowRejectInput((v) => !v)}
                        className="flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2 text-xs font-bold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50 transition"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject & Refine
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={approving || videoGenerating}
                    onClick={() => {
                      setSongApproved(false);
                      setApprovedAt(null);
                      void fetch('/api/flow-music/approve', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ scriptId: targetScriptId, approved: false, songUrl: musicUrl }),
                      }).catch(() => {});
                    }}
                    className="text-xs text-zinc-400 hover:text-rose-400 px-2 py-1 transition"
                  >
                    Revoke Approval
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* STEP 3: Beat Edit Studio & Short Production */}
      <div className="rounded-xl border border-amber-500/40 bg-zinc-900/70 p-4 space-y-4" id="flow-step-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              Step 3 · Beat Edit Studio — Cool Subtitles & Beat-Synced Editing
            </h4>
            <p className="text-xs text-zinc-400">
              {songApproved
                ? 'Subtitles synced word-by-word to the beat grid, punch zooms on beats, flashes on downbeats & shake on bass drops'
                : 'Locked — approve the song first so beats can be analyzed'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!songApproved && musicUrl && (
              <button
                type="button"
                disabled={approving || generating || videoGenerating}
                onClick={handleApproveSong}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 shadow-glow transition"
              >
                {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Approve Track to Unlock
              </button>
            )}
            <span
              className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider border ${
                songApproved
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-500 border-white/10'
              }`}
            >
              {songApproved ? '⚡ Studio Ready' : '🔒 Locked'}
            </span>
          </div>
        </div>

        {/* Beat map summary */}
        {songApproved && (
          <div className="rounded-xl border border-white/10 bg-zinc-950/90 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h5 className="text-xs font-bold text-zinc-100 flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-amber-400" />
                Beat Map
              </h5>
              <button
                type="button"
                disabled={analyzingBeats}
                onClick={() => void handleAnalyzeBeats(true)}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 hover:bg-white/10 disabled:opacity-50"
              >
                {analyzingBeats ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Re-analyze
              </button>
            </div>

            {analyzingBeats && !beatInfo && (
              <p className="text-[11px] text-amber-200 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Detecting beats, downbeats & bass drops from your track...
              </p>
            )}
            {beatError && (
              <p className="text-[11px] text-rose-300 flex items-center gap-2">
                <AlertCircle className="h-3 w-3" /> {beatError}
              </p>
            )}

            {beatInfo && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-lg bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-[11px] font-bold text-amber-200">
                    {beatInfo.bpm} BPM {beatInfo.source === 'fallback' ? '(settings hint)' : 'detected'}
                  </span>
                  <span className="rounded-lg bg-white/5 border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-zinc-300">
                    {beatInfo.beats.length} beats
                  </span>
                  <span className="rounded-lg bg-white/5 border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-zinc-300">
                    {beatInfo.downbeats.length} downbeats
                  </span>
                  <span className="rounded-lg bg-rose-500/15 border border-rose-500/30 px-2.5 py-1 text-[11px] font-semibold text-rose-300">
                    {beatInfo.drops.length} bass drops
                  </span>
                  <span className="rounded-lg bg-white/5 border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-zinc-400">
                    {beatInfo.duration.toFixed(1)}s
                  </span>
                </div>
                {/* Energy sparkline with drop markers */}
                {beatInfo.energy.length > 1 && (
                  <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-10 rounded-lg bg-black/50 border border-white/5">
                    <polyline
                      points={beatInfo.energy
                        .map((v, i) => `${(i / (beatInfo.energy.length - 1)) * 100},${30 - (v * 27 + 1.5)}`)
                        .join(' ')}
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth="0.7"
                      vectorEffect="non-scaling-stroke"
                    />
                    {beatInfo.drops.map((d, i) => (
                      <line
                        key={i}
                        x1={(d.start / Math.max(0.001, beatInfo.duration)) * 100}
                        x2={(d.start / Math.max(0.001, beatInfo.duration)) * 100}
                        y1="0"
                        y2="30"
                        stroke="#fb7185"
                        strokeWidth="0.6"
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                  </svg>
                )}
              </div>
            )}
          </div>
        )}

        {/* Beat Edit options */}
        {songApproved && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {/* Video Format */}
              <div className="rounded-xl border border-white/10 bg-zinc-950/90 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Video className="h-3.5 w-3.5 text-amber-400" />
                    <h6 className="text-[11px] font-bold text-zinc-200 uppercase tracking-wide">Video Format</h6>
                  </div>
                  <span className="text-[10px] font-bold text-amber-300">
                    {videoFormat === 'shorts' && '9:16 Portrait'}
                    {videoFormat === 'long' && '16:9 Landscape'}
                    {videoFormat === 'both' && 'Dual Format'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { key: 'shorts', label: '📱 Portrait (9:16)', desc: 'Shorts, Reels & TikTok vertical format (renders faster)' },
                      { key: 'long', label: '🖥️ Landscape (16:9)', desc: 'YouTube standard 1080p widescreen (renders faster)' },
                      { key: 'both', label: '✨ Both', desc: 'Render both vertical Short and widescreen video together' },
                    ] as const
                  ).map((fmt) => (
                    <button
                      key={fmt.key}
                      type="button"
                      onClick={() => setVideoFormat(fmt.key)}
                      title={fmt.desc}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold border transition ${
                        videoFormat === fmt.key
                          ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                          : 'border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10'
                      }`}
                    >
                      {fmt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subtitle Style */}
              <div className="rounded-xl border border-white/10 bg-zinc-950/90 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Type className="h-3.5 w-3.5 text-amber-400" />
                  <h6 className="text-[11px] font-bold text-zinc-200 uppercase tracking-wide">Subtitle Style</h6>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { key: 'motion', label: '⚡ Motion Bold', desc: 'huge reel-style bold words, vivid colors, heartbeat pulse on every beat' },
                      { key: 'karaoke', label: 'Beat Karaoke', desc: 'amber sweep word-by-word' },
                      { key: 'pop', label: 'Word Pop', desc: 'each word pops on its beat' },
                      { key: 'glow', label: 'Glow Wave', desc: 'glowing color wave on beats' },
                    ] as const
                  ).map((style) => (
                    <button
                      key={style.key}
                      type="button"
                      onClick={() => setBeatEdit((prev) => ({ ...prev, subtitleStyle: style.key }))}
                      title={style.desc}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold border transition ${
                        beatEdit.subtitleStyle === style.key
                          ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                          : 'border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10'
                      }`}
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Edit Intensity */}
              <div className="rounded-xl border border-white/10 bg-zinc-950/90 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-amber-400" />
                  <h6 className="text-[11px] font-bold text-zinc-200 uppercase tracking-wide">Edit Intensity</h6>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { key: 'subtle', label: 'Subtle' },
                      { key: 'balanced', label: 'Balanced' },
                      { key: 'hype', label: 'Hype 🔥' },
                    ] as const
                  ).map((level) => (
                    <button
                      key={level.key}
                      type="button"
                      onClick={() => setBeatEdit((prev) => ({ ...prev, intensity: level.key }))}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold border transition ${
                        beatEdit.intensity === level.key
                          ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                          : 'border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10'
                      }`}
                    >
                      {level.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Beat-Synced Effects */}
            <div className="rounded-xl border border-white/10 bg-zinc-950/90 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Scissors className="h-3.5 w-3.5 text-amber-400" />
                <h6 className="text-[11px] font-bold text-zinc-200 uppercase tracking-wide">Beat-Synced Effects</h6>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(
                  [
                    { key: 'snapCuts', label: 'Cuts on beats', desc: 'scene changes land on the beat grid' },
                    { key: 'punchZoom', label: 'Punch zoom', desc: 'camera punch on beats & downbeats' },
                    { key: 'flashes', label: 'Flashes', desc: 'light flash on every downbeat' },
                    { key: 'shakeDrops', label: 'Drop shake', desc: 'camera shake on bass drops' },
                  ] as const
                ).map((effect) => (
                  <button
                    key={effect.key}
                    type="button"
                    title={effect.desc}
                    onClick={() => setBeatEdit((prev) => ({ ...prev, [effect.key]: !prev[effect.key] }))}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-[11px] font-bold transition ${
                      beatEdit[effect.key]
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                        : 'border-white/10 bg-white/5 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <span>{effect.label}</span>
                    <span className={`h-2 w-2 rounded-full ${beatEdit[effect.key] ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                  </button>
                ))}
              </div>
            </div>

            {/* Subtitle Size Meter & Live Screen Preview Studio */}
            <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black p-4 sm:p-5 space-y-5 shadow-2xl">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    <Maximize2 className="h-4 w-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-wider text-zinc-100 flex items-center gap-2">
                      Subtitle Size Meter & Live Screen Preview
                      <span className="rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 text-[9px] font-bold uppercase">
                        Dynamic Scale
                      </span>
                    </h5>
                    <p className="text-[11px] text-zinc-400">
                      Continuously drag the size meter to dial in your exact subtitle size with a 1:1 proportional live screen preview
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold border ${subtitleSizeCategory.color}`}>
                    {subtitleSizeCategory.label} · {effectiveSubtitlePx}px
                  </span>

                  <div className="flex rounded-lg border border-white/10 bg-zinc-900 p-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setPreviewFormat('shorts')}
                      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-bold transition ${
                        previewFormat === 'shorts'
                          ? 'bg-amber-500 text-black shadow'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                      title="Preview subtitle size on 9:16 vertical phone screen (Shorts, Reels, TikTok)"
                    >
                      <Smartphone className="h-3 w-3" /> 9:16 Shorts
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewFormat('long')}
                      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-bold transition ${
                        previewFormat === 'long'
                          ? 'bg-amber-500 text-black shadow'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                      title="Preview subtitle size on 16:9 widescreen canvas (YouTube Long video)"
                    >
                      <Monitor className="h-3 w-3" /> 16:9 Long
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-12 items-center">
                {/* Left Column: Continuous Subtitle Size Meter (7 cols) */}
                <div className="space-y-4 lg:col-span-7">
                  {/* Active Meter Display Card */}
                  <div className="rounded-xl border border-white/10 bg-black/50 p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sliders className="h-3.5 w-3.5 text-amber-400" />
                        <span className="text-xs font-bold text-zinc-200 uppercase tracking-wide">Continuous Size Meter</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setBeatEdit((prev) => ({ ...prev, subtitleSize: Math.max(50, effectiveSubtitlePx - 5) }))}
                          className="h-6 w-6 rounded border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 font-bold text-xs flex items-center justify-center transition"
                          title="Decrease 5px"
                        >
                          -5
                        </button>
                        <div className="flex items-center rounded-lg border border-amber-500/40 bg-zinc-900 px-2 py-0.5">
                          <input
                            type="number"
                            min={50}
                            max={280}
                            step={2}
                            value={effectiveSubtitlePx}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              if (!isNaN(val)) setBeatEdit((prev) => ({ ...prev, subtitleSize: Math.min(280, Math.max(50, val)) }));
                            }}
                            className="w-12 bg-transparent text-center text-xs font-bold text-amber-300 focus:outline-none"
                          />
                          <span className="text-[11px] text-zinc-400 font-semibold">px</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setBeatEdit((prev) => ({ ...prev, subtitleSize: Math.min(280, effectiveSubtitlePx + 5) }))}
                          className="h-6 w-6 rounded border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 font-bold text-xs flex items-center justify-center transition"
                          title="Increase 5px"
                        >
                          +5
                        </button>
                      </div>
                    </div>

                    {/* Continuous Range Slider Meter */}
                    <div className="space-y-1.5">
                      <div className="relative flex items-center">
                        <input
                          type="range"
                          min={50}
                          max={280}
                          step={2}
                          value={effectiveSubtitlePx}
                          onChange={(e) => setBeatEdit((prev) => ({ ...prev, subtitleSize: Number(e.target.value) }))}
                          className="w-full h-3 rounded-lg appearance-none cursor-pointer focus:outline-none"
                          style={{
                            background: `linear-gradient(to right, #10b981 0%, #06b6d4 25%, #f59e0b 55%, #f97316 75%, #f43f5e 100%)`,
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-zinc-400 font-semibold px-0.5">
                        <span>50px (Minimal)</span>
                        <span>100px</span>
                        <span className="text-amber-400 font-bold">180px (Reel Slam)</span>
                        <span>220px</span>
                        <span className="text-rose-400 font-bold">280px (Ultra)</span>
                      </div>
                    </div>

                    {/* Dual Format Readout */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5">
                      <div className="rounded-lg bg-white/5 p-2 text-center">
                        <div className="text-[10px] text-zinc-400">📱 9:16 Shorts (1080×1920)</div>
                        <div className="text-xs font-bold text-amber-300">
                          {effectiveSubtitlePx}px <span className="text-[10px] text-zinc-400 font-normal">({((effectiveSubtitlePx / 1920) * 100).toFixed(1)}% of height)</span>
                        </div>
                      </div>
                      <div className="rounded-lg bg-white/5 p-2 text-center">
                        <div className="text-[10px] text-zinc-400">🖥️ 16:9 Long (1920×1080)</div>
                        <div className="text-xs font-bold text-amber-300">
                          {Math.round(effectiveSubtitlePx * 0.75)}px <span className="text-[10px] text-zinc-400 font-normal">({((Math.round(effectiveSubtitlePx * 0.75) / 1080) * 100).toFixed(1)}% of height)</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick-Jump Snap Presets along the meter */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wide">Quick Jump Meter Marks</label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[
                        { px: 65, label: 'Compact', badge: '65px' },
                        { px: 95, label: 'Standard', badge: '95px' },
                        { px: 145, label: 'Large', badge: '145px' },
                        { px: 195, label: 'Huge 🔥', badge: '195px' },
                        { px: 250, label: 'Ultra 🔥🔥', badge: '250px' },
                      ].map((preset) => (
                        <button
                          key={preset.px}
                          type="button"
                          onClick={() => setBeatEdit((prev) => ({ ...prev, subtitleSize: preset.px }))}
                          className={`rounded-lg border px-2 py-1.5 text-center transition ${
                            Math.abs(effectiveSubtitlePx - preset.px) < 12
                              ? 'border-amber-400 bg-amber-500/20 text-amber-200 shadow-sm'
                              : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                          }`}
                        >
                          <div className="text-[11px] font-bold">{preset.label}</div>
                          <div className="text-[9px] text-zinc-400">{preset.badge}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sample Lyric & Heartbeat Preview Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-300 uppercase tracking-wide">Preview Word / Lyric</label>
                      <input
                        type="text"
                        value={previewText}
                        onChange={(e) => setPreviewText(e.target.value)}
                        placeholder="Type sample word (e.g. FEEL THE BEAT)"
                        className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewPulsing(true);
                          setTimeout(() => setPreviewPulsing(false), 180);
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/20 transition cursor-pointer"
                      >
                        <Zap className="h-3.5 w-3.5 text-amber-400" />
                        Test Heartbeat Pulse
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowSafeZones((v) => !v)}
                        className={`rounded-lg border px-2.5 py-2 text-xs font-semibold transition cursor-pointer ${
                          showSafeZones
                            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                            : 'border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200'
                        }`}
                        title="Toggle Shorts & TikTok action safe zones overlay"
                      >
                        Safe Zones
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Column: Live Screen Mockup (5 cols) */}
                <div className="lg:col-span-5 flex flex-col items-center justify-center py-2">
                  <div className="text-center mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      Live Screen Mockup ({previewFormat === 'shorts' ? '9:16 Vertical Phone' : '16:9 Widescreen'})
                    </span>
                  </div>

                  {previewFormat === 'shorts' ? (
                    /* 9:16 Portrait Phone Mockup */
                    <div
                      className="relative rounded-[26px] border-[3px] border-zinc-700/80 bg-black overflow-hidden shadow-2xl flex flex-col items-center justify-between select-none"
                      style={{ width: '216px', height: '384px' }}
                    >
                      {/* Phone top notch */}
                      <div className="absolute top-2 z-30 flex items-center justify-center w-full pointer-events-none">
                        <div className="h-3 w-16 bg-zinc-900 rounded-full border border-white/5" />
                      </div>

                      {/* Background image or cinematic gradient */}
                      {sceneImages.length > 0 && sceneImages[0]?.url ? (
                        <img
                          src={sceneImages[0].url}
                          alt="Scene keyframe preview"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-b from-indigo-950 via-zinc-950 to-purple-950 flex flex-col items-center justify-center">
                          <div className="flex items-center gap-1 opacity-25">
                            <span className="w-1 h-12 bg-amber-400 rounded-full animate-pulse" />
                            <span className="w-1 h-20 bg-rose-400 rounded-full animate-pulse" />
                            <span className="w-1 h-28 bg-cyan-400 rounded-full animate-pulse" />
                            <span className="w-1 h-16 bg-purple-400 rounded-full animate-pulse" />
                            <span className="w-1 h-8 bg-amber-400 rounded-full animate-pulse" />
                          </div>
                          <span className="absolute text-[8px] uppercase tracking-widest font-bold text-white/30 bottom-12">
                            2K HD Visual Frame
                          </span>
                        </div>
                      )}

                      {/* Subtle dark vignette overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/45 pointer-events-none" />

                      {/* Subtle TikTok/Shorts UI overlay on right */}
                      {showSafeZones && (
                        <div className="absolute right-2 bottom-16 z-20 flex flex-col items-center gap-2.5 text-white/80 pointer-events-none">
                          <div className="flex flex-col items-center">
                            <div className="h-5 w-5 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-[9px]">❤️</div>
                            <span className="text-[7px] font-bold">24k</span>
                          </div>
                          <div className="flex flex-col items-center">
                            <div className="h-5 w-5 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-[9px]">💬</div>
                            <span className="text-[7px] font-bold">342</span>
                          </div>
                          <div className="flex flex-col items-center">
                            <div className="h-5 w-5 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-[9px]">↗️</div>
                            <span className="text-[7px] font-bold">Share</span>
                          </div>
                          <div className="h-5 w-5 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-[8px] animate-spin">💿</div>
                        </div>
                      )}

                      {/* Safe zone boundary guide */}
                      {showSafeZones && (
                        <div className="absolute inset-x-2 top-9 bottom-14 border border-dashed border-amber-400/30 pointer-events-none rounded-lg flex items-start justify-end p-1">
                          <span className="text-[7px] text-amber-400/70 font-mono">Safe Zone</span>
                        </div>
                      )}

                      {/* Subtitle Element - 100% Proportional Scale! */}
                      <div
                        className="absolute inset-x-3 text-center z-20 pointer-events-none transition-all duration-150 flex items-center justify-center"
                        style={{
                          bottom: '31%', // Corresponds to marginV 620 on 1920 canvas
                        }}
                      >
                        <div
                          className={`font-black uppercase tracking-tight transition-all duration-100 ${
                            previewPulsing ? 'scale-115 brightness-125' : 'scale-100'
                          }`}
                          style={{
                            fontSize: `${Math.max(12, Math.round(effectiveSubtitlePx * 0.2))}px`,
                            lineHeight: 1.08,
                            color:
                              beatEdit.subtitleStyle === 'motion'
                                ? '#FFD400'
                                : beatEdit.subtitleStyle === 'karaoke'
                                ? '#FFFFFF'
                                : beatEdit.subtitleStyle === 'glow'
                                ? '#4FE8FF'
                                : '#FFFFFF',
                            textShadow:
                              beatEdit.subtitleStyle === 'glow'
                                ? '0 0 16px #4FE8FF, 0 0 26px #06b6d4, 0 2px 4px #000000'
                                : '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 4px 10px rgba(0,0,0,0.95)',
                            WebkitTextStroke:
                              beatEdit.subtitleStyle === 'motion'
                                ? `${Math.max(1, Math.round(effectiveSubtitlePx * 0.2 * 0.085))}px #000`
                                : undefined,
                          }}
                        >
                          {previewText || '⚡ FEEL THE BEAT'}
                        </div>
                      </div>

                      {/* Phone bottom bar */}
                      <div className="absolute bottom-1.5 z-30 w-full flex justify-center pointer-events-none">
                        <div className="h-1 w-24 bg-white/40 rounded-full" />
                      </div>
                    </div>
                  ) : (
                    /* 16:9 Widescreen Mockup */
                    <div
                      className="relative rounded-xl border-[3px] border-zinc-700/80 bg-black overflow-hidden shadow-2xl flex flex-col items-center justify-between select-none"
                      style={{ width: '356px', height: '200px' }}
                    >
                      {/* Background image or cinematic gradient */}
                      {sceneImages.length > 0 && sceneImages[0]?.url ? (
                        <img
                          src={sceneImages[0].url}
                          alt="Scene keyframe preview"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-b from-indigo-950 via-zinc-950 to-purple-950 flex flex-col items-center justify-center">
                          <div className="flex items-center gap-1 opacity-25">
                            <span className="w-1 h-8 bg-amber-400 rounded-full animate-pulse" />
                            <span className="w-1 h-14 bg-rose-400 rounded-full animate-pulse" />
                            <span className="w-1 h-20 bg-cyan-400 rounded-full animate-pulse" />
                            <span className="w-1 h-12 bg-purple-400 rounded-full animate-pulse" />
                            <span className="w-1 h-6 bg-amber-400 rounded-full animate-pulse" />
                          </div>
                          <span className="absolute text-[8px] uppercase tracking-widest font-bold text-white/30 bottom-6">
                            16:9 2K HD Canvas
                          </span>
                        </div>
                      )}

                      {/* Subtle dark vignette overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/35 pointer-events-none" />

                      {/* Safe zone boundary guide */}
                      {showSafeZones && (
                        <div className="absolute inset-x-3 top-2.5 bottom-7 border border-dashed border-amber-400/30 pointer-events-none rounded flex items-start justify-end p-1">
                          <span className="text-[7px] text-amber-400/70 font-mono">Safe Zone (16:9)</span>
                        </div>
                      )}

                      {/* Subtitle Element - 100% Proportional Scale! */}
                      <div
                        className="absolute inset-x-4 text-center z-20 pointer-events-none transition-all duration-150 flex items-center justify-center"
                        style={{
                          bottom: '15%', // Corresponds to marginV 150 on 1080 canvas
                        }}
                      >
                        <div
                          className={`font-black uppercase tracking-tight transition-all duration-100 ${
                            previewPulsing ? 'scale-115 brightness-125' : 'scale-100'
                          }`}
                          style={{
                            fontSize: `${Math.max(11, Math.round(effectiveSubtitlePx * 0.75 * 0.1852))}px`,
                            lineHeight: 1.1,
                            color:
                              beatEdit.subtitleStyle === 'motion'
                                ? '#FFD400'
                                : beatEdit.subtitleStyle === 'karaoke'
                                ? '#FFFFFF'
                                : beatEdit.subtitleStyle === 'glow'
                                ? '#4FE8FF'
                                : '#FFFFFF',
                            textShadow:
                              beatEdit.subtitleStyle === 'glow'
                                ? '0 0 16px #4FE8FF, 0 0 26px #06b6d4, 0 2px 4px #000000'
                                : '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 4px 10px rgba(0,0,0,0.95)',
                            WebkitTextStroke:
                              beatEdit.subtitleStyle === 'motion'
                                ? `${Math.max(1, Math.round(effectiveSubtitlePx * 0.75 * 0.1852 * 0.085))}px #000`
                                : undefined,
                          }}
                        >
                          {previewText || '⚡ FEEL THE BEAT'}
                        </div>
                      </div>

                      {/* YouTube player progress bar */}
                      <div className="absolute bottom-1 inset-x-2 z-20 flex items-center gap-2 px-1 pointer-events-none">
                        <div className="h-0.5 flex-1 bg-white/20 rounded-full overflow-hidden">
                          <div className="h-full w-1/3 bg-red-600 rounded-full" />
                        </div>
                        <span className="text-[7px] text-white/70 font-mono">0:14 / 1:00</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Render buttons: Fast Re-render with New Subtitles VS Full Re-render */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            {shortsVideoUrl || longVideoUrl || sceneImages.length > 0 ? (
              <>
                <button
                  type="button"
                  disabled={(!songApproved && !musicUrl) || videoGenerating || generating}
                  onClick={() => handleGenerateVideos({ reuseImages: true })}
                  className="studio-btn-primary flex items-center gap-2 !py-2.5 !px-5 text-xs font-bold shadow-glow disabled:opacity-50 cursor-pointer"
                  title="Re-render video instantly with your newly selected format, Subtitle Style, intensity, and effects while keeping your 2K HD scene keyframes"
                >
                  {videoGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 text-amber-300" />}
                  {videoGenerating
                    ? 'Re-rendering Video...'
                    : videoFormat === 'shorts'
                      ? '⚡ Fast Re-render (9:16 Portrait Short)'
                      : videoFormat === 'long'
                        ? '⚡ Fast Re-render (16:9 Landscape Video)'
                        : '⚡ Fast Re-render (Both Formats)'}
                </button>

                <button
                  type="button"
                  disabled={(!songApproved && !musicUrl) || videoGenerating || generating}
                  onClick={() => handleGenerateVideos({ reuseImages: false })}
                  className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-bold text-zinc-200 hover:bg-white/15 transition disabled:opacity-50 cursor-pointer"
                  title="Redraw all 2K HD scene keyframes from scratch with AI and re-render"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-amber-400" />
                  {videoFormat === 'shorts'
                    ? '🎨 Full Re-render (9:16 Portrait Short)'
                    : videoFormat === 'long'
                      ? '🎨 Full Re-render (16:9 Landscape Video)'
                      : '🎨 Full Re-render (Both Formats)'}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={(!songApproved && !musicUrl) || videoGenerating || generating}
                onClick={() => handleGenerateVideos()}
                className="studio-btn-primary flex items-center gap-2 !py-2.5 !px-5 text-xs font-bold shadow-glow disabled:opacity-50"
              >
                {videoGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
                {videoGenerating
                  ? 'Rendering Beat-Synced Video...'
                  : videoFormat === 'shorts'
                    ? 'Generate Music Short (9:16 Portrait)'
                    : videoFormat === 'long'
                      ? 'Generate Long Video (16:9 Landscape)'
                      : 'Generate Music Video (9:16 + 16:9)'}
              </button>
            )}

            {videoGenerating && (
              <button
                type="button"
                onClick={handleCancelVideoJob}
                className="flex items-center gap-1 rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/25"
              >
                <XCircle className="h-3.5 w-3.5" /> Cancel
              </button>
            )}

            {!songApproved && (
              <p className="text-[11px] text-zinc-500">Approve the song in Step 2 to unlock rendering.</p>
            )}
          </div>

          {(shortsVideoUrl || longVideoUrl || sceneImages.length > 0) && (
            <p className="text-[11px] text-zinc-400 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>
                <strong>Format & Subtitle Re-edit:</strong> Pick your format (<strong>Portrait 9:16</strong> or <strong>Landscape 16:9</strong>), Subtitle Style & Size, and hit <strong>Fast Re-render</strong> to produce your video in seconds!
              </span>
            </p>
          )}
        </div>

        {/* Video Generation Progress */}
        {videoGenerating && (
          <div className="rounded-xl border border-amber-500/40 bg-black/60 p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-amber-200">
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-amber-400" /> {videoStage}
              </span>
              <span>{videoProgress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-300 transition-all duration-300"
                style={{ width: `${videoProgress}%` }}
              />
            </div>
            <p className="text-[11px] text-zinc-400">
              Analyzing beats → generating HD lyrics-driven keyframes → beat-synced cutting, punch zooms, flashes, motion-graphics subtitles → final mux.
            </p>
          </div>
        )}

        {videoError && (
          <div className="rounded-xl border border-rose-500/50 bg-rose-950/50 p-3 text-xs text-rose-200 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{videoError}</span>
          </div>
        )}

        {videoSuccess && (
          <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/50 p-3 text-xs text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{videoSuccess}</span>
          </div>
        )}
      </div>

      {/* FINAL OUTPUT: Completed Videos Showcase */}
      {(shortsVideoUrl || longVideoUrl) && (
        <div className="space-y-4 rounded-xl border border-amber-500/40 bg-zinc-950 p-5 shadow-2xl" id="flow-final">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Film className="h-4 w-4 text-amber-400" />
                Final Output · Beat-Synced Music Short Ready
              </h4>
              <p className="text-xs text-zinc-400">
                Lyrics-driven HD scenes, beat-synced motion-graphics subtitles, punch zooms on beats & drop shakes — approved audio muxed in
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  document.getElementById('flow-step-3')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-500/25 transition cursor-pointer"
              >
                <Zap className="h-3.5 w-3.5" /> Re-edit Subtitles in Step 3
              </button>
              <button
                type="button"
                disabled={videoGenerating}
                onClick={() => handleGenerateVideos({ reuseImages: true })}
                className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-white/20 transition disabled:opacity-50 cursor-pointer"
                title="Quick re-render with new subtitles while keeping your 2K HD scene keyframes"
              >
                {videoGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 text-amber-400" />}
                Quick Re-render Video
              </button>
              <button
                type="button"
                onClick={handleClearVideosOnly}
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-zinc-300 hover:bg-white/10"
              >
                <Trash2 className="h-3 w-3" /> Clear Videos Only
              </button>
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 border border-emerald-500/30">
                ✓ Ready
              </span>
            </div>
          </div>

          <div
            className={`grid gap-6 ${
              shortsVideoUrl && longVideoUrl
                ? 'lg:grid-cols-2'
                : shortsVideoUrl
                  ? 'max-w-md mx-auto w-full'
                  : 'max-w-3xl mx-auto w-full'
            }`}
          >
            {shortsVideoUrl && (
              <div className="rounded-xl border border-amber-500/30 bg-black/50 p-4 space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300">
                      <Video className="h-3.5 w-3.5" /> Shorts & Reels (9:16 Vertical)
                    </span>
                    <span className="rounded bg-yellow-400/20 px-2 py-0.5 text-[10px] font-bold text-yellow-300">
                      {flowSettings.letterboxBanner?.trim()
                        ? `Banner: ${flowSettings.letterboxBanner.trim()}`
                        : 'Clean 9:16 Letterbox'}
                    </span>
                  </div>
                  <div className="relative mx-auto flex justify-center overflow-hidden rounded-lg bg-black border border-white/10 max-h-[460px]">
                    <video
                      controls
                      playsInline
                      className="h-full max-h-[460px] w-auto aspect-[9/16] object-contain"
                      src={shortsVideoUrl}
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-white/10">
                  <a
                    href={shortsVideoUrl}
                    download={`${projectSlug}_shorts_9x16.mp4`}
                    className="studio-btn-primary flex items-center justify-center gap-2 !py-2 w-full text-xs font-bold"
                  >
                    <Download className="h-3.5 w-3.5" /> Download Shorts Video (9:16 MP4)
                  </a>
                </div>
              </div>
            )}

            {longVideoUrl && (
              <div className="rounded-xl border border-amber-500/30 bg-black/50 p-4 space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-500/20 px-2 py-0.5 text-xs font-bold text-blue-300">
                      <Film className="h-3.5 w-3.5" /> Long Video (16:9 Widescreen)
                    </span>
                    <span className="rounded bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                      1080p HD Widescreen
                    </span>
                  </div>
                  <div className="relative mx-auto flex justify-center overflow-hidden rounded-lg bg-black border border-white/10 aspect-video w-full">
                    <video
                      controls
                      playsInline
                      className="w-full h-full object-contain"
                      src={longVideoUrl}
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-white/10">
                  <a
                    href={longVideoUrl}
                    download={`${projectSlug}_long_16x9.mp4`}
                    className="studio-btn-primary flex items-center justify-center gap-2 !py-2 w-full text-xs font-bold"
                  >
                    <Download className="h-3.5 w-3.5" /> Download Long Video (16:9 MP4)
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Multi-Scene Line-by-Line Keyframes Gallery */}
      {sceneImages.length > 0 && (
        <div className="space-y-3 rounded-xl border border-white/10 bg-zinc-950 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-zinc-200 flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-amber-400" />
              Generated Keyframes ({sceneImages.length} Scenes)
            </h4>
            <span className="text-[10px] text-zinc-400">2K HD Cinematic Visuals</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {sceneImages.map((img, idx) => (
              <div key={img.filename || idx} className="space-y-1.5 rounded-lg border border-white/10 bg-black/40 p-2">
                <div className="group relative aspect-video w-full overflow-hidden rounded bg-zinc-900">
                  <img
                    src={img.url}
                    alt={`Scene ${idx + 1}`}
                    className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                  />
                  <span className="absolute bottom-1 left-1 rounded bg-black/80 px-1 py-0.5 text-[9px] font-bold text-amber-300">
                    Scene {idx + 1}
                  </span>
                  <button
                    type="button"
                    disabled={regeneratingScene === img.filename}
                    onClick={() => void handleRegenerateSceneImage(img, idx)}
                    title="Regenerate this scene keyframe"
                    className="absolute top-1 right-1 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-semibold text-white hover:bg-amber-600 transition"
                  >
                    <RefreshCw className={`h-2.5 w-2.5 ${regeneratingScene === img.filename ? 'animate-spin' : ''}`} />
                    Redraw
                  </button>
                </div>
                <p className="line-clamp-2 text-[10px] text-zinc-300 font-medium">{img.line}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
