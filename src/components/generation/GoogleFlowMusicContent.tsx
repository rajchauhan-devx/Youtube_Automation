import { useState, useEffect } from 'react';
import {
  Music,
  Play,
  Pause,
  RefreshCw,
  Sparkles,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Download,
  Loader2,
  Volume2,
  Film,
  Video,
  Image as ImageIcon,
  ShieldCheck,
  Flame,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { useWorkspaceApi } from '../../services/workspaceApi';
import type { Script } from '../../data';
import { FlowMusicSettingsSection, type FlowMusicConfig } from '../scripts/FlowMusicSettingsSection';

export function GoogleFlowMusicContent({
  script,
  onUpdate,
}: {
  script?: Script | null;
  onUpdate?: (patch: Partial<Script>) => void;
}) {
  const { fetch, account } = useWorkspaceApi();
  const [generating, setGenerating] = useState(false);
  const [stage, setStage] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [musicUrl, setMusicUrl] = useState<string | null>(script?.generatedMusic?.url || null);
  const [trackTitle, setTrackTitle] = useState<string>('Lord Hanuman Vow // Goosebumps 🚩 (Google Flow Lyria 3.5)');

  const initialSettings = (script?.autoPilotSettings as any)?.flowMusic || {};
  const [flowSettings, setFlowSettings] = useState<Partial<FlowMusicConfig>>(initialSettings);

  const targetScriptId = script?.id || 'usr_dharma_conversational_dialogue';

  const [songApproved, setSongApproved] = useState(false);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoStage, setVideoStage] = useState('');
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoError, setVideoError] = useState('');
  const [videoSuccess, setVideoSuccess] = useState('');

  const [shortsVideoUrl, setShortsVideoUrl] = useState<string | null>(null);
  const [longVideoUrl, setLongVideoUrl] = useState<string | null>(null);
  const [sceneImages, setSceneImages] = useState<Array<{ line: string; prompt: string; filename: string; url: string }>>([]);

  const loadApprovalAndVideos = async () => {
    try {
      const appRes = await fetch(`/api/flow-music/approval/${targetScriptId}`);
      if (appRes.ok) {
        const appData = await appRes.json();
        setSongApproved(Boolean(appData.approved));
        setApprovedAt(appData.approvedAt || null);
      }

      const vidRes = await fetch('/api/flow-music/latest-videos');
      if (vidRes.ok) {
        const vidData = await vidRes.json();
        if (vidData.shorts?.url) setShortsVideoUrl(vidData.shorts.url);
        if (vidData.long?.url) setLongVideoUrl(vidData.long.url);
      }
    } catch {}
  };

  useEffect(() => {
    void loadApprovalAndVideos();
  }, [targetScriptId]);

  useEffect(() => {
    if (script?.generatedMusic?.url) {
      setMusicUrl(script.generatedMusic.url);
      return;
    }

    // Auto-fetch latest generated track from Flow Music engine
    void (async () => {
      try {
        const res = await fetch('/api/flow-music/latest-track');
        if (res.ok) {
          const data = await res.json();
          if (data?.track?.url) {
            setMusicUrl(data.track.url);
            if (data.track.title) setTrackTitle(data.track.title);
          }
        }
      } catch {}
    })();
  }, [script?.generatedMusic?.url]);

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
          trackTitle,
        }),
      });
      if (res.ok) {
        setSongApproved(approve);
        setApprovedAt(approve ? new Date().toISOString() : null);
        if (approve) {
          setSuccess('Google Flow Music soundtrack approved! You can now generate full Shorts & Long videos.');
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

  const handleGenerateVideos = async () => {
    if (!songApproved) {
      setError('Song approval required! Please review and click "Approve Song" before starting video production.');
      return;
    }

    setVideoGenerating(true);
    setVideoError('');
    setVideoSuccess('');
    setVideoStage('Initializing multi-line graphic novel pipeline...');
    setVideoProgress(5);

    try {
      const res = await fetch('/api/flow-music/generate-full-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: targetScriptId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to start video generation');
      }

      const jobData = await res.json();
      const jobId = jobData.id;

      // Poll video job status
      let done = false;
      while (!done) {
        await new Promise((r) => setTimeout(r, 2500));
        const pollRes = await fetch(`/api/flow-music/video-job/${jobId}`);
        if (!pollRes.ok) continue;

        const currentJob = await pollRes.json();
        setVideoStage(currentJob.stage || 'Rendering videos...');
        setVideoProgress(currentJob.progress || 10);

        if (Array.isArray(currentJob.images) && currentJob.images.length > 0) {
          setSceneImages(currentJob.images);
        }

        if (currentJob.state === 'done') {
          done = true;
          setVideoSuccess('Shorts (9:16) and Long (16:9) final videos created successfully!');
          if (currentJob.shortsVideoUrl) setShortsVideoUrl(currentJob.shortsVideoUrl);
          if (currentJob.longVideoUrl) setLongVideoUrl(currentJob.longVideoUrl);
        } else if (currentJob.state === 'error') {
          done = true;
          throw new Error(currentJob.error || 'Video rendering failed');
        }
      }
    } catch (e: any) {
      setVideoError(e.message || 'Error generating full videos');
    } finally {
      setVideoGenerating(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    setSuccess('');
    setStage('Starting Google Flow Music generation...');
    setProgress(5);

    try {
      const targetScriptId = script?.id || `dharma_flow_${Date.now()}`;
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

      // Poll job status
      let done = false;
      while (!done) {
        await new Promise((r) => setTimeout(r, 2000));
        const pollRes = await fetch(`/api/flow-music/jobs/${jobId}`);
        if (!pollRes.ok) continue;

        const currentJob = await pollRes.json();
        setStage(currentJob.stage || 'Generating...');
        setProgress(currentJob.progress || 20);

        if (currentJob.state === 'done') {
          done = true;
          setSuccess('Google Flow Music successfully generated!');
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
        } else if (currentJob.state === 'error') {
          done = true;
          throw new Error(currentJob.error || 'Generation failed');
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Error generating Flow Music');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6 space-y-5">
      {/* Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-zinc-900/80 p-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Music className="h-5 w-5 text-amber-400" />
            Google Flow Music Studio · Ancient Dharma
          </h3>
          <p className="text-xs text-zinc-400">
            Generate high-intensity cinematic Vedic trailer music with Playwright automation for{' '}
            <strong className="text-amber-300">{script?.name || account?.name || 'Ancient Dharma'}</strong>
          </p>
        </div>

        <button
          type="button"
          disabled={generating}
          onClick={handleGenerate}
          className="studio-btn-primary flex items-center gap-2 !py-2.5 !px-5 text-xs font-bold shadow-glow disabled:opacity-50"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generating ? 'Generating in Google Flow...' : 'Generate Flow Music Track'}
        </button>
      </div>

      {/* Progress & Alert Banners */}
      {generating && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-4 space-y-2">
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

      {/* Audio Player Preview (if generated) */}
      {musicUrl && (
        <div className="rounded-xl border border-amber-500/40 bg-zinc-950/90 p-5 space-y-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> Lyria 3.5 Generated
                </span>
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                  2:53 Epic Trailer Mix
                </span>
              </div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-amber-400" />
                {trackTitle}
              </h4>
            </div>
            <a
              href={musicUrl}
              download="hanuman_vedic_trailer_flow.mp3"
              className="studio-btn-primary flex items-center gap-1.5 !py-1.5 !px-3 text-xs font-semibold"
            >
              <Download className="h-3.5 w-3.5" /> Download Full MP3
            </a>
          </div>
          <audio controls loop className="w-full h-11 rounded-lg bg-zinc-900" src={musicUrl} />
          <p className="text-[11px] text-zinc-400 italic">
            Featuring sacred Devanagari Sanskrit chants (बजरंगबली, अतुलितबलधामम्, महाकाल शंभोरावतारः) with high-intensity Vedic dhol percussion, sub-bass drops, and orchestral brass swells.
          </p>
        </div>
      )}

      {/* Song Approval Gate & Video Production Controller */}
      {musicUrl && (
        <div className="rounded-xl border border-amber-500/50 bg-gradient-to-r from-amber-950/40 via-zinc-950 to-zinc-950 p-5 space-y-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className={`h-5 w-5 ${songApproved ? 'text-emerald-400' : 'text-amber-400'}`} />
                <h4 className="text-sm font-bold text-white">
                  Song Approval Gate & Video Production Protocol
                </h4>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    songApproved
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {songApproved ? '✓ Song Approved 🚩' : '⏳ Awaiting Approval'}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                {songApproved
                  ? `Song approved! You are ready to generate multi-line graphic novel images and both final videos (Shorts 9:16 + Long 16:9).`
                  : `Please listen to the track above. Image generation and final video rendering will ONLY start after this song is approved.`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {!songApproved ? (
                <>
                  <button
                    type="button"
                    disabled={approving || generating || videoGenerating}
                    onClick={() => handleApproveSong(true)}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2.5 text-xs font-bold text-white shadow-glow hover:brightness-110 disabled:opacity-50 transition"
                  >
                    {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Approve Song & Unlock Video Production
                  </button>
                  <button
                    type="button"
                    disabled={generating || approving}
                    onClick={handleGenerate}
                    className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-xs font-medium text-zinc-300 hover:text-white transition"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${generating ? 'animate-spin' : ''}`} />
                    Regenerate Track
                  </button>
                </>
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
                Generating 8 distinct graphic novel keyframes based on each dialogue line, then assembling with 2.5D Ken Burns zoompan, floating fire embers, and letterboxed "Goosebumps 🚩" canvas.
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
      )}

      {/* Completed Videos Showcase (Both Shorts 9:16 and Long 16:9) */}
      {(shortsVideoUrl || longVideoUrl) && (
        <div className="space-y-4 rounded-xl border border-amber-500/40 bg-zinc-950 p-5 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Film className="h-4 w-4 text-amber-400" />
                Final Output Videos · Both Formats Ready
              </h4>
              <p className="text-xs text-zinc-400">
                Created with line-by-line graphic novel illustrations, 2.5D camera parallax, floating ember VFX, and approved Lyria 3.5 audio
              </p>
            </div>
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 border border-emerald-500/30">
              ✓ Production Complete
            </span>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* 1. Shorts / Instagram Reel Video (9:16) */}
            {shortsVideoUrl && (
              <div className="rounded-xl border border-amber-500/30 bg-black/50 p-4 space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300">
                      <Video className="h-3.5 w-3.5" /> Shorts & Reels (9:16 Vertical)
                    </span>
                    <span className="rounded bg-yellow-400/20 px-2 py-0.5 text-[10px] font-bold text-yellow-300">
                      Top Banner: Goosebumps 🚩
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
                  <div className="flex flex-wrap gap-1.5 text-[10px] text-zinc-400">
                    <span className="rounded bg-white/5 px-1.5 py-0.5">9:16 Letterboxed</span>
                    <span className="rounded bg-white/5 px-1.5 py-0.5">Ken Burns 2.5D Zoom</span>
                    <span className="rounded bg-white/5 px-1.5 py-0.5">Ember Particle VFX</span>
                    <span className="rounded bg-white/5 px-1.5 py-0.5">Kinetic Text Sync</span>
                  </div>
                  <a
                    href={shortsVideoUrl}
                    download="dharma_hanuman_shorts_goosebumps.mp4"
                    className="studio-btn-primary flex items-center justify-center gap-2 !py-2 w-full text-xs font-bold"
                  >
                    <Download className="h-3.5 w-3.5" /> Download Shorts Video (9:16 MP4)
                  </a>
                </div>
              </div>
            )}

            {/* 2. Long Video (16:9 Widescreen) */}
            {longVideoUrl && (
              <div className="rounded-xl border border-amber-500/30 bg-black/50 p-4 space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-500/20 px-2 py-0.5 text-xs font-bold text-blue-300">
                      <Film className="h-3.5 w-3.5" /> Long Video (16:9 Widescreen)
                    </span>
                    <span className="rounded bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                      1080p Cinematic Widescreen
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
                  <div className="flex flex-wrap gap-1.5 text-[10px] text-zinc-400">
                    <span className="rounded bg-white/5 px-1.5 py-0.5">16:9 Cinematic</span>
                    <span className="rounded bg-white/5 px-1.5 py-0.5">Vedic War Color Grade</span>
                    <span className="rounded bg-white/5 px-1.5 py-0.5">Smooth Crossfades</span>
                    <span className="rounded bg-white/5 px-1.5 py-0.5">Dynamic Parallax</span>
                  </div>
                  <a
                    href={longVideoUrl}
                    download="dharma_hanuman_long_cinematic.mp4"
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

      {/* Multi-Scene Line-by-Line Graphic Novel Gallery */}
      {sceneImages.length > 0 && (
        <div className="space-y-3 rounded-xl border border-white/10 bg-zinc-950 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-zinc-200 flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-amber-400" />
              Generated Keyframes ({sceneImages.length} Scenes Based on Each Line)
            </h4>
            <span className="text-[10px] text-zinc-400">Modern Indian Graphic Novel Art Style</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {sceneImages.map((img, idx) => (
              <div key={idx} className="space-y-1.5 rounded-lg border border-white/10 bg-black/40 p-2">
                <div className="relative aspect-video w-full overflow-hidden rounded bg-zinc-900">
                  <img
                    src={img.url}
                    alt={`Scene ${idx + 1}`}
                    className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                  />
                  <span className="absolute bottom-1 left-1 rounded bg-black/80 px-1 py-0.5 text-[9px] font-bold text-amber-300">
                    Scene {idx + 1}
                  </span>
                </div>
                <p className="line-clamp-2 text-[10px] text-zinc-300 font-medium">
                  {img.line}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Complete Settings Panel */}
      <FlowMusicSettingsSection
        value={flowSettings}
        onChange={(patch) => {
          const updated = { ...flowSettings, ...patch };
          setFlowSettings(updated);
          if (script && onUpdate) {
            onUpdate({
              autoPilotSettings: {
                ...(script.autoPilotSettings as any),
                flowMusic: updated,
              } as any,
            });
          }
        }}
        topicName={script?.name || account?.name || 'Ancient Dharma'}
      />
    </div>
  );
}
