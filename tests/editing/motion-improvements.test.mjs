import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.TUBEFLOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-improvements-'));
const { narrationCue } = await import('../../server/dist/services/editing/narrationCue.js');
const { compileGraphic } = await import('../../server/dist/services/editing/motionPackArtifacts.js');
const { fixture } = await import('./motion-fixtures.mjs');
const { imageMotionAt } = await import('@tubeflow/video-composition');
const { DocumentaryComposition, ImageMotion } = await import('@tubeflow/editing-contracts');

test('phrase cues skip earlier occurrences of the first word and require whole words', () => {
  const tokens = 'a sailor saw a bronze statue'.split(' ').map((text, index) => ({ text, start: index * 0.25, end: (index + 1) * 0.25 }));
  assert.deepEqual(narrationCue(tokens, 'a bronze statue'), { start: 0.75, end: 1.5 });
  assert.equal(narrationCue(tokens, 'a bronze stat'), undefined);
  assert.equal(narrationCue(tokens, 'a statue'), undefined);
  assert.equal(narrationCue(tokens, '...'), undefined);
});

test('phrase cues support punctuation, case, Hindi, and phrase alignment tokens', () => {
  assert.deepEqual(narrationCue([{ text: 'Then: A BRONZE', start: 1, end: 2 }, { text: 'statue.', start: 2, end: 3 }], 'a bronze statue'), { start: 1, end: 3 });
  const tokens = ['पानी', 'ठंडा', 'है।', 'पानी', 'गर्म', 'होता', 'है।'].map((text, i) => ({ text, start: i, end: i + 1 }));
  assert.deepEqual(narrationCue(tokens, 'पानी गर्म होता है'), { start: 3, end: 7 });
});

test('compiled graphics anchor to the complete spoken quote within their own scene', async () => {
  const p = await fixture('museum', false, true);
  p.alignment.tokens = 'a sailor saw a bronze statue'.split(' ').map((text, i) => ({ id: `cue-${i}`, text, start: i * 0.25, end: (i + 1) * 0.25 }));
  p.scenes[0].narrativeRefs = p.alignment.tokens.map(t => t.id);
  const proposal = { sceneId: 'scene-0', kind: 'badge', title: 'Bronze statue', detail: '', target: '', quote: 'a bronze statue' };
  for (const mode of ['word', 'phrase']) {
    p.alignment.mode = mode;
    assert.equal(compileGraphic(p, proposal).startFrame, Math.round(0.75 * p.inputs.fps));
  }
  p.alignment.mode = 'approximate';
  assert.equal(compileGraphic(p, proposal).startFrame, 0, 'approximate timing keeps a conservative scene-start cue');
  p.scenes[0].narrativeRefs = p.alignment.tokens.slice(0, 3).map(t => t.id);
  assert.throws(() => compileGraphic(p, proposal), /matching narration evidence/);
});

const layer = { id: 'image-0', assetId: 'source', bounds: { x: 0, y: 0, width: 1, height: 1 }, fit: 'cover', motion: 'push-in', delay: 0, rotation: 0 };
test('new camera moves have bounded, distinct start/end states and tunable focus', () => {
  const push = imageMotionAt({ ...layer, strength: 0.1 }, 1);
  assert.equal(push.scale, 1.1);
  assert.equal(imageMotionAt({ ...layer, motion: 'pull-out', strength: 0.1 }, 0).scale, 1.1);
  assert.equal(imageMotionAt({ ...layer, motion: 'pull-out', strength: 0.1 }, 1).scale, 1);
  assert.ok(imageMotionAt({ ...layer, motion: 'drift-up' }, 1).y < 0);
  assert.ok(imageMotionAt({ ...layer, motion: 'drift-down' }, 1).y > 0);
  const diagonal = imageMotionAt({ ...layer, motion: 'diagonal-in' }, 1);
  assert.ok(diagonal.scale > 1 && diagonal.x < 0 && diagonal.y < 0);
  const focus = imageMotionAt({ ...layer, motion: 'focus-in', focus: { x: 0.8, y: 0.2 } }, 1);
  assert.equal(focus.originX, 0.8); assert.equal(focus.originY, 0.2);
  for (const motion of ImageMotion.options) {
    const still = imageMotionAt({ ...layer, motion, strength: 0 }, 1);
    assert.equal(still.scale, 1); assert.equal(Math.abs(still.x), 0); assert.equal(Math.abs(still.y), 0);
    assert.deepEqual(imageMotionAt({ ...layer, motion }, -1), imageMotionAt({ ...layer, motion }, 0));
    assert.deepEqual(imageMotionAt({ ...layer, motion }, 2), imageMotionAt({ ...layer, motion }, 1));
  }
});

test('old image layers remain valid and invalid motion parameters fail validation', () => {
  const composition = { version: 1, treatment: 'cinematic', emphasis: 'none', layers: [layer] };
  assert.deepEqual(DocumentaryComposition.parse(composition), composition);
  for (const patch of [{ strength: 0.21 }, { strength: -0.1 }, { focus: { x: 1.1, y: 0.5 } }, { motion: 'unknown' }]) {
    assert.equal(DocumentaryComposition.safeParse({ ...composition, layers: [{ ...layer, ...patch }] }).success, false);
  }
});

test.after(() => fs.rmSync(process.env.TUBEFLOW_DATA_DIR, { recursive: true, force: true }));
