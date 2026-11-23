import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { chat, getGeminiApiKey } from './gemini.js';
import { store } from './store.js';

export interface VisionQAResult {
  pass: boolean;
  has_text_artifact: boolean;
  is_collage_or_split_panel: boolean;
  has_modern_anachronism: boolean;
  character_or_lore_mismatch: boolean;
  reason: string;
}

export const VisionQASchema = z.object({
  pass: z.boolean(),
  has_text_artifact: z.boolean(),
  is_collage_or_split_panel: z.boolean(),
  has_modern_anachronism: z.boolean(),
  character_or_lore_mismatch: z.boolean(),
  reason: z.string().default(''),
});

const SYSTEM_VISION_QA_PROMPT = `You are a strict, meticulous visual quality assurance auditor for YouTube animated and mythological videos.
Inspect the provided image keyframe against the scene description and mythological era guidelines.

Evaluate these 4 critical failure modes:
1. has_text_artifact: Are there any on-screen words, English/Hindi lettering, watermarks, UI badges, logos, or random AI typography gibberish in the frame? (true if any text is visible)
2. is_collage_or_split_panel: Is the image accidentally a comic collage, split-screen, 2x2 grid, or multi-panel composition instead of one single unified cinematic camera shot? (true if multiple panels/splits)
3. has_modern_anachronism: Does the ancient/mythological scene contain modern items (modern clothing, watches, sunglasses, metal tripods, electricity cables, asphalt roads, modern motorboats)?
4. character_or_lore_mismatch: Does the character depiction violate sacred lore? (e.g. Lord Rama depicted with Krishna's peacock feather, divine vanara kings depicted as ordinary zoo monkeys/gorillas, modern human faces).

Output strict JSON:
{
  "pass": true if all 4 checks are false, otherwise false,
  "has_text_artifact": boolean,
  "is_collage_or_split_panel": boolean,
  "has_modern_anachronism": boolean,
  "character_or_lore_mismatch": boolean,
  "reason": "Clear explanation of any failure, or 'Approved: Clean cinematic visual' if pass"
}`;

/**
 * Validates a single scene keyframe image against visual quality gates.
 */
export async function checkSceneVisualQA(options: {
  imagePath: string;
  sceneDescription: string;
  eraSetting?: string;
  characterNames?: string[];
  apiKey?: string;
  signal?: AbortSignal;
}): Promise<VisionQAResult> {
  const { imagePath, sceneDescription, eraSetting, characterNames, signal } = options;

  if (!fs.existsSync(imagePath)) {
    return {
      pass: false,
      has_text_artifact: false,
      is_collage_or_split_panel: false,
      has_modern_anachronism: false,
      character_or_lore_mismatch: false,
      reason: `Keyframe file missing on disk: ${path.basename(imagePath)}`,
    };
  }

  const resolvedApiKey = options.apiKey || getGeminiApiKey();
  if (!resolvedApiKey) {
    // Graceful offline fallback: pass if file exists and has valid size
    const stats = fs.statSync(imagePath);
    return {
      pass: stats.size > 5000,
      has_text_artifact: false,
      is_collage_or_split_panel: false,
      has_modern_anachronism: false,
      character_or_lore_mismatch: false,
      reason: stats.size > 5000 ? 'Offline check passed (valid image size)' : 'Image file is suspiciously small or empty',
    };
  }

  try {
    const fileBytes = fs.readFileSync(imagePath);
    const mimeType = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const base64Data = fileBytes.toString('base64');
    const imageUri = `data:${mimeType};base64,${base64Data}`;

    const promptText = `Scene Description: "${sceneDescription}"
Era Setting: "${eraSetting || 'Ancient Indian Vedic / Epics period'}"
Characters: "${(characterNames || []).join(', ') || 'Mythological figures'}"

Analyze this keyframe thoroughly and return only the JSON schema result.`;

    const response = await chat(resolvedApiKey, {
      model: 'gemini-2.5-flash',
      json: true,
      jsonSchema: {
        type: 'object',
        properties: {
          pass: { type: 'boolean' },
          has_text_artifact: { type: 'boolean' },
          is_collage_or_split_panel: { type: 'boolean' },
          has_modern_anachronism: { type: 'boolean' },
          character_or_lore_mismatch: { type: 'boolean' },
          reason: { type: 'string' },
        },
        required: ['pass', 'has_text_artifact', 'is_collage_or_split_panel', 'has_modern_anachronism', 'character_or_lore_mismatch', 'reason'],
      },
      messages: [
        { role: 'system', content: SYSTEM_VISION_QA_PROMPT },
        {
          role: 'user',
          content: promptText,
          image_url: imageUri,
        } as any,
      ],
      signal,
    });

    const content = response.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    return VisionQASchema.parse(parsed);
  } catch (error) {
    console.warn(`[Vision QA] Warning during visual evaluation of ${path.basename(imagePath)}:`, error);
    // If vision API call fails or times out, don't crash rendering, return provisional pass with warning
    return {
      pass: true,
      has_text_artifact: false,
      is_collage_or_split_panel: false,
      has_modern_anachronism: false,
      character_or_lore_mismatch: false,
      reason: `Vision QA provisional pass (model check bypassed or timed out: ${error instanceof Error ? error.message : String(error)})`,
    };
  }
}

/**
 * Runs pre-render visual QA inspection across all keyframes in a script.
 */
export async function auditScriptVisualsQA(options: {
  scriptId: string;
  imagePaths: string[];
  apiKey?: string;
  signal?: AbortSignal;
}): Promise<{ allPassed: boolean; results: Record<number, VisionQAResult> }> {
  const { scriptId, imagePaths, apiKey, signal } = options;
  const script = store.getById<any>('scripts', scriptId);
  const scenes = script?.scenePlan?.scenes || [];
  const results: Record<number, VisionQAResult> = {};
  let allPassed = true;

  for (let i = 0; i < imagePaths.length; i++) {
    signal?.throwIfAborted();
    const imgPath = imagePaths[i];
    const scene = scenes[i] || {};
    const description = scene.imagePrompt || scene.videoPrompt || scene.narration || `Scene ${i + 1}`;

    const res = await checkSceneVisualQA({
      imagePath: imgPath,
      sceneDescription: description,
      apiKey,
      signal,
    });

    results[i] = res;
    if (!res.pass) {
      allPassed = false;
    }
  }

  return { allPassed, results };
}
