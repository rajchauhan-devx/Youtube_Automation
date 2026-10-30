/**
 * MOTION EDITORIAL POLICY & CHANNEL PROFILE REGISTRY (Shared Contracts)
 *
 * Single source of truth for channel profile identity detection, editorial policy
 * flags, and cross-tier mapping between client ChannelProfileKey and server
 * ChannelMotionPolicyKey.
 */

export type ChannelProfileKey = 'ancient_dharma' | 'rule_zero' | 'against_the_odds';
export type ChannelMotionPolicyKey = ChannelProfileKey | 'documentary_standard';

export const CHANNEL_PROFILE_KEYS: ChannelProfileKey[] = [
  'ancient_dharma',
  'rule_zero',
  'against_the_odds',
];

export const MOTION_POLICY_KEYS: ChannelMotionPolicyKey[] = [
  'ancient_dharma',
  'rule_zero',
  'against_the_odds',
  'documentary_standard',
];

export interface ChannelIdentityQuery {
  id?: string;
  name?: string;
  youtubeChannelTitle?: string;
  sourceContext?: string;
}

export const SELECTIVE_MOTION_DIRECTION =
  'Let AI choose only moments where a graphic materially explains the narration. Metadata is a suggestion, never a command to decorate every scene. Leave ordinary footage clean, keep breathing room between beats, and allow zero graphics. Use purposeful typography, fine lines and explanatory diagrams in open space around subjects. Never invent facts, coordinates, source labels or telemetry. Preview the actual result before export.';

const RULE_ZERO_HINTS = ['3ea89878', 'rule_zero', 'rule zero', 'zero rule'];
const AGAINST_THE_ODDS_HINTS = ['620a1d5e', 'against_the_odds', 'against the odds'];
const ANCIENT_DHARMA_HINTS = ['ancient_dharma', 'ancient dharma', 'dharma', 'vedic', 'प्राचीन', 'धर्म'];

const RULE_ZERO_REGEX = /rule.?zero|zero.?rule|3ea89878/i;
const AGAINST_THE_ODDS_REGEX = /against.?the.?odds|620a1d5e/i;
const ANCIENT_DHARMA_REGEX = /ancient.?dharma|vedic|dharma|प्राचीन|धर्म/i;
const ANCIENT_SOURCE_CONTEXT_REGEX = /ancient india|vedic|ramayana|mahabharata|प्राचीन भारत|रामायण|महाभारत/i;

/** Resolves channel identity (account id, name, channel title, or text) to a server policy key. */
export function detectChannelMotionKey(
  input: string | ChannelIdentityQuery | null | undefined,
  fallback: ChannelMotionPolicyKey = 'documentary_standard'
): ChannelMotionPolicyKey {
  if (!input) return fallback;

  let identity = '';
  let sourceContext = '';

  if (typeof input === 'string') {
    identity = input.toLowerCase();
  } else {
    identity = `${input.id || ''} ${input.name || ''} ${input.youtubeChannelTitle || ''}`.toLowerCase();
    sourceContext = (input.sourceContext || '').toLowerCase();
  }

  // 1. Direct Ancient Dharma detection (identity or source context when not conflicting with other profiles)
  const isAncient = ANCIENT_DHARMA_REGEX.test(identity) ||
    ANCIENT_DHARMA_HINTS.some(h => identity.includes(h)) ||
    (!RULE_ZERO_REGEX.test(identity) && !AGAINST_THE_ODDS_REGEX.test(identity) && ANCIENT_SOURCE_CONTEXT_REGEX.test(sourceContext));

  if (isAncient) {
    return 'ancient_dharma';
  }

  // 2. Rule Zero
  if (RULE_ZERO_REGEX.test(identity) || RULE_ZERO_HINTS.some(h => identity.includes(h))) {
    return 'rule_zero';
  }

  // 3. Against The Odds
  if (AGAINST_THE_ODDS_REGEX.test(identity) || AGAINST_THE_ODDS_HINTS.some(h => identity.includes(h))) {
    return 'against_the_odds';
  }

  // 4. Loose token hints when input is a string (e.g. from UI profile picker)
  if (typeof input === 'string') {
    if (/\b(?:rule|zero)\b/.test(identity)) return 'rule_zero';
    if (/\b(?:odds|against)\b/.test(identity)) return 'against_the_odds';
  }

  return fallback;
}

/** Resolves channel identity to a client ChannelProfileKey (maps documentary_standard to fallback). */
export function detectChannelProfileKey(
  input: string | ChannelIdentityQuery | null | undefined,
  fallback: ChannelProfileKey = 'ancient_dharma'
): ChannelProfileKey {
  const key = detectChannelMotionKey(input, fallback);
  return key === 'documentary_standard' ? fallback : key;
}

/** Explicit mapping from server policy key to client ChannelProfileKey. */
export function policyKeyToProfileKey(
  key: ChannelMotionPolicyKey,
  fallback: ChannelProfileKey = 'ancient_dharma'
): ChannelProfileKey {
  return key === 'documentary_standard' ? fallback : key;
}

/** Explicit mapping from client ChannelProfileKey to server policy key. */
export function profileKeyToPolicyKey(key: ChannelProfileKey): ChannelMotionPolicyKey {
  return key;
}

export interface MotionEditorialPolicy {
  key: ChannelMotionPolicyKey;
  profileKey?: ChannelProfileKey;
  displayLanguage: 'en' | 'hi';
  visualDirection: string;
  languageDirection: string;
  cardDirection: string;
  allowTransparentCards: boolean;
  direction: string;
  soundNames: string[];
}

export function getChannelMotionPolicy(
  identityInput: string | ChannelIdentityQuery = {},
  narrationLanguage: 'en' | 'hi' = 'en',
  sourceContext = ''
): MotionEditorialPolicy {
  const query: ChannelIdentityQuery = typeof identityInput === 'string'
    ? { id: identityInput, sourceContext }
    : { ...identityInput, sourceContext: sourceContext || identityInput.sourceContext };

  const key = detectChannelMotionKey(query, 'documentary_standard');
  const profileKey = key === 'documentary_standard' ? undefined : key;
  const isAncient = key === 'ancient_dharma';
  const displayLanguage: 'en' | 'hi' = isAncient ? 'hi' : narrationLanguage;

  const cardDirection = isAncient
    ? 'Ancient Dharma may use the supplied transparent-card library for useful verse, person, place, question, comparison, journey, takeaway and closing beats. Cards have gold outlines and fully transparent interiors and canvas: no opaque or translucent fills, parchment panels, blur backings or photo badges. Keep subjects and captions visible. Use only exact supported Hindi labels, with a calm entrance and readable hold. Portrait is a native vertical layout, never a reduced landscape canvas: stack comparisons and sequences, use large ivory headings and bright supporting text, with at least 54px type at 1080px width. Shorten labels or omit an overcrowded graphic instead of shrinking its text. Closing overlays must use the actual spoken Hindi invitation, not generic English slogans or three-word filler.'
    : 'No cards, panels, boxed labels, enclosing frames, blur backings or photo badges. Use free-floating type and explanatory diagrams.';

  const visualDirection = isAncient
    ? 'Ancient India: restrained historical and devotional visual language, warm stone, muted saffron, burnished gold and ivory. Legible Devanagari typography, gentle ink-line or carved-line reveals and calm holds. No modern HUDs, radar, neon, dashboards, digital counters, scanning grids, glitch effects, typewriter terminals or fake ancient inscriptions. Do not add religious motifs unsupported by the scene. Prefer a soft brush-like reveal or silence; no electronic pings, alarms or mechanical ratchets.'
    : key === 'rule_zero'
    ? 'Rule Zero: restrained graphic-novel noir, charcoal linework and limited cyan/amber accents. Match the actual story and source art; do not automatically add a HUD or technological effects to every scene.'
    : key === 'against_the_odds'
    ? 'Against the Odds: restrained documentary annotation. Technical diagrams and mechanical accents only when the narrated survival mechanism warrants them; keep the human subject and real image dominant.'
    : 'Follow the source imagery, historical period and channel metadata. Use restrained editorial graphics; do not impose a modern instrument style on unrelated stories.';

  const languageDirection = displayLanguage === 'hi'
    ? 'All visible words must be Hindi in Devanagari, with no English labels, Latin abbreviations or English units. Use exact supported Hindi narration phrases. If the selected narration supplies no matching Hindi words, use a wordless diagram or omit the graphic; do not invent or silently translate factual labels.'
    : 'Use the selected narration language for all visible words, units and disclosures; no decorative English UI labels unrelated to the narration.';

  const allowTransparentCards = isAncient;
  const direction = `${SELECTIVE_MOTION_DIRECTION} ${cardDirection} ${visualDirection} ${languageDirection}`;
  const soundNames = isAncient
    ? ['paper_slide']
    : ['paper_slide', 'hud_ping', 'shutter_click', 'sub_impact'];

  return {
    key,
    profileKey,
    displayLanguage,
    visualDirection,
    languageDirection,
    cardDirection,
    allowTransparentCards,
    direction,
    soundNames,
  };
}

export interface ScriptLikeMediaSettings {
  name?: string;
  prompts?: { content?: string }[];
  videoImportsEnabled?: boolean;
  autoPilotSettings?: { media?: { flowEnabled?: boolean } };
}

export function isImageOnlyShorts(script: ScriptLikeMediaSettings, profile: string): boolean {
  if (profile !== 'shorts' || script.videoImportsEnabled === true) return false;
  if (script.autoPilotSettings?.media?.flowEnabled === false) return true;
  if (script.autoPilotSettings?.media?.flowEnabled === true) return false;
  const description = `${script.name || ''} ${(script.prompts || []).map(p => p.content || '').join(' ')}`;
  return /image[- ]only|short\s*[-–]\s*image\b|all still[- ]image|zero video generation|no video(?:[,\s]+motion)?\s+prompts?/i.test(description);
}
