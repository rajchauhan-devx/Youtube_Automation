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
  const { resolution = { width: 1080, height: 1920 }, zoomFactor = 1.15, transitionDuration = 0.5 } = opts;
  const { width, height } = resolution;
  const numImages = resolvedImages.length;

  if (numImages === 0) throw new Error('No images provided for rendering');
  if (numImages === 1) {
    const zoom = zoomFactor;
    return `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+${(zoom-1)/100},${zoom})':d=300:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}[v]`;
  }

  const totalVideoDuration = opts.duration || 30;
  const imageDuration = totalVideoDuration / numImages;
  const overlap = Math.min(transitionDuration, imageDuration * 0.4);

  let filterParts: string[] = [];
  let lastLabel = '';

  resolvedImages.forEach((_, i) => {
    const inputLabel = `[${i}:v]`;
    const zoomedLabel = `zoomed${i}`;
    const frameCount = Math.max(30, Math.round((imageDuration + overlap) * 30));

    filterParts.push(
      `${inputLabel}scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,zoompan=z='if(lte(zoom,1.0),${zoomFactor},max(1.0,zoom-0.0015))':d=${frameCount}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}[${zoomedLabel}]`
    );

    if (i === 0) {
      lastLabel = zoomedLabel;
    } else {
      const blendLabel = `blend${i}`;
      const offset = Math.max(0, Math.round(i * (imageDuration - overlap / 2) * 100) / 100);
      filterParts.push(
        `[${lastLabel}][${zoomedLabel}]xfade=transition=fade:duration=${overlap}:offset=${offset}[${blendLabel}]`
      );
      lastLabel = blendLabel;
    }
  });

  filterParts.push(`[${lastLabel}]trim=duration=${totalVideoDuration},setpts=PTS-STARTPTS[v]`);

  return filterParts.join(';');
}

export async function renderVideo(opts: RenderOptions): Promise<RenderResult> {
  const { scriptId, imagePaths, audioPath, duration = 30 } = opts;

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