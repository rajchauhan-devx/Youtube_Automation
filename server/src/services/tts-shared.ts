export class TtsError extends Error {
  code: string;
  detail?: unknown;
  constructor(code: string, message: string, detail?: unknown) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

export interface VoiceInfo {
  id: string;
  name: string;
  description: string;
  gender: 'male' | 'female' | 'neutral';
  language: 'en' | 'hi';
  sampleText: string;
  pitch: number; // For voice preview synthesis
}

export function splitIntoChunks(text: string, maxLen: number): string[] {
  const sentences = text.match(/[^।.!?\n]+[।.!?\n]*\s*/g)?.map((s) => s.trim()).filter(Boolean) || [];
  if (sentences.length === 0) return [text.trim()];

  const chunks: string[] = [];
  let current = '';
  for (const s of sentences) {
    if (s.length > maxLen) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let i = 0; i < s.length; i += maxLen) {
        chunks.push(s.slice(i, i + maxLen));
      }
      continue;
    }
    if (current && (current + s).length > maxLen) {
      chunks.push(current);
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// Concatenate several PCM WAV buffers (same format) into a single WAV file.
export function concatWavs(buffers: Buffer[]): Buffer {
  let fmtChunk: Buffer | null = null;
  const dataParts: Buffer[] = [];
  let dataSize = 0;

  for (const buf of buffers) {
    if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') continue;
    let offset = 12;
    while (offset + 8 <= buf.length) {
      const id = buf.toString('ascii', offset, offset + 4);
      const size = buf.readUInt32LE(offset + 4);
      if (offset + 8 + size > buf.length) break;
      if (id === 'fmt ' && !fmtChunk) {
        fmtChunk = buf.slice(offset, offset + 8 + size);
      } else if (id === 'data') {
        const d = buf.slice(offset + 8, offset + 8 + size);
        dataParts.push(d);
        dataSize += d.length;
      }
      offset += 8 + size + (size % 2);
    }
  }

  if (!fmtChunk || dataParts.length === 0) {
    throw new TtsError('NO_OUTPUT', 'Failed to concatenate generated audio chunks.');
  }

  const out = Buffer.alloc(12 + fmtChunk.length + 8 + dataSize);
  out.write('RIFF', 0);
  out.writeUInt32LE(out.length - 8, 4);
  out.write('WAVE', 8);
  fmtChunk.copy(out, 12);
  out.write('data', 12 + fmtChunk.length);
  out.writeUInt32LE(dataSize, 16 + fmtChunk.length);
  let p = 20 + fmtChunk.length;
  for (const d of dataParts) {
    d.copy(out, p);
    p += d.length;
  }
  return out;
}
