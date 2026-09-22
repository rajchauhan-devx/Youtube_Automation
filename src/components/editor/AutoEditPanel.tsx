import { useMemo, useState, useRef, useEffect } from 'react';
import { useWorkspaceApi } from '../../services/workspaceApi';
import { Sparkles, Check, ChevronDown } from 'lucide-react';
import { autoEditPlan, editingPreset, EDIT_MOTIONS, EDIT_TRANSITIONS, type EditingSettings } from '../../../server/src/services/auto-edit';
import type { ScenePlan } from '../../../server/src/services/scene-plan';
import { GEMINI_MODELS } from '../../data';
import { LOCAL_MODELS } from '../../../server/src/services/local-models';
import { GROQ_MODELS, OPENROUTER_MODELS } from '../../../server/src/services/reasoning-models';

const label = (value: string) => value.replace(/-/g, ' ').replace(/^./, char => char.toUpperCase());
const fieldClass = 'mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white';

export function AutoEditPanel({ scriptId, value, plan, disabled, onChange, onBusyChange }: { scriptId: string; value: EditingSettings; plan?: ScenePlan; disabled: boolean; onChange: (settings: EditingSettings) => Promise<void>; onBusyChange: (busy: boolean) => void }) {
  const { fetch } = useWorkspaceApi();
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState(LOCAL_MODELS[0].id);
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function save(settings: EditingSettings) {
    setBusy(true); setError('');
    try { await onChange(settings); }
    catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : 'Could not save settings.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function aiEdit() {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/llm/editing-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scriptId, editing: value, model }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'AI editing failed.');
      if (!mounted.current) return;
      await onChange(result.editing);
      if (mounted.current) { setMessage(result.summary); setDetails(true); }
    } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : 'AI editing failed.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  const [details, setDetails] = useState(false);
  const decisions = useMemo(() => plan ? autoEditPlan(plan, value) : [], [plan, value]);
  const update = (patch: Partial<EditingSettings>) => void save({ ...value, ...patch });
  const toggle = (key: keyof EditingSettings, name: string, hint: string) => <label key={key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 bg-bg/30 p-3">
    <input type="checkbox" checked={Boolean(value[key])} onChange={event => update({ [key]: event.target.checked })} className="mt-1 accent-blue-500" />
    <span><span className="block text-sm text-gray-100">{name}</span><span className="mt-0.5 block text-xs leading-relaxed text-gray-400">{hint}</span></span>
  </label>;
  return <section className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/10 via-surface to-surface p-5">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-lg font-semibold text-white"><Sparkles className="h-5 w-5 text-blue-400" />Automatic editing</h2><p className="mt-1 max-w-3xl text-sm text-gray-400">A coordinated look across your whole story. Motion, transitions, captions and audio finishing follow one editing plan.</p></div>
      <label className="flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm text-white"><input aria-label="Enable automatic editing" type="checkbox" disabled={disabled || busy} checked={value.enabled} onChange={event => update({ enabled: event.target.checked })} />{value.enabled ? 'Enabled' : 'Manual controls'}</label>
    </div>
    <div className="mb-4 space-y-2">
      <label className="block max-w-md text-xs text-gray-300">Editing AI
        <select aria-label="Editing AI model" className={fieldClass} value={model} disabled={disabled || busy} onChange={event => { setModel(event.target.value); setError(''); }}>
          {[['Local · Ollama', LOCAL_MODELS.filter(item => !item.thinking)], ['Groq', GROQ_MODELS], ['OpenRouter', OPENROUTER_MODELS], ['Gemini', GEMINI_MODELS]].map(([name, models]) => <optgroup key={name as string} label={name as string}>{(models as typeof GEMINI_MODELS).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>)}
        </select>
      </label>
      <button disabled={disabled || busy || !plan} onClick={() => void aiEdit()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Updating editing plan…' : 'Create AI Editing Plan'}</button>
      <p className="text-xs text-gray-400">Your selected AI uses narration and scene descriptions to choose gentle camera moves and transitions. This replaces scene overrides; review the plan, then generate the video.</p>
      <p className="text-xs text-gray-400">Local editing uses structured Fast mode and processes four scenes at a time; a long story can take several minutes. If AI cannot finish, your selected preset provides a complete editing plan.</p>
      {message && <p role="status" className="text-sm text-blue-200">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </div>
    <fieldset disabled={disabled || busy}>
      <div className="grid gap-3 md:grid-cols-3">
        {([
          ['clean', 'Clean Studio', 'Gentle camera moves, natural color and quiet transitions. A clear, restrained default.'],
          ['cinematic', 'Cinematic Story', 'Warm color, longer dissolves, soft vignette and warm caption accents.'],
          ['documentary', 'Documentary', 'Mostly clean cuts, readable boxed captions and chapter separation.'],
        ] as const).map(([preset, title, description]) => <button key={preset} aria-label={`Apply ${title}`} onClick={() => void save(editingPreset(preset))} className={`rounded-xl border p-4 text-left transition-colors ${value.enabled && value.preset === preset ? 'border-blue-400 bg-blue-500/15' : 'border-border bg-bg/30 hover:border-gray-500'}`}>
          <span className="flex items-center justify-between font-semibold text-white">{title}{value.enabled && value.preset === preset && <Check className="h-4 w-4 text-blue-300" />}</span><span className="mt-2 block text-xs leading-relaxed text-gray-400">{description}</span>
        </button>)}
      </div>
    </fieldset>
    {value.enabled && <fieldset disabled={disabled || busy} className="mt-4 space-y-4">
      <div className="flex flex-wrap gap-2 text-xs text-blue-200"><span className="rounded bg-blue-500/10 px-2 py-1">{decisions.length} planned scenes</span><span className="rounded bg-blue-500/10 px-2 py-1">{decisions.filter(scene => scene.transition !== 'cut').length} soft transitions</span><span className="rounded bg-blue-500/10 px-2 py-1">Timing follows narration</span></div>
      <p className="text-xs leading-relaxed text-gray-400">Apply a preset to save it, then render to see the finished effects. Timeline playback shows source media and narration. Dissolves blend the previous final frame into the next scene without changing scene lengths.</p>
      <button className="flex items-center gap-2 text-sm text-blue-300" onClick={() => setDetails(!details)}><ChevronDown className={`h-4 w-4 ${details ? 'rotate-180' : ''}`} />{details ? 'Hide editing controls' : 'Customize editing & scene plan'}</button>
      {details && <>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-xs text-gray-300">Image motion<select aria-label="Automatic image motion" className={fieldClass} value={value.motion} onChange={event => update({ motion: event.target.value as EditingSettings['motion'] })}><option value="gentle">Gentle · up to 4% movement</option><option value="balanced">Balanced · up to 8% movement</option><option value="off">Static images</option></select></label>
          <label className="text-xs text-gray-300">Transitions<select aria-label="Automatic transitions" className={fieldClass} value={value.transitions} onChange={event => update({ transitions: event.target.value as EditingSettings['transitions'] })}>{EDIT_TRANSITIONS.map(mode => <option key={mode} value={mode}>{mode === 'auto' ? 'Follow story & chapters' : label(mode)}</option>)}</select></label>
          <label className="text-xs text-gray-300">Transition length · {value.transitionSeconds.toFixed(2)}s<input aria-label="Automatic transition length" className="mt-4 w-full" type="range" min="0.15" max="0.8" step="0.05" value={value.transitionSeconds} onChange={event => update({ transitionSeconds: Number(event.target.value) })} /></label>
          <label className="text-xs text-gray-300">Frame fitting<select aria-label="Automatic framing" className={fieldClass} value={value.framing} onChange={event => update({ framing: event.target.value as EditingSettings['framing'] })}><option value="contain">Fit full image / video</option><option value="cover">Fill frame · crop edges</option></select></label>
          <label className="text-xs text-gray-300">Color look<select aria-label="Automatic color look" className={fieldClass} value={value.colorLook} onChange={event => update({ colorLook: event.target.value as EditingSettings['colorLook'] })}>{['clean', 'warm-vintage', 'teal-orange', 'dramatic-noir', 'none'].map(look => <option key={look} value={look}>{label(look)}</option>)}</select></label>
          <label className="text-xs text-gray-300">Render quality<select aria-label="Automatic render quality" className={fieldClass} value={value.quality} onChange={event => update({ quality: event.target.value as EditingSettings['quality'] })}><option value="high">High quality · larger files</option><option value="standard">Standard · smaller files</option></select></label>
          <label className="text-xs text-gray-300">Caption appearance<select aria-label="Automatic caption style" className={fieldClass} value={value.captionStyle} onChange={event => update({ captionStyle: event.target.value as EditingSettings['captionStyle'] })}><option value="minimal">Minimal white</option><option value="boxed">Dark backing</option><option value="gold">Warm gold</option></select></label>
          <label className="text-xs text-gray-300">Words per caption<input aria-label="Words per caption" type="number" min="4" max="12" className={fieldClass} value={value.captionWords} onChange={event => { const number = Number(event.target.value); if (Number.isInteger(number) && number >= 4 && number <= 12) update({ captionWords: number }); }} /></label>
        </div>
        <p className="text-xs text-gray-400">Caption phrases use estimated timing within each narration scene; they are not word-aligned subtitles. Imported video keeps its original camera movement.</p>
        <div className="grid gap-3 md:grid-cols-3">
          {toggle('captions', 'Phrase captions', 'Short readable phrases with safe margins and soft fades.')}
          {toggle('bookendFades', 'Opening & closing fades', 'Ease in and out inside the existing video duration.')}
          {toggle('voicePolish', 'Voice polish & mastering', 'Gentle filtering, compression, loudness normalization and peak limiting.')}
          {toggle('musicDucking', 'Music follows speech', 'Lower music while narration is audible, recover during pauses.')}
          {toggle('chapterSound', 'Chapter sound accents', 'A quiet synthesized tone only at chapter changes.')}
          {toggle('vignette', 'Soft vignette', 'Subtle edge shading to keep attention near the subject.')}
          {toggle('grain', 'Fine film grain', 'A light texture. Off by default for a clean finish.')}
          {toggle('sharpen', 'Light sharpening', 'A small detail boost; leave off for already sharp footage.')}
          {toggle('letterbox', 'Cinema bars', 'Adds slim black bars; masks the top and bottom edges.')}
        </div>
        {plan && <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer text-sm text-white">Scene-by-scene editing plan · overrides</summary>
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{decisions.map((decision, index) => <div key={decision.sceneId} className="grid items-center gap-2 rounded-lg bg-bg/50 p-3 md:grid-cols-3">
            <p className="text-xs text-gray-300"><strong>{String(index + 1).padStart(3, '0')} · {plan.scenes[index].chapter}</strong><span className="mt-1 block text-gray-500">{decision.motion === 'source' ? 'Original video motion' : 'Image'}</span></p>
            <label className="text-xs text-gray-400">Motion · {label(decision.motion)}<select aria-label={`Motion for ${decision.sceneId}`} disabled={decision.motion === 'source'} className={fieldClass} value={value.overrides[decision.sceneId]?.motion || 'auto'} onChange={event => update({ overrides: { ...value.overrides, [decision.sceneId]: { ...value.overrides[decision.sceneId], motion: event.target.value as typeof EDIT_MOTIONS[number] } } })}>{EDIT_MOTIONS.map(motion => <option key={motion} value={motion}>{label(motion)}</option>)}</select></label>
            <label className="text-xs text-gray-400">Incoming · {label(decision.transition)}<select aria-label={`Transition for ${decision.sceneId}`} disabled={index === 0} className={fieldClass} value={value.overrides[decision.sceneId]?.transition || 'auto'} onChange={event => update({ overrides: { ...value.overrides, [decision.sceneId]: { ...value.overrides[decision.sceneId], transition: event.target.value as typeof EDIT_TRANSITIONS[number] } } })}>{EDIT_TRANSITIONS.map(mode => <option key={mode} value={mode}>{label(mode)}</option>)}</select></label>
          </div>)}</div>
        </details>}
      </>}
    </fieldset>}
  </section>;
}
