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
  against_the_odds: {
    primary: '#FACC15',
    secondary: '#F97316',
    accent: '#EF4444',
    glow: 'rgba(250, 204, 21, 0.4)',
    fontMono: "'JetBrains Mono', monospace",
    fontDisplay: "'Montserrat', sans-serif",
    labelPrefix: 'SURVIVAL // ',
  },
  talvora: {
    primary: '#F43F5E',
    secondary: '#E11D48',
    accent: '#FB7185',
    glow: 'rgba(244, 63, 94, 0.45)',
    fontMono: "'JetBrains Mono', monospace",
    fontDisplay: "'Cinzel', serif",
    labelPrefix: 'DRAMA // ',
  },
  blender_3d: {
    primary: '#06B6D4',
    secondary: '#0891B2',
    accent: '#38BDF8',
    glow: 'rgba(6, 182, 212, 0.45)',
    fontMono: "'JetBrains Mono', monospace",
    fontDisplay: "'Montserrat', sans-serif",
    labelPrefix: '3D // ',
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
    subname: 'Epics, Mahabharata & Dharma',
    badge: 'DHARMA',
    tag: 'Hindi Dedicated',
    themeColor: 'text-amber-400',
    accentBorder: 'border-amber-400/60 ring-amber-400/30',
    badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    activeBg: 'from-amber-950/40 via-surface to-surface',
    dotColor: 'bg-amber-400',
    desc: 'Ancient India, sacred Vedic history, Ramayana and Mahabharata epics.',
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
  talvora: {
    name: 'Talvora',
    subname: 'Cinematic Suspense & Mystery Thriller',
    badge: 'THRILLER',
    tag: 'Suspense Drama',
    themeColor: 'text-amber-400',
    accentBorder: 'border-amber-400/60 ring-amber-400/30',
    badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    activeBg: 'from-amber-950/40 via-surface to-surface',
    dotColor: 'bg-amber-400',
    desc: 'High-stakes suspense and mystery micro-dramas: sharp adult heroines, high-tension conflict, strict character consistency and brisk natural dialogue.',
  },
  blender_3d: {
    name: 'Curious Cutaways',
    subname: '3D Mechanical & Cross-Section Explainer',
    badge: '3D BLENDER',
    tag: 'Automated 3D',
    themeColor: 'text-cyan-400',
    accentBorder: 'border-cyan-400/60 ring-cyan-400/30',
    badgeBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    activeBg: 'from-cyan-950/40 via-surface to-surface',
    dotColor: 'bg-cyan-400',
    desc: '3D animated mechanical, geological, and physical cutaways in the style of Zack D. Films, automated via headless Blender.',
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
  against_the_odds: {
    id: 'acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab',
    name: 'Against the Odds',
    color: '#FACC15',
    avatar: 'AO',
    youtubeChannelTitle: 'Against the Odds',
  },
  talvora: {
    id: 'acct_talvora',
    name: 'Talvora',
    color: '#E11D48',
    avatar: 'TL',
    youtubeChannelTitle: 'Talvora',
  },
  blender_3d: {
    id: 'acct_blender_3d',
    name: 'Curious Cutaways',
    color: '#06B6D4',
    avatar: '3D',
    youtubeChannelTitle: 'Curious Cutaways',
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
  narrativeDna?: string;
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
  talvora: {
    channelKey: 'talvora',
    channelLabel: 'Talvora',
    loraTitle: 'Cinematic Portrait & Mood Drama XL',
    loraFileName: 'talvora_custom_xl.safetensors',
    fallbackLoraFileName: 'talvora_portrait_mood_xl.safetensors',
    strengthModel: 0.75,
    strengthClip: 0.75,
    triggerToken: 'talvora_mood_drama',
    styleDna:
      'Cinematic night-portrait thriller cinematography with 35mm shallow depth of field, atmospheric nighttime noir lighting, sharp anamorphic lens bokeh, wet asphalt streetlight reflections and moody volumetric shadows, featuring a striking, sharp-featured adult heroine in her mid-20s (intense focused dark eyes, high cheekbones, sleek jet-black hair tied back, elegant tailored dark blazer or jacket over a minimalist top), locked facial consistency across all scenes, photorealistic, premium web-series production value.',
    narrativeDna:
      'High-stakes story-first suspense: every episode centers on a sharp, charismatic adult heroine in her mid-20s navigating dangerous secrets, conspiracies, undercover confrontations, and unexpected plot twists opposite intense counterparts. Strict character consistency across all scenes. Brisk, natural conversational pacing (1.04x speed) with punchy back-and-forth dialogue lines (under 15 words) and strict lip-sync coordination. Zero narrator voiceover — 100% pure character dialogue.',
  },
  blender_3d: {
    channelKey: 'blender_3d',
    channelLabel: 'Curious Cutaways',
    loraTitle: '3D Cross-Section Explainer (Isometric & Mechanical Cutaway)',
    loraFileName: 'blender_3d_cross_section_xl.safetensors',
    fallbackLoraFileName: 'blender_3d_cutaway_xl.safetensors',
    strengthModel: 0.80,
    strengthClip: 0.80,
    triggerToken: 'blender_3d_cross_section',
    styleDna:
      '3D procedural isometric cross-section explainer style, clean stylized mechanical and geological cutaway rendering, Zack D. Films aesthetic, vibrant translucent fluid materials, metallic steel machinery shaders, stratified earth cross-sections, studio studio lighting with soft ambient occlusion, crisp vertical 9:16 framing.',
    narrativeDna:
      'Fascinating, fast-paced mechanical and scientific breakdown: how everyday or extreme machinery works from the inside out. Clear narrative progression: The Core Problem -> Mechanical Kick/Failure -> The Engineering Solution -> Sustained Operation. Dynamic physics cues and concise, punchy voiceover.',
  },
};
