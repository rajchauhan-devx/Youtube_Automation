import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const { atomic } = await import("../../server/dist/services/editing/repository.js");

test("atomic save survives a brief Windows file lock without losing the prior record", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tubeflow-atomic-"));
  const file = path.join(dir, "briefs.json");
  fs.writeFileSync(file, JSON.stringify({ value: "old" }));
  const rename = fs.renameSync;
  let attempts = 0;
  fs.renameSync = (source, target) => {
    if (target === file && attempts++ < 2) {
      assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { value: "old" });
      throw Object.assign(new Error("locked"), { code: "EPERM" });
    }
    return rename(source, target);
  };
  try {
    atomic(file, { value: "new" });
    assert.equal(attempts, 3);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { value: "new" });
    assert.deepEqual(fs.readdirSync(dir), ["briefs.json"]);
  } finally {
    fs.renameSync = rename;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("persistent lock reports a recoverable error and keeps the old record", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tubeflow-atomic-"));
  const file = path.join(dir, "briefs.json");
  fs.writeFileSync(file, JSON.stringify({ value: "old" }));
  const rename = fs.renameSync;
  fs.renameSync = () => { throw Object.assign(new Error("locked"), { code: "EPERM" }); };
  try {
    assert.throws(() => atomic(file, { value: "new" }), /Pause OneDrive sync/);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { value: "old" });
    assert.deepEqual(fs.readdirSync(dir), ["briefs.json"]);
  } finally {
    fs.renameSync = rename;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
