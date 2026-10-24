import { mediaScenes } from '../services/shorts-media.js';
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
import { synchronizedCaptionAss } from '../services/final-captions.js';
import { listMusicTracks, resolveMusicTrack, ensureDefaultMusicTracks } from '../services/music.js';
import { startMusic, musicJobStatus, musicInstalled, cancelMusic, resolveGeneratedMusic, generateMusicPrompt } from '../services/local-music.js';
import fs from 'fs';
import path from 'path';
import { generatePresenter, presenterHealth } from '../services/presenter.js';
import { validatePresenter, reservePresenterCaptionSpace, type PresenterSettings } from '../services/presenter-settings.js';
import { compositeSavedGraphics, savedGraphicsForRender, graphicsCameras } from '../services/render-graphics.js';
import { retentionEditing } from '../services/retention.js';
import { saveRenderJob, readRenderJob, removeRenderJob } from '../services/render-jobs.js';

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
    removeRenderJob(scriptId);
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

const startRender: import('express').RequestHandler = async (req, res) => {
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
  } else if (store.getById<any>('scripts', req.body?.scriptId)?.scenePlan) {
    if (req.body?.resolution && (req.body.resolution.width !== 1080 || req.body.resolution.height !== 1920)) {
      res.status(400).json({ error: 'Scene-based Shorts require portrait 1080 × 1920 output.' }); return;
    }
    req.body = { ...req.body, resolution: { width: 1080, height: 1920 } };
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
    if (editing.enabled && currentWorkspace().profile === 'shorts' && !store.getById<any>('scripts', req.body?.scriptId)?.scenePlan) { res.status(400).json({ error: 'Automatic long-form editing requires Long Video or Mixed Media.' }); return; }
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
  const request = Object.fromEntries(['scriptId', 'imagePaths', 'audioPath', 'narration', 'duration', 'resolution', 'zoomFactor', 'transitionDuration', 'timelineConfig', 'sceneAnalysis', 'enableSubtitles', 'bgmTrack', 'bgmVolume', 'ttsVolume', 'colorGrade', 'enableVignette', 'enableSfx', 'editing', 'presenter'].filter(key => req.body[key] !== undefined).map(key => [key, req.body[key]]));
  let persistedRevision = renderRevision(scriptId), lastSaved = 0;
  const persist = (force = false, outputFilename?: string) => {
    if (!force && Date.now() - lastSaved < 1000) return;
    try {
      saveRenderJob({ scriptId, request, revision: persistedRevision, status: job.status === 'error' && controller.signal.aborted ? 'cancelled' : job.status,
        progress: job.progress, stage: (job as { stage?: string }).stage, error: job.error, outputFilename });
    } catch (error) {
      if (force) throw error;
      job.status = 'error'; job.error = 'Could not save render progress. Check available disk space and data-folder access.'; controller.abort();
      console.error(job.error); return;
    }
    lastSaved = Date.now();
  };
  try { persist(true); } catch (error) { activeRenders.delete(workspaceKey(scriptId)); finish(); res.status(500).json({ error: 'Could not save the render job. The render was not started.' }); return; }
  let finalDuration: number;
  let longSync: NarrationSync | undefined;
  let longPlan: ScenePlan | undefined;
  let resolvedBgm: string | null = null;
  let savedGraphics: ReturnType<typeof savedGraphicsForRender>;
  let savedCameras: ReturnType<typeof graphicsCameras> | undefined;
  let savedMotionCaptions = false;
  let hasVisualArtifacts = false;
  let effectiveEditing = editing;
  try {
    resolvedBgm = bgmTrack === 'ai' ? resolveGeneratedMusic(scriptId) : bgmTrack ? resolveMusicTrack(bgmTrack) : null;
    const resolvedAudio = resolveInputPath(audioPath, scriptId);
    if (currentWorkspace().profile !== 'shorts' || store.getById<any>('scripts', scriptId)?.scenePlan) {
      if (narrationStatus(scriptId).status === 'running') throw new Error('Wait for synchronized narration to finish.');
      const script = store.getById<any>('scripts', scriptId);
      effectiveEditing = editing ?? retentionEditing(script);
      if (script?.generatedAudio?.[0]?.filename !== path.basename(resolvedAudio)) throw new Error('Select the latest synchronized narration before rendering.');
      longSync = assertNarrationCurrent(script, path.basename(resolvedAudio));
      longPlan = { ...script.scenePlan, scenes: mediaScenes({ ...script, section: currentWorkspace().profile }) };
      if (imagePaths.length !== longPlan!.scenes.length) throw new Error('Every narration scene needs exactly one image.');
      longPlan!.scenes.forEach((scene, index) => {
        let image = script.generatedImages?.find((image: any) => image.index === index && (image.mediaType || 'image') === (scene.mediaType || 'image'));
        if (!image) {
          image = script.generatedImages?.find((image: any) => image.index === index);
          if (image && (!image.mediaType || image.mediaType === 'image')) {
            scene.mediaType = 'image';
          }
        }
        if (!image || image.status !== 'done' || resolveInputPath(image.url, scriptId) !== resolveInputPath(imagePaths[index], scriptId)) throw new Error(`Scene ${scene.id} has a missing, stale or reordered image.`);
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
    savedGraphics = savedGraphicsForRender(scriptId, audioPath, imagePaths, resolution || { width: 1080, height: 1920 });
    hasVisualArtifacts = Boolean(savedGraphics?.artifacts.some(a => a.enabled && (a.graphic || a.sceneGraph)));
    if (savedGraphics) {
      savedCameras = graphicsCameras(savedGraphics, { scriptId, imagePaths, audioPath, timelineConfig, sceneAnalysis, zoomFactor, transitionDuration, editing: effectiveEditing }, finalDuration, longPlan, longSync);
      savedMotionCaptions = savedGraphics.artifacts.some(a => a.enabled && a.graphic?.kind === 'caption');
    }
    if (controller.signal.aborted) throw new Error('Render cancelled');
    if (currentWorkspace().profile === 'mixed') {
      removePreviousRenders(getOutputDir(scriptId));
      const script = store.getById<any>('scripts', scriptId);
      if (script) store.add('scripts', { ...script, youtubeExport: undefined, facebookExport: undefined, instagramExport: undefined });
    }
  } catch (error) {
    job.status = 'error'; job.error = error instanceof Error ? error.message : 'Invalid render input';
    try { persist(true); } catch (storageError) { console.error('Could not save failed render status:', storageError); }
    finish();
    res.status(400).json({ error: job.error }); return;
  }

  // Generate subtitles if enabled and narration provided
  let subtitlePath: string | undefined = undefined;
  if (enableSubtitles && !savedMotionCaptions && narration && !longSync) {
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
  persistedRevision = revision;
  try { persist(true); } catch (error) { job.status = 'error'; job.error = 'Could not save the validated render inputs. Check the data folder.'; finish(); res.status(500).json({ error: job.error }); return; }
  const renderOptions = {
    polishAudio: Boolean(scriptForPresenter?.retentionPlan && scriptForPresenter?.retentionEdit && effectiveEditing?.enabled !== false),
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
    enableSubtitles: Boolean(enableSubtitles && !hasVisualArtifacts && (longSync || subtitlePath)),
    subtitlePath,
    bgmPath: resolvedBgm || undefined,
    bgmVolume: typeof bgmVolume === 'number' ? bgmVolume : 0.15,
    ttsVolume: typeof ttsVolume === 'number' ? ttsVolume : 1.0,
    colorGrade: typeof colorGrade === 'string' ? colorGrade : undefined,
    enableVignette: enableVignette !== false,
    enableSfx: enableSfx !== false,
    editing: hasVisualArtifacts && effectiveEditing ? { ...effectiveEditing, captions: false } : effectiveEditing,
    presenter,
    presenterSourceSize,
    onProgress: (percent) => {
      const entry = activeRenders.get(workspaceKey(scriptId));
      if (entry === job) {
        entry.progress = (savedGraphics && hasVisualArtifacts) ? (presenter?.enabled ? Math.min(65, 45 + Math.round(percent * 0.20)) : Math.min(65, Math.round(percent * 0.65))) : presenter?.enabled ? Math.min(99, 45 + Math.round(percent * 0.54)) : percent;
        entry.stage = percent >= 95 && presenter?.enabled ? 'Compositing presenter' : 'Rendering story scenes';
        persist();
      }
    },
  } as RenderOptions;
  (async () => {
    if (presenter?.enabled) {
      renderOptions.presenterPath = await generatePresenter(scriptId, resolveInputPath(audioPath, scriptId), presenter,
        AbortSignal.any([controller.signal, AbortSignal.timeout(2 * 60 * 60 * 1000)]), (stage, percent) => {
          const entry = activeRenders.get(workspaceKey(scriptId));
          if (entry === job) { entry.stage = stage; entry.progress = Math.min(44, Math.round(percent * 0.44)); persist(); }
        });
    }
    controller.signal.throwIfAborted();
    if (revision && renderRevision(scriptId) !== revision) throw new Error('The story or presenter settings changed. Render again with the current settings.');
    return longSync && longPlan ? renderLongVideo(renderOptions, longPlan, longSync) : renderVideo(renderOptions);
  })()
    .then(async (result) => {
      try {
        let finalCaptionPath: string | undefined;
        if (hasVisualArtifacts && enableSubtitles && !savedMotionCaptions && (!effectiveEditing?.enabled || effectiveEditing.captions)) {
          if (longPlan && longSync) {
            finalCaptionPath = path.join(getOutputDir(scriptId), `${result.filename}.captions.ass`);
            fs.writeFileSync(finalCaptionPath, reservePresenterCaptionSpace(synchronizedCaptionAss(longPlan, longSync,
              resolution?.width || 1080, resolution?.height || 1920, effectiveEditing), presenter, presenterSourceSize,
              resolution || { width: 1080, height: 1920 }));
          } else finalCaptionPath = subtitlePath;
        }
        if (savedGraphics && hasVisualArtifacts) await compositeSavedGraphics(result, savedGraphics, controller.signal, (stage, progress) => {
          const entry = activeRenders.get(workspaceKey(scriptId));
          if (entry === job) { entry.stage = stage; entry.progress = progress; persist(); }
        }, savedCameras, finalCaptionPath, enableSfx !== false);
        controller.signal.throwIfAborted();
        if (revision && renderRevision(scriptId) !== revision) {
          throw new Error('The story, scene assets or motion graphics changed during rendering. Render again with the current settings.');
        }
        atomicJson(`${result.outputPath}.json`, { revision, resolution: `${resolution?.width || 1080}x${resolution?.height || 1920}`, duration: result.duration });
        const entry = activeRenders.get(workspaceKey(scriptId));
        if (entry === job) {
          entry.status = 'done';
          entry.progress = 100;
          persist(true, result.filename);
        }
        console.log(`Render completed for ${scriptId}: ${result.filename}`);
      } catch (error) {
        fs.rmSync(result.outputPath, { force: true });
        fs.rmSync(`${result.outputPath}.json`, { force: true });
        throw error;
      }
    })
    .catch((err: any) => {
      const entry = activeRenders.get(workspaceKey(scriptId));
      if (entry === job) {
        entry.status = 'error';
        entry.error = err.message;
        try { persist(true); } catch (storageError) { console.error('Could not save failed render status:', storageError); }
      }
      console.error(`Render failed for ${scriptId}:`, err.message);
    }).finally(finish);

  res.json({ ok: true, message: 'Render started', scriptId });
};
renderRouter.post('/start', startRender);
renderRouter.post('/resume/:scriptId', async (req, res, next) => {
  try {
    const job = readRenderJob(req.params.scriptId);
    if (!job || !['interrupted', 'error', 'cancelled'].includes(job.status)) { res.status(409).json({ error: 'There is no interrupted or failed render to restart.' }); return; }
    if (job.revision !== renderRevision(req.params.scriptId)) { res.status(409).json({ error: 'The production changed. Start a new render with the current settings.' }); return; }
    req.body = job.request;
    await startRender(req, res, next);
  } catch (error) { next(error); }
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
  const persisted = entry?.status === 'running' ? undefined : readRenderJob(scriptId);
  if (persisted && ['error', 'interrupted', 'cancelled'].includes(persisted.status)) {
    res.json({ status: 'error', error: persisted.error || 'Render interrupted', recoverable: true, interrupted: persisted.status === 'interrupted', progress: persisted.progress }); return;
  }
  
  if (entry) {
    if (entry.status === 'running') {
      res.json({ status: 'running', progress: entry.progress || 5, message: entry.stage || 'Preparing render' });
      return;
    }
    if (entry.status === 'error' && persisted?.status !== 'done') {
      res.json({ status: 'error', error: entry.error, recoverable: Boolean(persisted && ['error', 'interrupted', 'cancelled'].includes(persisted.status)) });
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
