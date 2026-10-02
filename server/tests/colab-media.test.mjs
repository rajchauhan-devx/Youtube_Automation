import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import express from 'express';

const directory = fs.mkdtempSync(path.resolve('server/data/colab-media-test-'));
process.env.TUBEFLOW_DATA_DIR = directory;
delete process.env.COLAB_MEDIA_API_URL;
delete process.env.COLAB_MEDIA_API_KEY;
const { workspaceContext } = await import('../dist/services/workspace.js');
const { store } = await import('../dist/services/store.js');
const { workspacesRouter } = await import('../dist/routes/workspaces.js');
const { resolveColabConfig, submitColabJob, pollColabJob } = await import('../dist/services/colab-media.js');

const scope = { accountId: 'default', profile: 'shorts' };
const prefix = '/api/accounts/default/profiles/shorts';
const API_KEY = 'colab-fixture-key';
const scenes = [
  { id: 'scene_001', chapter: 'Hook', role: 'story', mediaType: 'video', duration: 5, narration: 'The sea itself was afraid.', imagePrompt: 'Stormy ancient ocean at dawn, colossal waves.' },
  { id: 'scene_002', chapter: 'Payoff', role: 'story', mediaType: 'image', narration: 'And the bridge stood.', imagePrompt: 'Stone bridge across the ocean at sunrise.' },
];
const plan = { version: 1, title: 'Colab test', thumbnailPrompt: 'Ocean storm cover', scenes };

// Fixture clip the fake worker streams back as a job result.
const ff = args => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { windowsHide: true, stdio: 'pipe' });
const fixture = path.join(directory, 'fixture.mp4');
ff(['-f', 'lavfi', '-i', 'color=c=steelblue:s=320x180:r=24', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', fixture]);

const seen = [];
const worker = express(); worker.use(express.json());
worker.use((req, res, next) => {
  if (req.headers['x-api-key'] !== API_KEY) return res.status(401).json({ error: 'bad key' });
  next();
});
worker.post('/generate', (req, res) => {
  seen.push(req.body);
  if (req.body.prompt === 'make it fail') return res.json({ job_id: 'job-error' });
  res.json({ job_id: 'job-ok' });
});
worker.get('/status/:job', (req, res) => {
  if (req.params.job === 'job-error') return res.json({ status: 'error', error: 'worker exploded' });
  res.json({ status: 'done' });
});
worker.get('/result/:job', (_req, res) => {
  res.set('Content-Type', 'video/mp4');
  fs.createReadStream(fixture).pipe(res);
});
const workerServer = await new Promise(resolve => { const s = worker.listen(0, '127.0.0.1', () => resolve(s)); });
const workerUrl = `http://127.0.0.1:${workerServer.address().port}`;

workspaceContext.run(scope, () => store.add('scripts', { id: 'colab-test', name: 'Colab media test', accountId: 'default', section: 'shorts', status: 'active', duration: 60,
  prompts: [], scenePlan: plan, videoImportsEnabled: true, imagePrompts: scenes.map(s => s.imagePrompt),
  narration: scenes.map(s => s.narration).join('\n\n'), generatedImages: [], generatedAudio: [] }));

const app = express(); app.use(express.json());
app.use('/api/accounts/:accountId/profiles/:profile', workspacesRouter);
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
const base = `http://127.0.0.1:${server.address().port}`;
const originalFetch = globalThis.fetch;
const read = () => workspaceContext.run(scope, () => store.getById('scripts', 'colab-test'));
const headers = { 'Content-Type': 'application/json', 'x-colab-url': workerUrl, 'x-colab-key': API_KEY };

async function cleanup() {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => workerServer.close(resolve));
  assert.ok(directory.startsWith(path.resolve('server/data') + path.sep));
  fs.rmSync(directory, { recursive: true, force: true });
}
after(cleanup);

test('Colab config prefers browser headers over server env and requires both', () => {
  process.env.COLAB_MEDIA_API_URL = 'https://env.example.com';
  process.env.COLAB_MEDIA_API_KEY = 'env-key';
  assert.deepEqual(resolveColabConfig({ headers: { 'x-colab-url': workerUrl, 'x-colab-key': API_KEY } }), { baseUrl: workerUrl, apiKey: API_KEY });
  assert.deepEqual(resolveColabConfig({ headers: {} }), { baseUrl: 'https://env.example.com', apiKey: 'env-key' });
  delete process.env.COLAB_MEDIA_API_URL;
  assert.throws(() => resolveColabConfig({ headers: { 'x-colab-key': 'k' } }), /URL/);
  delete process.env.COLAB_MEDIA_API_KEY;
  assert.throws(() => resolveColabConfig({ headers: {} }), /Colab API URL/);
});

test('Colab client follows the generate.py job protocol with the API key header', async () => {
  const config = { baseUrl: workerUrl, apiKey: API_KEY };
  const job = await submitColabJob(config, { prompt: 'Ocean storm.', numFrames: 33, steps: 20 });
  assert.equal(job, 'job-ok');
  assert.deepEqual(seen.at(-1), { prompt: 'Ocean storm.', num_frames: 33, steps: 20 });
  const final = await pollColabJob(config, job);
  assert.equal(final.status, 'done');
  await assert.rejects(pollColabJob(config, 'job-error'), /worker exploded/);
});

test('Colab video fills a video scene and Colab image extracts a still', async () => {
  const video = await originalFetch(`${base}${prefix}/generate/colab-video`, {
    method: 'POST', headers, body: JSON.stringify({ scriptId: 'colab-test', index: 0, prompt: scenes[0].imagePrompt }),
  });
  const videoBody = await video.json();
  assert.equal(video.status, 200, JSON.stringify(videoBody));
  assert.match(videoBody.url, /\.mp4$/);
  const afterVideo = read();
  assert.equal(afterVideo.generatedImages.length, 1);
  assert.equal(afterVideo.generatedImages[0].mediaType, 'video');
  assert.ok(afterVideo.generatedImages[0].duration > 0);
  assert.ok(fs.existsSync(path.join(directory, 'generated', 'colab-test', path.basename(videoBody.url))));

  const image = await originalFetch(`${base}${prefix}/generate/colab-image`, {
    method: 'POST', headers, body: JSON.stringify({ scriptId: 'colab-test', index: 1, prompt: scenes[1].imagePrompt }),
  });
  const imageBody = await image.json();
  assert.equal(image.status, 200, JSON.stringify(imageBody));
  assert.match(imageBody.url, /\.png$/);
  const afterImage = read();
  assert.equal(afterImage.generatedImages.length, 2);
  assert.ok(fs.existsSync(path.join(directory, 'generated', 'colab-test', path.basename(imageBody.url))));

  const wrongScene = await originalFetch(`${base}${prefix}/generate/colab-video`, {
    method: 'POST', headers, body: JSON.stringify({ scriptId: 'colab-test', index: 1, prompt: scenes[1].imagePrompt }),
  });
  assert.equal(wrongScene.status, 400);

  const badKey = await originalFetch(`${base}${prefix}/generate/colab-video`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-colab-url': workerUrl, 'x-colab-key': 'wrong' },
    body: JSON.stringify({ scriptId: 'colab-test', index: 0, prompt: scenes[0].imagePrompt }),
  });
  assert.equal(badKey.status, 500);
  assert.match((await badKey.json()).error, /API key/);

  const missing = await originalFetch(`${base}${prefix}/generate/colab-image`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scriptId: 'colab-test', index: 1, prompt: scenes[1].imagePrompt }),
  });
  assert.equal(missing.status, 500);
});
