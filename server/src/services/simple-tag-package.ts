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
  sceneTitle?: string;
  isThumbnail: boolean;
  isFollowFrame: boolean;
  isEndCard: boolean;
}

const METADATA_LINE = /^(?:ASSET|TIMELINE|DURATION|PURPOSE|Scene|Mode|Characters|Location|Evidence\s*\/\s*Disclosure|Reference Image|Related image tag|Target Usable Duration|Audio|Shot Type|Camera Movement)\s*:/i;

function parseVisualBlock(rawBlock: string, kind: 'image' | 'video', pos: number, tagNum?: number): ParsedVisualAsset | null {
  // Strip any nested or stray XML tags that an LLM might have hallucinated inside
  const tagStripped = rawBlock.replace(/<\/?(?:image_prompt|video_prompt)\d*\b[^>]*>/gi, '');
  const cleaned = tagStripped.replace(/\r/g, '').replace(/\*\*/g, '').trim();
  if (!cleaned) return null;

  const assetMatch = cleaned.match(new RegExp(`#${kind}\\s+(\\d+)\\b`, 'i'))
    || cleaned.match(new RegExp(`\\bASSET\\s*:\\s*${kind}\\s+(\\d+)`, 'i'))
    || cleaned.match(/#(?:image|video)\s+(\d+)\b/i);
  const assetNum = tagNum !== undefined ? tagNum : (assetMatch ? Number(assetMatch[1]) : undefined);

  const linkedImageMatch = cleaned.match(/(?:Related image tag|Reference Image)\s*:\s*#image\s+(\d+)\b/i)
    || (kind === 'video' ? cleaned.match(/#image\s+(\d+)\b/i) : null);
  const linkedImageNum = linkedImageMatch ? Number(linkedImageMatch[1]) : undefined;

  const linkedSceneMatch = cleaned.match(/(?:^|\n|\()\s*Scene\s*:\s*(\d+)\b/i)
    || cleaned.match(/#(?:image|video)\s+\d+\s*[—–-]+\s*SCENE\s+(\d+)\b/i);
  const linkedSceneNum = linkedSceneMatch ? Number(linkedSceneMatch[1]) : undefined;

  const durationMatch = cleaned.match(/(?:Target Usable Duration|DURATION|Duration)\s*:\s*(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?\b/i)
    || cleaned.match(/\b(?:VIDEO CLIP|DURATION)\s*\(\s*(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?\s*\)/i);
  const rawDuration = durationMatch ? Number(durationMatch[1]) : undefined;
  const duration = rawDuration && Number.isFinite(rawDuration) && rawDuration > 0 && rawDuration <= 60 ? rawDuration : undefined;

  const sceneTitleMatch = cleaned.match(/(?:^|\n)\s*SCENE\s*:\s*([^\n]+)/i)
    || cleaned.match(/#(?:image|video)\s+\d+\s*[—–-]+\s*SCENE\s+(?:(?:\d+\s*[—–-]\s*)?([^\n]+))/i);
  const rawSceneTitle = sceneTitleMatch ? sceneTitleMatch[1].replace(/^[0-9]+\s*[—–-]\s*/, '').trim() : undefined;
  const sceneTitle = rawSceneTitle && rawSceneTitle.length <= 100 && !/^(?:THUMBNAIL|STATIC IMAGE|VIDEO CLIP)/i.test(rawSceneTitle)
    ? rawSceneTitle
    : undefined;

  // Check if block uses labeled fields (Prompt:, Shot Behavior:, Negative Prompt:, Style Tags:, Continuity Lock:, etc.)
  const fieldMatches = [...cleaned.matchAll(
    /^(Prompt|Shot\s+Behavior|Negative(?:\s+Prompt)?|Style(?:\s+Tags)?|Visual\s+Style|Style|Continuity(?:\s+Lock)?|Character\s+Consistency|Characters|Temporal\s+Constraints|Location|Action\s*\/\s*Moment|Atmosphere|Lighting|Camera)\s*:[ \t]*(.*)$/gim
  )];

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
    let mainPrompt = getField(/^(?:Prompt|Shot\s+Behavior)$/i);
    if (!mainPrompt && headerText.trim()) {
      const headerLines = headerText.split('\n').map(l => l.trim()).filter(Boolean);
      const bodyLines = headerLines.filter(line => !METADATA_LINE.test(line) && !/^#(?:image|video)\s+\d+\b/i.test(line) && !/^(?:IMAGE|VIDEO)\s+\d+[A-Z]?\b/i.test(line));
      mainPrompt = bodyLines.join('\n').trim();
    }
    const continuity = getField(/^(?:Continuity|Character|Characters)/i);
    const location = getField(/^Location$/i);
    const action = getField(/^Action/i);
    const negative = getField(/^Negative/i);
    const style = getField(/^(?:Style|Visual\s+Style)/i);
    const temporal = getField(/^Temporal/i);

    prompt = [
      mainPrompt,
      action ? `Action:\n${action}` : '',
      location ? `Location:\n${location}` : '',
      continuity ? `Continuity Lock:\n${continuity}` : '',
      temporal ? `Temporal Constraints:\n${temporal}` : '',
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
        if (!rest || (rest.length < 45 && /^(?:THUMBNAIL|SCENE\s+\d+|FOLLOW\s*FRAME|END\s*CARD|IMAGE\s+\d+|VIDEO\s+\d+)/i.test(rest))) {
          headerText += ' ' + rest;
          lines.shift();
        } else {
          lines[0] = rest;
        }
      }
    }

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

  // Clean any remaining XML tag artifacts or trailing thumbnail text
  prompt = prompt.replace(/<\/?(?:image_prompt|video_prompt)\d*\b[^>]*>/gi, '').trim();

  const isThumbnail = (assetNum === 0) || /\bTHUMBNAIL\b/i.test(headerText) || /\bTHUMBNAIL\b/i.test(cleaned.slice(0, 100));
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
    sceneTitle,
    isThumbnail,
    isFollowFrame,
    isEndCard,
  };
}

export function isImageOnlyTemplate(template: string): boolean {
  if (!template) return false;
  if (/IMAGE[- ]ONLY/i.test(template)) return true;
  if (/ALL STILL[- ]IMAGE/i.test(template)) return true;
  if (/NO video(?:[,\s]+motion)?\s+prompts?/i.test(template)) return true;
  if (/Zero video generation/i.test(template)) return true;
  if (/Only TWO tag types are used/i.test(template)) return true;
  if (!/<video_prompt/i.test(template) && /<image_prompt/i.test(template)) return true;
  return false;
}

/**
 * Universal tag extractor for all profiles:
 * Looks for:
 *  1. <script>...</script> (or <narration>...</narration>)
 *  2. <image_prompt[N]>...</image_prompt[N]> (with N=0 for thumbnail, N>=1 for scenes)
 *  3. <video_prompt[N]>...</video_prompt[N]> (chronological index N for video scenes)
 */
export function parseSimpleTagPackage(raw: string, options?: { isImageOnly?: boolean }): ScenePlan {
  const text = raw.replace(/\r/g, '');
  const imageOnly = options?.isImageOnly === true;

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
    const voiceSection = text.match(/^#{1,6}\s+[^\n]*FINAL CLEAN VOICE SCRIPT[^\n]*\n([\s\S]*?)(?=^#{1,6}\s+|\n---\s*\n|(?![\s\S]))/im)?.[1]?.trim();
    if (voiceSection) rawNarration = voiceSection;
  }

  if (!rawNarration) {
    throw new Error('Missing narration tag: wrap the spoken voiceover in <script>...</script> (or <narration>...</narration>).');
  }

  // 2. Extract Visual Assets (<image_prompt[N]> and <video_prompt[N]>)
  const visualAssets: ParsedVisualAsset[] = [];
  const tagRegex = /<(image_prompt|video_prompt)(\d+)?\b[^>]*>([\s\S]*?)<\/(?:image_prompt|video_prompt)(?:\d+)?\s*>/gi;
  for (const m of text.matchAll(tagRegex)) {
    const kind = m[1].toLowerCase().startsWith('video') ? 'video' : 'image';
    const tagNum = m[2] !== undefined ? Number(m[2]) : undefined;
    const parsed = parseVisualBlock(m[3], kind, m.index ?? 0, tagNum);
    if (parsed) visualAssets.push(parsed);
  }

  // Fallback if the AI wrote bare "#image 1: ..." blocks without wrapper tags
  if (visualAssets.length === 0) {
    const bareImageMatches = [
      ...text.matchAll(/(?:^|\n)[ \t]*(?:\*{1,2})?(#image[ \t]+\d+[A-Z]?\b[\s\S]*?)(?=(?:\n[ \t]*(?:\*{1,2})?#(?:image|video)[ \t]+\d+\b|\n[ \t]*#{1,6}[ \t]+\S|\n[ \t]*---+[ \t]*(?:\n|$)|(?![\s\S])))/gi),
    ];
    for (const m of bareImageMatches) {
      const parsed = parseVisualBlock(m[1], 'image', m.index ?? 0);
      if (parsed && parsed.prompt.length >= 15) visualAssets.push(parsed);
    }

    const bareVideoMatches = [
      ...text.matchAll(/(?:^|\n)[ \t]*(?:\*{1,2})?(#video[ \t]+\d+[A-Z]?\b[\s\S]*?)(?=(?:\n[ \t]*(?:\*{1,2})?#(?:image|video)[ \t]+\d+\b|\n[ \t]*#{1,6}[ \t]+\S|\n[ \t]*---+[ \t]*(?:\n|$)|(?![\s\S])))/gi),
    ];
    for (const m of bareVideoMatches) {
      const parsed = parseVisualBlock(m[1], 'video', m.index ?? 0);
      if (parsed && parsed.prompt.length >= 15) visualAssets.push(parsed);
    }
  }

  // Fallback for legacy <long_video>ASSET: IMAGE/VIDEO ...</long_video> blocks
  if (visualAssets.length === 0) {
    const legacyBlocks = [...text.matchAll(/<long_video\b[^>]*>([\s\S]*?)<\/long_video\s*>/gi)];
    for (const m of legacyBlocks) {
      if (/^\s*(?:\*\*)?ASSET\s*:\s*(?:IMAGE|THUMBNAIL)/im.test(m[1])) {
        const parsed = parseVisualBlock(m[1], 'image', m.index ?? 0);
        if (parsed) visualAssets.push(parsed);
      } else if (/^\s*(?:\*\*)?ASSET\s*:\s*VIDEO/im.test(m[1])) {
        const parsed = parseVisualBlock(m[1], 'video', m.index ?? 0);
        if (parsed) visualAssets.push(parsed);
      }
    }
  }

  if (visualAssets.length === 0) {
    throw new Error(
      imageOnly
        ? 'Missing visual prompt tags: include sequentially numbered <image_prompt0> (thumbnail) and <image_prompt1> to <image_prompt[N]> tags.'
        : 'Missing visual prompt tags: include sequentially numbered <image_prompt[N]> tags (and <video_prompt[N]> for video shots).'
    );
  }

  // 3. Separate Thumbnail from story assets
  const explicitThumbTag = text.match(/<thumbnail_prompt\b[^>]*>([\s\S]*?)<\/thumbnail_prompt\s*>/i)?.[1]?.trim();
  const thumbAsset = visualAssets.find(a => a.isThumbnail || a.assetNum === 0);
  let storyAssets = visualAssets.filter(a => a !== thumbAsset && !a.isThumbnail && a.assetNum !== 0 && !a.isEndCard && !a.isFollowFrame);
  if (storyAssets.length === 0) {
    storyAssets = visualAssets.filter(a => a !== thumbAsset && !a.isThumbnail && a.assetNum !== 0 && !a.isEndCard);
  }
  // If only 1 asset was supplied and it was marked as thumb, treat it as story asset
  if (storyAssets.length === 0 && visualAssets.length > 0) {
    storyAssets.push(visualAssets[0]);
  }

  const rawThumbPrompt = explicitThumbTag
    || (thumbAsset ? thumbAsset.prompt.replace(/THUMBNAIL TEXT:[^\n]*/i, '').trim() : undefined)
    || (storyAssets.length > 0 ? storyAssets[0].prompt : 'Episode Thumbnail');
  const thumbnailPrompt = rawThumbPrompt.replace(/<\/?(?:image_prompt|video_prompt)\d*\b[^>]*>/gi, '').trim();

  // 4. Build ordered visual slots
  interface VisualSlot {
    index: number;
    mediaType: 'image' | 'video';
    imagePrompt: string;
    videoPrompt?: string;
    duration?: number;
    sceneTitle?: string;
    isFollowFrame?: boolean;
  }

  const slotMap = new Map<number, VisualSlot>();

  // Pass 1: Assign image assets by assetNum
  storyAssets.forEach((asset, idx) => {
    const num = asset.assetNum && asset.assetNum > 0 ? asset.assetNum : (idx + 1);

    if (asset.kind === 'image') {
      const existing = slotMap.get(num);
      if (existing) {
        existing.imagePrompt = asset.prompt;
        if (asset.duration) existing.duration = asset.duration;
        if (asset.sceneTitle) existing.sceneTitle = asset.sceneTitle;
      } else {
        slotMap.set(num, {
          index: num,
          mediaType: 'image',
          imagePrompt: asset.prompt,
          duration: asset.duration,
          sceneTitle: asset.sceneTitle,
          isFollowFrame: asset.isFollowFrame,
        });
      }
    }
  });

  // Pass 2: Assign video assets (link to existing slot or create new video slot)
  storyAssets.filter(a => a.kind === 'video').forEach((vid, idx) => {
    let targetNum: number | undefined = vid.linkedImageNum ?? vid.linkedSceneNum;
    if (targetNum === undefined && vid.assetNum && vid.assetNum > 0) {
      targetNum = vid.assetNum;
    }

    if (imageOnly) {
      // Image-only mode: NEVER upgrade or override scenes to video.
      if (targetNum !== undefined && slotMap.has(targetNum)) {
        const existing = slotMap.get(targetNum)!;
        if (vid.duration && !existing.duration) existing.duration = vid.duration;
        if (vid.sceneTitle && !existing.sceneTitle) existing.sceneTitle = vid.sceneTitle;
      } else {
        const num = targetNum ?? (vid.assetNum && vid.assetNum > 0 ? vid.assetNum : (slotMap.size + idx + 1));
        slotMap.set(num, {
          index: num,
          mediaType: 'image',
          imagePrompt: vid.prompt,
          duration: vid.duration,
          sceneTitle: vid.sceneTitle,
          isFollowFrame: vid.isFollowFrame,
        });
      }
      return;
    }

    if (targetNum !== undefined && slotMap.has(targetNum)) {
      const existing = slotMap.get(targetNum)!;
      existing.mediaType = 'video';
      existing.videoPrompt = vid.prompt;
      if (vid.duration) existing.duration = vid.duration;
      if (vid.sceneTitle && !existing.sceneTitle) existing.sceneTitle = vid.sceneTitle;
    } else {
      const num = targetNum ?? (vid.assetNum && vid.assetNum > 0 ? vid.assetNum : (slotMap.size + idx + 1));
      slotMap.set(num, {
        index: num,
        mediaType: 'video',
        imagePrompt: vid.prompt,
        videoPrompt: vid.prompt,
        duration: vid.duration,
        sceneTitle: vid.sceneTitle,
        isFollowFrame: vid.isFollowFrame,
      });
    }
  });

  const slots = [...slotMap.values()].sort((a, b) => a.index - b.index);

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

  // 5. Distribute narration across all slots
  const narrations = distributeNarrationToScenes(rawNarration, slots.length);
  const scenes: NarrationScene[] = slots.map((slot, index) => {
    const num = index + 1;
    const hint = sceneHints.get(num);
    return {
      id: `scene_${String(num).padStart(3, '0')}`,
      chapter: slot.sceneTitle || hint?.title || `Scene ${num}`,
      role: slot.isFollowFrame ? ('cta' as const) : ('story' as const),
      narration: narrations[index],
      mediaType: slot.mediaType,
      duration: slot.duration || hint?.duration || (slot.mediaType === 'video' ? 8 : 5),
      imagePrompt: slot.imagePrompt,
      ...(slot.mediaType === 'video' ? { videoPrompt: slot.videoPrompt || slot.imagePrompt } : {}),
    };
  });

  const title =
    text.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]?.trim() ||
    text.match(/^#{1,6}\s+EPISODE\s*:\s*([^\n]+)/im)?.[1]?.replace(/\*\*/g, '').trim() ||
    text.match(/^(?:[-*+]\s+)?Title\s*:[ \t]*([^\n]+)/im)?.[1]?.replace(/\*\*/g, '').trim() ||
    'Generated Episode';

  // Preserve trailing editorial/overlay/reflection sections after the last visual prompt tag
  let lastTagEnd = 0;
  for (const m of [...text.matchAll(/<\/(?:image_prompt\d*|video_prompt\d*|script|narration)\s*>/gi)]) {
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
