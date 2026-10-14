import { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Play,
  Pause,
  Square,
  Minimize2,
  Maximize2,
  Download,
  Film,
  Bot,
  Images,
  Volume2,
  Clapperboard,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Copy,
  Check,
} from 'lucide-react';
import { AUTO_PILOT_STAGES, type AutoPilotState } from '../../services/autoPilotTypes';
import type { Script } from '../../data';

interface AutoPilotModalProps {
  state: AutoPilotState;
  script: Script | null;
  onPauseToggle: () => void;
  onStop: () => void;
  onToggleMinimize: () => void;
  onClose: () => void;
  onNavigateTab: (tab: 'scripts' | 'preview' | 'assets' | 'generation' | 'artifacts' | 'review') => void;
}

export function AutoPilotModal({
  state,
  script,
  onPauseToggle,
  onStop,
  onToggleMinimize,
  onClose,
  onNavigateTab,
}: AutoPilotModalProps) {
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const [copiedLogs, setCopiedLogs] = useState(false);

  useEffect(() => {
    if (!state.isMinimized) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state.logs, state.isMinimized]);

  if (!state.isActive && state.stage === 'idle') return null;

  // Render minimized floating pill
  if (state.isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-accent/40 bg-surface/95 px-4 py-3 shadow-pop backdrop-blur-xl animate-slide-up">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/20 text-accent shadow-glow">
          {state.stage === 'completed' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          ) : state.stage === 'error' ? (
            <AlertCircle className="h-5 w-5 text-rose-400" />
          ) : (
            <Sparkles className="h-5 w-5 animate-pulse" />
          )}
        </div>
        <div className="min-w-0 pr-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white">Auto-Pilot</span>
            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent">
              Stage {state.stageIndex + 1}/6 · {Math.round(state.progressPercent)}%
            </span>
          </div>
          <p className="max-w-[220px] truncate text-[11px] text-muted">{state.statusMessage}</p>
        </div>
        <button
          onClick={onToggleMinimize}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-white/10 hover:text-white"
          title="Expand Auto-Pilot HUD"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const scenes = script?.scenePlan?.scenes || [];
  const generatedImages = script?.generatedImages || [];
  const hasAudio = Boolean(script?.generatedAudio?.length);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6 backdrop-blur-md animate-fade-in">
      <div className="studio-card flex h-[92vh] max-h-[840px] w-full max-w-5xl flex-col overflow-hidden border-borderSoft shadow-2xl">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-borderSoft bg-surface/90 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/30 bg-accent/15 text-accent shadow-glow">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">Gemini Auto-Pilot Engine</h2>
                <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
                  End-to-End
                </span>
                {state.isPaused && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                    Paused
                  </span>
                )}
                {state.stage === 'completed' && (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    Finished
                  </span>
                )}
              </div>
              <p className="text-xs text-muted">
                Topic: <strong className="text-white">{state.topic || script?.name || 'Autonomous Video'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {state.stage !== 'completed' && state.stage !== 'error' && (
              <>
                <button
                  type="button"
                  onClick={onPauseToggle}
                  className="studio-btn-ghost !px-3 !py-1.5 text-xs text-muted hover:text-white"
                  title={state.isPaused ? 'Resume pipeline' : 'Pause pipeline'}
                >
                  {state.isPaused ? <Play className="h-3.5 w-3.5 text-emerald-400" /> : <Pause className="h-3.5 w-3.5 text-amber-400" />}
                  {state.isPaused ? 'Resume' : 'Pause'}
                </button>
                <button
                  type="button"
                  onClick={onStop}
                  className="studio-btn-ghost !px-3 !py-1.5 text-xs text-rose-300 hover:bg-rose-500/10"
                  title="Stop and take manual control"
                >
                  <Square className="h-3.5 w-3.5" />
                  Stop
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onToggleMinimize}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-white/5 hover:text-white"
              title="Minimize to floating pill"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
            {(state.stage === 'completed' || state.stage === 'error') && (
              <button
                type="button"
                onClick={onClose}
                className="studio-btn-ghost !px-3 !py-1.5 text-xs"
              >
                Close
              </button>
            )}
          </div>
        </div>

        {/* Stage Stepper Banner */}
        <div className="border-b border-border bg-bg/50 px-5 py-3.5">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {AUTO_PILOT_STAGES.map((s, idx) => {
              const isPast = idx < state.stageIndex || state.stage === 'completed';
              const isCurrent = idx === state.stageIndex && state.stage !== 'completed' && state.stage !== 'error';
              const isUpcoming = idx > state.stageIndex && state.stage !== 'completed';

              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-2 rounded-xl border p-2.5 transition-all ${
                    isCurrent
                      ? 'border-accent/60 bg-accent/10 shadow-glow text-white'
                      : isPast
                        ? 'border-emerald-500/30 bg-emerald-500/5 text-gray-300'
                        : 'border-white/5 bg-surface2/30 text-muted opacity-60'
                  }`}
                >
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                      isPast
                        ? 'bg-emerald-500 text-black'
                        : isCurrent
                          ? 'bg-accent text-white animate-pulse'
                          : 'bg-white/10 text-muted'
                    }`}
                  >
                    {isPast ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : isCurrent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : s.stepNumber}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold leading-tight">{s.label}</p>
                    <p className="truncate text-[10px] text-muted">
                      {isPast ? 'Done' : isCurrent ? 'Working…' : 'Waiting'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="mt-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-white flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${state.stage === 'completed' ? 'bg-emerald-400' : 'bg-accent'}`} />
                  <span className={`relative inline-flex h-2 w-2 rounded-full ${state.stage === 'completed' ? 'bg-emerald-500' : 'bg-accent'}`} />
                </span>
                {state.statusMessage}
              </span>
              <span className="font-mono text-accent font-bold">{Math.round(state.progressPercent)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/5 border border-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-[#ff4d79] transition-all duration-300 shadow-glow"
                style={{ width: `${Math.min(100, Math.max(2, state.progressPercent))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Content Body: Split View */}
        <div className="grid flex-1 grid-cols-1 md:grid-cols-12 overflow-hidden">
          {/* Left Column: Visual Production Preview (7 cols) */}
          <div className="md:col-span-7 flex flex-col border-b md:border-b-0 md:border-r border-border bg-bg/40 p-4 sm:p-5 overflow-y-auto thin-scrollbar">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Film className="h-3.5 w-3.5 text-accent" />
                Live Production Canvas
              </h3>
              {scenes.length > 0 && (
                <span className="text-[11px] font-medium text-muted">
                  {generatedImages.filter((img) => img.url).length} / {scenes.length} Visuals Rendered
                </span>
              )}
            </div>

            {/* Video Player when Rendered */}
            {state.renderedVideoUrl ? (
              <div className="flex-1 flex flex-col items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-950/10 p-4 text-center">
                <div className="w-full max-w-md overflow-hidden rounded-xl border border-white/10 shadow-2xl bg-black aspect-video flex items-center justify-center">
                  <video
                    src={state.renderedVideoUrl}
                    controls
                    autoPlay
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                  <a
                    href={state.renderedVideoUrl}
                    download="tubeflow-video.mp4"
                    className="studio-btn-primary flex items-center gap-2 !px-5 !py-2.5 text-sm"
                  >
                    <Download className="h-4 w-4" />
                    Download MP4 Video
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateTab('review');
                    }}
                    className="studio-btn-ghost flex items-center gap-2 !px-4 !py-2.5 text-sm"
                  >
                    <Clapperboard className="h-4 w-4" />
                    Open in Timeline Editor
                  </button>
                </div>
                <p className="mt-2 text-xs text-emerald-300">
                  🎉 Video production completed end-to-end! All visual scenes, synchronized voiceover and captions compiled.
                </p>
              </div>
            ) : (
              /* Scene Gallery or Active State Preview */
              <div className="flex-1 flex flex-col space-y-4">
                {/* Visual Scene Cards Grid */}
                {scenes.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto max-h-[380px] p-1">
                    {scenes.map((scene, i) => {
                      const img = generatedImages.find((item) => item.index === i && item.url);
                      const isGeneratingThis = state.stage === 'generate_images' && state.sceneCurrent === i + 1;

                      return (
                        <div
                          key={i}
                          className={`group relative flex flex-col overflow-hidden rounded-xl border transition-all ${
                            isGeneratingThis
                              ? 'border-accent shadow-glow bg-accent/5 ring-1 ring-accent'
                              : img
                                ? 'border-emerald-500/30 bg-surface'
                                : 'border-borderSoft bg-surface2/40'
                          }`}
                        >
                          <div className="relative aspect-video w-full overflow-hidden bg-black/60 flex items-center justify-center">
                            {img?.url ? (
                              <img
                                src={img.url}
                                alt={`Scene ${i + 1}`}
                                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                              />
                            ) : isGeneratingThis ? (
                              <div className="flex flex-col items-center gap-1.5 text-accent p-2 text-center">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                <span className="text-[10px] font-bold">Google Cloud…</span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-1 text-muted">
                                <Images className="h-4 w-4 opacity-40" />
                                <span className="text-[10px]">Pending</span>
                              </div>
                            )}
                            <span className="absolute left-1.5 top-1.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
                              Scene {i + 1}
                            </span>
                          </div>
                          <div className="p-2">
                            <p className="line-clamp-2 text-[11px] leading-tight text-gray-300">
                              {scene.narrationText || scene.imagePrompt}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Initial Generation State */
                  <div className="flex-1 flex flex-col items-center justify-center rounded-2xl border border-dashed border-borderSoft p-6 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent mb-3 animate-pulse">
                      <Bot className="h-6 w-6" />
                    </div>
                    <h4 className="text-sm font-semibold text-white">Autonomous Generation in Progress</h4>
                    <p className="mt-1 max-w-sm text-xs text-muted leading-relaxed">
                      Google Gemini is orchestrating the research, script breakdown, image synthesis, and timeline assembly.
                    </p>
                  </div>
                )}

                {/* Audio Status pill */}
                <div className="rounded-xl border border-borderSoft bg-surface/70 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${hasAudio ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-muted'}`}>
                      <Volume2 className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white">Voiceover Synthesis</p>
                      <p className="text-[11px] text-muted">
                        {hasAudio ? `Synchronized (${script?.generatedAudio?.[0]?.language?.toUpperCase() || 'EN'})` : 'Awaiting audio stage'}
                      </p>
                    </div>
                  </div>
                  {hasAudio && (
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                      Ready
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Gemini Supervisor Terminal Feed (5 cols) */}
          <div className="md:col-span-5 flex flex-col bg-surface/80 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                <Bot className="h-3.5 w-3.5 text-accent" />
                Gemini Co-Pilot Logs
              </h3>
              <button
                type="button"
                onClick={() => {
                  const text = state.logs.map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');
                  navigator.clipboard.writeText(text);
                  setCopiedLogs(true);
                  setTimeout(() => setCopiedLogs(false), 2000);
                }}
                className="flex items-center gap-1 text-[11px] text-muted hover:text-white"
                title="Copy activity logs"
              >
                {copiedLogs ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                {copiedLogs ? 'Copied' : 'Copy'}
              </button>
            </div>

            {/* Terminal Window */}
            <div className="thin-scrollbar flex-1 overflow-y-auto rounded-xl border border-borderSoft bg-black/70 p-3 font-mono text-[11px] leading-relaxed shadow-inner">
              <div className="space-y-2">
                {state.logs.map((log) => {
                  const isGemini = log.type === 'gemini';
                  const isSuccess = log.type === 'success';
                  const isError = log.type === 'error';
                  const isWarn = log.type === 'warn';

                  return (
                    <div key={log.id} className="flex items-start gap-2">
                      <span className="text-[10px] text-muted/60 shrink-0 select-none">
                        {log.timestamp}
                      </span>
                      <span
                        className={`rounded px-1 text-[9px] font-bold uppercase shrink-0 ${
                          isGemini
                            ? 'bg-accent/20 text-accent'
                            : isSuccess
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : isError
                                ? 'bg-rose-500/20 text-rose-400'
                                : isWarn
                                  ? 'bg-amber-500/20 text-amber-400'
                                  : 'bg-white/10 text-gray-300'
                        }`}
                      >
                        {log.type}
                      </span>
                      <span
                        className={`break-words ${
                          isGemini
                            ? 'text-accent font-medium'
                            : isSuccess
                              ? 'text-emerald-300'
                              : isError
                                ? 'text-rose-300 font-bold'
                                : isWarn
                                  ? 'text-amber-300'
                                  : 'text-gray-300'
                        }`}
                      >
                        {log.message}
                      </span>
                    </div>
                  );
                })}
                <div ref={terminalEndRef} />
              </div>
            </div>

            {/* Quick Helper Note */}
            <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
              <span>Supervised by Google Gemini</span>
              <span className="flex items-center gap-1 text-accent">
                Autonomous Engine <ChevronRight className="h-3 w-3" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
