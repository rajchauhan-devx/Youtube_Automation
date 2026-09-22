import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const directory = fs.mkdtempSync(path.resolve('server/data/auto-edit-test-'));
process.env.TUBEFLOW_DATA_DIR = directory;
const ws = await import('../dist/services/workspace.js');
const { renderLongVideo } = await import('../dist/services/video.js');
const { editingPreset, validateEditingSettings, autoEditPlan, captionPhrases, autoEditAss, autoAudioGraph } = await import('../dist/services/auto-edit.js');
const ff = args => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { windowsHide: true, stdio: 'pipe', maxBuffer: 8 * 1024 * 1024 });
const scene = (id, chapter = 'Opening', mediaType = 'image') => ({ id, chapter, mediaType, ...(mediaType === 'video' ? { duration: 10 } : {}), role: 'story', narration: 'A clear story begins here. Each scene adds a little more detail.', imagePrompt: id });
const plan = { version: 1, title: 'A story', thumbnailPrompt: 'Cover', scenes: [scene('one'), scene('two'), scene('three', 'Next chapter', 'video')] };
const scope = { accountId: 'default', profile: 'mixed' };

test('automatic decisions vary motion, preserve video motion and respect chapter/scene overrides', () => {
  const settings = editingPreset();
  const decisions = autoEditPlan(plan, settings);
  assert.deepEqual(decisions.map(item => item.transition), ['cut', 'dissolve', 'dip-black']);
  assert.deepEqual(decisions.map(item => item.motion), ['push-in', 'pan-right', 'source']);
  assert.deepEqual(decisions.map(item => item.title), ['', '', '']);
  settings.overrides.two = { motion: 'hold', transition: 'cut' };
  settings.overrides.three = { motion: 'push-in' };
  assert.equal(autoEditPlan(plan, settings)[1].motion, 'hold');
  assert.equal(autoEditPlan(plan, settings)[1].transition, 'cut');
  assert.equal(autoEditPlan(plan, settings)[2].motion, 'source');
  assert.throws(() => validateEditingSettings({ ...settings, transitionSeconds: NaN }), /range/);
  assert.throws(() => validateEditingSettings({ ...settings, overrides: { two: { transition: 'injected;filter' } } }), /override/);
  for (const preset of ['clean', 'cinematic', 'documentary']) validateEditingSettings(editingPreset(preset));
});

test('captions split into safe short phrases without chapter or block overlays', () => {
  const phrases = captionPhrases('A long narration should be split into readable phrases. Here is the next thought.', 6);
  assert.ok(phrases.length >= 3);
  assert.ok(phrases.every(phrase => phrase.split(' ').length <= 6));
  const ass = autoEditAss('Hello {\\pos(0,0)} world. यह हिंदी की कहानी है।', 10, 'Chapter {\\pos(1,1)}', 1920, 1080, editingPreset(), true);
  assert.ok(!ass.includes('{\\pos('));
  assert.ok(ass.includes('यह हिंदी'));
  assert.ok(!ass.includes('Chapter'));
  assert.ok(!ass.includes('Style: Chapter'));
  assert.ok(ass.includes('Style: Caption'));
});

test('polished render keeps exact duration, blends scene boundaries and finishes moving 10-second clips', async () => ws.workspaceContext.run(scope, async () => {
  const dir = path.join(ws.generatedDir(), 'episode'); fs.mkdirSync(dir, { recursive: true });
  ff(['-f', 'lavfi', '-i', 'color=c=red:s=160x90', '-frames:v', '1', path.join(dir, 'red.png')]);
  ff(['-f', 'lavfi', '-i', 'color=c=blue:s=160x90', '-frames:v', '1', path.join(dir, 'blue.png')]);
  ff(['-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=30', '-t', '10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(dir, 'video.mp4')]);
  ff(['-f', 'lavfi', '-i', 'sine=f=440:r=48000', '-t', '14', path.join(dir, 'voice.wav')]);
  const music = path.join(dir, 'music.wav'); ff(['-f', 'lavfi', '-i', 'sine=f=110:r=48000', '-t', '2', music]);
  const settings = { ...editingPreset('cinematic'), grain: true, sharpen: true, letterbox: true, chapterSound: true, transitionSeconds: 0.5 };
  const sync = { version: 1, planHash: 'fixture', sampleRate: 48000, totalSamples: 14 * 48000,
    scenes: [{ sceneId: 'one', startSample: 0, endSample: 96000 }, { sceneId: 'two', startSample: 96000, endSample: 192000 }, { sceneId: 'three', startSample: 192000, endSample: 672000 }] };
  const result = await renderLongVideo({ scriptId: 'episode', imagePaths: ['red.png', 'blue.png', 'video.mp4'], audioPath: 'voice.wav', bgmPath: music, editing: settings,
    resolution: { width: 320, height: 180 }, enableSubtitles: true }, plan, sync);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', result.outputPath], { windowsHide: true, encoding: 'utf8' }));
  for (const stream of probe.streams) assert.ok(Math.abs(Number(stream.duration) - 14) < 0.035, `${stream.codec_type}: ${stream.duration}`);
  const pixel = time => ff(['-ss', String(time), '-i', result.outputPath, '-frames:v', '1', '-vf', 'crop=20:20:150:80,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  const blend = pixel(2.25); assert.ok(blend[0] > 30 && blend[2] > 30, `Expected a red/blue dissolve, got ${[...blend]}`);
  const dip = pixel(4); assert.ok(Math.max(...dip) < 25, 'chapter change should dip through black');
  assert.notDeepEqual(pixel(6), pixel(11), 'source video must retain motion');
  assert.deepEqual(fs.readdirSync(path.dirname(result.outputPath)), [result.filename], 'intermediate render files are cleaned');
}));

test('music ducking responds to speech and recovers in pauses without changing audio duration', () => {
  const voice = path.join(directory, 'duck-voice.wav'), music = path.join(directory, 'duck-music.wav'), output = path.join(directory, 'duck.wav');
  ff(['-f', 'lavfi', '-i', "aevalsrc='if(between(t,2,4),0.25*sin(2*PI*440*t),0)':s=48000:d=8", voice]);
  ff(['-f', 'lavfi', '-i', 'aevalsrc=0.2*sin(2*PI*110*t):s=48000:d=8', music]);
  const settings = { ...editingPreset(), voicePolish: false };
  ff(['-f', 'lavfi', '-i', 'color=s=16x16:d=8', '-i', voice, '-i', music, '-filter_complex', autoAudioGraph(settings, 8, 1, 1, true, []), '-map', '[a]', output]);
  const energy = time => {
    const data = ff(['-ss', String(time), '-i', output, '-t', '0.3', '-af', 'bandpass=f=110:width_type=h:w=20', '-f', 'f32le', '-ac', '1', 'pipe:1']);
    let sum = 0; for (let i = 0; i < data.length; i += 4) sum += data.readFloatLE(i) ** 2;
    return Math.sqrt(sum / (data.length / 4));
  };
  assert.ok(energy(1.3) > energy(3) * 2, 'music should lower during narration');
  assert.ok(energy(5.5) > energy(3) * 2, 'music should recover after narration');
  const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', output], { encoding: 'utf8', windowsHide: true }));
  assert.equal(duration, 8);
});

test.after(() => {
  assert.ok(directory.startsWith(path.resolve('server/data') + path.sep));
  fs.rmSync(directory, { recursive: true, force: true });
});
