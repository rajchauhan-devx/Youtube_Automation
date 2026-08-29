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
  pitch?: number;
  rate?: number;
  tags?: string[];
  style?: string;
}

/**
 * Strips markdown symbols, stage cues, emojis, and repeated punctuation
 * so neural models speak smoothly without reading symbol names or tags aloud.
 */
export function cleanScriptForTTS(text: string): string {
  if (!text) return '';

  let cleaned = text
    // Remove markdown headers
    .replace(/^#+\s+/gm, '')
    // Remove bold and italics (*text*, **text**, _text_, __text__)
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Remove stage directions like [Narrator: ...], [Voiceover:], (Host:), Scene 1:, etc.
    .replace(/\[\s*(?:Narrator|Voiceover|Host|Speaker\s*\d*|Scene\s*\d*|Sound|SFX|Music|Visual|Intro|Outro)[^\]]*\]:?/gi, '')
    .replace(/\(\s*(?:Narrator|Voiceover|Host|Speaker\s*\d*|Scene\s*\d*|Sound|SFX|Music|Visual|Intro|Outro)[^\)]*\):?/gi, '')
    .replace(/^(?:Narrator|Voiceover|Host|Speaker\s*\d*|Scene\s*\d*):\s*/gim, '')
    // Remove markdown bullet points
    .replace(/^[\s*•-]+\s+/gm, '')
    // Remove emojis
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '')
    // Remove URLs
    .replace(/https?:\/\/\S+/gi, '')
    // Clean up repeated punctuation (e.g. "??", "!!", ",,")
    .replace(/\?{2,}/g, '?')
    .replace(/!{2,}/g, '!')
    .replace(/,{2,}/g, ', ')
    // Normalize spacing around punctuation
    .replace(/([.!?])([A-Za-z\u0900-\u097F])/g, '$1 $2')
    .replace(/,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

/**
 * Translates pause markers ([pause 1s], [pause], ..., (pause 500ms))
 * into standard SSML <break time="..."/> tags and packages the text into
 * an SSML speak document with prosody rate & pitch.
 */
export function buildSSML(
  text: string,
  voiceName: string,
  options?: {
    rate?: string;
    pitch?: string;
    volume?: string;
    language?: 'en' | 'hi';
  }
): string {
  const rate = options?.rate || '+0%';
  const pitch = options?.pitch || '+0Hz';
  const volume = options?.volume || '+0%';
  const lang = options?.language === 'hi' ? 'hi-IN' : 'en-US';

  const cleaned = cleanScriptForTTS(text);

  // Replace pause annotations with SSML break markers
  // Handles: [pause 1s], [pause 1.5s], [pause 500ms], [pause], (pause 1s), [break 1s], ...
  let processed = cleaned.replace(/\[\s*(?:pause|break)\s*(?:(\d+(?:\.\d+)?)\s*(s|sec|seconds?|ms)?)?\s*\]/gi, (_match, num, unit) => {
    let ms = 600;
    if (num) {
      const val = parseFloat(num);
      if (unit && unit.toLowerCase() === 'ms') {
        ms = Math.min(Math.max(val, 100), 5000);
      } else {
        // Default is seconds
        ms = Math.min(Math.max(Math.round(val * 1000), 100), 5000);
      }
    }
    return `__BREAK_${ms}MS__`;
  });

  // Handle (pause 1s) style
  processed = processed.replace(/\(\s*pause\s*(?:(\d+(?:\.\d+)?)\s*(s|sec|seconds?|ms)?)?\s*\)/gi, (_match, num, unit) => {
    let ms = 600;
    if (num) {
      const val = parseFloat(num);
      ms = (unit && unit.toLowerCase() === 'ms') ? val : Math.round(val * 1000);
      ms = Math.min(Math.max(ms, 100), 5000);
    }
    return `__BREAK_${ms}MS__`;
  });

  // Handle ellipses "..." as natural 400ms breath pauses
  processed = processed.replace(/\.{3,}/g, ' __BREAK_400MS__ ');

  // Strip any remaining unwanted bracketed instructions
  processed = processed.replace(/\[[^\]]*\]/g, '').replace(/\([^\)]*\)/g, '');

  // XML escape remaining text
  let xmlSafe = processed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Re-insert break tags
  xmlSafe = xmlSafe.replace(/__BREAK_(\d+)MS__/g, (_match, ms) => `<break time="${ms}ms" />`);

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">
  <voice name="${voiceName}">
    <prosody rate="${rate}" pitch="${pitch}" volume="${volume}">
      ${xmlSafe}
    </prosody>
  </voice>
</speak>`;
}

/**
 * Sanitizes text for plain TTS APIs (e.g. OpenAI audio speech) that do not accept SSML.
 * Replaces pause tokens with natural punctuation/spacing so the words are never spoken.
 */
export function sanitizeTextForPlainTTS(text: string): string {
  const cleaned = cleanScriptForTTS(text);

  return cleaned
    // Convert pause tags to commas/natural breath pauses
    .replace(/\[\s*(?:pause|break)[^\]]*\]/gi, ', ')
    .replace(/\(\s*pause[^\)]*\)/gi, ', ')
    .replace(/\.{3,}/g, ', ')
    // Remove any remaining bracketed text
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^\)]*\)/g, '')
    // Clean up spacing
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    // Ensure terminal punctuation
    .replace(/([^.!?\u0964])$/, '$1.')
    .trim();
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
