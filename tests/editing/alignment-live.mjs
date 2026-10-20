import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import express from '../../server/node_modules/express/index.js';
process.env.TUBEFLOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'alignment-live-'));
const { fixture } = await import('./motion-fixtures.mjs');
const { saveAsset, objectHash, nextRevision, publish, assetFile } = await import('../../server/dist/services/editing/repository.js');
const { approximateAlignment } = await import('../../server/dist/services/editing/timing.js');
const { scriptFingerprint } = await import('../../server/dist/services/editing/projects.js');
const { store } = await import('../../server/dist/services/store.js');
const { editingRouter } = await import('../../server/dist/routes/editing.js');
const app = express(); app.use(express.json()); app.use('/api/editing', editingRouter);
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
const base = `http://127.0.0.1:${server.address().port}/api/editing`, report = [];
const cases = process.env.ALIGNMENT_SMOKE_AUDIO ? [[process.env.ALIGNMENT_SMOKE_LANGUAGE || 'en', process.env.ALIGNMENT_SMOKE_AUDIO, process.env.ALIGNMENT_SMOKE_TEXT]] : [
  ['en', 'artifacts/alignment-check/voice.wav', 'A bronze statue stands beside the sea.'],
  ['hi', 'artifacts/alignment-check/hindi.wav', 'पानी गर्म होता है और भाप बन जाता है।'],
];
try {
  for (const [language, file, text] of cases) {
    if (!text || !fs.existsSync(file)) throw new Error('Set ALIGNMENT_SMOKE_AUDIO, ALIGNMENT_SMOKE_TEXT and ALIGNMENT_SMOKE_LANGUAGE to a short narration sample.');
    const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]));
    const original = await fixture('museum', false, true), p = nextRevision(original);
    const audio = saveAsset(fs.readFileSync(file), { mime: 'audio/wav', duration, alpha: false, method: 'fixture', providerVersion: 'measured-speech-fixture' });
    p.inputs = { ...p.inputs, audioAssetId: audio.id, audioHash: audio.hash, narrationText: text, narrationHash: objectHash(text), language, durationFrames: Math.ceil(duration * p.inputs.fps) };
    p.alignment = approximateAlignment(p.inputs, duration);
    p.assetIds.push(audio.id); p.scenes[0].endFrame = p.inputs.durationFrames; p.scenes[0].camera = [{ frame: 0, x: 0, y: 0, scale: 1 }]; p.scenes[0].narrativeRefs = p.alignment.tokens.map(token => token.id);
    const script = { ...store.getById('scripts', p.scriptId), narration: text };
    store.add('scripts', script); p.inputs.scriptHash = scriptFingerprint(script); publish(p, original.revisionId);
    const response = await fetch(`${base}/projects/${p.id}/align`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ expectedRevisionId: p.revisionId }) });
    assert.equal(response.status, 202, await response.clone().text());
    const { jobId } = await response.json(); let result, job;
    for (let i = 0; i < 180; i++) { result = await (await fetch(`${base}/projects/${p.id}`)).json(); job = result.jobs.find(job => job.id === jobId); if (!['queued', 'running'].includes(job.state)) break; await new Promise(resolve => setTimeout(resolve, 500)); }
    assert.equal(job.state, 'succeeded', job.error); assert.equal(result.project.alignment.mode, 'word');
    assert.equal(result.project.alignment.tokens.length, text.split(/\s+/u).length);
    assert.ok(result.project.alignment.tokens.every(token => token.confidence >= 0.1));
    assert.equal(fs.existsSync(assetFile(audio.id)), true);
    report.push({ language, mode: 'word', words: result.project.alignment.tokens.length, duration, firstWord: result.project.alignment.tokens[0], lastWord: result.project.alignment.tokens.at(-1), job: job.state });
  }
  fs.mkdirSync('artifacts/alignment-check', { recursive: true }); fs.writeFileSync('artifacts/alignment-check/api-verification.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(process.env.TUBEFLOW_DATA_DIR, { recursive: true, force: true }); }
