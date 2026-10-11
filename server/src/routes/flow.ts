import { Router } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flowLoginSteps, flowStatus } from '../services/flow/profile.js';
import { getFlowCreditsInfo, updateFlowCredits } from '../services/flow/credits.js';
import { cancelFlowJob, flowJobStatus, flowJobsFor, resolveFlowDownload, startFlowJob } from '../services/flow/jobs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const flowRouter = Router();

// Read-only status: package/browsers/profile readiness. Never spends credits.
flowRouter.get('/status', async (_req, res) => {
  try {
    res.json(await flowStatus());
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Flow status failed' });
  }
});

// Current Google Flow credit balance and remaining estimated videos
flowRouter.get('/credits', (_req, res) => {
  try {
    res.json(getFlowCreditsInfo());
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Flow credits query failed' });
  }
});

// Update Google Flow credit balance and/or account email
flowRouter.post('/credits', (req, res) => {
  try {
    const { credits, account, tier, costPerVideo } = req.body || {};
    const numericCredits = typeof credits === 'number' ? credits : credits ? Number.parseInt(credits, 10) : undefined;
    const updated = updateFlowCredits(numericCredits, {
      account: typeof account === 'string' && account.trim() ? account.trim() : undefined,
      tier: typeof tier === 'string' && tier.trim() ? tier.trim() : undefined,
      costPerVideo: typeof costPerVideo === 'number' ? costPerVideo : undefined,
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Flow credits update failed' });
  }
});

// Launch headed browser window for Google Flow login or switching accounts
flowRouter.post('/launch-login', async (_req, res) => {
  try {
    const { spawn } = await import('node:child_process');
    const scriptPath = path.resolve(__dirname, '..', '..', 'scripts', 'flow-login.mjs');
    
    // Launch headed browser helper detached
    const child = spawn(process.execPath, [scriptPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();

    res.json({
      success: true,
      message: 'Headed browser launched. Please sign in or switch your Google account, then close the browser window when done.',
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to launch login browser' });
  }
});

// One-time login guidance. The headed sign-in itself stays manual on purpose:
flowRouter.get('/login-hint', (_req, res) => {
  res.json(flowLoginSteps());
});

// Job queue: one active job per profile (Chromium profile lock + credit safety).
// dryRun defaults true: validates prompt/model/duration/budget, 0 credits.
flowRouter.post('/jobs', async (req, res) => {
  try {
    const job = await startFlowJob(req.body || {});
    res.status(job.state === 'error' ? 501 : 202).json(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start Flow job';
    res.status(/already running|budget/i.test(message) ? 409 : 400).json({ error: message });
  }
});

flowRouter.get('/jobs', (req, res) => {
  const scriptId = typeof req.query.scriptId === 'string' ? req.query.scriptId : '';
  if (!scriptId) {
    res.status(400).json({ error: 'scriptId query is required' });
    return;
  }
  res.json({ jobs: flowJobsFor(scriptId) });
});

flowRouter.get('/jobs/:id', (req, res) => {
  const job = flowJobStatus(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Flow job not found' });
    return;
  }
  res.json(job);
});

flowRouter.post('/jobs/:id/cancel', async (req, res) => {
  try {
    res.json(await cancelFlowJob(req.params.id));
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : 'Cancel failed' });
  }
});

// Authenticated-session download. The client then imports these bytes through
// the existing workspace-scoped media-import endpoint (same as manual upload),
// so Flow routes never need workspace context.
flowRouter.get('/downloads/:id', (req, res) => {
  const file = resolveFlowDownload(req.params.id);
  if (!file) {
    res.status(404).json({ error: 'Download not found. The job must be done first.' });
    return;
  }
  res.set('Content-Type', 'video/mp4');
  res.sendFile(file);
});
