import { parseSimpleTagPackage } from '../server/dist/services/simple-tag-package.js';
import { decideDynamicMotionGraphics } from '../server/dist/services/dynamic-motion-engine.js';

console.log('=== TESTING CO-AUTHORED OVERLAYS IN SCRIPT PIPELINE ===\n');

const sampleAiResponse = `
<script>
In April 1916, Shackleton faced the impossible in the Antarctic ice pack.
Stranded on Elephant Island, twenty-eight men clung to frozen rock.
With zero chance of rescue, an SOS distress signal echoed into the void.
Six men launched an open lifeboat across eight hundred miles of hurricane seas.
Against -28 degree temperatures, Shackleton's survival probability stood at 94 percent.
After sixteen months, the Chilean steam tug Yelcho arrived with zero casualties.
Twenty months stranded, and not a single life was lost.
</script>

<image_prompt0>
Cinematic epic thumbnail of Antarctic ice pack and lifeboat.
</image_prompt0>

<image_prompt1>
Wide shot of small open wooden lifeboat navigating turbulent icy swells, mist and glaciers in background.
</image_prompt1>
<overlay1>
template: radar-compass
label: EXPEDITION HUD
metric: 68°S 52°W
placement: top
cue: "Antarctic ice pack"
</overlay1>

<image_prompt2>
Elephant Island shoreline with 28 stranded men in weather-beaten parkas beside overturned camp shelter.
</image_prompt2>
<overlay2>
template: tactical-reticle
label: ELEPHANT ISLAND
metric: 61°08'S 55°07'W
placement: center
cue: "twenty-eight men"
</overlay2>

<image_prompt3>
Violent Southern Ocean rogue wave crashing against a 22-foot wooden lifeboat under stormy skies.
</image_prompt3>
<overlay3>
template: sound-wave
label: S.O.S. BEACON
metric: FREQ 500 kHz
placement: bottom
cue: "distress signal"
</overlay3>

<image_prompt4>
Panoramic snowy mountain peaks of South Georgia Island with two weary mountaineers trekking across crevasse.
</image_prompt4>
<overlay4>
template: route-trajectory
label: OPEN-OCEAN ROUTE
metric: 800
unit: NAUTICAL MILES
placement: bottom
cue: "eight hundred miles"
</overlay4>

<image_prompt5>
Black and white archival cinematic steam tugboat cutting through calm waters of Antarctic fjord.
</image_prompt5>
<overlay5>
template: circular-progress
label: SURVIVAL INDEX
metric: 94%
placement: center
cue: "94 percent"
</overlay5>

<image_prompt6>
Chilean steam tug Yelcho approaching Elephant Island with crew waving triumphantly from the stony beach.
</image_prompt6>
<overlay6>
template: verified-seal
label: MISSION VERIFIED
metric: ALL 28 RESCUED
placement: bottom
cue: "zero casualties"
</overlay6>

<image_prompt7>
Back view of surviving expedition crew members standing on ship deck looking out toward sunrise over the ocean.
</image_prompt7>
<overlay7>
template: victory-crest
label: NOT A SINGLE LIFE LOST
metric: 100% SURVIVAL
placement: bottom
cue: "not a single life was lost"
</overlay7>
`;

// 1. Test parsing <overlay[N]> tags into scene objects
console.log('1. Parsing AI response with simple-tag-package...');
const plan = parseSimpleTagPackage(sampleAiResponse);
console.log(`- Extracted ${plan.scenes.length} scenes.`);
console.log(`- Extracted ${plan.motionMetadata?.length || 0} overlay metadata blocks.`);

plan.scenes.forEach((sc, i) => {
  const overlay = sc.motionGraphics?.[0];
  console.log(`  Scene ${i + 1}: ${sc.chapter} -> Overlay: [${overlay?.templateId || 'none'}] label="${overlay?.title || ''}" metric="${overlay?.statValue || overlay?.detail || ''}"`);
});

if (!plan.scenes[0].motionGraphics || plan.scenes[0].motionGraphics[0].templateId !== 'radar-compass') {
  throw new Error('Scene 1 overlay did not parse radar-compass properly!');
}

// 2. Test compiling into DynamicMotionGraphics with theme tokens
console.log('\n2. Compiling into DynamicMotionGraphics for Against the Odds...');
const scenesForMotion = plan.scenes.map((s, idx) => ({
  sceneIndex: idx,
  narration: s.narration,
  visualPrompt: s.imagePrompt,
  motionGraphics: s.motionGraphics,
  title: s.motionGraphics?.[0]?.title,
  detail: s.motionGraphics?.[0]?.detail,
}));

const compiledGraphics = await decideDynamicMotionGraphics({
  scenes: scenesForMotion,
  channelName: 'Against the Odds',
  channelProfile: 'against_the_odds',
});

console.log(`- Compiled ${compiledGraphics.length} motion graphics!`);
compiledGraphics.forEach((g, idx) => {
  console.log(`  Graphic ${idx + 1}: ID=${g.id} Type=${g.type} Title="${g.title}" Placement=${g.placementData?.placement || 'center'}`);
});

console.log('\n3. Testing breathe room ("none" overlay)...');
const breathTest = await decideDynamicMotionGraphics({
  scenes: [
    {
      sceneIndex: 0,
      narration: 'Scene with breath room.',
      visualPrompt: 'Scenic mountains.',
      motionGraphics: [{ templateId: 'none' }],
    },
    {
      sceneIndex: 1,
      narration: 'Scene with reticle.',
      visualPrompt: 'Boat on water.',
      motionGraphics: [{ templateId: 'tactical-reticle', title: 'TARGET LOCK' }],
    },
  ],
  channelName: 'Against the Odds',
  channelProfile: 'against_the_odds',
});

console.log(`- Breath test: Expected 1 graphic (scene 1 skipped), got ${breathTest.length}.`);
if (breathTest.length !== 1 || breathTest[0].sceneIndex !== 1) {
  throw new Error('Breath test failed: "none" overlay was not skipped!');
}

console.log('\n✅ ALL TESTS PASSED! Co-authored script overlay system is 100% working.');
