import { extractAncientDharmaEditorial } from './ancient-dharma-editorial.js';
import { extractAgainstTheOddsEditorial } from './against-the-odds-editorial.js';

export function extractChannelEditorial(template: string): string {
  return extractAgainstTheOddsEditorial(template) || extractAncientDharmaEditorial(template);
}

/** Remove shared channel editorial blocks so their advisory notes do not trigger conversational full-video overrides. */
export function stripChannelEditorial(text: string): string {
  if (!text) return '';
  let stripped = text;
  let match: string;
  while ((match = extractAgainstTheOddsEditorial(stripped) || extractAncientDharmaEditorial(stripped))) {
    stripped = stripped.replace(match, '');
  }
  return stripped;
}

const EXPLICIT_CONVERSATIONAL_MANDATE_RE =
  /\b(?:100%\s*full\s*video\s*only|zero\s*narrator\s*mandate|mandatory\s+multi-character|force\s+(?:full\s+)?(?:multi-character|conversational)|conversational\s+dialogue\s+only|multi-character\s+dialogue\s+only)\b/i;

const TEMPLATE_CONVERSATIONAL_TITLE_RE =
  /(?:^|\n)#+\s*.*(?:conversational\s+dialogue|multi-character\s+conversational|multi-character\s+drama)\b/i;

/**
 * True ONLY when a template or instruction explicitly mandates a multi-character
 * conversational full-video format (ignores shared editorial blocks, advisory notes,
 * and phrases like "For conversational multi-character episodes: ...").
 */
export function hasExplicitConversationalDirective(template?: string, instructions?: string): boolean {
  if (instructions && EXPLICIT_CONVERSATIONAL_MANDATE_RE.test(instructions)) return true;
  if (!template) return false;
  const stripped = stripChannelEditorial(template);
  return TEMPLATE_CONVERSATIONAL_TITLE_RE.test(stripped) || EXPLICIT_CONVERSATIONAL_MANDATE_RE.test(stripped);
}

export interface ConversationalScriptInput {
  conversational?: boolean;
  isConversational?: boolean;
  name?: string;
  prompts?: Array<{ content?: string }>;
  autoPilotSettings?: { voice?: { provider?: string } };
}

/**
 * Pipeline-level check for FULL-VIDEO multi-character conversational mode (Stage 0/1/2,
 * forcing all scenes to video, and Google Flow lip-sync prompt injection).
 * Never inferred from incidental dialogue tags or stale narration on standard/mixed scripts.
 */
export function isConversationalVideoMode(options: {
  script?: ConversationalScriptInput;
  template?: string;
  instructions?: string;
}): boolean {
  const { script, template, instructions } = options;
  if (script?.conversational === true || script?.isConversational === true) return true;
  if (script?.autoPilotSettings?.voice?.provider === 'flow') return true;
  if (script?.name && /\b(?:conversational|multi-?character|multi-?voice)\b/i.test(script.name)) return true;
  const tpl = template
    ?? (Array.isArray(script?.prompts) ? script.prompts.map((p) => p?.content || '').join('\n') : '');
  return hasExplicitConversationalDirective(tpl, instructions);
}

/** Keep channel story/closing rules intact even after a long visual bible. */
export function channelEditorialContext(template: string, limit: number): string {
  const editorial = extractChannelEditorial(template);
  if (!editorial) return template.slice(0, limit);
  const context = template.replace(editorial, '').trim();
  return `${editorial}\n\n${context.slice(0, Math.max(0, limit - editorial.length - 2))}`;
}
