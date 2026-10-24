import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  validateProject,
  motionProject,
  assertDocumentaryVisuals,
  assertGraphicsReviewed,
  RENDERER_VERSION,
  RenderManifest,
  type EditingProject,
} from "@tubeflow/editing-contracts";
import {
  sampleFrames,
  type CompositionProps,
} from "@tubeflow/video-composition";
import {
  assetFile,
  assetRecord,
  projectDir,
  atomic,
  objectHash,
} from "./repository.js";
import { editingConfig } from "./config.js";
import { mediaUrl } from "../workspace.js";
import { runMedia } from "../media-process.js";
import { renderHyperFramesOverlay } from "./hyperframes-renderer.js";
import { prepareMotionAudio } from "./motionAudio.js";

const sceneFitFilter = (scene: EditingProject['scenes'][number] | undefined, width: number, height: number) =>
  scene?.framing === 'contain'
    ? `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`
    : `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;

/** HyperFrames overlay bundle compatibility no-op */
export async function rendererBundle(): Promise<string> {
  return "hyperframes";
}

/** Render full-resolution transparent graphics overlay via HyperFrames */
export async function exportGraphicsOverlay(
  project: EditingProject,
  output: string,
  signal: AbortSignal,
  progress: (completed: number, total: number) => void,
  _legacyCameras?: CompositionProps['legacyCameras'],
) {
  assertGraphicsReviewed(project);
  return await renderHyperFramesOverlay({
    project,
    outputPath: output,
    signal,
    onProgress: (pct) => progress(Math.round((pct / 100) * project.inputs.durationFrames), project.inputs.durationFrames),
  });
}

/**
 * Render preview frames of graphics composited over scene media for visual QA.
 * Utilizes HyperFrames overlay and FFmpeg compositing.
 */
export async function previewFrames(
  project: EditingProject,
  signal: AbortSignal,
  artifactId?: string,
) {
  project = motionProject(project);
  const artifacts = project.artifacts.filter(
    (a) => a.enabled && (!artifactId || a.id === artifactId),
  );
  const scenes = artifactId
    ? project.scenes.filter((s) => artifacts.some((a) => a.sceneId === s.id))
    : project.scenes;

  const frames = [
    ...new Set([
      0,
      project.inputs.durationFrames - 1,
      ...artifacts.flatMap((a) => [
        ...sampleFrames(a),
        ...(a.graphic?.composition?.layers.map((layer) =>
          Math.min(
            a.endFrame - 1,
            a.startFrame +
              Math.round(
                (a.endFrame - a.startFrame) * layer.delay +
                  project.inputs.fps * 0.5,
              ),
          ),
        ) || []),
      ]),
      ...scenes.flatMap((s) => [s.startFrame, s.endFrame - 1]),
    ]),
  ]
    .filter(
      (frame) =>
        !artifactId ||
        project.artifacts.some(
          (a) => a.id === artifactId && frame >= a.startFrame && frame < a.endFrame,
        ),
    )
    .sort((a, b) => a - b);

  const dir = path.join(projectDir(project.id), "previews", project.revisionId);
  fs.mkdirSync(dir, { recursive: true });

  // Get or render HyperFrames overlay
  const cache = path.join(projectDir(project.id), "overlay-cache");
  fs.mkdirSync(cache, { recursive: true });
  const cacheKey = objectHash({ project, rendererVersion: RENDERER_VERSION }).slice(0, 32);
  const overlayWebm = path.join(cache, `${cacheKey}.webm`);

  if (!fs.existsSync(overlayWebm)) {
    await renderHyperFramesOverlay({
      project,
      outputPath: overlayWebm,
      signal,
    });
  }

  const { width, height, fps } = project.inputs;

  for (const frame of frames) {
    signal.throwIfAborted();
    const outFile = path.join(dir, `${frame}.png`);
    const scene =
      project.scenes.find((s) => frame >= s.startFrame && frame < s.endFrame) ||
      project.scenes[0];
    const sceneFile = scene ? assetFile(scene.assetId) : null;
    const timeSec = frame / fps;
    const record = scene ? assetRecord(scene.assetId) : undefined;
    const sceneSeek = record?.mime === 'video/mp4' ? ['-ss', String(Math.max(0, Math.min((frame - scene!.startFrame) / fps, (record.duration || 1) - 1 / fps)))] : [];
    const fitFilter = sceneFitFilter(scene, width, height);

    if (sceneFile && fs.existsSync(sceneFile) && fs.existsSync(overlayWebm)) {
      await runMedia(
        "ffmpeg",
        [
          "-y",
          "-ss",
          String(timeSec),
          "-c:v",
          "libvpx-vp9",
          "-i",
          overlayWebm,
          ...sceneSeek,
          "-i",
          sceneFile,
          "-filter_complex",
          `[1:v]${fitFilter}[bg];[bg][0:v]overlay=format=auto[out]`,
          "-map",
          "[out]",
          "-vframes",
          "1",
          "-pix_fmt",
          "rgba",
          outFile,
        ],
        signal,
      );
    } else if (sceneFile && fs.existsSync(sceneFile)) {
      await runMedia(
        "ffmpeg",
        [
          "-y",
          ...sceneSeek,
          "-i",
          sceneFile,
          "-vf",
          fitFilter,
          "-vframes",
          "1",
          outFile,
        ],
        signal,
      );
    } else if (fs.existsSync(overlayWebm)) {
      await runMedia(
        "ffmpeg",
        [
          "-y",
          "-ss",
          String(timeSec),
          "-c:v",
          "libvpx-vp9",
          "-i",
          overlayWebm,
          "-vframes",
          "1",
          "-pix_fmt",
          "rgba",
          outFile,
        ],
        signal,
      );
    }
  }

  return frames.map((frame) => ({
    frame,
    file: path.join(dir, `${frame}.png`),
    findings: [] as Array<{ code: string; artifactId: string; nodeId: string; message: string }>,
  }));
}

/** Render a short preview video of an artifact with its scene media */
export async function previewArtifactVideo(
  project: EditingProject,
  artifactId: string,
  signal: AbortSignal,
) {
  const artifact = project.artifacts.find(
    (a) => a.id === artifactId && a.enabled,
  );
  if (!artifact) throw new Error("No enabled graphic to review");

  const dir = path.join(projectDir(project.id), "previews", project.revisionId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${artifactId}-motion.mp4`);

  const cache = path.join(projectDir(project.id), "overlay-cache");
  fs.mkdirSync(cache, { recursive: true });
  const cacheKey = objectHash({ project, rendererVersion: RENDERER_VERSION }).slice(0, 32);
  const overlayWebm = path.join(cache, `${cacheKey}.webm`);

  if (!fs.existsSync(overlayWebm)) {
    await renderHyperFramesOverlay({
      project,
      outputPath: overlayWebm,
      signal,
    });
  }

  const { width, height, fps } = project.inputs;
  const scene =
    project.scenes.find((s) => s.id === artifact.sceneId) || project.scenes[0];
  const sceneFile = scene ? assetFile(scene.assetId) : null;
  const startSec = artifact.startFrame / fps;
  const durSec = Math.max(0.5, (artifact.endFrame - artifact.startFrame) / fps);

  if (sceneFile && fs.existsSync(sceneFile) && fs.existsSync(overlayWebm)) {
    const record = assetRecord(scene!.assetId);
    const sceneArgs = record.mime === 'video/mp4'
      ? ['-ss', String(Math.max(0, Math.min((artifact.startFrame - scene!.startFrame) / fps, (record.duration || 1) - 1 / fps)))]
      : ['-loop', '1', '-framerate', String(fps)];
    const audio = await prepareMotionAudio(project, signal);
    await runMedia(
      "ffmpeg",
      [
        "-y",
        ...sceneArgs,
        "-t",
        String(durSec),
        "-i",
        sceneFile,
        "-ss",
        String(startSec),
        "-t",
        String(durSec),
        "-c:v",
        "libvpx-vp9",
        "-i",
        overlayWebm,
        "-ss", String(startSec), "-t", String(durSec), "-i", audio,
        "-filter_complex",
        `[0:v]${sceneFitFilter(scene, width, height)},fps=${fps},tpad=stop_mode=clone:stop_duration=${durSec},trim=duration=${durSec},setpts=PTS-STARTPTS[bg];[1:v]setpts=PTS-STARTPTS[ov];[bg][ov]overlay=format=auto,format=yuv420p[v]`,
        "-map",
        "[v]",
        "-map", "2:a", "-c:a", "aac", "-t", String(durSec),
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "22",
        file,
      ],
      signal,
    );
  } else if (fs.existsSync(overlayWebm)) {
    await runMedia(
      "ffmpeg",
      [
        "-y",
        "-ss",
        String(startSec),
        "-t",
        String(durSec),
        "-c:v",
        "libvpx-vp9",
        "-i",
        overlayWebm,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "ultrafast",
        file,
      ],
      signal,
    );
  }

  return file;
}

/** Export full video with scene media, narration audio, and HyperFrames overlay */
export async function exportVideo(
  project: EditingProject,
  jobId: string,
  signal: AbortSignal,
  progress: (completed: number, total: number) => void,
) {
  assertGraphicsReviewed(project);
  if (!["ready", "partial"].includes(project.status))
    throw new Error("Only ready revisions can be exported");

  project = motionProject(project);
  validateProject(project);
  assertDocumentaryVisuals(project);

  const start = Date.now();
  const dir = path.join(projectDir(project.id), "renders", jobId);
  fs.mkdirSync(dir, { recursive: true });
  const partial = path.join(dir, "partial.mp4");
  const output = path.join(dir, "video.mp4");

  const config = editingConfig();
  const bounded = AbortSignal.any([
    signal,
    AbortSignal.timeout(config.renderTimeout),
  ]);

  // 1. Render HyperFrames overlay
  const overlayWebm = path.join(dir, "overlay.webm");
  await renderHyperFramesOverlay({
    project,
    outputPath: overlayWebm,
    signal: bounded,
    onProgress: (pct) =>
      progress(
        Math.round((pct / 200) * project.inputs.durationFrames),
        project.inputs.durationFrames,
      ),
  });

  // 2. Prepare audio and scenes
  const audioFile = await prepareMotionAudio(project, bounded);
  const durationSec = project.inputs.durationFrames / project.inputs.fps;
  const { width, height, fps } = project.inputs;

  const filterParts: string[] = [];
  const inputs: string[] = [];
  let inputIdx = 0;

  // Input 0: audio
  inputs.push("-i", audioFile);
  inputIdx++;

  // Input 1: overlay
  inputs.push("-c:v", "libvpx-vp9", "-i", overlayWebm);
  const overlayIdx = inputIdx;
  inputIdx++;

  // Inputs for scene images
  const sceneSegments: string[] = [];
  for (let i = 0; i < project.scenes.length; i++) {
    const scene = project.scenes[i];
    const sceneDur = (scene.endFrame - scene.startFrame) / fps;
    const sceneImg = assetFile(scene.assetId);
    const record = assetRecord(scene.assetId);
    inputs.push(...(record.mime === 'video/mp4' ? [] : ['-loop', '1', '-framerate', String(fps)]), '-t', String(sceneDur), '-i', sceneImg);
    const sIdx = inputIdx++;
    filterParts.push(
      `[${sIdx}:v]${sceneFitFilter(scene, width, height)},setsar=1,fps=${fps},tpad=stop_mode=clone:stop_duration=${sceneDur},trim=end_frame=${scene.endFrame-scene.startFrame},setpts=PTS-STARTPTS[s${i}]`,
    );
    sceneSegments.push(`[s${i}]`);
  }

  const concatStr = `${sceneSegments.join("")}concat=n=${project.scenes.length}:v=1:a=0[base]`;
  filterParts.push(concatStr);
  filterParts.push(
    `[base][${overlayIdx}:v]overlay=format=auto,format=yuv420p[v]`,
  );

  const audioMapArgs = ['-map', '0:a'];

  bounded.throwIfAborted();

  await runMedia(
    "ffmpeg",
    [
      "-y",
      ...inputs,
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      "[v]",
      ...audioMapArgs,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "18",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-t",
      String(durationSec),
      "-movflags",
      "+faststart",
      partial,
    ],
    bounded,
  );

  bounded.throwIfAborted();

  // Validate output streams
  const inspected = JSON.parse(
    await runMedia(
      "ffprobe",
      ["-v", "error", "-show_streams", "-of", "json", partial],
      bounded,
    ),
  ) as {
    streams: { codec_type: string; duration: string; nb_frames?: string }[];
  };

  const video = inspected.streams.find((s) => s.codec_type === "video");
  const audio = inspected.streams.find((s) => s.codec_type === "audio");

  if (!video || !audio) {
    throw new Error("Export failed: missing video or audio stream in rendered output");
  }

  const url = mediaUrl(
    `editing/projects/${project.id}/renders/${jobId}/video.mp4`,
  );
  const manifest = RenderManifest.parse({
    planHash: objectHash(project),
    revisionId: project.revisionId,
    rendererVersion: RENDERER_VERSION,
    schemaVersion: project.schemaVersion,
    assetHashes: Object.fromEntries(
      project.assetIds.map((id) => [id, assetRecord(id).hash]),
    ),
    fontHashes: Object.fromEntries(
      project.style.fontAssetIds.map((id) => [id, assetRecord(id).hash]),
    ),
    width: project.inputs.width,
    height: project.inputs.height,
    fps: project.inputs.fps,
    frameCount: project.inputs.durationFrames,
    audioAssetId: project.inputs.audioAssetId,
    outputUrl: url,
    qa: project.diagnostics,
    durationMs: Date.now() - start,
  });

  fs.renameSync(partial, output);
  atomic(path.join(dir, "manifest.json"), manifest);
  progress(project.inputs.durationFrames, project.inputs.durationFrames);

  return url;
}
