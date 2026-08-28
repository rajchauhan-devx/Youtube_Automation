import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = path.join(__dirname, '..', '..', 'data', 'generated');

function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

const POWER_WORDS = new Set([
  'SECRET', 'WARNING', 'INSANE', 'SHOCKING', 'NEVER', 'ALWAYS', 'TRUTH',
  'STOP', 'REVEALED', 'MONEY', 'CRAZY', 'FACT', 'REAL', 'WHY', 'HOW',
  'HIDDEN', 'DANGER', 'BILLION', 'MILLION', 'POWERFUL', 'DEADLY', 'AI', 'NEW', 'BEST'
]);

function formatHighlightedText(chunk: string): string {
  const words = chunk.split(/\s+/);
  return words
    .map((w) => {
      const cleanW = w.replace(/[^a-zA-Z0-9$%]/g, '').toUpperCase();
      const isPower = POWER_WORDS.has(cleanW) || /\d+[%$kKmMbB]?/.test(cleanW);
      if (isPower) {
        return `{\\c&H0000FFFF&}{\\b1}${w.toUpperCase()}{\\b0}{\\c&H00FFFFFF&}`;
      }
      return w.toUpperCase();
    })
    .join(' ');
}

export function generateSubtitleFile(opts: {
  scriptId: string;
  narration: string;
  duration: number;
}): string {
  const { scriptId, narration, duration } = opts;
  const outDir = path.join(GENERATED_DIR, scriptId);
  fs.mkdirSync(outDir, { recursive: true });

  const filePath = path.join(outDir, 'subtitles.ass');

  // Clean narration text
  const cleanText = narration
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanText) {
    fs.writeFileSync(filePath, '', 'utf-8');
    return filePath;
  }

  // Split into words
  const words = cleanText.split(/\s+/);
  if (words.length === 0) {
    fs.writeFileSync(filePath, '', 'utf-8');
    return filePath;
  }

  // Chunk into 3-4 word phrases for punchy Shorts cadence
  const chunks: string[] = [];
  const wordsPerChunk = 3;
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
  }

  const chunkDuration = Math.max(0.8, duration / chunks.length);

  // ASS Script Header with bold White base font, thick black stroke, centered bottom
  let assContent = `[Script Info]
Title: Auto-Generated Shorts Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ShortsDefault,Montserrat,72,&H00FFFFFF,&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,9,3,2,40,40,280,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  chunks.forEach((chunk, index) => {
    const startSec = index * chunkDuration;
    const endSec = Math.min(duration, (index + 1) * chunkDuration);
    const startStr = formatAssTime(startSec);
    const endStr = formatAssTime(endSec);
    const highlighted = formatHighlightedText(chunk);

    assContent += `Dialogue: 0,${startStr},${endStr},ShortsDefault,,0,0,0,,${highlighted}\n`;
  });

  fs.writeFileSync(filePath, assContent, 'utf-8');
  return filePath;
}
