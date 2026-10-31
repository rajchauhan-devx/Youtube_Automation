import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { buildHyperFramesComposition } from '../dist/services/editing/hyperframes-builder.js';

const scriptsPath = path.resolve('server/data/scripts.json');
const rawScripts = JSON.parse(fs.readFileSync(scriptsPath, 'utf8'));
const script = rawScripts.find(s => s.id === 'usr_1787934167716');

if (!script || !script.scenePlan) {
  throw new Error('Script usr_1787934167716 with scenePlan not found');
}

console.log('=== Cinematic Hook Video Renderer ===');
console.log('Script:', script.name);
console.log('Topic:', script.topicName);
console.log('Scene 1 mediaType:', script.scenePlan.scenes[0].mediaType);
console.log('Scene 1 video url:', script.generatedImages[0].url);

const width = 1080;
const height = 1920;
const fps = 30;
const totalDuration = 25.8;
const totalFrames = Math.round(totalDuration * fps);

const workDir = path.join(os.tmpdir(), `cinematic-hook-${Date.now()}`);
fs.mkdirSync(workDir, { recursive: true });

// 1. Render Scene 1 (Video), Scene 2 (Image), Scene 3 (Image), Scene 4 (Image)
const s1Video = path.resolve('server/data/generated/usr_1787934167716/video-00-1793351914805.mp4');
const s2Img = path.resolve('server/data/generated/usr_1787934167716/image-01-1793351933400.png');
const s3Img = path.resolve('server/data/generated/usr_1787934167716/image-02-1793351946672.png');
const s4Img = path.resolve('server/data/generated/usr_1787934167716/image-03-1793351959814.png');
const audioWav = path.resolve('server/data/generated/usr_1787934167716/narration_hi_1793351609255.wav');

// Durations
const d1 = 6.43; // Scene 1 video duration
const d2 = 6.0;
const d3 = 6.0;
const d4 = 7.37;

console.log('1. Rendering scene segments...');

// Scene 1: Direct from the cinematic video clip!
const seg1 = path.join(workDir, 'seg1.mp4');
execFileSync('ffmpeg', [
  '-y', '-i', s1Video,
  '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}`,
  '-t', String(d1),
  '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
  seg1
]);
console.log('✔ Scene 1 (Cinematic Hook Video) processed:', seg1);

// Scene 2: Image with Steadicam subpixel smooth push-in (Zero jitter)
const seg2 = path.join(workDir, 'seg2.mp4');
execFileSync('ffmpeg', [
  '-y', '-loop', '1', '-framerate', String(fps), '-i', s2Img,
  '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},scale=eval=frame:w='${width}*(1+0.07*t/${d2})':h='${height}*(1+0.07*t/${d2})':flags=bicubic,crop=${width}:${height}:(in_w-${width})/2:(in_h-${height})/2`,
  '-t', String(d2),
  '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
  seg2
]);
console.log('✔ Scene 2 processed (Steadicam smooth):', seg2);

// Scene 3: Image with Steadicam subpixel smooth push-in
const seg3 = path.join(workDir, 'seg3.mp4');
execFileSync('ffmpeg', [
  '-y', '-loop', '1', '-framerate', String(fps), '-i', s3Img,
  '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},scale=eval=frame:w='${width}*(1+0.08*t/${d3})':h='${height}*(1+0.08*t/${d3})':flags=bicubic,crop=${width}:${height}:(in_w-${width})/2:(in_h-${height})/2`,
  '-t', String(d3),
  '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
  seg3
]);
console.log('✔ Scene 3 processed (Steadicam smooth):', seg3);

// Scene 4: Image with Steadicam subpixel smooth push-in
const seg4 = path.join(workDir, 'seg4.mp4');
execFileSync('ffmpeg', [
  '-y', '-loop', '1', '-framerate', String(fps), '-i', s4Img,
  '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},scale=eval=frame:w='${width}*(1+0.06*t/${d4})':h='${height}*(1+0.06*t/${d4})':flags=bicubic,crop=${width}:${height}:(in_w-${width})/2:(in_h-${height})/2`,
  '-t', String(d4),
  '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
  seg4
]);
console.log('✔ Scene 4 processed (Steadicam smooth):', seg4);

// Concatenate the scenes
const concatTxt = path.join(workDir, 'concat.txt');
fs.writeFileSync(concatTxt, `file '${seg1}'\nfile '${seg2}'\nfile '${seg3}'\nfile '${seg4}'\n`);

const rawBaseVideo = path.join(workDir, 'base-raw.mp4');
execFileSync('ffmpeg', [
  '-y', '-f', 'concat', '-safe', '0', '-i', concatTxt,
  '-c', 'copy',
  rawBaseVideo
]);
console.log('✔ Base footage concatenated (Scene 1 Video + Stills)');

// 2. Render Hyperframes Dynamic Motion Graphics Overlay (Transparent VP9)
const compDir = path.join(os.tmpdir(), `hf-comp-cinematic-${Date.now()}`);
fs.mkdirSync(compDir, { recursive: true });

const artifacts = (script.dynamicMotionGraphics || []).map((dmg, idx) => {
  const sceneDur = 6.4;
  const sceneStartSec = dmg.sceneIndex * sceneDur;
  let startSec = dmg.startSec ?? 2.5;
  if (startSec < sceneStartSec || startSec >= (dmg.sceneIndex + 1) * sceneDur) {
    startSec = sceneStartSec + (dmg.startSec || 2.5);
  }
  const durSec = dmg.durationSec || 4.5;

  return {
    id: `art-adv-${idx}`,
    sceneId: `scene-${dmg.sceneIndex}`,
    enabled: true,
    intent: `${dmg.type}: ${dmg.title}`,
    narrativeRefs: [],
    startFrame: Math.round(startSec * fps),
    endFrame: Math.round((startSec + durSec) * fps),
    priority: 1,
    nodes: [],
    assetRequestIds: [],
    dynamicMotion: {
      ...dmg,
      startSec,
      durationSec: durSec,
    },
  };
});

const mockProject = {
  id: 'proj_cinematic_hook_render',
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
    durationFrames: totalFrames,
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
    { id: 'scene-0', assetId: 'ast-0', startFrame: 0, endFrame: Math.round(d1 * fps), durationSec: d1 },
    { id: 'scene-1', assetId: 'ast-1', startFrame: Math.round(d1 * fps), endFrame: Math.round((d1 + d2) * fps), durationSec: d2 },
    { id: 'scene-2', assetId: 'ast-2', startFrame: Math.round((d1 + d2) * fps), endFrame: Math.round((d1 + d2 + d3) * fps), durationSec: d3 },
    { id: 'scene-3', assetId: 'ast-3', startFrame: Math.round((d1 + d2 + d3) * fps), endFrame: totalFrames, durationSec: d4 },
  ],
  artifacts,
};

console.log('2. Building Hyperframes composition with dynamic graphics...');
buildHyperFramesComposition({
  project: mockProject,
  outputDir: compDir,
});

const nodeBin = '/Users/laheri/.nvm/versions/node/v22.23.3/bin/node';
const cliBin = path.resolve('node_modules/hyperframes/bin/hyperframes.mjs');
const transparentOverlayWebm = path.join(workDir, 'overlay.webm');

console.log('3. Capturing transparent VP9 motion graphics overlay via Hyperframes CLI...');
execFileSync(nodeBin, [
  cliBin,
  'render',
  compDir,
  '--output', transparentOverlayWebm,
  '--format', 'webm',
  '--fps', String(fps),
]);
console.log('✔ Transparent overlay rendered:', transparentOverlayWebm);

// 3. Composite everything together: base video (Scene 1 Video + Stills) + overlay + audio
const finalOutputMp4 = path.resolve('server/data/output/usr_1787934167716/final_cinematic_hook_short.mp4');
fs.mkdirSync(path.dirname(finalOutputMp4), { recursive: true });

console.log('4. Compositing final MP4 in FFmpeg...');
execFileSync('ffmpeg', [
  '-y',
  '-i', rawBaseVideo,
  '-c:v', 'libvpx-vp9', '-i', transparentOverlayWebm,
  '-i', audioWav,
  '-filter_complex', '[0:v][1:v]overlay=0:0:format=auto[v]',
  '-map', '[v]',
  '-map', '2:a',
  '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
  '-c:a', 'aac', '-b:a', '192k',
  '-pix_fmt', 'yuv420p',
  '-t', String(totalDuration),
  finalOutputMp4
]);

console.log(`\n🎉 SUCCESS! Final Cinematic Hook Short created: ${finalOutputMp4}`);
const stat = fs.statSync(finalOutputMp4);
console.log(`File size: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);

// Also copy to artifacts directory
const artifactVideoPath = '/Users/laheri/.gemini/antigravity/brain/21295dce-bb62-4f74-b8a7-ab251dc94d98/cinematic-hook-video-short.mp4';
fs.copyFileSync(finalOutputMp4, artifactVideoPath);
console.log(`✔ Copied to artifact directory: ${artifactVideoPath}`);

// Extract reference frames
const f0 = '/Users/laheri/.gemini/antigravity/brain/21295dce-bb62-4f74-b8a7-ab251dc94d98/cinematic-hook-frame-s0-video-3.0s.png';
const f1 = '/Users/laheri/.gemini/antigravity/brain/21295dce-bb62-4f74-b8a7-ab251dc94d98/cinematic-hook-frame-s1-9.0s.png';

execFileSync('ffmpeg', ['-y', '-ss', '3.0', '-i', finalOutputMp4, '-vframes', '1', f0]);
execFileSync('ffmpeg', ['-y', '-ss', '9.0', '-i', finalOutputMp4, '-vframes', '1', f1]);
console.log('✔ Extracted verification frames:', f0, f1);

// Cleanup
fs.rmSync(workDir, { recursive: true, force: true });
fs.rmSync(compDir, { recursive: true, force: true });
console.log('✔ Cleanup complete.');
