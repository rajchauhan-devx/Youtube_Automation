import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
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
  cancelFlowMusicJob,
} from '../services/flow-music/flow-music-worker.js';
import {
  getSongApproval,
  setSongApproval,
  rejectSong,
  startFlowVideoPipeline,
  getFlowVideoJob,
  listFlowVideoJobs,
  cancelFlowVideoJob,
  getFlowMusicStudioState,
  saveFlowMusicStudioState,
  resetFlowMusicWorkspace,
  buildScenesFromScript,
  regenerateFlowMusicSceneKeyframe,
  resolveApprovedAudioPath,
  HANUMAN_SCENE_DEFINITIONS,
} from '../services/flow-music/flow-music-video-service.js';
import { analyzeBeats } from '../services/flow-music/beat-detector.js';
import { store } from '../services/store.js';
import { containedFile } from '../services/paths.js';

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

// Read & persist Flow Music Studio draft state
flowMusicRouter.get('/state', (_req, res) => {
  try {
    res.json(getFlowMusicStudioState());
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load studio state' });
  }
});

flowMusicRouter.put('/state', (req, res) => {
  try {
    const saved = saveFlowMusicStudioState(req.body || {});
    res.json({ success: true, state: saved });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to save studio state' });
  }
});

// Reset workspace files, approvals, scenes, and state (preserving browser sign-in)
flowMusicRouter.post('/reset', (req, res) => {
  try {
    const { scriptId, scope } = req.body || {};
    const cleared = resetFlowMusicWorkspace({
      scriptId: typeof scriptId === 'string' ? scriptId : undefined,
      scope: scope === 'videos' ? 'videos' : 'all',
    });
    res.json({
      success: true,
      cleared,
      state: getFlowMusicStudioState(),
      message:
        scope === 'videos'
          ? 'Rendered videos and scene keyframes cleared.'
          : 'Flow Music workspace cleared cleanly. Ready to start a fresh script!',
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Reset failed' });
  }
});

// Build scene storyboard automatically from any script / lyrics / topic
flowMusicRouter.post('/plan-scenes', async (req, res) => {
  try {
    const { scriptText, lyrics, topic, mood, theme, duration } = req.body || {};
    const scenes = await buildScenesFromScript({
      scriptText: typeof scriptText === 'string' ? scriptText : undefined,
      lyrics: typeof lyrics === 'string' ? lyrics : undefined,
      topic: typeof topic === 'string' ? topic : undefined,
      mood: typeof mood === 'string' ? mood : undefined,
      theme: typeof theme === 'string' ? theme : undefined,
      targetDuration: typeof duration === 'number' ? duration : undefined,
    });
    res.json({ scenes });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to plan scenes' });
  }
});

// Cancel running music job
flowMusicRouter.post('/jobs/:id/cancel', (req, res) => {
  const job = cancelFlowMusicJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json({ success: true, job });
});

// Cancel running video job
flowMusicRouter.post('/video-job/:id/cancel', (req, res) => {
  const job = cancelFlowVideoJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Video job not found' });
    return;
  }
  res.json({ success: true, job });
});

// Upload user audio track (supports raw audio/* or application/octet-stream up to 25MB, or JSON dataBase64)
flowMusicRouter.post(
  '/upload-track',
  async (req, res, next) => {
    const ct = req.headers['content-type'] || '';
    if (ct.includes('application/json')) return next();
    const chunks: Buffer[] = [];
    let total = 0;
    const limit = 25 * 1024 * 1024;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total <= limit) chunks.push(chunk);
    });
    req.on('end', () => {
      if (total > limit) {
        res.status(413).json({ error: 'Audio file exceeds 25MB limit.' });
        return;
      }
      (req as any).rawAudioBuffer = Buffer.concat(chunks);
      next();
    });
    req.on('error', (err) => next(err));
  },
  (req, res) => {
    try {
      const rawBuf: Buffer | undefined = (req as any).rawAudioBuffer;
      const headerName = String(req.headers['x-track-filename'] || '');
      const headerTitle = String(req.headers['x-track-title'] || '');
      const origFilename = req.body?.filename || headerName || 'uploaded_track.mp3';
      const title =
        decodeURIComponent(req.body?.title || headerTitle || '').trim() ||
        path.basename(origFilename, path.extname(origFilename));

      let buffer: Buffer;
      if (rawBuf && rawBuf.length > 0) {
        buffer = rawBuf;
      } else if (typeof req.body?.dataBase64 === 'string' && req.body.dataBase64.trim()) {
        const cleanB64 = req.body.dataBase64.replace(/^data:[^;]+;base64,/, '');
        buffer = Buffer.from(cleanB64, 'base64');
      } else {
        res.status(400).json({ error: 'Audio file data is required.' });
        return;
      }

      if (buffer.length < 128) {
        res.status(400).json({ error: 'Audio file is too small or empty.' });
        return;
      }

      const extMatch = origFilename.match(/\.(mp3|wav|m4a|ogg|aac)$/i);
      const ext = extMatch ? extMatch[1].toLowerCase() : 'mp3';
      const id = `upload_${Date.now()}_${randomUUID().slice(0, 6)}`;
      const downloadsDir = flowMusicDownloadsDir();
      const targetFilename = `${id}.${ext}`;
      const targetPath = containedFile(downloadsDir, targetFilename);
      if (!targetPath) {
        res.status(400).json({ error: 'Invalid filename.' });
        return;
      }

      fs.writeFileSync(targetPath, buffer);
      fs.writeFileSync(
        path.join(downloadsDir, `${id}.json`),
        JSON.stringify(
          {
            id,
            title,
            filename: targetFilename,
            scriptId: req.body?.scriptId || String(req.headers['x-script-id'] || ''),
            uploaded: true,
            createdAt: new Date().toISOString(),
          },
          null,
          2
        ),
        'utf8'
      );

      res.json({
        success: true,
        track: {
          id,
          filename: targetFilename,
          url: `/api/flow-music/downloads/${id}`,
          title,
        },
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Audio upload failed' });
    }
  }
);

// Regenerate a single keyframe image in place
flowMusicRouter.post('/regenerate-scene', async (req, res) => {
  try {
    const { filename, prompt, index, jobId } = req.body || {};
    if (!filename || !prompt) {
      res.status(400).json({ error: 'filename and prompt are required' });
      return;
    }
    const updated = await regenerateFlowMusicSceneKeyframe({
      filename: String(filename),
      prompt: String(prompt),
      index: typeof index === 'number' ? index : undefined,
      jobId: typeof jobId === 'string' ? jobId : undefined,
    });
    res.json({ success: true, ...updated });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Scene regeneration failed' });
  }
});

// Get latest generated or uploaded track
flowMusicRouter.get('/latest-track', (_req, res) => {
  try {
    const downloadDir = flowMusicDownloadsDir();
    if (!fs.existsSync(downloadDir)) {
      res.json({ track: null });
      return;
    }
    const files = fs
      .readdirSync(downloadDir)
      .filter((f) => /\.(mp3|wav|m4a|ogg|aac)$/i.test(f))
      .map((f) => ({ name: f, time: fs.statSync(path.join(downloadDir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    if (files.length === 0) {
      res.json({ track: null });
      return;
    }
    const latestFile = files[0].name;
    const latestId = latestFile.replace(/\.(mp3|wav|m4a|ogg|aac)$/i, '');
    let title = latestId;
    let transcription = '';
    const metaPath = path.join(downloadDir, `${latestId}.json`);
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (meta?.title) title = meta.title;
        if (meta?.transcription) transcription = meta.transcription;
      } catch {}
    } else if (latestId.includes('hanuman')) {
      title = 'Lord Hanuman Vow // Goosebumps 🚩 (Google Flow Lyria 3.5)';
    }

    res.json({
      track: {
        filename: latestFile,
        id: latestId,
        url: `/api/flow-music/downloads/${latestId}`,
        title,
        transcription,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch latest track' });
  }
});

// Download audio file
flowMusicRouter.get('/downloads/:id', (req, res) => {
  const downloadDir = flowMusicDownloadsDir();
  const safeId = path.basename(req.params.id).replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safeId) {
    res.status(400).json({ error: 'Invalid track id' });
    return;
  }

  let matchedFile: string | null = null;
  for (const candidate of [safeId, `${safeId}.mp3`, `${safeId}.wav`, `${safeId}.m4a`, `${safeId}.ogg`]) {
    const p = containedFile(downloadDir, candidate);
    if (p && fs.existsSync(p) && fs.statSync(p).isFile()) {
      matchedFile = p;
      break;
    }
  }

  if (!matchedFile) {
    res.status(404).json({ error: 'Audio file not found' });
    return;
  }

  if (matchedFile.endsWith('.wav')) res.set('Content-Type', 'audio/wav');
  else if (matchedFile.endsWith('.m4a')) res.set('Content-Type', 'audio/mp4');
  else if (matchedFile.endsWith('.ogg')) res.set('Content-Type', 'audio/ogg');
  else res.set('Content-Type', 'audio/mpeg');
  res.sendFile(matchedFile);
});

// Song Approval Status
flowMusicRouter.get('/approval/:scriptId', (req, res) => {
  const approval = getSongApproval(req.params.scriptId);
  res.json(approval);
});

// Approve or Reject Song (rejection records the refinement note for the next iteration)
flowMusicRouter.post('/approve', (req, res) => {
  try {
    const { scriptId, approved, songUrl, trackTitle, note } = req.body || {};
    if (!scriptId) {
      res.status(400).json({ error: 'scriptId is required' });
      return;
    }
    // Explicit rejection = action flag or approved:false with a refinement note.
    // Plain approved:false without a note is a silent revoke (not a rejection).
    const isExplicitReject = req.body?.action === 'reject' || (approved === false && typeof note === 'string' && note.trim().length > 0);
    if (approved === false && isExplicitReject) {
      const rejected = rejectSong(scriptId, {
        note: typeof note === 'string' ? note : '',
        songUrl: typeof songUrl === 'string' ? songUrl : '',
        trackTitle: typeof trackTitle === 'string' ? trackTitle : '',
      });
      res.json({
        success: true,
        approval: rejected,
        message: note
          ? `Track rejected — refine your lyrics/settings and regenerate. (Note saved: "${note.slice(0, 120)}")`
          : 'Track rejected — refine your lyrics/settings and regenerate.',
      });
      return;
    }
    const updated = setSongApproval(scriptId, Boolean(approved), songUrl, trackTitle);
    res.json({ success: true, approval: updated });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update approval status' });
  }
});

// Analyze beats of the current (or explicit) track — powers the Beat Edit studio
flowMusicRouter.post('/analyze-beats', async (req, res) => {
  try {
    const { scriptId, songUrl, bpmHint } = req.body || {};
    const effectiveScriptId = typeof scriptId === 'string' && scriptId ? scriptId : 'flow_studio_custom';
    let audioPath: string;
    try {
      audioPath = resolveApprovedAudioPath(effectiveScriptId, typeof songUrl === 'string' ? songUrl : '');
    } catch {
      res.status(404).json({ error: 'No audio track found. Generate or upload a track first.' });
      return;
    }
    const analysis = await analyzeBeats(audioPath, {
      hintBpm: typeof bpmHint === 'number' && bpmHint > 0 ? bpmHint : undefined,
      scriptId: effectiveScriptId,
    });
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Beat analysis failed' });
  }
});

// Cached beat map for the currently approved/latest track of a script
flowMusicRouter.get('/beat-map/:scriptId', async (req, res) => {
  try {
    const approval = getSongApproval(req.params.scriptId);
    let audioPath: string;
    try {
      audioPath = resolveApprovedAudioPath(req.params.scriptId, approval.songUrl || '');
    } catch {
      res.status(404).json({ error: 'No audio track found for this script yet.' });
      return;
    }
    const analysis = await analyzeBeats(audioPath, { scriptId: req.params.scriptId });
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Beat map lookup failed' });
  }
});

// Get preset scene definitions
flowMusicRouter.get('/scenes', (_req, res) => {
  res.json({ scenes: HANUMAN_SCENE_DEFINITIONS });
});

// Start Full Video Pipeline (Shorts 9:16 + Long 16:9) - Gated strictly by song approval
flowMusicRouter.post('/generate-full-video', async (req, res) => {
  try {
    const {
      scriptId,
      scenes,
      lyrics,
      title,
      prompt,
      mood,
      theme,
      duration,
      letterboxBanner,
      songUrl,
      beatEdit,
      bpmHint,
      reuseImages,
      existingImages,
      videoFormat,
    } = req.body || {};
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

    const job = await startFlowVideoPipeline(scriptId, {
      scenes: Array.isArray(scenes) ? scenes : undefined,
      lyrics: typeof lyrics === 'string' ? lyrics : undefined,
      title: typeof title === 'string' ? title : undefined,
      prompt: typeof prompt === 'string' ? prompt : undefined,
      mood: typeof mood === 'string' ? mood : undefined,
      theme: typeof theme === 'string' ? theme : undefined,
      duration: typeof duration === 'number' ? duration : undefined,
      letterboxBanner: typeof letterboxBanner === 'string' ? letterboxBanner : undefined,
      songUrl: typeof songUrl === 'string' ? songUrl : undefined,
      videoFormat: typeof videoFormat === 'string' ? (videoFormat as any) : undefined,
      beatEdit: beatEdit && typeof beatEdit === 'object' ? beatEdit : undefined,
      bpmHint: typeof bpmHint === 'number' && bpmHint > 0 ? bpmHint : undefined,
      reuseImages: Boolean(reuseImages),
      existingImages: Array.isArray(existingImages) ? existingImages : undefined,
    });
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

// Get latest rendered videos and matching scene keyframes
flowMusicRouter.get('/latest-videos', (_req, res) => {
  try {
    const videoDir = path.join(flowMusicDownloadsDir(), 'videos');
    if (!fs.existsSync(videoDir)) {
      res.json({ shorts: null, long: null, images: [] });
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

    const latestJobPrefix =
      shorts?.filename.match(/^(fv_[^_]+_[^_]+)_/)?.[1] ||
      long?.filename.match(/^(fv_[^_]+_[^_]+)_/)?.[1] ||
      '';
    const draft = getFlowMusicStudioState();
    const inMemoryImages = latestJobPrefix ? getFlowVideoJob(latestJobPrefix)?.images : undefined;

    let images: Array<{ line: string; prompt: string; filename: string; url: string }> = [];
    if (inMemoryImages && inMemoryImages.length > 0) {
      images = inMemoryImages;
    } else if (latestJobPrefix) {
      images = files
        .filter((f) => f.startsWith(`${latestJobPrefix}_scene_`) && /\.(png|jpg|jpeg)$/i.test(f))
        .sort((a, b) => {
          const idxA = Number(a.match(/_scene_(\d+)/)?.[1] ?? 0);
          const idxB = Number(b.match(/_scene_(\d+)/)?.[1] ?? 0);
          return idxA - idxB;
        })
        .map((f) => {
          const idx = Number(f.match(/_scene_(\d+)/)?.[1] ?? 0);
          const scene = draft.scenes?.[idx] || HANUMAN_SCENE_DEFINITIONS[idx];
          return {
            line: scene?.line || `Scene ${idx + 1}`,
            prompt: scene?.prompt || '',
            filename: f,
            url: `/api/flow-music/videos/${f}`,
          };
        });
    }

    res.json({ shorts, long, images });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch latest videos' });
  }
});

// Serve rendered videos and scene artwork
flowMusicRouter.get('/videos/:filename', (req, res) => {
  const videoDir = path.join(flowMusicDownloadsDir(), 'videos');
  const file = containedFile(videoDir, path.basename(req.params.filename));
  if (!file || !fs.existsSync(file)) {
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
