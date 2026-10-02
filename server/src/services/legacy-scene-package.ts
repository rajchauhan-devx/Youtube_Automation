import type { ScenePlan } from './scene-plan.js';

const clean = (text: string) => text.replace(/\r/g, '').replace(/\*\*/g, '');
const normalized = (text: string) => text.normalize('NFC').replace(/\s+/g, ' ').trim();
const timeSeconds = (value: string) => value.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);

/** Convert numbered master-prompt output using explicit scene and asset links. */
export function parseLegacyScenePackage(raw: string): ScenePlan {
  const text = clean(raw);
  const voiceBlocks = [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  if (voiceBlocks.length !== 1 || !voiceBlocks[0][1].trim()) throw new Error('Include exactly one complete <script> block with the unchanged spoken narration.');
  const assets = new Map<string, { prompt: string; reference?: string; scene?: number; duration?: number; thumbnail: boolean }>();
  for (const type of ['image', 'video'] as const) {
    const opens = (text.match(new RegExp(`<${type}_prompt\\b[^>]*>`, 'gi')) || []).length;
    const blocks = [...text.matchAll(new RegExp(`<${type}_prompt>\\s*#${type}\\s+(\\d+)\\b([\\s\\S]*?)</${type}_prompt\\s*>`, 'gi'))];
    if (opens !== blocks.length) throw new Error(`Every ${type} prompt needs a complete numbered <${type}_prompt> block.`);
    for (const block of blocks) {
      const id = `${type} ${Number(block[1])}`;
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
        reference: references[0], scene: scene ? Number(scene) : undefined, duration: duration ? Number(duration) : undefined, thumbnail: /\bTHUMBNAIL\b/i.test(header) });
    }
  }
  const thumbnails = [...assets.values()].filter(asset => asset.thumbnail);
  if (thumbnails.length !== 1) throw new Error('Include exactly one separately labeled THUMBNAIL image prompt.');
  const scriptSection = text.match(/^#{1,6}\s+[^\n]*\bSECTION\s+1\b[^\n]*\n([\s\S]*?)(?=^#{1,6}\s+|(?![\s\S]))/im)?.[1];
  if (!scriptSection) throw new Error('Include SECTION 1 with explicitly numbered scenes and their Text narration.');
  const authoredScenes = [...scriptSection.matchAll(/^.*?\bSCENE\s+(\d+)\s*[–—-]\s*([^\n]+)\n([\s\S]*?)(?=^.*?\bSCENE\s+\d+\s*[–—-]|(?![\s\S]))/gim)];
  const manifest = text.match(/^#{1,6}\s+[^\n]*COVERAGE AND ASSET MANIFEST[^\n]*\n([\s\S]*?)(?=^#{1,6}\s+|(?![\s\S]))/im)?.[1];
  if (!manifest) throw new Error('Include a COVERAGE AND ASSET MANIFEST linking each scene to one image or video.');
  const rows = [...manifest.matchAll(/^(\d{1,2}:\d{2}(?::\d{2})?)\s*[–—-]\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*\|\s*Scene\s+(\d+)[^|]*\|\s*([^|]+)\|/gim)];
  if (!authoredScenes.length || rows.length !== authoredScenes.length) throw new Error('The manifest must cover every numbered script scene exactly once.');
  let cursor = 0;
  const used = new Set<string>();
  const scenes = rows.map((row, index) => {
    const sceneNumber = Number(row[3]);
    const authored = authoredScenes[index];
    if (sceneNumber !== index + 1 || Number(authored[1]) !== sceneNumber) throw new Error('Scene numbers must be unique and in narration order.');
    const start = timeSeconds(row[1]), end = timeSeconds(row[2]);
    if (start !== cursor || end <= start) throw new Error(`Scene ${sceneNumber}: manifest timing has a gap, overlap or invalid duration.`);
    const links = [...new Set([...row[4].matchAll(/#(image|video)\s+(\d+)/gi)].map(match => `${match[1].toLowerCase()} ${Number(match[2])}`))];
    if (links.length !== 1) throw new Error(`Scene ${sceneNumber}: choose exactly one playback image or video in the manifest.`);
    const id = links[0], asset = assets.get(id);
    if (!asset || asset.thumbnail) throw new Error(`Scene ${sceneNumber}: missing or invalid playback asset #${id}.`);
    if (used.has(id)) throw new Error(`Duplicate playback reference #${id}.`);
    const image = id.startsWith('video') ? assets.get(asset.reference!) : asset;
    if (!image || image.thumbnail) throw new Error(`#${id}: reference image is missing or invalid.`);
    if ([asset, image].some(item => item.scene !== undefined && item.scene !== sceneNumber)) throw new Error(`Scene ${sceneNumber}: asset and reference image scene links disagree.`);
    if (asset.duration !== undefined && asset.duration !== end - start) throw new Error(`#${id}: usable duration differs from the manifest.`);
    const narrations = [...authored[3].matchAll(/^Text:[ \t]*([\s\S]*?)(?=^(?:Tone|Speed|Pause|On-Screen Text|Source|LINE\s+\d+):|^```|(?![\s\S]))/gim)];
    const narration = narrations.map(match => match[1].trim()).join('\n\n');
    if (!narration) throw new Error(`Scene ${sceneNumber}: missing Text narration.`);
    used.add(id); cursor = end;
    return { id: `scene_${String(sceneNumber).padStart(3, '0')}`, chapter: authored[2].trim(), role: 'story' as const, narration,
      imagePrompt: image.prompt, mediaType: id.startsWith('video') ? 'video' as const : 'image' as const, duration: end - start,
      ...(id.startsWith('video') ? { videoPrompt: asset.prompt } : {}) };
  });
  if (normalized(scenes.map(scene => scene.narration).join(' ')) !== normalized(voiceBlocks[0][1])) throw new Error('The complete voice script differs from the scene narration. Correct the words before extracting; formatting never rewrites narration.');
  const title = text.match(/^Title:[ \t]*([^\n]+)/im)?.[1].trim();
  if (!title) throw new Error('Include a Title field.');
  return { version: 1, title, thumbnailPrompt: thumbnails[0].prompt, scenes };
}
