import type { Account } from './accounts.js';

export const SELECTIVE_MOTION_DIRECTION = 'Let AI choose only moments where a graphic materially explains the narration. Metadata is a suggestion, never a command to decorate every scene. Leave ordinary footage clean, keep breathing room between beats, and allow zero graphics. No cards, panels, boxed labels, enclosing frames, blur backings or photo badges. Use free-floating type, fine lines and purposeful diagrams in open space around subjects. Never invent facts, coordinates, source labels or telemetry. Preview the actual result before export.';

type ScriptLike = {name?:string;prompts?:{content?:string}[];videoImportsEnabled?:boolean;autoPilotSettings?:{media?:{flowEnabled?:boolean}}};
export function isImageOnlyShorts(script: ScriptLike, profile: string): boolean {
  if (profile !== 'shorts' || script.videoImportsEnabled === true) return false;
  if (script.autoPilotSettings?.media?.flowEnabled === false) return true;
  if (script.autoPilotSettings?.media?.flowEnabled === true) return false;
  const description = `${script.name || ''} ${(script.prompts || []).map(p=>p.content || '').join(' ')}`;
  return /image[- ]only|short\s*[-–]\s*image\b|all still[- ]image|zero video generation|no video(?:[,\s]+motion)?\s+prompts?/i.test(description);
}

export function channelMotionPolicy(account: Partial<Account> = {}, narrationLanguage: 'en'|'hi' = 'en', sourceContext = '') {
  const identity = `${account.id || ''} ${account.name || ''} ${account.youtubeChannelTitle || ''}`.toLowerCase();
  const ancient = /ancient.?dharma|vedic|dharma|प्राचीन|धर्म/.test(identity) ||
    (!/rule.?zero|zero.?rule|against.?the.?odds|3ea89878|620a1d5e/.test(identity) && /ancient india|vedic|ramayana|mahabharata|प्राचीन भारत|रामायण|महाभारत/.test(sourceContext.toLowerCase()));
  const key = ancient ? 'ancient_dharma' : /rule.?zero|zero.?rule|3ea89878/.test(identity) ? 'rule_zero' : /against.?the.?odds|620a1d5e/.test(identity) ? 'against_the_odds' : 'documentary_standard';
  const displayLanguage = ancient ? 'hi' : narrationLanguage;
  const visualDirection = ancient
    ? 'Ancient India: restrained historical and devotional visual language, warm stone, muted saffron, burnished gold and ivory. Legible Devanagari typography, gentle ink-line or carved-line reveals and calm holds. No modern HUDs, radar, neon, dashboards, digital counters, scanning grids, glitch effects, typewriter terminals or fake ancient inscriptions. Do not add religious motifs unsupported by the scene. Prefer a soft brush-like reveal or silence; no electronic pings, alarms or mechanical ratchets.'
    : key === 'rule_zero'
    ? 'Rule Zero: restrained graphic-novel noir, charcoal linework and limited cyan/amber accents. Match the actual story and source art; do not automatically add a HUD or technological effects to every scene.'
    : key === 'against_the_odds'
    ? 'Against the Odds: restrained documentary annotation. Technical diagrams and mechanical accents only when the narrated survival mechanism warrants them; keep the human subject and real image dominant.'
    : 'Follow the source imagery, historical period and channel metadata. Use restrained editorial graphics; do not impose a modern instrument style on unrelated stories.';
  const languageDirection = displayLanguage === 'hi'
    ? 'All visible words must be Hindi in Devanagari, with no English labels, Latin abbreviations or English units. Use exact supported Hindi narration phrases. If the selected narration supplies no matching Hindi words, use a wordless diagram or omit the graphic; do not invent or silently translate factual labels.'
    : 'Use the selected narration language for all visible words, units and disclosures; no decorative English UI labels unrelated to the narration.';
  return {key,displayLanguage,visualDirection,languageDirection,direction:`${SELECTIVE_MOTION_DIRECTION} ${visualDirection} ${languageDirection}`,
    soundNames:ancient ? ['paper_slide'] : ['paper_slide','hud_ping','shutter_click','sub_impact']};
}
