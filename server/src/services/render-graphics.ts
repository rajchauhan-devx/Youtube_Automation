import { compileExtraPopupToMotionGraphic } from './extra-popups-engine.js';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { motionProject, assertDocumentaryVisuals, assertGraphicsReviewed, RENDERER_VERSION, type EditingProject } from '@tubeflow/editing-contracts';
import { legacyMotion, legacySourceMatrix, targetOnScreen, targetMostlyVisible, intersects, type LegacyCamera } from '@tubeflow/video-composition';
import { current, hash, objectHash, assetRecord, projectDir, publish } from './editing/repository.js';
import { scriptFingerprint } from './editing/projects.js';
import { renderHyperFramesOverlay } from './editing/hyperframes-renderer.js';
import { resolveInputPath, canUseNvenc, videoEncoderFlags, type RenderResult, type RenderOptions } from './video.js';
import { autoEditPlan } from './auto-edit.js';
import { planTimeline, FPS } from './timeline.js';
import type { ScenePlan, NarrationSync } from './scene-plan.js';
import { runMedia } from './media-process.js';
import { store } from './store.js';
import { motionSoundEvents, motionAudioFilter } from './editing/motionAudio.js';

/** Respect run choices even when a previous project still contains graphics. */
export function graphicsForRun(project: EditingProject, settings?: { graphics: { enabled: boolean }; captions: string }) {
  const selected = motionProject(project);
  if (settings) selected.artifacts = selected.artifacts.filter(a => a.graphic?.kind === 'caption'
    ? settings.captions === 'motion' : settings.graphics.enabled);
  return selected;
}

export function graphicsRenderRevision(script: { editingProjectId?: string; dynamicMotionGraphics?: any[]; extraPopups?: any[]; autoPilotSettings?: { graphics: { enabled: boolean }; captions: string } }) {
  const hasDynamic = (script.dynamicMotionGraphics && Array.isArray(script.dynamicMotionGraphics) && script.dynamicMotionGraphics.length > 0) ||
    (script.extraPopups && Array.isArray(script.extraPopups) && script.extraPopups.some((p: any) => p.status === 'ready'));
  if (hasDynamic) {
    return { version: 1, rendererVersion: RENDERER_VERSION, projectId: script.editingProjectId || 'dynamic', hash: objectHash({ dmg: script.dynamicMotionGraphics, ep: script.extraPopups }) };
  }
  if (!script.editingProjectId) return undefined;
  if (script.autoPilotSettings?.graphics.enabled === false && script.autoPilotSettings.captions !== 'motion') return undefined;
  try {
    const project = graphicsForRun(current(script.editingProjectId), script.autoPilotSettings);
    if (!project.artifacts.some(artifact => artifact.enabled)) return undefined;
    const rendererVersion = RENDERER_VERSION;
    return { version: 1, rendererVersion, projectId: project.id, revisionId: project.revisionId, hash: objectHash(project) };
  } catch {
    // Never advertise an older graphics render as current when its project is unavailable.
    return { version: 1, projectId: script.editingProjectId, unavailable: true };
  }
}

function dynamicMotionProjectForRender(
  script: any, audioPath: string, imagePaths: string[], resolution: { width: number; height: number }, duration?: number
): EditingProject | undefined {
  const fps = 30;
  const scriptId = script.id;
  const resolvedAudio = resolveInputPath(audioPath, scriptId);
  const audioBuffer = fs.existsSync(resolvedAudio) ? fs.readFileSync(resolvedAudio) : Buffer.alloc(0);
  const audioHash = hash(audioBuffer);
  const audioFilename = path.basename(resolvedAudio);
  const numScenes = Math.max(1, imagePaths.length);
  const totalDuration = duration && duration > 0 ? duration : (script.duration || 25);
  const sceneDur = totalDuration / numScenes;

  // Read exact scene timing boundaries from narration sync when available
  const sceneStarts: number[] = [];
  const sceneEnds: number[] = [];
  const syncFile = `${resolvedAudio}.sync.json`;
  if (fs.existsSync(syncFile)) {
    try {
      const syncData = JSON.parse(fs.readFileSync(syncFile, 'utf8'));
      if (Array.isArray(syncData.scenes)) {
        for (const sc of syncData.scenes) {
          sceneStarts.push((sc.startSample || 0) / (syncData.sampleRate || 48000));
          sceneEnds.push((sc.endSample || 0) / (syncData.sampleRate || 48000));
        }
      }
    } catch (err) {
      console.warn('[render-graphics] Could not load sync file for exact scene boundaries:', err);
    }
  }

  const dynamicGraphics: any[] = Array.isArray(script?.dynamicMotionGraphics) ? [...script.dynamicMotionGraphics] : [];
  if (Array.isArray(script?.extraPopups)) {
    const readyPopups = script.extraPopups.filter((p: any) => {
      if (p.status !== 'ready') return false;
      const isGraphicCard = ['metric_counter', 'mystery_hook', 'heritage_intel', 'blueprint_diagram'].includes(p.shape) ||
        ['metric_counter', 'mystery_hook', 'heritage_intel', 'blueprint_diagram'].includes(p.archetype);
      return Boolean(p.imageUrl || isGraphicCard);
    });

    for (const p of readyPopups) {
      const sIdx = typeof p.sceneIndex === 'number' ? p.sceneIndex : 0;
      const sceneStartSec = sceneStarts[sIdx] ?? (sIdx * sceneDur);
      const sceneEndSec = sceneEnds[sIdx] ?? Math.min(totalDuration, (sIdx + 1) * sceneDur);
      const sceneLength = Math.max(2.0, sceneEndSec - sceneStartSec);

      const cueOffset = typeof p.cueOffsetSec === 'number'
        ? Math.min(p.cueOffsetSec, Math.max(0.4, sceneLength - 2.8))
        : 1.0;
      const graphicStartSec = sceneStartSec + cueOffset;
      const maxAllowedDur = Math.max(1.8, (sceneEndSec - graphicStartSec) - 0.35);
      const popupDur = Math.min(p.durationSec || 3.2, maxAllowedDur);

      const compiled = compileExtraPopupToMotionGraphic(p, {
        width: resolution.width,
        height: resolution.height,
        startSec: graphicStartSec,
        durationSec: popupDur,
        fps,
      });
      if (!dynamicGraphics.some((g: any) => g.id === compiled.id)) {
        dynamicGraphics.push(compiled);
      }
    }
  }

  if (dynamicGraphics.length === 0) {
    return undefined;
  }

  const projectId = script.editingProjectId || randomUUID();
  const revisionId = randomUUID();
  const assetIds = imagePaths.map(() => randomUUID());

  const artifacts = dynamicGraphics.map((dmg: any, idx: number) => {
    const sIdx = typeof dmg.sceneIndex === 'number' ? dmg.sceneIndex : idx;
    const sceneStartSec = sceneStarts[sIdx] ?? (sIdx * sceneDur);
    const sceneEndSec = sceneEnds[sIdx] ?? Math.min(totalDuration, (sIdx + 1) * sceneDur);

    let graphicStartSec = sceneStartSec + 1.0;
    if (typeof dmg.startSec === 'number') {
      if (dmg.startSec >= sceneStartSec && dmg.startSec < sceneEndSec) {
        graphicStartSec = dmg.startSec;
      } else if (dmg.startSec >= 0 && dmg.startSec < (sceneEndSec - sceneStartSec)) {
        graphicStartSec = sceneStartSec + dmg.startSec;
      } else {
        graphicStartSec = dmg.startSec;
      }
    }
    const maxDur = Math.max(1.8, (sceneEndSec - graphicStartSec) - 0.35);
    const graphicDur = Math.min(dmg.durationSec || 3.2, maxDur);
    const startFrame = Math.round(graphicStartSec * fps);
    const endFrame = Math.round((graphicStartSec + graphicDur) * fps);

    return {
      id: dmg.id || `art-dm-${idx}`,
      sceneId: `scene-${sIdx}`,
      enabled: true,
      intent: `${dmg.type}: ${dmg.title}`,
      narrativeRefs: [],
      startFrame,
      endFrame,
      priority: 1,
      nodes: [],
      assetRequestIds: [],
      dynamicMotion: dmg,
    };
  });

  const project = {
    id: projectId,
    revisionId,
    scriptId,
    accountId: script.accountId || 'default',
    createdAt: new Date().toISOString(),
    status: 'ready' as const,
    inputs: {
      scriptId,
      title: script.name || 'Short',
      scriptText: script.narration || '',
      narrationText: script.narration || '',
      narrationHash: audioHash,
      language: 'hi' as const,
      audioAssetId: randomUUID(),
      fps,
      width: resolution.width,
      height: resolution.height,
      durationFrames: Math.round(totalDuration * fps),
      sceneTiming: imagePaths.map((_, i) => ({
        sceneId: `scene-${i}`,
        startFrame: Math.round(i * sceneDur * fps),
        endFrame: Math.round((i + 1) * sceneDur * fps),
      })),
      imageAssets: imagePaths.map((url, i) => {
        const file = resolveInputPath(url, scriptId);
        const buf = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0);
        return {
          assetId: assetIds[i],
          promptIndex: i,
          prompt: script.imagePrompts?.[i] || '',
          hash: hash(buf),
          role: 'still' as const,
        };
      }),
      videoAssets: [],
      audioFilename,
      audioHash,
      scriptHash: scriptFingerprint(script),
    },
    settings: {
      graphicEngine: 'generative' as const,
      motionLevel: 'expressive' as const,
      density: 'balanced' as const,
      visualReview: false,
      stylePreference: 'Vedic Gold',
      documentary: false,
      treatment: 'cinematic' as const,
      maxProviderCalls: 10,
      maxGeneratedAssets: 4,
    },
    style: {
      id: 'style-vedic',
      direction: 'Vedic Gold',
      colors: { primary: '#FFD700', secondary: '#FFE082' },
      fontAssetIds: [],
      headingSize: 56,
      bodySize: 42,
      lineWeight: 4,
      textureAssetIds: [],
      shapeTreatment: 'Vedic Gold Kinetic Line',
      motionIntensity: 0.8,
      minReadingSeconds: 2.5,
      minContrast: 4.5,
    },
    scenes: imagePaths.map((_, i) => ({
      id: `scene-${i}`,
      assetId: assetIds[i],
      startFrame: Math.round(i * sceneDur * fps),
      endFrame: Math.round((i + 1) * sceneDur * fps),
      narrativeRefs: [],
      transitionFrames: 0,
      reservedRegions: [],
      framing: 'contain' as const,
      camera: [{ frame: 0, x: 0, y: 0, scale: 1 }],
    })),
    artifacts: artifacts as any,
    assetIds: [],
    diagnostics: [],
  } as unknown as EditingProject;

  return project;
}

export function savedGraphicsForRender(
  scriptId: string, audioPath: string, imagePaths: string[], resolution: { width: number; height: number }, duration?: number,
): EditingProject | undefined {
  const script = store.getById<any>('scripts', scriptId);
  const hasDynamic = (script?.dynamicMotionGraphics && Array.isArray(script.dynamicMotionGraphics) && script.dynamicMotionGraphics.length > 0) ||
    (script?.extraPopups && Array.isArray(script.extraPopups) && script.extraPopups.some((p: any) => p.status === 'ready'));
  if (hasDynamic) {
    const dynProj = dynamicMotionProjectForRender(script, audioPath, imagePaths, resolution, duration);
    if (dynProj) return dynProj;
  }
  if (!script?.editingProjectId) return undefined;
  if (script.autoPilotSettings?.graphics.enabled === false && script.autoPilotSettings.captions !== 'motion') return undefined;
  const raw = current(script.editingProjectId);
  assertDocumentaryVisuals(raw);
  const project = graphicsForRun(raw, script.autoPilotSettings);
  if (!project.artifacts.some(artifact => artifact.enabled)) return undefined;
  if (project.scriptId !== scriptId) throw new Error('The saved motion graphics belong to another script. Generate graphics for this script.');
  assertGraphicsReviewed(project);
  if (!['ready', 'partial'].includes(project.status)) throw new Error('Finish generating motion graphics in Artifacts before rendering.');
  if (project.inputs.scriptHash !== scriptFingerprint(script)) throw new Error('The saved motion graphics use older media or narration. Generate a new revision in Artifacts before rendering.');
  if (project.inputs.width !== resolution.width || project.inputs.height !== resolution.height) throw new Error('Use the saved motion graphics video format, or generate graphics for the new format.');
  if (path.basename(resolveInputPath(audioPath, scriptId)) !== project.inputs.audioFilename
    || hash(fs.readFileSync(resolveInputPath(audioPath, scriptId))) !== project.inputs.audioHash) throw new Error('Select the narration used to generate the saved motion graphics.');
  if (imagePaths.length !== project.inputs.imageAssets.length || imagePaths.some((url, index) => {
    const input = project.inputs.imageAssets[index];
    const selected = script.generatedImages?.find((image: any) => image.index === input.promptIndex && image.status === 'done'
      && resolveInputPath(image.url, scriptId) === resolveInputPath(url, scriptId));
    return !selected || hash(fs.readFileSync(resolveInputPath(url, scriptId))) !== input.hash;
  })) throw new Error('Saved motion graphics require their original scene media and order. Generate a new Artifacts revision after changing scenes.');
  return project;
}

/** Source anchors follow the edited footage; authored graphic data remains untouched. */
export function graphicsCameras(project: EditingProject, options: RenderOptions, duration: number, plan?: ScenePlan, sync?: NarrationSync) {
  const cameras: Record<string, LegacyCamera> = {};
  const editing = plan && options.editing?.enabled ? options.editing : undefined;
  const decisions = plan && editing ? autoEditPlan(plan, editing) : undefined;
  const weights = options.sceneAnalysis?.timings?.length === options.imagePaths.length && options.sceneAnalysis.timings.every(t => Number.isFinite(t) && t > 0)
    ? options.sceneAnalysis.timings : options.imagePaths.map(() => 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const clips = options.timelineConfig?.clips || weights.map((weight, i) => ({ duration: duration * weight / totalWeight,
    transition: options.sceneAnalysis?.transitions?.[i] || 'fade', transitionDuration: options.transitionDuration ?? 0.5 }));
  const timeline = sync ? sync.scenes.map((scene, i) => {
    const startFrame = Math.round(scene.startSample * FPS / sync.sampleRate);
    const endFrame = i === sync.scenes.length - 1 ? Math.ceil(scene.endSample * FPS / sync.sampleRate) : Math.round(scene.endSample * FPS / sync.sampleRate);
    return { startFrame, endFrame, frames: endFrame - startFrame };
  }) : planTimeline(clips, duration);
  project.scenes.forEach((scene, index) => {
    const timing = timeline[index];
    if (!timing) throw new Error('Saved motion graphics scene map does not match the timeline.');
    const motion = editing && decisions
      ? { motion: editing.motion === 'off' ? 'hold' : decisions[index].motion, travel: editing.motion === 'balanced' ? 0.08 : 0.04 }
      : legacyMotion(options.sceneAnalysis?.effects?.[index] || 'zoom-in', options.zoomFactor ?? (sync ? 1.1 : 1.15));
    const camera: LegacyCamera = { startFrame: timing.startFrame, frames: timing.frames, framing: editing?.framing || 'contain', ...motion };
    cameras[scene.id] = camera;
    const spotlightsOrComps = project.artifacts.filter(a => a.enabled && a.sceneId === scene.id &&
      (a.graphic?.kind === 'spotlight' || a.graphic?.kind === 'composition'));
    if (spotlightsOrComps.length > 0) {
      const source = assetRecord(scene.assetId);
      for (const artifact of spotlightsOrComps) {
        const tolerance = 1 / project.inputs.fps + 1 / FPS;
        if (artifact.startFrame / project.inputs.fps < timing.startFrame / FPS - tolerance || artifact.endFrame / project.inputs.fps > timing.endFrame / FPS + tolerance) {
          throw new Error('Scene timing moved a spotlight away from its original media. Adjust its timing in Artifacts before rendering.');
        }
        for (let frame = artifact.startFrame; frame < artifact.endFrame; frame++) {
          if (artifact.graphic?.composition?.emphasis === 'none') break;
          const dimensions = { width: source.width!, height: source.height! };
          const box = targetOnScreen(project, artifact, frame, dimensions, legacySourceMatrix(camera, frame / project.inputs.fps, project.inputs, dimensions));
          if (!box || !targetMostlyVisible(box, project.inputs.width, project.inputs.height) || intersects(artifact.graphic!.bounds, box, project.inputs.width * 0.018)) {
            throw new Error('This framing or camera movement obscures a saved spotlight. Adjust the footage framing or spotlight position before rendering.');
          }
        }
      }
    }
  });
  return cameras;
}

/** Composite after legacy effects, copying its finished audio mix without another encode. */
export async function compositeSavedGraphics(
  result: RenderResult, project: EditingProject, signal: AbortSignal,
  progress: (stage: string, percent: number) => void,
  legacyCameras?: Record<string, LegacyCamera>,
  finalCaptionPath?: string,
  enableSfx?: boolean,
) {
  if (Math.abs(result.duration - project.inputs.durationFrames / project.inputs.fps) > 2 / project.inputs.fps) throw new Error('Motion graphics timing differs from the narration. Generate graphics again before rendering.');
  signal.throwIfAborted();
  const outputDir = path.resolve(path.dirname(result.outputPath));
  const work = fs.mkdtempSync(path.join(outputDir, 'graphics-'));
  const cache = path.join(projectDir(project.id), 'overlay-cache');
  fs.mkdirSync(cache, { recursive: true });
  const cacheKey = objectHash({ project, legacyCameras, rendererVersion: RENDERER_VERSION }).slice(0, 32);
  const overlay = path.join(cache, `${cacheKey}.webm`);
  const combined = path.join(work, 'combined.partial.mp4');
  try {
    if (!fs.existsSync(overlay)) {
      progress('Rendering saved motion graphics (HyperFrames)', 66);
      const pending = path.join(cache, `p-${randomUUID().slice(0, 8)}.webm`);
      try {
        await renderHyperFramesOverlay({
          project,
          outputPath: pending,
          signal,
          legacyCameras,
          onProgress: (pct) => progress('Rendering saved motion graphics (HyperFrames)', 66 + Math.round(28 * pct / 100)),
        });
        signal.throwIfAborted(); fs.renameSync(pending, overlay);
      } finally { fs.rmSync(pending, { force: true }); }
    } else progress('Reusing saved motion graphics', 94);
    if (signal.aborted) throw new Error('Cancelled');
    progress('Combining video and motion graphics', 95);
    if (finalCaptionPath) fs.copyFileSync(finalCaptionPath, path.join(work, 'captions.ass'));

    const sfxEntries = await motionSoundEvents(project, enableSfx);

    const inputArgs: string[] = [
      '-v', 'error', '-y', '-reinit_filter', '0', '-i', result.outputPath,
      '-c:v', 'libvpx-vp9', '-i', overlay,
    ];

    let filterComplex = savedGraphicsFilter(Boolean(finalCaptionPath));
    const audioArgs: string[] = [];

    if (sfxEntries.length > 0) {
      for (const sfx of sfxEntries) {
        inputArgs.push('-i', sfx.path);
      }
      filterComplex += ';' + motionAudioFilter(sfxEntries, 0, 2, result.duration).join(';');
      audioArgs.push('-map', '[a]', '-c:a', 'aac', '-b:a', '192k');
    } else {
      audioArgs.push('-map', '0:a', '-c:a', 'copy');
    }

    await runMedia('ffmpeg', [
      ...inputArgs,
      '-filter_complex', filterComplex,
      '-map', '[v]',
      ...audioArgs,
      ...videoEncoderFlags(await canUseNvenc(), 18),
      '-t', String(result.duration), '-movflags', '+faststart', combined,
    ], signal, work);
    signal.throwIfAborted();
    const probe = JSON.parse(await runMedia('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', combined], signal));
    for (const type of ['video', 'audio']) {
      const stream = probe.streams.find((stream: any) => stream.codec_type === type);
      if (!stream || !Number.isFinite(Number(stream.duration)) || Math.abs(Number(stream.duration) - result.duration) > 1 / FPS + 0.001) {
        throw new Error(`Composited ${type} duration does not match narration. Output was not published.`);
      }
    }
    fs.renameSync(combined, result.outputPath);
    result.size = fs.statSync(result.outputPath).size;
    return result;
  } finally {
    const relative = path.relative(outputDir, path.resolve(work));
    if (!relative.startsWith('..') && !path.isAbsolute(relative) && path.dirname(work) === outputDir) {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }
}

export function savedGraphicsFilter(captions: boolean) {
  return `[0:v]setpts=PTS-STARTPTS[base];[1:v]setpts=PTS-STARTPTS[graphics];[base][graphics]overlay=eof_action=pass:repeatlast=0:format=auto${captions ? ',ass=captions.ass:shaping=complex' : ''},format=yuv420p[v]`;
}
