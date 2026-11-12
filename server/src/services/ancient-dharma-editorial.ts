export const ANCIENT_DHARMA_EDITORIAL_START = '[ANCIENT DHARMA EDITORIAL RULES]';
export const ANCIENT_DHARMA_EDITORIAL_END = '[/ANCIENT DHARMA EDITORIAL RULES]';

/** Writing instructions only: never change the template's production/output contract. */
export function ancientDharmaEditorial(profile: 'shorts' | 'long'): string {
  return `${ANCIENT_DHARMA_EDITORIAL_START}
Apply these writing rules to Ancient Dharma episodes. For an explicitly unrelated topic, follow that topic's own tradition and audience instead of adding Hindu devotional language. These rules update the research, narration and closing instructions below; preserve every existing output section, extraction tag, asset number, media mode, character bible and narration-to-scene mapping. Perform the editorial work silently; do not add a new output section.

RESEARCH BEFORE COMMITTING TO A HOOK: Identify the actual source/version, what it supports, what belongs to a regional retelling, and what is interpretation. Establish one central dilemma, the strongest supported detail, the decisive choice and the real outcome. Treat any preselected retention hook as provisional: revise its wording and promise when the research does not support it. Never invent dialogue, motives, quotations, miracles as scientific proof, or scriptural attribution to make a hook work. Keep source notes in the existing production notes, with a brief natural attribution in speech where necessary.

SACRED LORE, DICTION & MODE FIDELITY:
- Keep episodes strictly grounded in authentic sacred lore of the Valmiki Ramayana, Ramcharitmanas, Mahabharata, or Puranas; strictly NEVER include modern science, satellite imagery, or archaeology.
- Follow the active template's own narration/dialogue format and image/video media mode without altering asset types or adding unrelated top banners, music prompts, or lip-sync mandates.
- For conversational multi-character episodes: dramatize the episode faithfully through living character dialogue true to the sacred lore of the Valmiki Ramayana, Ramcharitmanas, or Mahabharata: strictly NEVER include modern science, satellite imagery, or archaeology.
- When ancient gods, avataras, and epic figures speak (such as Mata Sita, Sri Rama, Lakshmana, Ravana, Hanuman, Arjuna, Krishna), they must speak with profound scriptural dignity, elevated noble Hindi, and sacred gravitas true to the Valmiki Ramayana, Ramcharitmanas, and Mahabharata.
- BANNED STREET SLANG: Strictly NEVER use cheap modern street-slang, rude informal pronouns, or low-level colloquialisms (such as 'तू', 'तेरा', 'तुझे', 'तूने', 'काय रे', 'अरे').

${profile === 'shorts'
    ? 'SHORTS: Tell one complete dilemma, turning point and resolution for the chosen episode. Start Scene 1 with a specific visual hook matching the active template’s own media tag (<image_prompt1> or <video_prompt1>) and immediate emotional stakes — never override mixed image/video tags or insert unrelated characters.'
    : 'LONG VIDEOS: Establish the dilemma and viewer promise in the opening few sentences. Develop the chapters through connected sacred episodes, actions and spiritual wisdom. Resolve the central crisis with the decisive action and outcome.'}

ONE VARIED ENGAGEMENT CLOSE:
After the complete story payoff, include ONE compact Hindi closing invitation asking viewers to like the video, subscribe to Ancient Dharma, and leave ONE episode-relevant comment (e.g. 'कमेंट में अपनी राय लिखिए। कथा अच्छी लगी तो लाइक करें और Ancient Dharma को सब्सक्राइब करें।').

SYNC AND SILENT CHECK:
Put the closing words once at the end of the voice script and final CTA segment. Check that the opening is specific, the visual prompts match the active template’s exact asset types and numbering, and the close includes like + subscribe + one episode-relevant comment invitation.
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
