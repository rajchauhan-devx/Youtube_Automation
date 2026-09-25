import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
process.env.TUBEFLOW_DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "tubeflow-editing-jobs-"),
);
process.env.EDITING_PLANNER_MODEL = "";
process.env.AI_EDITING_ENABLED = "true";
const { fixture } = await import("./fixtures.mjs");
const repo = await import("../../server/dist/services/editing/repository.js");
const scheduler = await import(
  "../../server/dist/services/editing/scheduler.js"
);
const { workspaceContext } = await import(
  "../../server/dist/services/workspace.js"
);
const { store } = await import("../../server/dist/services/store.js");
const p = await fixture();
async function waitJob(id) {
  for (let i = 0; i < 100; i++) {
    const j = repo.getJob(id);
    if (!["queued", "running", "cancel_requested"].includes(j.state)) return j;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("Job did not settle");
}
test("duplicate enqueue never repeats provider work and conflicts on key reuse", async () => {
  const key = randomUUID(),
    a = scheduler.enqueue(p, "generate", key, "ephemeral-test-key"),
    b = scheduler.enqueue(p, "generate", key);
  assert.equal(a.id, b.id);
  const completed = await waitJob(a.id);
  assert.equal(completed.state, "needs_configuration");
  assert.equal(completed.attempts, 1);
  assert.equal(completed.usage.length, 0);
  assert.throws(
    () => scheduler.enqueue(p, "render", key),
    /different operation/,
  );
  const file = path.join(repo.editingRoot(), "jobs", `${a.id}.json`);
  assert.ok(!fs.readFileSync(file, "utf8").includes("ephemeral-test-key"));
});
test("resume retains checkpoints and missing credentials remains recoverable", async () => {
  const j = repo.jobs(p.id)[0];
  j.stages["inspecting media"] = { durationMs: 123 };
  repo.saveJob(j);
  scheduler.resume(j.id);
  const next = await waitJob(j.id);
  assert.equal(next.state, "needs_configuration");
  assert.equal(next.stages["inspecting media"].durationMs, 123);
  assert.equal(next.attempts, 2);
});
test("cancellation is idempotent and preserves current revision", async () => {
  const j = scheduler.enqueue(p, "generate", randomUUID());
  scheduler.cancel(j.id);
  const result = await waitJob(j.id);
  assert.equal(result.state, "cancelled");
  assert.equal(scheduler.cancel(j.id).state, "cancelled");
  assert.equal(repo.current(p.id).revisionId, p.revisionId);
});
test("cold process reconciles orphaned jobs without silently starting providers", () => {
  const previous = repo.jobs(p.id)[0],
    id = randomUUID();
  repo.saveJob({ ...previous, id, idempotencyKey: id, state: "running" });
  const text = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `const s=await import('./server/dist/services/editing/scheduler.js');const r=await import('./server/dist/services/editing/repository.js');s.reconcile();console.log(r.getJob('${id}').state);`,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  assert.match(text, /interrupted/);
  assert.equal(repo.getJob(id).stages["inspecting media"].durationMs, 123);
});
test("stale revisions cannot resume and workspace IDs cannot escape isolation", () => {
  const job = repo.jobs(p.id).find((j) => j.state === "interrupted"),
    next = repo.nextRevision(p);
  repo.publish(next, p.revisionId);
  assert.throws(() => scheduler.resume(job.id), /Project changed/);
  workspaceContext.run(
    { accountId: "another-account", profile: "long" },
    () => {
      assert.throws(() => repo.current(p.id), /not found/);
      assert.throws(() => repo.getJob(job.id), /not found/);
    },
  );
  assert.throws(() => repo.current("../escape"));
});
test("corrupt stored JSON fails explicitly instead of silently replacing data", () => {
  const file = path.join(repo.projectDir(p.id), "manifest.json"),
    original = fs.readFileSync(file);
  fs.writeFileSync(file, "{broken");
  assert.throws(() => repo.current(p.id), /damaged/);
  assert.equal(fs.readFileSync(file, "utf8"), "{broken");
  fs.writeFileSync(file, original);
});
test("script deletion cancels recoverable associated jobs", () => {
  store.remove("scripts", p.scriptId);
  scheduler.cancelScriptJobs(p.scriptId);
  assert.ok(
    repo
      .jobs(p.id)
      .every(
        (j) =>
          !["queued", "running", "needs_configuration", "interrupted"].includes(
            j.state,
          ),
      ),
  );
});
