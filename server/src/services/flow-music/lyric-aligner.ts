import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { flowMusicDataDir } from './flow-music-profile.js';
import { formatGeminiModel, geminiRequestTarget, getGeminiApiKey } from '../gemini.js';

export interface AlignedWord {
  word: string;
  start: number;
  end: number;
}

export interface AlignedPhrase {
  start: number;
  end: number;
  text: string;
  words: AlignedWord[];
}

export interface LyricAlignmentResult {
  duration: number;
  hasVocals: boolean;
  source: 'gemini+acoustic' | 'acoustic-dsp';
  phrases: AlignedPhrase[];
  words: AlignedWord[];
}

interface VocalEnvelope {
  duration: number;
  hopSec: number;
  frameRms: number[];
  frameFlux: number[];
  activeThresh: number;
  speechSpans: Array<{ start: number; end: number }>;
}

const ALIGN_CACHE_VERSION = 'v4';
const VOCAL_SAMPLE_RATE = 16000;
const VOCAL_HOP_SAMPLES = 320; // 20ms frames

function resolveVocalPythonBin(): string | null {
  const candidates = [
    process.env.FLOW_MUSIC_VOCAL_PYTHON,
    path.resolve(process.cwd(), 'artifacts/comfy-venv/Scripts/python.exe'),
    path.resolve(process.cwd(), '../artifacts/comfy-venv/Scripts/python.exe'),
    path.resolve(process.cwd(), 'artifacts/comfy-venv/bin/python'),
    path.resolve(process.cwd(), '../artifacts/comfy-venv/bin/python'),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function resolveExtractVocalsScript(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'scripts/extract_vocals.py'),
    path.resolve(process.cwd(), 'server/scripts/extract_vocals.py'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function hasCachedDemucsWeights(): boolean {
  const home = os.homedir();
  const torchHome = process.env.TORCH_HOME || path.join(home, '.cache', 'torch');
  const hubDirs = [
    path.join(torchHome, 'hub', 'torchaudio', 'models'),
    path.join(torchHome, 'hub', 'checkpoints'),
  ];
  for (const dir of hubDirs) {
    try {
      const files = fs.readdirSync(dir);
      if (files.some((f) => f.includes('hdemucs') && (f.endsWith('.pt') || f.endsWith('.pth')))) return true;
    } catch {}
  }
  return false;
}

async function tryExtractDemucsVocalStem(audioPath: string, outWavPath: string): Promise<boolean> {
  const pyBin = resolveVocalPythonBin();
  const scriptPath = resolveExtractVocalsScript();
  if (!pyBin || !scriptPath || !hasCachedDemucsWeights()) return false;

  return new Promise<boolean>((resolve) => {
    const proc = spawn(pyBin, [scriptPath, audioPath, outWavPath], { stdio: ['ignore', 'ignore', 'pipe'] });
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      resolve(false);
    }, 60_000);
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 && fs.existsSync(outWavPath) && fs.statSync(outWavPath).size > 2048);
    });
    proc.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

function getMimeType(audioPath: string): string {
  const ext = path.extname(audioPath).toLowerCase();
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.m4a' || ext === '.aac') return 'audio/mp4';
  if (ext === '.ogg') return 'audio/ogg';
  if (ext === '.flac') return 'audio/flac';
  return 'audio/mpeg';
}

function cacheFilePath(audioPath: string, lyrics: string): string {
  const stat = fs.statSync(audioPath);
  const key = createHash('sha256')
    .update(`${ALIGN_CACHE_VERSION}|${path.basename(audioPath)}|${stat.size}|${Math.round(stat.mtimeMs)}|${lyrics}`)
    .digest('hex')
    .slice(0, 20);
  return path.join(flowMusicDataDir(), 'align_cache', `align_${key}.json`);
}

function readCachedAlignment(audioPath: string, lyrics: string): LyricAlignmentResult | null {
  try {
    const file = cacheFilePath(audioPath, lyrics);
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && Array.isArray(parsed.phrases) && Array.isArray(parsed.words)) {
      return parsed as LyricAlignmentResult;
    }
  } catch {}
  return null;
}

function writeCachedAlignment(audioPath: string, lyrics: string, result: LyricAlignmentResult): void {
  try {
    const file = cacheFilePath(audioPath, lyrics);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(result), 'utf8');
  } catch {}
}

/**
 * Decodes vocal-band PCM via streaming FFmpeg so tracks of any
 * length are analyzed at 20 ms resolution without hitting stdout buffer caps.
 */
async function extractVocalEnvelope(audioPath: string, isDemucsStem = false): Promise<VocalEnvelope> {
  const filterChain = isDemucsStem ? 'highpass=f=85' : 'highpass=f=420,lowpass=f=2800';
  const pcm = await new Promise<Buffer>((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-v', 'error',
      '-i', audioPath,
      '-af', filterChain,
      '-ac', '1',
      '-ar', String(VOCAL_SAMPLE_RATE),
      '-f', 's16le',
      '-',
    ]);
    const chunks: Buffer[] = [];
    let stderr = '';
    proc.stdout?.on('data', (d: Buffer) => chunks.push(d));
    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > 2000) stderr = stderr.slice(-2000);
    });
    proc.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`Vocal envelope decode failed (${code}): ${stderr.slice(-250)}`));
    });
    proc.on('error', reject);
  });

  const hopSec = VOCAL_HOP_SAMPLES / VOCAL_SAMPLE_RATE; // 0.02s
  const totalSamples = Math.floor(pcm.length / 2);
  const frameRms: number[] = [];
  const frameFlux: number[] = [];
  let prevRms = 0;

  for (let start = 0; start + VOCAL_HOP_SAMPLES <= totalSamples; start += VOCAL_HOP_SAMPLES) {
    let sum = 0;
    for (let s = start; s < start + VOCAL_HOP_SAMPLES; s++) {
      const v = pcm.readInt16LE(s * 2) / 32768;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / VOCAL_HOP_SAMPLES);
    frameRms.push(rms);
    frameFlux.push(Math.max(0, rms - prevRms));
    prevRms = rms;
  }

  const duration = Math.max(0.5, +(frameRms.length * hopSec).toFixed(3));
  const sorted = [...frameRms].sort((a, b) => a - b);
  const floor15 = sorted[Math.floor(sorted.length * 0.15)] ?? 0;
  const peak90 = sorted[Math.floor(sorted.length * 0.9)] ?? 0.06;
  const activeThresh = isDemucsStem
    ? Math.max(0.015, floor15 + (peak90 - floor15) * 0.18)
    : Math.max(0.012, floor15 + (peak90 - floor15) * 0.22);

  // Build active speech/vocal spans bridging only brief glottal/consonant stops (0.12s on dry vocals, 0.35s on bandpass)
  const bridgeFrames = Math.round((isDemucsStem ? 0.12 : 0.35) / hopSec);
  const rawSpans: Array<{ start: number; end: number }> = [];
  let inSpan = false;
  let spanStart = 0;

  for (let i = 0; i < frameRms.length; i++) {
    const active = frameRms[i] >= activeThresh;
    if (active && !inSpan) {
      inSpan = true;
      spanStart = i * hopSec;
    } else if (!active && inSpan) {
      let resumedSoon = false;
      for (let k = i + 1; k < Math.min(frameRms.length, i + bridgeFrames); k++) {
        if (frameRms[k] >= activeThresh) {
          resumedSoon = true;
          break;
        }
      }
      if (!resumedSoon) {
        const end = i * hopSec;
        if (end - spanStart >= 0.28) {
          rawSpans.push({ start: +spanStart.toFixed(2), end: +end.toFixed(2) });
        }
        inSpan = false;
      }
    }
  }
  if (inSpan && duration - spanStart >= 0.28) {
    rawSpans.push({ start: +spanStart.toFixed(2), end: +duration.toFixed(2) });
  }

  // Merge short micro-fragments (< 0.90s) or brief phrase-internal breath pauses (<= 0.30s)
  // while keeping longer phrase breaks and hum-prefixed blocks separated.
  const speechSpans: Array<{ start: number; end: number }> = [];
  for (const sp of rawSpans) {
    const prev = speechSpans[speechSpans.length - 1];
    const gap = prev ? +(sp.start - prev.end).toFixed(3) : Infinity;
    const isShortFragmentMerge =
      prev && gap <= 0.40 && (sp.end - sp.start < 0.90 || prev.end - prev.start < 0.90) && sp.end - prev.start <= 4.4;
    const isTightPhraseBridge = prev && gap <= 0.30 && sp.end - prev.start <= 4.3;
    if (isShortFragmentMerge || isTightPhraseBridge) {
      prev.end = sp.end;
    } else {
      speechSpans.push({ ...sp });
    }
  }

  return { duration, hopSec, frameRms, frameFlux, activeThresh, speechSpans };
}

/** Approximates spoken syllable/articulation weight (supports Devanagari + Latin). */
function wordArticulationWeight(word: string): number {
  const chars = [...String(word || '')];
  if (chars.length === 0) return 2;
  // Devanagari vowels/matras/consonants & Latin vowels count strongly toward duration
  let weight = 0;
  for (const ch of chars) {
    if (/[\u0904-\u0914\u093E-\u094C\u0962\u0963aeiouyAEIOUY]/.test(ch)) {
      weight += 1.4;
    } else if (/[\p{L}\p{N}]/u.test(ch)) {
      weight += 0.85;
    }
  }
  return Math.max(1.8, weight);
}

/** Trims genuine dead silence at phrase boundaries using vocal RMS envelope. */
function trimPhraseSilence(
  start: number,
  end: number,
  env: VocalEnvelope
): { start: number; end: number } {
  if (env.frameRms.length === 0 || end - start <= 0.45) return { start, end };
  const silentThresh = env.activeThresh * 0.55;
  const maxTrimFrames = Math.floor(0.32 / env.hopSec);
  const startIdx = Math.max(0, Math.floor(start / env.hopSec));
  const endIdx = Math.min(env.frameRms.length - 1, Math.floor(end / env.hopSec));

  let trimmedStart = startIdx;
  while (
    trimmedStart < endIdx - 12 &&
    trimmedStart - startIdx < maxTrimFrames &&
    env.frameRms[trimmedStart] < silentThresh
  ) {
    trimmedStart++;
  }

  let trimmedEnd = endIdx;
  while (
    trimmedEnd > trimmedStart + 12 &&
    endIdx - trimmedEnd < maxTrimFrames &&
    env.frameRms[trimmedEnd] < silentThresh
  ) {
    trimmedEnd--;
  }

  const nextStart = +(trimmedStart * env.hopSec).toFixed(3);
  const nextEnd = +(Math.max(nextStart + 0.3, (trimmedEnd + 1) * env.hopSec)).toFixed(3);
  return {
    start: nextStart,
    end: Math.min(env.duration, nextEnd),
  };
}

/** Finds strongest positive vocal onset within ±radiusSec around targetTime. */
function snapToVocalOnset(targetTime: number, minTime: number, maxTime: number, env: VocalEnvelope, radiusSec = 0.08): number {
  if (env.frameFlux.length === 0) return targetTime;
  const lo = Math.max(Math.ceil(minTime / env.hopSec), Math.floor((targetTime - radiusSec) / env.hopSec));
  const hi = Math.min(Math.floor(maxTime / env.hopSec), env.frameFlux.length - 1, Math.ceil((targetTime + radiusSec) / env.hopSec));
  if (lo > hi) return targetTime;
  let bestIdx = -1;
  let bestVal = 0;
  for (let i = lo; i <= hi; i++) {
    if (env.frameFlux[i] > bestVal) {
      bestVal = env.frameFlux[i];
      bestIdx = i;
    }
  }
  if (bestIdx >= 0 && bestVal >= env.activeThresh * 0.25) {
    return +(bestIdx * env.hopSec).toFixed(3);
  }
  return targetTime;
}

/**
 * Distributes words across active voiced energy within [start, end] so faster
 * vocal bursts move quicker and held words / pauses align cleanly to the waveform.
 */
function alignWordsInsideSpan(
  wordsText: string[],
  spanStart: number,
  spanEnd: number,
  env: VocalEnvelope,
  candidateWords?: Array<{ w?: string; s?: number; e?: number }>
): AlignedWord[] {
  if (wordsText.length === 0) return [];
  const totalSpan = Math.max(0.25, spanEnd - spanStart);

  // If Gemini supplied distinct valid non-collapsed timestamps matching these words,
  // respect its phrasing & comma pauses and lightly snap starts onto vocal onsets.
  if (
    candidateWords &&
    candidateWords.length === wordsText.length &&
    candidateWords.every((cw) => Number.isFinite(cw.s) && Number.isFinite(cw.e))
  ) {
    const firstS = Number(candidateWords[0].s);
    const lastE = Number(candidateWords[candidateWords.length - 1].e);
    const validSpread = lastE > firstS + 0.2 && firstS >= spanStart - 0.6 && lastE <= spanEnd + 0.6;
    if (validSpread) {
      const refined: AlignedWord[] = [];
      let prevEnd = Math.max(0, Math.min(spanStart, firstS));
      for (let i = 0; i < wordsText.length; i++) {
        const rawS = Number(candidateWords[i].s);
        const rawE = Number(candidateWords[i].e);
        const nextRawS = i + 1 < candidateWords.length ? Number(candidateWords[i + 1].s) : spanEnd;

        const baseStart = Math.max(prevEnd, Math.min(spanEnd - 0.08, rawS));
        const snappedStart = snapToVocalOnset(
          baseStart,
          prevEnd,
          Math.min(spanEnd - 0.08, Math.max(baseStart + 0.06, rawE - 0.05)),
          env,
          0.07
        );
        const minEnd = snappedStart + 0.09;
        const maxAllowedEnd = Math.min(spanEnd, nextRawS > rawE + 0.14 ? rawE + 0.08 : spanEnd);
        const clampedEnd = Math.max(minEnd, Math.min(maxAllowedEnd, Math.max(rawE, minEnd)));

        refined.push({
          word: wordsText[i],
          start: +snappedStart.toFixed(3),
          end: +clampedEnd.toFixed(3),
        });
        prevEnd = clampedEnd;
      }
      if (refined.length > 0) {
        return refined;
      }
    }
  }

  // Recursive comma/clause breath-valley splitting when a phrase has multi-word clauses separated
  // by punctuation (e.g. ',' / ';' / '।') AND the waveform has a matching breath dip >= 0.08s.
  if (wordsText.length >= 4 && env.frameRms.length > 0) {
    const weightsAll = wordsText.map(wordArticulationWeight);
    const totalWAll = weightsAll.reduce((a, b) => a + b, 0) || 1;
    let bestBreak = -1;
    let bestScore = Infinity;
    let accW = 0;

    for (let i = 0; i < wordsText.length - 1; i++) {
      accW += weightsAll[i];
      if (i >= 1 && wordsText.length - 1 - i >= 2 && /[,;?!।]$/.test(wordsText[i])) {
        const distFromMid = Math.abs(accW / totalWAll - 0.5);
        if (distFromMid < bestScore) {
          bestScore = distFromMid;
          bestBreak = i;
        }
      }
    }

    if (bestBreak >= 1) {
      let leftW = 0;
      for (let i = 0; i <= bestBreak; i++) leftW += weightsAll[i];
      const expectedFrac = leftW / totalWAll;
      const expectedTime = spanStart + expectedFrac * totalSpan;
      const winStart = Math.max(spanStart + 0.35, expectedTime - Math.max(0.45, totalSpan * 0.22));
      const winEnd = Math.min(spanEnd - 0.35, expectedTime + Math.max(0.45, totalSpan * 0.22));

      if (winEnd > winStart + 0.12) {
        const fLo = Math.max(0, Math.floor(winStart / env.hopSec));
        const fHi = Math.min(env.frameRms.length - 1, Math.ceil(winEnd / env.hopSec));
        const valleyThresh = env.activeThresh * 0.72;
        const winFrames = 4; // 80ms moving minimum window
        let lowestAvg = Infinity;
        let lowestIdx = -1;
        for (let f = fLo; f <= fHi - winFrames; f++) {
          let sum = 0;
          for (let k = 0; k < winFrames; k++) sum += env.frameRms[f + k] ?? 0;
          const avg = sum / winFrames;
          if (avg < lowestAvg) {
            lowestAvg = avg;
            lowestIdx = f;
          }
        }
        if (lowestIdx >= 0 && lowestAvg < valleyThresh) {
          let vStart = lowestIdx;
          while (vStart > fLo && (env.frameRms[vStart - 1] ?? 0) < valleyThresh) vStart--;
          let vEnd = lowestIdx + winFrames - 1;
          while (vEnd < fHi && (env.frameRms[vEnd + 1] ?? 0) < valleyThresh) vEnd++;
          const splitEndLeft = +Math.max(spanStart + 0.25, vStart * env.hopSec).toFixed(3);
          const splitStartRight = +Math.min(spanEnd - 0.25, Math.max(splitEndLeft + 0.04, (vEnd + 1) * env.hopSec)).toFixed(3);
          if (splitEndLeft > spanStart + 0.25 && spanEnd > splitStartRight + 0.25) {
            return [
              ...alignWordsInsideSpan(wordsText.slice(0, bestBreak + 1), spanStart, splitEndLeft, env),
              ...alignWordsInsideSpan(wordsText.slice(bestBreak + 1), splitStartRight, spanEnd, env),
            ];
          }
        }
      }
    }
  }

  // Acoustic energy-weighted cumulative timeline across [spanStart, spanEnd]
  const weights = wordsText.map(wordArticulationWeight);
  const startIdx = Math.max(0, Math.floor(spanStart / env.hopSec));
  const endIdx = Math.max(startIdx + 1, Math.min(env.frameRms.length, Math.ceil(spanEnd / env.hopSec)));

  // Build cumulative vocal articulation activity across frames (low weight inside silent pauses)
  const cumActivity: number[] = [0];
  for (let i = startIdx; i < endIdx; i++) {
    const r = env.frameRms[i] ?? 0;
    const isActive = r >= env.activeThresh * 0.50;
    const activity = isActive ? 0.55 + Math.min(1.5, r / Math.max(0.01, env.activeThresh)) * 0.45 : 0.015;
    cumActivity.push(cumActivity[cumActivity.length - 1] + activity);
  }
  const totalActivity = cumActivity[cumActivity.length - 1] || 1;
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;

  const mapFractionToTime = (frac: number): number => {
    const target = Math.max(0, Math.min(1, frac)) * totalActivity;
    let lo = 0;
    let hi = cumActivity.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumActivity[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return +(spanStart + (lo / Math.max(1, cumActivity.length - 1)) * totalSpan).toFixed(3);
  };

  const out: AlignedWord[] = [];
  let accWeight = 0;
  let prevEnd = spanStart;

  for (let i = 0; i < wordsText.length; i++) {
    const fracEnd = (accWeight + weights[i]) / totalWeight;
    accWeight += weights[i];
    const start = Math.max(prevEnd, out.length === 0 ? spanStart : prevEnd);
    let end = i === wordsText.length - 1 ? spanEnd : mapFractionToTime(fracEnd);
    end = Math.max(start + 0.09, Math.min(spanEnd, end));
    out.push({
      word: wordsText[i],
      start: +start.toFixed(3),
      end: +end.toFixed(3),
    });
    prevEnd = end;
  }

  return out;
}

function hasRealGeminiConfig(): boolean {
  const key = getGeminiApiKey();
  if (key === 'test-gemini-api-key') return false;
  if (process.env.GEMINI_USE_ADC === 'true') return true;
  return Boolean(key && key.length > 10);
}

interface RawGeminiSegment {
  id?: number;
  slotId?: number;
  start?: number;
  end?: number;
  startFrac?: number;
  endFrac?: number;
  type?: string;
  text?: string;
}

async function sliceSlotToMp3Base64(audioPath: string, startSec: number, durSec: number): Promise<string | null> {
  const tmpClip = path.join(
    os.tmpdir(),
    `flow_slot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`
  );
  try {
    const ok = await new Promise<boolean>((resolve) => {
      const proc = spawn('ffmpeg', [
        '-y', '-v', 'error',
        '-ss', startSec.toFixed(3),
        '-t', Math.max(0.2, durSec).toFixed(3),
        '-i', audioPath,
        '-ar', '16000',
        '-ac', '1',
        '-b:a', '64k',
        tmpClip,
      ]);
      proc.on('close', (code) => resolve(code === 0 && fs.existsSync(tmpClip) && fs.statSync(tmpClip).size > 256));
      proc.on('error', () => resolve(false));
    });
    if (!ok) return null;
    return fs.readFileSync(tmpClip).toString('base64');
  } finally {
    try { fs.unlinkSync(tmpClip); } catch {}
  }
}

/**
 * When Gemini indicates a slot begins with a non-verbal hum (startFrac > 0.12), refine the
 * transition point by finding the local RMS dip at the end of the hum and snapping to the
 * sharp vocal attack immediately following it.
 */
function refineHumPrefixOnset(slotStart: number, slotEnd: number, geminiStart: number, env: VocalEnvelope): number {
  if (env.frameRms.length === 0 || geminiStart <= slotStart + 0.5) return geminiStart;
  const searchStartIdx = Math.max(0, Math.floor((slotStart + 0.6) / env.hopSec));
  const searchEndIdx = Math.min(
    env.frameRms.length - 1,
    Math.floor(Math.min(geminiStart, slotEnd - 1.5) / env.hopSec)
  );
  if (searchEndIdx <= searchStartIdx + 12) return geminiStart;

  let slotPeak = 0;
  for (let i = searchStartIdx; i <= Math.min(env.frameRms.length - 1, Math.floor(slotEnd / env.hopSec)); i++) {
    if (env.frameRms[i] > slotPeak) slotPeak = env.frameRms[i];
  }

  const prevWin = Math.round(0.55 / env.hopSec);
  const nextWin = Math.round(0.45 / env.hopSec);
  const meanRange = (a: number, b: number): number => {
    const lo = Math.max(0, a);
    const hi = Math.min(env.frameRms.length - 1, b);
    if (hi < lo) return 0;
    let s = 0;
    for (let k = lo; k <= hi; k++) s += env.frameRms[k] ?? 0;
    return s / (hi - lo + 1);
  };

  // Find the earliest clear vocal attack where energy rises strongly out of the sustained hum fade
  // into active lyrical energy (>= 1.32x preceding average and >= 55% of slot peak).
  for (let i = searchStartIdx + prevWin; i <= searchEndIdx; i++) {
    const preAvg = meanRange(i - prevWin, i - 2);
    const postAvg = meanRange(i, i + nextWin);
    if (preAvg > 0 && postAvg >= preAvg * 1.32 && postAvg >= slotPeak * 0.55) {
      return +(i * env.hopSec).toFixed(3);
    }
  }
  return geminiStart;
}

async function alignWithGeminiAudio(
  audioPath: string,
  lyrics: string,
  env: VocalEnvelope,
  isIsolatedVocals = false
): Promise<AlignedPhrase[] | null> {
  if (!hasRealGeminiConfig()) return null;
  const stat = fs.statSync(audioPath);
  // Skip multi-megabyte inline payloads > 18MB (unless slicing into slot clips)
  const slots = env.speechSpans;
  const maxSlotDur = slots.reduce((m, s) => Math.max(m, s.end - s.start), 0);
  const useBatchedSlotClips = slots.length > 0 && maxSlotDur <= 14;
  if (!useBatchedSlotClips && stat.size > 18 * 1024 * 1024) return null;

  const model = formatGeminiModel('gemini-flash-latest');
  const target = await geminiRequestTarget(model, 'generateContent', getGeminiApiKey());

  const cleanRefLines = String(lyrics || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^\[.*\]$/.test(l))
    .join('\n');

  let rawSegments: RawGeminiSegment[] = [];

  if (useBatchedSlotClips) {
    const indexedSlots = slots.map((s, id) => ({ id, start: s.start, end: s.end }));
    const batches: Array<typeof indexedSlots> = [];
    for (let i = 0; i < indexedSlots.length; i += 5) {
      batches.push(indexedSlots.slice(i, i + 5));
    }

    const batchResults = await Promise.all(
      batches.map(async (batch) => {
        const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
          {
            text: [
              `You are given ${batch.length} short ${isIsolatedVocals ? 'dry-vocal' : 'vocal'} clips extracted separately in exact chronological order (Clip #${batch[0].id}..#${batch[batch.length - 1].id} out of ${indexedSlots.length} total clips).`,
              'For EACH numbered clip, listen ONLY to the audio directly following its label and identify the spoken/sung lyric in THAT clip.',
              'RULES:',
              '1. Each Clip [#id] has its OWN isolated audio attachment! Never pull lines from the next/previous clip! Only ~1 phrase (3-10 words) fits per normal 2-4s clip.',
              '2. Use the Reference Lyrics below ONLY for accurate Devanagari/English spelling: AI vocalists may slightly slur a consonant, so when a clip phonetically & rhythmically matches a Reference Lyric line in sequence, output the clean intended line (omitting any clearly skipped filler word like "हैं").',
              '3. If a longer clip begins or ends with a wordless hum ("ooh/aah"), set startFrac/endFrac (0.0..1.0 within that clip) covering ONLY where the actual spoken/sung words occur (or text="" if purely hum).',
              cleanRefLines ? `Reference Lyrics:\n${cleanRefLines}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ];

        for (const sl of batch) {
          const clipB64 = await sliceSlotToMp3Base64(audioPath, sl.start, sl.end - sl.start);
          if (!clipB64) continue;
          parts.push({ text: `\nClip [#${sl.id}] (${(sl.end - sl.start).toFixed(2)}s):` });
          parts.push({ inlineData: { mimeType: 'audio/mp3', data: clipB64 } });
        }
        parts.push({
          text: '\nReturn ONLY JSON: {"hasVocals":boolean,"slots":[{"id":number,"text":string,"startFrac":number,"endFrac":number}]}',
        });

        const res = await fetch(target.url, {
          method: 'POST',
          headers: target.headers,
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.0,
              maxOutputTokens: 4096,
              thinkingConfig: { thinkingBudget: 512 },
            },
          }),
          signal: AbortSignal.timeout(60000),
        });
        if (!res.ok) {
          throw new Error(`Gemini batched slot alignment HTTP ${res.status}`);
        }
        const json: any = await res.json();
        const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!rawText) return [] as RawGeminiSegment[];
        const parsed = JSON.parse(rawText);
        if (parsed?.hasVocals === false) return [] as RawGeminiSegment[];
        return Array.isArray(parsed?.slots) ? (parsed.slots as RawGeminiSegment[]) : [];
      })
    );

    rawSegments = batchResults.flat().sort((a, b) => Number(a.id ?? 0) - Number(b.id ?? 0));
  } else {
    const audioBase64 = fs.readFileSync(audioPath).toString('base64');
    const prompt = [
      `Listen carefully to this entire ${env.duration.toFixed(1)}s audio track from 0.0s to ${env.duration.toFixed(1)}s.`,
      'Partition the FULL timeline continuously into contiguous "vocal" and "instrumental" segments with exact start/end seconds.',
      'Critical rules:',
      '1. Every second from 0.0 to the end must be accounted for in chronological order so timing never drifts.',
      '2. Mark pure music breaks, intros, pauses (>0.8s), and instrumental outros as type "instrumental" (never invent lyrics over instrumental-only parts!).',
      '3. For each "vocal" segment, put ONLY the short lyric line/clause actually spoken or sung during that window (3 to 8 words per segment).',
      cleanRefLines
        ? `4. Reference lyrics below are ONLY for accurate Devanagari/English spelling when a vocal line matches what you actually hear:\n--- REFERENCE LYRICS ---\n${cleanRefLines}\n--- END REFERENCE ---`
        : '',
      'Return ONLY JSON: {"hasVocals":boolean,"segments":[{"start":number,"end":number,"type":"vocal"|"instrumental","text":string}]}',
    ]
      .filter(Boolean)
      .join('\n');

    const res = await fetch(target.url, {
      method: 'POST',
      headers: target.headers,
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: getMimeType(audioPath), data: audioBase64 } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.0,
          maxOutputTokens: 8192,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      throw new Error(`Gemini audio alignment HTTP ${res.status}`);
    }

    const json: any = await res.json();
    const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!rawText) return null;

    const parsed = JSON.parse(rawText);
    if (parsed?.hasVocals === false) return [];
    rawSegments = Array.isArray(parsed?.segments)
      ? parsed.segments
      : Array.isArray(parsed?.phrases)
        ? parsed.phrases
        : [];
  }

  if (rawSegments.length === 0) return null;

  const out: AlignedPhrase[] = [];
  let minAllowedStart = 0;

  for (const item of rawSegments) {
    const segType = String(item.type || 'vocal').toLowerCase();
    if (segType === 'instrumental') continue;
    const cleanText = String(item.text || '').replace(/\s+/g, ' ').trim();
    if (!cleanText || /^\[.*\]$/.test(cleanText)) continue;

    let rawStart = Number(item.start);
    let rawEnd = Number(item.end);
    const sid = Number.isInteger(item.id) ? Number(item.id) : Number.isInteger(item.slotId) ? Number(item.slotId) : -1;

    if (useBatchedSlotClips && sid >= 0 && sid < slots.length) {
      const slot = slots[sid];
      const slotDur = Math.max(0.2, slot.end - slot.start);
      const sfRaw = Number(item.startFrac);
      const efRaw = Number(item.endFrac);
      const sf = Number.isFinite(sfRaw) && sfRaw > 0.10 && sfRaw < 0.90 ? sfRaw : 0;
      // Only clip tail via endFrac if Gemini flagged a substantial trailing hum (> 22% of slot);
      // normal breath silence at slot end is already trimmed accurately by trimPhraseSilence.
      const ef = Number.isFinite(efRaw) && efRaw > sf + 0.15 && efRaw < 0.78 ? efRaw : 1;
      rawStart = slot.start + slotDur * sf;
      if (sf > 0.10) {
        rawStart = refineHumPrefixOnset(slot.start, slot.end, rawStart, env);
      }
      rawEnd = slot.start + slotDur * ef;
    }

    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || rawEnd <= rawStart) continue;
    if (rawStart >= env.duration - 0.1) continue;

    const clampedStart = Math.max(minAllowedStart, Math.min(env.duration - 0.3, rawStart));
    const clampedEnd = Math.max(clampedStart + 0.25, Math.min(env.duration, rawEnd));
    const trimmed = trimPhraseSilence(clampedStart, clampedEnd, env);

    const wordsText = cleanText.split(/\s+/).filter(Boolean);
    if (wordsText.length === 0) continue;

    const alignedWords = alignWordsInsideSpan(wordsText, trimmed.start, trimmed.end, env);

    if (alignedWords.length > 0) {
      const phraseStart = alignedWords[0].start;
      const phraseEnd = alignedWords[alignedWords.length - 1].end;
      out.push({
        start: phraseStart,
        end: phraseEnd,
        text: cleanText,
        words: alignedWords,
      });
      minAllowedStart = phraseEnd;
    }
  }

  return out;
}

/**
 * Pure DSP offline alignment fallback: places clean lyric phrases across ONLY the
 * detected active vocal windows (skipping instrumental intros/breaks/outros) and caps
 * maximum cadence to ~3.2 words/sec so dense lyric sheets never blur past at 6-8 words/sec.
 */
function alignOfflineAcousticFallback(lyrics: string, env: VocalEnvelope): AlignedPhrase[] {
  const rawLines = String(lyrics || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^\[.*\]$/.test(l));

  if (rawLines.length === 0) return [];

  const spans =
    env.speechSpans.length > 0
      ? env.speechSpans
      : [{ start: 0, end: env.duration }];

  const totalVoicedSec = spans.reduce((sum, s) => sum + (s.end - s.start), 0);
  if (totalVoicedSec <= 0.4) return [];

  // Keep only as many leading lines as can plausibly be spoken/sung within voiced duration (~3.2 words/sec max)
  const maxReadableWords = Math.max(8, Math.round(totalVoicedSec * 3.2));
  const selectedLines: string[] = [];
  let accWords = 0;
  for (const line of rawLines) {
    const wc = line.split(/\s+/).filter(Boolean).length;
    if (wc === 0) continue;
    if (selectedLines.length > 0 && accWords + wc > maxReadableWords) break;
    selectedLines.push(line);
    accWords += wc;
  }
  if (selectedLines.length === 0) return [];

  const lineWeights = selectedLines.map((l) => wordArticulationWeight(l));
  const totalWeight = lineWeights.reduce((a, b) => a + b, 0) || 1;

  // Map cumulative voiced time linearly onto the disjoint active spans
  const mapVoicedOffsetToWallTime = (voicedSec: number): number => {
    let remaining = Math.max(0, Math.min(totalVoicedSec, voicedSec));
    for (const sp of spans) {
      const len = sp.end - sp.start;
      if (remaining <= len) return +(sp.start + remaining).toFixed(3);
      remaining -= len;
    }
    return spans[spans.length - 1].end;
  };

  const phrases: AlignedPhrase[] = [];
  let voicedCursor = 0;

  for (let i = 0; i < selectedLines.length; i++) {
    const line = selectedLines[i];
    const spanVoicedDur = (lineWeights[i] / totalWeight) * totalVoicedSec;
    const start = mapVoicedOffsetToWallTime(voicedCursor);
    const end = i === selectedLines.length - 1
      ? spans[spans.length - 1].end
      : mapVoicedOffsetToWallTime(voicedCursor + spanVoicedDur);
    voicedCursor += spanVoicedDur;

    const wordsText = line.split(/\s+/).filter(Boolean);
    const words = alignWordsInsideSpan(wordsText, start, Math.max(start + 0.3, end), env);
    if (words.length > 0) {
      phrases.push({
        start: words[0].start,
        end: words[words.length - 1].end,
        text: line,
        words,
      });
    }
  }

  return phrases;
}

/**
 * Aligns lyrics or spoken/sung vocals against the actual audio waveform.
 * Uses Gemini multimodal audio transcription+alignment refined by FFmpeg vocal-band
 * acoustic energy/onsets when configured, and falls back to acoustic DSP span alignment offline.
 */
export async function alignLyricsToAudio(opts: {
  audioPath: string;
  lyrics?: string;
  scriptId?: string;
  offlineOnly?: boolean;
}): Promise<LyricAlignmentResult> {
  const lyrics = String(opts.lyrics || '').trim();
  if (!lyrics) {
    const env = await extractVocalEnvelope(opts.audioPath, false);
    return {
      duration: env.duration,
      hasVocals: false,
      source: 'acoustic-dsp',
      phrases: [],
      words: [],
    };
  }

  if (!opts.offlineOnly) {
    const cached = readCachedAlignment(opts.audioPath, lyrics);
    if (cached) return cached;
  }

  const tmpDir = os.tmpdir();
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const stemWav = path.join(tmpDir, `flow_vocals_${stamp}.wav`);
  let usedDemucs = false;

  const useGemini = !opts.offlineOnly && hasRealGeminiConfig();

  try {
    if (useGemini) {
      usedDemucs = await tryExtractDemucsVocalStem(opts.audioPath, stemWav);
    }

    const env = await extractVocalEnvelope(usedDemucs ? stemWav : opts.audioPath, usedDemucs);
    let phrases: AlignedPhrase[] | null = null;
    let source: LyricAlignmentResult['source'] = 'acoustic-dsp';

    if (useGemini) {
      try {
        const geminiAudio = usedDemucs ? stemWav : opts.audioPath;
        phrases = await alignWithGeminiAudio(geminiAudio, lyrics, env, usedDemucs);
        if (phrases && phrases.length > 0) {
          source = 'gemini+acoustic';
        }
      } catch (err: any) {
        console.warn(`[Flow Music Aligner] Gemini audio alignment unavailable, using acoustic DSP: ${err?.message || err}`);
        phrases = null;
      }
    }

    if (!phrases || phrases.length === 0) {
      phrases = alignOfflineAcousticFallback(lyrics, env);
      source = 'acoustic-dsp';
    }

    const words = phrases.flatMap((p) => p.words);
    const result: LyricAlignmentResult = {
      duration: env.duration,
      hasVocals: words.length > 0,
      source,
      phrases,
      words,
    };

    if (!opts.offlineOnly && phrases.length > 0) {
      writeCachedAlignment(opts.audioPath, lyrics, result);
    }

    return result;
  } finally {
    try { fs.unlinkSync(stemWav); } catch {}
  }
}
