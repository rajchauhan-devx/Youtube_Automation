import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
process.env.TUBEFLOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-pipeline-'));
process.env.GEMINI_API_KEY = 'fixture-key';
const { fixture } = await import('./motion-fixtures.mjs');
const { runPipeline, decodeBox } = await import('../../server/dist/services/editing/pipeline.js');
const { motionJson } = await import('../../server/dist/services/editing/motionProvider.js');
const { z } = await import('zod');
const { objectHash } = await import('../../server/dist/services/editing/repository.js');
const originalFetch = globalThis.fetch;
const response = value => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 } });
function context(p, extra = {}) {
  const now = new Date().toISOString();
  return { signal: new AbortController().signal, maxCalls: 40, persist() {}, stage() {},
    job: { id: randomUUID(), projectId: p.id, revisionId: p.revisionId, operation: 'generate', inputHash: objectHash(p), idempotencyKey: randomUUID(), state: 'running', stage: 'start', attempts: 1, completed: 0, total: 0, createdAt: now, updatedAt: now, stages: {}, usage: [], ...extra } };
}
const proposal = { sceneId: 'scene-0', kind: 'title', title: 'Bronze statue', detail: '', target: '', quote: 'a bronze statue and its hand' };
test.afterEach(() => { globalThis.fetch = originalFetch; });
test('scene graphics use saved timing and need only one planning request', async () => {
  const p = await fixture('museum', false, true), ctx = context(p);
  globalThis.fetch = async (url, options) => {
    assert.match(url, /^https:\/\/generativelanguage.googleapis.com/);
    assert.equal(options.headers['x-goog-api-key'], 'fixture-key');
    return response({ graphics: [proposal] });
  };
  const result = await runPipeline(p, ctx);
  assert.equal(result.status, 'ready'); assert.equal(ctx.job.usage.length, 1);
  assert.equal(result.artifacts[0].graphic.kind, 'title'); assert.deepEqual(result.artifacts[0].nodes, []);
  assert.deepEqual(result.inputs, p.inputs); assert.equal(result.scenes.at(-1).endFrame, p.inputs.durationFrames);
  assert.equal(p.artifacts.length, 0, 'input revision is immutable');
  const again = await runPipeline(p, ctx);
  assert.equal(again.revisionId, result.revisionId); assert.equal(ctx.job.usage.length, 1, 'checkpoint avoids repeated provider work');
});
test('spotlight requires both a valid box and independent crop verification', async () => {
  const p = await fixture('museum', false, true), ctx = context(p);
  globalThis.fetch = async (_, options) => {
    const body = JSON.parse(options.body), system = body.system_instruction.parts[0].text;
    if (system.includes('documentary motion')) return response({ graphics: [{ ...proposal, kind: 'spotlight', target: 'bronze statue' }] });
    if (system.includes('Locate only')) return response({ found: true, box: [350, 500, 450, 590], description: 'Bronze statue' });
    assert.equal(body.contents[0].parts.filter(p => p.inlineData).length, 2);
    return response({ matches: true, unambiguous: true, evidence: 'The crop shows the requested bronze statue.' });
  };
  const result = await runPipeline(p, ctx);
  assert.equal(result.status, 'ready'); assert.equal(ctx.job.usage.length, 3);
  assert.equal(result.artifacts[0].graphic.target.verified, true);
  assert.deepEqual(result.artifacts[0].graphic.target.region, decodeBox([350, 500, 450, 590]));
});
test('uncertain objects are skipped explicitly without subtitles or guessed titles', async () => {
  const p = await fixture('museum', false, true), ctx = context(p);
  globalThis.fetch = async (_, options) => JSON.parse(options.body).system_instruction.parts[0].text.includes('documentary motion')
    ? response({ graphics: [{ ...proposal, kind: 'spotlight', target: 'poison pot' }] })
    : response({ found: false, box: null, description: 'No poison pot is visible.' });
  const result = await runPipeline(p, ctx);
  assert.equal(result.status, 'partial'); assert.deepEqual(result.artifacts, []);
  assert.match(result.diagnostics.find(d => d.code === 'GRAPHIC_SKIPPED').message, /poison pot/);
  assert.deepEqual(result.inputs, p.inputs);
});
test('invalid JSON has exactly one retry; every request counts against budget', async () => {
  const p = await fixture('museum', false, true), ctx = context(p);
  let calls = 0; globalThis.fetch = async () => { calls++; return response({ broken: true }); };
  const result = await runPipeline(p, ctx);
  assert.equal(calls, 2); assert.equal(ctx.job.usage.length, 2); assert.equal(result.status, 'partial');
  const budgetCtx = context(p); budgetCtx.maxCalls = 1;
  calls = 0; await runPipeline(p, budgetCtx); assert.equal(calls, 1);
});
test('failed individual regeneration preserves the accepted graphic', async () => {
  const p = await fixture(), ctx = context(p, { operation: 'revise', artifactId: 'explanation', instruction: 'Reconsider this graphic' });
  globalThis.fetch = async () => response({ graphics: [{ ...proposal, quote: 'an invented quote absent from the narration' }] });
  const result = await runPipeline(p, ctx);
  assert.deepEqual(result.artifacts, p.artifacts); assert.equal(result.status, 'partial');
});
test('account errors are not retried and cancellation propagates', async () => {
  const p = await fixture('museum', false, true), ctx = context(p);
  let calls = 0; globalThis.fetch = async () => { calls++; return new Response('', { status: 403 }); };
  await assert.rejects(runPipeline(p, ctx), /HTTP 403/); assert.equal(calls, 1);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(motionJson({ ...ctx, signal: controller.signal }, 'gemini-fixture', 'test', z.object({}), 'test', {}), /abort/i);
});
test('inverted, empty and out-of-range boxes fail validation', () => {
  assert.throws(() => decodeBox([500, 500, 400, 600]));
  assert.throws(() => decodeBox([0, 0, 0, 0]));
  assert.throws(() => decodeBox([-1, 0, 300, 400]));
});
