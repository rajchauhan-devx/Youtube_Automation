import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
process.env.TUBEFLOW_DATA_DIR = path.resolve('artifacts/documentary-render-data');
const { fixture } = await import('./motion-fixtures.mjs');
const { compileGraphic } = await import('../../server/dist/services/editing/motionPackArtifacts.js');
const { exportVideo, previewFrames, renderSession } = await import('../../server/dist/services/editing/renderer.js');
const { projectDir, saveAsset } = await import('../../server/dist/services/editing/repository.js');
const { renderStill } = await import('@remotion/renderer');
const sharp = (await import('sharp')).default;
const results = [];
for (const [treatment, portrait] of [['archival', false], ['cinematic', true], ['map', false]]) {
  const p = await fixture('museum', portrait, true);
  // Distinct color insert makes rendering an additional asset objectively testable.
  const insert = saveAsset(await sharp({ create: { width: 200, height: 160, channels: 4, background: '#09e4a1' } }).png().toBuffer(),
    { mime: 'image/png', width: 200, height: 160, alpha: false, method: 'fixture', providerVersion: 'documentary-insert' });
  const a = compileGraphic(p, { sceneId: 'scene-0', kind: 'composition', title: 'Detail', detail: '', target: '', quote: 'a bronze statue and its hand', position: 'top',
    composition: { treatment, emphasis: 'none', layers: [{ sourceSceneId: 'scene-0', bounds: { x: 0, y: 0, width: 1, height: 1 },
      useTargetCrop: false, crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, fit: 'contain', motion: 'hold', rotation: 0, delay: 0 }] } });
  a.graphic.composition.layers[0].assetId = insert.id; p.assetIds.push(insert.id); p.artifacts = [a];
  if (treatment === 'archival') {
    for (let i = 0; i < 40; i++) p.artifacts.push({ ...structuredClone(a), id: `caption-stress-${i}`, startFrame: i, endFrame: i + 1,
      graphic: { kind: 'caption', title: 'Detail', detail: '', bounds: { x: 40, y: 280, width: 500, height: 45 } } });
  }
  const frames = await previewFrames(p, new AbortController().signal, a.id);
  assert.ok(frames.length <= 9, 'Placement review must not render every caption cue in a long composition');
  const frame = Math.floor(p.inputs.durationFrames / 2), file = path.join(projectDir(p.id), 'assert.png');
  const session = await renderSession(p, new AbortController().signal);
  try { await renderStill({ ...session, frame, output: file, imageFormat: 'png' }); } finally { session.close(); }
  const b = a.graphic.bounds;
  const pixel = await sharp(file).extract({ left: Math.round(b.x + b.width / 2), top: Math.round(b.y + b.height / 2), width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  assert.ok(pixel[1] > 180 && pixel[0] < 30, 'Additional registered image asset must be visible in the rendered composition');
  const id = randomUUID(); await exportVideo(p, id, new AbortController().signal, () => {});
  results.push({ treatment, portrait, preview: frames[1].file, output: path.join(projectDir(p.id), 'renders', id, 'video.mp4'),
    qualification: treatment === 'map' ? 'Renderer layout fixture only; not geographical map qualification.' : 'Synthetic compositing fixture.' });
}
fs.writeFileSync('artifacts/documentary-render-results.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
