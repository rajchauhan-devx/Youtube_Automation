import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import puppeteer from 'puppeteer';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tubeflow-script-generation-'));
process.env.TUBEFLOW_DATA_DIR = directory;
const previousKey = process.env.GEMINI_API_KEY;
process.env.GEMINI_API_KEY = 'fixture';
const { store } = await import('../dist/services/store.js');
const { createAccount } = await import('../dist/services/accounts.js');
const { workspaceContext, currentWorkspace } = await import('../dist/services/workspace.js');
const { accountsRouter } = await import('../dist/routes/accounts.js');
const { workspacesRouter } = await import('../dist/routes/workspaces.js');
const accounts = [createAccount('Against the Odds test'), createAccount('Other channel test')];
const { parseScenePlan } = await import('../dist/services/scene-plan.js');
const { serializeScenePlan } = await import('../dist/services/scene-plan-format.js');
function timedResponse(plan) {
  const each = Math.floor(210 / plan.scenes.length);
  plan.scenes.forEach((scene, index) => {
    const words = index === plan.scenes.length - 1 ? 210 - each * index : each;
    scene.narration = Array.from({length: words}, (_, i) => ['The', 'crew', 'had', 'a', 'plan', 'and', 'it', 'kept', 'them'][i % 9]).join(' ');
    scene.duration = 60 / plan.scenes.length;
    if (scene.mediaType === 'video') scene.videoPrompt += ' ' + Array.from({length: 85}, (_, i) => ['steady', 'camera', 'natural', 'light', 'continuous', 'movement', 'clear', 'character', 'identity'][i % 9]).join(' ');
  });
  return JSON.stringify({...plan,supportingNotes:'Research and publishing notes remain with the preview.'});
}
const legacyResponse = timedResponse(parseScenePlan(fs.readFileSync(new URL('./fixtures/against-the-odds.txt', import.meta.url), 'utf8')));
const splitManifestResponse = timedResponse(parseScenePlan(fs.readFileSync(new URL('./fixtures/against-the-odds-split-manifest.txt', import.meta.url), 'utf8')));
const responseFor = scope => timedResponse({version:1,title:`Completed response for ${scope.accountId}:${scope.profile}`,thumbnailPrompt:'An ocean horizon',scenes:[{id:'scene_001',chapter:'Opening',role:'story',mediaType:'image',narration:'',imagePrompt:'An ocean horizon in natural light'},{id:'scene_002',chapter:'Ending',role:'story',mediaType:'image',narration:'',imagePrompt:'A sailing ship under clear skies'}]});
const records = [];
let repairRequests = 0;
const scopes = accounts.flatMap(account => ['shorts', 'long', 'mixed'].map(profile => ({ accountId: account.id, profile })));
for (const scope of scopes) {
  const marker = `${scope.accountId}:${scope.profile}`;
  workspaceContext.run(scope, () => store.add('scripts', {
    id: 'same-id', accountId: scope.accountId, section: scope.profile,
    name: `${scope.profile} saved template`, status: 'draft', lastUsed: 'Never',
    duration: 60, model: 'gemini-3.5-flash', howItWorks: 'Do not use workflow fallback.',
    prompts: [{ id: 'custom', name: 'Custom', content: `PRIVATE TEMPLATE ${marker}\nKeep my production format with <script>, <image_prompt>, and <video_prompt> blocks.` }],
    aiResponse: `PRIVATE SAVED RESPONSE ${marker}`,
  }));
}
const read = scope => workspaceContext.run(scope, () => store.getById('scripts', 'same-id'));
const originalFetch = globalThis.fetch;
let releaseLateResponse;
let lateResponseFinished;
const lateResponseDone = new Promise(resolve => { lateResponseFinished = resolve; });
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) return originalFetch(url, options);
  const payload = JSON.parse(options.body);
  records.push({ scope: { ...currentWorkspace() }, payload });
  const text = payload.contents.map(content => content.parts.map(part => part.text).join('')).join('\n');
  let response = text.includes('Topic: Legacy extraction') ? legacyResponse : text.includes('Topic: Split manifest extraction') ? splitManifestResponse : responseFor(currentWorkspace());
  if (text.includes('Topic: Repair short plan')) {
    response = repairRequests++ === 0 ? serializeScenePlan({...parseScenePlan(legacyResponse),scenes:parseScenePlan(legacyResponse).scenes.map(scene=>({...scene,narration:'Short speech.'}))}) : legacyResponse;
  }
  if (text.includes('Topic: Delayed old run')) {
    await new Promise(resolve => { releaseLateResponse = resolve; });
    response = 'LATE RESPONSE FROM THE PREVIOUS ACCOUNT';
    lateResponseFinished();
  }
  return new Response(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: response }] }, finishReason: 'STOP' }] })}\n\n`, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
};
const app = express(); app.use(express.json());
app.use('/api/accounts', accountsRouter);
app.use('/api/accounts/:accountId/profiles/:profile', workspacesRouter);
app.use(express.static(path.resolve('dist')));
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
let browser;
try {
  browser = await puppeteer.launch({ executablePath: process.env.EDITING_BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(accountId => localStorage.setItem('tubeflow:v1', JSON.stringify({
    channelId: accountId, section: 'shorts', tab: 'scripts', selectedScriptId: 'same-id',
  })), accounts[0].id);
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle0' });
  const click = text => page.evaluate(text => {
    const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text);
    if (!button) throw new Error(`Missing button: ${text}`);
    button.click();
  }, text);
  async function scriptsTab() {
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => /Step 01\s*Scripts/.test(button.textContent))?.click());
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Run Script'));
  }
  async function switchAccount(account) {
    await page.click('[aria-label="Switch YouTube account"]');
    await page.evaluate(name => [...document.querySelectorAll('button')].find(button => button.textContent.includes(name) && !button.hasAttribute('aria-label'))?.click(), account.name);
    await page.waitForFunction(name => document.querySelector('[aria-label="Switch YouTube account"]')?.textContent.includes(name), {}, account.name);
    await scriptsTab();
  }
  async function run(topic) {
    await scriptsTab();
    await click('Run Script');
    await page.waitForSelector('#run-topic');
    await page.click('#run-topic');
    await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control');
    await page.keyboard.type(topic);
    await page.click('form button[type="submit"]');
  }

  // Reproduce the reported custom Shorts run, then extract without rewriting Preview.
  const first = scopes[0];
  const completedSave = page.waitForResponse(res => res.url().endsWith('/scripts/same-id') && res.request().method() === 'PUT' && JSON.parse(res.request().postData()).aiResponse === legacyResponse);
  await run('Legacy extraction');
  await completedSave;
  assert.equal(read(first).aiResponse, legacyResponse);
  const extractSave = page.waitForResponse(res => res.url().endsWith('/scripts/same-id') && res.request().method() === 'PUT' && Boolean(JSON.parse(res.request().postData()).scenePlan));
  await click('Extract Assets');
  await extractSave;
  assert.equal(read(first).scenePlan.scenes.length, 5);
  assert.equal(read(first).aiResponse, legacyResponse, 'extraction keeps the original preview response');
  assert.deepEqual(read(first).prompts[0].content, `PRIVATE TEMPLATE ${first.accountId}:shorts\nKeep my production format with <script>, <image_prompt>, and <video_prompt> blocks.`);
  for (const scope of scopes.slice(1)) assert.equal(read(scope).aiResponse, `PRIVATE SAVED RESPONSE ${scope.accountId}:${scope.profile}`, 'identical script IDs in other workspaces are untouched');

  const splitSave = page.waitForResponse(res => res.url().endsWith('/scripts/same-id') && res.request().method() === 'PUT' && JSON.parse(res.request().postData()).aiResponse === splitManifestResponse);
  await run('Split manifest extraction');
  await splitSave;
  const splitExtractSave = page.waitForResponse(res => res.url().endsWith('/scripts/same-id') && res.request().method() === 'PUT' && JSON.parse(res.request().postData()).scenePlan?.scenes.length === 12);
  await click('Extract Assets');
  await splitExtractSave;
  assert.equal(read(first).aiResponse, splitManifestResponse);
  assert.equal(read(first).scenePlan.scenes.at(-1).role, 'cta');
  assert.equal(read(first).imagePrompts.length, 12);

  const repairedSave = page.waitForResponse(res => res.url().endsWith('/scripts/same-id') && res.request().method() === 'PUT' && JSON.parse(res.request().postData()).aiResponse === legacyResponse && JSON.parse(res.request().postData()).pipeline?.[0]?.status === 'done');
  await run('Repair short plan');
  await repairedSave;
  assert.equal(repairRequests,2);
  assert.equal(read(first).aiResponse,legacyResponse,'a complete repair replaces the invalid plan without accumulating JSON blocks');

  // Every profile uses only its own saved template, including an explicit schema when authored.
  for (const profile of ['long', 'mixed']) {
    await page.click(`[aria-label="${profile === 'long' ? 'Long Video' : 'Mixed Media'}"]`);
    await scriptsTab();
    const scope = scopes.find(scope => scope.accountId === first.accountId && scope.profile === profile);
    const response = responseFor(scope);
    const save = page.waitForResponse(res => res.url().endsWith(`/profiles/${profile}/scripts/same-id`) && res.request().method() === 'PUT' && JSON.parse(res.request().postData()).aiResponse === response);
    await run(`Profile ${profile}`);
    await save;
    assert.equal(read(scope).aiResponse, response);
  }

  // A late response from an old account must never replace the new account's run.
  await page.click('[aria-label="Shorts"]');
  await run('Delayed old run');
  await page.waitForFunction(() => document.body.textContent.includes('Generating a live response'));
  for (let attempt = 0; !releaseLateResponse && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(releaseLateResponse);
  await switchAccount(accounts[1]);
  const other = scopes.find(scope => scope.accountId === accounts[1].id && scope.profile === 'shorts');
  const response = responseFor(other);
  const save = page.waitForResponse(res => res.url().endsWith(`/accounts/${other.accountId}/profiles/shorts/scripts/same-id`) && res.request().method() === 'PUT' && JSON.parse(res.request().postData()).aiResponse === response);
  await run('New account run');
  await save;
  releaseLateResponse();
  await lateResponseDone;
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(read(other).aiResponse, response);
  assert.ok(!await page.$eval('body', body => body.textContent.includes('LATE RESPONSE FROM THE PREVIOUS ACCOUNT')));
  assert.equal(read(first).aiResponse.includes(response), false);

  assert.equal(records.length, 8, 'only the deliberately short plan needs one replacement');
  for (const { scope, payload } of records) {
    assert.equal(payload.generationConfig.responseMimeType,'application/json');
    assert.ok(payload.generationConfig.responseJsonSchema.properties.scenes);
    const texts = payload.contents.flatMap(content => content.parts.map(part => part.text));
    assert.ok(texts.length === 1 || (texts.length === 3 && texts[0].includes('Topic: Repair short plan')), 'only a repair includes its own previous response');
    assert.ok(texts[0].startsWith(read(scope).prompts[0].content), 'the exact selected template starts the request');
    assert.equal((texts[0].match(/Shared extraction format V1/g) || []).length, 1);
    assert.ok(texts[0].includes('Target Duration: ~60 seconds'));
    assert.ok(texts[0].includes('<long_video>'));
    for (const otherScope of scopes.filter(other => other.accountId !== scope.accountId || other.profile !== scope.profile)) {
      assert.ok(!texts[0].includes(`PRIVATE TEMPLATE ${otherScope.accountId}:${otherScope.profile}`));
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS: custom prompt and preview fidelity; shared plans from legacy and split manifests; duration repair; all profiles; identical script IDs; account switch during streaming; no cross-workspace prompt history');
} finally {
  releaseLateResponse?.();
  globalThis.fetch = originalFetch;
  if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey;
  await browser?.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  assert.ok(directory.startsWith(path.join(os.tmpdir(), 'tubeflow-script-generation-')));
  fs.rmSync(directory, { recursive: true, force: true });
}
