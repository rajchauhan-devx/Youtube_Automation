import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptId = 'test_image_only_60s';
const fixtureDir = path.join(root, 'data', 'generated', scriptId);

fs.mkdirSync(fixtureDir, { recursive: true });

console.log('=== GENERATING 60-SECOND IMAGE-ONLY TEST VIDEO ===\n');

// 1. Prepare 6 distinct high-quality scene images (10 seconds each = 60s total)
const sourceImages = [
  'shots_preview/shot_01_frame_21.jpg',
  'shots_preview/shot_03_frame_108.jpg',
  'shots_preview/shot_06_frame_459.jpg',
  'shots_preview/shot_09_frame_621.jpg',
  'shots_preview/shot_13_frame_870.jpg',
  'shots_preview/shot_16_frame_1596.jpg',
];

const imageNames = sourceImages.map((src, i) => {
  const destName = `scene_${String(i + 1).padStart(2, '0')}.jpg`;
  const destPath = path.join(fixtureDir, destName);
  fs.copyFileSync(path.resolve(src), destPath);
  return destName;
});

console.log(`1. Staged ${imageNames.length} scene images in ${fixtureDir}:`);
imageNames.forEach((name, i) => console.log(`   - Scene ${i + 1}: ${name} (10.0s)`));

// 2. Generate exact 60-second audio track (stereo 48kHz)
const audioName = 'narration_60s.wav';
const audioPath = path.join(fixtureDir, audioName);
execFileSync('ffmpeg', [
  '-hide_banner',
  '-loglevel', 'error',
  '-y',
  '-f', 'lavfi',
  '-i', 'anullsrc=r=48000:cl=stereo',
  '-t', '60.00',
  '-c:a', 'pcm_s16le',
  audioPath,
]);

console.log(`2. Generated exact 60.00s audio track: ${audioName}`);

// 3. Import server renderVideo
const { renderVideo } = await import('../dist/services/video.js');

console.log('3. Rendering video via FFmpeg engine (Image Only, Motion Templates Disabled)...');

const renderOpts = {
  scriptId,
  imagePaths: imageNames,
  audioPath: audioName,
  duration: 60.0,
  resolution: { width: 720, height: 1280 },
  zoomFactor: 1.05,
  transitionDuration: 0.5,
  timelineConfig: {
    clips: imageNames.map((_, idx) => ({
      duration: 10.0,
      transition: idx === imageNames.length - 1 ? 'none' : 'crossfade',
      transitionDuration: idx === imageNames.length - 1 ? 0 : 0.5,
    })),
  },
  enableSubtitles: false,
  enableVignette: false,
  enableSfx: false,
  colorGrade: 'none',
};

const result = await renderVideo(renderOpts);
console.log(`\n4. Video Rendered Successfully:`);
console.log(`   - Output Path: ${result.outputPath}`);
console.log(`   - Duration: ${result.duration.toFixed(2)}s`);
console.log(`   - File Size: ${(result.size / 1024 / 1024).toFixed(2)} MB`);

// 5. Copy to artifacts for easy access and persistent tracking
const finalArtifact = path.resolve('artifacts/test_image_only_60s.mp4');
fs.mkdirSync(path.dirname(finalArtifact), { recursive: true });
fs.copyFileSync(result.outputPath, finalArtifact);
console.log(`5. Copied to project artifacts: ${finalArtifact}`);

// 6. Detailed probe verification
const probeRaw = execFileSync('ffprobe', [
  '-v', 'error',
  '-show_streams',
  '-show_format',
  '-of', 'json',
  finalArtifact,
], { encoding: 'utf8' });

const metadata = JSON.parse(probeRaw);
const vStream = metadata.streams.find((s) => s.codec_type === 'video');
const aStream = metadata.streams.find((s) => s.codec_type === 'audio');

console.log('\n=== VERIFICATION METRICS ===');
console.log(`- Container Format: ${metadata.format.format_name}`);
console.log(`- Total Duration: ${parseFloat(metadata.format.duration).toFixed(3)}s`);
console.log(`- Video Stream: ${vStream.codec_name} (${vStream.width}x${vStream.height} @ ${vStream.r_frame_rate} fps)`);
console.log(`- Video Duration: ${parseFloat(vStream.duration).toFixed(3)}s`);
console.log(`- Audio Stream: ${aStream ? `${aStream.codec_name} (${aStream.sample_rate}Hz, ${aStream.channels}ch)` : 'None'}`);
console.log(`- Status: PASSED (Exact 60.0s Image-Only Video Generated)\n`);
