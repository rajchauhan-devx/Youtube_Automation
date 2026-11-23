import { Router } from 'express';
import { store } from '../services/store.js';
import { modelCredential } from '../services/model-json.js';
import { isLocalModel } from '../services/local-models.js';
import { currentWorkspace, workspaceContext } from '../services/workspace.js';
import { syncTopicNotes } from '../services/topic-notes.js';
import { validateScenePlan } from '../services/scene-plan.js';
import { normalizeWritersRoomOptions, runWritersRoom } from '../services/editorial/writers-room.js';
import type { WritersRoomJob, WritersRoomModels, WritersRoomOptions } from '../services/editorial/writers-room-types.js';
import type { FiveActRetentionStoryMap } from '../services/editorial/documentary-topic-vetter.js';
import {
  createWritersRoomJob,
  latestWritersRoomJob,
  listWritersRoomJobs,
  readWritersRoomJob,
  saveWritersRoomJob,
  writersRoomJobActive,
} from '../services/writers-room-jobs.js';
import {
  buildWritersRoomPatch,
  currentWritersRoomPlan,
  hasGeneratedMedia,
  writersRoomPlanHash,
} from '../services/writers-room-apply.js';

export const writersRoomRouter = Router();

const activeJobs = new Map<string, AbortController>();

interface JobContext {
  channelName?: string;
  channelGuidance?: string;
  template?: string;
  research?: string;
  storyMap?: FiveActRetentionStoryMap;
}

function modelReady(model: string, key: string): boolean {
  return Boolean(key) || isLocalModel(model);
}

function modelsFromRequest(body: Record<string, unknown>, script: any): WritersRoomModels {
  const fallback = typeof script.model === 'string' && script.model.trim() ? script.model.trim() : 'gemini-3.6-flash';
  const critic = typeof body.criticModel === 'string' && body.criticModel.trim() ? body.criticModel.trim() : fallback;
  const fixer = typeof body.fixerModel === 'string' && body.fixerModel.trim() ? body.fixerModel.trim() : critic;
  const freshEyes = typeof body.freshEyesModel === 'string' && body.freshEyesModel.trim() ? body.freshEyesModel.trim() : undefined;
  return { critic, fixer, ...(freshEyes ? { freshEyes } : {}) };
}

function keysFor(models: WritersRoomModels, req: Parameters<typeof modelCredential>[1]) {
  return {
    critic: modelCredential(models.critic, req),
    fixer: modelCredential(models.fixer, req),
    ...(models.freshEyes ? { freshEyes: modelCredential(models.freshEyes, req) } : {}),
  };
}

function contextFromScript(script: any): JobContext {
  const notes = syncTopicNotes();
  const prompts = Array.isArray(script.prompts) ? script.prompts as { content?: unknown }[] : [];
  const retentionPlan = script.retentionPlan as { storyMap?: FiveActRetentionStoryMap } | undefined;
  const vettedTopic = script.vettedTopic as { storyMap?: FiveActRetentionStoryMap } | undefined;
  return {
    channelName: notes.name,
    channelGuidance: notes.guidance,
    template: prompts.map(prompt => typeof prompt.content === 'string' ? prompt.content : '').filter(Boolean).join('\n\n'),
    research: typeof script.researchData === 'string' ? script.researchData : '',
    storyMap: vettedTopic?.storyMap || retentionPlan?.storyMap,
  };
}

async function executeJob(input: {
  jobId: string;
  plan: Parameters<typeof runWritersRoom>[0]['scenePlan'];
  models: WritersRoomModels;
  apiKeys: { critic: string; fixer: string; freshEyes?: string };
  options: WritersRoomOptions;
  decisions: Record<string, 'accepted' | 'rejected'>;
  context: JobContext;
  signal: AbortSignal;
  initialPasses?: Parameters<typeof runWritersRoom>[0]['initialPasses'];
  initialModelCalls?: number;
}): Promise<void> {
  const job = readWritersRoomJob(input.jobId);
  if (!job) return;
  job.status = 'running';
  job.startedAt = job.startedAt || new Date().toISOString();
  job.finishedAt = undefined;
  job.cancelRequested = false;
  job.error = undefined;
  saveWritersRoomJob(job);

  try {
    const result = await runWritersRoom({
      scenePlan: input.plan,
      ...input.context,
      models: input.models,
      apiKeys: input.apiKeys,
      options: input.options,
      decisions: input.decisions,
      initialPasses: input.initialPasses,
      initialModelCalls: input.initialModelCalls,
      signal: input.signal,
      onProgress: (progress, passes) => {
        const current = readWritersRoomJob(input.jobId);
        if (!current) return;
        current.progress = progress;
        current.passes = passes;
        saveWritersRoomJob(current);
      },
    });
    const final = readWritersRoomJob(input.jobId);
    if (!final) return;
    final.status = result.status === 'approved' ? 'approved' : result.status === 'cancelled' ? 'cancelled' : 'needs_review';
    final.result = result;
    final.passes = result.passes;
    final.findings = result.remainingFindings;
    final.progress = {
      pass: result.passes.length,
      totalPasses: result.passes.length,
      phase: 'done',
      message: result.stopReason,
      percent: 100,
      criticStatus: {},
    };
    final.finishedAt = new Date().toISOString();
    saveWritersRoomJob(final);
  } catch (error) {
    const final = readWritersRoomJob(input.jobId);
    if (!final) return;
    const cancelled = input.signal.aborted;
    final.status = cancelled ? 'cancelled' : 'error';
    final.error = cancelled ? undefined : (error instanceof Error ? error.message : 'Writers’ Room failed');
    final.progress = {
      ...final.progress,
      phase: 'done',
      message: cancelled ? 'Cancelled by user.' : (final.error || 'Writers’ Room failed'),
      percent: 100,
    };
    final.finishedAt = new Date().toISOString();
    saveWritersRoomJob(final);
  }
}

function startInBackground(input: Omit<Parameters<typeof executeJob>[0], 'signal'>): void {
  const controller = new AbortController();
  activeJobs.set(input.jobId, controller);
  const workspace = currentWorkspace();
  void workspaceContext.run(workspace, () => executeJob({ ...input, signal: controller.signal }))
    .catch(error => {
      const job = readWritersRoomJob(input.jobId);
      if (!job) return;
      job.status = 'error';
      job.error = error instanceof Error ? error.message : 'Writers’ Room failed';
      saveWritersRoomJob(job);
    })
    .finally(() => activeJobs.delete(input.jobId));
}

writersRoomRouter.post('/start', async (req, res) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const script = store.getById<any>('scripts', typeof body.scriptId === 'string' ? body.scriptId : '');
  if (!script) { res.status(404).json({ error: 'Script not found in this profile' }); return; }

  const source = body.scenePlan || currentWritersRoomPlan(script);
  if (!source) { res.status(400).json({ error: 'Extract the scene plan before starting the Writers’ Room.' }); return; }
  let plan;
  try { plan = validateScenePlan(source); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid scene plan' }); return; }

  if (hasGeneratedMedia(script) && !body.force) {
    res.status(409).json({ error: 'Media has already been generated for this script. Clear generated media or start a new script before refining.' });
    return;
  }

  const existing = listWritersRoomJobs(script.id).find(writersRoomJobActive);
  if (existing) {
    res.status(409).json({ error: 'A Writers’ Room run is already active for this script.', jobId: existing.id });
    return;
  }

  const models = modelsFromRequest(body, script);
  const apiKeys = keysFor(models, req);
  if (!modelReady(models.critic, apiKeys.critic) || !modelReady(models.fixer, apiKeys.fixer) || (models.freshEyes && !modelReady(models.freshEyes, apiKeys.freshEyes || ''))) {
    res.status(401).json({ error: 'Configure the selected model’s API key in Settings.' });
    return;
  }

  const options = normalizeWritersRoomOptions(typeof body.options === 'object' && body.options ? body.options as WritersRoomOptions : undefined);
  const job = createWritersRoomJob({
    scriptId: script.id,
    request: {
      models,
      options,
      sourcePlanHash: writersRoomPlanHash(plan),
      sourcePlanTitle: plan.title,
    },
  });
  saveWritersRoomJob(job);

  startInBackground({
    jobId: job.id,
    plan,
    models,
    apiKeys,
    options,
    decisions: {},
    context: contextFromScript(script),
  });

  res.status(202).json({ jobId: job.id, job });
});

writersRoomRouter.get('/status/:jobId', (req, res) => {
  try {
    const job = readWritersRoomJob(req.params.jobId);
    if (!job) { res.status(404).json({ error: 'Writers’ Room job not found' }); return; }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ job });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid job ID' });
  }
});

writersRoomRouter.get('/latest/:scriptId', (req, res) => {
  const job = latestWritersRoomJob(req.params.scriptId);
  if (!job) { res.status(404).json({ error: 'No Writers’ Room run found for this script' }); return; }
  res.setHeader('Cache-Control', 'no-store');
  res.json({ job });
});

writersRoomRouter.post('/cancel/:jobId', (req, res) => {
  try {
    const job = readWritersRoomJob(req.params.jobId);
    if (!job) { res.status(404).json({ error: 'Writers’ Room job not found' }); return; }
    job.cancelRequested = true;
    saveWritersRoomJob(job);
    const controller = activeJobs.get(job.id);
    if (controller) controller.abort();
    else if (writersRoomJobActive(job)) {
      job.status = 'cancelled';
      job.finishedAt = new Date().toISOString();
      job.progress = { ...job.progress, phase: 'done', message: 'Cancelled by user.', percent: 100 };
      saveWritersRoomJob(job);
    }
    res.json({ job: readWritersRoomJob(job.id) || job });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid job ID' });
  }
});

writersRoomRouter.post('/decision/:jobId', (req, res) => {
  try {
    const job = readWritersRoomJob(req.params.jobId);
    if (!job) { res.status(404).json({ error: 'Writers’ Room job not found' }); return; }
    const { findingId, decision } = (req.body || {}) as { findingId?: unknown; decision?: unknown };
    if (typeof findingId !== 'string' || (decision !== 'accepted' && decision !== 'rejected')) {
      res.status(400).json({ error: 'Provide a findingId and decision (accepted or rejected).' });
      return;
    }
    job.decisions[findingId] = decision;
    saveWritersRoomJob(job);
    res.json({ job });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid job ID' });
  }
});

writersRoomRouter.post('/continue/:jobId', (req, res) => {
  try {
    const job = readWritersRoomJob(req.params.jobId);
    if (!job) { res.status(404).json({ error: 'Writers’ Room job not found' }); return; }
    if (writersRoomJobActive(job)) { res.status(409).json({ error: 'This Writers’ Room run is still active.' }); return; }
    if (!job.result?.finalScenePlan) { res.status(409).json({ error: 'This run has no draft to continue from.' }); return; }
    const script = store.getById<any>('scripts', job.scriptId);
    if (!script) { res.status(404).json({ error: 'Script not found in this profile' }); return; }

    const models = job.request.models;
    const apiKeys = keysFor(models, req);
    if (!modelReady(models.critic, apiKeys.critic) || !modelReady(models.fixer, apiKeys.fixer)) {
      res.status(401).json({ error: 'Configure the selected model’s API key in Settings.' });
      return;
    }

    const additionalPasses = Math.max(1, Math.min(3, Number((req.body || {}).additionalPasses) || 2));
    const options: WritersRoomOptions = {
      ...job.request.options,
      maxPasses: job.passes.length + additionalPasses,
      maxModelCalls: Math.max(job.request.options.maxModelCalls || 16, (job.result.modelCalls || 0) + additionalPasses * 4 + 1),
      freshEyes: false,
    };
    job.status = 'queued';
    job.finishedAt = undefined;
    job.cancelRequested = false;
    saveWritersRoomJob(job);

    startInBackground({
      jobId: job.id,
      plan: job.result.finalScenePlan,
      models,
      apiKeys,
      options,
      decisions: job.decisions,
      context: contextFromScript(script),
      initialPasses: job.passes,
      initialModelCalls: job.result.modelCalls,
    });

    res.status(202).json({ jobId: job.id, job: readWritersRoomJob(job.id) || job });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid job ID' });
  }
});

writersRoomRouter.post('/apply/:jobId', (req, res) => {
  try {
    const job = readWritersRoomJob(req.params.jobId);
    if (!job) { res.status(404).json({ error: 'Writers’ Room job not found' }); return; }
    if (writersRoomJobActive(job)) { res.status(409).json({ error: 'Wait for this Writers’ Room run to finish before applying it.' }); return; }
    if (!job.result?.finalScenePlan) { res.status(409).json({ error: 'This run has no final script to apply.' }); return; }
    if (job.status !== 'approved' && !(req.body || {}).force) {
      res.status(409).json({ error: 'This run needs human review. Apply anyway to use the current draft.' });
      return;
    }

    const script = store.getById<any>('scripts', job.scriptId);
    if (!script) { res.status(404).json({ error: 'Script not found in this profile' }); return; }

    const current = currentWritersRoomPlan(script);
    if (current && writersRoomPlanHash(current) !== job.request.sourcePlanHash && !(req.body || {}).force) {
      res.status(409).json({ error: 'The script changed after this run started. Start a new run or apply anyway.' });
      return;
    }
    if (hasGeneratedMedia(script) && !(req.body || {}).force) {
      res.status(409).json({ error: 'Media has already been generated. Clear generated media before applying the refined script.' });
      return;
    }

    const patch = buildWritersRoomPatch(script, job);
    const updated = { ...script, ...patch };
    store.add('scripts', updated);
    res.json({ script: updated, patch });
  } catch (error) {
    res.status(422).json({ error: error instanceof Error ? error.message : 'Could not apply the Writers’ Room draft.' });
  }
});

export type { WritersRoomJob };
