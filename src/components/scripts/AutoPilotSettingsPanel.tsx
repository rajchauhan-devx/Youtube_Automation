import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Play, Square, Loader2 } from 'lucide-react';
import { useWorkspaceApi } from '../../services/workspaceApi';
import { preferredVoice, rememberVoice, VOICES_CHANGED, type SavedVoice } from '../../services/voiceLibrary';
import { narrationOptions, type AutoPilotSettings } from '../../../server/src/services/autopilot-settings';
import { editingPreset, type EditingSettings } from '../../../server/src/services/auto-edit';
import { GEMINI_MODELS } from '../../data';

const selectClass = 'studio-input mt-1 w-full';
const labelize = (value: string) => value.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
function Group({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return <details open={open || undefined} className="rounded-xl border border-borderSoft bg-bg/30">
    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-white">{title}</summary>
    <div className="space-y-4 border-t border-borderSoft p-4">{children}</div>
  </details>;
}
function Select({ label, value, choices, onChange, disabled }: { label: string; value: string | number; choices: readonly (readonly [string | number, string])[]; onChange: (value: string) => void; disabled?: boolean }) {
  return <label className="block min-w-0 text-xs text-muted">{label}<select aria-label={label} className={selectClass} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>{choices.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
}
function NumberInput({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number }) {
  return <label className="block min-w-0 text-xs text-muted">{label}<input aria-label={label} className={selectClass} type="number" min={min} max={max} step={step} value={value} onChange={e => { if (e.target.value !== '') onChange(Number(e.target.value)); }} /></label>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-2 text-sm text-gray-200"><input aria-label={label} type="checkbox" className="accent-blue-500" checked={checked} onChange={e => onChange(e.target.checked)} />{label}</label>;
}

export function AutoPilotSettingsPanel({ value, onChange, onVoiceReady }: { value: AutoPilotSettings; onChange: (settings: AutoPilotSettings) => void; onVoiceReady: (ready: boolean) => void }) {
  const { fetch, account, profile } = useWorkspaceApi();
  const [providers, setProviders] = useState<{ id: string; name: string; configured: boolean }[]>([]);
  const [defaultProvider, setDefaultProvider] = useState('chatterbox');
  const [voices, setVoices] = useState<SavedVoice[]>([]);
  const [voiceLoading, setVoiceLoading] = useState(true);
  const [voiceError, setVoiceError] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | null>(null);
  const previewAbort = useRef<AbortController | null>(null);
  const latest = useRef({ value, onChange }); latest.current = { value, onChange };
  const effectiveProvider = value.voice.provider === 'default' ? defaultProvider : value.voice.provider;
  const language = value.voice.language === 'hi' ? 'hi' : 'en';
  const patch = <K extends keyof AutoPilotSettings>(key: K, changes: Partial<AutoPilotSettings[K]>) => onChange({ ...value, [key]: { ...(value[key] as object), ...changes } });
  const edit = (changes: Partial<EditingSettings>) => patch('editing', { settings: { ...value.editing.settings, ...changes } });
  function stopPreview() {
    previewAbort.current?.abort(); previewAbort.current = null;
    audio.current?.pause(); audio.current = null;
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = null; setPreviewing(false); setPreviewLoading(false);
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/tts/providers', { signal: controller.signal }).then(async r => { if (!r.ok) throw new Error('Could not load voice engines.'); return r.json(); }).then(data => { if (!controller.signal.aborted) { setProviders(data.providers || []); setDefaultProvider(data.defaultProvider || 'chatterbox'); } }).catch(error => { if (!controller.signal.aborted) setVoiceError(error.message); });
    return () => controller.abort();
  }, [fetch, reload]);
  useEffect(() => {
    const controller = new AbortController();
    stopPreview(); setVoiceLoading(true); setVoiceError(''); setVoices([]);
    fetch(`/api/tts/voices?language=${language}&provider=${value.voice.provider}`, { signal: controller.signal }).then(async r => { const data = await r.json(); if (!r.ok || !Array.isArray(data.voices)) throw new Error(data.error || 'Could not load voices.'); return data; }).then(data => {
      if (controller.signal.aborted) return;
      const list = data.voices as SavedVoice[];
      setVoices(list);
      const current = latest.current.value;
      const preferred = preferredVoice(account.id, language, data.provider || '');
      const selected = list.find(v => v.id === current.voice.voiceId) || list.find(v => v.id === preferred) || list.find(v => v.source === 'clone') || list[0];
      if (selected && selected.id !== current.voice.voiceId) latest.current.onChange({ ...current, voice: { ...current.voice, voiceId: selected.id } });
    }).catch(error => { if (!controller.signal.aborted) setVoiceError(error.message); }).finally(() => { if (!controller.signal.aborted) setVoiceLoading(false); });
    const refresh = () => setReload(n => n + 1);
    window.addEventListener(VOICES_CHANGED, refresh);
    return () => { controller.abort(); stopPreview(); window.removeEventListener(VOICES_CHANGED, refresh); };
  }, [fetch, account.id, value.voice.provider, language, reload]);
  const configured = providers.find(p => p.id === effectiveProvider)?.configured !== false;
  const voiceReady = !voiceLoading && configured && voices.some(v => v.id === value.voice.voiceId);
  useEffect(() => { onVoiceReady(voiceReady && !previewLoading); }, [voiceReady, previewLoading, onVoiceReady]);
  async function preview() {
    if (previewing || previewLoading) { stopPreview(); return; }
    stopPreview(); const controller = new AbortController(); previewAbort.current = controller; setPreviewLoading(true); setVoiceError('');
    try {
      const response = await fetch('/api/tts/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(narrationOptions(value, language)), signal: controller.signal });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Voice preview failed.'); }
      const blob = await response.blob(); if (controller.signal.aborted) return;
      audioUrl.current = URL.createObjectURL(blob); audio.current = new Audio(audioUrl.current);
      audio.current.onended = stopPreview; await audio.current.play(); setPreviewing(true);
    } catch (error) { if (!controller.signal.aborted) setVoiceError(error instanceof Error ? error.message : 'Voice preview failed.'); }
    finally { if (!controller.signal.aborted) setPreviewLoading(false); }
  }
  const e = value.editing.settings;
  const providerName = providers.find(p => p.id === effectiveProvider)?.name || effectiveProvider;
  return <div className="space-y-3" aria-label="Auto-Pilot production settings">
    <Group title="Media generation" open>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Image provider" value={value.media.imageProvider} choices={[["google", 'Google Cloud'], ['cloudflare', 'Cloudflare'], ['local', 'Local image model']]} onChange={imageProvider => patch('media', { imageProvider: imageProvider as AutoPilotSettings['media']['imageProvider'] })} />
        <Select label="Image quality" value={value.media.imageQuality} choices={['fast', 'standard', 'high'].map(v => [v, labelize(v)] as const)} onChange={imageQuality => patch('media', { imageQuality: imageQuality as AutoPilotSettings['media']['imageQuality'] })} />
        <Select label="Image seed mode" value={value.media.seedMode} choices={[["random", 'Random'], ['fixed', 'Fixed seed']]} onChange={seedMode => patch('media', { seedMode: seedMode as 'random' | 'fixed' })} />
        {value.media.seedMode === 'fixed' && <NumberInput label="Image seed" value={value.media.seed} min={0} max={2147483647} onChange={seed => patch('media', { seed })} />}
      </div>
      <Toggle label="Generate video scenes with Google Flow" checked={value.media.flowEnabled} onChange={flowEnabled => patch('media', { flowEnabled })} />
      {value.media.flowEnabled && <>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Flow video quality" value={value.media.flowResolution} choices={[["720p", '720p · Fast'], ['1080p', '1080p · Upscaled']]} onChange={flowResolution => patch('media', { flowResolution: flowResolution as '720p' | '1080p' })} />
          <Select label="Flow clip duration" value={value.media.flowDuration} choices={[[4, '4 seconds'], [6, '6 seconds'], [8, '8 seconds']]} onChange={duration => patch('media', { flowDuration: Number(duration) as 4 | 6 | 8 })} />
        </div>
        <p className="text-xs text-muted">Uses Veo 3.1 Fast for scenes marked as video by the script. An image-only template stays image-only. Flow uses your connected account’s credits.</p>
        <Toggle label="Use still images if Flow is unavailable" checked={value.media.allowImageFallback} onChange={allowImageFallback => patch('media', { allowImageFallback })} />
      </>}
      <p className="text-xs text-muted">Final MP4: {profile === 'shorts' ? '1080 × 1920 · Portrait' : '1920 × 1080 · Landscape'}. Image provider fallback follows the Generation tab’s configured availability.</p>
    </Group>
    <Group title="Voice model & narrator" open>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Voice engine" value={value.voice.provider} choices={[["default", `Configured default · ${providers.find(p => p.id === defaultProvider)?.name || defaultProvider}`], ...providers.map(p => [p.id, `${p.name}${p.configured ? '' : ' · API key required'}`] as const)]} onChange={provider => patch('voice', { provider: provider as AutoPilotSettings['voice']['provider'], voiceId: '' })} />
        <Select label="Voice language" value={value.voice.language} choices={[["auto", 'Auto · Follow the script'], ['en', 'English'], ['hi', 'Hindi / Hinglish']]} onChange={language => patch('voice', { language: language as AutoPilotSettings['voice']['language'], voiceId: '' })} />
      </div>
      <Select label="Narration voice" value={value.voice.voiceId} disabled={voiceLoading} choices={voices.length ? voices.map(v => [v.id, `${v.name}${v.source === 'clone' ? ' · Saved profile voice' : ''}`]) : [['', voiceLoading ? 'Loading voices…' : 'No voices available']]} onChange={voiceId => { stopPreview(); patch('voice', { voiceId }); rememberVoice(account.id, language, providerName, voiceId); }} />
      <div className="flex flex-wrap items-center gap-3"><button type="button" className="studio-btn-ghost text-xs" disabled={!voiceReady} onClick={() => void preview()}>{previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : previewing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}{previewLoading ? 'Cancel preview' : previewing ? 'Stop preview' : 'Preview voice'}</button><button type="button" className="text-xs text-accent underline" onClick={() => setReload(n => n + 1)}>Refresh voices</button></div>
      {!configured && <p role="alert" className="text-xs text-amber-300">Add this engine’s API key in Setup before running.</p>}
      {voiceError && <p role="alert" className="text-xs text-red-300">{voiceError}</p>}
      {value.voice.language === 'auto' && <p className="text-xs text-muted">The matching Hindi voice library is resolved before synthesis if the script is in Hindi. Choose Hindi explicitly to select a particular Hindi voice.</p>}
      <details><summary className="cursor-pointer text-xs text-accent">Voice tuning</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
        {effectiveProvider === 'chatterbox' && <><NumberInput label="Expression" min={0.25} max={1.2} step={0.05} value={value.voice.exaggeration} onChange={exaggeration => patch('voice', { exaggeration })} /><NumberInput label="Pace guidance" min={0.2} max={0.8} step={0.01} value={value.voice.cfgWeight} onChange={cfgWeight => patch('voice', { cfgWeight })} /><NumberInput label="Voice temperature" min={0.4} max={1.2} step={0.01} value={value.voice.temperature} onChange={temperature => patch('voice', { temperature })} /><NumberInput label="Voice seed" min={0} max={2147483647} value={value.voice.seed} onChange={seed => patch('voice', { seed })} /></>}
        {effectiveProvider === 'edge' && <><NumberInput label="Speech rate (%)" min={-25} max={35} value={value.voice.rate} onChange={rate => patch('voice', { rate })} /><NumberInput label="Pitch (Hz)" min={-12} max={12} value={value.voice.pitch} onChange={pitch => patch('voice', { pitch })} /></>}
        {effectiveProvider === 'openrouter' && <NumberInput label="Speech speed" min={0.75} max={1.5} step={0.05} value={value.voice.speed} onChange={speed => patch('voice', { speed })} />}
        {effectiveProvider === 'omni' && <p className="text-xs text-muted">OmniVoice uses the selected voice and the configured local model’s synthesis defaults.</p>}
      </div></details>
    </Group>
    <Group title="Captions & motion graphics" open>
      <Select label="Captions" value={value.captions} choices={[["off", 'Off'], ['plain', 'Standard captions'], ['motion', 'Motion captions']]} onChange={captions => onChange({ ...value, captions: captions as AutoPilotSettings['captions'] })} />
      {value.captions === 'motion' && <p className="text-xs text-muted">Animated phrases follow measured scene audio; word timing within each scene is estimated.</p>}
      <Toggle label="Add optional graphics" checked={value.graphics.enabled} onChange={enabled => patch('graphics', { enabled })} />
      <p className="text-xs text-muted">Off keeps your scene footage clean. When enabled, graphics are added only where useful; skipped graphics never block the video.</p>
      {value.graphics.enabled && <>
        <Select label="Graphics type" value={value.graphics.mode} choices={[["images", 'Evidence images & explanatory diagrams'], ['callouts', 'Titles, numbers & callouts']]} onChange={mode => patch('graphics', { mode: mode as AutoPilotSettings['graphics']['mode'], style: mode === 'callouts' ? 'Use restrained titles, statistics and source-grounded callouts that support the spoken story.' : 'Keep footage clean. Use an occasional evidence image or explanatory diagram only where helpful. No decorative numbers or oversized text.' })} />
        <div className="grid gap-3 sm:grid-cols-2"><Select label="Graphics density" value={value.graphics.density} choices={[["subtle", 'Subtle'], ['balanced', 'Balanced'], ['expressive', 'Expressive']]} onChange={density => patch('graphics', { density: density as AutoPilotSettings['graphics']['density'] })} /><Select label="Graphics treatment" value={value.graphics.treatment} choices={[["auto", 'AI chooses'], ['cinematic', 'Cinematic image inserts'], ['archival', 'Archival collage'], ['map', 'Maps · Requires source map']]} onChange={treatment => patch('graphics', { treatment: treatment as AutoPilotSettings['graphics']['treatment'] })} /></div>
        <Select label="Motion graphics AI" value={value.graphics.model} choices={[["", 'Configured Gemini vision model'], ...GEMINI_MODELS.map(m => [m.id, m.name] as const)]} onChange={model => patch('graphics', { model })} />
        <label className="block text-xs text-muted">Visual direction<textarea aria-label="Visual direction" className={`${selectClass} h-20`} maxLength={2000} value={value.graphics.style} onChange={event => patch('graphics', { style: event.target.value })} /></label>
        <p className="text-xs text-muted">Directed sequences work with stills and video. Selected beats can generate separate illustration assets; rendered motion is checked before export.</p>
      </>}
    </Group>
    <Group title="Editing & audio finishing">
      <Select label="Editing mode" value={value.editing.mode} choices={[["story", 'AI story edit'], ['custom', 'Custom editing preset'], ['off', 'No editing effects']]} onChange={mode => patch('editing', { mode: mode as AutoPilotSettings['editing']['mode'] })} />
      {value.editing.mode === 'custom' && <>
        <Select label="Editing preset" value={e.preset} choices={[["clean", 'Clean Studio'], ['cinematic', 'Cinematic Story'], ['documentary', 'Documentary']]} onChange={preset => patch('editing', { settings: { ...editingPreset(preset as EditingSettings['preset']), captions: value.captions === 'plain' } })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Image motion" value={e.motion} choices={[["gentle", 'Gentle'], ['balanced', 'Balanced'], ['off', 'Static']]} onChange={motion => edit({ motion: motion as EditingSettings['motion'] })} />
          <Select label="Transitions" value={e.transitions} choices={['auto', 'cut', 'dissolve', 'dip-black'].map(v => [v, labelize(v)] as const)} onChange={transitions => edit({ transitions: transitions as EditingSettings['transitions'] })} />
          <NumberInput label="Transition seconds" value={e.transitionSeconds} min={0.15} max={0.8} step={0.05} onChange={transitionSeconds => edit({ transitionSeconds })} />
          <Select label="Framing" value={e.framing} choices={[["contain", 'Fit full image'], ['cover', 'Fill frame']]} onChange={framing => edit({ framing: framing as EditingSettings['framing'] })} />
          <Select label="Color look" value={e.colorLook} choices={['none', 'clean', 'warm-vintage', 'teal-orange', 'dramatic-noir'].map(v => [v, labelize(v)] as const)} onChange={colorLook => edit({ colorLook: colorLook as EditingSettings['colorLook'] })} />
          <Select label="Render quality" value={e.quality} choices={[["standard", 'Standard'], ['high', 'High']]} onChange={quality => edit({ quality: quality as EditingSettings['quality'] })} />
          {value.captions === 'plain' && <><Select label="Caption style" value={e.captionStyle} choices={['minimal', 'boxed', 'gold'].map(v => [v, labelize(v)] as const)} onChange={captionStyle => edit({ captionStyle: captionStyle as EditingSettings['captionStyle'] })} /><NumberInput label="Words per caption" value={e.captionWords} min={4} max={12} onChange={captionWords => edit({ captionWords })} /></>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">{([['bookendFades', 'Opening & closing fades'], ['voicePolish', 'Voice polish'], ['musicDucking', 'Duck music under speech'], ['chapterSound', 'Chapter sound accents'], ['vignette', 'Soft vignette'], ['grain', 'Film grain'], ['sharpen', 'Light sharpening'], ['letterbox', 'Cinema bars']] as const).map(([key, label]) => <Toggle key={key} label={label} checked={e[key]} onChange={checked => edit({ [key]: checked })} />)}</div>
      </>}
      <div className="grid gap-3 sm:grid-cols-2"><Select label="Background music" value={value.audio.music} choices={[["auto", 'AI chooses for the story'], ...['none', 'calm', 'cinematic', 'epic', 'upbeat'].map(v => [v, labelize(v)] as const)]} onChange={music => patch('audio', { music: music as AutoPilotSettings['audio']['music'] })} /><NumberInput label="Music volume" value={value.audio.musicVolume} min={0} max={1} step={0.05} onChange={musicVolume => patch('audio', { musicVolume })} /><NumberInput label="Narration volume" value={value.audio.voiceVolume} min={0} max={2} step={0.05} onChange={voiceVolume => patch('audio', { voiceVolume })} /></div>
    </Group>
    <Group title="YouTube export" open>
      <Select label="Publishing" value={value.youtube.publishMode} choices={[["now", 'Upload after final review'], ['schedule', 'Schedule public release']]} onChange={publishMode => patch('youtube', { publishMode: publishMode as 'now' | 'schedule' })} />
      {value.youtube.publishMode === 'schedule' ? <label className="block text-xs text-muted">Publish at (your local time)<input aria-label="Scheduled publication time" type="datetime-local" className={selectClass} value={value.youtube.scheduledPublishAt && Number.isFinite(Date.parse(value.youtube.scheduledPublishAt)) ? new Date(Date.parse(value.youtube.scheduledPublishAt) - new Date(value.youtube.scheduledPublishAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''} onChange={event => patch('youtube', { scheduledPublishAt: event.target.value ? new Date(event.target.value).toISOString() : '' })} /><span className="mt-1 block">Uploaded privately, then published at this time. Allow enough time for generation and review.</span></label> : <Select label="YouTube visibility" value={value.youtube.privacyStatus} choices={[["private", 'Private'], ['unlisted', 'Unlisted'], ['public', 'Public']]} onChange={privacyStatus => patch('youtube', { privacyStatus: privacyStatus as AutoPilotSettings['youtube']['privacyStatus'] })} />}
      <p className="text-xs text-muted">Uploads after final review passes. Topic history is recorded only after a successful upload.</p>
    </Group>
  </div>;
}
