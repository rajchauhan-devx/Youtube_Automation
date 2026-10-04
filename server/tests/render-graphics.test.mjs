import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import express from 'express';
import { cardBounds, legacySourceMatrix, apply, targetOnScreen } from '@tubeflow/video-composition';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tubeflow-legacy-graphics-'));
process.env.TUBEFLOW_DATA_DIR = temp;
const { fixture } = await import('../../tests/editing/motion-fixtures.mjs');
const { current, nextRevision, publish, assetFile, hash } = await import('../dist/services/editing/repository.js');
const { scriptFingerprint } = await import('../dist/services/editing/projects.js');
const { store } = await import('../dist/services/store.js');
const { generatedDir, workspaceContext } = await import('../dist/services/workspace.js');
const { savedGraphicsForRender, compositeSavedGraphics, graphicsCameras } = await import('../dist/services/render-graphics.js');
const { renderRevision, isCurrentRender } = await import('../dist/services/render-revision.js');
const { renderVideo, getOutputDir } = await import('../dist/services/video.js');
const { renderRouter } = await import('../dist/routes/render.js');

let p = await fixture('museum');
const scriptId = p.scriptId;
const media = path.join(generatedDir(), scriptId);
fs.mkdirSync(media, { recursive: true });
fs.copyFileSync(assetFile(p.inputs.imageAssets[0].assetId), path.join(media, 'image.png'));
fs.copyFileSync(assetFile(p.inputs.audioAssetId), path.join(media, 'tone.wav'));
const script = {
  id: scriptId, narration: p.inputs.narrationText, editingProjectId: p.id,
  generatedImages: [{ index: 0, status: 'done', url: `/api/generate/file/${scriptId}/image.png`, prompt: 'Synthetic statue' }],
  generatedAudio: [{ filename: 'tone.wav', language: 'en', narrationText: p.inputs.narrationText }],
};
store.add('scripts', script);
let updated = nextRevision(p);
updated.inputs.scriptHash = scriptFingerprint(script);
publish(updated, p.revisionId);
p = updated;
const resolution = { width: p.inputs.width, height: p.inputs.height };
const snapshot = () => savedGraphicsForRender(scriptId, 'tone.wav', ['image.png'], resolution);
const ff = args => execFileSync('ffmpeg', ['-v', 'error', ...args], { stdio: 'pipe', maxBuffer: 16 * 1024 * 1024 });
const pixels = (file, time = 1.2) => ff(['-ss', String(time), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
const audioHash = file => ff(['-i', file, '-map', '0:a', '-c', 'copy', '-f', 'hash', 'pipe:1']).toString();
const outputFiles = () => fs.readdirSync(getOutputDir(scriptId));
const options = {
  scriptId, imagePaths: ['image.png'], audioPath: 'tone.wav', resolution,
  sceneAnalysis: { effects: ['hold'], transitions: [], timings: [] },
  enableVignette: false, colorGrade: 'none', ttsVolume: 0.7,
};

test('legacy edits preserve the saved graphics; unrelated or stale inputs are rejected', () => {
  assert.equal(snapshot().revisionId, p.revisionId);
  store.add('scripts', { ...script, editing: { enabled: true }, timelineConfig: { bgmVolume: 0.2 }, enableSubtitles: true });
  assert.equal(snapshot().revisionId, p.revisionId);
  store.add('scripts', { ...script, narration: 'Another story' });
  assert.throws(snapshot, /older media or narration/);
  store.add('scripts', script);
  assert.throws(() => savedGraphicsForRender(scriptId, 'tone.wav', ['image.png'], { width: 1080, height: 1920 }), /format/);
  fs.copyFileSync(path.join(media, 'tone.wav'), path.join(media, 'other.wav'));
  assert.throws(() => savedGraphicsForRender(scriptId, 'other.wav', ['image.png'], resolution), /narration/);
  const original = fs.readFileSync(path.join(media, 'image.png'));
  fs.appendFileSync(path.join(media, 'image.png'), 'changed');
  assert.throws(snapshot, /original scene media/);
  fs.writeFileSync(path.join(media, 'image.png'), original);
  workspaceContext.run({ accountId: 'other-account', profile: 'mixed' }, () => {
    store.add('scripts', script);
    assert.throws(snapshot, /not found/);
  });
  store.add('scripts', { ...script, id: 'other-script' });
  assert.throws(() => savedGraphicsForRender('other-script', 'tone.wav', ['image.png'], resolution), /another script/);
});

test('transparent overlay keeps footage effects, preserves graphics colors and copies the final audio mix', async () => {
  const before = current(p.id);
  const result = await renderVideo({ ...options, colorGrade: 'dramatic-noir', enableVignette: true });
  const base = pixels(result.outputPath);
  const mixedAudio = audioHash(result.outputPath);
  const normal = await renderVideo(options);
  const normalBase = pixels(normal.outputPath);
  assert.ok(base.some((v, i) => Math.abs(v - normalBase[i]) > 10), 'the selected footage effect must be visible');
  await compositeSavedGraphics(result, snapshot(), new AbortController().signal, () => {});
  await compositeSavedGraphics(normal, snapshot(), new AbortController().signal, () => {});
  const combined = pixels(result.outputPath), plain = pixels(normal.outputPath);
  // Opaque card colors must stay the same over differently graded footage.
  let unchangedGraphic = 0, visibleFootage = 0;
  for (let i = 0; i < base.length; i += 3) {
    const difference = Math.abs(combined[i] - base[i]) + Math.abs(combined[i + 1] - base[i + 1]) + Math.abs(combined[i + 2] - base[i + 2]);
    const graphicDifference = Math.abs(combined[i] - plain[i]) + Math.abs(combined[i + 1] - plain[i + 1]) + Math.abs(combined[i + 2] - plain[i + 2]);
    if (difference > 40 && graphicDifference < 12) unchangedGraphic++;
    if (difference < 12 && combined[i] + combined[i + 1] + combined[i + 2] > 30) visibleFootage++;
  }
  assert.ok(unchangedGraphic > 500, `expected unchanged graphic colors, found ${unchangedGraphic} pixels`);
  assert.ok(visibleFootage > 5000, `transparent areas must retain the edited footage: ${visibleFootage}; graphics ${unchangedGraphic}`);
  assert.equal(audioHash(result.outputPath), mixedAudio);
  assert.deepEqual(current(p.id), before);
  assert.equal(outputFiles().some(f => f.startsWith('graphics-') || f.endsWith('.partial.mp4')), false);
});

test('cancelling graphics rendering leaves no temporary files or modified base video', async () => {
  const result = await renderVideo(options);
  const originalHash = hash(fs.readFileSync(result.outputPath));
  const controller = new AbortController();
  let cancelled = false;
  await assert.rejects(compositeSavedGraphics(result, snapshot(), controller.signal, (_stage, percent) => {
    if (percent > 66 && percent < 95) { cancelled = true; controller.abort(); }
  }), /Cancelled/);
  assert.ok(cancelled);
  assert.equal(hash(fs.readFileSync(result.outputPath)), originalHash);
  assert.equal(outputFiles().some(f => f.startsWith('graphics-')), false);
});

test('spotlight anchors match the actual FFmpeg camera and preserve saved graphic settings', async () => {
  const project = structuredClone(p);
  project.artifacts[0].graphic = {
    kind: 'spotlight', title: 'Hand', detail: '', bounds: cardBounds('spotlight', 640, 360, 'top'),
    target: { label: 'hand', region: { x: 420 / 640 - 0.055, y: 380 / 640 - 0.06, width: 0.11, height: 0.12 }, verified: true, evidence: 'Fixture hand' },
  };
  const before = structuredClone(project);
  let lastResult, lastCameras;
  for (const effect of ['hold', 'pan-right', 'ken-burns-in']) {
    const opts = { ...options, sceneAnalysis: { ...options.sceneAnalysis, effects: [effect] } };
    const cameras = graphicsCameras(project, opts, 3);
    const result = await renderVideo(opts);
    lastResult = result; lastCameras = cameras;
    for (const seconds of [0, 1.5, 2.9]) {
      const matrix = legacySourceMatrix(cameras['scene-0'], seconds, resolution, { width: 640, height: 640 });
      const expected = apply(matrix, { x: 420, y: 380 });
      const frame = pixels(result.outputPath, seconds);
      let xSum = 0, ySum = 0, count = 0;
      for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) {
        const i = (y * 640 + x) * 3;
        if (frame[i] > 190 && frame[i + 1] > 175 && frame[i + 2] > 145) { xSum += x; ySum += y; count++; }
      }
      assert.ok(count > 100);
      assert.ok(Math.abs(xSum / count - expected.x) < 2 && Math.abs(ySum / count - expected.y) < 2, `spotlight camera differs from ${effect} at ${seconds}s`);
      const box = targetOnScreen(project, project.artifacts[0], Math.round(seconds * 24), { width: 640, height: 640 }, matrix);
      assert.ok(Math.abs(box.x + box.width / 2 - expected.x) < 2);
    }
  }
  await compositeSavedGraphics(lastResult, project, new AbortController().signal, () => {}, lastCameras);
  const frame = pixels(lastResult.outputPath, 1.5);
  const box = targetOnScreen(project, project.artifacts[0], 36, { width: 640, height: 640 }, legacySourceMatrix(lastCameras['scene-0'], 1.5, resolution, { width: 640, height: 640 }));
  const west = Math.round(box.x - 4), centerY = Math.round(box.y + box.height / 2);
  let ring = 0;
  for (let y = centerY - 7; y <= centerY + 7; y++) for (let x = west - 4; x <= west + 4; x++) {
    const i = (y * 640 + x) * 3;
    if (frame[i] > 220 && frame[i + 1] > 160 && frame[i + 2] < 165) ring++;
  }
  assert.ok(ring > 8, `expected the exported spotlight at the edited target, found ${ring} pixels`);
  const moved = { ...options, timelineConfig: { clips: [{ duration: 0.1, transition: 'none', transitionDuration: 0 }, { duration: 2.9, transition: 'none', transitionDuration: 0 }] } };
  assert.throws(() => graphicsCameras(project, moved, 3), /timing moved/);
  assert.deepEqual(project, before);
});

test('Start Video Generation publishes the combined MP4 and graphics revisions invalidate old exports', async () => {
  let next = nextRevision(p);
  next.inputs.width = 1080; next.inputs.height = 1920;
  next.artifacts[0].graphic.bounds = cardBounds('title', 1080, 1920, 'center');
  next.artifacts.push({ ...structuredClone(next.artifacts[0]), id: 'motion-caption',
    graphic: { kind: 'caption', title: 'The supplied fixture', detail: '', bounds: cardBounds('caption', 1080, 1920) } });
  publish(next, p.revisionId); p = next;
  const app = express(); app.use(express.json()); app.use('/api/render', renderRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${origin}/api/render/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...options, resolution: { width: 1080, height: 1920 }, colorGrade: 'dramatic-noir', enableSubtitles: true, narration: 'LEGACY DUPLICATE CAPTION' }),
    });
    assert.equal(response.status, 200, await response.text());
    let status;
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      status = await (await fetch(`${origin}/api/render/status/${scriptId}`)).json();
      if (status.status !== 'running') break;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    assert.equal(status.status, 'done', JSON.stringify(status));
    assert.equal(status.videos.length, 1);
    const video = status.videos[0];
    const file = path.join(getOutputDir(scriptId), video.filename);
    assert.ok(isCurrentRender(scriptId, file));
    assert.equal(video.resolution, '1080x1920');
    assert.ok(Math.abs(video.duration - 3) < 0.04);
    const frame = pixels(file);
    let bright = 0;
    for (let y = 650; y < 1080; y++) for (let x = 65; x < 907; x++) {
      const i = (y * 1080 + x) * 3;
      if (frame[i] > 210 && frame[i + 1] > 170) bright++;
    }
    assert.ok(bright > 500, `expected saved graphic in final route video, found ${bright} pixels`);
    let caption = 0;
    for (let y = 1550; y < 1800; y++) for (let x = 65; x < 1000; x++) {
      const i = (y * 1080 + x) * 3;
      if (frame[i] > 200 && frame[i + 1] > 200 && frame[i + 2] > 200) caption++;
    }
    assert.ok(caption > 500, 'the saved motion caption must appear in the combined output');
    assert.equal(fs.readdirSync(media).some(f => f.endsWith('.ass')), false, 'legacy subtitles must not duplicate saved motion captions');
    assert.equal((await fetch(`${origin}${video.url}`)).status, 200);
    const oldRevision = renderRevision(scriptId);
    next = nextRevision(p); next.artifacts.forEach(a => { a.enabled = false; });
    publish(next, p.revisionId); p = next;
    assert.notEqual(renderRevision(scriptId), oldRevision);
    assert.equal(isCurrentRender(scriptId, file), false);
    assert.equal(savedGraphicsForRender(scriptId, 'tone.wav', ['image.png'], { width: 1080, height: 1920 }), undefined);
    assert.equal((await fetch(`${origin}${video.url}`)).status, 404);
    store.add('scripts', { ...script, editingProjectId: undefined });
    assert.equal(snapshot(), undefined);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test.after(() => {
  assert.equal(path.dirname(path.resolve(temp)), fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(temp).startsWith('tubeflow-legacy-graphics-'));
  fs.rmSync(temp, { recursive: true, force: true });
});
