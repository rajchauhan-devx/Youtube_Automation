import fs from 'node:fs';
import path from 'node:path';
import type { FlowSceneDefinition } from './flow-music-video-service.js';
import type { BeatAnalysis } from './beat-detector.js';
import type { LyricAlignmentResult } from './lyric-aligner.js';

/**
 * Flow Music Beat Edit
 * --------------------
 * Turns the beat map into "cool edit" material:
 *  - Beat-synced karaoke subtitles (word timings snapped to the beat grid)
 *  - Punch zooms on beats / downbeats
 *  - Light flashes on downbeats
 *  - Camera shake on bass drops
 *  - Scene cut boundaries snapped to the beat grid
 */

export type BeatSubtitleStyle = 'motion' | 'karaoke' | 'pop' | 'glow';
export type BeatSubtitleSize = 'small' | 'medium' | 'large' | 'huge' | number;
export type BeatIntensity = 'subtle' | 'balanced' | 'hype';

export interface BeatEditOptions {
  enabled: boolean;
  subtitleStyle: BeatSubtitleStyle;
  subtitleSize: BeatSubtitleSize;
  intensity: BeatIntensity;
  snapCuts: boolean;
  punchZoom: boolean;
  flashes: boolean;
  shakeDrops: boolean;
}

export const SUBTITLE_SIZE_MULTIPLIERS: Record<'small' | 'medium' | 'large' | 'huge', number> = {
  small: 0.8,
  medium: 1.0,
  large: 1.25,
  huge: 1.55,
};

export interface BeatEditProfile {
  punchStrength: number;
  punchDecay: number;
  flashBrightness: number;
  shakeAmp: number;
  wordPop: number;
  pulseSeconds: number;
}

const INTENSITY_PROFILES: Record<BeatIntensity, BeatEditProfile> = {
  subtle: { punchStrength: 0.045, punchDecay: 0.38, flashBrightness: 0.05, shakeAmp: 0.0012, wordPop: 8, pulseSeconds: 0.45 },
  balanced: { punchStrength: 0.075, punchDecay: 0.32, flashBrightness: 0.09, shakeAmp: 0.002, wordPop: 14, pulseSeconds: 0.5 },
  hype: { punchStrength: 0.11, punchDecay: 0.28, flashBrightness: 0.13, shakeAmp: 0.0032, wordPop: 22, pulseSeconds: 0.55 },
};

export function normalizeBeatEditOptions(input?: Partial<BeatEditOptions> | null): BeatEditOptions {
  const style = input?.subtitleStyle;
  const rawSize = input?.subtitleSize;
  const intensity = input?.intensity;

  let subtitleSize: BeatSubtitleSize = 'medium';
  if (typeof rawSize === 'number' && !isNaN(rawSize) && rawSize > 0) {
    // Custom size meter: clamp between 40px and 320px
    subtitleSize = Math.min(320, Math.max(40, Math.round(rawSize)));
  } else if (typeof rawSize === 'string') {
    const parsedNum = Number(rawSize);
    if (!isNaN(parsedNum) && parsedNum > 0 && String(parsedNum) === rawSize.trim()) {
      subtitleSize = Math.min(320, Math.max(40, Math.round(parsedNum)));
    } else if (rawSize === 'small' || rawSize === 'medium' || rawSize === 'large' || rawSize === 'huge') {
      subtitleSize = rawSize;
    }
  }

  return {
    enabled: input?.enabled !== false,
    subtitleStyle:
      style === 'motion' || style === 'pop' || style === 'glow' || style === 'karaoke' ? style : 'motion',
    subtitleSize,
    intensity: intensity === 'subtle' || intensity === 'hype' ? intensity : 'balanced',
    snapCuts: input?.snapCuts !== false,
    punchZoom: input?.punchZoom !== false,
    flashes: input?.flashes !== false,
    shakeDrops: input?.shakeDrops !== false,
  };
}

export function getBeatEditProfile(intensity: BeatIntensity): BeatEditProfile {
  return INTENSITY_PROFILES[intensity] || INTENSITY_PROFILES.balanced;
}

/* ------------------------------------------------------------------ */
/* Scene / beat snapping                                              */
/* ------------------------------------------------------------------ */

export interface SceneSnapResult {
  scenes: FlowSceneDefinition[];
  snappedBoundaries: number;
  unsnapped: number;
}

/**
 * Snaps every scene cut boundary to the nearest beat so visual changes land on
 * the music. Min scene length is respected (snap is skipped when it would make
 * a scene too short). Final boundary is always the audio duration.
 */
export function snapScenesToBeats(
  scenes: FlowSceneDefinition[],
  analysis: BeatAnalysis,
  audioDuration: number | null
): SceneSnapResult {
  if (scenes.length === 0) return { scenes, snappedBoundaries: 0, unsnapped: 0 };

  const duration = audioDuration && audioDuration > 4 ? audioDuration : analysis.duration;
  const beats = analysis.beats.length >= 2 ? analysis.beats : fallbackBeatTimes(analysis, duration);
  const tolerance = Math.min(0.45, analysis.beatInterval * 0.4);
  const minScene = Math.min(2.2, analysis.beatInterval);

  const boundaries: number[] = [];
  let acc = 0;
  for (const sc of scenes) {
    acc += Math.max(2, Number(sc.duration) || 8);
    boundaries.push(Math.min(acc, duration));
  }
  // Force final boundary to the audio duration
  boundaries[boundaries.length - 1] = duration;

  let snappedCount = 0;
  let unsnapped = 0;
  const epsilon = 1e-6;
  for (let i = 0; i < boundaries.length - 1; i++) {
    const target = boundaries[i];
    let best = -1;
    let bestDist = tolerance + epsilon;
    for (const b of beats) {
      const dist = Math.abs(b - target);
      if (dist < bestDist) {
        bestDist = dist;
        best = b;
      }
      if (b > target + tolerance) break;
    }
    if (best >= 0) {
      const prevBoundary = i === 0 ? 0 : boundaries[i - 1];
      const nextBoundary = boundaries[i + 1];
      if (best - prevBoundary >= minScene && nextBoundary - best >= minScene) {
        boundaries[i] = best;
        snappedCount++;
        continue;
      }
    }
    unsnapped++;
  }

  const snappedScenes = scenes.map((sc, i) => {
    const start = i === 0 ? 0 : boundaries[i - 1];
    const end = boundaries[i];
    const dur = Math.max(minScene, Math.round((end - start) * 10) / 10);
    return { ...sc, duration: dur };
  });

  return { scenes: snappedScenes, snappedBoundaries: snappedCount, unsnapped };
}

function fallbackBeatTimes(analysis: BeatAnalysis, duration: number): number[] {
  const interval = analysis.beatInterval || 0.55;
  const beats: number[] = [];
  for (let t = Math.min(0.4, interval); t < duration - 0.05; t += interval) beats.push(t);
  return beats;
}

/* ------------------------------------------------------------------ */
/* Per-scene beat events                                              */
/* ------------------------------------------------------------------ */

export interface SceneBeatEvents {
  /** Beat times inside the scene, scene-relative, strongest first (capped). */
  punches: number[];
  /** Downbeat times inside the scene, scene-relative. */
  flashes: number[];
  /** Bass-drop starts inside the scene, scene-relative. */
  shakes: number[];
}

export function computeSceneBeatEvents(
  sceneStart: number,
  sceneEnd: number,
  analysis: BeatAnalysis,
  options: BeatEditOptions,
  maxPunches = 10
): SceneBeatEvents {
  const events: SceneBeatEvents = { punches: [], flashes: [], shakes: [] };
  if (!options.enabled) return events;

  const inRange = (t: number) => t >= sceneStart - 0.02 && t < sceneEnd - 0.05;
  const rel = (t: number) => Math.round((t - sceneStart) * 1000) / 1000;

  const source = options.punchZoom
    ? analysis.downbeats.length >= 2
      ? analysis.downbeats
      : analysis.beats
    : [];
  const withStrength = source
    .filter(inRange)
    .map((t) => {
      const onset = analysis.onsets.find((o) => Math.abs(o.time - t) < 0.09);
      return { time: t, strength: onset?.strength ?? 0.5 };
    })
    .sort((a, b) => b.strength - a.strength)
    .slice(0, maxPunches)
    .sort((a, b) => a.time - b.time);
  events.punches = withStrength.map((p) => rel(p.time));

  if (options.flashes) {
    events.flashes = analysis.downbeats.filter(inRange).map(rel);
  }
  if (options.shakeDrops) {
    events.shakes = analysis.drops
      .filter((d) => d.start < sceneEnd && d.end > sceneStart)
      .map((d) => rel(Math.max(d.start, sceneStart)));
  }
  return events;
}

/* ------------------------------------------------------------------ */
/* FFmpeg expression builders (scene-relative times)                   */
/* ------------------------------------------------------------------ */

/**
 * Builds the additive beat-punch term for a zoompan `z` expression.
 * Each punch contributes a decaying parabolic pulse starting at its beat time.
 * zoompan has no `t` variable — time is derived from the output frame counter
 * (`on/30` at 30fps). Commas stay plain; the caller quotes the whole expression.
 */
export function buildPunchZoomTerm(punches: number[], profile: BeatEditProfile): string {
  if (punches.length === 0) return '';
  const terms = punches
    .slice(0, 12)
    .map((t) => {
      const decay = profile.punchDecay;
      const start = t.toFixed(3);
      const end = (t + profile.pulseSeconds).toFixed(3);
      // pulse(on) = between window * quadratic decay (scene-relative seconds)
      return `between(on/30,${start},${end})*pow(max(0,1-(on/30-${start})/${decay}),2)`;
    })
    .join('+');
  return `+${profile.punchStrength}*(${terms})`;
}

/** Builds an `eq` timeline `enable` expression flashing on downbeats. */
export function buildFlashEnableExpr(flashes: number[], pulseSeconds = 0.085): string {
  if (flashes.length === 0) return '';
  const windows = flashes
    .slice(0, 24)
    .map((t) => `between(t,${t.toFixed(3)},${(t + pulseSeconds).toFixed(3)})`)
    .join('+');
  return windows;
}

/** Builds a `rotate` expression producing a quick camera shake on drops. */
export function buildShakeRotateExpr(shakes: number[], profile: BeatEditProfile): string {
  if (shakes.length === 0) return '';
  const terms = shakes
    .slice(0, 6)
    .map(
      (t) =>
        `between(t,${t.toFixed(3)},${(t + 0.5).toFixed(3)})*sin(46*(t-${t.toFixed(3)}))*max(0,1-(t-${t.toFixed(3)})/0.5)`
    )
    .join('+');
  return `${profile.shakeAmp}*(${terms})`;
}

/* ------------------------------------------------------------------ */
/* Beat-synced karaoke ASS subtitles                                  */
/* ------------------------------------------------------------------ */

// ASS colours are &HBBGGRR&
const ASS_GOLD = '&H00D4FF&'; // #FFD400
const ASS_ORANGE = '&H3C9AFF&'; // #FF9A3C
const ASS_CYAN = '&HFFE84F&'; // #4FE8FF
const ASS_PINK = '&HA85FFF&'; // #FF5FA8
const ASS_WHITE = '&H0FFFFFF&';
const ASS_HIGHLIGHT_PALETTE = [ASS_GOLD, ASS_ORANGE, ASS_WHITE, ASS_CYAN];
/** Vivid reel-style colour cycle for Motion Bold words (cycles per beat). */
const MOTION_PALETTE = [ASS_GOLD, ASS_ORANGE, ASS_CYAN, ASS_PINK, ASS_WHITE];

interface WordTiming {
  word: string;
  start: number;
  end: number;
  onBeat: boolean;
  onDownbeat: boolean;
  beatIndex: number;
}

function escapeAssText(text: string): string {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .trim();
}

function formatAssTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const cs = Math.floor((clamped % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** Distributes scene duration across words by character weight, then snaps to beats. */
function timeWordsToBeats(
  caption: string,
  sceneStart: number,
  sceneEnd: number,
  analysis: BeatAnalysis
): WordTiming[] {
  const words = String(caption || '')
    .replace(/\s+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (words.length === 0) return [];

  const sceneDur = Math.max(0.4, sceneEnd - sceneStart);
  const weights = words.map((w) => Math.max(2, [...w].length));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const snapTolerance = Math.min(0.15, analysis.beatInterval * 0.22);
  const beatTimes = analysis.beats;

  const timings: WordTiming[] = [];
  let cursor = sceneStart;
  for (let i = 0; i < words.length; i++) {
    const rawSpan = (weights[i] / totalWeight) * sceneDur;
    let start = cursor;
    let end = Math.min(sceneEnd, cursor + rawSpan);

    // Snap the word start to the nearest beat when close enough
    if (beatTimes.length > 0) {
      let best = -1;
      let bestDist = snapTolerance + 1e-6;
      for (const b of beatTimes) {
        if (b > start + snapTolerance) break;
        const dist = Math.abs(b - start);
        if (dist < bestDist) {
          bestDist = dist;
          best = b;
        }
      }
      if (best >= 0 && (timings.length === 0 || best >= timings[timings.length - 1].start + 0.04)) {
        start = best;
        end = Math.max(start + 0.12, Math.min(sceneEnd, start + rawSpan));
      }
    }

    // Beat classification
    let beatIndex = -1;
    let onBeat = false;
    let onDownbeat = false;
    for (let bi = 0; bi < beatTimes.length; bi++) {
      if (Math.abs(beatTimes[bi] - start) <= snapTolerance + 0.02) {
        beatIndex = bi;
        onBeat = true;
        onDownbeat = analysis.downbeats.some((d) => Math.abs(d - start) <= snapTolerance + 0.02);
        break;
      }
      if (beatTimes[bi] > start) break;
    }

    timings.push({ word: words[i], start, end: Math.max(end, start + 0.1), onBeat, onDownbeat, beatIndex });
    cursor = end;
  }
  return timings;
}

const HINDI_PARTICLES = new Set([
  'में', 'का', 'के', 'की', 'को', 'ने', 'से', 'ही', 'है', 'हैं', 'हो',
  'पर', 'भी', 'न', 'ना', 'एक', 'था', 'थी', 'थे', 'गई', 'गया', 'पड़े',
  'कर', 'तो', 'अब', 'ये', 'वो', 'जो', 'दवा', 'कम', 'रहा', 'रही', 'रहे',
]);

const ENGLISH_PARTICLES = new Set([
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'it', 'its',
]);

export function isGrammarParticle(rawWord: string): boolean {
  const clean = rawWord.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
  return HINDI_PARTICLES.has(clean) || ENGLISH_PARTICLES.has(clean);
}

/**
 * Groups rapid single words into natural, readable display chunks (1 to 3 words, 0.45s - 1.55s),
 * preventing strobe-like single-word flashing in mobile vertical video while preserving
 * accurate beat sync, downbeat gold pulses, and punctuation pauses.
 */
export function groupWordsIntoDisplayChunks(
  words: WordTiming[],
  format: 'shorts' | 'long',
  analysis?: BeatAnalysis
): WordTiming[] {
  if (words.length === 0) return [];

  const isShorts = format === 'shorts';
  const maxWordsPerChunk = isShorts ? 3 : 4;
  const maxCharsPerChunk = isShorts ? 22 : 36;
  const minChunkDur = 0.42;
  const maxChunkDur = 1.55;

  const chunks: WordTiming[] = [];
  let currentGroup: WordTiming[] = [];

  const flush = () => {
    if (currentGroup.length === 0) return;
    const first = currentGroup[0];
    const last = currentGroup[currentGroup.length - 1];
    const text = currentGroup.map((w) => w.word).join(' ');

    const hasDownbeat = currentGroup.some((w) => w.onDownbeat);
    const hasBeat = currentGroup.some((w) => w.onBeat);
    const downbeatItem = currentGroup.find((w) => w.onDownbeat && w.beatIndex >= 0);
    const beatItem = currentGroup.find((w) => w.onBeat && w.beatIndex >= 0);
    const beatIndex = downbeatItem ? downbeatItem.beatIndex : beatItem ? beatItem.beatIndex : first.beatIndex;

    chunks.push({
      word: text,
      start: first.start,
      end: last.end,
      onBeat: hasBeat,
      onDownbeat: hasDownbeat,
      beatIndex,
    });
    currentGroup = [];
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prev = currentGroup[currentGroup.length - 1];

    if (currentGroup.length === 0) {
      currentGroup.push(w);
    } else {
      const gapFromPrev = w.start - prev.end;
      const proposedChars = currentGroup.map((x) => x.word).join(' ').length + 1 + w.word.length;
      const proposedDur = w.end - currentGroup[0].start;
      const prevEndsWithPunct = /[,;।.!?]$/.test(prev.word.trim());

      const mustBreak =
        prevEndsWithPunct ||
        gapFromPrev > 0.28 ||
        currentGroup.length >= maxWordsPerChunk ||
        proposedChars > maxCharsPerChunk ||
        proposedDur > maxChunkDur;

      if (mustBreak) {
        const canExtend =
          !prevEndsWithPunct &&
          gapFromPrev <= 0.25 &&
          (w.end - currentGroup[0].start < minChunkDur || isGrammarParticle(w.word)) &&
          proposedChars <= maxCharsPerChunk + 4;

        if (canExtend) {
          currentGroup.push(w);
        } else {
          flush();
          currentGroup.push(w);
        }
      } else {
        currentGroup.push(w);
      }
    }

    if (/[,;।.!?]$/.test(w.word.trim()) && (w.end - currentGroup[0].start >= minChunkDur || currentGroup.length >= 2)) {
      flush();
    }
  }

  flush();

  // Second pass: if any single-word chunk is tiny (< 0.38s) and adjacent to a short chunk with small gap, merge them
  const merged: WordTiming[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const curr = chunks[i];
    const next = chunks[i + 1];
    const dur = curr.end - curr.start;
    const currWords = curr.word.split(' ').length;
    const nextWords = next ? next.word.split(' ').length : 0;

    if (
      dur < 0.38 &&
      next &&
      next.start - curr.end <= 0.25 &&
      currWords + nextWords <= maxWordsPerChunk &&
      curr.word.length + 1 + next.word.length <= maxCharsPerChunk &&
      !/[,;।.!?]$/.test(curr.word.trim())
    ) {
      merged.push({
        word: `${curr.word} ${next.word}`,
        start: curr.start,
        end: next.end,
        onBeat: curr.onBeat || next.onBeat,
        onDownbeat: curr.onDownbeat || next.onDownbeat,
        beatIndex: curr.onDownbeat ? curr.beatIndex : next.onDownbeat ? next.beatIndex : curr.beatIndex,
      });
      i++;
    } else {
      merged.push(curr);
    }
  }

  return merged;
}

function buildStyleHeader(
  playResX: number,
  playResY: number,
  styleName: string,
  fontSize: number,
  marginV: number,
  motion = false
): string[] {
  const outline = motion ? Math.max(6, Math.min(16, Math.round(fontSize * 0.085))) : 3;
  const styleLine = motion
    ? // Motion Bold: huge bottom-anchored words with a heavy black outline + drop shadow
      `Style: ${styleName},Nirmala UI,${fontSize},${ASS_WHITE},${ASS_GOLD},&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,${outline},3,2,40,40,${marginV},1`
    : `Style: ${styleName},Nirmala UI,${fontSize},${ASS_WHITE},${ASS_GOLD},&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,3,3,5,40,40,${marginV},1`;
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${playResX}`,
    `PlayResY: ${playResY}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Banner,Georgia,54,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,1,2,8,20,20,420,1`,
    styleLine,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
}

/**
 * Calculates the exact subtitle font size for ASS rendering, supporting both preset strings
 * ('small' | 'medium' | 'large' | 'huge') and continuous numeric meter values (40px - 320px).
 */
export function resolveSubtitleFontSize(
  subtitleSize: BeatSubtitleSize | undefined,
  style: BeatSubtitleStyle,
  format: 'shorts' | 'long'
): number {
  const isShorts = format === 'shorts';

  if (typeof subtitleSize === 'number' && !isNaN(subtitleSize) && subtitleSize > 0) {
    // Custom size meter: clamped between 40px and 320px for 1080x1920 Shorts
    const shortsPx = Math.min(320, Math.max(40, Math.round(subtitleSize)));
    // In 1920x1080 Long format, canvas height is 1080 instead of 1920.
    // 0.75x scales proportional to screen height.
    return isShorts ? shortsPx : Math.round(shortsPx * 0.75);
  }

  const preset =
    typeof subtitleSize === 'string' && subtitleSize in SUBTITLE_SIZE_MULTIPLIERS
      ? (subtitleSize as 'small' | 'medium' | 'large' | 'huge')
      : 'medium';

  const mult = SUBTITLE_SIZE_MULTIPLIERS[preset] ?? 1.0;
  const baseFontSize = style === 'motion' ? (isShorts ? 96 : 72) : isShorts ? 58 : 46;
  return Math.round(baseFontSize * mult);
}

function classifyBeatForTime(start: number, analysis: BeatAnalysis): {
  beatIndex: number;
  onBeat: boolean;
  onDownbeat: boolean;
} {
  const snapTolerance = Math.min(0.15, (analysis.beatInterval || 0.55) * 0.25);
  const beatTimes = analysis.beats;
  let beatIndex = -1;
  let onBeat = false;
  let onDownbeat = false;
  for (let bi = 0; bi < beatTimes.length; bi++) {
    if (Math.abs(beatTimes[bi] - start) <= snapTolerance + 0.02) {
      beatIndex = bi;
      onBeat = true;
      onDownbeat = analysis.downbeats.some((d) => Math.abs(d - start) <= snapTolerance + 0.02);
      break;
    }
    if (beatTimes[bi] > start) break;
  }
  return { beatIndex, onBeat, onDownbeat };
}

function appendPhraseWordsToAss(opts: {
  lines: string[];
  words: WordTiming[];
  windowStart: number;
  windowEnd: number;
  maxDur: number;
  sceneIdx: number;
  styleName: string;
  fontSize: number;
  format: 'shorts' | 'long';
  editOptions: BeatEditOptions;
  analysis: BeatAnalysis;
  profile: BeatEditProfile;
}): number {
  const { lines, words, windowStart, windowEnd, maxDur, sceneIdx, styleName, fontSize, format, editOptions, analysis, profile } = opts;
  if (words.length === 0) return 0;

  const fadeIn = '\\fad(70,50)';
  let added = 0;

  if (editOptions.subtitleStyle === 'motion') {
    for (let wIdx = 0; wIdx < words.length; wIdx++) {
      const w = words[wIdx];
      const next = words[wIdx + 1];
      const gapToNext = next ? next.start - w.end : 1;
      const end = next
        ? gapToNext <= 0.32
          ? Math.max(w.end, next.start)
          : Math.min(windowEnd, w.end + 0.14)
        : Math.min(maxDur, windowEnd, w.end + 0.22);
      if (end <= w.start + 0.03) continue;

      const paletteIdx = w.beatIndex >= 0 ? w.beatIndex : wIdx;
      const color = MOTION_PALETTE[paletteIdx % MOTION_PALETTE.length];

      const chars = [...w.word].length;
      const effSize =
        chars >= 18
          ? Math.round(fontSize * 0.70)
          : chars >= 14
          ? Math.round(fontSize * 0.80)
          : chars >= 10
          ? Math.round(fontSize * 0.90)
          : fontSize;
      const sizeTag = effSize !== fontSize ? `\\fs${effSize}` : '';

      const entrance = Math.round(100 + profile.wordPop * (w.onDownbeat ? 1.9 : 1.2));
      let tags = `${fadeIn}${sizeTag}\\1c${color}\\blur3\\fscx${entrance}\\fscy${entrance}\\t(0,80,\\fscx100\\fscy100\\blur0)`;

      const beatsInWord = analysis.beats.filter((b) => b > w.start + 0.09 && b < end - 0.03);
      for (const b of beatsInWord.slice(0, 12)) {
        const rel = Math.round((b - w.start) * 1000);
        if (rel < 120) continue;
        const isDown = analysis.downbeats.some((d) => Math.abs(d - b) < 0.03);
        const amp = Math.round(profile.wordPop * (isDown ? 0.9 : 0.55));
        if (amp <= 0) continue;
        tags += `\\t(${rel - 30},${rel},\\fscx${100 + amp}\\fscy${100 + amp})\\t(${rel},${rel + 110},\\fscx100\\fscy100)`;
      }

      if (w.onDownbeat) {
        tags += `\\3c${ASS_GOLD}\\t(0,160,\\3c&H000000&)`;
      }

      lines.push(
        `Dialogue: 1,${formatAssTime(w.start)},${formatAssTime(end)},${styleName},,0,0,0,,{${tags}}${escapeAssText(w.word)}`
      );
      added++;
    }
  } else if (editOptions.subtitleStyle === 'karaoke') {
    const maxLineChars = format === 'shorts' ? 28 : 54;
    const parts: string[] = [];
    let prev = windowStart;
    let lineLen = 0;

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const lead = Math.max(0, Math.round((w.start - prev) * 100));
      if (lead > 0) parts.push(`{\\k${lead}}`);
      const durCs = Math.max(1, Math.round((w.end - w.start) * 100));
      const pop = w.onDownbeat
        ? `{\\1c${ASS_GOLD}\\fscx${100 + profile.wordPop}\\fscy${100 + profile.wordPop}\\t(0,140,\\fscx100\\fscy100)}`
        : '';

      const wChars = [...w.word].length;
      if (i > 0 && lineLen + 1 + wChars > maxLineChars) {
        parts.push('\\N');
        lineLen = 0;
      } else if (i > 0) {
        lineLen += 1;
      }
      const sep = i > 0 && lineLen > 0 ? ' ' : '';
      parts.push(`${sep}${pop}{\\k${durCs}}${escapeAssText(w.word)}`);
      lineLen += wChars;
      prev = w.end;
    }
    lines.push(
      `Dialogue: 1,${formatAssTime(windowStart)},${formatAssTime(windowEnd)},${styleName},,0,0,0,,{${fadeIn}}${parts.join('')}`
    );
    added++;
  } else {
    for (let wIdx = 0; wIdx < words.length; wIdx++) {
      const w = words[wIdx];
      const next = words[wIdx + 1];
      const gapToNext = next ? next.start - w.end : 1;
      const end = next
        ? gapToNext <= 0.32
          ? Math.max(w.end, next.start)
          : Math.min(windowEnd, w.end + 0.14)
        : Math.min(maxDur, windowEnd, w.end + 0.22);
      if (end <= w.start + 0.03) continue;

      const text = escapeAssText(w.word);
      let tags = '';

      if (editOptions.subtitleStyle === 'pop') {
        const popScale = w.onDownbeat ? 100 + profile.wordPop * 1.6 : 100 + profile.wordPop;
        const color = w.onDownbeat ? ASS_GOLD : w.onBeat ? ASS_WHITE : '&HB4FFFF&';
        tags += `\\1c${color}\\fscx${Math.round(popScale)}\\fscy${Math.round(popScale)}\\t(0,110,\\fscx100\\fscy100)`;
      } else {
        const color = w.onBeat
          ? ASS_HIGHLIGHT_PALETTE[(w.beatIndex >= 0 ? w.beatIndex : sceneIdx) % ASS_HIGHLIGHT_PALETTE.length]
          : ASS_WHITE;
        tags += `\\1c${color}\\blur3\\bord2\\t(0,260,\\blur0\\bord3)`;
      }

      lines.push(
        `Dialogue: 1,${formatAssTime(w.start)},${formatAssTime(end)},${styleName},,0,0,0,,{${fadeIn}${tags}}${text}`
      );
      added++;
    }
  }
  return added;
}

/**
 * Builds the beat-synced ASS subtitle file.
 * When `alignedLyrics` (derived from actual audio vocal analysis) is provided,
 * subtitles track the real sung/spoken timing and pauses instead of evenly
 * packing unaligned scene text across fixed intervals.
 */
export function buildBeatKaraokeAssSubtitles(opts: {
  scenes: FlowSceneDefinition[];
  analysis: BeatAnalysis;
  options: BeatEditOptions;
  filePath: string;
  format: 'shorts' | 'long';
  bannerText?: string;
  alignedLyrics?: LyricAlignmentResult | null;
}): void {
  const isShorts = opts.format === 'shorts';
  const playResX = isShorts ? 1080 : 1920;
  const playResY = isShorts ? 1920 : 1080;
  const motion = opts.options.subtitleStyle === 'motion';
  const styleName = motion ? 'MotionWord' : 'BeatCaption';
  const fontSize = resolveSubtitleFontSize(opts.options.subtitleSize, opts.options.subtitleStyle, opts.format);
  const marginV = motion ? (isShorts ? 620 : 150) : isShorts ? 0 : 80;
  const profile = getBeatEditProfile(opts.options.intensity);

  const lines = buildStyleHeader(playResX, playResY, styleName, fontSize, marginV, motion);

  const cleanBanner = typeof opts.bannerText === 'string' ? opts.bannerText.trim() : '';
  if (cleanBanner) {
    lines.push(
      `Dialogue: 0,0:00:00.00,${formatAssTime(opts.analysis.duration)},Banner,,0,0,0,,${escapeAssText(cleanBanner)}`
    );
  }

  let eventCount = 0;
  const alignedPhrases = opts.alignedLyrics?.phrases;

  if (Array.isArray(alignedPhrases) && alignedPhrases.length > 0) {
    const allAlignedWords: Array<{ w: WordTiming; phraseIdx: number }> = [];
    for (let pIdx = 0; pIdx < alignedPhrases.length; pIdx++) {
      const phrase = alignedPhrases[pIdx];
      const mappedWords: WordTiming[] = phrase.words.map((aw) => {
        const beat = classifyBeatForTime(aw.start, opts.analysis);
        return {
          word: aw.word,
          start: aw.start,
          end: aw.end,
          ...beat,
        };
      });
      if (opts.options.subtitleStyle === 'karaoke') {
        eventCount += appendPhraseWordsToAss({
          lines,
          words: mappedWords,
          windowStart: phrase.start,
          windowEnd: phrase.end,
          maxDur: opts.analysis.duration,
          sceneIdx: pIdx,
          styleName,
          fontSize,
          format: opts.format,
          editOptions: opts.options,
          analysis: opts.analysis,
          profile,
        });
      } else {
        for (const w of mappedWords) allAlignedWords.push({ w, phraseIdx: pIdx });
      }
    }

    if (opts.options.subtitleStyle !== 'karaoke' && allAlignedWords.length > 0) {
      const rawWords = allAlignedWords.map((item) => item.w);
      const displayWords = groupWordsIntoDisplayChunks(rawWords, opts.format, opts.analysis);
      eventCount += appendPhraseWordsToAss({
        lines,
        words: displayWords,
        windowStart: displayWords[0].start,
        windowEnd: opts.analysis.duration,
        maxDur: opts.analysis.duration,
        sceneIdx: 0,
        styleName,
        fontSize,
        format: opts.format,
        editOptions: opts.options,
        analysis: opts.analysis,
        profile,
      });
    }
  } else {
    let cursor = 0;
    for (let i = 0; i < opts.scenes.length; i++) {
      const sc = opts.scenes[i];
      const dur = Math.max(1.5, Number(sc.duration) || 8);
      const sceneStart = cursor;
      const sceneEnd = cursor + dur;
      cursor = sceneEnd;

      const caption = String(sc.caption || sc.line || '').trim();
      if (!caption) continue;

      const words = timeWordsToBeats(caption, sceneStart, sceneEnd, opts.analysis);
      eventCount += appendPhraseWordsToAss({
        lines,
        words,
        windowStart: sceneStart,
        windowEnd: sceneEnd,
        maxDur: opts.analysis.duration || sceneEnd,
        sceneIdx: i,
        styleName,
        fontSize,
        format: opts.format,
        editOptions: opts.options,
        analysis: opts.analysis,
        profile,
      });
    }
  }

  if (eventCount === 0) {
    lines.push(`Dialogue: 1,0:00:00.00,0:00:02.00,${styleName},,0,0,0,,${escapeAssText('♪')}`);
  }

  fs.mkdirSync(path.dirname(opts.filePath), { recursive: true });
  fs.writeFileSync(opts.filePath, lines.join('\n'), 'utf8');
}
