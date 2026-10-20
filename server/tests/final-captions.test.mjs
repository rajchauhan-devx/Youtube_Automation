import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { synchronizedCaptionAss } from '../dist/services/final-captions.js';
import { savedGraphicsFilter } from '../dist/services/render-graphics.js';
import { editingPreset } from '../dist/services/auto-edit.js';
import { runMedia } from '../dist/services/media-process.js';

test('final caption timeline retains scene boundaries and punctuation', () => {
  const plan = { scenes: [{ narration: 'First scene, with a comma.' }, { narration: 'Second scene.' }] };
  const sync = { sampleRate: 100, totalSamples: 250, scenes: [{ startSample: 0, endSample: 100 }, { startSample: 100, endSample: 250 }] };
  const ass = synchronizedCaptionAss(plan, sync, 640, 360, editingPreset('documentary'));
  const lines = ass.split('\n').filter(line => line.startsWith('Dialogue:'));
  assert.ok(lines.some(line => line.includes('First scene, with a comma.')));
  assert.ok(lines.some(line => line.includes(',0:00:01.00,0:00:02.50,') && line.includes('Second scene.')));
  assert.equal((ass.match(/\[Script Info\]/g) || []).length, 1);
  const portrait = synchronizedCaptionAss(plan, sync, 1080, 1920, editingPreset('documentary'));
  const style = portrait.split('\n').find(line => line.startsWith('Style: Caption,')).split(',');
  assert.equal(style[19], '86'); assert.equal(style[20], '173', 'portrait reserves the right-side Shorts controls');
});

test('final encoded captions remain above an opaque graphic and preserve the audio', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caption-stack-'));
  try {
    await runMedia('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=blue:s=640x360:r=30:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', 'base.mp4'], undefined, dir);
    await runMedia('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=red:s=640x360:r=30:d=1', '-c:v', 'libvpx', '-b:v', '1M', '-an', 'graphics.webm'], undefined, dir);
    const plan = { scenes: [{ narration: 'CAPTION VISIBLE' }] };
    const sync = { sampleRate: 100, totalSamples: 100, scenes: [{ startSample: 0, endSample: 100 }] };
    const ass = synchronizedCaptionAss(plan, sync, 640, 360, editingPreset('documentary')).replace('Nirmala UI,14,', 'Arial,32,');
    fs.writeFileSync(path.join(dir, 'captions.ass'), ass);
    await runMedia('ffmpeg', ['-v', 'error', '-y', '-i', 'base.mp4', '-c:v', 'libvpx', '-i', 'graphics.webm',
      '-filter_complex', savedGraphicsFilter(true), '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'copy', 'final.mp4'], undefined, dir);
    await runMedia('ffmpeg', ['-v', 'error', '-y', '-ss', '0.5', '-i', 'final.mp4', '-frames:v', '1', 'frame.png'], undefined, dir);
    const { data, info } = await sharp(path.join(dir, 'frame.png')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let white = 0;
    for (let y = 250; y < 360; y++) for (let x = 0; x < 640; x++) {
      const i = (y * info.width + x) * info.channels;
      if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) white++;
    }
    assert.ok(white > 100, 'white caption must be visible over the opaque red graphic');
    const meta = JSON.parse(await runMedia('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', 'final.mp4'], undefined, dir));
    assert.ok(meta.streams.some(s => s.codec_type === 'audio'));
    assert.ok(Math.abs(Number(meta.format.duration) - 1) < 0.1);
  } finally {
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Hindi caption composite uses complex shaping rather than misplaced vowel marks', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caption-shaping-'));
  try {
    const plan = { scenes: [{ narration: 'मंदिर निर्माण किया' }] };
    const sync = { sampleRate: 100, totalSamples: 100, scenes: [{ startSample: 0, endSample: 100 }] };
    fs.writeFileSync(path.join(dir, 'captions.ass'), synchronizedCaptionAss(plan, sync, 640, 360, editingPreset('documentary')).replace('Nirmala UI,14,', 'Nirmala UI,48,'));
    for (const [name, graph] of [
      ['actual', savedGraphicsFilter(true)],
      ['complex', '[0:v][1:v]overlay,ass=captions.ass:shaping=complex,format=yuv420p[v]'],
      ['simple', '[0:v][1:v]overlay,ass=captions.ass:shaping=simple,format=yuv420p[v]'],
    ]) {
      await runMedia('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=blue:s=640x360:r=30:d=1', '-f', 'lavfi', '-i', 'color=red:s=640x360:r=30:d=1', '-filter_complex', graph, '-map', '[v]', '-ss', '0.5', '-frames:v', '1', `${name}.png`], undefined, dir);
    }
    const pixels = await Promise.all(['actual', 'complex', 'simple'].map(name => sharp(path.join(dir, `${name}.png`)).raw().toBuffer()));
    assert.deepEqual(pixels[0], pixels[1], 'final composition must preserve HarfBuzz glyph shaping');
    assert.notDeepEqual(pixels[0], pixels[2], 'simple shaping visibly misplaces the Hindi vowel marks');
  } finally {
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
