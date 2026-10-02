import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { generatedDir } from './workspace.js';
import { containedFile } from './paths.js';
import { runMedia } from './media-process.js';

// Client for a user-hosted Colab/Cloudflare media worker (image + video only).
// Protocol mirrors the reference generate.py client:
//   POST {base}/generate  {prompt, num_frames, steps} -> {job_id}
//   GET  {base}/status/{job} -> {status: queued|running|done|error, ...}
//   GET  {base}/result/{job} -> result file stream (mp4, or still image)
export interface ColabConfig { baseUrl: string; apiKey: string }
export interface ColabJobOptions {
  prompt: string;
  numFrames: number;
  steps: number;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  timeoutMs?: number;
  onProgress?: (status: string) => void;
}

const DEFAULT_POLL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

export function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Colab API URL is required.');
  const url = value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) throw new Error('Colab API URL must start with http:// or https://.');
  return url;
}

// Browser-supplied key/URL (per-PC localStorage, sent as headers) wins;
// server/.env is the shared fallback. Nothing here touches LLM/script keys.
export function resolveColabConfig(req: { headers?: Record<string, any> }): ColabConfig {
  const headerUrl = req.headers?.['x-colab-url'];
  const headerKey = req.headers?.['x-colab-key'];
  const baseUrl = typeof headerUrl === 'string' && headerUrl.trim() ? headerUrl : process.env.COLAB_MEDIA_API_URL || '';
  const apiKey = typeof headerKey === 'string' && headerKey ? headerKey : process.env.COLAB_MEDIA_API_KEY || '';
  if (!baseUrl.trim()) throw new Error('Set your Colab API URL (Setup tab) or COLAB_MEDIA_API_URL in server/.env.');
  if (!apiKey) throw new Error('Set your Colab API key (Setup tab) or COLAB_MEDIA_API_KEY in server/.env.');
  return { baseUrl: normalizeBaseUrl(baseUrl), apiKey };
}

function colabError(status: number, body: string): Error {
  const detail = body.slice(0, 500).trim();
  if (status === 401 || status === 403) return new Error('Colab API rejected the key (HTTP 401/403). Check the API key.');
  if (status === 404) return new Error('Colab API endpoint not found (HTTP 404). Check the API URL.');
  return new Error(`Colab API error (HTTP ${status})${detail ? `: ${detail}` : ''}`);
}

export async function submitColabJob(config: ColabConfig, options: Pick<ColabJobOptions, 'prompt' | 'numFrames' | 'steps' | 'signal'>): Promise<string> {
  const { prompt, numFrames, steps, signal } = options;
  if (!prompt || typeof prompt !== 'string' || prompt.length > 20000) throw new Error('A text prompt of 1–20000 characters is required.');
  if (!Number.isInteger(numFrames) || numFrames < 1 || numFrames > 240) throw new Error('Frames must be 1–240.');
  if (!Number.isInteger(steps) || steps < 1 || steps > 150) throw new Error('Steps must be 1–150.');
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': config.apiKey },
      body: JSON.stringify({ prompt, num_frames: numFrames, steps }),
      signal,
    });
  } catch (error) {
    throw new Error(signal?.aborted ? 'Cancelled' : `Could not reach the Colab API: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw colabError(response.status, await response.text().catch(() => ''));
  const data = (await response.json().catch(() => null)) as { job_id?: unknown } | null;
  if (!data || typeof data.job_id !== 'string' || !data.job_id) throw new Error('Colab API did not return a job_id.');
  return data.job_id;
}

export async function pollColabJob(config: ColabConfig, jobId: string, options: Pick<ColabJobOptions, 'signal' | 'pollIntervalMs' | 'timeoutMs' | 'onProgress'> = {}): Promise<Record<string, any>> {
  const { signal, pollIntervalMs = DEFAULT_POLL_MS, timeoutMs = DEFAULT_TIMEOUT_MS, onProgress } = options;
  const started = Date.now();
  for (;;) {
    if (signal?.aborted) throw new Error('Cancelled');
    if (Date.now() - started > timeoutMs) throw new Error('Colab job timed out. The Colab worker may still finish it; retry later.');
    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}/status/${encodeURIComponent(jobId)}`, {
        headers: { 'X-API-Key': config.apiKey },
        signal,
      });
    } catch (error) {
      if (signal?.aborted) throw new Error('Cancelled');
      throw new Error(`Lost contact with the Colab API: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!response.ok) throw colabError(response.status, await response.text().catch(() => ''));
    const state = (await response.json().catch(() => null)) as { status?: unknown } & Record<string, any> | null;
    if (!state || typeof state.status !== 'string') throw new Error('Colab API returned an unreadable job status.');
    onProgress?.(state.status);
    if (state.status === 'done') return state;
    if (state.status === 'error') throw new Error(typeof state.error === 'string' && state.error ? `Colab job failed: ${state.error.slice(0, 500)}` : 'Colab job failed on the worker.');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, pollIntervalMs);
      signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Cancelled')); }, { once: true });
    });
  }
}

export async function downloadColabResult(config: ColabConfig, jobId: string, targetFile: string, signal?: AbortSignal): Promise<{ contentType: string; bytes: number }> {
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/result/${encodeURIComponent(jobId)}`, {
      headers: { 'X-API-Key': config.apiKey },
      signal,
    });
  } catch (error) {
    throw new Error(signal?.aborted ? 'Cancelled' : `Could not download the Colab result: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok || !response.body) throw colabError(response.status, await response.text().catch(() => ''));
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  const partial = `${targetFile}.partial`;
  try {
    await pipeline(Readable.fromWeb(response.body as any), fs.createWriteStream(partial));
    fs.renameSync(partial, targetFile);
  } finally {
    fs.rmSync(partial, { force: true });
  }
  const bytes = fs.statSync(targetFile).size;
  if (!bytes) { fs.rmSync(targetFile, { force: true }); throw new Error('Colab API returned an empty result file.'); }
  return { contentType: response.headers.get('content-type') || 'application/octet-stream', bytes };
}

export async function checkColabMedia(config: ColabConfig, timeoutMs = 15000): Promise<{ reachable: boolean; detail: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(config.baseUrl, { headers: { 'X-API-Key': config.apiKey }, signal: controller.signal });
    // Any HTTP answer proves the tunnel + worker are up; the root path itself carries no contract.
    await response.arrayBuffer().catch(() => null);
    return { reachable: true, detail: `Colab worker answered HTTP ${response.status}.` };
  } catch (error) {
    return { reachable: false, detail: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

export function colabDefaults() {
  const num = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    videoFrames: num(process.env.COLAB_VIDEO_FRAMES, 33),
    imageFrames: num(process.env.COLAB_IMAGE_FRAMES, 1),
    steps: num(process.env.COLAB_STEPS, 20),
  };
}

// Full video flow: submit -> poll -> save mp4 into this script's generated dir.
export async function generateColabVideoFile(args: {
  config: ColabConfig; scriptId: string; prompt: string; numFrames?: number; steps?: number;
  signal?: AbortSignal; onProgress?: (status: string) => void;
}): Promise<{ filename: string; bytes: number }> {
  const defaults = colabDefaults();
  const jobId = await submitColabJob(args.config, {
    prompt: args.prompt,
    numFrames: args.numFrames ?? defaults.videoFrames,
    steps: args.steps ?? defaults.steps,
    signal: args.signal,
  });
  await pollColabJob(args.config, jobId, { signal: args.signal, onProgress: args.onProgress });
  const filename = `colab_${Date.now()}_${jobId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 12)}.mp4`;
  const target = containedFile(generatedDir(), args.scriptId, filename);
  const { bytes } = await downloadColabResult(args.config, jobId, target, args.signal);
  return { filename, bytes };
}

// Image flow: single-frame job, then keep stills as-is or grab frame 0 from a clip.
export async function generateColabImageFile(args: {
  config: ColabConfig; scriptId: string; prompt: string; steps?: number;
  signal?: AbortSignal; onProgress?: (status: string) => void;
}): Promise<{ filename: string; bytes: number }> {
  const defaults = colabDefaults();
  const jobId = await submitColabJob(args.config, {
    prompt: args.prompt,
    numFrames: defaults.imageFrames,
    steps: args.steps ?? defaults.steps,
    signal: args.signal,
  });
  await pollColabJob(args.config, jobId, { signal: args.signal, onProgress: args.onProgress });
  const stamp = `colab_img_${Date.now()}_${jobId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 12)}`;
  const rawFile = containedFile(generatedDir(), args.scriptId, `${stamp}.bin`);
  const { contentType } = await downloadColabResult(args.config, jobId, rawFile, args.signal);
  const filename = `${stamp}.${/png/i.test(contentType) ? 'png' : /jpe?g/i.test(contentType) || /webp/i.test(contentType) ? 'png' : 'mp4'}`;
  const finalFile = containedFile(generatedDir(), args.scriptId, filename);
  try {
    if (filename.endsWith('.mp4')) {
      const pngFile = containedFile(generatedDir(), args.scriptId, `${stamp}.png`);
      await runMedia('ffmpeg', ['-v', 'error', '-y', '-i', rawFile, '-vframes', '1', pngFile], args.signal);
      fs.rmSync(rawFile, { force: true });
      return { filename: path.basename(pngFile), bytes: fs.statSync(pngFile).size };
    }
    fs.renameSync(rawFile, finalFile);
    return { filename, bytes: fs.statSync(finalFile).size };
  } finally {
    fs.rmSync(rawFile, { force: true });
  }
}
