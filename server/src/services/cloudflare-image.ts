import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  ComfyError,
  PRESET_CONFIG,
  resolveChannelLoraForAccount,
  sanitizeSegment,
  type QualityPreset,
} from "./comfyui.js";
import { currentWorkspace, generatedDir, mediaUrl } from "./workspace.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.resolve(__dirname, "..", "..", "data");

export type ImageProvider = "local" | "cloudflare";
export type CloudflareConnectionMode = "worker" | "direct";

export interface CloudflareModelInfo {
  id: string;
  label: string;
  badge: string;
  description: string;
  qualityRating: string;
  speedRating: string;
}

export const DEFAULT_CLOUDFLARE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

export const CLOUDFLARE_IMAGE_MODELS: CloudflareModelInfo[] = [
  {
    id: "@cf/black-forest-labs/flux-1-schnell",
    label: "FLUX.1 Schnell (12B)",
    badge: "Recommended · Best Quality",
    description:
      "Black Forest Labs 12B rectified flow model. Superior photorealism, lighting, prompt adherence, and text rendering.",
    qualityRating: "9/10",
    speedRating: "~2-4s",
  },
  {
    id: "@cf/leonardo/phoenix-1.0",
    label: "Leonardo Phoenix 1.0",
    badge: "Cinematic · Native 16:9 / 9:16",
    description:
      "High-contrast cinematic foundation model by Leonardo.Ai with strong prompt fidelity and native aspect ratios.",
    qualityRating: "8.5/10",
    speedRating: "~4-6s",
  },
  {
    id: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
    label: "Stable Diffusion XL 1.0",
    badge: "Standard SDXL",
    description:
      "Stability AI SDXL 1.0 base checkpoint. Compatible with unedited saurav-z worker scripts.",
    qualityRating: "6.5/10",
    speedRating: "~4-6s",
  },
  {
    id: "@cf/bytedance/stable-diffusion-xl-lightning",
    label: "SDXL Lightning (ByteDance)",
    badge: "Ultra-Fast Draft",
    description:
      "Distilled 4-step lightning model for rapid storyboard previews.",
    qualityRating: "6.5/10",
    speedRating: "~1.5-2s",
  },
];

const ALLOWED_MODEL_IDS = new Set(CLOUDFLARE_IMAGE_MODELS.map((m) => m.id));

export const UPGRADED_WORKER_SCRIPT = `// Cloudflare Workers AI - High-Quality Image API (FLUX.1 Schnell + Multi-Model)
// Based on saurav-z/free-image-generation-api, upgraded for FLUX.1 Schnell (12B)
const ALLOWED_MODELS = new Set([
  "@cf/black-forest-labs/flux-1-schnell",
  "@cf/leonardo/phoenix-1.0",
  "@cf/stabilityai/stable-diffusion-xl-base-1.0",
  "@cf/bytedance/stable-diffusion-xl-lightning",
]);
const DEFAULT_MODEL = "@cf/black-forest-labs/flux-1-schnell";

export default {
  async fetch(request, env) {
    const auth = request.headers.get("Authorization") || "";
    if (!env.API_KEY || auth !== \`Bearer \${env.API_KEY}\`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (request.method === "GET") {
      return Response.json({ ok: true, defaultModel: DEFAULT_MODEL });
    }
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }
    try {
      const body = await request.json();
      if (body?.action === "ping") {
        return Response.json({ ok: true, model: DEFAULT_MODEL });
      }
      const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) return Response.json({ error: "Prompt is required" }, { status: 400 });

      const model = ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL;
      const isFlux = model.includes("flux");
      const input = isFlux
        ? { prompt, steps: Math.min(8, Math.max(1, Number(body.steps) || 6)) }
        : {
            prompt,
            width: Math.min(1536, Math.max(512, Number(body.width) || 1024)),
            height: Math.min(1536, Math.max(512, Number(body.height) || 1024)),
            num_steps: Math.min(40, Math.max(4, Number(body.num_steps || body.steps) || 20)),
            ...(typeof body.seed === "number" ? { seed: body.seed } : {}),
          };

      const result = await env.AI.run(model, input);
      if (result && typeof result === "object" && typeof result.image === "string") {
        const bin = atob(result.image);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Response(bytes, { headers: { "Content-Type": "image/png" } });
      }
      return new Response(result, { headers: { "Content-Type": "image/png" } });
    } catch (err) {
      return Response.json({ error: "Generation failed", details: err?.message }, { status: 500 });
    }
  },
};`;

export interface StoredCloudflareConfig {
  provider: ImageProvider;
  mode: CloudflareConnectionMode;
  workerUrl: string;
  workerApiKey: string;
  accountId: string;
  apiToken: string;
  model: string;
  injectStyleDna: boolean;
}

export interface PublicCloudflareConfig {
  provider: ImageProvider;
  mode: CloudflareConnectionMode;
  workerUrl: string;
  hasWorkerApiKey: boolean;
  workerApiKeyMasked: string;
  accountId: string;
  hasApiToken: boolean;
  apiTokenMasked: string;
  model: string;
  modelLabel: string;
  injectStyleDna: boolean;
  configured: boolean;
  models: CloudflareModelInfo[];
  workerScript: string;
}

function resolveConfigFilePath(): string {
  const dataRoot = path.resolve(process.env.TUBEFLOW_DATA_DIR || DEFAULT_DATA_DIR);
  return path.join(dataRoot, "cloudflare-image-config.json");
}

function maskSecret(secret: string): string {
  const trimmed = (secret || "").trim();
  if (!trimmed) return "";
  if (trimmed.length <= 6) return "••••••••";
  return `••••••••${trimmed.slice(-4)}`;
}

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (
    h === "localhost" ||
    h === "0.0.0.0" ||
    h === "[::1]" ||
    h === "::1" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal")
  ) {
    return true;
  }
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) {
    return true;
  }
  const m172 = h.match(/^172\.(\d+)\./);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

export function validateWorkerUrl(rawUrl: string): string {
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) return "";
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ComfyError("CONFIG", "Invalid Cloudflare Worker URL format.");
  }
  const allowTestHttp = process.env.CLOUDFLARE_ALLOW_TEST_HTTP === "1";
  if (parsed.protocol !== "https:" && !(allowTestHttp && parsed.protocol === "http:")) {
    throw new ComfyError("CONFIG", "Cloudflare Worker URL must use HTTPS.");
  }
  if (!allowTestHttp && isPrivateOrLoopbackHost(parsed.hostname)) {
    throw new ComfyError("CONFIG", "Cloudflare Worker URL must point to a public hostname.");
  }
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

export function validateAccountId(rawAccountId: string): string {
  const trimmed = (rawAccountId || "").trim();
  if (!trimmed) return "";
  if (!/^[a-fA-F0-9_-]{8,64}$/.test(trimmed)) {
    throw new ComfyError("CONFIG", "Invalid Cloudflare Account ID format.");
  }
  return trimmed;
}

export function getCloudflareConfig(): StoredCloudflareConfig {
  const filePath = resolveConfigFilePath();
  let fileData: Partial<StoredCloudflareConfig> = {};
  if (fs.existsSync(filePath)) {
    try {
      fileData = JSON.parse(fs.readFileSync(filePath, "utf8")) || {};
    } catch {
      fileData = {};
    }
  }

  const provider: ImageProvider =
    fileData.provider === "cloudflare" || fileData.provider === "local"
      ? fileData.provider
      : process.env.IMAGE_GENERATION_PROVIDER === "cloudflare"
        ? "cloudflare"
        : "local";

  const mode: CloudflareConnectionMode =
    fileData.mode === "direct" || fileData.mode === "worker"
      ? fileData.mode
      : process.env.CLOUDFLARE_ACCOUNT_ID && !process.env.CLOUDFLARE_WORKER_URL
        ? "direct"
        : "worker";

  const modelCandidate = fileData.model || process.env.CLOUDFLARE_IMAGE_MODEL || DEFAULT_CLOUDFLARE_MODEL;
  const model = ALLOWED_MODEL_IDS.has(modelCandidate) ? modelCandidate : DEFAULT_CLOUDFLARE_MODEL;

  return {
    provider,
    mode,
    workerUrl: (fileData.workerUrl ?? process.env.CLOUDFLARE_WORKER_URL ?? "").trim(),
    workerApiKey: (fileData.workerApiKey ?? process.env.CLOUDFLARE_WORKER_API_KEY ?? "").trim(),
    accountId: (fileData.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim(),
    apiToken: (fileData.apiToken ?? process.env.CLOUDFLARE_API_TOKEN ?? "").trim(),
    model,
    injectStyleDna: typeof fileData.injectStyleDna === "boolean" ? fileData.injectStyleDna : true,
  };
}

export function isCloudflareConfigured(cfg: StoredCloudflareConfig = getCloudflareConfig()): boolean {
  if (cfg.mode === "worker") {
    return Boolean(cfg.workerUrl && cfg.workerApiKey);
  }
  return Boolean(cfg.accountId && cfg.apiToken);
}

export function getPublicCloudflareConfig(): PublicCloudflareConfig {
  const cfg = getCloudflareConfig();
  const modelInfo = CLOUDFLARE_IMAGE_MODELS.find((m) => m.id === cfg.model) || CLOUDFLARE_IMAGE_MODELS[0];
  return {
    provider: cfg.provider,
    mode: cfg.mode,
    workerUrl: cfg.workerUrl,
    hasWorkerApiKey: Boolean(cfg.workerApiKey),
    workerApiKeyMasked: maskSecret(cfg.workerApiKey),
    accountId: cfg.accountId,
    hasApiToken: Boolean(cfg.apiToken),
    apiTokenMasked: maskSecret(cfg.apiToken),
    model: cfg.model,
    modelLabel: modelInfo.label,
    injectStyleDna: cfg.injectStyleDna,
    configured: isCloudflareConfigured(cfg),
    models: CLOUDFLARE_IMAGE_MODELS,
    workerScript: UPGRADED_WORKER_SCRIPT,
  };
}

export interface SaveCloudflareConfigInput {
  provider?: ImageProvider;
  mode?: CloudflareConnectionMode;
  workerUrl?: string;
  workerApiKey?: string;
  accountId?: string;
  apiToken?: string;
  model?: string;
  injectStyleDna?: boolean;
  clearSecrets?: boolean;
}

export function saveCloudflareConfig(input: SaveCloudflareConfigInput): PublicCloudflareConfig {
  const current = getCloudflareConfig();
  const nextProvider: ImageProvider =
    input.provider === "cloudflare" || input.provider === "local" ? input.provider : current.provider;
  const nextMode: CloudflareConnectionMode =
    input.mode === "direct" || input.mode === "worker" ? input.mode : current.mode;

  const nextWorkerUrl =
    typeof input.workerUrl === "string" ? validateWorkerUrl(input.workerUrl) : current.workerUrl;
  const nextAccountId =
    typeof input.accountId === "string" ? validateAccountId(input.accountId) : current.accountId;

  const nextWorkerApiKey = input.clearSecrets
    ? ""
    : typeof input.workerApiKey === "string" && input.workerApiKey.trim().length > 0
      ? input.workerApiKey.trim()
      : current.workerApiKey;

  const nextApiToken = input.clearSecrets
    ? ""
    : typeof input.apiToken === "string" && input.apiToken.trim().length > 0
      ? input.apiToken.trim()
      : current.apiToken;

  const nextModel =
    typeof input.model === "string" && ALLOWED_MODEL_IDS.has(input.model) ? input.model : current.model;

  const nextInjectStyleDna =
    typeof input.injectStyleDna === "boolean" ? input.injectStyleDna : current.injectStyleDna;

  const toStore: StoredCloudflareConfig = {
    provider: nextProvider,
    mode: nextMode,
    workerUrl: nextWorkerUrl,
    workerApiKey: nextWorkerApiKey,
    accountId: nextAccountId,
    apiToken: nextApiToken,
    model: nextModel,
    injectStyleDna: nextInjectStyleDna,
  };

  const filePath = resolveConfigFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(toStore, null, 2), { mode: 0o600 });

  return getPublicCloudflareConfig();
}

async function extractImageBufferFromResponse(res: Response): Promise<Buffer> {
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  const arrayBuf = await res.arrayBuffer();
  const rawBuffer = Buffer.from(arrayBuf);

  if (rawBuffer.length === 0) {
    throw new ComfyError("NO_OUTPUT", "Cloudflare endpoint returned an empty response.");
  }

  // Check if response is JSON (e.g. Direct Cloudflare API or FLUX JSON response)
  const looksLikeJson =
    contentType.includes("application/json") ||
    (rawBuffer[0] === 0x7b && rawBuffer[rawBuffer.length - 1] === 0x7d);

  if (looksLikeJson) {
    let parsed: any;
    try {
      parsed = JSON.parse(rawBuffer.toString("utf8"));
    } catch {
      parsed = null;
    }
    if (parsed) {
      if (parsed.error || (Array.isArray(parsed.errors) && parsed.errors.length > 0)) {
        const errMsg =
          typeof parsed.error === "string"
            ? parsed.error
            : parsed.errors?.[0]?.message || JSON.stringify(parsed.error || parsed.errors);
        throw new ComfyError("GENERATION_ERROR", `Cloudflare AI error: ${errMsg}`);
      }
      const b64 =
        typeof parsed.image === "string"
          ? parsed.image
          : typeof parsed.result?.image === "string"
            ? parsed.result.image
            : null;
      if (!b64) {
        throw new ComfyError("NO_OUTPUT", "Cloudflare JSON response did not include an image payload.");
      }
      const cleanedB64 = b64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
      return Buffer.from(cleanedB64, "base64");
    }
  }

  return rawBuffer;
}

export async function testCloudflareConnection(): Promise<{
  ok: boolean;
  message: string;
  latencyMs: number;
  model: string;
}> {
  const cfg = getCloudflareConfig();
  if (!isCloudflareConfigured(cfg)) {
    return {
      ok: false,
      message:
        cfg.mode === "worker"
          ? "Enter your Cloudflare Worker URL and API Key first."
          : "Enter your Cloudflare Account ID and API Token first.",
      latencyMs: 0,
      model: cfg.model,
    };
  }

  const started = Date.now();
  try {
    if (cfg.mode === "worker") {
      const targetUrl = validateWorkerUrl(cfg.workerUrl);
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.workerApiKey}`,
        },
        body: JSON.stringify({
          action: "ping",
          prompt: "cinematic test lighting frame",
          model: cfg.model,
          steps: 4,
          width: 512,
          height: 512,
        }),
        signal: AbortSignal.timeout(25000),
      });

      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          message: "Authentication failed (HTTP 401/403). Verify your Worker API_KEY.",
          latencyMs: Date.now() - started,
          model: cfg.model,
        };
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return {
          ok: false,
          message: `Worker responded with HTTP ${res.status}: ${errText.slice(0, 160)}`,
          latencyMs: Date.now() - started,
          model: cfg.model,
        };
      }
      return {
        ok: true,
        message: `Connected to Cloudflare Worker (${cfg.model}) in ${Date.now() - started}ms.`,
        latencyMs: Date.now() - started,
        model: cfg.model,
      };
    } else {
      const accountId = validateAccountId(cfg.accountId);
      const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search?per_page=1`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cfg.apiToken}`,
        },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          message: "Authentication failed (HTTP 401/403). Verify your Cloudflare Account ID & API Token.",
          latencyMs: Date.now() - started,
          model: cfg.model,
        };
      }
      if (!res.ok) {
        return {
          ok: false,
          message: `Cloudflare API responded with HTTP ${res.status}.`,
          latencyMs: Date.now() - started,
          model: cfg.model,
        };
      }
      return {
        ok: true,
        message: `Connected to Cloudflare Workers AI (${cfg.model}) in ${Date.now() - started}ms.`,
        latencyMs: Date.now() - started,
        model: cfg.model,
      };
    }
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || "Could not connect to Cloudflare.",
      latencyMs: Date.now() - started,
      model: cfg.model,
    };
  }
}

export interface CloudflareGenerateOptions {
  prompt: string;
  scriptId: string;
  index: number;
  seed?: number;
  signal?: AbortSignal;
  preset?: QualityPreset;
  modelName?: string;
  filePrefix?: "image" | "ref-frame";
}

export async function generateCloudflareImage(opts: CloudflareGenerateOptions): Promise<{
  publicUrl: string;
  fileName: string;
  seed: number;
  elapsedMs: number;
  loraFileName?: string;
  provider: "cloudflare";
  model: string;
}> {
  const started = Date.now();
  const scriptId = sanitizeSegment(opts.scriptId);
  if (!scriptId) throw new ComfyError("CONFIG", "Invalid scriptId.");

  const cfg = getCloudflareConfig();
  if (!isCloudflareConfigured(cfg)) {
    throw new ComfyError(
      "CONFIG",
      cfg.mode === "worker"
        ? "Cloudflare Worker URL and API Key are not configured. Open Cloudflare settings in the Image tab to configure."
        : "Cloudflare Account ID and API Token are not configured. Open Cloudflare settings in the Image tab to configure."
    );
  }

  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const prefix = opts.filePrefix || "image";
  const preset: QualityPreset = opts.preset || "standard";
  const presetDims = PRESET_CONFIG[preset] || PRESET_CONFIG.standard;
  const landscape = currentWorkspace().profile !== "shorts";
  const targetWidth = landscape ? presetDims.height : presetDims.width;
  const targetHeight = landscape ? presetDims.width : presetDims.height;

  const model =
    opts.modelName && ALLOWED_MODEL_IDS.has(opts.modelName) ? opts.modelName : cfg.model;
  const isFlux = model.includes("flux");

  const accountId = currentWorkspace().accountId || "default";
  const channelLora = resolveChannelLoraForAccount(accountId);

  let effectivePrompt = opts.prompt.trim();
  if (cfg.injectStyleDna && channelLora.styleDna) {
    effectivePrompt = `${effectivePrompt}\n\nVisual Style: ${channelLora.styleDna}`;
  }

  const fluxSteps = preset === "fast" ? 4 : preset === "high" ? 8 : 6;
  const sdxlSteps = preset === "fast" ? 12 : preset === "high" ? 28 : 20;

  let res: Response;
  try {
    if (cfg.mode === "worker") {
      const targetUrl = validateWorkerUrl(cfg.workerUrl);
      res = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.workerApiKey}`,
        },
        body: JSON.stringify({
          prompt: effectivePrompt,
          model,
          width: targetWidth,
          height: targetHeight,
          steps: isFlux ? fluxSteps : sdxlSteps,
          num_steps: isFlux ? fluxSteps : sdxlSteps,
          seed,
        }),
        signal: opts.signal || AbortSignal.timeout(90000),
      });
    } else {
      const cfAccountId = validateAccountId(cfg.accountId);
      const directUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfAccountId)}/ai/run/${model}`;
      const payload = isFlux
        ? { prompt: effectivePrompt, steps: fluxSteps }
        : {
            prompt: effectivePrompt,
            width: targetWidth,
            height: targetHeight,
            num_steps: sdxlSteps,
            seed,
          };
      res = await fetch(directUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.apiToken}`,
        },
        body: JSON.stringify(payload),
        signal: opts.signal || AbortSignal.timeout(90000),
      });
    }
  } catch (err: any) {
    if (opts.signal?.aborted || err?.name === "AbortError") {
      throw new ComfyError("CANCELLED", "Generation cancelled by user.");
    }
    if (err instanceof ComfyError) throw err;
    throw new ComfyError("OFFLINE", `Could not reach Cloudflare AI endpoint: ${err?.message || "network error"}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new ComfyError("CONFIG", "Cloudflare authentication failed (HTTP 401/403). Check your API Key / Token.");
    }
    throw new ComfyError(
      "GENERATION_ERROR",
      `Cloudflare image generation failed (HTTP ${res.status}): ${errText.slice(0, 240)}`
    );
  }

  const rawImageBuffer = await extractImageBufferFromResponse(res);

  // Normalize to PNG at target aspect ratio so downstream FFmpeg and media validators work identically to local ComfyUI
  let pngBuffer: Buffer;
  try {
    const img = sharp(rawImageBuffer, { limitInputPixels: 40000000 });
    const meta = await img.metadata();
    if (!meta.width || !meta.height) {
      throw new Error("Invalid image metadata");
    }
    pngBuffer = await img
      .resize(targetWidth, targetHeight, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
  } catch (err: any) {
    throw new ComfyError(
      "GENERATION_ERROR",
      `Cloudflare returned invalid image data: ${err?.message || "decode failed"}`
    );
  }

  const outDir = path.join(generatedDir(), scriptId);
  fs.mkdirSync(outDir, { recursive: true });
  const fileName = `${prefix}-${String(opts.index).padStart(2, "0")}-${started}.png`;
  fs.writeFileSync(path.join(outDir, fileName), pngBuffer);

  return {
    publicUrl: mediaUrl(`generate/file/${scriptId}/${fileName}`),
    fileName,
    seed,
    elapsedMs: Date.now() - started,
    provider: "cloudflare",
    model,
  };
}
