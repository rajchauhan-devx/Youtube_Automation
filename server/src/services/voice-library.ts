import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { currentWorkspace, accountDir } from './workspace.js';
import { containedFile } from './paths.js';
import { TtsError, type VoiceInfo } from './tts-shared.js';

const execFileAsync = promisify(execFile);
const SERVER_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const SHARED_VOICE_DIR = path.resolve(process.env.CHATTERBOX_VOICE_DIR || path.join(SERVER_ROOT, 'data', 'voices'));
const MAX_VOICE_UPLOAD_BYTES = 25 * 1024 * 1024;

export function voiceLibraryDir(): string {
  const { accountId } = currentWorkspace();
  if (accountId === 'default') return SHARED_VOICE_DIR;
  return path.join(accountDir(accountId), 'voices');
}

export function inspectVoiceReference(wav: Buffer): { durationSeconds: number } {
  let sampleRate = 0;
  let samples: Buffer | undefined;
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Invalid WAV recording.');
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > wav.length) throw new Error('Incomplete WAV recording.');
    const type = wav.toString('ascii', offset, offset + 4);
    if (type === 'fmt ' && size >= 16) {
      if (wav.readUInt16LE(start) !== 1 || wav.readUInt16LE(start + 2) !== 1 || wav.readUInt16LE(start + 14) !== 16) throw new Error('Expected mono PCM audio.');
      sampleRate = wav.readUInt32LE(start + 4);
    }
    if (type === 'data') samples = wav.subarray(start, start + size);
    offset = start + size + size % 2;
  }
  if (!sampleRate || !samples || samples.length % 2) throw new Error('Recording contains no valid audio.');
  const durationSeconds = samples.length / 2 / sampleRate;
  if (durationSeconds < 6) throw new Error('Use at least 6 seconds of clear speech; 8–12 seconds in the selected language works well.');
  const count = Math.min(samples.length / 2, sampleRate * 10);
  const frameSize = Math.max(1, Math.round(sampleRate * 0.02));
  let clipped = 0;
  let peak = 0;
  const levels: number[] = [];
  for (let start = 0; start < count; start += frameSize) {
    let sum = 0;
    const end = Math.min(start + frameSize, count);
    for (let i = start; i < end; i++) {
      const sample = samples.readInt16LE(i * 2) / 32768;
      peak = Math.max(peak, Math.abs(sample));
      if (Math.abs(sample) >= 0.998) clipped++;
      sum += sample * sample;
    }
    levels.push(Math.sqrt(sum / (end - start)));
  }
  const activeSeconds = levels.filter(level => level > Math.max(0.001, peak * 0.01)).length * 0.02;
  if (peak < 0.01 || activeSeconds < 3) throw new Error('The opening needs at least 3 seconds of audible speech. Remove long silences and re-record at a clear level.');
  if (clipped / count > 0.005) throw new Error('The recording is clipped or distorted. Lower the microphone level and record again.');
  return { durationSeconds };
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

function readVoiceEntries(dir: string, language: 'hi' | 'en', prefix: 'clone_' | 'preset_'): VoiceInfo[] {
  if (!fs.existsSync(dir)) return [];
  const voices: VoiceInfo[] = [];
  for (const filename of fs.readdirSync(dir)) {
    if (!filename.endsWith('.json') || !filename.startsWith(prefix)) continue;
    try {
      const metadata = JSON.parse(fs.readFileSync(path.join(dir, filename), 'utf8')) as Record<string, unknown>;
      const id = String(metadata.id || '');
      const voiceLanguage = metadata.language === 'hi' ? 'hi' : 'en';
      if (!safeVoiceId(id) || !id.startsWith(prefix) || voiceLanguage !== language || !fs.existsSync(path.join(dir, `${id}.wav`))) continue;
      const isPreset = prefix === 'preset_';
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
        referenceRevision: typeof metadata.referenceRevision === 'string' ? metadata.referenceRevision : undefined,
      });
    } catch {
      // Invalid metadata is ignored rather than breaking all voice selection.
    }
  }
  return voices;
}

export function readLocalVoiceMetadata(language: 'hi' | 'en'): VoiceInfo[] {
  const dir = voiceLibraryDir();
  fs.mkdirSync(dir, { recursive: true });
  const voices: VoiceInfo[] = [];
  voices.push(...readVoiceEntries(SHARED_VOICE_DIR, language, 'preset_'));
  voices.push(...readVoiceEntries(dir, language, 'clone_'));
  return voices;
}

export function getLocalVoiceReference(id: string): string | null {
  if (!safeVoiceId(id) || !id.startsWith('clone_')) return null;
  const dir = voiceLibraryDir();
  const file = containedFile(dir, `${id}.wav`);
  const metadata = containedFile(dir, `${id}.json`);
  return fs.existsSync(file) && fs.existsSync(metadata) ? file : null;
}

export async function createLocalVoice(params: {
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

  const dir = voiceLibraryDir();
  fs.mkdirSync(dir, { recursive: true });
  const id = `clone_${crypto.randomUUID()}`;
  const inputPath = path.join(dir, `${id}.upload`);
  const wavPath = path.join(dir, `${id}.wav`);
  const metadataPath = path.join(dir, `${id}.json`);
  fs.writeFileSync(inputPath, input, { flag: 'wx' });

  try {
    await execFileAsync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath,
      '-t', '30', '-ac', '1', '-ar', '24000',
      '-af', 'silenceremove=start_periods=1:start_duration=0.1:start_threshold=-45dB:start_silence=0.08,atrim=duration=12',
      '-c:a', 'pcm_s16le', wavPath,
    ], { windowsHide: true, timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });
    const { durationSeconds } = inspectVoiceReference(fs.readFileSync(wavPath));
    fs.writeFileSync(metadataPath, JSON.stringify({
      id,
      name,
      language: params.language,
      gender: normalizeGender(params.gender),
      referenceRevision: 'clean-reference-v1',
      durationSeconds,
      createdAt: new Date().toISOString(),
    }, null, 2), { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    try { if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath); } catch {}
    try { if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath); } catch {}
    throw new TtsError('VALIDATION', `Could not prepare voice reference: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch {}
  }

  const found = readLocalVoiceMetadata(params.language).find((voice) => voice.id === id);
  if (!found) throw new TtsError('API_ERROR', 'Could not locate created voice.');
  return found;
}

export async function deleteLocalVoice(id: string): Promise<void> {
  if (!safeVoiceId(id)) throw new TtsError('VALIDATION', 'Invalid local voice identifier.');
  if (id.startsWith('preset_')) throw new TtsError('VALIDATION', 'Built-in preset voices cannot be deleted.');
  const dir = voiceLibraryDir();
  const targets = [path.join(dir, `${id}.wav`), path.join(dir, `${id}.json`)]
    .map(target => path.resolve(target))
    .filter(target => path.dirname(target) === path.resolve(dir) && fs.existsSync(target));
  if (targets.length === 0) throw new TtsError('VALIDATION', 'Voice reference not found in this profile.');
  for (const target of targets) fs.unlinkSync(target);
}
