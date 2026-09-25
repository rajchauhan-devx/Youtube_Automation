import fs from "node:fs";
export function numberSetting(
  name: string,
  fallback: number,
  min: number,
  max: number,
) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return value;
}
export function editingConfig() {
  if (
    process.env.AI_EDITING_ENABLED &&
    !["true", "false"].includes(process.env.AI_EDITING_ENABLED)
  )
    throw new Error("AI_EDITING_ENABLED must be true or false");
  return {
    enabled: process.env.AI_EDITING_ENABLED === "true",
    planner: process.env.EDITING_PLANNER_MODEL || "",
    vision: process.env.EDITING_VISION_MODEL || "",
    review: process.env.EDITING_REVIEW_MODEL || "",
    localContext: numberSetting("EDITING_LOCAL_CONTEXT", 16384, 4096, 32768),
    localOutputTokens: numberSetting(
      "EDITING_LOCAL_OUTPUT_TOKENS",
      4096,
      512,
      8192,
    ),
    localTimeout: numberSetting(
      "EDITING_LOCAL_TIMEOUT_MS",
      300000,
      1000,
      900000,
    ),
    alignmentUrl: process.env.EDITING_ALIGNMENT_URL || "",
    groundingUrl: process.env.EDITING_GROUNDING_URL || "",
    workflow: process.env.EDITING_ARTIFACT_WORKFLOW_PATH || "",
    backgroundWorkflow:
      process.env.EDITING_BACKGROUND_REMOVAL_WORKFLOW_PATH || "",
    maxRepairs: numberSetting("EDITING_MAX_REPAIR_ATTEMPTS", 2, 0, 3),
    maxCalls: numberSetting("EDITING_MAX_PROVIDER_CALLS", 2000, 1, 2000),
    maxAssets: numberSetting("EDITING_MAX_GENERATED_ASSETS", 4, 0, 20),
    providerTimeout: numberSetting(
      "EDITING_PROVIDER_TIMEOUT_MS",
      120000,
      1000,
      600000,
    ),
    renderTimeout: numberSetting(
      "EDITING_RENDER_TIMEOUT_MS",
      1800000,
      1000,
      7200000,
    ),
    renderConcurrency: numberSetting("EDITING_RENDER_CONCURRENCY", 1, 1, 4),
    gpuConcurrency: numberSetting("EDITING_GPU_CONCURRENCY", 1, 1, 1),
    browser:
      process.env.EDITING_BROWSER_EXECUTABLE ||
      [
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
      ].find((p) => fs.existsSync(p)),
  };
}
export const isLocalEditingModel = (model: string) =>
  model.startsWith("ollama/");
export function editingNeedsApiKey() {
  const config = editingConfig();
  return [config.planner, config.vision, config.review].some(
    (model) => model && !isLocalEditingModel(model),
  );
}
export class EditingError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 422,
    public retryable = false,
  ) {
    super(message);
  }
}
export const assertEditingEnabled = () => {
  if (!editingConfig().enabled)
    throw new EditingError(
      "NEEDS_CONFIGURATION",
      "Enable AI_EDITING_ENABLED on the server to use visual editing.",
    );
};
