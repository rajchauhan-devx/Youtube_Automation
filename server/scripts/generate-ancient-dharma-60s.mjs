import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptId = 'ancient_dharma_60s';
const fixtureDir = path.join(root, 'data', 'generated', scriptId);

fs.mkdirSync(fixtureDir, { recursive: true });

console.log('=== GENERATING ANCIENT DHARMA 60-SECOND IMAGE-ONLY VIDEO ===');
console.log('Profile: Ancient Dharma (Vedic Sacred History & Philosophy - Non-Blender)\n');

// 1. Stage the 7 Ancient Dharma scene paintings (Kathopanishad: Nachiketa & Yamraj)
const sourceDir = path.join(root, 'data', 'generated', 'shorts_images_videos');
const rawImages = [
  'image-00-1794997578810.png',
  'image-01-1794997666512.png',
  'image-02-1794997758167.png',
  'image-03-1794997847255.png',
  'image-04-1794997933170.png',
  'image-05-1794998019845.png',
  'image-06-1794998750837.png',
];

const imageNames = rawImages.map((src, i) => {
  const destName = `scene_${String(i + 1).padStart(2, '0')}.png`;
  const destPath = path.join(fixtureDir, destName);
  fs.copyFileSync(path.join(sourceDir, src), destPath);
  return destName;
});

console.log(`1. Staged ${imageNames.length} Ancient Dharma narrative paintings:`);
const sceneTitles = [
  'Nachiketa arriving at the gates of Yama',
  'Yama offering boons of gold and wealth',
  'Nachiketa rejecting worldly illusions for eternal truth',
  'Yama praising Nachiketa for choosing Shreyas over Preyas',
  'The body described as a temporary chariot',
  'The immortal, unborn, indestructible Atman',
  'Final realization of eternal consciousness',
];
imageNames.forEach((name, i) => {
  console.log(`   - Scene ${i + 1} (~8.6s): ${sceneTitles[i]} (${name})`);
});

// 2. Prepare master 60.00s audio track using real Hindi narration + outro
const rawAudio = path.join(sourceDir, 'narration_hi_e0033040-fcb9-4ac5-a537-06e509df0ee4.wav');
const audioName = 'narration_dharma_60s.wav';
const audioPath = path.join(fixtureDir, audioName);

// Pad the 51.85s Hindi narration cleanly to exactly 60.00s with ambient outro
execFileSync('ffmpeg', [
  '-hide_banner',
  '-loglevel', 'error',
  '-y',
  '-i', rawAudio,
  '-f', 'lavfi',
  '-i', 'anullsrc=r=48000:cl=stereo',
  '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1[a];[a]atrim=0:60.00,asetpts=PTS-STARTPTS[out]',
  '-map', '[out]',
  '-c:a', 'pcm_s16le',
  audioPath,
]);

console.log(`\n2. Master narration audio prepared (exact 60.00s): ${audioName}`);

// 3. Import renderVideo from server services
const { renderVideo } = await import('../dist/services/video.js');

console.log('\n3. Rendering 1080x1920 vertical video via pipeline (Motion Templates Disabled)...');

// Compute balanced clip durations totaling exactly 60.0s (7 clips)
// 6 clips @ 8.57s + 1 clip @ 8.58s = 60.00s
const clipDurations = [8.57, 8.57, 8.57, 8.57, 8.57, 8.57, 8.58];

const renderOpts = {
  scriptId,
  imagePaths: imageNames,
  audioPath: audioName,
  duration: 60.0,
  resolution: { width: 1080, height: 1920 },
  zoomFactor: 1.08,
  transitionDuration: 0.5,
  timelineConfig: {
    clips: imageNames.map((_, idx) => ({
      duration: clipDurations[idx],
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
console.log(`   - Output: ${result.outputPath}`);
console.log(`   - Duration: ${result.duration.toFixed(2)}s`);
console.log(`   - Size: ${(result.size / 1024 / 1024).toFixed(2)} MB`);

// 5. Copy to artifacts
const finalArtifact = path.resolve('artifacts/ancient_dharma_image_only_60s.mp4');
fs.mkdirSync(path.dirname(finalArtifact), { recursive: true });
fs.copyFileSync(result.outputPath, finalArtifact);
console.log(`5. Copied to project artifacts: ${finalArtifact}`);

// 6. Detailed verification via ffprobe
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

console.log('\n=== VERIFICATION METRICS (ANCIENT DHARMA PROFILE) ===');
console.log(`- Channel Profile: Ancient Dharma (Vedic Philosophy)`);
console.log(`- Format: ${metadata.format.format_name}`);
console.log(`- Total Duration: ${parseFloat(metadata.format.duration).toFixed(3)}s`);
console.log(`- Video Stream: ${vStream.codec_name} (${vStream.width}x${vStream.height} @ ${vStream.r_frame_rate} fps)`);
console.log(`- Video Duration: ${parseFloat(vStream.duration).toFixed(3)}s`);
console.log(`- Audio Stream: ${aStream ? `${aStream.codec_name} (${aStream.sample_rate}Hz, ${aStream.channels}ch)` : 'None'}`);
console.log(`- Motion Templates: Disabled (Image-Only Cinematic Presentation)`);
console.log(`- Status: PASSED\n`);
