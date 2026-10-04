import type { ScenePlan } from './scene-plan.js';

export const SCENE_PLAN_FORMAT_MARKER = '## Shared extraction format V1';

/** Override serialization only; retain every user-authored production instruction. */
export function withScenePlanFormat(prompt: string, profile: 'shorts' | 'long' | 'mixed'): string {
  const contract = `${SCENE_PLAN_FORMAT_MARKER}
This is the app's extraction format for ALL profiles. It replaces only conflicting output tags, tables, or serialization instructions above. Preserve the topic, factual constraints, language, story, narration, research, source requirements, visual style, character continuity, and production detail requested above. Do not rewrite content just to change its format.

Return exactly ONE <long_video> block containing valid JSON with this shape (the container name is shared by Shorts, Long Video, and Mixed Media):
<long_video>
{"version":1,"title":"Finished title","thumbnailPrompt":"Separate complete thumbnail prompt","scenes":[{"id":"scene_001","chapter":"Hook","role":"story","narration":"Exact spoken segment","mediaType":"image","duration":5,"imagePrompt":"Complete standalone still-image generation prompt"},{"id":"scene_002","chapter":"Development","role":"story","narration":"Exact next spoken segment","mediaType":"video","duration":5,"imagePrompt":"Complete standalone still-image alternative","videoPrompt":"Complete continuous-shot video generation prompt"}]}
</long_video>

Write actual finished content, not the example placeholders. Use 1–160 ordered scenes with unique scene_001, scene_002 IDs; positive planning durations at most 60 seconds; role story or cta; and at most 700 characters of exact spoken narration per scene. Every scene has mediaType and imagePrompt. Video scenes also have videoPrompt. Join scene narrations in order to obtain the complete voice script, with no extra or omitted spoken words. Merge each asset's negative instructions, style and continuity into its own prompt string. The thumbnail is separate. Include CTA/end-card scenes only when they are actually requested for playback. Keep supporting research, evidence and publishing sections as ordinary prose outside the JSON if the user requested them, but do not emit other extraction tags or a second extraction package. Escape quotes and newlines inside JSON strings. No Markdown fences around the JSON.

Profile: ${profile}. ${profile === 'shorts' ? 'Use portrait 9:16.' : 'Use landscape 16:9.'} Follow the template's image-only or image-and-video choice; the schema is the same for both.`;
  // Reusing an already formatted prompt must not append another contract.
  return prompt.includes(SCENE_PLAN_FORMAT_MARKER) ? prompt : `${prompt.trimEnd()}\n\n${contract}`;
}

export function serializeScenePlan(plan: ScenePlan): string {
  // Prevent literal closing tags in prompt strings from terminating the container.
  return `<long_video>\n${JSON.stringify(plan, null, 2).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')}\n</long_video>`;
}

/** Keep old prose and all spoken words; change only extraction markup. */
export function normalizeScenePlanResponse(raw: string, plan: ScenePlan): string {
  if (raw.trimStart().startsWith('{')) {
    try { if (JSON.stringify(JSON.parse(raw)) === JSON.stringify(plan)) return raw; } catch { /* Preserve strict validation at the caller. */ }
  }
  const blocks = [...raw.matchAll(/<long_video>\s*([\s\S]*?)\s*<\/long_video>/gi)];
  if (blocks.length === 1) {
    try { if (JSON.stringify(JSON.parse(blocks[0][1])) === JSON.stringify(plan)) return raw; }
    catch { /* Human-readable asset blocks need the shared JSON representation. */ }
  }
  const prose = raw.replace(/<\/?(?:long_video|shorts|scene|script|audio_prompt|narration|image_prompt|video_prompt|thumbnail_prompt|title)\b[^>]*>/gi, '').trimEnd();
  return `${prose}\n\n${serializeScenePlan(plan)}`;
}
