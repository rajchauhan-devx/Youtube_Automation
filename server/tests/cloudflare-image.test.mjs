import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import express from "express";

const directory = fs.mkdtempSync(path.resolve("server/data/cf-image-test-"));
process.env.TUBEFLOW_DATA_DIR = directory;

const { workspaceContext } = await import("../dist/services/workspace.js");
const { store } = await import("../dist/services/store.js");
const { workspacesRouter } = await import("../dist/routes/workspaces.js");
const { accountsRouter } = await import("../dist/routes/accounts.js");

const scope = { accountId: "default", profile: "mixed" };
const prefix = "/api/accounts/default/profiles/mixed";

const scenes = [
  {
    id: "scene_0",
    chapter: "Opening",
    role: "hook",
    mediaType: "image",
    duration: 8,
    narration: "Narration 1",
    imagePrompt: "A dramatic golden temple at sunrise",
  },
];
const plan = { version: 1, title: "Cloudflare image test", thumbnailPrompt: "Thumb", scenes };

const samplePng = await sharp({
  create: { width: 512, height: 512, channels: 3, background: { r: 30, g: 90, b: 180 } },
})
  .png()
  .toBuffer();

const originalFetch = globalThis.fetch;
const cfRequests = [];
let responseFormat = "flux-json";

globalThis.fetch = async (url, options = {}) => {
  const urlStr = String(url);
  if (
    urlStr.startsWith("https://free-image-api.example.workers.dev") ||
    urlStr.startsWith("https://api.cloudflare.com/client/v4/accounts/")
  ) {
    cfRequests.push({
      url: urlStr,
      headers: options.headers,
      body: options.body ? JSON.parse(options.body) : null,
    });
    if (responseFormat === "flux-json") {
      return new Response(
        JSON.stringify({ result: { image: samplePng.toString("base64") } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(samplePng, {
      status: 200,
      headers: { "Content-Type": "image/png" },
    });
  }
  return originalFetch(url, options);
};

workspaceContext.run(scope, () =>
  store.add("scripts", {
    id: "cf-script",
    name: "Cloudflare Test Script",
    accountId: "default",
    section: "mixed",
    status: "active",
    duration: 8,
    prompts: [],
    scenePlan: plan,
    imagePrompts: scenes.map((s) => s.imagePrompt),
    narration: "Narration 1",
    generatedImages: [],
    generatedAudio: [],
  })
);

const app = express();
app.use(express.json());
app.use("/api/accounts/:accountId/profiles/:profile", workspacesRouter);
app.use("/api/accounts", accountsRouter);

const server = await new Promise((resolve) => {
  const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
});
const base = `http://127.0.0.1:${server.address().port}`;

test("Cloudflare Workers AI config, SSRF guard, secret masking, and FLUX.1 Schnell generation", async () => {
  try {
    // 1. Default config uses FLUX.1 Schnell
    const initialRes = await originalFetch(`${base}${prefix}/generate/cloudflare/config`);
    assert.equal(initialRes.status, 200);
    const initialCfg = await initialRes.json();
    assert.equal(initialCfg.model, "@cf/black-forest-labs/flux-1-schnell");
    assert.equal(initialCfg.configured, false);

    // 2. SSRF protection blocks HTTP and localhost worker URLs
    const ssrfRes = await originalFetch(`${base}${prefix}/generate/cloudflare/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "cloudflare",
        mode: "worker",
        workerUrl: "https://127.0.0.1:8080/worker",
        workerApiKey: "secret-key-1234",
      }),
    });
    assert.equal(ssrfRes.status, 400);

    // 3. Valid HTTPS worker configuration saves and masks API key
    const saveRes = await originalFetch(`${base}${prefix}/generate/cloudflare/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "cloudflare",
        mode: "worker",
        workerUrl: "https://free-image-api.example.workers.dev",
        workerApiKey: "super-secret-5678",
        model: "@cf/black-forest-labs/flux-1-schnell",
        injectStyleDna: true,
      }),
    });
    assert.equal(saveRes.status, 200);
    const saved = (await saveRes.json()).config;
    assert.equal(saved.configured, true);
    assert.equal(saved.hasWorkerApiKey, true);
    assert.equal(saved.workerApiKeyMasked, "••••••••5678");
    assert.equal("workerApiKey" in saved, false);

    // 4. Status endpoint reflects Cloudflare readiness
    const statusRes = await originalFetch(`${base}${prefix}/generate/status`);
    const statusData = await statusRes.json();
    assert.equal(statusData.online, true);
    assert.equal(statusData.provider, "cloudflare");

    // 5. Generate image via Worker mode (base64 FLUX JSON response)
    responseFormat = "flux-json";
    const genRes = await originalFetch(`${base}${prefix}/generate/image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scriptId: "cf-script",
        index: 0,
        prompt: scenes[0].imagePrompt,
        preset: "high",
        provider: "cloudflare",
      }),
    });
    assert.equal(genRes.status, 200);
    const genData = await genRes.json();
    assert.equal(genData.ok, true);
    assert.equal(cfRequests.length, 1);
    assert.equal(cfRequests[0].body.model, "@cf/black-forest-labs/flux-1-schnell");
    assert.ok(cfRequests[0].body.prompt.includes(scenes[0].imagePrompt));
    assert.ok(cfRequests[0].body.prompt.includes("Visual Style:"));
    // Saved asset preserves original scene prompt for scene matching
    assert.equal(genData.generatedImages[0].prompt, scenes[0].imagePrompt);

    // Verify normalized PNG dimensions (1344x768 for landscape mixed profile)
    const fileRes = await originalFetch(`${base}${genData.url}`);
    assert.equal(fileRes.status, 200);
    const outBuf = Buffer.from(await fileRes.arrayBuffer());
    const outMeta = await sharp(outBuf).metadata();
    assert.equal(outMeta.format, "png");
    assert.equal(outMeta.width, 1344);
    assert.equal(outMeta.height, 768);

    // 6. Generate image via Direct Cloudflare REST API mode (binary response)
    responseFormat = "binary";
    await originalFetch(`${base}${prefix}/generate/cloudflare/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "cloudflare",
        mode: "direct",
        accountId: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
        apiToken: "cf-direct-token-9999",
      }),
    });
    const directGenRes = await originalFetch(`${base}${prefix}/generate/image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scriptId: "cf-script",
        index: 0,
        prompt: scenes[0].imagePrompt,
        preset: "standard",
        provider: "cloudflare",
      }),
    });
    assert.equal(directGenRes.status, 200);
    assert.ok(
      cfRequests.at(-1).url.includes(
        "https://api.cloudflare.com/client/v4/accounts/1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d/ai/run/@cf/black-forest-labs/flux-1-schnell"
      )
    );
  } finally {
    globalThis.fetch = originalFetch;
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
