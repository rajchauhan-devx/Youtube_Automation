import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
process.env.TUBEFLOW_DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "tubeflow-editing-pipeline-"),
);
process.env.EDITING_PLANNER_MODEL = "fixture-model";
process.env.EDITING_VISION_MODEL = "fixture-model";
process.env.EDITING_REVIEW_MODEL = "fixture-model";
const { fixture } = await import("./fixtures.mjs");
const { runPipeline } = await import(
  "../../server/dist/services/editing/pipeline.js"
);
const { validateNarrativeLabels } = await import(
  "../../server/dist/services/editing/evidence.js"
);
const { objectHash, current } = await import(
  "../../server/dist/services/editing/repository.js"
);
const p = await fixture(),
  originalFetch = globalThis.fetch;
function jobFor(project, operation = "generate") {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    projectId: project.id,
    revisionId: project.revisionId,
    operation,
    inputHash: objectHash(project),
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
}
test("fact labels cannot invent material, date or measurement from an image", () => {
  const a = structuredClone(p.artifacts[0]);
  a.nodes.find((n) => n.kind === "text").text = "Gold 1492 80kg";
  assert.throws(
    () => validateNarrativeLabels(p, a),
    /outside its cited narration/,
  );
});
test("bounded invalid-JSON repair produces a validated composition and actual rendered previews", async () => {
  const input = structuredClone(p);
  input.artifacts = [];
  input.status = "draft";
  input.settings.maxProviderCalls = 10;
  let calls = 0;
  const a = structuredClone(p.artifacts[0]);
  a.nodes = [a.nodes.find((n) => n.kind === "text")];
  a.nodes[0].text = "bronze";
  a.nodes[0].bounds = { x: 16, y: 20, width: 200, height: 50 };
  globalThis.fetch = async (url, options) => {
    if (String(url) !== "https://openrouter.ai/api/v1/chat/completions")
      return originalFetch(url, options);
    calls++;
    const request = JSON.parse(options.body),
      system = request.messages[0].content;
    let value;
    if (system.includes("Direct a coherent")) value = p.style;
    else if (system.includes("Inspect the actual")) value = p.analyses[0];
    else if (system.includes("Design scene-specific"))
      value = {
        briefs: [
          {
            id: a.id,
            sceneId: a.sceneId,
            intent: a.intent,
            narrativeRefs: a.narrativeRefs,
            assetRequests: [],
          },
        ],
      };
    else if (system.includes("Translate the creative"))
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "{broken" }, finish_reason: "stop" }],
        }),
      );
    else if (system.includes("Repair the supplied")) value = {...a, id: request.response_format.json_schema.schema.properties.id.const};
    else if (system.includes("Review these actual")) value = { findings: [] };
    else throw new Error("Unexpected prompt");
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: { content: JSON.stringify(value) },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10 },
      }),
    );
  };
  try {
    const job = jobFor(input),
      result = await runPipeline(input, {
        job,
        apiKey: "fake-key-not-stored",
        maxCalls: 10,
        signal: new AbortController().signal,
        persist: () => {},
        stage: () => {},
      });
    assert.equal(result.status, "ready");
    assert.equal(result.artifacts.length, 1);
    assert.equal(calls, 6);
    assert.ok(result.diagnostics.some((d) => d.code === "APPROXIMATE_TIMING"));
    assert.ok(
      result.diagnostics.some((d) => d.code === "UNVERIFIED_SCRIPT_CLAIMS"),
    );
    assert.equal(
      current(input.id).revisionId,
      input.revisionId,
      "pipeline cannot publish outside scheduler",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("provider cancellation stops requests and leaves existing preview intact", async () => {
  const input = structuredClone(p),
    controller = new AbortController();
  let entered;
  const started = new Promise((r) => (entered = r));
  globalThis.fetch = async (url, options) => {
    if (String(url) !== "https://openrouter.ai/api/v1/chat/completions")
      return originalFetch(url, options);
    entered();
    return new Promise((_, reject) =>
      options.signal.addEventListener(
        "abort",
        () => reject(new Error("Cancelled")),
        { once: true },
      ),
    );
  };
  try {
    const run = runPipeline(input, {
      job: jobFor(input),
      apiKey: "fake",
      maxCalls: 10,
      signal: controller.signal,
      persist: () => {},
      stage: () => {},
    });
    await started;
    controller.abort();
    await assert.rejects(run);
    assert.equal(current(p.id).revisionId, p.revisionId);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
