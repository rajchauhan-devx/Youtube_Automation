import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
process.env.TUBEFLOW_DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "tubeflow-editing-worker-"),
);
const { fixture } = await import("./fixtures.mjs");
const { renderInWorker } = await import(
  "../../server/dist/services/editing/renderWorker.js"
);
const { projectDir, assetRecord, assetFile, current } = await import(
  "../../server/dist/services/editing/repository.js"
);
const { deleteScriptEditing } = await import(
  "../../server/dist/services/editing/scheduler.js"
);
const p = await fixture("science", true);
test("production worker resolves compiled entry/resources and produces a complete MP4", async () => {
  const id = randomUUID(),
    url = await renderInWorker(p, id, new AbortController().signal, () => {});
  assert.ok(url.endsWith("/video.mp4"));
  const dir = path.join(projectDir(p.id), "renders", id);
  assert.ok(fs.statSync(path.join(dir, "video.mp4")).size > 1000);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json")));
  assert.equal(manifest.frameCount, 72);
  assert.equal(manifest.audioAssetId, p.inputs.audioAssetId);
});
test("cancellation during frame rendering stops the owned worker and prevents final publication", async () => {
  const id = randomUUID(),
    controller = new AbortController();
  let seen = false;
  await assert.rejects(
    renderInWorker(p, id, controller.signal, (done) => {
      if (done > 0 && !seen) {
        seen = true;
        controller.abort();
      }
    }),
    /Cancelled/,
  );
  assert.ok(seen);
  assert.ok(
    !fs.existsSync(path.join(projectDir(p.id), "renders", id, "video.mp4")),
  );
  assert.ok(
    !fs.existsSync(path.join(projectDir(p.id), "renders", id, "partial.mp4")),
  );
  assert.equal(current(p.id).revisionId, p.revisionId);
});
test("deleting a script removes its owned projects and leaves assets referenced by another project", async () => {
  const other = await fixture("technology");
  other.scriptId = "other-fixture";
  other.inputs.scriptId = "other-fixture";
  const { nextRevision, publish } = await import(
    "../../server/dist/services/editing/repository.js"
  );
  const next = nextRevision(other);
  publish(next, other.revisionId);
  const shared = p.inputs.audioAssetId;
  await deleteScriptEditing(p.scriptId);
  assert.throws(() => current(p.id), /not found/);
  assert.ok(assetRecord(shared));
  assert.ok(fs.existsSync(assetFile(shared)));
  assert.equal(current(other.id).scriptId, "other-fixture");
});
