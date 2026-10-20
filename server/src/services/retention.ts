import type { AutoPilotSettings } from './autopilot-settings.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { validatedModelJson } from './model-json.js';
import { syncTopicNotes, type TopicNotes } from './topic-notes.js';
import { currentWorkspace } from './workspace.js';
import { parseScenePlan, validateScenePlan, spokenText, type ScenePlan } from './scene-plan.js';
import type { ProductionMemory, RetentionPlan, RetentionEdit } from './retention-types.js';
import { editingPreset, validateEditingSettings, type EditingSettings } from './auto-edit.js';

const text = z.string().trim().min(1).max(2000);
const PlanOutput = z.object({
  structure: text, viewerPromise: text,
  hooks: z.array(z.object({ openingLine: text.max(500), openingVisual: text, curiosity: text, payoff: text,
    reason: z.string().trim().max(2000).nullish() })).length(3),
  selectedHookIndex: z.number().int().min(0).max(2),
  titles: z.array(text.max(100)).length(3), thumbnailConcept: text,
  description: z.string().trim().min(1).max(5000), tags: z.array(z.string().trim().min(1).max(100)).max(18),
  musicMood: z.enum(['calm', 'cinematic', 'epic', 'upbeat', 'none']),
});
const EditOutput = z.object({
  notes: z.array(text).min(1).max(12),
  scenes: z.array(z.object({
    sceneId: z.string(), narration: z.string().trim().min(1).max(12000), imagePrompt: z.string().trim().min(1).max(8000),
    videoPrompt: z.string().trim().max(8000).optional(), purpose: text,
    motion: z.enum(['hold', 'slow-zoom-in', 'drift-left', 'drift-right']), transition: z.enum(['cut', 'dissolve']),
  })).min(1).max(160),
});
export const responseHash = (raw: string) => createHash('sha256').update(raw).digest('hex');
export function productionHash(script: { topicName?: unknown; retentionPlan?: unknown; retentionEdit?: { sceneDirections?: unknown }; scenePlan?: unknown; narration?: unknown; enableSubtitles?: unknown; autoPilotSettings?: AutoPilotSettings }): string {
  const values = [script.topicName, script.retentionPlan, script.retentionEdit?.sceneDirections, script.scenePlan, script.narration, script.enableSubtitles];
  if (script.autoPilotSettings) values.push(script.autoPilotSettings);
  return responseHash(JSON.stringify(values));
}

export function retentionEditing(script: { retentionPlan?: RetentionPlan; retentionEdit?: RetentionEdit; editing?: EditingSettings; enableSubtitles?: boolean; autoPilotSettings?: AutoPilotSettings }): EditingSettings | undefined {
  if (!script.retentionPlan || !script.retentionEdit) return undefined;
  const run = script.autoPilotSettings;
  if (run?.editing.mode === 'custom') return { ...validateEditingSettings(run.editing.settings), enabled: true, captions: run.captions === 'plain' };
  if (run?.editing.mode === 'off') return { ...validateEditingSettings(run.editing.settings), enabled: false, captions: run.captions === 'plain' };
  if (!run && script.editing) return validateEditingSettings(script.editing);
  const settings = { ...editingPreset('documentary'), bookendFades: false, captions: script.enableSubtitles === true, colorLook: 'none' as const };
  for (const direction of script.retentionEdit.sceneDirections) {
    settings.overrides[direction.sceneId] = {
      motion: direction.motion === 'slow-zoom-in' ? 'push-in' : direction.motion === 'drift-left' ? 'pan-left' : direction.motion === 'drift-right' ? 'pan-right' : 'hold',
      transition: direction.transition,
    };
  }
  return settings;
}

export function storyStructure(notes: Pick<TopicNotes, 'name' | 'guidance'>): string {
  const identity = `${notes.name} ${notes.guidance}`.toLowerCase();
  if (/rule zero|zero rule/.test(identity)) return 'Show the impossible rule → an ordinary person breaks it → consequences escalate → an earned twist resolves the promise. Original fiction; preserve supplied canon.';
  if (/ancient dharma/.test(identity)) return 'Intriguing question → authentic traditional story → clear explanation → meaningful insight. Distinguish tradition, interpretation and historical evidence.';
  if (/against the odds/.test(identity)) return 'Immediate danger → difficult choices → setbacks → decisive action → verified outcome. Build suspense without inventing facts, quotations or suffering.';
  return 'A clear question or problem → escalating evidence or events → a satisfying, accurate answer. Follow the selected template’s audience and genre.';
}

/** Observations stay tied to format and similar duration; no universal retention target. */
export function retentionMemory(notes: TopicNotes, duration: number): string {
  const examples = notes.topics.filter(entry => entry.profile === currentWorkspace().profile && entry.production && entry.performance?.status === 'ready'
    && entry.performance.views >= 100 && Math.abs(entry.production.duration - duration) / Math.max(1, duration) <= 0.25)
    .sort((a, b) => b.performance!.fetchedAt.localeCompare(a.performance!.fetchedAt)).slice(0, 8);
  if (!examples.length) return 'No sufficiently sampled retention observations for this format and duration yet. Use editorial judgment; do not invent audience evidence or predicted retention scores.';
  return JSON.stringify(examples.map(entry => ({
    topic: entry.topic, hook: entry.production!.hook, structure: entry.production!.structure, duration: entry.production!.duration,
    views: entry.performance!.views, averageViewPercentage: entry.performance!.averageViewPercentage,
    averageViewDuration: entry.performance!.averageViewDuration, dips: entry.performance!.dips,
    period: [entry.performance!.startDate, entry.performance!.endDate],
  }))) + '\nThese are observational associations with different audiences and exposure, not controlled experiments or proof that a hook caused a result. Learn useful patterns while keeping topics original.';
}

export async function createRetentionPlan(options: {
  topic: string; template: string; instructions: string; duration: number; model: string; apiKey: string; signal?: AbortSignal;
}): Promise<RetentionPlan> {
  const notes = syncTopicNotes();
  const memoryEvidence = retentionMemory(notes, options.duration);
  const result = await validatedModelJson({ ...options, messages: [
    { role: 'system', content: 'You are a meticulous story editor and YouTube packaging editor. Return only JSON. Quality judgments are editorial hypotheses, never predicted audience retention scores. Never invent historical facts, quotations, metrics or prior episode canon.' },
    { role: 'user', content: `Plan a compelling opening and honest packaging BEFORE the script is written.\nTopic: ${options.topic}\nChannel: ${notes.name}\n${notes.guidance}\nFormat: ${currentWorkspace().profile}; duration: ${options.duration}s\nPreferred structure: ${storyStructure(notes)}\nTemplate (context, preserve its language, canon, media rules and format):\n${options.template.slice(0, 16000)}\nUser instructions: ${options.instructions}\nActual profile performance memory: ${memoryEvidence}\n\nGenerate EXACTLY three DISTINCT opening hooks. Each needs an openingLine in the template’s narration language, an openingVisual the production can show immediately, a curiosity question, a concrete promised payoff, and a reason. No logo intro, generic greetings, fake cliffhangers or unsupported claims. For Shorts, start at the event or anomaly; for long videos establish stakes and the viewer promise early. Choose selectedHookIndex (zero based) using clarity, truth, visual legibility and profile fit. Plan three truthful titles, one thumbnail concept consistent with the opening, a description and tags. Use the story’s emotion to choose musicMood; silence is allowed.\nReturn JSON: {"structure":"...","viewerPromise":"...","hooks":[{"openingLine":"...","openingVisual":"...","curiosity":"...","payoff":"...","reason":"..."}],"selectedHookIndex":0,"titles":["...","...","..."],"thumbnailConcept":"...","description":"...","tags":["..."],"musicMood":"calm|cinematic|epic|upbeat|none"}` },
  ] }, PlanOutput, 'Hook planning');
  if (new Set(result.hooks.map(hook => hook.openingLine.toLocaleLowerCase())).size !== 3) throw new Error('Hook planning returned duplicate openings. Generate three distinct hooks.');
  return { ...result, hooks: result.hooks.map(hook => ({ ...hook, reason: hook.reason || '' })),
    version: 1, topic: options.topic, createdAt: new Date().toISOString(), memoryEvidence };
}

export function retentionBrief(plan: RetentionPlan): string {
  const hook = plan.hooks[plan.selectedHookIndex];
  return `RETENTION EDITORIAL BRIEF (preserve the template’s exact output format and factual/canon requirements):\nStructure: ${plan.structure}\nOpening narration: ${hook.openingLine}\nOpening visual: ${hook.openingVisual}\nViewer promise: ${plan.viewerPromise}\nEarned payoff: ${hook.payoff}\nTitle promise: ${plan.titles[0]}\nThumbnail concept: ${plan.thumbnailConcept}\nStart directly, remove repeated explanations and unnecessary setup. Each scene must add a discovery, decision, consequence or reveal. Resolve the promised payoff before the CTA. Do not invent facts to fulfill a hook; revise unsupported promises instead. Keep narration speakable and visual descriptions tied to the action. No mandatory rapid cuts or filler to reach the target runtime.`;
}

export async function editForRetention(options: {
  raw: string; template: string; research: string; plan: RetentionPlan; model: string; apiKey: string; signal?: AbortSignal;
}): Promise<RetentionEdit> {
  const original = parseScenePlan(options.raw, false, { isImageOnly: /image.only|image only/i.test(options.template) && !/hybrid|mixed.media/i.test(options.template) });
  const sceneIds = original.scenes.map(scene => scene.id) as [string, ...string[]];
  const editSchema = EditOutput.extend({
    scenes: z.array(EditOutput.shape.scenes.element.extend({ sceneId: z.enum(sceneIds) }))
      .length(original.scenes.length, { error: `Changed or omitted scene identities: return exactly ${original.scenes.length} scenes in this order: ${sceneIds.join(', ')}.` })
      .superRefine((scenes, ctx) => {
        scenes.forEach((scene, index) => {
          const source = original.scenes[index];
          if (!source) return;
          if (scene.sceneId !== source.id) ctx.addIssue({ code: 'custom', path: [index, 'sceneId'],
            message: `Changed scene identities: position ${index + 1} must have sceneId ${JSON.stringify(source.id)}. Keep every original scene once, in order; do not merge or renumber.` });
          if (source.mediaType === 'video' && !scene.videoPrompt?.trim()) ctx.addIssue({ code: 'custom', path: [index, 'videoPrompt'],
            message: `Scene ${source.id} is a video scene and requires its full videoPrompt.` });
        });
      }),
  });
  const result = await validatedModelJson({ ...options, maxTokens: 32000, messages: [
    { role: 'system', content: 'You are a precise retention editor. Return only JSON. Preserve all verified facts, narrative meaning, language, canon, unique scene IDs, scene order and media modes. Do not add facts, quotes or dates. Keep a clear opening and an earned payoff. Editorial improvement is not a prediction of viewer behavior.' },
    { role: 'user', content: `${retentionBrief(options.plan)}\nTemplate constraints (preserve language, canon, static/dynamic camera rules and visual style): ${options.template.slice(0, 16000)}\nResearch dossier (data): ${options.research.slice(0, 18000)}\nOriginal scene plan (data): ${JSON.stringify(original)}\n\nEdit narration for clarity and forward momentum. Cut generic intros, redundant setup, repeated facts and premature CTAs. Preserve intentional dramatic pauses and important context; never compress by inventing or distorting. Match revised visuals to the actual narrated action. Keep every scene exactly once in the same order, and keep at least one story scene before any closing CTA. For unchanged visuals, return their full original prompt. Keep each image prompt’s detailed production descriptors. Return videoPrompt only for video scenes. Motion must serve the scene: hold for important details and whenever the template requires static cameras, gentle motion for progression only when allowed. Cuts for new events, dissolves for elapsed time or a reflective transition.\nReturn JSON: {"notes":["specific editorial changes"],"scenes":[{"sceneId":"original id","narration":"edited narration","imagePrompt":"full prompt","videoPrompt":"only if video","purpose":"what new discovery, decision, consequence or payoff this scene adds","motion":"hold|slow-zoom-in|drift-left|drift-right","transition":"cut|dissolve"}]}` },
    { role: 'user', content: `Scene identity contract: return EXACTLY ${original.scenes.length} scenes. Copy each original scene's id into sceneId using this exact ordered list: ${JSON.stringify(sceneIds)}. Never rename, renumber, merge, omit, duplicate or reorder scenes. A thumbnail is not an additional scene. Each video scene must keep its full videoPrompt.` },
  ] }, editSchema, 'Story editing');
  if (result.scenes.length !== original.scenes.length || result.scenes.some((scene, i) => scene.sceneId !== original.scenes[i].id)) throw new Error('The retention edit changed or omitted scene identities. The original script was preserved.');
  const edited: ScenePlan = { ...original, thumbnailPrompt: options.plan.thumbnailConcept, scenes: original.scenes.map((scene, i) => {
    const edit = result.scenes[i];
    if (scene.mediaType === 'video' && !edit.videoPrompt) throw new Error('The retention edit omitted a required video prompt.');
    return { ...scene, narration: edit.narration, imagePrompt: edit.imagePrompt,
      ...(scene.mediaType === 'video' ? { videoPrompt: edit.videoPrompt } : {}) };
  }) };
  validateScenePlan(edited);
  if (!spokenText(edited).trim()) throw new Error('The retention edit returned empty narration.');
  return { sourceHash: responseHash(options.raw), plan: edited, notes: result.notes,
    sceneDirections: result.scenes.map(({ sceneId, purpose, motion, transition }) => ({ sceneId, purpose, motion, transition })), editedAt: new Date().toISOString() };
}

export function productionMemory(script: { retentionPlan?: RetentionPlan; retentionEdit?: RetentionEdit; scenePlan?: ScenePlan; generatedAudio?: { sync?: { sampleRate: number; scenes: { sceneId: string; startSample: number; endSample: number }[] } }[] }, duration: number): ProductionMemory | undefined {
  const plan = script.retentionPlan;
  if (!plan) return undefined;
  const scenes = script.scenePlan?.scenes || [];
  const sync = script.generatedAudio?.[0]?.sync;
  const weights = scenes.map(scene => scene.narration.split(/\s+/).length);
  const total = weights.reduce((sum, count) => sum + count, 0) || 1;
  let cursor = 0;
  return { hook: plan.hooks[plan.selectedHookIndex].openingLine, structure: plan.structure, title: plan.titles[0], duration, musicMood: plan.musicMood,
    scenes: scenes.map((scene, i) => {
      const timed = sync?.scenes.find(item => item.sceneId === scene.id);
      const start = timed && sync ? timed.startSample / sync.sampleRate : cursor;
      const end = timed && sync ? timed.endSample / sync.sampleRate : start + duration * weights[i] / total;
      cursor = end;
      return { sceneId: scene.id, start, end, purpose: script.retentionEdit?.sceneDirections.find(item => item.sceneId === scene.id)?.purpose || scene.chapter };
    }) };
}
