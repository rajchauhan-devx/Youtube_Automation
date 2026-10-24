import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { ensureDefaultSfx, SFX_DIR, resolveSfxForGraphicKind } from '../dist/services/sfx.js';
import { compositeSavedGraphics } from '../dist/services/render-graphics.js';
import { runMedia } from '../dist/services/media-process.js';

test('motion graphics sound effects synthesize and resolve distinct audio signatures', async () => {
  await ensureDefaultSfx();

  const requiredFiles = [
    'whoosh.mp3',
    'sub_impact.mp3',
    'impact.mp3',
    'paper_slide.mp3',
    'shutter_click.mp3',
    'hud_ping.mp3',
    'telemetry_ticker.mp3',
    'teletype_chatter.mp3',
  ];

  for (const file of requiredFiles) {
    const fullPath = path.join(SFX_DIR, file);
    assert.ok(fs.existsSync(fullPath), `SFX file ${file} must exist`);
    assert.ok(fs.statSync(fullPath).size > 500, `SFX file ${file} must not be empty`);
  }

  // Verify archetype mapping
  assert.equal(path.basename(resolveSfxForGraphicKind('counter') || ''), 'telemetry_ticker.mp3');
  assert.equal(path.basename(resolveSfxForGraphicKind('badge') || ''), 'shutter_click.mp3');
  assert.equal(path.basename(resolveSfxForGraphicKind('lower-third') || ''), 'shutter_click.mp3');
  assert.equal(path.basename(resolveSfxForGraphicKind('frame', 'Archive Document') || ''), 'paper_slide.mp3');
  assert.equal(path.basename(resolveSfxForGraphicKind('frame', 'Radio Dispatch', 'Cockpit transcript') || ''), 'teletype_chatter.mp3');
  assert.equal(path.basename(resolveSfxForGraphicKind('spotlight') || ''), 'hud_ping.mp3');
  assert.equal(path.basename(resolveSfxForGraphicKind('route') || ''), 'hud_ping.mp3');
  assert.equal(path.basename(resolveSfxForGraphicKind('title') || ''), 'sub_impact.mp3');
  assert.equal(resolveSfxForGraphicKind('caption'), null, 'Captions should not produce graphic SFX');
});

test('compositeSavedGraphics mixes motion graphics SFX and preserves exact narration duration', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfx-composite-test-'));
  try {
    const durationSec = 3.0;
    const baseVideo = path.join(dir, 'base.mp4');

    // Create 3.0s base video with silent/sine audio
    await runMedia('ffmpeg', [
      '-v', 'error', '-y',
      '-f', 'lavfi', '-i', `color=black:s=640x360:r=30:d=${durationSec}`,
      '-f', 'lavfi', '-i', `sine=f=440:r=48000:d=${durationSec}`,
      '-c:v', 'libx264', '-c:a', 'aac', '-b:a', '128k',
      '-t', String(durationSec),
      baseVideo,
    ], undefined, dir);

    // Mock project with a counter artifact starting at frame 30 (1.0s)
    const mockProject = {
      id: crypto.randomUUID(),
      revisionId: 'rev-1',
      status: 'ready',
      inputs: { fps: 30, durationFrames: 90, width: 640, height: 360 },
      scenes: [{ id: 'scene-0', startFrame: 0, endFrame: 90, assetId: 'dummy' }],
      artifacts: [
        {
          id: 'art-counter-1',
          sceneId: 'scene-0',
          enabled: true,
          startFrame: 30, // 1.0 second delay
          endFrame: 90,
          graphic: {
            kind: 'counter',
            title: '4,500',
            detail: 'Altitude',
          },
        },
      ],
    };

    const renderResult = {
      outputPath: baseVideo,
      duration: durationSec,
      size: fs.statSync(baseVideo).size,
      filename: 'base.mp4',
    };

    await compositeSavedGraphics(
      renderResult,
      mockProject,
      new AbortController().signal,
      () => {},
      undefined,
      undefined,
      true, // enableSfx
    );

    assert.ok(fs.existsSync(baseVideo), 'Output video must exist after composite');

    const probe = JSON.parse(await runMedia('ffprobe', [
      '-v', 'error',
      '-show_streams',
      '-of', 'json',
      baseVideo,
    ], undefined, dir));

    const audioStream = probe.streams.find((s) => s.codec_type === 'audio');
    const videoStream = probe.streams.find((s) => s.codec_type === 'video');

    assert.ok(audioStream, 'Audio stream must be present in composited video');
    assert.ok(videoStream, 'Video stream must be present in composited video');

    const audioDuration = Number(audioStream.duration);
    assert.ok(
      Math.abs(audioDuration - durationSec) <= (1 / 30) + 0.002,
      `Composited audio duration ${audioDuration} must match ${durationSec} within 1 frame`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
