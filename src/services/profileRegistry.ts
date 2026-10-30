/**
 * CHANNEL PROFILE REGISTRY — Single source of truth for channel profile identity,
 * theme tokens, UI metadata, fallback identities, and LoRA imaging configs.
 */

import {
  type ChannelProfileKey,
  type ChannelMotionPolicyKey,
  detectChannelProfileKey,
  detectChannelMotionKey,
  policyKeyToProfileKey,
  profileKeyToPolicyKey,
  CHANNEL_PROFILE_KEYS,
} from '@tubeflow/editing-contracts';

export type { ChannelProfileKey, ChannelMotionPolicyKey };
export { detectChannelProfileKey, detectChannelMotionKey, policyKeyToProfileKey, profileKeyToPolicyKey };

export const PROFILE_KEYS: ChannelProfileKey[] = CHANNEL_PROFILE_KEYS;

export interface ProfileTheme {
  primary: string;
  secondary: string;
  accent: string;
  glow: string;
  fontMono: string;
  fontDisplay: string;
  labelPrefix: string;
}

/** Color/typography theming per channel profile. */
export const PROFILE_THEMES: Record<ChannelProfileKey, ProfileTheme> = {
  ancient_dharma: {
    primary: '#FDE047',
    secondary: '#D97706',
    accent: '#F59E0B',
    glow: 'rgba(253, 224, 71, 0.45)',
    fontMono: "'JetBrains Mono', monospace",
    fontDisplay: "'Cinzel', serif",
    labelPrefix: 'VEDIC // ',
  },
  rule_zero: {
    primary: '#00F0FF',
    secondary: '#3B82F6',
    accent: '#10B981',
    glow: 'rgba(0, 240, 255, 0.4)',
    fontMono: "'JetBrains Mono', monospace",
    fontDisplay: "'Chakra Petch', sans-serif",
    labelPrefix: 'RULE ZERO // ',
  },
  against_the_odds: {
    primary: '#FACC15',
    secondary: '#F97316',
    accent: '#EF4444',
    glow: 'rgba(250, 204, 21, 0.4)',
    fontMono: "'JetBrains Mono', monospace",
    fontDisplay: "'Montserrat', sans-serif",
    labelPrefix: 'SURVIVAL // ',
  },
};

/** Library UI presentation metadata per channel (labels, badges, theme classes). */
export interface ChannelUiMeta {
  key: ChannelProfileKey;
  name: string;
  subname: string;
  badge: string;
  tag: string;
  themeColor: string;
  accentBorder: string;
  badgeBg: string;
  activeBg: string;
  dotColor: string;
  desc: string;
}

const CHANNEL_UI_DATA: Record<ChannelProfileKey, Omit<ChannelUiMeta, 'key'>> = {
  ancient_dharma: {
    name: 'Ancient Dharma',
    subname: 'Vedic Epics & Ramayana',
    badge: 'DHARMA',
    tag: 'Hindi Dedicated',
    themeColor: 'text-amber-400',
    accentBorder: 'border-amber-400/60 ring-amber-400/30',
    badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    activeBg: 'from-amber-950/40 via-surface to-surface',
    dotColor: 'bg-amber-400',
    desc: 'Ancient India, sacred Vedic history, Ramayana and Mahabharata epics.',
  },
  rule_zero: {
    name: 'Rule Zero',
    subname: 'Cyberpunk Noir & Speculative Sci-Fi',
    badge: 'NOIR',
    tag: 'Speculative Sci-Fi',
    themeColor: 'text-cyan-400',
    accentBorder: 'border-cyan-400/60 ring-cyan-400/30',
    badgeBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    activeBg: 'from-cyan-950/40 via-surface to-surface',
    dotColor: 'bg-cyan-400',
    desc: 'Graphic novel noir, immutable speculative world rules, cybernetic mysteries.',
  },
  against_the_odds: {
    name: 'Against the Odds',
    subname: 'Documentary Survival & Extreme Expeditions',
    badge: 'SURVIVAL',
    tag: 'Historical Documentaries',
    themeColor: 'text-orange-400',
    accentBorder: 'border-orange-400/60 ring-orange-400/30',
    badgeBg: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    activeBg: 'from-orange-950/40 via-surface to-surface',
    dotColor: 'bg-orange-400',
    desc: 'Real historical survival crises, documented emergency rescues, extreme expeditions.',
  },
};

export const CHANNEL_UI_META: Record<ChannelProfileKey, ChannelUiMeta> = Object.fromEntries(
  PROFILE_KEYS.map(key => [key, { key, ...CHANNEL_UI_DATA[key] }]),
) as Record<ChannelProfileKey, ChannelUiMeta>;

export const CHANNEL_UI_ENTRIES: ChannelUiMeta[] = PROFILE_KEYS.map(key => CHANNEL_UI_META[key]);

/** Fallback account identities when no registered account matches a channel key. */
export interface ProfileIdentityFallback {
  id: string;
  name: string;
  color: string;
  avatar: string;
  youtubeChannelTitle: string;
}

export const PROFILE_IDENTITY_FALLBACKS: Record<ChannelProfileKey, ProfileIdentityFallback> = {
  ancient_dharma: {
    id: 'default',
    name: 'Ancient Dharma',
    color: '#FDE047',
    avatar: 'AD',
    youtubeChannelTitle: 'Ancient Dharma',
  },
  rule_zero: {
    id: 'acct_3ea89878-0f41-4dc9-86e5-3f55cda46ef7',
    name: 'Rule Zero',
    color: '#00F0FF',
    avatar: 'RZ',
    youtubeChannelTitle: 'Rule Zero',
  },
  against_the_odds: {
    id: 'acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab',
    name: 'Against the Odds',
    color: '#FACC15',
    avatar: 'AO',
    youtubeChannelTitle: 'Against the Odds',
  },
};

export interface ChannelLoraConfig {
  channelKey: ChannelProfileKey;
  channelLabel: string;
  loraTitle: string;
  loraFileName: string;
  fallbackLoraFileName: string;
  strengthModel: number;
  strengthClip: number;
  triggerToken: string;
  styleDna: string;
}

/** Single source of truth for per-profile LoRA image generation models and prompts. */
export const CHANNEL_LORA_CONFIG: Record<ChannelProfileKey, ChannelLoraConfig> = {
  ancient_dharma: {
    channelKey: 'ancient_dharma',
    channelLabel: 'Ancient Dharma',
    loraTitle: 'Chiaroscuro Fantasy XL (Sacred Temple & Mythic Glow)',
    loraFileName: 'ancient_dharma_custom_xl.safetensors',
    fallbackLoraFileName: 'ancient_dharma_chiaroscuro_xl.safetensors',
    strengthModel: 0.70,
    strengthClip: 0.70,
    triggerToken: 'dharma_sacred_chiaroscuro',
    styleDna:
      'Sacred chiaroscuro lighting, warm golden oil-lamp glow, deep carved-stone temple shadows, volumetric incense haze, burnished gold and saffron color palette, painterly mythological photorealism.',
  },
  rule_zero: {
    channelKey: 'rule_zero',
    channelLabel: 'Rule Zero',
    loraTitle: "Zavy's Dark Atmospheric Contrast XL (Neo-Noir Thriller)",
    loraFileName: 'rule_zero_custom_xl.safetensors',
    fallbackLoraFileName: 'rule_zero_dark_contrast_xl.safetensors',
    strengthModel: 0.75,
    strengthClip: 0.75,
    triggerToken: 'rulezero_noir_contrast',
    styleDna:
      'Stylized painterly graphic novel comic art, Alberto Mielgo and Spider-Verse noir aesthetic, bold charcoal ink outlines, expressive textured brushstrokes, dynamic two-step cel shading, high-contrast chiaroscuro shadows, wet pavement reflections, cold cyan and teal ambient shadows sliced by vibrant warm amber and neon rim lighting, cinematic atmospheric mystery, no 3D, no photorealism, no CGI gloss.',
  },
  against_the_odds: {
    channelKey: 'against_the_odds',
    channelLabel: 'Against the Odds',
    loraTitle: 'Analog Film XL v1 (Raw 35mm Documentary Photojournalism)',
    loraFileName: 'against_the_odds_custom_xl.safetensors',
    fallbackLoraFileName: 'against_the_odds_analog_film_xl.safetensors',
    strengthModel: 0.80,
    strengthClip: 0.80,
    triggerToken: 'odds_docu35mm_film',
    styleDna:
      'Analog Film Style, raw 1970s 35mm Kodak documentary photojournalism, gritty analog film grain, subtle halation, weathered skin pores and frost/mud micro-textures, desaturated natural storm palette.',
  },
};
