import type { ScenePlan } from './scene-plan.js';

const clean = (text: string) => text.replace(/\r/g, '').replace(/\*\*/g, '')
  .replace(/^([ \t]*)[*_]([\w /-]+:)[*_]/gm, '$1$2');
const normalized = (text: string) => text.normalize('NFC').replace(/\s+/g, ' ').trim();
const timeSeconds = (value: string) => value.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);

/** Convert numbered master-prompt output using explicit scene and asset links. */
export function parseLegacyScenePackage(raw: string): ScenePlan {
  const text = clean(raw);
  const voiceBlocks = [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  if (voiceBlocks.length !== 1 || !voiceBlocks[0][1].trim()) throw new Error('Include exactly one complete <script> block with the unchanged spoken narration.');
  const assets = new Map<string, { prompt: string; reference?: string; scene?: number; duration?: number; thumbnail: boolean; cta: boolean; endCard: boolean; independentVideo: boolean }>();
  for (const type of ['image', 'video'] as const) {
    const opens = (text.match(new RegExp(`<${type}_prompt\\b[^>]*>`, 'gi')) || []).length;
    const blocks = [...text.matchAll(new RegExp(`<${type}_prompt>\\s*#${type}\\s+(\\d+)\\b([\\s\\S]*?)</${type}_prompt\\s*>`, 'gi'))];
    if (opens !== blocks.length) throw new Error(`Every ${type} prompt needs a complete numbered <${type}_prompt> block.`);
    for (const block of blocks) {
      const id = `${type} ${Number(block[1])}`;
      // A bare tag inside a video reference points to the existing asset;
      // it is not a second prompt definition.
      if (assets.has(id) && !block[2].trim()) continue;
      if (assets.has(id)) throw new Error(`Duplicate asset #${id}.`);
      const fields = [...block[2].matchAll(/^(Prompt|Negative Prompt|Style Tags|Continuity Lock|Evidence\s*\/\s*Disclosure):[ \t]*(.*)$/gim)];
      const field = (name: string) => {
        const index = fields.findIndex(match => match[1].toLowerCase() === name.toLowerCase());
        if (index < 0) return '';
        return block[2].slice(fields[index].index! + fields[index][1].length + 1, fields[index + 1]?.index ?? block[2].length).trim();
      };
      const prompt = field('Prompt');
      if (!prompt) throw new Error(`Missing generation prompt for #${id}.`);
      const header = block[2].slice(0, fields[0]?.index ?? 0);
      const references = [...new Set([...header.matchAll(/(?:Reference Image|Related image tag):\s*#image\s+(\d+)/gi)].map(match => `image ${Number(match[1])}`))];
      if (type === 'video' && references.length !== 1) throw new Error(`#${id}: include one unambiguous Reference Image or Related image tag.`);
      const scene = header.match(/\bScene:\s*(\d+)/i)?.[1];
      const duration = header.match(/Target Usable Duration:\s*(\d+(?:\.\d+)?)\s*seconds?/i)?.[1];
      assets.set(id, { prompt: [prompt, ...['Negative Prompt', 'Style Tags', 'Continuity Lock'].map(name => field(name) ? `${name}:\n${field(name)}` : '')].filter(Boolean).join('\n\n'),
        reference: references[0], scene: scene ? Number(scene) : undefined, duration: duration ? Number(duration) : undefined,
        thumbnail: /\bTHUMBNAIL\b/i.test(header), cta: /\b(?:FOLLOW FRAME|CTA|END CARD)\b/i.test(header), endCard: /\bEND CARD\b/i.test(header),
        independentVideo: type === 'video' && /^Mode:[ \t]*TEXT_TO_VIDEO_ILLUSTRATION[ \t]*$/im.test(header) });
    }
  }
  const thumbnailEntries = [...assets.entries()]
    .filter(([, asset]) => asset.thumbnail)
    .sort((a, b) => Number(a[0].split(' ')[1]) - Number(b[0].split(' ')[1]));
  // The thumbnail is editorial metadata, never a reason to block extraction:
  // an explicitly THUMBNAIL-labeled block wins (lowest number on duplicates),
  // otherwise the first playback scene doubles as the thumbnail prompt.
  const explicitThumbnailPrompt = thumbnailEntries[0]?.[1].prompt;
  const scriptSection = text.match(/^#{1,6}\s+[^\n]*\bSECTION\s+1\b[^\n]*\n([\s\S]*?)(?=^#{1,6}\s+|(?![\s\S]))/im)?.[1];
  if (!scriptSection) throw new Error('Include SECTION 1 with explicitly numbered scenes and their Text narration.');
  const authoredScenes = [...scriptSection.matchAll(/^.*?\bSCENE\s+(\d+)\s*[–—-]\s*([^\n]+)\n([\s\S]*?)(?=^.*?\bSCENE\s+\d+\s*[–—-]|(?![\s\S]))/gim)];
  const manifest = text.match(/^#{1,6}\s+[^\n]*COVERAGE AND ASSET MANIFEST[^\n]*\n([\s\S]*?)(?=^#{1,6}\s+|(?![\s\S]))/im)?.[1];
  if (!manifest) throw new Error('Include a COVERAGE AND ASSET MANIFEST linking each scene to one image or video.');
  const rows = [...manifest.matchAll(/^[ \t]*\|?[ \t]*(\d{1,2}:\d{2}(?::\d{2})?)\s*[–—-]\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*\|\s*([^|]+)\|\s*([^|]+)\|/gim)];
  if (!authoredScenes.length || !rows.length) throw new Error('The manifest must cover every numbered script scene exactly once.');
  const readNarration = (body: string) => [...body.matchAll(/^Text:[ \t]*([\s\S]*?)(?=^(?:Tone|Speed|Pause|On-Screen Text|Source|LINE\s+\d+):|^```|(?![\s\S]))/gim)]
    .map(match => match[1].trim()).join('\n\n');
  const authored = authoredScenes.map((scene, index) => {
    if (Number(scene[1]) !== index + 1) throw new Error('Scene numbers must be unique and in narration order.');
    const lines: { number: number | undefined; narration: string }[] = [...scene[3].matchAll(/^LINE\s+(\d+):[ \t]*\n([\s\S]*?)(?=^LINE\s+\d+:|(?![\s\S]))/gim)]
      .map(line => ({ number: Number(line[1]), narration: readNarration(line[2]) }));
    if (lines.some(line => !line.narration) || (!lines.length && !readNarration(scene[3]))) throw new Error(`Scene ${scene[1]}: missing Text narration.`);
    return { number: Number(scene[1]), chapter: scene[2].trim(), lines: lines.length ? lines : [{ number: undefined, narration: readNarration(scene[3]) }] };
  });
  const expectedLines = authored.flatMap(scene => scene.lines);
  const numberedLines = expectedLines.filter(line => line.number !== undefined);
  if (new Set(numberedLines.map(line => line.number)).size !== numberedLines.length) throw new Error('Narration line numbers must be unique.');
  let cursor = 0;
  let nextLine = 0;
  let lastScene = 0;
  let endCardStarted = false;
  const scenes: ScenePlan['scenes'] = [];
  for (const row of rows) {
    const start = timeSeconds(row[1]), end = timeSeconds(row[2]);
    if (start !== cursor || end <= start) throw new Error(`${row[3].trim()}: manifest timing has a gap, overlap or invalid duration.`);
    cursor = end;
    // End-card holds after the complete voice script are editorial assets, not spoken scenes.
    if (/^End Card\s*$/i.test(row[3].trim())) {
      if (nextLine !== expectedLines.length) throw new Error('The end card must follow every spoken narration line.');
      const endCardLinks = [...row[4].matchAll(/#image\s+(\d+)/gi)];
      const endCard = endCardLinks.length === 1 ? assets.get(`image ${Number(endCardLinks[0][1])}`) : undefined;
      if (!endCard?.endCard || endCard.thumbnail) throw new Error('The end card needs one explicitly labeled end-card image.');
      endCardStarted = true;
      continue;
    }
    if (endCardStarted) throw new Error('Spoken scenes cannot follow an end-card hold.');
    const sceneNumber = Number(row[3].match(/^Scene\s+(\d+)\b/i)?.[1]);
    const sourceScene = authored[sceneNumber - 1];
    if (!sourceScene || (sceneNumber !== lastScene && sceneNumber !== lastScene + 1)) throw new Error('Scene numbers must be unique and in narration order, with consecutive rows for split scenes.');
    lastScene = sceneNumber;
    const lineRange = row[3].match(/\b(?:Lines?|L)\s*(\d+)\s*(?:[–—-]\s*(\d+))?/i);
    const selectedLines = lineRange ? sourceScene.lines.filter(line => line.number !== undefined && line.number >= Number(lineRange[1]) && line.number <= Number(lineRange[2] || lineRange[1])) : sourceScene.lines;
    if (!selectedLines.length || (lineRange && selectedLines.length !== Number(lineRange[2] || lineRange[1]) - Number(lineRange[1]) + 1)) throw new Error(`Scene ${sceneNumber}: the manifest references missing narration lines.`);
    for (const line of selectedLines) {
      if (line !== expectedLines[nextLine]) throw new Error(`Scene ${sceneNumber}: the manifest must cover each narration line exactly once and in order.`);
      nextLine++;
    }
    const links = [...new Set([...row[4].matchAll(/#(image|video)\s+(\d+)/gi)].map(match => `${match[1].toLowerCase()} ${Number(match[2])}`))];
    if (links.length !== 1) throw new Error(`Scene ${sceneNumber}: choose exactly one playback image or video in the manifest.`);
    const id = links[0], asset = assets.get(id);
    if (!asset || asset.thumbnail) throw new Error(`Scene ${sceneNumber}: missing or invalid playback asset #${id}.`);
    const image = id.startsWith('video') ? assets.get(asset.reference!) : asset;
    if (!image || image.thumbnail) throw new Error(`#${id}: reference image is missing or invalid.`);
    if ([asset, image].some(item => item.scene !== undefined && item.scene !== sceneNumber)) throw new Error(`Scene ${sceneNumber}: asset and reference image scene links disagree.`);
    if (!asset.independentVideo && asset.duration !== undefined && asset.duration !== end - start) throw new Error(`#${id}: usable duration differs from the manifest.`);
    const narration = selectedLines.map(line => line.narration).join('\n\n');
    scenes.push({ id: `scene_${String(scenes.length + 1).padStart(3, '0')}`, chapter: sourceScene.chapter, role: asset.cta ? 'cta' : 'story', narration,
      imagePrompt: image.prompt, mediaType: id.startsWith('video') ? 'video' : 'image', duration: asset.independentVideo && asset.duration !== undefined ? asset.duration : end - start,
      ...(id.startsWith('video') ? { videoPrompt: asset.prompt } : {}) });
  }
  if (nextLine !== expectedLines.length) throw new Error('The manifest must cover every numbered script scene and narration line exactly once.');
  if (normalized(scenes.map(scene => scene.narration).join(' ')) !== normalized(voiceBlocks[0][1])) throw new Error('The complete voice script differs from the scene narration. Correct the words before extracting; formatting never rewrites narration.');
  const titleOptions = text.match(/^#{1,6}\s+[^\n]*\bTITLE OPTIONS\b[^\n]*\n([\s\S]*?)(?=^#{1,6}\s+|(?![\s\S]))/im)?.[1];
  const title = text.match(/^(?:[-*+]\s+)?Title:[ \t]*([^\n]+)/im)?.[1].trim()
    || titleOptions?.match(/^\s*1[.)][ \t]+([^\n]+)/m)?.[1].trim();
  if (!title) throw new Error('Include a Title field or a numbered TITLE OPTIONS publishing section.');
  if (!scenes.length) throw new Error('The manifest must cover every numbered script scene exactly once.');
  return { version: 1, title, thumbnailPrompt: explicitThumbnailPrompt ?? scenes[0].imagePrompt, scenes };
}
