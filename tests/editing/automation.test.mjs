import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {randomUUID} from "node:crypto";
process.env.TUBEFLOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "editing-automation-"));
process.env.EDITING_PLANNER_MODEL = process.env.EDITING_VISION_MODEL = process.env.EDITING_REVIEW_MODEL = "fixture";
const {fixture} = await import("./fixtures.mjs");
const {runPipeline} = await import("../../server/dist/services/editing/pipeline.js");
const {objectHash} = await import("../../server/dist/services/editing/repository.js");
const originalFetch = globalThis.fetch;
for (const mode of ["repair", "rejected", "not_needed", "planning_failed", "budget"]) {
  test(`automatic scene processing: ${mode}`, async () => {
    const p = await fixture();
    const artifact = structuredClone(p.artifacts[0]);
    artifact.id = "scene-0-artifact";
    artifact.nodes = [artifact.nodes.find(n => n.kind === "text")];
    artifact.nodes[0].text = "bronze";
    artifact.nodes[0].bounds = {x: 24, y: 20, width: 180, height: 50};
    p.artifacts = [];
    let reviews = 0, repairs = 0;
    globalThis.fetch = async (url, options) => {
      if (String(url) !== "https://openrouter.ai/api/v1/chat/completions") return originalFetch(url, options);
      const request = JSON.parse(options.body), system = request.messages[0].content;
      const data = JSON.parse(request.messages[1].content[0].text).data;
      let value;
      if (system.includes("Direct a coherent")) value = p.style;
      else if (system.includes("Inspect the actual")) value = p.analyses[0];
      else if (system.includes("Design scene-specific")) {
        assert.equal(data.scenes.length, 1);
        assert.ok(data.narration.tokens.every(t => data.scenes[0].narrativeRefs.includes(t.id)));
        if (mode === "planning_failed") throw new Error("Planner offline");
        value = {briefs: mode === "not_needed" ? [] : [{id: artifact.id, sceneId: artifact.sceneId, intent: artifact.intent, narrativeRefs: artifact.narrativeRefs, assetRequests: []}], reason: "AI scene decision"};
      } else if (system.includes("Translate the creative")) value = artifact;
      else if (system.includes("Repair the supplied")) { repairs++; value = artifact; }
      else if (system.includes("Review these actual")) {
        reviews++;
        value = {findings: mode === "rejected" || reviews === 1 ? [{artifactId: artifact.id, frame: data.frames[0], severity: "error", message: "Label is obscured; simplify its position."}] : []};
      } else throw new Error("Unexpected operation");
      return new Response(JSON.stringify({choices: [{message: {content: JSON.stringify(value)}, finish_reason: "stop"}], usage: {prompt_tokens: 1, completion_tokens: 1}}));
    };
    const now = new Date().toISOString();
    const job = {id: randomUUID(), projectId: p.id, revisionId: p.revisionId, operation: "generate", inputHash: objectHash(p), idempotencyKey: randomUUID(), state: "running", stage: "start", attempts: 1, completed: 0, total: 0, createdAt: now, updatedAt: now, stages: {}, usage: []};
    try {
      const result = await runPipeline(p, {job, apiKey: "fixture", maxCalls: mode === "budget" ? 3 : 20, signal: new AbortController().signal, persist: () => {}, stage: () => {}});
      if (mode === "repair") {
        assert.equal(result.status, "ready");
        assert.equal(result.artifacts.length, 1);
        assert.equal(result.sceneOutcomes[0].state, "complete");
        assert.equal(repairs, 1);
        assert.equal(reviews, 2);
      } else if (mode === "not_needed") {
        assert.equal(result.status, "ready");
        assert.equal(result.sceneOutcomes[0].state, "not_needed");
        assert.equal(reviews, 0);
      } else {
        assert.equal(result.status, "partial");
        assert.equal(result.artifacts.length, 0);
        assert.equal(result.sceneOutcomes[0].state, "failed");
        if (mode === "rejected") {assert.equal(reviews, 3); assert.equal(repairs, 2);}
        if (mode === "budget") assert.equal(job.usage.length, 3);
      }
    } finally { globalThis.fetch = originalFetch; }
  });
}
