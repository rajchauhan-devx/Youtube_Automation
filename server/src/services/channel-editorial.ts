import { extractAncientDharmaEditorial } from './ancient-dharma-editorial.js';
import { extractRuleZeroEditorial } from './rule-zero-editorial.js';
import { extractAgainstTheOddsEditorial } from './against-the-odds-editorial.js';

export function extractChannelEditorial(template: string): string {
  return extractAgainstTheOddsEditorial(template) || extractRuleZeroEditorial(template) || extractAncientDharmaEditorial(template);
}

/** Keep channel story/closing rules intact even after a long visual bible. */
export function channelEditorialContext(template: string, limit: number): string {
  const editorial = extractChannelEditorial(template);
  if (!editorial) return template.slice(0, limit);
  const context = template.replace(editorial, '').trim();
  return `${editorial}\n\n${context.slice(0, Math.max(0, limit - editorial.length - 2))}`;
}
