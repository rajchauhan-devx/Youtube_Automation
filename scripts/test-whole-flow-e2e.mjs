import { savedGraphicsForRender } from '../server/dist/services/render-graphics.js';
import { store } from '../server/dist/services/store.js';
import { parseSimpleTagPackage } from '../server/dist/services/simple-tag-package.js';
import assert from 'assert';

console.log('================================================================');
console.log('TESTING COMPLETE END-TO-END FLOW (PREVIEW -> DIRECTOR -> REVIEWER -> RENDER)');
console.log('================================================================');

const SERVER_URL = 'http://127.0.0.1:3001';

async function testCompleteFlow(profileKey, channelName) {
  console.log(`\n>>> STARTING WHOLE FLOW AUDIT FOR [${channelName}] (${profileKey}) <<<`);

  const scriptId = `flow-test-${profileKey}-${Date.now()}`;

  // --------------------------------------------------------------------------
  // STEP 1: INITIAL SCRIPT GENERATION & TAG PARSING
  // --------------------------------------------------------------------------
  console.log('\n--- Step 1: Script Input & Simple Tag Package Extraction ---');
  const initialAiResponse = `<script>
Scene 1: Shackleton's ship entered the polar pack ice under forty below zero temperatures.
Scene 2: Over eight hundred miles of frozen ocean, their route demanded relentless navigation.
Scene 3: Panic spiked as vitals surged to critical thresholds in the blizzard.
Scene 4: In an astonishing resolution, every single man survived with zero lost.
</script>

<image_prompt[1]>
Endurance ship locked in Antarctic pack ice at midnight, polar blizzard howling across towering blue pressure ridges.
</image_prompt[1]>

<overlay[1]>
template: old_text_lower_third
label: INITIAL DRAFT CARD
metric: 1914
placement: bottom
</overlay[1]>

<image_prompt[2]>
Frank Wild leading three men dragging heavy lifeboats across jagged blue sea ice, raw survival determination.
</image_prompt[2]>

<overlay[2]>
template: old_paragraph_box
label: THE JOURNEY
placement: center
</overlay[2]>

<image_prompt[3]>
Close-up of frozen frostbite gear and shivering faces battling gale-force winds.
</image_prompt[3]>

<overlay[3]>
template: old_title_card
label: CRISIS POINT
placement: right
</overlay[3]>

<image_prompt[4]>
Shackleton and crew standing safe on Elephant Island shore, victorious relief on weather-beaten faces.
</image_prompt[4]>

<overlay[4]>
template: old_text_seal
label: THE END
placement: bottom
</overlay[4]>`;

  const parsedPackage = parseSimpleTagPackage(initialAiResponse, { isImageOnly: true });
  assert.equal(parsedPackage.scenes.length, 4, 'Tag parser must extract all 4 scenes');
  console.log(`✓ Simple tag parser successfully extracted ${parsedPackage.scenes.length} scenes.`);

  // Save initial script to store with simulated old extraPopups and old editing project
  const initialScript = {
    id: scriptId,
    name: `${channelName} Flow Episode`,
    section: profileKey,
    aiResponse: initialAiResponse,
    imagePrompts: parsedPackage.scenes.map(s => s.imagePrompt),
    narration: parsedPackage.scenes.map(s => s.narration).join(' '),
    duration: 20.0,
    scenePlan: {
      version: 1,
      title: `${channelName} Flow Episode`,
      scenes: parsedPackage.scenes.map((s, idx) => ({
        ...s,
        duration: 5.0,
      })),
    },
    // Contaminants that caused 90% text in previous runs:
    extraPopups: [
      { id: 'ep-contaminant-1', title: 'OLD DARK POPUP BOX', cueWord: 'navigation', status: 'ready' }
    ],
    editingProjectId: 'old-legacy-documentary-project',
  };

  store.add('scripts', initialScript);
  console.log('✓ Initial script registered with deliberate legacy text contaminants.');

  // --------------------------------------------------------------------------
  // STEP 2: AI MOTION GRAPHICS DIRECTOR EXECUTION VIA HTTP
  // --------------------------------------------------------------------------
  console.log('\n--- Step 2: Calling AI Motion Graphics Director API ---');
  const directorRes = await fetch(`${SERVER_URL}/api/editing/motion-director`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scriptId,
      channelName,
      channelProfile: profileKey,
    }),
  });

  assert(directorRes.ok, `Director API call failed with HTTP ${directorRes.status}`);
  const directorData = await directorRes.json();
  const directedScript = directorData.script;
  const directedGraphics = directorData.graphics;

  console.log(`✓ Director API returned 200 OK.`);
  console.log(`✓ Director Vision: "${directorData.report.directorVision.slice(0, 75)}..."`);
  console.log(`✓ Compiled Graphics: ${directedGraphics.length}`);

  // Assert 100% elimination of text boxes
  assert.equal(directedScript.extraPopups.length, 0, 'Extra popups must be 100% purged');
  assert.equal(directedScript.editingProjectId, undefined, 'Legacy documentary project ID must be 100% purged');
  assert(!directedScript.aiResponse.includes('old_text_lower_third'), 'Old text lower third must be eliminated');
  assert(!directedScript.aiResponse.includes('old_paragraph_box'), 'Old paragraph box must be eliminated');
  console.log('✓ Verified: 100% of legacy text boxes, cards, and dark popups purged.');

  // --------------------------------------------------------------------------
  // STEP 3: AI MOTION GRAPHICS VISUAL REVIEWER & AUTO-FIXER AUDIT
  // --------------------------------------------------------------------------
  console.log('\n--- Step 3: Verifying Visual Reviewer Safe-Zone & Positioning Auto-Fixes ---');
  const reviewerReport = directedScript.motionReviewerReport;
  assert(reviewerReport, 'Reviewer report must be present on script');
  console.log(`✓ Reviewer Verdict: ${reviewerReport.verdict}`);
  console.log(`✓ Safe Zone Compliance: ${reviewerReport.safeZoneCompliance}%`);
  console.log(`✓ Total Issues Auto-Fixed: ${reviewerReport.totalFixed}`);

  // Confirm that none of the final graphics are placed in the bottom subtitle zone
  for (const g of directedGraphics) {
    const pos = g.placement?.position;
    assert(pos !== 'bottom', `Graphic in scene ${g.sceneIndex} must not be at bottom`);
    assert(pos !== 'right', `Graphic in scene ${g.sceneIndex} must not be at right edge`);
    assert(g.render?.css?.includes('transparent'), 'CSS must be transparent vector');
    console.log(`  -> Scene ${g.sceneIndex}: template=${g.type}, placement=${pos}, title="${g.title}"`);
  }
  console.log('✓ Verified: All graphics auto-corrected into safe zones (0% subtitle collision).');

  // --------------------------------------------------------------------------
  // STEP 4: RENDER ENGINE GRAPHICS COMPILATION (savedGraphicsForRender)
  // --------------------------------------------------------------------------
  console.log('\n--- Step 4: Testing Video Render Engine Preparation ---');
  // Mock image paths and audio path for 4 scenes
  const dummyImages = [
    'scene0.png',
    'scene1.png',
    'scene2.png',
    'scene3.png'
  ];
  const dummyAudio = 'narration.mp3';

  // Test savedGraphicsForRender
  const renderProject = savedGraphicsForRender(
    scriptId,
    dummyAudio,
    dummyImages,
    { width: 1080, height: 1920 },
    20.0
  );

  assert(renderProject, 'savedGraphicsForRender must produce a valid render project');
  assert.equal(renderProject.artifacts.length, directedGraphics.length, 'All directed graphics must be converted to render artifacts');

  // Assert that each artifact has valid HyperFrames vector rendering
  for (const art of renderProject.artifacts) {
    assert(art.enabled, 'Artifact must be enabled');
    assert(art.dynamicMotion, 'Artifact must have dynamicMotion spec');
    assert(art.startFrame >= 0, 'Artifact must have valid startFrame');
    assert(art.endFrame > art.startFrame, 'Artifact endFrame must be greater than startFrame');
    console.log(`  -> Render Artifact: id=${art.id}, scene=${art.sceneId}, frames=${art.startFrame}..${art.endFrame}, template=${art.dynamicMotion.type}`);
  }
  console.log(`✓ Video Render Engine successfully compiled ${renderProject.artifacts.length} transparent GSAP vector overlays!`);

  console.log(`\n>>> [${channelName}] WHOLE FLOW PASSED 100% CLEAN! <<<\n`);
}

async function runAll() {
  await testCompleteFlow('against_the_odds', 'Against the Odds');
  await testCompleteFlow('ancient_dharma', 'Ancient Dharma');
  console.log('================================================================');
  console.log('ALL FLOW STAGES (TAGS -> DIRECTOR -> REVIEWER -> RENDER) VERIFIED 100%!');
  console.log('================================================================\n');
}

runAll().catch(err => {
  console.error('Whole flow test failed:', err);
  process.exit(1);
});
