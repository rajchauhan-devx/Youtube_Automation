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
}

const EMPTY_FLOW_SETTINGS: Partial<FlowMusicConfig> = {
  enabled: false,
  prompt: '',
  lyrics: '',
  lyricsMode: 'custom',
  title: '',
  mood: '',
  theme: '',
  vocalProfile: '',
  sfxBooms: true,
  sfxRisers: true,
  dholPercussion: true,
  brassSwells: true,
  duration: 60,
  bpm: 110,
  producerModel: 'Google Lyria / Flow Music',
  imageOnlyReel: true,
  letterboxBanner: '',
  vfxParticles: true,
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

  const [songApproved, setSongApproved] = useState(false);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const [videoGenerating, setVideoGenerating] = useState(false);
  const [activeVideoJobId, setActiveVideoJobId] = useState<string | null>(null);
  const [videoStage, setVideoStage] = useState('');
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoError, setVideoError] = useState('');
  const [videoSuccess, setVideoSuccess] = useState('');

  const [shortsVideoUrl, setShortsVideoUrl] = useState<string | null>(null);
  const [longVideoUrl, setLongVideoUrl] = useState<string | null>(null);
  const [sceneImages, setSceneImages] = useState<
    Array<{ line: string; prompt: string; filename: string; url: string }>
  >([]);
  const [regeneratingScene, setRegeneratingScene] = useState<string | null>(null);

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
      return;
    }

    try {
      const res = await fetch('/api/flow-music/latest-track');
      if (res.ok) {
        const data = await res.json();
        if (data?.track?.url) {
          setMusicUrl(data.track.url);
          setTrackTitle(data.track.title || data.track.filename || 'Generated Track');
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
    }
    setSuccess(`Loaded script "${chosen.name}". Click "Build Scenes from Script" to prepare keyframes.`);
  };

  const handleLoadHanumanPresetScenes = async () => {
    try {
      const res = await fetch('/api/flow-music/scenes');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.scenes)) {
          setScenes(data.scenes);
          setStoryboardExpanded(true);
          setSuccess('Loaded Hanuman Demo Preset (script, mix & 8 HD scenes).');
        }
      }
    } catch {}
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
          'x-track-filename': file.name,
          'x-track-title': encodeURIComponent(flowSettings.title || file.name.replace(/\.[^.]+$/, '')),
          'x-script-id': targetScriptId,
        },
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setMusicUrl(data.track.url);
      setTrackTitle(data.track.title || file.name);
      setSongApproved(false);
      setApprovedAt(null);
      setSuccess(`Uploaded audio "${data.track.title}". Preview it below and click Approve to unlock video render!`);
    } catch (e: any) {
      setError(e?.message || 'Audio upload failed');
    } finally {
      setUploadingAudio(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleApproveSong = async (approve: boolean) => {
    setApproving(true);
    setError('');
    try {
      const res = await fetch('/api/flow-music/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: targetScriptId,
          approved: approve,
          songUrl: musicUrl,
          trackTitle: trackTitle || flowSettings.title || 'Custom Track',
        }),
      });
      if (res.ok) {
        setSongApproved(approve);
        setApprovedAt(approve ? new Date().toISOString() : null);
        if (approve) {
          setSuccess('Audio approved! You can now render HD Shorts (9:16) & Long (16:9) videos.');
        } else {
          setSuccess('Song approval revoked.');
        }
      } else {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to update approval');
      }
    } catch (e: any) {
      setError(e.message || 'Error updating approval');
    } finally {
      setApproving(false);
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

    try {
      const res = await fetch('/api/flow-music/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: targetScriptId,
          settings: flowSettings,
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
          setSuccess('Audio track generated! Listen below and click Approve to continue.');
          setTrackTitle(flowSettings.title?.trim() || 'Generated Flow Music Track');
          setSongApproved(false);
          setApprovedAt(null);
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

  const handleGenerateVideos = async () => {
    if (!songApproved) {
      setError('Song approval required! Please listen to the track and click "Approve Song" before starting video production.');
      return;
    }

    const token = ++sessionTokenRef.current;
    setVideoGenerating(true);
    setVideoError('');
    setVideoSuccess('');
    setVideoStage('Initializing 2K HD scene generation pipeline...');
    setVideoProgress(5);

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
          setVideoSuccess('Shorts (9:16) and Long (16:9) final HD videos created successfully!');
          if (currentJob.shortsVideoUrl) setShortsVideoUrl(currentJob.shortsVideoUrl);
          if (currentJob.longVideoUrl) setLongVideoUrl(currentJob.longVideoUrl);
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
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setSettingsExpanded((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-2.5 text-left text-xs font-bold text-zinc-200 hover:bg-zinc-900"
        >
          <span>Step 1 · Script, Lyrics & Visual Direction</span>
          {settingsExpanded ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
        </button>

        {settingsExpanded && (
          <FlowMusicSettingsSection
            value={flowSettings}
            onChange={updateSettings}
            onLoadPreset={() => void handleLoadHanumanPresetScenes()}
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
      <div className="rounded-xl border border-amber-500/40 bg-zinc-900/70 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-amber-400" />
              Step 2 · Audio Track & Approval Gate
            </h4>
            <p className="text-xs text-zinc-400">
              Generate with Google Flow Music or upload your own MP3/WAV audio track
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
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

            {/* Approval Gate */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className={`h-5 w-5 ${songApproved ? 'text-emerald-400' : 'text-amber-400'}`} />
                  <h4 className="text-sm font-bold text-white">Song Approval Gate & Video Production</h4>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      songApproved
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {songApproved ? '✓ Approved' : '⏳ Awaiting Approval'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  {songApproved
                    ? 'Approved! Ready to generate multi-line 2K HD mythological paintings and both final videos (Shorts 9:16 + Long 16:9).'
                    : 'Listen to your track and approve it to unlock multi-scene 2K HD video generation.'}
                </p>
                {approvedAt && songApproved && (
                  <p className="text-[10px] text-emerald-400/80 mt-0.5">
                    Approved at {new Date(approvedAt).toLocaleTimeString()}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!songApproved ? (
                  <button
                    type="button"
                    disabled={approving || generating || videoGenerating}
                    onClick={() => handleApproveSong(true)}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2.5 text-xs font-bold text-white shadow-glow hover:brightness-110 disabled:opacity-50 transition"
                  >
                    {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Approve Song & Unlock Video Production
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={videoGenerating}
                      onClick={handleGenerateVideos}
                      className="studio-btn-primary flex items-center gap-2 !py-2.5 !px-5 text-xs font-bold shadow-glow disabled:opacity-50"
                    >
                      {videoGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
                      {videoGenerating ? 'Rendering Full Videos...' : 'Generate Full Video (Shorts 9:16 + Long 16:9)'}
                    </button>
                    {videoGenerating && (
                      <button
                        type="button"
                        onClick={handleCancelVideoJob}
                        className="flex items-center gap-1 rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/25"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Cancel
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={approving || videoGenerating}
                      onClick={() => handleApproveSong(false)}
                      className="text-xs text-zinc-400 hover:text-rose-400 px-2 py-1 transition"
                    >
                      Revoke Approval
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

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
              Generating 2K HD scene keyframes, assembling Lanczos Ken Burns zoompan, and burning synced captions.
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

      {/* STEP 3: Completed Videos Showcase */}
      {(shortsVideoUrl || longVideoUrl) && (
        <div className="space-y-4 rounded-xl border border-amber-500/40 bg-zinc-950 p-5 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Film className="h-4 w-4 text-amber-400" />
                Final Output Videos · Both Formats Ready
              </h4>
              <p className="text-xs text-zinc-400">
                Created with line-by-line 2K HD scenes, smooth Lanczos camera parallax, and approved audio
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearVideosOnly}
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-white/10"
              >
                <Trash2 className="h-3 w-3" /> Clear Videos Only
              </button>
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 border border-emerald-500/30">
                ✓ Production Complete
              </span>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
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
