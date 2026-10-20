import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tubeflow-reliability-'));
process.env.TUBEFLOW_DATA_DIR = directory;
const { store, storeRecoveryStatus, restoreStore, StoreCorruptionError } = await import('../dist/services/store.js');
const { workspaceContext, workspaceDir } = await import('../dist/services/workspace.js');
const { createWorkspaceBackup, restoreWorkspaceBackup, workspaceFingerprint, listWorkspaceBackups } = await import('../dist/services/workspace-backups.js');
const { readRenderJob, saveRenderJob, removeRenderJob } = await import('../dist/services/render-jobs.js');
const { claimUpload, uploadStatus, reconcileUpload, retryUncertainUpload } = await import('../dist/services/upload-jobs.js');
const { workspaceMutationGuard } = await import('../dist/services/workspace-activity.js');
const scope = (name, work) => workspaceContext.run({ accountId: `test-${name}`, profile: 'shorts' }, work);

test('corrupt or invalid stores block every mutation and recover the latest committed data', () => scope('corrupt', () => {
  store.add('scripts', { id: 'one', name: 'First' }); store.add('scripts', { id: 'two', name: 'Second' });
  const file = path.join(workspaceDir(), 'scripts.json');
  for (const damaged of ['{broken', '{"not":"an array"}']) {
    fs.writeFileSync(file, damaged);
    for (const operation of [() => store.get('scripts'), () => store.add('scripts', { id: 'new' }), () => store.set('scripts', []), () => store.remove('scripts', 'one'), () => store.delete('scripts')]) assert.throws(operation, StoreCorruptionError);
    assert.equal(fs.readFileSync(file, 'utf8'), damaged);
    assert.deepEqual(storeRecoveryStatus(), [{ name: 'scripts', damaged: true, canRestore: true }]);
    restoreStore('scripts'); assert.equal(store.get('scripts').length, 2);
  }
  assert.throws(() => restoreStore('../scripts'), /Invalid store/);
}));

test('verified snapshots restore media and scripts, reject stale state, and retain newer upload receipts', async () => scope('backup', async () => {
  store.add('scripts', { id: 'episode', generatedImages: [{ url: '/api/generate/file/episode/image.png' }] });
  const media = path.join(workspaceDir(), 'generated/episode/image.png'); fs.mkdirSync(path.dirname(media), { recursive: true }); fs.writeFileSync(media, 'original-image');
  fs.writeFileSync(path.join(workspaceDir(), 'youtube-token.json'), '{"private":"excluded"}');
  const backup = await createWorkspaceBackup(), oldFingerprint = workspaceFingerprint();
  const manifestPath = path.join(directory, '.workspace-backups/test-backup/shorts', backup.id, 'manifest.json'), manifest = JSON.parse(fs.readFileSync(manifestPath));
  assert.equal(manifest.files.some(file => file.path.includes('youtube-token')), false);
  assert.equal(listWorkspaceBackups().length, 1);
  store.add('scripts', { id: 'episode', name: 'Changed' }); fs.writeFileSync(media, 'changed-image');
  const video = path.join(workspaceDir(), 'output/episode/video.mp4'); fs.mkdirSync(path.dirname(video), { recursive: true }); fs.writeFileSync(video, 'rendered-bytes');
  const upload = await claimUpload(video, 'episode', 'channel'); upload.sending(); upload.complete({ videoId: 'already-uploaded', videoUrl: 'https://youtu.be/already-uploaded' });
  await assert.rejects(restoreWorkspaceBackup(backup.id, oldFingerprint), /workspace changed/i);
  await restoreWorkspaceBackup(backup.id, workspaceFingerprint());
  assert.equal(fs.readFileSync(media, 'utf8'), 'original-image'); assert.equal(store.get('scripts')[0].name, undefined);
  assert.equal(uploadStatus('episode')[0].status, 'completed', 'Restore must not roll back irreversible upload history');
  assert.equal(fs.readFileSync(path.join(workspaceDir(), 'youtube-token.json'), 'utf8'), '{"private":"excluded"}');
  const before = workspaceFingerprint(), mediaEntry = manifest.files.find(file => file.path.endsWith('image.png'));
  fs.writeFileSync(path.join(path.dirname(manifestPath), 'files', mediaEntry.path), 'tampered');
  await assert.rejects(restoreWorkspaceBackup(backup.id, before), /verification failed/);
  assert.equal(workspaceFingerprint(), before, 'Failed verification must not change live data');
  await scope('other', async () => { assert.equal(listWorkspaceBackups().length, 0); await assert.rejects(restoreWorkspaceBackup(backup.id, workspaceFingerprint())); });
}));

test('backup excludes active mutations and blocks new writes while copying', async () => scope('active', async () => {
  store.add('scripts', { id: 'one' });
  const { EventEmitter } = await import('node:events');
  const response = new EventEmitter();
  let entered = false;
  workspaceMutationGuard({ method: 'POST', path: '/scripts' }, response, () => { entered = true; }); assert.equal(entered, true);
  await assert.rejects(createWorkspaceBackup(), /Wait for active/);
  response.emit('finish');
  const backup = createWorkspaceBackup();
  let blocked = 0;
  workspaceMutationGuard({ method: 'POST', path: '/generate' }, { status(code) { blocked = code; return this; }, json() {} }, () => assert.fail('Mutation was not blocked'));
  assert.equal(blocked, 423); await backup;
}));

test('a crash during restore rolls back before any script data can be read or replaced', () => scope('crashed-restore', () => {
  store.add('scripts', { id: 'original' });
  const rollback = `.before-restore-${randomUUID()}`, staging = `.restoring-${randomUUID()}`;
  fs.mkdirSync(path.join(workspaceDir(), rollback)); fs.mkdirSync(path.join(workspaceDir(), staging));
  fs.renameSync(path.join(workspaceDir(), 'scripts.json'), path.join(workspaceDir(), rollback, 'scripts.json'));
  fs.writeFileSync(path.join(workspaceDir(), 'scripts.json'), JSON.stringify([{ id: 'partially-restored' }]));
  fs.writeFileSync(path.join(workspaceDir(), '.restore-journal.json'), JSON.stringify({ rollback, staging, entries: [{ name: 'scripts.json', hadLive: true }] }));
  assert.deepEqual(store.get('scripts'), [{ id: 'original' }]);
  assert.equal(fs.existsSync(path.join(workspaceDir(), '.restore-journal.json')), false);
}));

test('render jobs survive a process restart with saved inputs and interrupted state', () => scope('jobs', () => {
  const code = `import {workspaceContext} from './server/dist/services/workspace.js'; import {saveRenderJob} from './server/dist/services/render-jobs.js'; workspaceContext.run({accountId:'test-jobs',profile:'shorts'},()=>saveRenderJob({scriptId:'episode',status:'running',progress:42,revision:'revision',request:{scriptId:'episode',audioPath:'voice.wav',imagePaths:['image.png']}}));`;
  execFileSync(process.execPath, ['--input-type=module', '-e', code], { env: process.env });
  const job = readRenderJob('episode'); assert.equal(job.status, 'interrupted'); assert.equal(job.progress, 42); assert.equal(job.request.audioPath, 'voice.wav');
  saveRenderJob({ ...job, status: 'done', progress: 100 }); assert.equal(readRenderJob('episode').status, 'done');
  removeRenderJob('episode'); assert.equal(readRenderJob('episode'), undefined);
}));

test('upload claims deduplicate bytes, protect concurrent calls, and require uncertain-outcome recovery', async () => scope('uploads', async () => {
  const file = path.join(workspaceDir(), 'video.mp4'); fs.mkdirSync(workspaceDir(), { recursive: true }); fs.writeFileSync(file, 'video-one');
  const first = await claimUpload(file, 'episode', 'channel'); first.sending();
  await assert.rejects(claimUpload(file, 'episode', 'channel'), error => error.code === 'UPLOAD_ACTIVE');
  first.complete({ videoId: 'first', videoUrl: 'https://youtu.be/first' });
  assert.equal((await claimUpload(file, 'episode', 'channel')).replay.videoId, 'first');
  fs.writeFileSync(file, 'video-two');
  const uncertain = await claimUpload(file, 'episode', 'channel'); uncertain.sending(); uncertain.fail(new Error('Connection lost'));
  await assert.rejects(claimUpload(file, 'episode', 'channel'), error => error.code === 'UPLOAD_OUTCOME_UNKNOWN');
  assert.throws(() => reconcileUpload(uncertain.id, 'another-channel', {}), /connected channel/);
  reconcileUpload(uncertain.id, 'channel', { videoId: 'recovered' });
  assert.equal((await claimUpload(file, 'episode', 'channel')).replay.videoId, 'recovered');
  fs.writeFileSync(file, 'video-three');
  const retry = await claimUpload(file, 'episode', 'channel'); retry.sending(); retry.fail(new Error('Unknown'));
  retryUncertainUpload(retry.id, 'channel');
  const recovered = await claimUpload(file, 'episode', 'channel'); assert.equal(recovered.replay, undefined); recovered.fail(new Error('Before send'));
}));

test.after(() => fs.rmSync(directory, { recursive: true, force: true }));
