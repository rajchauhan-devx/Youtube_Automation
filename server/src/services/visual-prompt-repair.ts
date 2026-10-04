import { chat } from './gemini.js';
import { validateScenePlan, type ScenePlan } from './scene-plan.js';
import { promptMinimumWords, requiresThumbnailMotion } from './script-generation.js';

const words = (text: string) => text.split(/\s+/u).filter(Boolean).length;
/** Expand only deficient visual fields; never regenerate a valid voice script. */
export async function repairVisualPrompts(apiKey: string, input: ScenePlan, template: string, model: string,
  signal?: AbortSignal, generate = chat) {
  const plan = structuredClone(validateScenePlan(input));
  const minimum = promptMinimumWords(template);
  for (let attempt = 0; attempt < 3; attempt++) {
    signal?.throwIfAborted();
    const pending = plan.scenes.flatMap(scene => {
      const image = words(scene.imagePrompt) < minimum.image;
      const video = scene.mediaType === 'video' && words(scene.videoPrompt || '') < minimum.video;
      return image || video ? [{ id: scene.id, narration: scene.narration, imagePrompt: scene.imagePrompt, videoPrompt: scene.videoPrompt,
        expandImage: image, expandVideo: video, imageWords: words(scene.imagePrompt), videoWords: words(scene.videoPrompt || '') }] : [];
    });
    const thumbnailId = 'thumbnail:motion'; // ':' cannot occur in a playback scene ID.
    if (requiresThumbnailMotion(template) && words(plan.thumbnailMotionPrompt || '') < minimum.video) pending.push({
      id: thumbnailId, narration: '', imagePrompt: plan.thumbnailPrompt, videoPrompt: plan.thumbnailMotionPrompt,
      expandImage: false, expandVideo: true, imageWords: words(plan.thumbnailPrompt), videoWords: words(plan.thumbnailMotionPrompt || ''),
    });
    if (!pending.length) return plan;
    const response = await generate(apiKey, { model, signal, max_tokens: 16384, json: true,
      jsonSchema: { type: 'object', properties: { prompts: { type: 'array', items: { type: 'object', properties: {
        id: { type: 'string' }, imagePrompt: { type: 'string' }, videoPrompt: { type: 'string' },
      }, required: ['id', 'imagePrompt'] } } }, required: ['prompts'] },
      messages: [
        { role: 'system', content: `Edit ONLY the requested visual prompt fields. Preserve every factual subject, exact character identity, wardrobe, location, composition, style and continuity requirement. Do not write or change narration, scenes, timing, titles or research. Return a prompts array with the exact supplied scene IDs. Where expandImage is true, expand imagePrompt to approximately ${Math.ceil(minimum.image * 1.35)} words, never fewer than ${minimum.image}. Where expandVideo is true, expand videoPrompt to approximately ${Math.ceil(minimum.video * 1.35)} words, never fewer than ${minimum.video}. Add concrete lighting, spatial composition, physical action and framing detail, avoiding filler. Preserve other fields verbatim. No prompt may exceed 8000 characters.` },
        { role: 'user', content: `${template}\n\nVISUAL FIELD REPAIR ONLY. The story is already complete. Expand only the flagged prompts, keeping the supplied scene IDs:\n${JSON.stringify(pending)}` },
      ],
    });
    if (response.choices[0]?.finish_reason?.toUpperCase() !== 'STOP') continue;
    let edits: any;
    try { edits = JSON.parse(response.choices[0]?.message?.content || ''); } catch { continue; }
    if (!Array.isArray(edits.prompts)) continue;
    for (const item of pending) {
      const matches = edits.prompts.filter((edit: any) => edit?.id === item.id);
      if (matches.length !== 1) continue;
      const edit = matches[0];
      if (item.id === thumbnailId) {
        if (typeof edit.videoPrompt === 'string' && edit.videoPrompt.length <= 8000 && words(edit.videoPrompt) >= minimum.video) plan.thumbnailMotionPrompt = edit.videoPrompt;
        continue;
      }
      const scene = plan.scenes.find(scene => scene.id === item.id)!;
      if (item.expandImage && typeof edit.imagePrompt === 'string' && edit.imagePrompt.length <= 8000 && words(edit.imagePrompt) >= minimum.image) scene.imagePrompt = edit.imagePrompt;
      if (item.expandVideo && typeof edit.videoPrompt === 'string' && edit.videoPrompt.length <= 8000 && words(edit.videoPrompt) >= minimum.video) scene.videoPrompt = edit.videoPrompt;
    }
  }
  const invalid = plan.scenes.find(scene => words(scene.imagePrompt) < minimum.image || (scene.mediaType === 'video' && words(scene.videoPrompt || '') < minimum.video));
  if (invalid) throw new Error(`Scene ${invalid.id}: visual prompts still fall below the template minimum after repair.`);
  if (requiresThumbnailMotion(template) && words(plan.thumbnailMotionPrompt || '') < minimum.video) throw new Error('The separate thumbnail motion prompt is still incomplete after repair.');
  return validateScenePlan(plan);
}
