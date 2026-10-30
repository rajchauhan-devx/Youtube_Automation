import fs from 'node:fs';
import path from 'node:path';
import {
  decideDynamicMotionGraphics,
  compileDynamicMotionGraphic,
} from '../src/services/dynamic-motion-engine.js';
import { parseAIResponse } from '../../src/lib/parseAIResponse.js';

const scriptsPath = path.resolve(import.meta.dirname, '../data/scripts.json');
const rawScripts = JSON.parse(fs.readFileSync(scriptsPath, 'utf8'));

// Find Ancient Dharma script
const scriptIdx = rawScripts.findIndex(
  (s) => s.id === 'usr_1787934167716' || s.name === 'Ancient Dharma Short'
);
if (scriptIdx === -1) {
  throw new Error('Script usr_1787934167716 not found');
}

const script = rawScripts[scriptIdx];
console.log(`Found Ancient Dharma script: ${script.id} (${script.name})`);

// 1. Update the master prompt: remove canned ad_* templates and replace with Real-Time Dynamic Motion Graphics protocol
const dynamicProtocolText = `3. Real-Time Dynamic Motion Graphics Tags:
Sequential <motion_graphic1>, <motion_graphic2>, ... <motion_graphic[N]> (or <metadata[N]>) tags specifying real-time dynamic motion graphics.
The script AI decides in real time WHEN, WHERE, and WHICH TYPE of motion graphics is required based on the sacred story beats.
Crucial Rule: You are NOT limited to any template catalog or canned IDs! You can invent and specify ANY type of motion graphic that elevates the story (e.g. sacred_shloka_revelation, divine_astra_focus, celestial_timeline_dial, dharma_wisdom_punch, cosmic_metric_counter, sacred_vow_seal, etc.).

For each motion graphic, specify:
- #scene: The scene number where the graphic triggers
- Type: Any creative descriptive type chosen by the AI
- When: Exact contiguous cue phrase from the spoken narration that triggers the graphic
- Where: Screen placement (center, top, bottom, left, right, custom coordinates) respecting negative space
- Title: The primary headline or Sanskrit/Devanagari phrase
- Detail: Translation, spiritual meaning, or context
- Visual: Aesthetic styling and kinetic concept (e.g. 24k gold leaf calligraphy, luminous aura bloom, sacred vector linework, particle dissipation)

Example Format:
<motion_graphic1>
#scene 2
Type: sacred_vow_seal
When: [Exact contiguous spoken cue phrase from scene narration]
Where: top
Title: [Sacred Title / Mantra, e.g. उत्तिष्ठ राम]
Detail: [Spiritual context / meaning, e.g. तात जनक का संताप मिटाओ]
Visual: Sacred royal golden seal with radiant halo rays and glowing Devanagari lettering
</motion_graphic1>`;

const oldPrompt = script.prompts[0].content;
const startIdx = oldPrompt.indexOf('3. Dynamic Motion Graphics & Metadata Tags:');
const endIdx = oldPrompt.indexOf('All AI video, motion prompts, and animation directions are completely removed.');

if (startIdx !== -1 && endIdx !== -1) {
  script.prompts[0].content =
    oldPrompt.slice(0, startIdx) +
    dynamicProtocolText +
    '\n\n' +
    oldPrompt.slice(endIdx);
  console.log('✔ Successfully modernized prompt to Real-Time Dynamic Motion Graphics Protocol');
} else {
  console.log('ℹ Prompt already modified or boundary markers changed');
}

// 2. Set up realistic Ancient Dharma Rama & Pinaka Shiva Dhanush production script
const topicName = 'श्रीराम और शिव धनुष — सीता स्वयंवर की दिव्य गाथा';
script.topicName = topicName;

const aiResponseText = `🕉️ RAMAYANA — ADI KAVYA
EPISODE: श्रीराम और शिव धनुष (सीता स्वयंवर)
ERAS: त्रेता युग (Treta Yuga)

SECTION 2B — HINDI SPOKEN AUDIO NARRATION (Clean TTS Script)
<script>
जनक की सभा में गहरा सन्नाटा था। बड़े-बड़े वीर और प्रतापी राजा भगवान शिव के दिव्य धनुष पिनाक को हिला भी न सके थे। तभी महर्षि विश्वामित्र ने मंद मुस्कान के साथ आज्ञा दी: "उठो राम, भंजन करहु भव चाप, मेटहु तात जनक परितापा।" प्रभु श्रीराम शांत भाव से उठे। उनके चरणों की गति में कोई उतावलापन नहीं था, केवल अगाध तेज था। जब प्रभु ने बाएं हाथ से पिनाक को सहज ही उठा लिया, तो पूरी सभा स्तंभित रह गई। जैसे ही प्रत्यंचा चढ़ाई, एक प्रचंड टंकार के साथ धनुष टूट गया और तीनों लोकों में गूंज उठी। यह केवल सीता स्वयंवर का क्षण नहीं था, यह अधर्म पर धर्म की सनातन विजय का उद्घोष था।
</script>

<motion_graphic1>
#scene 2
Type: sacred_vow_seal
When: उठो राम, भंजन करहु भव चाप
Where: top
Title: उत्तिष्ठ राम
Detail: तात जनक का संताप मिटाओ — Rise, O Rama, and fulfill the divine purpose
Visual: Sacred golden seal with glowing halo rays and radiant Devanagari calligraphy
</motion_graphic1>

<motion_graphic2>
#scene 4
Type: divine_astra_focus
When: प्रभु ने बाएं हाथ से पिनाक को सहज ही उठा लिया
Where: center
Title: शिवधनुः पिनाक
Detail: त्रिलोक का अजेय दिव्य अस्त्र — The Inviolable Celestial Bow of Lord Shiva
Visual: Luminous 24k gold vector arcs and trishula emblem focusing on the divine bow with particle dissipation
</motion_graphic2>

<motion_graphic3>
#scene 6
Type: sacred_shloka_revelation
When: अधर्म पर धर्म की सनातन विजय का उद्घोष
Where: center
Title: यतो धर्मस्ततो जयः
Detail: जहाँ धर्म है, वहीं विजय है — Where there is Dharma, there is Victory
Visual: Deep 24k gold leaf calligraphy blooming with sacred lotus aura and golden dust dissipation
</motion_graphic3>

<image_prompt0>
#image 0
PROMOTIONAL THUMBNAIL (16:9)
Prompt:
Cinematic epic wide shot of young Lord Rama in King Janaka's ornate Vedic golden court in Mithila during Sita Swayamvar. Rama, with divine dark-blue complexion and calm majesty, holds the massive ancient Shiva Dhanush Pinaka with effortless grace. Radiant golden volumetric light beams cut through the palace columns. Sita looks on with devotion and joy. Photorealistic, 8K, Treta Yuga architectural grandeur, cinematic depth of field.
Character Consistency:
Rama: Youthful 18-20, dark blue-cyan divine complexion, calm powerful lotus eyes, ascetic ochre-silk attire, golden armlets.
Negative Prompt:
Modern elements, cartoon, 3d render, distorted anatomy, western weapons.
</image_prompt0>

<image_prompt1>
#image 1
TIMELINE: [00:00–00:06]
SCENE: मिथिला राजदरबार में सन्नाटा
Prompt:
Cinematic medium shot of the grand assembly hall of Mithila palace. The colossal, heavy ancient bow of Lord Shiva (Pinaka), crafted of dark ironwood and celestial bronze with glowing Vedic runes, rests in an eight-wheeled golden carriage in the center of the hall. Defeated kings and warriors hang their heads in despair. Somber golden twilight lighting, photorealistic textures, 8K.
</image_prompt1>

<image_prompt2>
#image 2
TIMELINE: [00:06–00:14]
SCENE: महर्षि विश्वामित्र की पावन आज्ञा
Prompt:
Cinematic close-up of venerable sage Vishvamitra with long silver beard and flowing ascetic robes, gazing with serene confidence and a subtle knowing smile toward Lord Rama. Warm candlelight illuminates his noble ascetic features. Next to him, young Lakshmana watches attentively. Dramatic rim lighting, photorealistic cinematic portrait.
</image_prompt2>

<image_prompt3>
#image 3
TIMELINE: [00:14–00:22]
SCENE: श्रीराम का शांत तेज और गमन
Prompt:
Cinematic slow-motion style tracking shot of Lord Rama walking forward with effortless divine poise across the polished marble floor. His dark-blue skin radiates a subtle golden aura. His expression is utterly calm, humble, yet radiating infinite strength. The entire assembly of courtiers and sages gazes at him in breathless awe. Volumetric palace lighting, 8K resolution.
</image_prompt3>

<image_prompt4>
#image 4
TIMELINE: [00:22–00:30]
SCENE: पिनाक का सहज उत्थान
Prompt:
Cinematic low-angle close-up as Lord Rama's slender yet immensely powerful hand grasps the central grip of the colossal Pinaka bow. Ethereal golden embers and sacred light rays begin to emanate from the ancient celestial bow as it lifts into the air with astonishing weightlessness. Photorealistic metal textures, divine luminescence, cinematic lighting.
</image_prompt4>

<image_prompt5>
#image 5
TIMELINE: [00:30–00:38]
SCENE: प्रचंड टंकार और धनुष भंग
Prompt:
Dynamic cinematic climax shot at the exact instant the divine bow Pinaka bends into a crescent and snaps with a blinding shockwave of celestial golden light. Shockwaves ripple through the air, shaking the dust from the high carved stone ceiling. Rama stands steady and immovable at the center of the light. Epic scale, cinematic motion blur, photorealistic depth.
</image_prompt5>

<image_prompt6>
#image 6
TIMELINE: [00:38–00:46]
SCENE: सीता जी का वरमाला समर्पण
Prompt:
Cinematic medium close-up of Princess Sita, radiant with divine grace and profound joy, stepping forward holding a fragrant white-and-gold lotus garland (varamala). She looks up at Lord Rama with gentle tears of reverence and love in her eyes. Petals shower from the balcony above. Warm golden volumetric glow, sublime emotional beauty.
</image_prompt6>

<image_prompt7>
#image 7
TIMELINE: [00:46–00:54]
SCENE: धर्म की सनातन विजय
Prompt:
Cinematic grand wide portrait of Lord Rama standing beside Princess Sita in the sanctum of Mithila. Sages and flower showers surround them as divine celestial rays illuminate the scene. Lord Rama smiles with serene grace, embodying eternal righteousness (Maryada Purushottama). 8K resolution, photorealistic devotional masterpiece.
</image_prompt7>`;

script.aiResponse = aiResponseText;

// 3. Parse the AI response into script properties
const parsed = parseAIResponse(aiResponseText);
script.narration = parsed.ttsText;
script.extractedScript = parsed.script;
script.imagePrompts = parsed.imagePrompts;

console.log(`Parsed AI response:`);
console.log(`- TTS Narration: ${script.narration.length} chars`);
console.log(`- Image Prompts: ${script.imagePrompts.length} prompts`);
console.log(`- Metadata tags found: ${parsed.metadata?.length || 0}`);

// 4. Run the Dynamic Motion Engine to decide and compile the motion graphics
const sceneInputs = [
  { sceneIndex: 1, narration: "जनक की सभा में गहरा सन्नाटा था। बड़े-बड़े वीर और प्रतापी राजा भगवान शिव के दिव्य धनुष पिनाक को हिला भी न सके थे।", visualPrompt: script.imagePrompts[0] || "", durationSec: 6 },
  { sceneIndex: 2, narration: "तभी महर्षि विश्वामित्र ने मंद मुस्कान के साथ आज्ञा दी: 'उठो राम, भंजन करहु भव चाप, मेटहु तात जनक परितापा।'", visualPrompt: script.imagePrompts[1] || "", durationSec: 8 },
  { sceneIndex: 3, narration: "प्रभु श्रीराम शांत भाव से उठे। उनके चरणों की गति में कोई उतावलापन नहीं था, केवल अगाध तेज था।", visualPrompt: script.imagePrompts[2] || "", durationSec: 8 },
  { sceneIndex: 4, narration: "जब प्रभु ने बाएं हाथ से पिनाक को सहज ही उठा लिया, तो पूरी सभा स्तंभित रह गई।", visualPrompt: script.imagePrompts[3] || "", durationSec: 8 },
  { sceneIndex: 5, narration: "जैसे ही प्रत्यंचा चढ़ाई, एक प्रचंड टंकार के साथ धनुष टूट गया और तीनों लोकों में गूंज उठी।", visualPrompt: script.imagePrompts[4] || "", durationSec: 8 },
  { sceneIndex: 6, narration: "सीता जी ने आनंदित होकर वरमाला प्रभु के गले में डाल दी।", visualPrompt: script.imagePrompts[5] || "", durationSec: 8 },
  { sceneIndex: 7, narration: "यह केवल सीता स्वयंवर का क्षण नहीं था, यह अधर्म पर धर्म की सनातन विजय का उद्घोष था।", visualPrompt: script.imagePrompts[6] || "", durationSec: 8 },
];

console.log('\nRunning decideDynamicMotionGraphics on the Ancient Dharma scenes...');
const dynamicGraphics = await decideDynamicMotionGraphics({
  channelName: 'Ancient Dharma',
  scenes: sceneInputs,
  scriptText: aiResponseText,
  customInstructions: 'Sacred Treta Yuga Vedic gold leaf typography with divine aura bloom for Rama and Pinaka bow'
});

console.log(`✔ Generated ${dynamicGraphics.length} Dynamic Motion Graphics:`);
dynamicGraphics.forEach((g, i) => {
  console.log(`  [${i + 1}] Type: "${g.type}" | Scene: ${g.sceneIndex} | Title: "${g.title}" | Position: ${g.placement.position}`);
  console.log(`      When: "${g.cuePhrase}" (${g.startSec}s -> ${g.startSec + g.durationSec}s)`);
  console.log(`      HTML bytes: ${g.render.html.length} | CSS bytes: ${g.render.css.length} | JS bytes: ${g.render.js.length}`);
});

script.dynamicMotionGraphics = dynamicGraphics;

// Save updated scripts back to file
fs.writeFileSync(scriptsPath, JSON.stringify(rawScripts, null, 2), 'utf8');
console.log(`\n✔ Saved updated Ancient Dharma Short to ${scriptsPath}`);
