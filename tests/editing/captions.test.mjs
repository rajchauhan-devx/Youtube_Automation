import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { renderStill } from '@remotion/renderer';
process.env.TUBEFLOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-captions-'));
const { fixture } = await import('./fixtures.mjs');
const { createMotionCaptions } = await import('../../server/dist/services/editing/motionCaptions.js');
const { applyMotionTheme, inferMotionTheme } = await import('../../server/dist/services/editing/motionTheme.js');
const { validateProject } = await import('@tubeflow/editing-contracts');
const { exportVideo, previewFrames, renderSession } = await import('../../server/dist/services/editing/renderer.js');
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
    const checked = await previewFrames(project, new AbortController().signal, project.artifacts[0].id);
    assert.ok(checked.every(frame => frame.findings.length === 0), 'native caption typography must fit throughout its reveal');
    const jobId = randomUUID();
    await exportVideo(project, jobId, new AbortController().signal, () => {});
    assert.ok(fs.statSync(path.join(projectDir(project.id), 'renders', jobId, 'video.mp4')).size > 1000);
  }
});

test('Hindi captions keep contrast and every word visible at phrase boundaries in both formats', async () => {
  for (const portrait of [false, true]) {
    const source = await fixture('science', portrait, true);
    const project = await createMotionCaptions(source, new AbortController().signal);
    const caption = project.artifacts[0];
    caption.startFrame = 0;
    caption.endFrame = project.inputs.durationFrames;
    caption.graphic.title = 'किए, चौदह साल तक लगातार';
    caption.graphic.wordTimings = caption.graphic.title.split(/\s+/u).map((_, i) => ({ startFrame: i * 10, endFrame: i * 10 + 10 }));
    project.artifacts = [caption];
    // Caption contrast must be independent of the theme's text color.
    project.style.colors.text = '#172033';
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caption-contrast-'));
    const session = await renderSession(project, AbortSignal.timeout(60000), 'ArtifactsOverlay');
    const findings = [], counts = [];
    try {
      for (const frame of [0, 36, 71]) {
        const file = path.join(dir, `${frame}.png`);
        await renderStill({ ...session, frame, output: file, imageFormat: 'png', onBrowserLog: log => {
          if (log.text.startsWith('EDITING_QA:')) findings.push(log.text);
        } });
        const { data, info } = await sharp(file).flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const b = caption.graphic.bounds;
        const x = Math.round(b.x + b.width * 0.02), y = Math.round(b.y + b.height * 0.5);
        assert.ok(data[(y * info.width + x) * 3] <= 34, 'backing keeps bright footage dark beneath the caption');
        let white = 0, rightWhite = 0;
        for (let cy = Math.ceil(b.y); cy < b.y + b.height - 1; cy++) for (let cx = Math.ceil(b.x); cx < b.x + b.width - 1; cx++) {
          const i = (cy * info.width + cx) * 3;
          if (data[i] > 220 && data[i + 1] > 220 && data[i + 2] > 220) {
            white++;
            if (cx > b.x + b.width * 0.5) rightWhite++;
          }
        }
        assert.ok(rightWhite > 30, 'the right-hand words remain visible even before their spoken timing');
        counts.push(white);
      }
      assert.ok(Math.min(...counts) / Math.max(...counts) > 0.8, 'caption text remains opaque at entrance and exit');
      assert.deepEqual(findings, [], 'Hindi glyphs fit inside the caption region');
    } finally {
      session.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});
