import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { flowMusicDataDir } from './flow-music-profile.js';

/**
 * Flow Music Beat Detector
 * ------------------------
 * Extracts a musical beat map (onsets, tempo, downbeats, bass drops, energy curve)
 * directly from the approved audio track using FFmpeg PCM decoding + spectral-flux
 * onset detection. Pure TypeScript DSP — no external ML dependencies.
 *
 * The resulting beat map powers beat-synced subtitles, punch zooms, flashes,
 * scene cuts and drop shakes in the video pipeline.
 */

export interface BeatDrop {
  start: number;
  end: number;
  strength: number;
}

export interface BeatAnalysis {
  duration: number;
  bpm: number;
  beatInterval: number;
  /** Every detected beat (seconds). */
  beats: number[];
  /** Every 4th beat (4/4 assumption), used for flashes & punch zooms. */
  downbeats: number[];
  /** Strong transient hits, strongest first. */
  onsets: Array<{ time: number; strength: number }>;
  /** Sustained bass-drop windows detected from sub-bass energy. */
  drops: BeatDrop[];
  /** ~200-point normalized energy curve for UI visualization. */
  energy: number[];
  /** False when the fallback metronome grid was used (silence/ambient audio). */
  reliable: boolean;
  source: 'analysis' | 'fallback';
}

const DECODE_SAMPLE_RATE = 22050;
const FFT_SIZE = 1024;
const HOP_SIZE = 256;
const MIN_ONSET_GAP = 0.11;
const MIN_BPM = 68;
const MAX_BPM = 185;

interface SpectrumFrame {
  mag: Float32Array;
  lowEnergy: number;
}

/** In-place iterative radix-2 FFT over re/im arrays (length must be a power of 2). */
function fftInPlace(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  // Bit reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const aRe = re[i + k];
        const aIm = im[i + k];
        const bRe = curRe * re[i + k + half] - curIm * im[i + k + half];
        const bIm = curRe * im[i + k + half] + curIm * re[i + k + half];
        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[i + k + half] = aRe - bRe;
        im[i + k + half] = aIm - bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/** Decodes audio to mono PCM via FFmpeg and returns Float32 samples. */
async function decodeAudioPcm(audioPath: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-v', 'error',
      '-i', audioPath,
      '-ac', '1',
      '-ar', String(DECODE_SAMPLE_RATE),
      '-f', 's16le',
      '-',
    ]);
    const chunks: Buffer[] = [];
    proc.stdout?.on('data', (d: Buffer) => chunks.push(d));
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg PCM decode failed (${code}): ${stderr.slice(-300)}`));
        return;
      }
      const pcm = Buffer.concat(chunks);
      const samples = new Float32Array(Math.floor(pcm.length / 2));
      for (let i = 0; i < samples.length; i++) {
        samples[i] = pcm.readInt16LE(i * 2) / 32768;
      }
      if (samples.length < FFT_SIZE * 4) {
        reject(new Error('Audio too short for beat analysis'));
        return;
      }
      resolve(samples);
    });
    proc.on('error', reject);
  });
}

function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

/**
 * STFT over the PCM signal producing per-hop magnitude spectra plus
 * sub-bass energy (used later for drop detection).
 */
function computeSpectrogram(samples: Float32Array): SpectrumFrame[] {
  const window = hannWindow(FFT_SIZE);
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);
  const bins = FFT_SIZE >> 1;
  const frames: SpectrumFrame[] = [];
  const binHz = DECODE_SAMPLE_RATE / FFT_SIZE;
  const lowBinMax = Math.max(3, Math.floor(150 / binHz)); // ~150 Hz sub-bass ceiling

  for (let start = 0; start + FFT_SIZE <= samples.length; start += HOP_SIZE) {
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = samples[start + i] * window[i];
      im[i] = 0;
    }
    fftInPlace(re, im);
    const mag = new Float32Array(bins);
    let lowEnergy = 0;
    for (let k = 1; k < bins; k++) {
      const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      mag[k] = m;
      if (k <= lowBinMax) lowEnergy += m;
    }
    frames.push({ mag, lowEnergy });
  }
  return frames;
}

/**
 * Spectral-flux onset envelope, perceptually weighted toward the low/mid
 * band where dhol drums, kicks and 808s live.
 */
function computeOnsetEnvelope(frames: SpectrumFrame[]): { flux: Float32Array; lowEnergy: Float32Array } {
  const bins = FFT_SIZE >> 1;
  const binHz = DECODE_SAMPLE_RATE / FFT_SIZE;
  // Weight bins: strongest response 40 Hz - 6 kHz (beats & percussion)
  const weights = new Float32Array(bins);
  for (let k = 1; k < bins; k++) {
    const hz = k * binHz;
    let w = 1;
    if (hz < 40) w = 0.4;
    else if (hz > 6000) w = 0.35;
    weights[k] = w;
  }

  const flux = new Float32Array(frames.length);
  const lowEnergy = new Float32Array(frames.length);
  for (let f = 1; f < frames.length; f++) {
    const prev = frames[f - 1].mag;
    const cur = frames[f].mag;
    let sum = 0;
    for (let k = 1; k < bins; k++) {
      const diff = cur[k] - prev[k];
      if (diff > 0) sum += diff * weights[k];
    }
    flux[f] = sum;
    lowEnergy[f] = frames[f].lowEnergy;
  }
  return { flux, lowEnergy };
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface PickedOnset {
  time: number;
  strength: number;
}

/** Adaptive-threshold peak picking on the smoothed onset envelope. */
function pickOnsets(flux: Float32Array): PickedOnset[] {
  const hopSec = HOP_SIZE / DECODE_SAMPLE_RATE;
  // Light smoothing (5-frame moving average ≈ 58 ms)
  const smooth = new Float32Array(flux.length);
  for (let i = 0; i < flux.length; i++) {
    let acc = 0;
    let count = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(flux.length - 1, i + 2); j++) {
      acc += flux[j];
      count++;
    }
    smooth[i] = acc / count;
  }

  const windowFrames = Math.round(0.7 / hopSec); // ±0.35s context
  const onsets: PickedOnset[] = [];
  let lastOnsetTime = -Infinity;
  const globalMedian = medianOf(Array.from(smooth));

  for (let i = 1; i < smooth.length - 1; i++) {
    if (smooth[i] <= globalMedian * 1.25) continue;
    if (smooth[i] < smooth[i - 1] || smooth[i] < smooth[i + 1]) continue;

    const lo = Math.max(0, i - windowFrames);
    const hi = Math.min(smooth.length - 1, i + windowFrames);
    const context: number[] = [];
    for (let j = lo; j <= hi; j++) context.push(smooth[j]);
    const threshold = medianOf(context) * 1.7 + globalMedian * 0.12;
    if (smooth[i] < threshold) continue;

    const time = i * hopSec;
    if (time - lastOnsetTime < MIN_ONSET_GAP) {
      // Replace weaker previous onset if this one is stronger
      const prev = onsets[onsets.length - 1];
      if (prev && smooth[i] > prev.strength) {
        prev.time = time;
        prev.strength = smooth[i];
        lastOnsetTime = time;
      }
      continue;
    }
    onsets.push({ time, strength: smooth[i] });
    lastOnsetTime = time;
  }
  return onsets;
}

/**
 * Autocorrelation tempo estimate. When `hintBpm` is supplied (the BPM chosen in
 * the Flow Music settings) lags near it get a bonus, keeping detection anchored
 * to the user's intended tempo.
 */
function estimateTempo(flux: Float32Array, hintBpm?: number): { bpm: number; interval: number } {
  const hopSec = HOP_SIZE / DECODE_SAMPLE_RATE;
  const mean = flux.reduce((a, b) => a + b, 0) / (flux.length || 1);
  const centered = Float32Array.from(flux, (v) => v - mean);

  const minLag = Math.max(1, Math.floor((60 / MAX_BPM) / hopSec));
  const maxLag = Math.min(centered.length - 1, Math.ceil((60 / MIN_BPM) / hopSec));
  let bestLag = -1;
  let bestScore = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    const n = centered.length - lag;
    for (let i = 0; i < n; i++) acc += centered[i] * centered[i + lag];
    let score = acc / n;
    const lagBpm = 60 / (lag * hopSec);
    if (hintBpm && hintBpm > 0) {
      const ratio = lagBpm / hintBpm;
      const nearHint = Math.abs(Math.log2(ratio)) < 0.35; // within ~±27%
      const halfOrDouble = Math.abs(Math.abs(Math.log2(ratio)) - 1) < 0.25;
      if (nearHint) score *= 1.45;
      else if (halfOrDouble) score *= 1.1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  if (bestLag <= 0) {
    const fallbackBpm = hintBpm && hintBpm > 0 ? hintBpm : 110;
    return { bpm: fallbackBpm, interval: 60 / fallbackBpm };
  }

  let bpm = 60 / (bestLag * hopSec);
  // Fold into a musically sensible 80-160 window
  while (bpm < 80) bpm *= 2;
  while (bpm > 165) bpm /= 2;
  return { bpm: Math.round(bpm * 10) / 10, interval: 60 / bpm };
}

/** Finds the grid phase offset that aligns beats to the strongest onsets. */
function findBestPhase(interval: number, onsets: PickedOnset[], duration: number): number {
  const tolerance = Math.min(0.035, interval * 0.12);
  const step = interval / 24;
  let bestPhase = 0;
  let bestScore = -1;
  for (let phase = 0; phase < interval; phase += step) {
    let score = 0;
    for (let t = phase; t < duration; t += interval) {
      for (const onset of onsets) {
        if (onset.time > t + tolerance) break;
        if (Math.abs(onset.time - t) <= tolerance) {
          score += onset.strength;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestPhase = phase;
    }
  }
  return bestPhase;
}

/** Builds the beat list, snapping each predicted beat to nearby strong onsets. */
function buildBeatGrid(
  interval: number,
  phase: number,
  duration: number,
  onsets: PickedOnset[]
): number[] {
  const tolerance = Math.min(0.16, interval * 0.18);
  const beats: number[] = [];
  for (let t = phase; t < duration - 0.05; t += interval) {
    let snapped = t;
    let bestDist = tolerance;
    for (const onset of onsets) {
      if (onset.time > t + tolerance) break;
      const dist = Math.abs(onset.time - t);
      if (dist < bestDist) {
        bestDist = dist;
        snapped = onset.time;
      }
    }
    if (beats.length === 0 || snapped - beats[beats.length - 1] > interval * 0.4) {
      beats.push(Math.round(snapped * 1000) / 1000);
    }
  }
  return beats;
}

/** Downbeat phase = the beat index (0-3) with the strongest average accent. */
function pickDownbeatOffset(beats: number[], onsets: PickedOnset[]): number {
  if (beats.length < 4) return 0;
  const strengthAt = (time: number): number => {
    let best = 0;
    for (const onset of onsets) {
      const dist = Math.abs(onset.time - time);
      if (dist < 0.08 && onset.strength > best) best = onset.strength;
    }
    return best;
  };
  let bestOffset = 0;
  let bestScore = -1;
  for (let offset = 0; offset < 4; offset++) {
    let score = 0;
    let count = 0;
    for (let i = offset; i < beats.length; i += 4) {
      score += strengthAt(beats[i]);
      count++;
    }
    const avg = count > 0 ? score / count : 0;
    if (avg > bestScore) {
      bestScore = avg;
      bestOffset = offset;
    }
  }
  return bestOffset;
}

/** Detects sustained sub-bass energy jumps (dhol/808 drops). */
function detectDrops(lowEnergy: Float32Array, duration: number): BeatDrop[] {
  const hopSec = HOP_SIZE / DECODE_SAMPLE_RATE;
  const window = Math.max(4, Math.round(2.0 / hopSec));
  const running: number[] = [];
  for (let i = 0; i < lowEnergy.length; i++) {
    const lo = Math.max(0, i - window);
    const hi = Math.min(lowEnergy.length - 1, i + window);
    let acc = 0;
    for (let j = lo; j <= hi; j++) acc += lowEnergy[j];
    running.push(acc / (hi - lo + 1));
  }

  const raw: Array<{ start: number; end: number; peak: number }> = [];
  let inDrop = false;
  let startIdx = 0;
  let peak = 0;
  for (let i = 0; i < lowEnergy.length; i++) {
    const baseline = Math.max(1e-6, running[i]);
    const ratio = lowEnergy[i] / baseline;
    const hot = ratio > 1.9;
    if (hot && !inDrop) {
      inDrop = true;
      startIdx = i;
      peak = ratio;
    } else if (hot && inDrop) {
      peak = Math.max(peak, ratio);
    } else if (!hot && inDrop) {
      inDrop = false;
      const start = startIdx * hopSec;
      const end = i * hopSec;
      if (end - start >= 0.22) raw.push({ start, end, peak });
    }
  }
  if (inDrop) {
    const start = startIdx * hopSec;
    const end = lowEnergy.length * hopSec;
    if (end - start >= 0.22) raw.push({ start, end, peak });
  }

  // Merge windows closer than 0.4s apart
  const merged: Array<{ start: number; end: number; peak: number }> = [];
  for (const win of raw) {
    const last = merged[merged.length - 1];
    if (last && win.start - last.end < 0.4) {
      last.end = win.end;
      last.peak = Math.max(last.peak, win.peak);
    } else {
      merged.push({ ...win });
    }
  }

  return merged
    .filter((d) => d.end <= duration + 0.5)
    .sort((a, b) => b.peak - a.peak)
    .slice(0, 10)
    .sort((a, b) => a.start - b.start)
    .map((d) => ({
      start: Math.round(d.start * 100) / 100,
      end: Math.round(d.end * 100) / 100,
      strength: Math.round(d.peak * 100) / 100,
    }));
}

/** Downsamples the onset envelope into a normalized energy curve for the UI. */
function buildEnergyCurve(flux: Float32Array, points = 200): number[] {
  const bucketSize = Math.max(1, Math.floor(flux.length / points));
  const curve: number[] = [];
  let max = 0;
  for (let i = 0; i < flux.length; i += bucketSize) {
    let peak = 0;
    for (let j = i; j < Math.min(flux.length, i + bucketSize); j++) {
      if (flux[j] > peak) peak = flux[j];
    }
    curve.push(peak);
    if (peak > max) max = peak;
  }
  if (max <= 0) return curve.map(() => 0);
  return curve.map((v) => Math.round((v / max) * 1000) / 1000);
}

function fallbackGrid(hintBpm: number, duration: number): BeatAnalysis {
  const bpm = hintBpm > 0 ? hintBpm : 110;
  const interval = 60 / bpm;
  const beats: number[] = [];
  for (let t = Math.min(0.4, interval); t < duration - 0.05; t += interval) {
    beats.push(Math.round(t * 1000) / 1000);
  }
  const downbeats = beats.filter((_, i) => i % 4 === 0);
  return {
    duration: Math.round(duration * 100) / 100,
    bpm,
    beatInterval: Math.round(interval * 1000) / 1000,
    beats,
    downbeats,
    onsets: downbeats.map((time) => ({ time, strength: 1 })),
    drops: [],
    energy: [],
    reliable: false,
    source: 'fallback',
  };
}

function beatCacheDir(): string {
  return path.join(flowMusicDataDir(), 'beats_cache');
}

function cacheKeyFor(audioPath: string): string {
  try {
    const stat = fs.statSync(audioPath);
    const seed = `${path.basename(audioPath)}|${stat.size}|${Math.floor(stat.mtimeMs)}`;
    return createHash('sha1').update(seed).digest('hex').slice(0, 20);
  } catch {
    return createHash('sha1').update(audioPath).digest('hex').slice(0, 20);
  }
}

function readBeatCache(audioPath: string): BeatAnalysis | null {
  const file = path.join(beatCacheDir(), `${cacheKeyFor(audioPath)}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as BeatAnalysis;
    if (parsed && Array.isArray(parsed.beats) && typeof parsed.bpm === 'number') return parsed;
  } catch {}
  return null;
}

function writeBeatCache(audioPath: string, analysis: BeatAnalysis): void {
  try {
    const dir = beatCacheDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${cacheKeyFor(audioPath)}.json`), JSON.stringify(analysis), 'utf8');
  } catch {}
}

export interface AnalyzeBeatsOptions {
  /** BPM from the Flow Music settings — anchors tempo detection. */
  hintBpm?: number;
  scriptId?: string;
}

/**
 * Analyzes the approved track and returns the full beat map.
 * Results are cached on disk per audio file (size+mtime).
 */
export async function analyzeBeats(audioPath: string, opts: AnalyzeBeatsOptions = {}): Promise<BeatAnalysis> {
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio track not found for beat analysis: ${audioPath}`);
  }

  const cached = readBeatCache(audioPath);
  if (cached) return cached;

  const samples = await decodeAudioPcm(audioPath);
  const duration = samples.length / DECODE_SAMPLE_RATE;
  if (duration < 4) throw new Error('Audio too short for beat analysis');

  try {
    const frames = computeSpectrogram(samples);
    const { flux, lowEnergy } = computeOnsetEnvelope(frames);
    const onsets = pickOnsets(flux);

    if (onsets.length < 8) {
      const fb = fallbackGrid(opts.hintBpm || 0, duration);
      writeBeatCache(audioPath, fb);
      return fb;
    }

    const { bpm, interval } = estimateTempo(flux, opts.hintBpm);
    const phase = findBestPhase(interval, onsets, duration);
    const beats = buildBeatGrid(interval, phase, duration, onsets);
    if (beats.length < 4) {
      const fb = fallbackGrid(opts.hintBpm || 0, duration);
      writeBeatCache(audioPath, fb);
      return fb;
    }
    const downbeatOffset = pickDownbeatOffset(beats, onsets);
    const downbeats = beats.filter((_, i) => i % 4 === downbeatOffset);
    const drops = detectDrops(lowEnergy, duration);
    const energy = buildEnergyCurve(flux);

    const analysis: BeatAnalysis = {
      duration: Math.round(duration * 100) / 100,
      bpm,
      beatInterval: Math.round(interval * 1000) / 1000,
      beats,
      downbeats,
      onsets: onsets
        .slice()
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 120)
        .sort((a, b) => a.time - b.time)
        .map((o) => ({ time: Math.round(o.time * 1000) / 1000, strength: Math.round(o.strength * 1000) / 1000 })),
      drops,
      energy,
      reliable: true,
      source: 'analysis',
    };
    writeBeatCache(audioPath, analysis);
    return analysis;
  } finally {
    // Nothing to clean — PCM stayed in memory.
  }
}

/** Force-recomputes the beat map (ignores cache). */
export async function reanalyzeBeats(audioPath: string, opts: AnalyzeBeatsOptions = {}): Promise<BeatAnalysis> {
  const file = path.join(beatCacheDir(), `${cacheKeyFor(audioPath)}.json`);
  try {
    fs.rmSync(file, { force: true });
  } catch {}
  return analyzeBeats(audioPath, opts);
}
