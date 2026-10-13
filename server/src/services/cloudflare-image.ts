import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  ComfyError,
  PRESET_CONFIG,
  preparePromptForImageGeneration,
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
      const negativePrompt = typeof body?.negative_prompt === "string" ? body.negative_prompt.trim() : "";
      const input = isFlux
        ? { prompt, steps: Math.min(8, Math.max(1, Number(body.steps) || 6)) }
        : {
            prompt,
            ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
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

export interface CloudflareEndpoint {
  id: string;
  label: string;
  mode: CloudflareConnectionMode;
  workerUrl: string;
  workerApiKey: string;
  accountId: string;
  apiToken: string;
  disabled: boolean;
}

export interface PublicCloudflareEndpoint {
  id: string;
  label: string;
  mode: CloudflareConnectionMode;
  workerUrl: string;
  hasWorkerApiKey: boolean;
  workerApiKeyMasked: string;
  accountId: string;
  hasApiToken: boolean;
  apiTokenMasked: string;
  disabled: boolean;
  configured: boolean;
  coolingDownUntil: number;
  coolingDownSecs: number;
  lastError: string;
  lastLatencyMs: number;
  consecutiveFailures: number;
}

export type CloudflareStrategy = "failover" | "round-robin";

export interface StoredCloudflareConfig {
  provider: ImageProvider;
  mode: CloudflareConnectionMode;
  workerUrl: string;
  workerApiKey: string;
  accountId: string;
  apiToken: string;
  model: string;
  injectStyleDna: boolean;
  /** Multi-API pool. When present, this is the source of truth for generation failover. */
  endpoints?: CloudflareEndpoint[];
  strategy?: CloudflareStrategy;
  /** Cooldown applied to an endpoint after it hits a rate/quota limit (ms). Default 5 min. */
  cooldownMs?: number;
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
  /** Multi-API pool (masked secrets). */
  endpoints: PublicCloudflareEndpoint[];
  strategy: CloudflareStrategy;
  cooldownMs: number;
  lastUsedEndpointId: string | null;
  activeEndpointCount: number;
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

export const DEFAULT_STRATEGY: CloudflareStrategy = "failover";
export const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

function createEndpointId(): string {
  return `cf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isEndpointConfigured(ep: Pick<CloudflareEndpoint, "mode" | "workerUrl" | "workerApiKey" | "accountId" | "apiToken">): boolean {
  if (ep.mode === "worker") return Boolean((ep.workerUrl || "").trim() && (ep.workerApiKey || "").trim());
  return Boolean((ep.accountId || "").trim() && (ep.apiToken || "").trim());
}

// ---- In-memory health / failover state (per server process) ----
const endpointCooldowns = new Map<string, number>();
const endpointStats = new Map<string, { consecutiveFailures: number; lastError: string; lastLatencyMs: number }>();
let roundRobinCursor = 0;
let lastUsedEndpointId: string | null = null;

function getEndpointStat(id: string) {
  let s = endpointStats.get(id);
  if (!s) {
    s = { consecutiveFailures: 0, lastError: "", lastLatencyMs: 0 };
    endpointStats.set(id, s);
  }
  return s;
}

function markEndpointSuccess(id: string, latencyMs: number) {
  const s = getEndpointStat(id);
  s.consecutiveFailures = 0;
  s.lastError = "";
  s.lastLatencyMs = latencyMs;
  endpointCooldowns.delete(id);
  lastUsedEndpointId = id;
}

function markEndpointFailure(id: string, message: string, latencyMs: number, rateLimited: boolean, cooldownMs: number) {
  const s = getEndpointStat(id);
  s.consecutiveFailures += 1;
  s.lastError = (message || "failed").slice(0, 240);
  s.lastLatencyMs = latencyMs;
  if (rateLimited) {
    endpointCooldowns.set(id, Date.now() + Math.max(1000, cooldownMs));
  }
}

export function isRateLimitSignal(status: number, bodyText: string): boolean {
  if (status === 429) return true;
  const t = (bodyText || "").toLowerCase();
  if (!t) return false;
  return (
    t.includes("rate limit") ||
    t.includes("rate_limit") ||
    t.includes("too many requests") ||
    t.includes("quota") ||
    t.includes("daily limit") ||
    t.includes("limit exceeded") ||
    t.includes("exceeds") && t.includes("limit") ||
    t.includes("capacity") ||
    t.includes("neurons") ||
    t.includes("free plan") ||
    t.includes("error code: 1027") ||
    t.includes("\"code\":1027") ||
    t.includes("workers ai") && t.includes("limit")
  );
}

function isRetryableFailure(status: number, bodyText: string): boolean {
  if (status === 429) return true;
  if (status === 500 || status === 502 || status === 503 || status === 504) return true;
  if (isRateLimitSignal(status, bodyText)) return true;
  return false;
}

export function getLastUsedEndpointId(): string | null {
  return lastUsedEndpointId;
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

function parseEnvEndpointList(): CloudflareEndpoint[] {
  // Supports comma-separated multi-account env config:
  // CLOUDFLARE_WORKER_URLS + CLOUDFLARE_WORKER_API_KEYS, or
  // CLOUDFLARE_ACCOUNT_IDS + CLOUDFLARE_API_TOKENS
  const out: CloudflareEndpoint[] = [];
  const workerUrls = (process.env.CLOUDFLARE_WORKER_URLS || process.env.CLOUDFLARE_WORKER_URL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const workerKeys = (process.env.CLOUDFLARE_WORKER_API_KEYS || process.env.CLOUDFLARE_WORKER_API_KEY || "")
    .split(",")
    .map((s) => s.trim());
  workerUrls.forEach((url, i) => {
    const key = (workerKeys[i] ?? workerKeys[0] ?? "").trim();
    if (url && key) {
      out.push({
        id: `env-worker-${i + 1}`,
        label: `Worker ${i + 1} (env)`,
        mode: "worker",
        workerUrl: url,
        workerApiKey: key,
        accountId: "",
        apiToken: "",
        disabled: false,
      });
    }
  });
  const accountIds = (process.env.CLOUDFLARE_ACCOUNT_IDS || process.env.CLOUDFLARE_ACCOUNT_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const apiTokens = (process.env.CLOUDFLARE_API_TOKENS || process.env.CLOUDFLARE_API_TOKEN || "")
    .split(",")
    .map((s) => s.trim());
  accountIds.forEach((accountId, i) => {
    const token = (apiTokens[i] ?? apiTokens[0] ?? "").trim();
    if (accountId && token) {
      out.push({
        id: `env-direct-${i + 1}`,
        label: `Account ${i + 1} (env)`,
        mode: "direct",
        workerUrl: "",
        workerApiKey: "",
        accountId,
        apiToken: token,
        disabled: false,
      });
    }
  });
  return out;
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

  const legacyWorkerUrl = (fileData.workerUrl ?? process.env.CLOUDFLARE_WORKER_URL ?? "").trim();
  const legacyWorkerApiKey = (fileData.workerApiKey ?? process.env.CLOUDFLARE_WORKER_API_KEY ?? "").trim();
  const legacyAccountId = (fileData.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  const legacyApiToken = (fileData.apiToken ?? process.env.CLOUDFLARE_API_TOKEN ?? "").trim();

  // Build endpoint pool: explicit file list wins, else migrate legacy single + env lists.
  let endpoints: CloudflareEndpoint[];
  if (Array.isArray(fileData.endpoints) && fileData.endpoints.length > 0) {
    endpoints = fileData.endpoints
      .filter((e) => e && typeof e === "object")
      .map((e, i) => ({
        id: typeof (e as any).id === "string" && (e as any).id ? String((e as any).id) : `cf-${i + 1}`,
        label: typeof (e as any).label === "string" && (e as any).label.trim() ? String((e as any).label).slice(0, 80) : `API ${i + 1}`,
        mode: (e as any).mode === "direct" ? "direct" as const : "worker" as const,
        workerUrl: String((e as any).workerUrl ?? "").trim(),
        workerApiKey: String((e as any).workerApiKey ?? "").trim(),
        accountId: String((e as any).accountId ?? "").trim(),
        apiToken: String((e as any).apiToken ?? "").trim(),
        disabled: Boolean((e as any).disabled),
      }));
  } else if (legacyWorkerUrl || legacyWorkerApiKey || legacyAccountId || legacyApiToken) {
    // Migrate legacy single-key config into a one-entry pool (keeps old tests/behaviour working).
    const legacyMode = mode;
    endpoints = [
      {
        id: "cf-primary",
        label: "Primary API",
        mode: legacyMode,
        workerUrl: legacyWorkerUrl,
        workerApiKey: legacyWorkerApiKey,
        accountId: legacyAccountId,
        apiToken: legacyApiToken,
        disabled: false,
      },
    ];
    // Also merge any extra env-provided keys beyond the first as backups.
    const envExtra = parseEnvEndpointList().slice(1);
    for (const extra of envExtra) {
      if (!endpoints.some((e) => e.workerUrl === extra.workerUrl && e.accountId === extra.accountId)) {
        endpoints.push(extra);
      }
    }
  } else {
    endpoints = parseEnvEndpointList();
  }

  const strategy: CloudflareStrategy = fileData.strategy === "round-robin" ? "round-robin" : "failover";
  const cooldownMs =
    typeof fileData.cooldownMs === "number" && Number.isFinite(fileData.cooldownMs)
      ? Math.min(60 * 60 * 1000, Math.max(5000, Math.floor(fileData.cooldownMs)))
      : DEFAULT_COOLDOWN_MS;

  return {
    provider,
    mode,
    workerUrl: legacyWorkerUrl,
    workerApiKey: legacyWorkerApiKey,
    accountId: legacyAccountId,
    apiToken: legacyApiToken,
    model,
    injectStyleDna: typeof fileData.injectStyleDna === "boolean" ? fileData.injectStyleDna : true,
    endpoints,
    strategy,
    cooldownMs,
  };
}

export function getEnabledEndpoints(cfg: StoredCloudflareConfig = getCloudflareConfig()): CloudflareEndpoint[] {
  return (cfg.endpoints || []).filter((e) => !e.disabled);
}

export function isCloudflareConfigured(cfg: StoredCloudflareConfig = getCloudflareConfig()): boolean {
  const enabled = getEnabledEndpoints(cfg);
  if (enabled.length > 0) return enabled.some(isEndpointConfigured);
  if (cfg.mode === "worker") {
    return Boolean(cfg.workerUrl && cfg.workerApiKey);
  }
  return Boolean(cfg.accountId && cfg.apiToken);
}

function toPublicEndpoint(ep: CloudflareEndpoint): PublicCloudflareEndpoint {
  const now = Date.now();
  const until = endpointCooldowns.get(ep.id) || 0;
  const stat = endpointStats.get(ep.id);
  return {
    id: ep.id,
    label: ep.label,
    mode: ep.mode,
    workerUrl: ep.workerUrl,
    hasWorkerApiKey: Boolean(ep.workerApiKey),
    workerApiKeyMasked: maskSecret(ep.workerApiKey),
    accountId: ep.accountId,
    hasApiToken: Boolean(ep.apiToken),
    apiTokenMasked: maskSecret(ep.apiToken),
    disabled: ep.disabled,
    configured: isEndpointConfigured(ep),
    coolingDownUntil: until > now ? until : 0,
    coolingDownSecs: until > now ? Math.ceil((until - now) / 1000) : 0,
    lastError: stat?.lastError || "",
    lastLatencyMs: stat?.lastLatencyMs || 0,
    consecutiveFailures: stat?.consecutiveFailures || 0,
  };
}

export function getPublicCloudflareConfig(): PublicCloudflareConfig {
  const cfg = getCloudflareConfig();
  const modelInfo = CLOUDFLARE_IMAGE_MODELS.find((m) => m.id === cfg.model) || CLOUDFLARE_IMAGE_MODELS[0];
  const endpoints = (cfg.endpoints || []).map(toPublicEndpoint);
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
    endpoints,
    strategy: cfg.strategy || DEFAULT_STRATEGY,
    cooldownMs: cfg.cooldownMs || DEFAULT_COOLDOWN_MS,
    lastUsedEndpointId,
    activeEndpointCount: endpoints.filter((e) => !e.disabled && e.configured).length,
  };
}

export interface SaveCloudflareEndpointInput {
  id?: string;
  label?: string;
  mode?: CloudflareConnectionMode;
  workerUrl?: string;
  workerApiKey?: string;
  accountId?: string;
  apiToken?: string;
  disabled?: boolean;
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
  strategy?: CloudflareStrategy;
  cooldownMs?: number;
  endpoints?: SaveCloudflareEndpointInput[];
}

function sanitizeEndpointInput(
  raw: SaveCloudflareEndpointInput,
  index: number,
  existing?: CloudflareEndpoint
): CloudflareEndpoint {
  const mode: CloudflareConnectionMode =
    raw.mode === "direct" || raw.mode === "worker"
      ? raw.mode
      : existing?.mode || "worker";
  let workerUrl = existing?.workerUrl || "";
  if (typeof raw.workerUrl === "string") {
    workerUrl = raw.workerUrl.trim() ? validateWorkerUrl(raw.workerUrl) : "";
  }
  let accountId = existing?.accountId || "";
  if (typeof raw.accountId === "string") {
    accountId = raw.accountId.trim() ? validateAccountId(raw.accountId) : "";
  }
  let workerApiKey = existing?.workerApiKey || "";
  if (typeof raw.workerApiKey === "string") {
    if (raw.workerApiKey.trim().length > 0) workerApiKey = raw.workerApiKey.trim();
  }
  let apiToken = existing?.apiToken || "";
  if (typeof raw.apiToken === "string") {
    if (raw.apiToken.trim().length > 0) apiToken = raw.apiToken.trim();
  }
  return {
    id:
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id.trim().slice(0, 64)
        : existing?.id || createEndpointId(),
    label:
      typeof raw.label === "string" && raw.label.trim()
        ? raw.label.trim().slice(0, 80)
        : existing?.label || `API ${index + 1}`,
    mode,
    workerUrl,
    workerApiKey,
    accountId,
    apiToken,
    disabled: typeof raw.disabled === "boolean" ? raw.disabled : existing?.disabled || false,
  };
}

function persistConfig(cfg: StoredCloudflareConfig): void {
  const filePath = resolveConfigFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(cfg, null, 2), { mode: 0o600 });
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

  const nextStrategy: CloudflareStrategy =
    input.strategy === "round-robin" || input.strategy === "failover"
      ? input.strategy
      : current.strategy || DEFAULT_STRATEGY;

  const nextCooldownMs =
    typeof input.cooldownMs === "number" && Number.isFinite(input.cooldownMs)
      ? Math.min(60 * 60 * 1000, Math.max(5000, Math.floor(input.cooldownMs)))
      : current.cooldownMs || DEFAULT_COOLDOWN_MS;

  // Endpoint pool: explicit array wins; else legacy single-field patch upserts endpoint[0].
  let nextEndpoints: CloudflareEndpoint[];
  const legacyPatchProvided =
    typeof input.workerUrl === "string" ||
    typeof input.workerApiKey === "string" ||
    typeof input.accountId === "string" ||
    typeof input.apiToken === "string" ||
    typeof input.mode === "string";
  if (Array.isArray(input.endpoints)) {
    if (input.endpoints.length > 10) {
      throw new ComfyError("CONFIG", "Maximum 10 Cloudflare API endpoints are supported.");
    }
    const seen = new Set<string>();
    nextEndpoints = input.endpoints.map((raw, i) => {
      const ep = sanitizeEndpointInput(raw || {}, i);
      if (seen.has(ep.id)) ep.id = createEndpointId();
      seen.add(ep.id);
      return ep;
    });
    if (input.clearSecrets) {
      nextEndpoints = nextEndpoints.map((e) => ({ ...e, workerApiKey: "", apiToken: "" }));
    }
  } else if (legacyPatchProvided) {
    const base = (current.endpoints || []).map((e) => ({ ...e }));
    if (base.length === 0) {
      base.push({
        id: "cf-primary",
        label: "Primary API",
        mode: nextMode,
        workerUrl: "",
        workerApiKey: "",
        accountId: "",
        apiToken: "",
        disabled: false,
      });
    }
    const primary = { ...base[0] };
    primary.mode = nextMode;
    if (typeof input.workerUrl === "string") primary.workerUrl = nextWorkerUrl;
    if (typeof input.accountId === "string") primary.accountId = nextAccountId;
    primary.workerApiKey = nextWorkerApiKey;
    primary.apiToken = nextApiToken;
    base[0] = primary;
    nextEndpoints = base;
  } else {
    nextEndpoints = (current.endpoints || []).map((e) => ({ ...e }));
    if (input.clearSecrets) {
      nextEndpoints = nextEndpoints.map((e) => ({ ...e, workerApiKey: "", apiToken: "" }));
    }
  }

  const toStore: StoredCloudflareConfig = {
    provider: nextProvider,
    mode: nextMode,
    workerUrl: nextEndpoints[0]?.workerUrl ?? nextWorkerUrl,
    workerApiKey: nextEndpoints[0]?.workerApiKey ?? nextWorkerApiKey,
    accountId: nextEndpoints[0]?.accountId ?? nextAccountId,
    apiToken: nextEndpoints[0]?.apiToken ?? nextApiToken,
    model: nextModel,
    injectStyleDna: nextInjectStyleDna,
    endpoints: nextEndpoints,
    strategy: nextStrategy,
    cooldownMs: nextCooldownMs,
  };

  persistConfig(toStore);

  return getPublicCloudflareConfig();
}

export function addCloudflareEndpoint(input: SaveCloudflareEndpointInput): PublicCloudflareConfig {
  const current = getCloudflareConfig();
  const list = [...(current.endpoints || [])];
  if (list.length >= 10) throw new ComfyError("CONFIG", "Maximum 10 Cloudflare API endpoints are supported.");
  const ep = sanitizeEndpointInput(input || {}, list.length);
  if (!ep.id || list.some((e) => e.id === ep.id)) ep.id = createEndpointId();
  list.push(ep);
  return saveCloudflareConfig({ endpoints: list });
}

export function updateCloudflareEndpoint(id: string, patch: SaveCloudflareEndpointInput): PublicCloudflareConfig {
  const current = getCloudflareConfig();
  const list = [...(current.endpoints || [])];
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) throw new ComfyError("CONFIG", "Cloudflare endpoint not found.");
  list[idx] = sanitizeEndpointInput({ ...(patch || {}), id }, idx, list[idx]);
  return saveCloudflareConfig({ endpoints: list });
}

export function removeCloudflareEndpoint(id: string): PublicCloudflareConfig {
  const current = getCloudflareConfig();
  const list = (current.endpoints || []).filter((e) => e.id !== id);
  endpointCooldowns.delete(id);
  endpointStats.delete(id);
  return saveCloudflareConfig({ endpoints: list });
}

export function reorderCloudflareEndpoints(ids: string[]): PublicCloudflareConfig {
  const current = getCloudflareConfig();
  const byId = new Map((current.endpoints || []).map((e) => [e.id, e]));
  const reordered: CloudflareEndpoint[] = [];
  for (const id of ids || []) {
    const ep = byId.get(id);
    if (ep) {
      reordered.push(ep);
      byId.delete(id);
    }
  }
  for (const ep of byId.values()) reordered.push(ep);
  return saveCloudflareConfig({ endpoints: reordered });
}

export function clearEndpointCooldowns(): void {
  endpointCooldowns.clear();
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

export interface CloudflareEndpointTestResult {
  id: string;
  label: string;
  ok: boolean;
  message: string;
  latencyMs: number;
  model: string;
}

async function pingEndpoint(ep: CloudflareEndpoint, model: string): Promise<CloudflareEndpointTestResult> {
  const started = Date.now();
  const done = (ok: boolean, message: string): CloudflareEndpointTestResult => ({
    id: ep.id,
    label: ep.label,
    ok,
    message,
    latencyMs: Date.now() - started,
    model,
  });
  if (!isEndpointConfigured(ep)) {
    return done(false, `"${ep.label}" is incomplete — add its ${ep.mode === "worker" ? "Worker URL + API Key" : "Account ID + API Token"} first.`);
  }
  try {
    if (ep.mode === "worker") {
      const targetUrl = validateWorkerUrl(ep.workerUrl);
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ep.workerApiKey}`,
        },
        body: JSON.stringify({
          action: "ping",
          prompt: "cinematic test lighting frame",
          model,
          steps: 4,
          width: 512,
          height: 512,
        }),
        signal: AbortSignal.timeout(25000),
      });
      if (res.status === 401 || res.status === 403) {
        return done(false, `"${ep.label}": auth failed (401/403). Verify its Worker API_KEY.`);
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        if (isRateLimitSignal(res.status, errText)) {
          return done(false, `"${ep.label}": rate/quota limit hit (HTTP ${res.status}). A backup API will be used automatically.`);
        }
        return done(false, `"${ep.label}": worker HTTP ${res.status}: ${errText.slice(0, 160)}`);
      }
      return done(true, `"${ep.label}" connected (${model}) in ${Date.now() - started}ms.`);
    }
    const accountId = validateAccountId(ep.accountId);
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search?per_page=1`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${ep.apiToken}` },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 401 || res.status === 403) {
      return done(false, `"${ep.label}": auth failed (401/403). Verify Account ID & API Token.`);
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      if (isRateLimitSignal(res.status, errText)) {
        return done(false, `"${ep.label}": rate/quota limit hit (HTTP ${res.status}). A backup API will be used automatically.`);
      }
      return done(false, `"${ep.label}": Cloudflare API HTTP ${res.status}.`);
    }
    return done(true, `"${ep.label}" connected (${model}) in ${Date.now() - started}ms.`);
  } catch (err: any) {
    return done(false, `"${ep.label}": ${err?.message || "could not connect"}`);
  }
}

export async function testCloudflareConnection(endpointId?: string): Promise<{
  ok: boolean;
  message: string;
  latencyMs: number;
  model: string;
  results?: CloudflareEndpointTestResult[];
}> {
  const cfg = getCloudflareConfig();
  const pool = (cfg.endpoints || []).filter((e) => !e.disabled);
  const targets = endpointId ? pool.filter((e) => e.id === endpointId) : pool;
  if (endpointId && targets.length === 0) {
    return { ok: false, message: "Endpoint not found.", latencyMs: 0, model: cfg.model };
  }
  if (targets.length === 0) {
    if (!isCloudflareConfigured(cfg)) {
      return {
        ok: false,
        message: "Add at least one Cloudflare API (Worker URL + Key, or Account ID + Token) first.",
        latencyMs: 0,
        model: cfg.model,
      };
    }
    // Legacy fallback (no pool yet): ping legacy single config.
    const legacyEp: CloudflareEndpoint = {
      id: "cf-primary",
      label: "Primary API",
      mode: cfg.mode,
      workerUrl: cfg.workerUrl,
      workerApiKey: cfg.workerApiKey,
      accountId: cfg.accountId,
      apiToken: cfg.apiToken,
      disabled: false,
    };
    const single = await pingEndpoint(legacyEp, cfg.model);
    return { ok: single.ok, message: single.message, latencyMs: single.latencyMs, model: cfg.model, results: [single] };
  }
  if (targets.length === 1) {
    const single = await pingEndpoint(targets[0], cfg.model);
    const stat = getEndpointStat(targets[0].id);
    stat.lastLatencyMs = single.latencyMs;
    if (!single.ok) stat.lastError = single.message.slice(0, 240);
    return { ok: single.ok, message: single.message, latencyMs: single.latencyMs, model: cfg.model, results: [single] };
  }
  const results: CloudflareEndpointTestResult[] = [];
  for (const ep of targets) {
    // Sequential to avoid bursting all keys at once.
    const r = await pingEndpoint(ep, cfg.model);
    results.push(r);
    const stat = getEndpointStat(ep.id);
    stat.lastLatencyMs = r.latencyMs;
    if (!r.ok) stat.lastError = r.message.slice(0, 240);
  }
  const okCount = results.filter((r) => r.ok).length;
  return {
    ok: okCount > 0,
    message: `${okCount}/${results.length} Cloudflare APIs reachable.`,
    latencyMs: results.reduce((a, r) => a + r.latencyMs, 0),
    model: cfg.model,
    results,
  };
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
  force2dStylized?: boolean;
}

function orderEndpointsForAttempt(
  pool: CloudflareEndpoint[],
  strategy: CloudflareStrategy
): CloudflareEndpoint[] {
  if (pool.length <= 1 || strategy !== "round-robin") return [...pool];
  const start = roundRobinCursor % pool.length;
  roundRobinCursor = (roundRobinCursor + 1) % 1000000;
  return [...pool.slice(start), ...pool.slice(0, start)];
}

async function attemptEndpointGenerate(
  ep: CloudflareEndpoint,
  args: {
    effectivePrompt: string;
    negativePrompt: string;
    model: string;
    isFlux: boolean;
    fluxSteps: number;
    sdxlSteps: number;
    targetWidth: number;
    targetHeight: number;
    seed: number;
    signal: AbortSignal;
  }
): Promise<Response> {
  if (ep.mode === "worker") {
    const targetUrl = validateWorkerUrl(ep.workerUrl);
    return fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ep.workerApiKey}`,
      },
      body: JSON.stringify({
        prompt: args.effectivePrompt,
        ...(args.negativePrompt ? { negative_prompt: args.negativePrompt } : {}),
        model: args.model,
        width: args.targetWidth,
        height: args.targetHeight,
        steps: args.isFlux ? args.fluxSteps : args.sdxlSteps,
        num_steps: args.isFlux ? args.fluxSteps : args.sdxlSteps,
        seed: args.seed,
      }),
      signal: args.signal,
    });
  }
  const cfAccountId = validateAccountId(ep.accountId);
  const directUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfAccountId)}/ai/run/${args.model}`;
  const payload = args.isFlux
    ? { prompt: args.effectivePrompt, steps: args.fluxSteps }
    : {
        prompt: args.effectivePrompt,
        ...(args.negativePrompt ? { negative_prompt: args.negativePrompt } : {}),
        width: args.targetWidth,
        height: args.targetHeight,
        num_steps: args.sdxlSteps,
        seed: args.seed,
      };
  return fetch(directUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ep.apiToken}`,
    },
    body: JSON.stringify(payload),
    signal: args.signal,
  });
}

export async function generateCloudflareImage(opts: CloudflareGenerateOptions): Promise<{
  publicUrl: string;
  fileName: string;
  seed: number;
  elapsedMs: number;
  loraFileName?: string;
  provider: "cloudflare";
  model: string;
  endpointId: string;
  endpointLabel: string;
  attempts: number;
}> {
  const started = Date.now();
  const scriptId = sanitizeSegment(opts.scriptId);
  if (!scriptId) throw new ComfyError("CONFIG", "Invalid scriptId.");

  const cfg = getCloudflareConfig();
  if (!isCloudflareConfigured(cfg)) {
    throw new ComfyError(
      "CONFIG",
      "No Cloudflare API is configured. Open Cloudflare settings in the Image tab and add at least one Worker URL + Key or Account ID + Token."
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

  const prepared = preparePromptForImageGeneration(opts.prompt, {
    forCloudflare: true,
    injectStyleDna: cfg.injectStyleDna,
    styleDna: channelLora.styleDna,
    force2dStylized: opts.force2dStylized,
  });
  const effectivePrompt = prepared.positivePrompt;
  const negativePrompt = prepared.negativePrompt;

  const fluxSteps = preset === "fast" ? 4 : preset === "high" ? 8 : 6;
  const isLightning = model.includes("lightning") || model.includes("lcm");
  const isPhoenix = model.includes("phoenix");
  const sdxlSteps = isLightning
    ? (preset === "fast" ? 4 : preset === "high" ? 6 : 4)
    : isPhoenix
      ? (preset === "fast" ? 8 : preset === "high" ? 16 : 12)
      : (preset === "fast" ? 12 : preset === "high" ? 24 : 18);
  const cooldownMs = cfg.cooldownMs || DEFAULT_COOLDOWN_MS;

  // Resolve pool: prefer explicit endpoints, fall back to legacy single for old configs.
  let pool: CloudflareEndpoint[] = getEnabledEndpoints(cfg).filter(isEndpointConfigured);
  if (pool.length === 0) {
    pool = [
      {
        id: "cf-primary",
        label: "Primary API",
        mode: cfg.mode,
        workerUrl: cfg.workerUrl,
        workerApiKey: cfg.workerApiKey,
        accountId: cfg.accountId,
        apiToken: cfg.apiToken,
        disabled: false,
      },
    ].filter(isEndpointConfigured);
  }
  if (pool.length === 0) {
    throw new ComfyError("CONFIG", "All Cloudflare APIs are disabled or incomplete. Enable at least one.");
  }

  const ordered = orderEndpointsForAttempt(pool, cfg.strategy || DEFAULT_STRATEGY);
  const now = Date.now();
  // Prefer endpoints not in cooldown; if all are cooling down, still try them (shortest cooldown first).
  const fresh = ordered.filter((e) => (endpointCooldowns.get(e.id) || 0) <= now);
  const cooled = ordered
    .filter((e) => (endpointCooldowns.get(e.id) || 0) > now)
    .sort((a, b) => (endpointCooldowns.get(a.id) || 0) - (endpointCooldowns.get(b.id) || 0));
  const attemptOrder = [...fresh, ...cooled];

  const failures: Array<{ label: string; status: number; message: string }> = [];
  let attempts = 0;

  for (const ep of attemptOrder) {
    if (opts.signal?.aborted) throw new ComfyError("CANCELLED", "Generation cancelled by user.");
    attempts += 1;
    const epStarted = Date.now();
    let res: Response;
    try {
      res = await attemptEndpointGenerate(ep, {
        effectivePrompt,
        negativePrompt,
        model,
        isFlux,
        fluxSteps,
        sdxlSteps,
        targetWidth,
        targetHeight,
        seed,
        signal: opts.signal || AbortSignal.timeout(90000),
      });
    } catch (err: any) {
      if (opts.signal?.aborted || err?.name === "AbortError") {
        throw new ComfyError("CANCELLED", "Generation cancelled by user.");
      }
      if (err instanceof ComfyError) throw err;
      // Network-level failure -> try next endpoint.
      const msg = `Could not reach "${ep.label}": ${err?.message || "network error"}`;
      markEndpointFailure(ep.id, msg, Date.now() - epStarted, false, cooldownMs);
      failures.push({ label: ep.label, status: 0, message: msg });
      continue;
    }

    if (res.ok) {
      let rawImageBuffer: Buffer;
      try {
        rawImageBuffer = await extractImageBufferFromResponse(res);
      } catch (err: any) {
        if (err instanceof ComfyError) {
          const msg = `"${ep.label}": ${err.message}`;
          const rateLimited = isRateLimitSignal(0, err.message);
          markEndpointFailure(ep.id, msg, Date.now() - epStarted, rateLimited, cooldownMs);
          failures.push({ label: ep.label, status: res.status, message: msg });
          continue;
        }
        throw err;
      }
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

      markEndpointSuccess(ep.id, Date.now() - epStarted);
      const outDir = path.join(generatedDir(), scriptId);
      fs.mkdirSync(outDir, { recursive: true });
      const fileName = `${prefix}-${String(opts.index).padStart(2, "0")}-${started}.png`;
      fs.writeFileSync(path.join(outDir, fileName), pngBuffer);

      if (attempts > 1) {
        console.log(`[cloudflare] failover succeeded on "${ep.label}" after ${attempts} attempt(s).`);
      }
      return {
        publicUrl: mediaUrl(`generate/file/${scriptId}/${fileName}`),
        fileName,
        seed,
        elapsedMs: Date.now() - started,
        provider: "cloudflare",
        model,
        endpointId: ep.id,
        endpointLabel: ep.label,
        attempts,
      };
    }

    // Non-OK response: decide retry vs fail.
    const errText = await res.text().catch(() => "");
    if (opts.signal?.aborted) throw new ComfyError("CANCELLED", "Generation cancelled by user.");
    const rateLimited = isRateLimitSignal(res.status, errText);
    if (res.status === 400 || res.status === 404 || res.status === 415) {
      // Prompt/model rejection — retrying another key won't help.
      throw new ComfyError(
        "GENERATION_ERROR",
        `Cloudflare image generation failed on "${ep.label}" (HTTP ${res.status}): ${errText.slice(0, 240)}`
      );
    }
    if (res.status === 401 || res.status === 403) {
      const msg = `"${ep.label}": auth failed (401/403) — check its key/token.`;
      markEndpointFailure(ep.id, msg, Date.now() - epStarted, false, cooldownMs);
      failures.push({ label: ep.label, status: res.status, message: `${msg} ${errText.slice(0, 120)}` });
      continue; // try next key — it may be valid.
    }
    if (isRetryableFailure(res.status, errText) || rateLimited) {
      const reason = rateLimited ? "limit hit" : `HTTP ${res.status}`;
      const msg = `"${ep.label}": ${reason} — switching to backup API. ${errText.slice(0, 120)}`;
      markEndpointFailure(ep.id, msg, Date.now() - epStarted, true, cooldownMs);
      failures.push({ label: ep.label, status: res.status, message: msg });
      continue;
    }
    const msg = `"${ep.label}": HTTP ${res.status} ${errText.slice(0, 160)}`;
    markEndpointFailure(ep.id, msg, Date.now() - epStarted, false, cooldownMs);
    failures.push({ label: ep.label, status: res.status, message: msg });
  }

  const summary = failures.map((f) => f.message).join(" | ").slice(0, 600) || "all endpoints failed";
  const allRateLimited = failures.length > 0 && failures.every((f) => f.status === 429 || /limit|quota|capacity|neurons/i.test(f.message));
  throw new ComfyError(
    allRateLimited ? "RATE_LIMITED" : "GENERATION_ERROR",
    `All ${attemptOrder.length} Cloudflare API(s) failed after ${attempts} attempt(s): ${summary}`,
    { failures }
  );
}
