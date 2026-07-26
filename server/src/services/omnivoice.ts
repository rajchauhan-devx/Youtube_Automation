import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OMNIVOICE_URL = (process.env.OMNIVOICE_URL || 'http://127.0.0.1:3900').replace(/\/+$/, '');
const GENERATED_DIR = path.join(__dirname, '..', '..', 'data', 'generated');
const OMNIVOICE_START_CMD = (process.env.OMNIVOICE_START_CMD || 'python -m omnivoice_server --port 3900 --num-step 6');

const TTS_TIMEOUT_MS = parseInt(process.env.TTS_TIMEOUT_MS || '120000', 10);

let omniProcess: any = null;

export interface VoiceInfo {
  id: string;
  name: string;
  description: string;
  gender: 'male' | 'female' | 'neutral';
  language: 'en' | 'hi';
  sampleText: string;
  pitch: number; // For voice preview synthesis
}

export const ENGLISH_VOICES: VoiceInfo[] = [
  {
    id: 'nova',
    name: 'Emily - Studio Narrator',
    description: 'Clear, engaging American English female voice ideal for YouTube narrations.',
    gender: 'female',
    language: 'en',
    sampleText: 'Welcome back! Today we are exploring incredible discoveries in science and tech.',
    pitch: 1.15,
  },
  {
    id: 'onyx',
    name: 'Marcus - Deep Anchor',
    description: 'Authoritative, resonant male voice suited for news, tech reviews, and essays.',
    gender: 'male',
    language: 'en',
    sampleText: 'Breaking down the top technology trends that will redefine artificial intelligence.',
    pitch: 0.8,
  },
  {
    id: 'shimmer',
    name: 'Sarah - Friendly & Bright',
    description: 'Warm, conversational female tone perfect for casual storytelling and vlogs.',
    gender: 'female',
    language: 'en',
    sampleText: 'Did you know that honey never spoils? Archeologists found 3,000-year-old edible honey!',
    pitch: 1.25,
  },
  {
    id: 'fable',
    name: 'David - Cinematic Storyteller',
    description: 'Expressive and dramatic male tone crafted for storytelling and YouTube shorts.',
    gender: 'male',
    language: 'en',
    sampleText: 'Deep inside the ancient forest, a mystery was waiting to be uncovered...',
    pitch: 0.9,
  },
  {
    id: 'alloy',
    name: 'Alex - Versatile Neutral',
    description: 'Balanced, clear neutral voice great for tutorials and documentation.',
    gender: 'neutral',
    language: 'en',
    sampleText: 'Here is a step-by-step guide to mastering automated video production.',
    pitch: 1.0,
  },
];

export const HINDI_VOICES: VoiceInfo[] = [
  {
    id: 'hi_female',
    name: 'Ananya - Natural Hindi Narrator',
    description: 'Smooth, polished Hindi female voice with crystal clear articulation for videos.',
    gender: 'female',
    language: 'hi',
    sampleText: 'नमस्ते! मैं अनन्या हूँ। आज के वीडियो में हम भारत की महान उपलब्धियों के बारे में जानेंगे।',
    pitch: 1.15,
  },
  {
    id: 'hi_male',
    name: 'Rohan - Expressive Hindi Shorts',
    description: 'Energetic male voice ideal for viral Hindi YouTube Shorts and explainers.',
    gender: 'male',
    language: 'hi',
    sampleText: 'नमस्ते! मैं रोहन हूँ। क्या आप जानते हैं? यह तकनीक पूरी दुनिया को हैरान कर रही है!',
    pitch: 0.95,
  },
  {
    id: 'hi_female_casual',
    name: 'Priya - Conversational Hinglish',
    description: 'Relatable, modern conversational female voice for daily vlogs and tech reviews.',
    gender: 'female',
    language: 'hi',
    sampleText: 'हे दोस्तों! मैं प्रिया हूँ। आज हम देखने वाले हैं 5 ऐसे गैजेट्स जो आपकी लाइफ आसान बना देंगे।',
    pitch: 1.2,
  },
  {
    id: 'hi_male_deep',
    name: 'Vikram - Deep Voice Hindi',
    description: 'Commanding, deep Hindi male voice suitable for documentary and mystery content.',
    gender: 'male',
    language: 'hi',
    sampleText: 'नमस्कार! मैं विक्रम हूँ। इतिहास के पन्नों में दर्ज यह कहानी आज भी लोगों को हैरान करती है।',
    pitch: 0.75,
  },
];

const VOICE_MAP: Record<string, { voice?: string; instructions?: string }> = {
  nova: { voice: 'nova' },
  onyx: { voice: 'onyx' },
  shimmer: { voice: 'shimmer' },
  fable: { voice: 'fable' },
  alloy: { voice: 'alloy' },
  hi_female: { voice: 'nova', instructions: 'female,young adult,clear articulation,indian accent' },
  hi_male: { voice: 'onyx', instructions: 'male,young adult,energetic,indian accent' },
  hi_female_casual: { voice: 'shimmer', instructions: 'female,casual conversational,indian accent' },
  hi_male_deep: { voice: 'echo', instructions: 'male,deep voice,narrator,indian accent' },
};

export class TtsError extends Error {
  code: string;
  detail?: unknown;
  constructor(code: string, message: string, detail?: unknown) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

export async function getVoices(language?: string): Promise<VoiceInfo[]> {
  const lang = language === 'hi' ? 'hi' : 'en';
  const baseList = lang === 'hi' ? HINDI_VOICES : ENGLISH_VOICES;

  try {
    const res = await fetch(`${OMNIVOICE_URL}/v1/voices`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.voices)) {
        const customVoices: VoiceInfo[] = [];
        for (const sv of data.voices) {
          if (!sv.id || baseList.some((b) => b.id === sv.id)) continue;
          customVoices.push({
            id: String(sv.id),
            name: String(sv.name || sv.id),
            description: sv.description || `Custom ${lang.toUpperCase()} OmniVoice Model`,
            gender: sv.gender || 'neutral',
            language: lang,
            sampleText: lang === 'hi' ? 'नमस्ते! यह वॉयस मॉडल का सैंपल है।' : 'Hello! This is a custom voice sample.',
            pitch: 1.0,
          });
        }
        return [...baseList, ...customVoices];
      }
    }
  } catch {}

  return baseList;
}

async function callOmniVoice(text: string, voice?: string, language?: string): Promise<Buffer> {
  const targetVoice = voice || (language === 'hi' ? 'hi_female' : 'nova');
  const cfg = VOICE_MAP[targetVoice] || {};

  const body: Record<string, any> = {
    model: 'omnivoice',
    input: text,
    response_format: 'wav',
    language: language || 'en',
  };

  if (cfg.voice) body.voice = cfg.voice;
  if (cfg.instructions) body.instructions = cfg.instructions;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

  try {
    const res = await fetch(`${OMNIVOICE_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const textBody = await res.text();
      throw new TtsError('API_ERROR', `OmniVoice API error ${res.status}: ${textBody}`);
    }

    const audioBuffer = Buffer.from(await res.arrayBuffer());
    if (!audioBuffer || audioBuffer.length < 100) {
      throw new TtsError('NO_OUTPUT', 'OmniVoice returned empty audio.');
    }

    return audioBuffer;
  } catch (err: any) {
    if (err instanceof TtsError) throw err;
    if (err.name === 'AbortError') throw new TtsError('TIMEOUT', 'OmniVoice TTS generation timed out');
    throw new TtsError('CONNECTION_REFUSED', `Cannot connect to OmniVoice at ${OMNIVOICE_URL}. Ensure OmniVoice server is running.`);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generateTTS(params: {
  text: string;
  language: 'hi' | 'en';
  voice?: string;
  scriptId: string;
}): Promise<{ filename: string; publicUrl: string; elapsedMs: number }> {
  const start = Date.now();
  const audioBuffer = await callOmniVoice(params.text, params.voice, params.language);

  const filename = `narration_${params.language}_${Date.now()}.wav`;
  const dir = path.join(GENERATED_DIR, params.scriptId);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, audioBuffer);

  return {
    filename,
    publicUrl: `/api/generate/file/${params.scriptId}/${filename}`,
    elapsedMs: Date.now() - start,
  };
}

export async function previewTTS(params: {
  voice?: string;
  language: 'hi' | 'en';
}): Promise<Buffer> {
  const allVoices = params.language === 'hi' ? HINDI_VOICES : ENGLISH_VOICES;
  const matched = allVoices.find((v) => v.id === params.voice) || allVoices[0];
  const sampleText = matched?.sampleText || (params.language === 'hi' ? 'नमस्ते! यह मेरी आवाज़ का नमूना है।' : 'Hello! This is a sample of my voice.');

  return callOmniVoice(sampleText, params.voice, params.language);
}

export async function checkOmniVoiceStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${OMNIVOICE_URL}/v1/models`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function startOmniVoice(): Promise<{ success: boolean; message: string }> {
  const already = await checkOmniVoiceStatus();
  if (already) return { success: true, message: 'OmniVoice is already running' };

  const [cmd, ...args] = parseCommand(OMNIVOICE_START_CMD);

  try {
    if (omniProcess) {
      try { omniProcess.kill(); } catch {}
      omniProcess = null;
    }

    let spawnError: string | null = null;
    omniProcess = spawn(cmd, args, {
      stdio: 'ignore',
      detached: true,
    });
    omniProcess.on('error', (err: any) => {
      spawnError = err.message;
    });
    omniProcess.unref();

    await new Promise((r) => setTimeout(r, 800));
    if (spawnError) {
      return {
        success: false,
        message: `Failed to start OmniVoice: ${spawnError}. Ensure omnivoice-server is installed (pip install omnivoice-server) and OMNIVOICE_START_CMD in server/.env is correct.`,
      };
    }

    const start = Date.now();
    const timeout = 60000;
    while (Date.now() - start < timeout) {
      const s = await checkOmniVoiceStatus();
      if (s) return { success: true, message: 'OmniVoice started successfully' };
      await new Promise((r) => setTimeout(r, 2000));
      if (spawnError) {
        return { success: false, message: `OmniVoice process exited: ${spawnError}` };
      }
    }

    return { success: false, message: 'Timed out waiting for OmniVoice to start (60s).' };
  } catch (err: any) {
    return { success: false, message: `Failed to start OmniVoice: ${err.message}` };
  }
}

export async function stopOmniVoice(): Promise<{ success: boolean; message: string }> {
  let killed = false;
  if (omniProcess) {
    try {
      omniProcess.kill();
      omniProcess = null;
      killed = true;
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }
  const port = new URL(OMNIVOICE_URL).port || '3900';
  try {
    const { spawn: sp } = await import('child_process');
    await new Promise<void>((resolve) => {
      const proc = sp('cmd', ['/c', `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port}') do taskkill /f /pid %a 2>nul`], { shell: true });
      proc.on('close', () => resolve());
      setTimeout(() => resolve(), 2000);
    });
    killed = true;
  } catch {}
  return { success: true, message: killed ? 'OmniVoice stopped' : 'No OmniVoice process found' };
}

function parseCommand(cmdStr: string): [string, ...string[]] {
  const parts = cmdStr.trim().split(/\s+/);
  return [parts[0], ...parts.slice(1)];
}
