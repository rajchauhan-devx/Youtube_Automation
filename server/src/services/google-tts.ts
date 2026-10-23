import { createHash } from 'node:crypto';
import { getGoogleAuthToken, isAdcConfigured } from './google-adc.js';
import { cleanScriptForTTS, concatWavs, TtsError, type VoiceInfo } from './tts-shared.js';

const BASE = 'https://texttospeech.googleapis.com/v1';
export const GOOGLE_TTS_REVISION = 'chirp3-hd-v1';
export const isGoogleTtsConfigured = isAdcConfigured;
let catalog: { project: string; expires: number; voices: VoiceInfo[] } | undefined;
const previews = new Map<string, Buffer>();
const pendingPreviews = new Map<string, Promise<Buffer>>();

async function credentials() {
  const auth = await getGoogleAuthToken();
  if (!auth?.token || !auth.projectId) throw new TtsError('CONFIG', 'Google speech needs Google Cloud Application Default Credentials and a billing project. Configure the same Cloud credentials used for images.');
  return auth;
}

async function request(endpoint: string, auth: { token: string; projectId: string }, body?: unknown) {
  let response: Response;
  try {
    response = await fetch(`${BASE}/${endpoint}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${auth.token}`, 'X-Goog-User-Project': auth.projectId, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    throw new TtsError(error instanceof Error && /timeout|abort/i.test(error.name) ? 'TIMEOUT' : 'CONNECTION_REFUSED', 'Could not reach Google Cloud Text-to-Speech. Check your connection and try again.');
  }
  const data = await response.json().catch(() => ({})) as any;
  if (!response.ok) {
    const disabled = Array.isArray(data.error?.details) && data.error.details.some((detail: any) => detail.reason === 'SERVICE_DISABLED');
    const message = disabled
      ? `Enable the Cloud Text-to-Speech API (texttospeech.googleapis.com) in Google Cloud project ${auth.projectId}, then refresh voices.`
      : response.status === 401 ? 'Google Cloud credentials expired. Sign in again with Application Default Credentials.'
      : response.status === 403 ? 'Google speech access was denied. Check Cloud Text-to-Speech API access, project permissions and billing.'
      : response.status === 429 ? 'Google speech quota was reached. Wait before retrying or check the project quota.'
      : `Google speech failed (${response.status}): ${String(data.error?.message || response.statusText).slice(0, 400)}`;
    throw new TtsError(response.status === 400 ? 'VALIDATION' : 'API_ERROR', message);
  }
  return data;
}

export async function getGoogleTtsVoices(language: 'en' | 'hi'): Promise<VoiceInfo[]> {
  if (language !== 'en' && language !== 'hi') throw new TtsError('VALIDATION', 'Choose Hindi or English.');
  const auth = await credentials();
  if (!catalog || catalog.project !== auth.projectId || catalog.expires < Date.now()) {
    const data = await request('voices', auth);
    const voices: VoiceInfo[] = (Array.isArray(data.voices) ? data.voices : []).flatMap((voice: any) => {
      const match = /^(hi-IN|en-IN|en-US)-Chirp3-HD-([A-Za-z]+)$/.exec(String(voice.name));
      if (!match) return [];
      const lang = match[1] === 'hi-IN' ? 'hi' : 'en';
      const gender = voice.ssmlGender === 'MALE' ? 'male' : voice.ssmlGender === 'FEMALE' ? 'female' : 'neutral';
      return [{ id: voice.name, name: `${match[2]} · ${match[1] === 'hi-IN' ? 'Hindi' : match[1] === 'en-IN' ? 'Indian English' : 'US English'} · ${gender}`,
        description: 'Google Chirp 3 HD narrator', language: lang, gender, source: 'provider', deletable: false,
        sampleText: lang === 'hi' ? 'नमस्ते! हर कहानी की शुरुआत एक सवाल से होती है। आज हम साथ मिलकर उसका जवाब खोजेंगे।' : 'Every story begins with a question. Today, we will discover the answer together.',
        tags: ['Google Cloud', 'Chirp 3 HD'] }];
    });
    if (!voices.length) throw new TtsError('NO_OUTPUT', 'Google returned no Hindi or English Chirp 3 HD voices. Check Cloud Text-to-Speech availability.');
    catalog = { project: auth.projectId, expires: Date.now() + 15 * 60_000, voices: voices.sort((a, b) => a.name.localeCompare(b.name)) };
  }
  const matching = catalog.voices.filter(voice => voice.language === language);
  if (!matching.length) throw new TtsError('NO_OUTPUT', `No ${language === 'hi' ? 'Hindi' : 'English'} Chirp 3 HD voices are available in this project.`);
  return matching;
}

/** Google limits input bytes, not characters. Keep Devanagari graphemes intact. */
export function splitGoogleTtsText(text: string, maxBytes = 4500): string[] {
  if (!Number.isInteger(maxBytes) || maxBytes < 16 || maxBytes > 5000) throw new TtsError('VALIDATION', 'Invalid speech chunk limit.');
  const chunks: string[] = [];
  let current = '';
  const append = (part: string) => {
    if (Buffer.byteLength(current + part, 'utf8') > maxBytes) {
      if (current.trim()) chunks.push(current.trim());
      current = '';
    }
    current += part;
  };
  for (const sentence of text.match(/[^।!?\.]+[।!?\.]*\s*|[।!?\.]+\s*/gu) || []) {
    if (Buffer.byteLength(sentence, 'utf8') <= maxBytes) { append(sentence); continue; }
    for (const word of sentence.match(/\S+\s*|\s+/gu) || []) {
      if (Buffer.byteLength(word, 'utf8') <= maxBytes) { append(word); continue; }
      for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(word)) {
        if (Buffer.byteLength(segment, 'utf8') > maxBytes) throw new TtsError('VALIDATION', 'A speech character exceeds the request limit.');
        append(segment);
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function validateWav(buffer: Buffer) {
  if (buffer.length < 46 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw new TtsError('NO_OUTPUT', 'Google returned invalid WAV audio.');
  let format = false, data = false;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const id = buffer.toString('ascii', offset, offset + 4), size = buffer.readUInt32LE(offset + 4);
    if (offset + 8 + size > buffer.length) throw new TtsError('NO_OUTPUT', 'Google returned truncated audio.');
    if (id === 'fmt ' && size >= 16) format = buffer.readUInt16LE(offset + 8) === 1 && buffer.readUInt16LE(offset + 10) === 1 && buffer.readUInt32LE(offset + 12) === 24000 && buffer.readUInt16LE(offset + 22) === 16;
    if (id === 'data' && size > 0 && size % 2 === 0) data = true;
    offset += 8 + size + size % 2;
  }
  if (!format || !data) throw new TtsError('NO_OUTPUT', 'Google returned empty audio or an unexpected audio format.');
}

function createSilentWav(durationSeconds = 2, sampleRate = 24000): Buffer {
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

export async function synthesizeGoogleTts(text: string, voice: string | undefined, language: 'en' | 'hi', speed = 1): Promise<Buffer> {
  if (typeof text !== 'string' || !text.trim() || text.length > 50_000) throw new TtsError('VALIDATION', 'Narration must contain 1–50,000 characters.');
  if (!Number.isFinite(speed) || speed < 0.75 || speed > 1.5) throw new TtsError('VALIDATION', 'Speech speed must be between 0.75 and 1.5.');
  const cleaned = cleanScriptForTTS(text).replace(/\[\s*(?:pause|break)[^\]]*\]|\(\s*pause[^)]*\)/gi, ', ').replace(/<[^>]*>|\[[^\]]*\]/g, '').trim();
  if (!/[\p{L}\p{N}]/u.test(cleaned)) {
    return createSilentWav(2, 24000);
  }
  const voices = await getGoogleTtsVoices(language);
  const selected = voice && voice !== 'default' ? voices.find(item => item.id === voice) : voices[0];
  if (!selected) throw new TtsError('VALIDATION', 'Choose an available Google Chirp 3 HD voice for this language.');
  const auth = await credentials();
  const buffers: Buffer[] = [];
  for (const chunk of splitGoogleTtsText(cleaned)) {
    const data = await request('text:synthesize', auth, { input: { text: chunk },
      voice: { languageCode: selected.id.split('-Chirp3-')[0], name: selected.id },
      audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000, ...(speed === 1 ? {} : { speakingRate: speed }) } });
    const audio = Buffer.from(typeof data.audioContent === 'string' ? data.audioContent : '', 'base64');
    validateWav(audio);
    buffers.push(audio);
  }
  return buffers.length === 1 ? buffers[0] : concatWavs(buffers);
}

export async function previewGoogleTts(text: string, voice: string | undefined, language: 'en' | 'hi', speed = 1) {
  const auth = await credentials();
  const key = createHash('sha256').update(JSON.stringify([GOOGLE_TTS_REVISION, auth.projectId, language, voice, speed, text])).digest('hex');
  if (previews.has(key)) return previews.get(key)!;
  if (pendingPreviews.has(key)) return pendingPreviews.get(key)!;
  const pending = synthesizeGoogleTts(text, voice, language, speed).then(buffer => {
    previews.set(key, buffer);
    if (previews.size > 30) previews.delete(previews.keys().next().value!);
    return buffer;
  }).finally(() => pendingPreviews.delete(key));
  pendingPreviews.set(key, pending);
  return pending;
}

export async function googleTtsStatus() {
  try {
    await getGoogleTtsVoices('hi');
    return { online: true, ready: true, state: 'ready' as const, model: 'Chirp 3 HD' };
  } catch (error) {
    return { online: false, ready: false, state: 'error' as const, model: 'Chirp 3 HD', error: error instanceof Error ? error.message : 'Google speech is unavailable.' };
  }
}
