import { reviewAndFixMotionGraphics } from '../server/dist/services/motion-graphics-reviewer.js';
import { runMotionGraphicsDirector } from '../server/dist/services/motion-graphics-director.js';
import { store } from '../server/dist/services/store.js';
import assert from 'assert';

console.log('================================================================');
console.log('TESTING AI MOTION GRAPHICS REVIEWER & AUTO-FIXER (USER PERSPECTIVE)');
console.log('================================================================');

async function testReviewerAutoFixes() {
  const scriptId = `test-reviewer-${Date.now()}`;

  // Create a script where overlays intentionally have user-facing problems:
  // Scene 1: Placed at 'bottom' (violating mobile subtitle safe zone)
  // Scene 2: Placed at 'center' over a close-up hero face (violating subject occlusion)
  // Scene 3: Oversized graphic (risking mobile screen edge clipping)
  // Scene 4: Premature 0.0s entrance timing
  const aiResponse = `<script>
Scene 1: Arctic winds howling across ice ridges.
Scene 2: Extreme close-up portrait of Shackleton's face covered in frost.
Scene 3: James Caird surging through titanic ocean waves.
Scene 4: Survivors waving from the rocky beach at rescue ship.
</script>

<image_prompt[1]>
Endurance ship locked in Antarctic pack ice at midnight, polar blizzard howling across towering blue pressure ridges.
</image_prompt[1]>

<overlay[1]>
template: radar_compass
label: POLAR AZIMUTH
metric: -40°C
placement: bottom
</overlay[1]>

<image_prompt[2]>
Extreme close-up portrait of Shackleton's frozen face with ice in his beard, intense survival determination.
</image_prompt[2]>

<overlay[2]>
template: route_trajectory
label: DRIFT TRAJECTORY
metric: 800 NM
placement: center
</overlay[2]>

<image_prompt[3]>
James Caird lifeboat surging through titanic Southern Ocean crests under pitch black tempest skies.
</image_prompt[3]>

<overlay[3]>
template: heartbeat_pulse
label: CRITICAL VITALS
metric: 165 BPM
placement: right
</overlay[3]>

<image_prompt[4]>
Shackleton and crew standing safe on Elephant Island shore, victorious relief on weather-beaten faces.
</image_prompt[4]>

<overlay[4]>
template: verified_seal
label: MISSION ACCOMPLISHED
metric: 0 LOST
placement: bottom
</overlay[4]>`;

  const scriptRecord = {
    id: scriptId,
    name: 'Against the Odds - Shackleton Epic',
    section: 'against_the_odds',
    aiResponse,
    scenePlan: {
      version: 1,
      title: 'Against the Odds - Shackleton Epic',
      scenes: [
        {
          narration: 'Arctic winds howling across ice ridges.',
          imagePrompt: 'Endurance ship locked in Antarctic pack ice at midnight.',
          duration: 5.0,
        },
        {
          narration: "Extreme close-up portrait of Shackleton's face covered in frost.",
          imagePrompt: "Extreme close-up portrait of Shackleton's frozen face with ice in beard.",
          duration: 5.5,
        },
        {
          narration: 'James Caird surging through titanic ocean waves.',
          imagePrompt: 'James Caird lifeboat surging through titanic Southern Ocean crests.',
          duration: 6.0,
        },
        {
          narration: 'Survivors waving from the rocky beach at rescue ship.',
          imagePrompt: 'Shackleton and crew standing safe on Elephant Island shore.',
          duration: 4.5,
        },
      ],
    },
    // Initial un-reviewed graphics with bad placements
    dynamicMotionGraphics: [
      {
        id: 'dmg-test-0',
        sceneIndex: 0,
        type: 'radar_compass',
        title: 'POLAR AZIMUTH',
        detail: '-40°C',
        placement: { position: 'bottom', align: 'center' },
        startSec: 0.1,
        durationSec: 4.0,
        render: { html: '<div>HUD</div>', css: 'width: 88%; transform: scale(1.2);', js: '' },
      },
      {
        id: 'dmg-test-1',
        sceneIndex: 1,
        type: 'route_trajectory',
        title: 'DRIFT TRAJECTORY',
        detail: '800 NM',
        placement: { position: 'center', align: 'center' },
        startSec: 0.8,
        durationSec: 4.0,
        render: { html: '<div>Route</div>', css: '', js: '' },
      },
      {
        id: 'dmg-test-2',
        sceneIndex: 2,
        type: 'heartbeat_pulse',
        title: 'CRITICAL VITALS',
        detail: '165 BPM',
        placement: { position: 'right', align: 'center' },
        startSec: 0.8,
        durationSec: 4.0,
        render: { html: '<div>Pulse</div>', css: '', js: '' },
      },
      {
        id: 'dmg-test-3',
        sceneIndex: 3,
        type: 'verified_seal',
        title: 'MISSION ACCOMPLISHED',
        detail: '0 LOST',
        placement: { position: 'bottom', align: 'center' },
        startSec: 0.8,
        durationSec: 4.0,
        render: { html: '<div>Seal</div>', css: '', js: '' },
      },
    ],
  };

  store.add('scripts', scriptRecord);

  console.log('Running Visual Reviewer on script with intentional layout & safe-zone violations...');
  const { script, graphics, report } = await reviewAndFixMotionGraphics({
    scriptId,
    aspectRatio: '9:16',
    channelProfile: 'against_the_odds',
  });

  console.log(`\n✓ Reviewer Verdict: ${report.verdict}`);
  console.log(`✓ Safe Zone Compliance: ${report.safeZoneCompliance}%`);
  console.log(`✓ Total Graphics Audited: ${report.totalAudited}`);
  console.log(`✓ Total Issues Auto-Fixed: ${report.totalFixed}`);
  console.log(`✓ Summary: "${report.summary}"\n`);

  // Assertions:
  // 1. Must report that fixes were applied
  assert.equal(report.verdict, 'AUTO_FIXED_ALL_ISSUES');
  assert(report.totalFixed > 0, 'Reviewer must auto-fix detected issues');
  assert.equal(report.safeZoneCompliance, 100, 'Compliance must be 100% after auto-fixes');

  // 2. Check Scene 0 (was placed at bottom in subtitle band):
  const item0 = report.items[0];
  console.log(`Scene 0 Audit: originalPlacement="${item0.originalPlacement}", correctedPlacement="${item0.correctedPlacement}"`);
  assert(item0.issues.some(i => i.type === 'subtitle_collision'), 'Must detect subtitle collision on bottom placement');
  assert(item0.correctedPlacement === 'top-right' || item0.correctedPlacement === 'top', 'Must relocate bottom placement out of subtitle safe zone');

  // 3. Check Scene 1 (was center over close-up hero portrait face):
  const item1 = report.items[1];
  console.log(`Scene 1 Audit: originalPlacement="${item1.originalPlacement}", correctedPlacement="${item1.correctedPlacement}"`);
  assert(item1.issues.some(i => i.type === 'subject_occlusion'), 'Must detect subject occlusion over hero face');
  assert(item1.correctedPlacement === 'top-right', 'Must relocate center placement to top-right to frame hero face');

  // 4. Check Scene 2 (was placed at right colliding with YouTube action buttons):
  const item2 = report.items[2];
  console.log(`Scene 2 Audit: originalPlacement="${item2.originalPlacement}", correctedPlacement="${item2.correctedPlacement}"`);
  assert(item2.issues.some(i => i.type === 'clipping_edge'), 'Must detect right edge UI collision');
  assert(item2.correctedPlacement === 'top', 'Must relocate right placement away from action buttons');

  // 5. Check Scene 3 (was bottom):
  const item3 = report.items[3];
  console.log(`Scene 3 Audit: originalPlacement="${item3.originalPlacement}", correctedPlacement="${item3.correctedPlacement}"`);
  assert(item3.issues.some(i => i.type === 'subtitle_collision'), 'Must detect subtitle collision on bottom placement');
  assert(item3.correctedPlacement === 'top-right', 'Must relocate bottom seal to top-right');

  // 6. Verify that graphics in script have been compiled with corrected placement
  for (const g of graphics) {
    const pos = g.placement?.position;
    assert(pos !== 'bottom', `Graphic in scene ${g.sceneIndex} must not be at bottom`);
    assert(pos !== 'right', `Graphic in scene ${g.sceneIndex} must not be at right edge`);
    console.log(`  -> Graphic Scene ${g.sceneIndex}: placement="${pos}", scale=${g.render?.css?.includes('scale(') ? 'yes' : 'standard'}`);
  }

  // 7. Verify script.aiResponse has updated <overlay[N]> tags
  assert(!script.aiResponse.includes('placement: bottom'), 'aiResponse must not contain placement: bottom');
  console.log('\n✓ Verified script.aiResponse <overlay> tags updated with safe placements!');

  // 8. Test end-to-end integration: runMotionGraphicsDirector should also automatically execute the reviewer!
  console.log('\nTesting End-to-End: Director automatically executing Visual Reviewer...');
  const directorResult = await runMotionGraphicsDirector({
    scriptId,
    channelName: 'Against the Odds',
    channelProfile: 'against_the_odds',
  });

  assert(directorResult.graphics.length > 0, 'Director must compile graphics');
  assert(directorResult.script.motionReviewerReport, 'Director result must include motionReviewerReport');
  assert.equal(directorResult.script.motionReviewerReport.safeZoneCompliance, 100);
  console.log('✓ End-to-End Director + Reviewer pass PASSED with 100% safe zone compliance!');
}

testReviewerAutoFixes()
  .then(() => {
    console.log('\n================================================================');
    console.log('ALL AI MOTION GRAPHICS REVIEWER TESTS PASSED 100%!');
    console.log('================================================================\n');
  })
  .catch((err) => {
    console.error('Reviewer test failed:', err);
    process.exit(1);
  });
