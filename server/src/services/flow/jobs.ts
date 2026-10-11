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
  dryRun?: boolean;
}

export type FlowJobModel = FlowModel;

export interface FlowJob extends FlowJobSpec {
  id: string;
  state: FlowJobState;
  model: FlowModel;
  aspect: 'portrait' | 'landscape';
  duration: number;
  dryRun: boolean;
  cost: number;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  stage: string;
  progress: number;
  error?: string;
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

function wrapPrompt(prompt: string, model: FlowModel, aspect: string, duration: number): string {
  // Flow is agent-first: imperative wrapping generates directly instead of
  // asking clarifying questions (which stalls automation with 0 output).
  return `Generate one ${duration}-second ${aspect === 'portrait' ? 'vertical 9:16' : 'landscape 16:9'} video with ${model}, no questions, no clarifications: ${prompt.trim()}`;
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
  const comboError = validCombo(model, duration);
  if (comboError) throw new Error(comboError);
  const dryRun = spec.dryRun !== false; // default safe: prepare only, 0 credits
  const cost = dryRun ? 0 : COSTS[model](duration);
  const idempotencyKey = crypto.createHash('sha256')
    .update(JSON.stringify([spec.scriptId, spec.sceneIndex, prompt, model, aspect, duration])).digest('hex');
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
      model, aspect, duration, dryRun, cost, idempotencyKey,
      createdAt: now, updatedAt: now,
      stage: 'Dry run: prompt prepared, 0 credits spent',
      progress: 100,
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

  const now = new Date().toISOString();
  const job: FlowJob = {
    ...spec,
    id: `flow_${crypto.randomUUID()}`,
    state: 'queued',
    model, aspect, duration, dryRun, cost, idempotencyKey,
    createdAt: now, updatedAt: now,
    stage: 'Queued: waiting for browser worker',
    progress: 0,
    preview: { promptWrapped: wrapPrompt(prompt, model, aspect, duration), warnings: [] },
  };
  spend.set(spec.scriptId, committed + cost);
  jobs.set(job.id, job);

  // Live browser generation lands here next (real-click worker + UI map).
  // Queued explicitly so the failure mode is visible, not a silent no-op.
  job.error = 'Live generation worker is not wired yet. Use dryRun to validate, then run from the Flow tab manually until the worker lands.';
  job.state = 'error';
  job.updatedAt = new Date().toISOString();
  return job;
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
