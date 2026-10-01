import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
process.env.TUBEFLOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-motion-'));
process.env.GEMINI_API_KEY = 'fixture-key';
const { fixture } = await import('./motion-fixtures.mjs');
const { MotionGraphic, CustomDesign, validateProject } = await import('@tubeflow/editing-contracts');
const { customValue, graphicIssues } = await import('@tubeflow/video-composition');
const { compileGraphic } = await import('../../server/dist/services/editing/motionPackArtifacts.js');
const { runPipeline } = await import('../../server/dist/services/editing/pipeline.js');
const { previewFrames, exportVideo } = await import('../../server/dist/services/editing/renderer.js');
const originalFetch = globalThis.fetch;
const quote = 'a bronze statue and its hand';
const proposal = { sceneId: 'scene-0', kind: 'custom', title: 'Material diagram', detail: 'Explain the material', target: '', quote };
const element = (more = {}) => ({ id: 'label', kind: 'text', bounds: { x: 0.1, y: 0.1, width: 0.8, height: 0.4 }, text: 'Bronze', evidence: quote,
  color: '#ffffff', fill: null, fontSize: 0.04, align: 'center', strokeWidth: 0.005, points: [], tracks: [], ...more });
const design = () => ({ version: 1, name: 'Material explanation', elements: [
  element({ id: 'panel', kind: 'rect', text: '', fill: '#172033', bounds: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 } }),
  element({ tracks: [{ property: 'opacity', keyframes: [{ at: 0, value: 0, easing: 'linear' }, { at: 0.1, value: 1, easing: 'smooth' }, { at: 0.9, value: 1, easing: 'linear' }, { at: 1, value: 0, easing: 'smooth' }] }] }),
  element({ id: 'line', kind: 'path', text: '', bounds: { x: 0.1, y: 0.65, width: 0.8, height: 0.1 }, points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }], tracks: [{ property: 'draw', keyframes: [{ at: 0, value: 0, easing: 'linear' }, { at: 0.5, value: 1, easing: 'smooth' }] }] }),
] });
function context(p, extra = {}) {
  return { signal: new AbortController().signal, maxCalls: 40, persist() {}, stage() {}, job: { id: randomUUID(), projectId: p.id, operation: 'generate', usage: [], ...extra } };
}
const response = value => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] });
const mock = (p, customResponse) => async (_, options) => {
  const body = JSON.parse(options.body), system = body.system_instruction.parts[0].text;
  if (system.includes('Inspect each supplied image')) return response({ scenes: p.scenes.map(s => ({ sceneId: s.id, visibleObjects: ['bronze statue'], openArea: 'bottom' })) });
  if (system.includes('documentary motion graphics editor')) return response({ graphics: [proposal] });
  assert.ok(system.includes('Design a custom documentary'));
  return response(customResponse(JSON.parse(body.contents[0].parts[0].text)));
};
test.afterEach(() => { globalThis.fetch = originalFetch; });
test('custom specs reject code, unknown operations, duplicate IDs and invalid animation', () => {
  const graphic = { kind: 'custom', title: 'Diagram', detail: '', bounds: { x: 0, y: 0, width: 100, height: 100 }, design: design() };
  assert.ok(MotionGraphic.safeParse(graphic).success);
  assert.ok(!MotionGraphic.safeParse({ ...graphic, design: undefined }).success);
  assert.ok(!MotionGraphic.safeParse({ ...graphic, kind: 'title' }).success);
  for (const bad of [
    { ...design(), code: 'alert(1)' },
    { ...design(), elements: [element({ kind: 'html' })] },
    { ...design(), elements: [element(), element()] },
    { ...design(), elements: [element({ tracks: [{ property: 'opacity', keyframes: [{ at: 0.5, value: 1, easing: 'linear' }, { at: 0.4, value: 0, easing: 'linear' }] }] })] },
    { ...design(), elements: [element({ tracks: [{ property: 'x', keyframes: [{ at: 0, value: 0, easing: 'linear' }, { at: 1, value: 1, easing: 'linear' }] }] })] },
  ]) assert.ok(!MotionGraphic.safeParse({ ...graphic, design: bad }).success);
});
test('animation evaluates deterministically across seeks and clamps outside keyframes', () => {
  const e = design().elements[1];
  assert.equal(customValue(e, 'opacity', -1, 1), 0);
  assert.equal(customValue(e, 'opacity', 0.05, 1), 0.5);
  assert.equal(customValue(e, 'opacity', 0.95, 1).toFixed(3), '0.500');
  assert.equal(customValue(e, 'opacity', 0.05, 1), 0.5);
  assert.equal(customValue(e, 'opacity', 2, 1), 0);
});
test('saved custom graphics enforce evidence, readable layout, approved images and transformed bounds', async () => {
  const p = await fixture('museum', false, true);
  const compile = d => compileGraphic(p, proposal, undefined, undefined, CustomDesign.parse(d));
  assert.throws(() => compile({ ...design(), elements: [element({ evidence: 'invented source' })] }), /evidence/);
  assert.throws(() => compile({ ...design(), elements: [element({ text: 'A very long label '.repeat(8), bounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.05 } })] }), /space|reading/);
  assert.throws(() => compile({ ...design(), elements: [element({ tracks: [{ property: 'opacity', keyframes: [{ at: 0, value: 0, easing: 'linear' }, { at: 1, value: 0, easing: 'linear' }] }] })] }), /readable/);
  const artifact = compile(design());
  p.artifacts = [artifact]; validateProject(p);
  artifact.graphic.design.elements[1].text = '500 people';
  assert.throws(() => validateProject(p), /Unsupported number/);
  artifact.graphic.design = design();
  artifact.graphic.design.elements[1].assetId = 'unknown';
  assert.throws(() => validateProject(p));
  artifact.graphic.design = design();
  artifact.graphic.design.elements[0].tracks = [{ property: 'scale', keyframes: [{ at: 0, value: 1, easing: 'linear' }, { at: 1, value: 2, easing: 'smooth' }] }];
  assert.ok(graphicIssues(p, artifact, { width: 640, height: 640 }).some(issue => /transformed/.test(issue)));
});
test('custom generation repairs once, renders previews, exports and resumes without new AI calls', async () => {
  const p = await fixture('museum', false, true), ctx = context(p);
  let requests = 0;
  globalThis.fetch = mock(p, input => {
    requests++;
    assert.equal(input.graphicArea.height, p.inputs.height * 0.42);
    if (requests === 1) return { ...design(), elements: [element({ evidence: 'invented source' })] };
    assert.match(input.errors, /evidence/);
    return design();
  });
  const result = await runPipeline(p, ctx);
  assert.equal(result.status, 'ready');
  assert.equal(result.artifacts[0].graphic.kind, 'custom');
  assert.equal(requests, 2); assert.equal(ctx.job.usage.length, 4);
  assert.deepEqual(ctx.job.usage.map(u => u.operation), ['inspect-scenes', 'plan-graphics', 'design-custom-graphic', 'repair-custom-graphic']);
  const again = await runPipeline(p, ctx);
  assert.deepEqual(again.artifacts, result.artifacts); assert.equal(requests, 2);
  const newContext = context(p);
  const reused = await runPipeline(p, newContext);
  assert.deepEqual(reused.artifacts, result.artifacts);
  assert.equal(requests, 2, 'accepted designs are cached across generation jobs');
  assert.equal(newContext.job.usage.length, 2, 'only inspection and planning need provider calls on cache hit');
  const previews = await previewFrames(result, ctx.signal, result.artifacts[0].id);
  assert.ok(previews.length >= 3); assert.ok(previews.every(p => !p.findings.length && fs.existsSync(p.file)));
  const url = await exportVideo(result, randomUUID(), ctx.signal, () => {});
  assert.match(url, /video.mp4$/);
});
test('portrait Hindi custom graphics render using the same engine', async () => {
  const p = await fixture('science', true, true);
  const hindiQuote = 'पानी गर्म होता है।';
  const d = { ...design(), name: 'पानी', elements: [element({ text: 'पानी', evidence: hindiQuote })] };
  p.artifacts = [compileGraphic(p, { ...proposal, quote: hindiQuote }, undefined, undefined, d)];
  validateProject(p);
  const previews = await previewFrames(p, new AbortController().signal);
  assert.ok(previews.every(p => !p.findings.length));
});
test('two invalid designs preserve the old revision; budget exhaustion stops immediately', async () => {
  const p = await fixture(), old = structuredClone(p.artifacts);
  let requests = 0;
  globalThis.fetch = mock(p, () => { requests++; return { ...design(), elements: [element({ evidence: 'invented' })] }; });
  const ctx = context(p, { operation: 'revise', artifactId: 'explanation', instruction: 'Create a diagram' });
  const result = await runPipeline(p, ctx);
  assert.equal(result.status, 'partial'); assert.equal(requests, 2); assert.deepEqual(result.artifacts, old);
  const budget = context(p); budget.maxCalls = 2;
  await assert.rejects(runPipeline(p, budget), /budget is exhausted/);
  assert.equal(budget.job.usage.length, 2);
});
