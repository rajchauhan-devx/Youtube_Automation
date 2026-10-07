import { isImageOnlyTemplate, spokenText, type ScenePlan } from './scene-plan.js';

export const SCENE_PLAN_FORMAT_MARKER = '## Shared extraction format V1';

/** Override serialization only; retain every user-authored production instruction. */
export function withScenePlanFormat(prompt: string, profile: 'shorts' | 'long' | 'mixed'): string {
  const isImageOnly = isImageOnlyTemplate(prompt);
  const contract = isImageOnly
    ? `${SCENE_PLAN_FORMAT_MARKER}
This is the app's unified numbered-tag extraction format for ALL profiles. Preserve the topic, factual constraints, language, story, narration, research, source requirements, visual style, character continuity, and production detail requested above.

Output your finished assets using ONLY these extraction tags:

1. Complete spoken voiceover narration inside one <script> block (clean spoken words and punctuation only — no timestamps, stage directions, or markup):
<script>
Exact spoken narration for the entire episode, with scene paragraphs in spoken order.
</script>

2. Thumbnail prompt inside <image_prompt0>:
<image_prompt0>
#image 0 — THUMBNAIL
Complete standalone thumbnail image generation prompt...
</image_prompt0>

3. Every visual scene prompt inside its own sequentially numbered tag incrementing chronologically across the timeline (1, 2, 3, ...):
<image_prompt1>
#image 1
Complete standalone still-image generation prompt for scene 1...
</image_prompt1>

<image_prompt2>
#image 2
Complete standalone still-image generation prompt for scene 2...
</image_prompt2>

Profile: ${profile}. ${profile === 'shorts' ? 'Use portrait 9:16.' : 'Use landscape 16:9.'} Write actual finished content in every tag without placeholders or "[...Repeat...]" shortcuts. Do not output any video prompts for this image-only production.`
    : `${SCENE_PLAN_FORMAT_MARKER}
This is the app's unified numbered-tag extraction format for ALL profiles. Preserve the topic, factual constraints, language, story, narration, research, source requirements, visual style, character continuity, and production detail requested above.

Output your finished assets using ONLY these extraction tags:

1. Complete spoken voiceover narration inside one <script> block (clean spoken words and punctuation only — no timestamps, stage directions, or markup):
<script>
Exact spoken narration for the entire episode, with scene paragraphs in spoken order.
</script>

2. Thumbnail prompt inside <image_prompt0>:
<image_prompt0>
#image 0 — THUMBNAIL
Complete standalone thumbnail image generation prompt...
</image_prompt0>

3. Every visual scene prompt inside its own sequentially numbered tag incrementing chronologically across the timeline (1, 2, 3, ...):
- For static image scenes, use <image_prompt[N]>:
<image_prompt1>
#image 1
Complete standalone still-image generation prompt for scene 1...
</image_prompt1>

- For mixed / video scenes, use <video_prompt[N]> with the same chronological index:
<video_prompt2>
#video 2
Duration: 8 seconds
Complete standalone continuous-shot video generation prompt for scene 2...
</video_prompt2>

<image_prompt3>
#image 3
Complete standalone still-image generation prompt for scene 3...
</image_prompt3>

Profile: ${profile}. ${profile === 'shorts' ? 'Use portrait 9:16.' : 'Use landscape 16:9.'} Write actual finished content in every tag without placeholders or "[...Repeat...]" shortcuts.`;
  return prompt.includes(SCENE_PLAN_FORMAT_MARKER) ? prompt : `${prompt.trimEnd()}\n\n${contract}`;
}

export function serializeScenePlan(plan: ScenePlan): string {
  const parts: string[] = [
    `<title>${plan.title}</title>`,
    `<script>\n${spokenText(plan)}\n</script>`,
    `<image_prompt0>\n#image 0 — THUMBNAIL\n${plan.thumbnailPrompt}\n</image_prompt0>`,
  ];

  plan.scenes.forEach((scene, idx) => {
    const num = idx + 1;
    const sceneLine = scene.chapter && !/^Scene\s+\d+$/i.test(scene.chapter) ? `SCENE: ${scene.chapter}\n` : '';
    const durLine = scene.duration ? `DURATION: ${scene.duration} seconds\n` : '';
    if (scene.mediaType === 'video') {
      parts.push(
        `<video_prompt${num}>\n#video ${num}\n${sceneLine}${durLine}${scene.videoPrompt || scene.imagePrompt}\n</video_prompt${num}>`
      );
    } else {
      parts.push(`<image_prompt${num}>\n#image ${num}\n${sceneLine}${durLine}${scene.imagePrompt}\n</image_prompt${num}>`);
    }
  });

  return parts.join('\n\n');
}

/** Keep original response when it already extracts cleanly; otherwise append 3-tag blocks. */
export function normalizeScenePlanResponse(raw: string, plan: ScenePlan): string {
  if (raw.trimStart().startsWith('{')) {
    try { if (JSON.stringify(JSON.parse(raw)) === JSON.stringify(plan)) return raw; } catch { /* fall through */ }
  }
  if (/<(?:script|narration)\b/i.test(raw) && /<(?:image_prompt\d*|video_prompt\d*)\b/i.test(raw)) {
    return raw;
  }
  return serializeScenePlan(plan);
}
