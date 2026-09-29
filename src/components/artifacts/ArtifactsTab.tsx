import { useEffect, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { VideoComposition, cardBounds, graphicNames } from '@tubeflow/video-composition';
import type { ArtifactComposition, MotionGraphicSpec } from '@tubeflow/editing-contracts';
import { useEditingProject } from '../../hooks/useEditingProject';
import { editingRequest, type EditingPayload } from '../../services/editingApi';
import { useWorkspaceApi } from '../../services/workspaceApi';
import { GEMINI_MODELS, type Script } from '../../data';

const activeStates = ['queued', 'running', 'cancel_requested'];
const button = 'rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40 hover:bg-amber-300';
const input = 'mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white';
export function ArtifactsTab({ script, onUpdate, editor = false }: { script: Script | null; onUpdate: (patch: Partial<Script>) => unknown; editor?: boolean }) {
  const [model, setModel] = useState('');
  const state = useEditingProject(script?.id, script?.editingProjectId, model || undefined);
  const { data, fetch } = state, { profile } = useWorkspaceApi();
  const [audio, setAudio] = useState(''), [style, setStyle] = useState(''), [density, setDensity] = useState<'subtle' | 'balanced' | 'expressive'>('balanced');
  const [fps, setFps] = useState(60), [busy, setBusy] = useState(false), [frame, setFrame] = useState(0), [selected, setSelected] = useState('');
  const player = useRef<PlayerRef>(null), p = data?.project;
  const job = data?.jobs.filter(j => activeStates.includes(j.state)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const lastJob = data?.jobs.filter(j => j.revisionId === data.currentRevisionId || j.resultRevisionId === data.currentRevisionId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const ready = p?.status === 'ready' || p?.status === 'partial';
  const editable = !!p && p.revisionId === data?.currentRevisionId && !job && !busy;
  useEffect(() => { setAudio(script?.generatedAudio?.[0]?.filename || ''); }, [script?.id]);
  useEffect(() => {
    if (!script?.generatedAudio?.some(a => a.filename === audio)) setAudio(script?.generatedAudio?.[0]?.filename || '');
  }, [script?.generatedAudio, audio]);
  useEffect(() => {
    const instance = player.current;
    if (!instance) return;
    const listener = ({ detail }: { detail: { frame: number } }) => setFrame(detail.frame);
    instance.addEventListener('frameupdate', listener);
    return () => instance.removeEventListener('frameupdate', listener);
  }, [p?.revisionId]);
  async function act(work: () => Promise<unknown>) {
    setBusy(true); state.setError('');
    try { await work(); } catch (error) { state.setError(error instanceof Error ? error.message : 'Motion graphics failed.'); }
    finally { setBusy(false); }
  }
  async function generate() {
    if (!script) return;
    await act(async () => {
      const narration = script.generatedAudio?.find(a => a.filename === audio);
      if (!narration) throw new Error('Select narration first.');
      const inputs = { scriptId: script.id, audioFilename: audio, language: narration.language,
        imageIndexes: (script.generatedImages || []).filter(i => i.status === 'done' && i.url).map(i => i.index),
        aspect: profile === 'shorts' ? '9:16' : '16:9', fps,
        settings: { stylePreference: style, density, maxProviderCalls: 40, maxGeneratedAssets: 0, ...(model ? { aiModel: model } : {}) } };
      const created = await editingRequest<EditingPayload>(fetch, p && data ? `/projects/${p.id}/revisions` : '/projects',
        p && data ? { expectedRevisionId: data.currentRevisionId, inputs } : inputs);
      state.setSelectedRevision(''); state.setProjectId(created.project.id); state.setData(created);
      await onUpdate({ editingProjectId: created.project.id });
      await editingRequest(fetch, `/projects/${created.project.id}/generate`, { expectedRevisionId: created.project.revisionId });
      state.setData(await editingRequest<EditingPayload>(fetch, `/projects/${created.project.id}`));
    });
  }
  const download = data?.jobs.filter(j => j.operation === 'render' && j.state === 'succeeded' && j.outputUrl && j.revisionId === p?.revisionId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!script) return <p className="p-6 text-gray-400">Select a script to create motion graphics.</p>;
  return <div className="space-y-5 p-2 text-gray-200">
    <div className="rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-500/10 to-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Motion studio</p>
      <h2 className="mt-2 text-2xl font-semibold text-white">{editor ? 'Preview & export' : 'Artifacts'}</h2>
      <p className="mt-2 max-w-2xl text-sm text-gray-400">Cinematic titles, character names, location badges and object spotlights, timed to your story.</p>
      <div className="mt-4 flex flex-wrap gap-2">{Object.values(graphicNames).map(name => <span key={name} className="rounded-full border border-amber-300/15 px-3 py-1 text-xs text-amber-100">{name}</span>)}</div>
    </div>
    {state.error && <div role="alert" className="rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-200">{state.error}</div>}
    {!editor && <div className="grid gap-4 rounded-xl border border-border bg-surface p-4 md:grid-cols-2">
      <label className="text-sm">Narration<select className={input} value={audio} onChange={e => setAudio(e.target.value)}>
        <option value="">Select generated narration</option>{script.generatedAudio?.map(a => <option key={a.filename} value={a.filename}>{a.language === 'hi' ? 'Hindi' : 'English'} · {a.voiceName || a.voice || a.filename}</option>)}
      </select></label>
      <label className="text-sm">Graphics & vision model<select aria-label="Visual editing AI model" className={input} value={model} onChange={e => setModel(e.target.value)}>
        <option value="">Server default{state.capabilities?.models?.planner ? ` · ${state.capabilities.models.planner}` : ''}</option>
        {GEMINI_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select></label>
      <label className="text-sm">Graphic density<select className={input} value={density} onChange={e => setDensity(e.target.value as typeof density)}>
        <option value="subtle">Subtle · fewer narrative beats</option><option value="balanced">Balanced</option><option value="expressive">Expressive · more emphasis</option>
      </select></label>
      <label className="text-sm">Frame rate<select className={input} value={fps} onChange={e => setFps(Number(e.target.value))}><option value={60}>60 fps · smooth motion</option><option value={30}>30 fps · faster export</option></select></label>
      <label className="text-sm md:col-span-2">Direction <span className="text-gray-500">(optional)</span><input className={input} value={style} maxLength={2000} onChange={e => setStyle(e.target.value)} placeholder="Emphasize character introductions and important objects" /></label>
      {!!state.capabilities?.missing.length && <div className="text-sm text-amber-200 md:col-span-2">{state.capabilities.missing.join(' ')}</div>}
      <div className="md:col-span-2 flex flex-wrap items-center gap-3">
        <button className={button} disabled={busy || !!job || !state.capabilities?.ready || !audio || !script.generatedImages?.length} onClick={() => void generate()}>Generate motion graphics</button>
        {p && <button className="text-sm text-gray-400 disabled:opacity-40" disabled={!editable} onClick={() => void act(async () => {
          const next = await editingRequest<EditingPayload>(fetch, `/projects/${p.id}/reset`, { expectedRevisionId: data!.currentRevisionId });
          state.setSelectedRevision(''); state.setData(next); setSelected(''); setFrame(0);
        })}>Clear graphics</button>}
      </div>
      <p className="text-xs text-gray-400 md:col-span-2">Generate scene media and narration first. Object spotlights are verified against still images; moving clips use scene graphics. Review the preview before export.</p>
    </div>}
    {!!data?.legacyArtifactCount && <p className="rounded-lg border border-amber-800 p-3 text-sm text-amber-200">This saved revision contains {data.legacyArtifactCount} retired graphics. They are hidden from preview and new exports. Generate motion graphics to replace them; original media and revision history remain available.</p>}
    {job && <div role="status" className="flex items-center justify-between rounded-lg border border-amber-700/50 p-3 text-sm"><span>{job.stage}{job.total ? ` · ${job.completed}/${job.total}` : ''}</span><button className="text-red-300" disabled={job.state === 'cancel_requested'} onClick={() => void act(async () => { await editingRequest(fetch, `/jobs/${job.id}/cancel`, {}); await state.refresh(); })}>{job.state === 'cancel_requested' ? 'Cancelling…' : 'Cancel'}</button></div>}
    {lastJob && !job && ['needs_configuration', 'interrupted', 'failed'].includes(lastJob.state) && <div role="alert" className="rounded-lg border border-amber-800 p-3 text-sm text-amber-100">
      <p>{lastJob.error || 'The graphics job stopped.'}</p><button className="mt-2 underline" disabled={busy} onClick={() => void act(async () => { await editingRequest(fetch, `/jobs/${lastJob.id}/resume`, {}); await state.refresh(); })}>Resume</button>
    </div>}
    {data?.stale && <p className="text-sm text-amber-200">Media or narration changed. Generate a new revision to use the latest inputs.</p>}
    {p && data && <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-3">
        <label className="block text-xs text-gray-400">Preview / export revision<select aria-label="Preview and export revision" className={input} value={state.selectedRevision} onChange={e => state.setSelectedRevision(e.target.value)}><option value="">Current revision</option>{data.revisions.filter(r => r.revisionId !== data.currentRevisionId).map(r => <option key={r.revisionId} value={r.revisionId}>{r.revisionId.slice(0, 8)} · {r.language} · {r.status}</option>)}</select></label>
        <div className="flex justify-center overflow-hidden rounded-xl border border-border bg-black p-2"><Player key={p.revisionId} ref={player} component={VideoComposition} inputProps={{ project: p, assets: data.assets }} durationInFrames={p.inputs.durationFrames} fps={p.inputs.fps} compositionWidth={p.inputs.width} compositionHeight={p.inputs.height} controls style={{ width: '100%', maxWidth: p.inputs.height > p.inputs.width ? 360 : '100%' }} /></div>
        <p className="text-xs text-gray-500">{(frame / p.inputs.fps).toFixed(1)} / {(p.inputs.durationFrames / p.inputs.fps).toFixed(1)} s · {p.inputs.fps} fps</p>
        <div aria-label="Motion graphics timeline" className="space-y-2 rounded-lg border border-border p-3">
          <input aria-label="Timeline playhead" type="range" className="w-full accent-amber-400" min={0} max={p.inputs.durationFrames - 1} value={frame} onChange={e => { setFrame(Number(e.target.value)); player.current?.seekTo(Number(e.target.value)); }} />
          <div className="flex h-8 gap-px">{p.scenes.map((s, i) => <button key={s.id} className="truncate rounded bg-slate-700 text-xs" style={{ width: `${100 * (s.endFrame - s.startFrame) / p.inputs.durationFrames}%` }} onClick={() => player.current?.seekTo(s.startFrame)}>Scene {i + 1}</button>)}</div>
          <div className="relative h-7">{p.artifacts.map(a => <button title={a.intent} key={a.id} className={`absolute h-7 truncate rounded px-1 text-xs ${a.enabled ? 'bg-amber-700' : 'bg-gray-700 opacity-40'}`} style={{ left: `${100 * a.startFrame / p.inputs.durationFrames}%`, width: `${100 * (a.endFrame - a.startFrame) / p.inputs.durationFrames}%` }} onClick={() => { setSelected(a.id); player.current?.seekTo(a.startFrame); }}>{a.graphic?.title}</button>)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-3"><button className={button} disabled={!ready || busy || !!job} onClick={() => void act(async () => { await editingRequest(fetch, `/projects/${p.id}/render`, { revisionId: p.revisionId }); await state.refresh(); })}>Export MP4</button>{download?.outputUrl && <a href={download.outputUrl} download className="text-sm text-amber-300 underline">Download MP4</a>}</div>
        <p className="text-xs text-gray-500">Preview and export use the same graphics, scene media and narration.</p>
      </div>
      <div className="space-y-4">
        {ready && <p role="status" className="text-sm text-amber-100">{p.artifacts.length} graphics · {p.sceneOutcomes?.filter(o => o.state === 'failed').length || 0} skipped scenes</p>}
        {p.scenes.map((scene, index) => <section key={scene.id}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Scene {index + 1}</h3>
          {!p.artifacts.some(a => a.sceneId === scene.id) && <p className="text-xs text-gray-500">{p.sceneOutcomes?.find(o => o.sceneId === scene.id)?.reason || 'Graphics not generated yet.'}</p>}
          {p.artifacts.filter(a => a.sceneId === scene.id && a.graphic).map(a => <GraphicCard key={`${p.revisionId}-${a.id}`} artifact={a} fps={p.inputs.fps} width={p.inputs.width} height={p.inputs.height} busy={!editable} selected={selected === a.id}
            onSelect={() => { setSelected(a.id); player.current?.seekTo(Math.min(a.endFrame - 1, a.startFrame + Math.round(p.inputs.fps * 0.9))); }}
            onSave={patch => act(async () => { state.setData(await editingRequest<EditingPayload>(fetch, `/projects/${p.id}/artifacts/${a.id}`, { expectedRevisionId: p.revisionId, ...patch }, 'PATCH')); })}
            onRegenerate={() => act(async () => { await editingRequest(fetch, `/projects/${p.id}/artifacts/${a.id}/revise`, { expectedRevisionId: p.revisionId, instruction: 'Reconsider this graphic for the same scene. Preserve its supported meaning and verify any spotlight against the actual image.' }); await state.refresh(); })} />)}
        </section>)}
      </div>
    </div>}
    {!!p?.diagnostics.length && <details open={p.status === 'partial'} className="rounded-lg border border-border p-3 text-sm"><summary>{p.diagnostics.length} generation notes</summary><ul className="mt-3 space-y-2">{p.diagnostics.map((d, i) => <li key={i} className={d.severity === 'warning' ? 'text-amber-200' : 'text-gray-400'}>{d.message}</li>)}</ul></details>}
  </div>;
}

type GraphicPatch = { enabled?: boolean; graphic?: MotionGraphicSpec; startFrame?: number; endFrame?: number };
function GraphicCard({ artifact: a, fps, width, height, busy, selected, onSelect, onSave, onRegenerate }: { artifact: ArtifactComposition; fps: number; width: number; height: number; busy: boolean; selected: boolean; onSelect: () => void; onSave: (patch: GraphicPatch) => Promise<unknown>; onRegenerate: () => Promise<unknown> }) {
  const [graphic, setGraphic] = useState(a.graphic!), [start, setStart] = useState(a.startFrame / fps), [end, setEnd] = useState(a.endFrame / fps);
  const dirty = JSON.stringify(graphic) !== JSON.stringify(a.graphic) || Math.round(start * fps) !== a.startFrame || Math.round(end * fps) !== a.endFrame;
  return <div className={`space-y-3 rounded-xl border p-4 ${selected ? 'border-amber-400/70' : 'border-border'} bg-surface`}>
    <button className="text-left" onClick={onSelect}><span className="text-[11px] uppercase tracking-wider text-amber-300">{graphicNames[graphic.kind]}</span><span className="mt-1 block text-sm font-semibold">{a.graphic!.title}</span></button>
    <p className="text-xs text-gray-500">{(a.startFrame / fps).toFixed(1)}–{(a.endFrame / fps).toFixed(1)} s · {a.enabled ? 'Visible' : 'Hidden'}</p>
    <label className="block text-xs text-gray-400">Title<input aria-label="Graphic title" className={input} maxLength={64} value={graphic.title} disabled={busy} onChange={e => setGraphic({ ...graphic, title: e.target.value })} /></label>
    <label className="block text-xs text-gray-400">Detail<textarea aria-label="Graphic detail" className={input} rows={2} maxLength={120} value={graphic.detail} disabled={busy} onChange={e => setGraphic({ ...graphic, detail: e.target.value })} /></label>
    <div className="grid grid-cols-2 gap-2"><label className="text-xs text-gray-400">Start (seconds)<input aria-label="Graphic start" className={input} type="number" min={0} step={0.1} value={start} disabled={busy} onChange={e => setStart(Number(e.target.value))} /></label><label className="text-xs text-gray-400">End (seconds)<input aria-label="Graphic end" className={input} type="number" min={0} step={0.1} value={end} disabled={busy} onChange={e => setEnd(Number(e.target.value))} /></label></div>
    <label className="block text-xs text-gray-400">Card position<select aria-label="Graphic position" className={input} value="" disabled={busy} onChange={e => setGraphic({ ...graphic, bounds: cardBounds(graphic.kind, width, height, e.target.value) })}><option value="" disabled>Choose a position</option><option value="top">Top</option><option value="bottom">Bottom left</option><option value="right">Bottom right</option><option value="center">Center</option></select></label>
    {graphic.target && <p className="text-xs text-gray-400">Target: {graphic.target.label}</p>}
    <div className="flex flex-wrap gap-3 text-xs"><button className="text-amber-300 disabled:opacity-40" disabled={busy || !dirty || !graphic.title.trim() || end <= start} onClick={() => void onSave({ graphic, startFrame: Math.round(start * fps), endFrame: Math.round(end * fps) })}>Save changes</button><button className="text-gray-300 disabled:opacity-40" disabled={busy} onClick={() => void onSave({ enabled: !a.enabled })}>{a.enabled ? 'Hide' : 'Show'}</button><button className="text-gray-300 disabled:opacity-40" disabled={busy} onClick={() => void onRegenerate()}>Regenerate</button><button className="text-gray-300" onClick={onSelect}>Preview</button></div>
  </div>;
}
