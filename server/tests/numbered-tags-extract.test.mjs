import assert from 'node:assert/strict';
import test from 'node:test';
import { isImageOnlyTemplate, parseScenePlan, spokenText, normalizeNarration } from '../dist/services/scene-plan.js';
import { serializeScenePlan, withScenePlanFormat } from '../dist/services/scene-plan-format.js';
import { buildFreePrompt, freeChatSystem } from '../dist/services/script-generation.js';

test('isImageOnlyTemplate and freeChat builders distinguish Image-Only from Mixed scripts', () => {
  const imageOnlyTemplate = `PART 4 — 🕉️ PRODUCTION PROMPT
Rules:
NO video, motion, camera moves, or animation prompts.
Every prompt is a high-detail static shot description.
Thumbnail is wrapped in <image_prompt0>.
Scene images are wrapped in <image_prompt1> to <image_prompt[N]>.
Only TWO tag types are used: <script> for narration and <image_prompt[n]> for prompts.`;

  const mixedTemplate = `PART 4 — MIXED ASSETS
<image_prompt[N]> for static frames.
<video_prompt[N]> for motion shots.
Crucial Rule: The index counter [N] increments chronologically.`;

  assert.equal(isImageOnlyTemplate(imageOnlyTemplate), true);
  assert.equal(isImageOnlyTemplate(mixedTemplate), false);

  const sysImageOnly = freeChatSystem(imageOnlyTemplate);
  assert.ok(!sysImageOnly.includes('<video_prompt[N]>'));
  assert.ok(sysImageOnly.includes('Do NOT generate any <video_prompt> tags'));

  const sysMixed = freeChatSystem(mixedTemplate);
  assert.ok(sysMixed.includes('<video_prompt[N]>'));

  const promptImageOnly = buildFreePrompt(imageOnlyTemplate, 'Ocean', '', 30);
  assert.ok(!promptImageOnly.includes('<video_prompt[N]>'));
  assert.ok(promptImageOnly.includes('Do NOT generate any <video_prompt> tags'));

  const promptMixed = buildFreePrompt(mixedTemplate, 'Ocean', '', 30);
  assert.ok(promptMixed.includes('<video_prompt[N]>'));
});

test('parseScenePlan with isImageOnly: true enforces mediaType: image even when response contains stray video prompts', () => {
  const responseWithStrayVideos = `<script>
Line one. Line two. Line three.
</script>

<image_prompt0>
#image 0
Thumbnail description
</image_prompt0>

<image_prompt1>
#image 1
Scene one image description
</image_prompt1>

<video_prompt>
<video_prompt1>
Related image tag: #image 1
Motion: Slow push in
</video_prompt>

<image_prompt2>
#image 2
Scene two image description
</image_prompt2>

<video_prompt2>
#video 2
Motion: Slow pan
</video_prompt2>`;

  // When isImageOnly is true, scenes must remain image
  const planImageOnly = parseScenePlan(responseWithStrayVideos, false, { isImageOnly: true });
  assert.equal(planImageOnly.scenes.length, 2);
  assert.equal(planImageOnly.scenes[0].mediaType, 'image');
  assert.equal(planImageOnly.scenes[1].mediaType, 'image');
  assert.equal(planImageOnly.scenes[0].videoPrompt, undefined);

  // When isImageOnly is false (mixed mode), video prompts apply
  const planMixed = parseScenePlan(responseWithStrayVideos, false, { isImageOnly: false });
  assert.equal(planMixed.scenes.length, 2);
  assert.equal(planMixed.scenes[0].mediaType, 'video');
  assert.equal(planMixed.scenes[1].mediaType, 'video');
});

test('Extracts numbered tags for image-only scripts (<image_prompt0> to <image_promptN>)', () => {
  const raw = `<script>
जब सृष्टि के आरंभ में देवताओं और असुरों ने मिलकर अमृत के लिए महासागर का मंथन किया, तो उस अनंत समुद्र से जो सबसे पहली भीषण चीज़ निकली, वह थी ब्रह्मांड को भस्म कर देने वाली कालकूट हालाहल विष की ज्वाला।
(break)
उस महाविष की एक ही बूंद इतनी प्रलयकारी थी कि संपूर्ण त्रैलोक्य जलकर राख हो सकते थे।
(break)
महादेव शिव ने उस भयंकर विष को अपनी अंजुली में भर लिया और अपने कंठ में उतार लिया।
</script>

<image_prompt0>
#image 0
ASSET: THUMBNAIL
Prompt:
Close-up extreme portrait of Lord Shiva holding the lethal blue Halahala poison in his glowing cupped hands, intense divine focus, 8K resolution.
Character Consistency:
Lord Shiva: Ascetic deity, third eye, matted hair.
Negative Prompt:
cartoon, anime, 3d render.
Style Tags:
ultra realistic, cinematic photography.
THUMBNAIL TEXT: विष पान और नीलकंठ
</image_prompt0>

<image_prompt1>
#image 1
TIMELINE: 00:00–00:06
SCENE: Samudra Manthan Ocean Churning
Prompt:
Wide cinematic shot of Devatas and Asuras pulling the massive Vasuki serpent wrapped around Mount Mandara.
Character Consistency:
Devatas and Asuras in classic Vedic mythological attire.
Negative Prompt:
cartoon, anime, 3d render.
Style Tags:
ultra realistic, cinematic photography.
</image_prompt1>

<image_prompt2>
#image 2
TIMELINE: 00:06–00:12
SCENE: Emergence of Halahala Poison
Prompt:
Medium shot of a terrifying, glowing dark-green and jet-black toxic cloud rising from the ocean.
Character Consistency:
Panicking divine beings.
Negative Prompt:
cartoon, anime.
Style Tags:
ultra realistic.
</image_prompt2>

<image_prompt3>
#image 3
TIMELINE: 00:12–00:18
SCENE: Shiva Steps Forward
Prompt:
Medium shot of Lord Shiva calmly stepping forward from mount Kailash.
Character Consistency:
Lord Shiva: Ascetic deity.
Negative Prompt:
cartoon, anime.
Style Tags:
ultra realistic.
</image_prompt3>`;

  const plan = parseScenePlan(raw);
  assert.equal(plan.scenes.length, 3);
  assert.equal(plan.scenes[0].id, 'scene_001');
  assert.equal(plan.scenes[1].id, 'scene_002');
  assert.equal(plan.scenes[2].id, 'scene_003');

  // Verify chapter titles
  assert.equal(plan.scenes[0].chapter, 'Samudra Manthan Ocean Churning');
  assert.equal(plan.scenes[1].chapter, 'Emergence of Halahala Poison');
  assert.equal(plan.scenes[2].chapter, 'Shiva Steps Forward');

  // Verify thumbnail is separated and tags are not leaking
  assert.match(plan.thumbnailPrompt, /Lord Shiva holding the lethal blue Halahala poison/);
  assert.ok(!plan.thumbnailPrompt.includes('</image_prompt0>'));
  assert.ok(!plan.thumbnailPrompt.includes('<image_prompt1>'));
  assert.ok(!plan.thumbnailPrompt.includes('THUMBNAIL TEXT:'));

  // Verify scene prompt does not have tag leakage
  assert.ok(!plan.scenes[0].imagePrompt.includes('</image_prompt1>'));
  assert.ok(!plan.scenes[0].imagePrompt.includes('<image_prompt2>'));
  assert.match(plan.scenes[0].imagePrompt, /Wide cinematic shot of Devatas and Asuras/);
  assert.match(plan.scenes[0].imagePrompt, /Negative Prompt:/);
  assert.match(plan.scenes[0].imagePrompt, /Style Tags:/);

  // Verify all scenes are images
  assert.deepEqual(plan.scenes.map(s => s.mediaType), ['image', 'image', 'image']);

  // Verify narration
  assert.equal(normalizeNarration(spokenText(plan)), normalizeNarration(raw.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\(break\)/g, ' ')));
});

test('Extracts mixed chronological video and image tags (<image_prompt1>, <video_prompt2>, <image_prompt3>, <video_prompt4>)', () => {
  const mixedRaw = `<script>
Scene one narration words.
(break)
Scene two video narration words.
(break)
Scene three image narration words.
(break)
Scene four video narration words.
</script>

<image_prompt0>
#image 0
ASSET: THUMBNAIL
Prompt:
Cover thumbnail prompt 9:16 portrait.
</image_prompt0>

<image_prompt1>
#image 1
TIMELINE: 00:00–00:10
ASSET TYPE: STATIC IMAGE
SCENE: Opening Hook
Prompt:
Still shot of warrior drawing bow.
</image_prompt1>

<video_prompt2>
#video 2
TIMELINE: 00:10–00:18
ASSET TYPE: VIDEO CLIP (8 SECONDS)
SCENE: Arrow Release
Shot Behavior:
Continuous shot of the arrow soaring through the stormy clouds.
Temporal Constraints:
No face morphing, smooth flight.
Negative Prompt:
cartoon, modern elements.
</video_prompt2>

<image_prompt3>
#image 3
TIMELINE: 00:18–00:26
ASSET TYPE: STATIC IMAGE
SCENE: Emotional Reaction
Prompt:
Close up of shocked commander watching the arrow.
</image_prompt3>

<video_prompt4>
#video 4
TIMELINE: 00:26–00:34
ASSET TYPE: VIDEO CLIP (8 SECONDS)
SCENE: Explosion
Shot Behavior:
Slow motion explosion of the dark fortress wall.
Temporal Constraints:
No morphing.
</video_prompt4>`;

  const plan = parseScenePlan(mixedRaw);
  assert.equal(plan.scenes.length, 4);
  assert.deepEqual(plan.scenes.map(s => s.id), ['scene_001', 'scene_002', 'scene_003', 'scene_004']);
  assert.deepEqual(plan.scenes.map(s => s.mediaType), ['image', 'video', 'image', 'video']);
  assert.equal(plan.scenes[1].duration, 8);
  assert.equal(plan.scenes[3].duration, 8);

  assert.match(plan.scenes[1].videoPrompt, /Continuous shot of the arrow/);
  assert.match(plan.scenes[1].videoPrompt, /Temporal Constraints:/);
  assert.match(plan.scenes[3].videoPrompt, /Slow motion explosion/);

  // Image fallback is also populated for video scenes
  assert.ok(plan.scenes[1].imagePrompt.length > 0);
  assert.ok(plan.scenes[3].imagePrompt.length > 0);

  // Serializing and re-parsing works
  const serialized = serializeScenePlan(plan);
  assert.match(serialized, /<image_prompt0>/);
  assert.match(serialized, /<image_prompt1>/);
  assert.match(serialized, /<video_prompt2>/);
  assert.match(serialized, /<image_prompt3>/);
  assert.match(serialized, /<video_prompt4>/);

  const reParsed = parseScenePlan(serialized);
  assert.equal(reParsed.scenes.length, 4);
  assert.deepEqual(reParsed.scenes.map(s => s.mediaType), ['image', 'video', 'image', 'video']);
});

test('Cleanly parses the exact user generated response without phantom scenes or tag leaks', () => {
  const userFixture = `<script>
जब सृष्टि के आरंभ में देवताओं और असुरों ने मिलकर अमृत के लिए महासागर का मंथन किया, तो उस अनंत समुद्र से जो सबसे पहली भीषण चीज़ निकली, वह थी ब्रह्मांड को भस्म कर देने वाली कालकूट हालाहल विष की ज्वाला।
(break)
उस महाविष की एक ही बूंद इतनी प्रलयकारी थी कि संपूर्ण त्रैलोक्य — स्वर्ग, पाताल और मृत्युलोक — क्षणभर में जलकर राख हो सकते थे, और देवता तथा दानव दोनों ही भय से कांप उठे।
(break)
जब सब त्रस्त हो गए और किसी को कोई मार्ग नहीं सूझा, तब सृष्टि के रक्षक महादेव शिव ने अपनी अगाध करुणा और त्याग से आगे बढ़कर उस भयंकर विष को अपनी अंजुली में भर लिया।
(break)
किसी को यह ज्ञात नहीं था कि महादेव क्या करने वाले हैं; उन्होंने एक क्षण की भी देरी किए बिना उस संपूर्ण प्रलयकारी हालाहल विष को अपने कंठ में उतार लिया।
(break)
विष इतना तीव्र था कि उनके भीतर समाते ही उनका पूरा शरीर तपने लगा, और ब्रह्मांड की रक्षा के लिए उन्होंने उस विष को अपने गले से नीचे नहीं उतरने दिया।
(break)
माता पार्वती ने अत्यंत व्याकुल होकर तुरंत अपने हाथों से महादेव के कंठ को मजबूती से थाम लिया, ताकि विष उनके पेट तक न पहुँच सके और उनकी ऊर्जा सुरक्षित रहे।
(break)
उस महान कालकूट विष के प्रचंड ताप से महादेव का संपूर्ण कंठ नीला पड़ गया, और उसी क्षण से उन्हें इस सृष्टि में 'नीलकंठ' के पवित्र नाम से जाना गया।
(break)
इस महात्याग से यह सत्य सिद्ध हुआ कि वास्तविक शक्ति दूसरों पर विजय पाने में नहीं, बल्कि संपूर्ण ब्रह्मांड के कल्याण के लिए स्वयं विष पीने में है।
(break)
हर हर महादेव!
</script>

<image_prompt0>
#image 0
ASSET: THUMBNAIL
Prompt:
Close-up extreme portrait of Lord Shiva holding the lethal blue Halahala poison in his glowing cupped hands, intense divine focus, glowing third eye on forehead, dramatic chiaroscuro lighting, dark cosmic background with swirling nebula, hyper-detailed skin texture, sacred ash on forehead, golden ornaments, cinematic composition, photorealistic textures, 8K resolution, emotionally powerful devotional atmosphere.
Character Consistency:
Lord Shiva: Ascetic deity, powerful serene facial features, third eye, long matted hair (jata) piled high, crescent moon ornament, rudraksha beads, deep meditative yet compassionate expression.
Negative Prompt:
cartoon, anime, 3d render, illustration, modern clothing, modern architecture, western facial features, plastic skin, blurry, watermark, text in image, extra limbs, deformed hands, distorted anatomy.
Style Tags:
ultra realistic, cinematic photography, Treta Yuga ancient India, devotional epic atmosphere, volumetric lighting, photorealistic textures, 8K resolution, emotionally powerful composition, sacred grandeur.
THUMBNAIL TEXT: विष पान और नीलकंठ
</image_prompt0>

<image_prompt1>
#image 1
TIMELINE: 00:00–00:06
SCENE: Samudra Manthan Ocean Churning
Prompt:
Wide cinematic shot of Devatas and Asuras pulling the massive Vasuki serpent wrapped around Mount Mandara during Samudra Manthan, churning the milky cosmic ocean, churning foam, glowing waves, primordial golden-orange sky, epic ancient Indian mythological scale, detailed traditional attire, dramatic volumetric sunbeams breaking through cosmic dust clouds.
Character Consistency:
Devatas and Asuras in classic Vedic mythological attire, glowing aura, dynamic muscle tension, focused expressions.
Negative Prompt:
cartoon, anime, 3d render, illustration, modern clothing, modern architecture, western facial features, plastic skin, blurry, watermark, text in image, extra limbs, deformed hands, distorted anatomy.
Style Tags:
ultra realistic, cinematic photography, Treta Yuga ancient India, devotional epic atmosphere, volumetric lighting, photorealistic textures, 8K resolution, emotionally powerful composition, sacred grandeur.
</image_prompt1>

<image_prompt2>
#image 2
TIMELINE: 00:06–00:12
SCENE: Emergence of Halahala Poison
Prompt:
Medium shot of a terrifying, glowing dark-green and jet-black toxic cloud rising from the churning milky ocean waters, blinding sparks and embers flying, terrified Devatas and Asuras recoiling in absolute horror, dramatic low-angle shot, turbulent waves crashing, dark ominous smoke filling the divine horizon, hyper-realistic textures.
Character Consistency:
Panicking divine beings with elaborate crowns and traditional silk dhotis, expressive gestures of terror.
Negative Prompt:
cartoon, anime, 3d render, illustration, modern clothing, modern architecture, western facial features, plastic skin, blurry, watermark, text in image, extra limbs, deformed hands, distorted anatomy.
Style Tags:
ultra realistic, cinematic photography, Treta Yuga ancient India, devotional epic atmosphere, volumetric lighting, photorealistic textures, 8K resolution, emotionally powerful composition, sacred grandeur.
</image_prompt2>

<image_prompt3>
#image 3
TIMELINE: 00:12–00:18
SCENE: Threat to the Three Worlds
Prompt:
Cinematic establishing shot of the three worlds — celestial heavens, earthly realm, and subterranean regions — beginning to crack and scorch under the intolerable searing heat of the Halahala poison, burning foliage, cracked dry earth, panicked sages running in distress, dramatic apocalyptic lighting, deep shadows and fiery orange glow.
Character Consistency:
Vedic sages with long white beards and saffron robes, distressed postures.
Negative Prompt:
cartoon, anime, 3d render, illustration, modern clothing, modern architecture, western facial features, plastic skin, blurry, watermark, text in image, extra limbs, deformed hands, distorted anatomy.
Style Tags:
ultra realistic, cinematic photography, Treta Yuga ancient India, devotional epic atmosphere, volumetric lighting, photorealistic textures, 8K resolution, emotionally powerful composition, sacred grandeur.
</image_prompt3>

<image_prompt4>
#image 4
TIMELINE: 00:18–00:24
SCENE: Shiva Steps Forward
Prompt:
Medium shot of Lord Shiva calmly stepping forward from mount Kailash, towering majestic ascetic stature, tiger skin drape, calm and compassionate eyes gazing upon the suffering cosmos, serene posture amidst chaos, soft divine light illuminating his serene face, intricate matted hair, rudraksha necklaces, absolute divine tranquility.
Character Consistency:
Lord Shiva: Ascetic deity, powerful serene facial features, third eye, long matted hair (jata) piled high, crescent moon ornament, rudraksha beads, deep meditative yet compassionate expression.
Negative Prompt:
cartoon, anime, 3d render, illustration, modern clothing, modern architecture, western facial features, plastic skin, blurry, watermark, text in image, extra limbs, deformed hands, distorted anatomy.
Style Tags:
ultra realistic, cinematic photography, Treta Yuga ancient India, devotional epic atmosphere, volumetric lighting, photorealistic textures, 8K resolution, emotionally powerful composition, sacred grandeur.
</image_prompt4>

<image_prompt5>
#image 5
TIMELINE: 00:24–00:30
SCENE: Cupping the Poison
Prompt:
Close-up shot of Lord Shiva cupping his large powerful hands together, gathering the swirling, volatile, radioactive-green and black Halahala poison directly from the air, intense concentration, glowing divine energy radiating from his palms, cinematic rim lighting, highly detailed skin texture with sacred ash markings.
Character Consistency:
Lord Shiva: Ascetic deity, powerful serene facial features, third eye, long matted hair (jata) piled high, crescent moon ornament, rudraksha beads, deep meditative yet compassionate expression.
Negative Prompt:
cartoon, anime, 3d render, illustration, modern clothing, modern architecture, western facial features, plastic skin, blurry, watermark, text in image, extra limbs, deformed hands, distorted anatomy.
Style Tags:
ultra realistic, cinematic photography, Treta Yuga ancient India, devotional epic atmosphere, volumetric lighting, photorealistic textures, 8K resolution, emotionally powerful composition, sacred grandeur.
</image_prompt5>

<video_prompt>
#image 1
<video_prompt>Cinematic slow-motion shot of Devatas and Asuras pulling the massive serpent around Mount Mandara, churning waves sparkling with golden divine light, epic camera drift.</video_prompt>
</video_prompt>

<video_prompt>
#image 5
<video_prompt>Slow dramatic zoom-in on Lord Shiva's glowing hands as they scoop up the swirling toxic Halahala poison, energy pulsing outward.</video_prompt>
</video_prompt>`;

  const plan = parseScenePlan(userFixture);
  // Exactly 5 scenes (not 7 or 9!)
  assert.equal(plan.scenes.length, 5);

  // Scene 1 and 5 are video scenes with their video prompts linked
  assert.equal(plan.scenes[0].mediaType, 'video');
  assert.match(plan.scenes[0].videoPrompt, /Cinematic slow-motion shot of Devatas/);
  assert.equal(plan.scenes[4].mediaType, 'video');
  assert.match(plan.scenes[4].videoPrompt, /Slow dramatic zoom-in/);

  // Scenes 2, 3, 4 are image scenes
  assert.equal(plan.scenes[1].mediaType, 'image');
  assert.equal(plan.scenes[2].mediaType, 'image');
  assert.equal(plan.scenes[3].mediaType, 'image');

  // Verify zero tag leakage in prompts
  for (const scene of plan.scenes) {
    assert.ok(!scene.imagePrompt.includes('<image_prompt'));
    assert.ok(!scene.imagePrompt.includes('</image_prompt'));
    assert.ok(!scene.imagePrompt.includes('<video_prompt'));
    assert.ok(!scene.imagePrompt.includes('</video_prompt'));
  }
  assert.ok(!plan.thumbnailPrompt.includes('<image_prompt'));
  assert.ok(!plan.thumbnailPrompt.includes('</image_prompt'));
});
