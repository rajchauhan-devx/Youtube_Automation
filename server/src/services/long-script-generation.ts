import { chat, type ChatRequest } from './gemini.js';
import { parseScenePlan, type ScenePlan } from './scene-plan.js';
import { generationResponseSchema, generationIssue, narrationWordBudget, requiresBothMedia, requiredVideoCount, promptMinimumWords, supportingSections } from './script-generation.js';
import { SCENE_PLAN_FORMAT_MARKER } from './scene-plan-format.js';
import { repairVisualPrompts } from './visual-prompt-repair.js';
import { repairNarrationBudget } from './narration-budget-repair.js';

export function episodeParts(duration: number) {
  const sceneCount = Math.min(160, Math.ceil(duration / 10));
  const perPart = Math.max(1, Math.floor(120 * sceneCount / duration));
  const count = Math.ceil(sceneCount / perPart);
  return Array.from({ length: count }, (_, index) => {
    const scenes = Math.floor(sceneCount / count) + (index < sceneCount % count ? 1 : 0);
    return { scenes, seconds: duration * scenes / sceneCount };
  });
}

export function longGenerationDuration(request: ChatRequest) {
  if (!(request.jsonSchema as any)?.properties?.scenes) return undefined;
  const prompt = request.messages.find(message => message.role === 'user')?.content || '';
  const duration = Number([...prompt.matchAll(/Target Duration:\s*~?(\d+(?:\.\d+)?)\s+seconds/gi)].at(-1)?.[1]);
  return duration >= 180 && duration <= 3600 ? duration : undefined;
}

/** Emit one ordered plan while keeping each provider call within a speech budget. */
export async function generateLongScenePlan(apiKey: string, request: ChatRequest, duration: number,
  emit: (token: string) => void, generate = chat) {
  const parts = episodeParts(duration);
  const template = request.messages.find(message => message.role === 'user')?.content || '';
  const originalSystem = request.messages.filter(message => message.role === 'system').map(message => message.content).join('\n');
  const scenes: ScenePlan['scenes'] = [];
  const minimum = promptMinimumWords(template);
  const both = requiresBothMedia(template);
  const totalVideos = requiredVideoCount(template);
  let first: ScenePlan | undefined;
  let supportingNotes = '';
  for (let index = 0; index < parts.length; index++) {
    request.signal?.throwIfAborted();
    const part = parts[index];
    const budget = narrationWordBudget(part.seconds);
    const last = index === parts.length - 1;
    const videos = totalVideos === undefined ? undefined : Math.floor((index + 1) * totalVideos / parts.length) - Math.floor(index * totalVideos / parts.length);
    const ids = Array.from({ length: part.scenes }, (_, i) => `scene_${String(scenes.length + i + 1).padStart(3, '0')}`);
    const continuity = first ? JSON.stringify({ title: first.title, establishedVisuals: scenes.slice(0, 2).map(scene => scene.imagePrompt),
      previousChapters: [...new Set(scenes.map(scene => scene.chapter))], previousNarration: scenes.slice(-3).map(scene => scene.narration) }) : 'Begin the episode with the requested hook.';
    const instruction = `SEGMENTED EPISODE MODE: This call produces ONLY part ${index + 1} of ${parts.length} of the ${duration}-second episode. This per-part allocation overrides the whole-episode duration and word budget above for this call.
Return one complete schema object for this part, with exactly ${part.scenes} scenes and ${budget.minimum}–${budget.maximum} spoken words in total. Use these exact scene IDs in order: ${ids.join(', ')}. Aim for approximately ${Math.round(part.seconds * 3.5 / part.scenes)} spoken words per scene. Planning durations must sum to ${part.seconds} seconds. Do not return the whole episode or a synopsis. Every visual prompt must be standalone, with continuity spelled out rather than asset-ID references.
Progress the story through this part of the full arc: ${Math.round(index / parts.length * 100)}%–${Math.round((index + 1) / parts.length * 100)}%. ${index ? 'Continue the established episode without another opening hook or recapping previous narration.' : 'Establish the story and characters.'} ${last ? 'Complete the payoff and any requested spoken CTA.' : 'Continue toward the next part; do not conclude or add a CTA yet.'} Supporting editorial notes will be generated once after the entire episode, so supportingNotes must be empty for this call.
${videos !== undefined ? `This part needs exactly ${videos} video scenes; all other scenes use images.` : both ? 'Include at least one image scene and one video scene in this part.' : 'Preserve the template media choice.'} Image prompts need at least ${minimum.image} words and video prompts at least ${minimum.video} words when present.
Preserve the exact established character identities, wardrobe, locations, factual constraints, language and requested visual prompt detail. Previous continuity: ${continuity}`;
    let candidate: ScenePlan | undefined;
    let issue = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      const messages: ChatRequest['messages'] = [
        { role: 'system', content: `${originalSystem}\n\n${instruction}` },
        { role: 'user', content: `${template}\n\n${instruction}${issue ? `\nCorrect the previous part error: ${issue}. Return the COMPLETE corrected part.` : ''}` },
      ];
      const response = await generate(apiKey, { ...request, messages, json: true, jsonSchema: generationResponseSchema(part.seconds, template), max_tokens: 16384 });
      const raw = response.choices[0]?.message?.content || '';
      if (response.choices[0]?.finish_reason?.toUpperCase() !== 'STOP') { issue = 'The part was truncated. Finish all scenes and JSON.'; continue; }
      // Editorial notes are only required once, at the end of the episode.
      try { candidate = parseScenePlan(raw); }
      catch (error) { issue = error instanceof Error ? error.message : 'Invalid scene plan'; continue; }
      issue = '';
      if (candidate.scenes.length !== part.scenes) issue = `Expected ${part.scenes} scenes, received ${candidate.scenes.length}.`;
      else if (!last && candidate.scenes.some(scene => scene.role === 'cta')) issue = 'CTA belongs only at the end of the whole episode.';
      else if (videos !== undefined && candidate.scenes.filter(scene => scene.mediaType === 'video').length !== videos) issue = `This part needs exactly ${videos} video scenes.`;
      else if (videos === undefined && both && !['image', 'video'].every(type => candidate!.scenes.some(scene => scene.mediaType === type))) issue = 'This part needs both an image and a video scene.';
      if (!issue) {
        candidate = await repairNarrationBudget(apiKey, candidate, part.seconds, template, request.model || 'gemini-3.1-flash-lite', request.signal, generate);
        candidate.scenes = candidate.scenes.map(scene => ({ ...scene, duration: part.seconds / candidate!.scenes.length }));
        issue = generationIssue(SCENE_PLAN_FORMAT_MARKER, JSON.stringify(candidate), part.seconds, false) || '';
      }
      if (!issue) {
        candidate = await repairVisualPrompts(apiKey, candidate, template, request.model || 'gemini-3.1-flash-lite', request.signal, generate);
        const brief = candidate.scenes.find(scene => scene.imagePrompt.split(/\s+/u).filter(Boolean).length < minimum.image || (scene.mediaType === 'video' && (scene.videoPrompt || '').split(/\s+/u).filter(Boolean).length < minimum.video));
        if (brief) issue = `Scene ${brief.id}: expand image prompts to ${minimum.image}+ words and video prompts to ${minimum.video}+ words.`;
      }
      if (issue) { candidate = undefined; continue; }
      break;
    }
    if (!candidate) throw new Error(`Episode part ${index + 1}/${parts.length}: ${issue || 'No complete scene plan returned'}`);
    if (!first) {
      first = candidate;
      emit(`{"version":1,"title":${JSON.stringify(first.title)},"thumbnailPrompt":${JSON.stringify(first.thumbnailPrompt)}${first.thumbnailMotionPrompt ? `,"thumbnailMotionPrompt":${JSON.stringify(first.thumbnailMotionPrompt)}` : ''},"scenes":[`);
    }
    for (const scene of candidate.scenes) {
      request.signal?.throwIfAborted();
      const ordered = { ...scene, id: `scene_${String(scenes.length + 1).padStart(3, '0')}` };
      emit(`${scenes.length ? ',' : ''}${JSON.stringify(ordered)}`);
      scenes.push(ordered);
    }
    if (last) supportingNotes = candidate.supportingNotes || '';
    console.info(`Episode part ${index + 1}/${parts.length} validated: ${candidate.scenes.length} scenes, ${part.seconds}s planning.`);
  }
  const required = supportingSections(template);
  if (required.length) {
    const episode = JSON.stringify({ title: first!.title, thumbnailPrompt: first!.thumbnailPrompt,
      scenes: scenes.map(({ id, chapter, narration, duration, mediaType }) => ({ id, chapter, narration, duration, mediaType })) });
    let missing = required.map(section => section.id);
    for (let attempt = 0; attempt < 3 && missing.length; attempt++) {
      request.signal?.throwIfAborted();
      const response = await generate(apiKey, { model: request.model, signal: request.signal, max_tokens: 16384, json: true,
        jsonSchema: { type: 'object', properties: { supportingNotes: { type: 'object',
          properties: Object.fromEntries(required.map(section => [`section_${section.id}`, { type: 'string', description: `Complete requested editorial content for ${section.heading}. No heading needed; the app preserves it verbatim.` }])),
          required: required.map(section => `section_${section.id}`),
        } }, required: ['supportingNotes'] },
        messages: [
          { role: 'system', content: `Write only the complete supporting editorial notes for the finished episode supplied below. Preserve the template's research, factual constraints, sources, character/location canon, overlay, reflection, music, editing and publishing requirements. Do not change or repeat the full narration or generation prompts. Use the exact global scene IDs from the finished episode for scene references and cover the entire episode, not just its last part. Include these original headings verbatim with complete requested content:\n${required.map(section => section.heading).join('\n')}` },
          { role: 'user', content: `${template}\n\nFINISHED EPISODE (all scenes, in exact narration order):\n${episode}\n\nReturn supportingNotes as an object with section_ID keys and complete nonempty editorial content for each section. The app inserts the exact original headings. Required section IDs: ${missing.join(', ')}.` },
        ],
      });
      if (response.choices[0]?.finish_reason?.toUpperCase() !== 'STOP') continue;
      try {
        const value = JSON.parse(response.choices[0]?.message?.content || '');
        const bodies = value.supportingNotes;
        if (!bodies || typeof bodies !== 'object' || Array.isArray(bodies)) continue;
        missing = required.filter(section => typeof bodies[`section_${section.id}`] !== 'string' || !bodies[`section_${section.id}`].trim()).map(section => section.id);
        supportingNotes = required.filter(section => !missing.includes(section.id)).map(section => `${section.heading}\n\n${bodies[`section_${section.id}`].trim()}`).join('\n\n');
      } catch { /* Retry only editorial notes, preserving every completed scene. */ }
    }
    if (missing.length) throw new Error(`Missing episode supporting sections: ${missing.join(', ')}`);
  }
  emit(`],"supportingNotes":${JSON.stringify(supportingNotes)}}`);
}
