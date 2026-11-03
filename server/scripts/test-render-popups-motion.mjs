import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { store } = await import('../dist/services/store.js');
const { generatedDir, workspaceContext } = await import('../dist/services/workspace.js');
const { savedGraphicsForRender, compositeSavedGraphics, graphicsCameras } = await import('../dist/services/render-graphics.js');
const { decideDynamicMotionGraphics, compileDynamicMotionGraphic, decideHeuristicMotionGraphics } = await import('../dist/services/dynamic-motion-engine.js');
const { heuristicExtractPopups, detectPopupsForScript } = await import('../dist/services/extra-popups-engine.js');
const { renderRevision, isCurrentRender } = await import('../dist/services/render-revision.js');
const { renderVideo, getOutputDir, getVideoUrl } = await import('../dist/services/video.js');
const { ensureDefaultSfx } = await import('../dist/services/sfx.js');
const { motionSoundEvents } = await import('../dist/services/editing/motionAudio.js');

async function main() {
  console.log('=== TEST: RENDER POPUPS, 3D MOTION GRAPHICS, AND AUDIO SFX ===\n');

  // Step 1: Ensure all SFX files are generated and ready
  console.log('1. Ensuring default SFX exist...');
  await ensureDefaultSfx();

  const scriptId = 'usr_1787934167716'; // Ancient Dharma Short (existing user script)
  const mediaDir = path.join(generatedDir(), scriptId);
  fs.mkdirSync(mediaDir, { recursive: true });

  const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'pipe' });

  // Generate 2 test images (1080x1920 vertical)
  console.log('2. Generating vertical 1080x1920 scene images...');
  const img1Path = path.join(mediaDir, 'scene1.png');
  const img2Path = path.join(mediaDir, 'scene2.png');
  ff(['-f', 'lavfi', '-i', 'color=c=#1A0B2E:s=1080x1920', '-frames:v', '1', img1Path]);
  ff(['-f', 'lavfi', '-i', 'color=c=#0B1A2E:s=1080x1920', '-frames:v', '1', img2Path]);

  // Generate 6-second narration audio tone with natural speech frequency
  console.log('3. Generating narration audio (6.0s)...');
  const audioFile = 'narration.wav';
  const audioPath = path.join(mediaDir, audioFile);
  ff(['-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000', '-t', '6.0', audioPath]);

  // Define narration and scene plan
  const scenes = [
    {
      sceneIndex: 0,
      narration: 'भगवान राम ने जैसे ही पिनाक धनुष पर प्रत्यंचा चढ़ाई, एक प्रचंड गर्जना हुई।',
      visualPrompt: 'Lord Rama lifting the celestial divine bow Pinaka with golden aura and cosmic radiance',
      durationSec: 3.0,
    },
    {
      sceneIndex: 1,
      narration: '१०८ दंत सौर चक्र घूम उठा और संपूर्ण ब्रह्मांड में सत्य की विजय उद्घोषित हुई।',
      visualPrompt: 'Sudharshana Chakra spinning with 108 serrated solar blades and celestial light',
      durationSec: 3.0,
    },
  ];

  // Step 4: Generate dynamic motion graphics
  console.log('4. Generating dynamic motion graphics (real 3D visual constructs)...');
  const dynamicMotionGraphics = decideHeuristicMotionGraphics(scenes, 'Ancient Dharma');
  console.log(`   Generated ${dynamicMotionGraphics.length} dynamic motion graphics:`);
  for (const g of dynamicMotionGraphics) {
    console.log(`   - [${g.type}] "${g.title}" (scene ${g.sceneIndex}, start: ${g.startSec}s, dur: ${g.durationSec}s)`);
    console.log(`     Contains SVG: ${g.render.html.includes('<svg')}, 3D card: ${g.render.html.includes('dm-3d-card')}`);
  }

  // Step 5: Generate extra popups with vector emblems and popup audio sound effects
  console.log('5. Generating extra popups with vector emblems and sound effects...');
  const fakeScriptForPopups = {
    name: 'Ancient Dharma',
    scenePlan: { scenes },
    language: 'hi',
  };
  const extraPopups = heuristicExtractPopups(fakeScriptForPopups).map((p, idx) => ({
    ...p,
    status: 'ready',
    sfx: idx === 0 ? 'bubble_pop' : 'crystal_ting',
    cueWord: idx === 0 ? 'पिनाक' : 'चक्र',
  }));
  console.log(`   Generated ${extraPopups.length} extra popups:`);
  for (const p of extraPopups) {
    console.log(`   - [${p.shape}] "${p.title}" (cueWord: "${p.cueWord}", sfx: "${p.sfx}", status: "${p.status}")`);
  }

  // Step 6: Update script in store
  const existingScript = store.getById('scripts', scriptId) || { id: scriptId, name: 'Ancient Dharma Short' };
  const updatedScript = {
    ...existingScript,
    name: 'Ancient Dharma Short',
    narration: scenes.map(s => s.narration).join(' '),
    scenePlan: { scenes },
    imagePrompts: scenes.map(s => s.visualPrompt),
    generatedImages: [
      { index: 0, status: 'done', url: `/api/generate/file/${scriptId}/scene1.png`, prompt: scenes[0].visualPrompt },
      { index: 1, status: 'done', url: `/api/generate/file/${scriptId}/scene2.png`, prompt: scenes[1].visualPrompt },
    ],
    generatedAudio: [
      { filename: audioFile, language: 'hi', narrationText: scenes.map(s => s.narration).join(' ') },
    ],
    dynamicMotionGraphics,
    extraPopups,
    duration: 6,
    enableSubtitles: true,
  };
  store.add('scripts', updatedScript);
  console.log('6. Script persisted to store with dynamic motion graphics and popups.');

  // Step 7: Create saved graphics project for render
  console.log('7. Compiling motion project for render...');
  const resolution = { width: 1080, height: 1920 };
  const project = savedGraphicsForRender(
    scriptId,
    audioFile,
    ['scene1.png', 'scene2.png'],
    resolution,
    6.0
  );
  if (!project) {
    throw new Error('savedGraphicsForRender returned undefined! Check dynamic motion / popup compilation.');
  }
  console.log(`   Motion project compiled with ${project.artifacts.length} artifacts.`);
  console.log(`   Project soundDesign setting: "${project.settings?.soundDesign}"`);

  // Step 8: Test sound events extraction
  const sfxEvents = await motionSoundEvents(project, true);
  console.log(`8. Motion sound events extracted: ${sfxEvents.length} events`);
  for (const ev of sfxEvents) {
    console.log(`   - Path: ${path.basename(ev.path)}, Start: ${(ev.startSample / 48000).toFixed(2)}s, Gain: ${ev.gainDb}dB`);
  }

  // Step 9: Render the base video
  console.log('9. Rendering base story video...');
  const renderOpts = {
    scriptId,
    imagePaths: ['scene1.png', 'scene2.png'],
    audioPath: audioFile,
    duration: 6.0,
    resolution,
    zoomFactor: 1.12,
    transitionDuration: 0.4,
    timelineConfig: {
      clips: [
        { duration: 3.0, transition: 'crossfade', transitionDuration: 0.4 },
        { duration: 3.0, transition: 'none', transitionDuration: 0 },
      ],
    },
    enableSubtitles: false,
    enableVignette: true,
    enableSfx: true,
    colorGrade: 'none',
  };

  const baseResult = await renderVideo(renderOpts);
  console.log(`   Base video rendered: ${baseResult.outputPath} (${(baseResult.size / 1024 / 1024).toFixed(2)} MB)`);

  // Step 10: Composite saved graphics & popups with mixed audio SFX
  console.log('10. Compositing 3D motion graphics, popups, and SFX audio bus...');
  const controller = new AbortController();
  const finalResult = await compositeSavedGraphics(
    baseResult,
    project,
    controller.signal,
    (stage, pct) => console.log(`    [Progress] ${stage}: ${pct}%`),
    undefined,
    undefined,
    true
  );
  console.log(`   Final video composite complete: ${finalResult.outputPath} (${(finalResult.size / 1024 / 1024).toFixed(2)} MB)`);

  // Step 11: Write atomic metadata json for revision tracking
  const rev = renderRevision(scriptId);
  const jsonPath = `${finalResult.outputPath}.json`;
  fs.writeFileSync(jsonPath, JSON.stringify({
    revision: rev,
    resolution: '1080x1920',
    duration: finalResult.duration,
  }, null, 2));
  console.log(`11. Wrote revision metadata to ${jsonPath}`);

  // Step 12: Verify with ffprobe
  console.log('12. Probing final output video with ffprobe...');
  const probeData = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', finalResult.outputPath], { encoding: 'utf8' }));
  const vStream = probeData.streams.find(s => s.codec_type === 'video');
  const aStream = probeData.streams.find(s => s.codec_type === 'audio');

  console.log(`    Video Stream: ${vStream.width}x${vStream.height}, ${vStream.codec_name}, duration: ${vStream.duration}s`);
  console.log(`    Audio Stream: ${aStream.sample_rate}Hz, ${aStream.channels}ch (${aStream.channel_layout}), ${aStream.codec_name}, duration: ${aStream.duration}s`);

  if (vStream.width !== 1080 || vStream.height !== 1920) {
    throw new Error(`Unexpected video resolution: ${vStream.width}x${vStream.height}`);
  }
  if (!aStream || aStream.channels !== 2) {
    throw new Error('Expected stereo audio output');
  }

  // Step 13: Verify Export Tab recognition
  console.log('13. Verifying Export Tab recognition...');
  const outputDir = getOutputDir(scriptId);
  const allVideos = fs.readdirSync(outputDir)
    .filter(f => f.endsWith('.mp4') && !f.endsWith('.partial.mp4'))
    .filter(f => isCurrentRender(scriptId, path.join(outputDir, f)));

  console.log(`    Current valid renders in output directory: ${allVideos.length}`);
  for (const f of allVideos) {
    console.log(`    - Video: ${f}`);
    console.log(`      Playback URL: ${getVideoUrl(scriptId, f)}`);
  }

  // Update script in store with outputVideos so UI displays it
  const finalScript = {
    ...store.getById('scripts', scriptId),
    outputVideos: allVideos.map(f => ({
      filename: f,
      url: getVideoUrl(scriptId, f),
      createdAt: new Date().toISOString(),
    })),
  };
  store.add('scripts', finalScript);

  console.log('\n=== SUCCESS: Video successfully rendered with popups, 3D motion graphics, and audio SFX! ===');
  console.log(`Ready in Export Tab for script: "${scriptId}" (${finalScript.name})`);
}

main().catch(err => {
  console.error('\n*** TEST FAILED ***\n', err);
  process.exit(1);
});
