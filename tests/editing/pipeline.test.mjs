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
const { compileGraphic } = await import('../../server/dist/services/editing/motionPackArtifacts.js');
const { createMotionCaptions } = await import('../../server/dist/services/editing/motionCaptions.js');
const { targetMostlyVisible } = await import('@tubeflow/video-composition');
const { z } = await import('zod');
const { objectHash } = await import('../../server/dist/services/editing/repository.js');
const originalFetch = globalThis.fetch;
const response = value => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 } });
const inventory = p => ({ scenes: p.scenes.map(s => ({ sceneId: s.id, visibleObjects: ['bronze statue'], openArea: 'bottom' })) });
const isInspection = options => JSON.parse(options.body).system_instruction.parts[0].text.includes('Inspect each supplied image');
function context(p, extra = {}) {
  const now = new Date().toISOString();
  return { signal: new AbortController().signal, maxCalls: 40, persist() {}, stage() {},
    job: { id: randomUUID(), projectId: p.id, revisionId: p.revisionId, operation: 'generate', inputHash: objectHash(p), idempotencyKey: randomUUID(), state: 'running', stage: 'start', attempts: 1, completed: 0, total: 0, createdAt: now, updatedAt: now, stages: {}, usage: [], ...extra } };
}
const proposal = { sceneId: 'scene-0', kind: 'title', title: 'Bronze statue', detail: '', target: '', quote: 'a bronze statue and its hand' };
test.afterEach(() => { globalThis.fetch = originalFetch; });
test('scene graphics use saved timing and a batched visual inventory', async () => {
  const p = await fixture('museum', false, true), ctx = context(p);
  globalThis.fetch = async (url, options) => {
    assert.match(url, /^https:\/\/generativelanguage.googleapis.com/);
    assert.equal(options.headers['x-goog-api-key'], 'fixture-key');
    if (isInspection(options)) {
      assert.equal(JSON.parse(options.body).contents[0].parts.filter(part => part.inlineData).length, p.scenes.length);
      return response(inventory(p));
    }
    assert.deepEqual(JSON.parse(options.body).contents[0].parts[0].text.includes('bronze statue'), true);
    return response({ graphics: [proposal] });
  };
  const result = await runPipeline(p, ctx);
  assert.equal(result.status, 'ready'); assert.equal(ctx.job.usage.length, 2);
  assert.equal(result.artifacts[0].graphic.kind, 'title'); assert.deepEqual(result.artifacts[0].nodes, []);
  assert.deepEqual(result.inputs, p.inputs); assert.equal(result.scenes.at(-1).endFrame, p.inputs.durationFrames);
  assert.equal(p.artifacts.length, 0, 'input revision is immutable');
  const again = await runPipeline(p, ctx);
  assert.equal(again.revisionId, result.revisionId); assert.equal(ctx.job.usage.length, 2, 'checkpoint avoids repeated provider work');
});
test('a clean scene stays clean and graphics generation preserves separate captions', async () => {
  const source = await fixture('museum', false, true);
  const captioned = await createMotionCaptions(source, new AbortController().signal);
  globalThis.fetch = async (_, options) => isInspection(options) ? response(inventory(captioned)) : response({ graphics: [], theme: 'modern' });
  const result = await runPipeline(captioned, context(captioned));
  assert.equal(result.artifacts.filter(a => a.graphic.kind !== 'caption').length, 0);
  assert.equal(result.artifacts.filter(a => a.graphic.kind === 'caption').length, captioned.artifacts.length);
  assert.equal(result.sceneOutcomes[0].state, 'not_needed');
  assert.equal(result.style.colors.accent, '#69d6ec');
});
test('spotlight requires both a valid box and independent crop verification', async () => {
  const p = await fixture('museum', false, true), ctx = context(p);
  globalThis.fetch = async (_, options) => {
    const body = JSON.parse(options.body), system = body.system_instruction.parts[0].text;
    if (isInspection(options)) return response(inventory(p));
    if (system.includes('documentary motion')) return response({ graphics: [{ ...proposal, kind: 'spotlight', title: 'Unverified identity', target: 'bronze statue' }] });
    if (system.includes('Locate only')) return response({ found: true, box: [350, 500, 450, 590], description: 'Bronze statue' });
    assert.equal(body.contents[0].parts.filter(p => p.inlineData).length, 2);
    return response({ matches: true, unambiguous: true, evidence: 'The crop shows the requested bronze statue.' });
  };
  const result = await runPipeline(p, ctx);
  assert.equal(result.status, 'ready'); assert.equal(ctx.job.usage.length, 4);
  assert.equal(result.artifacts[0].graphic.target.verified, true);
  assert.equal(result.artifacts[0].graphic.title, 'Bronze statue');
  assert.equal(result.artifacts[0].graphic.detail, '');
  assert.deepEqual(result.artifacts[0].graphic.target.region, decodeBox([350, 500, 450, 590]));
});
test('uncertain objects leave the scene clean without guessed pointers or title fallback', async () => {
  const p = await fixture('museum', false, true), ctx = context(p);
  globalThis.fetch = async (_, options) => isInspection(options) ? response(inventory(p))
    : JSON.parse(options.body).system_instruction.parts[0].text.includes('documentary motion')
      ? response({ graphics: [{ ...proposal, kind: 'spotlight', target: 'poison pot' }] })
      : response({ found: false, box: null, description: 'No poison pot is visible.' });
  const result = await runPipeline(p, ctx);
  assert.equal(result.status, 'partial'); assert.equal(result.artifacts.length, 0);
  assert.ok(result.diagnostics.some(d => d.code === 'GRAPHIC_SKIPPED' && /Could not locate/.test(d.message)));
  assert.ok(!result.diagnostics.some(d => d.code === 'SPOTLIGHT_FALLBACK'));
  assert.deepEqual(result.inputs, p.inputs);
});
test('short scenes keep a readable title by dropping optional detail', async () => {
  const p = await fixture('museum', false, true);
  p.scenes[0].endFrame = Math.round(2.73 * p.inputs.fps);
  const graphic = compileGraphic(p, { ...proposal, detail: 'A long explanatory subtitle that would not fit this short scene.' });
  assert.equal(graphic.graphic.kind, 'title');
  assert.equal(graphic.graphic.detail, '');
  assert.ok(graphic.endFrame <= p.scenes[0].endFrame);
  p.scenes[0].endFrame = Math.round(2.3 * p.inputs.fps);
  assert.throws(() => compileGraphic(p, proposal), /too short/);
});
test('invalid JSON has exactly one retry; every request counts against budget', async () => {
  const p = await fixture('museum', false, true), ctx = context(p);
  let calls = 0; globalThis.fetch = async (_, options) => { calls++; return isInspection(options) ? response(inventory(p)) : response({ broken: true }); };
  await assert.rejects(runPipeline(p, ctx), /failed validation/);
  assert.equal(calls, 3); assert.equal(ctx.job.usage.length, 3);
  assert.deepEqual(p.artifacts, [], 'a failed plan cannot publish fake skipped scenes');
  const budgetCtx = context(p); budgetCtx.maxCalls = 2;
  calls = 0; await assert.rejects(runPipeline(p, budgetCtx), /budget is exhausted/); assert.equal(calls, 2);
});
test('provider overload fails the job with a useful message instead of eleven invalid-plan scenes', async () => {
  const p = await fixture('museum', false, true), ctx = context(p);
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('', { status: 503 }); };
  await assert.rejects(runPipeline(p, ctx), /HTTP 503.*temporarily overloaded/);
  assert.equal(calls, 2);
  assert.equal(ctx.job.usage.length, 2);
});
test('provider timeout is reported as model overload rather than invalid planning JSON', async () => {
  const p = await fixture('museum', false, true), ctx = context(p);
  globalThis.fetch = async () => { throw new DOMException('The operation timed out', 'TimeoutError'); };
  await assert.rejects(runPipeline(p, ctx), /did not respond before the timeout/);
  assert.equal(ctx.job.usage.length, 2);
});
test('failed individual regeneration preserves the accepted graphic', async () => {
  const p = await fixture(), ctx = context(p, { operation: 'revise', artifactId: 'explanation', instruction: 'Reconsider this graphic' });
  globalThis.fetch = async (_, options) => isInspection(options) ? response(inventory(p)) : response({ graphics: [{ ...proposal, quote: 'an invented quote absent from the narration' }] });
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
test('spotlight targets near a frame edge remain eligible when mostly visible', () => {
  assert.equal(targetMostlyVisible({ x: 830, y: 1000, width: 300, height: 100 }, 1080, 1920), true);
  assert.equal(targetMostlyVisible({ x: 1010, y: 1000, width: 300, height: 100 }, 1080, 1920), false);
});
