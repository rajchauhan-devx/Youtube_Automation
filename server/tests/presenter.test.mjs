import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { compositePresenter, presenterCacheKey, presenterAvatars, avatarPreview } from '../dist/services/presenter.js';
import { defaultPresenter, validatePresenter, reservePresenterCaptionSpace, presenterCaptionLayout, presenterGeometry } from '../dist/services/presenter-settings.js';
import { renderVideo, renderLongVideo } from '../dist/services/video.js';
import { generatedDir, outputDir } from '../dist/services/workspace.js';
import { avatarAlphaSource, avatarAlphaCycle } from '../dist/services/presenter-alpha.js';
import { editingPreset } from '../dist/services/auto-edit.js';

const id = `presenter-test-${Date.now()}`;
const directory = path.join(generatedDir(), id);
fs.mkdirSync(directory, { recursive: true });
const ff = args => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { windowsHide: true, stdio: 'pipe' });
const probe = file => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', file], { encoding: 'utf8' }));
const p = { ...defaultPresenter(), enabled: true, widthPercent: 25, bottomPercent: 10, marginPercent: 5, crop: { x: 0, y: 0, width: 100, height: 100 } };
const source = path.join(directory, 'presenter.mp4');
ff(['-f', 'lavfi', '-i', 'color=blue:s=80x80:r=25', '-f', 'lavfi', '-i', 'sine=frequency=1900', '-t', '1.96', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', source]);
ff(['-f', 'lavfi', '-i', 'color=red:s=320x180', '-frames:v', '1', path.join(directory, 'red.png')]);
ff(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '2', path.join(directory, 'voice.wav')]);
const opts = { scriptId: id, imagePaths: ['red.png'], audioPath: 'voice.wav', resolution: { width: 320, height: 180 },
  colorGrade: 'none', enableVignette: false, presenter: p, presenterPath: source,
  sceneAnalysis: { effects: ['hold'], transitions: [], timings: [] } };

test('presenter input validation rejects malformed paths, crops and filter injection', () => {
  for (const patch of [{ avatarId: '../escape' }, { widthPercent: '25;movie=x' }, { crop: { x: 80, y: 0, width: 40, height: 100 } }, { bottomPercent: NaN }, { silenceGate: 'true' }]) {
    assert.throws(() => validatePresenter({ ...p, ...patch }));
  }
  assert.throws(() => avatarPreview('../escape'));
  const ass = '[Script Info]\nPlayResX: 320\n[V4+ Styles]\nFormat: Name,MarginL,MarginR\nStyle: Default,10,10\n[Events]\n';
  assert.match(reservePresenterCaptionSpace(ass, p), /Style: Default,16,16/);
});

test('captions stay centered above the presenter across sizes, crops and video formats', () => {
  for (const canvas of [{ width: 1920, height: 1080 }, { width: 1080, height: 1920 }]) {
    for (const source of [{ width: 1280, height: 720 }, { width: 704, height: 1216 }]) {
      for (const crop of [p.crop, { x: 32, y: 2, width: 40, height: 67 }]) {
        for (const widthPercent of [10, 25, 40]) {
          const settings = { ...p, crop, widthPercent };
          const layout = presenterCaptionLayout(settings, canvas.width, canvas.height, source.width, source.height);
          const avatar = presenterGeometry(settings, canvas.width, canvas.height, source.width, source.height);
          assert.ok(layout.bottom > avatar.bottom + avatar.height);
          assert.equal(layout.side, Math.ceil(canvas.width * 0.05), 'horizontal margins never depend on avatar width');
          const ass = `[Script Info]\nPlayResX: ${canvas.width}\nPlayResY: ${canvas.height}\n[V4+ Styles]\nFormat: Name,Alignment,MarginL,MarginR,MarginV\nStyle: Caption,2,96,700,60\n[Events]\nDialogue: unchanged\n`;
          assert.match(reservePresenterCaptionSpace(ass, settings, source), new RegExp(`Style: Caption,2,${layout.side},${layout.side},${layout.bottom}`));
          assert.equal(reservePresenterCaptionSpace(ass, { ...settings, enabled: false }, source), ass);
        }
      }
    }
  }
  const ass = '[Script Info]\nPlayResX: 1080\nPlayResY: 1920\n[V4+ Styles]\nFormat: Name,MarginV\nStyle: Caption,0';
  const layout = presenterCaptionLayout(p, 1920, 1080, 1280, 720);
  assert.match(reservePresenterCaptionSpace(ass, p, { width: 1280, height: 720 }, { width: 1920, height: 1080 }), new RegExp(`Style: Caption,${Math.ceil(layout.bottom / 1080 * 1920)}`));
});

function verify(file) {
  const streams = probe(file).streams;
  assert.equal(streams.filter(s => s.codec_type === 'audio').length, 1);
  const video = streams.find(s => s.codec_type === 'video');
  assert.equal(video.r_frame_rate, '30/1');
  assert.ok(Math.abs(Number(video.duration) - 2) <= 1 / 30);
  for (const [x, y, channel] of [[10, 10, 0], [250, 130, 2]]) {
    const pixel = ff(['-ss', '1.9', '-i', file, '-frames:v', '1', '-vf', `crop=2:2:${x}:${y},scale=1:1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
    assert.ok(pixel[channel] > 180, `wrong overlay placement: ${[...pixel]}`);
  }
  const samples = ff(['-i', file, '-af', 'bandpass=f=1900:width_type=h:w=20', '-f', 'f32le', '-ac', '1', 'pipe:1']);
  let energy = 0;
  for (let i = 0; i < samples.length; i += 4) energy += samples.readFloatLE(i) ** 2;
  assert.ok(Math.sqrt(energy / (samples.length / 4)) < 0.005, 'presenter audio must not leak into the mix');
}
test('Shorts renderer composites at the requested location, preserves duration, and ignores presenter audio', async () => {
  const result = await renderVideo(opts);
  verify(result.outputPath);
});
test('long renderer uses the same overlay and preserves scene/narration timing', async () => {
  const plan = { version: 1, title: 'Test', scenes: [{ id: 'S1', chapter: 'Test', role: 'story', narration: 'Hello', imagePrompt: 'Red' }] };
  const sync = { totalSamples: 96000, sampleRate: 48000, scenes: [{ startSample: 0, endSample: 96000 }] };
  const result = await renderLongVideo(opts, plan, sync);
  verify(result.outputPath);
});

test('burned-in subtitles stay centered and above both small and large avatars', async () => {
  const plan = { version: 1, title: 'Test', scenes: [{ id: 'S1', chapter: 'Test', role: 'story', narration: 'CENTERED', imagePrompt: 'Red' }] };
  const sync = { totalSamples: 96000, sampleRate: 48000, scenes: [{ startSample: 0, endSample: 96000 }] };
  for (const widthPercent of [20, 40]) {
    const presenter = { ...p, widthPercent };
    const result = await renderLongVideo({ ...opts, resolution: { width: 640, height: 360 }, enableSubtitles: true, presenter }, plan, sync);
    const pixels = ff(['-ss', '1', '-i', result.outputPath, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
    let left = 640, right = -1, bottom = -1;
    for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) {
      const index = (y * 640 + x) * 3;
      if (pixels[index] > 190 && pixels[index + 1] > 190 && pixels[index + 2] > 190) {
        left = Math.min(left, x); right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
    }
    assert.ok(right > left, 'render contains visible white subtitles');
    assert.ok(Math.abs((left + right) / 2 - 320) < 5, `subtitle center: ${(left + right) / 2}`);
    const geo = presenterGeometry(presenter, 640, 360, 80, 80);
    assert.ok(bottom < 360 - geo.bottom - geo.height, `subtitle bottom ${bottom} must be above avatar`);
  }
});
test('green-screen cutout reveals the background and cancellation preserves the base', async () => {
  const green = path.join(directory, 'green.mp4');
  ff(['-f', 'lavfi', '-i', 'color=0x00FF00:s=80x80:r=25', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', green]);
  const base = await renderVideo({ ...opts, presenter: undefined, presenterPath: undefined });
  const before = fs.readFileSync(base.outputPath);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(compositePresenter(base.outputPath, source, p, 320, 180, 2, controller.signal));
  assert.deepEqual(fs.readFileSync(base.outputPath), before);
  await compositePresenter(base.outputPath, green, { ...p, style: 'green-screen' }, 320, 180, 2);
  const pixel = ff(['-ss', '1', '-i', base.outputPath, '-frames:v', '1', '-vf', 'crop=2:2:250:130,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  assert.ok(pixel[0] > 180 && pixel[1] < 40, 'green background should be transparent');
});

test('subtitle off removes captions in manual and automatic renders without removing audio', async () => {
  const plan = { version: 1, title: 'Test', scenes: [{ id: 'S1', chapter: 'Test', role: 'story', narration: 'HIDDEN CAPTION', imagePrompt: 'Red' }] };
  const sync = { totalSamples: 96000, sampleRate: 48000, scenes: [{ startSample: 0, endSample: 96000 }] };
  for (const automatic of [false, true]) {
    const result = await renderLongVideo({ ...opts, presenter: undefined, presenterPath: undefined,
      resolution: { width: 640, height: 360 }, enableSubtitles: false,
      editing: automatic ? { ...editingPreset(), enabled: true, captions: true, colorLook: 'none', vignette: false, bookendFades: false } : undefined }, plan, sync);
    const pixels = ff(['-ss', '1', '-i', result.outputPath, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
    let white = 0;
    for (let i = 0; i < pixels.length; i += 3) if (pixels[i] > 190 && pixels[i + 1] > 190 && pixels[i + 2] > 190) white++;
    assert.equal(white, 0, `no burned-in captions with automatic=${automatic}`);
    assert.equal(probe(result.outputPath).streams.filter(s => s.codec_type === 'audio').length, 1);
  }
});
test('cache reuse depends on narration content and lip-sync settings, not crop or size', async () => {
  if (!presenterAvatars().some(a => a.id === p.avatarId)) return;
  const audio = path.join(directory, 'voice.wav');
  const first = await presenterCacheKey(audio, p);
  assert.equal(await presenterCacheKey(audio, { ...p, widthPercent: 30, crop: { x: 20, y: 0, width: 80, height: 100 } }), first);
  assert.notEqual(await presenterCacheKey(audio, { ...p, silenceThresholdDb: -35 }), first);
  fs.appendFileSync(audio, Buffer.from('modified'));
  assert.notEqual(await presenterCacheKey(audio, p), first);
});

test('transparent cutout preserves black pixels and follows the forward/reverse loop', async () => {
  const previousRoot = process.env.MUSETALK_ROOT;
  const root = path.join(directory, 'fake-musetalk');
  const avatar = path.join(root, 'avatars', 'prepared', 'alpha_test');
  fs.mkdirSync(avatar, { recursive: true });
  const original = path.join(avatar, 'original.webm');
  ff(['-f', 'lavfi', '-i', "color=black:s=80x80:r=25,format=rgba,geq=r=0:g=0:b=0:a='if(lt(N,5),if(lt(X,40),255,0),if(lt(X,40),0,255))'",
    '-frames:v', '10', '-c:v', 'libvpx-vp9', '-lossless', '1', '-pix_fmt', 'yuva420p', original]);
  fs.writeFileSync(path.join(avatar, 'metadata.json'), JSON.stringify({ source_path: original, fps: 25, resolution: '80x80', num_frames_cycle: 20 }));
  let saved;
  try {
    process.env.MUSETALK_ROOT = root;
    saved = avatarAlphaSource(avatar);
    assert.ok(saved);
    assert.equal(avatarPreview('alpha_test', true), saved);
    const mask = await avatarAlphaCycle(avatar);
    assert.equal(await avatarAlphaCycle(avatar), mask, 'mask is cached');
    const frameInfo = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', mask], { encoding: 'utf8' }));
    assert.equal(Number(frameInfo.streams[0].nb_read_frames), 20);
    const black = path.join(directory, 'black.mp4');
    ff(['-f', 'lavfi', '-i', 'color=black:s=80x80:r=25', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', black]);
    const base = await renderVideo({ ...opts, presenter: undefined, presenterPath: undefined });
    await compositePresenter(base.outputPath, black, { ...p, avatarId: 'alpha_test', style: 'transparent' }, 320, 180, 2);
    for (const [time, leftOpaque] of [[0.08, true], [0.28, false], [0.44, false], [0.72, true], [1.04, false], [1.68, true]]) {
      for (const [x, opaque] of [[240, leftOpaque], [280, !leftOpaque]]) {
        const pixel = ff(['-ss', String(time), '-i', base.outputPath, '-frames:v', '1', '-vf', `crop=2:2:${x}:120,scale=1:1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
        assert.ok(opaque ? pixel[0] < 30 : pixel[0] > 180, `alpha mismatch at ${time}, x=${x}: ${[...pixel]}`);
      }
    }
    const cropped = await renderVideo({ ...opts, presenter: undefined, presenterPath: undefined });
    await compositePresenter(cropped.outputPath, black, { ...p, avatarId: 'alpha_test', style: 'transparent', crop: { x: 50, y: 0, width: 50, height: 100 } }, 320, 180, 2);
    const pixel = ff(['-ss', '0.08', '-i', cropped.outputPath, '-frames:v', '1', '-vf', 'crop=2:2:280:120,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
    assert.ok(pixel[0] > 180, 'crop is also applied to the alpha mask');
    fs.unlinkSync(original);
    assert.equal(avatarAlphaSource(avatar), saved, 'transparency survives Gradio upload cleanup');
    assert.throws(() => avatarPreview('missing', true));
  } finally {
    if (previousRoot === undefined) delete process.env.MUSETALK_ROOT;
    else process.env.MUSETALK_ROOT = previousRoot;
    if (saved) fs.rmSync(path.dirname(saved), { recursive: true, force: true });
  }
});
test.after(() => {
  for (const base of [generatedDir(), outputDir()]) {
    const target = path.resolve(base, id);
    assert.equal(path.dirname(target), path.resolve(base));
    fs.rmSync(target, { recursive: true, force: true });
  }
});
