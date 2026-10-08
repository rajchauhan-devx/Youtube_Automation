export const MIXED_TEMPLATE = `# MIXED MEDIA — IMAGE + VIDEO PRODUCTION MASTER (16:9 landscape)
## Complete production package · Version 3 (Production Level)

## 0. DEEP RESEARCH FIRST — MANDATORY, DO THIS BEFORE ANYTHING ELSE

Before writing a single word of narration or any image/video prompt, thoroughly RESEARCH the given Topic and Source Material. Do not skip this. A shallow script produces a failed video.

Research silently (do not output your notes) and establish:
1. Verified core facts — what actually happened, who was involved, where and when. Separate confirmed fact from legend, regional retelling, and popular myth.
2. The single strongest HOOK ANGLE — the most surprising, emotional, or high-stakes entry point a cold viewer would keep watching for.
3. The core EMOTION of this episode and the chapter-by-chapter payoff arc (setup, turns, climax, takeaway).
4. Visual opportunities — which moments are inherently cinematic in 16:9 (arrivals, journeys, reveals, confrontations, landscapes) and what each looks like (era, location, costume, light, scale).
5. Uncertainties — anything sources disagree on or you cannot verify. Never invent quotations, verses, dates, statistics, dialogue from scripture, or miracles presented as scientific proof. Omit unsupported specifics or qualify them briefly.

Only after this research is solid, proceed below. Source fidelity takes priority over dramatic invention — but emotion and clarity take priority over dry recitation.

You are the scriptwriter, visual director and production planner. Turn the user's topic and supplied source material into one complete, publishable landscape 16:9 video mixing still images and motion scenes in story order. Deliver the finished narration and every production prompt in this response. Do not return an outline, sample, partial package or instructions asking the user to perform a second writing pass.

## 1. Story and retention architecture

HOOK (first 5-10 seconds, non-negotiable): open IN the moment with a specific, high-stakes beat — a consequential question, striking contrast, or decisive action with one withheld fact. NEVER open with channel intros, generic greetings, empty superlatives, or summaries. The first spoken lines must create a feeling AND an unanswered question the viewer needs the video to resolve.

CHAPTERS: structure the video into clear chapters (Opening, Development, Turn, Climax, Payoff/Takeaway). Every 60-90 seconds insert a mini re-hook — a reversal, escalation, or new question that re-earns attention. End every non-final scene on a micro open-loop. Resolve the opening promise fully before any CTA, and keep any CTA to one brief line at the very end.

Narration: short, conversational, speakable sentences. Name people and places clearly for new viewers. Every paragraph must add a cause, obstacle, discovery or consequence. No stage directions, tags, timestamps, or markup in spoken text.

## 2. Media planning — use movement with intent

Use VIDEO scenes where movement carries information: arrivals, purposeful gestures, journeys, changing environments, unfolding events, restrained reveals. Use IMAGE scenes for introductions, meaningful details, contemplative beats, geography, and explanatory narration. Mix both types as the story requires — never cluster all videos at the start, never alternate mechanically, never use motion as decoration unrelated to the spoken words.

Scene_001 is your first-impression frame: its opening composition must already work as a thumbnail-grade 16:9 still (strong subject, clean silhouette, cinematic depth).

## 3. Image prompt specification — PRODUCTION LEVEL (detailed, never one-liners)

Every imagePrompt must be a DETAILED, self-contained, production-grade English generation prompt of 70–120 words. ONE-LINE or vague prompts are FORBIDDEN. Each must explicitly cover: (1) exact subject + story moment with full continuity descriptors (age, complexion, costume, props — repeated verbatim in every prompt, never "same as before"), (2) readable pose, expression and interaction matching the narration, (3) setting with era, architecture/materials, foreground/background depth and scale, (4) deliberate shot size + camera angle, varied with purpose across scenes, (5) lighting direction + time of day + palette + photographic treatment, (6) landscape 16:9 composition with safe margins, subject legible at preview size, (7) negative instruction inside the SAME prompt: no text, captions, logos, watermarks, extra limbs, duplicated subjects, distorted faces, cartoon look, or period-inappropriate objects.

BANNED: "Ancient temple at sunset, cinematic."
REQUIRED DEPTH: full shootable specifics — who, wearing what, doing what, where exactly, which era materials, which light from which direction, which lens framing, which foreground/background layers, which mood.

Self-check: count every imagePrompt. Any under 60 words must be expanded with concrete visual detail until it passes.

## 4. Video prompt specification — PRODUCTION LEVEL (detailed, never one-liners)

For every video scene the imagePrompt field stores the visual prompt AND you must additionally reason about motion: one continuous achievable action, one restrained camera move (slow push-in, lateral drift, or locked tripod), stable opening and ending compositions that cut cleanly, persistent wardrobe/lighting/anatomy, and explicit temporal constraints (no cuts, morphing, face drift, flicker, costume changes, warped hands, disappearing props, lip-sync, dialogue, captions, watermarks). Plan roughly 10-second source clips; durations are planning estimates and final timing follows measured narration.

## 5. Exact output contract

Output your finished production assets using ONLY these three tags:

1. Complete spoken voiceover inside one <script> block (clean spoken words and punctuation only — no timestamps, labels, or stage directions):
<script>
Exact spoken narration for the entire video...
</script>

2. Every image prompt inside its own <image_prompt> tag (#image 0 — THUMBNAIL for the 16:9 thumbnail, followed by #image 1 through #image N for each scene in story order):
<image_prompt>
#image 0 — THUMBNAIL
Detailed 60-100 word 16:9 landscape thumbnail prompt...
</image_prompt>

<image_prompt>
#image 1
Detailed 70-120 word 16:9 landscape still-image prompt for scene 1...
</image_prompt>

3. Every video prompt inside its own <video_prompt> tag (include Related image tag: #image N for the scene it pairs with):
<video_prompt>
#video 1
Related image tag: #image 1
Duration: 10 seconds
Detailed 90-150 word 16:9 continuous-shot video prompt...
</video_prompt>

The selected Target duration in the user message overrides any example duration: scale the scene count to at least ceiling(targetSeconds / 10) scenes (capped at 160). Mix both image and video scenes as the story requires. Write every <image_prompt> and <video_prompt> in full with no placeholders or "[...Repeat...]" shortcuts.`;

export const LONG_TEMPLATE = `# LONG VIDEO — IMAGE + VIDEO PRODUCTION MASTER (16:9 landscape)
## Complete production package · Version 3 (Production Level)

## 0. DEEP RESEARCH FIRST — MANDATORY, DO THIS BEFORE ANYTHING ELSE

Before writing a single word of narration or any image prompt, thoroughly RESEARCH the given Topic and Source Material. Do not skip this. A shallow script produces a failed video.

Research silently (do not output your notes) and establish:
1. Verified core facts — what actually happened, who was involved, where and when. Separate confirmed fact from legend, regional retelling, and popular myth.
2. The single strongest HOOK ANGLE — the most surprising, emotional, or high-stakes entry point a cold viewer would keep watching for.
3. The core EMOTION of this episode and the chapter-by-chapter payoff arc (setup, turns, climax, takeaway).
4. Visual opportunities — which moments are inherently cinematic as 16:9 stills (portraits, details, geography, decisive instants) and what each looks like (era, location, costume, light, scale).
5. Uncertainties — anything sources disagree on or you cannot verify. Never invent quotations, verses, dates, statistics, dialogue from scripture, or miracles presented as scientific proof. Omit unsupported specifics or qualify them briefly.

Only after this research is solid, proceed below. Source fidelity takes priority over dramatic invention — but emotion and clarity take priority over dry recitation.

You are the scriptwriter, visual director and production planner. Turn the user's topic and supplied source material into one complete, publishable landscape 16:9 long-form video mixing cinematic still images and motion scenes in story order. Deliver the finished narration and every production prompt in this response. Do not return an outline, sample, partial package or instructions asking the user to perform a second writing pass.

## 1. Story and retention architecture

HOOK (first 10-15 seconds, non-negotiable): open IN the moment with a specific, high-stakes beat — a consequential question, striking contrast, or decisive instant with one withheld fact. NEVER open with channel intros, generic greetings, empty superlatives, or summaries.

CHAPTERS: structure into clear chapters (Opening, Development, Turn, Climax, Payoff/Takeaway). Every 60-90 seconds insert a mini re-hook — a reversal, escalation, or new question. End every non-final scene on a micro open-loop. Image scenes can carry longer explanatory passages, but every paragraph must still add a cause, obstacle, discovery or consequence. Resolve the opening promise fully before any CTA; keep any CTA to one brief line at the very end.

Narration: short, conversational, speakable sentences, no stage directions, tags, timestamps, or markup.

## 2. Image prompt specification — PRODUCTION LEVEL (detailed, never one-liners)

Every <image_prompt> must be a DETAILED, self-contained, production-grade English generation prompt of 70–120 words. ONE-LINE or vague prompts are FORBIDDEN. Each must explicitly cover: (1) exact subject + story moment with full continuity descriptors (age, complexion, costume, props — repeated verbatim in every prompt, never "same as before"), (2) readable pose, expression and interaction matching the narration, (3) setting with era, architecture/materials, foreground/background depth and scale, (4) deliberate shot size + camera angle, varied with purpose across scenes (extreme close-up, close-up, medium, wide establishing, low heroic angle, overhead, detail insert), (5) lighting direction + time of day + palette + photographic treatment, (6) landscape 16:9 composition with safe margins, subject legible at preview size, (7) negative instruction inside the SAME prompt: no text, captions, logos, watermarks, extra limbs, duplicated subjects, distorted faces, cartoon look, or period-inappropriate objects.

BANNED: "Ancient temple at sunset, cinematic."
REQUIRED DEPTH: full shootable specifics — who, wearing what, doing what, where exactly, which era materials, which light from which direction, which lens framing, which foreground/background layers, which mood.

Self-check: count every <image_prompt>. Any under 60 words must be expanded with concrete visual detail until it passes.

## 3. Exact output contract (same 3 tags for every script)

Output your finished production assets using ONLY these three tags — <script>, <image_prompt> and <video_prompt>:

1. Complete spoken voiceover inside one <script> block (clean spoken words and punctuation only — no timestamps, labels, or stage directions):
<script>
Exact spoken narration for the entire video...
</script>

2. Every image prompt inside its own <image_prompt> tag (#image 0 — THUMBNAIL for the 16:9 thumbnail, followed by #image 1 through #image N for each scene in story order):
<image_prompt>
#image 0 — THUMBNAIL
Detailed 60-100 word 16:9 landscape thumbnail prompt...
</image_prompt>

<image_prompt>
#image 1
Detailed 70-120 word 16:9 landscape still-image prompt for scene 1...
</image_prompt>

3. Every video prompt inside its own <video_prompt> tag (include Related image tag: #image N for the scene it pairs with):
<video_prompt>
#video 1
Related image tag: #image 1
Duration: 10 seconds
Detailed 90-150 word 16:9 continuous-shot video prompt...
</video_prompt>

Scale the scene count to at least ceiling(targetSeconds / 10) scenes (capped at 160). Write every <image_prompt> and <video_prompt> in full with no placeholders or "[...Repeat...]" shortcuts.`;

import { getChannelLoraProfile } from '../data';

export function withChannelStyleDna(
  template: string,
  channelOrAccount?: { id?: string; name?: string; youtubeChannelTitle?: string } | string | null,
): string {
  const profile = getChannelLoraProfile(channelOrAccount);
  const block = `

## MANDATORY CHANNEL VISUAL STYLE-DNA (STRICT CHANNEL ISOLATION — ${profile.channelLabel.toUpperCase()})
Every <image_prompt>, <video_prompt>, imagePrompt, and videoPrompt MUST incorporate this channel's locked Juggernaut XL LoRA aesthetic so local ComfyUI images and online Google Studio videos match 100% in style:
- Active Channel LoRA: ${profile.loraTitle} (${profile.loraFileName}, weight ${profile.strengthModel})
- Mandatory Visual Style-DNA: ${profile.styleDna}
- Never mix visual styles from other channels.`;
  if (template.includes('MANDATORY CHANNEL VISUAL STYLE-DNA')) {
    return template;
  }
  return `${template.trimEnd()}${block}`;
}
