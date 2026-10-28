import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { containedFile, safeSegment } from './paths.js';
import { generatedDir, mediaUrl, workspaceKey } from './workspace.js';
import { runMedia } from './media-process.js';
import { presenterState } from './presenter-state.js';
import { validatePresenter, presenterGeometry, type PresenterSettings } from './presenter-settings.js';
import { narrationBusy } from './long-narration.js';
import { localMusicBusy } from './local-music.js';
import { avatarAlphaSource, avatarAlphaCycle } from './presenter-alpha.js';

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPO_ROOT = path.resolve(SERVER, '..');
export function museTalkRoot() {
  if (process.env.MUSETALK_ROOT) return path.resolve(REPO_ROOT, process.env.MUSETALK_ROOT);
  const macCloudStorage = path.join(os.homedir(), 'Library', 'CloudStorage');
  let macOneDriveDirs: string[] = [];
  try {
    if (fs.existsSync(macCloudStorage)) {
      macOneDriveDirs = fs.readdirSync(macCloudStorage)
        .filter(d => /onedrive/i.test(d))
        .map(d => path.join(macCloudStorage, d, 'Documents', 'MuseTalk-Demo'));
    }
  } catch {}

  const candidates = [
    path.join(REPO_ROOT, 'MuseTalk-Demo'),
    path.join(os.homedir(), 'MuseTalk-Demo'),
    path.join(os.homedir(), 'Documents', 'MuseTalk-Demo'),
    path.join(os.homedir(), 'OneDrive', 'Documents', 'MuseTalk-Demo'),
    ...macOneDriveDirs,
  ].filter(Boolean) as string[];
  const withModels = candidates.find(p => fs.existsSync(path.join(p, 'MuseTalk', 'models')));
  return path.resolve(withModels || candidates.find(p => fs.existsSync(p)) || path.join(REPO_ROOT, 'MuseTalk-Demo'));
}
export function presenterPythonPath() {
  if (process.env.MUSETALK_PYTHON) {
    const configured = path.resolve(REPO_ROOT, process.env.MUSETALK_PYTHON);
    return fs.existsSync(configured) ? configured : undefined;
  }
  const candidates = [
    path.join(museTalkRoot(), '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    path.join(os.homedir(), 'miniconda3', 'envs', 'musetalk-demo', 'python.exe'),
    path.join(os.homedir(), 'anaconda3', 'envs', 'musetalk-demo', 'python.exe'),
    'C:/ProgramData/miniconda3/envs/musetalk-demo/python.exe',
    path.join(os.homedir(), 'miniconda3', 'envs', 'musetalk-demo', 'bin', 'python'),
    path.join(os.homedir(), 'anaconda3', 'envs', 'musetalk-demo', 'bin', 'python'),
    path.join(os.homedir(), 'miniforge3', 'envs', 'musetalk-demo', 'bin', 'python'),
    '/opt/homebrew/Caskroom/miniconda/base/envs/musetalk-demo/bin/python',
    '/opt/homebrew/anaconda3/envs/musetalk-demo/bin/python',
    '/opt/miniconda3/envs/musetalk-demo/bin/python',
  ].filter(Boolean) as string[];
  return candidates.find(p => fs.existsSync(p));
}
function avatarDirectory(id: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid avatar ID.');
  const searchBases = process.env.MUSETALK_ROOT
    ? [path.join(museTalkRoot(), 'avatars', 'prepared')]
    : [
        path.join(REPO_ROOT, 'MuseTalk-Demo', 'avatars', 'prepared'),
        path.join(museTalkRoot(), 'avatars', 'prepared'),
        path.join(os.homedir(), 'Documents', 'MuseTalk-Demo', 'avatars', 'prepared'),
        path.join(os.homedir(), 'OneDrive', 'Documents', 'MuseTalk-Demo', 'avatars', 'prepared'),
      ];
  for (const base of searchBases) {
    const candidate = path.join(base, id);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(museTalkRoot(), 'avatars', 'prepared', id);
}

export function presenterAvatars() {
  const searchBases = process.env.MUSETALK_ROOT
    ? [path.join(museTalkRoot(), 'avatars', 'prepared')]
    : [
        path.join(REPO_ROOT, 'MuseTalk-Demo', 'avatars', 'prepared'),
        path.join(museTalkRoot(), 'avatars', 'prepared'),
        path.join(os.homedir(), 'Documents', 'MuseTalk-Demo', 'avatars', 'prepared'),
        path.join(os.homedir(), 'OneDrive', 'Documents', 'MuseTalk-Demo', 'avatars', 'prepared'),
      ];
  const seen = new Set<string>();
  const results = [];
  for (const base of searchBases) {
    if (!fs.existsSync(base)) continue;
    try {
      for (const id of fs.readdirSync(base)) {
        if (seen.has(id)) continue;
        try {
          const dir = path.join(base, id);
          const metaFile = path.join(dir, 'metadata.json');
          if (!fs.existsSync(metaFile)) continue;
          const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
          if (meta.preparation_status !== 'prepared' || !['source_25fps.mp4', 'coords.pkl', 'latents.pt', 'full_imgs'].every(f => fs.existsSync(path.join(dir, f)))) continue;
          const [width, height] = String(meta.resolution).split('x').map(Number);
          const hasTransparency = Boolean(avatarAlphaSource(dir) || fs.existsSync(path.join(dir, 'cycle-v1.mkv')));
          const isMouthless = meta.source_mode === 'mouthless' || Boolean(meta.mouthless);
          const tightCrop = meta.tight_crop || (hasTransparency ? { x: 25.6, y: 0, width: 47.0, height: 100 } : undefined);
          seen.add(id);
          results.push({
            id,
            name: String(meta.name || id),
            width,
            height,
            duration: meta.duration,
            hasTransparency,
            isMouthless,
            tightCrop,
            transparentPreviewUrl: hasTransparency ? mediaUrl(`presenter/avatar/${id}?transparent=1`) : undefined,
            previewUrl: mediaUrl(`presenter/avatar/${id}`),
          });
        } catch {}
      }
    } catch {}
  }
  return results;
}
export function presenterHealth() {
  const weights = ['musetalkV15/unet.pth', 'musetalkV15/musetalk.json', 'sd-vae/diffusion_pytorch_model.bin', 'whisper/pytorch_model.bin'];
  const bundled = fs.existsSync(path.join(museTalkRoot(), 'UPSTREAM.json'));
  if (bundled) weights.push('sd-vae/config.json', 'whisper/config.json', 'whisper/preprocessor_config.json', 'face_detection_yunet_2023mar.onnx');
  const missing = weights.filter(file => !fs.existsSync(path.join(museTalkRoot(), 'MuseTalk', 'models', file)));
  const installed = Boolean(presenterPythonPath() && fs.existsSync(path.join(museTalkRoot(), 'app', 'musetalk_service.py')) && !missing.length);
  return { installed, busy: presenterState.busy, avatars: presenterAvatars(), canPrepare: bundled && installed, missing,
    message: installed ? 'MuseTalk is installed. Choose or upload an avatar; lip-sync runs locally when rendering.' : 'MuseTalk setup is incomplete. Run npm run setup:presenter, or configure MUSETALK_ROOT and MUSETALK_PYTHON for an existing installation.' };
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
    path.join(museTalkRoot(), 'app', 'musetalk_service.py'),
    ...['UPSTREAM.json', 'MuseTalk/models/sources.json'].map(file => path.join(museTalkRoot(), file)).filter(file => fs.existsSync(file))].map(hashFile));
  return createHash('sha256').update(JSON.stringify(['presenter-v2', inputs, process.env.MUSETALK_DEVICE || 'auto', p.avatarId, p.silenceGate, p.silenceThresholdDb])).digest('hex');
}

async function releaseIdleGpu(signal: AbortSignal) {
  if (narrationBusy() || localMusicBusy() || presenterState.mediaRequests || presenterState.imageRequests || presenterState.speechRequests || presenterState.editingRequests) throw new Error('Wait for image, music and narration generation to finish before rendering a presenter.');
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
  signal.throwIfAborted();
}

function runWorker(request: string, signal: AbortSignal, progress: (stage: string, percent: number) => void): Promise<{ output_path?: string; avatar_id?: string }> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const python = presenterPythonPath();
    if (!python) { reject(new Error('MuseTalk Python environment is missing. Run npm run setup:presenter.')); return; }
    const child = spawn(python, ['-u', path.join(SERVER, 'musetalk', 'worker.py'), '--request', request], {
      windowsHide: true, cwd: museTalkRoot(), stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: [path.dirname(python), path.join(path.dirname(python), 'Library', 'bin'), process.env.PATH || process.env.Path || ''].join(path.delimiter),
        NUMBA_CACHE_DIR: path.join(os.tmpdir(), 'tubeflow-musetalk-numba'),
        PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' },
    });
    let lines = '', logs = '', workerError = '';
    let result: { output_path?: string; avatar_id?: string } | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let killing: Promise<void> | undefined;
    const cancel = () => {
      if (killing) return;
      // Cooperative fallback also works when Windows denies taskkill. The worker
      // checks this before each stage/batch and closes its FFmpeg encoder itself.
      try { fs.writeFileSync(path.join(path.dirname(request), 'cancel.request'), 'cancel'); } catch { /* Job may already be exiting. */ }
      killing = new Promise<void>(done => {
        if (process.platform === 'win32' && child.pid) {
          execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => done());
        } else {
          // Cooperative cancellation gets a short grace period, then terminate
          // a model load/kernel that has not reached another progress callback.
          killTimer = setTimeout(() => child.kill('SIGKILL'), 10000);
          killTimer.unref();
          done();
        }
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
            if (event.result) result = event.result;
            if (event.stage && !signal.aborted) progress(event.stage, Number(event.progress) || 0);
          } catch { /* Other model logging is not protocol data. */ }
        }
      }
    });
    child.stderr.on('data', chunk => { logs = (logs + String(chunk)).slice(-4000); });
    child.on('error', error => { signal.removeEventListener('abort', cancel); reject(error); });
    child.on('close', async code => {
      if (killTimer) clearTimeout(killTimer);
      signal.removeEventListener('abort', cancel);
      if (killing) await killing;
      if (signal.aborted) reject(new Error('Presenter generation cancelled.'));
      else if (code !== 0 || !result) reject(new Error(`MuseTalk failed: ${workerError || logs || `exit ${code}`}.`));
      else resolve(result);
    });
  });
}

type Preparation = { id: string; status: 'running' | 'done' | 'error'; stage: string; percent: number; avatarId: string; error?: string; controller: AbortController };
const preparations = new Map<string, Preparation>();
export function presenterPreparation(id: string) {
  const job = preparations.get(workspaceKey('presenter-preparation'));
  if (!job || job.id !== id) return undefined;
  const { controller: _controller, ...status } = job;
  return status;
}
export function cancelPresenterPreparation(id: string) {
  const job = preparations.get(workspaceKey('presenter-preparation'));
  if (!job || job.id !== id) throw new Error('Avatar preparation not found.');
  if (job.status === 'running') job.controller.abort();
}
export function preparePresenterAvatar(bytes: Buffer, filename: string, name: string) {
  if (!presenterHealth().canPrepare) throw new Error('Install the bundled MuseTalk engine before preparing an avatar.');
  const ext = path.extname(filename).toLowerCase();
  if (!['.mp4', '.mov', '.webm', '.mkv', '.png', '.jpg', '.jpeg'].includes(ext)) throw new Error('Choose an MP4, MOV, WebM, MKV, PNG or JPEG.');
  if (!bytes.length || bytes.length > 40 * 1024 * 1024) throw new Error('Avatar uploads must be between 1 byte and 40 MB.');
  if (presenterState.busy || narrationBusy() || localMusicBusy() || presenterState.mediaRequests || presenterState.editingRequests) throw new Error('Wait for active media generation to finish.');
  const id = randomUUID(), avatarId = `avatar_${id.replace(/-/g, '')}`;
  const controller = new AbortController();
  const job: Preparation = { id, avatarId, controller, status: 'running', stage: 'Preparing avatar', percent: 0 };
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tubeflow-avatar-'));
  try {
    fs.writeFileSync(path.join(work, `source${ext}`), bytes);
    fs.writeFileSync(path.join(work, 'request.json'), JSON.stringify({ action: 'prepare', root: museTalkRoot(), work,
      source: path.join(work, `source${ext}`), avatarId, name: name.trim().slice(0, 100) || path.basename(filename, ext), seconds: 10 }));
  } catch (error) { fs.rmSync(work, { recursive: true, force: true }); throw error; }
  const key = workspaceKey('presenter-preparation');
  preparations.set(key, job);
  presenterState.busy = true;
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30 * 60 * 1000)]);
  void (async () => {
    try {
      await releaseIdleGpu(signal);
      const result = await runWorker(path.join(work, 'request.json'), signal, (stage, percent) => { job.stage = stage; job.percent = percent; });
      if (result.avatar_id !== avatarId || !presenterAvatars().some(a => a.id === avatarId)) throw new Error('MuseTalk returned an incomplete avatar.');
      job.status = 'done'; job.stage = 'Avatar ready'; job.percent = 100;
    } catch (error) {
      job.status = 'error'; job.error = signal.aborted ? 'Avatar preparation cancelled.' : error instanceof Error ? error.message : 'Avatar preparation failed.';
      // The ID belongs only to this upload. A cancellation just after the
      // worker's final rename must not leave an apparently successful avatar.
      fs.rmSync(path.join(museTalkRoot(), 'avatars', 'prepared', avatarId), { recursive: true, force: true });
    } finally {
      presenterState.busy = false;
      fs.rmSync(work, { recursive: true, force: true });
      fs.rmSync(path.join(museTalkRoot(), 'avatars', 'prepared', `.prepare-${avatarId}`), { recursive: true, force: true });
    }
  })();
  return presenterPreparation(id)!;
}

export async function generatePresenter(scriptId: string, audio: string, settings: PresenterSettings, signal: AbortSignal, progress: (stage: string, percent: number) => void) {
  const p = validatePresenter(settings);
  if (!safeSegment(scriptId)) throw new Error('Invalid script ID.');
  if (!presenterHealth().installed) throw new Error(presenterHealth().message);
  if (!presenterAvatars().some(a => a.id === p.avatarId)) throw new Error('Prepared avatar is missing or incomplete. Choose another avatar.');
  if (p.style === 'transparent' && !avatarAlphaSource(avatarDirectory(p.avatarId)) && !fs.existsSync(containedFile(avatarDirectory(p.avatarId), 'cycle-v1.mkv'))) throw new Error('Transparent asset is missing. Refresh avatars or re-upload the transparent original in MuseTalk.');
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
    const metaFile = path.join(avatarDirectory(p.avatarId), 'metadata.json');
    let isMouthless = false;
    try {
      const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      isMouthless = meta.source_mode === 'mouthless' || Boolean(meta.mouthless);
    } catch {}
    const silenceGate = isMouthless ? false : p.silenceGate;
    const request = containedFile(work, 'request.json');
    fs.writeFileSync(request, JSON.stringify({ root: museTalkRoot(), work, audio, avatarId: p.avatarId,
      batchSize: 8, silenceGate, silenceThresholdDb: p.silenceThresholdDb }));
    const { output_path: output } = await runWorker(request, signal, progress);
    if (!output) throw new Error('MuseTalk did not return a presenter video.');
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
  const graph = `${alphaGraph}${alpha ? '[cutout]' : '[1:v]'}setpts=PTS-STARTPTS,${crop},scale=${geo.width}:${geo.height},setsar=1,fps=30,format=rgba${key},tpad=stop_mode=clone:stop_duration=0.12[p];[0:v][p]overlay=x=${geo.x}:y=H-h-${geo.bottom}:eof_action=pass[v]`;
  const output = base.replace(/\.mp4$/, '.presenter.partial.mp4');
  try {
    await runMedia('ffmpeg', ['-v', 'error', '-y', '-reinit_filter', '0', '-i', base, '-i', source, ...(alpha ? ['-stream_loop', '-1', '-i', alpha] : []), '-filter_complex_threads', '1', '-filter_complex', graph,
      '-map', '[v]', '-map', '0:a:0', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
      '-c:a', 'copy', '-t', String(duration), '-movflags', '+faststart', output], signal);
    signal?.throwIfAborted();
    fs.renameSync(output, base);
  } finally { fs.rmSync(output, { force: true }); }
}
