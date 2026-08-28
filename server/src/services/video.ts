import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = path.join(__dirname, '..', '..', 'data', 'generated');
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'data', 'output');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

ffmpeg.setFfmpegPath('ffmpeg');

export interface RenderOptions {
  scriptId: string;
  imagePaths: string[];
  audioPath: string;
  duration?: number;
  resolution?: { width: number; height: number };
  zoomFactor?: number;
  transitionDuration?: number;
  timelineConfig?: {
    clips: { duration: number; transition: string; transitionDuration: number }[];
  };
  sceneAnalysis?: {
    transitions: string[];
    effects: string[];
    timings: number[];
    pacing?: string;
    mood?: string;
  };
  enableSubtitles?: boolean;
  subtitlePath?: string;
  bgmPath?: string;
  bgmVolume?: number;
  onProgress?: (percent: number) => void;
}

export interface RenderResult {
  outputPath: string;
  filename: string;
  duration: number;
  size: number;
}

function resolveInputPath(p: string, scriptId: string): string {
  if (p && fs.existsSync(p)) return path.resolve(p);

  const filename = path.basename(p);
  const targetInScriptDir = path.join(GENERATED_DIR, scriptId, filename);
  if (fs.existsSync(targetInScriptDir)) return targetInScriptDir;

  const cwdResolved = path.resolve(process.cwd(), p);
  if (fs.existsSync(cwdResolved)) return cwdResolved;

  const rootResolved = path.resolve(__dirname, '..', '..', '..', p);
  if (fs.existsSync(rootResolved)) return rootResolved;

  return p;
}

const VALID_XFADE_TRANSITIONS = new Set([
  'fade', 'fadeblack', 'fadewhite', 'fadegrays', 'fadeslow', 'fadefast',
  'wipeleft', 'wiperight', 'wipeup', 'wipedown', 'wipetl', 'wipetr', 'wipebl', 'wipebr',
  'slideleft', 'slideright', 'slideup', 'slidedown',
  'circleopen', 'circleclose', 'circlecrop',
  'dissolve', 'pixelize', 'horzopen', 'horzclose', 'vertopen', 'vertclose'
]);

function buildZoompanExpression(effect: string, frameCount: number, width: number, height: number, zoomFactor: number): string {
  const zMax = Math.max(1.15, zoomFactor);
  const step = Math.max(0.0001, (zMax - 1.0) / Math.max(30, frameCount));
  const stepStr = step.toFixed(6);

  switch (effect.toLowerCase()) {
    case 'zoom-out':
      return `zoompan=z='if(eq(on,1),${zMax.toFixed(2)},max(1.0,zoom-${stepStr}))':d=${frameCount}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}`;
    case 'pan-left':
      return `zoompan=z=1.15:d=${frameCount}:x='(1-on/${frameCount})*(iw-iw/zoom)':y='ih/2-(ih/zoom/2)':s=${width}x${height}`;
    case 'pan-right':
      return `zoompan=z=1.15:d=${frameCount}:x='(on/${frameCount})*(iw-iw/zoom)':y='ih/2-(ih/zoom/2)':s=${width}x${height}`;
    case 'pan-up':
      return `zoompan=z=1.15:d=${frameCount}:x='iw/2-(iw/zoom/2)':y='(1-on/${frameCount})*(ih-ih/zoom)':s=${width}x${height}`;
    case 'pan-down':
      return `zoompan=z=1.15:d=${frameCount}:x='iw/2-(iw/zoom/2)':y='(on/${frameCount})*(ih-ih/zoom)':s=${width}x${height}`;
    case 'ken-burns-in':
      return `zoompan=z='min(zoom+${stepStr},${zMax.toFixed(2)})':d=${frameCount}:x='(on/${frameCount})*(iw-iw/zoom)':y='(on/${frameCount})*(ih-ih/zoom)':s=${width}x${height}`;
    case 'hold':
      return `zoompan=z=1.0:d=${frameCount}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}`;
    case 'zoom-in':
    default:
      return `zoompan=z='min(zoom+${stepStr},${zMax.toFixed(2)})':d=${frameCount}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}`;
  }
}

function buildFilterComplex(opts: RenderOptions, resolvedImages: string[]): string {
  const { resolution = { width: 1080, height: 1920 }, zoomFactor = 1.15, transitionDuration: defaultTransitionDuration = 0.5 } = opts;
  const { width, height } = resolution;
  const numImages = resolvedImages.length;

  if (numImages === 0) throw new Error('No images provided for rendering');

  const totalVideoDuration = opts.duration || 30;

  // Resolve durations, transitions, and effects from sceneAnalysis or timelineConfig
  const clipDurations: number[] = [];
  const clipTransitions: { type: string; duration: number }[] = [];
  const clipEffects: string[] = [];

  const sa = opts.sceneAnalysis;
  const tc = opts.timelineConfig;

  if (tc?.clips && tc.clips.length === numImages) {
    for (let i = 0; i < numImages; i++) {
      const clip = tc.clips[i];
      clipDurations.push(clip.duration);
      clipTransitions.push({
        type: clip.transition || 'fade',
        duration: clip.transitionDuration ?? defaultTransitionDuration,
      });
      clipEffects.push(sa?.effects?.[i] || 'zoom-in');
    }
  } else if (sa?.timings && sa.timings.length === numImages) {
    for (let i = 0; i < numImages; i++) {
      clipDurations.push(sa.timings[i]);
      clipEffects.push(sa.effects?.[i] || 'zoom-in');
      const transName = sa.transitions?.[i] || 'fade';
      clipTransitions.push({
        type: VALID_XFADE_TRANSITIONS.has(transName) ? transName : 'fade',
        duration: defaultTransitionDuration,
      });
    }
  } else {
    // Uniform distribution
    const uniformDuration = totalVideoDuration / numImages;
    for (let i = 0; i < numImages; i++) {
      clipDurations.push(uniformDuration);
      clipTransitions.push({ type: 'fade', duration: defaultTransitionDuration });
      clipEffects.push(i % 2 === 0 ? 'zoom-in' : 'pan-left');
    }
  }

  let filterParts: string[] = [];
  let lastLabel = '';
  let accumulatedTime = 0;

  if (numImages === 1) {
    const motionExp = buildZoompanExpression(clipEffects[0] || 'zoom-in', 300, width, height, zoomFactor);
    lastLabel = 'zoomed0';
    filterParts.push(`[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,${motionExp}[${lastLabel}]`);
  } else {
    resolvedImages.forEach((_, i) => {
      const inputLabel = `[${i}:v]`;
      const zoomedLabel = `zoomed${i}`;
      const clipDur = clipDurations[i] || 3;
      const transDur = clipTransitions[i]?.duration ?? defaultTransitionDuration;
      const overlap = Math.min(transDur, clipDur * 0.4);
      const frameCount = Math.max(30, Math.round((clipDur + overlap) * 30));

      const motionExp = buildZoompanExpression(clipEffects[i] || 'zoom-in', frameCount, width, height, zoomFactor);

      filterParts.push(
        `${inputLabel}scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,${motionExp}[${zoomedLabel}]`
      );

      if (i === 0) {
        lastLabel = zoomedLabel;
        accumulatedTime = clipDur;
      } else {
        const blendLabel = `blend${i}`;
        const offset = Math.max(0, Math.round((accumulatedTime - overlap / 2) * 100) / 100);
        const transitionType = clipTransitions[i - 1]?.type || 'fade';
        const cleanTransition = VALID_XFADE_TRANSITIONS.has(transitionType) ? transitionType : 'fade';

        if (transitionType === 'none' || overlap <= 0) {
          const concatLabel = `concat${i}`;
          filterParts.push(
            `[${lastLabel}][${zoomedLabel}]concat=n=2:v=1:a=0[${concatLabel}]`
          );
          lastLabel = concatLabel;
        } else {
          filterParts.push(
            `[${lastLabel}][${zoomedLabel}]xfade=transition=${cleanTransition}:duration=${overlap}:offset=${offset}[${blendLabel}]`
          );
          lastLabel = blendLabel;
        }
        accumulatedTime += clipDur;
      }
    });
  }

  // Handle burned-in subtitles if enabled
  if (opts.enableSubtitles && opts.subtitlePath && fs.existsSync(opts.subtitlePath)) {
    const escapedSub = opts.subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');
    filterParts.push(`[${lastLabel}]trim=duration=${totalVideoDuration},setpts=PTS-STARTPTS,ass='${escapedSub}'[v]`);
  } else {
    filterParts.push(`[${lastLabel}]trim=duration=${totalVideoDuration},setpts=PTS-STARTPTS[v]`);
  }

  // Handle BGM audio mixing in filter complex if BGM is present
  if (opts.bgmPath && fs.existsSync(opts.bgmPath)) {
    const voiceIndex = numImages;
    const bgmIndex = numImages + 1;
    const bgmVol = (opts.bgmVolume ?? 0.15).toFixed(2);

    filterParts.push(`[${voiceIndex}:a]volume=1.0[voice]`);
    filterParts.push(`[${bgmIndex}:a]volume=${bgmVol}[bgm]`);
    filterParts.push(`[voice][bgm]amix=inputs=2:duration=first:dropout_transition=2[a]`);
  }

  return filterParts.join(';');
}

export async function renderVideo(opts: RenderOptions): Promise<RenderResult> {
  const { scriptId, imagePaths, audioPath, duration: inputDuration } = opts;

  // Use timelineConfig total duration if available
  const duration = opts.timelineConfig?.clips
    ? opts.timelineConfig.clips.reduce((sum, c) => sum + c.duration, 0)
    : (inputDuration || 30);

  const outputDir = path.join(OUTPUT_DIR, scriptId);
  fs.mkdirSync(outputDir, { recursive: true });

  const resolvedImages = imagePaths.map((p) => resolveInputPath(p, scriptId));
  const resolvedAudio = resolveInputPath(audioPath, scriptId);

  const missingImage = resolvedImages.find((p) => !fs.existsSync(p));
  if (missingImage) {
    throw new Error(`Image file not found: ${missingImage}`);
  }
  if (!fs.existsSync(resolvedAudio)) {
    throw new Error(`Audio file not found: ${resolvedAudio}`);
  }

  const hasBgm = Boolean(opts.bgmPath && fs.existsSync(opts.bgmPath));

  const filename = `final_${Date.now()}.mp4`;
  const outputPath = path.join(outputDir, filename);

  const filterComplex = buildFilterComplex(opts, resolvedImages);

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();

    resolvedImages.forEach((imgPath) => {
      cmd.input(imgPath);
    });
    cmd.input(resolvedAudio);

    if (hasBgm && opts.bgmPath) {
      cmd.input(opts.bgmPath).inputOptions(['-stream_loop', '-1']);
    }

    const outputOptions = [
      '-map', '[v]',
      '-map', hasBgm ? '[a]' : `${resolvedImages.length}:a`,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
    ];

    cmd
      .complexFilter(filterComplex)
      .outputOptions(outputOptions)
      .output(outputPath)
      .on('start', (cmdline) => {
        console.log(`FFmpeg started: ${cmdline}`);
      })
      .on('progress', (progress) => {
        if (progress.percent && opts.onProgress) {
          opts.onProgress(Math.min(99, Math.max(1, Math.round(progress.percent))));
        }
      })
      .on('end', () => {
        const stats = fs.statSync(outputPath);
        if (opts.onProgress) opts.onProgress(100);
        resolve({
          outputPath,
          filename,
          duration,
          size: stats.size,
        });
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err.message);
        reject(new Error(`Video rendering failed: ${err.message}`));
      })
      .run();
  });
}

export function getOutputDir(scriptId: string): string {
  return path.join(OUTPUT_DIR, scriptId);
}

export function getVideoUrl(scriptId: string, filename: string): string {
  return `/api/render/file/${scriptId}/${filename}`;
}

export function serveVideoFile(scriptId: string, filename: string): string | null {
  const safeScriptId = scriptId.replace(/[^a-zA-Z0-9._-]/g, '');
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safeScriptId || !safeFilename) return null;

  const filePath = path.join(OUTPUT_DIR, safeScriptId, safeFilename);
  return fs.existsSync(filePath) ? filePath : null;
}