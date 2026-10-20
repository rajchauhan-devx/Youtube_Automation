import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'production-improvements-')); process.env.TUBEFLOW_DATA_DIR = directory;
const { fixture } = await import('./motion-fixtures.mjs');
const { measuredTokens } = await import('../../server/dist/services/editing/wordAlignment.js');
const { align } = await import('../../server/dist/services/editing/timing.js');
const { createMotionCaptions } = await import('../../server/dist/services/editing/motionCaptions.js');
const { alignProject } = await import('../../server/dist/services/editing/alignProject.js');
const { objectHash, atomic, projectDir } = await import('../../server/dist/services/editing/repository.js');
const { saveMotionStyle, applyMotionStyle, listMotionStyles } = await import('../../server/dist/services/editing/motionStyles.js');
const { compileGraphic } = await import('../../server/dist/services/editing/motionPackArtifacts.js');
const { DocumentaryComposition, validateProject } = await import('@tubeflow/editing-contracts');

test('measured word timing requires every original word and rejects guesses, mismatches and overlaps', async () => {
  const p = await fixture('museum', false, true);
  const output = { provider: 'whisperx', version: 'fixture', words: p.inputs.narrationText.split(/\s+/u).map((word, i) => ({ word, start: i * 0.12, end: i * 0.12 + 0.1, score: 0.9 })) };
  const aligned = measuredTokens(p, output); assert.equal(aligned.mode, 'word'); assert.equal(aligned.tokens[1].start, 0.12);
  assert.equal(p.inputs.narrationText.slice(aligned.tokens[1].startOffset, aligned.tokens[1].endOffset), aligned.tokens[1].text);
  for (const change of [value => value.words.pop(), value => { value.words[0].word = 'invented'; }, value => { value.words[0].score = 0.01; }, value => { value.words[1].start = 0; }]) {
    const invalid = structuredClone(output); change(invalid); assert.throws(() => measuredTokens(p, invalid));
  }
  const file = path.join(projectDir(p.id), 'alignment', `${objectHash({ audio: p.inputs.audioHash, text: p.inputs.narrationHash, language: p.inputs.language, version: 'measured-words-v1' })}.words.json`);
  atomic(file, aligned);
  assert.equal((await align(p, new AbortController().signal)).mode, 'word');
  const withCaptions = await createMotionCaptions(p, new AbortController().signal);
  assert.ok(withCaptions.artifacts.every(artifact => artifact.graphic.wordTimings.length === artifact.graphic.title.split(/\s+/u).length));
  const refreshed = await alignProject(withCaptions, new AbortController().signal);
  assert.deepEqual(refreshed.scenes.map(scene => [scene.startFrame, scene.endFrame]), p.scenes.map(scene => [scene.startFrame, scene.endFrame]));
  assert.equal(validateProject(refreshed).alignment.mode, 'word');
});

test('saved motion styles reuse approved fonts and preserve media and verified source data', async () => {
  const p = await fixture('museum', false, true);
  const preset = saveMotionStyle('Documentary blue', { accent: '#65b4d9', text: '#ffffff', background: '#132333', font: 'latin', motion: 'pull-out', strength: 0.12 });
  assert.equal(listMotionStyles().length, 1);
  const changed = applyMotionStyle(p, preset.id);
  assert.notEqual(changed.revisionId, p.revisionId); assert.equal(changed.style.colors.accent, '#65b4d9');
  assert.equal(changed.inputs.audioHash, p.inputs.audioHash); assert.deepEqual(changed.inputs.imageAssets, p.inputs.imageAssets);
  assert.equal(changed.style.fontAssetIds.length, 2);
  saveMotionStyle('Documentary blue', { ...preset.settings, accent: '#ff8844' }); assert.equal(listMotionStyles().length, 1);
  assert.throws(() => saveMotionStyle('bad', { ...preset.settings, accent: 'javascript:alert(1)' }));
});

test('before/after comparisons require two source layers and survive project validation', async () => {
  const p = await fixture('museum', false, true);
  const proposal = { sceneId: 'scene-0', kind: 'composition', title: 'Detail comparison', detail: '', target: '', quote: 'a bronze statue and its hand', position: 'top',
    composition: { treatment: 'cinematic', emphasis: 'none', comparison: { mode: 'wipe', beforeLabel: 'Before', afterLabel: 'After' },
      layers: [0.2, 0.5].map(x => ({ sourceSceneId: 'scene-0', bounds: { x: 0, y: 0, width: 1, height: 1 }, crop: { x, y: 0.3, width: 0.2, height: 0.4 }, useTargetCrop: false, fit: 'cover', motion: 'hold', delay: 0, rotation: 0 })) } };
  p.artifacts = [compileGraphic(p, proposal)];
  assert.equal(validateProject(p).artifacts[0].graphic.composition.comparison.mode, 'wipe');
  const invalid = structuredClone(p.artifacts[0].graphic.composition); invalid.layers.pop();
  assert.equal(DocumentaryComposition.safeParse(invalid).success, false);
});
test.after(() => fs.rmSync(directory, { recursive: true, force: true }));
