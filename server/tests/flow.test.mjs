import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const { flowRouter } = await import('../dist/routes/flow.js');
const app = express();
app.use(express.json());
app.use('/api/flow', flowRouter);
const api = await new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});
const base = `http://127.0.0.1:${api.address().port}/api/flow`;
const post = (url, body) => fetch(base + url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const longPrompt = 'A slow cinematic push-in on a sunlit forest clearing with volumetric light. '.repeat(4);

test('flow status reports install state without spending credits', async () => {
  const res = await fetch(`${base}/status`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.installed, true);
  assert.equal(typeof body.profileDir, 'string');
  assert.equal(typeof body.creditBudgetPerEpisode, 'number');
});

test('dry-run validates combos and never bills', async () => {
  const bad = await post('/jobs', { scriptId: 'ep1', sceneIndex: 2, prompt: longPrompt, model: 'veo-3.1-lite', duration: 10 });
  assert.equal(bad.status, 400);
  const good = await post('/jobs', { scriptId: 'ep1', sceneIndex: 2, prompt: longPrompt, model: 'veo-3.1-fast', duration: 8 });
  assert.equal(good.status, 202);
  const job = await good.json();
  assert.equal(job.state, 'done');
  assert.equal(job.cost, 0);
  assert.ok(job.preview.promptWrapped.includes('no questions'));
  const list = await (await fetch(`${base}/jobs?scriptId=ep1`)).json();
  assert.ok(list.jobs.some((j) => j.id === job.id));
});

test('short prompts and bad ids are rejected', async () => {
  assert.equal((await post('/jobs', { scriptId: 'ep1', sceneIndex: 0, prompt: 'hi' })).status, 400);
  assert.equal((await post('/jobs', { scriptId: '../evil', sceneIndex: 0, prompt: longPrompt })).status, 400);
});

test.after(async () => new Promise((resolve) => api.close(resolve)));
