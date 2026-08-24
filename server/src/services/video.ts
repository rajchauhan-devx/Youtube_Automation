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

function buildFilterComplex(opts: RenderOptions, resolvedImages: string[]): string {
  const { resolution = { width: 1080, height: 1920 }, zoomFactor = 1.15, transitionDuration: defaultTransitionDuration = 0.5 } = opts;
  const { width, height } = resolution;
  const numImages = resolvedImages.length;

  if (numImages === 0) throw new Error('No images provided for rendering');

  const totalVideoDuration = opts.duration || 30;

  // Use per-clip durations from timelineConfig if available
  const clipDurations: number[] = [];
  const clipTransitions: { type: string; duration: number }[] = [];

  if (opts.timelineConfig?.clips && opts.timelineConfig.clips.length === numImages) {
    for (const clip of opts.timelineConfig.clips) {
      clipDurations.push(clip.duration);
      clipTransitions.push({
        type: clip.transition || 'crossfade',
        duration: clip.transitionDuration ?? defaultTransitionDuration,
      });
    }
  } else {
    // Uniform distribution
    const uniformDuration = totalVideoDuration / numImages;
    for (let i = 0; i < numImages; i++) {
      clipDurations.push(uniformDuration);
      clipTransitions.push({ type: 'crossfade', duration: defaultTransitionDuration });
    }
  }

  if (numImages === 1) {
    const zoom = zoomFactor;
    const zoomStep = Math.max(0.0001, (zoom - 1.0) / 300);
    return `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+${zoomStep.toFixed(6)},${zoom})':d=300:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}[v]`;
  }

  let filterParts: string[] = [];
  let lastLabel = '';
  let accumulatedTime = 0;

  resolvedImages.forEach((_, i) => {
    const inputLabel = `[${i}:v]`;
    const zoomedLabel = `zoomed${i}`;
    const clipDur = clipDurations[i];
    const transDur = clipTransitions[i].duration;
    const overlap = Math.min(transDur, clipDur * 0.4);
    const frameCount = Math.max(30, Math.round((clipDur + overlap) * 30));

    // Zoom IN: start at 1.0, increase to zoomFactor over the clip duration
    // Calculate step so zoom reaches exactly zoomFactor by the last frame
    const zoomStep = Math.max(0.0001, (zoomFactor - 1.0) / frameCount);

    filterParts.push(
      `${inputLabel}scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+${zoomStep.toFixed(6)},${zoomFactor})':d=${frameCount}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}[${zoomedLabel}]`
    );

    if (i === 0) {
      lastLabel = zoomedLabel;
      accumulatedTime = clipDur;
    } else {
      const blendLabel = `blend${i}`;
      const offset = Math.max(0, Math.round((accumulatedTime - overlap / 2) * 100) / 100);

      if (clipTransitions[i].type === 'none' || overlap <= 0) {
        // No transition — just concat
        const concatLabel = `concat${i}`;
        filterParts.push(
          `[${lastLabel}][${zoomedLabel}]concat=n=2:v=1:a=0[${concatLabel}]`
        );
        lastLabel = concatLabel;
      } else {
        filterParts.push(
          `[${lastLabel}][${zoomedLabel}]xfade=transition=fade:duration=${overlap}:offset=${offset}[${blendLabel}]`
        );
        lastLabel = blendLabel;
      }
      accumulatedTime += clipDur;
    }
  });

  filterParts.push(`[${lastLabel}]trim=duration=${totalVideoDuration},setpts=PTS-STARTPTS[v]`);

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

  const filename = `final_${Date.now()}.mp4`;
  const outputPath = path.join(outputDir, filename);

  const filterComplex = buildFilterComplex(opts, resolvedImages);

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();

    resolvedImages.forEach((imgPath) => {
      cmd.input(imgPath);
    });
    cmd.input(resolvedAudio);

    cmd
      .complexFilter(filterComplex)
      .outputOptions([
        '-map', '[v]',
        '-map', `${resolvedImages.length}:a`,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-shortest',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
      ])
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