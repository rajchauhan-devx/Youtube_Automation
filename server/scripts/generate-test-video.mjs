import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { buildHyperFramesComposition } from '../dist/services/editing/hyperframes-builder.js';

const scriptsPath = path.resolve(import.meta.dirname, '../data/scripts.json');
const rawScripts = JSON.parse(fs.readFileSync(scriptsPath, 'utf8'));
const script = rawScripts.find((s) => s.id === 'usr_1787934167716');

if (!script || !script.dynamicMotionGraphics || script.dynamicMotionGraphics.length === 0) {
  throw new Error('Script usr_1787934167716 with dynamic motion graphics not found');
}

console.log('=== Real-Time Dynamic Motion Graphics Video Generator ===');
console.log(`Script: ${script.name} (${script.id})`);
console.log(`Topic: ${script.topicName}`);

// Select the key climax motion graphic: "शिवधनुः पिनाक" (Divine Astra Focus)
const graphic = script.dynamicMotionGraphics.find(g => g.type === 'divine_astra_focus') || script.dynamicMotionGraphics[0];
console.log(`Selected Graphic: "${graphic.title}" (${graphic.type})`);
console.log(`Cue: "${graphic.cuePhrase}"`);
console.log(`Placement: ${graphic.placement.position}`);

const width = 1080;
const height = 1920;
const fps = 30;
const durationSec = 4.0; // 4 seconds test render
const durationFrames = Math.round(durationSec * fps);

const artifactsDir = path.resolve(import.meta.dirname, '../artifacts');
fs.mkdirSync(artifactsDir, { recursive: true });

const compDir = path.join(os.tmpdir(), `hf-comp-${Date.now()}`);
fs.mkdirSync(compDir, { recursive: true });

// Build the mock project with the dynamic motion artifact
const mockProject = {
  id: 'proj_ancient_dharma_test',
  revisionId: 'rev_1',
  scriptId: script.id,
  accountId: 'default',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  inputs: {
    title: script.name,
    scriptText: script.narration || '',
    fps,
    width,
    height,
    durationFrames,
    imageAssets: [],
    videoAssets: [],
  },
  settings: {
    motionLevel: 'dynamic',
    captionStyle: 'kinetic',
  },
  style: {
    fontAssetIds: [],
  },
  scenes: [
    { id: 'scene-1', assetId: 'ast-1', startFrame: 0, endFrame: durationFrames, durationSec },
  ],
  artifacts: [
    {
      id: 'art-dynamic-1',
      sceneId: 'scene-1',
      enabled: true,
      intent: `${graphic.type}: ${graphic.title}`,
      narrativeRefs: [],
      startFrame: 0,
      endFrame: durationFrames,
      priority: 1,
      nodes: [],
      assetRequestIds: [],
      dynamicMotion: {
        ...graphic,
        startSec: 0.3,
        durationSec: 3.5,
      },
    },
  ],
};

console.log('\n1. Building HyperFrames composition (HTML + CSS + GSAP)...');
const indexHtmlPath = buildHyperFramesComposition({
  project: mockProject,
  outputDir: compDir,
});
console.log(`✔ Composition directory written: ${compDir}`);

// Node 22 binary
const nodeBin = '/Users/laheri/.nvm/versions/node/v22.23.3/bin/node';
const cliBin = path.resolve('node_modules/hyperframes/bin/hyperframes.mjs');

const transparentWebmPath = path.join(artifactsDir, 'motion-graphic-overlay.webm');
console.log(`\n2. Rendering transparent overlay video using HyperFrames CLI...`);
console.log(`Output: ${transparentWebmPath}`);

const args = [
  cliBin,
  'render',
  '--format', 'webm',
  '-o', transparentWebmPath,
  '--fps', String(fps),
  '--workers', '1',
  compDir,
];

const renderStart = Date.now();
await new Promise((resolve, reject) => {
  const child = spawn(nodeBin, args, {
    env: {
      ...process.env,
      CI: 'true',
      HYPERFRAMES_TELEMETRY: 'off',
      PATH: [path.dirname(nodeBin), process.env.PATH || ''].join(path.delimiter),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (d) => process.stdout.write(d.toString()));
  child.stderr.on('data', (d) => process.stderr.write(d.toString()));

  child.on('close', (code) => {
    if (code === 0) resolve();
    else reject(new Error(`HyperFrames failed with code ${code}`));
  });
});

const renderElapsed = ((Date.now() - renderStart) / 1000).toFixed(1);
console.log(`\n✔ Transparent motion graphic overlay rendered in ${renderElapsed}s!`);
const webmStats = fs.statSync(transparentWebmPath);
console.log(`- Overlay file size: ${(webmStats.size / 1024).toFixed(1)} KB`);

// 3. Composite with background scene image using FFmpeg to produce full MP4
console.log('\n3. Compositing motion graphic onto scene background using FFmpeg...');
const bgImage = path.resolve('server/data/generated/shorts_images_videos/image-01-1793011530100.png');
const finalMp4Path = path.join(artifactsDir, 'ancient-dharma-test-video.mp4');

// FFmpeg command:
// Takes background image, loops it for 4s with subtle slow zoom (Ken Burns),
// overlays the transparent WebM motion graphic on top,
// encodes to high-quality H.264 MP4.
const ffmpegCmd = [
  '-y',
  '-loop', '1', '-t', String(durationSec), '-i', bgImage,
  '-c:v', 'libvpx-vp9', '-i', transparentWebmPath,
  '-filter_complex',
  `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}[bg];[bg][1:v]overlay=0:0[v]`,
  '-map', '[v]',
  '-c:v', 'libx264',
  '-preset', 'fast',
  '-crf', '18',
  '-pix_fmt', 'yuv420p',
  '-frames:v', String(durationFrames),
  finalMp4Path,
];

console.log(`Running FFmpeg composite -> ${finalMp4Path}`);
execFileSync('ffmpeg', ffmpegCmd, { stdio: 'inherit' });

const mp4Stats = fs.statSync(finalMp4Path);
console.log(`\n🎉 Test video generated successfully!`);
console.log(`- Final MP4 Path: ${finalMp4Path}`);
console.log(`- File Size: ${(mp4Stats.size / (1024 * 1024)).toFixed(2)} MB`);

// Probe final video
const probeJson = execFileSync('ffprobe', [
  '-v', 'quiet',
  '-print_format', 'json',
  '-show_format',
  '-show_streams',
  finalMp4Path,
], { encoding: 'utf8' });

const probe = JSON.parse(probeJson);
const videoStream = probe.streams.find(s => s.codec_type === 'video');
console.log(`- Resolution: ${videoStream.width}x${videoStream.height}`);
console.log(`- Duration: ${parseFloat(probe.format.duration).toFixed(2)} seconds`);
console.log(`- Frame Count: ${videoStream.nb_frames} frames`);
console.log(`- Video Codec: ${videoStream.codec_name} (${videoStream.profile})`);

// Clean up temp comp dir
fs.rmSync(compDir, { recursive: true, force: true });
console.log('✔ Temp files cleaned up');
