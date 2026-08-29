import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { TtsError, buildSSML, type VoiceInfo } from './tts-shared.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYNTHESIZE_SCRIPT = fs.existsSync(path.join(__dirname, 'synthesize.py'))
  ? path.join(__dirname, 'synthesize.py')
  : fs.existsSync(path.join(__dirname, '..', '..', 'src', 'services', 'synthesize.py'))
  ? path.join(__dirname, '..', '..', 'src', 'services', 'synthesize.py')
  : path.join(__dirname, '..', 'src', 'services', 'synthesize.py');

export interface EdgeVoiceConfig {
  voice: string;
  defaultRate?: string;
  defaultPitch?: string;
  defaultVolume?: string;
}

export const EDGE_VOICE_MAP: Record<string, EdgeVoiceConfig> = {
  // English Voices
  en_brian: { voice: 'en-US-BrianMultilingualNeural', defaultRate: '+0%' },
  en_ava: { voice: 'en-US-AvaMultilingualNeural', defaultRate: '+4%' },
  en_andrew: { voice: 'en-US-AndrewMultilingualNeural', defaultRate: '+2%' },
  en_emma: { voice: 'en-US-EmmaMultilingualNeural', defaultRate: '+0%' },
  en_christopher: { voice: 'en-US-ChristopherNeural', defaultRate: '+2%', defaultPitch: '-4Hz' },
  en_jenny: { voice: 'en-US-JennyNeural', defaultRate: '+8%', defaultPitch: '+2Hz' },

  // Backward compatibility / preset aliases for English
  nova: { voice: 'en-US-BrianMultilingualNeural', defaultRate: '+0%' },
  onyx: { voice: 'en-US-ChristopherNeural', defaultRate: '+2%', defaultPitch: '-4Hz' },
  shimmer: { voice: 'en-US-AvaMultilingualNeural', defaultRate: '+6%' },
  fable: { voice: 'en-US-BrianMultilingualNeural', defaultRate: '+0%', defaultPitch: '-2Hz' },
  alloy: { voice: 'en-US-AndrewMultilingualNeural', defaultRate: '+2%' },

  // Hindi Voices
  hi_swara: { voice: 'hi-IN-SwaraNeural', defaultRate: '+4%' },
  hi_madhur: { voice: 'hi-IN-MadhurNeural', defaultRate: '+4%' },
  hi_neerja: { voice: 'en-IN-NeerjaExpressiveNeural', defaultRate: '+6%' },
  hi_prabhat: { voice: 'en-IN-PrabhatNeural', defaultRate: '+2%' },

  // Backward compatibility / preset aliases for Hindi
  hi_female: { voice: 'hi-IN-SwaraNeural', defaultRate: '+4%' },
  hi_male: { voice: 'hi-IN-MadhurNeural', defaultRate: '+4%' },
  hi_female_casual: { voice: 'en-IN-NeerjaExpressiveNeural', defaultRate: '+8%', defaultPitch: '+4Hz' },
  hi_male_deep: { voice: 'en-IN-PrabhatNeural', defaultRate: '-2%', defaultPitch: '-6Hz' },
};

export const EDGE_ENGLISH_VOICES: VoiceInfo[] = [
  {
    id: 'en_brian',
    name: 'Brian - Cinematic Storyteller',
    description: 'Deep, dramatic tone crafted for storytelling, cinema essays, and compelling narration.',
    gender: 'male',
    language: 'en',
    sampleText: 'Deep inside the forgotten ruins of history, a mystery was waiting to redefine our world.',
    pitch: 1.0,
    tags: ['Cinematic', 'Storyteller', 'Ultra-Realistic'],
  },
  {
    id: 'en_ava',
    name: 'Ava - Warm & Vibrant Narrator',
    description: 'Engaging, lively female voice with natural breath inflection. Ideal for top-tier YouTube content.',
    gender: 'female',
    language: 'en',
    sampleText: 'Welcome back! Today we are exploring five incredible discoveries in science that will blow your mind.',
    pitch: 1.1,
    tags: ['Warm', 'Vlog', 'Natural'],
  },
  {
    id: 'en_andrew',
    name: 'Andrew - Polished Tech Anchor',
    description: 'Authoritative, modern male voice suited for technology reviews, AI news, and tutorials.',
    gender: 'male',
    language: 'en',
    sampleText: 'Breaking down the top technology trends that will redefine artificial intelligence in 2026.',
    pitch: 1.0,
    tags: ['Tech', 'Professional', 'Clear'],
  },
  {
    id: 'en_emma',
    name: 'Emma - Expressive Narrative Female',
    description: 'Sophisticated and expressive tone with nuanced emotion for deep-dive essays and audiobooks.',
    gender: 'female',
    language: 'en',
    sampleText: 'Have you ever wondered what happens when technology meets human creativity at the highest level?',
    pitch: 1.05,
    tags: ['Expressive', 'Audiobook', 'Engaging'],
  },
  {
    id: 'en_christopher',
    name: 'Christopher - Deep Anchor & Mystery',
    description: 'Commanding, deep resonant male voice ideal for mystery, crime, and documentary content.',
    gender: 'male',
    language: 'en',
    sampleText: 'In 1977, astronomers received a mysterious 72-second signal from deep space.',
    pitch: 0.85,
    tags: ['Deep Voice', 'Mystery', 'Documentary'],
  },
  {
    id: 'en_jenny',
    name: 'Jenny - Friendly & Bright Vlogger',
    description: 'Upbeat, conversational female voice with sunny energy for daily tips and viral Shorts.',
    gender: 'female',
    language: 'en',
    sampleText: 'Did you know that honey never spoils? Archaeologists found 3,000-year-old edible honey!',
    pitch: 1.15,
    tags: ['Friendly', 'Bright', 'Shorts'],
  },
];

export const EDGE_HINDI_VOICES: VoiceInfo[] = [
  {
    id: 'hi_swara',
    name: 'Swara - Natural Hindi Narrator',
    description: 'Smooth, articulate, and crystal-clear Hindi female voice. Perfect for YouTube videos and storytelling.',
    gender: 'female',
    language: 'hi',
    sampleText: 'नमस्ते! आज हम जानेंगे आर्टिफिशियल इंटेलिजेंस के उन रहस्यों के बारे में, जो भविष्य बदल देंगे।',
    pitch: 1.1,
    tags: ['Natural Hindi', 'Documentary', 'Articulate'],
  },
  {
    id: 'hi_madhur',
    name: 'Madhur - Energetic Hindi Shorts',
    description: 'Dynamic, passionate male voice with punchy delivery. Ideal for viral Hindi Shorts, reels, and tech.',
    gender: 'male',
    language: 'hi',
    sampleText: 'नमस्ते दोस्तों! क्या आप जानते हैं? यह नया आविष्कार पूरी दुनिया में तहलका मचा रहा है!',
    pitch: 0.95,
    tags: ['Energetic', 'Viral Shorts', 'Punchy'],
  },
  {
    id: 'hi_neerja',
    name: 'Neerja - Expressive Hinglish Female',
    description: 'Warm, highly expressive Indian female voice with natural conversational cadence for modern Hinglish.',
    gender: 'female',
    language: 'hi',
    sampleText: 'हे दोस्तों! आज हम देखने वाले हैं 5 ऐसे incredible tech inventions जो आपकी जिंदगी आसान बना देंगे।',
    pitch: 1.15,
    tags: ['Hinglish', 'Modern', 'Conversational'],
  },
  {
    id: 'hi_prabhat',
    name: 'Prabhat - Conversational Indian Male',
    description: 'Relatable, authentic Indian male voice for documentaries, tutorials, and storytelling.',
    gender: 'male',
    language: 'hi',
    sampleText: 'नमस्कार! आज के इस वीडियो में हम जानेंगे भारत के गौरवशाली इतिहास और नई तकनीकों की कहानी।',
    pitch: 0.9,
    tags: ['Relatable', 'Documentary', 'Authentic'],
  },
];

const EDGE_PYTHON = process.env.EDGE_TTS_PYTHON || 'python';
const EDGE_TIMEOUT_MS = 60000;

// In-memory cache for ultra-fast instant preview playback
const previewCache = new Map<string, Buffer>();

export function resolveEdgeVoice(voiceId?: string): { voice: string; defaultRate: string; defaultPitch: string } {
  if (voiceId && EDGE_VOICE_MAP[voiceId]) {
    const v = EDGE_VOICE_MAP[voiceId];
    return {
      voice: v.voice,
      defaultRate: v.defaultRate || '+0%',
      defaultPitch: v.defaultPitch || '+0Hz',
    };
  }
  return {
    voice: 'en-US-BrianMultilingualNeural',
    defaultRate: '+0%',
    defaultPitch: '+0Hz',
  };
}

export async function synthesizeEdgeTts(
  text: string,
  voiceId?: string,
  options?: { rate?: string; pitch?: string; volume?: string; language?: 'hi' | 'en' }
): Promise<Buffer> {
  const resolved = resolveEdgeVoice(voiceId);
  const voice = resolved.voice;
  const rate = options?.rate || resolved.defaultRate;
  const pitch = options?.pitch || resolved.defaultPitch;
  const volume = options?.volume || '+0%';
  const language = options?.language || (voiceId?.startsWith('hi_') || voice.startsWith('hi-') || voice.startsWith('en-IN') ? 'hi' : 'en');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-tts-'));
  const cfgFile = path.join(tmpDir, 'config.json');
  const outFile = path.join(tmpDir, 'output.mp3');

  const config = {
    voice,
    output: outFile,
    text,
    rate,
    pitch,
    volume,
  };

  fs.writeFileSync(cfgFile, JSON.stringify(config, null, 2), { encoding: 'utf-8' });

  try {
    const { stdout, stderr } = await Promise.race([
      execFileAsync(EDGE_PYTHON, [SYNTHESIZE_SCRIPT, cfgFile], { windowsHide: true, maxBuffer: 64 * 1024 * 1024 }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Edge TTS request timed out')), EDGE_TIMEOUT_MS)
      ),
    ]).catch((err: unknown) => {
      const e = err as Error;
      throw new TtsError('CONNECTION_REFUSED', `Edge TTS synthesis failed: ${e?.message || 'unknown error'}`);
    });

    if (!fs.existsSync(outFile)) {
      throw new TtsError('NO_OUTPUT', `Edge TTS produced no output file. ${stderr || stdout || ''}`);
    }

    const buffer = fs.readFileSync(outFile);
    if (!buffer || buffer.length < 100) {
      throw new TtsError('NO_OUTPUT', 'Edge TTS returned empty audio.');
    }
    return buffer;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

export async function previewEdgeTts(
  sampleText: string,
  voiceId?: string,
  options?: { rate?: string; pitch?: string; volume?: string; language?: 'hi' | 'en' }
): Promise<Buffer> {
  const vKey = voiceId || 'en_brian';
  const rKey = options?.rate || '+0%';
  const pKey = options?.pitch || '+0Hz';
  const lKey = options?.language || 'en';
  const cacheKey = `${vKey}_${lKey}_${rKey}_${pKey}_${sampleText.slice(0, 30)}`;

  if (previewCache.has(cacheKey)) {
    return previewCache.get(cacheKey)!;
  }

  const buffer = await synthesizeEdgeTts(sampleText, voiceId, options);
  previewCache.set(cacheKey, buffer);
  return buffer;
}

export function warmupPreviewCache(): void {
  setTimeout(async () => {
    try {
      const all = [...EDGE_ENGLISH_VOICES, ...EDGE_HINDI_VOICES];
      for (const v of all) {
        const cacheKey = `${v.id}_${v.language}_+0%_+0Hz_${v.sampleText.slice(0, 30)}`;
        if (!previewCache.has(cacheKey)) {
          try {
            const buf = await synthesizeEdgeTts(v.sampleText, v.id, {
              language: v.language,
              rate: '+0%',
              pitch: '+0Hz',
            });
            previewCache.set(cacheKey, buf);
          } catch {}
        }
      }
    } catch {}
  }, 1000);
}

// Start cache prewarming in background
warmupPreviewCache();

export async function generateEdgeAudio(
  text: string,
  voiceId?: string,
  options?: { rate?: string; pitch?: string; volume?: string; language?: 'hi' | 'en' }
): Promise<{ buffer: Buffer; ext: 'mp3' }> {
  const buffer = await synthesizeEdgeTts(text, voiceId, options);
  return { buffer, ext: 'mp3' };
}

export async function checkEdgeTtsStatus(): Promise<boolean> {
  try {
    const buf = await synthesizeEdgeTts('Ready', 'en_brian');
    return buf.length > 0;
  } catch {
    return false;
  }
}
