import fs from "node:fs";
import sharp from "sharp";
import { z } from "zod";
import {
  AssetRequest,
  Analysis,
  type SceneAnalysis,
} from "@tubeflow/editing-contracts";
import { assetFile, assetRecord, saveAsset } from "./repository.js";
import { cropAsset } from "./media.js";
import { editingConfig, EditingError } from "./config.js";
import { localMusicBusy } from "../local-music.js";
import { narrationBusy } from "../long-narration.js";
import { presenterState } from "../presenter-state.js";
import {
  assetCacheKey,
  bind,
  GenerationWorkflow,
  RemovalWorkflow,
  readWorkflow,
  runWorkflow,
  uploadReference,
} from "./artifactWorkflow.js";

export async function ground(
  analysis: SceneAnalysis,
  signal: AbortSignal,
): Promise<SceneAnalysis> {
  const url = editingConfig().groundingUrl;
  if (!url) return analysis;
  const form = new FormData();
  form.append(
    "image",
    new Blob([new Uint8Array(fs.readFileSync(assetFile(analysis.assetId)))]),
    "scene.png",
  );
  form.append("analysis", JSON.stringify(analysis));
  const response = await fetch(`${url.replace(/\/$/, "")}/ground`, {
    method: "POST",
    body: form,
    signal: AbortSignal.any([
      signal,
      AbortSignal.timeout(editingConfig().providerTimeout),
    ]),
  });
  if (!response.ok) throw new Error("Grounding provider unavailable");
  const result = Analysis.parse(await response.json());
  if (
    result.assetId !== analysis.assetId ||
    result.imageHash !== analysis.imageHash ||
    result.width !== analysis.width ||
    result.height !== analysis.height ||
    result.objects.some((o) => o.method !== "grounding")
  )
    throw new Error("Grounding identity or evidence mismatch");
  return result;
}

export async function buildAsset(
  value: z.infer<typeof AssetRequest>,
  signal: AbortSignal,
) {
  const request = AssetRequest.parse(value);
  const mayUseGpu = request.strategy === "generate" || request.transparent;
  if (!mayUseGpu) return buildAssetInternal(request, signal);
  if (
    presenterState.busy ||
    presenterState.mediaRequests ||
    presenterState.imageRequests ||
    presenterState.speechRequests ||
    presenterState.editingRequests ||
    localMusicBusy() ||
    narrationBusy()
  )
    throw new EditingError(
      "GPU_BUSY",
      "Wait for active image, narration, music or presenter generation.",
      409,
      true,
    );
  presenterState.editingRequests++;
  try {
    return await buildAssetInternal(request, signal);
  } finally {
    presenterState.editingRequests--;
  }
}

async function inspectImage(
  bytes: Buffer,
  width: number,
  height: number,
  transparent: boolean,
) {
  const img = sharp(bytes, { limitInputPixels: 16000000 }),
    meta = await img.metadata(),
    stats = await img.stats();
  if (
    meta.width !== width ||
    meta.height !== height ||
    stats.channels.slice(0, 3).every((c) => c.stdev < 1)
  )
    throw new Error("Generated artifact is blank or has incorrect dimensions");
  if (transparent && (!meta.hasAlpha || stats.isOpaque))
    throw new Error("Generated cutout lacks real transparency");
  return {
    png: await img.png().toBuffer(),
    alpha: !!meta.hasAlpha && !stats.isOpaque,
  };
}

async function removeBackground(
  bytes: Buffer,
  width: number,
  height: number,
  signal: AbortSignal,
) {
  const config = editingConfig();
  if (!config.backgroundWorkflow)
    throw new EditingError(
      "ALPHA_UNAVAILABLE",
      "Configure a verified transparent-output or background-removal workflow.",
    );
  const template = readWorkflow(config.backgroundWorkflow, RemovalWorkflow);
  bind(template, template.imageBinding, await uploadReference(bytes, signal));
  const output = await runWorkflow(template, signal);
  return {
    ...(await inspectImage(output, width, height, true)),
    version: template.version,
  };
}

async function buildAssetInternal(
  request: z.infer<typeof AssetRequest>,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (request.strategy === "reuse" || request.strategy === "crop") {
    if (!request.sourceAssetId)
      throw new Error("Reuse/crop needs a source asset");
    const source = assetRecord(request.sourceAssetId);
    if (!source.mime.startsWith("image/"))
      throw new Error("Artifact source is not an image");
    if (request.strategy === "crop" && !request.crop)
      throw new Error("Crop needs normalized bounds");
    const asset =
      request.strategy === "reuse"
        ? source
        : await cropAsset(
            request.sourceAssetId,
            request.crop!,
            request.width,
            request.height,
          );
    if (!request.transparent || asset.alpha) return asset;
    const removed = await removeBackground(
      fs.readFileSync(assetFile(asset.id)),
      asset.width!,
      asset.height!,
      signal,
    );
    signal.throwIfAborted();
    return saveAsset(removed.png, {
      mime: "image/png",
      width: asset.width,
      height: asset.height,
      alpha: true,
      method: "background-removal",
      providerVersion: removed.version,
    });
  }
  if (request.strategy === "retrieve")
    throw new EditingError(
      "UNSUPPORTED_RETRIEVAL",
      "No authenticated retrieval provider is configured. Use editable text instead.",
    );
  const config = editingConfig();
  if (!config.workflow)
    throw new EditingError(
      "NEEDS_WORKFLOW",
      "Configure a verified artifact ComfyUI workflow; vector/reused assets remain available.",
    );
  const template = readWorkflow(config.workflow, GenerationWorkflow);
  if (request.referenceAssetIds.length !== template.referenceBindings.length)
    throw new EditingError(
      "UNSUPPORTED_REFERENCES",
      `Configured workflow requires ${template.referenceBindings.length} reference images; the request supplies ${request.referenceAssetIds.length}.`,
    );
  if (request.transparent && !template.alpha && !config.backgroundWorkflow)
    throw new EditingError(
      "ALPHA_UNAVAILABLE",
      "Configure a verified transparent-output or background-removal workflow.",
    );
  const seed =
    request.seed ??
    Number.parseInt(assetCacheKey(request, request.styleId).slice(0, 12), 16);
  const values = {
    prompt: request.prompt || request.purpose,
    width: request.width,
    height: request.height,
    seed,
  };
  for (const [key, binding] of Object.entries(template.bindings))
    bind(template, binding, values[key as keyof typeof values]);
  for (let i = 0; i < request.referenceAssetIds.length; i++) {
    const id = request.referenceAssetIds[i];
    if (!assetRecord(id).mime.startsWith("image/"))
      throw new Error("Reference is not a registered image");
    bind(
      template,
      template.referenceBindings[i],
      await uploadReference(fs.readFileSync(assetFile(id)), signal),
    );
  }
  const bytes = await runWorkflow(template, signal);
  let image = await inspectImage(
    bytes,
    request.width,
    request.height,
    template.alpha && request.transparent,
  );
  let version = template.version;
  if (request.transparent && !image.alpha) {
    const removed = await removeBackground(
      image.png,
      request.width,
      request.height,
      signal,
    );
    image = removed;
    version += ` + ${removed.version}`;
  }
  signal.throwIfAborted();
  return saveAsset(image.png, {
    mime: "image/png",
    width: request.width,
    height: request.height,
    alpha: image.alpha,
    method: "generate",
    providerVersion: version,
    seed,
  });
}
