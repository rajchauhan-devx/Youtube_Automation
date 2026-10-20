import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import express from '../../server/node_modules/express/index.js';
import puppeteer from 'puppeteer';
process.env.TUBEFLOW_DATA_DIR = path.resolve('artifacts/motion-studio-browser-data');
process.env.AI_EDITING_ENABLED = 'true';
const { fixture } = await import('./motion-fixtures.mjs');
const { compileGraphic } = await import('../../server/dist/services/editing/motionPackArtifacts.js');
const { nextRevision, publish } = await import('../../server/dist/services/editing/repository.js');
const { store } = await import('../../server/dist/services/store.js');
const { workspacesRouter } = await import('../../server/dist/routes/workspaces.js');
const { accountsRouter } = await import('../../server/dist/routes/accounts.js');
const original = await fixture('museum', true, true), p = nextRevision(original);
p.scenes[0].endFrame = 36; p.scenes[0].camera = [{ frame: 0, x: 0, y: 0, scale: 1 }];
p.scenes.push({ ...structuredClone(p.scenes[0]), id: 'scene-1', startFrame: 36, endFrame: 72 });
p.artifacts = [compileGraphic(p, { sceneId: 'scene-1', kind: 'composition', title: 'Statue detail', detail: '', target: '', quote: 'a bronze statue and its hand',
  position: 'top', composition: { treatment: 'cinematic', emphasis: 'none', layers: [{ sourceSceneId: 'scene-1', bounds: { x: 0, y: 0, width: 1, height: 1 },
    crop: { x: 0.4, y: 0.25, width: 0.35, height: 0.35 }, useTargetCrop: false, fit: 'cover', motion: 'push-in', delay: 0, rotation: 0 }] } })];
p.artifacts[0].graphic.composition.layers.push({ ...structuredClone(p.artifacts[0].graphic.composition.layers[0]), id: 'image-1', crop: { x: 0.55, y: 0.4, width: 0.3, height: 0.3 } });
publish(p, original.revisionId);
store.add('scripts', { id: p.scriptId, name: 'Motion Studio interaction fixture', accountId: 'default', section: 'shorts', status: 'active', locked: false,
  prompts: [], pipeline: [], howItWorks: '', duration: 3, lastUsed: new Date().toISOString(), editingProjectId: p.id, generatedAudio: [], generatedImages: [] });
const app = express(); app.use(express.json());
app.use('/api/accounts/:accountId/profiles/:profile', workspacesRouter); app.use('/api/accounts', accountsRouter);
app.use(express.static(path.resolve('dist')));
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const executablePath = [process.env.EDITING_BROWSER_EXECUTABLE, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(file => file && fs.existsSync(file));
const browser = await puppeteer.launch({ ...(executablePath ? { executablePath } : {}), headless: true });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1100 });
  await page.evaluateOnNewDocument(id => localStorage.setItem('tubeflow:v1', JSON.stringify({ channelId: 'default', section: 'shorts', tab: 'artifacts', selectedScriptId: id })), p.scriptId);
  const base = `http://127.0.0.1:${server.address().port}`;
  const projectUrl = `${base}/api/accounts/default/profiles/shorts/editing/projects/${p.id}`;
  const savedArtifact = async () => (await (await fetch(projectUrl)).json()).project.artifacts[0];
  const clickText = async text => {
    for (const element of await page.$$('button')) {
      if ((await element.evaluate(el => el.textContent)).trim() === text && await element.isVisible()) { await element.click(); return; }
    }
    throw new Error(`Missing button: ${text}`);
  };
  const setInput = async (selector, value) => page.$eval(selector, (el, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }, String(value));
  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[aria-label="Layer 1 motion"]');
  await page.select('[aria-label="Preview scene"]', 'scene-1');
  await page.click('[aria-label="Loop scene"]');
  await page.click('[aria-label="Play video"]');
  const frames = await page.evaluate(async () => {
    const values = [];
    for (let i = 0; i < 75; i++) { await new Promise(resolve => setTimeout(resolve, 50)); values.push(Number(document.querySelector('[aria-label="Timeline playhead"]').value)); }
    return values;
  });
  assert.ok(frames.every(frame => frame >= 36 && frame <= 71), `Loop escaped its selected scene: ${frames}`);
  assert.ok(frames.some((frame, i) => i > 0 && frame < frames[i - 1]), 'The scene did not loop');
  await page.click('[aria-label="Loop scene"]');
  await clickText('Preview');
  await page.click('[aria-label="Edit graphic layout"]');
  await page.waitForSelector('[aria-label="Move selected graphic"]');
  const boxBefore = await page.$eval('[aria-label="Move selected graphic"]', el => ({ x: el.style.left, y: el.style.top, width: el.style.width, height: el.style.height }));
  const box = await page.$('[aria-label="Move selected graphic"]'), rect = await box.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 25, rect.y + rect.height / 2 + 30, { steps: 6 }); await page.mouse.up();
  const boxAfter = await page.$eval('[aria-label="Move selected graphic"]', el => ({ x: el.style.left, y: el.style.top }));
  assert.notEqual(boxAfter.x, boxBefore.x); assert.notEqual(boxAfter.y, boxBefore.y);
  const handle = await page.$('[aria-label="Resize graphic se"]'), corner = await handle.boundingBox();
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2); await page.mouse.down();
  await page.mouse.move(corner.x + corner.width / 2 + 20, corner.y + corner.height / 2 + 15, { steps: 4 }); await page.mouse.up();
  assert.notEqual(await page.$eval('[aria-label="Move selected graphic"]', el => el.style.width), boxBefore.width);
  await page.click('[aria-label="Undo graphic edit"]');
  await page.waitForFunction(before => document.querySelector('[aria-label="Move selected graphic"]').style.width === before, {}, boxBefore.width);
  await page.click('[aria-label="Redo graphic edit"]');
  await page.waitForFunction(before => document.querySelector('[aria-label="Move selected graphic"]').style.width !== before, {}, boxBefore.width);
  assert.equal((await savedArtifact()).graphic.bounds.x, p.artifacts[0].graphic.bounds.x, 'Dragging must remain a draft until saved');
  assert.equal(await page.$$eval('button', buttons => buttons.find(el => el.textContent === 'Export MP4').disabled), true);
  await page.select('[aria-label="Layer 1 motion"]', 'focus-in');
  await setInput('[aria-label="Layer 1 movement strength"]', 0.12);
  await setInput('[aria-label="Layer 1 focus x"]', 75);
  await setInput('[aria-label="Layer 1 focus y"]', 25);
  await page.select('[aria-label="Image comparison"]', 'wipe');
  await page.waitForSelector('[data-comparison-divider]');
  await page.screenshot({ path: 'artifacts/motion-studio-desktop.png', fullPage: true });
  await clickText('Save graphic');
  await page.waitForFunction(() => !document.body.textContent.includes('Unsaved graphic changes'));
  const saved = await savedArtifact(), motion = saved.graphic.composition.layers[0];
  assert.equal(motion.motion, 'focus-in'); assert.equal(motion.strength, 0.12); assert.deepEqual(motion.focus, { x: 0.75, y: 0.25 });
  assert.notDeepEqual(saved.graphic.bounds, p.artifacts[0].graphic.bounds);
  assert.equal(saved.graphic.composition.comparison.mode, 'wipe');
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[aria-label="Layer 1 focus x"]');
  assert.equal(await page.$eval('[aria-label="Layer 1 motion"]', el => el.value), 'focus-in');
  assert.equal(await page.$eval('[aria-label="Graphic position"]', el => el.value), 'custom');
  await page.select('[aria-label="Layer 1 motion"]', 'pull-out');
  await page.waitForFunction(() => Number(document.querySelector('[aria-label="Timeline playhead"]').value) >= 36);
  await clickText('Discard changes');
  await clickText('Preview'); await page.click('[aria-label="Edit graphic layout"]');
  await page.focus('[aria-label="Move selected graphic"]'); await page.keyboard.press('ArrowRight');
  await clickText('Discard changes');
  assert.deepEqual((await savedArtifact()).graphic, saved.graphic, 'Discard must preserve the saved layout and motion');
  await page.focus('[aria-label="Move selected graphic"]');
  await page.keyboard.down('Shift');
  for (let i = 0; i < 50; i++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.up('Shift');
  const clamped = await page.$eval('[aria-label="Move selected graphic"]', el => parseFloat(el.style.left));
  assert.ok(Math.abs(clamped - 6) < 0.01, 'Keyboard movement must stop at the safe boundary');
  await clickText('Discard changes');
  const styleSummary = await page.$$('summary');
  for (const summary of styleSummary) if ((await summary.evaluate(el => el.textContent)).includes('Reusable motion styles')) { await summary.click(); break; }
  await setInput('[aria-label="Motion style name"]', 'Fixture brand');
  await setInput('[aria-label="Style accent color"]', '#66ccee');
  await page.select('[aria-label="Style image motion"]', 'pull-out');
  await clickText('Save reusable style');
  await page.waitForFunction(() => document.querySelector('[aria-label="Saved motion style"]').value.length > 0);
  await clickText('Apply saved style to project');
  await page.waitForFunction(() => document.querySelector('[aria-label="Layer 1 motion"]').value === 'pull-out');
  const styled = (await (await fetch(projectUrl)).json()).project;
  assert.equal(styled.style.colors.accent, '#66ccee');
  await page.setViewport({ width: 390, height: 844 });
  await page.$eval('[aria-label="Loop scene"]', el => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: 'artifacts/motion-studio-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Motion Studio overflows on mobile');
  await page.setViewport({ width: 1440, height: 1100 });
  await page.click('[aria-label="Profile and voices"]');
  await page.waitForSelector('[aria-label="Backups and recovery"]');
  await clickText('Create verified backup');
  await page.waitForFunction(() => document.body.textContent.includes('Backup created'));
  const backupId = await page.$eval('[aria-label="Workspace backup"]', select => select.options[1].value);
  const scriptBefore = store.getById('scripts', p.scriptId);
  store.add('scripts', { ...scriptBefore, name: 'Changed after backup' });
  await clickText('Refresh recovery status');
  await page.waitForFunction(() => document.body.textContent.includes('Recovery status refreshed'));
  await page.select('[aria-label="Workspace backup"]', backupId);
  await clickText('Restore selected backup');
  await page.waitForFunction(() => document.body.textContent.includes('Workspace restored'));
  assert.equal(store.getById('scripts', p.scriptId).name, scriptBefore.name);
  fs.writeFileSync(path.join(process.env.TUBEFLOW_DATA_DIR, 'scripts.json'), '{damaged');
  await clickText('Refresh recovery status');
  await page.waitForFunction(() => document.body.textContent.includes('Saved scripts data is damaged'));
  await clickText('Restore last verified scripts copy');
  await page.waitForFunction(() => document.body.textContent.includes('scripts recovered'));
  assert.equal(store.getById('scripts', p.scriptId).name, scriptBefore.name);
  await page.$eval('[aria-label="Backups and recovery"]', el => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: 'artifacts/recovery-desktop.png', fullPage: true });
  await page.setViewport({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Recovery controls overflow on mobile');
  await page.screenshot({ path: 'artifacts/recovery-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('MOTION_BROWSER_PASSED: scene loops, pointer editing, undo/redo, comparison wipe, saved styles, persistence, backup/restore, corrupt-store recovery, mobile layout');
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
