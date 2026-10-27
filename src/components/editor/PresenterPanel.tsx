import { useEffect, useRef, useState } from 'react';
import { useWorkspaceApi } from '../../services/workspaceApi';
import { presenterGeometry, type PresenterSettings } from '../../../server/src/services/presenter-settings';

export interface PresenterAvatar {
  id: string;
  name: string;
  width: number;
  height: number;
  duration: number;
  previewUrl: string;
  hasTransparency?: boolean;
  transparentPreviewUrl?: string;
  tightCrop?: { x: number; y: number; width: number; height: number };
}

export function PresenterPreview({ avatar, value, playing = false, landscape }: { avatar: PresenterAvatar; value: PresenterSettings; playing?: boolean; landscape: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const previewUrl = value.style === 'transparent' ? (avatar.transparentPreviewUrl || avatar.previewUrl) : avatar.previewUrl;
  useEffect(() => {
    if (playing) void video.current?.play().catch(() => {});
    else video.current?.pause();
  }, [playing, previewUrl]);
  const width = landscape ? 1920 : 1080, height = landscape ? 1080 : 1920;
  const g = presenterGeometry(value, width, height, avatar.width, avatar.height);
  if (!previewUrl) return null;
  return <div aria-label="Presenter placement preview" className={`absolute overflow-hidden ${value.style === 'transparent' ? '' : 'rounded-sm shadow-lg'}`} style={{
    width: `${g.width / width * 100}%`, height: `${g.height / height * 100}%`, left: `${g.x / width * 100}%`, bottom: `${value.bottomPercent}%`,
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
  const [canPrepare, setCanPrepare] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [prepareProgress, setPrepareProgress] = useState('');
  const [prepareId, setPrepareId] = useState('');
  const uploadAbort = useRef<AbortController | null>(null);
  useEffect(() => () => uploadAbort.current?.abort(), []);
  async function refresh() {
    try {
      const response = await fetch('/api/presenter/status');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Cannot check presenter engine');
      const list = (data.avatars || []) as PresenterAvatar[];
      setAvatars(list);
      onAvatars(list);
      setMessage(data.message);
      setCanPrepare(data.canPrepare === true);
      setError('');
      if (list.length > 0 && (!value.avatarId || !list.some(a => a.id === value.avatarId))) {
        onChange({
          ...value,
          avatarId: list[0].id,
          style: list[0].hasTransparency ? 'transparent' : value.style === 'transparent' ? 'card' : value.style,
          crop: list[0].tightCrop || value.crop,
        });
      }
    } catch { setError('Cannot reach the presenter service. Restart the application server and refresh.'); }
  }
  useEffect(() => { void refresh(); }, [fetch]);
  async function uploadAvatar(file: File) {
    if (file.size > 40 * 1024 * 1024) { setError('Choose a file smaller than 40 MB.'); return; }
    const controller = new AbortController();
    uploadAbort.current?.abort(); uploadAbort.current = controller;
    setPreparing(true); setError(''); setPrepareProgress('Uploading avatar…');
    try {
      const response = await fetch(`/api/presenter/avatars?filename=${encodeURIComponent(file.name)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file, signal: controller.signal,
      });
      const job = await response.json();
      if (!response.ok) throw new Error(job.error || 'Could not upload avatar.');
      setPrepareId(job.id);
      while (!controller.signal.aborted) {
        const statusResponse = await fetch(`/api/presenter/preparation/${job.id}`, { signal: controller.signal });
        const status = await statusResponse.json();
        if (!statusResponse.ok || status.status === 'error') throw new Error(status.error || 'Avatar preparation failed.');
        setPrepareProgress(`${status.stage} (${Math.round(status.percent)}%)`);
        if (status.status === 'done') {
          await refresh();
          const avatarResponse = await fetch('/api/presenter/status', { signal: controller.signal });
          if (!avatarResponse.ok) throw new Error('Avatar was prepared, but the list could not refresh.');
          const data = await avatarResponse.json();
          const avatar = (data.avatars as PresenterAvatar[]).find(a => a.id === status.avatarId);
          if (avatar) onChange({ ...value, avatarId: avatar.id, enabled: true, style: avatar.hasTransparency ? 'transparent' : 'card',
            crop: avatar.tightCrop || { x: 0, y: 0, width: 100, height: 100 } });
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Avatar upload failed.');
    } finally {
      if (!controller.signal.aborted) { setPreparing(false); setPrepareId(''); }
    }
  }
  const change = (patch: Partial<PresenterSettings>) => onChange({ ...value, ...patch });
  const selected = avatars.find(a => a.id === value.avatarId);
  const tight = selected?.tightCrop || (selected?.hasTransparency ? { x: 25.6, y: 0, width: 47, height: 100 } : undefined);
  const isFull = value.crop.x === 0 && value.crop.y === 0 && value.crop.width === 100 && value.crop.height === 100;
  const isChest = value.crop.x === 32 && value.crop.y === 2 && value.crop.width === 40 && value.crop.height === 67;
  const isTight = Boolean(tight && Math.abs(value.crop.x - tight.x) < 1 && Math.abs(value.crop.width - tight.width) < 1 && Math.abs(value.crop.height - tight.height) < 1);
  const framingMode = isTight ? 'tight' : isFull ? 'full' : isChest ? 'chest' : 'custom';

  const updateCropKey = (key: 'x' | 'y' | 'width' | 'height', rawVal: number) => {
    let { x, y, width, height } = value.crop;
    if (key === 'x') {
      x = Math.max(0, Math.min(90, rawVal));
      if (x + width > 100) width = Math.max(10, 100 - x);
    } else if (key === 'y') {
      y = Math.max(0, Math.min(90, rawVal));
      if (y + height > 100) height = Math.max(10, 100 - y);
    } else if (key === 'width') {
      width = Math.max(10, Math.min(100 - x, rawVal));
    } else if (key === 'height') {
      height = Math.max(10, Math.min(100 - y, rawVal));
    }
    change({ crop: { x, y, width, height } });
  };
  return <section className="space-y-3 rounded-xl border border-border bg-surface/60 p-4" aria-label="AI Presenter">
    <div className="flex items-center justify-between gap-3">
      <label className="flex items-center gap-2 font-semibold text-white"><input type="checkbox" checked={value.enabled} disabled={disabled || saving} onChange={e => change({ enabled: e.target.checked })} /> AI Presenter</label>
      <button type="button" disabled={disabled} onClick={() => void refresh()} className="text-xs text-accent">Refresh avatars</button>
    </div>
    <p className="text-xs text-gray-400">{message}</p>
    {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
    {canPrepare && <div className="space-y-2 text-xs text-gray-300">
      <label className="block">Add an avatar
        <input aria-label="Upload presenter avatar" type="file" accept=".mp4,.mov,.webm,.mkv,.png,.jpg,.jpeg" disabled={disabled || preparing}
          className="mt-1 block w-full text-xs" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void uploadAvatar(file); }} />
      </label>
      <p className="text-gray-400">Use one clearly visible, forward-facing face. Photo or video, up to 40 MB. The first 10 seconds loop with your narration.</p>
      {preparing && <p role="status">{prepareProgress} {prepareId && <button type="button" className="ml-2 text-accent" onClick={async () => {
        try {
          const response = await fetch(`/api/presenter/preparation/${prepareId}/cancel`, { method: 'POST' });
          if (!response.ok) throw new Error('Could not cancel avatar preparation.');
          setPrepareProgress('Cancelling…');
        } catch (e) { setError(e instanceof Error ? e.message : 'Could not cancel.'); }
      }}>Cancel</button>}</p>}
    </div>}
    {value.enabled && <fieldset disabled={disabled || saving || preparing} className="space-y-3 text-xs text-gray-300 disabled:opacity-60">
      <label className="block">Character
        <select aria-label="Presenter character" className="mt-1 w-full rounded bg-surface2 p-2" value={value.avatarId} onChange={e => {
          const avatar = avatars.find(a => a.id === e.target.value);
          change({ avatarId: e.target.value, style: avatar?.hasTransparency ? 'transparent' : value.style === 'transparent' ? 'card' : value.style });
        }}>
          {!selected && <option value={value.avatarId}>{value.avatarId} (not available)</option>}
          {avatars.map(a => <option key={a.id} value={a.id}>{a.name} ({a.duration}s)</option>)}
        </select>
      </label>
      {!selected && <p role="alert" className="text-amber-300">No matching prepared avatar. Upload one above, or prepare one with the MuseTalk CLI and refresh this list.</p>}
      <div className="grid grid-cols-2 gap-3">
        <label>Appearance<select aria-label="Presenter appearance" className="mt-1 w-full rounded bg-surface2 p-2" value={value.style} onChange={e => change({ style: e.target.value as PresenterSettings['style'] })}>
          <option value="card">Picture-in-picture card</option><option value="green-screen">Green-screen cutout</option>
          <option value="transparent" disabled={!selected?.hasTransparency}>Transparent cutout{selected?.hasTransparency ? '' : ' (transparent WebM required)'}</option>
        </select></label>
        <label>Framing<select aria-label="Presenter framing" className="mt-1 w-full rounded bg-surface2 p-2" value={framingMode} onChange={e => {
          const mode = e.target.value;
          if (mode === 'tight' && tight) change({ crop: tight });
          else if (mode === 'chest') change({ crop: { x: 32, y: 2, width: 40, height: 67 } });
          else if (mode === 'full') change({ crop: { x: 0, y: 0, width: 100, height: 100 } });
        }}>
          {tight && <option value="tight">Full body (tight crop / edge-to-edge)</option>}
          <option value="chest">Chest-up (focus on face & torso)</option>
          <option value="full">Full source frame (16:9 canvas with margins)</option>
          {framingMode === 'custom' && <option value="custom">Custom crop</option>}
        </select></label>
        {([['widthPercent', 'Width (%)', 10, 100], ['bottomPercent', 'Bottom space (%)', 0, 70], ['horizontalPercent', 'Horizontal position (% 0=left, 100=right)', 0, 100]] as const).map(([key, label, min, max]) => <div key={key}>
          <label className="block">{label}
            <input aria-label={label} type="number" min={min} max={max} step="0.5" className="mt-1 w-full rounded bg-surface2 p-2" value={value[key]} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n)) change({ [key]: Math.max(min, Math.min(max, n)) }); }} />
          </label>
          {key === 'horizontalPercent' && (
            <div className="mt-1 flex gap-1">
              {[0, 50, 100].map(hp => (
                <button key={hp} type="button" onClick={() => change({ horizontalPercent: hp })} className={`rounded px-1.5 py-0.5 text-[10px] ${value.horizontalPercent === hp ? 'bg-accent text-white font-bold' : 'bg-surface2 text-gray-400 hover:text-white'}`}>
                  {hp === 0 ? 'Left (0%)' : hp === 50 ? 'Center (50%)' : 'Right (100%)'}
                </button>
              ))}
            </div>
          )}
        </div>)}
      </div>
      <details><summary className="cursor-pointer">Adjust crop and silence protection</summary>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tight && <button type="button" onClick={() => change({ crop: tight })} className="rounded bg-surface2 px-2 py-1 text-[11px] text-accent hover:bg-surface2/80 font-medium">Fit to character (tight crop)</button>}
          <button type="button" onClick={() => change({ crop: { x: 32, y: 2, width: 40, height: 67 } })} className="rounded bg-surface2 px-2 py-1 text-[11px] text-gray-300 hover:bg-surface2/80">Chest-up</button>
          <button type="button" onClick={() => change({ crop: { x: 0, y: 0, width: 100, height: 100 } })} className="rounded bg-surface2 px-2 py-1 text-[11px] text-gray-300 hover:bg-surface2/80">Full 16:9 frame</button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">{(['x', 'y', 'width', 'height'] as const).map(key => <label key={key}>Crop {key} (%)<input aria-label={`Presenter crop ${key}`} type="number" min={0} max={100} step="0.5" className="mt-1 w-full rounded bg-surface2 p-2" value={value.crop[key]} onChange={e => {
          const val = Number(e.target.value);
          if (Number.isFinite(val)) updateCropKey(key, val);
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
