import { useState } from 'react';
import { Image as ImageIcon, Music, Copy, Pencil, Play, Loader2 } from 'lucide-react';
import type { Script } from '../../data';
import { spokenText, validateScenePlan } from '../../../server/src/services/scene-plan';

export function AssetsTab({ script, onProceedToGeneration, onUpdate }: { script: Script | null; onProceedToGeneration?: () => void; onUpdate?: (patch: Partial<Script>) => unknown }) {
  const [activeSubTab, setActiveSubTab] = useState<'images' | 'narration'>('images');
  const [editingScene, setEditingScene] = useState<number | null>(null);
  const [sceneText, setSceneText] = useState('');
  const [sceneImage, setSceneImage] = useState('');
  const [sceneType, setSceneType] = useState<'image' | 'video'>('image');
  const [editError, setEditError] = useState('');
  const [savingScene, setSavingScene] = useState(false);

  async function saveScene() {
    if (!script?.scenePlan || editingScene === null || !onUpdate) return;
    setSavingScene(true); setEditError('');
    try {
      const scenePlan = validateScenePlan({ ...script.scenePlan, scenes: script.scenePlan.scenes.map((scene, i) => i === editingScene ? { ...scene, narration: sceneText.trim(), imagePrompt: sceneImage.trim(), ...(script.section === 'mixed' ? { mediaType: sceneType, duration: sceneType === 'video' ? 10 : undefined } : {}) } : scene) });
      const narration = spokenText(scenePlan);
      const saved = await onUpdate({ scenePlan, narration, extractedScript: narration, aiResponse: `<long_video>\n${JSON.stringify(scenePlan, null, 2)}\n</long_video>`,
        imagePrompts: scenePlan.scenes.map(scene => scene.imagePrompt), generatedAudio: [], timelineConfig: undefined, youtubeExport: undefined,
        generatedImages: script.generatedImages?.filter(image => scenePlan.scenes[image.index]?.imagePrompt === image.prompt && (scenePlan.scenes[image.index]?.mediaType || 'image') === (image.mediaType || 'image')) });
      if (saved === false) throw new Error('Could not save the scene. Check the server connection.');
      setEditingScene(null);
    } catch (error) { setEditError(error instanceof Error ? error.message : 'Could not save scene'); }
    finally { setSavingScene(false); }
  }

  if (!script) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-500">
        <p className="text-sm">No script selected.</p>
        <p className="mt-1 text-xs">Run a script to see extracted assets.</p>
      </div>
    );
  }

  const responseStep = script.pipeline?.find((p) => p.id === 'response');
  const isExtracting = responseStep?.status === 'running';
  const hasAssets = (script.imagePrompts?.length ?? 0) > 0 || script.narration;

  if (isExtracting) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-500">
        <Loader2 className="mb-3 h-8 w-8 animate-spin text-accent" />
        <p className="text-sm">Extracting assets with AI...</p>
        <p className="mt-1 text-xs">Please wait while we parse the response</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveSubTab('images')}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors ${
              activeSubTab === 'images' ? 'bg-surface2 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <ImageIcon className="h-4 w-4" />
            {script.section === 'mixed' ? 'Image & Video Prompts' : 'Image Prompts'}
            {script.imagePrompts && script.imagePrompts.length > 0 && (
              <span className="ml-1 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] text-accent">
                {script.imagePrompts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveSubTab('narration')}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors ${
              activeSubTab === 'narration' ? 'bg-surface2 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Music className="h-4 w-4" />
            Narration
            {script.narration && (
              <span className="ml-1 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] text-accent">
                1
              </span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {script.imagePrompts?.length ?? 0} scenes, {script.scenePlan?.scenes.filter(scene => scene.mediaType === 'video').length || 0} videos, {script.narration ? '1 narration' : 'no narration'}
          </span>
          {hasAssets && (script.imagePrompts?.length ?? 0) > 0 && onProceedToGeneration && (
            <button
              onClick={onProceedToGeneration}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/80"
            >
              <Play className="h-3.5 w-3.5" />
              Proceed to Generation
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {script.scenePlan && <details className="mb-4 rounded-lg border border-border p-4 text-sm text-gray-300">
          <summary className="cursor-pointer">{script.scenePlan.scenes.length} narration-linked scenes · Separate thumbnail prompt</summary>
          <p className="mt-3 whitespace-pre-wrap">{script.scenePlan.thumbnailPrompt}</p>
          <button className="mt-2 text-accent" onClick={() => navigator.clipboard.writeText(script.scenePlan!.thumbnailPrompt)}>Copy thumbnail prompt</button>
        </details>}
        {!hasAssets ? (
          <div className="flex h-full flex-col items-center justify-center text-gray-500">
            <ImageIcon className="mb-3 h-8 w-8 text-gray-600" />
            <p className="text-sm">No assets extracted yet.</p>
            <p className="mt-1 text-xs">Run a script and assets will appear here automatically.</p>
          </div>
        ) : activeSubTab === 'images' ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">{script.section === 'mixed' ? 'Image & Video Prompts' : 'Image Prompts'}</h3>
              <span className="text-xs text-gray-500">Pending generation</span>
            </div>
            {script.imagePrompts && script.imagePrompts.length > 0 ? (
              <div className="flex flex-col gap-3">
                {script.imagePrompts.map((prompt, i) => (
                  <div key={i} className="rounded-lg border border-border bg-surface p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold text-accent">
                          {i + 1}
                        </span>
                        <span className="text-xs font-medium text-white">{script.scenePlan?.scenes[i]?.mediaType === 'video' ? 'Video · 10 sec' : 'Image'} · {i + 1}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                          Pending
                        </span>
                      </div>
                    </div>
                    <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                      {prompt}
                    </p>
                    {script.scenePlan?.scenes[i] && <p className="mb-3 text-sm text-emerald-200"><strong>{script.scenePlan.scenes[i].chapter} · {script.scenePlan.scenes[i].id}</strong><br />{script.scenePlan.scenes[i].narration}</p>}
                    {editingScene === i && <div className="mb-3 space-y-2">
                      {script.section === 'mixed' && <label className="block text-xs text-gray-300">Media type <select aria-label="Scene media type" value={sceneType} onChange={event => setSceneType(event.target.value as 'image' | 'video')} className="rounded border border-border bg-bg p-2"><option value="image">Image</option><option value="video">Video · 10 seconds</option></select></label>}
                      <label className="block text-xs text-gray-300">Spoken narration<textarea aria-label="Scene narration" value={sceneText} onChange={event => setSceneText(event.target.value)} className="mt-1 block min-h-24 w-full rounded border border-border bg-bg p-3" /></label>
                      <label className="block text-xs text-gray-300">Matching image prompt<textarea aria-label="Scene image prompt" value={sceneImage} onChange={event => setSceneImage(event.target.value)} className="mt-1 block min-h-24 w-full rounded border border-border bg-bg p-3" /></label>
                      <p className="text-xs text-amber-200">Saving clears narration timing and the rendered video. Generate narration again to rebuild timing; unchanged voice segments can be reused.</p>
                      {editError && <p role="alert" className="text-sm text-red-300">{editError}</p>}
                      <button disabled={savingScene} onClick={() => void saveScene()} className="rounded bg-accent px-3 py-2 text-xs text-white disabled:opacity-40">{savingScene ? 'Saving…' : 'Save scene'}</button>
                      <button disabled={savingScene} onClick={() => setEditingScene(null)} className="ml-3 text-xs text-gray-300">Cancel</button>
                    </div>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigator.clipboard.writeText(prompt)}
                        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </button>
                      <button onClick={() => {
                        const scene = script.scenePlan?.scenes[i];
                        if (scene) { setEditingScene(i); setSceneText(scene.narration); setSceneImage(scene.imagePrompt); setSceneType(scene.mediaType || 'image'); setEditError(''); }
                      }} disabled={!script.scenePlan || !onUpdate} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2 disabled:opacity-40">
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No image prompts found in the response.</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Narration (TTS)</h3>
              <span className="text-xs text-gray-500">Pending generation</span>
            </div>
            {script.narration ? (
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-white">Narration Script</span>
                  <span className="flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                    Pending
                  </span>
                </div>
                <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                  {script.narration}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigator.clipboard.writeText(script.narration!)}
                    className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No narration found in the response.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
