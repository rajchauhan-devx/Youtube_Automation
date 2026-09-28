import type { ScenePlan, NarrationScene } from './scene-plan.js';

interface MediaScript {
  section?: string;
  videoImportsEnabled?: boolean;
  scenePlan?: ScenePlan;
  imagePrompts?: string[];
}

// Keep the authored plan intact so switching media mode never changes narration.
export function mediaScenes(script?: MediaScript | null): NarrationScene[] {
  const scenes: NarrationScene[] = script?.scenePlan?.scenes || (script?.imagePrompts || []).map((imagePrompt, index) => ({
    id: `scene_${index + 1}`, chapter: `Scene ${index + 1}`, role: 'story' as const,
    narration: '', imagePrompt, mediaType: 'image' as const,
  }));
  return scenes.map(scene => {
    const mediaType = script?.section === 'shorts' && script.videoImportsEnabled !== true ? 'image' : scene.mediaType || 'image';
    return { ...scene, mediaType, imagePrompt: mediaType === 'video' ? scene.videoPrompt || scene.imagePrompt : scene.imagePrompt };
  });
}

export { SHORTS_MEDIA_TEMPLATE } from './shorts-production-template.js';

// Kept only to upgrade the exact original built-in template without overwriting custom prompts.
export const LEGACY_SHORTS_MEDIA_TEMPLATE = `Create an engaging vertical 9:16 YouTube Short about the requested topic, paced for the requested duration. Open with a strong hook, develop one clear story and end with a satisfying payoff. Use the requested narration language. Return exactly one <long_video> JSON block (this is the scene-plan container for Shorts too), without markdown fences:
{"version":1,"title":"Short title","thumbnailPrompt":"Separate portrait thumbnail prompt","scenes":[{"id":"scene_001","chapter":"Hook","role":"story","narration":"Spoken words only","mediaType":"video","duration":5,"imagePrompt":"Detailed portrait still-image alternative for this exact moment","videoPrompt":"Detailed portrait video prompt: subject, action, camera movement, lighting, continuity and five-second duration"},{"id":"scene_002","chapter":"Payoff","role":"story","narration":"Spoken words only","mediaType":"image","imagePrompt":"Detailed portrait still-image prompt"}]}
Create 3-12 concise scenes in narration order. Use both image and video scenes. Every scene must have a unique ID, chapter, role, narration, mediaType and imagePrompt. Every video scene also needs a videoPrompt and a planned duration of 3-10 seconds. Each imagePrompt must work as a standalone still image, including video scenes so image-only generation works. Match each visual to its exact spoken phrase. Maintain consistent people, clothing and locations. No captions, watermarks or written text in visuals. Keep narration within the requested duration at a natural speaking pace. Narration must contain no tags, stage directions or bracketed instructions. The thumbnail is separate and never a scene. Do not repeat the full narration outside the JSON.`;
