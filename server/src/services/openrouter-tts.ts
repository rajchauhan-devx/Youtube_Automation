import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { TtsError, concatWavs, splitIntoChunks } from './tts-shared.js';

const execFileAsync = promisify(execFile);

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const TTS_MODEL = process.env.TTS_MODEL || 'openai/gpt-4o-mini-tts-2025-12-15';
// OpenAI TTS caps requests at 2000 tokens (~thousands of chars). Split anything
// larger into sentence-aligned chunks and synthesize sequentially.
const TTS_CLOUD_CHUNK_MAX_CHARS = parseInt(process.env.TTS_CLOUD_CHUNK_MAX_CHARS || '1800', 10);
const TTS_CLOUD_TIMEOUT_MS = parseInt(process.env.TTS_CLOUD_TIMEOUT_MS || '120000', 10);

// Character voices (same ids/names as the UI shows) mapped to OpenAI TTS voices.
export const CLOUD_VOICE_IDS: Record<string, string> = {
  nova: 'nova',
  onyx: 'onyx',
  shimmer: 'shimmer',
  fable: 'fable',
  alloy: 'alloy',
  hi_female: 'nova',
  hi_male: 'onyx',
  hi_female_casual: 'shimmer',
  hi_male_deep: 'fable',
};

export async function checkOpenRouterStatus(): Promise<{ online: boolean; provider: string; model: string }> {
  if (!OPENROUTER_API_KEY) {
    return { online: false, provider: 'openrouter', model: TTS_MODEL };
  }
  try {
    const res = await fetch(`${OPENROUTER_BASE}/models`, {
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    return { online: res.ok, provider: 'openrouter', model: TTS_MODEL };
  } catch {
    return { online: false, provider: 'openrouter', model: TTS_MODEL };
  }
}

export async function synthesizeOpenRouter(text: string, voiceId?: string): Promise<Buffer> {
  if (!OPENROUTER_API_KEY) {
    throw new TtsError('CONFIG', 'OPENROUTER_API_KEY is not set in server/.env. Cloud TTS requires it.');
  }

  const voice = CLOUD_VOICE_IDS[voiceId || ''] || 'nova';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TTS_CLOUD_TIMEOUT_MS);

  try {
    const res = await fetch(`${OPENROUTER_BASE}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'YouTube Automation',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: TTS_MODEL,
        input: text,
        voice,
        response_format: 'mp3',
        speed: 1.0,
      }),
    });

    if (!res.ok) {
      const textBody = await res.text();
      throw new TtsError('API_ERROR', `OpenRouter TTS API error ${res.status}: ${textBody}`);
    }

    const audioBuffer = Buffer.from(await res.arrayBuffer());
    if (!audioBuffer || audioBuffer.length < 100) {
      throw new TtsError('NO_OUTPUT', 'OpenRouter TTS returned empty audio.');
    }
    return audioBuffer;
  } catch (err: unknown) {
    if (err instanceof TtsError) throw err;
    const e = err as Error;
    if (e?.name === 'AbortError') {
      throw new TtsError('TIMEOUT', `OpenRouter TTS request timed out after ${Math.round(TTS_CLOUD_TIMEOUT_MS / 1000)}s.`);
    }
    throw new TtsError('CONNECTION_REFUSED', 'Cannot reach OpenRouter TTS API. Check internet connection and OPENROUTER_API_KEY.');
  } finally {
    clearTimeout(timeoutId);
  }
}

async function mp3ToWavBuffer(mp3: Buffer): Promise<Buffer> {
  const tmpIn = path.join(os.tmpdir(), `tts_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);
  const tmpOut = tmpIn.replace('.mp3', '.wav');
  fs.writeFileSync(tmpIn, mp3);
  try {
    await execFileAsync('ffmpeg', ['-y', '-i', tmpIn, '-f', 'wav', tmpOut]);
    return fs.readFileSync(tmpOut);
  } finally {
    if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
  }
}

export async function generateCloudAudio(
  text: string,
  voiceId?: string,
  onChunk?: (done: number, total: number) => void
): Promise<{ buffer: Buffer; ext: 'mp3' | 'wav'; chunks: number }> {
  const chunks = splitIntoChunks(text, TTS_CLOUD_CHUNK_MAX_CHARS);
  if (chunks.length === 1) {
    return { buffer: await synthesizeOpenRouter(chunks[0], voiceId), ext: 'mp3', chunks: 1 };
  }

  // Rare path (text > ~1800 chars): synthesize per chunk, decode each mp3 to
  // PCM WAV via ffmpeg, then stitch into one WAV file.
  const wavParts: Buffer[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const mp3 = await synthesizeOpenRouter(chunks[i], voiceId);
    wavParts.push(await mp3ToWavBuffer(mp3));
    onChunk?.(i + 1, chunks.length);
  }
  return { buffer: concatWavs(wavParts), ext: 'wav', chunks: chunks.length };
}
