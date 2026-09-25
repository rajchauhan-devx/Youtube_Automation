import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { editingConfig, EditingError, isLocalEditingModel } from "./config.js";
import { inspectLocalModel, localStructured } from "./localProvider.js";
import type { JobRecord } from "@tubeflow/editing-contracts";
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
    key = ctx.apiKey || process.env.OPENROUTER_API_KEY;
  if (!model || (!isLocalEditingModel(model) && !key))
    throw new EditingError(
      "NEEDS_CONFIGURATION",
      `Configure the ${operation} model and OpenRouter credentials.`,
      422,
      true,
    );
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
    return schema.parse(JSON.parse(result.content));
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
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "X-Title": "TubeFlow visual editing",
        "X-Request-ID": `${ctx.job.id}-${ctx.job.usage.length}`,
      },
      signal: AbortSignal.any([
        ctx.signal,
        AbortSignal.timeout(config.providerTimeout),
      ]),
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: prompt("common") + "\n" + prompt(operation),
          },
          { role: "user", content },
        ],
        temperature: 0.3,
        max_tokens: 14000,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "editing_output",
            strict: true,
            schema: z.toJSONSchema(schema, { unrepresentable: "any" }),
          },
        },
        provider: { require_parameters: true },
      }),
    },
  );
  if (!response.ok)
    throw new EditingError(
      [401, 402].includes(response.status)
        ? "NEEDS_CONFIGURATION"
        : "PROVIDER_ERROR",
      response.status === 402
        ? "OpenRouter billing or credit limit blocked this job (HTTP 402). Update provider billing, then resume."
        : `Editing provider returned HTTP ${response.status}. Check model structured-output and image capabilities.`,
      [401, 402].includes(response.status) ? 422 : 502,
      [429, 500, 502, 503].includes(response.status),
    );
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
    throw new EditingError(
      "INVALID_PROVIDER_OUTPUT",
      "The model did not complete its structured response.",
      502,
      true,
    );
  ctx.signal.throwIfAborted();
  return schema.parse(JSON.parse(choice.message.content));
}
export async function modelCapabilities(apiKey?: string) {
  const models = [
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
  for (const id of new Set(models.filter(isLocalEditingModel))) {
    const capability = await inspectLocalModel(id);
    if (!capability.ready)
      missing.push(capability.message || `Local model unavailable: ${id}`);
    else if (
      [editingConfig().vision, editingConfig().review].includes(id) &&
      !capability.vision
    )
      missing.push(`Local model lacks image input: ${id}`);
  }
  const remoteModels = models.filter((model) => !isLocalEditingModel(model));
  if (!remoteModels.length) return { ready: !missing.length, missing };
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
    const model = body.data.find((m) => m.id === id);
    if (!model) missing.push(`Model unavailable: ${id}`);
    else {
      if (!model.supported_parameters?.includes("structured_outputs"))
        missing.push(`Model lacks structured outputs: ${id}`);
      if (
        [editingConfig().vision, editingConfig().review].includes(id) &&
        !model.architecture?.input_modalities?.includes("image")
      )
        missing.push(`Model lacks image input: ${id}`);
    }
  }
  return { ready: !missing.length, missing };
}
