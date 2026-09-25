import fs from "node:fs";
import path from "node:path";
import express from "../../server/node_modules/express/index.js";
import puppeteer from "puppeteer";
import assert from "node:assert/strict";
process.env.TUBEFLOW_DATA_DIR = path.resolve("artifacts/editing-browser-data");
process.env.AI_EDITING_ENABLED = "true";
const { fixture } = await import("./fixtures.mjs");
const { store } = await import("../../server/dist/services/store.js");
const { workspacesRouter } = await import(
  "../../server/dist/routes/workspaces.js"
);
const { accountsRouter } = await import("../../server/dist/routes/accounts.js");
const p = await fixture("science", true);
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
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
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
  await page.waitForSelector("[data-editing-text]");
  assert.match(
    await page.$eval("[data-editing-text]", (el) => el.textContent),
    /पानी/,
  );
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
      if ((await button.evaluate((el) => el.textContent)).trim() === text) {
        await button.click();
        return;
      }
    throw new Error("Missing button " + text);
  };
  await clickText("Disable");
  await page.waitForFunction(() =>
    document.body.textContent.includes("Disabled"),
  );
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() =>
    document.body.textContent.includes("Disabled"),
  );
  await clickText("Enable");
  await page.waitForFunction(
    () =>
      document.body.textContent.includes("Disable") &&
      !document.body.textContent.includes("Disabled"),
  );
  await clickText("Timeline & Render");
  await page.waitForSelector('[aria-label="Timeline playhead"]');
  assert.match(
    await page.$eval("body", (el) => el.textContent),
    /Enhanced timeline & export/,
  );
  assert.deepEqual(errors, []);
  console.log(
    "BROWSER_SMOKE_PASSED: Hindi player, scrubbing, disable/enable, refresh persistence, enhanced editor",
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
