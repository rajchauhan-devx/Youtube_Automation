import { Router } from 'express';
import { presenterGuard } from '../services/presenter-guard.js';
import { localMusicBusy } from '../services/local-music.js';
import { currentWorkspace } from '../services/workspace.js';
import { safeSegment } from '../services/paths.js';
import { startNarration, narrationStatus, cancelNarration } from '../services/long-narration.js';
import { clearScriptVideo } from './render.js';
import { getChatterboxVoiceReference } from '../services/chatterbox-tts.js';
import {
  createLocalVoice,
  deleteLocalVoice,
  generateTTS,
  getTtsProviderStatus,
  getVoices,
  previewTTS,
  startOmniVoice,
  stopOmniVoice,
  TTS_PROVIDER_NAME,
  TtsError,
} from '../services/omnivoice.js';

export const ttsRouter = Router();
ttsRouter.use(presenterGuard(['/start', '/long/start', '/preview', '/generate']));
ttsRouter.use((req, res, next) => {
  if (req.method === 'POST' && ['/start', '/long/start', '/preview', '/generate'].includes(req.path) && localMusicBusy()) {
    res.status(409).json({ error: 'Wait for local music generation to finish before generating narration.' }); return;
  }
  next();
});

ttsRouter.post('/long/start', async (req, res) => {
  const { scriptId, language, voice, rate, pitch, speed, exaggeration, cfgWeight, temperature, seed } = req.body || {};
  if (currentWorkspace().profile === 'shorts' || !safeSegment(scriptId) || !['hi', 'en'].includes(language) || typeof voice !== 'string' || !voice) {
    res.status(400).json({ error: 'Select a Long Video script, language and voice.' }); return;
  }
  let started = false;
  try {
    // Reserve the narration job synchronously before invalidating existing render output.
    startNarration({ scriptId, language, voice, rate, pitch, speed, exaggeration, cfgWeight, temperature, seed });
    started = true;
    await clearScriptVideo(scriptId);
    res.status(202).json(narrationStatus(scriptId));
  } catch (error) {
    if (started) await cancelNarration(scriptId);
    res.status(409).json({ error: errorMessage(error, 'Could not start synchronized narration') });
  }
});
ttsRouter.get('/long/status/:id', (req, res) => {
  if (!safeSegment(req.params.id)) { res.status(400).json({ error: 'Invalid script ID' }); return; }
  res.json(narrationStatus(req.params.id));
});
ttsRouter.post('/long/cancel/:id', async (req, res) => {
  if (!safeSegment(req.params.id)) { res.status(400).json({ error: 'Invalid script ID' }); return; }
  await cancelNarration(req.params.id);
  res.json({ ok: true });
});

const statusCode: Record<string, number> = {
  API_ERROR: 502,
  TIMEOUT: 504,
  CONNECTION_REFUSED: 503,
  CONFIG: 500,
  NOT_READY: 503,
  VALIDATION: 400,
  UNKNOWN: 500,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

ttsRouter.get('/status', async (_req, res) => {
  res.json(await getTtsProviderStatus());
});

ttsRouter.get('/voices', async (req, res, next) => {
  const language = req.query.language;
  if (language !== undefined && language !== 'en' && language !== 'hi') {
    res.status(400).json({ error: 'language must be "hi" or "en"' }); return;
  }
  try {
    const voices = await getVoices(language);
    res.json({ voices, provider: TTS_PROVIDER_NAME });
  } catch (error) { next(error); }
});

ttsRouter.get('/voices/:id/reference', (req, res, next) => {
  try {
    const reference = getChatterboxVoiceReference(req.params.id);
    if (!reference) { res.status(404).json({ error: 'Voice reference not found' }); return; }
    res.set('Cache-Control', 'private, no-store');
    res.sendFile(reference);
  } catch (error) { next(error); }
});

ttsRouter.post('/start', async (_req, res) => {
  const result = await startOmniVoice();
  res.json(result);
});

ttsRouter.post('/stop', async (_req, res) => {
  const result = await stopOmniVoice();
  res.json(result);
});

ttsRouter.post('/preview', async (req, res) => {
  const { text, voice, language, rate, pitch, volume, speed, exaggeration, cfgWeight, temperature, seed } = req.body || {};
  if (text !== undefined && (typeof text !== 'string' || text.length > 500)) {
    res.status(400).json({ error: 'Preview text must be at most 500 characters.' }); return;
  }

  if (!language || !['hi', 'en'].includes(language)) {
    res.status(400).json({ error: 'language must be "hi" or "en"' });
    return;
  }

  try {
    const { buffer, contentType } = await previewTTS({
      text,
      voice,
      language,
      rate,
      pitch,
      volume,
      speed,
      exaggeration,
      cfgWeight,
      temperature,
      seed,
    });
    res.set('Content-Type', contentType);
    res.set('Content-Length', String(buffer.length));
    res.send(buffer);
  } catch (err: unknown) {
    console.error(`TTS preview failed:`, errorMessage(err, 'Unknown error'));
    if (err instanceof TtsError) {
      const status = statusCode[err.code] || 500;
      res.status(status).json({ error: err.message, code: err.code });
    } else {
      res.status(500).json({ error: errorMessage(err, 'TTS preview failed'), code: 'UNKNOWN' });
    }
  }
});

ttsRouter.post('/generate', async (req, res) => {
  if (currentWorkspace().profile !== 'shorts') { res.status(409).json({ error: 'Use synchronized scene narration for Long Video.' }); return; }
  const {
    text,
    language,
    scriptId,
    voice,
    rate,
    pitch,
    volume,
    speed,
    exaggeration,
    cfgWeight,
    temperature,
    seed,
  } = req.body || {};

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    res.status(400).json({ error: 'text (string) is required' });
    return;
  }
  if (!language || !['hi', 'en'].includes(language)) {
    res.status(400).json({ error: 'language must be "hi" or "en"' });
    return;
  }
  if (!scriptId || typeof scriptId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(scriptId)) {
    res.status(400).json({ error: 'scriptId must contain only letters, numbers, underscores, or hyphens' });
    return;
  }
  if (text.length > 50_000) {
    res.status(413).json({ error: 'Narration text must be 50,000 characters or fewer' });
    return;
  }

  try {
    const result = await generateTTS({
      text: text.trim(),
      language,
      scriptId,
      voice,
      rate,
      pitch,
      volume,
      speed,
      exaggeration,
      cfgWeight,
      temperature,
      seed,
    });
    res.json({ ok: true, ...result });
  } catch (err: unknown) {
    console.error(`TTS generation failed:`, errorMessage(err, 'Unknown error'));
    if (err instanceof TtsError) {
      const status = statusCode[err.code] || 500;
      res.status(status).json({ error: err.message, code: err.code });
    } else {
      res.status(500).json({ error: errorMessage(err, 'TTS generation failed'), code: 'UNKNOWN' });
    }
  }
});

ttsRouter.post('/voices', async (req, res) => {
  const { name, language, gender, dataUrl } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Voice name is required' });
    return;
  }
  if (language !== 'hi' && language !== 'en') {
    res.status(400).json({ error: 'language must be "hi" or "en"' });
    return;
  }
  if (typeof dataUrl !== 'string') {
    res.status(400).json({ error: 'A base64 audio data URL is required' });
    return;
  }

  try {
    const voice = await createLocalVoice({ name, language, gender, dataUrl });
    res.status(201).json({ ok: true, voice });
  } catch (err: unknown) {
    const status = err instanceof TtsError ? statusCode[err.code] || 500 : 500;
    res.status(status).json({
      error: errorMessage(err, 'Voice upload failed'),
      code: err instanceof TtsError ? err.code : 'UNKNOWN',
    });
  }
});

ttsRouter.delete('/voices/:id', async (req, res) => {
  try {
    await deleteLocalVoice(req.params.id);
    res.json({ ok: true });
  } catch (err: unknown) {
    const status = err instanceof TtsError ? statusCode[err.code] || 500 : 500;
    res.status(status).json({
      error: errorMessage(err, 'Voice deletion failed'),
      code: err instanceof TtsError ? err.code : 'UNKNOWN',
    });
  }
});
