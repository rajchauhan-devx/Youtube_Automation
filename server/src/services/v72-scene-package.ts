import type { ScenePlan } from './scene-plan.js';

const cleanInline = (text: string) =>
  text.replace(/\r/g, '').replace(/\*\*/g, '').normalize('NFC').replace(/\s+/g, ' ').trim();

/** Spoken text only: the voiced script carries ElevenLabs (break)/(pause)
 * markers which the app's narration model does not support. */
const stripBreaks = (text: string) => text.replace(/\s*\((?:break|pause)\)/gi, ' ').replace(/\s+/g, ' ').trim();

const LABEL_LINES = /^(Duration|Emotion|Visual|Camera|Tone|Speed|Pause|On-Screen Text|Text)\s*:/i;

/** Convert split-architecture master-prompt output (SCRIPT PROMPT scenes plus
 * numbered <image_prompt> asset blocks, e.g. Ramayana merged prompt v7.2).
 * Every visual asset is a still image: scenes always use mediaType image. */
export function parseV72ScenePackage(raw: string): ScenePlan {
  const text = raw.replace(/\r/g, '');
  const voiceBlocks = [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  if (voiceBlocks.length !== 1 || !voiceBlocks[0][1].trim()) {
    throw new Error('Include exactly one complete <script> block with the unchanged spoken narration.');
  }

  // Each scene body ends at the next scene heading, at the next markdown
  // section heading (SECTION 2B, PART 4, ...), or at the absolute end of the
  // response — (?![\s\S]) is used instead of $ so multiline matching cannot
  // stop the body at the first line break.
  const sceneMatches = [...text.matchAll(/\u{1F3AC}\s*SCENE\s+(\d+)\s*[—–-]\s*([^\n]+)\n([\s\S]*?)(?=\u{1F3AC}\s*SCENE\s+\d+\s*[—–-]|^#{1,6}\s+\S|(?![\s\S]))/gimu)];
  if (!sceneMatches.length) {
    throw new Error('Include SECTION 1 with numbered scenes in the "<emoji> SCENE N — Title" format, each with Duration and Line narration.');
  }
  const scenes: { number: number; chapter: string; narration: string; duration: number }[] = [];
  sceneMatches.forEach((match, index) => {
    const number = Number(match[1]);
    if (number !== index + 1) throw new Error('Scene numbers must be unique and in narration order.');
    const chapter = cleanInline(match[2]);
    if (!chapter) throw new Error(`Scene ${number}: missing scene title.`);
    const body = match[3];
    const duration = body.match(/^Duration\s*:\s*(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?/im)?.[1];
    const seconds = duration ? Number(duration) : 10;
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60) {
      throw new Error(`Scene ${number}: planning duration must be between 0 and 60 seconds.`);
    }
    // Narration is the Line N: text (template variant: a Text: line). Later
    // metadata lines (Tone/Speed/Pause/On-Screen Text) never leak into speech.
    const narrationParts: string[] = [];
    let inText = false;
    for (const line of body.split('\n')) {
      if (!line.trim()) continue;
      // Stray markdown (empty headings, horizontal rules) ends the spoken
      // block; it is never narration.
      if (/^\s*#{1,6}\s*$/.test(line) || /^\s*(---|\*\*\*|___)\s*$/.test(line)) { inText = false; continue; }
      const lineMatch = line.match(/^\s*Line\s+\d+\s*:\s*(.*)$/i);
      if (lineMatch) {
        if (narrationParts.length) throw new Error(`Scene ${number}: missing Text narration.`);
        if (lineMatch[1].trim()) { narrationParts.push(lineMatch[1]); inText = true; continue; }
        inText = true; continue;
      }
      const textMatch = line.match(/^\s*Text\s*:\s*(.*)$/i);
      if (textMatch) {
        if (textMatch[1].trim()) narrationParts.push(textMatch[1]);
        inText = true; continue;
      }
      if (inText && line.trim() && !LABEL_LINES.test(line)) narrationParts.push(line.trim());
      else if (LABEL_LINES.test(line)) inText = false;
    }
    const narration = stripBreaks(cleanInline(narrationParts.join(' ')));
    if (!narration) throw new Error(`Scene ${number}: missing Text narration.`);
    scenes.push({ number, chapter, narration, duration: seconds });
  });

  // Numbered asset blocks: <image_prompt> #image N. The body may use labeled
  // Prompt/Negative/Style fields or bare copy-paste-ready prose after a
  // caption line such as "IMAGE 1 — THE ARCHITECT".
  const opens = (text.match(/<image_prompt\b[^>]*>/gi) || []).length;
  const blocks = [...text.matchAll(/<image_prompt>([\s\S]*?)<\/image_prompt\s*>/gi)];
  if (opens !== blocks.length) throw new Error('Every image prompt needs a complete <image_prompt> block.');
  const assets = new Map<number, { prompt: string; thumbnail: boolean; follow: boolean; endCard: boolean; scene?: number }>();
  const numberOf = (block: string) => block.match(/#image\s+(\d+)\s*(?:[A-C])?\b/i)?.[1];
  for (const block of blocks) {
    const id = numberOf(block[1]);
    if (id === undefined) throw new Error('Every <image_prompt> block needs a #image N number.');
    const key = Number(id);
    if (assets.has(key)) throw new Error(`Duplicate asset #image ${id}.`);
    const fields = [...block[1].matchAll(/^(Prompt|Negative Prompt|Style Tags|Continuity Lock):[ \t]*(.*)$/gim)];
    const field = (name: string) => {
      const index = fields.findIndex(match => match[1].toLowerCase() === name.toLowerCase());
      if (index < 0) return '';
      // Slice from the end of the label itself (match[1]); match[0] also
      // spans the rest of the line, which would swallow same-line prose.
      return block[1].slice(fields[index].index! + fields[index][1].length + 1, fields[index + 1]?.index ?? block[1].length).trim();
    };
    let prompt = [field('Prompt'), ...['Negative Prompt', 'Style Tags', 'Continuity Lock'].map(name => field(name) ? `${name}:\n${field(name)}` : '')].filter(Boolean).join('\n\n');
    const header = cleanInline(block[1].slice(0, fields[0]?.index ?? 0));
    // Editorial flags come from the caption area only: for untagged blocks
    // that is the dropped caption line, so words like "follow" inside the
    // prompt prose itself can never misfire.
    // (Untagged blocks start flagless; only an explicitly shifted caption
    // line carries flags.)
    let caption = fields.length ? header : '';
    if (!prompt && fields.length === 0) {
      // Untagged block: body prose is the prompt. Drop a leading caption
      // line ("IMAGE 1 — TITLE" / thumbnail label) so editor labels never
      // reach the image model.
      const lines = block[1].split('\n').map(line => line.trim());
      while (lines.length && !lines[0]) lines.shift();
      while (lines.length && !lines[lines.length - 1]) lines.pop();
      // The #image N addressing line carries the block number (already read
      // above) and is never prompt content.
      if (lines.length && new RegExp(`^#image\\s+${id}\\b`, 'i').test(lines[0])) lines.shift();
      while (lines.length && !lines[0]) lines.shift();
      // Same-line caption: "IMAGE 7 — FOLLOW FRAME A dark ..." carries an
      // ALL-CAPS label directly followed by sentence-case prompt prose.
      // Split it so the label feeds the flags and never the image model.
      // Leading symbols are stripped first so no emoji literal is needed.
      const deprefixed = lines[0]?.replace(/^[^\p{L}\p{N}]+/u, '') || '';
      const sameLine = deprefixed.match(/^IMAGE\s+\d+\s*[—–-]\s*([A-Z][A-Z0-9 '&-]{1,40}?[A-Z0-9])\s+(?=[A-Z][a-z"“])/);
      if (sameLine) {
        caption = sameLine[1].trim();
        lines[0] = deprefixed.slice(sameLine[0].length).trim();
        if (!lines[0]) lines.shift();
      }
      if (lines.length > 1 && lines[0].length < 120 &&
          (/image\s+\d+/i.test(lines[0]) || /\bthumbnail\b/i.test(lines[0]) || /^[-—–\s]*$/.test(lines[0]))) {
        caption = lines.shift()!;
      } else if (lines.length === 1 && /image\s+\d+\s*[—–-]/i.test(lines[0])) {
        // A block holding nothing but its caption line has no prompt.
        caption = lines.shift()!;
      }
      const sceneLink = block[1].match(/\(Scene\s*:\s*(\d+)/i)?.[1];
      // A bare #image N number line is addressing, not prompt content.
      if (lines.length && new RegExp(`^#image\\s+${id}\\b`, 'i').test(lines[0])) lines.shift();
      prompt = cleanInline(lines.join('\n'));
      if (sceneLink) {
        assets.set(key, { prompt, thumbnail: false, follow: false, endCard: false, scene: Number(sceneLink) });
        if (!prompt) throw new Error(`Missing generation prompt for #image ${id}.`);
        continue;
      }
    }
    if (!prompt) throw new Error(`Missing generation prompt for #image ${id}.`);
    assets.set(key, {
      prompt,
      thumbnail: /\bTHUMBNAIL\b/i.test(caption),
      follow: /\bFOLLOW\b/i.test(caption),
      endCard: /\bEND CARD\b/i.test(caption),
      scene: block[1].match(/\(Scene\s*:\s*(\d+)/i)?.[1] ? Number(block[1].match(/\(Scene\s*:\s*(\d+)/i)![1]) : undefined,
    });
  }

  // The thumbnail is editorial metadata, never a reason to block extraction:
  // an explicitly THUMBNAIL-labeled block wins (lowest number on duplicates),
  // else the conventional #image 0 — but only when it is surplus beyond the
  // scene count, so 0-based story numbering is never eaten. With no cover at
  // all the first scene's image doubles as the thumbnail prompt.
  const orderedKeys = [...assets.keys()].sort((a, b) => a - b);
  const visualKeys = orderedKeys.filter(key => !assets.get(key)!.follow && !assets.get(key)!.endCard);
  const explicitKey = orderedKeys.find(key => assets.get(key)!.thumbnail);
  const coverKey = explicitKey ?? (assets.has(0) && visualKeys.length > scenes.length ? 0 : undefined);

  const storyKeys = visualKeys.filter(key => key !== coverKey);
  // Explicit (Scene: N) links win; the rest map positionally in visual order.
  const byScene = new Map<number, number[]>();
  const unlinked: number[] = [];
  for (const key of storyKeys) {
    const link = assets.get(key)!.scene;
    if (link === undefined) { unlinked.push(key); continue; }
    if (link < 1 || link > scenes.length) throw new Error(`#image ${key} links Scene ${link}, but SECTION 1 has ${scenes.length} scenes.`);
    byScene.set(link, [...(byScene.get(link) || []), key]);
  }
  const linkedScenes = new Set(byScene.keys());
  const freeScenes = scenes.map(scene => scene.number).filter(number => !linkedScenes.has(number));
  if (unlinked.length > freeScenes.length) {
    throw new Error(`Found ${unlinked.length} unlinked story images but only ${freeScenes.length} scenes without images. Link images with (Scene: N) or regenerate.`);
  }
  unlinked.forEach((key, index) => {
    byScene.set(freeScenes[index], [key]);
  });
  for (const scene of scenes) {
    const keys = byScene.get(scene.number) || [];
    if (!keys.length) throw new Error(`Scene ${scene.number} has no linked image. Link one with (Scene: ${scene.number}) or regenerate.`);
    if (keys.length > 1) {
      throw new Error(`Scene ${scene.number} links ${keys.length} images; the pipeline needs one image per scene. Regenerate with one image per scene or split the narration.`);
    }
  }

  const planScenes: ScenePlan['scenes'] = scenes.map((scene, index) => ({
    id: `scene_${String(index + 1).padStart(3, '0')}`,
    chapter: scene.chapter,
    role: 'story' as const,
    narration: scene.narration,
    mediaType: 'image' as const,
    duration: scene.duration,
    imagePrompt: assets.get(byScene.get(scene.number)![0])!.prompt,
  }));

  // Supporting editorial sections (overlays, reflection) travel as notes.
  const supporting: string[] = [];
  for (const name of ['(?:HINDI|ENGLISH)?\\s*TEXT OVERLAYS', 'REFLECTION ENGINE']) {
    const section = text.match(new RegExp(`^#{1,6}\\s+[^\\n]*${name}[^\\n]*\\n([\\s\\S]*?)(?=^#{1,6}\\s+|$)`, 'im'))?.[1]?.trim();
    if (section) supporting.push(section);
  }

  // Responses carry their own episode title ("EPISODE: ...") when the
  // template requests one; otherwise any non-empty title validates.
  const episodeTitle = cleanInline(text.match(/^#{1,6}\s+EPISODE\s*:\s*([^\n]+)/im)?.[1] || '');

  return {
    version: 1,
    title: episodeTitle || 'Untitled episode',
    thumbnailPrompt: coverKey !== undefined ? assets.get(coverKey)!.prompt : planScenes[0].imagePrompt,
    scenes: planScenes,
    ...(supporting.length ? { supportingNotes: supporting.join('\n\n') } : {}),
  };
}
