import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import express from 'express';

const directory = fs.mkdtempSync(path.resolve('server/data/mixed-test-'));
process.env.TUBEFLOW_DATA_DIR = directory;
const ws = await import('../dist/services/workspace.js');
const { store } = await import('../dist/services/store.js');
const { validateScenePlan, validateSync, spokenText } = await import('../dist/services/scene-plan.js');
const { assembleNarration } = await import('../dist/services/long-narration.js');
const { renderLongVideo } = await import('../dist/services/video.js');
const { workspacesRouter } = await import('../dist/routes/workspaces.js');
const app = express(); app.use(express.json()); app.use('/api/accounts/:accountId/profiles/:profile', workspacesRouter);
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const host = `http://127.0.0.1:${server.address().port}`;
const prefix = '/api/accounts/default/profiles/mixed';
const scope = { accountId: 'default', profile: 'mixed' };
const plan = { version: 1, title: 'Mixed test', thumbnailPrompt: 'Separate cover', scenes: [
  { id: 'image1', chapter: 'Opening', role: 'story', mediaType: 'image', narration: 'An opening still.', imagePrompt: 'red image' },
  { id: 'video1', chapter: 'Action', role: 'story', mediaType: 'video', duration: 10, narration: 'A moving scene.', imagePrompt: 'moving test pattern' },
] };
const ff = args => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { windowsHide: true, stdio: 'pipe' });
const json = (route, body) => fetch(host + prefix + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
let audio, videoAsset, imageAsset;
const options = { scriptId: 'episode', language: 'en', voice: 'fixture' };

test('mixed extraction retains types, serial order and planned source duration', async () => {
  const response = await json('/llm/extract', { rawText: `<long_video>${JSON.stringify(plan)}</long_video>` });
  assert.equal(response.status, 200);
  const extracted = await response.json();
  assert.deepEqual(extracted.scenePlan, plan);
  assert.deepEqual(extracted.imagePrompts, ['red image', 'moving test pattern']);
  assert.equal(validateScenePlan({ ...plan, scenes: [{ ...plan.scenes[1], duration: 8 }] }).scenes[0].duration, 8);
  const missing = { ...plan, scenes: [{ ...plan.scenes[0], mediaType: undefined }] };
  assert.equal((await json('/llm/extract', { rawText: `<long_video>${JSON.stringify(missing)}</long_video>` })).status, 400);
  assert.equal((await fetch(host + '/api/accounts/default/profiles/invalid/scripts')).status, 404);
  await ws.workspaceContext.run(scope, () => store.add('scripts', { id: 'episode', name: 'Mixed', scenePlan: plan, narration: spokenText(plan) }));
});

test('imports accept variable durations, reject wrong media types and serve MP4 byte ranges', async () => {
  const image = path.join(directory, 'still.png'), video = path.join(directory, 'clip.mp4'), short = path.join(directory, 'short.mp4');
  ff(['-f', 'lavfi', '-i', 'color=c=red:s=160x90', '-frames:v', '1', image]);
  ff(['-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=30', '-t', '10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
  ff(['-i', video, '-t', '2', '-c', 'copy', short]);
  const upload = (index, file, extension) => fetch(host + prefix + `/media-import/episode/${index}?extension=${extension}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: fs.readFileSync(file) });
  assert.equal((await upload(1, short, 'mp4')).status, 200);
  assert.equal((await upload(0, video, 'mp4')).status, 400);
  const a = await upload(0, image, 'png'); assert.equal(a.status, 200); imageAsset = (await a.json()).asset;
  const b = await upload(1, video, 'mp4'); assert.equal(b.status, 200); videoAsset = (await b.json()).asset;
  fs.unlinkSync(video); fs.unlinkSync(image);
  const range = await fetch(host + videoAsset.url, { headers: { Range: 'bytes=0-99' } });
  assert.equal(range.status, 206); assert.equal(range.headers.get('content-type'), 'video/mp4');
  assert.equal((await range.arrayBuffer()).byteLength, 100);
  const saved = await (await fetch(host + prefix + '/scripts/episode')).json();
  assert.deepEqual(saved.generatedImages.map(asset => asset.mediaType), ['image', 'video']);
  assert.equal((await fetch(host + videoAsset.url.replace('/mixed/', '/long/'))).status, 404);
});

test('all narration retains its measured length without silence padding', async () => ws.workspaceContext.run(scope, async () => {
  let counter = 0;
  const fakeTts = async opts => {
    const filename = `voice-${++counter}.wav`;
    ff(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', opts.text === plan.scenes[0].narration ? '1.137' : '3', path.join(ws.generatedDir(), opts.scriptId, filename)]);
    return { filename };
  };
  audio = await assembleNarration(plan, options, new AbortController().signal, () => {}, fakeTts);
  validateSync(plan, audio.sync);
  assert.equal(audio.sync.scenes[1].endSample - audio.sync.scenes[1].startSample, 144000);
  assert.equal(audio.sync.scenes[0].endSample, 54576);
  assert.equal(audio.sync.totalSamples, 198576);
  const bytes = fs.readFileSync(path.join(ws.generatedDir(), 'episode', audio.filename));
  assert.ok(bytes.subarray(-48000).some(byte => byte !== 0), 'no silence padding');
}));

test('narration longer than its planning estimate is preserved', async () => ws.workspaceContext.run(scope, async () => {
  const tooLong = async opts => {
    const filename = 'long.wav';
    ff(['-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '10.2', path.join(ws.generatedDir(), opts.scriptId, filename)]);
    return { filename };
  };
  const result = await assembleNarration({ ...plan, scenes: [plan.scenes[1]] }, { ...options, scriptId: 'overlong' }, new AbortController().signal, () => {}, tooLong);
  assert.equal(result.sync.totalSamples, 489600);
}));

test('episode maximum uses actual narration duration', async () => ws.workspaceContext.run(scope, async () => {
  const noNewSpeech = async () => { throw new Error('Expected cached narration'); };
  await assert.rejects(assembleNarration(plan, options, new AbortController().signal, () => {}, noNewSpeech, 4), /maximum at scene video1/);
  const exact = await assembleNarration({ ...plan, scenes: [plan.scenes[1]] }, options, new AbortController().signal, () => {}, noNewSpeech, 10);
  assert.equal(exact.sync.totalSamples, 144000);
  const script = store.getById('scripts', 'episode');
  store.add('scripts', { ...script, generatedAudio: [audio], maxDurationSeconds: 4 });
  const response = await json('/render/start', { scriptId: 'episode', imagePaths: [imageAsset.url, videoAsset.url], audioPath: audio.filename });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /maximum/);
}));

test('render uses moving footage for the spoken duration after an image scene', async () => ws.workspaceContext.run(scope, async () => {
  const result = await renderLongVideo({ scriptId: 'episode', imagePaths: [imageAsset.url, videoAsset.url], audioPath: audio.filename,
    resolution: { width: 320, height: 180 }, enableSubtitles: false }, plan, audio.sync);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', result.outputPath], { encoding: 'utf8', windowsHide: true }));
  for (const stream of probe.streams) assert.ok(Math.abs(Number(stream.duration) - 4.137) <= 1 / 30 + 0.001);
  const frame = time => execFileSync('ffmpeg', ['-v', 'error', '-ss', String(time), '-i', result.outputPath, '-frames:v', '1', '-vf', 'scale=32:18', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { windowsHide: true });
  const red = frame(0.3); assert.ok(red[0] > red[1] + 100);
  assert.notDeepEqual(frame(2), frame(3.5), 'video must move rather than repeat a still frame');
}));

test('two-image sequences switch at spoken boundaries despite five-second estimates', async () => ws.workspaceContext.run(scope, async () => {
  const imagePlan = { ...plan, scenes: [
    { ...plan.scenes[0], id: 'IMAGE_003A', duration: 5 },
    { ...plan.scenes[0], id: 'IMAGE_003B', duration: 5 },
    { ...plan.scenes[0], id: 'IMAGE_004', duration: 10 },
  ] };
  const fakeTts = async opts => {
    const filename = 'image-slot.wav';
    ff(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '1', path.join(ws.generatedDir(), opts.scriptId, filename)]);
    return { filename };
  };
  const result = await assembleNarration(imagePlan, { ...options, scriptId: 'image-slots' }, new AbortController().signal, () => {}, fakeTts);
  validateSync(imagePlan, result.sync);
  assert.deepEqual(result.sync.scenes.map(s => [s.startSample, s.endSample]), [[0, 48000], [48000, 96000], [96000, 144000]]);
  const overlong = async opts => {
    const filename = 'overlong-image.wav';
    ff(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '5.2', path.join(ws.generatedDir(), opts.scriptId, filename)]);
    return { filename };
  };
  const longer = await assembleNarration(imagePlan, { ...options, scriptId: 'image-overlong' }, new AbortController().signal, () => {}, overlong);
  assert.equal(longer.sync.totalSamples, 748800);
}));

test('short footage slows and holds within bounds; uncovered narration rejects rendering', async () => ws.workspaceContext.run(scope, async () => {
  const dir = path.join(ws.generatedDir(), 'episode');
  ff(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '13.337', path.join(dir, 'fit-voice.wav')]);
  const videoPlan = { ...plan, scenes: [plan.scenes[1]] };
  const sync = { version: 1, timingMode: 'narration', planHash: 'fixture', sampleRate: 48000, totalSamples: 640176,
    scenes: [{ sceneId: 'video1', startSample: 0, endSample: 640176 }] };
  const result = await renderLongVideo({ scriptId: 'episode', imagePaths: [videoAsset.url], audioPath: 'fit-voice.wav',
    resolution: { width: 160, height: 90 }, enableSubtitles: false }, videoPlan, sync);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', result.outputPath], { encoding: 'utf8', windowsHide: true }));
  for (const stream of probe.streams) assert.ok(Math.abs(Number(stream.duration) - 13.337) < 0.035);
  const frame = time => execFileSync('ffmpeg', ['-v', 'error', '-ss', String(time), '-i', result.outputPath, '-frames:v', '1', '-vf', 'scale=32:18', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { windowsHide: true });
  assert.notDeepEqual(frame(10), frame(11.5), 'motion continues beyond original clip length');
  const tooLong = { ...sync, totalSamples: 768000, scenes: [{ sceneId: 'video1', startSample: 0, endSample: 768000 }] };
  await assert.rejects(renderLongVideo({ scriptId: 'episode', imagePaths: [videoAsset.url], audioPath: 'fit-voice.wav',
    resolution: { width: 160, height: 90 } }, videoPlan, tooLong), /video1.*Import a longer clip/);
}));

test('rerender replaces the previous Mixed Media video after validation', async () => ws.workspaceContext.run(scope, async () => {
  const { editingPreset } = await import('../dist/services/auto-edit.js');
  const { getOutputDir } = await import('../dist/services/video.js');
  const script = store.getById('scripts', 'episode');
  const editing = { ...editingPreset(), motion: 'off', captions: false, chapterTitles: false };
  store.add('scripts', { ...script, generatedAudio: [audio], maxDurationSeconds: 60, editing });
  const body = {scriptId:'episode', imagePaths:[imageAsset.url,videoAsset.url],audioPath:audio.filename,editing};
  const waitForRender = async () => {
    for (let i=0;i<240;i++) {
      const status = await (await fetch(host+prefix+'/render/status/episode')).json();
      if (status.status === 'error') throw new Error(status.error);
      if (status.status === 'done') return status.videos;
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    throw new Error('Render timeout');
  };
  assert.equal((await json('/render/start',body)).status,200);
  const first = (await waitForRender())[0];
  assert.equal((await json('/render/start',{...body,audioPath:'missing.wav'})).status,400);
  assert.ok(fs.existsSync(path.join(getOutputDir('episode'),first.filename)), 'invalid request preserves output');
  assert.equal((await json('/render/start',{...body,colorGrade:'warm-vintage'})).status,200);
  assert.equal(fs.existsSync(path.join(getOutputDir('episode'),first.filename)),false);
  assert.equal(fs.existsSync(path.join(getOutputDir('episode'),first.filename+'.json')),false);
  const videos = await waitForRender();
  assert.equal(videos.length,1);
  assert.notEqual(videos[0].filename,first.filename);
  assert.equal((await fetch(host+first.url)).status,404);
}));

test.after(async () => {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  const root = path.resolve('server/data');
  assert.ok(directory.startsWith(root + path.sep));
  fs.rmSync(directory, { recursive: true, force: true });
});
