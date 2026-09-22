import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawn, execFile, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { TtsError, type VoiceInfo } from './tts-shared.js';
import { containedFile } from './paths.js';
import { presenterState } from './presenter-state.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..', '..');
const SERVICE_DIR = path.join(SERVER_ROOT, 'chatterbox');
const SERVICE_SCRIPT = path.join(SERVICE_DIR, 'server.py');
const VENV_PYTHON = path.join(SERVICE_DIR, '.venv', 'Scripts', 'python.exe');
const VOICE_DIR = path.resolve(process.env.CHATTERBOX_VOICE_DIR || path.join(SERVER_ROOT, 'data', 'voices'));
const MODEL_CACHE_DIR = path.join(SERVER_ROOT, 'data', 'model-cache');
const PKUSEG_CACHE_DIR = path.join(MODEL_CACHE_DIR, 'pkuseg');
const CHATTERBOX_URL = (process.env.CHATTERBOX_URL || process.env.TTS_SERVER_URL || 'http://127.0.0.1:8880').replace(/\/+$/, '');
const CHATTERBOX_HOST = process.env.CHATTERBOX_HOST || '127.0.0.1';
const CHATTERBOX_PORT = parseInt(process.env.CHATTERBOX_PORT || new URL(CHATTERBOX_URL).port || '8880', 10);
const CHATTERBOX_TIMEOUT_MS = parseInt(process.env.CHATTERBOX_TIMEOUT_MS || '900000', 10);
const MAX_VOICE_UPLOAD_BYTES = parseInt(process.env.CHATTERBOX_MAX_VOICE_UPLOAD_BYTES || String(8 * 1024 * 1024), 10);
const MAX_LOG_LINES = 80;

let chatterboxProcess: ChildProcess | null = null;
let lastProcessError = '';
const processLogs: string[] = [];
const previewCache = new Map<string, Buffer>();

export interface ChatterboxStatus {
  online: boolean;
  ready: boolean;
  state: 'offline' | 'loading' | 'ready' | 'error';
  provider: 'chatterbox';
  model: string;
  device?: string;
  message?: string;
  error?: string;
  gpu?: { name?: string; free_vram_mb?: number; total_vram_mb?: number } | null;
}

export interface ChatterboxOptions {
  exaggeration?: number;
  cfgWeight?: number;
  temperature?: number;
  seed?: number;
}

const BUILTIN_VOICE: VoiceInfo = {
  id: 'builtin',
  name: 'Chatterbox Natural',
  description: 'Built-in multilingual narrator. Add a local reference voice for the most natural result.',
  gender: 'neutral',
  language: 'en',
  sampleText: 'Every remarkable story begins with a moment that changes everything.',
  tags: ['Local', 'Multilingual', 'Natural'],
  source: 'builtin',
  deletable: false,
};

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function rememberLog(chunk: Buffer | string, source: 'stdout' | 'stderr'): void {
  const lines = String(chunk)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    processLogs.push(`[${source}] ${line}`);
    if (processLogs.length > MAX_LOG_LINES) processLogs.shift();
  }
}

function latestLogMessage(): string {
  return lastProcessError || processLogs.slice(-4).join(' | ');
}

function resolvePython(): string {
  if (process.env.CHATTERBOX_PYTHON) return process.env.CHATTERBOX_PYTHON;
  if (fs.existsSync(VENV_PYTHON)) return VENV_PYTHON;

  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const candidates = [
      path.join(process.env.LOCALAPPDATA, 'Python', 'pythoncore-3.10-64', 'python.exe'),
      path.join(process.env.LOCALAPPDATA, 'Programs', 'Python', 'Python310', 'python.exe'),
    ];
    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (found) return found;
  }
  return process.platform === 'win32' ? 'python.exe' : 'python3';
}

function normalizeGender(value: unknown): VoiceInfo['gender'] {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'female' || normalized === 'woman') return 'female';
  if (normalized === 'male' || normalized === 'man') return 'male';
  return 'neutral';
}

function safeVoiceId(value: string): boolean {
  return /^(?:clone_[a-f0-9-]{36}|preset_[a-z0-9_]+)$/.test(value);
}

function readLocalVoiceMetadata(language: 'hi' | 'en'): VoiceInfo[] {
  fs.mkdirSync(VOICE_DIR, { recursive: true });
  const voices: VoiceInfo[] = [
    {
      ...BUILTIN_VOICE,
      language,
      name: language === 'hi' ? 'Chatterbox Natural — Hindi' : 'Chatterbox Natural — English',
      sampleText:
        language === 'hi'
          ? 'क्या आपने कभी सोचा है कि हमारी सबसे महान कहानियों के पीछे कौन से रहस्य छिपे हैं?'
          : BUILTIN_VOICE.sampleText,
    },
  ];

  for (const filename of fs.readdirSync(VOICE_DIR)) {
    if (!filename.endsWith('.json')) continue;
    try {
      const metadata = JSON.parse(fs.readFileSync(path.join(VOICE_DIR, filename), 'utf8')) as Record<string, unknown>;
      const id = String(metadata.id || '');
      const voiceLanguage = metadata.language === 'hi' ? 'hi' : 'en';
      if (!safeVoiceId(id) || voiceLanguage !== language || !fs.existsSync(path.join(VOICE_DIR, `${id}.wav`))) continue;
      const isPreset = id.startsWith('preset_');
      voices.push({
        id,
        name: String(metadata.name || (isPreset ? 'Preset voice' : 'Custom local voice')),
        description: String(metadata.description || (isPreset ? 'Curated studio character voice.' : 'Authorized local voice reference, stored only on this computer.')),
        gender: normalizeGender(metadata.gender),
        language,
        sampleText:
          typeof metadata.sampleText === 'string' && metadata.sampleText.trim()
            ? metadata.sampleText.trim()
            : language === 'hi'
              ? 'नमस्कार! यह आपकी चुनी हुई स्थानीय आवाज़ का एक छोटा नमूना है।'
              : 'Hello! This is a short preview of your selected local voice.',
        tags: Array.isArray(metadata.tags) && metadata.tags.length > 0
          ? (metadata.tags as string[])
          : isPreset
            ? ['Preset', 'Studio']
            : ['Local Clone', 'Private'],
        source: isPreset ? 'builtin' : 'clone',
        deletable: isPreset ? false : Boolean(metadata.deletable ?? true),
      });
    } catch {
      // Invalid metadata is ignored rather than breaking all voice selection.
    }
  }
  return voices;
}

export async function getChatterboxStatus(): Promise<ChatterboxStatus> {
  try {
    const response = await fetch(`${CHATTERBOX_URL}/health`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new Error(`health endpoint returned ${response.status}`);
    const data = (await response.json()) as {
      ready?: boolean;
      state?: string;
      model?: string;
      device?: string;
      error?: string;
      gpu?: ChatterboxStatus['gpu'];
    };
    const state = data.state === 'ready' ? 'ready' : data.state === 'error' ? 'error' : 'loading';
    return {
      online: true,
      ready: data.ready === true,
      state,
      provider: 'chatterbox',
      model: String(data.model || 'chatterbox-multilingual-v3'),
      device: data.device ? String(data.device) : undefined,
      message: state === 'loading' ? 'Loading Chatterbox Multilingual V3. The first run may also download model files.' : undefined,
      error: data.error ? String(data.error) : undefined,
      gpu: data.gpu || null,
    };
  } catch {
    const setupHint = fs.existsSync(VENV_PYTHON)
      ? 'Start Chatterbox to load the local model.'
      : 'Chatterbox is not installed. Run npm run setup:tts once, then start it again.';
    return {
      online: false,
      ready: false,
      state: lastProcessError ? 'error' : 'offline',
      provider: 'chatterbox',
      model: 'chatterbox-multilingual-v3',
      message: setupHint,
      error: latestLogMessage() || undefined,
    };
  }
}

export async function getChatterboxVoices(language: 'hi' | 'en'): Promise<VoiceInfo[]> {
  return readLocalVoiceMetadata(language);
}

function validateVoiceSelection(voice: string | undefined, language: 'hi' | 'en') {
  if (language !== 'en' && language !== 'hi') throw new TtsError('VALIDATION', 'Choose English or Hindi.');
  if (voice === undefined || voice === 'builtin') return;
  if (typeof voice !== 'string' || !readLocalVoiceMetadata(language).some(item => item.id === voice)) {
    throw new TtsError('VALIDATION', 'This voice is not available for the selected language. Refresh the voice list and choose a saved reference.');
  }
}

export function getChatterboxVoiceReference(id: string): string | null {
  if (!safeVoiceId(id) || !id.startsWith('clone_')) return null;
  const file = containedFile(VOICE_DIR, `${id}.wav`);
  const metadata = containedFile(VOICE_DIR, `${id}.json`);
  return fs.existsSync(file) && fs.existsSync(metadata) ? file : null;
}

async function waitForHttpServer(timeoutMs: number): Promise<ChatterboxStatus> {
  const deadline = Date.now() + timeoutMs;
  let status = await getChatterboxStatus();
  while (!status.online && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    status = await getChatterboxStatus();
    if (chatterboxProcess?.exitCode !== null && chatterboxProcess?.exitCode !== undefined) break;
  }
  return status;
}

export async function startChatterbox(): Promise<{ success: boolean; ready: boolean; state: string; message: string }> {
  const existing = await getChatterboxStatus();
  if (existing.online) {
    return {
      success: existing.state !== 'error',
      ready: existing.ready,
      state: existing.state,
      message: existing.ready ? 'Chatterbox is ready.' : existing.error || existing.message || 'Chatterbox is loading.',
    };
  }

  if (!fs.existsSync(SERVICE_SCRIPT)) {
    return { success: false, ready: false, state: 'error', message: `Missing Chatterbox service: ${SERVICE_SCRIPT}` };
  }

  if (!fs.existsSync(VENV_PYTHON) && !process.env.CHATTERBOX_PYTHON) {
    return {
      success: false,
      ready: false,
      state: 'error',
      message: 'Chatterbox dependencies are not installed. Run npm run setup:tts once, then try again.',
    };
  }

  fs.mkdirSync(VOICE_DIR, { recursive: true });
  fs.mkdirSync(PKUSEG_CACHE_DIR, { recursive: true });
  processLogs.length = 0;
  lastProcessError = '';
  const python = resolvePython();

  try {
    const child = spawn(python, [SERVICE_SCRIPT, '--host', CHATTERBOX_HOST, '--port', String(CHATTERBOX_PORT)], {
      cwd: SERVICE_DIR,
      windowsHide: true,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CHATTERBOX_VOICE_DIR: VOICE_DIR,
        CHATTERBOX_T3_MODEL: process.env.CHATTERBOX_T3_MODEL || 'v3',
        CHATTERBOX_DEVICE: process.env.CHATTERBOX_DEVICE || 'auto',
        PKUSEG_HOME: process.env.PKUSEG_HOME || PKUSEG_CACHE_DIR,
        PYTHONUNBUFFERED: '1',
      },
    });
    chatterboxProcess = child;
    child.stdout?.on('data', (chunk) => rememberLog(chunk, 'stdout'));
    child.stderr?.on('data', (chunk) => rememberLog(chunk, 'stderr'));
    child.on('error', (error) => {
      lastProcessError = error.message;
    });
    child.on('close', (code, signal) => {
      if (chatterboxProcess === child) chatterboxProcess = null;
      if (code && code !== 0) lastProcessError = `Chatterbox exited with code ${code}${signal ? ` (${signal})` : ''}. ${latestLogMessage()}`;
    });

    const status = await waitForHttpServer(30_000);
    if (!status.online) {
      return {
        success: false,
        ready: false,
        state: status.state,
        message: status.error || latestLogMessage() || 'Chatterbox did not open its health endpoint within 30 seconds.',
      };
    }
    return {
      success: status.state !== 'error',
      ready: status.ready,
      state: status.state,
      message: status.ready ? 'Chatterbox is ready.' : status.error || status.message || 'Chatterbox model is loading.',
    };
  } catch (error) {
    chatterboxProcess = null;
    const message = error instanceof Error ? error.message : String(error);
    lastProcessError = message;
    return { success: false, ready: false, state: 'error', message: `Failed to start Chatterbox: ${message}` };
  }
}

export async function stopChatterbox(): Promise<{ success: boolean; message: string }> {
  const child = chatterboxProcess;
  if (!child) {
    const status = await getChatterboxStatus();
    return {
      success: true,
      message: status.online
        ? 'Chatterbox is running outside TubeFlow and was left running.'
        : 'No TubeFlow-managed Chatterbox process is running.',
    };
  }

  chatterboxProcess = null;
  if (child.exitCode === null) child.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 750));
  if (child.exitCode === null) child.kill('SIGKILL');
  previewCache.clear();
  return { success: true, message: 'Chatterbox stopped.' };
}

export async function synthesizeChatterbox(
  text: string,
  voice: string | undefined,
  language: 'hi' | 'en',
  options: ChatterboxOptions = {},
): Promise<Buffer> {
  validateVoiceSelection(voice, language);
  if (presenterState.busy) throw new TtsError('NOT_READY', 'Wait for presenter generation to finish.');
  presenterState.speechRequests++;
  try {
  const status = await getChatterboxStatus();
  if (!status.online) throw new TtsError('CONNECTION_REFUSED', status.message || 'Chatterbox is offline.');
  if (!status.ready) throw new TtsError('NOT_READY', status.error || status.message || 'Chatterbox is still loading.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHATTERBOX_TIMEOUT_MS);
  try {
    const response = await fetch(`${CHATTERBOX_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'chatterbox-multilingual-v3',
        input: text,
        voice: voice || 'builtin',
        language,
        response_format: 'wav',
        exaggeration: clamp(options.exaggeration, 0.25, 1.5, 0.5),
        cfg_weight: clamp(options.cfgWeight, 0, 1, 0.5),
        temperature: clamp(options.temperature, 0.05, 2, 0.8),
        seed: Math.max(0, Math.floor(options.seed || 0)),
      }),
    });
    if (!response.ok) {
      const responseText = await response.text();
      let detail = responseText;
      try {
        detail = String((JSON.parse(responseText) as { detail?: string }).detail || responseText);
      } catch {
        // Keep the original response body when the error is not JSON.
      }
      const code = response.status === 503 ? 'NOT_READY' : response.status === 400 ? 'VALIDATION' : 'API_ERROR';
      throw new TtsError(code, `Chatterbox error ${response.status}: ${detail}`);
    }
    const audio = Buffer.from(await response.arrayBuffer());
    if (audio.length < 100 || audio.toString('ascii', 0, 4) !== 'RIFF') {
      throw new TtsError('NO_OUTPUT', 'Chatterbox returned invalid or empty WAV audio.');
    }
    return audio;
  } catch (error) {
    if (error instanceof TtsError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TtsError('TIMEOUT', `Chatterbox generation exceeded ${Math.round(CHATTERBOX_TIMEOUT_MS / 1000)} seconds.`);
    }
    throw new TtsError('CONNECTION_REFUSED', `Could not reach Chatterbox: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
  } finally { presenterState.speechRequests--; }
}

export async function previewChatterbox(
  text: string,
  voice: string | undefined,
  language: 'hi' | 'en',
  options: ChatterboxOptions = {},
): Promise<Buffer> {
  const cacheKey = JSON.stringify([voice || 'builtin', language, options, text]);
  validateVoiceSelection(voice, language);
  const cached = previewCache.get(cacheKey);
  if (cached) return cached;
  const audio = await synthesizeChatterbox(text, voice, language, options);
  previewCache.set(cacheKey, audio);
  if (previewCache.size > 20) previewCache.delete(previewCache.keys().next().value as string);
  return audio;
}

export async function createChatterboxVoice(params: {
  name: string;
  language: 'hi' | 'en';
  gender?: string;
  dataUrl: string;
}): Promise<VoiceInfo> {
  if (params.language !== 'en' && params.language !== 'hi') throw new TtsError('VALIDATION', 'Choose English or Hindi.');
  const name = params.name.trim().replace(/\p{Cc}/gu, '').replace(/[<>]/g, '').slice(0, 80);
  if (!name) throw new TtsError('VALIDATION', 'Voice name is required.');

  const match = /^data:(audio\/(?:wav|wave|x-wav|mpeg|mp3|mp4|x-m4a|flac|ogg));base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(params.dataUrl);
  if (!match) throw new TtsError('VALIDATION', 'Upload a WAV, MP3, M4A, FLAC, or OGG audio file.');
  const input = Buffer.from(match[2], 'base64');
  if (input.length < 1024) throw new TtsError('VALIDATION', 'The voice reference is empty or too short.');
  if (input.length > MAX_VOICE_UPLOAD_BYTES) {
    throw new TtsError('VALIDATION', `Voice reference must be smaller than ${Math.floor(MAX_VOICE_UPLOAD_BYTES / 1024 / 1024)} MB.`);
  }

  fs.mkdirSync(VOICE_DIR, { recursive: true });
  const id = `clone_${crypto.randomUUID()}`;
  const inputPath = path.join(VOICE_DIR, `${id}.upload`);
  const wavPath = path.join(VOICE_DIR, `${id}.wav`);
  const metadataPath = path.join(VOICE_DIR, `${id}.json`);
  fs.writeFileSync(inputPath, input, { flag: 'wx' });

  try {
    await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-i', inputPath,
      '-t', '20',
      '-ac', '1',
      '-ar', '24000',
      '-c:a', 'pcm_s16le',
      wavPath,
    ], { windowsHide: true, timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });

    const stats = fs.statSync(wavPath);
    if (stats.size < 24_000) throw new Error('Reference must contain at least about half a second of valid speech.');
    fs.writeFileSync(metadataPath, JSON.stringify({
      id,
      name,
      language: params.language,
      gender: normalizeGender(params.gender),
      createdAt: new Date().toISOString(),
    }, null, 2), { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    try { if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath); } catch {
      // Best-effort cleanup; preserve the original conversion error.
    }
    try { if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath); } catch {
      // Best-effort cleanup; preserve the original conversion error.
    }
    throw new TtsError('VALIDATION', `Could not prepare voice reference: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch {
      // Temporary input cleanup is best effort.
    }
  }

  previewCache.clear();
  return readLocalVoiceMetadata(params.language).find((voice) => voice.id === id)!;
}

export async function deleteChatterboxVoice(id: string): Promise<void> {
  if (!safeVoiceId(id)) throw new TtsError('VALIDATION', 'Invalid local voice identifier.');
  if (id.startsWith('preset_')) throw new TtsError('VALIDATION', 'Built-in preset voices cannot be deleted.');
  const targets = [path.join(VOICE_DIR, `${id}.wav`), path.join(VOICE_DIR, `${id}.json`)];
  for (const target of targets) {
    const resolved = path.resolve(target);
    if (path.dirname(resolved) !== path.resolve(VOICE_DIR)) throw new TtsError('VALIDATION', 'Invalid voice path.');
    if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
  }
  previewCache.clear();
}
