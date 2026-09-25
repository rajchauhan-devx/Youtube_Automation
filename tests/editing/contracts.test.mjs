import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.TUBEFLOW_DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "tubeflow-editing-contracts-"),
);
const { fixture } = await import("./fixtures.mjs");
const { validateProject, toFrame, durationFrames, identity } = await import(
  "@tubeflow/editing-contracts"
);
const { sourceToScreen, transformMatrix, apply, resolveAnchor, evaluateTrack } =
  await import("@tubeflow/video-composition");
const { nextRevision, publish, current, revision, assetRecord } = await import(
  "../../server/dist/services/editing/repository.js"
);
const p = await fixture();
test("rejects unknown primitives, properties, nonfinite values, bad crops and oversized graphs", () => {
  for (const mutate of [
    (q) => (q.artifacts[0].nodes[0].kind = "javascript"),
    (q) => (q.artifacts[0].nodes[0].css = "url(http://evil)"),
    (q) => (q.artifacts[0].nodes[0].opacity = Infinity),
    (q) => (q.artifacts[0].nodes[1].crop.width = 1),
    (q) => (q.artifacts[0].nodes = Array(129).fill(q.artifacts[0].nodes[0])),
  ]) {
    const q = structuredClone(p);
    mutate(q);
    assert.throws(() => validateProject(q));
  }
});
test("rejects graph cycles, unresolved references, guessed pointers, gaps, duplicate IDs", () => {
  for (const mutate of [
    (q) => (q.scenes[0].startFrame = 1),
    (q) => (q.artifacts[0].nodes[1].assetId = "missing"),
    (q) => (q.artifacts[0].nodes[0].parentId = q.artifacts[0].nodes[0].id),
    (q) => q.artifacts[0].nodes.push(q.artifacts[0].nodes[0]),
    (q) => (q.analyses[0].objects[0].method = "vision-estimate"),
  ]) {
    const q = structuredClone(p);
    mutate(q);
    assert.throws(() => validateProject(q));
  }
});
test("frame rounding and half-open full duration are exact", () => {
  assert.equal(toFrame(0.125, 24), 3);
  assert.equal(durationFrames(1.01, 24), 25);
  assert.equal(p.scenes.at(-1).endFrame, p.inputs.durationFrames);
});
test("transform order uses pivot then scale, rotate, translate", () => {
  const m = transformMatrix({
    ...identity(),
    x: 4,
    y: 7,
    scaleX: 2,
    scaleY: 3,
    rotation: 90,
    pivot: { x: 1, y: 1 },
  });
  const v = apply(m, { x: 2, y: 2 });
  assert.ok(Math.abs(v.x - 2) < 1e-9);
  assert.ok(Math.abs(v.y - 10) < 1e-9);
});
test("known hand stays attached to camera within two output pixels over every frame", () => {
  const scene = p.scenes[0],
    a = p.artifacts[0],
    dims = Object.fromEntries(
      p.assetIds.map((id) => {
        const r = assetRecord(id);
        return [id, { width: r.width || 1, height: r.height || 1 }];
      }),
    );
  for (let frame = 0; frame < 72; frame++) {
    const scale = 1 + (0.12 * frame) / 72,
      expected = {
        x: (640 - 640 * scale) / 2 + (5 * frame) / 72 + 420 * scale,
        y: (360 - 640 * scale) / 2 - (3 * frame) / 72 + 380 * scale,
      };
    const actual = resolveAnchor(
      a.nodes.find((n) => n.kind === "connector").from,
      a,
      p,
      frame,
      dims,
    );
    assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 2);
    assert.deepEqual(
      actual,
      sourceToScreen({ x: 420 / 640, y: 380 / 640 }, scene, frame, p.inputs, {
        width: 640,
        height: 640,
      }),
    );
  }
});
test("track evaluation is deterministic on local keyframes", () => {
  const t = {
    property: "opacity",
    keyframes: [
      { frame: 0, value: 0, easing: { kind: "linear" } },
      { frame: 10, value: 1, easing: { kind: "linear" } },
    ],
  };
  assert.equal(evaluateTrack(t, 5), 0.5);
  assert.equal(evaluateTrack(t, 20), 1);
});
test("revision CAS preserves immutable history and unrelated asset hashes", () => {
  const next = nextRevision(p);
  next.artifacts[0].enabled = false;
  publish(next, p.revisionId);
  assert.equal(current(p.id).revisionId, next.revisionId);
  assert.equal(revision(p.id, p.revisionId).artifacts[0].enabled, true);
  assert.throws(() => publish(nextRevision(p), p.revisionId), /changed/);
  assert.deepEqual(next.assetIds, p.assetIds);
});
test("different themes, Hindi and quiet scene use same primitive graph", async () => {
  for (const theme of ["museum", "technology", "science"])
    for (const portrait of [true, false])
      assert.ok(validateProject(await fixture(theme, portrait)));
  assert.equal((await fixture("museum", true, true)).artifacts.length, 0);
});
