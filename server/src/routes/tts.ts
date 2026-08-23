import { Router } from 'express';
import { generateTTS, previewTTS, checkOmniVoiceStatus, startOmniVoice, stopOmniVoice, getVoices, TTS_PROVIDER_NAME, TtsError } from '../services/omnivoice.js';

export const ttsRouter = Router();

const statusCode: Record<string, number> = {
  API_ERROR: 502,
  TIMEOUT: 504,
  CONNECTION_REFUSED: 503,
  CONFIG: 500,
  UNKNOWN: 500,
};

ttsRouter.get('/status', async (_req, res) => {
  const online = await checkOmniVoiceStatus();
  res.json({ online, provider: TTS_PROVIDER_NAME });
});

ttsRouter.get('/voices', async (req, res) => {
  const language = req.query.language as string | undefined;
  const voices = await getVoices(language);
  res.json({ voices });
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
  const { voice, language } = req.body || {};

  if (!language || !['hi', 'en'].includes(language)) {
    res.status(400).json({ error: 'language must be "hi" or "en"' });
    return;
  }

  try {
    const { buffer, contentType } = await previewTTS({ voice, language });
    res.set('Content-Type', contentType);
    res.set('Content-Length', String(buffer.length));
    res.send(buffer);
  } catch (err: any) {
    console.error(`TTS preview failed:`, err.message);
    if (err instanceof TtsError) {
      const status = statusCode[err.code] || 500;
      res.status(status).json({ error: err.message, code: err.code });
    } else {
      res.status(500).json({ error: err.message || 'TTS preview failed', code: 'UNKNOWN' });
    }
  }
});

ttsRouter.post('/generate', async (req, res) => {
  const { text, language, scriptId, voice } = req.body || {};

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    res.status(400).json({ error: 'text (string) is required' });
    return;
  }
  if (!language || !['hi', 'en'].includes(language)) {
    res.status(400).json({ error: 'language must be "hi" or "en"' });
    return;
  }
  if (!scriptId || typeof scriptId !== 'string') {
    res.status(400).json({ error: 'scriptId (string) is required' });
    return;
  }

  try {
    const result = await generateTTS({ text: text.trim(), language, scriptId, voice });
    res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error(`TTS generation failed:`, err.message);
    if (err instanceof TtsError) {
      const status = statusCode[err.code] || 500;
      res.status(status).json({ error: err.message, code: err.code });
    } else {
      res.status(500).json({ error: err.message || 'TTS generation failed', code: 'UNKNOWN' });
    }
  }
});
