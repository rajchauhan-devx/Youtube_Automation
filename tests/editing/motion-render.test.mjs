import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { renderStill } from '@remotion/renderer';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-render-'));
process.env.TUBEFLOW_DATA_DIR = directory;
const { fixture } = await import('./motion-fixtures.mjs');
const { compileGraphic } = await import('../../server/dist/services/editing/motionPackArtifacts.js');
const { saveAsset, projectDir, hash } = await import('../../server/dist/services/editing/repository.js');
const { renderSession, exportVideo } = await import('../../server/dist/services/editing/renderer.js');
const { compileEditorial } = await import('../../server/dist/services/editing/editorial.js');

test('impact entrances pass rendered QA while visible out-of-frame typography is still rejected', { timeout: 120000 }, async () => {
  for (const portrait of [true, false]) {
    const p = await fixture('museum', portrait, true);
    const text = 'The total weight is 30 lbs.';
    p.inputs.narrationText = text; p.inputs.narrationHash = hash(text); p.alignment.narrationHash = hash(text);
    p.alignment.tokens = [{ ...p.alignment.tokens[0], id: 'impact-cue', text, start: 0, end: 3, startOffset: 0, endOffset: text.length }];
    p.scenes[0].narrativeRefs = ['impact-cue'];
    p.artifacts = [await compileEditorial(p, { sceneId: 'scene-0', kind: 'composition', title: 'Weight', detail: '', target: '', quote: text,
      sequence: { template: 'impact', headline: '30 Pounds of Iron', kicker: 'Physical weight of unconfessed lies',
        facts: [{ value: '30 lbs', label: 'Total weight of iron keys' }], direction: 'horizontal', disclosure: 'Illustrative weight.' } },
      { signal: new AbortController().signal })];
    const signal = AbortSignal.timeout(60000);
    const inspect = async frames => {
      const session = await renderSession(p, signal), findings = [];
      try {
        for (const frame of frames) await renderStill({ ...session, frame, output: path.join(directory, `impact-${portrait}-${frame}.png`), imageFormat: 'png',
          onBrowserLog: log => { if (log.text.startsWith('EDITING_QA:')) findings.push(JSON.parse(log.text.slice('EDITING_QA:'.length))); } });
      } finally { session.close(); }
      return findings;
    };
    assert.deepEqual(await inspect([0, 1, 15, 36, p.artifacts[0].endFrame - 1]), [], 'Hidden or clipped entrance text must not block visual review');
    if (portrait) {
      p.artifacts[0].graphic.composition.editorial.facts[0].value = '123456789012345678901234';
      assert.ok((await inspect([36])).some(f => ['TEXT_OVERFLOW', 'GRAPHIC_OUTSIDE_FRAME'].includes(f.code)), 'Visible layout defects must still block approval');
    }
  }
});

test('new layer motion changes rendered pixels and exports complete portrait/landscape MP4s', { timeout: 120000 }, async () => {
  const pattern = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#1a2535"/><rect width="20" height="20" fill="#64cbe8"/><rect x="20" y="20" width="20" height="20" fill="#f4c97b"/></pattern></defs><rect width="400" height="400" fill="url(#grid)"/><circle cx="300" cy="100" r="45" fill="#e44267"/></svg>');
  const image = saveAsset(await sharp(pattern).png().toBuffer(), { mime: 'image/png', width: 400, height: 400, alpha: false, method: 'fixture', providerVersion: 'motion-grid-v1' });
  for (const [portrait, motion] of [[true, 'focus-in'], [false, 'pull-out']]) {
    const p = await fixture('museum', portrait, true);
    const artifact = compileGraphic(p, { sceneId: 'scene-0', kind: 'composition', title: 'Detail', detail: '', target: '', quote: 'a bronze statue and its hand', position: 'top',
      composition: { treatment: 'cinematic', emphasis: 'none', layers: [{ sourceSceneId: 'scene-0', bounds: { x: 0, y: 0, width: 1, height: 1 },
        crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, useTargetCrop: false, fit: 'cover', motion, strength: 0.2, focus: { x: 0.75, y: 0.25 }, delay: 0, rotation: 0 }] } });
    artifact.graphic.composition.layers[0].assetId = image.id;
    p.artifacts = [artifact]; p.assetIds.push(image.id);
    const signal = AbortSignal.timeout(60000), session = await renderSession(p, signal), files = [];
    try {
      for (const frame of [18, 54]) {
        const file = path.join(directory, `${motion}-${frame}.png`);
        await renderStill({ ...session, output: file, frame, imageFormat: 'png' }); files.push(file);
      }
    } finally { session.close(); }
    const b = artifact.graphic.bounds;
    const crop = { left: Math.ceil(b.x + 5), top: Math.ceil(b.y + 5), width: Math.floor(b.width - 10), height: Math.floor(b.height - 10) };
    const [before, after] = await Promise.all(files.map(file => sharp(file).extract(crop).removeAlpha().raw().toBuffer()));
    const difference = before.reduce((sum, value, i) => sum + Math.abs(value - after[i]), 0) / before.length;
    assert.ok(difference > 5, `${motion} must visibly move the image pixels, got mean difference ${difference}`);
    const jobId = randomUUID(); await exportVideo(p, jobId, signal, () => {});
    const manifest = JSON.parse(fs.readFileSync(path.join(projectDir(p.id), 'renders', jobId, 'manifest.json'), 'utf8'));
    assert.equal(manifest.frameCount, p.inputs.durationFrames);
    assert.equal(manifest.width, p.inputs.width); assert.equal(manifest.height, p.inputs.height);
    assert.ok(fs.statSync(path.join(projectDir(p.id), 'renders', jobId, 'video.mp4')).size > 1000);
  }
});

test.after(() => fs.rmSync(directory, { recursive: true, force: true }));
