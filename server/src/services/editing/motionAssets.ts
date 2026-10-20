import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { EditingProject } from '@tubeflow/editing-contracts';
import { generateGoogleImage } from '../google-image.js';
import { generatedDir } from '../workspace.js';
import { assetRecord, atomic, objectHash, projectDir, saveAsset } from './repository.js';
import type { MotionContext } from './motionProvider.js';
import { EditingError } from './config.js';

export async function isolateMotionAsset(bytes: Buffer) {
  const image = sharp(bytes).ensureAlpha(), metadata = await image.metadata();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const count = info.width * info.height;
  let clear = 0;
  for (let i = 0; i < count; i++) if (data[i * 4 + 3] < 16) clear++;
  if (clear < count * 0.05) {
    // Only remove a connected, explicitly requested chroma backdrop. No semantic
    // guesses, destructive photo cutouts, or false claims of model transparency.
    const visited = new Uint8Array(count), queue = new Uint32Array(count); let head = 0, tail = 0;
    const add = (i: number) => {
      if (visited[i]) return; visited[i] = 1;
      const k = i * 4, r = data[k], g = data[k + 1], b = data[k + 2];
      if (r > 145 && b > 115 && g < 145 && Math.min(r, b) - g > 65) queue[tail++] = i;
    };
    for (let x = 0; x < info.width; x++) { add(x); add((info.height - 1) * info.width + x); }
    for (let y = 0; y < info.height; y++) { add(y * info.width); add(y * info.width + info.width - 1); }
    while (head < tail) {
      const i = queue[head++]; data[i * 4 + 3] = 0;
      if (i % info.width) add(i - 1); if (i % info.width < info.width - 1) add(i + 1);
      if (i >= info.width) add(i - info.width); if (i < count - info.width) add(i + info.width);
    }
  }
  let occupied = 0;
  for (let i = 0; i < count; i++) if (data[i * 4 + 3] > 32) occupied++;
  if (occupied < count * 0.03 || occupied > count * 0.9) throw new Error('Generated motion asset lacks a usable isolated silhouette. A rectangular photo cannot be used as a cutout.');
  return { bytes: await sharp(data, { raw: info }).png().toBuffer(), width: metadata.width!, height: metadata.height! };
}

export async function motionAsset(project: EditingProject, prompt: string, ctx: MotionContext) {
  const file = path.join(projectDir(project.id), 'motion-assets.json');
  let cache: Record<string, string> = {};
  try { cache = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* New project. */ }
  const key = objectHash({ version: 1, prompt });
  if (cache[key]) return assetRecord(cache[key]);
  if (!project.settings.maxGeneratedAssets || Object.keys(cache).length >= project.settings.maxGeneratedAssets)
    throw new EditingError('RESOURCE_LIMIT', 'This edit has reached its separate motion asset limit. Use a native diagram or existing verified asset.');
  ctx.stage('Generating a separate motion-design asset', Object.keys(cache).length, project.settings.maxGeneratedAssets);
  if (ctx.job.usage.length >= ctx.maxCalls) throw new EditingError('RESOURCE_LIMIT', 'Motion asset request budget exhausted.');
  const result = await generateGoogleImage({ scriptId: project.scriptId, index: Object.keys(cache).length, filePrefix: 'motion-asset',
    signal: ctx.signal, aspectRatio: '1:1', assetOnly: true, modelName: process.env.EDITING_ASSET_IMAGE_MODEL,
    maxAttempts: Math.min(3, ctx.maxCalls - ctx.job.usage.length),
    prompt: `Create exactly this standalone editorial illustration asset: ${prompt}. The entire subject must fit with 12% padding. Uniform flat electric magenta (#ff00ff) backdrop for chroma removal; no floor, backdrop shadows, scene, border, text, labels, numbers, watermark or photographic rectangle. A clean isolated silhouette, realistic material, upper-left key light. This is an illustrative graphic, never archival evidence.`,
    onAttempt: model => {
      if (ctx.job.usage.length >= ctx.maxCalls) throw new EditingError('RESOURCE_LIMIT', 'Motion asset request budget exhausted.');
      ctx.job.usage.push({ operation: 'generate-motion-asset', model, promptVersion: 'editorial-v1', prompt_tokens: 0, completion_tokens: 0 }); ctx.persist();
    },
  });
  const isolated = await isolateMotionAsset(fs.readFileSync(path.join(generatedDir(), project.scriptId, result.fileName)));
  const asset = saveAsset(isolated.bytes, { mime: 'image/png', width: isolated.width, height: isolated.height,
    alpha: true, method: 'generate', providerVersion: result.model, attribution: 'AI-generated illustrative motion asset' });
  cache[key] = asset.id; atomic(file, cache);
  return asset;
}
