import fs from "node:fs";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { AssetRequest } from "@tubeflow/editing-contracts";
import { assetRecord, hash, objectHash } from "./repository.js";
import { editingConfig, EditingError } from "./config.js";

const Binding = z.strictObject({
  node: z.string().min(1),
  input: z.string().min(1),
});
const WorkflowGraph = z.record(
  z.string(),
  z.object({
    class_type: z.string(),
    inputs: z.record(z.string(), z.unknown()),
  }),
);
export const GenerationWorkflow = z.strictObject({
  version: z.string().min(1),
  workflow: WorkflowGraph,
  bindings: z.strictObject({
    prompt: Binding,
    width: Binding,
    height: Binding,
    seed: Binding,
  }),
  referenceBindings: z.array(Binding).max(8).default([]),
  outputNode: z.string(),
  alpha: z.boolean(),
});
export const RemovalWorkflow = z.strictObject({
  version: z.string().min(1),
  workflow: WorkflowGraph,
  imageBinding: Binding,
  outputNode: z.string(),
  alpha: z.literal(true),
});
type Template = {
  version: string;
  workflow: z.infer<typeof WorkflowGraph>;
  outputNode: string;
};
export function readWorkflow<T extends z.ZodType>(
  file: string,
  schema: T,
): z.infer<T> {
  return schema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}
export function workflowCapabilities() {
  const config = editingConfig();
  try {
    const generation = config.workflow
      ? readWorkflow(config.workflow, GenerationWorkflow)
      : undefined;
    const removal = config.backgroundWorkflow
      ? readWorkflow(config.backgroundWorkflow, RemovalWorkflow)
      : undefined;
    return {
      generation: !!generation,
      requiredReferenceImages: generation?.referenceBindings.length ?? 0,
      transparentGeneration: !!generation && (generation.alpha || !!removal),
      backgroundRemoval: !!removal,
      verifiedLive: false,
    };
  } catch {
    return {
      generation: false,
      backgroundRemoval: false,
      verifiedLive: false,
      diagnostic: "Invalid configured workflow manifest",
    };
  }
}
/** Content, not just a mutable configuration path, participates in cache identity. */
export function assetCacheKey(
  request: z.infer<typeof AssetRequest>,
  style: unknown,
) {
  const config = editingConfig(),
    { id, ...input } = request;
  void id;
  return objectHash({
    input,
    style,
    sourceHash: request.sourceAssetId
      ? assetRecord(request.sourceAssetId).hash
      : undefined,
    referenceHashes: request.referenceAssetIds.map(
      (ref) => assetRecord(ref).hash,
    ),
    workflow:
      request.strategy === "generate" && config.workflow
        ? hash(fs.readFileSync(config.workflow))
        : undefined,
    removal:
      request.transparent && config.backgroundWorkflow
        ? hash(fs.readFileSync(config.backgroundWorkflow))
        : undefined,
    version: 2,
  });
}
export function bind(
  template: Template,
  binding: z.infer<typeof Binding>,
  value: unknown,
) {
  const node = template.workflow[binding.node];
  if (!node || !(binding.input in node.inputs))
    throw new Error("Invalid artifact workflow binding");
  node.inputs[binding.input] = value;
}
const baseUrl = () =>
  (process.env.COMFYUI_BASE_URL || "http://127.0.0.1:8188").replace(/\/$/, "");
const bounded = (signal: AbortSignal) =>
  AbortSignal.any([
    signal,
    AbortSignal.timeout(editingConfig().providerTimeout),
  ]);

export async function uploadReference(bytes: Buffer, signal: AbortSignal) {
  // Decode and normalize registered media before crossing the provider boundary.
  const png = await sharp(bytes, { limitInputPixels: 16000000 })
    .png()
    .toBuffer();
  signal.throwIfAborted();
  const name = `${hash(png)}.png`,
    subfolder = "tubeflow-artifacts";
  const form = new FormData();
  form.append(
    "image",
    new Blob([new Uint8Array(png)], { type: "image/png" }),
    name,
  );
  form.append("type", "input");
  form.append("subfolder", subfolder);
  form.append("overwrite", "false");
  const response = await fetch(`${baseUrl()}/upload/image`, {
    method: "POST",
    body: form,
    signal: bounded(signal),
  });
  if (!response.ok) throw new Error("ComfyUI reference upload failed");
  const result = (await response.json()) as {
    name: string;
    subfolder: string;
    type: string;
  };
  if (
    result.type !== "input" ||
    result.subfolder !== subfolder ||
    !/^[a-f0-9]{64}(?: \(\d+\))?\.png$/.test(result.name)
  )
    throw new Error("Unexpected ComfyUI uploaded image identity");
  return `${result.subfolder}/${result.name}`;
}

export async function runWorkflow(
  template: Template,
  signal: AbortSignal,
): Promise<Buffer> {
  const base = baseUrl(),
    scoped = bounded(signal);
  const nodeResponse = await fetch(`${base}/object_info`, { signal: scoped });
  if (!nodeResponse.ok) throw new Error("Cannot inspect ComfyUI nodes");
  const nodes = (await nodeResponse.json()) as Record<string, unknown>;
  if (
    !template.workflow[template.outputNode] ||
    Object.values(template.workflow).some((node) => !nodes[node.class_type])
  )
    throw new Error(
      "Artifact workflow requires unavailable ComfyUI nodes or output",
    );
  // Keep every standard SaveImage output out of the legacy scene namespace.
  const runId = randomUUID();
  for (const node of Object.values(template.workflow))
    if ("filename_prefix" in node.inputs)
      node.inputs.filename_prefix = `tubeflow-artifacts/${runId}`;
  const queueResponse = await fetch(`${base}/queue`, { signal: scoped });
  if (!queueResponse.ok) throw new Error("Cannot inspect ComfyUI queue");
  const queue = (await queueResponse.json()) as {
    queue_running?: unknown[];
    queue_pending?: unknown[];
  };
  if (
    !Array.isArray(queue.queue_running) ||
    !Array.isArray(queue.queue_pending)
  )
    throw new Error("Invalid ComfyUI queue response");
  if (queue.queue_running.length || queue.queue_pending.length)
    throw new EditingError(
      "GPU_BUSY",
      "ComfyUI is busy with another generation job.",
      409,
      true,
    );
  const response = await fetch(`${base}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: scoped,
    body: JSON.stringify({ prompt: template.workflow, client_id: runId }),
  });
  if (!response.ok) throw new Error("ComfyUI rejected the artifact workflow");
  const { prompt_id } = (await response.json()) as { prompt_id: string };
  if (typeof prompt_id !== "string" || !prompt_id)
    throw new Error("ComfyUI returned no prompt identity");
  const cancel = () => {
    void fetch(`${base}/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delete: [prompt_id] }),
      signal: AbortSignal.timeout(3000),
    }).catch(() => undefined);
  };
  scoped.addEventListener("abort", cancel, { once: true });
  if (scoped.aborted) cancel();
  try {
    for (;;) {
      scoped.throwIfAborted();
      const history = await fetch(
        `${base}/history/${encodeURIComponent(prompt_id)}`,
        { signal: scoped },
      );
      if (!history.ok)
        throw new Error("Cannot inspect owned ComfyUI generation");
      const data = (await history.json()) as Record<
        string,
        {
          status?: { status_str: string; completed?: boolean };
          outputs?: Record<
            string,
            { images?: { filename: string; subfolder: string; type: string }[] }
          >;
        }
      >;
      const entry = data[prompt_id];
      if (entry?.status?.status_str === "error")
        throw new Error("ComfyUI artifact workflow failed");
      const image = entry?.outputs?.[template.outputNode]?.images?.[0];
      if (image) {
        const out = await fetch(`${base}/view?${new URLSearchParams(image)}`, {
          signal: scoped,
        });
        if (!out.ok) throw new Error("ComfyUI artifact image missing");
        if (Number(out.headers.get("content-length")) > 32 * 1024 * 1024)
          throw new Error("Generated artifact exceeds 32 MiB");
        const chunks: Uint8Array[] = [];
        let size = 0;
        if (!out.body) throw new Error("ComfyUI returned an empty image");
        for await (const chunk of out.body) {
          size += chunk.length;
          if (size > 32 * 1024 * 1024)
            throw new Error("Generated artifact exceeds 32 MiB");
          chunks.push(chunk);
        }
        scoped.throwIfAborted();
        return Buffer.concat(chunks);
      }
      if (entry?.status?.completed)
        throw new Error(
          "Artifact workflow completed without its configured image output",
        );
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(new Error("Cancelled"));
        };
        const timer = setTimeout(() => {
          scoped.removeEventListener("abort", abort);
          resolve();
        }, 1000);
        scoped.addEventListener("abort", abort, { once: true });
        if (scoped.aborted) abort();
      });
    }
  } finally {
    scoped.removeEventListener("abort", cancel);
  }
}
