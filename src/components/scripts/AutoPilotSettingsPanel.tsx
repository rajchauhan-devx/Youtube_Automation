import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { Play, Square, Loader2, UserCheck, RefreshCw, Rocket, Calendar, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { useWorkspaceApi } from '../../services/workspaceApi';
import { preferredVoice, rememberVoice, type SavedVoice } from '../../services/voiceLibrary';
import { narrationOptions, type AutoPilotSettings } from '../../../server/src/services/autopilot-settings';
import { defaultPresenter, type PresenterSettings } from '../../../server/src/services/presenter-settings';
import { PresenterPreview, type PresenterAvatar } from '../editor/PresenterPanel';
import { editingPreset, type EditingSettings } from '../../../server/src/services/auto-edit';
import { GEMINI_MODELS } from '../../data';

const selectClass = 'studio-input mt-1 w-full';
const labelize = (value: string) => value.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());

function toLocalDateTimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultScheduleDate(): Date {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setHours(18, 0, 0, 0);
  if (d.getTime() <= Date.now() + 30 * 60 * 1000) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function getSchedulePresetDate(hoursFromNow?: number, targetHour?: number, daysOffset = 1): Date {
  const d = new Date();
  if (typeof hoursFromNow === 'number') {
    d.setTime(Date.now() + hoursFromNow * 60 * 60 * 1000);
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  } else {
    d.setDate(d.getDate() + daysOffset);
    d.setHours(targetHour ?? 18, 0, 0, 0);
  }
  return d;
}

function formatScheduledDisplay(val: string): string {
  if (!val) return '';
  const parsed = new Date(val);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
function Group({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open || undefined} className="rounded-xl border border-borderSoft bg-bg/30">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-white">{title}</summary>
      <div className="space-y-4 border-t border-borderSoft p-4">{children}</div>
    </details>
  );
}
function Select({ label, value, choices, onChange, disabled }: { label: string; value: string | number; choices: readonly (readonly [string | number, string])[]; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <label className="block min-w-0 text-xs text-muted">
      {label}
      <select aria-label={label} className={selectClass} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
        {choices.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
function NumberInput({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number }) {
  return (
    <label className="block min-w-0 text-xs text-muted">
      {label}
      <input
        aria-label={label}
        className={selectClass}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => {
          if (e.target.value !== '') onChange(Number(e.target.value));
        }}
      />
    </label>
  );
}
function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-2 text-sm text-gray-200 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <input aria-label={label} type="checkbox" className="accent-blue-500" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function AutoPilotSettingsPanel({
  value,
  onChange,
  onVoiceReady,
  scriptExcerpt = '',
}: {
  scriptExcerpt?: string;
  value: AutoPilotSettings;
  onChange: (settings: AutoPilotSettings) => void;
  onVoiceReady: (ready: boolean) => void;
}) {
  const { fetch, account, profile } = useWorkspaceApi();
  const [providers, setProviders] = useState<{ id: string; name: string; configured: boolean }[]>([]);
  const [defaultProvider, setDefaultProvider] = useState('google');
  const [voices, setVoices] = useState<SavedVoice[]>([]);
  const [voiceLoading, setVoiceLoading] = useState(true);
  const [voiceError, setVoiceError] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [previewSrc, setPreviewSrc] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [reload, setReload] = useState(0);

  // Presenter / MuseTalk state
  const [avatars, setAvatars] = useState<PresenterAvatar[]>([]);
  const [presenterInstalled, setPresenterInstalled] = useState(true);
  const [presenterMessage, setPresenterMessage] = useState('Checking presenter engine...');
  const [presenterError, setPresenterError] = useState('');
  const [refreshingAvatars, setRefreshingAvatars] = useState(false);

  const [scheduleInputVal, setScheduleInputVal] = useState<string>(() => {
    if (value.youtube.scheduledPublishAt && Number.isFinite(Date.parse(value.youtube.scheduledPublishAt))) {
      return toLocalDateTimeInput(new Date(value.youtube.scheduledPublishAt));
    }
    return toLocalDateTimeInput(defaultScheduleDate());
  });

  useEffect(() => {
    if (value.youtube.scheduledPublishAt && Number.isFinite(Date.parse(value.youtube.scheduledPublishAt))) {
      setScheduleInputVal(toLocalDateTimeInput(new Date(value.youtube.scheduledPublishAt)));
    }
  }, [value.youtube.scheduledPublishAt]);

  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | null>(null);
  const previewAbort = useRef<AbortController | null>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const effectiveProvider = value.voice.provider === 'default' ? defaultProvider : value.voice.provider;
  const language = value.voice.language === 'hi' ? 'hi' : 'en';

  const patch = <K extends keyof AutoPilotSettings>(key: K, changes: Partial<AutoPilotSettings[K]>) =>
    onChange({ ...value, [key]: { ...(value[key] as object), ...changes } });

  const edit = (changes: Partial<EditingSettings>) =>
    patch('editing', { settings: { ...value.editing.settings, ...changes } });

  const presenterValue = value.presenter || defaultPresenter();
  const patchPresenter = (changes: Partial<PresenterSettings>) => {
    const current = value.presenter || defaultPresenter();
    onChange({ ...value, presenter: { ...current, ...changes } });
  };

  const refreshAvatars = useCallback(async () => {
    setRefreshingAvatars(true);
    try {
      const response = await fetch('/api/presenter/status');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Cannot check presenter engine');
      const list = (data.avatars || []) as PresenterAvatar[];
      setAvatars(list);
      setPresenterInstalled(Boolean(data.installed));
      setPresenterMessage(data.message || '');
      setPresenterError('');
      const current = latest.current.value.presenter || defaultPresenter();
      if (list.length > 0 && (!current.avatarId || !list.some(a => a.id === current.avatarId))) {
        latest.current.onChange({
          ...latest.current.value,
          presenter: {
            ...current,
            avatarId: list[0].id,
            style: list[0].hasTransparency ? 'transparent' : current.style === 'transparent' ? 'card' : current.style,
          },
        });
      }
    } catch {
      setPresenterError('Cannot reach the presenter service. Restart the application server and refresh.');
    } finally {
      setRefreshingAvatars(false);
    }
  }, [fetch]);

  useEffect(() => {
    void refreshAvatars();
  }, [refreshAvatars]);

  function stopPreview() {
    previewAbort.current?.abort();
    previewAbort.current = null;
    audio.current?.pause();
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = null;
    setPreviewSrc('');
    setPreviewing(false);
    setPreviewLoading(false);
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/tts/providers', { signal: controller.signal })
      .then(async r => {
        if (!r.ok) throw new Error('Could not load voice engines.');
        return r.json();
      })
      .then(data => {
        if (!controller.signal.aborted) {
          setProviders(data.providers || []);
          setDefaultProvider(data.defaultProvider || 'google');
        }
      })
      .catch(error => {
        if (!controller.signal.aborted) setVoiceError(error.message);
      });
    return () => controller.abort();
  }, [fetch, reload]);

  useEffect(() => {
    const controller = new AbortController();
    stopPreview();
    setVoiceLoading(true);
    setVoiceError('');
    setVoices([]);
    fetch(`/api/tts/voices?language=${language}&provider=${value.voice.provider}`, { signal: controller.signal })
      .then(async r => {
        const data = await r.json();
        if (!r.ok || !Array.isArray(data.voices)) throw new Error(data.error || 'Could not load voices.');
        return data;
      })
      .then(data => {
        if (controller.signal.aborted) return;
        const list = data.voices as SavedVoice[];
        setVoices(list);
        const current = latest.current.value;
        const preferred = preferredVoice(account.id, language, data.provider || '');
        const selected = list.find(v => v.id === current.voice.voiceId) || list.find(v => v.id === preferred) || list[0];
        if (selected && selected.id !== current.voice.voiceId)
          latest.current.onChange({ ...current, voice: { ...current.voice, voiceId: selected.id } });
      })
      .catch(error => {
        if (!controller.signal.aborted) setVoiceError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setVoiceLoading(false);
      });
    return () => {
      controller.abort();
      stopPreview();
    };
  }, [fetch, account.id, value.voice.provider, language, reload, defaultProvider]);

  useEffect(() => {
    stopPreview();
  }, [value.voice.voiceId, value.voice.speed, value.voice.rate, value.voice.pitch]);

  const configured = providers.find(p => p.id === effectiveProvider)?.configured !== false;
  const voiceReady = !voiceLoading && configured && voices.some(v => v.id === value.voice.voiceId);
  useEffect(() => {
    onVoiceReady(voiceReady && !previewLoading);
  }, [voiceReady, previewLoading, onVoiceReady]);

  async function preview() {
    if (previewing || previewLoading) {
      stopPreview();
      return;
    }
    stopPreview();
    const controller = new AbortController();
    previewAbort.current = controller;
    setPreviewLoading(true);
    setVoiceError('');
    try {
      const response = await fetch('/api/tts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...narrationOptions(value, language), text: previewText.trim() || undefined }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Voice preview failed.');
      }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      audioUrl.current = URL.createObjectURL(blob);
      setPreviewSrc(audioUrl.current);
      setPreviewing(true);
    } catch (error) {
      if (!controller.signal.aborted) setVoiceError(error instanceof Error ? error.message : 'Voice preview failed.');
    } finally {
      if (!controller.signal.aborted) setPreviewLoading(false);
    }
  }

  const e = value.editing.settings;
  const selectedAvatar = avatars.find(a => a.id === presenterValue.avatarId) || avatars[0];
  const tight = selectedAvatar?.tightCrop || (selectedAvatar?.hasTransparency ? { x: 25.6, y: 0, width: 47, height: 100 } : undefined);
  const isFull = presenterValue.crop.x === 0 && presenterValue.crop.y === 0 && presenterValue.crop.width === 100 && presenterValue.crop.height === 100;
  const isChest = presenterValue.crop.x === 32 && presenterValue.crop.y === 2 && presenterValue.crop.width === 40 && presenterValue.crop.height === 67;
  const isTight = Boolean(tight && Math.abs(presenterValue.crop.x - tight.x) < 1 && Math.abs(presenterValue.crop.width - tight.width) < 1 && Math.abs(presenterValue.crop.height - tight.height) < 1);
  const presenterFramingMode = isTight ? 'tight' : isFull ? 'full' : isChest ? 'chest' : 'custom';

  return (
    <div className="space-y-3" aria-label="Auto-Pilot production settings">
      {/* Media Generation Group */}
      <Group title="Media generation" open>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Image provider"
            value={value.media.imageProvider}
            choices={[
              ['google', 'Google Cloud'],
              ['cloudflare', 'Cloudflare'],
              ['local', 'Local image model'],
            ]}
            onChange={imageProvider => patch('media', { imageProvider: imageProvider as AutoPilotSettings['media']['imageProvider'] })}
          />
          <Select
            label="Image quality"
            value={value.media.imageQuality}
            choices={['fast', 'standard', 'high'].map(v => [v, labelize(v)] as const)}
            onChange={imageQuality => patch('media', { imageQuality: imageQuality as AutoPilotSettings['media']['imageQuality'] })}
          />
          <Select
            label="Image seed mode"
            value={value.media.seedMode}
            choices={[
              ['random', 'Random'],
              ['fixed', 'Fixed seed'],
            ]}
            onChange={seedMode => patch('media', { seedMode: seedMode as 'random' | 'fixed' })}
          />
          {value.media.seedMode === 'fixed' && (
            <NumberInput label="Image seed" value={value.media.seed} min={0} max={2147483647} onChange={seed => patch('media', { seed })} />
          )}
        </div>
        <Toggle label="Generate video scenes with Google Flow" checked={value.media.flowEnabled} onChange={flowEnabled => patch('media', { flowEnabled })} />
        {value.media.flowEnabled && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Flow video quality"
                value={value.media.flowResolution}
                choices={[
                  ['720p', '720p · Fast'],
                  ['1080p', '1080p · Upscaled'],
                ]}
                onChange={flowResolution => patch('media', { flowResolution: flowResolution as '720p' | '1080p' })}
              />
              <Select
                label="Flow clip duration"
                value={value.media.flowDuration}
                choices={[
                  [4, '4 seconds'],
                  [6, '6 seconds'],
                  [8, '8 seconds'],
                ]}
                onChange={duration => patch('media', { flowDuration: Number(duration) as 4 | 6 | 8 })}
              />
            </div>
            <p className="text-xs text-muted">Uses Veo 3.1 Fast for scenes marked as video by the script. An image-only template stays image-only. Flow uses your connected account’s credits.</p>
            <Toggle label="Use still images if Flow is unavailable" checked={value.media.allowImageFallback} onChange={allowImageFallback => patch('media', { allowImageFallback })} />
          </>
        )}
        <p className="text-xs text-muted">Final MP4: {profile === 'shorts' ? '1080 × 1920 · Portrait' : '1920 × 1080 · Landscape'}. Image provider fallback follows the Generation tab’s configured availability.</p>
      </Group>

      {/* Voice Model Group */}
      <Group title="Voice model & narrator" open>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Voice engine"
            value={value.voice.provider}
            choices={[
              ['default', `Configured default · ${providers.find(p => p.id === defaultProvider)?.name || defaultProvider}`],
              ...providers.map(p => [p.id, `${p.name}${p.configured ? '' : ' · Setup required'}`] as const),
            ]}
            onChange={provider => {
              stopPreview();
              onVoiceReady(false);
              patch('voice', { provider: provider as AutoPilotSettings['voice']['provider'], voiceId: '' });
            }}
          />
          <Select
            label="Voice language"
            value={value.voice.language}
            choices={[
              ['en', 'English'],
              ['hi', 'Hindi'],
            ]}
            onChange={language => {
              stopPreview();
              onVoiceReady(false);
              patch('voice', { language: language as AutoPilotSettings['voice']['language'], voiceId: '' });
            }}
          />
        </div>
        <Select
          label="Narration voice"
          value={value.voice.voiceId}
          disabled={voiceLoading}
          choices={voices.length ? voices.map(v => [v.id, v.name]) : [['', voiceLoading ? 'Loading voices…' : 'No voices available']]}
          onChange={voiceId => {
            stopPreview();
            patch('voice', { voiceId });
            rememberVoice(account.id, language, providers.find(p => p.id === effectiveProvider)?.name || effectiveProvider, voiceId);
          }}
        />
        <label className="block text-xs text-muted">
          Preview text · Optional
          <textarea
            aria-label="Voice preview text"
            className={`${selectClass} h-20`}
            maxLength={500}
            value={previewText}
            placeholder={language === 'hi' ? 'अपनी कहानी की कुछ पंक्तियाँ यहाँ लिखें…' : 'Try a few sentences from your story…'}
            onChange={event => {
              stopPreview();
              setPreviewText(event.target.value);
            }}
          />
        </label>
        {scriptExcerpt.trim() && (
          <button
            type="button"
            className="text-xs text-accent underline"
            onClick={() => {
              stopPreview();
              setPreviewText(scriptExcerpt.slice(0, 500));
            }}
          >
            Use script excerpt
          </button>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="studio-btn-ghost text-xs" disabled={!voiceReady} onClick={() => void preview()}>
            {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : previewing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {previewLoading ? 'Cancel preview' : previewing ? 'Stop preview' : 'Preview voice'}
          </button>
          <button type="button" className="text-xs text-accent underline" onClick={() => setReload(n => n + 1)}>
            Refresh voices
          </button>
        </div>
        <audio
          ref={audio}
          aria-label="Narrator preview playback"
          controls
          autoPlay
          src={previewSrc || undefined}
          hidden={!previewSrc}
          className="w-full"
          onEnded={() => setPreviewing(false)}
          onError={() => {
            if (previewSrc) setVoiceError('Could not play this voice preview. Try again.');
          }}
        />
        {effectiveProvider === 'google' && (
          <p className="text-xs text-muted">Google Chirp 3 HD · Hindi and English. Previews count toward Google’s monthly character allowance. Repeated previews with the same text, voice and speed are cached.</p>
        )}
        {!configured && (
          <p role="alert" className="text-xs text-amber-300">
            {effectiveProvider === 'google' ? 'Configure Google Cloud credentials and enable the Cloud Text-to-Speech API, then refresh voices.' : 'Add this engine’s API key in Setup before running.'}
          </p>
        )}
        {voiceError && <p role="alert" className="text-xs text-red-300">{voiceError}</p>}
        <details>
          <summary className="cursor-pointer text-xs text-accent">Voice tuning</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {effectiveProvider === 'edge' && (
              <>
                <NumberInput label="Speech rate (%)" min={-25} max={35} value={value.voice.rate} onChange={rate => patch('voice', { rate })} />
                <NumberInput label="Pitch (Hz)" min={-12} max={12} value={value.voice.pitch} onChange={pitch => patch('voice', { pitch })} />
              </>
            )}
            {(effectiveProvider === 'openrouter' || effectiveProvider === 'google') && (
              <NumberInput label="Speech speed" min={0.75} max={1.5} step={0.05} value={value.voice.speed} onChange={speed => patch('voice', { speed })} />
            )}
          </div>
        </details>
      </Group>

      {/* AI Presenter (MuseTalk) Group */}
      <Group title="AI Presenter (MuseTalk Avatar)" open={presenterValue.enabled}>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Toggle
              label="Enable AI Presenter avatar in Auto-Pilot"
              checked={presenterValue.enabled}
              onChange={enabled => {
                if (enabled && avatars.length > 0 && !avatars.some(a => a.id === presenterValue.avatarId)) {
                  patchPresenter({ enabled: true, avatarId: avatars[0].id });
                } else {
                  patchPresenter({ enabled });
                }
              }}
            />
            <button
              type="button"
              onClick={() => void refreshAvatars()}
              disabled={refreshingAvatars}
              className="flex items-center gap-1 text-xs text-accent hover:underline disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${refreshingAvatars ? 'animate-spin' : ''}`} />
              Refresh avatars
            </button>
          </div>

          <p className="text-xs text-muted">{presenterMessage}</p>
          {presenterError && <p role="alert" className="text-xs text-amber-300">{presenterError}</p>}

          {presenterValue.enabled && (
            <div className="space-y-4 rounded-xl border border-borderSoft bg-surface2/30 p-3.5">
              {avatars.length === 0 ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                  <p className="font-semibold">No prepared avatars found.</p>
                  <p className="mt-1">Prepare an avatar in MuseTalk and click &ldquo;Refresh avatars&rdquo; to use it in Auto-Pilot.</p>
                </div>
              ) : (
                <>
                  {/* Avatar Character & Appearance */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs text-muted">
                      Character
                      <select
                        aria-label="Presenter character"
                        className={selectClass}
                        value={presenterValue.avatarId}
                        onChange={e => {
                          const avatar = avatars.find(a => a.id === e.target.value);
                          patchPresenter({
                            avatarId: e.target.value,
                            style: avatar?.hasTransparency ? 'transparent' : presenterValue.style === 'transparent' ? 'card' : presenterValue.style,
                          });
                        }}
                      >
                        {!selectedAvatar && <option value={presenterValue.avatarId}>{presenterValue.avatarId} (not available)</option>}
                        {avatars.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.duration}s){a.hasTransparency ? ' · Transparent' : ''}
                          </option>
                        ))}
                      </select>
                    </label>

                    <Select
                      label="Appearance"
                      value={presenterValue.style}
                      choices={[
                        ['card', 'Picture-in-picture card'],
                        ['green-screen', 'Green-screen cutout'],
                        ['transparent', 'Transparent cutout (Always transparent)'],
                      ]}
                      onChange={style => patchPresenter({ style: style as PresenterSettings['style'] })}
                    />
                  </div>

                  {/* Framing */}
                  <Select
                    label="Framing & Crop"
                    value={presenterFramingMode}
                    choices={[
                      ...(tight ? [['tight', 'Full body (tight crop / edge-to-edge)'] as const] : []),
                      ['chest', 'Chest-up crop (Default)'],
                      ['full', 'Full source frame (16:9 canvas with margins)'],
                      ...(presenterFramingMode === 'custom' ? [['custom', 'Custom crop'] as const] : []),
                    ]}
                    onChange={val => {
                      if (val === 'tight' && tight) patchPresenter({ crop: tight });
                      else if (val === 'full') patchPresenter({ crop: { x: 0, y: 0, width: 100, height: 100 } });
                      else if (val === 'chest') patchPresenter({ crop: { x: 32, y: 2, width: 40, height: 67 } });
                    }}
                  />

                  {/* Avatar Resizing & Geometry */}
                  <div className="space-y-3.5 rounded-lg border border-borderSoft bg-black/30 p-3">
                    <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <UserCheck className="h-3.5 w-3.5 text-accent" />
                      Avatar Size & Placement
                    </p>

                    {/* Width slider & number input */}
                    <div>
                      <div className="flex items-center justify-between text-xs text-muted">
                        <span>Avatar Width / Size (%)</span>
                        <span className="font-mono text-accent font-bold">{presenterValue.widthPercent}%</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <input
                          aria-label="Avatar Width Slider"
                          type="range"
                          min={10}
                          max={100}
                          step={1}
                          value={presenterValue.widthPercent}
                          onChange={e => patchPresenter({ widthPercent: Number(e.target.value) })}
                          className="h-2 flex-1 accent-blue-500 cursor-pointer"
                        />
                        <input
                          aria-label="Avatar Width Input"
                          type="number"
                          min={10}
                          max={100}
                          step={1}
                          value={presenterValue.widthPercent}
                          onChange={e => {
                            const val = Number(e.target.value);
                            if (Number.isFinite(val)) patchPresenter({ widthPercent: Math.max(10, Math.min(100, val)) });
                          }}
                          className="w-16 rounded bg-surface2 px-2 py-1 text-center font-mono text-xs text-white border border-borderSoft"
                        />
                      </div>
                      {/* Quick Size Presets */}
                      <div className="mt-1.5 flex gap-1.5">
                        {[
                          ['Small', 25],
                          ['Medium', 40],
                          ['Large', 60],
                          ['Extra Large', 85],
                        ].map(([label, val]) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => patchPresenter({ widthPercent: val as number })}
                            className={`rounded px-2 py-0.5 text-[10px] transition-colors ${
                              presenterValue.widthPercent === val
                                ? 'bg-accent text-white font-semibold'
                                : 'bg-surface2/60 text-muted hover:text-white'
                            }`}
                          >
                            {label} ({val}%)
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Horizontal Placement: Left end to Right end */}
                    <div>
                      <div className="flex items-center justify-between text-xs text-muted">
                        <span>Horizontal Position (Left End ⟷ Right End)</span>
                        <span className="font-mono text-accent font-bold">
                          {(presenterValue.horizontalPercent ?? 100) === 0
                            ? 'Left End (0%)'
                            : (presenterValue.horizontalPercent ?? 100) === 50
                            ? 'Center (50%)'
                            : (presenterValue.horizontalPercent ?? 100) === 100
                            ? 'Right End (100%)'
                            : `${presenterValue.horizontalPercent ?? 100}%`}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <input
                          aria-label="Horizontal Position Slider"
                          type="range"
                          min={0}
                          max={100}
                          step={0.5}
                          value={presenterValue.horizontalPercent ?? 100}
                          onChange={e => patchPresenter({ horizontalPercent: Number(e.target.value) })}
                          className="h-2 flex-1 accent-blue-500 cursor-pointer"
                        />
                        <input
                          aria-label="Horizontal Position Input"
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={presenterValue.horizontalPercent ?? 100}
                          onChange={e => {
                            const val = Number(e.target.value);
                            if (Number.isFinite(val)) patchPresenter({ horizontalPercent: Math.max(0, Math.min(100, val)) });
                          }}
                          className="w-16 rounded bg-surface2 px-2 py-1 text-center font-mono text-xs text-white border border-borderSoft"
                        />
                      </div>
                      {/* Alignment shortcuts */}
                      <div className="mt-1.5 flex gap-1.5">
                        {[
                          ['Left End', 0],
                          ['Center', 50],
                          ['Right End', 100],
                        ].map(([label, val]) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => patchPresenter({ horizontalPercent: val as number })}
                            className={`rounded px-2.5 py-0.5 text-[10px] transition-colors ${
                              (presenterValue.horizontalPercent ?? 100) === val
                                ? 'bg-accent text-white font-semibold'
                                : 'bg-surface2/60 text-muted hover:text-white'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Bottom vertical positioning */}
                    <div>
                      <div className="flex items-center justify-between text-xs text-muted">
                        <span>Bottom offset (%)</span>
                        <span className="font-mono text-accent font-bold">{presenterValue.bottomPercent}%</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <input
                          aria-label="Bottom offset"
                          type="range"
                          min={0}
                          max={70}
                          step={0.5}
                          value={presenterValue.bottomPercent}
                          onChange={e => patchPresenter({ bottomPercent: Number(e.target.value) })}
                          className="h-2 flex-1 accent-blue-500 cursor-pointer"
                        />
                        <input
                          aria-label="Bottom Offset Input"
                          type="number"
                          min={0}
                          max={70}
                          step={0.5}
                          value={presenterValue.bottomPercent}
                          onChange={e => {
                            const val = Number(e.target.value);
                            if (Number.isFinite(val)) patchPresenter({ bottomPercent: Math.max(0, Math.min(70, val)) });
                          }}
                          className="w-16 rounded bg-surface2 px-2 py-1 text-center font-mono text-xs text-white border border-borderSoft"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Interactive Placement & Size Preview */}
                  <div className="flex flex-col items-center justify-center p-3 rounded-xl border border-borderSoft bg-black/50">
                    <div className="mb-2 flex w-full items-center justify-between text-xs text-muted">
                      <span>Live Placement Preview ({profile === 'shorts' ? '9:16 Portrait' : '16:9 Landscape'})</span>
                      <span className="rounded bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent">
                        {presenterValue.widthPercent}% Width
                      </span>
                    </div>
                    <div
                      className={`relative overflow-hidden rounded-xl border border-white/10 bg-zinc-950 shadow-2xl flex items-center justify-center ${
                        profile === 'shorts' ? 'h-64 w-36' : 'aspect-video w-full max-w-sm'
                      }`}
                    >
                      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:16px_16px]" />
                      <span className="text-[10px] text-muted/60 select-none pointer-events-none">Video Footage</span>
                      {selectedAvatar ? (
                        <PresenterPreview
                          avatar={selectedAvatar}
                          value={presenterValue}
                          playing={true}
                          landscape={profile !== 'shorts'}
                        />
                      ) : (
                        <span className="text-[10px] text-amber-300">Select an avatar</span>
                      )}
                    </div>
                    <p className="mt-2 text-[11px] text-muted text-center">
                      The avatar will be automatically synchronized with your voiceover and overlaid at this exact scale and position.
                    </p>
                  </div>

                  {/* Advanced silence & crop fine-tuning */}
                  <details>
                    <summary className="cursor-pointer text-xs text-accent">Adjust crop & silence protection</summary>
                    <div className="mt-3 space-y-3 rounded-lg border border-borderSoft p-3 bg-surface/40">
                      <div className="flex flex-wrap gap-1.5 mb-1">
                        {tight && (
                          <button
                            type="button"
                            onClick={() => patchPresenter({ crop: tight })}
                            className="rounded bg-surface2 px-2 py-1 text-[11px] text-accent hover:bg-surface2/80 font-medium"
                          >
                            Fit to character (tight crop)
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => patchPresenter({ crop: { x: 32, y: 2, width: 40, height: 67 } })}
                          className="rounded bg-surface2 px-2 py-1 text-[11px] text-gray-300 hover:bg-surface2/80"
                        >
                          Chest-up
                        </button>
                        <button
                          type="button"
                          onClick={() => patchPresenter({ crop: { x: 0, y: 0, width: 100, height: 100 } })}
                          className="rounded bg-surface2 px-2 py-1 text-[11px] text-gray-300 hover:bg-surface2/80"
                        >
                          Full frame
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {(['x', 'y', 'width', 'height'] as const).map(key => (
                          <NumberInput
                            key={key}
                            label={`Crop ${key} (%)`}
                            min={0}
                            max={100}
                            step={0.5}
                            value={presenterValue.crop[key]}
                            onChange={v => {
                              let { x, y, width, height } = presenterValue.crop;
                              if (key === 'x') {
                                x = Math.max(0, Math.min(90, v));
                                if (x + width > 100) width = Math.max(10, 100 - x);
                              } else if (key === 'y') {
                                y = Math.max(0, Math.min(90, v));
                                if (y + height > 100) height = Math.max(10, 100 - y);
                              } else if (key === 'width') {
                                width = Math.max(10, Math.min(100 - x, v));
                              } else if (key === 'height') {
                                height = Math.max(10, Math.min(100 - y, v));
                              }
                              patchPresenter({ crop: { x, y, width, height } });
                            }}
                          />
                        ))}
                      </div>
                      <Toggle
                        label="Preserve original mouth during silence"
                        checked={presenterValue.silenceGate}
                        onChange={silenceGate => patchPresenter({ silenceGate })}
                      />
                      <NumberInput
                        label="Silence threshold (dB)"
                        min={-55}
                        max={-25}
                        value={presenterValue.silenceThresholdDb}
                        onChange={silenceThresholdDb => patchPresenter({ silenceThresholdDb })}
                      />
                    </div>
                  </details>
                </>
              )}
            </div>
          )}
        </div>
      </Group>

      {/* Captions & Graphics Group */}
      <Group title="Captions & motion graphics" open>
        <Select
          label="Captions"
          value={value.captions}
          choices={[
            ['off', 'Off'],
            ['plain', 'Standard captions'],
            ['motion', 'Motion captions'],
          ]}
          onChange={captions => onChange({ ...value, captions: captions as AutoPilotSettings['captions'] })}
        />
        {value.captions === 'motion' && (
          <p className="text-xs text-muted">Animated phrases follow measured scene audio; word timing within each scene is estimated.</p>
        )}
        <Toggle label="Add optional graphics" checked={value.graphics.enabled} onChange={enabled => patch('graphics', { enabled })} />
        <p className="text-xs text-muted">Off keeps your scene footage clean. When enabled, graphics are added only where useful; skipped graphics never block the video.</p>
        {value.graphics.enabled && (
          <>
            <Select
              label="Graphics type"
              value={value.graphics.mode}
              choices={[
                ['images', 'Evidence images & explanatory diagrams'],
                ['callouts', 'Titles, numbers & callouts'],
              ]}
              onChange={mode =>
                patch('graphics', {
                  mode: mode as AutoPilotSettings['graphics']['mode'],
                  style:
                    mode === 'callouts'
                      ? 'Use restrained titles, statistics and source-grounded callouts that support the spoken story.'
                      : 'Keep footage clean. Use an occasional evidence image or explanatory diagram only where helpful. No decorative numbers or oversized text.',
                })
              }
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Graphics density"
                value={value.graphics.density}
                choices={[
                  ['subtle', 'Subtle'],
                  ['balanced', 'Balanced'],
                  ['expressive', 'Expressive'],
                ]}
                onChange={density => patch('graphics', { density: density as AutoPilotSettings['graphics']['density'] })}
              />
              <Select
                label="Graphics treatment"
                value={value.graphics.treatment}
                choices={[
                  ['auto', 'AI chooses'],
                  ['cinematic', 'Cinematic image inserts'],
                  ['archival', 'Archival collage'],
                  ['map', 'Maps · Requires source map'],
                ]}
                onChange={treatment => patch('graphics', { treatment: treatment as AutoPilotSettings['graphics']['treatment'] })}
              />
            </div>
            <Select
              label="Motion graphics AI"
              value={value.graphics.model}
              choices={[['', 'Configured Gemini vision model'], ...GEMINI_MODELS.map(m => [m.id, m.name] as const)]}
              onChange={model => patch('graphics', { model })}
            />
            <label className="block text-xs text-muted">
              Visual direction
              <textarea
                aria-label="Visual direction"
                className={`${selectClass} h-20`}
                maxLength={2000}
                value={value.graphics.style}
                onChange={event => patch('graphics', { style: event.target.value })}
              />
            </label>
            <p className="text-xs text-muted">Directed sequences work with stills and video. Selected beats can generate separate illustration assets; rendered motion is checked before export.</p>
          </>
        )}
      </Group>

      {/* Editing & Audio Group */}
      <Group title="Editing & audio finishing">
        <Select
          label="Editing mode"
          value={value.editing.mode}
          choices={[
            ['story', 'AI story edit'],
            ['custom', 'Custom editing preset'],
            ['off', 'No editing effects'],
          ]}
          onChange={mode => patch('editing', { mode: mode as AutoPilotSettings['editing']['mode'] })}
        />
        {value.editing.mode === 'custom' && (
          <>
            <Select
              label="Editing preset"
              value={e.preset}
              choices={[
                ['clean', 'Clean Studio'],
                ['cinematic', 'Cinematic Story'],
                ['documentary', 'Documentary'],
              ]}
              onChange={preset => patch('editing', { settings: { ...editingPreset(preset as EditingSettings['preset']), captions: value.captions === 'plain' } })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Image motion"
                value={e.motion}
                choices={[
                  ['gentle', 'Gentle'],
                  ['balanced', 'Balanced'],
                  ['off', 'Static'],
                ]}
                onChange={motion => edit({ motion: motion as EditingSettings['motion'] })}
              />
              <Select
                label="Transitions"
                value={e.transitions}
                choices={['auto', 'cut', 'dissolve', 'dip-black'].map(v => [v, labelize(v)] as const)}
                onChange={transitions => edit({ transitions: transitions as EditingSettings['transitions'] })}
              />
              <NumberInput
                label="Transition seconds"
                value={e.transitionSeconds}
                min={0.15}
                max={0.8}
                step={0.05}
                onChange={transitionSeconds => edit({ transitionSeconds })}
              />
              <Select
                label="Framing"
                value={e.framing}
                choices={[
                  ['contain', 'Fit full image'],
                  ['cover', 'Fill frame'],
                ]}
                onChange={framing => edit({ framing: framing as EditingSettings['framing'] })}
              />
              <Select
                label="Color look"
                value={e.colorLook}
                choices={['none', 'clean', 'warm-vintage', 'teal-orange', 'dramatic-noir'].map(v => [v, labelize(v)] as const)}
                onChange={colorLook => edit({ colorLook: colorLook as EditingSettings['colorLook'] })}
              />
              <Select
                label="Render quality"
                value={e.quality}
                choices={[
                  ['standard', 'Standard'],
                  ['high', 'High'],
                ]}
                onChange={quality => edit({ quality: quality as EditingSettings['quality'] })}
              />
              {value.captions === 'plain' && (
                <>
                  <Select
                    label="Caption style"
                    value={e.captionStyle}
                    choices={['minimal', 'boxed', 'gold'].map(v => [v, labelize(v)] as const)}
                    onChange={captionStyle => edit({ captionStyle: captionStyle as EditingSettings['captionStyle'] })}
                  />
                  <NumberInput
                    label="Words per caption"
                    value={e.captionWords}
                    min={4}
                    max={12}
                    onChange={captionWords => edit({ captionWords })}
                  />
                </>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ['bookendFades', 'Opening & closing fades'],
                  ['voicePolish', 'Voice polish'],
                  ['musicDucking', 'Duck music under speech'],
                  ['chapterSound', 'Chapter sound accents'],
                  ['vignette', 'Soft vignette'],
                  ['grain', 'Film grain'],
                  ['sharpen', 'Light sharpening'],
                  ['letterbox', 'Cinema bars'],
                ] as const
              ).map(([key, label]) => (
                <Toggle key={key} label={label} checked={e[key]} onChange={checked => edit({ [key]: checked })} />
              ))}
            </div>
          </>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Background music"
            value={value.audio.music}
            choices={[
              ['auto', 'AI chooses for the story'],
              ...['none', 'calm', 'cinematic', 'epic', 'upbeat'].map(v => [v, labelize(v)] as const),
            ]}
            onChange={music => patch('audio', { music: music as AutoPilotSettings['audio']['music'] })}
          />
          <NumberInput
            label="Music volume"
            value={value.audio.musicVolume}
            min={0}
            max={1}
            step={0.05}
            onChange={musicVolume => patch('audio', { musicVolume })}
          />
          <NumberInput
            label="Narration volume"
            value={value.audio.voiceVolume}
            min={0}
            max={2}
            step={0.05}
            onChange={voiceVolume => patch('audio', { voiceVolume })}
          />
        </div>
      </Group>

      {/* YouTube Export / Delivery Group */}
      <Group title="YouTube export & delivery" open>
        <Select
          label="Export action"
          value={value.youtube.enabled ? 'auto' : 'manual'}
          choices={[
            ['auto', 'Auto-Export · Upload to YouTube after final review'],
            ['manual', 'No Export · Render final video only (manual export)'],
          ]}
          onChange={action => patch('youtube', { enabled: action === 'auto' })}
        />

        {!value.youtube.enabled ? (
          <div className="rounded-xl border border-accent/25 bg-accent/10 p-3 text-xs leading-relaxed text-gray-200">
            <div className="flex items-center gap-1.5 font-bold text-accent mb-1">
              <Rocket className="h-3.5 w-3.5" />
              No Export Mode Selected (Manual Export)
            </div>
            Auto-Pilot will research the topic, synthesize all scene assets, animate lip-sync (if presenter is enabled), and render the completed high-definition MP4 video. It will <strong>not</strong> upload to YouTube. You can download the video or export it manually whenever you are ready.
          </div>
        ) : (
          <>
            <Select
              label="Publishing"
              value={value.youtube.publishMode}
              choices={[
                ['now', 'Upload after final review'],
                ['schedule', 'Schedule public release'],
              ]}
              onChange={mode => {
                const publishMode = mode as 'now' | 'schedule';
                const currentTs = value.youtube.scheduledPublishAt ? Date.parse(value.youtube.scheduledPublishAt) : NaN;
                const isFuture = Number.isFinite(currentTs) && currentTs > Date.now() + 5 * 60_000;
                const nextScheduled = publishMode === 'schedule' && !isFuture
                  ? defaultScheduleDate().toISOString()
                  : value.youtube.scheduledPublishAt;
                if (publishMode === 'schedule' && !isFuture) {
                  setScheduleInputVal(toLocalDateTimeInput(new Date(nextScheduled)));
                }
                patch('youtube', {
                  publishMode,
                  scheduledPublishAt: nextScheduled,
                });
              }}
            />
            {value.youtube.publishMode === 'schedule' ? (
              <div className="space-y-3 rounded-xl border border-borderSoft bg-bg/40 p-3.5">
                <div>
                  <label className="block text-xs font-semibold text-gray-200 mb-1.5">
                    Publish at (your local time)
                  </label>
                  <div className="relative flex items-center">
                    <input
                      aria-label="Scheduled publication time"
                      type="datetime-local"
                      min={toLocalDateTimeInput(new Date(Date.now() + 5 * 60_000))}
                      className={`${selectClass} pr-10 cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-80 [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert`}
                      value={scheduleInputVal}
                      onClick={e => {
                        try {
                          (e.target as HTMLInputElement).showPicker?.();
                        } catch {}
                      }}
                      onChange={event => {
                        const val = event.target.value;
                        setScheduleInputVal(val);
                        if (val) {
                          const parsed = new Date(val);
                          if (!Number.isNaN(parsed.getTime())) {
                            patch('youtube', { scheduledPublishAt: parsed.toISOString() });
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      title="Open calendar picker"
                      onClick={e => {
                        const input = e.currentTarget.parentElement?.querySelector('input') as HTMLInputElement | null;
                        try {
                          input?.showPicker?.();
                        } catch {}
                        input?.focus();
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors p-1"
                    >
                      <Calendar className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <span className="block text-[11px] font-medium text-gray-300 mb-1.5 flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-accent" /> Quick Schedule Presets
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const d = getSchedulePresetDate(2);
                        setScheduleInputVal(toLocalDateTimeInput(d));
                        patch('youtube', { scheduledPublishAt: d.toISOString(), publishMode: 'schedule' });
                      }}
                      className="rounded-lg border border-borderSoft bg-bg/70 px-2.5 py-1 text-xs font-medium text-gray-200 hover:border-accent hover:text-white transition-colors"
                    >
                      +2 Hours
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = getSchedulePresetDate(4);
                        setScheduleInputVal(toLocalDateTimeInput(d));
                        patch('youtube', { scheduledPublishAt: d.toISOString(), publishMode: 'schedule' });
                      }}
                      className="rounded-lg border border-borderSoft bg-bg/70 px-2.5 py-1 text-xs font-medium text-gray-200 hover:border-accent hover:text-white transition-colors"
                    >
                      +4 Hours
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = getSchedulePresetDate(undefined, 9, 1);
                        setScheduleInputVal(toLocalDateTimeInput(d));
                        patch('youtube', { scheduledPublishAt: d.toISOString(), publishMode: 'schedule' });
                      }}
                      className="rounded-lg border border-borderSoft bg-bg/70 px-2.5 py-1 text-xs font-medium text-gray-200 hover:border-accent hover:text-white transition-colors"
                    >
                      Tomorrow 9 AM
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = getSchedulePresetDate(undefined, 18, 1);
                        setScheduleInputVal(toLocalDateTimeInput(d));
                        patch('youtube', { scheduledPublishAt: d.toISOString(), publishMode: 'schedule' });
                      }}
                      className="rounded-lg border border-borderSoft bg-bg/70 px-2.5 py-1 text-xs font-medium text-gray-200 hover:border-accent hover:text-white transition-colors"
                    >
                      Tomorrow 6 PM
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = getSchedulePresetDate(undefined, 18, 2);
                        setScheduleInputVal(toLocalDateTimeInput(d));
                        patch('youtube', { scheduledPublishAt: d.toISOString(), publishMode: 'schedule' });
                      }}
                      className="rounded-lg border border-borderSoft bg-bg/70 px-2.5 py-1 text-xs font-medium text-gray-200 hover:border-accent hover:text-white transition-colors"
                    >
                      +2 Days 6 PM
                    </button>
                  </div>
                </div>

                {(() => {
                  const ts = value.youtube.scheduledPublishAt ? Date.parse(value.youtube.scheduledPublishAt) : NaN;
                  const isTooSoon = Number.isFinite(ts) && ts <= Date.now() + 5 * 60_000;
                  const isInvalid = !Number.isFinite(ts);

                  if (isInvalid) {
                    return (
                      <div className="flex items-center gap-1.5 text-xs text-amber-400">
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>Please select a valid date and time for publication.</span>
                      </div>
                    );
                  }

                  if (isTooSoon) {
                    return (
                      <div className="flex items-center gap-1.5 text-xs text-amber-400">
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>Publication time must be at least 5 minutes in the future (to allow video generation and review).</span>
                      </div>
                    );
                  }

                  return (
                    <div className="rounded-lg border border-accent/20 bg-accent/5 p-2.5 text-xs text-gray-300 space-y-1">
                      <div className="flex items-center gap-1.5 text-accent font-semibold">
                        <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>Scheduled Release: {formatScheduledDisplay(value.youtube.scheduledPublishAt)}</span>
                      </div>
                      <p className="text-[11px] text-muted">
                        Auto-Pilot will generate the video, run final reviews, and upload to YouTube as <strong>Private</strong>. YouTube will automatically publish it as <strong>Public</strong> at this exact time.
                      </p>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <Select
                label="YouTube visibility"
                value={value.youtube.privacyStatus}
                choices={[
                  ['private', 'Private'],
                  ['unlisted', 'Unlisted'],
                  ['public', 'Public'],
                ]}
                onChange={privacyStatus => patch('youtube', { privacyStatus: privacyStatus as AutoPilotSettings['youtube']['privacyStatus'] })}
              />
            )}
            <p className="text-xs text-muted">Uploads after final review passes. Topic history is recorded only after a successful upload.</p>
          </>
        )}
      </Group>
    </div>
  );
}
