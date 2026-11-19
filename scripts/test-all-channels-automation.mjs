import { parseSimpleTagPackage } from '../server/dist/services/simple-tag-package.js';
import { decideDynamicMotionGraphics } from '../server/dist/services/dynamic-motion-engine.js';
import assert from 'assert';

console.log('================================================================');
console.log('TESTING FULLY AUTOMATED CO-AUTHORED OVERLAYS ACROSS 4 CHANNELS');
console.log('================================================================');

const profiles = [
  {
    key: 'against_the_odds',
    name: 'Against the Odds',
    sampleScript: `<script>
At minus forty degrees, Shackleton's men faced absolute frozen wilderness. Their nautical route stretched over eight hundred miles of ice. With radio distress equalizers silent, their survival gauge dropped below six percent. Yet every single man verified zero casualties.
</script>

<image_prompt0>
Cinematic poster thumbnail of Endurance trapped in Antarctic ice pack, heroic explorer silhouetted against glowing polar sunrise.
</image_prompt0>

<image_prompt[1]>
Endurance ship locked in Antarctic pack ice at midnight, polar blizzard howling across towering blue pressure ridges.
</image_prompt[1]>

<overlay[1]>
template: Tactical Radar Compass HUD
metric: -40°C
unit: C
label: POLAR POSITION // 78°S
placement: top-right
cue: minus forty degrees
</overlay[1]>

<image_prompt[2]>
Frank Wild leading three men dragging heavy lifeboats across jagged blue sea ice, raw survival determination.
</image_prompt[2]>

<overlay[2]>
template: Nautical Route Trajectory Arc
metric: 800 NM
unit: NM
label: DRIFT TRAJECTORY
placement: top
cue: eight hundred miles
</overlay[2]>

<image_prompt[3]>
James Caird lifeboat surging through titanic Southern Ocean crests under pitch black tempest skies.
</image_prompt[3]>

<overlay[3]>
template: Heartbeat EKG Pulse Monitor
metric: 165 BPM
label: CRITICAL SURVIVAL THRESHOLD
placement: center
cue: survival gauge
</overlay[3]>

<image_prompt[4]>
Shackleton and crew standing safe on Elephant Island shore, victorious relief on weather-beaten faces.
</image_prompt[4]>

<overlay[4]>
template: Emerald Verified Seal (0 Lost)
metric: 0 LOST
label: MISSION ACCOMPLISHED
placement: center
cue: zero casualties
</overlay[4]>
`
  },
  {
    key: 'ancient_dharma',
    name: 'Ancient Dharma',
    sampleScript: `<script>
चौदह वर्षों की अखण्ड जागृति में लक्ष्मण ने देवी निद्रा की कठिन शर्त स्वीकार की। जब सुदर्शन चक्र का अलौकिक तेज चमका, तो कालचक्र का रहस्य उद्घाटित हुआ।
</script>

<image_prompt0>
Cinematic devotional YouTube thumbnail of Lakshmana with golden aura and glowing Pinaka bow.
</image_prompt0>

<image_prompt[1]>
Lakshmana standing in sacred forest vigil at midnight, divine glow surrounding his focused warrior stance, ancient Vedic hermitage.
</image_prompt[1]>

<overlay[1]>
template: Rotating Golden Chakra / Mandala
metric: १४ वर्ष
label: अखण्ड साधना // कालचक्र
placement: center
cue: चौदह वर्षों की
</overlay[1]>

<image_prompt[2]>
Sudarshana chakra spinning in blinding golden solar radiance across cosmic skies, dispersing dark shadows.
</image_prompt[2]>

<overlay[2]>
template: Golden Laurel Victory Crest
metric: अमोघ तेज
label: सत्य सनातन विजय
placement: center
cue: अलौकिक तेज
</overlay[2]>
`
  },
  {
    key: 'talvora',
    name: 'Talvora',
    sampleScript: `<script>
In the quiet shadows of midnight, she noticed the slight tremor in his voice. The polygraph wave flickered as the truth finally surfaced.
</script>

<image_prompt0>
Cinematic noir thumbnail of detective examining illuminated audio tape in dark room with blinds shadows.
</image_prompt0>

<image_prompt[1]>
Dimly lit noir detective office, Venetian blinds casting atmospheric shadows over vintage desk, glowing tape recorder.
</image_prompt[1]>

<overlay[1]>
template: Distress Radio Equalizer Waveform
metric: 42.8 kHz
label: AUDIO INTERCEPT // FREQUENCY
placement: top
cue: quiet shadows
</overlay[1]>

<image_prompt[2]>
Dramatic close-up of suspect hands clenched, tension building under cold interrogation lamp.
</image_prompt[2]>

<overlay[2]>
template: Lie Detector / Polygraph Wave
metric: DECEPTION DETECTED
label: STRESS RESPONSE
placement: center
cue: polygraph wave
</overlay[2]>
`
  },
  {
    key: 'blender_3d',
    name: 'Curious Cutaways',
    sampleScript: `<script>
Inside the mechanical heart of this mechanical watch, the balance wheel oscillates at twenty-eight thousand vibrations per hour. Precision tolerances of fourteen point two millimeters ensure flawless gear tooth mesh.
</script>

<image_prompt0>
Cinematic 3D render thumbnail of exploded mechanical watch movement, glowing neon cyan and amber gears floating in space.
</image_prompt0>

<image_prompt[1]>
Intricate 3D cutaway isometric render of a Swiss mechanical tourbillon watch movement, glowing brass gears and sapphire jewels.
</image_prompt[1]>

<overlay[1]>
template: 3D Blueprint CAD Wireframe
metric: 28,800 VPH
label: OSCILLATION FREQUENCY
placement: center
cue: twenty-eight thousand
</overlay[1]>

<image_prompt[2]>
Macro extreme close-up exploded view of watch escapement gear teeth engaging with ruby pallet stones.
</image_prompt[2]>

<overlay[2]>
template: Dimension Callout (14.2mm)
metric: 14.2 mm
label: ESCAPEMENT DIAMETER
placement: top-right
cue: fourteen point two
</overlay[2]>
`
  }
];

for (const profile of profiles) {
  console.log(`\n------------------------------------------------------------`);
  console.log(`CHANNEL PROFILE: [${profile.name}] (${profile.key})`);
  console.log(`------------------------------------------------------------`);

  const pkg = parseSimpleTagPackage(profile.sampleScript, { isImageOnly: true });
  console.log(`Extracted scenes: ${pkg.scenes.length}`);
  assert(pkg.scenes.length > 0, 'Scenes must be extracted');

  const scenesWithMotion = pkg.scenes.filter(s => s.motionGraphics && s.motionGraphics.length > 0);
  console.log(`Scenes with co-authored overlays: ${scenesWithMotion.length}/${pkg.scenes.length}`);
  assert(scenesWithMotion.length === pkg.scenes.length, 'Every scene should have its co-authored overlay');

  for (let i = 0; i < pkg.scenes.length; i++) {
    const sc = pkg.scenes[i];
    const mg = sc.motionGraphics[0];
    console.log(`  Scene ${i + 1}: template="${mg.templateId}", label="${mg.label || mg.title}", metric="${mg.metric || mg.statValue || mg.detail}"`);
  }

  // Compile via decideDynamicMotionGraphics
  const compiled = await decideDynamicMotionGraphics({
    scenes: pkg.scenes.map((s, idx) => ({
      sceneIndex: idx,
      narration: s.narration,
      visualPrompt: s.imagePrompt || s.videoPrompt || '',
      motionGraphics: s.motionGraphics,
      title: s.motionGraphics?.[0]?.title || s.motionGraphics?.[0]?.label,
      detail: s.motionGraphics?.[0]?.detail || s.motionGraphics?.[0]?.metric,
      badge: s.motionGraphics?.[0]?.badge || s.motionGraphics?.[0]?.unit,
      statValue: s.motionGraphics?.[0]?.statValue || s.motionGraphics?.[0]?.metric,
      statUnit: s.motionGraphics?.[0]?.statUnit || s.motionGraphics?.[0]?.unit,
      placement: s.motionGraphics?.[0]?.placement,
      cuePhrase: s.motionGraphics?.[0]?.cuePhrase || s.motionGraphics?.[0]?.cue,
    })),
    channelProfile: profile.key,
    scriptText: profile.sampleScript,
  });

  console.log(`Compiled motion graphics count: ${compiled.length}`);
  assert(compiled.length === pkg.scenes.length, 'Should compile graphic for every scene');

  for (let i = 0; i < compiled.length; i++) {
    const g = compiled[i];
    console.log(`  ✓ Graphic ${i + 1}: type="${g.type}", title="${g.title}", cue="${g.cuePhrase}"`);
    assert(g.render && g.render.html && g.render.css && g.render.js, 'Render payload must be complete');
    assert(g.render.html.includes('<svg') || g.render.html.includes('dm-3d'), 'Must be vector motion graphic');
    // Ensure no dark opaque background card
    assert(!g.render.css.includes('background: #000000') && !g.render.css.includes('background: black'), 'Must have transparent background');
  }
}

console.log('\n================================================================');
console.log('ALL CHANNELS & PROFILES FULLY AUTOMATED & VERIFIED! 100% PASSED');
console.log('================================================================\n');
