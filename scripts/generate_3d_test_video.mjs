import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BLENDER_BIN = '/Applications/Blender.app/Contents/MacOS/Blender';
const SCRIPT_PATH = path.resolve('server/scripts/blender/cross_section_explainer.py');
const OUTPUT_DIR = path.resolve('server/data/accounts/acct_blender_3d/profiles/shorts/output/usr_3d_oil_well_short');
const GENERATED_DIR = path.resolve('server/data/accounts/acct_blender_3d/profiles/shorts/generated/usr_3d_oil_well_short');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(GENERATED_DIR, { recursive: true });

// Clean old raw files to force fresh high-fidelity render with new shaders
for (let i = 0; i < 4; i++) {
  const oldRaw = path.join(GENERATED_DIR, `scene_${i}_raw.mp4`);
  if (fs.existsSync(oldRaw)) fs.unlinkSync(oldRaw);
}

const scenes = [
  {
    index: 0,
    action: 'drill_down',
    subtitleLine1: 'If you drill a hole in Texas,',
    subtitleLine2: 'its weight holds the walls in place.',
    text: 'If you drill a hole in Texas, you have an oil well. But the sandy sides keep caving in. So, you pump thick mud down the hole as you drill, and its weight holds the walls in place.',
  },
  {
    index: 1,
    action: 'oil_gusher',
    subtitleLine1: '1,000 feet down, you hit oil,',
    subtitleLine2: 'and a black fountain blasts 10 stories high.',
    text: 'Now you drill deeper, and 1,000 feet down, you hit oil, and it hits back! Your mud bubbles out, and six tons of drill pipe shoot through the derrick. A black fountain blasts higher than a 10 story building, and for nine days, it rains oil.',
  },
  {
    index: 2,
    action: 'bop_clamp',
    subtitleLine1: 'Rock soaked like a sponge...',
    subtitleLine2: 'This is a blowout preventer.',
    text: 'The oil isn\'t sitting in a lake down there. It\'s soaked into rock like water in a sponge, squeezed by gas. So you bolt giant steel jaws on top of the hole, and when the oil kicks, they slam shut. This is a blowout preventer.',
  },
  {
    index: 3,
    action: 'pump_jack',
    subtitleLine1: 'Counterweights swing down as rods come up.',
    subtitleLine2: 'This is a pump jack.',
    text: 'Years go by, pressure drops, and oil stops coming up. So you hang a pump on steel rods. But the rods weigh tons, so you hang heavy counterweights on a rocking beam. This is a pump jack. Congratulations, you built an oil well.',
  },
];

console.log('=== STARTING HIGH-FIDELITY 3D EXPLAINER PIPELINE ===\n');

const sceneVideoFiles = [];
const fontFile = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';

for (const scene of scenes) {
  console.log(`\n--- [Scene ${scene.index + 1}/4: ${scene.action}] ---`);
  
  // 1. Synthesize Voiceover Audio
  const aiffPath = path.join(GENERATED_DIR, `scene_${scene.index}_voice.aiff`);
  const wavPath = path.join(GENERATED_DIR, `scene_${scene.index}_voice.wav`);
  console.log(`[Audio] Synthesizing speech...`);
  execSync(`say -v Eddy -r 185 "${scene.text.replace(/"/g, '\\"')}" -o "${aiffPath}"`);
  execSync(`ffmpeg -y -i "${aiffPath}" -ar 44100 "${wavPath}" 2>/dev/null`);
  
  const rawDuration = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${wavPath}"`).toString().trim();
  const duration = Math.max(2.5, parseFloat(rawDuration) + 0.3);
  console.log(`[Audio] Duration: ${duration.toFixed(2)}s`);
  
  // 2. Headless Blender 5.3 Render with PBR Strata Shaders
  const rawBlenderMp4 = path.join(GENERATED_DIR, `scene_${scene.index}_raw.mp4`);
  console.log(`[Blender 5.3] Procedural rendering '${scene.action}' (${duration.toFixed(2)}s @ 24fps)...`);
  
  const payload = JSON.stringify({
    action: scene.action,
    duration: duration,
    fps: 24,
    output_path: rawBlenderMp4,
  });
  
  execSync(`"${BLENDER_BIN}" -b -P "${SCRIPT_PATH}" -- '${payload}'`, { stdio: 'inherit' });
  const blenderOutput = fs.existsSync(rawBlenderMp4) ? rawBlenderMp4 : `${rawBlenderMp4}.mp4`;
  
  // 3. Mux Video + Audio + Centered Shorts Subtitles (Mildly Elsewhere Style)
  const muxedMp4 = path.join(GENERATED_DIR, `scene_${scene.index}_composed.mp4`);
  console.log(`[Compositing] Syncing audio & centered subtitles...`);
  
  const line1 = scene.subtitleLine1.replace(/'/g, '').replace(/:/g, ' - ');
  const line2 = scene.subtitleLine2.replace(/'/g, '').replace(/:/g, ' - ');
  
  // Centered white text with solid black outline (no big boxes)
  const drawFilter = [
    `drawtext=fontfile='${fontFile}':text='${line1}':x=(w-text_w)/2:y=h*0.72:fontsize=52:fontcolor=0xFFFFFF:borderw=4:bordercolor=0x000000`,
    `drawtext=fontfile='${fontFile}':text='${line2}':x=(w-text_w)/2:y=h*0.77:fontsize=52:fontcolor=0xFFFFFF:borderw=4:bordercolor=0x000000`
  ].join(',');
  
  execSync(`ffmpeg -y -i "${blenderOutput}" -i "${wavPath}" -filter_complex "[0:v]${drawFilter}[v]" -map "[v]" -map 1:a -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 192k -shortest "${muxedMp4}" 2>/dev/null`);
  
  sceneVideoFiles.push(muxedMp4);
  console.log(`[Scene ${scene.index + 1}] Finished -> ${muxedMp4}`);
}

// 4. Concatenate Master Video
console.log('\n=== CONCATENATING MASTER EXPLAINER VIDEO ===');
const concatListFile = path.join(GENERATED_DIR, 'concat_list.txt');
fs.writeFileSync(concatListFile, sceneVideoFiles.map(f => `file '${f}'`).join('\n'));

const finalMp4 = path.join(OUTPUT_DIR, 'final_texas_oil_well_explainer.mp4');
execSync(`ffmpeg -y -f concat -safe 0 -i "${concatListFile}" -c copy "${finalMp4}" 2>/dev/null`);

const masterDuration = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${finalMp4}"`).toString().trim();
const masterSize = fs.statSync(finalMp4).size;

console.log(`\n🎉 HIGH-FIDELITY MASTER VIDEO GENERATED:`);
console.log(`   Path: ${finalMp4}`);
console.log(`   Duration: ${parseFloat(masterDuration).toFixed(2)} seconds`);
console.log(`   Size: ${(masterSize / 1024 / 1024).toFixed(2)} MB`);
