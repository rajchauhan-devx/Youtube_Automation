import fs from 'node:fs';

const filePath = 'server/src/services/google-tts.ts';
let content = fs.readFileSync(filePath, 'utf8');

const target = `export async function synthesizeGoogleTts(text: string, voice: string | undefined, language: 'en' | 'hi', speed = 1): Promise<Buffer> {
  if (typeof text !== 'string' || !text.trim() || text.length > 50_000) throw new TtsError('VALIDATION', 'Narration must contain 1–50,000 characters.');
  if (!Number.isFinite(speed) || speed < 0.75 || speed > 1.5) throw new TtsError('VALIDATION', 'Speech speed must be between 0.75 and 1.5.');
  const voices = await getGoogleTtsVoices(language);
  const selected = voice && voice !== 'default' ? voices.find(item => item.id === voice) : voices[0];
  if (!selected) throw new TtsError('VALIDATION', 'Choose an available Google Chirp 3 HD voice for this language.');
  const cleaned = cleanScriptForTTS(text).replace(/\\[\\s*(?:pause|break)[^\\]]*\\]|\\(\\s*pause[^)]*\\)/gi, ', ').replace(/<[^>]*>|\\[[^\\]]*\\]/g, '').trim();
  if (!/[\\p{L}\\p{N}]/u.test(cleaned)) throw new TtsError('VALIDATION', 'Narration contains no speakable text.');`;

const targetLF = target.replace(/\r\n/g, '\n');
const targetCRLF = target.replace(/(?<!\r)\n/g, '\r\n');

const actual = content.includes(targetCRLF) ? targetCRLF : targetLF;
const eol = content.includes('\r\n') ? '\r\n' : '\n';

const replacement = [
  `function createSilentWav(durationSeconds = 2, sampleRate = 24000): Buffer {`,
  `  const numSamples = Math.floor(sampleRate * durationSeconds);`,
  `  const dataSize = numSamples * 2;`,
  `  const buffer = Buffer.alloc(44 + dataSize);`,
  `  buffer.write('RIFF', 0);`,
  `  buffer.writeUInt32LE(36 + dataSize, 4);`,
  `  buffer.write('WAVE', 8);`,
  `  buffer.write('fmt ', 12);`,
  `  buffer.writeUInt32LE(16, 16);`,
  `  buffer.writeUInt16LE(1, 20);`,
  `  buffer.writeUInt16LE(1, 22);`,
  `  buffer.writeUInt32LE(sampleRate, 24);`,
  `  buffer.writeUInt32LE(sampleRate * 2, 28);`,
  `  buffer.writeUInt16LE(2, 32);`,
  `  buffer.writeUInt16LE(16, 34);`,
  `  buffer.write('data', 36);`,
  `  buffer.writeUInt32LE(dataSize, 40);`,
  `  return buffer;`,
  `}`,
  ``,
  `export async function synthesizeGoogleTts(text: string, voice: string | undefined, language: 'en' | 'hi', speed = 1): Promise<Buffer> {`,
  `  if (typeof text !== 'string' || !text.trim() || text.length > 50_000) throw new TtsError('VALIDATION', 'Narration must contain 1–50,000 characters.');`,
  `  if (!Number.isFinite(speed) || speed < 0.75 || speed > 1.5) throw new TtsError('VALIDATION', 'Speech speed must be between 0.75 and 1.5.');`,
  `  const cleaned = cleanScriptForTTS(text).replace(/\\[\\s*(?:pause|break)[^\\]]*\\]|\\(\\s*pause[^)]*\\)/gi, ', ').replace(/<[^>]*>|\\[[^\\]]*\\]/g, '').trim();`,
  `  if (!/[\\p{L}\\p{N}]/u.test(cleaned)) {`,
  `    return createSilentWav(2, 24000);`,
  `  }`,
  `  const voices = await getGoogleTtsVoices(language);`,
  `  const selected = voice && voice !== 'default' ? voices.find(item => item.id === voice) : voices[0];`,
  `  if (!selected) throw new TtsError('VALIDATION', 'Choose an available Google Chirp 3 HD voice for this language.');`
].join(eol);

if (!content.includes(actual)) {
  console.error('Target not found in google-tts.ts');
  process.exit(1);
}

content = content.replace(actual, replacement);
fs.writeFileSync(filePath, content, 'utf8');
console.log('google-tts.ts patched successfully!');
