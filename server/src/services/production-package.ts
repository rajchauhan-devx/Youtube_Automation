import type { ScenePlan } from './scene-plan.js';

const clean = (text: string) => text.replace(/\r/g, '').replace(/^\s*```[^\n]*$/gm, '').replace(/\*\*/g, '').replace(/^\s*---+\s*$/gm, '').trim();
const normalized = (text: string) => text.normalize('NFC').replace(/\s+/g, ' ').trim();
const rangePattern = /(\d{1,2}:\d{2}(?::\d{2})?)\s*[–—-]\s*(\d{1,2}:\d{2}(?::\d{2})?)/;
const seconds = (time: string) => time.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
function range(text: string): [number, number] {
  const match = text.match(rangePattern);
  if (!match) throw new Error('Every timeline asset needs a start–end time.');
  return [seconds(match[1]), seconds(match[2])];
}
function section(text: string, name: RegExp): string {
  const headings = [...text.matchAll(/^#{1,6}\s+(.+)$/gm)];
  const index = headings.findIndex(match => name.test(match[1]));
  if (index < 0) throw new Error(`Missing production section: ${name.source}.`);
  const heading = headings[index];
  return clean(text.slice(heading.index! + heading[0].length, headings[index + 1]?.index ?? text.length));
}

/** Read the human-readable master-prompt output without asking an LLM to guess links. */
export function parseProductionPackage(raw: string, blocks: string[], useTimelineNarration = false): ScenePlan {
  const text = clean(raw);
  const voice = section(text, /FINAL CLEAN VOICE SCRIPT/i);
  // Models also render blocks as Markdown bullets with inline metadata.
  // Split only recognized fields so literal pipes in narration stay intact.
  const timeline = section(text, /(?:PRODUCTION TIMELINE|COMPLETE 10.SECOND)/i)
    .replace(/^\s*(?:[-*+]\s+|#{1,6}\s+)?(?=BLOCK\s+\d+|(?:Time|Type|Asset Type|Asset|Narration|Purpose|Chapter):|\d{1,2}:\d{2})/gim, '')
    .replace(/\s*\|\s*(?=(?:Time|Type|Asset Type|Asset|Narration|Purpose|Chapter):)/gi, '\n')
    .replace(new RegExp(`^(${rangePattern.source})[ \\t]+(?=Narration:)`, 'gim'), '$1\n');
  const assets = new Map<string, { prompt: string; type: 'image' | 'video'; times: [number, number] }>();
  let thumbnailPrompt = '';
  for (const source of blocks) {
    const block = clean(source);
    const label = block.match(/^ASSET:\s*(THUMBNAIL|(?:IMAGE|VIDEO)\s+\d+[A-Z]?)\s*$/im)?.[1].toUpperCase().replace(/\s+/g, ' ');
    if (!label) throw new Error('Each <long_video> block needs an ASSET: IMAGE, VIDEO or THUMBNAIL label.');
    // Preserve all character, location, negative, style and audio instructions together.
    const prompt = block.replace(/^(?:ASSET|TIMELINE|DURATION|PURPOSE):[^\n]*\n?/gim, '').trim();
    if (!prompt) throw new Error(`${label}: generation prompt is empty.`);
    if (label === 'THUMBNAIL') {
      if (thumbnailPrompt) throw new Error('Duplicate THUMBNAIL asset.');
      thumbnailPrompt = prompt;
      continue;
    }
    if (assets.has(label)) throw new Error(`Duplicate asset ${label}.`);
    const times = range(block.match(/^TIMELINE:([^\n]+)/im)?.[1] || '');
    const duration = Number(block.match(/^DURATION:\s*(\d+)\s*seconds?\s*$/im)?.[1]);
    if (duration !== times[1] - times[0]) throw new Error(`${label}: duration differs from its timeline.`);
    assets.set(label, { prompt, type: label.startsWith('VIDEO') ? 'video' : 'image', times });
  }
  const scenes: ScenePlan['scenes'] = [];
  const used = new Set<string>();
  let cursor = 0;
  const timelineBlocks = [...timeline.matchAll(/(?:^|\n)BLOCK\s+(\d+)\s*\n([\s\S]*?)(?=\nBLOCK\s+\d+\s*\n|$)/gi)];
  if (!timelineBlocks.length) throw new Error('Production timeline has no BLOCK entries.');
  for (const match of timelineBlocks) {
    let body = match[2];
    // Keep the explicit identifier, ignoring display annotations and repeated
    // copies of the same ID. Never guess between two different references.
    body = body.replace(/^Asset:[ \t]*([^\n]*)$/gim, (_, value: string) => {
      const labels = [...new Set([...value.matchAll(/\b(?:IMAGE|VIDEO)\s+\d+[A-Z]?\b/gi)]
        .map(label => label[0].toUpperCase().replace(/\s+/g, ' ')))];
      if (labels.length !== 1) throw new Error(`Scene ${match[1]}: ${labels.length ? 'multiple asset references' : 'no recognizable image or video reference'} in "${value.trim()}". Each scene needs one asset ID.`);
      return `Asset: ${labels[0]}`;
    });
    // A single asset on the block header applies to its following narration.
    // Multi-asset blocks retain their explicit per-segment links.
    const links = [...body.matchAll(/^Asset:\s*((?:IMAGE|VIDEO)\s+\d+[A-Z]?)\s*$/gim)];
    const narrations = [...body.matchAll(/^Narration:/gim)];
    if (links.length === 1 && narrations.length === 1 && links[0].index! < narrations[0].index!) {
      body = body.slice(0, links[0].index) + body.slice(links[0].index! + links[0][0].length);
      body = body.trimEnd() + '\nAsset: ' + links[0][1];
    }
    const entries = [...body.matchAll(/^Narration:\s*([\s\S]*?)^Asset:\s*((?:IMAGE|VIDEO)\s+\d+[A-Z]?)\s*$/gim)];
    if (!entries.length || entries.length !== narrations.length || entries.length !== links.length) {
      throw new Error(`Scene ${match[1]}: could not pair every narration segment with an image or video. Check the Narration and Asset fields in this scene.`);
    }
    let previousEnd = 0;
    for (const entry of entries) {
      const label = entry[2].toUpperCase().replace(/\s+/g, ' ');
      const asset = assets.get(label);
      if (!asset) throw new Error(`Missing generation prompt for ${label}.`);
      if (used.has(label)) throw new Error(`Duplicate timeline reference to ${label}.`);
      const prefix = body.slice(previousEnd, entry.index);
      const ranges = [...prefix.matchAll(new RegExp(rangePattern.source, 'g'))];
      const times = range(ranges[ranges.length - 1]?.[0] || '');
      if (times[0] !== cursor || times[1] <= cursor) throw new Error(`${label}: timeline has a gap, overlap or invalid duration.`);
      if (times.some((time, index) => time !== asset.times[index])) throw new Error(`${label}: prompt and production timeline disagree.`);
      const narration = entry[1].replace(/^(?:Purpose|Chapter):[^\n]*$/gim, '').trim();
      const chapter = body.match(/^(?:Chapter|Purpose):\s*(.+)$/im)?.[1].trim() || `Block ${match[1]}`;
      scenes.push({ id: label.replace(/ /g, '_'), chapter, role: /\bCTA\b/i.test(chapter) ? 'cta' : 'story', narration,
        imagePrompt: asset.prompt, mediaType: asset.type, duration: times[1] - times[0] });
      cursor = times[1];
      used.add(label);
      previousEnd = entry.index! + entry[0].length;
    }
  }
  if (used.size !== assets.size) throw new Error('Some generation assets are missing from the production timeline.');
  if (!useTimelineNarration && normalized(scenes.map(scene => scene.narration).join(' ')) !== normalized(voice)) throw new Error('The final clean voice script differs from the timeline narration. Use timeline narration to keep every scene linked, or correct the response before extracting.');
  const title = text.match(/^Title:\s*(.+)$/im)?.[1].trim() || text.match(/^#{1,6}\s+([^\n]+)/)?.[1].trim() || 'Long video';
  return { version: 1, title, thumbnailPrompt, scenes };
}
