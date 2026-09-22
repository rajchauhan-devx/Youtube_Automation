import { parseProductionPackage } from './production-package.js';

export interface NarrationScene {
  id: string;
  chapter: string;
  narration: string;
  imagePrompt: string;
  mediaType?: 'image' | 'video';
  duration?: number;
  role: 'story' | 'cta';
}
export interface ScenePlan { version: 1; title: string; scenes: NarrationScene[]; thumbnailPrompt: string }
export interface SceneTiming { sceneId: string; startSample: number; endSample: number }
export interface NarrationSync { version: 1; timingMode?: 'narration'; planHash: string; sampleRate: number; totalSamples: number; scenes: SceneTiming[] }
export const spokenText = (plan: ScenePlan) => plan.scenes.map(scene => scene.narration).join('\n\n');
export const normalizeNarration = (text: string) => text.normalize('NFC').replace(/\s+/g, ' ').trim();

export function validateScenePlan(value: unknown): ScenePlan {
  const p = value as ScenePlan;
  if (!p || p.version !== 1 || typeof p.title !== 'string' || !p.title.trim() ||
      typeof p.thumbnailPrompt !== 'string' || !p.thumbnailPrompt.trim() ||
      !Array.isArray(p.scenes) || !p.scenes.length || p.scenes.length > 160) {
    throw new Error('Long Video needs a complete scene plan with a title, thumbnail and 1–160 scenes. Generate with the Long Video template.');
  }
  const ids = new Set<string>();
  for (const scene of p.scenes) {
    if (!scene) throw new Error('Each scene must be an object.');
    if (scene.duration !== undefined && (!Number.isFinite(scene.duration) || scene.duration <= 0 || scene.duration > 60)) throw new Error('Scene duration must be between 0 and 60 seconds.');
    if (scene.mediaType !== undefined && !['image', 'video'].includes(scene.mediaType)) throw new Error('Scene media type must be image or video.');
    if (!scene || typeof scene.id !== 'string' || !/^[A-Za-z0-9_-]{1,60}$/.test(scene.id) || ids.has(scene.id) ||
        !['story', 'cta'].includes(scene.role) || typeof scene.chapter !== 'string' || !scene.chapter.trim() ||
        typeof scene.narration !== 'string' || !scene.narration.trim() || scene.narration.length > 700 ||
        typeof scene.imagePrompt !== 'string' || !scene.imagePrompt.trim() || scene.imagePrompt.length > 8000) {
      throw new Error('Each scene needs a unique ID, chapter, role, image prompt and narration of at most 700 characters.');
    }
    if (/[<>\[\]{}]|\((?:break|pause)\b/i.test(scene.narration)) throw new Error(`Scene ${scene.id}: use spoken text and punctuation only; no tags or stage directions.`);
    ids.add(scene.id);
  }
  if (spokenText(p).length > 50000) throw new Error('Narration exceeds 50,000 characters. Split this video into separate episodes.');
  return p;
}

export function parseScenePlan(raw: string, useTimelineNarration = false): ScenePlan {
  const blocks = [...raw.matchAll(/<long_video>\s*([\s\S]*?)\s*<\/long_video>/gi)];
  if (blocks.some(block => /^\s*(?:\*\*)?ASSET:/im.test(block[1]))) {
    if ((raw.match(/<long_video>/gi) || []).length !== blocks.length || (raw.match(/<\/long_video>/gi) || []).length !== blocks.length) throw new Error('An asset has an incomplete <long_video> wrapper.');
    return validateScenePlan(parseProductionPackage(raw, blocks.map(block => block[1]), useTimelineNarration));
  }
  if (blocks.length !== 1) throw new Error('No complete scene assets found. Include a production timeline and separate <long_video> asset blocks, or one legacy JSON scene-plan block.');
  let value: unknown;
  try { value = JSON.parse(blocks[0][1]); } catch { throw new Error('The Long Video scene plan contains incomplete or invalid JSON. Regenerate the response.'); }
  const plan = validateScenePlan(value);
  const script = raw.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
  if (script && normalizeNarration(script[1]) !== normalizeNarration(spokenText(plan))) throw new Error('The full narration differs from the scene narration. Correct the scene plan before extracting.');
  return plan;
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
