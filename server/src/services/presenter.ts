import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { containedFile, safeSegment } from './paths.js';
import { generatedDir, mediaUrl } from './workspace.js';
import { runMedia } from './media-process.js';
import { presenterState } from './presenter-state.js';
import { validatePresenter, presenterGeometry, type PresenterSettings } from './presenter-settings.js';
import { narrationBusy } from './long-narration.js';
import { localMusicBusy } from './local-music.js';
import { stopChatterbox } from './chatterbox-tts.js';
import { avatarAlphaSource, avatarAlphaCycle } from './presenter-alpha.js';

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export function museTalkRoot() {
  return path.resolve(process.env.MUSETALK_ROOT || path.join(os.homedir(), 'OneDrive', 'Documents', 'MuseTalk-Demo'));
}
function pythonPath() {
  const candidates = [process.env.MUSETALK_PYTHON,
    path.join(os.homedir(), 'miniconda3', 'envs', 'musetalk-demo', 'python.exe'),
    path.join(os.homedir(), 'anaconda3', 'envs', 'musetalk-demo', 'python.exe'),
    'C:/ProgramData/miniconda3/envs/musetalk-demo/python.exe'].filter(Boolean) as string[];
  return candidates.find(p => fs.existsSync(p));
}
function avatarDirectory(id: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid avatar ID.');
  return containedFile(path.join(museTalkRoot(), 'avatars', 'prepared'), id);
}
export function presenterAvatars() {
  const base = path.join(museTalkRoot(), 'avatars', 'prepared');
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base).flatMap(id => {
    try {
      const dir = avatarDirectory(id);
      const meta = JSON.parse(fs.readFileSync(containedFile(dir, 'metadata.json'), 'utf8'));
      if (meta.preparation_status !== 'prepared' || !['source_25fps.mp4', 'coords.pkl', 'mask_coords.pkl', 'latents.pt', 'full_imgs', 'mask'].every(f => fs.existsSync(containedFile(dir, f)))) return [];
      const [width, height] = String(meta.resolution).split('x').map(Number);
      const hasTransparency = Boolean(avatarAlphaSource(dir));
      return [{ id, name: String(meta.name || id), width, height, duration: meta.duration, hasTransparency,
        transparentPreviewUrl: hasTransparency ? mediaUrl(`presenter/avatar/${id}?transparent=1`) : undefined,
        previewUrl: mediaUrl(`presenter/avatar/${id}`) }];
    } catch { return []; }
  });
}
export function presenterHealth() {
  const weights = ['musetalkV15/unet.pth', 'musetalkV15/musetalk.json', 'sd-vae/diffusion_pytorch_model.bin', 'whisper/pytorch_model.bin'];
  const installed = Boolean(pythonPath() && fs.existsSync(path.join(museTalkRoot(), 'app', 'musetalk_service.py')) && weights.every(file => fs.existsSync(path.join(museTalkRoot(), 'MuseTalk', 'models', file))));
  return { installed, busy: presenterState.busy, avatars: presenterAvatars(),
    message: installed ? 'Presenter engine installed. Starts automatically when rendering.' : 'Set MUSETALK_ROOT and MUSETALK_PYTHON in .env to your MuseTalk installation.' };
}
export function avatarPreview(id: string, transparent = false) {
  const directory = avatarDirectory(id);
  if (!transparent) return containedFile(directory, 'source_25fps.mp4');
  const source = avatarAlphaSource(directory);
  if (!source) throw new Error('Transparent source is unavailable.');
  return source;
}

async function hashFile(file: string) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function presenterCacheKey(audio: string, p: PresenterSettings) {
  const dir = avatarDirectory(p.avatarId);
  const inputs = await Promise.all([audio, containedFile(dir, 'metadata.json'), containedFile(dir, 'latents.pt'),
    path.join(museTalkRoot(), 'app', 'musetalk_service.py')].map(hashFile));
  return createHash('sha256').update(JSON.stringify(['presenter-v1', inputs, p.avatarId, p.silenceGate, p.silenceThresholdDb])).digest('hex');
}

async function releaseIdleGpu(signal: AbortSignal) {
  if (narrationBusy() || localMusicBusy() || presenterState.mediaRequests || presenterState.imageRequests || presenterState.speechRequests) throw new Error('Wait for image, music and narration generation to finish before rendering a presenter.');
  const base = (process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188').replace(/\/+$/, '');
  let response: Response | undefined;
  try { response = await fetch(`${base}/queue`, { signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]) }); }
  catch { signal.throwIfAborted(); }
  if (response?.ok) {
    const queue = await response.json();
    if (queue.queue_running?.length || queue.queue_pending?.length) throw new Error('ComfyUI is generating media. Wait for its queue to finish.');
    const freed = await fetch(`${base}/free`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unload_models: true, free_memory: true }), signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
    if (!freed.ok) throw new Error('Could not release idle ComfyUI models. Stop ComfyUI and retry.');
  }
  await stopChatterbox(); // Only stops a process started by this application.
  signal.throwIfAborted();
}

function runWorker(request: string, signal: AbortSignal, progress: (stage: string, percent: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const child = spawn(pythonPath()!, ['-u', path.join(SERVER, 'musetalk', 'worker.py'), '--request', request], {
      windowsHide: true, cwd: museTalkRoot(), stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: [path.dirname(pythonPath()!), path.join(path.dirname(pythonPath()!), 'Library', 'bin'), process.env.PATH || process.env.Path || ''].join(path.delimiter),
        NUMBA_CACHE_DIR: path.join(os.tmpdir(), 'tubeflow-musetalk-numba'),
        PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' },
    });
    let lines = '', logs = '', output = '', workerError = '';
    let killing: Promise<void> | undefined;
    const cancel = () => {
      if (killing) return;
      // Cooperative fallback also works when Windows denies taskkill. The worker
      // checks this before each stage/batch and closes its FFmpeg encoder itself.
      try { fs.writeFileSync(path.join(path.dirname(request), 'cancel.request'), 'cancel'); } catch { /* Job may already be exiting. */ }
      killing = new Promise<void>(done => {
        if (process.platform === 'win32' && child.pid) {
          execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => done());
        } else { done(); }
      });
    };
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    child.stdout.on('data', chunk => {
      lines += String(chunk);
      let end: number;
      while ((end = lines.indexOf('\n')) >= 0) {
        const line = lines.slice(0, end).trim(); lines = lines.slice(end + 1);
        if (line.startsWith('TUBEFLOW_EVENT ')) {
          try {
            const event = JSON.parse(line.slice(15));
            if (event.error) workerError = String(event.error);
            if (event.result?.output_path) output = event.result.output_path;
            if (event.stage && !signal.aborted) progress(event.stage, Number(event.progress) || 0);
          } catch { /* Other model logging is not protocol data. */ }
        }
      }
    });
    child.stderr.on('data', chunk => { logs = (logs + String(chunk)).slice(-4000); });
    child.on('error', error => { signal.removeEventListener('abort', cancel); reject(error); });
    child.on('close', async code => {
      signal.removeEventListener('abort', cancel);
      if (killing) await killing;
      if (signal.aborted) reject(new Error('Presenter generation cancelled.'));
      else if (code !== 0 || !output) reject(new Error(`MuseTalk failed: ${workerError || logs || `exit ${code}`}. Close the standalone MuseTalk lab if it is holding GPU memory.`));
      else resolve(output);
    });
  });
}

export async function generatePresenter(scriptId: string, audio: string, settings: PresenterSettings, signal: AbortSignal, progress: (stage: string, percent: number) => void) {
  const p = validatePresenter(settings);
  if (!safeSegment(scriptId)) throw new Error('Invalid script ID.');
  if (!presenterHealth().installed) throw new Error(presenterHealth().message);
  if (!presenterAvatars().some(a => a.id === p.avatarId)) throw new Error('Prepared avatar is missing or incomplete. Choose another avatar.');
  if (p.style === 'transparent' && !avatarAlphaSource(avatarDirectory(p.avatarId))) throw new Error('Transparent WebM source is missing. Refresh avatars or re-upload the transparent original in MuseTalk.');
  if (presenterState.busy) throw new Error('Another presenter is generating.');
  presenterState.busy = true;
  let work: string | undefined;
  try {
    const directory = containedFile(generatedDir(), scriptId);
    fs.mkdirSync(directory, { recursive: true });
    progress('Checking saved presenter', 0);
    const hash = await presenterCacheKey(audio, p);
    signal.throwIfAborted();
    const target = containedFile(directory, `presenter-${hash}.mp4`);
    const duration = Number((await runMedia('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', audio], signal)).trim());
    const valid = async (file: string) => {
      const meta = JSON.parse(await runMedia('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', file], signal));
      const video = meta.streams.find((s: any) => s.codec_type === 'video');
      return video && Math.abs(Number(video.duration) - duration) <= 0.12;
    };
    if (fs.existsSync(target)) {
      try { if (await valid(target)) { progress('Using saved lip-sync', 100); return target; } } catch { signal.throwIfAborted(); }
    }
    progress('Preparing GPU for presenter', 1);
    await releaseIdleGpu(signal);
    work = containedFile(directory, `presenter-work-${randomUUID()}`);
    fs.mkdirSync(work);
    const request = containedFile(work, 'request.json');
    fs.writeFileSync(request, JSON.stringify({ root: museTalkRoot(), work, audio, avatarId: p.avatarId,
      silenceGate: p.silenceGate, silenceThresholdDb: p.silenceThresholdDb }));
    const output = await runWorker(request, signal, progress);
    if (path.resolve(output) !== containedFile(work, path.basename(output))) throw new Error('Presenter returned a file outside its job directory.');
    if (!await valid(output)) throw new Error('Presenter duration does not match narration. Retry generation.');
    signal.throwIfAborted();
    fs.renameSync(output, target);
    return target;
  } finally {
    presenterState.busy = false;
    if (work) fs.rmSync(work, { recursive: true, force: true });
  }
}

export async function compositePresenter(base: string, source: string, settings: PresenterSettings, width: number, height: number, duration: number, signal?: AbortSignal) {
  const p = validatePresenter(settings);
  const metadata = JSON.parse(await runMedia('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_streams', '-of', 'json', source], signal));
  const video = metadata.streams[0];
  const geo = presenterGeometry(p, width, height, video.width, video.height);
  const c = p.crop;
  const crop = `crop=trunc(iw*${c.width / 100}/2)*2:trunc(ih*${c.height / 100}/2)*2:trunc(iw*${c.x / 100}/2)*2:trunc(ih*${c.y / 100}/2)*2`;
  const key = p.style === 'green-screen' ? ',chromakey=0x00FF00:0.12:0.08' : '';
  const alpha = p.style === 'transparent' ? await avatarAlphaCycle(avatarDirectory(p.avatarId), signal) : undefined;
  const alphaGraph = alpha ? `[2:v]setpts=N/(25*TB),scale=${video.width}:${video.height},format=gray[mask];[1:v]setpts=N/(25*TB),format=rgba[rgb];[rgb][mask]alphamerge[cutout];` : '';
  // The 25fps presenter is resampled, not sped up. Its audio is never mapped.
  const graph = `${alphaGraph}${alpha ? '[cutout]' : '[1:v]'}setpts=PTS-STARTPTS,${crop},scale=${geo.width}:${geo.height},setsar=1,fps=30,format=rgba${key},tpad=stop_mode=clone:stop_duration=0.12[p];[0:v][p]overlay=x=W-w-${geo.right}:y=H-h-${geo.bottom}:eof_action=pass[v]`;
  const output = base.replace(/\.mp4$/, '.presenter.partial.mp4');
  try {
    await runMedia('ffmpeg', ['-v', 'error', '-y', '-i', base, '-i', source, ...(alpha ? ['-stream_loop', '-1', '-i', alpha] : []), '-filter_complex_threads', '1', '-filter_complex', graph,
      '-map', '[v]', '-map', '0:a:0', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
      '-c:a', 'copy', '-t', String(duration), '-movflags', '+faststart', output], signal);
    signal?.throwIfAborted();
    fs.renameSync(output, base);
  } finally { fs.rmSync(output, { force: true }); }
}
