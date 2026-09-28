import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { editingConfig, EditingError, isLocalEditingModel } from "./config.js";
import { inspectLocalModel, localStructured } from "./localProvider.js";
import type { JobRecord } from "@tubeflow/editing-contracts";
import { OPENCODE_MODELS } from "../opencode-models.js";
import { GROQ_MODELS, OPENROUTER_MODELS } from "../reasoning-models.js";

const modelCooldown = new Map<string, number>();
const lastRequestTime = new Map<string, number>();

export function editingProvider(model: string) {
  if (isLocalEditingModel(model)) return "ollama";
  if (model.startsWith("gemini-")) return "gemini";
  if (model.startsWith("opencode/")) return "opencode";
  if (model.startsWith("groq/")) return "groq";
  return "openrouter";
}
export function modelAcceptsImages(model: string) {
  return editingProvider(model) !== "groq" || model === "groq/qwen/qwen3.8-27b";
}
export function providerCredential(model: string, requestKey?: string) {
  const provider = editingProvider(model);
  if (provider === "ollama") return "local";
  const configured = {
    gemini: process.env.GEMINI_API_KEY,
    opencode: process.env.OPENCODE_API_KEY,
    groq: process.env.GROQ_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
  }[provider];
  return configured || (provider === "gemini" || provider === "openrouter" ? requestKey : undefined);
}
export function supportedEditingModel(model: string) {
  if (isLocalEditingModel(model)) return /^ollama\/[\w.:-]+$/.test(model);
  if (model.startsWith("gemini-")) return /^gemini-[\w.-]+$/.test(model);
  if (model.startsWith("opencode/")) return OPENCODE_MODELS.some(item => item.id === model);
  if (model.startsWith("groq/")) return GROQ_MODELS.some(item => item.id === model);
  if (model.startsWith("openrouter/")) return OPENROUTER_MODELS.some(item => item.id === model);
  return /^[\w.-]+\/[\w.:-]+$/.test(model); // Existing OpenRouter configuration.
}
export type Content =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;
export interface ProviderContext {
  signal: AbortSignal;
  apiKey?: string;
  job: JobRecord;
  maxCalls: number;
  persist: () => void;
}
export function cleanOutput(parsed: any, schema?: z.ZodTypeAny): any {
  if (!parsed || typeof parsed !== "object") return parsed;
  if (Array.isArray(parsed)) {
    for (let i = 0; i < parsed.length; i++) {
      parsed[i] = cleanOutput(parsed[i]);
    }
    return parsed;
  }
  delete parsed.$schema;
  delete parsed._comment;
  delete parsed.comment;
  delete parsed.explanation;
  if (schema && "shape" in schema && typeof (schema as any).shape === "object") {
    const allowed = new Set(Object.keys((schema as any).shape));
    for (const k of Object.keys(parsed)) {
      if (!allowed.has(k)) {
        delete parsed[k];
      }
    }
  }
  for (const k of Object.keys(parsed)) {
    parsed[k] = cleanOutput(parsed[k]);
  }
  return parsed;
}
export function prompt(name: string) {
  return fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../..",
      "prompts/editing",
      `${name}.md`,
    ),
    "utf8",
  );
}
export function normalizeOperationOutput(parsed: any, operation: string, data: any, schema?: z.ZodTypeAny): any {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return cleanOutput(parsed, schema);
  if (operation === "analyze") {
    if (!parsed.id) parsed.id = data?.id || "analysis-0";
    if (!parsed.assetId) parsed.assetId = data?.assetId || "";
    if (!parsed.imageHash) parsed.imageHash = data?.imageHash || "0".repeat(64);
    if (typeof parsed.width !== "number") parsed.width = data?.width || 1280;
    if (typeof parsed.height !== "number") parsed.height = data?.height || 720;
    if (!parsed.description) parsed.description = "Scene visual elements";
    if (!Array.isArray(parsed.protectedRegions)) {
      parsed.protectedRegions = Array.isArray(parsed.regions)
        ? parsed.regions
        : Array.isArray(parsed.protected_regions)
        ? parsed.protected_regions
        : [];
    }
    parsed.protectedRegions = parsed.protectedRegions.map((r: any) => {
      if (!r || typeof r !== "object") return null;
      const x = Math.max(0, Math.min(0.99, Number(r.x) || 0));
      const y = Math.max(0, Math.min(0.99, Number(r.y) || 0));
      const width = Math.max(0.01, Math.min(1 - x, Number(r.width) || 0.1));
      const height = Math.max(0.01, Math.min(1 - y, Number(r.height) || 0.1));
      return { x, y, width, height };
    }).filter(Boolean);

    if (!Array.isArray(parsed.objects)) {
      parsed.objects = [];
    } else {
      parsed.objects = parsed.objects.map((obj: any, idx: number) => {
        if (!obj || typeof obj !== "object") return null;
        const rx = Math.max(0, Math.min(0.99, Number(obj.region?.x) || 0.1));
        const ry = Math.max(0, Math.min(0.99, Number(obj.region?.y) || 0.1));
        const rw = Math.max(0.01, Math.min(1 - rx, Number(obj.region?.width) || 0.8));
        const rh = Math.max(0.01, Math.min(1 - ry, Number(obj.region?.height) || 0.8));
        const ax = Math.max(0, Math.min(1, Number(obj.anchor?.x) || (rx + rw / 2)));
        const ay = Math.max(0, Math.min(1, Number(obj.anchor?.y) || (ry + rh / 2)));
        return {
          id: String(obj.id || `obj-${idx}`),
          description: String(obj.description || "Scene element"),
          region: { x: rx, y: ry, width: rw, height: rh },
          anchor: { x: ax, y: ay },
          maskAssetId: obj.maskAssetId || undefined,
          method: ["vision-estimate", "grounding", "fixture"].includes(obj.method) ? obj.method : "vision-estimate",
          confidence: typeof obj.confidence === "number" ? Math.max(0, Math.min(1, obj.confidence)) : 0.8,
          evidence: String(obj.evidence || "Visible in scene"),
        };
      }).filter(Boolean);
    }
    delete parsed.mediaType;
    delete parsed.regions;
    delete parsed.protected_regions;
  } else if (operation === "plan") {
    if (!Array.isArray(parsed.briefs)) {
      parsed.briefs = [];
    } else {
      parsed.briefs = parsed.briefs.map((b: any, idx: number) => {
        if (!b || typeof b !== "object") return null;
        return {
          id: String(b.id || `brief-${idx}`),
          sceneId: String(b.sceneId || data?.scenes?.[0]?.id || ""),
          intent: String(b.intent || "Visual explanation for narration"),
          narrativeRefs: Array.isArray(b.narrativeRefs) ? b.narrativeRefs : (data?.scenes?.[0]?.narrativeRefs || []),
          assetRequests: Array.isArray(b.assetRequests) ? b.assetRequests : [],
        };
      }).filter(Boolean);
    }
  } else if (operation === "compose" || operation === "repair") {
    // Force the correct artifact ID and scene ID — models often return wrong ones
    if (data?.brief?.id) parsed.id = data.brief.id;
    if (data?.scene?.id) parsed.sceneId = data.scene.id;
    // Force narrative refs to be valid for this scene
    if (data?.scene?.narrativeRefs && Array.isArray(parsed.narrativeRefs)) {
      parsed.narrativeRefs = parsed.narrativeRefs.filter((ref: string) => data.scene.narrativeRefs.includes(ref));
      if (!parsed.narrativeRefs.length && data.scene.narrativeRefs.length) {
        parsed.narrativeRefs = data.scene.narrativeRefs.slice(0, 5);
      }
    }
    // Ensure nodes array exists and has at least a group + shape + text
    if (!Array.isArray(parsed.nodes)) parsed.nodes = [];
    // Normalize each node: infer kind from properties, fill missing required fields
    const sceneDuration = ((data?.scene?.endFrame || 72) - (data?.scene?.startFrame || 0));
    const dims = data?.dimensions || { width: 1920, height: 1080 };
    const fontId = data?.style?.fontAssetIds?.[0] || "default";
    for (const node of parsed.nodes) {
      // Infer kind from properties
      if (!node.kind) {
        if (node.text || node.style?.fontSize) node.kind = "text";
        else if (node.geometry || node.paint?.fill) node.kind = "shape";
        else if (node.commands) node.kind = "path";
        else if (node.from || node.to) node.kind = "connector";
        else if (node.assetId && (node.fit || node.crop)) node.kind = "image";
        else node.kind = "group";
      }
      // Fix invalid kind casing (model sometimes returns "Text" instead of "text")
      const validKinds = ["group", "text", "image", "shape", "path", "connector"];
      if (!validKinds.includes(node.kind)) {
        const lower = node.kind.toLowerCase();
        node.kind = validKinds.includes(lower) ? lower : "group";
      }
      // Ensure required fields exist
      if (!node.id) node.id = `node-${Math.random().toString(36).slice(2, 8)}`;
      if (!node.space) node.space = "screen";
      if (typeof node.zIndex !== "number") node.zIndex = 5;
      if (!node.transform) node.transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } };
      if (typeof node.opacity !== "number") node.opacity = 1;
      if (!Array.isArray(node.tracks)) node.tracks = [];
      // Fix text nodes: ensure required text fields
      if (node.kind === "text") {
        if (!node.text) node.text = " ";
        if (!node.style) node.style = { fontAssetId: fontId, fontSize: 24, fontWeight: "400", color: "#ffffff", align: "center", lineHeight: 1.2 };
        if (!node.style.fontAssetId) node.style.fontAssetId = fontId;
        if (!node.style.fontSize) node.style.fontSize = 24;
        if (!node.style.fontWeight) node.style.fontWeight = "400";
        if (!node.style.color) node.style.color = "#ffffff";
        if (!node.style.align) node.style.align = "center";
        if (!node.style.lineHeight) node.style.lineHeight = 1.2;
        if (!node.bounds) node.bounds = { x: dims.width * 0.05, y: dims.height * 0.05 + (parsed.nodes.indexOf(node)) * 50, width: dims.width * 0.3, height: 50 };
      }
      // Fix shape nodes: ensure geometry and paint
      if (node.kind === "shape") {
        if (!node.geometry) node.geometry = { kind: "rect", bounds: { x: dims.width * 0.05, y: dims.height * 0.05, width: dims.width * 0.3, height: 160 }, radius: 14 };
        if (!node.paint) node.paint = { fill: "#111827EE", stroke: "#F59E0B", strokeWidth: 2, dash: [] };
      }
      // Fix group nodes
      if (node.kind === "group") {
        if (!node.bounds) node.bounds = { x: 0, y: 0, width: dims.width, height: dims.height };
      }
    }
    // If model returned only text nodes (caption-like), add a shape container
    if (parsed.nodes.length > 0 && parsed.nodes.every((n: any) => n.kind === "text")) {
      const cardW = Math.min(400, dims.width * 0.3);
      const cardH = 160;
      const cardX = dims.width * 0.05;
      const cardY = dims.height * 0.08;
      const groupNode = {
        id: "card-group",
        space: "screen",
        zIndex: 10,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
        opacity: 1,
        tracks: [{ property: "opacity", keyframes: [
          { frame: 0, value: 0, easing: { kind: "linear" } },
          { frame: 15, value: 1, easing: { kind: "linear" } },
          { frame: Math.max(0, sceneDuration - 15), value: 1, easing: { kind: "linear" } },
          { frame: sceneDuration, value: 0, easing: { kind: "linear" } }
        ]}],
        kind: "group"
      };
      const shapeNode = {
        id: "card-bg",
        parentId: "card-group",
        space: "parent",
        zIndex: 1,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
        opacity: 1,
        tracks: [],
        kind: "shape",
        geometry: { kind: "rect", bounds: { x: cardX, y: cardY, width: cardW, height: cardH }, radius: 14 },
        paint: { fill: "#111827EE", stroke: "#F59E0B", strokeWidth: 2, dash: [] }
      };
      const repositioned = parsed.nodes.map((n: any, idx: number) => ({
        ...n,
        parentId: "card-group",
        space: "parent",
        zIndex: 5,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, pivot: { x: 0, y: 0 } },
        bounds: { x: cardX + 20, y: cardY + 15 + idx * 50, width: cardW - 40, height: 40 },
        tracks: [{ property: "opacity", keyframes: [
          { frame: 5 + idx * 5, value: 0, easing: { kind: "linear" } },
          { frame: 20 + idx * 5, value: 1, easing: { kind: "linear" } },
          { frame: Math.max(0, sceneDuration - 15), value: 1, easing: { kind: "linear" } },
          { frame: sceneDuration, value: 0, easing: { kind: "linear" } }
        ]}]
      }));
      parsed.nodes = [groupNode, shapeNode, ...repositioned];
    }
    // Add animation tracks to root nodes that lack them
    for (const node of parsed.nodes) {
      if (!node.parentId && node.kind !== "connector" && (!node.tracks || !node.tracks.length)) {
        node.tracks = [{ property: "opacity", keyframes: [
          { frame: 0, value: 0, easing: { kind: "linear" } },
          { frame: 15, value: 1, easing: { kind: "linear" } },
          { frame: Math.max(0, sceneDuration - 15), value: 1, easing: { kind: "linear" } },
          { frame: sceneDuration, value: 0, easing: { kind: "linear" } }
        ]}];
      }
    }
  }
  return cleanOutput(parsed, schema);
}
export async function structured<T>(
  ctx: ProviderContext,
  operation: string,
  model: string,
  schema: z.ZodType<T>,
  data: unknown,
  images: string[] = [],
  diagnostic?: string,
): Promise<T> {
  ctx.signal.throwIfAborted();
  const config = editingConfig(),
    key = providerCredential(model, ctx.apiKey);
  if (!model || (!isLocalEditingModel(model) && !key))
    throw new EditingError(
      "NEEDS_CONFIGURATION",
      `Configure the ${editingProvider(model)} API key for ${operation}.`,
      422,
      true,
    );
  // Rate limit: enforce minimum delay between requests to avoid 429s
  const now = Date.now();
  const lastRequest = lastRequestTime.get(model) || 0;
  const minDelay = isLocalEditingModel(model) ? 500 : 2500; // 2.5s for cloud, 0.5s for local
  if (now - lastRequest < minDelay) {
    await new Promise(r => setTimeout(r, minDelay - (now - lastRequest)));
  }
  lastRequestTime.set(model, Date.now());
  if (ctx.job.usage.length >= ctx.maxCalls)
    throw new EditingError(
      "RESOURCE_LIMIT",
      "The project model request budget is exhausted.",
    );
  // Persist attempt before dispatch so interruptions/retries cannot reset the request budget.
  const usage = {
    operation,
    model,
    promptVersion: "1",
    prompt_tokens: 0,
    completion_tokens: 0,
  };
  ctx.job.usage.push(usage);
  ctx.persist();
  if (isLocalEditingModel(model)) {
    const result = await localStructured({
      model,
      system: prompt("common") + "\n" + prompt(operation),
      content: JSON.stringify({ data, validationDiagnostic: diagnostic }),
      schema: z.toJSONSchema(schema, { unrepresentable: "any", reused: "ref" }),
      images,
      signal: ctx.signal,
    });
    usage.prompt_tokens = result.promptTokens;
    usage.completion_tokens = result.completionTokens;
    ctx.persist();
    return schema.parse(normalizeOperationOutput(JSON.parse(result.content), operation, data, schema));
  }
  const content: Content = [
    {
      type: "text",
      text: JSON.stringify({ data, validationDiagnostic: diagnostic }),
    },
    ...images.map((url) => ({
      type: "image_url" as const,
      image_url: { url },
    })),
  ];
  const provider = editingProvider(model);
  const jsonSchema = z.toJSONSchema(schema, { unrepresentable: "any" });
  delete (jsonSchema as any).$schema;
  if (provider === "gemini") {
    const parts: Array<Record<string, unknown>> = [{ text: JSON.stringify({ data, validationDiagnostic: diagnostic }) }];
    for (const url of images) {
      const match = /^data:([^;]+);base64,(.+)$/.exec(url);
      if (!match) throw new EditingError("INVALID_IMAGE", "Gemini needs an embedded image for visual editing.");
      parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
    }
    const now = Date.now();
    let candidateModels = [model];
    if (model.startsWith("gemini-")) {
      for (const fallback of ["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-flash-latest", "gemini-3.5-flash"]) {
        if (!candidateModels.includes(fallback)) candidateModels.push(fallback);
      }
      candidateModels.sort((a, b) => {
        const aCool = (modelCooldown.get(a) || 0) > now ? 1 : 0;
        const bCool = (modelCooldown.get(b) || 0) > now ? 1 : 0;
        return aCool - bCool;
      });
    }
    let response: Response | undefined;
    let successfulModel = model;
    for (const activeModel of candidateModels) {
      successfulModel = activeModel;
      const isCooldowned = (modelCooldown.get(activeModel) || 0) > Date.now();
      const maxAttempts = isCooldowned ? 1 : 2;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        ctx.signal.throwIfAborted();
        if (attempt > 0) {
          let delay = 1000 * Math.pow(2, attempt - 1);
          if (response?.status === 429) {
            const retryAfter = response.headers.get("retry-after");
            if (retryAfter && !isNaN(Number(retryAfter))) {
              delay = Math.min(10000, Number(retryAfter) * 1000);
            } else {
              delay = Math.min(5000, 2000 * attempt);
            }
          }
          await new Promise((r) => setTimeout(r, delay));
          ctx.signal.throwIfAborted();
        }
        try {
          response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModel)}:generateContent`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key! },
            signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(config.providerTimeout)]),
            body: JSON.stringify({ system_instruction: { parts: [{ text: prompt("common") + "\n" + prompt(operation) + "\nReturn a valid JSON object matching the required schema exactly. Include all required fields:\n" + JSON.stringify(jsonSchema) }] },
              contents: [{ role: "user", parts }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 14000, responseMimeType: "application/json" } }),
          });
          if (response.ok) {
            modelCooldown.delete(activeModel);
            break;
          }
          if (response.status === 429 || response.status === 503) {
            modelCooldown.set(activeModel, Date.now() + 5 * 60 * 1000);
            const hasAlternative = candidateModels.some(m => m !== activeModel && (modelCooldown.get(m) || 0) <= Date.now());
            if (hasAlternative) break;
          }
          if (![429, 500, 502, 503].includes(response.status)) break;
        } catch (err) {
          if (attempt === maxAttempts - 1) throw err;
        }
      }
      if (response?.ok) break;
      if (response && ![503, 502, 500, 429].includes(response.status)) break;
    }
    if (response?.ok) {
      const body = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
      usage.model = successfulModel;
      usage.prompt_tokens = body.usageMetadata?.promptTokenCount || 0;
      usage.completion_tokens = body.usageMetadata?.candidatesTokenCount || 0;
      ctx.persist();
      const candidate = body.candidates?.[0];
      if (!candidate || candidate.finishReason !== "STOP") throw new EditingError("INVALID_PROVIDER_OUTPUT", "Gemini did not complete its JSON response.", 502, true);
      const rawText = candidate.content?.parts?.map(part => part.text || "").join("") || "";
      let parsed: any;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        throw new EditingError("INVALID_PROVIDER_OUTPUT", "Gemini did not complete its JSON response.", 502, true);
      }
      return schema.parse(normalizeOperationOutput(parsed, operation, data, schema));
    }
    // Gemini failed — throw error
    const status = response?.status || 500;
    const message = status === 429
      ? "Gemini rate limit hit. Retry later."
      : `Gemini returned HTTP ${status}.`;
    throw new EditingError("PROVIDER_ERROR", message, 502, [429, 500, 502, 503].includes(status));
  }
  // OpenAI-compatible providers (Groq, OpenRouter, etc.)
  const base = provider === "groq" ? "https://api.groq.com/openai/v1" : provider === "opencode" ? "https://opencode.ai/zen/v1" : "https://openrouter.ai/api/v1";
  const remoteModel = provider === "openrouter" ? model.replace(/^openrouter\//, "") : model.slice(provider.length + 1);
  const groqVisionJson = provider === "groq" && remoteModel === "qwen/qwen3.8-27b";
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      ...(provider === "openrouter" ? { "X-Title": "TubeFlow visual editing" } : {}),
      "X-Request-ID": `${ctx.job.id}-${ctx.job.usage.length}`,
    },
    signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(config.providerTimeout)]),
    body: JSON.stringify({
      model: remoteModel,
      messages: [
        { role: "system", content: prompt("common") + "\n" + prompt(operation) + (groqVisionJson ? "\nReturn every required field in a JSON object matching this schema exactly: " + JSON.stringify(jsonSchema) : "") },
        { role: "user", content },
      ],
      temperature: 0.3,
      max_tokens: 14000,
      response_format: groqVisionJson ? { type: "json_object" } : {
        type: "json_schema",
        json_schema: { name: "editing_output", strict: true, schema: jsonSchema },
      },
    }),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    const detail = failure?.error?.message?.slice(0, 350);
    throw new EditingError(
      [401, 402].includes(response.status) ? "NEEDS_CONFIGURATION" : "PROVIDER_ERROR",
      response.status === 402
        ? `${provider} billing or credit limit blocked this job (HTTP 402).`
        : `${provider} returned HTTP ${response.status}.${detail ? " " + detail : ""}`,
      [401, 402].includes(response.status) ? 422 : 502,
      [429, 500, 502, 503].includes(response.status),
    );
  }
  const body = (await response.json()) as {
    choices?: { message: { content: string }; finish_reason: string }[];
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  if (body.usage) {
    usage.prompt_tokens = body.usage.prompt_tokens;
    usage.completion_tokens = body.usage.completion_tokens;
    ctx.persist();
  }
  const choice = body.choices?.[0];
  if (!choice || choice.finish_reason !== "stop")
    throw new EditingError("INVALID_PROVIDER_OUTPUT", "The model did not complete its structured response.", 502, true);
  ctx.signal.throwIfAborted();
  return schema.parse(normalizeOperationOutput(JSON.parse(choice.message.content), operation, data, schema));
}
export async function modelCapabilities(apiKey?: string, selectedModel?: string) {
  const models = selectedModel ? [selectedModel] : [
    editingConfig().planner,
    editingConfig().vision,
    editingConfig().review,
  ].filter(Boolean);
  if (!models.length)
    return {
      ready: false,
      missing: ["Configure planner, vision and review models"],
    };
  const missing: string[] = [];
  for (const id of models) {
    if (!supportedEditingModel(id)) missing.push(`Unsupported model: ${id}`);
    if (!providerCredential(id, apiKey)) missing.push(`Add a ${editingProvider(id)} API key in server/.env or app settings.`);
  }
  for (const id of new Set(models.filter(isLocalEditingModel))) {
    const capability = await inspectLocalModel(id);
    if (!capability.ready)
      missing.push(capability.message || `Local model unavailable: ${id}`);
  }
  const remoteModels = models.filter((model) => editingProvider(model) === "openrouter");
  if (!remoteModels.length) return { ready: !missing.length, missing };
  if (missing.length) return { ready: false, missing };
  const response = await fetch("https://openrouter.ai/api/v1/models", {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new EditingError(
      "PROVIDER_ERROR",
      "Cannot inspect configured model capabilities",
      502,
      true,
    );
  const body = (await response.json()) as {
    data: {
      id: string;
      architecture?: { input_modalities?: string[] };
      supported_parameters?: string[];
    }[];
  };
  for (const id of remoteModels) {
    const model = body.data.find((m) => m.id === id.replace(/^openrouter\//, ""));
    if (!model) missing.push(`Model unavailable: ${id}`);
    else {
      if (!model.supported_parameters?.includes("structured_outputs"))
        missing.push(`Model lacks structured outputs: ${id}`);
    }
  }
  return { ready: !missing.length, missing };
}
