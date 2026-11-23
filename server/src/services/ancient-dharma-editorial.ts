export const ANCIENT_DHARMA_EDITORIAL_START = '[ANCIENT DHARMA EDITORIAL RULES]';
export const ANCIENT_DHARMA_EDITORIAL_END = '[/ANCIENT DHARMA EDITORIAL RULES]';

/** Writing instructions only: never change the template's production/output contract. */
export function ancientDharmaEditorial(profile: 'shorts' | 'long'): string {
  return `${ANCIENT_DHARMA_EDITORIAL_START}
Apply these writing rules to Ancient Dharma episodes. For an explicitly unrelated topic, follow that topic's own tradition and audience instead of adding Hindu devotional language. These rules update the research, narration and closing instructions below; preserve every existing output section, extraction tag, asset number, media mode, character bible and narration-to-scene mapping. Perform the editorial work silently; do not add a new output section.

RESEARCH BEFORE COMMITTING TO A HOOK: Identify the actual source/version, what it supports, what belongs to a regional retelling, and what is interpretation. Establish one central dilemma, the strongest supported detail, the decisive choice and the real outcome. Treat any preselected retention hook as provisional: revise its wording and promise when the research does not support it. Never invent dialogue, motives, quotations, miracles as scientific proof, or scriptural attribution to make a hook work. Keep source notes in the existing production notes, with a brief natural attribution in speech where necessary.

SACRED LORE, DICTION & MODE FIDELITY:
- Keep episodes strictly grounded in authentic sacred lore of the Valmiki Ramayana, Ramcharitmanas, Vyasa Mahabharata, Puranas, Upanishads, Vedas, or authentic Ancient India Dharma and civilizational traditions; strictly NEVER include modern science, satellite imagery, or archaeology.
- Rotate topics dynamically across: 1) Ramayana sacred lore, 2) Mahabharata epic moral dilemmas and Gita wisdom, and 3) Ancient India Dharma, Upanishadic philosophy, and revered Vedic Rishis/seekers.
- Follow the active template's own narration/dialogue format and image/video media mode without altering asset types or adding unrelated top banners, music prompts, or lip-sync mandates.
- For conversational multi-character episodes: dramatize the episode faithfully through living character dialogue true to the sacred lore of the Ramayana, Mahabharata, or Ancient India Dharma: strictly NEVER include modern science, satellite imagery, or archaeology.
- CONVERSATIONAL DRAMATIC HINDI (BAN TEXTBOOK SANSKRITIZED STYLE): Output natural, emotional, spoken storytelling Hindi, NOT academic, textbook, or over-Sanskritized prose.
  - HARD BAN on heavy archaic Sanskritized terms: 'वक्ष विदीर्ण', 'प्रच्छन्न प्रहार', 'स्नुषा गमन', 'मृगया विधि', 'कदापि', 'तदुपरांत', 'तदन्तर', 'अतएव', 'यत्किञ्चित' unless immediately explained in plain spoken words.
  - Keep sentences short and punchy (8–14 words max per sentence) for natural, rhythmic TTS pacing and dramatic delivery.
- When ancient gods, avataras, seekers, and epic figures speak (such as Sri Rama, Mata Sita, Lakshmana, Ravana, Hanuman, Sri Krishna, Arjuna, Karna, Bhishma, Draupadi, Nachiketa, Yama, Adi Shankara, Chanakya, ancient Rishis), they must speak with profound scriptural dignity, elevated noble Hindi, and sacred gravitas true to their sacred tradition.
- BANNED STREET SLANG: Strictly NEVER use cheap modern street-slang, rude informal pronouns, or low-level colloquialisms (such as 'तू', 'तेरा', 'तुझे', 'तूने', 'काय रे', 'अरे').

TITLE & PACKAGING ALIGNMENT:
- Titles MUST match the spoken audio language. Never generate pure English titles for Hindi audio scripts.
- For Hindi audio, generate Devanagari Hindi or natural Hinglish curiosity-gap titles (max 55–60 characters for Shorts including #Shorts, max 70 characters for Long-form).
  - Bad: 'Why Karna Rejected Sri Krishna\'s Offer to Rule Hastinapur #Shorts'
  - Good: 'श्रीकृष्ण का ऑफर कर्ण ने क्यों ठुकराया? | Mahabharat #Shorts'

${profile === 'shorts'
    ? `SHORTS RETENTION STRUCTURE (35–50 SECONDS | 95–130 HINDI WORDS MAX):
- 0–3s (Hook): Open immediately with high conflict, a moral contradiction, or a sharp curiosity question. Never start with slow chronological backstory or greetings.
- 3–42s (Body): Fast narrative progression with a visual change every 2–3.5 seconds. Start Scene 1 with a specific visual hook matching the active template's own media tag (<image_prompt1> or <video_prompt1>).
- Last 2s (Ending): End abruptly on a punchy moral twist or 1-line debate question.
- HARD BAN ON GENERIC OUTROS: Strictly NEVER add generic 8–10s 'वीडियो को लाइक करें, कमेंट करें और चैनल को सब्सक्राइब करें' outros on Shorts. End sharply on the payoff or question to trigger re-loops.`
    : `LONG VIDEOS RETENTION STRUCTURE (3–10 MINUTES):
- 0–15s (Cold Open Hook): Establish the dilemma, stakes, and central mystery before starting the timeline.
- Pattern interrupts (tone shift, question, dramatic reversal) every 30–45 seconds to sustain retention.
- Visual progression: In long videos, ensure visual scenes cut every 3–5 seconds (max 3–5s on static shots) using dynamic angle shifts, close-ups, or map/archaeological cuts; avoid lingering on a single still image.
- Resolve the central crisis with decisive action and outcome, ending with one earned spiritual reflection and a single concise CTA.`}
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
