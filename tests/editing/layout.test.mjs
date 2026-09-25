import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.TUBEFLOW_DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "tubeflow-editing-layout-"),
);
const { fixture } = await import("./fixtures.mjs");
const { placeArtifact, layoutDiagnostics } = await import(
  "../../server/dist/services/editing/layout.js"
);
const p = await fixture();
test("automatic text layout expands undersized label bounds before rendering", () => {
  const artifact = structuredClone(p.artifacts[0]);
  artifact.nodes = [artifact.nodes.find((node) => node.kind === "text")];
  const node = artifact.nodes[0];
  node.text = "bronze hand";
  node.bounds = { x: 20, y: 20, width: 60, height: 10 };
  node.tracks = [];
  const fixed = placeArtifact(p, artifact);
  assert.ok(fixed.nodes[0].bounds.height > 10);
  assert.ok(
    !layoutDiagnostics({ ...p, artifacts: [fixed] }, fixed).some(
      (d) => d.code === "TEXT_FIT" || d.code === "OFFSCREEN",
    ),
  );
});
test("static screen placement repairs duplicate translations without changing text or narration references", () => {
  const artifact = structuredClone(p.artifacts[0]);
  artifact.nodes = [artifact.nodes.find((node) => node.kind === "text")];
  const node = artifact.nodes[0];
  node.text = "bronze";
  node.bounds = { x: 500, y: 500, width: 180, height: 50 };
  node.transform.x = 500;
  node.transform.y = 500;
  node.tracks = [];
  const fixed = placeArtifact(p, artifact);
  assert.equal(fixed.nodes[0].text, "bronze");
  assert.deepEqual(fixed.narrativeRefs, artifact.narrativeRefs);
  assert.equal(fixed.nodes[0].transform.x, 0);
  assert.equal(fixed.nodes[0].transform.y, 0);
  assert.ok(
    !layoutDiagnostics({ ...p, artifacts: [fixed] }, fixed).some(
      (d) => d.code === "OFFSCREEN" || d.code === "RESERVED_REGION",
    ),
  );
  assert.equal(artifact.nodes[0].bounds.x, 500);
});
