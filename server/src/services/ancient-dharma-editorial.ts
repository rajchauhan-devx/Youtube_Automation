export const ANCIENT_DHARMA_EDITORIAL_START = '[ANCIENT DHARMA EDITORIAL RULES]';
export const ANCIENT_DHARMA_EDITORIAL_END = '[/ANCIENT DHARMA EDITORIAL RULES]';

/** Writing instructions only: never change the template's production/output contract. */
export function ancientDharmaEditorial(profile: 'shorts' | 'long'): string {
  return `${ANCIENT_DHARMA_EDITORIAL_START}
Apply these writing rules to Ancient Dharma episodes. For an explicitly unrelated topic, follow that topic's own tradition and audience instead of adding Hindu devotional language. These rules update the research, narration and closing instructions below; preserve every existing output section, extraction tag, asset number, media mode, character bible and narration-to-scene mapping. Perform the editorial work silently; do not add a new output section.

RESEARCH BEFORE COMMITTING TO A HOOK: Identify the actual source/version, what it supports, what belongs to a regional retelling, and what is interpretation. Establish one central dilemma, the strongest supported detail, the decisive choice and the real outcome. Treat any preselected retention hook as provisional: revise its wording and promise when the research does not support it. Never invent dialogue, motives, quotations, miracles as scientific proof, or scriptural attribution to make a hook work. Keep source notes in the existing production notes, with a brief natural attribution in speech where necessary.

FORMAT & LAYOUT (INSTAGRAM REEL & YOUTUBE SHORTS):
- Vertical 9:16 layout containing a centered 16:9 letterboxed video canvas with a top banner reading "Goosebumps 🚩".
- ART STYLE: Modern Indian digital graphic novel / comic book aesthetic with high contrast, sharp line art, detailed muscular anatomy, and realistic lighting. Warm color palette dominated by fire orange, sunrise yellow, deep war browns, and dramatic atmospheric shadows.
- IMAGE-ONLY GRAPHIC NOVEL REEL MANDATE: Every scene must generate a high-detail keyframe artwork (<image_prompt[N]>), never plain generic video. The artwork is brought to life using 2.5D camera zoom/pan parallax, floating fire ember particles, and snappy bold kinetic Devanagari text popping in sync with spoken dialogue.

IMAGE GENERATION PROMPT FORMULA (<image_prompt[N]>):
> Digital graphic novel illustration of [Lord Hanuman / Sri Rama / Deity] standing heroically in an epic ancient Indian war battlefield, extremely muscular, glowing fiery aura around him, detailed muscular structure, wearing traditional attire and gold ornaments, dark cloudy sky with golden sunrise breaking through, dramatic atmospheric lighting, high contrast, cinematic 8k art style.

AUDIO & SPOKEN CONTENT BREAKDOWN (GOOGLE FLOW MUSIC + NARRATIVE VOICE):
1. DIALOGUE PHASE (DRAMATIC NARRATIVE CONFRONTATION / SACRED VOW):
   For conversational multi-character episodes: dramatize the episode faithfully through living character dialogue true to the sacred lore of the Valmiki Ramayana, Ramcharitmanas, or Mahabharata: strictly NEVER include modern science, satellite imagery, or archaeology:
   - Sri Rama: "हनुमान, अगर सूर्य निकल गया तो लक्ष्मण मर जाएगा।"
   - Hanuman: "प्रभु, सूर्यदेव मेरा स्वभाव जानते हैं... मैं जब तक जड़ी-बूटी लेकर नहीं आऊँगा, सूरज को उगने नहीं दूंगा।"
   - Sri Rama: "हनुमान, मौत आगे बढ़ रही है..."
   - Hanuman: "प्रभु, आप कहते हैं मौत लक्ष्मण को खा जाएगी? मैं आपकी कसम खा के कहता हूँ... आज मौत को ही मार दूंगा! दुनिया में कभी कोई मरेगा नहीं!"
2. EPIC VOCAL CHORUS / SANSKRIT CHANTING PHASE:
   High-octane rhythmic chants highlighting divine titles and attributes:
   - "राम रामं जपती..."
   - "हनुमान अतुलितबलधामम्..."
   - "हनुमान महाकाल शंभोरावतारः..."
   - "बजरंगबली... जय श्री राम!"
3. GOOGLE FLOW MUSIC TRAILER SOUNDTRACK:
   - Prompt: "Epic cinematic trailer sound track, heavy indian percussion, dhol drums, orchestral brass swells, deep sub-bass drops, emotional sad strings transitioning into aggressive action hybrid music, Sanskrit chants, high energy war theme"
   - Voice Profile: Deep resonant male voice with heavy chest resonance, strong bass, and aggressive cadence suited for epic trailers.
   - SFX: Sub-bass impacts/booms timed with dramatic text appearances (कसम, मौत, मार दूंगा), wind/thunder swells on emotional shifts, cinematic riser sweeps leading up to the final explosion of vocal chants.

SACRED CHARACTER DICTION & DIGNIFIED VOCABULARY:
When ancient gods, avataras, and epic figures speak (such as Mata Sita, Sri Rama, Lakshmana, Ravana, Hanuman, Arjuna, Krishna), they must speak with profound scriptural dignity, elevated noble Hindi, and sacred gravitas true to the Valmiki Ramayana, Ramcharitmanas, and Mahabharata.
- BANNED STREET SLANG: Strictly NEVER use cheap modern street-slang, rude informal pronouns, or low-level colloquialisms (such as 'तू', 'तेरा', 'तुझे', 'तूने', 'काय रे', 'अरे').
- Characters use high moral authority, dignified titles, and noble vocabulary.

VIDEO EDITING & MOTION INSTRUCTIONS:
- Combine static graphic artwork with subtle 2.5D camera zoom-ins and horizontal pans.
- Dynamic particle overlay (ember and dust).
- Snappy bold kinetic Devanagari text styled in metallic gold/yellow with subtle drop shadows/glow, popping in sync with spoken voiceover delivery.
- Top banner: "Goosebumps 🚩".

${profile === 'shorts'
    ? 'SHORTS: Tell one complete dilemma, vow and resolution. Scene 1 must ALWAYS be a powerful visual hook (<image_prompt1>) with immediate emotional stakes to hook viewers instantly. Establish the crisis in the opening second and explode into Hanuman’s vow and Sanskrit chanting.'
    : 'LONG VIDEOS: Establish the dilemma and viewer promise in the opening few sentences. Develop the chapters through connected character dialogues and spiritual discoveries. Resolve the central crisis with the decisive action and outcome.'}

ONE VARIED ENGAGEMENT CLOSE:
After the complete story payoff, include ONE compact Hindi closing invitation asking viewers to like the video, subscribe to Ancient Dharma, and leave ONE specific comment (e.g. 'कमेंट में जय बजरंगबली लिखिए। कथा अच्छी लगी तो लाइक करें और Ancient Dharma को सब्सक्राइब करें।').

SYNC AND SILENT CHECK:
Put the closing words exactly once in the clean voice script and their matching final CTA narration segment(s). Check that the opening is specific, the artwork prompt follows the graphic novel war formula, the Google Flow Music trailer soundtrack is specified, and the close includes like + subscribe + one episode-relevant comment invitation.
${ANCIENT_DHARMA_EDITORIAL_END}`;
}

export function extractAncientDharmaEditorial(template: string): string {
  const start = template.indexOf(ANCIENT_DHARMA_EDITORIAL_START);
  const end = template.indexOf(ANCIENT_DHARMA_EDITORIAL_END, start);
  return start >= 0 && end >= 0 ? template.slice(start, end + ANCIENT_DHARMA_EDITORIAL_END.length) : '';
}

/** Preserve the closing and source rules when a model pass limits template context. */
export function ancientDharmaTemplateContext(template: string, limit: number): string {
  const editorial = extractAncientDharmaEditorial(template);
  if (!editorial) return template.slice(0, limit);
  const context = template.replace(editorial, '').trim();
  return `${editorial}\n\n${context.slice(0, Math.max(0, limit - editorial.length - 2))}`;
}
