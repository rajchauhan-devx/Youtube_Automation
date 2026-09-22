import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ROOT_DATA } from './workspace.js';
import { runMedia } from './media-process.js';

const probes = new Map<string, boolean>();

/** Preserve the uploaded WebM before Gradio clears its temporary upload folder. */
export function avatarAlphaSource(directory: string): string | undefined {
  try {
    const metadata = fs.readFileSync(path.join(directory, 'metadata.json'), 'utf8');
    const meta = JSON.parse(metadata);
    if (typeof meta.source_path !== 'string' || path.extname(meta.source_path).toLowerCase() !== '.webm') return;
    const key = createHash('sha256').update(directory).update(metadata).digest('hex');
    const cached = path.join(ROOT_DATA, 'presenter-alpha', key, 'original.webm');
    const source = fs.existsSync(cached) ? cached : meta.source_path;
    const stat = fs.statSync(source);
    const probeKey = `${source}:${stat.size}:${stat.mtimeMs}`;
    let alpha = probes.get(probeKey);
    if (alpha === undefined) {
      const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_streams', '-of', 'json', source],
        { encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024 }));
      const video = info.streams?.[0];
      alpha = video?.codec_name === 'vp9' && String(video?.tags?.alpha_mode) === '1';
      probes.set(probeKey, alpha);
    }
    if (!alpha) return;
    if (source !== cached) {
      fs.mkdirSync(path.dirname(cached), { recursive: true });
      const temporary = `${cached}.${randomUUID()}.partial`;
      try { fs.copyFileSync(source, temporary); fs.renameSync(temporary, cached); }
      finally { fs.rmSync(temporary, { force: true }); }
    }
    return cached;
  } catch { return undefined; }
}

/** Match MuseTalk's 25fps frames, including its forward/reverse avatar cycle. */
export async function avatarAlphaCycle(directory: string, signal?: AbortSignal): Promise<string> {
  const source = avatarAlphaSource(directory);
  if (!source) throw new Error('This avatar has no original transparent WebM. Re-upload a transparent VP9 WebM in MuseTalk, then refresh avatars.');
  const meta = JSON.parse(fs.readFileSync(path.join(directory, 'metadata.json'), 'utf8'));
  const frames = Number(meta.num_frames_cycle) / 2;
  const fps = Number(meta.fps);
  const [width, height] = String(meta.resolution).split('x').map(Number);
  if (!Number.isInteger(frames) || frames < 1 || frames > 15000 || fps !== 25 || !Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) {
    throw new Error('Invalid prepared avatar timing for transparency. Re-prepare this avatar in MuseTalk.');
  }
  const target = path.join(path.dirname(source), 'cycle-v1.mkv');
  if (fs.existsSync(target)) return target;
  const token = randomUUID();
  const forward = path.join(path.dirname(source), `${token}-forward.mkv`);
  const partial = path.join(path.dirname(source), `${token}-cycle.mkv`);
  try {
    // Use the same output -r conversion as MuseTalk's normalize_video, not a
    // different fps filter. libvpx is essential: the native VP9 decoder drops alpha.
    await runMedia('ffmpeg', ['-v', 'error', '-y', '-c:v', 'libvpx-vp9', '-i', source,
      '-vf', `alphaextract,scale=${width}:${height},tpad=stop_mode=clone:stop_duration=1`,
      '-r', String(fps), '-frames:v', String(frames), '-an', '-c:v', 'ffv1', '-pix_fmt', 'gray', forward], signal);
    await runMedia('ffmpeg', ['-v', 'error', '-y', '-i', forward, '-filter_complex_threads', '1',
      '-filter_complex', `[0:v]split[a][b];[a]setpts=N/(${fps}*TB)[f];[b]reverse,setpts=N/(${fps}*TB)[r];[f][r]concat=n=2:v=1:a=0[v]`,
      '-map', '[v]', '-an', '-c:v', 'ffv1', '-pix_fmt', 'gray', partial], signal);
    signal?.throwIfAborted();
    if (!fs.existsSync(target)) fs.renameSync(partial, target);
    return target;
  } finally {
    fs.rmSync(forward, { force: true });
    fs.rmSync(partial, { force: true });
  }
}
