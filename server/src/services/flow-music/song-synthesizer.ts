import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { FlowMusicSettings } from './flow-music-types.js';
import { synthesizeGoogleTts } from '../google-tts.js';
import { synthesizeEdgeTts } from '../edge-tts.js';
import { startComfyUI } from '../comfyui.js';
import { musicInstalled, MUSIC_MODELS } from '../local-music.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const COMFY_BASE = (process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188').replace(/\/+$/, '');

function getPythonPath(): string | null {
  const candidates = [
    process.env.ALIGNMENT_PYTHON,
    path.join(REPO_ROOT, 'services', 'alignment', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    path.resolve('services/alignment/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    path.resolve('../services/alignment/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    path.join(REPO_ROOT, 'artifacts', 'comfy-venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
  ].filter(Boolean) as string[];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

/**
 * Executes a child process and captures stdout/stderr.
 */
function execProcess(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
    proc.on('error', reject);
  });
}

/**
 * Transcribes any audio file using faster_whisper to verify vocal lyrics.
 */
export async function transcribeSongAudio(audioPath: string): Promise<string> {
  const pythonBin = getPythonPath();
  if (!pythonBin || !fs.existsSync(audioPath)) {
    return '';
  }

  const script = `
import numpy as np
import subprocess
import json
import sys
try:
    from faster_whisper import WhisperModel
except Exception as e:
    print('===JSON_START===' + json.dumps({'error': str(e), 'text': ''}) + '===JSON_END===')
    sys.exit(0)

try:
    cmd = ['ffmpeg', '-nostdin', '-threads', '0', '-i', sys.argv[1], '-f', 's16le', '-ac', '1', '-acodec', 'pcm_s16le', '-ar', '16000', '-']
    out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL)
    audio = np.frombuffer(out, np.int16).flatten().astype(np.float32) / 32768.0

    model = WhisperModel('tiny', device='cpu', compute_type='int8')
    segments, info = model.transcribe(audio, beam_size=3)
    text = ' '.join(s.text.strip() for s in segments if s.text.strip())
    print('===JSON_START===' + json.dumps({'text': text, 'language': info.language}) + '===JSON_END===')
except Exception as e:
    print('===JSON_START===' + json.dumps({'error': str(e), 'text': ''}) + '===JSON_END===')
`;

  try {
    const res = await execProcess(pythonBin, ['-c', script, audioPath]);
    const match = res.stdout.match(/===JSON_START===(.*?)===JSON_END===/s);
    if (match) {
      const parsed = JSON.parse(match[1]);
      return (parsed.text || '').trim();
    }
    return '';
  } catch (err: any) {
    console.warn('[Flow Music] Whisper transcription note:', err?.message);
    return '';
  }
}

/**
 * Probes the duration of an audio file in seconds using ffprobe.
 */
export async function probeAudioDuration(audioPath: string): Promise<number> {
  try {
    const res = await execProcess('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      audioPath,
    ]);
    const val = parseFloat(res.stdout.trim());
    return !isNaN(val) && val > 0 ? val : 0;
  } catch {
    return 0;
  }
}

const HINDI_GENRE_RE = /\b(hindi|hinglish|bollywood|bhajan|kirtan|aarti|chalisa|shloka|mantra|sufi|qawwali|punjabi|desi|bhojpuri|ghazal|geet|deshbhakti|hindustani|indian classical|indian music)\b/i;
const HINDI_DIRECTIVE_RE = /\b(sing in hindi|sing in hinglish|hindi song|hindi vocals|hindi lyrics|hindi singing|hindi track|hindi version|hindi melody)\b/i;
const HINDI_PHRASES_RE = /\b(jai shri|jai shree|sita ram|hare krishna|hare rama|har har|tere bin|tu hi|kya baat|mera dil|meri jaan|nach le|ho gaya|ek baar|aisa kyu|dard e dil|ab to|kab tak|saath nibhana|dil diya|tod de|gyan gun sagar)\b/i;

const HINDI_VOCAB_SET = new Set([
  'hai', 'hain', 'ho', 'hoon', 'hun', 'tha', 'thi', 'the', 'kya', 'kyun', 'kyon', 'kaha', 'kahan', 'kaise', 'kaisa', 'kaisi',
  'mera', 'meri', 'mere', 'tera', 'teri', 'tere', 'uska', 'uski', 'uske', 'hamara', 'hamari', 'humare', 'tumhara', 'tumhari', 'tumhare',
  'apna', 'apni', 'apne', 'hum', 'tum', 'aap', 'woh', 'yeh', 'main', 'mujhe', 'tujhe', 'humein', 'dil', 'jaan', 'zindagi', 'ishq',
  'pyaar', 'pyar', 'mohabbat', 'deewana', 'deewani', 'shayar', 'aankhein', 'aankhon', 'khushi', 'dard', 'yaad', 'yaadein', 'sanam',
  'raat', 'subah', 'shaam', 'duniya', 'khuda', 'rab', 'rabb', 'bhagwan', 'ram', 'shri', 'shree', 'sita', 'hanuman', 'radha', 'krishna',
  'shiva', 'karo', 'karna', 'karta', 'karti', 'karte', 'raha', 'rahi', 'rahe', 'gaya', 'gayi', 'gaye', 'aaya', 'aayi', 'aaye', 'dekh',
  'dekha', 'dekho', 'suno', 'bolo', 'jaana', 'jaao', 'aao', 'baat', 'baatein', 'saath', 'paas', 'door', 'kabhi', 'abhi', 'phir',
  'sirf', 'lekin', 'magar', 'nahi', 'nahin', 'naa', 'mat', 'bhi', 'toh', 'aur', 'pe', 'se', 'ko', 'ka', 'ki', 'ke', 'mein', 'chal',
  'chale', 'naina', 'saajna', 'mahi', 'dholna', 'piya', 'rasiya', 'rehna', 'rehte', 'jeena', 'marna', 'tod', 'chhod', 'bajrangbali'
]);

/**
 * Robustly detects whether a song's lyrics, prompt, or settings require Hindi vocals.
 * Handles Devanagari script, Romanized Hindi (Hinglish), and explicit language selections.
 */
export function detectSongLanguage(settings?: Partial<FlowMusicSettings>, text?: string): 'hi' | 'en' | 'instrumental' {
  if (settings?.lyricsMode === 'instrumental' || settings?.language === 'instrumental') {
    return 'instrumental';
  }
  if (settings?.language === 'hi') {
    return 'hi';
  }
  if (settings?.language === 'en') {
    return 'en';
  }

  const full = [
    text,
    settings?.lyrics,
    settings?.prompt,
    settings?.title,
    settings?.theme,
  ].filter(Boolean).join(' ');

  // 1. Explicit Devanagari script (Hindi, Sanskrit)
  if (/[\u0900-\u097F]/.test(full)) {
    return 'hi';
  }

  // 2. Direct genre or language indication in prompt, title, or theme
  if (
    HINDI_GENRE_RE.test(settings?.prompt || '') ||
    HINDI_GENRE_RE.test(settings?.title || '') ||
    HINDI_GENRE_RE.test(settings?.theme || '')
  ) {
    return 'hi';
  }

  // 3. Explicit singing directive (e.g. "sing in hindi", "hindi vocals")
  if (HINDI_DIRECTIVE_RE.test(full)) {
    return 'hi';
  }

  // 4. Characteristic Hindi / Hinglish phrases
  if (HINDI_PHRASES_RE.test(full)) {
    return 'hi';
  }

  // 5. Romanized Hindi (Hinglish) keyword density
  const words = full.toLowerCase().match(/[a-z]+/g) || [];
  const matches = new Set(words.filter((w) => HINDI_VOCAB_SET.has(w)));
  if (matches.size >= 2) {
    return 'hi';
  }

  return 'en';
}

/**
 * Resolves best Google Chirp 3 HD & Edge TTS voices for the given vocal profile & language.
 */
function resolveVocalVoices(profile: string, isHindi: boolean): { lead: string; backing?: string; edgeLead: string } {
  const norm = (profile || 'male').toLowerCase();
  if (isHindi) {
    if (norm.includes('female')) {
      return { lead: 'hi-IN-Chirp3-HD-Aoede', backing: 'hi-IN-Chirp3-HD-Leda', edgeLead: 'hi_swara' };
    }
    if (norm.includes('choir') || norm.includes('duet')) {
      return { lead: 'hi-IN-Chirp3-HD-Fenrir', backing: 'hi-IN-Chirp3-HD-Aoede', edgeLead: 'hi_madhur' };
    }
    return { lead: 'hi-IN-Chirp3-HD-Fenrir', backing: 'hi-IN-Chirp3-HD-Puck', edgeLead: 'hi_madhur' };
  }

  if (norm.includes('female')) {
    return { lead: 'en-US-Chirp3-HD-Aoede', backing: 'en-US-Chirp3-HD-Leda', edgeLead: 'en_ava' };
  }
  if (norm.includes('choir') || norm.includes('duet')) {
    return { lead: 'en-US-Chirp3-HD-Fenrir', backing: 'en-US-Chirp3-HD-Aoede', edgeLead: 'en_brian' };
  }
  return { lead: 'en-US-Chirp3-HD-Fenrir', backing: 'en-US-Chirp3-HD-Orus', edgeLead: 'en_brian' };
}

/**
 * Formats user lyrics into clean song structure for ACE-Step 1.5 singing synthesis.
 */
function formatLyricsForAceStep(settings: FlowMusicSettings): string {
  if (settings.lyricsMode === 'instrumental') {
    return '[Instrumental]';
  }
  const raw = String(settings.lyrics || '').trim();
  if (!raw) {
    const fallbackLines = [
      settings.title?.trim(),
      settings.prompt?.trim(),
    ].filter(Boolean);
    if (!fallbackLines.length) return '[Instrumental]';
    return `[Verse]\n${fallbackLines.join('\n')}`;
  }

  const lines: string[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (/^\[.*\]$/.test(trimmed)) {
      const lower = trimmed.toLowerCase();
      if (lower.includes('chorus') || lower.includes('chant') || lower.includes('hook') || lower.includes('drop')) {
        lines.push('[Chorus]');
      } else if (lower.includes('bridge')) {
        lines.push('[Bridge]');
      } else if (lower.includes('outro')) {
        lines.push('[Outro]');
      } else if (lower.includes('intro')) {
        lines.push('[Intro]');
      } else {
        lines.push('[Verse]');
      }
      continue;
    }
    // Strip speaker prefixes like `राम जी: "..."` or `Narrator: ...` so the singer sings the actual line
    const withoutSpeaker = trimmed
      .replace(/^[^:]{1,32}:\s*/, '')
      .replace(/^[""「『]+|[""」』]+$/g, '')
      .trim();
    if (withoutSpeaker && /[\p{L}\p{N}]/u.test(withoutSpeaker)) {
      lines.push(withoutSpeaker);
    }
  }

  if (!lines.some((l) => !l.startsWith('['))) {
    return '[Instrumental]';
  }
  if (!lines[0].startsWith('[')) {
    lines.unshift('[Verse]');
  }
  return lines.join('\n');
}

/**
 * Extracts speakable lyric text for TTS-based fallback synthesis.
 */
function formatLyricsForTts(settings: FlowMusicSettings, isHindi: boolean): string {
  const rawLyrics = String(settings.lyrics || '').trim();
  const cleanLines = rawLyrics
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('[') && !l.startsWith('('))
    .map((l) => l.replace(/^[^:]{1,32}:\s*/, '').replace(/^[""「『]+|[""」』]+$/g, '').trim())
    .filter((l) => /[\p{L}\p{N}]/u.test(l));

  if (cleanLines.length > 0) {
    return cleanLines.join('. ');
  }

  // If lyrics box was empty, check if prompt contains embedded lyrics or spoken lines
  const promptText = settings.prompt?.trim() || '';
  if (promptText) {
    const lyricsMatch = promptText.match(/(?:lyrics?|bol|lines?|words?)[:\s]+([""『「]?[\s\S]+?[""』」]?)(?:$|\n\n)/i);
    if (lyricsMatch?.[1]) {
      const extracted = lyricsMatch[1].replace(/^["'『「]+|["'』」]+$/g, '').trim();
      if (extracted.length > 3) return extracted;
    }
  }

  if (isHindi) {
    return [
      settings.title?.trim() || 'सुरों की धुन',
      settings.prompt?.trim() || 'दिल की धड़कन, सुरमई शाम',
    ].filter(Boolean).join('. ');
  }

  return [
    settings.title?.trim() || 'Feel the rhythm',
    settings.prompt?.trim() || 'Rising high into the night',
  ].filter(Boolean).join('. ');
}

/**
 * Generates a real sung music track with vocals + instruments using local ComfyUI ACE-Step 1.5.
 * Returns null if ComfyUI / ACE-Step models are unavailable or busy.
 */
export async function synthesizeSongWithAceStep(
  settings: FlowMusicSettings,
  outputPath: string,
  durationSec: number,
  options?: { shouldCancel?: () => boolean; onStage?: (stage: string, progress: number) => void }
): Promise<{ transcription: string; duration: number } | null> {
  if (process.env.FLOW_MUSIC_DISABLE_COMFY === '1' || !musicInstalled()) {
    return null;
  }

  options?.onStage?.('Starting local ACE-Step 1.5 music & vocal engine...', 65);
  const started = await startComfyUI();
  if (!started.success) {
    console.warn('[ACE-Step] ComfyUI unavailable:', started.message);
    return null;
  }

  const queueRes = await fetch(`${COMFY_BASE}/queue`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!queueRes?.ok) return null;
  const queue = await queueRes.json() as any;
  if (queue?.queue_running?.length || queue?.queue_pending?.length) {
    console.warn('[ACE-Step] ComfyUI queue is currently busy; falling back.');
    return null;
  }

  const targetDuration = Math.max(10, Math.min(180, Math.round(durationSec || settings.duration || 60)));
  const bpm = Math.max(40, Math.min(240, Math.round(Number(settings.bpm) || 110)));
  const formattedLyrics = formatLyricsForAceStep(settings);
  const isInstrumental = formattedLyrics === '[Instrumental]';
  const songLang = detectSongLanguage(settings, formattedLyrics);
  const language = songLang === 'hi' ? 'hi' : 'en';

  const promptText = settings.prompt?.trim() || '';
  let tags = (promptText || (isInstrumental ? 'instrumental soundtrack' : 'song with vocals')).slice(0, 1000);
  if (language === 'hi' && !/\b(hindi|indian|desi|bollywood|bhajan)\b/i.test(tags)) {
    tags = `${tags}, hindi vocals, indian melodic singing`.slice(0, 1000);
  }
  const seed = Math.floor(Math.random() * 2 ** 31);

  const workflow = {
    '1': { class_type: 'UNETLoader', inputs: { unet_name: MUSIC_MODELS.diffusion_models, weight_dtype: 'default' } },
    '2': { class_type: 'DualCLIPLoader', inputs: { clip_name1: MUSIC_MODELS.text_encoders, clip_name2: 'qwen_1.7b_ace15.safetensors', type: 'ace', device: 'default' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: MUSIC_MODELS.vae } },
    '4': {
      class_type: 'TextEncodeAceStepAudio1.5',
      inputs: {
        clip: ['2', 0],
        tags,
        lyrics: formattedLyrics,
        seed,
        bpm,
        duration: targetDuration,
        timesignature: '4',
        language,
        keyscale: 'D minor',
        generate_audio_codes: true,
        cfg_scale: 2.0,
        temperature: 0.85,
        top_p: 0.9,
        top_k: 0,
        min_p: 0.0,
      },
    },
    '5': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['4', 0] } },
    '6': { class_type: 'EmptyAceStep1.5LatentAudio', inputs: { seconds: targetDuration, batch_size: 1 } },
    '7': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['1', 0], shift: 3.0 } },
    '8': { class_type: 'KSampler', inputs: { model: ['7', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['6', 0], seed, steps: 8, cfg: 1.0, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0 } },
    '9': { class_type: 'VAEDecodeAudioTiled', inputs: { samples: ['8', 0], vae: ['3', 0], tile_size: 256, overlap: 64 } },
    '10': { class_type: 'SaveAudio', inputs: { audio: ['9', 0], filename_prefix: `music/flow_song_${seed}` } },
  };

  options?.onStage?.(`Composing ${targetDuration}s song with vocals via ACE-Step 1.5 (${language})...`, 75);
  const subRes = await fetch(`${COMFY_BASE}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: randomUUID() }),
    signal: AbortSignal.timeout(20000),
  });
  if (!subRes.ok) {
    console.warn(`[ACE-Step] /prompt rejected (${subRes.status})`);
    return null;
  }
  const submission = await subRes.json() as any;
  const promptId = String(submission?.prompt_id || '');
  if (!promptId) return null;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-acestep-'));
  try {
    let audioMeta: any = null;
    const deadline = Date.now() + 600_000;
    while (!audioMeta && Date.now() < deadline) {
      if (options?.shouldCancel?.()) {
        await fetch(`${COMFY_BASE}/interrupt`, { method: 'POST' }).catch(() => {});
        return null;
      }
      await new Promise((r) => setTimeout(r, 2000));
      const histRes = await fetch(`${COMFY_BASE}/history/${promptId}`, { signal: AbortSignal.timeout(10000) }).catch(() => null);
      if (!histRes?.ok) continue;
      const hist = await histRes.json() as any;
      const entry = hist?.[promptId];
      if (entry?.status?.status_str === 'error') {
        console.warn('[ACE-Step] Workflow error:', JSON.stringify(entry.status).slice(0, 300));
        return null;
      }
      if (entry?.status?.completed) {
        audioMeta = entry.outputs?.['10']?.audio?.[0] ?? null;
        if (!audioMeta?.filename) return null;
      }
    }
    if (!audioMeta?.filename) return null;

    options?.onStage?.('Mastering & encoding ACE-Step song to studio MP3...', 90);
    const query = new URLSearchParams({
      filename: audioMeta.filename,
      subfolder: audioMeta.subfolder || '',
      type: audioMeta.type || 'output',
    });
    const viewRes = await fetch(`${COMFY_BASE}/view?${query}`, { signal: AbortSignal.timeout(30000) });
    if (!viewRes.ok) return null;

    const rawFlac = path.join(tmpDir, 'acestep_raw.flac');
    fs.writeFileSync(rawFlac, Buffer.from(await viewRes.arrayBuffer()));

    const ff = await execProcess('ffmpeg', [
      '-y', '-i', rawFlac,
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-ar', '48000', '-ac', '2',
      '-c:a', 'libmp3lame', '-b:a', '192k',
      outputPath,
    ]);
    if (ff.code !== 0 || !fs.existsSync(outputPath) || fs.statSync(outputPath).size < 10000) {
      return null;
    }

    const duration = await probeAudioDuration(outputPath);
    const transcription = await transcribeSongAudio(outputPath).catch(() => '');
    return { transcription, duration: duration || targetDuration };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    await fetch(`${COMFY_BASE}/free`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  }
}

/**
 * Synthesizes vocal audio via Google Chirp 3 HD with automatic Edge TTS fallback.
 */
async function synthesizeVocalFile(
  text: string,
  voices: { lead: string; backing?: string; edgeLead: string },
  lang: 'en' | 'hi',
  tmpDir: string,
  namePrefix: string,
  voiceOverride?: string
): Promise<string> {
  try {
    const buf = await synthesizeGoogleTts(text, voiceOverride || voices.lead, lang, 1.0);
    const wavPath = path.join(tmpDir, `${namePrefix}.wav`);
    fs.writeFileSync(wavPath, buf);
    return wavPath;
  } catch (err: any) {
    console.warn(`[Song Synthesizer] Google TTS fallback to Edge TTS (${err?.message})`);
    const mp3Buf = await synthesizeEdgeTts(text, voices.edgeLead, { language: lang });
    const mp3Path = path.join(tmpDir, `${namePrefix}.mp3`);
    fs.writeFileSync(mp3Path, mp3Buf);
    return mp3Path;
  }
}

/**
 * Synthesizes a clean multi-track vocal + instrumental fallback song when neither
 * live Flow Music nor local ACE-Step is available, then verifies with Whisper if installed.
 */
export async function synthesizeFullSongTrack(
  settings: FlowMusicSettings,
  outputPath: string,
  durationSec: number
): Promise<{ transcription: string; duration: number }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-song-synth-'));
  const targetDuration = Math.max(8, Math.min(180, Math.round(durationSec || settings.duration || 60)));
  const bpm = Math.max(70, Math.min(180, Number(settings.bpm) || 120));
  const interval = 60 / bpm;
  const beat2 = interval * 2;
  const halfBeat = interval / 2;

  try {
    const isHindi = detectSongLanguage(settings, settings.lyrics) === 'hi';
    const lang: 'en' | 'hi' = isHindi ? 'hi' : 'en';
    const lyricsText = formatLyricsForTts(settings, isHindi);
    const voices = resolveVocalVoices(settings.vocalProfile, isHindi);

    console.log(`[Song Synthesizer] Synthesizing lead vocals with ${voices.lead} (${lang})...`);
    const leadVocalPath = await synthesizeVocalFile(lyricsText, voices, lang, tmpDir, 'lead_vocal');

    let backingVocalPath: string | null = null;
    const isChoir = settings.vocalProfile?.toLowerCase().includes('choir') || settings.vocalProfile?.toLowerCase().includes('duet');
    if (isChoir && voices.backing) {
      try {
        backingVocalPath = await synthesizeVocalFile(lyricsText, voices, lang, tmpDir, 'backing_vocal', voices.backing);
      } catch {}
    }

    const leadDuration = await probeAudioDuration(leadVocalPath);
    console.log(`[Song Synthesizer] Lead vocal duration: ${leadDuration.toFixed(2)}s`);

    // Clean, mathematically sound percussion & harmonic arrangement:
    // - Kick uses phase integration over u = mod(t, interval) so frequency never aliases with t.
    // - Snare uses non-negative mod(t + interval, beat2) so exp(-42*...) never overflows!
    // - Pad chords use a slow breathing envelope rather than a continuous static sine drone.
    const kickExpr = `0.45 * exp(-18*mod(t,${interval})) * sin(2*PI*(52*mod(t,${interval}) + 2.6*(1 - exp(-35*mod(t,${interval})))))`;
    const snareExpr = `0.16 * exp(-42*mod(t+${interval},${beat2})) * (0.65*sin(2*PI*190*mod(t+${interval},${beat2})) + 0.35*(2*random(0)-1))`;
    const hihatExpr = `0.035 * exp(-85*mod(t,${halfBeat})) * (2*random(0)-1)`;
    const bassFreq = 73.42;
    const bassExpr = `0.20 * exp(-7*mod(t,${interval})) * (sin(2*PI*${bassFreq}*t) + 0.25*sin(2*PI*${bassFreq * 2}*t))`;
    const chordExpr = `0.045 * (0.55 + 0.45*sin(2*PI*t/${beat2})) * (sin(2*PI*146.83*t) + 0.7*sin(2*PI*174.61*t) + 0.8*sin(2*PI*220.00*t))`;

    const vocalDelayMs = targetDuration >= 12 ? 1200 : 400;
    const filterParts: string[] = [];
    const inputs: string[] = ['-y', '-i', leadVocalPath];

    if (backingVocalPath) {
      inputs.push('-i', backingVocalPath);
      filterParts.push(
        `[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,highpass=f=95,lowpass=f=11000,adelay=${vocalDelayMs}|${vocalDelayMs},volume=1.35[lead_proc]`,
        `[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,highpass=f=110,lowpass=f=10000,adelay=${vocalDelayMs + 18}|${vocalDelayMs + 18},volume=0.75[backing_proc]`,
        `[lead_proc][backing_proc]amix=inputs=2:normalize=0[vox_mixed]`
      );
    } else {
      filterParts.push(
        `[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,highpass=f=95,lowpass=f=11000,adelay=${vocalDelayMs}|${vocalDelayMs},volume=1.4[vox_mixed]`
      );
    }

    // Subtle vocal presence + gentle plate ambiance
    filterParts.push(
      `[vox_mixed]asplit=2[vox_dry][vox_send]`,
      `[vox_send]aecho=0.8:0.65:120|240:0.18|0.09,volume=0.25[vox_verb]`,
      `[vox_dry][vox_verb]amix=inputs=2:normalize=0[vox_base]`
    );

    // Repeat vocal phrase cleanly across long tracks so vocals are heard throughout (not only 2s)
    let vocalStreamToMix = '[vox_base]';
    const firstEndSec = vocalDelayMs / 1000 + leadDuration;
    if (leadDuration > 0.5 && firstEndSec + 3 < targetDuration - 2) {
      const gapSec = Math.max(2.5, Math.min(6, interval * 4));
      const cycleSec = leadDuration + gapSec;
      const repeatDelaysMs: number[] = [];
      let nextStartSec = firstEndSec + gapSec;
      while (nextStartSec + Math.min(leadDuration, 2) < targetDuration - 1 && repeatDelaysMs.length < 4) {
        repeatDelaysMs.push(Math.round((nextStartSec - vocalDelayMs / 1000) * 1000));
        nextStartSec += cycleSec;
      }
      if (repeatDelaysMs.length > 0) {
        const splitCount = repeatDelaysMs.length + 1;
        const splitLabels = ['[v0]', ...repeatDelaysMs.map((_, idx) => `[vr${idx}]`)].join('');
        filterParts.push(`[vox_base]asplit=${splitCount}${splitLabels}`);
        const mixInputs = ['[v0]'];
        repeatDelaysMs.forEach((delayMs, idx) => {
          filterParts.push(`[vr${idx}]adelay=${delayMs}|${delayMs}[vd${idx}]`);
          mixInputs.push(`[vd${idx}]`);
        });
        filterParts.push(`${mixInputs.join('')}amix=inputs=${mixInputs.length}:normalize=0[vox_arranged]`);
        vocalStreamToMix = '[vox_arranged]';
      }
    }

    const fadeOutStart = Math.max(0, +(targetDuration - 0.6).toFixed(2));
    filterParts.push(
      `${vocalStreamToMix}apad=whole_dur=${targetDuration},asplit=2[vox_mix][vox_sc]`,

      `aevalsrc='${kickExpr}':s=48000:d=${targetDuration}[raw_kick]`,
      `[raw_kick]lowpass=f=200[kick]`,

      `aevalsrc='${snareExpr}':s=48000:d=${targetDuration}[raw_snare]`,
      `[raw_snare]bandpass=f=1400:w=1600[snare]`,

      `aevalsrc='${hihatExpr}':s=48000:d=${targetDuration}[raw_hihat]`,
      `[raw_hihat]highpass=f=8500,lowpass=f=13000[hihat]`,

      `aevalsrc='${bassExpr}':s=48000:d=${targetDuration}[raw_bass]`,
      `[raw_bass]lowpass=f=220[bass]`,

      `aevalsrc='${chordExpr}':s=48000:d=${targetDuration}[raw_chords]`,
      `[raw_chords]lowpass=f=1600,aecho=0.8:0.85:180:0.3[chords]`,

      `[kick][snare][hihat][bass][chords]amix=inputs=5:duration=first:normalize=0,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=0.85[inst_stereo]`,

      // Duck the instrumental smoothly whenever vocals are singing/speaking
      `[inst_stereo][vox_sc]sidechaincompress=threshold=0.025:ratio=4:attack=15:release=250[inst_ducked]`,
      `[inst_ducked][vox_mix]amix=inputs=2:duration=first:normalize=0[mixed]`,
      `[mixed]alimiter=limit=0.92:attack=5:release=50,afade=t=out:st=${fadeOutStart}:d=0.6[out]`
    );

    inputs.push(
      '-filter_complex', filterParts.join(';'),
      '-map', '[out]',
      '-t', String(targetDuration),
      '-c:a', 'libmp3lame',
      '-b:a', '192k',
      outputPath
    );

    console.log('[Song Synthesizer] Rendering multi-track song mix through FFmpeg...');
    const ffmpegRes = await execProcess('ffmpeg', inputs);
    if (ffmpegRes.code !== 0) {
      throw new Error(`FFmpeg mixing failed (${ffmpegRes.code}): ${ffmpegRes.stderr.slice(-300)}`);
    }

    const finalSize = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
    console.log(`[Song Synthesizer] Song rendered successfully: ${finalSize} bytes`);

    const transcription = await transcribeSongAudio(outputPath).catch(() => '');
    return { transcription, duration: targetDuration };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}
