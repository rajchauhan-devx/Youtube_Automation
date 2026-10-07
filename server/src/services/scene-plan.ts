import { isTaggedShortsResponse, parseShortsPackage } from './shorts-package.js';
import { parseLegacyScenePackage } from './legacy-scene-package.js';
import {
  cleanSpokenNarration,
  distributeNarrationToScenes,
  isImageOnlyTemplate,
  parseSimpleTagPackage,
} from './simple-tag-package.js';

export { cleanSpokenNarration, distributeNarrationToScenes, isImageOnlyTemplate, parseSimpleTagPackage };

export interface NarrationScene {
  id: string;
  chapter: string;
  narration: string;
  imagePrompt: string;
  videoPrompt?: string;
  mediaType?: 'image' | 'video';
  duration?: number;
  role: 'story' | 'cta';
}
export interface ScenePlan { version: 1; title: string; scenes: NarrationScene[]; thumbnailPrompt: string; thumbnailMotionPrompt?: string; supportingNotes?: string }
export interface SceneTiming { sceneId: string; startSample: number; endSample: number }
export interface NarrationSync { version: 1; timingMode?: 'narration'; planHash: string; sampleRate: number; totalSamples: number; scenes: SceneTiming[] }
export const spokenText = (plan: ScenePlan) => plan.scenes.map(scene => scene.narration).join('\n\n');
export const normalizeNarration = (text: string) => text.normalize('NFC').replace(/\s+/g, ' ').trim();

/**
 * Keep a ScenePlan's per-scene narrations synchronized when the user edits or
 * enhances the full voiceover narration in the Audio tab or Script editor.
 */
export function syncScenePlanNarration(plan: ScenePlan, fullNarration: string): ScenePlan {
  const narrations = distributeNarrationToScenes(fullNarration, plan.scenes.length);
  return {
    ...plan,
    scenes: plan.scenes.map((scene, index) => ({
      ...scene,
      narration: narrations[index] || scene.narration,
    })),
  };
}

export function validateScenePlan(value: unknown): ScenePlan {
  const p = value as ScenePlan;
  if (p?.supportingNotes !== undefined && typeof p.supportingNotes !== 'string') throw new Error('Supporting notes must be text.');
  if (p?.thumbnailMotionPrompt !== undefined && (typeof p.thumbnailMotionPrompt !== 'string' || !p.thumbnailMotionPrompt.trim() || p.thumbnailMotionPrompt.length > 8000)) throw new Error('Thumbnail motion must contain 1–8000 characters.');
  if (!p || p.version !== 1 || typeof p.title !== 'string' || !p.title.trim() ||
      typeof p.thumbnailPrompt !== 'string' || !p.thumbnailPrompt.trim() ||
      !Array.isArray(p.scenes) || !p.scenes.length || p.scenes.length > 160) {
    throw new Error('The scene plan needs a title, thumbnail and 1–160 scenes.');
  }
  const ids = new Set<string>();
  for (const scene of p.scenes) {
    if (!scene) throw new Error('Each scene must be an object.');
    if (scene.videoPrompt !== undefined && (typeof scene.videoPrompt !== 'string' || !scene.videoPrompt.trim() || scene.videoPrompt.length > 8000)) throw new Error('Video prompts must contain 1–8000 characters.');
    if (scene.duration !== undefined && (!Number.isFinite(scene.duration) || scene.duration <= 0 || scene.duration > 60)) throw new Error('Scene duration must be between 0 and 60 seconds.');
    if (scene.mediaType !== undefined && !['image', 'video'].includes(scene.mediaType)) throw new Error('Scene media type must be image or video.');
    if (typeof scene.narration === 'string') {
      scene.narration = cleanSpokenNarration(scene.narration) || scene.narration.trim();
    }
    if (typeof scene.narration === 'string' && scene.narration.length > 700) throw new Error(`Scene ${scene.id}: narration has ${scene.narration.length} characters; use at most 700. Split this chapter across multiple scenes while keeping the required video quota.`);
    if (!scene || typeof scene.id !== 'string' || !/^[A-Za-z0-9_-]{1,60}$/.test(scene.id) || ids.has(scene.id) ||
        !['story', 'cta'].includes(scene.role) || typeof scene.chapter !== 'string' || !scene.chapter.trim() ||
        typeof scene.narration !== 'string' || !scene.narration.trim() || scene.narration.length > 700 ||
        typeof scene.imagePrompt !== 'string' || !scene.imagePrompt.trim() || scene.imagePrompt.length > 8000) {
      throw new Error('Each scene needs a unique ID, chapter, role, image prompt and spoken narration of at most 700 characters.');
    }
    ids.add(scene.id);
  }
  if (spokenText(p).length > 50000) throw new Error('Narration exceeds 50,000 characters. Split this video into separate episodes.');
  return p;
}

export function parseScenePlan(raw: string, _useTimelineNarration = false, options?: { isImageOnly?: boolean }): ScenePlan {
  if (raw.trimStart().startsWith('{')) {
    let value: unknown;
    try { value = JSON.parse(raw); }
    catch (error) { throw new Error(`The scene plan contains incomplete or invalid JSON: ${error instanceof Error ? error.message : 'parse failed'}`); }
    return validateScenePlan(value);
  }

  const longBlocks = [...raw.matchAll(/<long_video>\s*([\s\S]*?)\s*<\/long_video>/gi)];
  if (longBlocks.length === 1 && longBlocks[0][1].trimStart().startsWith('{')) {
    let value: unknown;
    try { value = JSON.parse(longBlocks[0][1]); }
    catch (error) { throw new Error(`The scene plan contains incomplete or invalid JSON: ${error instanceof Error ? error.message : 'parse failed'}`); }
    return validateScenePlan(value);
  }

  if (isTaggedShortsResponse(raw)) {
    return validateScenePlan(parseShortsPackage(raw));
  }

  if (/COVERAGE AND ASSET MANIFEST/i.test(raw)) {
    return validateScenePlan(parseLegacyScenePackage(raw));
  }

  // Primary universal 3-tag extraction (<script>/<narration>, <image_prompt>, <video_prompt>)
  return validateScenePlan(parseSimpleTagPackage(raw, options));
}

export function validateSync(plan: ScenePlan, sync: NarrationSync) {
  if (!sync || sync.version !== 1 || sync.sampleRate !== 48000 || !Number.isSafeInteger(sync.totalSamples) || sync.totalSamples <= 0 || sync.scenes?.length !== plan.scenes.length) throw new Error('Generate synchronized narration before rendering this Long Video.');
  let cursor = 0;
  sync.scenes.forEach((timing, i) => {
    if (timing.sceneId !== plan.scenes[i].id || timing.startSample !== cursor || !Number.isSafeInteger(timing.endSample) || timing.endSample - cursor < 1600) throw new Error('Narration timing has missing, reordered or invalid scene boundaries. Regenerate narration.');
    cursor = timing.endSample;
  });
  if (cursor !== sync.totalSamples) throw new Error('Narration timing does not cover the complete audio.');
}
