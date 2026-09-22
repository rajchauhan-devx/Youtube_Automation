import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import express from 'express';

const directory = fs.mkdtempSync(path.resolve('server/data/mixed-image-test-'));
process.env.TUBEFLOW_DATA_DIR = directory;
process.env.COMFYUI_BASE_URL = 'http://mixed-image-model.test';
const { workspaceContext } = await import('../dist/services/workspace.js');
const { store } = await import('../dist/services/store.js');
const { workspacesRouter } = await import('../dist/routes/workspaces.js');
const { accountsRouter } = await import('../dist/routes/accounts.js');
const scope = { accountId: 'default', profile: 'mixed' };
const prefix = '/api/accounts/default/profiles/mixed';
const scenes = ['image', 'video', 'image', 'video', 'image'].map((mediaType, index) => ({
  id: `scene_${index}`, chapter: `Test scene ${index + 1}`, role: 'story', mediaType,
  duration: 10, narration: `Narration for scene ${index + 1}.`, imagePrompt: `Visual prompt ${index + 1}.`,
}));
const plan = { version: 1, title: 'Mixed image test', thumbnailPrompt: 'Separate thumbnail', scenes };
const png = path.join(directory, '001.png');
const video = path.join(directory, '002.mp4');
const ff = args => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { windowsHide: true, stdio: 'pipe' });
ff(['-f', 'lavfi', '-i', 'color=c=steelblue:s=320x180', '-frames:v', '1', png]);
ff(['-f', 'lavfi', '-i', 'color=c=green:s=320x180:r=24', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
const originalFetch = globalThis.fetch;
const requests = [];
let failNext = false;
let duringGeneration;
let delay = 0;
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith(process.env.COMFYUI_BASE_URL)) return originalFetch(url, options);
  if (String(url).endsWith('/system_stats')) return Response.json({});
  if (String(url).endsWith('/prompt')) {
    requests.push(JSON.parse(options.body));
    if (duringGeneration) { duringGeneration(); duringGeneration = undefined; }
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if (failNext) { failNext = false; return Response.json({ error: 'Test failure' }, { status: 422 }); }
    return Response.json({ prompt_id: 'test-image' });
  }
  if (String(url).includes('/history/')) return Response.json({ 'test-image': { outputs: { '9': { images: [{ filename: 'test.png', type: 'output' }] } } } });
  if (String(url).includes('/view?')) return new Response(fs.readFileSync(png), { headers: { 'Content-Type': 'image/png' } });
  throw new Error(`Unexpected image model request: ${url}`);
};
workspaceContext.run(scope, () => store.add('scripts', { id: 'image-test', name: 'Mixed image generation test', accountId: 'default', section: 'mixed', status: 'active', duration: 50,
  prompts: [], scenePlan: plan, imagePrompts: scenes.map(s => s.imagePrompt), narration: scenes.map(s => s.narration).join('\n\n'), generatedImages: [], generatedAudio: [] }));
const app = express(); app.use(express.json());
app.use('/api/accounts/:accountId/profiles/:profile', workspacesRouter);
app.use('/api/accounts', accountsRouter);
app.use(express.static(path.resolve('dist')));
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
const base = `http://127.0.0.1:${server.address().port}`;
const read = () => workspaceContext.run(scope, () => store.getById('scripts', 'image-test'));
const generate = (index, prompt = scenes[index]?.imagePrompt) => originalFetch(base + prefix + '/generate/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scriptId: 'image-test', index, prompt }) });
const upload = (index, file, extension) => originalFetch(`${base}${prefix}/media-import/image-test/${index}?extension=${extension}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: fs.readFileSync(file) });
async function cleanup() {
  globalThis.fetch = originalFetch;
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  assert.ok(directory.startsWith(path.resolve('server/data') + path.sep));
  fs.rmSync(directory, { recursive: true, force: true });
}

if (process.env.MIXED_IMAGE_BROWSER_TEST === '1') {
  delay = 1500;
  assert.equal((await upload(0, png, 'png')).status, 200);
  assert.equal((await upload(1, video, 'mp4')).status, 200);
  console.log(JSON.stringify({ base, png, video }));
  app.get('/test-results', (_req, res) => res.json({ requests: requests.length, script: read() }));
  app.post('/test-fail-next', (_req, res) => { failNext = true; res.json({ ok: true }); });
  app.post('/test-close', (_req, res) => { res.json({ ok: true }); setImmediate(() => void cleanup()); });
} else {
  test('mixed image generation preserves imports, scene indices, and failures; rejects videos and stale scenes', async () => {
    try {
      assert.equal((await upload(0, png, 'png')).status, 200);
      assert.equal((await upload(1, video, 'mp4')).status, 200);
      const imported = read().generatedImages;
      for (const [index, prompt] of [[1, scenes[1].imagePrompt], [9, 'missing'], [2, 'outdated prompt']]) assert.equal((await generate(index, prompt)).status, 400);
      assert.equal(requests.length, 0, 'invalid scenes never reach the image model');
      let response = await generate(2);
      assert.equal(response.status, 200);
      let result = await response.json();
      assert.deepEqual(result.generatedImages.map(a => a.index), [0, 1, 2]);
      assert.deepEqual(read().generatedImages.slice(0, 2), imported);
      assert.equal(result.generatedImages[2].mediaType, 'image');
      assert.equal((await originalFetch(base + result.url)).status, 200);
      const before = read().generatedImages;
      failNext = true;
      assert.equal((await generate(2)).status, 422);
      assert.deepEqual(read().generatedImages, before, 'failed regeneration keeps the previous asset');
      duringGeneration = () => workspaceContext.run(scope, () => {
        const current = read();
        current.scenePlan.scenes[4].imagePrompt = 'changed during generation';
        store.add('scripts', current);
      });
      assert.equal((await generate(4)).status, 409);
      assert.deepEqual(read().generatedImages, before, 'stale results do not overwrite assets');
      response = await generate(4, 'changed during generation');
      assert.equal(response.status, 200);
      assert.deepEqual(read().generatedImages.map(a => a.index), [0, 1, 2, 4]);
      assert.equal((await upload(4, png, 'png')).status, 200, 'image import remains usable after generation');
      assert.equal((await upload(3, video, 'mp4')).status, 200, 'video import remains usable after generation');
      assert.equal(read().generatedImages.find(a => a.index === 3).mediaType, 'video');
    } finally { await cleanup(); }
  });
}
