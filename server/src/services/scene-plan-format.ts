import { spokenText, type ScenePlan } from './scene-plan.js';

export const SCENE_PLAN_FORMAT_MARKER = '## Shared extraction format V1';

/** Override serialization only; retain every user-authored production instruction. */
export function withScenePlanFormat(prompt: string, profile: 'shorts' | 'long' | 'mixed'): string {
  const contract = `${SCENE_PLAN_FORMAT_MARKER}
This is the app's unified 3-tag extraction format for ALL profiles. Preserve the topic, factual constraints, language, story, narration, research, source requirements, visual style, character continuity, and production detail requested above.

Output your finished assets using ONLY these three extraction tags:

1. Complete spoken voiceover narration inside one <script> block (clean spoken words and punctuation only — no timestamps, stage directions, or markup):
<script>
Exact spoken narration for the entire episode, with scene paragraphs in spoken order.
</script>

2. Every image generation prompt inside its own <image_prompt> block (start with #image 0 — THUMBNAIL for the cover, followed by #image 1 through #image N for each story scene):
<image_prompt>
#image 0 — THUMBNAIL
Complete standalone thumbnail image generation prompt...
</image_prompt>

<image_prompt>
#image 1
Complete standalone still-image generation prompt for scene 1...
</image_prompt>

3. Wrap every video generation prompt inside its own <video_prompt> block (include "Related image tag: #image N" for the scene it pairs with):
<video_prompt>
#video 1
Related image tag: #image 2
Complete standalone continuous-shot video generation prompt...
</video_prompt>

Profile: ${profile}. ${profile === 'shorts' ? 'Use portrait 9:16.' : 'Use landscape 16:9.'} Write actual finished content in every tag without placeholders or "[...Repeat...]" shortcuts.`;
  return prompt.includes(SCENE_PLAN_FORMAT_MARKER) ? prompt : `${prompt.trimEnd()}\n\n${contract}`;
}

export function serializeScenePlan(plan: ScenePlan): string {
  const parts: string[] = [
    `<title>${plan.title}</title>`,
    `<script>\n${spokenText(plan)}\n</script>`,
    `<image_prompt>\n#image 0 — THUMBNAIL\n${plan.thumbnailPrompt}\n</image_prompt>`,
  ];

  let videoCounter = 0;
  plan.scenes.forEach((scene, idx) => {
    const num = idx + 1;
    parts.push(`<image_prompt>\n#image ${num}\n${scene.imagePrompt}\n</image_prompt>`);
    if (scene.mediaType === 'video') {
      videoCounter += 1;
      parts.push(
        `<video_prompt>\n#video ${videoCounter}\nRelated image tag: #image ${num}\nDuration: ${scene.duration || 5} seconds\n${scene.videoPrompt || scene.imagePrompt}\n</video_prompt>`
      );
    }
  });

  return parts.join('\n\n');
}

/** Keep original response when it already extracts cleanly; otherwise append 3-tag blocks. */
export function normalizeScenePlanResponse(raw: string, plan: ScenePlan): string {
  if (raw.trimStart().startsWith('{')) {
    try { if (JSON.stringify(JSON.parse(raw)) === JSON.stringify(plan)) return raw; } catch { /* fall through */ }
  }
  if (/<(?:script|narration)\b/i.test(raw) && /<(?:image_prompt|video_prompt)\b/i.test(raw)) {
    return raw;
  }
  return serializeScenePlan(plan);
}
