import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import {
  flowMusicProfileDir,
  getFlowMusicAccount,
  saveFlowMusicAccount,
  cleanLockFiles,
  getBrowserChannel,
  flowMusicDownloadsDir,
} from '../services/flow-music/flow-music-profile.js';
import {
  startFlowMusicGeneration,
  getFlowMusicJob,
  listFlowMusicJobs,
} from '../services/flow-music/flow-music-worker.js';
import {
  getSongApproval,
  setSongApproval,
  startFlowVideoPipeline,
  getFlowVideoJob,
  listFlowVideoJobs,
  HANUMAN_SCENE_DEFINITIONS,
} from '../services/flow-music/flow-music-video-service.js';
import { store } from '../services/store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '..', '..');

let activeLoginChild: ChildProcess | null = null;

function isLoginActive(): boolean {
  if (activeLoginChild && activeLoginChild.exitCode === null) return true;
  const pidFile = path.join(path.dirname(flowMusicProfileDir()), 'login.pid');
  if (fs.existsSync(pidFile)) {
    try {
      const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
      if (pid && !Number.isNaN(pid)) {
        process.kill(pid, 0);
        return true;
      }
    } catch {
      try { fs.unlinkSync(pidFile); } catch {}
    }
  }
  return false;
}

function killActiveLogin(): void {
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
  const pidFile = path.join(path.dirname(flowMusicProfileDir()), 'login.pid');
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
    try { fs.unlinkSync(pidFile); } catch {}
  }
}

export const flowMusicRouter = Router();

// Read account status & readiness
flowMusicRouter.get('/status', (_req, res) => {
  try {
    const account = getFlowMusicAccount();
    const profileDir = flowMusicProfileDir();
    const profileReady = fs.existsSync(profileDir);
    const loginActive = isLoginActive();
    res.json({
      account: account.account || null,
      status: account.status,
      tier: account.tier || 'Google AI',
      profileReady,
      loginActive,
      browserChannel: getBrowserChannel() || 'bundled chromium',
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Status check failed' });
  }
});

// Launch headed browser for sign-in or switching accounts
flowMusicRouter.post('/launch-login', (req, res) => {
  try {
    const scriptPath = path.resolve(SERVER_ROOT, 'scripts', 'flow-music-login.mjs');
    const fresh = req.body?.fresh === true || req.query.fresh === 'true';

    killActiveLogin();
    const profileDir = flowMusicProfileDir();
    cleanLockFiles(profileDir);

    if (fresh) {
      saveFlowMusicAccount({ account: '', status: 'auth_required' });
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

    res.json({
      success: true,
      message: fresh
        ? 'Clean Google Flow Music browser launched. Please sign in to your new Google account, then close the browser window.'
        : 'Headed browser launched. Please sign in or switch your Google account, then close the browser window when done.',
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to launch login browser' });
  }
});

// Clear Google Flow Music session
flowMusicRouter.post('/clear-session', (_req, res) => {
  try {
    killActiveLogin();
    const profileDir = flowMusicProfileDir();
    fs.rmSync(profileDir, { recursive: true, force: true });
    fs.mkdirSync(profileDir, { recursive: true });
    saveFlowMusicAccount({ account: '', status: 'auth_required' });
    res.json({ success: true, message: 'Google Flow Music session cleared.' });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to clear session' });
  }
});

// Pre-fill Ancient Dharma Google Flow Music configuration
flowMusicRouter.post('/prepare-ancient-dharma', (req, res) => {
  try {
    const { scriptId, topic } = req.body || {};
    const script = scriptId ? store.getById<any>('scripts', scriptId) : null;
    const activeTopic = topic || script?.topicName || script?.name || 'Lord Hanuman Vow';

    const defaultLyrics = `[Dramatic Dialogue Phase]
राम जी: "हनुमान, अगर सूर्य निकल गया तो लक्ष्मण मर जाएगा।"
हनुमान जी: "प्रभु, सूर्यदेव मेरा स्वभाव जानते हैं... जब तक जड़ी-बूटी लेकर नहीं आऊँगा, सूरज को उगने नहीं दूंगा।"
राम जी: "हनुमान, मौत आगे बढ़ रही है..."
हनुमान जी: "प्रभु, आप कहते हैं मौत लक्ष्मण को खा जाएगी? मैं आपकी कसम खा के कहता हूँ... आज मौत को ही मार दूंगा! दुनिया में कभी कोई मरेगा नहीं!"

[Epic Vocal Chorus / Sanskrit Chants]
राम रामं जपती...
हनुमान अतुलितबलधामम्...
हनुमान महाकाल शंभोरावतारः...
बजरंगबली... जय श्री राम!`;

    const config = {
      enabled: true,
      prompt: `Epic cinematic trailer sound track, heavy indian percussion, dhol drums, orchestral brass swells, deep sub-bass drops, emotional sad strings transitioning into aggressive action hybrid music, Sanskrit chants, high energy war theme`,
      lyrics: defaultLyrics,
      lyricsMode: 'custom',
      title: `${activeTopic} // Goosebumps 🚩`,
      mood: 'Heroic, Dramatic, High-Intensity, Emotionally Charged (Goosebumps 🚩)',
      theme: 'Mythological retelling, Valmiki Ramayana, Lord Hanuman Vow to Lord Rama',
      vocalProfile: 'Deep, resonant male voice with heavy chest resonance, strong bass, aggressive cadence, hall reverb',
      sfxBooms: true,
      sfxRisers: true,
      dholPercussion: true,
      brassSwells: true,
      duration: 60,
      bpm: 110,
      producerModel: 'Google Lyria / Flow Music',
      imageOnlyReel: true,
      letterboxBanner: 'Goosebumps 🚩',
      vfxParticles: true,
    };

    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Prepare configuration failed' });
  }
});

// Start Google Flow Music generation job
flowMusicRouter.post('/generate', async (req, res) => {
  try {
    const { scriptId, settings } = req.body || {};
    if (!scriptId) {
      res.status(400).json({ error: 'scriptId is required' });
      return;
    }
    const job = await startFlowMusicGeneration(scriptId, settings);
    res.status(202).json(job);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Generation request failed' });
  }
});

// Poll job status
flowMusicRouter.get('/jobs/:id', (req, res) => {
  const job = getFlowMusicJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json(job);
});

// List jobs for a script
flowMusicRouter.get('/jobs', (req, res) => {
  const scriptId = typeof req.query.scriptId === 'string' ? req.query.scriptId : undefined;
  res.json({ jobs: listFlowMusicJobs(scriptId) });
});

// Get latest generated track
flowMusicRouter.get('/latest-track', (_req, res) => {
  try {
    const downloadDir = flowMusicDownloadsDir();
    if (!fs.existsSync(downloadDir)) {
      res.json({ track: null });
      return;
    }
    const files = fs.readdirSync(downloadDir)
      .filter((f) => f.endsWith('.mp3'))
      .map((f) => ({ name: f, time: fs.statSync(path.join(downloadDir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    if (files.length === 0) {
      res.json({ track: null });
      return;
    }
    const latest = files[0].name.replace(/\.mp3$/, '');
    res.json({
      track: {
        filename: files[0].name,
        id: latest,
        url: `/api/flow-music/downloads/${latest}`,
        title: 'Lord Hanuman Vow // Goosebumps 🚩 (Google Flow Lyria 3.5)',
      },
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch latest track' });
  }
});

// Download audio file
flowMusicRouter.get('/downloads/:id', (req, res) => {
  const downloadDir = flowMusicDownloadsDir();
  const file = path.join(downloadDir, `${req.params.id}.mp3`);
  if (!fs.existsSync(file)) {
    res.status(404).json({ error: 'Audio file not found' });
    return;
  }
  res.set('Content-Type', 'audio/mpeg');
  res.sendFile(file);
});

// Song Approval Status
flowMusicRouter.get('/approval/:scriptId', (req, res) => {
  const approval = getSongApproval(req.params.scriptId);
  res.json(approval);
});

// Approve or Reject Song
flowMusicRouter.post('/approve', (req, res) => {
  try {
    const { scriptId, approved, songUrl, trackTitle } = req.body || {};
    if (!scriptId) {
      res.status(400).json({ error: 'scriptId is required' });
      return;
    }
    const updated = setSongApproval(scriptId, Boolean(approved), songUrl, trackTitle);
    res.json({ success: true, approval: updated });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update approval status' });
  }
});

// Get scene definitions for multi-line lyrics breakdown
flowMusicRouter.get('/scenes', (_req, res) => {
  res.json({ scenes: HANUMAN_SCENE_DEFINITIONS });
});

// Start Full Video Pipeline (Shorts 9:16 + Long 16:9) - Gated strictly by song approval
flowMusicRouter.post('/generate-full-video', async (req, res) => {
  try {
    const { scriptId } = req.body || {};
    if (!scriptId) {
      res.status(400).json({ error: 'scriptId is required' });
      return;
    }
    const approval = getSongApproval(scriptId);
    if (!approval.approved) {
      res.status(400).json({
        error: 'Song must be approved first! Please listen to the track and click "Approve Song" before starting video production.',
        approvalRequired: true,
      });
      return;
    }

    const job = await startFlowVideoPipeline(scriptId);
    res.status(202).json(job);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to start video generation' });
  }
});

// Video Job Status
flowMusicRouter.get('/video-job/:id', (req, res) => {
  const job = getFlowVideoJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Video job not found' });
    return;
  }
  res.json(job);
});

// List Video Jobs
flowMusicRouter.get('/video-jobs', (req, res) => {
  const scriptId = typeof req.query.scriptId === 'string' ? req.query.scriptId : undefined;
  res.json({ jobs: listFlowVideoJobs(scriptId) });
});

// Get latest rendered videos
flowMusicRouter.get('/latest-videos', (_req, res) => {
  try {
    const videoDir = path.join(flowMusicDownloadsDir(), 'videos');
    if (!fs.existsSync(videoDir)) {
      res.json({ shorts: null, long: null });
      return;
    }
    const files = fs.readdirSync(videoDir);
    const shorts = files
      .filter((f) => f.includes('shorts') && f.endsWith('.mp4'))
      .map((f) => ({ filename: f, url: `/api/flow-music/videos/${f}`, time: fs.statSync(path.join(videoDir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time)[0] || null;

    const long = files
      .filter((f) => f.includes('long') && f.endsWith('.mp4'))
      .map((f) => ({ filename: f, url: `/api/flow-music/videos/${f}`, time: fs.statSync(path.join(videoDir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time)[0] || null;

    res.json({ shorts, long });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch latest videos' });
  }
});

// Serve rendered videos and scene artwork
flowMusicRouter.get('/videos/:filename', (req, res) => {
  const videoDir = path.join(flowMusicDownloadsDir(), 'videos');
  const file = path.join(videoDir, path.basename(req.params.filename));
  if (!fs.existsSync(file)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  if (file.endsWith('.mp4')) {
    res.set('Content-Type', 'video/mp4');
  } else if (file.endsWith('.jpg') || file.endsWith('.jpeg')) {
    res.set('Content-Type', 'image/jpeg');
  } else if (file.endsWith('.png')) {
    res.set('Content-Type', 'image/png');
  }
  res.sendFile(file);
});
