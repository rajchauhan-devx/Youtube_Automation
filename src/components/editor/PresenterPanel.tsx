import { useEffect, useRef, useState } from 'react';
import { useWorkspaceApi } from '../../services/workspaceApi';
import { presenterGeometry, type PresenterSettings } from '../../../server/src/services/presenter-settings';

export interface PresenterAvatar { id: string; name: string; width: number; height: number; duration: number; previewUrl: string; hasTransparency?: boolean; transparentPreviewUrl?: string }

export function PresenterPreview({ avatar, value, playing = false, landscape }: { avatar: PresenterAvatar; value: PresenterSettings; playing?: boolean; landscape: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const previewUrl = value.style === 'transparent' ? avatar.transparentPreviewUrl : avatar.previewUrl;
  useEffect(() => {
    if (playing) void video.current?.play().catch(() => {});
    else video.current?.pause();
  }, [playing, previewUrl]);
  const width = landscape ? 1920 : 1080, height = landscape ? 1080 : 1920;
  const g = presenterGeometry(value, width, height, avatar.width, avatar.height);
  if (!previewUrl) return null;
  return <div aria-label="Presenter placement preview" className={`absolute overflow-hidden ${value.style === 'transparent' ? '' : 'rounded-sm shadow-lg'}`} style={{
    width: `${g.width / width * 100}%`, height: `${g.height / height * 100}%`, right: `${value.marginPercent}%`, bottom: `${value.bottomPercent}%`,
  }}>
    <video ref={video} key={previewUrl} src={previewUrl} muted loop playsInline preload="auto" style={{
      position: 'absolute', maxWidth: 'none', width: `${10000 / value.crop.width}%`, height: `${10000 / value.crop.height}%`,
      left: `${-100 * value.crop.x / value.crop.width}%`, top: `${-100 * value.crop.y / value.crop.height}%`,
    }} />
  </div>;
}

export function PresenterPanel({ value, onChange, onSave, onAvatars, disabled }: {
  value: PresenterSettings; onChange: (value: PresenterSettings) => void; onSave: () => Promise<void>;
  onAvatars: (avatars: PresenterAvatar[]) => void; disabled: boolean;
}) {
  const { fetch } = useWorkspaceApi();
  const [avatars, setAvatars] = useState<PresenterAvatar[]>([]);
  const [message, setMessage] = useState('Checking presenter engine...');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function refresh() {
    try {
      const response = await fetch('/api/presenter/status');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Cannot check presenter engine');
      setAvatars(data.avatars || []); onAvatars(data.avatars || []); setMessage(data.message); setError('');
    } catch { setError('Cannot reach the presenter service. Restart the application server and refresh.'); }
  }
  useEffect(() => { void refresh(); }, [fetch]);
  const change = (patch: Partial<PresenterSettings>) => onChange({ ...value, ...patch });
  const selected = avatars.find(a => a.id === value.avatarId);
  return <section className="space-y-3 rounded-xl border border-border bg-surface/60 p-4" aria-label="AI Presenter">
    <div className="flex items-center justify-between gap-3">
      <label className="flex items-center gap-2 font-semibold text-white"><input type="checkbox" checked={value.enabled} disabled={disabled || saving} onChange={e => change({ enabled: e.target.checked })} /> AI Presenter</label>
      <button type="button" disabled={disabled} onClick={() => void refresh()} className="text-xs text-accent">Refresh avatars</button>
    </div>
    <p className="text-xs text-gray-400">{message}</p>
    {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
    {value.enabled && <fieldset disabled={disabled || saving} className="space-y-3 text-xs text-gray-300 disabled:opacity-60">
      <label className="block">Character
        <select aria-label="Presenter character" className="mt-1 w-full rounded bg-surface2 p-2" value={value.avatarId} onChange={e => {
          const avatar = avatars.find(a => a.id === e.target.value);
          change({ avatarId: e.target.value, style: avatar?.hasTransparency ? 'transparent' : value.style === 'transparent' ? 'card' : value.style });
        }}>
          {!selected && <option value={value.avatarId}>{value.avatarId} (not available)</option>}
          {avatars.map(a => <option key={a.id} value={a.id}>{a.name} ({a.duration}s)</option>)}
        </select>
      </label>
      {!selected && <p role="alert" className="text-amber-300">No matching prepared avatar. Prepare one in MuseTalk and refresh this list.</p>}
      <div className="grid grid-cols-2 gap-3">
        <label>Appearance<select aria-label="Presenter appearance" className="mt-1 w-full rounded bg-surface2 p-2" value={value.style} onChange={e => change({ style: e.target.value as PresenterSettings['style'] })}>
          <option value="card">Picture-in-picture card</option><option value="green-screen">Green-screen cutout</option>
          <option value="transparent" disabled={!selected?.hasTransparency}>Transparent cutout{selected?.hasTransparency ? '' : ' (transparent WebM required)'}</option>
        </select></label>
        <label>Framing<select aria-label="Presenter framing" className="mt-1 w-full rounded bg-surface2 p-2" value={value.crop.width === 100 && value.crop.height === 100 ? 'full' : 'chest'} onChange={e => change({ crop: e.target.value === 'full' ? { x: 0, y: 0, width: 100, height: 100 } : { x: 32, y: 2, width: 40, height: 67 } })}>
          <option value="chest">Chest-up / custom crop</option><option value="full">Full source frame</option>
        </select></label>
        {([['widthPercent', 'Width (%)', 10, 40], ['bottomPercent', 'Bottom space (%)', 0, 30], ['marginPercent', 'Right margin (%)', 0, 10]] as const).map(([key, label, min, max]) => <label key={key}>{label}
          <input aria-label={label} type="number" min={min} max={max} step="0.5" className="mt-1 w-full rounded bg-surface2 p-2" value={value[key]} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n)) change({ [key]: Math.max(min, Math.min(max, n)) }); }} />
        </label>)}
      </div>
      <details><summary className="cursor-pointer">Adjust crop and silence protection</summary>
        <div className="mt-2 grid grid-cols-2 gap-2">{(['x', 'y', 'width', 'height'] as const).map(key => <label key={key}>Crop {key} (%)<input aria-label={`Presenter crop ${key}`} type="number" min={0} max={100} className="mt-1 w-full rounded bg-surface2 p-2" value={value.crop[key]} onChange={e => {
          const crop = { ...value.crop, [key]: Number(e.target.value) };
          if (crop.x >= 0 && crop.y >= 0 && crop.width >= 10 && crop.height >= 10 && crop.x + crop.width <= 100 && crop.y + crop.height <= 100) change({ crop });
        }} /></label>)}</div>
        <label className="mt-3 flex items-center gap-2"><input type="checkbox" checked={value.silenceGate} onChange={e => change({ silenceGate: e.target.checked })} /> Preserve original mouth during silence</label>
        <label className="mt-2 block">Silence threshold (dB)<input aria-label="Silence threshold" type="number" min={-55} max={-25} value={value.silenceThresholdDb} className="ml-2 w-20 rounded bg-surface2 p-2" onChange={e => change({ silenceThresholdDb: Math.max(-55, Math.min(-25, Number(e.target.value))) })} /></label>
      </details>
      <p className="text-gray-400">The timeline shows source movement. Lip-sync is generated with your narration when you render. Subtitles stay centered above the character, with no sideways shift when you resize it.</p>
      {value.style === 'green-screen' && <p className="text-amber-200">Use an avatar filmed against green. Background removal appears in the final render; the timeline shows the source background.</p>}
      {selected?.hasTransparency && value.style === 'card' && <button type="button" className="text-accent" onClick={() => change({ style: 'transparent' })}>Remove background — use original transparency</button>}
      {value.style === 'transparent' && <p className={selected?.hasTransparency ? 'text-gray-400' : 'text-amber-200'}>{selected?.hasTransparency ? 'Original transparency is preserved in the preview and restored after lip-sync in the final render. Dark hair and clothing stay intact.' : 'Transparent source unavailable. Re-upload the original transparent VP9 WebM in MuseTalk, then refresh avatars.'}</p>}
    </fieldset>}
    <button type="button" disabled={disabled || saving} className="rounded border border-border px-3 py-2 text-xs text-white disabled:opacity-50" onClick={async () => {
      setSaving(true); setError('');
      try { await onSave(); setMessage('Presenter settings saved.'); }
      catch (e) { setError(e instanceof Error ? e.message : 'Could not save settings.'); }
      finally { setSaving(false); }
    }}>{saving ? 'Saving...' : 'Save presenter settings'}</button>
    <span className="ml-2 text-xs text-gray-500">Also saved when you render.</span>
  </section>;
}
