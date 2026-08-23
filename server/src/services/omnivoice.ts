import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { TtsError, concatWavs, splitIntoChunks, type VoiceInfo } from './tts-shared.js';
import { checkOpenRouterStatus, synthesizeOpenRouter, generateCloudAudio } from './openrouter-tts.js';
import { checkEdgeTtsStatus, synthesizeEdgeTts, generateEdgeAudio } from './edge-tts.js';

export { TtsError, type VoiceInfo } from './tts-shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OMNIVOICE_URL = (process.env.TTS_SERVER_URL || process.env.OMNIVOICE_URL || 'http://localhost:8880').replace(/\/+$/, '');
const GENERATED_DIR = path.join(__dirname, '..', '..', 'data', 'generated');
const OMNIVOICE_START_CMD = (process.env.TTS_START_CMD || process.env.OMNIVOICE_START_CMD || 'python -m omnivoice_server --port 8880');

// 'edge' (default, free Microsoft Edge neural voices), 'openrouter' (cloud, needs OPENROUTER_API_KEY) or 'omni' (local OmniVoice server)
export const TTS_PROVIDER = (process.env.TTS_PROVIDER || 'edge').toLowerCase();
export const TTS_PROVIDER_NAME =
  TTS_PROVIDER === 'omni' ? 'OmniVoice' : TTS_PROVIDER === 'openrouter' ? 'OpenRouter TTS' : 'Edge TTS';

const TTS_TIMEOUT_MS = parseInt(process.env.TTS_TIMEOUT_MS || '300000', 10);
const TTS_NUM_STEP = parseInt(process.env.TTS_NUM_STEP || '4', 10);
// Local OmniVoice model quality collapses for inputs beyond ~100-110 chars
// (output becomes near-silence/noise). Keep chunks at ~85 chars when using it.
const TTS_CHUNK_MAX_CHARS = parseInt(process.env.TTS_CHUNK_MAX_CHARS || '85', 10);

let omniProcess: any = null;

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

const OPENAI_PRESETS = new Set([
  'nova', 'onyx', 'shimmer', 'fable', 'alloy',
  'ash', 'ballad', 'cedar', 'coral', 'echo', 'marin', 'sage', 'verse',
]);

const VOICE_MAP: Record<string, { voice?: string; instructions?: string }> = {
  nova: { voice: 'nova' },
  onyx: { voice: 'onyx' },
  shimmer: { voice: 'shimmer' },
  fable: { voice: 'fable' },
  alloy: { voice: 'alloy' },
  ash: { voice: 'ash' },
  ballad: { voice: 'ballad' },
  cedar: { voice: 'cedar' },
  coral: { voice: 'coral' },
  echo: { voice: 'echo' },
  marin: { voice: 'marin' },
  sage: { voice: 'sage' },
  verse: { voice: 'verse' },
  hi_female: { instructions: 'female, young adult, high pitch, indian accent' },
  hi_male: { instructions: 'male, young adult, moderate pitch, indian accent' },
  hi_female_casual: { instructions: 'female, young adult, moderate pitch, indian accent' },
  hi_male_deep: { instructions: 'male, middle-aged, low pitch, indian accent' },
};

export async function getVoices(language?: string): Promise<VoiceInfo[]> {
  const lang = language === 'hi' ? 'hi' : 'en';
  const baseList = lang === 'hi' ? HINDI_VOICES : ENGLISH_VOICES;

  // Cloud/free providers: fixed character catalog, no local server query.
  if (TTS_PROVIDER !== 'omni') {
    return baseList;
  }

  function normalizeGender(g?: unknown): VoiceInfo['gender'] {
    const gStr = String(g || '').toLowerCase();
    if (gStr.startsWith('female') || gStr === 'woman') return 'female';
    if (gStr.startsWith('male') || gStr === 'man') return 'male';
    return 'neutral';
  }

  try {
    const res = await fetch(`${OMNIVOICE_URL}/v1/voices`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.voices)) {
        const customVoices: VoiceInfo[] = [];
        for (const sv of data.voices) {
          if (!sv.id || baseList.some((b) => b.id === sv.id)) continue;
          const voiceLang = String(sv.language || sv.lang || '').toLowerCase();
          if (voiceLang && !voiceLang.startsWith(lang)) continue;
          customVoices.push({
            id: String(sv.id),
            name: String(sv.name || sv.id),
            description: sv.description || `Custom ${lang.toUpperCase()} OmniVoice Model`,
            gender: normalizeGender(sv.gender),
            language: lang,
            sampleText: lang === 'hi' ? 'नमस्ते! यह मेरी आवाज़ का नमूना है।' : 'Hello! This is a custom voice sample.',
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
    num_step: TTS_NUM_STEP,
  };

  if (cfg.instructions) {
    body.instructions = cfg.instructions;
  } else if (cfg.voice && OPENAI_PRESETS.has(cfg.voice)) {
    body.voice = cfg.voice;
  } else if (OPENAI_PRESETS.has(targetVoice)) {
    body.voice = targetVoice;
  } else if (targetVoice.startsWith('design:')) {
    body.instructions = targetVoice.slice(7);
  } else if (targetVoice && targetVoice !== 'default' && targetVoice !== 'undefined') {
    // Custom voice registered on the OmniVoice server — pass its id straight through
    body.voice = targetVoice;
  } else {
    body.voice = 'nova';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);

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
    if (err.name === 'AbortError') throw new TtsError('TIMEOUT', `OmniVoice TTS generation timed out after ${Math.round(TTS_TIMEOUT_MS / 1000)}s. The narration may be too long — try a shorter script, or increase TTS_TIMEOUT_MS in server/.env.`);
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

  let audioBuffer: Buffer;
  let ext: 'mp3' | 'wav' = 'wav';

  if (TTS_PROVIDER === 'openrouter') {
    const result = await generateCloudAudio(params.text, params.voice);
    audioBuffer = result.buffer;
    ext = result.ext;
  } else if (TTS_PROVIDER === 'edge') {
    const result = await generateEdgeAudio(params.text, params.voice);
    audioBuffer = result.buffer;
    ext = result.ext;
  } else {
    const chunks = splitIntoChunks(params.text, TTS_CHUNK_MAX_CHARS);
    if (chunks.length === 1) {
      audioBuffer = await callOmniVoice(chunks[0], params.voice, params.language);
    } else {
      const parts: Buffer[] = [];
      for (const chunk of chunks) {
        parts.push(await callOmniVoice(chunk, params.voice, params.language));
      }
      audioBuffer = concatWavs(parts);
    }
  }

  const filename = `narration_${params.language}_${Date.now()}.${ext}`;
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
}): Promise<{ buffer: Buffer; contentType: string }> {
  const allVoices = await getVoices(params.language);
  const matched = allVoices.find((v) => v.id === params.voice) || allVoices[0];
  const sampleText = matched?.sampleText || (params.language === 'hi' ? 'नमस्ते! यह मेरी आवाज़ का नमूना है।' : 'Hello! This is a sample of my voice.');

  if (TTS_PROVIDER === 'openrouter') {
    return { buffer: await synthesizeOpenRouter(sampleText, params.voice), contentType: 'audio/mpeg' };
  }
  if (TTS_PROVIDER === 'edge') {
    return { buffer: await synthesizeEdgeTts(sampleText, params.voice), contentType: 'audio/mpeg' };
  }
  return { buffer: await callOmniVoice(sampleText, params.voice, params.language), contentType: 'audio/wav' };
}

export async function checkOmniVoiceStatus(): Promise<boolean> {
  if (TTS_PROVIDER === 'openrouter') {
    return (await checkOpenRouterStatus()).online;
  }
  if (TTS_PROVIDER === 'edge') {
    return checkEdgeTtsStatus();
  }
  try {
    const res = await fetch(`${OMNIVOICE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) return true;
  } catch {}
  try {
    const res = await fetch(`${OMNIVOICE_URL}/v1/models`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function startOmniVoice(): Promise<{ success: boolean; message: string }> {
  if (TTS_PROVIDER !== 'omni') {
    return { success: true, message: `${TTS_PROVIDER_NAME} — no local server to start.` };
  }
  const already = await checkOmniVoiceStatus();
  if (already) return { success: true, message: 'OmniVoice is already running' };

  // Kill any orphaned process occupying port 8880 before launching a new one
  await stopOmniVoice();
  await new Promise((r) => setTimeout(r, 1000));

  const startCmd = OMNIVOICE_START_CMD;
  console.log(`[OmniVoice] Starting with command: ${startCmd}`);

  try {
    if (omniProcess) {
      try { omniProcess.kill(); } catch {}
      omniProcess = null;
    }

    let spawnError: string | null = null;
    let stderrOutput = '';

    fs.mkdirSync(GENERATED_DIR, { recursive: true });

    // Strip custom env vars that cause pydantic-settings in omnivoice_server to throw extra_forbidden error
    const spawnEnv = { ...process.env };
    delete spawnEnv.OMNIVOICE_URL;
    delete spawnEnv.OMNIVOICE_START_CMD;
    delete spawnEnv.COMFYUI_PATH;
    delete spawnEnv.PORT;
    delete spawnEnv.CORS_ORIGIN;
    delete spawnEnv.OPENROUTER_API_KEY;
    delete spawnEnv.COMFYUI_BASE_URL;
    delete spawnEnv.COMFYUI_WORKFLOW_PATH;

    // On Windows, spawn with shell:true so python/pip scripts resolve correctly.
    // Use GENERATED_DIR as cwd so pydantic-settings won't pick up server/.env.
    omniProcess = spawn(startCmd, [], {
      cwd: GENERATED_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      detached: false,
      env: spawnEnv,
    });

    omniProcess.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) console.log(`[OmniVoice stdout] ${line}`);
    });

    omniProcess.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) {
        console.log(`[OmniVoice stderr] ${line}`);
        stderrOutput += line + '\n';
      }
    });

    omniProcess.on('error', (err: any) => {
      console.error(`[OmniVoice] spawn error:`, err.message);
      spawnError = err.message;
    });

    omniProcess.on('exit', (code: number | null) => {
      console.log(`[OmniVoice] process exited with code ${code}`);
      if (code !== null && code !== 0) {
        spawnError = `Process exited with code ${code}. ${stderrOutput.slice(-300)}`;
      }
    });

    // Wait 2 seconds and check if process crashed immediately
    await new Promise((r) => setTimeout(r, 2000));
    if (spawnError) {
      return {
        success: false,
        message: `Failed to start OmniVoice: ${spawnError}. Ensure omnivoice-server is installed (pip install omnivoice-server) and OMNIVOICE_START_CMD in server/.env is correct.`,
      };
    }

    const start = Date.now();
    const timeout = 90000; // 90s — model loading can take 10-20s on CPU
    while (Date.now() - start < timeout) {
      const s = await checkOmniVoiceStatus();
      if (s) {
        console.log(`[OmniVoice] Server is online after ${Math.round((Date.now() - start) / 1000)}s`);
        return { success: true, message: 'OmniVoice started successfully' };
      }
      await new Promise((r) => setTimeout(r, 2000));
      if (spawnError) {
        return { success: false, message: `OmniVoice process exited: ${spawnError}` };
      }
    }

    return { success: false, message: 'Timed out waiting for OmniVoice to start (90s). Check console for errors.' };
  } catch (err: any) {
    console.error(`[OmniVoice] startOmniVoice exception:`, err);
    return { success: false, message: `Failed to start OmniVoice: ${err.message}` };
  }
}

export async function stopOmniVoice(): Promise<{ success: boolean; message: string }> {
  if (TTS_PROVIDER !== 'omni') {
    return { success: true, message: `${TTS_PROVIDER_NAME} — no local server to stop.` };
  }
  let killed = false;
  if (omniProcess) {
    try {
      omniProcess.kill();
      omniProcess = null;
      killed = true;
    } catch (e: any) {
      // ignore
    }
  }

  try {
    const { execSync } = await import('child_process');
    const port = new URL(OMNIVOICE_URL).port || '8880';
    const out = execSync('netstat -ano', { encoding: 'utf8' });
    const lines = out.split('\n').filter((l) => l.includes(`:${port}`));
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid) && pid !== '0') {
        try {
          execSync(`taskkill /F /PID ${pid}`);
          killed = true;
        } catch {}
      }
    }
  } catch {}

  return { success: true, message: killed ? 'OmniVoice stopped' : 'No OmniVoice process found' };
}

function parseCommand(cmdStr: string): [string, ...string[]] {
  const parts = cmdStr.trim().split(/\s+/);
  return [parts[0], ...parts.slice(1)];
}
