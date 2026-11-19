import { runMotionGraphicsDirector } from '../server/dist/services/motion-graphics-director.js';
import { store } from '../server/dist/services/store.js';
import assert from 'assert';

console.log('================================================================');
console.log('TESTING AI MOTION GRAPHICS DIRECTOR: VISUAL RE-EXAMINATION & UPGRADE');
console.log('================================================================');

async function testDirectorForProfile(profileKey, channelName) {
  const testScriptId = `test-director-${profileKey}-${Date.now()}`;

  // Create an initial script that simulated the old, flawed text-heavy output
  const initialAiResponse = `<script>
Scene 1 narration: In the harshest conditions, the crew began their journey across uncharted terrain.
Scene 2 narration: With temperatures plunging, their trajectory took them deeper into the danger zone.
Scene 3 narration: Panic surged as vitals spiked to dangerous levels in the freezing cold.
Scene 4 narration: Against impossible odds, the team reached safety with zero losses.
</script>

<image_prompt[1]>
High-altitude expedition shot with icy blizzard blowing across ridges.
</image_prompt[1]>

<overlay[1]>
template: lower_third_card
label: EXPEDITION DAY 1
metric: 1914
</overlay[1]>

<image_prompt[2]>
Explorers dragging heavy sledges through snow drifts under slate grey skies.
</image_prompt[2]>

<overlay[2]>
template: paragraph_text_box
label: THE JOURNEY BEGINS
metric: DAY 42
</overlay[2]>

<image_prompt[3]>
Close-up of frozen frostbite gear and shivering faces battling gale-force winds.
</image_prompt[3]>

<overlay[3]>
template: title_card
label: CRISIS POINT
metric: WARNING
</overlay[3]>

<image_prompt[4]>
Heroic group portrait of survivors on the rocky coastline.
</image_prompt[4]>

<overlay[4]>
template: text_box
label: THE END
metric: FINISHED
</overlay[4]>`;

  const scriptRecord = {
    id: testScriptId,
    name: `${channelName} Episode`,
    section: profileKey,
    aiResponse: initialAiResponse,
    extraPopups: [
      { id: 'ep-old-1', title: 'OLD DARK TEXT CARD', status: 'ready', cueWord: 'journey' }
    ],
    editingProjectId: 'old-doc-text-project-id',
  };

  store.add('scripts', scriptRecord);

  console.log(`\n--- Testing Director for [${channelName}] (${profileKey}) ---`);
  const result = await runMotionGraphicsDirector({
    scriptId: testScriptId,
    channelName,
    channelProfile: profileKey,
  });

  const { script, graphics, report } = result;

  console.log(`✓ Director Vision: "${report.directorVision.slice(0, 80)}..."`);
  console.log(`✓ Total Scenes Examined: ${report.totalScenes}`);
  console.log(`✓ Pure Visual Overlays Compiled: ${graphics.length}`);
  console.log(`✓ Breathing Room Scenes: ${report.breathingRoomScenes}`);

  // Assertions:
  // 1. Must have compiled pure visual graphics
  assert(graphics.length > 0, 'Director must compile pure visual graphics');

  // 2. Extra popups must be cleared (0 text cards)
  assert.equal(script.extraPopups.length, 0, 'Extra popups text cards must be wiped out');

  // 3. Editing project id must be cleared
  assert.equal(script.editingProjectId, undefined, 'Legacy documentary text project must be cleared');

  // 4. No boring text templates in upgraded tags
  const updatedText = script.aiResponse;
  assert(!updatedText.includes('lower_third_card'), 'Lower third card must be eliminated');
  assert(!updatedText.includes('paragraph_text_box'), 'Paragraph text box must be eliminated');
  assert(!updatedText.includes('title_card'), 'Title card must be eliminated');

  // 5. Must contain valid vector template tags
  const validTemplates = [
    'radar_compass',
    'route_trajectory',
    'heartbeat_pulse',
    'sound_wave',
    'circular_progress',
    'verified_seal',
    'victory_crest',
    'sniper_lock',
    'chakra_mandala',
    'temple_architecture',
    'magnifying_glass',
    'divine_weapon_showcase',
    'historical_timeline',
    'gauge_needle'
  ];

  const hasVectorTemplate = validTemplates.some(tpl => updatedText.includes(tpl));
  assert(hasVectorTemplate, `Updated script must contain pure visual vector templates: ${updatedText}`);

  // 6. Graphics must contain valid GSAP overlay specs
  for (const g of graphics) {
    assert(g.id, 'Graphic must have id');
    assert(g.render?.html, 'Graphic must have HTML');
    assert(g.render?.css, 'Graphic must have CSS');
    assert(g.render?.js, 'Graphic must have JS');
    assert(g.render.css.includes('transparent') || g.render.css.includes('pointer-events'), 'Graphic must be transparent overlay');
    console.log(`  -> Scene ${g.sceneIndex}: template=${g.type}, title="${g.title}", metric="${g.metric || g.detail || ''}"`);
  }

  console.log(`✓ PASSED Director visual re-examination for ${channelName}!`);
}

async function runAll() {
  await testDirectorForProfile('against_the_odds', 'Against the Odds');
  await testDirectorForProfile('ancient_dharma', 'Ancient Dharma');
  await testDirectorForProfile('talvora', 'Talvora');
  await testDirectorForProfile('blender_3d', 'Curious Cutaways');
  console.log('\n================================================================');
  console.log('ALL 4 CHANNELS PASSED AI MOTION GRAPHICS DIRECTOR VERIFICATION!');
  console.log('================================================================\n');
}

runAll().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
