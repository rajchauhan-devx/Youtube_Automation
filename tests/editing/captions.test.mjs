import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.TUBEFLOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-captions-'));
const { fixture } = await import('./fixtures.mjs');
const { createMotionCaptions } = await import('../../server/dist/services/editing/motionCaptions.js');
const { applyMotionTheme, inferMotionTheme } = await import('../../server/dist/services/editing/motionTheme.js');
const { validateProject } = await import('@tubeflow/editing-contracts');
const { exportVideo } = await import('../../server/dist/services/editing/renderer.js');
const { randomUUID } = await import('node:crypto');
const { projectDir } = await import('../../server/dist/services/editing/repository.js');

test('separate caption creation produces timed, repeatable narration phrases', async () => {
  const source = await fixture('museum', false, true);
  const result = await createMotionCaptions(source, new AbortController().signal);
  assert.equal(result.revisionId !== source.revisionId, true);
  assert.equal(source.artifacts.length, 0);
  assert.ok(result.artifacts.length > 1);
  assert.ok(result.artifacts.every(a => a.graphic?.kind === 'caption' && a.startFrame >= 0 && a.endFrame <= source.inputs.durationFrames));
  assert.ok(result.artifacts.every(a => a.graphic.title.length <= 64));
  assert.equal(result.artifacts.map(a => a.graphic.title).join(' '), source.inputs.narrationText);
  validateProject(result);
  const regenerated = await createMotionCaptions(result, new AbortController().signal);
  assert.deepEqual(regenerated.artifacts.map(a => [a.id, a.startFrame, a.endFrame]), result.artifacts.map(a => [a.id, a.startFrame, a.endFrame]));
});

test('the story palette follows subject and can be revised by the graphics planner', async () => {
  const project = await fixture('museum', false, true);
  assert.equal(inferMotionTheme('A modern digital city story'), 'modern');
  assert.equal(inferMotionTheme('A temple prayer to Shiva'), 'devotional');
  assert.equal(inferMotionTheme('An archive documentary investigates history'), 'documentary');
  applyMotionTheme(project, 'modern');
  const modern = project.style.colors.accent;
  applyMotionTheme(project, 'documentary');
  assert.notEqual(project.style.colors.accent, modern);
  assert.notEqual(project.style.colors.accent, '#f2bd65');
  validateProject(project);
});

test('motion captions render in the exported composition', async () => {
  for (const portrait of [false, true]) {
    const source = await fixture('museum', portrait, true);
    const project = await createMotionCaptions(source, new AbortController().signal);
    assert.ok(project.artifacts.every(a => a.graphic.bounds.y >= project.inputs.height * 0.75), 'captions stay in the bottom portion');
    applyMotionTheme(project, 'modern');
    const jobId = randomUUID();
    await exportVideo(project, jobId, new AbortController().signal, () => {});
    assert.ok(fs.statSync(path.join(projectDir(project.id), 'renders', jobId, 'video.mp4')).size > 1000);
  }
});
