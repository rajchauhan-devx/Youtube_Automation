import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderVideo, resolveInputPath, serveVideoFile } from '../dist/services/video.js';
import { planTimeline } from '../dist/services/timeline.js';
import { safeSegment } from '../dist/services/paths.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const id = `render-test-${Date.now()}`;
const fixture = path.join(root, 'data', 'generated', id);
fs.mkdirSync(fixture, { recursive: true });
const ff = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'pipe' });
for (const color of ['red', 'blue', 'green']) ff(['-f', 'lavfi', '-i', `color=c=${color}:s=160x90`, '-frames:v', '1', path.join(fixture, `${color}.png`)]);
for (const duration of [3, 7]) ff(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', String(duration), path.join(fixture, `voice${duration}.wav`)]);
ff(['-f', 'lavfi', '-i', 'sine=frequency=110:sample_rate=48000', '-t', '1', path.join(fixture, 'music1.wav')]);

function probe(file) {
  return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
}
const opts = { scriptId: id, imagePaths: ['red.png', 'blue.png', 'green.png'], audioPath: 'voice3.wav',
  resolution: { width: 160, height: 90 }, enableVignette: false, colorGrade: 'none',
  sceneAnalysis: { effects: ['hold', 'hold', 'hold'], transitions: [], timings: [] } };

test('rejects traversal and media outside the current script', () => {
  for (const value of ['.', '..', '../secrets', 'a/b', '', null]) assert.equal(safeSegment(value), false);
  assert.throws(() => resolveInputPath('voice3.wav', '..'));
  assert.throws(() => resolveInputPath(path.join(root, 'data', 'youtube-token.json'), id));
  assert.equal(serveVideoFile(id, 'unfinished.partial.mp4'), null);
});

test('manual timing is validated rather than silently scaled', () => {
  assert.throws(() => planTimeline([{ duration: 2, transition: 'none', transitionDuration: 0 }], 3), /does not match/);
  assert.throws(() => planTimeline([{ duration: NaN, transition: 'fade', transitionDuration: 0.5 }], 3));
});

test('mixed transitions retain narration duration and scene order', async () => {
  const result = await renderVideo({ ...opts, timelineConfig: { clips: [
    { duration: 1.2, transition: 'crossfade', transitionDuration: 0.2 },
    { duration: 0.7, transition: 'none', transitionDuration: 0.5 },
    { duration: 1.1, transition: 'none', transitionDuration: 0 },
  ] } });
  const metadata = probe(result.outputPath);
  const video = metadata.streams.find(s => s.codec_type === 'video');
  const audio = metadata.streams.find(s => s.codec_type === 'audio');
  assert.equal(video.r_frame_rate, '30/1');
  assert.ok(Math.abs(Number(video.duration) - Number(audio.duration)) <= 1 / 30);
  assert.ok(Math.abs(Number(video.duration) - 3) <= 1 / 30);
  for (const [time, dominant] of [[0.8, 0], [1.6, 2], [2.5, 1]]) {
    const pixels = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(time), '-i', result.outputPath, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
    assert.ok(pixels[dominant] > pixels[(dominant + 1) % 3] + 40, `wrong scene at ${time}s: ${[...pixels]}`);
  }
});

test('one image covers a seven-second narration', async () => {
  const result = await renderVideo({ ...opts, imagePaths: ['red.png'], audioPath: 'voice7.wav' });
  const metadata = probe(result.outputPath);
  assert.ok(Math.abs(Number(metadata.streams.find(s => s.codec_type === 'video').duration) - 7) <= 1 / 30);
});

test('short background music repeats through the full video duration', async () => {
  const result = await renderVideo({ ...opts, imagePaths: ['red.png'], audioPath: 'voice7.wav', bgmPath: path.join(fixture, 'music1.wav'), bgmVolume: 1 });
  const metadata = probe(result.outputPath);
  const audio = metadata.streams.find(s => s.codec_type === 'audio');
  assert.ok(Math.abs(Number(audio.duration) - 7) <= 1 / 30);
  const tail = ff(['-ss', '5.25', '-i', result.outputPath, '-t', '0.4', '-af', 'bandpass=f=110:width_type=h:w=20', '-f', 'f32le', '-ac', '1', 'pipe:1']);
  let energy = 0;
  for (let i = 0; i < tail.length; i += 4) energy += tail.readFloatLE(i) ** 2;
  assert.ok(Math.sqrt(energy / (tail.length / 4)) > 0.01, 'looped music should still be audible near the end');
});

test('cancellation stops FFmpeg and removes partial output', async () => {
  const controller = new AbortController();
  const rendering = renderVideo({ ...opts, resolution: { width: 1080, height: 1920 }, signal: controller.signal });
  const timer = setTimeout(() => controller.abort(), 150);
  await assert.rejects(rendering);
  clearTimeout(timer);
  const output = path.join(root, 'data', 'output', id);
  assert.equal(fs.readdirSync(output).some(f => f.endsWith('.partial.mp4')), false);
});

test.after(() => {
  // Only test-owned directories, both constructed beneath this repository.
  for (const directory of [fixture, path.join(root, 'data', 'output', id)]) {
    const relative = path.relative(root, path.resolve(directory));
    assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(directory) === id);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
