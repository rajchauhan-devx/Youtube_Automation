import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { flowProfileDir, flowStatus } from './profile.js';

export type FlowJobState = 'queued' | 'running' | 'done' | 'error' | 'cancelled';
export type FlowModel = 'veo-3.1-lite' | 'veo-3.1-fast' | 'veo-3.1-quality' | 'omni-flash';

export interface FlowJobSpec {
  scriptId: string;
  sceneIndex: number;
  prompt: string;
  model?: FlowJobModel;
  aspect?: 'portrait' | 'landscape';
  duration?: number;
  resolution?: '720p' | '1080p';
  dryRun?: boolean;
  referenceImagePath?: string;
}

export function findReferenceImageForScene(scriptId: string, sceneIndex: number): string | undefined {
  const rootData = path.resolve(flowProfileDir(), '..', '..');
  const pad = String(sceneIndex).padStart(2, '0');
  interface Candidate { filePath: string; mtime: number; isExactScene: boolean; isSceneZero: boolean }
  const candidates: Candidate[] = [];

  function search(dir: string): void {
    if (!fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name === scriptId && (dir.endsWith('generated') || dir.includes('generated'))) {
            try {
              const files = fs.readdirSync(full);
              for (const f of files) {
                const ext = path.extname(f).toLowerCase();
                if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
                  const filePath = path.join(full, f);
                  const stat = fs.statSync(filePath);
                  const isExactScene = f.startsWith('image-' + pad + '-') || f.startsWith('ref-frame-' + pad + '-') || f.startsWith('import_' + sceneIndex + '_');
                  const isSceneZero = f.startsWith('image-00-') || f.startsWith('ref-frame-00-') || f.startsWith('import_0_');
                  candidates.push({ filePath, mtime: stat.mtimeMs, isExactScene, isSceneZero });
                }
              }
            } catch {}
          } else if (!ent.name.startsWith('.') && ent.name !== 'node_modules') {
            search(full);
          }
        }
      }
    } catch {}
  }

  search(rootData);
  const exact = candidates.filter(c => c.isExactScene).sort((a, b) => b.mtime - a.mtime);
  if (exact.length) return exact[0].filePath;
  const master = candidates.filter(c => c.isSceneZero).sort((a, b) => b.mtime - a.mtime);
  if (master.length) return master[0].filePath;
  return undefined;
}

export type FlowJobModel = FlowModel;

export interface StepLog {
  step: string;
  at: string;
  shot?: string;
  detail?: string;
}

export interface FlowJob extends FlowJobSpec {
  id: string;
  state: FlowJobState;
  model: FlowModel;
  aspect: 'portrait' | 'landscape';
  duration: number;
  resolution: '720p' | '1080p';
  dryRun: boolean;
  cost: number;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  stage: string;
  progress: number;
  error?: string;
  overseerCode?: string;
  log: StepLog[];
  preview?: { promptWrapped: string; warnings: string[] };
  result?: { downloadId: string; bytes: number };
}

// Credit costs in Flow credits (Pro plan approximations from community tooling).
const COSTS: Record<FlowModel, (duration: number) => number> = {
  'veo-3.1-lite': () => 10,
  'veo-3.1-fast': (duration) => (duration >= 8 ? 20 : 20),
  'veo-3.1-quality': () => 100,
  'omni-flash': (duration) => (duration >= 8 ? 30 : 15),
};

function validCombo(model: FlowModel, duration: number): string | null {
  if (model === 'veo-3.1-lite' && duration !== 8) return 'Veo 3.1 Lite is 8s-only on the Pro plan.';
  if (model === 'omni-flash' && (duration < 4 || duration > 10)) return 'Omni Flash supports 4-10s.';
  if (duration < 2 || duration > 12) return 'Duration must be 2-12s for single-scene jobs.';
  return null;
}

const FLOW_TWO_D_PATTERN =
  /\b(2d\s+animated|2d\s+animation|2d\s+cartoon|animated[- ]series\s+frame|cel[- ]shad(?:ed|ing)|charcoal\s+(?:outlines|linework)|matte\s+flat\s+colou?r|flat\s+colou?r\s+fills|graphic\s+novel|hand[- ]drawn\s+2d)\b/i;

function wrapPrompt(prompt: string, model: FlowModel, aspect: string, duration: number): string {
  // Flow is agent-first: imperative wrapping generates directly instead of
  // asking clarifying questions (which stalls automation with 0 output).
  const trimmed = prompt.trim();
  const styleAnchor = FLOW_TWO_D_PATTERN.test(trimmed)
    ? ' 2D flat cel-shaded cartoon animated video (bold black charcoal ink outlines, flat matte color fills, two-step cel shading, 2D graphic novel animated series style, no 3D CGI, no photorealism)'
    : ' video';
  return `Generate one ${duration}-second ${aspect === 'portrait' ? 'vertical 9:16' : 'landscape 16:9'}${styleAnchor} with ${model}, no questions, no clarifications: ${trimmed}`;
}

const jobs = new Map<string, FlowJob>();
const controllers = new Map<string, AbortController>();
// Per-episode spend guard: scriptId -> credits committed this process lifetime.
const spend = new Map<string, number>();

export function flowJobStatus(id: string): FlowJob | undefined {
  return jobs.get(id);
}

export function flowJobsFor(scriptId: string): FlowJob[] {
  return [...jobs.values()].filter((job) => job.scriptId === scriptId);
}

export async function startFlowJob(spec: FlowJobSpec): Promise<FlowJob> {
  const active = [...jobs.values()].some((job) => job.state === 'queued' || job.state === 'running');
  if (active) throw new Error('A Flow job is already running. Wait or cancel it first (one profile = one writer).');
  const prompt = (spec.prompt || '').trim();
  if (prompt.length < 10) throw new Error('Prompt is too short. Paste the full scene videoPrompt (80+ words ideal).');
  if (prompt.length > 8000) throw new Error('Prompt exceeds 8000 characters.');
  if (!Number.isInteger(spec.sceneIndex) || spec.sceneIndex < 0) throw new Error('Invalid scene index.');
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(spec.scriptId)) throw new Error('Invalid script ID.');

  const model: FlowModel = spec.model || 'veo-3.1-fast';
  const aspect = spec.aspect || 'portrait';
  const duration = Math.round(spec.duration || 8);
  const resolution: '720p' | '1080p' = spec.resolution === '1080p' ? '1080p' : '720p';
  const comboError = validCombo(model, duration);
  if (comboError) throw new Error(comboError);
  const dryRun = spec.dryRun !== false; // default safe: prepare only, 0 credits
  const cost = dryRun ? 0 : COSTS[model](duration);
  const idempotencyKey = crypto.createHash('sha256')
    .update(JSON.stringify([spec.scriptId, spec.sceneIndex, prompt, model, aspect, duration, resolution])).digest('hex');
  const existing = [...jobs.values()].find((job) => job.idempotencyKey === idempotencyKey && job.state === 'done' && job.result);
  if (existing) return existing; // idempotent retry returns the file, never re-bills

  const status = await flowStatus();
  // Dry runs validate prompt/model/duration/budget only: 0 credits, no browser,
  // no login needed — so they work before Chromium is even downloaded.
  if (dryRun) {
    const now = new Date().toISOString();
    const job: FlowJob = {
      ...spec,
      id: `flow_${crypto.randomUUID()}`,
      state: 'done',
      model, aspect, duration, resolution, dryRun, cost, idempotencyKey,
      createdAt: now, updatedAt: now,
      stage: 'Dry run: prompt prepared, 0 credits spent',
      progress: 100,
      log: [],
      preview: { promptWrapped: wrapPrompt(prompt, model, aspect, duration), warnings: [] },
    };
    jobs.set(job.id, job);
    return job;
  }
  if (!status.installed || !status.browsersInstalled) throw new Error(status.note);
  if (!status.profileReady) {
    throw new Error('No Flow login in this profile yet. GET /api/flow/login-hint, sign in once (headed), then retry.');
  }
  const budget = status.creditBudgetPerEpisode;
  const committed = spend.get(spec.scriptId) || 0;
  if (committed + cost > budget) {
    throw new Error(`Episode budget exceeded: ${committed + cost} > ${budget} credits. Raise FLOW_CREDIT_BUDGET_PER_EPISODE or pick Lite/Fast.`);
  }

  const resolvedRef = spec.referenceImagePath && fs.existsSync(spec.referenceImagePath)
    ? spec.referenceImagePath
    : findReferenceImageForScene(spec.scriptId, spec.sceneIndex);

  const now = new Date().toISOString();
  const job: FlowJob = {
    ...spec,
    referenceImagePath: resolvedRef,
    id: `flow_${crypto.randomUUID()}`,
    state: 'queued',
    model, aspect, duration, resolution, dryRun, cost, idempotencyKey,
    createdAt: now, updatedAt: now,
    stage: 'Queued: waiting for browser worker',
    progress: 0,
    log: [],
    preview: { promptWrapped: wrapPrompt(prompt, model, aspect, duration), warnings: [] },
  };
  spend.set(spec.scriptId, committed + cost);
  jobs.set(job.id, job);

  // Async: the request returns 202 immediately; the client polls the job.
  const controller = new AbortController();
  controllers.set(job.id, controller);
  void runLive(job.id, controller.signal).catch((err) => console.error('Flow job run error:', err));
  return job;
}

async function runLive(jobId: string, signal: AbortSignal): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;
  job.state = 'running';
  job.stage = 'Launching persistent browser profile';
  job.progress = 3;
  job.updatedAt = new Date().toISOString();
  try {
    const { runLiveGeneration } = await import('./worker.js');
    const status = await flowStatus();
    const result = await runLiveGeneration({
      jobId: job.id,
      prompt: job.prompt,
      promptWrapped: job.preview?.promptWrapped || wrapPrompt(job.prompt, job.model, job.aspect, job.duration),
      projectUrl: status.projectUrl,
      aspect: job.aspect,
      duration: job.duration,
      model: job.model,
      resolution: job.resolution,
      referenceImagePath: job.referenceImagePath,
      signal,
      onStage: (stage, progress) => {
        const current = jobs.get(jobId);
        if (!current) return;
        current.stage = stage;
        current.progress = progress;
        current.updatedAt = new Date().toISOString();
      },
      logStep: (entry) => {
        const current = jobs.get(jobId);
        if (!current) return;
        current.log.push(entry);
        current.updatedAt = new Date().toISOString();
      },
    });
    const current = jobs.get(jobId);
    if (!current) return;
    current.state = 'done';
    current.stage = 'Downloaded from Flow — import into the scene to finish';
    current.progress = 100;
    current.result = { downloadId: current.id, bytes: result.bytes };
    current.updatedAt = new Date().toISOString();
  } catch (error) {
    const current = jobs.get(jobId);
    if (!current) return;
    if (signal.aborted && (current.state === 'cancelled' || error instanceof Error && error.name === 'AbortError')) {
      current.state = 'cancelled';
      current.stage = 'Cancelled by user.';
    } else {
      // Credits may already be spent (render started). Spend stays committed;
      // idempotent retry returns the file without re-billing once it exists.
      current.state = 'error';
      current.stage = 'Flow generation failed — see error + step log';
      current.error = error instanceof Error ? error.message : String(error);
      current.overseerCode = (error as { overseerCode?: string }).overseerCode;
    }
    current.updatedAt = new Date().toISOString();
  } finally {
    controllers.delete(jobId);
  }
}

export async function cancelFlowJob(id: string): Promise<FlowJob> {
  const job = jobs.get(id);
  if (!job) throw new Error('Flow job not found.');
  controllers.get(id)?.abort();
  controllers.delete(id);
  if (job.state === 'queued' || job.state === 'running') {
    job.state = 'cancelled';
    job.stage = 'Cancelled by user. No further credits will be spent.';
    if (!job.dryRun) spend.set(job.scriptId, Math.max(0, (spend.get(job.scriptId) || 0) - job.cost));
  }
  job.updatedAt = new Date().toISOString();
  return job;
}

export function flowDownloadsDir(): string {
  const dir = path.join(flowProfileDir(), '..', 'downloads');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Contained download resolution for the route: only <jobId>.mp4 inside the
// downloads dir, nothing else on disk is reachable.
export function resolveFlowDownload(downloadId: string): string | null {
  if (!/^flow_[A-Za-z0-9-]{1,80}$/.test(downloadId)) return null;
  const job = jobs.get(downloadId);
  if (!job || job.state !== 'done' || !job.result) return null;
  const dir = flowDownloadsDir();
  const file = path.resolve(dir, `${downloadId}.mp4`);
  if (path.dirname(file) !== path.resolve(dir) || !fs.existsSync(file)) return null;
  return file;
}
