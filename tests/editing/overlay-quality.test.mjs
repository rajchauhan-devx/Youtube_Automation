import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'documentary-overlay-quality-'));
process.env.TUBEFLOW_DATA_DIR = root;
const { fixture } = await import('./motion-fixtures.mjs');
const { saveAsset } = await import('../../server/dist/services/editing/repository.js');
const { compileGraphic } = await import('../../server/dist/services/editing/motionPackArtifacts.js');
const { exportGraphicsOverlay } = await import('../../server/dist/services/editing/renderer.js');

test('transparent documentary export preserves detailed image pixels at portrait resolution', async () => {
  const p = await fixture('museum', true, true), width = 720, height = 1280;
  p.inputs.width = width; p.inputs.height = height;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3;
    pixels[i] = Math.round(110 + 45 * Math.sin(x / 3) + 35 * Math.sin(y / 7));
    // Luma detail isolates compression damage from expected 4:2:0 chroma loss.
    pixels[i + 1] = pixels[i];
    pixels[i + 2] = pixels[i];
  }
  const asset = saveAsset(await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer(), {
    mime: 'image/png', width, height, alpha: false, method: 'fixture', providerVersion: 'fine-image-texture-v1',
  });
  const artifact = compileGraphic(p, { sceneId: 'scene-0', kind: 'composition', title: 'Detail', detail: '', target: '',
    quote: 'a bronze statue and its hand', composition: { treatment: 'cinematic', layout: 'cutaway', emphasis: 'none',
      layers: [{ sourceSceneId: 'scene-0', bounds: { x: 0, y: 0, width: 1, height: 1 }, crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        useTargetCrop: false, fit: 'cover', motion: 'hold', delay: 0, rotation: 0 }] } });
  artifact.graphic.composition.layers[0].assetId = asset.id;
  delete artifact.graphic.composition.layers[0].crop;
  p.artifacts = [artifact]; p.assetIds.push(asset.id); p.status = 'ready';
  const output = path.join(root, 'overlay.webm');
  await exportGraphicsOverlay(p, output, AbortSignal.timeout(60000), () => {});
  const decoded = execFileSync('ffmpeg', ['-v', 'error', '-ss', '1.5', '-i', output, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: pixels.length * 2 });
  assert.equal(decoded.length, pixels.length);
  // The image stage has a one-pixel border. Register the interior before
  // measuring compression, so a CSS border offset is not mistaken for blur.
  let bestMeanError = Infinity;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    let squaredError = 0, count = 0;
    for (let y = 8; y < height - 8; y += 2) for (let x = 8; x < width - 8; x += 2) {
      const expected = pixels[((y + dy) * width + x + dx) * 3];
      squaredError += (expected - decoded[(y * width + x) * 3]) ** 2; count++;
    }
    bestMeanError = Math.min(bestMeanError, squaredError / count);
  }
  const psnr = 10 * Math.log10(255 ** 2 / bestMeanError);
  assert.ok(psnr > 34, `Image detail was damaged by intermediate compression: PSNR ${psnr.toFixed(1)} dB`);
});

test.after(() => fs.rmSync(root, { recursive: true, force: true }));
