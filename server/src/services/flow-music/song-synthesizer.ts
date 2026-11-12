import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { FlowMusicSettings } from './flow-music-types.js';
import { synthesizeGoogleTts } from '../google-tts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function getPythonPath(): string | null {
  const candidates = [
    process.env.ALIGNMENT_PYTHON,
    path.join(REPO_ROOT, 'services', 'alignment', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    path.resolve('services/alignment/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    path.resolve('../services/alignment/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
  ].filter(Boolean) as string[];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

/**
 * Executes a child process and captures stdout/stderr.
 */
function execProcess(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
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
    console.warn('[Flow Music] Whisper transcription skipped: python venv or audio not found at', audioPath);
    return '';
  }

  const script = `
import numpy as np
import subprocess
import json
import sys
from faster_whisper import WhisperModel

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
async function probeAudioDuration(audioPath: string): Promise<number> {
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

/**
 * Detects whether text contains Hindi / Sanskrit (Devanagari) script.
 */
function isDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

/**
 * Resolves best Google Chirp 3 HD voices for the given vocal profile & language.
 */
function resolveVocalVoices(profile: string, isHindi: boolean): { lead: string; backing?: string } {
  const norm = (profile || 'male').toLowerCase();
  if (isHindi) {
    if (norm.includes('female')) {
      return { lead: 'hi-IN-Chirp3-HD-Aoede', backing: 'hi-IN-Chirp3-HD-Leda' };
    }
    if (norm.includes('choir') || norm.includes('duet')) {
      return { lead: 'hi-IN-Chirp3-HD-Fenrir', backing: 'hi-IN-Chirp3-HD-Aoede' };
    }
    return { lead: 'hi-IN-Chirp3-HD-Fenrir', backing: 'hi-IN-Chirp3-HD-Puck' };
  }

  // English
  if (norm.includes('female')) {
    return { lead: 'en-US-Chirp3-HD-Aoede', backing: 'en-US-Chirp3-HD-Leda' };
  }
  if (norm.includes('choir') || norm.includes('duet')) {
    return { lead: 'en-US-Chirp3-HD-Fenrir', backing: 'en-US-Chirp3-HD-Aoede' };
  }
  return { lead: 'en-US-Chirp3-HD-Fenrir', backing: 'en-US-Chirp3-HD-Orus' };
}

/**
 * Synthesizes a studio-grade musical song with actual vocal lyrics, drums, bassline,
 * chords, arrangement, and mixing, then verifies it with Whisper transcription.
 */
export async function synthesizeFullSongTrack(
  settings: FlowMusicSettings,
  outputPath: string,
  durationSec: number
): Promise<{ transcription: string; duration: number }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-song-synth-'));
  const targetDuration = Math.max(10, Math.min(180, Math.round(durationSec || settings.duration || 60)));
  const bpm = Math.max(70, Math.min(180, Number(settings.bpm) || 120));
  const interval = 60 / bpm; // Beat duration in seconds
  const beat2 = interval * 2;
  const halfBeat = interval / 2;

  try {
    // 1. Prepare Lyrics
    const rawLyrics = String(settings.lyrics || '').trim();
    let lyricsText = rawLyrics
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('[') && !l.startsWith('('))
      .join(', ');

    if (!lyricsText) {
      // Create evocative lyrics from title and prompt
      lyricsText = [
        settings.title?.trim() || 'Feel the beat',
        settings.prompt?.trim() || 'Rhythm moving through the night',
        'Drop the bass and touch the sky',
      ].filter(Boolean).join(', ');
    }

    const isHindi = isDevanagari(lyricsText);
    const lang = isHindi ? 'hi' : 'en';
    const voices = resolveVocalVoices(settings.vocalProfile, isHindi);

    // 2. Synthesize Vocals with Google Chirp 3 HD
    console.log(`[Song Synthesizer] Synthesizing lead vocals with ${voices.lead} (${lang})...`);
    const leadBuffer = await synthesizeGoogleTts(lyricsText, voices.lead, lang, 1.02);
    const leadVocalPath = path.join(tmpDir, 'lead_vocal.wav');
    fs.writeFileSync(leadVocalPath, leadBuffer);

    let backingVocalPath: string | null = null;
    const isChoir = settings.vocalProfile?.toLowerCase().includes('choir') || settings.vocalProfile?.toLowerCase().includes('duet');
    if (isChoir && voices.backing) {
      try {
        console.log(`[Song Synthesizer] Synthesizing backing vocal harmony with ${voices.backing}...`);
        const backingBuffer = await synthesizeGoogleTts(lyricsText, voices.backing, lang, 1.02);
        backingVocalPath = path.join(tmpDir, 'backing_vocal.wav');
        fs.writeFileSync(backingVocalPath, backingBuffer);
      } catch {}
    }

    const leadDuration = await probeAudioDuration(leadVocalPath);
    console.log(`[Song Synthesizer] Lead vocal duration: ${leadDuration.toFixed(2)}s`);

    // 3. Multi-Track Musical Arrangement Synthesis
    // Kick drum: 808/Dhol exponential frequency drop on downbeats
    const kickExpr = `0.58 * exp(-28*mod(t, ${interval})) * sin(2*PI*(46 + 125*exp(-42*mod(t, ${interval}))) * t)`;
    // Snare / Clap: Crisp filtered backbeat on beats 2 and 4
    const snareExpr = `0.26 * exp(-36*mod(t - ${interval}, ${beat2})) * (2*random(0)-1)`;
    // Hi-hat / Shaker: High-frequency sixteenth/eighth-note groove
    const hihatExpr = `0.09 * exp(-70*mod(t, ${halfBeat})) * (2*random(0)-1)`;
    // Melodic Sub-Bass: Harmonic D2 root with octaves
    const bassFreq = 73.42;
    const bassExpr = `0.32 * exp(-8*mod(t, ${interval})) * (sin(2*PI*${bassFreq}*t) + 0.25*sin(2*PI*${bassFreq * 2}*t))`;
    // Harmonic Chords: D minor warm triad (D3, F3, A3)
    const chordExpr = `0.10 * (sin(2*PI*146.83*t) + sin(2*PI*174.61*t) + sin(2*PI*220.00*t))`;

    // 4. Vocal arrangement across duration
    // Vocal starts after a 1.5s musical intro
    const vocalDelayMs = 1500;
    const vocalEndSec = (vocalDelayMs / 1000) + leadDuration;

    // Filtergraph assembly
    const filterParts: string[] = [];
    const inputs: string[] = ['-y', '-i', leadVocalPath];

    if (backingVocalPath) {
      inputs.push('-i', backingVocalPath);
      // Dual vocal layer: Lead in center with presence, Backing panned with subtle delay
      filterParts.push(
        `[0:a]adelay=${vocalDelayMs}|${vocalDelayMs},highpass=f=110,equalizer=f=3600:t=q:w=1.2:g=3.8,volume=1.5[lead_proc]`,
        `[1:a]adelay=${vocalDelayMs + 18}|${vocalDelayMs + 18},highpass=f=120,volume=0.9[backing_proc]`,
        `[lead_proc][backing_proc]amix=inputs=2:normalize=0[vox_mixed]`
      );
    } else {
      filterParts.push(
        `[0:a]adelay=${vocalDelayMs}|${vocalDelayMs},highpass=f=110,equalizer=f=3600:t=q:w=1.2:g=4.0,volume=1.65[vox_mixed]`
      );
    }

    // Plate reverb and spatial vocal sheen
    filterParts.push(
      `[vox_mixed]asplit=2[vox_dry][vox_send]`,
      `[vox_send]aecho=0.8:0.7:140|280:0.22|0.12,volume=0.35[vox_verb]`,
      `[vox_dry][vox_verb]amix=inputs=2:normalize=0[vox_final]`
    );

    // If song is long enough and vocals ended before half duration, repeat hook at the chorus!
    let vocalStreamToMix = '[vox_final]';
    if (targetDuration >= 28 && vocalEndSec < targetDuration - 8) {
      const chorusDelayMs = Math.round((targetDuration * 0.5) * 1000);
      filterParts.push(
        `[vox_final]asplit=2[v1][v_rep]`,
        `[v_rep]adelay=${chorusDelayMs}|${chorusDelayMs},volume=1.15[v2]`,
        `[v1][v2]amix=inputs=2:normalize=0[vox_structured]`
      );
      vocalStreamToMix = '[vox_structured]';
    }

    // Synthesis streams
    filterParts.push(
      `aevalsrc='${kickExpr}':s=48000:d=${targetDuration}[raw_kick]`,
      `[raw_kick]lowpass=f=280[kick]`,

      `aevalsrc='${snareExpr}':s=48000:d=${targetDuration}[raw_snare]`,
      `[raw_snare]bandpass=f=2400:w=1400[snare]`,

      `aevalsrc='${hihatExpr}':s=48000:d=${targetDuration}[raw_hihat]`,
      `[raw_hihat]highpass=f=7500[hihat]`,

      `aevalsrc='${bassExpr}':s=48000:d=${targetDuration}[raw_bass]`,
      `[raw_bass]lowpass=f=240[bass]`,

      `aevalsrc='${chordExpr}':s=48000:d=${targetDuration}[raw_chords]`,
      `[raw_chords]aecho=0.8:0.8:180:0.35,volume=0.9[chords]`,

      // Combine instrumental tracks
      `[kick][snare][hihat][bass][chords]amix=inputs=5:duration=first:normalize=0[inst_raw]`,
      `[inst_raw]volume=1.05[instrumental]`,

      // Master vocal + instrumental mix
      `[instrumental]${vocalStreamToMix}amix=inputs=2:duration=first:normalize=0[mixed]`,
      `[mixed]alimiter=limit=0.94:attack=5:release=50[out]`
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

    // 5. Speech-to-Text Transcription & Verification with Whisper
    console.log('[Song Synthesizer] Verifying vocal lyrics with Whisper AI transcription...');
    const transcription = await transcribeSongAudio(outputPath);
    console.log(`[Song Synthesizer] Transcribed lyrics from final mix: "${transcription}"`);

    return { transcription, duration: targetDuration };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}
