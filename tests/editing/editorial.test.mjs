import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
process.env.TUBEFLOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'editorial-'));
process.env.GEMINI_API_KEY = 'fixture-key';
const { fixture } = await import('./motion-fixtures.mjs');
const { compileEditorial } = await import('../../server/dist/services/editing/editorial.js');
const { isolateMotionAsset } = await import('../../server/dist/services/editing/motionAssets.js');
const { verifySourceBeat } = await import('../../server/dist/services/editing/sourceEvidence.js');
const { motionJson } = await import('../../server/dist/services/editing/motionProvider.js');
const { DocumentaryComposition, motionProject } = await import('@tubeflow/editing-contracts');
const { z } = await import('zod');
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });
test.after(() => fs.rmSync(process.env.TUBEFLOW_DATA_DIR, { recursive: true, force: true }));
const ctx = () => ({ signal: new AbortController().signal, maxCalls: 8, job: { usage: [] }, persist() {}, stage() {} });
async function story(text) {
  const p = await fixture('museum', true, true);
  p.alignment.tokens = [{ id: 'cue', text, start: 0, end: 3 }];
  p.scenes[0].narrativeRefs = ['cue']; p.scenes[0].startFrame = 0; p.scenes[0].endFrame = p.inputs.fps * 4;
  return p;
}
const proposal = (text, template = 'impact') => ({ sceneId: 'scene-0', kind: 'composition', title: 'Editorial beat', detail: '', target: '', quote: text,
  sequence: { template, headline: 'The scale', kicker: '', facts: [{ value: '6', label: 'kilometres' }], direction: 'horizontal', disclosure: '' } });

test('editorial sequences require exact spoken values and reject invented display numbers', async () => {
  const text = 'A 6 kilometre ramp carried the load.', p = await story(text);
  const a = await compileEditorial(p, proposal(text), ctx());
  assert.equal(a.graphic.composition.layers.length, 0);
  assert.equal(a.graphic.composition.editorial.template, 'impact');
  const bad = proposal(text); bad.sequence.facts[0].value = '60';
  await assert.rejects(compileEditorial(p, bad, ctx()), /Unsupported display value/);
  bad.sequence.facts[0] = { value: '6', label: 'kilometres and 90 tonnes' };
  await assert.rejects(compileEditorial(p, bad, ctx()), /Unsupported display value/);
});
test('mechanism and incline templates cannot be assigned to unrelated narration', async () => {
  const text = 'A 6 kilometre road passes through the landscape.', p = await story(text);
  await assert.rejects(compileEditorial(p, proposal(text, 'assembly'), ctx()), /explicitly about joints/);
  const incline = proposal(text, 'process'); incline.sequence.direction = 'incline';
  await assert.rejects(compileEditorial(p, incline, ctx()), /explicitly narrated ramp/);
});
test('empty image compositions remain invalid; editorial recipes cannot hide photographic layers', () => {
  const base = { version: 1, treatment: 'cinematic', layout: 'cutaway', emphasis: 'none', layers: [] };
  assert.equal(DocumentaryComposition.safeParse(base).success, false);
  assert.equal(DocumentaryComposition.safeParse({ ...base, editorial: proposal('quote').sequence }).success, true);
});
test('chroma isolation preserves the actual subject and refuses opaque photographic cards', async () => {
  const size = 64, data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, subject = x > 20 && x < 43 && y > 20 && y < 43;
    data.set(subject ? [95, 85, 70, 255] : [255, 0, 255, 255], i);
  }
  const png = await sharp(data, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
  const result = await isolateMotionAsset(png), raw = await sharp(result.bytes).ensureAlpha().raw().toBuffer();
  assert.equal(raw[3], 0); assert.equal(raw[(32 * size + 32) * 4 + 3], 255);
  const photo = await sharp({ create: { width: size, height: size, channels: 4, background: '#554433' } }).png().toBuffer();
  await assert.rejects(isolateMotionAsset(photo), /rectangular photo/);
});
test('source evidence rejection is independent of a misleading graphic name', async () => {
  globalThis.fetch = async (_, options) => {
    const body = JSON.parse(options.body), data = JSON.parse(body.contents[0].parts[0].text);
    assert.equal(data.intent, undefined); assert.equal(data.graphic, undefined);
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ visibleContent: 'Two men inspecting plans.', directSupport: false, reason: 'No stone joint is visible.' }) }] } }] });
  };
  await assert.rejects(verifySourceBeat(ctx(), 'gemini-fixture', 'data:image/png;base64,eA==', 'Interlocking stone joints fit together.'), /No stone joint/);
});
test('motion review sends actual video with temporal sampling rather than only still frames', async () => {
  globalThis.fetch = async (_, options) => {
    const body = JSON.parse(options.body), part = body.contents[0].parts.find(p => p.inlineData?.mimeType === 'video/mp4');
    assert.equal(part.videoMetadata.fps, 4); assert.equal(part.inlineData.data, 'eA==');
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }] });
  };
  assert.deepEqual(await motionJson(ctx(), 'gemini-fixture', 'review-motion', z.object({ ok: z.boolean() }), 'Review the actual motion.', {}, ['data:video/mp4;base64,eA==']), { ok: true });
});
