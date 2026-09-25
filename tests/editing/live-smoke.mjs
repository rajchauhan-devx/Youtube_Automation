// Opt-in, bounded provider smoke test with synthetic fixtures only; ollama/ stays local.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import dotenv from "../../server/node_modules/dotenv/lib/main.js";
dotenv.config({ path: "server/.env", quiet: true });
if (!process.env.EDITING_SMOKE_MODEL)
  throw new Error(
    "Set EDITING_SMOKE_MODEL to an inspected image + structured-output model",
  );
process.env.TUBEFLOW_DATA_DIR = path.resolve("artifacts/editing-live-data");
process.env.EDITING_PLANNER_MODEL = process.env.EDITING_SMOKE_MODEL;
process.env.EDITING_VISION_MODEL = process.env.EDITING_SMOKE_MODEL;
process.env.EDITING_REVIEW_MODEL = process.env.EDITING_SMOKE_MODEL;
const { fixture } = await import("./fixtures.mjs");
const { runPipeline } = await import(
  "../../server/dist/services/editing/pipeline.js"
);
const { exportVideo } = await import(
  "../../server/dist/services/editing/renderer.js"
);
const { modelCapabilities } = await import(
  "../../server/dist/services/editing/providers.js"
);
const { atomic, objectHash, projectDir } = await import(
  "../../server/dist/services/editing/repository.js"
);
const ready = await modelCapabilities();
if (!ready.ready) throw new Error(ready.missing.join("; "));
const p = await fixture("museum", false, true);
p.status = "draft";
p.settings.maxGeneratedAssets = 0;
p.settings.maxProviderCalls = 10;
const now = new Date().toISOString(),
  job = {
    id: randomUUID(),
    projectId: p.id,
    revisionId: p.revisionId,
    operation: "generate",
    inputHash: objectHash(p),
    idempotencyKey: randomUUID(),
    state: "running",
    stage: "start",
    attempts: 1,
    completed: 0,
    total: 0,
    createdAt: now,
    updatedAt: now,
    stages: {},
    usage: [],
  };
const start = Date.now();
const resultFile = process.env.EDITING_SMOKE_MODEL.startsWith("ollama/")
  ? "artifacts/editing-smoke/local-pipeline-result.json"
  : "artifacts/editing-smoke/live-result.json";
try {
  const result = await runPipeline(p, {
    job,
    maxCalls: 10,
    signal: AbortSignal.timeout(600000),
    persist: () => {},
    stage: (stage, completed, total) =>
      console.log(JSON.stringify({ stage, completed, total })),
  });
  const renderId = randomUUID();
  await exportVideo(result, renderId, new AbortController().signal, () => {});
  atomic(resultFile, {
    success: true,
    model: process.env.EDITING_SMOKE_MODEL,
    artifactCount: result.artifacts.length,
    artifactGenerationVerified: result.artifacts.length > 0,
    diagnostics: result.diagnostics,
    usage: job.usage,
    elapsedMs: Date.now() - start,
    output: path.join(projectDir(p.id), "renders", renderId, "video.mp4"),
  });
  console.log(
    result.artifacts.length ? "LIVE_ARTIFACT_SMOKE_SUCCEEDED" : "LIVE_RENDER_ONLY_NO_ARTIFACTS",
    result.artifacts.length,
  );
} catch (error) {
  atomic(resultFile, {
    success: false,
    error: error.message,
    usage: job.usage,
    elapsedMs: Date.now() - start,
  });
  console.error(error.message);
  process.exitCode = 1;
}
