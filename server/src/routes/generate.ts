import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { generateImage, checkComfyStatus, startComfyUI, stopComfyUI, ComfyError, GENERATED_DIR, sanitizeSegment } from '../services/comfyui.js';

export const generateRouter = Router();

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

generateRouter.post('/start', async (_req, res) => {
  const result = await startComfyUI();
  res.json(result);
});

generateRouter.post('/stop', async (_req, res) => {
  const result = await stopComfyUI();
  res.json(result);
});

generateRouter.post('/image', async (req, res) => {
  const { scriptId, index, prompt, seed } = req.body || {};
  if (!scriptId || typeof index !== 'number' || !prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'scriptId, index (number), and prompt (string) are required' });
    return;
  }

  const key = `${scriptId}:${index}`;
  const controller = new AbortController();
  activeControllers.set(key, controller);

  try {
    const result = await generateImage({ prompt, scriptId, index, seed, signal: controller.signal });
    res.json({ ok: true, url: result.publicUrl, seed: result.seed, elapsedMs: result.elapsedMs });
  } catch (err: any) {
    console.error(`Generation failed for ${key}:`, err.message);
    if (err instanceof ComfyError) {
      res.status(statusCode[err.code] || 500).json({ error: err.message, code: err.code, detail: err.detail });
    } else {
      res.status(500).json({ error: err.message || 'Unknown generation error', code: 'UNKNOWN' });
    }
  } finally {
    activeControllers.delete(key);
  }
});

generateRouter.post('/cancel', (req, res) => {
  const { scriptId, index } = req.body || {};
  const key = `${scriptId}:${index}`;
  const controller = activeControllers.get(key);
  if (controller) {
    controller.abort();
    activeControllers.delete(key);
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
  const filePath = path.join(GENERATED_DIR, scriptId, filename);
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
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  const stat = fs.statSync(filePath);
  res.set({
    'Content-Type': contentType,
    'Content-Length': String(stat.size),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  });
  res.sendFile(filePath);
});
