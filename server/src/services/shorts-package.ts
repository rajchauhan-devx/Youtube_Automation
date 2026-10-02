import type { ScenePlan } from './scene-plan.js';

export const isTaggedShortsResponse = (raw: string) => /<(?:shorts|scene)\b/i.test(raw);
type Block = { name: string; attributes: Record<string, string>; text: string };
const decode = (text: string) => text.replace(/&(lt|gt|amp|quot|apos);/g, (_, key: string) => ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[key]!));

// Deliberately constrained tag grammar: no guessing which prompt belongs to a scene.
function blocks(raw: string, allowed: string[]): Block[] {
  const source = raw.trim();
  const result: Block[] = [];
  const pattern = /<([a-z_]+)\b([^>]*)>([\s\S]*?)<\/\1\s*>\s*/giy;
  let cursor = 0;
  while (cursor < source.length) {
    pattern.lastIndex = cursor;
    const match = pattern.exec(source);
    if (!match || !allowed.includes(match[1].toLowerCase())) throw new Error('Incomplete or unexpected Shorts tags. Correct the legacy tags or use the shared <long_video> JSON scene plan.');
    const attributes: Record<string, string> = {};
    let remaining = match[2].trim();
    while (remaining) {
      const attribute = remaining.match(/^([a-z_]+)\s*=\s*(["'])(.*?)\2(?:\s+|$)/i);
      if (!attribute || attribute[1] in attributes) throw new Error('Invalid or repeated scene attributes. Use quoted id, media_type, duration, chapter and role values.');
      attributes[attribute[1]] = decode(attribute[3]);
      remaining = remaining.slice(attribute[0].length);
    }
    result.push({ name: match[1].toLowerCase(), attributes, text: match[3].trim() });
    cursor = pattern.lastIndex;
  }
  return result;
}
function one(items: Block[], name: string): Block {
  const matches = items.filter(item => item.name === name);
  if (matches.length !== 1 || !matches[0].text) throw new Error(`Shorts requires exactly one nonempty <${name}> block here.`);
  return matches[0];
}
function plain(block: Block): string {
  if (Object.keys(block.attributes).length || /[<>]/.test(block.text)) throw new Error(`<${block.name}> must contain plain text without attributes or nested tags.`);
  return decode(block.text);
}

export function parseShortsPackage(raw: string): ScenePlan {
  const roots = blocks(raw, ['shorts']);
  const root = one(roots, 'shorts');
  if (Object.keys(root.attributes).length) throw new Error('Use <shorts> without attributes.');
  const children = blocks(root.text, ['title', 'audio_prompt', 'thumbnail_prompt', 'scene']);
  const audio = one(children, 'audio_prompt');
  if (Object.keys(audio.attributes).length) throw new Error('Use <audio_prompt> without attributes.');
  const narration = plain(one(blocks(audio.text, ['script']), 'script'));
  const scenes = children.filter(item => item.name === 'scene').map((block, index) => {
    const attrs = block.attributes;
    if (Object.keys(attrs).some(key => !['id', 'media_type', 'duration', 'chapter', 'role'].includes(key)) ||
        attrs.id !== `scene_${String(index + 1).padStart(3, '0')}` || !['image', 'video'].includes(attrs.media_type) ||
        !attrs.chapter || !['story', 'cta'].includes(attrs.role) || !/^\d+(?:\.\d+)?$/.test(attrs.duration || '')) {
      throw new Error(`Scene ${index + 1}: use ordered scene_001 IDs and valid media_type, duration, chapter and role attributes.`);
    }
    const fields = blocks(block.text, ['narration', 'image_prompt', 'video_prompt']);
    const videos = fields.filter(field => field.name === 'video_prompt');
    if (attrs.media_type === 'image' && videos.length) throw new Error(`${attrs.id}: image scenes must not include a video prompt. Set media_type="video" to use footage.`);
    return {
      id: attrs.id, chapter: attrs.chapter, role: attrs.role as 'story' | 'cta', mediaType: attrs.media_type as 'image' | 'video', duration: Number(attrs.duration),
      narration: plain(one(fields, 'narration')), imagePrompt: plain(one(fields, 'image_prompt')),
      ...(attrs.media_type === 'video' ? { videoPrompt: plain(one(fields, 'video_prompt')) } : {}),
    };
  });
  const normalize = (text: string) => text.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (normalize(scenes.map(scene => scene.narration).join(' ')) !== normalize(narration)) throw new Error('The <script> audio text differs from the scene narration. Keep the same spoken words in the same order.');
  return { version: 1, title: plain(one(children, 'title')), thumbnailPrompt: plain(one(children, 'thumbnail_prompt')), scenes };
}

export function serializeShortsPackage(plan: ScenePlan): string {
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return ['<shorts>', `<title>${escape(plan.title)}</title>`, '<audio_prompt>',
    `<script>${escape(plan.scenes.map(scene => scene.narration).join('\n\n'))}</script>`, '</audio_prompt>',
    `<thumbnail_prompt>${escape(plan.thumbnailPrompt)}</thumbnail_prompt>`,
    ...plan.scenes.map(scene => [
      `<scene id="${escape(scene.id)}" media_type="${scene.mediaType || 'image'}" duration="${scene.duration || 5}" chapter="${escape(scene.chapter)}" role="${scene.role}">`,
      `<narration>${escape(scene.narration)}</narration>`, `<image_prompt>${escape(scene.imagePrompt)}</image_prompt>`,
      ...(scene.mediaType === 'video' ? [`<video_prompt>${escape(scene.videoPrompt || scene.imagePrompt)}</video_prompt>`] : []), '</scene>',
    ].join('\n')), '</shorts>'].join('\n');
}
