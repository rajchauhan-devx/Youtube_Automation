import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.TUBEFLOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "editing-simple-"));
const { fixture } = await import("./fixtures.mjs");
const { simpleArtifacts } = await import("../../server/dist/services/editing/simpleArtifacts.js");
const { layoutDiagnostics } = await import("../../server/dist/services/editing/layout.js");
const { validateNarrativeLabels } = await import("../../server/dist/services/editing/evidence.js");

test("fast captions use narration, preserve media, and pass placement checks", async () => {
  const p = await fixture("science");
  const result = simpleArtifacts(p);
  assert.equal(result.status, "ready");
  assert.equal(result.parentRevisionId, p.revisionId);
  assert.deepEqual(result.inputs, p.inputs);
  assert.deepEqual(result.assetIds, p.assetIds);
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.sceneOutcomes[0].state, "complete");
  assert.deepEqual(layoutDiagnostics(result, result.artifacts[0]), []);
  assert.doesNotThrow(() => validateNarrativeLabels(result, result.artifacts[0]));
});

test("a scene too short for reading keeps its original media without a caption", async () => {
  const p = await fixture();
  p.style.minReadingSeconds = 5;
  const result = simpleArtifacts(p);
  assert.equal(result.status, "ready");
  assert.equal(result.artifacts.length, 0);
  assert.equal(result.sceneOutcomes[0].state, "not_needed");
  assert.deepEqual(result.inputs.imageAssets, p.inputs.imageAssets);
});