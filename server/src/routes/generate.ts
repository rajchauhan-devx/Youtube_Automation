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
generateRouter.use(presenterGuard(['/start', '/image']));

const activeControllers = new Map<string, AbortController>();
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

  const mixed = currentWorkspace().profile === 'mixed';
  const scene = mixed ? store.getById<any>('scripts', scriptId)?.scenePlan?.scenes[index] : undefined;
  if (mixed && (!scene || scene.mediaType !== 'image' || scene.imagePrompt !== prompt)) {
    res.status(400).json({ error: 'Choose an image scene with its current extracted prompt. Video scenes must be imported.' });
    return;
  }

  const key = workspaceKey(`${scriptId}:${index}`);
  if (activeControllers.size) { res.status(409).json({ error: 'An image is already generating. Wait for completion before retrying.' }); return; }
  const controller = new AbortController();
  activeControllers.set(key, controller);
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
      if (!current || JSON.stringify(current.scenePlan?.scenes[index]) !== JSON.stringify(scene)) {
        res.status(409).json({ error: 'Scene changed during generation. Generate again using the updated scene.' });
        return;
      }
      const asset = { index, prompt, mediaType: 'image', status: 'done', url: result.publicUrl, seed: result.seed, elapsedMs: result.elapsedMs };
      generatedImages = [...(current.generatedImages || []).filter((item: any) => item.index !== index), asset].sort((a, b) => a.index - b.index);
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
