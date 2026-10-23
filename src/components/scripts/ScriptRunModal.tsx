import { useState } from 'react';
import { X, Sparkles, Play } from 'lucide-react';
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
    return initial;
  });
  const [voiceReady, setVoiceReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(autoPilot: boolean) {
    const cleaned = topic.trim();
    if (!cleaned && !autoPilot) return;
    setError('');
    if (autoPilot && !voiceReady) { setError('Select an available narration voice before running.'); return; }
    const parsed = AutoPilotSettingsSchema.safeParse(settings);
    if (autoPilot && !parsed.success) { setError(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).slice(0, 3).join('; ')); return; }
    if (autoPilot && settings.youtube.publishMode === 'schedule' && Date.parse(settings.youtube.scheduledPublishAt) <= Date.now() + 5 * 60_000) { setError('Choose a publication time at least five minutes in the future, allowing time for production.'); return; }
    setBusy(true);
    try { await onSubmit(cleaned, instructions.trim(), { autoPilot, ...(autoPilot && parsed.success ? { settings: parsed.data } : {}) }); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not start this production.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
      <div className="studio-card max-h-[calc(100dvh-2rem)] w-full max-w-[800px] overflow-y-auto shadow-pop animate-scale-in">
        <div className="flex items-center justify-between border-b border-borderSoft p-5">
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
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit(mode === 'auto');
          }}
          className="space-y-4 p-5 sm:p-6"
        >
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
          {mode === 'auto' && <p className="text-xs leading-relaxed text-muted">Auto-Pilot checks this profile’s topic notes before production. After a successful YouTube export, the topic is saved so it won’t be selected again.</p>}
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
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}

          {mode === 'auto' && <div className="rounded-xl border border-accent/20 bg-accent/5 p-3 text-xs leading-relaxed text-gray-300">
            <div className="flex items-center gap-1.5 font-semibold text-accent mb-0.5">
              <Sparkles className="h-3.5 w-3.5" />
              Auto-Pilot (Topic Research → YouTube Export)
            </div>
            AI selects a fresh topic, compares three hooks, plans the title and thumbnail, edits the story, produces the video, and reviews sampled final visuals and audio before YouTube export. Your selected production settings are saved with this script and used throughout the run.
          </div>}

          <div className="sticky bottom-0 z-10 -mx-5 flex flex-wrap items-center justify-between gap-2 border-t border-borderSoft bg-surface px-5 py-3 sm:-mx-6 sm:px-6">
            <button type="button" onClick={onClose} className="studio-btn-ghost text-xs">
              Cancel
            </button>
            <button type="submit" disabled={busy || (mode === 'auto' ? !voiceReady : !topic.trim())} className="studio-btn-primary flex items-center gap-2 text-xs !py-2.5 shadow-glow disabled:opacity-50">
              {mode === 'auto' ? <Sparkles className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {busy ? 'Starting…' : mode === 'auto' ? 'Run Auto-Pilot' : 'Run Script Only'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
