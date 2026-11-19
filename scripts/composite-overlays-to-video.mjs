import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseVideo = path.join(root, 'artifacts', 'against_the_odds_60s.mp4');
const overlayDir = path.join(root, 'artifacts', 'against_the_odds_overlays');
const outputVideo = path.join(root, 'artifacts', 'against_the_odds_with_motion_overlays.mp4');

console.log('=== COMPOSITING 7 OPEN-SOURCE MOTION OVERLAYS OVER VIDEO ===\n');

if (!fs.existsSync(baseVideo)) {
  throw new Error(`Base video not found: ${baseVideo}`);
}

const overlayFiles = [
  'overlay_01_title_intro.png',
  'overlay_02_target_reticle.png',
  'overlay_03_alert_quote.png',
  'overlay_04_voyage_telemetry.png',
  'overlay_05_shackleton_lower_third.png',
  'overlay_06_verified_rescue.png',
  'overlay_07_climax_underline.png',
];

for (const f of overlayFiles) {
  const p = path.join(overlayDir, f);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing overlay file: ${p}`);
  }
}

// Timing windows for each scene (7 scenes across 60.0s)
// Scene 1: 0.00s - 8.57s
// Scene 2: 8.57s - 17.13s
// Scene 3: 17.13s - 25.70s
// Scene 4: 25.70s - 34.27s
// Scene 5: 34.27s - 42.87s
// Scene 6: 42.87s - 51.43s
// Scene 7: 51.43s - 60.00s
const filterComplex = [
  // Fades for each overlay
  `[1:v]format=rgba,fade=t=in:st=0.8:d=0.5:alpha=1,fade=t=out:st=7.2:d=0.5:alpha=1[o1]`,
  `[2:v]format=rgba,fade=t=in:st=9.4:d=0.5:alpha=1,fade=t=out:st=15.8:d=0.5:alpha=1[o2]`,
  `[3:v]format=rgba,fade=t=in:st=18.0:d=0.5:alpha=1,fade=t=out:st=24.3:d=0.5:alpha=1[o3]`,
  `[4:v]format=rgba,fade=t=in:st=26.5:d=0.5:alpha=1,fade=t=out:st=32.9:d=0.5:alpha=1[o4]`,
  `[5:v]format=rgba,fade=t=in:st=35.1:d=0.5:alpha=1,fade=t=out:st=41.5:d=0.5:alpha=1[o5]`,
  `[6:v]format=rgba,fade=t=in:st=43.7:d=0.5:alpha=1,fade=t=out:st=50.1:d=0.5:alpha=1[o6]`,
  `[7:v]format=rgba,fade=t=in:st=52.2:d=0.5:alpha=1,fade=t=out:st=58.5:d=0.7:alpha=1[o7]`,

  // Chained overlays over the base video
  `[0:v][o1]overlay=0:0:eof_action=pass:enable='between(t,0.8,7.7)'[v1]`,
  `[v1][o2]overlay=0:0:eof_action=pass:enable='between(t,9.4,16.3)'[v2]`,
  `[v2][o3]overlay=0:0:eof_action=pass:enable='between(t,18.0,24.8)'[v3]`,
  `[v3][o4]overlay=0:0:eof_action=pass:enable='between(t,26.5,33.4)'[v4]`,
  `[v4][o5]overlay=0:0:eof_action=pass:enable='between(t,35.1,42.0)'[v5]`,
  `[v5][o6]overlay=0:0:eof_action=pass:enable='between(t,43.7,50.6)'[v6]`,
  `[v6][o7]overlay=0:0:eof_action=pass:enable='between(t,52.2,59.3)'[vfinal]`,
].join(';');

const ffmpegArgs = [
  '-hide_banner',
  '-loglevel', 'error',
  '-y',
  '-i', baseVideo,
  ...overlayFiles.flatMap((f) => ['-loop', '1', '-i', path.join(overlayDir, f)]),
  '-filter_complex', filterComplex,
  '-map', '[vfinal]',
  '-map', '0:a',
  '-c:v', 'libx264',
  '-preset', 'fast',
  '-crf', '22',
  '-pix_fmt', 'yuv420p',
  '-c:a', 'copy',
  '-t', '60',
  outputVideo,
];

console.log('Compositing with FFmpeg...');
const start = Date.now();
execFileSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' });
const elapsed = ((Date.now() - start) / 1000).toFixed(2);

console.log(`\nVideo Successfully Composited in ${elapsed}s!`);
console.log(`- Final MP4: ${outputVideo} (${(fs.statSync(outputVideo).size / 1024 / 1024).toFixed(2)} MB)`);

// Extract preview frames from each of the 7 scenes to visually verify the overlays
const previewDir = path.join(root, 'artifacts', 'overlay_preview_frames');
fs.mkdirSync(previewDir, { recursive: true });

const sampleTimings = [
  { sec: 4, name: 'scene_01_title_intro_frame.jpg' },
  { sec: 12, name: 'scene_02_reticle_frame.jpg' },
  { sec: 21, name: 'scene_03_quote_alert_frame.jpg' },
  { sec: 30, name: 'scene_04_arrow_counter_frame.jpg' },
  { sec: 38, name: 'scene_05_lower_third_frame.jpg' },
  { sec: 47, name: 'scene_06_verified_rescue_frame.jpg' },
  { sec: 55, name: 'scene_07_climax_stat_frame.jpg' },
];

console.log('\nExtracting 7 preview frames with overlays visible:');
for (const s of sampleTimings) {
  const pPath = path.join(previewDir, s.name);
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-ss', String(s.sec),
    '-i', outputVideo,
    '-frames:v', '1',
    pPath,
  ]);
  console.log(`- Extracted: ${s.name} (at ${s.sec}s)`);
}

console.log('\nAll done! Video with open-source motion overlays is ready.');
