import { useState } from 'react';
import { X, Sparkles, Play, AlertCircle, Loader2 } from 'lucide-react';
import type { Script } from '../../data';
import { AutoPilotSettingsSchema, defaultAutoPilotSettings, type AutoPilotSettings } from '../../../server/src/services/autopilot-settings';
import { AutoPilotSettingsPanel } from './AutoPilotSettingsPanel';

export function ScriptRunModal({
  script,
  onClose,
  onSubmit,
}: {
  script: Script;
  onClose: () => void;
  onSubmit: (topic: string, instructions: string, options?: { autoPilot?: boolean; settings?: AutoPilotSettings }) => void | Promise<void>;
}) {
  const [topic, setTopic] = useState(script.youtubeExport?.uploadedVideoId ? '' : (script.topicName || ''));
  const [instructions, setInstructions] = useState(script.aiInstructions || '');

  const [mode, setMode] = useState<'auto' | 'script'>('auto');
  const [settings, setSettings] = useState<AutoPilotSettings>(() => {
    const saved = AutoPilotSettingsSchema.safeParse(script.autoPilotSettings);
    const initial = saved.success ? saved.data : defaultAutoPilotSettings(script);
    if (initial.voice.language === 'auto') {
      const text = script.narration || script.extractedScript || script.content || [script.aiInstructions, ...script.prompts.map(prompt => prompt.content)].filter(Boolean).join('\n');
      initial.voice.language = /[\u0900-\u097F]|\bHindi\b/i.test(text) ? 'hi' : 'en';
    }
    if (initial.youtube.publishMode === 'schedule') {
      const ts = initial.youtube.scheduledPublishAt ? Date.parse(initial.youtube.scheduledPublishAt) : NaN;
      if (!Number.isFinite(ts) || ts <= Date.now() + 5 * 60_000) {
        const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
        d.setHours(18, 0, 0, 0);
        initial.youtube.scheduledPublishAt = d.toISOString();
      }
    }
    return initial;
  });
  const [voiceReady, setVoiceReady] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(autoPilot: boolean) {
    console.log('[ScriptRunModal] handleSubmit called, autoPilot =', autoPilot);
    const cleaned = topic.trim();
    setError('');

    if (!cleaned && !autoPilot) {
      setError('Please enter a topic name to generate the script.');
      return;
    }
    if (autoPilot && !voiceReady) {
      setError('Narration voice is still loading. Please wait a moment or select a voice under Narration settings.');
      return;
    }
    if (autoPilot && settings.presenter?.enabled && !settings.presenter.avatarId) {
      setError('Select a MuseTalk avatar character before running with AI Presenter enabled.');
      return;
    }
    const parsed = AutoPilotSettingsSchema.safeParse(settings);
    if (autoPilot && !parsed.success) {
      const issueMsg = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      console.error('[ScriptRunModal] Configuration error:', issueMsg);
      setError(`Configuration error: ${issueMsg}`);
      return;
    }
    if (autoPilot && settings.youtube.enabled && settings.youtube.publishMode === 'schedule' && Date.parse(settings.youtube.scheduledPublishAt) <= Date.now() + 5 * 60_000) {
      setError('Choose a publication time at least five minutes in the future, allowing time for production.');
      return;
    }
    setBusy(true);
    try {
      console.log('[ScriptRunModal] Triggering onSubmit...');
      await onSubmit(cleaned, instructions.trim(), { autoPilot, ...(autoPilot && parsed.success ? { settings: parsed.data } : {}) });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Could not start this production.';
      console.error('[ScriptRunModal] Submit error:', error);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
      <div className="studio-card flex max-h-[calc(100dvh-2rem)] w-full max-w-[800px] flex-col overflow-hidden shadow-pop animate-scale-in">
        <div className="flex shrink-0 items-center justify-between border-b border-borderSoft p-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent shadow-glow">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Autonomous Production</p>
              <h2 className="mt-0.5 text-lg font-bold tracking-tight">Run Video Script</h2>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-white/5 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          id="run-script-modal-form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit(mode === 'auto');
          }}
          className="flex-1 overflow-y-auto space-y-4 p-5 sm:p-6"
        >
          {error && (
            <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-500/50 bg-red-950/80 p-3 text-xs text-red-200 shadow-lg animate-fade-in">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                <strong className="font-semibold text-red-300">Cannot start: </strong>
                {error}
              </div>
              <button type="button" onClick={() => setError('')} className="text-red-400 hover:text-white px-1 font-bold">✕</button>
            </div>
          )}

          <p className="-mt-1 text-[13px] leading-relaxed text-muted">
            Running <strong className="text-white">{script.name}</strong>. {mode === 'auto' ? 'Leave the topic blank to let AI choose a fresh topic for this profile.' : 'Enter a topic to generate the script.'}
          </p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Run mode">
            <button type="button" aria-pressed={mode === 'auto'} disabled={busy} onClick={() => setMode('auto')} className={mode === 'auto' ? 'studio-btn-primary justify-center' : 'studio-btn-ghost justify-center'}>Auto-Pilot</button>
            <button type="button" aria-pressed={mode === 'script'} disabled={busy} onClick={() => setMode('script')} className={mode === 'script' ? 'studio-btn-primary justify-center' : 'studio-btn-ghost justify-center'}>Script only</button>
          </div>
          <div className="space-y-2">
            <label htmlFor="run-topic" className="studio-label">
              {mode === 'auto' ? 'Topic name · Optional for Auto-Pilot' : 'Topic name · Required'}
            </label>
            <input
              id="run-topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={mode === 'auto' ? 'Leave blank — AI will find a topic for this profile' : 'Enter the video topic'}
              className="studio-input"
              autoFocus
            />
          </div>
          {mode === 'auto' && (
            <p className="text-xs leading-relaxed text-muted">
              Auto-Pilot checks this profile’s topic notes before production. {settings.youtube.enabled ? 'After a successful YouTube export, the topic is saved so it won’t be selected again.' : 'With No Export selected, the video will be rendered for you to export manually.'}
            </p>
          )}
          <div className="space-y-2">
            <label htmlFor="run-instructions" className="studio-label">
              AI instructions · Optional
            </label>
            <textarea
              id="run-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Make it dramatic, suspenseful pacing, cinematic imagery..."
              className="studio-input h-20 resize-none"
            />
          </div>

          {mode === 'auto' && <AutoPilotSettingsPanel scriptExcerpt={script.narration || script.extractedScript || ''} value={settings} onChange={setSettings} onVoiceReady={setVoiceReady} />}

          {mode === 'auto' && (
            <div className="rounded-xl border border-accent/20 bg-accent/5 p-3 text-xs leading-relaxed text-gray-300">
              <div className="flex items-center gap-1.5 font-semibold text-accent mb-0.5">
                <Sparkles className="h-3.5 w-3.5" />
                Auto-Pilot ({settings.youtube.enabled ? 'Topic Research → YouTube Export' : 'Topic Research → Render & Review, Manual Export'})
              </div>
              AI selects a fresh topic, compares three hooks, plans the title and thumbnail, edits the story, produces the video{settings.presenter?.enabled ? ` with MuseTalk AI Presenter (${settings.presenter.widthPercent}% size)` : ''}, and reviews sampled final visuals and audio. {settings.youtube.enabled ? 'Uploads directly to YouTube upon passing review.' : 'Final video will be rendered and ready for manual export.'}
            </div>
          )}
        </form>

        <div className="flex shrink-0 flex-col gap-2.5 border-t border-borderSoft bg-surface px-5 py-3.5 sm:px-6">
          {error && (
            <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-500/50 bg-red-950/80 p-3 text-xs text-red-200 shadow-lg animate-fade-in">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                <strong className="font-semibold text-red-300">Cannot start: </strong>
                {error}
              </div>
              <button type="button" onClick={() => setError('')} className="text-red-400 hover:text-white px-1 font-bold">✕</button>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={onClose} className="studio-btn-ghost text-xs">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit(mode === 'auto')}
              disabled={busy}
              className="studio-btn-primary flex items-center gap-2 text-xs !py-2.5 shadow-glow disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'auto' ? <Sparkles className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {busy
                ? 'Starting Production…'
                : mode === 'auto'
                  ? 'Run Auto-Pilot'
                  : 'Run Script Only'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
