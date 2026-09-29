import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.TUBEFLOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-timing-'));
const { fixture } = await import('./motion-fixtures.mjs');
const { align, mapScenes } = await import('../../server/dist/services/editing/timing.js');
test('measured narration scene timing requires no external alignment daemon', async () => {
  const p = await fixture('museum', false, true);
  p.inputs.sceneTiming = [{ sceneId: 'scene-0', text: p.inputs.narrationText, start: 0, end: 3, promptIndex: 0 }];
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Unexpected external dependency'); };
  try {
    p.alignment = await align(p, new AbortController().signal);
    assert.equal(p.alignment.mode, 'phrase'); assert.equal(p.alignment.provider, 'tts-scene-samples');
    assert.equal(mapScenes(p).at(-1).endFrame, p.inputs.durationFrames);
  } finally { globalThis.fetch = original; }
});
test('unmeasured timing is explicitly approximate and spans the complete audio', async () => {
  const p = await fixture('museum', false, true);
  const alignment = await align(p, new AbortController().signal);
  assert.equal(alignment.mode, 'approximate');
  assert.equal(alignment.tokens[0].start, 0); assert.equal(alignment.tokens.at(-1).end, 3);
  assert.equal(mapScenes(p)[0].startFrame, 0); assert.equal(mapScenes(p).at(-1).endFrame, 72);
});
