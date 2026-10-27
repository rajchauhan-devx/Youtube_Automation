import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tubeflow-presenter-preparation-'));
const engine = path.join(temporary, 'engine');
process.env.MUSETALK_ROOT = engine;
process.env.TUBEFLOW_DATA_DIR = path.join(temporary, 'data');
// A protocol fixture exercises real child-process handling without downloading
// neural models in unit tests. Real inference has its own opt-in smoke test.
const python = path.join(temporary, 'worker-fixture');
fs.writeFileSync(python, `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path');
const request = JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--request') + 1], 'utf8'));
const emit = result => console.log('TUBEFLOW_EVENT ' + JSON.stringify(result));
emit({stage:'Fixture preparation',progress:25});
const timer = setInterval(() => {
  if (fs.existsSync(path.join(request.work, 'cancel.request'))) {
    clearInterval(timer); emit({error:'Presenter generation cancelled.'}); process.exit(1);
  }
}, 10);
setTimeout(() => {
  clearInterval(timer);
  const dir = path.join(request.root, 'avatars/prepared', request.avatarId);
  fs.mkdirSync(path.join(dir, 'full_imgs'), {recursive:true});
  for (const file of ['source_25fps.mp4','latents.pt','coords.pkl']) fs.writeFileSync(path.join(dir,file),'fixture');
  fs.writeFileSync(path.join(dir,'metadata.json'),JSON.stringify({name:request.name,preparation_status:'prepared',resolution:'320x240',duration:1}));
  emit({stage:'Fixture published',progress:100});
  setTimeout(() => emit({result:{avatar_id:request.avatarId}}), 100);
}, 350);
`, { mode: 0o755 });
process.env.MUSETALK_PYTHON = python;
for (const file of ['UPSTREAM.json', 'app/musetalk_service.py',
  ...['musetalkV15/unet.pth', 'musetalkV15/musetalk.json', 'sd-vae/config.json', 'sd-vae/diffusion_pytorch_model.bin',
    'whisper/config.json', 'whisper/preprocessor_config.json', 'whisper/pytorch_model.bin', 'face_detection_yunet_2023mar.onnx'].map(f => `MuseTalk/models/${f}`)]) {
  const target = path.join(engine, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, '{}');
}
const { presenterHealth, presenterPythonPath, preparePresenterAvatar, presenterPreparation, cancelPresenterPreparation } = await import('../dist/services/presenter.js');
const { presenterState } = await import('../dist/services/presenter-state.js');
const { workspaceContext } = await import('../dist/services/workspace.js');
const settle = async id => {
  for (let i = 0; i < 100; i++) {
    const state = presenterPreparation(id);
    if (state.status !== 'running') return state;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Preparation did not finish');
};

test('explicit missing Python override does not fall back to another installation', () => {
  process.env.MUSETALK_PYTHON = path.join(temporary, 'missing-python');
  try { assert.equal(presenterPythonPath(), undefined); assert.equal(presenterHealth().installed, false); }
  finally { process.env.MUSETALK_PYTHON = python; }
});
test('bundled preparation validates upload before taking the media lock', () => {
  assert.equal(presenterHealth().canPrepare, true);
  assert.throws(() => preparePresenterAvatar(Buffer.from('data'), 'model.pkl', 'Test'), /Choose an/);
  assert.throws(() => preparePresenterAvatar(Buffer.alloc(0), 'avatar.mp4', 'Test'), /40 MB/);
  assert.equal(presenterState.busy, false);
});
test('preparation runs the worker, prevents overlaps, and isolates job status by workspace', async () => {
  const job = preparePresenterAvatar(Buffer.from('data'), 'avatar.mp4', 'Imported avatar');
  assert.equal(presenterState.busy, true);
  assert.throws(() => preparePresenterAvatar(Buffer.from('data'), 'second.mp4', 'Second'), /Wait for active/);
  assert.equal(workspaceContext.run({ accountId: 'different', profile: 'shorts' }, () => presenterPreparation(job.id)), undefined);
  const done = await settle(job.id);
  assert.equal(done.status, 'done', done.error);
  assert.equal(presenterState.busy, false);
  assert.ok(presenterHealth().avatars.some(a => a.id === done.avatarId && a.name === 'Imported avatar'));
});
test('cancelled preparation releases the media lock and does not publish an avatar', async () => {
  const job = preparePresenterAvatar(Buffer.from('data'), 'avatar.mp4', 'Cancelled');
  cancelPresenterPreparation(job.id);
  const done = await settle(job.id);
  assert.equal(done.status, 'error');
  assert.match(done.error, /cancelled/);
  assert.equal(presenterState.busy, false);
  assert.ok(!presenterHealth().avatars.some(a => a.id === job.avatarId));
});
test('cancellation after the worker publishes its directory still removes the new avatar', async () => {
  const job = preparePresenterAvatar(Buffer.from('data'), 'avatar.mp4', 'Late cancellation');
  for (let i = 0; i < 100 && presenterPreparation(job.id).percent !== 100; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(presenterPreparation(job.id).percent, 100);
  assert.ok(presenterHealth().avatars.some(a => a.id === job.avatarId));
  cancelPresenterPreparation(job.id);
  assert.equal((await settle(job.id)).status, 'error');
  assert.ok(!presenterHealth().avatars.some(a => a.id === job.avatarId));
});
test.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
