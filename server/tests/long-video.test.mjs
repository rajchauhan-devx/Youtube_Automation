import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import express from 'express';
const root = path.resolve('server/data');
const directory = fs.mkdtempSync(path.join(root, 'long-test-'));
process.env.TUBEFLOW_DATA_DIR = directory;
const ws = await import('../dist/services/workspace.js');
const { store } = await import('../dist/services/store.js');
const { parseScenePlan, validateScenePlan, validateSync, spokenText } = await import('../dist/services/scene-plan.js');
const { assembleNarration, assertNarrationCurrent, planHash, startNarration, narrationStatus, cancelNarration } = await import('../dist/services/long-narration.js');
const { renderRevision, isCurrentRender } = await import('../dist/services/render-revision.js');
const { renderLongVideo } = await import('../dist/services/video.js');
const { planTimeline } = await import('../dist/services/timeline.js');
const { workspacesRouter } = await import('../dist/routes/workspaces.js');
const app = express(); app.use(express.json()); app.use('/api/accounts/:accountId/profiles/:profile', workspacesRouter);
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}/api/accounts/default/profiles/long`;
const request = (url, body, method = 'POST') => fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const scope = { accountId: 'default', profile: 'long' };
const plan = { version: 1, title: 'समुद्र मंथन', thumbnailPrompt: 'Separate thumbnail', scenes: [
  { id: 'C01_S001', chapter: 'आरंभ', role: 'story', narration: 'समुद्र से हलाहल विष निकला।', imagePrompt: 'red scene' },
  { id: 'C01_S002', chapter: 'त्याग', role: 'story', narration: 'महादेव ने सबकी रक्षा की।', imagePrompt: 'blue scene' },
  { id: 'C02_S001', chapter: 'समापन', role: 'cta', narration: 'जय नीलकंठ महादेव।', imagePrompt: 'green scene' },
] };
const ff = args => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'pipe' });
let audio;
let synthCalls = 0;
const durations = [1.137, 2.243, 1.071];
async function fakeTts(options) {
  const index = plan.scenes.findIndex(scene => scene.narration === options.text);
  const filename = `fixture-${++synthCalls}.wav`;
  ff(['-f', 'lavfi', '-i', `sine=frequency=${440 + index * 100}:sample_rate=24000`, '-t', String(durations[index]), path.join(ws.generatedDir(), options.scriptId, filename)]);
  return { filename, elapsedMs: 0, publicUrl: '' };
}

test('strict extraction preserves scene links and excludes the thumbnail without an LLM call', async () => {
  const response = await request('/llm/extract', { rawText: `<long_video>${JSON.stringify(plan)}</long_video>` });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ttsText, spokenText(plan));
  assert.deepEqual(body.imagePrompts, plan.scenes.map(scene => scene.imagePrompt));
  assert.equal(body.scenePlan.thumbnailPrompt, 'Separate thumbnail');
  assert.throws(() => parseScenePlan('<long_video>{</long_video>'), /JSON/);
  assert.throws(() => parseScenePlan(`<long_video>${JSON.stringify(plan)}</long_video><script>different</script>`), /differs/);
  assert.throws(() => validateScenePlan({ ...plan, scenes: [plan.scenes[0], plan.scenes[0]] }), /unique/);
  assert.equal((await request('/llm/extract', { rawText: '<script>Legacy unlinked narration</script>' })).status, 400);
});

test('scene synthesis records exact samples, reuses cache, and detects modified audio', async () => ws.workspaceContext.run(scope, async () => {
  const options = { scriptId: 'episode', language: 'hi', voice: 'fixture' };
  audio = await assembleNarration(plan, options, new AbortController().signal, () => {}, fakeTts);
  assert.equal(synthCalls, 3);
  validateSync(plan, audio.sync);
  assert.ok(Math.abs(audio.sync.totalSamples / 48000 - durations.reduce((a, b) => a + b, 0)) < 0.001);
  const second = await assembleNarration(plan, options, new AbortController().signal, () => {}, fakeTts);
  assert.equal(synthCalls, 3, 'retry must use existing segments');
  assert.deepEqual(second.sync, audio.sync);
  const script = { id: 'episode', scenePlan: plan, narration: spokenText(plan) };
  assertNarrationCurrent(script, audio.filename);
  assert.throws(() => assertNarrationCurrent({ ...script, narration: 'edited' }, audio.filename), /changed/);
  const secondPath = path.join(ws.generatedDir(), 'episode', second.filename);
  fs.appendFileSync(secondPath, 'tampered');
  assert.throws(() => assertNarrationCurrent(script, second.filename), /audio changed/);
}));

test('160 scenes over twenty minutes retain absolute frame boundaries without cumulative drift', () => {
  const count = 160;
  const samples = Array.from({ length: count }, (_, i) => 300001 + i * 987);
  const total = samples.reduce((a, b) => a + b, 0);
  const scale = 1200 * 48000 / total;
  const normalized = samples.map(sample => Math.round(sample * scale));
  const duration = normalized.reduce((a, b) => a + b, 0) / 48000;
  const frames = planTimeline(normalized.map(sample => ({ duration: sample / 48000, transition: 'none', transitionDuration: 0 })), duration);
  let cursor = 0;
  frames.forEach((clip, i) => {
    assert.ok(Math.abs(clip.startFrame / 30 - cursor / 48000) <= 1 / 60 + 1e-9);
    cursor += normalized[i];
    if (i + 1 < count) assert.equal(clip.endFrame, frames[i + 1].startFrame);
  });
  assert.equal(frames.at(-1).endFrame, Math.ceil(duration * 30));
});

test('bounded scene rendering keeps scene order, Hindi captions and final audio duration', async () => ws.workspaceContext.run(scope, async () => {
  const dir = path.join(ws.generatedDir(), 'episode');
  for (const color of ['red', 'blue', 'green']) ff(['-f', 'lavfi', '-i', `color=c=${color}:s=160x90`, '-frames:v', '1', path.join(dir, `${color}.png`)]);
  const result = await renderLongVideo({ scriptId: 'episode', imagePaths: ['red.png', 'blue.png', 'green.png'], audioPath: audio.filename,
    resolution: { width: 320, height: 180 }, enableSubtitles: false, sceneAnalysis: { effects: ['hold', 'hold', 'hold'], transitions: [], timings: [] } }, plan, audio.sync);
  const meta = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', result.outputPath], { encoding: 'utf8' }));
  for (const stream of meta.streams) assert.ok(Math.abs(Number(stream.duration) - audio.sync.totalSamples / 48000) <= 1 / 30 + 0.001);
  for (const [i, channel] of [[0, 0], [1, 2], [2, 1]]) {
    const at = (audio.sync.scenes[i].startSample + 12000) / 48000;
    const pixel = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(at), '-i', result.outputPath, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
    assert.ok(pixel[channel] > pixel[(channel + 1) % 3] + 30);
  }
  const captioned = await renderLongVideo({ scriptId: 'episode', imagePaths: ['red.png', 'blue.png', 'green.png'], audioPath: audio.filename,
    resolution: { width: 1920, height: 1080 }, enableSubtitles: true }, plan, audio.sync);
  assert.ok(fs.statSync(captioned.outputPath).size > 0);
}));

test('render API rejects missing sync, altered timing, wrong images and changed narration', async () => {
  assert.equal((await request('/render/start', { scriptId: 'legacy', imagePaths: ['image.png'], audioPath: 'voice.wav' })).status, 400);
  await ws.workspaceContext.run(scope, () => {
    store.add('scripts', { id: 'episode', name: 'Episode', scenePlan: plan, narration: spokenText(plan), generatedAudio: [audio],
      generatedImages: ['red', 'blue', 'green'].map((color, index) => ({ index, prompt: plan.scenes[index].imagePrompt, status: 'done', url: ws.mediaUrl(`generate/file/episode/${color}.png`) })) });
  });
  const body = { scriptId: 'episode', imagePaths: ['red.png', 'blue.png', 'green.png'], audioPath: audio.filename };
  assert.equal((await request('/render/start', { ...body, imagePaths: ['blue.png', 'red.png', 'green.png'] })).status, 400);
  assert.equal((await request('/render/start', { ...body, timelineConfig: { clips: durations.map(duration => ({ duration: duration + 1, transition: 'none', transitionDuration: 0 })) } })).status, 400);
  await request('/scripts/episode', { narration: 'changed' }, 'PUT');
  assert.equal((await request('/render/start', body)).status, 400);
});

test('cancellation keeps reusable scenes and does not publish a partial narration', async () => ws.workspaceContext.run(scope, async () => {
  const controller = new AbortController();
  await assert.rejects(assembleNarration(plan, { scriptId: 'cancelled', language: 'hi', voice: 'test' }, controller.signal,
    completed => { if (completed === 1) controller.abort(); }, fakeTts));
  const dir = path.join(ws.generatedDir(), 'cancelled');
  assert.deepEqual(fs.readdirSync(dir), ['scene-audio-cache']);
  assert.equal(fs.readdirSync(path.join(dir, 'scene-audio-cache')).filter(file => file.endsWith('.pcm')).length, 1);
}));

test('background narration publishes once, survives reconnects and rejects duplicate jobs', async () => ws.workspaceContext.run(scope, async () => {
  const id = 'background';
  store.add('scripts', { id, name: 'Background', scenePlan: plan, narration: spokenText(plan) });
  startNarration({ scriptId: id, language: 'hi', voice: 'test' }, fakeTts);
  assert.equal(narrationStatus(id).status, 'running');
  assert.throws(() => startNarration({ scriptId: id, language: 'hi', voice: 'test' }, fakeTts), /already running/);
  for (let i = 0; i < 100 && narrationStatus(id).status === 'running'; i++) await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(narrationStatus(id).status, 'done', JSON.stringify(narrationStatus(id)));
  const saved = store.getById('scripts', id);
  assert.equal(saved.generatedAudio.length, 1);
  assertNarrationCurrent(saved, saved.generatedAudio[0].filename);
  const otherStatus = ws.workspaceContext.run({ accountId: 'another', profile: 'long' }, () => narrationStatus(id));
  assert.equal(otherStatus.status, 'idle');
  await cancelNarration(id);
  assert.equal(narrationStatus(id).status, 'idle');
  assert.equal(store.getById('scripts', id).generatedAudio.length, 1, 'restarting status does not lose published narration');
}));

test('clearing a script during speech synthesis cannot restore old narration', async () => {
  let release;
  let entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  await ws.workspaceContext.run(scope, async () => {
    store.add('scripts', { id:'clear-running', name:'Clear', scenePlan:plan, narration:spokenText(plan), aiResponse:'Previous' });
    startNarration({scriptId:'clear-running', language:'hi', voice:'test'}, async options => {
      entered(); await gate; return fakeTts(options);
    });
  });
  await waiting;
  const clearing = request('/scripts/clear-running', {aiResponse:'',status:'draft'}, 'PUT');
  await new Promise(resolve => setTimeout(resolve, 30));
  release();
  assert.equal((await clearing).status, 200);
  ws.workspaceContext.run(scope, () => {
    assert.deepEqual(store.getById('scripts','clear-running').generatedAudio, []);
    assert.equal(store.getById('scripts','clear-running').scenePlan, undefined);
    assert.equal(narrationStatus('clear-running').status, 'idle');
  });
});

test('render revisions reject stale video previews after an image or voice changes', () => ws.workspaceContext.run(scope, () => {
  const id = 'revision';
  const script = { id, name:'Revision', scenePlan:plan, narration:spokenText(plan), generatedAudio:[{filename:'voice.wav'}], generatedImages:[{index:0,url:'image.png',prompt:'image',status:'done'}] };
  store.add('scripts', script);
  const file = path.join(directory, 'revision.mp4');
  fs.writeFileSync(`${file}.json`, JSON.stringify({ revision: renderRevision(id) }));
  assert.equal(isCurrentRender(id, file), true);
  store.add('scripts', { ...script, timelineConfig: { bgmTrack: 'none', bgmVolume: 0.2, ttsVolume: 1.3 } });
  assert.equal(isCurrentRender(id, file), false, 'changed audio mix must invalidate the old preview');
  store.add('scripts', { ...script, generatedAudio:[{filename:'new.wav'}] });
  assert.equal(isCurrentRender(id, file), false);
  store.add('scripts', { ...script, generatedImages:[] });
  assert.equal(isCurrentRender(id, file), false);
}));

test.after(async () => {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  assert.ok(path.relative(root, directory).startsWith('long-test-'));
  fs.rmSync(directory, { recursive: true, force: true });
});
