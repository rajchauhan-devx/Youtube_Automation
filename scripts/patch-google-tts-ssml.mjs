import fs from 'fs';

const file = 'server/src/services/google-tts.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `export async function synthesizeGoogleTts(text: string, voice: string | undefined, language: 'en' | 'hi', speed = 1): Promise<Buffer> {
  if (typeof text !== 'string' || !text.trim() || text.length > 50_000) throw new TtsError('VALIDATION', 'Narration must contain 1–50,000 characters.');
  if (!Number.isFinite(speed) || speed < 0.75 || speed > 1.5) throw new TtsError('VALIDATION', 'Speech speed must be between 0.75 and 1.5.');
  const cleaned = cleanScriptForTTS(text).replace(/\\[\\s*(?:pause|break)[^\\]]*\\]|\\(\\s*pause[^)]*\\)/gi, ', ').replace(/<[^>]*>|\\[[^\\]]*\\]/g, '').trim();
  if (!/[\\p{L}\\p{N}]/u.test(cleaned)) {
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
}`;

const replacement = `export async function synthesizeGoogleTts(text: string, voice: string | undefined, language: 'en' | 'hi', speed = 1): Promise<Buffer> {
  if (typeof text !== 'string' || !text.trim() || text.length > 50_000) throw new TtsError('VALIDATION', 'Narration must contain 1–50,000 characters.');
  if (!Number.isFinite(speed) || speed < 0.75 || speed > 1.5) throw new TtsError('VALIDATION', 'Speech speed must be between 0.75 and 1.5.');
  
  const trimmed = text.trim();
  const isSsml = /^\\s*<speak[\\s>]/i.test(trimmed);

  let cleaned = trimmed;
  if (!isSsml) {
    cleaned = cleanScriptForTTS(trimmed).replace(/\\[\\s*(?:pause|break)[^\\]]*\\]|\\(\\s*pause[^)]*\\)/gi, ', ').replace(/<[^>]*>|\\[[^\\]]*\\]/g, '').trim();
    if (!/[\\p{L}\\p{N}]/u.test(cleaned)) {
      return createSilentWav(2, 24000);
    }
  }

  const voices = await getGoogleTtsVoices(language);
  const selected = voice && voice !== 'default' ? voices.find(item => item.id === voice) : voices[0];
  if (!selected) throw new TtsError('VALIDATION', 'Choose an available Google Chirp 3 HD voice for this language.');
  const auth = await credentials();
  const buffers: Buffer[] = [];

  if (isSsml) {
    const data = await request('text:synthesize', auth, {
      input: { ssml: cleaned },
      voice: { languageCode: selected.id.split('-Chirp3-')[0], name: selected.id },
      audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000, ...(speed === 1 ? {} : { speakingRate: speed }) },
    });
    const audio = Buffer.from(typeof data.audioContent === 'string' ? data.audioContent : '', 'base64');
    validateWav(audio);
    buffers.push(audio);
  } else {
    for (const chunk of splitGoogleTtsText(cleaned)) {
      const data = await request('text:synthesize', auth, {
        input: { text: chunk },
        voice: { languageCode: selected.id.split('-Chirp3-')[0], name: selected.id },
        audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000, ...(speed === 1 ? {} : { speakingRate: speed }) },
      });
      const audio = Buffer.from(typeof data.audioContent === 'string' ? data.audioContent : '', 'base64');
      validateWav(audio);
      buffers.push(audio);
    }
  }
  return buffers.length === 1 ? buffers[0] : concatWavs(buffers);
}`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content, 'utf8');
console.log('google-tts.ts updated with SSML support');
