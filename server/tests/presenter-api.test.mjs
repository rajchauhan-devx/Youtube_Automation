import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import express from 'express';

const directory = fs.mkdtempSync(path.resolve('server/data/presenter-api-'));
process.env.TUBEFLOW_DATA_DIR = directory;
process.env.MUSETALK_ROOT = path.join(directory, 'engine');
process.env.MUSETALK_PYTHON = process.execPath; // Cached tests never start a worker.
const { presenterCacheKey } = await import('../dist/services/presenter.js');
const { defaultPresenter } = await import('../dist/services/presenter-settings.js');
const { presenterState } = await import('../dist/services/presenter-state.js');
const { store } = await import('../dist/services/store.js');
const { isCurrentRender } = await import('../dist/services/render-revision.js');
const { workspacesRouter } = await import('../dist/routes/workspaces.js');
const { workspaceContext } = await import('../dist/services/workspace.js');
const scope = { accountId: 'default', profile: 'shorts' };
const p = { ...defaultPresenter(), enabled: true };
const engine = process.env.MUSETALK_ROOT;
const avatar = path.join(engine, 'avatars', 'prepared', 'avatar_005');
const assets = path.join(directory, 'generated', 'episode');
for (const folder of [assets, path.join(avatar, 'full_imgs'), path.join(avatar, 'mask')]) fs.mkdirSync(folder, { recursive: true });
for (const file of ['app/musetalk_service.py', 'MuseTalk/models/musetalkV15/unet.pth', 'MuseTalk/models/musetalkV15/musetalk.json', 'MuseTalk/models/sd-vae/diffusion_pytorch_model.bin', 'MuseTalk/models/whisper/pytorch_model.bin']) {
  const dest = path.join(engine, file); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, 'fixture');
}
for (const file of ['latents.pt', 'coords.pkl', 'mask_coords.pkl']) fs.writeFileSync(path.join(avatar, file), 'fixture');
fs.writeFileSync(path.join(avatar, 'metadata.json'), JSON.stringify({ name: 'Test Sage', preparation_status: 'prepared', resolution: '320x180', duration: 2 }));
const ff = args => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'pipe' });
ff(['-f', 'lavfi', '-i', 'color=blue:s=320x180:r=25', '-t', '2', '-c:v', 'libx264', path.join(avatar, 'source_25fps.mp4')]);
ff(['-f', 'lavfi', '-i', 'color=red:s=320x180', '-frames:v', '1', path.join(assets, 'story.png')]);
ff(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '2', path.join(assets, 'voice.wav')]);
const hash = await presenterCacheKey(path.join(assets, 'voice.wav'), p);
fs.copyFileSync(path.join(avatar, 'source_25fps.mp4'), path.join(assets, `presenter-${hash}.mp4`));
const app = express(); app.use(express.json()); app.use('/api/accounts/:accountId/profiles/:profile', workspacesRouter);
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}/api/accounts/default/profiles/shorts`;
const request = (url, body, method = 'POST') => fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('presenter routes list prepared avatars, support range preview, and validate saved settings', async () => {
  const health = await (await fetch(base + '/presenter/status')).json();
  assert.equal(health.installed, true);
  assert.equal(health.avatars.length, 1);
  assert.match(health.avatars[0].previewUrl, /accounts\/default\/profiles\/shorts\/presenter\/avatar\/avatar_005$/);
  const preview = await fetch(base + '/presenter/avatar/avatar_005', { headers: { Range: 'bytes=0-31' } });
  assert.equal(preview.status, 206);
  assert.equal((await preview.arrayBuffer()).byteLength, 32);
  assert.equal((await request('/scripts', { id: 'invalid', name: 'Invalid', presenter: { ...p, avatarId: '../bad' } })).status, 400);
  assert.equal((await request('/scripts', { id: 'episode', name: 'Presenter test', narration: 'A short story', presenter: p })).status, 201);
});
test('render API reuses cached lip-sync and invalidates the result when the presenter is disabled', async () => {
  const response = await request('/render/start', { scriptId: 'episode', imagePaths: ['story.png'], audioPath: 'voice.wav',
    resolution: { width: 1920, height: 1080 }, presenter: p, colorGrade: 'none', enableVignette: false, enableSubtitles: true, narration: 'A short story' });
  assert.equal(response.status, 200, await response.text());
  let status;
  for (let i = 0; i < 120; i++) {
    status = await (await fetch(base + '/render/status/episode')).json();
    if (status.status !== 'running') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(status.status, 'done', JSON.stringify(status));
  const filename = status.videos[0].filename;
  const output = path.join(directory, 'output', 'episode', filename);
  assert.equal(workspaceContext.run(scope, () => isCurrentRender('episode', output)), true);
  assert.equal((await request('/scripts/episode', { presenter: { ...p, enabled: false } }, 'PUT')).status, 200);
  assert.equal(workspaceContext.run(scope, () => isCurrentRender('episode', output)), false);
  assert.equal((await fetch(base + `/render/file/episode/${filename}`)).status, 404);
  assert.equal(presenterState.busy, false);
});
test('GPU operations reject overlap with an active presenter without leaking request counters', async () => {
  presenterState.busy = true;
  try {
    for (const route of ['/generate/image', '/tts/generate', '/tts/preview', '/tts/start']) assert.equal((await request(route, {})).status, 409);
    assert.equal((await request('/render/music/generate/episode', { duration: 30 })).status, 400);
    assert.equal(presenterState.mediaRequests, 0);
  } finally { presenterState.busy = false; }
});
test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  assert.equal(path.dirname(directory), path.resolve('server/data'));
  assert.ok(path.basename(directory).startsWith('presenter-api-'));
  fs.rmSync(directory, { recursive: true, force: true });
});
