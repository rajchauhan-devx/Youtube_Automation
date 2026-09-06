import { Router } from 'express';
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

ttsRouter.get('/voices', async (req, res) => {
  const language = req.query.language as string | undefined;
  const voices = await getVoices(language);
  res.json({ voices, provider: TTS_PROVIDER_NAME });
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
  const { voice, language, rate, pitch, volume, speed, exaggeration, cfgWeight, temperature, seed } = req.body || {};

  if (!language || !['hi', 'en'].includes(language)) {
    res.status(400).json({ error: 'language must be "hi" or "en"' });
    return;
  }

  try {
    const { buffer, contentType } = await previewTTS({
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
