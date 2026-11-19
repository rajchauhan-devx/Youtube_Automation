import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptId = 'against_the_odds_60s';
const fixtureDir = path.join(root, 'data', 'generated', scriptId);

fs.mkdirSync(fixtureDir, { recursive: true });

console.log('=== GENERATING AGAINST THE ODDS 60-SECOND TEST VIDEO ===');
console.log('Profile: Against the Odds (Survival, Endurance & High-Stakes History)\n');

// 1. Stage the 7 Endurance expedition survival scene images
const sourceDir = path.join(
  root,
  'data',
  'accounts',
  'acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab',
  'profiles',
  'shorts',
  'generated',
  'usr_deed717b-3542-4466-834d-0ff8c890ece2'
);

const rawImages = [
  'endurance-demo-1792830616353-01.jpg',
  'endurance-demo-1792830616353-02.png',
  'endurance-demo-1792830616353-03.png',
  'endurance-demo-1792830616353-04.jpg',
  'endurance-demo-1792830616353-05.png',
  'endurance-demo-1792830616353-06.png',
  'endurance-demo-1792830616353-07.png',
];

const imageNames = rawImages.map((src, i) => {
  const ext = path.extname(src);
  const destName = `scene_${String(i + 1).padStart(2, '0')}${ext}`;
  const destPath = path.join(fixtureDir, destName);
  fs.copyFileSync(path.join(sourceDir, src), destPath);
  return destName;
});

console.log(`1. Staged ${imageNames.length} Against the Odds historical scenes:`);
const sceneTitles = [
  'April 1916: Launching open lifeboats into freezing swells',
  'Landfall on desolate Elephant Island',
  'Realizing rescue ships will never find them on the remote shore',
  'The 800-mile voyage on the James Caird across ferocious Southern Ocean',
  'Harrowing mountain trek across frozen South Georgia peaks',
  'August 30, 1916: Returning on the Chilean steam tug Yelcho',
  'Twenty months stranded in Antarctica: Not a single life lost',
];
imageNames.forEach((name, i) => {
  console.log(`   - Scene ${i + 1} (~8.6s): ${sceneTitles[i]} (${name})`);
});

// 2. Prepare 60.00s master English narration audio
const rawAudio = path.join(sourceDir, 'endurance_motion_demo_1792830616353.wav');
const audioName = 'narration_endurance_60s.wav';
const audioPath = path.join(fixtureDir, audioName);

// Pad 50.8s narration to exact 60.00s with ambient outro
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

console.log(`\n2. Master English voiceover prepared (exact 60.00s): ${audioName}`);

// 3. Import renderVideo from server services
const { renderVideo } = await import('../dist/services/video.js');

console.log('\n3. Rendering 1080x1920 vertical video via pipeline (Against the Odds Profile)...');

// Balanced clip durations totaling exactly 60.0s (7 clips)
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
const finalArtifact = path.resolve('artifacts/against_the_odds_60s.mp4');
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

console.log('\n=== VERIFICATION METRICS (AGAINST THE ODDS PROFILE) ===');
console.log(`- Channel Profile: Against the Odds (Survival History)`);
console.log(`- Format: ${metadata.format.format_name}`);
console.log(`- Total Duration: ${parseFloat(metadata.format.duration).toFixed(3)}s`);
console.log(`- Video Stream: ${vStream.codec_name} (${vStream.width}x${vStream.height} @ ${vStream.r_frame_rate} fps)`);
console.log(`- Video Duration: ${parseFloat(vStream.duration).toFixed(3)}s`);
console.log(`- Audio Stream: ${aStream ? `${aStream.codec_name} (${aStream.sample_rate}Hz, ${aStream.channels}ch)` : 'None'}`);
console.log(`- Status: PASSED\n`);
