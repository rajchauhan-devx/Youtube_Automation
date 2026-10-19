import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
process.env.TUBEFLOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'documentary-test-'));
process.env.GEMINI_API_KEY = 'fixture-key';
const { fixture } = await import('./motion-fixtures.mjs');
const { compileGraphic } = await import('../../server/dist/services/editing/motionPackArtifacts.js');
const { reviewGraphics } = await import('../../server/dist/services/editing/visualReview.js');
const { runPipeline } = await import('../../server/dist/services/editing/pipeline.js');
const { geminiResponseSchema } = await import('../../server/dist/services/editing/motionProvider.js');
const { saveAsset, assetFile, objectHash } = await import('../../server/dist/services/editing/repository.js');
const { motionProject, validateProject, Settings, assertDocumentaryVisuals } = await import('@tubeflow/editing-contracts');
const { z } = await import('zod');
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });
const quote = 'a bronze statue and its hand';
const design = (treatment = 'archival') => ({ sceneId: 'scene-0', kind: 'composition', title: 'Statue detail', detail: '', target: '', quote,
  position: 'top', composition: { treatment, emphasis: 'none', layers: [{ sourceSceneId: 'scene-0', bounds: { x: 0, y: 0, width: 1, height: 1 },
    useTargetCrop: false, crop: { x: 0.5, y: 0.35, width: 0.2, height: 0.2 }, fit: 'contain', motion: 'push-in', rotation: 0, delay: 0 }] } });
const response = value => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] });
function context(p, extra = {}) {
  return { signal: new AbortController().signal, maxCalls: 12, persist() {}, stage() {},
    job: { id: randomUUID(), operation: 'generate', usage: [] },
    renderPreviews: async project => [18, 36, 55].map(frame => ({ frame, file: assetFile(project.scenes[0].assetId), findings: [] })), ...extra };
}
const pass = { verdict: 'pass', reason: 'All three supplied frames keep the target clear.', bounds: null, layers: [] };

test('image-led generation rejects text-only planner output and export cannot silently lose all image layers', async () => {
  const p = await fixture('museum', false, true); p.settings.documentary = true;
  globalThis.fetch = async (_, options) => {
    const system = JSON.parse(options.body).system_instruction.parts[0].text;
    if (system.includes('Inspect each supplied image')) return response({ scenes: [{ sceneId: 'scene-0', visibleObjects: ['statue'], openArea: 'top' }] });
    return response({ graphics: [{ sceneId: 'scene-0', kind: 'counter', title: '140', detail: '', target: '', quote }] });
  };
  await assert.rejects(runPipeline(p, context(p)), /failed validation/);
  p.documentaryRequirement = { version: 1 };
  assert.throws(() => assertDocumentaryVisuals(p), /no enabled image compositions/);
  p.artifacts = [compileGraphic(p, design())];
  assert.doesNotThrow(() => assertDocumentaryVisuals(p));
  p.artifacts[0].enabled = false;
  assert.throws(() => assertDocumentaryVisuals(p), /no enabled image compositions/);
});

test('short image inserts remain eligible while duplicating the full background is rejected', async () => {
  const p = await fixture('museum', false, true); p.scenes[0].endFrame = Math.ceil(p.inputs.fps * 1.5);
  assert.equal(compileGraphic(p, design()).graphic.kind, 'composition');
  const duplicate = design(); delete duplicate.composition.layers[0].crop;
  assert.throws(() => compileGraphic(p, duplicate), /duplicat|background/i);
});

test('cinematic cutaways can fill the frame without inheriting the text safe area', async () => {
  const p = await fixture('museum', true, true), proposal = design('cinematic');
  proposal.composition.layout = 'cutaway';
  const artifact = compileGraphic(p, proposal);
  assert.deepEqual(artifact.graphic.bounds, { x: 0, y: 0, width: p.inputs.width, height: p.inputs.height });
  p.artifacts = [artifact];
  assert.equal(validateProject(p).artifacts[0].graphic.composition.layout, 'cutaway');
  const invalid = structuredClone(p);
  invalid.artifacts[0].graphic.composition.emphasis = 'focus';
  invalid.artifacts[0].graphic.target = { label: 'hand', region: { x: 0.5, y: 0.35, width: 0.09, height: 0.1 }, evidence: 'fixture', verified: true };
  assert.throws(() => validateProject(invalid), /cutaway cannot highlight/);
});

test('all treatments compile to versioned image layers; legacy nodes stay retired', async () => {
  const p = await fixture('museum', false, true);
  for (const treatment of ['archival', 'cinematic', 'map']) {
    const graphic = compileGraphic(p, design(treatment));
    p.artifacts = [graphic];
    assert.equal(validateProject(p).artifacts[0].graphic.composition.version, 1);
    assert.equal(motionProject(p).artifacts[0].graphic.composition.treatment, treatment);
  }
  const old = { ...p.artifacts[0], id: 'retired' }; delete old.graphic;
  p.artifacts.push(old);
  assert.equal(motionProject(p).artifacts.length, 1);
  assert.equal(Settings.parse({ stylePreference: '', density: 'balanced', maxProviderCalls: 40, maxGeneratedAssets: 0 }).visualReview, true);
});

test('layer dependencies survive normalization; missing assets and invalid layer crops fail', async () => {
  const p = await fixture('museum', false, true);
  const source = p.scenes[0].assetId;
  const extra = saveAsset(fs.readFileSync(assetFile(source)), { mime: 'image/png', width: 640, height: 640, alpha: false, method: 'crop', providerVersion: 'extra-layer-fixture' });
  const a = compileGraphic(p, design()); a.graphic.composition.layers[0].assetId = extra.id;
  p.artifacts = [a]; p.assetIds.push(extra.id);
  assert.ok(motionProject(p).assetIds.includes(extra.id));
  const q = structuredClone(p); q.assetIds = q.assetIds.filter(id => id !== extra.id);
  // Content-addressing may reuse identical assets; force a distinct unresolved ID.
  q.artifacts[0].graphic.composition.layers[0].assetId = 'missing-layer';
  assert.throws(() => validateProject(q), /Unresolved asset/);
  const bad = structuredClone(p); bad.artifacts[0].graphic.composition.layers[0].crop.width = 0.9;
  assert.throws(() => validateProject(bad), /Crop exceeds/);
});

test('verified detail crops cannot be attached to another scene or used without verification', async () => {
  const p = await fixture('museum', false, true), proposal = design();
  proposal.composition.layers[0].useTargetCrop = true;
  assert.throws(() => compileGraphic(p, proposal), /verified detail crop/);
  const target = { label: 'hand', region: { x: 0.50, y: 0.35, width: 0.09, height: 0.1 }, evidence: 'Known fixture hand', verified: true };
  const a = compileGraphic(p, proposal, target);
  assert.deepEqual(a.graphic.composition.layers[0].crop, target.region);
});

test('vision receives source and rendered frames, repairs placement, then reviews the new layout', async () => {
  const p = await fixture('museum', false, true); p.artifacts = [compileGraphic(p, design())];
  const ctx = context(p), layouts = [], completed = [];
  ctx.renderPreviews = async project => {
    layouts.push(structuredClone(project.artifacts[0].graphic.bounds));
    return [18, 36, 55].map(frame => ({ frame, file: assetFile(p.scenes[0].assetId), findings: [] }));
  };
  let calls = 0;
  globalThis.fetch = async (_, options) => {
    const body = JSON.parse(options.body), input = JSON.parse(body.contents[0].parts[0].text);
    assert.equal(body.contents[0].parts.filter(p => p.inlineData).length, 4);
    assert.equal(body.contents[0].parts.filter(p => p.text?.startsWith('Image ')).length, 4);
    assert.equal(input.images[0].role, 'original background reference');
    assert.ok(input.images.some(i => i.role === 'rendered composition' && i.phase === 'fully shown'));
    assert.deepEqual(input.images.filter(i => i.role === 'rendered composition').map(i => i.frame), [18, 36, 55]);
    return response(calls++ ? pass : { verdict: 'repair', reason: 'Move the insert away from the subject.',
      bounds: { x: 0.50, y: 0.07, width: 0.35, height: 0.32 }, layers: [] });
  };
  await reviewGraphics(p, ctx, 'gemini-fixture', [p.artifacts[0].id], completed, () => {});
  assert.notDeepEqual(layouts[0], layouts[1]);
  assert.equal(p.artifacts[0].visualReview.status, 'passed');
  assert.equal(p.artifacts[0].visualReview.attempts, 2);
  assert.equal(ctx.job.usage.length, 2);
  await reviewGraphics(p, ctx, 'gemini-fixture', [p.artifacts[0].id], completed, () => {});
  assert.equal(calls, 2, 'completed checkpoint does not repeat review');
});

test('rejected or unrepairable placement is hidden, not approved', async () => {
  for (const result of [ { ...pass, verdict: 'reject', reason: 'The inset covers the subject.' },
    { ...pass, verdict: 'repair', reason: 'Wrong crop.', layers: [{ id: 'invented', bounds: { x: 0, y: 0, width: 1, height: 1 }, fit: 'contain' }] } ]) {
    const p = await fixture('museum', false, true); p.artifacts = [compileGraphic(p, design())];
    globalThis.fetch = async () => response(result);
    await reviewGraphics(p, context(p), 'gemini-fixture', [p.artifacts[0].id], [], () => {});
    assert.equal(p.artifacts[0].enabled, false);
    assert.equal(p.artifacts[0].visualReview.status, 'rejected');
    assert.ok(p.diagnostics.some(d => d.code === 'VISUAL_REVIEW_REJECTED'));
  }
});

test('budget and preview failures remain explicitly unreviewed; cancellation propagates', async () => {
  const p = await fixture('museum', false, true); p.artifacts = [compileGraphic(p, design())];
  let renders = 0;
  await reviewGraphics(p, context(p, { maxCalls: 0, renderPreviews: async () => { renders++; return []; } }), 'gemini-fixture', [p.artifacts[0].id], [], () => {});
  assert.equal(renders, 0); assert.equal(p.artifacts[0].visualReview.status, 'unavailable');
  const abort = new AbortController(); abort.abort();
  await assert.rejects(reviewGraphics(p, context(p, { signal: abort.signal }), 'gemini-fixture', [p.artifacts[0].id], [], () => {}), /abort/i);
});

test('generation connects documentary planning to rendered review and checkpoint resume', async () => {
  const p = await fixture('museum', false, true); p.settings = { ...p.settings, documentary: true, treatment: 'auto', visualReview: true };
  const ctx = context(p);
  globalThis.fetch = async (_, options) => {
    const system = JSON.parse(options.body).system_instruction.parts[0].text;
    if (system.includes('Inspect each supplied image')) return response({ scenes: [{ sceneId: 'scene-0', visibleObjects: ['bronze statue'], openArea: 'top', mediaRole: 'photo' }] });
    if (system.includes('Review rendered')) return response(pass);
    if (system.includes('Design an image-led')) return response(design().composition);
    assert.equal(JSON.parse(JSON.parse(options.body).contents[0].parts[0].text).sceneGraphicsLimit, 2, 'Planning reserves calls for design/localization/review');
    const { composition, ...brief } = design();
    return response({ graphics: [brief] });
  };
  const result = await runPipeline(p, ctx);
  assert.equal(result.artifacts[0].graphic.kind, 'composition');
  assert.equal(result.artifacts[0].visualReview.status, 'passed');
  assert.equal(result.status, 'ready'); assert.equal(ctx.job.usage.length, 4);
  const resumed = await runPipeline(p, ctx);
  assert.equal(resumed.revisionId, result.revisionId); assert.equal(ctx.job.usage.length, 4);
  assert.equal(p.artifacts.length, 0);
});

test('image designer is restricted to registered still scenes and receives actionable crop retry feedback', async () => {
  const p = await fixture('museum', false, true); p.settings.documentary = true; p.settings.visualReview = true;
  let designs = 0;
  globalThis.fetch = async (_, options) => {
    const body = JSON.parse(options.body), system = body.system_instruction.parts[0].text;
    if (system.includes('Inspect each supplied image')) return response({ scenes: [{ sceneId: 'scene-0', visibleObjects: ['statue'], openArea: 'top', mediaRole: 'photo' }] });
    if (system.includes('Review rendered')) return response(pass);
    if (system.includes('Design an image-led')) {
      assert.deepEqual(body.generationConfig.responseJsonSchema.properties.layers.items.properties.sourceSceneId.enum, ['scene-0']);
      const candidate = design().composition;
      if (designs++ === 0) candidate.layers[0].useTargetCrop = true;
      else assert.match(body.contents[0].parts[0].text, /previous response failed.*useTargetCrop/);
      return response(candidate);
    }
    const { composition, ...brief } = design(); return response({ graphics: [brief] });
  };
  const ctx = context(p), result = await runPipeline(p, ctx);
  assert.equal(designs, 2);
  assert.equal(result.artifacts[0].visualReview.status, 'passed');
  assert.equal(ctx.job.usage.length, 5, 'one bounded corrective request is counted');
});

test('map planner cannot invent a source map; review-only jobs preserve composition and timing', async () => {
  const p = await fixture('museum', false, true); p.settings.documentary = true; p.settings.visualReview = false;
  globalThis.fetch = async (_, options) => {
    const system = JSON.parse(options.body).system_instruction.parts[0].text;
    if (system.includes('Inspect each supplied image')) return response({ scenes: [{ sceneId: 'scene-0', visibleObjects: ['statue'], openArea: 'top', mediaRole: 'photo' }] });
    if (system.includes('Design an image-led')) return response(design('map').composition);
    const { composition, ...brief } = design('map');
    return response({ graphics: [brief] });
  };
  await assert.rejects(runPipeline(p, context(p)), /no enabled image compositions/);
  p.artifacts = [compileGraphic(p, design())]; globalThis.fetch = async () => response(pass);
  p.diagnostics.push({ severity: 'info', code: 'ORIGINAL_TIMING', stage: 'timing', message: 'Keep this timing diagnostic.', retryable: false });
  const reviewed = await runPipeline(p, context(p, { job: { id: randomUUID(), operation: 'review', usage: [] } }));
  assert.deepEqual(reviewed.scenes, p.scenes); assert.deepEqual(reviewed.inputs, p.inputs);
  assert.deepEqual(reviewed.artifacts[0].graphic, p.artifacts[0].graphic);
  assert.equal(reviewed.artifacts[0].visualReview.status, 'passed');
  assert.ok(reviewed.diagnostics.some(d => d.code === 'ORIGINAL_TIMING'));
});

test('wire schema is provider-compatible while local validation remains strict', () => {
  const schema = z.strictObject({ text: z.string().max(2), boxes: z.array(z.number().gt(0)).max(2) });
  const wire = geminiResponseSchema(schema), json = JSON.stringify(wire);
  assert.ok(!json.includes('maxLength') && !json.includes('maxItems') && !json.includes('exclusiveMinimum'));
  assert.equal(wire.properties.boxes.items.minimum, 0);
  assert.throws(() => schema.parse({ text: 'oversized', boxes: [0, 1, 2] }));
});

test('an interrupted repair resumes with only the remaining visual assessment', async () => {
  const p = await fixture('museum', false, true); p.artifacts = [compileGraphic(p, design())];
  p.artifacts[0].visualReview = { status: 'pending', attempts: 1, frames: [18, 36, 55], reason: 'Saved first correction' };
  let calls = 0; globalThis.fetch = async () => { calls++; return response(pass); };
  await reviewGraphics(p, context(p), 'gemini-fixture', [p.artifacts[0].id], [], () => {});
  assert.equal(calls, 1); assert.equal(p.artifacts[0].visualReview.attempts, 2);
});

test('a second repair verdict terminates and rejected revisions preserve accepted graphics', async () => {
  const p = await fixture('museum', false, true); p.artifacts = [compileGraphic(p, design())];
  let calls = 0;
  globalThis.fetch = async () => { calls++; return response({ ...pass, verdict: 'repair', reason: 'Still covering the subject.',
    bounds: { x: 0.5, y: 0.07, width: 0.35, height: 0.32 } }); };
  await reviewGraphics(p, context(p), 'gemini-fixture', [p.artifacts[0].id], [], () => {});
  assert.equal(calls, 2); assert.equal(p.artifacts[0].visualReview.status, 'rejected'); assert.equal(p.artifacts[0].enabled, false);
  p.artifacts[0].enabled = true; delete p.artifacts[0].visualReview;
  p.settings.documentary = true; p.settings.visualReview = true;
  const original = structuredClone(p.artifacts[0]);
  globalThis.fetch = async (_, options) => {
    const system = JSON.parse(options.body).system_instruction.parts[0].text;
    if (system.includes('Inspect each supplied image')) return response({ scenes: [{ sceneId: 'scene-0', visibleObjects: ['statue'], openArea: 'top' }] });
    if (system.includes('Design an image-led')) return response(design().composition);
    if (system.includes('Review rendered')) return response({ ...pass, verdict: 'reject', reason: 'Replacement obscures the main subject.' });
    const { composition, ...brief } = design(); return response({ graphics: [brief] });
  };
  const revised = await runPipeline(p, context(p, { job: { id: randomUUID(), operation: 'revise', artifactId: original.id, instruction: 'Revise placement', usage: [] } }));
  assert.deepEqual(revised.artifacts[0], original); assert.equal(revised.status, 'partial');
});
