import { editingConfig, EditingError } from "./config.js";
import { presenterState } from "../presenter-state.js";
import { localMusicBusy } from "../local-music.js";
import { narrationBusy } from "../long-narration.js";

const base = "http://127.0.0.1:11434";
export async function inspectLocalModel(id: string) {
  const name = id.slice("ollama/".length);
  try {
    const response = await fetch(`${base}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: name }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok)
      return {
        ready: false,
        vision: false,
        message: `Local model ${name} is not installed in Ollama.`,
      };
    const info = (await response.json()) as { capabilities?: string[] };
    return {
      ready: !!info.capabilities?.includes("completion"),
      vision: !!info.capabilities?.includes("vision"),
      message: "",
    };
  } catch {
    return {
      ready: false,
      vision: false,
      message: "Start Ollama on this computer to use local visual editing.",
    };
  }
}

export async function localStructured(request: {
  model: string;
  system: string;
  content: string;
  schema: unknown;
  images: string[];
  signal: AbortSignal;
}) {
  const config = editingConfig(),
    model = request.model.slice("ollama/".length);
  const schemaText = JSON.stringify(request.schema);
  // Conservative bounded estimate: reject oversized local requests rather than silently dropping narration.
  const inputEstimate =
    Math.ceil(
      Buffer.byteLength(request.system + request.content + schemaText, "utf8") /
        2,
    ) +
    request.images.length * 1024;
  const outputBudget = Math.min(
    config.localOutputTokens,
    config.localContext - inputEstimate - 256,
  );
  if (outputBudget < 512)
    throw new EditingError(
      "LOCAL_CONTEXT_LIMIT",
      "This visual-edit request exceeds the local model context budget. Use fewer scenes or a configured larger context/model.",
    );
  if (
    presenterState.busy ||
    presenterState.mediaRequests ||
    presenterState.imageRequests ||
    presenterState.speechRequests ||
    presenterState.editingRequests ||
    presenterState.localRequests ||
    localMusicBusy() ||
    narrationBusy()
  )
    throw new EditingError(
      "GPU_BUSY",
      "Wait for active local AI, image, narration, music or presenter generation.",
      409,
      true,
    );
  const images = request.images.map((image) => {
    const match = image.match(
      /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/,
    );
    if (!match)
      throw new EditingError(
        "INVALID_IMAGE",
        "Local vision accepts registered image bytes only.",
      );
    return match[1];
  });
  const signal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(config.localTimeout),
  ]);
  signal.throwIfAborted();
  presenterState.editingRequests++;
  let dispatched = false;
  try {
    const capability = await inspectLocalModel(request.model);
    signal.throwIfAborted();
    if (!capability.ready || (images.length && !capability.vision))
      throw new EditingError(
        "NEEDS_CONFIGURATION",
        capability.message ||
          `Local model ${model} does not support image input.`,
        422,
        true,
      );
    dispatched = true;
    const response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        keep_alive: 0,
        format: request.schema,
        messages: [
          {
            role: "system",
            content:
              request.system +
              "\nReturn compact JSON matching this schema exactly. For compositions, prefer a small clear arrangement. Set transform x/y=0, scaleX/scaleY=1, rotation=0 and put static screen positions in bounds; do not apply the same position twice.\n" +
              schemaText,
          },
          {
            role: "user",
            content: request.content,
            ...(images.length ? { images } : {}),
          },
        ],
        options: {
          num_ctx: config.localContext,
          num_predict: outputBudget,
          temperature: 0,
          seed: 42,
        },
      }),
    });
    if (!response.ok)
      throw new EditingError(
        response.status === 404
          ? "NEEDS_CONFIGURATION"
          : "LOCAL_PROVIDER_ERROR",
        `Ollama returned HTTP ${response.status}. Check the local model and free GPU memory.`,
        502,
        true,
      );
    const result = (await response.json()) as {
      error?: string;
      done?: boolean;
      done_reason?: string;
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };
    signal.throwIfAborted();
    if (
      result.error ||
      !result.done ||
      result.done_reason !== "stop" ||
      !result.message?.content
    )
      throw new EditingError(
        "INVALID_PROVIDER_OUTPUT",
        "The local model did not complete its structured response. Simplify the request or increase its output budget.",
        502,
        true,
      );
    return {
      content: result.message.content,
      promptTokens: result.prompt_eval_count ?? 0,
      completionTokens: result.eval_count ?? 0,
    };
  } catch (error) {
    if (signal.aborted)
      throw new EditingError(
        "LOCAL_CANCELLED",
        "Local visual editing was cancelled or timed out.",
        408,
        true,
      );
    if (error instanceof EditingError) throw error;
    throw new EditingError(
      "NEEDS_CONFIGURATION",
      "Ollama could not be reached. Start it on this computer and retry.",
      422,
      true,
    );
  } finally {
    if (dispatched) {
      // Keep the GPU reservation until the owned model has been asked to unload, including aborts.
      await fetch(`${base}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, keep_alive: 0 }),
        signal: AbortSignal.timeout(10000),
      }).catch(() => undefined);
    }
    presenterState.editingRequests--;
  }
}
