import { withScenePlanFormat } from './scene-plan-format.js';
import { parseScenePlan, spokenText } from './scene-plan.js';
import { incompleteResponse } from './generation-status.js';

export const NARRATION_WORDS_PER_MINUTE = 210;
export function generationSystemInstruction(profile: 'shorts' | 'long' | 'mixed', duration: number, structured = false) {
  const budget = narrationWordBudget(duration);
  return `You are an expert YouTube production writer. Follow the user's story, language, research, factual constraints and visual style. The app's serialization and selected episode settings take precedence over conflicting legacy output tags or example durations in the template. Return the complete scene-plan block first. Write ${budget.minimum}–${budget.maximum} spoken words for the selected ${duration}-second target. Every video prompt needs at least 80 words.\n\n${withScenePlanFormat('', profile)}${structured ? '\n\nProvider structured-output transport: return the schema object directly as bare JSON, without XML tags or Markdown fences. This transport replaces the <long_video> wrapper described above. Put all supporting research, canon, audit and publishing information in the supportingNotes string, including every requested original supporting section heading. The scene narrations remain the exact complete voice script.' : ''}`;
}

export const GENERATION_RESPONSE_SCHEMA = {
  type: 'object', required: ['version', 'title', 'thumbnailPrompt', 'scenes', 'supportingNotes'],
  properties: {
    version: { type: 'integer', description: 'Always 1.' }, title: { type: 'string' }, thumbnailPrompt: { type: 'string' },
    thumbnailMotionPrompt: { type: 'string', description: 'Only when the template requests thumbnail animation: complete motion prompt, separate from playback scenes.' },
    scenes: { type: 'array', items: {
      type: 'object', required: ['id', 'chapter', 'role', 'narration', 'mediaType', 'duration', 'imagePrompt'],
      properties: {
        id: { type: 'string' }, chapter: { type: 'string' }, role: { type: 'string', enum: ['story', 'cta'] },
        narration: { type: 'string', description: 'Exact spoken words, at most 700 characters.' }, mediaType: { type: 'string', enum: ['image', 'video'] },
        duration: { type: 'number', maximum: 60 },
        imagePrompt: { type: 'string', description: 'Complete standalone still prompt, at most 8000 characters.' },
        videoPrompt: { type: 'string', description: 'Only for video scenes: at least 80 words of shot direction, at most 8000 characters. Omit for images.' },
      },
    } },
    supportingNotes: { type: 'string', description: 'Complete requested research, character/location canon, editorial, reflection, overlay and publishing sections using their original Markdown headings.' },
  },
};
export function generationResponseSchema(duration: number, template = '') {
  // Small, evenly budgeted spoken segments prevent long episodes collapsing
  // into a synopsis, even when a provider cannot count a whole script reliably.
  const count = Math.min(160, Math.ceil(duration / 10));
  const minimum = promptMinimumWords(template);
  const schema = { ...GENERATION_RESPONSE_SCHEMA, properties: { ...GENERATION_RESPONSE_SCHEMA.properties,
    scenes: { ...GENERATION_RESPONSE_SCHEMA.properties.scenes,
      description: `Prefer ${count} ordered playback scenes with approximately ${Math.round(duration * NARRATION_WORDS_PER_MINUTE / 60 / count)} spoken words each. Narrative chapters may span several visual scenes. Keep the authored video quota; it is not the total scene count. Never pack a whole chapter into narration exceeding 700 characters.`,
      items: { ...GENERATION_RESPONSE_SCHEMA.properties.scenes.items,
      properties: { ...GENERATION_RESPONSE_SCHEMA.properties.scenes.items.properties,
        imagePrompt: { type: 'string', description: `Complete standalone production prompt. Write at least ${minimum.image} words of concrete composition, continuity, lighting and setting detail; aim above this minimum. At most 8000 characters.` },
        videoPrompt: { type: 'string', description: `Only for video scenes. Write at least ${minimum.video} words of continuous-shot production direction; aim above this minimum. At most 8000 characters. Omit for image scenes.` },
      },
    } },
  } };
  // Large array cardinality constraints are rejected by Gemini's schema
  // compiler. Keep the transport compact and validate content in the app.
  return duration >= 180 ? { ...schema, properties: { ...schema.properties,
    scenes: { ...schema.properties.scenes, description: `Create ${count} ordered scenes with about ${Math.round(duration * NARRATION_WORDS_PER_MINUTE / 60 / count)} spoken words each for this ${duration}-second episode.`, items: {
      ...schema.properties.scenes.items, properties: {
        ...schema.properties.scenes.items.properties,
        narration: { type: 'string', description: `Approximately ${Math.round(duration * NARRATION_WORDS_PER_MINUTE / 60 / count)} spoken words for this scene, at most 700 characters. Develop the story progressively.` },
      },
    } },
  } } : schema;
}
export function narrationWordBudget(duration: number) {
  const words = Math.round(duration * NARRATION_WORDS_PER_MINUTE / 60);
  return { minimum: Math.ceil(words * 0.9), maximum: Math.floor(words * 1.1) };
}

// The JSON replaces narration and asset serialization, while editorial notes
// requested by a saved template still belong in the visible response.
export function supportingSections(template: string) {
  const sections = template.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^#{1,6}\s+[^\n]*?\bSECTION\s+(\d+[A-Z]?)\b\s*[—–:-]\s*(.*)/i);
    return match && /TEXT OVERLAYS|REFLECTION|BACKGROUND MUSIC|SOUND\s*\+\s*EDITING|YOUTUBE PACKAGE/i.test(match[2])
      ? [{ id: match[1].toUpperCase(), heading: line }] : [];
  });
  return [...new Map(sections.map(section => [section.id, section])).values()];
}
export function requiredVideoCount(template: string): number | undefined {
  const heading = template.split(/\r?\n/).find(line => /^#{1,6}\s+.*\bSECTION\s+3B\b/i.test(line));
  if (!heading) return /^#{1,6}[^\n]*SECTION\s+5[^\n]*ALL STILL[- ]IMAGE/im.test(template) ? 0 : undefined;
  if (/IMAGE[- ]ONLY/i.test(heading)) return 0;
  const thumbnail = thumbnailMotionScenes(template);
  if (thumbnail !== undefined) return thumbnail;
  const budget = template.match(/Default clip budget:\s*(\d+)/i)?.[1];
  if (budget) return Number(budget);
  const count = heading.match(/\b(\d+)\s+SCENES?\s+ONLY\b/i)?.[1];
  return count ? Number(count) : undefined;
}
function thumbnailMotionScenes(template: string) {
  const scenes = template.match(/EXACTLY\s+\d+\s+images:\s*Thumbnail\s*\+\s*(\d+)\s+scene\s+images/i)?.[1];
  return scenes ? Number(scenes) : undefined;
}
export const requiresThumbnailMotion = (template: string) => thumbnailMotionScenes(template) !== undefined;
export function requiresBothMedia(template: string) {
  if (requiredVideoCount(template) === 0) return false;
  return /\bSECTION\s+3B\b[^\n]*VIDEO|\bSECTION\s+5\b[^\n]*IMAGE\s*\+\s*VIDEO|\buse both image and video scenes\b|^#{1,3}[^\n]*IMAGE,?\s+VIDEO\s*&\s*AUDIO PRODUCTION/im.test(template);
}
export function promptMinimumWords(template: string) {
  const text = template.replace(/[*`_]/g, ' ');
  const floor = (kind: string) => {
    const rules = [
      new RegExp(`\\b${kind}\\s+(?:generation\\s+)?prompts?\\b[^\\n]{0,140}?\\b(?:under|below|at least)\\s+(\\d+)\\s+words\\b`, 'gi'),
      new RegExp(`\\b${kind}\\s+(?:generation\\s+)?prompts?\\b[^\\n]{0,140}?\\b(\\d+)\\s*[–—-]\\s*\\d+\\s+words\\b`, 'gi'),
    ];
    return Math.max(0, ...rules.flatMap(rule => [...text.matchAll(rule)].map(match => Number(match[1]))));
  };
  return { image: floor('image'), video: Math.max(80, floor('video')) };
}

export function buildGenerationPrompt(template: string, topic: string, instructions: string, duration: number, profile: 'shorts' | 'long' | 'mixed') {
  const budget = narrationWordBudget(duration);
  const supporting = supportingSections(template);
  const videos = requiredVideoCount(template);
  const minimum = promptMinimumWords(template);
  const sceneCount = Math.min(160, Math.ceil(duration / 10));
  return `${withScenePlanFormat(template, profile)}

## Selected episode settings
Topic: ${topic.trim()}
Target Duration: ~${duration} seconds.
The selected runtime overrides default or example runtime ranges in the template. Write ${budget.minimum}–${budget.maximum} spoken words across the complete scene narration, aiming for ${Math.round(duration * NARRATION_WORDS_PER_MINUTE / 60)} words. This budget uses the local narrator's approximate 210 words/minute; punctuation and the selected voice affect the measured result. Develop the story to this length without repeated filler. Do not return a short synopsis of a long episode.
Planning durations must sum to ${duration} seconds (within 10%). Use enough narration-linked scenes to cover the entire story; never include the thumbnail in playback. Every profile requires narration of at most 700 characters per scene. A narrative chapter or framework beat may span several visual scenes; it is not a limit on the playback scene count. Put the complete shared JSON scene-plan block FIRST, then supporting research, canon, audit and publishing information. Do not duplicate spoken narration or asset prompts in additional extraction wrappers. Every videoPrompt must contain at least 80 words of specific action, framing, lighting and continuity direction; preserve a longer minimum if the template requests one. For multiple characters, give each a distinct identity and position in the frame; do not merge their clothes, faces or props.
${duration < 180 ? `Short-episode allocation: prefer ${sceneCount} ordered playback scenes with approximately ${Math.round(duration * NARRATION_WORDS_PER_MINUTE / 60 / sceneCount)} spoken words each, unless an explicit authored asset count requires a different allocation. Split long chapter narration over additional visual scenes instead of exceeding 700 characters or shortening the complete voice script. The video quota below applies only to video scenes, not to all playback scenes.` : ''}
${duration >= 180 ? `Long-episode allocation: create ${sceneCount} ordered playback scenes. Write approximately ${Math.round(duration * NARRATION_WORDS_PER_MINUTE / 60 / sceneCount)} spoken words in EACH scene, so the full episode reaches the selected budget. Develop chapters progressively across these scenes; do not spend the entire episode repeating the hook. Each scene's planning duration is approximately ${(duration / sceneCount).toFixed(2)} seconds.` : ''}
${videos !== undefined ? `The template requires exactly ${videos} video scenes. ${videos === 0 ? 'Every playback scene must use mediaType image.' : 'Choose the strongest beats for those videos; remaining scenes use images.'}` : ''}
${requiresThumbnailMotion(template) ? `The template also requests thumbnail animation. Put its complete ${minimum.video}+ word motion prompt in thumbnailMotionPrompt, separately from the ${videos} playback video scenes. Never insert the thumbnail into the narration or playback timeline.` : ''}
${requiresBothMedia(template) ? 'This template requires both image and video playback scenes. Include at least one of each.' : ''}
Each imagePrompt must contain at least ${minimum.image} words and each videoPrompt at least ${minimum.video} words when present. Expand with concrete renderable detail, not repeated adjectives.
${supporting.length ? `After </long_video>, include these original supporting section headings with their complete requested editorial content (without repeating extraction wrappers):\n${supporting.map(section => section.heading).join('\n')}` : ''}
${instructions.trim() ? `Additional Instructions: ${instructions.trim()}` : ''}`.trim();
}

/** System line for template-driven free chat. The template owns the tag
 * system and visual style, but the user's selected runtime and minimum scene
 * count override any default/example/maximum runtime inside the template. */
export const FREE_CHAT_SYSTEM =
  'You are a helpful video production assistant. Follow the user template instructions, story requirements and output format exactly, including every tag, heading and serialization rule it defines. Do not impose any other format. EXCEPTION: the selected Target duration and minimum scene/image count in the user message override any default, example or maximum runtime in the template — you must scale the episode to that runtime.';

/** Free-chat prompt used by the Preview tab: the template goes through
 * untouched, plus the episode topic, an authoritative target duration and any
 * extra instructions. The template owns the tag system and visual style, but
 * the selected runtime overrides any default/example runtime inside it; asset
 * extraction validates the template's own tag system. */
export function buildFreePrompt(template: string, topic: string, instructions: string, duration: number): string {
  const head = (template || '').trimEnd();
  const target = Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 30;
  // Floor so longer durations cannot collapse to the same handful of beats:
  // ~1 scene per 6s matches the built-in Shorts ranges (4-7 for 30s, 7-12
  // for 60s, 12-20 for 90-120s) and stays within the denser custom
  // image-only ranges. The template may add MORE scenes for meaningful
  // beats; it must not return fewer.
  const minScenes = Math.min(160, Math.max(3, Math.ceil(target / 6)));
  const tail = [`Topic: ${(topic || '').trim()}`,
    `Target duration: ~${target} seconds. MANDATORY: this selected runtime overrides any default, example or maximum runtime in the template (e.g. 45-75s default / 105s cap). Scene planned durations must sum to ~${target} seconds (within 10%). You MUST return at least ${minScenes} narration-linked scenes with exactly one still image per scene (so at least ${minScenes} playback <image_prompt> blocks numbered #image 1..N plus a separate thumbnail #image 0, or at least ${minScenes} entries in the <long_video> scenes array when using JSON). If a story beat is longer than ~6 seconds, split it into A/B images with new numeric IDs to reach the count. NEVER return only 5 playback images for a 60s+ episode — scale the count with duration. Write every <image_prompt> block in full (complete Prompt, Negative Prompt and Style Tags); placeholders such as [...Repeat for images...], "following the same standard" or "repeat for the remaining" are a failed deliverable.`];
  if (instructions.trim()) tail.push(`Additional instructions: ${instructions.trim()}`);
  return `${head}${head ? '\n\n' : ''}${tail.join('\n')}`.trim();
}

/** Completion means an extractable plan, not merely a provider STOP event. */
export function generationIssue(prompt: string, response: string, duration: number, checkPromptDetails = true): string | undefined {
  const unfinished = incompleteResponse(prompt, response);
  if (unfinished) return unfinished;
  try {
    const plan = parseScenePlan(response);
    const budget = narrationWordBudget(duration);
    const words = spokenText(plan).split(/\s+/u).filter(Boolean).length;
    if (words < budget.minimum || words > budget.maximum) return `Narration has ${words} words; the ${duration}s target needs ${budget.minimum}–${budget.maximum}.`;
    const seconds = plan.scenes.reduce((sum, scene) => sum + (scene.duration || 0), 0);
    if (Math.abs(seconds - duration) > duration * 0.1) return `Scene planning covers ${seconds}s instead of the ${duration}s target.`;
    if (checkPromptDetails) {
    const minimum = promptMinimumWords(prompt);
    const shortVideo = plan.scenes.find(scene => scene.mediaType === 'video' && (scene.videoPrompt || '').split(/\s+/u).filter(Boolean).length < minimum.video);
    if (shortVideo) return `Scene ${shortVideo.id}: videoPrompt needs at least ${minimum.video} words of production direction.`;
    const shortImage = plan.scenes.find(scene => scene.imagePrompt.split(/\s+/u).filter(Boolean).length < minimum.image);
    if (shortImage) return `Scene ${shortImage.id}: imagePrompt needs at least ${minimum.image} words of production detail.`;
    if (requiresThumbnailMotion(prompt) && (plan.thumbnailMotionPrompt || '').split(/\s+/u).filter(Boolean).length < minimum.video) return `The separate thumbnailMotionPrompt needs at least ${minimum.video} words; the thumbnail is not a playback scene.`;
    }
    const expectedVideos = requiredVideoCount(prompt);
    const videos = plan.scenes.filter(scene => scene.mediaType === 'video').length;
    if (expectedVideos !== undefined && videos !== expectedVideos) return `The template requires ${expectedVideos} video scenes; received ${videos}.`;
    if (requiresBothMedia(prompt) && (!videos || videos === plan.scenes.length)) return 'The template requires both image and video playback scenes.';
    const notes = `${response}\n${plan.supportingNotes || ''}`;
    const receivedSections = new Set([...notes.matchAll(/^#{1,6}\s+[^\n]*?\bSECTION\s+(\d+[A-Z]?)\b/gim)].map(match => match[1].toUpperCase()));
    const missing = [...new Set(supportingSections(prompt).map(section => section.id))].filter(id => !receivedSections.has(id));
    if (missing.length) return `Missing requested supporting sections: ${missing.join(', ')}. Keep the original section headings.`;
  } catch (error) { return error instanceof Error ? error.message : 'The response has no valid linked scene plan.'; }
}
