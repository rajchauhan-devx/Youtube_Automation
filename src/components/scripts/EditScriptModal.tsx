import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, X } from 'lucide-react';
import type { PromptBlock, Script } from '../../data';
import { spokenText, validateScenePlan } from '../../../server/src/services/scene-plan';
import { serializeScenePlan } from '../../../server/src/services/scene-plan-format';

export function EditScriptModal({ script, onClose, onSavePatch, onSaveSpoken }: {
  script: Script;
  onClose: () => void;
  onSavePatch: (patch: Partial<Script>) => Promise<boolean>;
  onSaveSpoken: (text: string) => Promise<boolean>;
}) {
  const hasGenerated = Boolean(script.scenePlan || script.narration?.trim() || script.extractedScript?.trim());
  const hasResponse = Boolean(script.aiResponse?.trim());
  const [tab, setTab] = useState<'generated' | 'template' | 'response'>(hasGenerated ? 'generated' : hasResponse ? 'response' : 'template');
  const [name, setName] = useState(script.name);
  const [prompts, setPrompts] = useState<PromptBlock[]>((script.prompts || []).map(prompt => ({ ...prompt, name: prompt.name || '', content: prompt.content || '' })));
  const [howItWorks, setHowItWorks] = useState(script.howItWorks || '');
  const [spoken, setSpoken] = useState(script.narration || script.extractedScript || '');
  const [response, setResponse] = useState(script.aiResponse || '');
  const [scenes, setScenes] = useState(script.scenePlan?.scenes.map(scene => scene.narration) || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const field = 'w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white outline-none focus:border-accent';

  async function save() {
    setSaving(true); setError('');
    try {
      let saved: boolean;
      if (tab === 'template') {
        if (!name.trim()) throw new Error('Enter a script name.');
        if (!prompts.some(prompt => prompt.content.trim()) && !howItWorks.trim()) throw new Error('Add at least one prompt or a workflow description.');
        if (name.trim() === script.name && JSON.stringify(prompts) === JSON.stringify(script.prompts) && howItWorks === (script.howItWorks || '')) { onClose(); return; }
        saved = await onSavePatch({ name: name.trim(), prompts: prompts.map(prompt => ({ ...prompt, name: prompt.name.trim(), content: prompt.content })), howItWorks });
      } else if (tab === 'response') {
        if (!response.trim()) throw new Error('Enter the AI response.');
        if (response.trim() === script.aiResponse?.trim()) { onClose(); return; }
        saved = await onSavePatch({ aiResponse: response.trim(), extractedScript: '', narration: '', imagePrompts: [],
          generatedImages: [], generatedAudio: [], generatedMusic: undefined, scenePlan: undefined,
          timelineConfig: undefined, sceneAnalysis: undefined, youtubeExport: undefined, facebookExport: undefined, instagramExport: undefined,
          pipeline: [{ id: 'response', label: 'Response', status: 'done', summary: 'Response edited — ready to extract', inputLog: '', outputPreview: response.trim().slice(0, 120) }] });
      } else if (script.scenePlan) {
        if (script.scenePlan.scenes.every((scene, index) => scene.narration === scenes[index]?.trim())) { onClose(); return; }
        const scenePlan = validateScenePlan({ ...script.scenePlan, scenes: script.scenePlan.scenes.map((scene, index) => ({ ...scene, narration: scenes[index]?.trim() || '' })) });
        const narration = spokenText(scenePlan);
        saved = await onSavePatch({ scenePlan, narration, extractedScript: narration,
          aiResponse: serializeScenePlan(scenePlan),
          generatedAudio: [], generatedMusic: undefined, timelineConfig: undefined, youtubeExport: undefined, facebookExport: undefined, instagramExport: undefined });
      } else {
        if (!spoken.trim()) throw new Error('Enter the spoken script.');
        saved = await onSaveSpoken(spoken.trim());
      }
      if (!saved) throw new Error('Could not save the script. Check the connection and try again.');
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the script.'); }
    finally { setSaving(false); }
  }

  return createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Edit ${script.name}`}>
    <div className="studio-card flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden shadow-pop">
      <div className="flex items-center justify-between border-b border-borderSoft p-5">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">Scripts</p><h2 className="text-lg font-bold text-white">Edit script</h2></div>
        <button type="button" onClick={onClose} disabled={saving} aria-label="Close editor" className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-white disabled:opacity-40"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex gap-2 border-b border-borderSoft px-5 pt-3">
        <button type="button" onClick={() => { setTab('template'); setError(''); }} className={`rounded-t-lg px-3 py-2 text-sm ${tab === 'template' ? 'bg-accent/15 font-semibold text-accent' : 'text-muted hover:text-white'}`}>Template & prompts</button>
        {hasGenerated && <button type="button" onClick={() => { setTab('generated'); setError(''); }} className={`rounded-t-lg px-3 py-2 text-sm ${tab === 'generated' ? 'bg-accent/15 font-semibold text-accent' : 'text-muted hover:text-white'}`}>Generated script</button>}
        {hasResponse && <button type="button" onClick={() => { setTab('response'); setError(''); }} className={`rounded-t-lg px-3 py-2 text-sm ${tab === 'response' ? 'bg-accent/15 font-semibold text-accent' : 'text-muted hover:text-white'}`}>AI response</button>}
      </div>
      <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        {tab === 'template' ? <>
          <label className="block text-xs font-semibold text-gray-300">Script name<input aria-label="Script name" className={`${field} mt-1`} value={name} maxLength={150} onChange={event => setName(event.target.value)} /></label>
          <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="text-xs font-semibold text-gray-300">Prompts</h3><button type="button" onClick={() => setPrompts(current => [...current, { id: `prompt_${crypto.randomUUID()}`, name: '', type: 'Custom', content: '' }])} className="flex items-center gap-1 text-xs text-accent"><Plus className="h-3.5 w-3.5" />Add prompt</button></div>
            {prompts.map((prompt, index) => <div key={prompt.id} className="space-y-2 rounded-xl border border-borderSoft bg-bg/60 p-3">
              <div className="flex items-center gap-2"><span className="text-xs text-faint">#{index + 1}</span><input aria-label={`Prompt ${index + 1} name`} className={field} placeholder="Prompt name" value={prompt.name} onChange={event => setPrompts(current => current.map(item => item.id === prompt.id ? { ...item, name: event.target.value } : item))} /><button type="button" aria-label={`Remove prompt ${index + 1}`} disabled={prompts.length === 1} onClick={() => setPrompts(current => current.filter(item => item.id !== prompt.id))} className="rounded p-2 text-muted hover:text-red-300 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button></div>
              <textarea aria-label={`Prompt ${index + 1} content`} className={`${field} min-h-32 resize-y`} value={prompt.content} placeholder="Instructions for the AI…" onChange={event => setPrompts(current => current.map(item => item.id === prompt.id ? { ...item, content: event.target.value } : item))} />
            </div>)}
          </div>
          <label className="block text-xs font-semibold text-gray-300">How it works<textarea aria-label="How it works" className={`${field} mt-1 min-h-24 resize-y`} value={howItWorks} onChange={event => setHowItWorks(event.target.value)} /></label>
          <p className="text-xs text-faint">Template edits apply to future script runs.</p>
        </> : tab === 'response' ? <>
          <label className="block text-xs font-semibold text-gray-300">Complete AI response<textarea aria-label="Complete AI response" className={`${field} mt-1 min-h-72 resize-y font-mono leading-6`} value={response} onChange={event => setResponse(event.target.value)} /></label>
          <p className="text-xs text-gray-400">Saving replaces the response and clears extracted assets and generated media. Extract assets again after saving.</p>
        </> : script.scenePlan ? <>
          <p className="text-xs text-gray-400">Edit each scene’s spoken words. Saving keeps the scene map and media prompts, and clears narration timing and generated audio.</p>
          {script.scenePlan.scenes.map((scene, index) => <label key={scene.id} className="block text-xs font-semibold text-gray-300">Scene {index + 1} · {scene.chapter}<textarea aria-label={`Scene ${index + 1} narration`} className={`${field} mt-1 min-h-28 resize-y`} value={scenes[index] || ''} onChange={event => setScenes(current => current.map((value, i) => i === index ? event.target.value : value))} /></label>)}
        </> : <>
          <label className="block text-xs font-semibold text-gray-300">Spoken script<textarea aria-label="Spoken script" className={`${field} mt-1 min-h-72 resize-y leading-6`} value={spoken} onChange={event => setSpoken(event.target.value)} /></label>
          <p className="text-xs text-gray-400">Saving updates the next voice generation and clears earlier generated audio and export. Extracting the original AI response again will replace this edit.</p>
        </>}
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-borderSoft p-5"><button type="button" onClick={onClose} disabled={saving} className="studio-btn-ghost">Cancel</button><button type="button" onClick={() => void save()} disabled={saving} className="studio-btn-primary">{saving ? 'Saving…' : 'Save changes'}</button></div>
    </div>
  </div>, document.body);
}
