import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { motionProject, assertDocumentaryVisuals, assertGraphicsReviewed, RENDERER_VERSION, type EditingProject } from '@tubeflow/editing-contracts';
import { legacyMotion, legacySourceMatrix, targetOnScreen, targetMostlyVisible, intersects, type LegacyCamera } from '@tubeflow/video-composition';
import { current, hash, objectHash, assetRecord, projectDir } from './editing/repository.js';
import { scriptFingerprint } from './editing/projects.js';
import { renderHyperFramesOverlay } from './editing/hyperframes-renderer.js';
import { resolveInputPath, canUseNvenc, videoEncoderFlags, type RenderResult, type RenderOptions } from './video.js';
import { autoEditPlan } from './auto-edit.js';
import { planTimeline, FPS } from './timeline.js';
import type { ScenePlan, NarrationSync } from './scene-plan.js';
import { runMedia } from './media-process.js';
import { store } from './store.js';

/** Respect run choices even when a previous project still contains graphics. */
export function graphicsForRun(project: EditingProject, settings?: { graphics: { enabled: boolean }; captions: string }) {
  const selected = motionProject(project);
  if (settings) selected.artifacts = selected.artifacts.filter(a => a.graphic?.kind === 'caption'
    ? settings.captions === 'motion' : settings.graphics.enabled);
  return selected;
}

export function graphicsRenderRevision(script: { editingProjectId?: string; autoPilotSettings?: { graphics: { enabled: boolean }; captions: string } }) {
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

export function savedGraphicsForRender(
  scriptId: string, audioPath: string, imagePaths: string[], resolution: { width: number; height: number },
): EditingProject | undefined {
  const script = store.getById<any>('scripts', scriptId);
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
    const source = assetRecord(scene.assetId);
    for (const artifact of project.artifacts.filter(a => a.enabled && a.sceneId === scene.id &&
      (a.graphic?.kind === 'spotlight' || a.graphic?.kind === 'composition'))) {
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
  });
  return cameras;
}

/** Composite after legacy effects, copying its finished audio mix without another encode. */
export async function compositeSavedGraphics(
  result: RenderResult, project: EditingProject, signal: AbortSignal,
  progress: (stage: string, percent: number) => void,
  legacyCameras?: Record<string, LegacyCamera>,
  finalCaptionPath?: string,
) {
  if (Math.abs(result.duration - project.inputs.durationFrames / project.inputs.fps) > 2 / project.inputs.fps) throw new Error('Motion graphics timing differs from the narration. Generate graphics again before rendering.');
  signal.throwIfAborted();
  const outputDir = path.resolve(path.dirname(result.outputPath));
  const work = fs.mkdtempSync(path.join(outputDir, 'graphics-'));
  const cache = path.join(projectDir(project.id), 'overlay-cache');
  fs.mkdirSync(cache, { recursive: true });
  const cacheKey = objectHash({ project, legacyCameras, rendererVersion: 'hyperframes-v3' }).slice(0, 32);
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
    await runMedia('ffmpeg', [
      '-v', 'error', '-y', '-reinit_filter', '0', '-i', result.outputPath,
      '-c:v', 'libvpx-vp9', '-i', overlay,
      '-filter_complex', savedGraphicsFilter(Boolean(finalCaptionPath)),
      '-map', '[v]', '-map', '0:a', ...videoEncoderFlags(await canUseNvenc(), 18), '-c:a', 'copy',
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
