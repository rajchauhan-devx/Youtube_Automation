import type { NarrationScene, ScenePlan } from './scene-plan.js';

/**
 * Clean spoken narration extracted from <script> or <narration> tags so TTS
 * receives pure speakable text without XML tags, (break) markers, or labels.
 */
export function cleanSpokenNarration(raw: string): string {
  return raw
    .replace(/\r/g, '')
    // Strip self-closing or paired SSML/XML break tags e.g. <break time="0.6s" />
    .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
    // Strip ElevenLabs style (break) / (pause) markers
    .replace(/\((?:break|pause|beat|whisper|softly|sighs?|laughs?)\)/gi, ' ')
    // Strip bracketed stage directions
    .replace(/\[[^\]]*\]/g, ' ')
    // Strip curly braces or angle brackets if any remain
    .replace(/[<>{}[\]]/g, ' ')
    // Strip markdown bold/italics
    .replace(/\*{1,3}/g, '')
    // Strip leading timestamp ranges like [0:00 - 0:10] or 0:00–0:10 at start of lines
    .replace(/^[ \t]*\d{1,2}:\d{2}(?::\d{2})?[ \t]*[–—-][ \t]*\d{1,2}:\d{2}(?::\d{2})?[ \t]*/gm, '')
    // Strip leading "Line 1:" or "Narrator:" labels if accidentally included inside <script>
    .replace(/^[ \t]*(?:Line\s+\d+|Narrator|Host|Voiceover)\s*:[ \t]*/gim, '')
    // Collapse horizontal whitespace while keeping paragraph breaks
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Distribute a single full narration string across `sceneCount` scenes so that:
 * 1. Every scene has non-empty spoken narration.
 * 2. Joining `scenes.map(s => s.narration).join('\n\n')` preserves the exact
 *    spoken words in the exact same order.
 */
export function distributeNarrationToScenes(fullNarration: string, sceneCount: number): string[] {
  const cleaned = cleanSpokenNarration(fullNarration);
  if (!cleaned) {
    throw new Error('The <script> (or <narration>) tag is empty. Include the spoken voiceover text inside <script>...</script>.');
  }
  if (sceneCount <= 1) return [cleaned.replace(/\s+/g, ' ').trim()];

  // 1. Try paragraph split first (blank-line separated blocks)
  const paragraphs = cleaned.split(/\n\s*\n+/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (paragraphs.length === sceneCount) return paragraphs;

  // 2. Try single-line split
  const lines = cleaned.split(/\n+/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (lines.length === sceneCount) return lines;

  // 3. Split into sentences (English .!? and Devanagari ।॥, plus line breaks)
  const flat = cleaned.replace(/\s*\n+\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const units = flat
    .split(/(?<=[.!?।॥])\s+/u)
    .map(u => u.trim())
    .filter(Boolean);

  // 4. If we have fewer sentences than scenes, progressively split the longest
  //    unit at natural clause boundaries (comma, dash, semicolon, colon) or midpoint word.
  while (units.length < sceneCount) {
    let longestIdx = -1;
    let longestLen = 0;
    for (let i = 0; i < units.length; i++) {
      const wordCount = units[i].split(/\s+/).filter(Boolean).length;
      if (wordCount >= 2 && units[i].length > longestLen) {
        longestLen = units[i].length;
        longestIdx = i;
      }
    }
    if (longestIdx === -1) break; // Every unit is a single word; cannot split further

    const target = units[longestIdx];
    const mid = Math.floor(target.length / 2);

    // Find clause boundary closest to midpoint
    const clauseMatches = [...target.matchAll(/[,;—–:]\s+/g)];
    let splitPos = -1;
    let bestDist = Infinity;
    for (const m of clauseMatches) {
      const endOfMatch = (m.index ?? 0) + m[0].length;
      if (endOfMatch > 3 && endOfMatch < target.length - 3) {
        const dist = Math.abs(endOfMatch - mid);
        if (dist < bestDist) {
          bestDist = dist;
          splitPos = endOfMatch;
        }
      }
    }

    let firstHalf = '';
    let secondHalf = '';
    if (splitPos !== -1) {
      firstHalf = target.slice(0, splitPos).trim();
      secondHalf = target.slice(splitPos).trim();
    } else {
      const words = target.split(/\s+/).filter(Boolean);
      const halfWords = Math.max(1, Math.floor(words.length / 2));
      firstHalf = words.slice(0, halfWords).join(' ');
      secondHalf = words.slice(halfWords).join(' ');
    }

    if (firstHalf && secondHalf) {
      units.splice(longestIdx, 1, firstHalf, secondHalf);
    } else {
      break;
    }
  }

  // Fallback if total words < sceneCount
  while (units.length < sceneCount) {
    units.push(units[units.length - 1] || '...');
  }

  // 5. Group `units` (length >= sceneCount) into `sceneCount` contiguous buckets
  const result: string[] = [];
  for (let i = 0; i < sceneCount; i++) {
    const start = Math.round((i * units.length) / sceneCount);
    const end = Math.round(((i + 1) * units.length) / sceneCount);
    const slice = units.slice(start, Math.max(start + 1, end));
    result.push(slice.join(' ').trim());
  }
  return result;
}

interface ParsedVisualAsset {
  kind: 'image' | 'video';
  pos: number;
  assetNum?: number;
  linkedImageNum?: number;
  linkedSceneNum?: number;
  duration?: number;
  prompt: string;
  isThumbnail: boolean;
  isFollowFrame: boolean;
  isEndCard: boolean;
}

const METADATA_LINE = /^(?:ASSET|TIMELINE|DURATION|PURPOSE|Scene|Mode|Characters|Location|Evidence\s*\/\s*Disclosure|Reference Image|Related image tag|Target Usable Duration|Audio|Shot Type|Camera Movement)\s*:/i;

function parseVisualBlock(rawBlock: string, kind: 'image' | 'video', pos: number): ParsedVisualAsset | null {
  const cleaned = rawBlock.replace(/\r/g, '').replace(/\*\*/g, '').trim();
  if (!cleaned) return null;

  const assetMatch = cleaned.match(new RegExp(`#${kind}\\s+(\\d+)\\b`, 'i'))
    || cleaned.match(new RegExp(`\\bASSET\\s*:\\s*${kind}\\s+(\\d+)`, 'i'));
  const assetNum = assetMatch ? Number(assetMatch[1]) : undefined;

  const linkedImageMatch = cleaned.match(/(?:Related image tag|Reference Image)\s*:\s*#image\s+(\d+)\b/i);
  const linkedImageNum = linkedImageMatch ? Number(linkedImageMatch[1]) : undefined;

  const linkedSceneMatch = cleaned.match(/(?:^|\n|\()\s*Scene\s*:\s*(\d+)\b/i)
    || cleaned.match(/#(?:image|video)\s+\d+\s*[—–-]+\s*SCENE\s+(\d+)\b/i);
  const linkedSceneNum = linkedSceneMatch ? Number(linkedSceneMatch[1]) : undefined;

  const durationMatch = cleaned.match(/(?:Target Usable Duration|DURATION|Duration)\s*:\s*(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?\b/i);
  const rawDuration = durationMatch ? Number(durationMatch[1]) : undefined;
  const duration = rawDuration && Number.isFinite(rawDuration) && rawDuration > 0 && rawDuration <= 60 ? rawDuration : undefined;

  // Check if block uses labeled fields (Prompt:, Negative Prompt:, Style Tags:, Continuity Lock:)
  const fieldMatches = [...cleaned.matchAll(/^(Prompt|Negative(?:\s+Prompt)?|Style(?:\s+Tags)?|Continuity(?:\s+Lock)?|Character\s+Consistency)\s*:[ \t]*(.*)$/gim)];

  let prompt = '';
  let headerText = '';

  if (fieldMatches.length > 0) {
    headerText = cleaned.slice(0, fieldMatches[0].index ?? 0);
    const getField = (prefix: RegExp) => {
      const idx = fieldMatches.findIndex(m => prefix.test(m[1]));
      if (idx < 0) return '';
      const start = (fieldMatches[idx].index ?? 0) + fieldMatches[idx][1].length + 1;
      const end = fieldMatches[idx + 1]?.index ?? cleaned.length;
      return cleaned.slice(start, end).trim();
    };
    const mainPrompt = getField(/^Prompt$/i);
    const continuity = getField(/^(?:Continuity|Character)/i);
    const negative = getField(/^Negative/i);
    const style = getField(/^Style/i);

    prompt = [
      mainPrompt,
      continuity ? `Continuity Lock:\n${continuity}` : '',
      negative ? `Negative Prompt:\n${negative}` : '',
      style ? `Style Tags:\n${style}` : '',
    ].filter(Boolean).join('\n\n').trim();
  }

  if (!prompt) {
    const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
    headerText = lines.slice(0, 2).join(' ');

    // Strip leading "#image N" or "#video N" line or prefix
    if (lines.length > 0) {
      const prefixRegex = new RegExp(`^#${kind}\\s+\\d+[A-Z]?\\b\\s*(?:[—–:-]\\s*(.*))?$`, 'i');
      const m = lines[0].match(prefixRegex);
      if (m) {
        const rest = (m[1] || '').trim();
        // If `rest` is just a short label like "THUMBNAIL", "SCENE 1", "FOLLOW FRAME", "END CARD", drop the line
        if (!rest || (rest.length < 45 && /^(?:THUMBNAIL|SCENE\s+\d+|FOLLOW\s*FRAME|END\s*CARD|IMAGE\s+\d+|VIDEO\s+\d+)/i.test(rest))) {
          headerText += ' ' + rest;
          lines.shift();
        } else {
          lines[0] = rest;
        }
      }
    }

    // Handle same-line caption like "🖼️ IMAGE 1 — THE ARCHITECT A wide cinematic shot..."
    if (lines.length > 0) {
      const deprefixed = lines[0].replace(/^[^\p{L}\p{N}#]+/u, '');
      const sameLine = deprefixed.match(/^(?:IMAGE|VIDEO)\s+\d+[A-Z]?\s*[—–-]\s*([A-Z][A-Z0-9 '&-]{1,40}?[A-Z0-9])\s+(?=[A-Z][a-z"“])/);
      if (sameLine) {
        headerText += ' ' + sameLine[1];
        lines[0] = deprefixed.slice(sameLine[0].length).trim();
      } else if (
        lines.length > 1 &&
        lines[0].length < 100 &&
        (/^(?:[^\p{L}\p{N}]*)?(?:IMAGE|VIDEO)\s+\d+/iu.test(lines[0]) || /^ASSET\s*:\s*THUMBNAIL/i.test(lines[0]))
      ) {
        headerText += ' ' + lines.shift()!;
      }
    }

    const bodyLines = lines.filter(line => !METADATA_LINE.test(line) && !/^#(?:image|video)\s+\d+\b/i.test(line));
    prompt = bodyLines.join('\n').trim();
  }

  if (!prompt) return null;

  const isThumbnail = /\bTHUMBNAIL\b/i.test(headerText);
  const isFollowFrame = /\bFOLLOW(?:\s+FRAME)?\b/i.test(headerText);
  const isEndCard = /\bEND\s+CARD\b/i.test(headerText);

  return {
    kind,
    pos,
    assetNum,
    linkedImageNum,
    linkedSceneNum,
    duration,
    prompt,
    isThumbnail,
    isFollowFrame,
    isEndCard,
  };
}

/**
 * Universal 3-tag extractor:
 * Looks ONLY for:
 *  1. <script>...</script> (or <narration>...</narration>)
 *  2. <image_prompt>...</image_prompt> (with fallback to bare #image N blocks)
 *  3. <video_prompt>...</video_prompt> (with fallback to bare #video N blocks)
 */
export function parseSimpleTagPackage(raw: string): ScenePlan {
  const text = raw.replace(/\r/g, '');

  // 1. Extract Narration from <script> or <narration> (or FINAL CLEAN VOICE SCRIPT fallback)
  const scriptTags = [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)]
    .map(m => m[1].trim())
    .filter(Boolean);
  const narrationTags = scriptTags.length
    ? scriptTags
    : [...text.matchAll(/<narration\b[^>]*>([\s\S]*?)<\/narration\s*>/gi)]
        .map(m => m[1].trim())
        .filter(Boolean);

  let rawNarration = narrationTags.join('\n\n').trim();
  if (!rawNarration) {
    // Fallback for responses with a FINAL CLEAN VOICE SCRIPT heading but no <script> tag
    const voiceSection = text.match(/^#{1,6}\s+[^\n]*FINAL CLEAN VOICE SCRIPT[^\n]*\n([\s\S]*?)(?=^#{1,6}\s+|\n---\s*\n|(?![\s\S]))/im)?.[1]?.trim();
    if (voiceSection) rawNarration = voiceSection;
  }

  if (!rawNarration) {
    throw new Error('Missing narration tag: wrap the spoken voiceover in <script>...</script> (or <narration>...</narration>).');
  }

  // 2. Extract Image Prompts from <image_prompt> tags (or bare #image N fallback)
  const imageAssets: ParsedVisualAsset[] = [];
  const imageTagMatches = [...text.matchAll(/<image_prompt\b[^>]*>([\s\S]*?)<\/image_prompt\s*>/gi)];
  for (const m of imageTagMatches) {
    const parsed = parseVisualBlock(m[1], 'image', m.index ?? 0);
    if (parsed) imageAssets.push(parsed);
  }

  // Fallback if the AI wrote bare "#image 1: ..." blocks without <image_prompt> wrapper tags
  if (imageAssets.length === 0) {
    const bareImageMatches = [
      ...text.matchAll(/(?:^|\n)[ \t]*(?:\*{1,2})?(#image[ \t]+\d+[A-Z]?\b[\s\S]*?)(?=(?:\n[ \t]*(?:\*{1,2})?#(?:image|video)[ \t]+\d+\b|\n[ \t]*#{1,6}[ \t]+\S|\n[ \t]*---+[ \t]*(?:\n|$)|(?![\s\S])))/gi),
    ];
    for (const m of bareImageMatches) {
      const parsed = parseVisualBlock(m[1], 'image', m.index ?? 0);
      if (parsed && parsed.prompt.length >= 15) imageAssets.push(parsed);
    }
  }

  // Fallback for legacy <long_video>ASSET: IMAGE ...</long_video> blocks
  if (imageAssets.length === 0) {
    const legacyBlocks = [...text.matchAll(/<long_video\b[^>]*>([\s\S]*?)<\/long_video\s*>/gi)];
    for (const m of legacyBlocks) {
      if (/^\s*(?:\*\*)?ASSET\s*:\s*(?:IMAGE|THUMBNAIL)/im.test(m[1])) {
        const parsed = parseVisualBlock(m[1], 'image', m.index ?? 0);
        if (parsed) imageAssets.push(parsed);
      }
    }
  }

  // 3. Extract Video Prompts from <video_prompt> tags (or bare #video N / legacy ASSET: VIDEO fallback)
  const videoAssets: ParsedVisualAsset[] = [];
  const videoTagMatches = [...text.matchAll(/<video_prompt\b[^>]*>([\s\S]*?)<\/video_prompt\s*>/gi)];
  for (const m of videoTagMatches) {
    const parsed = parseVisualBlock(m[1], 'video', m.index ?? 0);
    if (parsed) videoAssets.push(parsed);
  }

  if (videoAssets.length === 0) {
    const bareVideoMatches = [
      ...text.matchAll(/(?:^|\n)[ \t]*(?:\*{1,2})?(#video[ \t]+\d+[A-Z]?\b[\s\S]*?)(?=(?:\n[ \t]*(?:\*{1,2})?#(?:image|video)[ \t]+\d+\b|\n[ \t]*#{1,6}[ \t]+\S|\n[ \t]*---+[ \t]*(?:\n|$)|(?![\s\S])))/gi),
    ];
    for (const m of bareVideoMatches) {
      const parsed = parseVisualBlock(m[1], 'video', m.index ?? 0);
      if (parsed && parsed.prompt.length >= 15) videoAssets.push(parsed);
    }
  }

  if (videoAssets.length === 0) {
    const legacyBlocks = [...text.matchAll(/<long_video\b[^>]*>([\s\S]*?)<\/long_video\s*>/gi)];
    for (const m of legacyBlocks) {
      if (/^\s*(?:\*\*)?ASSET\s*:\s*VIDEO/im.test(m[1])) {
        const parsed = parseVisualBlock(m[1], 'video', m.index ?? 0);
        if (parsed) videoAssets.push(parsed);
      }
    }
  }

  if (imageAssets.length === 0 && videoAssets.length === 0) {
    throw new Error('Missing visual prompt tags: include <image_prompt>...</image_prompt> (and <video_prompt>...</video_prompt> for mixed scripts).');
  }

  // 4. Separate Thumbnail, Follow Frame, and End Card from story images
  const explicitThumbTag = text.match(/<thumbnail_prompt\b[^>]*>([\s\S]*?)<\/thumbnail_prompt\s*>/i)?.[1]?.trim();
  const nonCardImages = imageAssets.filter(a => !a.isFollowFrame && !a.isEndCard);
  const thumbAsset = imageAssets.find(a => a.isThumbnail)
    || (nonCardImages.length > 1 ? nonCardImages.find(a => a.assetNum === 0) : undefined);

  let storyImages = nonCardImages.filter(a => a !== thumbAsset);
  if (storyImages.length === 0 && imageAssets.length > 0 && videoAssets.length === 0) {
    // If the user only supplied 1 image and it happened to be #image 0, keep it as the story image
    storyImages = [imageAssets[0]];
  }

  // 5. Build ordered visual slots (Image-only, Video-only, or Mixed)
  interface VisualSlot {
    mediaType: 'image' | 'video';
    imagePrompt: string;
    videoPrompt?: string;
    duration?: number;
  }

  const slots: VisualSlot[] = [];

  if (videoAssets.length === 0) {
    for (const img of storyImages) {
      slots.push({
        mediaType: 'image',
        imagePrompt: img.prompt,
        duration: img.duration,
      });
    }
  } else if (storyImages.length === 0) {
    for (const vid of videoAssets) {
      slots.push({
        mediaType: 'video',
        imagePrompt: vid.prompt,
        videoPrompt: vid.prompt,
        duration: vid.duration,
      });
    }
  } else {
    // Mixed script (both storyImages and videoAssets exist)
    const anyLinked = videoAssets.some(v => v.linkedImageNum !== undefined || v.linkedSceneNum !== undefined);

    if (!anyLinked) {
      const combined = [
        ...storyImages.map(img => ({ pos: img.pos, slot: { mediaType: 'image' as const, imagePrompt: img.prompt, duration: img.duration } })),
        ...videoAssets.map(vid => ({ pos: vid.pos, slot: { mediaType: 'video' as const, imagePrompt: vid.prompt, videoPrompt: vid.prompt, duration: vid.duration } })),
      ].sort((a, b) => a.pos - b.pos);
      for (const item of combined) slots.push(item.slot);
    } else {
      // Section 3 (all <image_prompt>) + Section 3B (linked <video_prompt>)
      for (const img of storyImages) {
        slots.push({
          mediaType: 'image',
          imagePrompt: img.prompt,
          duration: img.duration,
        });
      }

      for (const vid of videoAssets) {
        let targetIdx = -1;
        if (vid.linkedImageNum !== undefined) {
          targetIdx = storyImages.findIndex(img => img.assetNum === vid.linkedImageNum);
          if (targetIdx < 0 && vid.linkedImageNum >= 1 && vid.linkedImageNum <= slots.length) {
            targetIdx = vid.linkedImageNum - 1;
          }
        } else if (vid.linkedSceneNum !== undefined && vid.linkedSceneNum >= 1 && vid.linkedSceneNum <= slots.length) {
          targetIdx = vid.linkedSceneNum - 1;
        }

        if (targetIdx >= 0 && targetIdx < slots.length && slots[targetIdx].mediaType !== 'video') {
          slots[targetIdx] = {
            mediaType: 'video',
            imagePrompt: slots[targetIdx].imagePrompt,
            videoPrompt: vid.prompt,
            duration: vid.duration || slots[targetIdx].duration,
          };
        } else {
          slots.push({
            mediaType: 'video',
            imagePrompt: vid.prompt,
            videoPrompt: vid.prompt,
            duration: vid.duration,
          });
        }
      }
    }
  }

  // Optional: pick up authored SCENE N duration and chapter title hints if present in prose
  const sceneHints = new Map<number, { title?: string; duration?: number }>();
  const sceneHeadingMatches = [
    ...text.matchAll(/(?:^|\n)[ \t]*(?:#{1,6}[ \t]+)?(?:[^\p{L}\p{N}\n]*\s*)?\*{0,2}SCENE[ \t]+(\d+)\b[ \t]*(?:[—–:-][ \t]*([^\n*]+))?\*{0,2}([\s\S]*?)(?=(?:\n[ \t]*(?:#{1,6}[ \t]+)?(?:[^\p{L}\p{N}\n]*\s*)?\*{0,2}SCENE[ \t]+\d+\b|\n[ \t]*#{1,6}[ \t]+|<script\b|<image_prompt\b|(?![\s\S])))/giu),
  ];
  for (const m of sceneHeadingMatches) {
    const num = Number(m[1]);
    const rawTitle = (m[2] || '').replace(/\*\*/g, '').trim();
    const body = m[3] || '';
    const durMatch = body.match(/\*?\*?Duration\*?\*?\s*:\s*(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?\b/i);
    const dur = durMatch ? Number(durMatch[1]) : undefined;
    sceneHints.set(num, {
      title: rawTitle || undefined,
      duration: dur && Number.isFinite(dur) && dur > 0 && dur <= 60 ? dur : undefined,
    });
  }

  // 6. Distribute narration across all slots
  const narrations = distributeNarrationToScenes(rawNarration, slots.length);
  const scenes: NarrationScene[] = slots.map((slot, index) => {
    const num = index + 1;
    const hint = sceneHints.get(num);
    return {
      id: `scene_${String(num).padStart(3, '0')}`,
      chapter: hint?.title || `Scene ${num}`,
      role: 'story' as const,
      narration: narrations[index],
      mediaType: slot.mediaType,
      duration: slot.duration || hint?.duration || 5,
      imagePrompt: slot.imagePrompt,
      ...(slot.mediaType === 'video' ? { videoPrompt: slot.videoPrompt || slot.imagePrompt } : {}),
    };
  });

  const title =
    text.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]?.trim() ||
    text.match(/^#{1,6}\s+EPISODE\s*:\s*([^\n]+)/im)?.[1]?.replace(/\*\*/g, '').trim() ||
    text.match(/^(?:[-*+]\s+)?Title\s*:[ \t]*([^\n]+)/im)?.[1]?.replace(/\*\*/g, '').trim() ||
    'Generated Episode';

  const thumbnailPrompt = explicitThumbTag || thumbAsset?.prompt || scenes[0].imagePrompt;

  // Preserve trailing editorial/overlay/reflection sections after the last visual prompt tag
  let lastTagEnd = 0;
  for (const m of [...text.matchAll(/<\/(?:image_prompt|video_prompt|script|narration)\s*>/gi)]) {
    const end = (m.index ?? 0) + m[0].length;
    if (end > lastTagEnd) lastTagEnd = end;
  }
  const trailing = lastTagEnd > 0 ? text.slice(lastTagEnd).trim() : '';

  return {
    version: 1,
    title,
    thumbnailPrompt,
    scenes,
    ...(trailing ? { supportingNotes: trailing } : {}),
  };
}
