import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { TtsError, splitIntoChunks } from './tts-shared.js';

const execFileAsync = promisify(execFile);

export interface EdgeVoiceConfig {
  voice: string;
  rate?: string;
  pitch?: string;
  volume?: string;
}

export const EDGE_VOICE_MAP: Record<string, EdgeVoiceConfig> = {
  nova: { voice: 'en-US-AriaNeural', rate: '+8%' },
  onyx: { voice: 'en-US-ChristopherNeural', rate: '+4%', pitch: '-4Hz' },
  shimmer: { voice: 'en-US-JennyNeural', rate: '+10%', pitch: '+4Hz' },
  fable: { voice: 'en-US-EricNeural', rate: '+0%', pitch: '-2Hz' },
  alloy: { voice: 'en-US-AndrewNeural', rate: '+2%' },
  hi_female: { voice: 'hi-IN-SwaraNeural', rate: '+6%' },
  hi_male: { voice: 'hi-IN-MadhurNeural', rate: '+2%' },
  hi_female_casual: { voice: 'hi-IN-SwaraNeural', rate: '+14%', pitch: '+6Hz' },
  hi_male_deep: { voice: 'hi-IN-MadhurNeural', rate: '-4%', pitch: '-10Hz' },
};

const EDGE_PYTHON = process.env.EDGE_TTS_PYTHON || 'python';
const EDGE_CHUNK_MAX_CHARS = 1200;
const EDGE_TIMEOUT_MS = 60000;

export function resolveEdgeVoice(voiceId?: string): EdgeVoiceConfig {
  return (voiceId && EDGE_VOICE_MAP[voiceId]) || { voice: 'en-US-AriaNeural' };
}

export async function synthesizeEdgeTts(text: string, voiceId?: string): Promise<Buffer> {
  const { voice, rate = '+0%', pitch = '+0Hz', volume = '+0%' } = resolveEdgeVoice(voiceId);
  const tmpFile = path.join(os.tmpdir(), `edge-tts-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);

  const args = [
    '-m',
    'edge_tts',
    '--text',
    text,
    '--voice',
    voice,
    '--rate',
    rate,
    '--pitch',
    pitch,
    '--volume',
    volume,
    '--write-media',
    tmpFile,
  ];

  try {
    await Promise.race([
      execFileAsync(EDGE_PYTHON, args, { windowsHide: true, maxBuffer: 64 * 1024 * 1024 }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('edge-tts request timed out')), EDGE_TIMEOUT_MS)
      ),
    ]).catch((err: unknown) => {
      const e = err as Error;
      throw new TtsError('CONNECTION_REFUSED', `Edge TTS synthesis failed: ${e?.message || 'unknown error'}`);
    });

    const buffer = fs.readFileSync(tmpFile);
    if (!buffer || buffer.length < 100) {
      throw new TtsError('NO_OUTPUT', 'Edge TTS returned empty audio.');
    }
    return buffer;
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

async function concatMp3s(chunks: Buffer[]): Promise<Buffer> {
  if (chunks.length === 1) return chunks[0];

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-tts-'));
  try {
    const files = chunks.map((c, i) => {
      const p = path.join(dir, `chunk_${i}.mp3`);
      fs.writeFileSync(p, c);
      return p;
    });
    const listPath = path.join(dir, 'list.txt');
    fs.writeFileSync(listPath, files.map((f) => `file '${f}'`).join('\n'));

    const out = path.join(dir, 'out.mp3');
    await execFileAsync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', out]);
    return fs.readFileSync(out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function generateEdgeAudio(
  text: string,
  voiceId?: string,
  onChunk?: (done: number, total: number) => void
): Promise<{ buffer: Buffer; ext: 'mp3' }> {
  const chunks = splitIntoChunks(text, EDGE_CHUNK_MAX_CHARS);
  const buffers: Buffer[] = [];
  for (let i = 0; i < chunks.length; i++) {
    buffers.push(await synthesizeEdgeTts(chunks[i], voiceId));
    onChunk?.(i + 1, chunks.length);
  }
  return { buffer: await concatMp3s(buffers), ext: 'mp3' };
}

export async function checkEdgeTtsStatus(): Promise<boolean> {
  try {
    const buf = await synthesizeEdgeTts('hi', 'nova');
    return buf.length > 0;
  } catch {
    return false;
  }
}
