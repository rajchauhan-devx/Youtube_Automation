import fs from 'node:fs';
import path from 'node:path';

// 1. Update Ancient Dharma template
const dharmaMasterPrompt = `STEP 0 — DEEP RESEARCH FIRST (MANDATORY)
Before writing a single word of narration or dialogue, thoroughly RESEARCH the given Topic and Source Material (Valmiki Ramayana, Mahabharata, Puranas).
Establish:
1. The central characters in this episode (e.g. Ram & Lakshman, Sita & Ravana, Ram & Hanuman, Krishna & Arjuna, Ram & Bharat).
2. The core dilemma, high-stakes confrontation, or emotional turning point.
3. The decisive truth, action, or divine realization that resolves the tension.

🎭 RAMAYANA CINEMATIC DIALOGUE & NARRATOR PIPELINE (AI-DRIVEN SHORT SCRIPT)
The Preview AI writes BOTH the narrator lines and character lines dynamically for each topic.
Characters must NOT talk continuously in every scene! True cinematic storytelling weaves atmospheric Narrator beats with high-impact Character dialogue beats.

🎬 THE ALTERNATING NARRATOR & CHARACTER PACING RULE:
- NEVER make characters talk nonstop in every scene. Continuous talking heads feel artificial.
- In a 5–6 scene Short:
  * 2–3 scenes are NARRATOR BEATS: The Narrator ([सूत्रधार]) sets the world atmosphere, escalating tension, armies, waves, or internal character stakes.
    -> VISUAL: Cinematic wide action shot, camera tracking, or dramatic SILENT character reaction shot (eyes narrowing, breath holding, intense gaze, lips and mouth completely closed/motionless, NO lip movement).
  * 2–3 scenes are CHARACTER DIALOGUE BEATS: The Character speaks high-impact, decisive lines ([लक्ष्मण], [राम], [सीता], [हनुमान], [रावण]).
    -> VISUAL: Tight medium close-up on the character with explicit Google Flow (Veo 3.1) lip and jaw articulation commands delivering their exact spoken words.

🏷️ THE THREE-TAG MASTER PROTOCOL:

1. Audio Narration Tag: Exactly ONE <script>...</script> block.
- Spoken Devanagari Hindi only.
- The AI dynamically authors every spoken sentence (both narrator commentary and character lines) to fit the selected 60s runtime.
- Every block MUST start with an exact bracketed attribution tag:
  [सूत्रधार]: For world setup, action beats, silent reaction narration, and closing CTA.
  [राम]: Shri Ram (speaks with serene, transcendent majesty, deep calm wisdom).
  [लक्ष्मण]: Lakshman (speaks with youthful warrior passion, intense devotion, fierce energy).
  [सीता]: Devi Sita (dignified, divine poise, sorrowful yet unyielding moral strength).
  [हनुमान]: Hanuman (profound devotional humility combined with colossal warrior resonance).
  [रावण]: Ravana (imposing, arrogant, booming baritone authority).
  (Or other characters: [भरत], [विभीषण], [मेघनाद], [कृष्ण], [अर्जुन], etc.)
- Example Structure:
  <script>
  [सूत्रधार]: समुद्र तट पर तीन दिन की मौन तपस्या के बाद भी जब सागर ने मार्ग नहीं दिया, तब लक्ष्मण का धैर्य टूट गया।
  [लक्ष्मण]: भ्राता राम! यह समुद्र हमारी विनय नहीं समझता! आदेश दीजिए, मैं अपने बाणों से इस सागर को सुखाकर भस्म कर दूँगा!
  [सूत्रधार]: प्रचंड धनुष की प्रत्यंचा चढ़ते ही तीनों लोक कांप उठे, किंतु श्री राम के चेहरे पर वही अगाध शांति थी।
  [राम]: शांत हो जाओ, सौमित्र! धैर्य और मर्यादा ही क्षत्रिय का वास्तविक आभूषण हैं। विनय का अर्थ दुर्बलता नहीं होता।
  [सूत्रधार]: कथा अच्छी लगी तो वीडियो लाइक करें, Ancient Dharma को Subscribe करें और कमेंट में लिखें—'जय श्री राम'!
  </script>

2. Sequential Visual Tags (Numbered Timeline):
- Scene 1 Hook: ALWAYS <video_prompt1>...</video_prompt1> — Mandatory 9:16 continuous cinematic video prompt for Google Flow (Veo 3.1) showing the opening tension or action hook.
- When Narrator Speaks:
  Write <video_prompt[N]> or <image_prompt[N]> depicting the dramatic environment, crashing waves, army formations, or character silent reaction with:
  "Lips and mouth completely closed and motionless, intense cinematic eye acting, jaw locked in quiet tension, atmospheric wind and mist, Treta Yuga realism, 8K."
- When Character Speaks (MANDATORY GOOGLE FLOW LIPS DIRECTION):
  Write dedicated <video_prompt[N]> with explicit camera framing and speaking lip-movement commands:
  "9:16 vertical shot, medium close-up of [Character], lips and jaw moving naturally and expressively as he speaks with urgency/resolve, delivering the dialogue: '[Hindi Dialogue Line]', realistic mouth articulation, natural blinks, subtle head gestures, emotional facial acting. Treta Yuga Vedic atmosphere, volumetric lighting, photorealistic textures, 8K resolution."
- Thumbnail: <image_prompt0> strictly reserved for the external 16:9 promotional cover.
- Motion Graphics: <motion_graphic[N]> or <metadata[N]> for sacred shlokas, astra seals, or era markers.

3. Character Consistency (Always repeat exact physical traits):
- 🔵 RAMA: Age 25-30, deep blue-dark skin (shyama varna non-negotiable), serene eyes, ascetic hair knot (jata), ochre bark-cloth dhoti, divine bow Sharanga. Divine majesty, never angry.
- 🏹 LAKSHMANA: Age 22-27, fair wheatish complexion, sharp warrior features, intense alert eyes, ochre/green attire, longbow. Fierce vigilance and loyalty.
- 🌟 SITA: Golden-fair radiant skin (suvarna varna), large expressive eyes, dignified grace, forest ochre saree.
- 🐒 HANUMAN: Powerful Vanara warrior, golden-orange fur, upright muscular physique, sacred thread (janeu), humble eyes.
- 👑 RAVANA: Ten heads (in wide) or dominant central head (in close-up), dark bronze skin with crimson glow, heavy royal armor, arrogant sovereign authority.

OUTPUT STRUCTURE REQUIRED:
SECTION 1 — SCENE BREAKDOWN (Character/Narrator, Spoken Line, Duration, Visual Framing)
SECTION 2 — ELEVENLABS TIMESTAMPS
SECTION 2B — VOICED SCRIPT WITH NARRATOR & CHARACTER TAGS (PASTE-READY IN <script>...</script>)
SECTION 3 — VISUAL ASSET PASS (<image_prompt0> thumbnail, <video_prompt[N]> with lip motion when character speaks, or silent action when narrator speaks)
SECTION 4 — HINDI TEXT OVERLAYS
SECTION 5 — THE REFLECTION ENGINE QUESTION`;

const dharmaScriptPath = path.resolve('server/data/scripts.json');
const dharmaScripts = JSON.parse(fs.readFileSync(dharmaScriptPath, 'utf8'));

const dIdx = dharmaScripts.findIndex(s => s.id === 'usr_dharma_conversational_dialogue');
if (dIdx >= 0) {
  dharmaScripts[dIdx].prompts[0].content = dharmaMasterPrompt;
  dharmaScripts[dIdx].howItWorks = 'AI dynamically writes both narrator action beats and character spoken dialogue. Google Flow animates speaking character lips when talking, and silent cinematic reaction shots when narrator speaks.';
  fs.writeFileSync(dharmaScriptPath, JSON.stringify(dharmaScripts, null, 2), 'utf8');
  console.log('✅ Updated Ancient Dharma template with alternating narrator-character rule!');
}

// 2. Update Talvora template
const talvoraMasterPrompt = `TALVORA — CONVERSATIONAL MICRO-DRAMA & NARRATOR PIPELINE

NARRATIVE CORE:
Atmospheric nighttime romantic micro-drama featuring intense, rapid exchanges between adult characters (Elena and Julian / The Stranger), bridged by a moody, intimate Narrator.

🎬 THE ALTERNATING NARRATOR & CHARACTER PACING RULE:
- NEVER make characters talk nonstop in every scene.
- The AI dynamically authors BOTH narrator and character lines:
  * NARRATOR BEATS ([Narrator]): Describes the nocturnal atmosphere, unspoken tension, rain on glass, or internal thoughts while characters are SILENT (visual: character looks out window or holds gaze, lips closed and motionless, no talking heads).
  * CHARACTER DIALOGUE BEATS ([Elena], [Julian]): Decisive confrontations, secrets whispered, or emotional ultimatums (visual: close-up, lips moving expressively to articulate words with Google Flow).

OUTPUT STRUCTURE:
- Exactly ONE <script>...</script> with tags: [Narrator], [Elena], [Julian]
- <video_prompt1> opening hook
- Alternating <video_prompt[N]>: lip movement when character speaks, atmospheric action when narrator speaks
- <image_prompt0> external thumbnail`;

const talvoraScriptPath = path.resolve('server/data/accounts/acct_talvora/profiles/shorts/scripts.json');
const talvoraScripts = JSON.parse(fs.readFileSync(talvoraScriptPath, 'utf8'));

const tIdx = talvoraScripts.findIndex(s => s.id === 'usr_talvora_conversational_dialogue');
if (tIdx >= 0) {
  talvoraScripts[tIdx].prompts[0].content = talvoraMasterPrompt;
  talvoraScripts[tIdx].howItWorks = 'AI dynamically writes both narrator suspense beats and character dialogue. Google Flow animates lips during dialogue and silent moody cinematic shots during narration.';
  fs.writeFileSync(talvoraScriptPath, JSON.stringify(talvoraScripts, null, 2), 'utf8');
  console.log('✅ Updated Talvora template with alternating narrator-character rule!');
}
