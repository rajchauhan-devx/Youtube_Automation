import { MotionScriptHint, type MotionScriptHintData } from '@tubeflow/editing-contracts';
import { MOTION_LIBRARY, canonicalMotionTemplateId, motionLibraryTemplate, validateMotionTemplateContent } from '@tubeflow/video-composition';

export const MOTION_SCRIPT_PLAN_MARKER = '## Scene motion plan V1';
export const MOTION_SCRIPT_INSTRUCTIONS = '';

/** Motion graphics instructions disabled — clean footage only. */
export function motionInstructionsForTemplate(_template: string): string {
  return '';
}

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
  if (hint.templateId) {
    try {
      const canonical = canonicalMotionTemplateId(hint.templateId);
      if (canonical && motionLibraryTemplate(canonical)) {
        hint.templateId = canonical;
      }
    } catch {
      // Dynamic motion graphic type — keep as is
    }
  }
  if (hint.content && hint.templateId && motionLibraryTemplate(hint.templateId)) {
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
