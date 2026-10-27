import { useEffect, useMemo, useRef, useState } from 'react';
import { HyperFramesPlayer as Player, type PlayerRef } from './HyperFramesPlayer';
import { cardBounds, graphicNames, motionLibraryTemplate } from '@tubeflow/video-composition';
import { MotionScriptHint, type ArtifactComposition, type MotionGraphicSpec } from '@tubeflow/editing-contracts';
import { useEditingProject } from '../../hooks/useEditingProject';
import { editingRequest, type EditingPayload } from '../../services/editingApi';
import { useWorkspaceApi } from '../../services/workspaceApi';
import { GEMINI_MODELS, type Script } from '../../data';
import { makeStyleTestProject } from './styleTest';
import { GraphicLayoutEditor } from './GraphicLayoutEditor';
import { useDraftHistory } from '../../hooks/useDraftHistory';
import { MotionStylePanel } from './MotionStylePanel';
import { MotionDemoGallery } from './MotionDemoGallery';
import {SELECTIVE_MOTION_DIRECTION,isImageOnlyShorts} from '../../../server/src/services/motion-editorial-policy';

const activeStates = ['queued', 'running', 'cancel_requested'];
const button = 'rounded-xl bg-gradient-to-r from-accent to-[#e11d48] px-4 py-2 text-sm font-semibold text-white shadow-glow transition-all hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:shadow-none';
const input = 'mt-1 w-full rounded-xl border border-border bg-bg/90 px-3 py-2 text-sm text-white outline-none focus:border-accent/60';
export function ArtifactsTab({ script, onUpdate, editor = false }: { script: Script | null; onUpdate: (patch: Partial<Script>) => unknown; editor?: boolean }) {
  const [model, setModel] = useState('');
  const state = useEditingProject(script?.id, script?.editingProjectId || undefined, model || undefined);
  const { data, fetch } = state, { profile } = useWorkspaceApi();
  const imageOnly=isImageOnlyShorts(script || {},profile);
  const hasMotionPlan=!!script?.scenePlan?.scenes.some(scene=>scene.motionGraphics?.some(raw=>{
    const parsed=MotionScriptHint.safeParse(raw);
    return parsed.success&&!!parsed.data.templateId&&(parsed.data.templateId==='custom'||!!motionLibraryTemplate(parsed.data.templateId));
  }));
  const [audio, setAudio] = useState(''), [style, setStyle] = useState(''), [density, setDensity] = useState<'subtle' | 'balanced' | 'expressive'>('subtle');
  const [documentary, setDocumentary] = useState(true), [visualReview, setVisualReview] = useState(true);
  const [engine, setEngine] = useState<'generative' | 'directed'>('generative');
  const [motionLevel, setMotionLevel] = useState<'subtle' | 'balanced' | 'expressive' | 'still'>('balanced');
  const [soundDesign, setSoundDesign] = useState<'off' | 'subtle' | 'balanced' | 'expressive'>('subtle');
  const [treatment, setTreatment] = useState<'auto' | 'archival' | 'cinematic' | 'map'>('auto');
  const [fps, setFps] = useState(60), [busy, setBusy] = useState(false), [frame, setFrame] = useState(0), [selected, setSelected] = useState('');
  const [showStyleTest, setShowStyleTest] = useState(false);
  const [editLayout, setEditLayout] = useState(false), [loopSceneId, setLoopSceneId] = useState('');
  const draftHistory = useDraftHistory<{ revisionId: string; artifact: ArtifactComposition }>();
  const draft = draftHistory.value;
  const resetDraft = draftHistory.reset;
  const narrationScript = useRef(script?.id);
  const player = useRef<PlayerRef>(null), p = data?.project;
  const draftArtifact = draft?.revisionId === p?.revisionId ? draft?.artifact : undefined;
  const hasDraft = !!draftArtifact && JSON.stringify(draftArtifact) !== JSON.stringify(p?.artifacts.find(a => a.id === draftArtifact.id));
  const styleTest = useMemo(() => p ? makeStyleTestProject(p) : null, [p]);
  const previewProject = useMemo(() => showStyleTest && styleTest ? styleTest.project : p && draftArtifact
    ? { ...p, artifacts: p.artifacts.map(a => a.id === draftArtifact.id ? draftArtifact : a) } : p, [showStyleTest, styleTest, p, draftArtifact]);
  const selectedArtifact = previewProject?.artifacts.find(a => a.id === selected && a.graphic?.kind !== 'caption');
  const currentScene = p?.scenes.find(s => frame >= s.startFrame && frame < s.endFrame) || p?.scenes[0];
  const loopScene = !showStyleTest ? p?.scenes.find(s => s.id === loopSceneId && s.endFrame - s.startFrame > 1) : undefined;
  const previewAssets = data?.assets;
  const previewProps = useMemo(() => previewProject && previewAssets ? { project: previewProject, assets: previewAssets, audioPreviewUrl: showStyleTest || hasDraft ? undefined : data?.audioPreviewUrl } : undefined, [previewProject, previewAssets, showStyleTest, hasDraft, data?.audioPreviewUrl]);
  const previewStyle = { width: '100%', maxWidth: p && p.inputs.height > p.inputs.width ? 360 : '100%' };
  const job = data?.jobs.filter(j => activeStates.includes(j.state)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const lastJob = data?.jobs.filter(j => j.revisionId === data.currentRevisionId || j.resultRevisionId === data.currentRevisionId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const ready = p?.status === 'ready' || p?.status === 'partial';
  const editable = !!p && p.revisionId === data?.currentRevisionId && !job && !busy;
  const oldPlanningFailures = p?.diagnostics.filter(d => d.code === 'GRAPHIC_SKIPPED' && d.message.includes('Graphics planning failed after the allowed attempts.')) || [];
  const diagnostics = (p?.diagnostics.filter(d => !oldPlanningFailures.includes(d)) || []).concat(oldPlanningFailures.length ? [{
    ...oldPlanningFailures[0], message: `An earlier graphics planning attempt failed for ${oldPlanningFailures.length} scenes. Select the current Gemini model and generate a new revision.`,
  }] : []);
  useEffect(() => {
    if (p?.settings.aiModel && GEMINI_MODELS.some(item => item.id === p.settings.aiModel))
      setModel(p.settings.aiModel);
    if (p) {
      setDocumentary(p.settings.documentary ?? true);
      setVisualReview(p.settings.visualReview ?? true);
      setTreatment(p.settings.treatment ?? 'auto');
      setEngine(imageOnly||hasMotionPlan?'generative':p.settings.graphicEngine ?? 'directed');
      setMotionLevel(p.settings.motionLevel ?? 'balanced');
      setSoundDesign(p.settings.soundDesign ?? 'subtle');
    }
  }, [p,imageOnly,hasMotionPlan]);
  useEffect(()=>{
    setStyle(script?.autoPilotSettings?.graphics.style || p?.settings.stylePreference || SELECTIVE_MOTION_DIRECTION);
    setDensity(script?.autoPilotSettings?.graphics.density || p?.settings.density || 'subtle');
    if(imageOnly)setEngine('generative');
  },[script?.id,script?.autoPilotSettings?.graphics.style,script?.autoPilotSettings?.graphics.density,p?.id,imageOnly]);
  useEffect(() => { if (p?.inputs.fps) setFps(p.inputs.fps); }, [p?.id, p?.inputs.fps]);
  useEffect(() => { setShowStyleTest(false); resetDraft(); setEditLayout(false); }, [p?.revisionId, resetDraft]);
  useEffect(() => { setFrame(0); setLoopSceneId(''); setSelected(''); }, [p?.id]);
  useEffect(() => {
    if (narrationScript.current !== script?.id || !script?.generatedAudio?.some(a => a.filename === audio)) setAudio(script?.generatedAudio?.[0]?.filename || '');
    narrationScript.current = script?.id;
  }, [script?.id, script?.generatedAudio, audio]);
  useEffect(() => {
    const instance = player.current;
    if (!instance) return;
    const listener = ({ detail }: { detail: { frame: number } }) => setFrame(detail.frame);
    instance.addEventListener('timeupdate', listener);
    instance.addEventListener('seeked', listener);
    return () => { instance.removeEventListener('timeupdate', listener); instance.removeEventListener('seeked', listener); };
  }, [p?.revisionId, showStyleTest]);
  const undoDraft = draftHistory.undo, redoDraft = draftHistory.redo;
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!editable || showStyleTest || event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      const element = event.target as HTMLElement | null;
      if (element?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redoDraft(); else undoDraft(); }
      else if (event.key.toLowerCase() === 'y') { event.preventDefault(); redoDraft(); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [editable, showStyleTest, undoDraft, redoDraft]);
  async function act(work: () => Promise<unknown>) {
    setBusy(true); state.setError('');
    try { await work(); } catch (error) { state.setError(error instanceof Error ? error.message : 'Motion graphics failed.'); }
    finally { setBusy(false); }
  }
  function seekTo(nextFrame: number) {
    const scene = p?.scenes.find(s => nextFrame >= s.startFrame && nextFrame < s.endFrame);
    if (loopSceneId && scene) setLoopSceneId(scene.id);
    setFrame(nextFrame); player.current?.seekTo(nextFrame);
  }
  function selectGraphic(artifact: ArtifactComposition) {
    if (hasDraft && draftArtifact?.id !== artifact.id) { state.setError('Save or discard your graphic changes before selecting another graphic.'); return; }
    setSelected(artifact.id);
    seekTo(Math.min(artifact.endFrame - 1, artifact.startFrame + Math.round((p?.inputs.fps || 30) * 0.9)));
  }
  function changeArtifact(artifact: ArtifactComposition) {
    if (!p) return;
    player.current?.pause(); setSelected(artifact.id); draftHistory.update({ revisionId: p.revisionId, artifact }, artifact.id);
    state.setError('');
    if (frame < artifact.startFrame || frame >= artifact.endFrame) {
      seekTo(Math.min(artifact.endFrame - 1, artifact.startFrame + Math.round(p.inputs.fps * 0.9)));
    }
  }
  async function saveArtifact(artifact: ArtifactComposition, patch: GraphicPatch) {
    if (!p) return;
    await act(async () => {
      state.setData(await editingRequest<EditingPayload>(fetch, `/projects/${p.id}/artifacts/${artifact.id}`, { expectedRevisionId: p.revisionId, ...patch }, 'PATCH'));
    });
  }
  async function generate(mode: 'graphics' | 'captions') {
    if (!script) return;
    await act(async () => {
      if(mode==='graphics' && script.autoPilotSettings) await onUpdate({autoPilotSettings:{...script.autoPilotSettings,graphics:{...script.autoPilotSettings.graphics,style,density}}});
      const narration = script.generatedAudio?.find(a => a.filename === audio);
      if (!narration) throw new Error('Select narration first.');
      const inputs = { scriptId: script.id, audioFilename: audio, language: narration.language,
        imageIndexes: (script.generatedImages || []).filter(i => i.status === 'done' && i.url).map(i => i.index),
        aspect: profile === 'shorts' ? '9:16' : '16:9', fps,
        settings: { stylePreference: style, density, documentary, treatment, visualReview, graphicEngine: engine, motionLevel, soundDesign, maxProviderCalls: 40, maxGeneratedAssets: 3, ...(model ? { aiModel: model } : {}) } };
      const reuse = mode === 'captions' && p && data && !data.stale && p.revisionId === data.currentRevisionId &&
        p.inputs.audioFilename === audio && p.inputs.fps === fps && p.inputs.width === (profile === 'shorts' ? 1080 : 1920) &&
        p.inputs.imageAssets.map(i => i.promptIndex).join(',') === inputs.imageIndexes.join(',');
      const created = reuse ? data : await editingRequest<EditingPayload>(fetch, p && data ? `/projects/${p.id}/revisions` : '/projects',
        p && data ? { expectedRevisionId: data.currentRevisionId, inputs } : inputs);
      state.setSelectedRevision(''); state.setProjectId(created.project.id); state.setData(created);
      await onUpdate({ editingProjectId: created.project.id });
      if (mode === 'captions') {
        state.setData(await editingRequest<EditingPayload>(fetch, `/projects/${created.project.id}/captions`, { expectedRevisionId: created.project.revisionId }));
      } else {
        await editingRequest(fetch, `/projects/${created.project.id}/generate`, { expectedRevisionId: created.project.revisionId });
        state.setData(await editingRequest<EditingPayload>(fetch, `/projects/${created.project.id}`));
      }
    });
  }
  const download = data?.jobs.filter(j => j.operation === 'render' && j.state === 'succeeded' && j.outputUrl && j.revisionId === p?.revisionId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!script) return <div className="space-y-4 p-2"><MotionDemoGallery /><p className="p-4 text-gray-400">Select a script to create motion graphics.</p></div>;
  return <div className="space-y-6 p-2 text-gray-200">
    <div className="rounded-2xl border border-border/80 bg-gradient-to-br from-surface to-surface2 p-6 shadow-card backdrop-blur-md">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Motion Studio</p>
      <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">{editor ? 'Preview & Export' : 'Motion Artifacts'}</h2>
      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">Original motion designs, readable explanations, narration-aware sound, and rendered review.</p>
      <div className="mt-4 flex flex-wrap gap-2">{Object.values(graphicNames).map(name => <span key={name} className="rounded-lg border border-border bg-surface2/60 px-3 py-1 text-xs font-medium text-gray-300">{name}</span>)}</div>
    </div>
    <MotionDemoGallery />
    {state.error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-950/30 p-3.5 text-sm text-red-200">{state.error}</div>}
    <details open={!editor || !p} className="rounded-2xl border border-border/80 bg-surface/90 shadow-card">
    <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-white">Choose narration &amp; let AI plan motion graphics</summary>
    <div className="grid gap-4 p-5 md:grid-cols-2">
      <label className="text-xs font-semibold text-gray-300">Narration<select className={input} value={audio} onChange={e => setAudio(e.target.value)}>
        <option value="">Select generated narration</option>{script.generatedAudio?.map(a => <option key={a.filename} value={a.filename}>{a.language === 'hi' ? 'Hindi' : 'English'} · {a.voiceName || a.voice || a.filename}</option>)}
      </select></label>
      <label className="text-xs font-semibold text-gray-300">Graphics &amp; vision model<select aria-label="Visual editing AI model" className={input} value={model} onChange={e => setModel(e.target.value)}>
        <option value="">Server default{state.capabilities?.models?.planner ? ` · ${state.capabilities.models.planner}` : ''}</option>
        {GEMINI_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select></label>
      <label className="text-xs font-semibold text-gray-300">Graphic density<select className={input} value={density} onChange={e => setDensity(e.target.value as typeof density)}>
        <option value="subtle">Subtle · fewer narrative beats</option><option value="balanced">Balanced</option><option value="expressive">Expressive · more emphasis</option>
      </select></label>
      <label className="text-xs font-semibold text-gray-300">Frame rate<select className={input} value={fps} onChange={e => setFps(Number(e.target.value))}><option value={60}>60 fps · smooth motion</option><option value={30}>30 fps · faster export</option></select></label>
      <label className="text-xs font-semibold text-gray-300">Composition style<select aria-label="Composition style" className={input} value={engine} disabled={imageOnly||hasMotionPlan} onChange={e => setEngine(e.target.value as typeof engine)}>
        <option value="generative">Adaptive library &amp; original compositions</option><option value="directed">Directed sequences &amp; source images</option>
      </select></label>
      {(imageOnly||hasMotionPlan) && <p className="text-xs text-gray-400 md:col-span-2">AI uses the script’s motion plan and the full template library, then checks narration timing and open space in the footage. Unsuitable graphics are skipped; saved artifacts are used for export.</p>}
      <label className="text-xs font-semibold text-gray-300">Motion feel<select aria-label="Motion feel" className={input} value={motionLevel} onChange={e => setMotionLevel(e.target.value as typeof motionLevel)}>
        <option value="subtle">Calm &amp; restrained</option><option value="balanced">Balanced</option><option value="expressive">Expressive</option><option value="still">Still · no animation</option>
      </select></label>
      <label className="text-xs font-semibold text-gray-300">Sound design<select aria-label="Sound design" className={input} value={soundDesign} onChange={e => setSoundDesign(e.target.value as typeof soundDesign)}>
        <option value="off">Off</option><option value="subtle">Subtle · narration first</option><option value="balanced">Balanced</option><option value="expressive">Expressive</option>
      </select></label>
      <label className="text-xs font-semibold text-gray-300">Visual treatment<select aria-label="Documentary treatment" className={input} value={treatment} onChange={e => setTreatment(e.target.value as typeof treatment)} disabled={engine !== 'directed' || !documentary}>
        <option value="auto">Automatic · combine treatments</option><option value="archival">Archival collage</option><option value="cinematic">Cinematic images</option><option value="map">Map focus · requires a source map</option>
      </select></label>
      <div className="space-y-3 self-center text-xs text-gray-300">
        <label className="flex items-center gap-2"><input aria-label="Image-led documentary visuals" type="checkbox" disabled={engine !== 'directed'} checked={documentary} onChange={e => setDocumentary(e.target.checked)} />Directed visual sequences</label>
        <label className="flex items-center gap-2"><input aria-label="Review rendered placement" type="checkbox" checked={visualReview} onChange={e => setVisualReview(e.target.checked)} />AI checks rendered placement and repairs layout</label>
      </div>
      {p && (p.settings.motionLevel !== motionLevel || p.settings.soundDesign !== soundDesign) && <button className="text-left text-xs text-sky-300 disabled:opacity-40" disabled={!editable || hasDraft} onClick={() => void act(async () => {
        state.setData(await editingRequest<EditingPayload>(fetch, `/projects/${p.id}/preferences`, { expectedRevisionId: p.revisionId, motionLevel, soundDesign }));
      })}>Apply motion &amp; sound to this project</button>}
      <label className="text-xs font-semibold text-gray-300 md:col-span-2">Direction <span className="text-faint font-normal">(optional)</span><input className={input} value={style} maxLength={2000} onChange={e => setStyle(e.target.value)} placeholder="Keep footage full-bleed; explain scale and mechanisms with purposeful sequences" /></label>
      {!!state.capabilities?.missing.length && <div className="text-xs text-amber-300 md:col-span-2">{state.capabilities.missing.join(' ')}</div>}
      <div className="md:col-span-2 flex flex-wrap items-center gap-3 pt-2">
        <button className={button} disabled={hasDraft || busy || !!job || !state.capabilities?.ready || !audio || !script.generatedImages?.length} onClick={() => void generate('graphics')}>Generate Motion Graphics</button>
        <button className="rounded-xl border border-sky-400/50 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-400/20 disabled:opacity-40 transition-all" disabled={hasDraft || busy || !!job || !audio || !script.generatedImages?.length} onClick={() => void generate('captions')}>Create Motion Captions</button>
        {p?.artifacts.some(a => a.graphic?.kind === 'caption') && <button className="text-xs font-medium text-sky-300 hover:text-sky-200 disabled:opacity-40" disabled={!editable || hasDraft} onClick={() => void act(async () => { state.setData(await editingRequest<EditingPayload>(fetch, `/projects/${p.id}/captions/clear`, { expectedRevisionId: data!.currentRevisionId })); })}>Remove Captions</button>}
        {p && <button className="text-xs font-medium text-muted hover:text-white disabled:opacity-40" disabled={!editable || hasDraft} onClick={() => void act(async () => {
          const next = await editingRequest<EditingPayload>(fetch, `/projects/${p.id}/graphics/clear`, { expectedRevisionId: data!.currentRevisionId });
          state.setSelectedRevision(''); state.setData(next); setSelected(''); setFrame(0);
        })}>Clear Graphics</button>}
      </div>
      <p className="text-[11px] leading-relaxed text-muted md:col-span-2">AI chooses an adaptive family or original composition from the narration, script hints and actual scene media. Ordinary footage stays clean. Preview the checked result here, then export the saved composition.</p>
    </div></details>
    {!!data?.legacyArtifactCount && <p className="rounded-lg border border-amber-800 p-3 text-sm text-amber-200">This saved revision contains {data.legacyArtifactCount} retired graphics. They are hidden from preview and new exports. Generate motion graphics to replace them; original media and revision history remain available.</p>}
    {job && <div role="status" className="flex items-center justify-between rounded-lg border border-amber-700/50 p-3 text-sm"><span>{job.stage}{job.total ? ` · ${job.completed}/${job.total}` : ''}</span><button className="text-red-300" disabled={job.state === 'cancel_requested'} onClick={() => void act(async () => { await editingRequest(fetch, `/jobs/${job.id}/cancel`, {}); await state.refresh(); })}>{job.state === 'cancel_requested' ? 'Cancelling…' : 'Cancel'}</button></div>}
    {lastJob && !job && ['needs_configuration', 'interrupted', 'failed'].includes(lastJob.state) && <div role="alert" className="rounded-lg border border-amber-800 p-3 text-sm text-amber-100">
      <p>{lastJob.error || 'The graphics job stopped.'}</p><button className="mt-2 underline" disabled={busy} onClick={() => void act(async () => { await editingRequest(fetch, `/jobs/${lastJob.id}/resume`, {}); await state.refresh(); })}>Resume</button>
    </div>}
    {data?.stale && <p className="text-sm text-amber-200">Media or narration changed. Generate a new revision to use the latest inputs.</p>}
    {!editor && oldPlanningFailures.length > 0 && <p role="alert" className="rounded-lg border border-amber-800 p-3 text-sm text-amber-100">The earlier planning attempt used {p?.settings.aiModel || 'a Gemini model'} and failed. Select the current server default above, then click Generate motion graphics to create a new revision.</p>}
    {p && data && <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-3">
        <MotionStylePanel key={p.id} project={p} disabled={!editable || hasDraft || showStyleTest} onApply={state.setData} />
        <label className="block text-xs text-gray-400">Preview / export revision<select aria-label="Preview and export revision" className={input} disabled={hasDraft || busy || !!job} value={state.selectedRevision} onChange={e => state.setSelectedRevision(e.target.value)}><option value="">Current revision</option>{data.revisions.filter(r => r.revisionId !== data.currentRevisionId).map(r => <option key={r.revisionId} value={r.revisionId}>{r.revisionId.slice(0, 8)} · {r.language} · {r.status}</option>)}</select></label>
        <div className="flex flex-wrap items-center gap-3"><button type="button" className={button} disabled={!styleTest || hasDraft || busy || !!job} onClick={() => { setShowStyleTest(value => !value); setEditLayout(false); setLoopSceneId(''); setFrame(0); }}>{showStyleTest ? 'Exit style test' : 'Test all 4 graphic types'}</button>{!styleTest && <span className="text-xs text-amber-200">The test needs four scenes and a verified object spotlight.</span>}</div>
        {showStyleTest && styleTest && <div role="status" className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-100"><p>Style test preview only. Demo labels are added locally; the saved revision and Export MP4 stay unchanged.</p><div className="mt-2 flex flex-wrap gap-2">{styleTest.samples.map(sample => <button type="button" aria-label={`Preview ${graphicNames[sample.kind]}`} key={sample.kind} className="rounded border border-amber-300/50 px-2 py-1" onClick={() => player.current?.seekTo(sample.frame)}>{graphicNames[sample.kind]}</button>)}</div></div>}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3 text-xs">
          <label>Preview scene<select aria-label="Preview scene" className={input} disabled={showStyleTest} value={currentScene?.id || ''} onChange={e => { const scene = p.scenes.find(s => s.id === e.target.value); if (scene) seekTo(scene.startFrame); }}>{p.scenes.map((scene, index) => <option key={scene.id} value={scene.id}>Scene {index + 1} · {((scene.endFrame - scene.startFrame) / p.inputs.fps).toFixed(1)} s</option>)}</select></label>
          <button type="button" aria-label="Loop scene" aria-pressed={!!loopScene} className="rounded-lg border border-sky-400/50 px-3 py-2 text-sky-200 disabled:opacity-40" disabled={showStyleTest || !currentScene || currentScene.endFrame - currentScene.startFrame < 2} onClick={() => { player.current?.pause(); setLoopSceneId(loopScene ? '' : currentScene!.id); if (!loopScene) seekTo(currentScene!.startFrame); }}>{loopScene ? 'Stop scene loop' : 'Loop this scene'}</button>
          <button type="button" aria-label="Edit graphic layout" aria-pressed={editLayout} className="rounded-lg border border-amber-400/50 px-3 py-2 text-amber-200 disabled:opacity-40" disabled={!editable || showStyleTest || !selectedArtifact?.enabled} onClick={() => { player.current?.pause(); setEditLayout(value => !value); if (!editLayout && selectedArtifact) selectGraphic(selectedArtifact); }}>{editLayout ? 'Finish layout editing' : selectedArtifact?.sceneGraph ? 'Move composition' : 'Drag & resize graphic'}</button>
          {!selectedArtifact && <span className="text-gray-400">Select a graphic to edit its layout.</span>}
        </div>
        <div className="flex justify-center overflow-hidden rounded-xl border border-border bg-black p-2"><div className="relative" style={{ ...previewStyle, aspectRatio: `${p.inputs.width} / ${p.inputs.height}` }}>
          <Player key={`${p.revisionId}-${showStyleTest ? 'style-test' : 'saved'}`} ref={player} inputProps={previewProps!} durationInFrames={p.inputs.durationFrames} fps={p.inputs.fps} compositionWidth={p.inputs.width} compositionHeight={p.inputs.height} controls loop={!!loopScene} inFrame={loopScene?.startFrame} outFrame={loopScene ? loopScene.endFrame - 1 : undefined} initialFrame={Math.max(loopScene?.startFrame || 0, Math.min(frame, loopScene ? loopScene.endFrame - 1 : p.inputs.durationFrames - 1))} moveToBeginningWhenEnded={false} allowFullscreen={!editLayout} style={{ width: '100%', height: '100%' }} />
          {editLayout && editable && !showStyleTest && selectedArtifact && selectedArtifact.enabled && frame >= selectedArtifact.startFrame && frame < selectedArtifact.endFrame && <GraphicLayoutEditor graphic={selectedArtifact.graphic || { bounds: selectedArtifact.sceneGraph!.bounds, title: selectedArtifact.intent }} resizable={!selectedArtifact.sceneGraph} width={p.inputs.width} height={p.inputs.height} onPause={() => player.current?.pause()} onChange={bounds => changeArtifact(selectedArtifact.sceneGraph ? { ...selectedArtifact, sceneGraph: { ...selectedArtifact.sceneGraph, bounds } } : { ...selectedArtifact, graphic: { ...selectedArtifact.graphic!, bounds } })} />}
        </div></div>
        {editLayout && <p className="text-xs text-amber-200">Drag to move the graphic. Arrow keys move it; Shift moves 10 pixels. Image graphics also have resize handles. The dashed boundary marks the safe area.</p>}
        <div className="flex gap-3 text-xs"><button type="button" aria-label="Undo graphic edit" className="rounded-lg border border-border px-3 py-2 disabled:opacity-40" disabled={!editable || !draftHistory.canUndo} onClick={draftHistory.undo}>Undo</button><button type="button" aria-label="Redo graphic edit" className="rounded-lg border border-border px-3 py-2 disabled:opacity-40" disabled={!editable || !draftHistory.canRedo} onClick={draftHistory.redo}>Redo</button><span className="self-center text-gray-400">Draft edit history · saving starts a new history</span></div>
        {hasDraft && draftArtifact && <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-100"><span>Unsaved graphic changes · preview only</span><button type="button" className="underline disabled:opacity-40" disabled={!editable || (!draftArtifact.sceneGraph && !draftArtifact.graphic?.title.trim()) || draftArtifact.endFrame <= draftArtifact.startFrame} onClick={() => void saveArtifact(draftArtifact, { graphic: draftArtifact.graphic, sceneGraph: draftArtifact.sceneGraph, startFrame: draftArtifact.startFrame, endFrame: draftArtifact.endFrame })}>Save graphic</button><button type="button" className="underline" disabled={busy} onClick={draftHistory.reset}>Discard changes</button></div>}
        <p className="text-xs text-gray-500">{(frame / p.inputs.fps).toFixed(1)} / {(p.inputs.durationFrames / p.inputs.fps).toFixed(1)} s · {p.inputs.fps} fps</p>
        <div aria-label="Motion graphics timeline" className="space-y-2 rounded-lg border border-border p-3">
          <input aria-label="Timeline playhead" type="range" className="w-full accent-amber-400" min={0} max={p.inputs.durationFrames - 1} value={frame} onChange={e => seekTo(Number(e.target.value))} />
          <div className="flex h-8 gap-px">{p.scenes.map((s, i) => <button key={s.id} className="truncate rounded bg-slate-700 text-xs" style={{ width: `${100 * (s.endFrame - s.startFrame) / p.inputs.durationFrames}%` }} onClick={() => seekTo(s.startFrame)}>Scene {i + 1}</button>)}</div>
          <div className="relative h-7">{previewProject?.artifacts.filter(a => a.graphic?.kind !== 'caption').map(a => <button title={a.intent} key={a.id} className={`absolute h-7 truncate rounded px-1 text-xs ${a.enabled ? 'bg-amber-700' : 'bg-gray-700 opacity-40'}`} style={{ left: `${100 * a.startFrame / p.inputs.durationFrames}%`, width: `${100 * (a.endFrame - a.startFrame) / p.inputs.durationFrames}%` }} onClick={() => selectGraphic(a)}>{a.graphic?.title || a.intent}</button>)}</div>
          {previewProject?.artifacts.some(a => a.graphic?.kind === 'caption') && <div aria-label="Motion captions timeline" className="relative h-5">{previewProject.artifacts.filter(a => a.graphic?.kind === 'caption').map(a => <button aria-label={`Caption: ${a.graphic?.title}`} title={a.graphic?.title} key={a.id} className={`absolute h-5 rounded ${a.enabled ? 'bg-sky-600' : 'bg-gray-700 opacity-40'}`} style={{ left: `${100 * a.startFrame / p.inputs.durationFrames}%`, width: `${Math.max(0.2, 100 * (a.endFrame - a.startFrame) / p.inputs.durationFrames)}%` }} onClick={() => seekTo(a.startFrame)} />)}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-3"><button className={button} disabled={hasDraft || !ready || busy || !!job} onClick={() => void act(async () => { await editingRequest(fetch, `/projects/${p.id}/render`, { revisionId: p.revisionId }); await state.refresh(); })}>Export MP4</button>
          <button className="text-sm text-sky-300 disabled:opacity-40" disabled={hasDraft || !editable || !state.capabilities?.ready || !p.artifacts.some(a => a.enabled && a.graphic?.kind !== 'caption')} onClick={() => void act(async () => { await editingRequest(fetch, `/projects/${p.id}/review`, { expectedRevisionId: p.revisionId }); await state.refresh(); })}>Review placement</button>
          {download?.outputUrl && <a href={download.outputUrl} download className="text-sm text-amber-300 underline">Download MP4</a>}</div>
        <p className="text-xs text-gray-500">Original compositions use the same frame renderer and audio mix in preview and export. Cue timing: {p.alignment.mode === 'word' ? 'word aligned' : p.alignment.mode === 'phrase' ? 'phrase aligned' : 'approximate · graphics start with the scene'}.</p>
        <div className="flex flex-wrap items-center gap-3 text-xs"><button type="button" className="rounded-lg border border-sky-400/40 px-3 py-2 text-sky-200 disabled:opacity-40" disabled={!editable || hasDraft || !state.capabilities?.wordAlignment?.ready || p.alignment.mode === 'word'} onClick={() => void act(async () => { await editingRequest(fetch, `/projects/${p.id}/align`, { expectedRevisionId: p.revisionId }); await state.refresh(); })}>Align spoken words</button><span className="text-gray-400">{state.capabilities?.wordAlignment?.message || 'Checking local speech alignment…'} Existing motion captions are retimed after alignment; regenerate graphics to use the new cues.</span></div>
      </div>
      <div className="space-y-4">
        {ready && <p role="status" className="text-sm text-amber-100">{p.artifacts.filter(a => a.graphic?.kind !== 'caption').length} graphics · {p.artifacts.filter(a => a.graphic?.kind === 'caption').length} captions · {p.sceneOutcomes?.filter(o => o.state === 'failed').length || 0} skipped scenes</p>}
        {p.scenes.map((scene, index) => <section key={scene.id}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Scene {index + 1}</h3>
          {!p.artifacts.some(a => a.sceneId === scene.id && a.graphic?.kind !== 'caption') && <p className="text-xs text-gray-500">{p.sceneOutcomes?.find(o => o.sceneId === scene.id)?.reason || 'No extra graphic is needed for this scene.'}</p>}
          {p.artifacts.filter(a => a.sceneId === scene.id && a.graphic?.kind !== 'caption').map(a => a.sceneGraph ? <GraphCard key={`${p.revisionId}-${a.id}`} artifact={a} value={draftArtifact?.id === a.id ? draftArtifact : a} fps={p.inputs.fps} busy={!editable || showStyleTest || (hasDraft && draftArtifact?.id !== a.id)} selected={selected === a.id} onSelect={() => selectGraphic(a)} onChange={changeArtifact} onSave={patch => saveArtifact(a, patch)} onRegenerate={instruction => act(async () => { await editingRequest(fetch, `/projects/${p.id}/artifacts/${a.id}/revise`, { expectedRevisionId: p.revisionId, instruction: instruction || "Improve the visual hierarchy and pacing" }); await state.refresh(); })} /> : <GraphicCard key={`${p.revisionId}-${a.id}`} artifact={a} value={draftArtifact?.id === a.id ? draftArtifact : a} sceneStart={scene.startFrame} sceneEnd={scene.endFrame} fps={p.inputs.fps} width={p.inputs.width} height={p.inputs.height} busy={!editable || showStyleTest || (hasDraft && draftArtifact?.id !== a.id)} selected={selected === a.id}
            onSelect={() => selectGraphic(draftArtifact?.id === a.id ? draftArtifact : a)} onChange={changeArtifact}
            onSave={patch => saveArtifact(a, patch)}
            onRegenerate={instruction => act(async () => { await editingRequest(fetch, `/projects/${p.id}/artifacts/${a.id}/revise`, { expectedRevisionId: p.revisionId, instruction: instruction.trim() || 'Reconsider this graphic for the same scene. Preserve its supported meaning and verify any target against the actual image.' }); await state.refresh(); })} />)}
          {p.artifacts.some(a => a.sceneId === scene.id && a.graphic?.kind === 'caption') && <p className="text-xs text-sky-300">{p.artifacts.filter(a => a.sceneId === scene.id && a.graphic?.kind === 'caption').length} motion captions</p>}
        </section>)}
      </div>
    </div>}
    {!!diagnostics.length && <details open={p?.status === 'partial'} className="rounded-lg border border-border p-3 text-sm"><summary>{diagnostics.length} generation notes</summary><ul className="mt-3 space-y-2">{diagnostics.map((d, i) => <li key={i} className={d.severity === 'warning' ? 'text-amber-200' : 'text-gray-400'}>{d.message}</li>)}</ul></details>}
  </div>;
}

type GraphicPatch = { enabled?: boolean; sceneGraph?: ArtifactComposition['sceneGraph']; graphic?: MotionGraphicSpec; startFrame?: number; endFrame?: number };
function GraphicCard({ artifact: a, value, sceneStart, sceneEnd, fps, width, height, busy, selected, onSelect, onChange, onSave, onRegenerate }: { artifact: ArtifactComposition; value: ArtifactComposition; sceneStart: number; sceneEnd: number; fps: number; width: number; height: number; busy: boolean; selected: boolean; onSelect: () => void; onChange: (value: ArtifactComposition) => void; onSave: (patch: GraphicPatch) => Promise<unknown>; onRegenerate: (instruction: string) => Promise<unknown> }) {
  const graphic = value.graphic!, start = value.startFrame / fps, end = value.endFrame / fps;
  const setGraphic = (next: MotionGraphicSpec) => onChange({ ...value, graphic: next });
  const editorial = graphic.composition?.editorial;
  const setEditorial = (patch: Partial<NonNullable<typeof editorial>>) => editorial && setGraphic({ ...graphic,
    composition: { ...graphic.composition!, editorial: { ...editorial, ...patch } } });
  const [instruction, setInstruction] = useState('');
  const dirty = JSON.stringify(graphic) !== JSON.stringify(a.graphic) || Math.round(start * fps) !== a.startFrame || Math.round(end * fps) !== a.endFrame;
  const position = ['top', 'bottom', 'right', 'center'].find(value => JSON.stringify(cardBounds(graphic.kind, width, height, value)) === JSON.stringify(graphic.bounds)) || 'custom';
  return <div className={`space-y-3 rounded-xl border p-4 ${selected ? 'border-amber-400/70' : 'border-border'} bg-surface`}>
    <button className="text-left" onClick={onSelect}><span className="text-[11px] uppercase tracking-wider text-amber-300">{graphicNames[graphic.kind]}</span><span className="mt-1 block text-sm font-semibold">{a.graphic!.title}</span></button>
    <p className="text-xs text-gray-500">{(a.startFrame / fps).toFixed(1)}–{(a.endFrame / fps).toFixed(1)} s · {a.enabled ? 'Visible' : 'Hidden'}</p>
    <p className={`text-xs ${a.visualReview?.status === 'passed' ? 'text-emerald-300' : 'text-amber-200'}`} title={a.visualReview?.reason}>
      {a.visualReview?.status === 'passed' ? `Placement checked · ${a.visualReview.frames.length} frames` : a.visualReview?.status === 'rejected' ? 'Placement rejected · hidden' : 'Placement has not passed review'}
    </p>
    {graphic.composition && <p className="text-xs text-gray-400">{editorial ? `Directed ${editorial.template} sequence` : `${graphic.composition.treatment} · ${graphic.composition.layers.length} image layers`}</p>}
    {editorial && <div className="space-y-3 rounded-lg border border-border p-3">
      <label className="block text-xs text-gray-400">Headline<input aria-label="Sequence headline" className={input} maxLength={64} value={editorial.headline} disabled={busy} onChange={e => setEditorial({ headline: e.target.value })} /></label>
      <label className="block text-xs text-gray-400">Context<input aria-label="Sequence context" className={input} maxLength={64} value={editorial.kicker} disabled={busy} onChange={e => setEditorial({ kicker: e.target.value })} /></label>
      {editorial.facts.map((fact, i) => <div key={i} className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-400">Value {i + 1}<input aria-label={`Sequence value ${i + 1}`} className={input} maxLength={24} value={fact.value} disabled={busy} onChange={e => setEditorial({ facts: editorial.facts.map((f, n) => n === i ? { ...f, value: e.target.value } : f) })} /></label>
        <label className="text-xs text-gray-400">Label {i + 1}<input aria-label={`Sequence label ${i + 1}`} className={input} maxLength={48} value={fact.label} disabled={busy} onChange={e => setEditorial({ facts: editorial.facts.map((f, n) => n === i ? { ...f, label: e.target.value } : f) })} /></label>
      </div>)}
      <label className="block text-xs text-gray-400">Illustration note<input aria-label="Sequence illustration note" className={input} maxLength={80} value={editorial.disclosure} disabled={busy} onChange={e => setEditorial({ disclosure: e.target.value })} /></label>
      <p className="text-[11px] text-muted">Text is separate from image assets. Saving changes requires another rendered review.</p>
    </div>}
    <label className="block text-xs text-gray-400">{graphic.composition ? 'Shot name' : 'Title'}<input aria-label="Graphic title" className={input} maxLength={64} value={graphic.title} disabled={busy} onChange={e => setGraphic({ ...graphic, title: e.target.value })} /></label>
    <label className="block text-xs text-gray-400">{graphic.composition ? 'Editor note' : 'Detail'}<textarea aria-label="Graphic detail" className={input} rows={2} maxLength={120} value={graphic.detail} disabled={busy} onChange={e => setGraphic({ ...graphic, detail: e.target.value })} /></label>
    <div className="grid grid-cols-2 gap-2"><label className="text-xs text-gray-400">Start (seconds)<input aria-label="Graphic start" className={input} type="number" min={sceneStart / fps} max={(value.endFrame - 1) / fps} step={1 / fps} value={Number(start.toFixed(3))} disabled={busy} onChange={e => onChange({ ...value, startFrame: Math.max(sceneStart, Math.min(value.endFrame - 1, Math.round(Number(e.target.value) * fps))) })} /></label><label className="text-xs text-gray-400">End (seconds)<input aria-label="Graphic end" className={input} type="number" min={(value.startFrame + 1) / fps} max={sceneEnd / fps} step={1 / fps} value={Number(end.toFixed(3))} disabled={busy} onChange={e => onChange({ ...value, endFrame: Math.min(sceneEnd, Math.max(value.startFrame + 1, Math.round(Number(e.target.value) * fps))) })} /></label></div>
    {!editorial && !graphic.composition?.diagram && <label className="block text-xs text-gray-400">Graphic position<select aria-label="Graphic position" className={input} value={position} disabled={busy} onChange={e => setGraphic({ ...graphic, bounds: cardBounds(graphic.kind, width, height, e.target.value) })}><option value="custom" disabled>Custom position</option><option value="top">Top</option><option value="bottom">Bottom</option><option value="right">Right</option><option value="center">Center</option></select></label>}
    {graphic.composition && !editorial && !graphic.composition.diagram && <div className="space-y-3 rounded-lg border border-border p-3">
      <p className="text-xs font-semibold text-sky-200">Image movement</p>
      {graphic.composition.layers.length === 2 && <div className="space-y-2"><label className="block text-xs text-gray-400">Image comparison<select aria-label="Image comparison" className={input} disabled={busy} value={graphic.composition.comparison?.mode || 'none'} onChange={event => {
        const comparison = event.target.value === 'none' ? undefined : { mode: event.target.value as 'split' | 'wipe', beforeLabel: 'Before', afterLabel: 'After' };
        setGraphic({ ...graphic, composition: { ...graphic.composition!, comparison } });
      }}><option value="none">Original layers</option><option value="split">Side-by-side comparison</option><option value="wipe">Animated before / after wipe</option></select></label>
      {graphic.composition.comparison && <div className="grid grid-cols-2 gap-2">{(['beforeLabel', 'afterLabel'] as const).map((key, index) => <label key={key} className="text-xs text-gray-400">Image {index + 1} label<input aria-label={`Comparison label ${index + 1}`} className={input} maxLength={40} disabled={busy} value={graphic.composition!.comparison![key]} onChange={event => setGraphic({ ...graphic, composition: { ...graphic.composition!, comparison: { ...graphic.composition!.comparison!, [key]: event.target.value } } })} /></label>)}</div>}
      </div>}
      {graphic.composition.layers.length !== 2 && <p className="text-[11px] text-gray-500">For a before/after comparison, regenerate this shot with two related source images.</p>}
      {graphic.composition.layers.map((layer, index) => {
        const update = (patch: Partial<typeof layer>) => setGraphic({ ...graphic, composition: { ...graphic.composition!, layers: graphic.composition!.layers.map((item, i) => i === index ? { ...item, ...patch } : item) } });
        return <div key={layer.id} className="space-y-2">
          <label className="block text-xs text-gray-400">Layer {index + 1}<select aria-label={`Layer ${index + 1} motion`} className={input} value={layer.motion} disabled={busy} onChange={e => update({ motion: e.target.value as typeof layer.motion })}>
            {Object.entries({ hold: 'Still', 'push-in': 'Push in', 'pull-out': 'Pull out', 'drift-left': 'Drift left', 'drift-right': 'Drift right', 'drift-up': 'Drift up', 'drift-down': 'Drift down', 'diagonal-in': 'Diagonal push in', 'focus-in': 'Zoom toward focus' }).map(([motion, name]) => <option key={motion} value={motion}>{name}</option>)}
          </select></label>
          {layer.motion !== 'hold' && <label className="block text-xs text-gray-400">Movement strength · {Math.round((layer.strength ?? (layer.motion.startsWith('drift-') ? 0.025 : 0.055)) * 1000) / 10}%<input aria-label={`Layer ${index + 1} movement strength`} type="range" className="mt-2 w-full accent-sky-400" min={0} max={0.2} step={0.005} value={layer.strength ?? (layer.motion.startsWith('drift-') ? 0.025 : 0.055)} disabled={busy} onChange={e => update({ strength: Number(e.target.value) })} /></label>}
          {layer.motion === 'focus-in' && <div className="grid grid-cols-2 gap-2">{(['x', 'y'] as const).map(axis => <label key={axis} className="text-xs text-gray-400">Focus {axis.toUpperCase()} (%)<input aria-label={`Layer ${index + 1} focus ${axis}`} className={input} type="number" min={0} max={100} value={Math.round((layer.focus?.[axis] ?? 0.5) * 100)} disabled={busy} onChange={e => update({ focus: { ...layer.focus || { x: 0.5, y: 0.5 }, [axis]: Math.max(0, Math.min(100, Number(e.target.value))) / 100 } })} /></label>)}</div>}
        </div>;
      })}
      <p className="text-[11px] text-gray-500">Changes appear in the preview. Save the graphic to include them in exports.</p>
    </div>}
    {graphic.target && <p className="text-xs text-gray-400">Target: {graphic.target.label}</p>}
    <label className="block text-xs text-gray-400">Revision direction<input aria-label="Graphic revision direction" className={input} maxLength={2000} disabled={busy} value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="Move the detail inset higher; use gentler motion" /></label>
    <div className="flex flex-wrap gap-3 text-xs"><button className="text-amber-300 disabled:opacity-40" disabled={busy || !dirty || !graphic.title.trim() || end <= start} onClick={() => void onSave({ graphic, startFrame: value.startFrame, endFrame: value.endFrame })}>Save changes</button><button className="text-gray-300 disabled:opacity-40" disabled={busy || dirty} onClick={() => void onSave({ enabled: !a.enabled })}>{a.enabled ? 'Hide' : 'Show'}</button><button className="text-gray-300 disabled:opacity-40" disabled={busy || dirty} onClick={() => void onRegenerate(instruction)}>Regenerate</button><button className="text-gray-300" onClick={onSelect}>Preview</button></div>
  </div>;
}

function GraphCard({ artifact, value, fps, busy, selected, onSelect, onChange, onSave, onRegenerate }: {
  artifact: ArtifactComposition; value: ArtifactComposition; fps: number; busy: boolean; selected: boolean;
  onSelect: () => void; onChange: (value: ArtifactComposition) => void; onSave: (patch: GraphicPatch) => Promise<unknown>; onRegenerate: (instruction: string) => Promise<unknown>;
}) {
  const [instruction, setInstruction] = useState('');
  const graph = value.sceneGraph!;
  const dirty = JSON.stringify(graph) !== JSON.stringify(artifact.sceneGraph);
  return <div className={`space-y-3 rounded-xl border p-4 bg-surface ${selected ? 'border-amber-400/70' : 'border-border'}`}>
    <button className="text-left" onClick={onSelect}><span className="text-[11px] uppercase tracking-wider text-sky-300">{graph.template ? motionLibraryTemplate(graph.template.id)?.name || 'Adaptive composition' : 'Original composition'}</span><span className="mt-1 block text-sm font-semibold">{artifact.intent}</span></button>
    <p className="text-xs text-gray-400">{(value.startFrame / fps).toFixed(1)}–{(value.endFrame / fps).toFixed(1)} s · {graph.nodes.length} elements · {graph.soundCues.length} sound cues · {artifact.enabled ? 'Visible' : 'Hidden'}</p>
    <p className="text-xs text-gray-400" title={artifact.visualReview?.reason}>{artifact.visualReview?.status === 'passed' ? 'Rendered review passed' : artifact.visualReview?.status === 'rejected' ? 'Review rejected · hidden' : 'Rendered review pending'}</p>
    {graph.nodes.filter(n => n.kind === 'text').map(n => n.kind === 'text' && <label key={n.id} className="block text-xs text-gray-400">Display text<textarea aria-label={`Composition text ${n.id}`} className={input} rows={2} value={n.text} disabled={busy} onChange={e => onChange({ ...value, sceneGraph: { ...graph, nodes: graph.nodes.map(node => node.id === n.id && node.kind === 'text' ? { ...node, text: e.target.value } : node) } })} /></label>)}
    <p className="text-[11px] text-muted">Keep wording supported by the narration. Describe layout or timing changes below to create a new design.</p>
    {graph.soundCues.map((cue, index) => <div key={cue.id} className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3">
      <label className="text-xs text-gray-400">{cue.label || 'Sound cue'} · {cue.gainDb} dB<input aria-label={`Sound cue ${index + 1} gain`} type="range" min={-24} max={0} step={1} disabled={busy} className="mt-2 w-full accent-sky-400" value={cue.gainDb} onChange={e => onChange({ ...value, sceneGraph: { ...graph, soundCues: graph.soundCues.map((c,i) => i === index ? { ...c, gainDb: Number(e.target.value) } : c) } })} /></label>
      <label className="text-xs text-gray-400">Cue time (seconds)<input aria-label={`Sound cue ${index + 1} time`} className={input} type="number" min={0} max={(value.endFrame-value.startFrame-1)/fps} step={1/fps} disabled={busy} value={Number((cue.localFrame/fps).toFixed(3))} onChange={e => onChange({ ...value, sceneGraph: { ...graph, soundCues: graph.soundCues.map((c,i) => i === index ? { ...c, localFrame: Math.max(0, Math.min(value.endFrame-value.startFrame-1, Math.round(Number(e.target.value)*fps))) } : c) } })} /></label>
    </div>)}
    <label className="block text-xs text-gray-400">Revision direction<input aria-label="Composition revision direction" className={input} value={instruction} disabled={busy} maxLength={2000} onChange={e => setInstruction(e.target.value)} placeholder="Use a branching layout, calmer reveals and fewer labels" /></label>
    <div className="flex flex-wrap gap-3 text-xs"><button className="text-amber-300 disabled:opacity-40" disabled={busy || !dirty} onClick={() => void onSave({ sceneGraph: graph })}>Save changes</button><button disabled={busy || dirty} className="disabled:opacity-40" onClick={() => void onSave({ enabled: !artifact.enabled })}>{artifact.enabled ? 'Hide' : 'Show'}</button><button disabled={busy || dirty} className="disabled:opacity-40" onClick={() => void onRegenerate(instruction || 'Improve visual hierarchy, spacing and motion pacing')}>Regenerate</button><button onClick={onSelect}>Preview</button></div>
  </div>;
}
