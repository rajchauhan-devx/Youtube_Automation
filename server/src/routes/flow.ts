import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChildProcess } from 'node:child_process';
import { execSync } from 'node:child_process';
import { flowLoginSteps, flowStatus, flowProfileDir } from '../services/flow/profile.js';
import { getFlowCreditsInfo, updateFlowCredits, resetFlowCredits } from '../services/flow/credits.js';
import { syncFlowCredits } from '../services/flow/credit-sync.js';
import { cancelFlowJob, flowJobStatus, flowJobsFor, resolveFlowDownload, startFlowJob } from '../services/flow/jobs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '..', '..');

let activeLoginChild: ChildProcess | null = null;

export function isFlowLoginActive(): boolean {
  if (activeLoginChild && activeLoginChild.exitCode === null) {
    return true;
  }
  const pidFile = path.join(path.dirname(flowProfileDir()), 'login.pid');
  if (fs.existsSync(pidFile)) {
    try {
      const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
      if (pid && !Number.isNaN(pid)) {
        process.kill(pid, 0);
        return true;
      }
    } catch {
      try {
        fs.unlinkSync(pidFile);
      } catch {}
    }
  }
  return false;
}

function killActiveFlowLogin(): void {
  if (activeLoginChild) {
    try {
      if (activeLoginChild.pid) {
        if (process.platform === 'win32') {
          execSync(`taskkill /PID ${activeLoginChild.pid} /T /F`, { stdio: 'ignore' });
        } else {
          activeLoginChild.kill('SIGKILL');
        }
      }
    } catch {}
    activeLoginChild = null;
  }
  const pidFile = path.join(path.dirname(flowProfileDir()), 'login.pid');
  if (fs.existsSync(pidFile)) {
    try {
      const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
      if (pid && !Number.isNaN(pid)) {
        if (process.platform === 'win32') {
          execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
        } else {
          process.kill(pid, 'SIGKILL');
        }
      }
    } catch {}
    try {
      fs.unlinkSync(pidFile);
    } catch {}
  }
}

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
flowRouter.get('/credits', async (req, res) => {
  try {
    res.json(req.query.refresh === 'true' ? await syncFlowCredits() : getFlowCreditsInfo());
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Flow credits query failed' });
  }
});

// Update Google Flow credit balance and/or account email
flowRouter.post('/credits', (req, res) => {
  try {
    const { credits, account, tier, costPerVideo } = req.body || {};
    const numericCredits = credits == null || credits === '' ? undefined : Number(credits);
    const updated = updateFlowCredits(numericCredits, {
      account: typeof account === 'string' && account.trim() ? account.trim() : undefined,
      tier: typeof tier === 'string' && tier.trim() ? tier.trim() : undefined,
      costPerVideo: typeof costPerVideo === 'number' ? costPerVideo : undefined,
    });
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Flow credits update failed' });
  }
});

// Launch headed browser window for Google Flow login or switching accounts
flowRouter.post('/launch-login', async (req, res) => {
  try {
    const { spawn } = await import('node:child_process');
    const scriptPath = path.resolve(SERVER_ROOT, 'scripts', 'flow-login.mjs');
    const fresh = req.body?.fresh === true || req.query.fresh === 'true';

    // 1. Kill any existing login processes first to free the profile lock
    killActiveFlowLogin();

    // 2. Remove any lingering Singleton lock files
    const profileDir = flowProfileDir();
    for (const lock of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile']) {
      try {
        fs.unlinkSync(path.join(profileDir, lock));
      } catch {}
    }

    // 3. If fresh switch, wipe stored credits immediately so old account is gone
    if (fresh) {
      resetFlowCredits(true);
    }

    const dataDir = path.dirname(profileDir);
    fs.mkdirSync(dataDir, { recursive: true });
    const logFile = path.join(dataDir, 'login.log');
    const logFd = fs.openSync(logFile, 'a');

    const args = [scriptPath];
    if (fresh) args.push('--fresh');

    const child = spawn(process.execPath, args, {
      cwd: SERVER_ROOT,
      detached: true,
      stdio: ['ignore', logFd, logFd],
      windowsHide: false,
    });
    child.unref();
    activeLoginChild = child;

    // 4. Verify child didn't immediately crash
    await new Promise((resolve) => setTimeout(resolve, 1500));

    if (child.exitCode !== null && child.exitCode !== 0) {
      let errDetails = '';
      try {
        const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
        errDetails = lines.slice(-5).join(' ');
      } catch {}
      throw new Error(`Browser failed to launch (exit code ${child.exitCode}): ${errDetails || 'Check login.log'}`);
    }

    res.json({
      success: true,
      message: fresh
        ? 'Clean browser window launched. Please sign in to your new Google account, then close the browser window.'
        : 'Headed browser launched. Please sign in or switch your Google account, then close the browser window when done.',
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to launch login browser' });
  }
});

// Clear Google Flow browser session
flowRouter.post('/clear-session', (_req, res) => {
  try {
    killActiveFlowLogin();
    const profileDir = flowProfileDir();
    fs.rmSync(profileDir, { recursive: true, force: true });
    fs.mkdirSync(profileDir, { recursive: true });
    resetFlowCredits(true);
    res.json({ success: true, message: 'Google Flow session cleared.' });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to clear session' });
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
    if (isFlowLoginActive()) {
      const credits = getFlowCreditsInfo();
      if (credits.account && (credits.status === 'ok' || credits.credits !== null)) {
        console.log('[Flow] Auto-closing login browser because account is synced and a generation job has arrived.');
        killActiveFlowLogin();
        await new Promise((r) => setTimeout(r, 1000));
      } else {
        res.status(409).json({ error: 'Flow login browser is currently open. Please complete sign-in and close it before generating.' });
        return;
      }
    }
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
