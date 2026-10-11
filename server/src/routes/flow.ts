import { Router } from 'express';
import { flowLoginSteps, flowStatus } from '../services/flow/profile.js';
import { cancelFlowJob, flowJobStatus, flowJobsFor, startFlowJob } from '../services/flow/jobs.js';

export const flowRouter = Router();

// Read-only status: package/browsers/profile readiness. Never spends credits.
flowRouter.get('/status', async (_req, res) => {
  try {
    res.json(await flowStatus());
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Flow status failed' });
  }
});

// One-time login guidance. The headed sign-in itself stays manual on purpose:
// Google 2FA/CAPTCHA cannot and should not be automated by the server.
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
