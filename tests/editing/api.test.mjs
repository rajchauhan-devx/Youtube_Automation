import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "../../server/node_modules/express/index.js";
process.env.TUBEFLOW_DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "tubeflow-editing-api-"),
);
process.env.AI_EDITING_ENABLED = "true";
const { fixture } = await import("./fixtures.mjs");
const { editingRouter } = await import("../../server/dist/routes/editing.js");
const { assetFile } = await import(
  "../../server/dist/services/editing/repository.js"
);
const { writeNarrationMetadata } = await import(
  "../../server/dist/services/editing/media.js"
);
const { generatedDir } = await import(
  "../../server/dist/services/workspace.js"
);
const { store } = await import("../../server/dist/services/store.js");
const p = await fixture(),
  dir = path.join(generatedDir(), p.scriptId);
fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(assetFile(p.inputs.audioAssetId), path.join(dir, "voice.wav"));
fs.copyFileSync(
  assetFile(p.inputs.imageAssets[0].assetId),
  path.join(dir, "scene.png"),
);
writeNarrationMetadata(
  path.join(dir, "voice.wav"),
  p.inputs.narrationText,
  "en",
);
const script = {
  id: p.scriptId,
  name: "API fixture",
  narration: p.inputs.narrationText,
  generatedAudio: [
    {
      language: "en",
      filename: "voice.wav",
      url: `/api/generate/file/${p.scriptId}/voice.wav`,
    },
  ],
  generatedImages: [
    {
      index: 0,
      status: "done",
      url: `/api/generate/file/${p.scriptId}/scene.png`,
      prompt: "statue",
    },
  ],
};
store.add("scripts", script);
const app = express();
app.use(express.json());
app.use("/api/editing", editingRouter);
const server = await new Promise((r) => {
  const s = app.listen(0, "127.0.0.1", () => r(s));
});
test.after(() => server.close());
const base = `http://127.0.0.1:${server.address().port}/api/editing`;
const request = (route, body, method = "POST", headers = {}) =>
  fetch(base + route, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const body = {
  scriptId: p.scriptId,
  audioFilename: "voice.wav",
  language: "en",
  imageIndexes: [0],
  aspect: "9:16",
  fps: 24,
  settings: p.settings,
};
test("creation imports immutable media, probes duration, and preserves legacy source files", async () => {
  const response = await request("/projects", body);
  assert.equal(response.status, 201);
  const data = await response.json();
  assert.equal(data.project.inputs.durationFrames, 72);
  assert.equal(data.project.inputs.narrationText, p.inputs.narrationText);
  assert.ok(fs.existsSync(path.join(dir, "voice.wav")));
  assert.equal(
    store.getById("scripts", p.scriptId).editingProjectId,
    data.projectId,
  );
});
test("old audio without identity and wrong selected language fail explicitly", async () => {
  assert.equal(
    (await request("/projects", { ...body, language: "hi" })).status,
    422,
  );
  fs.renameSync(
    path.join(dir, "voice.wav.narration.json"),
    path.join(dir, "backup.json"),
  );
  try {
    const r = await request("/projects", body);
    assert.equal(r.status, 422);
    assert.equal((await r.json()).error.code, "NARRATION_IDENTITY_UNKNOWN");
  } finally {
    fs.renameSync(
      path.join(dir, "backup.json"),
      path.join(dir, "voice.wav.narration.json"),
    );
  }
});
test("mutation uses revision conflict checks and returns a new immutable revision", async () => {
  const updated = await request(
    `/projects/${p.id}/artifacts/explanation`,
    { expectedRevisionId: p.revisionId, enabled: false },
    "PATCH",
  );
  assert.equal(updated.status, 200);
  const data = await updated.json();
  assert.notEqual(data.project.revisionId, p.revisionId);
  assert.equal(
    (
      await request(
        `/projects/${p.id}/artifacts/explanation`,
        { expectedRevisionId: p.revisionId, enabled: true },
        "PATCH",
      )
    ).status,
    409,
  );
  const historical = await (
    await request(
      `/projects/${p.id}/revisions/${p.revisionId}`,
      undefined,
      "GET",
    )
  ).json();
  assert.equal(historical.project.artifacts[0].enabled, true);
});
test("registered asset serving supports range requests; traversal is rejected", async () => {
  const r = await request(
    `/assets/${p.inputs.audioAssetId}`,
    undefined,
    "GET",
    { Range: "bytes=0-31" },
  );
  assert.equal(r.status, 206);
  assert.equal((await r.arrayBuffer()).byteLength, 32);
  assert.equal(
    (await request("/assets/not-a-uuid", undefined, "GET")).status,
    422,
  );
});
test("mixed moving clips cannot be silently omitted from an enhanced project", async () => {
  const original = store.getById("scripts", p.scriptId);
  store.add("scripts", {
    ...original,
    generatedImages: [
      ...original.generatedImages,
      {
        index: 1,
        status: "done",
        url: "/video.mp4",
        mediaType: "video",
        prompt: "moving footage",
      },
    ],
  });
  try {
    const response = await request("/projects", body);
    assert.equal(response.status, 422);
    assert.equal(
      (await response.json()).error.code,
      "MISSING_SCENE",
    );
  } finally {
    store.add("scripts", original);
  }
});
