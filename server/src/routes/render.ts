import { Router } from 'express';
import { renderVideo, getOutputDir, getVideoUrl, serveVideoFile, probeAudioDuration, resolveInputPath, RenderOptions } from '../services/video.js';
import { generateSubtitleFile } from '../services/subtitle.js';
import { listMusicTracks, resolveMusicTrack, ensureDefaultMusicTracks } from '../services/music.js';
import fs from 'fs';
import path from 'path';

export const renderRouter = Router();

// Pre-generate starter tracks asynchronously
ensureDefaultMusicTracks().catch(() => {});

const activeRenders = new Map<string, { controller: AbortController; status: 'running' | 'done' | 'error'; progress: number; error?: string }>();

renderRouter.get('/music-tracks', (_req, res) => {
  try {
    const tracks = listMusicTracks();
    res.json({ tracks });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list music tracks', tracks: [] });
  }
});

renderRouter.post('/start', async (req, res) => {
  const {
    scriptId,
    imagePaths,
    audioPath,
    narration,
    duration,
    resolution,
    zoomFactor,
    transitionDuration,
    timelineConfig,
    sceneAnalysis,
    enableSubtitles,
    bgmTrack,
    bgmVolume,
    colorGrade,
    enableVignette,
    enableSfx,
  } = req.body || {};

  if (!scriptId || typeof scriptId !== 'string') {
    res.status(400).json({ error: 'scriptId (string) is required' });
    return;
  }
  if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
    res.status(400).json({ error: 'imagePaths (non-empty array) is required' });
    return;
  }
  if (!audioPath || typeof audioPath !== 'string') {
    res.status(400).json({ error: 'audioPath (string) is required' });
    return;
  }

  if (activeRenders.has(scriptId)) {
    res.status(409).json({ error: 'Render already in progress for this script' });
    return;
  }

  // Determine exact audio duration for subtitle timings
  const resolvedAudio = resolveInputPath(audioPath, scriptId);
  const audioDuration = await probeAudioDuration(resolvedAudio);
  const finalDuration = audioDuration > 0 ? audioDuration : (duration || 30);

  // Generate subtitles if enabled and narration provided
  let subtitlePath: string | undefined = undefined;
  if (enableSubtitles && narration) {
    try {
      subtitlePath = generateSubtitleFile({
        scriptId,
        narration,
        duration: finalDuration,
      });
    } catch (subErr) {
      console.warn(`Subtitle generation failed for ${scriptId}:`, subErr);
    }
  }

  // Resolve background music path if selected
  const resolvedBgm = bgmTrack ? resolveMusicTrack(bgmTrack) : null;

  const controller = new AbortController();
  activeRenders.set(scriptId, { controller, status: 'running', progress: 5 });

  // Start render in background
  renderVideo({
    scriptId,
    imagePaths,
    audioPath,
    duration,
    resolution,
    zoomFactor,
    transitionDuration,
    timelineConfig,
    sceneAnalysis,
    enableSubtitles: Boolean(enableSubtitles && subtitlePath),
    subtitlePath,
    bgmPath: resolvedBgm || undefined,
    bgmVolume: typeof bgmVolume === 'number' ? bgmVolume : 0.15,
    colorGrade: typeof colorGrade === 'string' ? colorGrade : undefined,
    enableVignette: enableVignette !== false,
    enableSfx: enableSfx !== false,
    onProgress: (percent) => {
      const entry = activeRenders.get(scriptId);
      if (entry) {
        entry.progress = percent;
      }
    },
  } as RenderOptions)
    .then((result) => {
      const entry = activeRenders.get(scriptId);
      if (entry) {
        entry.status = 'done';
        entry.progress = 100;
      }
      console.log(`Render completed for ${scriptId}: ${result.filename}`);
    })
    .catch((err: any) => {
      const entry = activeRenders.get(scriptId);
      if (entry) {
        entry.status = 'error';
        entry.error = err.message;
      }
      console.error(`Render failed for ${scriptId}:`, err.message);
    });

  res.json({ ok: true, message: 'Render started', scriptId });
});

renderRouter.post('/cancel', (req, res) => {
  const { scriptId } = req.body || {};
  const entry = activeRenders.get(scriptId);
  if (entry) {
    entry.controller.abort();
    activeRenders.delete(scriptId);
    res.json({ ok: true, cancelled: true });
  } else {
    res.json({ ok: true, cancelled: false, message: 'No active render for this script' });
  }
});

renderRouter.get('/status/:scriptId', (req, res) => {
  const { scriptId } = req.params;
  const entry = activeRenders.get(scriptId);
  
  if (entry) {
    if (entry.status === 'running') {
      res.json({ status: 'running', progress: entry.progress || 5, message: `Rendering video... ${entry.progress || 5}%` });
      return;
    }
    if (entry.status === 'error') {
      res.json({ status: 'error', error: entry.error });
      activeRenders.delete(scriptId);
      return;
    }
    if (entry.status === 'done') {
      activeRenders.delete(scriptId);
      // fall through to list videos
    }
  }

  const outputDir = getOutputDir(scriptId);
  let videos: string[] = [];

  if (fs.existsSync(outputDir)) {
    videos = fs.readdirSync(outputDir)
      .filter(f => f.endsWith('.mp4'))
      .sort((a, b) => fs.statSync(path.join(outputDir, b)).mtimeMs - fs.statSync(path.join(outputDir, a)).mtimeMs);
  }

  res.json({ 
    status: videos.length > 0 ? 'done' : 'idle',
    videos: videos.map(f => ({ 
      filename: f, 
      url: getVideoUrl(scriptId, f) 
    })) 
  });
});

renderRouter.get('/file/:scriptId/:filename', (req, res) => {
  const scriptId = req.params.scriptId.replace(/[^a-zA-Z0-9._-]/g, '');
  const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, '');
  
  if (!scriptId || !filename) {
    res.status(400).end();
    return;
  }

  const filePath = serveVideoFile(scriptId, filename);
  if (!filePath) {
    res.status(404).end();
    return;
  }

  res.sendFile(filePath);
});