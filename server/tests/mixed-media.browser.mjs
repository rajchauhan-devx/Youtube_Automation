import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import express from 'express';
import puppeteer from 'puppeteer';

const directory = fs.mkdtempSync(path.resolve('server/data/mixed-browser-'));
process.env.TUBEFLOW_DATA_DIR = directory;
const { workspaceContext, generatedDir } = await import('../dist/services/workspace.js');
const { store } = await import('../dist/services/store.js');
const { assembleNarration } = await import('../dist/services/long-narration.js');
const { spokenText } = await import('../dist/services/scene-plan.js');
const { workspacesRouter } = await import('../dist/routes/workspaces.js');
const { accountsRouter } = await import('../dist/routes/accounts.js');
const app = express(); app.use(express.json());
app.use('/api/accounts/:accountId/profiles/:profile', workspacesRouter);
app.use('/api/accounts', accountsRouter);
app.use(express.static(path.resolve('dist')));
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const url = `http://127.0.0.1:${server.address().port}`;
const plan = { version: 1, title: 'The changing sky', thumbnailPrompt: 'A dramatic sky', scenes: [
  { id: 'scene_001', chapter: 'Opening', role: 'story', mediaType: 'image', narration: 'The sky begins to change.', imagePrompt: 'A quiet mountain landscape under a blue sky, cinematic light, 16:9.' },
  { id: 'scene_002', chapter: 'Movement', role: 'story', mediaType: 'video', duration: 10, narration: 'Clouds move across the horizon.', imagePrompt: 'Ten seconds of clouds drifting across mountain peaks. Slow camera movement, natural lighting, 16:9.' },
] };
const ff = args => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { windowsHide: true, stdio: 'pipe' });
const image = path.join(directory, '001.png'), video = path.join(directory, '002.mp4');
ff(['-f', 'lavfi', '-i', 'color=c=steelblue:s=320x180', '-frames:v', '1', image]);
ff(['-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30', '-t', '10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
await workspaceContext.run({ accountId: 'default', profile: 'mixed' }, async () => {
  let count = 0;
  const audio = await assembleNarration(plan, { scriptId: 'browser', language: 'en', voice: 'fixture' }, new AbortController().signal, () => {}, async opts => {
    const filename = `voice-${++count}.wav`;
    ff(['-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '2', path.join(generatedDir(), opts.scriptId, filename)]);
    return { filename };
  });
  store.add('scripts', { id: 'browser', name: 'Mixed media browser check', section: 'mixed', accountId: 'default', duration: 300, status: 'active', prompts: [],
    scenePlan: plan, narration: spokenText(plan), imagePrompts: plan.scenes.map(scene => scene.imagePrompt), generatedAudio: [audio], generatedImages: [] });
});
let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 1050 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    if (!localStorage.getItem('tubeflow:v1')) localStorage.setItem('tubeflow:v1', JSON.stringify({ channelId: 'default', section: 'mixed', tab: 'generation', selectedScriptId: 'browser' }));
  });
  await page.goto(url, { waitUntil: 'networkidle0' });
  console.log('Loaded generation page');
  await page.waitForSelector('article');
  assert.equal(await page.$$eval('article', els => els.length), 2);
  assert.ok(await page.evaluate(() => document.body.innerText.includes('Video · 10 sec')));
  const click = text => page.evaluate(text => { const button = [...document.querySelectorAll('button')].find(el => el.textContent.trim() === text || el.title === text); if (!button) throw new Error(`Missing ${text}`); button.click(); }, text);
  await page.click('[aria-label="Add or replace image for scene 1"]');
  await (await page.$('input[type=file]')).uploadFile(image);
  await page.waitForSelector('article img');
  console.log('Image imported');
  await click('Bulk import');
  await (await page.$('input[type=file]')).uploadFile(video);
  await page.waitForSelector('article video');
  console.log('Video imported');
  await page.waitForFunction(() => document.querySelector('article video')?.readyState >= 1);
  assert.equal(await page.$eval('article video', el => el.duration), 10);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('article video');
  assert.equal(await page.$$eval('article img', els => els.length), 1);
  fs.mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/mixed-media-generation.png', fullPage: true });
  await click('Timeline & Render');
  await page.waitForSelector('button:has(video)');
  await page.$eval('button:has(video)', el => el.click());
  await page.waitForSelector('[aria-label="Scene duration"]');
  assert.equal(await page.$eval('[aria-label="Scene duration"]', el => Number(el.value)), 10);
  assert.equal(await page.$eval('[aria-label="Scene duration"]', el => el.matches(':disabled')), true);
  await page.$eval('[aria-label="Narration playhead"]', el => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(el, '4'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForFunction(() => document.querySelector('video[preload=auto]')?.currentTime > 1.5);
  await click('Play Timeline (Space)');
  await page.waitForFunction(() => { const video = document.querySelector('video[preload=auto]'); return video && !video.paused && video.currentTime > 2.2; });
  await click('Pause (Space)');
  await page.screenshot({ path: 'artifacts/mixed-media-timeline.png', fullPage: true });
  await page.click('[aria-label="Apply Cinematic Story"]');
  await page.waitForFunction(() => document.querySelector('[aria-label="Enable automatic editing"]')?.checked);
  await click('Customize editing & scene plan');
  await page.select('[aria-label="Automatic transitions"]', 'dissolve');
  await page.select('[aria-label="Automatic caption style"]', 'boxed');
  await page.$eval('details summary', element => element.click());
  await page.select('[aria-label="Motion for scene_001"]', 'pull-out');
  await page.waitForFunction(async () => {
    const script = await (await fetch('/api/accounts/default/profiles/mixed/scripts/browser')).json();
    return script.editing?.overrides?.scene_001?.motion === 'pull-out' && script.editing?.captionStyle === 'boxed';
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[aria-label="Enable automatic editing"]');
  assert.equal(await page.$eval('[aria-label="Enable automatic editing"]', el => el.checked), true);
  await click('Customize editing & scene plan');
  assert.equal(await page.$eval('[aria-label="Automatic transitions"]', el => el.value), 'dissolve');
  assert.equal(await page.$eval('[aria-label="Automatic caption style"]', el => el.value), 'boxed');
  assert.equal(await page.$eval('[aria-label="Camera zoom"]', el => el.disabled), true);
  await page.screenshot({ path: 'artifacts/automatic-editing-studio.png', fullPage: true });
  await click('Hide editing controls');
  await click('Start Video Generation');
  await page.waitForFunction(() => document.body.innerText.includes('Video generated successfully') || document.body.innerText.includes('Render failed'), { timeout: 180000 });
  assert.ok(await page.evaluate(() => document.body.innerText.includes('Video generated successfully')));
  assert.deepEqual(errors, []);
  console.log('PASS: imports, fixed timing, video preview, automatic presets, per-scene overrides, saved settings after reload, and full 1080p polished render.');
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  assert.ok(directory.startsWith(path.resolve('server/data') + path.sep));
  fs.rmSync(directory, { recursive: true, force: true });
}
