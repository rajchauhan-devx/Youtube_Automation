// Opt-in real-image / real-provider qualification. Creates isolated artifacts only.
// DOCUMENTARY_SMOKE_IMAGE points to an existing image; no source file is modified.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import dotenv from '../../server/node_modules/dotenv/lib/main.js';
dotenv.config({ path: 'server/.env', quiet: true });
if (!process.env.GEMINI_API_KEY || !process.env.DOCUMENTARY_SMOKE_IMAGE)
  throw new Error('Configure GEMINI_API_KEY and DOCUMENTARY_SMOKE_IMAGE for this opt-in check.');
process.env.TUBEFLOW_DATA_DIR = path.resolve('artifacts/documentary-live-data');
const { fixture } = await import('./motion-fixtures.mjs');
const { saveAsset, hash, objectHash, atomic, projectDir } = await import('../../server/dist/services/editing/repository.js');
const { approximateAlignment, mapScenes } = await import('../../server/dist/services/editing/timing.js');
const { runPipeline } = await import('../../server/dist/services/editing/pipeline.js');
const { exportVideo } = await import('../../server/dist/services/editing/renderer.js');
const { runMedia } = await import('../../server/dist/services/media-process.js');
const p = await fixture('museum', false, true), image = path.resolve(process.env.DOCUMENTARY_SMOKE_IMAGE);
const bytes = await sharp(image).png().toBuffer(), metadata = await sharp(bytes).metadata();
const asset = saveAsset(bytes, { mime: 'image/png', width: metadata.width, height: metadata.height,
  alpha: !!metadata.hasAlpha, method: 'import', providerVersion: 'documentary-live-existing-image' });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'documentary-audio-')), audioFile = path.join(temp, 'tone.wav');
await runMedia('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=8', '-c:a', 'pcm_s16le', audioFile]);
const audio = saveAsset(fs.readFileSync(audioFile), { mime: 'audio/wav', duration: 8, alpha: false, method: 'fixture', providerVersion: 'timing-test-tone-not-spoken-narration' });
const narration = process.env.DOCUMENTARY_SMOKE_NARRATION || 'A golden submarine moves through the underwater ruins. A close view shows its circular front window.';
p.inputs = { ...p.inputs, narrationText: narration, narrationHash: hash(narration), audioAssetId: audio.id, audioHash: audio.hash,
  durationFrames: 8 * p.inputs.fps, imageAssets: [{ assetId: asset.id, hash: asset.hash, promptIndex: 0, prompt: narration }], sceneTiming: [] };
p.alignment = approximateAlignment(p.inputs, 8); p.scenes = mapScenes(p);
p.assetIds = [asset.id, audio.id, ...p.style.fontAssetIds];
p.settings = { ...p.settings, documentary: true, visualReview: true, treatment: 'auto', maxProviderCalls: 10,
  aiModel: process.env.EDITING_SMOKE_MODEL || process.env.EDITING_PLANNER_MODEL || process.env.GEMINI_EDIT_MODEL,
  stylePreference: 'Qualification: create one useful image-led composition with a magnified detail from this actual source image. Keep the main subject clear. Use a verified target crop. Avoid text-only graphics.' };
const job = { id: randomUUID(), operation: 'generate', usage: [] }, started = Date.now();
try {
  const result = await runPipeline(p, { job, maxCalls: 10, signal: AbortSignal.timeout(300000), persist() {},
    stage(stage, completed, total) { console.log(JSON.stringify({ stage, completed, total })); } });
  const composition = result.artifacts.find(a => a.enabled && a.graphic?.composition);
  if (!composition) throw new Error('Live planner did not produce an enabled documentary composition. Inspect generation notes.');
  if (composition.visualReview?.status !== 'passed') throw new Error('Live composition did not pass rendered placement review.');
  const renderId = randomUUID();
  await exportVideo(result, renderId, AbortSignal.timeout(120000), () => {});
  const output = path.join(projectDir(p.id), 'renders', renderId, 'video.mp4');
  const report = { success: true, model: p.settings.aiModel, output, revision: result.revisionId,
    preview: path.join(projectDir(p.id), 'previews', result.revisionId, `${composition.visualReview.frames[Math.floor(composition.visualReview.frames.length / 2)]}.png`),
    graphic: composition.graphic, review: composition.visualReview, diagnostics: result.diagnostics,
    usage: job.usage, elapsedMs: Date.now() - started,
    limitations: ['Audio is an eight-second test tone, not spoken narration.', 'Source image is existing illustrative project media.', 'Sampled-frame review does not prove correctness of every video frame.'] };
  atomic('artifacts/documentary-live-result.json', report);
  console.log(JSON.stringify(report));
} catch (error) {
  atomic('artifacts/documentary-live-result.json', { success: false, error: error.message, usage: job.usage, elapsedMs: Date.now() - started });
  throw error;
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
