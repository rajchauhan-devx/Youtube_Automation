import { atomicJson } from '../services/accounts.js';
import { workspaceKey, currentWorkspace } from '../services/workspace.js';
import { safeSegment } from '../services/paths.js';
import { planTimeline } from '../services/timeline.js';
import { Router } from 'express';
import { renderVideo, renderLongVideo, getOutputDir, getVideoUrl, serveVideoFile, probeAudioDuration, resolveInputPath, RenderOptions } from '../services/video.js';
import { store } from '../services/store.js';
import { assertNarrationCurrent, narrationStatus } from '../services/long-narration.js';
import type { NarrationSync, ScenePlan } from '../services/scene-plan.js';
import { renderRevision, isCurrentRender } from '../services/render-revision.js';
import { validateEditingSettings } from '../services/auto-edit.js';
import { removePreviousRenders } from '../services/render-output.js';
import { generateSubtitleFile } from '../services/subtitle.js';
import { listMusicTracks, resolveMusicTrack, ensureDefaultMusicTracks } from '../services/music.js';
import { startMusic, musicJobStatus, musicInstalled, cancelMusic, resolveGeneratedMusic, generateMusicPrompt } from '../services/local-music.js';
import fs from 'fs';
import path from 'path';
import { generatePresenter, presenterHealth } from '../services/presenter.js';
import { validatePresenter, reservePresenterCaptionSpace, type PresenterSettings } from '../services/presenter-settings.js';

export const renderRouter = Router();
renderRouter.param('scriptId', (_req, res, next, value) => {
  if (!safeSegment(value)) { res.status(400).json({ error: 'Invalid script ID' }); return; }
  next();
});

// Pre-generate starter tracks asynchronously
ensureDefaultMusicTracks().catch(() => {});

const activeRenders = new Map<string, { controller: AbortController; status: 'running' | 'done' | 'error'; progress: number; stage?: string; error?: string; finished: Promise<void> }>();
const clearingRenders = new Set<string>();

export async function clearScriptVideo(scriptId: string) {
  const key = workspaceKey(scriptId);
  if (clearingRenders.has(key)) throw new Error('Script cleanup is already in progress');
  clearingRenders.add(key);
  try {
    const job = activeRenders.get(key);
    if (job) {
      job.controller.abort();
      await job.finished;
    }
    // getOutputDir validates containment before removing this script's output.
    fs.rmSync(getOutputDir(scriptId), { recursive: true, force: true });
    activeRenders.delete(key);
  } finally {
    clearingRenders.delete(key);
  }
}

renderRouter.get('/music-tracks', (_req, res) => {
  try {
    const tracks = listMusicTracks();
    res.json({ tracks });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list music tracks', tracks: [] });
  }
});

renderRouter.get('/music/local/:trackId', (req, res) => {
  const track = listMusicTracks().find(item => item.id === req.params.trackId);
  if (!track) { res.status(404).json({ error: 'Track not found' }); return; }
  res.sendFile(track.path);
});
renderRouter.get('/music/status/:scriptId', (req, res) => {
  res.json({ ...musicJobStatus(req.params.scriptId), installed: musicInstalled() });
});
renderRouter.post('/music/prompt/:scriptId', async (req, res) => {
  try { res.json({ prompt: await generateMusicPrompt(req.params.scriptId) }); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Could not create a music prompt.' }); }
});
renderRouter.post('/music/generate/:scriptId', (req, res) => {
  try { res.status(202).json(startMusic(req.params.scriptId, req.body?.prompt ?? '', req.body?.duration ?? 60)); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Could not start music generation.' }); }
});
renderRouter.post('/music/cancel/:scriptId', async (req, res) => {
  await cancelMusic(req.params.scriptId);
  res.json(musicJobStatus(req.params.scriptId));
});

renderRouter.post('/start', async (req, res) => {
  let presenter: PresenterSettings | undefined;
  let presenterSourceSize: { width: number; height: number } | undefined;
  try {
    const configured = req.body?.presenter ?? store.getById<any>('scripts', req.body?.scriptId)?.presenter;
    if (configured !== undefined) presenter = validatePresenter(configured);
    if (presenter?.enabled) {
      const health = presenterHealth();
      if (!health.installed) throw new Error(health.message);
      if (!health.avatars.some(a => a.id === presenter!.avatarId)) throw new Error('Select an available prepared presenter avatar.');
      if (presenter.style === 'transparent' && !health.avatars.find(a => a.id === presenter!.avatarId)?.hasTransparency) throw new Error('This avatar needs its original transparent VP9 WebM. Re-upload it in MuseTalk and refresh avatars.');
      const avatar = health.avatars.find(a => a.id === presenter!.avatarId)!;
      presenterSourceSize = { width: avatar.width, height: avatar.height };
    }
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid presenter settings' }); return; }
  if (currentWorkspace().profile !== 'shorts') {
    if (req.body?.resolution && (req.body.resolution.width !== 1920 || req.body.resolution.height !== 1080)) {
      res.status(400).json({ error: 'Long Video requires landscape 1920 × 1080 output' }); return;
    }
    req.body = { ...req.body, resolution: { width: 1920, height: 1080 } };
  }
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
    ttsVolume,
    colorGrade,
    enableVignette,
    enableSfx,
    editing,
  } = req.body || {};
  if (editing !== undefined) {
    try { validateEditingSettings(editing); } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid editing settings' }); return; }
    if (editing.enabled && currentWorkspace().profile === 'shorts') { res.status(400).json({ error: 'Automatic long-form editing requires Long Video or Mixed Media.' }); return; }
  }

  if (!safeSegment(scriptId)) {
    res.status(400).json({ error: 'scriptId (string) is required' });
    return;
  }
  if (!Array.isArray(imagePaths) || imagePaths.length === 0 || imagePaths.length > (currentWorkspace().profile !== 'shorts' ? 160 : 100) || imagePaths.some(p => typeof p !== 'string' || !p)) {
    res.status(400).json({ error: 'imagePaths (non-empty array) is required' });
    return;
  }
  if (!audioPath || typeof audioPath !== 'string') {
    res.status(400).json({ error: 'audioPath (string) is required' });
    return;
  }

  if (clearingRenders.has(workspaceKey(scriptId)) || [...activeRenders.values()].some(entry => entry.status === 'running')) {
    res.status(409).json({ error: 'A render is already in progress. Wait for it or cancel it before starting another.' });
    return;
  }

  if ((resolution && !((resolution.width === 1080 && resolution.height === 1920) || (resolution.width === 1920 && resolution.height === 1080))) ||
      [zoomFactor, transitionDuration, bgmVolume, ttsVolume].some(v => v !== undefined && (!Number.isFinite(v) || v < 0 || v > 5)) ||
      (narration !== undefined && typeof narration !== 'string') ||
      (bgmTrack !== undefined && typeof bgmTrack !== 'string') ||
      (colorGrade !== undefined && typeof colorGrade !== 'string') ||
      (sceneAnalysis && (typeof sceneAnalysis !== 'object' || ['effects', 'transitions', 'timings'].some(key => sceneAnalysis[key] !== undefined && !Array.isArray(sceneAnalysis[key]))))) {
    res.status(400).json({ error: 'Invalid render options' }); return;
  }
  const controller = new AbortController();
  let finish!: () => void;
  const finished = new Promise<void>(resolve => { finish = resolve; });
  const job = { controller, finished, status: 'running' as 'running' | 'done' | 'error', progress: 5, error: undefined as string | undefined };
  activeRenders.set(workspaceKey(scriptId), job);
  let finalDuration: number;
  let longSync: NarrationSync | undefined;
  let longPlan: ScenePlan | undefined;
  let resolvedBgm: string | null = null;
  try {
    resolvedBgm = bgmTrack === 'ai' ? resolveGeneratedMusic(scriptId) : bgmTrack ? resolveMusicTrack(bgmTrack) : null;
    const resolvedAudio = resolveInputPath(audioPath, scriptId);
    if (currentWorkspace().profile !== 'shorts') {
      if (narrationStatus(scriptId).status === 'running') throw new Error('Wait for synchronized narration to finish.');
      const script = store.getById<any>('scripts', scriptId);
      if (script?.generatedAudio?.[0]?.filename !== path.basename(resolvedAudio)) throw new Error('Select the latest synchronized narration before rendering.');
      longSync = assertNarrationCurrent(script, path.basename(resolvedAudio));
      longPlan = script.scenePlan;
      if (imagePaths.length !== longPlan!.scenes.length) throw new Error('Every narration scene needs exactly one image.');
      longPlan!.scenes.forEach((scene, index) => {
        const image = script.generatedImages?.find((image: any) => image.index === index);
        if ((image?.mediaType || 'image') !== (scene.mediaType || 'image')) throw new Error(`Scene ${scene.id} needs the correct media type.`);
        if (!image || image.status !== 'done' || image.prompt !== scene.imagePrompt || resolveInputPath(image.url, scriptId) !== resolveInputPath(imagePaths[index], scriptId)) throw new Error(`Scene ${scene.id} has a missing, stale or reordered image.`);
      });
      if (timelineConfig?.clips) timelineConfig.clips.forEach((clip: any, i: number) => {
        const timing = longSync!.scenes[i];
        if (!timing || Math.abs(clip.duration - (timing.endSample - timing.startSample) / longSync!.sampleRate) > 0.000001 || clip.transition !== 'none') throw new Error('Long Video scene boundaries follow narration. Restore the synchronized timeline; use cuts between scenes.');
      });
    }
    for (const image of imagePaths) {
      if (!fs.existsSync(resolveInputPath(image, scriptId))) throw new Error('A scene image is missing');
    }
    finalDuration = await probeAudioDuration(resolvedAudio);
    if (!Number.isFinite(finalDuration) || finalDuration <= 0) throw new Error('Cannot measure narration duration');
    const maximum = store.getById<any>('scripts', scriptId)?.maxDurationSeconds;
    if (maximum !== undefined && (!Number.isFinite(maximum) || maximum <= 0 || finalDuration > maximum)) throw new Error(`This episode has a ${maximum / 60}-minute maximum. Shorten the narration before rendering.`);
    if (timelineConfig) {
      if (!Array.isArray(timelineConfig.clips) || timelineConfig.clips.length !== imagePaths.length) throw new Error('Timeline scene count must match images');
      planTimeline(timelineConfig.clips, finalDuration);
    }
    if (controller.signal.aborted) throw new Error('Render cancelled');
    if (currentWorkspace().profile === 'mixed') {
      removePreviousRenders(getOutputDir(scriptId));
      const script = store.getById<any>('scripts', scriptId);
      if (script) store.add('scripts', { ...script, youtubeExport: undefined });
    }
  } catch (error) {
    job.status = 'error'; job.error = error instanceof Error ? error.message : 'Invalid render input';
    finish();
    res.status(400).json({ error: job.error }); return;
  }

  // Generate subtitles if enabled and narration provided
  let subtitlePath: string | undefined = undefined;
  if (enableSubtitles && narration && !longSync) {
    try {
      subtitlePath = generateSubtitleFile({
        scriptId,
        narration,
        duration: finalDuration,
      });
      if (presenter?.enabled) fs.writeFileSync(subtitlePath, reservePresenterCaptionSpace(fs.readFileSync(subtitlePath, 'utf8'), presenter, presenterSourceSize, resolution || { width: 1080, height: 1920 }));
    } catch (subErr) {
      console.warn(`Subtitle generation failed for ${scriptId}:`, subErr);
    }
  }

  // Resolve background music path if selected


  // Start render in background
  const scriptForPresenter = store.getById<any>('scripts', scriptId);
  if (presenter && scriptForPresenter) store.add('scripts', { ...scriptForPresenter, presenter });
  const revision = renderRevision(scriptId);
  const renderOptions = {
    signal: controller.signal,
    scriptId,
    imagePaths,
    audioPath,
    duration,
    resolution,
    zoomFactor,
    transitionDuration,
    timelineConfig,
    sceneAnalysis,
    enableSubtitles: Boolean(enableSubtitles && (longSync || subtitlePath)),
    subtitlePath,
    bgmPath: resolvedBgm || undefined,
    bgmVolume: typeof bgmVolume === 'number' ? bgmVolume : 0.15,
    ttsVolume: typeof ttsVolume === 'number' ? ttsVolume : 1.0,
    colorGrade: typeof colorGrade === 'string' ? colorGrade : undefined,
    enableVignette: enableVignette !== false,
    enableSfx: enableSfx !== false,
    editing,
    presenter,
    presenterSourceSize,
    onProgress: (percent) => {
      const entry = activeRenders.get(workspaceKey(scriptId));
      if (entry === job) {
        entry.progress = presenter?.enabled ? Math.min(99, 45 + Math.round(percent * 0.54)) : percent;
        entry.stage = percent >= 95 && presenter?.enabled ? 'Compositing presenter' : 'Rendering story scenes';
      }
    },
  } as RenderOptions;
  (async () => {
    if (presenter?.enabled) {
      renderOptions.presenterPath = await generatePresenter(scriptId, resolveInputPath(audioPath, scriptId), presenter,
        AbortSignal.any([controller.signal, AbortSignal.timeout(2 * 60 * 60 * 1000)]), (stage, percent) => {
          const entry = activeRenders.get(workspaceKey(scriptId));
          if (entry === job) { entry.stage = stage; entry.progress = Math.min(44, Math.round(percent * 0.44)); }
        });
    }
    controller.signal.throwIfAborted();
    if (revision && renderRevision(scriptId) !== revision) throw new Error('The story or presenter settings changed. Render again with the current settings.');
    return longSync && longPlan ? renderLongVideo(renderOptions, longPlan, longSync) : renderVideo(renderOptions);
  })()
    .then((result) => {
      if (revision && renderRevision(scriptId) !== revision) {
        fs.rmSync(result.outputPath, { force: true });
        throw new Error('Scene assets changed during rendering. Render the current scene map again.');
      }
      atomicJson(`${result.outputPath}.json`, { revision, resolution: `${resolution?.width || 1080}x${resolution?.height || 1920}`, duration: result.duration });
      const entry = activeRenders.get(workspaceKey(scriptId));
      if (entry === job) {
        entry.status = 'done';
        entry.progress = 100;
      }
      console.log(`Render completed for ${scriptId}: ${result.filename}`);
    })
    .catch((err: any) => {
      const entry = activeRenders.get(workspaceKey(scriptId));
      if (entry === job) {
        entry.status = 'error';
        entry.error = err.message;
      }
      console.error(`Render failed for ${scriptId}:`, err.message);
    }).finally(finish);

  res.json({ ok: true, message: 'Render started', scriptId });
});

renderRouter.post('/cancel', (req, res) => {
  const { scriptId } = req.body || {};
  const entry = activeRenders.get(workspaceKey(scriptId));
  if (entry) {
    entry.controller.abort();
    entry.error = 'Render cancelling';
    res.json({ ok: true, cancelled: true });
  } else {
    res.json({ ok: true, cancelled: false, message: 'No active render for this script' });
  }
});

renderRouter.get('/status/:scriptId', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const { scriptId } = req.params;
  const entry = activeRenders.get(workspaceKey(scriptId));
  
  if (entry) {
    if (entry.status === 'running') {
      res.json({ status: 'running', progress: entry.progress || 5, message: entry.stage || 'Preparing render' });
      return;
    }
    if (entry.status === 'error') {
      res.json({ status: 'error', error: entry.error });
      return;
    }
    if (entry.status === 'done') {
      // fall through to list videos
    }
  }

  const outputDir = getOutputDir(scriptId);
  let videos: string[] = [];

  if (fs.existsSync(outputDir)) {
    videos = fs.readdirSync(outputDir)
      .filter(f => f.endsWith('.mp4') && !f.endsWith('.partial.mp4'))
      .filter(f => isCurrentRender(scriptId, path.join(outputDir, f)))
      .sort((a, b) => fs.statSync(path.join(outputDir, b)).mtimeMs - fs.statSync(path.join(outputDir, a)).mtimeMs);
  }

  res.json({ 
    status: videos.length > 0 ? 'done' : 'idle',
    videos: videos.map(f => ({ 
      filename: f, 
      url: getVideoUrl(scriptId, f),
      ...readRenderMetadata(path.join(outputDir, `${f}.json`))
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
  if (!filePath || !isCurrentRender(scriptId, filePath)) {
    res.status(404).end();
    return;
  }

  res.sendFile(filePath);
});

function readRenderMetadata(file: string): { resolution?: string; duration?: number } {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}
