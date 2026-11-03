import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { store } = await import('../dist/services/store.js');
const { generatedDir } = await import('../dist/services/workspace.js');
const { savedGraphicsForRender, compositeSavedGraphics } = await import('../dist/services/render-graphics.js');
const { compileDynamicMotionGraphic, decideTemplateMotionGraphics } = await import('../dist/services/dynamic-motion-engine.js');
const { renderRevision, isCurrentRender } = await import('../dist/services/render-revision.js');
const { renderVideo, getOutputDir, getVideoUrl } = await import('../dist/services/video.js');
const { ensureDefaultSfx } = await import('../dist/services/sfx.js');
const { motionSoundEvents } = await import('../dist/services/editing/motionAudio.js');
const { generateSubtitleFile } = await import('../dist/services/subtitle.js');

async function main() {
  console.log('=== FULL PRODUCTION VIDEO RENDERER (SHORTS 9:16) ===\n');

  // Step 1: Ensure default SFX exist
  await ensureDefaultSfx();

  const scriptId = 'usr_1787934167716';
  const mediaDir = path.join(generatedDir(), scriptId);
  const audioFile = 'narration_hi_1793695284114.wav';
  const audioPath = path.join(mediaDir, audioFile);

  if (!fs.existsSync(audioPath)) {
    throw new Error(`Narration audio not found: ${audioPath}`);
  }

  // Probe audio duration
  const probeAudio = JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-show_format', '-of', 'json', audioPath], { encoding: 'utf8' })
  );
  const totalDuration = parseFloat(probeAudio.format.duration);
  console.log(`1. Master narration audio: ${audioFile} (${totalDuration.toFixed(2)}s)`);

  // Define 5 high-impact narrative scenes
  const scenes = [
    {
      sceneIndex: 0,
      narration: 'जनकपुर के राजदरबार में जब कोई भी योद्धा भगवान शिव के पिनाक धनुष को हिला तक न सका, तब राजा जनक अत्यंत निराश हो उठे।',
      visualPrompt: 'Lord Rama lifting the celestial divine bow Pinaka with golden aura and cosmic radiance, vertical 9:16 cinematic 8k',
      imageFile: 'image-00-1793695164087.png',
      durationSec: 6.82,
    },
    {
      sceneIndex: 1,
      narration: 'तभी महर्षि विश्वामित्र का संकेत पाकर, मर्यादा पुरुषोत्तम श्री राम मंद मुस्कान के साथ आगे बढ़े।',
      visualPrompt: 'Prince Rama in royal saffron silks, gentle smile, radiant golden divine aura walking forward with calm confidence',
      imageFile: 'image-01-1793695294024.png',
      durationSec: 6.82,
    },
    {
      sceneIndex: 2,
      narration: 'जैसे ही श्री राम ने अपने बाएं हाथ से उस भारी शिव धनुष को उठाया, संपूर्ण सभा विस्मय से स्तब्ध रह गई।',
      visualPrompt: 'Sri Rama lifting the colossal ancient Pinaka bow with one hand, golden divine energy sparks swirling',
      imageFile: 'image-02-1793695303487.png',
      durationSec: 6.82,
    },
    {
      sceneIndex: 3,
      narration: 'प्रत्यंचा चढ़ाते ही वह अमोघ धनुष प्रचंड गर्जना के साथ टूट गया, और १०८ दिशाओं में अलौकिक ध्वनि गूंज उठी।',
      visualPrompt: 'Dramatic climax moment of celestial bow snapping in two with a brilliant burst of divine golden light and shockwaves',
      imageFile: 'image-03-1793695314561.png',
      durationSec: 6.82,
    },
    {
      sceneIndex: 4,
      narration: 'माता सीता ने मुस्कुराते हुए वरमाला पहनाई, और संपूर्ण ब्रह्मांड में सत्य और धर्म की अमर विजय उद्घोषित हुई।',
      visualPrompt: 'Divine wedding of Rama and Sita in Janakpur, Sita holding sacred garland of lotus blossoms, celestial flower shower',
      imageFile: 'image-04-1793695325047.png',
      durationSec: 6.84,
    },
  ];

  const imagePaths = scenes.map((s) => s.imageFile);
  for (const img of imagePaths) {
    const fullP = path.join(mediaDir, img);
    if (!fs.existsSync(fullP)) {
      throw new Error(`Scene image not found: ${fullP}`);
    }
  }
  console.log(`2. All 5 scene images verified: ${imagePaths.join(', ')}`);

  // Step 3: Build 5 Fixed Profile Motion Templates (Hook First)
  console.log('3. Generating fixed profile motion templates for Ancient Dharma...');
  const resolution = { width: 1080, height: 1920 };
  const dynamicMotionGraphics = decideTemplateMotionGraphics(scenes, 'Ancient Dharma');
  console.log(`   Generated ${dynamicMotionGraphics.length} fixed motion templates:`);
  for (const g of dynamicMotionGraphics) {
    console.log(`   - [${g.type}] "${g.title}" (scene ${g.sceneIndex}, start: ${g.startSec}s, placement: ${JSON.stringify(g.placement)})`);
  }

  // Step 4: Build 5 Professional Intel Popups (Logical dossiers, punchy SFX)
  console.log('4. Compiling 5 Professional Intel Popups...');
  const extraPopups = [
    {
      id: 'popup_0_pinaka_relic',
      sceneIndex: 0,
      cueWord: 'पिनाक',
      cueOffsetSec: 2.2,
      durationSec: 3.4,
      title: 'पिनाक धनुष',
      subtitle: 'भगवान शिव का अमोघ धनुष',
      badgeTag: 'दिव्यास्त्र',
      archetype: 'heritage_intel',
      shape: 'cutout_relic',
      placement: 'top-right',
      scalePercent: 32,
      sfx: 'bubble_pop',
      status: 'ready',
    },
    {
      id: 'popup_1_shri_rama',
      sceneIndex: 1,
      cueWord: 'राम',
      cueOffsetSec: 2.2,
      durationSec: 3.4,
      title: 'श्री राम',
      subtitle: 'मर्यादा पुरुषोत्तम — इक्ष्वाकु वंश',
      badgeTag: 'चरित्र परिचय',
      archetype: 'macro_relic',
      shape: 'circle_medallion',
      placement: 'center-right',
      scalePercent: 32,
      sfx: 'crystal_ting',
      status: 'ready',
    },
    {
      id: 'popup_2_shiva_dhanush_vow',
      sceneIndex: 2,
      cueWord: 'धनुष',
      cueOffsetSec: 2.2,
      durationSec: 3.4,
      title: 'शिव धनुष प्रतिज्ञा',
      subtitle: 'सीता स्वयंवर का कठोर नियम',
      badgeTag: 'पवित्र प्रतिज्ञा',
      archetype: 'heritage_intel',
      shape: 'museum_glass_card',
      placement: 'top-right',
      scalePercent: 32,
      sfx: 'energy_hum',
      status: 'ready',
    },
    {
      id: 'popup_3_108_metric',
      sceneIndex: 3,
      cueWord: '१०८',
      cueOffsetSec: 2.2,
      durationSec: 3.4,
      title: '१०८ संदर्भ',
      subtitle: 'प्राचीन वाल्मीकि रामायण उल्लेख',
      badgeTag: 'प्रमाणित संख्या',
      archetype: 'metric_counter',
      shape: 'metric_counter',
      statValue: '१०८',
      statUnit: 'दिशाएं',
      placement: 'center-right',
      scalePercent: 32,
      sfx: 'hud_ping',
      status: 'ready',
    },
    {
      id: 'popup_4_mata_sita',
      sceneIndex: 4,
      cueWord: 'सीता',
      cueOffsetSec: 2.2,
      durationSec: 3.4,
      title: 'माता सीता',
      subtitle: 'विदेह राजकुमारी — जनकपुत्री',
      badgeTag: 'चरित्र परिचय',
      archetype: 'macro_relic',
      shape: 'circle_medallion',
      placement: 'top-right',
      scalePercent: 32,
      sfx: 'crystal_ting',
      status: 'ready',
    },
  ];

  // Step 5: Update script in store
  const existingScript = store.getById('scripts', scriptId) || { id: scriptId, name: 'Ancient Dharma Short' };
  const updatedScript = {
    ...existingScript,
    name: 'Ancient Dharma Short (Full Episode)',
    narration: scenes.map((s) => s.narration).join(' '),
    duration: Math.round(totalDuration),
    scenePlan: { scenes },
    imagePrompts: scenes.map((s) => s.visualPrompt),
    generatedImages: scenes.map((s, idx) => ({
      index: idx,
      status: 'done',
      url: `/api/generate/file/${scriptId}/${s.imageFile}`,
      prompt: s.visualPrompt,
    })),
    generatedAudio: [
      {
        filename: audioFile,
        language: 'hi',
        narrationText: scenes.map((s) => s.narration).join(' '),
      },
    ],
    dynamicMotionGraphics,
    extraPopups,
    enableSubtitles: true,
  };
  store.add('scripts', updatedScript);
  console.log('5. Full script persisted with 5 scenes, 5 motion graphics, and 5 popups.');

  // Step 6: Compile saved graphics project for render
  console.log('6. Compiling motion project for full render...');
  const project = savedGraphicsForRender(
    scriptId,
    audioFile,
    imagePaths,
    resolution,
    totalDuration
  );
  if (!project) {
    throw new Error('savedGraphicsForRender returned undefined! Check dynamic motion / popup compilation.');
  }
  console.log(`   Motion project compiled with ${project.artifacts.length} artifacts.`);
  console.log(`   Project soundDesign setting: "${project.settings?.soundDesign}"`);

  // Step 7: Sound design events extraction
  const sfxEvents = await motionSoundEvents(project, true);
  console.log(`7. Motion sound events extracted: ${sfxEvents.length} events`);
  for (const ev of sfxEvents) {
    console.log(`   - Path: ${path.basename(ev.path)}, Start: ${(ev.startSample / 48000).toFixed(2)}s, Gain: ${ev.gainDb}dB`);
  }

  // Step 8: Render base story video with transitions and subtitles
  console.log('8. Rendering full base story video (34.1s)...');
  const fullNarration = scenes.map((s) => s.narration).join(' ');
  const subtitlePath = generateSubtitleFile({
    scriptId,
    narration: fullNarration,
    duration: totalDuration,
  });
  console.log(`   Karaoke Shorts subtitles generated: ${subtitlePath}`);

  const renderOpts = {
    scriptId,
    imagePaths,
    audioPath: audioFile,
    duration: totalDuration,
    resolution,
    zoomFactor: 1.10,
    transitionDuration: 0.5,
    timelineConfig: {
      clips: scenes.map((s, idx) => ({
        duration: s.durationSec,
        transition: idx === scenes.length - 1 ? 'none' : 'crossfade',
        transitionDuration: idx === scenes.length - 1 ? 0 : 0.5,
      })),
    },
    enableSubtitles: true,
    subtitlePath,
    enableVignette: true,
    enableSfx: true,
    colorGrade: 'none',
  };

  const baseResult = await renderVideo(renderOpts);
  console.log(`   Base video rendered: ${baseResult.outputPath} (${(baseResult.size / 1024 / 1024).toFixed(2)} MB)`);

  // Step 9: Composite 3D motion graphics, popups, and SFX audio bus
  console.log('9. Compositing 3D motion graphics, popups, and SFX audio bus via Chromium HyperFrames...');
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

  // Step 10: Write atomic metadata json for revision tracking
  const rev = renderRevision(scriptId);
  const jsonPath = `${finalResult.outputPath}.json`;
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        revision: rev,
        resolution: '1080x1920',
        duration: finalResult.duration,
      },
      null,
      2
    )
  );
  console.log(`10. Wrote revision metadata to ${jsonPath}`);

  // Step 11: Verify with ffprobe
  console.log('11. Probing final output video with ffprobe...');
  const probeData = JSON.parse(
    execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', finalResult.outputPath],
      { encoding: 'utf8' }
    )
  );
  const vStream = probeData.streams.find((s) => s.codec_type === 'video');
  const aStream = probeData.streams.find((s) => s.codec_type === 'audio');

  console.log(`    Video Stream: ${vStream.width}x${vStream.height}, ${vStream.codec_name}, duration: ${vStream.duration}s`);
  console.log(`    Audio Stream: ${aStream.sample_rate}Hz, ${aStream.channels}ch (${aStream.channel_layout}), ${aStream.codec_name}, duration: ${aStream.duration}s`);

  // Step 12: Verify Export Tab recognition
  console.log('12. Verifying Export Tab recognition...');
  const outputDir = getOutputDir(scriptId);
  const allVideos = fs
    .readdirSync(outputDir)
    .filter((f) => f.endsWith('.mp4') && !f.endsWith('.partial.mp4'))
    .filter((f) => isCurrentRender(scriptId, path.join(outputDir, f)));

  console.log(`    Current valid renders in output directory: ${allVideos.length}`);
  for (const f of allVideos) {
    console.log(`    - Video: ${f}`);
    console.log(`      Playback URL: ${getVideoUrl(scriptId, f)}`);
  }

  // Update script in store with outputVideos so UI displays it
  const finalScript = {
    ...store.getById('scripts', scriptId),
    outputVideos: allVideos.map((f) => ({
      filename: f,
      url: getVideoUrl(scriptId, f),
      createdAt: new Date().toISOString(),
    })),
  };
  store.add('scripts', finalScript);

  console.log('\n=== SUCCESS: Full 34s Video rendered with all scenes, popups, 3D graphics & SFX! ===');
  console.log(`Ready in Export Tab for script: "${scriptId}" (${finalScript.name})`);
}

main().catch((err) => {
  console.error('\n*** RENDER FAILED ***\n', err);
  process.exit(1);
});
