import { MotionScriptHint, type MotionScriptHintData } from '@tubeflow/editing-contracts';
import { MOTION_LIBRARY, canonicalMotionTemplateId, motionLibraryTemplate, validateMotionTemplateContent } from '@tubeflow/video-composition';

export const MOTION_SCRIPT_PLAN_MARKER = '## Scene motion plan V1';
export const MOTION_SCRIPT_INSTRUCTIONS = `${MOTION_SCRIPT_PLAN_MARKER}
Plan motion graphics while writing the story. You have access to the following production templates, including all 30 motions in the gallery. Select only helpful moments; omit metadata on ordinary scenes. Never decorate every scene or fill a quota.
For each selected scene N, output one separate <motion_graphicN> tag AFTER its image/video prompt, containing a JSON object with:
{"version":1,"templateId":"catalog ID","intent":"why this helps the story","quote":"exact contiguous phrase from scene N narration","position":"auto","durationSec":4,"layout":"auto","content":{"items":[{"text":"exact short narration phrase","detail":"optional exact narration phrase"}],"links":[]}}
position is auto, top, bottom, left, right or center. Suggest open space based on the source prompt; actual footage and caption protection take precedence in Artifacts. durationSec is 1.5–15 seconds, no longer than the scene. quote anchors the entrance to the spoken words; do not invent absolute timestamps before audio exists. layout is auto, horizontal or vertical. Use canonical ad_ IDs for every channel; the production renderer applies the channel style. Use custom only when no catalog template can explain the scene; omit content for custom.
Every displayed text/detail must be an EXACT phrase in that scene's narration. Never add labels, dates, source credits, translations or statistics absent from the narration. Keep metadata outside <script>, image prompts and video prompts. For structured JSON output use the same object in that scene's motionGraphics array (at most one), without XML wrappers. Do not include demo text or defaults. For tags encode literal < and > inside JSON strings as Unicode escapes.
Numeric progress/donut/bars/trend templates need item.value matching a number in item.text. Percentages must be explicit and between 0 and 100; comparison/trend values must share units. No inferred conversions. For tree recipes, items list parents before children and links contains exactly one {from,to} link per child, using zero-based item indexes. Other recipes use links:[].
Ancient Dharma uses supported Hindi wording and restrained gold/ivory linework. Production adapts gallery effects to the channel: no false tracking/magnification, modern HUDs, electronic counters or terminal effects. Do not choose a template if its facts or relationships are unsupported. Artifacts validates this plan against the finished narration and media and can reposition, simplify or skip it.
Available templates (ID | name | item count | use | avoid):
${MOTION_LIBRARY.map(t => `${t.id} | ${t.name} | ${t.minItems}–${t.maxItems} | ${t.useWhen} | ${t.avoidWhen}`).join('\n')}`;

export const motionHintProviderSchema = {
  type: 'object', required: ['version', 'intent', 'templateId', 'quote', 'position', 'durationSec'], properties: {
    version: { type: 'integer', enum: [1] },
    intent: { type: 'string', maxLength: 300 },
    templateId: { type: 'string', enum: [...MOTION_LIBRARY.map(t => t.id), 'custom'] },
    quote: { type: 'string', maxLength: 1500, description: 'Exact contiguous phrase from this scene narration; anchors timing.' },
    position: { type: 'string', enum: ['auto', 'top', 'bottom', 'left', 'right', 'center'] },
    durationSec: { type: 'number', minimum: 1.5, maximum: 15 },
    layout: { type: 'string', enum: ['auto', 'horizontal', 'vertical'] },
    content: { type: 'object', required: ['items'], properties: {
      items: { type: 'array', minItems: 1, maxItems: 7, items: { type: 'object', required: ['text'], properties: {
        text: { type: 'string', maxLength: 160 }, detail: { type: 'string', maxLength: 160 }, value: { type: 'number', minimum: 0, maximum: 1e9 },
      } } },
      links: { type: 'array', maxItems: 6, items: { type: 'object', required: ['from', 'to'], properties: { from: { type: 'integer', minimum: 0, maximum: 6 }, to: { type: 'integer', minimum: 0, maximum: 6 } } } },
    } },
  },
};

const normalized = (s: string) => s.normalize('NFC').toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}%]+/gu, ' ').trim();
export const motionPhraseSupported = (text: string, narration: string) => !!normalized(text) && (` ${normalized(narration)} `).includes(` ${normalized(text)} `);

export function parseMotionScriptHint(input: unknown, narration?: string): MotionScriptHintData {
  const hint = MotionScriptHint.parse(input);
  if (hint.templateId) hint.templateId = canonicalMotionTemplateId(hint.templateId);
  if (hint.templateId && hint.templateId !== 'custom' && !motionLibraryTemplate(hint.templateId)) throw new Error(`Unknown motion template: ${hint.templateId}`);
  if (hint.content) {
    if (!hint.templateId || hint.templateId === 'custom') throw new Error('Motion content requires a library template ID');
    hint.content = validateMotionTemplateContent(hint.templateId, hint.content);
    const tree = motionLibraryTemplate(hint.templateId)!.recipe === 'tree', count = hint.content.items.length, links = hint.content.links;
    if (tree ? links.length !== count - 1 || links.some(l => l.from >= l.to || l.to >= count) || new Set(links.map(l => l.to)).size !== count - 1 : links.length > 0)
      throw new Error('Motion relationships require one earlier parent per child for trees, and no links for other templates');
  }
  if (narration !== undefined) {
    for (const phrase of [hint.quote, ...(hint.content?.items.flatMap(i => [i.text, i.detail]) || [])]) {
      if (phrase && !motionPhraseSupported(phrase, narration)) throw new Error('Motion labels and quote must match this scene narration exactly');
    }
  }
  return hint;
}

/** Narration editors retain the intent, but must not preserve now-stale text or timing cues. */
export function refreshMotionHints(hints: unknown[] | undefined, narration: string): unknown[] | undefined {
  return hints?.map(raw => {
    const parsed=MotionScriptHint.safeParse(raw);
    if(!parsed.success)return raw; // Preserve legacy metadata for the director to evaluate.
    const hint={...parsed.data};
    if(hint.quote&&!motionPhraseSupported(hint.quote,narration))delete hint.quote;
    if(hint.content?.items.some(item=>[item.text,item.detail].some(text=>text&&!motionPhraseSupported(text,narration))))delete hint.content;
    return hint;
  });
}
