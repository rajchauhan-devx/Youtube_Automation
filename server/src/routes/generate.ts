import { mediaScenes } from '../services/shorts-media.js';
import { runMedia } from '../services/media-process.js';
import {
  resolveColabConfig,
  checkColabMedia,
  generateColabVideoFile,
  generateColabImageFile,
  colabDefaults,
} from '../services/colab-media.js';
import { generatedDir, workspaceKey, currentWorkspace } from '../services/workspace.js';
import { localMusicBusy } from '../services/local-music.js';
import { Router } from 'express';
import { presenterGuard } from '../services/presenter-guard.js';
import { presenterState } from '../services/presenter-state.js';
import fs from 'fs';
import path from 'path';
import { store } from '../services/store.js';
import {
  generateImage,
  checkComfyStatus,
  startComfyUI,
  stopComfyUI,
  interruptComfyUI,
  listAvailableModels,
  ComfyError,
  sanitizeSegment,
  type QualityPreset,
} from '../services/comfyui.js';

export const generateRouter = Router();
generateRouter.use(presenterGuard(['/start', '/image', '/colab-video', '/colab-image']));

const colabControllers = new Map<string, AbortController>();

generateRouter.get('/colab-status', async (req, res) => {
  try {
    const config = resolveColabConfig(req);
    res.json({ ok: true, configured: true, ...(await checkColabMedia(config)) });
  } catch (err: any) {
    res.json({ ok: true, configured: false, reachable: false, detail: err.message || 'Colab API is not configured.' });
  }
});

generateRouter.get('/colab-defaults', (_req, res) => {
  res.json(colabDefaults());
});

async function saveColabAsset(scriptId: string, index: number, scene: any, file: { filename: string }, mediaType: 'image' | 'video') {
  const current = store.getById<any>('scripts', scriptId);
  if (!current || JSON.stringify(mediaScenes({ ...current, section: currentWorkspace().profile })[index]) !== JSON.stringify(scene)) {
    throw Object.assign(new Error('Scene changed during generation. Generate again using the updated scene.'), { statusCode: 409 });
  }
  let duration: number | undefined;
  if (mediaType === 'video') {
    const full = path.join(generatedDir(), scriptId, file.filename);
    const probe = JSON.parse(await runMedia('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', full]));
    const visual = probe.streams?.find((stream: any) => stream.codec_type === 'video');
    duration = Number(visual?.duration || probe.format?.duration);
    if (!visual || !Number.isFinite(duration) || duration! <= 0) throw new Error('The Colab worker returned a video with no readable duration.');
  }
  const asset = {
    index,
    prompt: scene.imagePrompt,
    mediaType,
    status: 'done',
    url: `/api/accounts/${currentWorkspace().accountId}/profiles/${currentWorkspace().profile}/generate/file/${scriptId}/${file.filename}`,
    ...(duration !== undefined ? { duration } : {}),
  };
  const generatedImages = [...(current.generatedImages || []).filter((item: any) => item.index !== index || (item.mediaType || 'image') !== mediaType), asset].sort((a, b) => a.index - b.index);
  store.add('scripts', { ...current, generatedImages, timelineConfig: undefined, youtubeExport: undefined });
  return { asset, generatedImages };
}

// Colab jobs run for minutes on a remote worker; never let the HTTP
// server timeout kill the awaited response mid-job.
generateRouter.post('/colab-video', async (req, res) => {
  req.setTimeout(0);
  const profile = currentWorkspace().profile;
  if (profile === 'long') { res.status(400).json({ error: 'Video scenes belong in the Mixed Media or Shorts profile.' }); return; }
  const { scriptId, index, prompt, numFrames, steps } = req.body || {};
  if (!sanitizeSegment(scriptId) || !Number.isInteger(index) || index < 0 || index > 9999 || !prompt || typeof prompt !== 'string' || prompt.length > 20000) {
    res.status(400).json({ error: 'scriptId, index (number), and prompt (string) are required' });
    return;
  }
  const scene = mediaScenes({ ...store.getById<any>('scripts', scriptId), section: profile })[index];
  if (!scene || scene.mediaType !== 'video' || scene.imagePrompt !== prompt) {
    res.status(400).json({ error: 'Choose a video scene with its current extracted prompt.' });
    return;
  }
  const key = workspaceKey(`${scriptId}:${index}`);
  if (colabControllers.has(key)) { res.status(409).json({ error: 'A Colab job is already running for this scene.' }); return; }
  const controller = new AbortController();
  colabControllers.set(key, controller);
  presenterState.imageRequests++;
  try {
    const config = resolveColabConfig(req);
    const started = Date.now();
    const file = await generateColabVideoFile({
      config, scriptId, prompt,
      numFrames: Number.isInteger(numFrames) ? numFrames : undefined,
      steps: Number.isInteger(steps) ? steps : undefined,
      signal: controller.signal,
    });
    const saved = await saveColabAsset(scriptId, index, scene, file, 'video');
    res.json({ ok: true, url: saved.asset.url, duration: (saved.asset as any).duration, elapsedMs: Date.now() - started, generatedImages: saved.generatedImages });
  } catch (err: any) {
    console.error(`Colab video failed for ${key}:`, err.message);
    res.status(err.statusCode || 500).json({ error: err.message || 'Colab video generation failed' });
  } finally {
    colabControllers.delete(key);
    presenterState.imageRequests--;
  }
});

generateRouter.post('/colab-image', async (req, res) => {
  req.setTimeout(0);
  const profile = currentWorkspace().profile;
  const { scriptId, index, prompt, steps } = req.body || {};
  if (!sanitizeSegment(scriptId) || !Number.isInteger(index) || index < 0 || index > 9999 || !prompt || typeof prompt !== 'string' || prompt.length > 20000) {
    res.status(400).json({ error: 'scriptId, index (number), and prompt (string) are required' });
    return;
  }
  const mixed = ['mixed', 'shorts'].includes(profile);
  const scene = mixed ? mediaScenes({ ...store.getById<any>('scripts', scriptId), section: profile })[index] : undefined;
  if (mixed && (!scene || scene.mediaType !== 'image' || scene.imagePrompt !== prompt)) {
    res.status(400).json({ error: 'Choose an image scene with its current extracted prompt.' });
    return;
  }
  const key = workspaceKey(`${scriptId}:${index}`);
  if (colabControllers.has(key)) { res.status(409).json({ error: 'A Colab job is already running for this scene.' }); return; }
  const controller = new AbortController();
  colabControllers.set(key, controller);
  presenterState.imageRequests++;
  try {
    const config = resolveColabConfig(req);
    const started = Date.now();
    const file = await generateColabImageFile({
      config, scriptId, prompt,
      steps: Number.isInteger(steps) ? steps : undefined,
      signal: controller.signal,
    });
    // Long-profile images are free prompts with no scene plan; persist by index like local generation does.
    if (!mixed) {
      const current = store.getById<any>('scripts', scriptId);
      if (!current) { res.status(404).json({ error: 'Script not found' }); return; }
      const asset = {
        index, prompt, mediaType: 'image', status: 'done',
        url: `/api/accounts/${currentWorkspace().accountId}/profiles/${currentWorkspace().profile}/generate/file/${scriptId}/${file.filename}`,
      };
      const generatedImages = [...(current.generatedImages || []).filter((item: any) => item.index !== index || (item.mediaType || 'image') !== 'image'), asset].sort((a, b) => a.index - b.index);
      store.add('scripts', { ...current, generatedImages, timelineConfig: undefined, youtubeExport: undefined });
      res.json({ ok: true, url: asset.url, elapsedMs: Date.now() - started, generatedImages });
      return;
    }
    const saved = await saveColabAsset(scriptId, index, scene, file, 'image');
    res.json({ ok: true, url: saved.asset.url, elapsedMs: Date.now() - started, generatedImages: saved.generatedImages });
  } catch (err: any) {
    console.error(`Colab image failed for ${key}:`, err.message);
    res.status(err.statusCode || 500).json({ error: err.message || 'Colab image generation failed' });
  } finally {
    colabControllers.delete(key);
    presenterState.imageRequests--;
  }
});

generateRouter.post('/colab-cancel', async (req, res) => {
  const { scriptId, index } = req.body || {};
  const controller = colabControllers.get(workspaceKey(`${scriptId}:${index}`));
  if (controller) controller.abort();
  res.json({ ok: true, cancelled: !!controller });
});

const activeControllers = new Map<string, AbortController>();
const imageCompletions = new Map<string, Promise<void>>();
export async function cancelScriptImages(scriptId: string) {
  const prefix = workspaceKey(`${scriptId}:`);
  const keys = [...activeControllers.keys()].filter(key => key.startsWith(prefix));
  for (const key of keys) activeControllers.get(key)?.abort();
  if (keys.length) await interruptComfyUI();
  await Promise.all(keys.map(key => imageCompletions.get(key)));
}
const statusCode: Record<string, number> = {
  OFFLINE: 503,
  TIMEOUT: 504,
  CONFIG: 500,
  QUEUE_FAILED: 422,
  WORKFLOW_INVALID: 422,
  GENERATION_ERROR: 422,
  NO_OUTPUT: 422,
  DOWNLOAD_FAILED: 502,
  CANCELLED: 499,
};

generateRouter.get('/status', async (_req, res) => {
  res.json(await checkComfyStatus());
});

generateRouter.get('/models', async (_req, res) => {
  try {
    const models = await listAvailableModels();
    res.json({ models });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list models', models: [] });
  }
});

generateRouter.post('/start', async (_req, res) => {
  const result = await startComfyUI();
  res.json(result);
});

generateRouter.post('/stop', async (_req, res) => {
  if (presenterState.editingRequests) { res.status(409).json({ error: 'Cancel the artifact generation job before stopping ComfyUI.' }); return; }
  if (localMusicBusy()) { res.status(409).json({ error: 'Cancel music generation in Timeline & Render before stopping the local engine.' }); return; }
  const result = await stopComfyUI();
  res.json(result);
});

generateRouter.post('/image', async (req, res) => {
  if (localMusicBusy()) { res.status(409).json({ error: 'Wait for local music generation to finish before generating images.' }); return; }
  const {
    scriptId,
    index,
    prompt,
    seed,
    preset,
    modelName,
    stylePreset,
    enableQualityBooster,
    enableNegativeGuardrails,
  } = req.body || {};

  if (!sanitizeSegment(scriptId) || !Number.isInteger(index) || index < 0 || index > 9999 || !prompt || typeof prompt !== 'string' || prompt.length > 20000) {
    res.status(400).json({ error: 'scriptId, index (number), and prompt (string) are required' });
    return;
  }

  const validPreset: QualityPreset = preset === 'fast' || preset === 'high' ? preset : 'standard';

  const mixed = ['mixed', 'shorts'].includes(currentWorkspace().profile);
  const scene = mixed ? mediaScenes({ ...store.getById<any>('scripts', scriptId), section: currentWorkspace().profile })[index] : undefined;
  if (mixed && (!scene || scene.mediaType !== 'image' || scene.imagePrompt !== prompt)) {
    res.status(400).json({ error: 'Choose an image scene with its current extracted prompt. Video scenes must be imported.' });
    return;
  }

  const key = workspaceKey(`${scriptId}:${index}`);
  if (activeControllers.size) { res.status(409).json({ error: 'An image is already generating. Wait for completion before retrying.' }); return; }
  const controller = new AbortController();
  activeControllers.set(key, controller);
  let finishImage!: () => void;
  imageCompletions.set(key, new Promise<void>(resolve => { finishImage = resolve; }));
  presenterState.imageRequests++;

  try {
    const result = await generateImage({
      prompt,
      scriptId,
      index,
      seed: typeof seed === 'number' ? seed : undefined,
      signal: controller.signal,
      preset: validPreset,
      modelName: typeof modelName === 'string' ? modelName : undefined,
      stylePreset: typeof stylePreset === 'string' ? stylePreset : undefined,
      enableQualityBooster: enableQualityBooster !== false,
      enableNegativeGuardrails: enableNegativeGuardrails !== false,
    });
    let generatedImages;
    if (mixed) {
      const current = store.getById<any>('scripts', scriptId);
      if (!current || JSON.stringify(mediaScenes({ ...current, section: currentWorkspace().profile })[index]) !== JSON.stringify(scene)) {
        res.status(409).json({ error: 'Scene changed during generation. Generate again using the updated scene.' });
        return;
      }
      const asset = { index, prompt, mediaType: 'image', status: 'done', url: result.publicUrl, seed: result.seed, elapsedMs: result.elapsedMs };
      generatedImages = [...(current.generatedImages || []).filter((item: any) => item.index !== index || (currentWorkspace().profile === 'shorts' && item.mediaType === 'video')), asset].sort((a, b) => a.index - b.index);
      store.add('scripts', { ...current, generatedImages, timelineConfig: undefined, youtubeExport: undefined });
    }
    res.json({ ok: true, url: result.publicUrl, seed: result.seed, elapsedMs: result.elapsedMs, ...(mixed ? { generatedImages } : {}) });
  } catch (err: any) {
    console.error(`Generation failed for ${key}:`, err.message);
    if (err instanceof ComfyError) {
      res.status(statusCode[err.code] || 500).json({ error: err.message, code: err.code, detail: err.detail });
    } else {
      res.status(500).json({ error: err.message || 'Unknown generation error', code: 'UNKNOWN' });
    }
  } finally {
    activeControllers.delete(key);
    imageCompletions.delete(key);
    finishImage();
    presenterState.imageRequests--;
  }
});

generateRouter.post('/cancel', async (req, res) => {
  const { scriptId, index } = req.body || {};
  const key = workspaceKey(`${scriptId}:${index}`);
  const controller = activeControllers.get(key);
  if (controller) {
    controller.abort();
    await interruptComfyUI();
  }
  res.json({ ok: true, cancelled: !!controller });
});

generateRouter.get('/file/:scriptId/:filename', (req, res) => {
  const scriptId = sanitizeSegment(req.params.scriptId);
  const filename = sanitizeSegment(req.params.filename);
  if (!scriptId || !filename) {
    res.status(400).end();
    return;
  }
  const filePath = path.join(generatedDir(), scriptId, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).end();
    return;
  }

  // Determine Content-Type from extension for proper browser playback
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.webm': 'audio/webm',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  res.set({
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  });
  res.sendFile(filePath);
});
