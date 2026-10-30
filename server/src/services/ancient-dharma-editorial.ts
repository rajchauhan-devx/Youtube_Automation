export const ANCIENT_DHARMA_EDITORIAL_START = '[ANCIENT DHARMA EDITORIAL RULES]';
export const ANCIENT_DHARMA_EDITORIAL_END = '[/ANCIENT DHARMA EDITORIAL RULES]';

/** Writing instructions only: never change the template's production/output contract. */
export function ancientDharmaEditorial(profile: 'shorts' | 'long'): string {
  return `${ANCIENT_DHARMA_EDITORIAL_START}
Apply these writing rules to Ancient Dharma episodes. For an explicitly unrelated topic, follow that topic's own tradition and audience instead of adding Hindu devotional language. These rules update the research, narration and closing instructions below; preserve every existing output section, extraction tag, asset number, media mode, character bible and narration-to-scene mapping. Perform the editorial work silently; do not add a new output section.

RESEARCH BEFORE COMMITTING TO A HOOK: Identify the actual source/version, what it supports, what belongs to a regional retelling, and what is interpretation. Establish one central dilemma, the strongest supported detail, the decisive choice and the real outcome. Treat any preselected retention hook as provisional: revise its wording and promise when the research does not support it. Never invent dialogue, motives, quotations, miracles as scientific proof, or scriptural attribution to make a hook work. Keep source notes in the existing production notes, with a brief natural attribution in speech where necessary.

OPEN INSIDE THE STORY: Compare three distinct, truthful openings internally: an action, a contradiction, and a consequential choice. Choose the clearest one, rather than always opening with a long 'why' question. Name the person or sacred object and make the situation understandable without the title. Match the first visible image/action to the first spoken words; no introductory temple montage or scenery before the predicament. The next sentence must advance that same event or give a useful clue, not restart with biography or a history lecture.

FORWARD MOMENTUM: Write simple, natural spoken Devanagari Hindi with devotional dignity. Every sentence must add necessary context, an action, discovery, obstacle, decision or consequence. Connect beats through cause and effect. Give intermediate answers; do not save every useful detail for the ending. Remove repeated praise, repeated explanations, abstract moral lectures, excessive adjectives and empty suspense. Preserve emotional breaths; never rush speech or add filler to satisfy a duration. Build emotion from supported events, not invented private thoughts.

${profile === 'shorts'
    ? 'SHORTS: Tell one complete dilemma and resolution, not an entire biography. Scene 1 must ALWAYS be a cinematic video hook (<video_prompt1>), never a still image, with continuous action and camera movement to hook cold viewers immediately and maximize retention. Establish the concrete situation in the first short sentence and give a clue or consequence in the next one or two. Use a genuine discovery or consequential choice near the midpoint when the story needs it; do not force a twist or repeated question. Resolve the opening promise with the decisive action, reason and outcome, then move directly to the closing invitation.'
    : 'LONG VIDEOS: Establish the dilemma and viewer promise in the opening few sentences. Develop the existing chapters through connected subquestions; give a meaningful answer in each chapter before opening the next. Introduce background when it explains a choice or consequence. Use natural spoken transitions and an earned change of understanding, not repeated introductions or a forced cliffhanger at every chapter. Resolve the central question with the decisive action, reason and outcome, then give a concise reflection and closing invitation.'}

ONE VARIED ENGAGEMENT CLOSE: After the complete story payoff, include ONE compact Hindi closing invitation asking viewers to like the video, subscribe to Ancient Dharma, and leave ONE specific comment. ${profile === 'shorts' ? 'Allow approximately 5–8 seconds within the selected Shorts runtime; reserve this speech time before drafting the story.' : 'Allow approximately 8–12 seconds within the selected runtime, without repeating the story summary.'} Do not try to squeeze all three requests into a three-second blessing. Keep it warm and direct, without interrupting the story or adding separate spoken like, subscribe, blessing and end-card sequences.

VARY THE COMMENT REQUEST: Choose either a short devotional response appropriate to the episode or one easy, concrete question about its central choice. Vary the response AND the sentence structure across topics; examples are alternatives, not a fixed closing to copy into every video. Ram-focused episodes may invite 'जय श्री राम' or 'सीताराम'; Hanuman-focused episodes may invite 'जय बजरंगबली' or 'जय हनुमान'; Shiva-focused episodes may invite 'हर हर महादेव' or 'ॐ नमः शिवाय'; Krishna-focused episodes may invite 'राधे कृष्ण' or 'जय श्री कृष्ण'. Never force a Ram greeting into an unrelated tradition. For a dilemma, ask a brief question such as 'भरत के किस निर्णय ने आपको सबसे अधिक छुआ?' instead of a generic 'आपकी क्या राय है?'. Invite one response, not a list of questions.

Possible closing patterns, adapted to the episode rather than repeated verbatim: 'कमेंट में जय श्री राम लिखिए। कथा अच्छी लगी तो लाइक करें और Ancient Dharma को सब्सक्राइब करें।' / 'हनुमान जी की भक्ति को नमन—कमेंट में जय बजरंगबली! ऐसी कथाओं के लिए लाइक करें और चैनल सब्सक्राइब करें।' / 'भरत के किस निर्णय ने आपका मन छुआ? कमेंट में बताइए, वीडियो लाइक करें और चैनल से जुड़ने के लिए सब्सक्राइब करें।' Use natural Hindi pronunciation of the channel name in speech if needed. Make the invitation compelling through relevance, never guilt, threats, guaranteed blessings, promised miracles, or claims that a 'true devotee' must engage. Do not demand repeated comments, personal information, or a subscription in exchange for the answer.

SYNC AND SILENT CHECK: Put the closing words exactly once in the clean voice script and their matching final CTA narration segment(s), using the existing tags and timeline format. Reuse existing follow/end-card slots where present; they form one close, not additional speeches or silent padding. Overlays must match the selected comment request and must not add conflicting engagement demands. Check that the opening is specific, the next sentence advances it, the source supports the claim, the middle develops, the payoff is complete before the CTA, and the close includes like + subscribe + one episode-relevant comment invitation. Do not output these checks or predict retention scores.
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
