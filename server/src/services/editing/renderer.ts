import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import {
  selectComposition,
  renderMedia,
  renderStill,
  makeCancelSignal,
} from "@remotion/renderer";
import {
  validateProject,
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
let bundlePromise: Promise<string> | undefined;
export function rendererBundle() {
  return (bundlePromise ??= bundle({
    entryPoint: path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../packages/video-composition/dist/remotion-entry.js",
    ),
    onProgress: () => undefined,
  }).catch((e) => {
    bundlePromise = undefined;
    throw e;
  }));
}
export async function renderSession(
  project: EditingProject,
  signal: AbortSignal,
) {
  validateProject(project);
  signal.throwIfAborted();
  const audioRecord = assetRecord(project.inputs.audioAssetId);
  if (
    !audioRecord.mime.startsWith("audio/") ||
    audioRecord.hash !== project.inputs.audioHash
  )
    throw new Error("Narration asset identity or type mismatch");
  for (const image of project.inputs.imageAssets) {
    const record = assetRecord(image.assetId);
    if (
      (!record.mime.startsWith("image/") && record.mime !== "video/mp4") ||
      record.hash !== image.hash ||
      !record.width ||
      !record.height
    )
      throw new Error("Mandatory scene image identity or type mismatch");
  }
  for (const id of project.style.fontAssetIds)
    if (assetRecord(id).mime !== "font/woff2")
      throw new Error("Approved font asset has the wrong media type");
  for (const artifact of project.artifacts)
    for (const node of artifact.nodes) {
      if (
        node.kind === "image" &&
        !assetRecord(node.assetId).mime.startsWith("image/")
      )
        throw new Error("Image node references a non-image asset");
      if (
        node.clip?.kind === "mask" &&
        !assetRecord(node.clip.assetId).mime.startsWith("image/")
      )
        throw new Error("Mask references a non-image asset");
    }
  const records = Object.fromEntries(
      project.assetIds.map((id) => [id, assetRecord(id)]),
    ),
    files = Object.fromEntries(
      project.assetIds.map((id) => [id, assetFile(id)]),
    ),
    token = randomUUID();
  // Loopback, ephemeral capability URL; only this immutable revision's approved assets are served.
  const server = http.createServer((req, res) => {
    const parts = (req.url || "").split("/"),
      id = parts[2];
    if (parts[1] !== token || !files[id]) {
      res.writeHead(404).end();
      return;
    }
    const file = files[id],
      size = fs.statSync(file).size;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", records[id].mime);
    res.setHeader("Accept-Ranges", "bytes");
    const match = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = match ? Number(match[1]) : 0,
      end = match && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
    if (start > end || start >= size) {
      res.writeHead(416).end();
      return;
    }
    if (match) {
      res.statusCode = 206;
      res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    }
    res.setHeader("Content-Length", end - start + 1);
    fs.createReadStream(file, { start, end }).pipe(res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port,
    props: CompositionProps = {
      project,
      assets: Object.fromEntries(
        Object.entries(records).map(([id, record]) => [
          id,
          { record, url: `http://127.0.0.1:${port}/${token}/${id}` },
        ]),
      ),
    };
  const close = () => {
    server.closeAllConnections();
    server.close();
  };
  try {
    const serveUrl = await rendererBundle();
    signal.throwIfAborted();
    const config = editingConfig(),
      composition = await selectComposition({
        serveUrl,
        id: "EnhancedVideo",
        inputProps: props,
        browserExecutable: config.browser,
        timeoutInMilliseconds: 60000,
      });
    const cancellation = makeCancelSignal();
    const abort = () => cancellation.cancel();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    return {
      serveUrl,
      composition,
      inputProps: props,
      browserExecutable: config.browser,
      cancelSignal: cancellation.cancelSignal,
      close: () => {
        signal.removeEventListener("abort", abort);
        close();
      },
    };
  } catch (e) {
    close();
    throw e;
  }
}
export async function previewFrames(
  project: EditingProject,
  signal: AbortSignal,
  artifactId?: string,
) {
  const frames = [
      ...new Set([
        0,
        project.inputs.durationFrames - 1,
        ...project.artifacts.filter((a) => a.enabled).flatMap(sampleFrames),
        ...project.scenes.flatMap((s) => [s.startFrame, s.endFrame - 1]),
      ]),
    ].filter(frame => !artifactId || project.artifacts.some(a => a.id === artifactId && frame >= a.startFrame && frame < a.endFrame)).sort((a, b) => a - b),
    dir = path.join(projectDir(project.id), "previews", project.revisionId);
  fs.mkdirSync(dir, { recursive: true });
  const findings = new Map<
    number,
    Array<{ code: string; artifactId: string; nodeId: string; message: string }>
  >();
  const session = await renderSession(project, signal);
  try {
    for (const frame of frames) {
      signal.throwIfAborted();
      await renderStill({
        ...session,
        output: path.join(dir, `${frame}.png`),
        frame,
        imageFormat: "png",
        scale: 0.5,
        timeoutInMilliseconds: 60000,
        onBrowserLog: (log) => {
          if (!log.text.startsWith("EDITING_QA:")) return;
          try {
            const finding = JSON.parse(log.text.slice("EDITING_QA:".length));
            findings.set(frame, [...(findings.get(frame) || []), finding]);
          } catch {
            /* Non-JSON browser diagnostics are not persisted as plan data. */
          }
        },
      });
    }
  } finally {
    session.close();
  }
  return frames.map((frame) => ({
    frame,
    file: path.join(dir, `${frame}.png`),
    findings: findings.get(frame) || [],
  }));
}
export async function exportVideo(
  project: EditingProject,
  jobId: string,
  signal: AbortSignal,
  progress: (completed: number, total: number) => void,
) {
  if (!["ready", "partial"].includes(project.status))
    throw new Error("Only ready revisions can be exported");
  const start = Date.now(),
    dir = path.join(projectDir(project.id), "renders", jobId);
  fs.mkdirSync(dir, { recursive: true });
  const partial = path.join(dir, "partial.mp4"),
    output = path.join(dir, "video.mp4"),
    config = editingConfig(),
    bounded = AbortSignal.any([
      signal,
      AbortSignal.timeout(config.renderTimeout),
    ]),
    session = await renderSession(project, bounded);
  try {
    await renderMedia({
      ...session,
      codec: "h264",
      audioCodec: "aac",
      outputLocation: partial,
      concurrency: config.renderConcurrency,
      timeoutInMilliseconds: 60000,
      onProgress: (p) =>
        progress(p.renderedFrames, project.inputs.durationFrames),
    });
    bounded.throwIfAborted();
    const inspected = JSON.parse(
      await runMedia(
        "ffprobe",
        ["-v", "error", "-show_streams", "-of", "json", partial],
        bounded,
      ),
    ) as {
      streams: { codec_type: string; duration: string; nb_frames?: string }[];
    };
    const video = inspected.streams.find((s) => s.codec_type === "video"),
      audio = inspected.streams.find((s) => s.codec_type === "audio");
    if (
      !video ||
      !audio ||
      Number(video.nb_frames) !== project.inputs.durationFrames ||
      Math.abs(
        Number(video.duration) -
          project.inputs.durationFrames / project.inputs.fps,
      ) >
        1 / project.inputs.fps
    )
      throw new Error(
        "Export frame count/duration differs from the immutable plan",
      );
    if (
      Number(audio.duration) < project.alignment.duration - 0.025 ||
      Number(audio.duration) >
        project.alignment.duration + 1 / project.inputs.fps + 0.1
    )
      throw new Error(
        "Encoded narration duration indicates truncation or excessive padding",
      );
    const url = mediaUrl(
        `editing/projects/${project.id}/renders/${jobId}/video.mp4`,
      ),
      manifest = RenderManifest.parse({
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
    bounded.throwIfAborted();
    fs.renameSync(partial, output);
    atomic(path.join(dir, "manifest.json"), manifest);
    return url;
  } finally {
    session.close();
    fs.rmSync(partial, { force: true });
  }
}
