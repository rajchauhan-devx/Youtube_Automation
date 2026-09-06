import fs from 'fs';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';
import { TtsError, concatWavs, splitIntoChunks, sanitizeTextForPlainTTS, type VoiceInfo } from './tts-shared.js';
import { checkOpenRouterStatus, synthesizeOpenRouter, generateCloudAudio, OPENROUTER_ENGLISH_VOICES, OPENROUTER_HINDI_VOICES } from './openrouter-tts.js';
import { checkEdgeTtsStatus, previewEdgeTts, generateEdgeAudio, EDGE_ENGLISH_VOICES, EDGE_HINDI_VOICES } from './edge-tts.js';
import {
  createChatterboxVoice,
  deleteChatterboxVoice,
  getChatterboxStatus,
  getChatterboxVoices,
  previewChatterbox,
  startChatterbox,
  stopChatterbox,
  synthesizeChatterbox,
} from './chatterbox-tts.js';

export { TtsError, type VoiceInfo } from './tts-shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OMNIVOICE_URL = (process.env.TTS_SERVER_URL || process.env.OMNIVOICE_URL || 'http://localhost:8880').replace(/\/+$/, '');
const GENERATED_DIR = path.join(__dirname, '..', '..', 'data', 'generated');
const OMNIVOICE_START_CMD = (process.env.TTS_START_CMD || process.env.OMNIVOICE_START_CMD || 'python -m omnivoice_server --port 8880');

// 'chatterbox' (default, free/local), 'edge', 'openrouter', or legacy 'omni'.
export const TTS_PROVIDER = (process.env.TTS_PROVIDER || 'chatterbox').toLowerCase();
export const TTS_PROVIDER_NAME =
  TTS_PROVIDER === 'chatterbox'
    ? 'Chatterbox Multilingual V3'
    : TTS_PROVIDER === 'omni'
      ? 'OmniVoice'
      : TTS_PROVIDER === 'openrouter'
        ? 'OpenRouter TTS'
        : 'Edge Neural TTS';
export const TTS_PROVIDER_KIND = TTS_PROVIDER === 'chatterbox' || TTS_PROVIDER === 'omni' ? 'local' : 'cloud';

const TTS_TIMEOUT_MS = parseInt(process.env.TTS_TIMEOUT_MS || '300000', 10);
const TTS_NUM_STEP = parseInt(process.env.TTS_NUM_STEP || '4', 10);
const TTS_CHUNK_MAX_CHARS = parseInt(process.env.TTS_CHUNK_MAX_CHARS || '85', 10);

let omniProcess: ChildProcess | null = null;

export const ENGLISH_VOICES: VoiceInfo[] = EDGE_ENGLISH_VOICES;
export const HINDI_VOICES: VoiceInfo[] = EDGE_HINDI_VOICES;

const OPENAI_PRESETS = new Set([
  'nova', 'onyx', 'shimmer', 'fable', 'alloy',
  'ash', 'ballad', 'cedar', 'coral', 'echo', 'marin', 'sage', 'verse',
]);

export function preprocessForTTS(text: string): string {
  return sanitizeTextForPlainTTS(text);
}

export async function getVoices(language?: string): Promise<VoiceInfo[]> {
  const lang = language === 'hi' ? 'hi' : 'en';

  if (TTS_PROVIDER === 'chatterbox') {
    return getChatterboxVoices(lang);
  }

  if (TTS_PROVIDER === 'openrouter') {
    return lang === 'hi' ? OPENROUTER_HINDI_VOICES : OPENROUTER_ENGLISH_VOICES;
  }

  if (TTS_PROVIDER === 'edge') {
    return lang === 'hi' ? EDGE_HINDI_VOICES : EDGE_ENGLISH_VOICES;
  }

  // Local OmniVoice server path
  const baseList = lang === 'hi' ? HINDI_VOICES : ENGLISH_VOICES;

  function normalizeGender(g?: unknown): VoiceInfo['gender'] {
    const gStr = String(g || '').toLowerCase();
    if (gStr.startsWith('female') || gStr === 'woman') return 'female';
    if (gStr.startsWith('male') || gStr === 'man') return 'male';
    return 'neutral';
  }

  try {
    const res = await fetch(`${OMNIVOICE_URL}/v1/voices`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = (await res.json()) as { voices?: Array<Record<string, unknown>> };
      if (Array.isArray(data.voices)) {
        const customVoices: VoiceInfo[] = [];
        for (const sv of data.voices) {
          if (!sv.id || baseList.some((b) => b.id === sv.id)) continue;
          const voiceLang = String(sv.language || sv.lang || '').toLowerCase();
          if (voiceLang && !voiceLang.startsWith(lang)) continue;
          customVoices.push({
            id: String(sv.id),
            name: String(sv.name || sv.id),
            description: String(sv.description || `Custom ${lang.toUpperCase()} OmniVoice Model`),
            gender: normalizeGender(sv.gender),
            language: lang,
            sampleText: lang === 'hi' ? 'नमस्ते! यह मेरी आवाज़ का नमूना है।' : 'Hello! This is a custom voice sample.',
            pitch: 1.0,
          });
        }
        return [...baseList, ...customVoices];
      }
    }
  } catch {
    // A legacy OmniVoice server may not expose voice discovery.
  }

  return baseList;
}

async function callOmniVoice(text: string, voice?: string, language?: string): Promise<Buffer> {
  const cleanText = preprocessForTTS(text);
  const targetVoice = voice || (language === 'hi' ? 'hi_swara' : 'en_brian');

  const body: Record<string, unknown> = {
    model: 'omnivoice',
    input: cleanText,
    response_format: 'wav',
    language: language || 'en',
    num_step: TTS_NUM_STEP,
  };

  if (OPENAI_PRESETS.has(targetVoice)) {
    body.voice = targetVoice;
  } else {
    body.voice = 'nova';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);

  try {
    const res = await fetch(`${OMNIVOICE_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const textBody = await res.text();
      throw new TtsError('API_ERROR', `OmniVoice API error ${res.status}: ${textBody}`);
    }

    const audioBuffer = Buffer.from(await res.arrayBuffer());
    if (!audioBuffer || audioBuffer.length < 100) {
      throw new TtsError('NO_OUTPUT', 'OmniVoice returned empty audio.');
    }

    return audioBuffer;
  } catch (err: unknown) {
    if (err instanceof TtsError) throw err;
    if (err instanceof Error && err.name === 'AbortError') throw new TtsError('TIMEOUT', `OmniVoice TTS generation timed out.`);
    throw new TtsError('CONNECTION_REFUSED', `Cannot connect to OmniVoice at ${OMNIVOICE_URL}. Ensure OmniVoice server is running.`);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generateTTS(params: {
  text: string;
  language: 'hi' | 'en';
  voice?: string;
  scriptId: string;
  rate?: string;
  pitch?: string;
  volume?: string;
  speed?: number;
  exaggeration?: number;
  cfgWeight?: number;
  temperature?: number;
  seed?: number;
}): Promise<{ filename: string; publicUrl: string; elapsedMs: number }> {
  const start = Date.now();

  let audioBuffer: Buffer;
  let ext: 'mp3' | 'wav' = 'mp3';

  if (TTS_PROVIDER === 'chatterbox') {
    audioBuffer = await synthesizeChatterbox(params.text, params.voice, params.language, {
      exaggeration: params.exaggeration,
      cfgWeight: params.cfgWeight,
      temperature: params.temperature,
      seed: params.seed,
    });
    ext = 'wav';
  } else if (TTS_PROVIDER === 'openrouter') {
    const result = await generateCloudAudio(params.text, params.voice, { speed: params.speed });
    audioBuffer = result.buffer;
    ext = result.ext;
  } else if (TTS_PROVIDER === 'edge') {
    const result = await generateEdgeAudio(params.text, params.voice, {
      rate: params.rate,
      pitch: params.pitch,
      volume: params.volume,
      language: params.language,
    });
    audioBuffer = result.buffer;
    ext = result.ext;
  } else {
    ext = 'wav';
    const processedText = preprocessForTTS(params.text);
    const chunks = splitIntoChunks(processedText, TTS_CHUNK_MAX_CHARS);
    if (chunks.length === 1) {
      audioBuffer = await callOmniVoice(chunks[0], params.voice, params.language);
    } else {
      const parts: Buffer[] = [];
      for (const chunk of chunks) {
        parts.push(await callOmniVoice(chunk, params.voice, params.language));
      }
      audioBuffer = concatWavs(parts);
    }
  }

  const filename = `narration_${params.language}_${Date.now()}.${ext}`;
  const dir = path.join(GENERATED_DIR, params.scriptId);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, audioBuffer);

  return {
    filename,
    publicUrl: `/api/generate/file/${params.scriptId}/${filename}`,
    elapsedMs: Date.now() - start,
  };
}

export async function previewTTS(params: {
  voice?: string;
  language: 'hi' | 'en';
  rate?: string;
  pitch?: string;
  volume?: string;
  speed?: number;
  exaggeration?: number;
  cfgWeight?: number;
  temperature?: number;
  seed?: number;
}): Promise<{ buffer: Buffer; contentType: string }> {
  const allVoices = await getVoices(params.language);
  const matched = allVoices.find((v) => v.id === params.voice) || allVoices[0];
  const sampleText = matched?.sampleText || (params.language === 'hi' ? 'नमस्ते! यह मेरी आवाज़ का नमूना है।' : 'Hello! This is a sample of my voice.');

  if (TTS_PROVIDER === 'chatterbox') {
    return {
      buffer: await previewChatterbox(sampleText, params.voice, params.language, {
        exaggeration: params.exaggeration,
        cfgWeight: params.cfgWeight,
        temperature: params.temperature,
        seed: params.seed,
      }),
      contentType: 'audio/wav',
    };
  }
  if (TTS_PROVIDER === 'openrouter') {
    return {
      buffer: await synthesizeOpenRouter(sampleText, params.voice, { speed: params.speed }),
      contentType: 'audio/mpeg',
    };
  }
  if (TTS_PROVIDER === 'edge') {
    return {
      buffer: await previewEdgeTts(sampleText, params.voice, {
        rate: params.rate,
        pitch: params.pitch,
        volume: params.volume,
        language: params.language,
      }),
      contentType: 'audio/mpeg',
    };
  }
  return { buffer: await callOmniVoice(sampleText, params.voice, params.language), contentType: 'audio/wav' };
}

export interface TtsProviderStatus {
  online: boolean;
  ready: boolean;
  state: 'offline' | 'loading' | 'ready' | 'error';
  provider: string;
  providerKind: 'local' | 'cloud';
  model?: string;
  device?: string;
  message?: string;
  error?: string;
  gpu?: unknown;
}

export async function getTtsProviderStatus(): Promise<TtsProviderStatus> {
  if (TTS_PROVIDER === 'chatterbox') {
    const status = await getChatterboxStatus();
    return { ...status, provider: TTS_PROVIDER_NAME, providerKind: 'local' };
  }
  if (TTS_PROVIDER === 'openrouter') {
    const status = await checkOpenRouterStatus();
    return {
      online: status.online,
      ready: status.online,
      state: status.online ? 'ready' : 'offline',
      provider: TTS_PROVIDER_NAME,
      providerKind: 'cloud',
      model: status.model,
    };
  }
  if (TTS_PROVIDER === 'edge') {
    const online = await checkEdgeTtsStatus();
    return { online, ready: online, state: online ? 'ready' : 'offline', provider: TTS_PROVIDER_NAME, providerKind: 'cloud' };
  }
  try {
    const res = await fetch(`${OMNIVOICE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) return { online: true, ready: true, state: 'ready', provider: TTS_PROVIDER_NAME, providerKind: 'local' };
  } catch {
    // Fall through to the OpenAI-compatible models endpoint.
  }
  try {
    const res = await fetch(`${OMNIVOICE_URL}/v1/models`, { signal: AbortSignal.timeout(3000) });
    const online = res.ok;
    return { online, ready: online, state: online ? 'ready' : 'offline', provider: TTS_PROVIDER_NAME, providerKind: 'local' };
  } catch {
    return { online: false, ready: false, state: 'offline', provider: TTS_PROVIDER_NAME, providerKind: 'local' };
  }
}

export async function checkOmniVoiceStatus(): Promise<boolean> {
  const status = await getTtsProviderStatus();
  return status.ready;
}

export async function startOmniVoice(): Promise<{ success: boolean; ready?: boolean; state?: string; message: string }> {
  if (TTS_PROVIDER === 'chatterbox') return startChatterbox();
  if (TTS_PROVIDER !== 'omni') {
    return { success: true, message: `${TTS_PROVIDER_NAME} is active (cloud/neural provider).` };
  }
  const already = await checkOmniVoiceStatus();
  if (already) return { success: true, message: 'OmniVoice is already running' };

  await stopOmniVoice();
  await new Promise((r) => setTimeout(r, 1000));

  const startCmd = OMNIVOICE_START_CMD;
  try {
    if (omniProcess) {
      try { omniProcess.kill(); } catch {
        // The process may already have exited.
      }
      omniProcess = null;
    }

    fs.mkdirSync(GENERATED_DIR, { recursive: true });

    const spawnEnv = { ...process.env };
    delete spawnEnv.OMNIVOICE_URL;
    delete spawnEnv.OMNIVOICE_START_CMD;
    delete spawnEnv.COMFYUI_PATH;
    delete spawnEnv.PORT;
    delete spawnEnv.CORS_ORIGIN;
    delete spawnEnv.OPENROUTER_API_KEY;
    delete spawnEnv.COMFYUI_BASE_URL;
    delete spawnEnv.COMFYUI_WORKFLOW_PATH;

    omniProcess = spawn(startCmd, [], {
      cwd: GENERATED_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      detached: false,
      env: spawnEnv,
    });

    return { success: true, message: 'OmniVoice started' };
  } catch (err: unknown) {
    return { success: false, message: `Failed to start OmniVoice: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function stopOmniVoice(): Promise<{ success: boolean; message: string }> {
  if (TTS_PROVIDER === 'chatterbox') return stopChatterbox();
  if (TTS_PROVIDER !== 'omni') {
    return { success: true, message: `${TTS_PROVIDER_NAME} — no local server to stop.` };
  }
  let killed = false;
  if (omniProcess) {
    try {
      omniProcess.kill();
      omniProcess = null;
      killed = true;
    } catch {
      // The process may already have exited.
    }
  }
  return { success: true, message: killed ? 'OmniVoice stopped' : 'No OmniVoice process found' };
}

export async function createLocalVoice(params: {
  name: string;
  language: 'hi' | 'en';
  gender?: string;
  dataUrl: string;
}): Promise<VoiceInfo> {
  if (TTS_PROVIDER !== 'chatterbox') {
    throw new TtsError('VALIDATION', 'Voice-reference uploads are only available with the Chatterbox provider.');
  }
  return createChatterboxVoice(params);
}

export async function deleteLocalVoice(id: string): Promise<void> {
  if (TTS_PROVIDER !== 'chatterbox') {
    throw new TtsError('VALIDATION', 'Local voice management is only available with the Chatterbox provider.');
  }
  await deleteChatterboxVoice(id);
}
