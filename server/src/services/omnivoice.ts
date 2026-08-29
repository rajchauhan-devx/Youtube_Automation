import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { TtsError, concatWavs, splitIntoChunks, cleanScriptForTTS, sanitizeTextForPlainTTS, type VoiceInfo } from './tts-shared.js';
import { checkOpenRouterStatus, synthesizeOpenRouter, generateCloudAudio, OPENROUTER_ENGLISH_VOICES, OPENROUTER_HINDI_VOICES } from './openrouter-tts.js';
import { checkEdgeTtsStatus, synthesizeEdgeTts, previewEdgeTts, generateEdgeAudio, EDGE_ENGLISH_VOICES, EDGE_HINDI_VOICES } from './edge-tts.js';

export { TtsError, type VoiceInfo } from './tts-shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OMNIVOICE_URL = (process.env.TTS_SERVER_URL || process.env.OMNIVOICE_URL || 'http://localhost:8880').replace(/\/+$/, '');
const GENERATED_DIR = path.join(__dirname, '..', '..', 'data', 'generated');
const OMNIVOICE_START_CMD = (process.env.TTS_START_CMD || process.env.OMNIVOICE_START_CMD || 'python -m omnivoice_server --port 8880');

// 'edge' (default, free Microsoft Edge neural voices), 'openrouter' (cloud, needs OPENROUTER_API_KEY) or 'omni' (local OmniVoice server)
export const TTS_PROVIDER = (process.env.TTS_PROVIDER || 'edge').toLowerCase();
export const TTS_PROVIDER_NAME =
  TTS_PROVIDER === 'omni' ? 'OmniVoice' : TTS_PROVIDER === 'openrouter' ? 'OpenRouter TTS' : 'Edge Neural TTS';

const TTS_TIMEOUT_MS = parseInt(process.env.TTS_TIMEOUT_MS || '300000', 10);
const TTS_NUM_STEP = parseInt(process.env.TTS_NUM_STEP || '4', 10);
const TTS_CHUNK_MAX_CHARS = parseInt(process.env.TTS_CHUNK_MAX_CHARS || '85', 10);

let omniProcess: any = null;

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
      const data = await res.json();
      if (Array.isArray(data?.voices)) {
        const customVoices: VoiceInfo[] = [];
        for (const sv of data.voices) {
          if (!sv.id || baseList.some((b) => b.id === sv.id)) continue;
          const voiceLang = String(sv.language || sv.lang || '').toLowerCase();
          if (voiceLang && !voiceLang.startsWith(lang)) continue;
          customVoices.push({
            id: String(sv.id),
            name: String(sv.name || sv.id),
            description: sv.description || `Custom ${lang.toUpperCase()} OmniVoice Model`,
            gender: normalizeGender(sv.gender),
            language: lang,
            sampleText: lang === 'hi' ? 'नमस्ते! यह मेरी आवाज़ का नमूना है।' : 'Hello! This is a custom voice sample.',
            pitch: 1.0,
          });
        }
        return [...baseList, ...customVoices];
      }
    }
  } catch {}

  return baseList;
}

async function callOmniVoice(text: string, voice?: string, language?: string): Promise<Buffer> {
  const cleanText = preprocessForTTS(text);
  const targetVoice = voice || (language === 'hi' ? 'hi_swara' : 'en_brian');

  const body: Record<string, any> = {
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
  } catch (err: any) {
    if (err instanceof TtsError) throw err;
    if (err.name === 'AbortError') throw new TtsError('TIMEOUT', `OmniVoice TTS generation timed out.`);
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
}): Promise<{ filename: string; publicUrl: string; elapsedMs: number }> {
  const start = Date.now();

  let audioBuffer: Buffer;
  let ext: 'mp3' | 'wav' = 'mp3';

  if (TTS_PROVIDER === 'openrouter') {
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
}): Promise<{ buffer: Buffer; contentType: string }> {
  const allVoices = await getVoices(params.language);
  const matched = allVoices.find((v) => v.id === params.voice) || allVoices[0];
  const sampleText = matched?.sampleText || (params.language === 'hi' ? 'नमस्ते! यह मेरी आवाज़ का नमूना है।' : 'Hello! This is a sample of my voice.');

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

export async function checkOmniVoiceStatus(): Promise<boolean> {
  if (TTS_PROVIDER === 'openrouter') {
    return (await checkOpenRouterStatus()).online;
  }
  if (TTS_PROVIDER === 'edge') {
    return checkEdgeTtsStatus();
  }
  try {
    const res = await fetch(`${OMNIVOICE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) return true;
  } catch {}
  try {
    const res = await fetch(`${OMNIVOICE_URL}/v1/models`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function startOmniVoice(): Promise<{ success: boolean; message: string }> {
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
      try { omniProcess.kill(); } catch {}
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
  } catch (err: any) {
    return { success: false, message: `Failed to start OmniVoice: ${err.message}` };
  }
}

export async function stopOmniVoice(): Promise<{ success: boolean; message: string }> {
  if (TTS_PROVIDER !== 'omni') {
    return { success: true, message: `${TTS_PROVIDER_NAME} — no local server to stop.` };
  }
  let killed = false;
  if (omniProcess) {
    try {
      omniProcess.kill();
      omniProcess = null;
      killed = true;
    } catch {}
  }
  return { success: true, message: killed ? 'OmniVoice stopped' : 'No OmniVoice process found' };
}
