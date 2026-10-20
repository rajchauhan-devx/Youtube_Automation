import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { renderStill } from '@remotion/renderer';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'comparison-render-')); process.env.TUBEFLOW_DATA_DIR = directory;
const { fixture } = await import('./motion-fixtures.mjs');
const { compileGraphic } = await import('../../server/dist/services/editing/motionPackArtifacts.js');
const { saveAsset } = await import('../../server/dist/services/editing/repository.js');
const { renderSession, exportVideo } = await import('../../server/dist/services/editing/renderer.js');
test('comparison wipe and split display distinct approved source images and export both formats', { timeout: 120000 }, async () => {
  const sources = [];
  for (const color of ['#ed2233', '#2244ee']) sources.push(saveAsset(await sharp({ create: { width: 200, height: 200, channels: 3, background: color } }).png().toBuffer(), { mime: 'image/png', width: 200, height: 200, alpha: false, method: 'fixture', providerVersion: color }));
  for (const [mode, portrait] of [['wipe', true], ['split', false]]) {
    const p = await fixture('museum', portrait, true);
    const a = compileGraphic(p, { sceneId: 'scene-0', kind: 'composition', title: 'Comparison', detail: '', target: '', quote: 'a bronze statue and its hand',
      composition: { treatment: 'cinematic', layout: 'cutaway', emphasis: 'none', comparison: { mode, beforeLabel: 'Before', afterLabel: 'After' },
        layers: sources.map(() => ({ sourceSceneId: 'scene-0', bounds: { x: 0, y: 0, width: 1, height: 1 }, crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, useTargetCrop: false, fit: 'cover', motion: 'hold', delay: 0, rotation: 0 })) } });
    a.graphic.composition.layers.forEach((layer, i) => { layer.assetId = sources[i].id; }); p.assetIds.push(...sources.map(source => source.id)); p.artifacts = [a];
    const session = await renderSession(p, AbortSignal.timeout(60000));
    const sample = async (frame, fraction) => {
      const file = path.join(directory, `${mode}-${frame}.png`); await renderStill({ ...session, output: file, frame, imageFormat: 'png' });
      return sharp(file).extract({ left: Math.floor(p.inputs.width * fraction), top: Math.floor(p.inputs.height / 2), width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    };
    try {
      if (mode === 'wipe') { const before = await sample(12, 0.5), after = await sample(60, 0.5); assert.ok(before[0] > before[2] + 100); assert.ok(after[2] > after[0] + 100); }
      else { const left = await sample(36, 0.25), right = await sample(36, 0.75); assert.ok(left[0] > left[2] + 100); assert.ok(right[2] > right[0] + 100); }
    } finally { session.close(); }
    await exportVideo(p, randomUUID(), AbortSignal.timeout(60000), () => {});
  }
});
test.after(() => fs.rmSync(directory, { recursive: true, force: true }));
