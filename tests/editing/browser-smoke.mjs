import fs from "node:fs";
import path from "node:path";
import express from "../../server/node_modules/express/index.js";
import puppeteer from "puppeteer";
import assert from "node:assert/strict";
process.env.TUBEFLOW_DATA_DIR = path.resolve("artifacts/editing-browser-data");
process.env.AI_EDITING_ENABLED = "true";
const { fixture } = await import("./motion-fixtures.mjs");
const { store } = await import("../../server/dist/services/store.js");
const { workspacesRouter } = await import(
  "../../server/dist/routes/workspaces.js"
);
const { accountsRouter } = await import("../../server/dist/routes/accounts.js");
let p = await fixture("science", true);
const customMode = process.env.EDITING_CUSTOM_SMOKE === 'true';
if (customMode) {
  const { compileGraphic } = await import('../../server/dist/services/editing/motionPackArtifacts.js');
  const { nextRevision, publish } = await import('../../server/dist/services/editing/repository.js');
  const previous = p;
  p = nextRevision(p);
  p.artifacts = [compileGraphic(p, { sceneId: p.scenes[0].id, kind: 'custom', title: 'Water diagram', detail: '', target: '', quote: 'पानी गर्म होता है।', position: 'center' }, undefined, 'explanation', {
    version: 1, name: 'Water explanation', elements: [{ id: 'label', kind: 'text', bounds: { x: 0.1, y: 0.1, width: 0.8, height: 0.5 }, text: 'पानी', evidence: 'पानी गर्म होता है।', color: '#ffffff', fill: '#172033', fontSize: 0.07, align: 'center', strokeWidth: 0, points: [], tracks: [] }],
  })];
  publish(p, previous.revisionId);
}
store.add("scripts", {
  id: p.scriptId,
  name: "Visual editing browser fixture",
  accountId: "default",
  section: "shorts",
  status: "active",
  locked: false,
  prompts: [],
  pipeline: [],
  howItWorks: "",
  duration: 3,
  lastUsed: new Date().toISOString(),
  editingProjectId: p.id,
  generatedAudio: [],
  generatedImages: [],
});
const app = express();
app.use(express.json());
app.use("/api/accounts/:accountId/profiles/:profile", workspacesRouter);
app.use("/api/accounts", accountsRouter);
app.use(express.static(path.resolve("dist")));
const server = await new Promise((resolve) => {
  const s = app.listen(0, "127.0.0.1", () => resolve(s));
});
const browser = await puppeteer.launch({
  executablePath:
    process.env.EDITING_BROWSER_EXECUTABLE ||
    await puppeteer.executablePath(),
  headless: true,
});
try {
  const page = await browser.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1100 });
  await page.evaluateOnNewDocument(
    (id) =>
      localStorage.setItem(
        "tubeflow:v1",
        JSON.stringify({
          channelId: "default",
          section: "shorts",
          tab: "artifacts",
          selectedScriptId: id,
        }),
      ),
    p.scriptId,
  );
  await page.goto(`http://127.0.0.1:${server.address().port}`, {
    waitUntil: "networkidle0",
  });
  await page.waitForSelector('[aria-label="Timeline playhead"]');
  assert.match(await page.$eval('body', el => el.textContent), /Clear graphics/);
  const modelChoices = await page.$$eval('[aria-label="Visual editing AI model"] option', options => options.map(option => option.value));
  assert.ok(modelChoices.some(model => model.startsWith('gemini-')), 'Missing Gemini vision model choice');
  await page.waitForSelector("[data-editing-text]");
  assert.equal(await page.$eval("[data-editing-text]", (el) => el.textContent), customMode ? p.artifacts[0].graphic.design.elements[0].text : p.artifacts[0].graphic.title);
  assert.equal(await page.$eval('[aria-label="Graphic position"]', el => el.value), 'center');
  await page.click('[aria-label="Play video"]');
  const playback = await page.evaluate(async () => {
    const frames = [];
    const playhead = document.querySelector('[aria-label="Timeline playhead"]');
    for (let i = 0; i < 85; i++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      frames.push(Number(playhead.value));
    }
    return { frames, end: Number(playhead.max) };
  });
  assert.ok(playback.frames.every((value, index) => !index || value >= playback.frames[index - 1]), 'The preview moved backward while playing');
  assert.ok(playback.frames.at(-1) >= playback.end - 1, 'The preview reset after reaching the end');
  await page.$eval('[aria-label="Timeline playhead"]', (el) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(el, "36");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.screenshot({
    path: "artifacts/editing-smoke/browser-artifacts.png",
    fullPage: true,
  });
  const clickText = async (text) => {
    const handles = await page.$$("button");
    for (const button of handles)
      if ((await button.evaluate((el) => el.textContent)).trim().endsWith(text) && await button.boundingBox()) {
        await button.click();
        return;
      }
    throw new Error("Missing button " + text);
  };
  if (customMode) {
    await page.waitForSelector('[aria-label="Graphic text label"]');
    await page.$eval('[aria-label="Graphic text label"]', el => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, 'गर्म पानी');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await clickText('Save changes');
    await page.waitForFunction(() => document.querySelector('[data-editing-text="custom"]')?.textContent === 'गर्म पानी');
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('[aria-label="Graphic text label"]');
    assert.equal(await page.$eval('[aria-label="Graphic text label"]', el => el.value), 'गर्म पानी');
    await page.waitForSelector('[aria-label="Graphic revision instructions"]');
  }
  await clickText("Hide");
  await page.waitForFunction(() =>
    document.body.textContent.includes("Hidden"),
  );
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() =>
    document.body.textContent.includes("Hidden"),
  );
  await clickText("Show");
  await page.waitForFunction(
    () =>
      document.body.textContent.includes("Hide") &&
      document.body.textContent.includes("Visible"),
  );
  await clickText("Timeline & Render");
  await page.waitForSelector('[aria-label="Timeline playhead"]');
  assert.match(
    await page.$eval("body", (el) => el.textContent),
    /Preview & export/,
  );
  assert.deepEqual(errors, []);
  console.log(
    "BROWSER_SMOKE_PASSED: graphic player, position, scrubbing, hide/show, refresh persistence, enhanced editor",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
